# SOURCE — Founder: Phases 41–50 + the National Spanish Planning Compiler (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (final two messages of a
> 16-batch delivery). Captured **verbatim** in §A–§B. §C is mine and is marked as such.
>
> **Country level, deliberately** — per the founder's "SPANISH GENOME … DOCUMENT ACCORDINGLY"
> instruction. Direct continuation of
> [`SOURCE-founder-spanish-planning-genome-2026-07-31.md`](./SOURCE-founder-spanish-planning-genome-2026-07-31.md)
> (phases 26–40).

**The reframing, quoted:**

> The work on Madrid **fundamentally changes the problem.** Initially the challenge appeared to be
> *"extract planning legislation for each city."* After reverse-engineering Madrid's GIS and legal
> ecosystem, the problem is better framed as: **"Build a compiler for the Spanish planning system."**

---

## §A — Phases 41–50: from Spain project to planning infrastructure

### 41 — Automatic GIS Discovery

Madrid required *manually* finding `NORMAS_ZONALES`, `PG_CONDICIONES_EDIFICACION`, `PG_ORDENACION`,
`PG_USOS_Y_ACTIVIDADES`. **That should become automated.**

```
Municipality → ArcGIS REST root → crawl every service → crawl every layer
             → download metadata → score usefulness
```

Per-layer features to compute: contains geometry · contains polygons · contains
*altura*, *planta*, *ocupación*, *coef*, *edificabilidad*, *alineación*, *retranqueo*, *uso*,
*ordenanza*, *norma*, *zona*, *grado*, *nivel*.

Auto-classify into: Planning Layer · Parcel Layer · Street Layer · Heritage Layer · Terrain Layer ·
Management Layer — *"instead of hand-inspecting hundreds of layers."*

### 42 — Automatic Field Semantics

> Madrid taught us something important. **Field names are inconsistent.** `AMB_TX_ETIQ` means
> **Zone Code**, not "Text Label."

Another city may use `COD_ZON` or `ORDENANZA`. Build a **semantic mapper**, don't hardcode:

| Field | → Ontology |
| ----- | ---------- |
| `AMB_TX_ETIQ` | `zoneCode` |
| `AMB_TX_DENOM` | `officialDesignation` |
| `COEF_Z` | `coefficient` |
| `TIPOAMB` | `planningAreaType` |

### 43 — Rule Pattern Library

> Instead of extracting parameters individually, create reusable **rule templates.** Now the parser
> asks *"Which template matches this ordinance?"* rather than *"Parse everything from scratch."*

| Template | Composition |
| -------- | ----------- |
| Alignment-based block | Alignment + Maximum Depth + Maximum Height |
| Detached housing | Front + Side + Rear setback + Coverage + Height |
| Historic centre | Existing alignment + Patio rules + Protection + Maximum cornice |

### 44 — Legal Table Extractor

> One of the biggest opportunities: Spanish planning ordinances often express rules in **structured tables.**

```
PDF → detect tables → recover rows → recover headers → normalize units → attach citations
```

> **This can dramatically improve extraction accuracy.**

### 45 — Cross-reference Resolver

Spanish ordinances constantly say *"except as provided in article 7.3"*, *"subject to chapter 8"*,
*"according to annex II"*. **Most extraction systems ignore these.**

```
Height → comes from Article 8.3 → modified by Article 10.2
```

### 46 — Amendment Engine

> Madrid has PGOUM 1997 **+** Compendio 2025. Many municipalities have decades of amendments.
> **Don't parse only the consolidated text.**

Track `Original → Amendment → Modification → Consolidated`; every parameter knows `introduced`,
`modified`, `current`.

### 47 — Confidence Engine — *"based on evidence, not heuristics"*

| Evidence chain | Confidence |
| -------------- | ---------- |
| found in table → article explicitly cites zone → no conflicting amendment | **0.99** |
| appears only in narrative → ambiguous reference | **0.62** |

> This lets reviewers focus on weak points.

### 48 — Human Review Workbench

Present the extracted value, cited article and paragraph, original text snippet, parsed
interpretation, and any conflicting sources. The reviewer only decides **✓ Accept · ✗ Reject · ✎ Correct**.

### 49 — City Fingerprint

Dimensions: planning family · primary ordinance · GIS quality · parcel quality · legal structure ·
rule complexity · number of zone types · number of exceptions · special plans · machine-readable %.

> Instead of asking *"Which city next?"* you ask **"Which city offers the highest return for the
> least engineering effort?"**

### 50 — National Planning Compiler — what disappears

> **No** city-specific parser · **no** city-specific database schema · **no** city-specific solver.
> Only: discovery configuration, ontology mapping, legal validation.

### Success measured as capability, not percentage

| Capability | Current (Madrid) | Target after Madrid + Valencia |
| ---------- | ---------------: | -----------------------------: |
| Automatic GIS discovery | ~70% | >95% |
| Automatic layer classification | ~60% | >95% |
| Automatic field mapping | ~40% | >90% |
| Automatic legal article extraction | ~30% | >90% |
| **Automatic table extraction** | **0%** | **>95%** |
| Automatic parameter extraction | ~35% | >90% |
| Automatic citation attachment | ~20% | >95% |
| Human review effort | 100% manual | <10% manual |
| **Time to onboard a new Spanish city** | **Weeks** | **1–2 days** |

---

## §B — The national platform (executive summary, verbatim)

> Spain has more than **8,000 municipalities**, but only a relatively small number publish and
> maintain their own complete urban planning instruments. Most medium and large cities follow similar
> legislative structures (**PGOU / PGOM / PGOUM**), use comparable planning concepts, and increasingly
> expose official GIS services (primarily ArcGIS Server, GeoServer/WMS, or INSPIRE-compliant services).

### Why it is feasible — four properties Madrid demonstrated

1. **Planning topology is GIS-native** — the zoning hierarchy is already exposed as polygons; no manual lookup.
2. **Geometry is authoritative** — `Parcel → Centroid → Spatial intersect → Planning layer` **avoids municipality-specific identifiers.**
3. **Legal parameters are structured** — repeated legal language makes **deterministic** extraction realistic.
4. **Most planning concepts are universal** — *"The vocabulary changes. The concepts do not."*

### The four-layer national model

| Layer | Function |
| ----- | -------- |
| **1 — GIS Discovery** | municipality → REST endpoint, layers, metadata, geometry, fields. Supports ArcGIS REST · WMS · WFS · GeoJSON · INSPIRE |
| **2 — Ontology** | Madrid `AMB_TX_ETIQ` / València `ORDENANZA` / Bilbao `ZONA` → all `zoneCode`. *"Internally there is only one concept."* |
| **3 — Legal Compiler** | PDF → layout parser → chapter detection → table extraction → parameter extraction → citation attachment. **No value exists without provenance.** |
| **4 — Rule Engine** | *"The buildability engine never needs to know whether the city is Madrid or Valencia."* |

### Planning-family classification — *"a parser is written once per family"*

`PGOU family` · `PGOM family` · `PGOUM family` · `NNSS family` · `Special metropolitan plans` —
each sharing terminology, legal structure, chapter organization, planning concepts.

### National rule library — templates instantiated differently per city

Historic Centre (alignment + max cornice + patio rules) · Detached Housing (coverage + front/rear
setback + height) · Industrial (coverage + FAR + side setbacks) · Mixed Urban Block (alignment +
depth + height)

### Municipal intelligence compounds

Madrid contributes ArcGIS discovery, Norma Zonal hierarchy, spatial joins, derived-plan detection,
NZ1 explicit envelopes. València may contribute a different zoning taxonomy and another
planning-family implementation; Bilbao may introduce volumetric regulation; Sevilla historic-centre
exceptions. **The compiler becomes progressively stronger.**

### Scaling curve

| City | Without reuse | With compiler |
| ---- | ------------: | ------------: |
| Madrid | 100 | 100 |
| Valencia | 100 | 30 |
| Sevilla | 100 | 20 |
| Bilbao | 100 | 15 |
| Zaragoza | 100 | 10 |

### Coverage targets

| Stage | Machine-readable planning |
| ----- | ------------------------: |
| Madrid today | ~60–70% |
| Madrid after legal compiler | ~95% |
| Second city (Valencia) | ~90–95% |
| Third city | ~95% |
| Large Spanish municipalities | ~90–95% with configuration and validation |

> Remaining gap: site-specific plans, heritage exceptions, recent amendments not yet consolidated, or
> municipalities publishing **only scanned documents.**

> **End state:** for any Spanish municipality,
> `Official GIS + Official Ordinance → Spanish Planning Compiler → Validated Rule Pack → Buildability Engine`.
> Adding a city becomes **discovery, validation, and configuration — not bespoke engineering.**

---

## §C — Capture notes (MINE, not the founder's)

### G-7 — Phase 41's discovery engine is the one item I would build first, and it is testable this week

Of the twenty-five phases across both Genome captures, §41 (auto-discovery by crawling an ArcGIS root
and scoring layers on Spanish planning keywords) is uniquely well-positioned: it is **small**,
**independently useful even if the Genome thesis fails**, and it is **exactly what València's P4.5
gate needs**. The keyword feature set is already enumerated and comes from a city where the ground
truth is known.

Concretely: point it at València's ArcGIS root, score the layers, and compare against what a human
finds. That single run simultaneously executes P4.5, tests the Genome's central claim, and produces
`VALENCIA-DATA-RECON.md`. **One artefact, three purposes.**

### G-8 — The "0% → >95% automatic table extraction" row is the most consequential in the matrix

It is the only capability scored at **zero** today, and §44 argues Spanish ordinances put rules in
tables. If true, table extraction is not one capability among nine — it is the **rate-limiting step**
for FAR, height, floors and coverage simultaneously, all of which currently sit at 0% for Madrid.

This is also the most direct link to the in-flight `packages/ordinance-extraction/` work: Berlin's
born-digital text-parse path landed this session, but **table recovery is a different problem from
text parsing** and I have no evidence it is covered. Worth confirming before assuming the German
pipeline transfers — it is precisely the kind of gap that "80% reusable" (C-14) would hide.

### G-9 — Two numbers in this batch contradict the Madrid captures

| Claim here | Madrid captures say |
| ---------- | ------------------- |
| "Madrid today ~60–70% machine-readable" | Batches 1–6 consistently say **35–50%**; the closest figure is batch 3's `GIS 95% / LAW 40% / TOTAL ~65%`, which measures something different |
| "Automatic GIS discovery ~70% (Madrid)" | Madrid's layers were found **manually** — §41's own opening sentence says so. Automatic discovery is arguably **0%** today |

Neither undermines the architecture, but both are optimistic restatements of earlier, more careful
numbers. This is now the **fifth** distinct completeness scale in the corpus (C-2, C-10, C-29). The
ratified basis remains **C63's seven weighted axes**; every founder figure should be recorded as
"as-supplied, differing basis" and never averaged in.

### G-10 — "8,000 municipalities" is the right framing and the right caution

The founder correctly notes only a small number maintain their own complete instruments. That is the
honest boundary of the platform claim: the compiler serves cities that **publish** a PGOU-family
instrument and **expose** GIS. Spain's long tail either adopts higher-tier instruments or publishes
scanned-only documents — and §B names scans as an explicit residual.

Worth connecting to something already established here: PRYZM's Denmark/Sweden work hit
**identity-gated** access (MitID/BankID), where the blocker was neither format nor structure but
authentication. Spain's municipal tail is likely to present a third failure mode again distinct from
both — *published but not machine-readable*. The `City Fingerprint` (§49) is the right instrument for
this, and its most valuable field would be the one not currently listed: **why a city is hard**, using
the same retryable/non-retryable taxonomy as València's Phase 12 (V-5).

### G-11 — Standing recommendation across all sixteen batches

The corpus is now large, internally inconsistent in its numbers, and consistently excellent in its
principles. My reading of what should actually happen next, in order:

1. **Run the València P4.5 / Phase 0 recon using a first-cut §41 discovery engine** — 1–2 days,
   settles the Genome thesis empirically, produces a required artefact either way.
2. **Resolve the Compendio version** (C-6/C-16 — three candidate dates) by fetching both PDFs and
   comparing. Blocks every Madrid citation.
3. **Reconcile §26/§27/§32 against the existing planning-regime resolver and building-graph work
   before building anything** (C-22). The overlap is substantial.
4. **Then** extract Madrid NZ4 *through* the resulting schema rather than into flat JSON (C-25/C-31).

Items 1 and 2 are cheap, empirical, and unblock the rest. Items 3 and 4 are decisions the founder
owns. Nothing in this corpus has yet been tested against an actual PGOUM article, and until item 1
runs, the entire Genome remains a well-argued hypothesis.
