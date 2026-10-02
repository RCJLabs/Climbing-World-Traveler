// Reach in the engine (docs/23 §3.1): a drag is two numbers on the move; Auto is the move as it always was, a good
// placement helps a little, a slow reach pumps and a very slow one lets go, and a logged drag replays exactly.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { autoClimbAction, balanceSetup, InvalidAction, reachBudget } from '../src/sim/attempt';
import { presetSpec } from '../src/sim/presets';
import { AUTO_PLACE, AUTO_TIME_SHARE, gripBudget, judgeReach, placeDelta, type MovePerf } from '../src/sim/reach';
import { applyAction, createRun, sectorList } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import { isDynamic } from '../src/sim/tables';
import type { Action } from '../src/sim/types';

const bundle = loadBundle(false);
type Move = Extract<Action, { t: 'move' }>;

describe('Reach judge', () => {
  it('the grip budget shrinks with a harder move and with pump, within its clamps', () => {
    expect(gripBudget(1, 1, 0)).toBeGreaterThan(gripBudget(0, 1, 0));
    expect(gripBudget(0, 1, 0)).toBeGreaterThan(gripBudget(-0.5, 1, 0));
    expect(gripBudget(0, 1, 0)).toBeGreaterThan(gripBudget(0, 1, 60));
    expect(gripBudget(-5, 1, 0)).toBe(gripBudget(-0.6, 1, 0));
    expect(gripBudget(5, 1, 0)).toBe(gripBudget(2, 1, 0));
  });

  it('Auto lands with no margin change and no overrun', () => {
    expect(placeDelta(AUTO_PLACE)).toBeCloseTo(0, 12);
    const j = judgeReach({ kind: 'reach', time_ms: AUTO_TIME_SHARE * 1000, place: AUTO_PLACE }, 1000, true);
    expect(j).toMatchObject({ pumpMult: 1, pop: false, overrun: 0 });
  });

  it('overrun pumps a hand move, pops it past twice the budget, and never touches a foot move', () => {
    expect(judgeReach({ kind: 'reach', time_ms: 1500, place: 0 }, 1000, true)).toMatchObject({ pumpMult: 1.5, pop: false });
    expect(judgeReach({ kind: 'reach', time_ms: 2100, place: 0 }, 1000, true).pop).toBe(true);
    expect(judgeReach({ kind: 'reach', time_ms: 5000, place: 0 }, 1000, false)).toMatchObject({ pumpMult: 1, pop: false });
  });
});

describe('Reach in the attempt loop', () => {
  /** A run at the first point of an attempt where the bot's next move is a hand Reach move. */
  function atReach(seed: string): { run: RunState; move: Move } {
    const run = createRun(seed, presetSpec('power_boulderer'), bundle);
    for (let day = 0; day < 6; day++) {
      const sector = sectorList(run, bundle).find((x) => x.open)?.id;
      if (!sector) { applyAction(run, { t: 'end_day' }, bundle); continue; }
      applyAction(run, { t: 'block_start', kind: 'climb', target: sector }, bundle);
      for (const slot of run.block!.session!.slots) {
        applyAction(run, { t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' }, bundle);
        for (let g = 0; g < 60 && run.attempt; g++) {
          const a = autoClimbAction(run, bundle, { bot: true });
          if (a?.t === 'move' && (a.limb === 'LH' || a.limb === 'RH') && !isDynamic(a.class) && a.class !== 'mantle' && !balanceSetup(run, a.limb, a.hold, a.class, bundle)) return { run, move: a };
          applyAction(run, a ?? { t: 'wall_action', kind: 'jump_off' }, bundle);
        }
        if (run.attempt) applyAction(run, { t: 'wall_action', kind: 'jump_off' }, bundle);
      }
    }
    throw new Error('no reach move found');
  }

  const after = (base: RunState, m: Move, perf?: MovePerf) => {
    const run = structuredClone(base);
    applyAction(run, perf ? { ...m, perf } : m, bundle);
    return run;
  };
  const lastMove = (run: RunState) => [...(run.attempt?.log ?? run.last_attempt!.log)].reverse().find((r) => r.kind === 'move' && r.margin !== undefined)!;

  it('an Auto-shaped drag resolves exactly like the move with no perf', () => {
    const { run, move } = atReach('reach-auto');
    const budget = reachBudget(run, move.limb, move.hold, move.class, bundle)!;
    expect(budget).toBeGreaterThan(0);
    const plain = after(run, move);
    const auto = after(run, move, { kind: 'reach', time_ms: AUTO_TIME_SHARE * budget, place: AUTO_PLACE });
    const strip = (r: RunState) => JSON.stringify({ ...r, attempt: r.attempt && { ...r.attempt, log: r.attempt.log.map((x) => ({ ...x, text: '' })) } });
    expect(strip(auto)).toBe(strip(plain));
  });

  it('placement moves the margin by the placement term; a slow reach costs more pump', () => {
    const { run, move } = atReach('reach-place');
    const budget = reachBudget(run, move.limb, move.hold, move.class, bundle)!;
    const m0 = lastMove(after(run, move)).margin!;
    expect(lastMove(after(run, move, { kind: 'reach', time_ms: 0.5 * budget, place: 0 })).margin! - m0).toBeCloseTo(0.03, 9);
    expect(lastMove(after(run, move, { kind: 'reach', time_ms: 0.5 * budget, place: 1 })).margin! - m0).toBeCloseTo(-0.06, 9);
    const pump = (p?: MovePerf) => lastMove(after(run, move, p)).pump_delta;
    const fast = pump({ kind: 'reach', time_ms: 0.5 * budget, place: AUTO_PLACE });
    if (fast > 0) expect(pump({ kind: 'reach', time_ms: 1.5 * budget, place: AUTO_PLACE })).toBeCloseTo(fast * 1.5, 6);
  });

  it('far too slow and the holding hand opens: the move does not land', () => {
    const { run, move } = atReach('reach-pop');
    const budget = reachBudget(run, move.limb, move.hold, move.class, bundle)!;
    const r = after(run, move, { kind: 'reach', time_ms: Math.ceil(2.2 * budget), place: 0 });
    expect(['slip_recovered', 'fall']).toContain(lastMove(r).outcome);
    expect(lastMove(r).text).toMatch(/slow/i);
  });

  it('rejects a drag on a dyno and a malformed drag', () => {
    const { run, move } = atReach('reach-bad');
    expect(() => after(run, move, { kind: 'reach', time_ms: -1, place: 0 })).toThrow(InvalidAction);
    expect(() => after(run, move, { kind: 'reach', time_ms: Number.NaN, place: 0 })).toThrow(InvalidAction);
  });

  it('a career of logged drags replays to the same state', () => {
    const seed = 'reach-replay';
    const run = createRun(seed, presetSpec('farm_kid'), bundle);
    const log: Action[] = [];
    const go = (a: Action) => { log.push(a); applyAction(run, a, bundle); };
    let dragged = 0;
    for (let day = 0; day < 4; day++) {
      const sector = sectorList(run, bundle).find((x) => x.open)?.id;
      if (!sector || run.res.energy < 50) { go({ t: 'end_day' }); continue; }
      go({ t: 'block_start', kind: 'climb', target: sector });
      for (const slot of run.block!.session!.slots.slice(0, 3)) {
        if (!run.block) break;
        go({ t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' });
        for (let g = 0; g < 200 && run.attempt; g++) {
          if (run.attempt.pending) { go({ t: 'commit', swing: null }); continue; }
          const a = autoClimbAction(run, bundle, { bot: true }) ?? { t: 'wall_action', kind: 'jump_off' } as const;
          const bal = a.t === 'move' ? balanceSetup(run, a.limb, a.hold, a.class, bundle) : null;
          const budget = a.t === 'move' ? reachBudget(run, a.limb, a.hold, a.class, bundle) : null;
          if (a.t === 'move' && bal) { dragged++; go({ ...a, perf: { kind: 'balance', out_ms: (g % 3) * 400, place: (g % 4) / 3 } }); }
          else if (a.t === 'move' && budget !== null) { dragged++; go({ ...a, perf: { kind: 'reach', time_ms: Math.round(budget * (0.3 + (g % 5) * 0.3)), place: (g % 4) / 3 } }); }
          else go(a);
        }
      }
      if (run.block) go({ t: 'block_end' });
      go({ t: 'end_day' });
    }
    expect(dragged).toBeGreaterThan(5);
    const b = createRun(seed, presetSpec('farm_kid'), bundle);
    for (const x of log) applyAction(b, x, bundle);
    expect(JSON.stringify(b)).toBe(JSON.stringify(run));
  });
});
