# Schemas and Canonical Vocabulary

This document is the single source of truth for every data shape and identifier used across the design docs and, later, the code. Other docs reference these names and must not invent alternatives. Types are written in TypeScript style for precision; the shipped code validates the JSON equivalents with Zod.

Related: [02 Character Model](02-character-model.md) · [05a Wall and Kinematics](05a-wall-and-kinematics.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [08 Grades](08-grades.md) · [20 Content Pipeline](20-content-pipeline.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

---

## 1. Conventions

- **IDs** are lowercase `snake_case` strings, globally unique within their collection, never renamed once shipped (add a new ID and deprecate the old one).
- **Numbers**: attributes and resources are `0..100` floats unless stated. Distances are metres. Angles are degrees from horizontal measured through the climber's body side, so `90` is vertical, `>90` overhangs, `<90` slabs. Time on the wall is in seconds. Calendar time is in whole days.
- **Difficulty Index (DI)** is a continuous float on the scale defined in [08 Grades](08-grades.md). All difficulty, inside the engine, is DI. Grades are display-only conversions.
- **Determinism**: anything random takes a `RngStream`. Streams are derived by hashing a purpose string with the run seed and contextual indices (see [18 Tech Architecture](18-tech-architecture.md)).
- **Phase** fields (`P1a | P1b | P2 | P3 | P4 | P5`) mark when content becomes live. Content outside the live phase is excluded from selection and from point costs.

---

## 2. Tag vocabulary

Tags are the only cross-cutting language for "what this thing helps or hurts". Every attribute, trait, hold type, move class, crag style profile and event carries tags from this list and no others. The character-creation UI uses them to show "helps with / hurts with", the archetype detector matches on them, and the balance harness groups by them.

```ts
type Tag =
  // terrain
  | 'slab' | 'vertical' | 'overhang' | 'roof' | 'arete' | 'corner' | 'crack' | 'compression' | 'highball'
  // holds
  | 'crimp' | 'edge' | 'sloper' | 'pinch' | 'pocket' | 'jug' | 'jam' | 'smear' | 'volume'
  // energy systems and movement
  | 'power' | 'endurance' | 'contact' | 'static' | 'dynamic' | 'core' | 'flexibility' | 'footwork' | 'reading'
  // conditions
  | 'cold' | 'heat' | 'humid' | 'wet' | 'wind' | 'altitude' | 'friction' | 'sharp' | 'polished'
  // mental
  | 'fear' | 'focus' | 'risk' | 'patience' | 'competition' | 'flow' | 'onsight' | 'redpoint'
  // social and career
  | 'social' | 'reputation' | 'partner' | 'sponsor' | 'ethics' | 'media'
  // lifestyle and body
  | 'money' | 'travel' | 'sleep' | 'nutrition' | 'health' | 'injury' | 'skin' | 'tendon' | 'weight' | 'reach' | 'recovery' | 'learning'
  // disciplines
  | 'boulder' | 'sport' | 'trad' | 'bigwall' | 'alpine' | 'ice' | 'dws' | 'comp' | 'gym';
```

---

## 3. Core enumerations

```ts
type Phase = 'P1a' | 'P1b' | 'P2' | 'P3' | 'P4' | 'P5';

type Discipline = 'boulder' | 'sport' | 'trad' | 'multipitch' | 'bigwall' | 'alpine' | 'ice' | 'mixed' | 'dws' | 'comp_boulder' | 'comp_lead' | 'gym';

type RockType =
  | 'granite' | 'monzonite' | 'syenite' | 'gneiss' | 'schist' | 'quartzite' | 'basalt' | 'dolerite'
  | 'limestone' | 'dolomite' | 'conglomerate' | 'tuff' | 'rhyolite'
  | 'sandstone_font' | 'sandstone_grit' | 'sandstone_wingate' | 'sandstone_corbin' | 'sandstone_nuttall'
  | 'sandstone_aztec' | 'sandstone_quartzitic' | 'sandstone_elb' | 'sandstone_generic'
  | 'ice' | 'plastic';

type HoldType =
  | 'crimp' | 'edge' | 'sloper' | 'pinch' | 'pocket1' | 'pocket2' | 'pocket3' | 'jug'
  | 'sidepull' | 'undercling' | 'gaston' | 'horn'
  | 'crack_finger' | 'crack_hand' | 'crack_fist' | 'crack_offwidth'
  | 'volume' | 'foot_chip' | 'smear'
  | 'ice_pick' | 'ice_frontpoint';            // P4

type MoveClass =
  | 'static' | 'deadpoint' | 'dyno' | 'high_step' | 'heel_hook' | 'toe_hook' | 'mantle' | 'jam'
  | 'match' | 'bump' | 'rest' | 'clip' | 'place_gear' | 'kneebar';

type Posture = 'hang' | 'compression' | 'drop_knee' | 'kneebar' | 'rest_stance' | 'mantle' | 'jam_stack' | 'layback' | 'stem';

type Limb = 'LH' | 'RH' | 'LF' | 'RF';

type SizeClass = 'xs' | 's' | 'm' | 'l' | 'xl';   // hold size relative to the hold type's norm

type ProtectionKind = 'bolt' | 'gear' | 'anchor' | 'pad_zone' | 'water' | 'ice_screw' | 'none';

type FallKind = 'boulder' | 'rope' | 'trad_rope' | 'water' | 'alpine';

type InjurySite = 'finger' | 'wrist' | 'elbow' | 'shoulder' | 'back' | 'knee' | 'ankle' | 'skin' | 'systemic';

type ShoeType = 'aggressive' | 'flat' | 'stiff' | 'soft';
```

Every content type (`Trait`, `Background`, `Crag`, `Route`, `InjuryDef`, `TrainingActivity`, `GameEvent`, `GearDef`, `CragStyleProfile`) may carry `deprecated?: boolean`. A deprecated entry stays in the data so old saves replay, but is never offered to new runs. This is how the "never rename an id" rule in §1 is honoured.

---

## 4. Character

### 4.1 Body (set at creation; see [02 §A](02-character-model.md#a-body))

```ts
interface Body {
  sex: 'f' | 'm';                      // affects reference benchmarks and body-comp bands only
  age_start: number;                   // 16..45 whole years
  height_cm: number;                   // 145..200
  mass_kg: number;                     // derived band from height and body_fat_pct, player may shift ±8 kg
  body_fat_pct: number;                // f 12..32, m 6..26
  ape_index: number;                   // 0.96..1.10
  finger_length: -2 | -1 | 0 | 1 | 2;  // bands relative to hand size
  finger_girth: -2 | -1 | 0 | 1 | 2;
  leg_torso: -2 | -1 | 0 | 1 | 2;      // negative = long torso/short legs
  natural_hip_mobility: number;        // 0..100, sets hip_mobility ceiling
  natural_shoulder_mobility: number;   // 0..100
  fibre_bias: number;                  // -1 (endurance) .. +1 (power)
  tendon_robustness: number;           // 0..100, HIDDEN at creation
  skin_thickness: 'thin' | 'normal' | 'thick';
  skin_moisture: 'dry' | 'normal' | 'sweaty';
  lock_depth_m?: number;               // Reference Climber only (05c §1.1): pinned lock-off depth, m at 170 cm; creation rejects it
}
```

### 4.2 Attributes (trainable; see [02 §B](02-character-model.md#b-attributes))

```ts
type PhysicalAttr =
  | 'finger_strength' | 'finger_endurance' | 'pull_power' | 'lockoff' | 'core_tension'
  | 'hip_mobility' | 'shoulder_mobility' | 'leg_power' | 'aerobic_capacity' | 'anaerobic_capacity'
  | 'contact_strength' | 'skin_durability';

type TechniqueAttr =
  | 'footwork' | 'body_position' | 'route_reading' | 'dynamic_movement'
  | 'tech_crimps' | 'tech_slopers' | 'tech_pinches' | 'tech_pockets' | 'tech_cracks' | 'tech_slab'
  | 'rope_craft' | 'gear_placement'
  | 'ice_tools' | 'aid_craft';          // P4 / P3

type MentalAttr = 'composure' | 'focus' | 'confidence' | 'commitment' | 'risk_judgement' | 'resilience';

type LifestyleAttr = 'nutrition' | 'sleep_hygiene' | 'logistics' | 'languages' | 'weather_sense';

type AttrId = PhysicalAttr | TechniqueAttr | MentalAttr | LifestyleAttr;

interface AttributeState {
  value: number;        // 0..100 current
  ceiling: number;      // 0..100 from Body + traits + age
  pending: number;      // gain banked on the slow (tendon) clock, released over time (12 §3)
  load_acute: number;   // 7-day training stimulus (see 12)
  load_chronic: number; // 28-day
}

interface Attributes {
  [id in AttrId]: AttributeState;
  rock_knowledge: Partial<Record<RockType, number>>;   // 0..100 per rock type, learned by climbing on it
}
```

### 4.3 Resources (short-term state)

```ts
interface Resources {
  // on-wall, reset per attempt
  pump: number;             // 0..100, 100 = hands open
  power: number;            // 0..100 anaerobic burst pool
  aerobic_reserve: number;  // 0..100 drains with time on route, feeds pump recovery
  fear: number;             // 0..100 current arousal
  focus_meter: number;      // 0..100
  chalk: number;            // 0..100
  // per day
  skin: number;             // 0..100, heals overnight by skin_durability
  energy: number;           // 0..100
  // longer horizons
  stoke: number;            // 0..100 weekly motivation
  burnout: number;          // 0..100 seasonal
  health: number;           // 0..100 general
  money: number;            // currency units (USD-equivalent)
}
```

### 4.4 Traits (see [03 Traits](03-traits.md))

```ts
type TraitCategory = 'body' | 'aptitude' | 'mental' | 'social' | 'lifestyle' | 'history' | 'health' | 'quirk';
type TraitKind = 'creation' | 'hidden' | 'acquired' | 'evolving';

interface TraitEffect {
  // all optional; applied additively in the order listed in 02 §C
  attr_add?: Partial<Record<AttrId, number>>;          // flat value shift at creation
  ceiling_add?: Partial<Record<AttrId, number>>;
  attr_mult?: Partial<Record<AttrId, number>>;         // ONE multiplier trait allowed per attribute
  adapt_rate_mult?: Partial<Record<AttrId, number>>;   // training gain speed
  hold_mult?: Partial<Record<HoldType, number>>;       // EffectiveStat multiplier by hold type
  move_mult?: Partial<Record<MoveClass, number>>;
  condition_mult?: Partial<Record<'cold' | 'heat' | 'humid' | 'altitude', number>>;
  resource_mult?: Partial<Record<keyof Resources, number>>;   // multiplies the resource's regeneration or gain, never its ceiling (03 §1.9)
  injury_site_mult?: Partial<Record<InjurySite, number>>;    // injury-risk multiplier by site
  scope?: { rock?: RockType[]; region?: string[]; discipline?: Discipline[] };   // when present the whole effect applies only in scope (Crag Mayor, Tufa Whisperer, Grit Hardened)
  fear_add?: number;              // baseline fear shift
  injury_risk_mult?: number;
  recovery_mult?: number;
  cost_mult?: number;             // daily living costs
  rep_mult?: number;
  event_weights?: Record<string, number>;   // event id -> weight multiplier
  flags?: string[];               // free-form switches read by specific systems, documented per trait
}

interface Trait {
  id: string;
  name: string;
  category: TraitCategory;
  kind: TraitKind;
  cost: number;                   // creation traits: +2..+10 cost, -2..-10 refund; quirks, hidden and acquired: 0
  point_mass?: number;            // hidden traits only: signed weight used to balance the hidden pool (03 §1.6)
  phase: Phase;
  tags: Tag[];
  effect: TraitEffect;
  excludes: string[];             // trait ids; reciprocal for creation traits, one-way allowed for hidden
  requires?: string[];            // trait ids or background ids
  requires_age?: [number, number];   // inclusive age_start window (Late Starter ≥ 28)
  evolves_to?: { trait: string; condition: string }[];   // for 'evolving' traits
  foreshadow?: string;            // hidden traits: event id that fires before the reveal
  expires?: { days: number } | { condition: string };    // temporary acquired traits (Acclimatised, Comp Yips)
  flavour: string;
}
```

### 4.5 Background (see [04 Backgrounds](04-backgrounds.md))

```ts
interface Background {
  id: string;
  name: string;
  phase: Phase;
  unlock?: string;                              // meta unlock required to pick it (16 §4.1), e.g. Farm Kid in P1a
  point_bonus: number;                          // 0..6
  age_range: [number, number];                  // inclusive age_start window the background allows
  attr_add: Partial<Record<AttrId, number>>;
  attr_points: number;                          // free starting allocation on top of base
  money_start: number;
  start_crag: string;                           // crag id
  gear_start: string[];                         // gear ids
  contacts: { archetype: string; count: number }[];
  forced_traits: string[];
  locked_traits: string[];
  tags: Tag[];
  hook: string;
}
```

### 4.6 Climber (player or NPC)

```ts
interface Climber {
  id: string;
  name: string;
  is_player: boolean;
  body: Body;
  attributes: Attributes;
  resources: Resources;
  traits: string[];
  background: string;
  age_days: number;
  born_day: number;                 // sim day
  injuries: InjuryInstance[];
  gear: GearInstance[];
  home_region: string;
  location: string;                 // crag id or hub id
  reputation: Record<string, number>;   // region id -> -100..100
  rep_discipline: Partial<Record<Discipline, number>>;   // -100..100
  ethics: number;                   // -100..100, chipping/spraying/access violations lower it (15)
  following: number;                // media audience size, drives content income and sponsor tiers (14, 15)
  sponsor_tier: 0 | 1 | 2 | 3 | 4 | 5;
  sponsor_contract_day?: number;    // sim day the current contract renews
  relationships: Record<string, Relationship>;   // climber id -> relationship
  ticklist: Tick[];
  known_routes: Record<string, { attempts: number; familiarity: number; beta_known: boolean }>;   // route id -> memory (05b §12)
  counters: Record<string, number>; // named counters for evolving traits and events (practice_falls, rope_falls_logged, flights_taken…)
  acclimatisation_m: number;        // altitude the climber is currently adapted to (07, 10)
  rack_kg: number;                  // carried protection mass on trad routes (07)
  insurance: 'none' | 'travel' | 'full';   // (13, 14)
  comp_results: { event: string; day: number; discipline: Discipline; rank: number; field: number }[];
  archetypes: string[];             // detected, cosmetic
}
```

---

## 5. Wall, holds, routes

```ts
interface WallSegment {
  y0: number; y1: number;           // metres from ground
  length_m?: number;                // surface length; required when angle ≥ 165° because y0..y1 collapses on roofs (05a)
  angle: number;                    // degrees, 90 = vertical, capped at 170
  feature?: 'arete' | 'corner' | 'crack' | 'lip' | 'ledge' | 'hueco' | 'tufa' | 'none';
}

interface Hold {
  id: string;
  x: number; y: number;             // metres; x lateral, y height
  s?: number;                       // distance along the wall surface from the start, derived from segments (05a); cached, not authored
  kneebar_with?: string;            // hold id that pairs with this one for a kneebar
  type: HoldType;
  size: SizeClass;
  orientation: number;              // degrees; 0 = pull straight down, 90 = sidepull right, 180 = undercling
  quality: number;                  // 0..1 how positive / incut
  sharpness: number;                // 0..1 skin cost multiplier
  friction: number;                 // 0..1 base from rock type and polish
  polish: number;                   // 0..1
  hands_ok: boolean; feet_ok: boolean;
  hidden: boolean;                  // revealed by route_reading or beta
  rest_value: number;               // 0..1 how good a shake it allows
  state?: { chalk: number; wet: number; seep: number };   // per visit
}

interface Protection {
  id: string;
  kind: ProtectionKind;
  y: number; x?: number;
  width_m?: number;                 // pad zones and water: lateral extent protected
  gear_sizes?: string[];            // 'c0.3'..'c6', 'nut1'..'nut13'
  quality: number;                  // 0..1 placement quality (gear), bolt condition
  reach_from: string[];             // hold ids from which a clip/placement is possible
}

interface Route {
  id: string;
  crag: string;
  name: string;
  discipline: Discipline;
  di_target: number;                // generator target
  di_graded: number;                // from 05c
  danger: 'safe' | 'spicy' | 'bold' | 'deadly';   // separate axis, 05c
  wall: WallSegment[];
  holds: Hold[];
  protection: Protection[];
  start: Partial<Record<Limb, string>>;         // start hold per limb (P1a; replaces start_holds, see 22)
  finish: { type: 'top_out' | 'jug' | 'anchor' | 'lower_off'; hold_ids: string[] };
  length_m: number;
  style_tags: Tag[];
  signature: boolean;
  seed?: string;                    // procedural only
  beta_line?: { limb: Limb; hold: string }[];   // the generator's intended sequence; revealed by route_reading or beta (06)
  components?: { hardest_move: number; crux_density: number; pump_peak: number; rests: number };   // surfaced by the grade engine (05c)
  aid_grade?: string;               // 'A0'..'A5' | 'C1'..'C5' (P3)
  nccs?: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';   // commitment grade for multipitch/big wall (P3)
  hazard_zones?: { y0: number; y1: number; kind: 'serac' | 'rockfall' | 'avalanche' | 'cornice'; p_per_hour: number }[];   // alpine objective hazard (P4)
  fa_note?: string;                 // fictional FA credit text; no real people
}

interface Hub { id: string; name: string; country: string; lat: number; lon: number; airport: boolean; }
// TravelEdge gains an `id` (referenced by Action.travel.edge): `${from}__${to}__${mode}`.
```

---

## 6. World

```ts
interface Climate {
  month: Record<1|2|3|4|5|6|7|8|9|10|11|12, {
    t_mean: number; t_sd: number;        // °C
    rh_mean: number;                     // % relative humidity
    precip_days: number;                 // expected wet days per month
    wind_mean: number;                   // m/s
    snow: boolean;
  }>;
  shade_fraction: number;                // 0..1 of sectors in shade mid-day
  dry_lag_days: number;                  // rock type dependent dry-out
  seep_lag_days: number;                 // tufa/seep lag
}

interface CragStyleProfile {
  id: string;
  rock: RockType;
  hold_weights: Partial<Record<HoldType, number>>;
  angle_dist: { angle: number; weight: number }[];
  length_m: { min: number; mode: number; max: number };
  hold_density_max: number;              // per m²
  protection: { kind: ProtectionKind; spacing_m?: number; gear_sizes?: string[] };
  polish: number; sharpness: number; friction_base: number;
  seep_susceptibility: number;
  crux_position: 'low' | 'mid' | 'high' | 'spread';
  move_grammar: Partial<Record<MoveClass, number>>;
  feature_weights?: Partial<Record<NonNullable<WallSegment['feature']>, number>>;
  rest_spacing_m?: number;          // mean distance between generated rest stances (routes)
  decoy_rate?: number;              // off-route holds per metre of line, 0..1 (06)
  hidden_rate?: number;             // share of holds hidden until read, 0..1
  drift_max_m?: number;             // bound on lateral drift of the main line
  pad_coverage?: number;            // boulders: default pad zone width as a fraction of landing
  name_bank?: string;               // id of the crag-flavoured name generator table
  di_max?: number;                  // hardest DI the style can be built to; above it a sector picks among its other profiles (06 §2.1)
  tags: Tag[];
}

interface Crag {
  id: string;
  name: string;
  country: string; region: string;
  lat: number; lon: number; altitude_m: number;
  rock: RockType;
  disciplines: Discipline[];
  di_range: [number, number];
  season: Record<1|2|3|4|5|6|7|8|9|10|11|12, 0 | 1 | 2 | 3>;   // 0 closed/unclimbable .. 3 prime
  climate: Climate;
  cost_tier: 1 | 2 | 3 | 4 | 5;
  access: AccessRule[];
  community_size: 'tiny' | 'small' | 'medium' | 'large' | 'huge';
  language: string[];
  gym_tier: 0 | 1 | 2 | 3;
  connectivity: 0 | 1 | 2 | 3;           // 0 none .. 3 reliable; gates remote work and content income (14)
  climate_class: string;                 // short label used by the UI and the weather model (10)
  sun_aspect?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'mixed';
  season_by_discipline?: Partial<Record<Discipline, Crag['season']>>;   // when ice and rock seasons differ (Chamonix)
  min_rope_m?: number;
  landing?: 'flat' | 'uneven' | 'sloping' | 'blocks' | 'water';   // boulder landings default
  tide_seed?: string;                    // DWS crags: seeds the daily tide/swell series (07)
  sectors?: { id: string; name: string; character: string; circuits?: { colour: string; di_range: [number, number] }[]; landing?: Crag['landing']; dry_lag_days?: number }[];
  signature_routes: string[];            // route ids
  style_profiles: string[];              // CragStyleProfile ids
  npc_archetypes: string[];
  hub: string;                           // travel hub id
  character: string;
  phase: Phase;
}

interface AccessRule {
  kind: 'permit' | 'daily_cap' | 'reservation' | 'wet_rock' | 'seasonal_closure' | 'cultural' | 'raptor' | 'fee' | 'visa';
  detail: string;
  months?: number[];
  cost?: number;
  dry_days_required?: number;
  rep_penalty_if_violated?: number;
}

interface TravelEdge { from: string; to: string; mode: 'fly' | 'drive' | 'bus' | 'train' | 'boat' | 'trek'; cost: number; days: number; }
```

---

## 7. Systems

```ts
interface InjuryDef {
  id: string;
  name: string;
  site: InjurySite;
  severities: { grade: 1 | 2 | 3; heal_days: [number, number]; full_load_days: [number, number]; permanent_ceiling_loss?: Partial<Record<AttrId, number>>; career_ending?: boolean }[];
  triggers: ('load' | 'fall' | 'move' | 'cold' | 'altitude' | 'illness')[];
  risk_mods: { tag: Tag; mult: number }[];
  rehab: string[];                        // TrainingActivity ids
  acquired_trait?: string;
}

interface InjuryInstance { def: string; grade: 1 | 2 | 3; day_onset: number; day_full_load: number; rehab_progress: number; rehab_compliance: number; /* 0..1, lowers re-injury risk (13) */ }

interface ActivityBlock {
  kind: 'climb' | 'train' | 'rest' | 'active_recovery' | 'work' | 'social' | 'travel' | 'admin' | 'physio' | 'comp_round' | 'alpine_day' | 'climb_bigwall';
  time_of_day: 'dawn' | 'morning' | 'afternoon' | 'dusk';
  target?: string;                  // route id, TrainingActivity id, NPC id or job id depending on kind
}

interface TrainingActivity {
  id: string;
  name: string;
  stimulus: Partial<Record<AttrId, number>>;      // raw stimulus units per session
  load: number;                                   // adds to load_acute
  energy_cost: number; skin_cost: number;
  requires: ('hangboard' | 'campus' | 'board' | 'gym' | 'weights' | 'outdoors' | 'none')[];
  tags: Tag[];
}

interface GearDef {
  id: string;
  name: string;
  kind: 'shoe' | 'rope' | 'cam' | 'nut' | 'quickdraw' | 'pad' | 'chalk' | 'harness' | 'helmet' | 'clothing' | 'ice_tool' | 'screw' | 'hangboard' | 'vehicle' | 'misc';
  cost: number;
  mass_kg: number;
  wear_sessions?: number;           // sessions until worn out (shoes, rope); vehicles use days
  shoe?: { type: ShoeType; hold_mult: Partial<Record<HoldType, number>>; move_mult: Partial<Record<MoveClass, number>>; resole_cost: number };
  size?: string;                    // cams and nuts: 'c0.3'..'c6', 'nut1'..'nut13'
  tags: Tag[];
  phase: Phase;
}

interface GearInstance { def: string; wear: number; /* 0..1 remaining */ acquired_day: number; }

interface GameEvent {
  id: string;
  title: string;
  context: ('crag' | 'travel' | 'rest_day' | 'social' | 'training' | 'weather' | 'injury' | 'comp')[];
  weight: number;
  conditions: string[];                           // predicate ids evaluated by the event system (15 §5)
  options: { text: string; requires?: string[]; outcomes: { weight: number; effects: EventEffect; text: string }[] }[];
  once_per_run?: boolean;
  cooldown_days?: number;
  phase: Phase;
}

// All numeric EventEffect fields are DELTAS applied to the current value, never absolute sets.
// Keys in `rep` and `relationship` may use the placeholders '@here' (current region), '@partner', '@local',
// '@rival' (NPC ids resolved at fire time) and `traits_add` may use '@pending_hidden' (the queued hidden trait).
interface EventEffect {
  resources?: Partial<Resources>;
  attr_add?: Partial<Record<AttrId, number>>;
  traits_add?: string[]; traits_remove?: string[];
  rep?: Record<string, number>;
  rep_discipline?: Partial<Record<Discipline, number>>;
  ethics?: number;
  following_mult?: number;
  sponsor_tier_delta?: number;
  money?: number;
  injury?: string;                                // InjuryDef id, grade rolled by 13
  relationship?: Record<string, number>;          // trust deltas
  npc_patch?: Record<string, Partial<NPC>>;       // e.g. mark a partner injured or departed
  delay_days?: number;                            // lose travel/climbing days
  unlock?: string[];
}

interface NPC extends Climber {
  archetype: string;
  persistent: boolean;
  belay_quality: number;        // 0..100
  spot_quality: number;
  reliability: number;          // shows up when planned
  spray: number;                // how much unsolicited beta
  risk_tolerance: number;
  retire_day?: number;
}

interface Relationship { trust: number; familiarity: number; rivalry: number; romance?: number; last_seen_day: number; }

interface Tick { route: string; day: number; style: 'onsight' | 'flash' | 'redpoint' | 'repeat' | 'attempt'; attempts: number; di: number; }
```

---

## 8. Save game and run

```ts
interface SaveGame {
  version: number;                       // reducer/schema version, migrated by replay (18 §5)
  data_version: string;                  // content bundle that produced the run; replay selects it
  run_seed: string;
  created: string;                       // ISO date
  actions: Action[];                     // full action log since last snapshot
  snapshot?: WorldState;                 // periodic materialised state
  snapshot_action_index?: number;
}

// Account-level state that lives outside any run (18 §5 `meta` store). Never written by run actions.
interface MetaState {
  version: number;
  unlocks: string[];                     // trait, background, crag, scenario ids
  hall_of_fame: RunSummary[];
  legacies: string[];                    // NPC ids created from retired climbers
  pyramid: Record<Discipline, Record<number, number>>;   // DI step -> count of sends across all runs
  daily_history: { seed: string; summary: RunSummary }[];
}

// P1a action union (implemented in src/sim/types.ts; docs/22 §3). The day is a sequence of blocks rather than
// one day_plan, so a session can be saved mid-attempt. Later phases add travel, event_choice, risky_choice,
// buy/sell and social blocks.
type Action =
  | { t: 'new_run'; seed: string; spec: NewRunSpec }
  | { t: 'block_start'; kind: 'climb' | 'train' | 'rest' | 'active_recovery' | 'work'; target?: string }   // climb: sector id; train: activity id
  | { t: 'block_end' }
  | { t: 'end_day' }
  | { t: 'attempt_start'; route_seed: string; mode: 'onsight' | 'flash' | 'redpoint' | 'work' }   // auto-climb is a UI policy that emits ordinary moves
  | { t: 'move'; limb: Limb; hold: string; class: MoveClass; perf?: MovePerf }   // class is explicit (05b §2); perf = the player's drag, absent = Auto (docs/23 §3.1)
  | { t: 'commit'; swing: SwingPerf | null }            // the dyno's Swing and Catch (docs/23 §3.3); null = Auto-commit
  | { t: 'wall_action'; kind: 'rest' | 'chalk' | 'jump_off' }
  | { t: 'retire' }
  | { t: 'settings'; patch: Partial<Pick<RunOptions, 'auto_commit' | 'sweep_speed' | 'pause_drift'>> };

interface NewRunSpec { name: string; background: string; body: Body; traits: string[]; attr_alloc: Partial<Record<AttrId, number>>; options: RunOptions }

// Full-game additions, not yet implemented:
//   { t: 'travel'; edge: string } · { t: 'event_choice'; event: string; option: number }
//   { t: 'risky_choice'; kind: 'solo' | 'dws_s3' | 'highball_reckless' | 'ignore_gear_warning' | 'alpine_commit'; route?: string }
//   { t: 'buy' | 'sell'; item: string } · block kinds social, travel, admin, physio, comp_round, climb_bigwall, alpine_day

// SwingPerf (docs/23 §3.3): power 0–1 of the dyno's top launch speed, launch direction in degrees from +x (90 = up the
// rock), and the grab time in flight ms (game time), null for no grab.
interface SwingPerf { power: number; angle_deg: number; catch_ms: number | null }

// MovePerf (docs/23 §3.1–§3.2): what the player did on a move that is not a dyno. Reach: how long the limb was off its
// hold (ms, summed over every try at the move). Balance: how long the centre of mass was out of the base during the
// reach (ms). Both: where the limb landed as a share of the on-screen placement ring (0 = centre, 1 = its edge).
// `kind` must match the move's type (the stance test, docs/23 §2.2, decides Balance); numbers finite and ≥ 0; never on a
// deadpoint or dyno; otherwise the action is invalid.
type MovePerf = { kind: 'reach'; time_ms: number; place: number } | { kind: 'balance'; out_ms: number; place: number };
// One-thumb mode is a device setting (Settings.one_thumb), not part of the run: it changes no outcome.

interface RunOptions { death_enabled: boolean; auto_commit: boolean; sweep_speed: number; difficulty: 'story' | 'standard' | 'hard'; daily_seed?: string; pause_drift?: boolean; }
// pause_drift (shown as Balance moves: No drift): the centre of mass on a Balance move moves only when the player moves it
// (docs/23 §2.2). Absent = drift on.
// sweep_speed (0.6–1.6, shown as Dyno speed) now only slows or speeds the dyno's flight on screen (playback 0.6 / sweep_speed);
// it never changes an outcome, because the grab time is logged in flight time.

interface RunSummary {                   // P1a shape (src/sim/types.ts); later phases make hardest per discipline
  climber: string; background: string; days: number; age_end: number;
  end_reason: 'retired' | 'forced_injury' | 'death' | 'burnout' | 'bankrupt';
  hardest: number;                       // boulder DI, best first send
  hardest_onsight: number;               // DI
  hardest_flash: number;                 // DI, onsight or flash
  ticks: number;                         // first sends (repeats excluded)
  circuits: Partial<Record<CircuitColour, number>>;
  score: number;                         // Hall of Fame score (16 §6, P1a formula in 22)
  unlocks: string[];
  seed: string;
  pyramid: Record<string, number>;       // rounded DI -> first sends
  got_away?: { name: string; sessions: number; di: number };
  // later: scenario, risky_choices, first_ascents, injuries, countries, legacy_npc_id
}
```

---

## 9. Validation rules (enforced by the content validator, see [20](20-content-pipeline.md))

1. Every `Tag` used anywhere appears in §2.
2. Trait costs are integers in `[-10,-2] ∪ [2,10]` for `creation` kind; `0` for `quirk`, `acquired`, `hidden` (hidden traits carry a `point_mass` used for pool balancing instead).
3. At most one trait in the whole catalogue may set `attr_mult` for a given attribute *and* be selectable together (validator checks pairwise exclusions).
4. `Crag.season` has all twelve months; `Crag.di_range` lies within the DI range of [08](08-grades.md).
5. Every `Route.protection[].reach_from` references holds in the same route; every `start` hold exists.
6. `Route.di_graded` is produced by the grade engine, never hand-entered, except on `signature: true` routes where a `di_target` is required and the engine result must land within ±1.0.
7. `Background.start_crag` must have `phase` ≤ the background's phase, and `Background.age_range` must lie within 16..45.
8. All text fields containing people are fictional; the validator rejects a configurable list of real climbers' names.
9. `excludes` must be reciprocal between two `creation` traits; a `hidden` trait may exclude one-way (the chosen trait does not need to know about the hidden one).
10. Hidden traits carry `point_mass`; the pool's positive and negative masses must be equal (03 §1.6).
11. Every `scope`, `foreshadow`, `requires_age`, `expires` and `TraitEffect.flags` entry must be read by a system named in the trait's row; the validator keeps the flag registry from 03 §1.9.
12. `deprecated` entries are excluded from new-run selection and from the harness, but must still validate.

## Open questions

- Whether the sim should expose a `t: 'meta'` action family for unlock claims and legacy deletion, or keep all `MetaState` mutations outside the run log as [18 §5](18-tech-architecture.md) assumes. Current answer: outside the log.
- `WorldState` is typed as `RunState` in `src/sim/state.ts` (reducer version 1, P1a). NPCs, visited-crag state beyond Fontainebleau, snow depth and event cooldowns join it with their systems.
- `Climber.burnout_inputs` (the monotony and failure-streak accumulators behind the burnout formula in [12](12-training-and-adaptation.md)) may belong in `Resources` or in `counters`; decide when the day loop is implemented.
- Placeholder keys in `EventEffect` (`@here`, `@partner`…) versus explicit `target` fields on `GameEvent`: placeholders are simpler for authors and are adopted here; revisit if the event validator cannot check them statically.
