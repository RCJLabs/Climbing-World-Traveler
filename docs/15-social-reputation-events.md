# Social, Reputation and Events

Other people are what make a career a story rather than a spreadsheet. This doc specifies how NPCs are created, progress and retire; how partners, mentors, rivals and (lightly) romance work; how reputation accrues and what it buys; and the event system that turns all of it into choices. NPCs use the `NPC` type (a `Climber` with a few extra fields), relationships use `Relationship`, and events use `GameEvent` and `EventEffect` exactly as defined in [schemas §7](schemas.md). Ten events are written in full; about seventy more are titled for later authoring. All people are fictional. Numbers marked **(tune)** go through the harness ([19](19-balance-and-simulation-testing.md)).

Related: [schemas](schemas.md) · [02 Character Model](02-character-model.md) · [03 Traits](03-traits.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [09 World Atlas](09-world-atlas.md) · [13 Injury](13-injury-and-health.md) · [14 Economy](14-economy-gear-logistics.md) · [16 Meta-progression](16-meta-progression-and-runs.md)

---

## 1. NPC lifecycle

### 1.1 Archetypes

`Crag.npc_archetypes` lists archetype ids from this table. An archetype sets age, grade offset against the local distribution, the `NPC` behaviour fields, and how likely the NPC is `persistent`.

| Archetype id | Age | DI offset | `belay_quality` | `spot_quality` | `reliability` | `spray` | `risk_tolerance` | P(persistent) | Role hooks |
|---|---|---|---|---|---|---|---|---|---|
| `local_legend` | 38–60 | +3 | 70–90 | 60–80 | 70 | 10–30 | 40 | 0.9 | mentor, secret sectors, history |
| `developer` | 30–55 | +1 | 80–95 | 60–80 | 80 | 20 | 50 | 0.8 | bolting, access, ethics enforcement |
| `dirtbag_lifer` | 28–50 | 0 | 60–85 | 60–85 | 85 | 30 | 55 | 0.6 | long-stay partner, cheap living tips |
| `weekend_warrior` | 25–45 | −2 | 50–80 | 50–70 | 90 (weekends only) | 40 | 30 | 0.3 | reliable partner, limited days |
| `comp_kid` | 16–23 | +2 (boulder/comp), −3 (trad) | 30–60 | 40–70 | 60 | 60 | 35 | 0.5 | rival, training partner |
| `international_pro` | 22–34 | +5 | 60–90 | 60–90 | 50 | 20 | 50 | 0.2 | inspiration, viral events, sponsor contacts |
| `guide` | 28–55 | +1 | 90–100 | 70–90 | 95 | 20 | 25 | 0.6 | paid partner, rescue, certification |
| `setter` | 22–40 | 0 | 50–80 | 50–80 | 70 | 50 | 40 | 0.4 | gym work, route-reading tips |
| `photographer` | 24–45 | −3 | 40–70 | 50–70 | 60 | 10 | 45 | 0.5 | content, following |
| `van_couple` | 24–40 | −1 | 60–85 | 60–85 | 75 | 30 | 35 | 0.5 | travel invitations, romance pool |
| `elder_trad` | 50–70 | −1 (sport), +2 (trad) | 85–95 | 40–60 | 80 | 30 | 70 | 0.8 | bold ethics, gear lore |
| `rookie` | 17–30 | −5 | 20–45 | 20–50 | 60 | 70 | 30 | 0.2 | belay-scare pool, coaching income |
| `gym_rat` | 18–30 | +1 (plastic), −3 (rock) | 40–70 | 40–70 | 70 | 50 | 30 | 0.3 | training partner |

### 1.2 Sampling

On the first visit to a crag the game draws `n` NPCs from the stream `hash(run_seed, 'npc', crag, visit_index)`: 2 / 4 / 7 / 10 / 14 for `community_size` tiny / small / medium / large / huge **(tune)**, scaled by `Crag.season[month]` (0.5 at 1, 1.0 at 2, 1.3 at 3). Each draw: archetype from the crag pool (uniform unless the atlas gives weights), then grade `DI = clamp(N(di_min + 0.4 × span, 0.2 × span) + offset, di_range)`, then an attribute vector produced by inverting the Reference Climber table ([05c](05c-grade-engine.md)) at that DI with ±8 noise per attribute and archetype-biased technique (`elder_trad` gets `gear_placement` +20, `comp_kid` `dynamic_movement` +15). Name from a per-language name list; `Body` sampled from population bands.

- **Ephemeral** NPCs live for one visit and are regenerated from the seed if the player returns the same visit; they are never saved.
- **Persistent** NPCs are written into the world state on first contact, keep a `Relationship`, and progress offscreen.

### 1.3 Offscreen progression and retirement

Every 28 sim days each persistent NPC updates: `DI += rate` where rate is +0.08 under 25, +0.03 at 25–34, −0.02 at 35–44, −0.06 at 45+ **(tune)**, clamped to a ceiling 2 DI above their sampled grade; a 1.5%/month injury roll pauses them for 1–4 months; `risk_tolerance` drifts −1/yr after 35. Retirement happens when age passes a sampled retire age `N(52, 8)`, after a grade-3 injury past 40, or by event; `retire_day` is set and the NPC stays a non-climbing contact (still a mentor, still at the bar) for one more year, then leaves the pool. Legacy NPCs from finished runs ([16 §5](16-meta-progression-and-runs.md)) enter the same lifecycle.

### 1.4 P1a stub

P1a ships one NPC, `npc_default_spotter`: archetype `dirtbag_lifer`, `persistent: true`, `belay_quality 50`, `spot_quality 50`, `reliability 100`, `spray 0`, always present, never shown as a character. Falls already read `spot_quality` and `belay_quality` (§2.3), so P2 only swaps in real people.

---

## 2. Partners, mentors, rivals, romance

### 2.1 Relationship numbers

`Relationship { trust, familiarity, rivalry, romance?, last_seen_day }`, all 0..100 **(tune)**:

| Change | `trust` | `familiarity` | `rivalry` |
|---|---|---|---|
| Shared climbing day | +2 | +3 | — |
| Completing a shared project together | +5 | +5 | −5 |
| Player skips a planned day with them | −10 | — | — |
| Player sends the NPC's long-term project first with trust < 60 | −8 | — | +10 |
| Player gives unsolicited beta (Spray Lord trait) to an NPC with `spray` < 30 | −3 per incident | — | — |
| Player hard-catches or drops them (player `rope_craft` roll) | −25 | — | — |
| Same grade band (±1 DI), same crag, same season | — | — | +3 / week |
| Apart | — | −1 / month | −1 / month |

Statuses derived from the numbers: *acquaintance* (familiarity < 20) · *partner* (familiarity ≥ 30 and trust ≥ 40) · *regular* (familiarity ≥ 60 and trust ≥ 60: effective `belay_quality` +5, shared beta cuts route uncertainty 20%, availability +15%) · *falling-out* (trust < 20: unavailable for 90 days, rivalry +10, a "cold shoulder" event becomes eligible).

**Availability:** an NPC agreed for a planned day shows up with probability `reliability / 100`, `weekend_warrior` only on days 6–7 of the week, `international_pro` only when `season ≥ 2`. A no-show costs the player's block unless another NPC with familiarity ≥ 10 is present (auto-substitute at trust −0).

**Shared projects:** when the player and a partner both have `Tick` entries with `style: 'attempt'` on the same route, each session together adds familiarity +2 and the beta bonus; if the partner sends first, the player's `stoke` moves +4 (Humble, Loyal Belayer) or −6 (Competitor, Jealous) by trait.

### 2.2 Mentors, rivals, romance

- **Mentor:** a persistent NPC with DI ≥ player + 3, age ≥ player + 8 and trust ≥ 50. Effects: training gains (`adapt_rate_mult`) ×1.10 on the mentor's archetype tags, `risk_judgement` +0.5/month while at the same crag, mentor-only events (gear lore, "the old way"). Max one active mentor.
- **Rival:** rivalry ≥ 50. The rival's offscreen sends generate journal lines; a rival sending your project first fires an event; beating a rival to a send gives `confidence` +2. Rivals never sabotage; the drama is in the player's head and the Competitor/Zen traits decide how much it costs.
- **Romance (light touch, opt-out in settings):** `romance` grows +2 per shared rest day with trust ≥ 50, decays −1/month apart. At ≥ 60 the NPC becomes a *companion*: `stoke` +1/day together, travel invitations to the companion's next crag, shared lodging (cost ×0.6). A companion leaving for a season costs `stoke` −10 once; a break-up (trust < 30) −20 and 60 days of lower `stoke` regen. No explicit content; romance is text and scheduling.

### 2.3 Belay and spot quality on falls

Used by [05b](05b-move-resolution-and-attempt-loop.md) and [13](13-injury-and-health.md) **(tune)**:

```
rope:    slack_m      = 0.3 + 1.2 × (1 − belay_quality/100)
         p_hard_catch = 0.25 × (1 − belay_quality/100)          → injury roll ×1.5 on a hard catch
         belay_quality ≥ 80: ledge-strike probability ×0.7
         belay_quality < 35: 'dropped_scare' event eligible after any fall
boulder: spot_factor  = 1 − 0.35 × (spot_quality/100) × min(1, n_spotters/2)
         applied to p_injury after pad coverage (14 §8.3)
```

The player's own belaying uses `rope_craft` in place of `belay_quality` when they hold the rope for an NPC.

---

## 3. Reputation

`Climber.reputation` is keyed by `Crag.region` and ranges −100..100. Per-discipline standing, an ethics score and the online audience are proposed fields (§8); the rules below write to them where noted.

| Source | Regional rep | Notes |
|---|---|---|
| Tick at or above the region's notable grade (`di_range[1] − 4`) | +1 (+3 onsight) | Max +5/week |
| First ascent (P2) | +4 | Names appear in the local guidebook text |
| Helpful event choice (carrying out an injured climber, cleanup day) | +2 to +6 | — |
| Rebolting or trail day with a `developer` | +2 | — |
| Access violation | `AccessRule.rep_penalty_if_violated` (wet_rock −10, raptor −20, cultural −25, daily_cap −8) | Also ethics −10 (proposed) |
| Chipping or gluing | −40, `chipper` acquired trait (proposed), sponsorship terminated | Once is enough |
| Spraying | −1 per incident | Spray Lord makes it automatic |
| Absence | decays toward 0 at 1/month | Legends decay at 0.25/month above 60 |

Effects by band: ≥ 30 locals share beta (route uncertainty −10%), secret-sector events eligible, partner availability +10%; ≥ 60 free lodging offers, developer invitations, sponsorship eligibility checks pass; ≤ −30 partners decline, "cold shoulder" events; ≤ −60 an access-ban event closes the crag to you for a year.

**Online presence (proposed `following`):** grows +1.5% per posting block, +5% per tick at DI ≥ 26, ×2–5 on a viral event; decays −2%/month without posts. It gates sponsorship tiers ([14 §2.1](14-economy-gear-logistics.md)) and the viral event pool, and makes ethics incidents louder (penalties ×1.5 above 50,000 followers).

---

## 4. Event system

### 4.1 Evaluation

At the end of every activity block the event system builds the candidate set: events whose `context` includes the block's context, whose `conditions` all evaluate true, that are in a live `phase`, that are not exhausted (`once_per_run`) and not on cooldown (30 days per id **(tune)**). One draw from the stream `hash(run_seed, 'events', day, block)` fires an event with probability 0.18 per block **(tune)**, about 2.5 per week, at most one per day; selection is weighted by `weight × Π trait.event_weights[id] × difficulty_mod` ([16](16-meta-progression-and-runs.md)). The player's choice is logged as `{ t: 'event_choice', event, option }`; an option's `requires` lists predicates (usually `has_trait:*`) that gate it; the outcome roll uses the same stream so replay is exact.

### 4.2 Predicate ids (`GameEvent.conditions`, `options[].requires`)

| Predicate | Meaning |
|---|---|
| `crag_rock:<RockType>` · `crag_rock_family:sandstone` | current crag rock |
| `crag_access:<AccessRule.kind>` · `crag_access_active:<kind>` | rule exists / applies this month |
| `season_gte:<0-3>` · `month:<n>` | from `Crag.season` |
| `weather:wet_recent` · `weather:window_tomorrow` · `weather:storm` | from [10](10-weather-and-conditions.md) |
| `has_trait:<id>` · `lacks_trait:<id>` · `hidden_trait_pending` | trait state |
| `attr_gte:<AttrId>:<n>` · `attr_lte:<AttrId>:<n>` | attribute value |
| `res_gte:<resource>:<n>` · `res_lte:<resource>:<n>` | e.g. `res_lte:money:300` |
| `rep_gte:<n>` · `rep_lte:<n>` | reputation in the current region |
| `following_gte:<n>` · `sponsor_tier_gte:<n>` | proposed fields |
| `discipline:<Discipline>` · `on_rope` · `recent_fall` · `recent_send_gte:<DI>` | attempt state |
| `partner_present` · `partner_trust_gte:<n>` · `partner_archetype:<id>` · `belayer_quality_lte:<n>` | companions |
| `project_attempts_gte:<n>` · `days_at_crag_gte:<n>` · `international` · `travel_mode:<mode>` | career state |
| `has_gear:<GearDef id>` · `age_gte:<n>` · `age_lte:<n>` | misc |

Placeholders inside `EventEffect`: `@here` (current region id in `rep`), `@partner`, `@local`, `@rival` (NPC ids in `relationship`), `@pending_hidden` (the queued hidden trait in `traits_add`). `EventEffect.resources` values are deltas. Both conventions are flagged in §8.

### 4.3 Ten events in full

```ts
// 1. Weather window
{ id: 'weather_window', title: 'A Window Opens', context: ['weather', 'rest_day'], weight: 1.2,
  conditions: ['weather:window_tomorrow', 'season_gte:1'], phase: 'P2',
  options: [
    { text: 'Scrap the rest day. Alarm at five.', outcomes: [
      { weight: 0.75, effects: { resources: { stoke: 8, energy: -15 } }, text: 'Cold rock, no wind, the kind of day the locals talk about for years.' },
      { weight: 0.25, effects: { resources: { stoke: 2, energy: -15 } }, text: 'The window held, but so did your tiredness. You climbed like a tired person in perfect conditions.' } ] },
    { text: 'Keep the rest day. Windows come back.', outcomes: [
      { weight: 1, effects: { resources: { stoke: -3, energy: 10 } }, text: 'You watched from the café as two strangers sent your project.' } ] },
    { text: 'Call around for a partner first.', requires: ['has_trait:magnetic'], outcomes: [
      { weight: 1, effects: { resources: { stoke: 10, energy: -15 }, relationship: { '@local': 5 } }, text: 'Someone said yes before you finished the sentence.' } ] } ] }

// 2. A local shows you a secret sector
{ id: 'secret_sector', title: 'Follow Me, Don\'t Tell Anyone', context: ['social', 'crag'], weight: 0.8, once_per_run: false,
  conditions: ['rep_gte:30', 'days_at_crag_gte:5', 'partner_archetype:local_legend'], phase: 'P2',
  options: [
    { text: 'Go, and keep your mouth shut.', outcomes: [
      { weight: 1, effects: { unlock: ['sector:@here:hidden'], relationship: { '@local': 10 }, resources: { stoke: 6 } }, text: 'Twenty unclimbed lines, chalk-free, an hour\'s bushwhack from the car park.' } ] },
    { text: 'Ask if you can film it.', requires: ['has_trait:content_creator'], outcomes: [
      { weight: 0.5, effects: { unlock: ['sector:@here:hidden'], relationship: { '@local': -20 }, rep: { '@here': -8 } }, text: 'The silence lasted the whole walk back. You were not invited again.' },
      { weight: 0.5, effects: { unlock: ['sector:@here:hidden'], relationship: { '@local': 2 } }, text: '"No faces, no names, no location." You agreed.' } ] },
    { text: 'Decline; you have a project.', outcomes: [
      { weight: 1, effects: { relationship: { '@local': -2 } }, text: 'They shrugged. The offer may not come twice.' } ] } ] }

// 3. Rockfall
{ id: 'rockfall', title: 'Something Moved Up There', context: ['crag'], weight: 0.6,
  conditions: ['discipline:multipitch', 'res_lte:fear:70'], phase: 'P3',
  options: [
    { text: 'Keep climbing; it\'s probably nothing.', outcomes: [
      { weight: 0.85, effects: { resources: { fear: 15 } }, text: 'Dust drifted past. Nothing else came.' },
      { weight: 0.10, effects: { injury: 'contusion_shoulder', resources: { health: -10, fear: 30 } }, text: 'A fist-sized block hit your shoulder. You finished the pitch one-armed.' },
      { weight: 0.05, effects: { injury: 'concussion', resources: { health: -25, fear: 40 } }, text: 'Your helmet took it. You will need a new helmet and a few quiet days.' } ] },
    { text: 'Retreat to the ledge and wait.', outcomes: [
      { weight: 0.6, effects: { resources: { energy: -10 } }, text: 'An hour later the wall went quiet. You carried on, slower.' },
      { weight: 0.4, effects: { resources: { energy: -10, stoke: -4 }, attr_add: { risk_judgement: 0.5 } }, text: 'It did not stop. You rapped off and learned something about melting snow.' } ] },
    { text: 'Bail now.', outcomes: [
      { weight: 1, effects: { resources: { stoke: -5 }, attr_add: { risk_judgement: 0.5 } }, text: 'A retreat nobody will ever write about. Those are the good ones.' } ] } ] }

// 4. Dropped-while-belaying scare
{ id: 'dropped_scare', title: 'Short Rope', context: ['crag'], weight: 1.0,
  conditions: ['on_rope', 'recent_fall', 'belayer_quality_lte:40'], phase: 'P1b',
  options: [
    { text: 'Laugh it off.', outcomes: [
      { weight: 1, effects: { resources: { fear: 10 }, attr_add: { confidence: -1 } }, text: 'You stopped a metre above the ledge. Everyone laughed. Your hands did not.' } ] },
    { text: 'Have a quiet word about the catch.', outcomes: [
      { weight: 0.6, effects: { relationship: { '@partner': 3 } }, text: 'They listened, asked questions, and the next catch was soft. (Belayer quality +10.)' },
      { weight: 0.4, effects: { relationship: { '@partner': -10 }, resources: { stoke: -2 } }, text: 'They got defensive. The day went quiet.' } ] },
    { text: 'Never again with this person.', outcomes: [
      { weight: 1, effects: { relationship: { '@partner': -30 }, resources: { stoke: -3 } }, text: 'You packed up early. Finding partners just got harder.' } ] },
    { text: 'Show them the brake-hand drill.', requires: ['attr_gte:rope_craft:60'], outcomes: [
      { weight: 1, effects: { relationship: { '@partner': 8 }, rep: { '@here': 1 } }, text: 'Ten minutes at the base. They will belay better for life. (Belayer quality +20.)' } ] } ] }

// 5. Lost passport
{ id: 'lost_passport', title: 'Where Is It', context: ['travel'], weight: 0.5,
  conditions: ['international', 'travel_mode:fly'], phase: 'P2',
  options: [
    { text: 'Retrace every step.', requires: ['attr_gte:logistics:50'], outcomes: [
      { weight: 0.5, effects: { resources: { stoke: 4, energy: -20 } }, text: 'Under the seat of the bus you took three days ago. Of course.' },
      { weight: 0.5, effects: { money: -150, resources: { stoke: -6, energy: -20 } }, text: 'Gone. Embassy, forms, photos, five days of waiting. (Delay 5 days.)' } ] },
    { text: 'Straight to the embassy.', outcomes: [
      { weight: 1, effects: { money: -150, resources: { stoke: -6 } }, text: 'Emergency document issued. The queue was its own kind of endurance training. (Delay 3 days.)' } ] },
    { text: 'Ask around the hostel in the local language.', requires: ['attr_gte:languages:50'], outcomes: [
      { weight: 0.7, effects: { resources: { stoke: 5 }, rep: { '@here': 2 } }, text: 'Someone\'s cousin found it at the taxi rank.' },
      { weight: 0.3, effects: { money: -150, resources: { stoke: -4 } }, text: 'Kind people, no passport. Embassy it is. (Delay 3 days.)' } ] } ] }

// 6. Viral video
{ id: 'viral_video', title: 'It\'s Everywhere', context: ['social'], weight: 0.7,
  conditions: ['recent_send_gte:22', 'following_gte:1000'], phase: 'P2',
  options: [
    { text: 'Ride it: post daily this week.', outcomes: [
      { weight: 1, effects: { resources: { energy: -15, stoke: 5 }, unlock: ['sponsor_pitch'] }, text: 'Following ×3. A shoe company emailed. Your project waited.' } ] },
    { text: 'Ignore it and climb.', outcomes: [
      { weight: 1, effects: { resources: { stoke: 3 } }, text: 'Following ×1.5 anyway. The rock did not know.' } ] },
    { text: 'Correct the comments: the grade is soft and the hold has a knee.', outcomes: [
      { weight: 1, effects: { rep: { '@here': 5 }, resources: { stoke: 1 } }, text: 'Following ×1.2. The locals noticed you did not take the easy applause.' } ] } ] }

// 7. Partner injury
{ id: 'partner_injury', title: 'That Sounded Wrong', context: ['crag'], weight: 0.6,
  conditions: ['partner_present', 'partner_trust_gte:30'], phase: 'P2',
  options: [
    { text: 'Pack up and get them to a clinic.', outcomes: [
      { weight: 1, effects: { resources: { energy: -30, stoke: -4 }, money: -60, relationship: { '@partner': 20 } }, text: 'Ankle, not broken. Two hours in a waiting room, one friend for life.' } ] },
    { text: 'One more go on your project, then help.', outcomes: [
      { weight: 0.5, effects: { relationship: { '@partner': -25 }, resources: { stoke: 4 } }, text: 'You sent. They saw your face when you did. Both of you remember it differently.' },
      { weight: 0.5, effects: { relationship: { '@partner': -25 }, rep: { '@here': -5 }, resources: { stoke: -6 } }, text: 'You fell, and a local saw you choose. Word gets around a small crag.' } ] },
    { text: 'Carry them out.', requires: ['attr_gte:leg_power:50'], outcomes: [
      { weight: 1, effects: { resources: { energy: -50 }, relationship: { '@partner': 30 }, rep: { '@here': 5 } }, text: 'Forty minutes of switchbacks. Your legs are not for show after all.' } ] } ] }

// 8. Bird-nesting closure
{ id: 'raptor_closure', title: 'Peregrines', context: ['crag'], weight: 1.0,
  conditions: ['crag_access_active:raptor'], phase: 'P2',
  options: [
    { text: 'Respect it; climb the open sectors.', outcomes: [
      { weight: 1, effects: { resources: { stoke: -3 }, rep: { '@here': 2 } }, text: 'Your project is behind a laminated sign until July. The slabs are open.' } ] },
    { text: 'Sneak in early before anyone is around.', outcomes: [
      { weight: 0.7, effects: { resources: { stoke: 3 } }, text: 'Nobody saw. The birds did. (Ethics −10.)' },
      { weight: 0.3, effects: { rep: { '@here': -20 }, money: -250, traits_add: ['access_violator'] }, text: 'A ranger with binoculars. A fine, a name on a list, and a sponsor email the next day. (Ethics −10.)' } ] },
    { text: 'Volunteer for the nest-monitoring rota.', requires: ['rep_gte:20'], outcomes: [
      { weight: 1, effects: { rep: { '@here': 6 }, relationship: { '@local': 10 }, attr_add: { weather_sense: 1 } }, text: 'Dawn shifts with a scope. You learned the cliff\'s weather better than its holds.' } ] } ] }

// 9. Wet-sandstone temptation
{ id: 'wet_sandstone', title: 'It Looks Dry Enough', context: ['crag', 'weather'], weight: 1.1,
  conditions: ['crag_rock_family:sandstone', 'weather:wet_recent', 'project_attempts_gte:3'], phase: 'P2',
  options: [
    { text: 'Wait the full dry-out.', outcomes: [
      { weight: 1, effects: { resources: { stoke: -4 } }, text: 'Two days of coffee and antagonist training. The rock will be there.' } ] },
    { text: 'Climb anyway; the top is in the sun.', outcomes: [
      { weight: 0.4, effects: { rep: { '@here': -15 }, resources: { stoke: -10 } }, text: 'The crux crimp came off in your hand. The problem is now a different problem. (Ethics −15.)' },
      { weight: 0.3, effects: { rep: { '@here': -10 } }, text: 'Nothing broke. A photo of your chalk on dark rock did the rounds that evening. (Ethics −10.)' },
      { weight: 0.3, effects: { resources: { stoke: 2 } }, text: 'Nothing broke, nobody saw. You know. (Ethics −10.)' } ] },
    { text: 'Drive to the rain-safe crag instead.', requires: ['has_gear:vehicle'], outcomes: [
      { weight: 1, effects: { resources: { energy: -10, stoke: 2 } }, text: 'Different rock, same forearms. The locals nodded at the empty car park.' } ] } ] }

// 10. Hidden-trait foreshadowing (template; example rendered for the Glass Pulleys hidden trait)
{ id: 'hidden_foreshadow_tendon', title: 'A Twinge on the Warm-up', context: ['crag', 'training'], weight: 2.0, once_per_run: true,
  conditions: ['hidden_trait_pending'], phase: 'P1a',
  options: [
    { text: 'Back off for today.', outcomes: [
      { weight: 1, effects: { traits_add: ['@pending_hidden'], resources: { stoke: -2 } }, text: 'Your ring finger talks to you on half-crimps. It has probably been saying this for years. (Hidden trait revealed.)' } ] },
    { text: 'Tape it and push through.', outcomes: [
      { weight: 0.6, effects: { traits_add: ['@pending_hidden'], attr_add: { confidence: 1 } }, text: 'Fine today. You now know the thing you were not told at creation.' },
      { weight: 0.4, effects: { traits_add: ['@pending_hidden'], injury: 'pulley_a2', resources: { stoke: -8 } }, text: 'A small pop on the third go. Grade 1. Six weeks of easy climbing and a lesson.' } ] },
    { text: 'Book a physio screening.', outcomes: [
      { weight: 1, effects: { traits_add: ['@pending_hidden'], money: -120, attr_add: { risk_judgement: 1 } }, text: 'Ultrasound, a chart, a plan. Knowing is cheaper than finding out.' } ] } ] }
```

Hidden-trait events are generated per hidden trait from a `foreshadow` text in the trait row ([03](03-traits.md)); every hidden trait must be revealed within 8 weeks of creation and never ends a run by itself.

### 4.4 Event ideas for later authoring (~70)

**Crag (16):** Sandbagged · The Guidebook Lied · Lost Shoe at the Base · Beta Spray Ambush · Chalk-Free Zone · Hold Broke on Your Project · Someone Chipped It · Bolt Spinning · Tick Marks Everywhere · The Ethics Debate at the Base · Highball Dare · Snake Under the Pad · Flash Flood Warning · Polished to Glass · The Classic Is Queued · Lower-Off Stuck.

**Travel (10):** Van Won't Start · Border Guard Wants a Climbing Lesson · Pads Lost by the Airline · Overbooked Refuge · Ferry Cancelled · Visa Clock Running Out · Hitchhiking Luck · Rental Scooter Spill · Jet Lag Week · Wrong Season, Right Place.

**Rest day (8):** The Rest-Day Project · Skin Care Masterclass · Hostel Hangover · A Letter From Home · The Gear Shop Sale · Antagonist Day Pays Off · Rain Reading · Tourist for a Day.

**Social (14):** Flaky Friday · The Beta Trade · Local Legend Offers Coffee · Rival Sends Your Project · Spotter Looked at Their Phone · Van Couple Invites You South · Romance Over the Topo · Break-up Season · Guide Offers Work · A Rookie Needs a Mentor · Someone Recognises You · Jealous Comments Online · The Crag Mayor Election · Shared Van, Shared Fuel.

**Training (7):** Hangboard in the Hostel Doorway · Campus Board Hubris · Plateau Talk · Over-reaching Week · Setter Needs a Tester · Comp Kid Wants a Session · Deload or Die.

**Weather (6):** Sending Temps Forecast · Condensation Surprise · Heatwave Shutdown · Snow at the Crag · Wind Clears the Seep · Tufas Running.

**Injury (6):** Skin Split at the Crux · Elbow Niggle Becomes a Thing · Shoulder Click · The Clinic With No Climbing Doctor · Insurance Claim Maze · Comeback Day.

**Comp (7):** Isolation Nerves · The Slab That Humbled Finals · Reader Beats Power · Judge Disputes Your Top · Sponsor Watching · Prize Money Reality · National Team Call.

---

## 5. How the pieces connect

- Partners feed falls (§2.3) and beta (uncertainty), rivals feed `stoke` and `confidence`, mentors feed adaptation and `risk_judgement`.
- Reputation feeds partner availability, sector unlocks, sponsorship ([14](14-economy-gear-logistics.md)) and access-ban events.
- Events are the only place choices with narrative weight happen; everything they touch is an `EventEffect` field so the harness can simulate them ([19](19-balance-and-simulation-testing.md)).

---

## Open questions / proposed schema additions

- **`EventEffect` semantics:** confirm `resources` values are deltas; add `delay_days?: number` (lost passport, embassy), `npc_patch?: Record<string, Partial<Pick<NPC, 'belay_quality' | 'spot_quality' | 'reliability'>>>` (belayer improves), `following_mult?: number`, `ethics?: number`, `sponsor_tier_delta?: number`. The ten events above state these in prose until the fields exist.
- **Placeholders** `@here`, `@partner`, `@local`, `@rival`, `@pending_hidden` resolved at fire time; record the convention in [schemas](schemas.md) or replace with explicit `target` fields on `GameEvent`.
- **`Climber.ethics: number`** (0..100, starts 70) and **`Climber.rep_discipline: Partial<Record<Discipline, number>>`**, both decaying toward their baselines; **`Climber.following`** and **`sponsor_tier`** as proposed in the closing section of [14](14-economy-gear-logistics.md).
- **Archetype ids** in §1.1 must be the ids used by `Crag.npc_archetypes` in [09](09-world-atlas.md); the validator should check membership. Optional per-crag archetype weights (`{ id, weight }[]`) would improve flavour.
- **Trait ids** referenced here (`magnetic`, `content_creator`, `access_violator`, `chipper`, `competitor`, `humble`, `jealous`, `loyal_belayer`, `spray_lord`, `zen`) must match [03](03-traits.md); `access_violator` and `chipper` are new acquired traits.
- **Injury ids** `contusion_shoulder`, `concussion`, `pulley_a2` must match [13](13-injury-and-health.md).
- **`Trait.foreshadow?: string`** on hidden traits, the text the generated foreshadowing event (§4.3) renders; not in schemas.md yet.
- Whether romance should be fully disable-able (recommended: a settings toggle that removes the `romance` field and its events).
