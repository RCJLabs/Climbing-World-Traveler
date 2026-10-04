// A sector's fixed routes (06 §5, P2): the catalogue every run shares, how a session's slots take routes from it,
// the content rule (schemas §9 rule 18), and the weekly estimate.
import { describe, expect, it } from 'vitest';
import fontJson from '../data/crags/fontainebleau/crag.json';
import { loadBundle } from '../src/data/bundle';
import { CragSchema } from '../src/data/schema';
import { routeEntry } from '../src/sim/attempt';
import { presetSpec } from '../src/sim/presets';
import { catalogueErrors, catalogueSeed, parseRouteSeed, routeFromSeed, routeIdFor, sectorCatalogue, sectorRange } from '../src/sim/routes';
import { applyAction, createRun, estimateDI, sectorList, sessionSlots, SLOT_TOLERANCE } from '../src/sim/run';
import type { RunState } from '../src/sim/state';

const bundle = loadBundle();
const font = bundle.crags.get('fontainebleau')!;
const kal = bundle.crags.get('kalymnos')!;

function dryDay(run: RunState): void {
  for (let i = 0; i < 120 && !sectorList(run, bundle).some((s) => s.open); i++) applyAction(run, { t: 'end_day' }, bundle);
}

describe('a sector\'s catalogue (06 §5)', () => {
  it('is the same for every run, sized by the data, inside the sector\'s grades and mostly mid-grade', () => {
    for (const crag of [font, kal]) {
      // Triangular with its mode at 35% of the range: 59% of a crag's routes in the lower half of their sector's range on
      // average; the fixed draws give 54% at Kalymnos (Sikati Cave drew hard) and 59% at Font.
      let below = 0;
      let all = 0;
      for (const sector of crag.sectors) {
        const cat = sectorCatalogue(crag, sector, bundle);
        expect(cat).toHaveLength(sector.routes!);
        const [lo, hi] = sectorRange(crag, sector, bundle);
        for (const e of cat) {
          expect(e.di).toBeGreaterThanOrEqual(lo);
          expect(e.di).toBeLessThanOrEqual(hi);
          expect(e.di * 2).toBe(Math.round(e.di * 2));
          expect(e.seed).toBe(catalogueSeed(crag.id, sector.id, e.index, e.di));
          expect(e.id).toBe(routeIdFor(e.seed));
          expect(parseRouteSeed(e.seed)).toEqual({ crag: crag.id, sector: sector.id, di: e.di });
        }
        below += cat.filter((e) => e.di < lo + 0.5 * (hi - lo)).length;
        all += cat.length;
      }
      expect(below / all).toBeGreaterThan(0.5);
    }
    const caves = sectorCatalogue(kal, kal.sectors.find((s) => s.id === 'grande_grotta')!, bundle);
    expect(Math.min(...caves.map((e) => e.di))).toBeGreaterThanOrEqual(14);
  });

  it('builds each route from its seed alone, with the id the catalogue gives it', () => {
    const sector = font.sectors[1]!;
    const e = sectorCatalogue(font, sector, bundle)[3]!;
    const route = routeFromSeed(e.seed, bundle);
    expect(route.id).toBe(e.id);
    expect(route.area).toBe(sector.id);
    expect(Math.abs(route.di_target - e.di)).toBeLessThan(1e-9);
    expect(routeFromSeed(e.seed, bundle).holds).toEqual(route.holds);
  });

  it('a live crag\'s every sector needs one (schemas §9 rule 18)', () => {
    expect(catalogueErrors(font, true)).toEqual([]);
    const bare = { ...font, sectors: font.sectors.map(({ routes, ...s }, i) => (i === 2 ? s : { ...s, ...(routes ? { routes } : {}) })) };
    expect(catalogueErrors(bare, true)).toHaveLength(1);
    expect(catalogueErrors(bare, false)).toEqual([]);
    const raw = fontJson as { sectors: Record<string, unknown>[] };
    const sized = (n: number) => ({ ...raw, sectors: raw.sectors.map((s, i) => (i === 0 ? { ...s, routes: n } : s)) });
    expect(CragSchema.safeParse(sized(120)).success).toBe(true);
    expect(CragSchema.safeParse(sized(0)).success).toBe(false);
    expect(CragSchema.safeParse(sized(2001)).success).toBe(false);
  });
});

describe('session slots from the catalogue (06 §5)', () => {
  it('take the sector\'s routes, each near its slot\'s target, never twice', () => {
    const run = createRun('cat-slots', presetSpec('dirtbag'), bundle);
    dryDay(run);
    const sector = sectorList(run, bundle).find((s) => s.open)!.id;
    const slots = sessionSlots(run, sector, 13, bundle).filter((s) => s.kind !== 'signature' && s.kind !== 'known');
    const cat = new Map(sectorCatalogue(font, font.sectors.find((s) => s.id === sector)!, bundle).map((e) => [e.seed, e]));
    expect(slots).toHaveLength(8);
    expect(new Set(slots.map((s) => s.seed)).size).toBe(8);
    for (const s of slots) expect(cat.get(s.seed)?.di).toBe(s.di_target);
    expect(slots.find((s) => s.kind === 'warmup')!.di_target).toBeLessThanOrEqual(13 - 3 + SLOT_TOLERANCE);
    expect(slots.find((s) => s.kind === 'project')!.di_target).toBeGreaterThanOrEqual(13 + 3 - SLOT_TOLERANCE);
  });

  it('prefer routes the climber has never tried, then ones not yet sent', () => {
    const run = createRun('cat-fresh', presetSpec('dirtbag'), bundle);
    dryDay(run);
    const sector = sectorList(run, bundle).find((s) => s.open)!.id;
    const first = sessionSlots(run, sector, 13, bundle).filter((s) => s.kind === 'mid' || s.kind === 'push');
    // Every route the first list offered has been climbed and sent: the same day offers others at the same grades.
    for (const s of first) {
      const { route } = routeEntry(s.seed, bundle);
      run.projects[route.id] = { seed: s.seed, id: route.id, name: route.name, area: sector, di: route.di_graded, signature: false, attempts: 1, attempt_eq: 1, sessions: 1, first_day: 0, last_day: 0, sent: true, best: 1, fall_fear: 0, revealed: [] };
    }
    const again = sessionSlots(run, sector, 13, bundle).filter((s) => s.kind === 'mid' || s.kind === 'push');
    expect(again.some((s) => first.some((f) => f.seed === s.seed))).toBe(false);
  });
});

describe('the weekly estimate (06 §5)', () => {
  it('is worked out when a week starts, not when a session does', () => {
    const run = createRun('cat-week', presetSpec('dirtbag'), bundle);
    dryDay(run);
    const est = run.est;
    run.attrs.finger_strength.value += 10;
    applyAction(run, { t: 'block_start', kind: 'climb', target: sectorList(run, bundle).find((s) => s.open)!.id }, bundle);
    expect(run.est).toBe(est);
    applyAction(run, { t: 'block_end' }, bundle);
    while (run.day % 7 !== 6) applyAction(run, { t: 'end_day' }, bundle);
    applyAction(run, { t: 'end_day' }, bundle);
    expect(run.est).toEqual({ boulder: estimateDI(run, bundle) });
    expect(run.history.at(-1)!.est).toEqual(run.est);
  });
});

describe('a move out of reach (06 §5)', () => {
  it('ends the attempt there, and the route is left alone for REACH_RETRY_DAYS', async () => {
    const { registerRoute, simulateAttempt, REACH_RETRY_DAYS } = await import('../src/sim/attempt');
    const { atRoute, syntheticRun } = await import('../src/harness/sim');
    const { referenceAthlete } = await import('../src/sim/grade');
    const { nextSessionAttempt } = await import('../src/sim/tactics');
    const easy = bundle.benchmarks.get('fontainebleau')!.find((r) => r.di_graded < 12)!;
    // The same problem with its third hand hold three metres higher: no body reaches it.
    const k = easy.beta_line.findIndex((s, i) => i >= 2 && (s.limb === 'LH' || s.limb === 'RH'));
    const far = easy.beta_line[k]!.hold;
    const route = structuredClone(easy);
    route.seed = 'test/out_of_reach';
    route.id = 'proc_out_of_reach';
    route.holds = route.holds.map((h) => (h.id === far ? { ...h, y: h.y + 3 } : h));
    registerRoute(route);
    const run = syntheticRun(referenceAthlete(easy.di_graded + 4), 'reach', bundle);
    atRoute(run, route);
    simulateAttempt(run, route.seed, 'onsight', bundle);
    expect(run.last_attempt!.outcome).toBe('jumped');
    expect(run.projects[route.id]!.reach_until).toBe(run.day + REACH_RETRY_DAYS);
    // The session's tactics pass it by from then on.
    run.block!.session!.slots = [{ seed: route.seed, kind: 'mid', di_target: easy.di_graded }];
    expect(nextSessionAttempt(run, bundle, 'volume')).toBeNull();
  });
});
