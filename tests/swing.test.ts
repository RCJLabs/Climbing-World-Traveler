// Swing and Catch in the engine (docs/23 §3.3): the pull and the grab map onto the 05b §8.3 commit outcomes, the
// pull a dyno needs follows its margin, and a logged swing replays to the same move.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { autoClimbAction } from '../src/sim/attempt';
import { presetSpec } from '../src/sim/presets';
import { applyAction, createRun, sectorList } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import { fly, goodSwing, judgeSwing, launchVelocity, SLAP_MS, swingSetup, type SwingInputs } from '../src/sim/swing';
import type { Action } from '../src/sim/types';

const bundle = loadBundle(false);

/** A dyno 1.3 reaches long, straight up, from a centre of mass at 1 m. */
const inputs = (margin: number): SwingInputs => ({
  com0: { x: 0, s: 1 }, shoulderAt: { x: 0, s: 1.55 }, hold: { x: 0.1, s: 1.55 + 1.3 * 0.7 }, reach: 0.7,
  margin, T: 1, pump: 10, contact: 50, catchMult: 1, pApexAuto: 0.45,
});

describe('Swing and Catch judge', () => {
  it('a good launch grabbed at its dead point is the apex catch', () => {
    const st = swingSetup(inputs(0));
    expect(judgeSwing(st, goodSwing(st)).outcome).toBe('apex');
  });

  it('a weak pull never gets there: a cut', () => {
    const st = swingSetup(inputs(0));
    expect(judgeSwing(st, { power: 0.5 * st.p_need, angle_deg: st.angle_good, catch_ms: 300 })).toMatchObject({ outcome: 'cut', reason: 'short' });
  });

  it('slaps just outside the window, cuts further out, and cuts without a grab', () => {
    const st = swingSetup(inputs(0));
    const g = goodSwing(st);
    const [, t2] = fly(st, launchVelocity(st, g.power, g.angle_deg)).window!;
    const late = (ms: number) => judgeSwing(st, { ...g, catch_ms: Math.round(t2 * 1000 + ms) }).outcome;
    expect(late(SLAP_MS / 2)).toBe('slap');
    expect(late(SLAP_MS * 2)).toBe('cut');
    expect(judgeSwing(st, { ...g, catch_ms: null }).outcome).toBe('cut');
  });

  it('a harder dyno needs more of a full pull', () => {
    expect(swingSetup(inputs(-1)).p_need).toBeGreaterThan(swingSetup(inputs(0)).p_need);
    expect(swingSetup(inputs(0)).p_need).toBeGreaterThan(swingSetup(inputs(1)).p_need);
  });
});

describe('Swing and Catch in the attempt loop', () => {
  /** Climb with the bot, but swing every dyno with the good swing; returns the actions and the final run. */
  function climb(seed: string): { run: RunState; log: Action[]; swung: number } {
    const run = createRun(seed, presetSpec('power_boulderer'), bundle);
    const log: Action[] = [];
    const go = (a: Action) => { log.push(a); applyAction(run, a, bundle); };
    let swung = 0;
    for (let day = 0; day < 6 && swung === 0; day++) {
      const sector = sectorList(run, bundle).find((x) => x.open)?.id;
      if (!sector || run.res.energy < 50) { go({ t: 'end_day' }); continue; }
      go({ t: 'block_start', kind: 'climb', target: sector });
      for (const slot of run.block!.session!.slots.slice(0, 4)) {
        if (!run.block) break;
        go({ t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' });
        for (let g = 0; g < 200 && run.attempt; g++) {
          if (run.attempt.pending) { swung++; go({ t: 'commit', swing: goodSwing(run.attempt.pending.swing) }); continue; }
          go(autoClimbAction(run, bundle, { bot: true }) ?? { t: 'wall_action', kind: 'jump_off' });
        }
      }
      if (run.block) go({ t: 'block_end' });
      go({ t: 'end_day' });
    }
    return { run, log, swung };
  }

  it('records the swing as a commit and replays it to the same state', () => {
    const a = climb('swing-replay');
    expect(a.swung).toBeGreaterThan(0);
    expect(a.log.some((x) => x.t === 'commit' && x.swing !== null)).toBe(true);
    const b = createRun('swing-replay', presetSpec('power_boulderer'), bundle);
    for (const x of a.log) applyAction(b, x, bundle);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a.run));
  });
});
