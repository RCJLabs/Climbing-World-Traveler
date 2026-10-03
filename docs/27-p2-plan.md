# P2 Plan

How P2, "World" ([01 §4](01-pillars-scope-roadmap.md)), is built: the order of its milestones, what each implements and makes live, and the test that closes it. It is a plan, not a design: the systems are designed in [09](09-world-atlas.md)–[16](16-meta-progression-and-runs.md). Where those docs disagree with each other or with the code, §6 lists the conflict and a proposal, to be settled before the milestone that needs it. As P2 lands, its departures from the design go to an implementation-notes doc, as [22](22-p1a-implementation-notes.md) and [26](26-p1b-implementation-notes.md) did for P1a and P1b.

Related: [01 §4](01-pillars-scope-roadmap.md) · [18](18-tech-architecture.md) · [19](19-balance-and-simulation-testing.md) · [20](20-content-pipeline.md) · [24](24-simulation-game.md)

---

## 0. Where P1b leaves the game

| System | After P1b, as built | P2 asks |
|---|---|---|
| Crags | 2: Fontainebleau (boulders) and Kalymnos (routes); one discipline per crag, decided in five places (`run.ts`, `tactics.ts`, `format.ts`, `report.ts`, `career.ts`); every crag's route data imported at startup | the 30 crags 09 §2 tags P2 (32 live with Font and Kalymnos): 10 bouldering, 17 sport, 3 with both; crag data loaded on arrival ([20 §2](20-content-pipeline.md)) |
| Travel | 2 hubs, 3 legs; the fare is the only cost; travel days have no blocks and cost no energy; the bot never travels | 38 hubs and 61 legs (09 §8); energy and living costs per travel day ([11 §1](11-time-career-aging.md)); vehicles, fees, visas, permits, access rules, jet lag ([14 §5–7](14-economy-gear-logistics.md)) |
| Weather | a Markov chain per crag, sending temperatures, wind; Font's wet rule for every sandstone and limestone's for every other rock; a perfect one-day forecast; seasons are labels | friction terms, condensation, wet rules per rock, snow, heat, altitude, dawn and dusk, forecast accuracy by `weather_sense`, seasons that open and close crags ([10](10-weather-and-conditions.md), [11 §2](11-time-career-aging.md)) |
| Injuries | none: a fall's severity κ is recorded and never rolled; `health` stays at 100 | 24 injuries and an epiphyseal variant, rolled from falls, load, moves and illness; heal and full-load windows, rehab, permanent losses, health care ([13](13-injury-and-health.md)) |
| Training | 11 activities at $20 everywhere; three adaptation clocks; the load ratio feeds burnout only | 20 activities with antagonists, deload and rehab; finger load feeding injury risk; facilities by gym tier; lodging and food factors ([12](12-training-and-adaptation.md)) |
| Aging, run ends | ceilings by age; retire (from day 1), bankrupt, burnout (no event) | growth plates, a shifting decline, a yearly line, the last-season prompt, forced retirement by injury, death when enabled, the burnout event chain, injuries in the summary and the score ([11 §3–5](11-time-career-aging.md), [16 §6](16-meta-progression-and-runs.md)) |
| Money | $35 a day everywhere, odd jobs at $50 a block, no gear | costs by cost tier and lodging, five income sources, gear and its wear, insurance, sponsorship ([14](14-economy-gear-logistics.md)) |
| People | one belayer and spotter stub at quality 50 | NPCs with lives, partners, mentors and rivals, reputation and ethics ([15 §1–3](15-social-reputation-events.md)) |
| Events | none | the event deck: 10 written, 74 titled, 16 hidden-trait foreshadows ([15 §4](15-social-reputation-events.md)) |
| Traits, backgrounds | 85 traits live at creation; 7 backgrounds | 100 more trait rows (77 creation or evolving, 16 hidden, 7 acquired) and 4 to make selectable; 5 more backgrounds, and Farm Kid at its own start ([03 §2](03-traits.md), [04](04-backgrounds.md)) |
| Harness | one-year careers at one crag: about 4 s of one worker at Font and 40 s at Kalymnos; every career reaches the day limit and counts as retired | 10,000 careers of up to ten years, run-end shares, injury rates, money curves ([19 §1](19-balance-and-simulation-testing.md)); [18 §7](18-tech-architecture.md) wants them in 30 minutes, about 55 times Font's speed and 550 times Kalymnos's |
| Screens | Title and Hall, Create, Planner, Crag, Routes, Watch, Result, Report, Character, Summary | World Map, Journal and tick list, Social, Shop ([17 §5](17-ui-ux.md)) |

## 1. How P2 is cut

| Rule | Why |
|---|---|
| **Depth before breadth.** The systems that change a career (injuries, training and aging, money, weather) land at the two crags the game has; the atlas comes after | the harness can measure a system at two calibrated crags; at thirty uncalibrated ones it measures the crags |
| **The harness first.** M0 makes careers long, fast and countable before any system needs them measured; every later milestone adds its section to the harness report and calibrates its numbers against its doc's anchors | every P1 balance pass had to build its harness tooling first; P2's exit criterion is a harness result |
| **Traits come live with their systems** (03 §1.3), and the re-costing ([19 §4](19-balance-and-simulation-testing.md)) runs after each milestone that makes traits live | 26 §10 shows what an inert clause costs: free points |
| **Content in batches**, through the pipeline ([20](20-content-pipeline.md)), validator rules first | about 30 crags, 32–34 style profiles, 90 signatures and 400 event outcomes are the bulk of P2's work |
| **One milestone, one or more pull requests, one implementation-notes section** | as P1b ran M1–M4 |

Recommendation: split P2 into **P2a**, the systems at Font and Kalymnos (M0–M5), and **P2b**, the world (M6–M9). P2a ends with a release worth playing for years at two crags; P2b with the exit criterion. See the open questions.

## 2. Milestones

| # | Milestone | Implements | Makes live | Exit test |
|---|---|---|---|---|
| M0 | Harness at scale | 19 §1–2's missing modes | — | 1,000 ten-year careers at both crags in under 2 hours on 4 workers, with run-end shares and money curves in the report |
| M1 | Groundwork for a bigger world | 18 §5, 18 §7, 20 §2, schemas §6 | the 10 P2 traits whose systems are already live | Font and Kalymnos load on arrival; a test crag with boulders and routes plays both; a build gate holds every chunk under budget |
| M2 | Injuries and health | 13; 11 §4's forced retirement; 12 §5's load and injury link | about 20 injury and illness traits, the injury clauses of 4 live traits, 2 acquired | injury rates and the site mix within 13 §1's anchors over 1,000 careers |
| M3 | Training, aging and run ends | 11, 12 | 6 traits (aging, stoke and burnout, the day planner), acquired Jaded | ten-year careers: median length and run-end shares within the agreed targets (§6) |
| M4 | Money and gear | 14 §1–4, 14 §8–9 | 5 economy traits | money p10/median/p90 by month and the bankruptcy share within 19 §1's targets |
| M5 | Weather and seasons | 10, 11 §2 | Weather Nose and the weather side clauses | sending days by month match 09's season scores at both crags; calibration unchanged |
| M6 | The atlas and travel | 09, 14 §5–7, 17 §5 World Map | 10 travel traits, 5 backgrounds, acquired Grit Hardened | every P2 crag passes calibration (C1–C4, C7); travelling careers follow the seasons |
| M7 | People | 15 §1–3, 17 §5 Social | 21 social and reputation traits, acquired Crag Mayor | partner days, belay quality and reputation curves within 15's ranges |
| M8 | Events, sponsorship, hidden traits | 15 §4, 14 §2.1, 03 §1.6 | event and sponsor traits, the hidden pool, acquired Sandbagged and Tufa Whisperer | event rate per season, sponsor income share and reveal timing within target |
| M9 | P2 exit | 01 §4 | the remaining rows | the exit criterion (§5) |

### M0 Harness at scale

| Item | Detail |
|---|---|
| Long careers | `--years`; the bot retires by 19 §1's rule (burnout over 85 for 60 days, or age 55) and travels at the end of a crag's season; the report gains run-end shares and money p10/median/p90 by month |
| `--policy plan` | the default week (24 §2.2) as a third policy, so traits are priced for the player the game starts (26 §10.3: technique traits are worth five to ten times more to the project bot than to the volume bot) |
| Speed | at Kalymnos, generating routes is 44% of a career and the estimate 18% (26 §10.2): cache routes across careers that share a seed and a crag, and estimate from the benchmarks only when the attributes have moved. Target 10× at Kalymnos and 3× at Font, so that 1,000 ten-year careers fit in two hours |
| Samples | builds that start at either crag in one run (the sampler keeps one start crag today) |
| Reports | an injury section, empty until M2; run ends; per-background and per-age-band grades (19 §1) |

### M1 Groundwork for a bigger world

| Item | Detail |
|---|---|
| Crag fields | schemas §6's missing fields: `lat`, `lon`, `hub`, `access`, `community_size`, `language`, `gym_tier`, `connectivity`, `climate_class`, `npc_archetypes`, `look` ([25](25-visual-representation.md)) |
| Mixed crags | discipline by sector and route, not by crag; one grade estimate per discipline (the estimate merges every profile at a crag today); grades shown in the crag's own system ([08](08-grades.md)) |
| Data on arrival | a crag's routes load when the climber is there. A run never advances at a crag whose data is not loaded: the fallback that generates a missing benchmark set today (`estimate.ts`) would replay differently online and offline |
| Replay safety | a travel action stores its path, not just its destination; ties between legs break by id, not by file order |
| Size | a build check on every chunk (the 2 MiB precache limit, 18 §7's per-crag budget, which 22 leaves open between raw and gzipped); a leaner route format if the Kalymnos chunk (1.39 MB raw) is the measure |
| Saves | decide P2's policy (§6) and build what it needs before careers grow long |
| Traits | the P2 traits that need nothing new once their flags are registered: Furnace, Cold Blooded, Gaston Goblin, Bounce Back, Brittle, Hibernator, Frugal, Shiny Things, Fuelled, Junk Food |
| Screens | the title still reads "P1a · Fontainebleau"; a Journal and tick list screen ([17 §5](17-ui-ux.md)) |

### M2 Injuries and health

| Item | Detail |
|---|---|
| Definitions | 13 §2's 24 injuries and the epiphyseal variant, grades 1–3, heal and full-load windows drawn once at onset and stored |
| Rolls | falls from κ (13 §5.1's pad and spotter factors are already in `boulderKappa`, so they are not applied twice); load weekly from the load ratio, with a separate finger load (12 §5); moves on a slip; illness daily; each on its own named stream |
| Effects | site penalties fading to full load, fear, health; rehab blocks; permanent ceiling losses kept in state (ceilings are rebuilt from body, traits and age today, which would erase them); a return-to-load ramp, or the load ratio after a three-week layoff reads as danger and starts a re-injury cascade |
| Run ends | forced retirement by injury; injuries in the run summary and the score's −4 per injury (16 §6) |
| Acquired traits | a daily trigger evaluator with `scope` and `expires` (03 §1.8), first needed here: Pulley Veteran, Injury Wise |
| Live traits | the injury and illness traits (19, and Cool Head and Risk Blind if `risk_judgement` gets a role, open questions), among them Lucky and Unlucky with rerolls that finally do something; Chalk Allergy's and Asthma's illness clauses; the injury clauses of Light Frame, Heavy Bones, Reckless and Cautious, live today and read by nothing |
| Calibration | 13 §5.2's base rates first: as written they give a 63% chance of a pulley injury in two years, against 13 §1's 13% |

### M3 Training, aging and run ends

| Item | Detail |
|---|---|
| Training | the missing activities (antagonists, deload, four rehab activities), finger load, facilities by gym tier, lodging and food factors, the burnout reliefs of 12 §7 |
| Aging | growth plates at 16–17, `decline_onset_shift`, mobility maintenance, the yearly career line |
| Run ends | retiring from year 2, the last-season prompt, the burnout chain (a forced break, then an event: a stub until M8's events) |
| Live traits | Early Decline; Patient, Impatient, Insomniac; Early Bird, Night Owl; and acquired Jaded |

### M4 Money and gear

| Item | Detail |
|---|---|
| Costs | by cost tier and lodging tier; food, gym by tier, physio and insurance with M2's health care |
| Income | odd jobs by tier, remote work by connectivity, route setting, coaching, content (the content line waits for M8's following) |
| Gear | a gear catalogue (none exists, and the background gear ids match neither 14 nor schemas), shoes and their wear on the wall, ropes, pads; the Shop screen |
| Live traits | Trust Fund, Remote Worker, Gear Nerd, Academic, Content Creator; Dirtbag's full value |

### M5 Weather and seasons

| Item | Detail |
|---|---|
| Conditions | 10 §2–§9: friction terms, condensation, a wet rule per rock (Red Rocks 1–3 days, Red River Gorge climbable in rain), snow, heat, altitude, dawn and dusk sessions, a forecast whose accuracy follows `weather_sense` |
| Seasons | crags open and close by season (11 §2); weather at crags the climber is not at, on its own stream, for the map |
| Live traits | Weather Nose; Cold Hands' side clause |

### M6 The atlas and travel

| Item | Detail |
|---|---|
| Crags in batches | M6a the 10 bouldering crags, M6b the 17 sport crags, M6c the 3 with both. Each crag: sectors (09 defines them only for Font and Kalymnos, so every P2 crag's must be authored), 1–3 calibrated style profiles (32–34 in all), a name bank, at least 12 benchmarks, 2–4 signatures (about 90 listed) |
| Travel | 25 hubs serve the P2 crags; the cost of a route counts the living costs of its travel days, not only the fare; energy per travel day; vehicles; fees; jet lag |
| Access | visas and permits (14 §5–6; a visa table by home region is not yet designed); the 67 access rules of the P2 crags (fees, closures, wet-rock, cultural and raptor rules, permits, caps) |
| Backgrounds | Ex-Military (Red Rocks), Academic (the Peak), Trust Fund (Céüse), Content Creator (Hueco), Coastal Fisher (Kalymnos), and Farm Kid moving to Red River Gorge |
| Live traits | Van Life, Polyglot, Monoglot, Nervous Flyer, Motion Sick, Spreadsheet, Disorganised, Homebody, Wanderlust, Mountain Born; acquired Grit Hardened |
| Screens | the World Map ([17 §5](17-ui-ux.md)): crags by season, travel with cost and confirmation |

### M7 People

| Item | Detail |
|---|---|
| NPCs | sampled on a first visit by community size and season, the Reference Climber at the sampled grade ±8; persistent ones update every 28 days, get hurt, retire (15 §1) |
| Partners | trust and familiarity; a booked partner shows up by reliability; belay and spot quality per attempt, replacing the stubs (`rope.ts`, `attempt.ts`, and the wall's own copy in `pitch.ts`); beta from partners beyond the signature problems |
| Reputation | per region, from notable ticks and events; ethics (15 §3) |
| Names | NPC names generated from word banks are checked against the real-name list at generation, not only in the content files: a first name and a surname from two clean lists can still make a real climber's name |
| Live traits | 15 social and 6 reputation traits; acquired Crag Mayor |
| Screens | Social ([17 §5](17-ui-ux.md)) |

### M8 Events, sponsorship, hidden traits

| Item | Detail |
|---|---|
| Events | 15 §4's engine on its own stream; the 7 written P2 events, then the titled ones in batches (about 400 outcome texts in all); how an event interrupts simulated days (24 does not say) |
| Sponsorship | tiers 0–5 checked monthly, contracts and obligations; following that can grow from zero; a posting block |
| Hidden pool | the roll at creation, foreshadowing, reveal; all 16 at once, since the 30/30 point-mass balance (schemas §9 rule 10) holds only for the whole pool |
| Live traits | Addictive Personality, Superstitious, the sponsor flags, acquired Sandbagged and Tufa Whisperer |

### M9 P2 exit

The remaining trait rows; a full re-costing at every crag with enough bases to decide (26 §10 ran 24 and 8); the exit harness (§5); P2's implementation notes; the roadmap and README.

## 3. Dependencies

| Milestone | Needs | Because |
|---|---|---|
| every one | M0 | its exit test is a harness result |
| M2 | M1 (saves) | injuries make careers years long and add state; the save policy must hold first |
| M3 | M2 | the load ratio feeds both; the return-to-load ramp is shared |
| M4 | M2 | physio, bills and insurance; uninsured grade-3 injuries are 14's main way to go broke |
| M6 | M1, M4, M5 | crag fields and loading; travel and living costs; seasons decide where to go |
| M7 | M6 | NPC pools come from a crag's community size and archetypes |
| M8 | M7, M4 | events name partners and move reputation; sponsors pay money |
| M3's burnout chain | M8 | the chain ends in an event; a stub until then |

## 4. Across milestones

| Topic | Plan |
|---|---|
| Determinism | new named streams for injuries, illness, events, NPCs and forecasts, isolated from the move and weather streams (19 §6's isolation test); stored state for anything a reroll must not change: injury windows, event cooldowns, a visit index, candidate order |
| Saves | every P1b milestone orphaned the runs before it ("listed, not continuable", 22 §4). Careers in P2 last years, so losing them hurts more; §6 asks whether to build 18 §5's adapters |
| Performance | the reducer on a Web Worker (18 open questions); a measured phone budget for a simulated week (24 open questions); initial JS is about 369 kB gzipped against 18 §7's 250 kB |
| Validator | about 66 flags in the P2 trait rows are in neither `LIVE_FLAGS` nor `INERT_FLAGS`; each is implemented or registered before its row goes in |
| Re-costing | after each milestone that makes traits live; at more bases than 26 §10 used, and with `--policy plan` |

## 5. The exit criterion and how to measure it

01 §4: "10k-career harness shows run lengths, injury rates and grade distributions within the target bands in [19], and no trait outside the 5–60% pick-rate window."

| Part | Measure | Note |
|---|---|---|
| Careers | 2,000 ten-year careers with fixed seeds as the exit run; 10,000 as a nightly stretch once M0's speed allows | 10,000 ten-year careers at today's speed take days of CPU; 2,000 give a 15% run-end share to ±0.8 points (one standard error) |
| Run lengths and ends | median 3–8 years; shares as settled in §6 | 19 §1 and 01 §7 disagree |
| Injury rates | per 1,000 climbing days by site, career-ending rate, days lost | 19 §1 names the measures but no band; the band comes from 13 §1's anchors in M2 |
| Grades | by discipline and year, by background and age band; IRCRA shares | 19 §1 gives no numeric band; 22's Climbstat anchors (first 7a at about 1.5 years) |
| Pick rates | every live trait within 5–60% | at one build per background, a rate moves in steps of 1/12; the builder needs a budget distribution (19 §4) to say more |

## 6. Conflicts to settle

| Topic | The docs and code say | Proposal | Needed by |
|---|---|---|---|
| How many crags | 01 §4 "≥ 50"; 09 §2 tags 30 P2 rows (32 live) | 32 in P2; 50 once P3 and P4 bring theirs | M6 |
| Save survival | 18 §5: replay through versioned reducers and adapters; 22 §4: old runs stay listed and cannot continue | adapters from M2 on, when careers become years long | M1 |
| Run-end targets | 19 §1: injury 15%, death ≤ 5%; 01 §7: injury 10%, death under 3%, median run 3–8 years | 01 §7's | M2 |
| Forced retirement | 11 §4's triggers need a grade-3 spinal injury (13 has none), HACE or HAPE (P4) or a converted death (P3–P4); only a second grade-3 shoulder after 40 is left | add a back grade 3 that can end a career, or lower the target for P2 | M2 |
| Injury rates | 13 §5.2's base rates give a 63% pulley chance in two years; 13 §1 says 13% | calibrate the base rates to 13 §1 with the harness | M2 |
| Tendons | 12: a hidden tendon capacity that adapts; 13: a fixed `tendon_robustness`. Iron Tendons would count three times | one model: 12's capacity, with robustness as its rate | M2 |
| Load state | schemas: `load_acute` and `load_chronic` per attribute; code: daily `counters.loads` | the code's, with a finger column | M2 |
| Insurance names | schemas: `none`, `travel`, `full`; 13 and 14: `standard`, `expedition` | one set in schemas first | M2, M4 |
| Acquired traits | defined in four docs; 13 §4 reuses `old_shoulder` and `bad_knee`, ids 03 gives to creation traits; Pulley Veteran's numbers differ between 13 and 03 | 03 owns acquired traits; 13's become rows there with new ids | M2 |
| `injury_site_mult` | a `TraitEffect` field in schemas, a flag in 03 | the field | M2 |
| Second block | 11 §1: energy ≥ 55; code: 50 | the code's | M3 |
| Trait money | Dirtbag ×0.8 (14) or ×0.7 (03, data); Gear Nerd ×1.3 or ×1.1; remote work $60/125/200 by connectivity (14) or $300 by community size (03) | 03's numbers, re-costed | M4 |
| Gear shapes | 14's `GearInstance` and `GearDef` against schemas §7; background gear ids match neither; no `gear.json` | schemas first | M4 |
| Rock friction | 10 §2's base values and `1 − 0.25 p` polish against `tables.ts` and `1 − 0.4 p` in `routes.ts` | the code's values, which calibration was built on, written into 10 | M5 |
| Humidity columns | 09 §4's "winter / summer" read as January / July south of the equator | months, not seasons | M5 |
| Visa classes | 14 §6's bands do not fit 09 §5's rows (Hampi, Mount Kenya) | 09's rows, with 14's classes as defaults | M6 |
| Hub type | 09 §8.1: airport classes; schemas and code: a flag | classes | M6 |
| Data layout | 20 §2: a folder per crag; code: flat files | a folder per crag, which on-arrival loading needs | M1 |
| Contact archetypes | 04 §5's 20 against 15's 13; `contacts` is not in the background schema | 15's, with 04's mapped onto them | M7 |
| Spotting | 15 §2.3: on injury probability; 05b and code: on fall consequence | the code's | M7 |
| Events and reveals | hidden reveal 12 weeks (03) or 8 (15 §4.3); `foreshadow` an event id (schemas) or text (15); written event effects in prose ("Ethics −10") where schema fields exist | 03's window; ids; schema fields | M8 |
| Sponsor thresholds | reputation ≥ 60 (15), ≥ 30 or ≥ 50 (14); ethics −100..100 (schemas) or 0..100 from 70 (15) | schemas', with 15's numbers mapped | M8 |
| Unlock-gated backgrounds | 16 §4.1 gates Coastal Fisher on DWS ticks (P3) and lists the free Dirtbag Dropout | unlocks in P2 where their condition can be met | M6 |

## 7. Risks

| Risk | Where it bites | Mitigation |
|---|---|---|
| Harness speed | every exit test; re-costing 77 more traits | M0's speed work; 2,000-career exit runs; re-costing per milestone, not all at the end |
| Authoring volume | M6 (sectors for 30 crags, 32–34 profiles, about 90 signatures: Kalymnos's three took a milestone, and steep hard lines meet the sport generator's limits, 26 open questions) and M8 (about 400 outcome texts) | crags in batches; the pipeline's validator first; signatures generated from authored walls, as Kalymnos's were |
| Bundle | 30 crags shipped as Kalymnos is would be roughly 24–35 MB raw; one sport crag with three profiles would pass 2 MiB and silently leave the offline cache | M1's loading and size gate before M6 |
| Orphaned saves | every milestone that changes play; every content edit to events in M8 | §6's save policy |
| Balance cascades | injuries slow the progress curve (22: first 7a at 0.9 years against about 1.5, now too fast, may come right); the load ratio after a layoff; burnout today barely moves (Font p90 2.6), against a 15% share | calibrate one system at a time, at two crags, before the atlas |
| Determinism | data that may not be loaded; recomputed travel paths; new streams | M1's replay rules; isolation tests |

## Open questions

- Whether to split P2 into P2a (M0–M5, systems at two crags) and P2b (M6–M9, the world), with a release between them. Recommendation: yes.
- The exit run: 2,000 careers, or 10,000 at whatever speed M0 reaches.
- Save survival across P2: build 18 §5's adapters (recommended from M2), or keep P1's "listed, not continuable".
- Which crags make the first batch of M6. A candidate: the bouldering crags nearest Font in style and season (Albarracín, Magic Wood, Ticino), which reuse the most of what Font calibrated.
- Whether the three mixed crags (Grampians, Red Rocks, Chattanooga) wait for M6c or one of them is M1's test crag.
- How an event interrupts a simulated week: pause on every event, only on those with trait-gated options, or resolve by a policy the player sets (24 is silent; 15 §4 expects about 2.5 choices a week).
- Whether `risk_judgement` gets a role on the wall in P2 (the climber's tactics avoiding bold falls, or the injury roll), which Cool Head and Risk Blind need to come back.
