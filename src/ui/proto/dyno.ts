// Dyno prototype (docs/23 §6): the flight and catch model behind the throwaway Swing and Catch screen. Pure, so the
// numbers can be tested and tuned without a browser. Metres and seconds; X to the right, Y up. Not used by the engine:
// if the feel is right, this becomes the engine's dyno resolution (docs/23 §3.3).

import type { Rng } from '../../sim/rng';

export interface V2 { x: number; y: number }

/** The climber numbers that matter for a dyno, 0–100 except `ape` (span / height). */
export interface DynoStats { power: number; contact: number; commitment: number; pump: number; ape: number }

export interface DynoScene {
  /** Centre of mass at launch, loaded. */
  com0: V2;
  /** The hold to catch. */
  hold: V2;
  /** Shoulder distance from the centre of mass, along the body toward the hold. */
  shoulder: number;
  /** Arm reach from the shoulder at ape index 1. */
  arm: number;
}

/** Rainbow Rocket's finishing dyno, roughly: 1.8 m from the loaded centre of mass to the jug. */
export const ROCKET: DynoScene = { com0: { x: 2.3, y: 1.0 }, hold: { x: 1.75, y: 2.75 }, shoulder: 0.5, arm: 0.66 };
/** A moderate dyno on the same wall: the jug 0.4 m lower. */
export const MODERATE: DynoScene = { ...ROCKET, hold: { x: 2.0, y: 2.38 } };

export const G = 9.81;
/** A tap this far outside the in-reach interval still touches the hold: a slap, not a miss (s). */
export const SLAP_S = 0.06;
/** Launches are searched to this long a flight (s). */
const T_MAX = 1.2;
const DT = 0.002;

const add = (a: V2, b: V2, k = 1): V2 => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: V2): number => Math.hypot(a.x, a.y);
const unit = (a: V2): V2 => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

/** Top launch speed (m/s): power sets it, pump and hesitation take from it. (tune) */
export function vMax(s: DynoStats): number {
  return (2.6 + 0.024 * s.power) * (1 - 0.3 * s.pump / 100) * (0.88 + 0.12 * s.commitment / 100);
}

/** Arm reach from the shoulder (m). */
export const reachOf = (scene: DynoScene, s: DynoStats): number => scene.arm * s.ape;

/** Hand speed the fingers can stop on the hold (m/s); faster than this and the hold rips out. (tune) */
export const catchSpeed = (s: DynoStats): number => 1.0 + 0.03 * s.contact;

/** Launch velocity from a power fraction (0–1) and a direction in degrees from +X (90 = straight up). */
export function launch(s: DynoStats, power: number, angleDeg: number): V2 {
  const a = (angleDeg * Math.PI) / 180;
  const v = Math.max(0, Math.min(1, power)) * vMax(s);
  return { x: v * Math.cos(a), y: v * Math.sin(a) };
}

export const comAt = (scene: DynoScene, v: V2, t: number): V2 => ({ x: scene.com0.x + v.x * t, y: scene.com0.y + v.y * t - 0.5 * G * t * t });
export const velAt = (v: V2, t: number): V2 => ({ x: v.x, y: v.y - G * t });

/** The body points at the hold in flight, so the shoulder sits `scene.shoulder` along that line. */
export function shoulderAt(scene: DynoScene, v: V2, t: number): V2 {
  const c = comAt(scene, v, t);
  return add(c, unit(sub(scene.hold, c)), scene.shoulder);
}

/** How far the hold is beyond fingertip reach at time t (m); ≤ 0 means it can be grabbed. */
export const gapAt = (scene: DynoScene, s: DynoStats, v: V2, t: number): number => len(sub(scene.hold, shoulderAt(scene, v, t))) - reachOf(scene, s);

export interface Flight {
  /** When the hold comes into reach and goes out of it again (s), or null if it never does. */
  window: [number, number] | null;
  /** The slowest moment inside the window: the dead point, the easiest catch (s). */
  slowest: number | null;
  /** Closest the fingertips get to the hold (m, negative inside reach). */
  minGap: number;
}

export function fly(scene: DynoScene, s: DynoStats, v: V2): Flight {
  let t1: number | null = null;
  let t2: number | null = null;
  let slowest: number | null = null;
  let slowSpeed = Infinity;
  let minGap = Infinity;
  let prev = Infinity;
  for (let t = 0; t <= T_MAX; t += DT) {
    const g = gapAt(scene, s, v, t);
    minGap = Math.min(minGap, g);
    if (g <= 0) {
      if (t1 === null) t1 = t;
      t2 = t;
      const sp = len(velAt(v, t));
      if (sp < slowSpeed) { slowSpeed = sp; slowest = t; }
    } else if (t1 !== null) break;
    // Falling and getting further away: the hold will not come back into reach.
    else if (velAt(v, t).y < 0 && g > prev) break;
    prev = g;
  }
  return { window: t1 !== null && t2 !== null ? [t1, t2] : null, slowest, minGap };
}

export type CatchResult = 'deadpoint' | 'caught' | 'slap' | 'missed' | 'short';

export interface Judged { result: CatchResult; speed: number | null; flight: Flight }

/**
 * Judge a catch tapped at `tap` seconds into the flight (null: no tap). Short: the hold never came into reach.
 * Inside the window the hand speed decides: slow enough to stop is a catch, near the dead point a clean one.
 */
export function judge(scene: DynoScene, s: DynoStats, v: V2, tap: number | null): Judged {
  const flight = fly(scene, s, v);
  if (!flight.window) return { result: 'short', speed: null, flight };
  if (tap === null) return { result: 'missed', speed: null, flight };
  const [t1, t2] = flight.window;
  if (tap < t1 - SLAP_S || tap > t2 + SLAP_S) return { result: 'missed', speed: null, flight };
  if (tap < t1 || tap > t2) return { result: 'slap', speed: null, flight };
  const speed = len(velAt(v, tap));
  const max = catchSpeed(s);
  return { result: speed > max ? 'slap' : speed < 0.6 * max ? 'deadpoint' : 'caught', speed, flight };
}

/** A catch window this long is worth paying power for; beyond it, more window is not worth more pump (s). (tune) */
export const WANT_WINDOW_S = 0.25;

/**
 * The launch a good climber picks: the hold in reach at the dead point, paying a little power for a usable window
 * rather than the least power that grazes it. Searched over angle and power, coarse then fine.
 */
export function bestLaunch(scene: DynoScene, s: DynoStats): { power: number; angle: number } | null {
  const search = (a0: number, a1: number, da: number, p0: number, p1: number, dp: number) => {
    let best: { power: number; angle: number; score: number } | null = null;
    for (let angle = a0; angle <= a1 + 1e-9; angle += da) {
      for (let power = p0; power <= p1 + 1e-9; power += dp) {
        const v = launch(s, power, angle);
        const f = fly(scene, s, v);
        if (!f.window || f.slowest === null) continue;
        const w = Math.min(WANT_WINDOW_S, f.window[1] - f.window[0]);
        const score = power - 2 * w + 0.02 * len(velAt(v, f.slowest));
        if (!best || score < best.score) best = { power, angle, score };
      }
    }
    return best;
  };
  const coarse = search(70, 140, 2, 0.3, 1, 0.02);
  if (!coarse) return null;
  const fine = search(coarse.angle - 2, coarse.angle + 2, 0.5, Math.max(0.3, coarse.power - 0.03), Math.min(1, coarse.power + 0.03), 0.005) ?? coarse;
  return { power: fine.power, angle: fine.angle };
}

/** Auto: the best launch spoiled by hesitation, and a catch near the dead point spoiled by grip. (tune) */
export function autoDyno(scene: DynoScene, s: DynoStats, rng: Rng, best = bestLaunch(scene, s)): { power: number; angle: number; tap: number | null } {
  const b = best;
  if (!b) return { power: 1, angle: 110, tap: null };
  const power = Math.min(1, b.power * (1 + rng.normal(0, 0.05 * (1 - s.commitment / 150))));
  const angle = b.angle + rng.normal(0, 3);
  const f = fly(scene, s, launch(s, power, angle));
  const tap = f.slowest === null ? null : f.slowest + rng.normal(0, 0.04 * (1 - s.contact / 150));
  return { power, angle, tap };
}
