# P1b Implementation Notes

What the Kalymnos sport phase implements where it departs from, or fills a gap in, the design set, and how it resolves the places where the design docs disagree with each other. Each row names the doc it amends. When a later phase revisits a topic, update the owning doc and delete the row here. [22](22-p1a-implementation-notes.md) keeps the same record for P1a.

Related: [01 §4 P1b](01-pillars-scope-roadmap.md) · [05b](05b-move-resolution-and-attempt-loop.md) · [07 §2](07-disciplines.md) · [19](19-balance-and-simulation-testing.md)

Numbers marked **(tune)** are harness-adjustable, as everywhere else.

---

## 0. Status

P1b ships in four milestones, each its own pull request:

| Milestone | Scope | State |
|---|---|---|
| M1 Sport engine | rope, bolts, clipping, falls on the rope, working a route, the sport generator, the grade engine on routes, French grades, calibration and the exit test, all headless | this document |
| M2 Kalymnos in the game | sessions at Kalymnos, travel between the two crags, sport session tactics, the `rower_swimmer` background, limestone wet rules, French grades on the screens, a grey-wall profile for the low grades | next |
| M3 Watching a pitch | the cartoon wall with the cliff, the rope, quickdraws, the belayer, clipping, catches and lowering ([25](25-visual-representation.md)) | — |
| M4 Content | the P1b traits and Kalymnos signature routes | — |

After M1, Kalymnos is in the data and its routes generate, grade and climb, but no run can travel there yet, and the wall plays a rope attempt with the boulder animations.

## 1. Design conflicts and how they are resolved

Where 05b and 07 disagree, 05b wins, because it is the engine contract; belay slack follows 15, because slack belongs to the belayer.

| Topic | The docs say | Implemented | Why |
|---|---|---|---|
| Clip cost | 05b §1: `6 − 0.03 × rope_craft` s and `2.0 × pc × angle_pump × (1.2 − 0.4 × rope_craft/100)` pump. 07 §2.1: 6–10 s and `4 − 0.03 × rope_craft` pump | 05b | its pump depends on the hold clipped from, which is what makes the clipping stance a decision |
| Slack | 05b §11: `1.5 × (1.2 − 0.4 × rope_craft/100)` (the climber's). 07 §2.1: 1–2 m by belay quality. 15 §2.3: belay quality | `slack = 0.3 + 1.2 × (1 − belay_quality/100)` m | 15 |
| Lead fear | 05b §9.1: `+7 × (1 − min(1, rope_falls_logged/60))`. 07 §2.6: composure shrinking it to zero above 70 | 05b | one formula; composure already calms fear on every clean move |
| Height fear on a rope | 05b §9.1: `+1` per metre of potential fall beyond 4 m. 07 §2.6: `+1` per 5 m | 05b | — |
| Fear after a rope fall | 05b §11: `+8` "last fall"; 05b §9.1: `+2`, decaying per attempt | both: `+8` inside the attempt, `+2` carried to the next attempt on the route | they describe different moments |
| Take | 05b §1: pump `× 0.4` after a 60 s hang. 07 §2.2: pump recovers at 3× the on-hold rate | 05b: 60 s, pump `× 0.4`, power back to full, reserve drains | — |
| Route familiarity | 05b §12.2: `k = 0.25` per attempt. 07 §2.2: `k = 0.2` per bolt-to-bolt section worked | 05b, with a working attempt counting 1.5 (`attempt_eq`) | sections are not tracked |
| Aerobic reserve at the start | 02 §D: `aerobic_capacity`. 05b §6's worked example: reserve 85 for a climber with capacity 46.4 | `reserve0 = 50 + 0.5 × aerobic_capacity` **(tune)** | at `aerobic_capacity`, `R10` counted the attribute twice (`capacity × √capacity`) and a 7a climber's reserve was empty six minutes up a 30 m route. The formula keeps capacity setting the reserve's size, at the worked example's magnitude |
| Energy per attempt | 05b §12.3: `4 + 0.1 × moves` on a route. 07 §2.3: `6 + 0.25 × length_m` | the P1a rule, `1.5 + 0.1 × moves`, for now | the session economy of routes is M2's |
| Exit test | 01 §4: "a 20-move Font problem" | Font problems of equal DI from the normal generator | Font lines have 3–8 hand moves (p10–p90, 22 §5); no Font profile produces a 20-move problem |

## 2. The rope in the engine (`src/sim/rope.ts`, `src/sim/attempt.ts`)

Everything here is a climber tactic ([24](24-simulation-game.md) §3), shared by play and the grade engine wherever grading needs it.

| Topic | Implemented | Amends |
|---|---|---|
| Discipline | a route is roped when `discipline = 'sport'`; trad and the rest come in P3 | [07 §2](07-disciplines.md) |
| Belayer | no partners yet: every rope attempt is held by the 15 §1.4 stub at `belay_quality 50`; danger is graded with a competent belayer, `80` **(tune)** | [15 §1.4](15-social-reputation-events.md), [05c §3](05c-grade-engine.md) |
| Stick clip | the first bolt is always pre-clipped (07 §2.4, a tactic), so there is no ground fall from the first moves | [07 §2.4](07-disciplines.md) |
| Clipping stance | clip the next bolt from the first stance it can be clipped from (a hand on one of its `reach_from` holds), unless a later hold on the line, also in its `reach_from`, costs at least a fifth less pump to hang from (`pc × angle_pump`), and a fall from here would not be bold or worse (`κ < 0.4`, `URGENT_KAPPA`) **(tune)** | [07 §2.1, §2.6](07-disciplines.md) |
| Passed bolts | a bolt whose `reach_from` holds are all behind the climber is passed: the "clip skipped" term of 05b §11 applies until the next clip. Generated routes are bolted so that no line passes a bolt; the rule is for signature routes and later trad | [05b §11](05b-move-resolution-and-attempt-loop.md) |
| Fall | an unrecovered slip or pump 100 on a rope: `κ` from 05b §11 (ground contact `κ = 1`), then the climber hangs for 60 s (`take`) and pulls back on where it came off, now in `work` mode (05b §12.1). It lowers off instead after a ground fall, when spent (`energy < 15` or `skin < 12`), or after `MAX_ROPE_FALLS = 6` falls **(tune)** | [05b §11, §12.1](05b-move-resolution-and-attempt-loop.md) |
| Working | in `work` mode the climber takes at pump `≥ 85` rather than climbing on into a fall (`TAKE_PUMP`), and after three falls on one move pulls through on the quickdraw (`aided`, 15 s, 1 pump) to work the rest **(tune)** | [07 §2.2](07-disciplines.md) |
| The anchor | clipped from the finish jug at the clip cost; the clip itself can pump the climber off, as the grade engine counts it. A send if the rope never held the climber; otherwise `worked`: no tick, `attempt_eq + 1.5` | [07 §2.2, §2.5](07-disciplines.md) |
| Attempt length | a guard of 1,500 steps on a rope (120 on a boulder): a 35 m pitch takes about 240 steps without falls | [24 §3.1](24-simulation-game.md) |
| Results | `AttemptResult.falls` counts the falls the rope held (the move log keeps only its last 40 entries); the career counter `rope_falls_logged` feeds the lead fear | [schemas §4.6](schemas.md) |
| Rope craft | each clip is technique XP for `rope_craft` at no margin, fading with the number of clips made (02 §B.2's novelty) | [02 §B.2](02-character-model.md) |

## 3. Endurance: what changed to make a 30 m route a pump game

The P1a engine was built and tuned on six-move boulders. On a route with a hundred hand moves, five of its rules decided the outcome for the wrong reasons; these replace them. A Font problem never reaches any of them, and the regrade check confirms it: all 115 Font benchmark and signature problems grade within 0.005 DI of before.

| Topic | Problem on a route | Implemented | Amends |
|---|---|---|---|
| Recovery on the move | every hand move cost pump whoever made it: a jug ladder pumped a 7a climber like a 6a one, the generator could only meet a route's grade with jugs, and nothing favoured an endurance build except `fe_mod` | on a route the aerobic system clears `0.3 × aerobic_capacity/100 × √(reserve/100)` pump per second of hand-move time, the critical-force idea of sustained climbing: a move cheaper than that gives pump back. Boulders are anaerobic (07 §1) and skip it **(tune)** | [05b §5, §6](05b-move-resolution-and-attempt-loop.md), [07 §2.2](07-disciplines.md) |
| Form on the day | pump 100 was a cliff: near the limit a route went from a certain send to a certain pump-out within a quarter grade, so no climber could send it about a third of the time | the hands open at a threshold drawn per attempt, `N(100, 10)` truncated at ±2.5 sd (`PUMP_FORM`); play scales every pump change by `100 / threshold`, the grade engine multiplies `P_send` by the chance the threshold exceeds the walk's pump peak. Boulders peak far below it **(tune)** | [05b §5](05b-move-resolution-and-attempt-loop.md), [05c §2.1](05c-grade-engine.md) |
| Chalk | play wore 5 chalk off per hand move and chalked only at pump `< 60`, while the grade engine held chalk at the reference `1.20`: a pumped climber climbed its hardest moves on dry hands, and play sent less than its grade | the climber chalks whenever chalk is under 35, pumped or not (`CHALK_RULE`), and the grade engine walks the same chalk on a route. A boulder never wears its chalk down to 35 | [24 §3.1](24-simulation-game.md), [05c §2.1](05c-grade-engine.md) |
| Footholds | the solver set every foothold to `DI − 1.5`, right for a boulder's few foot moves; a route has a hundred, so once pumped the feet became the crux and the base search answered with jug hand holds | sport footholds sit `2` DI under the route's off-crux hand moves (`SPORT.foot`) **(tune)** | [06 §2.4](06-procedural-routes.md) |
| Rests | a rest jug sat beside a crimp in the other hand, and a stance averages its hand holds (05b §6), so a rest gave back about one pump | each rest is two big holds in a row on the line (jug, or horn on a tufa), so both hands are on it | [06 §2.5](06-procedural-routes.md) |

## 4. The sport generator (`generateSport`, `src/sim/routes.ts`)

| Step | Implemented | Amends |
|---|---|---|
| Wall | from the ground, segments of about 4 m surface with angles from the profile; consecutive segments differ by at most 25°; a tufa on `tufa_rock` (limestone, dolomite, conglomerate, syenite) by the profile's `tufa` weight, else a corner by its weight; a 0.3 m 80° ledge at most once per 8 m; a 1 m anchor segment at `≤ 95°`. The first segment is at most 105° | [06 §2.1–§2.2](06-procedural-routes.md) |
| Steepness by grade | no segment steeper than `95° + 3.5° × (DI − 10)`, clamped to 95–150° (`sportMaxAngle`): resample up to four times, then clamp. On a steep wall every move pays the pump, so a low-grade route there can only be a ladder of jugs **(tune)** | [06 §2.1](06-procedural-routes.md) |
| Line | the boulder tracer with a route shape: width 2.4 m, up to 400 hand moves, no limit on dynamic moves, finishing on a jug 0.5 m under the top instead of a mantle. A boulder traces bit for bit as before | [06 §2.3](06-procedural-routes.md) |
| Cruxes | two or three, spread (`(k + U(0.25, 0.75)) / n` of the hand moves), never the first hand move; set at `DI − 2.5` (`SPORT.crux`): a route's crux is climbed pumped, so set at the route's DI it graded a full grade or more over, and the search below answered with jugs **(tune)** | [06 §2.4](06-procedural-routes.md) |
| Off-crux moves | a secant search on the offset `base` (from `−2.0`, clamped to `[−8, 1.5]`, up to six steps, stopping within 0.25 DI) so the route's pump, not one move, makes its grade; then the 06 §2.8 adjust loop on the cruxes. Sport holds are never re-typed to sidepulls, gastons or underclings, which face one way and can make a move illegal | [06 §2.4, §2.8](06-procedural-routes.md) |
| Bolts | first at `U(3.0, 4.0)` m, then every `spacing_m × U(0.8, 1.2)` while more than 1.2 m below the anchor, with a last bolt when the gap to the anchor exceeds `1.1 × spacing_m`; `reach_from` is the line's hand holds up to 1.2 m below and 0.6 m beside the bolt; a bolt with none moves down to just above the highest line hold below it. The anchor sits 0.15 m under the top, clipped from the finish jug | [06 §2.6](06-procedural-routes.md) |
| Names | a `kalymnos_gr` bank with `lang: 'en'` patterns (`{greek} {noun}`, `{adj} {noun}`, `{noun} of {place}`, `{greek} {suffix}`); Kalymnos villages as places, no people | [06 §2.9](06-procedural-routes.md) |
| Tags | `sport`, plus `endurance` (pump peak ≥ 60) or `power` (< 30); never `highball` | [06 §2.4](06-procedural-routes.md) |
| Ledges | the profile's ledge weight is 0.01 per segment: 05b §11 adds `0.4` to `κ` whenever a ledge lies in a fall's path, so every route with a ledge grades `bold`; at 0.04, a quarter of Kalymnos routes did | [06 §6.4](06-procedural-routes.md) |

Grades on routes are French (`frenchGrade`: DI 4 = 3 … DI 17 = 7a, DI 21 = 7c … DI 34 = 9c+), with YDS alongside; `gradeFor(di, discipline)` picks Font for boulders and French for everything else ([08 §1](08-grades.md)).

## 5. Measured status

`pnpm calibrate` (normal sweep; the sport checks are `C1`–`C4` on routes and `C10`, [05c §4](05c-grade-engine.md)):

| Test | Result | Threshold |
|---|---|---|
| C1 sport generator accuracy | 28 routes at DI 14–26: 100% within ±0.5 DI, bias 0.00; 99 ms per route in Node; 16–36 m long; all 28 safe. On 40 routes at DI 14–24, 2 bold (both from ledges) at the profile's ledge weight 0.01, 7 at 0.04 | ≥ 90% within ±1, ≥ 60% within ±0.5, bias ≤ 0.3 |
| C2 sport, dice vs grade | the Reference Climber at each route's grade, through the real attempt loop: 41.4% over 8 routes × 100 attempts, with the grade engine at 35.3% at the same interpolated DI; a second sample of 12 routes × 60 reads 37.6% against 32.0%. Single routes differ from the grade engine by about 10 points on average and up to 23. P1a's boulders read 31.9% on the same check (22 §5: 32.2%) | 35 ± 10 (warning only) |
| C3, C4 sport | send curves non-decreasing with one crossing; route seeds regenerate identically | — |
| C10 exit test | Reference Climber at DI 18 tilted 4 points on each of six power attributes against 6 on each of four endurance ones (`tiltedBuilds`); mean `P_send` on 12 Font problems: power 0.68, endurance 0.31; on 12 35 m Kalymnos pitches: power 0.12, endurance 0.63 | each gap ≥ 0.10, opposite ways |
| Font regrade | 115 benchmark and signature problems: none changed (max \|Δ\| 0.005) | 0 |
| Hold mix | share of jug and horn hand holds on the line (rests included): about 64% at DI 14, 20% at DI 18, 9% at DI 22; at DI 12 the line is all jugs | — |
| An attempt | a 33 m DI-18 pitch: about 240 steps and 14 minutes on the wall; the Reference Climber one DI under sends none and falls about once per attempt, one DI over sends 92% | — |

`pnpm harness --n 40 --days 365 --seed 7` (P1a careers on the new engine): estimate median 12.4 → 16.2 at twelve months (16.1 before), personal best median 17.2 (17.2), p90 19.0 (19.1); projecting against volume 17.5 vs 17.1 on personal best and 165 vs 933 ticks (unchanged); replay identical. Data version `p1b-1`, reducer version 4: a run saved under `p1a-13` cannot continue, because the same actions now play out differently (the form draw).

## Open questions

- **The ledge term.** 05b §11's `+0.4` for any ledge in a fall's path makes every ledge a bold route, however short the fall onto it would be. A term that grows with the fall's length below the ledge top would let ledges back into the profile at a natural rate.
- **Play against grade on a route.** Play sends about six points more than the grade engine on average, and single routes differ by up to about 25 points: a long line is a chain of threshold tactics (shake at pump 35, chalk at 35, the clipping stance) that the expected-value walk follows down one path while play follows many. Candidates: a finer DI grid or logit interpolation for the steep pump-out curves, and fewer hard thresholds in the tactics.
- **Recovery on the move.** The clearance uses `aerobic_capacity` only; physiologically, critical force is forearm-local, which in this game is closer to `finger_endurance`, already in `fe_mod`. Revisit with the P1b traits (M4).
- **Chalk by rock.** Chalk adds 21.6% friction on every rock; 10 §2 gives 18.7% on limestone. Kalymnos should use the limestone figure, which moves the reference conditions, so it waits for a regrade pass.
- **Low grades.** Below about DI 14 the tufa profile is all jugs, which is right for its steep walls and wrong for Kalymnos, whose 5s and 6s are on grey vertical rock. M2 adds that profile.
- **Steep, easy, long.** The steepness cap is a rule of thumb on the generator, not a property of rock; whether caves should hold any route below 6c is a content decision for the atlas (09).
