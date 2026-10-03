// The attempt loop on the wall (docs/05b §1, §4.5, §5, §6, §8–§13), simulated (docs/24): the climber picks every
// move, shake and chalk by its own tactics and every dyno resolves by Auto-commit. Every function here mutates a
// draft RunState; run.ts owns the reducer around it. Rolls come from stream(run_seed, route_id, attempt, move), so
// the same attempt from the same state always plays out the same way and replay is exact.

import { aggregateMods, athleteFrom, clamp, type Athlete, type Mods } from './character';
import { applyMove, canMantle, CHALK_RULE, chalkNow, prepareMove, shakeNow, stanceHoldCost, stanceRest, type Prepared } from './engine';
import { boulderKappa, startState } from './grade';
import {
  autoCommitPApex, climbClear, evaluate, fearEffects, izof, powerPool, probs, pumpForm, recoveryChance, reserveStart,
  type CommitOutcome, type Conditions, type MoveState, type Probs,
} from './resolve';
import { fontGrade } from './grades';
import { routeFromSeed } from './routes';
import { stream } from './rng';
import type { AttemptResult, AttemptState, MoveReport, ProjectState, RunState } from './state';
import { matrixCell, isDynamic } from './tables';
import {
  anchorOf, atAnchor, BELAY_QUALITY, belayerFear, boltPassed, boltsOf, clipCost, clipFrom, fallLength, HANG, isRoped, leadFear,
  ropeHeightFear, ropeKappa, URGENT_KAPPA,
} from './rope';
import { novelty, nudge, techniqueXp } from './training';
import type { AttemptMode, AttrId, DataBundle, Limb, MoveClass, Route, Sector, Tick } from './types';
import { TECHNIQUE_ATTRS } from './types';
import { bodyPoints, freeState, judgeOption, routeGeom, yOfS, type ClimbState, type RouteGeom } from './wall';
import { sessionConditions } from './weather';

export class InvalidAction extends Error {}

// ---------------------------------------------------------------- derived views (memoised pure functions)

const modsCache = new Map<string, Mods>();
export function modsOf(run: Pick<RunState, 'traits'>, bundle: DataBundle): Mods {
  const key = run.traits.join(',');
  let m = modsCache.get(key);
  if (!m) { m = aggregateMods(run.traits, bundle.traits); modsCache.set(key, m); }
  return m;
}

export function athleteOf(run: RunState, bundle: DataBundle): Athlete {
  return athleteFrom(run.body, run.attrs, modsOf(run, bundle), run.rock_knowledge);
}

interface RouteEntry { route: Route; geom: RouteGeom }
const routeCache = new Map<string, RouteEntry>();
const ROUTE_CACHE_MAX = 400;

export function routeEntry(seed: string, bundle: DataBundle): RouteEntry {
  let e = routeCache.get(seed);
  if (!e) {
    const route = routeFromSeed(seed, bundle);
    e = { route, geom: routeGeom(route) };
    if (routeCache.size >= ROUTE_CACHE_MAX) routeCache.delete(routeCache.keys().next().value!);
    routeCache.set(seed, e);
  }
  return e;
}

/** Make a route built outside routeFromSeed (harness, calibration) resolvable by its seed. */
export function registerRoute(route: Route): void {
  const seed = route.seed ?? route.id;
  routeCache.set(seed, { route, geom: routeGeom(route) });
}

export function sectorOf(run: RunState, bundle: DataBundle, id: string): Sector {
  const s = bundle.crags.get(run.crag)?.sectors.find((x) => x.id === id);
  if (!s) throw new InvalidAction(`unknown sector ${id}`);
  return s;
}

export const ageOf = (run: Pick<RunState, 'body' | 'day'>): number => run.body.age_start + run.day / 365;

const SPOT_QUALITY = 50; // the P1a default spotter stub (15 §1.4)

// ---------------------------------------------------------------- live state of an attempt

export function conditionsOf(run: RunState, at: Pick<AttemptState, 'chalk'>, bundle: DataBundle, ath = athleteOf(run, bundle)): Conditions {
  const sector = sectorOf(run, bundle, run.block?.session?.sector ?? '');
  return sessionConditions(ath, run.weather, sector, at.chalk, run.options.difficulty);
}

/**
 * Fear on the meter: event fear plus the height source (05b §9.1): on a boulder +1 per metre of CoM above 3 m; on a
 * rope +1 per metre of the fall the climber would take now beyond 4 m.
 */
export function liveFear(at: AttemptState, geom: RouteGeom, ath: Athlete, st: ClimbState = at.climb): { fear: number; height: number } {
  const bp = bodyPoints(geom, ath, st);
  const y = yOfS(geom.route.wall, bp.CoM.s);
  const raw = at.rope ? ropeHeightFear(y, at.rope.last_clip_y, BELAY_QUALITY) : Math.max(0, y - 3);
  const height = raw * (ath.mods.fear_source_mult['height'] ?? 1);
  return { fear: clamp(at.fear_base + height, 0, 100), height };
}

/** CoM height (m): where a fall starts. */
const comHeight = (geom: RouteGeom, ath: Athlete, st: ClimbState): number => yOfS(geom.route.wall, bodyPoints(geom, ath, st).CoM.s);

export function moveStateOf(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete): MoveState {
  const { fear } = liveFear(at, geom, ath);
  const fx = fearEffects(fear, ath.a.composure);
  return {
    pump: at.pump, power: at.power, focus_meter: at.focus_meter, overgrip: fx.overgrip, under: fx.under,
    energy: run.res.energy, skin: run.res.skin, fam: at.fam,
  };
}

function addFear(at: AttemptState, ath: Athlete, label: string, delta: number): void {
  const d = delta * (ath.mods.fear_source_mult[label.replace(/ /g, '_')] ?? 1);
  if (d === 0) return;
  at.fear_base = clamp(at.fear_base + d, 0, 100);
  at.fear_log.push({ label, delta: Math.round(d * 10) / 10 });
  if (at.fear_log.length > 8) at.fear_log.shift();
}

/** Composure decay (02 §B.3): −0.08 × composure per rest or clean move, toward the IZOF centre, never below it. */
function calmDown(at: AttemptState, ath: Athlete): void {
  const centre = izof(ath.a.composure).centre;
  if (at.fear_base > centre) at.fear_base = Math.max(centre, at.fear_base - 0.08 * ath.a.composure);
}

function report(at: AttemptState, r: MoveReport): void {
  at.log.push(r);
  if (at.log.length > 40) at.log.shift();
}

/** Height of progress on the problem: highest hand hold over the finish hold, 0..1. */
export function progressOf(geom: RouteGeom, st: ClimbState): number {
  const fin = geom.holds.get(geom.route.finish_hold);
  if (!fin) return 0;
  let best = 0;
  for (const l of ['LH', 'RH'] as Limb[]) {
    const id = st.anchors[l];
    const h = id ? geom.holds.get(id) : undefined;
    if (h) best = Math.max(best, h.s / fin.s);
  }
  return clamp(best, 0, 1);
}

// ---------------------------------------------------------------- hidden holds (05b §13)

export function isVisible(project: ProjectState | undefined, route: Route, holdId: string): boolean {
  const h = route.holds.find((x) => x.id === holdId);
  if (!h || !h.hidden) return true;
  return !!project?.revealed.includes(holdId);
}

/** Reveal hidden holds in reach: by a route-reading roll, or all of them when `lookAround` (a rest). */
function revealScan(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, lookAround: boolean): void {
  const project = run.projects[at.route_id];
  if (!project) return;
  const rr = run.attrs.route_reading.value;
  for (const h of geom.route.holds) {
    if (!h.hidden || project.revealed.includes(h.id)) continue;
    const inReach = (['LH', 'RH', 'LF', 'RF'] as Limb[]).some((l) => {
      if (at.climb.anchors[l] === h.id) return true;
      const bp = bodyPoints(geom, ath, freeState(at.climb, l));
      return judgeOption(geom, ath, at.climb, bp, l, geom.holds.get(h.id)!).classes.length > 0;
    });
    if (!inReach) continue;
    if (lookAround || stream(run.seed, at.route_id, 'reveal', h.id).next() < rr / 100 * 0.6) project.revealed.push(h.id);
  }
}

// ---------------------------------------------------------------- start

export function newProject(route: Route, day: number): ProjectState {
  return {
    seed: route.seed ?? route.id, id: route.id, name: route.name, area: route.area, di: route.di_graded,
    signature: route.signature, attempts: 0, attempt_eq: 0, sessions: 0, first_day: day, last_day: -1,
    sent: false, best: 0, fall_fear: 0, revealed: [],
  };
}

/**
 * Familiarity with a route before the next attempt (05b §12.2): beta on a signature problem, then the attempts made.
 * It builds more slowly on a route than on a boulder (k 0.25 vs 0.35).
 */
export function familiarity(route: Route, project: Pick<ProjectState, 'attempt_eq'> | undefined, ath: Athlete): number {
  const famBeta = route.signature ? 0.15 : 0;
  const k = (isRoped(route) ? 0.25 : 0.35) * ath.mods.familiarity_k_mult;
  return 1 - (1 - famBeta) * Math.exp(-k * (project?.attempt_eq ?? 0));
}

/** Effective mode for an attempt (05b §12.1). Flash needs beta: P1a has it only on signature problems. */
export function effectiveMode(project: ProjectState, route: Route, asked: AttemptMode): AttemptMode {
  if (asked === 'work') return 'work';
  if (project.attempts > 0) return 'redpoint';
  return asked === 'flash' && route.signature ? 'flash' : 'onsight';
}

export function startAttempt(run: RunState, seed: string, asked: AttemptMode, bundle: DataBundle): void {
  const session = run.block?.session;
  if (!session) throw new InvalidAction('attempt outside a climbing session');
  if (run.attempt) throw new InvalidAction('attempt already in progress');
  if (run.res.skin <= 0) throw new InvalidAction('no skin left');
  if (run.res.energy < 10) throw new InvalidAction('too tired');
  const { route, geom } = routeEntry(seed, bundle);
  if (route.area !== session.sector) throw new InvalidAction(`${route.name} is not in this sector`);
  const ath = athleteOf(run, bundle);
  const project = run.projects[route.id] ?? (run.projects[route.id] = newProject(route, run.day));
  if (project.last_day !== run.day) { project.sessions++; project.last_day = run.day; }
  const mode = effectiveMode(project, route, asked);
  const fam = familiarity(route, project, ath);
  const pool = powerPool(ath);
  const at: AttemptState = {
    route_seed: seed, route_id: route.id, mode, attempt_index: project.attempts, move_index: 0,
    climb: startState(geom, ath), pump: 0,
    power: run.res.energy < 50 ? pool * (0.5 + run.res.energy / 200) : pool,
    aerobic_reserve: reserveStart(ath),
    fear_base: 0, focus_meter: ath.a.focus, chalk: 100, time_s: 0, shake_k: 0, pq_penalty: 0, fam,
    beta_ptr: 0, moves: 0, hand_moves: 0, fear_log: [], log: [],
  };
  at.pump_form = pumpForm(stream(run.seed, route.id, project.attempts, 'form').normal());
  // fear0 = 40 − 0.3 × confidence + context sources (05b §9.1)
  at.fear_base = clamp(40 - 0.3 * ath.a.confidence + ath.mods.fear_add, 0, 100);
  if (mode === 'onsight') addFear(at, ath, 'onsight', 3);
  if (project.fall_fear > 0) addFear(at, ath, 'last fall', project.fall_fear);
  if (route.style_tags.includes('highball')) addFear(at, ath, 'highball', 3);
  if (isRoped(route)) {
    // On a rope: the first bolt is stick-clipped (07 §2.4, a tactic), so there is no ground fall from the start.
    const bolts = boltsOf(route);
    at.rope = { next: bolts.length ? 1 : 0, last_clip_y: bolts[0]?.y ?? null, skipped: false, weighted: false, falls: 0, falls_here: 0, kappa: 0, high: 0 };
    addFear(at, ath, 'lead', leadFear(run.counters.rope_falls_logged ?? 0));
    addFear(at, ath, 'belayer', belayerFear(BELAY_QUALITY));
  }
  if (route.danger === 'bold') addFear(at, ath, 'bold', 6);
  if (route.danger === 'deadly') addFear(at, ath, 'deadly', 15);
  // Advance the beta pointer past start holds already in place.
  syncBeta(at, route);
  run.attempt = at;
  if (mode === 'flash') for (const s of route.beta_line) if (!project.revealed.includes(s.hold)) project.revealed.push(s.hold);
  revealScan(run, at, geom, ath, false);
  report(at, { kind: 'move', pump_delta: 0, text: `${modeLabel(mode)} attempt on ${route.name}.` });
}

const modeLabel = (m: AttemptMode): string => ({ onsight: 'Onsight', flash: 'Flash', redpoint: 'Redpoint', work: 'Working' })[m];

function syncBeta(at: AttemptState, route: Route): void {
  while (at.beta_ptr < route.beta_line.length) {
    const s = route.beta_line[at.beta_ptr]!;
    if (s.class === 'mantle' || at.climb.anchors[s.limb] !== s.hold) break;
    at.beta_ptr++;
  }
}

// ---------------------------------------------------------------- moves

function prepare(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, limb: Limb, hold: string, cls: MoveClass): Prepared {
  if (cls === 'mantle' && canMantle(geom, at.climb) !== limb) throw new InvalidAction('mantle needs that hand on the finish');
  const prep = prepareMove(geom, ath, at.climb, limb, hold, cls);
  if (!prep) throw new InvalidAction(`illegal move ${limb} → ${hold} (${cls})`);
  if (!isVisible(run.projects[at.route_id], geom.route, hold)) throw new InvalidAction('that hold has not been found yet');
  if (at.pq_penalty > 0) prep.spec.pq = Math.max(0.3, prep.spec.pq - at.pq_penalty);
  return prep;
}

/**
 * One move along the line (05b §4). Dynos and deadpoints resolve at once by Auto-commit (05b §8.4): commitment and
 * dynamic movement set the chance of catching the hold at the apex rather than just catching it.
 */
export function doMove(run: RunState, limb: Limb, hold: string, cls: MoveClass, bundle: DataBundle): void {
  const at = run.attempt;
  if (!at) throw new InvalidAction('no attempt in progress');
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const prep = prepare(run, at, geom, ath, limb, hold, cls);
  const commit: CommitOutcome | null = isDynamic(prep.cls)
    ? (stream(run.seed, at.route_id, at.attempt_index, at.move_index, 'commit').next() < autoCommitPApex(ath) ? 'apex' : 'caught')
    : null;
  resolveMove(run, at, geom, ath, prep, commit, bundle);
}

function resolveMove(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, prep: Prepared, commit: CommitOutcome | null, bundle: DataBundle): void {
  const session = run.block!.session!;
  const ms = moveStateOf(run, at, geom, ath);
  const cond = conditionsOf(run, at, bundle, ath);
  const e = evaluate(ath, prep.spec, ms, cond);
  const rng = stream(run.seed, at.route_id, at.attempt_index, at.move_index);
  const spec = prep.spec;
  const hand = spec.kind === 'hand';
  let margin = e.margin;
  let pumpMult = 1;
  if (commit) {
    if (commit === 'apex') { margin += 0.4; pumpMult = 0.8; }
    margin -= 0.1; // Auto-commit tax (05b §8.4)
  }
  let p: Probs = probs(margin, e.T);
  if (!hand && ms.overgrip > 0 && p.slip > 0) {
    const slip = Math.min(1, p.slip * (1 + ms.overgrip));
    const rest = p.clean + p.sketchy;
    const scale = rest > 0 ? (1 - slip) / rest : 0;
    p = { clean: p.clean * scale, sketchy: p.sketchy * scale, slip };
  }
  const u = rng.next();
  const outcome: 'clean' | 'sketchy' | 'slip' = u < p.clean ? 'clean' : u < p.clean + p.sketchy ? 'sketchy' : 'slip';

  // Costs (05b §5), paid whatever the outcome.
  const rough = outcome === 'clean' ? 1 : 1.5;
  const pump = e.pump_cost * pumpMult * rough;
  const skin = e.skin_cost * (outcome === 'sketchy' ? 1.5 : 1);
  // On a route the aerobic system clears pump while the climber moves (resolve.ts `climbClear`).
  const clear = at.rope && hand ? climbClear(ath, e.time, at.aerobic_reserve) : 0;
  addPump(at, pump - clear);
  run.res.skin = Math.max(0, run.res.skin - skin);
  at.power = Math.max(0, at.power - e.power_cost);
  if (hand) at.chalk = Math.max(0, at.chalk - CHALK_RULE.wear);
  at.time_s += e.time;
  at.aerobic_reserve = Math.max(0, at.aerobic_reserve - e.time / 10);
  at.moves++;
  if (hand) { at.hand_moves++; session.hand_moves++; session.pump_total += pump; }
  session.time_s += e.time;

  // Stimulus and technique XP (12 §3, 02 §B.2).
  const cell = matrixCell(spec.kind, prep.cls, spec.type) ?? {};
  const hardness = clamp(1 - margin / (2 * e.T), 0, 1.5);
  if (margin < 0.5 * e.T) session.hard_moves++;
  const key = `${spec.type}:${prep.cls}`;
  const count = run.move_counts[key] ?? 0;
  run.move_counts[key] = count + 1;
  const xp = techniqueXp(margin, novelty(count), outcome === 'slip' ? 'slip' : outcome);
  let techW = 0;
  for (const [id, w] of Object.entries(cell) as [AttrId, number][]) if ((TECHNIQUE_ATTRS as readonly string[]).includes(id)) techW += w;
  for (const [id, w] of Object.entries(cell) as [AttrId, number][]) {
    if ((TECHNIQUE_ATTRS as readonly string[]).includes(id)) session.xp[id] = (session.xp[id] ?? 0) + xp * w / Math.max(1e-9, techW);
    else session.stim[id] = (session.stim[id] ?? 0) + w * hardness;
  }

  const base: MoveReport = {
    kind: 'move', limb: prep.option.limb, hold: prep.option.hold.id, cls: prep.cls, margin, T: e.T,
    p_complete: p.clean + p.sketchy, pump_delta: pump, text: '',
  };
  if (commit) base.commit = commit;
  if (ms.under > 0) at.focus_meter = Math.max(0, at.focus_meter - 1);
  at.pq_penalty = 0;

  if (outcome === 'slip') {
    // Recovery check (05b §4.5).
    const recovered = rng.next() < recoveryChance(ath, spec.kind, spec.otherAnchors);
    at.move_index++;
    if (recovered) {
      addFear(at, ath, 'slip', 8);
      if (!hand && spec.angle >= 110) at.climb = { ...at.climb, feet_cut: true };
      report(at, { ...base, outcome: 'slip_recovered', text: `${limbName(prep.option.limb)} popped. You held on.` });
      checkPump(run, at, geom, ath, bundle);
      return;
    }
    report(at, { ...base, outcome: 'fall', text: `${limbName(prep.option.limb)} slipped and you were off.` });
    if (at.rope) ropeFall(run, at, geom, ath, 'fell', bundle);
    else finishAttempt(run, at, geom, ath, 'fell', bundle);
    return;
  }

  if (outcome === 'clean') {
    if (margin < 0.5 * e.T) at.focus_meter = Math.min(100, at.focus_meter + 2);
    calmDown(at, ath);
  } else {
    at.focus_meter = Math.max(0, at.focus_meter - 3);
    addFear(at, ath, 'sketchy move', 4);
    at.pq_penalty = 0.03;
  }
  if (isDynamic(prep.cls)) nudge(run.attrs, 'commitment', 0.02);
  if (ms.overgrip > 0 && outcome === 'clean') nudge(run.attrs, 'composure', 0.03);

  at.climb = applyMove(geom, ath, at.climb, prep.option.limb, prep.option.hold.id, prep.cls);
  at.shake_k = 0;
  at.move_index++;
  const project = run.projects[at.route_id]!;
  if (!project.revealed.includes(prep.option.hold.id) && prep.option.hold.hidden) project.revealed.push(prep.option.hold.id);
  const step = geom.route.beta_line[at.beta_ptr];
  if (step && step.limb === prep.option.limb && step.hold === prep.option.hold.id) at.beta_ptr++;
  syncBeta(at, geom.route);
  if (at.rope) {
    at.rope.falls_here = 0;
    at.rope.high = Math.max(at.rope.high, progressOf(geom, at.climb));
    syncRope(at, geom);
  }

  if (prep.cls === 'mantle') {
    report(at, { ...base, outcome: 'sent', text: outcome === 'clean' ? 'Topped out.' : 'An ugly mantle, but you are standing on top.' });
    finishAttempt(run, at, geom, ath, 'sent', bundle);
    return;
  }
  report(at, { ...base, outcome, text: outcome === 'clean' ? moveText(prep, commit) : 'Sketchy. You are on, but it cost you.' });
  revealScan(run, at, geom, ath, false);
  checkPump(run, at, geom, ath, bundle);
}

const limbName = (l: Limb): string => ({ LH: 'Left hand', RH: 'Right hand', LF: 'Left foot', RF: 'Right foot' })[l];

function moveText(prep: Prepared, c: CommitOutcome | null): string {
  if (c === 'apex') return 'Caught it at the apex.';
  if (c === 'caught') return 'Caught it.';
  return `${limbName(prep.option.limb)} to the ${prep.option.hold.type.replace('_', ' ')}.`;
}

function checkPump(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, bundle: DataBundle): void {
  if (at.pump >= 100) {
    report(at, { kind: 'move', outcome: 'pumped', pump_delta: 0, text: 'Your hands opened.' });
    if (at.rope) ropeFall(run, at, geom, ath, 'pumped', bundle);
    else finishAttempt(run, at, geom, ath, 'pumped', bundle);
  }
}

// ---------------------------------------------------------------- the rope (05a §3, 05b §1, §11, §12, 07 §2)

/** Bolts below the next one that the line has left behind without a clip: passed, unclipped (05b §11). */
function syncRope(at: AttemptState, geom: RouteGeom): void {
  const rope = at.rope;
  if (!rope) return;
  const bolts = boltsOf(geom.route);
  for (let b = bolts[rope.next]; b && boltPassed(geom, at.climb, b, at.beta_ptr); b = bolts[rope.next]) {
    rope.skipped = true;
    rope.next++;
  }
}

/**
 * Pump in or out, in units of the day's capacity: the attempt's form (PUMP_FORM) scales every change, so the hands open
 * at meter 100 exactly when the unscaled pump reaches the day's threshold, the condition the grade engine integrates.
 */
function addPump(at: AttemptState, d: number): void {
  at.pump = clamp(at.pump + d * (at.pump_form ?? 1), 0, 100);
}

/** Whether a fall from here would be bold or worse (05c §3), so the climber clips at the first stance it can. */
const clipUrgent = (at: AttemptState, geom: RouteGeom, ath: Athlete): boolean =>
  ropeKappa(geom.route, comHeight(geom, ath, at.climb), at.rope!.last_clip_y, BELAY_QUALITY, at.rope!.skipped) >= URGENT_KAPPA;

/** What a climb step costs in time, pump and aerobic reserve. */
function pay(run: RunState, at: AttemptState, time: number, pump: number): void {
  addPump(at, pump);
  at.time_s += time;
  run.block!.session!.time_s += time;
  at.aerobic_reserve = Math.max(0, at.aerobic_reserve - time / 10);
}

/** Most falls the climber takes in one attempt before lowering off. **(tune)** */
export const MAX_ROPE_FALLS = 6;

/**
 * A fall on the rope (05b §11). The rope catches it, and its length and consequence are recorded. The climber then
 * hangs, recovers and pulls back on where it came off, now working the route (05b §12.1); it lowers off instead after a
 * ground fall, when spent, or after `MAX_ROPE_FALLS` falls.
 */
function ropeFall(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, cause: 'fell' | 'pumped', bundle: DataBundle): void {
  const rope = at.rope!;
  const comY = comHeight(geom, ath, at.climb);
  const kappa = ropeKappa(geom.route, comY, rope.last_clip_y, BELAY_QUALITY, rope.skipped);
  rope.kappa = Math.max(rope.kappa, kappa);
  rope.falls++;
  rope.falls_here++;
  rope.weighted = true;
  run.counters.rope_falls_logged = (run.counters.rope_falls_logged ?? 0) + 1;
  addFear(at, ath, 'last fall', 8);
  const len = rope.last_clip_y === null ? comY : fallLength(comY, rope.last_clip_y, BELAY_QUALITY);
  report(at, { kind: 'fall', pump_delta: 0, text: rope.last_clip_y === null || kappa >= 1 ? `A ground fall from ${comY.toFixed(0)} m.` : `The rope holds a ${len.toFixed(1)} m fall.` });
  const spent = run.res.energy < 15 || run.res.skin < 12;
  if (kappa >= 1 || spent || rope.falls >= MAX_ROPE_FALLS) {
    lowerOff(run, at, geom, ath, cause, bundle);
    return;
  }
  take(run, at, ath, 'Hang on the rope, shake out, pull back on.');
}

/** Hanging on the rope (05b §1 `take`): a minute's rest, then back on the holds the climber left. The attempt is now work. */
function take(run: RunState, at: AttemptState, ath: Athlete, text: string): void {
  const before = at.pump;
  pay(run, at, HANG.time_s, 0);
  at.pump = at.pump * HANG.pumpKeep;
  at.power = powerPool(ath);
  at.climb = { ...at.climb, feet_cut: false };
  at.shake_k = 0;
  at.rope!.weighted = true;
  at.mode = 'work';
  calmDown(at, ath);
  report(at, { kind: 'take', pump_delta: at.pump - before, text });
}

function lowerOff(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, outcome: 'fell' | 'pumped' | 'jumped', bundle: DataBundle): void {
  report(at, { kind: 'lower', pump_delta: 0, text: outcome === 'jumped' ? 'Lowered off.' : 'Lowered to the ground.' });
  finishAttempt(run, at, geom, ath, outcome, bundle);
}

/** Clip the next bolt from the stance the tactic chose (05b §1 `clip`). */
function clipBolt(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, bundle: DataBundle): void {
  const rope = at.rope!;
  const bolts = boltsOf(geom.route);
  const bolt = bolts[rope.next]!;
  const from = clipFrom(geom, at.climb, bolt, at.beta_ptr, true);
  const c = clipCost(ath, from?.type ?? 'jug', from?.angle ?? 90);
  pay(run, at, c.time, c.pump);
  rope.last_clip_y = bolt.y;
  rope.skipped = false;
  rope.next++;
  // Clipping is how rope craft is learned (02 §B.2): technique XP at no margin, fading with familiarity.
  const n = run.move_counts['clip'] ?? 0;
  run.move_counts['clip'] = n + 1;
  const session = run.block!.session!;
  session.xp.rope_craft = (session.xp.rope_craft ?? 0) + techniqueXp(0, novelty(n), 'clean');
  const after = bolts[rope.next];
  if (after && after.y - bolt.y > 3) addFear(at, ath, 'runout', 3);
  report(at, { kind: 'clip', pump_delta: c.pump, text: `Clipped bolt ${rope.next} of ${bolts.length}.` });
  checkPump(run, at, geom, ath, bundle);
}

/** Clip the anchor from the finish jug: the route is done, sent if the rope never held the climber (07 §2.2). */
function clipAnchor(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, bundle: DataBundle): void {
  const rope = at.rope!;
  const fin = geom.holds.get(geom.route.finish_hold)!;
  const c = clipCost(ath, fin.type, fin.angle);
  pay(run, at, c.time, c.pump);
  // The last clip can be the one that opens the hands, as the grade engine counts it.
  if (at.pump >= 100) { checkPump(run, at, geom, ath, bundle); return; }
  rope.high = 1;
  const clean = !rope.weighted && at.mode !== 'work';
  const r: MoveReport = { kind: 'clip', pump_delta: c.pump, text: clean ? 'Clipped the chains.' : 'Clipped the chains: worked to the top.' };
  if (clean) r.outcome = 'sent';
  report(at, r);
  finishAttempt(run, at, geom, ath, clean ? 'sent' : 'worked', bundle);
}

/** Pulling through on the quickdraw (aiding): after three falls on one move the climber pulls past it to work the rest. */
function pullThrough(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, bundle: DataBundle): void {
  const step = geom.route.beta_line[at.beta_ptr];
  const prep = step ? prepareMove(geom, ath, at.climb, step.limb, step.hold, step.class) ?? prepareMove(geom, ath, at.climb, step.limb, step.hold) : null;
  if (!step || !prep) { lowerOff(run, at, geom, ath, 'jumped', bundle); return; }
  pay(run, at, 15, 1);
  at.climb = applyMove(geom, ath, at.climb, step.limb, step.hold, prep.cls);
  at.moves++;
  at.move_index++;
  at.shake_k = 0;
  at.rope!.weighted = true;
  at.rope!.falls_here = 0;
  const project = run.projects[at.route_id]!;
  if (prep.option.hold.hidden && !project.revealed.includes(step.hold)) project.revealed.push(step.hold);
  at.beta_ptr++;
  syncBeta(at, geom.route);
  at.rope!.high = Math.max(at.rope!.high, progressOf(geom, at.climb));
  syncRope(at, geom);
  report(at, { kind: 'move', limb: step.limb, hold: step.hold, cls: prep.cls, outcome: 'aided', pump_delta: 1, text: 'Pulled through on the quickdraw.' });
}

// ---------------------------------------------------------------- wall actions: rest, chalk, jump off

/** Δpump of the next shake at the current stance (05b §6), the number shown as the rest value. */
export function restPreview(at: AttemptState, geom: RouteGeom, ath: Athlete): number {
  const { overgrip } = fearEffects(liveFear(at, geom, ath).fear, ath.a.composure);
  return stanceRest(geom, ath, at.climb, at.shake_k + 1, at.aerobic_reserve, overgrip);
}

export type WallActionKind = 'rest' | 'chalk' | 'jump_off' | 'clip' | 'clip_anchor' | 'take' | 'lower' | 'pull_through';

export function doWallAction(run: RunState, kind: WallActionKind, bundle: DataBundle): void {
  const at = run.attempt;
  if (!at) throw new InvalidAction('no attempt in progress');
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const session = run.block!.session!;
  if (kind === 'clip' || kind === 'clip_anchor' || kind === 'take' || kind === 'lower' || kind === 'pull_through') {
    if (!at.rope) throw new InvalidAction('no rope on a boulder');
    if (kind === 'clip') clipBolt(run, at, geom, ath, bundle);
    else if (kind === 'clip_anchor') clipAnchor(run, at, geom, ath, bundle);
    else if (kind === 'take') take(run, at, ath, 'Take! A minute on the rope.');
    else if (kind === 'lower') lowerOff(run, at, geom, ath, at.rope.falls > 0 ? 'fell' : 'jumped', bundle);
    else pullThrough(run, at, geom, ath, bundle);
    return;
  }
  if (kind === 'jump_off') {
    if (at.rope) { lowerOff(run, at, geom, ath, at.rope.falls > 0 ? 'fell' : 'jumped', bundle); return; }
    report(at, { kind: 'jump', pump_delta: 0, text: 'You jumped off onto the pads.' });
    finishAttempt(run, at, geom, ath, 'jumped', bundle);
    return;
  }
  if (kind === 'rest') {
    const d = restPreview(at, geom, ath);
    addPump(at, d);
    at.shake_k++;
    at.time_s += 10;
    session.time_s += 10;
    at.aerobic_reserve = Math.max(0, at.aerobic_reserve - 1);
    at.power = Math.min(powerPool(ath), at.power + 2);
    calmDown(at, ath);
    if (geom.route.style_tags.includes('highball')) addFear(at, ath, 'lingering', 1);
    const { under } = fearEffects(liveFear(at, geom, ath).fear, ath.a.composure);
    if (under > 0) at.focus_meter = Math.max(0, at.focus_meter - 1);
    revealScan(run, at, geom, ath, true);
    report(at, { kind: 'rest', pump_delta: d, text: d < -0.05 ? `Shake out: pump ${d.toFixed(1)}.` : `No rest here: pump +${Math.max(0, d).toFixed(1)}.` });
    checkPump(run, at, geom, ath, bundle);
    return;
  }
  // chalk (05b §1): CHALK_RULE's time and chalk back, for a share of the stance's hold cost
  const hc = CHALK_RULE.pumpShare * stanceHoldCost(geom, at.climb);
  at.chalk = Math.min(100, at.chalk + CHALK_RULE.gain);
  addPump(at, hc);
  at.time_s += CHALK_RULE.time;
  session.time_s += CHALK_RULE.time;
  at.aerobic_reserve = Math.max(0, at.aerobic_reserve - CHALK_RULE.time / 10);
  report(at, { kind: 'chalk', pump_delta: hc, text: 'Chalked up.' });
  checkPump(run, at, geom, ath, bundle);
}

// ---------------------------------------------------------------- end of attempt

function finishAttempt(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, outcome: AttemptResult['outcome'], _bundle: DataBundle): void {
  const route = geom.route;
  const session = run.block!.session!;
  const project = run.projects[at.route_id]!;
  const progress = outcome === 'sent' || outcome === 'worked' ? 1 : Math.max(at.rope?.high ?? 0, progressOf(geom, at.climb));
  const energy = 1.5 + 0.1 * at.moves;
  run.res.energy = Math.max(0, run.res.energy - energy);
  session.energy_spent += energy;
  session.attempts++;
  const tried = session.tried[at.route_seed] ?? (session.tried[at.route_seed] = { n: 0, sent: false });
  tried.n++;
  if (outcome === 'sent') tried.sent = true;
  session.di_sum += route.di_graded;
  session.load += 0.3 * clamp(route.di_graded - run.pb + 2, 0.5, 3);
  run.counters.attempts++;
  if (progress > project.best + 0.1 || outcome === 'sent') session.progress_made = true;
  const firstTry = project.attempts === 0;
  project.attempts++;
  project.attempt_eq += at.mode === 'work' ? 1.5 : 1;
  project.best = Math.max(project.best, progress);
  project.fall_fear = outcome === 'fell' || outcome === 'pumped' ? 2 : Math.max(0, project.fall_fear - 1);

  let kappa = 0;
  if (at.rope) kappa = at.rope.kappa;
  else if (outcome !== 'sent') {
    kappa = boulderKappa(geom, ath, at.climb, SPOT_QUALITY);
    if (outcome === 'jumped') kappa *= 0.7;
  }
  let text: string;
  let tick: Tick | undefined;
  if (outcome === 'sent' && at.mode !== 'work') {
    const style: Tick['style'] = project.sent ? 'repeat' : firstTry ? (at.mode === 'flash' ? 'flash' : 'onsight') : 'redpoint';
    tick = {
      route: route.id, route_seed: at.route_seed, name: route.name, day: run.day, style, attempts: project.attempts,
      di: route.di_graded, area: route.area,
    };
    if (route.circuit) tick.circuit = route.circuit;
    run.ticks.push(tick);
    session.sends++;
    run.counters.sends++;
    const atPb = route.di_graded >= run.pb - 0.25;
    if (style !== 'repeat') {
      const step = String(Math.round(route.di_graded));
      run.counters.pyramid[step] = (run.counters.pyramid[step] ?? 0) + 1;
      if (atPb) nudge(run.attrs, 'confidence', 1);
      run.res.stoke = clamp(run.res.stoke + (atPb ? 5 : 1), 0, 100);
    }
    if (route.di_graded > run.pb) {
      run.journal.push({ day: run.day, text: `New hardest send: ${route.name}, ${fontGrade(route.di_graded)} (${style}).`, tone: 'good' });
      run.pb = route.di_graded;
    } else if (style !== 'repeat' && (project.sessions >= 3 || route.signature)) {
      run.journal.push({ day: run.day, text: `${route.name}, ${style}${project.sessions >= 3 ? ` after ${project.sessions} sessions` : ''}.`, tone: 'good' });
    }
    project.sent = true;
    project.sent_day ??= run.day;
    text = `${route.name}: ${style}.`;
  } else if (outcome === 'sent') {
    text = `${route.name}: topped out in working mode. No tick.`;
  } else if (outcome === 'worked') {
    const falls = at.rope?.falls ?? 0;
    text = `${route.name}: worked to the anchor${falls ? `, ${falls} ${falls === 1 ? 'fall' : 'falls'}` : ''}. No tick.`;
  } else {
    if (progress >= 0.8) nudge(run.attrs, 'confidence', -0.5);
    text = at.rope
      ? (outcome === 'jumped' ? 'Lowered off.' : outcome === 'pumped' ? 'Pumped off and lowered.' : 'Fell and lowered off.')
      : outcome === 'jumped' ? 'Off the wall.' : outcome === 'pumped' ? 'Pumped off.' : 'Fell.';
  }
  const result: AttemptResult = {
    route_seed: at.route_seed, route_id: route.id, name: route.name, di: route.di_graded, outcome, progress,
    moves: at.moves, day: run.day, kappa, text, log: at.log,
  };
  if (tick) result.tick = tick;
  if (at.rope) result.falls = at.rope.falls;
  run.last_attempt = result;
  run.attempt = null;
}

// ---------------------------------------------------------------- the climber on the wall (05b §10, docs/24 §3)

/** Whether the problem list shows exact odds (05b §13), else a band label. */
export function showsExactOdds(run: RunState, fam = 0): boolean {
  return run.attrs.route_reading.value >= 60 || fam >= 0.8;
}

/** One thing the climber does on the wall: a move along the line, a shake, chalk, or jumping off. */
export type ClimbStep =
  | { t: 'move'; limb: Limb; hold: string; class: MoveClass }
  | { t: 'wall_action'; kind: WallActionKind };

/**
 * What the climber does next (05b §10's auto-climb, now the whole attempt): follow the problem's line, shake out when
 * pumped on a hold that gives a rest, chalk when it wears thin, and jump off when the line runs out or cannot be seen
 * after a look around. Null when there is no attempt.
 */
export function climberStep(run: RunState, bundle: DataBundle): ClimbStep | null {
  const at = run.attempt;
  if (!at) return null;
  const { route, geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  // On a rope: clip the anchor at the top, and each bolt from the stance the clipping tactic picks (07 §2.1).
  const off: WallActionKind = at.rope ? 'lower' : 'jump_off';
  if (at.rope) {
    if (atAnchor(geom, at.climb, at.beta_ptr) && anchorOf(route)) return { t: 'wall_action', kind: 'clip_anchor' };
    const bolt = boltsOf(route)[at.rope.next];
    if (bolt && clipFrom(geom, at.climb, bolt, at.beta_ptr, clipUrgent(at, geom, ath))) return { t: 'wall_action', kind: 'clip' };
  }
  const step = route.beta_line[at.beta_ptr];
  if (!step) return { t: 'wall_action', kind: off };
  if (!isVisible(run.projects[at.route_id], route, step.hold)) return { t: 'wall_action', kind: at.shake_k < 1 ? 'rest' : off };
  const prep = step.class === 'mantle'
    ? (canMantle(geom, at.climb) === step.limb ? prepareMove(geom, ath, at.climb, step.limb, step.hold, 'mantle') : null)
    : prepareMove(geom, ath, at.climb, step.limb, step.hold, step.class) ?? prepareMove(geom, ath, at.climb, step.limb, step.hold);
  if (!prep) return { t: 'wall_action', kind: off };
  // Working a route: three falls on one move and the climber pulls through on the draw; pumped, it takes rather than falls.
  if (at.rope && at.rope.falls_here >= 3) return { t: 'wall_action', kind: 'pull_through' };
  if (shakeNow(at.pump, restPreview(at, geom, ath), at.shake_k)) return { t: 'wall_action', kind: 'rest' };
  if (at.rope && at.mode === 'work' && at.pump >= TAKE_PUMP) return { t: 'wall_action', kind: 'take' };
  if (chalkNow(at.chalk)) return { t: 'wall_action', kind: 'chalk' };
  return { t: 'move', limb: step.limb, hold: step.hold, class: prep.cls };
}

/** Steps after which an attempt is called off: a guard, no line takes this many (a 40 m route with its clips and falls takes a few hundred). */
export const MAX_ATTEMPT_STEPS = 120;
export const MAX_ROPE_STEPS = 1500;
/** Working a route, the climber takes at this pump rather than climb on into a fall. **(tune)** */
export const TAKE_PUMP = 85;

/**
 * A whole attempt, simulated (docs/24 §3): start, then the climber's steps until it ends. `onStep` sees the state after
 * the start and after every step, so the wall can play the attempt back.
 */
export function simulateAttempt(run: RunState, seed: string, mode: AttemptMode, bundle: DataBundle, onStep?: (run: RunState) => void): void {
  startAttempt(run, seed, mode, bundle);
  onStep?.(run);
  const max = run.attempt?.rope ? MAX_ROPE_STEPS : MAX_ATTEMPT_STEPS;
  for (let i = 0; i < max && run.attempt; i++) {
    const s = climberStep(run, bundle)!;
    if (s.t === 'move') doMove(run, s.limb, s.hold, s.class, bundle);
    else doWallAction(run, s.kind, bundle);
    onStep?.(run);
  }
  if (run.attempt) {
    doWallAction(run, 'jump_off', bundle);
    onStep?.(run);
  }
}
