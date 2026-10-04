# CLAUDE.md — conventions for this repository

This repo is a climbing career simulation (build a climber, plan the training, and the climbing plays out by itself on a 2D side-view wall, hold to hold; career runs with meta-unlocks; real crags, fictional people; `docs/24`). P1a (the Fontainebleau slice) is implemented: `src/sim` (pure engine and run reducer), `src/save`, `src/ui`, `src/harness`, `scripts/`. P1b (Kalymnos sport) is under way: its engine is in (`src/sim/rope.ts`, the sport generator, routes in the grade engine) and Kalymnos is in the game (`src/sim/travel.ts`, sport sessions in `src/sim/tactics.ts`), with pitches on the cartoon wall (`src/ui/wall/pitch.ts`), the P1b traits and the Grande Grotta signatures (`scripts/build-sport-signatures.ts`). Read `README.md` for the doc index and commands, `docs/01-pillars-scope-roadmap.md` for the phases, and `docs/22-p1a-implementation-notes.md` and `docs/26-p1b-implementation-notes.md` for where the code departs from the design and why.

## Source of truth

- The design docs in `docs/` are authoritative. If code and docs disagree, fix one deliberately and say which in the commit message.
- `docs/schemas.md` is the only place identifiers are defined: attribute ids, hold types, move classes, tags, rock types, save-game actions. Never invent a new identifier inline; add it to `schemas.md` first.
- Numbers marked `(tune)` in the docs are design proposals. Changing them is expected; changing them without running the harness (`docs/19`) is not.

## Stack and style

- Vite + TypeScript with `strict: true`. No `any` outside a justified `// eslint-disable` line.
- UI in Preact with signals. Wall rendering in Canvas2D. No framework for the simulation core.
- `sim/` is a pure module: no DOM, no timers, no `Math.random`, no `Date.now`. It must run headless under Vitest and in the balance harness.
- All randomness goes through the seeded PRNG in `sim/rng` using purpose-named streams (see `docs/18`). Seeds for on-wall rolls derive from `(run_seed, route, attempt, moveIndex)` so reloading never re-rolls.
- Saves are event-sourced: seed plus action log plus snapshots (`docs/schemas.md §8`). Any state change must be expressible as an `Action`.
- Data lives in `data/*.json`, validated by Zod schemas that mirror `docs/schemas.md`. Run the validator before committing data changes (`docs/20`).
- Mobile-first portrait layout; everything works with one thumb. There is no input on the wall: every attempt is simulated by the climber's own tactics (`docs/24` §3), and the wall only plays attempts back.
- Offline-first PWA via `vite-plugin-pwa`; deploy to GitHub Pages via Actions; package for Play with Bubblewrap (check the current `targetSdk` requirement before each release).

## Content rules

- Real crags and real route names are allowed as geography. No real person, living or dead, appears as a character, rival, mentor, sponsor or first-ascensionist. The validator keeps a blocklist.
- No runtime generative or network-dependent content. Everything is authored or procedurally generated from authored data.
- Death exists only on `deadly` routes or alpine objective hazard and only when `death_enabled`; never glamorise it in copy.

## Working in this repo

- Branch per task; small commits with a one-line summary and a body explaining why.
- Before pushing: `pnpm typecheck && pnpm test && pnpm validate && pnpm calibrate --quick` (CI runs the same, then `pnpm build` and the size gate, `pnpm size`).
- Before claiming a balance change works, show harness output (`docs/19`): `pnpm calibrate` for grades, `pnpm harness` for careers.
- After any change to the route generator or the grade engine, rebuild the benchmark set with `pnpm benchmarks` and check `pnpm calibrate`.
- Prefer tables and formulas over prose in docs. Every doc ends with `## Open questions`.
- Do not put model names or tool attributions into docs, code comments or data files.
- Adding content: follow `docs/20-content-pipeline.md` step by step; add a validator test for any new schema rule.
