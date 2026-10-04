// The IndexedDB backend (docs/18 §5), the one players' saves live in, on an in-memory IndexedDB: the same write path,
// reload and carry-forward as the memory backend the other save tests use, so a transaction over the wrong key range
// cannot pass unseen (27 §4).
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { IdbBackend, type RunRecord } from '../src/save/backend';
import { RunSession, SNAPSHOTS_KEPT } from '../src/save/session';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { replay } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import { simulateDays } from '../src/sim/tactics';
import type { Action } from '../src/sim/types';

const bundle = loadBundle();
const spec = presetSpec('dirtbag', DEFAULT_OPTIONS);
let dbs = 0;
const open = () => IdbBackend.open(`cwt-test-${++dbs}`);

describe('the IndexedDB backend', () => {
  it('writes a run, simulated stretches included, and reloads it to the same state', async () => {
    const backend = await open();
    const s = await RunSession.create(backend, bundle, 'idb-1', spec);
    await s.simulate((d) => simulateDays(d, bundle, 12));
    await s.dispatch({ t: 'travel', to: 'kalymnos' });
    await s.simulate((d) => simulateDays(d, bundle, 5));
    const loaded = await RunSession.load(backend, bundle, s.id);
    expect(loaded.state).toEqual(s.state);
    expect((await backend.getRun(s.id))!.hashes).toEqual({ fontainebleau: bundle.hashes.get('fontainebleau'), kalymnos: bundle.hashes.get('kalymnos') });
  }, 20_000);

  it('carries an archived reducer-9 run forward in one rebase: log cut at the base, snapshots replaced', async () => {
    const archive = JSON.parse(readFileSync('tests/fixtures/saves/v9-kalymnos.json', 'utf8')) as {
      record: RunRecord; chunks: Action[][]; snapshots: { index: number; state: RunState }[];
    };
    const backend = await open();
    await backend.appendChunks(archive.record, archive.chunks.map((c, i) => [i, c] as const));
    for (const x of archive.snapshots) await backend.putSnapshot(archive.record.id, x.index, x.state, SNAPSHOTS_KEPT);
    const index = archive.snapshots.at(-1)!.index;
    const s = await RunSession.load(backend, bundle, archive.record.id);
    expect(s.record).toMatchObject({ base: index, action_count: index });
    expect((await backend.getRun(s.id))!).toMatchObject({ base: index, action_count: index, crag: 'kalymnos' });
    expect((await backend.getChunks(s.id, 0)).flat()).toEqual(archive.chunks.flat().slice(0, index));
    expect(await backend.latestSnapshot(s.id)).toEqual({ index, state: s.state });
    expect({ ...s.state, journal: s.state.journal.slice(0, -1) }).toEqual(replay(archive.chunks.flat().slice(0, index), bundle));
    // It goes on from the base, and reloads to the same state.
    await s.simulate((d) => simulateDays(d, bundle, 4));
    expect((await RunSession.load(backend, bundle, s.id)).state).toEqual(s.state);
  }, 20_000);

  it('deletes a run with its log and snapshots', async () => {
    const backend = await open();
    const s = await RunSession.create(backend, bundle, 'idb-3', spec);
    await s.simulate((d) => simulateDays(d, bundle, 3));
    await backend.deleteRun(s.id);
    expect(await backend.getRun(s.id)).toBeUndefined();
    expect(await backend.getChunks(s.id, 0)).toEqual([]);
    expect(await backend.latestSnapshot(s.id)).toBeUndefined();
  });
});
