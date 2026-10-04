// Traits (03): the P1b set reaches the engine. Every effect names a flag the engine reads or a known inert one, and a
// resource it has; the four traits whose downside or whole value needs a later system stay out; the resource
// multipliers scale regeneration and gain (03 §2); a redpoint go at the personal best carries stakes, which Clutch and
// Choker bend; Visualiser's look, Overthinker's slow moves, Weightlifter's mass, Dry Hands' cold splits, the stoke
// Onsight Purist pays for going back to a sport route and Perfectionist for an ugly send.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { atRoute, syntheticRun } from '../src/harness/sim';
import { aggregateMods, CURRENT_MILESTONE, isLive, traitEffectErrors, type Athlete, type Mods } from '../src/sim/character';
import { athleteOf, climberStep, conditionsOf, doMove, doWallAction, familiarity, registerRoute, routeEntry, startAttempt } from '../src/sim/attempt';
import { prepareMove } from '../src/sim/engine';
import { referenceAthlete } from '../src/sim/grade';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { evaluate, powerPool, reserveStart } from '../src/sim/resolve';
import { applyAction, createRun, dailyCost, energyCap } from '../src/sim/run';
import { sendingCentre } from '../src/sim/weather';
import type { RunState } from '../src/sim/state';
import type { Route } from '../src/sim/types';

const bundle = loadBundle();
const font = bundle.benchmarks.get('fontainebleau')!;
/** An easy problem for the climber below: every move well inside the auto-success margin, so the dice never differ. */
const easy: Route = font.find((r) => r.di_graded < 12)!;
registerRoute(easy);
const seed = easy.seed ?? easy.id;
/** The same climber with other trait mods. */
const withMods = (ath: Athlete, mods: Mods): Athlete => ({ ...ath, mods });

/** A run of the Reference Climber four DI above the easy problem, with `traits`, at the problem and ready to try it. */
function runWith(traits: string[]): RunState {
  const run = syntheticRun(referenceAthlete(easy.di_graded + 4), 'traits', bundle, traits);
  atRoute(run, easy);
  return run;
}

/** Plays the attempt in progress to its end with the climber's own tactics. */
function finish(run: RunState): void {
  for (let i = 0; i < 200 && run.attempt; i++) {
    const s = climberStep(run, bundle)!;
    if (s.t === 'move') doMove(run, s.limb, s.hold, s.class, bundle);
    else doWallAction(run, s.kind, bundle);
  }
}

describe('the P1b traits in the data', () => {
  it('name only flags the engine reads or knows to be inert, and only resources it regenerates; an invented one is caught', () => {
    for (const t of bundle.traits.values()) if (isLive(t)) expect(traitEffectErrors(t), t.id).toEqual([]);
    expect(traitEffectErrors({ id: 'made_up', effect: { flags: ['moon_phase_mult=1.2'], resource_mult: { mana: 1.1 } } })).toHaveLength(2);
    // Energy refills every morning and health waits for the injuries: fine on a P2 trait, an error on a live one.
    expect(traitEffectErrors({ id: 'early', phase: 'P1b', effect: { resource_mult: { energy: 1.1 } } })).toEqual(['trait early: resource energy waits for P2']);
    expect(traitEffectErrors({ id: 'later', phase: 'P2', effect: { resource_mult: { health: 1.2 } } })).toEqual([]);
  });

  it('are live at creation, without those whose downside or whole value needs a later system', () => {
    const p1b = [...bundle.traits.values()].filter((t) => t.phase === 'P1b' && t.kind === 'creation');
    expect(p1b).toHaveLength(43);
    for (const id of ['dry_hands', 'clutch', 'zen', 'rope_gun', 'vertigo', 'weightlifter', 'stubborn']) expect(bundle.traits.has(id), id).toBe(true);
    for (const id of ['bendy_shoulders', 'pain_tolerant', 'kneebar_finder', 'downclimber']) expect(bundle.traits.has(id), id).toBe(false);
    // Nothing they carry is read before P2 (docs/26 §11): kept in the data, not offered at creation.
    for (const id of ['lucky', 'unlucky', 'cool_head', 'risk_blind']) expect(isLive(bundle.traits.get(id)!), id).toBe(false);
  });
});

describe('resource multipliers (03 §2: regeneration or gain, never the ceiling)', () => {
  it('scale the aerobic reserve and the power pool an attempt starts with', () => {
    const plain = referenceAthlete(18);
    const bellows = withMods(plain, aggregateMods(['bellows'], bundle.traits));
    expect(reserveStart(bellows) / reserveStart(plain)).toBeCloseTo(1.1, 9);
    const strong = withMods(plain, { ...aggregateMods([], bundle.traits), resource_mult: { power: 1.2 } });
    expect(powerPool(strong) / powerPool(plain)).toBeCloseTo(1.2, 9);
  });

  it('scale the chalk a chalk-up brings back: Sweaty Hands less, Dry Hands more', () => {
    const chalkAfter = (traits: string[]) => {
      const run = runWith(traits);
      startAttempt(run, seed, 'flash', bundle);
      run.attempt!.chalk = 0;
      doWallAction(run, 'chalk', bundle);
      return run.attempt!.chalk;
    };
    const plain = chalkAfter([]);
    expect(chalkAfter(['sweaty_hands']) / plain).toBeCloseTo(0.7, 9);
    expect(chalkAfter(['dry_hands']) / plain).toBeCloseTo(1.3, 9);
  });

  it('scale overnight skin and burnout accrual', () => {
    const day = (traits: string[]) => {
      const run = createRun('res', { ...presetSpec('dirtbag', DEFAULT_OPTIONS), traits: ['dirtbag', ...traits] }, bundle);
      run.res.skin = 10;
      run.counters.monotony_weeks = 6;
      const before = { skin: run.res.skin, burnout: run.res.burnout };
      applyAction(run, { t: 'end_day' }, bundle);
      return { skin: run.res.skin - before.skin, burnout: run.res.burnout - before.burnout };
    };
    const plain = day([]);
    expect(day(['skin_care_routine']).skin / plain.skin).toBeCloseTo(1.1, 6);
    expect(plain.burnout).toBeGreaterThan(0);
    expect(day(['stubborn']).burnout / plain.burnout).toBeCloseTo(1.1, 6);
  });
});

describe('stakes (03 open question 8: a redpoint go at or above the personal best)', () => {
  it('mark a redpoint at the personal best, not a first go or a redpoint below it', () => {
    const first = runWith([]);
    first.pb = easy.di_graded;
    startAttempt(first, seed, 'flash', bundle);
    expect(first.attempt!.stakes).toBeUndefined();
    finish(first);
    const again = runWith([]);
    again.pb = easy.di_graded;
    again.projects = first.projects;
    startAttempt(again, seed, 'redpoint', bundle);
    expect(again.attempt!.mode).toBe('redpoint');
    expect(again.attempt!.stakes).toBe(true);
    const below = runWith([]);
    below.pb = easy.di_graded + 3;
    below.projects = first.projects;
    startAttempt(below, seed, 'redpoint', bundle);
    expect(below.attempt!.stakes).toBeUndefined();
  });

  it('bend the effective stat: Clutch up 5%, Choker down 6%, nothing without stakes', () => {
    const run = runWith([]);
    startAttempt(run, seed, 'flash', bundle);
    const { geom } = routeEntry(seed, bundle);
    const step = easy.beta_line.find((s) => s.limb === 'LH' || s.limb === 'RH')!;
    const base = athleteOf(run, bundle);
    const spec = prepareMove(geom, base, run.attempt!.climb, step.limb, step.hold)?.spec;
    if (!spec) throw new Error('first hand move not legal from the start');
    const st = { pump: 0, power: 50, focus_meter: 50, overgrip: 0, under: 0, energy: 100, skin: 100, fam: 0 };
    const cond = conditionsOf(run, run.attempt!, bundle);
    const mTrait = (ids: string[], stakes: boolean) => evaluate(withMods(base, aggregateMods(ids, bundle.traits)), spec, { ...st, stakes }, cond).M_trait;
    expect(mTrait(['clutch'], true) - mTrait([], true)).toBeCloseTo(0.05, 9);
    expect(mTrait(['choker'], true) - mTrait([], true)).toBeCloseTo(-0.06, 9);
    expect(mTrait(['clutch'], false)).toBeCloseTo(mTrait([], false), 9);
  });
});

describe('the other P1b flags', () => {
  it('Visualiser: a look before the attempt adds 0.10 familiarity', () => {
    const plain = runWith([]), vis = runWith(['visualiser']);
    startAttempt(plain, seed, 'flash', bundle);
    startAttempt(vis, seed, 'flash', bundle);
    expect(vis.attempt!.fam - plain.attempt!.fam).toBeCloseTo(Math.min(0.1, 1 - plain.attempt!.fam), 9);
  });

  it('Stubborn: takes in half the beta on a signature problem, and none is offered elsewhere', () => {
    const sig = [...bundle.signatures.values()][0]!;
    const plain = referenceAthlete(18);
    const stubborn = withMods(plain, aggregateMods(['stubborn'], bundle.traits));
    expect(familiarity(sig, undefined, plain)).toBeCloseTo(0.15, 9);
    expect(familiarity(sig, undefined, stubborn)).toBeCloseTo(0.075, 9);
    expect(familiarity(easy, undefined, stubborn)).toBe(0);
  });

  it('Overthinker: each move takes a fifth longer', () => {
    const time = (traits: string[]) => {
      const run = runWith(traits);
      startAttempt(run, seed, 'flash', bundle);
      const s = climberStep(run, bundle)!;
      if (s.t !== 'move') throw new Error('the first step is not a move');
      doMove(run, s.limb, s.hold, s.class, bundle);
      return run.attempt?.time_s ?? 0;
    };
    expect(time(['overthinker']) / time([])).toBeCloseTo(1.2, 9);
  });

  it('Weightlifter: three kilos at creation', () => {
    const spec = presetSpec('dirtbag', DEFAULT_OPTIONS);
    const plain = createRun('w', spec, bundle);
    // Slow Hands' refund pays for it; it changes no mass.
    const heavy = createRun('w', { ...spec, traits: [...spec.traits, 'weightlifter', 'slow_hands'] }, bundle);
    expect(heavy.body.mass_kg - plain.body.mass_kg).toBeCloseTo(3, 9);
  });

  it('Dry Hands: skin wears a third faster on a cold day, not on a mild one', () => {
    const wear = (traits: string[], t: number) => {
      const run = runWith(traits);
      run.weather = { ...run.weather, t_max: t, t_min: t };
      startAttempt(run, seed, 'flash', bundle);
      finish(run);
      return 100 - run.res.skin;
    };
    expect(wear(['dry_hands'], 1) / wear([], 1)).toBeCloseTo(1.3, 6);
    expect(wear(['dry_hands'], 12)).toBeCloseTo(wear([], 12), 9);
  });

  it('Onsight Purist pays two stoke for each go at a sport route from the fourth, and nothing at a boulder', () => {
    const pitch = bundle.benchmarks.get('kalymnos')!.find((r) => r.di_graded < 14)!;
    registerRoute(pitch);
    const stokeAfterStart = (traits: string[], before: number, route: Route = pitch) => {
      const at = (r: Route) => { const run = syntheticRun(referenceAthlete(r.di_graded + 4), 'traits', bundle, traits); atRoute(run, r); return run; };
      const first = at(route);
      startAttempt(first, route.seed ?? route.id, 'flash', bundle);
      doWallAction(first, 'jump_off', bundle);
      const run = at(route);
      run.projects = first.projects;
      run.projects[route.id]!.attempts = before;
      run.res.stoke = 50;
      startAttempt(run, route.seed ?? route.id, 'redpoint', bundle);
      return run.res.stoke;
    };
    expect(stokeAfterStart(['onsight_purist'], 2)).toBe(50);
    expect(stokeAfterStart(['onsight_purist'], 3)).toBe(48);
    expect(stokeAfterStart(['onsight_purist'], 7)).toBe(48);
    expect(stokeAfterStart([], 7)).toBe(50);
    expect(stokeAfterStart(['onsight_purist'], 7, easy)).toBe(50);
  });

  it('Perfectionist pays three stoke on a send with a sketchy move, none on a clean one', () => {
    const send = (traits: string[], sketchy: boolean) => {
      // A first go called off at once, so the next one is a redpoint.
      const first = runWith(traits);
      startAttempt(first, seed, 'flash', bundle);
      doWallAction(first, 'jump_off', bundle);
      const run = runWith(traits);
      run.projects = first.projects;
      run.res.stoke = 50;
      startAttempt(run, seed, 'redpoint', bundle);
      if (sketchy) run.attempt!.sketchy = true;
      finish(run);
      expect(run.last_attempt!.tick?.style).toBe('redpoint');
      return run.res.stoke;
    };
    expect(send([], true) - send(['perfectionist'], true)).toBeCloseTo(3, 9);
    expect(send([], false) - send(['perfectionist'], false)).toBeCloseTo(0, 9);
  });
});

describe('the P2 traits of M1 (27 §2: the ten whose systems are live)', () => {
  const M1 = ['furnace', 'cold_blooded', 'gaston_goblin', 'bounce_back', 'brittle', 'hibernator', 'frugal', 'shiny_things', 'fuelled', 'junk_food'];
  const build = presetSpec('slab_wizard', DEFAULT_OPTIONS);
  /** The same build with `traits` added, the creation rules skipped as the re-costing's paired careers do. */
  const runOf = (traits: string[]) => createRun('m1-traits', { ...build, traits: [...build.traits, ...traits] }, bundle, { unchecked: true });
  const base = runOf([]);

  it('come live with P2 M1; a P2 row of a later milestone, or with none, waits', () => {
    expect(CURRENT_MILESTONE).toBe(1);
    for (const id of M1) {
      const t = bundle.traits.get(id)!;
      expect(t, id).toMatchObject({ phase: 'P2', milestone: 1, kind: 'creation' });
      expect(isLive(t), id).toBe(true);
    }
    expect([isLive({ phase: 'P1b' }), isLive({ phase: 'P2' }), isLive({ phase: 'P2', milestone: 2 }), isLive({ phase: 'P3', milestone: 1 })]).toEqual([true, false, false, false]);
    expect(build.traits.some((t) => M1.includes(t))).toBe(false);
  });

  it('Furnace and Cold Blooded move the sending window 4 °C and bend cold and hot days 6% and 4% or 6%', () => {
    const run = runWith([]);
    startAttempt(run, seed, 'flash', bundle);
    const { geom } = routeEntry(seed, bundle);
    const step = easy.beta_line.find((s) => s.limb === 'LH' || s.limb === 'RH')!;
    const plain = athleteOf(run, bundle);
    const spec = prepareMove(geom, plain, run.attempt!.climb, step.limb, step.hold)!.spec;
    const st = { pump: 0, power: 50, focus_meter: 50, overgrip: 0, under: 0, energy: 100, skin: 100, fam: 0 };
    const cond = conditionsOf(run, run.attempt!, bundle);
    const mTrait = (ids: string[], day: 'cold' | 'heat' | 'mild') =>
      evaluate(withMods(plain, aggregateMods(ids, bundle.traits)), spec, st, { ...cond, cold: day === 'cold', heat: day === 'heat' }).M_trait;
    expect(mTrait(['furnace'], 'cold') - mTrait([], 'cold')).toBeCloseTo(0.06, 9);
    expect(mTrait(['furnace'], 'heat') - mTrait([], 'heat')).toBeCloseTo(-0.04, 9);
    expect(mTrait(['cold_blooded'], 'heat') - mTrait([], 'heat')).toBeCloseTo(0.06, 9);
    expect(mTrait(['cold_blooded'], 'cold') - mTrait([], 'cold')).toBeCloseTo(-0.06, 9);
    expect(mTrait(['furnace'], 'mild')).toBeCloseTo(mTrait([], 'mild'), 9);
    const centre = (ids: string[]) => sendingCentre(withMods(plain, aggregateMods(ids, bundle.traits)));
    expect([centre(['furnace']) - centre([]), centre(['cold_blooded']) - centre([])]).toEqual([-4, 4]);
  });

  it('Gaston Goblin: gastons and sidepulls bend 8% and 4%, and shoulders start two points looser', () => {
    const mods = aggregateMods(['gaston_goblin'], bundle.traits);
    expect(mods.hold_mult).toEqual({ gaston: 1.08, sidepull: 1.04 });
    expect(runOf(['gaston_goblin']).attrs.shoulder_mobility.value - base.attrs.shoulder_mobility.value).toBe(2);
  });

  it('Bounce Back and Brittle start resilience ten points either way; Hibernator, Fuelled and Junk Food move the energy cap', () => {
    expect(runOf(['bounce_back']).attrs.resilience.value - base.attrs.resilience.value).toBe(10);
    expect(runOf(['brittle']).attrs.resilience.value - base.attrs.resilience.value).toBe(-10);
    expect(runOf(['hibernator']).attrs.sleep_hygiene.value - base.attrs.sleep_hygiene.value).toBe(10);
    expect(energyCap(runOf(['hibernator']))).toBeGreaterThan(energyCap(base));
    expect(runOf(['fuelled']).attrs.nutrition.value - base.attrs.nutrition.value).toBe(10);
    expect(energyCap(runOf(['junk_food']))).toBeLessThan(energyCap(base));
  });

  it('Frugal lives on 10% less a day, Shiny Things on 15% more', () => {
    const cost = dailyCost(base, bundle);
    expect(dailyCost(runOf(['frugal']), bundle)).toBe(Math.round(cost * 0.9));
    expect(dailyCost(runOf(['shiny_things']), bundle)).toBe(Math.round(cost * 1.15));
  });
});
