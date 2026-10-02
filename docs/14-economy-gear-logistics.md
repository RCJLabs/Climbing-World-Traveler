# Economy, Gear and Logistics

Money is the quiet antagonist of a climbing career: it decides where you can be, for how long, and in what condition. This doc specifies every income source and cost as numbers, the gear model (what you own, how it wears, how it bends your on-wall stats), and the logistics layer (visas, permits, vehicles, shipping) that turns the world atlas into a real travel problem. All figures are USD-equivalent `money` units; display currency is cosmetic. Anchors come from the research brief (plan Appendix A7); everything else is marked **(tune)** for the harness ([19](19-balance-and-simulation-testing.md)).

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [09 World Atlas](09-world-atlas.md) · [11 Time, Career, Aging](11-time-career-aging.md) · [13 Injury and Health](13-injury-and-health.md) · [15 Social, Reputation, Events](15-social-reputation-events.md) · [16 Meta-progression](16-meta-progression-and-runs.md)

---

## 1. Money model

- `Resources.money` is settled once per sim day: `money += income_today − costs_today`. Travel edges, purchases (`buy`/`sell` actions) and permits are charged when taken.
- Living costs are driven by `Crag.cost_tier` (1–5) and the chosen lodging tier (§4). Income comes from activity blocks spent working (§2) and from passive streams (sponsorship, content).
- Traits scale costs through `TraitEffect.cost_mult` (Dirtbag ×0.8, Trust Fund flat stipend, Gear Nerd gear ×1.3, see [03](03-traits.md)).
- `age_start` adds starting savings (+1,500/yr over 18, cap +30,000; [02 §A](02-character-model.md)) on top of `Background.money_start`.
- **P1a stub:** fixed $35/day at Fontainebleau, no income, starting money from the background. Everything else in this doc is P2 unless marked.

---

## 2. Income sources

One activity block is half a day ([11](11-time-career-aging.md)). Working costs `energy` like a training block and raises `burnout` when it dominates a week.

| Source | Requirement | Rate (per block) | Energy | Side effects | Phase |
|---|---|---|---|---|---|
| Remote work | Remote Worker trait, Academic or Desk-Job background; connectivity at location (§9 proposal) | $60 junior · $125 mid · $200 senior **(tune)**; seniority from background | −15 | `stoke` −2 per week with ≥ 4 work blocks | P2 |
| Odd jobs (gym desk, bar, harvest, hostel shift) | `community_size` ≥ small or at a hub | $35–65 by `cost_tier` (tier 1: $35 … tier 5: $65) | −25 | `stoke` −3/week; hostel shift pays in lodging instead | P2 |
| Route setting | `gym_tier` ≥ 2; `route_reading` ≥ 40 | $90–150 | −30, `skin` −8 | `route_reading` +0.15 per block **(tune)**; max 2 blocks/week offered | P2 |
| Coaching | estimated boulder or route DI ≥ 20, or Gym Comp Kid background | $70–135 (3 h at $45–90/h, by tier) | −15 | regional rep +0.5; builds `comp_kid` contacts | P2 |
| Guiding | `guide_cert` acquired trait (proposal) or Guide's Apprentice background; `rope_craft` ≥ 50 and `gear_placement` ≥ 40 for rock, `ice_tools` ≥ 50 for ice | $90–175 per block; full days only (2 blocks) | −35 | regional rep +1 per day; client-accident event exposure | P3 |
| Content | `following` ≥ 1,000 (proposal §9) | passive `$0.002 × following` per day **(tune)**; a posting block adds following +1.5% and a viral roll ([15](15-social-reputation-events.md)) | −10 per posting block | needs connectivity | P2 |
| Competition prizes | entered comp (P3) | see §2.2 | — | following and rep gains | P3 |
| Selling gear | owns item | `price × condition × 0.6` **(tune)** | — | removes `GearInstance` | P2 |
| Selling a vehicle | owns vehicle | 85% of paid price after year 1, −10%/yr after | — | lodging cost returns to tier rates | P2 |

### 2.1 Sponsorship tiers

Sponsorship is the only large income and it is deliberately rare. Research anchor: most sponsored climbers earn under $10k/yr; the top tier earns $200–500k, 60–80% of their income, with heavy content obligations. Eligibility is checked monthly; contracts run a year and renew if obligations were met and no ethics breach occurred.

| Tier | Name | Cash / yr | Gear value / yr | Eligibility (any one bold condition plus all plain ones) **(tune)** | Obligation (posting blocks / month) | Flavour |
|---|---|---|---|---|---|---|
| 0 | None | 0 | 0 | — | 0 | Pay for your own shoes |
| 1 | Shoe deal | 0 | $800–1,500 | **DI ≥ 20 boulder or ≥ 21 route**; regional rep ≥ 30 somewhere | 0.5 | Free rubber, a logo on your chalk bag |
| 2 | Ambassador | $2,000–8,000 | $2,500 | **DI ≥ 24**; following ≥ 5,000 or rep ≥ 50 in two regions | 2 | Most "sponsored" climbers live here |
| 3 | Athlete | $10,000–35,000 | $4,000 | **DI ≥ 26** or national podium; following ≥ 20,000 | 4 | Travel budget appears |
| 4 | Pro | $40,000–120,000 | $6,000 | **DI ≥ 28** or World Cup podium; following ≥ 100,000 | 6 plus one 7-day sponsor trip / yr | Content calendar becomes a job |
| 5 | Headline | $200,000–500,000 | $10,000 | **DI ≥ 30**, World Cup title, or landmark first ascent; following ≥ 500,000 | 8 plus two 7-day trips / yr | A handful of people on Earth |

Rules: missing more than 25% of a year's obligation blocks demotes one tier; an ethics incident ([15 §3](15-social-reputation-events.md)) terminates the contract; an injury layoff over 6 months demotes one tier unless the Loyal-sponsor event fires. Cash is paid monthly.

### 2.2 Competition prize money (P3)

| Level | 1st | 2nd | 3rd | 4th–6th | Entry fee | Notes |
|---|---|---|---|---|---|---|
| Local gym comp | $100–300 + voucher | $50–150 | voucher | — | $25–40 | Following +2% on podium |
| National championship | $600–1,500 | $300–800 | $150–400 | $0–100 | $60–120 | Qualifies for tier-3 sponsorship eligibility |
| World Cup | $3,500–5,000 | $2,000–2,800 | $1,200–1,800 | $400–900 | federation-covered if selected | Travel $900–2,500 unless federation-funded |

Competition income never funds a career alone; it is a reputation and sponsorship lever.

---

## 3. Costs by cost tier

Daily base costs are read from `Crag.cost_tier`. The anchors below locate real places on the scale.

| Tier | Label | Camp / wild | Hostel, refuge, shared | Studio / apartment | Hotel | Food / day | Anchor examples |
|---|---|---|---|---|---|---|---|
| 1 | Very cheap | $3 | $8 | $15 | $35 | $8 | Hampi, Todra, Yangshuo, Railay, El Potrero Chico, Wadi Rum |
| 2 | Cheap | $7 | $15 | $30 | $60 | $14 | Hueco ($7/day entry on top), Rocklands on the ground (≈ $23/day), Siurana, Albarracín, Red River Gorge, Rodellar |
| 3 | Moderate | $10 | $25 | $45 | $100 | $22 | Fontainebleau, Frankenjura, Bishop, Yosemite (Camp 4 $10/night), Kalymnos (studio €25–39/night shared by two), Peak District, Red Rocks, Smith Rock |
| 4 | Expensive | $15 | $40 | $80 | $160 | $32 | Magic Wood, Ticino, Squamish, Céüse, Chamonix, Flatanger, Rifle, Canmore, Arapiles |
| 5 | Remote / expedition | lump sums (§5) | — | — | — | $40 (freighted) | Trango, Baffin, Mount Kenya, Cochamó |

Checks against the anchors: a US road trip at tier 2–3 with a van (camp $0–10, food $14–22, fuel and running $12) lands at $35–40/day ≈ $1,160/month. Rocklands is $23/day on the ground plus flights $1,200–1,600 and a $68/30-day permit ≈ $70/day over a month.

**Lodging tier effects (tune):** camp: `sleep_hygiene` multiplier ×0.92 when night temperature < 5 °C, `social` events ×1.3; hostel: `social` events ×1.5; studio: recovery ×1.03; hotel: recovery ×1.06, `stoke` +1/day for the first week; own vehicle: camp cost 0 wherever the edge mode is `drive`, recovery as hostel. Food has two options per day: *cheap* (table price, `nutrition` effect ×0.9) or *eat well* (×1.6 price, `nutrition` effect ×1.1).

---

## 4. Recurring and situational costs

| Item | Cost | Notes |
|---|---|---|
| Gym | day pass $15–28; month $55 / $80 / $110 at `gym_tier` 1 / 2 / 3 | Required for `requires: 'gym'|'board'|'campus'` activities ([12](12-training-and-adaptation.md)) unless you own a hangboard ($60) |
| Physio | $60–120 per session (tier 3–4), $40–70 (tier 2), $15–30 (tier 1) | Rehab plans need 1–2 sessions/week; a sports-physio screening ($120) reveals `tendon_robustness` |
| Insurance | $45–90 / month standard; $120 / month with expedition and rescue cover | Uninsured injury bills: surgery $8,000–40,000 (US), $400–3,000 (EU), $200–1,500 (tier 1 regions); helicopter rescue $5,000–50,000 |
| Chalk, tape, skin care | $10 / month | Sweaty hands ×1.5 |
| Visa | see §6 | — |
| Permits and fees | see §5 | — |
| Vehicle running | $350 / month + $0.12 / km | — |

---

## 5. Permits, fees and expedition lump sums

These are `AccessRule` entries (`kind: 'permit' | 'fee' | 'daily_cap' | 'reservation'`) on the crag; the game charges `cost` when the rule applies.

| Place | Rule | Cost | Mechanics |
|---|---|---|---|
| Rocklands | permit | $68 per 30 days | Bought at the farm office on arrival |
| Hueco Tanks | fee + daily_cap + reservation | $7 / day | North Mountain cap 70: 60 reservations, 10 walk-ins, max 3 consecutive days; a failed walk-in costs the day; `logistics` ≥ 50 books reservations 3 days ahead |
| Yosemite | permit | free | Self-registered wilderness permit for big walls; Camp 4 $10/night, 7-night cap in season |
| Kilimanjaro / Mount Kenya | fee | $70 / day + park fees | Fees rising; guide mandatory on some routes |
| Trango Towers | permit + logistics | ~$300 trekking fee + $2,400–4,700 base-camp logistics | Lump sum paid before the travel edge; 6–8 week commitment |
| Baffin (Thor/Asgard) | logistics | flights $2,500–4,000 + boat $350–500 | Weather delay days charge tier-5 food |
| El Chaltén | none | free | Wait days to weeks for a window; cost is time, not money |
| Cochamó | daily_cap + reservation | free | 90 per day, reservation required |
| Gunks | fee | $20 / day or $100 / season | — |

---

## 6. Visas and borders

Each `TravelEdge` crossing a border consults the destination's `visa` AccessRule. Three classes keep the model small **(tune)**:

| Class | Cost | Lead time | Max stay | Failure mode |
|---|---|---|---|---|
| Free | $0 | 0 days | 90 days per 180 in the zone | Overstay: $300 fine, rep −10 in the region, zone locked 180 days |
| On arrival | $25–60 | 0 days | 30–60 days | Pay at the edge |
| Advance | $60–160 | 3–10 days (needs a hub) | 30–90 days | `logistics` < 40: 15% chance of a lost-week event |

Passport class is set by `home_region`. The Polyglot and Logistics traits lower lead times; a lost passport is an event ([15 §4.3](15-social-reputation-events.md)).

---

## 7. Vehicles and shipping

- **Vehicle:** used van $8,000–25,000; optional build-out $3,000–15,000 adds the "own vehicle" lodging tier. Running cost $350/month plus fuel. Breakdown event base 2%/month, ×2 for vans under $10,000. Selling returns 85% after year 1, then −10%/yr. Only usable on edges with `mode: 'drive'`; flying away leaves it parked (running costs continue at half).
- **Shipping and baggage:** checked bag $40–75 per flight; a crash pad flies as oversize $80–150 each way; expedition freight $400–900; renting pads where offered $10/day.

---

## 8. Gear model

Gear is a list of `GearInstance` on the climber (type proposed in §10). Each instance has a `def` from the catalogue, a `condition` 0..1 and a wear history. Gear changes on-wall numbers through the same multiplier path as traits (`hold_mult` / `move_mult`, additive among themselves, [02 §B.5](02-character-model.md)).

### 8.1 Catalogue (tune)

| Gear id | Price | Lifetime | Effect summary |
|---|---|---|---|
| `shoes_aggressive`, `shoes_flat`, `shoes_stiff`, `shoes_soft` | $150 / $110 / $140 / $140 | 40–80 sessions of rubber | §8.2 |
| `resole` (service) | $55 | restores rubber to 0.85; max 2 per pair | — |
| `rope_60`, `rope_70`, `rope_80` | $200 / $240 / $280 | 25 hard falls or 150 sessions | 60 m limits routes to 28 m; 80 m needed for 40 m pitches |
| `quickdraws_12` | $200 | indefinite | Required for `sport` |
| `rack_single` | $900 | cams lose 2% quality / 50 placements | cams `c0.3`–`c3` ×1, nuts `nut1`–`nut13` |
| `rack_double` | $1,700 | as above | ×2 cams `c0.3`–`c4` |
| `rack_creek` | $2,400 | as above | ×6 of two chosen sizes (`c1`/`c2`), ×2 others |
| `pad_small`, `pad_large` | $200 / $420 | foam −1% / session | 1.0 m² / 1.6 m² landing area |
| `cold_kit` | $450 | indefinite | belay jacket, gloves, hat, warm boots |
| `ice_tools` | $600 | sharpen $20 every 15 sessions | required for `ice`/`mixed`; `quality` affects `ice_pick` holds |
| `crampons`, `screws_10` | $220 / $700 | — | screws cap protection count on ice |
| `helmet`, `harness`, `hangboard` | $80 / $70 / $60 | 5 yrs / 3 yrs / — | helmet halves head-injury severity |

### 8.2 Shoes

Shoe type is a build choice renewed every pair. Modifiers apply to the foot limb's `EffectiveStat` on moves using the listed holds or classes **(tune)**:

| Type | `smear` | `foot_chip`, small `edge` | `heel_hook`, `toe_hook` | `jam` (feet in cracks) | `volume` | `slab` tag | Comfort (energy per block) |
|---|---|---|---|---|---|---|---|
| Aggressive | −3% | +2% | +4% | −3% | +1% | −2% | −3 |
| Flat | 0 | 0 | −2% | +3% | 0 | 0 | 0 |
| Stiff | −4% | +4% | −1% | +2% | −2% | +1% | 0 |
| Soft | +4% | −2% | +2% | −2% | +3% | +2% | −1 |

Wear: `condition −= 0.012 × rock_wear` per session where `rock_wear` is 1.5 granite/monzonite, 1.3 gneiss/schist, 1.1 sandstone, 1.0 limestone, 0.6 plastic. Below 0.3: foot friction −5%. Below 0.1 (holed): −15% and foot-pop probability +50%. Owning two pairs lets the player pick per route.

### 8.3 Rope, rack, pads, cold kit, tools

- **Rope:** tracks falls and sessions. Past retirement, fall impact (injury roll) ×1.15 and a core-shot event forces replacement within 7 days; rope failure is never a death source outside `danger: 'deadly'` routes with sharp edges flagged by the route.
- **Rack:** `place_gear` succeeds only if `Protection.gear_sizes ∩ rack_sizes` is non-empty; otherwise the placement is skipped, the runout grows and fear gets a labelled "+runout" source. Rack weight adds 0.08 pump per cam carried per move **(tune)**; `rack_creek` exists because splitter crags need many of one size.
- **Pads and spotters:** `coverage = min(1, Σ pad_area / fall_zone_area)` where the fall zone is read from the `pad_zone` protection; `p_injury × (1 − 0.7 × coverage) × spot_factor` with `spot_factor` from [15 §2.3](15-social-reputation-events.md). Highballs over 4.5 m need ≥ 3 pads for full coverage; carrying more than two pads adds a travel block on approaches over 30 min.
- **Cold kit:** without it below 5 °C: `condition_mult['cold']` penalty ×1.5 and `energy` −10/day; mandatory for `ice`, `mixed`, `alpine`.
- **Ice tools and screws:** tool `condition` scales `ice_pick` hold quality; screws carried cap the number of `ice_screw` placements per pitch.

---

## 9. Bankruptcy and money pressure

- When `money < 0` at a day's settlement a counter starts; after **30 consecutive days** below zero the run ends with `end_reason: 'bankrupt'`. The counter resets the day money is ≥ 0. Story difficulty 60 days, hard 20 ([16](16-meta-progression-and-runs.md)).
- Debt accrues 1%/week. Warnings fire at day 7 and day 20 with an event offering odd jobs, gear sales, or (once per run, Trust Fund or Climber Parents only) a family transfer of $1,500.
- Low money is felt before zero: below $300 the Day Planner greys out paid lodging and travel edges over $150, and `stoke` −1/day.

---

## Open questions / proposed schema additions

- **`GearInstance` (referenced by `Climber.gear`, undefined in schemas.md).** Proposed:
  ```ts
  interface GearInstance { id: string; def: string; condition: number; sessions: number; falls?: number; resoles?: number; sizes?: string[]; acquired_day: number; }
  interface GearDef { id: string; name: string; kind: 'shoes' | 'rope' | 'rack' | 'pad' | 'cold_kit' | 'tools' | 'hardware' | 'service'; price: number; effect?: TraitEffect; wear_per_session: number; sizes?: string[]; phase: Phase; }
  ```
- **`Crag.connectivity: 0 | 1 | 2 | 3`** for remote work and content posting (0 = none, 3 = fibre); defaults by `cost_tier` if absent.
- **`Climber.following: number`** (online audience) and **`Climber.sponsor_tier: 0..5`** with `sponsor_contract_day`.
- **`guide_cert`** as an acquired trait id, granted by a 14-day course costing $1,200–2,500.
- **Vehicle** as a `GearInstance` with `kind: 'vehicle'` and `location` of where it is parked, or a separate `Climber.vehicle` field; the former keeps one inventory.
- Whether lodging tier is a per-day `ActivityBlock` option or a per-stay setting; this doc assumes per-stay with a per-day override.
