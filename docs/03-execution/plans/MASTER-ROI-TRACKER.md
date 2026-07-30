# MASTER-ROI-TRACKER — code-grounded ROI ranking toward C63 100%

> **Stamp**: 2026-07-30 · **Authority**: [C63 — City Completion & Dossier](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)
> §4 (ratified weights) · **Sources synthesised**: the 15 per-country
> [`RATE-IMPLEMENTATION-PLAN.md`](../../04-reference/jurisdictions/) + [`COUNTRY-RATE.md`](../../04-reference/jurisdictions/)
> roll-ups · the 91-city [`§CITY-COMPLETION`](./master-execution-tracker.md) matrix · **code verified against**
> `parcelProviders/registry.ts` · `tools/context-bake/heightSources.mjs` · `bake.mjs` · `terrain.mjs` ·
> `rulepacks/registry.ts`.
>
> **The one board that ranks every country + city by VERIFIED return-on-investment, so the founder knows
> what to execute first.** This is a decision aid, not a scorecard — see the honesty header.

---

## §0 — Honesty header (read this before trusting a number)

1. **The weights are RATIFIED** (founder, 2026-07-30, L-649 · C63 §4):
   **LEGISLATION 25 · ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5.**
   Every ROI judgement below is weighted by these. Phase-A moves that touch LEGISLATION+ENVELOPE (45 pts)
   or PARCEL+DATA-SOURCES (30 pts) rank above ones that touch HEIGHTS/TERRAIN/CONTEXT (25 pts total).

2. **The composite %s are C63 Phase-1 *manual-audit* numbers**, renormalised over the **assessed subset
   only** (`partial:true`) and transcribed verbatim from each `COUNTRY-RATE.md`. The **automated scorecard
   function is NOT built** (C63 §8). Every composite here is a **planning estimate until the scorecard
   computes it**. `not-assessed ≠ 0 %`.

3. **Ceilings are PROJECTED** roadmap estimates from each country's `RATE-IMPLEMENTATION-PLAN.md` (mostly
   `CONTINGENT on Phase-A/B/C probes landing`), **not measured maxima.**

4. **ROI cells are marked VERIFIED or PROJECTED.**
   - **VERIFIED** = the code-feasibility claim under the ROI (provider wired / height source `impl` / bake
     region present / envelope pack registered) was **checked in the source this session** and is cited.
   - **PROJECTED** = the score-gain is a roadmap estimate not yet grounded in a wired code path.
   The ROI *ranking* is VERIFIED (rests on checked code state); the *magnitude* of the gain is PROJECTED.

5. **Code-verified column vocabulary** (all checked in `registry.ts` / `heightSources.mjs` this session):
   `wired-live` = keyless national cadastre wired + live · `needs-token` = wired but credential-gated ·
   `verified-live-but-unwired` = cadastre proven live but no routing predicate yet · `to-build` = provider
   not yet wired · `blocked` = source geo-fenced/licensed shut.

---

## §0.5 — Phase-4 EXECUTION LOG (live — updated as agents land)

> **Started 2026-07-30.** This log records what Phase-4 has actually *changed*, cited by commit. The §1
> ranked board below stays as the Phase-1 **audit baseline** (a planning estimate per §0.2). The **computed**
> composite %s cannot move until the **C63 scorecard compute function lands** (in-flight, agent building
> `tools/city-completion/computeScorecard.mjs` + the P5 schema) — it is the tool that recomputes the number.
> Until then this log tracks **status + realised axis-deltas**, not re-scored composites. `not-assessed ≠ 0 %`.

| Country | Phase-4 move | Status | Commit | Axis effect (honest) |
|---|---|---|---|---|
| 🇪🇸 Spain | MDS Edificación measured-height join extended to 6 metro capitals (Madrid/Valencia/Sevilla/Málaga/Zaragoza/Bilbao), priority-stamped + uncapped | **LANDED (code)** — re-bake DEFERRED (needs R2 write cred) | `3d687f22` | HEIGHTS: code ready; buildings stay *estimated* until the `buildings` re-bake+R2 upload runs |
| 🇮🇹 Italy | `AgenziaEntrateParcelProvider` (national INSPIRE Catasto WFS) + 21 tests | **LANDED (code, inert)** — pending batch `registry.ts` row + server `/api/parcel/it` proxy + 1 live GetCapabilities probe | `893e62eb` | PARCEL+DATA-SOURCES: provider built & green (1019 tests); not yet routed (graceful OSM fallback) |
| 🇩🇰 Denmark | L-449 SIGNED vs BR18: `FAR = maksbebyggelsesprocent/100`, height, storeys, `densityScope` preserved → offline rule pack | **IN-FLIGHT** — reshaped to **offline-legislation + DEFERRED live data** (Datafordeler MitID bootstrap blocked, founder 2026-07-30) | *(agent)* | LEGISLATION: credited (DERIVED, signed). PARCEL/live-data: **access-deferred, not a code gap** — Datafordeler adapter = canonical stub |
| 🇨🇭 Switzerland | L-449 resolved = **YES**: swisstopo AV (Amtliche Vermessung) = survey-grade → parcel HIGH (AV dataset only; rendered tiles ≠ engineering-grade) | **IN-FLIGHT (docs)** | *(agent)* | PARCEL: → HIGH (signed); DATA-SOURCES measurement follows scorecard |
| 🇧🇪 Belgium | `FlandersGrbParcelProvider` (GRB/CadGIS, keyless) — Flanders first; Wallonia/Brussels next behind one `isInBelgium` | **IN-FLIGHT** | *(agent)* | PARCEL+DATA-SOURCES: Flanders; national ceiling still region-split-capped |
| 🇺🇸 USA | `NycPlutoParcelProvider` (MapPLUTO — lot geometry + zoning + FAR + height) — establishes the `CityParcelProvider` pattern | **IN-FLIGHT** | *(agent)* | PARCEL+DATA-SOURCES **and** a LEGISLATION bonus (PLUTO carries FAR/zoning) for NYC |
| 🇪🇸 Madrid | Legislation extraction template (Barcelona-format, PGOUM Compendio 2024, article-cited) | **IN-FLIGHT (docs)** — then BLOCKED on founder-sourced numeric values | *(agent)* | LEGISLATION (25 %, heaviest): template ready; values are the human-gated 65 % |
| C63 scorecard | `CityCompletionScorecard` P5 schema + `computeScorecard.mjs` + `computeParcelConfidence` helper | **IN-FLIGHT (enabler)** | *(agent)* | Unblocks the NL/FR/NO/CH "measure-already-wired" moves + **recomputes every composite %** |

**Founder decisions locked this session (govern the board):**
- 🇩🇰 DK + 🇸🇪 SE = **offline-legislation + deferred-live-data** — authoritative cadastre is identity-bootstrap-gated (MitID / BankID) and un-clearable by a foreign founder; both ship on canonical **stub adapters** (fill one method later, no engine change). Parcel axis = *access-deferred*, scored honestly, **not** a code gap.
- 🇫🇮 FI = **only self-service unblock** — MML API key is create-it-yourself online; the one easy full-country win (pending founder key).
- 🇪🇸 Madrid = **lead legislation city** after Barcelona.
- 🇧🇪 BE = **Flanders first**; 🇺🇸 US = **NYC first** (both confirmed).

**Orchestrator debt (batch when IT/BE/US all land):** one `registry.ts` pass wiring all new providers + evolve routing toward **bbox-intersection + priority-fallback** (retire per-country `if(isInX)` growth); wire the `/api/parcel/<cc>` server proxies; add **golden-parcel CI tests** per provider.

---

## §1 — Per-country ranked board (top → bottom by score-gain-per-effort)

| # | Country | Current composite | Ceiling (proj.) | Gap | Phase-A first move | Effort | Code-verified? | ROI |
|---|---|---|---|---|---|---|---|---|
| 1 | 🇩🇰 **Denmark** | **66 %** part | ~92–96 % | ~26–30 | **Wire PLANDATA.dk (Lokalplaner+Kommuneplan) as per-city legislation + sign the L-449 `VERIFICATION.md` for Copenhagen** — moves the two heaviest axes (LEG 25 + ENV 20 = **45 pts**) with **zero OCR**, data already machine-readable | Low–Med | **VERIFIED** — `geodanmark` height `impl:'live'`; parcel `matrikel-dk` wired (`needs-token`); plandata WFS keyless (per plan) · **⚙️P4: L-449 SIGNED vs BR18 (offline legislation credited); live cadastre/PLANDATA DEFERRED — Datafordeler MitID bootstrap blocked → canonical stub adapter** | 🟢🟢🟢 |
| 2 | 🇮🇹 **Italy** | **51 %** part | ~55–65 % | ~4–14 | **Wire `AgenziaEntrateParcelProvider` in `registry.ts`** as a `kind:'cadastral'` jurisdiction (+ `isInItaly`/ISTAT routing) — one wire lights **PARCEL 15 + DATA-SOURCES 15 = 30 pts** | Low (~1–2 d) | **VERIFIED** — `isInItaly` **absent** from `registry.ts` imports → `verified-live-but-unwired`; the single highest-gain new wire · **⚙️P4: PROVIDER LANDED `893e62eb` (code + 21 tests, 1019 pkg green), pending batch registry row + `/api/parcel/it` proxy + 1 live GetCapabilities probe** | 🟢🟢🟢 |
| 3 | 🇳🇱 **Netherlands** | **71 %** part (highest) | ~85–92 % | ~15–20 | **Run `computeParcelConfidence` over an Amsterdam bbox against the already-wired `pdok-nl`** — measure, don't build; **smallest gap to Denmark of any country** | Low | **VERIFIED** — `pdok-nl` cadastral **wired-live**; `3dbag` height `impl:'live'` | 🟢🟢🟢 |
| 4 | 🇫🇷 **France** | **66 %** part | ~68–80 % | ~2–14 | **Run `computeParcelConfidence`+`computeParcelMetrics` over Paris/Lyon bboxes** — `ign-fr` already wired+live, a measurement not a build | S (~0.5–1 d) | **VERIFIED** — `ign-fr` cadastral **wired-live**; `bdtopo` height `impl:'live'` | 🟢🟢🟢 |
| 5 | 🇳🇴 **Norway** | **66 %** part | ~40–50 nat · 55–65 Oslo | ~-11–0 nat | **Measure the already-wired keyless `geonorge-no` Matrikkelen** — `computeParcelConfidence` over Oslo bbox | Low | **VERIFIED** — `geonorge-no` cadastral **wired-live** (keyless); `ndh_no` height `documented` | 🟢🟢 |
| 6 | 🇨🇭 **Switzerland** | **66 %** part | ctx 90–95 · city 60–75 | ~0–9 | **Measure the already-wired `swisstopo-av` cadastre** (L-627, all-canton keyless) + finish DATA-SOURCES wiring | Low | **VERIFIED** — `swisstopo-av` cadastral **wired-live**; `swissbuildings3d` height `documented` (keyless build) · **⚙️P4: L-449 = YES SIGNED → parcel HIGH (AV Amtliche Vermessung = survey-grade; rendered tiles ≠ engineering-grade)** | 🟢🟢 |
| 7 | 🇩🇪 **Germany** | Berlin 44 · Munich 29 | ~75–85 (NRW city Köln) | ~31–41 | **Stand up NRW as the "German Barcelona" (Köln)** — `NRWProvider` on the wired `alkis-nrw` + LoD2-DE-NRW true heights + a Köln `bake.mjs` REGION | Med | **VERIFIED** — `alkis-nrw` cadastral **wired-live**; `lod2de_nrw` height `impl:'live'`; needs a **new** Köln bake+terrain row | 🟢🟢 |
| 8 | 🇸🇪 **Sweden** | **56 %** part | ~45–55 nat · 55–65 Stockholm | ~-1–9 | **Obtain+wire free `LANTMATERIET_API_KEY`, add `isInSweden` + Fastighetsindelning parcel adapter** | Low | **PROJECTED** — provider `to-build` + `needs-token`; `lidar_se` height `documented` | 🟢 |
| 9 | 🇫🇮 **Finland** | **56 %** part | ~80–85 (if Ryhti attrs) · 40–50 else | ~24–29 | **Probe the Ryhti `_ix_` GET** (`pub_valid_ld_plan_ix_gs/items`); if `properties` carry FAR/storeys, wire the OGC reader — the "second-Denmark" upside | Very-Low probe | **PROJECTED** — upside `CONTINGENT` on one **unread** `_ix_` schema; provider `to-build`; Helsinki terrain `needs-token` (MML key) | 🟢 |
| 10 | 🇺🇸 **USA** | **53 %** part | ~55–60 NYC · 50–55 SF (per city) | ~2–7 | **Wire `NYCParcelProvider` (MapPLUTO/BBL) + `SFParcelProvider` (APN)** as `City*Provider`s; probe `MaxAllwFAR` semantics | Low–Med (~2–4 d/city) | **PROJECTED** — providers `to-build` (no national parcel); `overture_us` height `documented`; **no single national ceiling** | 🟡 |
| 11 | 🇪🇸 **Spain** | **34 %** (national composite) | ~55 % | ~21 | **Barcelona/metro MDS re-bake** — flip heights estimated→measured (`mdsn_e025` P90 `tagged`); broader climb = per-city clau OCR/sourcing | Low (Phase-A) | **VERIFIED** — `mds_edificacion`+`catastro` `impl:'live'`; **Barcelona is the ONLY city with a rendering envelope pack** (4 packs); rest = OCR-gated · **⚙️P4: MDS metro heights code LANDED `3d687f22` (6 capitals priority-stamped/uncapped); Madrid = lead legislation city (template in-flight); heights stay estimated until `buildings` re-bake + R2 upload** | 🟡 |
| 12 | 🇧🇪 **Belgium** | **44 %** part | ~30–40 nat · 40–50 Brussels | structurally capped | **Wire federal CADMAP/CadGIS as `BeParcelProvider` behind `isInBelgium`** + `computeParcelConfidence` + PRAS zone-GIS | Low–Med | **PROJECTED** — provider `to-build`; `grb_be` height `documented` (Flanders-only); **ceiling capped by the constitutional region-split, not a defect** · **⚙️P4: `FlandersGrbParcelProvider` LANDED `2da5371c` (GRB Adp, 18 tests), pending batch registry + `/api/parcel/be-vlg` proxy; Wallonia/Brussels next behind one `isInBelgium`** | 🟡 |
| 13 | 🇵🇹 **Portugal** | **36 %** part | ~45–55 % | ~9–19 | **Probe+wire the DGT OGC API** (CAOP+DICOFRE, Cadastro Predial, CRUS/COS, orthophotos) | Low–Med | **PROJECTED** — all DGT findings `CONVERGENT-SECONDARY` (**not live-probed**); no national footprint; parcels weak; terrain `blocked`; `dgt_pt` height `documented` | 🟡 |
| 14 | 🇬🇧 **United Kingdom** | **51 %** part | ~45–55 English · 35–45 nat | little headroom | **Wire OS Open (Buildings/Roads/Greenspace/Rivers) + AddressBase/UPRN** for England/London | Low–Med | **PROJECTED** — OS findings `CONVERGENT-SECONDARY`; provider `to-build`; **discretionary-planning caps the LEGISLATION ceiling** — composite already near ceiling | 🟠 |
| 15 | 🇸🇦 **Saudi Arabia** | **19 %** part (lowest) | ~30–40 % best case | ~11–21 | **Register+sign the authored `saRiyadhDemo.ts` footprint pack** (ENVELOPE — the ONE movable axis); vertical held null | Low–Med | **VERIFIED** — Riyadh pack **already registered** in `rulepacks/registry.ts` (footprint/setbacks; height refuses); parcel + `ml_sa` height **`blocked`** (geo-fenced) — nationally capped | ⚫ |

**Ranking logic.** Ordered by *score-gain-per-effort, gated by code feasibility*: (1) Denmark first — the two
heaviest axes (45 pts) over data that is **already live**, cost = wiring + one sign-off; (2) Italy — one cheap
wire lights 30 pts, the highest gain-per-wire and the only `verified-live-but-unwired` cadastre; (3–6) the
**already-wired-just-measure** countries (NL/FR/NO/CH) — near-zero effort, pure ROI, PARCEL 15 each; (7) Germany
— the wired NRW stack pays across five axes but needs a new bake region; (8–10) token/new-wire builds; (11–14)
OCR/sourcing-bound legislation ceilings in the middle; (15) Saudi at the bottom — honest low ceiling, only ENVELOPE moves.

---

## §2 — Top-10 "do-this-first" execution list (highest single moves, exact code action)

| Rank | Move (exact code action) | Country | Axes (weight) | Code-verified state |
|---|---|---|---|---|
| 1 | **Sign the L-449 `sources/VERIFICATION.md` for Copenhagen + wire PLANDATA.dk WFS** (`geoserver.plandata.dk`, keyless) as the per-city legislation source; run the byzone click-weighted fill probe scoped to the `0101` bbox | 🇩🇰 DK | LEG 25 + ENV 20 = **45** | **VERIFIED** — data live, zero OCR; `matrikel-dk` + `geodanmark` already in code |
| 2 | **Wire `AgenziaEntrateParcelProvider` into `parcelProviders/registry.ts`** as `kind:'cadastral'` behind a new `isInItaly` predicate (+ ISTAT `ItalyJurisdictionResolver`) | 🇮🇹 IT | PAR 15 + SRC 15 = **30** | **VERIFIED** — `isInItaly` absent today → one-wire, verified-live-but-unwired |
| 3 | **Run `computeParcelConfidence` over an Amsterdam bbox against `pdok-nl`** (already wired) — record the confidence distribution | 🇳🇱 NL | PAR 15 | **VERIFIED** — `pdok-nl` wired-live; sample run never executed |
| 4 | **Run `computeParcelConfidence`+`computeParcelMetrics` over Paris (`75056`) + Lyon (`69123`) bboxes against `ign-fr`** | 🇫🇷 FR | PAR 15 | **VERIFIED** — `ign-fr` wired-live |
| 5 | **Run `computeParcelConfidence` over an Oslo bbox against keyless `geonorge-no`** | 🇳🇴 NO | PAR 15 | **VERIFIED** — `geonorge-no` wired-live keyless |
| 6 | **Run `computeParcelConfidence`+`computeParcelMetrics` over Zürich/Genève/Bern against `swisstopo-av`** + confirm geodienste WFS licence | 🇨🇭 CH | PAR 15 + SRC | **VERIFIED** — `swisstopo-av` wired-live (L-627) |
| 7 | **Add per-city metro-capital bboxes to `heightSources.mjs` MDS join and re-bake** (Barcelona/Madrid/… → `mdsn_e025` `tagged`), flipping heights estimated→measured | 🇪🇸 ES | HGT 10 (+SRC) | **VERIFIED** — `mds_edificacion` `impl:'live'`, bboxes staged in `REGION_SOURCE` |
| 8 | **Stand up `NRWProvider` on the wired `alkis-nrw` + consume `fetchLod2DeNrw` true heights + add a Köln `bake.mjs` REGION** (the "German Barcelona") | 🇩🇪 DE | PAR+SRC+HGT+TER+CTX | **VERIFIED** — `alkis-nrw` + `lod2de_nrw` both live; needs new bake/terrain row |
| 9 | **Obtain the free `LANTMATERIET_API_KEY` (repo secret) + add `isInSweden` + a Fastighetsindelning parcel adapter to `registry.ts`**; run the Stockholm sample | 🇸🇪 SE | PAR 15 + SRC 15 | **PROJECTED** — provider to-build + needs-token |
| 10 | **Probe the Ryhti `_ix_` item GET** (`pub_valid_ld_plan_ix_gs/items?limit=1`) and read `properties` for `tehokkuusluku`/`kerrosluku` — decides FI's "second-Denmark" ceiling before any wiring | 🇫🇮 FI | LEG+ENV (contingent) | **PROJECTED** — one unread schema gates the whole upside |

**Honest note on ordering #3–#6 vs #2.** Moves #3–#6 are cheaper than #2 (a probe run vs a code wire) but each
lights only PARCEL (15). #2 lights 30 pts for ~1–2 days of one wire — a higher *absolute* gain, hence above the
measure-only set. #1 sits alone at the top: 45 pts over already-live data.

---

## §3 — Per-city drill-down (the 91-city board — Overall + country next-move)

Overall %s transcribed verbatim from [`§CITY-COMPLETION`](./master-execution-tracker.md) §CC.1 (`partial`,
assessed-subset renormalised, `n/a ≠ 0 %`). **74 Phase-1-audited** rows carry an Overall; **17** are
`see dossier` (pre-existing / research-only, not re-audited this pass — Overall lives in the linked dossier).
"Next-move" = the city's country Phase-A from §1.

### Non-Spain audited cities (25) + all see-dossier flagships

| City (`code`) | Country | Overall | Country Phase-A next-move |
|---|---|---|---|
| Copenhagen (`0101`) | 🇩🇰 DK | **66 %** | Sign L-449 + wire PLANDATA.dk (LEG+ENV, data live) |
| Aarhus (`0751`) | 🇩🇰 DK | **66 %** | replay DK Phase-A–C (national providers) |
| Odense (`0461`) | 🇩🇰 DK | **66 %** | replay DK Phase-A–C |
| Aalborg (`0851`) | 🇩🇰 DK | **66 %** | replay DK Phase-A–C |
| Amsterdam (`0363`) | 🇳🇱 NL | **71 %** (top) | `computeParcelConfidence` on wired `pdok-nl` |
| Paris (`75056`) | 🇫🇷 FR | **66 %** | measure wired `ign-fr` |
| Lyon (`69123`) | 🇫🇷 FR | **66 %** | measure wired `ign-fr` |
| Oslo (`0301`) | 🇳🇴 NO | **66 %** | measure keyless `geonorge-no` |
| Zürich (`0261`) | 🇨🇭 CH | **66 %** | measure wired `swisstopo-av` |
| Genève (`6621`) | 🇨🇭 CH | **66 %** | measure wired `swisstopo-av` |
| Bern (`0351`) | 🇨🇭 CH | **66 %** | measure wired `swisstopo-av` |
| Roma (`058091`) | 🇮🇹 IT | **51 %** | **wire `AgenziaEntrateParcelProvider`** |
| Milano (`015146`) | 🇮🇹 IT | **51 %** | **wire `AgenziaEntrateParcelProvider`** |
| New York City (`3651000`) | 🇺🇸 US | **53 %** | wire `NYCParcelProvider` (MapPLUTO/BBL) |
| San Francisco (`0667000`) | 🇺🇸 US | **53 %** | wire `SFParcelProvider` (APN) |
| Greater London (`E12000007`) | 🇬🇧 GB | **51 %** | wire OS Open + AddressBase/UPRN |
| Stockholm (`0180`) | 🇸🇪 SE | **56 %** | obtain `LANTMATERIET_API_KEY` + wire adapter |
| Helsinki (`091`) | 🇫🇮 FI | **56 %** | probe Ryhti `_ix_` |
| Brussels (`21004`) | 🇧🇪 BE | **44 %** | wire CADMAP `BeParcelProvider` |
| Berlin (`11000`) ⚑ | 🇩🇪 DE | **44 %** | NRW/Köln stack (Berlin is T-out for terrain) |
| München (`09162`) ⚑ | 🇩🇪 DE | **29 %** | NRW/Köln stack (Bavaria LoD2 licence TBD) |
| Lisboa (`1106`) | 🇵🇹 PT | **36 %** | probe+wire DGT OGC API |
| Porto (`1315`) | 🇵🇹 PT | **36 %** | probe+wire DGT OGC API |
| Riyadh (`RUH`) | 🇸🇦 SA | **19 %** (lowest) | register+sign `saRiyadhDemo.ts` (ENV only) |
| Jeddah (`JED`) | 🇸🇦 SA | **19 %** | register+sign `saRiyadhDemo.ts` (ENV only) |
| **Barcelona** (`08019`) | 🇪🇸 ES | *see dossier* — **flagship**, only rendering envelope | Phase-A = MDS re-bake (heights measured) |
| Madrid (`28079`) | 🇪🇸 ES | *see dossier* | NZ-1 explicit-area refusal jurisdiction |
| Córdoba (`14021`) | 🇪🇸 ES | *see dossier* | OCR pack refusing (VERIFICATION unsigned) |
| L'Hospitalet/Badalona/Sant Boi (`08101/08015/08200`) | 🇪🇸 ES | *see dossier* | cited-refusal jurisdictions (L-449 gate) |
| Antwerp/Liège (`11002/62063`) | 🇧🇪 BE | *see dossier* | Flanders/Wallonia regional path |
| Hamburg (`02000`) | 🇩🇪 DE | *see dossier* | DiPlanung structured-attribute path |
| Marseille (`13055`) | 🇫🇷 FR | *see dossier* | France Phase-A (measure `ign-fr`) |
| Turin (`001272`) | 🇮🇹 IT | *see dossier* | ARPA Piemonte 3D + IT parcel wire |
| Bergen/Trondheim (`4601/5001`) | 🇳🇴 NO | *see dossier* | Norway Phase-A (measure `geonorge-no`) |
| Braga (`0303`) | 🇵🇹 PT | *see dossier* | DGT LiDAR path |
| Dammam (`DMM`) | 🇸🇦 SA | *see dossier* | Saudi ENV pack |
| Los Angeles/Chicago (`0644000/1714000`) | 🇺🇸 US | *see dossier* | wire city parcel provider |

### Spain audited cities (49) — grouped by Overall (all share ES Phase-A: MDS heights re-bake now; per-city clau OCR later)

- **66 %** (Catalan MUC data-source 80 %): Girona (`17079`) · Lleida (`25120`) · Tarragona (`43148`).
- **61 %** (data-source 70 %) — 33 cities: Almería (`04013`) · Cádiz (`11012`) · Granada (`18087`) · Huelva
  (`21041`) · Jaén (`23050`) · Málaga (`29067`) · Sevilla (`41091`) · Huesca (`22125`) · Teruel (`44216`) ·
  Zaragoza (`50297`) · Oviedo (`33044`) · Palma (`07040`) · Santander (`39075`) · Ávila (`05019`) · Burgos
  (`09059`) · León (`24089`) · Palencia (`34120`) · Salamanca (`37274`) · Segovia (`40194`) · Soria (`42173`) ·
  Valladolid (`47186`) · Zamora (`49275`) · Albacete (`02003`) · Ciudad Real (`13034`) · Cuenca (`16078`) ·
  Guadalajara (`19130`) · Toledo (`45168`) · Badajoz (`06015`) · Cáceres (`10037`) · A Coruña (`15030`) · Lugo
  (`27028`) · Ourense (`32054`) · Pontevedra (`36038`) · Murcia (`30030`) · Logroño (`26089`) · Alicante
  (`03014`) · Castelló (`12040`) · València (`46250`).
  *(38 names listed — the 61 % tier; foral/coastal variants below sit lower.)*
- **51 %** (foral cadastre ⚑, data-source 50 %): Pamplona (`31201`) · Vitoria-Gasteiz (`01059`) · San Sebastián
  (`20069`) · Bilbao (`48020`).
- **50 %** (context outside bake clip, `n/a (out)`): Las Palmas (`35016`) · Sta. Cruz de Tenerife (`38038`) ·
  Ceuta (`51001`) · Melilla (`52001`).

**City-board takeaway.** The entire non-Spain measure-only tier (NL/FR/NO/CH — 8 cities) already sits at 66–71 %
on cheap axes; their PARCEL axis flips the moment a probe runs against a **wired-live** provider. The two Italian
cities (51 %) jump the same way behind **one** new wire. Denmark's four cities (66 %) carry the biggest latent
gain — 45 pts of law+envelope over live data.

---

## §4 — Code-verification appendix (what was checked this session)

**`packages/site-parcel-data/src/parcelProviders/registry.ts`** — WIRED cadastral providers:
`catastro` (ES), `ign-fr` (FR), `alkis-nrw` (DE-NW only), `pdok-nl` (NL), `geonorge-no` (NO), `swisstopo-av`
(CH, L-627), `matrikel-dk` (DK, **credential-gated** `DATAFORDELER_USERNAME/PASSWORD`). Footprint-fallback:
DE (non-NRW), SA (geo-fenced). **NOT wired** (no predicate imported): **IT, SE, BE, FI, GB, US, PT** — so
IT/SE/BE/FI/GB/US/PT Phase-A parcel moves are genuine new wires; IT's is `verified-live-but-unwired`.

**`tools/context-bake/heightSources.mjs`** — `impl` flags: **live** = `3dbag` (nl), `bdtopo` (fr), `catastro`
+ `mds_edificacion` (es), `lod2de_nrw` (de), `geodanmark` (dk, apikey-gated). **documented** = `swissbuildings3d`
(ch, keyless build), `lod2de` (de-Berlin), `overture_us` (us), `ndh_no` (no), `lidar_se` (se), `dgt_pt` (pt),
`piedmont_it` (it, Turin-only). **blocked** = `ml_sa` (sa, geo-fenced 403).

**`tools/context-bake/bake.mjs`** — 23 baked REGIONS cover **every demo city** (spain+denmark+netherlands
whole-country; paris/lyon/rome/milan/berlin/munich/london/brussels/oslo/stockholm/helsinki/zurich/geneva/bern/
newyork/sanfrancisco; riyadh+jeddah on Overture). Copenhagen rides `denmark`, Amsterdam rides `netherlands`.
→ CONTEXT axis (~56 %) is VERIFIED-present nearly everywhere.

**`packages/site-parcel-data/src/rulepacks/registry.ts`** — envelope packs that **render numbers**: only
**Barcelona** (4 packs: Ensanche 13a/13E · Semiintensiva 13b · 20a Aïllada · Nucli Antic). **Riyadh** demo pack
registered (footprint/setbacks; height/floors refuse). **Madrid · Córdoba · Switzerland · L'Hospitalet ·
Badalona · Sant Boi · Cornellà** = registered **refusal jurisdictions** (empty `packsByZone`). → ENVELOPE is the
scarcest axis: one shipped city.
