// Character model (docs/02, docs/03 §1). Body derivation, ceilings, age curves, trait aggregation,
// creation and validation. Pure functions; no randomness.

import {
  ALL_ATTRS, LIFESTYLE_ATTRS, MENTAL_ATTRS, PHASE_ORDER, PHYSICAL_ATTRS, TECHNIQUE_ATTRS,
  type AttrGroup, type AttrId, type Attributes, type Background, type Body, type HoldType, type MoveClass,
  type NewRunSpec, type Phase, type Trait,
} from './types';

/** The build this code ships as. Traits and backgrounds from later phases are not selectable. */
export const CURRENT_PHASE: Phase = 'P1b';
export const phaseLive = (p: Phase): boolean => PHASE_ORDER.indexOf(p) <= PHASE_ORDER.indexOf(CURRENT_PHASE);

export function attrGroup(id: AttrId): AttrGroup {
  if ((PHYSICAL_ATTRS as readonly string[]).includes(id)) return 'physical';
  if ((TECHNIQUE_ATTRS as readonly string[]).includes(id)) return 'technique';
  if ((MENTAL_ATTRS as readonly string[]).includes(id)) return 'mental';
  return 'lifestyle';
}

// ---------------------------------------------------------------- body (02 §A)

export const refFat = (sex: Body['sex']): number => (sex === 'm' ? 11 : 19);
/** Reference mass anchored to elite BMI (02 open question, adopted for P1a): 21.5·h² (m), 20.0·h² (f). */
export const refMass = (sex: Body['sex'], heightCm: number): number => {
  const h = heightCm / 100;
  return (sex === 'm' ? 21.5 : 20.0) * h * h;
};

/** Mass from height, body fat and the player's frame shift (02 §A.2). */
export function deriveMass(sex: Body['sex'], heightCm: number, bodyFatPct: number, shiftKg: number): number {
  const lean = refMass(sex, heightCm) * (1 - refFat(sex) / 100);
  return lean / (1 - bodyFatPct / 100) + shiftKg;
}

export interface Kinematics {
  height_m: number;
  span_m: number;
  arm_len: number;
  leg_len: number;
}

export function kinematics(body: Body): Kinematics {
  const h = body.height_cm / 100;
  return {
    height_m: h,
    span_m: h * body.ape_index,
    arm_len: 0.44 * h * body.ape_index,
    leg_len: 0.47 * h * (1 + 0.03 * body.leg_torso),
  };
}

// ---------------------------------------------------------------- ages (02 §E)

const POWER_FAMILY: AttrId[] = ['finger_strength', 'pull_power', 'lockoff', 'core_tension', 'leg_power', 'anaerobic_capacity', 'contact_strength'];
const ENDURANCE_FAMILY: AttrId[] = ['finger_endurance', 'aerobic_capacity'];

/** Ceiling multiplier for an attribute at an age (02 §E). */
export function ageCeilingMult(id: AttrId, age: number): number {
  if (POWER_FAMILY.includes(id)) {
    let m = 1;
    for (let y = 28; y <= Math.floor(age); y++) m *= y <= 34 ? 0.995 : y <= 44 ? 0.985 : 0.975;
    return m;
  }
  if (ENDURANCE_FAMILY.includes(id)) {
    let m = 1;
    for (let y = 33; y <= Math.floor(age); y++) m *= y <= 44 ? 0.99 : 0.98;
    return m;
  }
  if (id === 'hip_mobility' || id === 'shoulder_mobility') return Math.max(0.6, 1 - 0.007 * Math.max(0, age - 25));
  if (id === 'skin_durability') return 1 + 0.003 * Math.min(25, Math.max(0, age - 25));
  if (attrGroup(id) === 'technique') return 1 - 0.005 * Math.max(0, age - 55);
  return 1;
}

/** Adaptation-rate multiplier at an age (02 §E). */
export function ageAdaptMult(id: AttrId, age: number): number {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
  if (POWER_FAMILY.includes(id)) return age <= 30 ? 1 : age <= 40 ? lerp(1, 0.8, (age - 30) / 10) : lerp(0.8, 0.6, (age - 40) / 10);
  if (ENDURANCE_FAMILY.includes(id)) return age <= 35 ? 1 : age <= 45 ? lerp(1, 0.8, (age - 35) / 10) : lerp(0.8, 0.65, (age - 45) / 10);
  if (attrGroup(id) === 'technique') return 1 - 0.005 * Math.max(0, age - 30);
  return 1;
}

/** Mental maturity bonus to ceilings (02 §E): composure and risk judgement +0.5/yr to 50. */
export function ageMentalCeilingAdd(id: AttrId, age: number): number {
  if (id !== 'composure' && id !== 'risk_judgement') return 0;
  return 0.5 * Math.max(0, Math.min(50, age) - 18);
}

// ---------------------------------------------------------------- base values and ceilings (02 §F)

/** Starting values before background and allocation (02 §F). */
export const BASE_VALUE: Record<AttrGroup, number> = { physical: 20, technique: 10, mental: 35, lifestyle: 25 };

/** Default ceilings before Body, traits and age (02 §F, adopted for P1a). */
export const BASE_CEILING: Record<AttrGroup, number> = { physical: 70, technique: 90, mental: 85, lifestyle: 90 };

export const ALLOC_MAX_PER_ATTR = 25;

export function baseCeiling(id: AttrId, body: Body): number {
  let c = BASE_CEILING[attrGroup(id)];
  if (POWER_FAMILY.includes(id)) c += 10 * body.fibre_bias;
  if (ENDURANCE_FAMILY.includes(id)) c -= 10 * body.fibre_bias;
  if (id === 'hip_mobility') c = 40 + 0.6 * body.natural_hip_mobility;
  if (id === 'shoulder_mobility') c = 40 + 0.6 * body.natural_shoulder_mobility;
  if (id === 'skin_durability') c = body.skin_thickness === 'thin' ? 55 : body.skin_thickness === 'thick' ? 75 : 65;
  return c;
}

// ---------------------------------------------------------------- trait aggregation

export interface Mods {
  attr_mult: Partial<Record<AttrId, number>>;
  adapt_rate_mult: Partial<Record<AttrId, number>>;
  hold_mult: Partial<Record<HoldType, number>>;
  move_mult: Partial<Record<MoveClass, number>>;
  condition_mult: Partial<Record<'cold' | 'heat' | 'humid' | 'altitude', number>>;
  resource_mult: Record<string, number>;
  fear_add: number;
  injury_risk_mult: number;
  cost_mult: number;
  reach_mult: number;
  feet_cut_recovery: number;
  familiarity_k_mult: number;
  fear_source_mult: Record<string, number>;
  sending_temp_shift: number;
  chalk_friction_base: number;
  overchalk_penalty_mult: number;
  flow_chance_mult: number;
  reroll_bad: number;
  reroll_good: number;
  quit: { after: number; chance: number; stoke: number } | null;
  project_stoke_immunity: boolean;
  /** EffectiveStat multiplier on an attempt with stakes (03 §2 flags, 05b): additive like the other multipliers. */
  stakes_mult: number;
  /** Time each move takes (Overthinker), familiarity a free pre-attempt look adds (Visualiser). */
  pre_move_time_mult: number;
  visualise_action: number;
  /** Stoke taken off each go at a route from the fourth (Onsight Purist) and added on a send with a sketchy move (Perfectionist). */
  redpoint_stoke_penalty: number;
  sketchy_send_stoke: number;
  /** Body mass added at creation (kg, Weightlifter). */
  mass_shift: number;
  /** Skin wear on cold days (Dry Hands' splits, docs/26 §8). */
  split_risk_cold: number;
  /** Familiarity from other climbers' beta (Stubborn): on signature problems until partners come (docs/26 §8). */
  beta_mult: number;
}

export const NEUTRAL_MODS: Mods = {
  attr_mult: {}, adapt_rate_mult: {}, hold_mult: {}, move_mult: {}, condition_mult: {}, resource_mult: {},
  fear_add: 0, injury_risk_mult: 1, cost_mult: 1, reach_mult: 1, feet_cut_recovery: 0,
  familiarity_k_mult: 1, fear_source_mult: {}, sending_temp_shift: 0, chalk_friction_base: 0, overchalk_penalty_mult: 1,
  flow_chance_mult: 1, reroll_bad: 0, reroll_good: 0, quit: null, project_stoke_immunity: false,
  stakes_mult: 1, pre_move_time_mult: 1, visualise_action: 0, redpoint_stoke_penalty: 0, sketchy_send_stoke: 0, mass_shift: 0, split_risk_cold: 1,
  beta_mult: 1,
};

/** A trait's multiplier on a resource's regeneration or gain (03 §2: `resource_mult` semantics), 1 without one. */
export const resourceMult = (mods: Mods, key: string): number => mods.resource_mult[key] ?? 1;

/** Trait flags the engine reads (03 §2's flag table). `fear_source_mult:` takes a source after the colon. */
export const LIVE_FLAGS: ReadonlySet<string> = new Set([
  'reach_mult', 'feet_cut_recovery', 'familiarity_k_mult', 'fear_source_mult', 'sending_temp_shift', 'chalk_friction_base',
  'overchalk_penalty_mult', 'flow_chance_mult', 'reroll_bad_outcome', 'reroll_good_outcome', 'quit_after_fails', 'quit_chance',
  'stoke_hit', 'project_stoke_immunity', 'stakes_mult', 'pre_move_time_mult', 'visualise_action', 'redpoint_stoke_penalty',
  'sketchy_send_stoke', 'mass_shift', 'split_risk_cold', 'beta_mult',
]);

/**
 * Flags of systems that are not live yet, and the phase that brings each: carried on a trait but inert. A live trait may
 * carry one only as a side clause that is not its downside (docs/26 §8); the validator rejects any flag in neither list.
 */
export const INERT_FLAGS: Readonly<Record<string, Phase>> = {
  city_stoke: 'P2', sponsor_appeal_mult: 'P2', good_event_mult: 'P2', bad_event_mult: 'P2', onsight_rep_mult: 'P2',
  plastic_mult: 'P3', swim_skill: 'P3',
};

/** The resources a trait's `resource_mult` can name (03 §1.9 semantics: regeneration or gain, never the ceiling). */
export const RESOURCE_KEYS: ReadonlySet<string> = new Set(['skin', 'energy', 'stoke', 'burnout', 'health', 'chalk', 'focus_meter', 'aerobic_reserve', 'power']);

/**
 * Resources whose regeneration no system runs yet, and the phase that brings it: energy refills to its cap every morning,
 * health waits for the injuries. A live trait may not use them, or the effect would be silently inert (docs/26 §8).
 */
export const INERT_RESOURCES: Readonly<Record<string, Phase>> = { energy: 'P2', health: 'P2' };

/**
 * Content errors in a trait's effect (schemas §9 rule 11, docs/26 §8): flags the engine does not know, resources it does
 * not have, and, on a live trait, resources no system regenerates yet.
 */
export function traitEffectErrors(t: Pick<Trait, 'id' | 'effect'> & { phase?: Phase }): string[] {
  const out: string[] = [];
  for (const f of t.effect.flags ?? []) {
    const name = parseFlag(f)[0].split(':')[0]!;
    if (!LIVE_FLAGS.has(name) && !(name in INERT_FLAGS)) out.push(`trait ${t.id}: unknown flag ${name}`);
  }
  for (const k of Object.keys(t.effect.resource_mult ?? {})) {
    if (!RESOURCE_KEYS.has(k)) out.push(`trait ${t.id}: unknown resource ${k}`);
    else if (t.phase && phaseLive(t.phase) && k in INERT_RESOURCES) out.push(`trait ${t.id}: resource ${k} waits for ${INERT_RESOURCES[k]}`);
  }
  return out;
}

/** Additive combination of multipliers: 1 + Σ(m − 1) (03 §1.2). */
function addMult<K extends string>(into: Partial<Record<K, number>>, from: Partial<Record<K, number>> | undefined): void {
  if (!from) return;
  for (const [k, v] of Object.entries(from) as [K, number][]) into[k] = (into[k] ?? 1) + (v - 1);
}

function parseFlag(flag: string): [string, string] {
  const i = flag.indexOf('=');
  return i < 0 ? [flag.trim(), ''] : [flag.slice(0, i).trim(), flag.slice(i + 1).trim()];
}
const num = (s: string): number => Number(s.replace('−', '-').replace('+', ''));

export function aggregateMods(traitIds: readonly string[], traits: ReadonlyMap<string, Trait>): Mods {
  const m: Mods = structuredClone(NEUTRAL_MODS);
  for (const id of traitIds) {
    const t = traits.get(id);
    if (!t) continue;
    const e = t.effect;
    if (e.attr_mult) for (const [k, v] of Object.entries(e.attr_mult) as [AttrId, number][]) m.attr_mult[k] = v;
    addMult(m.adapt_rate_mult, e.adapt_rate_mult);
    addMult(m.hold_mult, e.hold_mult);
    addMult(m.move_mult, e.move_mult);
    addMult(m.condition_mult, e.condition_mult);
    addMult(m.resource_mult, e.resource_mult);
    m.fear_add += e.fear_add ?? 0;
    if (e.injury_risk_mult !== undefined) m.injury_risk_mult *= e.injury_risk_mult;
    if (e.cost_mult !== undefined) m.cost_mult *= e.cost_mult;
    for (const f of e.flags ?? []) {
      const [name, value] = parseFlag(f);
      if (name === 'reach_mult') m.reach_mult *= num(value);
      else if (name === 'feet_cut_recovery') m.feet_cut_recovery += num(value);
      else if (name === 'familiarity_k_mult') m.familiarity_k_mult *= num(value);
      else if (name.startsWith('fear_source_mult:')) m.fear_source_mult[name.split(':')[1]!] = num(value);
      else if (name === 'sending_temp_shift') m.sending_temp_shift += num(value);
      else if (name === 'chalk_friction_base') m.chalk_friction_base += num(value);
      else if (name === 'overchalk_penalty_mult') m.overchalk_penalty_mult *= num(value);
      else if (name === 'flow_chance_mult') m.flow_chance_mult *= num(value);
      else if (name === 'reroll_bad_outcome') m.reroll_bad = Math.max(m.reroll_bad, num(value));
      else if (name === 'reroll_good_outcome') m.reroll_good = Math.max(m.reroll_good, num(value));
      else if (name === 'quit_after_fails') m.quit = { after: num(value), chance: m.quit?.chance ?? 0.3, stoke: m.quit?.stoke ?? 8 };
      else if (name === 'quit_chance' && m.quit) m.quit.chance = num(value);
      else if (name === 'stoke_hit' && m.quit) m.quit.stoke = num(value);
      else if (name === 'project_stoke_immunity') m.project_stoke_immunity = true;
      else if (name === 'stakes_mult') m.stakes_mult += num(value) - 1;
      else if (name === 'pre_move_time_mult') m.pre_move_time_mult *= num(value);
      else if (name === 'visualise_action') m.visualise_action += num(value);
      else if (name === 'redpoint_stoke_penalty') m.redpoint_stoke_penalty += num(value);
      else if (name === 'sketchy_send_stoke') m.sketchy_send_stoke += num(value);
      else if (name === 'mass_shift') m.mass_shift += num(value);
      else if (name === 'split_risk_cold') m.split_risk_cold *= num(value);
      else if (name === 'beta_mult') m.beta_mult *= num(value);
      // Other flags belong to systems that are not live yet (INERT_FLAGS); they are carried but inert.
    }
  }
  return m;
}

// ---------------------------------------------------------------- creation

export interface CreationContext {
  traits: ReadonlyMap<string, Trait>;
  backgrounds: ReadonlyMap<string, Background>;
  /** Meta unlocks held by the player. Omitted in replay: the log already passed this check when it was written. */
  unlocked?: ReadonlySet<string>;
}

export interface CreationBudget {
  bonus: number;
  spent: number;
  refunds: number;
  left: number;
  traitCount: number;
  allocUsed: number;
  allocTotal: number;
}

export function creationBudget(spec: Pick<NewRunSpec, 'background' | 'traits' | 'attr_alloc'>, ctx: CreationContext): CreationBudget {
  const bg = ctx.backgrounds.get(spec.background);
  const bonus = bg?.point_bonus ?? 0;
  let spent = 0;
  let refunds = 0;
  for (const id of spec.traits) {
    const t = ctx.traits.get(id);
    if (!t || bg?.forced_traits.includes(id)) continue;
    if (t.cost > 0) spent += t.cost;
    else refunds += -t.cost;
  }
  const allocUsed = Object.values(spec.attr_alloc).reduce((s, v) => s + (v ?? 0), 0);
  const chosen = spec.traits.filter((id) => !bg?.forced_traits.includes(id));
  return { bonus, spent, refunds, left: bonus + refunds - spent, traitCount: chosen.length, allocUsed, allocTotal: bg?.attr_points ?? 60 };
}

/** Validate a new run against 03 §1 and 02 §F. Returns human-readable problems; empty means valid. */
export function validateCreation(spec: NewRunSpec, ctx: CreationContext): string[] {
  const errs: string[] = [];
  const bg = ctx.backgrounds.get(spec.background);
  if (!bg) return [`Unknown background ${spec.background}`];
  if (!phaseLive(bg.phase)) errs.push(`${bg.name} is not available yet.`);
  if (bg.unlock && ctx.unlocked && !ctx.unlocked.has(bg.unlock)) errs.push(`${bg.name} unlocks after your first finished run.`);
  const b = spec.body;
  if (b.age_start < bg.age_range[0] || b.age_start > bg.age_range[1]) errs.push(`${bg.name} starts between ${bg.age_range[0]} and ${bg.age_range[1]}.`);
  if (b.lock_depth_m !== undefined) errs.push('A pinned lock-off depth belongs to the Reference Climber only.');
  const budget = creationBudget(spec, ctx);
  if (budget.left < 0) errs.push(`Trait budget is ${budget.left}; it must end at 0 or above.`);
  if (budget.refunds > 12) errs.push('Negative traits can refund at most 12 points.');
  if (budget.traitCount > 12) errs.push('At most 12 traits at creation.');
  const negPerCat = new Map<string, number>();
  for (const id of spec.traits) {
    const t = ctx.traits.get(id);
    if (!t) { errs.push(`Unknown trait ${id}`); continue; }
    const forced = bg.forced_traits.includes(id);
    if (!forced && !phaseLive(t.phase)) errs.push(`${t.name} is not available yet.`);
    if (!forced && t.kind !== 'creation' && t.kind !== 'evolving') errs.push(`${t.name} cannot be chosen at creation.`);
    if (bg.locked_traits.includes(id)) errs.push(`${t.name} does not fit a ${bg.name} background.`);
    if (t.cost < 0 && !forced) negPerCat.set(t.category, (negPerCat.get(t.category) ?? 0) + 1);
    for (const x of t.excludes) if (spec.traits.includes(x)) errs.push(`${t.name} conflicts with ${ctx.traits.get(x)?.name ?? x}.`);
    if (t.requires_age && (b.age_start < t.requires_age[0] || b.age_start > t.requires_age[1])) errs.push(`${t.name} needs a starting age of ${t.requires_age[0]}–${t.requires_age[1]}.`);
  }
  for (const id of bg.forced_traits) if (!spec.traits.includes(id)) errs.push(`${bg.name} must include ${ctx.traits.get(id)?.name ?? id}.`);
  for (const [cat, n] of negPerCat) if (n > 2) errs.push(`At most two negative ${cat} traits.`);
  if (budget.allocUsed > budget.allocTotal) errs.push(`Allocated ${budget.allocUsed} of ${budget.allocTotal} attribute points.`);
  for (const [id, v] of Object.entries(spec.attr_alloc) as [AttrId, number][]) {
    if (v < 0) errs.push(`Allocation cannot be negative (${id}).`);
    if (v > ALLOC_MAX_PER_ATTR) errs.push(`At most +${ALLOC_MAX_PER_ATTR} into one attribute (${id}).`);
  }
  return [...new Set(errs)];
}

/** Ceiling for an attribute given Body, traits and age. */
export function ceilingFor(id: AttrId, body: Body, traitIds: readonly string[], traits: ReadonlyMap<string, Trait>, age: number): number {
  let c = baseCeiling(id, body);
  for (const tid of traitIds) c += traits.get(tid)?.effect.ceiling_add?.[id] ?? 0;
  c = c * ageCeilingMult(id, age) + ageMentalCeilingAdd(id, age);
  return Math.max(5, Math.min(100, c));
}

/** Build starting attributes in 02 §B.5 order: base → background → allocation → traits, clamped to ceilings. */
export function buildAttributes(spec: NewRunSpec, ctx: CreationContext): Attributes {
  const bg = ctx.backgrounds.get(spec.background);
  const age = spec.body.age_start;
  const out = {} as Attributes;
  for (const id of ALL_ATTRS) {
    const ceiling = ceilingFor(id, spec.body, spec.traits, ctx.traits, age);
    let v = BASE_VALUE[attrGroup(id)];
    if (id === 'hip_mobility') v = Math.min(ceiling, 0.6 * spec.body.natural_hip_mobility + 10);
    if (id === 'shoulder_mobility') v = Math.min(ceiling, 0.6 * spec.body.natural_shoulder_mobility + 10);
    v += bg?.attr_add[id] ?? 0;
    v += spec.attr_alloc[id] ?? 0;
    for (const tid of spec.traits) v += ctx.traits.get(tid)?.effect.attr_add?.[id] ?? 0;
    // Age maturity (02 §A.1): composure, risk judgement and logistics +0.8/yr over 18, cap +16.
    if (id === 'composure' || id === 'risk_judgement' || id === 'logistics') v += Math.min(16, 0.8 * Math.max(0, age - 18));
    out[id] = { value: clamp(v, 1, ceiling), ceiling, pending: 0, last_stim_day: 0 };
  }
  return out;
}

/** Starting money bonus for older starts (02 §A.1). */
export function ageMoneyBonus(age: number): number {
  return Math.min(30000, 1500 * Math.max(0, age - 18));
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The view of a climber the engine reads: plain attribute values, body, aggregated trait mods. */
export interface Athlete {
  body: Body;
  a: Record<AttrId, number>;
  mods: Mods;
  rock_knowledge: Partial<Record<string, number>>;
}

export function athleteFrom(body: Body, attrs: Attributes, mods: Mods, rock_knowledge: Partial<Record<string, number>> = {}): Athlete {
  const a = {} as Record<AttrId, number>;
  for (const id of ALL_ATTRS) a[id] = attrs[id].value;
  return { body, a, mods, rock_knowledge };
}

/** Group averages for the character sheet. */
export function groupAverages(attrs: Attributes): Record<AttrGroup, number> {
  const groups: Record<AttrGroup, readonly AttrId[]> = {
    physical: PHYSICAL_ATTRS, technique: TECHNIQUE_ATTRS.filter((t) => t !== 'rope_craft' && t !== 'gear_placement'),
    mental: MENTAL_ATTRS, lifestyle: LIFESTYLE_ATTRS,
  };
  const out = {} as Record<AttrGroup, number>;
  for (const [g, ids] of Object.entries(groups) as [AttrGroup, readonly AttrId[]][]) {
    out[g] = ids.reduce((s, id) => s + attrs[id].value, 0) / ids.length;
  }
  return out;
}
