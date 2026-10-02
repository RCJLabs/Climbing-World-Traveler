// Wall view camera and pose (17 §2): the climber stays in frame, zoom is bounded, the view stays on the problem,
// and the motion curves start and end where the engine says the body is.
import { describe, expect, it } from 'vitest';
import { referenceAthlete } from '../src/sim/grade';
import type { Hold, Route } from '../src/sim/types';
import { routeGeom, type ClimbState } from '../src/sim/wall';
import { drop, fallenPose, frameFor, lerpPose, LIMBS, poseOf, toScreen, wallBounds, ZOOM_RANGE, type Pose } from '../src/ui/wall/pose';

const hold = (id: string, x: number, y: number): Hold => ({
  id, x, y, type: 'edge', size: 'm', quality: 0.5, orientation: 0, sharpness: 0.3, friction: 0.6, polish: 0,
  hands_ok: true, feet_ok: true, hidden: false, rest_value: 0.2,
});

/** A 1.5 m vertical start into a 135° roof, 4 m of rock in all. */
const geom = routeGeom({
  id: 't', wall: [{ y0: 0, y1: 1.5, angle: 90, feature: 'none' }, { y0: 1.5, y1: 4, angle: 135, feature: 'none' }],
  holds: [hold('lh', -0.3, 1.9), hold('rh', 0.3, 2.0), hold('lf', -0.2, 0.6), hold('rf', 0.25, 0.7), hold('top', 0, 3.9)],
} as unknown as Route);
const ath = referenceAthlete(16);
const st: ClimbState = { anchors: { LH: 'lh', RH: 'rh', LF: 'lf', RF: 'rf' }, posture: 'hang', feet_cut: false };
const pose = poseOf(geom, ath, st);
const bounds = wallBounds(geom);
const points = (p: Pose) => [p.sh, p.hip, ...LIMBS.map((l) => p.ends[l])];

describe('camera (17 §2)', () => {
  for (const [w, h] of [[390, 460], [360, 400], [800, 600]] as const) {
    it(`keeps the whole climber on a ${w}×${h} canvas at the default zoom`, () => {
      const S = toScreen(frameFor(pose, w, h, bounds), w, h);
      for (const p of points(pose)) {
        const [x, y] = S(...p);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(w);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(h);
      }
    });
  }

  it('zooms out no further than a little past the whole problem', () => {
    const whole = Math.min(390 / (bounds.maxX - bounds.minX), 460 / (bounds.maxY - bounds.minY));
    expect(frameFor(pose, 390, 460, bounds, ZOOM_RANGE[0]).scale).toBeGreaterThanOrEqual(0.8 * whole - 1e-9);
    expect(frameFor(pose, 390, 460, bounds, ZOOM_RANGE[1]).scale).toBeGreaterThan(frameFor(pose, 390, 460, bounds).scale);
  });

  it('keeps the view on the problem however far it is dragged', () => {
    for (const pan of [[-50, 0], [50, 0], [0, -50], [0, 50]] as const) {
      const cam = frameFor(pose, 390, 460, bounds, 2, [pan[0], pan[1]]);
      const hw = 390 / 2 / cam.scale;
      const hh = 460 / 2 / cam.scale;
      expect(cam.cx - hw).toBeGreaterThanOrEqual(bounds.minX - 1e-9);
      expect(cam.cx + hw).toBeLessThanOrEqual(bounds.maxX + 1e-9);
      expect(cam.cy - hh).toBeGreaterThanOrEqual(bounds.minY - 1e-9);
      expect(cam.cy + hh).toBeLessThanOrEqual(bounds.maxY + 1e-9);
    }
  });
});

describe('motion', () => {
  const moved = poseOf(geom, ath, { ...st, anchors: { ...st.anchors, RH: 'top' } });

  it('starts and ends on the engine poses, with the moving limb off the straight line mid-move', () => {
    for (const cls of ['static', 'dyno'] as const) {
      const a = lerpPose(pose, moved, 0, { limb: 'RH', cls });
      const b = lerpPose(pose, moved, 1, { limb: 'RH', cls });
      for (const [p, q] of [[a, pose], [b, moved]] as const) {
        points(p).forEach((pt, i) => { expect(pt[0]).toBeCloseTo(points(q)[i]![0], 9); expect(pt[1]).toBeCloseTo(points(q)[i]![1], 9); });
      }
    }
    const mid = lerpPose(pose, moved, 0.5, { limb: 'RH', cls: 'static' });
    const straight = lerpPose(pose, moved, 0.5);
    expect(mid.ends.RH[0]).toBeLessThan(straight.ends.RH[0]);
  });

  it('lifts the body through a dyno and not through a static move', () => {
    const dyno = lerpPose(pose, moved, 0.5, { limb: 'RH', cls: 'dyno' });
    const stat = lerpPose(pose, moved, 0.5, { limb: 'RH', cls: 'static' });
    expect(dyno.sh[1] - stat.sh[1]).toBeCloseTo(0.22 * pose.k, 9);
  });

  it('drops a fall from rest and lands it before the ending is over', () => {
    expect(drop(0)).toBe(0);
    expect(drop(0.65)).toBe(1);
    expect(drop(1)).toBe(1);
    const fallen = fallenPose(pose);
    expect(fallen.hip[1]).toBeLessThan(pose.hip[1]);
    expect(LIMBS.every((l) => !fallen.on[l])).toBe(true);
  });
});
