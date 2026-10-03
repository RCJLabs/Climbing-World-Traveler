// The climber's body for the cartoon wall (docs/25 §10). The engine's body model is for reach: it puts the hips
// 0.35 m below the middle of hands and feet whatever the legs are doing, which folds the legs flat when the feet are
// high. Here the engine's points become a natural 3D posture: the body hangs off the rock along the face's normal
// (under a roof, not in it), the hips sit back as the legs fold, knees go forward, up and a little out but never into
// the rock, elbows hang down and out, and every limb end stays on its hold. Pure: no DOM, so the rules are tested.
// Axes: x across the face, y up, z out from the foot of the wall; metres.

import { kinematics, type Athlete } from '../../sim/character';
import type { Limb, Posture, WallSegment } from '../../sim/types';
import { angleAt, bodyPoints, limbKind, sOfY, yOfS, zOfY, type ClimbState, type RouteGeom } from '../../sim/wall';

export type V3 = [number, number, number];
export const LIMBS: readonly Limb[] = ['LH', 'RH', 'LF', 'RF'];

export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** The body hangs this far off the face (m, at 1.7 m tall), measured along the face's normal. */
export const OUT_SHOULDER = 0.28;
export const OUT_HIP = 0.22;
/** The hips sit back until each placed foot is this many leg lengths away; never more than `HIP_BACK_MAX` off the rock. **(tune)** */
export const HIP_REACH = 0.74;
export const HIP_BACK_MAX = 0.62;
/** A knee keeps at least this much (m) off the rock. */
export const KNEE_CLEAR = 0.08;
/** Arms and legs may stretch this much past their length before the body is pulled after the hand or foot (cartoon). */
export const STRETCH = 1.06;

/** What the engine says about the body, in 3D: the shoulders' and hips' centres, each limb's end, the build. */
export interface Body3 {
  sh: V3;
  hip: V3;
  ends: Record<Limb, V3>;
  on: Record<Limb, boolean>;
  /** Height over 1.7 m. */
  k: number;
  /** Shoulder to fingertip and hip to sole (m), from the build (02 §C). */
  arm: number;
  leg: number;
  posture: Posture;
  /** Both feet have come off (a cut loose): the legs hang. */
  feetCut?: boolean | undefined;
}

/** The rock where the body is: the face's offset and outward normal at a height. */
export interface Rock {
  /** z of the face at height y. */
  z(y: number): number;
  /** Outward unit normal of the face at height y (towards the climber's side). */
  n(y: number): V3;
}

export function rockOf(wall: readonly WallSegment[]): Rock {
  return {
    z: (y) => zOfY(wall, y),
    n: (y) => {
      const a = (angleAt(wall, Math.max(0, y)) * Math.PI) / 180;
      return [0, Math.cos(a), Math.sin(a)];
    },
  };
}

/** A flat, vertical rock: for tests and for the pads. */
export const FLAT_ROCK: Rock = { z: () => 0, n: () => [0, 0, 1] };

/** The engine's state as a body in 3D (`bodyPoints`, 05a §4), set off the face along its normal. */
export function bodyOf(geom: RouteGeom, ath: Athlete, climb: ClimbState): Body3 {
  const wall = geom.route.wall;
  const rock = rockOf(wall);
  const bp = bodyPoints(geom, ath, climb);
  const kin = kinematics(ath.body);
  const k = kin.height_m / 1.7;
  const at = (x: number, s: number, out: number): V3 => {
    const y = yOfS(wall, s);
    return add3([x, y, rock.z(y)], mul3(rock.n(y), out * k));
  };
  const sh = at(bp.shoulder.x, bp.shoulder.s, OUT_SHOULDER);
  const hip = at(bp.hip.x, bp.hip.s, OUT_HIP);
  const ends = {} as Record<Limb, V3>;
  const on = {} as Record<Limb, boolean>;
  for (const l of LIMBS) {
    const id = climb.anchors[l];
    const h = id ? geom.holds.get(id) : undefined;
    const side = l === 'LH' || l === 'LF' ? -1 : 1;
    if (h && !(climb.feet_cut && limbKind(l) === 'foot')) {
      on[l] = true;
      ends[l] = [h.x, h.y, h.z];
    } else {
      on[l] = false;
      ends[l] = limbKind(l) === 'hand' ? [sh[0] + 0.2 * side * k, sh[1] - 0.52 * k, sh[2] + 0.1] : [hip[0] + 0.13 * side * k, hip[1] - 0.8 * k, hip[2] + 0.12];
    }
  }
  return { sh, hip, ends, on, k, arm: kin.arm_len, leg: kin.leg_len, posture: climb.posture, feetCut: climb.feet_cut };
}

/** Surface height of a point near the face, for callers that need `s` (the playback's camera rules). */
export const sAt = (wall: readonly WallSegment[], y: number): number => sOfY(wall, y);

export type FootStyle = 'flat' | 'heel' | 'toe' | 'free';

/** What a move asks of the body beyond where its points are. */
export interface RigMods {
  /** A foot hooking with its heel or its toe. */
  heel?: Limb | undefined;
  toe?: Limb | undefined;
  /** A knee driven up towards the chest (a high step on its way). */
  kneeUp?: Limb | undefined;
  /** A knee turned in and down. */
  dropKnee?: Limb | undefined;
  /** Facing out from the wall: standing on top, sitting on the pads. */
  facingOut?: boolean | undefined;
  /** Elbows up and back: pressing out a mantle. */
  press?: boolean | undefined;
  /** Sitting: knees come up in front. */
  seated?: boolean | undefined;
  /** Feet off the rock hang: the knees bend towards the rock, not out. */
  dangle?: boolean | undefined;
}

/** Every joint, in 3D. */
export interface Joints {
  k: number;
  shL: V3; shR: V3; elL: V3; elR: V3; LH: V3; RH: V3;
  hipL: V3; hipR: V3; knL: V3; knR: V3; LF: V3; RF: V3;
  sh: V3; hip: V3; neck: V3; head: V3;
  on: Record<Limb, boolean>;
  foot: Record<'LF' | 'RF', FootStyle>;
  /** Unit vector from the hips to the shoulders. */
  spine: V3;
  /** Where the climber looks: a unit vector from the head. */
  gaze: V3;
  facingOut: boolean;
}

/** Two-bone IK in 3D: the middle joint between `a` and `b` for bones `l1`, `l2`, bending towards `pole`. */
export function joint3(a: V3, b: V3, l1: number, l2: number, pole: V3): V3 {
  const ab = sub3(b, a);
  const d0 = len3(ab) || 1e-6;
  const d = Math.min(d0, l1 + l2 - 1e-4);
  const u = mul3(ab, 1 / d0);
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const off = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let n = sub3(pole, mul3(u, dot3(pole, u)));
  if (len3(n) < 1e-6) n = [0, 0, 1];
  n = norm3(n);
  return add3(add3(a, mul3(u, along)), mul3(n, off));
}

/** `v` turned by `a` radians round the unit axis `u`. */
export function rotate3(v: V3, u: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  const x: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return add3(add3(mul3(v, c), mul3(x, s)), mul3(u, dot3(u, v) * (1 - c)));
}

/** How far a point is off the rock along the normal (negative = inside). */
const clear = (rock: Rock, p: V3): number => dot3(sub3(p, [p[0], p[1], rock.z(p[1])]), rock.n(p[1]));

/**
 * The natural posture for a body (see the file comment). `rock` is the face the body is on; `look` is where the climber
 * is looking (the next hold), if anywhere.
 */
export function solve(b: Body3, rock: Rock = FLAT_ROCK, mods: RigMods = {}, look?: V3): Joints {
  const k = b.k;
  const upper = 0.46 * b.arm, fore = 0.54 * b.arm;
  const thigh = 0.5 * b.leg, shin = 0.5 * b.leg;
  let sh = b.sh;
  let hip = b.hip;
  const n = rock.n(hip[1]);
  const facingOut = !!mods.facingOut;
  // The hips sit back along the normal as the legs fold, so a high foot bends the knee instead of splaying it.
  if (!facingOut && !mods.seated) {
    let back = 0;
    for (const f of ['LF', 'RF'] as const) {
      if (!b.on[f]) continue;
      const e = b.ends[f];
      const side = f === 'LF' ? -1 : 1;
      const hs: V3 = [hip[0] + side * 0.11 * k, hip[1], hip[2]];
      const d = sub3(hs, e);
      const along = dot3(d, n);
      const across = Math.sqrt(Math.max(0, dot3(d, d) - along * along));
      const want = HIP_REACH * b.leg;
      if (across < want) back = Math.max(back, Math.sqrt(want * want - across * across) - along);
    }
    const cap = Math.max(0, HIP_BACK_MAX * k - clear(rock, hip));
    hip = add3(hip, mul3(n, clamp(back, 0, cap)));
  }
  // Hands and feet stay on their holds: a limb past its stretch pulls the body after it.
  const pull = (root: V3, end: V3, reach: number): V3 => {
    const d = len3(sub3(end, root));
    return d > reach ? mul3(norm3(sub3(end, root)), d - reach) : [0, 0, 0];
  };
  for (const l of ['LH', 'RH'] as const) {
    if (!b.on[l]) continue;
    const side = l === 'LH' ? -1 : 1;
    const v = pull([sh[0] + side * 0.17 * k, sh[1], sh[2]], b.ends[l], STRETCH * b.arm);
    sh = add3(sh, v);
    hip = add3(hip, mul3(v, 0.6));
  }
  for (const f of ['LF', 'RF'] as const) {
    if (!b.on[f]) continue;
    const side = f === 'LF' ? -1 : 1;
    hip = add3(hip, pull([hip[0] + side * 0.11 * k, hip[1], hip[2]], b.ends[f], STRETCH * b.leg));
  }
  const spine = norm3(sub3(sh, hip));
  const across: V3 = [1, 0, 0];
  const shL = add3(sh, mul3(across, -0.17 * k)), shR = add3(sh, mul3(across, 0.17 * k));
  const hipL = add3(hip, mul3(across, -0.11 * k)), hipR = add3(hip, mul3(across, 0.11 * k));
  // Elbows hang down and out, off the wall; pressing a mantle they go up and back.
  const elbowPole = (side: number): V3 =>
    mods.press ? norm3(add3(add3(mul3(across, side * 0.35), mul3(spine, 0.6)), mul3(n, 0.7)))
      : facingOut ? norm3([side * 0.7, -0.7, -0.1])
        : norm3(add3(add3(mul3(across, side * 0.62), mul3(spine, -0.62)), mul3(n, 0.32)));
  const elL = joint3(shL, b.ends.LH, upper, fore, elbowPole(-1));
  const elR = joint3(shR, b.ends.RH, upper, fore, elbowPole(1));
  // Knees: forward (towards the rock), up along the body and a little out; more up as the leg folds. A drop knee turns
  // in and down, a heel hook opens out and up; never into the rock.
  const knee = (f: 'LF' | 'RF', h0: V3): V3 => {
    const side = f === 'LF' ? -1 : 1;
    const end = b.ends[f];
    const fold = clamp(1 - len3(sub3(end, h0)) / b.leg, 0, 1);
    let pole: V3;
    if (facingOut) pole = mods.seated ? norm3([side * 0.3, 1, 0.2]) : norm3([side * 0.25, 0.2, 1]);
    else if ((mods.dangle || b.feetCut) && !b.on[f]) pole = norm3(add3(add3(mul3(across, side * 0.2), mul3(spine, 0.3)), [0, 0, -1]));
    else if (mods.dropKnee === f) pole = norm3(add3(add3(mul3(across, -side * 0.35), mul3(spine, -0.7)), mul3(n, -0.4)));
    else if (mods.heel === f) pole = norm3(add3(add3(mul3(across, side * 0.75), mul3(spine, 0.5)), mul3(n, 0.3)));
    else if (mods.kneeUp === f) pole = norm3(add3(add3(mul3(across, side * 0.3), mul3(spine, 1)), mul3(n, -0.2)));
    else pole = norm3(add3(add3(mul3(across, side * (0.45 - 0.1 * fold)), mul3(spine, 0.3 + 0.7 * fold)), mul3(n, -0.5)));
    let kn = joint3(h0, end, thigh, shin, pole);
    if (!facingOut && clear(rock, kn) < KNEE_CLEAR) {
      // Turn the knee round the hip-to-foot line, the shorter way first, until it is off the rock; failing that, as
      // far off it as it goes.
      const axis = norm3(sub3(end, h0));
      let best = kn, bestC = clear(rock, kn);
      for (let d = 15; d <= 180 && bestC < KNEE_CLEAR; d += 15) {
        for (const sgn of [1, -1]) {
          const c = joint3(h0, end, thigh, shin, rotate3(pole, axis, (sgn * d * Math.PI) / 180));
          const cc = clear(rock, c);
          if (cc > bestC) { best = c; bestC = cc; }
        }
      }
      kn = best;
    }
    return kn;
  };
  const knL = knee('LF', hipL), knR = knee('RF', hipR);
  const neck = add3(sh, mul3(spine, 0.07 * k));
  // The head sits up the spine and, facing the rock, leans in to look at it.
  const head = add3(add3(sh, mul3(spine, 0.24 * k)), facingOut ? [0, 0, 0] : mul3(n, -0.03 * k));
  const gaze = look ? norm3(sub3(look, head)) : facingOut ? norm3([0, -0.1, 1]) : norm3(add3(mul3(n, -1), mul3(spine, 0.4)));
  const footStyle = (f: 'LF' | 'RF'): FootStyle => (!b.on[f] ? 'free' : mods.heel === f ? 'heel' : mods.toe === f ? 'toe' : 'flat');
  return {
    k, shL, shR, elL, elR, LH: b.ends.LH, RH: b.ends.RH, hipL, hipR, knL, knR, LF: b.ends.LF, RF: b.ends.RF,
    sh, hip, neck, head, on: { ...b.on }, foot: { LF: footStyle('LF'), RF: footStyle('RF') }, spine, gaze, facingOut,
  };
}

/** The same body with each point moved by `d`. */
export function shiftBody(b: Body3, d: V3): Body3 {
  const ends = {} as Record<Limb, V3>;
  for (const l of LIMBS) ends[l] = add3(b.ends[l], d);
  return { ...b, sh: add3(b.sh, d), hip: add3(b.hip, d), ends };
}

/** `t` of the way from body `a` to body `b`, every point on a straight line. */
export function mixBody(a: Body3, b: Body3, t: number): Body3 {
  const ends = {} as Record<Limb, V3>;
  for (const l of LIMBS) ends[l] = mix3(a.ends[l], b.ends[l], t);
  return { ...b, sh: mix3(a.sh, b.sh, t), hip: mix3(a.hip, b.hip, t), ends, on: t < 1 ? { ...a.on } : { ...b.on } };
}
