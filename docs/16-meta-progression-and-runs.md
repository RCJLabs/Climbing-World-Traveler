# Meta-progression and Runs

One career is one run. Runs end ([11](11-time-career-aging.md)) and feed a thin meta layer: unlocks that widen the creation menu, legacy climbers who haunt later worlds, a Hall of Fame and a lifetime grade pyramid. The meta layer never makes a later run numerically stronger; it only adds options and history. Everything here is P5 except the run-creation flow, difficulty presets and the single P1a unlock. Numbers are **(tune)**.

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [03 Traits](03-traits.md) · [04 Backgrounds](04-backgrounds.md) · [11 Time, Career, Aging](11-time-career-aging.md) · [15 Social](15-social-reputation-events.md) · [17 UI/UX](17-ui-ux.md) · [18 Tech Architecture](18-tech-architecture.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

---

## 1. Run creation flow

Every step writes into the single `new_run` action (`background`, `body`, `traits`, `attr_alloc`, `options: RunOptions`), so a run is reproducible from its log.

| Step | Screen | Choice | Notes |
|---|---|---|---|
| 1 | Mode | New career · Daily run · Seeded run · Scenario | Daily and Seeded prefill steps 2–6 (§3); Scenario fixes some of them (§4.3) |
| 2 | Options | `difficulty`, `death_enabled`, `auto_commit`, `sweep_speed` | All changeable later via `settings` except `difficulty` and `death_enabled` after day 1 (death can still be switched off, never on) |
| 3 | Background | one of the unlocked backgrounds | Sets point bonus, money, start crag ([04](04-backgrounds.md)) |
| 4 | Body | sliders or a Quick-build preset | Trade-off panel per slider ([02 §A](02-character-model.md)) |
| 5 | Attributes | distribute `attr_points` | Separate from trait points ([02 §F](02-character-model.md)) |
| 6 | Traits | buy/refund; optional hidden roll | Budget ≥ 0, ≤ 12 traits, caps ([03](03-traits.md)) |
| 7 | Identity | name, `home_region`, display grade system | An unlocked start crag can override the background's default (§4.2) |
| 8 | Summary | detected archetypes, estimated grades, first-week forecast | "Start" commits the `new_run` action |

A Quick-build takes a player from step 3 to step 8 in two taps ([17 §6](17-ui-ux.md)).

---

## 2. Difficulty presets

`RunOptions.difficulty` selects a bundle of multipliers read by the systems named. Standard is the harness calibration setting.

| Modifier (where applied) | story | standard | hard |
|---|---|---|---|
| Injury probability ([13](13-injury-and-health.md)) | ×0.6 | ×1.0 | ×1.3 |
| Daily living costs ([14 §3](14-economy-gear-logistics.md)) | ×0.75 | ×1.0 | ×1.25 |
| Starting money | ×1.5 | ×1.0 | ×0.75 |
| Adaptation rate ([12](12-training-and-adaptation.md)) | ×1.15 | ×1.0 | ×0.9 |
| Auto-success band `T` ([05b](05b-move-resolution-and-attempt-loop.md)) | ×1.2 | ×1.0 | ×0.9 |
| Bad-weather day probability ([10](10-weather-and-conditions.md)) | ×0.8 | ×1.0 | ×1.2 |
| Negative-event weight ([15 §4](15-social-reputation-events.md)) | ×0.7 | ×1.0 | ×1.3 |
| Bankruptcy grace ([14 §9](14-economy-gear-logistics.md)) | 60 days | 30 days | 20 days |
| Hidden traits | optional roll | optional roll | one forced roll, no point bonus |
| `death_enabled` default | off | off | on (toggle still offered) |
| Hall of Fame score multiplier (§6) | ×0.5 | ×1.0 | ×1.3 |

Story is for players who want the career and the places; hard is for players who want the spreadsheet to bite. Neither changes grades: a 7a is a 7a on every preset, so the pyramid (§7) stays comparable.

---

## 3. Seeded and daily runs

- **Seeded run:** the player types or pastes `run_seed`. Same seed, same `new_run` payload and same data version give the same weather, routes, NPCs and event draws ([18 §4](18-tech-architecture.md)). The seed is shown on the Run Summary with a copy button.
- **Daily run:** `RunOptions.daily_seed` is the UTC date (`2027-03-14`). The daily fixes background, body, allocation and traits (derived from the seed), runs standard difficulty with `death_enabled: false`, and ends after 90 sim days. Score = Hall of Fame formula (§6) over that window. There is no server: the game keeps a local history of daily scores and produces a 12-character share code (`seed · score · log hash`) that another player can paste to compare. Daily runs do not grant unlocks beyond the pyramid.
- **Determinism caveat:** changing `auto_commit` or `sweep_speed` changes the action log but not the world; two players on the same daily see the same routes and weather, and their outcomes differ only by choices and taps.

---

## 4. Unlock tree

Unlocks are strings in `RunSummary.unlocks[]`, granted at run end from the summary and the tick list. They add menu options only.

### 4.1 Traits and backgrounds

| Unlock id | Grants | Condition at run end |
|---|---|---|
| `trait:headpointer` | creation trait Headpointer | a tick on a `bold` route at DI ≥ 20 |
| `trait:alpinist_lungs` | creation trait (altitude tolerance) | 30 days above 3,000 m |
| `trait:comp_veteran` | creation trait (isolation nerves reduced) | 10 competitions entered |
| `trait:crag_mayor_start` | creation trait (start with rep 30 at home crag) | rep ≥ 60 in any region |
| `hidden_pool:expanded` | 10 extra hidden traits in the roll pool | any run ending with ≥ 3 hidden traits revealed |
| `bg:trust_fund` | Trust Fund background | end a run with money ≥ $50,000 |
| `bg:content_creator` | Content Creator background | following ≥ 50,000 |
| `bg:guides_apprentice` | Guide's Apprentice background | 20 paid guiding days |
| `bg:dirtbag_dropout` | Dirtbag Dropout background | 180 nights camping or in a vehicle |
| `bg:coastal_fisher` | Coastal Fisher background | 15 DWS ticks |
| `p1a:second_background` | the P1a unlock: a 6th background, **Farm Kid** (starts at Fontainebleau until travel exists) | finish any P1a run |

The five P1a backgrounds and the base trait catalogue need no unlock.

### 4.2 Start crags

Spending ≥ 30 days at a crag in a completed run unlocks it as a start location (`start:<crag id>`), selectable at step 7 for any background whose `tags` include `travel`. The override is logged on the `new_run` action (§8).

### 4.3 Scenarios

Scenarios are preset runs with fixed rules, each a one-screen pitch. All require one finished standard run.

| Scenario | Setup | Rules | Ends |
|---|---|---|---|
| **Big-wall siege** (`scenario:bigwall_siege`) | Yosemite, September, 21 sim days, a two-person team (persistent NPC partner with `belay_quality` 85), $3,000, full rack and haul kit | Pitch-by-pitch multipitch with bivies, weather commit decisions, hauling fatigue; no travel; no training | Day 21 or summit; scored on pitches freed, aid used, days |
| **1970s dirtbag era** (`scenario:dirtbag_70s`) | Camp 4 or the Peak District, 5 sim years | No gym (`gym_tier` forced 0), no hangboards, flat shoes only with smear −6% and edge −4%, no bolts at trad crags, no content or sponsorship, costs ×0.3 and income ×0.3, rope retire at 15 falls, no weather forecast beyond `weather_sense` | Normal end conditions; a separate Hall of Fame table |
| **Comp season** (`scenario:comp_season`) | Gym Comp Kid, age 19, fixed calendar of 8 competitions over 10 months with travel between venues | Isolation, qualifiers, semis, finals; training blocks only; one outdoor trip allowed | Season end; ranking points |

---

## 5. Legacy NPCs

When a run ends, the climber is converted into a persistent `NPC` and stored outside any run: attributes and traits as they were at the end, `age_days` continuing, `archetype: 'local_legend'`, `belay_quality` from final `rope_craft`, `spot_quality` from final `body_position`, `reliability` 80, `spray` from the Spray Lord or Humble traits, `risk_tolerance` from `risk_judgement` inverted. Death and forced-injury endings still produce a legacy entry (a retired or memorial figure in dialogue; no climbing progression). `RunSummary.legacy_npc_id` points at it.

In later runs the legacy NPC lives at the most-visited crag of its run, joins that crag's pool on first visit, and follows the normal lifecycle ([15 §1.3](15-social-reputation-events.md)): it can mentor, retire, and eventually leave. The store keeps the 20 most recent legacies, oldest first out; the Hall of Fame keeps the summaries forever.

---

## 6. Hall of Fame

A table of every `RunSummary`, sortable by any column. The headline score:

```
score = 10 × max(hardest[*]) + 4 × hardest[second discipline] + 0.6 × √ticks + 3 × countries
        + 2 × first_ascents + 0.02 × days − 4 × injuries                           (tune)
        × difficulty multiplier (§2)
```

End reason is shown as an icon; `death` entries render in a muted style and never top a list that includes a `retired` run with an equal score. Filters: discipline, background, scenario, year.

---

## 7. Grade pyramid history

Every `Tick` is kept per run and aggregated across runs into a pyramid: count of ticks per DI step split by `style` (onsight / flash / redpoint / repeat) and `Discipline`. The pyramid screen shows the lifetime shape, the current run overlaid, and a "depth" number (ticks within 3 DI of the top grade). Depth gates nothing but is reported on the Run Summary so players can see whether a career was a spike or a base. The display converts DI with the crag's grade system or the player's preferred system ([08](08-grades.md)).

---

## Open questions / proposed schema additions

- `Action 'new_run'` needs `start_crag_override?: string` and `scenario?: string` for §4.2 and §4.3; alternatively fold both into `RunOptions`.
- A meta store outside `SaveGame`: `MetaState { unlocks: string[]; hall_of_fame: RunSummary[]; legacies: NPC[]; pyramid: Record<string, number>; daily_history: { seed: string; score: number; hash: string }[] }`, persisted in its own IndexedDB object store ([18 §5](18-tech-architecture.md)).
- `RunSummary` could carry `score: number` and `scenario?: string` so the Hall of Fame does not recompute with changed formulas.
- Whether daily runs should allow `auto_commit` on the shared leaderboard-by-share-code; this doc says yes (timing is a modest reward by design, [19 §3](19-balance-and-simulation-testing.md)).
