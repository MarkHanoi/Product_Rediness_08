# SOURCE — Founder: France as a national machine-readable legislation database (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31, immediately after the tiered-scoring
> roadmap. Captured **verbatim** in §A–§B. §C is mine and is marked as such.
>
> ⚠ **This is a strategic escalation, not a schema refinement.** It reframes the product from a
> *consumer* of planning data into a *producer* of a national structured legislation database, at a
> scale of ~80–120 million legislative objects. §C-11 states the decision that implies.
>
> Companion: [`SOURCE-founder-france-tiered-scoring-and-roadmap-2026-07-31.md`](./SOURCE-founder-france-tiered-scoring-and-roadmap-2026-07-31.md)

**The reframe, quoted:**

> If the objective is **100% machine-readable legislation** (not merely searchable PDFs), then your
> product is no longer a planning data consumer — it's effectively building a **national structured
> planning database.** The success metric is not "coverage of municipalities" but **coverage of
> machine-readable legislative fields.**

> Convert **every legally relevant planning rule** into structured data. Not PDFs. Not OCR text.
> Not search. **A normalized database.**

---

## §A — The nine stages

| Stage | Name | Output | Target |
|---|---|---|---|
| **1** | National Registry | municipality · planningAuthority · PLU/PLUi · ordinanceVersion · effectiveDate · GPUZoneLayer · GISLayers | 34,900 = **100%** |
| **2** | Document Inventory | `Document → Section → Chapter → Article → Paragraph`, **everything addressable** (e.g. `PLU / Article 6 / Paragraph 2 / Sentence 4`) | **100%** |
| **3** | Article Classification | Setback · Height · Coverage · Parking · Trees · Landscaping · Flood · Heritage · Mixed use · Density · Facade · Roof · Solar · etc. **No extraction yet — only classification.** | **100%** |
| **4** | Machine-readable Extraction | per-concept schema, **actual data, not OCR text** | — |
| **5** | Full Rule Library | **~150–250 legislative fields** (see below) | — |
| **6** | Normalization | one canonical field, original legal wording + citation preserved | — |
| **7** | Rule Engine | typed rules (see below) | — |
| **8** | Human Verification | `verified` · `verifiedBy` · `verificationDate` · `confidence` · `source`. **Nothing reaches production without verification.** | — |
| **9** | Machine-readable Completeness | five ratio metrics (see below) | — |

**Stage 4 exemplar:**

```json
{ "article": "UG.10", "field": "maxHeight", "value": 18, "unit": "m",
  "condition": null, "citation": { "article": "UG.10", "paragraph": "II.2" } }
```

**Stage 5 — extract everything, not just the buildability three.** Use · Density · Height · Coverage ·
Setbacks · Buildable depth · Parking · Landscape · Trees · Energy · Facade · Roof · Materials ·
Visibility · Heritage · Flood · Noise · Fire · Utilities · Subdivision · Demolition · Extensions ·
Basements · Attics · Balconies · Signs · Lighting · Accessibility · Public realm · Temporary works ·
Renewables · Water · Drainage · Environmental protection · Protected trees · View corridors ·
Special overlays. **≈150–250 fields.**

**Stage 6 — normalisation.** *Hauteur maximale* → Maximum building height → `maxHeight`.
*Emprise / Emprise maximale / CES / Surface bâtie* → `maxCoverage`.
One canonical field exposed; original wording and citation preserved.

**Stage 7 — rule types.** Not every rule is numeric:

```
numeric · formula · graphical · conditional · reference · prohibited · discretionary
```

> Essential because many French PLUs encode development controls as formulas, references to plans, or
> conditional provisions rather than simple numbers.

**Stage 9 — completeness metrics:**

| Metric | Formula |
|---|---|
| Document completeness | Articles parsed / Articles expected |
| Classification completeness | Classified articles / Total articles |
| Extraction completeness | Extracted fields / Expected fields |
| Verification completeness | Verified fields / Extracted fields |
| Machine-readable completeness | Verified machine-readable fields / Expected fields |

### National KPIs

| KPI | Target |
|---|---:|
| Municipality registry | 100% |
| Ordinance inventory | 100% |
| Article indexing | 100% |
| Article classification | 100% |
| Structured field extraction | 95% |
| Human verification | 95% |
| **Machine-readable legislation** | **90–95%** |
| Production-ready municipalities | 85–90% |

> **The machine-readable target is 90–95%, not 100%.** A small fraction of rules will remain
> inherently non-machine-readable because they depend on graphical plans, case-by-case discretion, or
> qualitative legal standards (heritage integration, architectural harmony). Those should still be
> represented in the schema **as structured rule types such as `graphical`, `reference`, or
> `discretionary`, rather than forcing a fabricated numeric value.** That preserves legal fidelity
> while keeping **every section** machine-readable.

### The recommended data model

```
PLU
 └── Chapter
      └── Article
           ├── Paragraph      ├── References
           ├── Rule           ├── Geometry links
           ├── Conditions     ├── Source citation
           ├── Exceptions     └── Verification
           └── Parameters
```

> Coverage becomes **"100% of legislative text represented in a structured model"**, even if some rules
> resolve to `graphical` or `discretionary` instead of a numeric value. **That is a much stronger and
> more defensible objective than claiming every rule can be reduced to a number.**

---

## §B — The eleven-part schema

> Your current schema is excellent for a buildability MVP, but it only captures about **20–30% of the
> legal information** in a typical PLU/PLUi.

**PART A — LEGISLATION (zone rules), one row per zone.** Required (✓): `municipalityCode (INSEE)` ·
`municipalityName` · `planningAuthority` · `planningDocument` · `planningDocumentVersion` ·
`planningDocumentDate` · `planningLevel (PLU/PLUi/POS/RNU)` · `zoneCode` · `officialDesignation` ·
`zoneDescription` · `permittedUse` · `farRatio` · `ordinanceTitle` · `article` · `paragraph` ·
`legalSource` · `effectiveDate` · `confidence`.
Optional: `prohibitedUse` · `conditionalUse` · `densityUnit` · `densityScope` · `minDensity` ·
`maxHeight_m` · `heightMeasurementMethod` · `maxFloors` · `maxCoverage` · `coverageScope` ·
`minGreenArea` · `permeabilityRequirement` · `front/rear/sideSetback` · `buildableDepth` ·
`frontageRequirement` · `minimumLotSize` · `parkingRequirement` · `bicycleRequirement` ·
`landscapeRequirement` · `treeRequirement` · `heritage/flood/noise/environmental/fireConstraint` ·
`solarConstraint` · `roofRequirement` · `facadeRequirement` · `materialsRestriction` ·
`demolitionRestriction` · `extensionRule` · `accessoryBuildings` · `temporaryStructures`.

**PART B — LEGISLATIVE OBJECTS** — one record per legislative object, not one flattened row per article:
`objectId` · `zoneCode` · `category` · `canonicalField` · `originalText` · `normalizedValue` ·
`operator` · `unit` · `condition` · `exception` · `referenceArticle` · `citation`.

```json
{ "canonicalField":"maxHeight", "operator":"<=", "value":18, "unit":"m",
  "condition":"frontage >12m", "exception":"historic monument", "citation":"UG.10 II.2" }
```

**PART C — ARTICLE INDEX** — `articleId` · `chapter` · `section` · `articleNumber` · `paragraph` ·
`page` · `title` · `articleType` · `referencesOtherArticles` · `referencesGIS` · `referencesNationalLaw`

**PART D — PARCEL** — `hasOpenSource` · `endpoint` · `protocol` · `auth` · `CRS` · `parcelIdField` ·
`geometryType` · `geometryPrecision` · `ownershipBoundary` · `surveyGrade` · `coverage` ·
`updateFrequency` · `licence`

**PART E — ZONING GIS** — `zoningLayer` · `zoningLayerVersion` · `geometryType` · `CRS` · `updateDate` ·
`downloadURL` · `WMS` · `WFS` · `vectorTiles` · `machineReadable`

**PART F — OFFICIAL GIS** — `parcelGIS` · `zoningGIS` · `heritageGIS` · `floodGIS` · `utilitiesGIS` ·
`environmentalGIS` · `orthophoto` · `LiDAR` · `buildingHeights` · `addressAPI`

**PART G — BUILDINGS (context, stored separately from legislation)** — `buildingId` · `height` ·
`storeys` · `roofType` · `use` · `yearBuilt` · `confidence` · `source`

**PART H — METADATA** — `ordinanceURL` · `ordinanceVersion` · `ordinanceDate` · `officialGIS` ·
`machineReadable` · `updateFrequency` · `issuingAuthority` · `legalStatus` · `language` ·
`extractionDate` · `extractionEngine` · `verificationDate` · `verifiedBy`

**PART I — PROVENANCE** — `valueId` · `sourceDocument` · `page` · `chapter` · `article` · `paragraph` ·
**`sentence`** · `citation` · `confidence` · `reviewer`

**PART J — VERSIONING** — `versionId` · `previousVersion` · `publicationDate` · `effectiveDate` ·
`repealDate` · `amendmentReason` · `changedFields`

**PART K — QUALITY** — OCR confidence · Classification confidence · Extraction confidence ·
Human verification · Machine-readable · Production ready

### Per-municipality file layout

```
Municipality/
  metadata.json · parcels.json · zones.json · legislative_objects.json
  article_index.json · gis_layers.json · buildings.json
  provenance.json · versions.json · quality.json
```

### Expected scale for France

| Dataset | Estimated size |
|---|---:|
| Municipalities | ~34,900 |
| Planning authorities (PLU/PLUi) | ~20,000–35,000 |
| Planning zones | ~350,000–500,000 |
| Articles indexed | **~6–10 million** |
| **Legislative objects (structured rules)** | **~80–120 million** |
| Citations | ~100–150 million |
| GIS layers referenced | thousands |
| Version records | millions over time |

---

## §C — Capture notes (MINE, not the founder's)

### F-8 — The "100% machine-readable via rule-typing" reframe is the best idea in both France deliveries

It dissolves a tension the previous delivery could not: *don't promise 100%* vs *we want complete
coverage*. The resolution is that **100% of legislative text becomes structured**, while only 90–95%
*resolves to a value* — and a rule that resolves to `graphical` or `discretionary` is **fully
represented**, not missing.

This is the same move PRYZM has already made three times and should be recognised as a pattern:

| Domain | The move |
|---|---|
| Denmark | refusal is a **typed value** with a diagnostic trail, not a failure |
| Madrid NZ 3 | *"specific volumetric determination required"* is an **answer**, not a gap |
| Germany | `resolved` / `conflicted` / `unknown` — a conflict carries **no value** and both citations |

**"Structured absence is not absence"** is now a cross-jurisdiction invariant and deserves lifting into
the shared contract rather than being re-derived per country.

### F-9 — ⚠ `Unknown` was DROPPED from the rule taxonomy. Restore it.

| Delivery | Rule types |
|---|---|
| Previous (Phase 3) | `Numeric` · `Formula` · `Graphical` · `Conditional` · **`Unknown`** |
| This one (Stage 7) | `numeric` · `formula` · `graphical` · `conditional` · `reference` · `prohibited` · `discretionary` |

Three good types were added — and **`Unknown` disappeared.** Every rule must now be classified into a
positive type, which **forces a guess when the classifier cannot tell.** `discretionary` is not a
substitute: it is a positive legal claim that the rule *is* discretionary, which is a very different
statement from *"we could not classify this."*

This is precisely the failure class this repo keeps paying for — L-616 (unknown setback drawn as zero),
L-422/457/467/469 (failure and emptiness as one value), and the CI gate that reported green while
scanning zero files. **`unknown` must be in the taxonomy, and a rule typed `unknown` must never reach
a production pack.** Cheap to fix now; expensive after 80 million objects exist.

### F-10 — The binding constraint is human verification, and the two deliveries contradict each other

| | Previous delivery | This delivery |
|---|---|---|
| Human verification | **55–65% national ceiling** — explicitly *"the shared OCR + human gate ceiling"* | **95%** target |
| Scale | not stated | **80–120M legislative objects** |

95% of 80–120M objects is **76–114 million human verifications.** At an implausibly fast 10 seconds
each that is **210,000–320,000 person-hours** — roughly 100–160 person-years. The previous delivery's
55–65% ceiling was *derived from* this constraint and is the more credible figure.

**These cannot both hold.** Either verification is sampled/tiered (verify a stratified subset, infer
quality bounds), or the target drops, or the scope narrows to the ~150–250 fields that actually drive
buildability rather than all of them. **This is the single most important open decision in the France
plan**, and it is a staffing/economics question, not an engineering one.

A workable middle: **verify by field-criticality, not uniformly.** Height, coverage, setbacks and
buildable depth gate the envelope and must be Gold; `signs`, `lighting`, `temporary works` can ship at
extraction confidence with a visible badge.

### F-11 — This is a business-model decision disguised as a schema

Building a national structured planning database for France is **not** the same product as a
buildability engine that reads planning data. It implies:

- a **data-production organisation** (extraction ops + a verification workforce), not only engineers;
- an asset whose value is the corpus itself — which invites licensing/redistribution questions,
  liability for published legal interpretations, and a maintenance obligation as PLUs amend (PART J
  exists precisely because of this);
- ~100M-row infrastructure, versioned, with provenance to sentence level.

The 11-part schema is well-designed for that product. **It should be adopted as a deliberate strategic
choice, not accreted as a France implementation detail.** My recommendation: this warrants an ADR
before any of it is built.

### F-12 — Third competing data model in one day; C63 reconciliation is now overdue

Today's deliveries have produced: the **Spanish Genome** primitives/ontology, France's **tiered scoring
+ 100-point rubric** (two variants — capture note F-2), and now this **11-part schema**. PRYZM already
has ratified **C63** (7 weighted axes) and a **planning-regime resolver / spatial knowledge graph**.

The models are not obviously incompatible — they operate at different levels (C63 scores a city's data
estate; France's rubric rolls up nationally; the 11-part schema is the storage model). **But nobody has
written the relationship down**, and three parallel scoring systems is exactly the outcome the Genome
architecture exists to prevent. This is now the highest-priority documentation debt in the jurisdiction
programme.

### F-13 — What is reusable immediately, regardless of whether France is scheduled

Independent of the strategic decision, four things here are ready to lift:

1. **`RuleKind` in the shared ontology** (with `unknown` restored, per F-9). It would have caught
   Barcelona's `edificabilitat` as `formula` rather than `numeric` — ADR-0271 says it is an
   **algorithm, not a lookup**, and a compiler assuming `numeric` produces a silently wrong value.
   It also names Germany's *Nutzungsschablone* problem as `graphical` and Madrid's `COEF_Z` as
   currently `unknown`.
2. **PART I provenance to `sentence` granularity** — finer than anything currently in the repo, and the
   natural home for Madrid's `verbatim` field and Germany's citation atoms.
3. **PART J versioning with `changedFields`** — directly applicable to the Madrid Compendio problem,
   where three consolidations exist and two portals serve different editions simultaneously.
4. **PART K's split confidence** (OCR / classification / extraction / human / machine-readable /
   production-ready) — replaces the single `confidence` enum with the axis that actually failed.

### F-14 — Unverified assumptions carried forward

Both France deliveries rest on **"GPU exposes zoning and the governing document nationally"**, which is
**ASSERTED-UNVERIFIED** — no probe in this repo confirms GPU's actual national completeness. Every
coverage figure (95%, 34,900, 33,100) inherits that.

The scale estimates (~6–10M articles, ~80–120M objects) are order-of-magnitude guesses with no stated
derivation, and they size the entire infrastructure argument.

**When France gets a lane, Stage 1 must begin with the metadata-first sequence proven on Denmark today**
— schema → INSPIRE/ISO metadata → legal-status attributes → parser only if metadata cannot answer.
Denmark's byggefelt bindingness question was one `DescribeFeatureType` call from an answer we were about
to escalate to a planner. **Run that against GPU/IGN before costing anything.** One day of work either
confirms the foundation or invalidates the roadmap.
