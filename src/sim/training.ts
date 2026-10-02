// Training and adaptation (docs/12, 02 §B.2). Three clocks, the per-session gain formula, technique XP per
// move, detraining, tendon pending release, and the P1a training activities available around Fontainebleau
// (gym tier 2 via the Paris region, 12 §8).

import { ageAdaptMult, attrGroup, clamp, type Mods } from './character';
import type { AttrId, Attributes, Body, Difficulty } from './types';

export type Clock = 'neural' | 'muscle' | 'tendon';

/** Which clock an attribute trains on (12 §2). Finger strength is split 40 % neural / 60 % tendon. */
export function clockOf(id: AttrId): Clock {
  if (id === 'skin_durability') return 'tendon';
  if (['pull_power', 'core_tension', 'leg_power', 'finger_endurance', 'aerobic_capacity', 'anaerobic_capacity', 'hip_mobility', 'shoulder_mobility'].includes(id)) return 'muscle';
  return 'neural';
}

/** Gain per unit of stimulus by clock (12 §3); 5/6 of the original 0.09 / 0.045 / 0.03, set with DIMINISH_EXP. **(tune)** */
const K_CLOCK: Record<Clock, number> = { neural: 0.075, muscle: 0.0375, tendon: 0.025 };
const ADAPT_DIFFICULTY: Record<Difficulty, number> = { story: 1.15, standard: 1.0, hard: 0.9 };

export interface GainContext {
  attrs: Attributes;
  body: Body;
  mods: Mods;
  age: number;
  day: number;
  stoke: number;
  difficulty: Difficulty;
  sleep_mult: number;
  nutrition_mult: number;
}

export const stokeMult = (stoke: number): number => (stoke < 20 ? 0.5 : stoke > 80 ? 1.1 : 1.0);

/**
 * Ceiling approach for stimulus and technique XP, `(1 − value/ceiling)^DIMINISH_EXP` (12 §3). At 1.5 careers
 * flattened to +0.5 DI a year by year four with attributes at half their ceilings; at 0.5, with the gain rates cut
 * to 5/6, years three and four keep about 1 DI a year (doc 22 §5). **(tune)**
 */
export const DIMINISH_EXP = 0.5;

/** Tendon-clock half-time in days (12 §2, 11 §3). */
export function tendonHalfTime(age: number, tendonRobustness: number): number {
  return 90 * (1 + Math.max(0, age - 25) / 20) * (1.2 - 0.4 * tendonRobustness / 100);
}

/** Apply one session's stimulus (12 §3). Tendon gains go to `pending`. Mutates `ctx.attrs`; returns realised gains. */
export function applyStimulus(ctx: GainContext, stim: Partial<Record<AttrId, number>>): Partial<Record<AttrId, number>> {
  const out: Partial<Record<AttrId, number>> = {};
  const life = ctx.sleep_mult * ctx.nutrition_mult;
  for (const [id, s] of Object.entries(stim) as [AttrId, number][]) {
    if (!s || s <= 0) continue;
    const st = ctx.attrs[id];
    const rate = ageAdaptMult(id, ctx.age) * (ctx.mods.adapt_rate_mult[id] ?? 1) * ADAPT_DIFFICULTY[ctx.difficulty];
    const diminish = Math.pow(Math.max(0, 1 - (st.value + st.pending) / st.ceiling), DIMINISH_EXP);
    const base = s * rate * life * stokeMult(ctx.stoke) * diminish;
    if (s >= 3) st.last_stim_day = ctx.day;
    if (id === 'finger_strength') {
      const neural = base * 0.4 * K_CLOCK.neural;
      const tendon = base * 0.6 * K_CLOCK.tendon;
      st.value = Math.min(st.ceiling, st.value + neural);
      st.pending += tendon;
      out[id] = neural;
      continue;
    }
    const clock = clockOf(id);
    const g = base * K_CLOCK[clock];
    if (clock === 'tendon') st.pending += g;
    else st.value = Math.min(st.ceiling, st.value + g);
    out[id] = g;
  }
  return out;
}

/** Base technique XP per move (02 §B.2 proposes 0.06; the P1a harness put a full-time year at +7 DI with it; 0.015 before the gain rates went to 5/6). */
export const TECH_BASE_GAIN = 0.0125;

/** Technique XP for one move (02 §B.2), before session multipliers. */
export function techniqueXp(margin: number, novelty: number, outcome: 'clean' | 'sketchy' | 'slip' | 'fall'): number {
  const outcomeFactor = outcome === 'clean' ? 1.0 : outcome === 'sketchy' ? 0.7 : 0.5;
  return TECH_BASE_GAIN * novelty * Math.exp(-((margin / 0.6) ** 2)) * outcomeFactor;
}

/** Novelty from how often the climber has made this (hold type, class) move on this rock. */
export const novelty = (count: number): number => 1 + 0.5 * Math.exp(-count / 30);

/** Apply technique XP banked during a session (02 §B.2: diminishing toward the ceiling). */
export function applyTechniqueXp(ctx: GainContext, xp: Partial<Record<AttrId, number>>, mult: number): Partial<Record<AttrId, number>> {
  const out: Partial<Record<AttrId, number>> = {};
  for (const [id, x] of Object.entries(xp) as [AttrId, number][]) {
    if (!x) continue;
    const st = ctx.attrs[id];
    const rate = ageAdaptMult(id, ctx.age) * (ctx.mods.adapt_rate_mult[id] ?? 1) * ADAPT_DIFFICULTY[ctx.difficulty] * stokeMult(ctx.stoke);
    const g = x * mult * rate * Math.pow(Math.max(0, 1 - st.value / st.ceiling), DIMINISH_EXP);
    st.value = Math.min(st.ceiling, st.value + g);
    st.last_stim_day = ctx.day;
    out[id] = g;
  }
  return out;
}

/** Small direct gains to mental attributes from on-wall events (02 §B.3), with the ceiling approach. */
export function nudge(attrs: Attributes, id: AttrId, delta: number): number {
  const st = attrs[id];
  const g = delta > 0 ? delta * Math.max(0, 1 - st.value / st.ceiling) : delta;
  st.value = clamp(st.value + g, 1, st.ceiling);
  return g;
}

// ---------------------------------------------------------------- daily: tendon release and detraining (12 §2, §4)

type Family = 'max' | 'endurance' | 'mobility' | 'technique' | 'none';

function familyOf(id: AttrId): Family {
  if (['finger_strength', 'pull_power', 'lockoff', 'contact_strength', 'core_tension', 'leg_power'].includes(id)) return 'max';
  if (['finger_endurance', 'aerobic_capacity', 'anaerobic_capacity'].includes(id)) return 'endurance';
  if (id === 'hip_mobility' || id === 'shoulder_mobility') return 'mobility';
  if (attrGroup(id) === 'technique') return 'technique';
  return 'none';
}

const DETRAIN: Record<Exclude<Family, 'none'>, { window: number; perWeek: number }> = {
  max: { window: 28, perWeek: 1.0 },
  endurance: { window: 14, perWeek: 1.5 },
  mobility: { window: 21, perWeek: 0.3 },
  technique: { window: 56, perWeek: 0.2 },
};

/** One day of tendon release and detraining. Mutates attrs. */
export function dailyAdaptation(attrs: Attributes, body: Body, age: number, day: number): void {
  const release = 1 - Math.pow(2, -1 / tendonHalfTime(age, body.tendon_robustness));
  const ageDecay = age <= 35 ? 1 : Math.min(2, 1 + (age - 35) / 15);
  for (const id of Object.keys(attrs) as AttrId[]) {
    const st = attrs[id];
    if (st.pending > 0) {
      const r = st.pending * release;
      st.pending -= r;
      st.value = Math.min(st.ceiling, st.value + r);
      if (st.pending < 1e-4) st.pending = 0;
    }
    const fam = familyOf(id);
    if (fam === 'none') continue;
    const d = DETRAIN[fam];
    const floor = 0.6 * st.ceiling;
    if (day - st.last_stim_day > d.window && st.value > floor) {
      st.value = Math.max(floor, st.value - (d.perWeek / 7) * ageDecay);
    }
    if (st.value > st.ceiling) st.value = Math.max(st.ceiling, st.value - (d.perWeek / 7) * ageDecay);
  }
}

// ---------------------------------------------------------------- activities (12 §1), the P1a subset

export interface Activity {
  id: string;
  name: string;
  stim: Partial<Record<AttrId, number>>;
  load: number;
  finger: boolean;
  energy: number;
  skin: number;
  cost: number;
  blurb: string;
}

const GYM = 20; // day pass, 14 §4 (gym tier 2)

export const ACTIVITIES: readonly Activity[] = [
  { id: 'max_hangs', name: 'Max hangs', stim: { finger_strength: 10, contact_strength: 2 }, load: 9, finger: true, energy: 30, skin: 3, cost: GYM, blurb: '20 mm edge, 7–10 s, five sets. Fingers, slowly.' },
  { id: 'repeaters', name: 'Repeaters', stim: { finger_endurance: 9, finger_strength: 3 }, load: 8, finger: true, energy: 35, skin: 3, cost: GYM, blurb: '7 on, 3 off, until the forearms argue.' },
  { id: 'campus', name: 'Campus board', stim: { contact_strength: 9, pull_power: 5, dynamic_movement: 3 }, load: 11, finger: true, energy: 40, skin: 5, cost: GYM, blurb: 'Ladders and bumps. Power for deadpoints, risk for pulleys.' },
  { id: 'limit_boulders', name: 'Limit bouldering', stim: { finger_strength: 6, core_tension: 5, contact_strength: 4, dynamic_movement: 3, tech_slopers: 1, tech_crimps: 1 }, load: 10, finger: true, energy: 45, skin: 8, cost: GYM, blurb: 'Three to six moves at your maximum, on plastic.' },
  { id: 'four_by_four', name: '4×4s', stim: { anaerobic_capacity: 9, finger_endurance: 4, pull_power: 2 }, load: 9, finger: false, energy: 50, skin: 7, cost: GYM, blurb: 'Four problems, four times, no rest between.' },
  { id: 'arc', name: 'ARC', stim: { aerobic_capacity: 9, finger_endurance: 3, footwork: 2 }, load: 4, finger: false, energy: 30, skin: 4, cost: GYM, blurb: 'Thirty minutes of easy continuous climbing.' },
  { id: 'weights', name: 'Weights', stim: { pull_power: 7, lockoff: 4, core_tension: 3, leg_power: 3 }, load: 8, finger: false, energy: 40, skin: 0, cost: GYM, blurb: 'Weighted pull-ups, deadlifts, overhead press.' },
  { id: 'skill_drills', name: 'Skill drills', stim: { footwork: 6, body_position: 5, route_reading: 2 }, load: 3, finger: false, energy: 25, skin: 2, cost: GYM, blurb: 'Silent feet, hover hands, flagging.' },
  { id: 'fall_practice', name: 'Fall practice', stim: { composure: 3, commitment: 2 }, load: 3, finger: false, energy: 25, skin: 2, cost: GYM, blurb: 'Progressive jumps off the top of the gym boulders.' },
  { id: 'mobility', name: 'Mobility', stim: { hip_mobility: 5, shoulder_mobility: 5 }, load: 2, finger: false, energy: 15, skin: 0, cost: 0, blurb: 'Hips and shoulders, 40 minutes on a mat.' },
  { id: 'cardio', name: 'Cardio', stim: { aerobic_capacity: 5 }, load: 3, finger: false, energy: 25, skin: 0, cost: 0, blurb: 'A run through the forest.' },
];

export const activityById = (id: string): Activity | undefined => ACTIVITIES.find((a) => a.id === id);

// ---------------------------------------------------------------- sleep and nutrition (12 §6), P1a lodging fixed

export const sleepMult = (sleepHygiene: number): number => 0.75 + 0.5 * sleepHygiene / 100;
export const nutritionMult = (nutrition: number): number => 0.8 + 0.4 * nutrition / 100;

// ---------------------------------------------------------------- load and ACWR (12 §5)

export function acwr(loads: readonly number[]): number | null {
  if (loads.length < 28) return null;
  const last28 = loads.slice(-28);
  const acute = last28.slice(-7).reduce((a, b) => a + b, 0);
  const chronic = last28.reduce((a, b) => a + b, 0) / 4;
  if (chronic <= 0) return acute > 0 ? 2.5 : 1;
  return acute / chronic;
}

export function acwrLabel(r: number | null): string {
  if (r === null) return 'settling in';
  return r < 0.8 ? 'undertrained' : r <= 1.3 ? 'sweet spot' : r <= 1.5 ? 'pushing' : r <= 2.0 ? 'spiking' : 'danger';
}
