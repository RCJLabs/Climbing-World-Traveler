// The run reducer (docs/11, 12, 14, 16, 18 §5). A run is its `new_run` action plus every later action; the
// state is a cache. `applyAction` mutates a draft in place (replay, harness); `reduce` clones first (UI).

import { ageMoneyBonus, buildAttributes, ceilingFor, clamp, validateCreation, type Athlete } from './character';
import {
  ageOf, athleteOf, doCommit, doMove, doWallAction, InvalidAction, modsOf, routeEntry, sectorOf, startAttempt,
} from './attempt';
import { estimateBoulderDI } from './estimate';
import { cyrb53, stream } from './rng';
import { routeSeed } from './routes';
import { REDUCER_VERSION, type Counters, type DaySummary, type RouteSlot, type RunState, type SessionState } from './state';
import {
  activityById, acwr, applyStimulus, applyTechniqueXp, dailyAdaptation, nutritionMult, sleepMult, type GainContext,
} from './training';
import { ALL_ATTRS, type Action, type AttrId, type BlockKind, type DataBundle, type Difficulty, type NewRunSpec, type RunSummary } from './types';
import { calendarDate, firstWeather, formatDate, nextWeather, sectorStatus } from './weather';

export { InvalidAction };

export const START_MONTH = 8; // 1 September (11 §2): Font opens within weeks
export const START_DOM = 1;
export const DAILY_COST = 35; // P1a money stub (14 §1)
export const ODD_JOB_PAY = 50; // P1a odd-jobs stub at cost tier 3 (14 §2)
export const CLIMB_BLOCK_BASE_ENERGY = 10; // approach and warm-up
export const SECOND_BLOCK_ENERGY = 50; // 11 §1 proposes 55; at default lifestyle (energy cap ≈ 79) that forbade a double work day (tune)
export const CLIMB_STIM_SCALE = 0.25; // banked move stimulus → session stimulus units (tune)

const LIVING_MULT: Record<Difficulty, number> = { story: 0.75, standard: 1.0, hard: 1.25 };
const START_MONEY_MULT: Record<Difficulty, number> = { story: 1.5, standard: 1.0, hard: 0.75 };
const BANKRUPT_GRACE: Record<Difficulty, number> = { story: 60, standard: 30, hard: 20 };
const SCORE_MULT: Record<Difficulty, number> = { story: 0.5, standard: 1.0, hard: 1.3 };

// ---------------------------------------------------------------- estimates (02 §C.3)

/** Estimated boulder DI for the run's climber at its crag (benchmark inversion, see estimate.ts). */
export function estimateDI(run: RunState, bundle: DataBundle): number {
  return estimateBoulderDI(athleteOf(run, bundle), run.crag, bundle);
}

/** Onsight gap below the redpoint estimate (02 §C.3). */
export const onsightGap = (ath: Athlete): number => 1.0 + 1.5 * (1 - ath.a.route_reading / 100) + 0.5 * (1 - ath.a.composure / 100);

// ---------------------------------------------------------------- creation

function emptyCounters(): Counters {
  return {
    neg_money_days: 0, failure_streak: 0, monotony_weeks: 0, week_sectors: [], prev_week_sectors: [], loads: [],
    forced_break_until: -1, burnout_hits: { season: -1, hits: 0 }, climb_days: 0, rest_days: 0, attempts: 0, sends: 0,
    work_blocks: 0, train_blocks: 0, pyramid: {}, new_sectors_today: 0,
  };
}

const emptyDay = (day: number): DaySummary => ({ day, money_delta: 0, gains: {}, notes: [] });

export function energyCap(run: Pick<RunState, 'attrs' | 'res'>): number {
  const health = run.res.health < 50 ? 0.5 : 1;
  return clamp(100 * sleepMult(run.attrs.sleep_hygiene.value) * nutritionMult(run.attrs.nutrition.value) * health, 20, 100);
}

/** Living cost per day (14 §1 P1a stub): fixed, scaled by difficulty and traits such as Dirtbag. */
export function dailyCost(run: Pick<RunState, 'options' | 'traits'>, bundle: DataBundle): number {
  return Math.round(DAILY_COST * LIVING_MULT[run.options.difficulty] * modsOf(run, bundle).cost_mult);
}

export function createRun(seed: string, spec: NewRunSpec, bundle: DataBundle): RunState {
  const ctx = { traits: bundle.traits, backgrounds: bundle.backgrounds };
  const errs = validateCreation(spec, ctx);
  if (errs.length) throw new InvalidAction(errs.join(' '));
  const bg = bundle.backgrounds.get(spec.background)!;
  const crag = bundle.crags.get(bg.start_crag) ?? bundle.crags.get('fontainebleau');
  if (!crag) throw new InvalidAction('no start crag');
  const traits = [...new Set([...bg.forced_traits, ...spec.traits])];
  const attrs = buildAttributes({ ...spec, traits }, ctx);
  const money = (bg.money_start + ageMoneyBonus(spec.body.age_start)) * START_MONEY_MULT[spec.options.difficulty];
  const run: RunState = {
    v: REDUCER_VERSION, data_version: bundle.version, seed, name: spec.name, background: bg.id, body: spec.body, traits,
    options: { ...spec.options }, attrs, rock_knowledge: {}, move_counts: {}, crag: crag.id,
    start_month: START_MONTH, start_dom: START_DOM, day: 0,
    weather: firstWeather(seed, crag, START_MONTH, spec.options.difficulty), last_rain: null,
    res: { energy: 0, skin: 100, stoke: 70, burnout: 0, money: Math.round(money), health: 100 },
    blocks_today: [], block: null, attempt: null, last_attempt: null, projects: {}, ticks: [], pb: 0,
    journal: [{ day: 0, text: `${spec.name} arrives in Fontainebleau with $${Math.round(money).toLocaleString('en-US')} and a crash pad.`, tone: 'info' }],
    today: emptyDay(0), yesterday: null, counters: emptyCounters(), load_today: 0, ended: null, actions: 1,
  };
  if (run.weather.sky === 'rain' || run.weather.sky === 'storm') run.last_rain = { day: 0, mm: run.weather.precip_mm };
  run.res.energy = energyCap(run);
  return run;
}

// ---------------------------------------------------------------- sessions and slots (06 §5)

/** Sessions in a row without a send before each further one costs stoke (02 §D, doc 22). **(tune)** */
export const STOKE_FAIL_SESSIONS = 3;

const SLOT_BANDS: [kind: RouteSlot['kind'], lo: number, hi: number][] = [
  ['warmup', -4, -3], ['mid', -2, 0], ['mid', -2, 0], ['mid', -2, 0], ['push', 0, 2], ['push', 0, 2], ['push', 0, 2], ['project', 3, 4],
];

/** Route list for a session at a sector: 8 procedural slots around E, signatures, and known projects. */
export function sessionSlots(run: RunState, sectorId: string, E: number, bundle: DataBundle): RouteSlot[] {
  const crag = bundle.crags.get(run.crag)!;
  const sector = sectorOf(run, bundle, sectorId);
  const rng = stream('slots', run.seed, crag.id, sectorId, run.day);
  const out: RouteSlot[] = [];
  SLOT_BANDS.forEach(([kind, lo, hi], i) => {
    const di = clamp(Math.round(rng.range(E + lo, E + hi) * 2) / 2, crag.di_range[0] + 1, crag.di_range[1]);
    const slot = cyrb53(`${run.seed}|${i}`) % 100000;
    out.push({ seed: routeSeed(crag.id, sectorId, run.day, slot, di), kind, di_target: di });
  });
  for (const id of sector.signature_routes) {
    const sig = [...bundle.signatures.values()].find((r) => r.id === id);
    if (sig) out.push({ seed: sig.seed ?? sig.id, kind: 'signature', di_target: sig.di_target });
  }
  const known = Object.values(run.projects)
    .filter((p) => p.area === sectorId && !p.signature && !out.some((s) => s.seed === p.seed))
    .filter((p) => (p.attempts >= 3 && !p.sent && run.day - p.first_day <= 365) || run.day - p.last_day <= 30)
    .sort((a, b) => b.last_day - a.last_day)
    .slice(0, 8);
  for (const p of known) out.push({ seed: p.seed, kind: 'known', di_target: p.di });
  return out;
}

function startSession(run: RunState, sectorId: string, bundle: DataBundle): SessionState {
  const E = Math.round(estimateDI(run, bundle) * 2) / 2;
  return {
    sector: sectorId, E, slots: sessionSlots(run, sectorId, E, bundle), attempts: 0, sends: 0, di_sum: 0, hard_moves: 0,
    hand_moves: 0, pump_total: 0, time_s: 0, progress_made: false, stim: {}, xp: {}, load: 6, energy_spent: CLIMB_BLOCK_BASE_ENERGY,
  };
}

function gainCtx(run: RunState, bundle: DataBundle): GainContext {
  return {
    attrs: run.attrs, body: run.body, mods: modsOf(run, bundle), age: ageOf(run), day: run.day, stoke: run.res.stoke,
    difficulty: run.options.difficulty, sleep_mult: sleepMult(run.attrs.sleep_hygiene.value), nutrition_mult: nutritionMult(run.attrs.nutrition.value),
  };
}

function addGains(run: RunState, g: Partial<Record<AttrId, number>>): void {
  for (const [id, v] of Object.entries(g) as [AttrId, number][]) run.today.gains[id] = (run.today.gains[id] ?? 0) + v;
}

/** Close a climbing session: convert stimulus and XP, stoke, burnout inputs, load (12 §1, §3). */
function endSession(run: RunState, s: SessionState, bundle: DataBundle): void {
  const ctx = gainCtx(run, bundle);
  const project = s.attempts > 0 && s.di_sum / s.attempts >= s.E - 1;
  // Physical stimulus from the moves made: hard moves train strength like limit bouldering (P1a reading of 12 §1).
  const stim: Partial<Record<AttrId, number>> = {};
  for (const [id, v] of Object.entries(s.stim) as [AttrId, number][]) stim[id] = Math.min(10, CLIMB_STIM_SCALE * v);
  stim.finger_endurance = (stim.finger_endurance ?? 0) + Math.min(8, s.pump_total / 25);
  if (project) {
    stim.route_reading = (stim.route_reading ?? 0) + 2;
  } else if (s.attempts > 0) {
    stim.footwork = (stim.footwork ?? 0) + 3;
    stim.aerobic_capacity = (stim.aerobic_capacity ?? 0) + 3;
    stim.route_reading = (stim.route_reading ?? 0) + 3;
  }
  addGains(run, applyStimulus(ctx, stim));
  addGains(run, applyTechniqueXp(ctx, s.xp, project ? 1.5 : 1.0));
  if (project && s.progress_made) run.attrs.confidence.value = Math.min(run.attrs.confidence.ceiling, run.attrs.confidence.value + 0.5);
  // Rock knowledge (02 §B.4): +1 per session at this rock, diminishing.
  const rock = bundle.crags.get(run.crag)!.rock;
  const rk = run.rock_knowledge[rock] ?? 0;
  run.rock_knowledge[rock] = Math.min(100, rk + (s.attempts > 0 ? 1 - rk / 100 : 0));
  if (s.attempts > 0) {
    if (s.sends > 0) run.counters.failure_streak = 0;
    else {
      run.counters.failure_streak = Math.min(10, run.counters.failure_streak + 1);
      // One blank session is part of projecting; a run of them wears you down (12 §9, doc 22).
      if (run.counters.failure_streak >= STOKE_FAIL_SESSIONS) run.res.stoke = clamp(run.res.stoke - 2, 0, 100);
    }
  }
  if (!run.counters.week_sectors.includes(s.sector)) {
    if (!run.counters.prev_week_sectors.includes(s.sector)) run.counters.new_sectors_today++;
    run.counters.week_sectors.push(s.sector);
  }
  run.today.notes.push(`${sectorOf(run, bundle, s.sector).name}: ${s.attempts} attempts, ${s.sends} sends.`);
  todayLoad(run, s.load);
}

function todayLoad(run: RunState, load: number): void {
  run.load_today += load;
}

// ---------------------------------------------------------------- blocks (11 §1)

export type BlockCheck = { ok: true } | { ok: false; reason: string };

export function canStartBlock(run: RunState, kind: BlockKind, target: string | undefined, bundle: DataBundle): BlockCheck {
  if (run.ended) return { ok: false, reason: 'The run is over.' };
  if (run.block) return { ok: false, reason: 'Finish the current block first.' };
  if (run.blocks_today.length >= 2) return { ok: false, reason: 'Two blocks a day is the limit.' };
  if (run.blocks_today.length === 1 && run.res.energy < SECOND_BLOCK_ENERGY && kind !== 'rest') return { ok: false, reason: `A second block needs ${SECOND_BLOCK_ENERGY} energy.` };
  const onBreak = run.day < run.counters.forced_break_until;
  if (kind === 'climb') {
    if (onBreak) return { ok: false, reason: 'Forced break: burnout. Rest, work or recover.' };
    if (!target) return { ok: false, reason: 'Pick a sector.' };
    const status = sectorStatus(sectorOf(run, bundle, target), run.weather, run.last_rain);
    if (!status.open) return { ok: false, reason: status.reason };
    if (run.res.energy < CLIMB_BLOCK_BASE_ENERGY + 10) return { ok: false, reason: 'Too tired to climb.' };
    if (run.res.skin < 5) return { ok: false, reason: 'No skin left. Tomorrow.' };
  }
  if (kind === 'train') {
    if (onBreak) return { ok: false, reason: 'Forced break: burnout. Rest, work or recover.' };
    const act = target ? activityById(target) : undefined;
    if (!act) return { ok: false, reason: 'Pick an activity.' };
    if (run.res.energy < act.energy * 0.6) return { ok: false, reason: 'Too tired for that session.' };
    if (act.skin > 0 && run.res.skin < act.skin) return { ok: false, reason: 'Not enough skin.' };
  }
  if (kind === 'work' && run.res.energy < 20) return { ok: false, reason: 'Too tired to work.' };
  return { ok: true };
}

function startBlock(run: RunState, kind: BlockKind, target: string | undefined, bundle: DataBundle): void {
  const check = canStartBlock(run, kind, target, bundle);
  if (!check.ok) throw new InvalidAction(check.reason);
  run.blocks_today.push(kind);
  switch (kind) {
    case 'climb': {
      run.res.energy = Math.max(0, run.res.energy - CLIMB_BLOCK_BASE_ENERGY);
      run.block = { kind, target: target!, session: startSession(run, target!, bundle) };
      return;
    }
    case 'train': {
      const act = activityById(target!)!;
      run.res.energy = Math.max(0, run.res.energy - act.energy);
      run.res.skin = Math.max(0, run.res.skin - act.skin);
      run.res.money -= act.cost;
      run.today.money_delta -= act.cost;
      addGains(run, applyStimulus(gainCtx(run, bundle), act.stim));
      todayLoad(run, act.load);
      run.counters.train_blocks++;
      run.today.notes.push(`${act.name}${act.cost ? ` ($${act.cost})` : ''}.`);
      return;
    }
    case 'work': {
      const pay = ODD_JOB_PAY;
      run.res.energy = Math.max(0, run.res.energy - 25);
      run.res.money += pay;
      run.today.money_delta += pay;
      run.res.stoke = clamp(run.res.stoke - 1, 0, 100);
      run.counters.work_blocks++;
      run.today.notes.push(`Odd job: +$${pay}.`);
      return;
    }
    case 'rest': {
      run.res.energy = Math.min(energyCap(run), run.res.energy + 15);
      run.res.skin = Math.min(100, run.res.skin + 5);
      run.today.notes.push('Rested.');
      return;
    }
    case 'active_recovery': {
      run.res.energy = Math.max(0, run.res.energy - 15);
      addGains(run, applyStimulus(gainCtx(run, bundle), { hip_mobility: 2, shoulder_mobility: 2, aerobic_capacity: 1 }));
      run.today.notes.push('Active recovery.');
      return;
    }
  }
}

function endBlock(run: RunState, bundle: DataBundle): void {
  const b = run.block;
  if (!b) throw new InvalidAction('no block in progress');
  if (run.attempt) {
    if (run.attempt.pending) doCommit(run, null, bundle);
    if (run.attempt) doWallAction(run, 'jump_off', bundle);
  }
  if (b.session) endSession(run, b.session, bundle);
  run.block = null;
}

// ---------------------------------------------------------------- the day (11 §1–§3, 12 §5–§7, 14 §9)

function isRestDay(blocks: readonly BlockKind[]): boolean {
  return !blocks.some((k) => k === 'climb' || k === 'train' || k === 'work');
}

function endDay(run: RunState, bundle: DataBundle): void {
  if (run.block) endBlock(run, bundle);
  const crag = bundle.crags.get(run.crag)!;
  const c = run.counters;
  const day = run.day;
  const restDay = isRestDay(run.blocks_today);
  const climbed = run.blocks_today.includes('climb');
  if (climbed) c.climb_days++;
  if (restDay) c.rest_days++;

  // Money (14 §1 P1a stub, §9).
  const cost = dailyCost(run, bundle);
  run.res.money -= cost;
  run.today.money_delta -= cost;
  if (run.res.money < 300) run.res.stoke = clamp(run.res.stoke - 1, 0, 100);
  c.neg_money_days = run.res.money < 0 ? c.neg_money_days + 1 : 0;

  // Stoke (02 §D, 02 §B.3): rest days recover via resilience; a closed crag on a day you did not climb costs a little.
  const resilience = run.attrs.resilience.value;
  if (restDay) run.res.stoke = clamp(run.res.stoke + 0.1 * resilience * (run.res.burnout > 50 ? 0.5 : 1), 0, 100);
  run.res.stoke += 0.03 * (60 - run.res.stoke); // drifts back toward a neutral 60
  const anyOpen = crag.sectors.some((s) => sectorStatus(s, run.weather, run.last_rain).open);
  if (!anyOpen && !climbed) run.res.stoke = clamp(run.res.stoke - 1, 0, 100);

  // Load and ACWR (12 §5).
  c.loads.push(Math.round(run.load_today * 10) / 10);
  run.load_today = 0;
  if (c.loads.length > 35) c.loads.shift();
  const ratio = acwr(c.loads);

  // Burnout (12 §7). Failing sessions weigh only on days you climb: charged on rest days too, a long failure
  // streak outweighed rest, so burnout could never fall and the forced break repeated for the rest of the run.
  const novelty = c.new_sectors_today > 0 ? 1 : 0;
  const dB = (0.15 * c.monotony_weeks + 0.1 * (climbed ? c.failure_streak : 0) + 0.05 * Math.max(0, (ratio ?? 1) - 1.3) * 10 - 0.6 * (restDay ? 1 : 0) - 0.4 * novelty)
    * (1 - resilience / 200);
  run.res.burnout = clamp(run.res.burnout + dB, 0, 100);
  c.new_sectors_today = 0;

  // Week boundary: monotony counts weeks that visited no sector outside last week's set.
  if ((day + 1) % 7 === 0) {
    const fresh = c.week_sectors.some((s) => !c.prev_week_sectors.includes(s));
    c.monotony_weeks = fresh || c.week_sectors.length === 0 ? 0 : Math.min(8, c.monotony_weeks + 1);
    c.prev_week_sectors = c.week_sectors;
    c.week_sectors = [];
    if (run.res.money < 0) run.res.money = Math.round(run.res.money * 1.01);
  }

  // Adaptation clocks.
  dailyAdaptation(run.attrs, run.body, ageOf(run), day);

  // Overnight regeneration (02 §D).
  const sleep = sleepMult(run.attrs.sleep_hygiene.value);
  run.res.skin = Math.min(100, run.res.skin + (20 + 0.3 * run.attrs.skin_durability.value) * sleep);

  // Advance the calendar and the weather.
  run.yesterday = run.today;
  run.day = day + 1;
  run.today = emptyDay(run.day);
  run.blocks_today = [];
  const date = calendarDate(run.start_month, run.start_dom, run.day);
  run.weather = nextWeather(run.seed, crag, run.weather, run.day, date.month, run.options.difficulty);
  if (run.weather.sky === 'rain' || run.weather.sky === 'storm') run.last_rain = { day: run.day, mm: run.weather.precip_mm };
  run.res.energy = energyCap(run);

  // Birthday (11 §3).
  if (run.day % 365 === 0) {
    const age = Math.floor(ageOf(run));
    for (const id of ALL_ATTRS) run.attrs[id].ceiling = ceilingFor(id, run.body, run.traits, bundle.traits, age);
    run.journal.push({ day: run.day, text: `${run.name} turns ${age}.`, tone: 'info' });
  }

  // Run-end checks (11 §4).
  if (c.neg_money_days >= BANKRUPT_GRACE[run.options.difficulty]) { endRun(run, 'bankrupt', bundle); return; }
  if (c.neg_money_days === 7 || c.neg_money_days === 20) run.journal.push({ day: run.day, text: 'The account is in the red. Odd jobs pay $50 a block.', tone: 'bad' });
  if (run.res.burnout >= 80 && run.day >= c.forced_break_until) {
    const season = Math.floor(run.day / 91);
    if (c.burnout_hits.season === season && c.burnout_hits.hits >= 1 && run.res.stoke < 20) { endRun(run, 'burnout', bundle); return; }
    c.burnout_hits = { season, hits: c.burnout_hits.season === season ? c.burnout_hits.hits + 1 : 1 };
    c.forced_break_until = run.day + 14;
    run.journal.push({ day: run.day, text: 'Burnt out. Two weeks off the rock, whether you like it or not.', tone: 'bad' });
  }
}

// ---------------------------------------------------------------- run end, score, unlocks (11 §4–§5, 16 §4, §6)

export function summarise(run: RunState, reason: RunSummary['end_reason']): RunSummary {
  const sends = run.ticks.filter((t) => t.style !== 'repeat');
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
  const hardest = max(sends.map((t) => t.di));
  const circuits: RunSummary['circuits'] = {};
  for (const t of sends) if (t.circuit) circuits[t.circuit] = (circuits[t.circuit] ?? 0) + 1;
  const score = (10 * hardest + 0.6 * Math.sqrt(sends.length) + 3 * 1 + 0.02 * run.day) * SCORE_MULT[run.options.difficulty];
  const unsent = Object.values(run.projects).filter((p) => !p.sent).sort((a, b) => b.sessions - a.sessions || b.di - a.di)[0];
  const out: RunSummary = {
    climber: run.name, background: run.background, days: run.day, age_end: Math.floor(ageOf(run)), end_reason: reason,
    hardest, hardest_onsight: max(sends.filter((t) => t.style === 'onsight').map((t) => t.di)),
    hardest_flash: max(sends.filter((t) => t.style === 'onsight' || t.style === 'flash').map((t) => t.di)),
    ticks: sends.length, circuits, score: Math.round(score * 10) / 10, unlocks: ['p1a:second_background'], seed: run.seed,
    pyramid: { ...run.counters.pyramid },
  };
  if (unsent && unsent.sessions >= 2) out.got_away = { name: unsent.name, sessions: unsent.sessions, di: unsent.di };
  return out;
}

function endRun(run: RunState, reason: RunSummary['end_reason'], bundle: DataBundle): void {
  if (run.block) endBlock(run, bundle);
  run.ended = summarise(run, reason);
  const line = {
    retired: `${run.name} hung up the shoes.`, bankrupt: `${run.name} ran out of money and went home.`,
    burnout: `${run.name} quit. The forest will still be there.`, forced_injury: `${run.name} was forced to stop.`, death: `${run.name} died climbing.`,
  }[reason];
  run.journal.push({ day: run.day, text: line, tone: reason === 'retired' ? 'info' : 'bad' });
}

// ---------------------------------------------------------------- the reducer

/** Apply one action to a draft state in place. Throws InvalidAction for actions the UI should never send. */
export function applyAction(run: RunState, a: Action, bundle: DataBundle): void {
  if (a.t === 'new_run') throw new InvalidAction('new_run starts a run; use createRun');
  if (run.ended && a.t !== 'settings') throw new InvalidAction('the run is over');
  switch (a.t) {
    case 'block_start': startBlock(run, a.kind, a.target, bundle); break;
    case 'block_end': endBlock(run, bundle); break;
    case 'end_day': endDay(run, bundle); break;
    case 'attempt_start':
      if (run.block?.kind !== 'climb') throw new InvalidAction('not at the crag');
      if (run.res.skin <= 0) throw new InvalidAction('no skin left');
      startAttempt(run, a.route_seed, a.mode, bundle);
      break;
    case 'move': doMove(run, a.limb, a.hold, a.class, bundle, a.perf); break;
    case 'commit': doCommit(run, a.swing, bundle); break;
    case 'wall_action': doWallAction(run, a.kind, bundle); break;
    case 'retire': endRun(run, 'retired', bundle); break;
    case 'settings':
      if (a.patch.auto_commit !== undefined) run.options.auto_commit = a.patch.auto_commit;
      if (a.patch.sweep_speed !== undefined) run.options.sweep_speed = clamp(a.patch.sweep_speed, 0.6, 1.6);
      break;
  }
  run.actions++;
}

/** Immutable variant for the UI: clone, apply, return. */
export function reduce(run: RunState, a: Action, bundle: DataBundle): RunState {
  const draft = structuredClone(run);
  applyAction(draft, a, bundle);
  return draft;
}

/** Rebuild a run from its log (18 §5). The first action must be `new_run`. */
export function replay(actions: readonly Action[], bundle: DataBundle, from?: { state: RunState; index: number }): RunState {
  let run: RunState;
  let i: number;
  if (from) {
    run = structuredClone(from.state);
    i = from.index;
  } else {
    const first = actions[0];
    if (!first || first.t !== 'new_run') throw new InvalidAction('log must start with new_run');
    run = createRun(first.seed, first.spec, bundle);
    i = 1;
  }
  for (; i < actions.length; i++) applyAction(run, actions[i]!, bundle);
  return run;
}

// ---------------------------------------------------------------- read helpers for the UI

export function dateLabel(run: RunState): string {
  return formatDate(calendarDate(run.start_month, run.start_dom, run.day));
}

export function sectorList(run: RunState, bundle: DataBundle): { id: string; name: string; open: boolean; reason?: string }[] {
  const crag = bundle.crags.get(run.crag)!;
  return crag.sectors.map((s) => {
    const st = sectorStatus(s, run.weather, run.last_rain);
    return st.open ? { id: s.id, name: s.name, open: true } : { id: s.id, name: s.name, open: false, reason: st.reason };
  });
}

export { routeEntry };
