// Dev probe: where does a year of bot climbing put its attribute gains?
import { loadBundle } from '../../src/data/bundle';
import { BotDriver, PROJECT_POLICY } from '../../src/sim/bot';
import { presetSpec } from '../../src/sim/presets';
import { createRun, estimateDI } from '../../src/sim/run';
import { ALL_ATTRS } from '../../src/sim/types';

const bundle = loadBundle();
const id = process.argv[2] ?? 'power_boulderer';
const days = Number(process.argv[3] ?? 365);
const run = createRun('gains', presetSpec(id, { death_enabled: false, auto_commit: true, sweep_speed: 1, difficulty: 'standard' }), bundle);
run.res.money = 1e6;
const start = Object.fromEntries(ALL_ATTRS.map((a) => [a, run.attrs[a].value]));
const bot = new BotDriver(run, bundle, PROJECT_POLICY);
const E0 = estimateDI(run, bundle);
for (let d = 0; d < days && !run.ended; d++) {
  bot.day();
  if ((d + 1) % 90 === 0) console.log(`day ${d + 1}: E ${estimateDI(run, bundle).toFixed(1)} pb ${run.pb.toFixed(1)}`);
}
console.log(`E ${E0.toFixed(1)} → ${estimateDI(run, bundle).toFixed(1)}, climb days ${run.counters.climb_days}, train ${run.counters.train_blocks}`);
const rows = ALL_ATTRS.map((a) => [a, run.attrs[a].value - start[a]!, run.attrs[a].value, run.attrs[a].ceiling] as const).filter((r) => Math.abs(r[1]) > 0.5).sort((x, y) => y[1] - x[1]);
for (const [a, d, v, c] of rows) console.log(`${a.padEnd(20)} +${d.toFixed(1).padStart(5)}  → ${v.toFixed(1)} / ${c.toFixed(0)}`);
