# SPEC — 3D-Site Production Context (LOD, Extent, Layers & Budget)

> **The specification for a production-beautiful 3D-Site (Cesium "Forma") context at every zoom level.**
> Today the Forma view shows a small square patch of context on a vast bare terrain, so zoom-out reads as
> an island, not a city. This SPEC defines a **globe-like concentric-LOD model with Forma-abstract
> styling**: terrain + sea always on, a solid near ring at ~4× today's radius, and a cheap wireframe far
> ring for everything beyond — all within the existing performance budget.
>
> **Status:** DRAFT SPEC (2026-07-29). Tracks audit **L-642**. **EXTENDS** the existing
> `§FEAT-FORMA-CONTEXT-EXTENT-LOD` + `§FEAT-FORMA-CONTEXT-NEAR-CAP` (L-454) machinery — it is not a new
> render path. Nothing here is built; implementation starts only on sign-off + a ratifying contract
> (the MISSING-CONTRACTS §GAP L-642).
>
> **Governance:** conflict order VISION → ARCHITECTURE → contracts → ADRs → SPECs. Authorities:
> `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md`, `CONTEXT-LOD-BUILD-PLAN.md`, `CONTEXT-VIEW-DESIGN.md`,
> `SPEC-FORMA-SITE-VIEW.md`; ADR-0089/0091/0093/**0094 (large-scene perf)**/0109; C12 §7/§9, C58 §1.14,
> C59, C10 (perf budget). §CONTEXT-DATA-HONESTY: a missing layer degrades to a quiet no-op, never a fake.

---

## 0 — The mental model: concentric LOD tiers (globe logic, Forma styling)

The 3D-Site is a set of **concentric tiers** centred on the site origin, each a strictly cheaper render
than the one inside it. This mirrors the 3D-globe's LOD logic but every tier keeps the Forma abstract
look (near-white massing, flat-lit relief, #6600FF-family accents — `CONTEXT-VIEW-DESIGN` §2), NOT
photoreal tiles.

| Tier | Extent | Content | Render cost | Always-on? |
|---|---|---|---|---|
| **T0 Terrain** | whole view | baked quantized-mesh relief (L-639) | cheap (GPU terrain) | **YES** (have it) |
| **Tsea Sea/Ocean** | whole view | blue water at sea level, clipped to real coast (L-637 / L-185) | cheap (flat polygons) | **YES — new requirement** (today per-select) |
| **T1 Near — SOLID** | **~4× today's radius, RADIUS (circle) not square** | solid extruded buildings (+shadows in a sub-radius) · roads · green/parks · rail lines · trees | moderate (capped, instanced) | on when a site is set |
| **T2 Far — WIREFRAME/low-poly** | beyond T1, out to the horizon | ALL buildings as an ultra-cheap wireframe / flat low-poly footprint extrusion, shadowless | very cheap | on when a site is set |

The existing code already implements a **two-tier** version of this (`CesiumViewport.ts`
`§FEAT-FORMA-CONTEXT-EXTENT-LOD`: near = extruded+shadows, far = flat/low-poly shadowless, nearest-N
capped; `§FEAT-FORMA-CONTEXT-NEAR-CAP` L-454 bounds the expensive near ring). This SPEC **adds T2's
wireframe outer tier, switches square→radius culling, widens the radius ~4×, promotes sea to always-on,
and adds the rail + trees layers** — every change an extension of that machinery, no parallel path.

---

## 1 — The binding constraint: the performance budget (why this is LOD, not "more buildings")

4× the context radius is 16× the ground area. The naïve version (render 16× more solid extruded
buildings) **violates the ADR-0094 large-scene budget and risks WebGPU device-loss** (memory
`webgpu-heavy-scene-crash-and-instancing`: a heavy scene cascades to device-loss; per-element unique
materials defeat instancing). Therefore the **outer tiers MUST be cheap by construction**:

- **T2 is a wireframe / single flat low-poly extrusion, shadowless, one shared material** → instanceable.
- **T1 is capped** (nearest-N within the radius, the existing `§FEAT-FORMA-CONTEXT-NEAR-CAP` extended to
  a radial cap) and **instanced** (one `InstancedMesh` per geometry×material, per the instancing memory).
- The tier boundaries are driven by the **shadow-map horizon + a perf budget**, exactly as L-454 already
  tiers the near ring — not by a fixed count.
- **Fast-but-wrong (rejected):** raise the near-ring cap and render 4× solid buildings. It looks right for
  one frame and then janks / loses the GPU device. The wireframe tier + instancing is the only sound way
  to show "a whole city" at zoom-out.

The render stays a **pure total function of the data + the camera** (C58 §1.14 generalised): the tiers
are chosen from camera distance + budget, never from hidden state.

---

## 2 — Data layers (the bake) — what T1 needs

Current bake layers (`tools/context-bake/bake.mjs` LAYERS): `buildings`, `roads`, `water` (+ coastline,
L-637), `parks`, `landuse`. **T1 adds two:**

- **`rail`** — `w/railway` (rail/light_rail/subway/tram) as linestrings; drawn as thin dark ground
  ribbons (like roads, a distinct tone). New LAYERS entry + a client `loadContextRail` mirroring
  `loadContextRoads`.
- **`trees`** — `natural=tree` (points) + reuse `natural=wood`/`landuse=forest` already in `parks` for
  canopies. Drawn as cheap instanced billboards/low-poly blobs, capped + instanced (they are the most
  numerous element — instancing is mandatory). New LAYERS entry (`node/natural=tree`) + a client
  `loadContextTrees`.

**Extent:** the context tiles must cover the ~4× radius. Two options (decide at build): (a) widen the
per-city context bbox in `bake.mjs` REGIONS to the T1 radius; (b) a **tiered radial fetch** on the client
that reads T2 building footprints from a coarser zoom. Prefer (a) for the baked cities (simple, the
tiles already exist per-city) with T2 reading the SAME `buildings` layer at a lower zoom for the wireframe.

All new layers obey §CONTEXT-DATA-HONESTY: absent (un-baked) → the client loader degrades to a quiet
no-op (no fabricated rail/trees), exactly like `loadContextParks`/`loadContextLanduse`.

---

## 3 — Render (the client) — what changes in `CesiumViewport.ts`

Extend `§FEAT-FORMA-CONTEXT-EXTENT-LOD`, reusing the ENU-bridge + `§CTX-ABS-SEAT` ground-seating the
existing loaders share:

1. **Radius (circle) culling, not square.** Replace the square bbox extent test with a radial distance
   test from the site origin for tier membership (T1 in, T2 beyond) — the "not square" the founder asked
   for.
2. **T2 wireframe tier.** A new render for buildings beyond T1: one flat low-poly footprint extrusion (or
   true wireframe), shadowless, one shared material, instanced. It reads the `buildings` layer at a lower
   zoom (fewer, coarser footprints) so the count stays bounded.
3. **Sea always-on.** Promote the L-185/L-637 sea to a standing layer loaded with terrain (like T0), not
   only on a parcel select — so the coast is present whenever the 3D-Site is shown, mirroring how terrain
   is always attached.
4. **Rail + trees** loaders (`loadContextRail`, `loadContextTrees`) draped in the T1 ground stack (rail
   with roads; trees as instanced billboards), each guarded + capped + honest-empty.
5. **Radial cap + budget.** Extend `§FEAT-FORMA-CONTEXT-NEAR-CAP` (L-454) to a radial + budget cap so T1
   stays in the ADR-0094 envelope; T2 is bounded by the coarse-zoom footprint count.

No new command path, no new frame loop (P3) — everything rides the existing Forma render + the frame
scheduler.

---

## 4 — Phased build

- **Phase A — Sea always-on (cheapest, highest visible win).** Promote the sea to a standing layer
  (client-only; reuses L-637). Ships the "ocean always there like terrain" immediately.
- **Phase B — Radius culling + T2 wireframe tier.** Client-only: radial extent + the wireframe far ring +
  the radial/budget cap. Delivers "a whole city at zoom-out" within budget. No bake change (T2 reads the
  existing buildings layer at a coarse zoom).
- **Phase C — Rail + trees layers.** Bake (2 new LAYERS) + client loaders + a context re-bake. The
  richest T1.
- **Phase D — 4× extent.** Widen the context bbox (bake) to the T1 radius + re-bake; verify the perf
  budget holds with the T1 radial cap.
- **Governance:** ratify a new contract (the §GAP L-642) that binds the tier model + the perf budget +
  the honest-degradation rule, so this render is contract-governed, not code-only.

## 5 — Acceptance
- Zoom-out on a coastal city (Barcelona) shows: terrain + **blue sea** + a solid ~4× radius near ring
  (buildings/roads/green/rail/trees) + a wireframe far ring of the wider city — reading as a city, not an
  island — at a **stable frame rate with no WebGPU device-loss** (the ADR-0094 budget holds).
- A missing layer (un-baked rail/trees, inland → no sea) degrades to a quiet no-op, never a fabrication.
- Barcelona's near-ring look is unchanged (this is additive around it).

## 6 — Cross-references
Audit **L-642** · MISSING-CONTRACTS §GAP L-642 · `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` ·
`CONTEXT-LOD-BUILD-PLAN.md` · `CONTEXT-VIEW-DESIGN.md` · `SPEC-FORMA-SITE-VIEW.md` ·
`CITY-REPLICATION-STANDARD.md` §5 (the L7/L8 render pipeline) · ADR-0094 · C12 · C58 §1.14 · C59 · C10 ·
related L-637 (sea), L-639 (terrain), L-454 (near-cap) · **§7 below — the SCOPE (L-645, C12 §13, ADR-0382)**.

---

## 7 — The SCOPE: the slab the tiers live in (L-645 absorbed, 2026-09-07)

> **Founder:** *"a slide of the scope on 3D Site view — like cityweft does — circular or rectangular —
> crop everything — absolutely everything — but within the scope should be sound — really detailed
> and completed."* **Authority:** [C12 §13](../../02-decisions/contracts/C12-GEOSPATIAL.md) (normative) ·
> [ADR-0382](../../02-decisions/adrs/ADR-0382-site-scope-one-value-cut-per-layer-class.md) (the rulings) ·
> [`AUDIT-3D-SITE-SCOPE-CROP`](../plans/AUDIT-3D-SITE-SCOPE-CROP.md) (every layer, every mechanism).
> L-645 said this SPEC should absorb the cut-slab; this section is that. **Status: Phase 1 landed
> (value, polygon, geometric clip, command — 74 tests); Phase 2 (wiring + slider) PLANNED, gated on
> the extent lane (L-13058).**

### 7.1 — What changes in the mental model of §0

The concentric tiers of §0 (T0 terrain · Tsea · T1 solid · T2 far) all live INSIDE one bounded
**scope** — a circle or a rectangle about the site frame origin, 150–1781 m today — and nothing at
all is drawn outside it: the terrain is cut on a vertical edge with a neutral slab side, the ground
layers and the sea stop at the edge, a building on the edge is sectioned, trees and people beyond it
are not placed, and the outside is the flat pale backdrop. The scope is ONE persisted value
(`SiteModel.scope`, written by `site.setScope`) and every tier's radius AND read derive from it —
the five separate limits L-13058 measured (600 · 891 · 890 · 1225 · footprint read) are now
`min(scope, ceiling)` for the expensive tiers and `= scope` for the cheap ones.

### 7.2 — Why the retired slab failed, so nobody rebuilds it

`scene.globe.clippingPolygons` clips the globe surface ONLY (Cesium 1.143.0: `Globe`,
`Cesium3DTileset`, `Model` own `clippingPolygons`; no `Primitive`, no entity). Every ground layer
here is an entity at absolute height and every instanced tier is a `Primitive`, so the visible
outside stayed. The tan skirt was a LIT entity and read as the "red ring". And the disc was cut at
the far radius while every layer stopped at its own. C12 §13.6 forbids all three by name.

### 7.3 — The mechanism per class (summary of C12 §13.3)

globe → `globe.clippingPolygons` (`inverse:true`) · slab side/floor → a flat-shaded neutral
`Primitive` · flat entities → geometric pre-clip (`scopeClip.ts`: rings via `intersectPolygons2D`,
corridors via segment split) · footprints → pre-clip the ring, extrude to height · points →
centre-in-scope · photoreal → not applied (one `inverse` per tileset) · the subject → never cut.

### 7.4 — Completeness inside the scope

Caps on mapped layers are completeness facts: when one bites inside the scope the console line says
`layer: drawn of eligible — dropped by the cap; complete at ~N m`, and the slider carries the
"complete" mark. Barcelona, today's caps: ~891 m (bound by the near READ — roads/parks/trees are
read at 891 m while the far tier reaches 1781 m), ~960 m once every read derives from the scope
(tree cap 3,000), ~1,420 m once trees are raised to ~10,000 (building budget 14,000). Beyond 1,781 m
the building read leaves z16 and the bake's `--drop-densest-as-needed` deletes footprints. The
default scope is the computed complete mark (founder Q-1 in ADR-0382).

### 7.5 — The slider

Per pane, inside its pane (C59 §2.10.3 clause 4), bottom-centre; both panes show the ONE value.
Range from `contextExtentBudget.ts`; floor = the smallest scope containing the parcel + 25 m.
Pointer moves re-position a preview ring; release dispatches `site.setScope`; the reload swaps the
new layers in — never clears first. Shape toggle circle / rectangle (rectangle by default, ADR-0382
D2). Not on the undo stack (D8).

### 7.6 — Phase 2 work list (file by file; the functions that must read the scope)

1. `contextExtentBudget.ts` — DONE in Phase 1: `SiteContextScope = SiteScope`, one outer-radius body, `SITE_SCOPE_RANGE`. Left: `farFetchHalfDeg` → `scopeFetchHalfDeg(scope, lat)` with an ASYMMETRIC bbox (lon-half ≠ lat-half) or a latitude-aware ceiling, because a symmetric longitude-honest box at 1781 m is 144 tiles at Barcelona and leaves z16 (ADR-0382 consequences); every `*RadiusM(scope)` stays.
2. `CesiumViewport.ts` — `site.scope-changed` → `setContextScope(resolveSiteScope(store.getScope(), SITE_SCOPE_RANGE).scope)` is the ONE entry of the value into the context load; `setContextScope` swaps instead of clearing (C12 §13.4); `loadContextBuildingsUncoalesced` / `renderContextBuildingsFarRing` / `buildContextFarTierPrimitive` pre-clip each footprint ring; `loadContextLanduse` / `loadContextParks` / `loadContextWaterInner` / `renderContextSeaRings` (outer + holes) / `loadContextRoads` / `loadContextRail` pre-clip rings and corridors; `loadContextTrees` and `contextStreetLifeRender.buildPeople` / `buildLamps` filter by centre; a new `applySiteScopeClip` (globe clip + slab side + fog) on the `renderFormaMassing` funnel after `ensureGroundBaseForContext`, rebuilt on terrain settle beside `rebuildContextFarTierForBase`, cleared in `clearContextBuildings` where `clearContextEarthSlab` sits today; `maybeRefreshContextOnPan`'s 1500 m follows the scope.
3. `contextBuildings.ts` — `fetchContextBuildingsNearAndFar` takes the scope's half-degree; `selectNearRingRenderTiers` / `selectFarRingFootprints` unchanged (distance from the origin is already right).
4. `contextTrees.ts` / `contextRoads.ts` / `contextParks.ts` / `contextWater.ts` / `contextRail.ts` / `contextLanduse.ts` / `contextFurniture.ts` / `contextLayerWarm.ts` — the fetch bbox from `scopeFetchHalfDeg` (and the warm-up keeps hitting the same keys).
5. `SiteAuthoringPaneShell.ts` — mount `SiteScopeSlider` per pane beside `mountPaneViewPicker`; hold the shared value like `globeFraming`.
6. `siteDispatch.ts` — `dispatchSiteScope` calling `siteSetScope` and emitting `site.scope-changed` (the existing `siteUpdateZoning` shape).
7. `ProjectSerializer.ts` — nothing: `site` already round-trips the whole `SiteModel`.
8. `docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md` §2.1 — the `scope` field row (owed).
