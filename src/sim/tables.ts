// Engine constant tables from docs/05a and docs/05b. Values marked (tune) in the docs are
// starting points for the balance harness; change them here and re-run `pnpm calibrate`.

import type { AttrId, Feature, HoldType, MoveClass, Posture, RockType, SizeClass } from './types';

// ---------------------------------------------------------------- 05a §2.2 hold types

export const FS: Record<HoldType, number> = {
  crimp: 0.3, edge: 0.4, sloper: 1.0, pinch: 0.6, pocket1: 0.2, pocket2: 0.2, pocket3: 0.3, jug: 0.1,
  sidepull: 0.5, undercling: 0.4, gaston: 0.5, horn: 0.5,
  crack_finger: 0.3, crack_hand: 0.3, crack_fist: 0.3, crack_offwidth: 0.3,
  volume: 0.9, foot_chip: 0.5, smear: 1.0,
};

export const REST_BASE: Record<HoldType, number> = {
  crimp: 0.10, edge: 0.30, sloper: 0.20, pinch: 0.20, pocket1: 0.05, pocket2: 0.15, pocket3: 0.30, jug: 0.90,
  sidepull: 0.25, undercling: 0.30, gaston: 0.10, horn: 0.70,
  crack_finger: 0.20, crack_hand: 0.60, crack_fist: 0.50, crack_offwidth: 0.40,
  volume: 0.50, foot_chip: 0, smear: 0,
};

export const HANDS_OK: Record<HoldType, boolean> = {
  crimp: true, edge: true, sloper: true, pinch: true, pocket1: true, pocket2: true, pocket3: true, jug: true,
  sidepull: true, undercling: true, gaston: true, horn: true,
  crack_finger: true, crack_hand: true, crack_fist: true, crack_offwidth: true,
  volume: true, foot_chip: false, smear: false,
};

export const FEET_OK: Record<HoldType, boolean> = {
  crimp: true, edge: true, sloper: true, pinch: true, pocket1: false, pocket2: true, pocket3: true, jug: true,
  sidepull: true, undercling: true, gaston: false, horn: true,
  crack_finger: true, crack_hand: true, crack_fist: true, crack_offwidth: true,
  volume: true, foot_chip: true, smear: true,
};

/** Canonical orientation in degrees (05a §2.2). Sidepulls and gastons use 90 or 270. */
export function canonicalOrientation(type: HoldType, orientation: number): number {
  if (type === 'sidepull' || type === 'gaston') return Math.abs(norm180(orientation - 90)) <= 90 ? 90 : 270;
  if (type === 'undercling') return 180;
  return 0;
}

export function norm180(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

export const MATCHABLE = (type: HoldType, size: SizeClass): boolean => {
  if (type === 'pocket1' || type === 'foot_chip' || type === 'smear') return false;
  if (type === 'crimp') return size === 'm' || size === 'l' || size === 'xl';
  return true;
};

export const ORIENTATION_FREE = (type: HoldType): boolean => type.startsWith('crack_');

// ---------------------------------------------------------------- 05a §2.3 friction

export const ROCK_FRICTION: Record<RockType, number> = {
  sandstone_grit: 0.65, sandstone_quartzitic: 0.65,
  sandstone_font: 0.60, sandstone_elb: 0.60, sandstone_nuttall: 0.60,
  syenite: 0.58, sandstone_corbin: 0.58, sandstone_aztec: 0.58, sandstone_wingate: 0.58, sandstone_generic: 0.58,
  granite: 0.55, monzonite: 0.55, gneiss: 0.55, schist: 0.55, quartzite: 0.55,
  basalt: 0.55, dolerite: 0.55, tuff: 0.55, rhyolite: 0.55, plastic: 0.55,
  limestone: 0.50, dolomite: 0.50, conglomerate: 0.50,
  ice: 0.5,
};

/** Chalk term at the grading reference: fresh chalk on hands (05a §2.3, reconciled to the worked examples). */
export const REFERENCE_CHALK_TERM = 1.2;

// ---------------------------------------------------------------- 05a §4–§6 rig and postures

export const POSTURE_OFFSETS: Record<Posture, { sh: [number, number]; hip: [number, number] }> = {
  hang: { sh: [0, 0.15], hip: [0, -0.35] },
  compression: { sh: [0, 0.10], hip: [0, -0.30] },
  drop_knee: { sh: [0, 0.20], hip: [0.10, -0.25] },
  kneebar: { sh: [0, 0.25], hip: [0, -0.15] },
  rest_stance: { sh: [0, 0.25], hip: [0, -0.30] },
  mantle: { sh: [0, 0.05], hip: [0, -0.10] },
  jam_stack: { sh: [0, 0.15], hip: [0, -0.35] },
  layback: { sh: [0.15, 0.15], hip: [0.10, -0.30] },
  stem: { sh: [0, 0.30], hip: [0, -0.20] },
};

export const PF_HAND: Record<Posture, number> = {
  hang: 1.0, compression: 0.9, drop_knee: 1.05, kneebar: 1.05, rest_stance: 1.0, mantle: 0.8, jam_stack: 0.95, layback: 0.95, stem: 0.95,
};
export const PF_FOOT: Record<Posture, number> = {
  hang: 0.95, compression: 0.95, drop_knee: 0.85, kneebar: 0.70, rest_stance: 1.0, mantle: 0.9, jam_stack: 0.9, layback: 0.95, stem: 1.1,
};
export const Q_CLASS: Record<Posture, number> = {
  hang: 1.0, compression: 0.97, drop_knee: 1.02, kneebar: 1.03, rest_stance: 1.0, mantle: 0.95, jam_stack: 0.98, layback: 0.96, stem: 1.02,
};
export const POSTURE_PUMP: Record<Posture, number> = {
  hang: 1.0, compression: 1.10, drop_knee: 0.90, kneebar: 0.60, rest_stance: 0.50, mantle: 1.20, jam_stack: 0.95, layback: 1.15, stem: 0.70,
};

export const CLASS_REACH: Record<MoveClass, number> = {
  static: 1.0, deadpoint: 1.15, dyno: 1.5, high_step: 1.0, heel_hook: 1.0, toe_hook: 1.0,
  match: 1.0, bump: 1.0, jam: 1.0, kneebar: 1.0, mantle: 1.0,
};

// ---------------------------------------------------------------- 05b §4.1 move difficulty

export const H_HAND: Partial<Record<HoldType, number>> = {
  jug: 7, horn: 9, crack_hand: 10, crack_fist: 11, volume: 11, edge: 12, sidepull: 12,
  pocket2: 15, pocket1: 18, pinch: 13, pocket3: 13, undercling: 13, crack_offwidth: 13,
  gaston: 14, sloper: 14, crack_finger: 14, crimp: 15,
};
export const H_FOOT: Partial<Record<HoldType, number>> = {
  jug: 5, horn: 6, crack_hand: 9, crack_fist: 9, volume: 8, edge: 9, sidepull: 10,
  pocket2: 11, pinch: 11, pocket3: 11, undercling: 10, crack_offwidth: 9,
  gaston: 10, sloper: 12, crack_finger: 9, crimp: 11, foot_chip: 12, smear: 13,
};
export const SIZE_DI: Record<SizeClass, number> = { xs: 3.0, s: 1.5, m: 0, l: -1.5, xl: -3.0 };
export const CLASS_C: Record<MoveClass, number> = {
  static: 0, deadpoint: 1.0, dyno: 2.0, high_step: 0.5, heel_hook: 0.5, toe_hook: 1.0,
  mantle: 1.5, jam: 0, match: 0, bump: 0.5, kneebar: -1.0,
};

/** Feature term (05b §4.1): hand moves and mantles only. */
export function featureTerm(feature: Feature, isMantle: boolean, isHand: boolean): number {
  if (isMantle) return feature === 'lip' ? -1.0 : 0;
  if (!isHand) return 0;
  switch (feature) {
    case 'arete': return -1.0;
    case 'corner': return -1.5;
    case 'lip': return 0.5;
    case 'ledge': return -2.0;
    case 'hueco': return -1.0;
    case 'tufa': return -0.5;
    default: return 0;
  }
}

// ---------------------------------------------------------------- 05b §3.13 costs

export const PC: Record<HoldType, number> = {
  crimp: 1.10, edge: 0.90, sloper: 1.20, pinch: 1.20, pocket1: 1.30, pocket2: 1.15, pocket3: 1.00, jug: 0.50,
  sidepull: 1.00, undercling: 1.10, gaston: 1.10, horn: 0.60,
  crack_finger: 1.00, crack_hand: 0.70, crack_fist: 0.80, crack_offwidth: 1.10,
  volume: 0.80, foot_chip: 0, smear: 0,
};
export const SK: Record<HoldType, number> = {
  crimp: 1.2, edge: 1.0, sloper: 0.8, pinch: 0.9, pocket1: 1.2, pocket2: 1.1, pocket3: 1.0, jug: 0.4,
  sidepull: 0.9, undercling: 0.8, gaston: 0.8, horn: 0.5,
  crack_finger: 1.6, crack_hand: 1.5, crack_fist: 1.4, crack_offwidth: 1.2,
  volume: 0.5, foot_chip: 0.1, smear: 0.1,
};
export const SIZE_PUMP: Record<SizeClass, number> = { xs: 1.2, s: 1.1, m: 1.0, l: 0.95, xl: 0.9 };

/** Action durations in seconds (05b §1). */
export const MOVE_TIME: Record<MoveClass, number> = {
  static: 4, deadpoint: 3, dyno: 3, jam: 5, bump: 2, match: 3, kneebar: 4, mantle: 6,
  high_step: 3, heel_hook: 3, toe_hook: 3,
};
export const FOOT_STATIC_TIME = 2;

export const DYNAMIC_CLASSES: readonly MoveClass[] = ['deadpoint', 'dyno'];
export const isDynamic = (c: MoveClass): boolean => c === 'deadpoint' || c === 'dyno';

// ---------------------------------------------------------------- 05b §3 matrix

type Weights = Partial<Record<AttrId, number>>;
const W = (pairs: Record<string, number>): Weights => {
  const codes: Record<string, AttrId> = {
    FS: 'finger_strength', FE: 'finger_endurance', PP: 'pull_power', LO: 'lockoff', CT: 'core_tension',
    HM: 'hip_mobility', SM: 'shoulder_mobility', LP: 'leg_power', CS: 'contact_strength', SD: 'skin_durability',
    FW: 'footwork', BP: 'body_position', DM: 'dynamic_movement', TC: 'tech_crimps', TS: 'tech_slopers',
    TP: 'tech_pinches', TK: 'tech_pockets', TX: 'tech_cracks', TB: 'tech_slab',
  };
  const out: Weights = {};
  for (const [code, w] of Object.entries(pairs)) {
    const id = codes[code];
    if (!id) throw new Error(`unknown matrix code ${code}`);
    out[id] = w;
  }
  return out;
};
const many = (types: HoldType[], w: Weights): Partial<Record<HoldType, Weights>> =>
  Object.fromEntries(types.map((t) => [t, w])) as Partial<Record<HoldType, Weights>>;
const CRACKS: HoldType[] = ['crack_finger', 'crack_hand', 'crack_fist', 'crack_offwidth'];

/** Hand cells keyed by class; foot cells keyed separately (static foot differs from static hand). */
export const MATRIX_HAND: Partial<Record<MoveClass, Partial<Record<HoldType, Weights>>>> = {
  static: {
    crimp: W({ FS: 0.5, LO: 0.2, TC: 0.3 }),
    edge: W({ FS: 0.35, LO: 0.2, TC: 0.25, BP: 0.2 }),
    sloper: W({ CS: 0.3, CT: 0.3, TS: 0.4 }),
    pinch: W({ FS: 0.3, CS: 0.2, TP: 0.35, CT: 0.15 }),
    pocket1: W({ FS: 0.5, TK: 0.35, LO: 0.15 }),
    pocket2: W({ FS: 0.45, TK: 0.35, LO: 0.2 }),
    pocket3: W({ FS: 0.4, TK: 0.35, LO: 0.25 }),
    jug: W({ PP: 0.4, LO: 0.2, BP: 0.25, CT: 0.15 }),
    sidepull: W({ LO: 0.35, CT: 0.25, BP: 0.25, FS: 0.15 }),
    undercling: W({ SM: 0.25, LO: 0.25, CT: 0.3, BP: 0.2 }),
    gaston: W({ SM: 0.35, LO: 0.35, BP: 0.2, FS: 0.1 }),
    horn: W({ PP: 0.35, CS: 0.2, BP: 0.25, TP: 0.2 }),
    volume: W({ TS: 0.3, BP: 0.3, CT: 0.25, CS: 0.15 }),
  },
  deadpoint: {
    crimp: W({ FS: 0.35, CS: 0.25, DM: 0.25, TC: 0.15 }),
    edge: W({ FS: 0.25, CS: 0.25, DM: 0.3, TC: 0.2 }),
    sloper: W({ CS: 0.35, TS: 0.25, DM: 0.25, CT: 0.15 }),
    pinch: W({ CS: 0.3, TP: 0.25, DM: 0.25, FS: 0.2 }),
    ...many(['pocket1', 'pocket2', 'pocket3'], W({ FS: 0.4, CS: 0.3, TK: 0.3 })),
    jug: W({ PP: 0.35, CS: 0.25, DM: 0.3, CT: 0.1 }),
    sidepull: W({ LO: 0.3, CS: 0.25, DM: 0.3, CT: 0.15 }),
    undercling: W({ CT: 0.3, CS: 0.25, DM: 0.25, SM: 0.2 }),
    gaston: W({ SM: 0.3, LO: 0.25, DM: 0.25, CS: 0.2 }),
    horn: W({ PP: 0.3, CS: 0.3, DM: 0.25, TP: 0.15 }),
    volume: W({ CS: 0.3, TS: 0.25, DM: 0.25, CT: 0.2 }),
    ...many(['crack_hand', 'crack_fist'], W({ TX: 0.4, CS: 0.3, DM: 0.3 })),
  },
  dyno: {
    jug: W({ PP: 0.4, LP: 0.3, DM: 0.3 }),
    edge: W({ CS: 0.3, PP: 0.2, LP: 0.2, DM: 0.3 }),
    crimp: W({ CS: 0.35, FS: 0.2, LP: 0.15, DM: 0.3 }),
    sloper: W({ CS: 0.35, TS: 0.15, LP: 0.2, DM: 0.3 }),
    pinch: W({ CS: 0.35, TP: 0.15, LP: 0.2, DM: 0.3 }),
    ...many(['pocket2', 'pocket3'], W({ CS: 0.35, FS: 0.2, LP: 0.15, DM: 0.3 })),
    horn: W({ PP: 0.35, CS: 0.2, LP: 0.2, DM: 0.25 }),
    volume: W({ CS: 0.3, TS: 0.15, LP: 0.25, DM: 0.3 }),
    sidepull: W({ CS: 0.3, LO: 0.2, LP: 0.2, DM: 0.3 }),
  },
  mantle: {
    ...many(['jug', 'horn'], W({ PP: 0.3, LO: 0.25, CT: 0.2, BP: 0.25 })),
    ...many(['edge', 'crimp'], W({ LO: 0.3, PP: 0.2, CT: 0.2, BP: 0.2, FS: 0.1 })),
    ...many(['sloper', 'volume'], W({ TS: 0.3, CT: 0.25, PP: 0.2, BP: 0.25 })),
    pinch: W({ TP: 0.25, LO: 0.25, CT: 0.25, BP: 0.25 }),
  },
  jam: {
    crack_finger: W({ FS: 0.3, TX: 0.45, LO: 0.15, FE: 0.1 }),
    crack_hand: W({ TX: 0.5, CT: 0.2, BP: 0.2, FE: 0.1 }),
    crack_fist: W({ TX: 0.45, CT: 0.25, BP: 0.2, PP: 0.1 }),
    crack_offwidth: W({ TX: 0.4, CT: 0.3, PP: 0.15, BP: 0.15 }),
  },
  match: {
    ...many(['crimp', 'edge'], W({ FS: 0.35, LO: 0.2, TC: 0.25, BP: 0.2 })),
    ...many(['sloper', 'volume'], W({ CS: 0.25, CT: 0.25, TS: 0.3, BP: 0.2 })),
    pinch: W({ FS: 0.25, CS: 0.2, TP: 0.35, BP: 0.2 }),
    ...many(['pocket2', 'pocket3'], W({ FS: 0.4, TK: 0.35, LO: 0.25 })),
    ...many(['jug', 'horn'], W({ PP: 0.3, LO: 0.25, BP: 0.3, CT: 0.15 })),
    ...many(['sidepull', 'gaston', 'undercling'], W({ LO: 0.3, CT: 0.25, BP: 0.3, SM: 0.15 })),
    ...many(CRACKS, W({ TX: 0.5, BP: 0.3, CT: 0.2 })),
  },
  bump: {
    ...many(['crimp', 'edge'], W({ CS: 0.3, FS: 0.25, TC: 0.25, LO: 0.2 })),
    ...many(['sloper', 'volume'], W({ CS: 0.35, TS: 0.3, CT: 0.2, BP: 0.15 })),
    pinch: W({ CS: 0.3, TP: 0.3, FS: 0.2, CT: 0.2 }),
    ...many(['pocket1', 'pocket2', 'pocket3'], W({ CS: 0.3, FS: 0.3, TK: 0.3, LO: 0.1 })),
    ...many(['jug', 'horn'], W({ CS: 0.25, PP: 0.3, LO: 0.25, BP: 0.2 })),
    ...many(['sidepull', 'gaston', 'undercling'], W({ CS: 0.25, LO: 0.3, CT: 0.25, BP: 0.2 })),
  },
};

export const MATRIX_FOOT: Partial<Record<MoveClass, Partial<Record<HoldType, Weights>>>> = {
  static: {
    foot_chip: W({ FW: 0.5, TB: 0.25, BP: 0.25 }),
    smear: W({ FW: 0.35, TB: 0.4, BP: 0.15, HM: 0.1 }),
    ...many(['edge', 'crimp'], W({ FW: 0.5, BP: 0.3, CT: 0.2 })),
    ...many(['jug', 'horn', 'volume'], W({ FW: 0.4, BP: 0.3, CT: 0.3 })),
    sloper: W({ FW: 0.35, TB: 0.25, BP: 0.2, CT: 0.2 }),
    ...many(['pinch', 'pocket2', 'pocket3', 'sidepull', 'undercling', 'gaston'], W({ FW: 0.45, BP: 0.3, CT: 0.25 })),
    ...many(CRACKS, W({ TX: 0.4, FW: 0.3, BP: 0.3 })),
  },
  high_step: {
    smear: W({ HM: 0.4, FW: 0.3, TB: 0.3 }),
    foot_chip: W({ HM: 0.4, FW: 0.35, TB: 0.25 }),
    ...many(['edge', 'crimp'], W({ HM: 0.4, FW: 0.35, BP: 0.25 })),
    ...many(['jug', 'horn', 'volume'], W({ HM: 0.35, FW: 0.3, LP: 0.2, BP: 0.15 })),
    sloper: W({ HM: 0.35, FW: 0.3, TB: 0.2, BP: 0.15 }),
    ...many(['pinch', 'pocket2', 'pocket3', 'sidepull', 'undercling', 'gaston'], W({ HM: 0.4, FW: 0.35, BP: 0.25 })),
    ...many(CRACKS, W({ HM: 0.35, TX: 0.35, FW: 0.3 })),
  },
  heel_hook: {
    ...many(['jug', 'horn'], W({ CT: 0.3, HM: 0.25, FW: 0.2, LP: 0.25 })),
    edge: W({ CT: 0.3, HM: 0.25, FW: 0.3, LP: 0.15 }),
    ...many(['sloper', 'volume'], W({ CT: 0.3, HM: 0.25, TS: 0.2, FW: 0.25 })),
    pocket3: W({ CT: 0.3, HM: 0.3, FW: 0.25, LP: 0.15 }),
    sidepull: W({ CT: 0.35, HM: 0.25, FW: 0.25, LP: 0.15 }),
    ...many(['crack_hand', 'crack_fist', 'crack_offwidth'], W({ CT: 0.25, TX: 0.35, FW: 0.25, HM: 0.15 })),
  },
  toe_hook: {
    ...many(['jug', 'horn', 'undercling'], W({ CT: 0.45, FW: 0.3, HM: 0.15, LP: 0.1 })),
    ...many(['edge', 'volume', 'sloper'], W({ CT: 0.4, FW: 0.35, TS: 0.1, HM: 0.15 })),
    ...many(CRACKS, W({ CT: 0.35, TX: 0.35, FW: 0.3 })),
  },
  kneebar: {
    ...many(['edge', 'jug', 'horn', 'volume', 'foot_chip', 'sloper', 'crack_finger', 'crack_hand', 'crack_fist', 'crack_offwidth', 'pocket3', 'sidepull', 'undercling'],
      W({ HM: 0.35, CT: 0.25, BP: 0.25, LP: 0.15 })),
  },
};

export function matrixCell(kind: 'hand' | 'foot', cls: MoveClass, type: HoldType): Weights | undefined {
  return (kind === 'hand' ? MATRIX_HAND : MATRIX_FOOT)[cls]?.[type];
}
