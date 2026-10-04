// Canonical types for the simulation. Mirrors docs/schemas.md; P1a uses a subset.
// Identifiers must not be invented here without adding them to docs/schemas.md first.

export type Phase = 'P1a' | 'P1b' | 'P2' | 'P3' | 'P4' | 'P5';

export const PHASE_ORDER: readonly Phase[] = ['P1a', 'P1b', 'P2', 'P3', 'P4', 'P5'];

export type Tag =
  | 'slab' | 'vertical' | 'overhang' | 'roof' | 'arete' | 'corner' | 'crack' | 'compression' | 'highball'
  | 'crimp' | 'edge' | 'sloper' | 'pinch' | 'pocket' | 'jug' | 'jam' | 'smear' | 'volume'
  | 'power' | 'endurance' | 'contact' | 'static' | 'dynamic' | 'core' | 'flexibility' | 'footwork' | 'reading'
  | 'cold' | 'heat' | 'humid' | 'wet' | 'wind' | 'altitude' | 'friction' | 'sharp' | 'polished'
  | 'fear' | 'focus' | 'risk' | 'patience' | 'competition' | 'flow' | 'onsight' | 'redpoint'
  | 'social' | 'reputation' | 'partner' | 'sponsor' | 'ethics' | 'media'
  | 'money' | 'travel' | 'sleep' | 'nutrition' | 'health' | 'injury' | 'skin' | 'tendon' | 'weight' | 'reach' | 'recovery' | 'learning'
  | 'boulder' | 'sport' | 'trad' | 'bigwall' | 'alpine' | 'ice' | 'dws' | 'comp' | 'gym';

export type RockType =
  | 'granite' | 'monzonite' | 'syenite' | 'gneiss' | 'schist' | 'quartzite' | 'basalt' | 'dolerite'
  | 'limestone' | 'dolomite' | 'conglomerate' | 'tuff' | 'rhyolite'
  | 'sandstone_font' | 'sandstone_grit' | 'sandstone_wingate' | 'sandstone_corbin' | 'sandstone_nuttall'
  | 'sandstone_aztec' | 'sandstone_quartzitic' | 'sandstone_elb' | 'sandstone_generic'
  | 'ice' | 'plastic';

export type HoldType =
  | 'crimp' | 'edge' | 'sloper' | 'pinch' | 'pocket1' | 'pocket2' | 'pocket3' | 'jug'
  | 'sidepull' | 'undercling' | 'gaston' | 'horn'
  | 'crack_finger' | 'crack_hand' | 'crack_fist' | 'crack_offwidth'
  | 'volume' | 'foot_chip' | 'smear';

export const HOLD_TYPES: readonly HoldType[] = [
  'crimp', 'edge', 'sloper', 'pinch', 'pocket1', 'pocket2', 'pocket3', 'jug',
  'sidepull', 'undercling', 'gaston', 'horn',
  'crack_finger', 'crack_hand', 'crack_fist', 'crack_offwidth',
  'volume', 'foot_chip', 'smear',
];

/** Move classes that resolve against the matrix (05b §3). */
export type MoveClass =
  | 'static' | 'deadpoint' | 'dyno' | 'high_step' | 'heel_hook' | 'toe_hook' | 'mantle' | 'jam'
  | 'match' | 'bump' | 'kneebar';

export type Posture = 'hang' | 'compression' | 'drop_knee' | 'kneebar' | 'rest_stance' | 'mantle' | 'jam_stack' | 'layback' | 'stem';
export type Limb = 'LH' | 'RH' | 'LF' | 'RF';
export const LIMBS: readonly Limb[] = ['LH', 'RH', 'LF', 'RF'];
export type LimbKind = 'hand' | 'foot';
export type SizeClass = 'xs' | 's' | 'm' | 'l' | 'xl';
export type Feature = 'arete' | 'corner' | 'crack' | 'lip' | 'ledge' | 'hueco' | 'tufa' | 'none';
export type ProtectionKind = 'bolt' | 'gear' | 'anchor' | 'pad_zone' | 'water' | 'ice_screw' | 'none';
export type Discipline = 'boulder' | 'sport' | 'trad' | 'multipitch' | 'bigwall' | 'alpine' | 'ice' | 'mixed' | 'dws' | 'comp_boulder' | 'comp_lead' | 'gym';

// ---------------------------------------------------------------- character

export interface Body {
  sex: 'f' | 'm';
  age_start: number;
  height_cm: number;
  mass_kg: number;
  body_fat_pct: number;
  ape_index: number;
  finger_length: number; // -2..2
  finger_girth: number; // -2..2
  leg_torso: number; // -2..2
  natural_hip_mobility: number;
  natural_shoulder_mobility: number;
  fibre_bias: number; // -1..1
  tendon_robustness: number; // hidden
  skin_thickness: 'thin' | 'normal' | 'thick';
  skin_moisture: 'dry' | 'normal' | 'sweaty';
  /** Reference Climber only: lock-off depth pinned in metres at 170 cm (05a §4.2, 05c §1.1). Never set for a real climber. */
  lock_depth_m?: number;
}

export const PHYSICAL_ATTRS = [
  'finger_strength', 'finger_endurance', 'pull_power', 'lockoff', 'core_tension',
  'hip_mobility', 'shoulder_mobility', 'leg_power', 'aerobic_capacity', 'anaerobic_capacity',
  'contact_strength', 'skin_durability',
] as const;
export const TECHNIQUE_ATTRS = [
  'footwork', 'body_position', 'route_reading', 'dynamic_movement',
  'tech_crimps', 'tech_slopers', 'tech_pinches', 'tech_pockets', 'tech_cracks', 'tech_slab',
  'rope_craft', 'gear_placement',
] as const;
export const MENTAL_ATTRS = ['composure', 'focus', 'confidence', 'commitment', 'risk_judgement', 'resilience'] as const;
export const LIFESTYLE_ATTRS = ['nutrition', 'sleep_hygiene', 'logistics', 'languages', 'weather_sense'] as const;

export type PhysicalAttr = (typeof PHYSICAL_ATTRS)[number];
export type TechniqueAttr = (typeof TECHNIQUE_ATTRS)[number];
export type MentalAttr = (typeof MENTAL_ATTRS)[number];
export type LifestyleAttr = (typeof LIFESTYLE_ATTRS)[number];
export type AttrId = PhysicalAttr | TechniqueAttr | MentalAttr | LifestyleAttr;

export const ALL_ATTRS: readonly AttrId[] = [...PHYSICAL_ATTRS, ...TECHNIQUE_ATTRS, ...MENTAL_ATTRS, ...LIFESTYLE_ATTRS];

export type AttrGroup = 'physical' | 'technique' | 'mental' | 'lifestyle';

export interface AttributeState {
  value: number;
  ceiling: number;
  /** Gain banked on the slow (tendon) clock, released over time (12 §2). */
  pending: number;
  /** Sim day of the last meaningful stimulus, for detraining (12 §4). */
  last_stim_day: number;
}

export type Attributes = Record<AttrId, AttributeState>;

// ---------------------------------------------------------------- traits and backgrounds

export type TraitCategory = 'body' | 'aptitude' | 'mental' | 'social' | 'lifestyle' | 'history' | 'health' | 'quirk';
export type TraitKind = 'creation' | 'hidden' | 'acquired' | 'evolving';

export interface TraitEffect {
  attr_add?: Partial<Record<AttrId, number>>;
  ceiling_add?: Partial<Record<AttrId, number>>;
  attr_mult?: Partial<Record<AttrId, number>>;
  adapt_rate_mult?: Partial<Record<AttrId, number>>;
  hold_mult?: Partial<Record<HoldType, number>>;
  move_mult?: Partial<Record<MoveClass, number>>;
  condition_mult?: Partial<Record<'cold' | 'heat' | 'humid' | 'altitude', number>>;
  resource_mult?: Partial<Record<string, number>>;
  fear_add?: number;
  injury_risk_mult?: number;
  recovery_mult?: number;
  cost_mult?: number;
  rep_mult?: number;
  /** Flags from the 03 §1.9 registry, written `name=value` or bare `name`. */
  flags?: string[];
}

/** What an evolution counts (schemas §4.4, 03 §1.7). */
export const EVOLVE_COUNTERS = ['practice_falls', 'unhurt_falls', 'stakes_sends', 'clean_mantles'] as const;
export type EvolveCounter = (typeof EVOLVE_COUNTERS)[number];

/** One evolution: every count reached and `min_weeks` since the first of the first need, then `trait` (or removal). */
export interface Evolution {
  trait: string | null;
  needs: { counter: EvolveCounter; n: number }[];
  min_weeks: number;
}

export interface Trait {
  id: string;
  name: string;
  category: TraitCategory;
  kind: TraitKind;
  cost: number;
  phase: Phase;
  tags: Tag[];
  effect: TraitEffect;
  excludes: string[];
  requires_age?: [number, number];
  /** Evolving traits and the acquired stages they lead to (03 §1.7); the first evolution met applies. */
  evolves_to?: Evolution[];
  flavour: string;
}

export interface Background {
  id: string;
  name: string;
  phase: Phase;
  /** Meta unlock required to pick this background (16 §4.1). */
  unlock?: string;
  point_bonus: number;
  age_range: [number, number];
  attr_add: Partial<Record<AttrId, number>>;
  attr_points: number;
  money_start: number;
  start_crag: string;
  gear_start: string[];
  forced_traits: string[];
  locked_traits: string[];
  tags: Tag[];
  hook: string;
}

// ---------------------------------------------------------------- wall, holds, routes

export interface WallSegment {
  y0: number;
  y1: number;
  angle: number;
  feature: Feature;
}

export interface Hold {
  id: string;
  x: number;
  y: number;
  type: HoldType;
  size: SizeClass;
  orientation: number;
  quality: number;
  sharpness: number;
  friction: number;
  polish: number;
  hands_ok: boolean;
  feet_ok: boolean;
  hidden: boolean;
  rest_value: number;
}

export interface Protection {
  id: string;
  kind: ProtectionKind;
  y: number;
  x?: number;
  width_m?: number;
  /** Placement quality (gear) or bolt condition: 1.0 glue-in, 0.8 expansion, 0.5 rusted (05a §3). */
  quality: number;
  /** Hold ids a bolt or anchor can be clipped from: a hand on one of them (05a §3). */
  reach_from?: string[];
}

export interface BetaStep {
  limb: Limb;
  hold: string;
  class: MoveClass;
}

export interface Route {
  id: string;
  crag: string;
  area: string;
  name: string;
  discipline: Discipline;
  rock: RockType;
  di_target: number;
  di_graded: number;
  danger: 'safe' | 'spicy' | 'bold' | 'deadly';
  wall: WallSegment[];
  width_m: number;
  holds: Hold[];
  protection: Protection[];
  /** Starting anchors, one hold id per limb. */
  start: Record<Limb, string>;
  /** The hold the finishing mantle is made from. */
  finish_hold: string;
  length_m: number;
  style_tags: Tag[];
  signature: boolean;
  seed?: string;
  circuit?: CircuitColour;
  beta_line: BetaStep[];
  components?: { hardest_move: number; crux_density: number; pump_peak: number; rests: number; dynamic_share: number };
  fa_note?: string;
}

export interface CragStyleProfile {
  id: string;
  rock: RockType;
  hold_weights: Partial<Record<HoldType, number>>;
  angle_dist: { angle: number; weight: number }[];
  length_m: { min: number; mode: number; max: number };
  hold_density_max: number;
  polish: number;
  sharpness: number;
  seep_susceptibility: number;
  crux_position: 'low' | 'mid' | 'high' | 'spread';
  move_grammar: Partial<Record<MoveClass, number>>;
  feature_weights: Partial<Record<Feature, number>>;
  decoy_rate: number;
  hidden_rate: number;
  drift_max_m: number;
  pad_coverage: number;
  name_bank: string;
  /** Hardest DI this style can be built to (06 §2.1); above it a sector uses its other profiles. Unset = no cap. */
  di_max?: number;
  /** Easiest DI this style is built to (06 §2.1, P1b): below it a sector uses its other profiles. Unset = no floor. */
  di_min?: number;
  /** Fixed protection a route of this style gets (06 §2.6): bolts every `spacing_m` on sport. Unset = a boulder. */
  protection?: { kind: ProtectionKind; spacing_m?: number };
  /** A rest hold every this many metres up a route (06 §2.5). */
  rest_spacing_m?: number;
  tags: Tag[];
}

export interface ClimateMonth {
  t_mean: number;
  t_sd: number;
  rh_mean: number;
  precip_days: number;
  wind_mean: number;
  snow: boolean;
}

export interface Sector {
  id: string;
  name: string;
  character: string;
  circuits: { colour: CircuitColour; di_range: [number, number] }[];
  landing: 'flat' | 'uneven' | 'sloping';
  dry_lag_days: number;
  /** Days a seeping sector (a tufa cave) stays wet after heavy rain (10 §4, P1b). Unset = it does not seep. */
  seep_lag_days?: number;
  shade: boolean;
  style_profiles: string[];
  signature_routes: string[];
  /** The sector's catalogue: how many fixed procedural routes it has (06 §5, P2). Required at a live crag. */
  routes?: number;
}

export type CircuitColour = 'yellow' | 'orange' | 'blue' | 'red' | 'black' | 'white';

export interface Crag {
  id: string;
  name: string;
  country: string;
  region: string;
  altitude_m: number;
  rock: RockType;
  disciplines: Discipline[];
  di_range: [number, number];
  season: number[]; // 12 months, 0..3
  climate: ClimateMonth[]; // 12 months
  cost_tier: 1 | 2 | 3 | 4 | 5;
  sectors: Sector[];
  phase: Phase;
}

export interface NameBank {
  /** How names are put together: French articles and genders (default), or English word order. */
  lang?: 'fr' | 'en';
  masc: string[];
  fem: string[];
  adj_masc: string[];
  adj_fem: string[];
  place: string[];
  suffix: string[];
}

/** All authored content the simulation reads. Built and validated by src/data/bundle.ts. */
/** A city on the travel graph (09 §8.1). */
export interface Hub { id: string; name: string; country: string; lat: number; lon: number; airport: boolean }

/** A leg of travel (09 §8.2–§8.3), either way at the same cost; `from` and `to` are hub or crag ids. Its id is `${from}__${to}__${mode}`. */
export interface TravelEdge { from: string; to: string; mode: 'fly' | 'drive' | 'bus' | 'train' | 'boat' | 'trek'; cost: number; days: number }

export interface DataBundle {
  traits: ReadonlyMap<string, Trait>;
  backgrounds: ReadonlyMap<string, Background>;
  crags: ReadonlyMap<string, Crag>;
  profiles: ReadonlyMap<string, CragStyleProfile>;
  signatures: ReadonlyMap<string, Route>;
  /** Benchmark problems per crag for the grade estimate (02 §C.3). */
  benchmarks: ReadonlyMap<string, Route[]>;
  names: Readonly<Record<string, NameBank>>;
  /** The travel graph between the live crags (09 §8). */
  travel: { hubs: readonly Hub[]; edges: readonly TravelEdge[] };
  /** Content version; replays pin it (schemas §8 data_version). */
  version: string;
}

// ---------------------------------------------------------------- run, actions, saves

export type Difficulty = 'story' | 'standard' | 'hard';

export interface RunOptions {
  death_enabled: boolean;
  difficulty: Difficulty;
}

export type BlockKind = 'climb' | 'train' | 'rest' | 'active_recovery' | 'work';

/** How the climber runs a session (docs/24 §3): siege the hardest problems, or climb many below the limit. */
export type SessionTactic = 'project' | 'volume';

/** One block of a planned day (docs/24 §2). */
export type PlanBlock =
  | { kind: 'climb'; tactic: SessionTactic }
  | { kind: 'train'; activity: string }
  | { kind: 'rest' }
  | { kind: 'active_recovery' }
  | { kind: 'work' };

export interface PlanDay {
  main: PlanBlock;
  /** A second block, when energy allows (11 §1). */
  extra: PlanBlock | null;
}

/** The training week the climber follows when days are simulated (docs/24 §2). Day 0 of the run is its first day. */
export interface WeekPlan {
  days: PlanDay[];
  /** In place of a climbing block when every sector is wet. */
  wet_day: PlanBlock;
  /** Odd jobs in place of the plan while money is short. */
  auto_work: boolean;
  /** Rest in place of climbing on worn skin or high burnout. */
  auto_rest: boolean;
}

export type AttemptMode = 'onsight' | 'flash' | 'redpoint' | 'work';

export interface NewRunSpec {
  name: string;
  background: string;
  body: Body;
  traits: string[];
  attr_alloc: Partial<Record<AttrId, number>>;
  options: RunOptions;
}

export type Action =
  | { t: 'new_run'; seed: string; spec: NewRunSpec }
  | { t: 'block_start'; kind: BlockKind; target?: string }
  | { t: 'block_end' }
  | { t: 'end_day' }
  | { t: 'attempt'; route_seed: string; mode: AttemptMode }
  | { t: 'set_plan'; plan: WeekPlan }
  | { t: 'travel'; to: string }
  | { t: 'retire' };

export type TickStyle = 'onsight' | 'flash' | 'redpoint' | 'repeat';

export interface Tick {
  route: string;
  route_seed: string;
  name: string;
  day: number;
  style: TickStyle;
  attempts: number;
  di: number;
  circuit?: CircuitColour;
  area: string;
  /** A route's discipline (P1b); absent on a boulder. */
  discipline?: Discipline;
}

export type EndReason = 'retired' | 'forced_injury' | 'death' | 'burnout' | 'bankrupt';

export interface RunSummary {
  climber: string;
  background: string;
  days: number;
  age_end: number;
  end_reason: EndReason;
  hardest: number; // DI, boulder
  hardest_onsight: number;
  hardest_flash: number;
  /** Routes (P1b): hardest first ascent and hardest onsight, DI; 0 when none. */
  hardest_route: number;
  hardest_route_onsight: number;
  /** Countries climbed or travelled in (16 §6). */
  countries: number;
  ticks: number;
  circuits: Partial<Record<CircuitColour, number>>;
  score: number;
  unlocks: string[];
  seed: string;
  pyramid: Record<string, number>;
  /** First route sends by rounded DI (P1b). */
  pyramid_route: Record<string, number>;
  got_away?: { name: string; sessions: number; di: number; discipline?: Discipline };
}
