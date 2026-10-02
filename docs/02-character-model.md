# Character Model

The climber is four layers: a mostly fixed **Body**, trainable **Attributes**, **Traits** that bend both, and short-horizon **Resources**. Everything the player feels on the wall and in the career traces back to these numbers through the formulas here and in [05b](05b-move-resolution-and-attempt-loop.md).

Related: [schemas](schemas.md) · [03 Traits](03-traits.md) · [04 Backgrounds](04-backgrounds.md) · [05a Kinematics](05a-wall-and-kinematics.md) · [05c Grade Engine](05c-grade-engine.md) · [12 Training](12-training-and-adaptation.md)

Research grounding for this doc is summarised in §G. Numbers marked **(tune)** are design proposals the balance harness ([19](19-balance-and-simulation-testing.md)) is expected to move.

---

## A. Body

Set at creation with sliders. Every slider shows a trade-off panel built from the modifiers below. Body is fixed for the run except mass and body fat (drift with lifestyle) and mobility ceilings (slow decline with age).

### A.1 Sliders and modifiers

| Field | Range | Helps | Hurts | Modifier (applied where) |
|---|---|---|---|---|
| `height_cm` | 145–200 | Reach on vertical and slab (fewer intermediates), clipping stances | Compression (long levers), roofs (mass), strength-to-weight | Reach radius scales with height (§C.1). Per cm above 170: EffectiveStat +0.25% on moves tagged `vertical`/`slab` where the reach check was marginal, −0.20% on `compression`/`roof`. Below 170 the signs flip. **(tune)** |
| `mass_kg` | derived ± 8 | Fall-impact absorption is not a thing; mass only hurts on the wall | Dynamic moves, pump on steep ground, fall injury | `mass_mod = 1 − 0.003 × (mass − ref_mass)` on `dyno`/`deadpoint`/`roof` moves; fall-injury risk +1% per kg over ref. `ref_mass = 0.33 × height_cm − 7` (m) / `0.30 × height_cm − 6` (f). **(tune)** |
| `body_fat_pct` | f 12–32 · m 6–26 | Strength-to-weight, heat tolerance | Injury resilience, cold tolerance, recovery, hormonal stability | `bf_mod = clamp(1 − 0.004 × (bf − ref_fat), 0.90, 1.06)` on all physical EffectiveStats. Injury risk +2% per point below `ref_fat − 3`. Recovery −1.5% per point below `ref_fat − 3`. Cold tolerance −1 °C comfort per point below ref. Low-energy-availability event chain unlocks below `ref_fat − 5`. `ref_fat = 11` (m) / `19` (f). |
| `ape_index` | 0.96–1.10 | Reach, steep terrain, big spans | Slab balance (hips far from wall) | Reach radius × ape (§C.1). EffectiveStat +1% per 0.01 above 1.00 on `overhang`/`roof`/`compression`; −0.5% per 0.01 above 1.04 on `slab`. |
| `finger_length` | −2..+2 | Long: pockets, slopers, pinches | Long: small crimps (lever arm) | Per band: `crimp`/`edge` ∓3%, `pocket*` ±3%, `sloper` ±2%, `pinch` ±2%. |
| `finger_girth` | −2..+2 | Thick: crimps, pulley robustness | Thick: pockets (will not fit) | Per band thick: `pocket1` −6%, `pocket2` −4%, `pocket3` −2%, `crimp` +1%, pulley injury risk −4%. Thin reverses. |
| `leg_torso` | −2..+2 | Long legs: high steps, heel hooks, kneebars | Long legs: roofs (dangling), compression | Per band long: `high_step` +3%, `heel_hook` +2%, `kneebar` +2%, `roof` −2%, `compression` −1%. |
| `natural_hip_mobility` | 0–100 | Sets `hip_mobility` ceiling | — | `ceiling(hip_mobility) = 40 + 0.6 × natural` |
| `natural_shoulder_mobility` | 0–100 | Sets `shoulder_mobility` ceiling, lowers shoulder injury risk | — | `ceiling(shoulder_mobility) = 40 + 0.6 × natural`; labrum/cuff risk ×(1.2 − 0.4 × natural/100) |
| `fibre_bias` | −1..+1 | +: contact, dynos, max strength; −: endurance, recovery between moves | Opposite family | Ceilings: power family +10 × bias, endurance family −10 × bias. Adaptation rate: same direction, ×(1 + 0.2 × bias) / ×(1 − 0.2 × bias). |
| `tendon_robustness` | 0–100 **hidden** | Pulley/elbow/wrist injury resistance, tendon adaptation speed | — | Connective-tissue injury risk `× (1.6 − 1.2 × tr/100)`; tendon adaptation rate `× (0.8 + 0.4 × tr/100)`. Revealed by the first pulley scare event or a sports-physio screening (costs money). |
| `skin_thickness` | thin / normal / thick | Thick: skin cost ×0.8; thin: +3% friction on `sloper`/`smear` (sensitivity) | Thin: skin cost ×1.3; thick: −3% on slopers | As stated. |
| `skin_moisture` | dry / normal / sweaty | Dry: +3% friction baseline | Sweaty: −5% friction in `humid`/`heat`, chalk use ×1.5; dry: split risk ×1.3 in `cold` | As stated. |
| `sex` | f / m | — | — | Chooses the Reference Climber benchmark table ([05c](05c-grade-engine.md)) and body-fat bands. Attributes are relative to the climber's own body, so sex sets no attribute caps. |
| `age_start` | 16–45 | Older: maturity (`composure`, `risk_judgement`, `logistics` +0.8/yr over 18, cap +16), money (+1,500/yr over 18, cap +30,000) | Older: tendon adaptation slower (§E), injury risk +1%/yr over 30, fewer years before decline. 16–17: growth-plate window (campus and full-crimp training injury risk ×2.5, `tech_crimps` gains ×0.7) | As stated. |

### A.2 Mass derivation
`lean_kg = (0.33 × height_cm − 7) × (1 − ref_fat/100)` for m, `(0.30 × height_cm − 6) × (1 − ref_fat/100)` for f; `mass_kg = lean_kg / (1 − body_fat_pct/100) + player_shift (−8..+8)`. The shift represents frame and muscle mass; positive shift raises absolute strength ceilings by +0.5 per kg but applies the `mass_mod` above. **(tune)**

---

## B. Attributes

All attributes are `0..100` with a per-climber `ceiling`. The scale is relative to the climber's own body, so `finger_strength 60` means the same strength-to-weight for a 50 kg and an 80 kg climber. For display and for the Reference Climber table, `finger_strength` maps to a two-arm 20 mm max hang of roughly `100 + finger_strength` % bodyweight (V4 ≈ 28, V8 ≈ 52, V10 ≈ 64, V12 ≈ 76, V15 ≈ 90; §G).

### B.1 Physical (12)

| Attribute | Trains by | Decays by | On the wall | Off the wall | Age family | Ceiling modifiers |
|---|---|---|---|---|---|---|
| `finger_strength` | Max hangs, limit boulders, hard crimps outside | ~4 weeks maintenance window, then −1/week | Primary term on `crimp`, `edge`, `pocket*`, `pinch` (05b matrix) | Pulley risk when load spikes | power | fibre_bias, Iron Tendons/Glass Pulleys, age |
| `finger_endurance` | Repeaters, 4x4s, long routes, ARC | 2–4 weeks | Pump cost multiplier on all hand holds; recovery while holding | — | endurance | fibre_bias |
| `pull_power` | Pull-ups, campus, steep boulders | 4 weeks | `jug`/`sloper`/`roof` moves, `dyno`, `mantle` | — | power | mass shift |
| `lockoff` | Lock-offs, one-arm work, shoulder stability | 4 weeks | Static reaches; `gaston`/`sidepull`; clipping high | Shoulder injury protection | power | natural_shoulder_mobility |
| `core_tension` | Front levers, board climbing, roofs | 4 weeks | Feet-on in `overhang`/`roof`; `compression`; cutting-feet recovery | — | power | — |
| `hip_mobility` | Mobility sessions, slab and high-step volume | −0.7%/yr after 25 untrained | `high_step`, `drop_knee`, `kneebar`, `heel_hook` reach factor | Hip/knee injury protection | mobility | natural_hip_mobility |
| `shoulder_mobility` | Mobility, antagonists | as above | `gaston`, `undercling`, wide `compression`, reach-behind | Labrum/cuff protection | mobility | natural_shoulder_mobility |
| `leg_power` | Jumps, dynos, squats | 4 weeks | `dyno` launch, `high_step` drive, `mantle` | — | power | — |
| `aerobic_capacity` | ARC, easy mileage, cardio | 2–4 weeks | Aerobic reserve size and pump recovery rate on rests | Daily energy, recovery between sessions | endurance | fibre_bias |
| `anaerobic_capacity` | Power-endurance circuits, linked boulders | 3 weeks | Power pool size; cost of consecutive hard moves | — | power | fibre_bias |
| `contact_strength` | Campus, deadpoint drills, slopers | 4 weeks | Catching `dyno`/`deadpoint`; `sloper` and `pinch` initial grab | — | power | fibre_bias |
| `skin_durability` | Climbing on rock; sanding; care | slow | Skin cost multiplier; sharp-rock tolerance | Overnight skin heal rate | skin | skin_thickness, Gecko Skin/Paper Skin |

### B.2 Technique (12 + 2 later)

Technique trains only by doing. **XP rule (per move):**

```
gain = base_gain × novelty × margin_factor × outcome_factor × (1 − value/ceiling)
  base_gain      = 0.06                                   (tune)
  novelty        = 1 + 0.5 × (1 − familiarity_with(hold_type, move_class, rock))
  margin_factor  = exp(−(margin / 0.6)²)                  peaks when the move was at the edge of ability
  outcome_factor = 1.0 clean · 0.7 sketchy · 0.5 slip or fall (informative failure)
```

| Attribute | On the wall | Notes |
|---|---|---|
| `footwork` | Foot-pop probability, `smear`/`foot_chip` EffectiveStat, precision loss under fear | Also reduces pump by shifting load to feet (−2% pump cost per 10 points) |
| `body_position` | Posture quality factor for every move; fall-injury reduction (landing) | The general "climbs well" stat |
| `route_reading` | Reveals hidden holds and hold types pre-attempt; width of displayed success band; onsight gap | Information stat, not a strength stat |
| `dynamic_movement` | `deadpoint`/`dyno` EffectiveStat; commit-window target width | — |
| `tech_crimps`, `tech_slopers`, `tech_pinches`, `tech_pockets`, `tech_cracks`, `tech_slab` | Hold-family multipliers in the 05b matrix | Each trains fastest on its hold family and rock types that feature it |
| `rope_craft` | Clip speed and pump cost, skipped-clip judgement, rope drag, fall-factor reduction | P1b |
| `gear_placement` | Placement quality roll, rack weight efficiency, time per placement | P3 |
| `ice_tools`, `aid_craft` | P4 / P3 | — |

### B.3 Mental (6) — each has exactly one on-wall hook

| Attribute | On-wall hook | Off-wall | Trains by |
|---|---|---|---|
| `composure` | Fear decay rate per turn: `fear −= 0.08 × composure` per rest or clean move **(tune)** | Fewer stoke crashes after falls | Fall practice, exposure, meditation events, lead mileage |
| `focus` | Width of the auto-success band: `T = 1.2 − 0.6 × focus/100` DI **(tune)** | Training session quality | Hard onsights, comps, mindfulness |
| `confidence` | Fear baseline at attempt start: `fear0 = 40 − 0.3 × confidence + context` | Sponsorship pitch, partner recruitment | Sends raise (+1 per send at or above personal best), falls on the lip lower (−2) |
| `commitment` | Removes the hesitation penalty on `dyno`/`deadpoint` (−10% EffectiveStat at 0, 0 at 70+); commit-window target width | — | Successful dynamic moves, pushing through fear |
| `risk_judgement` | Accuracy of the displayed danger label and fall-consequence preview (noise ∝ 1 − rj/100) | Alpine retreat decisions, gear-rip warnings | Experience, mentors, near misses |
| `resilience` | Stoke recovery after failure/injury: `stoke += 0.1 × resilience` per rest day | Burnout accrual rate ×(1 − resilience/200) | Time, support network, coming back from injury |

Patience and competitiveness are **traits**, not attributes ([03](03-traits.md)).

### B.4 Lifestyle and knowledge (5 + per-rock)

| Attribute | Effect |
|---|---|
| `nutrition` | Recovery multiplier `0.8 + 0.4 × nutrition/100`; body-fat drift control |
| `sleep_hygiene` | Overnight energy and skin regeneration multiplier; jet-lag penalty duration |
| `logistics` | Travel cost −0.3%/pt, permit and reservation success, fewer "lost day" events |
| `languages` | Community access and reputation gain rate in non-native regions |
| `weather_sense` | Forecast reliability (10 §4), chance to spot a sending window |
| `rock_knowledge[rock]` | +0.1% EffectiveStat per point on that rock; faster `tech_*` gains there; reveals seep/dry-out timing |

### B.5 Effect application order

1. Body-derived ceilings (A.1).
2. Background `attr_add` ([04](04-backgrounds.md)).
3. Player starting allocation (§F).
4. Trait `attr_add`, then `ceiling_add`; clamp values to ceilings.
5. At evaluation time (05b): one `attr_mult` max per attribute → hold/move/condition multipliers (additive among themselves: `1 + Σ(m_i − 1)`) → Body modifiers (A.1) → state modifiers (pump, fear, focus).

---

## C. Derived stats

### C.1 Kinematics (see [05a](05a-wall-and-kinematics.md))
```
height_m  = height_cm / 100
span_m    = height_m × ape_index
arm_len   = 0.44 × height_m × ape_index                    shoulder to fingertip
leg_len   = 0.47 × height_m × (1 + 0.03 × leg_torso)        hip to toe
hip_reach_factor      = 0.7 + 0.3 × hip_mobility / 100
shoulder_reach_factor = 0.85 + 0.15 × shoulder_mobility / 100
```

### C.2 Effective strength modifiers
```
bf_mod    = clamp(1 − 0.004 × (body_fat_pct − ref_fat), 0.90, 1.06)
mass_mod  = 1 − 0.003 × (mass_kg − ref_mass)          dynamic and roof moves only
height_mod(tagset), ape_mod(tagset), finger_mods(hold_type), leg_mods(move_class)   per A.1
```

### C.3 Grade estimates (display on the character sheet)
`DI_boulder_est`, `DI_redpoint_est`, `DI_onsight_est` are obtained by inverting the Reference Climber table ([05c §1](05c-grade-engine.md)) on the climber's current attribute vector. The onsight gap is `1.0 + 1.5 × (1 − route_reading/100) + 0.5 × (1 − composure/100)` DI below redpoint **(tune)**. Estimates are shown with ± uncertainty that narrows with `route_reading`.

### C.4 Pump recovery (per 10 s of rest, see [05b §6](05b-move-resolution-and-attempt-loop.md))
```
recover = 1.2 × aerobic_capacity/100 × rest_value × (aerobic_reserve/100)^0.5 × (1 − 0.6 × overgrip)   pump points   (tune)
```

### C.5 Base fall-injury risk (see [13](13-injury-and-health.md))
```
p_injury = base(fall_kind, consequence) × age_mod × (1 − 0.3 × body_position/100) × (1 + 0.01 × (mass − ref_mass)) × Π trait_mults
age_mod  = 1 + 0.01 × max(0, age − 30)
```

### C.6 Sending-temperature window (see [10](10-weather-and-conditions.md))
Centre 12 °C, half-width 5 °C. Sweaty hands shift the centre −3 °C; dry hands +1 °C; Furnace/Cold Blooded traits shift ±4 °C. Friction modifier outside the window falls 1.5% per °C **(tune)**.

---

## D. Resources

| Resource | Horizon | Reset / regeneration | Notes |
|---|---|---|---|
| `pump` | attempt | 0 at start; rises per move; recovers on rests (C.4); 100 = fall | Primary failure mode |
| `power` | attempt | `anaerobic_capacity` at start; dynamic moves spend 8–25; recovers 2/turn on rests | Empty pool: dynamic moves at −30% |
| `aerobic_reserve` | attempt | `aerobic_capacity` at start; −1 per 10 s on the wall; feeds C.4 | Makes "rest forever" impossible |
| `fear` | attempt | `fear0` from `confidence` + context; sources in 05b §7 | IZOF band centre `50 − 0.2 × composure`, half-width `15 + 0.1 × composure` **(tune)** |
| `focus_meter` | attempt | starts at `focus`; −3 per sketchy outcome; +2 per clean crux move | Scales auto-success band |
| `chalk` | attempt | 100 at start; −5 per hand move; chalk-up restores 60 | Over-chalking holds: −3% friction |
| `skin` | day | heals overnight `+ (20 + 0.3 × skin_durability) × sleep_mult` | Below 30: skin cost ×2 and sloper friction −10%; 0 = cannot climb |
| `energy` | day | 100 after full rest × sleep and nutrition multipliers; each block costs 30–60 | Below 25: EffectiveStat −10% |
| `stoke` | week | ±; sends, new places, friends raise; failure streaks, bad weather, loneliness lower | Below 20: training gains ×0.5, "quit" events |
| `burnout` | season | accrues with monotony, high load, repeated failure; falls on rest weeks and novelty | Above 80: forced break or run-ending quit event |
| `health` | run | illness, injury, altitude lower; rest and care raise | Below 50: energy regen halved |
| `money` | run | income and costs ([14](14-economy-gear-logistics.md)) | Below 0 for 30 days: bankruptcy end |

---

## E. Age curves

Age is applied as a multiplier on **ceilings** and on **adaptation rate**; current values then decay toward the lowered ceiling at the attribute's decay rate. Curves below are design simplifications of §G sources **(tune)**.

| Family | Ceiling multiplier | Adaptation rate multiplier |
|---|---|---|
| power (`finger_strength`, `pull_power`, `lockoff`, `core_tension`, `leg_power`, `anaerobic_capacity`, `contact_strength`) | 1.00 to 27; −0.5%/yr 28–34; −1.5%/yr 35–44; −2.5%/yr 45+ | 1.0 to 30; 0.8 at 40; 0.6 at 50; linear between |
| endurance (`finger_endurance`, `aerobic_capacity`) | 1.00 to 32; −1%/yr 33–44; −2%/yr 45+ | 1.0 to 35; 0.8 at 45; 0.65 at 55 |
| mobility | −0.7%/yr after 25 untrained; maintenance halves the loss | — |
| skin | +0.3%/yr to 50 | — |
| technique | flat to 55; −0.5%/yr after | learning rate −0.5%/yr after 30 |
| mental | `composure`, `risk_judgement` ceilings +0.5/yr to 50; others flat | — |

**Tendon clock.** Connective-tissue adaptation half-time `t½ = 90 days × (1 + max(0, age − 25)/20) × (1.2 − 0.4 × tendon_robustness/100)`; see [12](12-training-and-adaptation.md). Full remodelling 18–24 months at 25, proportionally longer later.

---

## F. Starting allocation

- Base values before background: physical 20, technique 10, mental 35, lifestyle 25. **(tune)**
- Background applies `attr_add` and grants `attr_points` (default 60) that the player distributes, max +25 to any one attribute, none above its ceiling.
- Trait points ([03](03-traits.md)) are a separate budget. This separation means two climbers with identical traits can still be built differently.
- Quick-build presets fill both budgets for a chosen archetype and can be edited afterwards.

---

## G. Research grounding (see plan appendix and [19](19-balance-and-simulation-testing.md) for how these become tests)

- Finger strength relative to body mass is the dominant trainable predictor of grade (r = 0.42–0.92 across studies; Lattice two-arm 20 mm benchmarks: V4 ≈ 128% BW, V8 ≈ 152%, V10 ≈ 164%, V11 ≈ 170%; one-arm V4 ≈ 49%, V8 ≈ 73%, V12 ≈ 96%). Mermier (2000): a "training" component explained 58.9% of variance, anthropometry 0.3%, flexibility 1.8%. Hence Body is a modifier layer, Attributes carry the weight.
- Height explains ~1% of grade variance and flips sign by terrain; elite ape index 1.06 vs 1.03 national; top-100 BMI 21.1 (m) / 19.3 (f) with no BMI–grade correlation in the general population. Hence small, direction-flipping height and ape modifiers.
- Boulderers test 26–53% higher on max/explosive strength than lead climbers with equal finger endurance, motivating the power vs endurance families and `fibre_bias`.
- Hip flexibility predicted women's boulder competition results; shoulder-girdle endurance and hip flexibility separate advanced from recreational climbers.
- Elite body fat: adults ~12% (m) / ~23% (f); youth elite lower. Low energy availability is a known risk, hence the `ref_fat − 5` event chain.
- IFSC finalists average 22–23 years across disciplines; logged hardest grades are flat from 18 to the mid-30s; judgement-limited disciplines peak later. Tendon remodelling takes 3–6 months with full adaptation at 18–24 months; pulleys in experienced climbers are 60%+ thicker.
- Advanced climbers show no lead-vs-toprope anxiety gap while intermediates do (Fryer 2013), motivating `composure` as a trainable decay rate rather than a fixed trait.
- Full citations are in the plan appendix and will be carried into `docs/sources.md` when the data files are built.

## Open questions

- Whether `skin_durability` should be a trainable attribute or purely a Body property plus resource. It is kept trainable because rock mileage visibly toughens skin, but the harness may show it is too weak to deserve a slot.
- Whether `rock_knowledge` should be exposed to the player per rock type or summarised into a single "experience on this rock" line per crag. Leaning towards the summary for UI space.
- **`ref_mass` is wrong as written and must be replaced before code.** `0.33 × height_cm − 7` gives 50.75 kg at 175 cm (BMI 16.6). The intended anchor is the elite BMI from §G, so the replacement is `ref_mass = 21.5 × height_m²` (m) and `20.0 × height_m²` (f), with `lean_kg = ref_mass × (1 − ref_fat/100)` in §A.2. The worked examples in [05b §14](05b-move-resolution-and-attempt-loop.md) were computed against the formula as written; when the replacement is adopted, re-run the scratch calculator and refresh those numbers (the effect is confined to `mass_mod` and the fall-injury mass term, both small).
- **The §C.4 recovery constant is about ten times too small as a per-10-second rate.** At `aerobic_capacity 50`, `rest_value 1`, full reserve it yields 0.6 pump points per 10 s, so a 60-second jug rest recovers under 4 points. [05b §6](05b-move-resolution-and-attempt-loop.md) uses the formula verbatim as the stale-stance trickle and adds a first-shake freshness term (`12 × 0.5^(k−1)`) to make rests matter; either raise the constant to ~12 and drop the freshness term, or keep the two-part model and document it here. Decide in P1a with the harness.
