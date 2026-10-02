// Dev probe: where does a style profile stop reaching its target DI? Per target: bias, hand holds at the hardest
// size and quality, and whether the reference's hardest move is a foot move. Sets `di_max` (docs/20 §3.6).
// Run: npx tsx scripts/dev/probe-ceiling.ts <profile id>
import { loadBundle } from '../../src/data/bundle';
import { evWalk, referenceAthlete } from '../../src/sim/grade';
import { generateBoulder } from '../../src/sim/routes';
import { routeGeom } from '../../src/sim/wall';
const b = loadBundle();
const crag = b.crags.get('fontainebleau')!;
const pid = process.argv[2] ?? 'font_sloper_slab';
const profile = b.profiles.get(pid)!;
const sector = crag.sectors.find((s) => s.style_profiles.includes(profile.id))!;
for (let di = 9; di <= 26; di += 1) {
  const gaps: number[] = []; let clamped = 0, hands = 0, footCrux = 0, n = 0;
  for (let k = 0; k < 20; k++) {
    let r; try { r = generateBoulder({ crag, sector, profile, di_target: di, seed: `cal:${pid}:${di}:${k}`, bundle: b }); } catch { continue; }
    n++; gaps.push(r.di_graded - di);
    for (const s of r.beta_line) {
      if (!s.limb.endsWith('H') || s.class === 'mantle') continue;
      const h = r.holds.find((x) => x.id === s.hold)!;
      hands++; if (h.size === 'xs' && h.quality <= 0.16) clamped++;
    }
    const w = evWalk(routeGeom(r), referenceAthlete(r.di_graded));
    let mi = 0; w.margins.forEach((m, i) => { if (m < w.margins[mi]!) mi = i; });
    if (r.beta_line[mi]?.limb.endsWith('F')) footCrux++;
  }
  const mean = gaps.reduce((a, c) => a + c, 0) / gaps.length;
  const off = gaps.filter((g) => Math.abs(g) > 1).length;
  console.log(`DI ${String(di).padStart(2)}  n ${n}  bias ${mean.toFixed(2).padStart(5)}  >±1 ${off}  hand holds at xs/0.15 ${(100 * clamped / Math.max(1, hands)).toFixed(0).padStart(3)}%  foot crux ${footCrux}/${n}`);
}
