// Zod schemas mirroring docs/schemas.md for the content the P1a build ships. The validator (scripts/validate.ts)
// and the bundle loader both use these, so content and code cannot drift apart silently.
import { z } from 'zod';
import { ALL_ATTRS, EVOLVE_COUNTERS, HOLD_TYPES, NPC_ARCHETYPES } from '../sim/types';

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
  evolves_to: z.array(z.object({
    trait: z.string().nullable(),
    needs: z.array(z.object({ counter: z.enum(EVOLVE_COUNTERS), n: z.number().int().min(1) }).strict()).min(1),
    min_weeks: z.number().int().min(0),
  }).strict()).min(1).optional(),
  flavour: z.string(),
}).strict().superRefine((t, ctx) => {
  const creation = t.kind === 'creation' || t.kind === 'evolving';
  const ok = t.category === 'quirk' || !creation ? t.cost === 0 || creation : Math.abs(t.cost) >= 2 && Math.abs(t.cost) <= 10;
  if (creation && t.category !== 'quirk' && !(Math.abs(t.cost) >= 2 && Math.abs(t.cost) <= 10)) {
    ctx.addIssue({ code: 'custom', message: `${t.id}: creation trait cost must be ±2..±10 (schemas §9 rule 2)` });
  }
  if (!ok) ctx.addIssue({ code: 'custom', message: `${t.id}: quirk, hidden and acquired traits cost 0` });
  // Schemas §9 rule 17: evolutions belong to evolving traits and the acquired stages they lead to.
  if (t.evolves_to && t.kind !== 'evolving' && t.kind !== 'acquired') ctx.addIssue({ code: 'custom', message: `${t.id}: only evolving and acquired traits evolve` });
  if (t.kind === 'evolving' && !t.evolves_to) ctx.addIssue({ code: 'custom', message: `${t.id}: an evolving trait needs an evolution` });
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
const travelMode = z.enum(['fly', 'drive', 'bus', 'train', 'boat', 'trek']);
const tier = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const AccessRuleSchema = z.object({
  kind: z.enum(['permit', 'daily_cap', 'reservation', 'wet_rock', 'seasonal_closure', 'cultural', 'raptor', 'fee', 'visa']),
  detail: z.string().min(1),
  months: z.array(z.number().int().min(1).max(12)).optional(),
  cost: z.number().min(0).optional(),
  dry_days_required: z.number().min(0).optional(),
  rep_penalty_if_violated: z.number().max(0).optional(),
}).strict();

export const CragSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
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
  // The atlas fields (schemas §6, 09 §2–§6), required from P2 M1.
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  hub: z.string().regex(/^hub_[a-z0-9_]+$/),
  last_mile: z.object({ mode: travelMode, cost: z.number().min(0), days: z.number().int().min(0).max(10) }).strict(),
  access: z.array(AccessRuleSchema),
  community_size: z.enum(['tiny', 'small', 'medium', 'large', 'huge']),
  language: z.array(z.string().regex(/^[a-z]{2,3}$/)).min(1),
  gym_tier: tier,
  connectivity: tier,
  climate_class: z.string().regex(/^[a-z_]+$/),
  npc_archetypes: z.array(z.enum(NPC_ARCHETYPES)).min(1),
  look: z.object({ scenery: z.enum(['forest', 'sea']) }).strict(),
  grades: z.object({ boulder: z.enum(['font', 'v']).optional(), sport: z.enum(['french', 'yds']).optional() }).strict().optional(),
  sectors: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    character: z.string(),
    circuits: z.array(z.object({ colour: circuitColour, di_range: z.tuple([z.number(), z.number()]) }).strict()),
    landing: z.enum(['flat', 'uneven', 'sloping']),
    dry_lag_days: z.number(),
    seep_lag_days: z.number().min(1).max(30).optional(),
    shade: z.boolean(),
    style_profiles: z.array(z.string()).min(1),
    signature_routes: z.array(z.string()),
    routes: z.number().int().min(1).max(2000).optional(),
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
  di_min: z.number().min(6).max(33).optional(),
  protection: z.object({ kind: z.enum(['bolt', 'gear', 'none']), spacing_m: z.number().min(1).max(8).optional() }).strict().optional(),
  rest_spacing_m: z.number().min(3).max(20).optional(),
  tags: z.array(tag),
}).strict().superRefine((p, ctx) => {
  // A bolted profile is a sport profile (06 §2.6): the generator needs its bolt spacing and its rest spacing.
  if (p.protection?.kind === 'bolt' && (p.protection.spacing_m === undefined || p.rest_spacing_m === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `profile ${p.id}: a bolted profile needs protection.spacing_m and rest_spacing_m` });
  }
  if (p.di_min !== undefined && p.di_max !== undefined && p.di_min >= p.di_max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `profile ${p.id}: di_min must be below di_max` });
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

/** The hubs and the legs between them (09 §8.1–§8.2); each crag's last mile is in its own folder (27 M1). */
export const TravelSchema = z.object({
  hubs: z.array(z.object({ id: z.string().regex(/^hub_[a-z0-9_]+$/), name: z.string(), country: z.string().length(2), lat: z.number(), lon: z.number(), airport: z.boolean() }).strict()),
  edges: z.array(z.object({
    from: z.string().regex(/^hub_/), to: z.string().regex(/^hub_/), mode: travelMode, cost: z.number().min(0), days: z.number().int().min(0).max(10),
  }).strict()),
}).strict();

/** data/manifest.json (docs/20 §1): each crag folder's content hash, written by `pnpm manifest`. */
export const ManifestSchema = z.object({
  crags: z.record(z.string().regex(/^[a-z0-9_]+$/), z.string().regex(/^[0-9a-z]+$/)),
}).strict();

/** Real climbers' names the content may not contain (schemas §9 rule 8): whole names, first and last. */
export const RealNamesSchema = z.array(z.string().regex(/\S+\s+\S+/)).min(1);

export const NamesSchema = z.record(z.string(), z.object({
  lang: z.enum(['fr', 'en']).optional(),
  masc: z.array(z.string()).min(5), fem: z.array(z.string()).min(5), adj_masc: z.array(z.string()).min(5),
  adj_fem: z.array(z.string()).min(5), place: z.array(z.string()).min(3), suffix: z.array(z.string()).min(2),
}).strict());
