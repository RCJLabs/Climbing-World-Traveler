// Wall geometry and kinematics (docs/05a). Deterministic: no probabilities, no dice.

import { kinematics, type Athlete } from './character';
import {
  canonicalOrientation, CLASS_REACH, MATCHABLE, norm180, PF_FOOT, PF_HAND, POSTURE_OFFSETS, Q_CLASS, REST_BASE,
} from './tables';
import type { Feature, Hold, HoldType, Limb, LimbKind, MoveClass, Posture, Route, Tag, WallSegment } from './types';

export const limbKind = (l: Limb): LimbKind => (l === 'LH' || l === 'RH' ? 'hand' : 'foot');
export const otherHand = (l: Limb): Limb => (l === 'LH' ? 'RH' : l === 'RH' ? 'LH' : l === 'LF' ? 'RF' : 'LF');

const rad = (deg: number): number => (deg * Math.PI) / 180;

// ---------------------------------------------------------------- surface coordinates (05a §1.1)

export interface HoldG extends Hold {
  s: number;
  z: number;
  angle: number;
  feature: Feature;
}

export interface RouteGeom {
  route: Route;
  holds: Map<string, HoldG>;
  list: HoldG[];
  /** Total surface length to the top of the wall. */
  s_top: number;
}

export function segmentAt(wall: readonly WallSegment[], y: number): WallSegment {
  for (const seg of wall) if (y >= seg.y0 && y < seg.y1) return seg;
  return wall[wall.length - 1]!;
}

/** Arc length up the profile to height y (05a §1.1). */
export function sOfY(wall: readonly WallSegment[], y: number): number {
  let s = 0;
  for (const seg of wall) {
    const sin = Math.sin(rad(seg.angle));
    if (y >= seg.y1) s += (seg.y1 - seg.y0) / sin;
    else {
      s += Math.max(0, y - seg.y0) / sin;
      break;
    }
  }
  return s;
}

/** Horizontal offset of the wall face at height y (05a §1.1); positive leans out towards the climber. */
export function zOfY(wall: readonly WallSegment[], y: number): number {
  let z = 0;
  for (const seg of wall) {
    const cot = Math.cos(rad(seg.angle)) / Math.sin(rad(seg.angle));
    if (y >= seg.y1) z += -(seg.y1 - seg.y0) * cot;
    else {
      z += -Math.max(0, y - seg.y0) * cot;
      break;
    }
  }
  return z;
}

/** Inverse of sOfY: height for a surface coordinate. */
export function yOfS(wall: readonly WallSegment[], s: number): number {
  let acc = 0;
  for (const seg of wall) {
    const sin = Math.sin(rad(seg.angle));
    const len = (seg.y1 - seg.y0) / sin;
    if (s <= acc + len) return seg.y0 + (s - acc) * sin;
    acc += len;
  }
  const last = wall[wall.length - 1]!;
  return last.y1 + (s - acc) * Math.sin(rad(last.angle));
}

export function routeGeom(route: Route): RouteGeom {
  const holds = new Map<string, HoldG>();
  const list: HoldG[] = [];
  for (const h of route.holds) {
    const seg = segmentAt(route.wall, h.y);
    const g: HoldG = { ...h, s: sOfY(route.wall, h.y), z: zOfY(route.wall, h.y), angle: seg.angle, feature: seg.feature };
    holds.set(h.id, g);
    list.push(g);
  }
  const top = route.wall[route.wall.length - 1]!.y1;
  return { route, holds, list, s_top: sOfY(route.wall, top) };
}

// ---------------------------------------------------------------- climber state and body points (05a §4)

export interface ClimbState {
  anchors: Partial<Record<Limb, string>>;
  posture: Posture;
  feet_cut: boolean;
}

export interface Pt { x: number; s: number; }

export interface BodyPoints {
  C: Pt;
  C_hands: Pt | null;
  shoulder: Pt;
  hip: Pt;
  CoM: Pt;
  feetOn: number;
  handsOn: number;
}

const centroid = (pts: Pt[]): Pt | null =>
  pts.length === 0 ? null : { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, s: pts.reduce((s, p) => s + p.s, 0) / pts.length };

/** The state with one limb released: reach is measured for a free limb (05a §5.1). */
export function freeState(st: ClimbState, limb: Limb): ClimbState {
  const anchors = { ...st.anchors };
  const otherOfKind = limbKind(limb) === 'hand' ? anchors[otherHand(limb)] : anchors[otherHand(limb)];
  if (otherOfKind || limbKind(limb) === 'foot') delete anchors[limb];
  return { ...st, anchors };
}

/**
 * Lock-off (05a §4.2). With one hand on and the feet on, the shoulder rises from the body centre to a lock below
 * the holding hand: `depth[0]` at `lockoff 0`, `depth[1]` at `lockoff 100` (metres at 170 cm), but never higher
 * than `stand` × (leg + torso) above the feet, and never lower than the body-centre position. The Reference
 * Climber's depth is pinned at `ref` (its body's `lock_depth_m`), the depth at `lockoff ≈ 29`, so the DI scale
 * keeps one reach (05c §1.1). **(tune)**
 */
export const LOCKOFF = { depth: [0.40, 0.05] as const, ref: 0.30, stand: 0.9 };

/** Lock depth (m at 170 cm) for an athlete: pinned on the Reference Climber, else from effective `lockoff`. */
export function lockDepth(ath: Athlete): number {
  if (ath.body.lock_depth_m !== undefined) return ath.body.lock_depth_m;
  const lo = Math.min(100, Math.max(0, ath.a.lockoff * (ath.mods.attr_mult.lockoff ?? 1))) / 100;
  return LOCKOFF.depth[0] + (LOCKOFF.depth[1] - LOCKOFF.depth[0]) * lo;
}

export function bodyPoints(geom: RouteGeom, ath: Athlete, st: ClimbState): BodyPoints {
  const k = kinematics(ath.body);
  const scale = k.height_m / 1.7;
  const hands: Pt[] = [];
  const feet: Pt[] = [];
  for (const limb of ['LH', 'RH', 'LF', 'RF'] as Limb[]) {
    const id = st.anchors[limb];
    if (!id) continue;
    const h = geom.holds.get(id);
    if (!h) continue;
    (limbKind(limb) === 'hand' ? hands : feet).push({ x: h.x, s: h.s });
  }
  const C_hands = centroid(hands);
  const C_feet = st.feet_cut ? null : centroid(feet);
  let C: Pt;
  if (C_hands && C_feet) C = { x: 0.5 * C_hands.x + 0.5 * C_feet.x, s: 0.5 * C_hands.s + 0.5 * C_feet.s };
  else if (C_hands) C = { x: C_hands.x, s: C_hands.s - 0.45 * scale };
  else if (C_feet) C = { x: C_feet.x, s: C_feet.s + 0.9 * scale };
  else C = { x: 0, s: 1 };
  const off = POSTURE_OFFSETS[st.posture];
  // Lateral offsets point towards the side with the higher foot (dropped knee / layback side).
  let side = 0;
  if (off.hip[0] !== 0 || off.sh[0] !== 0) {
    const lf = st.anchors.LF ? geom.holds.get(st.anchors.LF) : undefined;
    const rf = st.anchors.RF ? geom.holds.get(st.anchors.RF) : undefined;
    side = lf && rf ? (rf.s > lf.s ? 1 : -1) : 1;
  }
  const shoulder = { x: C.x + side * off.sh[0] * scale, s: C.s + off.sh[1] * scale };
  const hip = { x: C.x + side * off.hip[0] * scale, s: C.s + off.hip[1] * scale };
  if (hands.length === 1 && C_feet) {
    const torso = k.height_m - k.leg_len - 0.13 * k.height_m;
    shoulder.s = Math.max(shoulder.s, Math.min(hands[0]!.s - lockDepth(ath) * scale, C_feet.s + LOCKOFF.stand * (k.leg_len + torso)));
  }
  return {
    C, C_hands, shoulder, hip,
    CoM: { x: hip.x, s: hip.s + 0.1 * scale },
    feetOn: st.feet_cut ? 0 : feet.length,
    handsOn: hands.length,
  };
}

// ---------------------------------------------------------------- reach (05a §5)

export function reachRadius(ath: Athlete, kind: LimbKind, posture: Posture): number {
  const k = kinematics(ath.body);
  if (kind === 'hand') return k.arm_len * (0.85 + 0.15 * ath.a.shoulder_mobility / 100) * PF_HAND[posture] * ath.mods.reach_mult;
  return k.leg_len * (0.7 + 0.3 * ath.a.hip_mobility / 100) * PF_FOOT[posture] * ath.mods.reach_mult;
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.s - b.s);

export type Verdict = 'reachable' | 'deadpoint' | 'dyno' | 'too_far' | 'blocked' | 'wrong_side' | 'occupied';

export interface Option {
  limb: Limb;
  hold: HoldG;
  verdict: Verdict;
  reason: string;
  d: number;
  R: number;
  classes: MoveClass[];
}

export const angleTag = (angle: number): Tag => (angle < 85 ? 'slab' : angle <= 95 ? 'vertical' : angle <= 130 ? 'overhang' : 'roof');

export function terrainTags(angle: number, posture: Posture, feature: Feature): Set<Tag> {
  const t = new Set<Tag>([angleTag(angle)]);
  if (posture === 'compression') t.add('compression');
  if (feature === 'arete') t.add('arete');
  return t;
}

/** Hands may use a hold given its orientation and the body position (05a §5.3). */
function handednessOk(limb: Limb, hold: HoldG, bp: BodyPoints, ath: Athlete): boolean {
  if (hold.feature === 'arete' || hold.feature === 'hueco') return true;
  if (hold.type === 'sidepull') {
    // Face points right (90): a right-hand sidepull on the right of the body; 270 mirrors it (05a §5.3).
    const right = Math.abs(norm180(hold.orientation - 90)) <= 90;
    return right ? limb === 'RH' && hold.x >= bp.C.x - 0.1 : limb === 'LH' && hold.x <= bp.C.x + 0.1;
  }
  if (hold.type === 'gaston') {
    if (ath.a.shoulder_mobility < 20) return false;
    const right = Math.abs(norm180(hold.orientation - 90)) <= 90;
    return right ? limb === 'LH' && hold.x >= bp.C.x : limb === 'RH' && hold.x <= bp.C.x;
  }
  if (hold.type === 'undercling') return hold.s < bp.shoulder.s + 0.1;
  return true;
}

/** A foot placed this far above the free-limb hip is a high step (05b §2; P1a tuning, see docs). */
export const HIGH_STEP_ABOVE_HIP = 0.05;

const HEEL_TYPES: readonly HoldType[] = ['jug', 'edge', 'sloper', 'horn', 'volume', 'pocket3', 'sidepull', 'crack_hand', 'crack_fist', 'crack_offwidth'];
const TOE_TYPES: readonly HoldType[] = ['jug', 'horn', 'volume', 'undercling', 'edge', 'crack_hand', 'crack_fist', 'crack_offwidth'];

/** Legal move classes for a limb onto a hold (05b §2). Default first. */
export function classesFor(geom: RouteGeom, st: ClimbState, bp: BodyPoints, limb: Limb, hold: HoldG, r: number): MoveClass[] {
  const kind = limbKind(limb);
  const out: MoveClass[] = [];
  if (kind === 'hand') {
    if (hold.type.startsWith('crack_')) return ['jam'];
    const other = st.anchors[otherHand(limb)];
    if (other === hold.id) return MATCHABLE(hold.type, hold.size) ? ['match'] : [];
    const feetOn = bp.feetOn;
    const handHolds = (['LH', 'RH'] as Limb[]).map((l) => st.anchors[l]).filter((x): x is string => !!x).map((id) => geom.holds.get(id)!);
    const deadpointLegal = feetOn >= 1 || (st.posture === 'hang' && handHolds.length === 2 && handHolds.every((h) => h.quality >= 0.5));
    const dynoLegal = feetOn >= 1 && hold.hands_ok && !['pocket1', 'undercling', 'gaston'].includes(hold.type);
    const cur = st.anchors[limb] ? geom.holds.get(st.anchors[limb]!) : undefined;
    if (r <= 0.9 && cur && dist(cur, hold) <= 0.35 && hold.s > cur.s && MATCHABLE(hold.type, hold.size)) out.push('bump');
    if (r <= 1.0) {
      out.push('static');
      if (deadpointLegal) out.push('deadpoint');
      if (dynoLegal) out.push('dyno');
    } else if (r <= 1.15) {
      if (deadpointLegal) out.push('deadpoint');
      if (dynoLegal) out.push('dyno');
    } else if (r <= 1.5 && dynoLegal) out.push('dyno');
    // Static first when legal; a bump is offered as the alternative.
    if (out[0] === 'bump' && out.includes('static')) { out.shift(); out.splice(1, 0, 'bump'); }
    return out;
  }
  if (!hold.feet_ok) return [];
  if (r > 1.0) return [];
  if (hold.s >= bp.hip.s + HIGH_STEP_ABOVE_HIP && hold.angle <= 130) return ['high_step'];
  const lateral = Math.abs(hold.x - bp.hip.x);
  if (hold.angle >= 100 && HEEL_TYPES.includes(hold.type) && hold.quality >= 0.4 && hold.s >= bp.hip.s - 0.3 && lateral >= 0.2) out.push('heel_hook');
  if (hold.angle >= 120 && TOE_TYPES.includes(hold.type) && hold.quality >= 0.5) out.push('toe_hook');
  out.push('static');
  return out;
}

const LIMB_NAME: Record<Limb, string> = { LH: 'left hand', RH: 'right hand', LF: 'left foot', RF: 'right foot' };

/** Verdict for one limb onto one hold (05a §5.2). `bp` must be the body points of `freeState(st, limb)`. */
export function judgeOption(geom: RouteGeom, ath: Athlete, st: ClimbState, bp: BodyPoints, limb: Limb, hold: HoldG): Option {
  const kind = limbKind(limb);
  const root = kind === 'hand' ? bp.shoulder : bp.hip;
  const R = reachRadius(ath, kind, st.posture);
  const d = dist(root, hold);
  const opt: Option = { limb, hold, verdict: 'reachable', reason: '', d, R, classes: [] };
  if (st.anchors[limb] === hold.id) return { ...opt, verdict: 'occupied', reason: 'already there' };
  if (kind === 'hand' ? !hold.hands_ok : !hold.feet_ok) return { ...opt, verdict: 'blocked', reason: kind === 'hand' ? 'a foothold' : 'not a foothold' };
  const occupiedBy = (Object.entries(st.anchors) as [Limb, string][]).find(([l, id]) => id === hold.id && l !== limb)?.[0];
  if (occupiedBy && (limbKind(occupiedBy) !== kind || kind === 'foot' || !MATCHABLE(hold.type, hold.size))) {
    return { ...opt, verdict: 'blocked', reason: `blocked: your ${LIMB_NAME[occupiedBy]}` };
  }
  const otherId = st.anchors[otherHand(limb)];
  const other = otherId ? geom.holds.get(otherId) : undefined;
  if (other && other.id !== hold.id) {
    const limit = kind === 'hand' ? 0.25 : 0.3;
    const rightSide = limb === 'RH' || limb === 'RF';
    if ((rightSide && hold.x < other.x - limit) || (!rightSide && hold.x > other.x + limit)) {
      return { ...opt, verdict: 'wrong_side', reason: `wrong side: use the other ${kind}` };
    }
  }
  if (kind === 'hand' && !handednessOk(limb, hold, bp, ath)) return { ...opt, verdict: 'wrong_side', reason: 'wrong side for this hold' };
  const maxR = kind === 'hand' ? 1.5 : 1.0;
  if (d > R * maxR) return { ...opt, verdict: 'too_far', reason: `out of reach: ${(d - R * maxR).toFixed(2)} m` };
  const r = d / R;
  const classes = classesFor(geom, st, bp, limb, hold, r);
  if (classes.length === 0) return { ...opt, verdict: 'too_far', reason: r > 1 ? 'needs a dyno: get a foot on first' : 'no legal move' };
  const verdict: Verdict = r <= 1 ? 'reachable' : r <= 1.15 ? 'deadpoint' : 'dyno';
  return { ...opt, verdict, reason: verdict === 'reachable' ? '' : verdict === 'deadpoint' ? 'deadpoint' : 'dyno only', classes };
}

/** Reach verdicts for every hold for a limb (05a §5.2). */
export function optionsFor(geom: RouteGeom, ath: Athlete, st: ClimbState, limb: Limb): Option[] {
  const bp = bodyPoints(geom, ath, freeState(st, limb));
  return geom.list.filter((h) => h.id !== st.anchors[limb]).map((h) => judgeOption(geom, ath, st, bp, limb, h));
}

/** Relative reach for a class: r = d / (R × class_reach). */
export const relReach = (d: number, R: number, cls: MoveClass): number => (cls === 'mantle' ? 0 : d / (R * CLASS_REACH[cls]));

// ---------------------------------------------------------------- posture (05a §6)

export function rawRestValue(hold: HoldG, posture: Posture): number {
  if (hold.feature === 'ledge') return 1;
  let rv = (hold.rest_value || REST_BASE[hold.type]) * (1 - 0.01 * Math.max(0, hold.angle - 95));
  if (posture === 'kneebar') rv = Math.min(1, rv + 0.5);
  return Math.max(0, rv);
}

function handHolds(geom: RouteGeom, st: ClimbState): HoldG[] {
  return (['LH', 'RH'] as Limb[]).map((l) => st.anchors[l]).filter((x): x is string => !!x).map((id) => geom.holds.get(id)!).filter(Boolean);
}
function footHolds(geom: RouteGeom, st: ClimbState): HoldG[] {
  if (st.feet_cut) return [];
  return (['LF', 'RF'] as Limb[]).map((l) => st.anchors[l]).filter((x): x is string => !!x).map((id) => geom.holds.get(id)!).filter(Boolean);
}

/**
 * Posture after a move (05a §6). Compression is forced by geometry (hands wide on opposing holds, or an arête),
 * rest stance by two good feet on easy-angled rock; otherwise the highest position quality wins.
 */
export function choosePosture(geom: RouteGeom, ath: Athlete, st: ClimbState): Posture {
  const hands = handHolds(geom, st);
  const feet = footHolds(geom, st);
  if (hands.length === 2) {
    const [a, b] = hands as [HoldG, HoldG];
    const wide = Math.abs(a.x - b.x) >= 0.45;
    const opposing = (h: HoldG) => h.type === 'pinch' || h.type === 'sidepull' || h.feature === 'arete' || h.feature === 'tufa'
      || (h.type === 'sloper' && Math.abs(norm180(h.orientation)) >= 25);
    if (wide && (opposing(a) || opposing(b))) return 'compression';
    if (a.feature === 'arete' || b.feature === 'arete') return 'compression';
  }
  const candidates: Posture[] = ['hang'];
  if (feet.length === 2 && feet.every((f) => f.quality >= 0.4 && f.angle <= 100)) candidates.push('rest_stance');
  const bp = bodyPoints(geom, ath, { ...st, posture: 'hang' });
  if (feet.some((f) => f.s >= bp.hip.s - 0.15 && Math.abs(f.x - bp.hip.x) >= 0.25 && f.angle >= 95)) candidates.push('drop_knee');
  let best: Posture = 'hang';
  let bestQ = -1;
  for (const p of candidates) {
    const q = positionQuality(geom, ath, { ...st, posture: p });
    if (q > bestQ + 1e-9) { best = p; bestQ = q; }
  }
  return best;
}

/** Position quality carried forward (05a §7). */
export function positionQuality(geom: RouteGeom, ath: Athlete, st: ClimbState): number {
  const bp = bodyPoints(geom, ath, st);
  const k = kinematics(ath.body);
  const footDeficit = bp.feetOn >= 2 ? 0 : bp.feetOn === 1 ? 0.5 : 1;
  const hands = handHolds(geom, st);
  let spread = 0;
  if (hands.length === 2) spread = Math.min(1, Math.max(0, (Math.abs(hands[0]!.x - hands[1]!.x) - 0.9 * k.span_m) / (0.3 * k.span_m)));
  const R = reachRadius(ath, 'hand', st.posture);
  const balance = bp.C_hands ? Math.min(1, Math.max(0, Math.abs(bp.hip.x - bp.C_hands.x) / (0.5 * R) - 0.5)) : 0;
  const geomQ = 1 - 0.05 * footDeficit * (1 - ath.a.core_tension / 200) - 0.04 * spread - 0.04 * balance;
  return Math.min(1.05, Math.max(0.8, Q_CLASS[st.posture] * (0.95 + 0.1 * ath.a.body_position / 100) * geomQ));
}

export const footDeficitOf = (bp: BodyPoints): number => (bp.feetOn >= 2 ? 0 : bp.feetOn === 1 ? 0.5 : 1);

export function stars(q: number): number {
  return q >= 1.02 ? 5 : q >= 0.98 ? 4 : q >= 0.93 ? 3 : q >= 0.87 ? 2 : 1;
}

/** Orientation mismatch term O (05b §4.1). */
export function orientationTerm(hold: HoldG, kind: LimbKind): number {
  if (kind !== 'hand' || hold.type.startsWith('crack_') || hold.feature === 'arete' || hold.feature === 'hueco') return 0;
  const canon = canonicalOrientation(hold.type, hold.orientation);
  if (hold.type === 'sloper' || hold.type === 'pinch') return 0; // compression holds read their own angle
  return 2 * (1 - Math.cos(rad(norm180(hold.orientation - canon))));
}
