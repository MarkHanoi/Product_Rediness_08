# PIPELINE: RAC → GIS → Scene → Apartment-from-Boundary (2026-06-03)

> Sequenced implementation plan for PRYZM's full onboarding→site→design journey.
> This is a **planning/architecture doc** — it does NOT contain feature code.
> It captures and orders the end-to-end user journey the founder wants, tied to
> what ALREADY exists in the repo, so it can be executed piece-by-piece.
>
> Status legend: ✅ exists · 🟡 partial/aspirational · ⚪ not built · 🔴 broken seam.

---

## §1 — The target journey

The founder's words:

> "After the RAC [onboarding chatbot], the user should go to a GIS interface —
> where the user will add the project location address, draw the boundary line —
> then will land in the main PRYZM scene canvas — where the rest will occur —
> and where we should be able to create the apartment layout (and later other
> typologies) from the 3D boundary lines."

The pipeline is four stages:

1. **RAC onboarding** — captures role · typology · brief; emits
   `pryzm:onboarding-brief-ready` on the runtime event bus. **(DONE.)**
2. **GIS interface** — address geocode + map + draw site-boundary polygon.
3. **Land in the main scene canvas** — with the boundary as a real **Site**
   element (C19 parcel boundary).
4. **Generate the apartment layout FROM the boundary polygon** (and later other
   typologies), instead of requiring a hand-drawn ≥3-wall shell to pre-exist.

The thesis: every stage's *substrate* already exists in the repo. What is missing
is the **handoff seams between stages** and one **GIS authoring UI**. This plan
sequences those seams.

---

## §2 — AS-IS audit (what actually exists, cited)

### 2.1 — C19 Site substrate / SiteStore — ✅ REAL, substantial

The A.7.a–A.7.d work shipped a genuine, layered C19 substrate.

- **L0 schemas** — `packages/schemas/src/site/`:
  - `SiteModel.ts:36` — canonical `SiteModelSchema` (one per project): `location`,
    `parcel`, `footprint`, `contextBuildings`, `climateRef`, `buildingRef`,
    `provenance`, `schemaVersion`.
  - `Parcel.ts:30` — `ParcelBoundarySchema` = **a closed polygon of XZ points**
    (`polygon: PtSchema[]`) + per-edge `edgeClassifications` (front/side/rear).
    `Parcel.ts:60` adds `setbacks`, `maxFAR`, `maxHeight`, `zoning`, computed `area`.
    **The boundary-polygon type the founder wants already exists here.**
  - `SiteLocation.ts:27` — `latitude`/`longitude`/`elevationAsl`/`trueNorth`/`crs`/
    `basePoint`(Vec3 scene origin)/`siteAddress`(PII)/`landTitleNumber`(PII).
- **L3 store** — `packages/stores/src/SiteModelStore.ts:44` — reactive, one per
  runtime, `getSite()`/`getParcelBoundary()`/`getFootprint()`/`getLocation()`,
  `set()`/`reset()`/`dispose()`. **Wired in composeRuntime** —
  `packages/runtime-composer/src/composeRuntime.ts:901` constructs it and exposes
  it as `runtime.siteModelStore` (`composeRuntime.ts:1460`; type at
  `runtime-composer/src/types.ts:3473`). Reset-on-project-switch is hooked.
- **L3 command handlers** — `packages/stores/src/site-commands/`:
  - `siteCreate.ts:48` — `site.create` (idempotent, deterministic
    `site_<projectId>` id, computes parcel area).
  - `siteSetParcelBoundary.ts:35` — `site.setParcelBoundary` — **one-shot polygon
    authoring** (`§1.4` immutability: REJECTS if polygon already non-empty; emits
    `site.parcel-boundary-set`). This is exactly the command the GIS draw tool will
    dispatch.
  - Plus `siteUpdateLocation`, `siteSetFootprint`, `siteUpdateZoning`,
    `siteAddContextBuilding`, `siteReplace`, `siteLinkClimate`, etc. (full set in
    the directory — A.7.c MVS ✅, A.7.c.2+ partial).
- **L2 validators** — `@pryzm/site-validators` (`polygonArea`,
  `checkEdgeClassifications`), used by the handlers as single source of truth.

**Tracker truth:** A.7.a ✅, A.7.b ✅, A.7.c.1 ✅ (MVS), A.7.c.2+ partial
(tracker lines 326–334).

**Verdict:** the Site domain model + store + create/setParcelBoundary commands are
PRODUCTION-REAL. The gap is purely the **L5 command-dispatch adapter** (route the
`site.*` pure handlers through the editor's commandBus + emit the domain events +
do the `LTPENURebase.setOrigin` on location-change) and the **UI that calls them**.

### 2.2 — Cesium / geospatial viewer — 🟡 EXISTS but legacy, not C19-aware

- **Viewer** — `apps/editor/src/ui/geospatial/CesiumViewport.ts:21` — a working
  Cesium `Viewer` with Google Photorealistic 3D Tiles (Ion asset 2275207),
  selection handler, transform gizmo, `loadBimGltf()` for placing a BIM GLB at
  lat/lon. Token via `VITE_CESIUM_TOKEN` (`CesiumViewport.ts:9`) with a legacy dev
  fallback.
- **Bridge** — `packages/renderer-three/src/geospatial/CesiumThreeBridge.ts` +
  `plugins/geospatial/` (descriptor + index) — Cesium↔Three anchoring.
- **GIS UI shell** — `apps/editor/src/ui/layout/GISAreaLayout.ts`,
  `apps/editor/src/ui/tools-panel/panels/GISRailPanel.ts` — an "Activate
  Geospatial" toggle, Fly-To, "Place BIM on Earth", gizmo controls, reset
  georeference (`GISRailPanel.ts:37`).
- **Geo primitives** — LTP-ENU coords + `ProjectLocation` + `IfcProjectedCRS` +
  C12 contract exist (per memory; C12 contract at
  `docs/02-decisions/contracts/C12-GEOSPATIAL.md`).

**What's MISSING vs the journey:** the Cesium viewer today is a **BIM-placement /
"put my model on Earth" tool** (`geocoder: false` is explicitly disabled at
`CesiumViewport.ts:67`). It is NOT a **site-authoring** surface. There is:
- ❌ no address search box (geocoder explicitly off),
- ❌ no polygon-draw tool feeding a Site,
- ❌ no `cream/warm-white` "Hektar" basemap aesthetic (A.8.b),
- ❌ no connection between the Cesium viewer and `runtime.siteModelStore`.

**Verdict:** the Cesium *plumbing* is real; the *site-authoring application* of it
is the unbuilt A.8 work.

### 2.3 — Address geocoding (A.8.a) — ⚪ DOES NOT EXIST

A full search for `geocod*` (case-insensitive) across non-doc source returns only:
- `CesiumViewport.ts:67` — `geocoder: false` (Cesium's built-in geocoder
  **disabled**),
- two doc-comment mentions of "ungeocoded" in `schemas/src/climate/types.ts:30`
  and `schemas/src/aggregates/Building.ts:10`.

No forward-geocode / address-search / Nominatim / Mapbox code exists anywhere.
**A.8.a is greenfield.** The tracker (line 339) specifies the intended design:
OSM Nominatim primary, Mapbox secondary → returns lat/lon + bbox → dispatches
`site.updateLocation`.

### 2.4 — Polygon / boundary draw tool (A.8.c) — 🟡 a REUSABLE analog exists; the site tool itself ⚪

- **`RoomBoundingLineTool`** — `packages/geometry-wall/src/RoomBoundingLineTool.ts:28`
  — a **two-click line** tool (start → end → `CreateRoomBoundingLineCommand`), with
  a level-elevation raycast plane and a dashed preview. It is registered at boot.
  **It draws single line segments, NOT a closed multi-vertex polygon** — so it is
  a *pattern reference* (preview mesh + raycast-to-ground-plane + command dispatch),
  not directly reusable for a parcel boundary.
- **`CreateWallsFromSlabCommand`** — `packages/command-registry/src/walls/CreateWallsFromSlabCommand.ts:12`
  — takes a slab's `polygon` (≥3 pts) and **emits perimeter walls** (one
  `CreateWallCommand` per edge). **This is the closest existing
  polygon→perimeter-walls capability in the repo** and is the key seam for stage 4
  (see §3.3).
- The **D-TGL** engine internally builds a closed polygon from walls via
  `wallsToPolygon()` (`packages/ai-host/src/workflows/apartmentLayout/shellAnalysis.ts:51`).

**Verdict:** no closed-polygon site-boundary draw tool exists; A.8.c is greenfield,
but the preview/raycast/command pattern (`RoomBoundingLineTool`) and the
polygon→walls emit (`CreateWallsFromSlabCommand`) are both reusable building blocks.

### 2.5 — Apartment-from-envelope — 🔴 the chain breaks at "shell must pre-exist"

The shipped apartment generator **requires a ≥3-wall shell to already exist** before
it will run:

- **Trigger** — `apps/editor/src/ui/apartment-layout/apartmentLayoutTrigger.ts:44-49`
  calls `gatherLayoutPayload(levelId)` and **bails** if
  `payload.shellWallIds.length < 3` ("Need at least 3 exterior walls on the active
  level").
- **Payload gather** — `apps/editor/src/ui/apartment-layout/gatherLayoutPayload.ts:43-49`
  reads `storeRegistry.getStoreForType('wall').getAll()`, filters to the level, and
  returns `null` when there are **no walls**. It derives the shell from **existing
  wall baselines + facade orientation**, not from any polygon.
- **Engine entry** — `packages/ai-host/src/workflows/apartmentLayout/generate.ts:164`
  `generateLayoutOptions(input, ...)` consumes a **`ShellAnalysis`** (`generate.ts:42`,
  type at `shellAnalysis.ts:32`: `netAreaM2`/`widthM`/`depthM`/`perimeter`/`faces`).
  The D-TGL deterministic engine (`generate.ts:213`,
  `tgl/runDeterministicLayout.ts`) ALSO takes that `ShellAnalysis`.

**Where the chain breaks today:** `boundary polygon → envelope → walls → layout`
has **no entry point**. The generator's narrowest input is `ShellAnalysis`, which
is derived FROM walls (`wallsToPolygon` is wall→polygon, the wrong direction). A
user with only a Site parcel boundary and zero walls hits the
`shellWallIds.length < 3` guard and is stopped.

**The cleanest seam** (detailed in §3.3): a parcel polygon can become a shell two
equivalent ways —
  (a) **polygon → perimeter walls** (reuse the `CreateWallsFromSlabCommand`
      pattern: emit one wall per boundary edge into the active level), THEN the
      existing trigger works unchanged; or
  (b) **polygon → `ShellAnalysis` directly** (a pure `polygonToShellAnalysis()`
      adapter feeding `generateLayoutOptions` without minting walls first).
Path (a) is the minimal-risk seam because it reuses the shipped trigger/executor
end-to-end; path (b) is the cleaner long-term seam for "generate then materialize".

### 2.6 — The typology-pipeline — ✅ HAS a site stage; apartment Pack consumes a snapshot

- **`@pryzm/typology-pipeline`** — 7-stage pipeline
  (`packages/typology-pipeline/src/types.ts:29`): `brief → site → constraints →
  generative → validators → cognition → bim-emit`. **Stage 2 is `site`.**
- The pipeline takes a **`SiteContextSnapshot`** (`types.ts:84`) carrying
  `siteId`, `centroid{lat,lon}`, **`parcelBoundary` (closed XZ polygon, empty =
  not authored → Stage 2 fails-soft, `types.ts:89-94`)**, `climate`, `address`.
  This is the explicit consumption point for a drawn Site boundary.
- The **apartment Pack** (`packages/typology-pack-apartment/src/stages/`) ships only
  `generative.ts` + `bimEmission.ts`; it does NOT override the `site` stage, so it
  uses the router's default site handler. Its generative stage
  (`generative.ts:20`) is currently a **BRIDGE** that delegates to the existing
  `@pryzm/ai-host` `apartment-layout-generate` workflow and forwards
  `site: input.site.snapshot` (`generative.ts:39`). So the Pack *already receives*
  the parcel boundary in its input — it just doesn't *use* it yet (the bridge
  defers to the wall-shell-based ai-host workflow).

**Verdict:** the pipeline's contract already routes a parcel boundary to the
apartment Pack. The unbuilt piece is making the apartment generative stage
**consume `site.snapshot.parcelBoundary` as the envelope** instead of relying on
pre-existing walls.

---

## §3 — Gap analysis (the missing seams between stages)

| # | Seam | From → To | State | What's missing |
|---|------|-----------|-------|----------------|
| G1 | **RAC → GIS handoff** | `pryzm:onboarding-brief-ready` → open GIS view | 🔴 | The event fires (`PlatformRouter.ts:368`) but is **only logged + surfaced**; nothing routes the user into a GIS/site-authoring view. The brief survives auth on `getCapturedBrief()` but there is no GIS surface to land in. |
| G2 | **Geocode → location** | address string → `site.updateLocation` | ⚪ | No geocoder at all (§2.3). Need A.8.a (Nominatim/Mapbox) → lat/lon/bbox → dispatch `site.updateLocation` + `LTPENURebase.setOrigin`. |
| G3 | **GIS boundary draw → Site element** | drawn polygon → `site.setParcelBoundary` | 🔴 | `site.setParcelBoundary` handler EXISTS (`siteSetParcelBoundary.ts:35`) and the store is wired, but there is **no L5 dispatch adapter** routing `site.*` through the commandBus, and **no polygon-draw UI** to author the polygon. |
| G4 | **GIS → scene canvas** | leave GIS, enter editor with Site live | 🟡 | `runtime.siteModelStore` is per-runtime and already populated by the handlers; the editor just needs to (a) render the parcel boundary in-scene and (b) be navigated-to after boundary-commit. No scene rendering of the parcel polygon exists yet. |
| G5 | **Site boundary → generation envelope** | `parcel.boundary.polygon` → `ShellAnalysis`/walls → layout | 🔴 | The generator demands a ≥3-wall shell (§2.5). Need either a `polygon→perimeter-walls` emit (reuse `CreateWallsFromSlabCommand` pattern) **or** a `polygonToShellAnalysis()` adapter into `generateLayoutOptions`. |
| G6 | **Climate/context auto-analyses** | boundary-commit → climate + ContextBuilding fetch | ⚪ | A.8.d — no auto-fire on `site.parcel-boundary-set`. C21 climate substrate exists; the trigger does not. (Non-blocking for the core journey.) |

The **three load-bearing seams** for the founder's journey are **G1** (RAC→GIS),
**G3** (boundary→Site), and **G5** (Site→generation). G2/G4/G6 make it *polished*;
G1/G3/G5 make it *work*.

---

## §4 — Sequenced sub-phases

Mapped to existing tracker IDs (A.7.* / A.8.a–f / A.5.g) plus one new sub-phase.
Each row notes: **deliverable**, the **seam it fills**, **dependency order**, and
**headless-buildable** (unit-testable in Node / no browser) vs **needs in-browser
verification**.

### Phase ordering (critical path bolded)

```
P0  site.* L5 dispatch adapter        (G3/G4 prerequisite)   headless-ish
 └─ P1  apartment-from-boundary engine seam   (G5)            HEADLESS  ← unblocks the demo
 └─ P2  RAC → site-bootstrap router           (G1)            in-browser
 └─ P3  GIS address geocode  (A.8.a)          (G2)            HEADLESS core + browser UI
 └─ P4  GIS polygon-draw tool (A.8.c)         (G3)            in-browser
 └─ P5  parcel-boundary scene render          (G4)            in-browser
     └─ P6  Cesium-light basemap (A.8.b)       polish         in-browser
     └─ P7  auto-site-analyses (A.8.d)         (G6)           HEADLESS core
     └─ P8  BuildingFootprint authoring (A.8.e)               in-browser
     └─ P9  Site Inspector panel (A.8.f)                      in-browser
```

### Detail

| Sub-phase | Tracker ID | Deliverable | Seam | Dep | Build mode |
|-----------|-----------|-------------|------|-----|-----------|
| **P0** | **A.7.c.x (new: L5 adapter)** | `site.*` command-dispatch adapter in `apps/editor` — routes `site.create` / `site.updateLocation` / `site.setParcelBoundary` through commandBus → `siteModelStore.set()`, emits domain events, performs `LTPENURebase.setOrigin` on location change. A console helper `pryzmCreateSiteFromRect(addr, w, d)` for testing. | G3, G4 | — | Mostly headless (handlers are pure); adapter wiring needs editor typecheck + 1 browser smoke. |
| **P1** | **NEW: A.5.g.3 "apartment-from-boundary"** (generalizes A.5.g.2) | A pure `polygonToShellAnalysis(polygon, opts)` adapter in `@pryzm/ai-host` + a `triggerApartmentLayoutFromBoundary(runtime)` path that (a) reads `runtime.siteModelStore.getParcelBoundary()`, (b) **either** emits perimeter walls via the `CreateWallsFromSlabCommand` pattern **then** calls the existing trigger, **or** feeds `ShellAnalysis` straight to `generateLayoutOptions`. | **G5** | P0 | **HEADLESS** — `polygonToShellAnalysis` + the envelope→layout path are Node-testable (D-TGL already is). Only the final wall-materialize needs a browser. |
| **P2** | **A.5.g.4 (RAC→site router)** | Subscribe to `pryzm:onboarding-brief-ready` (`PlatformRouter.ts:368`); on receipt, create a project, auto-`site.create` (empty parcel), and route the user into the GIS view (or, pre-GIS, straight into the scene with a stub rectangle so the journey is observable). | **G1** | P0 | In-browser (routing/auth/project-create). |
| **P3** | **A.8.a** | Address geocode service (`@pryzm/geocode` or editor util): OSM Nominatim primary + Mapbox secondary → `{lat,lon,bbox}`; a search box in the GIS view; dispatches `site.updateLocation`. PII per C22. | G2 | P0 | Geocode core HEADLESS (mock HTTP); search-box UI in-browser. |
| **P4** | **A.8.c** | Closed-polygon draw tool (vertex-click → dbl-click close → drag-edit → undo-per-vertex; warn >30, refuse >200 vertices per C19 §1.4). On commit: `LTPENURebase.projectToScene` → dispatch `site.setParcelBoundary`. Reuse the `RoomBoundingLineTool` preview/raycast pattern (`RoomBoundingLineTool.ts:28`). | **G3** | P0, (P3 for georef) | In-browser (interactive draw). Polygon math (close/area/validate) HEADLESS. |
| **P5** | **A.8.x (scene render)** | Render the committed parcel boundary as an in-scene element (line loop / poché) in the editor canvas, subscribed to `siteModelStore`. | G4 | P0 | In-browser (renderer). |
| **P6** | **A.8.b** | Cream/warm-white "Hektar" Cesium basemap + zoom-to-bbox on address commit. Flip `CesiumViewport` from BIM-placement-mode to site-authoring-mode (or a second viewport profile). | polish | P3 | In-browser. |
| **P7** | **A.8.d** | Auto-fire on `site.parcel-boundary-set`: climate ingest (C21 EPW/NOAA for centroid) + ContextBuilding snapshot (OSM/MSFT footprints). Async, non-blocking. | G6 | P0, P4 | Ingest core HEADLESS; status surfacing in-browser. |
| **P8** | **A.8.e** | BuildingFootprint draw tool inside the parcel + containment/setback lint (C19 §1.6). Second polygon tool atop P4. | — | P4 | In-browser. |
| **P9** | **A.8.f** | Site Inspector read-only panel: lat/lon, true-north, CRS, parcel area, FAR, setback compliance, climate summary, ContextBuilding count. | — | P0, P7 | In-browser. |

**Why P1 is sequenced first after P0:** it is the only fully-headless seam on the
critical path and it unblocks the entire demo (§5) — once the engine accepts a
boundary polygon, the rest of the GIS UI can be stubbed and the founder still sees
RAC→(stub)→scene→apartment work end to end.

---

## §5 — The minimal vertical slice (shortest demoable path)

**Goal:** the founder sees the WHOLE journey work — RAC → "GIS" → scene →
apartment-from-boundary — **before any polished GIS UI exists**. GIS may be a stub
(typed address + a default rectangle).

**Slice = P0 (adapter) + P1 (engine seam) + a thin P2 (router) with a stubbed GIS.**

Concretely, the smallest end-to-end path:

1. **RAC** already emits `pryzm:onboarding-brief-ready` (`PlatformRouter.ts:368`) —
   **no work.**
2. **P0** — ship the `site.*` L5 dispatch adapter + a console helper
   `pryzmCreateSiteFromRect(address, widthM, depthM)` that:
   `site.create` → (optional) `site.updateLocation` with a hard-coded lat/lon →
   `site.setParcelBoundary` with a rectangle polygon. (No geocoder needed yet — a
   stub address maps to a fixed lat/lon.) **Headless-testable.**
3. **P2 (thin)** — on `pryzm:onboarding-brief-ready`, create a project, call the P0
   helper with a **default rectangle** (e.g. 12 m × 9 m), and drop the user into the
   scene canvas. The "GIS interface" is, for the slice, a single prompt for an
   address string + W×D (or just defaults). **One browser smoke.**
4. **P1** — `triggerApartmentLayoutFromBoundary(runtime)`:
   reads `siteModelStore.getParcelBoundary()` → materializes perimeter walls via the
   `CreateWallsFromSlabCommand` pattern into the active level → calls the **existing**
   `triggerApartmentLayout` (which now finds ≥3 walls and runs the shipped D-TGL +
   modal + executor path unchanged). **Engine portion headless; the wall-materialize +
   modal need one browser run.**

**Demo script:** finish RAC → land in scene with a rectangle parcel + auto-built
perimeter walls → apartment-layout modal opens → pick an option → rooms/doors
appear. That proves the founder's full pipeline with the GIS step stubbed; A.8.a–f
then progressively replace the rectangle stub with real geocode + draw + basemap.

**Risk note:** path (a) (materialize walls first) reuses the entire shipped trigger/
executor/undo chain, so the slice rides proven code. Path (b) (`polygonToShellAnalysis`
direct) is cleaner but re-treads the executor's wall-emit; defer it to a P1 follow-up.

---

## §6 — Contract touchpoints

| Contract | Role in this pipeline | Action |
|----------|----------------------|--------|
| **C19 — Site Model & Parcel** (`docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md`) | The spine. §1.4 parcel-polygon immutability, §2.7 cross-schema invariants, §4 commands, §5 authoring UI (A.8). | **Extend §4/§5:** add the **L5 dispatch-adapter** clause (how `site.*` pure handlers reach the commandBus + emit events + drive `LTPENURebase.setOrigin`) — currently described as "the L5 adapter's responsibility" (A.7.c.1 tracker line) but not contracted. Add a **§ "Site→generation envelope"** clause naming the boundary-polygon→shell seam (G5). |
| **C50 — Typology Pipeline** (`C50-TYPOLOGY-PIPELINE.md`) | Stage 2 `site` consumes `SiteContextSnapshot.parcelBoundary`. The apartment Pack receives it (`generative.ts:39`) but ignores it. | **Add a clause:** the apartment Pack's generative stage MUST treat a non-empty `site.snapshot.parcelBoundary` as the generation envelope (the G5 contract at the pipeline level), defining precedence between "drawn boundary" and "pre-existing walls". |
| **C12 — Geospatial** (`C12-GEOSPATIAL.md`) | LTP-ENU, `LTPENURebase`, true-north, CRS. | **No new clause needed**, but P0/P4 must cite C12 for the `setOrigin` (on location-change) + `projectToScene` (on boundary-commit) calls. Confirm the rebase order: origin set BEFORE `site.location-changed` emits (per `SiteLocation.ts:18` doc). |
| **C21 — Climate Ingestion** (`C21-CLIMATE-INGESTION.md`) | P7 auto-analyses (climate fetch for boundary centroid). | **No new clause**; P7 wires the existing C21 path to the `site.parcel-boundary-set` event. |
| **C22 — Privacy & PII** | `siteAddress` + `landTitleNumber` are PII (`SiteLocation.ts:36`). | P3 geocode must honor the PII tier when storing the typed address. |
| **C18** | (`C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md` — the C18 in-repo is the *preview-visual* contract, NOT a "Site" contract.) The strategy docs reference a future "C18 Site" — **that is aspirational / mis-numbered.** | **Flag:** the real Site contract is **C19**, not C18. The brief's "C18 Site" reference does not match the repo. No action beyond noting the contract is C19. |

---

## Appendix — AS-IS one-liners (for the tracker integrator)

- C19 site schemas + SiteModelStore + create/setParcelBoundary commands: **REAL,
  wired into composeRuntime** (`runtime.siteModelStore`).
- Cesium viewer: **REAL but BIM-placement-mode**, geocoder explicitly disabled, not
  Site-aware.
- Geocoding: **does not exist** (A.8.a greenfield).
- Polygon draw: **no closed-polygon site tool**; `RoomBoundingLineTool` (line) +
  `CreateWallsFromSlabCommand` (polygon→walls) are reusable building blocks.
- Apartment generator: **requires a ≥3-wall shell** — the boundary→envelope seam is
  the single biggest blocker (G5).
- Typology pipeline: **Stage 2 `site` exists** and already routes `parcelBoundary`
  to the apartment Pack, which currently ignores it (bridge stub).
