// Quick-build presets for P1a (17 §6, 16 §1). One per P1a background plus the unlockable Farm Kid. The first
// two are the builds named by the P1a exit criterion (01 §4): they must play visibly differently on a 6B+.

import { deriveMass, refFat } from './character';
import type { AttrId, Body, NewRunSpec, RunOptions } from './types';

export const DEFAULT_OPTIONS: RunOptions = { death_enabled: false, auto_commit: false, sweep_speed: 1, difficulty: 'standard' };

export interface Preset {
  id: string;
  name: string;
  consequences: [string, string, string];
  spec: Omit<NewRunSpec, 'options'>;
}

function body(b: Omit<Body, 'mass_kg' | 'body_fat_pct'> & { body_fat_pct?: number; shift?: number }): Body {
  const bf = b.body_fat_pct ?? refFat(b.sex);
  const { shift, ...rest } = b;
  return { ...rest, body_fat_pct: bf, mass_kg: Math.round(deriveMass(b.sex, b.height_cm, bf, shift ?? 0) * 10) / 10 };
}

const alloc = (a: Partial<Record<AttrId, number>>) => a;

export const PRESETS: readonly Preset[] = [
  {
    id: 'slab_wizard',
    name: 'Slab Wizard',
    consequences: ['Slabs and smears +', 'Steep compression −', 'Short arms, quiet feet'],
    spec: {
      name: 'Inès',
      background: 'dancer',
      body: body({
        sex: 'f', age_start: 24, height_cm: 163, ape_index: 0.99, finger_length: 0, finger_girth: 0, leg_torso: 1,
        natural_hip_mobility: 80, natural_shoulder_mobility: 50, fibre_bias: -0.3, tendon_robustness: 50, skin_thickness: 'normal', skin_moisture: 'dry',
      }),
      traits: ['dancer', 'smear_faith', 'quiet_feet', 't_rex_arms', 'imposter'],
      attr_alloc: alloc({ footwork: 15, tech_slab: 15, body_position: 10, hip_mobility: 10, route_reading: 5, tech_slopers: 5 }),
    },
  },
  {
    id: 'compression_monster',
    name: 'Compression Monster',
    consequences: ['Slopers and squeezes +', 'Slabs and hips −', 'Big span, big core'],
    spec: {
      name: 'Tomás',
      background: 'gymnast',
      body: body({
        sex: 'm', age_start: 22, height_cm: 178, ape_index: 1.05, finger_length: 1, finger_girth: 0, leg_torso: -1, shift: 4,
        natural_hip_mobility: 40, natural_shoulder_mobility: 70, fibre_bias: 0.4, tendon_robustness: 55, skin_thickness: 'thin', skin_moisture: 'normal',
      }),
      traits: ['gymnast', 'core_of_steel', 'sloper_whisperer', 'tight_hips', 'scatterbrain'],
      attr_alloc: alloc({ core_tension: 10, contact_strength: 15, tech_slopers: 10, tech_pinches: 10, finger_strength: 10, pull_power: 5 }),
    },
  },
  {
    id: 'power_boulderer',
    name: 'Power Boulderer',
    consequences: ['Dynos and crimps +', 'Patience −', 'Sweaty in the heat'],
    spec: {
      name: 'Kai',
      background: 'gym_comp_kid',
      body: body({
        sex: 'm', age_start: 19, height_cm: 175, ape_index: 1.03, finger_length: 0, finger_girth: 0, leg_torso: 0,
        natural_hip_mobility: 55, natural_shoulder_mobility: 55, fibre_bias: 0.6, tendon_robustness: 50, skin_thickness: 'normal', skin_moisture: 'sweaty',
      }),
      traits: ['gym_kid', 'dyno_monkey', 'crusher_hands', 'rage_quitter', 'sweaty_hands'],
      attr_alloc: alloc({ finger_strength: 15, contact_strength: 15, pull_power: 10, dynamic_movement: 10, core_tension: 10 }),
    },
  },
  {
    id: 'late_starter',
    name: 'Late Starter',
    consequences: ['Money and reading +', 'Hips and adaptation −', 'Patient projector'],
    spec: {
      name: 'Hélène',
      background: 'desk_job_late_starter',
      body: body({
        sex: 'f', age_start: 34, height_cm: 168, ape_index: 1.01, finger_length: 0, finger_girth: 0, leg_torso: 0, body_fat_pct: 22,
        natural_hip_mobility: 45, natural_shoulder_mobility: 50, fibre_bias: 0, tendon_robustness: 45, skin_thickness: 'normal', skin_moisture: 'normal',
      }),
      traits: ['desk_jockey', 'late_starter', 'eagle_eye', 'projector', 'unlucky'],
      attr_alloc: alloc({ route_reading: 10, footwork: 10, finger_strength: 10, tech_slopers: 10, composure: 10 }),
    },
  },
  {
    id: 'dirtbag',
    name: 'Dirtbag',
    consequences: ['Skin and stamina +', 'Money tight', 'Lives cheap'],
    spec: {
      name: 'Sam',
      background: 'dirtbag_dropout',
      body: body({
        sex: 'm', age_start: 23, height_cm: 180, ape_index: 1.02, finger_length: 0, finger_girth: 0, leg_torso: 0,
        natural_hip_mobility: 50, natural_shoulder_mobility: 50, fibre_bias: -0.2, tendon_robustness: 50, skin_thickness: 'thick', skin_moisture: 'normal',
      }),
      traits: ['dirtbag', 'gecko_skin', 'topout_tidy', 'imposter'],
      attr_alloc: alloc({ skin_durability: 10, aerobic_capacity: 10, finger_endurance: 10, tech_slopers: 10, footwork: 10, finger_strength: 10 }),
    },
  },
  {
    id: 'farm_kid',
    name: 'Farm Kid',
    consequences: ['Grip and skin +', 'Hips and feet −', 'Unlocked by a finished run'],
    spec: {
      name: 'Jo',
      background: 'farm_kid',
      body: body({
        sex: 'm', age_start: 20, height_cm: 182, ape_index: 1.02, finger_length: 0, finger_girth: 1, leg_torso: 0, shift: 3,
        natural_hip_mobility: 40, natural_shoulder_mobility: 55, fibre_bias: 0.3, tendon_robustness: 65, skin_thickness: 'thick', skin_moisture: 'sweaty',
      }),
      traits: ['farm_strong', 'pinch_grip', 'sweaty_hands'],
      attr_alloc: alloc({ finger_strength: 10, contact_strength: 10, pull_power: 10, tech_pinches: 10, tech_slopers: 10, core_tension: 10 }),
    },
  },
];

export const presetSpec = (id: string, options: RunOptions = DEFAULT_OPTIONS): NewRunSpec => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown preset ${id}`);
  return { ...structuredClone(p.spec), options: { ...options } };
};
