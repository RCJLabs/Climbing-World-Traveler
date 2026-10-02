// Builds the benchmark problem set used by the grade estimate (02 §C.3, src/sim/estimate.ts) and writes it to
// data/routes/<crag>_benchmarks.json. Decoys are stripped: the expected-value walk only touches start and beta
// holds. Re-run after any change to the generator or the grade engine:  pnpm tsx scripts/build-benchmarks.ts
import { writeFileSync } from 'node:fs';
import { loadBundle } from '../src/data/bundle';
import { generateBenchmarks } from '../src/sim/estimate';

const bundle = loadBundle();
for (const cragId of ['fontainebleau']) {
  const routes = generateBenchmarks(cragId, bundle).map((r) => {
    const keep = new Set([...Object.values(r.start), ...r.beta_line.map((s) => s.hold), r.finish_hold]);
    const round = (x: number) => Math.round(x * 1000) / 1000;
    return {
      ...r,
      holds: r.holds.filter((h) => keep.has(h.id)).map((h) => ({ ...h, x: round(h.x), y: round(h.y) })),
      fa_note: undefined,
    };
  });
  const path = `data/routes/${cragId}_benchmarks.json`;
  writeFileSync(path, JSON.stringify(routes) + '\n');
  console.log(`${path}: ${routes.length} routes, ${JSON.stringify(routes).length} bytes`);
}
