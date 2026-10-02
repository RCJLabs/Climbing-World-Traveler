// One headless career (docs/19 §1): a sampled or fixed build played by the bot for N days, with monthly
// samples of estimate, personal best, money and stress, and an optional replay-identity check.

import { BotDriver, PROJECT_POLICY, VOLUME_POLICY, type BotPolicy } from '../sim/bot';
import { cyrb53, stream } from '../sim/rng';
import { applyAction, createRun, estimateDI, replay } from '../sim/run';
import type { Action, DataBundle, NewRunSpec, RunSummary } from '../sim/types';
import { harnessSwing, type Timing } from './sim';

export interface CareerConfig {
  seed: string;
  spec: NewRunSpec;
  days: number;
  policy: 'project' | 'volume';
  timing: Timing;
  checkReplay?: boolean;
}

export interface CareerResult {
  seed: string;
  background: string;
  traits: string[];
  age: number;
  height: number;
  policy: string;
  timing: Timing;
  E0: number;
  months: { day: number; E: number; pb: number; money: number; stoke: number; burnout: number }[];
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
  const spec = { ...cfg.spec, options: { ...cfg.spec.options, auto_commit: cfg.timing === 'auto' } };
  const run = createRun(cfg.seed, spec, bundle);
  const base: BotPolicy = cfg.policy === 'project' ? PROJECT_POLICY : VOLUME_POLICY;
  const policy: BotPolicy = cfg.timing === 'auto' ? base : {
    ...base,
    swing: (r) => {
      const at = r.attempt!;
      return harnessSwing(at.pending!.swing, cfg.timing, stream('harness-swing', r.seed, at.route_id, at.attempt_index, at.move_index));
    },
  };
  const bot = new BotDriver(run, bundle, policy);
  const E0 = estimateDI(run, bundle);
  const months: CareerResult['months'] = [];
  let burnoutMax = 0;
  for (let d = 0; d < cfg.days && !run.ended; d++) {
    bot.day();
    burnoutMax = Math.max(burnoutMax, run.res.burnout);
    if ((d + 1) % 30 === 0 && !run.ended) {
      months.push({ day: run.day, E: estimateDI(run, bundle), pb: run.pb, money: run.res.money, stoke: run.res.stoke, burnout: run.res.burnout });
    }
  }
  if (!run.ended) { applyAction(run, { t: 'retire' }, bundle); bot.log.push({ t: 'retire' }); }
  let replayOk: boolean | null = null;
  if (cfg.checkReplay) {
    const log: Action[] = [{ t: 'new_run', seed: cfg.seed, spec }, ...bot.log];
    replayOk = cyrb53(JSON.stringify(replay(log, bundle))) === cyrb53(JSON.stringify(run));
  }
  return {
    seed: cfg.seed, background: spec.background, traits: run.traits, age: spec.body.age_start, height: spec.body.height_cm,
    policy: cfg.policy, timing: cfg.timing, E0, months, summary: run.ended!, climb_days: run.counters.climb_days,
    attempts: run.counters.attempts, sends: run.counters.sends, train_blocks: run.counters.train_blocks, work_blocks: run.counters.work_blocks,
    burnout_max: burnoutMax, actions: run.actions, replay_ok: replayOk, ms: performance.now() - t0,
  };
}
