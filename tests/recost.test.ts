// Trait re-costing (docs/19 §4, docs/26 §10): the variant a base build gets for a trait, the price-level scale, the
// verdict (a cost proposal on the trait's own side, the no-op and sign flags, clear only outside the noise), pick rates
// under the greedy builder, and the caps check.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { capsOver, pickRates, priceSlope, proposed, toggled, verdict } from '../src/harness/recost';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import type { DataBundle, Trait } from '../src/sim/types';

const bundle = loadBundle();
const T = (id: string) => bundle.traits.get(id)!;

describe('the paired variant (19 §4 step 1)', () => {
  const spec = { ...presetSpec('dirtbag', DEFAULT_OPTIONS), traits: ['dirtbag', 'sweaty_hands'] };
  const bg = bundle.backgrounds.get(spec.background)!;

  it('adds a trait the base lacks, takes away one it carries, and leaves out what the base cannot take', () => {
    expect(toggled(spec, bg, T('gymnast'), bundle)).toEqual({ spec: { ...spec, traits: [...spec.traits, 'gymnast'] }, sign: 1 });
    expect(toggled(spec, bg, T('sweaty_hands'), bundle)).toEqual({ spec: { ...spec, traits: ['dirtbag'] }, sign: -1 });
    expect(toggled(spec, bg, T('dry_hands'), bundle)).toBeNull();
    for (const id of bg.forced_traits) expect(toggled(spec, bg, T(id), bundle)).toBeNull();
    for (const id of bg.locked_traits) if (bundle.traits.has(id)) expect(toggled(spec, bg, T(id), bundle)).toBeNull();
  });
});

describe('the verdict (19 §4 steps 2 and 5)', () => {
  const pos = { category: 'aptitude', cost: 5 } as const;
  const neg = { category: 'body', cost: -5 } as const;

  it('rounds into ±2..±10 on the trait\'s own side; quirks stay at 0', () => {
    expect(proposed(pos, 7.4)).toBe(7);
    expect(proposed(pos, 13)).toBe(10);
    expect(proposed(pos, 0.3)).toBe(2);
    expect(proposed(pos, -3)).toBe(2);
    expect(proposed(neg, -12)).toBe(-10);
    expect(proposed(neg, 0.5)).toBe(-2);
    expect(proposed({ category: 'quirk', cost: 0 }, 4)).toBe(0);
  });

  it('scales by today\'s prices: score points per cost point through the origin', () => {
    expect(priceSlope([{ cost: 4, d: [8, 8] }, { cost: -3, d: [-6] }, { cost: 6, d: [11, 13] }])).toBeCloseTo(2, 9);
  });

  it('re-costs only outside the noise, and flags a trait worth nothing on its side or working against it', () => {
    const tight = (m: number) => [m - 0.1, m, m + 0.1, m, m - 0.1, m + 0.1];
    expect(verdict(pos, tight(9), 1)).toMatchObject({ prop: 9, clear: true, flag: '' });
    expect(verdict(pos, tight(5.4), 1)).toMatchObject({ prop: 5, clear: false, flag: '' });
    expect(verdict(pos, [12, -2, 9, 0, 14, -1], 1).clear).toBe(false);
    expect(verdict(pos, tight(0.2), 1)).toMatchObject({ flag: 'no-op', clear: false });
    expect(verdict(pos, tight(-4), 1)).toMatchObject({ flag: 'sign', clear: false });
    expect(verdict(neg, tight(0), 1)).toMatchObject({ flag: 'no-op', prop: -2, clear: false });
    expect(verdict(neg, tight(-9), 1)).toMatchObject({ prop: -9, clear: true });
  });
});

describe('pick rates and caps (19 §4 steps 3 and 4)', () => {
  it('a trait valued far above its cost is picked by every build that can take it, one valued at nothing by none', () => {
    const values = new Map([...bundle.traits.values()].filter((t) => t.cost !== 0 && t.category !== 'quirk').map((t) => [t.id, t.cost] as const));
    values.set('crimp_machine', 40);
    values.set('gymnast', 0);
    const rates = pickRates(bundle, values);
    expect(rates.get('crimp_machine')).toBeGreaterThan(0.8);
    expect(rates.get('gymnast') ?? 0).toBe(0);
  });

  it('finds no compatible set over +30% in today\'s data, and finds one when two crimp traits stack', () => {
    expect(capsOver(bundle)).toEqual([]);
    const a: Trait = { ...T('crimp_machine'), id: 'crimp_a', excludes: [], effect: { hold_mult: { crimp: 1.2 } } };
    const b: Trait = { ...a, id: 'crimp_b', effect: { hold_mult: { crimp: 1.15 } } };
    const fake: Pick<DataBundle, 'traits'> = { traits: new Map([...bundle.traits, ['crimp_a', a], ['crimp_b', b]]) };
    expect(capsOver(fake).find((c) => c.key === 'hold:crimp')?.total).toBeGreaterThan(0.3);
  });
});
