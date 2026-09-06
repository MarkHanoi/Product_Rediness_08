# PRYZM WORLD COVERAGE LEDGER

> ⛔ **GENERATED FILE — DO NOT HAND-EDIT.** Regenerate with
> `node tools/coverage-ledger/build.mjs`. Every number below is read from the
> table that decides it (`bake.mjs` `ALL_REGIONS` / `stampBboxesFor`, `terrain.mjs`
> `NATIONAL_REGIONS` + `REGIONS`, `heightSources.mjs` `REGION_SOURCE` + the `*_BBOXES`
> working sets, `terrainCoverage.ts`, the parcel `registry.ts`, the server proxy legs)
> plus one LIVE probe of the published R2 manifest. A hand-copied coverage list rots,
> and a rotted one **certifies a gap as covered** — which is exactly how Ciudad Real
> shipped without measured heights (L-12946).

**This page answers one question: _what does PRYZM actually serve HERE?_**

Generated: 2026-09-06T10:04:43.556Z

## §0 · Probe record (C57 §1.5 — the exact answer, never a claim)

```
GET https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/tileset-manifest.json → HTTP 200 OK · 23535 B · content-type: application/json · 653 ms · first 200 chars: "{\n  \"schema\": \"pryzm-context-tileset-manifest@1\",\n  \"mergedAt\": \"2026-09-06T07:58:43.604Z\",\n  \"mergeRunId\": \"34015784612\",\n  \"mergeGitSha\": \"ad038f5a0337097f9af7fda873383bbfdf193b36\",\n  \"engine\": \"til"
```

- manifest `mergedAt`: `2026-09-06T07:58:43.604Z` · `mergeRunId`: `34015784612` · `mergeGitSha`: `ad038f5a0337097f9af7fda873383bbfdf193b36`
- layers on R2: `trees` · `rail` · `parks` · `buildings` · `landuse` · `water` · `roads`
- regions in `layers.buildings.sources`: **49**

> ⚠ **The manifest records `heightJoin` per region but NOT the footprint mode.** A
> published tileset therefore cannot tell you whether it was baked with
> `--footprints osm` (the default, every run to date) or `official`. That is a real
> hole in the provenance chain, named here rather than papered over.

## §1 · Summary

| | count |
|---|---|
| Countries/territories with at least one row anywhere | **61** |
| — verdict COMPLETE | **0** |
| — verdict PARTIAL | **61** |
| — verdict ABSENT (zero rows in every table) | **0** |
| Context bake regions (`bake.mjs` ALL_REGIONS) | **131** |
| — of those, published in the live buildings tileset | **40** |
| — **baked in code but NOT on R2** (a region a user cannot see) | **91** |
| Context layers baked per region | **9** default (`buildings roads water parks landuse rail trees furniture sea`) + **1** opt-in (`canopy`) |
| Regions declaring a `heightJoin` | **22** of 131 |
| — whose working set is WHOLE-COUNTRY | **1** |
| Terrain national regions (`NATIONAL_REGIONS`) | **122** |
| Terrain city regions (`REGIONS`) | **592** (7 blocked) |
| Client terrain rows (`terrainCoverage.ts`) | **581** cities + **122** regions |
| Parcel jurisdictions registered | **79** (63 cadastral · 16 footprint-fallback) |
| — cadastral rows with a WIRED server leg | **63** |

**Verdict rule** (applied mechanically, printed so it can be argued with):

- **ABSENT** — no context row, no terrain row, no parcel row. Nothing at all.
- **COMPLETE** — every context region published live · terrain covers the country (a
  national region, not a city box) · a measured height join whose working set is
  WHOLE-COUNTRY · at least one cadastral parcel row with a wired server leg.
- **PARTIAL** — anything else. **The gap is named in the row.**

## §2 · The country ledger

| Country | Context | Live on R2 | Terrain | Heights | Footprints | Parcels | Verdict |
|---|---|---|---|---|---|---|---|
| **Albania** (AL) | 1 region(s): `albania` | 0/1 — **missing `albania`** | national `albania` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Andorra** (AD) | 1 region(s): `andorra` | 0/1 — **missing `andorra`** | — | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Australia** (AU) | 8 region(s): `newsouthwales victoria queensland westernaustralia southaustralia tasmania act northernterritory` | all 8 | **8× state/territory** `newsouthwales victoria queensland westernaustralia southaustralia tasmania act northernterritory` | `au_open` **city list (1)** | OSM | 6/6 cadastral wired (+2 fallback) | 🟡 PARTIAL |
| **Austria** (AT) | 1 region(s): `austria` | all 1 | national `austria` | `bev_at` **city list (5)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Bahrain** (BH) | 1 region(s): `gccstates` | 0/1 — **missing `gccstates`** | **1× metro box** `gccstates` | `ad_ndsm` **city list (1)** | Overture | 1 footprint-fallback | 🟡 PARTIAL |
| **Belarus** (BY) | 1 region(s): `belarus` | 0/1 — **missing `belarus`** | national `belarus` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Belgium** (BE) | 1 region(s): `belgium` | all 1 | national `belgium` | `be_dhmv` **city list (5)** | OSM | 1/1 cadastral wired (+2 fallback) | 🟡 PARTIAL |
| **Bosnia and Herzegovina** (BA) | 1 region(s): `bosniaherzegovina` | 0/1 — **missing `bosniaherzegovina`** | national `bosniaherzegovina` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Bulgaria** (BG) | 1 region(s): `bulgaria` | all 1 | national `bulgaria` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Canada** (CA) | 13 region(s): `ontario quebec britishcolumbia alberta saskatchewan manitoba newbrunswick novascotia princeedwardisland newfoundland yukon northwestterritories nunavut` | 0/13 — **missing `ontario quebec britishcolumbia alberta saskatchewan manitoba newbrunswick novascotia princeedwardisland newfoundland yukon northwestterritories nunavut`** | **13× province/territory** `ontario quebec britishcolumbia alberta saskatchewan manitoba newbrunswick novascotia princeedwardisland newfoundland yukon northwestterritories nunavut` | `ca_open` **city list (2)** | OSM | — | 🟡 PARTIAL |
| **Channel Islands (Guernsey/Jersey)** (JE) | 1 region(s): `channelislands` | 0/1 — **missing `channelislands`** | — | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Croatia** (HR) | 1 region(s): `croatia` | all 1 | national `croatia` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Cyprus** (CY) | 1 region(s): `cyprus` | 0/1 — **missing `cyprus`** | national `cyprus` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Czechia** (CZ) | 1 region(s): `czechia` | all 1 | national `czechia` | `cuzk_cz` **city list (5)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Denmark** (DK) | 1 region(s): `denmark` | all 1 | national `denmark` + 1 city | `dhm` **city list (4)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Estonia** (EE) | 1 region(s): `estonia` | all 1 | national `estonia` + 1 city | `ee_etak` **city list (4)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Faroe Islands** (FO) | 1 region(s): `faroeislands` | 0/1 — **missing `faroeislands`** | national `faroeislands` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Finland** (FI) | 1 region(s): `finland` | all 1 | national `finland` + 1 city | **none — assumed default** | OSM | 1 footprint-fallback | 🟡 PARTIAL |
| **France** (FR) | 3 region(s): `paris lyon france` | all 3 | national `france` + 2 city | `mnh_fr` **city list (13)** | OSM · official `fr_bdtopo` (opt-in only) | 1/1 cadastral wired | 🟡 PARTIAL |
| **Germany** (DE) | 2 region(s): `koln germany` | all 2 | national `germany` + 1 city | `lod2nrw` region bbox; `lod2de` **city list (12)** | OSM | 15/15 cadastral wired (+1 fallback) | 🟡 PARTIAL |
| **Greece** (GR) | 1 region(s): `greece` | all 1 | national `greece` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Hungary** (HU) | 1 region(s): `hungary` | all 1 | national `hungary` | **none — assumed default** | OSM | 1 footprint-fallback | 🟡 PARTIAL |
| **Iceland** (IS) | 1 region(s): `iceland` | 0/1 — **missing `iceland`** | national `iceland` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Ireland** (IE) | 1 region(s): `ireland` | all 1 | national `ireland` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Isle of Man** (IM) | 1 region(s): `isleofman` | 0/1 — **missing `isleofman`** | — | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Israel** (IL) | 1 region(s): `israel` | 0/1 — **missing `israel`** | **1× metro box** `israel` | **none — assumed default** | OSM | 1 footprint-fallback | 🟡 PARTIAL |
| **Italy** (IT) | 1 region(s): `italy` | all 1 | national `italy` + 2 city | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Japan** (JP) | 1 region(s): `japan` | 0/1 — **missing `japan`** | national `japan` | `plateau_jp` **city list (10)** | OSM | — | 🟡 PARTIAL |
| **Jordan** (JO) | 1 region(s): `jordan` | 0/1 — **missing `jordan`** | **1× metro box** `jordan` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Kosovo** (XK) | 1 region(s): `kosovo` | 0/1 — **missing `kosovo`** | national `kosovo` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Kuwait** (KW) | 1 region(s): `gccstates` | 0/1 — **missing `gccstates`** | **1× metro box** `gccstates` | `ad_ndsm` **city list (1)** | Overture | 1 footprint-fallback | 🟡 PARTIAL |
| **Latvia** (LV) | 1 region(s): `latvia` | all 1 | national `latvia` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Lebanon** (LB) | 1 region(s): `lebanon` | 0/1 — **missing `lebanon`** | **1× metro box** `lebanon` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Liechtenstein** (LI) | 1 region(s): `liechtenstein` | 0/1 — **missing `liechtenstein`** | — | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Lithuania** (LT) | 1 region(s): `lithuania` | all 1 | national `lithuania` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Luxembourg** (LU) | 1 region(s): `luxembourg` | all 1 | national `luxembourg` + 1 city | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Malta** (MT) | 1 region(s): `malta` | 0/1 — **missing `malta`** | — | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Mexico** (MX) | 1 region(s): `mexico` | 0/1 — **missing `mexico`** | national `mexico` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Moldova** (MD) | 1 region(s): `moldova` | 0/1 — **missing `moldova`** | — | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Montenegro** (ME) | 1 region(s): `montenegro` | 0/1 — **missing `montenegro`** | national `montenegro` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Netherlands** (NL) | 1 region(s): `netherlands` | all 1 | national `netherlands` + 5 city | `3dbag` **city list (6)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **New Zealand** (NZ) | 1 region(s): `newzealand` | 0/1 — **missing `newzealand`** | national `newzealand` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **North Macedonia** (MK) | 1 region(s): `northmacedonia` | 0/1 — **missing `northmacedonia`** | national `northmacedonia` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Norway** (NO) | 1 region(s): `norway` | all 1 | national `norway` + 1 city | `ndh_no` **city list (3)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Oman** (OM) | 1 region(s): `gccstates` | 0/1 — **missing `gccstates`** | **1× metro box** `gccstates` | `ad_ndsm` **city list (1)** | Overture | 1 footprint-fallback | 🟡 PARTIAL |
| **Poland** (PL) | 1 region(s): `poland` | all 1 | national `poland` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Portugal** (PT) | 1 region(s): `portugal` | all 1 | national `portugal` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Qatar** (QA) | 1 region(s): `gccstates` | 0/1 — **missing `gccstates`** | **1× metro box** `gccstates` | `ad_ndsm` **city list (1)** | Overture | 1/1 cadastral wired | 🟡 PARTIAL |
| **Romania** (RO) | 1 region(s): `romania` | all 1 | national `romania` | **none — assumed default** | OSM | 1 footprint-fallback | 🟡 PARTIAL |
| **Saudi Arabia** (SA) | 1 region(s): `gccstates` | 0/1 — **missing `gccstates`** | **1× metro box** `gccstates` | `ad_ndsm` **city list (1)** | Overture | 1 footprint-fallback | 🟡 PARTIAL |
| **Serbia** (RS) | 1 region(s): `serbia` | 0/1 — **missing `serbia`** | national `serbia` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **Slovakia** (SK) | 1 region(s): `slovakia` | all 1 | national `slovakia` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Slovenia** (SI) | 1 region(s): `slovenia` | all 1 | national `slovenia` | `gurs_si` **city list (5)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Spain** (ES) | 1 region(s): `spain` | all 1 | national `spain` + 563 city | `mds` **WHOLE-COUNTRY** | OSM · official `es_catastro` (opt-in only) | 1/1 cadastral wired | 🟡 PARTIAL |
| **Sweden** (SE) | 1 region(s): `sweden` | all 1 | national `sweden` + 1 city | **none — assumed default** | OSM | 1 footprint-fallback | 🟡 PARTIAL |
| **Switzerland** (CH) | 1 region(s): `switzerland` | all 1 | national `switzerland` + 3 city | `swiss` **city list (9)** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Türkiye** (TR) | 1 region(s): `turkey` | 0/1 — **missing `turkey`** | **1× metro box** `turkey` | **none — assumed default** | OSM | 1/1 cadastral wired | 🟡 PARTIAL |
| **Ukraine** (UA) | 1 region(s): `ukraine` | 0/1 — **missing `ukraine`** | national `ukraine` | **none — assumed default** | OSM | — | 🟡 PARTIAL |
| **United Arab Emirates** (AE) | 1 region(s): `gccstates` | 0/1 — **missing `gccstates`** | **1× metro box** `gccstates` | `ad_ndsm` **city list (1)** | Overture | 1 footprint-fallback | 🟡 PARTIAL |
| **United Kingdom** (GB) | 1 region(s): `greatbritain` | all 1 | national `greatbritain` + 1 city | `ealidar_gb` **city list (5)** | OSM | 1/1 cadastral wired (+1 fallback) | 🟡 PARTIAL |
| **United States** (US) | 54 region(s): `alabama alaska alaskaaleutians arizona arkansas california colorado connecticut delaware districtofcolumbia florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada newhampshire newjersey newmexico newyork northcarolina northdakota ohio oklahoma oregon pennsylvania puertoricousa rhodeisland southcarolina southdakota tennessee texas usvirginislands utah vermont virginia washington westvirginia wisconsin wyoming` | 1/54 — **missing `alabama alaska alaskaaleutians arizona arkansas california colorado connecticut delaware districtofcolumbia florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada newhampshire newjersey newmexico northcarolina northdakota ohio oklahoma oregon pennsylvania puertoricousa rhodeisland southcarolina southdakota tennessee texas usvirginislands utah vermont virginia washington westvirginia wisconsin wyoming`** | **54× metro box** `alabama alaska alaskaaleutians arizona arkansas california colorado connecticut delaware districtofcolumbia florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada newhampshire newjersey newmexico newyork northcarolina northdakota ohio oklahoma oregon pennsylvania puertoricousa rhodeisland southcarolina southdakota tennessee texas usvirginislands utah vermont virginia washington westvirginia wisconsin wyoming` + 2 city | `us_open` **city list (3)** | OSM | 16/16 cadastral wired | 🟡 PARTIAL |

### Named gaps, per country

- **Albania (AL)** — context baked but NOT in the live tileset: albania · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Andorra (AD)** — context baked but NOT in the live tileset: andorra · no terrain · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Australia (AU)** — terrain is 8 × state/territory (`newsouthwales victoria queensland westernaustralia southaustralia tasmania act northernterritory`), NOT the country · measured heights only inside 1 box(es) [melbourne] — everywhere else ships the assumed default
- **Austria (AT)** — measured heights only inside 5 box(es) [vienna graz linz salzburg innsbruck] — everywhere else ships the assumed default
- **Bahrain (BH)** — context baked but NOT in the live tileset: gccstates · terrain is 1 × metro box (`gccstates`), NOT the country · measured heights only inside 1 box(es) [abudhabi-core] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Belarus (BY)** — context baked but NOT in the live tileset: belarus · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Belgium (BE)** — measured heights only inside 5 box(es) [antwerp ghent brussels leuven bruges] — everywhere else ships the assumed default
- **Bosnia and Herzegovina (BA)** — context baked but NOT in the live tileset: bosniaherzegovina · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Bulgaria (BG)** — NO measured height join — every building ships the assumed default
- **Canada (CA)** — context baked but NOT in the live tileset: ontario, quebec, britishcolumbia, alberta, saskatchewan, manitoba, newbrunswick, novascotia, princeedwardisland, newfoundland, yukon, northwestterritories, nunavut · terrain is 13 × province/territory (`ontario quebec britishcolumbia alberta saskatchewan manitoba newbrunswick novascotia princeedwardisland newfoundland yukon northwestterritories nunavut`), NOT the country · measured heights only inside 2 box(es) [vancouver toronto] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Channel Islands (Guernsey/Jersey) (JE)** — context baked but NOT in the live tileset: channelislands · no terrain · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Croatia (HR)** — NO measured height join — every building ships the assumed default
- **Cyprus (CY)** — context baked but NOT in the live tileset: cyprus · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Czechia (CZ)** — measured heights only inside 5 box(es) [prague brno ostrava plzen olomouc] — everywhere else ships the assumed default
- **Denmark (DK)** — measured heights only inside 4 box(es) [copenhagen aarhus odense aalborg] — everywhere else ships the assumed default
- **Estonia (EE)** — measured heights only inside 4 box(es) [tallinn tartu parnu narva] — everywhere else ships the assumed default
- **Faroe Islands (FO)** — context baked but NOT in the live tileset: faroeislands · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Finland (FI)** — NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **France (FR)** — HEIGHT JOIN NOT IN THE LIVE TILES — `france` declares `mnh_fr` but the published tiles carry `none` — the code says measured, the map still shows the assumed default · LIVE TILES PREDATE THE CODE — `france` baked 2026-09-03 (sha fab79894) but its deciding tables last changed 2026-09-06 — what a user clicks is the OLD behaviour · measured heights only inside 13 box(es) [paris lyon marseille toulouse nice nantes strasbourg montpellier bordeaux rennes grenoble sete lille] — everywhere else ships the assumed default
- **Germany (DE)** — HEIGHT JOIN NOT IN THE LIVE TILES — `germany` declares `lod2de` but the published tiles carry `none` — the code says measured, the map still shows the assumed default · LIVE TILES PREDATE THE CODE — `germany` baked 2026-09-03 (sha fab79894) but its deciding tables last changed 2026-09-05 — what a user clicks is the OLD behaviour · measured heights only inside 12 box(es) [berlin hamburg potsdam kiel erfurt mainz schwerin magdeburg koln hannover dresden stuttgart] — everywhere else ships the assumed default
- **Greece (GR)** — NO measured height join — every building ships the assumed default
- **Hungary (HU)** — NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Iceland (IS)** — context baked but NOT in the live tileset: iceland · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Ireland (IE)** — NO measured height join — every building ships the assumed default
- **Isle of Man (IM)** — context baked but NOT in the live tileset: isleofman · no terrain · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Israel (IL)** — context baked but NOT in the live tileset: israel · terrain is 1 × metro box (`israel`), NOT the country · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Italy (IT)** — NO measured height join — every building ships the assumed default
- **Japan (JP)** — context baked but NOT in the live tileset: japan · measured heights only inside 10 box(es) [tokyo yokohama osaka nagoya sapporo fukuoka kyoto kobe sendai hiroshima] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Jordan (JO)** — context baked but NOT in the live tileset: jordan · terrain is 1 × metro box (`jordan`), NOT the country · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Kosovo (XK)** — context baked but NOT in the live tileset: kosovo · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Kuwait (KW)** — context baked but NOT in the live tileset: gccstates · terrain is 1 × metro box (`gccstates`), NOT the country · measured heights only inside 1 box(es) [abudhabi-core] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Latvia (LV)** — NO measured height join — every building ships the assumed default
- **Lebanon (LB)** — context baked but NOT in the live tileset: lebanon · terrain is 1 × metro box (`lebanon`), NOT the country · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Liechtenstein (LI)** — context baked but NOT in the live tileset: liechtenstein · no terrain · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Lithuania (LT)** — NO measured height join — every building ships the assumed default
- **Luxembourg (LU)** — NO measured height join — every building ships the assumed default
- **Malta (MT)** — context baked but NOT in the live tileset: malta · no terrain · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Mexico (MX)** — context baked but NOT in the live tileset: mexico · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Moldova (MD)** — context baked but NOT in the live tileset: moldova · no terrain · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Montenegro (ME)** — context baked but NOT in the live tileset: montenegro · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Netherlands (NL)** — measured heights only inside 6 box(es) [amsterdam rotterdam utrecht thehague eindhoven groningen] — everywhere else ships the assumed default
- **New Zealand (NZ)** — context baked but NOT in the live tileset: newzealand · NO measured height join — every building ships the assumed default
- **North Macedonia (MK)** — context baked but NOT in the live tileset: northmacedonia · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Norway (NO)** — measured heights only inside 3 box(es) [oslo bergen trondheim] — everywhere else ships the assumed default
- **Oman (OM)** — context baked but NOT in the live tileset: gccstates · terrain is 1 × metro box (`gccstates`), NOT the country · measured heights only inside 1 box(es) [abudhabi-core] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Poland (PL)** — NO measured height join — every building ships the assumed default
- **Portugal (PT)** — NO measured height join — every building ships the assumed default
- **Qatar (QA)** — context baked but NOT in the live tileset: gccstates · terrain is 1 × metro box (`gccstates`), NOT the country · measured heights only inside 1 box(es) [abudhabi-core] — everywhere else ships the assumed default
- **Romania (RO)** — NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Saudi Arabia (SA)** — context baked but NOT in the live tileset: gccstates · terrain is 1 × metro box (`gccstates`), NOT the country · measured heights only inside 1 box(es) [abudhabi-core] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Serbia (RS)** — context baked but NOT in the live tileset: serbia · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Slovakia (SK)** — NO measured height join — every building ships the assumed default
- **Slovenia (SI)** — HEIGHT JOIN NOT IN THE LIVE TILES — `slovenia` declares `gurs_si` but the published tiles carry `none` — the code says measured, the map still shows the assumed default · LIVE TILES PREDATE THE CODE — `slovenia` baked 2026-09-03 (sha fab79894) but its deciding tables last changed 2026-09-05 — what a user clicks is the OLD behaviour · measured heights only inside 5 box(es) [ljubljana maribor celje kranj koper] — everywhere else ships the assumed default
- **Spain (ES)** — LIVE TILES PREDATE THE CODE — `spain` baked 2026-09-03 (sha fab79894) but its deciding tables last changed 2026-09-06 — what a user clicks is the OLD behaviour
- **Sweden (SE)** — NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Switzerland (CH)** — measured heights only inside 9 box(es) [zurich geneva bern basel lausanne winterthur luzern stgallen lugano] — everywhere else ships the assumed default
- **Türkiye (TR)** — context baked but NOT in the live tileset: turkey · terrain is 1 × metro box (`turkey`), NOT the country · NO measured height join — every building ships the assumed default
- **Ukraine (UA)** — context baked but NOT in the live tileset: ukraine · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **United Arab Emirates (AE)** — context baked but NOT in the live tileset: gccstates · terrain is 1 × metro box (`gccstates`), NOT the country · measured heights only inside 1 box(es) [abudhabi-core] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **United Kingdom (GB)** — measured heights only inside 5 box(es) [london manchester birmingham leeds bristol] — everywhere else ships the assumed default
- **United States (US)** — context baked but NOT in the live tileset: alabama, alaska, alaskaaleutians, arizona, arkansas, california, colorado, connecticut, delaware, districtofcolumbia, florida, georgia, hawaii, idaho, illinois, indiana, iowa, kansas, kentucky, louisiana, maine, maryland, massachusetts, michigan, minnesota, mississippi, missouri, montana, nebraska, nevada, newhampshire, newjersey, newmexico, northcarolina, northdakota, ohio, oklahoma, oregon, pennsylvania, puertoricousa, rhodeisland, southcarolina, southdakota, tennessee, texas, usvirginislands, utah, vermont, virginia, washington, westvirginia, wisconsin, wyoming · LIVE TILES PREDATE THE CODE — `newyork` baked 2026-09-05 (sha c7d1ebe6) but its deciding tables last changed 2026-09-06 — what a user clicks is the OLD behaviour · terrain is 54 × metro box (`alabama alaska alaskaaleutians arizona arkansas california colorado connecticut delaware districtofcolumbia florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada newhampshire newjersey newmexico newyork northcarolina northdakota ohio oklahoma oregon pennsylvania puertoricousa rhodeisland southcarolina southdakota tennessee texas usvirginislands utah vermont virginia washington westvirginia wisconsin wyoming`), NOT the country · measured heights only inside 3 box(es) [newyork sanfrancisco boston] — everywhere else ships the assumed default

## §3 · Context bake regions (`bake.mjs` ALL_REGIONS)

| Region | Country | bbox | Buildings | heightJoin | Working set | Official footprints | Live on R2 |
|---|---|---|---|---|---|---|---|
| `spain` | ES | `-9.55,35.90,4.60,43.90` | osm | `mds` | **WHOLE-COUNTRY** (`MDS_NATIONAL_BBOXES`) | `es_catastro` (replace-in-bbox) | yes |
| `denmark` | DK | `7.70,54.40,15.30,57.90` | osm | `dhm` | **4 cities** (`DHM_CITY_BBOXES`): copenhagen aarhus odense aalborg | — | yes |
| `paris` | FR | `2.22,48.80,2.47,48.91` | osm | — | — | — | yes |
| `lyon` | FR | `4.78,45.70,4.92,45.80` | osm | — | — | — | yes |
| `koln` | DE | `6.85,50.88,7.02,50.99` | osm | `lod2nrw` | the region bbox | — | yes |
| `netherlands` | NL | `3.30,50.75,7.30,53.70` | osm | `3dbag` | **6 cities** (`NL_3DBAG_CITY_BBOXES`): amsterdam rotterdam utrecht thehague eindhoven groningen | — | yes |
| `estonia` | EE | `21.60,57.50,28.30,59.80` | osm | `ee_etak` | **4 cities** (`EE_CITY_BBOXES`): tallinn tartu parnu narva | — | yes |
| `lithuania` | LT | `20.85,53.85,26.90,56.50` | osm | — | — | — | yes |
| `latvia` | LV | `20.90,55.60,28.30,58.10` | osm | — | — | — | yes |
| `poland` | PL | `14.05,48.95,24.20,55.00` | osm | — | — | — | yes |
| `luxembourg` | LU | `5.70,49.40,6.60,50.20` | osm | — | — | — | yes |
| `sweden` | SE | `10.90,55.20,24.20,69.10` | osm | — | — | — | yes |
| `finland` | FI | `19.00,59.70,31.60,70.10` | osm | — | — | — | yes |
| `norway` | NO | `4.50,57.90,31.20,71.20` | osm | `ndh_no` | **3 cities** (`NO_NDH_CITY_BBOXES`): oslo bergen trondheim | — | yes |
| `germany` | DE | `5.85,47.25,15.05,55.10` | osm | `lod2de` | **12 cities** (`DE_LOD2_CITY_BBOXES`): berlin hamburg potsdam kiel erfurt mainz schwerin magdeburg koln hannover dresden stuttgart | — | yes |
| `france` | FR | `-5.15,41.30,9.60,51.10` | osm | `mnh_fr` | **13 cities** (`MNH_FR_CITY_BBOXES`): paris lyon marseille toulouse nice nantes strasbourg montpellier bordeaux rennes grenoble sete lille | `fr_bdtopo` (replace-in-bbox) | yes |
| `italy` | IT | `6.60,35.40,18.60,47.10` | osm | — | — | — | yes |
| `greatbritain` | GB | `-8.20,49.90,1.80,60.90` | osm | `ealidar_gb` | **5 cities** (`EA_LIDAR_GB_CITY_BBOXES`): london manchester birmingham leeds bristol | — | yes |
| `ireland` | IE | `-10.70,51.30,-5.30,55.50` | osm | — | — | — | yes |
| `switzerland` | CH | `5.90,45.80,10.50,47.85` | osm | `swiss` | **9 cities** (`SWISS_CITY_BBOXES`): zurich geneva bern basel lausanne winterthur luzern stgallen lugano | — | yes |
| `austria` | AT | `9.50,46.30,17.20,49.05` | osm | `bev_at` | **5 cities** (`AT_CITY_BBOXES`): vienna graz linz salzburg innsbruck | — | yes |
| `czechia` | CZ | `12.05,48.50,18.90,51.10` | osm | `cuzk_cz` | **5 cities** (`CZ_CITY_BBOXES`): prague brno ostrava plzen olomouc | — | yes |
| `portugal` | PT | `-9.60,36.90,-6.10,42.20` | osm | — | — | — | yes |
| `belgium` | BE | `2.50,49.50,6.40,51.60` | osm | `be_dhmv` | **5 cities** (`BE_CITY_BBOXES`): antwerp ghent brussels leuven bruges | — | yes |
| `croatia` | HR | `13.40,42.30,19.50,46.60` | osm | — | — | — | yes |
| `slovenia` | SI | `13.30,45.40,16.60,46.90` | osm | `gurs_si` | **5 cities** (`SI_CITY_BBOXES`): ljubljana maribor celje kranj koper | — | yes |
| `greece` | GR | `19.30,34.70,29.70,41.80` | osm | — | — | — | yes |
| `hungary` | HU | `16.10,45.70,22.95,48.60` | osm | — | — | — | yes |
| `romania` | RO | `20.20,43.60,29.80,48.30` | osm | — | — | — | yes |
| `slovakia` | SK | `16.80,47.70,22.60,49.65` | osm | — | — | — | yes |
| `bulgaria` | BG | `22.30,41.20,28.70,44.25` | osm | — | — | — | yes |
| `iceland` | IS | `-25.70,62.80,-12.40,67.55` | osm | — | — | — | no |
| `faroeislands` | FO | `-8.70,60.85,-5.50,62.95` | osm | — | — | — | no |
| `malta` | MT | `14.00,35.50,14.90,36.35` | osm | — | — | — | no |
| `cyprus` | CY | `31.95,34.20,35.00,36.05` | osm | — | — | — | no |
| `serbia` | RS | `18.80,42.20,23.05,46.20` | osm | — | — | — | no |
| `bosniaherzegovina` | BA | `15.70,42.55,19.65,45.30` | osm | — | — | — | no |
| `montenegro` | ME | `18.15,41.60,20.40,43.60` | osm | — | — | — | no |
| `northmacedonia` | MK | `20.40,40.80,23.05,42.40` | osm | — | — | — | no |
| `albania` | AL | `18.85,39.60,21.10,42.70` | osm | — | — | — | no |
| `kosovo` | XK | `20.00,41.85,21.80,43.30` | osm | — | — | — | no |
| `ukraine` | UA | `22.10,44.00,40.25,52.40` | osm | — | — | — | no |
| `belarus` | BY | `23.15,51.20,32.80,56.20` | osm | — | — | — | no |
| `moldova` | MD | `26.60,45.45,30.20,48.50` | osm | — | — | — | no |
| `andorra` | AD | `1.40,42.40,1.80,42.70` | osm | — | — | — | no |
| `liechtenstein` | LI | `9.45,47.00,9.65,47.30` | osm | — | — | — | no |
| `channelislands` | JE | `-3.60,49.00,-1.75,50.10` | osm | — | — | — | no |
| `isleofman` | IM | `-5.45,53.70,-3.65,54.70` | osm | — | — | — | no |
| `alabama` | US | `-88.49,29.95,-84.88,35.01` | osm | — | — | — | no |
| `alaska` | US | `-180.00,49.80,-129.79,72.99` | osm | — | — | — | no |
| `alaskaaleutians` | US | `171.76,51.11,180.00,54.20` | osm | — | — | — | no |
| `arizona` | US | `-114.83,31.32,-109.04,37.01` | osm | — | — | — | no |
| `arkansas` | US | `-94.63,33.00,-89.63,36.52` | osm | — | — | — | no |
| `california` | US | `-125.90,32.48,-114.12,42.02` | osm | `us_open` | **3 cities** (`US_OPEN_CITY_BBOXES`): newyork sanfrancisco boston | — | no |
| `colorado` | US | `-109.07,36.98,-102.03,41.01` | osm | — | — | — | no |
| `connecticut` | US | `-73.73,40.96,-71.78,42.06` | osm | — | — | — | no |
| `delaware` | US | `-75.79,38.45,-74.98,39.85` | osm | — | — | — | no |
| `districtofcolumbia` | US | `-77.13,38.79,-76.90,39.00` | osm | — | — | — | no |
| `florida` | US | `-88.47,24.20,-79.43,31.01` | osm | — | — | — | no |
| `georgia` | US | `-85.61,30.35,-80.74,35.01` | osm | — | — | — | no |
| `hawaii` | US | `-179.60,15.92,-142.65,29.03` | osm | — | — | — | no |
| `idaho` | US | `-117.25,41.98,-111.04,49.01` | osm | — | — | — | no |
| `illinois` | US | `-91.52,36.96,-87.49,42.51` | osm | — | — | — | no |
| `indiana` | US | `-88.11,37.76,-84.78,41.77` | osm | — | — | — | no |
| `iowa` | US | `-96.65,40.37,-90.13,43.51` | osm | — | — | — | no |
| `kansas` | US | `-102.06,36.99,-94.58,40.01` | osm | — | — | — | no |
| `kentucky` | US | `-89.59,36.49,-81.95,39.15` | osm | — | — | — | no |
| `louisiana` | US | `-94.05,28.14,-88.66,33.03` | osm | — | — | — | no |
| `maine` | US | `-71.09,42.85,-66.87,47.47` | osm | — | — | — | no |
| `maryland` | US | `-79.49,37.88,-74.95,39.73` | osm | — | — | — | no |
| `massachusetts` | US | `-73.52,40.88,-68.73,42.89` | osm | `us_open` | **3 cities** (`US_OPEN_CITY_BBOXES`): newyork sanfrancisco boston | — | no |
| `michigan` | US | `-90.42,41.69,-82.06,48.36` | osm | — | — | — | no |
| `minnesota` | US | `-97.25,43.49,-89.48,49.41` | osm | — | — | — | no |
| `mississippi` | US | `-91.66,30.04,-88.09,35.01` | osm | — | — | — | no |
| `missouri` | US | `-95.78,35.99,-89.08,40.62` | osm | — | — | — | no |
| `montana` | US | `-116.06,44.35,-104.03,49.01` | osm | — | — | — | no |
| `nebraska` | US | `-104.06,40.00,-95.30,43.01` | osm | — | — | — | no |
| `nevada` | US | `-120.01,35.00,-114.03,42.01` | osm | — | — | — | no |
| `newhampshire` | US | `-72.56,42.69,-70.48,45.32` | osm | — | — | — | no |
| `newjersey` | US | `-75.58,38.75,-73.67,41.36` | osm | — | — | — | no |
| `newmexico` | US | `-109.06,31.33,-102.99,37.01` | osm | — | — | — | no |
| `newyork` | US | `-79.77,40.43,-71.66,45.02` | osm | `us_open` | **3 cities** (`US_OPEN_CITY_BBOXES`): newyork sanfrancisco boston | — | yes |
| `northcarolina` | US | `-84.33,33.12,-73.73,36.59` | osm | — | — | — | no |
| `northdakota` | US | `-104.06,45.93,-96.55,49.02` | osm | — | — | — | no |
| `ohio` | US | `-84.83,38.40,-80.50,42.34` | osm | — | — | — | no |
| `oklahoma` | US | `-103.01,33.61,-94.42,37.01` | osm | — | — | — | no |
| `oregon` | US | `-126.39,41.96,-116.45,46.31` | osm | — | — | — | no |
| `pennsylvania` | US | `-80.53,39.66,-74.68,42.52` | osm | — | — | — | no |
| `puertoricousa` | US | `-68.32,17.51,-65.09,18.82` | osm | — | — | — | no |
| `rhodeisland` | US | `-71.92,40.99,-71.06,42.02` | osm | — | — | — | no |
| `southcarolina` | US | `-83.36,32.02,-78.51,35.22` | osm | — | — | — | no |
| `southdakota` | US | `-104.06,42.47,-96.43,45.95` | osm | — | — | — | no |
| `tennessee` | US | `-90.32,34.98,-81.64,36.69` | osm | — | — | — | no |
| `texas` | US | `-106.65,25.69,-93.01,36.53` | osm | — | — | — | no |
| `usvirginislands` | US | `-65.18,17.28,-63.95,18.49` | osm | — | — | — | no |
| `utah` | US | `-114.06,36.99,-109.03,42.01` | osm | — | — | — | no |
| `vermont` | US | `-73.44,42.72,-71.46,45.03` | osm | — | — | — | no |
| `virginia` | US | `-83.68,36.53,-74.29,39.47` | osm | — | — | — | no |
| `washington` | US | `-126.75,45.53,-116.91,49.01` | osm | — | — | — | no |
| `westvirginia` | US | `-82.65,37.19,-77.71,40.65` | osm | — | — | — | no |
| `wisconsin` | US | `-92.90,42.48,-86.20,47.42` | osm | — | — | — | no |
| `wyoming` | US | `-111.06,40.98,-103.94,45.02` | osm | — | — | — | no |
| `mexico` | MX | `-118.50,14.50,-86.70,32.75` | osm | — | — | — | no |
| `ontario` | CA | `-95.20,41.60,-74.30,56.90` | osm | `ca_open` | **2 cities** (`CA_OPEN_CITY_BBOXES`): vancouver toronto | — | no |
| `quebec` | CA | `-79.90,44.90,-56.90,62.70` | osm | — | — | — | no |
| `britishcolumbia` | CA | `-139.10,48.20,-114.00,60.10` | osm | `ca_open` | **2 cities** (`CA_OPEN_CITY_BBOXES`): vancouver toronto | — | no |
| `alberta` | CA | `-120.10,48.90,-109.90,60.10` | osm | — | — | — | no |
| `saskatchewan` | CA | `-110.10,48.90,-101.30,60.10` | osm | — | — | — | no |
| `manitoba` | CA | `-102.10,48.90,-88.90,60.10` | osm | — | — | — | no |
| `newbrunswick` | CA | `-69.10,44.50,-63.70,48.10` | osm | — | — | — | no |
| `novascotia` | CA | `-66.40,43.30,-59.60,47.10` | osm | — | — | — | no |
| `princeedwardisland` | CA | `-64.50,45.90,-61.90,47.10` | osm | — | — | — | no |
| `newfoundland` | CA | `-67.90,46.50,-52.50,60.50` | osm | — | — | — | no |
| `yukon` | CA | `-141.10,59.90,-123.70,69.70` | osm | — | — | — | no |
| `northwestterritories` | CA | `-136.60,59.90,-101.90,78.90` | osm | — | — | — | no |
| `nunavut` | CA | `-120.80,51.60,-61.00,83.20` | osm | — | — | — | no |
| `newsouthwales` | AU | `141.00,-37.60,153.70,-28.10` | osm | — | — | — | yes |
| `victoria` | AU | `140.90,-39.20,150.05,-33.90` | osm | `au_open` | **1 cities** (`AU_OPEN_CITY_BBOXES`): melbourne | — | yes |
| `queensland` | AU | `138.00,-29.20,153.60,-9.00` | osm | — | — | — | yes |
| `westernaustralia` | AU | `112.90,-35.20,129.00,-13.50` | osm | — | — | — | yes |
| `southaustralia` | AU | `129.00,-38.10,141.05,-25.90` | osm | — | — | — | yes |
| `tasmania` | AU | `143.80,-43.75,148.55,-39.40` | osm | — | — | — | yes |
| `act` | AU | `148.70,-35.95,149.40,-35.10` | osm | — | — | — | yes |
| `northernterritory` | AU | `128.90,-26.10,138.10,-10.90` | osm | — | — | — | yes |
| `newzealand` | NZ | `166.0,-47.5,178.7,-34.3` | osm | — | — | — | no |
| `gccstates` | SA/AE/QA/KW/BH/OM | `34.43,15.24,60.95,32.20` | overture | `ad_ndsm` | **1 cities** (`AD_CITY_BBOXES`): abudhabi-core | — | no |
| `turkey` | TR | `25.52,35.71,44.86,43.08` | osm | — | — | — | no |
| `israel` | IL | `33.99,29.43,35.92,33.46` | osm | — | — | — | no |
| `jordan` | JO | `34.86,29.18,39.32,33.38` | osm | — | — | — | no |
| `lebanon` | LB | `34.76,33.05,36.64,34.81` | osm | — | — | — | no |
| `japan` | JP | `122.9,24.0,153.99,45.6` | osm | `plateau_jp` | **10 cities** (`JP_CITY_BBOXES`): tokyo yokohama osaka nagoya sapporo fukuoka kyoto kobe sendai hiroshima | — | no |

## §3b · Live vs declared — is what a user clicks what the code says?

> ⭐ **A `heightJoin` in §3 describes the CODE. It does not describe the TILES.** A
> region whose live tiles were baked BEFORE its deciding tables last changed is still
> serving the old behaviour, and reading the code alone states a FALSE fact about it.
> That is exactly the Ciudad Real shape: `stampBboxesFor('mds')` returns the whole
> country in the code TODAY, while the tiles a user clicks were baked from the nine
> metros. **A region marked STALE below needs a re-bake, not a code change.**

| Region | Live baked at | Live sha | Live heightJoin | Declared heightJoin | Deciding tables last changed | Verdict |
|---|---|---|---|---|---|---|
| `spain` | 2026-09-03T07:41:29.699Z | `fab79894` | `mds` | `mds` | 2026-09-06T08:18:14.000Z | ⚠ **STALE — re-bake needed** |
| `denmark` | 2026-09-03T08:44:31.106Z | `fab79894` | `dhm` | `dhm` | 2026-08-01T11:40:22.000Z | ✅ current |
| `paris` | 2026-09-03T06:32:20.548Z | `fab79894` | — | — | 2026-07-24T08:39:25.000Z | ✅ current |
| `lyon` | 2026-09-03T06:31:39.087Z | `fab79894` | — | — | 2026-07-24T08:39:25.000Z | ✅ current |
| `koln` | 2026-09-03T06:36:49.214Z | `fab79894` | `lod2nrw` | `lod2nrw` | 2026-07-31T14:30:08.000Z | ✅ current |
| `netherlands` | 2026-09-05T13:20:19.772Z | `4bdd17a4` | `3dbag` | `3dbag` | 2026-09-05T12:27:16.000Z | ✅ current |
| `estonia` | 2026-09-05T13:22:25.294Z | `c7d1ebe6` | `ee_etak` | `ee_etak` | 2026-09-05T12:50:53.000Z | ✅ current |
| `lithuania` | 2026-09-03T06:44:07.513Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `latvia` | 2026-09-03T06:38:20.500Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `poland` | 2026-09-03T07:58:27.131Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `luxembourg` | 2026-09-03T06:32:49.354Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `sweden` | 2026-09-03T07:35:17.718Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `finland` | 2026-09-03T07:28:32.188Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `norway` | 2026-09-05T14:42:41.387Z | `c7d1ebe6` | `ndh_no` | `ndh_no` | 2026-09-05T12:35:02.000Z | ✅ current |
| `germany` | 2026-09-03T08:59:54.422Z | `fab79894` | — | `lod2de` | 2026-09-05T13:19:20.000Z | ⛔ **JOIN DRIFT** — live tiles carry a different join |
| `france` | 2026-09-03T09:49:00.240Z | `fab79894` | — | `mnh_fr` | 2026-09-06T07:40:50.000Z | ⛔ **JOIN DRIFT** — live tiles carry a different join |
| `italy` | 2026-09-03T07:24:00.186Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `greatbritain` | 2026-09-05T15:06:20.477Z | `c7d1ebe6` | `ealidar_gb` | `ealidar_gb` | 2026-09-05T12:36:54.000Z | ✅ current |
| `ireland` | 2026-09-03T06:51:05.456Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `switzerland` | 2026-09-05T11:19:12.279Z | `0afd0316` | `swiss` | `swiss` | 2026-09-05T09:31:19.000Z | ✅ current |
| `austria` | 2026-09-05T13:54:30.032Z | `c7d1ebe6` | `bev_at` | `bev_at` | 2026-09-05T12:55:18.000Z | ✅ current |
| `czechia` | 2026-09-05T14:05:16.517Z | `c7d1ebe6` | `cuzk_cz` | `cuzk_cz` | 2026-09-05T12:55:18.000Z | ✅ current |
| `portugal` | 2026-09-03T06:53:10.547Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `belgium` | 2026-09-05T13:49:35.202Z | `c7d1ebe6` | `be_dhmv` | `be_dhmv` | 2026-09-05T12:50:53.000Z | ✅ current |
| `croatia` | 2026-09-03T06:49:30.460Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `slovenia` | 2026-09-03T06:53:44.987Z | `fab79894` | — | `gurs_si` | 2026-09-05T12:55:18.000Z | ⛔ **JOIN DRIFT** — live tiles carry a different join |
| `greece` | 2026-09-03T07:02:12.366Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `hungary` | 2026-09-03T07:10:58.717Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `romania` | 2026-09-03T07:17:06.927Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `slovakia` | 2026-09-03T07:08:56.122Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `bulgaria` | 2026-09-03T07:07:25.351Z | `fab79894` | — | — | 2026-09-02T06:24:02.000Z | ✅ current |
| `iceland` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `faroeislands` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `malta` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `cyprus` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `serbia` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `bosniaherzegovina` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `montenegro` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `northmacedonia` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `albania` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `kosovo` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `ukraine` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `belarus` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `moldova` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `andorra` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `liechtenstein` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `channelislands` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `isleofman` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `alabama` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `alaska` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `alaskaaleutians` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `arizona` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `arkansas` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `california` | — | — | — | `us_open` | 2026-09-06T10:03:42.000Z | ⛔ **NOT PUBLISHED** |
| `colorado` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `connecticut` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `delaware` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `districtofcolumbia` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `florida` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `georgia` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `hawaii` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `idaho` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `illinois` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `indiana` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `iowa` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `kansas` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `kentucky` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `louisiana` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `maine` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `maryland` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `massachusetts` | — | — | — | `us_open` | 2026-09-06T10:03:54.000Z | ⛔ **NOT PUBLISHED** |
| `michigan` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `minnesota` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `mississippi` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `missouri` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `montana` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `nebraska` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `nevada` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `newhampshire` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `newjersey` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `newmexico` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `newyork` | 2026-09-05T13:19:26.254Z | `c7d1ebe6` | `us_open` | `us_open` | 2026-09-06T10:04:10.000Z | ⚠ **STALE — re-bake needed** |
| `northcarolina` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `northdakota` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `ohio` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `oklahoma` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `oregon` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `pennsylvania` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `puertoricousa` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `rhodeisland` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `southcarolina` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `southdakota` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `tennessee` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `texas` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `usvirginislands` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `utah` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `vermont` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `virginia` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `washington` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `westvirginia` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `wisconsin` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `wyoming` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `mexico` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `ontario` | — | — | — | `ca_open` | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `quebec` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `britishcolumbia` | — | — | — | `ca_open` | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `alberta` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `saskatchewan` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `manitoba` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `newbrunswick` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `novascotia` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `princeedwardisland` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `newfoundland` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `yukon` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `northwestterritories` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `nunavut` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `newsouthwales` | 2026-09-03T07:27:45.590Z | `fab79894` | — | — | 2026-09-03T05:47:36.000Z | ✅ current |
| `victoria` | 2026-09-05T12:43:58.080Z | `d65e1702` | `au_open` | `au_open` | 2026-09-05T12:06:46.000Z | ✅ current |
| `queensland` | 2026-09-03T07:28:02.934Z | `fab79894` | — | — | 2026-09-03T05:47:36.000Z | ✅ current |
| `westernaustralia` | 2026-09-03T07:22:34.196Z | `fab79894` | — | — | 2026-09-03T05:47:36.000Z | ✅ current |
| `southaustralia` | 2026-09-03T07:20:05.979Z | `fab79894` | — | — | 2026-09-03T05:47:36.000Z | ✅ current |
| `tasmania` | 2026-09-03T07:17:45.853Z | `fab79894` | — | — | 2026-09-03T05:47:36.000Z | ✅ current |
| `act` | 2026-09-03T07:20:55.957Z | `fab79894` | — | — | 2026-09-03T05:47:36.000Z | ✅ current |
| `northernterritory` | 2026-09-03T07:23:43.824Z | `fab79894` | — | — | 2026-09-03T05:47:36.000Z | ✅ current |
| `newzealand` | — | — | — | — | 2026-09-05T12:54:44.000Z | ⛔ **NOT PUBLISHED** |
| `gccstates` | — | — | — | `ad_ndsm` | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `turkey` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `israel` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `jordan` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `lebanon` | — | — | — | — | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |
| `japan` | — | — | — | `plateau_jp` | 2026-09-06T09:46:40.000Z | ⛔ **NOT PUBLISHED** |

## §3c · Orphans — regions on R2 that the code no longer has

The reverse of §3, and it is not symmetric: a region the CODE has and R2 lacks is
un-shipped work, while a region R2 has and the CODE lacks is **tiles nobody can
re-bake**. It is what a rename leaves behind (`riyadh` → `gccstates`), and the next
merge — a union of STAGED regions only, with no carry-forward — is where those tiles
quietly stop existing. Named here so the disappearance is a decision, not a surprise.

**9 orphan(s):** `sanfrancisco` · `chicago` · `austin` · `houston` · `boston` · `riyadh` · `jeddah` · `dubai` · `abudhabi`

## §4 · Height working sets — where a "measured height" actually exists

> ⭐ **THE TRAP, STATED ONCE.** A footprint OUTSIDE its region's stamp bboxes streams
> through the join with its original OSM tags and ships an **`assumed`** default
> (9 m). On the map that is **indistinguishable from "the source has no data here"** —
> the failure-vs-empty conflation this repo has re-learned at L-422 / L-457 / L-467 /
> L-469 and, most recently, at Ciudad Real (L-12946). So a `heightJoin` in §3 does NOT
> mean the country has real heights. **This table is where they exist.**

| heightJoin | Working set constant | Scope | Places | Channel | impl | provenance |
|---|---|---|---|---|---|---|
| `mds` | `MDS_NATIONAL_BBOXES` | **WHOLE-COUNTRY** | (derived) | `mds_edificacion` | live | tagged |
| `dhm` | `DHM_CITY_BBOXES` | **CITY LIST (4)** | copenhagen aarhus odense aalborg | — | — | — |
| `lod2nrw` | — (the region bbox) | region bbox | `koln` | `lod2de_nrw` | live | tagged |
| `3dbag` | `NL_3DBAG_CITY_BBOXES` | **CITY LIST (6)** | amsterdam rotterdam utrecht thehague eindhoven groningen | `3dbag` | — | — |
| `ee_etak` | `EE_CITY_BBOXES` | **CITY LIST (4)** | tallinn tartu parnu narva | `eesti3d_ee` | live | tagged |
| `ndh_no` | `NO_NDH_CITY_BBOXES` | **CITY LIST (3)** | oslo bergen trondheim | `ndh_no` | live | tagged |
| `lod2de` | `DE_LOD2_CITY_BBOXES` | **CITY LIST (12)** | berlin hamburg potsdam kiel erfurt mainz schwerin magdeburg koln hannover dresden stuttgart | `lod2de` | documented | tagged |
| `mnh_fr` | `MNH_FR_CITY_BBOXES` | **CITY LIST (13)** | paris lyon marseille toulouse nice nantes strasbourg montpellier bordeaux rennes grenoble sete lille | `mnh_fr` | live | tagged |
| `ealidar_gb` | `EA_LIDAR_GB_CITY_BBOXES` | **CITY LIST (5)** | london manchester birmingham leeds bristol | `ealidar_gb` | live | tagged |
| `swiss` | `SWISS_CITY_BBOXES` | **CITY LIST (9)** | zurich geneva bern basel lausanne winterthur luzern stgallen lugano | `swissbuildings3d` | live | tagged |
| `bev_at` | `AT_CITY_BBOXES` | **CITY LIST (5)** | vienna graz linz salzburg innsbruck | `geoland_at` | documented | tagged |
| `cuzk_cz` | `CZ_CITY_BBOXES` | **CITY LIST (5)** | prague brno ostrava plzen olomouc | `ruian_cz` | documented | derived-levels |
| `be_dhmv` | `BE_CITY_BBOXES` | **CITY LIST (5)** | antwerp ghent brussels leuven bruges | `grb_be` | live | tagged |
| `gurs_si` | `SI_CITY_BBOXES` | **CITY LIST (5)** | ljubljana maribor celje kranj koper | `gurs_si` | documented | tagged |
| `us_open` | `US_OPEN_CITY_BBOXES` | **CITY LIST (3)** | newyork sanfrancisco boston | — | — | — |
| `ca_open` | `CA_OPEN_CITY_BBOXES` | **CITY LIST (2)** | vancouver toronto | `ca_open_elem` | live | tagged |
| `au_open` | `AU_OPEN_CITY_BBOXES` | **CITY LIST (1)** | melbourne | `au_open_lod1` | live | tagged |
| `ad_ndsm` | `AD_CITY_BBOXES` | **CITY LIST (1)** | abudhabi-core | `adsdi_ndsm_ae` | documented | tagged |
| `plateau_jp` | `JP_CITY_BBOXES` | **CITY LIST (10)** | tokyo yokohama osaka nagoya sapporo fukuoka kyoto kobe sendai hiroshima | `plateau_jp` | live | tagged |

Regions with **no** `heightJoin` at all (every building ships the assumed default):

`paris` · `lyon` · `lithuania` · `latvia` · `poland` · `luxembourg` · `sweden` · `finland` · `italy` · `ireland` · `portugal` · `croatia` · `greece` · `hungary` · `romania` · `slovakia` · `bulgaria` · `iceland` · `faroeislands` · `malta` · `cyprus` · `serbia` · `bosniaherzegovina` · `montenegro` · `northmacedonia` · `albania` · `kosovo` · `ukraine` · `belarus` · `moldova` · `andorra` · `liechtenstein` · `channelislands` · `isleofman` · `alabama` · `alaska` · `alaskaaleutians` · `arizona` · `arkansas` · `colorado` · `connecticut` · `delaware` · `districtofcolumbia` · `florida` · `georgia` · `hawaii` · `idaho` · `illinois` · `indiana` · `iowa` · `kansas` · `kentucky` · `louisiana` · `maine` · `maryland` · `michigan` · `minnesota` · `mississippi` · `missouri` · `montana` · `nebraska` · `nevada` · `newhampshire` · `newjersey` · `newmexico` · `northcarolina` · `northdakota` · `ohio` · `oklahoma` · `oregon` · `pennsylvania` · `puertoricousa` · `rhodeisland` · `southcarolina` · `southdakota` · `tennessee` · `texas` · `usvirginislands` · `utah` · `vermont` · `virginia` · `washington` · `westvirginia` · `wisconsin` · `wyoming` · `mexico` · `quebec` · `alberta` · `saskatchewan` · `manitoba` · `newbrunswick` · `novascotia` · `princeedwardisland` · `newfoundland` · `yukon` · `northwestterritories` · `nunavut` · `newsouthwales` · `queensland` · `westernaustralia` · `southaustralia` · `tasmania` · `act` · `northernterritory` · `newzealand` · `turkey` · `israel` · `jordan` · `lebanon`

## §5 · Terrain

`NATIONAL_REGIONS` — **122** whole-region tilesets (Mapterhorn terrarium + per-post EGM2008 lift, z0..10). These are the VISUAL drape; they are never the L-584 legal sampling source.

| Group | Regions | Count |
|---|---|---|
| `europe` | `spain` `denmark` `netherlands` `estonia` `lithuania` `latvia` `poland` `luxembourg` `sweden` `finland` `norway` `germany` `france` `italy` `greatbritain` `ireland` `switzerland` `austria` `czechia` `portugal` `belgium` `croatia` `slovenia` `greece` `hungary` `romania` `slovakia` `bulgaria` `iceland` `faroeislands` `cyprus` `serbia` `bosniaherzegovina` `montenegro` `northmacedonia` `albania` `kosovo` `ukraine` `belarus` | 39 |
| `usa` | `alabama` `alaska` `alaskaaleutians` `arizona` `arkansas` `california` `colorado` `connecticut` `delaware` `districtofcolumbia` `florida` `georgia` `hawaii` `idaho` `illinois` `indiana` `iowa` `kansas` `kentucky` `louisiana` `maine` `maryland` `massachusetts` `michigan` `minnesota` `mississippi` `missouri` `montana` `nebraska` `nevada` `newhampshire` `newjersey` `newmexico` `newyork` `northcarolina` `northdakota` `ohio` `oklahoma` `oregon` `pennsylvania` `puertoricousa` `rhodeisland` `southcarolina` `southdakota` `tennessee` `texas` `usvirginislands` `utah` `vermont` `virginia` `washington` `westvirginia` `wisconsin` `wyoming` | 54 |
| `mexico` | `mexico` | 1 |
| `canada` | `ontario` `quebec` `britishcolumbia` `alberta` `saskatchewan` `manitoba` `newbrunswick` `novascotia` `princeedwardisland` `newfoundland` `yukon` `northwestterritories` `nunavut` | 13 |
| `australia` | `newsouthwales` `victoria` `queensland` `westernaustralia` `southaustralia` `tasmania` `act` `northernterritory` | 8 |
| `middleeast` | `gccstates` `turkey` `israel` `jordan` `lebanon` | 5 |
| `oceania` | `newzealand` | 1 |
| `asia` | `japan` | 1 |

`REGIONS` — **592** per-city tilesets from NATIONAL legal-grade DTM adapters (7 carried BLOCKED with a reason, never silently dropped):

| City | DTM country | Blocked because |
|---|---|---|
| `lisbon` | pt | PT — no open national bare-earth DTM (DGT). See coverage doc. |
| `porto` | pt | PT — no open national bare-earth DTM (DGT). |
| `brussels` | be | BE — region-split; Brussels-Capital DTM route/licence unsourced. |
| `berlin` | de | DE — per-Land; only NRW is sourced. Berlin=Geoportal Berlin DGM1 (separate adapter). |
| `munich` | de | DE — per-Land; only NRW is sourced. Munich=Bayern DGM1 (separate adapter). |
| `riyadh` | sa | SA — no open national DTM (GEOSA). Founder-gated. |
| `jeddah` | sa | SA — no open national DTM (GEOSA). Founder-gated. |

Client attach (`terrainCoverage.ts`): **581** city rows + **122** region rows.

- bakeable terrain cities the client will **NOT** request (baked, never attached → wasted bake): `tallinn` `luxembourgcity` `newyork` `sanfrancisco`
- national regions the client will **NOT** request: **none**

## §6 · Parcels — does a click resolve a real parcel?

`kind: cadastral` means an open keyless register answers here. It only resolves a
click if the **server leg exists** — the `wired` column reads `EU_CADASTRE_SOURCES`
in `server/jurisdiction/euCadastreProxy.js` (or, for Spain, the literal route), so a
row that is declared-but-unrouted cannot read as covered.

| Region code | Country | Provider | kind | Proxy route | Server leg wired |
|---|---|---|---|---|---|
| `PT` | Portugal (Continente) | `dgt-cadastro-predial` | **cadastral** | `/api/parcel/pt` | ✅ yes |
| `ES` | Spain | `catastro` | **cadastral** | `/api/catastro/parcel` | ✅ yes |
| `EE` | Estonia | `ee-maaamet-kataster` | **cadastral** | `/api/parcel/ee` | ✅ yes |
| `HR` | Croatia | `hr-dgu-dkp-cp` | **cadastral** | `/api/parcel/hr` | ✅ yes |
| `LT` | Lithuania | `lt-rc-ntr-parcels-featureserver` | **cadastral** | `/api/parcel/lt` | ✅ yes |
| `PL` | Poland | `pl-gugik-uldk` | **cadastral** | `/api/parcel/pl` | ✅ yes |
| `LU` | Luxembourg | `lu-act-inspire-cp` | **cadastral** | `/api/parcel/lu` | ✅ yes |
| `SE` | Sweden | `se-lantmateriet-fastighetsindelning` | footprint-fallback | — | n/a |
| `SI` | Slovenia | `si-gurs-kn-parcele` | **cadastral** | `/api/parcel/si` | ✅ yes |
| `HU` | Hungary | `hu-lechner-inspire-cp` | footprint-fallback | — | n/a |
| `LV` | Latvia | `lv-vzd-kadastrs-geolatvija` | **cadastral** | `/api/parcel/lv` | ✅ yes |
| `RO` | Romania | `ancpi-eterra3` | footprint-fallback | — | n/a |
| `GR` | Greece | `gr-ktimatologio-geotemaxia-leitourgoun` | **cadastral** | `/api/parcel/gr` | ✅ yes |
| `BG` | Bulgaria | `bg-gcca-inspire-cadastral-parcel` | **cadastral** | `/api/parcel/bg` | ✅ yes |
| `SK` | Slovakia | `sk-ugkk-eskn-kn-parcela-c` | **cadastral** | `/api/parcel/sk` | ✅ yes |
| `BE-BRU` | Belgium (Brussels-Capital Region) | `brussels-cadastre` | footprint-fallback | — | n/a |
| `BE-VLG` | Belgium (Flemish Region) | `flanders-grb` | **cadastral** | `/api/parcel/be-vlg` | ✅ yes |
| `BE-WAL` | Belgium (Walloon Region) | `wallonia-cadastre` | footprint-fallback | — | n/a |
| `CZ` | Czechia | `cz-cuzk-inspire-cp` | **cadastral** | `/api/parcel/cz` | ✅ yes |
| `IE` | Ireland | `ie-tailte-eireann-freehold` | **cadastral** | `/api/parcel/ie` | ✅ yes |
| `AT` | Austria | `at-bev-inspire-cp` | **cadastral** | `/api/parcel/at` | ✅ yes |
| `GB-ENG` | United Kingdom (England) | `gb-os-inspire` | **cadastral** | `/api/parcel/gb` | ✅ yes |
| `GB-SCT` | United Kingdom (Scotland) | `gb-sct-ros` | footprint-fallback | — | n/a |
| `FI` | Finland | `mml` | footprint-fallback | — | n/a |
| `US-NY-NYC` | United States (New York City) | `nyc-pluto` | **cadastral** | `/api/parcel/us-nyc` | ✅ yes |
| `US-CA-SF` | United States (San Francisco) | `sf-datasf` | **cadastral** | `/api/parcel/us-sf` | ✅ yes |
| `US-IL-CHI` | United States (Chicago / Cook County) | `chicago-cook` | **cadastral** | `/api/parcel/us-chi` | ✅ yes |
| `US-MA` | United States (Massachusetts · statewide) | `us-ma-massgis-l3` | **cadastral** | `/api/parcel/us-ma` | ✅ yes |
| `US-FL` | United States (Florida · statewide) | `us-fl-fdor-cadastral` | **cadastral** | `/api/parcel/us-fl` | ✅ yes |
| `US-WA-KING` | United States (King County, WA · Seattle metro) | `us-wa-king-parcels` | **cadastral** | `/api/parcel/us-wa-king` | ✅ yes |
| `US-TX-HARRIS` | United States (Harris County, TX · Houston metro) | `us-tx-harris-hcad` | **cadastral** | `/api/parcel/us-tx-harris` | ✅ yes |
| `US-NC` | United States (North Carolina · statewide) | `us-nc-onemap-parcels` | **cadastral** | `/api/parcel/us-nc` | ✅ yes |
| `US-NY` | United States (New York State · 38 of 62 counties) | `us-ny-nysgis-taxparcels` | **cadastral** | `/api/parcel/us-ny` | ✅ yes |
| `US-OH` | United States (Ohio · statewide) | `us-oh-odnr-statewide-parcels` | **cadastral** | `/api/parcel/us-oh` | ✅ yes |
| `US-WI` | United States (Wisconsin · statewide) | `us-wi-doa-statewide-parcels` | **cadastral** | `/api/parcel/us-wi` | ✅ yes |
| `US-MT` | United States (Montana · statewide) | `us-mt-msl-cadastral` | **cadastral** | `/api/parcel/us-mt` | ✅ yes |
| `US-UT` | United States (Utah · statewide) | `us-ut-ugrc-parcels` | **cadastral** | `/api/parcel/us-ut` | ✅ yes |
| `US-VA` | United States (Virginia · 94 counties + 38 cities) | `us-va-vgin-parcels` | **cadastral** | `/api/parcel/us-va` | ✅ yes |
| `US-CA-LA` | United States (Los Angeles County, CA) | `us-ca-la-county-parcels` | **cadastral** | `/api/parcel/us-ca-la` | ✅ yes |
| `US-AZ-MARICOPA` | United States (Maricopa County, AZ · Phoenix metro) | `us-az-maricopa-parcels` | **cadastral** | `/api/parcel/us-az-maricopa` | ✅ yes |
| `AU-ACT` | Australia (Australian Capital Territory) | `au-act-actmapi-blocks` | **cadastral** | `/api/parcel/au-act` | ✅ yes |
| `AU-TAS` | Australia (Tasmania) | `au-tas-thelist-cadastre` | **cadastral** | `/api/parcel/au-tas` | ✅ yes |
| `AU-VIC` | Australia (Victoria) | `au-vic-vicmap-cadastre` | **cadastral** | `/api/parcel/au-vic` | ✅ yes |
| `AU-NSW` | Australia (New South Wales) | `au-nsw-dcs-cadastre` | **cadastral** | `/api/parcel/au-nsw` | ✅ yes |
| `AU-SA` | Australia (South Australia) | `au-sa-sappa-cadastre` | **cadastral** | `/api/parcel/au-sa` | ✅ yes |
| `AU-QLD` | Australia (Queensland) | `au-qld-qspatial-cadastre` | **cadastral** | `/api/parcel/au-qld` | ✅ yes |
| `AU-WA` | Australia (Western Australia) | `footprint` | footprint-fallback | — | n/a |
| `AU-NT` | Australia (Northern Territory) | `footprint` | footprint-fallback | — | n/a |
| `FR` | France | `ign-fr` | **cadastral** | `/api/parcel/fr` | ✅ yes |
| `DE-BW` | Germany (Baden-Württemberg) | `alkis-bw` | **cadastral** | `/api/parcel/de-bw` | ✅ yes |
| `DE-HE` | Germany (Hessen) | `alkis-he` | **cadastral** | `/api/parcel/de-he` | ✅ yes |
| `DE-NI` | Germany (Niedersachsen) | `alkis-ni` | **cadastral** | `/api/parcel/de-ni` | ✅ yes |
| `DE-SN` | Germany (Sachsen) | `alkis-sn` | **cadastral** | `/api/parcel/de-sn` | ✅ yes |
| `DE-SH` | Germany (Schleswig-Holstein) | `alkis-sh` | **cadastral** | `/api/parcel/de-sh` | ✅ yes |
| `DE-BB` | Germany (Brandenburg) | `alkis-bb` | **cadastral** | `/api/parcel/de-bb` | ✅ yes |
| `DE-ST` | Germany (Sachsen-Anhalt) | `alkis-st` | **cadastral** | `/api/parcel/de-st` | ✅ yes |
| `DE-MV` | Germany (Mecklenburg-Vorpommern) | `alkis-mv` | **cadastral** | `/api/parcel/de-mv` | ✅ yes |
| `DE-SL` | Germany (Saarland) | `alkis-sl` | **cadastral** | `/api/parcel/de-sl` | ✅ yes |
| `DE-HH` | Germany (Hamburg) | `alkis-hh` | **cadastral** | `/api/parcel/de-hh` | ✅ yes |
| `DE-RP` | Germany (Rheinland-Pfalz) | `alkis-rp` | **cadastral** | `/api/parcel/de-rp` | ✅ yes |
| `DE-TH` | Germany (Thüringen) | `alkis-th` | **cadastral** | `/api/parcel/de-th` | ✅ yes |
| `DE-HB` | Germany (Bremen) | `alkis-hb` | **cadastral** | `/api/parcel/de-hb` | ✅ yes |
| `DE-BE` | Germany (Berlin) | `alkis-be` | **cadastral** | `/api/parcel/de-be` | ✅ yes |
| `DE-NW` | Germany (North Rhine-Westphalia) | `alkis-nrw` | **cadastral** | `/api/parcel/de-nrw` | ✅ yes |
| `NL` | Netherlands | `pdok-nl` | **cadastral** | `/api/parcel/nl` | ✅ yes |
| `NO` | Norway | `geonorge-no` | **cadastral** | `/api/parcel/no` | ✅ yes |
| `CH` | Switzerland | `swisstopo-av` | **cadastral** | `/api/parcel/ch` | ✅ yes |
| `IT` | Italy | `agenzia-entrate` | **cadastral** | `/api/parcel/it` | ✅ yes |
| `DE` | Germany (other Länder) | `footprint` | footprint-fallback | — | n/a |
| `DK` | Denmark | `matrikel-dk` | **cadastral** | `/api/parcel/dk` | ✅ yes |
| `NZ` | New Zealand | `nz-linz-primary-parcels` | **cadastral** | `/api/parcel/nz` | ✅ yes |
| `TR` | Turkey | `tr-tkgm-parsel` | **cadastral** | `/api/parcel/tr` | ✅ yes |
| `IL` | Israel | `il-govmap-parcel-all` | footprint-fallback | — | n/a |
| `QA` | Qatar | `qa-gisqatar-cadastre-plots` | **cadastral** | `/api/parcel/qa` | ✅ yes |
| `AE` | United Arab Emirates | `footprint` | footprint-fallback | — | n/a |
| `KW` | Kuwait | `footprint` | footprint-fallback | — | n/a |
| `BH` | Bahrain | `footprint` | footprint-fallback | — | n/a |
| `OM` | Oman | `footprint` | footprint-fallback | — | n/a |
| `SA` | Saudi Arabia | `footprint` | footprint-fallback | — | n/a |

## §7 · Named absences and the founder watchlist

A quiet omission and a refusal are different claims (C57 §1.9), so every country with
**no row in any table** is listed here by name rather than left off the page.

**ABSENT (0)** — no `bake.mjs` region, no `terrain.mjs` region, no parcel jurisdiction:

- (none)

**Founder watchlist** — the countries named in "extend everything to Japan, Mexico,
Canada". Reported whatever their state, so the answer is never inferred from silence:

- **Japan (JP)** — **PARTIAL** · context baked but NOT in the live tileset: japan · measured heights only inside 10 box(es) [tokyo yokohama osaka nagoya sapporo fukuoka kyoto kobe sendai hiroshima] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Mexico (MX)** — **PARTIAL** · context baked but NOT in the live tileset: mexico · NO measured height join — every building ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)
- **Canada (CA)** — **PARTIAL** · context baked but NOT in the live tileset: ontario, quebec, britishcolumbia, alberta, saskatchewan, manitoba, newbrunswick, novascotia, princeedwardisland, newfoundland, yukon, northwestterritories, nunavut · terrain is 13 × province/territory (`ontario quebec britishcolumbia alberta saskatchewan manitoba newbrunswick novascotia princeedwardisland newfoundland yukon northwestterritories nunavut`), NOT the country · measured heights only inside 2 box(es) [vancouver toronto] — everywhere else ships the assumed default · no cadastral parcel row (click falls to the OSM footprint)

---

Regenerate: `node tools/coverage-ledger/build.mjs` · pinned by
`tools/context-bake/__tests__/worldCoverageLedger.spec.ts` (a `bake.mjs` region that is
missing from this page fails CI).
