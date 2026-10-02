import { loadBundle } from '../../src/data/bundle';
import { routeFromSeed, routeSeed, GEN_STATS } from '../../src/sim/routes';
const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
let n = 0, fail = 0; const off: number[] = []; const fails: string[] = [];
const t0 = performance.now();
for (const s of crag.sectors) for (let di = 9; di <= 26; di += 1.5) for (let k = 0; k < 3; k++) {
  const seed = routeSeed('fontainebleau', s.id, 0, 1000 + k * 7 + Math.round(di * 10), di);
  n++;
  try { const r = routeFromSeed(seed, bundle); off.push(Math.abs(r.di_graded - di)); } catch { fail++; fails.push(seed); }
}
const within = off.filter((x) => x <= 1).length;
console.log(`n ${n} fail ${fail} within±1 ${within}/${off.length} mean ${((performance.now() - t0) / n).toFixed(1)} ms`, GEN_STATS);
console.log(fails.slice(0, 12).join('\n'));
