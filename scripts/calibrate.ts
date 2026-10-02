// Grade-engine calibration (docs/05c §4 C1–C9, 19 §5). `pnpm calibrate --quick` is the CI gate; plain
// `pnpm calibrate` is the fuller sweep; `--full` uses the doc's sample sizes (slow).
import { loadBundle } from '../src/data/bundle';
import { diceAttempt, mean, onlyType, spearman, syntheticRun, workedExampleBuilds, type SkillProfile, type Timing } from '../src/harness/sim';
import { evWalk, gradeRoute, referenceAthlete, sendCurve, X_SEND } from '../src/sim/grade';
import { stream } from '../src/sim/rng';
import { generateBoulder, routeFromSeed, routeSeed } from '../src/sim/routes';
import type { Route } from '../src/sim/types';
import { routeGeom, sOfY, yOfS } from '../src/sim/wall';

const argv = process.argv.slice(2);
const mode = argv.includes('--full') ? 'full' : argv.includes('--quick') ? 'quick' : 'normal';
const S = {
  quick: { c1n: 4, c1step: 2, c2routes: 3, c2att: 120, c3: 6, c5: 10, c8routes: 4, c8att: 60, c9: 20 },
  normal: { c1n: 20, c1step: 1, c2routes: 8, c2att: 300, c3: 20, c5: 40, c8routes: 10, c8att: 150, c9: 60 },
  full: { c1n: 200, c1step: 1, c2routes: 50, c2att: 500, c3: 100, c5: 200, c8routes: 30, c8att: 300, c9: 100 },
}[mode];

const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
const lines: string[] = [];
const results: { id: string; pass: boolean; gate: boolean; text: string }[] = [];
const log = (s: string) => { lines.push(s); console.log(s); };
const record = (id: string, pass: boolean, text: string, gate = true) => { results.push({ id, pass, gate, text }); log(`${pass ? 'PASS' : gate ? 'FAIL' : 'WARN'} ${id}: ${text}`); };
const t0 = performance.now();

// ---------------------------------------------------------------- C1 generator accuracy, C6 style neutrality
const c1: { route: Route; target: number; profile: string }[] = [];
for (const profile of bundle.profiles.values()) {
  const sector = crag.sectors.find((s) => s.style_profiles.includes(profile.id))!;
  // Each style up to the hardest DI it can be built to (06 §2.1); sectors pick another profile above it.
  for (let di = 9; di <= Math.min(26, profile.di_max ?? 26); di += S.c1step) {
    for (let k = 0; k < S.c1n; k++) {
      try {
        c1.push({ route: generateBoulder({ crag, sector, profile, di_target: di, seed: `cal:${profile.id}:${di}:${k}`, bundle }), target: di, profile: profile.id });
      } catch { c1.push({ route: null as unknown as Route, target: di, profile: profile.id }); }
    }
  }
}
const ok = c1.filter((x) => x.route);
const gaps = ok.map((x) => x.route.di_graded - x.target);
const w1 = gaps.filter((g) => Math.abs(g) <= 1).length / c1.length;
const w05 = gaps.filter((g) => Math.abs(g) <= 0.5).length / c1.length;
const bias = mean(gaps);
const c1min = mode === 'quick' ? 0.85 : 0.9;
record('C1 generator accuracy', w1 >= c1min && w05 >= 0.6 && Math.abs(bias) <= 0.3,
  `${c1.length} problems, ${(100 * w1).toFixed(1)}% within ±1 (≥ ${c1min * 100}%), ${(100 * w05).toFixed(1)}% within ±0.5 (≥ 60%), bias ${bias.toFixed(2)}, ${c1.length - ok.length} failed`);
const byProfile = new Map<string, number[]>();
for (const x of ok) byProfile.set(x.profile, [...(byProfile.get(x.profile) ?? []), x.route.di_graded - x.target]);
log(`    by profile: ${[...byProfile].map(([p, g]) => `${p} ${(100 * g.filter((v) => Math.abs(v) <= 1).length / g.length).toFixed(0)}% bias ${mean(g).toFixed(2)}`).join(' · ')}`);

const family = (r: Route): string => {
  const counts = new Map<string, number>();
  for (const s of r.beta_line) {
    if (!s.limb.endsWith('H') || s.class === 'mantle') continue;
    const t = r.holds.find((h) => h.id === s.hold)!.type;
    const f = t.startsWith('pocket') ? 'pocket' : t === 'edge' ? 'crimp' : t;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
};
const byFamily = new Map<string, number[]>();
for (const x of ok) byFamily.set(family(x.route), [...(byFamily.get(family(x.route)) ?? []), x.route.di_graded - x.target]);
const famMeans = [...byFamily].filter(([, g]) => g.length >= 5).map(([f, g]) => [f, mean(g)] as const);
const spread = famMeans.length ? Math.max(...famMeans.map((f) => f[1])) - Math.min(...famMeans.map((f) => f[1])) : 0;
record('C6 style neutrality', spread <= 0.6, `bias by dominant hold family: ${famMeans.map(([f, m]) => `${f} ${m.toFixed(2)}`).join(', ')} (spread ${spread.toFixed(2)} ≤ 0.6)`, false);

// ---------------------------------------------------------------- C3 monotonicity, C4 determinism
let mono = 0;
let checked = 0;
for (const x of ok.filter((_, i) => i % Math.max(1, Math.floor(ok.length / S.c3)) === 0).slice(0, S.c3)) {
  const curve = sendCurve(x.route, 8, 30, 0.5);
  checked++;
  let fine = true;
  let crossings = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i]![1] < curve[i - 1]![1] - 1e-9) fine = false;
    if ((curve[i - 1]![1] < X_SEND) !== (curve[i]![1] < X_SEND)) crossings++;
  }
  if (fine && crossings === 1) mono++;
}
record('C3 monotonicity', mono === checked, `${mono}/${checked} send curves non-decreasing with one crossing`);
let same = 0;
const seeds = Array.from({ length: 6 }, (_, i) => routeSeed('fontainebleau', crag.sectors[i % crag.sectors.length]!.id, 3, 900 + i, 10 + 2 * i));
for (const s of seeds) if (JSON.stringify(routeFromSeed(s, bundle)) === JSON.stringify(routeFromSeed(s, bundle)) && gradeRoute(routeFromSeed(s, bundle)).di === gradeRoute(routeFromSeed(s, bundle)).di) same++;
record('C4 determinism', same === seeds.length, `${same}/${seeds.length} seeds regenerate and grade identically`);

// ---------------------------------------------------------------- C5 geometric stability
let stable = 0;
const c5set = ok.filter((_, i) => i % Math.max(1, Math.floor(ok.length / S.c5)) === 1).slice(0, S.c5);
for (const x of c5set) {
  const rng = stream('c5', x.route.id);
  const j = structuredClone(x.route);
  // Along the rock, not in height: 2 cm of height is about 6 cm of rock on a 160° roof (05c §4).
  const s0 = sOfY(j.wall, 0.05);
  for (const h of j.holds) { h.x += rng.normal(0, 0.02); h.y = yOfS(j.wall, Math.max(s0, sOfY(j.wall, h.y) + rng.normal(0, 0.02))); }
  const g = gradeRoute(j);
  if (g.di !== null && Math.abs(g.di - x.route.di_graded) <= 0.5) stable++;
}
record('C5 geometric stability', stable / Math.max(1, c5set.length) >= 0.95, `${stable}/${c5set.length} within ±0.5 DI after 2 cm jitter along the rock (≥ 95%)`, false);

// ---------------------------------------------------------------- C7 signatures
const sig = [...bundle.signatures.values()].map((r) => ({ r, g: gradeRoute(r).di }));
record('C7 signature problems', sig.every((s) => s.g !== null && Math.abs(s.g - s.r.di_target) <= 1),
  sig.map((s) => `${s.r.name} ${s.g?.toFixed(2)} (canon ${s.r.di_target})`).join(', '));

// ---------------------------------------------------------------- C2 reference self-consistency (dice through the play loop)
const c2rows: string[] = [];
const c2rates: number[] = [];
for (const n of [12, 16, 20]) {
  const near = [...ok].sort((a, b) => Math.abs(a.route.di_graded - n) - Math.abs(b.route.di_graded - n)).slice(0, S.c2routes);
  for (const x of near) {
    // The Reference Climber at the problem's own grade: by definition it should send 35% of the time.
    const base = syntheticRun(referenceAthlete(x.route.di_graded), `c2:${x.route.id}`, bundle);
    let sends = 0;
    for (let k = 0; k < S.c2att; k++) if (diceAttempt(base, x.route, k, bundle).outcome === 'sent') sends++;
    const ev = evWalk(routeGeom(x.route), referenceAthlete(x.route.di_graded)).p_send;
    const rate = sends / S.c2att;
    c2rates.push(rate);
    c2rows.push(`reference ${x.route.di_graded.toFixed(2)} on its own grade: dice ${(100 * rate).toFixed(0)}% vs EV ${(100 * ev).toFixed(0)}%`);
  }
}
const c2mean = mean(c2rates);
record('C2 reference self-consistency', Math.abs(c2mean - X_SEND) <= 0.05, `mean dice send rate ${(100 * c2mean).toFixed(1)}% over ${c2rates.length} problems (target 35 ± 5)`, false);
for (const r of c2rows) log(`    ${r}`);

// ---------------------------------------------------------------- C8 skill share per move type (simplified: send-rate gaps)
// Each move type is measured alone (its skill varied, the others on Auto) on the problems where it matters, and all
// three together on the dynamic problems, where the total is largest (docs/19 §3, docs/23 §5 step 6). (tune)
const near16 = (x: (typeof ok)[number]) => Math.abs(x.route.di_graded - 16) <= 1.5;
const dynShare = (x: (typeof ok)[number]) => x.route.components?.dynamic_share ?? 0;
const c8sets = {
  dynamic: ok.filter((x) => near16(x) && dynShare(x) > 0.15).slice(0, S.c8routes).map((x) => x.route),
  'no-dyno': ok.filter((x) => near16(x) && dynShare(x) === 0 && x.profile !== 'font_sloper_slab').slice(0, S.c8routes).map((x) => x.route),
  slab: ok.filter((x) => near16(x) && dynShare(x) === 0 && x.profile === 'font_sloper_slab').slice(0, S.c8routes).map((x) => x.route),
};
/** Per-type limits on expert − novice, and the total's. The total is the old C8 bar; the types share it. (tune) */
const C8_LIMITS = { dyno: 0.07, reach: 0.03, balance: 0.03, all: 0.08 };
const c8rows: { id: keyof typeof C8_LIMITS; set: keyof typeof c8sets; skill: (t: Timing) => Timing | SkillProfile }[] = [
  { id: 'dyno', set: 'dynamic', skill: (t) => onlyType('swing', t) },
  { id: 'reach', set: 'no-dyno', skill: (t) => onlyType('reach', t) },
  { id: 'balance', set: 'slab', skill: (t) => onlyType('balance', t) },
  { id: 'all', set: 'dynamic', skill: (t) => t },
];
const autoRate = new Map<string, number>();
const c8rate = (set: keyof typeof c8sets, t: Timing, skill: Timing | SkillProfile): number => {
  if (t === 'auto' && autoRate.has(set)) return autoRate.get(set)!;
  const rates = c8sets[set].map((route) => {
    const base = syntheticRun(referenceAthlete(route.di_graded), `c8:${route.id}`, bundle);
    let sends = 0;
    for (let k = 0; k < S.c8att; k++) if (diceAttempt(base, route, k, bundle, skill, stream('c8tap', t, route.id, k)).outcome === 'sent') sends++;
    return sends / S.c8att;
  });
  const r = mean(rates);
  if (t === 'auto') autoRate.set(set, r);
  return r;
};
for (const row of c8rows) {
  const r = Object.fromEntries((['auto', 'novice', 'average', 'expert'] as Timing[]).map((t) => [t, c8rate(row.set, t, row.skill(t))])) as Record<Timing, number>;
  const gap = r.expert - r.novice;
  const autoVsAvg = r.auto - r.average;
  const n = c8sets[row.set].length;
  record(`C8 skill share · ${row.id}`, n > 0 && gap <= C8_LIMITS[row.id] && Math.abs(autoVsAvg) <= 0.02 + 0.03,
    `${n} ${row.set} problems: auto ${(100 * r.auto).toFixed(0)}%, novice ${(100 * r.novice).toFixed(0)}%, average ${(100 * r.average).toFixed(0)}%, expert ${(100 * r.expert).toFixed(0)}%; expert − novice ${(100 * gap).toFixed(1)} pts (≤ ${Math.round(100 * C8_LIMITS[row.id])})`, false);
}

// ---------------------------------------------------------------- C9 build divergence (05b §14.1 builds)
const { A, B } = workedExampleBuilds();
const pA: number[] = [];
const pB: number[] = [];
for (let k = 0; k < S.c9; k++) {
  const sector = crag.sectors[k % crag.sectors.length]!;
  const r = routeFromSeed(routeSeed('fontainebleau', sector.id, 0, 7000 + k, 16), bundle);
  const g = routeGeom(r);
  pA.push(evWalk(g, A).p_send);
  pB.push(evWalk(g, B).p_send);
}
// The gap says outcomes differ; the rank correlation says whether they differ by style (each build finds different
// problems hard) or only by strength (same order, one build higher). A stronger copy of one build scores about 0.9.
const gap9 = mean(pA.map((p, i) => Math.abs(p - pB[i]!)));
const rho9 = spearman(pA, pB);
const split = (x: number[], y: number[]) => x.filter((p, i) => p >= 0.2 && y[i]! < 0.05).length;
record('C9 build divergence', gap9 >= 0.3 && rho9 <= 0.5,
  `${pA.length} DI-16 problems: mean |P_send(A) − P_send(B)| ${gap9.toFixed(2)} (≥ 0.30); rank correlation ${rho9.toFixed(2)} (≤ 0.50); only A sends ${split(pA, pB)}, only B ${split(pB, pA)}`, false);

const failedGates = results.filter((r) => !r.pass && r.gate);
log(`\n${mode} calibration in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${results.filter((r) => r.pass).length}/${results.length} pass; gating failures ${failedGates.length}`);
if (argv.includes('--out')) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const dir = argv[argv.indexOf('--out') + 1] ?? 'reports';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/calibration-${mode}.md`, `# Calibration (${mode})\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
}
if (failedGates.length) process.exit(1);
