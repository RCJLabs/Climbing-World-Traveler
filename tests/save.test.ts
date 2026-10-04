// Event-sourced saves (docs/18 §5): write path, snapshot + tail load, export/import, meta; carrying a run forward
// across versions (27 §4): the reducer's adapters on an archived save, a played crag's changed content, the limits.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { replay } from '../src/sim/run';
import { REDUCER_VERSION, type RunState } from '../src/sim/state';
import { nextPlannedAction, simulateDays } from '../src/sim/tactics';
import type { Action, DataBundle } from '../src/sim/types';
import { adaptState, OLDEST_ADAPTABLE } from '../src/save/adapt';
import { CAPACITY } from '../src/sim/injury';
import { MemoryBackend, type RunRecord } from '../src/save/backend';
import { cannotContinue, CHUNK, importRun, IncompatibleRun, RunSession, SNAPSHOT_EVERY, SNAPSHOTS_KEPT } from '../src/save/session';

const bundle = loadBundle();
const spec = presetSpec('dirtbag', DEFAULT_OPTIONS);

/** A save as a backend holds it: written by the build at origin/main when the reducer was at 9 (data p2-0). */
interface Archive { record: RunRecord; chunks: Action[][]; snapshots: { index: number; state: RunState }[] }
const archive = JSON.parse(readFileSync('tests/fixtures/saves/v9-kalymnos.json', 'utf8')) as Archive;
/** The same, written at reducer 10 (P2 M1, data p2-0) by scripts/dev/archive-save.ts. */
const archive10 = JSON.parse(readFileSync('tests/fixtures/saves/v10-kalymnos.json', 'utf8')) as Archive;

async function restore(a: Archive): Promise<MemoryBackend> {
  const backend = new MemoryBackend();
  await backend.appendChunks(a.record, a.chunks.map((c, i) => [i, c] as const));
  for (const x of a.snapshots) await backend.putSnapshot(a.record.id, x.index, x.state, SNAPSHOTS_KEPT);
  return backend;
}

/** The bundle after an update that changed one crag's content (its hash). */
const changed = (id: string): DataBundle => ({ ...bundle, hashes: new Map([...bundle.hashes].map(([k, h]) => [k, k === id ? `${h}x` : h])) });

/** Days by the week plan, one action per write, as a player stepping through them would. */
async function playDays(s: RunSession, days: number): Promise<void> {
  for (let d = 0; d < days && !s.state.ended; d++) {
    for (let g = 0; g < 500; g++) {
      const a = nextPlannedAction(s.state, bundle);
      await s.dispatch(a);
      if (a.t === 'end_day') break;
    }
  }
}

describe('saves', () => {
  it('writes every action and reloads to the identical state from snapshot + tail', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-1', spec);
    await playDays(s, 25);
    expect(s.record.action_count).toBeGreaterThan(SNAPSHOT_EVERY);
    expect(backend.writes).toBe(s.record.action_count);
    const loaded = await RunSession.load(backend, bundle, s.id);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(s.state));
    // Keep playing on the loaded session; it must continue the same log.
    await playDays(loaded, 1);
    const again = await RunSession.load(backend, bundle, s.id);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(loaded.state));
  });

  it('an invalid action writes nothing and leaves the state alone', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-2', spec);
    const before = JSON.stringify(s.state);
    const writes = backend.writes;
    await expect(s.dispatch({ t: 'attempt', route_seed: 'x', mode: 'onsight' })).rejects.toThrow();
    expect(backend.writes).toBe(writes);
    expect(JSON.stringify(s.state)).toBe(before);
  });

  it('writes a simulated stretch in one transaction and reloads it to the same state', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-sim', spec);
    const writes = backend.writes;
    const state = await s.simulate((draft) => simulateDays(draft, bundle, 25));
    expect(backend.writes).toBe(writes + 1);
    expect(state.day).toBe(25);
    expect(s.record.action_count).toBeGreaterThan(100);
    const loaded = await RunSession.load(backend, bundle, s.id);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(s.state));
    // A failing stretch writes nothing.
    const before = JSON.stringify(s.state);
    await expect(s.simulate(() => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(JSON.stringify(s.state)).toBe(before);
    expect(backend.writes).toBe(writes + 1);
  });

  it('records the content hash of every crag the run has played', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-3', spec);
    expect(s.record.hashes).toEqual({ fontainebleau: bundle.hashes.get('fontainebleau') });
    await s.dispatch({ t: 'travel', to: 'kalymnos' });
    expect((await backend.getRun(s.id))!.hashes).toEqual({ fontainebleau: bundle.hashes.get('fontainebleau'), kalymnos: bundle.hashes.get('kalymnos') });
    // A trip ends on a snapshot: the days it took are not replayed on the next load.
    expect((await backend.latestSnapshot(s.id))!.index).toBe(s.record.action_count);
  });

  it('exports and imports a run, and records the unlock and Hall of Fame entry at run end', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-4', spec);
    await playDays(s, 3);
    await s.dispatch({ t: 'retire' });
    const meta = await backend.getMeta();
    expect(meta.unlocks).toContain('p1a:second_background');
    expect(meta.hall_of_fame).toHaveLength(1);
    const file = await s.exportFile();
    const other = new MemoryBackend();
    const imported = await importRun(other, bundle, JSON.parse(JSON.stringify(file)));
    expect(imported.state.ended).toEqual(s.state.ended);
  });

  it('refuses a run older than the first adapter, or saved by a newer version', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-5', spec);
    await playDays(s, 1);
    const rec = (await backend.getRun(s.id))!;
    const chunk = (await backend.getChunks(s.id, 0))[0]!;
    for (const version of [OLDEST_ADAPTABLE - 1, REDUCER_VERSION + 1]) {
      await backend.append({ ...rec, version }, 0, chunk);
      expect(cannotContinue({ ...rec, version }, bundle)).toMatch(/too old|newer/);
      await expect(RunSession.load(backend, bundle, s.id)).rejects.toBeInstanceOf(IncompatibleRun);
    }
    expect(cannotContinue(rec, bundle)).toBeNull();
    expect(cannotContinue({ ...rec, version: OLDEST_ADAPTABLE, data_version: 'p1a-0' }, bundle)).toBeNull();
  });
});

describe('carrying a run forward (27 §4)', () => {
  const index = archive.snapshots.at(-1)!.index;

  it('carries an archived run from reducer 9 through each adapter to this version', async () => {
    expect(archive.record).toMatchObject({ version: 9, data_version: 'p2-0' });
    const backend = await restore(archive);
    const s = await RunSession.load(backend, bundle, archive.record.id);
    expect(s.record).toMatchObject({ version: REDUCER_VERSION, base: index, action_count: index, day: s.state.day });
    expect(s.record.hashes).toEqual({ fontainebleau: bundle.hashes.get('fontainebleau'), kalymnos: bundle.hashes.get('kalymnos') });
    // Its newest snapshot through the adapters, and a line about the update. (Replaying its log under this version is
    // no check any more: M2's injuries play the same actions out otherwise, which is why a run is rebased, 27 §4.)
    expect({ ...s.state, journal: s.state.journal.slice(0, -1) }).toEqual(adaptState(archive.snapshots.at(-1)!.state, 9, bundle));
    expect(s.state.journal.at(-1)!.text).toMatch(/updated/);
    expect(s.state).toMatchObject({ injuries: [], ceiling_loss: {}, finger_today: 0 });
    expect(s.state.est).toEqual({ sport: archive.snapshots.at(-1)!.state.est });
    expect(s.state.history.map((p) => `${p.crag}:${Object.keys(p.est ?? {}).join()}`)).toEqual([
      ...Array(4).fill('fontainebleau:boulder'), ...Array(3).fill('kalymnos:sport'),
    ]);
    expect(s.state.ticks.every((t) => t.crag === (t.discipline ? 'kalymnos' : 'fontainebleau'))).toBe(true);
  }, 20_000);

  it('carries an archived run from reducer 10: the newest snapshot as it was, with M2\'s injuries and capacities added', async () => {
    expect(archive10.record).toMatchObject({ version: 10, data_version: 'p2-0' });
    const base = archive10.snapshots.at(-1)!;
    const backend = await restore(archive10);
    const s = await RunSession.load(backend, bundle, archive10.record.id);
    expect(s.record).toMatchObject({ version: REDUCER_VERSION, base: base.index, action_count: base.index });
    const old = base.state as RunState & Record<string, unknown>;
    const { injuries, ceiling_loss, capacity, finger_today, counters, journal, v, ...rest } = s.state;
    const { counters: oldCounters, journal: oldJournal, v: oldV, ...oldRest } = old;
    expect([oldV, v]).toEqual([10, REDUCER_VERSION]);
    expect(rest).toEqual(oldRest);
    expect({ injuries, ceiling_loss, finger_today }).toEqual({ injuries: [], ceiling_loss: {}, finger_today: 0 });
    // It arrived at Kalymnos when its weekly points changed crag; its capacities are its chronic load's (12 §2).
    const arrived = old.history.find((p) => p.crag === 'kalymnos')!.day;
    expect(counters).toEqual({ ...oldCounters, finger_loads: [], exposure: {}, exposure_total: 0, tired_week: false, antagonists_until: -1, arrived_day: arrived });
    const last = oldCounters.loads.slice(-28);
    const chronic = last.reduce((a, b) => a + b, 0) / last.length;
    expect(capacity.general).toBeCloseTo(Math.max(CAPACITY.general0, chronic), 9);
    expect(capacity.finger).toBeGreaterThanOrEqual(0.6 * chronic);
    expect(journal.slice(0, -1)).toEqual(oldJournal);
    expect(journal.at(-1)!.text).toMatch(/updated/);
    // It plays on from the base, and reloads to the same state.
    await s.simulate((d) => simulateDays(d, bundle, 10));
    expect((await RunSession.load(backend, bundle, s.id)).state).toEqual(s.state);
  }, 30_000);

  it('cuts the log at the base, drops the old tail, goes on, and reloads to the same state', async () => {
    const backend = await restore(archive);
    expect(archive.record.action_count).toBeGreaterThan(index);
    const s = await RunSession.load(backend, bundle, archive.record.id);
    expect((await backend.getChunks(s.id, 0)).flat()).toEqual(archive.chunks.flat().slice(0, index));
    await s.simulate((d) => simulateDays(d, bundle, 7));
    expect(s.record.action_count).toBeGreaterThan(index);
    const again = await RunSession.load(backend, bundle, s.id);
    expect(again.record.base).toBe(index);
    expect(again.state).toEqual(s.state);
  }, 20_000);

  it('exports a carried run with its base, and imports it to the same state', async () => {
    const s = await RunSession.load(await restore(archive), bundle, archive.record.id);
    await s.simulate((d) => simulateDays(d, bundle, 3));
    const file = JSON.parse(JSON.stringify(await s.exportFile()));
    expect(file.version).toBe(2);
    expect(file.actions).toHaveLength(s.record.action_count);
    const imported = await importRun(new MemoryBackend(), bundle, file);
    expect(imported.state).toEqual(s.state);
    // A file without a snapshot from an older version would need its log replayed across a version step.
    await expect(importRun(new MemoryBackend(), bundle, { ...file, version: 1, base: undefined, record: archive.record })).rejects.toBeInstanceOf(IncompatibleRun);
  }, 20_000);

  it('a played crag whose content changed: its projects keep their attempts and lose what they knew of the moves', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'carry-content', spec);
    await s.simulate((d) => simulateDays(d, bundle, 21));
    const before = structuredClone(s.state.projects);
    expect(Object.keys(before).length).toBeGreaterThan(0);
    const update = changed('fontainebleau');
    expect(cannotContinue(s.record, update)).toBeNull();
    const loaded = await RunSession.load(backend, update, s.id);
    expect(loaded.record).toMatchObject({ base: s.record.action_count, hashes: { fontainebleau: update.hashes.get('fontainebleau') } });
    for (const [id, p] of Object.entries(loaded.state.projects)) {
      expect(p).toMatchObject({ attempts: before[id]!.attempts, sessions: before[id]!.sessions, di: before[id]!.di, attempt_eq: 0, best: 0, revealed: [] });
      expect(p.reach_until).toBeUndefined();
    }
    expect(loaded.state.journal.at(-1)!.text).toMatch(/rebuilt the routes at Fontainebleau/);
    // Nothing else moved.
    expect({ ...loaded.state, projects: before, journal: loaded.state.journal.slice(0, -1) }).toEqual(s.state);
  }, 20_000);

  it('a crag the run has not played changes nothing: no carry, the same state', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'carry-elsewhere', spec);
    await s.simulate((d) => simulateDays(d, bundle, 3));
    const other = await RunSession.load(backend, changed('kalymnos'), s.id);
    expect(other.record.base).toBeUndefined();
    expect(other.state).toEqual(s.state);
  });

  it('refuses a run whose climber is at a crag the new version does not have', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'carry-gone', spec);
    await playDays(s, 1);
    const crags = new Map(bundle.crags);
    crags.delete('fontainebleau');
    const gone: DataBundle = { ...changed('fontainebleau'), crags };
    await expect(RunSession.load(backend, gone, s.id)).rejects.toThrow(/does not have/);
  });

  it('cuts the log cleanly at a chunk boundary: the base starts an empty chunk the run then fills', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'carry-chunk', spec);
    while (s.record.action_count < CHUNK + 20) await s.simulate((d) => simulateDays(d, bundle, 5));
    const actions = (await backend.getChunks(s.id, 0)).flat();
    await backend.deleteSnapshots(s.id);
    await backend.putSnapshot(s.id, CHUNK, replay(actions.slice(0, CHUNK), bundle), SNAPSHOTS_KEPT);
    const loaded = await RunSession.load(backend, changed('fontainebleau'), s.id);
    expect(loaded.record).toMatchObject({ base: CHUNK, action_count: CHUNK });
    expect((await backend.getChunks(s.id, 0)).map((c) => c.length)).toEqual([CHUNK, 0]);
    await loaded.simulate((d) => simulateDays(d, changed('fontainebleau'), 2));
    expect((await backend.getChunks(s.id, 0)).map((c) => c.length)).toEqual([CHUNK, loaded.record.action_count - CHUNK]);
    expect((await RunSession.load(backend, changed('fontainebleau'), s.id)).state).toEqual(loaded.state);
  }, 30_000);
});
