// Trait re-costing (docs/19 §4), the parts that are not orchestration: which variant a base build gets for a trait,
// the scale that turns score into trait points, the verdict on each trait (19 §4 steps 2 and 5), pick rates under a
// greedy builder (step 3) and the caps check (step 4). scripts/recost.ts plays the careers and writes the report.

import { phaseLive } from '../sim/character';
import type { Background, DataBundle, NewRunSpec, Trait } from '../sim/types';

export const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export const sd = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

/**
 * The base with `t` added (sign +1) or, if it carries it, taken away (sign −1), so that (with − without) × sign is the
 * trait's effect either way; null when the base cannot take it: a trait its background forces or locks, an exclusion
 * either way, an age outside the trait's window.
 */
export function toggled(spec: NewRunSpec, bg: Background, t: Trait, bundle: Pick<DataBundle, 'traits'>): { spec: NewRunSpec; sign: number } | null {
  if (bg.forced_traits.includes(t.id)) return null;
  if (spec.traits.includes(t.id)) return { spec: { ...spec, traits: spec.traits.filter((x) => x !== t.id) }, sign: -1 };
  if (bg.locked_traits.includes(t.id)) return null;
  if (spec.traits.some((x) => t.excludes.includes(x) || bundle.traits.get(x)?.excludes.includes(t.id))) return null;
  if (t.requires_age && (spec.body.age_start < t.requires_age[0] || spec.body.age_start > t.requires_age[1])) return null;
  return { spec: { ...spec, traits: [...spec.traits, t.id] }, sign: 1 };
}

/**
 * Score points per cost point at today's prices: least squares through the origin of each priced trait's mean score
 * change on its cost. Re-costing against it moves traits relative to each other and keeps the economy's level; 19 §4's
 * own yardstick (+5 on one physical attribute) is reported beside it but is too small and noisy to divide by.
 */
export function priceSlope(priced: readonly { cost: number; d: readonly number[] }[]): number {
  return priced.reduce((a, x) => a + x.cost * mean(x.d), 0) / Math.max(1e-9, priced.reduce((a, x) => a + x.cost ** 2, 0));
}

/**
 * 19 §4 step 2: round the impact into ±2..±10 on the trait's own side, so a positive trait never becomes a refund nor a
 * negative a purchase (that is a flag, a design question); quirks and other unpriced traits stay at 0.
 */
export function proposed(t: Pick<Trait, 'category' | 'cost'>, impact: number): number {
  if (t.category === 'quirk' || t.cost === 0) return 0;
  const side = Math.sign(t.cost);
  return side * Math.min(10, Math.max(2, Math.round(Math.max(0, side * impact))));
}

export interface Verdict {
  /** In trait points at today's price level, with its standard error. */
  impact: number;
  se: number;
  prop: number;
  /** 'sign': clearly works against its side; 'no-op': clearly worth under 1.5 points on its side (19 §4 step 2). */
  flag: '' | 'sign' | 'no-op';
  /** The rounded impact is a different cost, clear of the noise: |impact − cost| > max(1, 2 se), and no flag. */
  clear: boolean;
}

/** The verdict on one trait from its paired score changes (each already signed as with − without). */
export function verdict(t: Pick<Trait, 'category' | 'cost'>, d: readonly number[], slope: number): Verdict {
  const impact = mean(d) / slope;
  const se = sd(d) / Math.sqrt(Math.max(1, d.length)) / Math.abs(slope);
  const priced = t.category !== 'quirk' && t.cost !== 0;
  const v = Math.sign(t.cost) * impact;
  const flag: Verdict['flag'] = !priced ? '' : v + 2 * se < 0 ? 'sign' : v + 2 * se < 1.5 ? 'no-op' : '';
  const prop = proposed(t, impact);
  const clear = priced && !flag && d.length >= 4 && Math.abs(impact - t.cost) > Math.max(1, 2 * se) && prop !== t.cost;
  return { impact, se, prop, flag, clear };
}

/**
 * 19 §4 step 3: for each live background, a builder that buys the positive trait with the best value per point it can
 * afford; when it can afford none, it takes the negatives that cost least value per refunded point, as many as the best
 * positive needs, if that positive is worth more than they cost.
 * Rules as at creation: at most 12 traits, refunds up to 12, two negatives per category, no exclusions or locked traits.
 * The share of builds that pick each trait; one build per background, so the resolution is coarse.
 */
export function pickRates(bundle: Pick<DataBundle, 'traits' | 'backgrounds'>, values: ReadonlyMap<string, number>): Map<string, number> {
  const bgs = [...bundle.backgrounds.values()].filter((b) => phaseLive(b.phase));
  const counts = new Map<string, number>();
  for (const bg of bgs) {
    const chosen = new Set(bg.forced_traits);
    let points = bg.point_bonus, refunds = 0;
    const neg = new Map<string, number>();
    const fits = (t: Trait) => !chosen.has(t.id) && !bg.locked_traits.includes(t.id) && !t.requires_age && chosen.size < 12
      && ![...chosen].some((x) => t.excludes.includes(x) || bundle.traits.get(x)?.excludes.includes(t.id));
    const pool = [...bundle.traits.values()].filter((t) => values.has(t.id) && t.category !== 'quirk' && t.cost !== 0);
    for (let step = 0; step < 24; step++) {
      const pos = pool.filter((t) => t.cost > 0 && values.get(t.id)! > 0 && fits(t)).sort((a, b) => values.get(b.id)! / b.cost - values.get(a.id)! / a.cost);
      const buy = pos.find((t) => t.cost <= points);
      if (buy) { chosen.add(buy.id); points -= buy.cost; continue; }
      const want = pos[0];
      if (!want) break;
      // Negatives, least harm per refunded point first, until the wanted trait is affordable within the refund caps.
      const batch: Trait[] = [];
      let p = points, r = refunds;
      const cats = new Map(neg);
      for (const n of pool.filter((t) => t.cost < 0 && fits(t)).sort((a, b) => Math.abs(values.get(a.id)!) / -a.cost - Math.abs(values.get(b.id)!) / -b.cost)) {
        if (p >= want.cost) break;
        if (r - n.cost > 12 || (cats.get(n.category) ?? 0) >= 2 || chosen.size + batch.length + 1 >= 12) continue;
        if (batch.some((x) => x.excludes.includes(n.id) || n.excludes.includes(x.id) || want.excludes.includes(n.id))) continue;
        batch.push(n); p -= n.cost; r -= n.cost; cats.set(n.category, (cats.get(n.category) ?? 0) + 1);
      }
      const harm = batch.reduce((a, n) => a + Math.abs(values.get(n.id)!), 0);
      if (p < want.cost || values.get(want.id)! <= harm) break;
      for (const n of batch) chosen.add(n.id);
      points = p; refunds = r;
      for (const [c, k] of cats) neg.set(c, k);
    }
    for (const id of chosen) if (!bg.forced_traits.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return new Map([...counts].map(([id, c]) => [id, c / bgs.length]));
}

/** 19 §4 step 4: hold types and move classes where a compatible set of live traits adds up to more than +30%. */
export function capsOver(bundle: Pick<DataBundle, 'traits'>): { key: string; total: number }[] {
  const live = [...bundle.traits.values()].filter((t) => phaseLive(t.phase) && (t.kind === 'creation' || t.kind === 'evolving'));
  const keys = new Set(live.flatMap((t) => [...Object.keys(t.effect.hold_mult ?? {}).map((k) => `hold:${k}`), ...Object.keys(t.effect.move_mult ?? {}).map((k) => `move:${k}`)]));
  const over: { key: string; total: number }[] = [];
  for (const key of keys) {
    const [kind, k] = key.split(':') as ['hold' | 'move', string];
    const gain = (t: Trait) => ((kind === 'hold' ? t.effect.hold_mult : t.effect.move_mult) as Record<string, number> | undefined)?.[k] ?? 1;
    const up = live.filter((t) => gain(t) > 1);
    // Brute force over compatible subsets: no hold type or move class has more than a handful of traits.
    let best = 0;
    for (let mask = 1; mask < 1 << up.length; mask++) {
      const set = up.filter((_, i) => mask & (1 << i));
      if (set.some((a) => set.some((b) => a !== b && a.excludes.includes(b.id)))) continue;
      best = Math.max(best, set.reduce((s, t) => s + gain(t) - 1, 0));
    }
    if (best > 0.3 + 1e-9) over.push({ key, total: best });
  }
  return over;
}
