// Harness skill profiles (docs/19 §3, docs/23 §5 step 6): a single skill plays every move type at that skill, and a
// profile varies one type with the others on Auto, which is how C8 measures each type alone.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { diceAttempt, onlyType, profileOf, syntheticRun } from '../src/harness/sim';
import { referenceAthlete } from '../src/sim/grade';
import { stream } from '../src/sim/rng';

const bundle = loadBundle(false);

describe('skill profiles', () => {
  it('a single skill is that skill on every type; onlyType leaves the others on Auto', () => {
    expect(profileOf('novice')).toEqual({ swing: 'novice', reach: 'novice', balance: 'novice' });
    expect(onlyType('reach', 'expert')).toEqual({ swing: 'auto', reach: 'expert', balance: 'auto' });
  });

  it('an all-Auto profile and a single skill play exactly as the plain timing does', () => {
    const route = [...bundle.signatures.values()][0]!;
    const base = syntheticRun(referenceAthlete(route.di_graded), 'harness-profile', bundle);
    for (let k = 0; k < 6; k++) {
      const plain = diceAttempt(base, route, k, bundle, 'auto', stream('t', k));
      expect(diceAttempt(base, route, k, bundle, onlyType('swing', 'auto'), stream('t', k))).toEqual(plain);
      const novice = diceAttempt(base, route, k, bundle, 'novice', stream('n', k));
      expect(diceAttempt(base, route, k, bundle, profileOf('novice'), stream('n', k))).toEqual(novice);
    }
  });
});
