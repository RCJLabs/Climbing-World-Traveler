// Builds the benchmark problem and route sets used by the grade estimate (02 §C.3, src/sim/estimate.ts) and writes
// them to data/routes/<crag>_benchmarks.json, for every live crag or the ones named. Decoys are stripped: the
// expected-value walk only touches start, beta and clipping holds. Numbers are rounded to 3 decimals, which halves
// the gzipped size, and each route is regraded after rounding so its stored grade matches the geometry shipped.
// Re-run after any change to the generator or the grade engine:  pnpm benchmarks [crag…]
import { writeFileSync } from 'node:fs';
import { loadBundle } from '../src/data/bundle';
import { generateBenchmarks } from '../src/sim/estimate';
import { gradeRoute } from '../src/sim/grade';
import type { Route } from '../src/sim/types';

const round = <T>(v: T): T => {
  if (typeof v === 'number') return (Number.isInteger(v) ? v : Math.round(v * 1000) / 1000) as T;
  if (Array.isArray(v)) return v.map(round) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) as T;
  return v;
};

const bundle = loadBundle();
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const cragId of only.length ? only : ['fontainebleau', 'kalymnos']) {
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
  const path = `data/routes/${cragId}_benchmarks.json`;
  writeFileSync(path, JSON.stringify(routes) + '\n');
  console.log(`${path}: ${routes.length} routes, ${JSON.stringify(routes).length} bytes; ${moved} regraded by more than 0.05 DI after rounding`);
}
