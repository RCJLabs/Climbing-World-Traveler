// App state for the UI: the save backend, the live run session, the current screen. Every game action goes
// through `act` or `simulate`, which serialise writes so two taps can never interleave.

import { signal } from '@preact/signals';
import { bundle, loadCrag } from '../data/browser';
import { DEFAULT_SETTINGS, emptyMeta, IdbBackend, MemoryBackend, type MetaState, type RunRecord, type SaveBackend, type Settings } from '../save/backend';
import { cragsToLoad, RunSession } from '../save/session';
import { simulateAttempt } from '../sim/attempt';
import { applyAction } from '../sim/run';
import type { AttemptResult, AttemptState, RunState } from '../sim/state';
import { nextSessionAttempt, simulateDays, tired } from '../sim/tactics';
import type { Action, AttemptMode, NewRunSpec, SessionTactic } from '../sim/types';
import { buildReport, type Report } from './report';

export type Screen =
  | { name: 'title' }
  | { name: 'create'; seed?: string; preset?: string }
  | { name: 'planner' }
  | { name: 'crag' }
  | { name: 'routes'; selected?: string }
  | { name: 'watch' }
  | { name: 'result' }
  | { name: 'report' }
  | { name: 'character' }
  | { name: 'summary' }
  | { name: 'hall' };

/** One step of an attempt for the wall to play back (docs/24 §5): the attempt as it stood, and the skin left. */
export interface Frame { at: AttemptState; skin: number }

export const data = bundle();
export const screen = signal<Screen>({ name: 'title' });
export const run = signal<RunState | null>(null);
export const meta = signal<MetaState>(emptyMeta());
export const settings = signal<Settings>(DEFAULT_SETTINGS);
export const runs = signal<RunRecord[]>([]);
export const toast = signal<string | null>(null);
/** Set when a new version of the app is installed and waiting; calling it reloads into the new version. */
export const updateReady = signal<(() => void) | null>(null);
export const storageNote = signal<string | null>(null);
/** The attempt the wall is playing back. */
export const playback = signal<{ seed: string; frames: Frame[] } | null>(null);
/** The last simulated session or stretch of days, for the report screen. */
export const report = signal<Report | null>(null);
/** True while a simulation is being worked out and written. */
export const busy = signal(false);

let backend: SaveBackend | null = null;
let session: RunSession | null = null;
let queue: Promise<unknown> = Promise.resolve();

export async function boot(): Promise<void> {
  try {
    backend = await IdbBackend.open();
  } catch {
    backend = new MemoryBackend();
    storageNote.value = 'Saving is unavailable in this browser mode. Progress will be lost when you close the tab.';
  }
  meta.value = await backend.getMeta();
  settings.value = { ...DEFAULT_SETTINGS, ...(await backend.getSettings()) };
  runs.value = (await backend.listRuns()).sort((a, b) => b.last_played.localeCompare(a.last_played));
}

export function say(msg: string): void {
  toast.value = msg;
  setTimeout(() => { if (toast.value === msg) toast.value = null; }, 3200);
}

/** Where a loaded or updated run should be shown. */
export function homeFor(r: RunState): Screen {
  if (r.ended) return { name: 'summary' };
  if (r.block?.kind === 'climb') return { name: 'routes' };
  return { name: 'planner' };
}

/**
 * Fetch a crag's routes before a run plays there (27 M1): the chunk comes from the service worker's cache, or the
 * network the first time. False, with a message, when it cannot be had.
 */
export async function ensureCrag(id: string): Promise<boolean> {
  try {
    await loadCrag(id);
    return true;
  } catch {
    say(`Could not load ${data.crags.get(id)?.name ?? id}. Connect to the internet once to download it.`);
    return false;
  }
}

export async function startRun(seed: string, spec: NewRunSpec): Promise<void> {
  if (!backend) return;
  const start = data.backgrounds.get(spec.background)?.start_crag;
  if (start && !(await ensureCrag(start))) return;
  session = await RunSession.create(backend, data, seed, spec);
  run.value = session.state;
  runs.value = await backend.listRuns();
  screen.value = { name: 'planner' };
}

export async function continueRun(id: string): Promise<void> {
  if (!backend) return;
  const record = await backend.getRun(id);
  if (!record) return;
  for (const crag of cragsToLoad(record, data)) if (!(await ensureCrag(crag))) return;
  try {
    session = await RunSession.load(backend, data, id);
    // A run carried forward from an older version may stand at a crag its record did not name.
    if (!(await ensureCrag(session.state.crag))) return;
    run.value = session.state;
    screen.value = homeFor(session.state);
  } catch (e) {
    say(`Could not load that run: ${(e as Error).message}`);
  }
}

export async function deleteRun(id: string): Promise<void> {
  if (!backend) return;
  await backend.deleteRun(id);
  runs.value = (await backend.listRuns()).sort((a, b) => b.last_played.localeCompare(a.last_played));
}

/** Set off for another crag along the trip's legs, its routes fetched first (27 M1). */
export async function travel(to: string, legs: string[]): Promise<boolean> {
  return (await ensureCrag(to)) && act({ t: 'travel', to, legs });
}

/** Dispatch a game action. Resolves to true when it was applied and saved. */
export function act(a: Action): Promise<boolean> {
  const p = queue.then(async () => {
    if (!session) return false;
    try {
      const wasEnded = !!session.state.ended;
      run.value = await session.dispatch(a);
      if (!wasEnded && run.value.ended && backend) {
        meta.value = await backend.getMeta();
        runs.value = await backend.listRuns();
      }
      return true;
    } catch (e) {
      say((e as Error).message);
      return false;
    }
  });
  queue = p.catch(() => undefined);
  return p;
}

export async function saveSettings(s: Settings): Promise<void> {
  settings.value = s;
  await backend?.putSettings(s);
}

export async function exportCurrent(): Promise<void> {
  if (!session) return;
  const file = await session.exportFile();
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file.record.title.replace(/\W+/g, '_')}_${file.record.run_seed}.cwt.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Work a stretch out on a draft and write it (docs/24 §2): simulated days or a session. Serialised with `act`.
 * Resolves to the state before and after, or null if nothing was written.
 */
export function simulate(play: (draft: RunState) => Action[]): Promise<{ before: RunState; after: RunState } | null> {
  const p = queue.then(async () => {
    if (!session) return null;
    busy.value = true;
    try {
      // Let "Simulating…" paint before the work starts.
      await new Promise((r) => setTimeout(r, 30));
      const before = session.state;
      const wasEnded = !!before.ended;
      const after = await session.simulate(play);
      run.value = after;
      if (!wasEnded && after.ended && backend) {
        meta.value = await backend.getMeta();
        runs.value = await backend.listRuns();
      }
      return after === before ? null : { before, after };
    } catch (e) {
      say((e as Error).message);
      return null;
    } finally {
      busy.value = false;
    }
  });
  queue = p.catch(() => undefined);
  return p;
}

/** The frames of an attempt from a state, by the same simulation the reducer runs (docs/24 §5). */
function framesOf(from: RunState, seed: string, mode: AttemptMode): Frame[] {
  const draft = structuredClone(from);
  const frames: Frame[] = [];
  simulateAttempt(draft, seed, mode, data, (r) => { if (r.attempt) frames.push({ at: structuredClone(r.attempt), skin: r.res.skin }); });
  return frames;
}

/** One simulated attempt (docs/24 §3): played back on the wall when Watch is on, else straight to the result. */
export async function tryProblem(seed: string, mode: AttemptMode): Promise<void> {
  const watch = settings.value.watch && !settings.value.reduce_motion;
  let frames: Frame[] = [];
  const r = await simulate((draft) => {
    // The frames come from the very state the attempt is applied to, so the playback is the attempt.
    if (watch) frames = framesOf(draft, seed, mode);
    const a: Action = { t: 'attempt', route_seed: seed, mode };
    applyAction(draft, a, data);
    return [a];
  });
  if (!r) return;
  if (watch) {
    playback.value = { seed, frames };
    goto({ name: 'watch' });
  } else goto({ name: 'result' });
}

/** Attempts on one problem until it goes, the climber is tired, or `max` attempts (docs/24 §3), then the report. */
export async function siege(seed: string, mode: AttemptMode, max = 5): Promise<void> {
  const tries: AttemptResult[] = [];
  const r = await simulate((draft) => {
    const log: Action[] = [];
    for (let i = 0; i < max && !tired(draft); i++) {
      const a: Action = { t: 'attempt', route_seed: seed, mode: i === 0 ? mode : 'redpoint' };
      applyAction(draft, a, data);
      log.push(a);
      tries.push(draft.last_attempt!);
      if (draft.last_attempt?.outcome === 'sent') break;
    }
    return log;
  });
  if (!r) return;
  report.value = buildReport('session', `${r.after.last_attempt?.name ?? 'The problem'}: ${tries.length} ${tries.length === 1 ? 'attempt' : 'attempts'}`, r.before, r.after, data, tries);
  goto({ name: 'report' });
}

/** The rest of the session played by a tactic, then the session ends (docs/24 §3). */
export async function finishSession(tactic: SessionTactic): Promise<void> {
  const tries: AttemptResult[] = [];
  const sector = run.value?.block?.session?.sector;
  const r = await simulate((draft) => {
    const log: Action[] = [];
    for (let a = nextSessionAttempt(draft, data, tactic); a; a = nextSessionAttempt(draft, data, tactic)) {
      const act: Action = { t: 'attempt', ...a };
      applyAction(draft, act, data);
      log.push(act);
      tries.push(draft.last_attempt!);
    }
    applyAction(draft, { t: 'block_end' }, data);
    log.push({ t: 'block_end' });
    return log;
  });
  if (!r) return;
  const name = data.crags.get(r.after.crag)?.sectors.find((s) => s.id === sector)?.name ?? 'The session';
  report.value = buildReport('session', `${name}: ${tactic === 'project' ? 'projecting' : 'mileage'}`, r.before, r.after, data, tries);
  goto({ name: 'report' });
}

/** Days played by the week plan (docs/24 §2), then the report. Stops early when the run ends. */
export async function simulatePlan(days: number): Promise<void> {
  const r = await simulate((draft) => simulateDays(draft, data, days));
  if (!r) return;
  const n = r.after.day - r.before.day;
  report.value = buildReport('days', n === 1 ? 'One day' : n === 7 ? 'One week' : `${n} days`, r.before, r.after, data);
  goto({ name: 'report' });
}

export function goto(s: Screen): void {
  screen.value = s;
}
