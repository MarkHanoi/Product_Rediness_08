# Generative Pipeline Audit — Residential Building · House · Office

**Date:** 2026-08-10 · **Scope:** architecture, orchestration and execution pipeline of the three
building generators, plus the four founder-reported defects, each root-caused to file:line.
**Companions:** `RAC-GENERATIVE-INFRA-INVENTORY.md` (per-generator facts — NOT re-derived here),
`RAC-IMPLEMENTATION-PLAN.md` Phase U5b (typed GenerationRequest adapters). Contracts cited: C11
(element creation), C16 (command authoring), C50 §1.7 (soft-fail), C53 (generative engine
architecture), C58 (buildable envelope); ADR-0063 (house doctrine), ADR-0072 (corridor-spine),
ADR-0097 (upper-floor clamp).

---

## 1. Per-pipeline architecture map + verdict

All three follow the proven split (inventory §0): **PURE engine**
(`packages/ai-host/src/workflows/<domain>/`) → **CONTROLLER** (`apps/editor/src/ui/<domain>/`)
→ **EXECUTOR** (dispatch inside `batchCoordinator.runBatch` under the
`beginBuildingGeneration` lease). This is the doctrine new typologies must mirror.

### 1.1 Residential building (multi-apartment) — verdict: **sound skeleton, weakest honesty seam (now fixed) and weakest objective**

```
ResidentialBuildingRequest (controller :52 / residentialRequestFromBrief — THE U5b template)
  → buildOrchestratorInput (controller :135, defaults)
  → orchestrateResidentialBuilding (packages/ai-host/.../residentialBuildingOrchestrator.ts:431, PURE)
      deriveLocalFrame §RESI-RIGID-TRANSFORM (:397) → principal-axis LOCAL frame
      effectiveCoreSize / corridor scaling (:181/:209) → centred core, side-core fallback (:558)
      per upper level: packApartments (apartmentPacker.ts) → partitionLevelPlate (platePartition.ts)
        → per cell: runApartmentCellLayout (D-TGL per cell; soft-fails per cell, C50 §1.7)
  → ResidentialBuildingController._request (:209) → preview modal → Build
  → ResidentialBuildingExecutor._execute (:240): mint levels → pure pre-build
      (buildLayoutCommands per apartment, :520) → beginBuildingGeneration('resi-building') (:588)
      → ONE structural runBatch → deferred openings/finish passes → per-level ceiling queue
```

Strengths: pure/deterministic engine with §-tagged fix history, principal-axis transform mirrors
the house, per-cell soft-fail, honest refusal copy (§RESI-REFUSAL-TRUE quotes only measured
quantities), one composite undo via the generation lease, `buildLayoutCommands` reused verbatim
from the apartment engine (doctrine-compliant).

Weaknesses: (a) the all-cells-rejected 'ok' result shipped an empty building — fixed this audit
(§3.1); (b) the partition objective is count/area only (§3.4); (c) zero consumption of street /
orientation / neighbour signals (§3.2, §3.3); (d) `apartmentCount` semantics: controller counted
placements, executor counted builds — now both refuse at zero.

### 1.2 House — verdict: **best in class; the reference implementation**

`HouseLayoutExecutor.ts:329` + `houseOrchestrator.ts` (deterministic; §PRINCIPAL-AXIS at :555,
stair at worst-aspect corner via `chooseStairCorePosition`, `stairPosition.ts:557`). Headless
`generateHouseFromBoundary` (`houseFromBoundary.ts:77`). One composite undo via
`beginBuildingGeneration('house')` (`:1321`). ADR-0097 upper-floor clamp and ADR-0072
corridor-spine live here. Post-gen chain budgets are explicit
(`runHousePostGenChain.ts:114-126`: 6 s floor/ceiling settle, 12 s furnish, 12 s lighting,
3.5 s naming — **per storey**), with the `houseFanoutGuard` suppressing the global chain
(`furnishLayoutTrigger.ts:320`). Residual debt: the per-storey chain multiplies render waste
(§4) and the modal is still the only ending (U5b.2).

### 1.3 Office — verdict: **structurally conformant, thinnest engine**

`OfficeBuildingController.ts` (typed `OfficeBuildingRequest` :35; rejections surfaced via
`modal.showError` :127-130 and the buildDirect toast :185-191 — office already had the honesty
seam residential lacked) → `OfficeBuildingExecutor.ts:207`, one composite undo (:380), headless
`generateOfficeBuilding(null, {})`. Engine takes centroid+fit-radius (a circle), so it consumes
even less parcel geometry than residential — orientation/street gaps apply a fortiori. Storey
auto-fit honesty exists (`requestedStories`+`autoFit`, inventory §2) and should be piped into
chat replies (U5b.4).

### 1.4 Shared orchestration facts (both agents verified)

- **Auto-chain:** `apartment.layout-executed` → floor+ceiling → `ceiling.layout-executed` →
  furnish → `furnish.layout-executed` → lighting. **§CHAIN-TIMEOUT contract**
  (`furnishLayoutTrigger.ts:286-306`): the furnish timer is armed on
  `apartment.layout-executed` (:310-315), `FALLBACK_MS = 12_000` (:295); whichever of
  {ceiling event, 12 s wall clock} lands first wins, the loser is a no-op via `state.fired`.
  On timeout furnish runs against possibly-unfinished ceiling/room state — reliability over
  correctness by design. Lighting mirrors it (`lightingLayoutTrigger.ts:82-99`). Risk: the 12 s
  budget is wall-clock from the *apartment* event, so a slow structural settle (big building,
  weak machine) can fire furnish before ceilings exist — the production logs' §CHAIN-TIMEOUT
  lines are this contract working as written, not a bug, but the contract itself is
  time-based where it should be causal (gap G-P1-5).
- **`resolveGenerateRoute`** (`OnboardingStepController.ts:2958`) is the real dispatcher;
  TypologyPipeline generative stages are stubs (inventory §3). U5b must build on the former.
- **Envelope seam:** all boundary paths run `resolveBuildableFootprint`
  (`siteDispatch.ts:872`); `maxHeightM` still enforced by NO generator (U5b.3).

---

## 2. The four defect root-causes (file:line)

### 2.1 "Sometimes NO apartments are created at all" — silent all-cells-rejected fallthrough ✅ FIXED

Not a partition zero (that path already refuses with a real reason,
`residentialBuildingOrchestrator.ts:917-921`) and not an unsatisfiable gate. The chain was:

1. `residentialBuildingOrchestrator.ts:933` gates only `placed.length === 0`. Each placed cell
   then runs D-TGL (`:962`); a soft-fail marks the cell `status:'rejected'` (:988-997) and the
   result is still `status:'ok'` — correct per C50 §1.7 **per cell**, wrong in aggregate.
   Typical reasons: `runApartmentCellLayout.ts:382/:428/:434` ("cell is degenerate", "D-TGL
   produced no layout for this cell", "layout has no rooms") — cells the corridor grid emits at
   feasible-but-unlayoutable sizes.
2. `ResidentialBuildingController.ts` (pre-fix :244-265): computed
   `countPlacedApartments` but never gated on 0 — opened the Build modal anyway.
3. `ResidentialBuildingExecutor.ts:492`: `if (apt.status !== 'ok') { rejectedCount++; continue; }`
   — every apartment silently skipped; `:783` returned `{ok: true, apartmentCount: 0}`. The user
   got shell + core + corridors, zero apartments, zero explanation.

**Fix shipped (commit `8ab1fe92`, §RESI-ZERO-APARTMENTS-REFUSE):** controller gate routes
`apartmentCount === 0` to the same friendly error modal as a hard reject, quoting the engine's
most-common per-cell reason (new pure `summarizeCellRejections`); new `'no-apartments'` kind in
`residentialError.ts`; defensive pre-mutation guard in the executor (headless path); 4 tests.
This is exactly the envelope-reject-silent-fallthrough disease class: `rejected → skip → looks
like success`, and the same "surface the real reason" cure.

### 2.2 Party walls / adjacent buildings ignored — two mechanisms that never meet

Two independent party-wall systems exist; **neither informs the residential layout**:

- **PW.2 neighbour proximity (apartment/house only).** `neighbourFootprintStore.ts:67/:106`
  (written by `CesiumViewport.ts:7938`, `SiteBoundaryMap2D.ts:1271`) →
  `resolveBlindFacades.ts:83` `computeNeighbourBlindSet` → `blindFacadeWallIds` suppresses
  windows/entrance in `ApartmentLayoutExecutor.ts:126,140`, `HouseLayoutExecutor.ts:649,660`,
  `shellWallMatch.ts`. NOTE: `SPEC-PARTY-WALL-AWARENESS.md:3,134` is STALE — it claims PW.2 is
  TODO; it shipped 2026-06-10. Genuinely open: PW.3 cadastral/legal party-wall datum.
- **Geometric blind edges (residential only).** `residentialBuildingOrchestrator.ts:485`
  `facadeEdgesFor`: an edge is a façade iff it lies on the **plate bbox**. The parcel's own
  street-vs-lindero identity is never consulted.

**The precise gap:** the residential path never reads `neighbourFootprintStore`, and no engine
reads `Parcel.edgeClassifications` (`packages/schemas/src/site/Parcel.ts:16`,
`'front'|'side'|'rear'` per edge — produced by `classifyBlockFrontages`, `blockRing.ts:765`,
and by every site-boundary author). That datum is consumed ONLY by the envelope compiler
(`insetPolygon.ts:380`, `buildingLineOffset.ts:211`) and then thrown away —
`SiteQueryService.getParcelBoundary()` (`packages/stores/src/SiteQueryService.ts:76`)
**returns the polygon and drops `edgeClassifications`**. So on a mid-block parcel the plate's
side edges — real medianeras, `sideTreatment:'party-wall'` in the rulepacks
(`esTeldePgo2003.ts:368`) — are treated as window-eligible façades, and worse, both
suppression mechanisms are **hard constraints only**: no objective term makes the optimizer
*avoid placing living rooms against* a blind wall, so when suppression does fire the room is
kept and merely loses its window.

### 2.3 Main street / South / patios not scored — the signals exist, the objectives don't read them

What exists vs what the optimizers consume (per-term inventory verified):

| Signal | Exists at | Consumed by any layout objective? |
|---|---|---|
| Per-wall compass + true-north θ | `FacadeOrientationService.ts:54/:79`, θ provider wired `initTools.ts:532` | **No.** Engines use only `isExterior`; θ never reaches any objective. Compass orientation is consumed solely by chat/batch scopes (`AIPanel.ts:1195`) |
| Street edge (`edgeClassifications:'front'`) | `Parcel.ts:16`; `classifyBlockFrontages` `blockRing.ts:765` | **No.** Envelope-only; zero references in `packages/ai-host` |
| Latitude / hemisphere | `SiteQueryService.getLocation():64` → `solarLatDeg` | **Weakly.** D-TGL axis 17 `solarOrientation` (`objectives.ts:838`, impl `envDrivers.ts:234`) is hemisphere-sign only (`equatorFacingDir`; null for \|lat\|<10) |
| Shell-edge sun value | `facadeValueField.ts:95-101/:188` | **Weakly + WRONG frame.** D-TGL axis 16 `facadeAlignment` (`objectives.ts:832/:1010`) uses `SUNLIGHT_BY_CARDINAL` with **hard-coded "+Z = North"** (`facadeValueField.ts:29`) — no true-north θ, no hemisphere. On a rotated or southern-hemisphere site the "south bonus" points somewhere arbitrary |
| Neighbour heights + provenance | `contextBuildings.ts:69/:554`, `SiteModel.ts:43` | **No** (viewport + one admin panel only) — no overshadowing/aspect term |
| Patio / courtyard | — | **Does not exist anywhere**: no room type, no objective, no validator ("patio door" is a window size) |

The residential plate partition has **zero** orientation content: `apartmentPacker.ts` ranks by
largest feasible N (`:209`); `platePartition.ts:1715-1738` scores candidates by the
lexicographic tuple (feasibleCount, cellCount, placedArea). The orchestrator's ground-floor
"street" façade is a scare-quoted geometric shortest-lobby heuristic
(`residentialBuildingOrchestrator.ts:509/:530-533`), not the classified front edge. The
residential brief mapper also drops latitude in the common path: `residentialFromBoundary.ts`
threads `siteLatitudeDeg` only if present in brief metadata, though
`SiteQueryService.getLocation()` always knows it after geocoding — so even the weak solar axis
is usually off for the multi-family path.

### 2.4 Big corridor waste — objective maximizes placed area, corridors are free

Mechanism, in `platePartition.ts` + orchestrator:

1. **Fixed pitch, no per-plate optimization.** Corridor centrelines are laid on
   `pitch = 2·MAX_APARTMENT_DEPTH_M + corridorWidth` = 19.5 m (`platePartition.ts:1038`,
   `MAX_APARTMENT_DEPTH_M = 9` at `:175`). Plate depths that are not near a pitch multiple
   produce shallow residual rows left empty by design (`:473-474`) — area that is neither
   apartment nor corridor.
2. **Full-width corridor bands + full-height spine.** Every corridor row runs the full plate
   width; the vertical spine at the core's X-centre is carved out of EVERY apartment row
   (`:1253-1272`), and stub bands get L-shaped connector legs (`:874-884`). None of this is
   trimmed back to what the served cells actually need.
3. **The objective never charges for corridor.** Candidate selection (`:1715-1738`) maximizes
   (feasibleCount, cellCount, placedArea) — corridor area appears in no term. A candidate that
   buys +2 m² of placed area with +40 m² of corridor wins. `fillRatio` (`:143`) is computed but
   **diagnostic-only**.
4. Contrast with prior art the codebase already owns: the D-TGL *intra-apartment* engine has
   `efficiency = 1 − corridorArea/totalArea` as objective axis 1 (`objectives.ts:445`), the
   house has stair waste-scoring, and the §CIRCULATION-GRAPH spec defines the topology gates —
   the inter-apartment partition simply predates all of them. §CORRIDOR-STAIR-CONTIGUITY and
   §RESI-CORE-CIRCULATION guarantee *connectivity*, not *economy*: `repairCoreCirculation`
   only ever ADDS corridor.

Quantified on the default brief (double-loaded, 1.5 m corridor): the geometric floor is
corridor ≈ 1.5/19.5 ≈ 7.7 % of plate + spine (1.5 m × plate depth) + connectors + un-tiled
residual rows; on small/awkward plates the realized non-apartment share routinely lands at
25-35 % of net (visible as `fillRatio` in §DIAG-RESI-FILL) where ~15 % is achievable.

---

## 3. Generation-time render-path waste (measured; proposals only — no code changed)

Per generation run (evidence agent-verified, file:line):

- **Graft path structurally unreachable during generation.** `initScene.ts:1141-1154` declines
  the incremental graft with `no-graft-ids` (:1143) for every generation sub-batch, because
  `ViewDependencyTracker._onStoreEvent` early-returns while `_batchSuppressed` (:562) and the
  batch-end `markLevelsDirtyImmediate` (:505-524) marks views `needingFullInvalidate` and
  **deletes** the per-element dirty set (:512). Every chained pass ⇒ full re-projection of all
  N elements in the active view.
- **Projection cache misses ~100 %.** Cache keys include `_renderVersion`
  (`WallFragmentBuilder.ts:253`); generation re-trims/re-joins walls each pass, bumping
  versions — the observed 0-3 % `§PERF-CACHE-STATS hitRate` is the documented consequence
  (`PLAN-GENERATIVE-DESIGN-SPRINTS.md:113-115`).
- **View fan-out.** Each sub-batch dirties 5-6 views (1 plan/level + 4 elevations
  unconditionally, `ViewDependencyTracker.ts:730-732`); the active-view gate (:788-815) makes
  1 (2 in split) project eagerly and defers the rest — but each deferred view still pays one
  full pass on first activation. Apartment chain = 5 passes × 5-6 views; house = ~4·S waves
  (per-storey chain, `runHousePostGenChain.ts`).
- **4 full Cesium/Forma massing rebuilds per chain.** `GISAreaLayout.ts:4046-4059` subscribes
  `liveUpdateFormaMassing` to all four `*.layout-executed` events; each call is a full
  clear + re-place reading every store (`:3004-3093`). 3 of 4 are redundant (comment at
  :4044-4045 accepts this).

**Proposed coalescing (P1, do not implement piecemeal):**
(a) hold `viewDependencyTracker.setSuppressed(true)` for the whole `beginBuildingGeneration`
lease and issue ONE `markLevelsDirtyImmediate` in `GenerationOverlayLease.release()`
(`buildingGenerationLifecycle.ts:197-242`, beside the existing single final room-redetect);
(b) gate `liveUpdateFormaMassing` on `__pryzmBuildingGenActive` so the four chained events
collapse to one re-place at lease release. Expected effect: 5 (or 4·S) full re-projection
waves → 1, and 4 massing rebuilds → 1, with zero behavior change outside generation (the lease
already brackets exactly the right interval, and non-generation batches keep today's path).

---

## 4. Prioritized gap list

| # | Gap | Evidence | Violates / mandated by | RAC U5b tie-in |
|---|---|---|---|---|
| **P0-1** ✅ | Zero-apartments empty building shipped silently | §2.1 | §CONTEXT-DATA-HONESTY; C50 §1.7 (soft-fail must surface); C11 §4.2 | U5b.4 "engine honesty relayed" — the aggregated reason string is exactly the chat-reply payload |
| **P0-2** | `maxHeightM` enforced by NO generator | `siteDispatch.ts:872`; inventory §5 | C58 (envelope compliance); L-616 class (overstating on real land) | U5b.3 verbatim |
| **P1-1** | Generation render-path waste: 5/4·S full re-projections + 4 Forma rebuilds per chain | §3 | C04 (rendering/scheduling), C10 (performance) | Chat generation inherits the same lease → same fix |
| **P1-2** | Partition objective blind to corridor cost; fillRatio diagnostic-only | §2.4 | C53 (objective must encode design quality); §CIRCULATION-GRAPH spec | Preview cards should quote fillRatio (honesty) |
| **P1-3** | `edgeClassifications` (street/side/rear) dropped before layout; residential ignores neighbour footprints; blind-wall avoidance is hard-constraint-only | §2.2 | C19 (site model), C57 (parcel data); SPEC-PARTY-WALL-AWARENESS (stale — update in place, no new AUDIT doc) | `GenerationRequest` adapter is the natural place to thread per-edge context |
| **P1-4** | `facadeValueField` hard-codes +Z=North & northern hemisphere; θ unused; residential brief drops latitude | §2.3 | C53; Project-North doctrine (memory: project-north-and-defect-separation) | U5b adapters should populate `solar` from `SiteQueryService.getLocation()` always |
| **P1-5** | §CHAIN-TIMEOUT is wall-clock from the apartment event, not causal | §1.4 | C16 §8 (batch contract), C11 §6 | Chat "one intent" chaining (R7) leans on this contract |
| **P2-1** | Apartment path bypasses `beginBuildingGeneration` (≥3 undo units) | inventory §4 | C16 §8.6 (one gesture = one undo) | U5b.2 verbatim |
| **P2-2** | Office engine consumes a circle, not the parcel polygon | §1.3 | C53; doctrine "mirror proven pipelines" | Office adapter should feed the real footprint |
| **P2-3** | Patio/courtyard concept absent; no overshadowing/neighbour-height term | §2.3 | C20 (building aggregates), C53 | Future brief field |
| **P2-4** | WorkflowRegistry covers only apartment; house/office/residential bypass cost ceiling | inventory §2 | C09/C23 (AI audit/provenance) | Register all four |

## 5. Phased improvement plan (founder-testable acceptance per phase)

**Phase A — Honesty (P0).** ✅ A.1 zero-apartments refusal (shipped, `8ab1fe92`).
A.2 `maxHeightM` gate in all three controllers before the modal: refuse with "N floors ×
h m = X m exceeds the permitted Y m here" and offer the max feasible floor count.
*Acceptance:* on a parcel with a cached envelope, request 20 floors → a refusal quoting both
numbers and a working "build K floors instead" path; on the all-rejected plate → the error
modal (never an empty building), reason visible.

**Phase B — Generation-time performance.** B.1 lease-scoped view-invalidation suppression +
one final `markLevelsDirtyImmediate` at release. B.2 gate `liveUpdateFormaMassing` on
`__pryzmBuildingGenActive` (one massing rebuild at release). B.3 make furnish/lighting chain
causal (fire on the ceiling batch's settle signal, keep 12 s only as a true backstop).
*Acceptance:* generate a 5-storey residential building with the console perf trace on —
exactly ONE `no-graft-ids` full projection wave and ONE Forma re-place after settle; wall-clock
generation time reduced (record before/after); no §CHAIN-TIMEOUT lines on a normal machine.

**Phase C — Corridor economy.** C.1 add corridor-area (and un-tiled-residual) terms to the
`platePartition` candidate score: maximize `placedArea − λ·corridorArea` with feasibleCount
precedence retained; C.2 trim corridor bands to the X-extent of served cells; C.3 vary pitch
per plate depth (search depth 7.5-9 m) and let best-of-candidates pick; C.4 surface `fillRatio`
on the preview card. *Acceptance:* on the founder's test parcels, fillRatio improves and is
visible in the modal; no plate that builds today refuses (side-core fallback semantics
unchanged); partition tests extended with a fillRatio-floor assertion.

**Phase D — Site-aware placement.** D.1 expose `getParcelEdgeClassifications()` +
`getNeighbourFootprints()` through `SiteQueryService`; D.2 orchestrator maps classified edges
through the rigid transform onto plate edges: `side`-edge cells get those edges as
`blindEdges`, entrance goes to the `front` edge (replacing the shortest-lobby heuristic);
D.3 fix `facadeValueField` to true-north θ + hemisphere (both providers already exist);
D.4 always thread `solar.latDeg` from `getLocation()`; D.5 add a soft objective term so
day-rooms prefer street/south façades and cells ringing blind party walls prefer bedrooms/wet
rooms (weights via the existing slider mapping); D.6 update SPEC-PARTY-WALL-AWARENESS in place
(it understates shipped state by a phase). *Acceptance:* on a mid-block Barcelona parcel,
living rooms front the street/south façade, no window is emitted on a lindero edge, the
entrance sits on the classified front edge; rotate the parcel 90° → the plan rotates with it.

**Phase E — RAC U5b alignment.** GenerationRequest union modeled on
`residentialRequestFromBrief`; extend `beginBuildingGeneration` to the apartment path; pipe the
Phase-A refusal strings + per-cell honesty into chat replies; register the three deterministic
generators in WorkflowRegistry. *Acceptance:* "build me a 5-storey residential building" in
chat produces either a building or a reasoned refusal — never silence — with one undo unit.
