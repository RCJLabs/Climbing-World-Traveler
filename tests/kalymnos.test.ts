// Kalymnos in the game (P1b, docs/26 §5): travel between crags, limestone and its seeping caves, the sport styles and
// the route estimate, sport sessions, what a run at a sport crag records, and the Grande Grotta's signature routes
// (docs/26 §8) with the real-name rule that keeps their notes free of people.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import cragsJson from '../data/crags.json';
import realNamesJson from '../data/real_names.json';
import { contentOf, realNameHits } from '../src/data/realnames';
import { CragSchema, ProfileSchema, RealNamesSchema, TravelSchema } from '../src/data/schema';
import { atRoute, syntheticRun } from '../src/harness/sim';
import { sampleBuild } from '../src/harness/sampler';
import { routeEntry, ROUTE_ENERGY, simulateAttempt } from '../src/sim/attempt';
import { frenchGrade } from '../src/sim/grades';
import { estimateBoulderDI } from '../src/sim/estimate';
import { gradeRoute, referenceAthlete } from '../src/sim/grade';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { skinForce } from '../src/sim/resolve';
import { stream } from '../src/sim/rng';
import { profileFor, sectorFloor } from '../src/sim/routes';
import { applyAction, createRun, dailyCost, estimateDI, InvalidAction, replay, sectorList, sessionSlots, travelBlock } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import { nextSessionAttempt, pickSector, ROUTE_TACTICS, simulateDays, WORK_FIRST_ABOVE } from '../src/sim/tactics';
import { destinations, travelGraphErrors, tripTo } from '../src/sim/travel';
import type { Action, TravelEdge } from '../src/sim/types';
import { calendarDate, freshWeather, sectorStatus, type DayWeather } from '../src/sim/weather';

const bundle = loadBundle();
const font = bundle.crags.get('fontainebleau')!;
const kal = bundle.crags.get('kalymnos')!;
const sectorById = (id: string) => kal.sectors.find((s) => s.id === id)!;

/** A Font build that has travelled to Kalymnos, on its first day with a dry sector there. */
function atKalymnos(seed: string): RunState {
  const run = createRun(seed, presetSpec('dirtbag'), bundle);
  applyAction(run, { t: 'travel', to: 'kalymnos' }, bundle);
  for (let i = 0; i < 30 && !sectorList(run, bundle).some((s) => s.open); i++) applyAction(run, { t: 'end_day' }, bundle);
  return run;
}

/** Start a climbing session where the climber would choose to climb. */
function climb(run: RunState): void {
  applyAction(run, { t: 'block_start', kind: 'climb', target: pickSector(run, bundle)! }, bundle);
}

describe('travel (09 §8)', () => {
  it('takes the cheapest path through the hubs, the same both ways', () => {
    const there = tripTo('fontainebleau', 'kalymnos', bundle)!;
    expect(there.path).toEqual(['fontainebleau', 'hub_paris', 'hub_athens', 'kalymnos']);
    expect(there.legs.map((l) => l.mode)).toEqual(['train', 'fly', 'fly']);
    expect(there).toMatchObject({ cost: 280, days: 2 });
    const back = tripTo('kalymnos', 'fontainebleau', bundle)!;
    expect(back).toMatchObject({ cost: 280, days: 2 });
    expect(back.path).toEqual([...there.path].reverse());
    expect(tripTo('fontainebleau', 'fontainebleau', bundle)).toBeNull();
    expect(tripTo('fontainebleau', 'nowhere', bundle)).toBeNull();
  });

  it('breaks a tie on cost by days, and a trip takes at least a day', () => {
    const edges: TravelEdge[] = [
      { from: 'a', to: 'b', mode: 'fly', cost: 100, days: 1 },
      { from: 'a', to: 'h', mode: 'bus', cost: 40, days: 1 },
      { from: 'h', to: 'b', mode: 'bus', cost: 40, days: 2 },
      { from: 'b', to: 'a', mode: 'train', cost: 80, days: 1 },
      { from: 'a', to: 'c', mode: 'drive', cost: 10, days: 0 },
    ];
    const travel = { hubs: [], edges };
    expect(tripTo('a', 'b', { travel })).toMatchObject({ cost: 80, days: 1, legs: [edges[3]] });
    expect(tripTo('a', 'c', { travel })).toMatchObject({ cost: 10, days: 1 });
  });

  it('lists the live crags joined to the graph, and the validator finds a broken one', () => {
    expect(destinations('fontainebleau', bundle).map((t) => t.to)).toEqual(['kalymnos']);
    expect(travelGraphErrors(bundle)).toEqual([]);
    const cut = { ...bundle, travel: { hubs: bundle.travel.hubs, edges: bundle.travel.edges.filter((e) => e.to !== 'kalymnos') } };
    expect(travelGraphErrors(cut).join(' ')).toMatch(/no way from fontainebleau to kalymnos/);
    const stray = { ...bundle, travel: { hubs: bundle.travel.hubs, edges: [...bundle.travel.edges, { from: 'hub_paris', to: 'hub_nowhere', mode: 'fly' as const, cost: 1, days: 1 }] } };
    expect(travelGraphErrors(stray).join(' ')).toMatch(/unknown crag or hub hub_nowhere/);
  });

  it('pays for the trip, lets its days pass and wakes up under the destination\'s own weather', () => {
    const run = createRun('travel', presetSpec('dirtbag'), bundle);
    const money = run.res.money;
    const fontDay = dailyCost(run, bundle);
    applyAction(run, { t: 'travel', to: 'kalymnos' }, bundle);
    expect(run.crag).toBe('kalymnos');
    expect(run.day).toBe(2);
    expect(run.visited).toEqual(['fontainebleau', 'kalymnos']);
    expect(run.yesterday?.travel).toBe('kalymnos');
    // The fare, a day's living at Font, and the arrival day's living at Kalymnos.
    expect(money - run.res.money).toBeCloseTo(280 + fontDay + dailyCost(run, bundle));
    const month = calendarDate(run.start_month, run.start_dom, run.day).month;
    expect(run.weather).toEqual(freshWeather(run.seed, kal, run.day, month, run.options.difficulty));
    // Font's rain stays at Font.
    expect(run.last_rain === null || run.last_rain.day === run.day).toBe(true);
    // The estimate is a route grade now.
    expect(run.est).toBe(estimateDI(run, bundle));
    expect(run.est).not.toBe(estimateBoulderDI(referenceAthlete(15), 'fontainebleau', bundle));
  });

  it('sets off only before the day\'s first block, and only with the fare', () => {
    const run = createRun('travel2', presetSpec('dirtbag'), bundle);
    applyAction(run, { t: 'block_start', kind: 'rest' }, bundle);
    expect(travelBlock(run, 'kalymnos', bundle)).toMatch(/whole days/);
    expect(() => applyAction(run, { t: 'travel', to: 'kalymnos' }, bundle)).toThrow(InvalidAction);
    const poor = createRun('travel3', presetSpec('dirtbag'), bundle);
    poor.res.money = 279;
    expect(travelBlock(poor, 'kalymnos', bundle)).toMatch(/costs \$280/);
    expect(travelBlock(poor, 'nowhere', bundle)).toMatch(/Nowhere/);
  });
});

describe('limestone and the seeping caves (10 §4)', () => {
  const dry: DayWeather = { ...freshWeather('wx', kal, 10, 9, 'standard'), day: 10, sky: 'clear', rh: 60, wind: 3 };
  const grey = sectorById('arginonta_valley');
  const cave = sectorById('grande_grotta');

  it('closes limestone only while it rains, and the caves for a week after heavy rain', () => {
    expect(sectorStatus(kal, grey, { ...dry, sky: 'rain' }, { day: 10, mm: 4 }).open).toBe(false);
    expect(sectorStatus(kal, grey, dry, { day: 9, mm: 40 }).open).toBe(true);
    expect(sectorStatus(kal, cave, dry, { day: 9, mm: 12 }).open).toBe(true);
    expect(sectorStatus(kal, cave, dry, { day: 9, mm: 40 })).toMatchObject({ open: false, reason: expect.stringMatching(/seeping/) });
    expect(sectorStatus(kal, cave, { ...dry, day: 15 }, { day: 9, mm: 40 }).open).toBe(false);
    expect(sectorStatus(kal, cave, { ...dry, day: 16 }, { day: 9, mm: 40 }).open).toBe(true);
  });

  it('keeps Font\'s rule: sandstone stays shut until it has dried', () => {
    const slow = font.sectors.find((s) => s.dry_lag_days >= 2)!;
    expect(sectorStatus(font, slow, dry, { day: 9, mm: 4 }).open).toBe(false);
    expect(sectorStatus(kal, grey, dry, { day: 9, mm: 4 }).open).toBe(true);
  });
});

describe('the sport styles (06 §2.1) and the route estimate (02 §C.3)', () => {
  const rng = stream('test', 'profiles');

  it('builds easy routes on grey walls and hard ones on the tufas', () => {
    const valley = sectorById('arginonta_valley');
    expect(profileFor(valley, 10, bundle, rng).id).toBe('kalymnos_grey_vertical');
    expect(profileFor(valley, 24, bundle, rng).id).toBe('kalymnos_tufa_sport');
    // A cave has only its tufas: below their floor it still builds them.
    expect(profileFor(sectorById('grande_grotta'), 10, bundle, rng).id).toBe('kalymnos_tufa_sport');
  });

  it('starts a cave at its tufas\' floor, and a climber below it climbs elsewhere', () => {
    expect(sectorFloor(sectorById('grande_grotta'), bundle)).toBe(14);
    expect(sectorFloor(sectorById('arginonta_valley'), bundle)).toBe(-Infinity);
    const run = atKalymnos('floor');
    const E = run.est!;
    expect(E).toBeLessThan(14);
    expect(sessionSlots(run, 'grande_grotta', E, bundle).every((x) => x.di_target >= 14)).toBe(true);
    expect(sessionSlots(run, 'arginonta_valley', E, bundle).some((x) => x.di_target < E - 2)).toBe(true);
    for (let d = 0; d < 7; d++) {
      expect(['grande_grotta', 'sikati_cave']).not.toContain(pickSector(run, bundle));
      applyAction(run, { t: 'end_day' }, bundle);
    }
  });

  const shipped = bundle.benchmarks.get('kalymnos')!;

  it('ships two benchmark routes per style per level, within each style\'s grades, graded by the current engine', () => {
    for (const pid of new Set(kal.sectors.flatMap((s) => s.style_profiles))) {
      const p = bundle.profiles.get(pid)!;
      const byLevel = new Map<number, number>();
      for (const r of shipped.filter((x) => x.seed?.includes(`:${pid}:`))) byLevel.set(r.di_target, (byLevel.get(r.di_target) ?? 0) + 1);
      expect(byLevel.size, pid).toBeGreaterThan(3);
      for (const [level, n] of byLevel) {
        expect(level).toBeLessThanOrEqual(p.di_max ?? Infinity);
        expect(level).toBeGreaterThanOrEqual(p.di_min ?? -Infinity);
        expect(n, `${pid} at ${level}`).toBe(2);
      }
    }
    for (const r of shipped.slice(0, 8)) expect(Math.abs(gradeRoute(r).di! - r.di_graded), r.seed).toBeLessThanOrEqual(0.006);
  });

  it('returns the Reference Climber about its own DI on routes', () => {
    for (const d of [12, 16, 20]) expect(Math.abs(estimateBoulderDI(referenceAthlete(d), 'kalymnos', bundle) - d)).toBeLessThan(0.75);
  });

  it('grades no bolted benchmark deadly, and tags routes by shares, not by one move', () => {
    expect(shipped.filter((r) => r.danger === 'deadly').map((r) => r.name)).toEqual([]);
    const tagged = (t: string) => shipped.filter((r) => r.style_tags.includes(t as never)).length / shipped.length;
    expect(tagged('dynamic')).toBeLessThan(0.5);
    expect(tagged('footwork')).toBeLessThan(0.5);
    for (const r of shipped) {
      expect(r.style_tags.filter((t) => ['slab', 'vertical', 'overhang', 'roof'].includes(t)), r.name).toHaveLength(1);
      expect(r.style_tags.includes('power') && r.style_tags.includes('endurance'), r.name).toBe(false);
    }
    const steep = (pid: string) => shipped.filter((r) => r.seed?.includes(`:${pid}:`)).filter((r) => r.style_tags.includes('overhang')).length;
    expect(steep('kalymnos_tufa_sport')).toBeGreaterThan(steep('kalymnos_grey_vertical'));
  });
});

describe('sport sessions (docs/24 §3, P1b)', () => {
  it('works a route well above the climber first, and leaves it alone on a mileage day', () => {
    const run = atKalymnos('work');
    climb(run);
    const s = run.block!.session!;
    const project = s.slots.find((x) => x.kind === 'project')!;
    for (const slot of s.slots) if (slot !== project) s.tried[slot.seed] = { n: 9, sent: true };
    expect(routeEntry(project.seed, bundle).route.di_graded).toBeGreaterThan(s.E + WORK_FIRST_ABOVE);
    expect(nextSessionAttempt(run, bundle, 'project')).toEqual({ route_seed: project.seed, mode: 'work' });
    expect(nextSessionAttempt(run, bundle, 'volume')).toBeNull();
    // Three goes on a project route in one session, one on a mileage route.
    s.tried[project.seed] = { n: ROUTE_TACTICS.project.tries(project), sent: false };
    expect(ROUTE_TACTICS.project.tries(project)).toBe(3);
    expect(ROUTE_TACTICS.volume.tries(project)).toBe(1);
    expect(nextSessionAttempt(run, bundle, 'project')).toBeNull();
  });

  it('a pitch costs energy by the metres climbed and the falls the rope held', () => {
    const run = atKalymnos('energy');
    climb(run);
    const s = run.block!.session!;
    const warm = [...s.slots].sort((a, b) => a.di_target - b.di_target)[0]!;
    const before = run.res.energy;
    applyAction(run, { t: 'attempt', route_seed: warm.seed, mode: 'onsight' }, bundle);
    const res = run.last_attempt!;
    const { route } = routeEntry(warm.seed, bundle);
    const want = ROUTE_ENERGY.base + ROUTE_ENERGY.perMetre * res.progress * route.length_m + ROUTE_ENERGY.perFall * (res.falls ?? 0);
    expect(before - run.res.energy).toBeCloseTo(want);
  });

  it('a sent route counts toward the route PB, pyramid and score, never the boulder ones', () => {
    const run = atKalymnos('pb');
    climb(run);
    const warm = [...run.block!.session!.slots].sort((a, b) => a.di_target - b.di_target)[0]!;
    for (let i = 0; i < 3 && !run.last_attempt?.tick; i++) applyAction(run, { t: 'attempt', route_seed: warm.seed, mode: i ? 'redpoint' : 'onsight' }, bundle);
    const tick = run.last_attempt!.tick!;
    expect(tick.discipline).toBe('sport');
    expect(run.pb_route).toBe(tick.di);
    expect(run.pb).toBe(0);
    expect(run.counters.pyramid_route).toEqual({ [String(Math.round(tick.di))]: 1 });
    expect(run.counters.pyramid).toEqual({});
    applyAction(run, { t: 'retire' }, bundle);
    expect(run.ended).toMatchObject({ hardest: 0, hardest_route: tick.di, countries: 2, pyramid_route: run.counters.pyramid_route });
  });

  it('two weeks at Kalymnos on the default plan climb routes and replay exactly', () => {
    const seed = 'kal-weeks';
    const spec = presetSpec('dirtbag');
    const run = createRun(seed, spec, bundle);
    const log: Action[] = [{ t: 'new_run', seed, spec }, { t: 'travel', to: 'kalymnos' }];
    applyAction(run, log[1]!, bundle);
    log.push(...simulateDays(run, bundle, 14));
    expect(run.ticks.filter((t) => t.discipline === 'sport').length).toBeGreaterThan(0);
    expect(run.ticks.every((t) => t.discipline === 'sport')).toBe(true);
    expect(replay(log, bundle)).toEqual(run);
  });
});

describe('skin on routes (P1b, docs/26)', () => {
  it('wears skin fully at the limit and a quarter on moves well inside it', () => {
    expect(skinForce(-1, 0.9)).toBe(1);
    expect(skinForce(0, 0.9)).toBe(1);
    expect(skinForce(0.9, 0.9)).toBeCloseTo(0.75);
    expect(skinForce(5, 0.9)).toBe(0.25);
  });
});

describe('the rower (04 §2.6)', () => {
  it('a build for Kalymnos starts there as a Rower/Swimmer, with Rower forced and Asthma locked', () => {
    const spec = sampleBuild(stream('test', 'rower'), bundle, DEFAULT_OPTIONS, 'Rower', 'kalymnos');
    expect(spec.background).toBe('rower_swimmer');
    expect(spec.traits).toContain('rower');
    expect(spec.traits).not.toContain('asthma');
    const run = createRun('rower', spec, bundle);
    expect(run.crag).toBe('kalymnos');
    expect(run.visited).toEqual(['kalymnos']);
    expect(run.journal[0]!.text).toMatch(/rope/);
  });
});

describe('the Grande Grotta signatures (09 §7b, docs/26 §8)', () => {
  const sigs = ['sig_priapos', 'sig_dna', 'sig_aegialis'].map((id) => bundle.signatures.get(id)!);

  it('are the sector\'s three, at their canonical grades, offered in every session there', () => {
    expect(sectorById('grande_grotta').signature_routes).toEqual(sigs.map((r) => r.id));
    expect(sigs.map((r) => `${r.name} ${frenchGrade(r.di_target)}`)).toEqual(['Priapos 7a', 'DNA 7c', 'Aegialis 8c']);
    const slots = sessionSlots(atKalymnos('sigs'), 'grande_grotta', 16, bundle);
    expect(slots.filter((s) => s.kind === 'signature').map((s) => s.seed)).toEqual(sigs.map((r) => r.seed));
  });

  it('are bolted pitches graded on the geometry they ship with, every bolt clipped from the line, the anchor from the top', () => {
    for (const r of sigs) {
      expect(r).toMatchObject({ crag: 'kalymnos', area: 'grande_grotta', discipline: 'sport', rock: 'limestone', signature: true });
      expect(Math.abs(gradeRoute(r).di! - r.di_graded), r.name).toBeLessThanOrEqual(0.006);
      expect(Math.abs(r.di_graded - r.di_target), r.name).toBeLessThanOrEqual(0.3);
      const line = new Set(r.beta_line.map((s) => s.hold));
      const bolts = r.protection.filter((p) => p.kind === 'bolt');
      expect(bolts.length, r.name).toBeGreaterThanOrEqual(8);
      for (const b of bolts) expect(b.reach_from!.some((h) => line.has(h)), `${r.name} ${b.id}`).toBe(true);
      expect(r.protection.at(-1)).toMatchObject({ kind: 'anchor', reach_from: [r.finish_hold] });
    }
  });

  it('get a flash on the first look, as the Font signatures do, and play out the same twice', () => {
    const go = () => {
      const run = syntheticRun(referenceAthlete(19), 'sig-flash', bundle);
      atRoute(run, sigs[0]!);
      delete run.projects[sigs[0]!.id];
      let mode: string | undefined;
      simulateAttempt(run, sigs[0]!.seed!, 'flash', bundle, (r) => { mode ??= r.attempt?.mode; });
      return { mode, result: run.last_attempt! };
    };
    const a = go();
    expect(a.mode).toBe('flash');
    expect(go()).toEqual(a);
  });

  it('credit no one, and the real-name rule finds a name however it is written', () => {
    const names = RealNamesSchema.parse(realNamesJson);
    for (const r of sigs) expect(r.fa_note, r.name).toMatch(/no first ascensionist/);
    expect(realNameHits(contentOf(bundle), names)).toEqual([]);
    const list = ['Ana Example', 'Jo Müller'];
    expect(realNameHits({ fa_note: 'First climbed by ANA EXAMPLE in a storm.' }, list)).toEqual(['data.fa_note: names Ana Example']);
    expect(realNameHits({ id: 'sig_jo_muller' }, list)).toEqual(['data.id: names Jo Müller']);
    expect(realNameHits({ fa_note: 'Banana examples, Jo Müllers and Joan Muller.' }, list)).toEqual([]);
    expect(RealNamesSchema.safeParse(['Madonna']).success).toBe(false);
  });
});

describe('content schemas (docs/20, schemas §5)', () => {
  const hub = { id: 'hub_x', name: 'X', country: 'GR', lat: 1, lon: 2, airport: true };
  const edge = { from: 'a', to: 'hub_x', mode: 'fly', cost: 10, days: 1 };

  it('checks the travel graph\'s hubs and legs', () => {
    expect(TravelSchema.safeParse({ hubs: [hub], edges: [edge] }).success).toBe(true);
    expect(TravelSchema.safeParse({ hubs: [{ ...hub, id: 'athens' }], edges: [] }).success).toBe(false);
    expect(TravelSchema.safeParse({ hubs: [{ ...hub, country: 'GRC' }], edges: [] }).success).toBe(false);
    expect(TravelSchema.safeParse({ hubs: [], edges: [{ ...edge, mode: 'teleport' }] }).success).toBe(false);
    expect(TravelSchema.safeParse({ hubs: [], edges: [{ ...edge, days: 1.5 }] }).success).toBe(false);
  });

  it('wants a style\'s floor below its ceiling', () => {
    const tufa = bundle.profiles.get('kalymnos_tufa_sport')!;
    expect(ProfileSchema.safeParse(tufa).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...tufa, di_min: 33, di_max: 33 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...tufa, di_min: 4 }).success).toBe(false);
  });

  it('bounds how long a cave seeps', () => {
    const raw = cragsJson.find((c) => c.id === 'kalymnos')!;
    const seep = (days: number) => ({ ...raw, sectors: raw.sectors.map((s, i) => (i ? s : { ...s, seep_lag_days: days })) });
    expect(CragSchema.safeParse(raw).success).toBe(true);
    expect(CragSchema.safeParse(seep(0)).success).toBe(false);
    expect(CragSchema.safeParse(seep(40)).success).toBe(false);
  });
});
