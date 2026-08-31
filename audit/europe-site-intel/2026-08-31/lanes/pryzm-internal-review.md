# LANE 7 — INTERNAL PRYZM CODE REVIEW (brief §28)

> **Lane:** pryzm-code-review · **Date:** 2026-08-31 · **Method:** LOCAL ONLY — source, registries,
> tools and the three master docs read directly this session. No web calls. No production source
> modified. Every path below was opened or grepped this session; measured figures are quoted from
> the repo's own gate/measurement artefacts, never re-derived.
>
> **Read first (as instructed):** `docs/04-reference/GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` ·
> `docs/04-reference/geospatial/SITE-FEASIBILITY-ARCHITECTURE-AND-SCALING.md` ·
> `docs/03-execution/plans/MASTER-ROI-TRACKER.md`. Also read: `docs/04-reference/jurisdictions/ENVELOPE-CAPABILITY-MATRIX.md`.
>
> **Classification letters** are brief §1 (A data · B OSS code · C API/service · D standard ·
> E derivable · F extractable · G missing · H PRYZM IP). **Access options** are brief §10
> (1 query-dynamically · 2 cache · 3 mirror · 4 cloud-optimise · 5 store-derived-only ·
> 6 metadata+on-demand). Licence colours flag what the CODE says it ingests; external lanes own
> the licence verification (this lane is local-only).

---

## 0 · Executive read — what actually exists inside PRYZM

PRYZM is **not** starting from zero on any axis the brief audits. The repo already contains, working
and measured:

1. **A parcel-provider framework with ~20 registered jurisdiction predicates** and 8+ live-probed
   keyless national cadastres behind two server proxies (`server/jurisdiction/parcelZoningProxy.js`
   for ES Catastro; `server/jurisdiction/euCadastreProxy.js` for FR/NL/NO/DE-NRW/CH/PT/US-SF/US-CHI).
2. **A rule-pack registry with 30 registered jurisdiction entries** (one an AMB-municipal template
   that expands to several municipalities at runtime) (`packages/site-parcel-data/src/rulepacks/registry.ts`,
   2,347 lines) — a spectrum from full computed envelopes (Barcelona, 4+ packs) through gated-unsigned
   packs (Córdoba, Zaragoza, Telde, Murcia) to **deliberately refusing** registrations with cited legal
   reasons (València, CH, L'Hospitalet, Badalona…). The refusal-as-first-class-answer machinery is unique.
3. **A deterministic envelope engine** (~7,300 lines of pure L2 geometry + `ZoningRulesEngine.ts`)
   that CONSTRUCTS envelopes from ordinance algorithms (Barcelona Art. 242.2 block-derived depth by
   bisection, capsule-union inset, street-width MIN rule, DK 4-tier placement resolver) with a
   per-number `DerivationTrace` and confidence tier.
4. **A document→rule extraction core** (`packages/ordinance-extraction/`) with verification gates
   (dual-pass agreement, arithmetic cross-check, supersession, locale, range-sanity, regime),
   a born-digital text-parse grammar path (German grammar proven on a Berlin corpus), and a
   **legal-attribution layer** (instrument-priority tables deciding which correctly-read value BINDS)
   — currently wired to nothing.
5. **A static-tile context pipeline**: OSM (Geofabrik) → osmium → tippecanoe → **PMTiles on Cloudflare R2**
   read by HTTP range requests (`tools/context-bake/bake.mjs`, 23 baked regions covering every demo
   city), with national **measured-height joins** (3DBAG NL, BD TOPO FR, CNIG MDS ES, LoD2 NRW,
   GeoDanmark DK) resolved at bake time, plus a **quantized-mesh terrain compiler**
   (`tools/context-bake/terrain.mjs`) from national DTMs with orthometric→ellipsoidal datum lift.
6. **A scorecard-as-code** (`tools/city-completion/computeScorecard.mjs`) that computes C63 axis
   percentages as a total function of the inspectable registry/proxy/bake state plus live parcel
   samples — per C63 §1.1 "never a hand-typed number".
7. **A 15-country research corpus** under `docs/04-reference/jurisdictions/` (be ch de dk es fi fr gb
   it nl no pt sa se us — Spain alone 645 md files; every country carries COUNTRY-RATE / LEGISLATION-RATE /
   LOD-RATE / RATE-IMPLEMENTATION-PLAN / FOUNDER-BLOCKERS / sources / findings), with probe evidence
   dated and cited.

The honest counter-weights, from PRYZM's own tracking: **ENVELOPE has exactly one fully shipped city**
(Barcelona; ENVELOPE-CAPABILITY-MATRIX totals: 3 of 12 tracked Spanish jurisdictions VERIFIED/UPPER_BOUND);
context heights are ~0.9% surveyed in the shipped Barcelona tiles; the render throws away most of the
envelope schema (Seam 1); there is no single coordinate-frame authority (Seam 2); and rule packs are
hand-written **TypeScript code, not data** — no BCRL/JSON-Logic/OpenFisca-style rule format was ever
evaluated (brief §18 demands that evaluation before any DSL).

---

## 1 · Geospatial ingestion — parcel + zoning acquisition

### 1.1 Parcel providers (client, L2)

`packages/site-parcel-data/src/parcelProviders/` — 13 provider files + `registry.ts` (592 lines).
Registered predicates (read from `registry.ts` imports this session): ES, FR, NL, NO, DE-NRW,
DE-fallback, CH, DK, SA, IT, BE-Flanders, BE-Wallonia, BE-Brussels, GB-England, GB-Scotland, FI,
US-NYC, US-SF, US-Chicago, PT. Registry rows carry live-probe provenance in comments (e.g. Brussels:
four surfaces probed 2026-07-31, `GAPD:AGDP_CAPA` advertised-but-not-served; Scotland: DNS-dead /
403 / ScotLIS-licensed ⇒ registered `access-deferred`, honestly, instead of omitted).

| Component | Path | Class | Verdict | Reason |
|---|---|---|---|---|
| Provider framework + registry (bbox `contains` predicates, `kind: cadastral/footprint`, per-row probe notes) | `parcelProviders/registry.ts` | H (framework) over C (national WFS) | **EXTRACT INTO CORE** | This IS the brief §12 "adapter registry / source discovery" — already country-agnostic; the per-row notes are a working source registry. Evolve routing to bbox-intersection + priority-fallback (already flagged as orchestrator debt in MASTER-ROI-TRACKER §0.5.2) rather than per-country `if(isInX)` growth. |
| Per-country providers (Catastro, IGN, PDOK, GeoNorge, ALKIS-NRW, swisstopo, Matrikel-DK, AgenziaEntrate, GRB, OS-INSPIRE, MML, PLUTO, DGT…) | `parcelProviders/*.ts` | C consumed via H adapters | **MOVE TO COUNTRY ADAPTER** (they already are) | Each is a thin schema-mapping over a national API — exactly the brief §12 adapter shape. KEEP as the adapter SDK's first 20 instances. |
| DK Matrikel credential gate | `dkMatrikelParcelProvider.ts` + `server/jurisdiction/dkMatrikelProxy.js` | C (identity-gated) | **KEEP** | The canonical "keyed source, key server-side" template (rollout tracker §5). Records the MitID gate honestly (hard-won lesson 3): access-deferred ≠ missing. |
| Footprint-fallback providers (OSM footprint when no cadastre) | `apps/editor/src/ui/site/parcel/FootprintParcelProvider.ts` | E | **KEEP** | Honest degradation path; feeds the same `ParcelFeature` schema. |

**Access model in force:** parcels are **option 1 + 2** — queried live per click through same-origin
proxies with a bounded in-memory LRU (7-day TTL, keyed by refcat/parcel id — read in
`parcelZoningProxy.js`). Nothing cadastral is mirrored. This already matches the brief §34 principle
("owning as little raw data infrastructure as possible").

### 1.2 Zoning providers / resolvers (client, L2)

`packages/site-parcel-data/src/providers/` — ~80 files: MUC (Catalonia), Murcia GeoServer, Madrid
NORMAS_ZONALES + SPACM, Córdoba (manual/traced/raster-classified — three resolution modes),
València MapServer, Sevilla, Zaragoza, Canarias SIPU, Balears MUIB, CH Grundnutzung + Zürich BZO
catalogue + regime resolver, NL bestemmingsplan (PDOK Omgevingswet), DK Plandata (`DkZoningProvider`,
`ByggefeltProducer`), Paris PLU. Each returns typed outcomes; the DK producer is the exemplar:
`FetchOutcome<PlacementEvidence[]>` with found/absent/transient/aborted and the cache rule "only
found and absent enter the cache".

| Component | Path | Class | Verdict | Reason |
|---|---|---|---|---|
| Zoning resolver corpus (per-jurisdiction) | `providers/resolve*.ts`, `providers/*Provider.ts` | C via H | **MOVE TO COUNTRY ADAPTER** (already are) | Semantics mapping per source; the brief's adapter layer, instantiated ~25 times. |
| `FetchOutcome` discipline | `packages/schemas/src/site/zoning/FetchOutcome.ts` + `ByggefeltProducer.ts` | H | **EXTRACT INTO CORE** | The failure≠absence type is the single most transferable honesty invariant (L-422/457/467/469 family). Architecture doc Part 3 §3.4 documents it is NOT yet carried end-to-end — the dispatcher still flattens transient/absent into one refusal code at `siteDispatch.ts` (NL `:1839-1845`, DK `:1440-1447`), and C57 §1.5 *mandates* the collapse for parcels. The canonical fix is written (one shared outcome type + CI gate); finishing it is core work, not per-country work. |
| Server zoning proxies (19 files) | `server/jurisdiction/*.js` | H (thin) | **KEEP / REFACTOR** | Same-origin CORS+key shield with LRU cache — correct pattern. REFACTOR: three of them (`chGrundnutzungProxy`, `plandataZoningProxy`, `mucZoningProxy`) return `200 {null}` for both upstream failure and genuine empty (documented in the architecture doc Seam 4) — retrofit `FetchOutcome` here too; `overpassProxy.js` already does it right. |
| Overpass live proxy | `server/overpassProxy.js` | C | **KEEP (fallback only)** | Demoted to failure-fallback after L-513; PMTiles is primary. Do not delete — it is the no-bake-coverage path. |

---

## 2 · The jurisdiction / rule-pack system — the 15-country census

**The "15 countries" claim is real as a research corpus and uneven as code.** Country directories:
be(47 md) · ch(42) · de(82) · dk(57) · es(645, ~1.3 GB incl. committed ordinance PDFs) · fi(24) ·
fr(48) · gb(28) · it(46) · nl(25) · no(37) · pt(46) · sa(53) · se(25) · us(68). Every country has
the standard skeleton (COUNTRY-RATE, LEGISLATION-RATE, LOD-RATE, RATE-IMPLEMENTATION-PLAN,
FOUNDER-BLOCKERS, NEXT, sources/, findings/, topics/).

What each actually contains, code-wise (verified against the two registries this session):

| Country | Parcel code | Zoning/rules code | Envelope state | Honest label |
|---|---|---|---|---|
| ES | `catastro` wired-live keyless | ~30 city bboxes, ~15 resolvers, ~35 packs/refusals | Barcelona VERIFIED (partial scope); Murcia VERIFIED w/ known over-grant defect; Madrid NZ-1 footprint-only signed; Córdoba/Zaragoza/Telde engineering-done-unsigned; València legally blocked; 12+ cited-refusal municipalities | **RULES + GEOMETRY** (the deep one) |
| DK | `matrikel-dk` wired, MitID-gated | Plandata WFS provider + byggefelt producer + 4-tier placement resolver + SIGNED L-449 extraction JSON (`dk/DENMARK-LEGISLATION-EXTRACTION.json` — a per-plan attribute→envelope mapping, not a zone table) | live-resolved per plan; `packsByZone` empty BY DESIGN | **RULES (structured-country reference)** |
| NL | `pdok-nl` wired-live | bestemmingsplan resolver (explicit bouwvlak geometry) | live-resolved; realistic per ENVELOPE-REALISM-MATRIX | **RULES via geometry** |
| FR | `ign-fr` wired-live | Paris PLU resolver + `frParisPluBioclimatique` pack (registered, empty packsByZone — Denmark's shape) | latent overstates-setback behind cert gate | **GEOMETRY, rules partial** |
| CH | `swisstopo-av` wired-live | Grundnutzung provider + Zürich BZO catalogue + regime resolver; registered refusal jurisdiction | refuses with citation; per-canton FAR harvest is the named path | **GEOMETRY + refusal** |
| DE | `alkis-nrw` wired-live (NRW only) + national footprint fallback | German text-parse GRAMMAR in ordinance-extraction (Berlin corpus); no envelope pack | none | **STUB + extraction groundwork** |
| SA | geo-fenced (user-drawn) | Riyadh demo pack registered — footprint/setbacks compute, height refuses | demo | **RULES (national constants)** |
| IT/BE/FI/GB/US/PT/NO/SE | providers wired or access-deferred (SE to-build, key-gated) | none | none | **PARCEL-ONLY / STUB** |

| Component | Path | Class | Verdict | Reason |
|---|---|---|---|---|
| Rule-pack registry + `JurisdictionZoningContract` (pack/refusal/unregistered tri-state, `packsByZone`, answerability projection) | `rulepacks/registry.ts` | **H** | **EXTRACT INTO CORE** | This is the brief §11 "Rule/Prescription + applicability" layer in embryo — the tri-state (computable / cited-refusal / unregistered) is the applicability engine's honest core and nobody external ships it. |
| The pack CONTENT (Barcelona 13a/13b/20a/12/22a…, Madrid PGOUM-97, Córdoba PGOU-2001, Murcia, Zaragoza, Telde, Riyadh) | `rulepacks/es*.ts` etc. | **H** (F-derived) | **KEEP; REFACTOR representation** | The sourced legal content is the moat (rollout tracker §4.1: sourcing is human-gated and cannot be bought). BUT packs are TypeScript — brief §18 requires evaluating BCRL / JSON Logic / OpenFisca / RDF-SHACL as the *representation* before scaling to document-rule countries. Migrating pack DATA (numbers, citations, applicability predicates) into a declarative format with a typed evaluator would preserve the content and unlock non-engineer authoring — the single biggest refactor this lane recommends. |
| Refusal vocabulary + answerability classifier | `rulepacks/zoneRefusal.ts`, `answerabilityClass.ts`, `envelopeAuthorisation.ts`, `researchPendingRefusal.ts`, `governingInstrumentSignpost.ts` | **H** | **EXTRACT INTO CORE** | "Refusal with citation is a correct answer" + the single-statement-of-coverage discipline (answerability projects the registry; holds no zone lists of its own). Jurisdiction-independent. |
| L-449 verification-gate constants (`*_ENVELOPE_VERIFIED`) + three-milestone discipline (verification ≠ dispatch ≠ rendering) | registry + `ENVELOPE-CAPABILITY-MATRIX.md` | **H** (process) | **KEEP** | A human sign-off gate between transcription and rendering; found the hard way on Córdoba. External rule-extraction tools have nothing equivalent. |
| Country research corpus | `docs/04-reference/jurisdictions/**` | **H** (evidence) | **KEEP** | Dated live-probe evidence per source (incl. negative results: Huesca geo-fence, Málaga ORA-28000 locked Oracle account, Brussels catalogued-but-not-served). This is the brief §11 Source/Evidence registry in prose form — feed it into the canonical source registry rather than rewriting it. |

---

## 3 · Envelope generation — the engine

`packages/site-parcel-data/src/` — pure L2, deterministic, no LLM, no RNG (C58 §1.1/§3.2;
byte-identical output contract). ~7,300 lines across the geometry core + engine.

| Component | Path (lines) | Class | Verdict | Reason |
|---|---|---|---|---|
| Block-derived depth (Art. 242.2 as algorithm: bisection, 40 fixed steps, 30% interior-free-space rule) | `geometry/blockDerivedDepth.ts` (402) | **H** | **KEEP** | The "envelope is a construction, not a lookup" thesis made real; survived an independent-oracle audit cycle (L-581/L-586: miter replaced by capsule-union boundary, layer 6 36.9%→98.5%). No external project computes ordinance-constructed depth. |
| Block dissolve | `geometry/blockRing.ts` (804) | H | **KEEP** | 91.4% nationally on a frozen 956-manzana sample (tracker §4.0); pure geometry, transfers free. |
| Per-edge inset (metric edge-offset; deliberately NOT Turf — geodesic vs scene-XZ-metres mismatch documented) | `geometry/insetPolygon.ts` (658) | H | **KEEP** | Hand-rolled for a reason (C58 §2.9 divergence note: the code's reasoning beats the contract; C58 needs the in-place edit). External lanes should still check whether a maintained planar-offset lib (e.g. clipper-family) could replace the primitive under the never-overstate CI property — REPLACE only with the independent-oracle test in place. |
| Street width (ray-cast, ordinance MINIMUM rule, test-pinned) | `geometry/streetWidth.ts` (423) | **H / E** | **KEEP** | Street width has NO national source anywhere (tracker §4.0) — it must be CONSTRUCTED; this is the constructor, reused by Murcia/Zaragoza/Madrid packs. |
| Façade rasant datum (plane-fit at the façade, not one centroid sample) | `geometry/facadeRasantDatum.ts` (735) | **H** | **KEEP / finish wiring** | Fixes a LEGAL defect (L-584 — ordinance measures from the rasant at the façade). Built; the single-centroid seat is still live in the viewport (Seam 2 T0–T3 sequence is written and pending). |
| Explicit-area / bouwvlak, depth-band clip, concentric band, building-line offset, occupation-capped depth, polygon clip, ring validation, native CRS | `geometry/*.ts` | H | **KEEP** | The vocabulary of envelope operations the brief §17 lists (setbacks, lines, offsets, bands, coverage) — country-rule independent, exactly as demanded. `nativeCrs.ts` enforces hard-won lesson 5 (never measure after lossy reprojection). |
| `ZoningRulesEngine` (rules→envelope orchestration) | `ZoningRulesEngine.ts` (1,319) | H | **REFACTOR** | Two documented overstating mechanisms (unknown setback → 0-inset at `:249`; `maxFAR` returned but never capping volume) — the Seam-1 write-up names the fixes; the `envelopeToMassing` inversion (below) is the structural one. |
| `envelopeToMassing` (engine emits solids; render rasterises) | `envelopeToMassing.ts` (609) | H | **KEEP / finish adoption** | The canonical Seam-1 fix EXISTS as a pure function; the viewport's 4-field projection (`resolveFormaEnvelope` → `renderFormaMassing`) still discards `tiers[]`/`maxVolumeM3`/`footprintIsUpperBound`. Finishing adoption + the never-overstate CI property test over every pack is the highest-leverage render change. |
| DK placement resolver (byggefelt → byggelinjer → lokalplan depth → block study → REFUSE) | `rulepacks/dkEnvelopePlacement.ts` + `evidence/` | **H** | **EXTRACT INTO CORE** | A 4-tier evidence hierarchy with §UNKNOWN-IS-NOT-ZERO and higher-authority-unresolved cache poisoning rules — this IS the brief §14 evidence-graph pattern applied to placement; generalise it beyond DK. |
| Estimated-default solve | `solveEstimated.ts` + `rulepacks/estimatedDefault.ts` | H | **KEEP, gated** | The honest fallback tier; the "estimated-card render race" (generic pack paints before the jurisdiction resolver refuses) is a named open defect — fix ordering, keep the tier. |
| Compliance report / capacity comparison / containment / height caps | `complianceReport.ts`, `capacityComparison.ts`, `envelopeContainment.ts`, `envelopeHeight.ts`, `farLimitedHeight.ts`, `storeyCap.ts` | H | **KEEP** | Per-field provenance already flows to the card (Seam 3 verdict: mostly already built). |
| Strip-slicer (apartment/floor-plate generation off the envelope) | `packages/ai-host/src/workflows/apartmentLayout/**` (D-TGL engine) | H | **KEEP — out of lane scope** | Downstream consumer of the envelope (Product B → building generation); the historical "hard-reject → [] silent fallthrough" is fixed per memory. Not site-intel core. |
| Sevilla fondo clip / bcn cossos sortints etc. | `sevillaFondoClip.ts`, `rulepacks/esBarcelonaCossosSortints.ts` | H | **MOVE TO COUNTRY ADAPTER** | City-specific geometry riding in the shared package — belongs with the pack. |

**§L965 `resolveBoundarySegments`** (`packages/geometry-slab/src/boundaryArc.ts:179`) — this is the
authoring-side boundary-arc recovery (reading arcs back out of tessellated polygons), used by wall/slab
authoring, not by the envelope engine. Verdict **KEEP**; note it here only because briefs keep
conflating it with envelope geometry — it is building-authoring machinery.

---

## 4 · Rule extraction / planning-regime resolution (the AI split, brief §20)

| Component | Path | Class | Verdict | Reason |
|---|---|---|---|---|
| Ordinance-extraction core (gates: supersession, dual-pass, arithmetic cross-check, range-sanity, locale, algorithm-detector, regime) | `packages/ordinance-extraction/src/` | **H** | **EXTRACT INTO CORE** | Exactly the brief §20 doctrine already implemented: AI extracts, gates verify, output lands at a permanent `pipeline-extracted-unverified` tier with no silent graduation (LOCK 3). The gate battery is IP no OSS extraction repo has. |
| German text-parse grammar (born-digital, no OCR/LLM) | `grammars/german.ts`, `germanRegimes.ts` | H | **KEEP** | Proven on the Berlin corpus; the per-country `JurisdictionGrammar` contract is the adapter seam for document-rule countries. External lanes: compare against XPlanung tooling — where a Bebauungsplan exists as XPlanGML, PARSE THE STANDARD (D) instead of the PDF; the grammar is for the non-XPlanGML long tail. |
| Legal attribution layer (which correctly-read value BINDS: instrument kind, legalStatus, per-jurisdiction priority tables as data) | `src/attribution/` | **H** | **EXTRACT INTO CORE + WIRE** | Deliberately wired to nothing yet (its own header says so). This is the planning-regime resolver from memory (geometry-first, instrument-priority) — the brief §15 "what applied on date X" question needs exactly this layer plus validity intervals. |
| Regime resolvers in providers (Zürich BZO regime, Madrid SPACM grammar/validate/routing-guard) | `providers/zurichBzoRegimeResolver.ts`, `rulepacks/esMadridSpacm*.ts` | H | **MOVE TO COUNTRY ADAPTER** | Country-specific instrument routing on the shared attribution shape. |

**Gap vs brief:** extraction confidence exists; **valid_from/valid_to versioning (brief §15) does
not** — no schema field answers "what applied on 2025-01-01". Class **G** inside PRYZM; the
attribution layer is the right seat for it.

---

## 5 · Context 3D — tiles, terrain, heights

| Component | Path | Class | Verdict | Reason |
|---|---|---|---|---|
| Context bake (Geofabrik OSM → osmium → tippecanoe → merged PMTiles per layer; 23 regions; Overture for SA) | `tools/context-bake/bake.mjs` | **B+A consumed, H glue** | **KEEP** | Sound cloud-optimise pattern (option 4); one fused tileset, bake-time joins, client-invisible region additions. Sources: OSM/Geofabrik (ODbL — **YELLOW**, share-alike on derivative DBs; attribution shipped), Overture (ODbL/CDLA-permissive mix — external lane to confirm per theme). |
| Height joins (3DBAG, BD TOPO, Catastro+CNIG MDS, LoD2-NRW, GeoDanmark; documented: CH/SE/PT/NO/US/IT-Turin/BE-Flanders; blocked: SA) | `tools/context-bake/heightSources.mjs` | **A/C** | **KEEP; REPLACE candidate** | The per-country `impl: live/documented/blocked` table is itself a source registry. ⚠ Shipped Barcelona tiles still report `measuredMarkerCount: 0` (ROI tracker) — the join landed in code, the re-bake is R2-credential-gated. **Duplication flag: EUBUCCO / Overture buildings / JRC DBSM likely pre-conflate footprint+height for much of Europe** — if an external lane confirms quality ≥ `levels×3.2m` against PRYZM's 0.9% surveyed ground truth (the V3 gate, already specified in the tracker), the per-country join code shrinks to one attribute-join adapter. |
| Terrain compiler (national DTM → MARTINI TIN → in-file quantized-mesh encoder → R2; orthometric→ellipsoidal geoid lift; per-city) | `tools/context-bake/terrain.mjs` + `terrain.verify.mjs` + `reproject.mjs` | **E/H** | **KEEP datum logic; REPLACE tiling if external found** | **Duplication flag (strongest in repo): Mapterhorn (named in brief §8), Cesium World Terrain, and Copernicus GLO-30-based tilesets all serve terrain tiles.** PRYZM hand-wrote a quantized-mesh encoder because "no npm encoder exists that renders" — an external planet tileset with a licence that permits commercial use would delete most of this file. What must SURVIVE any replacement: the datum rule (ellipsoidal, shared with buildings+envelope) and `fitFootprintGroundPlane` (façade rasant — a LEGAL requirement, not a rendering nicety). NB the repo already runs real Cesium World Terrain in some paths — licence/cost is the deciding axis, external lane owns it. |
| Client tile reader (PMTiles over R2 range requests, discriminated ok/aborted/unavailable/disabled, bbox fan-out cap, cache-busting `?v=`) | `apps/editor/src/ui/geospatial/contextTiles.ts` (1,169) | H | **KEEP** | The performance ceiling is measured (42 tiles · 13.4 MB · ~1s) and the "no new runtime fetch path" rule is contractual (L-513). |
| Context buildings/roads/water/parks/rail/landuse renderers + caches | `contextBuildings.ts` (1,764) et al. | H | **KEEP / REFACTOR** | Working; the shape+height single-record weld is the documented schema debt blocking a second height source — split the pair (tracker Phase 4: "cheap, do it while probes run"). |
| Terrain coverage resolver (city slug → R2 quantized-mesh URL) | `terrainCoverage.ts` (710) | H | **KEEP** | Honest attach/no-attach reasons (toggle-off / no-baked-city / photoreal). |
| CesiumViewport | `CesiumViewport.ts` (**14,564 lines**) | H | **REFACTOR (structural)** | The untestable monolith both seams live in: 4-field envelope projection, ~13 θ application sites in 3 idioms, 4 ground-elevation paths, duplicated `CesiumThreeBridge`. The seam fixes (SiteFrame authority, `envelopeToMassing` adoption, `check-scene-frame-single-owner` CI gate) are fully specified in the architecture doc Part 3 — execute, don't re-design. |
| Old same-origin tile proxies | `server/context-delivery/contextTilesProxy.js`, `catalogAssetProxy.js` | — | **DELETE (gated)** | R2 CORS is live; tracker Phase 6 conditions deletion on a founder Network-tab confirmation that R2 is read directly (a bundle grep cannot distinguish dead fallback from active path). |

---

## 6 · Storage — what is mirrored vs queried (brief §10)

| Data | Mode | Where | Access option | Note |
|---|---|---|---|---|
| Cadastral parcels (all countries) | **Queried live**, LRU-cached (7-day TTL, bounded) | server proxies | **1+2** | Nothing mirrored; correct under the brief's minimal-ownership principle. |
| Zoning / plan attributes | **Queried live**, cached per proxy | `server/jurisdiction/*` | **1+2** | Same. |
| Context buildings/roads/water/parks | **Mirrored derivative** (baked PMTiles) on Cloudflare R2, immutable, versioned `?v=` | R2 `tiles/` | **3+4** | ODbL derivative-database obligations attach (share-alike) — external licensing lane should confirm the attribution/share-alike posture for the fused tileset, esp. once national (non-OSM) heights are stamped in. |
| Heights | **Derived-only** attribute stamped on baked footprints at bake time | inside `buildings.pmtiles` | **5** | No raw LiDAR/nDSM mirrored. |
| Terrain | **Derived-only** quantized-mesh from national DTMs | R2 `terrain/<city>/` | **5** | Raw GeoTIFFs are fetch-and-discard. |
| Rule packs / legislation | **Owned** (hand-encoded TS + committed source PDFs in `docs/.../jurisdictions/es/**`) | repo | H | The one dataset PRYZM authors (architecture doc §2.1: "only layer 5 is a dataset we author"). |
| Measurements / scorecards | computed records | `tools/city-completion/measurements/*.json` | H | Referenced-never-transcribed discipline (C64 §2.13). |

**Verdict: the storage architecture already matches the brief's expected hybrid** (query parcels/rules
dynamically; cloud-optimise bulky context; store only derived products). No mirror of any cadastre or
plan database exists anywhere in the repo.

---

## 7 · C63 scorecard machinery

| Component | Path | Class | Verdict | Reason |
|---|---|---|---|---|
| Scorecard compute (reads registry + mounted proxies + height `impl` flags + bake REGIONS + live parcel samples; emits `CityCompletionScorecard` L0 schema) | `tools/city-completion/computeScorecard.mjs` + `computeScorecard.test.ts` | **H** | **KEEP / EXTRACT INTO CORE** | "Axis % is a total function of inspectable state, never a hand-typed number" — this is the brief §21 coverage heatmap engine, already principled (unmeasured = `null` + typed UnknownReason, never 0; ratified buildable-land denominator L-656). Extend it into the per-country heatmap the brief asks for rather than building a new one. |
| Parcel sample probe + samples (10 cities incl. a CH counterfactual) | `parcelSampleProbe.mjs`, `samples/*.json` | H | **KEEP** | Live-sample harness, feeds PARCEL axis. |
| Measurement records (5 Spanish cities) | `measurements/*.measurements.json` | H | **KEEP** | The reference-never-transcribe substrate. |

---

## 8 · Where PRYZM is (likely) duplicating what exists — for external lanes to confirm

Ranked by deletion value if the external finding lands:

1. **Terrain tiles** (`terrain.mjs`, incl. a hand-written quantized-mesh encoder): vs **Mapterhorn**,
   Cesium World Terrain, Copernicus-derived tilesets. If a commercially-usable European terrain
   tileset exists, PRYZM keeps only the datum-lift + façade-rasant sampling and deletes the compiler.
2. **Footprint+height conflation** (`heightSources.mjs` per-country joins, the bake's MDS/DHM/LoD2
   stampers): vs **EUBUCCO, Overture buildings, JRC DBSM, 3DBAG-style national products**. Gate any
   swap on the repo's own V3 rule: must beat `levels×3.2m` against the 0.9% surveyed ground truth.
3. **Pan-EU cadastre access** (`euCadastreProxy.js` + 13 providers): vs **Open Cadastral Map /
   INSPIRE harmonised cadastral parcels** (brief §4). If one harmonised endpoint truly serves
   multi-country parcels at usable quality, 10 adapters collapse to 1 — but PRYZM's per-country
   probe notes (Brussels catalogued-but-not-served, Scotland licensed, Wallonia orthophotos-only)
   suggest the aggregators will be shallower than their coverage maps claim. Apply hard-won lessons
   1–2 (hidden layers; query-vs-bulk) before concluding either way.
4. **Rule representation**: PRYZM hand-rolls packs as TS. vs **BCRL, XPlanung semantics, DK Plandata
   attribute model, OpenFisca/JSON-Logic evaluators** (brief §18). The evaluation the brief mandates
   was never done inside PRYZM — genuine gap (G) in due diligence, though the DK extraction JSON
   shows the team already converging on rules-as-data for structured countries.
5. **German document parsing**: vs **XPlanung/XPlanGML + SAGisXPlanung tooling** — where XPlanGML
   exists, standard-parsing (D) beats PRYZM's PDF grammar (F).
6. **NOT duplication (keep confidently):** PMTiles/tippecanoe/R2 static-tile delivery (PRYZM consumes
   the OSS standard, doesn't reimplement it); proj4-based single-projector; MARTINI TIN (consumed).

## 9 · What is genuinely PRYZM IP (class H, defensible)

1. **The constructed-envelope engine with derivation traces** — ordinance-as-algorithm
   (blockDerivedDepth + the operation vocabulary) with per-number citations and an independent-oracle
   verification culture. No government, OSS project or startup in the brief's named set ships this.
2. **The honesty/refusal machinery** — `FetchOutcome`, the refusal vocabulary with citations,
   answerability classes, refusal-with-both-numbers doctrine, `not-assessed ≠ 0`, the
   verification≠dispatch≠rendering three-milestone discipline. Fully jurisdiction-independent.
3. **The rule-pack CONTENT + signing workflow** — human-gated legal sourcing whose cost structure is
   the moat by the founder's own analysis (tracker §4.1: a competitor cannot buy these packs either).
4. **The ordinance-extraction gate battery + legal-attribution layer** — verification gates around AI
   extraction and instrument-priority binding decisions, with a no-silent-graduation confidence lock.
5. **The C63 scorecard-as-total-function** and the buildable-land denominator ruling.
6. **The 15-country probe corpus** — thousands of dated, cited source probes including the negatives.
7. **The façade-rasant datum construction** (legal height datum from terrain, not centroid sampling).

## 10 · Debt register the migration plan must carry (from PRYZM's own docs, verified present)

- **Seam 1**: render consumes 4 fields of the envelope; `envelopeToMassing` written but not adopted;
  never-overstate CI property test not yet in place. (C58 §1.4/§1.7b.4 violations, live.)
- **Seam 2**: no SiteFrame authority — 2 origin authorities, ~13 θ sites, 4 ground paths, duplicated
  CesiumThreeBridge (C12 §1.5 / L-604 OPEN). Terrain-everywhere critical path T0–T3 specified.
- **Seam 4**: dispatcher flattens transient/absent; C57 §1.5 itself mandates the collapse — contract
  amendment required, not just code.
- **Schema weld**: one record carries shape+height from one provider — blocks all federated-height work.
- **Monoliths**: `CesiumViewport.ts` 14.6k lines; `siteDispatch.ts` 9.1k lines; both named untestable
  by the architecture doc.
- **Authored-but-unwired inventory** (L-654 shape): heritage+flood overlay adapters landed with tests
  but unwired; Madrid PUB:ALIN (59.1M m²) published-but-unread; ordinance-attribution layer unwired;
  MDS measured heights baked in code but not re-baked to R2. *Audit reachability, not existence.*
- **No versioning axis** (brief §15): no valid_from/valid_to anywhere in the envelope/zoning schemas.
- **Rule packs are code**: non-engineers cannot author them; the brief's rule-engine evaluation is undone.

## 11 · Explicit answers to the lane questions

**"Where is PRYZM duplicating what external lanes will likely find?"** — §8 above: terrain tiling
(top), footprint+height conflation, possibly pan-EU cadastre aggregation, German plan parsing.
Tile infra is NOT duplication — PRYZM consumes the PMTiles standard the brief itself names.

**"What is genuinely PRYZM IP already?"** — §9: rule-pack semantics + content, refusal doctrine,
constructed-envelope engine, extraction gates + attribution, C63 scorecard, probe corpus, rasant datum.

**Single most important architecture verdict for the report:** PRYZM's existing stack already
matches the brief's target on storage (hybrid, minimal ownership), adapters (country code stays in
adapters, core stays agnostic — enforced by the registries), and the AI/deterministic split
(extraction gated, geometry deterministic). The two places it diverges from the brief's target are
(a) **rule representation** (code, not data — evaluate BCRL/OpenFisca-class evaluators before
authoring country #16) and (b) **the missing versioned evidence graph** (attribution layer exists
unwired; validity intervals don't exist). Both are REFACTOR/EXTEND of existing seams, not rebuilds.
