// Dev: what each live creation trait is worth on the wall, in DI. The Reference Climber at one grade, with and without
// the trait (its attribute adds, mods and mass), walks the Font problems and the Kalymnos routes near that grade (the
// grade engine's expected-value walk, 05c §2); the change in mean send probability is divided by what one DI changes
// it by on the same set. Also what +5 on each attribute is worth, the yardstick 03 §1.4's cost formula needs. Learning
// rates, ceilings, skin and stoke between days, living costs and fear (the walk is fearless) do not show here, nor the
// stakes context.
//   npx tsx scripts/dev/trait-onwall.ts [DI=17]
import { loadBundle } from '../../src/data/bundle';
import { aggregateMods, phaseLive, type Athlete } from '../../src/sim/character';
import { evWalk, referenceAthlete } from '../../src/sim/grade';
import { ALL_ATTRS, type AttrId, type Route } from '../../src/sim/types';
import { routeGeom, type RouteGeom } from '../../src/sim/wall';

const bundle = loadBundle(false);
const DI = Number(process.argv[2] ?? 17);
const near = (rs: readonly Route[], w: number) => rs.filter((r) => Math.abs(r.di_graded - DI) <= w);
const sets: [string, RouteGeom[]][] = [
  ['Font', near(bundle.benchmarks.get('fontainebleau') ?? [], 1.5).map((r) => routeGeom(r))],
  ['Kalymnos', near(bundle.benchmarks.get('kalymnos') ?? [], 2.5).map((r) => routeGeom(r))],
];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pMean = (ath: Athlete, gs: RouteGeom[]) => mean(gs.map((g) => evWalk(g, ath).p_send));

const ref = referenceAthlete(DI);
const p0 = sets.map(([, gs]) => pMean(ref, gs));
/** Send probability per DI on each set: the Reference Climber half a DI either side. */
const perDI = sets.map(([, gs]) => pMean(referenceAthlete(DI + 0.5), gs) - pMean(referenceAthlete(DI - 0.5), gs));
const worth = (ath: Athlete) => sets.map(([, gs], i) => (pMean(ath, gs) - p0[i]!) / perDI[i]!);

function withTrait(base: Athlete, id: string): Athlete {
  const t = bundle.traits.get(id)!;
  const a = { ...base.a };
  for (const [k, v] of Object.entries(t.effect.attr_add ?? {}) as [AttrId, number][]) a[k] = Math.max(0, Math.min(100, a[k] + v));
  const mods = aggregateMods([id], bundle.traits);
  const body = mods.mass_shift ? { ...base.body, mass_kg: base.body.mass_kg + mods.mass_shift } : base.body;
  return { ...base, a, mods, body };
}

console.log(`DI ${DI}: ${sets.map(([k, gs], i) => `${k} ${gs.length} lines, P ${p0[i]!.toFixed(2)}, ${(perDI[i]! * 100).toFixed(1)} points of P per DI`).join('; ')}\n`);
console.log('| Trait | phase | cost | DI on Font | DI on Kalymnos |');
console.log('|---|---|---|---|---|');
const traits = [...bundle.traits.values()].filter((t) => phaseLive(t.phase) && (t.kind === 'creation' || t.kind === 'evolving'))
  .sort((a, b) => a.phase.localeCompare(b.phase) || a.id.localeCompare(b.id));
for (const t of traits) {
  const [f, k] = worth(withTrait(ref, t.id));
  console.log(`| ${t.id} | ${t.phase} | ${t.cost} | ${f!.toFixed(2)} | ${k!.toFixed(2)} |`);
}
console.log('\n| +5 on | DI on Font | DI on Kalymnos |');
console.log('|---|---|---|');
for (const id of ALL_ATTRS) {
  const [f, k] = worth({ ...ref, a: { ...ref.a, [id]: Math.min(100, ref.a[id] + 5) } });
  if (Math.abs(f!) >= 0.005 || Math.abs(k!) >= 0.005) console.log(`| ${id} | ${f!.toFixed(2)} | ${k!.toFixed(2)} |`);
}
