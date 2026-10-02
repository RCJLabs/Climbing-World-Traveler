// Balance (docs/23 §2.2, §3.2): a move that unbalances you as the limb lets go is played by leaning the hips over
// the base and then reaching before you drift out of it. The stance test decides which moves those are; the drift
// itself runs on the screen, and only the time spent out of balance (and where the hand landed) comes back on the
// `move` action. A move with no perf plays as Auto, exactly as before Balance existed.

import type { Athlete } from './character';
import { placeDelta } from './reach';
import type { Limb } from './types';
import { angleAt, bodyPoints, limbKind, yOfS, type ClimbState, type RouteGeom } from './wall';

/** A point seen front-on: lateral x and height y (m). */
export type FPt = [number, number];

export interface BalancePerf {
  kind: 'balance';
  /** Time the centre of mass spent outside the base after it was first in balance (ms). */
  out_ms: number;
  /** Where the limb landed, as for Reach: a share of the placement ring. */
  place: number;
}

/** A move is Balance on ground no steeper than this (degrees at the hips). (tune) */
export const BALANCE_MAX_ANGLE = 90;
/** …when the centre of mass is outside the base or this close inside its edge (m). (tune) */
export const EDGE_M = 0.08;
/** Drift at the reference: vertical, fresh, average hips, feet and core (m/s). (tune) */
export const DRIFT_MS = 0.012;
/** Out of balance this long and you barn-door off: the slip branch (ms). (tune) */
export const BARN_MS = 1500;
/** Margin cost of a full `OUT_FULL_MS` out of balance (DI). (tune) */
export const OUT_COST = 0.2;
export const OUT_FULL_MS = 600;

export interface Stance {
  balance: boolean;
  /** The base front-on: the convex hull of the anchors left when the limb lets go, counter-clockwise. */
  base: FPt[];
  /** Centre of mass front-on, as it is before the limb lets go. */
  com: FPt;
  /** Signed distance from the centre of mass to the base: negative inside, positive outside (m). */
  d: number;
  /** Wall angle at the hips (degrees). */
  angle: number;
  /** The way the body tips: from the middle of the base out through the centre of mass (unit vector). */
  outward: FPt;
}

export function hull(pts: readonly FPt[]): FPt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: FPt, a: FPt, b: FPt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: FPt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  const up: FPt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (up.length >= 2 && cross(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop();
    up.push(q);
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

function segDist(q: FPt, a: FPt, b: FPt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
}

/** Signed distance to a convex hull (counter-clockwise): negative inside, positive outside. A point or a line has no inside. */
export function signedDist(h: readonly FPt[], q: FPt): number {
  if (h.length === 0) return Infinity;
  if (h.length === 1) return Math.hypot(q[0] - h[0]![0], q[1] - h[0]![1]);
  if (h.length === 2) return segDist(q, h[0]!, h[1]!);
  let inside = true;
  let d = Infinity;
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!;
    const b = h[(i + 1) % h.length]!;
    if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) < 0) inside = false;
    d = Math.min(d, segDist(q, a, b));
  }
  return inside ? -d : d;
}

/**
 * The stance test (docs/23 §2.2): with `limb` released, is the centre of mass outside the base left, or within
 * `EDGE_M` of its edge, on ground no steeper than vertical? (tune)
 */
export function stanceOf(geom: RouteGeom, ath: Athlete, st: ClimbState, limb: Limb): Stance {
  const wall = geom.route.wall;
  const pts: FPt[] = [];
  for (const l of ['LH', 'RH', 'LF', 'RF'] as Limb[]) {
    if (l === limb) continue;
    const id = st.anchors[l];
    if (!id || (st.feet_cut && limbKind(l) === 'foot')) continue;
    const h = geom.holds.get(id);
    if (h) pts.push([h.x, h.y]);
  }
  const base = hull(pts);
  const bp = bodyPoints(geom, ath, st);
  const com: FPt = [bp.CoM.x, yOfS(wall, bp.CoM.s)];
  const d = signedDist(base, com);
  const angle = angleAt(wall, com[1]);
  const mid: FPt = base.length ? [base.reduce((s, p) => s + p[0], 0) / base.length, base.reduce((s, p) => s + p[1], 0) / base.length] : com;
  let ox = com[0] - mid[0];
  let oy = com[1] - mid[1];
  const ol = Math.hypot(ox, oy);
  // Dead centre: the body tips away from the limb that let go.
  if (ol < 1e-6) { ox = limb === 'LH' || limb === 'LF' ? 1 : -1; oy = 0; } else { ox /= ol; oy /= ol; }
  return { balance: base.length >= 2 && angle <= BALANCE_MAX_ANGLE && d > -EDGE_M, base, com, d, angle, outward: [ox, oy] };
}

/** How fast the centre of mass drifts out (m/s): faster on slabs, pumped or gripping too hard; slower with good hips, feet and core. (tune) */
export function driftSpeed(ath: Athlete, angle: number, overgrip: number, pump: number): number {
  const slab = 1 + Math.max(0, 85 - angle) / 30;
  const skill = 1 - (ath.a.hip_mobility + ath.a.footwork + ath.a.core_tension) / 450;
  return DRIFT_MS * slab * (1 + overgrip) * (1 + Math.min(100, pump) / 200) * Math.max(0.3, skill);
}

export interface BalanceJudged {
  /** Added to the margin: time out of balance costs, and the hand's placement counts as on a Reach move. */
  delta: number;
  /** Out of balance for `BARN_MS` or more: the body swung off (the slip branch, 05b §4.5). */
  barn: boolean;
}

export function judgeBalance(perf: BalancePerf): BalanceJudged {
  return { delta: placeDelta(perf.place) - OUT_COST * Math.min(1, perf.out_ms / OUT_FULL_MS), barn: perf.out_ms >= BARN_MS };
}
