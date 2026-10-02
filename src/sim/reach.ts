// Reach (docs/23 §2.1, §3.1): an ordinary move is dragged to its hold while the other hand holds on. The drag is
// logged as two numbers on the `move` action and judged here. A move with no perf plays as Auto, which is exactly
// the move as it resolved before Reach existed, so grades, the harness's Auto runs and old saves do not move.

import type { BalancePerf } from './balance';

export interface ReachPerf {
  kind: 'reach';
  /** How long the limb was off its hold (ms), summed over every try at this move. */
  time_ms: number;
  /** Where it landed: distance from the hold's centre as a share of the placement ring (0 = dead centre, 1 = its edge). */
  place: number;
}

/** What a player did on a move that is not a dyno: a Reach drag, or a Balance lean and drag (docs/23 §3.2). */
export type MovePerf = ReachPerf | BalancePerf;

/** Grip budget at a move whose margin equals T, fresh (ms). (tune) */
export const GRIP_MS = 3200;
/** Auto lands a third of the way out of the ring: placement Δ 0. */
export const AUTO_PLACE = 1 / 3;
/** Auto takes this share of the budget: no overrun. */
export const AUTO_TIME_SHARE = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How long the holding hand can hang on while the other one travels (ms): harder moves and pump shorten it. (tune) */
export function gripBudget(margin: number, T: number, pump: number): number {
  return GRIP_MS * clamp(0.5 + margin / (2 * T), 0.4, 1.5) * (1 - clamp(pump, 0, 100) / 200);
}

/** Margin term for where the hand landed: +0.03 dead centre, 0 at Auto's third, −0.06 at the ring's edge. (tune) */
export const placeDelta = (place: number): number => 0.03 - 0.09 * clamp(place, 0, 1);

export interface ReachJudged {
  /** Added to the margin. */
  delta: number;
  /** Multiplies the move's pump cost: running over the budget pumps you out. */
  pumpMult: number;
  /** Twice the budget: the holding hand opens (the slip branch, 05b §4.5). */
  pop: boolean;
  /** Overrun as a share of the budget. */
  overrun: number;
}

/** Judge a drag against the grip budget. Feet move while both hands hold, so only a hand move runs a clock. */
export function judgeReach(perf: ReachPerf, budget_ms: number, hand: boolean): ReachJudged {
  const overrun = hand && budget_ms > 0 ? Math.max(0, perf.time_ms - budget_ms) / budget_ms : 0;
  return { delta: placeDelta(perf.place), pumpMult: 1 + overrun, pop: overrun > 1, overrun };
}

/** A perf the reducer accepts: the right kind and finite, non-negative numbers. */
export function validPerf(p: unknown): p is MovePerf {
  if (!p || typeof p !== 'object') return false;
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const r = p as Partial<ReachPerf> & Partial<BalancePerf>;
  if (r.kind === 'reach') return ok(r.time_ms) && ok(r.place);
  if (r.kind === 'balance') return ok(r.out_ms) && ok(r.place);
  return false;
}

/** A word for the move log about where the hand landed. */
export function placeWord(place: number): string {
  return place <= 0.15 ? 'dead centre' : place <= 0.5 ? 'well placed' : place < 0.85 ? 'off centre' : 'on the edge';
}
