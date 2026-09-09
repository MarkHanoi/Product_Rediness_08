# C57 — Parcel Data Layer

> **Stamp**: 2026-07-17 · **Status**: DRAFT
> _DRAFT: the subsystem is partially built (Spain/Catastro parcel-select ships; the provider abstraction is proven) but not yet lifted to its target L2 package, and this contract binds nothing until ratified. Content describes intended shape; where a slot is unbuilt it is named, not asserted-conformant._
> **Scope**: governs the **parcel data subsystem** — the provider-agnostic ingestion of real cadastral **geometry + attributes** for a plot the user selects on the map, its canonical data model, the adapter contract (one per jurisdiction/source), the same-origin proxy + secret-handling rules, EPSG handling, coverage-miss degradation, and the hand-off of a selected parcel into [C19](./C19-SITE-MODEL-AND-PARCEL.md)'s one-shot immutable site-boundary. Companion to [C58 Zoning Rules & Buildable Envelope](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (which turns the parcel + zoning into a compliant envelope) and to [C12 Geospatial](./C12-GEOSPATIAL.md) (which owns coordinate transforms).
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md), [C12](./C12-GEOSPATIAL.md), [C19](./C19-SITE-MODEL-AND-PARCEL.md), [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md), [C23](./C23-PROVENANCE-AND-AI-AUDIT.md).
> **Downstream**: [C58 Zoning Rules & Buildable Envelope](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (consumes the fetched parcel ring + jurisdiction id); [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) (renders parcel provenance); [SPEC-PARCEL-SELECTION](../../03-execution/specs/SPEC-PARCEL-SELECTION.md) (proposed — the map interaction).
> **Key principles**: **P5** (schemas pure — no THREE / no I/O in `packages/schemas/src/site/`), **P1** (providers are wired once, not re-instantiated ad hoc), **P4** (no `(window as any)` reach-through for the fetch), **P8** (every exported provider / proxy fn opens an OTel span `pryzm.parcel.<verb>`).
> **Strategy**: [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (compliance-authoring pillar; Denmark-first reference, jurisdiction-agnostic core).
> **Audit context**: ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md (audit removed 2026-08-09 — recoverable from git history) (G-DATA-1..5), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/geospatial/PARCEL-ZONING-FEATURE-SCOPING.md) §3/§6.1, [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) §2/§4. This contract fills the reserved slot C19 §9 ("jurisdiction-specific building-code databases — future contract; §10.2 registry pending") jointly with C58.

---

## §1 — Invariants

The numbered rules below are binding on every PR that touches parcel-data ingestion. Each invariant has an §1.N id usable in `TODO(C57.N)` annotations and in `check-parcel-*.ts` CI gate failure messages.

### §1.1 — GeoJSON / WGS84 is the one canonical interchange

Every adapter MUST normalise its source (GML, ArcGIS-JSON, Shapefile, CityJSON, native GeoJSON — in EPSG:25832 / 25830-31 / 2056 / 4258 / …) to a **WGS84 lat/lon ring** at ingest time. Nothing downstream of an adapter — the map UI, C58's rules engine, `buildBoundaryFromLatLonRing` — may see the source format or CRS.

- The canonical fetched shape is `ParcelFeature` (§2.1): a WGS84 ring + cadastral attributes + provenance.
- Reprojection to WGS84 happens **at the edge** (adapter or proxy), never deeper. This preserves C12's single-projector rule (`packages/geospatial/LTPENURebase.ts` — `proj4` is the one projector; see §1.6).

**Why**: a new jurisdiction is then a new adapter emitting the same canonical GeoJSON; the core is untouched. This is the property that makes the provider abstraction scale (per the Denmark reference §4.1) — build the engine on one jurisdiction, run it on another by an adapter swap.

### §1.2 — All upstream access goes through the same-origin server proxy; keys are server-side only

An adapter MUST NOT fetch a government/cadastral endpoint directly from the browser. Every network call goes through the same-origin proxy (`server/jurisdiction/parcelZoningProxy.js` — already mounted, route `/api/catastro/parcel`, `server.js:363`), which forwards once, normalises, caches, and returns same-origin JSON.

- **Secrets rule (hard)**: any API key, service-user credential, or OAuth token (e.g. the Denmark **Datafordeler** service-user key — §3.2) lives **only** in server-side env / Fly secrets. It MUST NOT appear in client code, the repo, a bundled string, or a response body. The browser never sees a key; the proxy is the only key holder (mirrors how the Cesium/Google token is server-gated today).
- The proxy is the CSP boundary: because all fetches are same-origin, no `connect-src` change is required. If a direct-fetch fallback to a gov origin is ever added, the CSP change MUST be **surfaced explicitly** in review, never made silently (per the scoping §6.4 discipline).
- The proxy clones the `server/overpassProxy.js` template: forward-once, bounded LRU cache (parcels ~7 d TTL), non-fatal empty fallback (`{}` / `null` → client degrades to draw per §1.5).

**Why**: CORS, rate-limit citizenship toward shared public endpoints, secret containment, and a single cache tier. A keyless source (Catastro) and a keyed source (Matriklen) MUST look identical to the client — the only difference is which secret the proxy holds.

### §1.3 — A selected parcel commits down C19's identical one-shot immutable path

A fetched `ParcelFeature.ring` is "just a pre-supplied boundary ring". It MUST commit through the **same** path a hand-drawn boundary uses — never a parallel boundary channel:

```
ParcelFeature.ring (WGS84)
  → buildBoundaryFromLatLonRing (apps/editor/src/ui/site/boundaryProjection.ts)
  → dispatchParcelBoundary (siteDispatch.ts) / siteSetParcelBoundary (packages/stores/src/site-commands/)
  → site.parcel-boundary-set   (C19 §4.1, one-shot, C19 §1.4 immutable)
```

- The reverse-geocoded location (parcel centroid / click) sets the C12 LTP-ENU origin via `dispatchSiteLocation` **before** the ring projects (C19 §1.3) — so the ring lands in the correct frame.
- Because the commit is C19 §1.4 **immutable**, re-selecting a different parcel requires `site.replace` (C19 §4.1), exactly as redrawing does. C57 introduces no new mutation of the parcel polygon.
- The C19 `ProvenanceRecord.source` enum gains `'catastro' | 'matriklen' | 'oereb' | …` (a C19 schema extension, coordinated on ratify) so the site records which provider produced the boundary.

**Why**: reuse of the proven, immutable commit seam — no second source of truth for "where the plot is," no divergence from C19's legal-boundary semantics.

### §1.4 — Every fetched parcel carries provenance

A `ParcelFeature` MUST carry a provenance record sufficient to reproduce and attribute it: `source` (provider id), `sourceVersion` (dataset release / capabilities version where available), `sourceCrs` (the EPSG the geometry arrived in, before edge-reprojection), `license` (SPDX id or free-form), `ingestTimestamp`, and the jurisdiction `refcat` (the source's own parcel identifier).

- This populates C19 §2.6 `ProvenanceRecord` on the committed Site and is the datum [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md) consumes and [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) renders.
- Provenance is not optional: an adapter that cannot state its `source` + `license` MUST NOT ship (the `check-parcel-provenance` gate, §6).

**Why**: a compliance product is only trustworthy if every fetched fact is attributable to a named authority. Provenance is the substrate of the "explain-why" credibility C58/SPEC build on.

### §1.5 — Coverage-miss degrades honestly to manual draw; providers never throw

Cadastral coverage is partial and per-jurisdiction. A provider MUST resolve to `null` (never throw) on: no parcel at the point, an unavailable/timed-out source, a non-OK proxy response, malformed geometry, or a ring with < 3 valid vertices.

- A `null` result surfaces the honest **"no parcel here — draw the boundary instead"** fallback (C19 draw path remains the universal fallback). The system never fabricates a parcel and never blocks the design loop on a coverage gap.
- The map UI defaults to **Select parcel** mode only where the active jurisdiction has a `ParcelProvider`; otherwise it defaults to **Draw** (per SPEC-PARCEL-SELECTION §8).

**Why**: honesty mandate — a missing parcel is a data-coverage fact, surfaced plainly, not an error and not a silent empty state. The live `CatastroParcelProvider` already implements exactly this (`fetchParcelAtPoint` returns `null` on every failure, never throws).

> **AMENDED 2026-07-26 (STRUCTURAL-SEAM-4, §CONTEXT-DATA-HONESTY / L-422/457/467/469).** The "one
> `null` for BOTH a genuine absence AND an unavailable/timed-out source" rule above **encoded the very
> failure≠empty conflation the honesty mandate exists to forbid** — a transient PDOK/geodienste/MUC
> timeout was surfaced identically to "no parcel here", and downstream (C58) that empty becomes the
> transient `source-data-unavailable` refusal whose card promises a retry that never helps
> (`GISAreaLayout.ts:2372`, shown for permanent absences). "Never throw" is kept; "collapse to one
> `null`" is retired. Normative:
>
> 1. **A provider MUST return a discriminated `FetchOutcome<T>`, never a bare `T | null`:**
>    `{status:'found',value} | {status:'absent',reason} | {status:'transient',reason} | {status:'aborted'}`.
>    `absent` = the source answered and there is no parcel/plan here (a durable coverage fact);
>    `transient` = network / non-OK / timeout / abort (retryable); `aborted` = superseded by a newer
>    selection (not-a-failure, never cached). This generalises the PROVEN context-building union
>    (`'ok'|'aborted'|'unavailable'|'disabled'`, `contextBuildings.ts:897-924`, C12 §8) that already
>    keeps the two apart end-to-end. It STILL never throws.
> 2. **A `transient` MUST be auto-retried with bounded backoff at the provider/proxy seam** (the
>    `overpassProxy.js` pattern) before it reaches the user; only a still-failing transient surfaces —
>    as a *"temporarily unavailable, retrying"* state, **never** as "no parcel here — draw instead".
> 3. **A same-origin proxy MUST NOT return `200 {…: null}` for an upstream failure** (the
>    `chGrundnutzung`/`plandata`/`muc`/Catastro-parcel collapse): a failure carries a distinct status
>    (`502` / an explicit `_upstreamFailed` flag) so the client can classify. `null`-on-the-wire for a
>    failure is the same conflation one layer down.
> 4. **A CI gate asserts every provider/proxy returns the discriminated outcome** — so a new adapter
>    cloned from the Catastro template (§3.3) cannot silently re-introduce the flat `null`.
>
> C58 §1.13 carries the sibling amendment (a genuine-absence refusal code distinct from
> `source-data-unavailable`, and the ban on the dispatcher flattening the resolver's distinction).
>
> **IMPLEMENTED 2026-07-27 (STRUCTURAL-SEAM-4).** The shared union ships as
> `FetchOutcome<T> = {status:'found',value} | {status:'absent',reason} | {status:'transient',reason} | {status:'aborted'}`
> in `packages/schemas/src/site/zoning/FetchOutcome.ts` (L0, pure), with the classifiers
> `isTransientFetchReason` / `resolutionToFetchOutcome` and the shared transient-reason table
> `TRANSIENT_FETCH_REASONS`. The bounded auto-retry is `retryWhileUnreachable` (default 3 attempts,
> 300 ms → 600 ms backoff, injectable clock) in `packages/site-parcel-data/src/net/`. On the wire:
> the Madrid (`/api/madrid/condiciones`) and NL (`/api/nl/bestemmingsplan`) proxies already returned
> `502`-on-failure; the **plandata (DK) proxy was fixed here** to return `502` (not `200 {zoning:null}`)
> when an upstream fetch fails, via a `net.failed` accumulator threaded through `fetchTextOnce`/
> `fetchZoningAtPoint`, and `DkZoningProvider` now returns a `{kind:'unreachable'}` result rather than
> collapsing a non-OK response into `no-plan`. **Scope note:** the CI gate shipped
> (`packages/site-parcel-data/__tests__/fetchOutcomeHonesty.test.ts`) asserts the load-bearing
> invariant — a resolver never maps a *transient* reason to the *absent* code (driving the real Madrid
> + NL + DK resolvers with a failing vs a 200-empty fetch) — rather than a blanket every-proxy source
> scan; the remaining Catastro-template proxies (`chGrundnutzung`/`muc`/`parcelZoning`) adopt the same
> `502`-on-failure shape incrementally as they are next touched.

### §1.6 — EPSG handling reuses the single C12 projector

Adapters reproject source geometry to WGS84 using the **existing** `proj4` engine wired into `packages/geospatial/` (C12), or the server proxy's GDAL/`ogr2ogr` offline-normalise path for heavy batch conversion. No adapter may introduce a second projection library or a parallel CRS registry.

- Per-source CRS (DK EPSG:25832, ES EPSG:25830/25831, CH EPSG:2056) is a property of the **adapter**, resolved at the edge; the `sourceCrs` is recorded in provenance (§1.4) but never leaks past the adapter boundary.
- `proj4` (`^2.15.0`) is already an in-tree dependency (`packages/geospatial/package.json`) — reuse, not a new dep.

**Why**: C12 owns coordinate transforms (C19 §1.3 boundary). Two projectors = two sources of truth for "where on Earth"; the single-projector rule (SPEC-FORMA §8.3) is preserved.

### §1.7 — Providers are pure fetch+parse; L2 placement

A `ParcelProvider` implementation is a pure fetch+parse module: **no THREE, no Cesium, no DOM, no store writes.** It takes a point (or a parcel ref), returns a `ParcelFeature | null`.

- Target package: `packages/site-parcel-data/` (**L2**, proposed) — the provider interface + adapters + (with C58) the rules engine. The shipped Spain adapter currently lives at `apps/editor/src/ui/site/parcel/` (L5) as an explicitly-flagged transitional placement; it is **liftable verbatim** to L2 once a second adapter lands (its header already records this).
- The adapter mirrors `geocodeAddress.ts`: env-overridable endpoint, same-origin, keyless-from-the-client.

**Why**: purity + correct layer placement is what lets the same provider run under the editor, a headless test, or a future server-side pre-bake without a UI or renderer in scope.

### §1.8 — Every exported provider / proxy fn opens an OTel span `pryzm.parcel.<verb>`

Per **P8**, each exported provider method and each proxy handler opens a span in the `pryzm.parcel.*` family (e.g. `pryzm.parcel.fetchParcelAtPoint`, `pryzm.parcel.reverseGeocode`). Recommended attributes: `pryzm.parcel.provider`, `pryzm.parcel.lat/lon`, `pryzm.parcel.hit` (bool), `pryzm.parcel.refcat`, `pryzm.parcel.areaM2`, `pryzm.parcel.sourceCrs`. The live `catastroParcelProvider` already conforms.

**Why**: parcel fetches hit shared public endpoints and gate a legal boundary; uniform spans make coverage-rate, latency, and error-rate observable and feed the C23 audit trail.

### §1.9 — Attribution is mandatory and surfaced

Every provider carries a human-facing `label` (attribution string) that MUST be shown wherever its data is displayed (info card, provenance chip). A provider whose license requires specific attribution text MUST carry that exact text.

**Why**: open cadastral data (Catastro / Matriklen / geodienste) is reusable **with attribution**; honouring it is both a licence obligation and a credibility signal (C23).

### §1.10 — The Parcel Data Layer owns geometry+attributes only, not zoning or the site model

C57 ends at the fetched `ParcelFeature`. It MUST NOT compute setbacks, height limits, FAR, or a buildable envelope (that is [C58](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md)), and it MUST NOT own the `SiteModel` (that is [C19](./C19-SITE-MODEL-AND-PARCEL.md)).

**Why**: scope discipline. C57 = "fetch the real plot". C58 = "what may be built on it". C19 = "the site element that persists". Three clean boundaries.

### §1.11 — Cadastral geometry is a PUBLISHED artefact with a known quantum; block assembly must be tolerant of it, and must never move a vertex

**Added 2026-07-21 (L-539). Grounded in `docs/04-reference/jurisdictions/es/SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` — 125 live Catastro bbox fetches · 33,865 parcels · 956 COMPLETE manzanas · 250,646 parcel edges · 5 cities, run through the PRODUCTION parsers, projection and dissolve.** This invariant replaces an assumption that was written into `packages/site-parcel-data/src/geometry/blockRing.ts`'s own header ("slivers") and was measured to be false.

An adapter's output ring, and any BLOCK assembled from adapter output, MUST be treated as a **published** artefact carrying its publisher's coordinate quantum — never as survey-exact geometry, and never as noise to be smoothed.

1. **The quantum is a fact, not a tolerance to tune.** Catastro INSPIRE GML publishes WGS84 coordinates rounded to **1e-6°**, which at Iberian latitudes is **0.083 m east / 0.111 m north**. Measured directly: **not one of 250,646 real parcel edges is shorter than 0.0835 m** — exactly one longitude grid step — and **0 of 177 break-vertex nearest-neighbour gaps fall below 0.05 m**. There is no continuum below the grid, therefore **there are no slivers and no near-coincident vertices to weld**; a weld at ε ≤ 0.05 m was measured to move **0.0000 m** and change **0** outcomes, and is deliberately NOT implemented.
2. **The dominant real defect is a vertex-COUNT disagreement, not a positional one.** Two neighbours record one shared boundary with different vertex counts (A stores `p → q`, B stores `p → r → q`), so edge cancellation leaves the block outline **plus** a hair-thin degenerate triangle and the chain finds two loops. Measured over 349 failing manzanas: **66.8 %** present as multiple closed loops, **94.4 %** of those nested and enclosing **~0 %** of the outer area (p95 < 0.05 %), and **86.2 %** carry a T-junction within 0.25 m.
3. **The sanctioned repair splits an edge at the neighbour's OWN published vertex.** No vertex may be constructed, moved or welded. The tolerance is **0.10 m** (`TJUNCTION_SPLIT_TOLERANCE_M`, `blockRing.ts:134`) and is bounded from three independent directions — the publisher's own 0.111 m quantum (so the repair cannot introduce an error the input does not already contain), the empirical valley in the offset histogram (defect mass ends ~0.075 m; real unrelated geometry resumes above 0.3 m), and the success plateau (0.05 → 81.5 %, **0.10 → 91.6 %**, 0.20 → 93.4 %, 0.30 → 93.1 % *falling*). **A tolerance is defensible on a plateau; on a slope it is a tuned number.**
4. **The EXACT pass runs first and its result is returned unchanged whenever it succeeds.** Applying the repair unconditionally was measured to alter **137 of the 607 rings that already existed** — 137 silently moved *profunditats edificables* — and is therefore refused by construction. Measured outcome of the shipped design: **0 pre-existing rings changed, 0 lost.**
5. **A mis-repair MUST degrade to a refusal, never to a plausible-but-wrong ring.** `non-manifold` and `malformed-parcel` inputs are never repaired (they are wrong inputs, not digitisation artefacts). Every result carries `quality { path, splitCount, maxOffset_m, tolerance_m }` so a downstream consumer can tier the ring's provenance (C23) rather than inferring it.

**Success rate over the same 956 real manzanas: 63.5 % → 91.4 %** (Barcelona Eixample 81.5 % → 96.3 %; Madrid centro 77.2 % → 99.0 %; Córdoba 44.2 % → 90.8 %; Sevilla, the worst, 38.5 % → 82.3 %). Independent check the dissolve never sees — ring area vs the **sum of published cadastral parcel areas** — repaired rings agree at p50 **0.13 %**, slightly *better* than the exact rings' 0.15 %.

**Why**: a block ring feeds a compliance number (C58 §1.1/§1.3). Smoothing cadastral geometry to make blocks close would silently move that number on parcels that already worked. Splitting at a vertex the publisher itself recorded moves nothing, so the exactness guarantee survives the repair.

### §1.12 — The *manzana* prefix is an OBSERVED heuristic with a measured failure rate, and MUST be labelled as one

The 5-character *referencia catastral* prefix used to collect a block's parcels (`server/jurisdiction/parcelZoningProxy.js`, which already documents it as "an observed pattern, not a documented guarantee") is a heuristic, not a published relation. Measured limits, all from live data:

- **8 of 9** sampled parcels across 3 cities yielded ≥ 3 parcels for the prefix (`SPAIN-CADASTRAL-DISSOLVE-PROBE.md`); the single failure was honest — a car park whose masa genuinely contains one parcel, refused by the `< 3` guard.
- **~7 of the 82 manzanas still refused after §1.11** are the prefix collecting **two genuinely separate polygons** — a *prefix* defect, not a geometry one (`SPAIN-DISSOLVE-FAILURE-TAXONOMY.md`).
- **A Catastro masa is NOT guaranteed to equal the urbanistic *illa*.** The converse was asserted as confirmed in three documents during L-525/L-526 and then **refuted by probe**: masa 02309's bbox is 113.4 × 113.8 m with **zero** cross-masa adjacency in a 444 m search, and its ring is solid at 6,696 m² / 336 m perimeter — a genuine ~82 × 82 m block rotated ~45°, not "half an illa". See `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md` and ADR-0271 §"Corrections".

An adapter or block assembler MUST NOT present a prefix-collected masa as a legally-defined block. Where the collection is ambiguous the correct output is a **refusal** (C58's `not-applicable` / `degenerate`), never a partial block silently fed to a solver.

**Why**: a partial or over-collected block produces an almost-right *profunditat edificable* — the confidently-wrong number ADR-0270/0271 and L-462/L-465 exist to prevent.

### §1.13 — One registry, N identical adapters: parcel-select is PROVIDER-INVARIANT, and Spain/Catastro is the reference every jurisdiction clones

**Added 2026-07-24 (L-613). Promotes §10.1 from open-question to binding: the shipped Spain/Catastro parcel-select is proven correct in production, so it is the reference implementation — every other country is a byte-for-byte clone of that flow behind one shared interface, never a bespoke path.**

1. **The select UX is provider-invariant.** From the map UI's perspective, selecting a plot MUST behave **identically in every jurisdiction** — same click → real cadastral parcel snaps in → the C19 commit + C58 envelope resolve (§1.3). The *only* thing that varies per country is which adapter (and which upstream endpoint) the registry dispatched to. A jurisdiction whose select behaves differently from the Spain reference is a defect, not a variant.
2. **One dispatch registry, routed by the SAME predicates as zoning.** A single `resolveParcelProvider(lat, lon)` registry (`packages/site-parcel-data/`, keyed by `jurisdictionId`) routes a click-point to the right adapter using the **same** point-in-jurisdiction predicates the C58 zoning dispatch already routes on (`isInDenmark`, `isInBarcelona`, `isInRiyadh`, …) — not a parallel copy. Parcel routing and zoning routing MUST agree on WHERE a point is (a divergence is a drift bug, cf. L-612). The registry is a pure dispatch layer over N adapters that all satisfy the identical §2.3 `ParcelProvider` interface; adding a jurisdiction is a registry entry, **never** a UI edit, a core edit, or a new interaction.
3. **Catastro is the literal template.** Every new adapter is written by cloning `CatastroParcelProvider`'s shape — same interface signature, same never-throws contract (§1.5), same WGS84-normalise-at-edge (§1.1), same OTel span family (§1.8), same provenance (§1.4), same same-origin-proxy pattern (§1.2). Copy the reference; do not re-architect it.
4. **Universal footprint fallback where no cadastre is reachable — labelled honestly.** Where a jurisdiction's cadastre is geo-fenced (Saudi Balady/U-Maps — WAF-blocks non-SA IPs, L-606) or licence-gated (parts of German ALKIS), the registry falls back to selecting the **building/parcel FOOTPRINT** from the context layer (OSM/Overture) at the click-point, so "click to select" works **everywhere** — but the result MUST be labelled `footprint` in its provenance, **never** presented as a `cadastral parcel` (§1.4/§1.5). Selection is universal; *legal-parcel* provenance is only claimed where a real cadastre resolved it.

**Why**: the founder-confirmed fact that the Spain path works "100% perfectly" is the strongest available guarantee — matching its exact interface means every country inherits that reliability instead of risking a one-off. This invariant is what turns "13 countries" from 13 bespoke integrations into 13 instances of one proven process (the §1.1 adapter-swap property, made binding for the *whole* select flow, not just the geometry normalise).

### §1.14 — An AREA query is a DECLARED CAPABILITY, never an optional method

**Added 2026-09-09 (lane CADASTRAL-COVERAGE, §L-13300). §1.13 made the POINT lookup
provider-invariant. The overlay in §5.5 needs a second question — *"every parcel around here"* —
and most of the ~51 registered cadastres cannot answer it: an ArcGIS `identify` leg (CH, the AU/US
rows) is a point service by construction. That asymmetry is real and permanent. The rule below is
about how a provider is required to SAY so.**

1. **`fetchParcelsInArea(centre, radiusM)` is REQUIRED on `ParcelProvider`, not optional.** An
   optional method re-creates exactly the split §`UPSTREAM-UNREACHABLE-IS-NOT-A-MISS` was hoisted
   onto the interface to remove: *some providers are honest, some are silent*. A provider that
   cannot answer must be forced by the type system to say which of the three things is true.
2. **Three outcomes, and they are DIFFERENT — not ranked (the §1.5 rule, applied to the area
   question).**
   - `ok` — the source answered with the parcels it holds in that area. May be empty: an
     answered-and-empty area is a FACT about the land.
   - `unsupported` — **this cadastre publishes no area query at all.** A durable, structural
     statement about the SOURCE. It is not an outage and it will not improve on retry.
   - `unreachable` — it does publish one, and it did not answer. Transient.
   ⛔ Rendering `unsupported` as an empty map is the §CONTEXT-DATA-HONESTY prohibition (L-581 /
   L-616) shipped again at overlay scale: "this country has no boundary service" and "there are no
   parcels here" would draw the same nothing.
3. **`truncated` is a fourth fact, and it rides on `ok`.** Every area service caps its response
   (`COUNT=`, `count=`, a bbox ceiling). "That is all of them" and "that is all we asked for" are
   different claims about the same drawing, and the overlay must be able to say which it is
   showing. A provider that cannot tell reports `truncated: true` — the conservative arm.
4. **The area query REUSES the point query's upstream machinery.** ⛔ A second URL builder or a
   second parser for the same cadastre is the dominant defect in this repo (one rule, two
   implementations): the point leg and the area leg differ in `count` and in whether the containing
   candidate is selected, and in **nothing else**. Spain extends the already-exported
   `buildParcelBboxUrl` + `parseParcelCollectionGml` (`parcelZoningProxy.js`); FR/NL extend the
   existing `EU_CADASTRE_SOURCES` leg by DECLARING an `areaUrl` beside its `url`; DK extends the
   keyless DAWA leg. A leg with no `areaUrl` is `unsupported` — the capability is declared by the
   data table, so adding a country stays a data addition (§1.13.2).
5. **Radius is bounded by the SITE SCOPE and by a measured ceiling, never by the camera.** There is
   no visible-rectangle API in either viewport, and there must not be one added for this: the scope
   is the unit every other context layer is budgeted in (`contextExtentBudget.ts`). The effective
   radius is `min(scopeRadius, CEILING)`, and the ceiling is set from a MEASURED payload curve, not
   from taste — see §5.5.4.

**Why**: the coverage audit that preceded this amendment measured all four target cadastres
answering a bbox/circle query cleanly (ES 120 parcels / 277 KB, FR 96, NL 435 / 804 KB, DK 34 at
150 m). The capability exists; what did not exist was any way for a provider to state that it
LACKS it, which is the only reason an overlay can lie.

---

## §2 — Schema

The schemas below live in `packages/schemas/src/site/` — **pure Zod**, no THREE / DOM / I/O (per **P5**).

### §2.1 — `ParcelFeature`

The canonical fetched parcel. (The shipped interface in `apps/editor/src/ui/site/parcel/ParcelProvider.ts` is the seed; the L0 Zod form adds provenance fields.)

| Field | Type | Default | Notes |
|---|---|---|---|
| `ring` | `LatLon[]` (WGS84, outer ring; may be open) | — | §1.1; consumed by `buildBoundaryFromLatLonRing` |
| `refcat` | `string` | — | source's own parcel id (ES *referencia catastral*; DK `jordstykke` id; CH EGRID) |
| `areaM2` | `number` | `0` | backward-compat: official area where the source supplies it, else shoelace-derived. Consumers that need the honesty distinction MUST use `confidence.areaSource` + `confidence.areaOfficialM2` / `confidence.areaSigM2` (§2.4, added §L-640). |
| `address` | `string \| null` | `null` | locator string — **PII** per [C22](./C22-PRIVACY-AND-PII-TIER.md) |
| `jurisdictionId` | `string` | — | e.g. `'es-barcelona'`, `'dk'`, `'ch-zh'` — the key C58 resolves a rule pack by |
| `provenance` | `ParcelProvenance` (§2.2) | — | §1.4 |
| `metrics` | `ParcelGeometryMetrics` (§2.4) \| `undefined` | `undefined` | §L-640 Phase 1 — pure geometry diagnostics; present on all shipped adapters |
| `confidence` | `ParcelConfidence` (§2.4) \| `undefined` | `undefined` | §L-640 Phase 1 — honesty-gated cadastral confidence; present on all shipped adapters |

### §2.4 — `ParcelGeometryMetrics` and `ParcelConfidence` (added §L-640 Phase 1)

**AMENDED 2026-07-29 (§L-640 Phase 1).** Fixes C57 §13 KV-3 (official vs derived area was silently collapsed). Implemented in `apps/editor/src/ui/site/parcel/parcelConfidence.ts` (a pure module, no THREE/DOM/network), wired into all three shipped adapters: `CatastroParcelProvider`, `WfsParcelProvider`, `footprintPick`.

#### `ParcelGeometryMetrics` — pure geometry diagnostics from the ring

Derived solely from the WGS84 ring using local-equirectangular projection about ring[0]. No source data; safe to compute on any provider output.

| Field | Type | Notes |
|---|---|---|
| `areaSigM2` | `number` | Shoelace area (m²) |
| `perimeterM` | `number` | Ring perimeter (m) |
| `centroid` | `LatLon` | Area-weighted polygon centroid (fallback: vertex mean for degenerate ring) |
| `bbox` | `{ west, south, east, north }` | WGS84 bounding box |
| `vertexCount` | `number` | Number of vertices in the ring |
| `compactness` | `number ∈ (0,1]` | Polsby–Popper: 4πA/P²; 1 = a circle |

#### `ParcelConfidence` — honesty-gated cadastral confidence

Tiers built **ONLY** from categorical facts (kind, areaSource, geometryComplete, click-inside). No calibrated numeric cutoff enters `match` — that would violate C58 §16 explainability. Raw numeric fields are shipped for transparency + future calibration but are **explicitly withheld from the tier** (a stated Phase-1 limitation; no measured distribution across N parcels exists yet).

| Field | Type | Notes |
|---|---|---|
| `match` | `'high' \| 'medium' \| 'low'` | Fact-based tier (see rule below). `'high'` never occurs on a footprint-fallback or derived-area parcel |
| `areaSource` | `'registry-declared' \| 'derived-from-ring'` | Whether `areaOfficialM2` came from the source's registry (INSPIRE `areaValue`) or was computed by shoelace. The C57 §2.1 honesty distinction (fixes KV-3) |
| `areaOfficialM2` | `number \| null` | Registry-declared area, or null if unpublished |
| `areaSigM2` | `number` | Shoelace-derived area — always present |
| `areaDeltaPct` | `number \| null` | `|official − sig| / official × 100`, or null when no official area. **Shipped RAW; NOT tiered** (no calibrated agree-cutoff exists yet — stated Phase-1 limitation) |
| `pointToParcelM` | `number \| null` | OVC `_Distancia` click→parcel distance (Spain only), or null for WFS/footprint providers. **Shipped RAW; distance sub-tiers withheld** (no measured distribution) |
| `candidateMarginM` | `number \| null` | Nearest vs 2nd-nearest candidate gap (m), or null. **Shipped RAW; only single-vs-multiple count used as a fact** |
| `geometryComplete` | `boolean` | Ring has ≥3 vertices and a non-degenerate area — a boolean fact, not a tier |

**Match tier rule (categorical facts only, no numeric cutoff):**

- `'low'` ← footprint-fallback **OR** geometryComplete = false (not a legal parcel / broken geom)
- `'high'` ← cadastral AND geometryComplete AND areaSource = registry-declared AND click-inside (or click unavailable — null is not a penalty)
- `'medium'` ← everything else (real cadastral polygon missing one corroborator)

`pointToParcelM ≤ 1 m` is treated as "click-inside" — this 1 m constant is justified as coordinate/projection float-noise only, **not** as a calibrated distance tier.

**Phase-1 limitation (explicit, stated):** `areaDeltaPct`, `pointToParcelM`, and `candidateMarginM` are shipped as raw numbers. No threshold exists yet for tiering them — to add one requires a measured distribution across N real parcels and founder sign-off. Until then, code MUST NOT use these fields to compute a `match` sub-tier.

### §2.2 — `ParcelProvenance`

Forward-compatible with C19 §2.6 `ProvenanceRecord` (the committed Site copies these into its record).

| Field | Type | Notes |
|---|---|---|
| `source` | `string` (provider id) | `'catastro' \| 'matriklen' \| 'oereb' \| 'terrara' \| …` — extends the C19 `ProvenanceRecord.source` enum |
| `sourceVersion` | `string \| null` | dataset release / WFS capabilities version where available |
| `sourceCrs` | `string` | EPSG the geometry arrived in, pre-reprojection (`'EPSG:25832'`, …) |
| `license` | `string \| null` | SPDX id or free-form; drives §1.9 attribution |
| `ingestTimestamp` | `ISODateString` | UTC |

### §2.3 — `ParcelProvider` interface

The provider contract (L2). Every jurisdiction implements this once.

```ts
// packages/site-parcel-data/src/ParcelProvider.ts   (proposed L2 home)
export interface ParcelProvider {
  readonly id: string;              // provenance tag, e.g. 'catastro'
  readonly label: string;           // §1.9 attribution string
  /** Resolve the real cadastral parcel at a WGS84 point, or null on any miss.
   *  MUST never throw (§1.5). MUST open a pryzm.parcel.* span (§1.8). */
  fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null>;
  /** Optional: reverse-geocode a point → parcel ref + address, where the source
   *  requires a two-step (ref-then-geometry) flow (e.g. Catastro OVC → GetParcel). */
  reverseGeocode?(lon: number, lat: number): Promise<{ refcat: string; address?: string | null } | null>;
}
```

The active provider for the current pilot is a single `defaultParcelProvider` export (per `apps/editor/src/ui/site/parcel/index.ts` today) — swapping the pilot jurisdiction is a one-line change (per §1.7 the target is a registry keyed by `jurisdictionId`; see §10.1).

---

## §3 — Adapters, proxy & package boundaries

### §3.1 — The adapter contract (one per jurisdiction/source)

| Adapter | Jurisdiction | Access | CRS | Status |
|---|---|---|---|---|
| `CatastroParcelProvider` | Spain (Dirección General del Catastro) | **keyless** — OVC `Consulta_RCCOOR` reverse-geocode → INSPIRE WFS `cp:CadastralParcel` `GetParcel` by REFCAT (WFS has **no BBOX** — point→ref→geometry) | EPSG:4326/25830-31 | **BUILT** (`apps/editor/src/ui/site/parcel/CatastroParcelProvider.ts` + `server/jurisdiction/parcelZoningProxy.js`) |
| `DkParcelProvider` | Denmark (Matriklen2 `jordstykke`) | **keyed** — Datafordeler service-user API-key, **server-side only** (§1.2) | EPSG:25832 | proposed (§3.2) |
| `OerebParcelProvider` | Switzerland (geodienste `ms:RESF` + api3.geo.admin identify → EGRID) | mostly OGD; a few cantons meter | EPSG:2056 | proposed |
| `TerraraParcelProvider` | Switzerland (premium) | commercial (buy-vs-build — ADR-0269, UNVERIFIED API) | — | proposed / gated |

Adding a jurisdiction is a new adapter + (if needed) a proxy route + a curated attribution string — **never** a core edit (§1.1).

### §3.2 — The Denmark keyed-source pattern (secrets)

Denmark's Matriklen requires a Datafordeler service-user API-key (free self-service registration: web-user → IT-system → service-user key). Per §1.2 the key lives **only** server-side; the proxy holds one service-user key and the browser never sees it. For the reference build, the offline pre-bake (per the Denmark reference architecture) may use the same key once, minimising runtime key traffic. This is the template for every future keyed source.

### §3.3 — Package boundaries (8-layer model)

| Package | Layer | Responsibility |
|---|---|---|
| `packages/schemas/src/site/` | **L0** | `ParcelFeature` / `ParcelProvenance` Zod schemas (§2). No I/O, no THREE, no DOM. |
| `packages/site-parcel-data/` | **L2** | `ParcelProvider` interface + adapters + jurisdiction registry (shared with C58). Pure fetch+parse. |
| `server/jurisdiction/parcelZoningProxy.js` | server (BFF) | forward-once + GML→GeoJSON normalise + LRU cache + non-fatal empty fallback + **server-side keys**. |
| `packages/geospatial/` | **L2** | C12 — the single `proj4` projector reused for edge reprojection (§1.6). |
| `apps/editor/src/ui/geospatial/` + `.../site/parcel/` | **L5** | the "Select parcel" map mode + info card; the transitional home of the shipped Spain adapter (§1.7). |

Dependency direction: `apps/editor` ← `site-parcel-data` ← `schemas`; `site-parcel-data` → `geospatial` (peer L2). No reverse imports.

### §3.4 — The add-a-jurisdiction recipe (the standardized, reusable process)

Adding parcel-select for a new country is this fixed, modular sequence — **nothing outside these steps changes** (per §1.13 the UI, the interface, and the commit seam are untouched). This is the standard binding on every jurisdiction PR:

1. **Routing predicate** — reuse (or add) the point-in-jurisdiction predicate the C58 zoning dispatch already uses (`providers/<cc>Bbox.ts` → `isIn<CC>`). Parcel + zoning MUST share ONE predicate per jurisdiction (§1.13.2); do not fork it.
2. **Adapter** — implement the §2.3 `ParcelProvider` by cloning `CatastroParcelProvider`: point → real cadastral polygon, normalise to a WGS84 ring at the edge (§1.1), `null`-never-throw on any miss (§1.5), open `pryzm.parcel.*` spans (§1.8), emit full provenance incl. `sourceCrs` + `license` (§1.4). Pure fetch+parse, no THREE/DOM/store (§1.7).
3. **Proxy route** — add `/api/parcel/<cc>` in `server/jurisdiction/parcelZoningProxy.js` cloning the forward-once + LRU + non-fatal-empty template (§1.2). If the source is **keyed** (e.g. DK Datafordeler), the key lives server-side only (§3.2) — the browser MUST NOT see it, and a keyed source MUST look identical to a keyless one from the client (§1.2).
4. **Register** — add the adapter to the `resolveParcelProvider` registry keyed by `jurisdictionId`, routed by the step-1 predicate. This is the ONLY wiring edit; there is no UI change (§1.13.2).
5. **Attribution** — supply the provider `label` + `license` attribution string, surfaced on the info card (§1.9 / §5.2).
6. **Tests** — a fixture test from a captured real feature (never live network) + the `check-parcel-never-throws` and `check-parcel-wgs84` gates (§6). Prove the select behaves identically to the Spain reference (§1.13.1) in the E2E (§6.1) generalised to the new jurisdiction.
7. **Fallback (only if unreachable)** — if the cadastre is geo-fenced/licence-gated and step 2 cannot resolve keylessly-or-via-proxy, the jurisdiction routes to the universal footprint fallback labelled `footprint` (§1.13.4), and that limitation is recorded (an Issue-Log row + the jurisdiction's `PARCEL-SELECT-COVERAGE` entry) — never a fabricated legal parcel.

**Effort per country** is then bounded to steps 1–6 (a few hundred lines + a proxy route + a test), because steps that would otherwise be per-country — the interface, the commit seam, the UI mode, the projector, the honesty fallback — are all shared core the recipe reuses. This is the modular-reuse property C57 exists to guarantee.

---

## §4 — Flow (no new command surface)

C57 adds **no** new command. A selected parcel reuses the C19 command surface verbatim:

1. `dispatchSiteLocation` → sets C12 LTP-ENU origin (C19 §1.3).
2. `site.parcel-boundary-set` (C19 §4.1) — one-shot, immutable (C19 §1.4) — with the fetched ring.
3. (then C58) `site.updateZoning` (C19 §4.1) — the envelope's mutable fields.

The only new server surface is the proxy route(s): `/api/catastro/parcel` (shipped) and, per jurisdiction, `/api/parcel/reverse`, `/api/parcel/:ref` (proposed, per scoping §6.4). Each proxy handler opens a `pryzm.parcel.*` span (§1.8).

---

## §5 — UI

The parcel-select interaction is specified in [SPEC-PARCEL-SELECTION](../../03-execution/specs/SPEC-PARCEL-SELECTION.md) (proposed). C57 binds only:

- **§5.1 — Brand colour.** Parcel hover/select highlight uses the canonical PRYZM purple `#6600FF` per [C18](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) / C19 §5.5.
- **§5.2 — Attribution surfaced.** The provider `label` (§1.9) and the parcel `provenance` (source / license / ingest time) MUST be shown on the info card.
- **§5.3 — Honest fallback.** A `null` fetch (§1.5) surfaces the "no parcel here — draw instead" affordance; it MUST NOT read as an error.
- **§5.4 — Select-vs-draw default.** Select-parcel is the default mode only where the active jurisdiction has a `ParcelProvider`; Draw otherwise.
- **§5.5 — The cadastral-boundaries overlay: ONE owner, read by every view.** The user-facing
  toggle that draws the surrounding parcels' boundary lines is bound by these five rules.
  1. **One state, one owner.** The on/off flag and the per-country capability verdict live in ONE
     module (`apps/editor/src/ui/site/cadastralBoundariesLayer.ts`), which draws nothing and imports
     no THREE / Cesium / DOM. Every surface SUBSCRIBES. ⛔ A viewport-local boolean is forbidden
     here: the overlay is asked for in the 2D site map (MapLibre) *and* the Forma plan/3D views
     (Cesium), and those chromes are mounted in mutually exclusive modes — two booleans would be
     [[view-region-one-owner]] / C59 §2.10 recurring at a new site.
  2. **A surface DECLARES itself.** Modelled on `siteGeometryHighlight.ts`'s
     `registerSiteHighlightSurface` / `describeSiteHighlightReach`: the chip's affordance is derived
     from which views actually registered, never from a hard-coded sentence. An empty registry is
     `unreported`, never "nothing draws it" (C84 EI-1b).
  3. **The chip states the §1.14 verdict.** `unsupported` renders the chip disabled with the
     source's own reason; `unreachable` says the service did not answer and keeps the chip
     retryable; `ok` with zero parcels says the area is empty. ⛔ None of the three may render as
     the same blank map.
  4. **Bounded and de-duplicated.** The fetch is keyed on the SCOPE-derived bbox (never the camera,
     never a pan), in-flight requests for the same key share one promise, and the result is cached
     per key — the `contextBuildings.ts` shape, because [[context-one-read-per-bbox]] is a defect
     this repo has already shipped once.
  5. **Ground seating is ABSOLUTE.** In Cesium the boundary lines are seated at an absolute height
     with `clampToGround:false` and registered for terrain re-seat (§CTX-ABS-SEAT / L-635); clamped
     ground geometry renders NOTHING on the baked terrain, and a `GroundLayer` member that is not in
     the union floats away on the next re-seat.
  6. **The overlay is NOT site state.** It never commits, never enters the C19 one-shot path, and is
     not persisted with the project. It is a view affordance over published data.


---

## §6 — Tests / CI gates

| Gate | Path | Verifies | Ratchet |
|---|---|---|---|
| `check-parcel-no-direct-fetch` | `tools/ga-gate/check-parcel-no-direct-fetch.ts` | No adapter fetches a gov origin directly from client code; all go via the same-origin proxy (§1.2) | On lift to L2 |
| `check-parcel-no-client-secret` | `tools/ga-gate/check-parcel-no-client-secret.ts` | No API key / service-user token appears in client bundles or repo (§1.2) | Now |
| `check-parcel-provenance` | unit test in `packages/site-parcel-data/__tests__/provenance.test.ts` | Every `ParcelFeature` carries `source` + `license` + `sourceCrs` (§1.4) | On L2 |
| `check-parcel-never-throws` | unit test | `fetchParcelAtPoint` returns `null` (never throws) on network error / non-OK / bad JSON / < 3 vertices (§1.5) | Now (Spain adapter) |
| `check-parcel-wgs84` | unit test | Adapter output ring is WGS84 lat/lon in `[-90,90]`/`[-180,180]`; no source CRS leaks (§1.1/§1.6) | On L2 |
| `check-parcel-otel-spans` | `tools/ga-gate/check-parcel-spans.ts` | Every exported provider/proxy fn opens `pryzm.parcel.<verb>` (§1.8) | On L2 |

### §6.1 — E2E test

`tests/e2e/parcel-select.spec.ts` (proposed): open a project → Site tab → Select-parcel mode → click a Barcelona plot → assert one `site.parcel-boundary-set` fires with a ring whose area ≈ Catastro `areaM2` → assert the boundary is C19 §1.4 immutable → click an unmapped point → assert the honest "draw instead" fallback (no error).

---

## §7 — NFT targets

Per [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md).

- **§7.1 — Parcel fetch < 2 s (p95).** Point → provider → `ParcelFeature` (proxy cache-cold) MUST complete < 2 s on reference hardware; cache-hit < 200 ms. Span `pryzm.parcel.fetchParcelAtPoint`.
- **§7.2 — Proxy citizenship.** The proxy forwards each unique request **once**, serving repeats from the LRU cache (parcels ~7 d TTL) so PRYZM never re-hammers a shared public endpoint (per the `overpassProxy.js` template; scoping §6.4).
- **§7.3 — Ring vertex budget.** A fetched ring SHOULD respect the C19 §7.3 parcel-polygon budget (≤ 50 vertices soft; hard-reject > 200) — an adapter SHOULD simplify a pathological multi-thousand-vertex cadastral polygon before commit (deterministically — §10.3).

---

## §8 — Migration / build sequence

Per [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) §sequence (L-398 → L-404). C57's slice:

1. **L-400 (partial, shipped)** — `CatastroParcelProvider` + `server/jurisdiction/parcelZoningProxy.js` + Spain parcel-select. Already in prod (input side only).
2. **L-400** — lift the provider layer to `packages/site-parcel-data/` (L2); land the L0 `ParcelFeature` Zod schema + provenance; extend the C19 `ProvenanceRecord.source` enum. Introduce the `jurisdictionId` registry (§10.1).
3. **L-400** — `DkParcelProvider` (Matriklen, server-side Datafordeler key) as the Denmark-reference parcel adapter; `OerebParcelProvider` (CH EGRID) as the third.
4. **Ratify** — DRAFT → CANONICAL once the L2 package + §6 gates are green and a second adapter (DK) is live.

No behaviour change to the shipped Spain flow during the lift; the commit seam (C19) is unchanged throughout.

---

## §9 — What is NOT in this contract

| Concern | Owner |
|---|---|
| Zoning fetch, buildable-envelope solving, setbacks/height/FAR | [C58 Zoning Rules & Buildable Envelope](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) |
| Coordinate transforms (WGS84 ↔ scene, LTP-ENU, reprojection math) | [C12 Geospatial](./C12-GEOSPATIAL.md) — C57 reuses the single projector (§1.6) |
| The persisted `SiteModel` / `Parcel` schema + the immutable commit command | [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md) — C57 hands a ring to `site.parcel-boundary-set` |
| Address / land-title PII handling, residency, share-link gating | [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md) — C57 marks `address` PII |
| The map interaction (select-vs-draw, hover preview, info card) | [SPEC-PARCEL-SELECTION](../../03-execution/specs/SPEC-PARCEL-SELECTION.md) (proposed) |
| LOD2 context buildings + terrain ingestion (Cesium 3D-Tiles / quantized-mesh) | [C19 §1.8](./C19-SITE-MODEL-AND-PARCEL.md) (context snapshot) + the Denmark reference architecture (offline-bake); a future context-engine contract |
| The compliance "explain-why" report artefact | [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) |
| Commercial terms / pricing of premium sources (Terrara, keyed tiers) | [C39 Pricing & Plan Tiers](./C39-PRICING-AND-PLAN-TIERS.md) + ADR-0269 buy-vs-build |

---

## §10 — Open design questions (pending decision)

### §10.1 — RESOLVED (2026-07-24, L-613): jurisdiction → provider registry shape
**Decided.** The multi-jurisdiction registry is now the binding standard — see **§1.13** (provider-invariant select + one dispatch registry routed by the shared C58 predicates + Catastro as the reference clone + universal footprint fallback) and **§3.4** (the add-a-jurisdiction recipe). Shape: a static keyed registry (`resolveParcelProvider(lat, lon)`) in `packages/site-parcel-data/`, routed by the same `isIn<CC>` predicates the zoning dispatch uses, resolving to N adapters that all satisfy the §2.3 interface. Implementation in progress (L-613); the shipped Spain path is unchanged and is the reference every added country matches.

### §10.2 — pending: hover-preview fast path
Catastro's WFS has no BBOX; the hover preview would need the WMS `GetFeatureInfo` point path (a second upstream shape). Whether hover-preview is in the P0 UI or deferred (click-only select) is a UX decision. Pending SPEC-PARCEL-SELECTION.

### §10.3 — pending: deterministic parcel simplification
A pathological cadastral polygon (thousands of vertices) exceeds the C19 §7.3 budget. The simplification algorithm (Visvalingam-Whyatt / Douglas-Peucker) must be **deterministic** (same input → same ring) for reproducibility, but the choice is open. Mirrors C19 §10.3. Pending L1 implementation.

### §10.4 — pending: serve-in-house tier (PostGIS/Martin) scope
The Denmark reference proposes an optional PostGIS + Martin MVT tier (normalise a national dataset once, serve vector tiles) instead of per-request gov WFS hits. Whether this is in-scope for the reference or a later scale optimisation (the runtime proxy + cache suffices for the pilot) is open. Pending ADR-0269 / L-404.

---

## §11 — Cross-references

- [C00 Index](./README.md) — register the C57 row.
- [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) — `ParcelFeature` is an L0 pure schema.
- [C12 Geospatial](./C12-GEOSPATIAL.md) — the single projector reused at the edge (§1.6).
- [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md) — the commit seam (§1.3); the `ProvenanceRecord.source` enum extension; fills C19 §9/§10.2 jointly with C58.
- [C22 Privacy & PII Tier](./C22-PRIVACY-AND-PII-TIER.md) — `address` PII.
- [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md) — consumes `ParcelProvenance`.
- [C58 Zoning Rules & Buildable Envelope](./C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) — the sibling; consumes the fetched parcel.
- [C18 Element Preview Visual Contract](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — `#6600FF` highlight.
- [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) — the strategy decision.
- [SPEC-PARCEL-SELECTION](../../03-execution/specs/SPEC-PARCEL-SELECTION.md) (proposed) · [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md).

External (non-contract): ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md (audit removed 2026-08-09 — recoverable from git history) (G-DATA), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/geospatial/PARCEL-ZONING-FEATURE-SCOPING.md), [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md).

---

## §12 — Contract history

| Date | Change |
|---|---|
| 2026-07-17 | Initial DRAFT — fills the C57 reserved slot (compliance-authoring foundation, L-398/L-400/L-403). Grounds on the shipped Spain/Catastro parcel-select + the Denmark reference. Author: compliance-authoring governance track. |
| 2026-07-21 | Added **§1.11** (cadastral publication quantum + tolerant block assembly, L-539) and **§1.12** (the manzana-prefix heuristic's measured limits, L-535/L-539/L-525). Added **§13 Known violations**. All grounded in the live-data probes listed there; no invariant is claimed conformant on documentation alone. |
| 2026-07-24 | Added **§1.13** (provider-invariant parcel-select + one dispatch registry routed by the shared C58 predicates + Catastro as the reference clone + universal footprint fallback) and **§3.4** (the standardized add-a-jurisdiction recipe). Promoted **§10.1** from open-question to RESOLVED. Grounds on the founder-confirmed "Spain works 100%" reference + L-613 (parcel-select was Catastro-only, blocking every non-Spanish demo). Author: geospatial rollout track. |
| 2026-07-29 | **§L-640 Phase 1 — `ParcelFeature.metrics` + `ParcelFeature.confidence` schema addition (§2.4); KV-3 RESOLVED.** Added `ParcelGeometryMetrics` and `ParcelConfidence` to the `ParcelFeature` schema (§2.1 updated, §2.4 new). All three shipped adapters (`CatastroParcelProvider`, `WfsParcelProvider`, footprint-fallback via `footprintPick`) now attach `metrics` + `confidence`. The match tier is built ONLY from categorical facts; raw numeric fields (`pointToParcelM`, `candidateMarginM`, `areaDeltaPct`) are shipped untiered with an explicit Phase-1 limitation recorded in §2.4. Server-side fix: `server/jurisdiction/parcelZoningProxy.js` returns `areaOfficialM2` + `areaSigM2` separately, plus `pointToParcelM`/`candidateMarginM` (no longer discarded). Verified by `apps/editor/__tests__/parcelConfidence.test.ts` (15 tests, all passing). KV-3 (area-collapse honesty violation) marked RESOLVED in §13. |
| 2026-09-09 | **§1.14 (area query is a declared capability) + §5.5 (the cadastral-boundaries overlay), lane CADASTRAL-COVERAGE / §L-13300.** Grounded on a live coverage audit of ES/FR/NL/DK: every point route measured HTTP 200 with a real ring, and every one of the four upstreams answered a bbox/circle AREA query (ES 120 parcels/277 KB · FR 96 · NL 435/804 KB · DK 34 @150 m). The gap was never coverage; it was that `ParcelProvider` had no way to express the area question, and no way for a point-only cadastre (CH/AU/US ArcGIS `identify` legs) to SAY it lacks one — so an overlay would have drawn `unsupported` and `empty` as the same blank map. §1.14 makes the method required and four-armed (`ok`+`truncated` / `unsupported` / `unreachable`); §5.5 binds the overlay to one owner read by both chromes, because the 2D MapLibre map and the Forma Cesium panel are mounted in mutually exclusive modes. Author: lane CADASTRAL-COVERAGE. |

---

## §13 — Known violations / measured limits

> Recorded per the C31 logging protocol so this contract does not silently keep asserting behaviour the code lacks. Every row cites a probe document or a `file:line`.

### KV-1 (L-539) — a real block ring can exceed the C19 §7.3 / C57 §7.3 200-vertex HARD reject

§7.3 defers to the C19 §7.3 budget (≤ 50 vertices soft, **hard-reject > 200**). Measured after §1.11 shipped: **2 of 874** produced block rings exceed 200 vertices (**max 326**); the exact path alone already reached 192 (`SPAIN-DISSOLVE-FAILURE-TAXONOMY.md` §"What this document does not show"). Those rings refuse downstream — honestly, but they refuse, and the refusal is a *budget* artefact, not a data one. **No deterministic simplification exists yet** (§10.3 is still pending), so there is nowhere honest to put a ring that is correct and over budget.

**Status: OPEN.** Decision needed: raise the block-ring budget as a distinct number from the *parcel* budget (a block is a union of ~20 parcels and 200 was never sized for it), or land §10.3's deterministic simplification first. Do NOT silently simplify a ring that feeds a compliance number.

### KV-2 (L-539) — `parseParcelGml` discards `<gml:interior>` rings

`server/jurisdiction/parcelZoningProxy.js`'s parser keeps only the first `<posList>`, so a parcel with a hole loses it. Measured: **30 of 33,865** features (0.1 %) carry an interior ring, and **0 of the 220** nested-loop failure manzanas contains one — so this is *not* the L-539 defect and was correctly excluded from it. Real, tiny, latent, and now written down rather than left as a silent parser behaviour. **Status: OPEN, unprioritised.**

### KV-3 (L-640) — §2.1 `areaM2` silently reports a DERIVED area as if published

§2.1 defines `areaM2` as "**published area where the source supplies it; else 0 (client may derive)**" — i.e. the official-vs-derived distinction is a contract intent. But `parseParcelGml` (`server/parcelZoningProxy.js:175-181`) extracted the INSPIRE `areaValue` (official registry area) when present **and** fell back to the shoelace `ringAreaM2` (derived), then **collapsed both into a single `areaM2`** with no flag for which it is. A consumer could not tell an authoritative registry area from a polygon-derived one — a §1.4 honesty violation.

**Status: RESOLVED (2026-07-29, §L-640 Phase 1).** Verified by `apps/editor/__tests__/parcelConfidence.test.ts` (15 tests, all passing) against both a real Spanish cadastral fixture (with registry-declared area) and a footprint-fallback fixture (always 'low'). The fix:
- `server/jurisdiction/parcelZoningProxy.js` now returns `areaOfficialM2` and `areaSigM2` separately (never collapsed); `pointToParcelM` and `candidateMarginM` are no longer discarded.
- `apps/editor/src/ui/site/parcel/parcelConfidence.ts` — new pure module: `computeParcelMetrics()` (geometry diagnostics) + `computeParcelConfidence()` (honesty-gated tier built ONLY from categorical facts, per C58 §16 explainability; see §2.4 for the complete schema and the stated Phase-1 limitations on raw numeric fields).
- All three shipped adapters (`CatastroParcelProvider`, `WfsParcelProvider`, `footprintPick`) attach `metrics` + `confidence` to their `ParcelFeature` output. Footprint-fallback parcels unconditionally yield `match:'low'` by construction.
- `areaM2` remains for backward-compat; consumers needing the honesty distinction MUST use `confidence.areaSource` + `confidence.areaOfficialM2`/`confidence.areaSigM2` (§2.1, §2.4).

### KV-3 — §1.7's L2 lift has not happened; the shipped Spain adapter is still at L5

§1.7 names `packages/site-parcel-data/` (L2) as the target home and `apps/editor/src/ui/site/parcel/` (L5) as an explicitly transitional placement. `packages/site-parcel-data/` now exists and holds the geometry + rule-pack + engine layers, but the **provider** itself has not moved. The §6 gates ratcheted "On L2" are therefore still unratcheted. **Status: OPEN** (tracked by L-400).

### KV-4 (L-539) — País Vasco / Navarra are outside Catastro and outside every measurement above

Every rate in §1.11 and §1.12 is measured on Catastro territory. **Neither province is covered by any probe**, and both run their own cadastres. This contract asserts nothing about them.
