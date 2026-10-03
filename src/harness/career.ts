// One headless career (docs/19 §1): a sampled or fixed build played by the bot for N days, with monthly
// samples of estimate, personal best, money and stress, and an optional replay-identity check.

import { BotDriver, PROJECT_POLICY, VOLUME_POLICY } from '../sim/bot';
import { cyrb53 } from '../sim/rng';
import { applyAction, createRun, estimateDI, replay } from '../sim/run';
import type { Action, DataBundle, NewRunSpec, RunSummary } from '../sim/types';

/**
 * Routes a harness worker keeps built (06 §5, P2): every sector's catalogue at both crags (5,800 routes) and the
 * signatures, so each route is built once per worker and every later career that climbs it reuses it. At most about
 * 0.4 GB (a pitch with its geometry is about 0.2 MB, a problem a tenth of that).
 */
export const HARNESS_ROUTE_CACHE = 8000;

export interface CareerConfig {
  seed: string;
  spec: NewRunSpec;
  days: number;
  policy: 'project' | 'volume';
  checkReplay?: boolean;
  /** Skip the creation rules: the re-costing's paired builds (docs/19 §4) may exceed the trait budget. */
  unchecked?: boolean;
}

export interface CareerResult {
  seed: string;
  /** Where the career was played; routes at a sport crag (P1b). */
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
  /** Monthly samples; `pb` is the career's discipline: boulders at a bouldering crag, routes at a sport crag. */
  months: { day: number; E: number; pb: number; money: number; stoke: number; burnout: number }[];
  /** The career's hardest first send in its discipline, and its hardest first go: the onsight on routes, the flash (onsight or flash) on boulders, as the P1a report had it. */
  hardest: number;
  hardest_onsight: number;
  summary: RunSummary;
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
  const bot = new BotDriver(run, bundle, cfg.policy === 'project' ? PROJECT_POLICY : VOLUME_POLICY);
  const E0 = estimateDI(run, bundle);
  const sport = !bundle.crags.get(run.crag)!.disciplines.includes('boulder');
  const months: CareerResult['months'] = [];
  const traits = [...run.traits];
  const evolved: CareerResult['evolved'] = [];
  let burnoutMax = 0;
  for (let d = 0; d < cfg.days && !run.ended; d++) {
    const before = run.traits;
    bot.day();
    // Only an evolution replaces the trait list (evolve.ts); a stage goes to the trait its evolution names, or nowhere.
    if (run.traits !== before) {
      for (const from of before.filter((t) => !run.traits.includes(t))) {
        const next = new Set(bundle.traits.get(from)?.evolves_to?.map((e) => e.trait));
        evolved.push({ day: d, from, to: run.traits.find((t) => !before.includes(t) && next.has(t)) ?? null });
      }
    }
    burnoutMax = Math.max(burnoutMax, run.res.burnout);
    if ((d + 1) % 30 === 0 && !run.ended) {
      months.push({ day: run.day, E: estimateDI(run, bundle), pb: sport ? run.pb_route : run.pb, money: run.res.money, stoke: run.res.stoke, burnout: run.res.burnout });
    }
  }
  if (!run.ended) { applyAction(run, { t: 'retire' }, bundle); bot.log.push({ t: 'retire' }); }
  let replayOk: boolean | null = null;
  if (cfg.checkReplay) {
    const log: Action[] = [{ t: 'new_run', seed: cfg.seed, spec }, ...bot.log];
    replayOk = cyrb53(JSON.stringify(replay(log, bundle))) === cyrb53(JSON.stringify(run));
  }
  return {
    seed: cfg.seed, crag: run.crag, sport, background: spec.background, traits, evolved, age: spec.body.age_start, height: spec.body.height_cm,
    policy: cfg.policy, E0, months, summary: run.ended!, climb_days: run.counters.climb_days,
    hardest: sport ? run.ended!.hardest_route : run.ended!.hardest,
    hardest_onsight: sport ? run.ended!.hardest_route_onsight : run.ended!.hardest_flash,
    attempts: run.counters.attempts, sends: run.counters.sends, train_blocks: run.counters.train_blocks, work_blocks: run.counters.work_blocks,
    burnout_max: burnoutMax, actions: run.actions, replay_ok: replayOk, ms: performance.now() - t0,
  };
}
