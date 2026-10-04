// The climber's own decisions (docs/24 §2–§3): session tactics, the week plan and its rules, simulated days.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { presetSpec } from '../src/sim/presets';
import { applyAction, createRun, dailyCost, DEFAULT_PLAN, estimateDI, replay, sectorList } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import { BROKE_DAYS, nextPlannedAction, nextSessionAttempt, plannedBlock, simulateDays, SHORT_DAYS, TACTICS, tired } from '../src/sim/tactics';
import type { Action, WeekPlan } from '../src/sim/types';

const bundle = loadBundle();

/** A plan with the same day every day of the week. */
const everyDay = (day: WeekPlan['days'][number], rest: Partial<WeekPlan> = {}): WeekPlan => ({
  ...structuredClone(DEFAULT_PLAN), days: Array.from({ length: 7 }, () => structuredClone(day)), ...rest,
});

/** Advance a fresh run to the first day matching `want` (dry or wet). */
function dayWhere(run: RunState, want: 'dry' | 'wet'): void {
  for (let i = 0; i < 120; i++) {
    const open = sectorList(run, bundle).some((s) => s.open);
    if (open === (want === 'dry')) return;
    applyAction(run, { t: 'end_day' }, bundle);
  }
  throw new Error(`no ${want} day in 120`);
}

describe('session tactics (docs/24 §3)', () => {
  it('volume climbs more problems with fewer tries each than project, and both stop when tired', () => {
    const per = (tactic: 'project' | 'volume') => {
      const run = createRun('tactics', presetSpec('dirtbag'), bundle);
      dayWhere(run, 'dry');
      applyAction(run, { t: 'block_start', kind: 'climb', target: sectorList(run, bundle).find((s) => s.open)!.id }, bundle);
      const seen = new Map<string, number>();
      for (let a = nextSessionAttempt(run, bundle, tactic); a; a = nextSessionAttempt(run, bundle, tactic)) {
        seen.set(a.route_seed, (seen.get(a.route_seed) ?? 0) + 1);
        applyAction(run, { t: 'attempt', ...a }, bundle);
      }
      const s = run.block!.session!;
      // Every problem tried stays within the tactic's reach above the estimate and its tries.
      for (const [seed, n] of seen) {
        const slot = s.slots.find((x) => x.seed === seed)!;
        expect(slot.di_target).toBeLessThanOrEqual(s.E + TACTICS[tactic].above);
        expect(n).toBeLessThanOrEqual(TACTICS[tactic].tries(slot));
      }
      return { problems: seen.size, perProblem: s.attempts / Math.max(1, seen.size), tired: tired(run), attempts: s.attempts };
    };
    const v = per('volume');
    const p = per('project');
    expect(v.attempts).toBeGreaterThan(0);
    expect(p.perProblem).toBeGreaterThan(v.perProblem);
    expect(v.problems).toBeGreaterThanOrEqual(p.problems);
  });
});

describe('the week plan (docs/24 §2)', () => {
  it('climbs on climbing days, trains on training days and rests on rest days', () => {
    const run = createRun('follow', presetSpec('dirtbag'), bundle);
    dayWhere(run, 'dry');
    const plan = structuredClone(DEFAULT_PLAN);
    plan.days[run.day % 7] = { main: { kind: 'climb', tactic: 'volume' }, extra: null };
    // Mobility leaves the 50 energy a second block needs; a heavier session would not.
    plan.days[(run.day + 1) % 7] = { main: { kind: 'train', activity: 'mobility' }, extra: { kind: 'active_recovery' } };
    plan.days[(run.day + 2) % 7] = { main: { kind: 'rest' }, extra: null };
    applyAction(run, { t: 'set_plan', plan }, bundle);
    const log = simulateDays(run, bundle, 1);
    expect(log[0]).toMatchObject({ t: 'block_start', kind: 'climb' });
    expect(log.filter((a) => a.t === 'attempt').length).toBeGreaterThan(0);
    expect(log.at(-1)).toEqual({ t: 'end_day' });
    const train = simulateDays(run, bundle, 1);
    expect(train).toEqual([
      { t: 'block_start', kind: 'train', target: 'mobility' }, { t: 'block_start', kind: 'active_recovery' }, { t: 'end_day' },
    ]);
    expect(simulateDays(run, bundle, 1)).toEqual([{ t: 'block_start', kind: 'rest' }, { t: 'end_day' }]);
  });

  it('trains or rests by the wet-day block when every sector is wet', () => {
    const run = createRun('wet', presetSpec('dirtbag'), bundle);
    dayWhere(run, 'wet');
    applyAction(run, { t: 'set_plan', plan: everyDay({ main: { kind: 'climb', tactic: 'project' }, extra: null }, { wet_day: { kind: 'train', activity: 'skill_drills' } }) }, bundle);
    expect(nextPlannedAction(run, bundle)).toEqual({ t: 'block_start', kind: 'train', target: 'skill_drills' });
  });

  it('takes odd jobs when money is short, and climbs anyway when it is only short', () => {
    const run = createRun('money', presetSpec('dirtbag'), bundle);
    dayWhere(run, 'dry');
    applyAction(run, { t: 'set_plan', plan: everyDay({ main: { kind: 'climb', tactic: 'volume' }, extra: { kind: 'rest' } }) }, bundle);
    const cost = dailyCost(run, bundle);
    run.res.money = (SHORT_DAYS - 1) * cost;
    expect(plannedBlock(run, bundle)).toEqual({ kind: 'climb', tactic: 'volume' });
    run.res.money = (BROKE_DAYS - 1) * cost;
    expect(plannedBlock(run, bundle)).toEqual({ kind: 'work' });
    const off = structuredClone(run.plan);
    off.auto_work = false;
    applyAction(run, { t: 'set_plan', plan: off }, bundle);
    expect(plannedBlock(run, bundle)).toEqual({ kind: 'climb', tactic: 'volume' });
  });

  it('rests on worn skin instead of climbing, unless the plan says to climb regardless', () => {
    const run = createRun('skin', presetSpec('dirtbag'), bundle);
    dayWhere(run, 'dry');
    applyAction(run, { t: 'set_plan', plan: everyDay({ main: { kind: 'climb', tactic: 'volume' }, extra: null }) }, bundle);
    run.res.skin = 20;
    expect(plannedBlock(run, bundle)).toEqual({ kind: 'rest' });
    const grit = structuredClone(run.plan);
    grit.auto_rest = false;
    applyAction(run, { t: 'set_plan', plan: grit }, bundle);
    expect(plannedBlock(run, bundle)).toEqual({ kind: 'climb', tactic: 'volume' });
  });

  it('a season on the default plan makes the climber better and replays exactly', () => {
    const spec = presetSpec('late_starter');
    const run = createRun('season', spec, bundle);
    const E0 = estimateDI(run, bundle);
    const log: Action[] = [{ t: 'new_run', seed: 'season', spec }, ...simulateDays(run, bundle, 120)];
    expect(run.day).toBe(120);
    expect(run.counters.climb_days).toBeGreaterThan(30);
    expect(run.counters.train_blocks).toBeGreaterThan(5);
    expect(run.ticks.length).toBeGreaterThan(20);
    expect(estimateDI(run, bundle)).toBeGreaterThan(E0 + 1);
    expect(run.history.length).toBe(Math.floor(120 / 7) + 1);
    expect(JSON.stringify(replay(log, bundle))).toBe(JSON.stringify(run));
  }, 20_000);
});
