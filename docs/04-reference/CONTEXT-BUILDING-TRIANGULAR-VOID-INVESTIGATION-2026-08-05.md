# Context-Building Triangular Void Investigation (2026-08-05)

**Status:** Root cause PARTIAL — one code-confirmed defect class fixed defensively; a second,
lower-confidence candidate mechanism identified but not confirmed for this specific building.
**Symptom source:** founder screenshot, Córdoba, Calle de la Previsión (near Calle de José María
Valdenebro / Calle Don Lope de Sosa). 3D "Site" pane (WebGPU/Cesium), a neighbouring CONTEXT
building (not the user's own site/envelope) renders with a visible triangular black void/notch cut
into an otherwise-solid extruded volume, on a building the founder confirms is a simple real block.

## Scope confirmation

This is the **context-building** render path, not the buildable-envelope inset algorithm (a
separate, already-tracked issue). Confirmed the founder's building is a grey extruded neighbour,
not the translucent `#6600FF` proposed-massing volume.

## The code path (file:line citations)

Context building footprints reach the 3D "Site" pane through one of two sources, both converging on
the same GeoJSON-ish shape and the same renderer:

1. **Live Overpass** — `apps/editor/src/ui/geospatial/contextBuildings.ts`
   `overpassToCollection()` (~L762–807). Builds a ring straight from Overpass `out geom` lat/lon
   pairs, closes it if needed.
2. **Baked PMTiles** (`§CTX-PMTILES-READER`) — `apps/editor/src/ui/geospatial/contextTiles.ts`
   `readContextTileFeatures()` (~L456–543) reads MVT tiles via `@mapbox/vector-tile`; `ringsFor()`
   (~L397–442) extracts the **outer ring only** per polygon/multipolygon part — holes are
   deliberately dropped ("cosmetic at context-massing scale", contextTiles.ts:73 /
   contextBuildings.ts:747). `contextBuildings.ts` `tilesToCollection()` (~L823–855) converts these
   into the same `ContextBuildingFeature` shape as the Overpass path.

**Confirmed which path serves Córdoba:** `tools/context-bake/bake.mjs` `ALL_REGIONS[0]` (~L61–80,
"L-607 — WHOLE SPAIN") bakes the ENTIRE Spain Geofabrik extract (bbox `-9.55,35.90,4.60,43.90`,
comment explicitly names "Madrid, Córdoba"), zoom 16. So Córdoba's context buildings are served by
the **baked-tiles path**, not raw live Overpass, whenever `contextTilesEnabled()` is true (which it
is in production — `CONTEXT_TILES_SAME_ORIGIN_BASE` is the same-origin fallback and is never empty,
`contextTiles.ts:218–229`).

**The extrusion itself** — `apps/editor/src/ui/geospatial/CesiumViewport.ts`, near-ring render
(~L7531–7644) and the demoted/far-ring twins (~L8072–8135, ~L8166–8220): the feature's
`geometry.coordinates[0]` ring is mapped point-by-point into ENU-then-ECEF `Cesium.Cartesian3`
positions and handed **directly, unmodified**, to `new Cesium.PolygonHierarchy(positions)` with
`extrudedHeight` set. No ring validation, deduplication, or self-intersection check occurred
anywhere in this path before this investigation's fix.

**The triangulator** — Cesium's `PolygonGeometry` triangulates polygon fill with a bundled
`earcut`, confirmed in the installed package:
`node_modules/.pnpm/cesium@1.143.0/node_modules/cesium/Build/CesiumUnminified/index.js:86633`:
```js
PolygonPipeline.triangulate = function(positions, holes) {
  ...
  return earcut(flattenedPositions, holes, 2);
};
```
`earcut` (bundled at the same file, ~L86188 onward) is an ear-clipping triangulator that assumes a
**simple, non-self-intersecting** polygon. Its own `filterPoints` pass (index.js:86229) only removes
points that are **exactly** duplicate or have **exactly** zero cross-product area
(`area(p.prev, p, p.next) === 0`) — it does **not** catch near-duplicate or near-collinear vertices
introduced by floating-point noise. This is a documented, known limitation of ear-clipping
triangulators in general and of `earcut` specifically (its own issue tracker treats "valid simple
polygon, wrong triangulation" as a bug, but does not claim correctness on inputs with near-zero-area
degeneracies or genuine self-intersections).

## Candidate root causes checked

### 1. Multi-ring (polygon-with-hole) misread as simple — RULED OUT for the general mechanism, not fully for this address
Both source paths **deliberately** keep only the outer ring and discard holes
(`contextTiles.ts` `ringsFor()` Polygon case: `return [closeRing((geometry.coordinates as
number[][][])[0] ?? [])]` — index `[0]` only). This is a known, comment-documented simplification,
not a bug: dropping a courtyard/patio hole makes a *solid* block (no notch), which does not match
the founder's symptom (a notch is missing material, not extra material). A live Overpass query
for this bbox (see below) returned **zero multipolygon relations** in the immediate area, weakening
this theory further for this specific street, though the check could not be independently
re-verified beyond one Overpass round-trip summarised by an LLM (see "What could not be verified").
**Conclusion: not the mechanism here.**

### 2. Self-intersecting / improperly-wound OSM polygon — PARTIALLY ADDRESSED, not confirmed
Neither source path validates ring simplicity before handing it to Cesium. A genuinely
self-intersecting (bowtie) ring is a real, if uncommon, OSM/tile-clip data-quality class, and
`earcut` gives no correctness guarantee against it. **Not fixed** in this pass (a true
self-intersection repair — e.g. Bentley–Ottmann + resolve — is a materially bigger, riskier change
than the scope here calls for); flagged for follow-up if the fix below does not resolve the founder's
symptom.

### 3. Triangulation/tessellation choking on near-degenerate vertices (concave corner OR
quantisation noise) — CONFIRMED AS A REAL GAP, FIXED DEFENSIVELY
`earcut`'s exact-zero-area collinearity filter does not catch **near**-zero-area collinearity or
**near**-duplicate vertices. MVT tile encoding (used by the baked-tiles path that serves Córdoba)
quantises coordinates to an integer grid per tile before the reader dequantises them back to
lon/lat (`contextTiles.ts`, `@mapbox/vector-tile`'s `toGeoJSON`) — a well-documented source of
exactly this class of near-duplicate/near-collinear vertex noise: a real corner can land a
sub-centimetre-to-centimetre distance off the straight line between its neighbours after the
quantise/dequantise round-trip, or two originally-distinct vertices can become numerically adjacent.
When `earcut` builds its ear list against such a ring, the near-degenerate vertex can produce a
spurious "ear" that is clipped away — and because the artefact IS a triangle (earcut's fundamental
unit of work), the visible result is precisely a **triangular notch**, matching the founder's
description exactly. **This is the class of defect this investigation's fix targets.**

### 4. Baked-PMTiles vs. live-Overpass data mismatch — inconclusive, not the primary lead
Attempted a live comparison: geocoded "Calle de la Previsión, Córdoba" via Nominatim
(37.8793, -4.7900) and queried live Overpass for a ±0.003° bbox around it. The query returned 101
way-typed building footprints, all reported closed with ≥4 points and no obvious duplicate/
self-intersection flags — but this analysis was performed by summarising the JSON through a
best-effort web-fetch tool (a small LLM reading markdown-converted JSON), **not** by direct
programmatic inspection of the raw coordinate arrays, so it should be read as a weak signal, not a
verified negative. A direct `curl` to the same endpoint from this environment hit Overpass's "server
too busy" error, so an independently-verified raw-JSON comparison against the baked-tiles output for
the SAME bbox could not be completed. **This remains open** — see "What could not be verified."

## The fix implemented

Added a narrow, pure, defensive ring-sanitization pass and wired it into **both** collection
builders (so it protects the 2D MapLibre layer, the 3D extruder, the site-metric grids, and the
party-wall resolver — every consumer of `ContextBuildingFeature` — identically):

- **New file:** `apps/editor/src/ui/geospatial/contextRingGeometry.ts` — exports `sanitizeRing()`.
  - Removes near-duplicate consecutive vertices (metric epsilon, ~1 cm) and near-collinear interior
    vertices (metric twice-area epsilon, 1.0 m² — e.g. a 1 cm bow on a 10 m edge or a 2 cm bow on a
    25 m edge) — both are below any real building-corner geometry and above the observed
    float/quantisation noise scale; a genuine shallow architectural corner (tens of cm deviation)
    stays comfortably above the threshold and is kept (see the "shallow corner" test below).
  - **Never** makes an already-simple ring worse: if the repair would collapse the ring below a
    valid triangle (3 distinct vertices + closing point), it returns the **original, unmodified**
    ring rather than degrade it. Pure, deterministic, never throws.
- **Wired in:**
  - `apps/editor/src/ui/geospatial/contextBuildings.ts` `overpassToCollection()`'s `push()` — the
    ring is sanitized right after closing, before being stored on the feature.
  - `apps/editor/src/ui/geospatial/contextBuildings.ts` `tilesToCollection()` — each `tf.rings[part]`
    is sanitized before being stored.
- **Deliberately NOT touched:** `CesiumViewport.ts` (the render/extrusion call sites), any
  rule-pack, any `*_VERIFIED` flag, the buildable-envelope pipeline, or `contextTiles.ts`'s
  `ringsFor()` (the hole-dropping policy is a documented, separate decision, not part of this
  defect).

## Tests added

`apps/editor/src/ui/geospatial/__tests__/contextRingGeometry.spec.ts` (pure, no Cesium/WebGL
dependency — matches the existing pattern in this directory, e.g. `contextBuildingQuery.spec.ts`):

- **Regression** — a clean rectangular footprint and a genuine concave L-shaped footprint both pass
  through byte-for-byte unchanged.
- **Repair** — a rectangle with one vertex nudged by ~2 cm (simulating quantisation noise) collapses
  back to a clean quadrilateral; a vertex on an edge nudged ~1 cm off the straight line (the
  near-collinear "lost ear" defect class) is pruned.
- **Real geometry preserved** — a genuine shallow-angle corner (~2 m deviation over a 10 m span) is
  correctly kept, so the fix cannot misclassify real architectural detail as noise.
- **Never-worse guard** — a pathological ring where sanitizing "correctly" would collapse it below a
  triangle instead returns the original input unchanged; the sanitizer always returns a closed ring
  when it does modify one.

## What was confirmed vs. what remains uncertain

**Confirmed (static analysis + package source inspection):**
- The exact code path from OSM/tile ring → Cesium `PolygonHierarchy` → `earcut` triangulation, with
  file:line citations above.
- Neither source path performed any ring validation/repair before this fix.
- `earcut`'s own filtering only catches **exact** zero-area/duplicate cases, not near-zero float
  noise — a real, general gap, not a guess.
- Córdoba is served by the baked-PMTiles path (whole-Spain bake), which is the path most exposed to
  MVT quantisation noise.

**NOT confirmed — this investigation could not verify, and is stating that honestly rather than
guessing:**
- Whether the SPECIFIC building the founder pointed at actually has a near-degenerate vertex in its
  baked-tile ring. This would require either (a) live GPU rendering + a screenshot of this fix
  applied at that exact location, or (b) pulling and diffing the actual baked `.pmtiles` bytes for
  the Córdoba tile against a fresh Overpass fetch for the same way, neither of which this environment
  could do (no GPU/browser session, and the direct live-Overpass fetch failed with a
  "server too busy" error rather than returning data this session could inspect programmatically).
- Whether a genuine self-intersecting ring (candidate #2) is present anywhere in the Córdoba bake —
  not repaired by this fix, and worth checking if the founder still sees the artefact after this
  change ships.
- Whether the visual "black" component of the void is purely a missing triangle (no fragment drawn,
  showing the terrain/background through the gap) vs. a lighting/shadow artefact compounding a real
  geometry gap — both would look similar in a screenshot and could not be distinguished without a
  live render.

## Recommended follow-up if the symptom persists after this fix ships

1. Get the founder to reproduce the exact building on a build with this fix and re-screenshot the
   same viewpoint — the fastest and most conclusive test available.
2. If it persists, pull the actual baked `buildings.pmtiles` bytes for the z16 tile covering
   `-4.7900, 37.8793` and decode the specific building's ring directly (not through a summarizing
   tool) to check for genuine self-intersection, which this fix does not repair.
3. If self-intersection is confirmed, the next narrow step is a proper polygon-repair pass (e.g.
   even-odd self-intersection resolution) — a larger, separate change from this one.
