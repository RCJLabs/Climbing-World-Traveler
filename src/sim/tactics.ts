// The climber's own decisions off the wall (docs/24 §2–§3): which problem to try next in a session, which sector to
// climb at, and how the week plan becomes a day's actions. Simulated days in the game and the headless harness use
// the same functions, so a harness career is a career the game would play.

import { routeEntry } from './attempt';
import { applyAction, canStartBlock, dailyCost, sectorList } from './run';
import type { RouteSlot, RunState } from './state';
import type { Action, AttemptMode, BlockKind, DataBundle, PlanBlock, SessionTactic } from './types';

interface Tactic {
  /** Slot kinds in the order they are tried, after the warm-up. */
  order: RouteSlot['kind'][];
  /** Slots further than this above the session estimate are left alone. */
  above: number;
  /** Attempts on one problem in one session. */
  tries: (slot: RouteSlot) => number;
}

/** Session tactics (docs/24 §3). **(tune)** */
export const TACTICS: Record<SessionTactic, Tactic> = {
  project: { order: ['known', 'project', 'push', 'signature', 'mid', 'warmup'], above: 4.5, tries: (s) => (s.kind === 'warmup' ? 1 : 5) },
  volume: { order: ['warmup', 'mid', 'signature', 'push', 'known', 'project'], above: 1, tries: () => 2 },
};

/** Too tired for another attempt: the session ends (docs/24 §3). **(tune)** */
export const tired = (run: Pick<RunState, 'res'>): boolean => run.res.energy < 22 || run.res.skin < 12;

/** The session's problems in the order a tactic tries them, the easiest first as a warm-up. */
export function sessionQueue(run: RunState, tactic: SessionTactic): RouteSlot[] {
  const s = run.block?.session;
  if (!s) return [];
  const want = TACTICS[tactic].order;
  const order = [...s.slots].sort((a, b) => want.indexOf(a.kind) - want.indexOf(b.kind));
  const warm = [...s.slots].sort((a, b) => a.di_target - b.di_target)[0];
  return warm ? [warm, ...order.filter((x) => x !== warm)] : order;
}

/** The mode a first look at a problem gets: a flash where there is beta to watch (signatures), else an onsight. */
export function firstMode(run: RunState, seed: string, bundle: DataBundle): AttemptMode {
  const { route } = routeEntry(seed, bundle);
  return route.signature && !run.projects[route.id] ? 'flash' : 'onsight';
}

/** The next attempt a tactic makes in the current session, or null when the session is done. */
export function nextSessionAttempt(run: RunState, bundle: DataBundle, tactic: SessionTactic): { route_seed: string; mode: AttemptMode } | null {
  const s = run.block?.session;
  if (!s || tired(run)) return null;
  const t = TACTICS[tactic];
  for (const slot of sessionQueue(run, tactic)) {
    if (slot.di_target > s.E + t.above) continue;
    const done = s.tried[slot.seed];
    if (done && (done.sent || done.n >= t.tries(slot))) continue;
    const { route } = routeEntry(slot.seed, bundle);
    if (run.projects[route.id]?.sent && slot.kind !== 'warmup') continue;
    return { route_seed: slot.seed, mode: firstMode(run, slot.seed, bundle) };
  }
  return null;
}

/** The sector a climbing day goes to: one not yet visited this week if there is one, rotating by day. Null if all are wet. */
export function pickSector(run: RunState, bundle: DataBundle): string | null {
  const open = sectorList(run, bundle).filter((s) => s.open);
  if (!open.length) return null;
  const fresh = open.filter((s) => !run.counters.week_sectors.includes(s.id));
  const pool = fresh.length ? fresh : open;
  return pool[run.day % pool.length]!.id;
}

// ---------------------------------------------------------------- the week plan (docs/24 §2)

/** Money is short below this many days of living costs, and gone below the second: odd jobs take over. **(tune)** */
export const SHORT_DAYS = 30;
export const BROKE_DAYS = 10;
/** Worn skin or high burnout: the climber rests instead of climbing when the plan allows it. **(tune)** */
export const REST_SKIN = 35;
export const REST_BURNOUT = 60;

const blockKind = (b: PlanBlock): BlockKind => b.kind;
const blockTarget = (run: RunState, b: PlanBlock, bundle: DataBundle): string | undefined =>
  b.kind === 'climb' ? pickSector(run, bundle) ?? undefined : b.kind === 'train' ? b.activity : undefined;

/** The plan's block for today's next slot, or null for none (docs/24 §2). */
export function scheduledBlock(run: RunState): PlanBlock | null {
  const day = run.plan.days[run.day % 7]!;
  return run.blocks_today.length === 0 ? day.main : run.blocks_today.length === 1 ? day.extra : null;
}

/**
 * The block the climber actually does next: the plan's, after its own rules (docs/24 §2). Short of money, the second
 * block (and any first block that is not climbing) becomes an odd job; broke, every block does. Worn skin or high
 * burnout turns climbing into rest; wet rock turns it into the plan's wet-day block; a forced break turns climbing and
 * training into rest. A block that cannot start is rest if it was the first, and nothing if it was the second.
 */
export function plannedBlock(run: RunState, bundle: DataBundle): PlanBlock | null {
  const first = run.blocks_today.length === 0;
  if (run.blocks_today.length >= 2) return null;
  let b = scheduledBlock(run);
  const plan = run.plan;
  if (plan.auto_work) {
    const cost = dailyCost(run, bundle);
    const broke = run.res.money < BROKE_DAYS * cost;
    const short = run.res.money < SHORT_DAYS * cost;
    if (broke || (short && (!first || b?.kind !== 'climb'))) b = { kind: 'work' };
  }
  if (!b) return null;
  const onBreak = run.day < run.counters.forced_break_until;
  if (b.kind === 'climb') {
    if (onBreak || (plan.auto_rest && (run.res.skin < REST_SKIN || run.res.burnout > REST_BURNOUT))) b = { kind: 'rest' };
    else if (!pickSector(run, bundle)) b = plan.wet_day;
  }
  if (b.kind === 'train' && onBreak) b = { kind: 'rest' };
  if (canStartBlock(run, blockKind(b), blockTarget(run, b, bundle), bundle).ok) return b;
  return first && canStartBlock(run, 'rest', undefined, bundle).ok ? { kind: 'rest' } : null;
}

/** The tactic of a climbing session in progress: the plan's for today, or volume. */
export function sessionTactic(run: RunState): SessionTactic {
  const day = run.plan.days[run.day % 7]!;
  return day.main.kind === 'climb' ? day.main.tactic : 'volume';
}

/** The next action of a simulated day (docs/24 §2): the plan's blocks, a session played by its tactic, then end_day. */
export function nextPlannedAction(run: RunState, bundle: DataBundle): Action {
  if (run.block?.kind === 'climb') {
    const a = nextSessionAttempt(run, bundle, sessionTactic(run));
    return a ? { t: 'attempt', ...a } : { t: 'block_end' };
  }
  if (run.block) return { t: 'block_end' };
  const b = plannedBlock(run, bundle);
  if (!b) return { t: 'end_day' };
  const target = blockTarget(run, b, bundle);
  return target === undefined ? { t: 'block_start', kind: blockKind(b) } : { t: 'block_start', kind: blockKind(b), target };
}

/**
 * Simulate whole days by the plan on a draft, through the reducer (docs/24 §2). Returns every action taken, for the
 * save. Stops early when the run ends, or after a day on which `stop` says so.
 */
export function simulateDays(run: RunState, bundle: DataBundle, days: number, stop?: (run: RunState) => boolean): Action[] {
  const log: Action[] = [];
  for (let d = 0; d < days && !run.ended; d++) {
    // A day is a handful of blocks and a few dozen attempts at most; the guard only stops a bug looping forever.
    for (let guard = 0; guard < 500 && !run.ended; guard++) {
      const a = nextPlannedAction(run, bundle);
      applyAction(run, a, bundle);
      log.push(a);
      if (a.t === 'end_day') break;
    }
    if (stop?.(run)) break;
  }
  return log;
}
