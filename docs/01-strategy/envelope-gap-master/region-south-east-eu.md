# Envelope Gap Master — REGION SOUTH-EAST-EU

> **What this is.** The per-jurisdiction gap list for the buildable-envelope product across
> south-east Europe: Italy, Greece, Croatia, Romania, Bulgaria, Malta, Cyprus, Slovenia, Albania,
> plus the micro one-liners (Serbia, Bosnia, Montenegro, North Macedonia, Kosovo, Moldova, Ukraine,
> Turkey, San Marino). Written to the founder's own framework — the 33 attributes A1–F8 and the
> irreducible 8-field core (`STR-ENVELOPE-PARAMETER-REFERENCE.md`), the Ω/P/V slots, paths P1–P5 /
> V1–V6 and Sufficiency Legends L0–L7 (`STR-ENVELOPE-SUFFICIENCY-LEGENDS.md`), and the P1–P6
> consume-before-compute source hierarchy (`STR-EUROPEAN-ENVELOPE-SOURCES.md` §8–9).
>
> **Every claim is probe-verified evidence, cited.** Primary sources: the geometry census
> `audit/envelope-geometry-census/2026-09-02/census-south-east.md` (16 countries, live HTTP
> 2026-09-02) and its consolidation `CENSUS.md` (44 rows, 8/8 Type-A re-probes CONFIRMED); the
> hard-case `audit/envelope-architecture/2026-09-02/VALIDATION-MATRIX.md` + `RECONCILIATION.md`;
> the E5 sweeps `audit/europe-site-intel/2026-08-31/lanes/rest-of-europe-sweep.md` and
> `impl/e5-asis-national-sweep.md` + `E5-DATA-REUSE-REPORT.md`. Shipped-state read from
> `packages/site-parcel-data/src/rulepacks/registry.ts` and `src/countryAdapters/{gr,hr,ro,si,tr}/`.
> Honesty frame (inherited, binding): **UNKNOWN ≠ absent ≠ zero · a WMS is a picture, not a
> geometry channel · a registration/vantage gate is a GATE, not a missing dataset · GetCapabilities
> is not an inventory · a sentinel `0` means UNKNOWN, never zero.**

---

## REGION HEADLINE — read this first

**Zero jurisdictions in south-east Europe DRAW a cited envelope today, and none is registered even
as an honest envelope-refusal pack.** Every envelope rulepack in the repo is ES / DK / CH / FR
(Paris) / NL / PL (`rulepacks/registry.ts`); there is no IT/GR/HR/RO/BG/MT/CY/SI/AL envelope pack.
What exists for this region is **parcel + jurisdiction-identity plumbing** (`countryAdapters/gr`,
`hr`, `ro`, `si`, `tr`) — and even that is mostly dormant: GR, HR and RO route on
`claimsNation(...)` and are **REGISTERED-BUT-INERT** because those countries are not yet in the
national resolver's boundary set (`jurisdiction/data/nationalBoundaries.json` models 16 claimable
countries; GR/HR/RO are in none), so a click there falls to the honest universal OSM footprint, not
a wrong-country cadastre. SI routes live (`claimsNation('SI')`, promoted into the resolver set); TR
routes live on a bbox with TKGM's own 404 as the "no parcel here".

**But the census overturned "the south-east is PDF-land" with three live consume targets:**

1. **⭐⭐ ALBANIA — the fields-as-attributes find.** A national, keyless ArcGIS FeatureServer
   (`services8.arcgis.com/.../Njesite_Strukturore_Azhornim__ok_/FeatureServer/0`) serves **91,939
   structural-unit polygons** with **max height in storeys AND metres, FAR, and coverage AS FIELDS**
   (`lartesia_k`, `lartesia_m`, `intesitet`, `ksht`) — Type B riding on Type-A-shaped polygons, the
   best data-to-effort ratio in the whole region. The gap is a licence email, not engineering
   (`census-south-east.md` §TYPE-A HEADLINE #2; `CENSUS.md` row 37; re-probe CONFIRMED, `CENSUS.md`
   CHECK 1).
2. **⭐ CROATIA — national buildable-area polygons.** A keyless WFS 2.0.0
   (`gis4.mgipu.hr/.../GradjPodrucje_MGIPU_Public/wfs`) serves **89,911 settlement construction-area
   polygons**, "no conditions" access — but explicitly **NOT for issuing legal acts** and vintage
   Sept-2020. CONSUME as a buildable/non-buildable **screening mask** only, never the legal envelope
   (`census-south-east.md` §TYPE-A HEADLINE #1; `CENSUS.md` row 32; re-probe CONFIRMED at 89,911).
3. **⭐ SLOVENIA — typed building lines.** A keyless WFS (`ipi.eprostor.gov.si`) serves **10,869
   `REG_CRTE` lines typed "Gradbena meja"** (building line), plan-linked and validity-dated, plus
   403,788 land-use polygons and per-FLOOR building geometry (`ETAZE`) — Type A geometry, CC BY 4.0
   (`CENSUS.md` row 27; `e5-asis-national-sweep.md` §E5-7; re-probe CONFIRMED at 10,869).
   **The catch, and it is load-bearing:** the FZ/FI/height NUMERIC envelope schema exists at
   **0.5–1.1% fill and the values present are sentinel zeros** — consume the LINES, refuse the
   NUMBERS (`E5-DATA-REUSE-REPORT.md` §E.2).

**Bulgaria-Sofia and Cyprus are the two automatable code→table joins behind the consume targets.**
Everything else in the region is documents-only or gate-shaped. **Building LINES (IT fili edilizi,
GR οικοδομικές γραμμές, TR imar hattı, MK gradežna linija) exist as legal objects everywhere and
are served as data almost nowhere** — SI's Gradbena meja is the region's only served Baulinie-class
channel (`census-south-east.md` §LANE SYNTHESIS 3). And **six of sixteen countries are gate-shaped,
not absent** (MT Cloudflare wall, RS/MK/MD geo-fences, UA wartime logins, CY IIS-403) — an
EU-vantage re-probe pass is the single highest-value regional follow-up (`census-south-east.md`
§LANE SYNTHESIS 2; `CENSUS.md` §WHERE THIS CENSUS IS THIN 3).

---

## ALBANIA ⭐⭐ — the fields-as-attributes find (do this first)

### Albania
- **STATUS TODAY:** NO COVERAGE YET (no envelope pack; no parcel adapter) — but the closest thing
  in the region to a one-adapter DRAWS-A-CITED-ENVELOPE win, blocked only on a licence.
- **LEGEND:** **L3 — free-standing, ratios.** Each structural-unit polygon carries coverage +
  intensity + a height cap, which is the L3 minimal set (Ω + P3 coverage/setbacks + V-cap). Height
  is served both as storeys (V2) and metres (V1), so V is over-determined — intersect them
  (`STR-ENVELOPE-SUFFICIENCY-LEGENDS.md` A.2/A.3).
- **WHAT WE ALREADY HAVE** (all Type B on Type-A-shaped polygons, feature-proven —
  `census-south-east.md` §HEADLINE #2 + AL block; `CENSUS.md` row 37):
  - **Zone geometry + identity + the numbers, in one national keyless FeatureServer.** 91,939
    `Njësitë Strukturore` polygons via `planifikimi.gov.al` → AKPT ArcGIS Online. Real Berat
    feature quoted: `lartesia_k` (storeys) `2`, `lartesia_m` (metres) `6`, `intesitet` (FAR)
    `K1=0.5`, `ksht` (coverage) `K1=50%`, `KSHR`/`KSHP` (green/public coeffs), `Parcela_Minimale`
    `10000 m2`, `Perdorime_Te_Lejuara/Ndaluara` (permitted/prohibited uses), `Rregullore`
    (regulation ref for B1/F3 citation).
  - **Drawn restriction geometry (Type A on the negative-overlay axis):** road protective strips
    (`Fasha Mbrojtëse e Rrugës`), railway buffers, TAP pipeline security + 4 m corridor, the coastal
    300 m PINS belt, heritage/archaeology polygons — feeds the overlay-subtraction step (H) directly.
  - Proposed land-use per PPV, detailed-plan (PDV) boundaries, reconstruction zones, VKM-360
    municipality boundaries — all on the same webmap.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **A licence confirmation from AKPT — the ONE blocker.** The ArcGIS item is `access: public` but
    `licenseInfo` is **EMPTY** → licence UNSTATED. One email settles it. **[FOUNDER/DATA]**
    (`census-south-east.md` AL block; `CENSUS.md` row 37 LIC = "⚠ UNSTATED").
  - **A tolerant field parser with a refusal path** — values are semi-structured strings (`K1=0.5`,
    `K1=50%`, `PA` = not applicable, prose escapes like *"Sipas legjislacionit…"*). Never assume the
    string is a clean number; an unparseable value is a cited refusal, not a guess. **[US]**
    (`census-south-east.md` AL block; honesty frame: sentinel/prose ≠ number).
  - **Parcel-fabric linkage** — the unit polygon carries `bashkia`+`njesia` ids but **no parcel
    key**; ASIG's geoportal redirect-looped on probe (RC=47). Either resolve ASIG's WFS from a
    browser vantage, or ship parcel-less (the unit polygon IS the drawn scope of the numbers, so an
    envelope can be emitted against the unit even without a cadastral parcel). **[DATA]**
    (`census-south-east.md` AL block).
  - **No datum on the layer (A2)** and **no validity dates** — the `Rregullore` ref is present but
    no `retrieved_at`/in-force date rides the feature; provenance (F6) is thin. Emit metric height
    with an explicit "datum unresolved → relative volume" label from the degradation ladder (A.5).
    **[US]**
- **EFFORT:** **~3–5 days** for the FeatureServer reader + tolerant parser + refusal path (the
  DK/AL exemplar shape already exists to copy). **The ONE thing that unblocks the most: the AKPT
  licence email** — the data, the geometry and the numbers are already live and feature-proven; a
  single reply moves Albania from "NO COVERAGE" to a national COMPILE-PARAMETERS envelope. The
  consolidation ranks it explicitly: "one email to AKPT could move it ten places" (`CENSUS.md`
  TOP-10 note).

---

## CROATIA ⭐ — consume the national mask (screening-grade only)

### Croatia
- **STATUS TODAY:** NO COVERAGE YET for the envelope; parcel adapter present but
  **REGISTERED-BUT-INERT** (`hrJurisdiction.ts` routes on `claimsNation('HR')`, and HRV is not yet
  in the resolver's boundary set, so it never fires — a Croatian click falls to the OSM footprint).
- **LEGEND:** the underlying plans are mixed **L2 (aligned historic cores) / L3 (free-standing)**,
  but **what is served fills no P or V slot** — the construction-area polygon is a **buildable/
  non-buildable Ω-mask** (a pre-filter on the domain), not a footprint or a height. Treat it as a
  screening gate ahead of Legend selection, never as the envelope.
- **WHAT WE ALREADY HAVE** (`census-south-east.md` §HEADLINE #1 + HR block; `CENSUS.md` row 32):
  - **National construction-area polygons as data (Type A, screening-grade).** Keyless WFS 2.0.0
    `gis4.mgipu.hr/srv1/GradjPodrucje_MGIPU_Public/wfs`, 2 feature types
    (`Gradj_podrucje_naselje` + `_izvan_naselja`), `numberMatched="89911"` settlement polygons,
    municipality codes + plan reference riding each polygon. Discovered via the NIPP register
    (`registri.nipp.hr/api/izvori/244`, source 0246 "Građevinska područja").
  - **Licence quoted:** register field `uvjeti_pristupa_koristenja: "Nema uvjeta za pristup i
    korištenje"` (no conditions) — **but the same record carries the operative use-limit:** the
    layer is an *interpretation* of the plans, vintage **September 2020**, *"ne smiju [se]
    koristiti u svrhu izdavanja akata"* — **NOT for issuing legal acts** (`CENSUS.md` CHECK 2 #4,
    verbatim).
  - **Parcel linkage:** DGU Digitalni katastarski plan (DKP) WFS per cadastral municipality +
    INSPIRE ATOM free bulk since June 2023 (parcels, buildings, land use) — `rest-of-europe-sweep.md`
    HR block. Licence id unconfirmed.
  - **Plan CONTENT as raster only:** per-county "PPRaster*" WMS = scanned plan sheets, visual, not a
    geometry channel; ISPU is an Angular SPA whose backends load at runtime (`census-south-east.md`
    HR block).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **A licence confirmation email** (register says "no conditions" but the not-for-legal-acts
    caveat must be honoured in the product framing). **[FOUNDER/DATA]** (`CENSUS.md` TOP-10 #9).
  - **A founder decision to ship a SCREENING tier** — buildable/non-buildable mask with
    refuse-with-both-numbers wherever the 2020 mask and a newer plan could disagree. This is a
    product-framing call, not engineering. **[FOUNDER]** (`census-south-east.md` HR verdict).
  - **The numeric envelope itself is DOCUMENTS-ONLY** — odredbe za provođenje (heights, FAR,
    coverage, setbacks) are per-plan PDF; no served parameters. Full envelope = per-plan PDF
    extraction, out of scope for the mask win. **[US, large]** (`CENSUS.md` row 32: H/FAR/COV/SB all
    ✖ PDF).
  - **Add HRV to the national resolver boundary set** (+ HUN/SRB/BIH/MNE refusal-neighbours) to
    light the parcel row. **[US]** (`hrJurisdiction.ts` declared follow-up).
  - **Plan for a flaky endpoint** — `gis4.mgipu.hr` returned 502 once mid-verification before
    confirming; build retries into any HR adapter. **[US]** (`CENSUS.md` CHECK 1 + THIN #6).
- **EFFORT:** **~2–3 days** for the WFS mask consumer + retry logic. **The ONE unblock: the founder
  ratifying screening-grade as a shippable tier** (the data is live and keyless; the only real
  question is product framing given the "not for legal acts" caveat). Do NOT confuse this with the
  legal envelope — it is a first gate, ranked #9 consume-now precisely as a screening mask.

---

## SLOVENIA ⭐ — consume the lines, refuse the numbers

### Slovenia
- **STATUS TODAY:** NO COVERAGE YET for the envelope; **parcel routing is LIVE** — SI is the one
  SE-EU country promoted into the national resolver boundary set, so `claimsNation('SI')` fires and
  the KN parcel WFS answers (`siJurisdiction.ts`; overlap audit vs ITALY_BBOX resolved on polygon +
  1500 m tolerance).
- **LEGEND:** **L1 / L5 via building lines** — the served `REG_CRTE` "Gradbena meja" lines + the
  `REG_POVRSINE` regulated surfaces are the drawn instrument (P1 explicit / P-via-lines), so P is
  fillable from geometry. **V is NOT fillable from data** — heights live in municipal act text and
  the served numeric slots are sentinel-zero. So the honest deliverable today is the degradation
  ladder's *"footprint derived; vertical extent unresolved"* (A.5).
- **WHAT WE ALREADY HAVE** (`CENSUS.md` row 27; `e5-asis-national-sweep.md` §E5-7;
  `rest-of-europe-sweep.md` SI block):
  - **Typed building lines as data (Type A):** keyless WFS `ipi.eprostor.gov.si`, `REG_CRTE_OPN`
    **10,869 lines typed "Gradbena meja"**, each plan-linked (`ID_PA`) and validity-dated
    (`DATUM_VEL`, e.g. 2024-03-09) — re-probe CONFIRMED at 10,869. Plus `REG_POVRSINE` 13,632
    regulated surfaces and `NRP_OPN` **403,788** land-use polygons (national land-use complete).
    Licence **CC BY 4.0**.
  - **Parcels + building register, keyless, in one merged cadastre (Kataster nepremičnin):**
    `SI.GURS.KN` WFS ~75 feature types incl. `PARCELE`, `STAVBE` (floor count `STEVILO_ETAZ`,
    dwellings, **existing GFA `BRUTO_TLORISNA_POVRSINA`**, typology), and **per-FLOOR `ETAZE`** with
    `NADMORSKA_VISINA` (floor altitude), `VISINA_ETAZE` (floor height), geometry — Slovenia is the
    second floor-geometry country in Europe after Spain (`e5-asis-national-sweep.md` §E5-7 verdict).
    ⚠ `ETAZE.GEOM` is nillable — fill varies (present on 1 of 2 sampled) — measure fill before use.
  - Context/heights: rich building register (surveyed heights — check per-attribute provenance,
    not "measured"); national LiDAR legacy 2011–2015 (`rest-of-europe-sweep.md` SI heatmap).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **A `REG_CRTE`/`REG_POVRSINE` line-and-surface consumer** feeding the explicit-geometry tier —
    the same shape as FR setback lines / DK byggefelt. Consume the lines, join to the plan `ID_PA`
    for B1/F2 provenance. **[US]** (`CENSUS.md` TOP-10 #10).
  - **⛔ A binding refusal rule on the numeric slots:** `FZ_MAX`, `FI_MAX`, `FZP_MIN`, `GP`, `V` are
    at 0.5–1.1% fill and the present values are **sentinel zeros on real residential land**. `0`
    means UNKNOWN, never zero — a numeric-coercing adapter yields coverage-0 / FAR-0 (exactly L-616 /
    envelope-solid-overstates-partial-data). Height/FAR/coverage stay a **cited refusal** until the
    municipal PIP text is extracted. **[US]** (`E5-DATA-REUSE-REPORT.md` §E.2, binding adapter rule).
  - **PIP numeric extraction** (FZ, FI, heights, setbacks from ~212 municipal OPN act texts) is the
    real V-slot cost — document extraction with provenance (P4). **[US, large]**
    (`rest-of-europe-sweep.md` SI planning: PIP text-locked).
- **EFFORT:** **~3–5 days** for the line/surface consumer (parcel routing already live; CC BY 4.0
  clean). **The ONE unblock: build the `REG_CRTE` consumer and ship footprint-with-unresolved-height
  as the deliverable** — do not wait on the numerics; the sentinel-zero trap means the numbers are a
  separate, later extraction job, and shipping them as data would be an overstatement.

---

## BULGARIA — Sofia is an automatable law-table join

### Bulgaria (national)
- **STATUS TODAY:** NO COVERAGE YET; national = DOCUMENTS-ONLY.
- **LEGEND:** **L3 (ratios)** in principle — плътност (coverage) + КИНТ (FAR) + кота корниз
  (cornice height) per zone — but nationally the numbers are per-municipality PDF/DWG with no
  register.
- **WHAT WE ALREADY HAVE** (`census-south-east.md` BG block; `rest-of-europe-sweep.md` BG block;
  `CENSUS.md` row 39):
  - Parcels/buildings via GCCA (AGKK) **KAIS** portal — free viewing + free auto-PDF reports;
    INSPIRE WMS confirmed; **official extracts PAID**; no open bulk found. Urban KKR coverage
    substantially complete.
- **WHAT WE NEED TO BUILD:**
  - National envelope = per-municipality OUP/PUP **PDF extraction** — no served parameters. **[US,
    large]**.
  - Open-bulk / licence for KAIS parcels is unresolved (paid extracts). **[DATA]**.
- **EFFORT:** weeks+ nationally (per-municipality PDF). Skip national; do the Sofia island.

### Bulgaria — Sofia (city island)
- **STATUS TODAY:** NO COVERAGE YET, but the most automatable single-city join in the region after
  Albania.
- **LEGEND:** **L3 via a code→law-table join** — zone-coded polygons carry the CODE; the numbers
  (плътност, КИНТ, кота корниз) are keyed by that code in the **ЗУЗСО annex tables, which are LAW
  with fixed numeric tables**. Plus an explicit **Type-A construction-boundary line**.
- **WHAT WE ALREADY HAVE** (`census-south-east.md` §HEADLINE #3 + BG block; `CENSUS.md` row 39):
  - Keyless ArcGIS REST `gis.sofiaplan.bg/server/rest/services` (note: `/server/`, not `/arcgis/`).
    `oup_2009` FeatureServer, 90+ layers, incl. **layer 25 "Строителна граница на град София"** (the
    construction boundary — an explicit drawn Type-A line) and layer 2 "Урбанизирани територии"
    with zone CODE on the polygon (feature quoted: `type_: "зона за обществено обслужване"`).
  - A `parametrichno_planirane` folder exists on the same server (parametric-planning slot present
    but thin — currently one kindergarten-catchment service).
- **WHAT WE NEED TO BUILD:**
  - **Transcribe the ЗУЗСО annex numeric tables** (code → плътност/КИНТ/кота корниз) into a
    structured rule table — this is P3/P4 legal-text compilation with article citations (F3). **[US]**.
  - **Consume the Sofia zone-coded polygons + the construction-boundary line** and join code→table.
    **[US]**.
  - Confirm Sofiaplan licence terms (not read). **[DATA]**.
- **EFFORT:** **~1–2 weeks** (the polygon+line consume is days; the ЗУЗСО table transcription is the
  bulk). **The ONE unblock: extract the ЗУЗСО annex tables** — once the code→number map exists, the
  geometry is already live and keyless and the join is deterministic.

---

## CYPRUS — a gated code→coefficient join (confirm the gate, then compile)

### Cyprus
- **STATUS TODAY:** NO COVERAGE YET; the parameters are a lead behind an access gate, not proven
  absent.
- **LEGEND:** **L3 (ratios)** — planning zones carry a building coefficient (συντελεστής δόμησης =
  FAR), coverage, storeys and height per zone code; the zone-polygon + zone-code → coefficient-table
  join is the automatable path.
- **WHAT WE ALREADY HAVE** (`census-south-east.md` CY block; `rest-of-europe-sweep.md` CY block;
  `CENSUS.md` row 31):
  - DLS national digital cadastre (parcels + buildings), free viewing; bulk/extract historically
    paid.
  - ArcGIS REST root `eservices.dls.moi.gov.cy/arcgis/rest/services` PROBED **200** with a
    **DTPH (Town Planning & Housing) folder present** — but `DTPH?f=json` and layer guesses return
    **IIS 403** (anonymous blocked at folder level = a permissions GATE, not an empty server).
- **WHAT WE NEED TO BUILD:**
  - **Confirm the gate and whether coefficients ride ON the zone layer or only in companion tables**
    — trace the DLS viewer's network calls in a browser session, or request DTPH open-data access.
    **[DATA]** (`census-south-east.md` CY verdict, probe named).
  - Then a **zone-code → coefficient-table compiler** (L3) with the published zone tables. **[US]**.
  - Parcel access tiers (paid extract) to resolve for A1. **[DATA/FOUNDER]**.
- **EFFORT:** **~1 week** once the gate is open (the join is small and structured). **The ONE
  unblock: DTPH open-data access (or a browser network-trace)** — the entire envelope path here is
  behind one IIS-403 folder.

---

## ITALY — 21 regional mechanisms, one national distance rule, no Type A

### Italy (national frame)
- **STATUS TODAY:** NO COVERAGE YET; DOCUMENTS-ONLY for the numeric envelope. No served
  building-field or building-line geometry anywhere (fili edilizi/allineamenti are PDF tavole).
  Parcel adapter present but the resolver treats IT as a modelled country (ITALY_BBOX) used mainly
  as a routing rival for SI/HR — no envelope pack.
- **LEGEND:** **mixed L2 + L3 + L6.** Historic perimeter-block cores are **L2 (aligned-to-street,
  depth-governed)**; free-standing suburban zones are **L3 (ratios: indice di edificabilità +
  coverage + height)**; and Italy carries a **national contextual constraint (L6)** unique in the
  region — see DM 1444.
- **⭐ THE NATIONAL DISTANCE RULE (DM 1444/1968).** Italy's one nationally-uniform envelope input:
  **10 m between facing walls with windows** (and related distance-between-buildings limits). This
  is exactly the founder's A6 dependency — it is a function of the *neighbour's* façade, so it
  **cannot be computed from the subject parcel alone** (`STR-ENVELOPE-PARAMETER-REFERENCE.md` A6
  example, verbatim). In the frozen architecture this is a genuine ENGINE gap:
  distance-between-buildings-on-the-same-plot **has no seat** (an L3 *refines*, `RECONCILIATION.md`
  C5 row), and the cross-parcel neighbour-facing case needs the **`CONTEXT_AGGREGATE` /
  neighbour-height seat** (`VALIDATION-MATRIX.md` §B.3, founder-authorized). DM 1444 is the strongest
  argument in the region for building that seat, because it is one rule that applies nationally.
- **WHAT WE ALREADY HAVE** (`rest-of-europe-sweep.md` IT block; `e5-asis-national-sweep.md` §E5-2/8;
  `CENSUS.md` row 28):
  - **Parcels national (Type A/C):** AdE INSPIRE WFS `CP:CadastralParcel` + `CP:CadastralZoning`,
    **CC BY 4.0**, WFS 2.0.0, national **except Trento/Bolzano** (own systems — separate adapters);
    national bulk (>85M parcels+addresses since Feb 2025). Geometry not survey-grade (internal
    caveat). Verified-live but documented/unwired in `parcelProviders/registry.ts`.
  - **Zone geometry as regional/metro mosaics (Type C zone-identity, north-heavy):** Lombardy PGT
    mosaic + MISURC + a probed **plan-validity register** (`dati.lombardia.it/.../ijqk-ahfp` — cols
    `STATO_PGT/FASE_PGT/DATA_VIGORE/NUM_BURL` = machine-readable plan lifecycle, VAL axis); Piedmont
    PRG mosaics + Turin PRG WMS/WFS; Metro Rome PRG mosaic; Emilia-Romagna standardized PUG "Scheda
    dei Vincoli" exports (SHP/GeoJSON/PARQUET). Heritage overlays (SITAP/Vincoli in Rete) are the one
    NATIONAL uniform layer.
  - Heights: PST LiDAR nDSM partial (PNRR-funded, IMPROVING); no national LoD1/LoD2; OSM/Overture/
    EUBUCCO footprint fallback. Cadastral `fabbricati` are **WMS-only (visual)**, not a machine
    geometry channel.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Per-comune NTA extraction** — indici di edificabilità, altezze, distanze, fili edilizi all
    live in **NTA PDFs per comune** at ~9–11% national structured fill; the numbers ARE the envelope
    and none are served. This is the dominant P4 extraction cost. **[US, large]**.
  - **A per-region adapter strategy** — 19 regional laws + 2 autonomous provinces = **21 adapter
    behaviours**; the operative instrument differs by region. Start with the two the census surveyed
    at depth: **Lombardy** (MISURC zone polygons + validity register) and **Emilia-Romagna**
    (standardized PUG vincoli exports). **[US]** (`census-south-east.md` IT block).
  - **The `CONTEXT_AGGREGATE` / neighbour-height seat + a same-plot distance seat** to evaluate DM
    1444 — plus **A6 adjacent building heights/party-wall geometry** as an input (LoD1 minimum),
    which Italy has no national product for. **[US engine + DATA heights]**
    (`VALIDATION-MATRIX.md` §B.3; `RECONCILIATION.md` C5).
  - Trento/Bolzano need their own parcel adapters (hard exclusion from the national WFS). **[US]**.
- **EFFORT:** weeks-to-months, region by region. **The ONE unblock: pick ONE region (Lombardy) and
  build an NTA extraction pilot for one comune**, joined to the MISURC zone polygon and the
  plan-validity register — that proves the A(zone) ∩ B(extracted numbers) ∩ C(depth/setbacks)
  composition on the region with the strongest served geometry, without pretending the other 20
  mechanisms are close.

---

## GREECE — nothing to consume; the FEK extraction market

### Greece
- **STATUS TODAY:** NO COVERAGE YET; the region's weakest large country for served data.
  DOCUMENTS-ONLY. Parcel adapter exists and the **Hellenic Cadastre parcels are LIVE and keyless,
  proven at Athens** (`grKtimatologioClient.ts` carries the endpoint + KAEK proof) — but routing is
  **REGISTERED-BUT-INERT**: GR is not in the resolver boundary set, so `claimsNation('GR')` is false
  at every Greek point and a click falls to the OSM footprint (measured refusal for Athens +
  Thessaloniki, `grJurisdiction.ts`).
- **LEGEND:** **L2/L3** in law — όροι δόμησης = συντελεστής δόμησης (FAR) + κάλυψη (coverage) + ύψος
  (height), with ρυμοτομικές + οικοδομικές γραμμές (street-alignment + building lines) in every
  approved street plan — but all as **FEK gazette PDFs/scans**, no machine-readable register, so no
  slot is fillable from data.
- **WHAT WE ALREADY HAVE** (`census-south-east.md` GR block; `rest-of-europe-sweep.md` GR block;
  `CENSUS.md` row 30):
  - Hellenic Cadastre (Ktimatologio) INSPIRE geoportal — free discovery/view/WMTS/download of
    parcels; open-data portal `data.ktimatologio.gr`. **CAVEAT: national cadastre compilation is
    still INCOMPLETE** — coverage varies by area. Licence id not captured.
  - Live parcel client proven at Athens (keyless) in the shipped adapter.
  - Building terms (όροι δόμησης) + the οικοδομικές γραμμές building lines exist **as scanned FEK
    diagrams only** — the founder's Type-A objects, locked in PDF (`census-south-east.md` GR verdict).
  - Probed portals are dead/unreachable: `gis.epoleodomia.gov.gr` = dead stub; `geoportal.ypen.gr`
    connect-fail.
- **WHAT WE NEED TO BUILD:**
  - **Add GR to the national resolver boundary set** (+ neighbour refusal geometry) to light the
    already-live parcel row — a data addition, the single cheapest Greek win. **[US]**
    (`grJurisdiction.ts` GREECE_ROUTING_DEFERRAL step 1) — plus a `gr` row in the EU cadastre proxy
    (`server/jurisdiction/euCadastreProxy.js`) so `/api/parcel/gr` forwards. **[US]** (step 2).
  - **The whole envelope is FEK PDF/scan extraction** (P4) — a large future AI-extraction market on
    LL-quality Greek legal text; nothing to consume today. **[US, very large / future]**.
  - Cadastre licence + the incomplete-fabric handling (refuse where unregistered). **[DATA/US]**.
- **EFFORT:** the parcel wiring is **~1 day** (resolver row + proxy row); the envelope is a
  multi-month extraction programme. **The ONE unblock for the envelope: a FEK extraction pipeline** —
  but honestly, Greece is a *watch/future* market for the envelope, and the near-term deliverable is
  the live parcel + an honest "no envelope data published" refusal.

---

## ROMANIA — documents today, a real 2024 standard emerging

### Romania
- **STATUS TODAY:** NO COVERAGE YET; DOCUMENTS-ONLY → STRUCTURED-RULES emerging. Parcel adapter
  present but **REGISTERED-BUT-INERT** — ROU is in neither the resolver's claimable nor its
  refusal-only set, so `claimsRomania` is false everywhere until a boundary wave adds it
  (`roJurisdiction.ts`, declared deferral; the flip is a single coordinated data addition).
- **LEGEND:** **L3 (ratios)** — POT (coverage) + CUT (FAR) + regim de înălțime (height) per zone,
  with aliniament (building line) — today per-municipality CAD/PDF RLU; the 2024 GIS-PUG standard
  defines structured slots for exactly these for NEW plans.
- **WHAT WE ALREADY HAVE** (`census-south-east.md` RO block; `rest-of-europe-sweep.md` RO block;
  `CENSUS.md` row 38):
  - ANCPI parcels (Parcele) + buildings (Construcţii) via ArcGIS REST returning GeoJSON — **CAVEAT:
    systematic land registration is INCOMPLETE nationally** (query dynamically; do not mirror an
    incomplete fabric). `roAncpiGate.ts` is the shipped SERVICE gate. Licence not captured.
  - **A real 2024 standard:** MDLPA Date Locale publishes GIS-format PUG/PUZ technical norms
    **v1.1 / 15.07.2024** (`datelocale.mdlpa.ro/ro/about/tehnic_planurb/`, PROBED 200) — structured
    slots incl. regim de înălțime / POT / CUT and **aliniament objects**, with validity slots. Stock
    plans remain CAD/PDF.
- **WHAT WE NEED TO BUILD:**
  - **A PUG-GIS reader for standard-conformant packages** — watch axis: as municipalities publish
    2024-standard plans, the aliniament + POT/CUT/height slots become consumable (P2/P3). Build the
    reader against the standard now; expect sparse coverage. **[US]**.
  - **Stock-plan conversion** — the existing PUG/PUZ/PUD are CAD/PDF; **QMAP (qmap.ro)** is a
    Romanian company doing exactly this document→GIS extraction — **evaluate PARTNER/CONSUME before
    building in-house**. **[FOUNDER/DATA]** (`rest-of-europe-sweep.md` RO software note).
  - **Add ROU to the resolver boundary set** to light the parcel row. **[US]**.
- **EFFORT:** parcel wiring **~1 day**; the standard reader **~1 week** (but low coverage today).
  **The ONE unblock: a QMAP partnership decision** — it is the fastest route to real Romanian
  envelope geometry at scale, and it is a founder/commercial call, not engineering.

---

## MALTA — walled; a vantage problem, not an absence

### Malta
- **STATUS TODAY:** NO COVERAGE YET; **OPAQUE (bot-walled)** from this vantage — behind the wall,
  viewer-grade at best.
- **LEGEND:** likely **L2/L3-ish** (local plans specify per-area height limits in storeys on policy
  maps) but undetermined behind the wall; effectively **documents/viewer**.
- **WHAT WE ALREADY HAVE** (`census-south-east.md` MT block; `rest-of-europe-sweep.md` MT block;
  `CENSUS.md` row 29):
  - **No complete cadastre** — land registration is compulsory only in designated areas; an honest
    structural zero for the parcel fabric (RED, unavailable — not merely gated).
  - MSDI (`msdi.data.gov.mt/geoserver/ows`) and the PA mapserver (`pamapserver.pa.org.mt`) both
    return **HTTP 403 Cloudflare "Just a moment"** (JS challenge / IP reputation, identical with a
    browser UA) — the `/geoserver/` path is a verified lead that MSDI runs GeoServer. MSDI lists 15
    planning-cadastre records incl. land use + area-management zones. The 7 Local Plans + policy maps
    (height-in-storeys) served via the PA mapserver.
- **WHAT WE NEED TO BUILD:**
  - **Get past the wall** — a browser session or an EU vantage, then re-run the WFS
    GetCapabilities; only then is the data channel's shape known. **[DATA]** (probe named,
    `census-south-east.md` MT verdict).
  - **A data agreement with the Planning Authority** (the PA is both regulator and platform).
    **[FOUNDER/DATA]**.
  - Parcel fabric is a genuine near-zero — plan around no parcel polygons (use PA area-management
    zones as the domain). **[US]**.
- **EFFORT:** unknown until the wall is cleared — **the ONE unblock: an EU-vantage / browser re-probe
  of the MSDI WFS** (an hour of work that turns "OPAQUE" into a real verdict). Tiny territory; low
  priority until the wall is settled.

---

## MICRO ONE-LINERS — gate-shaped or documents-only

Every row below is **NO COVERAGE YET / no envelope pack**. Recorded per the honesty frame: a
timeout or a login is a GATE, not proof of absence. All citations `census-south-east.md` per-country
blocks + `CENSUS.md` rows unless noted.

- **SERBIA (RS) — OPAQUE-FROM-VANTAGE, do NOT record as absent** (`CENSUS.md` row 34). The GeoSrbija
  cluster (`geosrbija.rs`, `a3`, `opendata`) all connect-timeout while `rgz.gov.rs` + `mgsi.gov.rs`
  (same state, different infra) answer 200 — **geo-fence-shaped**. Serbia HAS a central planning-
  document register (CRPD) and GeoSrbija plan layers per public record; every envelope axis is
  UNKNOWN-VANTAGE. **Unblock [DATA]:** EU-IP re-probe, then DescribeFeatureType the plan layers.
- **BOSNIA & HERZEGOVINA (BA) — DOCUMENTS-ONLY** (`CENSUS.md` row 33). `katastar.ba` viewer answers
  200 (FBiH); the RS-entity geoportal `geoportal.rgurs.org` connect-timeouts (vantage). Planning is
  entity/canton/municipal; no machine-readable plan channel at any level. Honest near-zero.
  **Unblock [DATA]:** EU-vantage re-probe of the RS-entity geoportal.
- **MONTENEGRO (ME) — DOCUMENTS-ONLY** (`CENSUS.md` row 35). `geoportal.co.me` answers 200 but its
  services page leaks an **internal RFC-1918 WMS address (`http://10.10.206.210/…`, unusable)**; the
  single-national-plan reform (PGR CG) publishes documents, not data. **Unblock [DATA]:** working
  public WMS/WFS endpoints (the leaked internal IP is a dead end).
- **NORTH MACEDONIA (MK) — OPAQUE (login-walled)** (`CENSUS.md` row 36). `e-urbanizam.mk` = login
  page ("Најава"); the national e-urbanism system internally holds **DUPs with gradežna linija
  (building-line) objects** — professional-login-gated. Cadastre `katastar.gov.mk` timeouts
  (vantage). **Unblock [FOUNDER/DATA]:** e-urbanizam read access + EU-vantage cadastre re-probe.
- **KOSOVO (XK) — UNPROBED** (`CENSUS.md` row 44, scope note). Covered by no lane; every cell
  UNKNOWN, not absent. **Unblock [US/DATA]:** probe `geoportal.rks-gov.net` capabilities + the
  Kosovo Cadastral Agency WFS + the spatial-plan register.
- **MOLDOVA (MD) — OPAQUE (explicit geo-fence), the cleanest fence proof in the region** (`CENSUS.md`
  row 41). `cadastru.md` serves the literal text *"this content is not available in Your region/
  country."*; `geoportal.md` is a **parked domain** (old NSDI domain lapsed). No planning channel.
  **Unblock [DATA]:** an EU/MD-vantage re-probe of `cadastru.md/ecadastru`.
- **UKRAINE (UA) — GATED (wartime) + a real tabular per-permit channel** (`CENSUS.md` row 42).
  National geoportal + cadastre map are login-gated / wartime-closed; zoning plans (функціональні
  зони) closed for security. BUT `data.gov.ua` CKAN serves **106 УМО datasets** (містобудівні умови
  та обмеження — per-permit max height/density/setback extracts) as XLS/CSV. **Per-permit ≠
  per-zone** — useful as an evidence/calibration corpus, NOT an envelope source
  (`census-south-east.md` §LANE SYNTHESIS 4). **Unblock [—]:** wait for wartime reopening of the
  zoning layers; consume the УМО corpus only as calibration.
- **TURKEY (TR) — DOCUMENTS-ONLY for envelope axes; parcels NATIONAL-NOW** (`CENSUS.md` row 40; TR
  routing is LIVE via `trJurisdiction.ts` bbox + TKGM 404). TKGM keyless point→parcel GeoJSON
  national (`ilAd/adaNo/parselNo/alan`), licence UNKNOWN. **imar plans + imar durumu are municipal
  e-Devlet-gated documents; no national plan-geometry channel; `imar hattı` (building line) is PDF.**
  ⚠ the `nitelik` storey text is **AS-BUILT (condominium register), not normative height — never
  conflate** (SURVEYED ≠ NORMATIVE). **Unblock [DATA/US]:** confirm TKGM licence; the envelope needs
  per-municipality plan extraction (large).
- **SAN MARINO (SM) — DOCUMENTS-ONLY, micro** (`CENSUS.md` row 43). `gov.sm` publishes the new PRG
  as documents; no cadastre/plan data channel. Treat as a per-request micro jurisdiction, **zero
  engineering**.

---

## REGIONAL PRIORITY ORDER (what to build, in order)

Ranked by data-to-effort against the founder's consume-before-compute rule (P1 geometry > P2
parameters > P3 rules > P4 documents). Cite: `CENSUS.md` TOP-10 + `census-south-east.md` §LANE
SYNTHESIS.

1. **ALBANIA** — national keyless FeatureServer, height+FAR+coverage as fields, feature-proven;
   **blocked only on the AKPT licence email.** Best data-to-effort in the region. [FOUNDER email →
   US ~3–5 days]
2. **SLOVENIA** — consume the 10,869 Gradbena meja lines (CC BY 4.0, keyless, parcel routing already
   live); ship footprint-with-unresolved-height; **refuse the sentinel-zero numerics.** [US ~3–5
   days]
3. **CROATIA** — consume the 89,911 construction-area polygons as a **screening mask**; needs a
   founder ratification of screening-grade + a licence email. [FOUNDER decision → US ~2–3 days]
4. **BULGARIA-SOFIA** — extract the ЗУЗСО annex tables, then join to the live keyless zone polygons
   + construction-boundary line. [US ~1–2 weeks, table transcription is the bulk]
5. **CYPRUS** — confirm the DTPH gate (browser trace / open-data ask), then a zone-code→coefficient
   compiler. [DATA gate → US ~1 week]
6. **ITALY-Lombardy** — an NTA extraction pilot for one comune joined to the MISURC zone polygon +
   plan-validity register; proves A∩B∩C; the other 20 mechanisms follow slowly. [US weeks; DM 1444
   needs the `CONTEXT_AGGREGATE`/neighbour-height engine seat]
7. **ROMANIA** — build the 2024 GIS-PUG standard reader (low coverage today) + decide QMAP
   partnership for the stock. [US ~1 week; FOUNDER on QMAP]
8. **GREECE / MALTA / the micro one-liners** — near-term deliverable is live parcels (GR keyless,
   proven; TR live) + an honest "no envelope data published" refusal; the envelopes are FEK/PDF
   extraction (GR) or gate-clearing (MT/RS/MK/MD) — watch/future, not now.

**The single highest-value cross-region action: an EU-vantage re-probe pass** — it would settle
Malta, Serbia, North Macedonia and Moldova (four gate-shaped countries) in about an hour and turn
"OPAQUE" verdicts into real ones (`census-south-east.md` §LANE SYNTHESIS 2).
