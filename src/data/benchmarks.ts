// A crag's benchmarks.json (02 §C.3, src/sim/estimate.ts): its generated benchmark set as shipped. Decoys are stripped:
// the expected-value walk only touches start, beta and clipping holds. Numbers are rounded to 3 decimals, which halves
// the gzipped size, and each route is regraded after rounding so its stored grade matches the geometry shipped. The
// file is the compact route format (routefile.ts). `pnpm benchmarks` writes it for the crags in data/; the test crag's
// test writes its own the same way (27 M1). Node only.
import { writeFileSync } from 'node:fs';
import { generateBenchmarks } from '../sim/estimate';
import { gradeRoute } from '../sim/grade';
import type { DataBundle, Route } from '../sim/types';
import { encodeRoutes } from './routefile';

const round = <T>(v: T): T => {
  if (typeof v === 'number') return (Number.isInteger(v) ? v : Math.round(v * 1000) / 1000) as T;
  if (Array.isArray(v)) return v.map(round) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) as T;
  return v;
};

/** A crag's benchmark routes as shipped, and how many moved by more than 0.05 DI when regraded after rounding. */
export function shippedBenchmarks(cragId: string, bundle: DataBundle): { routes: Route[]; moved: number } {
  let moved = 0;
  const routes = generateBenchmarks(cragId, bundle).map((r) => {
    const keep = new Set([...Object.values(r.start), ...r.beta_line.map((s) => s.hold), r.finish_hold, ...r.protection.flatMap((p) => p.reach_from ?? [])]);
    const { fa_note: _fa, ...rest } = r;
    const out: Route = round({ ...rest, holds: r.holds.filter((h) => keep.has(h.id)) });
    const g = gradeRoute(out);
    if (g.di === null) throw new Error(`${r.id} is ungradeable after rounding`);
    const di = Math.round(g.di * 100) / 100;
    if (Math.abs(di - r.di_graded) > 0.05) moved++;
    return { ...out, di_graded: di, danger: g.danger, components: round(g.components) };
  });
  return { routes, moved };
}

/** Write `<dir>/crags/<id>/benchmarks.json`; the manifest is the caller's to rebuild after. */
export function writeBenchmarks(dir: string, cragId: string, bundle: DataBundle): { path: string; routes: number; bytes: number; moved: number } {
  const { routes, moved } = shippedBenchmarks(cragId, bundle);
  const path = `${dir}/crags/${cragId}/benchmarks.json`;
  const text = JSON.stringify(encodeRoutes(routes)) + '\n';
  writeFileSync(path, text);
  return { path, routes: routes.length, bytes: Buffer.byteLength(text), moved };
}
