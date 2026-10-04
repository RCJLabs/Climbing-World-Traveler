// Whole careers in the harness (docs/19 §1, P2 M0): the bot's retirement and seasonal travel, the game's default week
// as a policy, and the report's sections.
import { describe, expect, it } from 'vitest';
import { loadBundle } from '../src/data/bundle';
import { runCareer, type CareerResult } from '../src/harness/career';
import { buildReport } from '../src/harness/report';
import { sampleBuild } from '../src/harness/sampler';
import { BotDriver, PROJECT_POLICY, RETIRE_AGE, RETIRE_BURNOUT, RETIRE_BURNOUT_DAYS, seasonalTrip, TRAVEL_RESERVE_DAYS } from '../src/sim/bot';
import { DEFAULT_OPTIONS, presetSpec } from '../src/sim/presets';
import { stream } from '../src/sim/rng';
import { createRun, dailyCost } from '../src/sim/run';
import type { RunSummary } from '../src/sim/types';

const bundle = loadBundle();
const DEC = 11;
const APR = 3;
const JUL = 6;

describe('a career beyond the day (19 §1)', () => {
  it('retires at RETIRE_AGE, and after RETIRE_BURNOUT_DAYS days in a row burnt out', () => {
    const old = createRun('old', { ...presetSpec('dirtbag', DEFAULT_OPTIONS), body: { ...presetSpec('dirtbag', DEFAULT_OPTIONS).body, age_start: 30 } }, bundle);
    old.day = (RETIRE_AGE - 30) * 365;
    const a = new BotDriver(old, bundle, PROJECT_POLICY, { retire: true, travel: false });
    a.day();
    expect(old.ended?.end_reason).toBe('retired');
    expect(a.retired).toBe('age');

    const tired = createRun('tired', presetSpec('dirtbag', DEFAULT_OPTIONS), bundle);
    const b = new BotDriver(tired, bundle, PROJECT_POLICY, { retire: true, travel: false });
    let days = 0;
    while (!tired.ended && days < RETIRE_BURNOUT_DAYS + 5) {
      tired.res.burnout = 100;
      tired.res.stoke = 100;
      b.day();
      days++;
    }
    expect(b.retired).toBe('burnout');
    expect(days).toBe(RETIRE_BURNOUT_DAYS + 1);
    expect(tired.res.burnout).toBeGreaterThan(RETIRE_BURNOUT);
    // Without the rule nothing retires.
    const free = createRun('free', presetSpec('dirtbag', DEFAULT_OPTIONS), bundle);
    free.day = 30 * 365;
    new BotDriver(free, bundle, PROJECT_POLICY).day();
    expect(free.ended).toBeNull();
  });

  it('travels with the seasons: a Kalymnos climber winters at Font and goes home in spring', () => {
    const run = createRun('trip', sampleBuild(stream('harness-test', 1), bundle, DEFAULT_OPTIONS, 'K', 'kalymnos'), bundle);
    expect(run.crag).toBe('kalymnos');
    run.res.money = 5000;
    expect(seasonalTrip(run, bundle, DEC)).toBe('fontainebleau');
    expect(seasonalTrip(run, bundle, APR)).toBeNull();
    // At Font, home calls in April, not in March or in the summer when Kalymnos is shut.
    run.crag = 'fontainebleau';
    run.visited.push('fontainebleau');
    expect(seasonalTrip(run, bundle, APR - 1)).toBeNull();
    expect(seasonalTrip(run, bundle, APR)).toBe('kalymnos');
    expect(seasonalTrip(run, bundle, JUL)).toBeNull();
    // A trip must leave TRAVEL_RESERVE_DAYS of living costs.
    run.res.money = 280 + TRAVEL_RESERVE_DAYS * dailyCost(run, bundle) - 1;
    expect(seasonalTrip(run, bundle, APR)).toBeNull();
    // A Font climber never has to move: the forest is never out of season while Kalymnos is in.
    const font = createRun('stay', presetSpec('dirtbag', DEFAULT_OPTIONS), bundle);
    for (let m = 0; m < 12; m++) expect(seasonalTrip(font, bundle, m)).toBeNull();
  });

  it('plays the game\'s default week as a policy, and the log replays', () => {
    const r = runCareer({ seed: 'plan', spec: presetSpec('dirtbag', DEFAULT_OPTIONS), days: 28, policy: 'plan', checkReplay: true }, bundle);
    expect(r.replay_ok).toBe(true);
    // The default week climbs four days in seven, less what wet days and a short purse take (24 §2).
    expect(r.climb_days).toBeGreaterThan(3);
    expect(r.limit).toBe(true);
    expect(r.ended_by).toBe('limit');
  });
});

describe('the report (19 §1)', () => {
  const summary = (days: number, end: RunSummary['end_reason']): RunSummary => ({ days, end_reason: end, hardest: 15, hardest_flash: 13, hardest_route: 0, hardest_route_onsight: 0, ticks: 100, circuits: [], score: 150, unlocks: [], seed: 's' } as unknown as RunSummary);
  const career = (i: number, years: number, ended: CareerResult['ended_by']): CareerResult => ({
    seed: `c${i}`, crag: i % 2 ? 'kalymnos' : 'fontainebleau', sport: i % 2 === 1, background: i % 2 ? 'rower_swimmer' : 'dirtbag_dropout',
    traits: [], evolved: [], age: 20 + 5 * i, height: 170, policy: 'plan', E0: 12,
    months: Array.from({ length: Math.floor((years * 365) / 30) }, (_, k) => ({
      day: 30 * (k + 1), crag: 'fontainebleau', E: 12 + k / 20, Eb: 12 + k / 20, Er: 11 + k / 20, pb: 13, pb_boulder: 13, pb_route: i % 2 ? 12 : 0,
      money: 1000 + 10 * k, stoke: 70, burnout: 5,
    })),
    hardest: 15, hardest_onsight: 13, summary: summary(Math.round(years * 365), ended === 'bankrupt' ? 'bankrupt' : 'retired'),
    limit: ended === 'limit', ended_by: ended, trips: i % 2 ? 4 : 0, days_at: { fontainebleau: 300, kalymnos: i % 2 ? 300 : 0 },
    climb_days: 200, attempts: 1000, sends: 200, train_blocks: 50, work_blocks: 100, burnout_max: 10, actions: 5000, replay_ok: i === 0 ? true : null, ms: 1,
    // Two injuries a career: a pulley strain in the first year, and an ankle off a boulder or a cold.
    injuries: [
      { def: 'a2_pulley', site: 'finger', kind: 'injury', grade: 2, cause: 'load', day: 100, heal: 40, full: 70, crag: 'fontainebleau', career_ending: false, relapse: false },
      i % 2
        ? { def: 'common_cold', site: 'systemic', kind: 'illness', grade: 1, cause: 'illness', day: 400, heal: 4, full: 5, crag: 'kalymnos', career_ending: false, relapse: false }
        : { def: 'ankle_fracture', site: 'ankle', kind: 'injury', grade: 3, cause: 'fall', day: 500, heal: 90, full: 200, crag: 'fontainebleau', career_ending: false, relapse: false },
    ],
  });

  it('has a row per career year, the run ends, the age bands, travel and the injury section', () => {
    const rs = [career(0, 10, 'limit'), career(1, 10, 'limit'), career(2, 3.5, 'bankrupt'), career(3, 7, 'retired_burnout')];
    const md = buildReport(rs, { n: 4, days: 3650, seed: '7', policy: 'plan', crag: 'both', life: true, secs: 1, workers: 1, force: '', evolving: [] });
    for (const h of ['## Careers by year', '## By background (final)', '## By age at the start (19 §1)', '## Run ends, money and stress', '## Travel', '## Injuries', '## Determinism']) {
      expect(md).toContain(h);
    }
    expect(md).toMatch(/\| 1 \| 4 \|/);
    expect(md).toMatch(/\| 4 \| 3 \|/);
    expect(md).toMatch(/\| 8 \| 2 \|/);
    expect(md).toContain('reached the day limit 50%');
    expect(md).toContain('bankrupt 25%');
    expect(md).toContain('retired after 60 days burnt out 25%');
    expect(md).not.toContain('## Grade estimate and personal best by month');
    // The injury section (P2 M2): 6 injuries in 800 climbing days; the mix against 13 §1's anchors; illness apart.
    expect(md).toContain('6 injuries in 800 climbing days: 7.5 per 1,000');
    expect(md).toMatch(/\| Pulleys \(A2, A4\) \| 66\.7% \| 12\.3% \|/);
    expect(md).toMatch(/\| Ankle fractures among Fontainebleau fall injuries \| 100\.0% \|/);
    expect(md).toContain('common_cold');
  });
});
