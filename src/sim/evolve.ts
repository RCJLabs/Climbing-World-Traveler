// Evolving traits (03 §1.7): what each evolution counts, and the evolutions themselves. Counts are kept for every
// climber and never reset, so a second stage (Falls OK to Falls Well) counts from the first. At the end of a day a
// trait whose evolution is met becomes its next stage, or goes; one stage a day. An evolution swaps the trait's live
// effects (multipliers, fear, flags); the attribute adds it gave at creation stay where training has taken them, and
// an acquired stage's attribute adds apply once, when it is gained (docs/26 §10).

import { ceilingFor } from './character';
import type { RunState } from './state';
import type { AttrId, DataBundle, EvolveCounter, Evolution, Trait } from './types';
import { ALL_ATTRS } from './types';

/** A fall-practice session counts this many practice falls, however many it takes (03 §1.7: max 3 per session). */
export const PRACTICE_FALLS_PER_SESSION = 3;

/** How a count reads in the journal and on the trait card. */
export const EVOLVE_TEXT: Record<EvolveCounter, string> = {
  practice_falls: 'practice falls',
  unhurt_falls: 'falls without injury',
  stakes_sends: 'redpoints that beat your best',
  clean_mantles: 'clean topouts',
};

/** Content errors in a trait's evolutions the schema cannot see (schemas §9 rule 17): a stage that does not exist. */
export function evolutionErrors(t: Pick<Trait, 'id' | 'evolves_to'>, traits: ReadonlyMap<string, Trait>): string[] {
  return (t.evolves_to ?? []).filter((e) => e.trait !== null && !traits.has(e.trait)).map((e) => `trait ${t.id}: evolves to unknown trait ${e.trait}`);
}

/** Counts an event toward evolving traits (schemas §4.4), starting its clock on the first. */
export function countEvolve(run: Pick<RunState, 'counters' | 'day'>, counter: EvolveCounter, by = 1): void {
  const c = (run.counters.evolve[counter] ??= { n: 0, first_day: run.day });
  c.n += by;
}

export interface EvolveProgress {
  needs: { counter: EvolveCounter; have: number; n: number }[];
  /** Whole weeks since the first count of the first need, and the weeks the evolution asks for. */
  weeks: number;
  min_weeks: number;
  met: boolean;
}

/** How far a climber is along one evolution. */
export function evolutionProgress(run: Pick<RunState, 'counters' | 'day'>, ev: Evolution): EvolveProgress {
  const needs = ev.needs.map((x) => ({ counter: x.counter, have: run.counters.evolve[x.counter]?.n ?? 0, n: x.n }));
  const first = run.counters.evolve[ev.needs[0]!.counter]?.first_day;
  const weeks = first === undefined ? 0 : Math.floor((run.day - first) / 7);
  return { needs, weeks, min_weeks: ev.min_weeks, met: needs.every((x) => x.have >= x.n) && weeks >= ev.min_weeks };
}

/** "30 practice falls over 6 weeks". */
const what = (ev: Evolution): string =>
  `${ev.needs.map((x) => `${x.n} ${EVOLVE_TEXT[x.counter]}`).join(' and ')}${ev.min_weeks ? ` over ${ev.min_weeks} weeks` : ''}`;

/**
 * End of day: each trait the climber carried this morning whose evolution is met becomes its next stage, or goes.
 * Ceilings follow the new trait list at once (they otherwise move on birthdays); journal lines say what changed.
 */
export function evolveTraits(run: RunState, bundle: DataBundle): void {
  const gained: string[] = [];
  let changed = false;
  for (const id of [...run.traits]) {
    const from = bundle.traits.get(id);
    const ev = from?.evolves_to?.find((e) => evolutionProgress(run, e).met);
    if (!from || !ev) continue;
    const to = ev.trait ? bundle.traits.get(ev.trait) : undefined;
    run.traits = to && !run.traits.includes(to.id) ? run.traits.map((t) => (t === id ? to.id : t)) : run.traits.filter((t) => t !== id);
    if (to) gained.push(to.id);
    changed = true;
    run.journal.push({ day: run.day, text: to ? `${from.name} becomes ${to.name}: ${what(ev)}.` : `${from.name} is gone: ${what(ev)}.`, tone: 'good' });
  }
  if (!changed) return;
  rebuildCeilings(run, bundle);
  for (const t of gained) applyAttrAdd(run, t, bundle);
}

/**
 * Every ceiling from the body, the traits and the age, less the permanent losses of grade-3 injuries (13 §2, P2 M2),
 * which a rebuild must never give back. Ceilings otherwise move on birthdays and when the trait list changes.
 */
export function rebuildCeilings(run: Pick<RunState, 'attrs' | 'body' | 'traits' | 'day' | 'ceiling_loss'>, bundle: DataBundle): void {
  // The age the birthday ceilings use (attempt.ts ageOf, not imported to keep this module free of the attempt loop).
  const age = Math.floor(run.body.age_start + run.day / 365);
  for (const id of ALL_ATTRS) run.attrs[id].ceiling = Math.max(5, ceilingFor(id, run.body, run.traits, bundle.traits, age) + (run.ceiling_loss[id] ?? 0));
}

/** A trait gained in play: its attribute adds apply once, when it is gained (docs/26 §10). */
function applyAttrAdd(run: RunState, id: string, bundle: DataBundle): void {
  for (const [k, v] of Object.entries(bundle.traits.get(id)!.effect.attr_add ?? {}) as [AttrId, number][]) {
    const a = run.attrs[k];
    a.value = Math.max(1, Math.min(a.ceiling, a.value + v));
  }
}

/** An acquired trait joins the climber (03 §1.8, P2 M2): ceilings follow at once, its attribute adds apply once. */
export function gainTrait(run: RunState, id: string, bundle: DataBundle): void {
  const t = bundle.traits.get(id);
  if (!t || run.traits.includes(id)) return;
  run.traits = [...run.traits, id];
  rebuildCeilings(run, bundle);
  applyAttrAdd(run, id, bundle);
  run.journal.push({ day: run.day + 1, text: `New trait: ${t.name}. ${t.flavour}`, tone: 'info' });
}
