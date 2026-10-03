// Dev: joint positions of the cartoon rig on a real attempt, for checking the legs by numbers.
//   npx tsx scripts/dev/cartoon/probe-rig.ts [route seed] [climber DI offset]
import { loadBundle } from '../../../src/data/bundle';
import { atRoute, syntheticRun } from '../../../src/harness/sim';
import { athleteOf, routeEntry, simulateAttempt } from '../../../src/sim/attempt';
import { referenceAthlete } from '../../../src/sim/grade';
import type { AttemptState } from '../../../src/sim/state';
import { momentAt, playbackOf } from '../../../src/ui/wall/playback';

const [seed = 'sig_marie_rose', offArg = '1'] = process.argv.slice(2);
const bundle = loadBundle(false);
const { route, geom } = routeEntry(seed, bundle);
let frames: AttemptState[] = [];
let run = syntheticRun(referenceAthlete(route.di_graded + Number(offArg)), `probe:${seed}`, bundle);
// The first dice whose frames include a dynamic move, if any in 40.
for (let k = 0; k < 40; k++) {
  run = syntheticRun(referenceAthlete(route.di_graded + Number(offArg)), `gallery:${seed}:${k}`, bundle);
  atRoute(run, route);
  delete run.projects[route.id];
  frames = [];
  simulateAttempt(run, seed, 'flash', bundle, (r) => { if (r.attempt) frames.push(structuredClone(r.attempt)); });
  if (frames.some((f) => f.log[f.log.length - 1]?.cls === 'dyno')) break;
}
const ath = athleteOf(run, bundle);
const pb = playbackOf(geom, ath, frames, run.last_attempt!);
const f = (v: readonly number[]) => `(${v.map((x) => x.toFixed(2)).join(', ')})`;
console.log(`${route.name}: ${frames.length} frames, ${run.last_attempt!.outcome}; leg ${pb.bodies[0]!.leg.toFixed(2)} arm ${pb.bodies[0]!.arm.toFixed(2)} k ${pb.bodies[0]!.k.toFixed(2)}`);
for (let i = 0; i < Math.min(frames.length, 9); i++) {
  const b = pb.bodies[i]!;
  const m = momentAt(pb, i, 1);
  const j = m.joints;
  console.log(`#${i} ${pb.steps[i]!.limb ?? ''} ${pb.steps[i]!.cls ?? ''} posture ${b.posture}`);
  console.log(`  engine hip ${f(b.hip)} sh ${f(b.sh)} LF ${f(b.ends.LF)} RF ${f(b.ends.RF)} LH ${f(b.ends.LH)} RH ${f(b.ends.RH)}`);
  const view = pb.proj.view;
  console.log(`  rig hip ${f(j.hip)} knL ${f(j.knL)} knR ${f(j.knR)}  | view hip ${f(view(j.hip))} knL ${f(view(j.knL))} LF ${f(view(j.LF))} knR ${f(view(j.knR))} RF ${f(view(j.RF))}`);
}
for (const t of [0.35, 0.45, 0.6, 0.7]) {
  const i = pb.steps.findIndex((s) => s.cls === 'dyno');
  if (i < 0) break;
  const m = momentAt(pb, i, t);
  const j = m.joints;
  console.log(`dyno #${i} @${t}: hip ${f(j.hip)} LF ${f(j.LF)} RF ${f(j.RF)} knL ${f(j.knL)} on ${JSON.stringify(j.on)}`);
}
