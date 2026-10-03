// The materialised run state (schemas §8 `WorldState`, typed with the first reducer version as schemas'
// open question asks). Plain JSON: it is snapshotted to IndexedDB and rebuilt by replaying the action log.

import type { CommitOutcome } from './resolve';
import type { ClimbState } from './wall';
import type { DayWeather, RainMark } from './weather';
import type {
  AttemptMode, AttrId, Attributes, BlockKind, Body, Discipline, EvolveCounter, Limb, MoveClass, RunOptions, RunSummary, Tick, WeekPlan,
} from './types';

/** Reducer version (18 §5). Bump when replaying an old log through the new reducer would change outcomes. */
export const REDUCER_VERSION = 8;

export interface Resources {
  energy: number;
  skin: number;
  stoke: number;
  burnout: number;
  money: number;
  health: number;
}

export type SlotKind = 'warmup' | 'mid' | 'push' | 'project' | 'signature' | 'known';

export interface RouteSlot {
  seed: string;
  kind: SlotKind;
  di_target: number;
}

/** Everything the run remembers about one problem the player has tried (06 §5 "known routes"). */
export interface ProjectState {
  seed: string;
  id: string;
  name: string;
  area: string;
  di: number;
  signature: boolean;
  attempts: number;
  /** 05b §12.2 attempts-equivalent: 1.0 per attempt, 1.5 per work attempt. */
  attempt_eq: number;
  sessions: number;
  first_day: number;
  last_day: number;
  sent: boolean;
  sent_day?: number;
  /** Highest fraction of the beta line completed, 0..1. */
  best: number;
  /** "last fall" fear source (05b §9.1), decays by 1 per attempt. */
  fall_fear: number;
  /** Hidden holds found, by touch or by looking around on a rest. */
  revealed: string[];
  /** A route's discipline (P1b); absent on a boulder. */
  discipline?: Discipline;
}

export interface FearEvent {
  label: string;
  delta: number;
}

export type MoveOutcome = 'clean' | 'sketchy' | 'slip_recovered' | 'fall' | 'pumped' | 'sent' | 'aided';

/** What just happened on the wall, for the HUD and the move log. On a rope: clips, falls, hanging, lowering off. */
export interface MoveReport {
  kind: 'move' | 'rest' | 'chalk' | 'jump' | 'clip' | 'fall' | 'take' | 'lower';
  limb?: Limb;
  hold?: string;
  cls?: MoveClass;
  outcome?: MoveOutcome;
  commit?: CommitOutcome;
  margin?: number;
  T?: number;
  p_complete?: number;
  pump_delta: number;
  text: string;
}

export interface AttemptState {
  route_seed: string;
  route_id: string;
  mode: AttemptMode;
  attempt_index: number;
  move_index: number;
  climb: ClimbState;
  pump: number;
  power: number;
  aerobic_reserve: number;
  /** Fear from events; the live meter adds the height source each turn. */
  fear_base: number;
  focus_meter: number;
  chalk: number;
  time_s: number;
  /** Shake index at the current stance; resets when a limb moves (05b §6). */
  shake_k: number;
  /** Position-quality penalty carried from a sketchy move (05b §4.5). */
  pq_penalty: number;
  fam: number;
  beta_ptr: number;
  moves: number;
  hand_moves: number;
  fear_log: FearEvent[];
  log: MoveReport[];
  /** On a rope (P1b): the clips, the falls and the highest point. Absent on a boulder. */
  rope?: RopeState;
  /** Form on the day (resolve.ts PUMP_FORM): every pump gain this attempt is multiplied by it. Absent means 1. */
  pump_form?: number;
  /** A redpoint go at or above the personal best (03 open question 8): stakes traits apply. Absent means none. */
  stakes?: boolean;
  /** A move went sketchy this attempt (Perfectionist reads it on a send). */
  sketchy?: boolean;
}

/** The rope during an attempt (05a §3, 05b §11, 07 §2). */
export interface RopeState {
  /** Index of the next bolt to clip: every bolt below it is clipped or was passed. */
  next: number;
  /** Height of the last bolt clipped (m); null before the first. */
  last_clip_y: number | null;
  /** A bolt was passed without a clip since the last clip (05b §11). */
  skipped: boolean;
  /** The rope has held the climber this attempt: a fall or a take. No send after that (07 §2.2). */
  weighted: boolean;
  falls: number;
  /** Falls on the move the climber is on now. */
  falls_here: number;
  /** Worst fall consequence κ this attempt. */
  kappa: number;
  /** Highest point reached, as a fraction of the line (falls can come back down from it). */
  high: number;
}

export interface AttemptResult {
  route_seed: string;
  route_id: string;
  name: string;
  di: number;
  /** `worked`: reached the anchor after the rope had held the climber (07 §2.2), no tick. On a rope, `jumped` is lowering off without a fall. */
  outcome: 'sent' | 'fell' | 'jumped' | 'pumped' | 'worked';
  progress: number;
  moves: number;
  day: number;
  kappa: number;
  /** Falls the rope held in this attempt (rope attempts only; the log keeps only its last entries). */
  falls?: number;
  tick?: Tick;
  text: string;
  /** The attempt's move log, for the result screen's move-by-move list. */
  log: MoveReport[];
}

export interface SessionState {
  sector: string;
  /** Player estimate E at block start, rounded to 0.5 DI (06 §5). */
  E: number;
  slots: RouteSlot[];
  attempts: number;
  sends: number;
  di_sum: number;
  hard_moves: number;
  hand_moves: number;
  pump_total: number;
  time_s: number;
  progress_made: boolean;
  /** Physical stimulus accumulated from moves, converted at block end (12 §3). */
  stim: Partial<Record<AttrId, number>>;
  /** Technique XP banked from moves (02 §B.2), applied at block end. */
  xp: Partial<Record<AttrId, number>>;
  load: number;
  energy_spent: number;
  /** Attempts on each problem this session, and whether one of them sent (by route seed), for the session tactics (docs/24 §3). */
  tried: Record<string, { n: number; sent: boolean }>;
}

export interface BlockState {
  kind: BlockKind;
  target?: string;
  session?: SessionState;
}

export interface Counters {
  neg_money_days: number;
  failure_streak: number;
  monotony_weeks: number;
  week_sectors: string[];
  prev_week_sectors: string[];
  /** Daily load for the last 35 days (12 §5). */
  loads: number[];
  forced_break_until: number;
  burnout_hits: { season: number; hits: number };
  climb_days: number;
  rest_days: number;
  attempts: number;
  sends: number;
  work_blocks: number;
  train_blocks: number;
  /** Sends per DI step (rounded), for the pyramid (16 §7). */
  pyramid: Record<string, number>;
  new_sectors_today: number;
  /** Falls held by a rope, career-long (05b §9.1 "lead" fear; schemas §4.6 counters). */
  rope_falls_logged: number;
  /** First route sends by rounded DI (P1b); `pyramid` keeps the boulders. */
  pyramid_route: Record<string, number>;
  /** What evolving traits count (03 §1.7, schemas §8), with the day each was first counted; never reset. */
  evolve: Partial<Record<EvolveCounter, { n: number; first_day: number }>>;
}

export interface JournalEntry {
  day: number;
  text: string;
  tone?: 'good' | 'bad' | 'info';
}

/** A weekly point on the climber's progress (docs/24 §4), written at each week boundary. */
export interface WeekPoint {
  day: number;
  /** Grade estimate from the last climbing session, if there was one yet: boulders or routes, by `crag`. */
  E: number | null;
  /** Where the climber was (P1b): the estimate is a route grade at a sport crag. Absent on older points. */
  crag?: string;
  pb: number;
  /** Best route ticked (P1b). */
  pb_route?: number;
  ticks: number;
  /** Every attribute's value, to one decimal. */
  attrs: Partial<Record<AttrId, number>>;
}

export interface DaySummary {
  day: number;
  money_delta: number;
  gains: Partial<Record<AttrId, number>>;
  notes: string[];
  /** A day on the move (P1b): the crag the climber is travelling to. */
  travel?: string;
}

export interface RunState {
  v: number;
  data_version: string;
  seed: string;
  name: string;
  background: string;
  body: Body;
  traits: string[];
  options: RunOptions;
  attrs: Attributes;
  rock_knowledge: Record<string, number>;
  /** Count of moves by `${hold_type}:${class}`, for technique novelty (02 §B.2). */
  move_counts: Record<string, number>;
  crag: string;
  start_month: number;
  start_dom: number;
  day: number;
  weather: DayWeather;
  last_rain: RainMark | null;
  res: Resources;
  blocks_today: BlockKind[];
  block: BlockState | null;
  attempt: AttemptState | null;
  last_attempt: AttemptResult | null;
  projects: Record<string, ProjectState>;
  ticks: Tick[];
  /** Best boulder DI ticked so far (personal best). */
  pb: number;
  /** Best route DI ticked so far (P1b); 0 before the first. */
  pb_route: number;
  /** Crags the climber has been to, in the order of first arrival (P1b travel). */
  visited: string[];
  journal: JournalEntry[];
  today: DaySummary;
  yesterday: DaySummary | null;
  counters: Counters;
  /** Training load accumulated today (12 §5), pushed into `counters.loads` at settlement. */
  load_today: number;
  ended: RunSummary | null;
  actions: number;
  /** The training week simulated days follow (docs/24 §2). */
  plan: WeekPlan;
  /** Unrounded grade estimate at the start of the latest climbing session. */
  est: number | null;
  history: WeekPoint[];
}

export type { CommitOutcome };
