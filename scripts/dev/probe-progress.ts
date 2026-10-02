// Multi-year progress against the Climbstat anchors (docs/12 §10, doc 22): reads a harness JSON written with
// --out and reports grade by year, time to DI 17 (7a) and DI 23 (8a), and yearly gains, split by experience.
// usage: pnpm harness --n 80 --days 1825 --out <dir>;  npx tsx scripts/dev/probe-progress.ts <dir>/harness-<seed>.json
import { readFileSync } from 'node:fs';
import type { CareerResult } from '../../src/harness/career';
import { quantile } from '../../src/harness/sim';

const rs: CareerResult[] = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
/** Backgrounds that are new to climbing (04): Climbstat counts from a climber's first day. */
const NOVICE = new Set(['gymnast', 'dancer', 'desk_job_late_starter', 'farm_kid']);
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const years = Math.floor(Math.max(...rs.map((r) => r.months.length)) / 12);

/** Days to the first monthly sample at or above `di` (null if never). */
const daysTo = (r: CareerResult, key: 'E' | 'pb', di: number): number | null => r.months.find((m) => m[key] >= di)?.day ?? null;
const at = (r: CareerResult, key: 'E' | 'pb', y: number): number => (y === 0 ? (key === 'E' ? r.E0 : NaN) : r.months[y * 12 - 1]?.[key] ?? NaN);

function group(name: string, g: CareerResult[]): void {
  if (!g.length) return;
  console.log(`\n## ${name} (n = ${g.length})`);
  console.log('| Year | E p10 / median / p90 | PB p10 / median / p90 | E gain that year (median) |');
  console.log('|---|---|---|---|');
  for (let y = 0; y <= years; y++) {
    const E = g.map((r) => at(r, 'E', y)).filter(Number.isFinite);
    const P = g.map((r) => at(r, 'pb', y)).filter(Number.isFinite);
    const gain = y ? g.map((r) => at(r, 'E', y) - at(r, 'E', y - 1)).filter(Number.isFinite) : [];
    console.log(`| ${y} | ${f(quantile(E, 0.1))} / ${f(quantile(E, 0.5))} / ${f(quantile(E, 0.9))} | ${P.length ? `${f(quantile(P, 0.1))} / ${f(quantile(P, 0.5))} / ${f(quantile(P, 0.9))}` : '—'} | ${gain.length ? f(quantile(gain, 0.5)) : '—'} |`);
  }
  for (const [key, di, label] of [['pb', 17, 'first DI 17 send (7a)'], ['E', 17, 'estimate DI 17'], ['pb', 23, 'first DI 23 send (8a)']] as const) {
    const ds = g.map((r) => daysTo(r, key, di));
    const hit = ds.filter((d): d is number => d !== null).map((d) => d / 365);
    // Median over everyone, counting those who never got there as later than the horizon.
    const all = ds.map((d) => (d === null ? Infinity : d / 365)).sort((a, b) => a - b);
    const med = all[Math.floor((all.length - 1) / 2)]!;
    console.log(`- ${label}: ${hit.length}/${g.length} within ${years} years; median ${Number.isFinite(med) ? `${med.toFixed(1)} years` : `over ${years} years`}${hit.length ? `; reached at ${f(quantile(hit, 0.1))}–${f(quantile(hit, 0.9))} years (p10–p90 of those who did)` : ''}`);
  }
}

group('All careers', rs);
group('New to climbing (Gymnast, Dancer, Desk Job, Farm Kid)', rs.filter((r) => NOVICE.has(r.background)));
group('Some experience (Gym Comp Kid, Dirtbag)', rs.filter((r) => !NOVICE.has(r.background)));
group('Started at 30 or older', rs.filter((r) => r.age >= 30));
group('Started under 22', rs.filter((r) => r.age < 22));
for (const p of ['project', 'volume']) group(`Policy: ${p}`, rs.filter((r) => r.policy === p));
