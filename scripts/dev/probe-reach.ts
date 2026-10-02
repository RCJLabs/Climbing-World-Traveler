// C8-style send rates by player skill with Swing and Catch, Reach, or both on, on dynamic and on no-dyno problems near DI 16 (docs/23 §3.1).
// usage: npx tsx scripts/dev/probe-reach.ts [grip_ms=GRIP_MS] [skills_json] [attempts=150]   (grip_ms rescales the budget without editing reach.ts)
import { loadBundle } from '../../src/data/bundle';
import { autoClimbAction, doCommit, doMove, doWallAction, reachBudget, registerRoute, startAttempt } from '../../src/sim/attempt';
import { atRoute, harnessSwing, mean, syntheticRun, type Timing } from '../../src/harness/sim';
import { referenceAthlete } from '../../src/sim/grade';
import { stream, type Rng } from '../../src/sim/rng';
import { generateBoulder } from '../../src/sim/routes';
import { GRIP_MS, type MovePerf } from '../../src/sim/reach';
import type { Route } from '../../src/sim/types';

const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
const routes: Route[] = [];
for (const profile of bundle.profiles.values()) {
  const sector = crag.sectors.find((s) => s.style_profiles.includes(profile.id))!;
  for (let di = 15; di <= 17; di++) for (let k = 0; k < 12; k++) {
    try { routes.push(generateBoulder({ crag, sector, profile, di_target: di, seed: `cal:${profile.id}:${di}:${k}`, bundle })); } catch {}
  }
}
const dyn = routes.filter((r) => r.components && r.components.dynamic_share > 0.15).slice(0, 10);
const stat = routes.filter((r) => r.components && r.components.dynamic_share === 0).slice(0, 10);
console.log(`dynamic ${dyn.length}, static ${stat.length}`);

type Skill = { mu: number; sd: number; place: number };
const args = process.argv.slice(2);
const GRIP = Number(args[0] ?? GRIP_MS);
const skills: Record<string, Skill> = JSON.parse(args[1] ?? '{"novice":{"mu":1100,"sd":400,"place":0.5},"average":{"mu":800,"sd":250,"place":0.3},"expert":{"mu":600,"sd":150,"place":0.15}}');
const scale = GRIP / GRIP_MS;

function attempt(route: Route, k: number, timing: Timing, swing: boolean, reach: boolean, stats: { pops: number; over: number; n: number }) {
  const base = syntheticRun(referenceAthlete(route.di_graded), `c8:${route.id}`, bundle);
  const run = structuredClone(base);
  run.seed = `${base.seed}:${k}`;
  run.options.auto_commit = timing === 'auto' || !swing;
  atRoute(run, route);
  delete run.projects[route.id];
  registerRoute(route);
  startAttempt(run, route.seed ?? route.id, 'redpoint', bundle);
  const rng: Rng = stream('c8tap', timing, route.id, k);
  for (let g = 0; g < 150 && run.attempt; g++) {
    const at = run.attempt;
    if (at.pending) { doCommit(run, swing && timing !== 'auto' ? harnessSwing(at.pending.swing, timing, rng) : null, bundle); continue; }
    const a = autoClimbAction(run, bundle, { bot: true });
    if (!a || a.t === 'commit') { doCommit(run, null, bundle); continue; }
    if (a.t === 'move') {
      let perf: MovePerf | undefined;
      if (reach && timing !== 'auto' && timing !== 'oracle') {
        const b0 = reachBudget(run, a.limb, a.hold, a.class, bundle);
        if (b0 !== null) {
          const b = b0 * scale; // what the budget would be with GRIP
          const m = skills[timing]!;
          const t = Math.max(250, rng.normal(m.mu, m.sd));
          // express t relative to the scaled budget, then back to the engine's budget
          perf = { kind: 'reach', time_ms: Math.round(t / b * b0), place: Math.abs(rng.normal(0, m.place)) };
          if (a.limb.endsWith('H')) { stats.n++; if (t > 2 * b) stats.pops++; if (t > b) stats.over++; }
        }
      }
      doMove(run, a.limb, a.hold, a.class, bundle, perf);
    } else if (a.t === 'wall_action') doWallAction(run, a.kind, bundle);
  }
  if (run.attempt) doWallAction(run, 'jump_off', bundle);
  return run.last_attempt!.outcome === 'sent';
}

const N = Number(args[2] ?? 150);
for (const [label, set] of [['dynamic', dyn], ['static', stat]] as const) {
  for (const [mode, sw, re] of [['swing only', true, false], ['reach only', false, true], ['both', true, true]] as const) {
    if (label === 'static' && mode !== 'reach only') continue;
    const out: string[] = [];
    const st = { pops: 0, over: 0, n: 0 };
    const rs: Record<string, number> = {};
    for (const t of ['auto', 'novice', 'average', 'expert'] as Timing[]) {
      const rates = set.map((r) => { let s = 0; for (let k = 0; k < N; k++) if (attempt(r, k, t, sw, re, t === 'novice' ? st : { pops: 0, over: 0, n: 0 })) s++; return s / N; });
      rs[t] = mean(rates);
      out.push(`${t} ${(100 * rs[t]).toFixed(1)}`);
    }
    console.log(`${label} ${mode}: ${out.join(', ')}; gap ${(100 * (rs.expert! - rs.novice!)).toFixed(1)}; novice hand moves ${st.n}, over ${(100 * st.over / Math.max(1, st.n)).toFixed(1)}%, pop ${(100 * st.pops / Math.max(1, st.n)).toFixed(1)}%`);
  }
}
