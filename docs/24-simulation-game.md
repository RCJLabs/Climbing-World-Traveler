# 24 · The simulation game

**Decision (2026-10-02, the owner):** the climbing is simulated, not played. You build a climber, plan their training and their days, and every climb plays out by itself; the results are the game's output. The character builder, the training plan and the climber's progression are the main feature.

This doc is authoritative for how the game is played. It supersedes the player-input parts of [05b](05b-move-resolution-and-attempt-loop.md) (§7 previews as a decision aid, §8 the commit window as an input, §10 auto-climb hand-backs), [17](17-ui-ux.md) §2–§4 (the wall as an input surface), and all of [23](23-move-types-and-art-direction.md) except §4 (Flat Dusk, which stays the art direction for the app's screens; the wall is the cartoon of [25 §10](25-visual-representation.md) since 2026-10-03). The engine itself (05a, 05b's resolution, 05c, 06) is unchanged: with no player input it plays exactly as it did on Auto (§6).

Related: [02 Character Model](02-character-model.md) · [11 Time, Career and Aging](11-time-career-aging.md) · [12 Training and Adaptation](12-training-and-adaptation.md) · [19 Balance](19-balance-and-simulation-testing.md) · [schemas](schemas.md)

---

## 1. The loop

| Step | The player | The game |
|---|---|---|
| Build | Background, body, attributes, traits ([02](02-character-model.md)–[04](04-backgrounds.md)) | Starting estimate (05c) |
| Plan | The training week (§2); the projects to try, if they want to pick (§3.3) | Shows what the climber will actually do next, and why when it differs |
| Simulate | +1 day, +1 week, four weeks | Days play out by the plan; every attempt is simulated (§3) |
| Read | The report (§4), the climber sheet, the journal; an attempt on the wall (§5) | What was sent, what moved, what it cost |
| Adjust | The plan, the projects; the next climber's build | — |

The player's decisions are a coach's, not a climber's: what to train, when to rest, where to climb, what to try and how hard.

## 2. The week plan

`WeekPlan` ([schemas](schemas.md) §8) is part of the run and changes only through a `set_plan` action, so it is saved and replayed with everything else.

| Field | Meaning |
|---|---|
| `days[7]` | Each day's `main` block and an optional `extra` block. Day 0 of the run is the first day of the week; the screens call it Monday (the calendar has no weekdays, so this is a convention) |
| `PlanBlock` | `climb` with a session tactic (§3.2), `train` with an activity ([12](12-training-and-adaptation.md) §1), `rest`, `active_recovery`, `work` (odd jobs) |
| `extra` | Never `climb`: one session a day. Starts only with 50+ energy left (11 §1) |
| `wet_day` | `train` or `rest`, in place of a climbing block when every sector is wet |
| `auto_work` | Odd jobs take over when money is short (below) |
| `auto_rest` | Rest in place of climbing on worn skin or high burnout (below) |

### 2.1 The climber's own rules

Applied in this order to each block the plan asks for. **(tune)**

| Rule | When | Then |
|---|---|---|
| Broke | `auto_work` and money < 10 days of living costs | Every block is an odd job |
| Short | `auto_work` and money < 30 days of living costs | The second block, and a first block that is not climbing, is an odd job |
| Worn | `auto_rest` and skin < 35 or burnout > 60 | A climbing block is rest |
| Forced break | A burnout break is running ([11](11-time-career-aging.md)) | Climbing and training are rest |
| Wet | Every sector is shut ([10](10-weather-and-conditions.md)) | A climbing block is the plan's `wet_day` block |
| Cannot start | Not enough energy, skin or money for the block | A first block is rest; a second is dropped |

A climbing block goes to a sector with routes within the climber's reach if one is dry (its floor at or below the estimate, `SECTOR_REACH = 0`: a tufa cave starting at 6b+ is left to a climber who can warm up there, P1b **(tune)**), then to one not yet visited this week, rotating by day (the novelty rule of [12](12-training-and-adaptation.md) §7).

The plan never travels: a trip to another crag is the player's decision, taken on the Crag screen before the day's first block (`{ t: 'travel', to }`, [09 §7b.3](09-world-atlas.md)). The days on the move pass by themselves; the plan resumes at the destination.

### 2.2 The default week

| Mon | Tue | Wed | Thu | Fri | Sat | Sun | Wet day |
|---|---|---|---|---|---|---|---|
| Climb · mileage | Climb · project | Max hangs + Recover | Rest | Climb · mileage | Climb · project | Rest | Limit bouldering |

Odd jobs and rest on worn skin are on. **(tune)**

Over a year on 8 sampled builds (medians), against the harness bots on the same builds and seeds:

| Over 365 days | Default week | Bot, project | Bot, volume |
|---|---|---|---|
| Estimate gained (DI) | +4.4 | +4.5 | +4.3 |
| Hardest send (DI) | 17 | 18 | 18 |
| Climbing days | 147 | 203 | 203 |
| Training blocks | 99 | 80 | 87 |
| Odd jobs | 110 | 118 | 119 |
| Money left | $1,055 | $2,045 | $2,095 |
| Careers ended, burnout at day 365 | 0, 0 | 0, 0 | 0, 0 |

The week climbs less and trains more than the bots and ends about level on the estimate.

### 2.3 Simulating

| Control | Effect |
|---|---|
| +1 day, +1 week | Days by the plan, from wherever today stands (a half-done day finishes by the plan) |
| Simulate four weeks | 28 days |
| Stops early | When the run ends |

A simulated stretch is worked out on a copy of the state through the reducer, then written as one save transaction ([18](18-tech-architecture.md) §5): either all of it is saved or none. A four-week stretch takes about 0.35 s on a desktop browser.

## 3. The climber's tactics

### 3.1 On the wall

What 05b §10 called auto-climb's bot is now the whole attempt. The climber follows the problem's line (`beta_line`, [06](06-procedural-routes.md)):

| Situation | Step |
|---|---|
| Pump ≥ 35, the stance's shake value ≤ −1.5 pump and fewer than 3 shakes here | Shake ([05b](05b-move-resolution-and-attempt-loop.md) §6) |
| Chalk < 35 | Chalk (P1a also waited for pump < 60; on a route that left a pumped climber on dry hands, [26 §3](26-p1b-implementation-notes.md)) |
| The line's next hold not found yet | Look around once (a shake reveals what is in reach, 05b §13), then jump off |
| No legal move to the next hold, or the line has run out | Jump off |
| Otherwise | The line's next move, in its class or the easiest legal one |
| A dyno or deadpoint | Auto-commit (05b §8.4): caught at the apex with p = 0.25 + 0.25 × (commitment + dynamic movement) / 200, else caught; −0.1 margin tax |
| 120 steps without an end (1,500 on a rope) | Jump off or lower off (a guard; no line takes this many) |
| On a rope ([07 §2](07-disciplines.md), [26 §2](26-p1b-implementation-notes.md)) | Clip the anchor from the finish jug; clip the next bolt from the first stance it can be clipped from, unless a clearly better one is next and a fall from here is not bold; after a fall, a minute's hang and back on in working mode; while working, take at pump 85 and pull through on the draw after three falls on one move; lower off after six falls, a ground fall, or when spent |

Every roll comes from `stream(run_seed, route, attempt, move)` as before, so the same attempt from the same state plays out the same way.

### 3.2 In a session

| Tactic | Order after the warm-up (the easiest problem) | Leaves alone | Attempts per problem |
|---|---|---|---|
| Mileage (`volume`) | warm-up, mid, signature, push, known, project | above estimate + 1 | 2 |
| Project (`project`) | known, project, push, signature, mid, warm-up | above estimate + 4.5 | 5 (warm-up 1) |

A problem is left once it goes this session, or once it is sent for good (warm-ups excepted). The session ends when the climber is tired: energy < 22 or skin < 12. **(tune)** A first try is a flash on a signature problem (there is beta to watch) and an onsight elsewhere; later tries are redpoints.

On routes (P1b) a pitch costs about a fifth of a day's energy (`6 + 0.25 × metres climbed + 1 per fall`, [26 §5](26-p1b-implementation-notes.md)), so the tables change in one column: Project gives a route 3 attempts (warm-up 1), Mileage 1. A Project route more than 1.5 DI above the estimate that has never been tried gets a working first go (`work`, hanging on the rope to learn it, `WORK_FIRST_ABOVE`) instead of an onsight; later goes are redpoints. A session at a sport crag offers six routes (warm-up, two mid, two push, one project) instead of eight problems **(tune)**.

### 3.3 By hand

The player can still decide the session in detail. None of it touches a move.

| Choice | What happens |
|---|---|
| Try | One attempt in the chosen mode (onsight, flash, redpoint, work), watched or not (§5) |
| Siege | Up to 5 attempts on one problem, stopping at a send or when tired |
| Let the climber climb | The rest of the session by a tactic (§3.2), then the session ends |
| Today by hand | Choose the day's blocks yourself instead of the plan |

## 4. Results and progress

| Where | What |
|---|---|
| Report (after a session, a siege or a stretch of days) | Grade estimate before → after; hardest send; sends of attempts; money; the best new ticks; every attempt of a session with how it ended; attributes that moved (largest first); journal entries |
| Climber sheet | The estimate and hardest send by week (a chart); each attribute's change over the last four weeks; tendon gains still arriving |
| Journal | New hardest sends, long projects done, burnout, money, birthdays |

A `WeekPoint` ([schemas](schemas.md) §8) is written at creation and at every week boundary: the day, the estimate from the latest session, the hardest send, the tick count and every attribute's value. The estimate comes from the session's start (05c), so recording it costs nothing extra.

## 5. Watching

| Setting | Effect |
|---|---|
| Single attempts: Watch on the wall | A *Try* plays the attempt back on the cartoon wall ([25 §10](25-visual-representation.md)), then the result |
| Single attempts: Result only | Straight to the result |
| Playback speed | 1×, 2×, 4×; at 1× each step plays for its move's own time, 480 ms (a foot) to 1150 ms (a dyno), and holds 250 ms ([25 §10.5](25-visual-representation.md)) **(tune)** |
| Reduced motion | Result only |

The frames are taken by running the same simulation on the very state the attempt is applied to, so the playback is the attempt, not an illustration of it. The wall shows the meters, the fear sources and the climber's running commentary; pinch and drag move the camera; nothing on it changes the climb. Sieges and whole sessions are not played back: their attempts are listed in the report.

How the playback looks: [25](25-visual-representation.md) compared ten styles on one simulated attempt, and the owner chose the cartoon (2026-10-03). Each problem is drawn as a cartoon of its own block from its data, and each move class, slip and ending has its own animation ([25 §10](25-visual-representation.md)).

## 6. What changed

| Was | Now |
|---|---|
| Actions `attempt_start`, `move` (with Reach or Balance perf), `commit` (with a swing), `wall_action`, `settings` | `attempt` (a whole simulated attempt) and `set_plan` |
| `RunOptions` `auto_commit`, `sweep_speed`, `pause_drift` | Removed |
| Reach, Balance, Swing and Catch inputs ([23](23-move-types-and-art-direction.md) §2–§3) | Removed from the engine and the screens |
| A dyno waiting for its swing (`pending`) | Resolves at once by Auto-commit |
| Auto-climb and its hand-back reasons | Removed: the climber never hands back |
| C8 skill share ([19](19-balance-and-simulation-testing.md) §5) | Retired: there is no player input to measure |
| Harness player-skill models, playtest stats, the dyno prototype | Removed |
| Dyno Monkey's `commit_window_width` flag | Retired; the trait keeps its attribute and move bonuses |
| `DATA_VERSION` p1a-12 | p1a-13: runs saved before stay listed but cannot continue |

**Equivalence, measured:** with no player input the new code plays bit-identically to the old Auto paths. Six bot careers of 365 days each (ticks, attributes, resources, projects, move counts) and `pnpm calibrate --quick` (C1–C9) match the code before the change exactly.

---

## Open questions

1. **Real-world climbs.** The only real climbs in the data are Font's three signature problems and the Grande Grotta's three signature routes ([26 §8.3](26-p1b-implementation-notes.md)); every other problem is generated with a made-up name. A catalogue of real climbs (name, sector, grade, style) needs sourcing before it goes in, and other crags need P2 travel.
2. **Tactics from the build.** The climber's tactics are one fixed policy for everyone. Attributes and traits could shape them: risk judgement deciding when to jump off, Projector or Patient raising tries per problem, route reading finding the line on an onsight. Each changes outcomes, so each needs harness runs.
3. **Trait costs.** Traits whose value sat partly in the input layer (Dyno Monkey's wider catch) may now be over-costed. Re-cost with the harness (03 §1.5).
4. **The default week** matches the bots over one year (§2.2) on 8 builds. Five years and the harness's 40-build sample are not measured: add a `--policy plan` to `pnpm harness` (19 open questions).
5. **Highlights.** Sessions and sieges show no playback. A highlight (the send, or the high point of the day) may be worth adding.
6. **Speed on a phone.** Measure a four-week stretch on a low-end Android before raising the stretch length.
7. **Today by hand** duplicates the plan; keep it only if playtests show players use it.
