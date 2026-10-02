// How often the Balance stance test (docs/23 §2.2) flags moves on generated Font problems, by style, for a few rule
// variants. Walks each beta line with the Reference Climber at the problem's grade.
// usage: npx tsx scripts/dev/probe-stance.ts [per_di=6]
import { loadBundle } from '../../src/data/bundle';
import { stanceOf } from '../../src/sim/balance';
import { applyMove, prepareMove } from '../../src/sim/engine';
import { referenceAthlete, startState } from '../../src/sim/grade';
import { generateBoulder } from '../../src/sim/routes';
import { isDynamic } from '../../src/sim/tables';
import type { Limb } from '../../src/sim/types';
import { routeGeom, type ClimbState, type RouteGeom } from '../../src/sim/wall';

const bundle = loadBundle();
const crag = bundle.crags.get('fontainebleau')!;
const perDi = Number(process.argv[2] ?? 6);

/** The shipped stance (src/sim/balance.ts) plus whether a foot left in the base is on a smear, for the rule variants. */
function stance(geom: RouteGeom, ath: ReturnType<typeof referenceAthlete>, st: ClimbState, limb: Limb) {
  const s = stanceOf(geom, ath, st, limb);
  const smear = (['LF', 'RF'] as Limb[]).some((l) => l !== limb && !st.feet_cut && st.anchors[l] && geom.holds.get(st.anchors[l]!)?.type === 'smear');
  return { ...s, smear };
}

const rules: Record<string, (s: ReturnType<typeof stance>) => boolean> = {
  'shipped (balance.ts)': (s) => s.balance,
  'first proposal: ≤90°, edge 8 cm, or smear': (s) => s.angle <= 90 && (s.d > -0.08 || s.smear),
  '≤90°, edge 8 cm, no smear rule': (s) => s.angle <= 90 && s.d > -0.08,
  '≤90°, edge 5 cm, no smear rule': (s) => s.angle <= 90 && s.d > -0.05,
  '≤90°, edge 5 cm, or smear': (s) => s.angle <= 90 && (s.d > -0.05 || s.smear),
  '≤90°, smear only': (s) => s.angle <= 90 && s.smear,
  'any angle, edge 8 cm': (s) => s.d > -0.08,
};
const counts = new Map<string, { moves: number; hits: Record<string, number>; d: number[] }>();
for (const profile of bundle.profiles.values()) {
  const sector = crag.sectors.find((s) => s.style_profiles.includes(profile.id))!;
  const c = { moves: 0, hits: Object.fromEntries(Object.keys(rules).map((k) => [k, 0])), d: [] as number[] };
  counts.set(profile.id, c);
  for (let di = 9; di <= Math.min(24, profile.di_max ?? 24); di++) for (let k = 0; k < perDi; k++) {
    let route;
    try { route = generateBoulder({ crag, sector, profile, di_target: di, seed: `stance:${profile.id}:${di}:${k}`, bundle }); } catch { continue; }
    const geom = routeGeom(route);
    const ath = referenceAthlete(route.di_graded);
    let st = startState(geom, ath);
    for (const step of route.beta_line) {
      if (step.class === 'mantle') break;
      const prep = prepareMove(geom, ath, st, step.limb, step.hold, step.class) ?? prepareMove(geom, ath, st, step.limb, step.hold);
      if (!prep) break;
      if (!isDynamic(prep.cls)) {
        const s = stance(geom, ath, st, step.limb);
        c.moves++;
        c.d.push(s.d);
        for (const [name, f] of Object.entries(rules)) if (f(s)) c.hits[name]!++;
      }
      st = applyMove(geom, ath, st, step.limb, step.hold, prep.cls);
    }
  }
}
const all = { moves: 0, hits: Object.fromEntries(Object.keys(rules).map((k) => [k, 0])) as Record<string, number> };
for (const [p, c] of counts) {
  all.moves += c.moves;
  for (const k of Object.keys(rules)) all.hits[k]! += c.hits[k]!;
  const ds = [...c.d].sort((a, b) => a - b);
  const q = (f: number) => ds[Math.floor(f * (ds.length - 1))]!.toFixed(3);
  console.log(`${p}: ${c.moves} static moves; CoM to base edge p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} m (negative = inside)`);
  for (const k of Object.keys(rules)) console.log(`    ${k}: ${(100 * c.hits[k]! / c.moves).toFixed(1)}%`);
}
console.log(`all: ${all.moves} moves`);
for (const k of Object.keys(rules)) console.log(`    ${k}: ${(100 * all.hits[k]! / all.moves).toFixed(1)}%`);
