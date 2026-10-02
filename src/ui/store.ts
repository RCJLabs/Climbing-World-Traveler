// App state for the UI: the save backend, the live run session, the current screen. Every game action goes
// through `act`, which serialises dispatches so a tap during auto-climb can never interleave with it.

import { signal } from '@preact/signals';
import { bundle } from '../data/bundle';
import { DEFAULT_SETTINGS, emptyMeta, IdbBackend, MemoryBackend, type MetaState, type RunRecord, type SaveBackend, type Settings } from '../save/backend';
import { RunSession } from '../save/session';
import type { RunState } from '../sim/state';
import type { Action, NewRunSpec } from '../sim/types';

export type Screen =
  | { name: 'title' }
  | { name: 'create'; seed?: string; preset?: string }
  | { name: 'planner' }
  | { name: 'crag' }
  | { name: 'routes'; selected?: string }
  | { name: 'attempt' }
  | { name: 'result' }
  | { name: 'character' }
  | { name: 'summary' }
  | { name: 'hall' };

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
  if (r.attempt) return { name: 'attempt' };
  if (r.block?.kind === 'climb') return { name: 'routes' };
  return { name: 'planner' };
}

export async function startRun(seed: string, spec: NewRunSpec): Promise<void> {
  if (!backend) return;
  session = await RunSession.create(backend, data, seed, spec);
  run.value = session.state;
  runs.value = await backend.listRuns();
  screen.value = { name: 'planner' };
}

export async function continueRun(id: string): Promise<void> {
  if (!backend) return;
  try {
    session = await RunSession.load(backend, data, id);
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

export function goto(s: Screen): void {
  screen.value = s;
}
