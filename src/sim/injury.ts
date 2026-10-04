// Injuries and illness (docs/13, 12 §5, 11 §4; P2 M2). An injury is rolled from a fall (its consequence κ), from the
// week's load (the load against what the tendons and the body are adapted to), from a slip on a hold that strains a
// structure, or, for an illness, from the day; each on its own named stream, keyed so that a reload never rerolls.
// Its heal and full-load windows are drawn once at onset and kept. Until it heals a grade-2+ injury bars climbing and
// the training that loads its site; until full load its site's holds and moves cost EffectiveStat, fading from
// grade × 25% at the heal day to nothing. Rehab blocks bring the heal day forward where there is sports physio, and
// skipping them makes the comeback longer and a relapse likelier. A grade 3 can take ceiling points for good, and a
// few end the career.

import { clamp, isLive, refFat, refMass, resourceMult, type Mods } from './character';
import { gainTrait } from './evolve';
import { stream, type Rng } from './rng';
import type { RunState, SessionState } from './state';
import { activityById, nutritionMult, sleepMult, tendonHalfTime, type Activity } from './training';
import type { AttrId, DataBundle, HoldType, InjuryDef, InjuryInstance, InjurySite, MoveClass, Tag } from './types';
import { calendarDate, formatDate } from './weather';

// ---------------------------------------------------------------- the numbers (13 §5; all **(tune)**)

/**
 * Fall injury chance from the fall's consequence κ (05b §11), `a × κ^b` per fall. κ already holds the pads, the spotter,
 * the rope's stretch and the belay (13 §5.1's coverage and spot terms, so they are not applied again); the curve's
 * shape follows 13 §5.1's rows (a boulder's 2 m, 3–4.5 m and highball falls; a rope's clean, ledge and ground falls)
 * and its level is calibrated to 13 §1's injury rates. **(tune)**
 */
export const FALL_RISK = { boulder: { a: 0.0145, b: 1.2 }, rope: { a: 0.0077, b: 2.6 } };
/** Load and move rates are the data's, times these: one knob each for the harness's calibration. **(tune)** */
export const RATE_SCALE = { load: 1, move: 1, illness: 1 };
/** A sketchy move strains a structure at this share of a slip's chance (13 §5.3). **(tune)** */
export const SKETCHY_SHARE = 0.2;
/** G1/G2/G3 before shifts (13 §5.2). */
export const GRADE_WEIGHTS: readonly [number, number, number] = [0.6, 0.3, 0.1];
/** EffectiveStat a site's holds and moves lose per grade, at the heal day (13 §3). */
export const PENALTY_PER_GRADE = 0.25;
/** The same structure again within a year: chance ×2, ×4 when its rehab was ignored (13 §3). */
export const REINJURY = { days: 365, mult: 2 };
/** Health lost per grade at onset, and regained per day (13 §3). **(tune)** */
export const HEALTH = { per_grade: 5, regen: 1 };
/** The "last injury" fear source: +3 for four weeks after a grade-2+ injury heals (13 §3). */
export const LAST_INJURY_FEAR = { delta: 3, days: 28 };
/**
 * Rehab (13 §3): two blocks a week is full compliance; with sports physio near (cost tiers 2–4, 13 §7) each week of it
 * brings the heal day a quarter of a week forward, at most a quarter of the window in all; under a quarter of the
 * blocks by the heal day, and full load comes 30% later and the next relapse is twice as likely again.
 */
export const REHAB = { per_week: 2, heal_cut: 0.25, neglect_below: 25, neglect_full: 0.3 };
/**
 * The capacity the tendons (finger load) and the body (all load) are adapted to (12 §2, §5), in daily load units. It
 * follows the 28-day load up on the tendon clock (the finger one) or a muscle clock a third of it (the general one), and
 * down three times slower, so that three weeks off do not make the comeback read as a spike; load above it raises risk
 * by `slope` per unit of the ratio over 1. Starting values are a habitual climber's. **(tune)**
 */
export const CAPACITY = { slope: 0.8, down: 1 / 3, finger0: 3, finger_per_strength: 0.06, general0: 8, general_clock: 1 / 3 };
/** 12 §5's load-ratio multiplier on weekly connective-tissue risk. */
export function mAcwr(r: number): number {
  return r < 0.8 ? 1.1 : r <= 1.3 ? 1.0 : r <= 1.5 ? 1.6 : r <= 2.0 ? 2.8 : 5.0;
}

/** The holds and moves an injured site costs, as a share of its penalty (13 §3: fingers block crimps and pockets first, jugs last). */
const SITE_LOAD: Record<InjurySite, { hold?: Partial<Record<HoldType, number>>; move?: Partial<Record<MoveClass, number>>; all?: number }> = {
  finger: { hold: { crimp: 1, edge: 1, pocket1: 1, pocket2: 1, pocket3: 1, crack_finger: 1, pinch: 0.7, sidepull: 0.6, gaston: 0.6, undercling: 0.6, sloper: 0.5, horn: 0.4, jug: 0.3, volume: 0.3, crack_hand: 0.3 } },
  wrist: { hold: { sloper: 1, undercling: 0.8, crack_hand: 0.8, crack_fist: 0.8, pinch: 0.7, volume: 0.7, gaston: 0.6, sidepull: 0.5, crimp: 0.3, edge: 0.3, jug: 0.2 }, move: { mantle: 1 } },
  elbow: { hold: { pinch: 0.8, undercling: 0.8, crimp: 0.7, edge: 0.7, pocket1: 0.7, pocket2: 0.7, pocket3: 0.7, sloper: 0.6, sidepull: 0.6, gaston: 0.6, jug: 0.4 }, move: { static: 0.3 } },
  shoulder: { hold: { gaston: 1, undercling: 0.6, sidepull: 0.5 }, move: { dyno: 1, deadpoint: 0.7, static: 0.3 }, all: 0.3 },
  back: { move: { dyno: 0.6, heel_hook: 0.6, toe_hook: 0.6, high_step: 0.4 }, all: 0.4 },
  knee: { move: { heel_hook: 1, kneebar: 1, high_step: 0.7, toe_hook: 0.5, mantle: 0.4 } },
  ankle: { move: { dyno: 1, high_step: 0.7, heel_hook: 0.5, toe_hook: 0.5 }, hold: { smear: 0.5, foot_chip: 0.5 } },
  skin: { all: 0.25 },
  systemic: { all: 0.3 },
};

/** Hold families' exposure tags (13 §5.2). */
const HOLD_TAG: Partial<Record<HoldType, Tag>> = {
  crimp: 'crimp', edge: 'crimp', pocket1: 'pocket', pocket2: 'pocket', pocket3: 'pocket', sloper: 'sloper', pinch: 'pinch',
  jug: 'jug', horn: 'jug', gaston: 'gaston', crack_finger: 'jam', crack_hand: 'jam', crack_fist: 'jam', crack_offwidth: 'jam',
};
/** Holds that load the fingers (12 §5's finger column). */
const FINGER_HOLDS: ReadonlySet<HoldType> = new Set(['crimp', 'edge', 'pocket1', 'pocket2', 'pocket3', 'pinch', 'sloper', 'crack_finger']);
/** Tags whose risk multiplier scales with an attribute rather than an exposure (13 §5.2: "flexibility 0.8", "core 0.8 (strong)"). */
const ATTR_TAG: Partial<Record<Tag, AttrId>> = { flexibility: 'shoulder_mobility', core: 'core_tension', skin: 'skin_durability', nutrition: 'nutrition', sleep: 'sleep_hygiene' };
/** Training activities' exposure tags (12 §1's tags in the Tag vocabulary). */
const ACTIVITY_TAGS: Record<string, Tag[]> = {
  max_hangs: ['crimp', 'power', 'gym'], repeaters: ['crimp', 'endurance', 'gym'], campus: ['power', 'dynamic', 'gym'],
  limit_boulders: ['power', 'dynamic', 'compression', 'gym'], four_by_four: ['power', 'endurance', 'gym'], arc: ['endurance', 'gym'],
  weights: ['power', 'static', 'gym'], skill_drills: ['gym'], fall_practice: ['gym'], cardio: ['endurance'],
};

// ---------------------------------------------------------------- reading the state

const ageOf = (run: Pick<RunState, 'body' | 'day'>): number => run.body.age_start + run.day / 365;
const dateOf = (run: RunState, day: number): string => formatDate(calendarDate(run.start_month, run.start_dom, day));
/** Live injury definitions: whose rolls are in this build. */
const liveDefs = (bundle: DataBundle): InjuryDef[] => [...bundle.injuries.values()].filter((d) => isLive(d) && !d.deprecated);
const defOf = (bundle: DataBundle, id: string): InjuryDef => bundle.injuries.get(id)!;

/** Injuries not yet at full load: the ones that still cost something (13 §3). */
export const activeInjuries = (run: Pick<RunState, 'injuries' | 'day'>): InjuryInstance[] => run.injuries.filter((i) => run.day < i.day_full_load);
/** Whether an injury still bars climbing (13 §2: grade 2 "no climbing on that structure"; grade 3 worse). */
export const barsClimbing = (i: InjuryInstance, day: number): boolean => i.grade >= 2 && day < i.day_heal;

/** The injury or illness that bars climbing today, the worst first, or null (13 §3). */
export function climbBlocker(run: Pick<RunState, 'injuries' | 'day'>): InjuryInstance | null {
  return run.injuries.filter((i) => barsClimbing(i, run.day)).sort((a, b) => b.grade - a.grade || b.day_heal - a.day_heal)[0] ?? null;
}

/** The injury that bars a training activity today: a grade-2+ one at a site it loads, or an illness; rehab never is. */
export function trainBlocker(run: Pick<RunState, 'injuries' | 'day'>, activity: Activity, bundle: DataBundle): InjuryInstance | null {
  if (!activity.loads.length) return null;
  return run.injuries.find((i) => barsClimbing(i, run.day) && (defOf(bundle, i.def).kind === 'illness' || activity.loads.includes(defOf(bundle, i.def).site))) ?? null;
}

/** How much of an injury's penalty is left on `day`: all of it until it heals, then a straight fade to full load. */
export function injuryFade(i: InjuryInstance, day: number): number {
  if (day < i.day_heal) return 1;
  if (day >= i.day_full_load) return 0;
  return (i.day_full_load - day) / Math.max(1, i.day_full_load - i.day_heal);
}

/** Between healing and full load: the climber is back on the rock, easing in (27 M2's return-to-load ramp). */
export const returning = (run: Pick<RunState, 'injuries' | 'day'>): boolean =>
  run.injuries.some((i) => i.grade >= 2 && run.day >= i.day_heal && run.day < i.day_full_load);

/** The "last injury" fear on the wall: for four weeks after a grade-2+ injury heals (13 §3). */
export function lastInjuryFear(run: Pick<RunState, 'injuries' | 'day'>, bundle: DataBundle): number {
  return run.injuries.some((i) => i.grade >= 2 && defOf(bundle, i.def).kind === 'injury' && run.day >= i.day_heal && run.day < i.day_heal + LAST_INJURY_FEAR.days)
    ? LAST_INJURY_FEAR.delta : 0;
}

const overlayCache = new Map<string, Pick<Mods, 'hold_mult' | 'move_mult'>>();

/**
 * The EffectiveStat today's injuries cost, as hold and move multipliers to add to the traits' (13 §3), or null when
 * none costs anything. Kept per (day, injuries), since the athlete asks for it at every move.
 */
export function injuryOverlay(run: Pick<RunState, 'injuries' | 'day'>, bundle: DataBundle): Pick<Mods, 'hold_mult' | 'move_mult'> | null {
  const live = activeInjuries(run);
  if (!live.length) return null;
  const key = `${run.day}|${live.map((i) => `${i.def}:${i.grade}:${i.day_heal}:${i.day_full_load}`).join(',')}`;
  let o = overlayCache.get(key);
  if (o) return o;
  const hold: Partial<Record<HoldType, number>> = {};
  const move: Partial<Record<MoveClass, number>> = {};
  for (const i of live) {
    const p = PENALTY_PER_GRADE * i.grade * injuryFade(i, run.day);
    const load = SITE_LOAD[defOf(bundle, i.def).site];
    for (const t of HOLD_TYPES_ALL) {
      const w = Math.max(load.hold?.[t] ?? 0, load.all ?? 0);
      if (w) hold[t] = (hold[t] ?? 1) - p * w;
    }
    for (const [c, w] of Object.entries(load.move ?? {}) as [MoveClass, number][]) move[c] = (move[c] ?? 1) - p * w;
  }
  for (const k of Object.keys(hold) as HoldType[]) hold[k] = Math.max(0.1, hold[k]!);
  for (const k of Object.keys(move) as MoveClass[]) move[k] = Math.max(0.1, move[k]!);
  o = { hold_mult: hold, move_mult: move };
  if (overlayCache.size > 2000) overlayCache.clear();
  overlayCache.set(key, o);
  return o;
}

const HOLD_TYPES_ALL: readonly HoldType[] = [
  'crimp', 'edge', 'sloper', 'pinch', 'pocket1', 'pocket2', 'pocket3', 'jug', 'sidepull', 'undercling', 'gaston', 'horn',
  'crack_finger', 'crack_hand', 'crack_fist', 'crack_offwidth', 'volume', 'foot_chip', 'smear',
];

// ---------------------------------------------------------------- multipliers shared by the rolls

/** The age term (02 §C.5, a proposal): +2% a year past 30. **(tune)** */
const ageRisk = (age: number): number => 1 + 0.02 * Math.max(0, age - 30);

/** A site's multiplier from traits, prevention and a recent injury of the same structure (13 §3, §6). */
function siteRisk(run: RunState, mods: Mods, def: InjuryDef): number {
  let m = mods.injury_site_mult[def.site] ?? 1;
  if (run.day < run.counters.antagonists_until) m *= def.site === 'shoulder' ? 0.85 : def.site === 'elbow' ? 0.8 : 1;
  const prev = run.injuries.filter((i) => i.def === def.id && run.day - i.day_onset < REINJURY.days);
  if (prev.length) m *= REINJURY.mult * (prev.some((i) => i.neglected) ? 2 : 1);
  return m;
}

/** A trait's injury multiplier applies to injuries and skin, an illness has its own (03 §2: Never Sick, Sickly). */
const kindRisk = (mods: Mods, def: InjuryDef): number =>
  def.kind === 'illness' ? mods.illness_mult * (mods.illness_def_mult[def.id] ?? 1) : mods.injury_risk_mult;

/**
 * One roll with Lucky's and Unlucky's rerolls (03 §2 `reroll_bad_outcome`, `reroll_good_outcome`): a hit is rolled
 * again with Lucky's chance, a miss with Unlucky's.
 */
function roll(rng: Rng, p: number, mods: Mods): boolean {
  let hit = rng.next() < p;
  if (hit && mods.reroll_bad > 0 && rng.next() < mods.reroll_bad) hit = rng.next() < p;
  else if (!hit && mods.reroll_good > 0 && rng.next() < mods.reroll_good) hit = rng.next() < p;
  return hit;
}

/** A grade from weights, the ones the injury cannot have left out. */
function pickGrade(rng: Rng, def: InjuryDef, shift: (w: [number, number, number]) => [number, number, number] = (w) => w): 1 | 2 | 3 {
  const w = shift([...(def.grade_weights ?? GRADE_WEIGHTS)] as [number, number, number]);
  const have = def.severities.map((s) => s.grade);
  const ws = w.map((x, i) => (have.includes((i + 1) as 1 | 2 | 3) ? Math.max(0, x) : 0));
  const total = ws.reduce((a, b) => a + b, 0);
  let u = rng.next() * total;
  for (let g = 0; g < 3; g++) {
    if (ws[g]! <= 0) continue;
    if ((u -= ws[g]!) < 0) return (g + 1) as 1 | 2 | 3;
  }
  return have[have.length - 1]!;
}

// ---------------------------------------------------------------- onset

/**
 * An injury begins (13 §3): its windows are drawn and kept, a lasting loss rolled, a grade 3's ceiling losses taken,
 * health dented, and whether it ends the career decided. The week's estimate is worked out again on the next session.
 */
export function onset(run: RunState, mods: Mods, def: InjuryDef, grade: 1 | 2 | 3, cause: InjuryInstance['cause'], rng: Rng): InjuryInstance {
  const sev = def.severities.find((s) => s.grade === grade)!;
  const age = ageOf(run);
  // 13 §3: recovery traits, sleep, nutrition and age scale every day count.
  const speed = mods.recovery_mult * sleepMult(run.attrs.sleep_hygiene.value) * nutritionMult(run.attrs.nutrition.value) * (1 - 0.01 * Math.max(0, age - 30));
  const span = (r: [number, number]): number => (r[1] >= 9999 ? 9999 : Math.round(rng.range(r[0], r[1] + 1) / Math.max(0.3, speed)));
  let heal = Math.max(1, span(sev.heal_days));
  let full = Math.max(heal, span(sev.full_load_days));
  if (grade === 1 && mods.injury_detect_delay) { heal += 7; full += 7; }
  const inst: InjuryInstance = {
    def: def.id, grade, cause, day_onset: run.day, day_heal: run.day + heal, day_full_load: run.day + full, rehab: 0, rehab_week: 0, rehab_progress: 0,
  };
  if (sev.lingering && rng.next() < sev.lingering.chance) inst.lingering = true;
  const ce = sev.career_ending;
  if (ce) {
    const spine = ce.chance !== undefined && rng.next() < ce.chance;
    // A repeat: the same structure torn to grade 3 before (11 §4's labrum or cuff, for every structure).
    const repeat = ce.repeat_after_age !== undefined && age >= ce.repeat_after_age
      && run.injuries.some((i) => i.grade === 3 && i.def === def.id);
    if (spine || repeat) inst.career_ending = true;
  }
  for (const [k, v] of Object.entries(sev.permanent_ceiling_loss ?? {}) as [AttrId, number][]) {
    run.ceiling_loss[k] = (run.ceiling_loss[k] ?? 0) + v;
    const a = run.attrs[k];
    a.ceiling = Math.max(5, a.ceiling + v);
    a.value = Math.min(a.value, a.ceiling);
  }
  run.res.health = clamp(run.res.health - HEALTH.per_grade * grade, 0, 100);
  run.injuries.push(inst);
  run.est = null;
  run.journal.push({ day: run.day, text: onsetText(run, def, inst), tone: 'bad' });
  return inst;
}

function onsetText(run: RunState, def: InjuryDef, i: InjuryInstance): string {
  const name = def.kind === 'illness' ? def.name : `${def.name}, grade ${i.grade}`;
  const how = i.cause === 'fall' ? 'A bad fall. ' : i.cause === 'move' ? 'Something went on a slip. ' : i.cause === 'load' ? 'The training caught up. ' : '';
  const when = i.grade >= 2
    ? ` No climbing until ${dateOf(run, i.day_heal)}; full strength by ${i.day_full_load - run.day >= 9999 ? 'never' : dateOf(run, i.day_full_load)}.`
    : ` Climbing through it, carefully, until ${dateOf(run, i.day_full_load)}.`;
  const end = i.career_ending ? ' The surgeon is clear: this one ends the climbing.' : '';
  return `${how}${name}.${when}${end}`;
}

// ---------------------------------------------------------------- the rolls

/** Whose site weights a fall of this kind spreads over (13 §5.1), with each one's trait and relapse multipliers. */
function fallTable(run: RunState, mods: Mods, bundle: DataBundle, kind: 'boulder' | 'rope'): { def: InjuryDef; w: number }[] {
  return liveDefs(bundle).filter((d) => d.triggers.includes('fall') && (d.fall?.[kind] ?? 0) > 0)
    .map((d) => ({ def: d, w: d.fall![kind]! * siteRisk(run, mods, d) }));
}

/**
 * A fall's injury roll (13 §5.1): the chance grows with κ, age, mass over the reference and a poor read of danger
 * (`risk_judgement`, P2 M2: a climber who reads danger backs off and lands better), and falls with body position; the
 * site follows the fall kind's table. `key` names the fall so a reload rolls the same.
 */
export function fallInjury(run: RunState, mods: Mods, bundle: DataBundle, kind: 'boulder' | 'rope', kappa: number, key: (string | number)[]): InjuryInstance | null {
  if (kappa <= 0) return null;
  const table = fallTable(run, mods, bundle, kind);
  const total = table.reduce((s, x) => s + x.w, 0);
  if (!total) return null;
  const base = table.reduce((s, x) => s + x.def.fall![kind]!, 0);
  const f = FALL_RISK[kind];
  let p = f.a * Math.pow(Math.min(1, kappa), f.b) * (total / base);
  p *= ageRisk(ageOf(run)) * (1 - 0.3 * run.attrs.body_position.value / 100) * (1 + 0.01 * (run.body.mass_kg - refMass(run.body.sex, run.body.height_cm)));
  p *= 1.3 - 0.6 * run.attrs.risk_judgement.value / 100;
  p *= mods.injury_risk_mult;
  if (kind === 'boulder') p *= mods.landing_injury_mult * (mods.always_downclimb ? 0.7 : 1);
  const rng = stream('injury', run.seed, 'fall', ...key);
  if (!roll(rng, Math.min(0.95, p), mods)) return null;
  let u = rng.next() * total;
  const def = (table.find((x) => (u -= x.w) < 0) ?? table[table.length - 1]!).def;
  // Ground and ledge falls go heavily to grades 2 and 3 (13 §5.1).
  const k = Math.min(1, kappa);
  const grade = pickGrade(rng, def, ([a, b, c]) => [a * (1 - k), b * (1 + k), c * (1 + 3 * k)]);
  return onset(run, mods, def, grade, 'fall', rng);
}

let moveTables: { bundle: DataBundle; byTag: Map<Tag, { def: InjuryDef; p: number }[]> } | null = null;

function moveTable(bundle: DataBundle): Map<Tag, { def: InjuryDef; p: number }[]> {
  if (moveTables?.bundle === bundle) return moveTables.byTag;
  const byTag = new Map<Tag, { def: InjuryDef; p: number }[]>();
  for (const d of liveDefs(bundle)) {
    if (!d.triggers.includes('move')) continue;
    for (const m of d.move ?? []) byTag.set(m.tag, [...(byTag.get(m.tag) ?? []), { def: d, p: m.p }]);
  }
  moveTables = { bundle, byTag };
  return byTag;
}

/** The exposure tags of one move: its hold's family, its class, its wall (13 §5.2, §5.3). */
export function moveTags(holdType: HoldType, cls: MoveClass, angle: number, hand: boolean): Tag[] {
  const out: Tag[] = [];
  const h = hand ? HOLD_TAG[holdType] : undefined;
  if (h) out.push(h);
  if (cls === 'deadpoint' || cls === 'dyno') out.push('dynamic');
  else if (cls === 'static') out.push('static');
  else if (cls === 'heel_hook') out.push('heel_hook');
  if (angle > 130) out.push('roof');
  else if (angle > 100) out.push('overhang');
  return out;
}

/**
 * A strain on a slip or a sketchy move (13 §5.3): each injury with a move rate for one of the move's tags may happen,
 * at a fifth of the chance on a sketchy move. One roll for all of them, the injury picked by its share. `fingerMult`
 * scales the fingers' chance (Pulley Veteran without a warm-up, 03 §2 `warmup_required`).
 */
export function moveInjury(run: RunState, mods: Mods, bundle: DataBundle, tags: readonly Tag[], outcome: 'sketchy' | 'slip', key: (string | number)[], fingerMult = 1): InjuryInstance | null {
  const table = moveTable(bundle);
  const cands: { def: InjuryDef; p: number }[] = [];
  for (const t of tags) for (const c of table.get(t) ?? []) cands.push(c);
  if (!cands.length) return null;
  const share = (outcome === 'slip' ? 1 : SKETCHY_SHARE) * RATE_SCALE.move * ageRisk(ageOf(run));
  const ps = cands.map((c) => c.p * share * kindRisk(mods, c.def) * siteRisk(run, mods, c.def) * (c.def.site === 'finger' ? fingerMult : 1));
  const total = ps.reduce((a, b) => a + b, 0);
  const rng = stream('injury', run.seed, 'move', ...key);
  if (!roll(rng, Math.min(0.95, total), mods)) return null;
  let u = rng.next() * total;
  const i = ps.findIndex((p) => (u -= p) < 0);
  const def = cands[i < 0 ? cands.length - 1 : i]!.def;
  const grade = pickGrade(rng, def, tags.includes('dynamic') ? ([a, b, c]) => [a, b, c * 1.5] : undefined);
  return onset(run, mods, def, grade, 'move', rng);
}

/** Daily load series → (acute over 7 days, chronic daily mean over up to 28). */
function series(loads: readonly number[]): { acute: number; chronic: number; days: number } {
  const last = loads.slice(-28);
  const days = last.length;
  const acute = last.slice(-7).reduce((a, b) => a + b, 0);
  const chronic = days ? last.reduce((a, b) => a + b, 0) / days : 0;
  return { acute, chronic, days };
}

/**
 * The load multiplier for a column (12 §5 with 12 §2's capacity): the acute week against the larger of the chronic
 * load and the capacity, so a layoff's collapsed chronic load does not turn a comeback into a spike; and the chronic load
 * over capacity, so climbing above what the tendons have adapted to costs even when it is steady. The first week is
 * a settling-in 1.2 (12 §5's novice term).
 */
export function loadRisk(loads: readonly number[], capacity: number): { ratio: number; m: number } {
  const { acute, chronic, days } = series(loads);
  if (days < 7) return { ratio: 1, m: 1.2 };
  const ratio = acute / (7 * Math.max(chronic, capacity, 0.1));
  const over = Math.max(0, chronic / Math.max(capacity, 0.1) - 1);
  return { ratio, m: mAcwr(ratio) * (1 + CAPACITY.slope * over) };
}

/** Exposure (or attribute) multiplier of an injury's risk mods this week (13 §5.2, additive: 03 §1.2). */
function exposureRisk(run: RunState, def: InjuryDef): number {
  const total = run.counters.exposure_total;
  let m = 1;
  for (const r of def.risk_mods) {
    const attr = ATTR_TAG[r.tag];
    if (attr) m += (r.mult - 1) * run.attrs[attr].value / 100;
    else if (total > 0) m += (r.mult - 1) * Math.min(1, (run.counters.exposure[r.tag] ?? 0) / total);
  }
  return Math.max(0.1, m);
}

/** Uses the finger column (12 §5): the fingers, and the forearm tendons at the elbow. */
const fingerSite = (site: InjurySite): boolean => site === 'finger' || site === 'elbow';

/**
 * The week's load roll (13 §5.2), at its end: each injury the load can cause has its chance from its base, the load
 * against capacity, the week's exposures, age, a very lean body, fatigue, traits, prevention and relapses. At most one
 * a week. At 16–17 a crimp-heavy week's finger injury can be the growth-plate variant (13 §2).
 */
export function weeklyLoadRoll(run: RunState, mods: Mods, bundle: DataBundle): InjuryInstance | null {
  const week = Math.floor(run.day / 7);
  const rng = stream('injury', run.seed, 'load', week);
  const finger = loadRisk(run.counters.finger_loads, run.capacity.finger);
  const general = loadRisk(run.counters.loads, run.capacity.general);
  const age = ageOf(run);
  const lean = 1 + 0.02 * Math.max(0, refFat(run.body.sex) - 3 - run.body.body_fat_pct);
  const common = RATE_SCALE.load * ageRisk(age) * lean * (run.counters.tired_week ? 1.4 : 1);
  const defs = liveDefs(bundle).filter((d) => d.triggers.includes('load') && d.load_base !== undefined && !d.substitutes);
  for (const d of defs) {
    const lr = fingerSite(d.site) ? finger : general;
    const p = d.load_base! * lr.m * exposureRisk(run, d) * common * kindRisk(mods, d) * siteRisk(run, mods, d);
    if (!roll(rng, Math.min(0.95, p), mods)) continue;
    // A spiking load and a dynamic week shift the grade toward 3 (13 §5.2).
    const dyn = run.counters.exposure_total > 0 ? (run.counters.exposure.dynamic ?? 0) / run.counters.exposure_total : 0;
    let def = d;
    const sub = liveDefs(bundle).find((x) => x.substitutes && x.substitutes.site === d.site && age < x.substitutes.age_max + 1);
    if (sub && (run.counters.exposure[sub.substitutes!.tag] ?? 0) / Math.max(1, run.counters.exposure_total) >= 0.25 && rng.next() < sub.substitutes!.chance) def = sub;
    const grade = pickGrade(rng, def, ([a, b, c]) => [a, b, c * (lr.m > 2 ? 2 : 1) * (1 + dyn)]);
    return onset(run, mods, def, grade, 'load', rng);
  }
  return null;
}

/**
 * The day's illness roll (13 §5.4): one at a time. A cold is likelier in the cold months and after travel, rarer with
 * good sleep; a travel bug comes only in cheap-food countries, often in the first days.
 */
export function dailyIllnessRoll(run: RunState, mods: Mods, bundle: DataBundle): InjuryInstance | null {
  if (activeInjuries(run).some((i) => defOf(bundle, i.def).kind === 'illness')) return null;
  const crag = bundle.crags.get(run.crag);
  if (!crag) return null;
  const month = calendarDate(run.start_month, run.start_dom, run.day).month;
  const cold = (crag.climate[month]?.t_mean ?? 15) < 10;
  const since = run.day - run.counters.arrived_day;
  const rng = stream('illness', run.seed, run.day);
  for (const d of liveDefs(bundle)) {
    const ill = d.illness;
    if (!ill || !d.triggers.includes('illness')) continue;
    if (ill.cost_tier_max !== undefined && crag.cost_tier > ill.cost_tier_max) continue;
    let p = ill.first_days && since < ill.first_days.days && newCountry(run, bundle) ? ill.first_days.daily : ill.daily;
    for (const r of d.risk_mods) {
      const attr = ATTR_TAG[r.tag];
      if (attr) p *= 1 + (r.mult - 1) * run.attrs[attr].value / 100;
      else if ((r.tag === 'cold' && cold) || (r.tag === 'travel' && since < 14 && run.visited.length > 1)) p *= r.mult;
    }
    p *= RATE_SCALE.illness * kindRisk(mods, d);
    if (!roll(rng, Math.min(0.95, p), mods)) continue;
    return onset(run, mods, d, pickGrade(rng, d), 'illness', rng);
  }
  return null;
}

/** The crag the climber is at is in a country it had not climbed in before this stay (13 §5.4). */
function newCountry(run: RunState, bundle: DataBundle): boolean {
  const here = bundle.crags.get(run.crag)?.country;
  const i = run.visited.indexOf(run.crag);
  return !run.visited.slice(0, Math.max(0, i)).some((id) => bundle.crags.get(id)?.country === here);
}

// ---------------------------------------------------------------- load, exposure, rehab

/** A new session's exposure fields (P2 M2). */
export const emptyExposure = (): Pick<SessionState, 'exposure' | 'moves_n' | 'finger_moves'> => ({ exposure: {}, moves_n: 0, finger_moves: 0 });

/** Count a move made in a session (13 §5.2's exposure, 12 §5's finger share). */
export function countMove(s: SessionState, tags: readonly Tag[], holdType: HoldType, hand: boolean): void {
  s.moves_n++;
  if (hand && FINGER_HOLDS.has(holdType)) s.finger_moves++;
  for (const t of tags) s.exposure[t] = (s.exposure[t] ?? 0) + 1;
}

/**
 * A session's load goes to the week's exposure by the share of its moves carrying each tag, and to today's finger load
 * by the share of its hand moves on finger holds (12 §5).
 */
export function settleSession(run: RunState, s: SessionState, boulder: boolean, cold: boolean): void {
  const c = run.counters;
  const n = Math.max(1, s.moves_n);
  for (const [t, k] of Object.entries(s.exposure) as [Tag, number][]) c.exposure[t] = (c.exposure[t] ?? 0) + s.load * (k / n);
  const tag: Tag = boulder ? 'boulder' : 'sport';
  c.exposure[tag] = (c.exposure[tag] ?? 0) + s.load;
  if (cold) c.exposure.cold = (c.exposure.cold ?? 0) + s.load;
  c.exposure_total += s.load;
  run.finger_today += s.hand_moves ? s.load * (s.finger_moves / s.hand_moves) : 0;
}

/** A training block's load goes to the week's exposure and, for finger work, to the finger column (12 §1, §5). */
export function settleActivity(run: RunState, act: Activity): void {
  const c = run.counters;
  for (const t of ACTIVITY_TAGS[act.id] ?? []) c.exposure[t] = (c.exposure[t] ?? 0) + act.load;
  c.exposure_total += act.load;
  if (act.finger) run.finger_today += act.load;
  if (act.id === 'antagonists') c.antagonists_until = run.day + 14;
}

/** A rehab block counts for each healing injury whose rehab it is (13 §3). */
export function countRehab(run: RunState, act: Activity, bundle: DataBundle): void {
  for (const i of activeInjuries(run)) {
    if (defOf(bundle, i.def).rehab.includes(act.id)) { i.rehab++; i.rehab_week++; }
  }
}

/** The rehab block today's worst healing injury wants, if it has one the climber has not done today. */
export function rehabActivity(run: Pick<RunState, 'injuries' | 'day'>, bundle: DataBundle): Activity | null {
  const cands = activeInjuries(run).filter((i) => defOf(bundle, i.def).rehab.length).sort((a, b) => b.grade - a.grade || a.day_onset - b.day_onset);
  for (const i of cands) {
    const a = activityById(defOf(bundle, i.def).rehab[0]!);
    if (a) return a;
  }
  return null;
}

// ---------------------------------------------------------------- settlement

/**
 * End of day (13 §3, 12 §5): today's loads go into their columns, the capacities follow the chronic loads, health comes
 * back, injuries that reach their heal day are checked for skipped rehab, illness may start, and acquired traits are
 * granted. Returns the injury that ends the career, if one does.
 */
export function endOfDay(run: RunState, mods: Mods, bundle: DataBundle): InjuryInstance | null {
  const c = run.counters;
  c.finger_loads.push(Math.round(run.finger_today * 10) / 10);
  run.finger_today = 0;
  if (c.finger_loads.length > 35) c.finger_loads.shift();
  // Capacity (12 §2): up on the tendon clock, down three times slower; the body's general capacity on a faster clock.
  const age = ageOf(run);
  const kf = 1 - Math.pow(2, -1 / tendonHalfTime(age, run.body.tendon_robustness));
  const kg = 1 - Math.pow(2, -1 / (tendonHalfTime(age, run.body.tendon_robustness) * CAPACITY.general_clock));
  const follow = (cap: number, loads: readonly number[], k: number): number => {
    const { chronic, days } = series(loads);
    if (days < 7) return cap;
    return chronic > cap ? cap + k * (chronic - cap) : cap - k * CAPACITY.down * (cap - chronic);
  };
  run.capacity = { finger: follow(run.capacity.finger, c.finger_loads, kf), general: follow(run.capacity.general, c.loads, kg) };
  // Health comes back a little each day (13 §3); a trait's multiplier scales the regeneration (03 §1.9).
  if (run.res.health < 100) run.res.health = Math.min(100, run.res.health + HEALTH.regen * resourceMult(mods, 'health') * sleepMult(run.attrs.sleep_hygiene.value));
  // Heal days: an injury whose rehab was skipped heals slower to full load and relapses likelier (13 §3).
  for (const i of run.injuries) {
    if (i.day_heal !== run.day + 1 || i.grade < 2) continue;
    const def = defOf(bundle, i.def);
    i.rehab_progress = Math.round(clamp((100 * i.rehab) / (REHAB.per_week * Math.max(1, Math.ceil((i.day_heal - i.day_onset) / 7))), 0, 100));
    if (def.rehab.length && i.rehab_progress < REHAB.neglect_below) {
      i.neglected = true;
      i.day_full_load += Math.round(REHAB.neglect_full * (i.day_full_load - i.day_heal));
    }
    if (def.kind !== 'illness') {
      run.journal.push({ day: run.day + 1, text: `${def.name}: healed enough to climb${i.neglected ? '; the skipped rehab will show' : ''}. Easing back in.`, tone: 'info' });
    }
  }
  dailyIllnessRoll(run, mods, bundle);
  acquireTraits(run, bundle);
  return run.injuries.find((i) => i.career_ending && i.day_onset === run.day) ?? null;
}

/**
 * End of the week (13 §3, §5.2): rehab compliance is settled (with sports physio, a week of it brings the heal day a
 * quarter of a week forward), then the week's load is rolled and the week's counters reset.
 */
export function endOfWeek(run: RunState, mods: Mods, bundle: DataBundle): InjuryInstance | null {
  const crag = bundle.crags.get(run.crag);
  const physio = crag ? crag.cost_tier >= 2 && crag.cost_tier <= 4 : false;
  for (const i of run.injuries) {
    if (run.day >= i.day_full_load || run.day < i.day_onset) { i.rehab_week = 0; continue; }
    const weeks = Math.max(1, Math.ceil((Math.min(run.day, i.day_heal) - i.day_onset + 1) / 7));
    i.rehab_progress = Math.round(clamp((100 * i.rehab) / (REHAB.per_week * weeks), 0, 100));
    const week = Math.min(1, i.rehab_week / REHAB.per_week);
    // Never sooner than the day after tomorrow: today's heal-day check (endOfDay) has run already.
    if (physio && run.day < i.day_heal - 2) i.day_heal = Math.max(run.day + 2, i.day_heal - Math.round(REHAB.heal_cut * 7 * week));
    i.rehab_week = 0;
  }
  const hit = weeklyLoadRoll(run, mods, bundle);
  run.counters.exposure = {};
  run.counters.exposure_total = 0;
  run.counters.tired_week = false;
  return hit && hit.career_ending ? hit : null;
}

/** Acquired traits whose injury trigger is met join the climber (03 §1.8), evaluated once a day. */
export function acquireTraits(run: RunState, bundle: DataBundle): void {
  for (const t of bundle.traits.values()) {
    const trig = t.acquire?.injury;
    if (!trig || t.kind !== 'acquired' || !isLive(t) || run.traits.includes(t.id)) continue;
    const n = run.injuries.filter((i) => {
      const d = defOf(bundle, i.def);
      if (trig.defs ? !trig.defs.includes(i.def) : d.kind !== 'injury') return false;
      if (i.grade < (trig.grade_min ?? 1)) return false;
      if (trig.healed && run.day + 1 < i.day_heal) return false;
      if (trig.lingering && !i.lingering) return false;
      return true;
    }).length;
    if (n >= (trig.count ?? 1)) gainTrait(run, t.id, bundle);
  }
}

/** The capacities a new climber starts with: a habitual climber's (12 §2). **(tune)** */
export function startCapacity(fingerStrength: number): RunState['capacity'] {
  return { finger: CAPACITY.finger0 + CAPACITY.finger_per_strength * fingerStrength, general: CAPACITY.general0 };
}

/** Injuries (kind `injury`) of grade 2 or more: the run summary's count (11 §5). */
export const countedInjuries = (run: Pick<RunState, 'injuries'>, bundle: DataBundle): number =>
  run.injuries.filter((i) => i.grade >= 2 && defOf(bundle, i.def)?.kind === 'injury').length;
