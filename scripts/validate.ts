// Content validator (docs/20 §4, schemas §9): Zod shapes plus cross-references, trait economy rules, presets
// and signature grades (05c C7). Exits non-zero on any error so CI can gate on it.  pnpm validate
import realNamesJson from '../data/real_names.json';
import { loadBundle } from '../src/data/bundle';
import { contentOf, realNameHits } from '../src/data/realnames';
import { RealNamesSchema } from '../src/data/schema';
import { phaseLive, traitEffectErrors, validateCreation } from '../src/sim/character';
import { gradeRoute } from '../src/sim/grade';
import { PRESETS, presetSpec } from '../src/sim/presets';
import { travelGraphErrors } from '../src/sim/travel';
import { ALL_ATTRS, HOLD_TYPES } from '../src/sim/types';

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

let bundle;
try {
  bundle = loadBundle(true);
} catch (e) {
  console.error('Schema validation failed:\n', (e as Error).message);
  process.exit(1);
}

const attrs = new Set<string>(ALL_ATTRS);
const holdTypes = new Set<string>(HOLD_TYPES);

// Traits: effects reference real attributes and hold types; exclusions are symmetric where both exist.
for (const t of bundle.traits.values()) {
  const e = t.effect;
  for (const k of [...Object.keys(e.attr_add ?? {}), ...Object.keys(e.ceiling_add ?? {}), ...Object.keys(e.attr_mult ?? {}), ...Object.keys(e.adapt_rate_mult ?? {})]) {
    if (!attrs.has(k)) err(`trait ${t.id}: unknown attribute ${k}`);
  }
  for (const k of Object.keys(e.hold_mult ?? {})) if (!holdTypes.has(k)) err(`trait ${t.id}: unknown hold type ${k}`);
  for (const m of traitEffectErrors(t)) err(m);
  for (const x of t.excludes) {
    const other = bundle.traits.get(x);
    if (other && !other.excludes.includes(t.id)) warn(`trait ${t.id} excludes ${x} but not the reverse`);
  }
}

// Backgrounds: forced traits exist, start crag exists, attr_add uses real attributes, live ones are reachable.
for (const b of bundle.backgrounds.values()) {
  for (const id of b.forced_traits) if (!bundle.traits.has(id)) err(`background ${b.id}: forced trait ${id} missing`);
  if (!bundle.crags.has(b.start_crag)) err(`background ${b.id}: start crag ${b.start_crag} missing`);
  for (const k of Object.keys(b.attr_add)) if (!attrs.has(k)) err(`background ${b.id}: unknown attribute ${k}`);
  if (phaseLive(b.phase) && b.forced_traits.some((id) => { const t = bundle!.traits.get(id); return t && !phaseLive(t.phase); })) {
    err(`background ${b.id}: a forced trait is not live in this phase`);
  }
}

// Crags: sectors reference real style profiles and signature routes; circuits sit inside the crag's DI range.
for (const c of bundle.crags.values()) {
  if (c.climate.length !== 12 || c.season.length !== 12) err(`crag ${c.id}: climate and season need 12 months`);
  for (const s of c.sectors) {
    for (const p of s.style_profiles) if (!bundle.profiles.has(p)) err(`crag ${c.id}/${s.id}: unknown style profile ${p}`);
    for (const r of s.signature_routes) if (![...bundle.signatures.values()].some((x) => x.id === r)) err(`crag ${c.id}/${s.id}: signature ${r} missing`);
    for (const circ of s.circuits) {
      if (circ.di_range[0] < c.di_range[0] || circ.di_range[1] > c.di_range[1]) warn(`crag ${c.id}/${s.id}: ${circ.colour} circuit outside the crag range`);
    }
  }
  const bench = bundle.benchmarks.get(c.id);
  if (phaseLive(c.phase) && (!bench || bench.length < 12)) err(`crag ${c.id}: benchmark set missing or short (run pnpm benchmarks)`);
}

// Crags and profiles agree on the discipline (06 §2.6): a sport crag's sectors use bolted profiles, a bouldering
// crag's sectors use profiles without protection, which the generator builds as boulders.
for (const c of bundle.crags.values()) {
  const sport = c.disciplines.includes('sport');
  for (const s of c.sectors) {
    for (const id of s.style_profiles) {
      const bolted = bundle.profiles.get(id)?.protection?.kind === 'bolt';
      if (sport && !bolted) err(`crag ${c.id}/${s.id}: sport crag uses unbolted profile ${id}`);
      if (!sport && bolted) err(`crag ${c.id}/${s.id}: bouldering crag uses bolted profile ${id}`);
    }
  }
}

// Profiles: name banks exist; hold weights use real hold types.
for (const p of bundle.profiles.values()) {
  if (!bundle.names[p.name_bank]) err(`profile ${p.id}: name bank ${p.name_bank} missing`);
  for (const k of Object.keys(p.hold_weights)) if (!holdTypes.has(k)) err(`profile ${p.id}: unknown hold type ${k}`);
}

// Signature routes: holds referenced by start, beta, finish and the bolts' clipping holds exist; engine grade within ±1.0 (C7).
for (const r of bundle.signatures.values()) {
  const ids = new Set(r.holds.map((h) => h.id));
  for (const id of [...Object.values(r.start), r.finish_hold, ...r.beta_line.map((s) => s.hold), ...r.protection.flatMap((p) => p.reach_from ?? [])]) if (!ids.has(id)) err(`signature ${r.id}: hold ${id} missing`);
  const g = gradeRoute(r);
  if (g.di === null) err(`signature ${r.id}: ungradeable`);
  else if (Math.abs(g.di - r.di_target) > 1.0) err(`signature ${r.id}: grades ${g.di.toFixed(2)}, canonical ${r.di_target}`);
  else if (Math.abs(g.di - r.di_graded) > 0.05) warn(`signature ${r.id}: stored di_graded ${r.di_graded} but engine gives ${g.di.toFixed(2)}; rebuild`);
}

// Real people (schemas §9 rule 8): no string anywhere in the content names someone on the list.
const realNames = RealNamesSchema.safeParse(realNamesJson);
if (!realNames.success) err(`real_names.json: ${realNames.error.message}`);
else for (const m of realNameHits(contentOf(bundle), realNames.data)) err(m);

// The travel graph: edges join real crags and hubs, and every live crag can reach every other (09 §8).
for (const e of travelGraphErrors(bundle)) err(e);
// A live background starts at a live crag.
for (const b of bundle.backgrounds.values()) {
  const c = bundle.crags.get(b.start_crag);
  if (phaseLive(b.phase) && c && !phaseLive(c.phase)) err(`background ${b.id}: starts at ${c.id}, which is not live in this phase`);
}

// Presets are valid builds with every unlock held.
const allUnlocks = new Set([...bundle.backgrounds.values()].map((b) => b.unlock).filter((x): x is string => !!x));
for (const p of PRESETS) {
  const e = validateCreation(presetSpec(p.id), { traits: bundle.traits, backgrounds: bundle.backgrounds, unlocked: allUnlocks });
  if (e.length) err(`preset ${p.id}: ${e.join(' ')}`);
}

const live = [...bundle.traits.values()].filter((t) => phaseLive(t.phase) && t.kind === 'creation');
console.log(`traits ${bundle.traits.size} (${live.length} live at creation) · backgrounds ${bundle.backgrounds.size} · crags ${bundle.crags.size} · profiles ${bundle.profiles.size} · signatures ${bundle.signatures.size}`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
if (errors.length) process.exit(1);
console.log('content OK');
