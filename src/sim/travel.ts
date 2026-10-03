// Travel between crags (09 §8, 11 §1, 14 §7; P1b, docs/26): the cheapest path through the travel graph's hubs and
// legs, its cost and the whole days it takes. The reducer pays for it and lets the days pass (run.ts `travel`).

import { phaseLive } from './character';
import type { DataBundle, TravelEdge } from './types';

export interface Trip {
  to: string;
  /** Hub and crag ids from the start to the destination. */
  path: string[];
  legs: TravelEdge[];
  cost: number;
  /** Whole days on the move; never less than one. */
  days: number;
}

/** The id an edge is known by (schemas §5): `${from}__${to}__${mode}`. */
export const edgeId = (e: TravelEdge): string => `${e.from}__${e.to}__${e.mode}`;

/** The cheapest trip from one crag to another, fewer days breaking ties; null when no path joins them. */
export function tripTo(from: string, to: string, bundle: Pick<DataBundle, 'travel'>): Trip | null {
  if (from === to) return null;
  const best = new Map<string, { cost: number; days: number; via: TravelEdge | null; prev: string | null }>([[from, { cost: 0, days: 0, via: null, prev: null }]]);
  const done = new Set<string>();
  for (;;) {
    let node: string | null = null;
    for (const [id, v] of best) {
      if (done.has(id)) continue;
      const b = node === null ? null : best.get(node)!;
      if (!b || v.cost < b.cost || (v.cost === b.cost && v.days < b.days)) node = id;
    }
    if (node === null) return null;
    if (node === to) break;
    done.add(node);
    const here = best.get(node)!;
    for (const e of bundle.travel.edges) {
      const next = e.from === node ? e.to : e.to === node ? e.from : null;
      if (next === null || done.has(next)) continue;
      const cost = here.cost + e.cost;
      const days = here.days + e.days;
      const old = best.get(next);
      if (!old || cost < old.cost || (cost === old.cost && days < old.days)) best.set(next, { cost, days, via: e, prev: node });
    }
  }
  const legs: TravelEdge[] = [];
  const path = [to];
  for (let at = to; best.get(at)!.prev !== null; at = best.get(at)!.prev!) {
    legs.unshift(best.get(at)!.via!);
    path.unshift(best.get(at)!.prev!);
  }
  const end = best.get(to)!;
  return { to, path, legs, cost: end.cost, days: Math.max(1, end.days) };
}

/**
 * What is wrong with the travel graph (docs/20, schemas §5): an edge ending at no crag or hub, or a live crag the
 * others cannot reach, which would strand a climber who started there. Used by `pnpm validate`.
 */
export function travelGraphErrors(bundle: Pick<DataBundle, 'crags' | 'travel'>): string[] {
  const errors: string[] = [];
  const nodes = new Set([...bundle.crags.keys(), ...bundle.travel.hubs.map((h) => h.id)]);
  for (const e of bundle.travel.edges) {
    for (const end of [e.from, e.to]) if (!nodes.has(end)) errors.push(`travel edge ${edgeId(e)}: unknown crag or hub ${end}`);
  }
  const live = [...bundle.crags.values()].filter((c) => phaseLive(c.phase)).map((c) => c.id);
  for (const to of live.slice(1)) if (!tripTo(live[0]!, to, bundle)) errors.push(`travel: no way from ${live[0]} to ${to}`);
  return errors;
}

/** The crags a climber at `from` can travel to in this build: live crags joined to it by the graph. */
export function destinations(from: string, bundle: Pick<DataBundle, 'crags' | 'travel'>): Trip[] {
  const out: Trip[] = [];
  for (const c of bundle.crags.values()) {
    if (c.id === from || !phaseLive(c.phase)) continue;
    const trip = tripTo(from, c.id, bundle);
    if (trip) out.push(trip);
  }
  return out;
}
