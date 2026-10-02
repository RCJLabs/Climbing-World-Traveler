// Event-sourced saves (docs/18 §5): write path, snapshot + tail load, version-bump replay, export/import, meta.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { autoClimbAction } from '../src/sim/attempt';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { sectorList } from '../src/sim/run';
import { MemoryBackend } from '../src/save/backend';
import { importRun, IncompatibleRun, RunSession, SNAPSHOT_EVERY } from '../src/save/session';

const bundle = loadBundle();
const spec = presetSpec('dirtbag', { ...DEFAULT_OPTIONS, auto_commit: true });

async function playDays(s: RunSession, days: number): Promise<void> {
  for (let d = 0; d < days; d++) {
    const open = sectorList(s.state, bundle).find((x) => x.open);
    if (open) {
      await s.dispatch({ t: 'block_start', kind: 'climb', target: open.id });
      for (const slot of s.state.block!.session!.slots.slice(0, 4)) {
        if (s.state.res.energy < 22) break;
        await s.dispatch({ t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' });
        for (let g = 0; g < 150 && s.state.attempt; g++) await s.dispatch(autoClimbAction(s.state, bundle, { bot: true }) ?? { t: 'wall_action', kind: 'jump_off' });
      }
      await s.dispatch({ t: 'block_end' });
    }
    await s.dispatch({ t: 'end_day' });
  }
}

describe('saves', () => {
  it('writes every action and reloads to the identical state from snapshot + tail', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-1', spec);
    await playDays(s, 15);
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
    await expect(s.dispatch({ t: 'move', limb: 'LH', hold: 'x', class: 'static' })).rejects.toThrow();
    expect(backend.writes).toBe(writes);
    expect(JSON.stringify(s.state)).toBe(before);
  });

  it('a reducer-version mismatch discards snapshots and replays the whole log', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-3', spec);
    await playDays(s, 3);
    const rec = (await backend.getRun(s.id))!;
    await backend.append({ ...rec, version: 0 }, 0, (await backend.getChunks(s.id, 0))[0]!);
    const loaded = await RunSession.load(backend, bundle, s.id);
    expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(s.state));
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

  it('refuses to replay a run made with another content version', async () => {
    const backend = new MemoryBackend();
    const s = await RunSession.create(backend, bundle, 'save-5', spec);
    await playDays(s, 1);
    const rec = (await backend.getRun(s.id))!;
    await backend.append({ ...rec, data_version: 'p1a-0' }, 0, (await backend.getChunks(s.id, 0))[0]!);
    await expect(RunSession.load(backend, bundle, s.id)).rejects.toBeInstanceOf(IncompatibleRun);
  });
});
