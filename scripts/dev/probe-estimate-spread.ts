// How far a build's grade estimate moves with the benchmark seeds (doc 22, open question 1): the shipped set and
// other sets built the same way from salted seeds.
// usage: npx tsx scripts/dev/probe-estimate-spread.ts [sets=6]
import { loadBundle } from '../../src/data/bundle';
import { workedExampleBuilds } from '../../src/harness/sim';
import { athleteOf } from '../../src/sim/attempt';
import { benchFrom, benchmarks, estimateFrom, generateBenchmarks } from '../../src/sim/estimate';
import { referenceAthlete } from '../../src/sim/grade';
import { PRESETS, presetSpec } from '../../src/sim/presets';
import { createRun } from '../../src/sim/run';

const bundle = loadBundle();
const n = Number(process.argv[2] ?? 6);
const { A, B } = workedExampleBuilds();
const builds = [
  ['05b A (Compression Monster)', A] as const,
  ['05b B (Crimp Machine)', B] as const,
  ...PRESETS.map((p) => [p.id, athleteOf(createRun('e', presetSpec(p.id), bundle), bundle)] as const),
  ...[12, 16, 20].map((d) => [`reference DI ${d}`, referenceAthlete(d)] as const),
];
const shipped = benchmarks('fontainebleau', bundle, 'boulder');
const sets = Array.from({ length: n }, (_, i) => benchFrom(generateBenchmarks('fontainebleau', bundle, String(i + 1))));
for (const [id, ath] of builds) {
  const xs = sets.map((s) => estimateFrom(ath, s));
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
  console.log(`${id.padEnd(28)} shipped ${estimateFrom(ath, shipped).toFixed(2)} · other sets mean ${m.toFixed(2)} sd ${sd.toFixed(2)} range ${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)}`);
}
