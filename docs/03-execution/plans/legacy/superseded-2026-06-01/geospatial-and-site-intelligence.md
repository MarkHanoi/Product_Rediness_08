# PRYZM — Geospatial Foundation & Site Intelligence Review (APARTMENT-CONSUMER SCOPE)

> **⚠️ Scope note (2026-05-30 follow-up):** This doc is scoped to the **apartment-generation consumer** of a future platform-level geospatial substrate. The platform-level review is the authoritative parent: [PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW.md](PRYZM03-GEOSPATIAL-FOUNDATION-REVIEW.md). Read the platform doc first to understand the strategic option choice (A optional / B first-class subsystem / C foundational layer); this doc covers the apartment-specific implications under the recommended Option B.

Status: **Strategy document, 2026-05-30.** Architecture review only — NOT an implementation plan, NOT a greenfield rewrite. The repository already has a non-trivial geospatial substrate (Cesium bridge, LTP-ENU coordinate handling, ProjectLocation schema, NOAA solar service); this doc maps what exists, identifies the architectural gap (site-as-metadata vs site-as-design-driver), and proposes a phased migration that builds ON the existing substrate.

Sibling strategy docs (read these first):

- [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) — LIVE-EDIT axis (data-model maturity BIM 1 → 2 → 3)
- [APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md](APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md) — WHAT-KINDS axis (user-defined families + 8-stage pipeline)
- [APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md) — SOLVER-INTELLIGENCE axis (Layer 0 Environmental → Layer 7 Typology)
- [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md) — master ordered tier table

Governing C-contracts (binding):

- [C12 Geospatial](../02-decisions/contracts/C12-GEOSPATIAL.md) — LTP-ENU rebasing, IfcProjectedCRS round-trip
- [C03 Schemas, Commands & State](../02-decisions/contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md) — P5 schema purity, P6 commands-as-mutation
- [C11 Element Creation Pipeline](../02-decisions/contracts/C11-ELEMENT-CREATION-PIPELINE.md) — polymorphic create pipeline
- [C09 AI & Visibility Intent](../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) — workflow shape

---

## §0 — Why this doc exists

**The architectural question.** Today's apartment generation is BUILDING-CENTRIC:

```
Program → Layout → Rooms → Furniture → Lighting
```

Real architectural practice is SITE-CENTRIC:

```
Site → Climate → Orientation → Solar → Topography → Access → Program → Building → Layout → Rooms
```

Without an explicit site/climate substrate, every downstream system encodes *implicit* assumptions about the missing context:

- Facade scoring assumes "south is best" (true at mid-latitude; wrong in southern hemisphere; wrong at extreme latitudes)
- Daylight depth is generic 7 m (true at temperate sun-angles; wrong at high-sun tropics or low-sun arctic)
- Window placement is room-program-driven (no overshadowing from neighbours, no wind, no street noise)
- Lighting auto-fires the same fixtures regardless of orientation (south-facing room needs less artificial daylight)

These are not BUGS today — the apartment generator is correctly scoped to "design a fictional apartment in a fictional context." But they become BLOCKERS the moment a user wants to:

- Design a real apartment in a real city (overshadowing matters)
- Make energy/cost claims (climate matters)
- Output IFC for a real project (georeferencing matters)
- Stack apartments into a real building (massing matters)
- Operate the building (digital-twin matters)

This doc proposes that the **site / climate / context layer becomes a NEW foundational substrate beneath the existing apartment layer**, parallel to (not blocking) ongoing apartment-generation work. F-tier work continues; each next F-tier ship lands inside a richer environmental context as the substrate matures.

---

## §1 — Current-state audit (Surface 1–12)

Comprehensive audit completed 2026-05-30 across 12 surfaces. Bottom line: **the plumbing exists; the design workflow does not.**

### What's already there

| Surface | Status | Key evidence |
|---|---|---|
| **Cesium integration** | ✅ Visualization layer live | [`plugins/geospatial/src/CesiumThreeBridge.ts`](../../plugins/geospatial/src/CesiumThreeBridge.ts) bridges Cesium globe + Three.js BIM. [`apps/editor/src/ui/geospatial/CesiumViewport.ts`](../../apps/editor/src/ui/geospatial/CesiumViewport.ts) instantiates viewer; Cesium ion token via `VITE_CESIUM_TOKEN`. Plugin descriptor at [`plugins/geospatial/src/descriptor.ts`](../../plugins/geospatial/src/descriptor.ts) declares CRS picker, terrain toggle, `site.link` gestures — **commands declared, handlers pending** |
| **Coordinates / CRS** | ✅ Foundation established | [`packages/schemas/src/elements/Project.ts`](../../packages/schemas/src/elements/Project.ts) — `ProjectLocation { latitude, longitude, elevationAsl, trueNorth, basePoint }`. [`packages/geospatial/src/GeospatialAdapter.ts`](../../packages/geospatial/src/GeospatialAdapter.ts) + [`LTPENURebase.ts`](../../packages/geospatial/src/LTPENURebase.ts) handle WGS84 ↔ scene with 1 km recentre, Proj4-driven |
| **True North** | ✅ Schema present (radians) | `ProjectLocation.trueNorth` + Cardinal compass `N=+Z` in [`facadeValueField.ts`](../../packages/ai-host/src/workflows/apartmentLayout/environment/facadeValueField.ts) |
| **Solar (sun path)** | ✅ Read-only computation | [`packages/core-app-model/src/rendering/RealSunService.ts`](../../packages/core-app-model/src/rendering/RealSunService.ts) — NOAA solar position algorithm (altitude + azimuth from lat/lon/date). Drives viewport shading |
| **Daylight depth** | ✅ Shipped (L1-α-2) | [`environment/daylightDepthField.ts`](../../packages/ai-host/src/workflows/apartmentLayout/environment/daylightDepthField.ts) — BRE / BS 8206-2 7 m linear-attenuation model |
| **Facade value** | ✅ Shipped (L1-α-1/3) | [`environment/facadeValueField.ts`](../../packages/ai-host/src/workflows/apartmentLayout/environment/facadeValueField.ts) — sun-weighted per-edge value field |
| **IFC georeferencing** | ✅ Partial round-trip | [`plugins/ifc-import/src/IfcProjectedCRSReader.ts`](../../plugins/ifc-import/src/IfcProjectedCRSReader.ts) reads `IfcProjectedCRS` + `IfcMapConversion`; [`plugins/ifc-export/src/hierarchy.ts`](../../plugins/ifc-export/src/hierarchy.ts) writes them (IFC4X3 Wave A17) |
| **IFC IfcSite** | 🟨 Placeholder | [`packages/file-format/src/export/ifc/IfcSpatialStructure.ts`](../../packages/file-format/src/export/ifc/IfcSpatialStructure.ts) emits `IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey` but IfcSite attributes (latLon, refElevation, siteAddress) **NOT populated** — PRYZM has no corresponding Site data model |
| **C12 Geospatial contract** | ✅ Exists, narrow scope | [`docs/02-decisions/contracts/C12-GEOSPATIAL.md`](../02-decisions/contracts/C12-GEOSPATIAL.md) — LTP-ENU rebasing rules + IFC CRS round-trip. No site / climate / parcel concepts |

### What's missing

| Surface | Status |
|---|---|
| **Site / parcel as first-class element** | ❌ — no `Site` schema in `packages/schemas/src/elements/`; no parcel boundary representation; no site authoring UI |
| **Climate ingestion** | ❌ — no weather API, no historical climate tables, no EPW/IWEC reader |
| **Wind / acoustic context** | ❌ — facade scoring doesn't consider prevailing wind, road noise, or neighbour overshadowing |
| **Terrain ingestion** | ❌ — Cesium can fetch terrain tiles but no DEM/DTM pipeline; no slope analysis; no stepped-section adaptation |
| **GIS layer import** | ❌ — no GeoJSON / Shapefile / KML / OSM ingestion; only IFC CRS metadata round-trip |
| **Building as aggregate** | ❌ — Project → Level → Room is the spine; no intermediate Building (single tower) or Site (multi-building campus) layer |
| **Site-driven AI workflows** | ❌ — apartment-layout AI takes a `ShellAnalysis` polygon; doesn't know lat/lon, season, neighbours |
| **Geospatial plugin runtime** | 🟨 — descriptor + manifest exist; handlers for `site.link`, `terrain.enable`, `crs.set` are stubbed |

**The substrate is RIPE.** The plumbing (Cesium, LTP-ENU, CRS, true north, sun service) exists. What's missing is (a) a Site data model, (b) climate ingestion, (c) the workflow inversion that puts site decisions BEFORE program decisions.

---

## §2 — The architectural gap, named

```
TODAY                                  TARGET
─────                                  ──────
Program (apartment brief)              Site (location + parcel + survey)
   ↓                                      ↓
ShellAnalysis (polygon)                Climate (solar / wind / temperature / rain)
   ↓                                      ↓
D-TGL layout                           Context (neighbours / overshadowing / view / noise)
   ↓                                      ↓
Rooms                                  Topography (terrain / slope / orientation)
   ↓                                      ↓
Furniture                              Access (entry / streets / parking)
   ↓                                      ↓
Lighting                               Program (now site-aware)
                                          ↓
                                       Building Massing (within parcel envelope)
                                          ↓
                                       Floorplates / Levels
                                          ↓
                                       Apartment layout (now climate-aware)
                                          ↓
                                       Rooms (orientation-driven placement)
                                          ↓
                                       Furniture (daylight-aware)
                                          ↓
                                       Lighting (sun-path-aware scenes)
                                          ↓
                                       BIM 2.0 / 3.0 / Digital twin
```

The shift is NOT "throw out today's workflow." It is "add layers ABOVE the existing one so today's workflow becomes a SUB-PROCEDURE of a richer one."

---

## §3 — Composition with the three existing strategy axes

This doc opens a **third strategy axis** alongside the two already documented. They COMPOSE; they don't compete.

| Axis | Doc | Concerned with | Substrate |
|---|---|---|---|
| **WHERE-IT-LIVES** (this doc) | `PRYZM-GEOSPATIAL-FOUNDATION...` | Site → Climate → Context → Building | `SiteModel` + `EnvironmentField` (NEW) |
| **WHAT-KINDS-EXIST** | `APARTMENT-FAMILY-PLATFORM...` | User-defined family registry | `FamilyRegistry` (NEW) |
| **WHAT-YOU-CAN-EDIT** | `APARTMENT-BIM2-BIM3...` | Live parameter editing | `L0 Data Graph` (NEW) |

All three converge in BIM 3.0: a building where the **site context** (where) declares **available family families** (what) and **every placed instance** is **live-editable** (edit). Today's apartment generator is the first vertical slice; each axis matures it horizontally.

---

## §4 — Proposed hierarchy (refines today's spine)

Current spine:

```
Project → Level → Room/Element
```

Proposed spine (additive — Project stays, gains a Site aggregate; Building becomes explicit):

```
Project
  ↓
Site                          ← NEW: parcel + location + climate + context
  ↓
Building                      ← NEW: explicit aggregate (today implicit in Project)
  ↓
Floor / Level                 ← existing
  ↓
Apartment                     ← NEW: explicit aggregate (today implicit in room-set)
  ↓
Room                          ← existing
  ↓
Activity Zone                 ← future (cognition stack Layer 5/6)
  ↓
Element (furniture / opening / wall / …)  ← existing
```

**Status quo preserved.** A Project today implicitly has ONE Site, ONE Building, ONE Apartment per Level — all default-promoted when the substrate ships. Existing snapshots load unchanged; the loader auto-creates a default Site/Building/Apartment for legacy projects.

**Multi-building projects unblocked.** Today the schema can't represent two towers on one parcel. Tomorrow it can.

---

## §5 — The Site model (proposed L0 data shape)

```ts
interface SiteModel {
  id: SiteId
  name: string

  // ── Geolocation (already present on ProjectLocation; promoted here) ────────
  location: {
    latitude: number      // °, WGS84
    longitude: number
    elevationAsl: number  // m
    crs: string           // EPSG / Proj4 (defaults to local UTM zone)
    trueNorth: number     // radians; rotation about world Y
  }

  // ── Parcel boundary (NEW) ──────────────────────────────────────────────────
  boundary: {
    polygon: Pt[]              // world-XZ closed loop, metres
    setbacks?: { front, side, rear: number }  // metres
    maxFAR?: number            // floor-area ratio cap
    maxHeight?: number         // metres
  }

  // ── Climate (NEW — populated by Stage-2 ingestion) ─────────────────────────
  climate: {
    koppenZone?: string        // 'Cfb', 'Csa', …
    annualSolarKWhPerM2?: number
    annualMeanTempC?: number
    annualPrecipMm?: number
    heatingDegreeDays?: number
    coolingDegreeDays?: number
    prevailingWind?: { directionDeg: number; meanSpeedMs: number }
    epwFileRef?: string        // optional EnergyPlus Weather file
  }

  // ── Context (NEW — populated by Stage-2 ingestion) ─────────────────────────
  context: {
    neighbours?: NeighbourBuilding[]   // overshadowing volumes
    streets?: StreetSegment[]           // noise / access
    waterBodies?: Polygon[]             // view / cooling effect
    greenSpaces?: Polygon[]             // view / biodiversity
  }

  // ── Topography (NEW — Stage-3 ingestion) ───────────────────────────────────
  terrain?: {
    demRef?: string           // tile reference (Cesium ion / local DEM)
    slopeMap?: GridSample[]
    accessElevations?: { entry: number; rear: number }
  }
}
```

**Backward compat.** `ProjectLocation` (today's field) becomes a derivation of `site.location` — a getter at the project surface for legacy callers. Existing loaders work unchanged; the migration runs at load-time to promote `ProjectLocation` → default `Site`.

---

## §6 — Environmental fields (extends the cognition L1)

The existing `FacadeValueField` + `DaylightDepthField` (L1-α-1/2) are CONTEXT-FREE today — they score shell edges with a hardcoded "south is best" rule. With a Site model, they become CONTEXT-AWARE:

```
FacadeValueField(shellPolygon)                      // today
  ↓
FacadeValueField(shellPolygon, site)                // tomorrow
  ↓ where site provides:
      sun-path table → real per-edge solar quality
      neighbours → overshadowing mask
      streets → noise penalty
      green-spaces → view bonus
```

**Migration is purely additive.** The current `(shellPolygon)` overload stays — site-less tests keep working. A new `(shellPolygon, site)` overload returns richer edge data. Callers can adopt the new overload incrementally.

Same pattern for `DaylightDepthField`: today's 7 m attenuation becomes lat-aware (BRE 7 m is mid-latitude; tropics need different cap; arctic needs more).

---

## §7 — Cesium architecture — proposed role

Today Cesium is a **visualization layer** (CesiumThreeBridge.ts paints the BIM scene on top of the Cesium globe). The strategic question is whether Cesium should become the **AUTHORITATIVE geospatial foundation** — i.e. parcels, neighbours, terrain are sourced from Cesium-served data tiles, not from PRYZM-internal stores.

**Recommendation: split the role.**

| Role | Owner | Why |
|---|---|---|
| **Authoring** (creating site boundary, manual neighbour entry, design-time edits) | PRYZM stores (Site model, L0 substrate) | P6 commands-only mutation; CRDT replication; undo |
| **Visualization** (terrain tiles, satellite imagery, neighbouring 3D buildings, sun shading) | Cesium ion (read-only) | World-tile coverage; Cesium owns map data |
| **Ingestion** (one-shot pull from Cesium → PRYZM Site) | Cesium SDK + custom adapter | Convert tile data to PRYZM Site model snapshot |

The third row is the new infrastructure: a "snapshot site from Cesium location" command that converts what the Cesium viewer is showing (terrain, neighbours, parcel boundary if available) into the PRYZM `SiteModel`. That model is then the authoritative source; Cesium can update its tiles without invalidating PRYZM data.

This split respects C12 (Geospatial contract) and matches the BIM 3.0 paradigm: data is authored locally and references external sources by URI, not by live tile fetch.

---

## §8 — Lighting / window / facade implications

The cognition stack Layer 1 (Environmental Intelligence) is ALREADY designed to be site-aware in principle — its field functions (`facadeValueField`, `daylightDepthField`) are pure inputs that today happen to be called with a site-less polygon. Wiring site context in is a parameter extension, not a redesign.

**Lighting.** Today the lighting engine fires the same fixtures regardless of facade orientation. With site context:

- Auto-scale daylight contribution by facade quality (south-facing rooms get less artificial light by default)
- Seasonal scenes (winter scenes need more artificial supplement than summer)
- Latitude-aware fixture catalogues (high-latitude needs more circadian-tuned LEDs)

**Windows.** Today `windowMandatory` is per-room-type. With site context:

- Window AREA scaled by facade solar quality (poor edges get larger glazing to compensate)
- Window TYPE chosen by climate (triple-glazing on cold-climate north edges, low-e on hot-climate south)
- OPENING configuration considers cross-ventilation along prevailing-wind axis
- SILL HEIGHT considers neighbour overshadowing (raised sill where ground-floor privacy is poor)

**Facade.** The facade-value field already exists; site context UPGRADES its inputs without changing its consumers. L1-α-1/3 work is preserved verbatim.

---

## §9 — Adjacency / layout / hierarchy implications

The cognition stack Layer 3 (Semantic Topology) — the L3-γ EdgeType + edgeRealisation work shipped this session — adds a per-edge SEMANTIC kind to bubble-graph edges. Site context adds per-room SEMANTIC anchors:

- Living rooms → high-value facade (south + view)
- Bedrooms → quiet-side facade (away from street noise)
- Utility → low-value facade or interior
- Kitchen → near service access + ventilation-friendly orientation

These are **scoring biases**, not hard rules — the existing `adjacencyPreference` weights in `programRules.ts` get a SECOND dimension (facade-edge preference per room type). The optimisation engine consumes both.

---

## §10 — BIM 2.0 / BIM 3.0 implications

Site context is a **prerequisite** for several BIM 3.0 goals:

| BIM goal | Requires site | Why |
|---|---|---|
| Energy analysis | ✅ | Climate / orientation drive heating/cooling loads |
| Daylight simulation | ✅ | Sun path + neighbour overshadowing |
| Schedules (cost / quantities) | 🟨 | Already works without site; site enables regional cost lookups |
| Operational data / digital twin | ✅ | Real building = real location |
| Material specification by climate | ✅ | Hot/cold/wet climate → different envelope |
| Code compliance (Building Regs) | ✅ | Codes are region-specific |

Without site context, every BIM 3.0 claim ("this design uses 30 % less energy") is a fictional benchmark. With site context, the claim is project-specific.

---

## §11 — Risks

1. **Scope creep.** Site intelligence touches every downstream system. Without strict phase gates, the work becomes a rewrite.
2. **Climate data licensing.** EPW, NOAA, ECMWF data have license restrictions. Need to vet upstream sources.
3. **Cesium pricing.** Cesium ion charges per session above free tier. At scale, costs become material.
4. **CRS edge cases.** Anti-meridian, polar regions, datum shifts (e.g. NAD27 → NAD83) — every CRS library has gotchas; Proj4 is well-tested but the integration is exposure.
5. **Locale neutrality.** Today's facade scoring assumes northern hemisphere. Southern-hemisphere site auto-detection must flip the south-is-best rule.
6. **Privacy.** A project's real location is sensitive. Storage + replication of `Site.location` may need finer permission gating than current Project metadata.
7. **Backward compat.** Legacy projects (no site) must keep working. Loader-time promotion to a "default Site" must be deterministic.

---

## §12 — Gap analysis (audit-vs-target)

| Layer | Today | Target | Gap |
|---|---|---|---|
| Coordinates | ✅ ProjectLocation + LTP-ENU | Same | none |
| Cesium viewer | ✅ Visualization | Same + ingestion adapter | ingestion adapter |
| Site model | ❌ | `SiteModel` L0 schema | NEW schema |
| Site authoring UI | ❌ | Site-design surface in editor | NEW L5 surface |
| Climate ingestion | ❌ | EPW / NOAA / IWEC reader | NEW package |
| Terrain ingestion | ❌ | DEM tile pipeline | NEW package |
| Neighbour ingestion | ❌ | OSM / Cesium 3D Tiles → PRYZM Context | NEW adapter |
| Facade field site-aware | 🟨 today edge-only | (shellPolygon, site) overload | parameter extension |
| Daylight field site-aware | 🟨 7m constant | lat-aware band | parameter extension |
| Building aggregate | ❌ implicit | Explicit Building element | NEW schema |
| Apartment aggregate | ❌ implicit | Explicit Apartment element | NEW schema |
| IfcSite population | 🟨 placeholder | Full attributes (latLon, refElevation, address) | wiring |
| Site-driven AI workflow | ❌ | Phase A → B with site context | C09 §3.4 extension |
| C12 Geospatial contract | 🟨 narrow | Extended for site / climate / context | C12 revision |

---

## §13 — Recommended architecture

### Strategic phase

Insert a new top-level phase **GS0** (GeoSpatial 0) parallel to P0 (Family Platform). Both run alongside F-tier; both inform the data substrate that future apartment work depends on.

```
F-tier    ←──── continues each session (visible quality wins)
P0        ←──── runs in parallel (WHAT-KINDS substrate)
GS0       ←──── runs in parallel (WHERE-IT-LIVES substrate)  ← NEW
BIM 2/3   ←──── runs in parallel (WHAT-EDITABLE substrate)
```

Each strategic phase converges into a richer L0 substrate; F-tier work continues to ship contract-complete renderable types that benefit from each substrate as it matures.

### GS0 deliverables

| ID | Deliverable | Est | Phase |
|---|---|---|---|
| **GS0.1** | Site / Building / Apartment schemas (L0 schemas, P5 pure); legacy-promotion loader | 2 wk | Foundation |
| **GS0.2** | `SiteModel` runtime store + `site.*` commands (site.create, site.updateBoundary, site.linkLocation) — C16-compliant | 1 wk | Foundation |
| **GS0.3** | Cesium ingestion adapter — pull terrain + neighbours from Cesium tiles into PRYZM Site context | 3 wk | Ingestion |
| **GS0.4** | Climate data ingestion — EPW reader + NOAA climate normals API + caching layer | 2 wk | Ingestion |
| **GS0.5** | Site-aware FacadeValueField + DaylightDepthField — `(shellPolygon, site)` overloads with real sun path + overshadowing | 2 wk | Engine |
| **GS0.6** | Site authoring UI — Cesium-backed parcel drawing + location picker + neighbour curation panel | 4 wk | UI |
| **GS0.7** | Climate-aware lighting / window / facade decisions in apartment AI workflow | 3 wk | AI |
| **GS0.8** | Full IfcSite + IfcMapConversion round-trip with Site model populated | 1 wk | IFC |
| **GS0.9** | C12 contract revision + new C18 Site contract + new C19 Climate contract | 1 wk | Docs |

**GS0 total: ~19 dev-weeks.** Smaller than P0 (~28 wk) because the geospatial plumbing already exists; this is mostly *adding semantic layers on top*.

### Sequencing principle

- **GS0.1 + GS0.2** unblock everything else (the substrate). 3 weeks gets `SiteModel` storable + commandable.
- **GS0.3 + GS0.4** can ship in either order; both feed GS0.5.
- **GS0.5** is when existing apartment generation starts BENEFITING (richer facade scoring without changing the workflow).
- **GS0.6** is the user-visible win (drawing a parcel on a Cesium map).
- **GS0.7** is the design-quality jump (climate-aware decisions).
- **GS0.8 + GS0.9** are housekeeping but unlock real-project IFC export.

---

## §14 — New / extended contracts

Site intelligence needs explicit contractual boundaries:

| Contract | Status | Scope |
|---|---|---|
| **C12 Geospatial** | EXTEND | Add Site / Building / Apartment lifecycle; CRS authoring; site.* command surface |
| **C18 Site (NEW)** | CREATE | Site element schema, parcel boundary, setbacks, FAR caps; UI surface contract |
| **C19 Environment & Climate (NEW)** | CREATE | Climate data ingestion sources, license requirements, EPW / NOAA / IWEC schemas |
| **C20 Building / Floor / Apartment aggregate (NEW)** | CREATE | Hierarchy contracts; legacy promotion rules; multi-building cases |
| **C09 §3.4 apartment workflow** | EXTEND | Phase A input gains optional `siteRef`; Phase B execution flows site context into placement |
| **C11 Element Creation Pipeline** | NO CHANGE | Site / Building / Apartment elements use the same polymorphic pipeline (the pipeline is element-type-agnostic — already established) |
| **C03 Schemas & Commands** | NO CHANGE | Site / Building / Apartment commands flow the same P6 path |

C12 stays binding for the coordinate substrate; C18-C20 layer the semantic site model on top.

---

## §15 — Required roadmap changes (master apartment plan)

Insert a new Z.−2 tier row at the top of the master tier table in [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md):

```
Z.−2  Site Foundation (GS0.1 – GS0.9)        — this doc
Z.−1  Family Platform (P0.1 – P0.9)          — APARTMENT-FAMILY-PLATFORM
Z.0   Cognition / Data Graph (BIM 2/3 substrate) — APARTMENT-BIM2-BIM3
Z.1   Tier 0 — Already shipped foundation
…    (existing tiers continue)
```

The three strategic substrates (Z.−2, Z.−1, Z.0) sit BENEATH the existing tactical tiers, signalling that future apartment expansion (F2 furniture, F4 activity systems, L4 compositional geometry, …) presupposes them.

**F-tier rows do NOT pause.** Each F-tier ship continues to drop `core-family-seed/` sidecars (per P0 §9) AND can now declare an optional `siteAware: bool` flag for when GS0.5 lands (most furniture is site-neutral; some — solar shades, wind-driven louvres — become site-dependent).

---

## §16 — Migration strategy (legacy projects)

The migration must be **silent and deterministic** for existing projects:

1. **Loader-time auto-promotion.** When loading a project without a Site, the loader synthesises a default Site:
   - Location ← `ProjectLocation` (today's field) or `{ latitude: 0, longitude: 0, trueNorth: 0 }` if absent
   - Boundary ← convex hull of all existing floor-plate polygons in the project (or a 100×100 m bounding box)
   - Climate / context / terrain ← empty (engine treats unset as "use current site-less defaults")
2. **Loader-time auto-promotion (Building / Apartment).** Single Building per Project; one Apartment per Level (today's implicit assumption made explicit).
3. **Site-less mode preserved.** Engines + AI workflows that don't request site context continue to receive `undefined` and fall back to current (site-less) behaviour.
4. **Per-project opt-in to site intelligence.** A UI affordance ("Link this project to a real location") prompts the user. Until then, the auto-promoted default Site is invisible.
5. **No CRDT / snapshot migration.** Auto-promotion happens at load time on the client; the snapshot is rewritten the next time it saves. Old snapshots load identically.

---

## §17 — What this doc is NOT saying

- **Not blocking apartment work.** F-tier continues every session.
- **Not redesigning Cesium use.** Visualization layer stays; ingestion ADAPTER is new.
- **Not requiring Cesium for every project.** Site-less mode preserved indefinitely; users without a real location still get the existing flow.
- **Not redefining C12.** Extends it (new sections); doesn't break it.
- **Not coupling Apartment to Site.** Apartment can be authored stand-alone (legacy path) or under a Site (new path). Both produce valid BIM.
- **Not requiring real climate data.** Defaults (mid-latitude temperate) ship out of the box; advanced users link real EPW.

---

## §18 — Open questions for the next round

1. **Multi-building parcels.** When `Site.boundary` contains multiple `Building` aggregates, how do they share infrastructure (corridors / lift cores / utilities)? Cognition-stack Layer 6 (Architectural Composition) territory.
2. **Site privacy.** A real address is PII. Snapshot encryption + share-link permissions need a new tier.
3. **Cesium ion cost.** At what scale does the pricing become a blocker? Migration to MapLibre / self-hosted tiles is a fallback.
4. **Coordinate accuracy.** WGS84 lat/lon at the building scale loses precision at high latitudes (a tile in Reykjavik is half the longitudinal width of a tile in Quito). LTP-ENU handles this — but the *authoring* coordinates need verification.
5. **Climate change.** EPW files are typically historical (1991-2020 normals). For long-life buildings (50+ years), do we ingest IPCC projections?
6. **Code compliance.** Building Regs are jurisdiction-specific. Does PRYZM ingest local code databases (UK Building Regs, IBC, NCC) when a site is selected? Substantial scope.

---

## §19 — Memory + roadmap integration

After this doc lands:

1. Add memory note `geospatial-foundation-strategic-direction.md` (parallels `family-platform-strategic-direction.md`).
2. Insert §4.−1 Phase GS0 row in the master apartment plan ahead of P0.
3. Insert Z.−2 Tier −2 row at the top of the master tier table.
4. C12 contract revision queued as part of GS0.9.
5. New C18 / C19 / C20 contracts authored as GS0 deliverables.

GS0 runs in parallel with F-tier and the other two strategic axes. No work pauses.

---

*End — PRYZM-GEOSPATIAL-FOUNDATION-AND-SITE-INTELLIGENCE-REVIEW, 2026-05-30.*
