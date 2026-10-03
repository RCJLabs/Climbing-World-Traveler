// Route generator and grade-engine calibration (docs/05c §4, docs/06). A reduced sample runs in CI;
// `pnpm calibrate` runs the full C1 sweep.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { applyMove, prepareMove } from '../src/sim/engine';
import { gradeRoute, referenceAthlete, sendCurve, startState } from '../src/sim/grade';
import { cruxIndexes, generateBoulder, lineRobust, profileFor, routeFromSeed, routeSeed, TRACE } from '../src/sim/routes';
import { athleteOf } from '../src/sim/attempt';
import { PRESETS, presetSpec } from '../src/sim/presets';
import { createRun } from '../src/sim/run';
import type { Athlete } from '../src/sim/character';
import type { Route } from '../src/sim/types';
import { ProfileSchema } from '../src/data/schema';
import { stream } from '../src/sim/rng';
import { bodyPoints, COMPRESSION_WIDTH, dist, freeState, limbKind, otherHand, reachRadius, routeGeom, sOfY, WRONG_SIDE_M, yOfS } from '../src/sim/wall';

const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
const sector = crag.sectors.find((s) => s.id === 'bas_cuvier')!;

describe('generator', () => {
  it('is deterministic from the seed (C4)', () => {
    const seed = routeSeed('fontainebleau', 'bas_cuvier', 12, 3, 16);
    const a = routeFromSeed(seed, bundle);
    const b = routeFromSeed(seed, bundle);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.id).toMatch(/^proc_/);
    expect(a.seed).toBe(seed);
  });

  it('lands generated problems near their target grade (C1, reduced sample)', () => {
    let within1 = 0;
    let within05 = 0;
    let n = 0;
    for (const profileId of ['font_sloper_slab', 'font_sloper_bulge', 'font_roof']) {
      const profile = bundle.profiles.get(profileId)!;
      for (const di of [10, 13, 16, 19, 22]) {
        for (let k = 0; k < 2; k++) {
          const r = generateBoulder({ crag, sector, profile, di_target: di, seed: `c1:${profileId}:${di}:${k}`, bundle });
          n++;
          if (Math.abs(r.di_graded - di) <= 1.0) within1++;
          if (Math.abs(r.di_graded - di) <= 0.5) within05++;
        }
      }
    }
    expect(within1 / n).toBeGreaterThanOrEqual(0.85);
    expect(within05 / n).toBeGreaterThanOrEqual(0.6);
  });

  it('produces non-decreasing send curves with one crossing (C3)', () => {
    for (const di of [12, 17, 21]) {
      const r = generateBoulder({ crag, sector, profile: bundle.profiles.get('font_sloper_bulge')!, di_target: di, seed: `c3:${di}`, bundle });
      const curve = sendCurve(r, 8, 30, 0.5);
      for (let i = 1; i < curve.length; i++) expect(curve[i]![1]).toBeGreaterThanOrEqual(curve[i - 1]![1] - 1e-9);
    }
  });

  it('keeps holds legible: at least 0.17 m apart on the surface (06 §3 L2)', () => {
    for (let k = 0; k < 6; k++) {
      const r = generateBoulder({ crag, sector, profile: bundle.profiles.get('font_sloper_slab')!, di_target: 14, seed: `l2:${k}`, bundle });
      const g = routeGeom(r);
      const list = g.list;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i]!.x - list[j]!.x, list[i]!.s - list[j]!.s);
          expect(d, `${list[i]!.id}/${list[j]!.id} in ${r.name}`).toBeGreaterThanOrEqual(0.17);
        }
      }
    }
  });
});

describe('line shape (06 §2.3, 22 §2)', () => {
  it('keeps generated problems to Font length', () => {
    const hands: number[] = [];
    const feet: number[] = [];
    for (const profileId of ['font_sloper_slab', 'font_sloper_bulge', 'font_roof']) {
      const profile = bundle.profiles.get(profileId)!;
      for (const di of [10, 15, 20]) {
        for (let k = 0; k < 4; k++) {
          const r = generateBoulder({ crag, sector, profile, di_target: di, seed: `len:${profileId}:${di}:${k}`, bundle });
          const n = r.beta_line.filter((s) => s.limb.endsWith('H') && s.class !== 'mantle').length;
          expect(n).toBeGreaterThanOrEqual(TRACE.minHandMoves);
          hands.push(n);
          feet.push(r.beta_line.filter((s) => s.limb.endsWith('F')).length);
        }
      }
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    expect(median(hands)).toBeLessThanOrEqual(7);
    // With the lock-off body model the feet no longer have to chase every hand move.
    expect(median(feet)).toBeLessThanOrEqual(median(hands));
  });

  it('picks a crux even when the preferred third of a short line is empty', () => {
    expect(cruxIndexes([4], 'mid', stream('crux')).size).toBe(1);
    expect(cruxIndexes([], 'mid', stream('crux')).size).toBe(0);
  });
});

describe('margin from legality and posture edges (06 §2.3, C5)', () => {
  const m = TRACE.legalMargin;
  const shifts = [[m, 0], [-m, 0], [0, m], [0, -m]] as const;
  const routes = ['font_sloper_slab', 'font_sloper_bulge', 'font_roof'].flatMap((id) =>
    [11, 17, 23].map((di) => generateBoulder({ crag, sector: crag.sectors.find((s) => s.style_profiles.includes(id))!, profile: bundle.profiles.get(id)!, di_target: di, seed: `edge:${id}:${di}`, bundle })));

  it('starts with the hands inside the compression width by the margin', () => {
    for (const r of routes) {
      const [lh, rh] = [r.start.LH, r.start.RH].map((id) => r.holds.find((h) => h.id === id)!);
      expect(Math.abs(rh!.x - lh!.x)).toBeLessThanOrEqual(COMPRESSION_WIDTH - 2 * m + 1e-9);
    }
  });

  it('keeps every move legal, with its class and the posture after it, when its hold moves by the margin', () => {
    for (const r of routes) {
      const ath = referenceAthlete(r.di_target);
      let st = startState(routeGeom(r), ath);
      for (const step of r.beta_line) {
        if (step.class === 'mantle') break;
        const geom = routeGeom(r);
        const after = applyMove(geom, ath, st, step.limb, step.hold, step.class).posture;
        const hold = r.holds.find((h) => h.id === step.hold)!;
        const otherId = st.anchors[otherHand(step.limb)];
        if (otherId && otherId !== hold.id) {
          // Twice the margin from the wrong-side line, which lies between two holds.
          const other = r.holds.find((h) => h.id === otherId)!;
          const lim = WRONG_SIDE_M[limbKind(step.limb)];
          const room = step.limb === 'RH' || step.limb === 'RF' ? hold.x - (other.x - lim) : other.x + lim - hold.x;
          expect(room).toBeGreaterThanOrEqual(2 * m - 1e-9);
        }
        const { x, y } = hold;
        for (const [dx, ds] of shifts) {
          hold.x = x + dx;
          hold.y = yOfS(r.wall, sOfY(r.wall, y) + ds);
          const g = routeGeom(r);
          expect(prepareMove(g, ath, st, step.limb, step.hold, step.class), `${r.name} ${step.limb}→${step.hold}`).not.toBeNull();
          expect(applyMove(g, ath, st, step.limb, step.hold, step.class).posture).toBe(after);
        }
        hold.x = x;
        hold.y = y;
        st = applyMove(geom, ath, st, step.limb, step.hold, step.class);
      }
    }
  });
});

describe('style ceilings (06 §2.1)', () => {
  // Bas Cuvier has the slab (to DI 21) and bulge (to DI 25) profiles, no roof.
  const ids = (di: number) => new Set(Array.from({ length: 40 }, (_, k) => profileFor(sector, di, bundle, stream('pf', di, k)).id));

  it('uses every profile below the lowest ceiling', () => {
    expect(ids(15)).toEqual(new Set(['font_sloper_slab', 'font_sloper_bulge']));
  });

  it('leaves out a profile above its ceiling', () => {
    expect(ids(23)).toEqual(new Set(['font_sloper_bulge']));
  });

  it('falls back to the profile that reaches highest when none can', () => {
    expect(ids(28)).toEqual(new Set(['font_sloper_bulge']));
  });

  it('rejects a ceiling outside the DI scale (validator rule)', () => {
    const slab = bundle.profiles.get('font_sloper_slab')!;
    expect(ProfileSchema.safeParse({ ...slab, di_max: 21 }).success).toBe(true);
    expect(ProfileSchema.safeParse({ ...slab, di_max: 40 }).success).toBe(false);
  });
});

describe('signature problems (C7)', () => {
  for (const r of bundle.signatures.values()) {
    it(`${r.name} grades within ±1.0 of its canonical DI ${r.di_target}`, () => {
      const g = gradeRoute(r);
      expect(g.di).not.toBeNull();
      expect(Math.abs(g.di! - r.di_target)).toBeLessThanOrEqual(1.0);
    });
  }
  it('ships the three P1a problems', () => {
    expect([...bundle.signatures.values()].map((r) => r.name).sort()).toEqual(['La Marie-Rose', 'Le Toit du Cul de Chien', 'Rainbow Rocket']);
  });
});

describe('reach for every body (06 §2.3, 22 §2)', () => {
  /** Each static hand move of a line for `ath`: its relative reach, and whether static is legal for this body. */
  function statics(r: Route, ath: Athlete): { rel: number; legal: boolean }[] | null {
    const g = routeGeom(r);
    let st = startState(g, ath);
    const out: { rel: number; legal: boolean }[] = [];
    for (const s of r.beta_line) {
      const want = prepareMove(g, ath, st, s.limb, s.hold, s.class);
      const p = want ?? (s.class === 'mantle' ? null : prepareMove(g, ath, st, s.limb, s.hold));
      if (!p) return null;
      if (limbKind(s.limb) === 'hand' && s.class === 'static') {
        const bp = bodyPoints(g, ath, freeState(st, s.limb));
        out.push({ rel: dist(bp.shoulder, g.holds.get(s.hold)!) / reachRadius(ath, 'hand', st.posture), legal: !!want });
      }
      st = applyMove(g, ath, st, s.limb, s.hold, p.cls);
    }
    return out;
  }
  const easy = ['fontainebleau', 'kalymnos'].flatMap((c) => bundle.benchmarks.get(c)!.filter((r) => r.di_target <= 12));

  it(`traces lines at ${TRACE.reachScale} of the Reference Climber's reach`, () => {
    const rel = easy.flatMap((r) => statics(r, referenceAthlete(r.di_graded))!.map((x) => x.rel));
    expect(rel.filter((x) => x <= TRACE.reachScale + 0.02).length / rel.length).toBeGreaterThan(0.95);
  });

  it('lets every preset climb easy lines statically, the 163 cm Slab Wizard too, with no foothold out of reach', () => {
    for (const p of PRESETS) {
      const ath = athleteOf(createRun('reach', presetSpec(p.id), bundle), bundle);
      const all = easy.map((r) => statics(r, ath));
      expect(all.filter((x) => x === null).length, `${p.id}: lines it cannot finish`).toBe(0);
      const moves = all.flatMap((x) => x ?? []);
      expect(moves.filter((x) => !x.legal).length / moves.length, `${p.id}: static moves out of reach`).toBeLessThan(0.05);
    }
  });

  it('rejects a finished line with a hold on the edge of the reach (lineRobust)', () => {
    const r: Route = structuredClone(bundle.benchmarks.get('fontainebleau')!.find((x) => x.di_target === 14)!);
    const ath = referenceAthlete(r.di_target);
    expect(lineRobust(r, ath)).toBe(true);
    // Move the first static hand hold out along the shoulder line until it sits 1 cm inside full reach.
    const g = routeGeom(r);
    let st = startState(g, ath);
    for (const s of r.beta_line) {
      if (limbKind(s.limb) === 'hand' && s.class === 'static') {
        const sh = bodyPoints(g, ath, freeState(st, s.limb)).shoulder;
        const R = reachRadius(ath, 'hand', st.posture);
        const h = r.holds.find((x) => x.id === s.hold)!;
        const hg = g.holds.get(s.hold)!;
        const k = (R - 0.01) / dist(sh, hg);
        h.x = sh.x + (hg.x - sh.x) * k;
        h.y = yOfS(r.wall, sh.s + (hg.s - sh.s) * k);
        break;
      }
      st = applyMove(g, ath, st, s.limb, s.hold, prepareMove(g, ath, st, s.limb, s.hold, s.class)!.cls);
    }
    expect(lineRobust(r, ath)).toBe(false);
  });
});
