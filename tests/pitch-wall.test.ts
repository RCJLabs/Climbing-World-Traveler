// The cartoon wall on a pitch (docs/25 §10.8). The cliff is built from the route; the rope runs from the belayer through
// the quickdraws the engine clipped, in order, to the climber; every rope step (a clip, a fall and the catch, a take, a
// pull-through) starts and ends on the engine's poses; a fall drops the engine's fall length and never into the ground;
// a lower ends standing at the foot of the route; the camera keeps the climber in frame and can show the whole route;
// routine moves play quickly, so a pitch plays in about a minute at 1×. Real attempts on the Kalymnos benchmarks.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { atRoute, syntheticRun } from '../src/harness/sim';
import type { Athlete } from '../src/sim/character';
import { athleteOf, registerRoute, routeEntry, simulateAttempt } from '../src/sim/attempt';
import { referenceAthlete } from '../src/sim/grade';
import { BELAY_QUALITY, fallLength } from '../src/sim/rope';
import type { AttemptState, MoveReport } from '../src/sim/state';
import type { Route } from '../src/sim/types';
import { bodyPoints, yOfS, zOfY, type RouteGeom } from '../src/sim/wall';
import { faceEdges } from '../src/ui/wall/block';
import { frameFor, toScreen } from '../src/ui/wall/camera';
import { spreadShared, stepMs } from '../src/ui/wall/moves';
import { beatAt, planStep, type PitchEnv } from '../src/ui/wall/pitch';
import { DWELL_MS, freshOf, momentAt, playbackOf, poseAt, stepOf, type Playback } from '../src/ui/wall/playback';
import { bodyOf, len3, LIMBS, sub3, type Body3, type V3 } from '../src/ui/wall/rig';

const bundle = loadBundle();
const bench = bundle.benchmarks.get('kalymnos')!;
for (const r of bench) registerRoute(r);
/** The three signature pitches and every fourth benchmark: slabby, vertical and steep routes, tufas and corners, 5a to 8c. */
const routes: Route[] = [...[...bundle.signatures.values()].filter((r) => r.discipline === 'sport'), ...bench.filter((_, i) => i % 4 === 0)];

interface Play { route: Route; geom: RouteGeom; ath: Athlete; pb: Playback; frames: AttemptState[] }

function attempt(route: Route, off: number, k = 0): Play {
  const seed = route.seed ?? route.id;
  const { geom } = routeEntry(seed, bundle);
  const run = syntheticRun(referenceAthlete(route.di_graded + off), `pitch:${seed}:${k}`, bundle);
  atRoute(run, route);
  delete run.projects[route.id];
  const ath = athleteOf(run, bundle);
  const frames: AttemptState[] = [];
  simulateAttempt(run, seed, 'flash', bundle, (r) => { if (r.attempt) frames.push(structuredClone(r.attempt)); });
  return { route, geom, ath, pb: playbackOf(geom, ath, frames, run.last_attempt!), frames };
}

/** A likely send, a likely fall or two, and a struggle on each route. */
const plays = routes.flatMap((r) => [attempt(r, 1.5), attempt(r, -1.5), attempt(r, -3)]);
const T = [0, 0.25, 0.5, 0.75, 1];
const near = (a: V3, b: V3) => len3(sub3(a, b));
const points = (b: Body3): V3[] => [b.sh, b.hip, ...LIMBS.map((l) => b.ends[l])];
const samePose = (a: Body3, b: Body3) => {
  points(a).forEach((p, i) => { for (let c = 0; c < 3; c++) expect(p[c]).toBeCloseTo(points(b)[i]![c]!, 6); });
};
const planned = (p: Play) => p.pb.plans.map((plan, i) => ({ plan, i })).filter((x) => x.plan);
const entriesOf = (p: Play, i: number): MoveReport[] => freshOf(p.frames[i - 1]!.log, p.frames[i]!.log);
const total = (pb: Playback) => pb.ms.reduce((s, m) => s + m, 0) + pb.dwell.reduce((s, m) => s + m, 0) + (pb.ending?.ms ?? 0);

describe('the attempts under test', () => {
  it('cover sends and worked routes to the chains, falls the rope holds, clips and a fall to the ground', () => {
    const endings = new Set(plays.map((p) => p.pb.ending?.kind));
    for (const k of ['chains', 'fall', 'ground'] as const) expect(endings.has(k)).toBe(true);
    // At the chains: sent (the fist in the air) or worked.
    const chains = plays.filter((p) => p.pb.ending?.kind === 'chains').map((p) => p.pb.ending!.plan!.beats.some((b) => b.kind === 'sent'));
    expect(chains).toContain(true);
    expect(chains).toContain(false);
    const kinds = new Set(plays.flatMap((p) => planned(p).flatMap(({ i }) => entriesOf(p, i).map((e) => (e.kind === 'move' ? `move:${e.outcome}` : e.kind)))));
    for (const k of ['clip', 'fall', 'take', 'move:fall']) expect(kinds.has(k)).toBe(true);
  });
});

describe('the cliff', () => {
  it('is a buttress as tall as the route with a headwall over the anchor, a row at every change of angle, no pads', () => {
    for (const { route, pb } of plays.filter((_, i) => i % 3 === 0)) {
      const b = pb.block;
      const top = route.wall[route.wall.length - 1]!.y1;
      expect(b.pitch).toBe(true);
      expect(b.top).toBeGreaterThan(top + 1);
      expect(b.pads).toHaveLength(0);
      for (const s of route.wall) if (s.y0 < b.top - 0.6) expect(b.rows.some((r) => Math.abs(r.y - s.y0) < 1e-9)).toBe(true);
      for (const r of b.rows) expect(r.z).toBeCloseTo(zOfY(b.wall, r.y), 9);
      for (const h of route.holds) {
        const [xl, xr] = faceEdges(b, h.y);
        expect(h.x).toBeGreaterThan(xl);
        expect(h.x).toBeLessThan(xr);
      }
      // The left margin stays narrow, so the buttress's side (the profile) is next to the climber.
      const hx0 = Math.min(...route.holds.map((h) => h.x));
      expect(hx0 - b.rows[1]!.xl).toBeLessThan(0.95);
    }
  });
});

describe('the rope', () => {
  it('starts on the stick-clipped first bolt and clips the engine’s bolts in order, never unclipping one', () => {
    for (const { pb, frames } of plays) {
      expect(pb.clips[0]).toEqual([0]);
      for (let i = 1; i < frames.length; i++) {
        for (const b of pb.clips[i - 1]!) expect(pb.clips[i]).toContain(b);
        // Generated routes are bolted so no line passes a bolt: every bolt below the next is clipped.
        expect(pb.clips[i]).toHaveLength(frames[i]!.rope!.next);
      }
    }
  });

  it('runs from the belayer through each clipped quickdraw, in order up the route, to the climber', () => {
    for (const { pb } of plays) {
      const hw = pb.pitch!;
      for (let i = 0; i < pb.steps.length; i += 3) for (const t of [0, 0.5, 1]) {
        const m = momentAt(pb, i, t);
        const rope = m.pitch!.rope;
        expect(near(rope[0]!, m.pitch!.belayer.hip)).toBeLessThan(0.4);
        expect(near(rope[rope.length - 1]!, m.joints.hip)).toBeLessThan(0.3);
        let at = 0;
        for (const b of [...m.pitch!.clipped].sort((x, y) => x - y)) {
          const k = rope.findIndex((p, j) => j > at && near(p, hw.bolts[b]!.biner) < 1e-9);
          expect(k).toBeGreaterThan(at);
          at = k;
        }
        for (const b of m.pitch!.clipped) expect(m.pitch!.draws.has(b)).toBe(true);
      }
    }
  });
});

describe('rope steps', () => {
  it('start on the engine’s pose before the step and end on the pose after it', () => {
    let n = 0;
    for (const p of plays) for (const { i } of planned(p)) {
      samePose(poseAt(p.pb, i, 0).body, p.pb.bodies[i - 1]!);
      samePose(poseAt(p.pb, i, 1).body, p.pb.bodies[i]!);
      n++;
    }
    expect(n).toBeGreaterThan(50);
  });

  it('drop a fall the engine’s fall length, never into the ground, and hang under the top quickdraw', () => {
    let n = 0;
    for (const p of plays) for (const { plan, i } of planned(p)) {
      const es = entriesOf(p, i);
      if (es[0]?.kind !== 'move' || es[0].outcome !== 'fall' || !es.some((e) => e.kind === 'fall')) continue;
      const before = p.frames[i - 1]!;
      const comY = yOfS(p.route.wall, bodyPoints(p.geom, p.ath, before.climb).CoM.s);
      const len = fallLength(comY, before.rope!.last_clip_y!, BELAY_QUALITY);
      const k = p.pb.bodies[i - 1]!.k;
      const fall = plan!.beats.find((x) => x.kind === 'fall')!;
      const start = fall.pose(0).body.hip[1];
      let low = Infinity;
      for (let u = 0; u <= 1; u += 0.002) low = Math.min(low, fall.pose(u).body.hip[1]);
      // The feet stop short of the ground (a fall off the first moves only sags onto the rope).
      expect(low).toBeGreaterThanOrEqual(Math.min(start, 0.8 * k) - 1e-9);
      expect(Math.abs(low - Math.max(start - len, Math.min(start, 0.8 * k)))).toBeLessThan(0.1);
      // It ends hanging under the top quickdraw, not beside it.
      const hang = fall.pose(1).body.hip;
      const top = Math.max(...p.pb.clips[i - 1]!.map((b) => p.pb.pitch!.bolts[b]!.y));
      expect(hang[1]).toBeLessThan(top);
      n++;
    }
    expect(n).toBeGreaterThan(10);
  });

  it('take: the climber sits back onto the rope, hangs, and is back on the holds it left', () => {
    const p = plays.find((x) => x.frames.length > 40)!;
    const i = 30;
    const env: PitchEnv = { geom: p.geom, ath: p.ath, rock: p.pb.rock, pitch: p.pb.pitch!, bodyOf: (c) => spreadShared(bodyOf(p.geom, p.ath, c)), stepOf: (m) => stepOf(m, p.geom) };
    const f = p.frames[i]!;
    const plan = planStep(env, {
      entries: [{ kind: 'take', pump_delta: 0, text: 'Take!' }], a: p.pb.bodies[i]!, climb: f.climb, after: { body: p.pb.bodies[i]!, climb: f.climb },
      clipped: p.pb.clips[i]!, lastClipY: f.rope!.last_clip_y, next: f.rope!.next,
    })!;
    samePose(beatAt(plan, 0).beat.pose(0).body, p.pb.bodies[i]!);
    samePose(beatAt(plan, 1).beat.pose(1).body, p.pb.bodies[i]!);
    // Mid-plan, off the holds and on the tight rope.
    const mid = beatAt(plan, 0.4);
    const an = mid.beat.pose(mid.u);
    expect(an.body.on.LH || an.body.on.RH).toBe(false);
    expect(mid.beat.rope(mid.u, an).tight).toBe(1);
  });

  it('lower: the climber is lowered past the quickdraws and stands at the foot of the route, beside the belayer', () => {
    const p = plays.find((x) => x.frames.length > 80)!;
    const i = 60;
    const env: PitchEnv = { geom: p.geom, ath: p.ath, rock: p.pb.rock, pitch: p.pb.pitch!, bodyOf: (c) => spreadShared(bodyOf(p.geom, p.ath, c)), stepOf: (m) => stepOf(m, p.geom) };
    const f = p.frames[i]!;
    const plan = planStep(env, {
      entries: [{ kind: 'lower', pump_delta: 0, text: 'Lowered off.' }], a: p.pb.bodies[i]!, climb: f.climb, after: null,
      clipped: p.pb.clips[i]!, lastClipY: f.rope!.last_clip_y, next: f.rope!.next, outcome: 'jumped',
    })!;
    const end = beatAt(plan, 1).beat.pose(1).body;
    expect(end.ends.LF[1]).toBeCloseTo(0, 6);
    expect(end.ends.RF[1]).toBeCloseTo(0, 6);
    expect(near(end.ends.LF, p.pb.pitch!.ground)).toBeLessThan(0.3);
    expect(near(end.hip, p.pb.pitch!.belay)).toBeGreaterThan(0.8);
  });

  it('end every route attempt at the foot of the route: lowered off the chains or after a fall, or fallen to the ground', () => {
    for (const { pb } of plays) {
      const m = momentAt(pb, 0, 0, 1);
      expect(Math.min(m.joints.LF[1], m.joints.RF[1], m.joints.hip[1])).toBeLessThan(0.1);
      expect(m.joints.hip[1]).toBeLessThan(1.2);
    }
  });
});

describe('the camera on a pitch', () => {
  it('keeps the climber, and the quickdraw a fall swings under, in frame on a phone at the default zoom', () => {
    for (const { pb } of plays) for (let i = 0; i < pb.steps.length; i += pb.plans[i] ? 1 : 5) for (const t of pb.plans[i] ? T : [0.5]) {
      const m = momentAt(pb, i, t);
      const S = toScreen(frameFor(m.focus, 390, 460, pb.bounds, 1, [0, 0], pb.frameMin), 390, 460);
      for (const p of m.focus) {
        const [x, y] = S(p);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(390);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(460);
      }
    }
  });

  it('zooms out as far as the whole route', () => {
    for (const { pb } of plays.slice(0, 6)) {
      const b = pb.bounds;
      const whole = Math.min(390 / (b.maxX - b.minX), 460 / (b.maxY - b.minY));
      const m = momentAt(pb, Math.floor(pb.steps.length / 2), 0.5);
      expect(frameFor(m.focus, 390, 460, b, pb.zoomMin, [0, 0], pb.frameMin).scale).toBeLessThanOrEqual(whole + 1e-9);
    }
  });
});

describe('pacing', () => {
  it('plays a send in about a minute at 1×', () => {
    const sends = plays.filter((p) => p.pb.ending?.kind === 'chains').map((p) => total(p.pb) / 1000).sort((a, b) => a - b);
    expect(sends.length).toBeGreaterThan(4);
    expect(sends[Math.floor(sends.length / 2)]!).toBeGreaterThan(30);
    expect(sends[Math.floor(sends.length / 2)]!).toBeLessThan(90);
  });

  it('plays routine moves quicker than on a boulder, and the rope’s steps and dynamic moves in full', () => {
    for (const { pb } of plays) pb.steps.forEach((s, i) => {
      if (i === 0) return;
      if (pb.plans[i]) expect(pb.ms[i]).toBe(pb.plans[i]!.ms);
      else if (s.routine) expect(pb.ms[i]).toBeLessThan(stepMs(s));
      else if (s.cls === 'dyno' || s.cls === 'deadpoint' || s.outcome === 'slip_recovered') expect(pb.ms[i]).toBe(stepMs(s));
    });
  });

  it('leaves a boulder’s pace as it was', () => {
    const font = bundle.benchmarks.get('fontainebleau')![0]!;
    registerRoute(font);
    const p = attempt(font, 1.5);
    expect(p.pb.pitch).toBeNull();
    p.pb.steps.forEach((s, i) => {
      if (i === 0) return;
      expect(p.pb.plans[i]).toBeNull();
      expect(p.pb.ms[i]).toBe(stepMs(s));
      expect(p.pb.dwell[i]).toBe(DWELL_MS);
    });
  });
});

describe('every moment of a pitch', () => {
  it('is finite: the climber, the belayer and the rope, the ending included', () => {
    for (const { pb } of plays) {
      const moments = [...pb.steps.flatMap((_, i) => (pb.plans[i] || i % 7 === 0 ? T.map((t) => momentAt(pb, i, t)) : [])), ...T.map((e) => momentAt(pb, 0, 0, e))];
      for (const m of moments) {
        for (const p of [m.joints.head, m.joints.knL, m.joints.knR, m.joints.hip, ...m.pitch!.rope, m.pitch!.belayer.head, m.pitch!.belayer.knL]) expect(p.every(Number.isFinite)).toBe(true);
      }
    }
  });
});
