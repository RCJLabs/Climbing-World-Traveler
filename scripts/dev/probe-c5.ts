// C5 on 200 problems within each style's ceiling, with each failure traced to a hold and a move.
// usage: npx tsx scripts/dev/probe-c5.ts [n=200] [--quiet] [--height] [--salt=k | --calibrate]   (k picks an independent sample)
import { loadBundle } from '../../src/data/bundle';
import { applyMove, prepareMove, type Prepared } from '../../src/sim/engine';
import { evWalk, gradeRoute, referenceAthlete, startState } from '../../src/sim/grade';
import type { Evaluation } from '../../src/sim/resolve';
import { stream } from '../../src/sim/rng';
import { generateBoulder } from '../../src/sim/routes';
import type { Route } from '../../src/sim/types';
import { bodyPoints, freeState, judgeOption, routeGeom, sOfY, yOfS } from '../../src/sim/wall';

const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
const n = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 200);
const quiet = process.argv.includes('--quiet');
/** Jitter along the rock (x, s), as the calibrator does; --height jitters (x, height), the pre-p1a-8 test. */
const surface = !process.argv.includes('--height');
const salt = process.argv.find((a) => a.startsWith('--salt='))?.slice(7) ?? '';

/** --calibrate takes the `pnpm calibrate --full` C5 sample exactly (slow: it generates the 9,600-problem C1 set). */
const asCalibrate = process.argv.includes('--calibrate');
const all: Route[] = [];
for (const profile of bundle.profiles.values()) {
  const sector = crag.sectors.find((s) => s.style_profiles.includes(profile.id))!;
  for (let di = 9; di <= Math.min(26, profile.di_max ?? 26); di++) for (let k = 0; k < (asCalibrate ? 200 : 10); k++) {
    const seed = asCalibrate ? `cal:${profile.id}:${di}:${k}` : `c5n${salt}:${profile.id}:${di}:${k}`;
    try { all.push(generateBoulder({ crag, sector, profile, di_target: di, seed, bundle })); } catch { /* skip */ }
  }
}
// Evenly spaced over every profile and DI (taking the first n would drop the roof's upper grades).
const set = asCalibrate
  ? all.filter((_, i) => i % Math.max(1, Math.floor(all.length / n)) === 1).slice(0, n)
  : Array.from({ length: Math.min(n, all.length) }, (_, j) => all[Math.floor((j * all.length) / Math.min(n, all.length))]!);

/** The C5 jitter, drawn in the calibrator's order so the same problems fail. */
const jitterOf = (r: Route): { dx: number; dy: number }[] => {
  const rng = stream('c5', r.id);
  return r.holds.map(() => ({ dx: rng.normal(0, 0.02), dy: rng.normal(0, 0.02) }));
};
const apply = (r: Route, jit: { dx: number; dy: number }[], only?: number): Route => {
  const j = structuredClone(r);
  j.holds.forEach((h, i) => {
    if (only !== undefined && i !== only) return;
    h.x += jit[i]!.dx;
    h.y = surface ? yOfS(r.wall, Math.max(sOfY(r.wall, 0.05), sOfY(r.wall, h.y) + jit[i]!.dy)) : Math.max(0.05, h.y + jit[i]!.dy);
  });
  return j;
};
interface Step { cls: string; r: number; pq: number; posture: string; parts: Evaluation['parts']; margin: number; p: number; hold: string; limb: string }
const trace = (r: Route, di: number): { steps: Step[]; p: number; ungradeable: boolean } => {
  const steps: Step[] = [];
  const w = evWalk(routeGeom(r), referenceAthlete(di), {
    trace: (_i, c: Prepared, e, p) => steps.push({ cls: c.cls, r: c.spec.r, pq: c.spec.pq, posture: c.spec.posture, parts: e.parts, margin: e.margin, p, hold: c.option.hold.id, limb: c.option.limb }),
  });
  return { steps, p: w.p_send, ungradeable: w.ungradeable };
};

/** The reach verdict on the first step with no legal class. */
const whyIllegal = (r: Route, di: number, step: number): string => {
  const geom = routeGeom(r);
  const ath = referenceAthlete(di);
  let st = startState(geom, ath);
  for (let i = 0; i < step; i++) {
    const s = r.beta_line[i]!;
    const c = prepareMove(geom, ath, st, s.limb, s.hold, s.class) ?? prepareMove(geom, ath, st, s.limb, s.hold);
    if (!c) return `step ${i} first`;
    st = applyMove(geom, ath, st, c.option.limb, c.option.hold.id, c.cls);
  }
  const s = r.beta_line[step]!;
  const o = judgeOption(geom, ath, st, bodyPoints(geom, ath, freeState(st, s.limb)), s.limb, geom.holds.get(s.hold)!);
  return `${o.verdict} (${o.reason || 'no class'}) r ${(o.d / o.R).toFixed(2)} wants ${s.class}`;
};

const bands: Record<string, [number, number]> = {};
const bandOf = (r: Route): string => `${r.style_tags.includes('roof') ? 'roof' : r.style_tags.includes('slab') ? 'slab' : 'other'} ${r.di_graded < 14 ? '<14' : r.di_graded < 20 ? '14-20' : '20+'}`;
let stable = 0;
const causes: Record<string, number> = {};
const rows: string[] = [];
for (const r of set) {
  const jit = jitterOf(r);
  const g = gradeRoute(apply(r, jit));
  const okC5 = g.di !== null && Math.abs(g.di - r.di_graded) <= 0.5;
  const bd = (bands[bandOf(r)] ??= [0, 0]);
  bd[1]++;
  if (okC5) { bd[0]++; stable++; continue; }

  // Which hold's jitter moves the grade most on its own.
  let top = -1;
  let topD = 0;
  for (let i = 0; i < r.holds.length; i++) {
    const gi = gradeRoute(apply(r, jit, i));
    const d = gi.di === null ? 99 : gi.di - r.di_graded;
    if (Math.abs(d) > Math.abs(topD)) { top = i; topD = d; }
  }
  // Which step's send probability changes most, at the original grade.
  const a = trace(r, r.di_graded);
  const b = trace(apply(r, jit), r.di_graded);
  let k = -1;
  let kd = 0;
  for (let i = 0; i < Math.max(a.steps.length, b.steps.length); i++) {
    if (b.ungradeable && i === b.steps.length) { k = i; kd = -99; break; }
    const pa = a.steps[i]?.p ?? 1;
    const pb = b.steps[i]?.p ?? 1e-6;
    const d = Math.log(Math.max(1e-6, pb)) - Math.log(Math.max(1e-6, pa));
    if (Math.abs(d) > Math.abs(kd)) { k = i; kd = d; }
  }
  const sa = a.steps[k];
  const sb = b.steps[k];
  let cause = 'other';
  const changed: string[] = [];
  if (b.ungradeable && !sb) cause = `illegal: ${whyIllegal(apply(r, jit), r.di_graded, k)}`;
  else if (sa && sb) {
    if (sa.cls !== sb.cls) cause = `class ${sa.cls}→${sb.cls}`;
    for (const key of Object.keys(sa.parts) as (keyof Step['parts'])[]) {
      const d = sb.parts[key] - sa.parts[key];
      if (Math.abs(d) >= 0.05) changed.push(`${key} ${d >= 0 ? '+' : ''}${d.toFixed(2)}`);
    }
    if (Math.abs(sb.pq - sa.pq) >= 0.02) changed.push(`pq ${sa.pq.toFixed(2)}→${sb.pq.toFixed(2)}`);
    if (sa.posture !== sb.posture) changed.push(`posture ${sa.posture}→${sb.posture}`);
    if (cause === 'other') {
      const big = Object.keys(sa.parts).map((key) => [key, Math.abs(sb.parts[key as keyof Step['parts']] - sa.parts[key as keyof Step['parts']])] as const).sort((x, y) => y[1] - x[1])[0]!;
      const dpq = Math.abs(sb.pq - sa.pq);
      cause = sa.posture !== sb.posture ? 'posture' : dpq * 10 > big[1] ? 'position quality' : big[1] >= 0.05 ? `${big[0]}` : 'state carried forward';
    }
  }
  const flip = a.steps.findIndex((x, i) => b.steps[i] && b.steps[i]!.posture !== x.posture);
  if (flip >= 0 && flip <= k) changed.push(`first posture flip at step ${flip}: ${a.steps[flip]!.posture}→${b.steps[flip]!.posture}`);
  const head = cause.split(' ')[0]!;
  causes[head] = (causes[head] ?? 0) + 1;
  const prof = r.style_tags.join('/');
  rows.push(`${r.id.slice(0, 18).padEnd(18)} ${prof.slice(0, 22).padEnd(22)} ${r.di_graded.toFixed(2)} → ${g.di === null ? 'null ' : g.di.toFixed(2)} | hold ${r.holds[top]?.id ?? '-'} alone ${topD === 99 ? 'null' : (topD >= 0 ? '+' : '') + topD.toFixed(2)} | step ${k} ${sa ? `${sa.limb} ${sa.cls} r ${sa.r.toFixed(2)}` : ''}${sb ? ` → ${sb.cls} r ${sb.r.toFixed(2)}` : ' → illegal'} Δln p ${kd.toFixed(2)} | ${cause}${changed.length ? ' [' + changed.join(', ') + ']' : ''}`);
}
console.log(`C5 ${stable}/${set.length} = ${(100 * stable / set.length).toFixed(1)}%`);
console.log('bands', Object.entries(bands).sort().map(([b, [a, t]]) => `${b} ${t - a}/${t}`).join(' · '));
console.log('causes', Object.entries(causes).sort((x, y) => y[1] - x[1]).map(([c, m]) => `${c} ${m}`).join(' · '));
if (!quiet) for (const row of rows) console.log(row);
