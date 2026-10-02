// Swing and Catch (docs/23 §2.3, §3.3): a dyno is launched, flies and is caught; the player's pull and tap are judged
// here and mapped onto the commit outcomes of 05b §8.3, so margins, costs and the Auto rule are unchanged.
//
// The flight is in surface coordinates (x across the rock, s up it) with gravity along −s. The hand reaches the hold
// while the centre of mass is within `shoulder + reach` of it, so "in reach" is a disc around the hold and a good
// launch is the one whose apex sits just inside that disc: the dead point.

import type { CommitOutcome } from './resolve';

export interface SPt { x: number; s: number }

/** What the player did: the pull as a fraction of the top launch speed, its direction, and when they grabbed. */
export interface SwingPerf {
  power: number;
  /** Launch direction, degrees from +x (90 = straight up the rock). */
  angle_deg: number;
  /** Grab time in flight milliseconds (game time, not screen time), or null for no grab. */
  catch_ms: number | null;
}

export interface SwingSetup {
  /** Centre of mass at launch, with the launching hand released. */
  com0: SPt;
  hold: SPt;
  /** Shoulder distance from the centre of mass (m). */
  shoulder: number;
  /** Fingertip reach from the shoulder (m). */
  reach: number;
  /** Launch speed at a full pull (m/s). */
  v_top: number;
  /** The pull fraction a good launch needs: near 1 for a hard dyno, about half for an easy one. */
  p_need: number;
  /** The good launch's direction (degrees). */
  angle_good: number;
  /** Body speed at the good launch's dead point, and the most the fingers can stop (m/s). */
  apex_speed: number;
  catch_speed: number;
  /** Auto-commit's apex chance (05b §8.4), kept here so a pending dyno carries everything it is judged with. */
  p_apex_auto: number;
}

export const G = 9.81;
/** A grab this close outside the in-reach window still touches the hold: a slap (ms). */
export const SLAP_MS = 80;
/** How far inside the reach disc a good launch puts the dead point (m). (tune) */
const APEX_DEPTH = 0.1;
const DT = 0.002;
const T_MAX = 1.5;

const len = (x: number, s: number) => Math.hypot(x, s);

export interface SwingInputs {
  com0: SPt;
  shoulderAt: SPt;
  hold: SPt;
  reach: number;
  margin: number;
  T: number;
  pump: number;
  contact: number;
  /** Trait multiplier on the catch tolerance (`commit_window_width`). */
  catchMult: number;
  pApexAuto: number;
}

/** The dyno as the engine judges it: the good launch, the top speed that makes it need `p_need`, and the grip. (tune) */
export function swingSetup(i: SwingInputs): SwingSetup {
  const shoulder = len(i.shoulderAt.x - i.com0.x, i.shoulderAt.s - i.com0.s);
  const L = shoulder + i.reach;
  const dx = i.hold.x - i.com0.x;
  const ds = i.hold.s - i.com0.s;
  const d = len(dx, ds) || 1;
  // Dead point on the line to the hold, just inside the reach disc, and never below a short hop.
  const k = Math.max(0, d - (L - APEX_DEPTH)) / d;
  const apex = { x: i.com0.x + dx * k, s: Math.max(i.com0.s + 0.05, i.com0.s + ds * k) };
  const vs = Math.sqrt(2 * G * (apex.s - i.com0.s));
  const ta = vs / G;
  const vx = (apex.x - i.com0.x) / ta;
  const v_good = len(vx, vs);
  const p_need = Math.min(0.95, Math.max(0.4, 0.62 - 0.18 * (i.margin / i.T) + 0.1 * i.pump / 100));
  const apex_speed = Math.abs(vx);
  const grip = Math.min(0.8, Math.max(0.15, (0.35 + 0.003 * i.contact + 0.1 * (i.margin / i.T)) * i.catchMult));
  return {
    com0: i.com0, hold: i.hold, shoulder, reach: i.reach,
    v_top: v_good / p_need, p_need, angle_good: (Math.atan2(vs, vx) * 180) / Math.PI,
    apex_speed, catch_speed: apex_speed + grip * (v_good - apex_speed), p_apex_auto: i.pApexAuto,
  };
}

/** Launch velocity for a pull. */
export function launchVelocity(st: SwingSetup, power: number, angleDeg: number): SPt {
  const a = (angleDeg * Math.PI) / 180;
  const v = Math.max(0, Math.min(1, power)) * st.v_top;
  return { x: v * Math.cos(a), s: v * Math.sin(a) };
}

export const comAt = (st: SwingSetup, v: SPt, t: number): SPt => ({ x: st.com0.x + v.x * t, s: st.com0.s + v.s * t - 0.5 * G * t * t });
export const speedAt = (v: SPt, t: number): number => len(v.x, v.s - G * t);

/** The shoulder in flight: on the line from the centre of mass to the hold. */
export function shoulderAt(st: SwingSetup, v: SPt, t: number): SPt {
  const c = comAt(st, v, t);
  const dx = st.hold.x - c.x;
  const ds = st.hold.s - c.s;
  const d = len(dx, ds) || 1;
  return { x: c.x + (dx / d) * st.shoulder, s: c.s + (ds / d) * st.shoulder };
}

/** How far the hold is beyond the fingertips at time t (m); ≤ 0 means it can be grabbed. */
export function gapAt(st: SwingSetup, v: SPt, t: number): number {
  const c = comAt(st, v, t);
  return len(st.hold.x - c.x, st.hold.s - c.s) - st.shoulder - st.reach;
}

export interface Flight {
  /** When the hold comes into reach and leaves it (s), or null. */
  window: [number, number] | null;
  /** The slowest moment in reach: the dead point (s). */
  slowest: number | null;
}

export function fly(st: SwingSetup, v: SPt): Flight {
  let t1: number | null = null;
  let t2: number | null = null;
  let slowest: number | null = null;
  let slow = Infinity;
  let prev = Infinity;
  for (let t = 0; t <= T_MAX; t += DT) {
    const g = gapAt(st, v, t);
    if (g <= 0) {
      if (t1 === null) t1 = t;
      t2 = t;
      const sp = speedAt(v, t);
      if (sp < slow) { slow = sp; slowest = t; }
    } else if (t1 !== null) break;
    else if (v.s - G * t < 0 && g > prev) break;
    prev = g;
  }
  return { window: t1 !== null && t2 !== null ? [t1, t2] : null, slowest };
}

export interface SwingJudged {
  outcome: CommitOutcome;
  /** Why, for the move log: short (never in reach), early, late, fast (ripped off), deadpoint, caught. */
  reason: 'short' | 'early' | 'late' | 'fast' | 'deadpoint' | 'caught' | 'no_grab';
  flight: Flight;
}

/** Judge a pull and a grab against the setup (05b §8.3 outcomes). */
export function judgeSwing(st: SwingSetup, perf: SwingPerf): SwingJudged {
  const v = launchVelocity(st, perf.power, perf.angle_deg);
  const flight = fly(st, v);
  if (!flight.window) return { outcome: 'cut', reason: 'short', flight };
  if (perf.catch_ms === null) return { outcome: 'cut', reason: 'no_grab', flight };
  const t = perf.catch_ms / 1000;
  const [t1, t2] = flight.window;
  const slap = SLAP_MS / 1000;
  if (t < t1) return { outcome: t >= t1 - slap ? 'slap' : 'cut', reason: 'early', flight };
  if (t > t2) return { outcome: t <= t2 + slap ? 'slap' : 'cut', reason: 'late', flight };
  const sp = speedAt(v, t);
  if (sp > st.catch_speed) return { outcome: 'slap', reason: 'fast', flight };
  if (sp <= st.apex_speed + 0.35 * (st.catch_speed - st.apex_speed)) return { outcome: 'apex', reason: 'deadpoint', flight };
  return { outcome: 'caught', reason: 'caught', flight };
}

/** The good launch and a grab at its dead point: what a perfect player does (tests, harness oracle). */
export function goodSwing(st: SwingSetup): SwingPerf {
  const f = fly(st, launchVelocity(st, st.p_need, st.angle_good));
  return { power: st.p_need, angle_deg: st.angle_good, catch_ms: f.slowest === null ? null : Math.round(f.slowest * 1000) };
}
