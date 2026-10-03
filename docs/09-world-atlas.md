# World Atlas

The atlas is the data appendix for the world: every crag the game ships, with every `Crag` field, plus the travel graph, the world calendar, competition venues and a Fontainebleau deep-dive because P1a is Font-only. Real places and real route names are used as geography; every person in the game is fictional, so no crag history here names anyone.

Related: [schemas](schemas.md) (`Crag`, `Climate`, `AccessRule`, `TravelEdge`, `CragStyleProfile`) · [06 Procedural Routes](06-procedural-routes.md) · [07 Disciplines](07-disciplines.md) · [08 Grades](08-grades.md) · [10 Weather](10-weather-and-conditions.md) · [14 Economy](14-economy-gear-logistics.md) · [15 Social](15-social-reputation-events.md) · [20 Content Pipeline](20-content-pipeline.md)

> **P1a:** where the Fontainebleau slice implements this document differently, [22 · P1a Implementation Notes](22-p1a-implementation-notes.md) records the change and the reason.

Research anchors (costs, permits, access) come from the plan appendix A6–A7 and the sources in [08 §6](08-grades.md) and [14](14-economy-gear-logistics.md). Altitudes, coordinates and climate values are approximate and marked **(tune)** collectively; they are good enough for the generator and should be checked against station data before data files ship.

---

## 1. How to read the records

A crag is split across five tables so that each is readable on a phone. Join on `id`.

| Table | Fields |
|---|---|
| §2 Identity | `id`, `name`, `country`, `region`, `lat`/`lon`, `altitude_m`, `rock`, `disciplines`, `di_range` (from [08](08-grades.md)), display grade range, `hub`, `phase` |
| §3 Season and community | `season` (12 months scored 0–3: 0 closed or unclimbable, 1 marginal, 2 good, 3 prime), climate class, `cost_tier`, `community_size`, `language`, `gym_tier` |
| §4 Climate sketch | compact `Climate` record: monthly `t_mean` Jan→Dec, wet days Jan→Dec, `rh_mean` winter/summer, `wind_mean`, `snow` months, `shade_fraction`, `dry_lag_days`, `seep_lag_days`; `t_sd` is 3 °C unless noted |
| §5 Access rules | every `AccessRule` on the crag with `kind`, `detail`, `months`, `cost`, `dry_days_required`, `rep_penalty_if_violated` |
| §6 Character and content | `signature_routes` (2–4, display grade), `character`, `style_profiles`, `npc_archetypes` |

**Climate classes** (documentation labels, not a schema field): `oceanic` · `continental` · `mediterranean` · `semi_arid` · `desert` · `monsoon` · `subtropical_humid` · `alpine` · `subarctic` · `arctic` · `equatorial_highland` · `indoor`.

**Cost tiers** follow [14 §3](14-economy-gear-logistics.md) (1 very cheap … 5 remote/expedition). **Gym tiers** follow [12 §8](12-training-and-adaptation.md). **NPC archetype ids** are the thirteen defined in [15 §1.1](15-social-reputation-events.md). **Style profile ids** are proposed here and must be defined as `CragStyleProfile` records in the data files per [06](06-procedural-routes.md); the validator checks that every id listed in §6 exists.

DI conversions use [08](08-grades.md): French 6a = 11, 7a = 17, 8a = 23, 9a = 29; Font 6A = 13, 7A = 19, 8A = 25; V0 = 10, V10 = 24, V15 = 29; YDS 5.10a = 11, 5.12a = 18, 5.14a = 26; Ewbank 20 = 13, 32 = 25; UIAA VI = 11, IX = 21; WI5 ≈ 16, M12 ≈ 27.

---

## 2. Identity (58 crags)

| # | id | name | country | region | lat, lon | alt m | rock | disciplines | di_range | display range | hub | phase |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `fontainebleau` | Fontainebleau | FR | Île-de-France | 48.40, 2.60 | 100 | `sandstone_font` | boulder | [7, 30] | Font 2–8C+ | `hub_paris` | P1a |
| 2 | `rocklands` | Rocklands | ZA | Western Cape (Cederberg) | −32.15, 19.05 | 800 | `sandstone_quartzitic` | boulder | [9, 29] | Font 4–8C | `hub_cape_town` | P2 |
| 3 | `hueco_tanks` | Hueco Tanks | US | Texas | 31.92, −106.04 | 1,400 | `syenite` | boulder | [10, 29] | V0–V15 | `hub_el_paso` | P2 |
| 4 | `bishop` | Bishop (Buttermilks, Happies, Sads) | US | California (Eastern Sierra) | 37.36, −118.40 | 1,300–2,400 | `monzonite` (tuff at the Happies) | boulder | [10, 30] | V0–V16 | `hub_los_angeles` | P2 |
| 5 | `magic_wood` | Magic Wood | CH | Graubünden (Averstal) | 46.57, 9.43 | 1,300 | `gneiss` | boulder | [11, 30] | Font 5A–8C+ | `hub_zurich` | P2 |
| 6 | `ticino` | Ticino (Cresciano, Chironico, Brione) | CH | Ticino | 46.28, 8.98 | 400–900 | `gneiss` | boulder | [9, 30] | Font 4–8C+ | `hub_milan` | P2 |
| 7 | `albarracin` | Albarracín | ES | Aragón (Teruel) | 40.41, −1.44 | 1,200 | `sandstone_generic` (red Triassic) | boulder | [9, 28] | Font 4–8B+ | `hub_madrid` | P2 |
| 8 | `arapiles` | Mount Arapiles | AU | Victoria (Wimmera) | −36.76, 141.84 | 370 | `quartzite` | trad, sport | [3, 25] | Ewbank 5–32 | `hub_melbourne` | P3 |
| 9 | `grampians` | Grampians (Gariwerd) | AU | Victoria | −37.15, 142.50 | 300–1,000 | `sandstone_generic` | boulder, sport, trad | [8, 30] | V0–V16, Ewbank 10–33 | `hub_melbourne` | P2 |
| 10 | `hampi` | Hampi | IN | Karnataka | 15.34, 76.47 | 470 | `granite` | boulder | [9, 27] | Font 4–8B | `hub_bangalore` | P2 |
| 11 | `squamish` | Squamish | CA | British Columbia | 49.70, −123.15 | 0–700 | `granite` | trad, multipitch, bigwall, boulder, sport | [7, 30] | 5.6–5.14d, V0–V16 | `hub_vancouver` | P3 |
| 12 | `yosemite` | Yosemite Valley | US | California (Sierra Nevada) | 37.74, −119.58 | 1,200 | `granite` | bigwall, multipitch, trad, boulder | [7, 29] | 5.6–5.14, V0–V14 | `hub_san_francisco` | P3 |
| 13 | `indian_creek` | Indian Creek | US | Utah (Bears Ears) | 38.05, −109.55 | 1,600 | `sandstone_wingate` | trad | [10, 25] | 5.9–5.13+ | `hub_salt_lake_city` | P3 |
| 14 | `peak_district_grit` | Peak District gritstone | UK | Derbyshire / Yorkshire edges | 53.30, −1.65 | 300–450 | `sandstone_grit` | trad, boulder | [3, 29] | Mod–E10, Font 3–8B | `hub_london` | P2 (boulder), P3 (trad) |
| 15 | `frankenjura` | Frankenjura | DE | Bavaria | 49.70, 11.35 | 400–600 | `limestone` | sport | [8, 29] | 5–9a | `hub_munich` | P2 |
| 16 | `ceuse` | Céüse | FR | Hautes-Alpes | 44.50, 5.94 | 1,800–2,000 | `limestone` | sport | [11, 31] | 6a–9b | `hub_geneva` | P2 |
| 17 | `kalymnos` | Kalymnos | GR | Dodecanese | 36.98, 26.97 | 0–300 | `limestone` | sport | [7, 29] | 5a–9a (game floor 4c, §7b) | `hub_athens` | P1b |
| 18 | `siurana` | Siurana | ES | Catalonia (Priorat) | 41.26, 0.93 | 700 | `limestone` | sport | [11, 31] | 6a–9b | `hub_barcelona` | P2 |
| 19 | `margalef` | Margalef | ES | Catalonia (Priorat) | 41.29, 0.75 | 500 | `conglomerate` | sport | [11, 31] | 6a–9b | `hub_barcelona` | P2 |
| 20 | `oliana` | Oliana | ES | Catalonia (Alt Urgell) | 42.07, 1.31 | 600 | `limestone` | sport | [13, 31] | 6b–9b | `hub_barcelona` | P2 |
| 21 | `rodellar` | Rodellar | ES | Aragón (Sierra de Guara) | 42.28, −0.07 | 700 | `limestone` | sport | [11, 31] | 6a–9b | `hub_barcelona` | P2 |
| 22 | `red_river_gorge` | Red River Gorge | US | Kentucky | 37.78, −83.68 | 300 | `sandstone_corbin` | sport, trad | [9, 29] | 5.8–5.14d | `hub_lexington` | P2 |
| 23 | `smith_rock` | Smith Rock | US | Oregon | 44.37, −121.14 | 900 | `tuff` | sport, trad | [8, 28] | 5.7–5.14c | `hub_portland` | P2 |
| 24 | `rifle` | Rifle Mountain Park | US | Colorado | 39.72, −107.70 | 2,000 | `limestone` | sport | [15, 30] | 5.11–5.15a | `hub_denver` | P2 |
| 25 | `ten_sleep` | Ten Sleep Canyon | US | Wyoming | 44.10, −107.30 | 2,400 | `dolomite` | sport | [9, 27] | 5.8–5.14 | `hub_denver` | P2 |
| 26 | `new_river_gorge` | New River Gorge | US | West Virginia | 38.07, −81.08 | 400 | `sandstone_nuttall` | trad, sport | [9, 28] | 5.8–5.14c | `hub_lexington` | P2 |
| 27 | `flatanger` | Flatanger (Hanshelleren) | NO | Trøndelag | 64.50, 10.83 | 150 | `granite` (gneissic cave) | sport | [11, 33] | 6a–9c | `hub_oslo` | P2 |
| 28 | `verdon` | Verdon Gorge | FR | Alpes-de-Haute-Provence | 43.75, 6.37 | 750 | `limestone` | multipitch, sport | [10, 27] | 5c–8c | `hub_geneva` | P3 |
| 29 | `chamonix` | Chamonix / Mont Blanc | FR | Haute-Savoie | 45.92, 6.87 | 1,035–4,808 | `granite` | alpine, mixed, ice, multipitch | [3, 27] | F–ED, M4–M12 | `hub_geneva` | P4 |
| 30 | `dolomites` | Dolomites (Tre Cime, Marmolada) | IT | Veneto / Trentino-Alto Adige | 46.62, 12.30 | 1,500–3,300 | `dolomite` | alpine, multipitch, trad | [4, 21] | UIAA III–IX | `hub_milan` | P4 |
| 31 | `el_chalten` | El Chaltén / Fitz Roy | AR | Santa Cruz (Patagonia) | −49.33, −72.89 | 400 / 3,405 | `granite` | alpine, bigwall | [11, 25] | 5.10–5.13, TD–ED | `hub_el_calafate` | P4 |
| 32 | `yangshuo` | Yangshuo | CN | Guangxi | 24.78, 110.49 | 150 | `limestone` (karst) | sport | [8, 29] | 5a–9a | `hub_guilin` | P2 |
| 33 | `railay` | Railay / Tonsai | TH | Krabi | 8.01, 98.84 | 0 | `limestone` | sport, dws | [8, 27] | 5–8c | `hub_bangkok` | P2 (sport), P3 (dws) |
| 34 | `mallorca` | Mallorca (Cala Barques, Porto Cristo) | ES | Balearic Islands | 39.60, 3.38 | 0 | `limestone` | dws, sport | [11, 30] | 6a–9a+, S0–S3 | `hub_palma` | P3 |
| 35 | `red_rocks` | Red Rock Canyon | US | Nevada | 36.13, −115.43 | 1,100–1,500 | `sandstone_aztec` | trad, sport, multipitch, boulder | [6, 27] | 5.5–5.14 | `hub_las_vegas` | P2 |
| 36 | `joshua_tree` | Joshua Tree | US | California (Mojave) | 34.02, −116.17 | 1,300 | `monzonite` | trad, boulder | [5, 24] | 5.4–5.13 | `hub_los_angeles` | P2 |
| 37 | `rumney` | Rumney | US | New Hampshire | 43.80, −71.84 | 300 | `schist` | sport | [6, 30] | 5.5–5.15a | `hub_new_york` | P2 |
| 38 | `gunks` | Shawangunks | US | New York | 41.73, −74.19 | 300 | `conglomerate` (quartz) | trad | [4, 27] | 5.3–5.14 | `hub_new_york` | P3 |
| 39 | `chattanooga` | Chattanooga (LRC, Rocktown, T-Wall, HP40) | US | Tennessee / Georgia / Alabama | 35.05, −85.30 | 300–600 | `sandstone_generic` | boulder, sport, trad | [10, 27] | V0–V13, 5.8–5.14 | `hub_atlanta` | P2 |
| 40 | `wadi_rum` | Wadi Rum | JO | Aqaba | 29.57, 35.42 | 900–1,750 | `sandstone_generic` (Cambrian) | trad, multipitch | [5, 21] | 4–7c | `hub_amman` | P3 |
| 41 | `todra` | Todra Gorge | MA | Drâa-Tafilalet | 31.59, −5.59 | 1,500–1,900 | `limestone` | sport, multipitch | [5, 25] | 4–8b | `hub_marrakech` | P2 |
| 42 | `ouray` | Ouray Ice Park | US | Colorado | 38.02, −107.67 | 2,400 | `ice` | ice, mixed | [7, 24] | WI2–WI6, M4–M10 | `hub_denver` | P4 |
| 43 | `rjukan` | Rjukan | NO | Telemark | 59.88, 8.59 | 300–1,000 | `ice` | ice | [7, 24] | WI2–WI7 | `hub_oslo` | P4 |
| 44 | `canmore` | Canmore / Canadian Rockies | CA | Alberta | 51.09, −115.36 | 1,400–2,500 | `ice` (limestone mixed) | ice, mixed, alpine | [7, 30] | WI2–WI7, M5–M14 | `hub_calgary` | P4 |
| 45 | `el_potrero_chico` | El Potrero Chico | MX | Nuevo León | 25.95, −100.48 | 900 | `limestone` | multipitch, sport | [8, 27] | 5.7–5.14 | `hub_monterrey` | P3 |
| 46 | `cochamo` | Cochamó | CL | Los Lagos | −41.47, −72.17 | 300–1,683 | `granite` | bigwall, trad, multipitch | [11, 25] | 5.10–5.13 | `hub_puerto_montt` | P3 |
| 47 | `mount_kenya` | Mount Kenya | KE | Central Kenya | −0.15, 37.31 | 4,200–5,199 | `syenite` | alpine, ice | [6, 11] | UIAA IV–VI, WI3–4 | `hub_nairobi` | P4 |
| 48 | `trango` | Trango Towers | PK | Gilgit-Baltistan (Baltoro) | 35.77, 76.18 | 4,000–6,286 | `granite` | bigwall, alpine | [15, 25] | 5.11–5.13 A3/A4 | `hub_islamabad` | P4 |
| 49 | `baffin` | Baffin Island (Thor, Asgard) | CA | Nunavut (Auyuittuq) | 66.55, −65.32 | 500–2,015 | `granite` | bigwall, alpine | [15, 25] | 5.11–5.13 A3–A5 | `hub_ottawa` | P4 |
| 50 | `elbsandstein` | Elbsandstein (Saxon Switzerland) | DE | Saxony | 50.92, 14.15 | 150–450 | `sandstone_elb` | trad | [4, 27] | Saxon I–XIIc | `hub_dresden` | P3 |
| 51 | `leonidio` | Leonidio | GR | Peloponnese (Arcadia) | 37.17, 22.86 | 50–600 | `limestone` | sport, multipitch | [8, 29] | 5a–9a | `hub_athens` | P2 |
| 52 | `joes_valley` | Joe's Valley | US | Utah (Emery) | 39.30, −111.20 | 1,900 | `sandstone_generic` (Navajo) | boulder | [10, 28] | V0–V14 | `hub_salt_lake_city` | P2 |
| 53 | `devils_tower` | Devils Tower | US | Wyoming | 44.59, −104.72 | 1,560 | `dolerite` (phonolite columns) | trad | [8, 24] | 5.7–5.13 | `hub_denver` | P3 |
| 54 | `venue_innsbruck` | Innsbruck comp venue | AT | Tyrol | 47.26, 11.39 | 575 | `plastic` | comp_boulder, comp_lead, gym | [16, 29] | — | `hub_innsbruck` | P3 |
| 55 | `venue_chamonix` | Chamonix comp venue | FR | Haute-Savoie | 45.92, 6.87 | 1,035 | `plastic` | comp_lead, gym | [19, 29] | — | `hub_geneva` | P3 |
| 56 | `venue_arco` | Arco comp venue | IT | Trentino | 45.92, 10.89 | 90 | `plastic` | comp_lead, comp_boulder, gym | [16, 29] | — | `hub_milan` | P3 |
| 57 | `venue_salt_lake_city` | Salt Lake City comp venue | US | Utah | 40.76, −111.89 | 1,300 | `plastic` | comp_boulder, gym | [16, 28] | — | `hub_salt_lake_city` | P3 |
| 58 | `venue_paris` | Paris comp venue | FR | Île-de-France | 48.85, 2.35 | 35 | `plastic` | comp_boulder, comp_lead, gym | [16, 29] | — | `hub_paris` | P3 |

Rows 1–49 cover the 47 rows of the plan appendix A6 (the Siurana/Margalef/Oliana row is split into three; Arapiles/Grampians into two; the competition-venues row becomes five venue records, rows 54–58). Rows 50–53 are additional real crags chosen to exercise schema features: `sandstone_elb` and no-chalk ethics (Elbsandstein), a cheap Mediterranean winter sport venue (Leonidio), a mid-altitude sandstone boulderfield with strict wet rules (Joe's Valley), and a cultural voluntary closure (Devils Tower).

---

## 3. Season and community

`season` is twelve scores Jan→Dec. Climate class is the label from §1. Costs are `cost_tier`; community is `community_size`; languages are ISO-639 codes in `language[]`; gym is `gym_tier` for the nearest facility reachable without a travel edge.

| id | season J F M A M J J A S O N D | climate | cost | community | language | gym |
|---|---|---|---|---|---|---|
| `fontainebleau` | 2 3 3 3 2 1 1 1 2 3 3 2 | oceanic | 3 | huge | fr, en | 2 |
| `rocklands` | 0 0 1 2 3 3 3 3 2 1 0 0 | semi_arid | 2 | large | en, af | 0 |
| `hueco_tanks` | 3 3 2 1 0 0 0 0 0 1 3 3 | desert | 2 | large | en, es | 1 |
| `bishop` | 3 3 3 2 1 0 0 0 1 2 3 3 | semi_arid | 3 | large | en | 2 |
| `magic_wood` | 0 0 0 1 2 3 2 2 3 3 1 0 | alpine | 4 | medium | de, it, en | 1 |
| `ticino` | 3 3 3 2 1 0 0 0 1 2 3 3 | oceanic | 4 | large | it, de, en | 1 |
| `albarracin` | 2 3 3 3 2 1 0 0 1 3 3 2 | continental | 2 | medium | es | 0 |
| `arapiles` | 1 1 2 3 3 2 2 2 3 3 2 1 | semi_arid | 4 | large | en | 0 |
| `grampians` | 0 0 1 2 3 3 3 3 3 2 1 0 | mediterranean | 3 | medium | en | 0 |
| `hampi` | 3 3 1 0 0 0 0 0 0 1 3 3 | monsoon | 1 | medium | en, kn, hi | 0 |
| `squamish` | 0 0 1 1 2 3 3 3 3 1 0 0 | oceanic | 4 | huge | en | 2 |
| `yosemite` | 1 1 2 3 3 3 1 1 3 3 2 1 | mediterranean | 3 | huge | en | 0 |
| `indian_creek` | 1 1 3 3 3 1 0 0 2 3 3 1 | desert | 2 | medium | en | 0 |
| `peak_district_grit` | 2 3 3 2 1 1 0 1 2 3 3 2 | oceanic | 3 | huge | en | 3 |
| `frankenjura` | 0 0 1 3 3 3 2 2 3 3 1 0 | continental | 3 | large | de, en | 2 |
| `ceuse` | 0 0 0 1 2 3 3 3 3 2 0 0 | alpine | 4 | large | fr, en | 1 |
| `kalymnos` | 1 1 2 3 3 1 0 0 3 3 3 1 | mediterranean | 3 | huge | el, en | 1 |
| `siurana` | 3 3 3 2 1 0 0 0 1 2 3 3 | mediterranean | 2 | huge | ca, es, en | 1 |
| `margalef` | 3 3 3 2 1 0 0 0 1 2 3 3 | mediterranean | 2 | large | ca, es, en | 0 |
| `oliana` | 3 3 3 2 1 0 0 0 1 2 3 3 | mediterranean | 2 | medium | ca, es, en | 0 |
| `rodellar` | 0 0 1 2 3 3 1 1 3 3 1 0 | mediterranean | 2 | large | es, en | 1 |
| `red_river_gorge` | 1 1 3 3 2 1 1 1 2 3 3 1 | subtropical_humid | 2 | huge | en | 1 |
| `smith_rock` | 1 1 3 3 3 2 1 1 3 3 3 1 | semi_arid | 3 | large | en | 2 |
| `rifle` | 0 0 0 1 2 3 3 3 3 2 0 0 | continental | 4 | medium | en | 1 |
| `ten_sleep` | 0 0 0 0 1 3 3 3 2 1 0 0 | continental | 2 | small | en | 0 |
| `new_river_gorge` | 1 1 2 3 3 1 1 1 3 3 2 1 | subtropical_humid | 2 | large | en | 1 |
| `flatanger` | 0 0 0 0 1 3 3 3 2 0 0 0 | subarctic | 4 | small | no, en | 0 |
| `verdon` | 0 1 2 3 3 3 1 1 3 3 1 0 | mediterranean | 3 | medium | fr, en | 0 |
| `chamonix` | 2 2 2 1 1 3 3 3 3 1 1 2 | alpine | 4 | huge | fr, en | 2 |
| `dolomites` | 0 0 0 0 1 2 3 3 3 1 0 0 | alpine | 4 | large | it, de, en | 1 |
| `el_chalten` | 3 3 2 1 0 0 0 0 0 1 2 3 | subarctic | 3 | medium | es, en | 1 |
| `yangshuo` | 2 2 2 1 1 0 0 0 1 3 3 3 | subtropical_humid | 1 | large | zh, en | 1 |
| `railay` | 3 3 3 2 1 0 0 0 0 1 2 3 | monsoon | 1 | large | th, en | 0 |
| `mallorca` | 1 1 2 2 2 3 3 3 3 3 2 1 | mediterranean | 3 | medium | ca, es, en | 1 |
| `red_rocks` | 2 3 3 3 1 0 0 0 1 3 3 2 | desert | 3 | huge | en | 2 |
| `joshua_tree` | 3 3 3 2 1 0 0 0 1 3 3 3 | desert | 2 | large | en | 0 |
| `rumney` | 0 0 1 2 3 2 2 2 3 3 1 0 | continental | 3 | large | en | 1 |
| `gunks` | 0 0 1 3 3 2 1 1 3 3 2 0 | continental | 3 | large | en | 2 |
| `chattanooga` | 3 3 3 2 1 0 0 0 1 2 3 3 | subtropical_humid | 2 | large | en | 2 |
| `wadi_rum` | 2 3 3 3 1 0 0 0 1 3 3 2 | desert | 1 | small | ar, en | 0 |
| `todra` | 2 3 3 3 2 1 0 0 1 3 3 2 | semi_arid | 1 | medium | ar, fr, en | 0 |
| `ouray` | 3 3 2 0 0 0 0 0 0 0 1 3 | alpine | 3 | medium | en | 0 |
| `rjukan` | 3 3 3 1 0 0 0 0 0 0 1 2 | subarctic | 4 | small | no, en | 1 |
| `canmore` | 3 3 3 1 0 0 0 0 0 1 2 3 | continental | 4 | large | en | 2 |
| `el_potrero_chico` | 3 3 2 1 0 0 0 0 0 1 3 3 | semi_arid | 1 | large | es, en | 0 |
| `cochamo` | 3 3 2 0 0 0 0 0 0 0 1 3 | oceanic | 5 | small | es, en | 0 |
| `mount_kenya` | 3 3 1 0 0 1 2 3 3 1 0 2 | equatorial_highland | 5 | tiny | en, sw | 0 |
| `trango` | 0 0 0 0 0 2 3 3 1 0 0 0 | alpine | 5 | tiny | ur, en | 0 |
| `baffin` | 0 0 0 0 0 2 3 2 0 0 0 0 | arctic | 5 | tiny | en, iu | 0 |
| `elbsandstein` | 0 0 1 2 3 3 2 2 3 2 1 0 | continental | 3 | large | de, cs, en | 2 |
| `leonidio` | 3 3 3 2 1 0 0 0 1 2 3 3 | mediterranean | 2 | large | el, en | 0 |
| `joes_valley` | 1 1 2 3 3 1 0 0 2 3 3 1 | semi_arid | 2 | medium | en | 0 |
| `devils_tower` | 0 0 1 2 3 1 2 2 3 3 1 0 | continental | 2 | small | en | 0 |
| `venue_innsbruck` | 2 2 2 2 2 3 3 2 2 2 2 2 | indoor | 4 | huge | de, en | 3 |
| `venue_chamonix` | 2 2 2 2 2 2 3 2 2 2 2 2 | indoor | 4 | large | fr, en | 2 |
| `venue_arco` | 2 2 2 2 2 2 2 3 3 2 2 2 | indoor | 3 | large | it, en | 2 |
| `venue_salt_lake_city` | 2 2 2 2 3 2 2 2 2 2 2 2 | indoor | 3 | huge | en | 3 |
| `venue_paris` | 2 2 2 2 2 2 2 3 2 2 2 2 | indoor | 3 | huge | fr, en | 3 |

Season notes: Devils Tower June is scored 1 because of the voluntary cultural closure (§5). Chamonix carries both a rock season (Jun–Sep) and an ice season (Dec–Mar) in one row; the discipline filter in the UI splits them. Venues are "open" all year for training (`gym` discipline) with 3 in their event months (§8).

---

## 4. Climate sketch (`Climate` record, compact)

`t` = monthly `t_mean` °C Jan→Dec at crag altitude; `wet` = `precip_days` Jan→Dec; `rh` = `rh_mean` winter / summer; `wind` = `wind_mean` m/s; `snow` = months with `snow: true`; `shade` = `shade_fraction`; `dry` = `dry_lag_days`; `seep` = `seep_lag_days`. `t_sd` is 3 unless a value in brackets follows the class. All values **(tune)** against station data.

| id | t Jan→Dec | wet Jan→Dec | rh | wind | snow | shade | dry | seep |
|---|---|---|---|---|---|---|---|---|
| `fontainebleau` | 4 5 8 11 15 18 20 20 17 12 7 5 | 10 9 9 9 9 8 7 7 8 10 10 11 | 85 / 70 | 3.5 | Jan, Feb, Dec | 0.6 | 1.5 | 0 |
| `rocklands` | 25 25 23 19 16 13 12 13 15 18 21 24 | 1 1 2 4 6 8 8 7 4 3 2 1 | 45 / 60 (winter higher) | 4.0 | — | 0.4 | 0.5 | 0 |
| `hueco_tanks` | 7 10 14 19 24 28 28 27 24 18 11 7 | 3 3 2 2 2 4 7 7 5 3 2 3 | 45 / 35 | 4.0 | Jan, Dec | 0.5 | 0.5 | 0 |
| `bishop` | 3 5 8 12 17 22 26 25 20 14 7 3 | 4 4 3 2 2 1 1 1 1 2 3 4 | 50 / 25 | 3.5 | Dec–Mar | 0.3 | 0.5 | 0 |
| `magic_wood` | −3 −2 1 5 10 13 15 15 12 7 2 −2 | 8 7 8 10 12 13 13 12 10 9 9 8 | 80 / 75 | 2.0 | Nov–Apr | 0.8 | 1.5 | 0 |
| `ticino` | 2 4 8 11 15 19 22 21 17 12 6 3 | 5 5 7 10 13 12 10 11 9 9 8 6 | 75 / 70 | 2.0 | Dec–Feb | 0.6 | 1.0 | 0 |
| `albarracin` | 3 4 7 9 13 18 22 22 18 12 7 4 | 6 5 6 8 9 6 3 4 6 8 7 7 | 75 / 50 | 3.0 | Dec–Feb | 0.5 | 2.0 | 0 |
| `arapiles` | 23 23 20 16 12 9 8 10 12 15 18 21 | 4 4 5 7 9 11 12 12 10 8 6 5 | 55 / 65 | 4.5 | — | 0.4 | 0.5 | 0 |
| `grampians` | 21 21 18 14 10 8 7 8 10 13 16 19 | 5 5 6 9 12 14 15 15 13 11 8 6 | 60 / 75 | 4.0 | Jul (rare) | 0.5 | 2.0 | 0 |
| `hampi` | 23 25 28 30 29 26 25 25 25 24 23 22 | 0 0 1 2 4 8 10 9 8 7 3 1 | 55 / 75 (monsoon) | 3.0 | — | 0.3 | 0.5 | 0 |
| `squamish` | 2 4 6 9 13 16 18 18 15 10 5 2 | 18 15 16 14 12 10 6 6 9 17 20 19 | 85 / 70 | 3.0 | Dec–Feb | 0.5 | 1.0 | 0 |
| `yosemite` | 3 5 8 11 16 20 24 24 20 14 7 3 | 9 8 8 6 4 2 1 1 2 4 7 9 | 65 / 35 | 2.5 | Dec–Mar | 0.4 | 0.5 | 0 |
| `indian_creek` | −1 3 8 13 18 24 27 26 21 14 6 0 | 4 4 4 3 3 2 4 5 4 4 3 4 | 50 / 25 | 4.0 | Dec–Feb | 0.4 | 1.5 | 0 |
| `peak_district_grit` | 3 3 5 8 11 14 16 16 13 10 6 3 | 14 11 12 11 11 10 10 11 11 13 14 14 | 88 / 78 | 5.5 | Dec–Mar | 0.3 | 2.0 | 0 |
| `frankenjura` | −1 0 4 8 13 16 18 18 14 9 4 0 | 10 9 10 10 11 11 11 10 9 9 10 11 | 85 / 70 | 3.0 | Nov–Mar | 0.7 | 0.5 | 10 |
| `ceuse` | −2 −1 2 5 9 13 16 16 12 8 3 −1 | 6 5 6 8 9 7 5 6 7 8 7 6 | 70 / 55 | 4.0 | Nov–Apr | 0.3 | 0.5 | 14 |
| `kalymnos` | 11 11 13 16 20 25 27 27 24 20 16 12 | 10 9 7 4 2 1 0 0 1 4 7 11 | 75 / 60 | 5.0 | — | 0.5 | 0.5 | 7 |
| `siurana` | 6 7 10 12 16 20 23 23 19 14 9 6 | 4 4 5 6 7 5 2 4 6 7 5 5 | 70 / 55 | 3.0 | Jan (rare) | 0.5 | 0.5 | 7 |
| `margalef` | 6 7 10 13 17 21 24 24 20 15 9 6 | 4 4 5 6 7 5 2 4 6 7 5 5 | 70 / 55 | 3.0 | — | 0.5 | 0.5 | 3 |
| `oliana` | 4 6 9 12 16 20 23 23 19 13 8 4 | 4 4 5 7 8 6 4 5 6 7 5 5 | 75 / 55 | 2.5 | Jan, Feb | 0.4 | 0.5 | 10 |
| `rodellar` | 4 5 9 11 15 20 23 23 19 13 8 4 | 5 5 6 8 9 7 4 5 7 8 6 6 | 70 / 50 | 3.0 | Jan, Feb | 0.6 | 0.5 | 14 |
| `red_river_gorge` | 1 3 8 13 18 23 25 24 20 14 8 3 | 12 11 12 11 12 11 11 9 8 8 10 12 | 80 / 80 | 2.5 | Jan, Feb | 0.7 | 0.5 (steep) / 2 (vertical) | 3 |
| `smith_rock` | 0 2 5 8 12 16 20 20 15 9 3 0 | 9 7 8 6 6 4 2 2 3 5 9 10 | 75 / 45 | 3.5 | Dec–Feb | 0.4 | 0.5 | 0 |
| `rifle` | −6 −3 2 6 11 16 19 18 14 8 0 −5 | 6 6 7 7 7 5 7 8 6 6 6 6 | 65 / 45 | 2.5 | Nov–Apr | 0.7 | 0.5 | 21 |
| `ten_sleep` | −8 −6 −2 3 8 13 17 16 11 5 −2 −7 | 6 6 7 8 9 8 6 5 5 6 6 6 | 65 / 45 | 4.0 | Oct–May | 0.4 | 0.5 | 0 |
| `new_river_gorge` | 1 2 7 12 17 21 23 22 19 13 7 2 | 12 11 12 11 12 11 11 10 8 8 10 12 | 80 / 80 | 2.5 | Jan, Feb | 0.6 | 2.0 | 0 |
| `flatanger` | −2 −2 0 4 8 12 15 15 11 7 2 −1 | 16 14 14 12 11 12 13 14 15 17 17 16 | 85 / 80 | 6.0 | Nov–Mar | 1.0 (cave) | 0 (cave) | 30 (back wall) |
| `verdon` | 3 4 7 10 14 18 21 21 17 12 7 4 | 6 5 6 8 8 6 3 4 6 8 7 6 | 70 / 50 | 4.0 | Dec–Feb | 0.5 | 0.5 | 7 |
| `chamonix` (valley) | −2 0 4 8 12 15 18 17 14 9 3 −1 | 10 9 10 11 12 12 11 11 10 10 10 10 | 80 / 70 | 2.5 | Oct–Apr (valley), all year above 3,000 m | 0.5 | 1.0 | 0 |
| `dolomites` (2,200 m) | −6 −5 −2 2 7 10 13 12 9 5 0 −4 | 7 6 8 10 13 14 14 13 10 9 8 7 | 75 / 70 | 3.0 | Oct–May | 0.5 | 1.0 | 0 |
| `el_chalten` | 13 12 10 7 3 1 1 2 5 8 10 12 | 14 13 14 14 14 13 13 13 12 13 13 14 | 65 / 60 | 9.0 (t_sd 5) | May–Sep (town), all year on the massif | 0.5 | 1.0 | 0 |
| `yangshuo` | 9 11 15 20 24 27 29 28 26 21 16 11 | 12 13 16 17 17 16 14 14 9 8 8 9 | 80 / 85 | 2.0 | — | 0.7 | 0.5 | 14 |
| `railay` | 27 28 29 29 28 28 28 28 27 27 27 26 | 4 3 6 10 18 19 18 19 20 20 14 7 | 75 / 85 | 3.5 | — | 0.5 | 0.5 | 7 |
| `mallorca` | 10 10 12 14 18 22 25 26 23 19 14 11 | 7 6 5 5 3 2 1 2 5 8 8 8 | 75 / 65 | 4.5 | — | 0.3 | 0.5 | 3 |
| `red_rocks` | 8 11 15 19 25 30 33 32 28 21 13 8 | 3 3 3 2 1 1 3 3 2 2 2 3 | 40 / 20 | 4.0 | Jan (rare) | 0.5 | 2.0 | 0 |
| `joshua_tree` | 9 11 14 18 23 28 31 30 27 21 14 9 | 3 3 2 1 1 0 2 2 2 1 2 3 | 40 / 20 | 4.5 | Jan, Feb (rare) | 0.3 | 0.5 | 0 |
| `rumney` | −8 −6 −1 6 12 17 20 19 15 8 2 −5 | 11 10 12 12 13 13 12 12 10 11 12 12 | 75 / 75 | 3.0 | Nov–Apr | 0.5 | 0.5 | 7 |
| `gunks` | −3 −2 3 9 15 20 23 22 18 12 6 0 | 11 10 12 12 13 12 11 11 9 10 11 11 | 70 / 75 | 3.5 | Dec–Mar | 0.4 | 1.0 | 0 |
| `chattanooga` | 5 7 11 16 21 25 27 26 23 17 11 6 | 11 11 11 10 10 11 11 9 7 7 9 11 | 75 / 75 | 2.5 | Jan (rare) | 0.6 | 2.0 | 0 |
| `wadi_rum` | 9 11 15 20 24 27 29 29 26 22 16 11 | 3 3 2 1 1 0 0 0 0 1 2 3 | 50 / 30 | 4.0 | — | 0.4 | 2.0 | 0 |
| `todra` | 5 7 11 14 18 23 27 26 22 16 10 6 | 3 3 4 4 3 1 1 2 3 4 3 3 | 55 / 35 | 3.5 | Jan, Feb (rare) | 0.6 | 0.5 | 0 |
| `ouray` | −6 −4 0 4 9 14 17 16 12 6 −1 −6 | 7 7 8 8 8 5 9 10 7 6 7 7 | 60 / 45 | 2.5 | Oct–Apr | 0.9 (gorge) | n/a (ice) | n/a |
| `rjukan` | −6 −5 −1 3 9 13 15 14 10 5 0 −4 | 12 10 11 10 11 12 13 14 13 13 13 12 | 85 / 75 | 2.5 | Nov–Apr | 0.9 | n/a (ice) | n/a |
| `canmore` | −9 −6 −2 3 8 12 15 14 9 4 −4 −8 | 9 8 9 9 11 13 12 11 9 8 9 9 | 65 / 55 | 3.5 (t_sd 6) | Oct–May | 0.7 | n/a (ice) | n/a |
| `el_potrero_chico` | 14 16 20 24 27 29 29 29 26 22 18 14 | 3 3 2 3 4 5 4 5 7 5 3 3 | 65 / 60 | 3.0 | — | 0.5 | 0.5 | 0 |
| `cochamo` | 15 15 13 10 8 6 5 6 8 10 12 14 | 10 9 11 14 18 19 19 18 15 14 12 11 | 80 / 85 | 3.0 | Jun–Aug (high) | 0.6 | 1.5 | 5 |
| `mount_kenya` (4,300 m) | 4 5 5 4 3 2 1 1 2 3 4 4 | 4 4 8 16 14 6 5 5 6 14 16 8 | 60 / 70 | 5.0 (t_sd 4) | all year | 0.5 | 1.0 | 0 |
| `trango` (base camp 4,000 m) | −14 −12 −6 0 4 8 11 11 7 1 −6 −12 | 5 6 7 6 5 3 4 4 3 3 3 4 | 50 / 45 | 5.0 (t_sd 6) | all year | 0.5 | 1.0 | 0 |
| `baffin` (valley) | −27 −27 −22 −14 −4 3 8 6 1 −7 −16 −23 | 6 5 5 5 5 6 8 9 9 8 7 6 | 70 / 70 | 5.0 (t_sd 5) | Sep–Jun | 0.4 | 1.5 | 0 |
| `elbsandstein` | −1 0 4 9 14 17 19 18 14 9 4 0 | 9 8 9 9 10 10 10 10 8 8 9 10 | 85 / 70 | 2.5 | Dec–Feb | 0.7 | 2.0 | 0 |
| `leonidio` | 11 11 13 16 20 25 28 28 24 20 15 12 | 9 8 7 5 3 1 0 0 2 5 7 10 | 70 / 55 | 3.5 | — | 0.5 | 0.5 | 5 |
| `joes_valley` | −4 −1 4 9 14 20 24 23 18 11 3 −3 | 5 5 6 5 5 3 4 5 5 5 4 5 | 60 / 35 | 3.0 | Nov–Mar | 0.4 | 2.0 | 0 |
| `devils_tower` | −6 −3 2 8 13 18 22 22 16 9 1 −5 | 5 5 7 9 11 11 8 7 7 6 5 5 | 65 / 55 | 4.5 | Oct–Apr | 0.3 | 0.5 | 0 |
| `venue_*` (all five) | indoor 18–22 | 0 | 50 / 50 | 0 | — | 1.0 | 0 | 0 |

Venues share one indoor climate; `friction` for `plastic` is computed only from chalk and hand sweat ([10 §2](10-weather-and-conditions.md)). Ice venues (`ouray`, `rjukan`, `canmore`) ignore `dry_lag_days` and use the ice-quality curve in [07 §6](07-disciplines.md).

---

## 5. Access rules

Every row is one `AccessRule`. Costs are USD-equivalent; `rep` is `rep_penalty_if_violated` on the regional reputation ([15](15-social-reputation-events.md)). Crags not listed carry only the generic wet-rock rule for their rock type ([10 §4](10-weather-and-conditions.md)) and, for non-home regions, the visa class from [14 §6](14-economy-gear-logistics.md). Numbers from the plan appendix A7 are cited as "A7"; the rest are design **(tune)**.

| id | kind | detail | months | cost | dry days | rep |
|---|---|---|---|---|---|---|
| `fontainebleau` | wet_rock | No climbing on damp sandstone; forest sectors dry slowest | all | — | 1 (2 in still humid air) | −15 |
| `fontainebleau` | cultural | No chalk abuse, brush your tick marks, no pof debate in dialogue only | all | — | — | −5 |
| `rocklands` | permit | Farm permit at the office on arrival (A7: $68 per 30 days) | Apr–Sep | 68 / 30 d | — | −20 (climbing unpermitted) |
| `rocklands` | wet_rock | Quartzitic sandstone, generic rule | all | — | 1 | −10 |
| `hueco_tanks` | fee | Park entry (A7: $7/day) | Oct–Apr | 7 / day | — | — |
| `hueco_tanks` | daily_cap | North Mountain cap 70: 60 reservations + 10 walk-ins, max 3 consecutive days (A7) | Oct–Apr | — | — | — |
| `hueco_tanks` | reservation | Reservations open 3 days ahead; `logistics ≥ 50` books reliably; guided tours for East/West Mountain and East Spur | Oct–Apr | 0 (tour $20) | — | — |
| `hueco_tanks` | seasonal_closure | Summer heat closure for climbing access | Jun–Aug | — | — | — |
| `bishop` | cultural | Tablelands (Happies/Sads) petroglyph zones: no climbing on marked boulders | all | — | — | −25 |
| `bishop` | fee | Pit campground fee | all | 5 / night | — | — |
| `magic_wood` | fee | Parking and camping at the official site; forest camping forbidden | May–Oct | 12 / night | — | −10 |
| `magic_wood` | wet_rock | Gneiss dries slowly under trees; climbable when dry to the eye | all | — | 1.5 | −5 |
| `ticino` | fee | Cresciano parking permit | all | 6 / day | — | — |
| `albarracin` | wet_rock | Strict: no climbing on wet or damp sandstone; local sector closures after rain | all | — | 2 | −20 |
| `albarracin` | seasonal_closure | Sector closures for nesting birds | Feb–Jun | — | — | −25 |
| `albarracin` | cultural | No chalk on marked heritage rock art boulders | all | — | — | −30 |
| `arapiles` | fee | Camping at the Pines | all | 4 / night | — | — |
| `arapiles` | cultural | Heritage closures on sectors with Aboriginal cultural sites (A7: Grampians/Arapiles heritage) | all | — | — | −30 |
| `grampians` | cultural | Large cultural-heritage closures; climb only in open areas | all | — | — | −35 |
| `grampians` | seasonal_closure | Fire-danger closures | Dec–Feb | — | — | — |
| `grampians` | wet_rock | Sandstone generic rule | all | — | 2 | −10 |
| `hampi` | cultural | UNESCO heritage site: no climbing on temple boulders or carved rock | all | — | — | −30 |
| `hampi` | visa | Advance e-visa | all | 25–80 | — | — |
| `squamish` | raptor | Falcon closures on parts of the Chief | Mar–Jul | — | — | −25 |
| `squamish` | wet_rock | Granite climbable when dry; moss sectors slow | all | — | 1 | — |
| `yosemite` | permit | Free self-registered wilderness permit for big walls (A7) | all | 0 | — | −10 |
| `yosemite` | fee | Park entry per vehicle (7 days) and Camp 4 (A7: $10/night, 7-night cap in season) | all | 35 / 7 d; 10 / night | — | — |
| `yosemite` | raptor | Peregrine closures on specified walls | Mar–Jul | — | — | −30 |
| `yosemite` | reservation | Peak-hours entry reservation when in force | May–Sep | 2 | — | — |
| `indian_creek` | wet_rock | Wingate: no climbing 24–48 h after rain (A7) | all | — | 1–2 by rain amount | −25 |
| `indian_creek` | cultural | Bears Ears: no climbing near rock art or ruins; camp only in designated sites | all | — | — | −30 |
| `indian_creek` | fee | Designated campground | all | 15 / night | — | — |
| `peak_district_grit` | wet_rock | No wet grit; 2 dry days with wind | all | — | 2 | −20 |
| `peak_district_grit` | raptor | Ring ouzel and raptor restrictions on specific buttresses | Mar–Jul | — | — | −20 |
| `peak_district_grit` | cultural | Ethics: no chipping, minimal chalk, no bolts; headpoint only on established lines | all | — | — | −40 |
| `frankenjura` | seasonal_closure | Bird and bat closures on listed crags | Feb–Jul | — | — | −25 |
| `frankenjura` | cultural | Rotpunkt ethics: pinkpoints are called out | all | — | — | −3 |
| `ceuse` | seasonal_closure | Snow on the approach and the plateau | Nov–Apr | — | — | — |
| `kalymnos` | fee | None; island economy relies on climbers; voluntary rebolting donation | all | 0 (donation 10) | — | — |
| `kalymnos` | visa | Schengen free class | all | 0 | — | — |
| `siurana` | fee | Refugi and campsite | all | 10 / night | — | — |
| `siurana` | seasonal_closure | Raptor closures on selected cliff-top sectors | Jan–Jun | — | — | −20 |
| `margalef` | seasonal_closure | Bird closures on named sectors | Jan–Jun | — | — | −20 |
| `oliana` | seasonal_closure | None formal; summer heat renders the wall unclimbable | Jun–Aug | — | — | — |
| `rodellar` | seasonal_closure | Natural park nesting closures | Jan–Jun | — | — | −25 |
| `rodellar` | wet_rock | Tufa seep after wet weeks, days–weeks | all | — | 0.5 (seep 14) | — |
| `red_river_gorge` | fee | Private-land day fee or coalition membership | all | 5 / day or 30 / yr | — | — |
| `red_river_gorge` | wet_rock | Exception: steep sectors climbable in rain; vertical sectors 2 dry days | all | — | 0 steep / 2 vertical | −10 |
| `red_river_gorge` | raptor | Localised closures | Mar–Jul | — | — | −20 |
| `smith_rock` | fee | State park day-use | all | 5 / day | — | — |
| `smith_rock` | raptor | Golden eagle closures on specified walls | Feb–Jul | — | — | −25 |
| `rifle` | fee | Park entry | all | 5 / day | — | — |
| `rifle` | seasonal_closure | Snow and cold | Nov–Apr | — | — | — |
| `ten_sleep` | seasonal_closure | Winter | Oct–May | — | — | — |
| `ten_sleep` | cultural | No new bolting on contested walls; respect local moratoria | all | — | — | −30 |
| `new_river_gorge` | fee | National park: free; camping fee | all | 0 (camp 12) | — | — |
| `new_river_gorge` | raptor | Localised peregrine closures | Mar–Jul | — | — | −20 |
| `new_river_gorge` | wet_rock | Nuttall sandstone, generic rule | all | — | 2 | −10 |
| `flatanger` | fee | Camping at the farm | Jun–Sep | 15 / night | — | — |
| `flatanger` | seasonal_closure | Winter; cave back wall seeps for weeks after wet spells | Oct–May | — | — | — |
| `verdon` | raptor | Vulture and raptor closures on named sectors | Jan–Jun | — | — | −25 |
| `chamonix` | fee | Lifts to the high mountain | all | 40–75 / return | — | — |
| `chamonix` | seasonal_closure | Winter alpine rock closed by conditions, not law; ice open | Oct–May (rock) | — | — | — |
| `dolomites` | fee | Huts (half board) | Jun–Sep | 60–80 / night | — | — |
| `dolomites` | seasonal_closure | Winter | Oct–May | — | — | — |
| `el_chalten` | permit | Free registration at the park office before each attempt (A7: free; cost is waiting time) | all | 0 | — | −10 |
| `el_chalten` | visa | Free class for most passports | all | 0 | — | — |
| `yangshuo` | visa | Advance visa | all | 60–140 | — | — |
| `yangshuo` | fee | Farmer access fees at some crags | all | 2 / day | — | — |
| `railay` | visa | On arrival / free 30 days | all | 0–35 | — | — |
| `railay` | fee | Longtail boat from Ao Nang | all | 3 / crossing | — | — |
| `railay` | seasonal_closure | Monsoon swell and rain | May–Oct | — | — | — |
| `mallorca` | seasonal_closure | Water temperature and swell make DWS unsafe | Nov–Apr (dws only) | — | — | — |
| `mallorca` | cultural | Private-land access to some coves: parking etiquette | all | — | — | −15 |
| `red_rocks` | wet_rock | Aztec sandstone: 24–72 h after rain (A7) | all | — | 1–3 by rain amount | −25 |
| `red_rocks` | permit | Late-exit permit for the scenic loop | all | 0 | — | −10 (fine $) |
| `red_rocks` | fee | Scenic loop entry; timed-entry reservation in season | all | 15 / vehicle (res. 2) | — | — |
| `red_rocks` | raptor | Seasonal closures on specific walls | Mar–Aug | — | — | −25 |
| `joshua_tree` | fee | Park entry (7 days) | all | 30 / 7 d | — | — |
| `joshua_tree` | cultural | No climbing on or near cultural sites; no new bolts in wilderness | all | — | — | −25 |
| `rumney` | fee | Forest service parking | all | 5 / day | — | — |
| `rumney` | raptor | Peregrine closures on named cliffs | Apr–Jul | — | — | −20 |
| `gunks` | fee | Preserve day pass or season pass (A7: $20/day, $100/season) | all | 20 / day or 100 / yr | — | — |
| `gunks` | raptor | Peregrine closures | Mar–Jul | — | — | −25 |
| `chattanooga` | wet_rock | Southern sandstone: 2 dry days | all | — | 2 | −15 |
| `chattanooga` | fee | Private boulderfields (HP40, Rocktown parking, LRC day fee) | Oct–Mar | 5–10 / day | — | — |
| `chattanooga` | seasonal_closure | LRC closed in summer | Apr–Sep (LRC) | — | — | — |
| `wadi_rum` | fee | Protected-area entry; local guide expected for remote routes | all | 7 / entry; guide 60 / day | — | −10 |
| `wadi_rum` | visa | On arrival | all | 55 | — | — |
| `wadi_rum` | wet_rock | Soft sandstone: 2 dry days | all | — | 2 | −20 |
| `todra` | visa | Free class | all | 0 | — | — |
| `todra` | cultural | Rebolting fund donation; respect village life | all | 0 (donation 5) | — | −10 |
| `ouray` | fee | Ice park free; donation and festival ticket | Dec–Mar | 0 (donation 10) | — | — |
| `ouray` | seasonal_closure | Farmed ice only while freezing | Apr–Nov | — | — | — |
| `rjukan` | seasonal_closure | Ice season | Apr–Nov | — | — | — |
| `canmore` | fee | Park pass | all | 8 / day | — | — |
| `canmore` | seasonal_closure | Avalanche-terrain closures by bulletin; ignoring a "high" rating is a flagged risky choice ([11 §4](11-time-career-aging.md)) | Nov–Apr | — | — | −20 |
| `el_potrero_chico` | fee | Campground / casita | Nov–Mar | 6 / night | — | — |
| `el_potrero_chico` | visa | Free / on arrival | all | 0–25 | — | — |
| `cochamo` | daily_cap | 90 visitors per day in the valley (A7) | Dec–Mar | — | — | — |
| `cochamo` | reservation | Required in advance; `logistics` roll | Dec–Mar | 0 | — | −15 |
| `cochamo` | fee | Camping at the valley campsites | Dec–Mar | 8 / night | — | — |
| `mount_kenya` | fee | Park fee (A7: ~$70/day + fees rising) | all | 70 / day | — | — |
| `mount_kenya` | permit | Guide and porter arrangements for some routes | all | 60 / day | — | −10 |
| `mount_kenya` | visa | Advance e-visa | all | 50 | — | — |
| `trango` | permit | Trekking fee (A7: ~$300) plus base-camp logistics (A7: $2,400–4,700 lump sum) | Jun–Aug | 300 + 2,400–4,700 | — | — |
| `trango` | visa | Advance visa with letter | all | 100–160 | — | — |
| `baffin` | fee | Park registration and orientation; flights (A7: $2,500–4,000) and boat (A7: $350–500) | Jun–Aug | 25 + 2,850–4,500 | — | — |
| `baffin` | cultural | Polar-bear protocol; camp only in designated zones | all | — | — | −20 |
| `elbsandstein` | cultural | Saxon rules: no chalk, no metal protection, knotted slings and rings only, no climbing on wet rock | all | — | 2 | −35 |
| `elbsandstein` | seasonal_closure | Bird closures on listed towers | Jan–Jun | — | — | −25 |
| `leonidio` | fee | None; donation to the rebolting fund | all | 0 (donation 10) | — | — |
| `leonidio` | seasonal_closure | Raptor closures on named sectors | Feb–Jun | — | — | −20 |
| `joes_valley` | wet_rock | Navajo sandstone: 2 dry days, 3 after snow melt | all | — | 2–3 | −25 |
| `joes_valley` | cultural | Respect the town; no camping outside designated areas | all | — | — | −15 |
| `devils_tower` | cultural | Voluntary June closure out of respect for Northern Plains tribes (A7: ~85% compliance); climbing in June is legal but costs reputation | Jun | — | — | −30 |
| `devils_tower` | permit | Free climber registration at the visitor centre | all | 0 | — | −5 |
| `devils_tower` | raptor | Prairie falcon closures on specific routes | Mar–Jul | — | — | −25 |
| `venue_*` | fee | Entry to the event (athlete registration) or spectator ticket | event months | 40 (athlete) | — | — |

Raptor windows across US areas cluster around 1 March–15 July (A7), which is why so many rows share Mar–Jul. The model treats cultural closures as reputation rules, never as hard locks: the player can always make the wrong choice and live with the regional consequence.

---

## 6. Character and content

`signature_routes` are hand-authored in the route schema ([06 §5](06-procedural-routes.md)); the display grade is canonical. Route names are real geography; `fa_note` on each is fictional. `style_profiles` are proposed `CragStyleProfile` ids; `npc_archetypes` are from [15 §1.1](15-social-reputation-events.md).

| id | signature_routes | character | style_profiles | npc_archetypes |
|---|---|---|---|---|
| `fontainebleau` | La Marie-Rose 6A · Rainbow Rocket 8A · L'Alchimiste 8B · Big Boss 7C | Slopers, circuits, sand, moisture-fragile sandstone; the school of footwork and patience | `font_sloper_slab`, `font_roof` | `local_legend`, `dirtbag_lifer`, `weekend_warrior`, `rookie`, `international_pro`, `photographer` |
| `rocklands` | Black Shadow 8B · Monkey Wedding 8C · The Rhino 7B · Nutsa 7A | Crimpy, steep, perfect friction on orange quartzitic sandstone; a southern-winter season town | `rocklands_crimp_steep` | `international_pro`, `van_couple`, `dirtbag_lifer`, `photographer`, `developer` |
| `hueco_tanks` | Crown of Aragorn V13 · Esperanza V14 · See Spot Run V6 · Nobody Here Gets Out Alive V2 | Huecos, roofs and iron-rock; a 70-person cap makes every day a reservation | `hueco_roof_huecos` | `guide`, `dirtbag_lifer`, `comp_kid`, `international_pro`, `local_legend` |
| `bishop` | Mandala V12 · Evilution V11 · Lucid Dreaming V15 · Iron Man Traverse V4 | Highball patina on monzonite, dry desert air, volcanic pockets at the Happies | `bishop_highball_patina`, `tuff_pocket_boulder` | `van_couple`, `dirtbag_lifer`, `international_pro`, `photographer`, `weekend_warrior` |
| `magic_wood` | New Base Line 8B+ · Practice of the Wild 8C · Steppenwolf 8A+ | Forest compression on damp gneiss; the problems are under the trees and so is the moisture | `gneiss_compression` | `international_pro`, `van_couple`, `comp_kid`, `developer` |
| `ticino` | Dreamtime 8C · The Story of Two Worlds 8C · Frogger 7B | Slopey river stone in three valleys; winter sun, cold starts | `gneiss_river_sloper` | `international_pro`, `weekend_warrior`, `van_couple`, `local_legend` |
| `albarracin` | Zarzaparrilla 8B · Techos classics 7A–7C | Font-style roofs in red sandstone above a medieval town; strict wet rules enforced by locals | `albarracin_roof` | `weekend_warrior`, `developer`, `van_couple`, `rookie` |
| `arapiles` | Punks in the Gym 32 · Kachoong 21 · Bard 12 | Bullet quartzite, bold trad from a campground under the crag; heritage closures | `quartzite_trad_vertical` | `elder_trad`, `local_legend`, `dirtbag_lifer`, `guide`, `rookie` |
| `grampians` | Wheel of Life V15/16 · Serpentine 29 · Groove Train 33 | Steep orange sandstone and cave boulders; large cultural-heritage closures | `grampians_sandstone_steep` | `international_pro`, `developer`, `van_couple`, `elder_trad` |
| `hampi` | Golden Boulders circuit 5–7A · Rishimuk slabs 6A | Sharp granite eggs in a heritage landscape; highballs, heat, cheap living | `granite_highball_sharp` | `dirtbag_lifer`, `van_couple`, `rookie`, `photographer` |
| `squamish` | Grand Wall 5.11a · Dreamcatcher 5.14d · Singularity V16 · Diedre 5.8 | Polished granite cracks and forest boulders; rain is the project | `granite_crack`, `granite_boulder_forest` | `developer`, `elder_trad`, `comp_kid`, `international_pro`, `van_couple`, `guide` |
| `yosemite` | The Nose 5.9 C2 / 5.14a · Freerider 5.13a · Midnight Lightning V8 · Serenity Crack 5.10d | Polished, runout, old-school granite; free big-wall permits, Camp 4 culture | `granite_bigwall_polished`, `granite_crack` | `dirtbag_lifer`, `elder_trad`, `local_legend`, `international_pro`, `photographer`, `rookie` |
| `indian_creek` | Supercrack 5.10 · Incredible Hand Crack 5.10 · Scarface 5.11 · Generic Crack 5.10 | Size-specific Wingate splitters: six cams of one size, dangerous when wet | `wingate_splitter` | `dirtbag_lifer`, `van_couple`, `elder_trad`, `developer` |
| `peak_district_grit` | Gaia E8 6c · Equilibrium E10 7a · Right Unconquerable HVS 5a · Careless Torque 8A | Friction, ground-fall and ethics on gritstone edges; cold dry days only | `grit_friction_bold`, `grit_boulder` | `elder_trad`, `local_legend`, `weekend_warrior`, `comp_kid`, `developer` |
| `frankenjura` | Action Directe 9a · Wallstreet 8c · Sautanz 7c | Pockets, power and a thousand small crags in beech forest; Rotpunkt was born here | `frankenjura_pocket` | `local_legend`, `weekend_warrior`, `developer`, `international_pro` |
| `ceuse` | Biographie 9a+ · Berlin 7c · Femme Blanche 7a+ | One-hour approach to blue-streaked endurance limestone at 2,000 m | `limestone_endurance_blue` | `international_pro`, `van_couple`, `dirtbag_lifer`, `photographer` |
| `kalymnos` | Aegialis 8c · DNA 7c · Priapos 7a · Grande Grotta tufa classics | Friendly bolting, tufas and an island economy built around climbers | `limestone_tufa_cave`, `limestone_crimp_vertical` | `rookie`, `van_couple`, `weekend_warrior`, `guide`, `developer`, `international_pro` |
| `siurana` | La Rambla 9a+ · Anabolica 8a · Kalea Borroka 8b+ | Crimpy vertical limestone and a hilltop village; winter pilgrimage | `limestone_crimp_vertical` | `international_pro`, `van_couple`, `dirtbag_lifer`, `comp_kid` |
| `margalef` | First Round First Minute 9b · Era Vella 9a · Demencia Senil 9a+ | Pocketed conglomerate; pebbles pop, fingers hurt | `conglomerate_pocket_pebble` | `international_pro`, `van_couple`, `weekend_warrior` |
| `oliana` | Papichulo 9a+ · La Dura Dura 9b · Fish Eye 8c · Mind Control 8c+ | Fifty-metre stamina wall; everything is long and the rests are the route | `limestone_long_stamina` | `international_pro`, `photographer`, `van_couple` |
| `rodellar` | Ali Hulk extension 9b · Welcome to Tijuana 8b | Tufa roofs above a river canyon; seep after rain, swimming between burns | `limestone_tufa_roof` | `van_couple`, `dirtbag_lifer`, `international_pro`, `rookie` |
| `red_river_gorge` | Southern Smoke 5.14c · Pure Imagination 5.14d · Twinkie 5.12a · 27 Years of Climbing 5.8 | Steep jugs, pumpy pockets, climbable in rain on the steep stuff; pizza-and-pitchers culture | `corbin_steep_jug` | `dirtbag_lifer`, `weekend_warrior`, `rookie`, `setter`, `developer` |
| `smith_rock` | To Bolt or Not to Be 5.14a · Just Do It 5.14c · Chain Reaction 5.12c · Five Gallon Buckets 5.8 | Birthplace of US sport climbing: vertical welded tuff, crimps and footwork | `tuff_vertical_edge` | `local_legend`, `weekend_warrior`, `guide`, `developer` |
| `rifle` | Kryptonite 5.14d · Bad Girls Club 5.14d · The Eighth Day 5.13a · Pump-o-rama 5.13a | Polished, kneebar-heavy, beta-dependent limestone at 2,000 m | `limestone_kneebar_polished` | `international_pro`, `weekend_warrior`, `van_couple`, `gym_rat` |
| `ten_sleep` | Great White Behemoth 5.12c · Galactic Emperor 5.14a | Pockets in dolomite at altitude; summer-only, small-town free camping | `dolomite_pocket` | `van_couple`, `dirtbag_lifer`, `developer` |
| `new_river_gorge` | Proper Soul 5.14a · Leave It to Jesus 5.11c · Legacy 5.11a | Bullet Nuttall sandstone, technical and vertical, trad and sport side by side | `nuttall_technical` | `weekend_warrior`, `elder_trad`, `developer`, `rookie` |
| `flatanger` | Silence 9c · Change 9b+ · B.I.G. 9c · Thor's Hammer 9a+ · Nordic Flower 8c | A 45-metre granite roof under the midnight sun; the hardest routes on earth and a farm campsite | `granite_cave_roof` | `international_pro`, `photographer`, `van_couple` |
| `verdon` | La Demande 6a (400 m) · Pichenibule 7b+ | Rap in, climb out: grey limestone, runouts and vultures | `limestone_multipitch_grey` | `elder_trad`, `guide`, `local_legend`, `van_couple` |
| `chamonix` | Walker Spur ED1 · Frêney Pillar ED2 · Arête des Cosmiques AD | Seracs, lifts and weather; the mountain town where everyone is a guide | `alpine_granite_mixed`, `alpine_ice_gully` | `guide`, `international_pro`, `elder_trad`, `photographer`, `rookie` |
| `dolomites` | Comici VII− · Via attraverso il Pesce VIII+ · Spigolo Giallo V+ | Loose, pegged, exposed dolomite faces and huts with half board | `dolomite_alpine_loose` | `guide`, `elder_trad`, `local_legend`, `weekend_warrior` |
| `el_chalten` | Supercanaleta · Franco-Argentine · Fitz Traverse | One-to-three-day windows, free access, weeks of waiting in a wind-blasted town | `patagonia_granite_alpine` | `international_pro`, `dirtbag_lifer`, `guide`, `photographer` |
| `yangshuo` | Spicy Dumpling 5.14a · Moon Hill arch classics 5.11–5.13 · White Mountain 5.12s | Karst tufa in humidity; condensation most of the year, cheap living | `karst_tufa_humid` | `developer`, `van_couple`, `rookie`, `international_pro` |
| `railay` | Humanality 6b · Lord of the Thais 7a+ · Thaiwand Wall classics | Stalactites over the sea, titanium bolts, boats and heat; DWS on the headlands | `limestone_stalactite_coastal`, `limestone_dws` | `rookie`, `van_couple`, `guide`, `photographer` |
| `mallorca` | Es Pontàs 9a+ · Cova del Diablo 7a–8b · Cala Barques classics | Psicobloc: tide and swell set the S-grade each afternoon | `limestone_dws` | `international_pro`, `photographer`, `van_couple`, `guide` |
| `red_rocks` | Epinephrine 5.9 · Levitation 29 5.11c · Cat in the Hat 5.6 · The Fox 5.10d | Varnished Aztec sandstone, 24–72 h wet rule, late-exit permits and a casino skyline | `aztec_varnish_face`, `aztec_boulder` | `weekend_warrior`, `guide`, `dirtbag_lifer`, `gym_rat`, `developer` |
| `joshua_tree` | Illusion Dweller 5.10b · Equinox 5.12c · Double Cross 5.7+ · Hobbit Roof 5.10d | Grainy monzonite slabs, bold leads and desert camping | `monzonite_grainy_slab` | `elder_trad`, `dirtbag_lifer`, `van_couple`, `rookie` |
| `rumney` | Jaws II 5.15a · Predator 5.13b · Waimea 5.10d | Steep pocketed schist in New England woods; humid summers, perfect autumns | `schist_pocket_steep` | `weekend_warrior`, `gym_rat`, `comp_kid`, `developer` |
| `gunks` | High Exposure 5.6 · Supercrack 5.12+ · CCK 5.7 · Son of Easy O 5.8 | Horizontals and roofs in quartz conglomerate; stiff grades, day fee, a century of trad | `conglomerate_horizontal_roof` | `elder_trad`, `weekend_warrior`, `guide`, `local_legend` |
| `chattanooga` | The Shield V12 · Golden Harvest V10 · Super Mario V4 | Sandstone slopers across three states; the Triple Crown circuit and strict wet rules | `southern_sandstone_sloper` | `comp_kid`, `weekend_warrior`, `setter`, `dirtbag_lifer`, `developer` |
| `wadi_rum` | Pillar of Wisdom · Inshallah Factor 7a | Adventurous soft sandstone domes; Bedouin guides, long descents, no bolts | `rum_soft_adventure` | `guide`, `elder_trad`, `dirtbag_lifer` |
| `todra` | Pilier du Couchant 6b · Petite Gorge classics 5–6b | Cheap, friendly vertical limestone in a Berber valley; rebolting in progress | `todra_limestone_vertical` | `rookie`, `van_couple`, `guide`, `developer` |
| `ouray` | Schoolroom WI3–4 · Pic o' the Vic WI5 · Ice Park 200+ lines | Reliable farmed ice in a town gorge; the kindest place to learn to swing | `farmed_ice` | `guide`, `rookie`, `weekend_warrior`, `local_legend` |
| `rjukan` | Rjukanfossen WI5 · Fabrikkfossen WI4 · Krokan sector WI2–5 | Roadside ice in a dark valley; cold, short days, 150+ falls | `natural_ice_roadside` | `guide`, `weekend_warrior`, `international_pro` |
| `canmore` | Polar Circus WI5 · Sea of Vapors WI7 · Professor Falls WI4 · Weeping Wall WI4–5 | Avalanche terrain and −30 °C; the serious end of ice and mixed | `rockies_ice_mixed` | `guide`, `international_pro`, `elder_trad`, `local_legend` |
| `el_potrero_chico` | Time Wave Zero 5.12a (23 pitches) · El Sendero Luminoso 5.12d · Space Boyz 5.10d · Yankee Clipper 5.12a | Long bolted limestone pitches, cheap casitas, winter sun | `epc_limestone_multipitch` | `rookie`, `van_couple`, `dirtbag_lifer`, `guide` |
| `cochamo` | Cerro Trinidad Central routes 5.10–5.12 · Cerro Trinidad walls | Yosemite-scale granite in temperate rainforest; 90-a-day cap, reservations, mud | `cochamo_granite_bigwall` | `dirtbag_lifer`, `international_pro`, `guide` |
| `mount_kenya` | Batian North Face Standard Route IV+ · Diamond Couloir WI4 | Equatorial altitude: two dry seasons, thin air, syenite towers above the moorland | `equatorial_syenite_alpine` | `guide`, `international_pro`, `elder_trad` |
| `trango` | Eternal Flame 5.13a · Slovenian Route | Storms, altitude and fees on the biggest granite towers; six to eight weeks per attempt | `karakoram_granite_bigwall` | `international_pro`, `guide`, `photographer` |
| `baffin` | Mount Thor West Face · Asgard Bavarian Direct | Arctic big walls, 24-hour light, bears and a boat ride | `arctic_granite_bigwall` | `international_pro`, `guide`, `photographer` |
| `elbsandstein` | Schusterweg III (Falkenstein) · Teufelsturm Talweg VIIa · Barbarine tower routes | Soft sandstone towers under the strictest rules in climbing: no chalk, no metal, knotted slings | `elb_sandstone_crack_nochalk` | `elder_trad`, `local_legend`, `weekend_warrior` |
| `leonidio` | Twin Caves tufa 7a–8b · Elona sector 6a–7b · Mars sector 7b–8c | Red limestone over a Peloponnese town; Kalymnos-style bolting with Greek winter sun | `leonidio_tufa_overhang`, `limestone_crimp_vertical` | `van_couple`, `rookie`, `developer`, `international_pro` |
| `joes_valley` | Black Lung V13 · Big Joe V7 · Resident Evil V10 | Sloper-and-crimp sandstone in a Utah canyon; dry spring and fall, strict wet rules | `joes_sandstone_sloper_crimp` | `van_couple`, `comp_kid`, `dirtbag_lifer`, `developer` |
| `devils_tower` | El Matador 5.10d · Bon Homme 5.8 | Phonolite columns, stemming and jamming; a sacred site with a voluntary June closure | `tower_column_crack` | `elder_trad`, `guide`, `weekend_warrior` |
| `venue_innsbruck` | World Cup boulder final set (procedural, V8–V12) · Lead final (procedural, 8b–9a) | The training-centre capital; isolation zones, chalk clouds and a youth pipeline | `plastic_comp_boulder`, `plastic_comp_lead` | `comp_kid`, `setter`, `international_pro`, `gym_rat` |
| `venue_chamonix` | Lead World Cup set (procedural, 8b–9a) | Outdoor wall in the town square; evening finals under the Aiguilles | `plastic_comp_lead` | `comp_kid`, `international_pro`, `photographer` |
| `venue_arco` | Lead and boulder sets (procedural) · Rock Master-style invitational set | Lake-side festival and the oldest invitational format | `plastic_comp_lead`, `plastic_comp_boulder` | `comp_kid`, `international_pro`, `setter` |
| `venue_salt_lake_city` | Boulder World Cup sets (procedural, V8–V13) | Two back-to-back boulder rounds, a big home crowd and altitude at 1,300 m | `plastic_comp_boulder` | `comp_kid`, `gym_rat`, `setter`, `international_pro` |
| `venue_paris` | Boulder and lead sets (procedural) | Metropolitan arena event; the biggest audience in the calendar | `plastic_comp_boulder`, `plastic_comp_lead` | `comp_kid`, `international_pro`, `photographer`, `setter` |

---

## 7. Fontainebleau deep-dive (P1a)

P1a ships Fontainebleau alone, so the forest needs more structure than any other crag: circuits, areas, landings and drying behaviour are what the first 20 minutes of play are made of.

### 7.1 Circuits → DI bands

Circuits are painted, numbered sequences of 20–60 problems of similar grade. In the game a circuit is a `Route[]` list on the area with a shared colour; completing every problem in one trip sets a circuit flag ([07 §1.5](07-disciplines.md)). The DI bands below are the generator targets **(tune)**; the white circuit is rare and only present where noted.

| Colour | Traditional label | Font grades | DI band | Problems | Typical content |
|---|---|---|---|---|---|
| Yellow | PD / F (peu difficile) | 2–3+ | 6–8 | 30–50 | Slabs, easy mantles, walking between blocks; the tutorial |
| Orange | AD (assez difficile) | 3–4+ | 8–10 | 30–60 | Longer slabs, first slopers, small roofs with jugs |
| Blue | D (difficile) | 4+–5+ | 10–12 | 30–50 | Technical slabs, first real slopers, exposed tops |
| Red | TD (très difficile) | 5+–6B | 12–15 | 25–45 | Powerful starts, compression, highballs |
| Black | ED (extrêmement difficile) | 6B+–7A+ | 16–20 | 20–40 | Hard slopers, dynos, roof problems |
| White | ED+ | 7A+–8A | 20–25 | 10–25 | Only at a few areas (Cuvier Rempart); elite circuit |

Children's circuits (also painted white at some areas, Rocher Canon in particular) are a separate `kids` flag at DI 4–7, used for NPC flavour only.

### 7.2 Areas

Each area is a sector of the `fontainebleau` crag record (proposed `Crag.sectors[]`, see Open questions) with its own `shade_fraction`, `dry_lag_days`, landing descriptor and circuit list. Moving between areas is a local edge (bike 30–60 min, car 10–20 min, bus and walk 1–2 h).

| Area | Massif | Circuits | Landings | Shade / drying | Character | Known problems |
|---|---|---|---|---|---|---|
| **Rocher Canon** | Bois-le-Roi | yellow, orange, blue, red, kids | flat sand, low blocks | 0.5 / 1.5 d | Beginner-friendly, ten minutes from a station; where the P1a tutorial starts | Yellow and orange circuit classics (procedural) |
| **Bas Cuvier** | Cuvier | orange, blue, red, black | flat sand | 0.4 / 1 d | The historic heart of Font, polished by a century of hands; everything is a classic and everything is harder than its grade | La Marie-Rose 6A · Carnage 7B+ · L'Abattoir 7A |
| **Cuvier Rempart** | Cuvier | red, black, white | sand, some blocks | 0.5 / 1.5 d | Steep and powerful on the ridge above Bas Cuvier; the white circuit lives here | Big Boss 7C · La Berezina 7C+ |
| **Franchard Isatis** | Franchard | yellow, orange, blue, red, black | sand, roots in places | 0.7 / 2 d | Dense, huge, every circuit; forest holds the damp after rain | Rainbow Rocket 8A · Isatis blue circuit |
| **Apremont** | Apremont | orange, blue, red, black | sand, chaotic blocks | 0.7 / 2 d | Quiet chaos of blocks on a slope; slopers and mantles; slow to dry under trees | Apremont blue and red circuits (procedural) |
| **Buthiers** | Malesherbes | orange, blue, red, black | sand, hard ground at Piscine | 0.4 / 1 d | Power problems at the Piscine sector; open and fast-drying | Partage 8A+ · La Pierre Philosophale 8A |
| **95.2** | Trois Pignons | yellow, orange, blue, red | deep sand | 0.3 / 0.5 d | Open heathland, superb orange and blue circuits, fastest-drying sand | 95.2 orange circuit (procedural) |
| **Cul de Chien** | Trois Pignons | orange, blue, red, black | deep sand dune | 0.2 / 0.5 d | The dune and the famous roof; sun-exposed, dries first after rain, hot in spring | Le Toit du Cul de Chien 7A |

### 7.3 P1a content plan

- **Signature problems (3):** La Marie-Rose 6A (DI 13, Bas Cuvier: the first 6A in the forest, slopers and a committing top), Le Toit du Cul de Chien 7A (DI 19: roof, heel hook, sandy mantle), Rainbow Rocket 8A (DI 25: a dyno to a sloping lip; the commit-window showcase).
- **Procedural pool:** style profiles `font_sloper_slab` (slopers 0.35, smear 0.15, edge 0.15, pinch 0.1, crimp 0.1, jug 0.1, volume 0.05; angles 75–100°; `mantle` finish always) and `font_roof` (sloper 0.3, jug 0.2, pinch 0.15, heel_hook grammar high; angles 110–160°); `friction_base` 1.16; `sharpness` 0.2; `polish` 0.6 at Bas Cuvier, 0.2 elsewhere; `seep_susceptibility` 0.
- **Conditions:** Font's wet rule ([10 §4](10-weather-and-conditions.md)) and the sending window make the forest's October–April season the first lesson in reading weather; the sand-on-rubber penalty (−8% until wiped, [07 §1.4](07-disciplines.md)) is a Font-only mechanic.
- **Community:** `huge`; NPC pool `local_legend`, `dirtbag_lifer`, `weekend_warrior`, `rookie`, `international_pro`, `photographer`; the P1a default spotter stub stands in for all of them ([15 §1.4](15-social-reputation-events.md)).

## 7b. Kalymnos deep-dive (P1b)

P1b brings a second crag and the first trip between two. Kalymnos is the sport counterpart to the forest: long bolted pitches where the pump, not one move, makes the grade ([07 §2](07-disciplines.md), [26](26-p1b-implementation-notes.md)).

### 7b.1 Sectors

| Sector | Profiles | Shade | Dry / seep | Routes from | Character |
|---|---|---|---|---|---|
| **Grande Grotta** | tufa | sunny | 0.5 d / 7 d | 6b+ | A cathedral of tufas above Masouri: steep, pumpy, the island's classic cave |
| **Odyssey** | tufa, grey | sunny | 0.5 d | 4c | The biggest crag on the island: long orange and grey walls at every grade |
| **Sikati Cave** | tufa | shaded | 0.5 d / 7 d | 6b+ | A collapsed cave you walk down into: tufas in the shade all day |
| **Arginonta Valley** | grey, tufa | sunny | 0.5 d | 4c | Grey walls and pockets up a quiet valley, kinder angles |
| **Spartacus** | tufa, grey | sunny | 0.5 d | 4c | Orange overhangs and tufa pinches above the coast road |
| **Panorama** | grey, tufa | sunny | 0.5 d | 4c | Red and grey walls high above Masouri, with the best view on the island |

"Routes from" is the sector's floor ([06 §1](06-procedural-routes.md)): the caves hold only their tufas. The crag's own floor is DI 7, so session slots start at DI 8 (4c): the real island's easiest routes are mostly 5s, and the game lowers its floor one step so that a beginner's session has a warm-up below its level **(tune)**. Sector names are real places; their routes are procedural, apart from the Grande Grotta's three signatures (§7b.4).

### 7b.2 Style profiles

| Profile | Grades | Angles (weight) | Length | Main holds | Features | Bolts / rests |
|---|---|---|---|---|---|---|
| `kalymnos_tufa_sport` | DI 14 (6b+) up | 92° .15 · 100° .3 · 110° .3 · 125° .2 · 145° .05 | 15–28–40 m | pinch .2, jug .2, sloper .12, edge .12, pockets .14 | tufa .35, corner .1, ledge .01 | 2.8 m / 7 m |
| `kalymnos_grey_vertical` | up to DI 21 (7c) | 80° .15 · 88° .3 · 95° .3 · 102° .2 · 110° .05 | 15–25–35 m | edge .22, pockets .26, crimp .12, sidepull .1, jug .1 | corner .15, tufa .08, ledge .01 | 3.0 m / 8 m |

These are the implemented forms of §6's `limestone_tufa_cave` and `limestone_crimp_vertical`. Between DI 14 and 21 a two-profile sector picks either; below 14 only grey, above 21 only tufa.

### 7b.3 Getting there

The P1b graph is the subset of §8 that joins the two live crags, in `data/travel.json`:

| Leg | Mode | Cost | Days |
|---|---|---|---|
| `fontainebleau` ↔ `hub_paris` | train (§8.3, 1 h) | 45 | 0 |
| `hub_paris` ↔ `hub_athens` | fly (§8.2) | 160 | 1 |
| `hub_athens` ↔ `kalymnos` | fly (§8.3, via Kos) | 75 | 1 |

Font to Kalymnos is $280 and two days each way. A trip pays the fare up front, the days pass with living costs and no blocks, and the climber wakes up at the destination under its own weather ([26 §5](26-p1b-implementation-notes.md)). Visas, seasons and luggage fees join with P2's travel model.

### 7b.4 Signature routes

The three named in §6's row for Kalymnos, all in the Grande Grotta and offered in every session there. Each is an authored wall run through the sport generator and tuned to its canonical grade ([26 §8.3](26-p1b-implementation-notes.md)); the shapes approximate the real lines and are not traced from the rock.

| Route | Grade (`di_target`) | Graded | Length | Wall | Bolts |
|---|---|---|---|---|---|
| Priapos | 7a (17) | 16.96 | 28 m | 100° start, tufas from 4 m, steepest 122° at 12–16 m, easing to 98° | 9 + anchor |
| DNA | 7c (21) | 21.26 | 29 m | 105° start, tufas from 4 m, 128–132° from 8 to 20 m | 10 + anchor |
| Aegialis | 8c (27) | 27.03 | 29 m | 112° start, tufas from 4 m, 117–122° from 4 to 24 m | 10 + anchor |

Aegialis is gentler than the cave's steepest lines: the generator cannot make a pitch that is steep all the way easy enough off its cruxes for 8c ([26](26-p1b-implementation-notes.md) Open questions).

---

## 8. Travel hubs and graph

### 8.1 Hubs

A hub is a city node with an airport class; crags attach to exactly one hub (`Crag.hub`) and the last mile is a fixed edge (§8.3). Hub records are proposed as a `Hub` type (Open questions).

| Hub id | City | Airport | Serves |
|---|---|---|---|
| `hub_paris` | Paris | intercontinental | fontainebleau, venue_paris |
| `hub_london` | London (and Sheffield by train) | intercontinental | peak_district_grit |
| `hub_barcelona` | Barcelona | intercontinental | siurana, margalef, oliana, rodellar |
| `hub_madrid` | Madrid | intercontinental | albarracin |
| `hub_palma` | Palma de Mallorca | regional | mallorca |
| `hub_geneva` | Geneva | intercontinental | chamonix, venue_chamonix, ceuse, verdon |
| `hub_zurich` | Zürich | intercontinental | magic_wood |
| `hub_milan` | Milan | intercontinental | ticino, dolomites, venue_arco |
| `hub_innsbruck` | Innsbruck | regional | venue_innsbruck |
| `hub_munich` | Munich | intercontinental | frankenjura |
| `hub_dresden` | Dresden | regional | elbsandstein |
| `hub_oslo` | Oslo | intercontinental | flatanger, rjukan |
| `hub_athens` | Athens | intercontinental | kalymnos, leonidio |
| `hub_cape_town` | Cape Town | intercontinental | rocklands |
| `hub_nairobi` | Nairobi | intercontinental | mount_kenya |
| `hub_amman` | Amman | intercontinental | wadi_rum |
| `hub_marrakech` | Marrakech | intercontinental | todra |
| `hub_bangalore` | Bengaluru | intercontinental | hampi |
| `hub_bangkok` | Bangkok (Krabi by domestic flight) | intercontinental | railay |
| `hub_guilin` | Guilin | regional | yangshuo |
| `hub_islamabad` | Islamabad (Skardu by domestic flight) | intercontinental | trango |
| `hub_melbourne` | Melbourne | intercontinental | arapiles, grampians |
| `hub_el_paso` | El Paso | regional | hueco_tanks |
| `hub_los_angeles` | Los Angeles | intercontinental | bishop, joshua_tree |
| `hub_las_vegas` | Las Vegas | intercontinental | red_rocks |
| `hub_san_francisco` | San Francisco | intercontinental | yosemite |
| `hub_portland` | Portland | intercontinental | smith_rock |
| `hub_vancouver` | Vancouver | intercontinental | squamish |
| `hub_salt_lake_city` | Salt Lake City | intercontinental | indian_creek, joes_valley, venue_salt_lake_city |
| `hub_denver` | Denver | intercontinental | rifle, ten_sleep, ouray, devils_tower |
| `hub_calgary` | Calgary | intercontinental | canmore |
| `hub_ottawa` | Ottawa (Iqaluit and Pangnirtung by air) | intercontinental | baffin |
| `hub_new_york` | New York | intercontinental | gunks, rumney |
| `hub_lexington` | Lexington | regional | red_river_gorge, new_river_gorge |
| `hub_atlanta` | Atlanta | intercontinental | chattanooga |
| `hub_monterrey` | Monterrey | intercontinental | el_potrero_chico |
| `hub_el_calafate` | El Calafate | regional | el_chalten |
| `hub_puerto_montt` | Puerto Montt | regional | cochamo |

### 8.2 Hub-to-hub edges (`TravelEdge`)

Costs are one-way USD-equivalent for one person with a 20 kg bag; a crash pad adds the oversize fee from [14 §7](14-economy-gear-logistics.md). Bands: **A** < $60 · **B** $60–200 · **C** $200–600 · **D** $600–1,200 · **E** > $1,200. `days` is whole sim days consumed. Every edge is bidirectional at the same cost unless noted. Regional hubs connect through the nearest intercontinental hub (extra edge). **(tune)**

| from | to | mode | cost | band | days |
|---|---|---|---|---|---|
| `hub_paris` | `hub_london` | train | 120 | B | 1 |
| `hub_paris` | `hub_barcelona` | train / fly | 110 / 90 | B | 1 |
| `hub_paris` | `hub_geneva` | train | 90 | B | 1 |
| `hub_paris` | `hub_munich` | train | 130 | B | 1 |
| `hub_paris` | `hub_milan` | train | 120 | B | 1 |
| `hub_paris` | `hub_athens` | fly | 160 | B | 1 |
| `hub_paris` | `hub_oslo` | fly | 140 | B | 1 |
| `hub_paris` | `hub_marrakech` | fly | 150 | B | 1 |
| `hub_paris` | `hub_new_york` | fly | 550 | C | 1 |
| `hub_paris` | `hub_los_angeles` | fly | 700 | D | 1 |
| `hub_paris` | `hub_cape_town` | fly | 900 | D | 2 |
| `hub_paris` | `hub_bangalore` | fly | 750 | D | 2 |
| `hub_paris` | `hub_bangkok` | fly | 700 | D | 2 |
| `hub_london` | `hub_new_york` | fly | 500 | C | 1 |
| `hub_london` | `hub_amman` | fly | 350 | C | 1 |
| `hub_london` | `hub_nairobi` | fly | 650 | D | 1 |
| `hub_london` | `hub_islamabad` | fly | 700 | D | 2 |
| `hub_barcelona` | `hub_madrid` | train | 70 | B | 1 |
| `hub_barcelona` | `hub_palma` | fly / boat | 60 / 80 | B | 1 |
| `hub_madrid` | `hub_marrakech` | fly | 120 | B | 1 |
| `hub_geneva` | `hub_zurich` | train | 60 | B | 1 |
| `hub_geneva` | `hub_milan` | train | 70 | B | 1 |
| `hub_zurich` | `hub_milan` | train | 60 | B | 1 |
| `hub_zurich` | `hub_innsbruck` | train | 60 | B | 1 |
| `hub_milan` | `hub_innsbruck` | train | 70 | B | 1 |
| `hub_munich` | `hub_innsbruck` | train | 40 | A | 1 |
| `hub_munich` | `hub_dresden` | train | 60 | B | 1 |
| `hub_munich` | `hub_athens` | fly | 150 | B | 1 |
| `hub_athens` | `hub_amman` | fly | 220 | C | 1 |
| `hub_oslo` | `hub_london` | fly | 120 | B | 1 |
| `hub_cape_town` | `hub_nairobi` | fly | 450 | C | 1 |
| `hub_bangkok` | `hub_guilin` | fly | 200 | B/C | 1 |
| `hub_bangkok` | `hub_melbourne` | fly | 500 | C | 2 |
| `hub_bangalore` | `hub_bangkok` | fly | 250 | C | 1 |
| `hub_melbourne` | `hub_los_angeles` | fly | 900 | D | 2 |
| `hub_new_york` | `hub_lexington` | fly / drive | 180 / 90 | B | 1 |
| `hub_new_york` | `hub_atlanta` | fly / drive | 150 / 100 | B | 1 |
| `hub_new_york` | `hub_denver` | fly | 220 | C | 1 |
| `hub_atlanta` | `hub_lexington` | drive | 60 | B | 1 |
| `hub_atlanta` | `hub_el_paso` | drive | 180 | B | 3 |
| `hub_lexington` | `hub_denver` | drive | 160 | B | 3 |
| `hub_denver` | `hub_salt_lake_city` | drive | 80 | B | 1 |
| `hub_denver` | `hub_el_paso` | drive | 100 | B | 2 |
| `hub_salt_lake_city` | `hub_las_vegas` | drive | 60 | B | 1 |
| `hub_salt_lake_city` | `hub_portland` | drive | 110 | B | 2 |
| `hub_las_vegas` | `hub_los_angeles` | drive | 50 | A | 1 |
| `hub_las_vegas` | `hub_el_paso` | drive | 110 | B | 2 |
| `hub_los_angeles` | `hub_san_francisco` | drive | 60 | B | 1 |
| `hub_san_francisco` | `hub_portland` | drive | 90 | B | 1 |
| `hub_portland` | `hub_vancouver` | drive / train | 60 | B | 1 |
| `hub_vancouver` | `hub_calgary` | drive / fly | 120 / 150 | B | 1 |
| `hub_calgary` | `hub_denver` | fly | 250 | C | 1 |
| `hub_ottawa` | `hub_new_york` | fly / drive | 200 / 80 | B/C | 1 |
| `hub_ottawa` | `baffin` (Pangnirtung) | fly + boat | 3,500 | E | 3 |
| `hub_el_paso` | `hub_monterrey` | drive / bus | 90 | B | 1 |
| `hub_monterrey` | `hub_los_angeles` | fly | 300 | C | 1 |
| `hub_los_angeles` | `hub_el_calafate` | fly (via Buenos Aires) | 1,300 | E | 2 |
| `hub_el_calafate` | `hub_puerto_montt` | bus (via Bariloche) | 120 | B | 3 |
| `hub_puerto_montt` | `hub_barcelona` | fly (via Santiago) | 1,200 | E | 2 |
| `hub_islamabad` | `trango` (Skardu + trek) | fly + trek | 600 + logistics (§5) | D | 8 |
| `hub_nairobi` | `mount_kenya` (park gate + trek) | bus + trek | 120 | B | 3 |

Vehicles ([14 §7](14-economy-gear-logistics.md)) change `drive` edge cost to fuel only and let the climber keep a crash-pad set and rack without baggage fees; a parked van charges half running costs while the player flies elsewhere.

### 8.3 Last mile (hub → crag)

| crag | mode | hours | cost | days |
|---|---|---|---|---|
| fontainebleau 1 h train · peak_district_grit 3 h train+bus · siurana/margalef/oliana 2 h drive · rodellar 3 h · albarracin 3 h · ceuse 3 h · verdon 4 h · chamonix 1.5 h bus · magic_wood 3 h · ticino 2 h · dolomites 4 h · frankenjura 2 h · elbsandstein 1 h · leonidio 3.5 h bus · kalymnos 1 h flight or ferry via Kos · mallorca 1 h bus · red_rocks 0.5 h · joshua_tree 2.5 h · bishop 5 h · yosemite 4 h · smith_rock 3 h · squamish 1.5 h · indian_creek 5 h · joes_valley 2.5 h · rifle 3 h · ten_sleep 6 h · ouray 6 h · devils_tower 6 h · canmore 1.5 h · gunks 1.5 h · rumney 5 h · red_river_gorge 1 h · new_river_gorge 3.5 h · chattanooga 2 h · hueco_tanks 0.5 h · el_potrero_chico 1 h · arapiles/grampians 4 h · rocklands 3 h · wadi_rum 4 h bus · todra 6 h · hampi 8 h train · railay 1.5 h flight + boat · yangshuo 1.5 h bus · el_chalten 3 h bus · cochamo 3 h bus + 5 h trek · venues: in the hub | bus / drive / train | as listed | `cost_tier × 15` (train or bus), fuel only with a vehicle; flights and ferries (kalymnos, railay) 60–90 | 1 (0 for ≤ 1 h when the day has a second block) |

---

## 9. World calendar

The calendar drives season scores, closures and event spawns. Competitions are in §10; festivals and closures here are triggers for `GameEvent` contexts `crag`, `comp` and `travel` ([15 §4](15-social-reputation-events.md)).

| Month | Prime openings | Closures starting | Festivals and gatherings (event hooks) |
|---|---|---|---|
| Jan | hueco_tanks, bishop, siurana, chattanooga, hampi, el_potrero_chico, el_chalten, railay, ouray, rjukan, canmore | Raptor closures begin at some Spanish sectors (siurana, margalef, rodellar, verdon, elbsandstein) | Ice festival at ouray (clinics, demo gear, −$ for tickets, `guide` contacts); ice festival at rjukan |
| Feb | albarracin, peak_district_grit, red_rocks, kalymnos shoulder | US raptor season warms up; Frankenjura bird closures | Hueco bouldering gathering (reservation pressure spikes: cap events); Leonidio spring meet |
| Mar | indian_creek, joes_valley, red_river_gorge, smith_rock | US raptor closures 1 Mar–15 Jul across most US areas (A7); Squamish falcon closures | Spring Creek gatherings (`van_couple` spawn rate ×1.5) |
| Apr | yosemite, kalymnos, gunks, new_river_gorge, frankenjura, arapiles, elbsandstein | Hueco heat closure approaches; hampi season ends | Easter gathering at arapiles; Font spring meets; the comp season opens (§10) |
| May | rodellar, magic_wood, rumney, rifle (late), verdon | Red River Gorge summer humidity; Albarracín nesting closures peak | Boulder World Cup round at venue_salt_lake_city; Alpine valley boulder festival (Italy, `international_pro` spawn) |
| Jun | rocklands, ceuse, ten_sleep, flatanger, chamonix rock, dolomites, squamish, mallorca dws, trango, baffin | **devils_tower voluntary closure (all June)**; Hueco closed; Mediterranean sport too hot (siurana, oliana, leonidio) | Boulder World Cup at venue_innsbruck; Rocklands season opening (permit queue) |
| Jul | all alpine and northern venues | US raptor closures end 15 Jul | Lead World Cup at venue_chamonix; midnight-sun sends at flatanger (content events) |
| Aug | as July; mount_kenya second dry season | Fire-danger closures in Australia lift later; heat everywhere low | Major arena event at venue_paris; Rock Master-style invitational at venue_arco (late Aug) |
| Sep | yosemite autumn, kalymnos, verdon, red_river_gorge shoulder, new_river_gorge, indian_creek | Trango and baffin seasons close; rocklands closes | Kalymnos climbing festival (biennial, odd years); lead rounds at venue_arco; Font autumn opening meets |
| Oct | fontainebleau, siurana, margalef, oliana, red_rocks, chattanooga, hueco shoulder, ticino, albarracin, yangshuo, wadi_rum, todra | Alpine rock closes; Magic Wood season ends | Triple Crown bouldering series begins (chattanooga, Oct–Dec); Font "bleausard" gatherings; Yangshuo festival |
| Nov | hueco_tanks, bishop, hampi, railay, el_potrero_chico, canmore ice, joes_valley late | Céüse snowed in; Rifle closed | Triple Crown rounds; Bishop highball season meets; US Thanksgiving crowds at hueco/red_rocks/joshua_tree (cap and reservation events) |
| Dec | el_chalten, cochamo, ouray, rjukan, chamonix ice, grampians closes for fire | Northern-hemisphere sport mostly shoulder | Ice festivals (canmore); Christmas crowds in Spain (siurana, margalef); year-end sponsor reviews ([14](14-economy-gear-logistics.md)) |

---

## 10. Competition venues as a crag type

Venues are `Crag` records with `rock: 'plastic'`, `disciplines` in `{comp_boulder, comp_lead, gym}`, an indoor `Climate`, no wet-rock or raptor rules, and `signature_routes` that are procedural sets regenerated per event from the `plastic_comp_boulder` / `plastic_comp_lead` style profiles (`friction_base` 0.95, `sharpness` 0, `volume` weight 0.3, `hold_density_max` high, `crux_position: 'spread'`, `move_grammar` heavy on `dyno`, `deadpoint`, `toe_hook`, `kneebar`).

| Field | Venue behaviour |
|---|---|
| `season` | 2 all year (training access), 3 in event months (§3) |
| `access` | `fee`: athlete registration $40 per event; spectators irrelevant to the sim |
| Entry condition | National ranking from local comps (`comp_round` blocks at any `gym_tier ≥ 2` city) or an invitation event; Comp Kid background starts eligible |
| Structure | Qualification → semi-final → final ([07 §8](07-disciplines.md)); each round is a `comp_round` block; travel between venues uses §8 |
| Outputs | Ranking points → `reputation['comp']`; prize money by placing ([14](14-economy-gear-logistics.md)); `confidence` ±; `Comp Yips` acquired trait after three consecutive isolation-triggered falls |
| Event months | venue_salt_lake_city May · venue_innsbruck Jun–Jul · venue_chamonix Jul · venue_paris Aug · venue_arco Aug–Sep |
| Ticks | None; results live in a separate `comp_results[]` list (proposed) and in the career log, never in `ticklist` |

---

## Open questions / proposed schema additions

### Open questions

1. Whether `peak_district_grit` should be two crags (Eastern Edges trad, Yorkshire grit boulders) so phase gating (P2 boulder, P3 trad) is clean; currently one record with a two-phase note.
2. Hueco's cap and reservation interplay with `logistics` needs a worked example in [14](14-economy-gear-logistics.md) or [15](15-social-reputation-events.md).
3. Chamonix and Mallorca carry two seasons in one score row; the UI must filter by discipline or the record should split.
4. Climate values are approximate; station data should replace them before the data files ship, and `t_sd` per month would be better than a single value.
5. Some signature route names at smaller venues (Leonidio, Hampi, Todra, Yangshuo) are sector-level rather than route-level; they can stay procedural with a sector tag.

### Proposed schema additions

- `Crag.sectors?: { id: string; name: string; shade_fraction: number; dry_lag_days: number; landing: 'flat'|'sloping'|'blocks'|'roots'|'sand'; circuits?: { colour: string; di_band: [number, number]; route_ids: string[] }[] }[]` for Fontainebleau-style areas and for sector-level raptor closures.
- `Crag.climate_class?: string` (the §1 label) for UI filtering; today it is documentation only.
- `Crag.season_by_discipline?: Partial<Record<Discipline, Crag['season']>>` for crags with two seasons (Chamonix, Mallorca).
- `Crag.min_rope_m?: number` and `Crag.landing?: string` (consumed by [07](07-disciplines.md)).
- `Hub { id; name; country; lat; lon; airport: 'intercontinental'|'regional'|'none'; cost_tier; gym_tier }` and `TravelEdge.id` (the `Action.travel.edge` field references an edge id that `TravelEdge` does not carry).
- `AccessRule.kind` could gain `'avalanche'` (Canmore bulletins) and `'donation'`; both are expressed above with existing kinds (`seasonal_closure`, `fee` with cost 0) so no change is strictly required.
- `Climber.comp_results: { venue: string; day: number; discipline: Discipline; rank: number; points: number }[]`.
- `Crag.connectivity` (proposed in [14](14-economy-gear-logistics.md)) and `Crag.tide_seed` (proposed in [07](07-disciplines.md)) are endorsed here; the atlas would populate them.
