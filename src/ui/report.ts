// What a simulated stretch did (docs/24 §4): the difference between the state before and after a session or a run of
// days, for the report screen. Pure: it reads two states and the data bundle.

import { athleteOf } from '../sim/attempt';
import { mainDiscipline, sessionDiscipline, type Climb } from '../sim/discipline';
import { estimateAt } from '../sim/estimate';
import type { AttemptResult, JournalEntry, RunState } from '../sim/state';
import { ALL_ATTRS, type AttrId, type DataBundle, type InjuryInstance, type Tick } from '../sim/types';
import { LATER_ATTRS } from './format';

export interface AttrChange { id: AttrId; before: number; after: number }

export interface Report {
  kind: 'days' | 'session';
  title: string;
  days: number;
  climb_days: number;
  train_blocks: number;
  work_blocks: number;
  rest_days: number;
  attempts: number;
  sends: number;
  /** New ticks (repeats left out), hardest first. */
  ticks: Tick[];
  /** Every attempt of a session report, in order; empty for a run of days. */
  tries: AttemptResult[];
  /** The report's discipline: its session's, or for a run of days the one the crag it ended at is known by (27 M1). */
  discipline: Climb;
  /** Where its grades are shown from: the crag it ended at, whose grading system they use (08). */
  crag: string;
  /** Hardest send before and after, in the report's discipline. */
  pb: [number, number];
  /** The estimate before and after, both at the crag where the stretch ended. */
  estimate: [number, number];
  /** Attributes that moved, the largest change first. */
  attrs: AttrChange[];
  money: number;
  journal: JournalEntry[];
  /** Injuries and illness that began in the stretch (13, P2 M2). */
  injuries: InjuryInstance[];
  ended: boolean;
}

/** Attribute changes smaller than this are noise in a report. */
const MOVED = 0.05;

export function buildReport(kind: Report['kind'], title: string, before: RunState, after: RunState, bundle: DataBundle, tries: AttemptResult[] = []): Report {
  const c0 = before.counters;
  const c1 = after.counters;
  const discipline = sessionDiscipline(before, bundle) ?? mainDiscipline(bundle.crags.get(after.crag)!, bundle);
  const sport = discipline === 'sport';
  const attrs: AttrChange[] = ALL_ATTRS
    .filter((id) => !LATER_ATTRS.includes(id))
    .map((id) => ({ id, before: before.attrs[id].value, after: after.attrs[id].value }))
    .filter((a) => Math.abs(a.after - a.before) >= MOVED)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  return {
    kind, title, days: after.day - before.day,
    climb_days: c1.climb_days - c0.climb_days, train_blocks: c1.train_blocks - c0.train_blocks,
    work_blocks: c1.work_blocks - c0.work_blocks, rest_days: c1.rest_days - c0.rest_days,
    attempts: c1.attempts - c0.attempts, sends: c1.sends - c0.sends,
    ticks: after.ticks.slice(before.ticks.length).filter((t) => t.style !== 'repeat').sort((a, b) => b.di - a.di),
    tries,
    discipline,
    crag: after.crag,
    pb: sport ? [before.pb_route, after.pb_route] : [before.pb, after.pb],
    estimate: [estimateAt(athleteOf(before, bundle), after.crag, discipline, bundle), estimateAt(athleteOf(after, bundle), after.crag, discipline, bundle)],
    attrs, money: after.res.money - before.res.money,
    journal: after.journal.slice(before.journal.length),
    injuries: after.injuries.slice(before.injuries.length),
    ended: !!after.ended,
  };
}
