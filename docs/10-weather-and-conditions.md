# Weather and Conditions

Conditions are the main reason real climbers travel when they do, so the game generates daily weather per crag from the atlas climate record and turns it into a single `friction` multiplier plus a set of gates (wet rock, snow, heat, altitude). Everything is seeded, so two players on the same run seed see the same sending day at Font.

Related: [schemas](schemas.md) (`Climate`, `AccessRule`) · [02 §C.6](02-character-model.md) · [05b](05b-move-resolution-and-attempt-loop.md) · [09 World Atlas](09-world-atlas.md) · [13 Injury](13-injury-and-health.md) · [15 Reputation](15-social-reputation-events.md)

Numbers marked **(tune)** are design proposals.

---

## 1. Climate → daily weather (seeded Markov chain)

Each crag's `Climate.month[m]` gives `t_mean`, `t_sd`, `rh_mean`, `precip_days`, `wind_mean`, `snow`. The daily generator is a four-state Markov chain evaluated once per crag per sim day with `RngStream('weather', run_seed, crag_id, day)`.

**States:** `clear` · `cloudy` · `rain` (or `snow` when `month.snow` and `t < 1 °C`) · `storm`.

**Transition approach.** Let `p = precip_days / days_in_month` be the monthly wet fraction. The stationary distribution is set to `clear 0.55(1−p)`, `cloudy 0.45(1−p)`, `rain 0.85p`, `storm 0.15p`; persistence is then imposed with a stickiness `s = 0.6` (weather tends to repeat) by `P(i→i) = s + (1−s)·π_i`, `P(i→j) = (1−s)·π_j`. Storm only follows `cloudy` or `rain` (clear → storm is remapped to cloudy). Mountain crags (`altitude_m > 1,800`) use `s = 0.45` (faster-changing). **(tune)**

**Daily draws given state:**

| Variable | clear | cloudy | rain/snow | storm |
|---|---|---|---|---|
| `t_max` | `t_mean + 4 + N(0, t_sd)` | `t_mean + 1 + N(0, t_sd)` | `t_mean − 2 + N(0, t_sd/2)` | `t_mean − 4 + N(0, t_sd/2)` |
| `t_min` | `t_max − 10` | `t_max − 6` | `t_max − 4` | `t_max − 5` |
| `rh` | `rh_mean − 15` | `rh_mean` | `min(100, rh_mean + 20)` | `min(100, rh_mean + 25)` |
| `wind` (m/s) | `wind_mean × U(0.3, 1.2)` | `× U(0.6, 1.4)` | `× U(0.8, 1.8)` | `× U(1.5, 3)` |
| `precip_mm` | 0 | 0 | `Exp(mean 8)` | `Exp(mean 25)` |

An intraday curve gives hour-by-hour temperature (`t_min` at 06:00, `t_max` at 15:00, cosine between), used by the dawn/dusk session rule (§8). Dew point is `Td = t − (100 − rh)/5`.

---

## 2. Friction

The engine multiplies `EffectiveStat` on hand and foot holds by `friction`:

```
friction = rock_base × chalk_term × sweat_term × rubber_term × wet_term × wind_term × polish_term
```

| Term | Formula | Source / note |
|---|---|---|
| `rock_base` | `CragStyleProfile.friction_base`: limestone 1.00 reference; sandstone family 1.16 (Fuss & Niegl 2012: sandstone 15.6–18.4% higher than limestone); gneiss/granite 1.08; quartzitic 1.14; tuff/rhyolite 1.06; conglomerate 1.04; plastic 0.95; ice n/a | Measured |
| `chalk_term` | hands: `1 + 0.187 × c` on limestone, `1 + 0.216 × c` on sandstone, `1 + 0.20 × c` elsewhere, where `c = chalk/100` of the climber's hand chalk (02 §D). Hold over-chalk: `× (1 − 0.03 × max(0, hold.state.chalk − 0.6)/0.4)` **(tune)** | Fuss & Niegl 2012: +18.7% limestone, +21.6% sandstone; chalk caked on both hand and hold reduces friction; Clarke 2024: benefit depends on roughness, so `polish` scales the gain by `(1 − 0.5 × polish)` |
| `sweat_term` | `1 − 0.004 × max(0, t_hand − 20) × (1 + 0.5 × humid)` where `t_hand = t + 8` in sun, `t + 3` in shade, `humid = (rh − 50)/50` clipped at 0; sweaty-hands body shifts the threshold to 16 °C, dry hands to 23 °C **(tune)** | Fuss & Niegl found no linear temperature or humidity effect on rubber/rock friction in 12–28 °C, so the model does **not** put temperature in `rock_base`; the practitioner "sending temps" effect is modelled as hand sweat and rubber temperature explicitly |
| `rubber_term` | shoe rubber temperature `t_rub = t_rock + 6` after a few moves; `1.00` at 0–8 °C, −0.6% per °C above 8 up to −12% at 28 °C; −0.8% per °C below −2 (glassy) **(tune)** | Rubber near its glass transition; shoes are tuned to roughly 0–5 °C rubber temperature |
| `wet_term` | 1.0 dry; 0.85 damp; 0.5 wet; sandstone family 0.4 wet and blocked by §4 | Design |
| `wind_term` | `1 + 0.01 × min(wind, 6)` (dries hands and rock); above 12 m/s balance penalty via `footwork` −5% | Design |
| `polish_term` | `1 − 0.25 × hold.polish` | Design; limestone classics |

**Sending window (02 §C.6).** The combined `sweat_term × rubber_term` peaks near 12 °C and falls about 1.5% per °C outside a ±5 °C window for a normal-handed climber, which is the behaviour 02 §C.6 states and the UI labels as "conditions". The window centre shifts with `skin_moisture` and the Furnace/Cold Blooded traits exactly as 02 §C.6 gives.

**Sun and shade.** `Climate.shade_fraction` is the share of sectors in shade at midday. A sector in sun uses `t_rock = t + 8`; shade `t + 1`. The crag UI offers a sun/shade sector choice per block.

---

## 3. Condensation

When `t_rock < Td` (rock colder than dew point; typical on a warm humid afternoon after a cold night, or at coastal limestone) holds gain `state.wet = 0.5` ("greasy") for as long as the condition holds plus one hour. North-facing and cave sectors are 2 °C colder. Kalymnos in May and Yangshuo most of the year live here.

---

## 4. Wet-rock rules

`AccessRule{kind:'wet_rock', dry_days_required, rep_penalty_if_violated}` per crag; the generic rule by rock type when the crag has none.

| Rock | Rule | Mechanics |
|---|---|---|
| `sandstone_font` | no damp climbing | Blocked while `state.wet > 0` or `rh > 90` after rain; `dry_lag_days` 1 in wind/sun, 2 in still humid air; forest sectors +1. Climbing anyway: hold `quality` −0.1 permanently on that problem, `rep −15` region |
| `sandstone_aztec` (Red Rocks) | 24–72 h after rain | `dry_days_required` 1 after light rain (< 3 mm), 2 after moderate, 3 after storm; violation `rep −20` and a sandstone-break event (hold removed) |
| `sandstone_wingate` (Indian Creek) | 24–48 h | `dry_days_required` 1–2; cam placements `quality −0.3` while damp (dangerous wet) |
| `sandstone_grit`, `sandstone_nuttall`, `sandstone_quartzitic`, `sandstone_generic`, `sandstone_elb` | 2 dry days (general) | `dry_days_required` 2; Elbsandstein ethics add a `rep −25` |
| `sandstone_corbin` (RRG) | **exception**: climbable in rain on steep sectors | `wet_term` 0.9 only on routes with `angle > 110`; vertical sectors follow the 2-day rule |
| `limestone`, `dolomite` | surface dries in hours; tufa/seep sectors stay wet days–weeks | `dry_lag_days` 0.5; `seep_lag_days` 7–21 after a wet week by `seep_susceptibility`; seep status is hidden until `rock_knowledge[limestone] ≥ 30` or a local tells you |
| `granite`, `monzonite`, `syenite`, `gneiss`, `quartzite`, `tuff`, `basalt`, `dolerite`, `schist`, `conglomerate` | climbable when dry to the eye | `dry_lag_days` 0.5–1; gneiss (Magic Wood) 1.5 in forest |
| `plastic` | indoor | none |

Violation penalties apply to regional reputation ([15](15-social-reputation-events.md)) and may spawn a confrontation event; they never apply to the player's own score. Partners with high `ethics` refuse to spot or belay on wet sandstone.

---

## 5. Snow and ice at mountain crags

When `month.snow` and the daily state is `rain` with `t_max < 1 °C`, snow depth accumulates (`+precip_mm × 1.2 cm`), melts at `t_max − 2` cm/day above 2 °C, and blocks rock climbing while depth > 5 cm on approach or ledges. Ice venues invert the rule: ice `quality` follows the curve in [07 §6](07-disciplines.md) and the season is open while a 7-day mean `t_max < 0 °C`.

---

## 6. Heat

`heat_index = t + 0.1 × max(0, rh − 40)`. Above 28 in sun: `energy` cost of every block ×1.3 and skin cost ×1.2; above 33: heat-illness roll per block ([13](13-injury-and-health.md)), `focus_meter` −10 at attempt start. Heat exhaustion is avoided by shade sectors and §8.

---

## 7. Altitude recovery penalty

Unacclimatised above **~1,900 m** (Rifle, Céüse, Ten Sleep, Ouray): overnight `energy` regeneration ×0.9 and pump recovery ×0.95 for the first 5 nights, fading linearly to 1.0 by night 6 as `acclimatisation_m` rises ([07 §5](07-disciplines.md)). Above 2,600 m the penalty starts at ×0.85 and the full acclimatisation model applies. Source: sustained-endurance decline with unchanged MVC (PMC8306057, PMC9691031).

---

## 8. Dawn and dusk sessions

A day block can be scheduled `dawn` (05:30–09:30) or `dusk` (16:30–20:30) instead of `day`. The block uses the intraday temperature curve, so a 32 °C Rodellar day gives 18 °C at dawn. Costs: dawn needs `sleep_hygiene ≥ 40` or the Early Bird trait, else `energy` −10 that day; dusk needs a headtorch and ends with a `logistics` roll for the walk-off in the dark. Both halve social-event weights for the day.

---

## 9. Forecast reliability

The player sees a 1–5 day forecast. Each displayed day is the true generated state with probability `r_d = clamp(0.55 + 0.004 × weather_sense − 0.08 × (d − 1), 0.3, 0.97)` **(tune)**; otherwise a neighbouring state is shown. Temperature shows with ±`(3 − 0.02 × weather_sense) × d` °C noise. Mountain crags subtract 0.1 from `r_d`. Weather Sense also surfaces a "sending window" banner when the next three days fall inside the climber's sending window with `wet_term` 1.0.

---

## Open questions

1. Whether `friction` should be clamped at 1.25 to stop stacked bonuses (dry sandstone, chalk, wind, cold) making DI drift more than 0.5 on a perfect day; the harness should report friction variance by crag.
2. The RRG rain exception may need an angle threshold per sector rather than per route.

## Proposed schema additions

- `Crag.sun_aspect?: 'n'|'e'|'s'|'w'|'mixed'` per crag (or per sector) so sun/shade is not only a fraction.
- `Hold.state.wet` already exists; add `WorldState.snow_depth_cm: Record<crag_id, number>` and `WorldState.weather: Record<crag_id, DailyWeather>` where `DailyWeather = { state; t_max; t_min; rh; wind; precip_mm }`.
- `TrainingActivity`/day block `time_of_day?: 'dawn'|'day'|'dusk'`.
