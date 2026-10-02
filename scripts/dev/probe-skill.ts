// Send rates by player skill (Swing and Catch, Reach and Balance together, the harness models of 19 §3) on three
// samples near DI 16: dynamic problems (the C8 set), slab problems (Balance-heavy) and other problems with no dynos.
// usage: npx tsx scripts/dev/probe-skill.ts [problems=10] [attempts=150]
import { loadBundle } from '../../src/data/bundle';
import { diceAttempt, mean, syntheticRun, type Timing } from '../../src/harness/sim';
import { referenceAthlete } from '../../src/sim/grade';
import { stream } from '../../src/sim/rng';
import { generateBoulder } from '../../src/sim/routes';
import type { Route } from '../../src/sim/types';

const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
const nProblems = Number(process.argv[2] ?? 10);
const N = Number(process.argv[3] ?? 150);
const routes: { r: Route; profile: string }[] = [];
for (const profile of bundle.profiles.values()) {
  const sector = crag.sectors.find((s) => s.style_profiles.includes(profile.id))!;
  for (let di = 15; di <= 17; di++) for (let k = 0; k < 14; k++) {
    try { routes.push({ r: generateBoulder({ crag, sector, profile, di_target: di, seed: `cal:${profile.id}:${di}:${k}`, bundle }), profile: profile.id }); } catch { /* skip */ }
  }
}
const sets: [string, Route[]][] = [
  ['dynamic', routes.filter((x) => x.r.components && x.r.components.dynamic_share > 0.15).map((x) => x.r).slice(0, nProblems)],
  ['slab', routes.filter((x) => x.profile === 'font_sloper_slab' && x.r.components?.dynamic_share === 0).map((x) => x.r).slice(0, nProblems)],
  ['other no-dyno', routes.filter((x) => x.profile !== 'font_sloper_slab' && x.r.components?.dynamic_share === 0).map((x) => x.r).slice(0, nProblems)],
];
for (const [label, set] of sets) {
  const rs: Record<string, number> = {};
  const outcomes: Record<string, Record<string, number>> = {};
  for (const t of ['auto', 'novice', 'average', 'expert'] as Timing[]) {
    const oc: Record<string, number> = {};
    rs[t] = mean(set.map((r) => {
      const base = syntheticRun(referenceAthlete(r.di_graded), `c8:${r.id}`, bundle);
      let s = 0;
      for (let k = 0; k < N; k++) {
        const res = diceAttempt(base, r, k, bundle, t, stream('c8tap', t, r.id, k));
        if (res.outcome === 'sent') s++;
        for (const m of res.log) if (/Barn|barn/.test(m.text)) oc.barn = (oc.barn ?? 0) + 1;
      }
      return s / N;
    }));
    outcomes[t] = oc;
  }
  console.log(`${label} (${set.length}): auto ${(100 * rs.auto!).toFixed(1)}, novice ${(100 * rs.novice!).toFixed(1)}, average ${(100 * rs.average!).toFixed(1)}, expert ${(100 * rs.expert!).toFixed(1)}; expert − novice ${(100 * (rs.expert! - rs.novice!)).toFixed(1)}; barn doors (novice) ${outcomes.novice!.barn ?? 0}`);
}
