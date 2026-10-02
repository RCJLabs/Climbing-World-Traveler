// Climber pose and camera for the wall view (05a §1.4, 17 §2). Pure: no DOM, so the framing rules can be tested.
// Coordinates are projected metres: X across the screen, Y up. The oblique side view maps a hold at lateral x and
// height y to X = −k_z·z(y) + k_lat·x, so the face leans out (−X) where the rock overhangs.

import type { Athlete } from '../../sim/character';
import type { Limb, MoveClass, WallSegment } from '../../sim/types';
import { bodyPoints, limbKind, yOfS, zOfY, type ClimbState, type RouteGeom } from '../../sim/wall';

export type P = [number, number];

export const K_LAT = 0.5;
const K_Z = 1.0;
/** The body hangs this far out from the face (m), so the figure does not sit on its holds. */
const OUT_SHOULDER = 0.28;
const OUT_HIP = 0.22;
export const LIMBS: readonly Limb[] = ['LH', 'RH', 'LF', 'RF'];

export function project(wall: readonly WallSegment[], x: number, y: number): P {
  return [-K_Z * zOfY(wall, y) + K_LAT * x, y];
}

export function projectS(wall: readonly WallSegment[], x: number, s: number, out = 0): P {
  const [X, Y] = project(wall, x, yOfS(wall, s));
  return [X - out, Y];
}

/** What the figure is drawn from: shoulders, hips and the four limb ends. `k` scales a 170 cm body. */
export interface Pose {
  sh: P;
  hip: P;
  ends: Record<Limb, P>;
  on: Record<Limb, boolean>;
  k: number;
}

export function poseOf(geom: RouteGeom, ath: Athlete, climb: ClimbState): Pose {
  const wall = geom.route.wall;
  const bp = bodyPoints(geom, ath, climb);
  const sh = projectS(wall, bp.shoulder.x, bp.shoulder.s, OUT_SHOULDER);
  const hip = projectS(wall, bp.hip.x, bp.hip.s, OUT_HIP);
  const k = ath.body.height_cm / 170;
  const ends = {} as Record<Limb, P>;
  const on = {} as Record<Limb, boolean>;
  for (const l of LIMBS) {
    const id = climb.anchors[l];
    const hold = id ? geom.holds.get(id) : undefined;
    const placed = !!hold && !(climb.feet_cut && limbKind(l) === 'foot');
    on[l] = placed;
    const side = l === 'LH' || l === 'LF' ? -1 : 1;
    ends[l] = placed ? project(wall, hold!.x, hold!.y)
      : limbKind(l) === 'hand' ? [sh[0] - 0.05 + 0.06 * side, sh[1] - 0.55 * k] : [hip[0] - 0.08 + 0.05 * side, hip[1] - 0.78 * k];
  }
  return { sh, hip, ends, on, k };
}

export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** A fall: accelerates from rest and lands at 65% of the ending, then holds. */
export const drop = (t: number): number => Math.min(1, t / 0.65) ** 2;
const mix = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** How a step should look in motion. */
export interface MotionStyle {
  limb?: Limb | undefined;
  cls?: MoveClass | undefined;
}

/**
 * The pose `t` (0–1) of the way from `a` to `b`. The moving limb travels on an arc off the wall; a deadpoint or dyno
 * also lifts the body through the move, highest mid-flight, which is what makes a dynamic move read as one. `curve`
 * maps time to progress; the default eases in and out.
 */
export function lerpPose(a: Pose, b: Pose, t: number, style: MotionStyle = {}, curve: (t: number) => number = ease): Pose {
  const e = curve(t);
  const lift = style.cls === 'dyno' ? 0.22 * b.k : style.cls === 'deadpoint' ? 0.1 * b.k : 0;
  const up = lift * Math.sin(Math.PI * t);
  const raise = (p: P): P => [p[0], p[1] + up];
  const ends = {} as Record<Limb, P>;
  for (const l of LIMBS) {
    const p = mix(a.ends[l], b.ends[l], e);
    if (l === style.limb) {
      // Out from the wall and up through the middle of the move, as a limb leaves one hold for the next.
      const d = Math.hypot(b.ends[l][0] - a.ends[l][0], b.ends[l][1] - a.ends[l][1]);
      const arc = Math.min(0.25, 0.35 * d) * Math.sin(Math.PI * e);
      ends[l] = [p[0] - arc, p[1] + 0.5 * arc];
    } else ends[l] = p;
  }
  return { sh: raise(mix(a.sh, b.sh, e)), hip: raise(mix(a.hip, b.hip, e)), ends, on: t < 1 ? a.on : b.on, k: b.k };
}

/** The pose after coming off: everything lets go and the body drops onto the pads. */
export function fallenPose(a: Pose): Pose {
  const drop = Math.max(0, a.hip[1] - 0.45 * a.k);
  const down = (p: P): P => [p[0] - 0.15, p[1] - drop];
  const sh = down(a.sh);
  const hip = down(a.hip);
  const on = { LH: false, RH: false, LF: false, RF: false };
  return {
    sh, hip, on, k: a.k,
    ends: { LH: [sh[0] - 0.12, sh[1] - 0.45 * a.k], RH: [sh[0] + 0.08, sh[1] - 0.45 * a.k], LF: [hip[0] - 0.15, 0], RF: [hip[0] + 0.1, 0] },
  };
}

/** The pose after the mantle: up and over the lip. */
export function toppedPose(a: Pose, top: number): Pose {
  const rise = Math.max(0, top + 0.95 * a.k - a.sh[1]);
  const up = (p: P): P => [p[0] + 0.15, p[1] + rise];
  return { ...a, sh: up(a.sh), hip: up(a.hip), ends: { LH: up(a.ends.LH), RH: up(a.ends.RH), LF: up(a.ends.LF), RF: up(a.ends.RF) } };
}

// ---------------------------------------------------------------- camera

/** Camera: the projected point at the centre of the canvas and the zoom in pixels per metre. */
export interface Cam { cx: number; cy: number; scale: number }

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** Smallest window shown (m): enough rock around the climber to see the next holds. */
export const FRAME_MIN: P = [2.2, 2.8];
export const ZOOM_RANGE: P = [0.6, 2.5];

/** Projected extent of the whole problem: the face across its width, the ground and a margin above the lip. */
export function wallBounds(geom: RouteGeom): Bounds {
  const wall = geom.route.wall;
  const top = wall[wall.length - 1]!.y1;
  const xs = geom.list.map((h) => h.x);
  const x0 = Math.min(-1.0, Math.min(...xs) - 0.25);
  const x1 = Math.max(1.0, Math.max(...xs) + 0.25);
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i <= 24; i++) {
    const y = (top * i) / 24;
    for (const x of [x0, x1]) {
      const [X] = project(wall, x, y);
      minX = Math.min(minX, X);
      maxX = Math.max(maxX, X);
    }
  }
  return { minX: minX - 0.9, maxX: maxX + 0.5, minY: -0.25, maxY: top + 0.6 };
}

/**
 * Frame the climber: their body and a reach's worth of rock above, at least `FRAME_MIN`, never more than the whole
 * problem, then the player's zoom and pan on top. The view is kept on the problem.
 */
export function frameFor(pose: Pose, w: number, h: number, b: Bounds, zoom = 1, pan: P = [0, 0]): Cam {
  const pts: P[] = [pose.sh, pose.hip, ...LIMBS.map((l) => pose.ends[l]), [pose.sh[0], pose.sh[1] + 0.9 * pose.k], [pose.hip[0], Math.max(b.minY, pose.hip[1] - 1.0 * pose.k)]];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const fw = Math.max(FRAME_MIN[0], Math.max(...xs) - Math.min(...xs) + 1.2);
  const fh = Math.max(FRAME_MIN[1], Math.max(...ys) - Math.min(...ys) + 0.8);
  const fit = Math.min(w / fw, h / fh);
  const whole = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  // Never wider than the whole problem at zoom 1; zooming out stops a little past it.
  const scale = Math.max(0.8 * whole, Math.max(fit, whole) * zoom);
  let cx = (Math.max(...xs) + Math.min(...xs)) / 2 + pan[0];
  let cy = (Math.max(...ys) + Math.min(...ys)) / 2 + pan[1];
  const hw = w / 2 / scale;
  const hh = h / 2 / scale;
  cx = b.maxX - b.minX <= 2 * hw ? (b.minX + b.maxX) / 2 : Math.min(b.maxX - hw, Math.max(b.minX + hw, cx));
  cy = b.maxY - b.minY <= 2 * hh ? (b.minY + b.maxY) / 2 : Math.min(b.maxY - hh, Math.max(b.minY + hh, cy));
  return { cx, cy, scale };
}

export function toScreen(cam: Cam, w: number, h: number): (X: number, Y: number) => [number, number] {
  return (X, Y) => [w / 2 + (X - cam.cx) * cam.scale, h / 2 - (Y - cam.cy) * cam.scale];
}
