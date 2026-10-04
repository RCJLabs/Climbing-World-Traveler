// Builds the benchmark problem and route sets used by the grade estimate (02 §C.3, src/sim/estimate.ts) and writes
// them to <dir>/crags/<crag>/benchmarks.json (src/data/benchmarks.ts), for every crag or the ones named, then rebuilds
// the manifest. Re-run after any change to the generator or the grade engine:  pnpm benchmarks [crag…] [--dir data]
import { DATA_DIR, loadBundle, writeManifest } from '../src/data/bundle';
import { writeBenchmarks } from '../src/data/benchmarks';

const args = process.argv.slice(2);
const at = args.indexOf('--dir');
const dir = at >= 0 ? args[at + 1]! : DATA_DIR;
const only = args.filter((a, i) => !a.startsWith('--') && !(at >= 0 && i === at + 1));
const bundle = loadBundle(true, dir);
for (const cragId of only.length ? only : [...bundle.crags.keys()]) {
  const r = writeBenchmarks(dir, cragId, bundle);
  console.log(`${r.path}: ${r.routes} routes, ${r.bytes} bytes; ${r.moved} regraded by more than 0.05 DI after rounding`);
}
writeManifest(dir);
