// Why progress flattens after year two (doc 22): runs harness builds under both bot policies and, at each yearly
// checkpoint, reports the estimate, how close attribute groups are to their ceilings, and which attributes limit
// the estimate most (estimate gain from +5 on that attribute alone).
// usage: npx tsx scripts/dev/probe-plateau.ts <from> <to> [years=5]   (harness build indices, seed 7)
import { loadBundle } from '../../src/data/bundle';
import { sampleBuild } from '../../src/harness/sampler';
import { athleteOf } from '../../src/sim/attempt';
import { BotDriver, PROJECT_POLICY, VOLUME_POLICY } from '../../src/sim/bot';
import { estimateBoulderDI } from '../../src/sim/estimate';
import { DEFAULT_OPTIONS } from '../../src/sim/presets';
import { stream } from '../../src/sim/rng';
import { createRun } from '../../src/sim/run';
import { PHYSICAL_ATTRS, TECHNIQUE_ATTRS, type AttrId } from '../../src/sim/types';

const bundle = loadBundle(false);
const [from, to] = [Number(process.argv[2] ?? 0), Number(process.argv[3] ?? 2)];
const years = Number(process.argv[4] ?? 5);
const LATER = new Set(['tech_cracks', 'rope_craft', 'gear_placement']);

for (let i = from; i < to; i++) {
  const spec = sampleBuild(stream('harness-build', '7', i), bundle, DEFAULT_OPTIONS, `H${i}`);
  for (const policy of ['project', 'volume'] as const) {
    const run = createRun(`plateau-${i}`, spec, bundle);
    const bot = new BotDriver(run, bundle, policy === 'project' ? PROJECT_POLICY : VOLUME_POLICY);
    const rows: string[] = [];
    for (let y = 1; y <= years; y++) {
      for (let d = 0; d < 365 && !run.ended; d++) bot.day();
      const ath = athleteOf(run, bundle);
      const E = estimateBoulderDI(ath, run.crag, bundle);
      const frac = (ids: readonly AttrId[]) => {
        const xs = ids.filter((a) => !LATER.has(a)).map((a) => run.attrs[a].value / Math.max(1, run.attrs[a].ceiling));
        return xs.reduce((s, x) => s + x, 0) / xs.length;
      };
      // Limiters: the estimate's gain from +5 on one attribute, top three.
      const lim = [...PHYSICAL_ATTRS, ...TECHNIQUE_ATTRS].filter((a) => !LATER.has(a)).map((a) => {
        const up = { ...ath, a: { ...ath.a, [a]: ath.a[a] + 5 } };
        return [a, estimateBoulderDI(up, run.crag, bundle) - E] as const;
      }).sort((p, q) => q[1] - p[1]).slice(0, 3);
      const atCeil = [...PHYSICAL_ATTRS, ...TECHNIQUE_ATTRS].filter((a) => !LATER.has(a) && run.attrs[a].value >= 0.9 * run.attrs[a].ceiling).length;
      rows.push(`y${y} E ${E.toFixed(1)} PB ${run.pb.toFixed(1)} | phys ${(100 * frac(PHYSICAL_ATTRS)).toFixed(0)}% tech ${(100 * frac(TECHNIQUE_ATTRS)).toFixed(0)}% of ceiling, ${atCeil} attrs ≥90% | limiters ${lim.map(([a, g]) => `${a} +${g.toFixed(2)}`).join(', ')}`);
    }
    console.log(`\n# H${i} ${spec.background} age ${spec.body.age_start} ${policy}: climb days ${run.counters.climb_days}, attempts ${run.counters.attempts}, sends ${run.counters.sends}, train blocks ${run.counters.train_blocks}`);
    for (const r of rows) console.log('  ' + r);
  }
}
