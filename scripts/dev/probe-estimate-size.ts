// How the estimate's seed spread falls with benchmark set size: problems per profile per level, and level spacing.
// This is how BENCH_PER_PROFILE was chosen (doc 22): 1 per profile gave a worst build spread of 0.68 DI over ten
// sets, 3 gave 0.50, 4 gave 0.31. Denser levels helped less than more problems per level.
// usage: npx tsx scripts/dev/probe-estimate-size.ts <per> <step> [sets=6] [--rows]
import { loadBundle } from '../../src/data/bundle';
import { workedExampleBuilds } from '../../src/harness/sim';
import { athleteOf } from '../../src/sim/attempt';
import type { Athlete } from '../../src/sim/character';
import { benchFrom, estimateFrom, type Bench } from '../../src/sim/estimate';
import { referenceAthlete } from '../../src/sim/grade';
import { PRESETS, presetSpec } from '../../src/sim/presets';
import { generateBoulder } from '../../src/sim/routes';
import { createRun } from '../../src/sim/run';
import type { Route } from '../../src/sim/types';

const bundle = loadBundle();
const per = Number(process.argv[2] ?? 1);
const step = Number(process.argv[3] ?? 2);
const NSETS = Number(process.argv[4] ?? 6);
const crag = bundle.crags.get('fontainebleau')!;
const profiles = [...new Set(crag.sectors.flatMap((s) => s.style_profiles))];
const levels: number[] = [];
for (let l = 8; l <= 30; l += step) levels.push(l);

function gen(salt: string): Route[] {
  const out: Route[] = [];
  for (const level of levels) for (const pid of profiles) {
    const profile = bundle.profiles.get(pid)!;
    if (level > (profile.di_max ?? Infinity)) continue;
    const sector = crag.sectors.find((s) => s.style_profiles.includes(pid))!;
    for (let k = 0; k < per; k++) {
      try { out.push({ ...generateBoulder({ crag, sector, profile, di_target: level, seed: `bsz${salt}:${pid}:${level}:${k}`, bundle }), di_target: level }); } catch { /* skip */ }
    }
  }
  return out;
}

const { A, B } = workedExampleBuilds();
const builds: (readonly [string, Athlete])[] = [
  ['05b A', A], ['05b B', B],
  ...PRESETS.map((p) => [p.id, athleteOf(createRun('e', presetSpec(p.id), bundle), bundle)] as const),
  ...[10, 16, 22].map((d) => [`ref ${d}`, referenceAthlete(d)] as const),
];
const t0 = performance.now();
const sets: Bench[][] = Array.from({ length: NSETS }, (_, i) => benchFrom(gen(String(i))));
const genS = (performance.now() - t0) / 1000;
let sdSum = 0, nb = 0, worst = 0, calls = 0;
const t1 = performance.now();
const rows: string[] = [];
for (const [id, ath] of builds) {
  const xs = sets.map((s) => { calls++; return estimateFrom(ath, s); });
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  if (!id.startsWith('ref')) { sdSum += sd; nb++; worst = Math.max(worst, sd); }
  rows.push(`${id.padEnd(20)} ${m.toFixed(2)} ±${sd.toFixed(2)}`);
}
const ms = (performance.now() - t1) / calls;
console.log(`per ${per} step ${step}: ${sets[0]!.length} problems/set; mean build sd ${(sdSum / nb).toFixed(2)}, worst ${worst.toFixed(2)}; ${ms.toFixed(1)} ms per estimate; ${(genS / NSETS).toFixed(1)} s to generate a set`);
if (process.argv.includes('--rows')) for (const r of rows) console.log('  ' + r);
