// Dev probe: how long are generated problems? Hand moves, foot moves, gain per hand move, by profile.
import { loadBundle } from '../../src/data/bundle';
import { GEN_STATS, generateBoulder } from '../../src/sim/routes';
import { gradeRoute } from '../../src/sim/grade';

const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
const n = Number(process.argv[2] ?? 8);
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
const all = { hand: [] as number[], foot: [] as number[], acc: [] as number[] };
for (const profile of bundle.profiles.values()) {
  const sector = crag.sectors.find((s) => s.style_profiles.includes(profile.id))!;
  const hand: number[] = [], foot: number[] = [], gain: number[] = [], height: number[] = [], gaps: number[] = [];
  for (const di of [10, 13, 16, 19, 22]) for (let k = 0; k < n; k++) {
    const r = generateBoulder({ crag, sector, profile, di_target: di, seed: `len:${profile.id}:${di}:${k}`, bundle });
    const hs = r.beta_line.filter((s) => s.limb.endsWith('H') && s.class !== 'mantle');
    const fs = r.beta_line.filter((s) => s.limb.endsWith('F'));
    const y = (id: string) => r.holds.find((h) => h.id === id)!.y;
    const startTop = Math.max(y(r.start.LH!), y(r.start.RH!));
    const top = r.wall[r.wall.length - 1]!.y1;
    hand.push(hs.length); foot.push(fs.length); height.push(top);
    gain.push((top - startTop) / hs.length);
    gaps.push(Math.abs(r.di_graded - di));
  }
  all.hand.push(...hand); all.foot.push(...foot); all.acc.push(...gaps);
  console.log(`${profile.id.padEnd(18)} hand p10/p50/p90 ${q(hand, .1)}/${q(hand, .5)}/${q(hand, .9)}  feet ${q(foot, .5)}  height ${q(height, .5).toFixed(2)} m  gain/hand ${q(gain, .5).toFixed(2)} m  within±1 ${(100 * gaps.filter((g) => g <= 1).length / gaps.length).toFixed(0)}%`);
}
const tot: number[] = all.hand.map((h, i) => h + all.foot[i]!);
console.log(`ALL total steps p50/p90 ${q(tot, .5)}/${q(tot, .9)}`);
console.log(`ALL hand p10/p50/p90 ${q(all.hand, .1)}/${q(all.hand, .5)}/${q(all.hand, .9)}  feet median ${q(all.foot, .5)}  within±1 ${(100 * all.acc.filter((g) => g <= 1).length / all.acc.length).toFixed(0)}%`);
void gradeRoute;
const hm = Object.entries(GEN_STATS).filter(([k]) => k.startsWith('hand_') && k !== 'hand_gain_cm').reduce((a, [, v]) => a + v, 0);
console.log('stats', JSON.stringify(GEN_STATS), 'mean traced gain/hand cm', (GEN_STATS.hand_gain_cm! / hm).toFixed(1));
