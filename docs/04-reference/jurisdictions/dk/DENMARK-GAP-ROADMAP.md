# Denmark — gap-by-gap envelope-realism roadmap

> **What this is.** The founder's Denmark gap roadmap: the honest, ordered queue of what stands
> between today's signed legislation extraction and a fully-realistic Danish buildable envelope. Each
> gap is a **deliverable** with the same four-part shape:
> **find official source → extraction method → implementation path → measured result OR honest
> cannot-obtain.**
>
> **⚠ THE ONE HONESTY INVARIANT.** Every gap below lifts **ENVELOPE REALISM** (and/or the
> HEIGHTS-LOD, CONTEXT, PARCEL, TERRAIN axes) — **NONE of them changes the ~96% national LEGISLATION
> rate.** The legislation rate stays (`LEGISLATION-RATE.md`, VERIFIED-LIVE 2026-07-23); it is a
> *legislation-fill* measurement, and these are *geometry-realization / context / access* gaps. No
> gap is closed by fabricating a number: every unresolved gap keeps its honest `unknown` / withhold,
> cites its Plandata field + BR18, and refuses a guessed coverage %, setback, courtyard dimension, or
> physical height.
>
> Companion: [`DENMARK-LEGISLATION-EXTRACTION.md`](./DENMARK-LEGISLATION-EXTRACTION.md) (the signed
> PART A/B/C mapping) · [`dk-PLANDATA-ENVELOPE-MAPPING.md`](./dk-PLANDATA-ENVELOPE-MAPPING.md) (L-449).

---

## The queue at a glance

| # | Gap | Axis it lifts | Legislation rate | Honest status |
|---|---|---|---|---|
| **G1** | Density denominator scope (`beregningsgrundlag`) | ENVELOPE (FAR usability) | **unchanged** | current rule CORRECT — keep withhold; wire the scope attribute |
| **G2** | Setbacks (`byggelinjer`) | ENVELOPE (geometry) | **unchanged** | model as `BuildingLineConstraint`; schema NOT verified — probe |
| **G3** | Byggefelt semantics / binding flag | ENVELOPE (coverage + placement) | **unchanged** | `binding:'unknown'` until DescribeFeatureType-probed; NEVER `area/parcel` |
| **G4** | LoD2 building context adapter | HEIGHTS/LOD + CONTEXT | **unchanged** | ESTIMATED → VERIFIED only after the N=500 measurement runs |
| **G5** | Buildable-depth from lokalplan TEXT | ENVELOPE (depth) | **unchanged** | ordinance-pipeline text extraction; study-mode fallback, NEVER `legalDepth` |
| **G6** | Courtyard / friareal / perimeter-block | ENVELOPE (biggest realism failure) | **unchanged** | reuse Barcelona profunditat engine; NEVER FAR→footprint |
| **G7** | maxCoverage (ground-coverage %) | ENVELOPE (coverage) | **unchanged** | keep `null` today (CORRECT); 4-tier resolver; NEVER `farRatio` |
| **G8** | Parcel provider (Matriklen) | PARCEL (independent of legislation) | **unchanged** | access-deferred (MitID); 3 solution paths; OSM fallback |
| **G9** | The honest ceiling (last ~4%) | — (a truth statement) | **is** the ~96% ceiling | ~96% digital / ~87% pure-structured; **NOT 100%** — structural + measurement, not fabricatable |
| *tail* | Terrain (DHM) · Heritage (FBB) · Article-level citation completeness | TERRAIN / CONTEXT / provenance | **unchanged** | live-probe follow-ups; queued, not fabricated |

> Numbering note: this canonical set consolidates four iterative steers. The fixed anchors are
> **G1** density-scope, **G4** LoD2, **G6** courtyard, **G7** coverage, **G8** parcel, **G9** the
> ceiling; the coverage and courtyard clusters are kept as distinct deliverables (binding-flag G3
> gates both). Founder topic-label reconciliation: **#1**→G1 · **#2/#5/#10** byggelinjer-setbacks→G2
> (+ 3-phase impl) · **#3/#7** byggefelt→coverage→G3+G7 · **#4/#9** LoD2→G4 · **#6** courtyard/friareal
> (Barcelona-reuse)→G6 · **#8** parcel-access→G8 · **#11** last-4% ceiling→G9. Terrain, heritage, and
> citation-completeness are the tail queue.

---

## G1 — Density denominator scope (`beregningsgrundlag`) — **MOST IMPORTANT** (gates FAR usability)

**The problem.** BR18 defines *bebyggelsesprocent = etagearealets procentvise andel af grundens areal*
— the denominator is **normally the parcel/grund**, **BUT** a local plan can legally redefine it to
**one property**, **several parcels**, or a **whole development area**. The engine therefore **cannot
assume** parcel scope; treating every `bebygpct` as parcel-FAR is the *envelope-overstates-on-
partial-data* failure class.

- **Official source.** Plandata WFS — the denominator-scope attribute, **likely** `beregningsgrundlag`
  / `beregningsmetode` / `omfangstype` (**NOT yet confirmed** — probe `DescribeFeatureType` on the
  `lokalplan` / `delområde` / `ramme` layers). BR18 §168–186 for the legal definition.
- **Extraction method.** `parseDkDensityScope()` → `'parcel' | 'property' | 'planningArea' | null`,
  mapping the documented Danish value phrasings. Confidence tiers: **GIS field exists ★★★★★** /
  schema-doc ★★★★ / local-plan-text ★★★.
- **Implementation path.** Wire the confirmed attribute into `mapPlandataToZoningRecord`; emit
  `plotRatioFAR` **only** at `parcel` scope, else `null` + cited reason. The engine FAR denominator
  (`farLimitedHeight.ts`) is hardwired to parcel area, so this is the only correct feed.
- **Result / honest state.** **The current rule "unknown scope → withhold FAR" is CORRECT — keep it.**
  Unknown ≠ parcel; withholding under-states rather than over-states. Closes when the attribute name
  is probe-confirmed and ingested. **Legislation rate: unchanged.**

---

## G2 — Setbacks (`byggelinjer`) — model, never fabricate

**⚠ DISTINGUISH THREE DANISH CONCEPTS — do NOT conflate:**

| Concept | What it is | Envelope meaning |
|---|---|---|
| `byggelinje` | building line | *potential* setback geometry |
| `vejbyggelinje` | road reservation / restriction | **NOT** an ordinary setback |
| `byggefelt` | buildable-field polygon | a footprint area (that's G3/G6/G7, not a setback) |

- **Official source.** A **separate** Plandata dataset — **schema NOT verified** (probe
  `theme_pdk_byggelinje_*` via `DescribeFeatureType`; it is not carried on the plan feature).
- **Extraction method.** Once confirmed, extract the line/polygon geometry + any distance/binding
  attributes.
- **Implementation path.** Model as
  `BuildingLineConstraint { source:'plandata', geometry: LineString|Polygon, binding:'unknown', distanceM: null }`.
  **NEVER** map any line to `frontSetback = 5` (or any front/rear/side number).
- **⚠ The hard part = edge-matching, NOT orientation.** `matchBuildingLineToParcelEdge()` matches a
  line to a parcel edge by **geometry-intersection / direction / nearest-edge** — **NOT** `front=north`
  (orientation varies per parcel). Geometry op: parcel → **offset-inward-per-edge** → buildable
  polygon → apply FAR → extrude.
- **3-PHASE order.** **P1** wire byggelinjer (removes obvious overbuild) · **P2** enable
  **block-derived-alignment (the Barcelona engine) for DK** (shared with G6) · **P3** lokalplan-text
  extraction (G5). Danish depth patterns: `byggedybde` / `bygningens dybde` / `maksimal dybde`;
  courtyard patterns: `gårdrum` / `friareal` / `opholdsareal` / `ubebygget areal`. Emit
  `buildableDepthM:{ value, source:'lokalplan §X.X', confidence:'official-text' }` — **NEVER fabricated.**
- **Result / honest state.** `setbacks = null` today (`separate-dataset`, `null` ≠ `0`). If verified
  and wired: envelope realism ~70–80% → ~85%. **Legislation rate: unchanged.**

---

## G3 — Byggefelt semantics / binding flag (gates G6 placement + G7 coverage)

**The problem.** A `byggefelt` is an "area within which construction may occur" (polygon) — Denmark's
**only** potential footprint/coverage source. **⚠ `vedtaget` = ADOPTED ≠ BINDING** (Danish plans mix
binding provisions with explanatory graphics).

- **⚠ Do NOT compute `coverage = byggefelt.area / parcel.area`** and **do NOT** use the polygon as a
  footprint until binding is PROVEN — that overstates (the exact realism mistake the DK audit caught).
- **Official source.** `theme_pdk_byggefelt_vedtaget` (57,031 national features). The **binding flag**
  is the gate: `bygvejledende` (advisory) / `iomfangreg` (extent regulated) / `bygkunifelt` (building
  only in field) — **DescribeFeatureType-probe these**, plus the plan model-doc for binding semantics.
- **Extraction method.** Model as
  `BuildableFootprintConstraint { geometry: Polygon, binding:'unknown', confidence:'unknown' }`.
- **Implementation path.** `binding:'unknown'` until a flag is probe-confirmed **and** the
  Danish-planner sign-off lands (`VERIFICATION.md`). This gate is shared: G6 uses a **binding**
  byggefelt as the footprint; G7 tier-1 uses a **binding** byggefelt for coverage.
- **Result / honest state.** Blocks both G6 tier-1 and G7 tier-1 until verified. If binding → footprint
  confidence ★ → ★★★★, envelope **+10–15 pts**. **The missing piece is geometry-realization, not
  rules. Legislation rate: unchanged.**

---

## G4 — LoD2 building context adapter — **the biggest remaining DK CONFIDENCE upgrade (ESTIMATED → VERIFIED)**

Target country-neutral model:

```
BuildingContext {
  id,
  geometry: Polygon | MultiSurface,
  height:  { value, method:'lidar' },
  roof:    { form },
  attributes: { floors, use, year },
  source:  { geometry:'GeoDanmark', height:'DHM', attributes:'BBR' },
  confidence
}
```

**5-step adapter** (design; code home `packages/site-context-data/providers/dk/`):

1. **GeoDanmark** building footprints (WFS / API) → polygon + building id + object type.
2. **Danmark i 3D** CityGML **LoD2 roof surfaces** — ⚠ **NOT** footprint+height extrusion (that is
   LOD1); require the real `roofSurface` / `wallSurface`.
3. **DHM height = DSM − DTM LiDAR** raster sampling — ⚠ do **NOT** trust the planning `maxbygnhjd`
   attribute for **physical** height; physical height = roof-elev − terrain-elev.
4. **BBR** semantic join via building ID → use / floors / yearBuilt.
5. **COVERAGE MEASUREMENT** — ⚠ **do NOT claim 95%.** Sample **N=500** (100 each
   Copenhagen / Aarhus / Odense / Aalborg / rural); measure the **geometry-fill / LoD2-roof-fill /
   LiDAR-height-fill** fractions.

**Expected (pre-measurement, ESTIMATED):** footprint ~97–99% · height ~95% · roof ~90–95% · BBR ~95%+
→ DK LoD2 ~93–95% — but this stays **ESTIMATED until the N=500 measurement runs**, then **VERIFIED**.

- **Result / honest state.** Upgrades **HEIGHTS/LOD + CONTEXT**. **Legislation rate: unchanged.** No
  fill % is claimed before the measurement.

---

## G5 — Buildable-depth from lokalplan TEXT (feeds G6)

- **Official source.** The lokalplan document text (`doklink`), e.g.
  *"bebyggelsen må opføres i en dybde af 12 meter"* → `buildingDepth_m = 12`.
- **Extraction method.** The shared ordinance-extraction pipeline (born-digital text branch) detects
  the depth clause and its value + unit.
- **Implementation path.** Emit a cited `buildingDepth_m` with `confidence:'text-derived'`; where no
  clause exists, **study-mode fallback ONLY** — `{ mode:'study', derivedDepth, confidence:'low' }`,
  **NEVER** `{ legalDepth }`.
- **Result / honest state.** Queue. A stated depth → constraint; silent → study-mode or `null`.
  **Legislation rate: unchanged.**

---

## G6 — Courtyard / friareal / perimeter-block — **fixes DK's biggest realism failure**

**The problem.** Karré (perimeter) blocks currently **extrude the whole parcel** → courtyards vanish →
density is **overstated**. The fix is a real building-band + courtyard-void placement.

- **Solution:** a `dkEnvelopeGeometryProvider` with a **source hierarchy**:
  1. **binding byggefelt polygon** (G3) → use as the **footprint**, NOT the whole parcel;
  2. **byggelinjer** (G2) building band;
  3. **lokalplan depth TEXT** (G5) → `buildingDepth_m`;
  4. **study-mode fallback ONLY** → `{ mode:'study', derivedDepth, confidence:'low' }`, **NEVER**
     `{ legalDepth }`.
- **⭐ KEY ARCHITECTURAL REUSE:** the **Barcelona perimeter-block / *profunditat edificable* engine
  already exists** — reuse it for DK karré courtyards (street-edge + allowed-depth → building band +
  courtyard void). Do **not** reinvent.
- **`friareal`** = required outdoor area **RELATIVE to the development** (NOT "leave 30% empty" — the
  denominator matters; **never** convert blindly to coverage).
- **Schema.** Extend `BuildableEnvelope` with
  `placement:{ source:'byggefelt'|'buildingLine'|'derived' }` +
  `openSpace:{ courtyard:bool, source }`.
- **Result / honest state.** **NEVER FAR→footprint; NEVER fabricate courtyard dimensions.** Queue.
  **Legislation rate: unchanged.**

---

## G7 — maxCoverage (ground-coverage %) — keep `null` today (CORRECT)

**⚠ The core distinction.** `bebyggelsesprocent` = floor-area / land-area = **FAR**, **NOT**
footprint / land = coverage (the same FAR admits many coverages). So **NEVER `maxCoverage = farRatio`.**

- **4-tier resolver:**
  1. **binding byggefelt** (G3) → `area(byggefelt ∩ parcel) / parcelArea` — **ONLY if `binding=true`
     PROVEN** (DescribeFeatureType the flag `bygvejledende` / `iomfangreg`); confidence `official`.
  2. **explicit lokalplan clause** *"der må højst bebygges 40% af grunden"* → `coverage = 0.40`,
     `densityScope:'parcel'`, confidence `text-derived` — via a new `coverage_rule` classifier
     detecting *"bebygges højst … % af grunden/grundareal"*, **REJECTING `bebyggelsesprocent` /
     `etageareal` (those are FAR)**.
  3. **explicit kommuneplan** clause (same shape).
  4. → `null, reason:'no authoritative footprint ratio'`.
- **Schema.**
  `maxCoverage:{ value, source:'byggefelt'|'lokalplan'|'kommuneplan'|null, confidence:'official'|'text-derived'|null }`.
- **Result / honest state.** `maxCoverage = null` today (CORRECT). Expected usable **~10–30%
  nationally** (higher in Copenhagen). **NEVER a BR18 national coverage; NEVER existing-building
  coverage as permitted. Legislation rate: unchanged.**

---

## G8 — Parcel provider (Matriklen) — access-deferred (MitID)

- **Official source.** Matriklen / `matrikel-dk` (`jordstykke`), SDFI — national, **survey-grade**,
  behind **Datafordeler** (Danish **MitID** identity gate, same class as Swedish BankID).
- **Implementation path.** `dkMatrikelParcelProvider.ts` is a **deferred stub** (`fetchParcelAtPoint`
  → `null`); OSM footprint fallback. Datafordeler adapter = a **single method-body swap** behind the
  `// DEFERRED:` seam.
- **3 solution paths (the access seam).**
  - **(A) official Datafordeler** — via a Danish legal-entity/partner + **MitID Erhverv**; swap the
    stub `return null` for `fetch(services.datafordeler.dk/…)`, **NO engine change**.
  - **(B) municipal open-data mirrors** — labeled `source:'municipal-open', confidence:'regional'`,
    **NEVER `national-cadastre`**.
  - **(C) partner ingestion** (most practical) — a Danish architect / planner / developer /
    municipality with access → secure ingestion → PRYZM canonical parcel API.
- **Activation.** env `DK_DATAFORDELER_CLIENT_ID` / `_SECRET` + telemetry
  `parcel_provider_unavailable{ country:DK, reason:credential_missing }`.
- **⚠ CRS.** compute area on the **EPSG:25832 polygon (shoelace)** — **NEVER on WGS84 lat/lon.** OSM
  fallback allowed but labeled `source:'OSM', confidence:'approximate'` — **NEVER `cadastre`.**
- **Result / honest state.** **access-deferred — a credential/access gap, NOT a code gap** (C58 §1.4,
  not fabricatable). Never claim live. **The founder is exploring removing the MitID dependency** — to
  be done **without degrading honesty** (no fabricated parcel). **The legislation score is INDEPENDENT
  of the parcel API** (stays ~96%; PARCEL axis = access-deferred). **Legislation rate: unchanged.**

---

## G9 — The honest ceiling (the last ~4%) — **can DK reach 100%? NO**

- **The honest answer.** Denmark's ceiling is **~96% digital-data / ~87% pure-structured** byzone fill
  (`LEGISLATION-RATE.md`, L-609/L-611). The residual **~4–13%** is: born-digital-text gaps (recoverable
  OCR-free by ramme-id anchoring), a scanned-lokalplan OCR minority (~1.8 pp), and genuinely
  missing-or-low-quality / plan-omitted numbers (recreational zones that cap no building,
  `kortbilag`-drawing-only dims, BR18-deferred).
- **Why it is not 100%.** This is a **MEASUREMENT + structural-limit** question, **NOT** fabricatable
  to 100%. The residual is a data-fill limit at source, not an access wall we can remove, and not a
  number we may invent (C58 §1.4). Do **NOT** claim 100%.
- **Honest framing (mirrors Germany's §34-floor honesty).** State the ceiling as the ceiling: ~96% is
  the ceiling, not a shortfall to paper over. The per-city fraction below it is the **measurement still
  to run** (per-city Plandata population), not a hand-typed number.
- **Legislation rate:** this gap **IS** the ~96% rate — it does not move it, it names it honestly.

---

## Tail queue (live-probe follow-ups — queued, not fabricated)

- **Terrain (DHM).** Danmarks Højdemodel — national LiDAR DTM/DSM (~4.5 pts/m², 0.4 m rasters), SDFI;
  apikey-gated bake. `terrain.mjs` source `dk` exists but only **Copenhagen** has a bbox row; add rows
  per tackled city; re-probe before prod. Lifts TERRAIN.
- **Heritage (FBB).** Fredede og bevaringsværdige bygninger national register + plan `zonestatus`
  overlays → an `overlays[]` heritage constraint; not yet per-parcel probed. Lifts CONTEXT.
- **Article-level citation completeness.** Deepen every PART A field's citation to the precise BR18 §
  + Plandata field, and land the Danish-planner sign-off on §USABLE-FALLBACK precedence + byggefelt
  bindingness (`sources/VERIFICATION.md`). Raises provenance (`structured` → `human-reviewed`), not the
  fill number.

---

## The four-part deliverable shape (applies to every gap)

> **find official source → extraction method → implementation path → measured result OR honest
> cannot-obtain.** No gap ships a fabricated coverage %, setback, courtyard dimension, or physical
> height. Where a source cannot be obtained (G8 MitID), that is stated as **access-deferred**, not
> worked around with a guess. Where a measurement has not run (G4), the number stays **ESTIMATED**, not
> asserted. Where footprint bindingness is unproven (G3), coverage/placement stay **withheld** rather
> than overstated.

*Authority: C58 · C63 §3/§4 · ADR-0269 · ADR-0270 · ADR-0271 (Barcelona block-derived depth, the
engine to reuse for G6) · L-449 · BR18 §168–186. Feeds ENVELOPE / HEIGHTS-LOD / CONTEXT / PARCEL /
TERRAIN axis realism — NOT the LEGISLATION rate. Created 2026-07-30. Maintainer: UNASSIGNED.*
