# Envelope Replication Standard — "Replicate Barcelona's Envelope"

> **The canonical, code-grounded, end-to-end standard for bringing a city's BUILDABLE ENVELOPE to
> production quality.** Barcelona is the reference implementation — the one jurisdiction that produces
> sound envelopes (true boundaries, neighbourhood-dependent setbacks, constructed buildable depth, real
> patios, ordinance height, FAR, storeys, GFA, volume, dwelling capacity), each value carrying its own
> provenance. This document is the *to-be-followed* recipe so every new city is produced *identically*
> to the city that works, with per-jurisdiction deviations plugged in at defined slots.
>
> **Status:** CANONICAL reference (2026-07-29). Synthesises the real implementation (file:line cited)
> from four code-grounded research passes. Companion to — does NOT duplicate — the existing canonical
> docs it links: **C58** (the envelope contract — the authority on rules/schema/engine), **C57**
> (parcel data), **ADR-0269/0270/0271/0272/0273/0274/0275/0276** (the individual rule decisions),
> **ADR-0279** (this pipeline-as-standard decision), `JURISDICTION-PLAYBOOK.md` (per-jurisdiction folder
> shape + onboarding), `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` (the WHAT/WHEN + coverage), and
> `jurisdictions/ENVELOPE-REALISM-MATRIX.md` (per-city realism status). It is the envelope sibling of
> `CITY-REPLICATION-STANDARD.md` (which covers L3 only in summary — this doc is the L3 authority-by-reference).
>
> **Governance:** conflict order is VISION → ARCHITECTURE → C01–C60 contracts → ADRs → SPECs. When code
> disagrees with a contract, the code is wrong. Edit canonical docs in place; never spawn `*-AUDIT.md`.

---

## 0 — The mental model: the envelope is a CONSTRUCTION, not a lookup

A buildable envelope is **not a row you fetch**. For the fabric that matters most (dense European
blocks), the ordinance states an **algorithm** — e.g. Barcelona PGM-1976 Art. 242.2 *profunditat
edificable* (buildable depth = whatever leaves ≥30% of the block interior free), applied via Art.
327.1. The answer is **constructed from the real cadastral block geometry and cited**, never looked up
(ADR-0271 §281-283). This is the single most important truth: **there is no dataset to buy for the
envelope.** (`SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` §1.2.)

The whole system is one **jurisdiction-agnostic core** + **per-jurisdiction data packs**, decided in
**ADR-0269** and enforced by CI dependency boundaries (`apps/editor ← @pryzm/site-parcel-data ←
@pryzm/schemas`). "Add a city" is a **data addition at five slots**, never an engine or UI edit:

| Slot | What the jurisdiction supplies | Cost | File |
|---|---|---|---|
| S1 | **Parcel provider** (cadastre → real ring) + same-origin proxy | LOW — keyless where a cadastre is open | `parcelProviders/registry.ts` |
| S2 | **Jurisdiction router predicate** `isInX(lat,lon)` + `X_BBOX` | TRIVIAL — one bbox | `providers/` + `siteDispatch.ts` |
| S3 | **Zone-identity provider** `fetchZoningAtPoint → ZoningRecord` | MED — a GIS/WFS + a pure field-map | `providers/ZoningProvider.ts` |
| S4 | **Curated rule pack** (`JurisdictionZoningContract`) — the whole cost | **HIGH — human-gated legal sourcing** | `rulepacks/<city>.ts` |
| S5 | **Jurisdiction registration** (extent, `packsByZone`, `refusalFor`) | LOW — lights the C60 coverage globe | `rulepacks/registry.ts` |
| + | One **L5 dispatcher branch** `applyXZoningThenFallback` | LOW | `apps/editor/src/ui/site/siteDispatch.ts` |

**The load-bearing truth (`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` §4.0):** the geometry (block dissolve
~91% nationally in Spain) was *never* the blocker. A second Spanish city is blocked by **three
non-geometry gates** — the router predicate (S2), the Catalonia-only zone source (S3), and exactly one
registered rule pack (S4/S5). **The rule pack (S4) is the entire cost, and that cost is legal
SOURCING — human-gated, does not parallelise with engineers** (AMB 403s scripts; ordinance pages are
robots-disallowed; each municipality layers its own *modificacions*).

**Heights are NOT an envelope prerequisite (correcting the common assumption).** The envelope's max
height is an **ordinance** value (Art. 327.2 *alçada reguladora*, keyed on official street width),
derived from *law*. Measured/derived building heights feed the **3D CONTEXT SCENE** (the neighbours) —
a separate axis (see `CITY-REPLICATION-STANDARD.md` L5, ADR-0277). **The only crossover** is Barcelona
*clau 12b* (nucli antic), where height = average of existing neighbours; it is **deliberately HELD**
(`⏸`) until context heights are real, because averaging 79%-estimated heights into a *legal* number is
"fabrication wearing the costume of a construction". So: **a city can produce a sound envelope with
zero measured building heights.**

---

## 1 — The structural pipeline (the ordered stages every city runs identically)

From parcel-click to feasibility card. Each stage is GENERIC (runs unchanged for every jurisdiction)
or the JURISDICTION deviation (the pack/provider/predicate the city supplies). The GENERIC spine is
the standard; the deviations are the five slots above.

| # | Stage | What it produces | Generic / deviation | Anchor (file:line) |
|---|-------|------------------|---------------------|--------------------|
| P0 | **Parcel commit** | boundary ring (scene-XZ) + θ-frame; caches estimated envelope | GENERIC | `siteDispatch.ts:911-1005` (`dispatchParcelBoundary`) |
| P1 | **Jurisdiction routing** | picks the city's path by area-centroid lat/lon | GENERIC router; **S2** predicate | `siteDispatch.ts:1031-1166` (`applyZoning`; BCN gate `:1108`) |
| P2 | **Parcel + zone fetch** | real cadastral ring + zone code (*clau*) | **S1 + S3** providers | `siteDispatch.ts:2663-2666` (MUC + Catastro) |
| P3 | **Rule-pack resolution** | `pack` \| `refusal` \| `unregistered` | GENERIC registry; **S4/S5** pack | `rulepacks/registry.ts` (`resolveZoneDisposition`); call `siteDispatch.ts:2710` |
| P4 | **Block dissolve** (alignment zones) | the manzana ring from N parcels | GENERIC geometry (ADR-0274) | `siteDispatch.ts:2989` (`dissolveParcelsToBlockRing`) |
| P5 | **Frontage classification** | per-edge front/side/rear vs streets | GENERIC (roads = OSM) | `siteDispatch.ts:3053,3123` (`classifyBlockFrontages`) |
| P6 | **THE SOLVE** | `BuildableEnvelope` (inset footprint + numbers + derivation) | **GENERIC engine** — zero city logic | `ZoningRulesEngine.ts` (`computeBuildableEnvelope`); call `siteDispatch.ts:3160-3169` |
| P7 | **Height resolution** | *alçada reguladora* from street width + zone | JURISDICTION (pack height table) | `siteDispatch.ts:3232-3259` (`measureStreetWidths`→`resolveAmpladaDeVial`→`resolveBcnAlcadaForZone`) |
| P8 | **Height + FAR attach** | re-applies the L-616 FAR cap on the legal shell | GENERIC helper | `siteDispatch.ts:3346-3384` (`applyConstructedHeight`) |
| P9 | **P6 command dispatch** | persists setbacks/FAR/height/`buildableRing` onto the Site | GENERIC (C19 path) | `siteDispatch.ts:3536-3549` (`siteUpdateZoning`) |
| P10 | **Card render** | the feasibility card (AS-IS + TO-BE + provenance) | GENERIC render | `GISAreaLayout.ts:2283-2627` (`refreshEnvelopePanel`) |
| P11 | **Storey cap (enforcement)** | caps authored building storeys to the envelope | GENERIC | `OnboardingStepController.ts:1818-1825,2396-2402` (`capStoreysToEnvelope`) |

The solve (P6) **branches exhaustively on `geometricRule.kind`** and — the honesty invariant — **hard-
fails to `status:'degenerate'` (empty ring) rather than falling through** when a required input (block
ring, front edge, footprint) is missing. It **never refuses on legal grounds** (`refusal:null` always);
a legal "no envelope" is a *classification* decided upstream in the registry (P3), not in the engine.

---

## 2 — The GENERIC core (what NEVER changes per city)

The invariant spine. Touching it is a whole-architecture change, not a city onboarding.

- **`computeBuildableEnvelope`** (`ZoningRulesEngine.ts`) — the one pure solver, L2, byte-deterministic,
  **zero jurisdiction logic**. Inputs are *injected, never fetched* (`parcelRing`, `edgeClassifications`,
  `zoning`, `rulePack`, `geometricRule`, `blockRing`, `explicitAreaFootprint`). Header states it: "All
  jurisdiction knowledge lives in the `ZoningRecord` (from a provider) + the `JurisdictionZoningContract`
  (a data pack). Adding DK/ES is a new pack, never an engine edit."
- **`GeometricRule`** (`packages/schemas/src/site/GeometricRule.ts`) — a **Zod discriminated union on
  `kind`**, not optional fields (ADR-0270), so a jurisdiction's *shape* of rule is a variant and a
  missing solver branch is a **compile error**. Five kinds today:
  `setback` · `alignment` · `block-derived-alignment` (BCN Art. 242.2, ADR-0271) · `tiered-occupation`
  (BCN 22a, ADR-0273) · `explicit-area` (NL bouwvlak, Madrid).
- **`resolveNumber`** (`ZoningRulesEngine.ts:108-120`) — the per-field resolution ladder: `structured`
  (provider published it) → pack zone value → `null`/`from:'none'`. Never invents.
- **Two data-driven registries**: `parcelProviders/registry.ts` (routes parcel geometry, always returns
  a verdict — universal OSM footprint fallback so a click is never dead) and `rulepacks/registry.ts`
  (`packMap()` **throws at module load on a duplicate zone code** — "one clau, one pack").
- **The command bridge**: `dispatchEnvelope → siteUpdateZoning` — the single P6 path into the C19 Site
  (setbacks, maxFAR, maxHeight, `buildableRing`, zoning) shared by every jurisdiction.

---

## 3 — The per-jurisdiction DEVIATION (what each city supplies)

### 3.1 The rule pack anatomy (`JurisdictionZoningContract`, `packages/schemas/src/site/zoning/JurisdictionZoningContract.ts`)
`{ jurisdictionId, displayName, source (catastro-muc|madrid-pgou|oereb|plandata-dk|terrara|manual),
crs, lastReviewed (curation freshness), defaultConfidence, zones[] }`. Each zone:
`{ code, label, permittedUse[], maxHeight_m, maxFloors, plotRatioFAR, maxCoverage, setbacks{front,side,rear},
fieldProvenance (per-field), ordinanceRef, geometricRule }` — **every numeric field `nullable().default(null)`**.
"An unknown value is a `null` plus a provenance flag, NEVER an invented number." No rule VALUES live in
the schema — the schema defines the slots; the numeric packs are curated, versioned data artefacts.

### 3.2 Choosing the `GeometricRule.kind` (the deviation that matters most)
Pick the kind that matches the fabric's **shape**, not the country:
- **`setback`** — suburban / detached (front/side/rear metres). BCN 20a (edificació aïllada), Riyadh.
- **`alignment`** / **`block-derived-alignment`** — perimeter-block fabric where depth is measured from
  the street and the interior is a shared patio (party walls to both sides). BCN Ensanche 13a/13E.
- **`tiered-occupation`** — multi-height envelopes (a taller street band + a lower interior band). BCN 22a.
- **`explicit-area`** — the source publishes the buildable polygon directly (a *bouwvlak*). NL, Madrid.

### 3.3 Registered packs today (depth is overwhelmingly Barcelona)
- **Barcelona (production, the reference):** `esBarcelonaEnsanche` (13a/13E), `esBarcelonaSemiintensiva`
  (13b), `esBarcelona20aAillada` (real setback), `esBarcelonaNucliAntic` (12), `esBarcelonaIndustrial`
  (22a, authored but *not registered* pending sign-off), + per-article height tables (`bcnAlcada*.ts`).
- **Refusal-only / single-zone declarations (honest, pending sourcing or sign-off):** Madrid NZ-1
  (`explicit-area`, refusal-only), Córdoba PGOU (machine-OCR, verification-gated), Switzerland/Zürich
  (zone-ID only → refuses envelope), NL bestemmingsplan (`explicit-area`, certified path).
- **Fallback:** `estimatedDefault` (one `generic-urban` zone, every field flagged `estimated` → the
  mandatory "Estimated" badge).

---

## 4 — The per-parcel DATA MODEL (AS-IS + TO-BE + provenance)

There is **no single card view-model type** — the model is assembled from four schema objects. Persisted
truth lives on `Parcel` (C19); the computed result is `BuildableEnvelope` (C58); the card is built in
`GISAreaLayout.ts:2127-2280` (`buildSiteDataBlock`). Governing render rule (`:2091`): **"NEVER SYNTHESISE
A MISSING VALUE"** — storeys show only when the pack derived `maxFloors`; GFA only when storeys are real.

**AS-IS (existing site facts, pure geometry off the committed boundary):** parcel `boundary.polygon`,
`edgeClassifications`, `area`, `perimeter`, bounding box, boundary-edge + street-frontage count,
`zoning.category` (zone identity), `overlays`. Source: *Cadastral boundary as committed (Catastro / drawn).*

**TO-BE (regulated potential, from the rule pack + solve):** `insetPolygon` (buildable footprint),
`insetAreaM2` (max area of implementation), `maxHeight_m` (legal shell), `farLimitedHeight_m` (FAR-realistic
height, L-616), `maxFloors` (storeys — **never back-computed**), `maxFAR`, `maxCoverage` (site coverage),
`maxVolumeM3` (study volume), buildable depth + alignment offset + side treatment (party-wall) via the
`alignment.*` derivation rows, per-storey band, capacity (`dwelling module` Art. 323 = 80 m²; `max
dwellings` ≈ GFA ÷ module — BCN 13a/13b only, a separate legal question §ENVELOPE-CAPACITY-DOMAIN),
`permittedUse`, `tiers[]` (multi-height). Persisted TO-BE truth: `Parcel.buildableRing`.

**⚠ Land type (urban / buildable / rustic / green) is NOT a first-class field.** It is expressed
*indirectly* via `permittedUse` + the **refusal codes** (`protected-soil`, `public-open-space`,
`protected-private-green` = green/rustic land answering "no private envelope"). If the founder wants an
explicit land-type row, that is a **new schema field + provider mapping** (flagged in §8 as a gap).

---

## 5 — The HONESTY model (non-negotiable — three orthogonal axes + a closed refusal vocabulary)

This is what makes the envelope trustworthy and must never regress. Enforced structurally in
`packages/schemas/src/site/zoning/ProvenanceFlags.ts`.

1. **Per-field provenance** `FieldProvenance`: `published-structured` > `ordinance-pdf` (human
   transcribed) > `pipeline-extracted` (machine OCR, **permanently marked unverified** until a human
   signs off) > `estimated`.
2. **Envelope confidence** `EnvelopeConfidence` (mandatory on every envelope): `authoritative` >
   `structured` > `block-constructed` (real cadastral geometry + accepted rule = BCN Art. 242.2 green
   badge) > `estimated-ruleset` > `pipeline-extracted-unverified` (a PERMANENT tier — never silently
   graduates) > `not-determined` (a refusal — *no determination made*, explicitly not a weaker estimate).
   The taint rule: **any single pack-derived number collapses the whole envelope to `estimated-ruleset`**.
3. **Granularity** `EnvelopeGranularity` (`parcel|block|sector|ambito|municipality|unknown`): a number can
   be published, numeric and authoritative and still unusable because it answers at *ámbito*/sector level
   (Madrid VEDA). `unknown` counts as coarser-than-parcel, never optimistic.

**Refusal is a positive answer** (ADR-0276). `EnvelopeRefusal` carries a **closed 11-code vocabulary**
(`public-system, public-open-space, facility-plan, protected-soil, protected-private-green, derived-plan,
overlay-uncertain, no-rule-pack, source-data-unavailable, regime-undetermined, no-plan-at-point`) +
`legallyGrounded: boolean` (law vs coverage). A schema `.refine()` makes `refusal` present **iff**
`status==='not-applicable'`, so a blank card or a refusal-beside-a-good-envelope cannot parse. **"Failure
and empty are different answers"** — the exact honesty rule the whole platform is held to.

**Over-statement guards** (the founder's L-616/L-619 concerns): `farLimitedHeight_m` draws the FAR-
realistic solid inside the legal shell; `footprintIsUpperBound` hatches the footprint when it is the whole
parcel only because setbacks are UNKNOWN. Over-statement is the one forbidden direction.

---

## 6 — Data prerequisites & sourcing (per country)

**Parcel geometry (S1)** — keyless cadastres WIRED for **ES** (Catastro), **FR** (IGN), **NL** (PDOK),
**NO** (Matrikkelen), **DE-NW** (ALKIS), **CH** (swisstopo); **DK** credential-gated (Datafordeler);
**SA** footprint-only (geo-fenced); everywhere else OSM footprint fallback (labelled, never a legal parcel).

**Zone identity (S3)** — providers exist/gated for Catalonia MUC (BCN, the only production one), Madrid
PGOU, NL bestemmingsplan (PDOK), CH Grundnutzung + Zürich BZO, Paris PLU, DK Plandata, Córdoba PGOU. Zone
source is the **medium-cost** transfer layer — each region is a new GIS + taxonomy.

**Rule pack (S4)** — **the whole cost, human-gated legal sourcing.** Only `es-08019-barcelona` is in
production. See `ENVELOPE-REALISM-MATRIX.md` for per-city status.

**Building heights** — **NOT an envelope prerequisite** (see §0). A prerequisite for the realistic
context scene only. Sourcing map (ADR-0277, "derive don't license"): FR done (BD TOPO); ES (MDS
Edificación); NL/CH/DE-Berlin/Bavaria/NRW path-proven keyless; NO/UK/PT derive nDSM=DSM−DTM; DK/SE
free-account; SA blocked (Copernicus GLO-30 interim). ⚠ The nDSM LiDAR engine is a **scaffold** today
(pdal/laspy/rasterio absent from the build env), so derive-countries are *decided but not yet produced*.
The context-scene height/terrain invariants have **no ratified contract** — recommended **C61** (unminted).

---

## 7 — Onboarding checklist (the recipe to add a city's ENVELOPE)

Bold = hard blocker; a city cannot produce a sound envelope without it.

1. **S1 — Parcel provider**: register a `ParcelJurisdiction` (regionCode, providerId, proxyPath, `kind`,
   `contains` predicate, live-probe note) + a same-origin proxy in `server/`. No open cadastre →
   `footprint-fallback` (works, honestly labelled).
2. **S2 — Router predicate**: add `isInX(lat,lon)` + `X_BBOX` in `providers/` — **the same object** the
   dispatcher routes on (never a copy). *Without this the solver is never called there → success rate is
   unobservable. This is the first blocker for every non-BCN city.*
3. **S3 — Zone-identity provider**: `fetchZoningAtPoint → ZoningRecord` (**never throws**; a miss returns
   `null` → estimated fallback), with a pure, unit-tested field-mapping function.
4. **S4 — Rule pack** (**the whole cost**): a curated `JurisdictionZoningContract` with `lastReviewed`,
   per-field `fieldProvenance`, `ordinanceRef` citations, and the correct `geometricRule.kind` for the
   fabric. Sourcing is human-gated and does not parallelise.
5. **S5 — Jurisdiction registration** in `rulepacks/registry.ts` (extent, `contains`, `answerSummary`,
   `packsByZone`, `refusalFor`) — lights the C60 coverage globe automatically.
6. **L5 dispatcher branch** `applyXZoningThenFallback` in `siteDispatch.ts` — the one editor addition.
7. **Verification gate**: a dispatcher flag (e.g. `CORDOBA_ENVELOPE_VERIFIED`) that keeps the pack
   **refusing** until a human signs `VERIFICATION.md` (L-449 gate). Machine-extracted packs stay
   `pipeline-extracted-unverified` until a recorded sign-off.
8. Block dissolve + street-width measurement are **free geometry** (already ~91% in Spain) — not a blocker.

---

## 8 — Known gaps & architectural debt (fix these to make the standard fully sound)

1. **⚠ The merge-blocking CI "fidelity-label" gate is NOT implemented.** ADR-0269 and C58 §6 both mandate
   `tools/ga-gate/check-zoning-fidelity-label.ts` as a **hard, non-negotiable** gate ensuring
   "`estimated-ruleset` is never authoritative-styled". Neither it nor its named template exists in
   `tools/ga-gate/`. Today the "never render an estimate as published" guarantee rides on the schema +
   convention, not CI. **Highest-priority debt** — build it before scaling to more cities.
2. **Per-edge front/side/rear classification is not fully wired** — the engine applies a *uniform* setback
   fallback and self-flags it in caveats (C58 §10.3). Affects every setback-governed jurisdiction.
3. **Granularity provider plumbing is partial** — the engine hard-codes `granularity:'parcel'`; a coarse
   provider (Madrid VEDA *ámbito*, Valencia sector) has no path to stamp its real granularity yet.
4. **No first-class land-type field** — urban/buildable/rustic/green is only expressed via `permittedUse`
   + refusal codes. An explicit AS-IS land-type row (founder-requested) is a new schema field + mapping.
5. **The L5 seam is thicker than the pure-registry ideal** — Madrid/NL/CH/Paris are wired directly in the
   dispatcher rather than via `packsByZone` (deliberate honesty-gating, with "WIRING TODO" notes).
6. **Context-scene heights have no ratified contract** — recommend minting **C61** (see §6); the nDSM
   engine is a scaffold.

---

## 9 — Contract / ADR / spec index

- **Contracts:** C58 (envelope — the authority) · C57 (parcel data) · C19 (site model) · C60 (entry +
  coverage) · C55 (analytical layers) · C12 (geospatial substrate). Recommended new: **C61** (context
  scene / heights / terrain).
- **ADRs:** 0269 (parcel→zoning→envelope strategy) · 0270 (geometric rule model) · 0271 (block-derived
  depth) · 0272 (coverage + FAR zones) · 0273 (tiered occupation) · 0274 (tolerant block dissolve) · 0275
  (street-width construction + provenance ladder) · 0276 (regime-undetermined refusal) · 0277 (geo-data
  sourcing) · **0279 (this pipeline-as-standard decision).**
- **Specs/reference:** `SPEC-BUILDABLE-ENVELOPE-UX.md` · `SPEC-COMPLIANCE-REPORT.md` ·
  `SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` · `GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` ·
  `jurisdictions/ENVELOPE-REALISM-MATRIX.md` · `JURISDICTION-PLAYBOOK.md` ·
  `ORDINANCE-EXTRACTION-PIPELINE.md` · `CITY-REPLICATION-STANDARD.md` (the terrain/context sibling).

---

## 10 — One-line summary

**The envelope is a jurisdiction-agnostic CONSTRUCTION, not a lookup: one pure solver + a discriminated
`GeometricRule` union + two data-driven registries, so onboarding a city is a data addition at five slots
(parcel provider, router predicate, zone source, curated rule pack, registration) — the rule pack being
the entire, human-gated legal cost — and every number carries provenance so an estimate is never dressed
as published and an empty is never dressed as zero.**
