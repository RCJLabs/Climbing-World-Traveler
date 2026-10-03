// Grade engine (docs/05c). Runs the play engine in expected-value mode against the Reference Climber.

import { NEUTRAL_MODS, refFat, refMass, type Athlete } from './character';
import { applyMove, CHALK_RULE, chalkNow, prepareMove, shakeNow, stanceHoldCost, stanceRest, type Prepared } from './engine';
import { autoCommitPApex, chalkTerm, climbClear, evaluate, moveDifficulty, powerPool, probs, PUMP_FORM, pumpHolds, recoveryChance, REFERENCE_CONDITIONS, reserveStart, sRef, type Conditions, type Evaluation, type MoveState } from './resolve';
import { boltPassed, boltsOf, clipCost, clipFrom, GRADE_BELAY_QUALITY, isRoped, ropeKappa, URGENT_KAPPA } from './rope';
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
  /** Stances the climber shook out on. */
  rests: number;
  /** Expected seconds on the wall, and the aerobic reserve left at the end. */
  time_s: number;
  reserve: number;
}

export interface WalkOptions {
  cond?: Conditions;
  fam?: number;
  spotQuality?: number;
  /** Called once per resolved step, for probes and debugging; does not change the walk. */
  trace?: (step: number, chosen: Prepared, e: Evaluation, pMove: number, pump: number) => void;
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

/**
 * Expected-value walk of the beta line (05c §2.1), with the climber's own tactics on the way: shaking out where it
 * would (docs/24 §3.1), and on a rope clipping each bolt where it would (07 §2.1). The aerobic reserve drains with
 * time on the wall (05b §6), so late rests give back less. On a route the chalk on the hands wears off and the climber
 * re-chalks, as in play; a boulder is too short for that to matter and keeps the grading reference's fresh chalk.
 */
export function evWalk(geom: RouteGeom, ath: Athlete, opts: WalkOptions = {}): WalkResult {
  const cond = opts.cond ?? REFERENCE_CONDITIONS;
  const fam = opts.fam ?? 0;
  const spot = opts.spotQuality ?? 50;
  const route = geom.route;
  let st = startState(geom, ath);
  const pool = powerPool(ath);
  const ms: MoveState = { pump: 0, power: pool, focus_meter: ath.a.focus, overgrip: 0, under: 0, energy: 100, skin: 100, fam };
  const pA = autoCommitPApex(ath);
  const out: WalkResult = {
    p_send: 1, pump_peak: 0, margins: [], mds: [], ungradeable: false, kappa_max: 0, dynamic_moves: 0, hand_moves: 0,
    rests: 0, time_s: 0, reserve: reserveStart(ath),
  };
  // On a rope the first bolt is stick-clipped (07 §2.4, a tactic), so the route starts on the rope.
  const roped = isRoped(route);
  const bolts = roped ? boltsOf(route) : [];
  let next = bolts.length ? 1 : 0;
  let lastClipY: number | null = bolts.length ? bolts[0]!.y : null;
  let skipped = false;
  let shakes = 0;
  let chalk = 100;
  const comY = (s: ClimbState): number => yOfS(route.wall, bodyPoints(geom, ath, s).CoM.s);
  for (let i = 0; i < route.beta_line.length; i++) {
    const step = route.beta_line[i]!;
    // The climber's height where it stands before this step: clipping and fall consequence both read it.
    const y = roped ? comY(st) : 0;
    if (roped) {
      for (let bolt = bolts[next]; bolt; bolt = bolts[next]) {
        const urgent = ropeKappa(route, y, lastClipY, GRADE_BELAY_QUALITY, skipped) >= URGENT_KAPPA;
        const from = clipFrom(geom, st, bolt, i, urgent);
        if (from) {
          const c = clipCost(ath, from.type, from.angle);
          ms.pump += c.pump;
          out.time_s += c.time;
          out.reserve = Math.max(0, out.reserve - c.time / 10);
          lastClipY = bolt.y;
          skipped = false;
          next++;
        } else if (boltPassed(geom, st, bolt, i)) {
          skipped = true;
          next++;
        } else break;
      }
    }
    for (;;) {
      const d = stanceRest(geom, ath, st, shakes + 1, out.reserve, 0);
      if (!shakeNow(ms.pump, d, shakes)) break;
      ms.pump = Math.max(0, ms.pump + d);
      ms.power = Math.min(pool, ms.power + 2);
      out.reserve = Math.max(0, out.reserve - 1);
      out.time_s += 10;
      if (shakes === 0) out.rests++;
      shakes++;
    }
    if (roped && chalkNow(chalk)) {
      ms.pump += CHALK_RULE.pumpShare * stanceHoldCost(geom, st);
      out.time_s += CHALK_RULE.time;
      out.reserve = Math.max(0, out.reserve - CHALK_RULE.time / 10);
      chalk = Math.min(100, chalk + CHALK_RULE.gain);
    }
    // The step's class when legal for this body, else the first legal class (05c §2.1).
    const chosen = prepareMove(geom, ath, st, step.limb, step.hold, step.class)
      ?? (step.class === 'mantle' ? null : prepareMove(geom, ath, st, step.limb, step.hold));
    if (!chosen) { out.ungradeable = true; out.p_send = 0; return out; }
    out.kappa_max = Math.max(out.kappa_max, roped ? ropeKappa(route, y, lastClipY, GRADE_BELAY_QUALITY, skipped) : boulderKappa(geom, ath, st, spot));
    const condNow = roped ? { ...cond, chalk_term: chalkTerm(chalk) } : cond;
    const e = evaluate(ath, chosen.spec, ms, condNow);
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
      const e2 = evaluate(ath, chosen.spec, { ...ms, pump: ms.pump + 1.5 * cost1 }, condNow);
      const q = probs(e2.margin + bonus, e2.T);
      p2 = q.clean + q.sketchy;
      cost2 = e2.pump_cost * pumpScale;
    }
    const pMove = p.clean + p.sketchy + p.slip * pRec * p2;
    opts.trace?.(out.margins.length, chosen, e, pMove, ms.pump);
    out.p_send *= pMove;
    out.margins.push(e.margin + bonus);
    out.mds.push(moveDifficulty(chosen.spec).MD);
    ms.pump += cost1 * (p.clean + 1.5 * p.sketchy + 1.5 * p.slip) + p.slip * pRec * cost2 * 1.25;
    ms.power = Math.max(0, ms.power - e.power_cost);
    if (roped && chosen.spec.kind === 'hand') ms.pump = Math.max(0, ms.pump - climbClear(ath, e.time, out.reserve));
    out.pump_peak = Math.max(out.pump_peak, ms.pump);
    out.time_s += e.time;
    out.reserve = Math.max(0, out.reserve - e.time / 10);
    // Past the highest pump the hands can hold on any day (PUMP_FORM), the walk is over.
    if (ms.pump >= 100 + PUMP_FORM.z * PUMP_FORM.sd) { out.p_send = 0; return out; }
    st = applyMove(geom, ath, st, chosen.option.limb, chosen.option.hold.id, chosen.cls);
    shakes = 0;
    if (chosen.spec.kind === 'hand') chalk = Math.max(0, chalk - CHALK_RULE.wear);
  }
  if (roped) {
    // Clip the anchor from the finish jug.
    const fin = geom.holds.get(route.finish_hold);
    if (fin) {
      const c = clipCost(ath, fin.type, fin.angle);
      ms.pump += c.pump;
      out.time_s += c.time;
      out.pump_peak = Math.max(out.pump_peak, ms.pump);
    }
  }
  // The hands open somewhere around pump 100 on the day (PUMP_FORM): the walk's peak has to stay under that.
  out.p_send *= pumpHolds(out.pump_peak);
  return out;
}

export interface GradeResult {
  di: number | null;
  /** A move on the line is illegal for the Reference Climber's body: no DI can send it. */
  ungradeable: boolean;
  danger: Route['danger'];
  components: NonNullable<Route['components']>;
  curve: [number, number][];
}

const grid = (i: number): number => DI_MIN + i * STEP;
const GRID_N = Math.round((DI_MAX - DI_MIN) / STEP);

/**
 * The grid bracket where a route's send curve crosses X_SEND, searched outward from `start`: steps of 1, 2, 4… grid
 * points until the curve is bracketed, then bisection. On a non-decreasing curve (C3) it is the bracket a bisection
 * of the whole grid finds, in three or four walks instead of nine when `start` is near the grade. 'top': no DI on the
 * grid sends it; 'bottom': the easiest does.
 */
function bracketFrom(ok: (i: number) => boolean, start: number): { lo: number; hi: number } | 'top' | 'bottom' {
  let lo: number;
  let hi: number;
  if (ok(start)) {
    hi = start;
    for (let step = 1; ; step *= 2) {
      if (hi === 0) return 'bottom';
      lo = Math.max(0, hi - step);
      if (!ok(lo)) break;
      hi = lo;
    }
  } else {
    lo = start;
    for (let step = 1; ; step *= 2) {
      if (lo === GRID_N) return 'top';
      hi = Math.min(GRID_N, lo + step);
      if (ok(hi)) break;
      lo = hi;
    }
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ok(mid)) hi = mid; else lo = mid;
  }
  return { lo, hi };
}

/**
 * Grade a route (05c §2): DI where the Reference Climber's send probability crosses X_SEND. A boulder bisects the
 * whole grid; a route, a hundred-odd moves a walk, searches outward from its target (P1b, docs/26).
 */
export function gradeRoute(route: Route, geom: RouteGeom = routeGeom(route)): GradeResult {
  const cache = new Map<number, WalkResult>();
  const walk = (i: number): WalkResult => {
    let w = cache.get(i);
    if (!w) { w = evWalk(geom, referenceAthlete(grid(i))); cache.set(i, w); }
    return w;
  };
  let di: number | null = null;
  let top: WalkResult | null = null;
  if (isRoped(route)) {
    const start = Math.min(GRID_N, Math.max(0, Math.round((route.di_target - DI_MIN) / STEP)));
    const b = bracketFrom((i) => walk(i).p_send >= X_SEND, start);
    if (b === 'bottom') di = DI_MIN;
    else if (b !== 'top') {
      const pa = walk(b.lo).p_send;
      const pb = walk(b.hi).p_send;
      di = grid(b.lo) + ((X_SEND - pa) / Math.max(1e-9, pb - pa)) * STEP;
    }
  } else {
    top = walk(GRID_N);
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
  }
  // An illegal move is illegal at every DI: the reference body never changes (05c §1.1), so any walk tells.
  const ungradeable = [...cache.values()].some((w) => w.ungradeable);
  const at = di === null ? (top ??= walk(GRID_N)) : walk(Math.min(GRID_N, Math.max(0, Math.round((di - DI_MIN) / STEP))));
  const T = 0.9;
  const kappa = at.kappa_max;
  const danger: Route['danger'] = kappa < 0.15 ? 'safe' : kappa < 0.4 ? 'spicy' : kappa < 0.75 ? 'bold' : 'deadly';
  const components = {
    hardest_move: Math.max(...at.mds),
    crux_density: at.margins.filter((m) => m < 0.5 * T).length,
    pump_peak: at.pump_peak,
    rests: at.rests,
    dynamic_share: at.hand_moves ? at.dynamic_moves / at.hand_moves : 0,
  };
  const curve = [...cache.entries()].sort((x, y) => x[0] - y[0]).map(([i, w]) => [grid(i), w.p_send] as [number, number]);
  return { di, ungradeable, danger, components, curve };
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
