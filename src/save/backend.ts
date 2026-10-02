// Storage backends for event-sourced saves (docs/18 §5). The IndexedDB backend is what ships; the memory
// backend has identical semantics and runs the save logic in tests and the headless harness.

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RunState } from '../sim/state';
import type { Action, RunSummary } from '../sim/types';

export interface RunRecord {
  id: string;
  version: number;
  run_seed: string;
  data_version: string;
  created: string;
  title: string;
  last_played: string;
  action_count: number;
  day: number;
  summary?: RunSummary;
}

/** Account-level state outside any run (schemas §8 MetaState, P1a subset). */
export interface MetaState {
  version: number;
  unlocks: string[];
  hall_of_fame: RunSummary[];
  /** DI step → sends across all runs (16 §7). */
  pyramid: Record<string, number>;
}

export const emptyMeta = (): MetaState => ({ version: 1, unlocks: [], hall_of_fame: [], pyramid: {} });

export interface Settings {
  reduce_motion: boolean;
  /** Play a single attempt back on the wall, or go straight to its result (docs/24 §5). */
  watch: boolean;
  /** Playback speed on the wall: 1, 2 or 4. */
  speed: number;
}

export const DEFAULT_SETTINGS: Settings = { reduce_motion: false, watch: true, speed: 1 };

export interface SaveBackend {
  listRuns(): Promise<RunRecord[]>;
  getRun(id: string): Promise<RunRecord | undefined>;
  /** Write the run record and one action chunk in a single transaction (18 §5 write path). */
  append(record: RunRecord, chunkIndex: number, chunk: readonly Action[]): Promise<void>;
  /** Write the run record and several action chunks in a single transaction (a simulated stretch of days, docs/24 §2). */
  appendChunks(record: RunRecord, chunks: readonly (readonly [number, readonly Action[]])[]): Promise<void>;
  getChunks(id: string, fromChunk: number): Promise<Action[][]>;
  putSnapshot(id: string, actionIndex: number, state: RunState, keep: number): Promise<void>;
  latestSnapshot(id: string): Promise<{ index: number; state: RunState } | undefined>;
  deleteSnapshots(id: string): Promise<void>;
  deleteRun(id: string): Promise<void>;
  getMeta(): Promise<MetaState>;
  putMeta(m: MetaState): Promise<void>;
  getSettings(): Promise<Settings>;
  putSettings(s: Settings): Promise<void>;
}

// ---------------------------------------------------------------- memory

export class MemoryBackend implements SaveBackend {
  private runs = new Map<string, RunRecord>();
  private chunks = new Map<string, Action[]>();
  private snaps = new Map<string, Map<number, RunState>>();
  private meta = emptyMeta();
  private settings = DEFAULT_SETTINGS;
  /** Count of append calls, for tests of the write path. */
  writes = 0;

  async listRuns() { return [...this.runs.values()].map((r) => structuredClone(r)); }
  async getRun(id: string) { const r = this.runs.get(id); return r && structuredClone(r); }
  async append(record: RunRecord, chunkIndex: number, chunk: readonly Action[]) {
    await this.appendChunks(record, [[chunkIndex, chunk]]);
  }
  async appendChunks(record: RunRecord, chunks: readonly (readonly [number, readonly Action[]])[]) {
    this.writes++;
    this.runs.set(record.id, structuredClone(record));
    for (const [i, c] of chunks) this.chunks.set(`${record.id}|${i}`, structuredClone([...c]));
  }
  async getChunks(id: string, fromChunk: number) {
    const out: Action[][] = [];
    for (let i = fromChunk; this.chunks.has(`${id}|${i}`); i++) out.push(structuredClone(this.chunks.get(`${id}|${i}`)!));
    return out;
  }
  async putSnapshot(id: string, actionIndex: number, state: RunState, keep: number) {
    const m = this.snaps.get(id) ?? new Map<number, RunState>();
    m.set(actionIndex, structuredClone(state));
    const keys = [...m.keys()].sort((a, b) => b - a);
    for (const k of keys.slice(keep)) m.delete(k);
    this.snaps.set(id, m);
  }
  async latestSnapshot(id: string) {
    const m = this.snaps.get(id);
    if (!m || m.size === 0) return undefined;
    const index = Math.max(...m.keys());
    return { index, state: structuredClone(m.get(index)!) };
  }
  async deleteSnapshots(id: string) { this.snaps.delete(id); }
  async deleteRun(id: string) {
    this.runs.delete(id);
    this.snaps.delete(id);
    for (const k of [...this.chunks.keys()]) if (k.startsWith(`${id}|`)) this.chunks.delete(k);
  }
  async getMeta() { return structuredClone(this.meta); }
  async putMeta(m: MetaState) { this.meta = structuredClone(m); }
  async getSettings() { return { ...this.settings }; }
  async putSettings(s: Settings) { this.settings = { ...s }; }
}

// ---------------------------------------------------------------- IndexedDB

interface CwtDB extends DBSchema {
  runs: { key: string; value: RunRecord };
  actions: { key: [string, number]; value: { run: string; chunk: number; actions: Action[] } };
  snapshots: { key: [string, number]; value: { run: string; index: number; state: RunState } };
  meta: { key: string; value: MetaState };
  settings: { key: string; value: Settings };
}

export class IdbBackend implements SaveBackend {
  private constructor(private db: IDBPDatabase<CwtDB>) {}

  static async open(name = 'climbing-world-traveler'): Promise<IdbBackend> {
    const db = await openDB<CwtDB>(name, 1, {
      upgrade(d) {
        d.createObjectStore('runs', { keyPath: 'id' });
        d.createObjectStore('actions', { keyPath: ['run', 'chunk'] });
        d.createObjectStore('snapshots', { keyPath: ['run', 'index'] });
        d.createObjectStore('meta');
        d.createObjectStore('settings');
      },
    });
    return new IdbBackend(db);
  }

  async listRuns() { return this.db.getAll('runs'); }
  async getRun(id: string) { return this.db.get('runs', id); }

  async append(record: RunRecord, chunkIndex: number, chunk: readonly Action[]) {
    await this.appendChunks(record, [[chunkIndex, chunk]]);
  }

  async appendChunks(record: RunRecord, chunks: readonly (readonly [number, readonly Action[]])[]) {
    const tx = this.db.transaction(['runs', 'actions'], 'readwrite');
    await Promise.all([
      tx.objectStore('runs').put(record),
      ...chunks.map(([i, c]) => tx.objectStore('actions').put({ run: record.id, chunk: i, actions: [...c] })),
      tx.done,
    ]);
  }

  async getChunks(id: string, fromChunk: number) {
    const rows = await this.db.getAll('actions', IDBKeyRange.bound([id, fromChunk], [id, Number.MAX_SAFE_INTEGER]));
    return rows.sort((a, b) => a.chunk - b.chunk).map((r) => r.actions);
  }

  async putSnapshot(id: string, actionIndex: number, state: RunState, keep: number) {
    const tx = this.db.transaction('snapshots', 'readwrite');
    await tx.store.put({ run: id, index: actionIndex, state });
    const keys = await tx.store.getAllKeys(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    const stale = keys.sort((a, b) => b[1] - a[1]).slice(keep);
    for (const k of stale) await tx.store.delete(k);
    await tx.done;
  }

  async latestSnapshot(id: string) {
    const cursor = await this.db.transaction('snapshots').store.openCursor(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]), 'prev');
    return cursor ? { index: cursor.value.index, state: cursor.value.state } : undefined;
  }

  async deleteSnapshots(id: string) {
    const tx = this.db.transaction('snapshots', 'readwrite');
    const keys = await tx.store.getAllKeys(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    for (const k of keys) await tx.store.delete(k);
    await tx.done;
  }

  async deleteRun(id: string) {
    await this.deleteSnapshots(id);
    const tx = this.db.transaction(['runs', 'actions'], 'readwrite');
    const keys = await tx.objectStore('actions').getAllKeys(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    for (const k of keys) await tx.objectStore('actions').delete(k);
    await tx.objectStore('runs').delete(id);
    await tx.done;
  }

  async getMeta() { return (await this.db.get('meta', 'meta')) ?? emptyMeta(); }
  async putMeta(m: MetaState) { await this.db.put('meta', m, 'meta'); }
  async getSettings() { return (await this.db.get('settings', 'settings')) ?? DEFAULT_SETTINGS; }
  async putSettings(s: Settings) { await this.db.put('settings', s, 'settings'); }
}
