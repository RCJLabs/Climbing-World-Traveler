// The cartoon wall's camera (docs/25 §10): a three-quarter view from the front-left and a little above, orthographic,
// so the face and its holds, the block's side (the profile in cross-section) and the body's distance off the rock all
// show at once. The steeper the problem, the further round to the side the camera sits: a vertical face is seen nearly
// head-on, a roof nearly in profile, so the moves under it are not hidden behind the body. Framing follows the climber
// and keeps the view on the problem. Pure: no DOM.

import type { V3 } from './rig';

export type P2 = [number, number];

/** The camera's tilt down (radians). **(tune)** */
export const PITCH = (8 * Math.PI) / 180;

/** World metres to view metres (X right, Y up; out from the rock sits to the right), and nearness to the camera. */
export interface Proj {
  /** The camera's turn round the block (degrees). */
  yaw: number;
  view(p: V3): P2;
  /** Larger is nearer. */
  depth(p: V3): number;
}

export function projOf(yawDeg: number): Proj {
  const y = (yawDeg * Math.PI) / 180;
  const cyw = Math.cos(y), syw = Math.sin(y), cpt = Math.cos(PITCH), spt = Math.sin(PITCH);
  return {
    yaw: yawDeg,
    view: (p) => {
      const d = -p[0] * syw + p[2] * cyw;
      return [p[0] * cyw + p[2] * syw, p[1] * cpt - d * spt];
    },
    depth: (p) => (-p[0] * syw + p[2] * cyw) * cpt + p[1] * spt,
  };
}

/** The camera's turn for a problem from its steepest angle: 24° on a vertical face up to 56° under a roof. **(tune)** */
export function yawFor(maxAngle: number): number {
  return Math.max(24, Math.min(56, 24 + 0.55 * (maxAngle - 92)));
}

/** The camera: the view point at the canvas centre and pixels per metre. */
export interface Cam { cx: number; cy: number; scale: number }
export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }

/** Smallest window shown (m): enough rock round the climber to see the next holds; on a pitch also the quickdraws below. **(tune)** */
export const FRAME_MIN: P2 = [2.2, 2.8];
export const FRAME_MIN_PITCH: P2 = [2.6, 3.4];
export const ZOOM_RANGE: P2 = [0.6, 2.5];

export function boundsOf(points: P2[], pad: [number, number, number, number] = [0.3, 0.3, 0.25, 0.6]): Bounds {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return { minX: Math.min(...xs) - pad[0], maxX: Math.max(...xs) + pad[1], minY: Math.min(...ys) - pad[2], maxY: Math.max(...ys) + pad[3] };
}

/**
 * Frame the points of interest (the body, the hold it is going for) with room round them, at least `min` (`FRAME_MIN`,
 * or `FRAME_MIN_PITCH` on a route), never more than the whole problem at zoom 1, then the player's zoom and pan. The
 * view stays on the problem.
 */
export function frameFor(points: P2[], w: number, h: number, b: Bounds, zoom = 1, pan: P2 = [0, 0], min: P2 = FRAME_MIN): Cam {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const fw = Math.max(min[0], Math.max(...xs) - Math.min(...xs) + 1.2);
  const fh = Math.max(min[1], Math.max(...ys) - Math.min(...ys) + 1.0);
  const fit = Math.min(w / fw, h / fh);
  const whole = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  const scale = Math.max(0.8 * whole, Math.max(fit, whole) * zoom);
  let cx = (Math.max(...xs) + Math.min(...xs)) / 2 + pan[0];
  let cy = (Math.max(...ys) + Math.min(...ys)) / 2 + pan[1];
  const hw = w / 2 / scale, hh = h / 2 / scale;
  cx = b.maxX - b.minX <= 2 * hw ? (b.minX + b.maxX) / 2 : Math.min(b.maxX - hw, Math.max(b.minX + hw, cx));
  cy = b.maxY - b.minY <= 2 * hh ? (b.minY + b.maxY) / 2 : Math.min(b.maxY - hh, Math.max(b.minY + hh, cy));
  return { cx, cy, scale };
}

/** View metres to canvas pixels for a camera. */
export function toScreen(cam: Cam, w: number, h: number): (p: P2) => P2 {
  return (p) => [w / 2 + (p[0] - cam.cx) * cam.scale, h / 2 - (p[1] - cam.cy) * cam.scale];
}

/** A camera eased towards another: the follow camera's smoothing. */
export function easeCam(a: Cam, b: Cam, f: number): Cam {
  return { cx: a.cx + (b.cx - a.cx) * f, cy: a.cy + (b.cy - a.cy) * f, scale: a.scale + (b.scale - a.scale) * f };
}
