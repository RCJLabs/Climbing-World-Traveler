// Injuries on screen (13 §3, 17 §2; P2 M2): what is hurt, what it bars and until when, how the rehab is going, and the
// losses that stay. The climber sheet lists them with health; the crag and the planner say what they bar today.
import { activeInjuries, barsClimbing, climbBlocker } from '../sim/injury';
import type { RunState } from '../sim/state';
import type { AttrId, DataBundle, InjuryInstance } from '../sim/types';
import { calendarDate, formatDate } from '../sim/weather';
import { Meter } from './components';
import { ATTR_LABEL } from './format';

const dateOf = (run: RunState, day: number): string => formatDate(calendarDate(run.start_month, run.start_dom, day));

/** "A2 pulley injury, grade 2" or an illness's name. */
export function injuryName(i: InjuryInstance, bundle: DataBundle): string {
  const d = bundle.injuries.get(i.def);
  if (!d) return i.def;
  return d.kind === 'illness' ? d.name : `${d.name}, grade ${i.grade}`;
}

/** Where an injury is today: barring climbing, climbed through, or easing back in (13 §3). */
export function injuryStatus(run: RunState, i: InjuryInstance, bundle: DataBundle): string {
  const d = bundle.injuries.get(i.def);
  const rehab = d?.rehab.length && run.day < i.day_heal ? ` · rehab ${i.rehab_progress}%` : '';
  if (i.day_full_load - run.day >= 9000) return 'for good';
  if (barsClimbing(i, run.day)) return `no climbing until ${dateOf(run, i.day_heal)}${rehab}`;
  if (run.day < i.day_heal) return `climbing carefully until ${dateOf(run, i.day_full_load)}`;
  return `easing back in until ${dateOf(run, i.day_full_load)}${i.neglected ? ' · rehab skipped' : ''}`;
}

/** One line for the crag and the planner when something bars climbing today (13 §3), or null. */
export function blockerLine(run: RunState, bundle: DataBundle): string | null {
  const b = climbBlocker(run);
  if (!b) return null;
  const rehab = bundle.injuries.get(b.def)?.rehab[0];
  return `${injuryName(b, bundle)}: no climbing until ${dateOf(run, b.day_heal)}.${rehab ? ' Climbing days on the plan become rehab until then.' : ' Climbing days on the plan become rest.'}`;
}

/** Health, today's injuries and what the run has cost the body for good (the climber sheet). */
export function Health({ run, bundle }: { run: RunState; bundle: DataBundle }) {
  const live = activeInjuries(run).sort((a, b) => b.grade - a.grade || a.day_onset - b.day_onset);
  const past = run.injuries.filter((i) => run.day >= i.day_full_load && bundle.injuries.get(i.def)?.kind === 'injury');
  const losses = Object.entries(run.ceiling_loss).filter(([, v]) => v);
  return (
    <div class="card">
      <span class="kicker">Health</span>
      <Meter label="Health" value={run.res.health} colour="var(--good)" />
      {live.length === 0 && <span class="small soft">Nothing hurts.</span>}
      {live.map((i, k) => (
        <div key={k} class="col">
          <span class={`small ${barsClimbing(i, run.day) ? 'warn' : ''}`}>{injuryName(i, bundle)}</span>
          <span class="tiny muted">{injuryStatus(run, i, bundle)}</span>
        </div>
      ))}
      {(past.length > 0 || losses.length > 0) && (
        <span class="tiny muted">
          {past.length > 0 ? `${past.length} ${past.length === 1 ? 'injury' : 'injuries'} behind you${past.some((i) => i.grade >= 2) ? `, ${past.filter((i) => i.grade >= 2).length} of grade 2 or worse` : ''}.` : ''}
          {losses.length > 0 ? ` For good: ${losses.map(([k, v]) => `${ATTR_LABEL[k as AttrId] ?? k} ceiling ${v}`).join(', ')}.` : ''}
        </span>
      )}
    </div>
  );
}
