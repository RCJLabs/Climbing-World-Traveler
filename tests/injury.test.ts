// Injuries and illness (docs/13, 12 §5, 11 §4; P2 M2): the catalogue's rules, what an injury does (windows drawn
// once, climbing and training barred, site penalties fading to full load, ceiling losses kept, rehab, relapses), the
// careers it ends, the traits it grants, the plan around it, the rolls (falls, load against capacity, illness) and their
// replay.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { InjuryDefSchema } from '../src/data/schema';
import { validateContent } from '../src/data/validate';
import { modsOf } from '../src/sim/attempt';
import { ceilingFor } from '../src/sim/character';
import { rebuildCeilings } from '../src/sim/evolve';
import {
  acquireTraits, climbBlocker, countedInjuries, dailyIllnessRoll, endOfWeek, FALL_RISK, fallInjury, injuryOverlay, loadRisk, onset, RATE_SCALE, REHAB,
  trainBlocker,
} from '../src/sim/injury';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { stream } from '../src/sim/rng';
import { applyAction, canStartBlock, createRun, InvalidAction, replay, summarise } from '../src/sim/run';
import type { RunState } from '../src/sim/state';
import { plannedBlock, sessionTactic, simulateDays } from '../src/sim/tactics';
import { activityById } from '../src/sim/training';
import type { Action, InjuryDef, InjuryInstance, NewRunSpec } from '../src/sim/types';

const bundle = loadBundle();
const spec = presetSpec('dirtbag', DEFAULT_OPTIONS);
const runOf = (seed = 'inj', s: NewRunSpec = spec, opts: { unchecked?: boolean } = {}): RunState => createRun(seed, s, bundle, opts);
const def = (id: string): InjuryDef => bundle.injuries.get(id)!;
/** An injury begun on purpose, with its draws from a named stream. */
const hurt = (run: RunState, id: string, grade: 1 | 2 | 3, seed = 'x', cause: InjuryInstance['cause'] = 'load'): InjuryInstance =>
  onset(run, modsOf(run, bundle), def(id), grade, cause, stream('test', seed));
const sector = (run: RunState) => bundle.crags.get(run.crag)!.sectors[0]!.id;
/** The day loop as a player steps it, `n` days of rest. */
const restDays = (run: RunState, n: number) => {
  for (let d = 0; d < n && !run.ended; d++) {
    applyAction(run, { t: 'block_start', kind: 'rest' }, bundle);
    applyAction(run, { t: 'end_day' }, bundle);
  }
};

let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

describe('the catalogue (13 §2, schemas §7 and §9 rule 22)', () => {
  it('holds 13 §2\'s 24 injuries and the growth-plate variant; cold, heat and altitude wait for their systems', () => {
    expect(bundle.injuries.size).toBe(25);
    const later = [...bundle.injuries.values()].filter((d) => d.triggers.some((t) => t === 'cold' || t === 'heat' || t === 'altitude'));
    expect(later.map((d) => `${d.id}:${d.phase}${d.milestone ? `M${d.milestone}` : ''}`).sort()).toEqual([
      'altitude_illness:P4', 'frostbite:P4', 'heat_illness:P2M5', 'hypothermia:P4', 'skin_split:P2M5',
    ]);
    expect(validateContent().errors).toEqual([]);
  });

  it('rejects a grade out of order, a heal after full load, a career end below grade 3 and numbers without their roll', () => {
    const base = JSON.parse(JSON.stringify(def('a2_pulley'))) as InjuryDef;
    const bad = (edit: (d: InjuryDef) => void): string => {
      const d = JSON.parse(JSON.stringify(base)) as InjuryDef;
      edit(d);
      const r = InjuryDefSchema.safeParse(d);
      return r.success ? '' : r.error.issues.map((i) => i.message).join('; ');
    };
    expect(bad(() => {})).toBe('');
    expect(bad((d) => { d.severities.reverse(); })).toMatch(/ascending grade/);
    expect(bad((d) => { d.severities[0]!.heal_days = [50, 60]; })).toMatch(/heals before full load/);
    expect(bad((d) => { d.severities[1]!.career_ending = { chance: 0.1 }; })).toMatch(/only grade 3/);
    expect(bad((d) => { d.severities[2]!.permanent_ceiling_loss = { finger_strength: 2 }; })).toMatch(/negative/);
    expect(bad((d) => { delete d.load_base; })).toMatch(/load_base/);
    expect(bad((d) => { d.fall = { boulder: 0.1 }; })).toMatch(/fall weights/);
  });

  it('the validator: rehab is an activity, an acquired trait has a way in, a scoped illness multiplier names an illness', () => {
    dir = mkdtempSync(join(tmpdir(), 'cwt-inj-'));
    cpSync('data', dir, { recursive: true });
    const injuries = JSON.parse(readFileSync(`${dir}/injuries.json`, 'utf8')) as InjuryDef[];
    injuries.find((d) => d.id === 'lumbrical')!.rehab = ['rehab_toes'];
    writeFileSync(`${dir}/injuries.json`, JSON.stringify(injuries));
    const traits = JSON.parse(readFileSync(`${dir}/traits.json`, 'utf8')) as { id: string; acquire?: unknown; effect: { flags?: string[] } }[];
    delete traits.find((t) => t.id === 'injury_wise')!.acquire;
    traits.find((t) => t.id === 'iron_stomach')!.effect.flags = ['illness_mult:ankle_sprain=0.4'];
    writeFileSync(`${dir}/traits.json`, JSON.stringify(traits));
    expect(validateContent(dir).errors.sort()).toEqual([
      'injury lumbrical: unknown rehab activity rehab_toes',
      'trait injury_wise: an acquired trait needs an evolution to it or an acquire trigger',
      'trait iron_stomach: illness_mult:ankle_sprain=0.4 names no illness',
    ]);
  });
});

describe('what an injury does (13 §3)', () => {
  it('draws its windows once, in the data\'s ranges scaled by recovery, sleep, nutrition and age; Fast Healer is quicker', () => {
    const run = runOf();
    const i = hurt(run, 'a2_pulley', 2);
    const sev = def('a2_pulley').severities[1]!;
    const speed = run.attrs.sleep_hygiene.value && (0.75 + 0.5 * run.attrs.sleep_hygiene.value / 100) * (0.8 + 0.4 * run.attrs.nutrition.value / 100);
    const heal = i.day_heal - i.day_onset;
    expect(heal).toBeGreaterThanOrEqual(Math.floor(sev.heal_days[0] / speed) - 1);
    expect(heal).toBeLessThanOrEqual(Math.ceil((sev.heal_days[1] + 1) / speed) + 1);
    expect(i.day_full_load).toBeGreaterThanOrEqual(i.day_heal);
    expect(run.res.health).toBe(90);
    expect(run.journal.at(-1)).toMatchObject({ tone: 'bad' });
    expect(run.journal.at(-1)!.text).toMatch(/A2 pulley injury, grade 2\. No climbing until/);
    const quick = runOf('inj', { ...spec, traits: [...spec.traits, 'fast_healer'] }, { unchecked: true });
    const j = hurt(quick, 'a2_pulley', 2);
    expect(j.day_heal - j.day_onset).toBeLessThan(heal);
  });

  it('a grade-2 injury bars climbing and the training that loads its site until it heals; grade 1 only costs', () => {
    const run = runOf();
    hurt(run, 'ankle_sprain', 1);
    expect(canStartBlock(run, 'climb', sector(run), bundle).ok).toBe(true);
    const i = hurt(run, 'a2_pulley', 2);
    const check = canStartBlock(run, 'climb', sector(run), bundle);
    expect(check).toMatchObject({ ok: false });
    expect(!check.ok && check.reason).toMatch(/A2 pulley injury: no climbing until/);
    expect(climbBlocker(run)).toBe(i);
    expect(trainBlocker(run, activityById('max_hangs')!, bundle)).toBe(i);
    expect(trainBlocker(run, activityById('weights')!, bundle)).toBeNull();
    expect(trainBlocker(run, activityById('rehab_fingers')!, bundle)).toBeNull();
    // On its heal day it climbs again.
    run.day = i.day_heal;
    expect(climbBlocker(run)).toBeNull();
  });

  it('costs its site\'s holds grade × 25% until it heals, fading to nothing at full load: crimps first, jugs last', () => {
    const run = runOf();
    const i = hurt(run, 'a2_pulley', 2);
    const o = injuryOverlay(run, bundle)!;
    expect(o.hold_mult.crimp).toBeCloseTo(0.5, 9);
    expect(o.hold_mult.jug).toBeCloseTo(1 - 0.5 * 0.3, 9);
    run.day = i.day_heal + Math.round((i.day_full_load - i.day_heal) / 2);
    const mid = injuryOverlay(run, bundle)!;
    expect(mid.hold_mult.crimp).toBeCloseTo(1 - 0.5 * (i.day_full_load - run.day) / (i.day_full_load - i.day_heal), 9);
    run.day = i.day_full_load;
    expect(injuryOverlay(run, bundle)).toBeNull();
  });

  it('a grade 3 takes ceiling points for good: a rebuild on a birthday keeps them off', () => {
    const run = runOf();
    const before = run.attrs.finger_strength.ceiling;
    hurt(run, 'a2_pulley', 3);
    expect(run.attrs.finger_strength.ceiling).toBe(before - 3);
    expect(run.ceiling_loss).toEqual({ finger_strength: -3, tech_crimps: -2 });
    run.day = 365;
    rebuildCeilings(run, bundle);
    expect(run.attrs.finger_strength.ceiling).toBe(ceilingFor('finger_strength', run.body, run.traits, bundle.traits, Math.floor(run.body.age_start + 1)) - 3);
  });

  it('rehab twice a week brings the heal day forward with sports physio near; skipping it makes full load later and a relapse likelier', () => {
    const done = runOf('rehab');
    const skip = runOf('rehab');
    const a = hurt(done, 'capsulitis', 2, 'same');
    const b = hurt(skip, 'capsulitis', 2, 'same');
    expect([a.day_heal, a.day_full_load]).toEqual([b.day_heal, b.day_full_load]);
    const heal0 = a.day_heal;
    const full0 = b.day_full_load;
    for (let d = 0; d < 120 && done.day < done.injuries[0]!.day_heal; d++) {
      if (done.day % 7 === 1 || done.day % 7 === 4) applyAction(done, { t: 'block_start', kind: 'train', target: 'rehab_fingers' }, bundle);
      else applyAction(done, { t: 'block_start', kind: 'rest' }, bundle);
      applyAction(done, { t: 'end_day' }, bundle);
    }
    expect(done.injuries[0]!.day_heal).toBeLessThan(heal0);
    expect(done.injuries[0]!.day_heal - a.day_onset).toBeGreaterThanOrEqual(Math.floor((1 - REHAB.heal_cut) * (heal0 - a.day_onset)) - 1);
    expect(done.injuries[0]!.neglected).toBeUndefined();
    restDays(skip, b.day_heal - skip.day + 1);
    expect(skip.injuries[0]).toMatchObject({ neglected: true, day_full_load: full0 + Math.round(REHAB.neglect_full * (full0 - b.day_heal)) });
    expect(skip.journal.some((j) => /skipped rehab/.test(j.text))).toBe(true);
  });
});

describe('careers it ends (11 §4, P2 M2)', () => {
  const at = (age: number) => runOf(`age${age}`, { ...spec, background: 'desk_job_late_starter', body: { ...spec.body, age_start: age } }, { unchecked: true });

  it('a second grade 3 of the same injury at 30 or over ends the career at the end of its day; at 29 it does not', () => {
    const old = at(31);
    hurt(old, 'labrum_slap', 3, 'a');
    expect(old.injuries[0]!.career_ending).toBeUndefined();
    const second = hurt(old, 'labrum_slap', 3, 'b');
    expect(second.career_ending).toBe(true);
    expect(second.cause).toBe('load');
    applyAction(old, { t: 'end_day' }, bundle);
    expect(old.ended).toMatchObject({ end_reason: 'forced_injury', injuries: 2 });
    expect(old.journal.some((j) => /ends the climbing/.test(j.text))).toBe(true);
    const young = at(29);
    hurt(young, 'labrum_slap', 3, 'a');
    expect(hurt(young, 'labrum_slap', 3, 'b').career_ending).toBeUndefined();
  });

  it('a grade 3 of another structure at the same site does not end it', () => {
    const old = at(31);
    hurt(old, 'rotator_cuff', 3, 'a');
    expect(hurt(old, 'labrum_slap', 3, 'b').career_ending).toBeUndefined();
    applyAction(old, { t: 'end_day' }, bundle);
    expect(old.ended).toBeNull();
  });

  it('a grade-3 back is spinal and ends the career about three times in ten', () => {
    let ended = 0;
    for (let k = 0; k < 400; k++) if (hurt(runOf('spine'), 'lower_back', 3, `s${k}`).career_ending) ended++;
    expect(ended / 400).toBeGreaterThan(0.24);
    expect(ended / 400).toBeLessThan(0.36);
  });
});

describe('traits it grants (03 §1.8) and the summary (11 §5, 16 §6)', () => {
  it('a healed grade-2 pulley injury makes a Pulley Veteran; three healed grade-2+ injuries, Injury Wise', () => {
    const run = runOf();
    const rj = run.attrs.risk_judgement.value;
    const i = hurt(run, 'a4_pulley', 2);
    acquireTraits(run, bundle);
    expect(run.traits).not.toContain('pulley_veteran');
    run.day = i.day_heal - 1;
    acquireTraits(run, bundle);
    expect(run.traits).toContain('pulley_veteran');
    expect(run.attrs.risk_judgement.value).toBeCloseTo(Math.min(run.attrs.risk_judgement.ceiling, rj + 3), 9);
    expect(run.journal.at(-1)!.text).toMatch(/New trait: Pulley Veteran/);
    for (const id of ['ankle_sprain', 'lower_back']) { const j = hurt(run, id, 2); run.day = Math.max(run.day, j.day_heal); }
    acquireTraits(run, bundle);
    expect(run.traits).toContain('injury_wise');
  });

  it('a lingering TFCC tear leaves a Glass Wrist, and the wrist ceiling with it', () => {
    let k = 0;
    let run = runOf();
    for (; k < 50 && !hurt(run, 'tfcc', 2, `w${k}`).lingering; k++) run = runOf();
    expect(k).toBeLessThan(50);
    const ceiling = run.attrs.tech_slopers.ceiling;
    acquireTraits(run, bundle);
    expect(run.traits).toContain('glass_wrist');
    expect(run.attrs.tech_slopers.ceiling).toBe(ceiling - 3);
  });

  it('counts grade 2+ injuries, not grade 1, skin or illness, at −4 each in the score', () => {
    const run = runOf();
    const clean = summarise(run, 'retired', bundle);
    hurt(run, 'a2_pulley', 2); hurt(run, 'ankle_sprain', 1); hurt(run, 'flapper', 2); hurt(run, 'common_cold', 2); hurt(run, 'tfcc', 3);
    expect(countedInjuries(run, bundle)).toBe(2);
    const s = summarise(run, 'retired', bundle);
    expect(s.injuries).toBe(2);
    expect(s.score).toBeCloseTo(clean.score - 8, 5);
  });
});

describe('the plan around an injury (docs/24 §2, P2 M2)', () => {
  it('turns a climbing day the injury bars into its rehab, and a training day that loads it; back on the rock it climbs mileage', () => {
    const run = runOf();
    while (run.plan.days[run.day % 7]!.main.kind !== 'climb') restDays(run, 1);
    const i = hurt(run, 'a2_pulley', 2);
    expect(plannedBlock(run, bundle)).toEqual({ kind: 'train', activity: 'rehab_fingers' });
    run.day = i.day_heal;
    const project = (day: number) => { const m = run.plan.days[day % 7]!.main; return m.kind === 'climb' && m.tactic === 'project'; };
    while (!project(run.day)) run.day++;
    expect(sessionTactic(run)).toBe('volume');
    run.day = i.day_full_load + 7 - ((i.day_full_load - run.day) % 7 + 7) % 7;
    expect(sessionTactic(run)).toBe('project');
  });

  it('an attempt while barred is refused', () => {
    const run = runOf();
    applyAction(run, { t: 'block_start', kind: 'climb', target: sector(run) }, bundle);
    hurt(run, 'a2_pulley', 2);
    const seed = run.block!.session!.slots[0]!.seed;
    expect(() => applyAction(run, { t: 'attempt', route_seed: seed, mode: 'onsight' }, bundle)).toThrow(InvalidAction);
  });
});

describe('the rolls (13 §5)', () => {
  /** One boulder fall of consequence κ, keyed `k`, through the engine's roll: whether it injured. */
  const fall = (c: RunState, kappa: number, k: number): boolean => !!fallInjury(c, modsOf(c, bundle), bundle, 'boulder', kappa, ['t', k]);
  /** Falls of consequence κ rolled on fresh copies of one climber, keyed apart: how many injure. */
  const falls = (run: RunState, kappa: number, n: number): number => {
    let hits = 0;
    for (let k = 0; k < n; k++) if (fall(structuredClone(run), kappa, k)) hits++;
    return hits;
  };

  it('a fall injures more the worse it is, the same each time for the same fall; Lucky fewer, Unlucky more', () => {
    const saved = FALL_RISK.boulder.a;
    FALL_RISK.boulder.a = 1;
    try {
      const run = runOf();
      expect(fall(structuredClone(run), 0, 1)).toBe(false);
      const one = structuredClone(run);
      const two = structuredClone(run);
      for (let k = 0; k < 60; k++) expect(fall(one, 0.3, k)).toBe(fall(two, 0.3, k));
      expect(one.injuries).toEqual(two.injuries);
      const low = falls(run, 0.1, 600);
      const high = falls(run, 0.5, 600);
      expect(high).toBeGreaterThan(2 * low);
      const lucky = runOf('inj', { ...spec, traits: [...spec.traits, 'lucky'] }, { unchecked: true });
      const unlucky = runOf('inj', { ...spec, traits: [...spec.traits, 'unlucky'] }, { unchecked: true });
      const nl = falls(lucky, 0.5, 600);
      const nu = falls(unlucky, 0.5, 600);
      expect(nl).toBeLessThan(high);
      expect(nu).toBeGreaterThan(high);
    } finally {
      FALL_RISK.boulder.a = saved;
    }
  });

  it('load against capacity: a steady week is safe, a spike is not, and a comeback after three weeks off is no spike', () => {
    const steady = Array(28).fill(8);
    expect(loadRisk(steady, 8)).toMatchObject({ m: 1 });
    expect(loadRisk([...Array(21).fill(8), ...Array(7).fill(18)], 8).m).toBeGreaterThanOrEqual(2.8);
    const comeback = [...Array(7).fill(8), ...Array(14).fill(0), ...Array(7).fill(7)];
    expect(loadRisk(comeback, 8).ratio).toBeLessThan(1.3);
    // Without the capacity the same weeks read as a spike (12 §5's ratio alone).
    expect(loadRisk(comeback, 0.1).ratio).toBeGreaterThan(1.5);
    // Steady load above what the tendons have adapted to costs too.
    expect(loadRisk(Array(28).fill(12), 8).m).toBeCloseTo(1 + 0.8 * 0.5, 9);
  });

  it('a week\'s load roll and a day\'s illness roll are the same on replay; Never Sick catches fewer colds', () => {
    const saved = { ...RATE_SCALE };
    Object.assign(RATE_SCALE, { load: 30, illness: 10 });
    try {
      let a = 0;
      let b = 0;
      for (let k = 0; k < 400; k++) {
        const r = runOf(`ill${k}`);
        r.day = 40 + k;
        if (dailyIllnessRoll(r, modsOf(r, bundle), bundle)) a++;
        const n = runOf(`ill${k}`, { ...spec, traits: [...spec.traits, 'never_sick'] }, { unchecked: true });
        n.day = 40 + k;
        if (dailyIllnessRoll(n, modsOf(n, bundle), bundle)) b++;
      }
      expect(b).toBeLessThan(0.75 * a);
      const w1 = runOf('week');
      const w2 = runOf('week');
      for (const w of [w1, w2]) { w.counters.loads = Array(28).fill(9); w.counters.finger_loads = Array(28).fill(6); w.day = 34; endOfWeek(w, modsOf(w, bundle), bundle); }
      expect(w1.injuries).toEqual(w2.injuries);
    } finally {
      Object.assign(RATE_SCALE, saved);
    }
  }, 20_000);

  it('a career that gets hurt replays exactly from its log', () => {
    const saved = { ...RATE_SCALE };
    Object.assign(RATE_SCALE, { load: 20, move: 20 });
    try {
      const run = runOf('replay-hurt');
      const log: Action[] = simulateDays(run, bundle, 120);
      expect(run.injuries.length).toBeGreaterThan(0);
      expect(replay([{ t: 'new_run', seed: 'replay-hurt', spec }, ...log], bundle)).toEqual(run);
    } finally {
      Object.assign(RATE_SCALE, saved);
    }
  }, 30_000);
});
