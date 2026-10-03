// Trait re-costing (docs/19 §4, docs/26 §10): what each live creation trait is worth over whole careers. Paired
// careers: each sampled base build plays once as sampled and once with the trait added (or taken away, when the base
// carries it), from the same seed, so the pair shares its weather and its first dice. A trait's impact is the mean
// change in career score (16 §6) over its pairs, in trait points at today's price level (priceSlope); 19 §4's own
// yardstick, +5 on one physical attribute, is played and reported beside it. A base that cannot take the trait (an
// exclusion, a trait its background locks or forces) is left out of that trait's pairs. Then the verdict per trait (a
// proposal on its own side, clear only outside the noise; no-op and sign flags), pick rates under a greedy builder,
// the caps check and the diff. Careers stream to <out>/recost-<crag>-<seed>.jsonl, so a long run resumes where it
// stopped, and a finished one re-reads in seconds.
//   pnpm recost --n 24 --days 365 --seed 7 [--crag fontainebleau] [--traits a,b] [--workers 4] [--out dir]
import { fork } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/data/bundle';
import { HARNESS_ROUTE_CACHE, runCareer, type CareerConfig } from '../src/harness/career';
import { capsOver, divergedDelta, mean, pickRates, priceSlope, sd, toggled, verdict, type Lite, type Verdict } from '../src/harness/recost';
import { sampleBuild } from '../src/harness/sampler';
import { setRouteCacheMax } from '../src/sim/attempt';
import { phaseLive } from '../src/sim/character';
import { DEFAULT_OPTIONS } from '../src/sim/presets';
import { cyrb53, stream } from '../src/sim/rng';
import { PHYSICAL_ATTRS, type AttrId, type DataBundle, type NewRunSpec, type Trait } from '../src/sim/types';

interface Job { key: string; cfg: CareerConfig }
/** This script's own file: a worker is a fork of it, under tsx when it is TypeScript (scripts/bundled.ts runs a bundle). */
const SELF = fileURLToPath(import.meta.url);

if (process.env.CWT_RECOST_WORKER) {
  const bundle = loadBundle(false);
  setRouteCacheMax(HARNESS_ROUTE_CACHE);
  process.on('message', (msg: { jobs: Job[] }) => {
    for (const job of msg.jobs) {
      const r = runCareer(job.cfg, bundle);
      process.send!({ key: job.key, lite: { score: r.summary.score, hardest: r.hardest, ticks: r.summary.ticks, days: r.summary.days } satisfies Lite });
    }
    process.send!({ done: true });
  });
} else {
  await main();
}

/** The base builds and every variant to play: the base itself, each trait toggled, each physical attribute +5. */
function plan(bundle: DataBundle, o: { n: number; days: number; seed: string; crag: string; traits: Trait[] }): { jobs: Job[]; sign: Map<string, number> } {
  const jobs: Job[] = [];
  const sign = new Map<string, number>();
  for (let i = 0; i < o.n; i++) {
    const spec = sampleBuild(stream('recost-build', o.seed, i), bundle, DEFAULT_OPTIONS, `R${i}`, o.crag);
    const bg = bundle.backgrounds.get(spec.background)!;
    const cfg = (s: NewRunSpec): CareerConfig => ({ seed: `rc${o.seed}-${i}`, spec: s, days: o.days, policy: i % 2 ? 'volume' : 'project', unchecked: true });
    jobs.push({ key: `${i}|base`, cfg: cfg(spec) });
    for (const t of o.traits) {
      const v = toggled(spec, bg, t, bundle);
      if (!v) continue;
      jobs.push({ key: `${i}|t:${t.id}`, cfg: cfg(v.spec) });
      sign.set(`${i}|t:${t.id}`, v.sign);
    }
    for (const a of PHYSICAL_ATTRS) jobs.push({ key: `${i}|a:${a}`, cfg: cfg({ ...spec, attr_alloc: { ...spec.attr_alloc, [a]: (spec.attr_alloc[a] ?? 0) + 5 } }) });
  }
  return { jobs, sign };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] ?? d : d; };
  const n = Number(opt('n', '12'));
  const days = Number(opt('days', '365'));
  const seed = opt('seed', '7');
  const crag = opt('crag', 'fontainebleau');
  const out = opt('out', 'reports');
  const only = opt('traits', '').split(',').filter(Boolean);
  const workers = Math.max(1, Number(opt('workers', String(cpus().length))));
  const bundle = loadBundle();
  const traits = [...bundle.traits.values()]
    .filter((t) => phaseLive(t.phase) && (t.kind === 'creation' || t.kind === 'evolving') && (!only.length || only.includes(t.id)));
  const { jobs, sign } = plan(bundle, { n, days, seed, crag, traits });

  mkdirSync(out, { recursive: true });
  const file = `${out}/recost-${crag}-${seed}.jsonl`;
  const done = new Map<string, Lite>();
  // Careers are keyed by base index and length, so a later run with more bases reuses the earlier ones, and each
  // carries a hash of its configuration: a base is drawn within the trait budget, so a cost change can draw another
  // build for the same index, and its old careers must not pair with the new one's.
  const tag = `${days}`;
  const hashOf = new Map(jobs.map((j) => [j.key, cyrb53(JSON.stringify(j.cfg))]));
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const x = JSON.parse(line) as { key: string; run: string; h?: number; lite: Lite };
      if (x.run === tag && x.h === hashOf.get(x.key)) done.set(x.key, x.lite);
    }
  }
  const todo = jobs.filter((j) => !done.has(j.key));
  process.stderr.write(`${jobs.length} careers (${done.size} done), ${traits.length} traits, ${n} bases × ${days} days on ${workers} workers\n`);
  const t0 = performance.now();
  // Every career of one base goes to the same worker, so the variants reuse the routes the base built.
  const baseOf = (j: Job) => Number(j.key.split('|')[0]);
  await Promise.all(Array.from({ length: Math.min(workers, todo.length) }, (_, w) => new Promise<void>((resolve, reject) => {
    const mine = todo.filter((j) => baseOf(j) % workers === w);
    const child = fork(SELF, [], { execArgv: SELF.endsWith('.ts') ? ['--import', 'tsx'] : [], env: { ...process.env, CWT_RECOST_WORKER: '1' } });
    child.on('message', (m: { done?: boolean; key?: string; lite?: Lite }) => {
      if (m.done) { child.kill(); resolve(); return; }
      done.set(m.key!, m.lite!);
      appendFileSync(file, JSON.stringify({ key: m.key, run: tag, h: hashOf.get(m.key!), lite: m.lite }) + '\n');
      if (done.size % 50 === 0) process.stderr.write(`${done.size}/${jobs.length} in ${((performance.now() - t0) / 60000).toFixed(1)} min\n`);
    });
    child.on('error', reject);
    child.on('exit', (code) => { if (code) reject(new Error(`worker exited with ${code}`)); });
    child.send({ jobs: mine });
  })));
  const report = analyse(bundle, traits, done, sign, { n, days, seed, crag, mins: (performance.now() - t0) / 60000, out });
  writeFileSync(`${out}/recost-${crag}-${seed}.md`, report + '\n');
  console.log(report);
}

interface Row extends Verdict { t: Trait; n: number; d: number; check: number; checkSe: number; yard: number; dPb: number; dTicks: number }

function analyse(bundle: DataBundle, traits: Trait[], done: Map<string, Lite>, sign: Map<string, number>, m: { n: number; days: number; seed: string; crag: string; mins: number; out: string }): string {
  const L: string[] = [];
  const bases = Array.from({ length: m.n }, (_, i) => i).filter((i) => done.has(`${i}|base`));
  const delta = (i: number, k: string) => { const v = done.get(`${i}|${k}`); return v ? v.score - done.get(`${i}|base`)!.score : null; };
  const attrs = PHYSICAL_ATTRS as readonly AttrId[];
  // 19 §4's yardstick: +5 on one physical attribute, the mean over the twelve, per base.
  const yard = bases.map((i) => mean(attrs.flatMap((a) => { const x = delta(i, `a:${a}`); return x === null ? [] : [x]; })));
  const Y = mean(yard);
  const seY = sd(yard) / Math.sqrt(Math.max(1, yard.length));
  const perAttr = attrs.map((a) => ({ a, d: mean(bases.flatMap((i) => { const x = delta(i, `a:${a}`); return x === null ? [] : [x]; })) }));
  // The check (docs/26 §10.3): each variant against its base's diverged median, so one lucky base career moves no trait.
  const checkOf = new Map(bases.map((i) => [i, divergedDelta(done.get(`${i}|base`)!, [...done].filter(([k]) => k.startsWith(`${i}|`) && k !== `${i}|base`).map(([, v]) => v))]));
  const raw = traits.map((t) => {
    const d: number[] = [], d2: number[] = [], pb: number[] = [], tk: number[] = [];
    for (const i of bases) {
      const k = `${i}|t:${t.id}`;
      const v = done.get(k), b = done.get(`${i}|base`)!;
      if (!v) continue;
      const s = sign.get(k)!;
      d.push(s * (v.score - b.score));
      d2.push(s * checkOf.get(i)!(v));
      pb.push(s * (v.hardest - b.hardest));
      tk.push(s * (v.ticks - b.ticks));
    }
    return { t, d, d2, pb, tk };
  }).filter((x) => x.d.length > 0);
  const priced = raw.filter((x) => x.t.category !== 'quirk' && x.t.cost !== 0 && x.d.length >= 4);
  const slope = priceSlope(priced.map((x) => ({ cost: x.t.cost, d: x.d })));
  const slope2 = priceSlope(priced.map((x) => ({ cost: x.t.cost, d: x.d2 })));
  L.push(`# Trait re-costing · ${m.crag} · seed ${m.seed}`);
  L.push('');
  L.push(`${bases.length} base builds × ${m.days} days, paired careers (docs/19 §4); ${done.size} careers, ${m.mins.toFixed(0)} min this session.`);
  L.push('');
  L.push(`**Scale:** ${slope.toFixed(2)} score points per cost point at today's prices (least squares over ${priced.length} priced traits); ${slope2.toFixed(2)} for the check against each base's diverged median. 19 §4's yardstick (+5 on one physical attribute, the mean of twelve) reads ${Y.toFixed(2)} ± ${seY.toFixed(2)} points: ${perAttr.map((x) => `${x.a} ${x.d.toFixed(1)}`).join(', ')}.`);
  L.push('');
  const rows: Row[] = raw.map(({ t, d, d2, pb, tk }) => ({
    t, n: d.length, d: mean(d), check: mean(d2) / slope2, checkSe: sd(d2) / Math.sqrt(Math.max(1, d2.length)) / Math.abs(slope2),
    yard: Y > 0 ? mean(d) / Y : NaN, dPb: mean(pb), dTicks: mean(tk), ...verdict(t, d, slope, { d: d2, slope: slope2 }),
  })).sort((a, b) => Math.abs(b.impact - b.t.cost) - Math.abs(a.impact - a.t.cost));
  L.push('| Trait | cost | impact ± se | check ± se | 19 §4 cost | re-cost | flag | Δ score | yardstick units | Δ PB (DI) | Δ ticks | pairs |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    L.push(`| ${r.t.id} | ${r.t.cost} | ${r.impact.toFixed(1)} ± ${r.se.toFixed(1)} | ${r.check.toFixed(1)} ± ${r.checkSe.toFixed(1)} | ${r.prop} | ${r.clear ? 'yes' : ''} | ${r.flag} | ${r.d.toFixed(1)} | ${Number.isNaN(r.yard) ? '—' : r.yard.toFixed(1)} | ${r.dPb.toFixed(2)} | ${r.dTicks.toFixed(0)} | ${r.n} |`);
  }
  L.push('');
  const clearRows = rows.filter((r) => r.clear);
  L.push(`**Diff (19 §4 step 5):** ${clearRows.length ? clearRows.map((r) => `${r.t.id} ${r.t.cost} → ${r.prop}`).join(', ') : 'no cost moves clear of the noise'}.`);
  L.push('');
  const design = rows.filter((r) => r.flag);
  L.push(`**For design (19 §4 step 2: strengthen or remove):** ${design.length ? design.map((r) => `${r.t.id} (${r.flag}, ${r.impact.toFixed(1)} ± ${r.se.toFixed(1)} at cost ${r.t.cost})`).join(', ') : 'none'}.`);
  L.push('');
  const rates = pickRates(bundle, new Map(rows.map((r) => [r.t.id, r.impact])));
  const hot = [...rates].sort((a, b) => b[1] - a[1]).filter(([, r]) => r > 0.6).map(([id, r]) => `${id} ${(100 * r).toFixed(0)}%`);
  const live = [...bundle.backgrounds.values()].filter((b) => phaseLive(b.phase)).length;
  L.push(`**Pick rates (19 §4 step 3)**, one greedy build per live background (${live}), valuing traits at their measured impact: picked by more than 60%: ${hot.join(', ') || 'none'}; picked at all: ${rates.size} of ${rows.length}.`);
  L.push('');
  const caps = capsOver(bundle);
  L.push(`**Caps (19 §4 step 4):** ${caps.length ? `over +30%: ${caps.map((c) => `${c.key} +${(100 * c.total).toFixed(0)}%`).join(', ')}.` : 'no compatible set of traits passes +30% on any hold type or move class.'}`);
  writeFileSync(`${m.out}/recost-${m.crag}-${m.seed}.json`, JSON.stringify({ slope, slope2, yardstick: { Y, seY, perAttr }, rows: rows.map((r) => ({ ...r, t: r.t.id, cost: r.t.cost })) }, null, 1) + '\n');
  return L.join('\n');
}
