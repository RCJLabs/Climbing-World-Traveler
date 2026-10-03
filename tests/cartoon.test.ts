// The cartoon wall (docs/25 §10). The body solved from the engine's points keeps hands and feet on their holds, limbs at
// their lengths and knees out of the rock; each problem gets its own block, built from its data, that holds its holds;
// every step animates from the engine's pose before it to the pose after it; the endings land where they should; the
// camera keeps the climber in frame and the view on the problem. Real attempts on the signatures and on generated
// problems of every shape.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { atRoute, syntheticRun } from '../src/harness/sim';
import { athleteOf, registerRoute, routeEntry, simulateAttempt } from '../src/sim/attempt';
import { referenceAthlete } from '../src/sim/grade';
import type { AttemptState } from '../src/sim/state';
import type { Route } from '../src/sim/types';
import { zOfY } from '../src/sim/wall';
import { buildBlock, faceEdges } from '../src/ui/wall/block';
import { frameFor, toScreen, yawFor, ZOOM_RANGE } from '../src/ui/wall/camera';
import { animateEnding, animateStep, bodyPoints3, endingMs, stepMs } from '../src/ui/wall/moves';
import { momentAt, playbackOf, touchedAt, type Playback } from '../src/ui/wall/playback';
import { dot3, KNEE_CLEAR, len3, LIMBS, mixBody, solve, STRETCH, sub3, type Body3, type Rock, type V3 } from '../src/ui/wall/rig';

const bundle = loadBundle();
const sigs = [...bundle.signatures.values()];
const bench = bundle.benchmarks.get('fontainebleau')!;
/** The signatures and every eighth benchmark: slabs, vertical walls, arêtes, overhangs and roofs. */
const routes: Route[] = [...sigs, ...bench.filter((_, i) => i % 8 === 0)];
for (const r of routes) registerRoute(r);

function attempt(route: Route, k: number, off: number): Playback {
  const seed = route.seed ?? route.id;
  const { geom } = routeEntry(seed, bundle);
  const run = syntheticRun(referenceAthlete(route.di_graded + off), `cartoon:${seed}:${k}`, bundle);
  atRoute(run, route);
  delete run.projects[route.id];
  const frames: AttemptState[] = [];
  simulateAttempt(run, seed, 'flash', bundle, (r) => { if (r.attempt) frames.push(structuredClone(r.attempt)); });
  return playbackOf(geom, athleteOf(run, bundle), frames, run.last_attempt!);
}
/** A likely send and a likely fall on each problem. */
const plays = routes.flatMap((r) => [attempt(r, 0, 1.5), attempt(r, 1, -2)]);
const T = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1];

/** How far a point is off the rock along its normal (negative: inside). */
const clearance = (rock: Rock, p: V3): number => dot3(sub3(p, [p[0], p[1], rock.z(p[1])]), rock.n(p[1]));
const samePoints = (a: Body3, b: Body3) => {
  bodyPoints3(a).forEach((p, i) => { for (let c = 0; c < 3; c++) expect(p[c]).toBeCloseTo(bodyPoints3(b)[i]![c]!, 9); });
};

describe('the attempts under test', () => {
  it('cover sends and falls, and every move class the problems use', () => {
    const outcomes = new Set(plays.map((p) => p.ending?.kind));
    expect(outcomes.has('send')).toBe(true);
    expect(outcomes.has('fall') || outcomes.has('pumped')).toBe(true);
    const classes = new Set(plays.flatMap((p) => p.steps.map((s) => s.cls)));
    for (const c of ['static', 'high_step', 'heel_hook', 'deadpoint', 'dyno'] as const) expect(classes.has(c)).toBe(true);
  });
});

describe('rig', () => {
  it('keeps every placed hand and foot exactly on its hold, mid-move as well', () => {
    for (const pb of plays) for (let i = 0; i < pb.bodies.length; i++) for (const t of T) {
      const m = momentAt(pb, i, t);
      const b = i === 0 ? pb.bodies[0]! : animateStep(pb.bodies[i - 1]!, pb.bodies[i]!, pb.steps[i]!, pb.rock, t).body;
      for (const l of LIMBS) if (b.on[l]) expect(len3(sub3(m.joints[l], b.ends[l]))).toBe(0);
    }
  });

  it('keeps the knees out of the rock', () => {
    let worst = Infinity;
    for (const pb of plays) for (let i = 0; i < pb.bodies.length; i++) for (const t of T) {
      const j = momentAt(pb, i, t).joints;
      for (const kn of [j.knL, j.knR]) worst = Math.min(worst, clearance(pb.rock, kn));
    }
    expect(worst).toBeGreaterThanOrEqual(KNEE_CLEAR - 1e-6);
  });

  it('keeps upper arms and thighs at their lengths, and stretches a limb no more than the cartoon allows', () => {
    for (const pb of plays) for (let i = 0; i < pb.bodies.length; i++) {
      const b = pb.bodies[i]!;
      const j = solve(b, pb.rock);
      const pairs: [V3, V3, V3, number, number][] = [
        [j.shL, j.elL, j.LH, 0.46 * b.arm, 0.54 * b.arm], [j.shR, j.elR, j.RH, 0.46 * b.arm, 0.54 * b.arm],
        [j.hipL, j.knL, j.LF, 0.5 * b.leg, 0.5 * b.leg], [j.hipR, j.knR, j.RF, 0.5 * b.leg, 0.5 * b.leg],
      ];
      for (const [root, mid, end, l1, l2] of pairs) {
        expect(len3(sub3(mid, root))).toBeCloseTo(l1, 6);
        expect(len3(sub3(end, root))).toBeLessThanOrEqual((l1 + l2) * STRETCH * 1.08);
      }
    }
  });
});

describe('block', () => {
  it('is the same block for the same problem every time, and a different one for another', () => {
    expect(buildBlock(sigs[0]!)).toEqual(buildBlock(sigs[0]!));
    expect(buildBlock(sigs[1]!).rows).not.toEqual(buildBlock(sigs[0]!).rows);
    expect(buildBlock(bench[0]!).palette).not.toEqual(buildBlock(bench[1]!).palette);
  });

  it('follows the problem’s wall profile to its top, and its face holds every hold', () => {
    for (const r of routes) {
      const b = buildBlock(r);
      expect(b.top).toBeCloseTo(r.wall[r.wall.length - 1]!.y1, 9);
      for (const row of b.rows) expect(row.z).toBeCloseTo(zOfY(r.wall, row.y), 9);
      for (const h of r.holds) {
        const [xl, xr] = faceEdges(b, h.y);
        expect(h.x).toBeGreaterThan(xl);
        expect(h.x).toBeLessThan(xr);
      }
      // The pads lie under the problem's pad zone.
      const zone = r.protection.find((p) => p.kind === 'pad_zone');
      if (zone?.x !== undefined) expect(Math.abs((b.pads[0]!.x0 + b.pads[1]!.x1) / 2 - zone.x)).toBeLessThan(0.05);
    }
  });

  it('puts an arête problem’s line on the block’s edge', () => {
    const r = routes.find((x) => x.wall.some((s) => s.feature === 'arete'))!;
    const b = buildBlock(r);
    const hx0 = Math.min(...r.holds.map((h) => h.x));
    expect(hx0 - b.rows[Math.floor(b.rows.length / 2)]!.xl).toBeLessThan(0.2);
  });
});

describe('moves', () => {
  it('start on the engine’s pose before each step and end on the pose after it', () => {
    for (const pb of plays) for (let i = 1; i < pb.bodies.length; i++) {
      const a = pb.bodies[i - 1]!, b = pb.bodies[i]!, s = pb.steps[i]!;
      samePoints(animateStep(a, b, s, pb.rock, 0).body, a);
      samePoints(animateStep(a, b, s, pb.rock, 1).body, b);
    }
  });

  it('carries a moving hand off the rock between holds, not along it', () => {
    let checked = 0;
    for (const pb of plays) for (let i = 1; i < pb.bodies.length; i++) {
      const s = pb.steps[i]!;
      if (s.kind !== 'move' || s.cls !== 'static' || (s.limb !== 'LH' && s.limb !== 'RH') || s.outcome !== 'clean') continue;
      const a = pb.bodies[i - 1]!, b = pb.bodies[i]!;
      if (len3(sub3(b.ends[s.limb], a.ends[s.limb])) < 0.15) continue;
      const mid = animateStep(a, b, s, pb.rock, 0.5).body.ends[s.limb];
      expect(clearance(pb.rock, mid)).toBeGreaterThan(0.02);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('lifts the hips through a dyno above where a static move would carry them', () => {
    let checked = 0;
    for (const pb of plays) for (let i = 1; i < pb.bodies.length; i++) {
      const s = pb.steps[i]!;
      if (s.cls !== 'dyno') continue;
      const a = pb.bodies[i - 1]!, b = pb.bodies[i]!;
      const dyno = animateStep(a, b, s, pb.rock, 0.5).body;
      const stat = animateStep(a, b, { ...s, cls: 'static' }, pb.rock, 0.5).body;
      expect(dyno.hip[1]).toBeGreaterThan(stat.hip[1]);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('plays each move for its own time, longer for the big ones and for slips', () => {
    expect(stepMs({ kind: 'move', limb: 'RH', cls: 'dyno' })).toBeGreaterThan(stepMs({ kind: 'move', limb: 'RH', cls: 'static' }));
    expect(stepMs({ kind: 'move', limb: 'RF', cls: 'high_step' })).toBeGreaterThan(stepMs({ kind: 'move', limb: 'RF', cls: 'static' }));
    expect(stepMs({ kind: 'move', limb: 'RH', cls: 'static', outcome: 'slip_recovered' })).toBeGreaterThan(stepMs({ kind: 'move', limb: 'RH', cls: 'static' }));
  });
});

describe('endings', () => {
  it('stand a send up on top of the block, and land a fall or a jump on the pads', () => {
    for (const pb of plays) {
      if (!pb.ending) continue;
      const last = pb.bodies[pb.bodies.length - 1]!;
      const end = animateEnding(last, pb.ending.kind, pb.places, pb.rock, 1, pb.ending.step);
      expect(endingMs(pb.ending.kind)).toBeGreaterThan(0);
      if (pb.ending.kind === 'send') {
        expect(end.mods.facingOut).toBe(true);
        expect(end.body.on.LF && end.body.on.RF).toBe(true);
        for (const f of ['LF', 'RF'] as const) expect(end.body.ends[f][1]).toBeCloseTo(pb.places.topStand[1], 6);
        expect(pb.places.topStand[1]).toBeGreaterThanOrEqual(pb.block.top);
      } else {
        expect(LIMBS.every((l) => !end.body.on[l])).toBe(true);
        expect(Math.abs(end.body.hip[0] - pb.places.pad[0])).toBeLessThan(1e-9);
        expect(end.body.hip[1]).toBeLessThan(0.5);
      }
    }
  });

  it('start from the last pose', () => {
    for (const pb of plays) {
      if (!pb.ending) continue;
      const last = pb.bodies[pb.bodies.length - 1]!;
      samePoints(mixBody(animateEnding(last, pb.ending.kind, pb.places, pb.rock, 0, pb.ending.step).body, last, 0), last);
    }
  });
});

describe('camera (17 §2)', () => {
  it('turns further round the block the steeper the problem', () => {
    expect(yawFor(90)).toBe(24);
    expect(yawFor(170)).toBe(56);
    for (let a = 70; a < 180; a += 5) expect(yawFor(a + 5)).toBeGreaterThanOrEqual(yawFor(a));
  });

  for (const [w, h] of [[390, 460], [360, 400], [800, 600]] as const) {
    it(`keeps the whole climber on a ${w}×${h} canvas at the default zoom`, () => {
      for (const pb of plays) for (let i = 0; i < pb.bodies.length; i++) {
        const m = momentAt(pb, i, 0.5);
        const S = toScreen(frameFor(m.focus, w, h, pb.bounds), w, h);
        for (const p of m.focus) {
          const [x, y] = S(p);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(w);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(h);
        }
      }
    });
  }

  it('zooms out no further than a little past the whole problem, and keeps the view on it however far it is dragged', () => {
    const pb = plays[0]!;
    const m = momentAt(pb, 1, 0.5);
    const b = pb.bounds;
    const whole = Math.min(390 / (b.maxX - b.minX), 460 / (b.maxY - b.minY));
    expect(frameFor(m.focus, 390, 460, b, ZOOM_RANGE[0]).scale).toBeGreaterThanOrEqual(0.8 * whole - 1e-9);
    expect(frameFor(m.focus, 390, 460, b, ZOOM_RANGE[1]).scale).toBeGreaterThan(frameFor(m.focus, 390, 460, b).scale);
    for (const pan of [[-50, 0], [50, 0], [0, -50], [0, 50]] as const) {
      const cam = frameFor(m.focus, 390, 460, b, 2, [pan[0], pan[1]]);
      const hw = 390 / 2 / cam.scale, hh = 460 / 2 / cam.scale;
      expect(cam.cx - hw).toBeGreaterThanOrEqual(b.minX - 1e-9);
      expect(cam.cx + hw).toBeLessThanOrEqual(b.maxX + 1e-9);
      expect(cam.cy - hh).toBeGreaterThanOrEqual(b.minY - 1e-9);
      expect(cam.cy + hh).toBeLessThanOrEqual(b.maxY + 1e-9);
    }
  });
});

describe('playback', () => {
  it('chalks each hold once it is held and keeps it chalked', () => {
    for (const pb of plays) {
      let prev = new Set<string>();
      for (let i = 0; i < pb.bodies.length; i++) for (const t of [0, 0.5, 1]) {
        const now = touchedAt(pb, i, t);
        for (const id of prev) expect(now.has(id)).toBe(true);
        prev = now;
      }
      expect(prev.size).toBe(pb.firstHeld.size);
    }
  });

  it('gives a finite body for every moment of every attempt, the ending included', () => {
    for (const pb of plays) {
      const moments = [...pb.steps.flatMap((_, i) => T.map((t) => momentAt(pb, i, t))), ...T.map((e) => momentAt(pb, 0, 0, e))];
      for (const m of moments) {
        for (const p of [m.joints.head, m.joints.knL, m.joints.knR, m.joints.elL, m.joints.elR, m.joints.hip, m.joints.sh]) expect(p.every(Number.isFinite)).toBe(true);
      }
    }
  });
});
