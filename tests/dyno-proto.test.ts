// Dyno prototype model (docs/23 §6): reach decides whether the hold can be caught, the moment of the tap and the hand
// speed decide how. Pins the shape of the model the prototype is tuned with, not its numbers.
import { describe, expect, it } from 'vitest';
import { stream } from '../src/sim/rng';
import { autoDyno, bestLaunch, catchSpeed, fly, judge, launch, MODERATE, ROCKET, SLAP_S, type DynoStats } from '../src/ui/proto/dyno';

const strong: DynoStats = { power: 75, contact: 70, commitment: 70, pump: 10, ape: 1.04 };
const average: DynoStats = { power: 50, contact: 50, commitment: 50, pump: 20, ape: 1.0 };

describe('dyno prototype model', () => {
  it('falls short on a weak launch', () => {
    expect(judge(ROCKET, strong, launch(strong, 0.3, 100), 0.3).result).toBe('short');
  });

  it('finds a launch with a usable window, and a tap at its dead point is the clean catch', () => {
    const b = bestLaunch(ROCKET, strong)!;
    const v = launch(strong, b.power, b.angle);
    const f = fly(ROCKET, strong, v);
    expect(f.window).not.toBeNull();
    expect(f.window![1] - f.window![0]).toBeGreaterThan(0.15);
    expect(judge(ROCKET, strong, v, f.slowest).result).toBe('deadpoint');
  });

  it('slaps just outside the window and misses beyond it or without a tap', () => {
    const b = bestLaunch(ROCKET, strong)!;
    const v = launch(strong, b.power, b.angle);
    const [t1, t2] = fly(ROCKET, strong, v).window!;
    expect(judge(ROCKET, strong, v, t1 - SLAP_S / 2).result).toBe('slap');
    expect(judge(ROCKET, strong, v, t2 + SLAP_S / 2).result).toBe('slap');
    expect(judge(ROCKET, strong, v, t2 + 2 * SLAP_S).result).toBe('missed');
    expect(judge(ROCKET, strong, v, null).result).toBe('missed');
  });

  it('rips off when the hand arrives faster than the fingers can stop it', () => {
    const weakGrip = { ...strong, contact: 0 };
    const v = launch(weakGrip, 1, 100);
    const f = fly(ROCKET, weakGrip, v);
    expect(f.window).not.toBeNull();
    // Early in the window the body is still rising fast.
    expect(judge(ROCKET, weakGrip, v, f.window![0]).speed!).toBeGreaterThan(catchSpeed(weakGrip));
    expect(judge(ROCKET, weakGrip, v, f.window![0]).result).toBe('slap');
  });

  it('keeps Rainbow Rocket out of reach of an average build but not the moderate dyno', () => {
    expect(bestLaunch(ROCKET, average)).toBeNull();
    expect(bestLaunch(MODERATE, average)).not.toBeNull();
  });

  it('plays Auto the same way from the same seed', () => {
    const a = autoDyno(ROCKET, strong, stream('t', 1));
    const b = autoDyno(ROCKET, strong, stream('t', 1));
    expect(a).toEqual(b);
  });
});
