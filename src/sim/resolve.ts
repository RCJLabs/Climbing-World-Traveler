// Move resolution (docs/05b §4–§9). One MoveDifficulty and one EffectiveStat, shared by play and grading.

import { refFat, refMass, resourceMult, type Athlete } from './character';
import {
  cellEntries, CLASS_C, FS, H_FOOT, H_HAND, isDynamic, matrixCell, MOVE_TIME, FOOT_STATIC_TIME, PC, POSTURE_PUMP, SIZE_DI, SIZE_PUMP, SK,
  featureTerm,
} from './tables';
import type { Feature, HoldType, LimbKind, MoveClass, Posture, SizeClass, Tag } from './types';

// ---------------------------------------------------------------- DI scale (05c §1, 05b §4.3)

export function sRef(di: number): number {
  if (di <= 12) return Math.max(1, 8 + 2.0 * (di - 8));
  if (di <= 16) return 16 + 3.0 * (di - 12);
  if (di <= 29) return 28 + 4.6 * (di - 16);
  return 87.8 + 3.0 * (di - 29);
}

export function diEquiv(s: number): number {
  if (s <= 16) return 8 + (s - 8) / 2.0;
  if (s <= 28) return 12 + (s - 16) / 3.0;
  if (s <= 87.8) return 16 + (s - 28) / 4.6;
  return 29 + (s - 87.8) / 3.0;
}

// ---------------------------------------------------------------- move spec

/** Everything resolution needs about one move, already reduced from geometry. */
export interface MoveSpec {
  kind: LimbKind;
  type: HoldType;
  size: SizeClass;
  quality: number;
  sharpness: number;
  angle: number;
  feature: Feature;
  cls: MoveClass;
  /** Relative reach r = d / (R × class_reach); 0 for mantles. */
  r: number;
  /** Position quality of the state the move is made from (05a §7). */
  pq: number;
  posture: Posture;
  /** Orientation mismatch term O (05b §4.1). */
  O: number;
  /** Hold friction coefficient proxy (05a §2.3), before chalk and conditions. */
  friction: number;
  /** Anchors other than the moving limb, for slip recovery. */
  otherAnchors: number;
  rock: string;
}

export interface MoveState {
  pump: number;
  power: number;
  focus_meter: number;
  overgrip: number;
  under: number;
  energy: number;
  skin: number;
  /** Route familiarity 0..1 (05b §12.2). */
  fam: number;
  /** The attempt has stakes (a redpoint go at or above the personal best, 03 open question 8): `stakes_mult` applies. */
  stakes?: boolean | undefined;
}

/** Conditions that shape friction for one attempt (05a §2.3, docs/10). */
export interface Conditions {
  chalk_term: number;
  temp_term: number;
  wet_term: number;
  humid: boolean;
  heat: boolean;
  cold: boolean;
  /** Difficulty preset multiplier on T (16 §2). */
  t_mult: number;
}

export const REFERENCE_CONDITIONS: Conditions = { chalk_term: 1.2, temp_term: 1, wet_term: 1, humid: false, heat: false, cold: false, t_mult: 1 };

/** Chalk term from the chalk on the hands, 0..100 (05a §2.3, 10 §2: chalk adds up to 21.6 % friction). */
export const chalkTerm = (chalk: number): number => 1 + 0.216 * chalk / 100;

// ---------------------------------------------------------------- difficulty (05b §4.1)

export interface MDParts { H: number; S: number; Qh: number; A: number; Rch: number; C: number; Fe: number; O: number }

/**
 * The reach term of move difficulty (05b §4.1): `max × clamp((r − from)/(1 − from), 0, 1)^pow`, nothing at a
 * comfortable reach, `max` at full extension; the golden tests check it against the independent calculator. **(tune)**
 */
export const RCH = { max: 3.0, from: 0.7, pow: 1.5 };

export function moveDifficulty(m: MoveSpec, fam = 0): { MD: number; parts: MDParts } {
  const H = (m.kind === 'hand' ? H_HAND[m.type] : H_FOOT[m.type]) ?? 14;
  const S = SIZE_DI[m.size];
  const Qh = 4 * (0.5 - m.quality);
  const A = m.type === 'smear' ? 0.3 * (m.angle - 80) : m.kind === 'hand' ? 0.09 * (m.angle - 90) : 0.06 * (m.angle - 90);
  const Rch = m.cls === 'mantle' ? 0 : RCH.max * Math.pow(Math.min(1, Math.max(0, (m.r - RCH.from) / (1 - RCH.from))), RCH.pow);
  let C = CLASS_C[m.cls];
  if (m.cls === 'match' && (m.size === 'xs' || m.size === 's')) C = 1.0;
  const Fe = featureTerm(m.feature, m.cls === 'mantle', m.kind === 'hand');
  const O = m.O;
  return { MD: H + S + Qh + A + Rch + C + Fe + O - 0.3 * fam, parts: { H, S, Qh, A, Rch, C, Fe, O } };
}

// ---------------------------------------------------------------- body modifiers (02 §A.1)

/** The sixteen terrain tag sets a move can have (angle band × compression × arête), built once and shared, never changed. */
const TERRAIN_SETS: ReadonlySet<Tag>[] = (['slab', 'vertical', 'overhang', 'roof'] as const).flatMap((band) =>
  [false, true].flatMap((compression) => [false, true].map((arete) => {
    const t = new Set<Tag>([band]);
    if (compression) t.add('compression');
    if (arete) t.add('arete');
    return t;
  })));

export function terrainTagsFor(angle: number, posture: Posture, feature: Feature): ReadonlySet<Tag> {
  const band = angle < 85 ? 0 : angle <= 95 ? 1 : angle <= 130 ? 2 : 3;
  return TERRAIN_SETS[band * 4 + (posture === 'compression' ? 2 : 0) + (feature === 'arete' ? 1 : 0)]!;
}

export function bodyMods(ath: Athlete, type: HoldType, cls: MoveClass, tags: ReadonlySet<Tag>, rMarginal: boolean): number {
  const b = ath.body;
  let m = 1;
  const dh = b.height_cm - 170;
  if ((tags.has('vertical') || tags.has('slab')) && rMarginal) m *= 1 + 0.0025 * dh;
  if (tags.has('compression') || tags.has('roof')) m *= 1 - 0.002 * dh;
  const da = Math.round((b.ape_index - 1) / 0.01);
  if (tags.has('overhang') || tags.has('roof') || tags.has('compression')) m *= 1 + 0.01 * da;
  if (tags.has('slab') && b.ape_index > 1.04) m *= 1 - 0.005 * Math.round((b.ape_index - 1.04) / 0.01);
  const fl = b.finger_length;
  if (type === 'crimp' || type === 'edge') m *= 1 - 0.03 * fl;
  if (type.startsWith('pocket')) m *= 1 + 0.03 * fl;
  if (type === 'sloper' || type === 'pinch') m *= 1 + 0.02 * fl;
  const fg = b.finger_girth;
  if (type === 'pocket1') m *= 1 - 0.06 * fg;
  else if (type === 'pocket2') m *= 1 - 0.04 * fg;
  else if (type === 'pocket3') m *= 1 - 0.02 * fg;
  else if (type === 'crimp') m *= 1 + 0.01 * fg;
  const lt = b.leg_torso;
  if (cls === 'high_step') m *= 1 + 0.03 * lt;
  else if (cls === 'heel_hook') m *= 1 + 0.02 * lt;
  else if (cls === 'kneebar') m *= 1 + 0.02 * lt;
  if (tags.has('roof')) m *= 1 - 0.02 * lt;
  if (tags.has('compression')) m *= 1 - 0.01 * lt;
  m *= Math.min(1.06, Math.max(0.9, 1 - 0.004 * (b.body_fat_pct - refFat(b.sex))));
  if (cls === 'dyno' || cls === 'deadpoint' || tags.has('roof')) m *= 1 - 0.003 * (b.mass_kg - refMass(b.sex, b.height_cm));
  if (b.skin_thickness === 'thin' && (type === 'sloper' || type === 'smear')) m *= 1.03;
  if (b.skin_thickness === 'thick' && type === 'sloper') m *= 0.97;
  return m;
}

// ---------------------------------------------------------------- effective stat (05b §4.2)

export function tFor(st: Pick<MoveState, 'focus_meter'>, cond: Pick<Conditions, 't_mult'>): number {
  return (1.2 - 0.6 * st.focus_meter / 100) * cond.t_mult;
}

export interface Evaluation {
  S_cell: number;
  M_trait: number;
  M_body: number;
  Q: number;
  M_cond: number;
  M_state: number;
  S_eff: number;
  ES: number;
  MD: number;
  parts: MDParts;
  margin: number;
  T: number;
  pump_cost: number;
  power_cost: number;
  skin_cost: number;
  time: number;
  hesitation: number;
  legal: boolean;
}

export function frictionMod(friction: number, cond: Conditions, ath: Athlete): number {
  const hand = ath.body.skin_moisture === 'dry' ? 1.03 : ath.body.skin_moisture === 'sweaty' && (cond.humid || cond.heat) ? 0.95 : 1.0;
  const chalk = cond.chalk_term + ath.mods.chalk_friction_base;
  const F = friction * chalk * cond.temp_term * cond.wet_term * hand;
  return 1 + 0.6 * (F - 0.55);
}

/**
 * Stretch penalty on Q (05b §4.2): the share of EffectiveStat lost at full relative reach. Zero: the reach term `Rch`
 * already charges for stretch, and the original 0.1 charged it twice, so a 2–3 cm shift on a crux moved its grade
 * 0.6–0.8 DI (05c §4 C5). The golden tests set it back to 0.1, the independent calculator's value. **(tune)**
 */
export const STRETCH = { q: 0 };

export function evaluate(ath: Athlete, m: MoveSpec, st: MoveState, cond: Conditions): Evaluation {
  const cell = matrixCell(m.kind, m.cls, m.type);
  const { MD, parts } = moveDifficulty(m, st.fam);
  const T = tFor(st, cond);
  if (!cell) {
    return { S_cell: 0, M_trait: 1, M_body: 1, Q: 1, M_cond: 1, M_state: 1, S_eff: 0, ES: 0, MD, parts, margin: -99, T,
      pump_cost: 0, power_cost: 0, skin_cost: 0, time: 0, hesitation: 1, legal: false };
  }
  let S_cell = 0;
  for (const [id, w] of cellEntries(cell)) {
    S_cell += w * ath.a[id] * (ath.mods.attr_mult[id] ?? 1);
  }
  const condMult = (k: 'humid' | 'heat' | 'cold') => (cond[k] ? (ath.mods.condition_mult[k] ?? 1) - 1 : 0);
  const M_trait = 1 + ((ath.mods.hold_mult[m.type] ?? 1) - 1) + ((ath.mods.move_mult[m.cls] ?? 1) - 1)
    + condMult('humid') + condMult('heat') + condMult('cold') + (st.stakes ? ath.mods.stakes_mult - 1 : 0);
  const tags = terrainTagsFor(m.angle, m.posture, m.feature);
  const M_body = bodyMods(ath, m.type, m.cls, tags, m.r >= 0.85);
  const stretch = Math.min(1, Math.max(0, (m.r - 0.85) / 0.15));
  const Q = m.pq * (1 - STRETCH.q * stretch);
  const fmod = frictionMod(m.friction, cond, ath);
  let M_cond = 1 + FS[m.type] * (fmod - 1);
  M_cond *= 1 - 0.001 * Math.max(0, 50 - st.skin);
  if (st.skin < 30 && (m.type === 'sloper' || m.type === 'smear' || m.type === 'volume')) M_cond *= 0.9;
  M_cond *= 1 + 0.001 * (ath.rock_knowledge[m.rock] ?? 0);
  const pump_mod = 1 - 0.35 * Math.pow(Math.min(100, st.pump) / 100, 2);
  const fear_mod = 1 - 0.12 * st.overgrip - 0.06 * st.under;
  const hesitation = isDynamic(m.cls) ? 1 - 0.1 * Math.max(0, 1 - ath.a.commitment / 70) : 1;
  const power_cost = powerCost(m.cls, m.r);
  const power_mod = isDynamic(m.cls) && st.power < power_cost ? 1 - 0.3 * (1 - st.power / power_cost) : 1;
  const energy_mod = st.energy < 25 ? 0.9 : 1;
  const M_state = pump_mod * fear_mod * hesitation * power_mod * energy_mod;
  const S_eff = S_cell * M_trait * M_body * Q * M_cond * M_state;
  const ES = diEquiv(S_eff);
  const margin = ES - MD;
  return {
    S_cell, M_trait, M_body, Q, M_cond, M_state, S_eff, ES, MD, parts, margin, T,
    pump_cost: pumpCost(ath, m, margin, T, st.overgrip),
    power_cost: power_cost || (m.cls !== 'mantle' && margin < 0.5 * T ? 3 : 0),
    skin_cost: skinCost(ath, m, st, margin, T),
    time: m.kind === 'foot' && m.cls === 'static' ? FOOT_STATIC_TIME : MOVE_TIME[m.cls],
    hesitation, legal: true,
  };
}

// ---------------------------------------------------------------- outcome probabilities (05b §4.4)

export interface Probs { clean: number; sketchy: number; slip: number }

export function probs(margin: number, T: number): Probs {
  if (margin >= T) return { clean: 1, sketchy: 0, slip: 0 };
  if (margin > -T) {
    const u = (margin + T) / (2 * T);
    return { clean: u, sketchy: 0.5 * (1 - u), slip: 0.5 * (1 - u) };
  }
  if (margin >= -2 * T) {
    const sk = 0.5 * (margin + 2 * T) / T;
    return { clean: 0, sketchy: sk, slip: 1 - sk };
  }
  return { clean: 0, sketchy: 0, slip: 1 };
}

export const pComplete = (p: Probs): number => p.clean + p.sketchy;

/** Band label shown when exact odds are hidden (05b §13). */
export function bandLabel(p: number): 'solid' | 'probably' | 'sketchy' | 'desperate' {
  return p >= 0.9 ? 'solid' : p >= 0.65 ? 'probably' : p >= 0.35 ? 'sketchy' : 'desperate';
}

/** Slip recovery chance (05b §4.5). */
export function recoveryChance(ath: Athlete, kind: LimbKind, otherAnchors: number): number {
  if (kind === 'hand') return otherAnchors >= 2 ? Math.min(0.9, Math.max(0, 0.25 + 0.5 * ath.a.core_tension / 100)) : 0;
  return Math.min(0.95, Math.max(0, 0.5 + 0.4 * ath.a.core_tension / 100 + ath.mods.feet_cut_recovery / 100));
}

// ---------------------------------------------------------------- costs (05b §5)

/**
 * Power pool at attempt start (02 §D): a base everyone has plus `anaerobic_capacity`. Without the base the Reference
 * Climber at DI 10 (capacity 12) could not afford one dyno, and a forced deadpoint late on a low-grade problem was
 * starved of power, which made those grades jump under small geometry changes (05c §4 C5). **(tune)**
 */
export const POWER_BASE = 15;
/** The power pool for dynamic moves (02 §D); a trait's `resource_mult: power` scales it (03 §2). */
export const powerPool = (ath: Athlete): number => (POWER_BASE + ath.a.anaerobic_capacity) * resourceMult(ath.mods, 'power');

export function powerCost(cls: MoveClass, r: number): number {
  if (cls === 'deadpoint') return 8;
  if (cls === 'dyno') return r > 1.3 / 1.5 ? 25 : 15;
  if (cls === 'mantle') return 5;
  return 0;
}

export function anglePump(angle: number): number {
  return angle >= 90 ? 1 + 0.025 * Math.max(0, angle - 90) : 1 - 0.01 * (90 - angle);
}

export function pumpCost(ath: Athlete, m: MoveSpec, margin: number, T: number, overgrip: number): number {
  if (m.kind === 'foot') return 0;
  const marginPump = Math.min(2.2, Math.max(0.6, 1.4 - 0.4 * margin / T));
  const fe = 1.3 - 0.6 * ath.a.finger_endurance / 100;
  const fw = 1 - 0.002 * ath.a.footwork;
  let c = 1.6 * PC[m.type] * anglePump(m.angle) * marginPump * fe * fw * SIZE_PUMP[m.size] * POSTURE_PUMP[m.posture] * (1 + 0.5 * overgrip);
  if (m.cls === 'match') c *= 0.7;
  if (m.cls === 'mantle') c *= 1.2;
  return c;
}

/**
 * How hard the climber pulls on a hold, for skin wear (P1b, docs/26): full at a margin of 0 or less, a quarter at
 * three roll bands or more. A route's hundred moves are mostly well inside the climber's level, and at the boulder
 * rate one pitch cost a quarter of the day's skin. **(tune)**
 */
export const skinForce = (margin: number, T: number): number => Math.min(1, Math.max(0.25, 1 - 0.25 * margin / T));

export function skinCost(ath: Athlete, m: MoveSpec, st: Pick<MoveState, 'skin' | 'overgrip'>, margin = 0, T = 1): number {
  if (m.kind === 'foot') return 0;
  const body = ath.body.skin_thickness === 'thin' ? 1.3 : ath.body.skin_thickness === 'thick' ? 0.8 : 1.0;
  let c = 0.8 * m.sharpness * SK[m.type] * body * (1.3 - 0.6 * ath.a.skin_durability / 100) * (1 + 0.3 * st.overgrip) * skinForce(margin, T);
  if (st.skin < 30) c *= 2;
  if (m.cls === 'match') c *= 0.5;
  return c;
}

// ---------------------------------------------------------------- rest (05b §6)

export interface RestInput { restValue: number; type: HoldType; angle: number; posture: Posture; shakeIndex: number; reserve: number; overgrip: number }

/**
 * The aerobic reserve at the start of an attempt (02 §D): its size grows with `aerobic_capacity`, from half a tank.
 * 02 §D started it at `aerobic_capacity` itself, which counted the attribute twice in `R10` and left a 7a climber's reserve
 * empty six minutes up a 30 m route; this keeps the 05b §6 worked example's magnitude (P1b, docs/26). **(tune)**
 */
export const reserveStart = (ath: Athlete): number => (50 + 0.5 * ath.a.aerobic_capacity) * resourceMult(ath.mods, 'aerobic_reserve');

/**
 * Recovery on the move (P1b, docs/26): on a route the aerobic system clears pump while the climber moves, at a rate set
 * by `aerobic_capacity` and the reserve left. This is the critical-force idea of sustained climbing: a hand move that
 * costs less than the clearance gives pump back, so a jug ladder well inside the climber's level does not pump them,
 * and an endurance build pulls ahead on long routes. Boulders are anaerobic (07 §1) and skip it. `clear` is pump per
 * second of hand-move time at full capacity and reserve. **(tune)**
 */
export const CLIMB = { clear: 0.3 };
export const climbClear = (ath: Athlete, time: number, reserve: number): number =>
  CLIMB.clear * ath.a.aerobic_capacity / 100 * Math.sqrt(Math.max(0, reserve) / 100) * time;

/**
 * Form on the day (P1b, docs/26): the pump at which the hands open varies by attempt, normally around 100 with spread
 * `sd`, truncated at `z` spreads. In play an attempt draws its threshold and gains pump at 100 / threshold; the grade
 * engine multiplies the send probability by the chance the threshold sits above the walk's pump peak. Without it a
 * route at the edge of a climber's endurance is a certain send or a certain pump-out a quarter grade apart. A boulder's
 * pump peak is far below it. **(tune)**
 */
export const PUMP_FORM = { sd: 10, z: 2.5 };

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Chance the hands hold up to a pump peak of `peak` this attempt (PUMP_FORM). */
export function pumpHolds(peak: number): number {
  const { sd, z } = PUMP_FORM;
  const lo = normCdf(-z);
  const hi = normCdf(z);
  return Math.min(1, Math.max(0, (hi - normCdf((peak - 100) / sd)) / (hi - lo)));
}

/** The pump-gain multiplier for an attempt from a standard-normal draw (PUMP_FORM). */
export const pumpForm = (u: number): number => 100 / (100 + PUMP_FORM.sd * Math.min(PUMP_FORM.z, Math.max(-PUMP_FORM.z, u)));

/** Pump cost of hanging on a stance for 10 s (05b §6); 0 in `rest_stance`. */
export function holdCost(r: Pick<RestInput, 'restValue' | 'type' | 'angle' | 'posture'>): number {
  return r.posture === 'rest_stance' ? 0 : 1.0 * PC[r.type] * anglePump(r.angle) * (1 - r.restValue) * POSTURE_PUMP[r.posture];
}

export function restDelta(ath: Athlete, r: RestInput): number {
  const R10 = 1.2 * ath.a.aerobic_capacity / 100 * r.restValue * Math.sqrt(Math.max(0, r.reserve) / 100) * (1 - 0.6 * r.overgrip);
  const fresh = 12 * Math.pow(0.5, r.shakeIndex - 1);
  return -(R10 * fresh) + holdCost(r);
}

// ---------------------------------------------------------------- Auto-commit (05b §8.4); the swing itself is in swing.ts

export const autoCommitPApex = (ath: Athlete): number => 0.25 + 0.25 * (ath.a.commitment + ath.a.dynamic_movement) / 200;

/** How a dyno or deadpoint was caught (05b §8.4): Auto-commit catches it at the apex or just catches it. */
export type CommitOutcome = 'apex' | 'caught';


// ---------------------------------------------------------------- fear (05b §9)

export interface FearBand { centre: number; half: number; lo: number; hi: number }

export function izof(composure: number): FearBand {
  const centre = 50 - 0.2 * composure;
  const half = 15 + 0.1 * composure;
  return { centre, half, lo: centre - half, hi: centre + half };
}

export function fearEffects(fear: number, composure: number): { overgrip: number; under: number } {
  const b = izof(composure);
  return {
    overgrip: Math.min(1, Math.max(0, (fear - b.hi) / 30)),
    under: Math.min(1, Math.max(0, (b.lo - fear) / 30)),
  };
}
