// One headless career (docs/19 §1): a sampled or fixed build played by the bot for N days, with monthly
// samples of estimate, personal best, money and stress, and an optional replay-identity check. A career with `life`
// (P2 M0) also retires by 19 §1's rule and travels with the seasons, so it can run for years.

import { athleteOf } from '../sim/attempt';
import { BotDriver, PLAN_POLICY, PROJECT_POLICY, VOLUME_POLICY, type BotPolicy } from '../sim/bot';
import { estimateBoulderDI } from '../sim/estimate';
import { cyrb53 } from '../sim/rng';
import { applyAction, createRun, estimateDI, replay } from '../sim/run';
import type { Action, DataBundle, NewRunSpec, RunSummary } from '../sim/types';

/**
 * Routes a harness worker keeps built (06 §5, P2): every sector's catalogue at both crags (5,800 routes) and the
 * signatures, so each route is built once per worker and every later career that climbs it reuses it. At most about
 * 0.4 GB (a pitch with its geometry is about 0.2 MB, a problem a tenth of that).
 */
export const HARNESS_ROUTE_CACHE = 8000;

/** The bot policies a career can play (docs/19 §1): its own rules for projects or mileage, or the game's default week. */
export type CareerPolicy = 'project' | 'volume' | 'plan';
const POLICIES: Record<CareerPolicy, BotPolicy> = { project: PROJECT_POLICY, volume: VOLUME_POLICY, plan: PLAN_POLICY };

/** Where each discipline's estimate is read in a sample: the benchmark sets of the crags that define it today. */
export const ESTIMATE_CRAGS = { boulder: 'fontainebleau', route: 'kalymnos' } as const;

/**
 * Days between samples: monthly for a year's run (the report's monthly table), every 13 weeks beyond, where the
 * report reads years. A sample on a week's first day reuses the week's estimate (06 §5), which is the same number.
 */
export const SAMPLE_DAYS = { year: 30, career: 91 } as const;

export interface CareerConfig {
  seed: string;
  spec: NewRunSpec;
  days: number;
  policy: CareerPolicy;
  /** Retire by 19 §1's rule and travel with the seasons (P2 M0). Off, the career stays where it starts for `days`. */
  life?: boolean;
  checkReplay?: boolean;
  /** Skip the creation rules: the re-costing's paired builds (docs/19 §4) may exceed the trait budget. */
  unchecked?: boolean;
}

export interface CareerSample {
  day: number;
  crag: string;
  /** The estimate at the crag the climber is at, and in each discipline (ESTIMATE_CRAGS) wherever the climber is. */
  E: number;
  Eb: number;
  Er: number;
  /** The personal best of the crag's discipline, and of each. */
  pb: number;
  pb_boulder: number;
  pb_route: number;
  money: number;
  stoke: number;
  burnout: number;
}

export interface CareerResult {
  seed: string;
  /** Where the career started; routes at a sport crag (P1b). */
  crag: string;
  sport: boolean;
  background: string;
  /** The traits at creation; `evolved` lists what evolution made of them (03 §1.7), in order. */
  traits: string[];
  evolved: { day: number; from: string; to: string | null }[];
  age: number;
  height: number;
  policy: string;
  E0: number;
  /** A sample every 30 days of the run, or every 13 weeks in a career longer than a year (SAMPLE_DAYS). */
  months: CareerSample[];
  /** The career's hardest first send in its start discipline, and its hardest first go: the onsight on routes, the flash (onsight or flash) on boulders, as the P1a report had it. */
  hardest: number;
  hardest_onsight: number;
  summary: RunSummary;
  /** The run reached the day limit and the harness retired it; otherwise it ended by its own rules. */
  limit: boolean;
  /** How the career ended: the day limit, the bot's retirement rule (19 §1: age or burnout), or the run's own end. */
  ended_by: 'limit' | 'retired_age' | 'retired_burnout' | RunSummary['end_reason'];
  /** Trips taken, and days spent at each crag (a trip's days count at the destination). */
  trips: number;
  days_at: Record<string, number>;
  climb_days: number;
  attempts: number;
  sends: number;
  train_blocks: number;
  work_blocks: number;
  burnout_max: number;
  actions: number;
  replay_ok: boolean | null;
  ms: number;
}

export function runCareer(cfg: CareerConfig, bundle: DataBundle): CareerResult {
  const t0 = performance.now();
  const spec = cfg.spec;
  const run = createRun(cfg.seed, spec, bundle, { unchecked: cfg.unchecked ?? false });
  const bot = new BotDriver(run, bundle, POLICIES[cfg.policy], { retire: !!cfg.life, travel: !!cfg.life });
  const E0 = estimateDI(run, bundle);
  const startCrag = run.crag;
  const sport = !bundle.crags.get(startCrag)!.disciplines.includes('boulder');
  const months: CareerSample[] = [];
  const traits = [...run.traits];
  const evolved: CareerResult['evolved'] = [];
  const daysAt: Record<string, number> = {};
  let trips = 0;
  let burnoutMax = 0;
  const every = cfg.days > 365 ? SAMPLE_DAYS.career : SAMPLE_DAYS.year;
  let nextSample = every;
  while (run.day < cfg.days && !run.ended) {
    const before = run.traits;
    const day = run.day;
    const crag = run.crag;
    bot.day();
    if (run.crag !== crag) trips++;
    daysAt[run.crag] = (daysAt[run.crag] ?? 0) + (run.day - day);
    // Only an evolution replaces the trait list (evolve.ts); a stage goes to the trait its evolution names, or nowhere.
    if (run.traits !== before) {
      for (const from of before.filter((t) => !run.traits.includes(t))) {
        const next = new Set(bundle.traits.get(from)?.evolves_to?.map((e) => e.trait));
        evolved.push({ day, from, to: run.traits.find((t) => !before.includes(t) && next.has(t)) ?? null });
      }
    }
    burnoutMax = Math.max(burnoutMax, run.res.burnout);
    if (run.day >= nextSample && !run.ended) {
      nextSample += every;
      const ath = athleteOf(run, bundle);
      const atSport = !bundle.crags.get(run.crag)!.disciplines.includes('boulder');
      // On a week's first day the week's estimate is this one (estimateDI on the same climber at the same crag), and the
      // estimate here is one of the two disciplines' when the climber is at either crag.
      const E = run.day % 7 === 0 && run.est !== null ? run.est : estimateDI(run, bundle);
      const Eb = run.crag === ESTIMATE_CRAGS.boulder ? E : estimateBoulderDI(ath, ESTIMATE_CRAGS.boulder, bundle);
      const Er = run.crag === ESTIMATE_CRAGS.route ? E : estimateBoulderDI(ath, ESTIMATE_CRAGS.route, bundle);
      months.push({
        day: run.day, crag: run.crag, E, Eb, Er,
        pb: atSport ? run.pb_route : run.pb, pb_boulder: run.pb, pb_route: run.pb_route,
        money: run.res.money, stoke: run.res.stoke, burnout: run.res.burnout,
      });
    }
  }
  const limit = !run.ended;
  if (limit) { applyAction(run, { t: 'retire' }, bundle); bot.log.push({ t: 'retire' }); }
  let replayOk: boolean | null = null;
  if (cfg.checkReplay) {
    const log: Action[] = [{ t: 'new_run', seed: cfg.seed, spec }, ...bot.log];
    replayOk = cyrb53(JSON.stringify(replay(log, bundle))) === cyrb53(JSON.stringify(run));
  }
  return {
    seed: cfg.seed, crag: startCrag, sport, background: spec.background, traits, evolved, age: spec.body.age_start,
    height: spec.body.height_cm, policy: cfg.policy, E0, months, summary: run.ended!, limit, trips, days_at: daysAt,
    ended_by: limit ? 'limit' : bot.retired === 'age' ? 'retired_age' : bot.retired === 'burnout' ? 'retired_burnout' : run.ended!.end_reason,
    climb_days: run.counters.climb_days,
    hardest: sport ? run.ended!.hardest_route : run.ended!.hardest,
    hardest_onsight: sport ? run.ended!.hardest_route_onsight : run.ended!.hardest_flash,
    attempts: run.counters.attempts, sends: run.counters.sends, train_blocks: run.counters.train_blocks, work_blocks: run.counters.work_blocks,
    burnout_max: burnoutMax, actions: run.actions, replay_ok: replayOk, ms: performance.now() - t0,
  };
}
