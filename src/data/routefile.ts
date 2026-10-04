// The compact route file (27 M1, 18 §7): a crag's benchmarks store each route's holds and beta line as columns, the
// keys once and an array of values per key, instead of an object per hold. Gzip folds repeated keys already, but
// columns of like numbers compress further: the Kalymnos benchmarks go from 149 to about 100 kB gzipped. Lossless:
// decoding gives back every route as it was, keys in the same order. A plain array of routes (the signatures, which
// people edit) reads as it is.
import type { Route } from '../sim/types';

export const ROUTE_FORMAT = 'cwt-routes-1';

interface Columns { keys: string[]; cols: unknown[][] }
type CompactRoute = Omit<Route, 'holds' | 'beta_line'> & { holds: Columns; beta_line: Columns };
export interface RouteFile { format: typeof ROUTE_FORMAT; routes: CompactRoute[] }

/** Rows as columns: every key any row has, in the order first met; a row without a key stores null there. */
function toColumns(rows: readonly object[]): Columns {
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  const cols = keys.map((k) => rows.map((r) => {
    const v = (r as Record<string, unknown>)[k];
    // null marks a missing key, so a stored null could not come back as itself.
    if (v === null) throw new Error(`a route file cannot store null (${k})`);
    return v === undefined ? null : v;
  }));
  return { keys, cols };
}

function fromColumns(c: Columns): Record<string, unknown>[] {
  const n = c.cols[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) => {
    const row: Record<string, unknown> = {};
    c.keys.forEach((k, j) => { const v = c.cols[j]![i]; if (v !== null) row[k] = v; });
    return row;
  });
}

export function encodeRoutes(routes: readonly Route[]): RouteFile {
  return { format: ROUTE_FORMAT, routes: routes.map((r) => ({ ...r, holds: toColumns(r.holds), beta_line: toColumns(r.beta_line) })) };
}

/** The routes of a route file, compact or a plain array, for the schema to check. */
export function decodeRoutes(file: unknown): unknown[] {
  if (Array.isArray(file)) return file;
  const f = file as Partial<RouteFile> | null;
  if (f?.format !== ROUTE_FORMAT || !Array.isArray(f.routes)) throw new Error('not a route file');
  return f.routes.map((r) => ({ ...r, holds: fromColumns(r.holds), beta_line: fromColumns(r.beta_line) }));
}
