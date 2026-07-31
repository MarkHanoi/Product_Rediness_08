# SOURCE — Founder: València 13-phase evidence-driven plan (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31 (immediately after the recon-first
> assessment). Captured **verbatim** in §A. §B is mine and is marked as such.
>
> Companion: [`SOURCE-founder-valencia-recon-first-2026-07-31.md`](./SOURCE-founder-valencia-recon-first-2026-07-31.md)
> (which produced the **P4.5** gate now in [`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md)).
> Country-level architecture: [`../../findings/SOURCE-founder-spanish-planning-genome-2026-07-31.md`](../../findings/SOURCE-founder-spanish-planning-genome-2026-07-31.md).

**Framing, quoted:**

> I would approach Valencia almost identically to how you approached Berlin and Madrid, but with one
> important difference:
>
> **The goal is not to implement Valencia. The goal is to determine whether Valencia can become the
> second Spanish archetype and whether the Spanish intelligence layer generalizes.**
>
> I would organize the work into **evidence-driven phases**, where each phase either proves or
> disproves a hypothesis **using only official sources.**

**Target:** PART A (Legislation) ≥95% with every numeric value traced to an official ordinance article
and paragraph · PART B (Parcel) 100% from official GIS/cadastre · PART C (Metadata) 100% from official sources.

---

## §A — The thirteen phases (verbatim)

| Phase | Name | Deliverable |
| ----- | ---- | ----------- |
| **0** | **Ecosystem reconnaissance (highest ROI)** | `VALENCIA-DATA-RECON.md` |
| 1 | GIS schema intelligence | `VALENCIA-GIS-INVENTORY.md` |
| 2 | Discover planning hierarchy | hierarchy graph |
| 3 | Reverse engineer joins | `VALENCIA-JOIN-MODEL.md` |
| 4 | Ordinance decomposition | `VALENCIA-LEGAL-INDEX.md` |
| 5 | Spanish legal parser | — (reuse Madrid) |
| 6 | Zone normalization | — |
| 7 | Parameter compilation | — |
| 8 | GIS linkage | — |
| 9 | Rule resolution | — |
| 10 | Buildability engine | — |
| 11 | Coverage audit | — |
| 12 | Gap closure | — |

**Phase 0 — ecosystem reconnaissance.** *"This is exactly the phase that changed Madrid."* Inventory
the official planning portal, official GIS, ArcGIS REST / FeatureServer / WFS / OGC API, open-data
portal, planning-document repository, municipal ordinance repository, and **regional (Generalitat
Valenciana) planning datasets.**

Checklist to answer: ArcGIS? · WFS? · Vector tiles? · Downloadable SHP? · Parcel data? · Zoning
polygons? · Planning areas? · Protected buildings? · Alignments? · Uses? · Building conditions?

> Success metric: **every planning dataset officially published by Valencia identified.**

**Phase 1 — GIS schema intelligence.** For every layer collect: layer name, geometry, feature count,
fields, domains, aliases, relationships, CRS, capabilities. *"This becomes reusable infrastructure."*

**Phase 2 — discover planning hierarchy.** *Instead of assuming, discover.* Does València have
equivalents of Norma Zonal / Grado / Nivel / Sector / Unidad / Plan Especial / APR-APE equivalent /
Protection? Produce `Parcel → Zone → Subzone → Special plan → Protection → Parcel-specific rules`.

**Phase 3 — reverse engineer joins.** Is the planning key a parcel ID, a planning block, or spatial
intersection? **Round-trip test it.**

**Phase 4 — ordinance decomposition.** *Before extracting values, understand structure.* Every Title →
Chapter → Section → Article → Annex → Table. Map every chapter to planning concepts.

**Phase 5 — Spanish legal parser.** Reuse the Madrid parser. Extract **only** Height, Floors,
Coverage, FAR, Setbacks, Depth, Uses. *"Nothing else."* Every value carries Document → Article →
Paragraph → Confidence. **No inferred values.**

**Phase 6 — zone normalization.** Official → canonical, e.g. `ENS-2 → ZoneCode`; official designation → ontology.

**Phase 7 — parameter compilation.**

```json
{ "zoneCode":"…", "officialDesignation":"…",
  "farRatio":{ "value":…, "unit":"m²/m²", "densityScope":"…",
               "source":{ "document":"…", "article":"…", "paragraph":"…" } } }
```

**Phase 8 — GIS linkage.** Can every compiled rule connect to GIS (`Zone polygon → Rule JSON`)?
If not, build a lookup table.

**Phase 9 — rule resolution.** `General Plan → Special Plan → Protection → Parcel`, exactly as Madrid.

**Phase 10 — buildability engine.** `parcel → GIS classifier → rules → resolver → answer`.

**Phase 11 — coverage audit.** For every field (zoneCode, officialDesignation, farRatio, height,
floors, coverage, setbacks, depth, uses) measure **Known / Unknown / Source / Reason**.

**Phase 12 — gap closure — *"This is crucial."*** Every unknown must belong to exactly one of:

```
Not published · Special plan · Cannot automate · Missing GIS · Missing article · Parser failure
```

> **Never leave `unknown` without explanation.**

### Expected completion matrix

**PART A** — zoneCode 100% · officialDesignation 100% · FAR 95% · height 95% · floors 95% ·
coverage 95% · setbacks 95% · buildableDepth 90–95% · permittedUse 95% · **article citations 100%**

**PART B** — open source / endpoint / CRS / parcel identifier / coverage / grade / license → **100%**

**PART C** — ordinance URL / version / official GIS / machine readable → **100%**; update frequency 95–100%

### Deliverables — *"a reusable package rather than just a city-specific implementation"*

```
VALENCIA-DATA-RECON.md      VALENCIA-ZONE-INVENTORY.md
VALENCIA-GIS-INVENTORY.md   VALENCIA-PARAMETER-MAP.md
VALENCIA-JOIN-MODEL.md      VALENCIA-RULES.json
VALENCIA-LEGAL-INDEX.md     VALENCIA-VERIFICATION.md
```

plus the generic components feeding every future Spanish municipality:

```
SpanishPlanningOntology.json   SpanishRuleResolver.ts
SpanishGISClassifier.ts        SpanishCitationEngine.ts
SpanishLegalParser.ts
```

### Success criteria

> The project should **not** be considered complete because every field is populated. It is complete
> when **every field is either**:
>
> 1. populated from an official primary source with an exact citation (document, article, paragraph);
> 2. populated from an official machine-readable GIS dataset with documented provenance; **or**
> 3. explicitly marked `unknown` because the official sources do not publish it, **with the reason documented.**

---

## §B — Capture notes (MINE, not the founder's)

### V-5 — Phase 12's taxonomy of unknowns is the strongest idea in this batch

*"Never leave `unknown` without explanation"*, with six mutually-exclusive reason codes
(`Not published` / `Special plan` / `Cannot automate` / `Missing GIS` / `Missing article` /
`Parser failure`), is the **direct fix for the bug-class this repo keeps hitting**: failure and
emptiness collapsing into the same value (L-422/457/467/469).

Note what the six codes actually separate: `Not published` and `Special plan` are **properties of the
world** (retrying never helps); `Missing GIS` and `Missing article` are **coverage gaps** (a better
source might help); `Cannot automate` is a **scope decision**; `Parser failure` is **our bug**
(retrying after a fix helps). That retryable/non-retryable split is exactly the distinction the
Denmark placement resolver encodes, and it should be a typed field, not prose.

### V-6 — Phase 0 and P4.5 are the same phase under two names

The `P4.5 — Planning GIS Intelligence` gate I added to the RATE plan and this batch's `Phase 0`
are the same work with the same deliverable (`VALENCIA-DATA-RECON.md`). **They should not become two
separate tracked items.** The RATE plan is the authoritative schedule; Phase 0–3 of this batch is the
detailed content of that single P4.5 gate. I have not restructured the RATE plan further — one gate
with a clear deliverable is easier to hold than a thirteen-phase parallel scheme.

### V-7 — The completion matrix is a target, not an estimate — and the distinction matters

PART B and PART C at a flat **100%**, with PART A at 95%, are *aspirations set before any probe has
run*. Madrid — the city that **has** been probed — is at ~40% overall with PART B at 75–95%
(itself disputed across batches) and licence still unresolved.

Nothing is wrong with setting the bar there. But this matrix must not be read back later as a
*measurement*. Until P4.5/Phase 0 runs, every València number is a prior, and the `RATE.md` axes
should stay `not-assessed` rather than being pre-filled from this table.

### V-8 — The stated goal is the right one and should be protected from scope drift

> *"The goal is not to implement Valencia. The goal is to determine whether Valencia can become the
> second Spanish archetype and whether the Spanish intelligence layer generalizes."*

This is the correct framing and it is worth defending, because phases 5–10 quietly *are* a full
implementation. If the generalization question is the real goal, then **phases 0–4 answer it** and
phases 5–12 are the implementation that follows only if the answer is yes.

The genome thesis lives or dies on whether Madrid-derived heuristics find València's zoning layer
without bespoke research (see G-2 in the country-level Genome capture). That is a 1–2 day question.
Everything after it is contingent — and should be scheduled as contingent, not committed in advance.
