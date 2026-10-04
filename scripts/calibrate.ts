// Grade-engine calibration (docs/05c §4 C1–C10, 19 §5; the sport checks in docs/26 §5). Every live crag in the manifest
// runs its own gates, C1–C4 per discipline and C7 (src/harness/calibration.ts, 27 M1); then the checks across crags and
// builds run on the reference crags: C5 and C6 on the boulder one's C1 problems, C9 there, C10 between both.
// `pnpm calibrate --quick` is the CI gate; plain `pnpm calibrate` is the fuller sweep; `--full` uses the doc's sample
// sizes (slow). `--dir <folder>` reads another data folder; `--crag <id>` runs that crag's gates alone.
import { loadBundle } from '../src/data/bundle';
import { CAL_SIZES, cragGates, spaced, steepestSport, type CalMode, type Check, type Sample } from '../src/harness/calibration';
import { referenceCrags } from '../src/harness/career';
import { evWalk, gradeRoute } from '../src/sim/grade';
import { mean, spearman, tiltedBuilds, workedExampleBuilds } from '../src/harness/sim';
import { phaseLive } from '../src/sim/character';
import { sectorDiscipline } from '../src/sim/discipline';
import { stream } from '../src/sim/rng';
import { generateSport, routeFromSeed, routeSeed } from '../src/sim/routes';
import type { Route } from '../src/sim/types';
import { routeGeom, sOfY, yOfS } from '../src/sim/wall';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const mode: CalMode = argv.includes('--full') ? 'full' : argv.includes('--quick') ? 'quick' : 'normal';
const S = CAL_SIZES[mode];
const c1min = mode === 'quick' ? 0.85 : 0.9;

const bundle = loadBundle(true, opt('--dir'));
const only = opt('--crag');
const lines: string[] = [];
const results: Check[] = [];
const log = (s: string) => { lines.push(s); console.log(s); };
const show = (c: Check) => {
  results.push(c);
  log(`${c.pass ? 'PASS' : c.gate ? 'FAIL' : 'WARN'} ${c.crag ? `[${c.crag}] ` : ''}${c.id}: ${c.text}`);
  for (const d of c.detail) log(`    ${d}`);
};
const record = (id: string, pass: boolean, text: string, gate = true, detail: string[] = []) => show({ id, pass, gate, text, detail });
const t0 = performance.now();

// ---------------------------------------------------------------- each crag's own gates: C1–C4 per discipline, C7
const crags = only ? [only] : [...bundle.hashes.keys()].filter((id) => phaseLive(bundle.crags.get(id)!.phase));
const samples = new Map<string, ReturnType<typeof cragGates>['samples']>();
for (const id of crags) {
  const g = cragGates(bundle, id, S, c1min);
  samples.set(id, g.samples);
  for (const c of g.checks) show(c);
}

// ---------------------------------------------------------------- across crags and builds, on the reference crags
const ref = referenceCrags(bundle);
const boulderRef = ref.boulder ? bundle.crags.get(ref.boulder)! : null;
const sportRef = ref.sport ? bundle.crags.get(ref.sport)! : null;
if (!only && boulderRef) {
  const ok = (samples.get(boulderRef.id)?.boulder ?? []).filter((x): x is Sample & { route: Route } => x.route !== null);

  // C6 style neutrality: no hold family grades systematically off target.
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
  record('C6 style neutrality', spread <= 0.6, `${boulderRef.name} problems by dominant hold family: ${famMeans.map(([f, m]) => `${f} ${m.toFixed(2)}`).join(', ')} (spread ${spread.toFixed(2)} ≤ 0.6)`, false);

  // C5 geometric stability: 2 cm of jitter along the rock moves a grade by half a DI at most.
  let stable = 0;
  const c5set = spaced(ok, S.c5, 1);
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

  // C9 build divergence (05b §14.1 builds): two builds find different problems hard, not only one build stronger.
  const { A, B } = workedExampleBuilds();
  const pA: number[] = [];
  const pB: number[] = [];
  const sectors = boulderRef.sectors.filter((s) => sectorDiscipline(s, bundle) === 'boulder');
  for (let k = 0; k < S.c9; k++) {
    const sector = sectors[k % sectors.length]!;
    const g = routeGeom(routeFromSeed(routeSeed(boulderRef.id, sector.id, 0, 7000 + k, 16), bundle));
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
}

// C10, the P1b exit criterion (01 §4): a power build and an endurance build of the same attribute points swap places in
// send probability between the boulder reference crag's problems (Font) and 35 m pitches of the same DI on the sport
// reference crag's steepest style (the Kalymnos tufas).
const tufa = sportRef ? steepestSport(sportRef.id, bundle) : undefined;
if (!only && boulderRef && sportRef && tufa) {
  const C10_DI = 18;
  const { power, endurance } = tiltedBuilds(C10_DI);
  const fontP: number[] = [], fontE: number[] = [], kalP: number[] = [], kalE: number[] = [];
  const bs = boulderRef.sectors.filter((s) => sectorDiscipline(s, bundle) === 'boulder');
  const ss = sportRef.sectors.filter((s) => sectorDiscipline(s, bundle) === 'sport');
  for (let k = 0; k < S.c10; k++) {
    const fs = bs[k % bs.length]!;
    const fg = routeGeom(routeFromSeed(routeSeed(boulderRef.id, fs.id, 0, 9100 + k, C10_DI), bundle));
    fontP.push(evWalk(fg, power).p_send);
    fontE.push(evWalk(fg, endurance).p_send);
    const ks = ss[k % ss.length]!;
    const kg = routeGeom(generateSport({ crag: sportRef, sector: ks, profile: tufa, di_target: C10_DI, seed: `c10:${ks.id}:${k}`, bundle, length_m: 35 }));
    kalP.push(evWalk(kg, power).p_send);
    kalE.push(evWalk(kg, endurance).p_send);
  }
  const [fp, fe, kp, ke] = [mean(fontP), mean(fontE), mean(kalP), mean(kalE)];
  record('C10 P1b exit: builds swap', fp - fe >= 0.1 && ke - kp >= 0.1,
    `DI ${C10_DI}, ${S.c10} each: ${boulderRef.name} problems power ${fp.toFixed(2)} vs endurance ${fe.toFixed(2)}; 35 m ${sportRef.name} pitches (${tufa.id}) power ${kp.toFixed(2)} vs endurance ${ke.toFixed(2)} (each gap ≥ 0.10, opposite ways)`);
}

const failedGates = results.filter((r) => !r.pass && r.gate);
log(`\n${mode} calibration of ${crags.join(', ')} in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${results.filter((r) => r.pass).length}/${results.length} pass; gating failures ${failedGates.length}`);
if (argv.includes('--out')) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const dir = opt('--out') ?? 'reports';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/calibration-${mode}.md`, `# Calibration (${mode})\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
}
if (failedGates.length) process.exit(1);
