// A scripted climber for the headless harness and tests (docs/19 §1). It decides its days by state-driven rules
// rather than a week plan, and plays every session through the same tactics the game's simulated days use. It only
// emits ordinary actions through the reducer, so every bot career is a valid, replayable action log.

import { applyAction, canStartBlock, dailyCost, sectorList } from './run';
import type { RunState } from './state';
import { nextSessionAttempt, pickSector } from './tactics';
import type { Action, DataBundle, SessionTactic } from './types';

export interface BotPolicy {
  /** 'project' tries the hardest slots repeatedly; 'volume' climbs many easier problems once or twice (docs/24 §3). */
  style: SessionTactic;
  /** Work when money covers fewer than this many days of living costs (19 §1: 60). */
  workBelowDays: number;
  /** Rest-day rhythm: rest after this many consecutive climbing days. */
  climbDaysInARow: number;
  /** Train on days the forest is shut (activity ids from training.ts). */
  wetDayTraining: string[];
}

export const PROJECT_POLICY: BotPolicy = { style: 'project', workBelowDays: 60, climbDaysInARow: 3, wetDayTraining: ['limit_boulders', 'max_hangs', 'weights'] };
export const VOLUME_POLICY: BotPolicy = { style: 'volume', workBelowDays: 60, climbDaysInARow: 3, wetDayTraining: ['arc', 'skill_drills', 'repeaters'] };

export class BotDriver {
  readonly log: Action[] = [];
  private streak = 0;
  constructor(public run: RunState, private bundle: DataBundle, private policy: BotPolicy) {}

  dispatch(a: Action): void {
    applyAction(this.run, a, this.bundle);
    this.log.push(a);
  }

  /** Play one whole day and settle it. */
  day(): void {
    const run = this.run;
    if (run.ended) return;
    const cost = dailyCost(run, this.bundle);
    const low = run.res.money < this.policy.workBelowDays * cost;
    const broke = run.res.money < 20 * cost;
    const open = sectorList(run, this.bundle).filter((s) => s.open);
    const wantRest = this.streak >= this.policy.climbDaysInARow || run.res.skin < 35 || run.res.burnout > 60;
    const work = () => { if (canStartBlock(run, 'work', undefined, this.bundle).ok) this.dispatch({ t: 'block_start', kind: 'work' }); };
    if (open.length && !wantRest && !broke && canStartBlock(run, 'climb', open[0]!.id, this.bundle).ok) {
      this.dispatch({ t: 'block_start', kind: 'climb', target: pickSector(run, this.bundle)! });
      for (let a = nextSessionAttempt(run, this.bundle, this.policy.style); a; a = nextSessionAttempt(run, this.bundle, this.policy.style)) {
        this.dispatch({ t: 'attempt', ...a });
      }
      this.dispatch({ t: 'block_end' });
      this.streak++;
      if (low) work();
    } else if (low) {
      // A day off the rock while money is short is a working day: two odd jobs when energy allows.
      work();
      work();
      this.streak = 0;
    } else if (!open.length && !wantRest) {
      const act = this.policy.wetDayTraining[run.day % this.policy.wetDayTraining.length]!;
      if (canStartBlock(run, 'train', act, this.bundle).ok) this.dispatch({ t: 'block_start', kind: 'train', target: act });
      this.streak = 0;
    } else {
      this.dispatch({ t: 'block_start', kind: 'rest' });
      this.streak = 0;
    }
    this.dispatch({ t: 'end_day' });
  }
}
