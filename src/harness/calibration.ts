// A crag's own calibration gates (05c §4, 27 M1): C1–C4 in every discipline it climbs and C7 on its signatures. A crag
// that fails them does not ship. scripts/calibrate.ts runs them for every live crag in the manifest, then the checks
// that compare crags or builds (C5, C6, C9, C10) on the reference crags; the test crag's test runs them on a crag it
// adds. Samples are seeded by crag, so each crag is checked on routes of its own.
import { cragDisciplines, sectorDiscipline, type Climb } from '../sim/discipline';
import { evWalk, gradeRoute, referenceAthlete, sendCurve, X_SEND } from '../sim/grade';
import { generateBoulder, generateSport, routeFromSeed, routeSeed, sectorRange } from '../sim/routes';
import type { CragStyleProfile, DataBundle, Route, Sector } from '../sim/types';
import { routeGeom } from '../sim/wall';
import { diceAttempt, mean, syntheticRun } from './sim';

export type CalMode = 'quick' | 'normal' | 'full';

/** Sample sizes per mode: problems per style per DI and DI step (C1), routes and attempts (C2), curves (C3). */
export const CAL_SIZES = {
  quick: { c1n: 4, c1step: 2, c2routes: 3, c2att: 120, c3: 6, c5: 10, c9: 20, s1n: 2, s1step: 4, s2routes: 2, s2att: 40, s3: 3, c10: 6 },
  normal: { c1n: 20, c1step: 1, c2routes: 8, c2att: 300, c3: 20, c5: 40, c9: 60, s1n: 4, s1step: 2, s2routes: 4, s2att: 100, s3: 8, c10: 12 },
  full: { c1n: 200, c1step: 1, c2routes: 50, c2att: 500, c3: 100, c5: 200, c9: 100, s1n: 20, s1step: 1, s2routes: 12, s2att: 300, s3: 30, c10: 30 },
} as const;
export type CalSizes = (typeof CAL_SIZES)[CalMode];

export interface Check { crag?: string; id: string; pass: boolean; gate: boolean; text: string; detail: string[] }
export interface Sample { route: Route | null; target: number; profile: string }

/** How each discipline is sampled (05c §4; routes docs/26 §5): the DI sweep, C2's grades and band, C3's curve, C4's seeds. */
const PLAN = {
  boulder: { from: 9, c2at: [12, 16, 20], c2band: 0.05, curveTo: 30, c4: [10, 12, 14, 16, 18, 20], noun: 'problems' },
  sport: { from: 10, c2at: [16, 20], c2band: 0.1, curveTo: 32, c4: [16, 19, 22], noun: 'routes' },
} as const;

const sizesFor = (d: Climb, S: CalSizes) => (d === 'boulder'
  ? { n: S.c1n, step: S.c1step, c2routes: S.c2routes, c2att: S.c2att, c3: S.c3 }
  : { n: S.s1n, step: S.s1step, c2routes: S.s2routes, c2att: S.s2att, c3: S.s3 });

const generate = (d: Climb) => (d === 'sport' ? generateSport : generateBoulder);

/** A send curve rises and crosses the send rate once (C3). */
function monotone(route: Route, to: number): boolean {
  const curve = sendCurve(route, 8, to, 0.5);
  let crossings = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i]![1] < curve[i - 1]![1] - 1e-9) return false;
    if ((curve[i - 1]![1] < X_SEND) !== (curve[i]![1] < X_SEND)) crossings++;
  }
  return crossings === 1;
}

/** Every `n`th of a list, `n` of them, starting at `offset` (the checks that sample C1's routes). */
export const spaced = <T>(xs: readonly T[], n: number, offset = 0): T[] => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === offset).slice(0, n);

/** C1–C4 in each of a crag's disciplines and C7 on its signatures, with C1's samples for the checks across crags. */
export function cragGates(bundle: DataBundle, cragId: string, S: CalSizes, c1min = 0.9): { checks: Check[]; samples: Partial<Record<Climb, Sample[]>> } {
  const crag = bundle.crags.get(cragId);
  if (!crag) throw new Error(`unknown crag ${cragId}`);
  const checks: Check[] = [];
  const samples: Partial<Record<Climb, Sample[]>> = {};
  const record = (id: string, pass: boolean, text: string, gate = true, detail: string[] = []) => checks.push({ crag: crag.id, id, pass, gate, text, detail });

  for (const d of cragDisciplines(crag, bundle)) {
    const plan = PLAN[d];
    const z = sizesFor(d, S);
    const sectors = crag.sectors.filter((s) => sectorDiscipline(s, bundle) === d);
    const profiles = [...new Set(sectors.flatMap((s) => s.style_profiles))].map((id) => bundle.profiles.get(id)!);

    // C1: each style over its own grades within the crag's, in the sectors that have it.
    const c1: Sample[] = [];
    const t1 = performance.now();
    for (const profile of profiles) {
      const where = sectors.filter((s) => s.style_profiles.includes(profile.id));
      const lo = Math.max(plan.from, crag.di_range[0], profile.di_min ?? -Infinity);
      const hi = Math.min(26, crag.di_range[1], profile.di_max ?? Infinity);
      for (let di = lo; di <= hi; di += z.step) {
        for (let k = 0; k < z.n; k++) {
          const sector = where[(di + k) % where.length]!;
          try {
            c1.push({ route: generate(d)({ crag, sector, profile, di_target: di, seed: `cal:${crag.id}:${profile.id}:${di}:${k}`, bundle }), target: di, profile: profile.id });
          } catch { c1.push({ route: null, target: di, profile: profile.id }); }
        }
      }
    }
    samples[d] = c1;
    const ok = c1.filter((x): x is Sample & { route: Route } => x.route !== null);
    const gaps = ok.map((x) => x.route.di_graded - x.target);
    const w1 = gaps.filter((g) => Math.abs(g) <= 1).length / Math.max(1, c1.length);
    const w05 = gaps.filter((g) => Math.abs(g) <= 0.5).length / Math.max(1, c1.length);
    const bias = mean(gaps);
    const byProfile = profiles.map((p) => {
      const g = ok.filter((x) => x.profile === p.id).map((x) => x.route.di_graded - x.target);
      return `${p.id} ${(100 * g.filter((v) => Math.abs(v) <= 1).length / Math.max(1, g.length)).toFixed(0)}% bias ${mean(g).toFixed(2)}`;
    });
    record(`C1 ${d} generator accuracy`, c1.length > 0 && w1 >= c1min && w05 >= 0.6 && Math.abs(bias) <= 0.3,
      `${c1.length} ${plan.noun}, ${(100 * w1).toFixed(1)}% within ±1 (≥ ${c1min * 100}%), ${(100 * w05).toFixed(1)}% within ±0.5 (≥ 60%), bias ${bias.toFixed(2)}, ${c1.length - ok.length} failed, ${((performance.now() - t1) / Math.max(1, c1.length)).toFixed(0)} ms each`,
      true, [`by style: ${byProfile.join(' · ')}`]);

    // C2: the Reference Climber at a route's own grade sends it about X_SEND of the time, with dice, through the play loop.
    const rates: number[] = [];
    const evs: number[] = [];
    const rows: string[] = [];
    for (const n of plan.c2at) {
      for (const x of [...ok].sort((a, b) => Math.abs(a.route.di_graded - n) - Math.abs(b.route.di_graded - n)).slice(0, z.c2routes)) {
        const base = syntheticRun(referenceAthlete(x.route.di_graded), `c2:${x.route.id}`, bundle);
        let sends = 0;
        for (let k = 0; k < z.c2att; k++) if (diceAttempt(base, x.route, k, bundle).outcome === 'sent') sends++;
        const ev = evWalk(routeGeom(x.route), referenceAthlete(x.route.di_graded)).p_send;
        rates.push(sends / z.c2att);
        evs.push(ev);
        rows.push(`reference ${x.route.di_graded.toFixed(2)} on its own grade${d === 'sport' ? ` (${x.route.length_m.toFixed(0)} m)` : ''}: dice ${(100 * sends / z.c2att).toFixed(0)}% vs EV ${(100 * ev).toFixed(0)}%`);
      }
    }
    const c2 = mean(rates);
    record(`C2 ${d} reference self-consistency`, rates.length > 0 && Math.abs(c2 - X_SEND) <= plan.c2band,
      `mean dice send rate ${(100 * c2).toFixed(1)}% over ${rates.length} ${plan.noun} (target ${100 * X_SEND} ± ${100 * plan.c2band}; EV ${(100 * mean(evs)).toFixed(1)}%)`, false, rows);

    // C3: send curves rise and cross once.
    const curves = spaced(ok, z.c3);
    const mono = curves.filter((x) => monotone(x.route, plan.curveTo)).length;
    record(`C3 ${d} monotonicity`, mono === curves.length, `${mono}/${curves.length} send curves non-decreasing with one crossing`);

    // C4: a seed regenerates the same route with the same grade.
    const seeds = plan.c4.map((target, i) => {
      const sector: Sector = sectors[i % sectors.length]!;
      const [lo, hi] = sectorRange(crag, sector, bundle);
      return routeSeed(crag.id, sector.id, 3, 900 + i, Math.min(hi, Math.max(lo, target)));
    });
    const same = seeds.filter((s) => {
      const [a, b] = [routeFromSeed(s, bundle), routeFromSeed(s, bundle)];
      return JSON.stringify(a) === JSON.stringify(b) && gradeRoute(a).di === gradeRoute(b).di;
    }).length;
    record(`C4 ${d} determinism`, same === seeds.length, `${same}/${seeds.length} seeds regenerate and grade identically`);
  }

  // C7: the crag's signatures grade within a DI of their canonical grades.
  const sig = [...bundle.signatures.values()].filter((r) => r.crag === crag.id).map((r) => ({ r, g: gradeRoute(r).di }));
  record('C7 signatures', sig.every((s) => s.g !== null && Math.abs(s.g - s.r.di_target) <= 1),
    sig.length ? sig.map((s) => `${s.r.name} ${s.g?.toFixed(2)} (canon ${s.r.di_target})`).join(', ') : 'none');
  return { checks, samples };
}

/** The steepest bolted style at a crag, by its mean wall angle: C10's endurance pitches (the Kalymnos tufas). */
export function steepestSport(cragId: string, bundle: DataBundle): CragStyleProfile | undefined {
  const crag = bundle.crags.get(cragId)!;
  const angle = (p: CragStyleProfile) => p.angle_dist.reduce((a, x) => a + x.angle * x.weight, 0) / Math.max(1e-9, p.angle_dist.reduce((a, x) => a + x.weight, 0));
  return [...new Set(crag.sectors.flatMap((s) => s.style_profiles))].map((id) => bundle.profiles.get(id)!)
    .filter((p) => p.protection?.kind === 'bolt').sort((a, b) => angle(b) - angle(a) || (a.id < b.id ? -1 : 1))[0];
}
