# Disciplines

Every discipline is the same engine ([05b](05b-move-resolution-and-attempt-loop.md)) with a different protection model, fall model, fatigue horizon, time scale and scoring rule layered on top. Bouldering (P1a) and sport (P1b) are specified fully because they are the vertical slice; the rest are one-page sketches that fix the shape of each later phase so that schemas, traits and the atlas can reference them now.

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [05a Kinematics](05a-wall-and-kinematics.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [05c Grade Engine](05c-grade-engine.md) · [08 Grades](08-grades.md) · [09 World Atlas](09-world-atlas.md) · [10 Weather](10-weather-and-conditions.md) · [13 Injury](13-injury-and-health.md)

Numbers marked **(tune)** are proposals for the harness ([19](19-balance-and-simulation-testing.md)).

---

## 0. Overview

| `Discipline` | Phase | Protection (`ProtectionKind`) | `FallKind` | Fatigue horizon | Typical time per attempt | Scoring | Dominant attributes |
|---|---|---|---|---|---|---|---|
| `boulder` | P1a | `pad_zone` | `boulder` | Power pool, 3–15 moves | 20 s – 3 min | Send / flash / attempts | `finger_strength`, `contact_strength`, `core_tension`, `dynamic_movement`, hold-family `tech_*` |
| `sport` | P1b | `bolt`, `lower_off` | `rope` | Pump + aerobic reserve, 15–60 moves | 3–25 min | Onsight / flash / redpoint | `finger_endurance`, `aerobic_capacity`, `route_reading`, `rope_craft`, `composure` |
| `trad` | P3 | `gear`, `anchor` | `trad_rope` | As sport + rack weight | 10–45 min per pitch | Onsight is the prestige tick; headpoint for `bold` | `gear_placement`, `tech_cracks`, `risk_judgement`, `composure` |
| `multipitch`, `bigwall` | P3 | mixed, `anchor` | `rope` / `trad_rope` | Daily `energy`, multi-day | hours to days | Summit / free / aid used / days | `aerobic_capacity`, `logistics`, `aid_craft`, `rope_craft`, `resilience` |
| `alpine` | P4 | `gear`, `ice_screw`, `none` | `alpine` | Daily `energy`, altitude, cold | 1–5 days | Summit, style, retreat | `aerobic_capacity`, `risk_judgement`, `weather_sense`, `ice_tools` |
| `ice`, `mixed` | P4 | `ice_screw`, `gear` | `rope` | Pump in cold, calves | 10–40 min per pitch | Lead / top-rope | `ice_tools`, `lockoff`, `composure`, cold tolerance |
| `dws` | P3 | `water` | `water` | As sport, no rests on rope | 2–15 min | Send / attempts; S-grade danger axis | sport set + `commitment`, `composure` |
| `comp_boulder`, `comp_lead` | P3 | `pad_zone` / `bolt` | `boulder` / `rope` | Round-level `energy`; isolation | 4 min / 6 min | Tops, zones, attempts / hold count, time | sport and boulder sets + `focus`, `composure`, `route_reading` |
| `gym` | P1a (stub), P2 | `pad_zone` / `bolt` | `boulder` / `rope` | As boulder/sport | — | Training only, no ticks | Any; drives [12](12-training-and-adaptation.md) |

---

## 1. Bouldering (P1a, Fontainebleau)

### 1.1 Protection and falls
Protection on a boulder is a `pad_zone` with `coverage` (0–1, from pads carried: one pad 0.45, two 0.75, three 0.9) and `spot_quality` (0–100, from the spotter NPC or 0 solo). A fall is resolved by the `boulder` branch of the fall pipeline ([13 §5](13-injury-and-health.md)): `fall_height_m` = hands' height at the failed move, `landing_hazard` = the crag's landing descriptor (flat / sloping / blocks / tree roots; Font slabs and sand are flat-good), `coverage`, `spot_quality`, `body_position`. Problems above 4.5 m are tagged `highball`; `fear` gains a `height` source (+2 per metre above 3 m, [05b §7](05b-move-resolution-and-attempt-loop.md)). Topping out is mandatory for the tick (Font ethic): a `mantle` move closes every problem, so `mantle` difficulty and sand-on-the-top-slab friction matter.

### 1.2 Fatigue model
Bouldering runs on the **Power pool** (`power`, 0–100 = `anaerobic_capacity` at attempt start) rather than `pump`. Each move spends `power` (static 3–6, deadpoint 8–15, dyno 15–25) and adds a little pump (×0.5 the sport pump cost). `aerobic_reserve` does not drain inside a boulder attempt; it drains **between** attempts: each attempt costs `6 + 0.4 × moves` reserve, and recovery between attempts restores `power` at `1.5 × aerobic_capacity/100` per minute rested **(tune)**. This gives the real texture: a short problem never pumps you, but the session fades. Skin cost per move is full (Font sandstone sharpness is low but sloper surface area is high: `skin_cost × 1.2` on `sloper`, ×0.8 on `crimp`). Chalk matters on slopers ([10 §2](10-weather-and-conditions.md)).

### 1.3 Time
An attempt is 20 s to 3 min of wall time. A session is a day block ([11 §1](11-time-career-aging.md)); `energy` and `skin` cap attempts: each attempt costs `energy 2 + 0.3 × DI_target` and skin by hold sharpness; the player is warned at `skin < 30`.

### 1.4 Gear
Shoes (soft and downturned for steep, stiff and flat for Font slabs; shoe stiffness enters the `smear`/`high_step` cell of the 05b matrix), one or more pads, chalk, brush (removes `polish`-free over-chalk; brushing a hold resets `state.chalk` to 0.4), a towel for the feet (sand on rubber −8% friction until wiped, Font-specific). Gear ids live in [14](14-economy-gear-logistics.md).

### 1.5 Scoring and ticks
`Tick.style` is `flash` (first try with beta), `onsight` (first try with no beta — rare to log in bouldering but kept), `redpoint` (sent after attempts; the UI word is simply "sent"), `repeat`, `attempt`. The tick stores `attempts` and `di`. Circuits at Font ([09 §6](09-world-atlas.md)) grant a circuit-completion flag when every problem in the circuit is ticked in one trip. Reputation: a send at or above the regional top-10 DI triggers a `reputation` event.

### 1.6 Dominant attributes and what 05b does differently
- Matrix weights are unchanged; the **auto-success threshold** `T` is tighter in bouldering because every move is near the limit by design: `T_boulder = 0.8 × T` **(tune)**.
- No `clip` or `place_gear` actions; `rest` is only a shake on a hold with `rest_value ≥ 0.6`, and recovers `power` not `pump`.
- The Power pool at 0 applies −30% to dynamic moves (02 §D); dynos are therefore front-loaded in Font problems by the generator ([06](06-procedural-routes.md)).
- **Attempt and session loop**: `familiarity = 1 − e^(−0.35 × attempts)` **(tune)**, faster than sport (0.2) because problems are short; it reduces displayed uncertainty and `MoveDifficulty` by up to 0.3 DI.
- Spotter and pad choices are an attempt-start sub-menu; `coverage` and `spot_quality` feed only the fall pipeline, never move success.

---

## 2. Sport (P1b, Kalymnos)

### 2.1 Protection and falls
Bolts are `Protection{kind:'bolt'}` every 2.5–4 m by the crag style profile (`protection.spacing_m`), with `reach_from` listing the holds from which a clip is possible. A `rope` fall: `fall_distance = 2 × (height − last_clipped_bolt_height) + slack + rope_stretch`, slack 1–2 m by `belay_quality`, stretch 8% of rope out; hitting a ledge or the ground converts to `landing_hazard` severity. Consequence classes: *clean air* (no injury roll unless inverted), *swing into wall* (ankle roll at 3%), *ledge* (injury roll with `fall_height` = distance to ledge), *ground* (only possible before bolt 2 or with slack; `bold` label). **Clipping** is a `clip` action costing 6–10 s and pump `4 − 0.03 × rope_craft` **(tune)**; skipping a clip is allowed and increases `fall_distance` and the `runout` fear source (+3 per skipped bolt). Z-clips and back-clips are `rope_craft` rolls below 30.

### 2.2 Fatigue model
Sport is the **pump** game ([05b §6](05b-move-resolution-and-attempt-loop.md)). `pump` rises per move by hold type × angle × margin; `aerobic_reserve` drains 1 per 10 s; recovery on rests follows 02 §C.4 and is front-loaded per stance (first shake recovers most). `power` still exists for cruxes but regenerates 2/turn on rests. The **redpoint** mode allows *working*: `take` (hang on the rope, pump recovers at 3× the on-hold rate, `aerobic_reserve` still drains), *continue from bolt*, *lower*; only a ground-to-anchor attempt without weighting the rope is a send. Hangdogging raises `familiarity` with `k = 0.2` per bolt-to-bolt section worked.

### 2.3 Time
3–25 min per attempt; 40 m routes with 2-minute rests push `aerobic_reserve` to the floor, which is the anti-rest-forever rule in action. A day block allows 2–5 attempts by `energy` (each attempt costs `energy 6 + 0.25 × length_m`).

### 2.4 Gear
Rope (60/70/80 m; the atlas lists minimum rope lengths per crag; a too-short rope blocks routes above `length_m/2 − 2`), quickdraws (12–18), harness, belay device, helmet (reduces head-injury branch ×0.3 in the fall pipeline; Kalymnos tufa crags have `rockfall` landing hazards), shoes by angle, stick clip (pre-clips bolt 1, removing the ground-fall branch). Rope wear: each fall adds `0.5 + fall_distance/4` wear; retire at 100 ([14](14-economy-gear-logistics.md)).

### 2.5 Scoring
`onsight` (no prior information, no watching), `flash` (beta or watched), `redpoint`, `repeat`, `attempt`. The onsight gap is derived in 02 §C.3. A **pinkpoint** (pre-hung draws) is recorded as redpoint with a flag; the regional ethics layer ([15](15-social-reputation-events.md)) does not care except in the Frankenjura, where it is called out in dialogue only.

### 2.6 Dominant attributes and what 05b does differently
- `rest` actions matter: `rest_value` per hold is displayed, recovery is computed per 10 s, overgrip from fear outside the IZOF band multiplies pump cost.
- `clip` is a turn action with its own pump cost; the UI shows the "clip from here or go one more move" choice.
- Route Reading reveals hidden holds from the ground; on a 35 m route hidden-hold density matters more than on a boulder.
- Falls on rope are low-consequence, so `fear` sources are smaller (height +1/5 m, runout +3/skipped clip, last fall +2) and `confidence` grows mostly from redpoints. Fryer 2013 (no lead–toprope anxiety gap in advanced climbers) is encoded as `composure` shrinking the lead fear baseline toward zero above 70.
- Power is secondary; the generator spreads cruxes (`crux_position: 'spread'`) and adds rests, so DI comes from pump accumulation ([05c](05c-grade-engine.md) surfaces "pump accumulation" as a component).

---

## 3. Trad (P3)

**Gear placement decision.** A trad route lists `Protection{kind:'gear', gear_sizes, quality}` slots. At each slot reachable from the current hold, the player can `place_gear`: time 20–60 s, pump 5–9, and a placement-quality roll `q = clamp(slot.quality × (0.5 + gear_placement/200) + rock_knowledge/1000 + N(0, 0.1), 0, 1)` **(tune)**. `risk_judgement` controls how accurately `q` is displayed (noise ∝ `1 − rj/100`). Placing nothing is faster and keeps the rack lighter; the fear meter's `runout` source grows +1.5 per metre above the last piece.

**Rack weight.** Each carried piece adds mass: `rack_kg` (a double rack of cams ≈ 4–5 kg) enters `mass_mod` for the attempt. Indian Creek splitters need many cams of one size; carrying 6 × #2 is heavy but each placement is bomber.

**Rope drag.** Wandering lines accumulate `drag = Σ |Δx| between pieces × 0.04` which adds to pump per move above drag 0.3 and forces extending pieces (extra time). `rope_craft` halves the drag per point above 50 proportionally.

**Runouts and falls.** `trad_rope` falls roll the gear: the top piece holds with probability `q`; a rip moves to the next piece (fall distance grows, fear `last_fall` source +4). Ground-fall potential makes the route `bold`; a predicted zipper on the preview is a **gear-rip warning** — ignoring it is one of the explicit risky choices that permit death when `death_enabled` ([11 §4](11-time-career-aging.md)).

**Headpointing.** Work a `bold`/`deadly` route on top-rope (no fall risk, `familiarity` grows at k = 0.25, `fear` does not accrue), then lead it with pre-inspected gear; the tick is `redpoint` with a `headpoint` flag; the Headpointer trait halves the lead-day fear baseline on pre-practised routes.

**British adjectival danger.** Display grade combines DI and the danger axis ([08 §4](08-grades.md)); E-grade bumps one step for `spicy`, two for `bold`, three for `deadly`. Peak District gritstone is the archetype: friction-dependent, ground-fall, strong ethics (no chalk abuse, no wet grit).

---

## 4. Multipitch and big wall (P3)

**Pitch sampler.** A route is a sequence of `Route` records with a shared `anchor`. Representative pitches the generator produces for a 500 m granite wall (Yosemite style profile):

| # | Pitch | Length | Display grade | Character |
|---|---|---|---|---|
| 1 | Approach slab | 45 m | 5.8 | smears, `polished`, sparse bolts |
| 5 | Splitter hand crack | 40 m | 5.10c | `crack_hand`, sustained, cams #1–#2 |
| 11 | Pendulum / aid traverse | 20 m | C1 → 5.11a | `aid_craft`, rope management, time sink |
| 17 | Thin corner crux | 35 m | 5.12d | `crack_finger`, `layback`, the free crux |
| 24 | Summit chimney | 50 m | 5.9 | `crack_offwidth`, haul bag snag risk |

**Hauling.** Each pitch with bags costs the team `energy` `0.15 × bag_kg × pitch_length/40` split by role; `core_tension` and `pull_power` reduce it. Bag mass falls as water and food are consumed (2.5 kg per person-day).

**Bivy.** Ledge or portaledge night: `energy` regenerates to 70–80% rather than 100%, `sleep_hygiene` and cold matter, skin heals at half rate. Each extra planned day costs 2.5 kg of load.

**Weather commit.** At the base and at every bivy the forecast ([10 §4](10-weather-and-conditions.md)) shows a window; committing above the half-way `retreat_line` with a storm probability above the displayed threshold is a risky choice. Being caught out triggers hypothermia rolls ([13](13-injury-and-health.md)). Retreat costs a day and rope wear but is never punished by the game beyond that.

**Partner skill.** The NPC partner's `belay_quality`, `reliability` and attributes set how many pitches they lead; a weaker partner means more leads for the player and slower days. Falling out mid-wall is an event.

---

## 5. Alpine (P4)

**Objective hazard rolls.** Each alpine route carries hazard zones (serac, cornice, avalanche slope, rockfall gully) with an hourly hazard rate `h` that depends on time of day (rockfall rises after sunrise; serac collapse is random), temperature and recent snowfall. Time spent in a zone draws against `h`; a hit is a `FallKind: 'alpine'` resolution that can be fatal when `death_enabled`, otherwise a career-ending injury. `risk_judgement` scales how precisely `h` is displayed; `weather_sense` scales the forecast.

**Weather windows.** Patagonian-style routes need 1–3 consecutive good days; the player waits in town (money, stoke) for a window the forecast shows with reliability from `weather_sense`; windows can collapse mid-route.

**Acclimatisation.** `acclimatisation_m` is the altitude the climber is currently adapted to; it rises 300–500 m per day spent sleeping high and falls 100 m per day low. Above `acclimatisation_m`, lactate-threshold power is reduced: **−18% at 3,000 m** for an unacclimatised sea-level climber (PMC8306057), scaling linearly (≈ −6% per 1,000 m) and applied to `aerobic_capacity`, `anaerobic_capacity` and pump recovery; maximal single-move strength is unchanged (MVC unaffected). Above 3,000 m unadapted, AMS rolls begin ([13](13-injury-and-health.md)); mass and muscle loss accrue at −0.1 kg/day above 4,500 m. Crags at 1,900–2,600 m (Rifle, Céüse, Ten Sleep, Ouray) apply the mild version ([10 §7](10-weather-and-conditions.md)).

**Summit Fever.** A hidden/evolving trait ([03](03-traits.md)) that lowers displayed hazard and raises the retreat threshold; the explicit counter is `risk_judgement`.

**Retreat decisions.** At each decision point (col, bivy, start of a hazard zone) the UI shows time of day, remaining window, hazard, team energy and a retreat cost. A retreat is never a run-ending event. Pressing on past a displayed red threshold is logged as an explicit risky choice.

---

## 6. Ice and mixed (P4)

**Tool and screw placement quality.** Holds are `ice_pick` (tool) and `ice_frontpoint` (foot) with per-swing quality `q = ice_quality × (0.4 + ice_tools/160) + N(0, 0.1)`; a poor stick costs an extra swing (pump 3, time 8 s). Screws are `Protection{kind:'ice_screw'}` with `quality` from ice density and the placement roll; placing one costs 30–60 s and pump 6–10 in a lock-off, so `lockoff` is a dominant attribute.

**Temperature-dependent ice.** Ice quality curve by air temperature: plastic and sticky at −4 to −10 °C (quality 0.9), brittle below −15 °C (0.6, **dinner-plating** events that cost a swing and spawn falling debris for the belayer), rotten and wet above 0 °C (0.5 and screw quality −0.3). Farmed ice (Ouray) is more consistent (`t_sd` small).

**Cold tolerance.** `condition_mult.cold` traits and `body_fat_pct` set a comfort temperature; below it, `contact_strength` and `footwork` lose 1% per °C and frostbite rolls begin at −15 °C wind-chill with exposed time ([13](13-injury-and-health.md)). Screaming barfies are a flavour event on the first pitch of the season.

**Falls** on ice are `rope` falls with a crampon-catch branch (ankle fracture ×2). Leading ice is the discipline where "the leader must not fall" is enforced by consequence, not by rule.

---

## 7. Deep water solo (P3)

**S-grades S0–S3** are the danger axis ([08 §3](08-grades.md)): S0 safe at most tides, S1 some risk at low tide, S2 real risk (height or ledges), S3 cannot afford to fall. The S-grade is recomputed per day from `tide_height` and `swell_m`; a route displayed as S1 at high tide can be S2 at low.

**Tide and swell.** The crag record carries a tide table seed; the daily weather ([10](10-weather-and-conditions.md)) gives swell. Falls into water are `FallKind: 'water'`: depth and swell set injury probability (belly-flop and cliff-edge impacts), S3 falls can be fatal when `death_enabled`.

**Swim and boat logistics.** Each fall costs a swim (`energy` 4–10 by distance and swell) and wets the shoes and chalk (next attempt friction −10% until dry, 20 min in sun). A boat (hire cost in [14](14-economy-gear-logistics.md)) removes the swim and adds 10 min of drying; Mallorca and Railay sessions are afternoon-only when the sun has warmed the water.

**Fear of height still applies.** No rope means `fear` has a `height` source identical to highball bouldering plus a `water` source that falls with every safe splash (confidence +1 per clean fall at S0–S1). Commitment matters on every lip move.

---

## 8. Competition (P3)

**Boulder.** Four-minute rotation per problem, 4–5 problems per round. Scoring: tops, zones, attempts to top, attempts to zone (IFSC-style ranking order). The engine runs the normal attempt loop with a hard 240 s clock: each move's time cost counts, falls cost 15 s of walking back. Plastic has `friction_base` 0.95, zero `sharpness`, abundant `volume` holds, so `dynamic_movement`, `body_position` and `route_reading` dominate; the commit window fires more often (coordination moves).

**Lead.** One attempt, 6-minute limit, scored by hold count (plus for a controlled move toward the next hold) and time as the tiebreak. Onsight rules: observation period only. `aerobic_capacity`, `finger_endurance`, `route_reading`, `focus`.

**Isolation nerves.** The isolation zone is a `fear` context source (+6 baseline, halved by the Competitor trait, zeroed by `comp_veteran`); warm-up quality depends on `energy` and the venue's facilities.

**Structure.** Qualification (two groups) → semi-final (top 20) → final (top 6/8). Each round is a day block; travel between venues uses the travel graph ([09 §7](09-world-atlas.md)). Prize money and ranking points feed [14](14-economy-gear-logistics.md) and [15](15-social-reputation-events.md). Comp venues are a special crag type in the atlas with `rock: 'plastic'`.

---

## 9. Gym and training (P1a stub, P2 full)

A gym is a crag with `rock: 'plastic'`, `gym_tier` from the host crag/hub, and no ticks. It hosts [12](12-training-and-adaptation.md) activities (`requires: 'gym' | 'board' | 'campus' | 'hangboard' | 'weights'`) and procedural plastic boulders/routes for skill drills. In P1a the "gym" is a hangboard-and-rest menu; in P2 full facilities by `gym_tier` open. Gym climbing yields `tech_*` XP at ×0.7 (less novelty) and no `rock_knowledge`.

---

## Open questions / proposed schema additions

### Open questions

1. Should bouldering keep a vestigial `pump` meter in P1a or hide it entirely until P1b, showing only Power? Leaning to hide.
2. Pinkpoint vs redpoint: a per-region ethics flag or a single global rule? Proposed global rule with Frankenjura dialogue only.
3. Trad `rack_kg` as a derived field on the attempt vs a `GearInstance` sum; needs a decision in [14](14-economy-gear-logistics.md).
4. Competition isolation as a `fear` source vs a separate `nerves` resource; proposed as a fear source to keep one meter.

### Proposed schema additions

- `Route.aid_grade?: string` and `Route.nccs?: 'I'|'II'|'III'|'IV'|'V'|'VI'` for multipitch (08 §3 mentions them; schemas.md does not carry the fields).
- `Protection.coverage?: number` and `Protection.spot_quality?: number` for `pad_zone`.
- `Crag.tide_seed?: string` for DWS crags.
- `Climber.acclimatisation_m: number` (altitude currently adapted to; §5) and `Climber.rack_kg` as derived attempt state (§3).
- `Route.hazard_zones?: { y0: number; y1: number; kind: 'serac'|'cornice'|'avalanche'|'rockfall'; rate_per_hour: number }[]` for alpine.
