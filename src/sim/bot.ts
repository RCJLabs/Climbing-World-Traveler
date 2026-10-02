// A scripted player for tests and the headless harness (docs/19 §1). It only emits ordinary actions through
// the reducer, so every bot career is a valid, replayable action log.

import { autoClimbAction, athleteOf, routeEntry } from './attempt';
import { applyAction, canStartBlock, sectorList } from './run';
import type { RunState } from './state';
import type { Action, DataBundle } from './types';

export interface BotPolicy {
  /** 'project' tries the hardest slots repeatedly; 'volume' climbs many easier problems once or twice. */
  style: 'project' | 'volume';
  /** Take an odd job as the second block when money is below this. */
  workBelow: number;
  /** Rest-day rhythm: rest after this many consecutive climbing days. */
  climbDaysInARow: number;
  /** Train on days the forest is shut (activity ids from training.ts). */
  wetDayTraining: string[];
  /** Commit-window timing: null = Auto-commit; otherwise tap offsets drawn by the harness (19 §3). */
  tap?: (run: RunState) => number | null;
}

export const PROJECT_POLICY: BotPolicy = { style: 'project', workBelow: 400, climbDaysInARow: 3, wetDayTraining: ['limit_boulders', 'max_hangs', 'weights'] };
export const VOLUME_POLICY: BotPolicy = { style: 'volume', workBelow: 400, climbDaysInARow: 3, wetDayTraining: ['arc', 'skill_drills', 'repeaters'] };

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
    const sectors = sectorList(run, this.bundle).filter((s) => s.open);
    const wantRest = this.streak >= this.policy.climbDaysInARow || run.res.skin < 35 || run.res.burnout > 60;
    if (sectors.length && !wantRest && canStartBlock(run, 'climb', sectors[0]!.id, this.bundle).ok) {
      const fresh = sectors.filter((s) => !run.counters.week_sectors.includes(s.id));
      const pick = (fresh.length ? fresh : sectors)[run.day % (fresh.length ? fresh.length : sectors.length)]!;
      this.dispatch({ t: 'block_start', kind: 'climb', target: pick.id });
      this.session();
      this.dispatch({ t: 'block_end' });
      this.streak++;
    } else if (!sectors.length && !wantRest && run.res.money > 100) {
      const act = this.policy.wetDayTraining[run.day % this.policy.wetDayTraining.length]!;
      if (canStartBlock(run, 'train', act, this.bundle).ok) this.dispatch({ t: 'block_start', kind: 'train', target: act });
      this.streak = 0;
    } else {
      this.dispatch({ t: 'block_start', kind: 'rest' });
      this.streak = 0;
    }
    if (run.res.money < this.policy.workBelow && canStartBlock(run, 'work', undefined, this.bundle).ok) {
      this.dispatch({ t: 'block_start', kind: 'work' });
    }
    this.dispatch({ t: 'end_day' });
  }

  private session(): void {
    const run = this.run;
    const s = run.block!.session!;
    const order = [...s.slots].sort((a, b) => {
      const want = this.policy.style === 'project' ? ['known', 'project', 'push', 'signature', 'mid', 'warmup'] : ['warmup', 'mid', 'signature', 'push', 'known', 'project'];
      return want.indexOf(a.kind) - want.indexOf(b.kind);
    });
    // Warm up on the easiest problem first, whatever the style.
    const warm = [...s.slots].sort((a, b) => a.di_target - b.di_target)[0];
    const queue = warm ? [warm, ...order.filter((x) => x !== warm)] : order;
    const E = s.E;
    for (const slot of queue) {
      if (this.tired()) break;
      if (slot.di_target > E + (this.policy.style === 'project' ? 4.5 : 1)) continue;
      const tries = this.policy.style === 'project' ? (slot.kind === 'warmup' ? 1 : 5) : 2;
      for (let i = 0; i < tries && !this.tired(); i++) {
        const { route } = routeEntry(slot.seed, this.bundle);
        const project = run.projects[route.id];
        if (project?.sent && slot.kind !== 'warmup') break;
        this.dispatch({ t: 'attempt_start', route_seed: slot.seed, mode: route.signature && !project ? 'flash' : 'onsight' });
        this.climb();
        if (run.last_attempt?.outcome === 'sent') break;
      }
    }
  }

  private tired(): boolean {
    return this.run.res.energy < 22 || this.run.res.skin < 12;
  }

  private climb(): void {
    for (let guard = 0; guard < 120 && this.run.attempt; guard++) {
      const at = this.run.attempt;
      if (at.pending && this.policy.tap) {
        this.dispatch({ t: 'commit', tap_offset_ms: this.policy.tap(this.run) });
        continue;
      }
      const a = autoClimbAction(this.run, this.bundle, { bot: true });
      this.dispatch(a ?? { t: 'wall_action', kind: 'jump_off' });
    }
    if (this.run.attempt) this.dispatch({ t: 'wall_action', kind: 'jump_off' });
  }
}

/** Estimated boulder DI right now (02 §C.3), for harness reports. */
export { athleteOf };
