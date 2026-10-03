# Content Pipeline

Content is data: crags, style profiles, signature routes, traits, backgrounds and events are JSON files under `data/`, validated against the Zod mirrors of [schemas.md](schemas.md) and never edited through code. This doc is the how-to for adding each kind of content, what the validator enforces, naming rules, and the review checklist a PR must pass.

Related: [schemas](schemas.md) · [03 Traits](03-traits.md) · [04 Backgrounds](04-backgrounds.md) · [06 Procedural Routes](06-procedural-routes.md) · [09 World Atlas](09-world-atlas.md) · [15 Events](15-social-reputation-events.md) · [18 Tech Architecture](18-tech-architecture.md) · [19 Balance](19-balance-and-simulation-testing.md)

---

## 1. Folder layout

```
data/
├─ manifest.json              data_version, chunk list with hashes (generated, do not edit)
├─ tags.json                  the Tag vocabulary (schemas §2), single source
├─ traits/<category>.json     one file per TraitCategory, array of Trait
├─ backgrounds.json           array of Background
├─ injuries.json              array of InjuryDef
├─ training.json              array of TrainingActivity
├─ gear.json                  array of GearDef (14 §10)
├─ events/<context>.json      array of GameEvent grouped by primary context
├─ names/<language>.json      fictional NPC name lists
├─ world/
│  ├─ hubs.json               travel hubs and TravelEdge list
│  ├─ styles/<id>.json        one CragStyleProfile per file
│  └─ crags/<id>/
│     ├─ crag.json            Crag (including Climate)
│     └─ routes/<id>.json     signature Route files
└─ archetypes.json            NPC archetype table (15 §1.1)
```

Each `world/crags/<id>/` folder becomes one lazy chunk at build time ([18 §6](18-tech-architecture.md)); everything else is in the initial bundle.

---

## 2. Naming conventions

- Ids: lowercase `snake_case`, ASCII only, globally unique within the collection, never renamed once shipped (add a new id, mark the old `deprecated: true`).
- Crag ids are the common English place name (`fontainebleau`, `hueco_tanks`, `red_river_gorge`); sector-level content uses `<crag>__<sector>`.
- Style profiles: `<crag>_<flavour>` (`font_slopers`, `font_circuits`, `kalymnos_tufa`).
- Signature routes: `<crag>__<route_name_snake>` (`fontainebleau__marie_rose`). Real route names are allowed; `fa_note` text is fictional.
- Traits: the name in snake_case (`gecko_skin`, `afraid_of_falling`); an evolving trait's later stages are acquired traits named for what they are (`afraid_of_falling` → `falls_ok` → `falls_well`), and a stage that only removes the trait is `null` in `evolves_to` ([03 §1.7](03-traits.md)).
- Events: `<theme>_<noun>` (`wet_sandstone`, `dropped_scare`); hidden-trait foreshadow events `hidden_foreshadow_<trait>`.
- Backgrounds: the name in snake_case (`gym_comp_kid`). Gear: `<kind>_<variant>` (`shoes_soft`, `rope_70`).
- Files match the id they contain where one-per-file.
- Prose fields (`flavour`, `hook`, `character`, event `text`) are plain sentences, no markdown, ≤ 240 characters, British or American spelling consistently per file.

---

## 3. How to add

### 3.1 A crag
1. Copy `data/world/crags/_template/` to `data/world/crags/<id>/`.
2. Fill `crag.json`: identity and coordinates, `rock`, `disciplines`, `di_range` within [08](08-grades.md), all twelve `season` months, `climate` from monthly normals, `cost_tier` ([14 §3](14-economy-gear-logistics.md)), `access` rules with `rep_penalty_if_violated`, `community_size`, `language`, `gym_tier`, `npc_archetypes` from `archetypes.json`, `hub` from `hubs.json`, `character`, `phase`.
3. Reference at least one `CragStyleProfile` id in `style_profiles` (add one, §3.6, if no existing profile fits).
4. Add 2–4 signature routes (§3.5) and list them in `signature_routes`.
5. Add `TravelEdge` rows to and from the hub in `hubs.json`.
6. Run `pnpm validate` and `pnpm harness calibrate --crag <id>` (grades 200 procedural routes per profile at the crag). In P1a: `pnpm calibrate`, then `pnpm benchmarks` to rebuild the crag's benchmark set for the grade estimate (`data/routes/<crag>_benchmarks.json`); rebuild it after any change to the generator or the grade engine.

### 3.2 A trait
1. Choose the `TraitCategory` file; append a `Trait` with `kind`, `cost` (creation: ±2..±10; hidden/quirk/acquired: 0), `phase`, `tags` from `tags.json`, `effect`, `excludes`, `requires`, `flavour`; hidden traits add `point_mass` and `foreshadow` text.
2. Respect the caps: one `attr_mult` trait per attribute (list exclusions), synergies additive.
3. An evolving trait adds `evolves_to` (schemas §9 rule 17), and each stage it names is a trait in the file.
4. Run `pnpm validate`, then `pnpm recost --traits <id>` (paired careers, [19 §4](19-balance-and-simulation-testing.md)); take a cost the report marks clear, or justify a manual override in the PR.

### 3.3 A background
1. Append to `backgrounds.json` with `point_bonus` 0–6, `attr_add`, `attr_points`, `money_start`, `start_crag` whose `phase` ≤ the background's, `gear_start` ids from `gear.json`, `contacts` by archetype, `forced_traits`, `locked_traits`, `tags`, `hook`.
2. Run `pnpm harness careers --n 500 --fix-background <id>` and compare peak DI and bankruptcy rate against the other backgrounds (±15% band).

### 3.4 An event
1. Append a `GameEvent` to `data/events/<primary context>.json`: `context`, `weight` (0.3 rare … 2.0 common), `conditions` using only predicates from [15 §4.2](15-social-reputation-events.md), 2–4 `options`, each outcome with `weight`, `effects` (only `EventEffect` fields) and `text`.
2. Every `requires` references a predicate; every `traits_add` an existing trait id; every `injury` an `InjuryDef` id; `rep` keys are region ids or `@here`.
3. Run `pnpm validate` and `pnpm harness events --n 2000` to see fire-rate per 100 days (target 0.2–3 for a normal event).

### 3.5 A signature route
1. Create `routes/<id>.json` with `signature: true`, `di_target` (the canonical grade in DI), `danger`, `wall`, `holds`, `protection`, `start_holds`, `finish`, `length_m`, `style_tags`, `fa_note` (fictional).
2. Author holds in metres from the ground with the hold editor (`pnpm holds <file>` opens a local browser tool) or by hand; keep ≤ `hold_density_max` and the legibility rule from [06](06-procedural-routes.md).
3. Run `pnpm grade <file>`; the engine must land within ±1.0 of `di_target`. Adjust hold quality or size, never `di_graded`.

As built (P1a–P1b), the signatures come from scripts that also check the grade: `scripts/build-signatures.ts` places Font's holds by hand, and `scripts/build-sport-signatures.ts` runs an authored wall (segment heights, angles, tufas) through the sport generator, which sets a pitch's two hundred-odd holds and its bolts ([26 §8.3](26-p1b-implementation-notes.md)). For a new sport signature, add a spec there (sector, profile, `di_target`, wall, a fictional `fa_note`) and add the id to its sector's `signature_routes`.

### 3.6 A style profile
1. Create `styles/<id>.json`: `rock`, `hold_weights` summing to 1, `angle_dist`, `length_m`, `hold_density_max`, `protection`, `polish`, `sharpness`, `friction_base`, `seep_susceptibility`, `crux_position`, `move_grammar`, `tags`.
2. Run `pnpm harness calibrate --style <id>`: 1,000 routes across the DI range; accuracy ≥ 90% within ±1.0 and a line must exist for every generated route.
3. If the style cannot reach the top of its crags' DI range (the hardest generated problems grade more than 0.5 soft, with their hand holds at the hardest size and quality), set `di_max` to the last DI where the bias stays within 0.5 (`npx tsx scripts/dev/probe-ceiling.ts <id>`; [06 §1](06-procedural-routes.md)). If every profile of a sector has a ceiling, its problems above the highest one grade soft (in P1a, four Font sectors above DI 25; [22 §2](22-p1a-implementation-notes.md)).

---

## 4. Validation script (`pnpm validate`)

Runs `scripts/validate.ts` over all of `data/` and fails on the first class of error with file, path and message. It enforces [schemas §9](schemas.md) plus structural checks:

| Rule | Source |
|---|---|
| Every `Tag` used anywhere is in `tags.json` | §9.1 |
| Creation trait costs are integers in `[-10,-2] ∪ [2,10]`; quirk, acquired and hidden are 0; hidden carry `point_mass` | §9.2 |
| Pairwise: no two mutually selectable traits set `attr_mult` on the same attribute | §9.3 |
| `Crag.season` has all twelve months; `di_range` inside the DI table | §9.4 |
| `Protection.reach_from` and `start_holds` reference holds in the same route | §9.5 |
| `di_graded` absent from hand-authored files; signature routes carry `di_target` and grade within ±1.0 (run by `pnpm grade` in CI) | §9.6 |
| `Background.start_crag` phase ≤ background phase | §9.7 |
| Real-name blocklist against every string in the content, ids and the benchmark sets included: the names in `data/real_names.json`, as whole words, ignoring case, accents and punctuation | §9.8 |
| Zod parse of every file against its schema; unknown keys rejected | structural |
| All cross-references resolve: trait ids, gear ids, crag ids, hub ids, style ids, archetype ids, injury ids, event predicate names | structural |
| Ids unique per collection and match filename where one-per-file | structural |
| `hold_weights` and outcome `weight`s per option are positive; `angle_dist` weights sum > 0 | structural |
| No `TravelEdge` to a crag without a `hub`; every crag's hub exists | structural |
| Every `phase` value is a `Phase`; P1a content references only P1a content | structural |
| Prose length ≤ 240 chars; no markdown | style |

The validator is also run as a Vitest test so it appears in the normal test output.

---

## 5. Review checklist (PR template)

- [ ] `pnpm validate`, `pnpm test`, `pnpm grade` pass locally.
- [ ] New ids follow §2; no renamed ids.
- [ ] Tags only from `tags.json`; "helps with / hurts with" reads sensibly in the creation UI.
- [ ] Numbers that are guesses are marked `(tune)` in the linked doc and the harness report is attached for cost or grade changes.
- [ ] Real places and route names only; all people fictional; `fa_note` checked.
- [ ] Access rules match the atlas doc; wet-rock lags and closures carry `rep_penalty_if_violated`.
- [ ] Phase set correctly; nothing in P1a depends on P2 content.
- [ ] Golden snapshot diffs explained (`balance:` tag) or absent.
- [ ] Docs updated if a rule changed ([schemas](schemas.md) first, then the system doc).

---

## Open questions / proposed schema additions

- `deprecated?: boolean` on every content type (used by the no-rename rule in §2) is not in schemas.md; add it there or drop the rule.
- Crag, style and route ids used as examples in §2 must match the ids chosen in [09](09-world-atlas.md); the cross-reference check in §4 makes any mismatch fail loudly.
- Whether `data/` should be a separate package (`@cwt/data`) versioned independently from the app so old runs can pin an exact content version ([18 §5](18-tech-architecture.md)).
- A browser-based hold editor is assumed by §3.5; its scope (P1a minimal or P2 full) is unscheduled.
