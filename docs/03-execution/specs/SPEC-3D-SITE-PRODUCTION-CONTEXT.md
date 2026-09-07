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
> L-645 said this SPEC should absorb the cut-slab; this section is that. **Status: Phase 1 AND
> Phase 2 LANDED (2026-09-07) — the value, the polygon, the geometric clip, the command, the
> per-pane slider and the ARMED globe cut + slab side. ⚠ NOT browser-verified (§7.1/§7.2 of the
> audit); sea island holes and the >891 m tree read remain OPEN and are named in code at
> `SITE_SCOPE_CLIP_ARMED`.**

### 7.1 — What changes in the mental model of §0

The concentric tiers of §0 (T0 terrain · Tsea · T1 solid · T2 far) all live INSIDE one bounded
**scope** — a circle or a rectangle about **the anchor of §7.7** (the committed parcel; the site
frame origin before one exists), 150–1781 m today — and nothing at
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


### 7.7 — WHERE the slab is centred: the anchor (L-13082 + L-13086, 2026-09-07)

> **Founder:** *"the 3d view should not change the scope as you move on the view — not anymore —
> now it always would center statically the scope depending on the parcel that has been selected on
> plan view."*

That sentence carries **two** requirements with **two different histories**. They are recorded
separately because closing them as one would leave the second undone behind a plausible fix.

**(1) The scope must not follow the camera. REAL, and it was a genuine defect — L-13082, fixed in
`ff60ce85` (lane SCOPE-CUT-2).** `maybeRefreshContextOnPan` reloaded about the CAMERA ground point;
`loadContextBuildings(lat, lon)` sets `contextBuildingsAt` and then arms `applySiteScopeClip(lat,
lon)`, which raises the globe cut, the slab side and every per-layer geometric clip through
`scopeClipperFor` — so the whole slab followed the view. Widening the slider makes it fire MORE
often, because a wider slab must be viewed from further out: the ask and the defect were the same
change. The refresh itself is KEPT (it exists for a real report — "buildings stop showing as I
move"); only the CENTRE moved.

**(2) The centre must be the PARCEL. Not closed by (1) — L-13086.** Every trigger of a scope rebuild
was enumerated before concluding this, because an anchor built for a drift that does not exist is a
new defect wearing a founder quote:

| trigger | site | origin it passes | verdict |
|---|---|---|---|
| `camera.moveEnd` → `maybeRefreshContextOnPan` | `CesiumViewport.ts` | pinned to `formaMassingOrigin ?? contextBuildingsAt` | **was the camera — fixed, L-13082** |
| terrain settle → `rebuildSiteScopeClipForBase` | `CesiumViewport.ts` | `siteScopeClipAt ?? contextBuildingsAt` | derived |
| scope slider → `setContextScope` | `CesiumViewport.ts` | `contextBuildingsAt` | derived |
| terrain ON/OFF → `setFormaTerrainEnabled` | `CesiumViewport.ts` | `contextBuildingsAt ?? formaMassingOrigin` | derived |
| photoreal restore | `CesiumViewport.ts` | `readSiteLocation()` = LTP ?? address | frame-first |
| massing render → `renderFormaMassing` | `CesiumViewport.ts` | the LTP-ENU origin | frame |
| **`site.location-changed`** | `CesiumViewport.ts` | **the RAW EVENT ADDRESS** | **the one live gap — L-13086** |

The last row is the only path that centred the slab on a point that is not the site frame — and the
SAME handler, eleven lines above it, already refuses to do this for the CAMERA (§L-259 defect (ii),
*"the camera must follow the BUILDING whenever one is placed"*) and prints
`originSeparationMeters` for it. The camera got that fix in June; the scope never did. After a
post-commit address edit the slab jumped to the address while the parcel and the building stayed
put, so the parcel could sit off-centre in — or outside — its own scope.

**Hypothesis (B) is FALSIFIED, and the falsification is worth keeping.** A camera-derived CONTENT
radius against a location-derived SLAB would produce the same complaint and needs the opposite fix.
It does not exist here: every per-layer clip keys on the loader's `(lat, lon)` through
`scopeClipperFor`, never on the camera, and `contextExtentBudget.ts` states the prohibition in its
own words — *"a cap grant that moves with the camera's latitude would make a read's zoom depend on
where the user flew from."*

**The anchor.** `scopeAnchor.ts` (pure; no Cesium/THREE/DOM) decides it, strongest first:

1. **the committed parcel's AREA centroid** (`committedParcelLonLat`), then
2. **the site frame origin** — which is the parcel's **FIRST VERTEX**, because `parcelFrameOrigin`
   deliberately returns it so the project-origin datum lands ON the boundary at scene (0,0). A corner
   is the right answer for that datum and the wrong one for a centre; `CesiumViewport`'s own
   §SITE-FRAME-PROBE names this "the anchor-vs-parcel-centroid split" and prints its metres. Tens of
   metres on a city lot, hundreds on a rural or industrial parcel, then
3. **the caller's own point** — the honest **pre-parcel** case, stated as such.

A candidate is adopted only when it is within the **scope's own circumscribing radius** of the
requested centre — no constant is minted for "same site". Beyond it, the address wins, and that is
required, not a hedge: on a real site move `site.location-changed` fires BEFORE
`renderFormaMassing` re-seats the anchor, so both parcel candidates still hold the PREVIOUS parcel,
and adopting one would rebuild every layer at the old site (§CTX-RESEAT-ANCHOR-IS-CURRENT-SITE,
L-12964). An unusable requested centre (non-finite, or `0,0`) is returned **unchanged** so
`applySiteScopeClip`'s existing refusal is what speaks — an anchor must never substitute for a
missing origin. Every outcome prints its source and its reason, so "the anchor held" and "there was
no anchor" can never be read as the same observation.

Pinned by `apps/editor/src/ui/geospatial/__tests__/scopeAnchor.spec.ts`, including a source-text arm
on the one production call site (the unit arms all pass against a module nobody calls).

---

## 8 — What ONE context load actually pays for (L-13110 / L-13111, lane STARTUP-FIX 2026-09-07)

> **Authority:** ISSUE-LOG **L-13110** (§CTX-ONE-READ-PER-BBOX), **L-13111**
> (§CTX-MANIFEST-KNOWN-MISSING), **L-13112** (§DRAPE-COST-ATTRIBUTION — measured and deliberately
> NOT changed). Founder baseline: §STARTUP-BUDGET, `geocode:end → ready = 18.5 s`, of which
> **11.8 s is the deliberate slow descent** and **4.4 s is tiles landing after the scene settled**.
> This section is about that 4.4 s and about nothing else.

### 8.1 — The rule that keeps being got wrong: a DURATION is not a PRICE

The founder's Barcelona console prints `parks: 800 green area(s) from 81 baked tile(s)` **three
times** — 5672 / 3401 / 3400 ms — and `landuse: 2265 area(s) from 30 tiles` three times at
3754 / 1486 / 1486 ms. Read naively that is ~9 s of duplicated parks work. **It is not, and a lane
that "fixes" it as if it were will optimise something that was never spent.**

Those three lines are **three callers sharing ONE download**. `contextTiles.tileInFlight` registers
each tile's promise BEFORE it settles, so callers 2 and 3 wait on caller 1; the three **equal end
times** (5672 − 3401 ≈ 5672 − 3400 ≈ 2.27 s of stagger) are the signature of one download, not
three. What `ms` reports is each caller's own wall-clock, which for callers 2 and 3 is almost
entirely *waiting*. §CTX-READ-PROVENANCE (`contextTiles.TileReadProvenance`) exists to say so in the
console: a read that downloaded nothing prints **"this read PAID FOR NOTHING"** beside its duration.

**⛔ THE DEFECT IS REAL AT A DIFFERENT LAYER, AND THE TWO NEED DIFFERENT CURES.** At the TILE layer
it is a cache HIT — nothing to fix, and adding a second tile-level cache would be work with no
subject. At the COLLECTION layer it was a MISS: the layer readers had a resolved-value cache
populated on COMPLETION, which cannot serve a caller issued while the first read is still in flight
— and on the onboarding flow they always are (`warmAllContextLayers` at the `city` stage,
`CesiumViewport.loadContext*` at pane mount, the re-render after the terrain sample lands).

### 8.2 — §CTX-ONE-READ-PER-BBOX, propagated (L-585 → all ten layers)

The guard, per reader, is three lines and one invariant:

- de-duplicate **above** the tile read (`inFlight`, released in a `finally`);
- the shared read takes **no `AbortSignal`** — one caller's abort must not hand the others an empty
  result for a read that was nearly done;
- each caller honours its **own** signal after the await, so an abort cancels the **render** (§L-579)
  and `contextFurniture` keeps its per-CALLER `aborted` state, which is a different value from the
  shared read's outcome (§CONTEXT-DATA-HONESTY).

| reader | guard |
|---|---|
| `contextBuildings` | since L-585 |
| `contextRoads`, `contextWater` | older §L-323 FIX B form |
| `contextParks`, `contextLanduse` | L-13110, first pass |
| `contextRail`, `contextTrees`, `contextFurniture`, `contextCanopyBaked` | L-13110, this pass |

**⭐ THE TWO THAT LOOK LIKE THEY CANNOT MATTER ARE THE TWO THAT MATTERED MOST.** `furniture` and
`canopy` are absent from the live tileset, and their readers deliberately do **not** cache a
non-`ok` result (a transient blip must never become a session-long "no lamps"). So the
resolved-value cache never fills for them at all, and before the guard **every** overlapping caller
ran a full read. §CTX-KNOWN-MISSING bounds the repeat to a memo lookup — but only after the first
probe returns, which is exactly the window the callers overlap in.

**MEASURED (warmed medians, 7 reps, `readContextTileFeatures` mocked so the number is the work
ABOVE the tiles):**

| layer | payload | 3 concurrent callers, guarded | the same work run 3× | saved | per duplicate caller |
|---|---|---|---|---|---|
| `trees` | 6,000 points | 0.97 ms | 2.75 ms | 1.77 ms | 0.89 ms |
| `rail` | 1,200 ways × 40 vertices | 3.29 ms | 9.86 ms | 6.56 ms | 3.28 ms |

**⚠ SAY WHAT THIS IS NOT.** It is **milliseconds, not seconds**, and it does not include the
per-read bbox crop or the tile-list computation inside `readContextTileFeatures` (unmeasured — the
bench mocks that call). The user-visible startup saving from this half is small; its value is that
the main thread stops doing the same work three times during the window the reveal animation runs
in, and that ten readers now behave the same way. **Anyone reporting this as "9 seconds recovered"
has reproduced the misreading §8.1 exists to prevent.**

Pinned by `apps/editor/src/ui/geospatial/__tests__/contextOneReadPerBbox.spec.ts` — the subject is
the NUMBER of `readContextTileFeatures` calls for N concurrent callers of one bbox: **was 3, must
be 1**, with mutation proofs recorded in the file.

### 8.3 — §CTX-MANIFEST-KNOWN-MISSING: one manifest read instead of six 404s

`canopy`, `sea` and `furniture` each 404 on their archive header, and §CTX-RANGE-COALESCE re-issues
the span's members individually before §CTX-KNOWN-MISSING can memoise the layer — roughly **two
requests per absent layer per session**, on the hot path, queued behind Cesium's terrain stream.

**MEASURED against production, 2026-09-07 — and the response SIZE is the tell, because our refusal
and R2's are both a bare 404:**

| URL | status | bytes | ms | whose 404 |
|---|---|---|---|---|
| `pub-…r2.dev/tiles/tileset-manifest.json` | 200 | 24,279 | 196 | — (it EXISTS) |
| `app.pryzm.so/api/context-tiles/tileset-manifest.json` | 404 | **38** | 242 | **OURS** |
| `/api/context-tiles/canopy.pmtiles?v=L663a` | 404 | **38** | 205 | **OURS** (allowlist drift) |
| `/api/context-tiles/sea.pmtiles?v=L663a` | 404 | 27,150 | 356 | R2's |
| `/api/context-tiles/furniture.pmtiles?v=L663a` | 404 | 27,150 | 436 | R2's |
| `/api/context-tiles/parks.pmtiles?v=L663a` | 206 | 128 | 365 | — (it answers) |

38 bytes is `{"error":"unknown context tile layer"}`.

**⛔ THE SERVER LEG HAD TO COME FIRST, AND THAT IS WHY THIS WAS NOT SHIPPED EARLIER.**
`VITE_CONTEXT_TILES_URL` is deployed as the same-origin proxy (§L-776), whose layer handler is an
**allowlist** — so `tileset-manifest.json` resolved to a layer name nobody had allowlisted and came
back as our own 404. A client written against that would have failed open on every load and changed
nothing (§AUTHORED-BUT-UNWIRED — audit REACHABILITY, not existence). The route
(`server/context-delivery/`, registered **before** `:layer`, which matches the literal path and
would otherwise refuse it) is the unblock; `canopy` joined the allowlist in the same commit.

The client then reads the manifest **once per session** and pre-seeds §CTX-KNOWN-MISSING for every
layer it does not name. Live reading 2026-09-07: `layers = [buildings, landuse, parks, rail, roads,
trees, water]` — the seven that answer, and none of the three that 404.

**AFTER: ~6 archive requests replaced by 1 manifest request per session**, and the ~997 ms of
request time those three probes cost (one each; the row's ~2-per-layer makes the session figure
roughly double) becomes one ~200–400 ms read that also arms every future absent layer for free.

**Four properties are load-bearing, and each is pinned in
`apps/editor/src/ui/geospatial/__tests__/contextManifestKnownMissing.spec.ts`:**

1. **The answer does not change.** A suppressed layer still answers `unavailable`, with a reason
   that NAMES the manifest, carrying §CTX-KNOWN-MISSING's `(known missing this session…)` suffix —
   which is what keeps `contextFurniture`'s honest `absent` state reachable. Only the round trip
   goes. Failure and empty remain different values.
2. **It fails OPEN.** Unreadable, non-JSON, unidentified or zero-layer ⇒ seed nothing, probe as
   before. Two guards are stricter than "the fetch resolved": the document must declare
   `pryzm-context-tileset-manifest@*` (an error body is not a manifest), and the layer set must be
   **non-empty** — a manifest naming zero layers would suppress the entire context off one
   malformed publish, the worst thing this feature could do.
3. **A MEASUREMENT BEATS A DOCUMENT.** The manifest lands asynchronously and can resolve after a
   layer has been read successfully. `provenArchives` records every archive whose header we have
   actually read, and `manifestSeedVerdict` refuses to suppress one — otherwise a stale or narrow
   manifest could delete a **live** layer from the map for the session.
4. **The reveal never waits.** The gate is deadlined (`CONTEXT_MANIFEST_GATE_MS`) and `buildings` is
   exempt **by name**: the onboarding reveal gates on the near-buildings read and nothing else, so
   the cost is paid only in the stream that lands after the scene settles — the 4.4 s this section
   is about. ⭐ The gate itself is not optional: a fire-and-forget prime saves **nothing**, because
   `warmAllContextLayers` issues the manifest and the nine layer reads in the same tick, so an
   un-awaited manifest lands after the very 404s it exists to prevent. That mutation is recorded.

### 8.4 — What was deliberately NOT changed (L-13112)

Parks spent **8,414 ms waiting for terrain and 18 ms on its own work**, behind a 22,793-point /
7,056 ms buildings sample. The single shared flight is the right design and
`groundSampleBatcher.maxConcurrentFlights` **must stay 1** — two calls in the air re-download the
same tiles, which is the whole §STARTUP-GROUND-SAMPLE-COALESCE finding. That invariant is already
pinned in `groundSampleBatcher.spec.ts`; **do not weaken it.** Neither priority-jumping nor
splitting the big sample may land without a per-flight reading of *tiles requested* vs *tiles served
from the browser HTTP cache*, which nothing measures today.

---

## 9 — §SOLID-OR-WIREFRAME: the silhouette IS the data state (L-13143, founder 2026-09-07)

> *"still not building complete plate - the scope of the rectangle or the circle of the 3d site view
> shall have completed with buildings and actually it is! but they are really transparent - now they
> all be solid if the height is known and wireframe if not - just this - do it!"*

⭐ **THIS IS AN HONESTY RULE, NOT A STYLING ONE, AND THE DISTINCTION DECIDES EVERY CHOICE BELOW.** A
uniformly translucent city says nothing. Solid-vs-wireframe makes the DATA STATE visible at a glance:
the user can see, without opening anything, which neighbours PRYZM actually holds a height for. Same
doctrine as every refusal in this repo (`§CONTEXT-DATA-HONESTY`, C58 §1.4) — **an unknown must look
DIFFERENT from a known, never like a washed-out version of it**, which is exactly what a global alpha
made it.

### 9.1 — What was measured first, because it contradicts the obvious diagnosis

`tools/context-height-probe/probe.mjs` against the **shipped** tiles
(`buildings.pmtiles?v=L663a`, 2026-09-07), at the founder's own Barcelona site:

| extent | footprints | `measured-lidar` | `tagged` | `derived-levels` | `assumed` |
|---|---|---|---|---|---|
| ±0.008° (near ring) | 6 331 | **6 064 (95.8%)** | 0 | 234 (3.7%) | **33 (0.5%)** |
| ±0.03° (far tier) | 46 866 | **44 126 (94.2%)** | 59 | 1 893 (4.0%) | **788 (1.7%)** |

**The plate he called "really transparent" is 95.8% real measured height.** It read translucent
because the TIERS were translucent by construction at every provenance, not because heights were
missing. ⛔ **Never diagnose this from the render.** Run the probe.

### 9.2 — The rule (binding)

The classification is `contextHeightRenderTier(provenance)` in
`apps/editor/src/ui/geospatial/contextBuildings.ts`. It is **pure**, it takes **only the provenance**
— the metres are not an argument, so the height value can never influence the silhouette — and it is
read by **all three render tiers**, so the plate cannot classify one building "known" in one ring and
"unknown" in the next.

| provenance | verdict | drawn as |
|---|---|---|
| `measured-lidar` | `solid` | **OPAQUE** `contextFill` extruded prism, casts + receives shadows |
| `tagged` | `solid` | as above |
| `derived-levels` | `estimated` | **OPAQUE** `contextEstimatedHeight` (#B8B6B0) prism, **also shadow-casting** |
| `assumed` | `wireframe` | **footprint outline on the ground. No fill, NO extrusion.** |
| *absent* (`undefined`) | `wireframe` | as above — a pre-L-459 cached collection is UNKNOWN, never `tagged` |

**R-9.1 — A DEFAULTED HEIGHT RENDERS AS A WIREFRAME AND A REAL ONE AS A SOLID.** This is the
founder's sentence and it is the invariant.

**R-9.2 — THE CLASSIFICATION MAY NOT SILENTLY FALL THROUGH TO EITHER BRANCH.** `undefined` is named
explicitly, and the `default` arm assigns to `never` — **adding a rung to `ContextHeightProvenance`
breaks the build** rather than being absorbed into `solid`. The failure mode of an honesty gate is a
new unclassified value drawn as if it were known; that is closed at compile time and pinned at
runtime in `contextSolidOrWireframe.spec.ts`.

**R-9.3 — `derived-levels` IS ITS OWN RUNG AND IS DELIBERATELY NOT WIREFRAME.** A real storey COUNT
is a real height input; drawing it as "no height" would OVERSTATE our ignorance. And it would not
merely be imprecise: on a city with no measured bake (Madrid is mostly `derived-levels`) that rung
alone empties the plate back into the blank §FULL-PLATE (L-13123) had just fixed. **The hue carries
the claim; the silhouette does not.**

**R-9.4 — A WIREFRAME USES NO HEIGHT.** It is the footprint outline on its own sampled ground, lifted
`CTX_WIREFRAME_GROUND_LIFT_M` (15 cm) purely so the line does not z-fight the terrain. ⛔ **A
wireframe BOX at the 9 m `DEFAULT_BUILDING_HEIGHT_M` is forbidden** — it asserts 9 m in edges instead
of faces and reintroduces the exact lie this removes (§CTX-ASSUMED-HEIGHT-VISIBLE: *"deliberately NOT
done: inventing a better-looking number"*).

**R-9.5 — NO CONTEXT BUILDING IS TRANSLUCENT, IN ANY TIER.** The three alphas this replaced were
**0.50** (T0 estimated), **0.82** (T1 demoted — one flat value for every footprint, no provenance
split at all) and **0.60** (T2 instanced far — likewise). 7 947 of the founder's ~9 547 drawn
footprints were in T1+T2, so **~83% of the plate was washed out for a reason unrelated to the data.**

### 9.3 — The translucency was load-bearing, and what replaced it

Both far tiers' comments state the job the alpha was doing: *"a hair MORE transparent … so the
distant massing reads as clearly secondary (aerial-perspective)"*. That is a real requirement and it
is **kept**, on the channel it belongs on. Alpha is the wrong instrument: real aerial perspective is
a loss of CONTRAST toward the haze, not see-through-ness. So each tier's colour is lerped toward
`FORMA_QUALITY.fogColor` by `CTX_TIER_HAZE` — **near 0 · demoted 0.10 · far 0.22** — and every alpha
goes to 1. Distance still recedes; nothing is see-through.

⛔ **AND OPAQUE ALONE IS A KNOWN TRAP.** §CTX-SOLID-CONTEXT (L-636) is the record of an opaque-but-
UNLIT context reading as a flat white slab. Two consequences are binding:

- **`estimated` now CASTS SHADOWS.** It did not while it was alpha-0.5, and that was correct then —
  a translucent surface does not self-shadow, which IS the L-636 defect. Turning it opaque without
  turning shading on would rebuild that defect for every `derived-levels` city.
- **The instanced far tier's appearance is `flat: false`.** The geometry already carried normals
  (`PerInstanceColorAppearance.VERTEX_FORMAT` is `POSITION_AND_NORMAL`) and was discarding them, so
  lighting the far plate costs a lambert term in the fragment shader and **no extra vertex data**.
  An opaque unlit plate is the same "flat white" defect arriving from the other direction.

### 9.4 — The performance envelope (ADR-0094 budget)

**R-9.6 — THE FAR TIER IS AT MOST TWO PRIMITIVES, NEVER ONE PER FOOTPRINT.**

- **Solids + estimated: still ONE batched `Cesium.Primitive`, one draw call, one appearance.** The
  solid/estimated distinction rides the **per-instance colour ATTRIBUTE** `PerInstanceColorAppearance`
  already batches into the same vertex buffer — it costs nothing. `translucent` also flips **true →
  false**, moving the whole batch out of the sorted translucent pass: **cheaper than before**, not
  dearer.
- **Wireframes: ONE additional `SimplePolylineGeometry` batch.** A line and a solid cannot share a
  geometry type, so the second primitive is structural. `SimplePolylineGeometry` is deliberate — it
  emits `GL_LINES` (one vertex per ring point, no quad expansion), so a wireframe footprint is
  **cheaper than the solid it replaces**. It is `null` entirely when every far footprint has a height,
  which is the normal case on a measured city.

Net vertex work on the founder's Barcelona read **falls**: 1.7% of the far tier drops from a 12-vertex
extruded prism to an 8-vertex line loop, the batch leaves the blend pass, and the only addition is a
per-fragment lambert term.

### 9.5 — What the console must now be able to tell you

Each tier reports its OWN split (`summariseContextRenderTiers`), because one total cannot distinguish
"the plate is translucent" from "the plate is unknown-height". ⚠ The near ring's line previously ended
`${FORMA_PALETTE.contextFill}@0.92, shadows on` — **a stale literal**: the alpha had been 1.0 since
§A.21.D-FORMA2 and half the ring had not used `contextFill` at all since L-647. That is where the
founder read "0.92". **A material constant may not be transcribed into a log line; print what was
drawn.**

### 9.6 — What this does NOT re-open

The founder rejected a wireframe on **2026-07-30** — *"a weird orange"*, a spiky mess of line-edges.
That rejection stands and is not contradicted here: what he rejected was an **AMBER** wireframe
applied to the **whole not-accurate set** (on a `derived-levels` city, most of it). This draws
**neutral grey** edges, and only for footprints with **no height input at all** — 33 of 6 331 on his
own read. `FORMA_PALETTE.contextUncertainHeight` (#E8973A) remains referenced by **no render site**
and is kept only as the record of what not to do. ⛔ **Do not re-point a render site at it to "make
the wireframes visible".**
