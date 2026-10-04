# Pillars, Scope and Roadmap

This document fixes what the game is optimising for, what is in and out, and in what order it gets built. When two docs disagree, the pillars decide. When the schedule slips, the cut lines decide.

Related: [00 Vision](00-vision.md) · [18 Tech Architecture](18-tech-architecture.md) · [19 Balance and Simulation Testing](19-balance-and-simulation-testing.md)

---

## 1. Pillars

1. **Builds are destiny.** Every Body slider, attribute point and trait must be felt on the wall and in the career. If a trait cannot be seen in the harness output, it is cut or re-costed. Two different builds on the same route must produce visibly different attempts.
2. **Real-world fidelity.** Crags, rock, weather, grades, training adaptation, injury timelines and climbing culture follow the sourced research in the plan appendix. Where the research is silent we make a design choice and label it `(tune)`.
3. **Runs tell stories.** A career has a beginning, a peak, setbacks and an end. The game records and retells it: tick lists, injuries, partners, places, the one that got away. Retired climbers persist as NPCs.
4. **Readable results.** Every climb is simulated hold to hold, and every result has a reason you can see: why the move went, why the climber was pumped, what the fall cost. The player plans and the climber climbs ([24](24-simulation-game.md)).

### Tie-breakers
When pillars conflict: fidelity yields to readability on the wall; readability yields to builds mattering; story never overrides the other three but is the reason they exist.

---

## 2. Locked design decisions

| Decision | Choice | Why |
|---|---|---|
| Moment-to-moment climbing | 2D side-view, hold-to-hold, simulated by the climber's own tactics; any attempt can be watched ([24](24-simulation-game.md)) | Builds decide outcomes; phone-friendly; deterministic and testable |
| Player input on the wall | None. Dynos resolve by Auto-commit (05b §8.4) | The build and the plan are the game (decided 2026-10-02, replacing the commit window and the per-move controls of 23) |
| Climber representation | Four limb anchors + centre of mass, two-bone IK pose, no ragdoll | Avoids the ragdoll tuning sink |
| Difficulty | One `MoveDifficulty` function shared by resolution and grading, calibrated to a Reference Climber | Generated grades stay honest |
| Content scaling | Procedural routes from crag style profiles plus a few signature routes per crag | Content is data, not hand-drawn walls |
| Run structure | Career runs with meta-unlocks | Replay pressure; the Zomboid feel |
| Death | Possible only on `deadly` routes or objective hazard, and only when enabled in run options | Stakes in the mountains without punishing the sport climber |
| Names | Real crags and routes; all people fictional | Geography is public knowledge; likeness is not |
| Platform | Offline-first PWA on GitHub Pages; TWA on Google Play | Same pipeline as the developer's other apps |
| Tooling | Plain Vite repository, no hosted app builder; no runtime generative systems | Determinism, offline play, and a codebase the developer owns end to end |

### Why a previously considered build tool was dropped
Early exploration considered generating the app in a hosted vibe-coding studio. It was dropped because the environment caps projects at roughly 100 files, does not compact long conversations (so a large data-driven game burns quota and loses context), and exports a key-proxy server that static hosting would have to rework. None of that is a problem for a plain Vite project built here.

---

## 3. Non-goals

- Multiplayer, leaderboards that need a server, or any online dependency beyond the initial load.
- A physics engine, ragdolls, 3D, and input on the wall of any kind ([24](24-simulation-game.md); the per-move controls of [23](23-move-types-and-art-direction.md) were built and then retired).
- Real climbers as characters, or licensed brands.
- A route editor for players in the first release (the content pipeline is for the developer; a player editor is a P5 consideration).
- Speed climbing as a core mode (it is a comp sub-format at best).

---

## 4. Roadmap with cut lines

Each phase ships something playable or measurable. A phase is done when its exit criterion passes, not when its feature list is exhausted.

### P0 — Design (this document set)
All docs in `docs/` written, cross-linked and consistent with [schemas.md](schemas.md). Exit: the verification list in the approved plan passes.

### P1a — Fontainebleau slice
**Status:** implemented on the P1a branch; measured results and deviations in [22](22-p1a-implementation-notes.md).
**In:** character creation with full Body sliders, attribute allocation and ~40 P1a-live traits across 5 backgrounds; Fontainebleau only, with circuits and 6–8 named areas; procedural boulders plus 3 signature problems; the turn-based engine with reach envelope, matrix resolution, pump/power/skin/fear meters, simulated attempts with Auto-commit, a week plan and simulated days ([24](24-simulation-game.md)); sessions and days; friction as a seeded daily scalar; a fixed daily-cost money stub; headless harness and grade calibration; event-sourced saves; run end by voluntary retirement or skin/energy exhaustion loop, with one meta unlock.
**Out:** travel, other crags, injuries beyond skin, NPCs beyond a default spotter stub, events, sponsorship, full weather.
**Exit criterion:** two different builds (a Slab Wizard preset and a Compression Monster preset) produce visibly different outcomes on the same Font 6B+ problem within a 20-minute phone session, and the harness reports generated boulders within ±1 DI of target at ≥ 90%.

### P1b — Kalymnos sport
**In:** rope, bolts, clipping stances and clip costs, aerobic reserve and rest loop on 25–35 m routes, falls on rope with belayer quality, redpoint/onsight/flash/working-mode rules, route familiarity, stick-clip.
**Exit criterion:** an endurance build and a power build swap places in the harness send-rate ranking between a 20-move Font problem and a 35 m Kalymnos tufa pitch of equal DI.
**Status:** M1, the sport engine, is implemented and the exit criterion holds in calibration test C10, on Font problems of the generator's normal length rather than 20 moves. M2 brings Kalymnos into the game: travel between the two crags, sport sessions and tactics, the grey-wall profile, limestone wet rules and the Rower/Swimmer background. M3 puts the pitch on the cartoon wall: the cliff, the rope, quickdraws, the belayer, clipping, catches and lowering. M4 brings the P1b content: the P1b traits, with every trait effect read by the engine or known to wait for a later phase, and the Grande Grotta's signature routes Priapos, DNA and Aegialis ([26](26-p1b-implementation-notes.md)). After M4, evolving traits and a first re-costing of every live trait over whole careers ([26 §10–11](26-p1b-implementation-notes.md)). P1b's scope is implemented and its exit criterion holds.

### P2 — World
**Plan:** [27](27-p2-plan.md): ten milestones in two parts, each with its own release: the harness first, then the systems at Font and Kalymnos, then the atlas. Decided: 32 live crags in P2 (09 tags 30 rows P2), with every later crag added as data alone; an exit run of 2,000 ten-year careers, with 10,000 run nightly once the harness is fast enough; and runs saved from milestone M2 on carried across later releases rather than orphaned.

#### P2a — Systems (27 M0–M5)
**Status:** M0, the harness at scale, is implemented ([28 §1](28-p2-implementation-notes.md)): fixed routes per sector and a weekly estimate (06 §5), whole careers that retire and travel, and the game's default week as a harness policy. Its exit run of 1,000 ten-year careers took 2 h 36 min on 4 workers, against a 2-hour target.
**In:** the harness at scale (ten-year careers, run ends, money curves); groundwork for more crags (a folder per crag loaded on arrival, crags with boulders and routes, save adapters); injuries and health care; the full training and adaptation model; aging and all run-end conditions; economy, work and gear; seasons and the full climate model; the traits these systems make live. All at Fontainebleau and Kalymnos.
**Exit criterion:** 2,000 ten-year careers at Font and Kalymnos show run lengths, run-end shares, injury rates, money curves and grade distributions within the target bands in [19](19-balance-and-simulation-testing.md) and [27 §5–6](27-p2-plan.md), and a run saved at M2 continues in the P2a release.

#### P2b — World (27 M6–M9)
**In:** the atlas of 32 live crags (≥ 50 once P3 and P4 bring theirs), travel graph with cost and time, visas and permits, NPC lifecycle and partners, the event deck, sponsorship, hidden traits, the remaining P2 traits and backgrounds.
**Exit criterion:** 2,000 ten-year careers across the atlas show run lengths, injury rates and grade distributions within the target bands in [19](19-balance-and-simulation-testing.md), and no trait outside the 5–60% pick-rate window.

### P3 — Disciplines
**In:** trad with gear placement and the danger axis in play; multipitch and big wall with the pitch sampler and logistics; DWS; competitions (boulder and lead formats, isolation, finals).
**Exit criterion:** each discipline has at least 3 crags live and a distinct dominant-attribute signature in the harness.

### P4 — Mountains
**In:** alpine with objective hazard, weather windows, acclimatisation and retreat decisions; ice and mixed with tool and screw placement and temperature-dependent ice; death when enabled.
**Exit criterion:** alpine objectives show a measurable judgement signature (risk_judgement and composure separate outcomes more than finger_strength does).

### P5 — Meta
**In:** scenarios (big-wall siege, 1970s dirtbag era, comp season), legacy NPCs, Hall of Fame, daily seeds, cosmetics.

---

## 5. Implementation order (not doc order)

```
18 tech skeleton → 02 character data → 05a wall/kinematics → 05c grade engine + 06 generator
→ 05b resolution + attempt loop → 17 wall UI → 03 traits (P1a subset) → 19 harness → P1a exit test
```
The grade engine and generator come before the attempt loop on purpose: the engine needs routes to resolve, and the generator needs the grade engine to accept them. Both use the same `MoveDifficulty` function, so it is written once, first.

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Engine does not feel like climbing | Medium | Fatal | P1a exit test is a feel test on a phone; worked examples in [05b](05b-move-resolution-and-attempt-loop.md) are built before code; auto-climb keeps long routes short |
| Procedural walls read as noise | Medium | High | Features-first generation, hold-density cap, legibility metric in [06](06-procedural-routes.md) |
| Trait costs exploitable | High | Medium | No ±1 traits, negative caps, phase-gating, harness re-costing in [03](03-traits.md) and [19](19-balance-and-simulation-testing.md) |
| Content volume overwhelms one developer | High | High | Atlas is data; routes are generated; events are a schema plus ten written examples; everything else is phased |
| Grade engine drifts from resolution | Medium | High | Single shared function; calibration tests in CI |
| Low-end Android performance | Medium | Medium | Canvas2D, bundle and frame budgets in [18](18-tech-architecture.md) |
| Play Store targetSdk churn | Certain | Low | Checked at each TWA release; noted in 18 |
| With no input on the wall the game feels passive | Medium | High | The plan, the projects and the build carry the decisions; any attempt can be watched; reports say why ([24](24-simulation-game.md)) |
| Real-name sensitivity | Low | Medium | Validator rejects real climbers' names; routes and crags only |

---

## 7. Success measures for the shipped game

- A new player creates a climber and tops a Font 5 within 10 minutes without reading help.
- A climber can explain, after one session, why their build failed a specific move.
- Median run length 3–8 in-game years; 10% of runs end by injury, under 3% by death with death enabled.
- At least 20 named archetypes appear in the top-100 harness builds, with no archetype above 25% share.

## Open questions

- Whether P1a ships publicly as an itch-style preview or stays private until P1b. Recommendation: private until P1b, because sport climbing is where the rest and fear systems become visible.
- Whether the daily-seed mode belongs in P2 rather than P5 (it is cheap once saves are event-sourced).
