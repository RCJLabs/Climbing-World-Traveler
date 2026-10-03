// Evolving traits (03 §1.7, docs/26 §10): what each evolution counts, the evolutions with their week clocks (one
// stage a day; a gained stage's attribute adds apply once), the bot's weekly fall practice while a trait evolves by
// it, and the content rules (schemas §9 rule 17).
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { TraitSchema } from '../src/data/schema';
import { atRoute, syntheticRun } from '../src/harness/sim';
import { climberStep, doMove, doWallAction, registerRoute, simulateAttempt, startAttempt } from '../src/sim/attempt';
import { BotDriver, PROJECT_POLICY } from '../src/sim/bot';
import { aggregateMods } from '../src/sim/character';
import { evolutionErrors, evolutionProgress, PRACTICE_FALLS_PER_SESSION } from '../src/sim/evolve';
import { referenceAthlete } from '../src/sim/grade';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { applyAction, createRun } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import type { Route } from '../src/sim/types';

const bundle = loadBundle();
const font = bundle.benchmarks.get('fontainebleau')!;
const kal = bundle.benchmarks.get('kalymnos')!;
for (const r of [...font, ...kal]) registerRoute(r);
const easy: Route = font.find((r) => r.di_graded < 12)!;
const seedOf = (r: Route) => r.seed ?? r.id;

/** A Dirtbag start carrying `traits` as well. */
const runWith = (traits: string[], seed = 'evolve') =>
  createRun(seed, { ...presetSpec('dirtbag', DEFAULT_OPTIONS), traits: ['dirtbag', ...traits] }, bundle);

/** Plays the attempt in progress to its end with the climber's own tactics. */
function finish(run: RunState): void {
  for (let i = 0; i < 200 && run.attempt; i++) {
    const s = climberStep(run, bundle)!;
    if (s.t === 'move') doMove(run, s.limb, s.hold, s.class, bundle);
    else doWallAction(run, s.kind, bundle);
  }
}

describe('what evolutions count (03 §1.7)', () => {
  it('a fall-practice session counts three practice falls and starts their clock', () => {
    const run = runWith([]);
    applyAction(run, { t: 'block_start', kind: 'train', target: 'fall_practice' }, bundle);
    expect(run.counters.evolve.practice_falls).toEqual({ n: PRACTICE_FALLS_PER_SESSION, first_day: 0 });
  });

  it('a clean topout counts a clean mantle', () => {
    const run = syntheticRun(referenceAthlete(easy.di_graded + 4), 'mantle', bundle);
    atRoute(run, easy);
    startAttempt(run, seedOf(easy), 'flash', bundle);
    finish(run);
    expect(run.last_attempt!.outcome).toBe('sent');
    expect(run.last_attempt!.log.at(-1)!.text).toBe('Topped out.');
    expect(run.counters.evolve.clean_mantles?.n).toBe(1);
  });

  it('every fall onto the pads and every fall the rope holds counts one fall without injury', () => {
    const hard = font.find((r) => r.di_graded > 18)!;
    const boulder = syntheticRun(referenceAthlete(hard.di_graded - 4), 'pads', bundle);
    atRoute(boulder, hard);
    let falls = 0;
    for (let i = 0; i < 6; i++) {
      simulateAttempt(boulder, seedOf(hard), 'onsight', bundle);
      if (['fell', 'pumped'].includes(boulder.last_attempt!.outcome)) falls++;
    }
    expect(falls).toBeGreaterThan(0);
    expect(boulder.counters.evolve.unhurt_falls?.n).toBe(falls);
    const pitch = kal.find((r) => r.di_graded > 18)!;
    const roped = syntheticRun(referenceAthlete(pitch.di_graded - 3), 'rope', bundle);
    atRoute(roped, pitch);
    simulateAttempt(roped, seedOf(pitch), 'onsight', bundle);
    expect(roped.counters.rope_falls_logged).toBeGreaterThan(0);
    expect(roped.counters.evolve.unhurt_falls?.n).toBe(roped.counters.rope_falls_logged);
  });

  it('a send on a redpoint at the personal best counts a send with stakes', () => {
    const climber = referenceAthlete(easy.di_graded + 4);
    const first = syntheticRun(climber, 'stakes', bundle);
    atRoute(first, easy);
    startAttempt(first, seedOf(easy), 'flash', bundle);
    doWallAction(first, 'jump_off', bundle);
    const run = syntheticRun(climber, 'stakes', bundle);
    atRoute(run, easy);
    run.pb = easy.di_graded;
    run.projects = first.projects;
    startAttempt(run, seedOf(easy), 'redpoint', bundle);
    expect(run.attempt!.stakes).toBe(true);
    finish(run);
    expect(run.last_attempt!.tick?.style).toBe('redpoint');
    expect(run.counters.evolve.stakes_sends?.n).toBe(1);
  });
});

describe('evolutions (03 §1.7)', () => {
  it('Afraid of Falling becomes Falls OK after 30 practice falls over six weeks, then Falls Well', () => {
    const run = runWith(['afraid_of_falling']);
    expect(aggregateMods(run.traits, bundle.traits).fear_add).toBe(10);
    run.counters.evolve.practice_falls = { n: 30, first_day: run.day };
    applyAction(run, { t: 'end_day' }, bundle);
    expect(run.traits).toContain('afraid_of_falling');
    run.counters.evolve.practice_falls.first_day = run.day - 42;
    applyAction(run, { t: 'end_day' }, bundle);
    expect(run.traits).not.toContain('afraid_of_falling');
    expect(run.traits).toContain('falls_ok');
    expect(run.journal.at(-1)!.text).toBe('Afraid of Falling becomes Falls OK: 30 practice falls over 6 weeks.');
    expect(aggregateMods(run.traits, bundle.traits).fear_add).toBe(0);
    // Falls Well wants 60 practice falls, 10 falls without injury and 12 weeks; its attribute adds land once.
    run.counters.evolve.practice_falls = { n: 60, first_day: run.day - 84 };
    run.counters.evolve.unhurt_falls = { n: 9, first_day: run.day - 10 };
    applyAction(run, { t: 'end_day' }, bundle);
    expect(run.traits).toContain('falls_ok');
    run.counters.evolve.unhurt_falls.n = 10;
    const composure = run.attrs.composure;
    const want = Math.min(composure.ceiling, composure.value + 4);
    applyAction(run, { t: 'end_day' }, bundle);
    expect(run.traits).toContain('falls_well');
    expect(run.attrs.composure.value).toBeCloseTo(want, 1);
    expect(aggregateMods(run.traits, bundle.traits).fear_add).toBe(-5);
  });

  it('moves one stage a day, even when the next is already met', () => {
    const run = runWith(['afraid_of_falling']);
    run.counters.evolve.practice_falls = { n: 60, first_day: run.day - 84 };
    run.counters.evolve.unhurt_falls = { n: 10, first_day: run.day - 84 };
    applyAction(run, { t: 'end_day' }, bundle);
    expect(run.traits).toContain('falls_ok');
    applyAction(run, { t: 'end_day' }, bundle);
    expect(run.traits).toContain('falls_well');
  });

  it('Choker goes after five redpoints at the best over eight weeks; Topout Terror after 40 clean topouts over four', () => {
    const choker = runWith(['choker']);
    choker.counters.evolve.stakes_sends = { n: 5, first_day: choker.day - 55 };
    applyAction(choker, { t: 'end_day' }, bundle);
    expect(choker.traits).toContain('choker');
    choker.counters.evolve.stakes_sends.first_day -= 7;
    applyAction(choker, { t: 'end_day' }, bundle);
    expect(choker.traits).not.toContain('choker');
    expect(choker.journal.at(-1)!.text).toBe('Choker is gone: 5 redpoints at your best over 8 weeks.');
    const terror = runWith(['topout_terror']);
    terror.counters.evolve.clean_mantles = { n: 40, first_day: terror.day - 28 };
    applyAction(terror, { t: 'end_day' }, bundle);
    expect(terror.traits).not.toContain('topout_terror');
  });

  it('reports progress for the trait card', () => {
    const run = runWith(['afraid_of_falling']);
    run.counters.evolve.practice_falls = { n: 12, first_day: run.day - 22 };
    const p = evolutionProgress(run, bundle.traits.get('afraid_of_falling')!.evolves_to![0]!);
    expect(p).toMatchObject({ needs: [{ counter: 'practice_falls', have: 12, n: 30 }], weeks: 3, min_weeks: 6, met: false });
  });
});

describe('the bot and the content rules', () => {
  it('a bot practises falling once a week while one of its traits evolves by practice falls, and never otherwise', () => {
    const practised = (traits: string[]) => {
      const run = runWith(traits, 'bot-falls');
      const bot = new BotDriver(run, bundle, PROJECT_POLICY);
      for (let d = 0; d < 28; d++) bot.day();
      const days = bot.log.flatMap((a, i) => (a.t === 'block_start' && a.kind === 'train' && a.target === 'fall_practice' ? [i] : []));
      return { n: run.counters.evolve.practice_falls?.n ?? 0, sessions: days.length };
    };
    const afraid = practised(['afraid_of_falling']);
    expect(afraid.sessions).toBeGreaterThanOrEqual(2);
    expect(afraid.sessions).toBeLessThanOrEqual(4);
    expect(afraid.n).toBe(afraid.sessions * PRACTICE_FALLS_PER_SESSION);
    expect(practised([]).sessions).toBe(0);
  });

  it('wants evolutions on evolving traits only, with known counters and stages that exist', () => {
    const afraid = bundle.traits.get('afraid_of_falling')!;
    expect(TraitSchema.safeParse(afraid).success).toBe(true);
    expect(TraitSchema.safeParse({ ...afraid, evolves_to: undefined }).success).toBe(false);
    expect(TraitSchema.safeParse({ ...afraid, kind: 'creation' }).success).toBe(false);
    const bad = { ...afraid.evolves_to![0]!, needs: [{ counter: 'moon_phases', n: 3 }] };
    expect(TraitSchema.safeParse({ ...afraid, evolves_to: [bad] }).success).toBe(false);
    expect(evolutionErrors(afraid, bundle.traits)).toEqual([]);
    expect(evolutionErrors({ id: 'x', evolves_to: [{ trait: 'nowhere', needs: [{ counter: 'practice_falls', n: 1 }], min_weeks: 0 }] }, bundle.traits)).toHaveLength(1);
  });
});
