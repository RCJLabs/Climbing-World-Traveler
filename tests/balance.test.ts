// Balance in the engine (docs/23 §2.2, §3.2): the stance test, the drift, the judge, and a Balance move in the
// attempt loop: Auto is the move as it was, time out of balance costs margin, a long one swings you off, and a
// perf of the wrong kind is refused.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { athleteOf, autoClimbAction, balanceSetup, InvalidAction } from '../src/sim/attempt';
import { BARN_MS, driftSpeed, hull, judgeBalance, OUT_COST, OUT_FULL_MS, signedDist, type FPt } from '../src/sim/balance';
import { presetSpec } from '../src/sim/presets';
import { applyAction, createRun, sectorList } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import type { Action } from '../src/sim/types';

const bundle = loadBundle(false);
type Move = Extract<Action, { t: 'move' }>;

describe('Balance geometry', () => {
  const tri: FPt[] = [[0, 0], [0.4, 0], [0.2, 1]];
  it('the hull is counter-clockwise and the distance is signed', () => {
    const h = hull(tri);
    expect(h).toHaveLength(3);
    expect(signedDist(h, [0.2, 0.3])).toBeLessThan(0);
    expect(signedDist(h, [0.6, 0.3])).toBeGreaterThan(0);
    expect(signedDist(h, [0.2, -0.1])).toBeCloseTo(0.1, 9);
  });
  it('two anchors have no inside: the body is always on the edge', () => {
    expect(signedDist(hull([[0, 0], [0, 1]]), [0, 0.5])).toBeCloseTo(0, 9);
    expect(signedDist(hull([[0, 0], [0, 1]]), [0.1, 0.5])).toBeCloseTo(0.1, 9);
  });
});

describe('Balance judge', () => {
  it('in balance and dead centre helps a little; time out costs up to OUT_COST; long enough out is a barn door', () => {
    expect(judgeBalance({ kind: 'balance', out_ms: 0, place: 0 })).toEqual({ delta: 0.03, barn: false });
    expect(judgeBalance({ kind: 'balance', out_ms: OUT_FULL_MS, place: 1 / 3 }).delta).toBeCloseTo(-OUT_COST, 9);
    expect(judgeBalance({ kind: 'balance', out_ms: BARN_MS, place: 0 }).barn).toBe(true);
  });
});

describe('Balance in the attempt loop', () => {
  /** A run where the bot's next move is a Balance move (Slab Wizard on slab sectors). */
  function atBalance(seed: string): { run: RunState; move: Move } {
    const run = createRun(seed, presetSpec('slab_wizard'), bundle);
    for (let day = 0; day < 10; day++) {
      for (const sector of sectorList(run, bundle).filter((x) => x.open)) {
        if (run.res.energy < 30) break;
        applyAction(run, { t: 'block_start', kind: 'climb', target: sector.id }, bundle);
        for (const slot of run.block!.session!.slots) {
          applyAction(run, { t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' }, bundle);
          for (let g = 0; g < 60 && run.attempt; g++) {
            const a = autoClimbAction(run, bundle, { bot: true });
            if (a?.t === 'move' && balanceSetup(run, a.limb, a.hold, a.class, bundle)) return { run, move: a };
            applyAction(run, a ?? { t: 'wall_action', kind: 'jump_off' }, bundle);
          }
          if (run.attempt) applyAction(run, { t: 'wall_action', kind: 'jump_off' }, bundle);
          if (run.res.energy < 30) break;
        }
        applyAction(run, { t: 'block_end' }, bundle);
        break;
      }
      applyAction(run, { t: 'end_day' }, bundle);
    }
    throw new Error('no balance move found');
  }
  const after = (base: RunState, m: Move) => { const r = structuredClone(base); applyAction(r, m, bundle); return r; };
  const lastMove = (run: RunState) => [...(run.attempt?.log ?? run.last_attempt!.log)].reverse().find((r) => r.kind === 'move' && r.margin !== undefined)!;

  it('a Balance move has a base, a drift and a stance the test flagged', () => {
    const { run, move } = atBalance('bal-setup');
    const b = balanceSetup(run, move.limb, move.hold, move.class, bundle)!;
    expect(b.stance.balance).toBe(true);
    expect(b.stance.angle).toBeLessThanOrEqual(90);
    expect(b.drift).toBeGreaterThan(0);
    const ath = athleteOf(run, bundle);
    expect(driftSpeed(ath, 70, 0, 0)).toBeGreaterThan(driftSpeed(ath, 90, 0, 0));
  });

  it('time out of balance costs margin; a barn door does not land; a Reach perf is refused', () => {
    const { run, move } = atBalance('bal-judge');
    const m0 = lastMove(after(run, move)).margin!;
    const steady = lastMove(after(run, { ...move, perf: { kind: 'balance', out_ms: 0, place: 1 / 3 } })).margin!;
    expect(steady - m0).toBeCloseTo(0, 9);
    const wobbly = lastMove(after(run, { ...move, perf: { kind: 'balance', out_ms: OUT_FULL_MS, place: 1 / 3 } })).margin!;
    expect(wobbly - m0).toBeCloseTo(-OUT_COST, 9);
    const barn = lastMove(after(run, { ...move, perf: { kind: 'balance', out_ms: BARN_MS + 100, place: 0 } }));
    expect(['slip_recovered', 'fall']).toContain(barn.outcome);
    expect(barn.text).toMatch(/barn/i);
    expect(() => after(run, { ...move, perf: { kind: 'reach', time_ms: 500, place: 0 } })).toThrow(InvalidAction);
  });
});
