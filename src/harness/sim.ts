// Shared harness helpers (docs/19): synthetic runs for arbitrary athletes, single dice attempts through the
// real attempt loop, and the commit-window timing models of 19 §3.

import { autoClimbAction, doCommit, doMove, doWallAction, registerRoute, startAttempt } from '../sim/attempt';
import { NEUTRAL_MODS, refMass, type Athlete } from '../sim/character';
import { REFERENCE_BODY } from '../sim/grade';
import { DEFAULT_OPTIONS, presetSpec } from '../sim/presets';
import { stream, type Rng } from '../sim/rng';
import { createRun } from '../sim/run';
import type { AttemptResult, RunState } from '../sim/state';
import { ALL_ATTRS, type AttrId, type DataBundle, type Route } from '../sim/types';

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

function athlete(a: Partial<Record<AttrId, number>>, body: Partial<Athlete['body']>): Athlete {
  const vals = {} as Record<AttrId, number>;
  for (const id of ALL_ATTRS) vals[id] = a[id] ?? 30;
  // A real climber on the reference body: its lock-off reach comes from its own lockoff, not the pinned depth.
  const { lock_depth_m: _pinned, ...ref } = REFERENCE_BODY;
  const b = { ...ref, ...body };
  b.mass_kg = refMass(b.sex, b.height_cm) + (body.mass_kg ?? 0);
  return { body: b, a: vals, mods: NEUTRAL_MODS, rock_knowledge: {} };
}

/**
 * The two builds of 05b §14.1, climbers near Font 6B+: A "Compression Monster" and B "Crimp Machine".
 * Attributes the doc does not list default to 30. Used by calibration C9 and the exit-criterion test.
 */
export function workedExampleBuilds(): { A: Athlete; B: Athlete } {
  return {
    A: athlete({ contact_strength: 44, core_tension: 46, tech_slopers: 42, finger_strength: 24, lockoff: 30, tech_crimps: 16, body_position: 36, hip_mobility: 32, footwork: 26, tech_slab: 18, dynamic_movement: 34, leg_power: 34, finger_endurance: 30, shoulder_mobility: 38, anaerobic_capacity: 36, skin_durability: 30, composure: 50, focus: 40, commitment: 60 },
      { height_cm: 178, ape_index: 1.05, mass_kg: 4, finger_length: 1, skin_thickness: 'thin' }),
    B: athlete({ finger_strength: 46, tech_crimps: 44, lockoff: 42, contact_strength: 32, core_tension: 28, tech_slopers: 22, body_position: 34, hip_mobility: 28, footwork: 36, tech_slab: 26, dynamic_movement: 26, leg_power: 28, finger_endurance: 34, shoulder_mobility: 30, anaerobic_capacity: 30, skin_durability: 40, composure: 40, focus: 60, commitment: 35 },
      { height_cm: 168, ape_index: 1.0, finger_length: -1, finger_girth: 1, skin_thickness: 'thick' }),
  };
}
