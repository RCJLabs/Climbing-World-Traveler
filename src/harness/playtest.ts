// Playtest stats (docs/19 §3): replay a run's action log and pull out every move a player played by hand, with what
// the engine judged it against, so the harness skill models can be fitted to real thumbs instead of guesses. Pure:
// it runs on the phone (the playtest screen) and in Node alike.

import { balanceSetup, reachBudget } from '../sim/attempt';
import type { CommitOutcome } from '../sim/resolve';
import { applyAction, createRun } from '../sim/run';
import type { RunState } from '../sim/state';
import { fly, launchVelocity } from '../sim/swing';
import { isDynamic } from '../sim/tables';
import type { Action, DataBundle } from '../sim/types';
import { limbKind } from '../sim/wall';
import { BALANCE_SKILL, REACH_SKILL, SWING_SKILL } from './sim';

type Outcome = string | undefined;

export type PlaytestRecord =
  | { type: 'reach'; auto: boolean; day: number; route: string; hand: boolean; budget_ms: number | null; time_ms?: number; place?: number; overrun?: number; outcome: Outcome }
  | { type: 'balance'; auto: boolean; day: number; route: string; drift: number; d0: number; paused: boolean; out_ms?: number; place?: number; outcome: Outcome }
  | {
    type: 'dyno'; auto: boolean; day: number; route: string; p_need: number; power?: number; angle_err?: number;
    catch_ms?: number | null; dead_ms?: number | null; result: CommitOutcome | undefined; outcome: Outcome;
  };

/** The move report the last action left: the attempt's log, or the finished attempt's. */
function lastReport(run: RunState) {
  const log = run.attempt?.log ?? run.last_attempt?.log ?? [];
  return [...log].reverse().find((r) => r.kind === 'move' && r.outcome !== undefined);
}

/** Every move of the run that was a Reach, Balance or dyno move, played by hand or on Auto. */
export function playtestRecords(actions: readonly Action[], bundle: DataBundle): PlaytestRecord[] {
  const first = actions[0];
  if (!first || first.t !== 'new_run') return [];
  const run = createRun(first.seed, first.spec, bundle);
  const out: PlaytestRecord[] = [];
  for (const a of actions.slice(1)) {
    const at = run.attempt;
    let rec: PlaytestRecord | null = null;
    if (a.t === 'move' && at && !at.pending && !isDynamic(a.class)) {
      const bal = balanceSetup(run, a.limb, a.hold, a.class, bundle);
      if (bal) {
        rec = { type: 'balance', auto: !a.perf, day: run.day, route: at.route_id, drift: bal.drift, d0: bal.stance.d, paused: !!run.options.pause_drift, outcome: undefined };
        if (a.perf?.kind === 'balance') { rec.out_ms = a.perf.out_ms; rec.place = a.perf.place; }
      } else {
        const hand = limbKind(a.limb) === 'hand';
        const budget = reachBudget(run, a.limb, a.hold, a.class, bundle);
        rec = { type: 'reach', auto: !a.perf, day: run.day, route: at.route_id, hand, budget_ms: hand ? budget : null, outcome: undefined };
        if (a.perf?.kind === 'reach') {
          rec.time_ms = a.perf.time_ms;
          rec.place = a.perf.place;
          if (hand && budget) rec.overrun = Math.max(0, a.perf.time_ms - budget) / budget;
        }
      }
    } else if (a.t === 'commit' && at?.pending) {
      const st = at.pending.swing;
      rec = { type: 'dyno', auto: a.swing === null, day: run.day, route: at.route_id, p_need: st.p_need, result: undefined, outcome: undefined };
      if (a.swing) {
        const f = fly(st, launchVelocity(st, a.swing.power, a.swing.angle_deg));
        rec.power = a.swing.power;
        rec.angle_err = a.swing.angle_deg - st.angle_good;
        rec.catch_ms = a.swing.catch_ms;
        rec.dead_ms = f.slowest === null ? null : Math.round(f.slowest * 1000);
      }
    }
    applyAction(run, a, bundle);
    if (rec) {
      const r = lastReport(run);
      rec.outcome = r?.outcome;
      if (rec.type === 'dyno') rec.result = r?.commit;
      out.push(rec);
    }
  }
  return out;
}

export interface Quartiles { n: number; p25: number; p50: number; p75: number }

export function quartiles(xs: readonly number[]): Quartiles | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const q = (f: number) => s[Math.min(s.length - 1, Math.round(f * (s.length - 1)))]!;
  return { n: s.length, p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}

type Model = 'novice' | 'average' | 'expert';
const MODELS: Model[] = ['novice', 'average', 'expert'];
const nearest = (value: number | undefined, of: (m: Model) => number): Model | null =>
  value === undefined ? null : MODELS.reduce((best, m) => (Math.abs(of(m) - value) < Math.abs(of(best) - value) ? m : best), MODELS[0]!);
/** Median of a half-normal with this sd: where the harness models put a typical landing. */
const halfNormalMedian = (sd: number) => 0.674 * sd;

export interface PlaytestSummary {
  reach: { manual: number; auto: number; drag_ms: Quartiles | null; place: Quartiles | null; centre: number; overran: number; let_go: number; nearest_drag: Model | null; nearest_place: Model | null };
  balance: { manual: number; auto: number; paused: number; out_ms: Quartiles | null; out_share: number; barn: number; nearest_place: Model | null };
  dyno: {
    manual: number; auto: number; pull_vs_need: Quartiles | null; catch_offset_ms: Quartiles | null;
    results: Partial<Record<CommitOutcome, number>>; nearest_pull: Model | null; nearest_catch: Model | null;
  };
}

/** What a player's hands did, against the novice, average and expert harness models (19 §3). */
export function summarise(records: readonly PlaytestRecord[]): PlaytestSummary {
  const reach = records.filter((r): r is Extract<PlaytestRecord, { type: 'reach' }> => r.type === 'reach');
  const bal = records.filter((r): r is Extract<PlaytestRecord, { type: 'balance' }> => r.type === 'balance');
  const dyn = records.filter((r): r is Extract<PlaytestRecord, { type: 'dyno' }> => r.type === 'dyno');
  const rm = reach.filter((r) => !r.auto);
  const handTimes = rm.filter((r) => r.hand && r.time_ms !== undefined);
  const drag = quartiles(handTimes.map((r) => r.time_ms!));
  const place = quartiles(rm.map((r) => r.place ?? 0));
  const bm = bal.filter((r) => !r.auto);
  const outs = bm.map((r) => r.out_ms ?? 0);
  const dm = dyn.filter((r) => !r.auto);
  const pulls = quartiles(dm.map((r) => (r.power ?? 0) / r.p_need));
  const catches = quartiles(dm.filter((r) => r.catch_ms != null && r.dead_ms != null).map((r) => r.catch_ms! - r.dead_ms!));
  const results: Partial<Record<CommitOutcome, number>> = {};
  for (const r of dyn) if (r.result) results[r.result] = (results[r.result] ?? 0) + 1;
  // A pull's typical miss is about 0.67 of the model's relative sd either side of what the dyno needs.
  const pullMiss = dm.length ? quartiles(dm.map((r) => Math.abs((r.power ?? 0) / r.p_need - 1)))!.p50 : undefined;
  return {
    reach: {
      manual: rm.length, auto: reach.length - rm.length, drag_ms: drag, place,
      centre: rm.length ? rm.filter((r) => (r.place ?? 1) <= 0.15).length / rm.length : 0,
      overran: handTimes.length ? handTimes.filter((r) => (r.overrun ?? 0) > 0).length / handTimes.length : 0,
      let_go: rm.filter((r) => (r.overrun ?? 0) > 1).length,
      nearest_drag: nearest(drag?.p50, (m) => REACH_SKILL[m].mu),
      nearest_place: nearest(place?.p50, (m) => halfNormalMedian(REACH_SKILL[m].place)),
    },
    balance: {
      manual: bm.length, auto: bal.length - bm.length, paused: bm.filter((r) => r.paused).length,
      out_ms: quartiles(outs.filter((x) => x > 0)), out_share: bm.length ? outs.filter((x) => x > 0).length / bm.length : 0,
      barn: bm.filter((r) => (r.out_ms ?? 0) >= 1500).length,
      nearest_place: nearest(quartiles(bm.map((r) => r.place ?? 0))?.p50, (m) => halfNormalMedian(REACH_SKILL[m].place)),
    },
    dyno: {
      manual: dm.length, auto: dyn.length - dm.length, pull_vs_need: pulls, catch_offset_ms: catches, results,
      nearest_pull: nearest(pullMiss, (m) => halfNormalMedian(SWING_SKILL[m].power)),
      nearest_catch: nearest(catches?.p50, (m) => SWING_SKILL[m].mu),
    },
  };
}

/** The models the summary is set against, for the screen and the export. */
export const PLAYTEST_MODELS = { reach: REACH_SKILL, balance: BALANCE_SKILL, swing: SWING_SKILL };
