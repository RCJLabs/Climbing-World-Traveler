// Zod schemas mirroring docs/schemas.md for the content the P1a build ships. The validator (scripts/validate.ts)
// and the bundle loader both use these, so content and code cannot drift apart silently.
import { z } from 'zod';
import { ALL_ATTRS, HOLD_TYPES } from '../sim/types';

const attrId = z.enum(ALL_ATTRS as unknown as [string, ...string[]]);
const holdType = z.enum(HOLD_TYPES as unknown as [string, ...string[]]);
const phase = z.enum(['P1a', 'P1b', 'P2', 'P3', 'P4', 'P5']);
const tag = z.string().regex(/^[a-z_]+$/);
const moveClass = z.enum(['static', 'deadpoint', 'dyno', 'high_step', 'heel_hook', 'toe_hook', 'mantle', 'jam', 'match', 'bump', 'kneebar']);
const numRecord = (key: z.ZodTypeAny) => z.record(key, z.number());

export const TraitEffectSchema = z.object({
  attr_add: numRecord(attrId).optional(),
  ceiling_add: numRecord(attrId).optional(),
  attr_mult: numRecord(attrId).optional(),
  adapt_rate_mult: numRecord(attrId).optional(),
  hold_mult: numRecord(holdType).optional(),
  move_mult: numRecord(moveClass).optional(),
  condition_mult: numRecord(z.enum(['cold', 'heat', 'humid', 'altitude'])).optional(),
  resource_mult: z.record(z.string(), z.number()).optional(),
  fear_add: z.number().optional(),
  injury_risk_mult: z.number().optional(),
  recovery_mult: z.number().optional(),
  cost_mult: z.number().optional(),
  rep_mult: z.number().optional(),
  flags: z.array(z.string()).optional(),
}).strict();

export const TraitSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string().min(1),
  category: z.enum(['body', 'aptitude', 'mental', 'social', 'lifestyle', 'history', 'health', 'quirk']),
  kind: z.enum(['creation', 'hidden', 'acquired', 'evolving']),
  cost: z.number().int(),
  phase,
  tags: z.array(tag),
  effect: TraitEffectSchema,
  excludes: z.array(z.string()),
  requires_age: z.tuple([z.number(), z.number()]).optional(),
  flavour: z.string(),
}).strict().superRefine((t, ctx) => {
  const creation = t.kind === 'creation' || t.kind === 'evolving';
  const ok = t.category === 'quirk' || !creation ? t.cost === 0 || creation : Math.abs(t.cost) >= 2 && Math.abs(t.cost) <= 10;
  if (creation && t.category !== 'quirk' && !(Math.abs(t.cost) >= 2 && Math.abs(t.cost) <= 10)) {
    ctx.addIssue({ code: 'custom', message: `${t.id}: creation trait cost must be ±2..±10 (schemas §9 rule 2)` });
  }
  if (!ok) ctx.addIssue({ code: 'custom', message: `${t.id}: quirk, hidden and acquired traits cost 0` });
});

export const BackgroundSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  phase,
  unlock: z.string().optional(),
  point_bonus: z.number().int().min(0).max(6),
  age_range: z.tuple([z.number().min(16), z.number().max(45)]),
  attr_add: numRecord(attrId),
  attr_points: z.number().int().min(40).max(80),
  money_start: z.number().min(0),
  start_crag: z.string(),
  gear_start: z.array(z.string()),
  forced_traits: z.array(z.string()),
  locked_traits: z.array(z.string()),
  tags: z.array(tag),
  hook: z.string(),
}).strict();

const circuitColour = z.enum(['yellow', 'orange', 'blue', 'red', 'black', 'white']);

export const CragSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  region: z.string(),
  altitude_m: z.number(),
  rock: z.string(),
  disciplines: z.array(z.string()),
  di_range: z.tuple([z.number(), z.number()]),
  season: z.array(z.number().int().min(0).max(3)).length(12),
  cost_tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  phase,
  climate: z.array(z.object({
    t_mean: z.number(), t_sd: z.number(), rh_mean: z.number(), precip_days: z.number(), wind_mean: z.number(), snow: z.boolean(),
  }).strict()).length(12),
  sectors: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    character: z.string(),
    circuits: z.array(z.object({ colour: circuitColour, di_range: z.tuple([z.number(), z.number()]) }).strict()),
    landing: z.enum(['flat', 'uneven', 'sloping']),
    dry_lag_days: z.number(),
    shade: z.boolean(),
    style_profiles: z.array(z.string()).min(1),
    signature_routes: z.array(z.string()),
  }).strict()).min(1),
}).strict();

export const ProfileSchema = z.object({
  id: z.string(),
  rock: z.string(),
  hold_weights: numRecord(holdType),
  angle_dist: z.array(z.object({ angle: z.number().min(60).max(170), weight: z.number().positive() }).strict()).min(1),
  length_m: z.object({ min: z.number(), mode: z.number(), max: z.number() }).strict(),
  hold_density_max: z.number(),
  polish: z.number().min(0).max(1),
  sharpness: z.number().min(0).max(1),
  seep_susceptibility: z.number().min(0).max(1),
  crux_position: z.enum(['low', 'mid', 'high', 'spread']),
  move_grammar: numRecord(moveClass),
  feature_weights: z.record(z.string(), z.number()),
  decoy_rate: z.number(),
  hidden_rate: z.number(),
  drift_max_m: z.number(),
  pad_coverage: z.number(),
  name_bank: z.string(),
  di_max: z.number().min(8).max(33).optional(),
  protection: z.object({ kind: z.enum(['bolt', 'gear', 'none']), spacing_m: z.number().min(1).max(8).optional() }).strict().optional(),
  rest_spacing_m: z.number().min(3).max(20).optional(),
  tags: z.array(tag),
}).strict().superRefine((p, ctx) => {
  // A bolted profile is a sport profile (06 §2.6): the generator needs its bolt spacing and its rest spacing.
  if (p.protection?.kind === 'bolt' && (p.protection.spacing_m === undefined || p.rest_spacing_m === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `profile ${p.id}: a bolted profile needs protection.spacing_m and rest_spacing_m` });
  }
});

const hold = z.object({
  id: z.string(), x: z.number(), y: z.number(), type: holdType, size: z.enum(['xs', 's', 'm', 'l', 'xl']),
  orientation: z.number(), quality: z.number().min(0).max(1), sharpness: z.number(), friction: z.number(), polish: z.number(),
  hands_ok: z.boolean(), feet_ok: z.boolean(), hidden: z.boolean(), rest_value: z.number(),
}).strict();

export const RouteSchema = z.object({
  id: z.string(),
  crag: z.string(),
  area: z.string(),
  name: z.string(),
  discipline: z.string(),
  rock: z.string(),
  di_target: z.number(),
  di_graded: z.number(),
  danger: z.enum(['safe', 'spicy', 'bold', 'deadly']),
  wall: z.array(z.object({ y0: z.number(), y1: z.number(), angle: z.number().min(60).max(170), feature: z.string() }).strict()).min(1),
  width_m: z.number(),
  holds: z.array(hold).min(4),
  protection: z.array(z.object({
    id: z.string(), kind: z.string(), y: z.number(), x: z.number().optional(), width_m: z.number().optional(), quality: z.number(),
    reach_from: z.array(z.string()).optional(),
  }).strict()),
  start: z.object({ LH: z.string(), RH: z.string(), LF: z.string(), RF: z.string() }).strict(),
  finish_hold: z.string(),
  length_m: z.number(),
  style_tags: z.array(tag),
  signature: z.boolean(),
  seed: z.string().optional(),
  circuit: circuitColour.optional(),
  beta_line: z.array(z.object({ limb: z.enum(['LH', 'RH', 'LF', 'RF']), hold: z.string(), class: moveClass }).strict()).min(1),
  components: z.object({ hardest_move: z.number(), crux_density: z.number(), pump_peak: z.number(), rests: z.number(), dynamic_share: z.number() }).strict().optional(),
  fa_note: z.string().optional(),
}).strict();

export const NamesSchema = z.record(z.string(), z.object({
  lang: z.enum(['fr', 'en']).optional(),
  masc: z.array(z.string()).min(5), fem: z.array(z.string()).min(5), adj_masc: z.array(z.string()).min(5),
  adj_fem: z.array(z.string()).min(5), place: z.array(z.string()).min(3), suffix: z.array(z.string()).min(2),
}).strict());
