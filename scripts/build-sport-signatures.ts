// Builds the Kalymnos signature routes (docs/09 §7b, 06 §4): an authored spec per route (the wall's shape, its
// features and the canonical grade) run through the sport generator, which traces, holds, bolts and grades the line,
// re-seeded until the grade engine lands within ±0.3 DI of the canonical grade (05c C7 allows ±1.0). The route is then
// named, marked as a signature and written to data/routes/kalymnos_signatures.json, rounded as the benchmarks are.
// A 30 m pitch has about 150 holds, so its holds are generated from the spec rather than placed one by one as the Font
// problems are (docs/26 §8). Real route names as geography only; the first-ascent notes are fictional and name no one;
// the shapes are approximations, not traced from the rock (25 §7).
//   pnpm tsx scripts/build-sport-signatures.ts
import { writeFileSync } from 'node:fs';
import { loadBundle } from '../src/data/bundle';
import { gradeRoute } from '../src/sim/grade';
import { generateSport } from '../src/sim/routes';
import type { Feature, Route, WallSegment } from '../src/sim/types';

interface Spec {
  id: string;
  name: string;
  sector: string;
  profile: string;
  di_target: number;
  /** Segments as [height at the top of the segment (m), angle (°), feature]; the first starts at 0.3 m. */
  wall: [number, number, Feature][];
  fa: string;
}

/** A wall from segment tops: the 0.3 m start the generator always has, the segments, and the anchor's last metre. */
function wallOf(spec: Spec): WallSegment[] {
  const out: WallSegment[] = [{ y0: 0, y1: 0.3, angle: spec.wall[0]![1], feature: 'none' }];
  let y = 0.3;
  for (const [top, angle, feature] of spec.wall) { out.push({ y0: y, y1: top, angle, feature }); y = top; }
  const last = out[out.length - 1]!;
  out.push({ y0: y, y1: y + 1.0, angle: Math.min(95, last.angle), feature: 'none' });
  return out;
}

const SPECS: Spec[] = [
  {
    id: 'sig_priapos', name: 'Priapos', sector: 'grande_grotta', profile: 'kalymnos_tufa_sport', di_target: 17,
    wall: [[4, 100, 'none'], [8, 110, 'tufa'], [12, 118, 'tufa'], [16, 122, 'tufa'], [20, 115, 'tufa'], [24, 105, 'tufa'], [27, 98, 'none']],
    fa: 'A Grande Grotta classic: jugs and tufa horns all the way, and a pump that builds with every metre. The game records no first ascensionist.',
  },
  {
    id: 'sig_dna', name: 'DNA', sector: 'grande_grotta', profile: 'kalymnos_tufa_sport', di_target: 21,
    wall: [[4, 105, 'none'], [8, 118, 'tufa'], [12, 128, 'tufa'], [16, 132, 'tufa'], [20, 128, 'tufa'], [24, 120, 'tufa'], [28, 108, 'none']],
    fa: 'Tufas twisting up the steep heart of the Grotta, sustained to the anchor. The game records no first ascensionist.',
  },
  {
    id: 'sig_aegialis', name: 'Aegialis', sector: 'grande_grotta', profile: 'kalymnos_tufa_sport', di_target: 27,
    // Gentler and shorter than the cave's steepest lines: on a 30 m wall at 130° the sport generator cannot make the moves
    // off the crux easy enough for 8c (its base search stops 8 DI under the grade; docs/26 §8 open questions).
    wall: [[4, 112, 'none'], [8, 117, 'tufa'], [12, 120, 'tufa'], [16, 122, 'tufa'], [20, 121, 'tufa'], [24, 118, 'tufa'], [28, 112, 'none']],
    fa: 'Small pockets and crimps between the tufas, for twenty-nine metres. The game records no first ascensionist.',
  },
];

const round = <T>(v: T): T => {
  if (typeof v === 'number') return (Number.isInteger(v) ? v : Math.round(v * 1000) / 1000) as T;
  if (Array.isArray(v)) return v.map(round) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) as T;
  return v;
};

const bundle = loadBundle();
const crag = bundle.crags.get('kalymnos')!;
const out: Route[] = [];
for (const spec of SPECS) {
  const sector = crag.sectors.find((s) => s.id === spec.sector)!;
  const profile = bundle.profiles.get(spec.profile)!;
  let best: Route | null = null;
  for (let k = 0; k < 24; k++) {
    const seed = k ? `${spec.id}:${k}` : spec.id;
    const r = generateSport({ crag, sector, profile, di_target: spec.di_target, seed, bundle, wall: wallOf(spec) });
    // Rounded as shipped, then regraded so the stored grade matches the geometry in the file. Unlike the benchmarks,
    // a signature keeps its off-route holds: it is climbed and watched, not only graded.
    const { fa_note: _fa, ...rest } = r;
    const shipped: Route = round(rest);
    const g = gradeRoute(shipped);
    if (g.di === null) continue;
    const route: Route = {
      ...shipped, id: spec.id, seed: spec.id, name: spec.name, signature: true, di_target: spec.di_target,
      di_graded: Math.round(g.di * 100) / 100, danger: g.danger, components: round(g.components), fa_note: spec.fa,
    };
    const gap = Math.abs(route.di_graded - spec.di_target);
    if (!best || gap < Math.abs(best.di_graded - spec.di_target)) best = route;
    console.log(`${spec.name}: seed ${seed} graded ${route.di_graded} (target ${spec.di_target}), ${route.length_m} m, ${route.beta_line.length} steps, ${route.protection.filter((p) => p.kind === 'bolt').length} bolts, ${route.danger}`);
    if (gap <= 0.3) break;
  }
  if (!best || Math.abs(best.di_graded - spec.di_target) > 1.0) throw new Error(`${spec.name}: no build within ±1.0 DI`);
  out.push(best);
}
writeFileSync('data/routes/kalymnos_signatures.json', JSON.stringify(out) + '\n');
console.log(`data/routes/kalymnos_signatures.json: ${out.map((r) => `${r.name} ${r.di_graded}`).join(', ')}`);
