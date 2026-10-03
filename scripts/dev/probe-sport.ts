// Dev: the sport generator on the Kalymnos tufa profile (06, P1b): success, time, distance from target, shape.
//   npx tsx scripts/dev/probe-sport.ts [n per level] [levels...]
import { loadBundle } from '../../src/data/bundle';
import { gradeRoute } from '../../src/sim/grade';
import { boltsOf } from '../../src/sim/rope';
import { GEN_STATS, generateSport } from '../../src/sim/routes';
import type { Crag, Sector } from '../../src/sim/types';

const [nArg = '6', ...lv] = process.argv.slice(2);
const levels = lv.length ? lv.map(Number) : [12, 16, 20, 24];
const bundle = loadBundle(true);
const profile = bundle.profiles.get('kalymnos_tufa_sport')!;
const sector = { id: 'grande_grotta', name: 'Grande Grotta', character: '', circuits: [], landing: 'flat', dry_lag_days: 0, shade: true, style_profiles: [profile.id], signature_routes: [] } as Sector;
const crag = { id: 'kalymnos', sectors: [sector] } as unknown as Crag;
for (const di of levels) {
  const rows: string[] = [];
  let gaps = 0, ms = 0, fails = 0;
  for (let i = 0; i < Number(nArg); i++) {
    const t0 = performance.now();
    try {
      const r = generateSport({ crag, sector, profile, di_target: di, seed: `probe:${di}:${i}`, bundle });
      const t = performance.now() - t0;
      ms += t;
      gaps += Math.abs(r.di_graded - di);
      const hands = r.beta_line.filter((s) => s.limb === 'LH' || s.limb === 'RH').length;
      const g = gradeRoute(r);
      rows.push(`  ${r.name.padEnd(24)} ${r.length_m.toFixed(1)} m  DI ${r.di_graded.toFixed(2)}  hands ${hands}  steps ${r.beta_line.length}  bolts ${boltsOf(r).length}  rests ${g.components.rests}  pump ${g.components.pump_peak.toFixed(0)}  ${r.danger}  ${t.toFixed(0)} ms  tags ${r.style_tags.join(',')}`);
    } catch (e) { fails++; rows.push(`  FAIL ${(e as Error).message}`); }
  }
  console.log(`DI ${di}: mean |gap| ${(gaps / Math.max(1, Number(nArg) - fails)).toFixed(2)}, ${(ms / Math.max(1, Number(nArg) - fails)).toFixed(0)} ms/route, ${fails} failed`);
  console.log(rows.join('\n'));
}
console.log(JSON.stringify(GEN_STATS));
