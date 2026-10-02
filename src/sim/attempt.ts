// The attempt loop on the wall (docs/05b §1, §4.5, §5, §6, §8–§13). Every function here mutates a draft
// RunState; run.ts owns the reducer around it. Rolls come from stream(run_seed, route_id, attempt, move) so the
// same action at the same point always gives the same result and replay is exact.

import { aggregateMods, athleteFrom, clamp, type Athlete, type Mods } from './character';
import { applyMove, canMantle, prepareMove, preview, type Prepared, type Preview } from './engine';
import { boulderKappa, startState } from './grade';
import {
  autoCommitPApex, evaluate, fearEffects, holdCost, izof, powerPool, probs, recoveryChance, restDelta,
  type CommitOutcome, type Conditions, type MoveState, type Probs,
} from './resolve';
import { driftSpeed, judgeBalance, stanceOf, type BalanceJudged, type Stance } from './balance';
import { gripBudget, judgeReach, placeWord, validPerf, type MovePerf, type ReachJudged } from './reach';
import { routeFromSeed } from './routes';
import { judgeSwing, swingSetup, type SwingJudged, type SwingPerf } from './swing';
import { stream } from './rng';
import type { AttemptResult, AttemptState, MoveReport, ProjectState, RunState } from './state';
import { matrixCell, isDynamic } from './tables';
import { novelty, nudge, techniqueXp } from './training';
import type { Action, AttemptMode, AttrId, DataBundle, Limb, MoveClass, Route, Sector, Tick } from './types';
import { TECHNIQUE_ATTRS } from './types';
import {
  bodyPoints, freeState, judgeOption, limbKind, optionsFor, otherHand, rawRestValue, reachRadius, routeGeom, yOfS, type ClimbState, type Option, type RouteGeom,
} from './wall';
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

/** Fear on the meter: event fear plus the height source (05b §9.1: +2 per 2 m above 3 m of CoM). */
export function liveFear(at: AttemptState, geom: RouteGeom, ath: Athlete, st: ClimbState = at.climb): { fear: number; height: number } {
  const bp = bodyPoints(geom, ath, st);
  const y = yOfS(geom.route.wall, bp.CoM.s);
  const height = Math.max(0, y - 3) * (ath.mods.fear_source_mult['height'] ?? 1);
  return { fear: clamp(at.fear_base + height, 0, 100), height };
}

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
  const famBeta = route.signature ? 0.15 : 0;
  const k = 0.35 * ath.mods.familiarity_k_mult;
  const fam = 1 - (1 - famBeta) * Math.exp(-k * project.attempt_eq);
  const pool = powerPool(ath);
  const at: AttemptState = {
    route_seed: seed, route_id: route.id, mode, attempt_index: project.attempts, move_index: 0,
    climb: startState(geom, ath), pump: 0,
    power: run.res.energy < 50 ? pool * (0.5 + run.res.energy / 200) : pool,
    aerobic_reserve: ath.a.aerobic_capacity,
    fear_base: 0, focus_meter: ath.a.focus, chalk: 100, time_s: 0, shake_k: 0, pq_penalty: 0, fam,
    beta_ptr: 0, moves: 0, hand_moves: 0, pending: null, fear_log: [], log: [],
  };
  // fear0 = 40 − 0.3 × confidence + context sources (05b §9.1)
  at.fear_base = clamp(40 - 0.3 * ath.a.confidence + ath.mods.fear_add, 0, 100);
  if (mode === 'onsight') addFear(at, ath, 'onsight', 3);
  if (project.fall_fear > 0) addFear(at, ath, 'last fall', project.fall_fear);
  if (route.style_tags.includes('highball')) addFear(at, ath, 'highball', 3);
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

/** How a move is played (docs/23 §2): a dyno is swung, a move the stance test flags is balanced, the rest are reached. */
export type MoveType = 'reach' | 'balance' | 'dyno';

export function moveTypeOf(geom: RouteGeom, ath: Athlete, st: ClimbState, limb: Limb, cls: MoveClass): MoveType {
  if (isDynamic(cls)) return 'dyno';
  if (cls === 'mantle') return 'reach';
  return stanceOf(geom, ath, st, limb).balance ? 'balance' : 'reach';
}

/**
 * A `move` action. Dynamic moves wait for a `commit` action with the swing (docs/23 §3.3); every other move resolves
 * now, from the player's drag or lean when `perf` is given (Reach §3.1, Balance §3.2) or as Auto when it is not.
 */
export function doMove(run: RunState, limb: Limb, hold: string, cls: MoveClass, bundle: DataBundle, perf?: MovePerf): void {
  const at = run.attempt;
  if (!at) throw new InvalidAction('no attempt in progress');
  if (at.pending) throw new InvalidAction('a dyno is waiting for its swing');
  if (perf !== undefined && !validPerf(perf)) throw new InvalidAction('bad move perf');
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const prep = prepare(run, at, geom, ath, limb, hold, cls);
  if (perf) {
    const type = moveTypeOf(geom, ath, at.climb, limb, prep.cls);
    if (type === 'dyno') throw new InvalidAction('a dyno is swung, not dragged');
    if (perf.kind !== type) throw new InvalidAction(`a ${type} move cannot take a ${perf.kind} perf`);
  }
  if (isDynamic(prep.cls)) {
    const ms = moveStateOf(run, at, geom, ath);
    const e = evaluate(ath, prep.spec, ms, conditionsOf(run, at, bundle, ath));
    const bp = bodyPoints(geom, ath, freeState(at.climb, limb));
    const target = geom.holds.get(hold)!;
    at.pending = {
      limb, hold, cls: prep.cls,
      swing: swingSetup({
        com0: { x: bp.CoM.x, s: bp.CoM.s }, shoulderAt: { x: bp.shoulder.x, s: bp.shoulder.s }, hold: { x: target.x, s: target.s },
        reach: reachRadius(ath, 'hand', at.climb.posture), margin: e.margin, T: e.T, pump: at.pump,
        contact: ath.a.contact_strength, catchMult: ath.mods.commit_window_width, pApexAuto: autoCommitPApex(ath),
      }),
    };
    return;
  }
  resolveMove(run, at, geom, ath, prep, null, perf ?? null, bundle);
}

/** A Balance move's stance and drift speed (m/s) from the current state, for the screen and the harness; null if it is not one. */
export function balanceSetup(run: RunState, limb: Limb, hold: string, cls: MoveClass, bundle: DataBundle): { stance: Stance; drift: number } | null {
  const at = run.attempt;
  if (!at || at.pending) return null;
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const prep = prepareMove(geom, ath, at.climb, limb, hold, cls);
  if (!prep || moveTypeOf(geom, ath, at.climb, limb, prep.cls) !== 'balance') return null;
  const stance = stanceOf(geom, ath, at.climb, limb);
  const ms = moveStateOf(run, at, geom, ath);
  return { stance, drift: driftSpeed(ath, stance.angle, ms.overgrip, ms.pump) };
}

/** The grip budget (ms) for a Reach move from the current state, as the reducer will judge it; null if not a Reach move. */
export function reachBudget(run: RunState, limb: Limb, hold: string, cls: MoveClass, bundle: DataBundle): number | null {
  const at = run.attempt;
  if (!at || at.pending) return null;
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const prep = prepareMove(geom, ath, at.climb, limb, hold, cls);
  if (!prep || isDynamic(prep.cls)) return null;
  if (at.pq_penalty > 0) prep.spec.pq = Math.max(0.3, prep.spec.pq - at.pq_penalty);
  const ms = moveStateOf(run, at, geom, ath);
  const e = evaluate(ath, prep.spec, ms, conditionsOf(run, at, bundle, ath));
  return gripBudget(e.margin, e.T, ms.pump);
}

/**
 * A `commit` action: the player's Swing and Catch (docs/23 §3.3), or null for Auto-commit (05b §8.4). The swing is
 * judged against the setup stored when the dyno was chosen, so a replay reproduces it exactly.
 */
export function doCommit(run: RunState, swing: SwingPerf | null, bundle: DataBundle): void {
  const at = run.attempt;
  if (!at?.pending) throw new InvalidAction('no dyno waiting');
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const p = at.pending;
  const prep = prepare(run, at, geom, ath, p.limb, p.hold, p.cls);
  let outcome: CommitOutcome;
  let reason: SwingJudged['reason'] | null = null;
  if (swing === null) {
    outcome = stream(run.seed, at.route_id, at.attempt_index, at.move_index, 'commit').next() < p.swing.p_apex_auto ? 'apex' : 'caught';
  } else {
    const j = judgeSwing(p.swing, swing);
    outcome = j.outcome;
    reason = j.reason;
  }
  at.pending = null;
  // Pulling harder than the dyno needs costs power in proportion; Auto pulls exactly what it needs.
  const powerMult = swing === null ? 1 : Math.min(1.5, Math.max(0.7, swing.power / p.swing.p_need));
  resolveMove(run, at, geom, ath, prep, { outcome, auto: swing === null, powerMult, reason }, null, bundle);
}

function resolveMove(
  run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, prep: Prepared,
  commit: { outcome: CommitOutcome; auto: boolean; powerMult: number; reason: SwingJudged['reason'] | null } | null,
  perf: MovePerf | null, bundle: DataBundle,
): void {
  const session = run.block!.session!;
  const ms = moveStateOf(run, at, geom, ath);
  const cond = conditionsOf(run, at, bundle, ath);
  const e = evaluate(ath, prep.spec, ms, cond);
  const rng = stream(run.seed, at.route_id, at.attempt_index, at.move_index);
  const spec = prep.spec;
  const hand = spec.kind === 'hand';
  let margin = e.margin;
  let pumpMult = 1;
  let skinMult = 1;
  let forceSketchy = false;
  let cut = false;
  if (commit) {
    if (commit.outcome === 'apex') { margin += 0.4; pumpMult = 0.8; }
    if (commit.outcome === 'slap') { forceSketchy = true; pumpMult = 1.5; skinMult = 2; addFear(at, ath, 'slap', 3); }
    if (commit.outcome === 'cut') cut = true;
    if (commit.auto) margin -= 0.1; // Auto-commit tax (05b §8.4)
  }
  // Reach (docs/23 §3.1): where the hand landed moves the margin; a slow reach pumps, a very slow one lets go.
  // Balance (§3.2): time out of balance costs margin, and long enough out of it swings you off.
  let reach: ReachJudged | null = null;
  let bal: BalanceJudged | null = null;
  if (perf?.kind === 'reach') {
    reach = judgeReach(perf, gripBudget(e.margin, e.T, ms.pump), hand);
    margin += reach.delta;
    pumpMult *= reach.pumpMult;
  } else if (perf?.kind === 'balance') {
    bal = judgeBalance(perf);
    margin += bal.delta;
  }
  const popped = !!reach?.pop;
  const barned = !!bal?.barn;
  let p: Probs = probs(margin, e.T);
  if (!hand && ms.overgrip > 0 && p.slip > 0) {
    const slip = Math.min(1, p.slip * (1 + ms.overgrip));
    const rest = p.clean + p.sketchy;
    const scale = rest > 0 ? (1 - slip) / rest : 0;
    p = { clean: p.clean * scale, sketchy: p.sketchy * scale, slip };
  }
  if (forceSketchy) {
    const tot = p.sketchy + p.slip;
    p = tot > 0 ? { clean: 0, sketchy: p.sketchy / tot, slip: p.slip / tot } : { clean: 0, sketchy: 1, slip: 0 };
  }
  const u = rng.next();
  let outcome: 'clean' | 'sketchy' | 'slip' = cut || popped || barned ? 'slip' : u < p.clean ? 'clean' : u < p.clean + p.sketchy ? 'sketchy' : 'slip';

  // Costs (05b §5), paid whatever the outcome.
  const rough = outcome === 'clean' ? 1 : 1.5;
  const pump = e.pump_cost * pumpMult * rough;
  const skin = e.skin_cost * skinMult * (outcome === 'sketchy' ? 1.5 : 1);
  at.pump = clamp(at.pump + pump, 0, 100);
  run.res.skin = Math.max(0, run.res.skin - skin);
  at.power = Math.max(0, at.power - e.power_cost * (commit?.powerMult ?? 1));
  if (hand) at.chalk = Math.max(0, at.chalk - 5);
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
  if (commit) base.commit = commit.outcome;
  if (ms.under > 0) at.focus_meter = Math.max(0, at.focus_meter - 1);
  at.pq_penalty = 0;

  if (outcome === 'slip') {
    if (cut || popped || barned) base.forced = cut ? 'cut' : popped ? 'grip' : 'barn';
    // Recovery check (05b §4.5); a cut releases the launching hand and, on steep ground, both feet (05b §8.3).
    let other = spec.otherAnchors;
    if (cut && spec.angle >= 100) other = Object.keys(at.climb.anchors).filter((l) => l !== prep.option.limb && limbKind(l as Limb) === 'hand').length;
    // A pop: the holding hand opened while the other was still travelling.
    if (popped) other = Math.max(0, other - 1);
    const pRec = recoveryChance(ath, spec.kind, other) * (cut ? 0.6 : 1);
    const recovered = rng.next() < pRec;
    at.move_index++;
    if (recovered) {
      addFear(at, ath, 'slip', 8);
      if (!hand && spec.angle >= 110) at.climb = { ...at.climb, feet_cut: true };
      if (cut && spec.angle >= 100) at.climb = { ...at.climb, feet_cut: true };
      report(at, { ...base, outcome: 'slip_recovered', text: cut ? 'Cut loose and caught it. Feet are off.' : popped ? 'Too slow: your grip went, but you held on.' : barned ? 'Barn-doored, but you held the swing.' : `${limbName(prep.option.limb)} popped. You held on.` });
      checkPump(run, at, geom, ath, bundle);
      return;
    }
    report(at, { ...base, outcome: 'fall', text: cut ? 'Mistimed. Nothing to hold.' : popped ? `Too slow. Your ${limbName(otherHand(prep.option.limb)).toLowerCase()} opened.` : barned ? 'Barn door: you swung off.' : `${limbName(prep.option.limb)} slipped and you were off.` });
    finishAttempt(run, at, geom, ath, 'fell', bundle);
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

  if (prep.cls === 'mantle') {
    report(at, { ...base, outcome: 'sent', text: outcome === 'clean' ? 'Topped out.' : 'An ugly mantle, but you are standing on top.' });
    finishAttempt(run, at, geom, ath, 'sent', bundle);
    return;
  }
  report(at, { ...base, outcome, text: outcome === 'clean' ? moveText(prep, commit?.outcome, perf, reach) : 'Sketchy. You are on, but it cost you.' });
  revealScan(run, at, geom, ath, false);
  checkPump(run, at, geom, ath, bundle);
}

const limbName = (l: Limb): string => ({ LH: 'Left hand', RH: 'Right hand', LF: 'Left foot', RF: 'Right foot' })[l];

function moveText(prep: Prepared, c?: CommitOutcome, perf?: MovePerf | null, reach?: ReachJudged | null): string {
  if (c === 'apex') return 'Caught it at the apex.';
  if (c === 'caught') return 'Caught it.';
  const to = `${limbName(prep.option.limb)} to the ${prep.option.hold.type.replace('_', ' ')}`;
  if (!perf) return `${to}.`;
  if (perf.kind === 'balance') return `${to}, ${perf.out_ms > 0 ? 'wobbling' : 'in balance'}.`;
  return `${to}, ${placeWord(perf.place)}${reach && reach.overrun > 0 ? ', but slow' : ''}.`;
}

function checkPump(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, bundle: DataBundle): void {
  if (at.pump >= 100) {
    report(at, { kind: 'move', outcome: 'pumped', pump_delta: 0, text: 'Your hands opened.' });
    finishAttempt(run, at, geom, ath, 'pumped', bundle);
  }
}

// ---------------------------------------------------------------- wall actions: rest, chalk, jump off

function stanceInputs(at: AttemptState, geom: RouteGeom): { restValue: number; type: Route['holds'][number]['type']; angle: number }[] {
  const ids = [...new Set((['LH', 'RH'] as Limb[]).map((l) => at.climb.anchors[l]).filter((x): x is string => !!x))];
  return ids.map((id) => {
    const h = geom.holds.get(id)!;
    return { restValue: rawRestValue(h, at.climb.posture), type: h.type, angle: h.angle };
  });
}

/** Δpump of the next shake at the current stance (05b §6), the number shown as the rest value. */
export function restPreview(at: AttemptState, geom: RouteGeom, ath: Athlete): number {
  const inputs = stanceInputs(at, geom);
  if (inputs.length === 0) return 0;
  const { overgrip } = fearEffects(liveFear(at, geom, ath).fear, ath.a.composure);
  const deltas = inputs.map((i) => restDelta(ath, { ...i, posture: at.climb.posture, shakeIndex: at.shake_k + 1, reserve: at.aerobic_reserve, overgrip }));
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

export function doWallAction(run: RunState, kind: 'rest' | 'chalk' | 'jump_off', bundle: DataBundle): void {
  const at = run.attempt;
  if (!at) throw new InvalidAction('no attempt in progress');
  if (at.pending) throw new InvalidAction('a commit window is open');
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const session = run.block!.session!;
  if (kind === 'jump_off') {
    report(at, { kind: 'jump', pump_delta: 0, text: 'You jumped off onto the pads.' });
    finishAttempt(run, at, geom, ath, 'jumped', bundle);
    return;
  }
  if (kind === 'rest') {
    const d = restPreview(at, geom, ath);
    at.pump = clamp(at.pump + d, 0, 100);
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
  // chalk: 4 s, restores 60, costs the hold cost as a rest × 0.4 (05b §1)
  const inputs = stanceInputs(at, geom);
  const hc = inputs.length ? inputs.reduce((s, i) => s + holdCost({ ...i, posture: at.climb.posture }), 0) / inputs.length : 0;
  at.chalk = Math.min(100, at.chalk + 60);
  at.pump = clamp(at.pump + 0.4 * hc, 0, 100);
  at.time_s += 4;
  session.time_s += 4;
  at.aerobic_reserve = Math.max(0, at.aerobic_reserve - 0.4);
  report(at, { kind: 'chalk', pump_delta: 0.4 * hc, text: 'Chalked up.' });
  checkPump(run, at, geom, ath, bundle);
}

// ---------------------------------------------------------------- end of attempt

function finishAttempt(run: RunState, at: AttemptState, geom: RouteGeom, ath: Athlete, outcome: AttemptResult['outcome'], _bundle: DataBundle): void {
  const route = geom.route;
  const session = run.block!.session!;
  const project = run.projects[at.route_id]!;
  const progress = outcome === 'sent' ? 1 : progressOf(geom, at.climb);
  const energy = 1.5 + 0.1 * at.moves;
  run.res.energy = Math.max(0, run.res.energy - energy);
  session.energy_spent += energy;
  session.attempts++;
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
  if (outcome !== 'sent') {
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
      run.journal.push({ day: run.day, text: `New high point: ${route.name} (${style}).`, tone: 'good' });
      run.pb = route.di_graded;
    } else if (style !== 'repeat' && (project.sessions >= 3 || route.signature)) {
      run.journal.push({ day: run.day, text: `${route.name}, ${style}${project.sessions >= 3 ? ` after ${project.sessions} sessions` : ''}.`, tone: 'good' });
    }
    project.sent = true;
    project.sent_day ??= run.day;
    text = `${route.name}: ${style}.`;
  } else if (outcome === 'sent') {
    text = `${route.name}: topped out in working mode. No tick.`;
  } else {
    if (progress >= 0.8) nudge(run.attrs, 'confidence', -0.5);
    text = outcome === 'jumped' ? 'Off the wall.' : outcome === 'pumped' ? 'Pumped off.' : 'Fell.';
  }
  const result: AttemptResult = {
    route_seed: at.route_seed, route_id: route.id, name: route.name, di: route.di_graded, outcome, progress,
    moves: at.moves, day: run.day, kappa, text, log: at.log,
  };
  if (tick) result.tick = tick;
  run.last_attempt = result;
  run.attempt = null;
}

// ---------------------------------------------------------------- previews for the UI (05b §7, §13)

export interface MoveOption {
  option: Option;
  prepared: Prepared | null;
  preview: Preview | null;
  visible: boolean;
}

/** Every hold for a free limb with its verdict, and the decision triangle for legal ones. */
export function limbOptions(run: RunState, limb: Limb, bundle: DataBundle): MoveOption[] {
  const at = run.attempt;
  if (!at) return [];
  const { route, geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const ms = moveStateOf(run, at, geom, ath);
  const cond = conditionsOf(run, at, bundle, ath);
  const project = run.projects[at.route_id];
  const out: MoveOption[] = [];
  for (const option of optionsFor(geom, ath, at.climb, limb)) {
    const visible = isVisible(project, route, option.hold.id);
    let prepared: Prepared | null = null;
    let pv: Preview | null = null;
    if (visible && option.classes.length > 0) {
      prepared = prepareMove(geom, ath, at.climb, limb, option.hold.id, option.classes[0]);
      if (prepared && at.pq_penalty > 0) prepared.spec.pq = Math.max(0.3, prepared.spec.pq - at.pq_penalty);
      if (prepared) pv = preview(geom, ath, at.climb, ms, cond, prepared);
    }
    out.push({ option, prepared, preview: pv, visible });
  }
  // The mantle onto the finish, when a hand is on it.
  const mantleHand = canMantle(geom, at.climb);
  if (mantleHand === limb) {
    const prepared = prepareMove(geom, ath, at.climb, limb, route.finish_hold, 'mantle');
    if (prepared) out.push({ option: prepared.option, prepared, preview: preview(geom, ath, at.climb, ms, cond, prepared), visible: true });
  }
  return out;
}

/** Preview of one specific class on a hold, for the class chips in the move sheet. */
export function classPreview(run: RunState, limb: Limb, hold: string, cls: MoveClass, bundle: DataBundle): Preview | null {
  const at = run.attempt;
  if (!at) return null;
  const { geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const prepared = prepareMove(geom, ath, at.climb, limb, hold, cls);
  if (!prepared) return null;
  if (at.pq_penalty > 0) prepared.spec.pq = Math.max(0.3, prepared.spec.pq - at.pq_penalty);
  return preview(geom, ath, at.climb, moveStateOf(run, at, geom, ath), conditionsOf(run, at, bundle, ath), prepared);
}

/** Whether exact odds are shown (05b §13), else a band label with reading noise. */
export function showsExactOdds(run: RunState): boolean {
  const at = run.attempt;
  return run.attrs.route_reading.value >= 60 || (at?.fam ?? 0) >= 0.8;
}

/** Displayed completion chance with route-reading noise, drawn once per route, day, hold and class. */
export function displayedChance(run: RunState, limb: Limb, hold: string, cls: MoveClass, p: number): number {
  const at = run.attempt;
  if (!at) return p;
  const sd = 0.15 * (1 - run.attrs.route_reading.value / 100) * (1 - at.fam);
  return clamp(p + stream(run.seed, at.route_id, run.day, 'info', limb, hold, cls).normal(0, sd), 0, 1);
}

// ---------------------------------------------------------------- auto-climb (05b §10) and the harness bot

export interface AutoOptions {
  /** Harness/bot mode: never hand control back; rest and chalk by a simple policy. */
  bot?: boolean;
}

/** The next action auto-climb would take, or null to hand control to the player. */
export function autoClimbAction(run: RunState, bundle: DataBundle, opts: AutoOptions = {}): Action | null {
  const at = run.attempt;
  if (!at) return null;
  if (at.pending) return run.options.auto_commit || opts.bot ? { t: 'commit', swing: null } : null;
  const { route, geom } = routeEntry(at.route_seed, bundle);
  const ath = athleteOf(run, bundle);
  const step = route.beta_line[at.beta_ptr];
  if (!step) return opts.bot ? { t: 'wall_action', kind: 'jump_off' } : null;
  const ms = moveStateOf(run, at, geom, ath);
  const fx = { overgrip: ms.overgrip, under: ms.under };
  const project = run.projects[at.route_id];
  if (!isVisible(project, route, step.hold)) return opts.bot && at.shake_k < 1 ? { t: 'wall_action', kind: 'rest' } : opts.bot ? { t: 'wall_action', kind: 'jump_off' } : null;
  let prep = step.class === 'mantle'
    ? (canMantle(geom, at.climb) === step.limb ? prepareMove(geom, ath, at.climb, step.limb, step.hold, 'mantle') : null)
    : prepareMove(geom, ath, at.climb, step.limb, step.hold, step.class) ?? prepareMove(geom, ath, at.climb, step.limb, step.hold);
  if (!prep && step.class === 'mantle') prep = null;
  if (!prep) return opts.bot ? { t: 'wall_action', kind: 'jump_off' } : null;
  if (at.pq_penalty > 0) prep.spec.pq = Math.max(0.3, prep.spec.pq - at.pq_penalty);
  const e = evaluate(ath, prep.spec, ms, conditionsOf(run, at, bundle, ath));
  const rest = restPreview(at, geom, ath);
  if (opts.bot) {
    if (at.pump >= 35 && rest <= -1.5 && at.shake_k < 3) return { t: 'wall_action', kind: 'rest' };
    if (at.chalk < 35 && at.pump < 60) return { t: 'wall_action', kind: 'chalk' };
    return { t: 'move', limb: step.limb, hold: step.hold, class: prep.cls };
  }
  const dynamic = isDynamic(prep.cls);
  if (e.margin < e.T) return null;
  if (dynamic && !run.options.auto_commit) return null;
  if (at.pump >= 60) return null;
  if (fx.overgrip > 0 || fx.under > 0) return null;
  if (at.pump >= 40 && rest <= -3) return null;
  return { t: 'move', limb: step.limb, hold: step.hold, class: prep.cls };
}
