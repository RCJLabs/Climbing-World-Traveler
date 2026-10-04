// Headless career simulator (docs/19 §1–§2) over forked worker processes.
//   pnpm harness --n 40 --days 365 --seed 7 --policy both --crag fontainebleau --out reports
//   pnpm harness --n 1000 --years 10 --crag both --policy all --out reports          (P2 M0: whole careers)
// `--crag` keeps to the backgrounds that start there: fontainebleau (P1a boulders, the default), kalymnos (routes),
// both (every other career at each, independently of the policy) or any (backgrounds uniform over the live phase).
// `--policy` is project, volume, plan (the game's default week), both (project and volume) or all (the three).
// `--years N` plays careers of up to N years that retire by 19 §1's rule and travel with the seasons; `--days N`
// plays N days at the start crag (the one-year runs of P1). `--trait <id>` gives every career that trait: each
// sampled build that cannot take it is redrawn (docs/19 §2). Writes <out>/harness-<tag>.md and .json.
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/data/bundle';
import { HARNESS_ROUTE_CACHE, runCareer, type CareerConfig, type CareerPolicy, type CareerResult } from '../src/harness/career';
import { toggled } from '../src/harness/recost';
import { buildReport } from '../src/harness/report';
import { sampleBuild } from '../src/harness/sampler';
import { setRouteCacheMax } from '../src/sim/attempt';
import { phaseLive } from '../src/sim/character';
import { DEFAULT_OPTIONS } from '../src/sim/presets';
import { stream } from '../src/sim/rng';

interface Job { index: number; cfg: CareerConfig }
const POLICY_SETS: Record<string, CareerPolicy[]> = { project: ['project'], volume: ['volume'], plan: ['plan'], both: ['project', 'volume'], all: ['project', 'volume', 'plan'] };
/** This script's own file: a worker is a fork of it, under tsx when it is TypeScript (scripts/bundled.ts runs a bundle). */
const SELF = fileURLToPath(import.meta.url);

if (process.env.CWT_HARNESS_WORKER) {
  const bundle = loadBundle(false);
  setRouteCacheMax(HARNESS_ROUTE_CACHE);
  // One career at a time from the parent's queue, so a worker that drew short careers takes on more.
  process.on('message', (msg: { job?: Job; done?: boolean }) => {
    if (msg.done) { process.exit(0); return; }
    // A career that throws is reported and the run goes on: one bad career must not cost a two-hour run.
    try {
      process.send!({ index: msg.job!.index, result: runCareer(msg.job!.cfg, bundle) });
    } catch (e) {
      process.send!({ index: msg.job!.index, error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
    }
  });
} else {
  await main();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] ?? d : d; };
  const n = Number(opt('n', '40'));
  const yearsArg = opt('years', '');
  const days = yearsArg ? 365 * Number(yearsArg) : Number(opt('days', '365'));
  const life = !!yearsArg;
  const seed = opt('seed', '7');
  const policyArg = opt('policy', 'both');
  const policies = POLICY_SETS[policyArg];
  if (!policies) throw new Error(`unknown policy ${policyArg}`);
  const workers = Math.max(1, Math.min(Number(opt('workers', String(cpus().length))), n));
  const out = opt('out', '');
  const crag = opt('crag', 'fontainebleau');
  const bundle = loadBundle();
  const live = [...bundle.crags.values()].filter((c) => phaseLive(c.phase)).map((c) => c.id);
  const startCrag = (i: number): string | undefined =>
    crag === 'any' ? undefined : crag === 'both' ? live[Math.floor(i / policies.length) % live.length] : crag;
  if (crag !== 'any' && crag !== 'both' && !live.includes(crag)) throw new Error(`unknown crag ${crag}`);
  const force = opt('trait', '');
  const forced = force ? bundle.traits.get(force) : undefined;
  if (force && !forced) throw new Error(`unknown trait ${force}`);

  const jobs: Job[] = [];
  for (let i = 0; i < n; i++) {
    const rng = stream('harness-build', seed, i);
    let spec = sampleBuild(rng, bundle, DEFAULT_OPTIONS, `H${i}`, startCrag(i));
    // A forced trait goes onto the build as the re-costing adds it (budget unchecked); a build that cannot take it is redrawn.
    for (let k = 0; forced && !spec.traits.includes(forced.id); k++) {
      const v = toggled(spec, bundle.backgrounds.get(spec.background)!, forced, bundle);
      if (v) spec = v.spec;
      else if (k < 50) spec = sampleBuild(rng, bundle, DEFAULT_OPTIONS, `H${i}`, startCrag(i));
      else throw new Error(`no build at ${crag} can take ${forced.id}`);
    }
    jobs.push({ index: i, cfg: { seed: `h${seed}-${i}`, spec, days, policy: policies[i % policies.length]!, life, checkReplay: i < 2 && !forced, unchecked: !!forced } });
  }
  const t0 = performance.now();
  const results: (CareerResult | undefined)[] = new Array(n);
  const failed: { index: number; seed: string; error: string }[] = [];
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: workers }, () => new Promise<void>((resolve, reject) => {
    const child = fork(SELF, [], { execArgv: SELF.endsWith('.ts') ? ['--import', 'tsx'] : [], env: { ...process.env, CWT_HARNESS_WORKER: '1' } });
    const feed = () => {
      if (next < jobs.length) child.send({ job: jobs[next++] });
      else { child.send({ done: true }); resolve(); }
    };
    child.on('message', (m: { index: number; result?: CareerResult; error?: string }) => {
      if (m.result) results[m.index] = m.result;
      else failed.push({ index: m.index, seed: jobs[m.index]!.cfg.seed, error: m.error ?? 'unknown' });
      done++;
      if (n >= 100 && done % Math.ceil(n / 20) === 0) {
        const s = (performance.now() - t0) / 1000;
        process.stderr.write(`${done}/${n} careers in ${Math.round(s)} s, about ${Math.round((s / done) * (n - done))} s to go\n`);
      } else if (n < 100) process.stderr.write('.');
      feed();
    });
    child.on('error', reject);
    child.on('exit', (code) => { if (code) reject(new Error(`worker exited with ${code}`)); });
    feed();
  })));
  if (n < 100) process.stderr.write('\n');
  const evolving = [...bundle.traits.values()].filter((t) => t.kind === 'evolving' && phaseLive(t.phase)).map((t) => t.id);
  const ok = results.filter((r): r is CareerResult => !!r);
  let report = buildReport(ok, { n: ok.length, days, seed, policy: policyArg, crag, life, secs: (performance.now() - t0) / 1000, workers, force, evolving });
  if (failed.length) {
    report += `\n\n## Failed careers\n\n${failed.map((x) => `- ${x.seed} (#${x.index}): ${x.error.split('\n')[0]}`).join('\n')}`;
    for (const x of failed) process.stderr.write(`career ${x.seed} failed: ${x.error}\n`);
  }
  console.log(report);
  if (out) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(out, { recursive: true });
    const tag = `${crag === 'fontainebleau' ? '' : `${crag}-`}${life ? `${yearsArg}y-` : ''}${force ? `${force}-` : ''}${seed}`;
    writeFileSync(`${out}/harness-${tag}.md`, report + '\n');
    writeFileSync(`${out}/harness-${tag}.json`, JSON.stringify(ok) + '\n');
  }
}
