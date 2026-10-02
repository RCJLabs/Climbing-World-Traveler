// Headless career simulator (docs/19 §1–§2) over forked worker processes.
//   pnpm harness --n 40 --days 365 --seed 7 --policy both --out reports
// Writes <out>/harness-<seed>.md and .json and prints the report.
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/data/bundle';
import { runCareer, type CareerConfig, type CareerResult } from '../src/harness/career';
import { sampleBuild } from '../src/harness/sampler';
import { mean, quantile } from '../src/harness/sim';
import { fontGrade } from '../src/sim/grades';
import { DEFAULT_OPTIONS } from '../src/sim/presets';
import { stream } from '../src/sim/rng';

interface Job { index: number; cfg: CareerConfig }

if (process.env.CWT_HARNESS_WORKER) {
  const bundle = loadBundle(false);
  process.on('message', (msg: { jobs: Job[] }) => {
    for (const job of msg.jobs) process.send!({ index: job.index, result: runCareer(job.cfg, bundle) });
    process.send!({ done: true });
  });
} else {
  await main();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] ?? d : d; };
  const n = Number(opt('n', '40'));
  const days = Number(opt('days', '365'));
  const seed = opt('seed', '7');
  const policyArg = opt('policy', 'both');
  const workers = Math.max(1, Math.min(Number(opt('workers', String(cpus().length))), n));
  const out = opt('out', '');
  const bundle = loadBundle();

  const jobs: Job[] = [];
  for (let i = 0; i < n; i++) {
    const rng = stream('harness-build', seed, i);
    const spec = sampleBuild(rng, bundle, DEFAULT_OPTIONS, `H${i}`);
    const policy = policyArg === 'both' ? (i % 2 ? 'volume' : 'project') : (policyArg as 'project' | 'volume');
    jobs.push({ index: i, cfg: { seed: `h${seed}-${i}`, spec, days, policy, checkReplay: i < 2 } });
  }
  const t0 = performance.now();
  const results: CareerResult[] = new Array(n);
  await Promise.all(Array.from({ length: workers }, (_, w) => new Promise<void>((resolve, reject) => {
    const mine = jobs.filter((_, i) => i % workers === w);
    const child = fork(fileURLToPath(import.meta.url), [], { execArgv: ['--import', 'tsx'], env: { ...process.env, CWT_HARNESS_WORKER: '1' } });
    child.on('message', (m: { done?: boolean; index?: number; result?: CareerResult }) => {
      if (m.done) { child.kill(); resolve(); return; }
      results[m.index!] = m.result!;
      process.stderr.write('.');
    });
    child.on('error', reject);
    child.on('exit', (code) => { if (code) reject(new Error(`worker exited with ${code}`)); });
    child.send({ jobs: mine });
  })));
  process.stderr.write('\n');
  const report = buildReport(results, { n, days, seed, policy: policyArg, secs: (performance.now() - t0) / 1000, workers });
  console.log(report);
  if (out) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/harness-${seed}.md`, report + '\n');
    writeFileSync(`${out}/harness-${seed}.json`, JSON.stringify(results, null, 1) + '\n');
  }
}

function buildReport(rs: CareerResult[], meta: { n: number; days: number; seed: string; policy: string; secs: number; workers: number }): string {
  const L: string[] = [];
  const f = (x: number) => x.toFixed(1);
  const g = (di: number) => (di > 0 ? fontGrade(di) : '—');
  L.push(`# Harness report · seed ${meta.seed}`);
  L.push('');
  L.push(`${meta.n} careers × ${meta.days} days · policy ${meta.policy} · ${meta.secs.toFixed(0)} s on ${meta.workers} workers · ${Math.round(mean(rs.map((r) => r.actions)))} actions per career`);
  L.push('');
  L.push('## Grade estimate and personal best by month');
  L.push('');
  L.push('| Month | E p10 | E median | E p90 | PB median | PB p90 |');
  L.push('|---|---|---|---|---|---|');
  const E0 = rs.map((r) => r.E0);
  L.push(`| 0 | ${f(quantile(E0, 0.1))} | ${f(quantile(E0, 0.5))} (${g(quantile(E0, 0.5))}) | ${f(quantile(E0, 0.9))} | — | — |`);
  const maxM = Math.max(0, ...rs.map((r) => r.months.length));
  for (let m = 0; m < maxM; m++) {
    if (m % 3 !== 2 && m !== maxM - 1) continue;
    const row = rs.map((r) => r.months[m]).filter((x): x is NonNullable<typeof x> => !!x);
    const E = row.map((x) => x.E);
    const pb = row.map((x) => x.pb);
    L.push(`| ${m + 1} | ${f(quantile(E, 0.1))} | ${f(quantile(E, 0.5))} (${g(quantile(E, 0.5))}) | ${f(quantile(E, 0.9))} | ${f(quantile(pb, 0.5))} (${g(quantile(pb, 0.5))}) | ${f(quantile(pb, 0.9))} |`);
  }
  L.push('');
  L.push('## By background (final)');
  L.push('');
  L.push('| Background | n | E start | E end | PB | ticks | money end |');
  L.push('|---|---|---|---|---|---|---|');
  const bgs = [...new Set(rs.map((r) => r.background))].sort();
  for (const b of bgs) {
    const s = rs.filter((r) => r.background === b);
    const last = s.map((r) => r.months[r.months.length - 1]);
    L.push(`| ${b} | ${s.length} | ${f(mean(s.map((r) => r.E0)))} | ${f(mean(last.map((x) => x?.E ?? 0)))} | ${f(mean(s.map((r) => r.summary.hardest)))} | ${Math.round(mean(s.map((r) => r.summary.ticks)))} | ${Math.round(mean(last.map((x) => x?.money ?? 0)))} |`);
  }
  L.push('');
  L.push('## Policies');
  L.push('');
  for (const p of [...new Set(rs.map((r) => r.policy))]) {
    const s = rs.filter((r) => r.policy === p);
    L.push(`- **${p}:** PB ${f(mean(s.map((r) => r.summary.hardest)))}, hardest flash ${f(mean(s.map((r) => r.summary.hardest_flash)))}, ticks ${Math.round(mean(s.map((r) => r.summary.ticks)))}, E gain ${f(mean(s.map((r) => (r.months[r.months.length - 1]?.E ?? r.E0) - r.E0)))}, climbing days ${Math.round(mean(s.map((r) => r.climb_days)))}.`);
  }
  L.push('');
  L.push('## Run ends, money and stress');
  L.push('');
  const reasons = new Map<string, number>();
  for (const r of rs) reasons.set(r.summary.end_reason, (reasons.get(r.summary.end_reason) ?? 0) + 1);
  L.push(`- End reasons: ${[...reasons].map(([k, v]) => `${k} ${Math.round((100 * v) / rs.length)}%`).join(', ')} (retired includes careers that reached the day limit).`);
  L.push(`- Days played: median ${quantile(rs.map((r) => r.summary.days), 0.5)}, p10 ${quantile(rs.map((r) => r.summary.days), 0.1)}.`);
  const money = rs.map((r) => r.months[r.months.length - 1]?.money ?? 0);
  L.push(`- Money at the last sample: p10 ${Math.round(quantile(money, 0.1))}, median ${Math.round(quantile(money, 0.5))}, p90 ${Math.round(quantile(money, 0.9))}; work blocks per career ${Math.round(mean(rs.map((r) => r.work_blocks)))}.`);
  L.push(`- Burnout peak: median ${f(quantile(rs.map((r) => r.burnout_max), 0.5))}, p90 ${f(quantile(rs.map((r) => r.burnout_max), 0.9))}. Stoke at the last sample: median ${f(quantile(rs.map((r) => r.months[r.months.length - 1]?.stoke ?? 0), 0.5))}.`);
  L.push(`- Attempts per climbing day ${f(mean(rs.map((r) => r.attempts / Math.max(1, r.climb_days))))}; send rate ${f(100 * mean(rs.map((r) => r.sends / Math.max(1, r.attempts))))}%.`);
  L.push('');
  L.push('## Traits: carriers vs the rest (random builds, so effects are confounded; read as a first look)');
  L.push('');
  L.push('| Trait | carriers | Δ PB | Δ E gain | Δ ticks |');
  L.push('|---|---|---|---|---|');
  const gain = (r: CareerResult) => (r.months[r.months.length - 1]?.E ?? r.E0) - r.E0;
  const traits = [...new Set(rs.flatMap((r) => r.traits))].sort();
  const rows = traits.map((t) => {
    const yes = rs.filter((r) => r.traits.includes(t));
    const no = rs.filter((r) => !r.traits.includes(t));
    return { t, n: yes.length, dpb: mean(yes.map((r) => r.summary.hardest)) - mean(no.map((r) => r.summary.hardest)), dg: mean(yes.map(gain)) - mean(no.map(gain)), dt: mean(yes.map((r) => r.summary.ticks)) - mean(no.map((r) => r.summary.ticks)) };
  }).filter((x) => x.n >= 3).sort((a, b) => b.dpb - a.dpb);
  for (const x of rows) L.push(`| ${x.t} | ${x.n} | ${x.dpb >= 0 ? '+' : ''}${f(x.dpb)} | ${x.dg >= 0 ? '+' : ''}${f(x.dg)} | ${x.dt >= 0 ? '+' : ''}${Math.round(x.dt)} |`);
  L.push('');
  const checks = rs.filter((r) => r.replay_ok !== null);
  L.push(`## Determinism`);
  L.push('');
  L.push(`- Replay identity on ${checks.length} careers: ${checks.every((r) => r.replay_ok) ? 'all identical' : 'MISMATCH'}.`);
  return L.join('\n');
}
