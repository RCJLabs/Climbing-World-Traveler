// Playtest stats (docs/19 §3): replaying a run's log recovers every hand-played move with what it was judged
// against, and the summary sets the player beside the harness models.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { playtestRecords, quartiles, summarise } from '../src/harness/playtest';
import { REACH_SKILL } from '../src/harness/sim';
import { autoClimbAction, balanceSetup, reachBudget } from '../src/sim/attempt';
import { presetSpec } from '../src/sim/presets';
import { applyAction, createRun, sectorList } from '../src/sim/run';
import { goodSwing } from '../src/sim/swing';
import type { Action } from '../src/sim/types';

const bundle = loadBundle(false);

/** A few days of bot climbing with every move played by hand: 600 ms drags dead centre, short leans, good swings. */
function playedLog(): { log: Action[]; manual: number } {
  const seed = 'playtest-log';
  const run = createRun(seed, presetSpec('farm_kid'), bundle);
  const log: Action[] = [{ t: 'new_run', seed, spec: presetSpec('farm_kid') }];
  const go = (a: Action) => { log.push(a); applyAction(run, a, bundle); };
  let manual = 0;
  for (let day = 0; day < 4; day++) {
    const sector = sectorList(run, bundle).find((x) => x.open)?.id;
    if (!sector || run.res.energy < 50) { go({ t: 'end_day' }); continue; }
    go({ t: 'block_start', kind: 'climb', target: sector });
    for (const slot of run.block!.session!.slots.slice(0, 3)) {
      if (!run.block) break;
      go({ t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' });
      for (let g = 0; g < 200 && run.attempt; g++) {
        if (run.attempt.pending) { manual++; go({ t: 'commit', swing: goodSwing(run.attempt.pending.swing) }); continue; }
        const a = autoClimbAction(run, bundle, { bot: true }) ?? { t: 'wall_action', kind: 'jump_off' } as const;
        if (a.t !== 'move') { go(a); continue; }
        if (balanceSetup(run, a.limb, a.hold, a.class, bundle)) { manual++; go({ ...a, perf: { kind: 'balance', out_ms: 0, place: 0.1 } }); continue; }
        if (reachBudget(run, a.limb, a.hold, a.class, bundle) !== null) { manual++; go({ ...a, perf: { kind: 'reach', time_ms: 600, place: 0.1 } }); continue; }
        go(a);
      }
    }
    if (run.block) go({ t: 'block_end' });
    go({ t: 'end_day' });
  }
  return { log, manual };
}

describe('playtest stats', () => {
  it('recovers every hand-played move from the log, with what it was judged against', () => {
    const { log, manual } = playedLog();
    const recs = playtestRecords(log, bundle);
    expect(recs.filter((r) => !r.auto)).toHaveLength(manual);
    const reach = recs.find((r) => r.type === 'reach' && !r.auto && r.hand);
    expect(reach).toMatchObject({ time_ms: 600, place: 0.1 });
    if (reach?.type === 'reach') expect(reach.budget_ms).toBeGreaterThan(0);
    for (const r of recs) expect(r.outcome).toBeDefined();
    const dyno = recs.find((r) => r.type === 'dyno' && !r.auto);
    if (dyno?.type === 'dyno') expect(Math.abs(dyno.catch_ms! - dyno.dead_ms!)).toBeLessThanOrEqual(1);
  });

  it('sets 600 ms drags and dead-centre landings beside the expert model', () => {
    const s = summarise(playtestRecords(playedLog().log, bundle));
    expect(s.reach.manual).toBeGreaterThan(5);
    expect(s.reach.drag_ms?.p50).toBe(600);
    expect(REACH_SKILL.expert.mu).toBe(600);
    expect(s.reach.nearest_drag).toBe('expert');
    expect(s.reach.nearest_place).toBe('expert');
    expect(s.reach.centre).toBe(1);
  });

  it('quartiles of nothing is null', () => {
    expect(quartiles([])).toBeNull();
    expect(quartiles([3, 1, 2])).toEqual({ n: 3, p25: 2, p50: 2, p75: 3 });
  });
});
