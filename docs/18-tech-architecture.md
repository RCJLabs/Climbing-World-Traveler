# Technical Architecture

A solo developer ships this as a static web app: a PWA on GitHub Pages and the same build wrapped as a Trusted Web Activity for Google Play. The architecture has one organising rule: the simulation is a pure, deterministic, headless TypeScript library, and everything else (rendering, UI, storage, the balance harness) is a client of it. This doc fixes the stack, the randomness model, the save format, the module layout, performance budgets and the testing stack. No part of the game calls a network service at runtime.

Related: [schemas](schemas.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [17 UI/UX](17-ui-ux.md) · [19 Balance and Simulation Testing](19-balance-and-simulation-testing.md) · [20 Content Pipeline](20-content-pipeline.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite, TypeScript `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` | Fast dev loop, trivial static output, first-class PWA plugin |
| UI | **Preact + `@preact/signals`** | ~4 kB runtime plus ~2 kB signals; fine-grained reactivity without a compiler step; JSX and TypeScript inference are plain and well understood; sim state exposes signals directly. Svelte 5 was the alternative: comparable size and ergonomics, but its component language adds a compiler layer between TypeScript and the DOM, canvas interop is less direct, and type-checking across component boundaries needs extra tooling. One language (TS) end to end wins for a solo project. |
| Wall renderer | **Canvas2D** behind a `Renderer` interface | Holds, rig and envelopes are a few hundred shapes; Canvas2D handles that at 60 fps on budget phones. **PixiJS trigger:** adopt only if p95 frame time on the reference device (§7) exceeds 16 ms with 150 holds, envelope shading and zoom, after the Canvas2D fast paths (dirty rects, cached hold sprites) are in. |
| Data validation | Zod schemas in `src/data/schema/*` mirroring [schemas.md](schemas.md) one-to-one | JSON content validated at build time by the validator and at load time in dev builds; prod builds skip parsing cost and trust the build |
| Storage | IndexedDB via the `idb` wrapper | Action logs grow beyond localStorage comfort; transactions |
| PWA | `vite-plugin-pwa` (injectManifest) | Offline-first precache of app shell and data JSON |
| Hosting | GitHub Pages via GitHub Actions | Static, free, matches existing apps |
| Android | Bubblewrap TWA | Same build, Play distribution |
| Tests | Vitest (sim, data), Playwright (UI smoke) | §8 |
| Package manager | pnpm | Lockfile determinism, fast CI |

---

## 2. Module layout

```
Climbing-World-Traveler/
├─ data/                      content JSON (crags, routes, traits, backgrounds, events, style profiles) — see 20
├─ docs/
├─ scripts/
│  ├─ validate.ts             content validator (schemas §9 rules)
│  └─ harness.ts              CLI entry for the balance harness (19)
├─ src/
│  ├─ sim/                    PURE. No DOM, no timers, no Math.random, no imports from ui/ render/ save/
│  │  ├─ rng/                 sfc32, stream derivation, hashing
│  │  ├─ character/           Body, Attributes, derived stats, age curves (02)
│  │  ├─ wall/                reach envelope, posture, IK pose (05a)
│  │  ├─ attempt/             move classification, resolution, Auto-commit, pump/fear, the simulated attempt (05b, 24)
│  │  ├─ grade/               reference climber, DI grading (05c)
│  │  ├─ routes/              procedural generation (06)
│  │  ├─ world/               weather, seasons, travel (09, 10)
│  │  ├─ career/              day loop, training, injury, economy, NPCs, events (11–15)
│  │  ├─ reducer/             versioned reducers: (WorldState, Action) → WorldState
│  │  └─ index.ts             public API: createRun, step, replay, selectors
│  ├─ data/                   loaders, Zod schemas, typed accessors, lazy chunk manifest
│  ├─ render/                 Canvas2D wall renderer, sprite cache, hit-testing
│  ├─ ui/                     Preact screens and components (17), signals store, routing
│  ├─ save/                   IndexedDB repository, snapshots, migrations, export/import
│  ├─ harness/                scripted policies, metrics, report writers (19); node-only
│  ├─ pwa/                    service worker source, update prompt
│  └─ main.tsx
├─ tests/
│  ├─ sim/                    Vitest unit and property tests
│  ├─ golden/                 snapshot fixtures (routes, careers)
│  └─ e2e/                    Playwright smoke
└─ .github/workflows/         ci.yml, deploy.yml
```

An ESLint boundary rule (`no-restricted-imports`) enforces that `src/sim` imports nothing outside `src/sim` and `src/data/schema` types, and that `Math.random`, `Date.now` and `performance.now` are banned inside `src/sim`. Time enters the sim only as actions.

---

## 3. Simulation core

- **State:** `WorldState` (materialised in `SaveGame.snapshot`) holds the player `Climber`, persistent NPCs, visited-crag state (hold wear, chalk), weather history, the calendar, event cooldowns and the per-stream RNG counters.
- **Step function:** `reduce(state, action, data) → state`, pure and total. Every player intent in [schemas §8](schemas.md) (`Action` union) is one call. Sub-steps inside a day (weather roll, NPC progression, event candidates) are derived deterministically from the state and the action index, never from wall-clock time.
- **Selectors** compute view models (reach envelope, previews, estimated grades) without mutating state; the UI calls them through signals.
- **Headless:** `src/sim` runs under Node for the harness and tests with the same bundle of data JSON. A career of 10 sim years is roughly 7,300 `day_plan` actions plus attempts; the budget is ≤ 2 s per career in Node (§7).

---

## 4. Randomness

- **Generator:** **sfc32** (128-bit state, 32-bit output, period ≈ 2¹²⁸, passes PractRand to the sizes relevant here, four multiply-free lines of code). xoshiro128** was the alternative; sfc32 is chosen for its simpler seeding and equal quality at this scale.
- **Seeding and streams:** cyrb53 (a 53-bit string hash) run twice with different salts folds `run_seed`, a purpose string and the contextual integers into four 32-bit words; the generator is then warmed 12 rounds. Streams exist per purpose so that consuming randomness in one system never shifts another: `route_gen`, `weather`, `events`, `npc`, `injury`, `move`, `commit`, `name_gen`.
- **Anti save-scumming:** the move stream for a given roll is seeded as `hash(run_seed, 'move', route_id, attempt_index, move_index)`. Reloading and re-choosing the same move draws the same number; choosing a different hold changes the move, not the dice; identical repeated actions never redraw ([05b](05b-move-resolution-and-attempt-loop.md)). The commit outcome depends on the recorded `tap_offset_ms`, so it is reproducible by definition. Weather for a day is `hash(run_seed, 'weather', crag, day)`, routes `hash(run_seed, 'route_gen', crag, date, slot)` ([06](06-procedural-routes.md)).
- **Counters** for streams that must advance across calls (NPC progression, events) are stored in `WorldState` so a snapshot resumes exactly where the log left off.

---

## 5. Saves

**Event-sourced.** `SaveGame = { version, run_seed, created, actions, snapshot?, snapshot_action_index? }`. The action log is the canonical artifact; the snapshot is a cache.

| Store (IndexedDB) | Key | Content |
|---|---|---|
| `runs` | run id | `{ version, run_seed, created, data_version, title, last_played, summary? }` |
| `actions` | `[run id, chunk index]` | arrays of ≤ 500 `Action` each, append-only |
| `snapshots` | `[run id, action index]` | `WorldState`, written every 200 actions and at every day boundary; the two newest kept |
| `meta` | `'meta'` | unlocks, Hall of Fame, legacies, pyramid (`MetaState`, proposed in [16](16-meta-progression-and-runs.md)) |
| `settings` | `'settings'` | device-level preferences (theme, haptics, left-handed) |

- **Write path:** every action is appended in the same transaction that updates the in-memory state; the UI never shows a state that is not on disk. Target ≤ 50 ms per write on the reference device.
- **Load path:** newest snapshot plus replay of the action tail; cold load of a 10-year run is bounded by one chunk of replay.
- **Simulated attempts** are one action each (`{ t: 'attempt', route_seed, mode }`, [24](24-simulation-game.md)); the reducer plays the whole attempt from seeded streams, so replay reproduces it move for move. A simulated stretch of days is written as one transaction.
- **Migrations by replay.** `SaveGame.version` names the reducer version that wrote the log. On version bump, snapshots are discarded and the whole log is replayed through the current reducer, with per-version **action adapters** (`adaptAction_v1_to_v2`) rewriting old action shapes. Data JSON is versioned too (`data_version` on the run record) and old data versions are kept in the bundle for one release cycle so replays of old runs stay faithful; after that a run is migrated by re-grading its routes and flagged in the journal.
- **P2: adapters, decided ([27 §4](27-p2-plan.md)).** P1 kept no old versions: a run from another reducer or data version stays listed and cannot continue ([22 §4](22-p1a-implementation-notes.md)). From P2's M2 on, a run is carried across releases by *rebasing* it, not by replaying its whole log: it records a content hash for each crag whose data it has loaded, and when the reducer or one of those crags changes, its newest snapshot passes through one state adapter per version step (`adaptState_v8_to_v9`) and becomes the run's base, from which the log continues. A crag added as data changes no hash a run holds, so the run needs no adapter. This replaces the full-log replay above, which can make a logged action invalid under new rules, and keeping old data versions in the bundle.
- **Resume.** An attempt is decided before its playback starts, so a killed tab never loses or repeats one: on reload the attempt is in the log and the result is shown.
- **Export/import:** a run exports as a gzipped JSON file (`.cwt.json.gz`) for backup and bug reports; import validates with Zod and replays.

---

## 6. PWA, deploy, TWA

- **Service worker** (`vite-plugin-pwa`, injectManifest): precache the app shell and the P1a data chunk; `CacheFirst` with versioned filenames for all data JSON (immutable, content-hashed), `StaleWhileRevalidate` for fonts, `NetworkFirst` only for the update manifest. Offline-first means a crag can be played with no signal; data chunks for other regions are fetched lazily and cached when visited on the map with a connection, with a "download region" button.
- **Updates:** a new service worker activates as soon as it installs (`skipWaiting`, `clientsClaim`), so a version never waits for every tab and the installed app to close. The app checks on every launch and whenever it returns to the foreground, then reloads into the new version at once, unless an attempt is in progress: then a bar offers the reload, so an attempt is never interrupted. The title screen shows the build (commit and date).
- **GitHub Actions:** `ci.yml` on every push and PR runs validate, lint, typecheck, Vitest, harness smoke (100 careers) and bundle-size check; `deploy.yml` on `main` builds with `base: '/Climbing-World-Traveler/'` and publishes with `actions/upload-pages-artifact` + `actions/deploy-pages`. The `404.html` copies `index.html` for client routing.
- **TWA:** Bubblewrap generates the Android project from the web manifest; `/.well-known/assetlinks.json` is served from Pages with the signing fingerprint; the manifest declares `display: standalone`, portrait orientation, maskable icons and a theme colour. **Check the current Play `targetSdk` requirement at each release** and update Bubblewrap and Android Browser Helper to match; Play raises the floor roughly yearly and a stale target blocks updates. Keep a `release-checklist.md` in the repo with the current value.

---

## 7. Performance budgets (low-end Android)

Reference device: a 2019–2020 budget Android phone, 2–3 GB RAM, Snapdragon 4xx-class, Chrome stable, 360 × 780 dp viewport, tested over throttled "Fast 3G".

| Budget | Target |
|---|---|
| Frame time during wall interaction | p95 ≤ 16 ms; idle ≤ 4 ms (no continuous redraw) |
| Commit-window sweep jitter | marker position error ≤ 8 ms; timing uses `requestAnimationFrame` timestamps, tap uses `pointerdown` with `event.timeStamp` |
| JS heap | ≤ 150 MB during an attempt |
| Initial JS (gzip) | ≤ 250 kB; total initial transfer incl. P1a data ≤ 600 kB |
| Time to interactive | ≤ 3 s on Fast 3G cold, ≤ 1 s warm from cache |
| Data JSON | ≤ 150 kB per crag chunk; atlas index ≤ 60 kB; whole atlas ≤ 3 MB lazily |
| Save write | ≤ 50 ms per action |
| Replay | 10,000 actions ≤ 2 s on device, ≤ 0.5 s in Node |
| Harness | 10,000 ten-year careers ≤ 30 min on a laptop, parallel over worker threads |

CI fails on bundle-size regression (`size-limit`), and a Lighthouse run on the deployed preview is recorded per release.

---

## 8. Testing stack

- **Vitest, `tests/sim`:** unit tests for every formula in 02/05b/05c with the worked examples as fixtures; property tests (fast-check) for invariants (margin monotonic in attributes, pump never negative, reach envelope symmetric under mirroring); determinism tests (same seed + log → identical state hash across Node and browser builds); reducer migration tests replaying archived logs from each schema version.
- **Golden snapshots, `tests/golden`:** a fixed set of seeds generates routes and 50-day careers whose JSON is committed; a diff fails CI unless the commit is tagged `balance:` and the harness report is attached.
- **Playwright, `tests/e2e`:** mobile viewport smoke: create a Quick-build climber, simulate a week, edit a plan day, try one problem and watch it, let the climber finish a session, reload, confirm the run continues; offline mode loads the app shell.
- **Harness as test:** the calibration and timing-variance thresholds in [19](19-balance-and-simulation-testing.md) run as CI gates on a reduced sample (1,000 careers) and in full on a nightly workflow.

---

## Open questions / proposed schema additions

- `SaveGame` lacks `data_version`; add `data_version: string` so replay can select the content bundle that produced the run.
- `Action` has no `t: 'meta'` for actions that do not belong to a run (claiming unlocks, deleting legacies); keep meta mutations outside the run log, in the `meta` store, as this doc assumes.
- Whether to ship a Web Worker for the reducer so long replays and procedural generation never block the main thread; recommended from P1b, with the same pure API behind `postMessage`.
- Cross-device sync is a non-goal; export/import is the only transfer path unless a later phase adds a user-controlled file sync.
