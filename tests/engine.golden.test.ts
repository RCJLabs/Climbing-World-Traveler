// Golden test: the TypeScript engine must reproduce the worked examples of docs/05b §14 and the
// grade crossings of docs/05c §2.2, which were produced by an independent Python calculator.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fixture from './fixtures/python_engine.json';
import { NEUTRAL_MODS, refMass, type Athlete } from '../src/sim/character';
import {
  autoCommitPApex, diEquiv, evaluate, probs, recoveryChance, REFERENCE_CONDITIONS, sRef, STRETCH, type MoveSpec, type MoveState,
} from '../src/sim/resolve';
import { ALL_ATTRS, type AttrId, type Body, type Posture } from '../src/sim/types';
import { Q_CLASS } from '../src/sim/tables';

interface FxSpec { kind: 'hand' | 'foot'; type: string; size: string; quality: number; sharpness: number; angle: number; feature: string; cls: string; r: number; pq: number; posture: string }
interface FxRun { specs: FxSpec[]; p_send: number; moves: { margin: number; margin_c: number; MD: number; p_move: number }[] }
interface FxClimber { attr: Record<string, number>; body: Record<string, number | string> }

const ROCK_F: Record<string, number> = { font: 0.6, font_dyno: 0.6, font_dyno_fam83: 0.6, hueco: 0.58 };

function athlete(c: FxClimber): Athlete {
  const a = {} as Record<AttrId, number>;
  for (const id of ALL_ATTRS) a[id] = c.attr[id] ?? 0;
  const b = c.body;
  const body: Body = {
    sex: b.sex as 'm', age_start: 25, height_cm: b.height_cm as number,
    mass_kg: refMass('m', b.height_cm as number) + (b.mass_delta as number),
    body_fat_pct: b.body_fat_pct as number, ape_index: b.ape_index as number,
    finger_length: b.finger_length as number, finger_girth: b.finger_girth as number, leg_torso: b.leg_torso as number,
    natural_hip_mobility: 50, natural_shoulder_mobility: 50, fibre_bias: 0, tendon_robustness: 50,
    skin_thickness: b.skin_thickness as Body['skin_thickness'], skin_moisture: b.skin_moisture as Body['skin_moisture'],
  };
  return { body, a, mods: NEUTRAL_MODS, rock_knowledge: {} };
}

/** Mirror of the calculator's run_route: the spec-level EV walk of 05c §2.1. */
function walk(ath: Athlete, run: FxRun, friction: number, fam = 0, pqOverride?: (s: FxSpec) => number) {
  const ms: MoveState = { pump: 0, power: ath.a.anaerobic_capacity, focus_meter: ath.a.focus, overgrip: 0, under: 0, energy: 100, skin: 100, fam };
  let pSend = 1;
  const margins: number[] = [];
  for (const s of run.specs) {
    const spec: MoveSpec = {
      kind: s.kind, type: s.type as MoveSpec['type'], size: s.size as MoveSpec['size'], quality: s.quality, sharpness: s.sharpness,
      angle: s.angle, feature: s.feature as MoveSpec['feature'], cls: s.cls as MoveSpec['cls'], r: s.r,
      pq: pqOverride ? pqOverride(s) : s.pq, posture: s.posture as Posture, O: 0, friction, otherAnchors: 3, rock: 'x',
    };
    const e = evaluate(ath, spec, ms, REFERENCE_CONDITIONS);
    const dynamic = s.cls === 'deadpoint' || s.cls === 'dyno';
    const pA = dynamic ? autoCommitPApex(ath) : 0;
    const bonus = dynamic ? 0.4 * pA - 0.1 : 0;
    const p = probs(e.margin + bonus, e.T);
    const pRec = recoveryChance(ath, spec.kind, 3);
    const cost1 = e.pump_cost * (1 - 0.2 * pA);
    let p2 = 0;
    let cost2 = 0;
    if (p.slip > 0 && pRec > 0) {
      const e2 = evaluate(ath, spec, { ...ms, pump: ms.pump + 1.5 * cost1 }, REFERENCE_CONDITIONS);
      const q = probs(e2.margin + bonus, e2.T);
      p2 = q.clean + q.sketchy;
      cost2 = e2.pump_cost * (1 - 0.2 * pA);
    }
    pSend *= p.clean + p.sketchy + p.slip * pRec * p2;
    margins.push(e.margin);
    ms.pump += cost1 * (p.clean + 1.5 * p.sketchy + 1.5 * p.slip) + p.slip * pRec * cost2 * 1.25;
    ms.power = Math.max(0, ms.power - e.power_cost);
  }
  return { pSend, margins };
}

// The calculator used the original stretch penalty (Q × (1 − 0.1 × stretch)). The formulas are checked against it at
// that value; the examples at the current value are recorded at the end of this file from this engine.
const CALC_STRETCH = 0.1;
const CURRENT_STRETCH = STRETCH.q;
function atCalculatorTerms(): void {
  beforeAll(() => { STRETCH.q = CALC_STRETCH; });
  afterAll(() => { STRETCH.q = CURRENT_STRETCH; });
}

describe('DI scale (05c §1)', () => {
  it('anchors the Lattice benchmarks', () => {
    expect(sRef(16)).toBeCloseTo(28, 6);
    expect(sRef(21)).toBeCloseTo(51, 6);
    expect(sRef(24)).toBeCloseTo(64.8, 6);
    expect(sRef(29)).toBeCloseTo(87.8, 6);
    for (const di of [8, 10, 12.5, 16, 20.25, 29, 31]) expect(diEquiv(sRef(di))).toBeCloseTo(di, 9);
  });
});

describe('worked examples (05b §14) match the independent calculator', () => {
  atCalculatorTerms();
  const fx = fixture as unknown as Record<string, Record<string, FxRun> & { climber: FxClimber }>;
  const cases: [string, string, number][] = [
    ['A', 'font', 0.788], ['B', 'font', 0.0], ['B', 'font_dyno', 0.051], ['B', 'font_dyno_fam83', 0.134], ['A', 'hueco', 0.311],
  ];
  for (const [who, key, doc] of cases) {
    it(`${who} on ${key}: P_send ≈ ${doc}`, () => {
      const c = fx[who]!;
      const run = c[key]!;
      const fam = key.endsWith('fam83') ? 0.83 : 0;
      const { pSend, margins } = walk(athlete(c.climber), run, ROCK_F[key]!, fam);
      expect(pSend).toBeCloseTo(run.p_send, 2);
      expect(pSend).toBeCloseTo(doc, 2);
      run.moves.forEach((m, i) => expect(margins[i]! + 0.3 * fam).toBeCloseTo(m.margin + 0.3 * fam, 1));
    });
  }
});

describe('grade crossings (05c §2.2)', () => {
  atCalculatorTerms();
  const ref = (fixture as unknown as { reference: Record<string, { climber: FxClimber; font: FxRun; hueco: FxRun }> }).reference;
  for (const [di, row] of Object.entries(ref)) {
    it(`reference climber at DI ${di} matches on both problems`, () => {
      for (const key of ['font', 'hueco'] as const) {
        const run = row[key];
        const { pSend } = walk(athlete(row.climber), run, ROCK_F[key]!);
        // The engine applies two pump terms the calculator omitted (05b §5 posture_pump; §1 mantle ×1.2),
        // which shifts later pump_mod by a few thousandths. Anything beyond 0.01 is a real divergence.
        expect(Math.abs(pSend - run.p_send)).toBeLessThan(0.01);
      }
    });
  }

  it('interpolates the Font problem to DI 15.89 and the Hueco roof to 15.85', () => {
    const graded = (fixture as unknown as { graded: { font: number; hueco: number } }).graded;
    const base = ref['16.0']!;
    const gradeOf = (key: 'font' | 'hueco'): number => {
      let prev: [number, number] | null = null;
      for (let di = 8; di <= 33; di += 0.25) {
        const ath = athlete({ attr: Object.fromEntries(ALL_ATTRS.map((id) => [id, sRef(di)])), body: base.climber.body });
        for (const id of ['hip_mobility', 'shoulder_mobility', 'skin_durability', 'composure', 'focus', 'confidence', 'commitment', 'risk_judgement', 'resilience'] as const) ath.a[id] = 50;
        const pq = (s: FxSpec) => Q_CLASS[s.posture as Posture] * (0.95 + 0.1 * sRef(di) / 100) * (s.pq / (Q_CLASS[s.posture as Posture] * (0.95 + 0.1 * 28 / 100)));
        const p = walk(ath, base[key], ROCK_F[key]!, 0, pq).pSend;
        if (prev && prev[1] < 0.35 && p >= 0.35) return prev[0] + ((0.35 - prev[1]) / (p - prev[1])) * 0.25;
        prev = [di, p];
      }
      return NaN;
    };
    expect(gradeOf('font')).toBeCloseTo(graded.font, 1);
    expect(gradeOf('hueco')).toBeCloseTo(graded.hueco, 1);
    expect(graded.font).toBeCloseTo(15.89, 2);
    expect(graded.hueco).toBeCloseTo(15.85, 2);
  });
});

describe('worked examples without the stretch penalty (05b §14 note; recorded from this engine, not the calculator)', () => {
  const fx = fixture as unknown as Record<string, Record<string, FxRun> & { climber: FxClimber }>;
  // Same holds as the examples. Moves near full reach no longer lose up to 10% of EffectiveStat.
  const cases: [string, string, number][] = [['A', 'font', 0.832], ['B', 'font', 0], ['B', 'font_dyno', 0.082], ['B', 'font_dyno_fam83', 0.186], ['A', 'hueco', 0.311]];
  for (const [who, key, p] of cases) {
    it(`${who} on ${key}: P_send ≈ ${p}`, () => {
      const c = fx[who]!;
      const fam = key.endsWith('fam83') ? 0.83 : 0;
      expect(walk(athlete(c.climber), c[key]!, ROCK_F[key]!, fam).pSend).toBeCloseTo(p, 2);
    });
  }
});
