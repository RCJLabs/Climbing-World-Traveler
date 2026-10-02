import { loadBundle } from '../../src/data/bundle';
import { generateBoulder, routeSeed } from '../../src/sim/routes';
const b = loadBundle();
const crag = b.crags.get('fontainebleau')!;
const sector = crag.sectors[1]!;
for (const pid of ['font_sloper_slab', 'font_sloper_bulge', 'font_roof']) {
  const profile = b.profiles.get(pid)!;
  let hand = 0, foot = 0, h = 0, n = 0, holds = 0, decoys = 0, high = 0;
  for (let k = 0; k < 20; k++) {
    try {
      const r = generateBoulder({ crag, sector, profile, di_target: 12 + (k % 8), seed: routeSeed('fontainebleau', sector.id, k, k, 12 + (k % 8)) + pid, bundle: b });
      hand += r.beta_line.filter((s) => s.limb.endsWith('H') && s.class !== 'mantle').length;
      foot += r.beta_line.filter((s) => s.limb.endsWith('F')).length;
      high += r.beta_line.filter((s) => s.class === 'high_step').length;
      h += r.length_m; holds += r.holds.length; decoys += r.holds.filter((x) => x.id.startsWith('d')).length; n++;
    } catch { /* counted elsewhere */ }
  }
  console.log(pid, 'n', n, 'height', (h / n).toFixed(2), 'hand', (hand / n).toFixed(1), 'foot', (foot / n).toFixed(1), 'high_steps', (high / n).toFixed(1), 'holds', (holds / n).toFixed(1), 'decoys', (decoys / n).toFixed(1));
}
