// Climbing on a rope (docs/05a §3, 05b §1, §9, §11, 07 §2, 15 §2.3, P1b): a route's bolts and anchor, when the
// climber clips, what a clip costs, how far a fall goes and how bad it is, and the fear the rope adds. Pure, and
// shared by the attempt loop and the grade engine, so a route is graded with the clipping the climber really does.

import type { Athlete } from './character';
import { anglePump } from './resolve';
import { PC } from './tables';
import type { HoldType, Protection, Route } from './types';
import { limbKind, type ClimbState, type RouteGeom } from './wall';

/** Routes climbed on a rope. P1b has sport only; trad and the rest come in P3. */
export const isRoped = (route: Pick<Route, 'discipline'>): boolean => route.discipline === 'sport';

/** The bolts, bottom to top (05a §3). */
export function boltsOf(route: Pick<Route, 'protection'>): Protection[] {
  return route.protection.filter((p) => p.kind === 'bolt').sort((a, b) => a.y - b.y);
}

export const anchorOf = (route: Pick<Route, 'protection'>): Protection | undefined => route.protection.find((p) => p.kind === 'anchor');

/**
 * The belayer. P1b has no partners, so every rope attempt is held by the default stub (15 §1.4) at this belay quality.
 * Danger (05c §3) is graded with a competent belayer, the protection state a careful climber would have. **(tune)**
 */
export const BELAY_QUALITY = 50;
export const GRADE_BELAY_QUALITY = 80;

/** Slack the belayer leaves in the system (15 §2.3), m. */
export const slackM = (belayQuality: number): number => 0.3 + 1.2 * (1 - belayQuality / 100);

/**
 * Length of a fall on a rope (05b §11): twice the height above the last clipped bolt, the slack, and 8% stretch of the
 * rope that is out. Below the last clip the rope holds the climber from above and only slack and stretch remain.
 */
export function fallLength(comY: number, lastClipY: number, belayQuality: number): number {
  return 2 * Math.max(0, comY - lastClipY) + slackM(belayQuality) + 0.08 * comY;
}

/** Whether a ledge lies in a fall's path (05b §11): a ledge segment's top between the climber and where the fall stops. */
export function ledgeInPath(route: Pick<Route, 'wall'>, comY: number, len: number): boolean {
  return route.wall.some((w) => w.feature === 'ledge' && w.y1 < comY - 0.3 && w.y1 > comY - len);
}

/**
 * Fall consequence κ on a rope (05b §11, 05c §3). Before the first clip the climber falls to the ground: no pads under a
 * route, so the boulder formula with no coverage and no spotter. Ground contact on the rope is κ = 1.
 */
export function ropeKappa(route: Pick<Route, 'wall'>, comY: number, lastClipY: number | null, belayQuality: number, skipped: boolean): number {
  if (lastClipY === null) return Math.min(1, 0.03 * comY * comY);
  const len = fallLength(comY, lastClipY, belayQuality);
  if (comY - len <= 0) return 1;
  const k = 0.015 * len + 0.4 * (ledgeInPath(route, comY, len) ? 1 : 0) + 0.2 * (1 - belayQuality / 100) + 0.3 * (skipped ? 1 : 0);
  return Math.min(1, Math.max(0, k));
}

/** The "height" fear source on a rope (05b §9.1): +1 per metre of potential fall beyond 4 m. Unclipped, the ground source. */
export function ropeHeightFear(comY: number, lastClipY: number | null, belayQuality: number): number {
  if (lastClipY === null) return Math.max(0, comY - 3);
  return Math.max(0, fallLength(comY, lastClipY, belayQuality) - 4);
}

/** "lead" fear at the start of a rope attempt (05b §9.1): it fades with the falls the climber has taken. */
export const leadFear = (ropeFalls: number): number => 7 * (1 - Math.min(1, ropeFalls / 60));
/** "belayer" fear (05b §9.1). */
export const belayerFear = (belayQuality: number): number => 3 * (1 - belayQuality / 100);

/** What one clip costs the climber (05b §1): time, and pump on the hand that holds on while the other clips. */
export function clipCost(ath: Athlete, holdType: HoldType, angle: number): { time: number; pump: number } {
  const rc = ath.a.rope_craft;
  return { time: 6 - 0.03 * rc, pump: 2.0 * PC[holdType] * anglePump(angle) * (1.2 - 0.4 * rc / 100) };
}

/** The holds a hand could clip `bolt` from right now, and the cheapest of them. */
function clipStance(geom: RouteGeom, st: ClimbState, bolt: Protection): { type: HoldType; angle: number; pc: number } | null {
  let best: { type: HoldType; angle: number; pc: number } | null = null;
  for (const l of ['LH', 'RH'] as const) {
    const id = st.anchors[l];
    if (!id || !(bolt.reach_from ?? []).includes(id)) continue;
    const h = geom.holds.get(id);
    if (!h) continue;
    const pc = PC[h.type] * anglePump(h.angle);
    if (!best || pc < best.pc) best = { type: h.type, angle: h.angle, pc };
  }
  return best;
}

/** A fall at least this bad (05c §3's bold) and the climber clips at the first stance it can. **(tune)** */
export const URGENT_KAPPA = 0.4;

/**
 * The climber's clipping (a tactic, 07 §2.1): clip the next bolt from the first stance it can be clipped from, unless a
 * later hold on the line, also in reach of it, is clearly better to clip from (a fifth less pump) and a fall from here
 * would not be bold or worse (`urgent`, e.g. a ground fall before the second bolt). Returns the stance to clip from, or
 * null when this is not the moment. `betaPtr` is the next step of the line.
 */
export function clipFrom(geom: RouteGeom, st: ClimbState, bolt: Protection | undefined, betaPtr: number, urgent = false): { type: HoldType; angle: number } | null {
  if (!bolt) return null;
  const here = clipStance(geom, st, bolt);
  if (!here || urgent) return here;
  const route = geom.route;
  for (let i = betaPtr; i < route.beta_line.length; i++) {
    const s = route.beta_line[i]!;
    if (limbKind(s.limb) !== 'hand' || !(bolt.reach_from ?? []).includes(s.hold)) continue;
    const h = geom.holds.get(s.hold);
    if (h && PC[h.type] * anglePump(h.angle) < 0.8 * here.pc) return null;
  }
  return here;
}

/**
 * Whether the climber has gone past a bolt without clipping it: none of the holds it can be clipped from is still ahead
 * on the line or in a hand. A skipped bolt stays unclipped (05b §11's skipped-clip term) and the next one is next.
 */
export function boltPassed(geom: RouteGeom, st: ClimbState, bolt: Protection, betaPtr: number): boolean {
  const from = bolt.reach_from ?? [];
  if ((['LH', 'RH'] as const).some((l) => from.includes(st.anchors[l] ?? ''))) return false;
  for (let i = betaPtr; i < geom.route.beta_line.length; i++) {
    const s = geom.route.beta_line[i]!;
    if (limbKind(s.limb) === 'hand' && from.includes(s.hold)) return false;
  }
  return true;
}

/** Whether the climber is at the anchor: a hand on the finish hold and the line done. */
export const atAnchor = (geom: RouteGeom, st: ClimbState, betaPtr: number): boolean =>
  betaPtr >= geom.route.beta_line.length && (st.anchors.LH === geom.route.finish_hold || st.anchors.RH === geom.route.finish_hold);

/**
 * Hanging on the rope (05b §1 `take`, §11): 60 s on the rope brings pump down to 40% of what it was and the power
 * back; the aerobic reserve drains as on the wall. **(tune)**
 */
export const HANG = { time_s: 60, pumpKeep: 0.4 };
