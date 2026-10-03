// Procedural boulder generator (docs/06). Features-first: wall → features → a line the reference climber can
// physically follow → holds solved for the target difficulty → decoys → grade and adjust → name.

import type { Athlete } from './character';
import { applyMove, prepareMove } from './engine';
import { DI_MAX, gradeRoute, referenceAthlete, startState } from './grade';
import { routeName } from './names';
import { cyrb53, stream, type Rng } from './rng';
import { moveDifficulty, type MoveSpec } from './resolve';
import {
  canonicalOrientation, FEET_OK, H_FOOT, H_HAND, HANDS_OK, REST_BASE, ROCK_FRICTION,
} from './tables';
import type {
  BetaStep, CircuitColour, Crag, CragStyleProfile, DataBundle, Hold, HoldType, Limb, MoveClass, Route, Sector, SizeClass, WallSegment,
} from './types';
import {
  bodyPoints, COMPRESSION_WIDTH, dist, freeState, HIGH_STEP_ABOVE_HIP, limbKind, otherHand, reachRadius, routeGeom, segmentAt, sOfY, withHold, WRONG_SIDE_M, yOfS, type ClimbState,
} from './wall';

export const BOULDER_WIDTH = 2.0;

/**
 * Line-tracing shape (06 §2.3). Font problems are mostly four to seven hand moves (the docs' "six-move problem"),
 * so the tracer uses most of the reach on each static move, steps feet high rather than often, and refuses
 * hand moves that gain little height until the feet have come up.
 */
export const TRACE = {
  staticReach: [0.88, 1.0] as const,
  deadpointReach: [1.0, 1.1] as const,
  dynoReach: [1.18, 1.35] as const,
  /** Feet step when they trail the hands by more than this × body scale (first foot, second foot, forced). */
  footSpan: [1.15, 1.45, 0.75] as const,
  /** Where in the reachable band a new static foothold goes: 0 = just above the old one, 1 = hip height. */
  footHeight: [0.75, 1.0] as const,
  /** A hand move gaining less than this (m) steps the feet up first. */
  minGain: 0.22,
  /** Start-hold height range (m): mostly standing starts, as at Font, with the odd low start. */
  startY: [1.25, 1.7] as const,
  /** Heel-hook frequency multiplier on the profile grammar weight. */
  heelBias: 1.0,
  /** Fewest hand moves a line may have; shorter traces are retried with a new seed. */
  minHandMoves: 3,
  /** A beta move stays legal, with the same class and posture, with its hold this far (m) away across or along the rock, and keeps twice this from the wrong-side line (06 §2.3, C5). **(tune)** */
  legalMargin: 0.03,
};

/** Generator diagnostics: why attempts were discarded. Read by the probe and calibration scripts. */
export const GEN_STATS: Record<string, number> = {};
const note = (reason: string): null => { GEN_STATS[reason] = (GEN_STATS[reason] ?? 0) + 1; return null; };
/** Diagnostic counters for the generator probes (scripts/dev); never read by the game. */
const count = (key: string, by = 1): void => { GEN_STATS[key] = (GEN_STATS[key] ?? 0) + by; };
const SPACING = 0.18;

export interface GenRequest {
  crag: Crag;
  sector: Sector;
  profile: CragStyleProfile;
  di_target: number;
  seed: string;
  bundle: Pick<DataBundle, 'names'>;
  /** A route of this height (m) instead of one drawn from the profile: the harness's 35 m pitches. */
  length_m?: number;
}

/**
 * What kind of line the tracer draws (06 §2.3): a boulder is narrow, at most twenty hand moves with one dynamic move,
 * and finishes with a mantle onto the top; a sport route is wider, as long as the wall, and finishes at the anchor jug.
 */
interface Shape {
  discipline: Route['discipline'];
  width: number;
  maxIter: number;
  maxDyn: number;
  finish: 'mantle' | 'anchor';
}
const BOULDER_SHAPE: Shape = { discipline: 'boulder', width: BOULDER_WIDTH, maxIter: 20, maxDyn: 1, finish: 'mantle' };

// ---------------------------------------------------------------- seeds

/** Seed string for a procedural problem: crag/sector:day:slot:target. Encodes everything needed to regenerate it. */
export function routeSeed(crag: string, sector: string, day: number, slot: number, diTarget: number): string {
  return `${crag}/${sector}:${day}:${slot}:${diTarget.toFixed(1)}`;
}

export function parseRouteSeed(seed: string): { crag: string; sector: string; day: number; slot: number; di: number } | null {
  const m = /^([a-z0-9_]+)\/([a-z0-9_]+):(\d+):(\d+):([\d.]+)$/.exec(seed);
  if (!m) return null;
  return { crag: m[1]!, sector: m[2]!, day: Number(m[3]), slot: Number(m[4]), di: Number(m[5]) };
}

export const routeIdFor = (seed: string): string => 'proc_' + cyrb53(seed).toString(36);

// ---------------------------------------------------------------- wall

function sampleAngle(profile: CragStyleProfile, rng: Rng): number {
  const w: Record<string, number> = {};
  for (const a of profile.angle_dist) w[String(a.angle)] = a.weight;
  return Number(rng.weighted(w)) + rng.range(-3, 3);
}

function buildWall(profile: CragStyleProfile, rng: Rng): { wall: WallSegment[]; height: number } {
  const height = rng.triangular(profile.length_m.min, profile.length_m.mode, profile.length_m.max);
  const wall: WallSegment[] = [];
  let angle = sampleAngle(profile, rng);
  wall.push({ y0: 0, y1: 0.3, angle, feature: 'none' });
  let y = 0.3;
  while (y < height - 0.05) {
    let next = sampleAngle(profile, rng);
    for (let i = 0; i < 4 && Math.abs(next - angle) > 25; i++) next = sampleAngle(profile, rng);
    if (Math.abs(next - angle) > 25) next = angle + Math.sign(next - angle) * 25;
    angle = next;
    const dy = 1.2 * Math.sin((angle * Math.PI) / 180);
    const y1 = Math.min(height, y + Math.max(0.4, dy));
    const arete = (profile.feature_weights.arete ?? 0) > 0 && rng.bool(profile.feature_weights.arete ?? 0);
    wall.push({ y0: y, y1, angle, feature: arete ? 'arete' : 'none' });
    y = y1;
  }
  // A lip where a steep section meets easier ground, and always at the top edge (the top-out).
  for (let i = 1; i < wall.length; i++) if (wall[i - 1]!.angle > 120 && wall[i]!.angle <= 100) wall[i - 1]!.feature = 'lip';
  wall[wall.length - 1]!.feature = 'lip';
  return { wall, height: wall[wall.length - 1]!.y1 };
}

// ---------------------------------------------------------------- holds

const HAND_EXCLUDE_DYNAMIC: readonly HoldType[] = ['pocket1', 'undercling', 'gaston'];

function sampleHandType(profile: CragStyleProfile, rng: Rng, cls: MoveClass | null): HoldType {
  const w: Partial<Record<HoldType, number>> = {};
  for (const [t, v] of Object.entries(profile.hold_weights) as [HoldType, number][]) {
    if (!HANDS_OK[t]) continue;
    if (cls && (cls === 'dyno' || cls === 'deadpoint') && HAND_EXCLUDE_DYNAMIC.includes(t)) continue;
    if (t.startsWith('crack_')) continue;
    w[t] = v;
  }
  return rng.weighted(w);
}

function sampleFootType(profile: CragStyleProfile, rng: Rng, angle: number, cls: 'static' | 'heel_hook' | 'high_step'): HoldType {
  if (cls === 'heel_hook') return rng.weighted<HoldType>({ jug: 0.35, edge: 0.3, sloper: 0.25, volume: 0.1 });
  const w: Partial<Record<HoldType, number>> = { foot_chip: 0.35, edge: 0.25 };
  if (angle <= 95) w.smear = (profile.hold_weights.smear ?? 0.05) * 3;
  if (angle > 100) { w.jug = 0.12; w.volume = 0.08; }
  if (profile.hold_weights.sloper) w.sloper = 0.08;
  return rng.weighted(w);
}

function orientationFor(type: HoldType, limb: Limb, profile: CragStyleProfile, rng: Rng): number {
  if (type === 'sidepull' || type === 'gaston') return (limb === 'RH' ? 90 : 270) + rng.normal(0, 8);
  if (type === 'undercling') return 180 + rng.normal(0, 8);
  if (type === 'sloper' && profile.tags.includes('compression') && rng.bool(0.35)) return limb === 'LH' ? 40 : -40;
  return canonicalOrientation(type, 0) + rng.normal(0, 8);
}

function makeHold(id: string, x: number, y: number, type: HoldType, limb: Limb, profile: CragStyleProfile, rng: Rng): Hold {
  const polish = Math.min(0.8, Math.max(0, profile.polish + rng.range(-0.15, 0.15)));
  return {
    id, x, y, type, size: 'm', quality: 0.5,
    orientation: orientationFor(type, limb, profile, rng),
    sharpness: Math.min(0.9, Math.max(0.1, profile.sharpness + rng.normal(0, 0.05))),
    friction: ROCK_FRICTION[profile.rock] * (1 - 0.4 * polish),
    polish, hands_ok: HANDS_OK[type], feet_ok: FEET_OK[type], hidden: false, rest_value: REST_BASE[type],
  };
}

const tooClose = (holds: readonly Hold[], wall: readonly WallSegment[], x: number, y: number): boolean => {
  const s = sOfY(wall, y);
  return holds.some((h) => Math.hypot(h.x - x, sOfY(wall, h.y) - s) < SPACING);
};

// ---------------------------------------------------------------- the line (06 §2.3)

interface Traced {
  route: Route;
  /** Crux candidate indexes into beta_line (hand moves only). */
  handSteps: number[];
}

function trace(req: GenRequest, wall: WallSegment[], height: number, ath: Athlete, rng: Rng, shape: Shape = BOULDER_SHAPE): Traced | null {
  const { profile } = req;
  const holds: Hold[] = [];
  let n = 0;
  const nid = () => `h${n++}`;
  const W = shape.width;
  const x0 = rng.range(-0.3, 0.3);
  const ys = rng.range(TRACE.startY[0], TRACE.startY[1]);
  const start: Record<Limb, string> = { LH: '', RH: '', LF: '', RF: '' };
  const add = (x: number, y: number, type: HoldType, limb: Limb): Hold => {
    const h = makeHold(nid(), x, y, type, limb, profile, rng);
    holds.push(h);
    return h;
  };
  // Start hands well inside the compression width, so the start posture does not hang on a threshold.
  const half = COMPRESSION_WIDTH / 2 - TRACE.legalMargin;
  start.LH = add(x0 - half, ys, sampleHandType(profile, rng, null), 'LH').id;
  start.RH = add(x0 + half, ys + rng.range(-0.05, 0.1), sampleHandType(profile, rng, null), 'RH').id;
  const fy = Math.max(0.15, ys - rng.range(0.7, 0.9));
  start.LF = add(x0 - 0.18, fy, sampleFootType(profile, rng, segmentAt(wall, fy).angle, 'static'), 'LF').id;
  start.RF = add(x0 + 0.18, fy + rng.range(-0.05, 0.08), sampleFootType(profile, rng, segmentAt(wall, fy).angle, 'static'), 'RF').id;

  const route: Route = {
    id: '', crag: req.crag.id, area: req.sector.id, name: '', discipline: shape.discipline, rock: profile.rock,
    di_target: req.di_target, di_graded: 0, danger: 'safe', wall, width_m: W, holds, protection: [],
    start, finish_hold: '', length_m: height, style_tags: [], signature: false, beta_line: [],
  };
  const geomOf = () => routeGeom(route);
  /**
   * Legality and posture have hard edges (full reach, the wrong-side line, the high-step line, the drop-knee and
   * compression tests); a line never sits on one. The move must stay legal with the same class, and leave the body
   * in the same posture, with its hold moved by the margin either way across or along the rock.
   */
  const robust = (limb: Limb, hold: Hold, cls: MoveClass): boolean => {
    const m = TRACE.legalMargin;
    // The wrong-side line is between two holds that both move, so it gets the margin twice.
    const otherId = st.anchors[otherHand(limb)];
    const other = otherId && otherId !== hold.id ? holds.find((h) => h.id === otherId) : undefined;
    if (other) {
      const right = limb === 'RH' || limb === 'RF';
      const room = right ? hold.x - (other.x - WRONG_SIDE_M[limbKind(limb)]) : other.x + WRONG_SIDE_M[limbKind(limb)] - hold.x;
      if (room < 2 * m) return false;
    }
    // Moving the holds the body stands on as well caught no more C5 failures (772 vs 774 of 800) at twice the cost.
    const base = geomOf();
    const posture = applyMove(base, ath, st, limb, hold.id, cls).posture;
    const s = sOfY(wall, hold.y);
    for (const [dx, ds] of [[m, 0], [-m, 0], [0, m], [0, -m]] as const) {
      const g = withHold(base, { ...hold, x: hold.x + dx, y: yOfS(wall, s + ds) });
      if (!prepareMove(g, ath, st, limb, hold.id, cls) || applyMove(g, ath, st, limb, hold.id, cls).posture !== posture) return false;
    }
    return true;
  };
  let geom = geomOf();
  let st: ClimbState = startState(geom, ath);
  const beta: BetaStep[] = [];
  const handSteps: number[] = [];
  const grammar = profile.move_grammar;
  const dynWeight = (grammar.deadpoint ?? 0) + (grammar.dyno ?? 0);
  let dynCount = 0;
  let prevDyn = false;
  let lastHand: Limb = rng.bool(0.5) ? 'LH' : 'RH';
  const topY = height;
  // The last hand hold: the lip on a boulder, the anchor jug half a metre under the top of a route. Written out per
  // shape so a boulder's thresholds stay bit-for-bit what they were.
  const anchorFinish = shape.finish === 'anchor';
  const finishY = anchorFinish ? topY - 0.5 : topY - 0.06;
  const finishLo = anchorFinish ? topY - 0.8 : topY - 0.35;
  const belowFinish = anchorFinish ? topY - 0.75 : topY - 0.3;

  /** Feet follow the hands (06 §2.3). Returns how many feet moved. `force` lowers the trailing threshold. */
  const stepFeet = (force: boolean): number => {
    const feet: Limb[] = (['LF', 'RF'] as Limb[]).sort((a, b) => geom.holds.get(st.anchors[a]!)!.s - geom.holds.get(st.anchors[b]!)!.s);
    let moved = 0;
    for (const foot of feet) {
      // A forced step (the hands stalled) moves only the lowest foot: one good step, then try the hands again.
      if (force && moved > 0) break;
      const fbp = bodyPoints(geom, ath, freeState(st, foot));
      const curF = geom.holds.get(st.anchors[foot]!)!;
      // Feet step up when they hang too far below the hands (span scaled to the reference body).
      const span = (fbp.C_hands?.s ?? fbp.hip.s + 0.9) - curF.s;
      const scale = ath.body.height_cm / 170;
      if (span < (force ? TRACE.footSpan[2] : moved === 0 ? TRACE.footSpan[0] : TRACE.footSpan[1]) * scale) continue;
      const Rf = reachRadius(ath, 'foot', st.posture);
      const segAngle = segmentAt(wall, yOfS(wall, fbp.hip.s)).angle;
      const wantHeel = segAngle >= 110 && rng.bool((grammar.heel_hook ?? 0) * TRACE.heelBias);
      const wantHigh = !wantHeel && segAngle <= 130 && rng.bool((grammar.high_step ?? 0) * 1.2);
      const side = foot === 'RF' ? 1 : -1;
      const cx = fbp.C_hands?.x ?? fbp.hip.x;
      let fx = cx + side * (wantHeel ? rng.range(0.32, 0.5) : rng.range(0.08, 0.3));
      const lo = curF.s + 0.15;
      const staticHi = fbp.hip.s + HIGH_STEP_ABOVE_HIP - 0.05;
      const high = wantHigh || staticHi < lo;
      let fs = wantHeel ? Math.max(lo, fbp.hip.s - rng.range(0.0, 0.2))
        : high ? Math.max(lo, fbp.hip.s + HIGH_STEP_ABOVE_HIP + rng.range(0.02, 0.2))
        : lo + (staticHi - lo) * rng.range(TRACE.footHeight[0], TRACE.footHeight[1]);
      const df = Math.hypot(fx - fbp.hip.x, fs - fbp.hip.s);
      if (df > 0.88 * Rf) {
        const k = (0.88 * Rf) / df;
        fx = fbp.hip.x + (fx - fbp.hip.x) * k;
        fs = fbp.hip.s + (fs - fbp.hip.s) * k;
      }
      if (fs < curF.s + 0.12) continue;
      // Feet often go on holds the hands have left (Font footwork): reuse one near the target if legal.
      const occupied = new Set(Object.values(st.anchors));
      const reuse = geom.list
        .filter((h) => h.feet_ok && !occupied.has(h.id) && h.s >= lo && h.s <= fs + 0.15 && Math.abs(h.x - fx) <= 0.35 && rng.bool(0.8))
        .sort((a, b) => Math.hypot(a.x - fx, a.s - fs) - Math.hypot(b.x - fx, b.s - fs))[0];
      if (reuse) {
        const rp = prepareMove(geom, ath, st, foot, reuse.id);
        if (rp && robust(foot, holds.find((h) => h.id === reuse.id)!, rp.cls)) {
          count('foot_reuse');
          beta.push({ limb: foot, hold: reuse.id, class: rp.cls });
          st = applyMove(geom, ath, st, foot, reuse.id, rp.cls);
          moved++;
          continue;
        }
      }
      const fy = Math.max(0.12, yOfS(wall, fs));
      fx = Math.min(W / 2 - 0.15, Math.max(-W / 2 + 0.15, fx));
      if (tooClose(holds, wall, fx, fy)) continue;
      const fcls = wantHeel ? 'heel_hook' : high ? 'high_step' : 'static';
      const fh = add(fx, fy, sampleFootType(profile, rng, segmentAt(wall, fy).angle, fcls), foot);
      if (wantHeel) fh.quality = 0.55;
      geom = geomOf();
      const fprep = prepareMove(geom, ath, st, foot, fh.id, wantHeel ? 'heel_hook' : undefined) ?? prepareMove(geom, ath, st, foot, fh.id);
      if (!fprep || !robust(foot, fh, fprep.cls)) { holds.pop(); geom = geomOf(); continue; }
      count(`foot_${fprep.cls}`);
      beta.push({ limb: foot, hold: fh.id, class: fprep.cls });
      st = applyMove(geom, ath, st, foot, fh.id, fprep.cls);
      moved++;
    }
    return moved;
  };

  let stalls = 0;
  for (let iter = 0; iter < shape.maxIter; iter++) {
    const hand: Limb = iter === 0 ? lastHand : otherHand(lastHand);
    const bp = bodyPoints(geom, ath, freeState(st, hand));
    const R = reachRadius(ath, 'hand', st.posture);
    const cur = geom.holds.get(st.anchors[hand]!)!;
    const other = geom.holds.get(st.anchors[otherHand(hand)]!)!;
    let cls: MoveClass = 'static';
    if (!prevDyn && dynCount < shape.maxDyn && bp.feetOn >= 1 && rng.bool(dynWeight / Math.max(0.01, dynWeight + (grammar.static ?? 0.5)))) {
      cls = rng.weighted<MoveClass>({ deadpoint: grammar.deadpoint ?? 0.01, dyno: grammar.dyno ?? 0 });
    }
    const reach = cls === 'static' ? TRACE.staticReach : cls === 'deadpoint' ? TRACE.deadpointReach : TRACE.dynoReach;
    const factor = rng.range(reach[0], reach[1]);
    let d = factor * R;
    const drift = Math.min(0.35, Math.max(-0.35, rng.normal(0, 0.15) - 0.3 * (cur.x - x0)));
    let tx = Math.min(x0 + profile.drift_max_m, Math.max(x0 - profile.drift_max_m, cur.x + drift));
    tx = Math.min(W / 2 - 0.2, Math.max(-W / 2 + 0.2, tx));
    if (hand === 'RH') tx = Math.max(tx, other.x - 0.15); else tx = Math.min(tx, other.x + 0.15);
    let dx = tx - bp.shoulder.x;
    if (Math.abs(dx) > 0.45 * d) { dx = Math.sign(dx) * 0.45 * d; tx = bp.shoulder.x + dx; }
    let ts = bp.shoulder.s + Math.sqrt(Math.max(0, d * d - dx * dx));
    if (ts < cur.s + 0.15) { ts = cur.s + 0.25; d = Math.hypot(dx, ts - bp.shoulder.s); }
    let ty = yOfS(wall, ts);
    // Finish only when the lip (or the anchor jug) is genuinely within this move's reach; otherwise keep climbing below it.
    const finishS = sOfY(wall, finishY);
    const dFinish = Math.hypot(tx - bp.shoulder.x, finishS - bp.shoulder.s);
    const finishReach = R * (cls === 'static' ? 0.95 : cls === 'deadpoint' ? 1.1 : 1.35);
    const finishing = ty >= finishLo && dFinish <= finishReach;
    if (finishing) ty = finishY;
    else if (ty > belowFinish) ty = Math.max(cur.y + 0.1, belowFinish);
    // A hand move that barely gains height means the feet are trailing: step them up first.
    const gain = ty - Math.max(cur.y, other.y - 0.05);
    if (!finishing && gain < TRACE.minGain && stalls < 3) {
      stalls++;
      count('stall');
      if (stepFeet(true) > 0) { iter--; continue; }
    }
    stalls = 0;
    let placed: Hold | null = null;
    for (let k = 0; k < 8 && !placed; k++) {
      const jx = tx + (k === 0 ? 0 : (k % 2 ? 1 : -1) * 0.1 * Math.ceil(k / 2));
      const jy = ty - (k >= 4 && !finishing ? 0.08 : 0);
      if (tooClose(holds, wall, jx, jy)) continue;
      const type = finishing ? (shape.finish === 'anchor' ? 'jug' : rng.weighted<HoldType>({ sloper: 0.45, edge: 0.4, jug: 0.15 })) : sampleHandType(profile, rng, cls);
      placed = add(jx, jy, type, hand);
    }
    if (!placed) return note('spacing');
    geom = geomOf();
    let prep = prepareMove(geom, ath, st, hand, placed.id, cls) ?? prepareMove(geom, ath, st, hand, placed.id);
    if (!prep && !finishing && (placed.type === 'sidepull' || placed.type === 'gaston' || placed.type === 'undercling')) {
      // Directional holds that face the wrong way for this body position become plain edges.
      placed.type = 'edge';
      placed.orientation = 0;
      placed.rest_value = REST_BASE.edge;
      placed.hands_ok = true;
      placed.feet_ok = true;
      geom = geomOf();
      prep = prepareMove(geom, ath, st, hand, placed.id, cls) ?? prepareMove(geom, ath, st, hand, placed.id);
    }
    if (prep && !robust(hand, placed, prep.cls)) {
      // Ease the hold in by the margin until it clears the edge, so the move stays as long as it can be.
      count('edge');
      prep = null;
      for (let k = 0; k < 4 && !prep; k++) {
        const ds = sOfY(wall, placed.y) - bp.shoulder.s;
        const dx = placed.x - bp.shoulder.x;
        const f = Math.max(0, 1 - TRACE.legalMargin / Math.max(1e-9, Math.hypot(dx, ds)));
        placed.x = bp.shoulder.x + dx * f;
        placed.y = finishing ? placed.y : yOfS(wall, bp.shoulder.s + ds * f);
        geom = geomOf();
        prep = prepareMove(geom, ath, st, hand, placed.id, cls) ?? prepareMove(geom, ath, st, hand, placed.id);
        if (prep && !robust(hand, placed, prep.cls)) prep = null;
      }
      if (!prep) count('edge_unresolved');
    }
    if (!prep) {
      // Pull the hold in towards the shoulder until the reference body can reach it with room to spare.
      count('pull_in');
      for (let k = 0; k < 4 && !prep; k++) {
        placed.x = bp.shoulder.x + (placed.x - bp.shoulder.x) * 0.85;
        const s = bp.shoulder.s + (sOfY(wall, placed.y) - bp.shoulder.s) * 0.85;
        placed.y = finishing ? placed.y : yOfS(wall, s);
        geom = geomOf();
        prep = prepareMove(geom, ath, st, hand, placed.id);
        if (prep && !robust(hand, placed, prep.cls)) prep = null;
      }
      if (!prep) return note('unreachable');
    }
    count(`hand_${prep.cls}`);
    count('hand_gain_cm', Math.round(100 * (placed.y - Math.max(cur.y, other.y))));
    beta.push({ limb: hand, hold: placed.id, class: prep.cls });
    handSteps.push(beta.length - 1);
    if (prep.cls === 'deadpoint' || prep.cls === 'dyno') dynCount++;
    prevDyn = prep.cls === 'deadpoint' || prep.cls === 'dyno';
    st = applyMove(geom, ath, st, hand, placed.id, prep.cls);
    lastHand = hand;
    if (finishing) {
      route.finish_hold = placed.id;
      if (shape.finish === 'mantle') beta.push({ limb: hand, hold: placed.id, class: 'mantle' });
      break;
    }
    stepFeet(false);
  }
  if (!route.finish_hold) return note('no_finish');
  if (handSteps.length < TRACE.minHandMoves) return note('too_short');
  route.beta_line = beta;
  return { route, handSteps };
}

// ---------------------------------------------------------------- solving sizes and qualities (06 §2.4)

const SIZE_ORDER: SizeClass[] = ['m', 'l', 's', 'xl', 'xs'];
const NATURAL_SIZES: SizeClass[] = ['m', 'l', 's'];

const TOPOUT_TYPES: readonly HoldType[] = ['sloper', 'edge', 'jug', 'volume'];

const DIRECTIONAL: readonly HoldType[] = ['sidepull', 'gaston', 'undercling'];

function solveHold(hold: Hold, spec: MoveSpec, mdTarget: number, profile: CragStyleProfile, rng: Rng, kind: 'hand' | 'foot', finish: boolean, directional = true): void {
  const locked = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const size of attempt < 3 && !locked ? NATURAL_SIZES : SIZE_ORDER) {
      const rest = moveDifficulty({ ...spec, type: hold.type, size, quality: 0.5 }).MD;
      const q = 0.5 - (mdTarget - rest) / 4;
      if (q >= 0.15 && q <= 0.9) {
        hold.size = size;
        hold.quality = Math.round(q * 100) / 100;
        return;
      }
    }
    if (locked) break;
    // Too easy at xl → harder type; too hard at xs → easier type.
    const H = (kind === 'hand' ? H_HAND : H_FOOT)[hold.type] ?? 12;
    const restM = moveDifficulty({ ...spec, type: hold.type, size: 'm', quality: 0.5 }).MD;
    const needEasier = mdTarget < restM;
    const pool = Object.keys(kind === 'hand' ? H_HAND : H_FOOT).filter((t) => {
      const h = (kind === 'hand' ? H_HAND : H_FOOT)[t as HoldType] ?? 12;
      const ok = kind === 'hand' ? HANDS_OK[t as HoldType] && !t.startsWith('crack_') && t !== 'pocket1' : FEET_OK[t as HoldType] && !t.startsWith('crack_');
      return ok && (needEasier ? h < H : h > H) && (!finish || TOPOUT_TYPES.includes(t as HoldType)) && (directional || !DIRECTIONAL.includes(t as HoldType));
    }) as HoldType[];
    if (pool.length === 0) break;
    const weighted: Partial<Record<HoldType, number>> = {};
    for (const t of pool) weighted[t] = (profile.hold_weights[t] ?? 0.02) + 0.02;
    hold.type = rng.weighted(weighted);
    hold.rest_value = REST_BASE[hold.type];
    hold.hands_ok = HANDS_OK[hold.type];
    hold.feet_ok = FEET_OK[hold.type];
  }
  // Clamp: the accept/adjust loop corrects the residual.
  const rest = moveDifficulty({ ...spec, type: hold.type, size: 'm', quality: 0.5 }).MD;
  hold.size = mdTarget < rest ? 'xl' : 'xs';
  const r2 = moveDifficulty({ ...spec, type: hold.type, size: hold.size, quality: 0.5 }).MD;
  hold.quality = Math.min(0.9, Math.max(0.15, 0.5 - (mdTarget - r2) / 4));
}

/** Which hand move carries the crux (06 §2.4), by the profile's crux position; any hand move if that third is empty. */
export function cruxIndexes(handSteps: number[], position: CragStyleProfile['crux_position'], rng: Rng): Set<number> {
  const n = handSteps.length;
  if (n === 0) return new Set();
  const third = Math.max(1, Math.floor(n / 3));
  let pool: number[];
  if (position === 'low') pool = handSteps.slice(0, third);
  else if (position === 'mid') pool = handSteps.slice(third, Math.max(third + 1, n - third));
  else if (position === 'high') pool = handSteps.slice(Math.max(0, n - third));
  else pool = handSteps;
  return new Set([rng.pick(pool.length ? pool : handSteps)]);
}

/** Move targets relative to the route's DI (06 §2.4): the crux above it, the other hand moves below it. */
interface Targets {
  crux: number;
  base: number;
  /** Footholds, relative to the route's DI. */
  foot: number;
  fixed: ReadonlySet<string>;
  /** Whether a hold may be re-typed to a sidepull, gaston or undercling, which face one way and can make a move illegal. */
  directional: boolean;
}
const BOULDER_TARGETS: Targets = { crux: 0.6, base: -0.3, foot: -1.5, fixed: new Set(), directional: true };

function solveAll(route: Route, traced: Traced, ath: Athlete, req: GenRequest, rng: Rng, targets: Targets = BOULDER_TARGETS, cruxSet?: Set<number>): Set<number> {
  const crux = cruxSet ?? cruxIndexes(traced.handSteps, req.profile.crux_position, rng);
  let geom = routeGeom(route);
  // Start holds: comfortable for the reference climber.
  for (const limb of ['LH', 'RH', 'LF', 'RF'] as Limb[]) {
    const h = route.holds.find((x) => x.id === route.start[limb])!;
    const kind = limbKind(limb);
    const spec: MoveSpec = {
      kind, type: h.type, size: 'm', quality: 0.5, sharpness: h.sharpness, angle: geom.holds.get(h.id)!.angle,
      feature: geom.holds.get(h.id)!.feature, cls: 'static', r: 0.6, pq: 1, posture: 'hang', O: 0, friction: h.friction, otherAnchors: 3, rock: route.rock,
    };
    solveHold(h, spec, kind === 'hand' ? req.di_target - 1.0 : req.di_target - 1.5, req.profile, rng, kind, false);
  }
  geom = routeGeom(route);
  let st = startState(geom, ath);
  const solved = new Set<string>(Object.values(route.start));
  route.beta_line.forEach((step, i) => {
    const prep = prepareMove(geom, ath, st, step.limb, step.hold, step.class) ?? prepareMove(geom, ath, st, step.limb, step.hold);
    if (!prep) return;
    if (step.class !== 'mantle' && (solved.has(step.hold) || targets.fixed.has(step.hold))) {
      st = applyMove(geom, ath, st, step.limb, step.hold, prep.cls);
      step.class = prep.cls;
      return;
    }
    solved.add(step.hold);
    if (step.class !== 'mantle') {
      const hold = route.holds.find((x) => x.id === step.hold)!;
      const kind = limbKind(step.limb);
      const dynamic = prep.cls === 'deadpoint' || prep.cls === 'dyno';
      const target = kind === 'foot'
        ? req.di_target + targets.foot
        : req.di_target + (crux.has(i) ? targets.crux : targets.base) - 0.05 + (dynamic ? -0.4 : 0);
      solveHold(hold, prep.spec, target, req.profile, rng, kind, hold.id === route.finish_hold, targets.directional);
      geom = routeGeom(route);
      const again = prepareMove(geom, ath, st, step.limb, step.hold, prep.cls) ?? prepareMove(geom, ath, st, step.limb, step.hold);
      if (again) { st = applyMove(geom, ath, st, step.limb, step.hold, again.cls); step.class = again.cls; }
    } else {
      st = applyMove(geom, ath, st, step.limb, step.hold, 'mantle');
    }
  });
  return crux;
}

// ---------------------------------------------------------------- decoys (06 §2.7)

function addDecoys(route: Route, profile: CragStyleProfile, rng: Rng, width = BOULDER_WIDTH): void {
  const lineHolds = route.holds.length;
  const n = Math.round(profile.decoy_rate * lineHolds);
  let idx = 0;
  for (let i = 0; i < n * 3 && idx < n; i++) {
    const anchor = rng.pick(route.holds);
    if (anchor.id === route.finish_hold) continue;
    const ang = rng.range(0, Math.PI * 2);
    const rr = rng.range(0.25, 0.6);
    const x = anchor.x + Math.cos(ang) * rr;
    const y = anchor.y + Math.sin(ang) * rr * 0.8;
    if (y < 0.2 || y > route.length_m - 0.3 || Math.abs(x) > width / 2 - 0.1) continue;
    if (tooClose(route.holds, route.wall, x, y)) continue;
    const footish = y < 0.9 && rng.bool(0.5);
    const type: HoldType = footish ? rng.weighted<HoldType>({ foot_chip: 0.6, edge: 0.4 }) : sampleHandType(profile, rng, null);
    const h = makeHold(`d${idx++}`, x, y, type, rng.bool(0.5) ? 'LH' : 'RH', profile, rng);
    const alternative = rng.bool(0.1);
    h.size = alternative ? 'm' : rng.bool(0.5) ? 's' : 'xs';
    h.quality = alternative ? rng.range(0.4, 0.6) : rng.range(0.15, 0.35);
    route.holds.push(h);
  }
}

// ---------------------------------------------------------------- accept/adjust (06 §2.8)

export function adjust(route: Route, crux: Set<number>, excess: number, fixed: ReadonlySet<string> = new Set()): void {
  const steps = Math.round(excess / 0.25);
  if (steps === 0) return;
  const lineIds = new Set(route.beta_line.filter((s) => limbKind(s.limb) === 'hand' && s.class !== 'mantle' && !fixed.has(s.hold)).map((s) => s.hold));
  const cruxIds = new Set([...crux].map((i) => route.beta_line[i]?.hold).filter((x): x is string => !!x));
  for (const h of route.holds) {
    if (!lineIds.has(h.id)) continue;
    const dq = 0.05 * steps * (cruxIds.has(h.id) ? 1 : 0.5);
    let q = h.quality + dq;
    if (q > 0.9 && SIZE_ORDER.indexOf(h.size) >= 0) { const bigger: Record<SizeClass, SizeClass> = { xs: 's', s: 'm', m: 'l', l: 'xl', xl: 'xl' }; if (h.size !== 'xl') { h.size = bigger[h.size]; q -= 0.375; } }
    if (q < 0.15) { const smaller: Record<SizeClass, SizeClass> = { xl: 'l', l: 'm', m: 's', s: 'xs', xs: 'xs' }; if (h.size !== 'xs') { h.size = smaller[h.size]; q += 0.375; } }
    h.quality = Math.round(Math.min(0.9, Math.max(0.15, q)) * 100) / 100;
  }
}

export function circuitFor(sector: Sector, di: number): CircuitColour | undefined {
  let best: CircuitColour | undefined;
  let bestGap = Infinity;
  for (const c of sector.circuits) {
    const gap = di < c.di_range[0] ? c.di_range[0] - di : di > c.di_range[1] ? di - c.di_range[1] : 0;
    if (gap < bestGap) { bestGap = gap; best = c.colour; }
  }
  return bestGap <= 0.6 ? best : undefined;
}

function styleTags(route: Route): Route['style_tags'] {
  const counts = new Map<string, number>();
  for (const s of route.beta_line) {
    if (limbKind(s.limb) !== 'hand') continue;
    const h = route.holds.find((x) => x.id === s.hold)!;
    counts.set(h.type, (counts.get(h.type) ?? 0) + 1);
    if (s.class === 'deadpoint' || s.class === 'dyno') counts.set('dynamic', (counts.get('dynamic') ?? 0) + 1);
  }
  const tags: Route['style_tags'] = [];
  const top = [...counts.entries()].filter(([k]) => k !== 'dynamic').sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top === 'sloper' || top === 'crimp' || top === 'pinch' || top === 'jug' || top === 'edge') tags.push(top);
  if ((counts.get('dynamic') ?? 0) > 0) tags.push('dynamic');
  const maxAngle = Math.max(...route.wall.map((w) => w.angle));
  tags.push(maxAngle > 130 ? 'roof' : maxAngle > 95 ? 'overhang' : maxAngle < 85 ? 'slab' : 'vertical');
  if (route.beta_line.some((s) => s.class === 'high_step')) tags.push('footwork');
  if (route.beta_line.some((s) => s.class === 'heel_hook')) tags.push('flexibility');
  if (route.wall.some((w) => w.feature === 'arete')) tags.push('arete');
  if (route.discipline === 'sport') {
    tags.push('sport');
    const pump = route.components?.pump_peak ?? 0;
    if (pump >= 60) tags.push('endurance');
    else if (pump < 30) tags.push('power');
  } else if (route.length_m > 4.2) tags.push('highball');
  return tags;
}

// ---------------------------------------------------------------- entry point

export function generateBoulder(req: GenRequest): Route {
  let best: Route | null = null;
  let bestGap = Infinity;
  const ath = referenceAthlete(req.di_target);
  for (let attempt = 0; attempt < 12; attempt++) {
    const seed = attempt === 0 ? req.seed : `${req.seed}:retry${attempt}`;
    const { wall, height } = buildWall(req.profile, stream(seed, 'wall'));
    const traced = trace(req, wall, height, ath, stream(seed, 'line'));
    if (!traced) continue;
    const route = traced.route;
    const rng = stream(seed, 'holds');
    const crux = solveAll(route, traced, ath, req, rng);
    addDecoys(route, req.profile, stream(seed, 'decoys'));
    const hr = stream(seed, 'hidden');
    for (const h of route.holds) {
      const onLine = route.beta_line.some((s) => s.hold === h.id);
      const protectedHold = Object.values(route.start).includes(h.id) || h.id === route.finish_hold || [...crux].some((i) => route.beta_line[i]?.hold === h.id);
      if (onLine && !protectedHold && hr.bool(req.profile.hidden_rate)) h.hidden = true;
    }
    const startX = (route.holds.find((h) => h.id === route.start.LH)!.x + route.holds.find((h) => h.id === route.start.RH)!.x) / 2;
    route.protection = [{ id: 'pad', kind: 'pad_zone', y: 0.3, x: startX, width_m: 2.0, quality: req.profile.pad_coverage }];
    let g = gradeRoute(route);
    for (let i = 0; i < 6 && g.di !== null && Math.abs(g.di - req.di_target) > 0.5; i++) {
      adjust(route, crux, g.di - req.di_target);
      g = gradeRoute(route);
    }
    if (g.di === null) { note(gradeRoute(route).curve.length ? 'ungradeable' : 'ungradeable'); continue; }
    route.di_graded = Math.round(g.di * 100) / 100;
    route.danger = g.danger;
    route.components = g.components;
    const gap = Math.abs(g.di - req.di_target);
    if (gap < bestGap) { best = route; bestGap = gap; }
    if (gap <= 1.0) break;
    note('off_target');
  }
  if (!best) throw new Error(`generator failed for ${req.seed}`);
  best.seed = req.seed;
  best.id = routeIdFor(req.seed);
  best.style_tags = styleTags(best);
  const circuit = circuitFor(req.sector, best.di_graded);
  if (circuit) best.circuit = circuit;
  best.name = routeName(req.bundle.names[req.profile.name_bank], stream(req.seed, 'name'));
  return best;
}

// ---------------------------------------------------------------- sport routes (06 §2, P1b)

/**
 * Sport-route shape (06 §2, 07 §2) **(tune)**: a 2.4 m wide line up a 15–40 m wall in segments of about 4 m, a 1 m anchor
 * segment at the top. Hand moves off the crux sit `base` below the route's DI, because the grade comes from the pump of
 * many of them; the two or three crux moves sit `crux` from it. Bolts from 3–4 m, then every `spacing_m × 0.8–1.2`.
 */
export const SPORT = {
  width: 2.4,
  segment_m: 4,
  anchor_m: 1.0,
  base: -2.0,
  crux: -2.5,
  foot: -2.0,
  steepPerDi: 3.5,
  /** The base search stops within this of the target (DI). */
  tolerance: 0.25,
  cruxes: [2, 3] as const,
  firstBolt: [3.0, 4.0] as const,
  boltReach: { below: 1.2, side: 0.6 },
  maxIter: 400,
};
/**
 * What the sport solver aims for: the cruxes at `SPORT.crux`, the rest of the hand moves at `base` (searched per route),
 * the footholds `SPORT.foot` below that. A route has a hundred-odd foot moves, so footholds near the grade, as on a
 * boulder, would make the feet the route's crux once the climber is pumped.
 */
const sportTargets = (base: number, fixed: ReadonlySet<string>): Targets =>
  ({ crux: SPORT.crux, base, foot: base + SPORT.foot, fixed, directional: false });
const SPORT_SHAPE: Shape = { discipline: 'sport', width: SPORT.width, maxIter: SPORT.maxIter, maxDyn: Infinity, finish: 'anchor' };

const TUFA_ROCK: readonly string[] = ['limestone', 'dolomite', 'conglomerate', 'syenite'];

/**
 * The steepest wall a route of this DI is put on (06 §2.1): pump on a steep wall is paid on every move, so a low-grade
 * route there can only be a ladder of jugs; real crags keep their caves for the harder grades. **(tune)**
 */
export const sportMaxAngle = (di: number): number => Math.min(150, Math.max(95, 95 + SPORT.steepPerDi * (di - 10)));

/** A sport wall (06 §2.1): angles from the profile in ~4 m segments, tufas, the odd ledge, a 1 m anchor segment at the top. */
function buildSportWall(profile: CragStyleProfile, rng: Rng, di: number, height?: number): { wall: WallSegment[]; height: number } {
  const top = height ?? rng.triangular(profile.length_m.min, profile.length_m.mode, profile.length_m.max);
  const wall: WallSegment[] = [];
  const cap = sportMaxAngle(di);
  // Up to four draws under the grade's steepest angle, then the cap itself.
  const sample = (): number => {
    let a = sampleAngle(profile, rng);
    for (let i = 0; i < 4 && a > cap; i++) a = sampleAngle(profile, rng);
    return Math.min(cap, a);
  };
  let angle = Math.min(105, sample());
  wall.push({ y0: 0, y1: 0.3, angle, feature: 'none' });
  let y = 0.3;
  let lastLedge = -Infinity;
  const fw = profile.feature_weights;
  const end = top - SPORT.anchor_m;
  while (y < end - 0.05) {
    let next = sample();
    for (let i = 0; i < 4 && Math.abs(next - angle) > 25; i++) next = sample();
    if (Math.abs(next - angle) > 25) next = angle + Math.sign(next - angle) * 25;
    // A ledge at most once per 8 m (06 §2.2): a short shelf, then the wall carries on.
    if (y - lastLedge >= 8 && y > 4 && y < end - 3 && rng.bool(fw.ledge ?? 0)) {
      wall.push({ y0: y, y1: y + 0.3, angle: 80, feature: 'ledge' });
      y += 0.3;
      lastLedge = y;
      continue;
    }
    angle = next;
    const dy = SPORT.segment_m * Math.sin((angle * Math.PI) / 180);
    const y1 = Math.min(end, y + Math.max(1.0, dy));
    const tufa = TUFA_ROCK.includes(profile.rock) && rng.bool(fw.tufa ?? 0);
    const corner = !tufa && rng.bool(fw.corner ?? 0);
    wall.push({ y0: y, y1, angle, feature: tufa ? 'tufa' : corner ? 'corner' : 'none' });
    y = y1;
  }
  wall.push({ y0: y, y1: top, angle: Math.min(95, angle), feature: 'none' });
  return { wall, height: top };
}

/** Two or three crux moves spread up the route (06 §2.4, `crux_position: spread`), never on the first hand move. */
function sportCruxes(handSteps: number[], rng: Rng): Set<number> {
  const n = rng.int(SPORT.cruxes[0], SPORT.cruxes[1]);
  const out = new Set<number>();
  for (let k = 0; k < n; k++) {
    const f = (k + rng.range(0.25, 0.75)) / n;
    out.add(handSteps[Math.min(handSteps.length - 1, Math.max(1, Math.round(f * (handSteps.length - 1))))]!);
  }
  return out;
}

/**
 * Rests (06 §2.5): every `rest_spacing_m` up the route, the line's nearest hand hold and the next one become big jugs
 * (a horn on a tufa), so both hands are on the rest at once: a stance averages its hand holds (05b §6), and one jug
 * beside a crimp gives back little. They are fixed: the solver and the adjust loop leave them alone.
 */
function placeRests(route: Route, crux: Set<number>, profile: CragStyleProfile, rng: Rng): Set<string> {
  const fixed = new Set<string>();
  const every = profile.rest_spacing_m;
  if (!every) return fixed;
  const banned = new Set<string>([...Object.values(route.start), route.finish_hold, ...[...crux].map((i) => route.beta_line[i]!.hold)]);
  const hands = route.beta_line.filter((s) => limbKind(s.limb) === 'hand').map((s) => route.holds.find((h) => h.id === s.hold)!);
  const make = (h: Hold): void => {
    const tufa = segmentAt(route.wall, h.y).feature === 'tufa';
    h.type = tufa && rng.bool(0.4) ? 'horn' : 'jug';
    h.size = 'l';
    h.quality = 0.75;
    h.orientation = canonicalOrientation(h.type, 0);
    h.rest_value = REST_BASE[h.type];
    h.hands_ok = HANDS_OK[h.type];
    h.feet_ok = FEET_OK[h.type];
    fixed.add(h.id);
  };
  for (let y = every * rng.range(0.8, 1.1); y < route.length_m - 3; y += every * rng.range(0.85, 1.15)) {
    const i = hands.map((h, k) => [h, k] as const)
      .filter(([x]) => !fixed.has(x.id) && !banned.has(x.id) && Math.abs(x.y - y) <= 1.5)
      .sort((a, b) => Math.abs(a[0].y - y) - Math.abs(b[0].y - y))[0]?.[1];
    if (i === undefined) continue;
    make(hands[i]!);
    const pair = hands[i + 1];
    if (pair && !fixed.has(pair.id) && !banned.has(pair.id)) make(pair);
  }
  return fixed;
}

/**
 * Bolts (06 §2.6): the first at 3–4 m, then every `spacing_m × U(0.8, 1.2)` to the anchor. Each bolt sits by the line
 * and can be clipped from the line's hand holds up to 1.2 m below it and 0.6 m to the side; where none is, it moves down
 * to just above the highest one. The anchor is clipped from the finish jug.
 */
function placeBolts(route: Route, profile: CragStyleProfile, rng: Rng): void {
  const spacing = profile.protection?.spacing_m ?? 2.8;
  const seen = new Set<string>();
  const line: Hold[] = [];
  for (const s of route.beta_line) {
    if (limbKind(s.limb) !== 'hand' || seen.has(s.hold)) continue;
    seen.add(s.hold);
    line.push(route.holds.find((h) => h.id === s.hold)!);
  }
  const fin = route.holds.find((h) => h.id === route.finish_hold)!;
  const lineX = (y: number): number => {
    const near = line.filter((h) => Math.abs(h.y - y) <= 1.0);
    return near.length ? near.reduce((a, h) => a + h.x, 0) / near.length : fin.x;
  };
  const bolts: Route['protection'] = [];
  const anchorY = route.length_m - 0.15;
  let y = rng.range(SPORT.firstBolt[0], SPORT.firstBolt[1]);
  let prev = 0;
  // Bolts up to the anchor: none right under it, and one more if the gap to it is longer than the spacing.
  for (let filled = false; ;) {
    if (y >= anchorY - 1.2) {
      if (filled || anchorY - prev <= spacing * 1.1) break;
      y = (prev + anchorY) / 2;
      filled = true;
    }
    const x = lineX(y) + rng.range(-0.15, 0.15);
    const fromOf = (by: number) => line.filter((h) => h.y <= by - 0.05 && h.y >= by - SPORT.boltReach.below && Math.abs(h.x - x) <= SPORT.boltReach.side);
    let from = fromOf(y);
    if (from.length === 0) {
      const below = line.filter((h) => h.y < y && Math.abs(h.x - x) <= SPORT.boltReach.side).sort((a, b) => b.y - a.y)[0];
      if (below && below.y + 0.6 > prev + 1.5) { y = below.y + 0.6; from = fromOf(y); }
    }
    if (from.length) {
      bolts.push({ id: `b${bolts.length + 1}`, kind: 'bolt', y: Math.round(y * 1000) / 1000, x: Math.round(x * 1000) / 1000, quality: Math.min(1, Math.max(0.5, 0.9 + rng.normal(0, 0.05))), reach_from: from.map((h) => h.id) });
      prev = y;
    }
    y += spacing * rng.range(0.8, 1.2);
  }
  bolts.push({ id: 'anchor', kind: 'anchor', y: Math.round(anchorY * 1000) / 1000, x: fin.x, quality: 1, reach_from: [fin.id] });
  route.protection = bolts;
}

/** A sport route (06 §2, P1b): the same line tracer and solver as a boulder, on a tall wall, with rests, bolts and an anchor. */
export function generateSport(req: GenRequest): Route {
  let best: Route | null = null;
  let bestGap = Infinity;
  const ath = referenceAthlete(req.di_target);
  for (let attempt = 0; attempt < 12; attempt++) {
    const seed = attempt === 0 ? req.seed : `${req.seed}:retry${attempt}`;
    const { wall, height } = buildSportWall(req.profile, stream(seed, 'wall'), req.di_target, req.length_m);
    const traced = trace(req, wall, height, ath, stream(seed, 'line'), SPORT_SHAPE);
    if (!traced) continue;
    const route = traced.route;
    const rng = stream(seed, 'holds');
    const crux = sportCruxes(traced.handSteps, rng);
    const fixed = placeRests(route, crux, req.profile, stream(seed, 'rests'));
    placeBolts(route, req.profile, stream(seed, 'bolts'));
    // A route's grade is mostly the pump of its many moves, so the moves off the crux are set by a search on how far
    // below the route's DI they sit (a secant on `base`), before the small per-hold adjustments below.
    let base = SPORT.base;
    solveAll(route, traced, ath, req, rng, sportTargets(base, fixed), crux);
    let g0 = gradeRoute(route);
    if (g0.ungradeable) { note('ungradeable'); continue; }
    let prev: { base: number; di: number } | null = null;
    for (let i = 0; i < 6; i++) {
      const di = g0.di ?? DI_MAX + 2;
      if (Math.abs(di - req.di_target) <= SPORT.tolerance) break;
      let nextBase = base - (di - req.di_target) * 0.6;
      if (prev && Math.abs(prev.di - di) > 0.05) nextBase = base - (di - req.di_target) * (base - prev.base) / (di - prev.di);
      prev = { base, di };
      base = Math.max(-8, Math.min(1.5, nextBase));
      solveAll(route, traced, ath, req, rng, sportTargets(base, fixed), crux);
      g0 = gradeRoute(route);
    }
    addDecoys(route, req.profile, stream(seed, 'decoys'), SPORT.width);
    const hr = stream(seed, 'hidden');
    for (const h of route.holds) {
      const onLine = route.beta_line.some((s) => s.hold === h.id);
      const keep = Object.values(route.start).includes(h.id) || h.id === route.finish_hold || fixed.has(h.id) || [...crux].some((i) => route.beta_line[i]?.hold === h.id);
      if (onLine && !keep && hr.bool(req.profile.hidden_rate)) h.hidden = true;
    }
    let g = g0;
    for (let i = 0; i < 6 && g.di !== null && Math.abs(g.di - req.di_target) > 0.5; i++) {
      adjust(route, crux, g.di - req.di_target, fixed);
      g = gradeRoute(route);
    }
    if (g.di === null) { note('ungradeable'); continue; }
    route.di_graded = Math.round(g.di * 100) / 100;
    route.danger = g.danger;
    route.components = g.components;
    const gap = Math.abs(g.di - req.di_target);
    if (gap < bestGap) { best = route; bestGap = gap; }
    if (gap <= 1.0) break;
    note('off_target');
  }
  if (!best) throw new Error(`generator failed for ${req.seed}`);
  best.seed = req.seed;
  best.id = routeIdFor(req.seed);
  best.style_tags = styleTags(best);
  best.name = routeName(req.bundle.names[req.profile.name_bank], stream(req.seed, 'name'));
  return best;
}

/** Regenerate a procedural problem from its seed string (06 §5). */
export function routeFromSeed(seed: string, bundle: DataBundle): Route {
  const sig = bundle.signatures.get(seed);
  if (sig) return sig;
  const p = parseRouteSeed(seed);
  if (!p) throw new Error(`bad route seed ${seed}`);
  const crag = bundle.crags.get(p.crag);
  const sector = crag?.sectors.find((s) => s.id === p.sector);
  if (!crag || !sector) throw new Error(`unknown sector in ${seed}`);
  const profile = profileFor(sector, p.di, bundle, stream(seed, 'profile'));
  const req = { crag, sector, profile, di_target: p.di, seed, bundle };
  return profile.protection?.kind === 'bolt' ? generateSport(req) : generateBoulder(req);
}

/**
 * The style profile for a problem (06 §2.1): one of the sector's profiles that can be built to `di` (its `di_max`,
 * if any, at or above it). If none can, the one that reaches highest: a slab sector's hardest problems stay soft.
 */
export function profileFor(sector: Sector, di: number, bundle: Pick<DataBundle, 'profiles'>, rng: Rng): CragStyleProfile {
  const all = sector.style_profiles.map((id) => {
    const p = bundle.profiles.get(id);
    if (!p) throw new Error(`unknown profile ${id}`);
    return p;
  });
  const able = all.filter((p) => (p.di_max ?? Infinity) >= di);
  if (able.length) return rng.pick(able);
  return all.reduce((a, b) => ((b.di_max ?? Infinity) > (a.di_max ?? Infinity) ? b : a));
}

/** Distance helper for UIs and tests. */
export const holdDistance = dist;
