# Injury and Health

Injury is the main thing that ends careers and the main brake on training. This document is the `InjuryDef` catalogue with triggers, modifiers, severity grades, healing and full-load windows, rehab, permanent losses and acquired traits; the roll pipeline that produces injuries from falls and from load; illness; and health-care access and cost.

Related: [schemas](schemas.md) (`InjuryDef`, `InjuryInstance`) · [02 §C.5](02-character-model.md) · [05b](05b-move-resolution-and-attempt-loop.md) · [07 Disciplines](07-disciplines.md) · [10 Weather](10-weather-and-conditions.md) · [11 Time](11-time-career-aging.md) · [12 Training](12-training-and-adaptation.md) · [14 Economy](14-economy-gear-logistics.md)

Research anchors in §8. Numbers marked **(tune)** are proposals.

---

## 1. Distribution targets

The harness ([19](19-balance-and-simulation-testing.md)) checks the simulated injury mix against Lutter 2020 and related data: **77% upper limb / 18% lower limb**; fingers 33–52% of all injuries, shoulder ~17%, elbow ~8%; pulley injuries 12.3% and tenosynovitis 10.6% of all; 13% of climbers suffer a pulley injury in 2 years; A2 injuries 1.5–2× A4; ankle fractures 40% of indoor-bouldering fall diagnoses. The base probabilities in §5 were set to land near these.

---

## 2. Injury catalogue

Severity grades: **1** minor (climb with modification), **2** moderate (no climbing on that structure), **3** severe (surgery or long immobilisation). `heal_days` = until pain-free daily life and light climbing; `full_load_days` = until the structure takes 100% load. Ceiling losses apply at grade 3 only unless stated.

| id | Name · site | Triggers | Risk modifiers (`tag: mult`) | G1 heal / full | G2 heal / full | G3 heal / full | Permanent ceiling loss (G3) | Rehab | Acquired trait |
|---|---|---|---|---|---|---|---|---|---|
| `a2_pulley` | A2 pulley strain / partial / rupture · finger | load, move | crimp 1.6 · pocket 1.4 · dynamic 1.3 · cold 1.2 · tendon 0.7 (robust) | 14–21 / 28–42 | 35–60 / 60–90 | 60–90 (2–3 months) / 120–180 (4–6 months) | `finger_strength` −3, `tech_crimps` −2 | `rehab_fingers` | Pulley Veteran (G2+) |
| `a4_pulley` | A4 pulley injury · finger | load, move | crimp 1.5 · pocket 1.3 · dynamic 1.2 · tendon 0.7 | 14–21 / 28–42 | 35–60 / 60–90 | 60–90 / 120–180 | `finger_strength` −2 | `rehab_fingers` | Pulley Veteran |
| `lumbrical` | Lumbrical strain · finger | move (two-finger pockets, splits) | pocket 2.0 · dynamic 1.3 | 14–21 / 28 | 28–56 (4–8 weeks, unverified) / 56–70 | 56–84 / 90–120 | `tech_pockets` −2 | `rehab_fingers` | — |
| `collateral_lig` | PIP collateral ligament sprain · finger | fall, move (sidepull twists, gaston) | crimp 1.2 · dynamic 1.4 · sharp 1.1 | 14–28 / 35 | 42–70 / 84 | 84–120 / 150–180 | `finger_strength` −1 | `rehab_fingers` | — |
| `tfcc` | TFCC tear · wrist | move (slopers, mantles, undercling twists), fall | sloper 1.6 · compression 1.3 · jam 1.3 · fall 1.2 | 42–60 (6 weeks) / 70 | 90–150 / 180 | 180–270 (6–9 months) / 300 | 1/3 of G2+ cases: `tech_slopers` −3 lingering (rolled at onset) | `rehab_elbow` (wrist variant) | Glass Wrist (lingering) |
| `medial_epi` | Medial epicondylitis (golfer's) · elbow | load | crimp 1.4 · endurance 1.3 · pocket 1.2 · tendon 0.8 | 42 (6 weeks) / 56 | 90–120 / 150 | 150–180 (6 months) / 240 | `finger_endurance` −2 | `rehab_elbow`, `antagonists` | — |
| `lateral_epi` | Lateral epicondylitis · elbow | load | sloper 1.3 · pinch 1.3 · compression 1.2 · gym 1.2 | 42 / 56 | 90–120 / 150 | 150–180 / 240 | `lockoff` −2 | `rehab_elbow`, `antagonists` | — |
| `biceps_tendon` | Distal biceps tendinopathy · elbow | load, move (lock-offs, underclings) | static 1.3 · power 1.2 | 21–28 / 42 | 56–84 / 112 | 120–180 / 240 | `pull_power` −2 | `rehab_elbow` | — |
| `rotator_cuff` | Rotator cuff strain / tear · shoulder | load, move, fall | gaston 1.5 · compression 1.3 · dynamic 1.3 · overhang 1.2 · flexibility 0.8 | 21–35 / 56 | 90–150 / 180 | 180–270 (6–9 months; 88.5% return at ~6.6 months) / 300–365 | `lockoff` −3, `shoulder_mobility` −3 | `rehab_shoulder`, `antagonists` | Old Shoulder (G3) |
| `labrum_slap` | Labrum / SLAP tear · shoulder | move (big spans, gastons, wide compression), fall | compression 1.5 · dynamic 1.4 · roof 1.3 · flexibility 0.8 | 28–42 / 70 | 120–180 / 210 | 180–365 (6–12 months with surgery) / 365 | `shoulder_mobility` −5, `lockoff` −2 | `rehab_shoulder` | Old Shoulder |
| `capsulitis` | Finger joint capsulitis / synovitis · finger | load | crimp 1.4 · endurance 1.3 · cold 1.2 | 14–28 / 28 | 42–84 / 90 | 90–150 / 180 | `tech_crimps` −1 | `rehab_fingers` | — |
| `skin_split` | Split tip · skin | load, cold | sharp 1.6 · cold 1.5 · crimp 1.2 · skin 0.7 (thick) | 3–5 / 5 | 5–8 / 8 | — | none | tape, rest | — |
| `flapper` | Flapper · skin | move (slips on jugs/slopers) | jug 1.4 · sloper 1.3 · polished 1.2 · gym 1.3 | 2–4 / 4 | 4–7 / 7 | — | none | tape | — |
| `ankle_sprain` | Ankle sprain · ankle | fall | boulder 1.8 · highball 1.5 · ice 1.4 (crampon catch) | 7–14 / 21 | 21–42 / 56 | 42–84 / 90 | `leg_power` −1 | `rehab_lower` | — |
| `ankle_fracture` | Ankle fracture · ankle | fall | boulder 2.0 · highball 2.5 · ice 2.0 · dws 0.5 | — | 42–84 (6–12 weeks immobilised) / 120–180 | 84–120 / 180–270 | `leg_power` −3, `footwork` −2, `hip_mobility` −2 | `rehab_lower` | Bad Ankle |
| `knee_meniscus_mcl` | Meniscus / MCL (heel hooks, drop knees) · knee | move, fall | heel_hook 2.0 (move tag `flexibility`) · overhang 1.3 · roof 1.3 · boulder 1.2 | 14–28 / 42 | 42–90 / 120 | 120–180 / 240–365 | `hip_mobility` −4, `leg_power` −2 | `rehab_lower` | Bad Knee |
| `lower_back` | Lumbar strain / disc · back | load, fall, move (roofs, hauling) | roof 1.4 · core 0.8 (strong) · bigwall 1.3 (hauling) | 7–14 / 21 | 28–56 / 84 | 90–180 / 240 | `core_tension` −3 | `mobility`, `antagonists` | — |
| `frostbite` | Frostbite (fingers, toes) · systemic | cold | cold 2.0 · altitude 1.5 · alpine 1.3 · ice 1.3 | 14–28 / 28 (frostnip) | 42–84 / 90 (blisters) | 120–180 / permanent | G3: `skin_durability` −10, `contact_strength` −3, cold-tolerance −3 °C | rest, warmth | Frost Fingers |
| `altitude_illness` | AMS / HAPE / HACE · systemic | altitude | altitude 2.0 · alpine 1.5; acclimatisation reduces (07 §5) | AMS: 1–3 / 3 (descend 500 m) | HAPE: 7–21 / 28 | HACE: 14–60 / 90; survival deficit possible | G3: `aerobic_capacity` −5, `focus` −3; career-ending when `health < 30` at onset | descent, rest | Thin Air (G2+: altitude illness risk ×1.3 in future) |
| `hypothermia` | Hypothermia · systemic | cold | cold 2.0 · wet 1.8 · wind 1.5 · alpine 1.3 · bigwall 1.2 | 1–2 / 2 | 3–7 / 10 | 14–30 / 60 | G3: `health` −10 | rest, warmth | — |
| `heat_illness` | Heat exhaustion / stroke · systemic | load (hot days, 10 §6) | heat 2.0 · humid 1.5 · dws 0.7 (water) | 1–2 / 2 | 3–7 / 7 | 14–30 / 30 | G3: `aerobic_capacity` −2 | rest, fluids | — |
| `travel_bug` | Travel bug (GI) · systemic | illness (new region, cost_tier 1–2 food) | travel 1.5 · nutrition 0.7 (good) · Iron Stomach trait ×0.3 | 2–4 / 4 | 5–8 / 10 | — | none | rest | — |
| `food_poisoning` | Food poisoning · systemic | illness | travel 1.3 · money 1.2 (cheap food) | 1–3 / 3 | 4–7 / 10 | 7–14 / 14 (hospital) | none | rest | — |
| `common_cold` | Cold / flu · systemic | illness (season, hostels, flights) | social 1.3 · travel 1.3 · sleep 0.7 (good) | 3–5 / 5 | 7–10 / 12 | 14–21 / 28 | none | rest | — |

**Growth-plate variant.** At ages 16–17 any finger injury roll from `load` with a crimp-tagged session has a 40% chance **(tune)** to be `epiphyseal_pip` instead (site finger; G2 heal 42–84, full 90–120; G3 120–180 / 240 with `finger_strength` −4 and `tech_crimps` −3 permanent). This encodes the growth-plate data: mean age 14 (10–18), 98% PIP, 64% full crimp; the game's youngest start is 16 so the window is the tail of the real one.

---

## 3. What an injury does in play

An `InjuryInstance{def, grade, day_onset, day_full_load, rehab_progress}`:

- Blocks the attributes of its site at `grade × 25%` EffectiveStat until `heal_days` elapse, then at a linearly fading penalty until `day_full_load` (fingers block crimps and pockets first, jugs last; shoulders block gastons and compression; ankles block highballs and dynos; back blocks roofs).
- Adds a `fear` source `last_injury` +3 for 4 weeks after return.
- Sets `health −5 × grade` at onset, recovering with heal.
- Rehab blocks advance `rehab_progress` 0–100; the heal window shortens by up to 25% at full rehab compliance (1–2 physio sessions/week, [14 §4](14-economy-gear-logistics.md)); ignoring rehab lengthens full-load by 30% and doubles the re-injury multiplier.
- Re-injury of the same `def` within a year: probability ×2.0; the second grade-3 of a shoulder after 40 is career-ending ([11 §4](11-time-career-aging.md)).
- `recovery_mult` traits (Fast/Slow Healer), `nutrition_mult`, `sleep_mult` and the age term `1 − 0.01 × max(0, age − 30)` scale all day counts.

---

## 4. Acquired traits

| Trait | Granted by | Effect |
|---|---|---|
| Pulley Veteran | first G2+ pulley injury | pulley risk ×0.8 thereafter (you learn to warm up), `confidence` −2 on crimps for 6 months |
| Old Shoulder | G3 cuff or labrum | shoulder ceilings as table; shoulder risk ×1.3 |
| Bad Knee / Bad Ankle | G3 knee / ankle fracture | heel-hook and highball risk ×1.3; the creation versions exist in [03](03-traits.md) |
| Glass Wrist | lingering TFCC | `tech_slopers` −3 for the run |
| Frost Fingers | G3 frostbite | as table; cold-tolerance loss |
| Thin Air | G2+ altitude illness | altitude illness risk ×1.3 |
| Comp Yips, Sandbagged, Crag Mayor | social ([15](15-social-reputation-events.md)) | — |

---

## 5. The injury roll pipeline

### 5.1 From falls (every `FallKind`)

```
p_injury  = base(fall_kind, consequence) × age_mod × (1 − 0.3 × body_position/100)
            × (1 + 0.01 × (mass − ref_mass)) × Π trait_mults × helmet_mult          (02 §C.5)
severity  = roll weighted by consequence: ground/ledge heavily toward G2–G3
site      = roll from the site table for the fall kind (below)
```

| `FallKind` × consequence | base `p_injury` | Site weights |
|---|---|---|
| `boulder`, < 3 m, pads+spot | 0.02 | ankle 0.55 · knee 0.15 · wrist 0.15 · back 0.1 · finger (flapper) 0.05 |
| `boulder`, 3–4.5 m | 0.06 | ankle 0.6 · knee 0.15 · back 0.15 · wrist 0.1 |
| `boulder`, highball > 4.5 m | 0.15 + 0.05/m above 4.5 | ankle 0.5 · back 0.2 · knee 0.15 · systemic 0.15 |
| `rope`, clean air | 0.005 | ankle 0.5 (swing) · finger 0.3 (rope burn, flapper) · back 0.2 |
| `rope`, swing into wall / ledge | 0.08 | ankle 0.5 · knee 0.2 · back 0.2 · shoulder 0.1 |
| `rope`, ground | 0.6 | ankle 0.3 · back 0.3 · systemic 0.4 |
| `trad_rope`, gear held | as `rope` | — |
| `trad_rope`, zipper to ground | 0.7 | as `rope` ground; eligible for death when flagged ([11 §4](11-time-career-aging.md)) |
| `water`, S0–S1 | 0.01 | back 0.5 (flat landing) · ankle 0.2 · systemic 0.3 (winded) |
| `water`, S2 | 0.12 | ankle 0.4 · back 0.3 · systemic 0.3 |
| `water`, S3 | 0.5 | systemic; death-eligible |
| `alpine` objective hit | 0.5 | systemic; death-eligible |
| `ice` (rope with crampons) | `rope` × 2 on ankle | ankle 0.7 |

`landing_hazard` (blocks, roots, slope) multiplies boulder bases ×1.5–2.5; `coverage` and `spot_quality` ([07 §1](07-disciplines.md)) reduce them: `× (1 − 0.6 × coverage) × (1 − 0.3 × spot_quality/100)`.

### 5.2 From training and climbing load (weekly roll)

Each Sunday settlement, for each connective-tissue def with trigger `load`:

```
p_week = base_def × m_acwr(ACWR or finger ACWR) × Π risk_mods(tags of the week's sessions)
         × tendon_mod × age_mod × bf_mod_inj × trait_mults × fatigue_mod
  base_def    : a2 0.006 · a4 0.0035 · medial_epi 0.004 · lateral_epi 0.003 · capsulitis 0.004 · cuff 0.003 · biceps 0.002 · back 0.002 · tfcc 0.002 · lumbrical 0.0015   (tune)
  tendon_mod  = 1.6 − 1.2 × tendon_robustness/100                     (02 §A.1)
  bf_mod_inj  = 1 + 0.02 × max(0, (ref_fat − 3) − body_fat_pct)
  fatigue_mod = 1.4 if any session started with energy < 25 else 1.0
```

With `base_def` as listed and a sweet-spot ACWR, a climber of average robustness has about 13% chance of any pulley injury in two years, the research figure; spiking ACWR for a month raises it fivefold for that month. Severity: G1 60%, G2 30%, G3 10%, shifted toward G3 by `m_acwr > 2` and by `dynamic` tags.

### 5.3 From single moves

`move` triggers fire inside 05b on a *sketchy* or *slip* outcome on a hold whose type carries a tag with `mult ≥ 1.4` for some def (a crimp foot-pop → `a2_pulley` 0.4%; a heel hook pop on a roof → `knee_meniscus_mcl` 0.6%; a sloper slip → `tfcc` 0.2% and `flapper` 3%) **(tune)**.

### 5.4 Environmental and illness

`cold`/`altitude`/`illness` triggers roll per day block from [10](10-weather-and-conditions.md) and [07 §5–6](07-disciplines.md) exposures; illness rolls use the region's `cost_tier` (tier 1–2: `travel_bug` 2%/day for the first 10 days in a new country, 0.3%/day after) and lodging type (`common_cold` hostel 0.8%/day in winter).

### 5.5 As built (P2 M2)

The pipeline as implemented (`src/sim/injury.ts`, `data/injuries.json`; [28 §3](28-p2-implementation-notes.md) for the measured results). Rates are the data's, calibrated with the harness against §1.

| Roll | When, on which stream | Chance |
|---|---|---|
| Fall | each boulder fall or jump (κ ×0.7 for a jump), each fall the rope holds; `injury\|fall\|route\|attempt\|n` | `a × κ^b` (boulder a, b = 1.2; rope b = 2.6) × age (1 + 0.02/yr past 30) × (1 − 0.3 × body_position/100) × (1 + 0.01 × (mass − ref)) × (1.3 − 0.6 × risk_judgement/100) × traits; κ already holds the pads, the spotter and the rope (05b §11), so §5.1's coverage and spot terms are not applied again; the injury is drawn by the fall kind's weights (each injury's `fall`) × site multipliers |
| Move | a sketchy or slip outcome on a hold or move carrying a tag an injury lists (`move`); `injury\|move\|route\|attempt\|move` | the injury's rate per slip, × 0.2 on a sketchy move; the simulated climber slips or goes sketchy hundreds of times a week, so the rates are about 1/100 of §5.3's |
| Load | each week's end; `injury\|load\|week` | `load_base` × the load multiplier against capacity ([12 §5](12-training-and-adaptation.md)) × exposure (risk mods as additive shares of the week's load by tag, or by attribute for flexibility, core, skin, nutrition, sleep) × age × leanness × fatigue (×1.4) × traits × prevention × relapse; at most one a week; at 16–17 a finger injury in a crimp-heavy week is the growth-plate variant 40% of the time |
| Illness | each day's end, one at a time; `illness\|day` | the illness's daily rate × cold months (crag mean under 10 °C) × the first two weeks after a trip × sleep and nutrition × traits; the travel bug only at cost tiers 1–2 |

| Effect | As built |
|---|---|
| Windows | heal and full-load days drawn once at onset, divided by `recovery_mult × sleep × nutrition × (1 − 0.01 × (age − 30))` |
| Climbing | grade 2+ bars climbing (and attempts) until the heal day; grade 1 climbs on |
| Training | grade 2+ bars activities that load its site (`TrainingActivity.loads`); an illness bars all but rehab and mobility |
| Penalty | each hold type and move class of the site loses `0.25 × grade × fade` of EffectiveStat (fade 1 to the heal day, then linear to 0 at full load), weighted by the site (fingers: crimps and pockets 1, pinches 0.7, slopers 0.5, jugs 0.3; shoulders: gastons, dynos; ankles: dynos, high steps; back and illness: everything a little) |
| Health | −5 × grade at onset, +1 a day × `resource_mult(health)` × sleep |
| Fear | `last injury` +3 for 28 days after a grade-2+ injury heals |
| Rehab | blocks of the injury's rehab activity; with sports physio (cost tiers 2–4) each week's compliance (two blocks) brings the heal day a quarter of a week forward; under 25% compliance by the heal day: full load 30% later, relapse ×2 again |
| Relapse | the same injury within 365 days: ×2 |
| Ceilings | grade-3 losses go to `RunState.ceiling_loss` and stay through every rebuild |
| Plan | climbing it bars becomes its rehab (or rest), training that loads it too, and a free second block is rehab; between heal and full load sessions are mileage |
| Career end | `career_ending` on grade 3: lower back spinal 30% of the time; a second grade 3 at the same site at 30+ (11 §4's 40, lowered to reach P2's band) |

---

## 6. Prevention

`antagonists` and `mobility` blocks reduce the next 14 days' shoulder and elbow risk ×0.85/×0.8 ([12 §1](12-training-and-adaptation.md)); warm-up quality is implicit in the first attempt of a session (first attempt at ≥ PB − 1 DI: finger-def risk ×1.5); `skin_durability` and tape reduce skin defs; a helmet applies `helmet_mult` 0.3 to the systemic branch of rope and alpine falls; stick-clipping removes the rope ground branch at bolt 1.

As built (P2 M2): an `antagonists` block gives 14 days of shoulder ×0.85 and elbow ×0.8 (12 §1's row; mobility helps through `shoulder_mobility`, which lowers cuff and labrum risk, instead); the session tactics always warm up on their easiest route, so the warm-up term never fires, except for Pulley Veteran's `warmup_required` when a player starts a session on a harder route; `skin_durability` scales split tips (M5); helmets wait for P3–P4; the first bolt is always stick-clipped (07 §2.4). Health-care costs (§7) and insurance come with M4.

---

## 7. Health care access and cost

| `cost_tier` | Access | Physio session | Imaging (MRI/ultrasound) | Surgery (G3) | Rescue | Wait |
|---|---|---|---|---|---|---|
| 1 | Clinic in town; no sports physio | $15–30 | $80–200, may need travel to hub | $200–1,500 | often informal, 1–3 days | 0–2 days |
| 2 | Regional hospital; physio in hub | $40–70 | $150–400 | $400–3,000 (EU-style) | $1,000–5,000 | 1–3 days |
| 3 | Good hospital, sports physio in hub | $60–120 | $300–800 | $8,000–40,000 (US) or $400–3,000 (EU) | $5,000–20,000 | 0–7 days (public systems) |
| 4 | Excellent; sports medicine common | $60–120 | $400–900 | as tier 3 | $5,000–50,000 (helicopter) | 0–14 days |
| 5 | None locally; evacuation to a hub (days) | — | at hub | at hub, plus evacuation | $10,000–50,000 | 3–10 days to reach care |

Insurance ([14 §4](14-economy-gear-logistics.md)): standard cover pays 80% of physio and surgery and nothing for rescue; expedition cover pays rescue up to $50,000. Uninsured grade-3 injuries in tier 3–4 US regions are the single most common bankruptcy trigger in the harness and are meant to be. Public systems (EU) have longer waits for surgery (+14–60 days before `heal_days` starts) but low cost. Sports-physio access is required for the 25% rehab shortening in §3; tier 1 and 5 crags cannot provide it, which is a reason to travel home or to a hub to recover.

---

## 8. Research grounding

- Lutter 2020 (633 injuries): 77.1% upper limb, 17.7% lower; pulley 12.3%, tenosynovitis 10.6%. Fingers 33–52%, shoulder ~17%, elbow ~8% across reviews. Elite women: 53% injured per year; shoulder 37.7%, fingers 34.4%, ankle 32.8%, knee 27.9% (PMC10312002). Indoor bouldering falls: ankle fracture 40% of diagnoses (WEM 2021). 13% of climbers had a pulley injury in two years; A2 1.5–2× A4 (Schöffl; Tension pulley review).
- Recovery windows: A2 rupture 2–3 months heal, 4–6 months full load; lumbrical 4–8 weeks (unverified); epicondylitis 6 weeks–6 months; TFCC 6 weeks–9 months with one third persistent; SLAP 6–12 months; cuff 4–9 months, 88.5% return at ~6.6 months (theclimbingdoctor); ankle fracture 6–12 weeks immobilised plus months of rehab.
- Growth plates: mean age 14 (10–18), 98% PIP, 64% full crimp (PMC13358427; 10.1177/03635465211056956).
- Altitude: MVC unchanged, endurance down; HAPE/HACE risk above 3,000 m unacclimatised (PMC8306057; PMC9691031).
- ACWR shape from general sports-science load monitoring; the multipliers are design.

---

## Open questions / proposed schema additions

### Open questions

1. Whether G1 injuries should be shown as a diagnosis or only as "niggle" text until a physio visit (information gating like `tendon_robustness`).
2. The epiphyseal variant may deserve its own `InjuryDef` row rather than a substitution rule.
3. HACE survival deficit as `forced_injury` vs a permanent ceiling loss only; currently both depending on `health`.

### Proposed schema additions

- `InjuryDef.severities[].career_ending?: boolean` so [11 §4](11-time-career-aging.md) can read the flag from data.
- `InjuryDef.site` lacks `'hand'`/`'systemic'` subdivision for frostbite toes; acceptable under `'systemic'`.
- `InjuryInstance.rehab_compliance: number` (0–1) alongside `rehab_progress`.
- `Climber.insurance: 'none' | 'standard' | 'expedition'` (referenced by [14](14-economy-gear-logistics.md) but not in schemas).
