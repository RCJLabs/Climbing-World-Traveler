// Grade engine (docs/05c). Runs the play engine in expected-value mode against the Reference Climber.

import { NEUTRAL_MODS, refFat, refMass, type Athlete } from './character';
import { applyMove, prepareMove } from './engine';
import { autoCommitPApex, evaluate, moveDifficulty, probs, recoveryChance, REFERENCE_CONDITIONS, sRef, type Conditions, type MoveState } from './resolve';
import { ALL_ATTRS, type AttrId, type Body, type Route } from './types';
import { bodyPoints, choosePosture, LOCKOFF, routeGeom, yOfS, type ClimbState, type RouteGeom } from './wall';

export const X_SEND = 0.35;
export const DI_MIN = 8;
export const DI_MAX = 33;
const STEP = 0.25;

export const REFERENCE_BODY: Body = {
  sex: 'm', age_start: 25, height_cm: 170, mass_kg: refMass('m', 170), body_fat_pct: refFat('m'), ape_index: 1.0,
  finger_length: 0, finger_girth: 0, leg_torso: 0, natural_hip_mobility: 50, natural_shoulder_mobility: 50,
  fibre_bias: 0, tendon_robustness: 50, skin_thickness: 'normal', skin_moisture: 'normal',
  // Reach is pinned like mobility: a lift that grew with its lockoff would change its legal move classes along the scale.
  lock_depth_m: LOCKOFF.ref,
};

/** Reference Climber at DI n (05c §1.1): every matrix attribute equals S_ref(n). */
export function referenceAthlete(di: number): Athlete {
  const s = sRef(di);
  const a = {} as Record<AttrId, number>;
  for (const id of ALL_ATTRS) a[id] = s;
  a.hip_mobility = 50;
  a.shoulder_mobility = 50;
  a.skin_durability = 50;
  for (const id of ['composure', 'focus', 'confidence', 'commitment', 'risk_judgement', 'resilience'] as const) a[id] = 50;
  for (const id of ['nutrition', 'sleep_hygiene', 'logistics', 'languages', 'weather_sense'] as const) a[id] = 25;
  return { body: REFERENCE_BODY, a, mods: NEUTRAL_MODS, rock_knowledge: {} };
}

export interface WalkResult {
  p_send: number;
  pump_peak: number;
  margins: number[];
  mds: number[];
  ungradeable: boolean;
  kappa_max: number;
  dynamic_moves: number;
  hand_moves: number;
}

export interface WalkOptions {
  cond?: Conditions;
  fam?: number;
  spotQuality?: number;
}

export function startState(geom: RouteGeom, ath: Athlete): ClimbState {
  const st: ClimbState = { anchors: { ...geom.route.start }, posture: 'hang', feet_cut: false };
  return { ...st, posture: choosePosture(geom, ath, st) };
}

/** Boulder fall consequence κ from a state (05b §11). */
export function boulderKappa(geom: RouteGeom, ath: Athlete, st: ClimbState, spotQuality: number): number {
  const pad = geom.route.protection.find((p) => p.kind === 'pad_zone');
  const padTop = pad?.y ?? 0.3;
  const coverage = pad?.quality ?? 0.6;
  const bp = bodyPoints(geom, ath, st);
  const h = Math.max(0, yOfS(geom.route.wall, bp.CoM.s) - padTop);
  return Math.min(1, Math.max(0, 0.03 * h * h * (1 - 0.6 * coverage) * (1 - 0.3 * spotQuality / 100)));
}

/** Expected-value walk of the beta line (05c §2.1). */
export function evWalk(geom: RouteGeom, ath: Athlete, opts: WalkOptions = {}): WalkResult {
  const cond = opts.cond ?? REFERENCE_CONDITIONS;
  const fam = opts.fam ?? 0;
  const spot = opts.spotQuality ?? 50;
  let st = startState(geom, ath);
  const ms: MoveState = { pump: 0, power: ath.a.anaerobic_capacity, focus_meter: ath.a.focus, overgrip: 0, under: 0, energy: 100, skin: 100, fam };
  const pA = autoCommitPApex(ath);
  const out: WalkResult = { p_send: 1, pump_peak: 0, margins: [], mds: [], ungradeable: false, kappa_max: 0, dynamic_moves: 0, hand_moves: 0 };
  for (const step of geom.route.beta_line) {
    // The step's class when legal for this body, else the first legal class (05c §2.1).
    const chosen = prepareMove(geom, ath, st, step.limb, step.hold, step.class)
      ?? (step.class === 'mantle' ? null : prepareMove(geom, ath, st, step.limb, step.hold));
    if (!chosen) { out.ungradeable = true; out.p_send = 0; return out; }
    out.kappa_max = Math.max(out.kappa_max, boulderKappa(geom, ath, st, spot));
    const e = evaluate(ath, chosen.spec, ms, cond);
    const dynamic = chosen.cls === 'deadpoint' || chosen.cls === 'dyno';
    if (chosen.spec.kind === 'hand') out.hand_moves++;
    if (dynamic) out.dynamic_moves++;
    const bonus = dynamic ? 0.4 * pA - 0.1 : 0;
    const pumpScale = dynamic ? 1 - 0.2 * pA : 1;
    const p = probs(e.margin + bonus, e.T);
    const pRec = recoveryChance(ath, chosen.spec.kind, chosen.spec.otherAnchors);
    const cost1 = e.pump_cost * pumpScale;
    let p2 = 0;
    let cost2 = 0;
    if (p.slip > 0 && pRec > 0) {
      const e2 = evaluate(ath, chosen.spec, { ...ms, pump: ms.pump + 1.5 * cost1 }, cond);
      const q = probs(e2.margin + bonus, e2.T);
      p2 = q.clean + q.sketchy;
      cost2 = e2.pump_cost * pumpScale;
    }
    const pMove = p.clean + p.sketchy + p.slip * pRec * p2;
    out.p_send *= pMove;
    out.margins.push(e.margin + bonus);
    out.mds.push(moveDifficulty(chosen.spec).MD);
    ms.pump += cost1 * (p.clean + 1.5 * p.sketchy + 1.5 * p.slip) + p.slip * pRec * cost2 * 1.25;
    ms.power = Math.max(0, ms.power - e.power_cost);
    out.pump_peak = Math.max(out.pump_peak, ms.pump);
    if (ms.pump >= 100) { out.p_send = 0; return out; }
    st = applyMove(geom, ath, st, chosen.option.limb, chosen.option.hold.id, chosen.cls);
  }
  return out;
}

export interface GradeResult {
  di: number | null;
  danger: Route['danger'];
  components: NonNullable<Route['components']>;
  curve: [number, number][];
}

const grid = (i: number): number => DI_MIN + i * STEP;
const GRID_N = Math.round((DI_MAX - DI_MIN) / STEP);

/** Grade a route (05c §2): DI where the Reference Climber's send probability crosses X_SEND. */
export function gradeRoute(route: Route, geom: RouteGeom = routeGeom(route)): GradeResult {
  const cache = new Map<number, WalkResult>();
  const walk = (i: number): WalkResult => {
    let w = cache.get(i);
    if (!w) { w = evWalk(geom, referenceAthlete(grid(i))); cache.set(i, w); }
    return w;
  };
  let di: number | null = null;
  const top = walk(GRID_N);
  if (top.p_send < X_SEND) di = null;
  else if (walk(0).p_send >= X_SEND) di = DI_MIN;
  else {
    let lo = 0;
    let hi = GRID_N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (walk(mid).p_send >= X_SEND) hi = mid; else lo = mid;
    }
    const a = walk(lo).p_send;
    const b = walk(hi).p_send;
    di = grid(lo) + ((X_SEND - a) / Math.max(1e-9, b - a)) * STEP;
  }
  const at = di === null ? top : walk(Math.min(GRID_N, Math.max(0, Math.round((di - DI_MIN) / STEP))));
  const T = 0.9;
  const kappa = at.kappa_max;
  const danger: Route['danger'] = kappa < 0.15 ? 'safe' : kappa < 0.4 ? 'spicy' : kappa < 0.75 ? 'bold' : 'deadly';
  const components = {
    hardest_move: Math.max(...at.mds),
    crux_density: at.margins.filter((m) => m < 0.5 * T).length,
    pump_peak: at.pump_peak,
    rests: 0,
    dynamic_share: at.hand_moves ? at.dynamic_moves / at.hand_moves : 0,
  };
  const curve = [...cache.entries()].sort((x, y) => x[0] - y[0]).map(([i, w]) => [grid(i), w.p_send] as [number, number]);
  return { di, danger, components, curve };
}

/** Full P_send curve for tests and tuning (C3 monotonicity). */
export function sendCurve(route: Route, from = DI_MIN, to = DI_MAX, step = STEP): [number, number][] {
  const geom = routeGeom(route);
  const out: [number, number][] = [];
  for (let d = from; d <= to + 1e-9; d += step) out.push([d, evWalk(geom, referenceAthlete(d)).p_send]);
  return out;
}

/** Send probability for any athlete on a route (EV mode), e.g. for the character sheet and the harness. */
export function sendProbability(route: Route, ath: Athlete, opts: WalkOptions = {}): number {
  return evWalk(routeGeom(route), ath, opts).p_send;
}
