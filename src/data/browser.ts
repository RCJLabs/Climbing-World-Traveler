// Loads the content in the app (27 M1). The crag folders are found by globbing data/crags, so a crag added as a folder
// is in the next build with no code change. Every crag's record, styles and name banks come in the first bundle; a
// crag's routes, the bulk of its data, are one lazy chunk per crag, fetched by `loadCrag` before a run plays there.
// Content is validated in development; production builds trust the build (the validator ran in CI).
import traitsJson from '../../data/traits.json';
import backgroundsJson from '../../data/backgrounds.json';
import travelJson from '../../data/travel.json';
import manifestJson from '../../data/manifest.json';
import type { DataBundle } from '../sim/types';
import { addCragRoutes, assembleBundle, cragLoaded } from './assemble';

const records = import.meta.glob<unknown>('../../data/crags/*/crag.json', { eager: true, import: 'default' });
const styles = import.meta.glob<unknown>('../../data/crags/*/styles.json', { eager: true, import: 'default' });
const banks = import.meta.glob<unknown>('../../data/crags/*/names.json', { eager: true, import: 'default' });
const signatures = import.meta.glob<unknown>('../../data/crags/*/signatures.json', { import: 'default' });
const benchmarks = import.meta.glob<unknown>('../../data/crags/*/benchmarks.json', { import: 'default' });

const validate = import.meta.env?.DEV ?? true;
const pathOf = (id: string, file: string): string => `../../data/crags/${id}/${file}.json`;

let cached: DataBundle | null = null;
export function bundle(): DataBundle {
  if (cached) return cached;
  const ids = Object.keys(records).map((p) => /\/crags\/([a-z0-9_]+)\//.exec(p)![1]!).sort();
  cached = assembleBundle(
    { traits: traitsJson, backgrounds: backgroundsJson, travel: travelJson, manifest: manifestJson },
    ids.map((id) => ({ crag: records[pathOf(id, 'crag')], styles: styles[pathOf(id, 'styles')], names: banks[pathOf(id, 'names')] })),
    validate,
  );
  return cached;
}

const pending = new Map<string, Promise<void>>();

/** Fetch a crag's routes into the bundle, once (27 M1). Resolves at once when they are there already. */
export function loadCrag(id: string): Promise<void> {
  const b = bundle();
  if (cragLoaded(b, id)) return Promise.resolve();
  let p = pending.get(id);
  if (!p) {
    const sig = signatures[pathOf(id, 'signatures')];
    const bench = benchmarks[pathOf(id, 'benchmarks')];
    if (!sig || !bench) return Promise.reject(new Error(`no data for crag ${id}`));
    p = Promise.all([sig(), bench()]).then(([s, m]) => addCragRoutes(b, id, { signatures: s, benchmarks: m }, validate));
    p.catch(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}
