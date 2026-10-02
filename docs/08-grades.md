# Grades and the Difficulty Index

Everything inside the engine is a **Difficulty Index (DI)**: a continuous float where integer steps follow the IRCRA reporting scale for French sport grades (Draper et al. 2015; F7a = 17). Grades shown to the player are conversions from DI into the system the current crag uses. This keeps one scale for move resolution, route grading, reference climbers and the balance harness.

Related: [schemas](schemas.md) · [05c Grade Engine](05c-grade-engine.md) · [09 World Atlas](09-world-atlas.md)

---

## 1. Route grades

| DI | French | YDS | UIAA | Ewbank | British (adj / tech) | Saxon | Brazilian* |
|---:|---|---|---|---|---|---|---|
| 4 | 3 | 5.3 | III | 11 | D / 3c | IV | III |
| 5 | 4a | 5.4 | IV– | 12 | VD / 4a | V | IIIsup |
| 6 | 4b | 5.5 | IV | 13 | S / 4a | VI | IV |
| 7 | 4c | 5.6 | IV+ / V– | 14 | S–HS / 4b | VI | IVsup |
| 8 | 5a | 5.7 | V | 15 | HS / 4c | VIIa | V |
| 9 | 5b | 5.8 | V+ | 16 | VS / 4c–5a | VIIa | Vsup |
| 10 | 5c | 5.9 | VI– | 17 | HVS / 5a | VIIb | VI |
| 11 | 6a | 5.10a | VI | 18 | E1 / 5b | VIIc | VIsup |
| 12 | 6a+ | 5.10b | VI+ | 19 | E1–E2 / 5b–5c | VIIIa | 7a |
| 13 | 6b | 5.10c | VII– | 20 | E2 / 5c | VIIIb | 7b |
| 14 | 6b+ | 5.10d | VII | 21 | E2–E3 / 5c–6a | VIIIc | 7c |
| 15 | 6c | 5.11a | VII+ | 22 | E3 / 6a | IXa | 8a |
| 16 | 6c+ | 5.11b | VIII– | 23 | E3–E4 / 6a | IXb | 8b |
| 17 | 7a | 5.11c–d | VIII | 24 | E4 / 6a–6b | IXc | 8c |
| 18 | 7a+ | 5.12a | VIII+ | 25 | E5 / 6b | Xa | 9a |
| 19 | 7b | 5.12b | VIII+ / IX– | 26 | E5 / 6b | Xa | 9b |
| 20 | 7b+ | 5.12c | IX– | 27 | E6 / 6b–6c | Xb | 9c |
| 21 | 7c | 5.12d | IX | 28 | E6 / 6c | Xc | 10a |
| 22 | 7c+ | 5.13a | IX+ | 29 | E7 / 6c | XIa | 10b |
| 23 | 8a | 5.13b | IX+ / X– | 30 | E7 / 6c–7a | XIb | 10c |
| 24 | 8a+ | 5.13c | X– | 31 | E8 / 7a | XIc | 11a |
| 25 | 8b | 5.13d | X | 32 | E8 / 7a | XIIa | 11b |
| 26 | 8b+ | 5.14a | X+ | 33 | E9 / 7a–7b | XIIb | 11c |
| 27 | 8c | 5.14b | X+ / XI– | 34 | E9 / 7b | XIIc | 12a |
| 28 | 8c+ | 5.14c | XI– | 35 | E10 / 7b | — | 12b |
| 29 | 9a | 5.14d | XI | 36 | E10–E11 / 7b–7c | — | 12c |
| 30 | 9a+ | 5.15a | XI+ | 37 | E11 / 7c | — | — |
| 31 | 9b | 5.15b | XI+ / XII– | 38 | — | — | — |
| 32 | 9b+ | 5.15c | XII– | 39 | — | — | — |
| 33 | 9c | 5.15d | XII | 40 | — | — | — |
| 34 | 9c+ | 5.16a | XII+ | 41 | — | — | — |

Grades below DI 4 exist (French 1–2, YDS 5.0–5.2, scrambling) and are used only for approach terrain and alpine easy ground.

IRCRA groupings used by the harness: *lower* < 10, *intermediate* 10–17, *advanced* 18–23, *elite* 24–27, *higher elite* ≥ 28.

### Display rules
- Display grade = the system of the crag's country/region (`Crag.region`); the player can override to a preferred system in settings.
- DI is rounded to the nearest 0.5 for display as a soft grade ("7a+/7b" when the fractional part is in 0.25–0.75). Signature routes display their canonical grade regardless of engine result.
- British grades are two-dimensional: the adjectival grade comes from DI *and* the danger axis (§4), the technical grade from the hardest single move DI.

---

## 2. Boulder grades

Boulder problems are graded on the same DI scale, with a separate conversion column. The boulder-to-route equivalence below follows common comparison charts and is approximate; the engine never relies on it, it is purely display.

| DI | Font | V-scale |
|---:|---|---|
| 8 | 3 | VB |
| 9 | 4 | V0– |
| 10 | 4+ | V0 |
| 11 | 5 | V0+ |
| 12 | 5+ | V1 |
| 13 | 6A | V2 |
| 14 | 6A+ | V3 |
| 15 | 6B | V3+ |
| 16 | 6B+ | V4 |
| 17 | 6C | V4+ / V5 |
| 18 | 6C+ | V5 |
| 19 | 7A | V6 |
| 20 | 7A+ | V7 |
| 21 | 7B | V8 |
| 22 | 7B+ | V8+ |
| 23 | 7C | V9 |
| 24 | 7C+ | V10 |
| 25 | 8A | V11 |
| 26 | 8A+ | V12 |
| 27 | 8B | V13 |
| 28 | 8B+ | V14 |
| 29 | 8C | V15 |
| 30 | 8C+ | V16 |
| 31 | 9A | V17 |
| 32 | 9A+ | V18 (hypothetical) |

Notes: Font circuits (yellow, orange, blue, red, black, white) are a crag-level feature of Fontainebleau in [09](09-world-atlas.md), not a grading system; each circuit maps to a DI band. The engine grades boulders by per-attempt send probability for the reference climber (see [05c](05c-grade-engine.md)), so a boulder's DI reflects move difficulty and short-burst power rather than pump accumulation.

---

## 3. Other systems

| System | Range used | Engine mapping |
|---|---|---|
| Water ice (WI) | WI1–WI7 | DI from tool/screw placement difficulty and sustained angle; WI3 ≈ DI 10, WI5 ≈ DI 16, WI6 ≈ DI 20, WI7 ≈ DI 24 (design mapping, not an established conversion). |
| Mixed (M) | M1–M16 | M4 ≈ DI 12, M8 ≈ DI 20, M12 ≈ DI 27, M14+ ≈ DI 30+. |
| Aid (A / C) | A0–A5, C1–C5 | Not a DI mapping; aid pitches use a separate `aid_grade` and a danger axis. A3 = risky falls, A5 = death-fall potential. P3+. |
| NCCS commitment | I–VI | Time axis for multipitch/big wall: I half day … VI two or more days. Stored on the route, feeds logistics not DI. |
| French alpine | F, PD, AD, D, TD, ED1–4, ABO | Overall seriousness axis for alpine routes; combines DI of hardest pitch, length, objective hazard and altitude. |
| Deep water solo (S) | S0–S3 | Danger axis only: S0 safe at most tides, S1 some risk at low tide, S2 real risk from height/ledges, S3 "cannot afford to fall". |
| Competition | — | Scoring, not grading: zones/tops/attempts for boulder; hold count and time for lead. |

---

## 4. Danger axis

Difficulty and danger are separate everywhere in the engine. Every route carries `danger: safe | spicy | bold | deadly` computed in [05c](05c-grade-engine.md) from fall consequence: protection spacing and quality, ledges, ground-fall potential, highball height, water depth, objective hazard.

| Danger | Meaning | Display examples |
|---|---|---|
| safe | Clean falls everywhere | Sport default, padded boulders |
| spicy | One or two consequential falls | "E-grade bump", "R" in YDS |
| bold | Ground fall or serious injury likely at the crux | Gritstone headpoints, highballs over 6 m, "X" |
| deadly | Death on a fall at some point | Free solo, S3 DWS, big runouts on alpine ground |

Death is only possible on `deadly` routes or from objective hazard, and only when the player has death enabled in run options (see [11](11-time-career-aging.md)).

---

## 5. Contested mappings (keep these caveats in the UI help text)

- **V ↔ Font at low grades** is loose: V3 is called anything from 6A to 6B depending on the area; Font is finer-grained in the 6s.
- **UIAA ↔ French** diverges around 8a (IX+ vs X–); the table picks the more common chart.
- **British grades** are two-dimensional and non-linear against sport grades. E-grade reflects seriousness as much as difficulty, so a bold E5 can be technically 6a. The engine reproduces this by combining the danger axis with DI.
- **Brazilian** tables contradict each other by a full grade and the scale is soft (BR 7a ≈ FR 6b+/6c; BR 8a ≈ FR 7a). The column above follows the altamontanha.com revision.
- **Saxon (Elbsandstein)** grades are notoriously stiff and tied to no-chalk, knotted-sling ethics; treat the column as ±1.
- **Ewbank** folds seriousness into a single open-ended number, so Australian 24 at Arapiles can feel very different from a bolted 24.
- **Boulder ↔ route equivalence** is a convenience for comparison charts and is contested; the engine never uses it for anything but display.

---

## 6. Sources

Mountain Project international grade comparison · Alpinist grade comparison chart · Bergfreunde climbing grade calculator · IRCRA "Reporting grades in climbing research" (Draper et al. 2015, Sports Technology) · altamontanha.com Brazilian grade revision · Rockfax Deep Water introduction (S-grades) · UKC Mallorca DWS guide.

## Open questions

- The IRCRA integer anchors below 7a and above 8c are a reconstruction from secondary sources; verify against the published Sports Technology table before the DI scale is frozen in code.
- Whether to show half-grades ("7a+/7b") or round to the nearest grade in the default UI. Half-grades are more honest about the engine; rounding is more familiar. Default to rounding, with half-grades in the route detail view.
- Ice and mixed DI mappings are design choices with no established conversion; they only need to be internally consistent for P4.
