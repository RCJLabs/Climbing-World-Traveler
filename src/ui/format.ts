// Display helpers: names for attributes, money, grades, bands.

import { fontGrade, gradeFor } from '../sim/grades';
import { cragDisciplines, type Climb } from '../sim/discipline';
import type { AttrId, CircuitColour, Crag, DataBundle, MoveClass, RockType, Tick } from '../sim/types';

export const ATTR_LABEL: Record<AttrId, string> = {
  finger_strength: 'Finger strength', finger_endurance: 'Finger endurance', pull_power: 'Pull power', lockoff: 'Lock-off',
  core_tension: 'Core tension', hip_mobility: 'Hip mobility', shoulder_mobility: 'Shoulder mobility', leg_power: 'Leg power',
  aerobic_capacity: 'Aerobic capacity', anaerobic_capacity: 'Anaerobic capacity', contact_strength: 'Contact strength',
  skin_durability: 'Skin durability', footwork: 'Footwork', body_position: 'Body position', route_reading: 'Route reading',
  dynamic_movement: 'Dynamic movement', tech_crimps: 'Crimps', tech_slopers: 'Slopers', tech_pinches: 'Pinches',
  tech_pockets: 'Pockets', tech_cracks: 'Cracks', tech_slab: 'Slab', rope_craft: 'Rope craft', gear_placement: 'Gear placement',
  composure: 'Composure', focus: 'Focus', confidence: 'Confidence', commitment: 'Commitment', risk_judgement: 'Risk judgement',
  resilience: 'Resilience', nutrition: 'Nutrition', sleep_hygiene: 'Sleep', logistics: 'Logistics', languages: 'Languages',
  weather_sense: 'Weather sense',
};

/** Attributes that do nothing until a later phase; hidden from allocation and sheets. Rope craft is live from P1b. */
export const LATER_ATTRS: readonly AttrId[] = ['tech_cracks', 'gear_placement', 'languages', 'logistics'];

export const CLASS_LABEL: Record<MoveClass, string> = {
  static: 'static', deadpoint: 'deadpoint', dyno: 'dyno', high_step: 'high step', heel_hook: 'heel hook', toe_hook: 'toe hook',
  mantle: 'mantle', jam: 'jam', match: 'match', bump: 'bump', kneebar: 'kneebar',
};

export const money = (n: number): string => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
/** A boulder grade (Font). */
export const grade = (di: number): string => fontGrade(di);
/** A grade in a discipline, in the system of the crag it is shown at (08, 27 M1); Font and French with no crag. */
export const gradeAt = (di: number, discipline: Climb, crag?: Pick<Crag, 'grades'>): string => gradeFor(di, discipline, crag);
export const gradeOf = (r: { di_graded: number; discipline: string }, crag?: Pick<Crag, 'grades'>): string => gradeFor(r.di_graded, r.discipline, crag);
/** A tick in the system of the crag it was climbed at. */
export const tickGrade = (t: Pick<Tick, 'di' | 'discipline' | 'crag'>, bundle: Pick<DataBundle, 'crags'>): string =>
  gradeFor(t.di, t.discipline ?? 'boulder', t.crag ? bundle.crags.get(t.crag) : undefined);
/** What a crag climbs, in words: bouldering, sport routes, or both. */
export const climbsLabel = (c: Crag, bundle: Pick<DataBundle, 'profiles'>): string =>
  cragDisciplines(c, bundle).map((d) => (d === 'sport' ? 'sport routes' : 'bouldering')).join(' and ');

export const ROCK_LABEL: Partial<Record<RockType, string>> = { sandstone_font: 'fine sandstone', limestone: 'limestone' };
export const COUNTRY_LABEL: Record<string, string> = { FR: 'France', GR: 'Greece' };
export const pct = (p: number): string => `${Math.round(p * 100)}%`;
export const signed = (n: number, d = 1): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;

export function band(p: number): 'solid' | 'probably' | 'sketchy' | 'desperate' {
  return p >= 0.9 ? 'solid' : p >= 0.65 ? 'probably' : p >= 0.35 ? 'sketchy' : 'desperate';
}

export const bandColour = (p: number): string => (p >= 0.9 ? 'var(--good)' : p >= 0.65 ? 'var(--sky)' : p >= 0.35 ? 'var(--accent)' : 'var(--warn)');

export const CIRCUIT_LABEL: Record<CircuitColour, string> = { yellow: 'Yellow', orange: 'Orange', blue: 'Blue', red: 'Red', black: 'Black', white: 'White' };
