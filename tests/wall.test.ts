// Body model (docs/05a §4.2): where the shoulder sits decides how far a free hand reaches.
import { describe, expect, it } from 'vitest';
import { REFERENCE_BODY, referenceAthlete } from '../src/sim/grade';
import type { Hold, Route } from '../src/sim/types';
import type { Athlete } from '../src/sim/character';
import { bodyPoints, freeState, LOCKOFF, lockDepth, routeGeom, type ClimbState } from '../src/sim/wall';

const hold = (id: string, x: number, y: number): Hold => ({
  id, x, y, type: 'edge', size: 'm', quality: 0.5, orientation: 0, sharpness: 0.3, friction: 0.6, polish: 0,
  hands_ok: true, feet_ok: true, hidden: false, rest_value: 0.2,
});

/** A vertical wall (s = y) with both hands at 2.0 m and both feet at `feet` m. */
function geomWithFeet(feet: number) {
  const route = {
    id: 't', wall: [{ y0: 0, y1: 4, angle: 90, feature: 'none' }],
    holds: [hold('lh', -0.2, 2.0), hold('rh', 0.2, 2.0), hold('lf', -0.2, feet), hold('rf', 0.2, feet)],
  } as unknown as Route;
  return routeGeom(route);
}

const ath = referenceAthlete(16);
const st: ClimbState = { anchors: { LH: 'lh', RH: 'rh', LF: 'lf', RF: 'rf' }, posture: 'hang', feet_cut: false };
// Reference body, 170 cm: leg 0.799 m, torso 0.680 m, so standing on the feet puts the shoulder 1.331 m above them.
const STAND = LOCKOFF.stand * (0.799 + 0.68);

describe('lock-off (05a §4.2)', () => {
  it('raises the shoulder to a bent-arm lock below the holding hand when the feet are low', () => {
    const bp = bodyPoints(geomWithFeet(0.5), ath, freeState(st, 'RH'));
    // Body centre midway between hand (2.0) and feet (0.5) would put the shoulder at 1.40.
    expect(bp.shoulder.s).toBeCloseTo(2.0 - LOCKOFF.ref, 2);
  });

  it('never lowers a shoulder that already sits above the lock', () => {
    const bp = bodyPoints(geomWithFeet(1.4), ath, freeState(st, 'RH'));
    expect(bp.shoulder.s).toBeCloseTo(0.5 * (2.0 + 1.4) + 0.15, 2);
  });

  it('stops at standing height above the feet', () => {
    const bp = bodyPoints(geomWithFeet(0.2), ath, freeState(st, 'RH'));
    expect(bp.shoulder.s).toBeCloseTo(0.2 + STAND, 2);
  });

  it('does nothing with both hands on', () => {
    const bp = bodyPoints(geomWithFeet(0.5), ath, st);
    expect(bp.shoulder.s).toBeCloseTo(0.5 * (2.0 + 0.5) + 0.15, 2);
  });

  it('gives the Reference Climber one reach at every DI (05c §1.1)', () => {
    const at = (di: number) => bodyPoints(geomWithFeet(0.5), referenceAthlete(di), freeState(st, 'RH')).shoulder.s;
    expect(at(10)).toBeCloseTo(at(24), 9);
  });

  it('lets a real climber lock deeper with more lockoff', () => {
    const { lock_depth_m: _pinned, ...body } = REFERENCE_BODY;
    const climber = (lockoff: number): Athlete => ({ ...ath, body, a: { ...ath.a, lockoff } });
    expect(lockDepth(climber(0))).toBeCloseTo(LOCKOFF.depth[0], 9);
    expect(lockDepth(climber(100))).toBeCloseTo(LOCKOFF.depth[1], 9);
    const sh = (lockoff: number) => bodyPoints(geomWithFeet(0.5), climber(lockoff), freeState(st, 'RH')).shoulder.s;
    expect(sh(60) - sh(20)).toBeCloseTo((LOCKOFF.depth[0] - LOCKOFF.depth[1]) * 0.4, 2);
  });
});
