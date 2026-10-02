// The materialised run state (schemas §8 `WorldState`, typed with the first reducer version as schemas'
// open question asks). Plain JSON: it is snapshotted to IndexedDB and rebuilt by replaying the action log.

import type { CommitOutcome } from './resolve';
import type { SwingSetup } from './swing';
import type { ClimbState } from './wall';
import type { DayWeather, RainMark } from './weather';
import type {
  AttemptMode, AttrId, Attributes, BlockKind, Body, Limb, MoveClass, RunOptions, RunSummary, Tick,
} from './types';

/** Reducer version (18 §5). Bump when replaying an old log through the new reducer would change outcomes. */
export const REDUCER_VERSION = 2;

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
}

export interface FearEvent {
  label: string;
  delta: number;
}

/** A dyno or deadpoint waiting for its Swing and Catch (docs/23 §2.3): everything it will be judged with. */
export interface PendingCommit {
  limb: Limb;
  hold: string;
  cls: MoveClass;
  swing: SwingSetup;
}

export type MoveOutcome = 'clean' | 'sketchy' | 'slip_recovered' | 'fall' | 'pumped' | 'sent';

/** What just happened on the wall, for the HUD and the move log. */
export interface MoveReport {
  kind: 'move' | 'rest' | 'chalk' | 'jump';
  limb?: Limb;
  hold?: string;
  cls?: MoveClass;
  outcome?: MoveOutcome;
  commit?: CommitOutcome;
  /** A slip the player's input forced, whatever the margin: a mistimed dyno, a reach too slow for the grip, a barn door (docs/23 §3). */
  forced?: 'cut' | 'grip' | 'barn';
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
  pending: PendingCommit | null;
  fear_log: FearEvent[];
  log: MoveReport[];
}

export interface AttemptResult {
  route_seed: string;
  route_id: string;
  name: string;
  di: number;
  outcome: 'sent' | 'fell' | 'jumped' | 'pumped';
  progress: number;
  moves: number;
  day: number;
  kappa: number;
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
}

export interface JournalEntry {
  day: number;
  text: string;
  tone?: 'good' | 'bad' | 'info';
}

export interface DaySummary {
  day: number;
  money_delta: number;
  gains: Partial<Record<AttrId, number>>;
  notes: string[];
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
  journal: JournalEntry[];
  today: DaySummary;
  yesterday: DaySummary | null;
  counters: Counters;
  /** Training load accumulated today (12 §5), pushed into `counters.loads` at settlement. */
  load_today: number;
  ended: RunSummary | null;
  actions: number;
}

export type { CommitOutcome };
