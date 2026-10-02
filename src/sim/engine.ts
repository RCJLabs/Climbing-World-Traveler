// Bridges geometry (wall.ts) and resolution (resolve.ts): turns "this limb onto that hold with this class"
// into a MoveSpec and an evaluation. Used identically by play, previews, auto-climb and the grade engine.

import type { Athlete } from './character';
import { CLASS_REACH } from './tables';
import {
  autoCommitPApex, evaluate, pComplete, probs, recoveryChance, type Conditions, type Evaluation, type MoveSpec, type MoveState, type Probs,
} from './resolve';
import {
  bodyPoints, choosePosture, freeState, judgeOption, limbKind, orientationTerm, positionQuality, type ClimbState, type HoldG, type Option, type RouteGeom,
} from './wall';
import type { Limb, MoveClass } from './types';

export interface Prepared {
  option: Option;
  cls: MoveClass;
  spec: MoveSpec;
}

const countOtherAnchors = (st: ClimbState, limb: Limb): number =>
  (Object.entries(st.anchors) as [Limb, string][]).filter(([l]) => l !== limb && !(st.feet_cut && limbKind(l) === 'foot')).length;

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

export interface Preview {
  evaluation: Evaluation;
  probs: Probs;
  /** Probability the move completes, including the expected commit outcome for dynamic moves. */
  p_complete: number;
  p_recover: number;
  /** Expected pump added, including sketchy and slip costs (05b §7). */
  pump_ev: number;
  /** Position quality of the state after the move (stars). */
  pq_after: number;
  dynamic: boolean;
  p_apex_auto: number;
}

/** The decision triangle for a candidate move (05b §7). Dynamic moves assume Auto-commit expectations. */
export function preview(geom: RouteGeom, ath: Athlete, st: ClimbState, ms: MoveState, cond: Conditions, prep: Prepared): Preview {
  const e = evaluate(ath, prep.spec, ms, cond);
  const dynamic = prep.cls === 'deadpoint' || prep.cls === 'dyno';
  const pA = dynamic ? autoCommitPApex(ath) : 0;
  const margin = e.margin + (dynamic ? 0.4 * pA - 0.1 : 0);
  const p = probs(margin, e.T);
  const pRec = recoveryChance(ath, prep.spec.kind, prep.spec.otherAnchors);
  const after = applyMove(geom, ath, st, prep.option.limb, prep.option.hold.id, prep.cls);
  const pumpEv = e.pump_cost * (1 - 0.2 * pA) * (p.clean + 1.5 * p.sketchy + 1.5 * p.slip);
  return {
    evaluation: e, probs: p, p_complete: pComplete(p), p_recover: pRec, pump_ev: pumpEv,
    pq_after: positionQuality(geom, ath, after), dynamic, p_apex_auto: pA,
  };
}
