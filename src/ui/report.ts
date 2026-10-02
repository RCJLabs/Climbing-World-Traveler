// What a simulated stretch did (docs/24 §4): the difference between the state before and after a session or a run of
// days, for the report screen. Pure: it reads two states and the data bundle.

import { estimateDI } from '../sim/run';
import type { AttemptResult, JournalEntry, RunState } from '../sim/state';
import { ALL_ATTRS, type AttrId, type DataBundle, type Tick } from '../sim/types';
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
  pb: [number, number];
  estimate: [number, number];
  /** Attributes that moved, the largest change first. */
  attrs: AttrChange[];
  money: number;
  journal: JournalEntry[];
  ended: boolean;
}

/** Attribute changes smaller than this are noise in a report. */
const MOVED = 0.05;

export function buildReport(kind: Report['kind'], title: string, before: RunState, after: RunState, bundle: DataBundle, tries: AttemptResult[] = []): Report {
  const c0 = before.counters;
  const c1 = after.counters;
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
    pb: [before.pb, after.pb],
    estimate: [estimateDI(before, bundle), estimateDI(after, bundle)],
    attrs, money: after.res.money - before.res.money,
    journal: after.journal.slice(before.journal.length),
    ended: !!after.ended,
  };
}
