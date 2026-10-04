# Time, Career and Aging

The run is a calendar. The day is the unit of play, weeks and seasons are the units of adaptation and weather, years are the unit of aging. This document fixes the day structure, how age is applied, every way a run can end, and what the player sees afterwards.

Related: [schemas](schemas.md) (`Action`, `RunOptions`, `RunSummary`) · [02 §E](02-character-model.md) · [07 Disciplines](07-disciplines.md) · [10 Weather](10-weather-and-conditions.md) · [12 Training](12-training-and-adaptation.md) · [13 Injury](13-injury-and-health.md) · [14 Economy](14-economy-gear-logistics.md) · [16 Meta](16-meta-progression-and-runs.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

Numbers marked **(tune)** are design proposals.

---

## 1. The day

A day is one `day_plan` action with **one or two activity blocks** (`ActivityBlock`), then an automatic settlement: costs charged, skin and energy regenerated overnight, weather advanced, events drawn. A second block is available only when `energy ≥ 55` after the first block and the first block was not `travel` or `climb_bigwall`.

| Block type | Energy cost | Skin | Notes |
|---|---|---|---|
| `climb` (session at the crag, attempts per [07](07-disciplines.md)) | 35–60 by discipline and attempts | yes | Main block; needs open crag, dry rock, light |
| `train` ([12](12-training-and-adaptation.md) activity) | 25–50 by activity | board/campus yes | Needs facility by `gym_tier` or owned kit |
| `rest` | −(regenerates) | heals | Reduces `load_acute` decay, raises `stoke` via `resilience` |
| `active_recovery` (mobility, easy cardio) | 15 | no | Counts as rest for ACWR, small mobility stimulus |
| `work` ([14 §2](14-economy-gear-logistics.md)) | 25–40 | no | Income; `stoke` −1 for repetitive jobs |
| `social` | 10 | no | Partner trust, beta, events; `stoke` + |
| `travel` (one `TravelEdge`) | 30 + 10 per travel day | no | Occupies the whole day for `fly`; `drive` ≤ 4 h leaves a second block |
| `admin` (visas, permits, gear, physio booking) | 10 | no | `logistics` reduces failures |
| `physio` / `rehab` | 15 | no | Advances `InjuryInstance.rehab_progress` |
| `comp_round` | 50 | yes | One round per block |
| `climb_bigwall` / `alpine_day` | 70 | yes | Multi-day commitments auto-plan subsequent days until summit or retreat |

Energy regenerates overnight to `100 × sleep_mult × nutrition_mult × health_mult` (02 §D); below 25 the climber is at −10% EffectiveStat and the UI recommends rest. Time-of-day sub-choice (`dawn`/`day`/`dusk`) per [10 §8](10-weather-and-conditions.md).

---

## 2. Weeks, seasons, years

- **Week** (7 days): `stoke` is evaluated; `load_acute` is the 7-day stimulus sum and `load_chronic` the 28-day mean ([12 §5](12-training-and-adaptation.md)); the weekly summary shows sends, training, money, injuries.
- **Season** (3 months): `burnout` is evaluated; crags open and close by `Crag.season`; sponsor reviews and competition calendar quarters ([09 §8](09-world-atlas.md)); a seasonal "where next" prompt shows the atlas filtered by season and budget.
- **Year**: birthday applies age (§3); the yearly review writes a line into the career log ("Age 27: hardest redpoint 8a+, 212 climbing days, one A2 pulley"); insurance and visa renewals fall due.

The sim calendar starts on a real date chosen at creation (default 1 September so Font opens within weeks for P1a). Leap years are ignored; months have real lengths.

---

## 3. Applying age (02 §E)

On each birthday:

1. Recompute every attribute `ceiling` with the family multiplier from 02 §E (power −0.5%/yr 28–34, −1.5%/yr 35–44, −2.5%/yr 45+; endurance −1%/yr from 33, −2%/yr 45+; mobility −0.7%/yr after 25 untrained, halved with maintenance; technique flat to 55; `composure` and `risk_judgement` ceilings +0.5/yr to 50).
2. Recompute adaptation-rate multipliers (power 1.0 to 30, 0.8 at 40, 0.6 at 50; endurance 1.0 to 35, 0.8 at 45, 0.65 at 55).
3. Recompute the tendon half-time `t½ = 90 × (1 + max(0, age − 25)/20) × (1.2 − 0.4 × tr/100)` days.
4. Current values above their new ceiling decay toward it at the attribute's decay rate (not instantly), so a 36-year-old's finger strength slips over months, not on the birthday.
5. Injury risk `age_mod = 1 + 0.01 × max(0, age − 30)` (02 §C.5); recovery multiplier `1 − 0.01 × max(0, age − 30)` **(tune)**.
6. Ages 16–17 keep the growth-plate window flags ([13 §2](13-injury-and-health.md)); they clear on the 18th birthday.

The net effect, as in the research (grades flat 18 to mid-30s; IFSC finalists mean age 22–23; explosive strength −3%/yr in the 30s then −1%/yr), is that a run starting at 16 peaks physically around 24–30 and in judgement-limited disciplines (trad, alpine, big wall) around 35–45.

---

## 4. Run-end conditions

| `end_reason` | Trigger | Player control |
|---|---|---|
| `retired` | Player chooses *Retire* from the career menu (available from year 2; from day 1 in P1a), or accepts a "last season" prompt that appears at age ≥ 40 when `stoke < 30` for 8 weeks | Voluntary |
| `forced_injury` | An injury whose severity table marks it career-ending ([13](13-injury-and-health.md)): grade-3 spinal, HACE/HAPE survived with deficits, a second grade-3 labrum/cuff after 40, or **a converted death** (below). As built in P2 M2 ([28 §3](28-p2-implementation-notes.md)) the flags are data, `InjurySeverity.career_ending`: a grade-3 lower-back injury is spinal three times in ten, and every structural grade 3 ends a career when it is the second grade 3 of the same injury at 30 or over (the shoulder rule, for every structure, at 30: at 40 it ended no ten-year career in the harness, whose starts are mostly 18–28, 28 §3). The run ends with the day it happened. P2's band at Font and Kalymnos is about 3–6% of ten-year careers (decided, 27 §6); 01 §7's 10% stays the full game's, once trad and alpine bring their own | Consequence |
| `death` | Only when `RunOptions.death_enabled` **and** the fatal roll came from an **explicit risky choice**: alpine objective hazard after pressing past a displayed red threshold ([07 §5](07-disciplines.md)); soloing (a route attempted with `protection: none` by choice); a DWS fall on **S3**; a highball fall above **6 m** after a *reckless* preview ("desperate" band chosen with the danger label `bold`/`deadly` shown); a trad fall after ignoring a **gear-rip warning**. Every such choice is confirmed with a two-step dialog and written to the action log as a flagged risky action | Opt-in; when `death_enabled` is false the same roll converts to `forced_injury` with the text making the escape clear |
| `burnout` | `burnout ≥ 80` triggers a forced two-week break; if `burnout ≥ 80` again within the same season and `stoke < 20`, the "hang up the shoes" event fires with a *keep going* option that costs money and a partner relationship; choosing *quit* ends the run | Avoidable |
| `bankrupt` | `money < 0` for **30 consecutive days** (60 story, 20 hard; [14 §9](14-economy-gear-logistics.md)) | Avoidable |

Death never comes from a sport fall, a padded boulder, training, illness or weather alone; hypothermia and altitude illness can kill only inside an alpine commitment that was itself a flagged risky choice. The tone rule from [00](00-vision.md) holds: no glamour, a plain memorial line, and the same legacy entry as any other ending.

---

## 5. Run summary and legacy screen

At run end the game writes a `RunSummary` (schemas §8):

| Field | Source |
|---|---|
| `climber` | name |
| `days`, `age_end` | calendar |
| `end_reason` | §4 |
| `hardest: Record<Discipline, number>` | max `Tick.di` per discipline by style (redpoint and onsight shown separately in the UI, redpoint stored) |
| `ticks`, `first_ascents` | tick list; FAs are procedural routes nobody in the world has ticked |
| `injuries` | count of `InjuryInstance` with grade ≥ 2 |
| `countries` | distinct `Crag.country` visited |
| `unlocks` | [16 §4](16-meta-progression-and-runs.md) |
| `legacy_npc_id` | [16 §5](16-meta-progression-and-runs.md) |

The **legacy screen** shows, in order: the ending line; the grade pyramid by discipline; a world map with visited crags coloured by days spent; a career timeline (yearly lines from §2 plus injuries and relationships); traits acquired during the run; the Hall of Fame score ([16 §6](16-meta-progression-and-runs.md)); new unlocks; the run seed with a copy button; buttons for *New run*, *Replay this seed*, *Hall of Fame*.

---

## Open questions / proposed schema additions

### Open questions

1. Whether a second block should be allowed after a `fly` edge when the flight is short-haul (< 3 h); currently no.
2. The retirement age prompt at 40 is a design guess; the harness should check how many runs end there versus by injury.

### Proposed schema additions

- `ActivityBlock` is referenced by `Action.day_plan` but not defined in schemas.md; proposed: `interface ActivityBlock { kind: 'climb'|'train'|'rest'|'active_recovery'|'work'|'social'|'travel'|'admin'|'physio'|'comp_round'|'climb_bigwall'|'alpine_day'; ref?: string; time_of_day?: 'dawn'|'day'|'dusk' }`.
- `Action` needs a `{ t: 'risky_choice'; kind: 'alpine_hazard'|'solo'|'dws_s3'|'highball_reckless'|'gear_rip_ignored'; route?: string }` entry so death eligibility is auditable in replay.
- `RunSummary.hardest_onsight?: Record<Discipline, number>` and `RunSummary.risky_choices: number`.
