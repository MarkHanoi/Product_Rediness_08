# Envelope Gap Master — REGION CENTRAL-EU

> **What this is.** The per-jurisdiction build list for the buildable-envelope product across
> Central Europe: Germany, Austria, Switzerland, the Netherlands, Belgium, Luxembourg, Poland,
> Czechia, Slovakia, Hungary, Slovenia. Every claim is cited to a probe-verified evidence file —
> this is a SYNTHESIS of measured work, not new research. The probing is done and committed.
>
> **Vocabulary is the founder's own** (`STR-ENVELOPE-PARAMETER-REFERENCE.md` A1–F8 + the
> irreducible 8-field core; `STR-ENVELOPE-SUFFICIENCY-LEGENDS.md` slots Ω/P/V, paths P1–P5/V1–V6,
> Legends L0–L7, the A.5 degradation ladder; `STR-EUROPEAN-ENVELOPE-SOURCES.md` source hierarchy
> P1–P6, Type A/B/C, **consume-before-compute**).
>
> **Primary evidence base (cited per row):**
> - `audit/envelope-geometry-census/2026-09-02/census-central.md` (DE·AT·CH·LI·PL·CZ·SK·HU·SI, live probes)
> - `audit/envelope-geometry-census/2026-09-02/census-west.md` (NL·BE·LU, live probes)
> - `audit/envelope-geometry-census/2026-09-02/CENSUS.md` (the 45-country synthesis + TOP-10 CONSUME-NOW)
> - `audit/envelope-architecture/2026-09-02/RECONCILIATION.md` + `VALIDATION-MATRIX.md` (as-built legend map)
> - `audit/europe-site-intel/2026-08-31/impl/e5-asis-national-sweep.md` (parcel/buildings/terrain channels)
> - As-built code: `packages/site-parcel-data/src/l449CertificationGates.ts` (which gates DRAW),
>   `rulepacks/{chZoning,plPogEnvelope}.ts`, `providers/{resolveNlBestemmingsplan,resolveChFarFromCantonCatalogue}.ts`,
>   `countryAdapters/{lu,pl,si,sk,hu}/*Jurisdiction.ts`, `parcelProviders/registry.ts`.

---

## Region headline — read this first

**Three of eleven jurisdictions draw or are one flip from drawing; the rest split cleanly into
"cheap consume win, blocked on one thing" and "documents-only / opaque."**

- **DRAWS TODAY:** **Netherlands** (`bouwvlak` + `maatvoering`, certified & live — the Type-A consume win)
  and **Switzerland/Zürich** (per-canton FAR, certified & live). Everywhere else in CH is an honest
  cited refusal (zone drawn, envelope refused).
- **ONE FLIP FROM A CONSUME WIN:** **Slovenia** (national `Gradbena meja` building-boundary lines +
  parcel served keyless — parcel adapter built and DORMANT on a routing gate), **Luxembourg** (one
  CC0 national GPKG with COS/CUS/CSS + 2,442 building lines — adapter built, blocked on parcel-keying
  + a signature), **Poland** (national POG height/FAR/coverage as mandatory data — parcel live, the
  height-cap COMPILE pack built 2026-09-03).
- **DOCUMENTS-ONLY / OPAQUE:** **Germany** (the vocabulary and the drawn lines exist on vectorised
  islands, but the corpus majority is PDF and the shaped-envelope engine is in-flight), **Austria**
  (zoning geometry, envelope numerics PDF-locked), **Belgium** (thin drawn lines in Flanders; distances
  in text), **Czechia** (emerging buildable-territory polygons, numbers text-bound), **Slovakia**
  (great cadastre, no national planning channel until ~2028), **Hungary** (state-monopolist, paid
  cadastre — a commercial relationship, not a probe).

The founder's `consume-before-compute` thesis is confirmed here: the cheapest wins (NL, SI, LU) are
about CONSUMING geometry the state already publishes, not computing it. Germany is the one place where
real engine work (the L4 shaped envelope) is the gate.

---

## GERMANY

### Germany (national picture; per relevant Land)
- **STATUS TODAY:** NO COVERAGE YET (no German envelope is drawn; parcel + zone-index + heights are
  present, and the drawn building lines exist on vectorised islands ready to consume).
- **LEGEND:** **L4 — Shaped** is the governing case for the free-standing German fabric
  (*Abstandsflächen* = a distance surface that is a fraction of façade height, 0,4·H with a 3 m floor
  in many Länder — `STR-ENVELOPE-PARAMETER-REFERENCE.md` C6/A.4). Where a B-Plan draws
  *überbaubare Grundstücksfläche* it collapses to **L1 — Footprint + height** (the German *byggefelt*);
  where it gives only GRZ/GFZ it is **L3 — Free-standing, ratios**. Real German plans mix all three.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** ALKIS *Flurstück* served keyless per-Land (×15 Länder), wired for NRW
    (`de-nrw-alkis-wfs`); building geometry + use on the same WFS (`ave:GebaeudeBauwerk`, `funktion`
    populated 500/500) — `e5-asis-national-sweep.md` §E5-1, `census-central.md` DE row.
  - **Zone identity (B2/B3):** the XPlanung / XPlanGML content model is the canonical German
    vocabulary — plan outlines are near-national via INSPIRE PLU indexes; object-level zoning
    (`BP_BaugebietsTeilFlaeche`, the GRZ/GFZ/Z carrier) is live on the vectorised islands
    (`census-central.md` Type-A headline #1–3).
  - **Context / heights (A5/A6):** LoD2 CityGML free in 15 Länder (`de-nrw-lod2-citygml-tiles` live);
    height via LoD2 `measuredHeight`; floors NOT delivered — the ALKIS storey slot `anzahlgs` measured
    **0 / 500 filled** in NRW, so floors fall back to LoD2 height ÷ ~3 m (`e5-asis-national-sweep.md`
    §E5-1, Part-2 DE row: "class A federated").
  - **Published envelope geometry (Type A, on the islands):** **`BP_BauGrenze` / `BP_BauLinie`**
    (building lines, `rechtscharakter=1000` = legally binding) live at Hamburg (45), KRZN-Kleve (161),
    Mecklenburg-Vorpommern; **`BP_UeberbaubareGrundstuecksFlaeche`** (buildable-plot-area polygons =
    the German byggefelt) at Hamburg (41); with `bautiefe` (building depth), `geschossmin/max`,
    `hoehenangabe` on the same object — `census-central.md` Type-A headline #1/#2/#3 + DE table row.
  - **Published parameters (Type B, thin fill):** in Mecklenburg-Vorpommern the `hoehenangabe` slot
    is ~0 % filled, GFZ ~5 %, GRZ ~33 % — the standard is excellent, the DELIVERED fraction is tiny
    (~1–3 %/yr growth) — `census-central.md` DE row, `CENSUS.md` row 19.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **The L4 shaped-envelope engine — the `HEIGHT_PROPORTIONAL_OFFSET` rule kind (0,4·H, min 3 m).**
    The evaluator is written (`rulepacks/declarative/evaluateHeightProportionalOffset.ts`, closed-form
    `max(factor·H, min)` post-height-resolution) but is UNTRACKED and its schema kind is **not yet on
    disk** (RECONCILIATION §0; VALIDATION-MATRIX §B.2). — **US (build; finish the in-flight S1 seat).**
  - **The inclined-plane / height-field primitive** (DE §6 *det skrå* analogue — the tapering top).
    `geometry/inclinedTop.ts` is written but UNTRACKED (RECONCILIATION §0 K1; VALIDATION-MATRIX §A.1).
    — **US (build; the one kernel investment, five countries served).**
  - **The `datum` attribute resolved for the German case** ("72,2 m über NHN" = `absolute-national`
    frame NHN). The representation shipped (`schemas/src/site/HeightDatum.ts`, ADR-0377) but
    resolution-to-metres needs a terrain model + frame conversion, which is not in the legal path
    (RECONCILIATION A2/A5, VALIDATION-MATRIX row "Terrain datum"). — **US (build) + DATA (a national DTM/NHN grid).**
  - **A per-Land *Abstandsflächen* rule table.** 0,4·H is common but the fraction and the floor vary
    by Land (Bauordnung per Land); each Land's factor + minimum must be transcribed from its
    Landesbauordnung. — **DATA (source per Land) + FOUNDER (signature per Land, an L-449 legal act).**
  - **An XPlanGML object-level adapter** that consumes `BP_BauGrenze`/`BauLinie`/
    `UeberbaubareGrundstuecksFlaeche` where a municipality vectorised them (route the drawn line into
    an enclosed-ring `explicit-area`, NOT `alignment` — VALIDATION-MATRIX "Building lines" row + §C).
    Rides the deferred "DE acquisition re-budget" (L-12886). — **US (build).**
- **EFFORT:** **weeks — the largest genuinely-new surface in the region.** The ONE unblock that moves
  the most: **land the L4 shaped-envelope pair (`HEIGHT_PROPORTIONAL_OFFSET` kind + inclined-plane
  primitive)** — it is already in-flight, and it converts Germany's free-standing majority from
  "documents-only" to computable, while the same primitive serves DE §6, Paris crown, ES coronación
  and NL dakhelling (VALIDATION-MATRIX IMPLEMENT-NOW #2/#3).

> **Per-Land note (NRW / MV / HH — the founder's named cases).** The Land publishes the **plan INDEX**
> only (`ogc-api.nrw.de/inspire-lu-bplan`, `['spatialplan']`, 82,007 plans, outline + PDF); the
> OBJECT tier is federated one level lower to municipal IT providers (KRZN Kleve, Aachen run the
> xPlanBox stack and serve `BP_BauGrenze` live). **Mecklenburg-Vorpommern** and **Hamburg** serve full
> XPlanGML object WFS directly. Verdict: **Land = index; object tier = consumable where a municipality
> built it** (`census-central.md` Type-A headline #3, DE verdict).

---

## AUSTRIA (per Bundesland)

- **STATUS TODAY:** NO COVERAGE YET (zoning geometry is served in 2 of 9 Länder; every envelope
  number is Bebauungsplan PDF).
- **LEGEND:** effectively **L3 — Free-standing, ratios** where a Bebauungsplan exists, but the numeric
  table is not machine-served, so the honest reachable output is **COMPILE-PARAMETERS at best** and
  today a refusal.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** BEV DKM parcels, CC BY 4.0, biannual snapshots (`census-central.md` AT row;
    `e5-asis-national-sweep.md` AT bonus row). No AT parcel provider is wired in PRYZM yet.
  - **Zone identity:** Flächenwidmung geometry live in **2 of 9 Länder** — Vienna OGD WFS
    (`GENFLWIDMUNGOGD`, generalised zoning) and **Upper Austria DORIS** (`FLWI_Widmungen_Flächen`,
    plus **`FLWI_Geschossbezogen`** = per-STOREY zoning polygons carrying a `GESCHOSS` dimension) —
    `census-central.md` Type-A headline #8, AT table row.
  - **Context / heights:** national 1 m DTM/DSM open → derive nDSM; Vienna Baukörpermodell WFS probed;
    GWR building register access-gated; no national LoD2 (`e5-asis-national-sweep.md` AT bonus row →
    "A geometry / B floors / D heights").
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **A height/Bauklasse rule table extracted from each Bebauungsplan** — Vienna's Bauklassen and the
    Baulinien are plan PDFs; Upper Austria gives storeys-per-zone but the metre height is still PDF
    (`census-central.md` AT verdict). — **DATA (extract per Land, per plan) + FOUNDER (signature).**
  - **A wired AT parcel provider** (BEV DKM) + national jurisdiction resolver membership. — **US (build).**
  - **The remaining 7 Länder probed** for a Flächenwidmung WFS
    (Salzburg/Styria/Tyrol/NÖ/Carinthia/Vorarlberg/Burgenland — UNKNOWN, not absent;
    `census-central.md` HONEST GAPS #1). — **US (probe) — cheap, and it sizes the whole country.**
- **EFFORT:** **days for the parcel + zoning-identity leg; weeks for any drawn envelope** (the numbers
  are PDF, so it is per-plan extraction, not a national consume). The ONE unblock: **probe the 7
  unprobed Länder** — until that lands, Austria's true size is a guess.

---

## SWITZERLAND (ÖREB federal model + per-canton FAR)

- **STATUS TODAY:** **DRAWS A CITED ENVELOPE in Zürich** (per-canton FAR, certified & live) ·
  **HONEST CITED REFUSAL everywhere else** (zone drawn, envelope refused).
- **LEGEND:** **L3 — Free-standing, ratios** for the FAR-limited path (Nutzungsziffer × parcel area →
  GFA cap); the drawn **Baulinien** are the setback instrument (a P4/P5 shaping input) but their
  numbers live in the cantonal Baureglement PDF.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** **EGRID-native — coords → EGRID → `extract/json` in one keyless call**; the ÖREB
    cadastre is the cleanest parcel spine in the region (`census-central.md` CH row, `CENSUS.md` row 21).
    Swiss parcel/zone dispatch is wired (`applyChZoningThenFallback`, `rulepacks/registry.ts:969`).
  - **Zone identity (B2):** national Nutzungsplanung WFS (`geodienste.ch/.../ms:grundnutzung`) publishes
    zone code + label + main-use + local abbreviation (`W2`) + legal status + document link — a genuine
    `structured` win (`rulepacks/chZoning.ts` header).
  - **Context / heights:** ⭐ the **GWR federal register**, whole-country CSV, keyless, refreshed DAILY
    (`public.madd.bfs.admin.ch/ch.zip`, 946 MB) — per-building floor count (GASTW), use, year, footprint,
    joinable by EGID; plus swissBUILDINGS3D + swissALTI3D nDSM (`e5-asis-national-sweep.md` §E5-6).
    Context is GREEN.
  - **Published envelope geometry (Type A):** Baulinien served as per-parcel ÖREB restrictions
    (`ch.BauStrassenWeglinien` ×11 on one Basel parcel; Zürich Baulinien themes) — geometry inlined in
    Lucerne, doc-referenced in Basel/Zürich (3 of 26 cantons measured; `census-central.md` Type-A #6).
  - **Published parameters (Type B) — the one structural edge:** the federal INTERLIS `Typ` model
    carries a TYPED OPTIONAL **`Nutzungsziffer` (FAR) slot**. Zürich's BZO 700.100 per-code table is
    transcribed, signed, and GFA-caps the massing (`ZURICH_ZH_FAR_CATALOGUE`; a real zone `W2bIII`
    resolves a signed AZ) — `providers/resolveChFarFromCantonCatalogue.ts`; **`CH_FAR_CERTIFIED = true`,
    SIGNED 2026-07-26 by the repo owner** (`l449CertificationGates.ts` CH row).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **The remaining 25 cantons' FAR catalogues** — `CH_CANTON_FAR_CATALOGUES` holds Zürich alone; every
    other canton refuses `no-canton-catalogue` rather than fabricating a number
    (`resolveChFarFromCantonCatalogue.ts` header). Each is a transcription of that canton's per-code
    Nutzungsziffer table. — **DATA (harvest per canton) + FOUNDER (signature per canton, L-449).**
  - **Height + floors** — NOT in the WFS and NOT in the INTERLIS model; cantonal Baureglement PDF only.
    So even a FAR-limited Swiss envelope is an OPEN TOP unless height is separately sourced
    (`chZoning.ts` header). — **DATA (per-canton Baureglement height table) + FOUNDER (signature).**
  - **A generic ÖREB extract client + the per-canton geometry-inlining matrix** (Lucerne inlines
    restriction geometry, Basel/Zürich hand you a doc-ref → cantonal-WFS fallback needed) — the
    Baulinien consume path (`CENSUS.md` TOP-10 CONSUME-NOW #5). — **US (build).**
- **EFFORT:** **the engine is done; each new canton is days of harvest + one signature.** The ONE
  unblock that moves the most: **the per-canton FAR harvest** — the code path is proven at Zürich, so
  every additional canton is transcription + sign, never new machinery. Height stays refused (honest
  never-overstate) until a canton's Baureglement is sourced.

---

## NETHERLANDS  ⭐ the Type-A consume win, LIVE

- **STATUS TODAY:** **DRAWS A CITED ENVELOPE** — nationwide, keyless, certified. This is the region's
  proof that consume-before-compute ships.
- **LEGEND:** **L1 — Footprint + height** (Ω + P1 `bouwvlak` + V1 `maximum bouwhoogte`). Where no
  `bouwvlak` is drawn, it degrades gracefully to the zone footprint + a `maatvoering` on that zone.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** BRK wired in PRYZM (`pdok-nl`); NL parcel dispatch live (`census-west.md` NL row).
  - **Published envelope geometry + parameters (Type A + B) — CONSUMED, not computed:**
    `providers/resolveNlBestemmingsplan.ts` resolves the **`bouwvlak`** (buildable-envelope POLYGON,
    the `explicit-area` fill of slot P) and reads the **`maatvoering`** rule numbers with unambiguous
    SVBP2012 semantics (`"maximum bouwhoogte"` etc.), NATIONWIDE and KEYLESS via the PDOK WMS proxy
    (live probe: Utrecht-centrum → 26 m, Groningen-centrum → 24 m). Two-tier honesty: `'bouwvlak'`
    (precise footprint → `structured`) or `'bestemmingsvlak'` (zone footprint + usable maatvoering);
    refuses `no-bouwvlak` only when neither resolves (never fabricates). **`NL_BESTEMMINGSPLAN_CERTIFIED
    = true`, SIGNED 2026-08-26 by the founder (SIG-NL1)** — `l449CertificationGates.ts` NL row.
  - **Context / heights:** ⭐ 3DBAG LoD 0/1.2/1.3/2.2 (`nl-3dbag-ogcapi` live) + Kadaster 3D
    basisvoorziening — the highest-quality as-is stack in the region; floor COUNT is the one gap (BAG
    has use + area, not storeys) — `e5-asis-national-sweep.md` Part-2 NL row.
- **WHAT WE NEED TO BUILD:**
  - **A `/maatvoeringen` completeness sweep per plan** — the IMOW-annotated corpus is still a minority,
    so measure how often a usable value actually lands before trusting national coverage
    (`CENSUS.md` TOP-10 #3; the free DSO key form is the standing action for the Ozon/RP-API value layer,
    a form not a procurement). — **DATA (file the free DSO key form) + US (the completeness sweep).**
  - **The storey-derived-height sub-path stays SHUT on purpose.** `NL_STOREY_DERIVED_HEIGHT_CERTIFIED
    = false, signature: null` — a height PRYZM would DERIVE from a published storey count is an
    engineering approximation, not the authority's own number, and SIG-NL1 explicitly excluded it
    (`l449CertificationGates.ts` NL storey row). — **FOUNDER (a separate signature, if ever wanted).**
  - **Courtyard-hole honesty** already closed (L-12896, `nlBouwvlakHoles.test.ts`) — no action.
- **EFFORT:** **DONE and live; the remaining work is measurement (days), not building.** The ONE
  unblock: **file the free DSO key** so the `maatvoering` value layer can be swept for completeness.

---

## BELGIUM (Flanders / Wallonia / Brussels)

- **STATUS TODAY:** NO COVERAGE YET (no Belgian envelope pack). Flanders serves thin drawn lines;
  Wallonia refuses at the provider by doctrine; distances everywhere are in text.
- **LEGEND:** **L2 — Aligned to street** where a RUP drew a *bouwlijn* (Flanders); otherwise
  **L7-adjacent** structured-rules (the gabarits/distances are prose), so the honest reachable output
  is a structured refusal, not an envelope.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** GRB CAPAKEY (Flanders), CADMAP (Wallonia), UrbIS CC0 (Brussels) — all served,
    joined by spatial containment (`census-west.md` BE rows). Wallonia has a parcel provider that
    **refuses by doctrine** (`walloniaParcelProvider.ts:37`, a discretionary-jurisdiction refusal —
    RECONCILIATION L7 row).
  - **Zone identity + published geometry (Type A, thin):** **Flanders — 951 typed `bouwlijnen`** inside
    RUP line layers, each with its prescription-article join (`svnaam:"Bouwlijn"`, `svnr:"art. 3.2.1"`,
    `algplanid`) + 75k zone polygons + the only SPARQL planning register in Europe; **Wallonia** — 43,797
    Plan-de-secteur zones each with a CoDT-article + WALLEX legislation deep-link; **Brussels** — PRAS
    zones + 609 PPAS perimeters with per-plan `DOC_URL` (`census-west.md` Type-A headline #4 + BE rows,
    `CENSUS.md` row 10).
  - **Context / heights:** 3D GRB LoD1 (Flanders) + UrbIS 3D LoD2 CC0 (Brussels) + Wallonia MNH height
    raster — regional trisection, all green (`e5-asis-national-sweep.md` Part-2 BE row).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **The numeric distances/gabarits, extracted per region** — Flanders' `voorschrift` text, Wallonia's
    prescriptions, Brussels' RRU Titre I gabarit rules are ALL text; the drawn lines give you WHERE, never
    HOW MUCH (`census-west.md` BE verdict). — **DATA (extract per region) + FOUNDER (signature per region).**
  - **A Flanders `bouwlijn` consume adapter** (the 951 lines → alignment/enclosed-ring geometry, article
    join carried as provenance F3). — **US (build) — the cheapest Belgian increment, but thin.**
  - **A BE parcel provider** wired into the national resolver (Flanders/Wallonia/Brussels boxes exist
    but only Wallonia's refusing provider is in tree). — **US (build).**
- **EFFORT:** **days for the Flanders line consume + parcel wiring; weeks for any real envelope** (the
  numbers are text, region by region). The ONE unblock: **decide whether Belgium is worth per-region
  text extraction at all** — the drawn-line channel is real but thin, and the distances are the whole cost.

---

## LUXEMBOURG  ⭐ the cheapest full adapter in Europe — built, blocked on two named things

- **STATUS TODAY:** NO COVERAGE YET (the adapter code is built; it draws nothing because the parcel key
  is unusable and no envelope gate is signed). This is a near-miss, not a green field.
- **LEGEND:** **L3 — Free-standing, ratios** (COS coverage + CUS FAR close slot P and give yield D1);
  **L1 lines** (the `ALIGN_A_RESP` building lines). But **no height and no setback distances are
  published**, so slot V is unresolved → the honest first output is A.5's *"footprint derived; vertical
  extent unresolved"* (an unbounded prism), not a full solid.
- **WHAT WE ALREADY HAVE:**
  - **One CC0 national GeoPackage holds nearly everything** (`data.public.lu` → `pag.gpkg.zip`, 617 MB,
    monthly-fresh): **653,315 cadastral parcels** (`NUM_CADAST`), **46,191 zones** with national
    `CATEGORIE` codes, **2,442 `PAG_PAG_ALIGN_A_RESP` "alignments to respect" = building lines as
    geometry**, and **COS / CUS / CSS / DL typed maxima at 93.7 % strictly-positive fill on the 3,017
    new-quarter zones** (`census-west.md` Type-A headline #2 + LU row, `CENSUS.md` row 12). Adapter code
    built: `countryAdapters/lu/{luPagGpkgClient,luPagProvider,luRuleMapper,luJurisdiction}.ts`.
  - **Routing:** `claimsNation("LU")` registered; a Luxembourg click is honestly labelled rather than
    misattributed to FR/DE (`parcelProviders/registry.ts:359`).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **A usable parcel key.** `NUM_CADAST` is NOT a key — "N/A" on 4.9 % of rows, 15,110 duplicate
    `(commune,number)` groups, no cadastral section served — so a naive provider returns the wrong
    polygon silently; it is registered as a footprint-fallback for exactly this reason
    (`parcelProviders/registry.ts:365`). Fix = a compound key or a section field. — **US (build) +
    possibly DATA (a section-carrying parcel layer).**
  - **The COMPILE mapping signed** — `luRuleMapper` maps COS/CUS/CSS/DL onto the envelope scalars, but
    no `LU_..._VERIFIED` gate exists in `l449CertificationGates.ts`, so publication is unauthorised.
    A hand-written LU rule pack is a declared STOP-BUILD — the GPKG IS the rule pack (E5 verdict). —
    **FOUNDER (an L-449 signature over the COS/CUS→envelope mapping).**
  - **Height sourced separately** — none in the GPKG; the 18,743 existing-quarter (QE) zones carry zero
    numerics (DOCX-bound). Until height lands, LU is an open-top footprint. — **DATA (a height source /
    per-commune PAP extraction for QE zones).**
  - **Bbox precedence** — LUXEMBOURG_BBOX sits ENTIRELY inside FRANCE_BBOX and overlaps GERMANY_BBOX; the
    `claimsNation` resolver handles it, but border towns refuse (`luJurisdiction.ts` overlap audit). —
    **US (already routed; note only).**
- **EFFORT:** **days, not weeks — the data is one download and the mapper is written.** The ONE unblock:
  **a signature on the COS/CUS→envelope mapping** — that plus a working parcel key turns Luxembourg into
  a live L3 footprint-and-yield adapter with the building lines as a bonus.

---

## POLAND (POG reform corpus)

- **STATUS TODAY:** PARTIAL — the parcel leg is LIVE; the envelope is a **height-cap COMPILE pack built
  2026-09-03** that binds height and honestly WITHHOLDS FAR/coverage. Today's live output is a partial
  envelope / cited refusal, because the national POG corpus is mid-fill (draft samples).
- **LEGEND:** **L3 — Free-standing, ratios** by intent (POG gives FAR + coverage + height per *strefa
  planistyczna*), but the ratio denominator is unresolved (see below), so the reachable-today output is
  the A.5 rung *"vertical limit derived; footprint unresolved as a ratio"* — a metric height cap on the plot.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** GUGiK ULDK point query, keyless, LIVE — routed on `claimsNation("PL")`, server proxy
    `/api/parcel/pl` wired 2026-09-02 (`parcelProviders/registry.ts:349`; `plUldkClient.ts`).
  - **Published parameters (Type B — the best in Europe):** Poland's 2023 reform (Dz.U. 2023 poz. 1688)
    added the `plan ogólny gminy` and its national APP GML 2.0 schema; every `app:StrefaPlanistyczna`
    carries FOUR national-mandatory, versioned ceilings — **`maksWysokoscZabudowy` (height, m),
    `maksNadziemnaIntensywnoscZabudowy` (FAR), `maksUdzialPowierzchniZabudowy` (coverage %),
    `minUdzialPowierzchniBiologicznieCzynnej` (green %)** — plus **`ObszarUzupelnieniaZabudowy`** (infill
    polygons, Type-A-shaped) and a partial **`wektor-lzb` "Linie zabudowy"** national WMS layer
    (`census-central.md` Type-A #7 + PL row, `CENSUS.md` row 23). The COMPILE pack is written:
    `rulepacks/plPogEnvelope.ts`.
  - **Context / heights:** LoD1 national ×4 vintages + LoD2 2017 (WMS live) + BDOT10k buildings national
    GeoParquet (`pl-bdot10k-buildings-geoparquet`, 78.6 MB) + NMT/NMPT LiDAR (`e5-asis-national-sweep.md`
    §E5-3, Part-2 PL row).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Resolve the *działka budowlana* denominator** so FAR and coverage can bind. Their statutory
    denominator is the BUILDABLE plot (upzp art. 2 pkt 12), NOT the cadastral *działka ewidencyjna* the
    ULDK leg serves; multiplying POG FAR × cadastral area is the C63 Aarhus denominator trap, so the pack
    binds ONLY height (denominator-free) and carries FAR/coverage as withheld cited facts
    (`plPogEnvelope.ts` header, "THE FLIP POINT"). — **DATA (a served buildable-plot geometry or a
    per-plan rule) — the single flip that upgrades the grade visibly.**
  - **Wait for in-force POG data.** The official ministry sample is `elaboration` (a DRAFT) throughout,
    so ceilings compile with a "NOT in force" caveat; the national POG deadline was 2026-08-31 and the
    corpus is filling; the RU service endpoints are undiscoverable until ≥2026-11-30
    (`plPogEnvelope.ts` header "LEGAL FORCE"; `census-central.md` PL verdict). — **DATA (the corpus fills
    on its own; re-check RU endpoints after 2026-11-30).**
  - **Wire the POG pack into the dispatcher + an L-449 signature.** The COMPILE module is built but no
    `PL_..._VERIFIED` gate is registered in `l449CertificationGates.ts` yet. — **US (wire) + FOUNDER (sign).**
- **EFFORT:** **the height-cap half is days from live** (pack built, parcel live — it needs dispatcher
  wiring + a signature + real in-force plans). Full FAR/coverage is blocked on the denominator DATA. The
  ONE unblock: **resolve the działka-budowlana denominator** — it flips FAR and coverage from withheld to
  binding and makes Poland a full L3 adapter.

---

## CZECHIA

- **STATUS TODAY:** NO COVERAGE YET (no CZ pack, no CZ adapter). The buildable-territory polygons are
  emerging as served geometry; the numbers are plan text.
- **LEGEND:** **L1/L3 emerging** — the national standard serves "Zastavitelné území" (buildable
  territory) as polygons, which is a P1-shaped footprint, but with no served height/FAR the honest output
  is STRUCTURED-RULES turning into CONSUME-GEOMETRY.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** RÚIAN cadastre, daily-change feed; `obec_kod` (municipality) on plan features
    (`census-central.md` CZ row). No CZ parcel provider wired in PRYZM yet.
  - **Published geometry (Type A, pilot fill):** the national standardized ÚP layer set (`mapy.gov.cz/
    server/rest/services/UPD/DUP`, keyless ArcGIS REST) serves **"Zastavitelné území" = 638 polygons**
    (pilot fill), **"Plochy s rozdílným způsobem využití" (zoning) = 96,078**, and regulation-plan-element
    parts = 311 (`census-central.md` Type-A #5 + CZ row, `CENSUS.md` row 24).
  - **Context / heights:** INSPIRE BU WFS keyless live (`bu:Building` + use), but `heightAboveGround` nil
    and no floors on the feature; floors (počet podlaží) are the RÚIAN VFR bulk claim, DOC-level, one
    parse owed (`e5-asis-national-sweep.md` §E5-10, Part-2 CZ bonus row).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **The numeric indices (height/FAR/coverage), extracted from plan text** — they are NOT served as data
    (`census-central.md` CZ row: "numerics text-bound"). — **DATA (extract per plan) + FOUNDER (signature).**
  - **A CZ adapter** (parcel provider on RÚIAN + a "Zastavitelné území"/zoning consume path) + enumeration
    of the DUP_HLV/DUP_ZCU/DUP_VPSOA services where regulation-plan LINE content may sit
    (`census-central.md` HONEST GAPS #5). — **US (build + probe).**
- **EFFORT:** **days for the polygon/zone consume; weeks for a numeric envelope.** The ONE unblock:
  **build the CZ adapter on the served buildable-territory + zoning polygons** — it is a cheap emerging
  CONSUME win; the numbers wait on text extraction, so pair it with a national refusal until then.

---

## SLOVAKIA

- **STATUS TODAY:** NO COVERAGE YET. The cadastre is excellent and live, but routing is deliberately
  deferred (a named refusal today) and there is NO national machine-readable planning channel.
- **LEGEND:** none reachable — no planning geometry or parameters are served nationally, so there is no
  legend to select; the honest output is a cited national refusal.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** the ŽBGIS/ESKN cadastre is LIVE + keyless and was LIVE-PROVEN at Bratislava
    (`skParcelProvider.ts`/`skEsknClient.ts` carry the endpoint + the recorded parcel: register-C id
    2090872505, parcel №15, k.ú. 2933, 832 m²). CC-BY-tagged (`census-central.md` SK row).
  - **Routing is DEFERRED, not broken:** `SVK` is a **refusal-only neighbour** in the national resolver's
    boundary set, so `claimsSlovakia` is FALSE everywhere and a Bratislava click resolves a NAMED refusal
    (`claimed-by-unmodelled-neighbour`) — strictly safer than an unclassified point (`skJurisdiction.ts`).
  - **Context / heights:** carried on banked rows; no new probe (`census-central.md` SK row).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Do NOT build planning extraction yet.** There is no national planning register; the state planning
    information system is due ~2028 — the census verdict is explicit: "do not build extraction before it
    lands" (`census-central.md` SK verdict). — **DATA (wait for the ~2028 national system) + FOUNDER
    (decision: is Slovakia in scope before then?).**
  - **Promote SVK to a claimable country** (move SVK from `neighbours` to `countries.SVK`, add the
    prefilter, add Hungary as a new refusal-only neighbour for border integrity) — a coordinated boundary
    wave, not a solo edit (`skJurisdiction.ts` `SK_ROUTING_DEFERRAL`). Unlocks the LIVE cadastre only. —
    **US (a boundary wave).**
- **EFFORT:** **the parcel leg is one boundary wave (days); the envelope is a multi-year wait.** The ONE
  unblock (parcel only): **the SVK boundary promotion.** For the envelope, nothing PRYZM builds moves it —
  it waits on the Slovak state.

---

## HUNGARY

- **STATUS TODAY:** NO COVERAGE YET — OPAQUE. The country adapter is a commercial relationship, not a probe.
- **LEGEND:** none reachable — plan geometry is view-only WMS; no open machine channel exists.
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** the national cadastre is delivered by Lechner Tudásközpont via TAKARNET/Geoshop and is
    **PAID**. The one keyless service — the INSPIRE CP WFS (`inspire.lechnerkozpont.hu/geoserver/CP/ows`,
    `ows:Fees` NONE) — covers ONLY the Mesterszállás sample municipality (1,774 parcels), so a Budapest
    click returns numberMatched=0 (LIVE-PROBED 2026-09-03; `huParcelProvider.ts`, registry note at
    `parcelProviders/registry.ts:398`). Registered as footprint-fallback; `claimsNation("HU")` is false
    (HUN not yet a modelled country) → inert-but-safe (`huJurisdiction.ts`).
  - **Planning:** E-TÉR/Lechner WMS/WMTS is view-only; no open WFS found; the rules (OTÉK) are legal text
    (`census-central.md` HU row + verdict).
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **A commercial data relationship with Lechner** for the cadastre and any machine planning access —
    this is procurement, not engineering (`census-central.md` HU verdict: "the country adapter is a
    commercial relationship, not a probe"). — **FOUNDER (a commercial decision) + DATA (paid feeds).**
  - **OTÉK rule extraction** once a planning channel exists — legal text today. — **DATA + FOUNDER.**
- **EFFORT:** **not an engineering estimate — a business decision.** The ONE unblock: **a founder
  decision on whether to pay Lechner.** Until then Hungary is honestly opaque and every click falls to
  the universal footprint.

---

## SLOVENIA (Gradbena meja)  ⭐ a national Type-A consume win, one flip from live parcels

- **STATUS TODAY:** NO COVERAGE YET as a drawn envelope — but the parcel adapter is BUILT and dormant on
  one routing flip, and the building-boundary line geometry is served nationally, keyless, ready to consume.
- **LEGEND:** **L1 — Footprint + height** in shape (the `Gradbena meja` = "construction boundary" line
  closes the buildable figure = slot P), but the FZ/FI numerics are municipal text, so slot V/D1 is
  unresolved → the honest first output is A.5's *"footprint from the drawn boundary; height unresolved."*
- **WHAT WE ALREADY HAVE:**
  - **Parcel (Ω):** GURS Kataster nepremičnin WFS served KEYLESSLY, CC BY 4.0, LIVE-PROBED 2026-09-03
    (Ljubljana → KO_ID 1725, ST_PARCELE 2468/4, 1896 m²); `siParcelProvider.ts` carries the parser +
    recorded fixture. **DORMANT:** SVN is a refusal-only neighbour, so `claimsNation("SI")` is false
    everywhere until a boundary wave promotes SVN to a claimable country (a single-line flip EE/LT/PL/LU/SE
    already got) — and the server proxy `/api/parcel/si` is not yet wired (`parcelProviders/registry.ts:388`).
  - **Published envelope geometry (Type A — national):** the national planning WFS
    (`ipi.eprostor.gov.si/wfs-si-mnvp-pa/ows`, keyless) serves **`REG_CRTE_OPN` = 10,869 regulation LINES
    typed `Gradbena meja`**, plan-linked (`ID_PA`) and validity-dated (`DATUM_VEL`), plus
    **`REG_POVRSINE_OPN` = 13,632 regulation surfaces** and **`NRP_OPN` = 403,788 land-use polygons** —
    the DK-byggefelt shape (geometry + type + plan + validity) on a national keyless endpoint
    (`census-central.md` Type-A #4 + SI row/verdict, `CENSUS.md` row 27 + TOP-10 CONSUME-NOW #10).
  - **Context / heights:** ⭐ the FIRST country outside Spain where per-FLOOR geometry is served openly —
    `SI.GURS.KN:ETAZE` (floors) with per-floor altitude + height, `STAVBE` with floor count + dwellings +
    existing GFA, all keyless CC BY 4.0 (`e5-asis-national-sweep.md` §E5-7, Part-2 SI row). Best context
    in the region after NL.
- **WHAT WE NEED TO BUILD THE ENVELOPE:**
  - **Flip the parcel routing on** — the coordinated boundary wave that promotes SVN to `.countries`
    (regionCode "SI") + adds the `["SVN", isInSlovenia]` prefilter, landing TOGETHER with Croatia + Hungary
    for border integrity (queued: `audit/europe-adapters-2/2026-09-02/barrel-additions-si.txt`), plus the
    `/api/parcel/si` server-proxy row. — **US (a boundary wave + proxy wiring).**
  - **A `Gradbena meja` consume adapter** — route `REG_CRTE_OPN` lines + `REG_POVRSINE_OPN` surfaces into
    the enclosed-ring `explicit-area` path, carrying plan id + validity as provenance (F2/F3). This is the
    cheap CONSUME win (`CENSUS.md` TOP-10 #10). — **US (build).**
  - **The FZ (coverage) / FI (FAR) numerics + height, extracted from municipal PIP text** — not served as
    data (`census-central.md` SI row: "numeric FZ/FI stay in municipal text"). — **DATA (extract per
    municipality) + FOUNDER (signature).**
- **EFFORT:** **days — the geometry is served and the parcel adapter is built; this is wiring + a
  boundary wave, not research.** The ONE unblock: **the SVN boundary promotion + the Gradbena-meja
  consume path** — Slovenia becomes a live L1 footprint adapter, with the numbers following via text
  extraction (honest open-top / refusal until then).

---

## Region cross-cuts (what one investment unblocks many)

- **The L4 shaped-envelope engine** (`HEIGHT_PROPORTIONAL_OFFSET` kind + inclined-plane primitive,
  both in-flight/untracked — RECONCILIATION §0, VALIDATION-MATRIX §A/§B) is the single highest-leverage
  BUILD in the region: it is the gate for **Germany** (Abstandsflächen 0,4·H) and it also serves DE §6,
  Paris crown, ES coronación and NL dakhelling. Land it once.
- **The `explicit-area` enclosed-ring consume path** (proven live for NL `bouwvlak`) is the same shape
  needed for **Slovenia** (`Gradbena meja`), **Germany** (`BP_BauGrenze`/`UeberbaubareGrundstuecksFlaeche`),
  **Belgium/Flanders** (`bouwlijn`), **Luxembourg** (`ALIGN_A_RESP`). Consume-before-compute is the region's
  cheapest lever — the NL pack is the template every one of these copies.
- **The national-boundary resolver waves** gate the LIVE parcel legs of **Slovenia, Slovakia, Hungary,
  Poland and Luxembourg** — the code is written per country; what is missing is the coordinated promotion
  (with neighbour-integrity rings) into `jurisdiction/data/nationalBoundaries.json`. These are batched,
  not per-lane.
- **Every "draw" is gated by a human signature (L-449).** CH/Zürich and NL are signed and live; Poland,
  Luxembourg, Belgium, Germany, Slovenia, Austria, Czechia each need a FOUNDER signature over the
  transcription/mapping BEFORE any number publishes — a pack may never sign its own transcription
  (`l449CertificationGates.ts` header, the Madrid defect).
