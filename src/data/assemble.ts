// Builds a DataBundle from the core files and the crag folders (docs/20 §1, 27 M1). Every crag's record, styles and
// name banks are in the bundle from the start; a crag's routes (its signatures and benchmarks) join it when they are
// loaded: from the filesystem in Node (bundle.ts), as a lazy chunk in the app (browser.ts). No crag is named here:
// a crag is whatever folder the data has.
import { cyrb53 } from '../sim/rng';
import type { Background, Crag, CragStyleProfile, DataBundle, InjuryDef, NameBank, Route, Trait, TravelEdge } from '../sim/types';
import { decodeRoutes } from './routefile';
import { BackgroundSchema, CragSchema, InjuryDefSchema, ManifestSchema, NamesSchema, ProfileSchema, RouteSchema, TraitSchema, TravelSchema } from './schema';

/**
 * Content and rules version (18 §5). Bump when the same seed would build a different problem, or the same actions
 * would play out differently. A crag's own content is versioned by its hash in data/manifest.json instead, so adding a
 * crag changes no version (27 §4).
 */
export const DATA_VERSION = 'p2-0';

/** The files of a crag folder, in the order its content hash reads them. */
export const CRAG_FILES = ['crag', 'styles', 'names', 'signatures', 'benchmarks'] as const;

/** A crag folder's content hash (data/manifest.json): cyrb53 over its files' text in CRAG_FILES order, base 36. */
export const cragHash = (texts: readonly string[]): string => cyrb53(texts.join('\u0000')).toString(36);

export interface CoreFiles { traits: unknown; backgrounds: unknown; travel: unknown; manifest: unknown; injuries: unknown }
/** What a crag folder adds to the bundle at once; `id` is the folder's name, which must be its crag's id. */
export interface CragFolder { id: string; crag: unknown; styles: unknown; names: unknown }
/** What it adds when its data is loaded. */
export interface CragRouteFiles { signatures: unknown; benchmarks: unknown }

function byId<T extends { id: string }>(items: T[], what: string): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of items) {
    if (m.has(x.id)) throw new Error(`two ${what} with id ${x.id}`);
    m.set(x.id, x);
  }
  return m;
}

/** The bundle with every crag's record, styles and name banks, and no crag's routes yet. */
export function assembleBundle(core: CoreFiles, folders: readonly CragFolder[], validate: boolean): DataBundle {
  if (validate) {
    TraitSchema.array().parse(core.traits);
    BackgroundSchema.array().parse(core.backgrounds);
    InjuryDefSchema.array().parse(core.injuries);
    TravelSchema.parse(core.travel);
    ManifestSchema.parse(core.manifest);
    for (const f of folders) {
      CragSchema.parse(f.crag);
      ProfileSchema.array().parse(f.styles);
      NamesSchema.parse(f.names);
    }
  }
  for (const f of folders) {
    const id = (f.crag as Partial<Crag> | null)?.id;
    if (id !== f.id) throw new Error(`crag folder ${f.id} holds crag ${String(id)}; a folder is named for its crag`);
  }
  const crags = folders.map((f) => f.crag as Crag).sort((a, b) => (a.id < b.id ? -1 : 1));
  const names: Record<string, NameBank> = {};
  for (const f of folders) {
    for (const [id, bank] of Object.entries(f.names as Record<string, NameBank>)) {
      if (names[id]) throw new Error(`two name banks with id ${id}`);
      names[id] = bank;
    }
  }
  const travel = core.travel as { hubs: DataBundle['travel']['hubs']; edges: TravelEdge[] };
  // Each crag's last mile, either way (09 §8.3), after the legs between hubs.
  const lastMiles: TravelEdge[] = crags.map((c) => ({ from: c.id, to: c.hub, ...c.last_mile }));
  return {
    traits: byId(core.traits as Trait[], 'traits'),
    backgrounds: byId(core.backgrounds as Background[], 'backgrounds'),
    crags: byId(crags, 'crags'),
    profiles: byId(folders.flatMap((f) => f.styles as CragStyleProfile[]), 'style profiles'),
    signatures: new Map(),
    benchmarks: new Map(),
    hashes: new Map(Object.entries((core.manifest as { crags: Record<string, string> }).crags)),
    names,
    travel: { hubs: travel.hubs, edges: [...travel.edges, ...lastMiles] },
    injuries: byId(core.injuries as InjuryDef[], 'injuries'),
    version: DATA_VERSION,
  };
}

/** A crag's routes join the bundle (27 M1): its signatures, by seed, and its benchmark set. */
export function addCragRoutes(bundle: DataBundle, id: string, files: CragRouteFiles, validate: boolean): void {
  if (!bundle.crags.has(id)) throw new Error(`unknown crag ${id}`);
  const sigs = decodeRoutes(files.signatures);
  const bench = decodeRoutes(files.benchmarks);
  if (validate) {
    RouteSchema.array().parse(sigs);
    RouteSchema.array().parse(bench);
  }
  const signatures = bundle.signatures as Map<string, Route>;
  for (const r of sigs as Route[]) signatures.set(r.seed ?? r.id, r);
  (bundle.benchmarks as Map<string, Route[]>).set(id, bench as Route[]);
}

/** Whether a crag's routes are in the bundle, so a run can play there (27 M1: never at a crag whose data is not loaded). */
export const cragLoaded = (bundle: Pick<DataBundle, 'benchmarks'>, id: string): boolean => bundle.benchmarks.has(id);
