// Dev probe: play bot careers for each preset and print a season summary.
import { loadBundle } from '../../src/data/bundle';
import { BotDriver, PROJECT_POLICY, VOLUME_POLICY } from '../../src/sim/bot';
import { PRESETS, presetSpec } from '../../src/sim/presets';
import { createRun, estimateDI, replay } from '../../src/sim/run';

const bundle = loadBundle();
const days = Number(process.argv[2] ?? 60);
for (const p of PRESETS) {
  for (const policy of [PROJECT_POLICY, VOLUME_POLICY]) {
    const spec = presetSpec(p.id, { death_enabled: false, auto_commit: true, sweep_speed: 1, difficulty: 'standard' });
    const run = createRun(`smoke-${p.id}`, spec, bundle);
    const bot = new BotDriver(run, bundle, policy);
    bot.log.unshift({ t: 'new_run', seed: run.seed, spec });
    const E0 = estimateDI(run, bundle);
    const t0 = performance.now();
    for (let d = 0; d < days && !run.ended; d++) bot.day();
    const ms = performance.now() - t0;
    const E1 = estimateDI(run, bundle);
    const sends = run.ticks.filter((t) => t.style !== 'repeat');
    const t1 = performance.now();
    const again = replay(bot.log, bundle);
    const same = JSON.stringify(again) === JSON.stringify(run);
    console.log(
      `${p.name.padEnd(20)} ${policy.style.padEnd(8)} E ${E0.toFixed(1)}→${E1.toFixed(1)} pb ${run.pb.toFixed(1)} sends ${sends.length} att ${run.counters.attempts}`
      + ` climb ${run.counters.climb_days}/${run.day}d $${run.res.money} stoke ${run.res.stoke.toFixed(0)} burn ${run.res.burnout.toFixed(0)} ${run.ended?.end_reason ?? ''}`
      + ` | ${bot.log.length} actions ${ms.toFixed(0)} ms, replay ${(performance.now() - t1).toFixed(0)} ms ${same ? 'OK' : 'MISMATCH'}`,
    );
  }
}
