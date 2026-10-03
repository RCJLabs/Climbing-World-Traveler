// Bridges geometry (wall.ts) and resolution (resolve.ts): turns "this limb onto that hold with this class" into a
// MoveSpec. Used identically by the simulated attempt and the grade engine.

import type { Athlete } from './character';
import { CLASS_REACH } from './tables';
import { holdCost, restDelta, type MoveSpec } from './resolve';
import {
  bodyPoints, choosePosture, freeState, judgeOption, limbKind, orientationTerm, positionQuality, rawRestValue, type ClimbState, type HoldG, type Option, type RouteGeom,
} from './wall';
import type { Limb, MoveClass } from './types';

export interface Prepared {
  option: Option;
  cls: MoveClass;
  spec: MoveSpec;
}

function countOtherAnchors(st: ClimbState, limb: Limb): number {
  let n = 0;
  for (const l in st.anchors) if (l !== limb && !(st.feet_cut && limbKind(l as Limb) === 'foot')) n++;
  return n;
}

/** The holds the hands are on, each once, the left hand's first. */
function handHoldIds(st: ClimbState): string[] {
  const { LH, RH } = st.anchors;
  return LH ? (RH && RH !== LH ? [LH, RH] : [LH]) : RH ? [RH] : [];
}

/** The mantle onto the finish: made from the mantle posture with the hand on the finish hold (05b §2). */
export function canMantle(geom: RouteGeom, st: ClimbState): Limb | null {
  const fin = geom.route.finish_hold;
  if (st.anchors.LH === fin) return 'LH';
  if (st.anchors.RH === fin) return 'RH';
  return null;
}

/** Prepare a move. `cls` undefined picks the default (first legal) class. Returns null when illegal. */
export function prepareMove(geom: RouteGeom, ath: Athlete, st: ClimbState, limb: Limb, holdId: string, cls?: MoveClass): Prepared | null {
  const hold = geom.holds.get(holdId);
  if (!hold) return null;
  if (cls === 'mantle') {
    if (canMantle(geom, st) !== limb || holdId !== geom.route.finish_hold) return null;
    const mst: ClimbState = { ...st, posture: 'mantle' };
    const spec = specFor(geom, ath, mst, limb, hold, 'mantle', 0);
    const option: Option = { limb, hold, verdict: 'reachable', reason: '', d: 0, R: 1, classes: ['mantle'] };
    return { option, cls: 'mantle', spec };
  }
  const bp = bodyPoints(geom, ath, freeState(st, limb));
  const option = judgeOption(geom, ath, st, bp, limb, hold);
  if (option.classes.length === 0) return null;
  const chosen = cls && option.classes.includes(cls) ? cls : cls ? null : option.classes[0]!;
  if (!chosen) return null;
  const r = option.d / (option.R * CLASS_REACH[chosen]);
  return { option, cls: chosen, spec: specFor(geom, ath, st, limb, hold, chosen, r) };
}

function specFor(geom: RouteGeom, ath: Athlete, st: ClimbState, limb: Limb, hold: HoldG, cls: MoveClass, r: number): MoveSpec {
  return {
    kind: limbKind(limb), type: hold.type, size: hold.size, quality: hold.quality, sharpness: hold.sharpness,
    angle: hold.angle, feature: hold.feature, cls, r, pq: positionQuality(geom, ath, st), posture: st.posture,
    O: orientationTerm(hold, limbKind(limb)), friction: hold.friction, otherAnchors: countOtherAnchors(st, limb),
    rock: geom.route.rock,
  };
}

/** State after a successful move: the limb lands, feet come back on if a foot was placed, posture recomputed. */
export function applyMove(geom: RouteGeom, ath: Athlete, st: ClimbState, limb: Limb, holdId: string, cls: MoveClass): ClimbState {
  const anchors = { ...st.anchors, [limb]: holdId };
  let feet_cut = st.feet_cut;
  if (limbKind(limb) === 'foot') feet_cut = false;
  const next: ClimbState = { anchors, posture: st.posture, feet_cut };
  if (cls === 'mantle') return { ...next, posture: 'mantle' };
  return { ...next, posture: choosePosture(geom, ath, next) };
}

/**
 * Δpump of the next shake at a stance (05b §6), averaged over the holds the hands are on: the rest value the climber
 * reads, and the number the grade engine walks.
 */
export function stanceRest(geom: RouteGeom, ath: Athlete, st: ClimbState, shakeIndex: number, reserve: number, overgrip: number): number {
  const ids = handHoldIds(st);
  if (ids.length === 0) return 0;
  let sum = 0;
  for (const id of ids) {
    const h = geom.holds.get(id)!;
    sum += restDelta(ath, { restValue: rawRestValue(h, st.posture), type: h.type, angle: h.angle, posture: st.posture, shakeIndex, reserve, overgrip });
  }
  return sum / ids.length;
}

/** Pump cost of holding the stance for 10 s (05b §6), averaged over the holds the hands are on. */
export function stanceHoldCost(geom: RouteGeom, st: ClimbState): number {
  const ids = handHoldIds(st);
  if (ids.length === 0) return 0;
  let sum = 0;
  for (const id of ids) {
    const h = geom.holds.get(id)!;
    sum += holdCost({ restValue: rawRestValue(h, st.posture), type: h.type, angle: h.angle, posture: st.posture });
  }
  return sum / ids.length;
}

/**
 * Chalking up (05b §1, docs/24 §3.1): when the chalk on the hands is below `below`, the climber dips a hand: `time` s,
 * `pumpShare` of the stance's hold cost, and `gain` chalk back. Each hand move wears `wear` off. The attempt loop and, on
 * a route, the grade engine both follow it. P1a also waited for pump under 60; on a route that left a pumped climber on
 * dry hands for the hardest moves, and made play and grading part ways over a point or two of pump (docs/26). A boulder
 * never wears its chalk down to `below`. **(tune)**
 */
export const CHALK_RULE = { below: 35, gain: 60, time: 4, pumpShare: 0.4, wear: 5 };
export const chalkNow = (chalk: number): boolean => chalk < CHALK_RULE.below;

/**
 * The climber's shake-out rule (docs/24 §3.1): shake when pumped, on a stance that gives back at least `gain` pump,
 * a few times at most. The attempt loop and the grade engine both follow it. **(tune)**
 */
export const SHAKE_RULE = { pump: 35, gain: -1.5, shakes: 3 };
export const shakeNow = (pump: number, delta: number, shakes: number): boolean =>
  pump >= SHAKE_RULE.pump && delta <= SHAKE_RULE.gain && shakes < SHAKE_RULE.shakes;

