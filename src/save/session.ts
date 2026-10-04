// A live, saved run (docs/18 §5, 27 §4). Every action is validated by the reducer, then appended to the log in the
// same write as the record update, and only then becomes the visible state. Snapshots every 200 actions, at day
// boundaries and after a trip; load is the newest snapshot plus a replay of the tail. A run saved by an older version
// of the game, or one whose played crags' content has changed, is carried forward from its newest snapshot instead
// (adapt.ts): the adapted snapshot becomes the run's base, and the actions after it, part of a day at most, go.

import { createRun, reduce, replay } from '../sim/run';
import { REDUCER_VERSION, type RunState } from '../sim/state';
import type { Action, DataBundle, NewRunSpec } from '../sim/types';
import { adaptContent, adaptState, carryNeed, changedCrags, contentHashes, IncompatibleRun } from './adapt';
import type { MetaState, RunRecord, SaveBackend } from './backend';

export { IncompatibleRun } from './adapt';

export const CHUNK = 500;
export const SNAPSHOT_EVERY = 200;
export const SNAPSHOTS_KEPT = 2;

export interface ExportFile {
  format: 'cwt-run';
  /** 1: the log alone, replayed whole on import. 2 (P2 M1): with the newest snapshot, the import's base. */
  version: number;
  record: RunRecord;
  actions: Action[];
  base?: { index: number; state: RunState };
}

/**
 * The crags whose routes must be loaded before a saved run is: where the climber is, or for a run saved before records
 * said so, every crag it has played, or every crag.
 */
export function cragsToLoad(record: RunRecord, bundle: Pick<DataBundle, 'crags'>): string[] {
  const ids = record.crag ? [record.crag] : Object.keys(record.hashes ?? {});
  return (ids.length ? ids : [...bundle.crags.keys()]).filter((id) => bundle.crags.has(id));
}

/** Why a saved run cannot be continued in this build, or null; the run list shows it without loading the run. */
export function cannotContinue(record: RunRecord, bundle: Pick<DataBundle, 'version' | 'hashes'>): string | null {
  const need = carryNeed(record, bundle);
  return need === 'carry' ? null : need;
}

const runId = (seed: string, now: Date): string => `run_${now.getTime().toString(36)}_${seed.replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;

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
    const id = runId(seed, now);
    const record: RunRecord = {
      id, version: REDUCER_VERSION, run_seed: seed, data_version: bundle.version, hashes: contentHashes(state, bundle), crag: state.crag, created: now.toISOString(),
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
    const need = carryNeed(record, bundle);
    if (need === 'carry') return RunSession.carry(backend, bundle, record);
    if (need !== null) throw new IncompatibleRun(need);
    const snap = await backend.latestSnapshot(id);
    // A run carried forward cannot replay the actions before its base: they were played by an older version.
    if ((record.base ?? 0) > (snap?.index ?? 0)) throw new IncompatibleRun('Its saved state is missing.');
    const fromChunk = snap ? Math.floor(snap.index / CHUNK) : 0;
    const chunks = await backend.getChunks(id, fromChunk);
    const tail = chunks.flat();
    const start = fromChunk * CHUNK;
    // The tail starts at action `start`; the snapshot is the state after actions [0, snap.index).
    const state = snap ? replay(tail, bundle, { state: snap.state, index: snap.index - start }) : replay(tail, bundle);
    const lastChunk = chunks.length ? chunks[chunks.length - 1]! : [];
    const chunkIndex = fromChunk + Math.max(0, chunks.length - 1);
    return new RunSession(backend, bundle, record, state, [...lastChunk], chunkIndex, 0);
  }

  /**
   * Carry a run forward to this version (27 §4): its newest snapshot through the reducer's adapters, then the crags
   * whose content changed, becomes the run's base. The actions after the snapshot, played under the old version, are
   * dropped, and the log is cut there; the ones before stay for export.
   */
  private static async carry(backend: SaveBackend, bundle: DataBundle, record: RunRecord): Promise<RunSession> {
    const snap = await backend.latestSnapshot(record.id);
    if (!snap || snap.index < (record.base ?? 0)) throw new IncompatibleRun('There is no saved state to carry forward.');
    const state = adaptState(snap.state, record.version, bundle);
    if (!bundle.crags.has(state.crag)) throw new IncompatibleRun(`The climber is at ${state.crag}, which this version of the game does not have.`);
    adaptContent(state, changedCrags(record, state, bundle), bundle);
    if (record.action_count > snap.index) state.journal.push({ day: state.day, text: 'The game was updated, and today picks up from the last save.', tone: 'info' });
    const index = snap.index;
    const chunkIndex = Math.floor(index / CHUNK);
    const head = ((await backend.getChunks(record.id, chunkIndex))[0] ?? []).slice(0, index - chunkIndex * CHUNK);
    const next: RunRecord = {
      ...record, version: REDUCER_VERSION, data_version: bundle.version, hashes: contentHashes(state, bundle), crag: state.crag, base: index, action_count: index, day: state.day,
    };
    await backend.rebase(next, chunkIndex, head, state);
    return new RunSession(backend, bundle, next, state, head, chunkIndex, 0);
  }

  /** Apply an action: reduce (throws on an invalid action, nothing is written), persist, then expose. */
  async dispatch(a: Action, now = new Date()): Promise<RunState> {
    const next = reduce(this.state, a, this.bundle);
    await this.commit([a], next, now);
    return next;
  }

  /**
   * Play a stretch on a copy of the state (simulated days or a whole session, docs/24 §2): `play` applies its actions
   * to the draft through the reducer and returns them. They are written in one transaction, then the draft becomes the
   * state. If `play` throws, nothing is written.
   */
  async simulate(play: (draft: RunState) => Action[], now = new Date()): Promise<RunState> {
    const draft = structuredClone(this.state);
    const actions = play(draft);
    if (!actions.length) return this.state;
    await this.commit(actions, draft, now);
    return draft;
  }

  private async commit(actions: readonly Action[], next: RunState, now: Date): Promise<void> {
    let chunk = [...this.chunk];
    let chunkIndex = this.chunkIndex;
    const writes: [number, Action[]][] = [];
    for (const a of actions) {
      if (chunk.length >= CHUNK) { writes.push([chunkIndex, chunk]); chunkIndex++; chunk = []; }
      chunk.push(a);
    }
    writes.push([chunkIndex, chunk]);
    const record: RunRecord = {
      ...this.record, last_played: now.toISOString(), action_count: this.record.action_count + actions.length, day: next.day,
      hashes: contentHashes(next, this.bundle), crag: next.crag, ...(next.ended ? { summary: next.ended } : {}),
    };
    await this.backend.appendChunks(record, writes);
    this.chunk = chunk;
    this.chunkIndex = chunkIndex;
    this.record = record;
    this.state = next;
    this.sinceSnapshot += actions.length;
    if (this.sinceSnapshot >= SNAPSHOT_EVERY || actions.some((a) => a.t === 'end_day' || a.t === 'travel') || next.ended) {
      await this.backend.putSnapshot(this.id, record.action_count, next, SNAPSHOTS_KEPT);
      this.sinceSnapshot = 0;
    }
    if (next.ended && !this.state_was_ended) {
      this.state_was_ended = true;
      await recordRunEnd(this.backend, next);
    }
  }

  private state_was_ended = false;

  async exportFile(): Promise<ExportFile> {
    const chunks = await this.backend.getChunks(this.id, 0);
    const base = await this.backend.latestSnapshot(this.id);
    return { format: 'cwt-run', version: 2, record: this.record, actions: chunks.flat(), ...(base ? { base } : {}) };
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

/**
 * Import a run from an export file as a new run. A file with a snapshot is restored as saved and loaded, so a run from
 * an older version is carried forward like any other; a file without one (version 1) is replayed whole, which only a
 * run of this reducer and data allows.
 */
export async function importRun(backend: SaveBackend, bundle: DataBundle, file: ExportFile, now = new Date()): Promise<RunSession> {
  if (file.format !== 'cwt-run' || !Array.isArray(file.actions) || file.actions[0]?.t !== 'new_run') throw new Error('not a run export');
  const first = file.actions[0];
  if (file.base) {
    if (file.base.index > file.actions.length || file.base.index < (file.record.base ?? 0)) throw new Error('not a run export');
    const id = runId(first.seed, now);
    const record: RunRecord = { ...file.record, id, last_played: now.toISOString(), action_count: file.actions.length };
    const chunks = Array.from({ length: Math.ceil(file.actions.length / CHUNK) }, (_, i) => [i, file.actions.slice(i * CHUNK, (i + 1) * CHUNK)] as const);
    await backend.appendChunks(record, chunks);
    await backend.putSnapshot(id, file.base.index, file.base.state, SNAPSHOTS_KEPT);
    return RunSession.load(backend, bundle, id);
  }
  if (carryNeed(file.record, bundle) !== null) throw new IncompatibleRun('It was exported by an older version of the game without a saved state, so it cannot be carried forward.');
  const session = await RunSession.create(backend, bundle, first.seed, first.spec, now);
  for (const a of file.actions.slice(1)) await session.dispatch(a, now);
  return session;
}
