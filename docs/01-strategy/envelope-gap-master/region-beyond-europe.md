# Envelope Gap Master — REGION: BEYOND EUROPE

> **Scope:** the jurisdictions PRYZM serves outside Europe — **UAE (Dubai · Abu Dhabi)**,
> the **US metros** (New York · San Francisco · Chicago · the MassGIS / Texas expansion), and
> **Australia per state** (NSW · VIC · QLD · WA · SA · TAS · ACT · NT), plus the Middle-East
> **context trio Turkey · Israel · Qatar** and the inherited **Saudi Arabia** background row.
> **Vocabulary is the founder's own:** the 33 attributes A1–F8 and the irreducible 8-field core
> (`STR-ENVELOPE-PARAMETER-REFERENCE.md`); the Ω/P/V slots, paths P1–P5 / V1–V6 and Sufficiency
> Legends L0–L7 (`STR-ENVELOPE-SUFFICIENCY-LEGENDS.md`); the consume-before-compute source
> hierarchy P1–P6 and the three envelope-information **Types A / B / C**
> (`STR-EUROPEAN-ENVELOPE-SOURCES.md` §8/§9).
> **This is a read-only synthesis** of already-probed evidence. Every claim cites its source file.

---

## 0 · Orientation — read this before the per-jurisdiction blocks

**Where the evidence lives.** The pan-European `audit/envelope-geometry-census/2026-09-02/CENSUS.md`
is **Europe-only by construction** — 44 rows, zero beyond-Europe (its own mandate is
`STR-EUROPEAN-ENVELOPE-SOURCES.md` §10, "*Across Europe…*"). The census-equivalent for THIS region
is the two probe sweeps that explicitly apply the same method, honesty rules and verdict vocabulary:

- **`audit/geo-expansion/2026-09-02/au-sweep.md`** — Australia, all 8 states/territories, every
  channel PROBED live 2026-09-02 (transcripts in `transcripts-au/`).
- **`audit/geo-expansion/2026-09-02/me-sweep.md`** — the Middle East (SA · AE-Dubai · AE-AbuDhabi ·
  QA · KW · BH · OM · IL · JO · TR · EG), PROBED live 2026-09-02.
- The two **implementation lanes** that wired the parcel channels 2026-09-03:
  `audit/intl-parcels/2026-09-02/lane-us-expand.md`, `…/lane-au-open.md`, `…/lane-me-open.md`.
- The **context/terrain** lane: `audit/geo-expansion/2026-09-02/lane-context-intl.md`.

**The census verdict ladder (CENSUS.md HEADLINE), applied here:**
**CONSUME-GEOMETRY (Type A)** > **COMPILE-PARAMETERS (Type B)** > **STRUCTURED-RULES** >
**DOCUMENTS-ONLY (F-extraction)** > **OPAQUE / GATED**.

### ⭐ THE HEADLINE — the cheapest envelopes on the planet are in this region, not in Europe

The Europe E5 reuse verdict (memory `europe-e5-reuse-verdict`, 21/21 countries) was that the
development-potential envelope is **state-served NOWHERE in Europe** — every European path is
zone-polygon + document extraction. **Two Australian states refute that pattern outright**
(au-sweep, THE HEADLINE + §10):

- **South Australia** serves, as spatial data layers, **Maximum Building Height (metres), Maximum
  Building Height (levels), Minimum Primary/Side/Rear Setback, Site Coverage, Minimum Frontage,
  Minimum Site Area — and a dedicated "Building Envelope" layer** (au-sweep §5.2). That is
  **Type B parameters AND Type A geometry served together** — the single richest buildable-envelope
  jurisdiction found in any sweep, Europe included.
- **New South Wales** serves **Height of Building (m) and Floor Space Ratio** as polygon attributes
  with the legislative clause attached (`MAX_B_H_M: 22.0`, `FSR: 3.5`, au-sweep §1.2) — the exact
  **Type B** class the founder names ("*max height/floors/coverage as data — DK, NSW*",
  `STR-EUROPEAN-ENVELOPE-SOURCES.md` §8).
- **US: New York is NSW-class too.** MapPLUTO already serves **ResidFAR / CommFAR / FacilFAR +
  ZoneDist1 + LotArea** as tax-lot attributes (registry.ts US-NY-NYC row) — the D1 yield served as
  data, exactly the founder's ⭐ note that some US zoning serves FAR as data.

### The honesty posture — what is TRUE today, region-wide

1. **No envelope rule pack draws anything beyond Europe yet.** A grep of
   `packages/site-parcel-data/src/rulepacks/` returns only ES/DK/NL/PL/CH packs + one Saudi *demo*
   (`saRiyadhDemo.ts`). So the **envelope STATUS for every jurisdiction below is `NO COVERAGE YET`** —
   the differences are entirely in *how far* each is from a drawn envelope, which is what the LEGEND,
   the gap list and the EFFORT capture.
2. **Parcels are probe-verified but the server proxies are mostly unwired.** The `registry.ts` rows
   and package parsers exist and are tested (US-EXPAND 28 tests, AU-OPEN 31, ME-OPEN 47), but
   `/api/parcel/*` proxy seats are **not yet wired server-side** → in the live editor a click today
   **falls to the OSM footprint**, never a fabricated parcel (lane-us-expand "Proxy state";
   lane-au-open §6; lane-me-open "Honesty / deferrals"). Wiring each proxy is a server change.
3. **Context (LoD200 + terrain) is ready as a substrate, not as heights.** 14 new `bake.mjs` region
   rows exist uncommitted (US metros, 8 AU states, Dubai + Abu Dhabi); **no row declares a height
   join** — honest OSM/Overture assumed heights, the measured-height build named as owed
   (lane-context-intl §1). Mapterhorn terrain is planet-wide and ADOPTED → **terrain rendering is a
   blocker nowhere**; only the per-city datum-lift constant (A2) is per-jurisdiction work
   (lane-context-intl §4).
4. **UNKNOWN ≠ absent ≠ zero.** Several Gulf verdicts are *vantage* findings (all probes ran from a
   French IP). A network block is reported as a gate to re-probe in-region, never as "no data"
   (me-sweep VANTAGE preamble).

---

# REGION: UNITED ARAB EMIRATES (emirate competency)

Cadastre and planning are **emirate** competencies in the UAE — there is no federal cadastre. Both
named emirates are, from our vantage, a **network / identity problem, not a data-absence problem**
(me-sweep §14). Context bakes fine regardless (Overture buildings on the shared `gcc-states` extract),
exactly the Saudi precedent that a geo-fenced parcel channel must not delete the context row
(lane-context-intl §1, §BAKE-AE-METROS).

### Dubai
- **STATUS TODAY:** **NO COVERAGE YET** — envelope undrawn; **parcels + zoning BLOCKED(vantage)**:
  every Dubai data host (dubaipulse.gov.ae, geodubai.dm.gov.ae, gis.dm.gov.ae) **TCP-timed-out** to
  our probe while the CDN-fronted corporate site answered in 0.8 s — same fence shape as L-606-era
  Balady (me-sweep §2). Cannot distinguish geo-fence from outage from one vantage.
- **LEGEND:** **indeterminate** — no channel reached, so the ordering type (C1) is unresolved and no
  legend can be selected (Decision Procedure step 3, `STR-ENVELOPE-SUFFICIENCY-LEGENDS.md` §A.7).
  Dubai 2040 / DM zoning is document-class (Europe **Type C**, F-extraction) *once a channel opens*.
- **WHAT WE ALREADY HAVE:**
  - Parcel source: **none reachable** — Dubai Pulse `dm-gis` parcel datasets sit behind account-login
    classes that are **UNKNOWN (unreachable, not absent)** (me-sweep §2).
  - Zone-identity source: same unreachable hosts → **UNKNOWN(vantage)**.
  - Context/heights: **`dubai` bake row exists** (uncommitted) — Overture buildings on `gcc-states`,
    honest assumed heights, **no height join** (data hosts blocked); datum `UAE local
    (UNVERIFIED-DOC)`, EGM2008 lift **−34.13 m** for the Mapterhorn visual terrain (lane-context-intl
    §1 §4). Terrain not a blocker.
  - Published envelope parameters/geometry: **none observed** (channel never reached).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Re-probe the four data hosts from an in-UAE / GCC vantage** — the named disambiguation probe
    (me-sweep §2). `FOUNDER` (decide to run an in-region probe session) / `DATA`.
  - **A reachable parcel channel** — either the in-region vantage proves Dubai Pulse open, or a **DM
    GIS / Dubai Pulse data agreement** (credential class unmeasured). `DATA` / `FOUNDER`.
  - **Extract the DM zoning / Dubai 2040 numeric controls** (FAR / height / setback) from the
    regulation documents once the zoning GIS is reachable — Europe **Type C / F-extraction**. `US`.
  - **Verify the UAE local vertical datum** for A2 (me-sweep §13, currently UNVERIFIED-DOC). `US`/`DATA`.
  - **A Dubai OSM-vs-Overture building count probe** before trusting context density (lane-context-intl §5). `US`.
- **EFFORT:** **blocked until an in-region probe** — days of research once reachable, then weeks of
  F-extraction. **The ONE unblock: a single in-region (or VPN/proxy) probe session** that settles
  whether the block is a geo-fence or a login gate; nothing downstream can start without it.

### Abu Dhabi
- **STATUS TODAY:** **NO COVERAGE YET** — envelope undrawn; **parcels GATED(WAF)**: `data.abudhabi`
  serves the human UI but an **F5 BIG-IP WAF rejects every machine path** (`data.json`, DKAN search,
  metastore) with "Request Rejected"; the legacy AD-SDI hostnames (geoportal.dmt.gov.ae,
  sdi.gsec.abudhabi, …) are all **NXDOMAIN** (me-sweep §3).
- **LEGEND:** **indeterminate** — no served envelope reached; numeric controls are document-class
  (Type C / F) once the API is unblocked.
- **WHAT WE ALREADY HAVE:**
  - Parcel source: **catalogue exists, API layer WAF-fenced** — the open-data portal is up, its
    machine endpoints refuse our vantage; Abu Dhabi services generally sit behind **UAE PASS**
    (Emirates-ID national identity), the expected gate, **unmeasured this session** (me-sweep §3).
  - Zone-identity source: **UNKNOWN**.
  - Context/heights: **`abudhabi` bake row exists** — Overture on `gcc-states`, assumed heights, no
    height join; EGM2008 lift **−33.20 m**, `ae` datum drop-in ready (lane-context-intl §4.1 bullet 3).
  - Published envelope parameters/geometry: **none observed**.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Re-probe `data.json` + the DKAN API from an in-UAE vantage, then read the dataset licences**
    (named probe, me-sweep §3). `FOUNDER`/`DATA`.
  - **A UAE PASS credential or a DMT / AD open-data data agreement** to reach the parcel + zoning
    layers behind the WAF. `DATA`/`FOUNDER`.
  - **Extract the Abu Dhabi (DMT) numeric planning controls** from the regulations — Type C / F. `US`.
  - **Verify the Abu Dhabi local vertical datum** (A2). `US`/`DATA`.
- **EFFORT:** **blocked until an in-region probe / UAE PASS**; then days to wire the parcel channel,
  weeks for the rules. **The ONE unblock: an in-region probe of the DKAN API + a UAE-PASS reachability
  test** — the catalogue demonstrably exists, so this is an access problem, not a discovery one.

---

# REGION: UNITED STATES (per-state / per-metro; zoning is municipal)

There is no national US cadastre or zoning scheme — the registry deliberately routes US points by
per-jurisdiction bbox (`US-<STATE>[-<COUNTY>]`), *not* through the national resolver
(lane-us-expand "Routing"). **Seven US parcel jurisdictions are wired and probe-verified live**
(2026-09-03); envelope RULES are municipal everywhere and served as data only for FAR in a few cities.
Context: 6 metro bake rows (NY · SF · Chicago · Boston · Austin · Houston), OSM buildings, no height
join, owed USGS 3DEP nDSM stamp (lane-context-intl §1).

### New York (New York City) — ⭐ NSW-class: FAR served as DATA
- **STATUS TODAY:** **NO COVERAGE YET** (envelope undrawn) — but the **parcel channel is live and the
  yield parameter is data-served**: MapPLUTO (NYC DCP) serves the tax-lot BBL polygon + **ZoneDist1 +
  ResidFAR / CommFAR / FacilFAR + LotArea**, keyless (registry.ts US-NY-NYC). ⚠ proxy
  `/api/parcel/us-nyc` **not yet wired** → OSM footprint until then.
- **LEGEND:** **L4 — Shaped**, with the **D1 yield served as Type B data.** NYC massing is a
  **sky-exposure-plane + setback** regime (a C6 shaping operator — the founder names "New York's sky
  exposure plane" explicitly, `STR-ENVELOPE-PARAMETER-REFERENCE.md` C6) trimmed by the FAR the lot
  already carries. So V/P fall out of a shaping operator (path V6/P5), and D1 is a lookup we already
  hold.
- **WHAT WE ALREADY HAVE:**
  - Parcel source: **MapPLUTO BBL FeatureServer, keyless** (registry.ts) — probe owed to confirm the
    ArcGIS path before prod.
  - Zone-identity (B2): **`ZoneDist1` served inline** as a lot attribute.
  - Yield (D1): **ResidFAR / CommFAR / FacilFAR served inline** — Type B, the strongest US case.
  - Context/heights: `newyork` bake row exists; **NYC open building-heights** channel is the owed
    3DEP-nDSM join source (lane-context-intl §1); datum NAVD88 / GEOID18, EGM2008 lift −32.72 m (§4).
  - Published envelope geometry: none (the massing is derived, not published).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire the `/api/parcel/us-nyc` proxy** so the served FAR/zone reach the editor. `US`.
  - **The L4 shaping engine** (sky-exposure-plane as a height-field min-of-planes) — this is the
    K1+S1 in-flight shaping pair (`geometry/inclinedTop.ts` + `evaluateHeightProportionalOffset.ts`,
    RECONCILIATION L4 row); NYC is a first non-European consumer of it. `US`.
  - **Extract the NYC Zoning Resolution district bulk table** (sky-exposure-plane angles, initial
    setback, height-factor / QGA parameters, base/max height per district) keyed by `ZoneDist1` —
    Europe **Type C / F-extraction** with a perfect join key. `US`.
  - **Resolve the height datum (A2)** to NYC's base-plane rule. `US`.
- **EFFORT:** **weeks** to a real NYC envelope — FAR is free (served), the work is the shaping engine
  (already in-flight) + the ZR district-table extraction. **The ONE unblock: land the L4 shaping
  engine and consume the served FAR** — NYC is the highest-value US envelope because half the yield
  math is already Type B data.

### San Francisco
- **STATUS TODAY:** **NO COVERAGE YET** — parcel channel **VERIFIED-LIVE** (DataSF assessor parcels,
  Socrata `acdm-wktn`, real `blklot` under the click, WGS84 MultiPolygon; the probe also corrected the
  geometry column to `shape`, registry.ts US-CA-SF). Zoning district (e.g. `RH-2`) rides on the row as
  a draft lead only.
- **LEGEND:** **L3 / L4** — SF governs by **height-and-bulk district, NOT a citywide FAR** (ADR-0270);
  V is a mapped district height + bulk plane, P from setback/rear-yard rules.
- **WHAT WE ALREADY HAVE:** parcel source DataSF (keyless, live); zone-identity `zoning_code /
  zoning_district` inline (draft lead); context `sanfrancisco` bake row, NAVD88/GEOID18, lift −32.16 m
  (lane-context-intl §4). **No FAR is ever emitted** (correct — SF has none, ADR-0270).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/us-sf`** proxy. `US`.
  - **Extract the SF Planning Code height-and-bulk district table** (district → height limit + bulk
    plane) keyed by the served district — Type C / F. `US`.
  - **A rear-yard / setback rule** per district for P. `US`.
  - Datum A2 to the SF base plane. `US`.
- **EFFORT:** **weeks** — one Planning Code extraction covers every district. **ONE unblock: the
  height-and-bulk district-table extraction** (there is no served number to consume here, unlike NYC).

### Chicago
- **STATUS TODAY:** **NO COVERAGE YET** — parcel channel **VERIFIED-LIVE** but only after routing
  around both documented-dead endpoints to the working Cook County Socrata (`77tz-riq7`, real 10-digit
  PIN, WGS84 MultiPolygon); zoning companion `dj47-wfun` (registry.ts US-IL-CHI). Zoning is a draft
  lead only.
- **LEGEND:** **L3 / L4** — Chicago's FAR + height live in the Zoning Ordinance; downtown D districts
  add FAR bonuses (a D3-style rule). Ordering is free-standing-ratio + a bonus rule set (C6/D3).
- **WHAT WE ALREADY HAVE:** parcel source Cook County Socrata (keyless, live, PIN id); zone-identity
  via `dj47-wfun`; context `chicago` bake row, **Chicago open footprints** as the owed 3DEP stamp
  source, NAVD88/GEOID18, lift −33.93 m (lane-context-intl §1 §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/us-chi`** + a live-path fix (the documented ArcGIS endpoint is dead). `US`.
  - **Extract the Chicago Zoning Ordinance** FAR + height + setback per zone class, plus the downtown
    FAR-bonus (D3) rules — Type C / F. `US`.
  - Datum A2. `US`.
- **EFFORT:** **weeks** — one ordinance extraction. **ONE unblock: the Zoning Ordinance FAR/height
  table** keyed to the served zone class.

### Massachusetts (MassGIS — statewide) — the strongest open US parcel fabric
- **STATUS TODAY:** **NO COVERAGE YET** (envelope) — but **parcels are statewide and VERIFIED-LIVE**:
  MassGIS L3 Standardized Parcels, one keyless FeatureServer **already in EPSG:4326**, `LOC_ID`
  statewide-unique, every in-state click resolves (lane-us-expand "MassGIS is the standout";
  registry.ts US-MA).
- **LEGEND:** **L3**, but **per-municipality** — MA zoning is municipal under **Ch. 40A** (351
  towns/cities, each its own bylaw). The statewide fabric fills Ω everywhere; P/V are municipal.
- **WHAT WE ALREADY HAVE:** parcel source MassGIS L3 **statewide** (CC, keyless); assessor context
  (`USE_CODE`, `SITE_ADDR`, FY value) inline as optional context; context `boston` bake row, **Boston
  MassGIS** as the owed 3DEP stamp source, NAVD88/GEOID18, lift −28.58 m (lane-context-intl §1 §4).
  **Zoning/FAR never inferred** (municipal).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/us-ma`** proxy. `US`.
  - **Extract per-municipality Ch. 40A dimensional tables** (height, setbacks, lot coverage, FAR where
    a town uses one) — a **large F-extraction surface (351 bylaws)**; pick metros (Boston, Cambridge,
    Worcester) first. `US`.
  - Some towns publish a **zoning-district GIS layer** — check for served zone geometry (Type A) before
    extracting each bylaw (the cheap-win probe). `US`/`DATA`.
  - Datum A2. `US`.
- **EFFORT:** **days per municipality after the first**; the statewide parcel base is free. **ONE
  unblock: a per-town Ch. 40A dimensional-table extractor** aimed at the top metros — the parcel
  substrate is already the best in the US.

### Florida (FDOR — statewide) — a second statewide fabric
- **STATUS TODAY:** **NO COVERAGE YET** (envelope) — **parcels statewide, VERIFIED-LIVE**: FDOR
  Statewide Cadastral (FGIO/DOR annual NAL join), keyless, `PARCEL_ID` under the click.
  ⚠ the hosted service **requires JSON point geometry** (a bare `x,y` string 400s) — the proxy must
  emit JSON (lane-us-expand "Florida"; registry.ts US-FL).
- **LEGEND:** **L3**, per-municipality (FL bulk/height is municipal).
- **WHAT WE ALREADY HAVE:** parcel source FDOR **statewide** (keyless, native EPSG:3086); no FL metro
  bake row yet (Tampa/Miami not in the 6 metros baked). Zoning/height municipal.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/us-fl`** (JSON-geometry proxy). `US`.
  - **Extract per-municipality zoning bulk** (Miami's Miami 21 form-based code, Tampa, Orlando) — Type
    C / F. `US`.
  - **Add FL metro context bake rows** (Miami/Tampa) — not yet baked. `US`.
  - Datum A2 (NAVD88/GEOID18). `US`.
- **EFFORT:** **days per city**; statewide parcels free. **ONE unblock: pick the launch city (Miami is
  the obvious one) and extract its form-based code.**

### Washington — King County (Seattle metro)
- **STATUS TODAY:** **NO COVERAGE YET** — parcel channel **VERIFIED-LIVE**, county-scoped: King County
  Parcels (geometry + `PIN` only; assessor data is a separate layer), keyless. Honestly scoped
  `US-WA-KING`, **not** `US-WA` — a Spokane click falls to the footprint (lane-us-expand "Washington";
  registry.ts US-WA-KING).
- **LEGEND:** **L3** — Seattle zoning (NC/LR/MR/HR + downtown) is FAR + height + setback in the Land
  Use Code.
- **WHAT WE ALREADY HAVE:** parcel source King County (keyless, PIN); no Seattle context bake row yet.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/us-wa-king`.** `US`.
  - **Extract the Seattle Land Use Code** zone dimensional table (FAR/height/setback), + the separate
    zoning-district GIS if Seattle serves one (Type A probe). `US`/`DATA`.
  - Seattle context bake row; datum A2. `US`.
- **EFFORT:** **days–weeks** for Seattle; the parcel base is one county. **ONE unblock: the Seattle
  Land Use Code extraction** (King County has rich open GIS — check for a served zoning layer first).

### Texas — Harris County (Houston) + the Austin note
- **STATUS TODAY:** **NO COVERAGE YET** — parcel channel **VERIFIED-LIVE**, county-scoped: Harris
  County / HCAD (native State-Plane feet EPSG:2278, rich attributes), keyless (registry.ts
  US-TX-HARRIS). **Houston is special: it has NO zoning at all.**
- **LEGEND:** **no envelope instrument exists** — the L7-adjacent case, but by **absence** of zoning,
  not by discretion. The honest deliverable is **not a single number**: bulk is governed by private
  deed restrictions + the city's Chapter 42 development ordinance (minimum lot size, setbacks,
  parking) — so at most a **footprint from Chapter 42 setbacks with the vertical extent explicitly
  unresolved** (degradation ladder A.5, "footprint derived; vertical extent unresolved"), or a
  **cited refusal** ("no height/FAR instrument; deed-restriction governed"). Never a fabricated cap.
- **WHAT WE ALREADY HAVE:** parcel source HCAD (keyless, `HCAD_NUM` + owner + site address + values +
  `land_sqft` — but area is geometry-derived, never the upstream field); `houston` + `austin` context
  bake rows (share ONE texas extract → two clips), OSM buildings, NAVD88/GEOID18 lifts −28.41 /
  −26.90 m (lane-context-intl §1 §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/us-tx-harris`.** `US`.
  - **For Houston: a Chapter 42 setback/lot rule** (footprint-only) + an explicit **"no height cap"
    refusal** — the honest partial deliverable, not an invented number. `US`/`FOUNDER` (product
    decision: footprint-only vs refusal).
  - **For Austin (deferred parcel):** Austin **does** have zoning, but **no live keyless statewide/TCAD
    parcel service was found** — Travis County host didn't resolve, TxGIO statewide `2025_Land_Parcels`
    returned nothing at Austin/Dallas points, the City-of-Austin layer is city-OWNED parcels only
    (lane-us-expand "Texas: what did NOT work"). Austin needs **a live TCAD endpoint** (`DATA`) before
    its zoning (extractable) is worth wiring.
  - Datum A2. `US`.
- **EFFORT:** **Houston = days** (the honest output is small: Chapter 42 footprint + a refusal on
  height). **ONE unblock for TX overall: find a live Travis County / TCAD parcel endpoint** for
  Austin; Houston's "envelope" is mostly a decision about how to present a zoning-free city honestly.

---

# REGION: AUSTRALIA (state competency; the envelope-data region)

Cadastre and planning are **STATE** competencies — no national cadastre, no national scheme
(au-sweep preamble). **Six of eight** states/territories returned a real legal parcel id live and are
wired (`AU-NSW/VIC/QLD/SA/TAS/ACT`); WA + NT are declared deferrals (lane-au-open). ⚠ **`AU-SA` is
Australian South Australia — NEVER `SA`, which is Saudi Arabia** (au-sweep §0; the collision would
silently mis-route). All 8 context bake rows exist (0.96 GB pbf for the continent, ~1/5 of Germany);
buildings OSM everywhere, ACT ships 64,674 open footprints and Melbourne serves real extrusions
(lane-context-intl §1). Datum AHD (EPSG:5711; AHD-TAS on Tasmania); the geoid undulation swings **84 m
across the states (−32.9 Perth → +51.1 Darwin)** so a single national constant is impossible — the
owed terrain build is a per-region `geoidSepM` override (lane-context-intl §4.1).

### South Australia (Adelaide) — ⭐ the single best buildable-envelope jurisdiction found anywhere
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — but **the entire envelope input set is served as
  data and probe-verified**: Maximum Building Height (m) `32.5`, Maximum Building Height (levels) `9`,
  plus live spatial layers for **Minimum Primary/Side/Rear Setback, Site Coverage, Minimum Frontage,
  Minimum Site Area — and a "Building Envelope" layer** (au-sweep §5.2). Parcel channel live
  (`parcel_id C21367 F1` + title `CT 5954/719`) behind a **soft CloudFront Referer WAF** (403 bare,
  200 with `Referer: sappa.plan.sa.gov.au` — NOT IP-geofenced) (lane-au-open §2).
- **LEGEND:** **L3 — Free-standing, ratios**, **fully Type B + Type A data-served.** P3 (coverage +
  setbacks) served, V (height m + levels) served — the census's **CONSUME-GEOMETRY / COMPILE-PARAMETERS
  top of the ladder.** The declared sentinel (`value: 9999` = "No prescribed height limit") is honest,
  not a magic number (au-sweep §5.2).
- **WHAT WE ALREADY HAVE:**
  - Parcel source: **PlanSA SAPPA layer 41**, plan/parcel + title (Referer-gated, CC Attribution;
    open downloads exist regardless) (au-sweep §5.1).
  - Zone-identity (B2/B3): **52 Zones · 102 Subzones · 126 Overlays** served (au-sweep §5.2).
  - Volume + yield: **Type B parameters (height m, height levels, site coverage, setbacks, frontage,
    min site area) served as spatial layers; a "Building Envelope" layer (Type A) served.**
  - Context/heights: `southaustralia` bake row, OSM, ELVIS nDSM owed; datum AHD, lift −0.34 m
    (lane-context-intl §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Read the PlanSA live-endpoint terms** (soft WAF; open downloads exist so the data is CC) —
    reviewBy 2026-12-01. `DATA`/`FOUNDER`.
  - **Wire the `/api/parcel/au-sa` proxy with the server-side Referer** injected (lane-au-open §6). `US`.
  - **A rule pack that CONSUMES the served numeric layers** — height (V1), coverage + setbacks (P3),
    and where present the Building Envelope polygon (Type A, L1) — **almost pure consume, near-zero
    derivation** (this is the loudest cheap win in the region: `BuildableEnvelope = Building Envelope ∩
    height ∩ coverage ∩ setbacks`, all served). `US`.
  - **A residential-point fill probe** on the setback/site-coverage layers (0 features at the 2 CBD
    probe points — enumerated but not yet confirmed to fill in residential areas) (au-sweep §5.2). `US`.
  - Datum A2 already resolvable (AHD + per-city constant). `US`.
- **EFFORT:** **days** to a real Adelaide envelope — the numbers are served, the engine already does
  setback-inset + coverage + height. **The ONE unblock: read the PlanSA terms and write the
  consume-the-TNV-layers rule pack** — no F-extraction at all for the mapped controls.

### New South Wales (Sydney) — ⭐ Type B height + FSR served as data
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — but **HOB (m) and FSR served as polygon
  attributes** with the legislative clause attached (`MAX_B_H_M: 22.0`, `FSR: 3.5`, Surry Hills;
  au-sweep §1.2). Parcel channel live (`lotidstring 100//DP1048011`, keyless CC Attribution;
  lane-au-open §2).
- **LEGEND:** **L3 — Free-standing, ratios**, with **V1 (height) + D1 (FSR) served as Type B data**;
  P (setbacks) is document-class (DCP). Central Sydney is a **clause-based area ("CA")** where the
  polygon tells you numeric control does NOT apply and cites the clause — sun-access planes there are
  L4 document work (au-sweep §1.2).
- **WHAT WE ALREADY HAVE:**
  - Parcel source: **DCS Spatial Services FeatureServer/8**, lot/plan, keyless CC Attribution.
  - Zone-identity + volume + yield: **Land Zoning + Height of Building (m) + Floor Space Ratio served
    as spatial layers**, clause reference inline (`LEGIS_REF_CLAUSE`) — Type B (au-sweep §1.2).
  - Context/heights: `newsouthwales` bake row, OSM, ELVIS nDSM owed; datum AHD, lift +22.36 m
    (lane-context-intl §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/au-nsw`.** `US`.
  - **A rule pack that consumes HOB (V1) + FSR (D1)**, with the footprint via the degradation ladder
    (footprint from setbacks if held, else "height + FSR derived; footprint unresolved") until DCP
    setbacks land. `US`.
  - **Extract per-council DCP setbacks** (setbacks are NOT in the state layers; they live in council
    Development Control Plans — document class) — the F-extraction cost, per LGA. `US`.
  - **The clause-area (CA) handling** for central Sydney: emit a **cited refusal / L4 range**, not a
    number, where the polygon says numeric control doesn't apply — plus the sun-access-plane document
    work for towers (L4). `US`.
  - **A HOB/FSR coverage-fraction probe per LGA** (two suburban probe points had no HOB/FSR polygon —
    coverage is partial) (au-sweep §1.2). `US`.
  - Datum A2 (AHD + per-city constant). `US`.
- **EFFORT:** **days** to a height+FSR-bounded Sydney envelope (consume the two served layers);
  **weeks** to add footprint precision (per-council DCP setbacks) + the CA/sun-plane document work.
  **The ONE unblock: consume the served HOB + FSR into a rule pack** and ship footprint via the
  degradation ladder — the yield and height are free.

### Australian Capital Territory (Canberra) — the easiest full stack
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — but the **fullest open stack in AU**: parcels
  (`block 44 section 19`, leasehold, keyless), the **Territory-Plan zone rides on the parcel row**,
  AND **64,674 open building footprints** (au-sweep §7; lane-au-open §2).
- **LEGEND:** **L3**, **single-document derivation** — numeric rules live in the Territory Plan
  district/zone codes (ONE territory document set).
- **WHAT WE ALREADY HAVE:** parcel source ACTGOV_BLOCKS (keyless, block/section id); zone-identity
  `LAND_USE_ZONE_CODE_ID` (e.g. `CZ1`) served **on the block row**; **open footprints (64,674)** for
  the owed height stamp; context `act` bake row (18.9 MB pbf — the AU pilot-bake calibration pick),
  datum AHD, lift +19.23 m (au-sweep §7; lane-context-intl §5).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/au-act`.** `US`.
  - **Extract the ACT Territory Plan zone codes** (height/setback/plot-ratio per zone) — **one
    document set covers every block** (Type C / single-document F). `US`.
  - **Confirm per-item licences** on the ACT hub (CC-BY-4.0 seen on an example; per-item unconfirmed)
    (au-sweep §7.2). `DATA`.
  - **Derive heights** from the open footprints + ELVIS LiDAR nDSM (the join is available now). `US`.
  - Datum A2 (AHD). `US`.
- **EFFORT:** **1–2 weeks** — one Territory Plan extraction + wire; footprints + heights are the
  easiest in AU. **The ONE unblock: the Territory Plan zone-code extraction** (the parcel/zone/footprint
  substrate is already complete).

### Victoria (Melbourne)
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — parcels live (Vicmap WFS, `parcel_spi PC366537`,
  CC BY 4.0; ⚠ CQL point is **LAT,LON order** — a lon,lat probe returns 0 silently), zones + overlay
  CODES served, **numbers in schedule documents** (au-sweep §2; lane-au-open §2).
- **LEGEND:** **L3**, **extraction-with-pointer** — the overlay code (e.g. `DDO2`) is a perfect
  pointer to the exact schedule where the height number lives (HTML, not scanned PDF); residential
  zones (GRZ/NRZ) carry statewide default heights (clause 32, one document).
- **WHAT WE ALREADY HAVE:** parcel source Vicmap (keyless WFS); zone-identity `zone_code` + up to 6
  overlays served (Design & Development Overlay codes = the height pointer); **Melbourne city serves
  REAL building extrusions** (CC BY, `footprint_extrusion` + floors) — LoD1 heights for the capital;
  context `victoria` bake row, datum AHD, lift +4.63 m (au-sweep §2.3; lane-context-intl §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/au-vic`** (LAT,LON CQL point). `US`.
  - **Extract the DDO/schedule height numbers** keyed by overlay code (one HTML schedule per overlay)
    + the **statewide residential clause-32 defaults** (one document) — Type C / F, better join key
    than most of Europe. `US`.
  - Melbourne heights available now (served extrusions); rest of VIC via ELVIS derive. `US`.
  - Datum A2 (AHD). `US`.
- **EFFORT:** **weeks** — the statewide residential defaults are one document; per-DDO schedules are
  many but HTML-scrapable. **The ONE unblock: the clause-32 residential defaults + a DDO-schedule
  extractor** — Melbourne launches with real building heights already.

### Queensland (Brisbane) — per-LGA
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — parcels statewide + keyless (`lotplan 47SP317615`,
  CC BY 4.0); **Brisbane zoning probed open** (26,356 zone polygons, `ZONE_CODE` served); **numbers in
  the City Plan code text** per zone precinct (au-sweep §3; lane-au-open §2).
- **LEGEND:** **L3**, **per-LGA** (77 local schemes) — Brisbane first, then LGA-by-LGA (Europe's
  per-city rule-pack shape, but with open zone polygons per LGA).
- **WHAT WE ALREADY HAVE:** parcel source QSpatial (statewide, keyless); Brisbane zone geometry
  (BCC AGOL, CC BY 4.0); context `queensland` bake row, datum AHD, lift +41.36 m (au-sweep §3;
  lane-context-intl §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Wire `/api/parcel/au-qld`.** `US`.
  - **Extract the Brisbane City Plan 2014** height/site-cover per zone precinct — Type C / F. `US`.
  - **Probe whether a statewide amalgamated zoning dataset exists on QSpatial** (UNKNOWN) before
    committing to LGA-by-LGA (au-sweep §3.2). `US`/`DATA`.
  - Datum A2 (AHD). `US`.
- **EFFORT:** **weeks per LGA** (Brisbane first). **The ONE unblock: the Brisbane City Plan
  extraction**; then decide statewide-amalgam vs LGA-by-LGA on the QSpatial probe.

### Western Australia (Perth) — parcel-identifier gated
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — **declared deferral on parcels**: Landgate SLIP
  layer 2 geometry is keyless but returns **NO lot/plan/id** ("Cadastre (No Attributes)"); the
  attributed cadastre is `Custom (Other)` = a **Landgate data agreement, price class unread**
  (au-sweep §4.1; lane-au-open §4). **Planning layers (R-Codes, region/LPS zones) ARE keyless.**
- **LEGEND:** **L3**, **single-document derivation** — R-Codes served spatially (`R40`), the numeric
  site-area/open-space/height defaults come from **SPP 7.3 (Residential Design Codes), ONE
  state-uniform document** — the highest-leverage extraction in Australia (au-sweep §4.2).
- **WHAT WE ALREADY HAVE:** parcel **geometry** keyless (no id); **R-Codes + region/LPS zones served
  spatially, keyless**; context `westernaustralia` bake row, datum AHD, lift **−32.92 m** (Perth is the
  negative-swing outlier — per-city constant mandatory) (au-sweep §4; lane-context-intl §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **FOUNDER decision: buy the Landgate attributed cadastre vs ship geometry-only** with an honest
    "no legal id" label — reviewBy 2026-11-15. `FOUNDER`/`DATA`.
  - **Extract SPP 7.3 (R-Codes) once** — covers every R-coded parcel in the state (Type C /
    single-document). `US`.
  - **A city-scheme extraction for Perth CBD** (sits under city schemes, not R-Codes). `US`.
  - Datum A2 (AHD + Perth-specific negative constant). `US`.
- **EFFORT:** **1–2 weeks** for the R-Codes envelope (one document, statewide); the parcel-id decision
  is the gate. **The ONE unblock: extract SPP 7.3** — the planning layers are already keyless; only the
  legal parcel identifier is gated.

### Tasmania
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — parcels keyless, **richest row in AU** (PID +
  title + tenure + address + area); zones served statewide (au-sweep §6; lane-au-open §2). Licence
  string **UNKNOWN** (theLIST records usually CC BY 3.0 AU — read the record, reviewBy 2026-10-15).
- **LEGEND:** **L3**, **single-document derivation** — Tasmania runs a **SINGLE statewide planning
  scheme**; zone standards live in the **State Planning Provisions, one document for the whole state**,
  with Local Provisions Schedules layering exceptions (au-sweep §6.2).
- **WHAT WE ALREADY HAVE:** parcel source theLIST (keyless, richest attributes); zone geometry
  (`ZONE "Central Business"`, statewide); context `tasmania` bake row, datum AHD-TAS, lift −3.81 m
  (au-sweep §6; lane-context-intl §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Read the theLIST licence record.** `DATA`.
  - **Wire `/api/parcel/au-tas`.** `US`.
  - **Extract the State Planning Provisions once** (zone height/setback statewide) + LPS exceptions —
    WA-class or cheaper (Type C / single-document). `US`.
  - Datum A2 (AHD-TAS). `US`.
- **EFFORT:** **1–2 weeks** once the licence is confirmed — one SPP extraction covers the state.
  **The ONE unblock: read the licence, then the SPP extraction.**

### Northern Territory
- **STATUS TODAY:** **NO COVERAGE YET** — **declared deferral**: NR Maps is a JS-app issuing a
  `jsessionid` with no REST/OGC endpoint; NTLIS/iPlan → Cloudflare 403; data.nt CKAN has no cadastre
  or zoning dataset. Machine channel **UNKNOWN (not zero)** — the data visibly exists behind the
  viewers (au-sweep §8; lane-au-open §4).
- **LEGEND:** **indeterminate** until a channel is found.
- **WHAT WE ALREADY HAVE:** context `northernterritory` bake row (OSM, datum AHD, lift +51.06 m —
  Darwin is the positive-swing extreme); **no parcel/zoning channel** (lane-context-intl §1 §4).
  Registered as an honest footprint so a Darwin click is labelled, never fabricated.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **A browser-session network capture of NR Maps** to find its WMS/ArcGIS backend (our curl env
    can't execute its JS) — reviewBy 2026-12-15. `US`/`DATA`.
  - Then parcels + NT Planning Scheme zones (likely behind the viewer) + extraction. `US`.
- **EFFORT:** **blocked until the browser-session probe**; smallest market, last in launch order.
  **The ONE unblock: capture the NR Maps backend from a real browser session.**

---

# REGION: MIDDLE-EAST CONTEXT TRIO (Turkey · Israel · Qatar)

These three are the founder's named ME **context** jurisdictions. All three returned a **real national
parcel id keyless from a foreign IP** and are wired (`TR` / `IL` / `QA`); **licences are UNREAD →
flagged YELLOW, never assumed open** (lane-me-open). Envelope RULES are document-extraction everywhere
(Europe class F), but **Israel and Qatar serve the plan/zone GEOMETRY as Type A data** — a real cheap
win on the footprint/zone-identity axis. Context: OSM buildings via the shared `gcc-states` /
`israel-and-palestine` / `turkey` extracts; no open national footprint programme found in any of them
(me-sweep §12).

### Qatar (Doha) — ⭐ the GCC exception: live keyless cadastre + zone geometry
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — but **parcels NATIONAL-NOW** (keyless ArcGIS,
  `PIN 1010028` + `PD_NO PD/4693/2019`, WGS84 ring) **and zone GEOMETRY NATIONAL-NOW**
  (`ZONING "MUC"`, `CODE 59`, `RULEID 28`); numeric rules document-only (me-sweep §4; lane-me-open).
  ⚠ the CadastrePlots layer is **hidden from the folder listing** — addressed via the qmap webmap
  (GetCapabilities-is-not-an-inventory, ArcGIS edition).
- **LEGEND:** **L3** — zone polygon (Type A) served, numbers behind `RULEID` are MME zoning-regulation
  PDFs (FAR/height/setback). Ordering free-standing-ratio; V/P from the extracted tables.
- **WHAT WE ALREADY HAVE:** parcel source `services.gisqatar.org.qa` CadastrePlots (keyless); **zone
  GEOMETRY served (Vector/Zoning) — Type A**; addresses (`QARS`) + roads (street-width input) also in
  the webmap; context via `gcc-states` (OSM thin — desert; Overture the sanctioned fallback). Licence
  **UNKNOWN** (me-sweep §4).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Read the gisqatar / MME open-data licence** before production (keyless ≠ licensed). `DATA`/`FOUNDER`.
  - **Wire `/api/parcel/qa` proxy.** `US`.
  - **Extract the MME zoning regulations** (FAR/height/setback tables) keyed by `RULEID`/`ZONING` —
    Type C / F with a served join key. `US`.
  - **Consume the served zone polygon** for zone identity + footprint context (Type A — no derivation).
    `US`.
  - **Verify the Qatar vertical datum** (QND95-associated MSL, me-sweep §13). `US`/`DATA`.
- **EFFORT:** **weeks** — the parcel + zone geometry are free; the work is the MME table extraction.
  **The ONE unblock: read the licence, then extract the MME zoning tables** against the served RULEID.

### Israel (Tel Aviv) — the most open ME stack: parcels + plan geometry served
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — **parcels NATIONAL-NOW (query)** (govmap
  IdentifyByXY, `gush 6952 / helka 139`, ITM/EPSG:2039) **and plan GEOMETRY NATIONAL-NOW** (iplan
  Xplan: every approved plan's land-use polygons + `pl_number` + approval state, keyless); numeric
  rights document-only. National bulk shapefile is **GATED(IL-IP 403)** — licence "Other (Open)", the
  pipe is fenced (me-sweep §8; lane-me-open).
- **LEGEND:** **L3** — plan land-use polygon (Type A) served, the numeric rights (FAR, heights, units —
  the takanon) live in **mavat plan PDFs keyed by `pl_number`** (Europe class F, **perfect join key**).
- **WHAT WE ALREADY HAVE:** parcel source govmap (keyless query; the adapter projects WGS84↔ITM in
  `ilItm.ts`); **plan GEOMETRY + pl_number + land-use served (Type A)** at iplan; buildings
  SUBNATIONAL (municipal GeoJSONs) + OSM (`israel-and-palestine` 119 MB); registrar area-disclaimer
  carried verbatim (area is not a legal reference). Licences UNREAD → YELLOW (me-sweep §8;
  lane-me-open).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Read the govmap query-API + iplan terms** (the bulk CKAN "Other (Open)" is a DIFFERENT, fenced
    product — don't conflate). `DATA`/`FOUNDER`.
  - **Wire `/api/parcel/il` proxy.** `US`.
  - **Extract the mavat takanon numeric rights** (FAR/height/units) keyed by `pl_number` — Type C / F
    with a perfect join key. `US`.
  - **Consume the iplan plan land-use polygons** (Type A — zone identity + footprint context, no
    derivation). `US`.
  - **(Optional) the national `parcel_all` bulk** via an IL vantage for offline coverage (licence is
    open, pipe fenced). `DATA`.
  - **Verify the Israel Vertical Datum** (Yafo MSL, me-sweep §13). `US`/`DATA`.
- **EFFORT:** **weeks** — parcels + plan geometry free; the mavat extraction is the cost, eased by the
  `pl_number` join key. **The ONE unblock: read the terms, then the mavat takanon extraction** against
  the served plan geometry.

### Turkey (Istanbul) — the best parcel API in the lane; rules document-only
- **STATUS TODAY:** **NO COVERAGE YET** (undrawn) — **parcels NATIONAL-NOW** (TKGM keyless
  point→parcel GeoJSON, `ada 3106 / parsel 258`, national, sub-second); the `nitelik` string carries a
  **storey-count text signal** ("11 Katli" = 11-storey) carried as a HINT, never a normative height;
  envelope rules document-only + municipal e-Devlet gate (me-sweep §10; lane-me-open). Licence UNREAD
  → YELLOW.
- **LEGEND:** **L3** — no served numeric envelope; the İmar (zoning) numbers live in **municipal İmar
  planları behind e-Devlet** (document/viewer class, same shape as Austria's Bebauungsplan PDFs).
- **WHAT WE ALREADY HAVE:** parcel source TKGM `cbsapi.tkgm.gov.tr` (keyless national GeoJSON; a
  no-parcel point answers a semantic 404, not a fence); **storey-count hint** off `nitelik`; buildings
  OSM (`turkey` 614 MB — densest in the lane); **no national served zoning channel found** (me-sweep
  §10). Licence UNREAD → YELLOW.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Read the TKGM query-endpoint terms** (bulk/WMS is priced+protocol-gated; the query endpoint being
    keyless is the bulk-vs-query distinction, not a grant). `DATA`/`FOUNDER`.
  - **Wire `/api/parcel/tr` proxy.** `US`.
  - **Per-municipality İmar extraction** (FAR/height/setback) — behind e-Devlet logins, per city
    (document class, the F-extraction cost; no national shortcut). `US`/`DATA` (e-Devlet access).
  - **Verify the TR vertical datum** (TUDKA / Antalya tide gauge, me-sweep §13). `US`/`DATA`.
- **EFFORT:** **weeks per city** — parcels are free and excellent; the envelope is per-municipality
  document extraction with no national served layer. **The ONE unblock: read the TKGM terms + pick a
  launch municipality** (Istanbul) and extract its İmar plan.

---

# APPENDIX: Saudi Arabia (inherited context — not a named target, but the region's rule-model proof)

- **STATUS TODAY:** **NO COVERAGE YET in the editor** — but **the rules are banked and a demo pack
  draws the footprint**: the MOMRAH national 2024 residential decision gives a **closed-form national
  footprint rule** (`front = max(streetWidth/5, 3 m)`, side/rear analogues, coverage villa 0.75 /
  apartment 0.65) shipped as `saRiyadhDemo.ts` — the cheapest pack shape PRYZM has (a per-edge inset +
  maxCoverage). **Parcels are GATED**: the Balady/U-Maps fence **changed class** — from an IP geo-fence
  to a **Balady SSO / Nafath token gate** (an in-SA proxy alone no longer suffices) (me-sweep §1;
  saRiyadhDemo.ts).
- **LEGEND:** **L3 — Free-standing, ratios**, rules **NATIONAL and already extracted** (the registry
  row note is stale on the fence class — an edit is owed).
- **WHY IT MATTERS HERE:** Saudi is the proof that a national closed-form rule is the **simplest legend
  we have** — and the counter-example to the Gulf pattern: everything is banked *except* the parcel
  channel, which is a credential gate, not a data absence. **The ONE unblock: a Balady SSO / MOMRAH
  data agreement** (`FOUNDER`/`DATA`) — then the banked pack draws immediately.

---

## Cross-region summary — where the cheapest wins are (loudest first)

1. **CONSUME, don't build — South Australia.** Height, levels, setbacks, site coverage, frontage, min
   site area **and a Building Envelope polygon** are all served as data (au-sweep §5.2). A near-pure
   consume rule pack → an Adelaide envelope in **days**. The single cheapest envelope in any region,
   Europe included.
2. **CONSUME the served parameters — NSW (HOB + FSR) and NYC (FAR).** Type B yield/height already
   served (au-sweep §1.2; registry.ts US-NY-NYC). Consume them; ship footprint via the degradation
   ladder until setbacks/DCP/ZR land. **Days** to a partial cited envelope.
3. **CONSUME the served geometry — Qatar + Israel (zone/plan polygons, Type A)** and the ACT
   (zone-on-parcel) — the zone identity and footprint context are free; only the numeric tables need
   F-extraction (me-sweep §4/§8; au-sweep §7).
4. **ONE document per state — WA (SPP 7.3), TAS (SPP), ACT (Territory Plan), VIC (clause 32).** One
   extraction covers every coded parcel; **1–2 weeks each** (au-sweep §4/§6/§7/§2).
5. **The honest non-envelope — Houston (no zoning) and Sydney CBD clause-areas (CA).** The deliverable
   is a footprint-only partial or a **cited refusal / L4 range**, never a fabricated cap (au-sweep §1.2;
   lane-us-expand "Texas").
6. **Blocked, not absent — Dubai · Abu Dhabi · NT · (Saudi parcels).** All are access/identity/vantage
   gates over data that demonstrably exists; **the unblock is a probe or a credential, not
   engineering** (me-sweep §2/§3/§14; au-sweep §8).

**The universal owed wiring across every jurisdiction above:** the `/api/parcel/*` server proxies are
unwired, so no beyond-Europe click reaches even the parcel today — it falls to the OSM footprint
(lane-us-expand / lane-au-open §6 / lane-me-open). Wiring the proxies + writing the first
consume-the-served-data rule pack (SA or NSW) is the highest-leverage next step in the region.
