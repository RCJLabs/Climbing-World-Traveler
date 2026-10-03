// Dev: contact sheets of the cartoon wall (docs/25 §10), for checking the blocks, the knees and every move by eye.
// Real simulated attempts (the same loop the game runs) on the signature problems and on generated ones of each shape.
//   pnpm exec vite --port 5199, then http://localhost:5199/scripts/dev/cartoon/?sheet=<sheet>
//   sheet=blocks                    one tile per problem, mid-attempt
//   sheet=moves&route=<id>&t=0.5    every step of a send on one problem, `t` of the way through each
//   sheet=ending&route=<id>&kind=send|fall|jump
//   sheet=play&route=<id>           the attempt played in a loop at the game's timings
//   sheet=rope&route=<id>&kind=send|fall|worked|ground   every rope step (clips, falls, takes) and the ending of a route
//   sheet=bench&per=30&stride=1     the mean time to draw a frame, in the page title
// Optional: w, h (tile size), di (climber DI offset from the problem's grade), crag=kalymnos (routes, 25 §10.8).
import { loadBundle } from '../../../src/data/bundle';
import { atRoute, syntheticRun } from '../../../src/harness/sim';
import { athleteOf, registerRoute, routeEntry, simulateAttempt } from '../../../src/sim/attempt';
import { referenceAthlete } from '../../../src/sim/grade';
import { fontGrade } from '../../../src/sim/grades';
import type { AttemptResult, AttemptState } from '../../../src/sim/state';
import type { Route } from '../../../src/sim/types';
import { frameFor, toScreen } from '../../../src/ui/wall/camera';
import type { V3 } from '../../../src/ui/wall/rig';
import { momentAt, playbackOf, type Playback } from '../../../src/ui/wall/playback';
import { gradeFor } from '../../../src/sim/grades';
import { drawToon } from '../../../src/ui/wall/toon';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 300), H = Number(q.get('h') ?? 420);
const bundle = loadBundle(false);
const sheet = document.getElementById('sheet')!;

/** The problems to look at: the three signatures and generated ones of each shape; with crag=kalymnos, routes. */
function problems(): Route[] {
  if (q.get('crag') === 'kalymnos') {
    const routes = bundle.benchmarks.get('kalymnos') ?? [];
    const maxA = (r: Route) => Math.max(...r.wall.map((s) => s.angle));
    const used = new Set<string>();
    const pick = (f: (r: Route) => boolean) => { const r = routes.find((x) => !used.has(x.id) && f(x)); if (r) used.add(r.id); return r; };
    const shaped = [
      pick((r) => maxA(r) < 95 && r.di_graded < 12),
      pick((r) => r.wall.some((s) => s.feature === 'tufa') && maxA(r) >= 100),
      pick((r) => maxA(r) >= 110),
      pick((r) => r.di_graded > 22),
      pick((r) => r.length_m > 30),
    ].filter((r): r is Route => !!r);
    for (const r of shaped) registerRoute(r);
    return shaped;
  }
  const sigs = [...bundle.signatures.values()];
  const bench = bundle.benchmarks.get('fontainebleau') ?? [];
  const maxA = (r: Route) => Math.max(...r.wall.map((s) => s.angle));
  const used = new Set<string>();
  const pick = (f: (r: Route) => boolean) => { const r = bench.find((x) => !used.has(x.id) && f(x)); if (r) used.add(r.id); return r; };
  const shaped = [
    pick((r) => maxA(r) < 86),
    pick((r) => r.wall.some((s) => s.feature === 'arete') && maxA(r) <= 95),
    pick((r) => maxA(r) >= 100 && maxA(r) <= 118 && r.di_graded > 14),
    pick((r) => maxA(r) >= 135 && r.di_graded < 14),
    pick((r) => maxA(r) >= 135 && r.di_graded > 18),
    pick((r) => r.beta_line.some((s) => s.class === 'dyno') && r.di_graded > 16),
    pick((r) => r.beta_line.some((s) => s.class === 'toe_hook')),
  ].filter((r): r is Route => !!r);
  for (const r of shaped) registerRoute(r);
  return [...sigs, ...shaped];
}

interface Attempt { route: Route; pb: Playback; frames: AttemptState[]; result: AttemptResult }

/** One attempt by a reference climber `off` DI from the problem's grade, the first of the wanted outcome in 60 dice. */
function attempt(route: Route, want: AttemptResult['outcome'] | 'any', off: number, test: (a: Attempt) => boolean = () => true): Attempt {
  const seed = route.seed ?? route.id;
  const { geom } = routeEntry(seed, bundle);
  let best: Attempt | null = null;
  for (let k = 0; k < 60; k++) {
    const run = syntheticRun(referenceAthlete(route.di_graded + off), `gallery:${seed}:${k}`, bundle);
    atRoute(run, route);
    delete run.projects[route.id];
    const ath = athleteOf(run, bundle);
    const frames: AttemptState[] = [];
    simulateAttempt(run, seed, 'flash', bundle, (r) => { if (r.attempt) frames.push(structuredClone(r.attempt)); });
    const result = run.last_attempt!;
    const a = { route, pb: playbackOf(geom, ath, frames, result), frames, result };
    const classes = new Set(result.log.map((m) => m.cls)).size;
    if ((want === 'any' || result.outcome === want) && test(a)) {
      if (!best || classes > new Set(best.result.log.map((m) => m.cls)).size) best = a;
      if (classes >= 3) break;
    }
    best ??= k === 59 ? a : null;
  }
  return best!;
}

function tile(caption: string): CanvasRenderingContext2D {
  const fig = document.createElement('figure');
  fig.style.width = `${W}px`;
  const c = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  c.width = W * dpr;
  c.height = H * dpr;
  c.style.width = `${W}px`;
  c.style.height = `${H}px`;
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  fig.append(c, cap);
  sheet.append(fig);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function draw(ctx: CanvasRenderingContext2D, a: Attempt, i: number, t: number, end: number | null, time = 0): void {
  const m = momentAt(a.pb, i, t, end);
  const cam = frameFor(m.focus, W, H, a.pb.bounds, Number(q.get('z') ?? 1), [0, 0], a.pb.frameMin);
  const S = toScreen(cam, W, H);
  drawToon(ctx, W, H, S, cam.scale, { proj: a.pb.proj, block: a.pb.block, geom: a.pb.geom, joints: m.joints, fx: m.fx, touched: m.touched, target: m.target, time, pitch: a.pb.pitch && m.pitch ? { hardware: a.pb.pitch, ...m.pitch } : undefined });
  if (q.get('skel')) {
    // The bones over the drawing: legs red, arms green, spine blue.
    const j = m.joints;
    const P = (p: V3) => S(a.pb.proj.view(p));
    const line = (pts: V3[], col: string) => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((p, k) => { const s = P(p); if (k) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.stroke(); };
    line([j.hipL, j.knL, j.LF], '#ff0040'); line([j.hipR, j.knR, j.RF], '#ff00c8');
    line([j.shL, j.elL, j.LH], '#00c040'); line([j.shR, j.elR, j.RH], '#00e0a0');
    line([j.hipL, j.hipR], '#0060ff'); line([j.hip, j.sh, j.head], '#0060ff');
  }
}

const label = (a: Attempt) => `${a.route.name} ${a.pb.pitch ? gradeFor(a.route.di_graded, a.route.discipline) : fontGrade(a.route.di_graded)}`;
const off = Number(q.get('di') ?? 1);
const kind = q.get('sheet') ?? 'blocks';
const all = problems();
const chosen = () => all.find((r) => r.id === q.get('route') || r.seed === q.get('route')) ?? all[0]!;

await document.fonts.load('20px Bangers').catch(() => undefined);
if (kind === 'blocks') {
  for (const r of all) {
    const a = attempt(r, 'any', off);
    const i = Math.floor(a.pb.bodies.length * 0.6);
    const walls = r.wall.map((s) => `${Math.round(s.angle)}°${s.feature !== 'none' ? ` ${s.feature}` : ''}`).join(' / ');
    draw(tile(`${label(a)} · ${r.id}\n${walls}`), a, i, 1, null);
  }
} else if (kind === 'moves') {
  const a = attempt(chosen(), 'sent', off);
  const t = Number(q.get('t') ?? 0.5);
  a.pb.steps.forEach((s, i) => {
    if (i === 0) return;
    const what = s.kind === 'move' ? `${s.limb} ${s.cls}${s.outcome && s.outcome !== 'clean' ? ` (${s.outcome})` : ''}${s.commit ? ` [${s.commit}]` : ''}` : s.kind;
    draw(tile(`${i}: ${what} @${t}`), a, i, t, null);
  });
} else if (kind === 'at') {
  // Chosen moments of a send: steps=i:t,i:t (end:t for the ending).
  const a = attempt(chosen(), q.get('kind') === 'fall' ? 'fell' : 'sent', q.get('kind') === 'fall' ? -1.5 : off);
  for (const p of (q.get('steps') ?? '1:0.5').split(',')) {
    const [si, st] = p.split(':');
    const t = Number(st ?? 0.5);
    if (si === 'end') draw(tile(`${label(a)} · ending @${t}`), a, 0, 0, t, t * 2);
    else {
      const i = Number(si), s = a.pb.steps[i];
      draw(tile(`${i}: ${s?.kind} ${s?.limb ?? ''} ${s?.cls ?? ''} ${s?.outcome ?? ''} @${t}`), a, i, t, null);
    }
  }
} else if (kind === 'ending') {
  const want = q.get('kind') === 'fall' ? 'fell' : q.get('kind') === 'jump' ? 'jumped' : 'sent';
  const a = attempt(chosen(), want, want === 'sent' ? off : -1.5);
  for (const e of [0.05, 0.2, 0.35, 0.5, 0.62, 0.75, 0.88, 1]) draw(tile(`${label(a)} · ${a.result.outcome} @${e}`), a, 0, 0, e, e * 2);
} else if (kind === 'bench') {
  // Frame time: every problem's attempt drawn step by step at `per` points (30) through every `stride`th step (1).
  let n = 0, ms = 0;
  const per = Number(q.get('per') ?? 30), stride = Number(q.get('stride') ?? 1);
  for (const r of all) {
    const a = attempt(r, 'any', off);
    const ctx = tile(label(a));
    for (let i = 0; i < a.pb.steps.length; i += stride) for (let k = 0; k < per; k++) {
      const t0 = performance.now();
      draw(ctx, a, i, k / (per - 1), null, k / per);
      ms += performance.now() - t0;
      n++;
    }
  }
  document.title = `bench ${n} frames ${(ms / n).toFixed(2)} ms`;
  console.log(document.title);
} else if (kind === 'rope') {
  // Every step the rope plays (a clip, a fall and the catch, a take, a pull-through) and the ending, at four points each.
  const k = q.get('kind');
  const want = k === 'fall' || k === 'ground' ? 'fell' : k === 'worked' ? 'worked' : 'sent';
  const a = attempt(chosen(), want, want === 'sent' ? off : Number(q.get('di') ?? -1.5), (x) => k !== 'ground' || x.pb.ending?.kind === 'ground');
  const at = [0.15, 0.4, 0.65, 0.9];
  a.pb.plans.forEach((p, i) => {
    if (!p || (q.get('only') && !a.pb.steps[i]?.kind.startsWith(q.get('only')!))) return;
    for (const t of at) draw(tile(`${i}: ${a.pb.steps[i]?.kind} ${a.pb.steps[i]?.outcome ?? ''} @${t}`), a, i, t, null);
  });
  if (a.pb.ending) for (const e of [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]) draw(tile(`${label(a)} · ${a.pb.ending.kind} @${e}`), a, 0, 0, e, e * 2);
} else if (kind === 'play') {
  const a = attempt(chosen(), q.get('kind') === 'fall' ? 'fell' : 'sent', q.get('kind') === 'fall' ? -1.5 : off);
  const ctx = tile(label(a));
  const durs = a.pb.ms.map((m, i) => m + a.pb.dwell[i]!);
  const endMs = a.pb.ending?.ms ?? 0;
  const total = durs.reduce((s, d) => s + d, 0) + endMs + 800;
  const t0 = performance.now();
  const loop = (now: number) => {
    let e = (now - t0) % total;
    let i = 0;
    while (i < durs.length && e > durs[i]!) e -= durs[i++]!;
    if (i < durs.length) draw(ctx, a, i, Math.min(1, e / Math.max(1, a.pb.ms[i]!)), null, now / 1000);
    else draw(ctx, a, 0, 0, Math.min(1, e / Math.max(1, endMs)), now / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
(window as unknown as { done: boolean }).done = true;
