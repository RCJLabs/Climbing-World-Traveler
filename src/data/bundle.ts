// Loads the authored content into a DataBundle. Content is validated against the Zod schemas at load in
// development and in tests; production builds trust the build (the validator ran in CI).
import traitsJson from '../../data/traits.json';
import backgroundsJson from '../../data/backgrounds.json';
import cragsJson from '../../data/crags.json';
import profilesJson from '../../data/style_profiles.json';
import namesJson from '../../data/names.json';
import signaturesJson from '../../data/routes/fontainebleau_signatures.json';
import fontBenchmarksJson from '../../data/routes/fontainebleau_benchmarks.json';
import { BackgroundSchema, CragSchema, NamesSchema, ProfileSchema, RouteSchema, TraitSchema } from './schema';
import type { Background, Crag, CragStyleProfile, DataBundle, NameBank, Route, Trait } from '../sim/types';

/**
 * Content and rules version (18 §5). Bump when the same seed would build a different problem, or the same actions
 * would play out differently: P1a keeps no old generators or reducers, so such a run cannot be replayed.
 */
export const DATA_VERSION = 'p1a-5';

const byId = <T extends { id: string }>(items: T[]): Map<string, T> => new Map(items.map((x) => [x.id, x]));

export function loadBundle(validate = true): DataBundle {
  if (validate) {
    TraitSchema.array().parse(traitsJson);
    BackgroundSchema.array().parse(backgroundsJson);
    CragSchema.array().parse(cragsJson);
    ProfileSchema.array().parse(profilesJson);
    NamesSchema.parse(namesJson);
    RouteSchema.array().parse(signaturesJson);
    RouteSchema.array().parse(fontBenchmarksJson);
  }
  const signatures = (signaturesJson as unknown as Route[]);
  return {
    traits: byId(traitsJson as unknown as Trait[]),
    backgrounds: byId(backgroundsJson as unknown as Background[]),
    crags: byId(cragsJson as unknown as Crag[]),
    profiles: byId(profilesJson as unknown as CragStyleProfile[]),
    signatures: new Map(signatures.map((r) => [r.seed ?? r.id, r])),
    benchmarks: new Map([['fontainebleau', fontBenchmarksJson as unknown as Route[]]]),
    names: namesJson as unknown as Record<string, NameBank>,
    version: DATA_VERSION,
  };
}

let cached: DataBundle | null = null;
export function bundle(): DataBundle {
  if (!cached) cached = loadBundle(import.meta.env?.DEV ?? true);
  return cached;
}
