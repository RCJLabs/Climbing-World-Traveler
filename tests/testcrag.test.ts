// The test crag (27 M1 exit test): Tessera, a made-up crag kept in tests/fixtures and never shipped, built from Font's
// and Kalymnos's styles. It is added to a copy of data/ as a folder, the way docs/20 adds a crag: the folder, its
// benchmarks, the manifest. With no code change it must pass its gates (the validator and its own calibration), have
// boulders and routes shown in its own grading systems, play both, and leave a run saved before it existed as it was.
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeBenchmarks } from '../src/data/benchmarks';
import { cragIds, loadBundle, writeManifest } from '../src/data/bundle';
import { validateContent } from '../src/data/validate';
import { CAL_SIZES, cragGates } from '../src/harness/calibration';
import { referenceCrags } from '../src/harness/career';
import { MemoryBackend } from '../src/save/backend';
import { RunSession } from '../src/save/session';
import { routeEntry } from '../src/sim/attempt';
import { cragDisciplines, sectorRock } from '../src/sim/discipline';
import { benchmarks } from '../src/sim/estimate';
import { gradeFor } from '../src/sim/grades';
import { presetSpec } from '../src/sim/presets';
import { sectorCatalogue } from '../src/sim/routes';
import { applyAction, canStartBlock, createRun, replay, sectorList } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import { nextPlannedAction, simulateDays } from '../src/sim/tactics';
import type { Action, DataBundle } from '../src/sim/types';
import { freshWeather, sectorStatus, type DayWeather } from '../src/sim/weather';

const FIXTURE = 'tests/fixtures/crags/tessera';
const base = loadBundle();
let dir = '';
let bundle: DataBundle;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'cwt-crag-'));
  cpSync('data', dir, { recursive: true });
  cpSync(FIXTURE, `${dir}/crags/tessera`, { recursive: true });
  writeManifest(dir);
  writeBenchmarks(dir, 'tessera', loadBundle(true, dir));
  writeManifest(dir);
  bundle = loadBundle(true, dir);
}, 60_000);

afterAll(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

/** Wait for a sector to open, climb a session there by the plan's tactic, and say what it climbed. */
function session(run: RunState, sector: string): { attempts: number; disciplines: string[]; E: number } {
  for (let i = 0; i < 40 && !canStartBlock(run, 'climb', sector, bundle).ok; i++) applyAction(run, { t: 'end_day' }, bundle);
  applyAction(run, { t: 'block_start', kind: 'climb', target: sector }, bundle);
  const s = run.block!.session!;
  const disciplines = [...new Set(s.slots.map((x) => routeEntry(x.seed, bundle).route.discipline))];
  let attempts = 0;
  for (let a = nextPlannedAction(run, bundle); a.t === 'attempt'; a = nextPlannedAction(run, bundle)) {
    applyAction(run, a, bundle);
    attempts++;
  }
  applyAction(run, { t: 'block_end' }, bundle);
  return { attempts, disciplines, E: s.E };
}

describe('a crag added as a folder (27 M1)', () => {
  it('is not shipped: data/ has no such folder, and the shipped bundle no such crag', () => {
    expect(cragIds()).not.toContain('tessera');
    expect(base.crags.has('tessera')).toBe(false);
    expect(bundle.crags.has('tessera')).toBe(true);
  });

  it('passes the validator, its manifest entry current, with no code change', () => {
    const v = validateContent(dir);
    expect(v.errors).toEqual([]);
    expect(v.bundle!.hashes.get('tessera')).toMatch(/^[0-9a-z]+$/);
    // The crags that were there keep their hashes: adding a crag touches no other folder.
    for (const id of base.crags.keys()) expect(bundle.hashes.get(id)).toBe(base.hashes.get(id));
  });

  it('has boulders and routes, each shown in the crag\'s own grading system', () => {
    const crag = bundle.crags.get('tessera')!;
    expect(cragDisciplines(crag, bundle)).toEqual(['boulder', 'sport']);
    expect(benchmarks('tessera', bundle, 'boulder').length).toBeGreaterThanOrEqual(12);
    expect(benchmarks('tessera', bundle, 'sport').length).toBeGreaterThanOrEqual(12);
    for (const s of crag.sectors) expect(sectorCatalogue(crag, s, bundle)).toHaveLength(s.routes!);
    expect(gradeFor(16, 'boulder', crag)).toBe('V4');
    expect(gradeFor(16, 'sport', crag)).toBe('5.11b');
    expect(gradeFor(16, 'boulder', bundle.crags.get('fontainebleau'))).toBe('6B+');
    expect(gradeFor(16, 'sport', bundle.crags.get('kalymnos'))).toBe('6c+');
    // Its boulders are sandstone and its routes limestone, each with its own wet rule.
    const rocks = crag.sectors.map((s) => sectorRock(s, bundle));
    expect(rocks).toEqual(['sandstone_font', 'sandstone_font', 'limestone', 'limestone']);
    const damp: DayWeather = { ...freshWeather('wx', crag, 10, 3, 'standard'), day: 10, sky: 'cloudy', rh: 92, wind: 1 };
    expect(sectorStatus(rocks[0]!, crag.sectors[0]!, damp, null)).toMatchObject({ open: false, reason: expect.stringMatching(/sandstone/) });
    expect(sectorStatus(rocks[2]!, crag.sectors[2]!, damp, null).open).toBe(true);
    // A crag that sorts after them and came no earlier leaves the reference crags where they were.
    expect(referenceCrags(bundle)).toEqual({ boulder: 'fontainebleau', sport: 'kalymnos' });
  });

  it('passes its own calibration gates: C1–C4 on boulders and on routes, and C7', () => {
    const { checks } = cragGates(bundle, 'tessera', CAL_SIZES.quick, 0.85);
    expect(checks.map((c) => c.id)).toEqual([
      'C1 boulder generator accuracy', 'C2 boulder reference self-consistency', 'C3 boulder monotonicity', 'C4 boulder determinism',
      'C1 sport generator accuracy', 'C2 sport reference self-consistency', 'C3 sport monotonicity', 'C4 sport determinism',
      'C7 signatures',
    ]);
    expect(checks.filter((c) => c.gate && !c.pass)).toEqual([]);
  }, 60_000);

  it('plays both: a boulder session and a sport session there, each estimated in its own discipline', () => {
    const run = createRun('tessera-both', presetSpec('dirtbag'), bundle);
    applyAction(run, { t: 'travel', to: 'tessera' }, bundle);
    expect(run.crag).toBe('tessera');
    expect(Object.keys(run.est!).sort()).toEqual(['boulder', 'sport']);
    const boulders = session(run, 'boulder_field');
    expect(boulders).toMatchObject({ disciplines: ['boulder'], E: Math.round(run.est!.boulder! * 2) / 2 });
    expect(boulders.attempts).toBeGreaterThan(0);
    const routes = session(run, 'grey_wall');
    expect(routes).toMatchObject({ disciplines: ['sport'], E: Math.round(run.est!.sport! * 2) / 2 });
    expect(routes.attempts).toBeGreaterThan(0);
  }, 30_000);

  it('three weeks there on the default plan tick boulders and routes, and replay exactly', () => {
    const seed = 'tessera-weeks';
    const spec = presetSpec('dirtbag');
    const run = createRun(seed, spec, bundle);
    const log: Action[] = [{ t: 'new_run', seed, spec }, { t: 'travel', to: 'tessera' }];
    applyAction(run, log[1]!, bundle);
    log.push(...simulateDays(run, bundle, 21));
    const here = run.ticks.filter((t) => t.crag === 'tessera');
    expect(new Set(here.map((t) => t.discipline ?? 'boulder'))).toEqual(new Set(['boulder', 'sport']));
    expect(replay(log, bundle)).toEqual(run);
  }, 60_000);

  it('leaves a run saved before it existed as it was, and the run goes on to it', async () => {
    const backend = new MemoryBackend();
    const before = await RunSession.create(backend, base, 'before-tessera', presetSpec('dirtbag'));
    await before.simulate((draft) => simulateDays(draft, base, 10));
    await before.dispatch({ t: 'travel', to: 'kalymnos' });
    await before.simulate((draft) => simulateDays(draft, base, 7));
    // The update adds the crag: the same save loads under the new data, to the same state.
    const after = await RunSession.load(backend, bundle, before.id);
    expect(after.state).toEqual(before.state);
    const { actions } = await after.exportFile();
    expect(replay(actions, bundle)).toEqual(before.state);
    // And it carries on, to the new crag and its routes.
    await after.dispatch({ t: 'travel', to: 'tessera' });
    await after.simulate((draft) => simulateDays(draft, bundle, 7));
    expect(after.state.crag).toBe('tessera');
    expect(after.state.visited).toEqual(['fontainebleau', 'kalymnos', 'tessera']);
    expect(sectorList(after.state, bundle).map((s) => s.id)).toEqual(['boulder_field', 'low_roofs', 'grey_wall', 'the_cave']);
  }, 60_000);
});
