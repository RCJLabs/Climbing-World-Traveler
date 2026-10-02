// Grade estimates (02 §C.3): invert the Reference Climber scale on the climber's attribute vector by walking a
// fixed benchmark set of generated problems in expected-value mode and finding where P_send crosses X_SEND.
// Every limiter counts (reach, feet, mobility, weak hold families), which a weighted attribute average misses.

import type { Athlete } from './character';
import { evWalk, X_SEND } from './grade';
import { generateBoulder } from './routes';
import type { DataBundle, Route } from './types';
import { routeGeom, type RouteGeom } from './wall';

const LEVELS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];

interface Bench { level: number; di: number; geom: RouteGeom }
const benchCache = new Map<string, Bench[]>();

/** Generate the benchmark set for a crag: one problem per style profile per level, from fixed seeds. */
export function generateBenchmarks(cragId: string, bundle: DataBundle): Route[] {
  const crag = bundle.crags.get(cragId);
  if (!crag) throw new Error(`unknown crag ${cragId}`);
  const profiles = [...new Set(crag.sectors.flatMap((s) => s.style_profiles))];
  const out: Route[] = [];
  for (const level of LEVELS) {
    for (const pid of profiles) {
      const profile = bundle.profiles.get(pid);
      const sector = crag.sectors.find((s) => s.style_profiles.includes(pid));
      if (!profile || !sector) continue;
      // A style is not benchmarked above the hardest DI it can be built to (06 §2.1).
      if (level > (profile.di_max ?? Infinity)) continue;
      try {
        const route = generateBoulder({ crag, sector, profile, di_target: level, seed: `bench:${cragId}:${pid}:${level}`, bundle });
        out.push({ ...route, di_target: level });
      } catch {
        // A benchmark that fails to generate is skipped; the level keeps its other profiles.
      }
    }
  }
  return out;
}

/** Benchmarks shipped in the bundle (scripts/build-benchmarks.ts), or generated on first use. */
export function benchmarks(cragId: string, bundle: DataBundle): Bench[] {
  const key = `${bundle.version}|${cragId}`;
  let out = benchCache.get(key);
  if (out) return out;
  const shipped = bundle.benchmarks.get(cragId);
  const routes = shipped?.length ? shipped : generateBenchmarks(cragId, bundle);
  out = routes.map((r) => ({ level: r.di_target, di: r.di_graded, geom: routeGeom(r) }));
  benchCache.set(key, out);
  return out;
}

/** Estimated boulder DI (redpoint-style, per-attempt X_SEND) for an athlete at a crag. */
export function estimateBoulderDI(ath: Athlete, cragId: string, bundle: DataBundle): number {
  const bench = benchmarks(cragId, bundle);
  const pts: { x: number; p: number }[] = [];
  let runMin = 1;
  for (const level of LEVELS) {
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
