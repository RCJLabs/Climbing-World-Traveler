// What a sector, a crag and a session climb (27 M1). A sector's discipline is its styles': bolted styles are sport,
// the rest boulders (06 §2.6). A crag climbs every discipline its sectors do, so one crag can have both, and a session
// climbs its sector's. A sector's rock is its styles' too, so one crag can have sandstone boulders and limestone routes.
// Nothing here names a crag.

import type { RunState } from './state';
import type { Crag, DataBundle, Discipline, RockType, Sector } from './types';

/** The disciplines the engine plays (P1b–P2); trad, DWS and the rest come with P3. */
export type Climb = 'boulder' | 'sport';
/** In the order a crag lists them: boulders first. */
export const CLIMBS: readonly Climb[] = ['boulder', 'sport'];

export const sectorDiscipline = (sector: Pick<Sector, 'style_profiles'>, bundle: Pick<DataBundle, 'profiles'>): Climb =>
  bundle.profiles.get(sector.style_profiles[0]!)?.protection?.kind === 'bolt' ? 'sport' : 'boulder';

/** A crag's disciplines, from its sectors, in CLIMBS order. */
export const cragDisciplines = (crag: Pick<Crag, 'sectors'>, bundle: Pick<DataBundle, 'profiles'>): Climb[] =>
  CLIMBS.filter((d) => crag.sectors.some((s) => sectorDiscipline(s, bundle) === d));

/** The discipline a crag is known by, the first it climbs: what a line about the crag as a whole reads. */
export const mainDiscipline = (crag: Pick<Crag, 'sectors'>, bundle: Pick<DataBundle, 'profiles'>): Climb => cragDisciplines(crag, bundle)[0]!;

/** The discipline of the run's climbing session, or null when there is none. */
export function sessionDiscipline(run: Pick<RunState, 'crag' | 'block'>, bundle: Pick<DataBundle, 'crags' | 'profiles'>): Climb | null {
  const id = run.block?.session?.sector;
  const sector = id ? bundle.crags.get(run.crag)?.sectors.find((s) => s.id === id) : undefined;
  return sector ? sectorDiscipline(sector, bundle) : null;
}

/** What is wrong with a crag's disciplines (validator): a sector mixing bolted and unbolted styles, or a crag whose record names other disciplines than its sectors climb. */
export function disciplineErrors(crag: Crag, bundle: Pick<DataBundle, 'profiles'>): string[] {
  const out: string[] = [];
  for (const s of crag.sectors) {
    const kinds = new Set(s.style_profiles.map((p) => (bundle.profiles.get(p)?.protection?.kind === 'bolt' ? 'sport' : 'boulder')));
    if (kinds.size > 1) out.push(`crag ${crag.id}/${s.id}: mixes bolted and unbolted styles; a sector climbs one discipline`);
  }
  const climbs = cragDisciplines(crag, bundle);
  const listed = [...crag.disciplines].sort();
  if (listed.join() !== [...climbs].sort().join()) out.push(`crag ${crag.id}: disciplines ${crag.disciplines.join(', ')} but its sectors climb ${climbs.join(', ')}`);
  return out;
}

/** A sector's rock, its styles' (06 §2): what its wet rule and the rock knowledge a session there earns go by. The crag's own `rock` is the one it is known by. */
export const sectorRock = (sector: Pick<Sector, 'style_profiles'>, bundle: Pick<DataBundle, 'profiles'>): RockType =>
  bundle.profiles.get(sector.style_profiles[0]!)!.rock;

/** What is wrong with a crag's rock (validator): a sector whose styles are on different rocks, or a crag known by a rock none of its sectors is. */
export function rockErrors(crag: Crag, bundle: Pick<DataBundle, 'profiles'>): string[] {
  const out: string[] = [];
  for (const s of crag.sectors) {
    const rocks = new Set(s.style_profiles.map((p) => bundle.profiles.get(p)?.rock).filter((r) => r !== undefined));
    if (rocks.size > 1) out.push(`crag ${crag.id}/${s.id}: styles on ${[...rocks].join(' and ')}; a sector is one rock`);
  }
  if (!crag.sectors.some((s) => bundle.profiles.get(s.style_profiles[0]!)?.rock === crag.rock)) out.push(`crag ${crag.id}: known by ${crag.rock}, which none of its sectors is`);
  return out;
}

/** A discipline the engine plays, for a discipline field read from data. */
export const asClimb = (d: Discipline | string): Climb => (d === 'sport' ? 'sport' : 'boulder');
