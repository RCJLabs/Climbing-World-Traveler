// Display helpers: names for attributes, money, grades, bands.

import { fontGrade } from '../sim/grades';
import type { AttrId, CircuitColour, HoldType, MoveClass } from '../sim/types';

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

/** Attributes that do nothing until a later phase; hidden from P1a allocation and sheets. */
export const LATER_ATTRS: readonly AttrId[] = ['tech_cracks', 'rope_craft', 'gear_placement', 'languages', 'logistics'];

export const CLASS_LABEL: Record<MoveClass, string> = {
  static: 'static', deadpoint: 'deadpoint', dyno: 'dyno', high_step: 'high step', heel_hook: 'heel hook', toe_hook: 'toe hook',
  mantle: 'mantle', jam: 'jam', match: 'match', bump: 'bump', kneebar: 'kneebar',
};

export const holdLabel = (t: HoldType): string => t.replace('_', ' ').replace('pocket1', 'mono').replace('pocket2', 'two-finger pocket').replace('pocket3', 'pocket');

export const money = (n: number): string => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
export const grade = (di: number): string => fontGrade(di);
export const pct = (p: number): string => `${Math.round(p * 100)}%`;
export const signed = (n: number, d = 1): string => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`;

export function band(p: number): 'solid' | 'probably' | 'sketchy' | 'desperate' {
  return p >= 0.9 ? 'solid' : p >= 0.65 ? 'probably' : p >= 0.35 ? 'sketchy' : 'desperate';
}

export const bandColour = (p: number): string => (p >= 0.9 ? 'var(--good)' : p >= 0.65 ? 'var(--sky)' : p >= 0.35 ? 'var(--accent)' : 'var(--warn)');

export const stars = (q: number): string => {
  const n = q >= 1.0 ? 5 : q >= 0.92 ? 4 : q >= 0.84 ? 3 : q >= 0.74 ? 2 : 1;
  return '★'.repeat(n) + '☆'.repeat(5 - n);
};

export const CIRCUIT_LABEL: Record<CircuitColour, string> = { yellow: 'Yellow', orange: 'Orange', blue: 'Blue', red: 'Red', black: 'Black', white: 'White' };
