// Random build sampler for the harness (docs/19 §1): background uniform over the live phase, Body from
// population bands, a Dirichlet split of attribute points under the +25 cap, traits by rejection sampling
// against the real creation rules.

import { ALLOC_MAX_PER_ATTR, deriveMass, phaseLive, refFat, validateCreation } from '../sim/character';
import { DEFAULT_OPTIONS } from '../sim/presets';
import type { Rng } from '../sim/rng';
import { LIFESTYLE_ATTRS, MENTAL_ATTRS, PHYSICAL_ATTRS, TECHNIQUE_ATTRS, type AttrId, type Body, type DataBundle, type NewRunSpec, type RunOptions } from '../sim/types';

const LATER: readonly AttrId[] = ['tech_cracks', 'rope_craft', 'gear_placement', 'languages', 'logistics'];
const POOL: AttrId[] = [...PHYSICAL_ATTRS, ...TECHNIQUE_ATTRS, ...MENTAL_ATTRS, ...LIFESTYLE_ATTRS].filter((a) => !LATER.includes(a));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sampleBody(rng: Rng, age: number): Body {
  const sex = rng.bool(0.5) ? 'f' : 'm';
  const height = Math.round(clamp(sex === 'm' ? rng.normal(172, 9) : rng.normal(162, 8), 150, 200));
  const bf = Math.round(clamp(refFat(sex) + rng.normal(0, 3), sex === 'f' ? 12 : 6, sex === 'f' ? 32 : 24));
  const shift = Math.round(rng.normal(0, 2.5) * 2) / 2;
  const band = () => rng.int(-2, 2);
  return {
    sex, age_start: age, height_cm: height, body_fat_pct: bf, mass_kg: Math.round(deriveMass(sex, height, bf, shift) * 10) / 10,
    ape_index: Math.round(clamp(rng.normal(1.02, 0.03), 0.95, 1.1) * 100) / 100,
    finger_length: band(), finger_girth: band(), leg_torso: band(),
    natural_hip_mobility: rng.int(4, 18) * 5, natural_shoulder_mobility: rng.int(4, 18) * 5,
    fibre_bias: Math.round(rng.range(-1, 1) * 10) / 10, tendon_robustness: rng.int(30, 70),
    skin_thickness: rng.pick(['thin', 'normal', 'thick'] as const), skin_moisture: rng.pick(['dry', 'normal', 'sweaty'] as const),
  };
}

function sampleAlloc(rng: Rng, total: number): Partial<Record<AttrId, number>> {
  // Dirichlet(0.5) over a random subset, rounded to 5s, capped at +25.
  const k = rng.int(3, 8);
  const ids = [...POOL].sort(() => rng.next() - 0.5).slice(0, k);
  const g = ids.map(() => (-Math.log(1 - rng.next())) ** 2);
  const sum = g.reduce((a, b) => a + b, 0);
  const out: Partial<Record<AttrId, number>> = {};
  let used = 0;
  ids.forEach((id, i) => {
    const v = Math.min(ALLOC_MAX_PER_ATTR, Math.floor((total * g[i]!) / sum / 5) * 5);
    if (v > 0 && used + v <= total) { out[id] = v; used += v; }
  });
  return out;
}

/** A random valid build (19 §1). `startCrag` keeps to the backgrounds that start there, e.g. P1a careers at Font. */
export function sampleBuild(rng: Rng, bundle: DataBundle, options: RunOptions = DEFAULT_OPTIONS, name = 'Climber', startCrag?: string): NewRunSpec {
  const backgrounds = [...bundle.backgrounds.values()].filter((b) => phaseLive(b.phase) && (!startCrag || b.start_crag === startCrag));
  const unlocked = new Set(backgrounds.map((b) => b.unlock).filter((x): x is string => !!x));
  const traits = [...bundle.traits.values()].filter((t) => phaseLive(t.phase) && (t.kind === 'creation' || t.kind === 'evolving'));
  for (let tries = 0; tries < 400; tries++) {
    const bg = rng.pick(backgrounds);
    const age = clamp(Math.round(rng.triangular(bg.age_range[0], Math.min(bg.age_range[1], Math.max(bg.age_range[0], 22)), bg.age_range[1])), bg.age_range[0], bg.age_range[1]);
    const chosen = new Set(bg.forced_traits);
    const n = rng.int(0, 7);
    for (let i = 0; i < n * 3 && chosen.size < bg.forced_traits.length + n; i++) {
      const t = rng.pick(traits);
      if (bg.locked_traits.includes(t.id) || t.excludes.some((x) => chosen.has(x))) continue;
      chosen.add(t.id);
    }
    const spec: NewRunSpec = { name, background: bg.id, body: sampleBody(rng, age), traits: [...chosen], attr_alloc: sampleAlloc(rng, bg.attr_points), options: { ...options } };
    // Drop the costliest positive traits until the budget closes, then validate for real.
    for (let fix = 0; fix < 10; fix++) {
      const errs = validateCreation(spec, { traits: bundle.traits, backgrounds: bundle.backgrounds, unlocked });
      if (!errs.length) return spec;
      const pos = spec.traits.filter((id) => !bg.forced_traits.includes(id)).sort((a, b) => (bundle.traits.get(b)?.cost ?? 0) - (bundle.traits.get(a)?.cost ?? 0));
      if (!pos.length) break;
      spec.traits = spec.traits.filter((id) => id !== pos[0]);
    }
  }
  throw new Error('build sampler: no valid build in 400 tries');
}
