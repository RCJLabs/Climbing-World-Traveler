// Carrying a saved run forward to a new version of the game (27 §4, 18 §5). A run records its reducer version and the
// content hash of each crag it has played. A new crag changes no hash a run holds, so the run loads as it was. When
// the reducer or a played crag's content has changed, the newest snapshot goes through one adapter per reducer step,
// then the crags whose content changed are adapted, and that state becomes the run's base: the log continues from it,
// and the actions before it are kept for export but never replayed. No log is replayed across a version step, because
// a newer reducer can make a logged action invalid.
import { parseRouteSeed } from '../sim/routes';
import { mainDiscipline } from '../sim/discipline';
import { CAPACITY, startCapacity } from '../sim/injury';
import { REDUCER_VERSION, type RunState } from '../sim/state';
import type { DataBundle } from '../sim/types';
import type { RunRecord } from './backend';

/** A saved run that cannot be carried forward to this version of the game. */
export class IncompatibleRun extends Error {}

/** The oldest reducer version a run can be carried forward from: the first with an adapter to the next (P2 M1). */
export const OLDEST_ADAPTABLE = 9;

type Json = Record<string, unknown>;

/** One adapter per reducer step: `ADAPTERS[v]` takes a run state of reducer version v to version v + 1. */
export const ADAPTERS: Record<number, (state: Json, bundle: DataBundle) => Json> = {
  // 9 → 10 (27 M1): an estimate per discipline. The run's estimate and each week point's `E` were one number, a route
  // grade at a sport crag; a week point's crag was absent before P1b's travel, when every point was at the start crag.
  // Ticks gain the crag they were climbed at.
  9: (s, bundle) => {
    const home = (s.visited as string[])[0]!;
    const discipline = (crag: string) => { const c = bundle.crags.get(crag); return c ? mainDiscipline(c, bundle) : 'boulder'; };
    const est = s.est as number | null;
    const history = (s.history as (Json & { E: number | null; crag?: string })[]).map(({ E, crag, ...p }) => {
      const where = crag ?? home;
      return { ...p, crag: where, est: E === null ? null : { [discipline(where)]: E } };
    });
    const ticks = (s.ticks as (Json & { route_seed: string; area: string; crag?: string })[])
      .map((t) => (t.crag ? t : { ...t, crag: routeCrag(t.route_seed, t.area, bundle) ?? home }));
    return { ...s, est: est === null ? null : { [discipline(s.crag as string)]: est }, history, ticks };
  },
  // 10 → 11 (27 M2): injuries and health. A run from before M2 has had no injury: an empty list and no ceiling losses.
  // Its tendons and body are adapted to the load it has been climbing (12 §2): the capacities are its chronic load (a
  // finger share of it), never under a habitual climber's. The finger column and the week's exposure start empty; it
  // arrived where it is when its weekly points last changed crag; a session in progress and a finished run's summary
  // gain their new fields.
  10: (s) => {
    const counters = s.counters as Json & { loads: number[] };
    const last = counters.loads.slice(-28);
    const chronic = last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0;
    const start = startCapacity(((s.attrs as Record<string, { value: number }>).finger_strength?.value) ?? 20);
    const history = s.history as { day: number; crag: string }[];
    let arrived = 0;
    for (let k = history.length - 1; k > 0; k--) {
      if (history[k]!.crag !== history[k - 1]!.crag) { arrived = history[k]!.day; break; }
    }
    const block = s.block as (Json & { session?: Json }) | null;
    const ended = s.ended as Json | null;
    return {
      ...s,
      injuries: [], ceiling_loss: {}, finger_today: 0,
      capacity: { finger: Math.max(start.finger, 0.6 * chronic), general: Math.max(CAPACITY.general0, chronic) },
      counters: { ...counters, finger_loads: [], exposure: {}, exposure_total: 0, tired_week: false, antagonists_until: -1, arrived_day: arrived },
      block: block?.session ? { ...block, session: { ...block.session, exposure: {}, moves_n: 0, finger_moves: 0 } } : block,
      ended: ended ? { ...ended, injuries: 0 } : null,
    };
  },
};

/** The content hashes of the crags a run has played, in the order it reached them: what its record holds. */
export const contentHashes = (state: Pick<RunState, 'visited'>, bundle: Pick<DataBundle, 'hashes'>): Record<string, string> =>
  Object.fromEntries(state.visited.filter((id) => bundle.hashes.has(id)).map((id) => [id, bundle.hashes.get(id)!]));

/**
 * What loading a saved run under this build needs: nothing (`null`), carrying it forward (`'carry'`), or it cannot be
 * loaded (the reason). A run carries forward when the reducer is newer, when the rules every crag shares (the data
 * version) changed, or when a crag it has played has another hash now.
 */
export function carryNeed(record: RunRecord, bundle: Pick<DataBundle, 'version' | 'hashes'>): null | 'carry' | string {
  if (record.version > REDUCER_VERSION) return 'It was saved by a newer version of the game.';
  if (record.version < OLDEST_ADAPTABLE) return 'It was made with a version of the game too old to carry forward.';
  if (record.version < REDUCER_VERSION || record.data_version !== bundle.version) return 'carry';
  return Object.entries(record.hashes ?? {}).some(([id, h]) => bundle.hashes.get(id) !== h) ? 'carry' : null;
}

/** The crags whose content changed since the record was written: every crag played when the shared rules changed. */
export function changedCrags(record: RunRecord, state: Pick<RunState, 'visited'>, bundle: Pick<DataBundle, 'version' | 'hashes'>): string[] {
  if (record.data_version !== bundle.version) return [...state.visited];
  return state.visited.filter((id) => record.hashes?.[id] !== undefined && record.hashes[id] !== bundle.hashes.get(id));
}

/** A snapshot of reducer version `from` through every adapter to this version. */
export function adaptState(state: RunState, from: number, bundle: DataBundle): RunState {
  let s = state as unknown as Json;
  for (let v = from; v < REDUCER_VERSION; v++) {
    const step = ADAPTERS[v];
    if (!step) throw new IncompatibleRun(`No way to carry a run from version ${v} of the game to ${v + 1}.`);
    s = { ...step(s, bundle), v: v + 1 };
  }
  return s as unknown as RunState;
}

/**
 * The crag a route is at: from its seed when it is generated, else (a signature) from its sector, whose crag record is
 * always in the bundle even when the crag's routes are not loaded.
 */
function routeCrag(seed: string, area: string, bundle: Pick<DataBundle, 'crags'>): string | undefined {
  return parseRouteSeed(seed)?.crag ?? [...bundle.crags.values()].find((c) => c.sectors.some((x) => x.id === area))?.id;
}

/**
 * The crags whose content changed rebuild their routes from the same seeds, maybe differently (27 §4): a project there
 * keeps its attempts, sessions and grade, and loses what it knew of the old moves (its familiarity, best height, holds
 * found and any reach verdict). One journal line per crag says so.
 */
export function adaptContent(state: RunState, changed: readonly string[], bundle: Pick<DataBundle, 'crags'>): void {
  if (!changed.length) return;
  const hit = new Map<string, number>();
  for (const p of Object.values(state.projects)) {
    const crag = routeCrag(p.seed, p.area, bundle);
    if (!crag || !changed.includes(crag)) continue;
    p.attempt_eq = 0;
    p.best = 0;
    p.revealed = [];
    p.fall_fear = 0;
    delete p.reach_until;
    hit.set(crag, (hit.get(crag) ?? 0) + 1);
  }
  for (const [crag, n] of hit) {
    const name = bundle.crags.get(crag)?.name ?? crag;
    state.journal.push({ day: state.day, text: `An update rebuilt the routes at ${name}: ${n === 1 ? 'your project there keeps its' : `your ${n} projects there keep their`} attempts, but the moves have to be learnt again.`, tone: 'info' });
  }
}
