# Climbing World Traveler

Build a climber. Live a climbing life. See how far your body, head and heart take you.

A climbing career simulation for phone and browser. Create a climber from anthropometrics, trainable attributes and Project-Zomboid-style traits (positives cost points, negatives refund them). Plan their training and their days; every climb plays out by itself, hold by hold on a 2D wall, resolved by the build. Travel a world of real crags. Age, get injured, go broke, get sponsored, retire or do not. Then build another one.

**Status:** P1a, the Fontainebleau vertical slice, is playable as a simulation ([docs/24](docs/24-simulation-game.md)). Create a climber, plan their training week, and simulate days, weeks or months in the forest; every attempt on a procedural or signature boulder is simulated, and any single attempt can be watched on the wall. P1b, Kalymnos sport, is under way: a run can start at Kalymnos or travel there from Font ($280, two days) and climb its routes by the same week plan, on the rope (bolts, clipping, falls, working a route, generated and graded 15–40 m routes, French grades), and any attempt on a route can be watched on the cartoon wall (the cliff, quickdraws, the rope and the belayer, every clip, fall and lower). Creation offers the P1b traits, and the Grande Grotta has three signature routes (Priapos 7a, DNA 7c, Aegialis 8c). Afraid of Falling, Choker and Topout Terror evolve, and trait costs follow a measured re-costing over whole careers. P2's plan is [docs/27](docs/27-p2-plan.md): P2a, the systems at Font and Kalymnos, then P2b, the world of 32 crags. P2's first milestone gives each sector a fixed set of routes, the same in every run, and measures whole ten-year careers in the harness; the second makes a crag a folder of data that loads when the climber gets there, lets one crag have boulders and routes, carries saved runs across versions, and adds ten traits and a Journal ([docs/28](docs/28-p2-implementation-notes.md)). The full design set is in `docs/`; what P1a implements differently, and the measured balance numbers, are in [docs/22](docs/22-p1a-implementation-notes.md), and P1b's in [docs/26](docs/26-p1b-implementation-notes.md).

Platform: offline-first PWA on GitHub Pages, later a Trusted Web Activity on Google Play. Stack: Vite, TypeScript, Preact, Canvas2D. See [docs/18-tech-architecture.md](docs/18-tech-architecture.md).

## Running it

```sh
pnpm install
pnpm dev                 # the game at http://localhost:5173
pnpm test                # engine golden tests, generator, reducer, replay and saves
pnpm validate            # content validator
pnpm calibrate --quick   # grade-engine calibration (C1–C10), every live crag's own gates; --crag <id> for one; drop --quick for the fuller sweep
pnpm harness --n 40 --days 365 --out reports   # headless careers with a scripted player; --crag kalymnos for route careers
pnpm benchmarks [crag]   # rebuild a crag's benchmark set (and the manifest) after a generator or grade-engine change
pnpm manifest            # rebuild data/manifest.json, the crag folders' content hashes
pnpm build               # typecheck + production build into dist/
pnpm size                # the size gate on dist/: initial JS, every crag's route chunk, Workbox's 2 MiB
```

Code map: `src/sim` is the pure, seeded simulation (engine, generator, grade engine, run reducer); `src/save` the event-sourced saves; `src/ui` the Preact screens and the canvas wall; `src/harness` and `scripts/` the balance tooling; `data/` the content.

---

## Design documents

Read in this order for a first pass: 00 → 01 → 24 → 02 → 05b → 03.

| # | Document | What it covers |
|---|---|---|
| — | [schemas](docs/schemas.md) | Canonical data shapes, identifiers and the tag vocabulary every other doc uses |
| 00 | [Vision](docs/00-vision.md) | Pitch, fantasy, reference points, tone, what the game is not |
| 01 | [Pillars, Scope and Roadmap](docs/01-pillars-scope-roadmap.md) | Pillars, locked decisions, non-goals, phased roadmap with cut lines, risks |
| 02 | [Character Model](docs/02-character-model.md) | Body sliders, 36 attributes, derived stats, resources, age curves, starting allocation |
| 03 | [Traits](docs/03-traits.md) | Trait-point economy and anti-exploit rules, 150+ trait catalogue, archetypes, sample builds |
| 04 | [Backgrounds](docs/04-backgrounds.md) | 15 starting backgrounds |
| 05a | [Wall and Kinematics](docs/05a-wall-and-kinematics.md) | Wall profile, holds, protection, reach envelope, postures, climber rig |
| 05b | [Move Resolution and Attempt Loop](docs/05b-move-resolution-and-attempt-loop.md) | The core engine: attribute × hold × move matrix, resolution, costs, rests, fear, commit window, falls, sessions, worked examples |
| 05c | [Grade Engine](docs/05c-grade-engine.md) | Reference Climber, how a route gets its Difficulty Index, danger axis, calibration |
| 06 | [Procedural Routes](docs/06-procedural-routes.md) | Crag style profiles, features-first generation, legibility, signature routes |
| 07 | [Disciplines](docs/07-disciplines.md) | Boulder, sport, trad, big wall, alpine, ice, DWS, competition, gym |
| 08 | [Grades](docs/08-grades.md) | Difficulty Index and conversions to every grading system; danger axis |
| 09 | [World Atlas](docs/09-world-atlas.md) | 50+ real crags with climate, access, seasons, signature routes; travel graph; calendar |
| 10 | [Weather and Conditions](docs/10-weather-and-conditions.md) | Climate to daily weather, friction, wet-rock rules, altitude |
| 11 | [Time, Career and Aging](docs/11-time-career-aging.md) | Day loop, seasons, aging, run-end conditions, legacy |
| 12 | [Training and Adaptation](docs/12-training-and-adaptation.md) | Activities, three adaptation clocks, load management, detraining |
| 13 | [Injury and Health](docs/13-injury-and-health.md) | Injury catalogue, recovery, rehab, illness, health care |
| 14 | [Economy, Gear and Logistics](docs/14-economy-gear-logistics.md) | Income, costs, sponsorship, gear, permits, travel |
| 15 | [Social, Reputation and Events](docs/15-social-reputation-events.md) | NPC lifecycle, partners, reputation, ethics, event system |
| 16 | [Meta-progression and Runs](docs/16-meta-progression-and-runs.md) | Run creation, difficulty, unlocks, legacy NPCs, Hall of Fame |
| 17 | [UI and UX](docs/17-ui-ux.md) | Mobile-first screens, the wall, onboarding, accessibility (wall input superseded by 24) |
| 18 | [Tech Architecture](docs/18-tech-architecture.md) | Stack, determinism, event-sourced saves, PWA/TWA pipeline, performance budgets |
| 19 | [Balance and Simulation Testing](docs/19-balance-and-simulation-testing.md) | Headless career harness, trait re-costing, calibration tests, CI gates |
| 20 | [Content Pipeline](docs/20-content-pipeline.md) | How to add crags, traits, backgrounds, events, routes; validation |
| 21 | [Glossary](docs/21-glossary.md) | Climbing and game terms |
| 22 | [P1a Implementation Notes](docs/22-p1a-implementation-notes.md) | Where the Fontainebleau slice departs from the design, why, and the measured harness results |
| 23 | [Move Types and Art Direction](docs/23-move-types-and-art-direction.md) | Flat Dusk, the art direction of the app's screens (the wall is the cartoon, 25); the per-move controls it also describes are retired (24) |
| 24 | [The Simulation Game](docs/24-simulation-game.md) | How the game is played: the week plan, the climber's own tactics, simulated days, reports, watching an attempt |
| 25 | [Watching the Simulation](docs/25-visual-representation.md) | The cartoon wall (chosen 2026-10-03): each problem drawn as its own block, natural legs, every move class animated; and the ten styles it was chosen from |
| 26 | [P1b Implementation Notes](docs/26-p1b-implementation-notes.md) | Kalymnos sport: how the engine resolves the design docs' conflicts on the rope, the endurance changes that make a route a pump game, the sport generator, Kalymnos in the game (travel, sessions, wet rules, records), and the measured calibration, careers and exit test |
| 27 | [P2 Plan](docs/27-p2-plan.md) | How the World phase is built: where P1b leaves each system, ten milestones in two parts (P2a: the harness first, then the systems at two crags; P2b: the atlas, people and events), crags as data, save adapters, the exit test, and the conflicts between the design docs to settle first |
| 28 | [P2 Implementation Notes](docs/28-p2-implementation-notes.md) | Where P2 departs from the design as it is built, with measured results: M0's harness at scale (speed, fixed routes per sector, the weekly estimate, whole careers that retire and travel) and its exit run of 1,000 ten-year careers; M1's crags as data, mixed crags, per-crag gates, the test crag, data on arrival and the size gate, replay safety, saves carried forward, the ten traits and the Journal |

## Conventions

See [CLAUDE.md](CLAUDE.md) for the conventions future coding sessions follow. The short version: TypeScript strict, data-driven, seeded randomness everywhere, a pure simulation core that runs headless, and the docs are the source of truth.

## Licence

To be decided before any code is published. Design documents are © the repository owner; real crag and route names are used as geography only, and no real person appears as a character.
