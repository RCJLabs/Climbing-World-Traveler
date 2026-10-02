// A live, saved run (docs/18 §5). Every action is validated by the reducer, then appended to the log in the
// same write as the record update, and only then becomes the visible state. Snapshots every 200 actions and
// at day boundaries; load is the newest snapshot plus a replay of the tail; a reducer-version bump discards
// snapshots and replays the whole log.

import { createRun, reduce, replay } from '../sim/run';
import { REDUCER_VERSION, type RunState } from '../sim/state';
import type { Action, DataBundle, NewRunSpec } from '../sim/types';
import type { MetaState, RunRecord, SaveBackend } from './backend';

export const CHUNK = 500;
export const SNAPSHOT_EVERY = 200;
export const SNAPSHOTS_KEPT = 2;

export interface ExportFile {
  format: 'cwt-run';
  version: number;
  record: RunRecord;
  actions: Action[];
}

/** A saved run whose problems came from a different content or generator version and so cannot be replayed. */
export class IncompatibleRun extends Error {}

export class RunSession {
  private constructor(
    private backend: SaveBackend,
    private bundle: DataBundle,
    public record: RunRecord,
    public state: RunState,
    private chunk: Action[],
    private chunkIndex: number,
    private sinceSnapshot: number,
  ) {}

  get id(): string { return this.record.id; }

  static async create(backend: SaveBackend, bundle: DataBundle, seed: string, spec: NewRunSpec, now = new Date()): Promise<RunSession> {
    const state = createRun(seed, spec, bundle);
    const first: Action = { t: 'new_run', seed, spec };
    const id = `run_${now.getTime().toString(36)}_${seed.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
    const record: RunRecord = {
      id, version: REDUCER_VERSION, run_seed: seed, data_version: bundle.version, created: now.toISOString(),
      title: spec.name, last_played: now.toISOString(), action_count: 1, day: 0,
    };
    const s = new RunSession(backend, bundle, record, state, [first], 0, 1);
    await backend.append(record, 0, s.chunk);
    await backend.putSnapshot(id, 1, state, SNAPSHOTS_KEPT);
    s.sinceSnapshot = 0;
    return s;
  }

  static async load(backend: SaveBackend, bundle: DataBundle, id: string): Promise<RunSession> {
    const record = await backend.getRun(id);
    if (!record) throw new Error(`no saved run ${id}`);
    // Procedural problems are rebuilt from their seeds, so a log from another content version would replay moves
    // onto different holds or under different reach rules. P1a keeps no old versions; such runs stay listed but
    // cannot continue.
    if (record.data_version !== bundle.version) {
      throw new IncompatibleRun(`made with game data ${record.data_version}; this version (${bundle.version}) builds or plays its problems differently`);
    }
    const stale = record.version !== REDUCER_VERSION;
    if (stale) await backend.deleteSnapshots(id);
    const snap = stale ? undefined : await backend.latestSnapshot(id);
    const fromChunk = snap ? Math.floor(snap.index / CHUNK) : 0;
    const chunks = await backend.getChunks(id, fromChunk);
    const tail = chunks.flat();
    const base = fromChunk * CHUNK;
    let state: RunState;
    if (snap) {
      // The tail starts at action `base`; the snapshot is the state after actions [0, snap.index).
      state = replay(tail, bundle, { state: snap.state, index: snap.index - base });
    } else {
      state = replay(tail, bundle);
    }
    const lastChunk = chunks.length ? chunks[chunks.length - 1]! : [];
    const chunkIndex = fromChunk + Math.max(0, chunks.length - 1);
    const s = new RunSession(backend, bundle, record, state, [...lastChunk], chunkIndex, 0);
    if (stale) {
      s.record = { ...record, version: REDUCER_VERSION };
      await backend.putSnapshot(id, record.action_count, state, SNAPSHOTS_KEPT);
    }
    return s;
  }

  /** Apply an action: reduce (throws on an invalid action, nothing is written), persist, then expose. */
  async dispatch(a: Action, now = new Date()): Promise<RunState> {
    const next = reduce(this.state, a, this.bundle);
    if (this.chunk.length >= CHUNK) { this.chunkIndex++; this.chunk = []; }
    this.chunk.push(a);
    const record: RunRecord = {
      ...this.record, last_played: now.toISOString(), action_count: this.record.action_count + 1, day: next.day,
      ...(next.ended ? { summary: next.ended } : {}),
    };
    try {
      await this.backend.append(record, this.chunkIndex, this.chunk);
    } catch (e) {
      this.chunk.pop();
      throw e;
    }
    this.record = record;
    this.state = next;
    this.sinceSnapshot++;
    if (this.sinceSnapshot >= SNAPSHOT_EVERY || a.t === 'end_day' || next.ended) {
      await this.backend.putSnapshot(this.id, record.action_count, next, SNAPSHOTS_KEPT);
      this.sinceSnapshot = 0;
    }
    if (next.ended && !this.state_was_ended) {
      this.state_was_ended = true;
      await recordRunEnd(this.backend, next);
    }
    return next;
  }

  private state_was_ended = false;

  async exportFile(): Promise<ExportFile> {
    const chunks = await this.backend.getChunks(this.id, 0);
    return { format: 'cwt-run', version: 1, record: this.record, actions: chunks.flat() };
  }
}

/** Fold a finished run into the account (16 §4, §6, §7). */
export async function recordRunEnd(backend: SaveBackend, run: RunState): Promise<MetaState> {
  const meta = await backend.getMeta();
  const s = run.ended;
  if (!s) return meta;
  for (const u of s.unlocks) if (!meta.unlocks.includes(u)) meta.unlocks.push(u);
  meta.hall_of_fame.push(s);
  meta.hall_of_fame.sort((a, b) => b.score - a.score);
  for (const [k, v] of Object.entries(s.pyramid)) meta.pyramid[k] = (meta.pyramid[k] ?? 0) + v;
  await backend.putMeta(meta);
  return meta;
}

/** Import a run from an export file: validate the shape, replay the whole log, write it as a new run. */
export async function importRun(backend: SaveBackend, bundle: DataBundle, file: ExportFile, now = new Date()): Promise<RunSession> {
  if (file.format !== 'cwt-run' || !Array.isArray(file.actions) || file.actions[0]?.t !== 'new_run') throw new Error('not a run export');
  const first = file.actions[0];
  const session = await RunSession.create(backend, bundle, first.seed, first.spec, now);
  for (const a of file.actions.slice(1)) await session.dispatch(a, now);
  return session;
}
