// Grade estimates (02 §C.3): invert the Reference Climber scale on the climber's attribute vector by walking a
// fixed benchmark set of generated problems in expected-value mode and finding where P_send crosses X_SEND.
// Every limiter counts (reach, feet, mobility, weak hold families), which a weighted attribute average misses.

import type { Athlete } from './character';
import { evWalk, X_SEND } from './grade';
import { generateBoulder, generateSport } from './routes';
import type { DataBundle, Route } from './types';
import { routeGeom, type RouteGeom } from './wall';

const LEVELS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
/**
 * Problems per style profile per level. A lopsided build climbs some problems up to 1.4 DI better or worse than
 * others of the same grade, and only the two levels around its grade decide the estimate. With one per profile a
 * build's estimate moved with the benchmark seeds by up to 0.9 DI (standard deviation); four bring that to about
 * 0.3 (doc 22, scripts/dev/probe-estimate-size.ts). **(tune)**
 */
export const BENCH_PER_PROFILE = 4;
/**
 * Routes per style profile per level on a sport crag (P1b, docs/26). A route is ten times a problem's data, so four
 * would ship four megabytes; a route's hundred moves also average out a lopsided build's best and worst holds, so
 * two hold the estimate about as steady as four problems do. **(tune)**
 */
export const BENCH_PER_SPORT_PROFILE = 2;

export interface Bench { level: number; di: number; geom: RouteGeom; discipline: string }
const benchCache = new Map<string, Bench[]>();

/** Generate the benchmark set for a crag: `BENCH_PER_PROFILE` problems per style profile per level, from fixed seeds. `salt` builds another set, for probes. */
export function generateBenchmarks(cragId: string, bundle: DataBundle, salt = ''): Route[] {
  const crag = bundle.crags.get(cragId);
  if (!crag) throw new Error(`unknown crag ${cragId}`);
  const profiles = [...new Set(crag.sectors.flatMap((s) => s.style_profiles))];
  const out: Route[] = [];
  for (const level of LEVELS) {
    for (const pid of profiles) {
      const profile = bundle.profiles.get(pid);
      const sector = crag.sectors.find((s) => s.style_profiles.includes(pid));
      if (!profile || !sector) continue;
      // A style is not benchmarked outside the grades it is built to (06 §2.1).
      if (level > (profile.di_max ?? Infinity) || level < (profile.di_min ?? -Infinity)) continue;
      const sport = profile.protection?.kind === 'bolt';
      for (let k = 0; k < (sport ? BENCH_PER_SPORT_PROFILE : BENCH_PER_PROFILE); k++) {
        // The first keeps the seed it had when there was one problem per profile.
        const seed = `bench${salt}:${cragId}:${pid}:${level}${k ? `:${k}` : ''}`;
        try {
          const req = { crag, sector, profile, di_target: level, seed, bundle };
          const route = sport ? generateSport(req) : generateBoulder(req);
          out.push({ ...route, di_target: level });
        } catch {
          // A benchmark that fails to generate is skipped; the level keeps its other problems.
        }
      }
    }
  }
  return out;
}

/**
 * A crag's benchmarks in one discipline (scripts/build-benchmarks.ts). They come with the crag's data (27 M1): a run
 * never plays at a crag whose data is not loaded, so a missing set is an error, never built on the spot, which would
 * play differently online and offline.
 */
export function benchmarks(cragId: string, bundle: DataBundle, discipline: string): Bench[] {
  const key = `${bundle.version}|${cragId}|${discipline}`;
  let out = benchCache.get(key);
  if (out) return out;
  const shipped = bundle.benchmarks.get(cragId);
  if (!shipped) throw new Error(`the data for ${cragId} is not loaded`);
  out = benchFrom(shipped).filter((b) => b.discipline === discipline);
  if (!out.length) throw new Error(`${cragId} has no ${discipline} benchmarks`);
  benchCache.set(key, out);
  return out;
}

export const benchFrom = (routes: Route[]): Bench[] => routes.map((r) => ({ level: r.di_target, di: r.di_graded, geom: routeGeom(r), discipline: r.discipline }));

/**
 * Estimated DI (redpoint-style, per-attempt X_SEND) for an athlete at a crag in one discipline (02 §C.3): the crag's
 * benchmark problems for bouldering, its benchmark routes for sport (27 M1: one estimate per discipline).
 */
export function estimateAt(ath: Athlete, cragId: string, discipline: string, bundle: DataBundle): number {
  return estimateFrom(ath, benchmarks(cragId, bundle, discipline));
}

/** The estimate against a given benchmark set. */
export function estimateFrom(ath: Athlete, bench: Bench[]): number {
  const pts: { x: number; p: number }[] = [];
  let runMin = 1;
  for (const level of [...new Set(bench.map((b) => b.level))].sort((a, b) => a - b)) {
    const set = bench.filter((b) => b.level === level);
    if (!set.length) continue;
    const p = set.reduce((s, b) => s + evWalk(b.geom, ath).p_send, 0) / set.length;
    runMin = Math.min(runMin, p);
    pts.push({ x: set.reduce((s, b) => s + b.di, 0) / set.length, p: runMin });
    if (runMin < X_SEND) break;
  }
  if (!pts.length) return 8;
  const i = pts.findIndex((q) => q.p < X_SEND);
  if (i === -1) return Math.min(33, pts[pts.length - 1]!.x + 1);
  if (i === 0) return Math.max(6, pts[0]!.x - 1);
  const a = pts[i - 1]!;
  const b = pts[i]!;
  return a.x + ((a.p - X_SEND) / Math.max(1e-9, a.p - b.p)) * (b.x - a.x);
}
