// Dev probe: why do attempts end? Outcome and jump-off reasons per preset.
import { loadBundle } from '../../src/data/bundle';
import { autoClimbAction, athleteOf, routeEntry } from '../../src/sim/attempt';
import { prepareMove, canMantle } from '../../src/sim/engine';
import { PRESETS, presetSpec } from '../../src/sim/presets';
import { applyAction, createRun, sectorList } from '../../src/sim/run';

const bundle = loadBundle();
const ids = process.argv.slice(2);
for (const p of PRESETS.filter((x) => !ids.length || ids.includes(x.id))) {
  const run = createRun(`diag-${p.id}`, presetSpec(p.id, { death_enabled: false, auto_commit: true, sweep_speed: 1, difficulty: 'standard' }), bundle);
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  let days = 0;
  while (days < 40 && Object.values(counts).reduce((a, b) => a + b, 0) < 150) {
    const open = sectorList(run, bundle).filter((s) => s.open);
    if (open.length) {
      applyAction(run, { t: 'block_start', kind: 'climb', target: open[days % open.length]!.id }, bundle);
      const s = run.block!.session!;
      for (const slot of s.slots) {
        if (run.res.energy < 22 || run.res.skin < 12) break;
        applyAction(run, { t: 'attempt_start', route_seed: slot.seed, mode: 'onsight' }, bundle);
        for (let g = 0; g < 120 && run.attempt; g++) {
          const at = run.attempt;
          const a = autoClimbAction(run, bundle, { bot: true });
          if (a?.t === 'wall_action' && a.kind === 'jump_off') {
            const { route, geom } = routeEntry(at.route_seed, bundle);
            const step = route.beta_line[at.beta_ptr];
            const ath = athleteOf(run, bundle);
            let why = 'end of beta';
            if (step) {
              const prep = step.class === 'mantle' ? (canMantle(geom, at.climb) === step.limb ? prepareMove(geom, ath, at.climb, step.limb, step.hold, 'mantle') : null) : prepareMove(geom, ath, at.climb, step.limb, step.hold);
              why = prep ? 'other' : `illegal ${step.limb} ${step.class} (${geom.holds.get(step.hold)?.type})`;
            }
            bump(`jump: ${why}`);
          }
          applyAction(run, a ?? { t: 'wall_action', kind: 'jump_off' }, bundle);
        }
        const r = run.last_attempt!;
        bump(`${r.outcome}`);
      }
      applyAction(run, { t: 'block_end' }, bundle);
    }
    applyAction(run, { t: 'end_day' }, bundle);
    days++;
  }
  console.log(p.name, JSON.stringify(counts));
}
