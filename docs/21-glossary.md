# Glossary

Climbing and game terms used across the design docs, one line each, alphabetical. Game-specific terms are marked **[game]**; identifiers in `code` are the canonical names from [schemas.md](schemas.md).

Related: [schemas](schemas.md) · [05b Move Resolution](05b-move-resolution-and-attempt-loop.md) · [08 Grades](08-grades.md)

---

- **Action log** **[game]** — the ordered list of `Action` records that fully determines a run; saves are the log plus a seed.
- **Aerobic reserve** **[game]** — `aerobic_reserve`, a per-attempt pool that drains with time on the wall and limits how much pump a rest can recover.
- **Aid** — climbing by pulling on gear rather than rock; graded A0–A5 / C1–C5.
- **Ape index** — arm span divided by height; `ape_index`, elite mean ≈ 1.06.
- **Apex** **[game]** — the best commit-window outcome: tapping inside the inner zone, catching the hold at the top of the movement.
- **ARC** — aerobic restoration and capillarity training: long, easy continuous climbing.
- **Archetype** **[game]** — a cosmetic build label detected from tags (Slab Wizard, Siege Engine), or an NPC template (`local_legend`).
- **Arête** — an outward-facing edge of rock; feature `arete`.
- **Auto-climb** **[game]** — a toggle that resolves margin-safe moves automatically and hands control back at cruxes, clips, rests and gear.
- **Auto-commit** **[game]** — the accessibility and harness mode that replaces the commit window with a stat-only roll; no timing input is ever required.
- **Belay** — holding the rope for a climber; `belay_quality` sets slack and catch softness.
- **Beta** — information about how to do a route; from partners it reduces route uncertainty.
- **Bold** — a route where a fall at some point would hurt; danger axis `bold`.
- **Bump** — moving one hand a short distance to the next hold; move class `bump`.
- **Campus** — footless dynamic training on wooden rungs; high finger-injury risk in youth.
- **Caught** **[game]** — a commit-window tap inside the outer zone: the move resolves at nominal values.
- **Chipping** — manufacturing or enlarging holds; the worst ethics violation in the game.
- **Clip** — attaching the rope to a bolt or piece of gear; move class `clip`.
- **Commit window** **[game]** — the short real-time tap-timing bar that opens only on dynamic moves; sweep 600–900 ms.
- **Compression** — squeezing opposing holds or an arête between hands or knees; posture `compression`.
- **Crimp** — a small edge held with bent fingers; hold type `crimp`.
- **Crux** — the hardest move or section of a route.
- **Cut (feet cut)** **[game]** — the worst commit-window outcome: feet swing off or a fall roll follows.
- **Deadpoint** — a controlled dynamic move that catches the hold at the moment of weightlessness; cheaper than a dyno.
- **DI** **[game]** — Difficulty Index, the continuous engine scale for all difficulty (IRCRA-style, F7a = 17).
- **Dirtbag** — a climber living cheaply, often in a vehicle or tent, to maximise climbing time.
- **Drop-knee** — turning a knee inward and down to lock a hip against the wall; posture `drop_knee`.
- **DWS** — deep water soloing: ropeless climbing above water, danger S0–S3.
- **Dyno** — a jump between holds with no mid-air correction; move class `dyno`.
- **Edge** — a flat hold held with fingertips or a foot; hold type `edge`.
- **EffectiveStat** **[game]** — the matrix-weighted attribute total after posture, conditions and state modifiers, compared against MoveDifficulty.
- **Ethics** — community norms about how a route may be climbed and treated: no chipping, no wet sandstone, respect closures.
- **FA** — first ascent; `fa_note` is always fictional.
- **Flash** — sending a route first try with prior information; tick style `flash`.
- **Gaston** — pulling outward on a hold with the elbow out, like opening lift doors; hold type `gaston`.
- **Hangdog** — resting on the rope while working a route; sport "work" mode.
- **Headpoint** — pre-practising a dangerous trad route on a top rope before leading it.
- **Heel hook / toe hook** — pulling with the heel or top of the foot; move classes `heel_hook`, `toe_hook`.
- **Highball** — a tall boulder problem where a fall from the top is serious; tag `highball`.
- **Hueco** — a hollow scooped out of rock; feature `hueco`.
- **IZOF** **[game]** — Individual Zone of Optimal Functioning: the fear band inside which performance is best, drawn on the fear meter.
- **Jug** — a large, positive hold; hold type `jug`.
- **Kneebar** — jamming a knee against rock to take weight off the hands; posture and move class `kneebar`.
- **Legacy NPC** **[game]** — a finished run's climber living on as a persistent NPC in later runs.
- **Lower-off** — the anchor at the top of a sport route from which the climber is lowered.
- **Mantle** — pressing up onto a ledge or top-out; move class `mantle`.
- **Margin** **[game]** — `EffectiveStat − MoveDifficulty`; large positive auto-succeeds, large negative fails, dice only inside a narrow band.
- **Match** — placing both hands or feet on the same hold; move class `match`.
- **MoveDifficulty** **[game]** — the per-move difficulty value shared by play and grading.
- **Onsight** — sending first try with no prior information; tick style `onsight`.
- **Overgrip** **[game]** — the extra pump and lost footwork precision from fear outside the IZOF band.
- **Pinch** — a hold squeezed between thumb and fingers; hold type `pinch`.
- **Pocket** — a hole taking one to three fingers; hold types `pocket1`–`pocket3`.
- **Polish** — rock worn glassy by traffic; `polish` lowers friction.
- **Project** — a route worked over many attempts; "projecting".
- **Pump** — forearm fatigue; `pump`, the primary failure mode.
- **Redpoint** — sending after practice; tick style `redpoint`.
- **Reference Climber** **[game]** — the attribute vector per DI step against which routes are graded.
- **Repeaters** — hangboard intervals for finger endurance.
- **Resole** — replacing the rubber on climbing shoes.
- **Run** **[game]** — one career from creation to retirement, injury, bankruptcy, burnout or death.
- **Runout** — a long distance above the last protection; a labelled fear source.
- **Seep** — water weeping from rock after rain, lasting days to weeks on tufa limestone.
- **Send** — to climb a route to the top without falling or weighting the rope.
- **Sidepull / undercling** — holds pulled sideways or from below; hold types `sidepull`, `undercling`.
- **Signature route** **[game]** — a hand-authored route at a real crag, `signature: true`.
- **Sketchy** **[game]** — a move outcome between clean and failure: extra pump and skin, position quality lost.
- **Slap** **[game]** — a commit-window tap just outside the zone: sketchy outcome, extra pump and skin.
- **Sloper** — a rounded hold with no edge, held by friction; hold type `sloper`.
- **Smear** — a foot placed on featureless rock, held by friction; hold type `smear`.
- **Snapshot** **[game]** — a materialised `WorldState` cached at an action index to speed loading.
- **Spot** — guarding a falling boulderer onto the pads; `spot_quality`.
- **Spray** — unsolicited beta or boasting; `spray` on NPCs, Spray Lord trait.
- **Stoke** — motivation; `stoke`, a weekly resource.
- **Stream** **[game]** — a seeded random sequence dedicated to one purpose (`move`, `weather`, `events`).
- **Take** — asking the belayer to hold the rope; action `take`.
- **Tick** — a logged ascent; `Tick` with style and attempts.
- **Topo** — a route diagram.
- **Trad** — traditional climbing on removable protection; discipline `trad`.
- **Tufa** — a calcite drip formation on limestone; feature `tufa`.
- **Volume** — a large geometric feature, mostly on plastic; hold type `volume`.
- **Wet-rock rule** — the norm of not climbing sandstone until it has dried (Font: no damp; Red Rocks 24–72 h); access kind `wet_rock`.
- **Working (a route)** — rehearsing moves with rests on the rope; attempt mode `work`.

---

## Open questions

None.
