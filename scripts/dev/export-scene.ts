// Dev: one simulated attempt as scene data for the visual-style mockups (docs/25). The wall, its holds and the line,
// then, step by step, the climber's body points in 3D (x across, y up, z out from the foot of the wall) with the
// meters and the commentary, so any renderer can draw the same attempt from the front, three-quarter or isometric.
//   npx tsx scripts/dev/export-scene.ts <out.json> [route seed] [climber DI] [mode]
// It searches dice seeds for a story to watch: a first attempt that comes off high on the problem, then a send on the
// next one, with sketchy moments and a dynamic move along the way.
import { writeFileSync } from 'node:fs';
import { loadBundle } from '../../src/data/bundle';
import { atRoute, syntheticRun } from '../../src/harness/sim';
import { athleteOf, liveFear, routeEntry, simulateAttempt } from '../../src/sim/attempt';
import type { Athlete } from '../../src/sim/character';
import { referenceAthlete } from '../../src/sim/grade';
import { fontGrade } from '../../src/sim/grades';
import { izof, powerPool } from '../../src/sim/resolve';
import type { RunState } from '../../src/sim/state';
import type { AttemptMode, Limb } from '../../src/sim/types';
import { bodyPoints, limbKind, yOfS, zOfY, type ClimbState, type RouteGeom } from '../../src/sim/wall';

const [out = 'scene.json', seed = 'sig_marie_rose', diArg = '13.5', modeArg = 'flash'] = process.argv.slice(2);
const bundle = loadBundle(false);
const { route, geom } = routeEntry(seed, bundle);
const wall = route.wall;
const top = wall[wall.length - 1]!.y1;
const LIMBS: Limb[] = ['LH', 'RH', 'LF', 'RF'];
const r3 = (v: number) => Math.round(v * 1000) / 1000;
type V3 = [number, number, number];

/** Body points out from the face, as the wall view draws them (src/ui/wall/pose.ts): shoulders 0.28 m, hips 0.22 m. */
function pose3(g: RouteGeom, ath: Athlete, climb: ClimbState) {
  const bp = bodyPoints(g, ath, climb);
  const k = ath.body.height_cm / 170;
  const at = (x: number, s: number, outM: number): V3 => { const y = yOfS(wall, s); return [r3(x), r3(y), r3(zOfY(wall, y) + outM)]; };
  const sh = at(bp.shoulder.x, bp.shoulder.s, 0.28);
  const hip = at(bp.hip.x, bp.hip.s, 0.22);
  const ends = {} as Record<Limb, V3>;
  const on = {} as Record<Limb, boolean>;
  for (const l of LIMBS) {
    const id = climb.anchors[l];
    const h = id ? g.holds.get(id) : undefined;
    const placed = !!h && !(climb.feet_cut && limbKind(l) === 'foot');
    on[l] = placed;
    const side = l === 'LH' || l === 'LF' ? -1 : 1;
    ends[l] = placed ? [r3(h!.x), r3(h!.y), r3(h!.z)]
      : limbKind(l) === 'hand' ? [r3(sh[0] + 0.14 * side), r3(sh[1] - 0.55 * k), r3(sh[2] + 0.05)]
        : [r3(hip[0] + 0.12 * side), r3(hip[1] - 0.78 * k), r3(hip[2] + 0.1)];
  }
  return { sh, hip, ends, on, k: r3(k) };
}

function frameOf(run: RunState, ath: Athlete) {
  const at = run.attempt!;
  const last = at.log[at.log.length - 1];
  const fear = liveFear(at, geom, ath);
  const band = izof(ath.a.composure);
  const next = route.beta_line[at.beta_ptr];
  return {
    pose: pose3(geom, ath, at.climb),
    pump: r3(at.pump), power: r3(at.power), power_max: r3(powerPool(ath)), chalk: r3(at.chalk), skin: r3(run.res.skin),
    fear: r3(fear.fear), band: [r3(band.lo), r3(band.hi)], moves: at.moves,
    text: last?.text ?? '', ev: last?.kind ?? 'move', limb: last?.limb ?? null, cls: last?.cls ?? null,
    outcome: last?.outcome ?? null, commit: last?.commit ?? null,
    p: last?.p_complete === undefined ? null : r3(last.p_complete), margin: last?.margin === undefined ? null : r3(last.margin), T: last?.T === undefined ? null : r3(last.T),
    fear_sources: at.fear_log.slice(-3).map((f) => ({ label: f.label, delta: f.delta })),
    next: next ? { limb: next.limb, hold: next.hold, cls: next.class } : null,
    feet_cut: at.climb.feet_cut, posture: at.climb.posture,
  };
}

type Frame = ReturnType<typeof frameOf>;

/** Attempts on one run until the problem goes (at most `max`): each with its frames and result. */
function sequence(di: number, k: number, mode: AttemptMode, max = 3) {
  const base = syntheticRun(referenceAthlete(di), `scene:${seed}`, bundle);
  const run = structuredClone(base);
  run.seed = `${base.seed}:${k}`;
  atRoute(run, route);
  delete run.projects[route.id];
  const ath = athleteOf(run, bundle);
  const attempts: { frames: Frame[]; result: NonNullable<RunState['last_attempt']> }[] = [];
  for (let i = 0; i < max; i++) {
    const frames: Frame[] = [];
    run.res.energy = 100;
    simulateAttempt(run, seed, i === 0 ? mode : 'redpoint', bundle, (r) => { if (r.attempt) frames.push(frameOf(r, ath)); });
    attempts.push({ frames, result: run.last_attempt! });
    if (run.last_attempt!.outcome === 'sent') break;
  }
  return attempts;
}

const di = Number(diArg);
const mode = modeArg as AttemptMode;
let best: ReturnType<typeof sequence> | null = null;
let bestScore = -Infinity;
for (let k = 0; k < 400; k++) {
  const seq = sequence(di, k, mode);
  const first = seq[0]!.result;
  const last = seq[seq.length - 1]!.result;
  const logs = seq.flatMap((x) => x.result.log);
  const dyn = logs.filter((m) => m.commit).length;
  const sketchy = logs.filter((m) => m.outcome === 'sketchy' || m.outcome === 'slip_recovered').length;
  // Two attempts: off high on the first (at the crux, ideally the dynamic move), sent on the second.
  const score = (seq.length === 2 ? 10 : 0) + (last.outcome === 'sent' ? 10 : 0) + 6 * first.progress
    + (first.log[first.log.length - 1]?.commit ? 4 : 0) + Math.min(1, dyn) * 2 + Math.min(3, sketchy);
  if (score > bestScore) { bestScore = score; best = seq; }
}
const seqBest = best!;
const holds = route.holds.map((h) => {
  const g = geom.holds.get(h.id)!;
  const seq = route.beta_line.findIndex((s) => s.hold === h.id);
  return {
    id: h.id, x: r3(h.x), y: r3(h.y), z: r3(g.z), type: h.type, size: h.size, orientation: h.orientation,
    hands: h.hands_ok, feet: h.feet_ok, start: Object.values(route.start).includes(h.id), finish: h.id === route.finish_hold, seq: seq >= 0 ? seq : null,
  };
});
const xs = holds.map((h) => h.x);
const scene = {
  source: {
    route: route.id, name: route.name, area: bundle.crags.get('fontainebleau')!.sectors.find((s) => s.id === route.area)?.name ?? route.area, crag: 'Fontainebleau',
    grade: fontGrade(route.di_graded), di: route.di_graded, climber_di: di, mode,
    note: route.signature
      ? 'A real problem: its holds and line are hand-authored and tuned to the canon grade (scripts/build-signatures.ts), not traced from the rock.'
      : 'A generated problem (docs/06) with a made-up name.',
  },
  wall: { segments: wall.map((s) => ({ y0: r3(s.y0), y1: r3(s.y1), angle: s.angle })), top: r3(top), x0: r3(Math.min(...xs) - 0.45), x1: r3(Math.max(...xs) + 0.45) },
  holds,
  line: route.beta_line.map((s) => ({ limb: s.limb, hold: s.hold, cls: s.class })),
  attempts: seqBest.map((x, i) => ({
    n: i + 1, mode: x.frames[0] ? (i === 0 ? mode : 'redpoint') : mode, frames: x.frames,
    result: { outcome: x.result.outcome, text: x.result.text, last: x.result.log[x.result.log.length - 1]?.text ?? '', progress: r3(x.result.progress) },
  })),
};
writeFileSync(out, JSON.stringify(scene));
for (const x of seqBest) {
  const evs = x.result.log.map((m) => `${m.kind}${m.cls ? `:${m.cls}` : ''}${m.outcome ? `=${m.outcome}` : ''}${m.commit ? `(${m.commit})` : ''}`).join(' ');
  console.log(`${x.frames.length} frames, ${x.result.outcome} at ${(100 * x.result.progress).toFixed(0)}%: ${evs}`);
}
console.log(`${route.name} ${fontGrade(route.di_graded)}, score ${bestScore.toFixed(2)}`);
