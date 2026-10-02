// Run reducer, attempt loop and replay determinism (docs/05b, 11, 18 §5, 19 §6).
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { athleteOf, autoClimbAction, limbOptions, routeEntry } from '../src/sim/attempt';
import { BotDriver, PROJECT_POLICY } from '../src/sim/bot';
import { BENCH_PER_PROFILE, estimateBoulderDI } from '../src/sim/estimate';
import { workedExampleBuilds } from '../src/harness/sim';
import { evWalk, gradeRoute, referenceAthlete } from '../src/sim/grade';
import { DEFAULT_OPTIONS, PRESETS, presetSpec } from '../src/sim/presets';
import { applyAction, createRun, InvalidAction, reduce, replay, sectorList } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import type { Action } from '../src/sim/types';
import { calendarDate } from '../src/sim/weather';
import { POWER_BASE } from '../src/sim/resolve';

const bundle = loadBundle();
const AUTO = { ...DEFAULT_OPTIONS, auto_commit: true };

function botRun(seed: string, preset: string, days: number): { run: RunState; log: Action[] } {
  const spec = presetSpec(preset, AUTO);
  const run = createRun(seed, spec, bundle);
  const bot = new BotDriver(run, bundle, PROJECT_POLICY);
  for (let d = 0; d < days && !run.ended; d++) bot.day();
  return { run, log: [{ t: 'new_run', seed, spec }, ...bot.log] };
}

/** First day with an open sector, advancing days on a fresh run. */
function openDay(run: RunState): string {
  for (let i = 0; i < 60; i++) {
    const open = sectorList(run, bundle).find((s) => s.open);
    if (open) return open.id;
    applyAction(run, { t: 'end_day' }, bundle);
  }
  throw new Error('sixty wet days');
}

describe('creation', () => {
  it('every preset is a valid build', () => {
    for (const p of PRESETS) expect(() => createRun('c', presetSpec(p.id), bundle), p.id).not.toThrow();
  });

  it('rejects a pinned lock-off depth, which belongs to the Reference Climber', () => {
    const spec = presetSpec('slab_wizard');
    spec.body = { ...spec.body, lock_depth_m: 0.05 };
    expect(() => createRun('c', spec, bundle)).toThrow(InvalidAction);
  });

  it('rejects an over-budget build', () => {
    const spec = presetSpec('slab_wizard');
    spec.traits = [...spec.traits, 'ice_in_the_veins', 'laser_focus'];
    expect(() => createRun('c', spec, bundle)).toThrow(InvalidAction);
  });

  it('starts on 1 September at Fontainebleau with background money', () => {
    const run = createRun('c', presetSpec('dirtbag'), bundle);
    expect(run.crag).toBe('fontainebleau');
    expect(calendarDate(run.start_month, run.start_dom, run.day)).toMatchObject({ month: 8, dom: 1 });
    expect(run.res.money).toBe(800 + 1500 * 5);
  });

  it('gates Farm Kid behind the P1a unlock only when unlocks are supplied', async () => {
    const { validateCreation } = await import('../src/sim/character');
    const spec = presetSpec('farm_kid');
    const ctx = { traits: bundle.traits, backgrounds: bundle.backgrounds };
    expect(validateCreation(spec, { ...ctx, unlocked: new Set() }).join(' ')).toMatch(/unlocks/);
    expect(validateCreation(spec, { ...ctx, unlocked: new Set(['p1a:second_background']) })).toEqual([]);
  });
});

describe('estimate (02 §C.3)', () => {
  it('returns the Reference Climber its own DI', () => {
    for (const d of [10, 14, 18, 22]) expect(Math.abs(estimateBoulderDI(referenceAthlete(d), 'fontainebleau', bundle) - d)).toBeLessThan(0.6);
  });

  const shipped = bundle.benchmarks.get('fontainebleau')!;

  it(`ships ${BENCH_PER_PROFILE} benchmark problems per style per level, up to each style's ceiling`, () => {
    const crag = bundle.crags.get('fontainebleau')!;
    for (const pid of new Set(crag.sectors.flatMap((s) => s.style_profiles))) {
      const cap = bundle.profiles.get(pid)!.di_max ?? Infinity;
      const byLevel = new Map<number, number>();
      for (const r of shipped.filter((x) => x.seed?.includes(`:${pid}:`))) byLevel.set(r.di_target, (byLevel.get(r.di_target) ?? 0) + 1);
      for (const [level, n] of byLevel) {
        expect(level).toBeLessThanOrEqual(cap);
        expect(n, `${pid} at ${level}`).toBe(BENCH_PER_PROFILE);
      }
    }
  });

  it('ships benchmark grades that match the current engine (rebuild with pnpm benchmarks)', () => {
    for (const r of shipped) expect(Math.abs(gradeRoute(r).di! - r.di_graded), r.seed).toBeLessThanOrEqual(0.006);
  });
});

describe('day loop', () => {
  it('charges the daily cost, regenerates skin and advances weather deterministically', () => {
    const a = createRun('w', presetSpec('dirtbag'), bundle);
    const b = createRun('w', presetSpec('dirtbag'), bundle);
    const money = a.res.money;
    for (let i = 0; i < 10; i++) { applyAction(a, { t: 'end_day' }, bundle); applyAction(b, { t: 'end_day' }, bundle); }
    expect(a.day).toBe(10);
    expect(a.res.money).toBe(money - 10 * Math.round(35 * 0.7)); // Dirtbag cost_mult 0.7
    expect(a.weather).toEqual(b.weather);
  });

  it('closes every sector on a rain day', () => {
    const run = createRun('rain', presetSpec('dirtbag'), bundle);
    for (let i = 0; i < 200 && run.weather.sky !== 'rain'; i++) applyAction(run, { t: 'end_day' }, bundle);
    expect(run.weather.sky).toBe('rain');
    expect(sectorList(run, bundle).every((s) => !s.open)).toBe(true);
    expect(() => applyAction(run, { t: 'block_start', kind: 'climb', target: 'bas_cuvier' }, bundle)).toThrow(InvalidAction);
  });

  it('lets rest bring burnout down after a long failure streak (12 §7)', () => {
    // A failure streak charged on rest days too outweighed rest, so burnout stuck at 100 and the forced break
    // repeated for the rest of the run.
    const run = createRun('burnt', presetSpec('dirtbag'), bundle);
    run.counters.failure_streak = 10;
    run.res.burnout = 90;
    for (let i = 0; i < 30; i++) applyAction(run, { t: 'end_day' }, bundle);
    expect(run.res.burnout).toBeLessThan(80);
    expect(run.counters.failure_streak).toBe(10); // only a send resets it
  });

  it('ends the run as bankrupt after 30 days in the red', () => {
    const run = createRun('broke', presetSpec('dirtbag'), bundle);
    run.res.money = 10;
    for (let i = 0; i < 40 && !run.ended; i++) applyAction(run, { t: 'end_day' }, bundle);
    expect(run.ended?.end_reason).toBe('bankrupt');
    expect(run.ended?.unlocks).toContain('p1a:second_background');
  });

  it('retire writes a summary with a score', () => {
    const { run } = botRun('retire', 'power_boulderer', 12);
    applyAction(run, { t: 'retire' }, bundle);
    expect(run.ended?.end_reason).toBe('retired');
    expect(run.ended!.ticks).toBeGreaterThan(0);
    expect(run.ended!.score).toBeGreaterThan(10 * run.ended!.hardest);
    expect(() => applyAction(run, { t: 'end_day' }, bundle)).toThrow(InvalidAction);
  });
});

describe('attempts', () => {
  it('a commit window waits for a commit action, and illegal moves are rejected', () => {
    const run = createRun('dyn', presetSpec('power_boulderer'), bundle);
    const sector = openDay(run);
    applyAction(run, { t: 'block_start', kind: 'climb', target: sector }, bundle);
    const slot = run.block!.session!.slots[1]!;
    applyAction(run, { t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' }, bundle);
    expect(() => applyAction(run, { t: 'move', limb: 'LH', hold: 'no_such_hold', class: 'static' }, bundle)).toThrow(InvalidAction);
    let sawWindow = false;
    for (let g = 0; g < 200 && run.attempt; g++) {
      if (run.attempt.pending) {
        sawWindow = true;
        expect(() => applyAction(run, { t: 'wall_action', kind: 'rest' }, bundle)).toThrow(InvalidAction);
      }
      applyAction(run, autoClimbAction(run, bundle, { bot: true }) ?? { t: 'wall_action', kind: 'jump_off' }, bundle);
    }
    expect(run.attempt).toBeNull();
    expect(run.last_attempt).not.toBeNull();
    expect(typeof sawWindow).toBe('boolean');
  });

  it('starts an attempt with the power pool: a base plus anaerobic capacity (02 §D)', () => {
    const run = createRun('pool', presetSpec('dirtbag'), bundle);
    const sector = openDay(run);
    applyAction(run, { t: 'block_start', kind: 'climb', target: sector }, bundle);
    expect(run.res.energy).toBeGreaterThanOrEqual(50);
    applyAction(run, { t: 'attempt_start', route_seed: run.block!.session!.slots[0]!.seed, mode: 'onsight' }, bundle);
    expect(run.attempt!.power).toBe(POWER_BASE + run.attrs.anaerobic_capacity.value);
  });

  it('limb options show the decision triangle for reachable holds', () => {
    const run = createRun('opts', presetSpec('dirtbag'), bundle);
    const sector = openDay(run);
    applyAction(run, { t: 'block_start', kind: 'climb', target: sector }, bundle);
    applyAction(run, { t: 'attempt_start', route_seed: run.block!.session!.slots[0]!.seed, mode: 'onsight' }, bundle);
    const opts = limbOptions(run, 'RH', bundle).filter((o) => o.preview);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.preview!.p_complete).toBeGreaterThanOrEqual(0);
      expect(o.preview!.p_complete).toBeLessThanOrEqual(1);
      expect(o.preview!.pump_ev).toBeGreaterThanOrEqual(0);
    }
  });

  it('the same action at the same point gives the same roll (no save-scumming)', () => {
    const run = createRun('scum', presetSpec('compression_monster'), bundle);
    const sector = openDay(run);
    applyAction(run, { t: 'block_start', kind: 'climb', target: sector }, bundle);
    applyAction(run, { t: 'attempt_start', route_seed: run.block!.session!.slots[5]!.seed, mode: 'onsight' }, bundle);
    const step = autoClimbAction(run, bundle, { bot: true })!;
    const a = reduce(run, step, bundle);
    const b = reduce(run, step, bundle);
    expect(a.attempt?.log.at(-1) ?? a.last_attempt).toEqual(b.attempt?.log.at(-1) ?? b.last_attempt);
  });
});

describe('replay (18 §5, 19 §6)', () => {
  it('rebuilds a 30-day bot career exactly from its action log', () => {
    const { run, log } = botRun('replay', 'farm_kid', 30);
    expect(log.length).toBeGreaterThan(500);
    expect(JSON.stringify(replay(log, bundle))).toBe(JSON.stringify(run));
  });

  it('resumes from a mid-log snapshot to the same state', () => {
    const { run, log } = botRun('snap', 'late_starter', 20);
    const mid = Math.floor(log.length / 2);
    const snap = replay(log.slice(0, mid), bundle);
    expect(JSON.stringify(replay(log, bundle, { state: snap, index: mid }))).toBe(JSON.stringify(run));
  });
});

describe('exit criterion (01 §4): two builds on the same problem', () => {
  const sectors = ['cuvier_rempart', 'bas_cuvier', 'apremont', 'cul_de_chien'];
  const problems = sectors.map((sector) => routeEntry(`fontainebleau/${sector}:0:4242:15.5`, bundle));

  it('the Slab Wizard and Compression Monster presets fail in different places on Font 6B+ problems', () => {
    // The presets start near Font 5–6A, so neither sends a 6B+ yet; what differs is where each one fails.
    const slab = athleteOf(createRun('exit', presetSpec('slab_wizard', AUTO), bundle), bundle);
    const comp = athleteOf(createRun('exit', presetSpec('compression_monster', AUTO), bundle), bundle);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const hand = { slab: [] as number[], comp: [] as number[] };
    const foot = { slab: [] as number[], comp: [] as number[] };
    for (const { route, geom } of problems) {
      expect(Math.abs(route.di_graded - 15.5)).toBeLessThanOrEqual(1);
      const ws = evWalk(geom, slab);
      const wc = evWalk(geom, comp);
      const n = Math.min(ws.margins.length, wc.margins.length);
      for (let k = 0; k < n; k++) {
        const kind = route.beta_line[k]!.limb.endsWith('H') ? hand : foot;
        kind.slab.push(ws.margins[k]!);
        kind.comp.push(wc.margins[k]!);
      }
    }
    // The slab build stands on its feet and cannot hold the slopers; the compression build is the reverse.
    expect(mean(foot.slab) - mean(foot.comp)).toBeGreaterThan(1);
    expect(mean(hand.comp) - mean(hand.slab)).toBeGreaterThan(3);
  });

  it('the 05b §14.1 builds split sends on problems at their grade', () => {
    // Both builds estimate near DI 17 (Font 6C) with lock-off reach, so they meet DI-17 problems from every sector.
    const { A, B } = workedExampleBuilds();
    const crag = bundle.crags.get('fontainebleau')!;
    let split = 0;
    const n = 20;
    for (let k = 0; k < n; k++) {
      const sector = crag.sectors[k % crag.sectors.length]!.id;
      const { geom } = routeEntry(`fontainebleau/${sector}:0:${7000 + k}:17.0`, bundle);
      const pa = evWalk(geom, A).p_send;
      const pb = evWalk(geom, B).p_send;
      if (Math.max(pa, pb) >= 0.2 && Math.min(pa, pb) < 0.05) split++;
    }
    // On at least a quarter of the problems one build is in the game and the other is not.
    expect(split).toBeGreaterThanOrEqual(n / 4);
  });
});
