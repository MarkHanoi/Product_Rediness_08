# Parcel Metadata Model — Chief Data Architecture Review (L-640)

> **A standards-committee review of PRYZM's parcel metadata model** against GIS / Digital-Twin / OGC /
> INSPIRE / IFC / CityGML / ISO 19115/19157 / STAC / W3C-PROV concepts, to determine whether it is
> fit to be the canonical specification governing every replicated city worldwide. Reviews the model as
> it exists today (`CITY-REPLICATION-STANDARD.md §1`) plus the proposed L-640 plan
> (`PARCEL-METADATA-MODEL-IMPLEMENTATION-PLAN.md`). Not a writing review — an architecture review.
>
> **Honesty rule (binding on every recommendation):** nothing here proposes inventing data. Every
> proposed field is tagged *computable-now*, *needs-source*, or *not-obtainable*; anything unsourced is
> modelled as an explicit `Unknown` with a typed `UnknownReason`. Listing/valuation/ROI/financing are
> permanently out of scope and are not reviewed.

---

## Executive Summary

**Overall score: 3/10 as-shipped (`CITY-REPLICATION §1`); ~6.5/10 with the L-640 plan applied; target 9/10 requires the six "Must Add" concepts below.**

Today the standard describes a *parcel-fetch pipeline* with a thin metadata surface (identity =
national `refcat`, geometry ring + one `areaM2`, a `kind: cadastral|footprint-fallback` discriminator,
and provenance intent in C57 §1.4). That is a sound *ingestion* recipe but **not a digital-twin metadata
model**. The L-640 plan closes most *domain* gaps (adds the 21 domains + a typed unknown-reason + a
per-domain honesty discriminator) and is the correct direction. It does **not yet** close the
*foundational* gaps that separate "richer than Litehaus" from "canonical for 10,000 cities".

**Top strengths (keep these — they are ahead of most platforms):**
1. The **honesty spine** (§CONTEXT-DATA-HONESTY): failure ≠ empty ≠ fabricated, with a closed refusal
   vocabulary and a typed unknown-reason. Most GIS platforms have nothing equivalent — this is a genuine
   differentiator and must be the load-bearing principle of the whole model.
2. **Explainability is already built** for the highest-stakes values (C58 `DerivationTrace` — source +
   article + calculation + confidence per envelope number). The parcel model should reuse this pattern.
3. The **`kind` discriminator** precedent (cadastral vs footprint-fallback) — a real, honest,
   provenance-first signal that generalises cleanly.

**Top weaknesses (the architecture gaps):**
1. **No stable, global, resolvable parcel IDENTITY.** Identity is `refcat` — national, ES-shaped,
   14-char. There is no canonical cross-jurisdiction parcel URN. *This is the single most important gap
   for a global twin.*
2. **No temporal VALIDITY / VERSIONING of the parcel object.** Parcels split, merge, and are re-surveyed;
   the model has a retrieval timestamp but no lifespan interval or supersession chain (INSPIRE
   `beginLifespanVersion`/`endLifespanVersion`, ISO 19108).
3. **The model is FIELD-CENTRIC, not DOMAIN-INHERITED.** Every subsystem (parcel/envelope/terrain/
   heights) defines its own confidence + provenance shape. There is no shared metadata contract →
   duplication and drift at scale.
4. **No data-QUALITY vocabulary (ISO 19157).** "Confidence" is a home-grown scalar-ish notion; there is
   no positional accuracy, completeness (commission/omission), logical consistency, or thematic accuracy.
5. **No CONFLICT-DETECTION or AUTHORITY-RANKING model.** The area-delta is the *first instance* of a
   general "sources disagree" problem that is never generalised, and there is no rule for which source
   wins.
6. **No AI-CONSUMPTION CONTRACT.** "AI-readiness" is listed as a domain but there is no defined contract
   stating what an agent may assume (min confidence, provenance floor, unknown-handling, determinism).

**Critical missing concepts:** Global Parcel URN · Temporal validity/versioning · A shared
cross-layer metadata contract (`MetadataEnvelope`) · An ISO-19157 quality vocabulary · Conflict-detection
+ authority ranking · An AI-consumption contract.

---

## Gap Matrix

| P | Missing item | Why it matters | Impact | Difficulty | New source? | Violates honesty? | Recommended action |
|---|---|---|---|---|---|---|---|
| **P0** | **Global parcel URN / stable identity** | A twin object must be persistently, globally addressable + de-duplicable across sessions/countries | Foundational — every relationship/lineage/version keys off it | Low (compose from existing IDs) | No | No | `ParcelURN = urn:pryzm:parcel:{iso3166}:{authority}:{localId}`; carry source `inspireId` (namespace+localId) where present, else `authority-does-not-publish` |
| **P0** | **Temporal validity + version** | Parcels change; a twin must know *when a fact was true* and supersession | Correctness over time; audit | Med (source-dependent) | Sometimes | No (Unknown when unpublished) | `validFrom/validTo` (`beginLifespanVersion` where published, else Unknown) + `versionId`; distinguish *object* time from *retrieval* time |
| **P0** | **Shared metadata contract (domain-inherited)** | Kills per-subsystem confidence/provenance duplication; one honesty vocabulary | Maintainability at 1k–10k cities | Med | No | No | Mint **C62** `MetadataEnvelope<T> = { value, provenance, confidence, quality, temporal, lineage, unknownReason? }`; C57/C58/C55/ADR-0277 all inherit it |
| **P1** | **ISO 19157 data-quality vocabulary** | "Confidence" alone is not auditable by a municipality/standards body | Trust, certifiability | Med | No (derivable) | No | Add positional accuracy, completeness (commission/omission), logical consistency, thematic accuracy — computed where possible, else Unknown |
| **P1** | **Conflict detection (typed)** | Cadastre-vs-GIS area, boundary mismatch, neighbour overlap are *detectable* and must not be hidden | QA, trust | Low–Med | No | No | `conflicts[]` with codes (`area-mismatch`, `boundary-mismatch`, `authority-disagreement`, `overlap`); the area-delta becomes the first instance |
| **P1** | **Authority ranking** | When sources disagree, a deterministic winner is needed | Multi-source reconciliation | Low | No | No | Typed `authorityRank` (national-cadastre > regional-GIS > INSPIRE > OSM > generated > user) on every sourced value |
| **P1** | **Validation-state lifecycle** | "Confidence" ≠ "who checked it"; a human/authority sign-off is a distinct axis | Certifiability (mirrors C58 L-449 gate) | Low | No | No | `validationState: not-checked \| auto \| cross-validated \| human-reviewed \| authority-confirmed` (default not-checked; upgrades on recorded events only) |
| **P1** | **Geometry LoD + precision (CityGML/ISO 19157)** | A cadastral ring ≠ a surveyed boundary ≠ an OSM footprint — the *precision class* must be declared | Downstream (envelope/setbacks) correctness | Low | No | No | `geometryLoD` (cadastral \| surveyed \| footprint-osm \| drawn) + `coordinatePrecision_m` + reprojection residual (the §L-536 round-trip) |
| **P2** | **AI-consumption contract** | Agents must know what they may safely rely on | Safe AI planning | Low | No | No | A stated contract: an agent MUST honour `confidence`, `unknownReason`, `validationState`; MUST NOT treat Unknown as 0; determinism guarantee per field |
| **P2** | **Lineage as a PROV graph** | "Lineage" as prose is not machine-auditable | Debuggability, audit | Med | No | No | W3C-PROV-style `{entity, activity, agent, used, wasGeneratedBy}` chain, not a string |
| **P2** | **Spatial relationships at scale** | Per-parcel adjacency blobs don't scale to 10k cities | 10k-city query bottleneck | High | No | No | Model relationships as a graph/spatial-index reference, not inline per-parcel arrays |
| **P3** | **Completeness (per-domain)** | "100% accurate but 40% complete" is a real, distinct state | Honest coverage reporting | Low | No | No | `completeness` per domain (which fields populated vs applicable), distinct from confidence |

*None of the above requires fabricating data; every field is Unknown-typed where its source is absent.*

---

## Metadata Domains Review (each scored /10, with the missing attributes)

1. **Identity — 3/10.** Has `refcat` (national) + municipality/parish (ES). **Missing:** global URN, INSPIRE `inspireId` (namespace+localId), `nationalCadastralReference` (the standard INSPIRE field), source authority as a typed entity, dataset id. *URN + inspireId are computable-now from existing data; deep admin levels need the source.*
2. **Geometry — 6/10.** Ring + one area. **Missing:** perimeter, centroid, bbox, compactness/elongation/rectangularity/shape-index, frontage count+length, longest edge, vertex count, ring validity, self-intersections, holes (KV-2 already flags interior-ring loss), multipart, **geometry LoD**, coordinate precision, reprojection residual. *All computable-now except LoD source-tagging.*
3. **Provenance — 5/10.** C57 §1.4 intent is strong (source/version/CRS/license/timestamp) but **not yet a structured object on the parcel**, and `areaM2` violates it (KV-3). **Missing:** structured provenance object, endpoint, adapter, cache-age, authority entity. *Computable-now.*
4. **Confidence — 2/10 today / 6/10 with L-640.** Only the `kind` discriminator today. L-640 adds per-domain confidence — but it must inherit the shared contract (C62), not be parcel-local. **Missing:** the shared shape, authority rank, ISO-19157 quality.
5. **Completeness — 0/10.** Absent. Add per-domain completeness (distinct axis).
6. **Validation — 0/10.** Absent. Add the validation-state lifecycle.
7. **Explainability — 8/10 (for envelope) / 2/10 (for parcel).** C58 `DerivationTrace` is excellent — **reuse it for every derived parcel value** (area-delta, geometry metrics). Missing: applying it below the envelope.
8. **Lineage — 1/10.** Named in L-640, not modelled. Adopt PROV.
9. **Temporal — 1/10.** Retrieval timestamp only. **Missing:** dataset publication/acquisition, survey date, effective/superseded date, lifespan version, last-validation, last-replication. *Object-time needs the source (else Unknown); process-time is free.*
10. **Authority — 0/10.** Absent. Add authority ranking (the reconciliation key).
11. **Context — 4/10.** Context is *rendered* (C57/C61 pipeline) but not *stored as parcel metrics* (nearest building, avg surrounding height, street width, block density). *Computable-now from the context bake + heights.*
12. **Environmental — 2/10.** Partial via C55 overlays; not attached to the parcel. *Slope/aspect computable from terrain; flood/protected via C55; utilities not-obtainable → Unknown.*
13. **Infrastructure — 1/10.** Corner-parcel/road-class derivable from OSM; utility networks generally `authority-does-not-publish`.
14. **Legal/Planning — 6/10.** C58 owns this well; the parcel dossier should *surface* it (zone code, ordinance ref, overlays, effective date) by reference, not refetch.
15. **Administrative hierarchy — 4/10.** Municipality/parish (ES). **Missing:** country/region/province/statistical-unit as typed levels (ES derivable from refcat; others per source).
16. **Relationships — 2/10.** ES manzana gives adjacency; not modelled or scaled. Graph model needed for 10k.
17. **Topology — 1/10.** touches-road/river/protected derivable from geometry vs context layers; not stored.
18. **Derived metrics — 5/10.** Same as geometry-diagnostics; computable-now.
19. **Capability flags — 0/10.** Absent. Derive `can-generate-envelope/FAR/setbacks/shadows/solar` from which domains are populated (a cheap, useful gate).
20. **AI-readiness — 0/10.** Absent as a contract. Add the AI-consumption contract.
21. **Replication health — 3/10.** GEOGRAPHIC-ROLLOUT-MASTER-TRACKER has it globally; not per-parcel/city as a structured object.

---

## Architectural Findings

1. **FIELD-CENTRIC → DOMAIN-INHERITED is the #1 structural fix.** Today confidence/provenance/temporal
   are re-invented per subsystem (C57 parcel, C58 envelope `EnvelopeConfidence`, ADR-0277 heights,
   C55 overlays). At 1,000 cities this is unmaintainable drift. **Recommend a single generic wrapper**
   `MetadataEnvelope<T> = { value: T | Unknown, provenance, confidence, quality, temporal, lineage,
   authorityRank, validationState }` (mint **C62**), which every layer's fields inherit. The parcel
   dossier then becomes a *composition* of `MetadataEnvelope`-wrapped values, not a bespoke schema. This
   also makes the honesty rule (Unknown + reason) *structural* — it lives in the wrapper, not in every
   field by hand.
2. **Identity is not first-class.** Everything (relationships, lineage, versioning, conflict) needs a
   stable key; `refcat` is not it. The URN is a prerequisite, not a nice-to-have.
3. **Duplication of "confidence".** C58's `EnvelopeConfidence` (6-tier) and the L-640 parcel `match`
   (3-tier) are two scales. Under C62 they become one vocabulary with domain-specific levels — never two
   divergent scalars a consumer must reconcile.
4. **The parcel dossier must AGGREGATE, never RECOMPUTE.** Planning/legal/explainability already live in
   C58; heights in ADR-0277/C61; overlays in C55. The dossier references them (by URN + a pointer),
   carrying each subsystem's own confidence. Recomputing would create a second source of truth.
5. **Storage model is unaddressed.** The standard is silent on *where* this metadata lives (inline on
   the Site? a spatial DB? a parcel store?). At scale it cannot be inline JSON blobs; it needs a spatial
   store keyed by URN with the C62 schema. Flag as architectural debt to decide before 1k cities.

---

## Future-proofing Review

- **100 cities:** the L-640 plan (per-parcel metadata, inline) works. No blocker.
- **1,000 cities:** the field-centric duplication and the absence of a shared contract start to cost —
  every new subsystem re-implements confidence/provenance; conflict/validation states need a store.
  **C62 (shared metadata contract) must land before this scale**, and the URN must be canonical (or
  cross-city de-duplication and relationships break).
- **10,000 cities:** inline per-parcel relationship/topology arrays and inline lineage become a query +
  storage bottleneck. Requires: a **spatial database keyed by parcel URN**, relationships as a **graph
  index** (not per-parcel blobs), and **lineage/provenance in a dedicated store** referenced by URN.
  Without the URN + C62 + a spatial store, the model does not reach 10k cities.

---

## Final Recommendation (prioritised roadmap)

**Must Add (before this is canonical — the foundations):**
1. **Global parcel URN** + carry INSPIRE `inspireId`/`nationalCadastralReference` (computable-now; ES first, Unknown elsewhere).
2. **The shared metadata contract C62 (`MetadataEnvelope<T>` + the typed `UnknownReason`)** — every layer inherits it; parcel `confidence` and envelope `EnvelopeConfidence` unify under it.
3. **Temporal validity + version** (`validFrom/validTo/versionId`; Unknown where the source doesn't publish lifespan).
4. **Geometry LoD + precision + reprojection residual** (declare the precision class — cadastral vs footprint vs drawn).
5. **Conflict detection (typed) + authority ranking** (generalise the area-delta; deterministic winner).
6. **Validation-state lifecycle** (distinct from confidence; default not-checked).

**Should Add (the trust + auditability tier):**
- ISO-19157 quality vocabulary (positional accuracy, completeness, logical/thematic).
- Reuse C58 `DerivationTrace` for every derived parcel value (explainability below the envelope).
- Per-domain completeness; capability flags; the AI-consumption contract.
- PROV-style lineage graph.

**Nice To Have (populate as sources land, Unknown-gated):**
- Context metrics (nearest building, avg height, street width, block density) from the context bake.
- Environmental (slope/aspect/flood/protected) via C55 + terrain.
- Infrastructure corner/road-class from OSM (utilities stay Unknown).
- Administrative hierarchy deep levels; relationships/topology as first-class.

**Future Research:**
- The spatial-store + graph architecture for 10k-city scale (URN-keyed, C62-schema'd).
- Adopting OGC API Features `id`/`links` + STAC concepts for the raster-provenance side (terrain/heights).
- CityGML/IFC georeferencing + LoD alignment for the eventual 3D-parcel/BIM bridge.

**Bottom line:** the L-640 plan is the right *domain* coverage, but the model is not yet *canonical-grade*
until the six Must-Adds land — above all the **URN (identity)** and the **shared C62 metadata contract
(domain-inheritance)**. Those two convert a rich per-parcel dossier into a scalable digital-twin object
model. Everything here is honesty-safe: every unsourced field is an explicit typed Unknown.
