// Quick probe: generate problems across DI targets and report grading accuracy and timing.
import { loadBundle } from '../../src/data/bundle';
import { generateBoulder, routeSeed } from '../../src/sim/routes';

const b = loadBundle();
const crag = b.crags.get('fontainebleau')!;
const results: { target: number; graded: number; profile: string; ms: number; moves: number; holds: number; name: string }[] = [];
for (const profileId of ['font_sloper_slab', 'font_sloper_bulge', 'font_roof']) {
  const profile = b.profiles.get(profileId)!;
  const sector = crag.sectors[1]!;
  for (let di = 9; di <= 25; di += 2) {
    for (let k = 0; k < 6; k++) {
      const seed = routeSeed('fontainebleau', sector.id, 100 + k, k, di) + ':' + profileId;
      const t0 = performance.now();
      try {
        const r = generateBoulder({ crag, sector, profile, di_target: di, seed, bundle: b });
        results.push({ target: di, graded: r.di_graded, profile: profileId, ms: performance.now() - t0, moves: r.beta_line.length, holds: r.holds.length, name: r.name });
      } catch (e) {
        results.push({ target: di, graded: NaN, profile: profileId, ms: performance.now() - t0, moves: 0, holds: 0, name: String(e) });
      }
    }
  }
}
const ok = results.filter((r) => !Number.isNaN(r.graded));
const within1 = ok.filter((r) => Math.abs(r.graded - r.target) <= 1).length;
const within05 = ok.filter((r) => Math.abs(r.graded - r.target) <= 0.5).length;
console.log(`generated ${ok.length}/${results.length}; within ±1.0: ${(100 * within1 / ok.length).toFixed(0)}%; within ±0.5: ${(100 * within05 / ok.length).toFixed(0)}%`);
console.log(`mean ms ${(results.reduce((s, r) => s + r.ms, 0) / results.length).toFixed(1)}, max ms ${Math.max(...results.map((r) => r.ms)).toFixed(0)}`);
for (const p of ['font_sloper_slab', 'font_sloper_bulge', 'font_roof']) {
  const rs = ok.filter((r) => r.profile === p);
  const bias = rs.reduce((s, r) => s + (r.graded - r.target), 0) / rs.length;
  console.log(p, 'n', rs.length, 'bias', bias.toFixed(2), 'moves avg', (rs.reduce((s, r) => s + r.moves, 0) / rs.length).toFixed(1), 'holds avg', (rs.reduce((s, r) => s + r.holds, 0) / rs.length).toFixed(1));
}
console.log(results.filter((r) => Number.isNaN(r.graded) || Math.abs(r.graded - r.target) > 1).slice(0, 12).map((r) => `${r.profile} t${r.target} g${r.graded} ${r.name}`).join('\n'));
console.log(ok.slice(0, 8).map((r) => `${r.name} t${r.target} g${r.graded}`).join(' | '));
import { GEN_STATS } from '../../src/sim/routes';
console.log('discard reasons', GEN_STATS);
