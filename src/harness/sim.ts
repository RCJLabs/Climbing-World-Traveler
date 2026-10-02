// Shared harness helpers (docs/19): synthetic runs for arbitrary athletes, single dice attempts through the
// real attempt loop, and the commit-window timing models of 19 §3.

import { autoClimbAction, doCommit, doMove, doWallAction, registerRoute, startAttempt } from '../sim/attempt';
import type { Athlete } from '../sim/character';
import { DEFAULT_OPTIONS, presetSpec } from '../sim/presets';
import { stream, type Rng } from '../sim/rng';
import { createRun } from '../sim/run';
import type { AttemptResult, RunState } from '../sim/state';
import { ALL_ATTRS, type DataBundle, type Route } from '../sim/types';

export type Timing = 'auto' | 'novice' | 'average' | 'expert' | 'oracle';

/** 19 §3: tap offset ~ N(μ, σ) around the target centre, in ms. */
export const TIMING: Record<Exclude<Timing, 'auto' | 'oracle'>, { mu: number; sd: number }> = {
  novice: { mu: 35, sd: 95 },
  average: { mu: 12, sd: 55 },
  expert: { mu: 4, sd: 28 },
};

/** A run whose climber is exactly `ath` (attributes, body, no traits), on a neutral sending-temperature day. */
export function syntheticRun(ath: Athlete, seed: string, bundle: DataBundle, traits: string[] = []): RunState {
  const run = createRun(seed, presetSpec('dirtbag', { ...DEFAULT_OPTIONS, auto_commit: true }), bundle);
  run.body = { ...ath.body };
  run.traits = traits;
  for (const id of ALL_ATTRS) run.attrs[id] = { value: ath.a[id], ceiling: 100, pending: 0, last_stim_day: 0 };
  run.weather = { day: 0, sky: 'clear', t_max: 12, t_min: 12, rh: 60, wind: 0, precip_mm: 0, noise: 0 };
  run.last_rain = null;
  return run;
}

/** Put a synthetic run at the route's sector with a one-slot session, fresh resources. */
export function atRoute(run: RunState, route: Route): void {
  run.blocks_today = ['climb'];
  run.block = {
    kind: 'climb', target: route.area,
    session: {
      sector: route.area, E: 0, slots: [{ seed: route.seed ?? route.id, kind: 'mid', di_target: route.di_target }],
      attempts: 0, sends: 0, di_sum: 0, hard_moves: 0, hand_moves: 0, pump_total: 0, time_s: 0, progress_made: false,
      stim: {}, xp: {}, load: 0, energy_spent: 0,
    },
  };
  run.res.energy = 100;
  run.res.skin = 100;
}

/**
 * One attempt through the real reducer path, bot policy, at familiarity 0 (each call forgets the project).
 * `k` varies the dice: it becomes part of the run seed.
 */
export function diceAttempt(base: RunState, route: Route, k: number, bundle: DataBundle, timing: Timing = 'auto', tapRng?: Rng): AttemptResult {
  const run = structuredClone(base);
  run.seed = `${base.seed}:${k}`;
  run.options.auto_commit = timing === 'auto';
  atRoute(run, route);
  delete run.projects[route.id];
  registerRoute(route);
  const seed = route.seed ?? route.id;
  startAttempt(run, seed, 'redpoint', bundle);
  const rng = tapRng ?? stream('taps', run.seed);
  for (let guard = 0; guard < 150 && run.attempt; guard++) {
    const at = run.attempt;
    if (at.pending && timing !== 'auto') {
      const w = at.pending.window;
      let offset: number;
      if (timing === 'oracle') offset = 0;
      else {
        const m = TIMING[timing];
        offset = Math.max(-w.centre_ms, Math.min(w.effective_ms - w.centre_ms, rng.normal(m.mu, m.sd)));
      }
      doCommit(run, Math.round(offset), bundle);
      continue;
    }
    const a = autoClimbAction(run, bundle, { bot: true });
    if (!a || a.t === 'commit') { doCommit(run, null, bundle); continue; }
    if (a.t === 'move') doMove(run, a.limb, a.hold, a.class, bundle);
    else if (a.t === 'wall_action') doWallAction(run, a.kind, bundle);
  }
  if (run.attempt) doWallAction(run, 'jump_off', bundle);
  return run.last_attempt!;
}

export const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const quantile = (xs: readonly number[], q: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i]!;
};
