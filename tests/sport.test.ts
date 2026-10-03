// Sport climbing (P1b, docs/26): the rope, the sport generator, the grade engine on routes, attempts on a rope and the
// exit criterion's build swap (01 §4), on a reduced sample. `pnpm calibrate` runs the fuller sport checks.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { NamesSchema, ProfileSchema, RouteSchema } from '../src/data/schema';
import { atRoute, syntheticRun, tiltedBuilds } from '../src/harness/sim';
import { familiarity, registerRoute, simulateAttempt } from '../src/sim/attempt';
import { chalkNow, CHALK_RULE } from '../src/sim/engine';
import { evWalk, referenceAthlete, sendCurve, X_SEND } from '../src/sim/grade';
import { fontGrade, frenchGrade, gradeFor, ydsGrade } from '../src/sim/grades';
import { pumpForm, pumpHolds, reserveStart, sRef } from '../src/sim/resolve';
import { anchorOf, boltsOf, clipCost, fallLength, reachesGround, ropeKappa, slackM } from '../src/sim/rope';
import { generateSport, routeFromSeed, routeSeed, SPORT, sportMaxAngle } from '../src/sim/routes';
import type { AttemptResult } from '../src/sim/state';
import type { Route, WallSegment } from '../src/sim/types';
import { limbKind, routeGeom } from '../src/sim/wall';

const bundle = loadBundle();
const kal = bundle.crags.get('kalymnos')!;
const tufa = bundle.profiles.get('kalymnos_tufa_sport')!;
const sector = kal.sectors[0]!;
const route = generateSport({ crag: kal, sector, profile: tufa, di_target: 18, seed: 'test:sport:18', bundle });
registerRoute(route);

/** One attempt by `di`'s Reference Climber from a fresh project: the result, how far up the bolts it got, the modes it was in. */
function attempt(r: Route, di: number, seed: string): { res: AttemptResult; next: number; skipped: boolean; mode: string[] } {
  const run = syntheticRun(referenceAthlete(di), seed, bundle);
  atRoute(run, r);
  delete run.projects[r.id];
  let next = 0;
  let skipped = false;
  const mode: string[] = [];
  simulateAttempt(run, r.seed ?? r.id, 'redpoint', bundle, (st) => {
    const at = st.attempt;
    if (!at?.rope) return;
    next = Math.max(next, at.rope.next);
    skipped ||= at.rope.skipped;
    if (mode[mode.length - 1] !== at.mode) mode.push(at.mode);
  });
  return { res: run.last_attempt!, next, skipped, mode };
}

describe('the rope (05b §11)', () => {
  it('measures a fall from the last clip, with slack and stretch', () => {
    expect(slackM(100)).toBeCloseTo(0.3);
    expect(slackM(50)).toBeCloseTo(0.9);
    expect(fallLength(10, 8, 50)).toBeCloseTo(2 * 2 + 0.9 + 0.8);
    // Below the last clip only slack and stretch remain.
    expect(fallLength(10, 11, 50)).toBeCloseTo(0.9 + 0.8);
  });

  it('grades the consequence: ground contact, ledges and skipped clips', () => {
    const wall: WallSegment[] = [
      { y0: 0, y1: 17, angle: 100, feature: 'none' },
      { y0: 17, y1: 17.3, angle: 80, feature: 'ledge' },
      { y0: 17.3, y1: 30, angle: 100, feature: 'none' },
    ];
    const flat = { wall: [{ y0: 0, y1: 30, angle: 100, feature: 'none' as const }] };
    // Unclipped: the ground, as an unpadded boulder.
    expect(ropeKappa(flat, 4, null, 80, false)).toBeCloseTo(0.48);
    // 2.5 m above a clip at 1.5 m: the rope comes tight below the ground, so it is the same ground fall; from 6 m, deadly.
    expect(reachesGround(4, 1.5, 80)).toBe(true);
    expect(ropeKappa(flat, 4, 1.5, 80, false)).toBeCloseTo(0.48);
    expect(ropeKappa(flat, 6, 3, 80, false)).toBe(1);
    // Off the first move under a stick-clipped bolt: back on the ground from under a metre, which is nothing.
    expect(reachesGround(0.5, 3.2, 80)).toBe(true);
    expect(ropeKappa(flat, 0.5, 3.2, 80, false)).toBeLessThan(0.15);
    // A skipped clip still counts when the fall reaches the ground.
    expect(ropeKappa(flat, 0.5, 3.2, 80, true)).toBeGreaterThanOrEqual(0.3);
    // 2 m above a bolt at 18 m: a safe fall, until a ledge lies in its path or the last bolt was skipped.
    const safe = ropeKappa(flat, 20, 18, 80, false);
    expect(safe).toBeLessThan(0.15);
    expect(ropeKappa({ wall }, 20, 18, 80, false)).toBeCloseTo(safe + 0.4);
    expect(ropeKappa(flat, 20, 18, 80, true)).toBeCloseTo(safe + 0.3);
  });

  it('makes clipping cheaper with rope craft', () => {
    const a = referenceAthlete(18);
    const novice = clipCost({ ...a, a: { ...a.a, rope_craft: 0 } }, 'edge', 110);
    const expert = clipCost({ ...a, a: { ...a.a, rope_craft: 100 } }, 'edge', 110);
    expect(novice.time).toBeCloseTo(6);
    expect(expert.time).toBeCloseTo(3);
    expect(expert.pump).toBeLessThan(novice.pump);
    expect(clipCost(a, 'jug', 110).pump).toBeLessThan(clipCost(a, 'crimp', 110).pump);
  });
});

describe('sport generator (06 §2.6)', () => {
  it('builds a bolted route with an anchor at the top of its line', () => {
    expect(route.discipline).toBe('sport');
    expect(route.length_m).toBeGreaterThanOrEqual(tufa.length_m.min - 0.01);
    expect(route.length_m).toBeLessThanOrEqual(tufa.length_m.max + 0.01);
    const bolts = boltsOf(route);
    expect(bolts.length).toBeGreaterThanOrEqual(4);
    expect(bolts[0]!.y).toBeGreaterThanOrEqual(SPORT.firstBolt[0] - 1.3);
    expect(bolts[0]!.y).toBeLessThanOrEqual(SPORT.firstBolt[1]);
    const handHolds = new Set(route.beta_line.filter((s) => limbKind(s.limb) === 'hand').map((s) => s.hold));
    for (let i = 1; i < bolts.length; i++) expect(bolts[i]!.y).toBeGreaterThan(bolts[i - 1]!.y);
    for (const b of bolts) {
      expect(b.reach_from?.length ?? 0).toBeGreaterThan(0);
      for (const id of b.reach_from!) expect(handHolds.has(id)).toBe(true);
    }
    const anchor = anchorOf(route)!;
    expect(anchor.y).toBeCloseTo(route.length_m - 0.15);
    expect(anchor.reach_from).toEqual([route.finish_hold]);
    expect(route.style_tags).toContain('sport');
    expect(RouteSchema.safeParse(route).success).toBe(true);
  });

  it('lands near its target grade, on a wall no steeper than the grade allows (C1, reduced sample)', () => {
    expect(Math.abs(route.di_graded - 18)).toBeLessThanOrEqual(1);
    for (const w of route.wall) expect(w.angle).toBeLessThanOrEqual(sportMaxAngle(18) + 1e-9);
    expect(sportMaxAngle(10)).toBe(95);
    expect(sportMaxAngle(30)).toBe(150);
  });

  it('pairs its rests: two big holds in a row on the line', () => {
    const hands = route.beta_line.filter((s) => limbKind(s.limb) === 'hand').map((s) => route.holds.find((h) => h.id === s.hold)!);
    const big = (t: string) => t === 'jug' || t === 'horn';
    const pairs = hands.filter((h, i) => i > 0 && big(h.type) && h.size === 'l' && big(hands[i - 1]!.type) && hands[i - 1]!.size === 'l').length;
    expect(pairs).toBeGreaterThan(0);
  });

  it('regenerates from its seed (C4)', () => {
    const seed = routeSeed('kalymnos', sector.id, 2, 7, 16);
    expect(JSON.stringify(routeFromSeed(seed, bundle))).toBe(JSON.stringify(routeFromSeed(seed, bundle)));
  });
});

describe('the grade engine on a route (05c)', () => {
  it('has a send curve that rises through X_SEND once (C3)', () => {
    const curve = sendCurve(route, 12, 26, 0.5);
    let crossings = 0;
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]![1]).toBeGreaterThanOrEqual(curve[i - 1]![1] - 1e-9);
      if ((curve[i - 1]![1] < X_SEND) !== (curve[i]![1] < X_SEND)) crossings++;
    }
    expect(crossings).toBe(1);
  });

  it('walks the rope tactics: shakes on the rests, time on the wall, reserve spent', () => {
    const w = evWalk(routeGeom(route), referenceAthlete(route.di_graded));
    expect(w.time_s).toBeGreaterThan(200);
    expect(w.reserve).toBeLessThan(reserveStart(referenceAthlete(route.di_graded)));
    expect(w.pump_peak).toBeGreaterThan(40);
  });

  it('sizes the aerobic reserve from half a tank, and spreads the pump-out point (form on the day)', () => {
    expect(reserveStart(referenceAthlete(18))).toBeCloseTo(50 + 0.5 * sRef(18));
    expect(pumpHolds(50)).toBe(1);
    expect(pumpHolds(100)).toBeCloseTo(0.5, 2);
    expect(pumpHolds(130)).toBe(0);
    expect(pumpHolds(90)).toBeGreaterThan(pumpHolds(110));
    expect(pumpForm(0)).toBe(1);
    expect(pumpForm(9)).toBeCloseTo(100 / 125);
  });

  it('shows routes in French grades and boulders in Font grades (08)', () => {
    expect(frenchGrade(17)).toBe('7a');
    expect(frenchGrade(21)).toBe('7c');
    expect(ydsGrade(17)).toBe('5.11c/d');
    expect(gradeFor(17, 'sport')).toBe('7a');
    expect(gradeFor(17, 'boulder')).toBe(fontGrade(17));
  });
});

describe('attempts on a rope (07 §2)', () => {
  it('a climber well above the grade clips its way up and sends', () => {
    const { res, next, skipped } = attempt(route, route.di_graded + 4, 'strong');
    expect(res.outcome).toBe('sent');
    expect(res.tick?.style).toBe('onsight');
    expect(res.falls).toBe(0);
    expect(res.log[res.log.length - 1]!.text).toBe('Clipped the chains.');
    // The first bolt is stick-clipped and every other one clipped on the way: none passed.
    expect(next).toBe(boltsOf(route).length);
    expect(skipped).toBe(false);
  });

  it('a climber well below the grade falls on the rope, works the route and gets no tick', () => {
    const { res, mode } = attempt(route, route.di_graded - 4, 'weak');
    expect(res.outcome).not.toBe('sent');
    expect(res.tick).toBeUndefined();
    expect(res.falls).toBeGreaterThan(0);
    expect(mode).toContain('work');
    expect(res.kappa).toBeLessThan(1);
  });

  it('replays an attempt exactly from the same seed', () => {
    const a = attempt(route, route.di_graded, 'same').res;
    const b = attempt(route, route.di_graded, 'same').res;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('builds familiarity more slowly on a route than on a boulder (05b §12.2)', () => {
    const ath = referenceAthlete(18);
    const boulder = routeFromSeed(routeSeed('fontainebleau', 'bas_cuvier', 0, 1, 16), bundle);
    expect(familiarity(route, { attempt_eq: 4 }, ath)).toBeCloseTo(1 - Math.exp(-1));
    expect(familiarity(boulder, { attempt_eq: 4 }, ath)).toBeCloseTo(1 - Math.exp(-1.4));
    expect(familiarity(route, undefined, ath)).toBe(0);
  });

  it('chalks up when the chalk wears thin, pumped or not', () => {
    expect(chalkNow(CHALK_RULE.below - 1)).toBe(true);
    expect(chalkNow(CHALK_RULE.below)).toBe(false);
  });
});

describe('the P1b exit criterion (01 §4, reduced sample)', () => {
  it('a power build beats an endurance build on Font problems and loses on 35 m Kalymnos pitches', () => {
    const { power, endurance } = tiltedBuilds(18);
    const font = bundle.crags.get('fontainebleau')!;
    let fp = 0, fe = 0, kp = 0, ke = 0;
    for (let k = 0; k < 2; k++) {
      const fg = routeGeom(routeFromSeed(routeSeed('fontainebleau', font.sectors[k]!.id, 0, 9100 + k, 18), bundle));
      fp += evWalk(fg, power).p_send;
      fe += evWalk(fg, endurance).p_send;
      const ks = kal.sectors[k]!;
      const kg = routeGeom(generateSport({ crag: kal, sector: ks, profile: tufa, di_target: 18, seed: `c10:${ks.id}:${k}`, bundle, length_m: 35 }));
      kp += evWalk(kg, power).p_send;
      ke += evWalk(kg, endurance).p_send;
    }
    expect(fp).toBeGreaterThan(fe);
    expect(ke).toBeGreaterThan(kp);
  });
});

describe('schemas (docs/schemas.md)', () => {
  it('needs bolt and rest spacing on a bolted profile', () => {
    expect(ProfileSchema.safeParse(tufa).success).toBe(true);
    const { rest_spacing_m: _r, ...noRests } = tufa;
    expect(ProfileSchema.safeParse(noRests).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...tufa, protection: { kind: 'bolt' } }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...tufa, protection: { kind: 'bolt', spacing_m: 12 } }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...tufa, protection: { kind: 'cam', spacing_m: 3 } }).success).toBe(false);
  });

  it('knows the name banks’ languages', () => {
    const bank = bundle.names[tufa.name_bank]!;
    expect(NamesSchema.safeParse({ x: bank }).success).toBe(true);
    expect(NamesSchema.safeParse({ x: { ...bank, lang: 'de' } }).success).toBe(false);
  });
});
