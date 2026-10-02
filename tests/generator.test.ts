// Route generator and grade-engine calibration (docs/05c §4, docs/06). A reduced sample runs in CI;
// `pnpm calibrate` runs the full C1 sweep.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { gradeRoute, sendCurve } from '../src/sim/grade';
import { generateBoulder, routeFromSeed, routeSeed } from '../src/sim/routes';
import { routeGeom } from '../src/sim/wall';

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
