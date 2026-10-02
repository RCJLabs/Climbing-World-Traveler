# Backgrounds

A background is the first choice at creation and the only one that touches every budget at once: it sets the trait-point bonus, nudges starting attributes, fixes starting money, places the climber at a crag with some gear and a few contacts, forces one or two traits that define the backstory and locks the ones that contradict it. Fifteen backgrounds cover the ways real people arrive at climbing; five of them ship in P1a and all five start at Fontainebleau.

Related: [schemas §4.5](schemas.md) · [02 Character Model](02-character-model.md) · [03 Traits](03-traits.md) · [09 World Atlas](09-world-atlas.md) · [14 Economy](14-economy-gear-logistics.md) · [15 Social](15-social-reputation-events.md) · [16 Meta-progression](16-meta-progression-and-runs.md)

All numbers are first-pass proposals **(tune)**; the balance harness ([19](19-balance-and-simulation-testing.md)) re-costs `point_bonus` and `attr_points` so that every background's median 5-year outcome lands within ±1 DI of the others while the *shape* of the career stays distinct.

---

## 1. How a background is applied

Order of operations follows [02 §B.5](02-character-model.md): Body ceilings → background `attr_add` → player allocation of `attr_points` → trait adds → clamp to ceilings.

- **`point_bonus`** (0–6) is the trait-budget seed. Backgrounds with strong `attr_add` or lots of money get a low bonus; thin backgrounds get a high one, so total starting power is roughly flat and the choice is about *shape*.
- **`attr_add`** sums to between +6 and +20 net across all backgrounds (tune). Negative adds are real: a Desk-Job Late Starter's hips really are tighter.
- **`attr_points`** defaults to 60; it drops to 50–55 for backgrounds whose adult life has not been physical and rises to 65–70 only where money and contacts are poor.
- **`money_start`** is USD-equivalent cash on day one. It is a budget, not a score: [14](14-economy-gear-logistics.md) prices a Fontainebleau month at roughly $900–1,400 and a Rocklands trip at ~$70/day including flights.
- **`start_crag`** must have `phase ≤ background.phase` ([schemas §9.7](schemas.md)). All P1a backgrounds start at `fontainebleau`; any background may be redirected to Fontainebleau through the quick-start override in [16](16-meta-progression-and-runs.md) so that the P1a slice can host every backstory once P2 ships their systems.
- **`gear_start`** uses gear ids from [14](14-economy-gear-logistics.md); ids used here are listed in §5 for that doc to adopt.
- **`contacts`** seed the relationship map with NPC archetypes from the start crag's pool ([15](15-social-reputation-events.md)); `count` persistent NPCs are generated with `trust` 30–50.
- **`forced_traits`** are granted at cost 0 and do not count toward the 12-trait limit; **`locked_traits`** are unselectable.
- **`tags`** feed the archetype detector and the "helps with / hurts with" panel.

### 1.1 Interaction with `age_start`

Backgrounds carry an **age window** (proposed schema field `age_range`, see Open questions). Inside the window, [02 §A.1](02-character-model.md) age rules apply unchanged: per year over 18, +0.8 to `composure`, `risk_judgement` and `logistics` (cap +16) and +$1,500 (cap +$30,000); tendon adaptation slows and injury risk rises +1%/yr over 30. The background's own `money_start` is *in addition* to the age money. Two consequences the UI shows explicitly:

- A **Desk-Job Late Starter at 42** starts with ~$18,000 + $30,000 = $48,000, `composure`/`risk_judgement`/`logistics` at +16 each, and a tendon half-time about 1.85× that of a 25-year-old. Rich, calm, slow to adapt.
- A **Gym Comp Kid at 16** has the growth-plate window active (campus and full-crimp training injury ×2.5, `tech_crimps` gains ×0.7 until 17), no age money, and the longest possible career.

Where the window is narrow the slider is clamped and the reason is shown ("Comp Kids are 16–22; pick Desk-Job Late Starter for an adult start").

---

## 2. The fifteen backgrounds

Each block lists the `Background` fields in schema order. `attr_add` values are added to the base values of [02 §F](02-character-model.md) (physical 20, technique 10, mental 35, lifestyle 25) before the player's allocation.

### 2.1 Gym Comp Kid · `gym_comp_kid` · **P1a**

| Field | Value |
|---|---|
| point_bonus | 2 |
| attr_add | dynamic_movement +8, body_position +6, route_reading +4, contact_strength +4, confidence +4, tech_slab −4, risk_judgement −4 |
| attr_points | 60 |
| money_start | $3,000 |
| start_crag | fontainebleau |
| gear_start | shoes_aggressive, chalk_bag, crash_pad_small, brush_kit |
| contacts | coach ×1, comp_peer ×2 |
| forced_traits | gym_kid |
| locked_traits | late_starter, dirtbag, climber_parents |
| tags | gym, comp, dynamic, boulder, power |
| age window | 16–22 |
| hook | Twelve years of plastic, podiums and a coach who said "rock will ruin your technique". Your parents drove you to Fontainebleau for a gap-year trip and quietly hoped you would not like it. You liked it. The volumes were lying to you about slopers, and the forest has opinions about your footwork. |

### 2.2 Trad Family · `trad_family` · P3

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | rope_craft +6, gear_placement +6, route_reading +4, composure +4, risk_judgement +4, tech_cracks +4, dynamic_movement −4, contact_strength −2 |
| attr_points | 60 |
| money_start | $6,000 |
| start_crag | peak_district |
| gear_start | rack_half, rope_60, shoes_stiff, helmet, harness |
| contacts | family_veteran ×2, club_partner ×1 |
| forced_traits | climber_parents |
| locked_traits | gym_kid, late_starter, risk_blind |
| tags | trad, crack, fear, partner, reading |
| age window | 16–30 |
| hook | You were belaying before you could spell it, on gritstone, in the rain, for parents who think bolts are a moral failing. You have a rack older than you are and an inherited suspicion of anyone who has not fallen on a nut. Strength was never discussed at the dinner table. Judgement was. |

### 2.3 Mountain Village · `mountain_village` · P4

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | weather_sense +10, aerobic_capacity +6, logistics +4, composure +4, leg_power +4, tech_slab +2, body_position −2, finger_strength −2 |
| attr_points | 60 |
| money_start | $5,000 |
| start_crag | chamonix |
| gear_start | boots_b2, axes_pair, rope_60, shoes_stiff, helmet, harness, approach_shoes |
| contacts | guide ×1, hut_warden ×1 |
| forced_traits | mountain_born |
| locked_traits | thin_blood, nervous_flyer |
| tags | alpine, altitude, cold, ice, wind |
| age window | 16–35 |
| hook | You grew up under the lift lines, carrying skis before school and reading the ridge for weather because the forecast was for tourists. Rock is something you did on the way to summits. Now the summits are the point, and so are the hours you can spend at 3,500 m before your hands stop working. |

### 2.4 Gymnast · `gymnast` · **P1a**

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | core_tension +6, shoulder_mobility +4, body_position +2, lockoff +4, hip_mobility +4, dynamic_movement +2, route_reading −4, aerobic_capacity −4 |
| attr_points | 60 |
| money_start | $4,000 |
| start_crag | fontainebleau |
| gear_start | shoes_aggressive, chalk_bag, crash_pad_small |
| contacts | coach ×1 |
| forced_traits | gymnast |
| locked_traits | desk_jockey, clumsy_feet, stiff_shoulders |
| tags | core, flexibility, dynamic, power, boulder |
| age window | 16–26 |
| hook | Retired at nineteen with a bad wrist, a perfect front lever and no idea what to do with either. A friend took you to the forest. Every move felt like something you had already done upside down on a bar. Your fingers have not caught up with your core, and route reading is a language you are learning late. |

### 2.5 Dancer · `dancer` · **P1a**

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | footwork +8, hip_mobility +6, body_position +4, composure +2, finger_strength −4, pull_power −4 |
| attr_points | 60 |
| money_start | $3,500 |
| start_crag | fontainebleau |
| gear_start | shoes_soft, chalk_bag, crash_pad_small |
| contacts | studio_friend ×1 |
| forced_traits | dancer |
| locked_traits | clumsy_feet, tight_hips, desk_jockey |
| tags | footwork, flexibility, slab, flow, boulder |
| age window | 17–30 |
| hook | Ten years of training the body to be exactly where it needs to be, and then a company fold and a knee that said "enough". Slabs feel like floor work. Your feet are already better than most climbers' will ever be; your fingers are a liability and you know it. The forest circuits are a choreography you have not learned yet. |

### 2.6 Rower / Swimmer · `rower_swimmer` · P1b

| Field | Value |
|---|---|
| point_bonus | 2 |
| attr_add | aerobic_capacity +8, pull_power +4, shoulder_mobility +4, finger_endurance +4, hip_mobility −4, tech_slab −2 |
| attr_points | 60 |
| money_start | $5,000 |
| start_crag | kalymnos |
| gear_start | shoes_moderate, harness, quickdraws_12, rope_70, chalk_bag |
| contacts | club_mate ×1 |
| forced_traits | rower |
| locked_traits | asthma, noodle_legs |
| tags | endurance, power, sport, flexibility |
| age window | 18–30 |
| hook | An engine built for six-minute efforts and an upper body that does not know how to be tired. You cannot touch your toes. A university trip to Kalymnos put you on 35-metre tufa routes and you discovered that pump is a thing other people get. You have no idea how to stand on a foothold. |

### 2.7 Farm Kid · `farm_kid` · P2

| Field | Value |
|---|---|
| point_bonus | 2 |
| attr_add | skin_durability +8, pull_power +4, core_tension +4, lockoff +4, weather_sense +4, finger_strength +2, hip_mobility −4, footwork −2 |
| attr_points | 60 |
| money_start | $2,500 |
| start_crag | red_river_gorge |
| gear_start | shoes_stiff, harness, rope_60, vehicle_beater |
| contacts | neighbour_partner ×1 |
| forced_traits | farm_strong |
| locked_traits | trust_fund, desk_jockey, paper_skin |
| tags | power, skin, money, weight |
| age window | 16–32 |
| hook | Hay bales, fence posts and a grip that comes from never having had a day off. You found the Red by accident on a drive to a feed store and never quite went home. Your skin does not tear, your hips do not open, and you own a truck that is held together with hope. |

### 2.8 Ex-Military · `ex_military` · P2

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | composure +8, logistics +8, resilience +6, risk_judgement +4, aerobic_capacity +4, hip_mobility −6, shoulder_mobility −4 |
| attr_points | 55 |
| money_start | $12,000 |
| start_crag | red_rocks |
| gear_start | approach_shoes, shoes_moderate, harness, rope_60, rack_half, helmet |
| contacts | veteran_buddy ×1 |
| forced_traits | ex_military |
| locked_traits | flaky, rage_quitter |
| tags | fear, patience, travel, risk |
| age window | 24–45 |
| hook | Eight years of carrying heavy things up hills while people shouted. You are calm in ways that unsettle belayers, you pack a bag in nine minutes, and your hips have the range of motion of a filing cabinet. Red Rocks is a short drive from the base you left, and the long routes do not scare you. The grades do. |

### 2.9 Desk-Job Late Starter · `desk_job_late_starter` · **P1a**

| Field | Value |
|---|---|
| point_bonus | 4 |
| attr_add | logistics +6, risk_judgement +4, composure +4, hip_mobility −6, shoulder_mobility −4, core_tension −2, dynamic_movement −4 |
| attr_points | 50 |
| money_start | $18,000 |
| start_crag | fontainebleau |
| gear_start | shoes_moderate, chalk_bag, crash_pad_large, brush_kit |
| contacts | gym_buddy ×1 |
| forced_traits | desk_jockey, late_starter |
| locked_traits | gym_kid, gymnast, dancer, rower, climber_parents, podium_kid |
| tags | money, patience, learning, reading |
| age window | 28–45 |
| hook | Fifteen years of meetings, a pension you have decided not to wait for, and a body that learned to sit. You can afford the good pad and the long trip. What you cannot buy is the decade of movement everybody else got for free, so you will have to be patient, and you are, because patience was the job. |

### 2.10 Dirtbag Dropout · `dirtbag_dropout` · **P1a**

| Field | Value |
|---|---|
| point_bonus | 5 |
| attr_add | resilience +4, logistics +4, skin_durability +4, weather_sense +4, nutrition −6, sleep_hygiene −4 |
| attr_points | 60 |
| money_start | $800 |
| start_crag | fontainebleau |
| gear_start | shoes_moderate, chalk_bag, crash_pad_small, tent, stove |
| contacts | camp_crew ×2 |
| forced_traits | dirtbag |
| locked_traits | trust_fund, shiny_things, homebody |
| tags | money, travel, patience, boulder |
| age window | 18–30 |
| hook | You left the course, the lease and the group chat, and arrived at the forest with a tent, a pad and enough for six weeks of lentils. Everyone at the campsite is your friend because nobody has anything. You will climb more days this year than anyone you know; whether you eat properly is a separate question. |

### 2.11 Academic · `academic` · P2

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | route_reading +6, logistics +4, languages +6, weather_sense +4, focus +4, pull_power −4, leg_power −2 |
| attr_points | 55 |
| money_start | $9,000 |
| start_crag | peak_district |
| gear_start | shoes_moderate, harness, rope_60, chalk_bag, crash_pad_small |
| contacts | lab_mate ×1, visiting_prof ×1 |
| forced_traits | academic |
| locked_traits | risk_blind |
| tags | reading, learning, money, travel |
| age window | 22–40 |
| hook | A postdoc with a conference budget and a supervisor who does not check where you are. You read a boulder like a paper: abstract, method, obvious flaw. Your grant pays for the trips if you write something at the crag. Your pull-up count is a number you do not say aloud. |

### 2.12 Trust Fund · `trust_fund` · P2

| Field | Value |
|---|---|
| point_bonus | 0 |
| attr_add | confidence +4, logistics +2, languages +4, resilience −4, skin_durability −2 |
| attr_points | 60 |
| money_start | $60,000 |
| start_crag | ceuse |
| gear_start | shoes_soft, shoes_aggressive, shoes_stiff, harness, rope_70, quickdraws_12, crash_pad_large, vehicle_van, kneepad |
| contacts | family_fixer ×1 |
| forced_traits | trust_fund |
| locked_traits | dirtbag, frugal, remote_worker |
| tags | money, travel, sport |
| age window | 18–35 |
| hook | Money has never been the problem and that is, in its way, the problem. You have the van, the three pairs of shoes and a summer under Céüse's blue streaks before you have climbed 7a. Everyone is polite. Nobody is impressed. Hardship is going to have to be something you choose. |

### 2.13 Guide's Apprentice · `guides_apprentice` · P3

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | rope_craft +8, gear_placement +6, logistics +6, weather_sense +6, risk_judgement +6, composure +2, dynamic_movement −4, contact_strength −2 |
| attr_points | 60 |
| money_start | $4,500 |
| start_crag | squamish |
| gear_start | rack_full, rope_60, shoes_stiff, helmet, harness, approach_shoes |
| contacts | mentor_guide ×1, client_regular ×1 |
| forced_traits | guides_apprentice |
| locked_traits | reckless, risk_blind, flaky |
| tags | trad, alpine, patience, partner, risk |
| age window | 19–35 |
| hook | Three seasons carrying the second rope for a guide who taught you to read weather, place gear and never say "probably fine". You can rig anything, you are allergic to sketchy, and you have climbed almost nothing hard because clients were paying for the easy stuff. Squamish has polished cracks that do not care. |

### 2.14 Content Creator · `content_creator` · P2

| Field | Value |
|---|---|
| point_bonus | 1 |
| attr_add | confidence +6, logistics +4, languages +2, focus −4, composure −2 |
| attr_points | 60 |
| money_start | $7,000 |
| start_crag | hueco_tanks |
| gear_start | camera_kit, shoes_aggressive, crash_pad_large, chalk_bag, brush_kit |
| contacts | editor ×1, follower_partner ×2 |
| forced_traits | content_creator |
| locked_traits | lone_wolf, awkward |
| tags | media, sponsor, social, boulder |
| age window | 18–35 |
| hook | Forty thousand followers and a sponsor who wants a reel every week. Hueco season is content season: roofs, huecos, a permit lottery and a 70-person daily cap that makes every clip feel exclusive. You are confident, you are good on camera, and you have never climbed anything without checking the light first. |

### 2.15 Coastal Fisher · `coastal_fisher` · P2

| Field | Value |
|---|---|
| point_bonus | 3 |
| attr_add | skin_durability +8, weather_sense +8, finger_strength +4, composure +4, pull_power +2, languages −2, route_reading −4, footwork −2 |
| attr_points | 60 |
| money_start | $3,000 |
| start_crag | kalymnos |
| gear_start | shoes_moderate, harness, rope_60, quickdraws_12 |
| contacts | fisher_crew ×2 |
| forced_traits | coastal_fisher |
| locked_traits | paper_skin, motion_sick, homebody |
| tags | skin, wet, wind, dws, sport |
| age window | 18–38 |
| hook | Nets, ropes, salt and a grandfather who dived for sponges without a tank. The island filled with climbers and one of them showed you the Grande Grotta. Your hands are leather, you read a swell better than a forecast, and the limestone over the water does not frighten you the way it should. |

---

## 3. Comparison table

| id | phase | bonus | Σ attr_add | attr_points | money | start_crag | forced | key tags |
|---|---|---:|---:|---:|---:|---|---|---|
| gym_comp_kid | **P1a** | 2 | +18 | 60 | 3,000 | fontainebleau | gym_kid | gym, comp, dynamic |
| trad_family | P3 | 3 | +22 | 60 | 6,000 | peak_district | climber_parents | trad, crack, fear |
| mountain_village | P4 | 3 | +26 | 60 | 5,000 | chamonix | mountain_born | alpine, altitude, cold |
| gymnast | **P1a** | 3 | +14 | 60 | 4,000 | fontainebleau | gymnast | core, flexibility, power |
| dancer | **P1a** | 3 | +12 | 60 | 3,500 | fontainebleau | dancer | footwork, flexibility, slab |
| rower_swimmer | P1b | 2 | +14 | 60 | 5,000 | kalymnos | rower | endurance, power, sport |
| farm_kid | P2 | 2 | +20 | 60 | 2,500 | red_river_gorge | farm_strong | power, skin, money |
| ex_military | P2 | 3 | +20 | 55 | 12,000 | red_rocks | ex_military | fear, patience, risk |
| desk_job_late_starter | **P1a** | 4 | −2 | 50 | 18,000 | fontainebleau | desk_jockey, late_starter | money, patience, learning |
| dirtbag_dropout | **P1a** | 5 | +6 | 60 | 800 | fontainebleau | dirtbag | money, travel, patience |
| academic | P2 | 3 | +18 | 55 | 9,000 | peak_district | academic | reading, learning, money |
| trust_fund | P2 | 0 | +4 | 60 | 60,000 | ceuse | trust_fund | money, travel, sport |
| guides_apprentice | P3 | 3 | +28 | 60 | 4,500 | squamish | guides_apprentice | trad, alpine, risk |
| content_creator | P2 | 1 | +6 | 60 | 7,000 | hueco_tanks | content_creator | media, sponsor, social |
| coastal_fisher | P2 | 3 | +18 | 60 | 3,000 | kalymnos | coastal_fisher | skin, wet, dws |

Reading the table: the forced trait is the hidden half of every background's value (Gymnast's +14 `attr_add` plus the `gymnast` trait's +18 is a stronger physical start than Trad Family's +22, which is why Gymnast's bonus is not higher). Guide's Apprentice has the largest raw `attr_add` but spends it on niche attributes (`rope_craft`, `gear_placement`, lifestyle), each weighted 0.5 in the [03 §1.4](03-traits.md) heuristic. Trust Fund is the deliberate outlier: zero bonus, near-zero attributes, and more money than most careers earn in five years. The harness is expected to move individual bonuses by ±1 **(tune)**.

### 3.1 The P1a five

Gym Comp Kid, Gymnast, Dancer, Desk-Job Late Starter and Dirtbag Dropout all start at `fontainebleau`, between them cover the P1a trait set (power, flexibility, footwork, patience/money, hardship) and span ages 16–45, which is enough to prove the P1a success criterion that two builds feel different on the same problem. Their forced traits (`gym_kid`, `gymnast`, `dancer`, `desk_jockey` + `late_starter`, `dirtbag`) are all P1a-live; `dirtbag`'s `cost_mult` acts on the P1a fixed daily-cost money stub and its stoke and sponsor flags activate in P2 without a save migration.

---

## 4. Design notes

- **Bonus versus attributes.** `point_bonus` is set by the rule *bonus ≈ 6 − round(value of attr_add + forced trait + money in attribute-equivalent points) / 6*, clamped to 0–6 (tune). Dirtbag Dropout's +6 `attr_add`, a +5 forced trait and $800 give it the highest bonus; Trust Fund's $60,000 (worth roughly 15 attribute points of career outcome in the harness's first-pass economy) gives it zero.
- **Negative adds are visible.** The creation screen shows background `attr_add` as green/red deltas on the attribute list before allocation, so a player sees that the Late Starter's hips start at 14, not 20, and can spend allocation to compensate or lean into a crimpy vertical style instead.
- **Locks are narrative, not balance.** Every lock removes a trait that contradicts the backstory (a Trust Fund kid cannot be a Dirtbag). Balance is handled by the point economy in [03 §1](03-traits.md).
- **Contacts matter more than money in P2.** Two starting contacts at a crag with a large community are worth more sessions than $5,000, because partners gate rope days ([15](15-social-reputation-events.md)). Backgrounds with few contacts (Gymnast, Rower, Ex-Military) compensate with money or bonus.

## 5. Identifiers introduced here for other docs to adopt

- **Gear ids** (for [14](14-economy-gear-logistics.md)): `shoes_soft`, `shoes_moderate`, `shoes_stiff`, `shoes_aggressive`, `chalk_bag`, `brush_kit`, `crash_pad_small`, `crash_pad_large`, `harness`, `rope_60`, `rope_70`, `quickdraws_12`, `rack_half`, `rack_full`, `helmet`, `approach_shoes`, `kneepad`, `tent`, `stove`, `vehicle_beater`, `vehicle_van`, `camera_kit`, `boots_b2`, `axes_pair`.
- **Contact archetypes** (for [15](15-social-reputation-events.md)): `coach`, `comp_peer`, `family_veteran`, `club_partner`, `guide`, `hut_warden`, `studio_friend`, `club_mate`, `neighbour_partner`, `veteran_buddy`, `gym_buddy`, `camp_crew`, `lab_mate`, `visiting_prof`, `family_fixer`, `mentor_guide`, `client_regular`, `editor`, `follower_partner`, `fisher_crew`.
- **Crag ids** (for [09](09-world-atlas.md)): `fontainebleau`, `kalymnos`, `peak_district`, `chamonix`, `red_river_gorge`, `red_rocks`, `ceuse`, `squamish`, `hueco_tanks`.

## Open questions

1. **`age_range` on `Background`.** The age windows in §2 need a schema field: proposed `age_range: [number, number]` on `Background`, enforced at creation by clamping the `age_start` slider. Until it exists the windows are UI copy only.
2. **Crag phases.** `peak_district` is used by Trad Family (P3) and Academic (P2); the Academic start assumes the Peak's bouldering is live in P2 even though its trad is P3. [09](09-world-atlas.md) must either give the crag `phase: P2` or Academic moves to `fontainebleau`. `ceuse` must be P2 for Trust Fund.
3. **Money as attribute-equivalent.** The bonus rule treats $4,000 ≈ 1 attribute point of career outcome (tune). The harness should measure this directly; if money turns out to matter more, Trust Fund and Desk-Job Late Starter lose `attr_points` rather than bonus (they are already at 0 and 4).
4. **Forced traits and the 12-trait cap.** This doc and [03 §1.1](03-traits.md) agree that forced traits do not count toward the cap; the creation UI should show them in a separate "from your background" row so the count is legible.
5. **Quick-start override.** Redirecting any background to `fontainebleau` for P1a testing bypasses [schemas §9.7](schemas.md); the override should be a run option visible in the action log (`new_run.options`), not a silent default.
