// The harness report (docs/19 §1): grades over the career, by background and age band, run ends, money, travel,
// traits and evolutions, and replay identity. One format for one-year runs at one crag and ten-year careers that
// travel (P2 M0); the monthly table is kept for runs that stay at one crag.

import { RETIRE_AGE, RETIRE_BURNOUT_DAYS } from '../sim/bot';
import { fontGrade, frenchGrade } from '../sim/grades';
import type { CareerResult, CareerSample } from './career';
import { mean, quantile } from './sim';

export interface ReportMeta {
  n: number;
  days: number;
  seed: string;
  policy: string;
  crag: string;
  life: boolean;
  secs: number;
  workers: number;
  force: string;
  evolving: string[];
  /** The reference crags' names (career.ts `referenceCrags`): where each discipline's estimate is read. */
  refs?: { boulder?: string; sport?: string };
  /** Careers read back from an earlier session of the same run (scripts/harness.ts), so `secs` covers the rest only. */
  resumed?: number;
}

/** Age bands at the start of a career (19 §1). */
export const AGE_BANDS: [number, number][] = [[16, 19], [20, 24], [25, 29], [30, 34], [35, 39], [40, 45]];

const f = (x: number): string => (Number.isFinite(x) ? x.toFixed(1) : '—');
const pct = (k: number, n: number): string => `${n ? Math.round((100 * k) / n) : 0}%`;
const fg = (di: number): string => (di > 0 ? fontGrade(di) : '—');
const rg = (di: number): string => (di > 0 ? frenchGrade(di) : '—');
const years = (r: CareerResult): number => r.summary.days / 365;
/** The last sample in career year `y` (1-based), for a career still going at that year's end. */
const yearEnd = (r: CareerResult, y: number): CareerSample | undefined =>
  r.summary.days >= 365 * y ? r.months.filter((m) => m.day <= 365 * y).at(-1) : undefined;
const spread = (xs: number[], g: (x: number) => string): string =>
  xs.length ? `${f(quantile(xs, 0.1))} / ${f(quantile(xs, 0.5))} (${g(quantile(xs, 0.5))}) / ${f(quantile(xs, 0.9))}` : '—';

/** 13 §1's anchors (Lutter 2020 and related data) the injury mix is checked against. */
export const INJURY_ANCHORS = {
  upper: 0.77, lower: 0.18, finger: [0.33, 0.52] as const, shoulder: 0.17, elbow: 0.08, pulley: 0.123, teno: 0.106,
  a2a4: [1.5, 2] as const, ankle_fracture_boulder_falls: 0.4, pulley_two_years: 0.13,
};

/**
 * Injuries (19 §1, 13 §1; P2 M2): rates per 1,000 climbing days, the site mix against 13 §1's anchors, causes and
 * grades, days off, relapses and careers ended. Kind `injury` unless said: skin and illness are counted apart.
 */
export function injuryStats(rs: CareerResult[]) {
  const all = rs.flatMap((r) => r.injuries.map((i) => ({ ...i, r })));
  const inj = all.filter((i) => i.kind === 'injury');
  const n = inj.length;
  const days = rs.reduce((a, r) => a + r.climb_days, 0);
  const share = (pred: (i: (typeof inj)[number]) => boolean) => (n ? inj.filter(pred).length / n : 0);
  const site = (s: string) => share((i) => i.site === s);
  const a2 = inj.filter((i) => i.def === 'a2_pulley').length;
  const a4 = inj.filter((i) => i.def === 'a4_pulley').length;
  const bfalls = inj.filter((i) => i.cause === 'fall' && i.crag === 'fontainebleau');
  const two = rs.filter((r) => r.summary.days >= 730);
  return {
    n, days, per1000: days ? (1000 * n) / days : 0,
    perYear: n / Math.max(1e-9, rs.reduce((a, r) => a + years(r), 0)),
    upper: share((i) => ['finger', 'wrist', 'elbow', 'shoulder'].includes(i.site)), lower: share((i) => i.site === 'knee' || i.site === 'ankle'),
    finger: site('finger'), shoulder: site('shoulder'), elbow: site('elbow'), wrist: site('wrist'), back: site('back'), knee: site('knee'), ankle: site('ankle'),
    pulley: share((i) => i.def === 'a2_pulley' || i.def === 'a4_pulley'), teno: share((i) => i.def === 'capsulitis'),
    a2a4: a4 ? a2 / a4 : NaN,
    ankleFractureBoulderFalls: bfalls.length ? bfalls.filter((i) => i.def === 'ankle_fracture').length / bfalls.length : NaN,
    pulleyTwoYears: two.length ? two.filter((r) => r.injuries.some((i) => (i.def === 'a2_pulley' || i.def === 'a4_pulley') && i.day < 730)).length / two.length : NaN,
    grade: [1, 2, 3].map((g) => share((i) => i.grade === g)),
    cause: ['load', 'move', 'fall'].map((c) => share((i) => i.cause === c)),
    relapse: share((i) => i.relapse),
    daysOffPerYear: inj.filter((i) => i.grade >= 2).reduce((a, i) => a + i.heal, 0) / Math.max(1e-9, rs.reduce((a, r) => a + years(r), 0)),
    skin: all.filter((i) => i.kind === 'skin'), illness: all.filter((i) => i.kind === 'illness'), inj,
  };
}

function injurySection(L: string[], rs: CareerResult[]): void {
  const s = injuryStats(rs);
  const A = INJURY_ANCHORS;
  const p1 = (x: number): string => (Number.isFinite(x) ? `${(100 * x).toFixed(1)}%` : '—');
  L.push('## Injuries (13 §1)');
  L.push('');
  L.push('Kind `injury` unless said; split tips, flappers and illness are counted apart. Rates are per 1,000 climbing days.');
  L.push('');
  const byCrag = [...new Set(rs.map((r) => r.crag))].sort().map((c) => {
    const rc = rs.filter((r) => r.crag === c);
    const k = injuryStats(rc);
    return `${c} starters ${f(k.per1000)}`;
  }).join(', ');
  L.push(`- ${s.n} injuries in ${s.days} climbing days: ${f(s.per1000)} per 1,000 (${byCrag}); ${s.perYear.toFixed(2)} per career-year. Grades 1/2/3: ${s.grade.map(p1).join(' / ')}. Causes load/move/fall: ${s.cause.map(p1).join(' / ')}. Relapses ${p1(s.relapse)}.`);
  L.push(`- Days off the rock (grade 2+, to the heal day) per career-year: ${f(s.daysOffPerYear)}. Careers ended by an injury: ${pct(rs.filter((r) => r.ended_by === 'forced_injury').length, rs.length)}.`);
  L.push('');
  L.push('| Measure | harness | 13 §1 anchor |');
  L.push('|---|---|---|');
  L.push(`| Upper limb (finger, wrist, elbow, shoulder) | ${p1(s.upper)} | ${p1(A.upper)} |`);
  L.push(`| Lower limb (knee, ankle) | ${p1(s.lower)} | ${p1(A.lower)} |`);
  L.push(`| Fingers | ${p1(s.finger)} | ${p1(A.finger[0])}–${p1(A.finger[1])} |`);
  L.push(`| Shoulder | ${p1(s.shoulder)} | about ${p1(A.shoulder)} |`);
  L.push(`| Elbow | ${p1(s.elbow)} | about ${p1(A.elbow)} |`);
  L.push(`| Wrist, back, knee, ankle | ${p1(s.wrist)}, ${p1(s.back)}, ${p1(s.knee)}, ${p1(s.ankle)} | — |`);
  L.push(`| Pulleys (A2, A4) | ${p1(s.pulley)} | ${p1(A.pulley)} |`);
  L.push(`| Capsulitis (for tenosynovitis) | ${p1(s.teno)} | ${p1(A.teno)} |`);
  L.push(`| A2 : A4 | ${f(s.a2a4)} | ${A.a2a4[0]}–${A.a2a4[1]} |`);
  L.push(`| Ankle fractures among Fontainebleau fall injuries | ${p1(s.ankleFractureBoulderFalls)} | ${p1(A.ankle_fracture_boulder_falls)} (indoor bouldering) |`);
  L.push(`| Careers with a pulley injury in their first two years | ${p1(s.pulleyTwoYears)} | ${p1(A.pulley_two_years)} |`);
  L.push('');
  const defs = [...new Set(s.inj.map((i) => i.def))].sort();
  if (defs.length) {
    L.push('| Injury | n | share | per 1,000 days | grade 2+ | median days to heal |');
    L.push('|---|---|---|---|---|---|');
    for (const d of defs) {
      const x = s.inj.filter((i) => i.def === d);
      L.push(`| ${d} | ${x.length} | ${p1(x.length / s.n)} | ${f((1000 * x.length) / Math.max(1, s.days))} | ${p1(x.filter((i) => i.grade >= 2).length / x.length)} | ${Math.round(quantile(x.map((i) => i.heal), 0.5))} |`);
    }
    L.push('');
  }
  const ill = new Map<string, number>();
  for (const i of s.illness) ill.set(i.def, (ill.get(i.def) ?? 0) + 1);
  const cy = Math.max(1e-9, rs.reduce((a, r) => a + years(r), 0));
  L.push(`- Skin (flappers): ${f((1000 * s.skin.length) / Math.max(1, s.days))} per 1,000 climbing days. Illness per career-year: ${[...ill].map(([d, k]) => `${d} ${(k / cy).toFixed(2)}`).join(', ') || 'none'}.`);
  L.push('');
}

export function buildReport(rs: CareerResult[], meta: ReportMeta): string {
  const L: string[] = [];
  const oneCrag = new Set(rs.map((r) => r.crag)).size === 1 && rs.every((r) => r.trips === 0);
  const sport = oneCrag && rs.every((r) => r.sport);
  const g = (di: number) => (sport ? rg(di) : fg(di));
  const where = oneCrag ? `${rs[0]?.crag ?? meta.crag} (${sport ? 'routes, French grades' : 'boulders, Font grades'})` : `${meta.crag} (boulders in Font grades, routes in French)`;
  L.push(`# Harness report · seed ${meta.seed} · ${where}`);
  L.push('');
  const span = meta.days % 365 === 0 && meta.days > 365 ? `${meta.days / 365} years` : `${meta.days} days`;
  L.push(`${meta.n} careers × ${span} · policy ${meta.policy}${meta.life ? ' · retiring by 19 §1 and travelling with the seasons' : ''}${meta.force ? ` · every build with ${meta.force}` : ''} · ${meta.secs.toFixed(0)} s on ${meta.workers} workers${meta.resumed ? ` for the ${meta.n - meta.resumed} not resumed from an earlier session` : ''} · ${Math.round(mean(rs.map((r) => r.actions)))} actions per career`);
  L.push('');

  if (oneCrag && meta.days <= 365) {
    L.push('## Grade estimate and personal best by month');
    L.push('');
    L.push('| Month | E p10 | E median | E p90 | PB median | PB p90 |');
    L.push('|---|---|---|---|---|---|');
    const E0 = rs.map((r) => r.E0);
    L.push(`| 0 | ${f(quantile(E0, 0.1))} | ${f(quantile(E0, 0.5))} (${g(quantile(E0, 0.5))}) | ${f(quantile(E0, 0.9))} | — | — |`);
    const maxM = Math.max(0, ...rs.map((r) => r.months.length));
    for (let m = 0; m < maxM; m++) {
      if (m % 3 !== 2 && m !== maxM - 1) continue;
      const row = rs.map((r) => r.months[m]).filter((x): x is CareerSample => !!x);
      const E = row.map((x) => x.E);
      const pb = row.map((x) => x.pb);
      L.push(`| ${m + 1} | ${f(quantile(E, 0.1))} | ${f(quantile(E, 0.5))} (${g(quantile(E, 0.5))}) | ${f(quantile(E, 0.9))} | ${f(quantile(pb, 0.5))} (${g(quantile(pb, 0.5))}) | ${f(quantile(pb, 0.9))} |`);
    }
    L.push('');
  } else {
    L.push('## Careers by year');
    L.push('');
    L.push(`Estimates in each discipline (boulders on ${meta.refs?.boulder ?? 'the boulder reference crag'}'s benchmarks, routes on ${meta.refs?.sport ?? 'the route reference crag'}'s) wherever the climber is, p10 / median / p90; personal bests are medians; money is at the year's last sample. A row counts the careers still going at the year's end.`);
    L.push('');
    L.push('| Year | careers | boulder E | route E | boulder PB | route PB | money p10 / median / p90 |');
    L.push('|---|---|---|---|---|---|---|');
    const Y = Math.ceil(meta.days / 365);
    for (let y = 1; y <= Y; y++) {
      const s = rs.map((r) => yearEnd(r, y)).filter((x): x is CareerSample => !!x);
      if (!s.length) break;
      const money = s.map((x) => x.money);
      const pbb = s.map((x) => x.pb_boulder).filter((x) => x > 0);
      const pbr = s.map((x) => x.pb_route).filter((x) => x > 0);
      L.push(`| ${y} | ${s.length} | ${spread(s.map((x) => x.Eb), fg)} | ${spread(s.map((x) => x.Er), rg)} | ${pbb.length ? `${f(quantile(pbb, 0.5))} (${fg(quantile(pbb, 0.5))})` : '—'} | ${pbr.length ? `${f(quantile(pbr, 0.5))} (${rg(quantile(pbr, 0.5))})` : '—'} | ${Math.round(quantile(money, 0.1))} / ${Math.round(quantile(money, 0.5))} / ${Math.round(quantile(money, 0.9))} |`);
    }
    L.push('');
  }

  L.push('## By background (final)');
  L.push('');
  L.push('| Background | n | E start | E end | PB | ticks | years | money end |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const b of [...new Set(rs.map((r) => r.background))].sort()) {
    const s = rs.filter((r) => r.background === b);
    const last = s.map((r) => r.months[r.months.length - 1]);
    L.push(`| ${b} | ${s.length} | ${f(mean(s.map((r) => r.E0)))} | ${f(mean(last.map((x) => x?.E ?? 0)))} | ${f(mean(s.map((r) => r.hardest)))} | ${Math.round(mean(s.map((r) => r.summary.ticks)))} | ${f(mean(s.map(years)))} | ${Math.round(mean(last.map((x) => x?.money ?? 0)))} |`);
  }
  L.push('');

  L.push('## By age at the start (19 §1)');
  L.push('');
  L.push('E start and PB are in the start crag\'s discipline; best E is the highest estimate in any sample, in either discipline.');
  L.push('');
  L.push(`| Age | n | E start | best E | PB | years | retired at ${RETIRE_AGE} |`);
  L.push('|---|---|---|---|---|---|---|');
  for (const [lo, hi] of AGE_BANDS) {
    const s = rs.filter((r) => r.age >= lo && r.age <= hi);
    if (!s.length) continue;
    const best = s.map((r) => Math.max(r.E0, ...r.months.map((m) => Math.max(m.Eb, m.Er))));
    L.push(`| ${lo}–${hi} | ${s.length} | ${f(mean(s.map((r) => r.E0)))} | ${f(mean(best))} | ${f(mean(s.map((r) => r.hardest)))} | ${f(mean(s.map(years)))} | ${pct(s.filter((r) => r.ended_by === 'retired_age').length, s.length)} |`);
  }
  L.push('');

  L.push('## Policies');
  L.push('');
  for (const p of [...new Set(rs.map((r) => r.policy))]) {
    const s = rs.filter((r) => r.policy === p);
    L.push(`- **${p}:** PB ${f(mean(s.map((r) => r.hardest)))}, hardest ${sport ? 'onsight' : 'flash'} ${f(mean(s.map((r) => r.hardest_onsight)))}, ticks ${Math.round(mean(s.map((r) => r.summary.ticks)))}, E gain ${f(mean(s.map((r) => (r.months[r.months.length - 1]?.E ?? r.E0) - r.E0)))}, climbing days ${Math.round(mean(s.map((r) => r.climb_days)))}${meta.days > 365 ? `, years ${f(mean(s.map(years)))}` : ''}.`);
  }
  L.push('');

  L.push('## Run ends, money and stress');
  L.push('');
  const ends = new Map<string, number>();
  for (const r of rs) ends.set(r.ended_by, (ends.get(r.ended_by) ?? 0) + 1);
  const ENDS: Record<string, string> = {
    limit: 'reached the day limit', retired_age: `retired at ${RETIRE_AGE}`, retired_burnout: `retired after ${RETIRE_BURNOUT_DAYS} days burnt out`, retired: 'retired',
    burnout: 'quit burnt out', bankrupt: 'bankrupt', forced_injury: 'forced out by injury', death: 'died',
  };
  L.push(`- Ended by: ${[...ends].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${ENDS[k] ?? k} ${pct(v, rs.length)}`).join(', ')}.`);
  const yrs = rs.map(years);
  L.push(`- Years played: p10 ${f(quantile(yrs, 0.1))}, median ${f(quantile(yrs, 0.5))}, p90 ${f(quantile(yrs, 0.9))}.`);
  const broke = rs.filter((r) => r.ended_by === 'bankrupt').map(years);
  if (broke.length) L.push(`- Bankrupt careers ended at a median of ${f(quantile(broke, 0.5))} years.`);
  const money = rs.map((r) => r.months[r.months.length - 1]?.money ?? 0);
  L.push(`- Money at the last sample: p10 ${Math.round(quantile(money, 0.1))}, median ${Math.round(quantile(money, 0.5))}, p90 ${Math.round(quantile(money, 0.9))}; work blocks per career-year ${Math.round(mean(rs.map((r) => r.work_blocks / Math.max(1 / 365, years(r)))))}.`);
  L.push(`- Burnout peak: median ${f(quantile(rs.map((r) => r.burnout_max), 0.5))}, p90 ${f(quantile(rs.map((r) => r.burnout_max), 0.9))}. Stoke at the last sample: median ${f(quantile(rs.map((r) => r.months[r.months.length - 1]?.stoke ?? 0), 0.5))}.`);
  L.push(`- Attempts per climbing day ${f(mean(rs.map((r) => r.attempts / Math.max(1, r.climb_days))))}; send rate ${f(100 * mean(rs.map((r) => r.sends / Math.max(1, r.attempts))))}%.`);
  L.push('');

  if (!oneCrag || meta.life) {
    L.push('## Travel');
    L.push('');
    const total = new Map<string, number>();
    for (const r of rs) for (const [c, d] of Object.entries(r.days_at)) total.set(c, (total.get(c) ?? 0) + d);
    const all = [...total.values()].reduce((a, b) => a + b, 0);
    L.push(`- Trips per career: mean ${f(mean(rs.map((r) => r.trips)))}; careers with at least one: ${pct(rs.filter((r) => r.trips > 0).length, rs.length)}.`);
    L.push(`- Days at each crag: ${[...total].sort((a, b) => b[1] - a[1]).map(([c, d]) => `${c} ${pct(d, all)}`).join(', ')}.`);
    L.push('');
  }

  injurySection(L, rs);

  L.push('## Traits: carriers vs the rest (random builds, so effects are confounded; read as a first look)');
  L.push('');
  L.push('| Trait | carriers | Δ PB | Δ E gain | Δ ticks |');
  L.push('|---|---|---|---|---|');
  const gain = (r: CareerResult) => (r.months[r.months.length - 1]?.E ?? r.E0) - r.E0;
  const rows = [...new Set(rs.flatMap((r) => r.traits))].sort().map((t) => {
    const yes = rs.filter((r) => r.traits.includes(t));
    const no = rs.filter((r) => !r.traits.includes(t));
    return { t, n: yes.length, dpb: mean(yes.map((r) => r.hardest)) - mean(no.map((r) => r.hardest)), dg: mean(yes.map(gain)) - mean(no.map(gain)), dt: mean(yes.map((r) => r.summary.ticks)) - mean(no.map((r) => r.summary.ticks)) };
  }).filter((x) => x.n >= 3).sort((a, b) => b.dpb - a.dpb);
  for (const x of rows) L.push(`| ${x.t} | ${x.n} | ${x.dpb >= 0 ? '+' : ''}${f(x.dpb)} | ${x.dg >= 0 ? '+' : ''}${f(x.dg)} | ${x.dt >= 0 ? '+' : ''}${Math.round(x.dt)} |`);
  L.push('');

  // Each carrier's chain of stages from the trait it was built with: how many reached each stage, and on what day.
  L.push('## Evolving traits (03 §1.7)');
  L.push('');
  L.push('| Trait | carriers | stages reached: careers, median day (p10–p90) |');
  L.push('|---|---|---|');
  for (const e of meta.evolving) {
    const carriers = rs.filter((r) => r.traits.includes(e));
    if (!carriers.length) continue;
    const reached = new Map<string, number[]>();
    for (const r of carriers) {
      let cur: string | null = e;
      for (const x of r.evolved) {
        if (x.from !== cur) continue;
        const stage = x.to ?? 'gone';
        reached.set(stage, [...(reached.get(stage) ?? []), x.day]);
        cur = x.to;
      }
    }
    const cells = [...reached].map(([s, d]) => `${s} ${d.length}, day ${Math.round(quantile(d, 0.5))} (${Math.round(quantile(d, 0.1))}–${Math.round(quantile(d, 0.9))})`);
    L.push(`| ${e} | ${carriers.length} | ${cells.join('; ') || 'none'} |`);
  }
  L.push('');
  const checks = rs.filter((r) => r.replay_ok !== null);
  L.push('## Determinism');
  L.push('');
  L.push(`- Replay identity on ${checks.length} careers: ${checks.every((r) => r.replay_ok) ? 'all identical' : 'MISMATCH'}.`);
  return L.join('\n');
}
