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

## DK completion vs the ORIGINAL extraction spec — **the scoping capstone**

> **Re-scope (read this first).** The original task was **structured legislation extraction**
> (PART A / B / C) — **NOT** a digital twin, LOD2, or 3D city reconstruction. Measured against
> *that* target, **Denmark is ~85% complete** and is the **benchmark jurisdiction**. The gaps below
> (G1–G11) mix *legislation-extraction* finishing work with *context/geometry-realization* work; this
> capstone separates the two so the ~85% figure is not confused with the envelope-realism queue.

| Part | Target | Completion | SOLVED | PARTIAL / honest-absence |
|---|---|---|---|---|
| **A — legislation** | structured zoning record | **~85–90%** | zoneCode · officialDesignation · farRatio · unit · maxHeight_m · maxFloors · permittedUse · legalSource · effectiveDate · confidence | densityScope (ingest denominator attr, G1) · how-measured · article+paragraph (evidence resolver, G11) · buildableDepth (lokalplan text, G5) · **`maxCoverage` = `verified-null`** · **setbacks = `null` pending byggelinjer** |
| **B — parcel** | authoritative geometry | **~75–85%** | CRS EPSG:25832 (shoelace) | Matriklen / Datafordeler **access-deferred** (MitID service-identity — official source EXISTS, access not completed; **NOT** missing-data, **NOT** low-quality) |
| **C — meta** | provenance / freshness | **~90%** | ordinanceUrl · version · officialGIS · machineReadable | updateFrequency (capture) |

**⚠ `maxCoverage` is an HONEST ABSENCE, not a gap.** Denmark exposes FAR / `bebyggelsesprocent`, **NOT**
a universal ground-coverage %. The correct output is
`{ maxCoverage: null, confidence: 'verified-null', reason: 'DK regulates FAR/bebyggelsesprocent, not universal ground coverage' }`
— **never `0.4`** or any fabricated coverage. Likewise `setbacks = null` (never `0`) until byggelinjer
(G2) is wired.

**The 5 remaining gaps to FINISH DK for the original task** (all *legislation-extraction* work, not 3D):

- **A) Legal-citation resolver** — Plandata feature → Lokalplan §X.Y (this is **G11**).
- **B) Density-scope ingestion** — the denominator attribute (this is **G1**).
- **C) Coverage-honesty decision** — binding byggefelt geometry **OR** keep `verified-null` (this is **G3/G7**).
- **D) Parcel official access** — administrative (MitID / partner), not code (this is **G8**).
- **E) Update-metadata capture** — `updateFrequency` (PART C tail).

**EXPLICITLY OUT OF SCOPE for the original extraction task** (these belong to the **CONTEXT-building
rate**, not the legislation rate): Danmark-i-3D · LOD2 buildings · BBR enrichment · DHM terrain ·
shadows · city-reconstruction. Cross-ref: these are the **G4** LoD2 adapter + tail-queue terrain work —
valuable, but **NOT** a legislation blocker.

**Conclusion.** *"Can Denmark produce the requested structured legislation dataset?"* → **YES.** Denmark
is the benchmark jurisdiction; the remaining ~15% is making the output **auditable + non-overclaiming**
(citations G11, scope G1, honest nulls) — **NOT** more extraction. **Legislation ceiling stays ~96%**
(G9); this capstone measures the *original-task* fill, which is a different denominator than the
national byzone rate.

---

## The queue at a glance

| # | Gap | Axis it lifts | Legislation rate | Honest status |
|---|---|---|---|---|
| **G1** | Density denominator scope (`beregningsgrundlag`) | ENVELOPE (FAR usability) | **unchanged** | current rule CORRECT — keep withhold; wire the scope attribute |
| **G2** | Setbacks (`byggelinjer`) | ENVELOPE (geometry) | **unchanged** | model as `BuildingLineConstraint`; schema NOT verified — probe |
| **G3** | Byggefelt semantics / binding flag | ENVELOPE (coverage + placement) | **unchanged** | `binding:'unknown'` until DescribeFeatureType-probed; NEVER `area/parcel` |
| **G4** | LoD2 building context adapter | HEIGHTS/LOD + CONTEXT | **unchanged** | ESTIMATED → VERIFIED only after the N=500 measurement runs |
| **G5** | Buildable-depth from lokalplan TEXT | ENVELOPE (depth) | **unchanged** | ordinance-pipeline text extraction; study-mode fallback, NEVER `legalDepth` |
| **G6** | Courtyard / friareal / perimeter-block | ENVELOPE (biggest realism failure) | **SCHEMA + RESOLVER SHIPPED** (`24ad515a`, `6250193f`); **tier-1 gate now OPEN** - byggefelt bindingness is machine-readable, see [`findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md`](./findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md). **NOT YET LIVE:** no L5 producer yet, so every parcel currently refuses and falls back to the `footprintIsUpperBound` envelope. Remaining work is provider/probe, not rules. | reuse Barcelona profunditat engine; NEVER FAR→footprint |
| **G7** | maxCoverage (ground-coverage %) | ENVELOPE (coverage) | **unchanged** | keep `null` today (CORRECT); 4-tier resolver; NEVER `farRatio` |
| **G8** | Parcel provider (Matriklen) | PARCEL (independent of legislation) | **unchanged** | access-deferred (MitID); 3 solution paths; OSM fallback |
| **G9** | The honest ceiling (last ~4%) | — (a truth statement) | **is** the ~96% ceiling | ~96% digital / ~87% pure-structured; **NOT 100%** — structural + measurement, not fabricatable |
| **G10** | Land-use semantics (`anvendelsegenerel` → use vocab) — *net-new* | ENVELOPE/AI (program semantics) | **unchanged** | `dkUseClassification` mapper; **Centerområde = mixed_use**; raw `sourceValue` NEVER discarded |
| **G11** | Legal evidence chain / provenance (C58 §1.6) — *net-new* | provenance (auditability) | **unchanged** | BR18 = concept, lokalplan = number; `article:'unknown'` where field-authoritative; NEVER fabricate a citation |
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

## G10 — Land-use semantics (`anvendelsegenerel` → universal use vocabulary) — **net-new**

**The problem.** The Danish general-use value carried on a plan (`anvendelsegenerel`) is a *category
label*, not a program. AI generation needs the **universal use vocabulary** behind it, and the mapping
is **NOT one-to-one** — the trap is reading `Centerområde` as "residential" and generating a bare
apartment tower where the plan mandates a **mixed, active-frontage** program.

- **Official source.** Plandata — the `anvendelsegenerel` field on the `kommuneplanramme` / `lokalplan`
  feature. Source hierarchy for the actual permitted program: **lokalplan (binding, exact) >
  kommuneplanramme (framework) > BR18 (regulates construction, NOT zoning use)**.
- **Extraction method.** A `dkUseClassification` mapper →
  `ZoningUse { primaryUse, permittedUses[], prohibitedUses[], conditionalUses[], sourceValue, confidence }`.
  **`sourceValue` carries the raw Danish string and is NEVER discarded.** Confidence starts
  `structured` (it is a Plandata field) and is **refined by lokalplan text** where present.
- **The value map (⚠ NOT one-to-one):**

  | `anvendelsegenerel` | `primaryUse` | Notes |
  |---|---|---|
  | Boligområde | `residential` | housing |
  | Erhvervsområde | `employment` | office / industry / warehouse |
  | **Centerområde** | **`mixed_use`** | **residential + retail + office + restaurant + service — NOT residential-only** |
  | Offentlige formål | `public` | school / hospital / civic |
  | Rekreativt område | `recreation` | caps no building in many cases |

- **Conditional preservation.** Values such as *"Boliger og erhverv"* / *"Bolig og service"* carry
  `conditional: true` and populate `conditionalUses[]` — **do not collapse** them to a single primary.
- **Why it matters for AI generation.** A `Centerområde` parcel → **active ground-floor frontage +
  mixed program**, not a bare apartment tower. The mapper is what makes the generator honor the plan's
  intended character.
- **Result / honest state.** Net-new **semantics** layer over already-extracted fields — it adds
  meaning, **not a new number**. `sourceValue` preserved always; unmapped/novel values keep
  `primaryUse: 'unknown'` + raw string, never a guess. **Legislation rate: unchanged.**

---

## G11 — Legal evidence chain / provenance (C58 §1.6) — **net-new**

**The problem.** A machine-readable Plandata field is *evidence*, but a value with no traceable chain
back to the ordinance clause is **not auditable**. The critical failure is **fabricating a citation**
to make a value look sourced.

- **⚠ THE CRITICAL HONESTY RULE — BR18 defines the CONCEPT, the LOKALPLAN sets the NUMBER, Plandata is
  the machine-readable field.** So do **NOT** cite *"BR18 §168 → maxHeight = 24 m"* — **BR18 does not
  create the 24 m limit; the lokalplan §X does.** BR18 defines `bebyggelsesprocent` as a concept;
  the lokalplan sets the actual value; Plandata exposes it as a field. Conflating the three
  manufactures a false article citation.
- **Schema.**
  `PlanningEvidence { value, sourceSystem: 'Plandata', dataset, featureId, fieldName, documentUrl (doklink), ordinanceTitle, article, paragraph, effectiveDate, extractionMethod: 'structured-field' | 'document-text', confidence }`.
- **`article: unknown` where the GIS field is itself authoritative.** When the value comes straight
  from a structured Plandata field and no clause was read, **do NOT fabricate an article/paragraph** —
  emit `article: 'unknown'`. Where `densityScope` is unknown → **withhold FAR** (already the rule, G1).
- **Paragraph-extraction tiers (cheapest-first):**
  1. **structured-field** — value is a Plandata attribute; **no text extraction**, `article: unknown`.
  2. **born-digital PDF** — search the lokalplan text for `maksimal bygningshøjde` / `etager` /
     `bebyggelsesprocent`; capture the `§X.Y` that sets the number → `extractionMethod: 'document-text'`.
  3. **OCR** — **old scans only**, last resort.
- **Result / honest state.** Net-new **provenance** layer — it makes existing values auditable, it does
  **not** produce new values. No citation is invented; the honest fallback is `article: unknown`.
  **Legislation rate: unchanged.**

---

## Cross-reference — founder "Gap #15/#18/#19/#20" are already captured (NOT re-added)

The founder's later gap labels **#15/#18/#19/#20 RESTATE gaps already in this roadmap** — they are
**not** new deliverables and are **not** re-added:

| Founder label | Restates | Already captured as |
|---|---|---|
| **#15** byggelinjer / courtyard | setbacks + perimeter-block void | **G6** (courtyard/friareal) + **G2** (byggelinjer) |
| **#18** parcel-access | Matriklen / Datafordeler access | **G8** (parcel provider, access-deferred) |
| **#19** coverage | ground-coverage % | **G7** (maxCoverage, keep `null`/`verified-null`) |
| **#20** LoD2 | LoD2 building context | **G4** (LoD2 context adapter) |

**Only G10 (land-use semantics) and G11 (evidence chain) are net-new** in this pass — and both are
**semantics + provenance**, not new numbers. The honest ceiling is **unchanged (~96% legislation)**.

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

*Authority: C58 (§1.4 access-deferred · §1.6 evidence chain, G11) · C63 §3/§4 · ADR-0269 · ADR-0270 ·
ADR-0271 (Barcelona block-derived depth, the engine to reuse for G6) · L-449 · BR18 §168–186. Feeds
ENVELOPE / HEIGHTS-LOD / CONTEXT / PARCEL / TERRAIN axis realism + program-semantics (G10) +
provenance/auditability (G11) — NOT the LEGISLATION rate. Created 2026-07-30; G10/G11 + original-spec
capstone added 2026-07-31. Maintainer: UNASSIGNED.*
