// Dev: simulated attempts on generated Kalymnos routes (P1b): how often a Reference Climber at, below and above each
// route's graded DI sends, works or lowers off, how many steps, falls and minutes an attempt takes, and one attempt's log.
//   npx tsx scripts/dev/probe-sport-attempts.ts [route DI] [n attempts per route] [routes]
import { loadBundle } from '../../src/data/bundle';
import { atRoute, syntheticRun } from '../../src/harness/sim';
import { registerRoute, simulateAttempt } from '../../src/sim/attempt';
import { evWalk, referenceAthlete } from '../../src/sim/grade';
import { boltsOf } from '../../src/sim/rope';
import { generateSport } from '../../src/sim/routes';
import { routeGeom } from '../../src/sim/wall';

const [diArg = '18', nArg = '20', rArg = '3'] = process.argv.slice(2);
const bundle = loadBundle(false);
const crag = bundle.crags.get('kalymnos')!;
const profile = bundle.profiles.get('kalymnos_tufa_sport')!;
const di = Number(diArg);
const routes = Array.from({ length: Number(rArg) }, (_, i) => {
  const sector = crag.sectors[i % crag.sectors.length]!;
  return generateSport({ crag, sector, profile, di_target: di, seed: `kalymnos/${sector.id}:0:${i}:${di.toFixed(1)}`, bundle });
});
for (const r of routes) registerRoute(r);
for (const off of [-1, 0, 1]) {
  const tally: Record<string, number> = {};
  let steps = 0, falls = 0, mins = 0, kappa = 0, n = 0, prog = 0, ev = 0;
  for (const r of routes) {
    ev += evWalk(routeGeom(r), referenceAthlete(r.di_graded + off)).p_send;
    for (let k = 0; k < Number(nArg); k++) {
      const run = syntheticRun(referenceAthlete(r.di_graded + off), `sp:${r.id}:${off}:${k}`, bundle);
      run.crag = 'kalymnos';
      atRoute(run, r);
      delete run.projects[r.id];
      let s = 0;
      let t = 0;
      simulateAttempt(run, r.seed!, 'redpoint', bundle, (st) => { s++; if (st.attempt) t = st.attempt.time_s; });
      const res = run.last_attempt!;
      tally[res.outcome] = (tally[res.outcome] ?? 0) + 1;
      steps += s;
      falls += res.falls ?? 0;
      mins += t / 60;
      kappa = Math.max(kappa, res.kappa);
      prog += res.progress;
      n++;
    }
  }
  console.log(`climber at graded DI ${off >= 0 ? '+' : ''}${off}: ${JSON.stringify(tally)} sends ${(100 * (tally.sent ?? 0) / n).toFixed(0)}% (EV ${(100 * ev / routes.length).toFixed(0)}%)  steps ${(steps / n).toFixed(0)}  falls/attempt ${(falls / n).toFixed(2)}  minutes ${(mins / n).toFixed(1)}  progress ${(prog / n).toFixed(2)}  max κ ${kappa.toFixed(2)}`);
}
// One attempt, step by step.
const r = routes[0]!;
const run = syntheticRun(referenceAthlete(r.di_graded), 'sp:log', bundle);
run.crag = 'kalymnos';
atRoute(run, r);
delete run.projects[r.id];
simulateAttempt(run, r.seed!, 'redpoint', bundle, (st) => {
  const at = st.attempt;
  if (at) {
    const m = at.log[at.log.length - 1];
    if (m && m.kind !== 'move') console.log(`  t ${at.time_s.toFixed(0).padStart(4)}s pump ${at.pump.toFixed(0).padStart(3)} reserve ${at.aerobic_reserve.toFixed(0).padStart(3)} ${at.mode.padEnd(8)} ${m.kind}: ${m.text}`);
  }
});
console.log(`${r.name} DI ${r.di_graded} ${r.length_m.toFixed(1)} m, ${boltsOf(r).length} bolts: ${run.last_attempt!.outcome}, ${run.last_attempt!.text} (${run.last_attempt!.moves} moves, progress ${run.last_attempt!.progress.toFixed(2)})`);
