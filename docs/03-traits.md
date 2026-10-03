# Traits

Traits are the Project-Zomboid layer of character creation: discrete, named bends to the Body and Attribute model that cost points when they help and refund points when they hurt. They are the player's main vocabulary for *who this climber is* ("Sloper Whisperer with Paper Skin and a Trust Fund"), the archetype detector's input, and the balance harness's favourite thing to break. This document defines the point economy, the full catalogue with transcribable numbers, the archetype synergies, three worked builds, and why the build space is large *and* meaningfully distinct.

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [04 Backgrounds](04-backgrounds.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [12 Training](12-training-and-adaptation.md) · [13 Injury](13-injury-and-health.md) · [15 Social and Events](15-social-reputation-events.md) · [19 Balance](19-balance-and-simulation-testing.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

All identifiers below are drawn from [schemas](schemas.md) §2–§4. Every number marked **(tune)** is a first-pass proposal that the harness re-costs; the costs in the catalogue are *all* (tune) by definition of §1.4, so the marker is omitted inside the tables.

---

## 1. Economy rules

### 1.1 Budget

| Rule | Value |
|---|---|
| Starting points | `0 + Background.point_bonus` (0–6, see [04](04-backgrounds.md)) |
| Positive trait cost | integer in `[2, 10]` |
| Negative trait refund | integer in `[2, 10]` (stored as a negative `cost`) |
| **No ±1 traits** | anything that prices at ±1 is merged into a larger trait, moved to the Quirk category, or cut |
| Budget at the end of creation | must be `≥ 0`; unspent points are lost (they do not convert to attribute points) |
| Max traits chosen at creation | 12, counting positives, negatives and quirks; **not** counting background `forced_traits` or rolled hidden traits |
| Forced traits | granted by the background at cost 0, count toward category caps for exclusions but not toward the 12 |

### 1.2 Caps (anti-exploit)

| Cap | Value | Why |
|---|---|---|
| Total negative refund | `≤ 12` points | Stops the "take every negative, buy everything" build. With the max background bonus (6) the most a player can spend on positives is 18. |
| Negatives per category | `≤ 2` | Stops stacking six cheap mental negatives a bouldering build never feels. |
| `attr_mult` traits | exactly one selectable per attribute | Enforced by pairwise `excludes`; the validator checks it ([schemas §9.3](schemas.md)). In this catalogue no creation trait uses `attr_mult` at all; the slot is reserved for acquired traits and P5 content so that stacking is impossible by construction. |
| Synergies | **additive, never multiplicative** | Hold, move and condition multipliers combine as `1 + Σ(mᵢ − 1)` ([02 §B.5](02-character-model.md)); archetype detection ([§3](#3-archetypes-and-synergies)) grants cosmetics and dialogue, never numbers. |
| Mirror pairs | always mutually exclusive | Gecko Skin excludes Paper Skin, etc. Listed in the `excludes` column both ways. |
| Background locks | `Background.locked_traits` cannot be taken | A Desk-Job Late Starter cannot also be a Gym Kid. |

### 1.3 Phase gating

A trait is **selectable and point-bearing only when every system it touches is live** in the current build ([schemas §1](schemas.md)). A gated trait is hidden from the creation UI, excluded from the harness, and does not count toward anything. When its phase ships, existing saves do not retroactively receive points.

P1a ships a curated set of **~40 traits** chosen for Fontainebleau bouldering relevance (marked `P1a` in the catalogue). Many traits marked `P1b` touch only systems already live in P1a (attribute adds on live attributes); they are deferred for content volume and balance bandwidth, not for code. The gating by system is:

| Phase | System that must be live | Traits gated to it |
|---|---|---|
| P1b | rope, clipping, sport attempt modes, kneebars as rests, pockets as a common hold family, power-endurance | Dry Hands, Slow Twitch, Stiff Shoulders, Bellows, Springs, Noodle Legs, Pocket Fingers, Kneebar Finder, Proprioceptor, Beta Blind, Rope Gun, Resistance, Bear Hugger, Contact Catcher, Slow Hands, Jug Hauler, One-Arm Wonder, Kinesthetic Learner, Slow Learner, Overthinker, Clutch, Zen, Onsight Purist, All In, Hesitant, Unflappable, Jittery, Vertigo, Loves Air, Visualiser, Skin Care Routine, Rower, Farm Strong, Climber Parents, Guide's Apprentice, Martial Artist, Swimmer, Runner, Weightlifter, Feral Childhood, and quirks Stubborn, Cautious, Big Hands, Small Hands, Perfectionist, Downclimber |
| P2 | weather and temperature, injuries, training clocks, economy, travel, NPCs, events, reputation, stoke/burnout | Bendy Shoulders, Iron Tendons, Glass Pulleys, Furnace, Cold Blooded, Cold Hands, Gaston Goblin, Beta Sponge, Patient, Impatient, Competitor, Bounce Back, Brittle, every Social trait, every Lifestyle trait except Skin Care Routine, Ex-Military, Academic, Content Creator, Mountain Born, Coastal Fisher, every Health trait, Cool Head, Risk Blind, quirks Purist, Rival Magnet, Superstitious, Grade Sceptic, the whole hidden pool, acquired Pulley Veteran, Sandbagged, Crag Mayor, Grit Hardened, Tufa Whisperer, Injury Wise, Jaded |
| P3 | trad gear, competitions, DWS | Jam Hands, Gear Whisperer, Headpointer, Podium Kid, acquired Comp Yips |
| P4 | altitude, ice, objective hazard | Altitude Native, Thin Blood, Ice Natural, Summit Fever, acquired Acclimatised, Survivor |
| P5 | legacy | acquired Legend |

Bendy Shoulders (its downside is a shoulder-injury multiplier) and Pain Tolerant (all of it is injury and pain) moved from P1b to P2 when P1b's traits shipped. Lucky and Unlucky (rerolls, injuries and events) and Cool Head and Risk Blind (`risk_judgement` moves nothing on the wall before the danger display) moved to P2 after the first re-costing found that they change no career ([26 §11](26-p1b-implementation-notes.md)). As built, P1b has no kneebars and no downclimbing, so Kneebar Finder and Downclimber wait for them although their systems are listed here for P1b ([26 §8.1](26-p1b-implementation-notes.md)).

The plan's named examples **Nervous Flyer, Motion Sick, Chalk Allergy, Monoglot and Summit Fever** are hidden until travel (P2), travel (P2), health/illness (P2), languages and regional reputation (P2) and alpine retreat decisions (P4) respectively ship.

### 1.4 Published cost formula

```
cost = round(M)                                   clamped to [2,10]; |M| < 1.5 → Quirk (0) or cut
M    = attribute-equivalent impact on the 10k-career harness metric
```

`M` is measured, not guessed: the harness ([19](19-balance-and-simulation-testing.md)) runs 10,000 careers with the trait forced on, against 10,000 tag-matched controls, and finds the number of extra free starting attribute points the controls need (spread across the trait's tagged attributes) to equalise the composite outcome `O = 0.6 × peak_DI_year5 + 0.25 × DI_area_under_career + 0.15 × career_years`. That number of points *is* `M`. A +6 trait therefore equals six attribute points of outcome, by construction.

Until the harness exists, first-pass costs use the hand heuristic below **(tune)**; the catalogue was priced with it. The first measured pass ([19 §4](19-balance-and-simulation-testing.md) as built) prices at today's level, where a point came out at about 0.75 broad attribute points, and moved 15 costs; a second pass moved five more and made Choker harder to shed ([26 §11.2](26-p1b-implementation-notes.md)); the rest are still the heuristic's ([26 §10](26-p1b-implementation-notes.md)).

| Effect field | Attribute-equivalent points |
|---|---|
| `attr_add` +n on one attribute | `n × w`, where `w` = 1.0 for broad attributes (`finger_strength`, `body_position`, `footwork`, `composure`, `focus`, `confidence`, `core_tension`, `pull_power`), 0.7 for medium (`route_reading`, `contact_strength`, `lockoff`, `hip_mobility`, `aerobic_capacity`, `anaerobic_capacity`, `commitment`, `resilience`, `risk_judgement`, `dynamic_movement`), 0.5 for niche (`tech_*`, `skin_durability`, `shoulder_mobility`, `leg_power`, `finger_endurance`, `rope_craft`, `gear_placement`, `ice_tools`, lifestyle attributes) |
| `ceiling_add` +n | `0.4 × n × w` (matters only late in a career) |
| `adapt_rate_mult` x on one attribute | `(x − 1) × 20 × w` |
| `hold_mult` x on a hold type | `(x − 1) × 100 × share`, with atlas hold shares (tune): crimp+edge 0.30, sloper 0.12, jug 0.15, pocket1–3 0.10 combined, pinch 0.08, smear+foot_chip 0.10, sidepull/gaston/undercling 0.10 combined, cracks 0.08 combined, horn/volume 0.02 |
| `move_mult` x on a move class | `(x − 1) × 100 × share`, with shares: static 0.45, deadpoint 0.12, dyno 0.06, high_step 0.10, heel_hook 0.07, toe_hook 0.03, mantle 0.04, jam 0.04, kneebar 0.03, match/bump/rest/clip/place_gear 0.06 combined |
| `condition_mult` x | `(x − 1) × 100 × 0.25` per condition (a quarter of climbing days are affected) |
| `fear_add` ±n | `−0.3 × n` |
| `injury_risk_mult` x | `(1 − x) × 10` (career length) |
| `recovery_mult` x | `(x − 1) × 20` |
| `cost_mult` x | `(1 − x) × 10` |
| `rep_mult` x | `(x − 1) × 15` |
| `resource_mult` on `skin`/`energy`/`stoke`/`health` x | `(x − 1) × 12` |
| flags | priced by analogy to the nearest numeric effect, noted in the trait row where non-obvious |

**Pick-rate flags.** After each harness run, any trait with pick-rate `> 60%` among random-but-sane builds is raised by one point and any trait `< 5%` is lowered by one point (or redesigned if already at ±2), then the run repeats. A trait that oscillates at the ±2 floor for two cycles is merged or cut. Pick rates are reported per background so that a trait every Comp Kid takes is not mistaken for a globally under-priced one.

### 1.5 Quirks (0 points)

Mixed-sign traits whose first-pass `|M| < 1.5` live in the **Quirk** category at cost 0 (Reckless, Tunnel Vision, Stubborn, Cautious, Big Hands, Small Hands…). They still count toward the 12-trait limit and toward exclusions. A mixed-sign trait with a clear net sign (Onsight Purist, Night Owl, Lone Wolf) is priced on its net and stays in its thematic category. The harness may promote a quirk into a priced trait or demote a priced trait to a quirk; the category moves with the cost.

### 1.6 Hidden traits (opt-in)

- At creation the player may **roll 2 hidden traits for +2 points** (one roll only; 4-for-4 is not offered because it doubles variance for the same bonus) **(tune)**.
- The hidden pool ([§2.9](#29-hidden-pool)) is **balanced in point mass**: Σ positive `point_mass` = Σ negative `point_mass` = 30, every entry within ±6, and the two rolls are drawn without replacement with one draw from each sign (so the expected value of the roll is exactly 0 and the +2 is a pure premium for accepting variance).
- Hidden traits respect `excludes` against chosen traits: a roll that would conflict is redrawn.
- **Reveal window N = 12 weeks (tune).** Each hidden trait names a *foreshadowing event* that fires between week 3 and week 9 (seeded), and the trait is fully revealed on the character sheet by week 12 at the latest, or immediately when its effect first changes an outcome by more than 2% (whichever is earlier).
- **Never run-ending alone.** No hidden trait may: set `injury_risk_mult` above 1.3, touch death-eligible outcomes, change `money` by more than 10% of starting cash, or lower any attribute ceiling by more than 8.

### 1.7 Evolving traits

An evolving trait carries `evolves_to` with an exact threshold and a minimum elapsed time, so a player cannot grind it out in a weekend. Counters are stored on the climber and shown on the trait card ("12/30 practice falls, week 3 of 6").

| Trait | Stage 1 → | Threshold | Stage 2 → | Threshold |
|---|---|---|---|---|
| `afraid_of_falling` (−2) | `falls_ok` (0, neutral) | **30 practice falls over ≥ 6 weeks**; a fall-practice session counts 3 | `falls_well` (acquired) | **60 total practice falls** *and* ≥ 10 falls without injury *and* ≥ 12 weeks since the first counted practice fall |
| `choker` (−6) | neutral (trait removed) | 10 sends with stakes that beat the personal best (stakes = comp final, redpoint go on a route at or above personal best, or audience ≥ 3 NPCs) over ≥ 16 weeks | — | — |
| `topout_terror` (−2) | neutral (trait removed) | 40 clean `mantle` outcomes over ≥ 4 weeks | — | — |
| `nervous_flyer` (−3, P2) | neutral (trait removed) | 12 flights taken | — | — |

What the thresholds count (`EvolveCounter`, [schemas §4.4](schemas.md)):

| Counter | One count is |
|---|---|
| `practice_falls` | a third of a fall-practice session, the gym training block ([12](12-training-and-adaptation.md)); a deliberate lead fall above a bolt would count too, but a climber's tactics never choose one |
| `unhurt_falls` | a fall the pads or the rope take without an injury: a boulder attempt that ends in a fall or a pump-out, or a fall the rope holds (no fall injures before P2) |
| `stakes_sends` | a send on an attempt with stakes that beats the personal best; until comps and audiences, stakes are the redpoint clause, at or above the personal best − 0.25 ([26 §8.1](26-p1b-implementation-notes.md), [§11](26-p1b-implementation-notes.md)) |
| `clean_mantles` | a topout whose mantle resolves clean |

- Every climber counts from day one, evolving trait or not, and counts never reset, so a second stage counts from the first.
- The week clock starts at the first count of the evolution's first need.
- At the end of a day each trait whose evolution is met becomes its next stage, or goes: one stage a day, with a journal line.
- The new stage's multipliers, fear and flags replace the old stage's at once. Attribute adds are values, not live effects: the old stage's stay where training has taken them, and a gained stage's apply once, on the day it is gained, within the ceilings, which are recomputed then.

Points are **not** refunded or charged when a trait evolves; the refund was the price of starting there. As built: [26 §10](26-p1b-implementation-notes.md).

### 1.8 Acquired traits

Acquired traits ([§2.10](#210-acquired)) are granted by play at cost 0, each with a trigger predicate the event or injury system evaluates once per day. They are the only traits allowed to use `attr_mult`, because a climber can never hold two acquired traits for the same attribute (the triggers are mutually exclusive by design). Some are temporary and carry an expiry.

### 1.9 How to read the catalogue

Columns: **id** (snake_case, final) · **name** · **cost** (creation traits ±2..±10; quirks, hidden, acquired 0; hidden rows show `point_mass` in brackets) · **category** · **kind** · **phase** · **effect** (only `TraitEffect` fields) · **tags** (Tag vocabulary only) · **excludes** · **requires** · **flavour**.

Effect shorthand: `attr_add: finger_strength +6` is `effect.attr_add.finger_strength = 6`; `hold_mult: crimp 1.06` is `effect.hold_mult.crimp = 1.06`; `resource_mult: skin 1.25` and so on. Flags are written `flags: name=value`.

**`resource_mult` semantics used here (implemented in P1b except `energy` and `health`, which wait for systems that regenerate them; [26 §8.1](26-p1b-implementation-notes.md)):** the multiplier applies to the resource's *regeneration or gain*, not its ceiling: `skin` overnight heal, `energy` overnight regen, `stoke` positive deltas, `burnout` accrual, `health` regen, `chalk` amount restored per chalk-up, `focus_meter` positive deltas, `aerobic_reserve` and `power` starting pool.

**Flags used in this catalogue.** Each flag is read by exactly one system; the table is the contract.

| Flag | System | Meaning |
|---|---|---|
| `reach_mult=x` | 05a reach envelope | multiplies free-limb reach radius after Body terms |
| `tendon_robustness_add=±n` | 02 A.1 | shifts the hidden `tendon_robustness` slider |
| `sending_temp_shift=±n` | 02 C.6 / 10 | shifts the sending-temperature window centre in °C |
| `split_risk_cold=x` | 13 skin | split-tip probability multiplier in `cold` (P1b, until split tips exist: skin wear ×x on a cold day) |
| `injury_site_mult:<site>=x` | 13 | injury probability multiplier for one `InjuryDef.site` |
| `commit_window_width=x` | retired with the commit window ([24](24-simulation-game.md) §6) | — |
| `feet_cut_recovery=+n` | 05b | percentage points added to the feet-cut recovery roll |
| `reveal_kneebars` | 05b/06 | kneebar rests shown pre-attempt regardless of `route_reading` |
| `fear_source_mult:<source>=x` | 05b §7 | multiplies one labelled fear source (height, runout, last_fall, partner) |
| `stakes_mult=x` | 05b | EffectiveStat multiplier when the attempt carries the `stakes` context flag |
| `quit_after_fails=n, quit_chance=p, stoke_hit=s` | session loop | after n consecutive fails, p chance the session ends and stoke −s |
| `familiarity_k_mult=x` | 05b §9 | multiplies k in `fam = 1 − e^(−k·attempts)` |
| `project_stoke_immunity` | stoke | repeated failure on the same route does not lower stoke |
| `onsight_rep_mult=x`, `redpoint_stoke_penalty=n` | 15 / stoke | onsight ticks give ×x reputation; attempt 4+ on a route costs n stoke |
| `rehearsed_fear_mult=x` | 05b §7 | all fear sources ×x when `fam > 0.8` |
| `beta_mult=x` | 05b §9 | familiarity gained from partner beta ×x (P1b: the beta on signature problems) |
| `flow_chance_mult=x` | 05b focus | probability of entering flow state ×x |
| `pre_move_time_mult=x` | 05b time | time per move ×x (drains aerobic reserve) |
| `visualise_action=+f` | attempt loop | a free pre-attempt action adds f familiarity |
| `sketchy_send_stoke=±n` | stoke | a send with a sketchy outcome in it changes stoke by n |
| `plastic_mult=x` | 05b | EffectiveStat ×x on `RockType = plastic` |
| `monotony_mult=x`, `abandon_project_after=n` | burnout | monotony accrual ×x; project auto-abandons after n sessions |
| `rival_present_mult=x`, `rivalry_gain_mult=x`, `rival_spawn_mult=x` | 15 | EffectiveStat with a rival present; rivalry accrual; rival generation |
| `partner_find_mult=x`, `trust_gain_mult=x`, `own_reliability=x`, `belay_quality_received=+n`, `partner_reliability=+n` | 15 partners | as named |
| `sponsor_appeal_mult=x`, `sponsor_pitch_mult=x`, `sponsor_lead_mult=x`, `contact_gain_mult=x` | 14/15 sponsorship | as named |
| `media_rep_mult=x`, `ethics_rep_mult=x`, `rep_loss_mult=x`, `criticism_immune`, `criticism_stoke=−n` | 15 reputation | as named |
| `access_violation_penalty_mult=x` | 09 access | reputation penalty for access violations ×x |
| `loneliness_immune` | stoke | no stoke loss from solo weeks |
| `partner_send_stoke=−n` | stoke | when a partner or rival sends harder than your best |
| `rivalry_decay=0` | 15 | rivalry never decays |
| `mentored_adapt_mult=x` | 12 | technique adaptation ×x while a mentor relationship is active |
| `money_start_add=n`, `stipend_monthly=n`, `income_per_work_block=n`, `remote_income_mult=x`, `content_blocks_per_week=n`, `offline_stoke=−n` | 14 economy | as named |
| `has_vehicle`, `drive_cost_mult=x`, `accommodation_free_drive` | 14 travel | as named |
| `gear_wear_mult=x`, `gear_cost_mult=x`, `shoe_fit_friction=+f` | 14 gear | as named |
| `illness_mult=x` | 13 | illness event probability ×x |
| `morning_energy_mult=x`, `evening_energy_mult=x`, `dawn_patrol`, `nightlife_event_mult=x` | day planner | first/last block energy; unlocks dawn block; event weight |
| `flight_stoke=−n`, `flight_energy=−n`, `jetlag_mult=x`, `surface_travel_energy=−n`, `boat_approach_penalty` | 14 travel | as named |
| `liquid_chalk_only` | 14 | chalk purchases cost ×1.5 |
| `city_stoke=−n`, `away_stoke=−n`, `new_country_stoke=+n`, `stale_stoke=−n` | stoke | weekly deltas by location context |
| `reroll_bad_outcome=p`, `reroll_good_outcome=p`, `good_event_mult=x`, `bad_event_mult=x` | 05b dice / 15 | re-roll a sketchy/slip/fall (or clean) outcome with probability p once; event weights |
| `skin_low_penalty_mult=x`, `injury_detect_delay` | 02 D / 13 | skin < 30 penalty ×x; grade-1 injuries surface 7 days late |
| `pad_carry_energy=+n` | day planner | approach energy cost with a pad |
| `landing_injury_mult=x` | 13 | boulder-fall injury ×x |
| `decline_onset_shift=±y` | 02 E | age curves shift by y years |
| `acclimatise_rate_mult=x`, `hot_aches_event_mult=x`, `alpine_only`, `retreat_option_penalty` | 07/10 alpine | as named |
| `swim_skill` | 07 DWS | swim-out failure chance halved |
| `comp_isolation_nerves_mult=x` | 07 comp | isolation fear source ×x |
| `chalk_friction_base=+f`, `overchalk_penalty_mult=x` | 05b/10 | as named |
| `always_downclimb` | attempt loop | downclimbs instead of jumping; skin and energy ×1.1, boulder-fall injury ×0.7 |
| `ritual_focus=+a/−b` | focus | +a focus_meter when the ritual block was taken, −b otherwise |
| `self_report_di=−d` | 15 | logged grades reported d DI lower |
| `declines_chipped_routes`, `partner_conflict_mult=x` | 15 | as named |
| `rock_scope=<RockType>` | 05b | restricts the row's hold_mult/attr_add to that rock type |
| `warmup_required` | session loop | first attempt of a session without a warm-up block: finger injury ×2 |
| `stoke_swing_mult=x` | stoke | all stoke deltas ×x |
| `mass_shift=+n` | 02 A.2 | adds n kg to `mass_kg` (and +0.5 ceiling per kg, not yet implemented for this flag or the creation slider) |
| `requires_age_min=n` | creation | selectable only if `age_start ≥ n` (see Open questions) |

---

## 2. Catalogue

### 2.1 Body

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| gecko_skin | Gecko Skin | +5 | body | creation | P1a | attr_add: skin_durability +10; ceiling_add: skin_durability +5; resource_mult: skin 1.25 | skin, friction, sharp, boulder | paper_skin | — | Sharp crimps are somebody else's problem. |
| paper_skin | Paper Skin | −2 | body | creation | P1a | attr_add: skin_durability −10; ceiling_add: skin_durability −5; resource_mult: skin 0.80 | skin, sharp | gecko_skin | — | Three goes on the gritty sloper and you are bleeding. |
| sweaty_hands | Sweaty Hands | −4 | body | creation | P1a | condition_mult: humid 0.94, heat 0.95; resource_mult: chalk 0.70; flags: sending_temp_shift=−3 | skin, humid, heat, friction | dry_hands | — | Your chalk bag is a budget line. |
| dry_hands | Dry Hands | +3 | body | creation | P1b | condition_mult: humid 1.03, heat 1.02; resource_mult: chalk 1.30; flags: sending_temp_shift=+1, split_risk_cold=1.3 | skin, friction, cold | sweaty_hands | — | Chalk is a ritual, not a requirement. Winter splits are the tax. |
| rubber_hips | Rubber Hips | +6 | body | creation | P1a | attr_add: hip_mobility +10; ceiling_add: hip_mobility +10; move_mult: high_step 1.05, heel_hook 1.03, kneebar 1.03 | flexibility, footwork, slab, overhang | tight_hips | — | Feet go where other people put their hands. |
| tight_hips | Tight Hips | −5 | body | creation | P1a | attr_add: hip_mobility −10; ceiling_add: hip_mobility −10; move_mult: high_step 0.94, heel_hook 0.97 | flexibility, footwork | rubber_hips | — | The high step is a rumour. |
| monkey_arms | Monkey Arms | +4 | body | creation | P1a | flags: reach_mult=1.03; move_mult: static 1.02; hold_mult: smear 0.98 | reach, overhang, roof, compression | t_rex_arms | — | Stacks on the ape-index slider. Skips the intermediate; wobbles on the slab. |
| t_rex_arms | T-Rex Arms | −10 | body | creation | P1a | flags: reach_mult=0.97; move_mult: static 0.98; hold_mult: smear 1.02 | reach, slab | monkey_arms | — | Every problem has one more move for you. |
| iron_tendons | Iron Tendons | +8 | body | creation | P2 | flags: tendon_robustness_add=+25; injury_risk_mult: 0.80; adapt_rate_mult: finger_strength 1.10 | tendon, injury, health, crimp | glass_pulleys | — | Pulleys like mooring rope. You will find out slowly. |
| glass_pulleys | Glass Pulleys | −8 | body | creation | P2 | flags: tendon_robustness_add=−25; injury_risk_mult: 1.25; adapt_rate_mult: finger_strength 0.90 | tendon, injury, crimp, pocket | iron_tendons | — | That pop was not the hold. |
| light_frame | Light Frame | +5 | body | creation | P1a | attr_add: pull_power +4, finger_strength +3, lockoff +3; ceiling_add: pull_power +3, finger_strength +3, lockoff +3; injury_risk_mult: 1.08; condition_mult: cold 0.96 | weight, power, overhang, roof | heavy_bones | — | Everything is strength-to-weight until you hit the ground. |
| heavy_bones | Heavy Bones | −4 | body | creation | P1a | attr_add: pull_power −4, finger_strength −3; injury_risk_mult: 0.92; hold_mult: crack_offwidth 1.04, crack_fist 1.02 | weight, injury, crack | light_frame | — | Dense. Durable. Last one up the roof. |
| fast_twitch | Fast Twitch | +4 | body | creation | P1a | ceiling_add: contact_strength +8, leg_power +8, anaerobic_capacity +6, aerobic_capacity −6, finger_endurance −6; adapt_rate_mult: contact_strength 1.15, finger_endurance 0.90 | power, dynamic, contact, boulder | slow_twitch | — | Stacks on fibre_bias. Four moves of fireworks, then a sit-down. |
| slow_twitch | Slow Twitch | +3 | body | creation | P1b | ceiling_add: aerobic_capacity +8, finger_endurance +8, anaerobic_capacity +4, contact_strength −6, leg_power −6; adapt_rate_mult: finger_endurance 1.15, contact_strength 0.90 | endurance, sport, static | fast_twitch | — | Never fast, never pumped, never done. |
| furnace | Furnace | +3 | body | creation | P2 | condition_mult: cold 1.06, heat 0.96; flags: sending_temp_shift=−4 | cold, friction, wind | cold_blooded, cold_hands | — | T-shirt in January. Suffers in Kalymnos in June. |
| cold_blooded | Cold Blooded | +2 | body | creation | P2 | condition_mult: heat 1.06, cold 0.94; flags: sending_temp_shift=+4 | heat, humid | furnace | — | Thrives when everyone else has gone to the beach. |
| bendy_shoulders | Bendy Shoulders | +3 | body | creation | P2 | attr_add: shoulder_mobility +8; ceiling_add: shoulder_mobility +10; hold_mult: gaston 1.04, undercling 1.04; flags: injury_site_mult:shoulder=1.15 | flexibility, compression, injury | stiff_shoulders, old_shoulder | — | Hypermobile. Reaches behind its own head; the labrum takes notes. |
| stiff_shoulders | Stiff Shoulders | −2 | body | creation | P1b | attr_add: shoulder_mobility −8; ceiling_add: shoulder_mobility −10; hold_mult: gaston 0.95, undercling 0.95 | flexibility | bendy_shoulders | — | Gastons feel like a dare. |
| bellows | Bellows | +4 | body | creation | P1b | attr_add: aerobic_capacity +6; ceiling_add: aerobic_capacity +6; resource_mult: aerobic_reserve 1.10; condition_mult: altitude 1.04 | endurance, sport, altitude, recovery | asthma | — | Big lungs. Recovers on holds you would not call a rest. |
| crusher_hands | Crusher Hands | +6 | body | creation | P1a | attr_add: finger_strength +6; ceiling_add: finger_strength +6 | crimp, edge, power | soft_fingers | — | Born on a 20 mm edge. |
| soft_fingers | Soft Fingers | −6 | body | creation | P1a | attr_add: finger_strength −6; ceiling_add: finger_strength −6 | crimp, edge | crusher_hands | — | Good for piano. Not for the 7 mm crimp. |
| springs | Springs | +4 | body | creation | P1b | attr_add: leg_power +8; ceiling_add: leg_power +6; move_mult: dyno 1.03 | dynamic, power, boulder | noodle_legs | — | Legs that think they are on a trampoline. |
| noodle_legs | Noodle Legs | −3 | body | creation | P1b | attr_add: leg_power −8; ceiling_add: leg_power −6; move_mult: dyno 0.97 | dynamic | springs | — | Launching is a hope, not a plan. |
| cold_hands | Cold Hands | −3 | body | creation | P2 | condition_mult: cold 0.93; flags: hot_aches_event_mult=2.0 | cold, ice, alpine | furnace | — | Fingers go white, then screaming. Every belay. |
| altitude_native | Altitude Native | +4 | body | creation | P4 | condition_mult: altitude 1.10; flags: acclimatise_rate_mult=1.5 | altitude, alpine | thin_blood | — | Born above the tree line. |
| thin_blood | Thin Blood | −3 | body | creation | P4 | condition_mult: altitude 0.92; flags: acclimatise_rate_mult=0.7 | altitude, alpine | altitude_native | — | Sea-level engine. |

### 2.2 Aptitude

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| crimp_machine | Crimp Machine | +6 | aptitude | creation | P1a | attr_add: tech_crimps +8, finger_strength +2; hold_mult: crimp 1.06, edge 1.04; adapt_rate_mult: tech_crimps 1.15 | crimp, edge, vertical, power | — | — | Smaller is better. Sharper is best. |
| sloper_whisperer | Sloper Whisperer | +10 | aptitude | creation | P1a | attr_add: tech_slopers +8, contact_strength +2; hold_mult: sloper 1.08; adapt_rate_mult: tech_slopers 1.15 | sloper, friction, compression, boulder | — | — | Holds nothing, stays on anyway. Fontainebleau will adopt you. |
| pinch_grip | Pinch Grip | +4 | aptitude | creation | P1a | attr_add: tech_pinches +8; hold_mult: pinch 1.08 | pinch, compression, power | — | — | Thumbs are a hand's second opinion. |
| pocket_fingers | Pocket Fingers | +4 | aptitude | creation | P1b | attr_add: tech_pockets +8; hold_mult: pocket1 1.06, pocket2 1.06, pocket3 1.04 | pocket, sport | — | — | Two fingers, no complaints. Frankenjura approves. |
| jam_hands | Jam Hands | +5 | aptitude | creation | P3 | attr_add: tech_cracks +10; hold_mult: crack_finger 1.05, crack_hand 1.08, crack_fist 1.08, crack_offwidth 1.06; move_mult: jam 1.05 | crack, jam, trad, bigwall | — | — | Tape is for people who do it wrong. |
| dyno_monkey | Dyno Monkey | +5 | aptitude | creation | P1a | attr_add: dynamic_movement +8, commitment +4; move_mult: dyno 1.06, deadpoint 1.04 | dynamic, power, boulder, comp | static_master | — | Why reach when you can fly. |
| static_master | Static Master | +10 | aptitude | creation | P1a | attr_add: lockoff +6, body_position +4; move_mult: static 1.04, high_step 1.03, dyno 0.96 | static, vertical, slab, trad | dyno_monkey | — | Slow is smooth. Smooth is sent. |
| core_of_steel | Core of Steel | +6 | aptitude | creation | P1a | attr_add: core_tension +10; ceiling_add: core_tension +6; move_mult: toe_hook 1.04; flags: feet_cut_recovery=+15 | core, roof, overhang, compression | — | — | Feet cut. Feet go back on. Nobody mentions it. |
| heel_hook_savant | Heel Hook Savant | +4 | aptitude | creation | P1a | attr_add: hip_mobility +3; move_mult: heel_hook 1.10 | footwork, flexibility, overhang, boulder | — | — | Sees a heel where others see a rest they cannot use. |
| kneebar_finder | Kneebar Finder | +4 | aptitude | creation | P1b | attr_add: route_reading +2; move_mult: kneebar 1.10; flags: reveal_kneebars | footwork, endurance, sport, redpoint | — | — | Hands-free on a 45° wall, grinning. Kneepad sold separately. |
| smear_faith | Smear Faith | +10 | aptitude | creation | P1a | attr_add: tech_slab +6; hold_mult: smear 1.08, foot_chip 1.04 | slab, smear, footwork, friction | — | — | There is no foothold. Stand on it anyway. |
| quiet_feet | Quiet Feet | +10 | aptitude | creation | P1a | attr_add: footwork +8; adapt_rate_mult: footwork 1.15 | footwork, slab, vertical | clumsy_feet | — | You never hear them climb. |
| clumsy_feet | Clumsy Feet | −10 | aptitude | creation | P1a | attr_add: footwork −8; adapt_rate_mult: footwork 0.90 | footwork | quiet_feet, dancer | — | Scrape, scrabble, swing. Repeat. |
| proprioceptor | Proprioceptor | +6 | aptitude | creation | P1b | attr_add: body_position +8; adapt_rate_mult: body_position 1.10 | footwork, flow, learning | — | — | Knows where its hips are without looking. Rarer than it sounds. |
| eagle_eye | Eagle Eye | +5 | aptitude | creation | P1a | attr_add: route_reading +10 | reading, onsight | beta_blind | — | Reads the sequence from the car. |
| beta_blind | Beta Blind | −2 | aptitude | creation | P1b | attr_add: route_reading −8 | reading | eagle_eye | — | Discovers the foothold on attempt nine. |
| gaston_goblin | Gaston Goblin | +3 | aptitude | creation | P2 | attr_add: shoulder_mobility +2; hold_mult: gaston 1.08, sidepull 1.04 | vertical, comp, gym | — | — | Opens doors nobody else can see. |
| topout_tidy | Topout Tidy | +3 | aptitude | creation | P1a | move_mult: mantle 1.10 | boulder, highball | topout_terror | — | The belly-flop is optional. |
| topout_terror | Topout Terror | −2 | aptitude | evolving | P1a | move_mult: mantle 0.90; flags: fear_source_mult:height=1.3 (mantle only); evolves_to: neutral after 40 clean mantles over ≥ 4 weeks | boulder, highball, fear | topout_tidy | — | The hard part is over. Now the terrifying part. |
| rope_gun | Rope Gun | +4 | aptitude | creation | P1b | attr_add: rope_craft +10 | sport, redpoint, onsight | — | — | Clips in one motion, pumps in none. |
| gear_whisperer | Gear Whisperer | +5 | aptitude | creation | P3 | attr_add: gear_placement +10; adapt_rate_mult: gear_placement 1.10 | trad, crack, risk | — | — | Every cam goes in bomber the first time. Mostly. |
| ice_natural | Ice Natural | +4 | aptitude | creation | P4 | attr_add: ice_tools +10 | ice, cold, alpine | — | — | Swings once. Hears the thunk. |
| resistance | Resistance | +2 | aptitude | creation | P1b | attr_add: anaerobic_capacity +8; ceiling_add: anaerobic_capacity +4 | endurance, power, sport | — | — | Eight hard moves in a row is a warm-up. |
| bear_hugger | Bear Hugger | +4 | aptitude | creation | P1b | attr_add: core_tension +4, shoulder_mobility +3; hold_mult: pinch 1.04, sloper 1.02 | compression, core, boulder | — | — | Squeezes the boulder until it gives up. |
| contact_catcher | Contact Catcher | +4 | aptitude | creation | P1b | attr_add: contact_strength +8 | contact, dynamic, power | slow_hands | — | Latches what it touches. |
| slow_hands | Slow Hands | −4 | aptitude | creation | P1b | attr_add: contact_strength −8 | contact, dynamic | contact_catcher | — | Arrives at the hold a moment after the hold left. |
| jug_hauler | Jug Hauler | +3 | aptitude | creation | P1b | attr_add: pull_power +3; hold_mult: jug 1.06, crimp 0.98 | jug, overhang, sport | — | — | Big holds, big moves, big forearms. |
| one_arm_wonder | One-Arm Wonder | +6 | aptitude | creation | P1b | attr_add: lockoff +8, pull_power +6; ceiling_add: lockoff +6 | power, static, overhang | — | — | Holds the lock-off long enough to think about it. |
| kinesthetic_learner | Kinesthetic Learner | +6 | aptitude | creation | P1b | adapt_rate_mult: footwork 1.15, body_position 1.15, dynamic_movement 1.15, tech_crimps 1.15, tech_slopers 1.15, tech_pinches 1.15, tech_pockets 1.15, tech_cracks 1.15, tech_slab 1.15 | learning | slow_learner | — | Shown once, owned forever. |
| slow_learner | Slow Learner | −5 | aptitude | creation | P1b | adapt_rate_mult: footwork 0.85, body_position 0.85, dynamic_movement 0.85, tech_crimps 0.85, tech_slopers 0.85, tech_pinches 0.85, tech_pockets 0.85, tech_cracks 0.85, tech_slab 0.85 | learning | kinesthetic_learner | — | Gets there. Eventually. Via everywhere else. |

### 2.3 Mental

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| ice_in_the_veins | Ice in the Veins | +2 | mental | creation | P1a | attr_add: composure +12; fear_add: −8 | fear, focus, highball, trad, risk | afraid_of_falling, jittery, unflappable | — | Heart rate on the runout: resting. |
| afraid_of_falling | Afraid of Falling | −2 | mental | evolving | P1a | attr_add: composure −6, commitment −4; fear_add: +10; flags: fear_source_mult:last_fall=1.5; evolves_to: falls_ok (30 practice falls over ≥ 6 weeks) → falls_well (60 practice falls + 10 falls without injury, ≥ 12 weeks) | fear, boulder, sport, highball | ice_in_the_veins, falls_well | — | The pad is right there. The pad is very far away. |
| overthinker | Overthinker | −2 | mental | creation | P1b | attr_add: focus −6, commitment −4, route_reading +3; flags: pre_move_time_mult=1.2 | focus, reading, patience | — | — | Has found four sequences. Is pumped on all of them. |
| beta_sponge | Beta Sponge | +4 | mental | creation | P2 | attr_add: route_reading +3; flags: beta_mult=1.5 | reading, partner, social, learning | stubborn | — | Hears "heel there" once and never forgets it. |
| flow_prone | Flow Prone | +2 | mental | creation | P1a | resource_mult: focus_meter 1.10; flags: flow_chance_mult=1.5 | flow, focus, boulder | — | — | Cannot remember the send. Was definitely there. |
| choker | Choker | −6 | mental | evolving | P1a | attr_add: confidence −4; flags: stakes_mult=0.94; evolves_to: neutral after 10 sends with stakes that beat the personal best, over ≥ 16 weeks | competition, focus, redpoint, comp | clutch | — | Flawless in the warm-up. Different person in the final. |
| clutch | Clutch | +6 | mental | creation | P1b | flags: stakes_mult=1.05 | competition, focus, redpoint, comp | choker | — | Only shows up when it counts. Annoying to train with. |
| rage_quitter | Rage Quitter | −2 | mental | creation | P1a | attr_add: resilience −6; flags: quit_after_fails=3, quit_chance=0.3, stoke_hit=8 | patience, flow | zen | — | The shoes came off with some force. |
| zen | Zen | +6 | mental | creation | P1b | attr_add: resilience +8, composure +6; resource_mult: stoke 1.15 | patience, fear, flow, recovery | rage_quitter | — | Falls off, smiles, re-chalks. People find it unsettling. |
| headpointer | Headpointer | +5 | mental | creation | P3 | attr_add: composure +4; flags: rehearsed_fear_mult=0.5 | fear, trad, redpoint, risk | onsight_purist | — | Top-rope it twelve times, then lead it like a stranger. |
| onsight_purist | Onsight Purist | +3 | mental | creation | P1b | attr_add: route_reading +6; flags: onsight_rep_mult=1.5, redpoint_stoke_penalty=2 (each go at a sport route from the fourth) | onsight, reading, ethics | headpointer, projector | — | A second go is an admission of something. |
| projector | Projector | +4 | mental | creation | P1a | flags: familiarity_k_mult=1.3, project_stoke_immunity | redpoint, patience, boulder, sport | onsight_purist | — | Attempt forty-one. Feels close. |
| patient | Patient | +5 | mental | creation | P2 | attr_add: resilience +4; resource_mult: burnout 0.85; flags: monotony_mult=0.5 | patience, recovery | impatient | — | Twelve weeks of repeaters. Fine. |
| impatient | Impatient | −4 | mental | creation | P2 | resource_mult: burnout 1.20; flags: abandon_project_after=6 | patience | patient | — | Six sessions and it is dead to you. |
| competitor | Competitor | +5 | mental | creation | P2 | flags: rival_present_mult=1.05, rivalry_gain_mult=1.5 | competition, comp, social | — | — | Climbs harder when somebody is watching. Needs somebody watching. |
| swagger | Swagger | +4 | mental | creation | P1a | attr_add: confidence +10 | fear, sponsor | imposter | — | Has not sent it yet. Has already told people. |
| imposter | Imposter | −4 | mental | creation | P1a | attr_add: confidence −10 | fear | swagger | — | Sent it. Assumes it is soft. |
| laser_focus | Laser Focus | +6 | mental | creation | P1a | attr_add: focus +10 | focus, onsight, comp | scatterbrain | — | The crag could be on fire. |
| scatterbrain | Scatterbrain | −2 | mental | creation | P1a | attr_add: focus −10 | focus | laser_focus | — | Mid-crux, remembers the parking meter. |
| cool_head | Cool Head | +4 | mental | creation | P2 | attr_add: risk_judgement +12 | risk, highball, trad, alpine | risk_blind, reckless | — | Knows exactly how bad it is. Climbs anyway, or doesn't. |
| risk_blind | Risk Blind | −4 | mental | creation | P2 | attr_add: risk_judgement −12 | risk | cool_head, cautious | — | "Looks fine" is a full risk assessment. |
| all_in | All In | +4 | mental | creation | P1b | attr_add: commitment +10 | dynamic, fear | hesitant | — | Does not know how to half-jump. |
| hesitant | Hesitant | −4 | mental | creation | P1b | attr_add: commitment −10 | dynamic, fear | all_in | — | Three false starts per dyno, then the hands open. |
| unflappable | Unflappable | +2 | mental | creation | P1b | attr_add: composure +10 | fear, focus | jittery, ice_in_the_veins | — | Belayer is screaming. Climber is chalking up. |
| jittery | Jittery | −2 | mental | creation | P1b | attr_add: composure −10 | fear | unflappable, ice_in_the_veins | — | Fear takes a long time to leave. It knows where you live. |
| bounce_back | Bounce Back | +5 | mental | creation | P2 | attr_add: resilience +10 | recovery, patience | brittle | — | Injured in March, psyched by April. |
| brittle | Brittle | −5 | mental | creation | P2 | attr_add: resilience −10 | recovery | bounce_back | — | One bad session, one bad month. |
| vertigo | Vertigo | −2 | mental | creation | P1b | flags: fear_source_mult:height=1.6 | fear, highball, bigwall, alpine | loves_air | — | The ground has opinions about you. |
| loves_air | Loves Air | +4 | mental | creation | P1b | flags: fear_source_mult:height=0.6; resource_mult: stoke 1.05 | fear, highball, bigwall, alpine | vertigo | — | Happiest four hundred metres up a rope. |
| summit_fever | Summit Fever | −5 | mental | creation | P4 | attr_add: risk_judgement −8; flags: alpine_only, retreat_option_penalty | risk, alpine, altitude | — | — | Turning around is for other people. The weather disagrees. |
| visualiser | Visualiser | +4 | mental | creation | P1b | attr_add: route_reading +3; flags: visualise_action=+0.10 | reading, focus, redpoint | — | — | Climbs it twice. Once with the eyes shut. |

### 2.4 Social (all P2: requires NPCs, relationships and reputation)

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| magnetic | Magnetic | +6 | social | creation | P2 | rep_mult: 1.20; flags: partner_find_mult=1.5, trust_gain_mult=1.3 | social, partner, reputation, sponsor | awkward, lone_wolf | — | Arrives alone. Leaves with a belayer, a sofa and a lift to Céüse. |
| awkward | Awkward | −5 | social | creation | P2 | rep_mult: 0.85; flags: partner_find_mult=0.7, trust_gain_mult=0.8 | social, partner | magnetic, storyteller, networker | — | Asked for a catch. Somehow apologised. |
| lone_wolf | Lone Wolf | −3 | social | creation | P2 | rep_mult: 0.90; flags: partner_find_mult=0.6, loneliness_immune | social, partner, boulder | magnetic, content_creator | — | Pads, playlist, nobody. Perfect. Until the rope routes. |
| spray_lord | Spray Lord | −3 | social | creation | P2 | rep_mult: 0.90; flags: trust_gain_mult=0.8, media_rep_mult=1.2 | social, media, reputation, ethics | humble | — | Will tell you the beta. Did not ask if you wanted it. |
| humble | Humble | +2 | social | creation | P2 | rep_mult: 1.05; flags: trust_gain_mult=1.2, sponsor_appeal_mult=0.9 | social, reputation, ethics | spray_lord | — | Logs it as "soft for the grade". It was not. |
| jealous | Jealous | −4 | social | creation | P2 | flags: partner_send_stoke=−5, rivalry_gain_mult=2.0 | social, competition | — | — | Happy for them. Visibly, aggressively happy for them. |
| loyal_belayer | Loyal Belayer | +4 | social | creation | P2 | flags: trust_gain_mult=1.5, belay_quality_received=+10, partner_reliability=+10 | partner, sport, trad | flaky | — | Catches you softly, shows up early, remembers your project. |
| flaky | Flaky | −4 | social | creation | P2 | flags: own_reliability=0.7, trust_gain_mult=0.7 | partner, social | loyal_belayer | — | "Running late" means tomorrow. |
| thick_skin | Thick Skin | +4 | social | creation | P2 | attr_add: resilience +4; flags: criticism_immune, rep_loss_mult=0.5 | social, reputation, media | thin_skin | — | The comment section is a weather system. You own a jacket. |
| thin_skin | Thin Skin | −4 | social | creation | P2 | flags: criticism_stoke=−3, rep_loss_mult=1.3 | social, reputation, media | thick_skin | — | Read one forum thread. Rest week. |
| teachable | Teachable | +4 | social | creation | P2 | event_weights: mentor_offer 2.0; flags: mentored_adapt_mult=1.05 | learning, partner, social | — | — | Old locals like you. That is worth more than a hangboard. |
| storyteller | Storyteller | +3 | social | creation | P2 | rep_mult: 1.10; flags: sponsor_pitch_mult=1.2 | media, social, sponsor | awkward | — | The epic gets better every retelling. |
| diplomat | Diplomat | +3 | social | creation | P2 | flags: access_violation_penalty_mult=0.5, ethics_rep_mult=1.2 | ethics, social, travel | — | — | Talked the farmer round. Twice. |
| grudge_holder | Grudge Holder | −3 | social | creation | P2 | event_weights: falling_out 1.5; flags: rivalry_decay=0 | social, competition | — | — | Remembers who short-roped them in 2019. |
| camera_ready | Camera Ready | +4 | social | creation | P2 | rep_mult: 1.10; flags: sponsor_appeal_mult=1.3 | sponsor, media | — | — | Falls photogenically. |
| networker | Networker | +4 | social | creation | P2 | flags: contact_gain_mult=1.5, sponsor_lead_mult=1.3 | sponsor, social, money | awkward | — | Knows a guy. Always knows a guy. |

### 2.5 Lifestyle (P2 unless noted: requires economy, travel, weather and the stoke/burnout clocks)

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| dirtbag | Dirtbag | +2 | lifestyle | creation | P2 | cost_mult: 0.70; flags: city_stoke=−2, sponsor_appeal_mult=0.9 | money, travel, patience | trust_fund, frugal, shiny_things | — | Rice, beans, a tarp and the best season of your life. |
| trust_fund | Trust Fund | +8 | lifestyle | creation | P2 | rep_mult: 0.95; flags: money_start_add=30000, stipend_monthly=1200, sponsor_appeal_mult=0.8 | money, travel | dirtbag, frugal, remote_worker | — | Flies to Rocklands on a whim. Everyone knows. |
| remote_worker | Remote Worker | +6 | lifestyle | creation | P2 | flags: income_per_work_block=300 (requires community ≥ medium or gym_tier ≥ 1 at current location) | money, travel | trust_fund | — | Two laptop days a week buys the other five. |
| van_life | Van Life | +4 | lifestyle | creation | P2 | cost_mult: 0.85; flags: has_vehicle, drive_cost_mult=0.6, accommodation_free_drive | travel, money | — | — | Home is wherever the gearbox stops. |
| gear_nerd | Gear Nerd | +3 | lifestyle | creation | P2 | flags: gear_wear_mult=0.8, gear_cost_mult=1.1, shoe_fit_friction=+0.02 | money, friction | — | — | Owns eleven pairs of shoes. Can explain each one. |
| insomniac | Insomniac | −5 | lifestyle | creation | P2 | attr_add: sleep_hygiene −10; resource_mult: energy 0.90 | sleep, recovery | hibernator | — | Four a.m. Thinking about the crux. |
| hibernator | Hibernator | +4 | lifestyle | creation | P2 | attr_add: sleep_hygiene +10 | sleep, recovery | insomniac | — | Nine hours in a tent on a slope. Refreshed. |
| early_bird | Early Bird | +3 | lifestyle | creation | P2 | flags: morning_energy_mult=1.1, dawn_patrol | sleep, cold, friction | night_owl | — | Sends in the cold before the crowd arrives. |
| night_owl | Night Owl | +2 | lifestyle | creation | P2 | flags: evening_energy_mult=1.1, morning_energy_mult=0.9, nightlife_event_mult=1.5 | sleep, social, gym | early_bird | — | Peak form at 10 p.m. under gym lights. Dawn patrol is theoretical. |
| iron_stomach | Iron Stomach | +4 | lifestyle | creation | P2 | cost_mult: 0.97; flags: illness_mult=0.4 | health, travel, nutrition | delicate_stomach | — | Street food in three countries, zero regrets. |
| delicate_stomach | Delicate Stomach | −4 | lifestyle | creation | P2 | cost_mult: 1.05; flags: illness_mult=1.8 | health, travel | iron_stomach | — | Lost the Hampi trip to a samosa. |
| polyglot | Polyglot | +5 | lifestyle | creation | P2 | attr_add: languages +15; ceiling_add: languages +10; adapt_rate_mult: languages 1.3 | social, travel, learning | monoglot | — | Gets the local beta in the local language. |
| monoglot | Monoglot | −3 | lifestyle | creation | P2 | attr_add: languages −10; ceiling_add: languages −20; adapt_rate_mult: languages 0.5 | travel | polyglot | — | Points at things. Loudly. |
| nervous_flyer | Nervous Flyer | −3 | lifestyle | evolving | P2 | flags: flight_stoke=−5, flight_energy=−20, jetlag_mult=1.5; evolves_to: neutral after 12 flights | travel, fear | — | — | Fine on a 40 m runout. Not fine at 10,000 m. |
| motion_sick | Motion Sick | −2 | lifestyle | creation | P2 | flags: surface_travel_energy=−15, boat_approach_penalty | travel, dws | — | — | The boat to the DWS cliff is the hardest part. |
| chalk_allergy | Chalk Allergy | −3 | lifestyle | creation | P2 | resource_mult: skin 0.90; cost_mult: 1.03; flags: liquid_chalk_only | skin, health | — | — | Itchy hands, pricey chalk. |
| frugal | Frugal | +3 | lifestyle | creation | P2 | cost_mult: 0.90 | money | dirtbag, trust_fund, shiny_things | — | Resoles twice before buying. |
| shiny_things | Shiny Things | −3 | lifestyle | creation | P2 | cost_mult: 1.15 | money | frugal, dirtbag | — | Needed the new pad. The old pad was fine. |
| fuelled | Fuelled | +4 | lifestyle | creation | P2 | attr_add: nutrition +10 | nutrition, recovery | junk_food | — | Meal-preps in a van. Somehow. |
| junk_food | Junk Food | −4 | lifestyle | creation | P2 | attr_add: nutrition −10 | nutrition, weight | fuelled | — | Crag snacks are a food group. |
| spreadsheet | Spreadsheet | +4 | lifestyle | creation | P2 | attr_add: logistics +12 | travel, money | disorganised | — | Permits booked eleven months out. Colour-coded. |
| disorganised | Disorganised | −3 | lifestyle | creation | P2 | attr_add: logistics −10 | travel | spreadsheet | — | Arrived at Hueco. Hueco is closed on Tuesdays. |
| weather_nose | Weather Nose | +4 | lifestyle | creation | P2 | attr_add: weather_sense +12 | wind, wet, friction | — | — | Smells the front coming before the app does. |
| homebody | Homebody | −4 | lifestyle | creation | P2 | flags: away_stoke=−3 (weekly, > 500 km from home_region) | travel | wanderlust | — | Misses the home crag by week two. |
| wanderlust | Wanderlust | +2 | lifestyle | creation | P2 | flags: new_country_stoke=+3, stale_stoke=−2 (weekly after 8 weeks at one crag) | travel | homebody | — | Project? There is a whole other continent. |
| skin_care_routine | Skin Care Routine | +3 | lifestyle | creation | P1b | resource_mult: skin 1.10; cost_mult: 1.02 | skin, recovery | — | — | Sands, files, balms. Climbs a day longer than you. |

### 2.6 History

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| gym_kid | Gym Kid | +5 | history | creation | P1a | attr_add: dynamic_movement +6, body_position +4, route_reading +2; flags: plastic_mult=1.05 | gym, comp, dynamic, boulder | late_starter | — | Raised on volumes. Rock is a texture upgrade. |
| gymnast | Gymnast | +6 | history | creation | P1a | attr_add: core_tension +8, shoulder_mobility +6, body_position +4 | core, flexibility, dynamic, power | desk_jockey | — | Front lever on day one. Finger strength to follow. |
| dancer | Dancer | +10 | history | creation | P1a | attr_add: footwork +8, hip_mobility +6, body_position +3 | footwork, flexibility, slab, flow | clumsy_feet, desk_jockey | — | Climbs like it is choreographed. It is. |
| rower | Rower | +5 | history | creation | P1b | attr_add: pull_power +6, aerobic_capacity +8 | endurance, power, sport | — | — | An engine looking for a wall. |
| farm_strong | Farm Strong | +5 | history | creation | P1b | attr_add: pull_power +4, core_tension +4, lockoff +4, skin_durability +6, finger_strength +2 | power, skin, jam | desk_jockey | — | Hay bales were the hangboard. |
| ex_military | Ex-Military | +5 | history | creation | P2 | attr_add: composure +8, logistics +8, resilience +4, hip_mobility −4 | fear, patience, travel | — | — | Packs in nine minutes. Stretching is a work in progress. |
| climber_parents | Climber Parents | +6 | history | creation | P1b | attr_add: route_reading +6, rope_craft +6, gear_placement +4, tech_slab +3, confidence +2 | learning, trad, partner, reading | late_starter | — | Learned to belay before long division. |
| guides_apprentice | Guide's Apprentice | +5 | history | creation | P1b | attr_add: rope_craft +8, logistics +5, weather_sense +5, risk_judgement +4 | trad, alpine, sport, risk | — | — | Coiled a thousand ropes. Clients still fall off. |
| late_starter | Late Starter | −3 | history | creation | P1a | attr_add: composure +4, logistics +4; adapt_rate_mult: footwork 0.90, body_position 0.90, dynamic_movement 0.90, tech_crimps 0.90, tech_slopers 0.90, tech_pinches 0.90, tech_pockets 0.90, tech_cracks 0.90, tech_slab 0.90; flags: requires_age_min=28 | learning, patience | gym_kid, climber_parents, podium_kid | — | First shoes at thirty. Zero bad habits, zero good ones. |
| academic | Academic | +3 | history | creation | P2 | attr_add: route_reading +4, logistics +4, languages +4, weather_sense +4, pull_power −3; flags: remote_income_mult=0.8 | reading, learning, money | — | — | Has a spreadsheet about the project. Has not done a pull-up. |
| content_creator | Content Creator | +4 | history | creation | P2 | rep_mult: 1.15; flags: sponsor_appeal_mult=1.3, content_blocks_per_week=1, offline_stoke=−2 | media, sponsor, money | lone_wolf | — | The send does not count until it uploads. |
| martial_artist | Martial Artist | +4 | history | creation | P1b | attr_add: hip_mobility +6, composure +4, leg_power +4 | flexibility, fear, dynamic | — | — | Breathes through the crux. High-steps like a kick. |
| swimmer | Swimmer | +4 | history | creation | P1b | attr_add: shoulder_mobility +8, aerobic_capacity +6, finger_strength −2; flags: swim_skill | endurance, flexibility, dws | — | — | Shoulders for days. Fingers for later. |
| runner | Runner | +3 | history | creation | P1b | attr_add: aerobic_capacity +10, pull_power −2, leg_power −2 | endurance, weight | — | — | Light, tireless, has never pulled on anything. |
| weightlifter | Weightlifter | +4 | history | creation | P1b | attr_add: pull_power +6, leg_power +6, core_tension +4, hip_mobility −4; flags: mass_shift=+3 | power, weight | — | — | Strong everywhere. Slightly too much of everywhere. |
| mountain_born | Mountain Born | +4 | history | creation | P2 | attr_add: weather_sense +8, logistics +3; condition_mult: altitude 1.05, cold 1.03 | altitude, cold, alpine | — | — | Grew up watching the ridge for weather. |
| coastal_fisher | Coastal Fisher | +3 | history | creation | P2 | attr_add: skin_durability +6, weather_sense +6, finger_strength +2; condition_mult: humid 1.03 | skin, wet, wind, dws | — | — | Hands like rope. Reads swell like a tide table. |
| feral_childhood | Feral Childhood | +4 | history | creation | P1b | attr_add: route_reading +3, confidence +4, body_position +3, skin_durability +3 | reading, boulder, fear | desk_jockey | — | Climbed trees, walls, parents. |
| desk_jockey | Desk Jockey | −4 | history | creation | P1a | attr_add: hip_mobility −6, shoulder_mobility −4, core_tension −3 | flexibility, money | gymnast, dancer, farm_strong, feral_childhood | — | Fifteen years in a chair. The hips remember. |
| podium_kid | Podium Kid | +4 | history | creation | P3 | flags: comp_isolation_nerves_mult=0.5 | comp, competition, gym | late_starter | — | Grew up in isolation zones. Comfortable there. |

### 2.7 Health and risk

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| bad_knee | Bad Knee | −5 | health | creation | P2 | move_mult: heel_hook 0.95, kneebar 0.92, high_step 0.97; flags: injury_site_mult:knee=1.5 | injury, health, footwork | — | — | Clicks on the approach. Complains on the heel hook. |
| old_shoulder | Old Shoulder | −5 | health | creation | P2 | attr_add: lockoff −4, shoulder_mobility −6; hold_mult: gaston 0.96; flags: injury_site_mult:shoulder=1.5 | injury, health | bendy_shoulders | — | Something happened in 2014. It is still happening. |
| asthma | Asthma | −4 | health | creation | P2 | attr_add: aerobic_capacity −6; ceiling_add: aerobic_capacity −6; condition_mult: cold 0.96, altitude 0.94 | health, endurance, cold, altitude | bellows | — | Inhaler in the chalk bag. |
| lucky | Lucky | +5 | health | creation | P2 | injury_risk_mult: 0.90; flags: reroll_bad_outcome=0.15, good_event_mult=1.2 | health, injury, risk | unlucky | — | The foot pops. The other foot finds something. |
| unlucky | Unlucky | −5 | health | creation | P2 | injury_risk_mult: 1.10; flags: reroll_good_outcome=0.15, bad_event_mult=1.2 | injury, risk | lucky | — | The one hold that snaps is the one you are on. |
| fast_healer | Fast Healer | +6 | health | creation | P2 | recovery_mult: 1.25 | recovery, injury, health | slow_healer | — | Back on the board before the physio has finished the invoice. |
| slow_healer | Slow Healer | −6 | health | creation | P2 | recovery_mult: 0.80 | recovery, injury | fast_healer | — | A tweak is a season. |
| addictive_personality | Addictive Personality | −4 | health | creation | P2 | event_weights: vice_chain 2.0; flags: stoke_swing_mult=1.5, familiarity_k_mult=1.1 | health, patience, money | — | — | Obsesses beautifully. Not always about climbing. |
| never_sick | Never Sick | +4 | health | creation | P2 | resource_mult: health 1.20; flags: illness_mult=0.5 | health, travel | sickly | — | Shared a tent with the flu. Unbothered. |
| sickly | Sickly | −4 | health | creation | P2 | resource_mult: health 0.85; flags: illness_mult=1.8 | health | never_sick | — | Catches whatever the crag has. |
| pain_tolerant | Pain Tolerant | +3 | health | creation | P2 | injury_risk_mult: 1.05; flags: skin_low_penalty_mult=0.5, injury_detect_delay | skin, injury, health | — | — | Climbs through the flapper. Notices the pulley a week late. |
| tweaky_elbows | Tweaky Elbows | −4 | health | creation | P2 | flags: injury_site_mult:elbow=1.8 | injury, tendon | — | — | Golfer's elbow on the left, tennis on the right. Plays neither. |
| bad_back | Bad Back | −4 | health | creation | P2 | attr_add: core_tension −4; flags: injury_site_mult:back=1.5, pad_carry_energy=+10 | injury, core | — | — | The pad is the real project. |
| weak_ankles | Weak Ankles | −3 | health | creation | P2 | flags: injury_site_mult:ankle=1.6 | injury, boulder, highball | cat_feet | — | Rolls it on the walk-in. |
| cat_feet | Cat Feet | +3 | health | creation | P2 | flags: injury_site_mult:ankle=0.6, landing_injury_mult=0.85 | injury, boulder, highball | weak_ankles | — | Lands, bends, walks off. |
| longevity | Longevity | +5 | health | creation | P2 | recovery_mult: 1.05; flags: decline_onset_shift=+3 | health, recovery | early_decline | — | Still crushing at forty-five. Nobody knows why. |
| early_decline | Early Decline | −4 | health | creation | P2 | flags: decline_onset_shift=−3 | health | longevity | — | Peaked early. Knows it. |

### 2.8 Quirks (cost 0, mixed sign)

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| reckless | Reckless | 0 | quirk | creation | P1a | attr_add: risk_judgement −8, commitment +8; fear_add: −5; injury_risk_mult: 1.15 | risk, fear, dynamic | cautious, cool_head | — | The highball looked shorter from the ground. Went anyway. |
| tunnel_vision | Tunnel Vision | 0 | quirk | creation | P1a | attr_add: focus +8, route_reading −6 | focus, reading | — | — | Nails the sequence. Misses the jug a metre left. |
| stubborn | Stubborn | 0 | quirk | creation | P1b | resource_mult: burnout 1.10; flags: familiarity_k_mult=1.2, beta_mult=0.5 | patience, redpoint | beta_sponge | — | Will do it their way. Eventually, that works. |
| cautious | Cautious | 0 | quirk | creation | P1b | attr_add: risk_judgement +6, commitment −4; fear_add: +4; injury_risk_mult: 0.90 | risk, fear | reckless, risk_blind | — | Checks the knot three times. Still alive. |
| big_hands | Big Hands | 0 | quirk | creation | P1b | hold_mult: crack_hand 1.05, crack_fist 1.05, pinch 1.04, sloper 1.02, pocket1 0.95, pocket2 0.96 | crack, pinch, pocket | small_hands | — | Hand jams are hand jams. Mono pockets are decoration. |
| small_hands | Small Hands | 0 | quirk | creation | P1b | hold_mult: pocket1 1.06, pocket2 1.04, crack_finger 1.05, crack_hand 0.95, crack_fist 0.96, pinch 0.97 | pocket, crack, pinch | big_hands | — | Fits the mono. Rattles in the hand crack. |
| purist | Purist | 0 | quirk | creation | P2 | flags: ethics_rep_mult=1.5, partner_conflict_mult=1.3, declines_chipped_routes | ethics, reputation, trad | — | — | Has opinions about kneepads. Shares them. |
| rival_magnet | Rival Magnet | 0 | quirk | creation | P2 | flags: rival_spawn_mult=2.0, rival_present_mult=1.03 | competition, social | — | — | Every crag has someone who needs to beat you. |
| superstitious | Superstitious | 0 | quirk | creation | P2 | event_weights: lucky_socks 1.0; flags: ritual_focus=+3/−5 | focus, flow | — | — | Left sock first. Always left sock first. |
| grade_sceptic | Grade Sceptic | 0 | quirk | creation | P2 | flags: self_report_di=−0.5, ethics_rep_mult=1.2, media_rep_mult=0.8 | ethics, reputation, media | — | — | "Probably 7b+." It was 7c. |
| perfectionist | Perfectionist | 0 | quirk | creation | P1b | adapt_rate_mult: body_position 1.10, footwork 1.10; flags: sketchy_send_stoke=−3 | learning, flow, patience | — | — | Sent it. Re-doing it because the heel was ugly. |
| heavy_chalker | Heavy Chalker | 0 | quirk | creation | P1a | resource_mult: chalk 0.70; flags: chalk_friction_base=+0.02, overchalk_penalty_mult=2.0 | friction, skin | — | — | Leaves a cloud. Leaves a mess. |
| downclimber | Downclimber | 0 | quirk | creation | P1b | flags: always_downclimb | injury, boulder, patience | — | — | Has never jumped off anything. Ankles intact, skin not. |

### 2.9 Hidden pool (opt-in roll, cost 0; `point_mass` in brackets; Σ positive = Σ negative = 30)

One draw from the positive half and one from the negative half, without replacement, redrawn on an `excludes` conflict. Each row names its foreshadowing event (fires week 3–9) and the hard reveal (week 12 at the latest).

| id | name | cost | category | kind | phase | effect | tags | excludes | requires | flavour (foreshadowing → reveal) |
|---|---|---:|---|---|---|---|---|---|---|---|
| natural_crimper | Natural Crimper | 0 [+5] | aptitude | hidden | P2 | hold_mult: crimp 1.05, edge 1.03 | crimp, edge | crimp_machine | — | "That edge felt bigger than it looked" → sheet shows the multiplier. |
| secret_stamina | Secret Stamina | 0 [+4] | body | hidden | P2 | ceiling_add: finger_endurance +8, aerobic_capacity +4 | endurance, sport | slow_twitch, fast_twitch | — | A partner notes you are not pumped → ceilings revealed. |
| head_for_heights | Head for Heights | 0 [+4] | mental | hidden | P2 | flags: fear_source_mult:height=0.7 | fear, highball, bigwall | vertigo, loves_air | — | Topped a highball without noticing the drop → fear source relabelled. |
| hidden_hypermobility | Hidden Hypermobility | 0 [+2] | body | hidden | P2 | attr_add: shoulder_mobility +8; flags: injury_site_mult:shoulder=1.15 | flexibility, injury | bendy_shoulders, stiff_shoulders | — | Shoulder "clunks" in a gaston → physio names it. |
| late_bloomer | Late Bloomer | 0 [+3] | body | hidden | P2 | adapt_rate_mult: all physical 0.90 until age 24, then 1.20 (flags: age-switched) | learning, power | — | — | Slow season → sudden spring. |
| deep_well | Deep Well | 0 [+5] | mental | hidden | P2 | attr_add: resilience +8 | recovery, patience | bounce_back, brittle | — | Shrugged off a bad week → revealed on the sheet. |
| natural_leader | Natural Leader | 0 [+4] | social | hidden | P2 | rep_mult: 1.10; flags: partner_find_mult=1.2 | social, reputation, partner | magnetic, awkward | — | Strangers ask you to organise the car-share → revealed. |
| weather_witch | Weather Witch | 0 [+3] | lifestyle | hidden | P2 | attr_add: weather_sense +8 | wind, wet, friction | weather_nose | — | Called the dry window the forecast missed → revealed. |
| latent_glass | Latent Glass | 0 [−6] | health | hidden | P2 | flags: injury_site_mult:finger=1.3 | tendon, injury, crimp | iron_tendons, glass_pulleys | — | A twinge on the warm-up crimp → physio screening or first grade-1 pulley strain. |
| stage_fright | Stage Fright | 0 [−4] | mental | hidden | P2 | flags: stakes_mult=0.96 | competition, focus, comp | choker, clutch | — | Fell off the warm-up with an audience → revealed after the first stakes attempt. |
| undiagnosed_asthma | Undiagnosed Asthma | 0 [−4] | health | hidden | P2 | attr_add: aerobic_capacity −4; condition_mult: cold 0.97 | health, endurance, cold | asthma, bellows | — | Wheezing on a cold approach → doctor event. |
| brittle_ego | Brittle Ego | 0 [−5] | mental | hidden | P2 | flags: project_fall_confidence=−2 (per fall on a route at or above personal best) | fear, redpoint | swagger, imposter | — | A quiet drive home → revealed on the third project fall. |
| cold_sensitive | Cold Sensitive | 0 [−3] | body | hidden | P2 | condition_mult: cold 0.95 | cold | furnace, cold_hands | — | Numb fingers at 9 °C → revealed on the first cold-day fall. |
| sweet_tooth | Sweet Tooth | 0 [−2] | lifestyle | hidden | P2 | attr_add: nutrition −4 | nutrition, weight | fuelled, junk_food | — | Bakery detour → body-fat drift noticed at the monthly check. |
| glass_ankle | Glass Ankle | 0 [−3] | health | hidden | P2 | flags: injury_site_mult:ankle=1.4 | injury, boulder, highball | weak_ankles, cat_feet | — | A roll on the walk-out → revealed on the first bad landing. |
| night_terrors | Night Terrors | 0 [−3] | lifestyle | hidden | P2 | attr_add: sleep_hygiene −6 | sleep, recovery | insomniac, hibernator | — | Partner mentions you shouted in the tent → revealed on the sheet. |

### 2.10 Acquired (granted by play, cost 0)

| id | name | cost | category | kind | phase | effect | tags | excludes | requires (trigger) | flavour |
|---|---|---:|---|---|---|---|---|---|---|---|
| falls_ok | Falls OK | 0 | mental | acquired | P1a | none (marker; removes afraid_of_falling) | fear | — | afraid_of_falling stage 1 (§1.7) | Still not fun. Fine though. |
| falls_well | Falls Well | 0 | mental | acquired | P1a | attr_add: composure +4; fear_add: −5; flags: fear_source_mult:last_fall=0.5 | fear, sport, boulder | afraid_of_falling | falls_ok stage 2 (§1.7) | Falls like it was the plan. |
| pulley_veteran | Pulley Veteran | 0 | health | acquired | P2 | ceiling_add: finger_strength −2; attr_add: risk_judgement +3; flags: injury_site_mult:finger=0.85, warmup_required | tendon, injury, risk | — | a healed grade ≥ 2 finger pulley injury | Warms up for forty minutes now. Nobody argues. |
| comp_yips | Comp Yips | 0 | mental | acquired | P3 | flags: stakes_mult=0.95 (comps only); removed after 2 clean finals | comp, competition, focus | — | 3 consecutive comp finals with a fall at margin > 0 | Cannot miss in training. Cannot catch in finals. |
| sandbagged | Sandbagged | 0 | mental | acquired | P2 | attr_add: route_reading +3; flags: rock_scope=<rock of the crag> | reading, onsight, ethics | — | 3 onsight falls within 14 days on routes ≥ 1 DI below onsight estimate at the same crag | Learned humility from a 6b. |
| crag_mayor | Crag Mayor | 0 | social | acquired | P2 | rep_mult: 1.20 (region only); flags: partner_find_mult=2.0 (local), beta_mult=1.5 (local) | social, reputation, partner | — | ≥ 120 climbing days at one crag within 730 days and regional reputation ≥ 60 | Knows the parking, the farmer and every sit start. |
| grit_hardened | Grit Hardened | 0 | aptitude | acquired | P2 | hold_mult: smear 1.04; flags: fear_source_mult:runout=0.8, rock_scope=sandstone_grit | friction, slab, fear, trad | — | 50 climbing days on `sandstone_grit` | Pebbles are footholds. Cold is conditions. |
| tufa_whisperer | Tufa Whisperer | 0 | aptitude | acquired | P2 | hold_mult: pinch 1.03, sloper 1.02; flags: rock_scope=limestone | pinch, sloper, sport | — | 40 climbing days on limestone with tufa features | Hugs the drip, finds the kneebar. |
| injury_wise | Injury Wise | 0 | mental | acquired | P2 | attr_add: risk_judgement +6; injury_risk_mult: 0.92 | risk, injury, recovery | — | 3 healed injuries of grade ≥ 2 | Knows what a tweak sounds like before it happens. |
| acclimatised | Acclimatised | 0 | body | acquired | P4 | condition_mult: altitude 1.15; expires 21 days after descending below 1,500 m | altitude, alpine | — | 14 consecutive days above 2,500 m | Temporary. Everything up there is. |
| jaded | Jaded | 0 | mental | acquired | P2 | resource_mult: stoke 0.90; flags: novelty_stoke_mult=1.5 | patience, travel | — | burnout > 80 on two separate occasions | Been there. Sent that. Needs somewhere new. |
| survivor | Survivor | 0 | mental | acquired | P4 | attr_add: composure +6, risk_judgement +6; fear_add: +4 | fear, risk, alpine | — | a death-eligible near miss survived | Came back from the thing most people do not come back from. |
| legend | Legend | 0 | social | acquired | P5 | rep_mult: 1.30; flags: sponsor_appeal_mult=1.5 | reputation, sponsor, media | — | DI ≥ 28 in any discipline or 3 first ascents at DI ≥ 25 | They name problems after you now. |

---

## 3. Archetypes and synergies

Archetypes are **detected, never chosen**. The detector runs after creation and again whenever a trait is acquired or evolves, matching predicates over the climber's traits (chosen, forced, revealed hidden, acquired) and their tags. Detection is purely cosmetic and narrative: a title on the character sheet, NPC dialogue variants, sponsor interest, event weights and a few UI skins. **Archetypes never change numbers**, which is how the "synergies are additive" rule survives contact with players. A climber may hold several archetypes; the sheet shows the two with the most matching traits.

Predicate notation: `tag:slab ≥ 3` means at least three held traits carry the tag `slab`; `trait:x` means the trait is held; `bg:x` means the background.

| Archetype | Predicate | Cosmetic / dialogue hooks |
|---|---|---|
| Slab Wizard | `tag:slab ≥ 3` or (`trait:smear_faith` and `trait:quiet_feet`) | Locals call you over for the "impossible" slab; shoe sponsors pitch soft shoes; slab-day events ×1.5 |
| Comp Kid | `bg:gym_comp_kid` or (`tag:comp ≥ 2` and `trait:gym_kid`) | Comp invitations ×1.5; old-school NPCs tease about "plastic"; isolation-zone flavour text |
| Siege Engine | `trait:projector` and (`trait:patient` or `trait:stubborn`) and `tag:redpoint ≥ 2` | NPCs ask about "the project" by name; sponsors value long-form content; project-anniversary event |
| Compression Monster | `tag:compression ≥ 2` and (`trait:core_of_steel` or `trait:bear_hugger`) | Gneiss-crag NPCs (Magic Wood, Ticino) seek you out; "squeeze" dialogue; forest-boulder festival invite |
| Diesel | `tag:endurance ≥ 3` and `tag:sport ≥ 1` | Céüse and Kalymnos locals offer long-route partnerships; "you never get pumped" dialogue; endurance-camp events |
| Headpointer | `trait:headpointer` or (`tag:trad ≥ 2` and `tag:fear ≥ 2` and `trait:ice_in_the_veins`) | Gritstone locals share top-rope rigs; magazine profile event; partners ask whether you are "going for the lead" |
| Alpinist | `tag:alpine ≥ 3` | Hut wardens know your name; weather-window rumours arrive a day early; guide-fee discounts |
| Crag Mayor | `trait:crag_mayor` | Local beta flows to you; access-meeting event where your word carries weight; newcomers ask you for partners |
| Crimp Machine | `trait:crimp_machine` and (`trait:crusher_hands` or `tag:crimp ≥ 3`) | Frankenjura and Rocklands NPCs defer on crimp beta; hangboard-brand sponsor interest |
| Launcher | `trait:dyno_monkey` and `tag:dynamic ≥ 3` | Comp routesetters mention you; spectators gather on dyno problems; viral-clip event |
| Sloper Sage | `trait:sloper_whisperer` and `tag:friction ≥ 2` | Fontainebleau old-timers nod; Font-circuit completion ceremonies have extra lines |
| Crack Addict | `trait:jam_hands` and `tag:crack ≥ 2` | Indian Creek rack-share events; "tape or no tape" dialogue; splitter first-ascent rumours |
| Tufa Hugger | `trait:tufa_whisperer` or (`trait:kneebar_finder` and `tag:sport ≥ 2` and `tag:endurance ≥ 1`) | Kneepad sponsor; Rodellar and Kalymnos cave-season invites |
| Frozen | `tag:ice ≥ 2` or (`trait:ice_natural` and `trait:furnace`) | Ouray and Rjukan locals; hot-aches dialogue variants; cold-kit sponsor |
| Big Wall Rat | `tag:bigwall ≥ 2` and `tag:patience ≥ 1` | Camp 4 veterans share haul beta; portaledge sunset flavour text; multi-day weather-commit event |
| Dirtbag | `trait:dirtbag` or (`bg:dirtbag_dropout` and `tag:money ≥ 2`) | Campground-culture events; free couch offers; sponsors treat you as "authentic" (appeal ×1.1 in dialogue only) |
| Influencer | `trait:content_creator` or `tag:media ≥ 3` | Follower-count line on the sheet; crag NPCs either fawn or sneer; sponsor-obligation events |
| Grey Wolf | `trait:late_starter` and age ≥ 35 and `tag:patience ≥ 1` | "You started when?" dialogue; mentor role offered to younger NPCs; comeback-story magazine event |
| Prodigy | age ≤ 19 and DI_boulder_est ≥ 22 at creation | Coaches approach; sponsor junior programme; pressure events ×1.5 |
| Technician | `tag:footwork ≥ 3` and `tag:power ≤ 1` | "Makes it look easy" dialogue; coaching side-income event |
| Boulder Beast | `tag:power ≥ 3` and `tag:boulder ≥ 2` | Hueco and Rocklands locals; "do you even rope up?" banter |
| Onsight Machine | `trait:onsight_purist` or (`trait:eagle_eye` and `tag:onsight ≥ 2`) | Route-of-the-day challenges from locals; onsight-tour sponsor story |
| Zen Master | `trait:zen` and `tag:flow ≥ 2` | Calm-belayer requests; meditation retreat event; partners' fear sources −1 (dialogue-labelled, cosmetic only in P2; numeric hook deferred to 15) |
| Glass Cannon | (`trait:glass_pulleys` or `trait:latent_glass` or `trait:paper_skin`) and `tag:power ≥ 2` | Physio NPC recurring character; "warm up properly" dialogue from mentors |
| Workhorse | `trait:patient` and `tag:endurance ≥ 2` and `tag:recovery ≥ 1` | Training-camp invitations; coach NPC praises consistency |
| Globetrotter | `tag:travel ≥ 3` and countries visited ≥ 5 | Passport-stamp sheet skin; locals ask "where were you last?"; visa-hassle events have friendlier outcomes |

---

## 4. Sample builds

Three complete creations proving the budget closes. Base attribute values before background are physical 20, technique 10, mental 35, lifestyle 25 ([02 §F](02-character-model.md)); backgrounds are as specified in [04](04-backgrounds.md); allocation is 60 points, max +25 to one attribute.

### 4.1 "Forest Sloper": P1a Fontainebleau boulderer

**Background:** Gymnast (`point_bonus` 3, forced trait `gymnast`, start `fontainebleau`). **Body:** f · 19 · 160 cm · body fat 17% · ape 1.03 · finger_length +1 · finger_girth 0 · leg_torso 0 · natural hip 70 · natural shoulder 75 · fibre_bias +0.4 · skin thick · moisture dry.

| Step | Trait | Cost | Running total |
|---|---|---:|---:|
| start | background bonus | +3 | 3 |
| 1 | sloper_whisperer | −10 | −7 |
| 2 | pinch_grip | −4 | −11 |
| 3 | t_rex_arms (body negative 1) | +10 | −1 |
| 4 | rage_quitter (mental negative 1) | +2 | 1 |
| 5 | heavy_chalker (quirk) | 0 | **1 ✓** (1 point unspent) |

Checks: 5 chosen traits ≤ 12 ✓ · total refund 12 ≤ 12 ✓ · ≤ 2 negatives per category ✓ · no mirror conflicts ✓ · all traits P1a ✓. Before the re-costing ([26 §10.5](26-p1b-implementation-notes.md)) the same budget bought Core of Steel and Smear Faith as well, with Topout Terror as a third refund.

**Allocation (60):** finger_strength +15 · contact_strength +10 · tech_slopers +10 · tech_slab +8 · footwork +8 · body_position +5 · route_reading +4 = 60 ✓.

**Resulting values** (base + background `attr_add` + allocation + trait `attr_add`): finger_strength 20+0+15+0 = **35** · contact_strength 20+0+10+2 = **32** · core_tension 20+6+0+8 = **34** · tech_slopers 10+0+10+8 = **28** · tech_pinches 10+0+0+8 = **18** · tech_slab 10+0+8 = **18** · footwork 10+0+8 = **18** · body_position 10+2+5+4 = **21** · route_reading 10−4+4 = **10** · hip_mobility 20+4 = **24** · shoulder_mobility 20+4+6 = **30** · resilience 35−6 = **29** · composure/focus/confidence/commitment **35**. Multipliers on the wall: sloper 1.08, pinch 1.08, smear 1.02, static 0.98; reach ×0.97; chalk friction +0.02. Display estimate (05c inversion): DI 14.9 boulder (Font 6B; 15.2 for the build before the re-costing), stronger on slopers and pinches, weaker on reachy static problems, which is exactly the story the player chose.

### 4.2 "Diesel": P1b sport endurance build

**Background:** Rower/Swimmer (`point_bonus` 2, forced trait `rower`, start `kalymnos`). **Body:** m · 24 · 178 cm · body fat 11% · ape 1.02 · finger_length 0 · finger_girth −1 · leg_torso +1 · natural hip 50 · natural shoulder 70 · fibre_bias −0.5 · skin normal · moisture normal.

| Step | Trait | Cost | Running total |
|---|---|---:|---:|
| start | background bonus | +2 | 2 |
| 1 | slow_twitch | −3 | −1 |
| 2 | bellows | −4 | −5 |
| 3 | resistance | −2 | −7 |
| 4 | sweaty_hands (body negative 1) | +4 | −3 |
| 5 | slow_hands (aptitude negative 1) | +4 | 1 |
| 6 | hesitant (mental negative 1) | +4 | 5 |
| 7 | small_hands (quirk) | 0 | **5 ✓** (5 points unspent: Resistance cost 5 before the re-costing) |

Checks: 7 traits ✓ · refund 12 ✓ · category caps ✓ · slow_twitch stacks with fibre_bias −0.5 by design (ceilings, not values) ✓.

**Allocation (60):** finger_endurance +15 · aerobic_capacity +10 · finger_strength +12 · rope_craft +8 · route_reading +5 · footwork +5 · composure +5 = 60 ✓.

**Resulting values:** aerobic_capacity 20+8+10+8+6 = **52** (ceiling +8 slow_twitch, +6 bellows, +5 fibre_bias) · finger_endurance 20+4+15 = **39** (ceiling +8, +5) · finger_strength 20+0+12 = **32** · pull_power 20+4+0+6 = **30** · anaerobic_capacity 20+0+0+8 = **28** (ceiling +4, +4) · contact_strength 20+0+0−8 = **12** (ceiling −6, −5) · rope_craft 10+0+8 = **18** · footwork 10+0+5 = **15** · route_reading 10+0+5 = **15** · composure 35+5 = **40** · commitment 35−10 = **25**. Resource: aerobic_reserve pool ×1.10; chalk restores ×0.70; humid 0.94, heat 0.95 (Kalymnos in May will hurt). Pocket multipliers from small_hands suit the tufa-and-pocket limestone. The build cannot dyno and knows it: `commitment` 25 means the hesitation penalty is live on every deadpoint, which is the trade.

### 4.3 "Quiet Lead": bold trad build (P3)

**Background:** Trad Family (`point_bonus` 3, forced trait `climber_parents`, start `peak_district`). **Body:** m · 27 · 183 cm · body fat 13% · ape 1.04 · finger_length 0 · finger_girth +1 · leg_torso 0 · natural hip 45 · natural shoulder 55 · fibre_bias 0 · skin thick · moisture dry.

| Step | Trait | Cost | Running total |
|---|---|---:|---:|
| start | background bonus | +3 | 3 |
| 1 | ice_in_the_veins | −2 | 1 |
| 2 | gear_whisperer | −5 | −4 |
| 3 | wanderlust | −2 | −6 |
| 4 | slow_hands (aptitude negative 1) | +4 | −2 |
| 5 | motion_sick (lifestyle negative 1) | +2 | 0 |
| 6 | purist (quirk) | 0 | **0 ✓** |

Checks: 6 traits ✓ · refund 6 ✓ · caps ✓ · ice_in_the_veins and the background's composure add do not conflict (no `attr_mult` anywhere) ✓. Ice in the Veins cost 8 before the second re-costing pass ([26 §11.2](26-p1b-implementation-notes.md)), and the build took Soft Fingers' refund of 6 to pay for it.

**Allocation (60):** gear_placement +12 · tech_cracks +12 · rope_craft +8 · composure +6 · risk_judgement +6 · footwork +6 · body_position +5 · finger_strength +5 = 60 ✓.

**Resulting values:** gear_placement 10+6+12+4+10 = **42** · tech_cracks 10+4+12 = **26** · rope_craft 10+6+8+6 = **30** · composure 35+4+6+12 = **57** · risk_judgement 35+4+6 = **45** · route_reading 10+4+0+6 = **20** · tech_slab 10+0+0+3 = **13** · confidence 35+2 = **37** · finger_strength 20+0+5 = **25** · contact_strength 20−2−8 = **10** · footwork 10+6 = **16** · body_position 10+5 = **15**. Fear baseline shifts −8 and decays at `0.08 × 57 ≈ 4.6` per clean move, so runouts stop mattering quickly; the danger label is accurate to within ~55% noise and improving. On the wall this climber is weak (DI ~12 physically) but will lead E2 5b with gear that goes in first time, which is the gritstone fantasy: bold, not strong. The `purist` quirk adds the ethics dialogue that fits.

---

## 5. Combinatorics: large, and distinct where it matters

**Raw count.** Creation choices multiply:

| Factor | Count | Note |
|---|---:|---|
| Body sliders | ≈ 1.4 × 10¹⁴ | height 56 × body fat 21 × ape 15 × finger_length 5 × finger_girth 5 × leg_torso 5 × hip 101 × shoulder 101 × fibre_bias 21 × skin 3 × moisture 3 × sex 2 × mass shift 17 |
| Backgrounds | 15 | |
| Starting age | 30 | 16–45 |
| Trait sets | Σₖ≤₁₂ C(150, k) ≈ 1.9 × 10¹⁷ | with the 179 creation and evolving rows actually in §2 it is ≈ 1.7 × 10¹⁸; exclusions, budget and caps cut this by perhaps 10³ |
| Attribute allocation | C(94, 34) ≈ 4.4 × 10²⁵ | compositions of 60 points over 35 attributes before the +25 cap |

Backgrounds × ages × trait sets alone is 15 × 30 × 1.9 × 10¹⁷ ≈ 8.5 × 10¹⁹ > 10¹⁵ before a single slider moves; the full product is around 10⁶⁰. The number is meaningless except as a guarantee that no two players will ever see the same sheet.

**Why the count is not the point.** Most of those states are indistinguishable on the wall: a 1 cm height change or one allocation point moved between two technique attributes is noise. Distinctness has to be argued through the two structures that convert choices into outcomes:

1. **Tags.** Every trait, attribute, hold type, move class and crag style profile carries tags from the one vocabulary ([schemas §2](schemas.md)). Two builds are *meaningfully* different when their tag profiles (the multiset of tags across traits plus the attribute vector projected onto tag families) differ by at least one tag with a combined weight ≥ 6 attribute-equivalent points. The archetype detector is a coarse-grained readout of that profile; the ~26 archetypes, their pairwise combinations and the P1a attribute space give on the order of 10³–10⁴ *recognisably different climbers*, which is the number that matters for replay value.
2. **The 05b matrix.** The attribute × hold-type × move-class matrix ([05b §3](05b-move-resolution-and-attempt-loop.md)) is where a tag profile becomes a send or a fall. Because cells weight different attributes (crimp/static leans on `finger_strength` and `lockoff`; sloper/static on `contact_strength`, `core_tension` and `tech_slopers`; jug/dyno on `pull_power`, `leg_power` and `dynamic_movement`), two builds of equal total points but different tag profiles land at different DI on different *kinds* of route. The harness measures this directly: the **P1a success criterion** is that two different builds produce visibly different outcomes on the same problem within a 20-minute phone session ([01](01-pillars-scope-roadmap.md)); the operational test ([19](19-balance-and-simulation-testing.md)) is that for any pair of P1a sample builds, the per-hold-family DI estimates differ by ≥ 1.0 DI on at least one family.

So the design goal is not "10⁶⁰ builds" but "every build the UI nudges a player toward has a tag profile that the matrix turns into a different experience", and the harness owns the proof.

---

## 6. Research grounding for the body and health magnitudes

The body-trait numbers above are deliberately conservative versions of effect sizes in the plan appendix:

- **Iron Tendons / Glass Pulleys (±25 hidden robustness, injury ×0.80 / ×1.25).** 13% of climbers report a pulley injury within two years, pulley injuries are ~12% of all climbing injuries and fingers 33–52%; A2 and A4 pulleys are 63–68% thicker in experienced climbers and still thickening after a decade. A ±20–25% swing in connective-tissue injury rate is well inside the between-individual spread that thickness data implies, and the trait is deliberately *not* made larger because an A2 rupture costs 2–3 months to heal and 4–6 to full load, which the harness will already price steeply.
- **Gecko Skin / Paper Skin (±10 `skin_durability`, heal ×1.25 / ×0.80).** No published effect size exists for skin as a performance limiter; the numbers are set so that Gecko Skin adds about one extra attempt per session on sharp rock and Paper Skin removes one, which is the lived difference climbers describe. Sandstone is 15.6–18.4% grippier than limestone and chalk adds 18.7–21.6% friction, so Heavy Chalker's +0.02 base is a small fraction of the real chalk effect and its doubled over-chalk penalty reflects Fuss & Niegl's finding that excess chalk on holds reduces friction.
- **Rubber Hips / Tight Hips (±10 `hip_mobility`).** Flexibility explained ~1.8% of grade variance in Mermier's PCA, but hip flexibility was a direct predictor of women's bouldering competition results, so the trait is priced as a medium attribute (w = 0.7) plus small move multipliers, not as a headline strength trait.
- **Light Frame / Heavy Bones.** Elite top-100 BMI is 21.1 (m) / 19.3 (f) with *no* BMI–grade correlation in 9,900 general users; "10 cm shorter ≈ 2.5% more relative finger strength". Light Frame's +10 points of relative strength is at the upper edge of what that implies and is taxed with injury ×1.08 and cold ×0.96, mirroring the body-fat trade-offs in [02 §A.1](02-character-model.md).
- **Fast / Slow Twitch (±6–8 ceilings).** Boulderers tested 26–53% higher than lead climbers on maximal and explosive strength with equal finger endurance; a ±8 ceiling swing on a 100-point scale is a fraction of that observed between-discipline gap, leaving room for training to do most of the work (Mermier: training explained 58.9% of variance).
- **Furnace / Cold Blooded (±4 °C window shift).** Practitioner sending temperatures cluster at 8–15 °C with shoe rubber tuned around 0–5 °C rubber temperature; Fuss & Niegl found no linear friction effect between 12 and 28 °C, which is why the window is a bell and the trait moves its centre by less than the window's half-width.
- **Afraid of Falling → Falls Well (30 falls over ≥ 6 weeks; 60 for stage 2).** Weekly progressive fall practice over months is the documented intervention; advanced climbers show no lead-vs-toprope anxiety gap while intermediates do (40.1 vs 33.1 anxiety score, ~50% high-anxiety on lead vs <10% on toprope). The thresholds are set so the evolution takes a realistic season, not a weekend.
- **Age-related traits (Longevity, Early Decline ±3 years).** Logged hardest grades are flat from 18 to the mid-30s; explosive strength declines ~3%/yr in the 30s. A three-year shift of the curve onset is a modest, plausible individual difference.

---

## Open questions / proposed schema additions

1. **`point_mass` field.** [schemas §9.2](schemas.md) says hidden traits "carry a `point_mass`" but the `Trait` interface has no such field. Proposed: `point_mass?: number` on `Trait`, required when `kind === 'hidden'`.
2. **Site-specific injury multipliers.** Seven traits need per-site injury risk (knee, shoulder, elbow, back, ankle, finger). They use the documented flag `injury_site_mult:<site>=x`; proposed to promote it to `TraitEffect.injury_site_mult?: Partial<Record<InjuryDef['site'], number>>` when [13](13-injury-and-health.md) lands.
3. **Age requirements.** Late Starter needs `age_start ≥ 28` and backgrounds need age windows ([04](04-backgrounds.md)). Proposed: `requires_age?: [min, max]` on `Trait` and `age_range: [min, max]` on `Background`; until then the flag `requires_age_min` carries it.
4. **`resource_mult` semantics.** This doc assumes the multiplier applies to regeneration/gain (skin heal, energy regen, stoke deltas, burnout accrual, chalk restored per chalk-up, starting pools for `aerobic_reserve` and `power`). [02 §B.5](02-character-model.md) should state this explicitly or the field should be split. P1b implements these meanings ([26 §8.1](26-p1b-implementation-notes.md)); energy refills to its cap each morning, so `energy` has nothing to multiply until regeneration is partial.
5. **Scoped effects.** Sandbagged, Crag Mayor, Grit Hardened and Tufa Whisperer restrict their effect to one rock type or region via `flags: rock_scope`. Proposed: `TraitEffect.scope?: { rock?: RockType; region?: string; discipline?: Discipline }`.
6. **Temporary acquired traits.** Acclimatised expires 21 days after descent and Comp Yips is removed after two clean finals. Proposed: `expires?: { days?: number; condition?: string }` on `Trait`.
7. **Event ids** referenced in `event_weights` (`mentor_offer`, `falling_out`, `vice_chain`, `lucky_socks`) must be defined in [15](15-social-reputation-events.md); treat them as reservations.
8. **`stakes` attempt context.** Choker, Clutch, Stage Fright and Comp Yips rely on a boolean attempt-context flag `stakes` (comp final, redpoint go at or above personal best, audience ≥ 3 NPCs). [05b](05b-move-resolution-and-attempt-loop.md) should own the definition. P1b implements the redpoint clause, with "at" meaning within 0.25 DI of the discipline's personal best ([26 §8.1](26-p1b-implementation-notes.md)); comp finals and audiences wait for P2–P3.
9. **Hidden-side exclusions.** Hidden-pool rows list exclusions against creation traits one-way (checked at roll time from the hidden side). The validator should accept one-way `excludes` for `kind: 'hidden'` only.
10. **`attr_mult` reservation.** No creation trait in this catalogue uses `attr_mult`; it is reserved for acquired traits and P5 content so the one-per-attribute rule is satisfied by construction. If a future creation trait needs it, the pairwise-exclusion validator rule applies.
11. **Hidden roll size.** "2 for +2" is the only offered roll (tune). If the harness shows players never opt in, consider "2 for +3".
