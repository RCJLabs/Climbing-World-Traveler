// A scripted climber for the headless harness and tests (docs/19 §1). It decides its days by state-driven rules
// rather than a week plan, and plays every session through the same tactics the game's simulated days use. It only
// emits ordinary actions through the reducer, so every bot career is a valid, replayable action log. The `plan`
// policy follows the game's own week plan instead (docs/24 §2), so the careers the game starts are measured too.

import { ageOf } from './attempt';
import { applyAction, canStartBlock, dailyCost, sectorList, travelBlock } from './run';
import type { RunState } from './state';
import { nextSessionAttempt, pickSector, simulateDays } from './tactics';
import { destinations } from './travel';
import type { Action, DataBundle, SessionTactic } from './types';
import { calendarDate } from './weather';

export interface BotPolicy {
  /** 'project' tries the hardest slots repeatedly; 'volume' climbs many easier problems once or twice (docs/24 §3). */
  style: SessionTactic;
  /** Work when money covers fewer than this many days of living costs (19 §1: 60). */
  workBelowDays: number;
  /** Rest-day rhythm: rest after this many consecutive climbing days. */
  climbDaysInARow: number;
  /** Train on days the forest is shut (activity ids from training.ts). */
  wetDayTraining: string[];
  /** Follow the run's week plan (docs/24 §2) instead of the rules above: the player's default week. */
  plan?: boolean;
}

export const PROJECT_POLICY: BotPolicy = { style: 'project', workBelowDays: 60, climbDaysInARow: 3, wetDayTraining: ['limit_boulders', 'max_hangs', 'weights'] };
export const VOLUME_POLICY: BotPolicy = { style: 'volume', workBelowDays: 60, climbDaysInARow: 3, wetDayTraining: ['arc', 'skill_drills', 'repeaters'] };
/** The game's default week (24 §2.2) as a harness policy (docs/19 §1, P2 M0). */
export const PLAN_POLICY: BotPolicy = { ...VOLUME_POLICY, plan: true };

/** A climber whose trait evolves by practice falls (03 §1.7) spends one rest day a week falling on purpose instead. */
export const FALL_PRACTICE_EVERY_DAYS = 7;

/**
 * A whole career's choices beyond the day (docs/19 §1, P2 M0): retire at RETIRE_AGE, or after RETIRE_BURNOUT_DAYS days
 * in a row with burnout over RETIRE_BURNOUT; and travel with the seasons when a month starts. Away from home (the
 * start crag), go home once its season scores at least 2 and no less than here; otherwise, with the crag out of
 * season (score ≤ 1), go to the cheapest crag in season (≥ 2). A trip is taken only if the fare leaves
 * TRAVEL_RESERVE_DAYS of living costs. With Font and Kalymnos alone, a Kalymnos climber winters at Font and Font
 * climbers stay.
 */
export interface BotLife { retire: boolean; travel: boolean }
export const RETIRE_AGE = 55;
export const RETIRE_BURNOUT = 85;
export const RETIRE_BURNOUT_DAYS = 60;
/**
 * Living costs a trip must leave in hand. The bot works whenever money covers fewer than `workBelowDays` (60), so its
 * money settles about there: a trip that had to leave 60 days stranded every climber who could not save beyond it,
 * and Kalymnos climbers who wintered at Font never went home. The bot's broke line instead; it works the fare off.
 * **(tune)**
 */
export const TRAVEL_RESERVE_DAYS = 20;

/** Where a career's climber goes in `month` (0 = January) by the seasons rule above, or null to stay. */
export function seasonalTrip(run: RunState, bundle: DataBundle, month: number): string | null {
  const season = (crag: string) => bundle.crags.get(crag)!.season[month]!;
  const reserve = TRAVEL_RESERVE_DAYS * dailyCost(run, bundle);
  const trips = destinations(run.crag, bundle)
    .filter((t) => run.res.money - t.cost >= reserve && !travelBlock(run, t.to, bundle))
    .sort((a, b) => a.cost - b.cost || a.days - b.days || (a.to < b.to ? -1 : 1));
  const home = run.visited[0]!;
  const here = season(run.crag);
  if (run.crag !== home && season(home) >= 2 && season(home) >= here && trips.some((t) => t.to === home)) return home;
  if (here > 1) return null;
  return trips.find((t) => season(t.to) >= 2)?.to ?? null;
}

export class BotDriver {
  readonly log: Action[] = [];
  private streak = 0;
  private lastFallPractice = -Infinity;
  private highBurnout = 0;
  private lastMonth = -1;
  /** Why the bot retired the climber, when it did (19 §1). */
  retired: 'age' | 'burnout' | null = null;
  constructor(public run: RunState, private bundle: DataBundle, private policy: BotPolicy, private life: BotLife = { retire: false, travel: false }) {}

  dispatch(a: Action): void {
    applyAction(this.run, a, this.bundle);
    this.log.push(a);
  }

  /** Play one whole day and settle it, or retire, or set off on a trip (which takes its own days). */
  day(): void {
    const run = this.run;
    if (run.ended) return;
    if (this.life.retire && (ageOf(run) >= RETIRE_AGE || this.highBurnout >= RETIRE_BURNOUT_DAYS)) {
      this.retired = ageOf(run) >= RETIRE_AGE ? 'age' : 'burnout';
      this.dispatch({ t: 'retire' });
      return;
    }
    if (this.life.travel) {
      const to = this.seasonalTrip();
      if (to) {
        this.dispatch({ t: 'travel', to });
        this.streak = 0;
        return;
      }
    }
    if (this.policy.plan) {
      for (const a of simulateDays(run, this.bundle, 1)) this.log.push(a);
    } else {
      this.botDay();
    }
    this.highBurnout = run.res.burnout > RETIRE_BURNOUT ? this.highBurnout + 1 : 0;
  }

  /** The crag to travel to when a month starts, or null to stay (docs/19 §1). */
  private seasonalTrip(): string | null {
    const run = this.run;
    const month = calendarDate(run.start_month, run.start_dom, run.day).month;
    if (month === this.lastMonth) return null;
    this.lastMonth = month;
    return seasonalTrip(run, this.bundle, month);
  }

  /** The bot's own day: climb, work, train or rest by the state-driven rules (docs/19 §1). */
  private botDay(): void {
    const run = this.run;
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
      const practise = run.day - this.lastFallPractice >= FALL_PRACTICE_EVERY_DAYS && run.res.burnout <= 60
        && run.traits.some((id) => this.bundle.traits.get(id)?.evolves_to?.some((e) => e.needs.some((x) => x.counter === 'practice_falls')))
        && canStartBlock(run, 'train', 'fall_practice', this.bundle).ok;
      if (practise) {
        this.dispatch({ t: 'block_start', kind: 'train', target: 'fall_practice' });
        this.lastFallPractice = run.day;
      } else this.dispatch({ t: 'block_start', kind: 'rest' });
      this.streak = 0;
    }
    this.dispatch({ t: 'end_day' });
  }
}
