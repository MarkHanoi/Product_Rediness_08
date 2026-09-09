{
  "defectId": "GLOBE-MODEL-FLOATS-~13m-ABOVE-PHOTOREAL-TILES (§GLOBE-SLOPE-SEAT, regression of L-12919 / commit c36b75bc)",
  "rootCauseFound": true,
  "rootCause": "CONFIRMED, and the arithmetic reproduces the founder's console exactly. `reduceTileGroundHeight` seats the whole globe scene on `classifyTileGroundPicks`, a discriminator with exactly two thresholds applied to a SORTED 1-D list of heights (globeGroundAnchor.ts:198-216): span = median − p10 > 6 m rules out `plateau`; largest consecutive step in the low half > 4 m rules out `roof-gap`; everything else falls through to `slope`, which seats at the ring MEDIAN (`:279`). The founder's ring is 58 picks, span 12.59 m, largest step 2.00 m — so it takes the `slope` arm, and seat = median 78.94 − GLOBE_GROUND_SEAT_EPSILON_M 0.30 = 78.64 m, which is byte-for-byte the console's `-> seat 78.64`. The lowest credible pick is 64.89 m, so the building, the massing and the white void cap are all seated 13.75 m above the lowest measured street cell — dead centre of the reported 10-14 m. Under the pre-L-12919 rule the seat would have been p10 − 0.30 = 66.05 m, i.e. flush; this defect is a three-day-old regression from commit c36b75bc (2026-09-05, the Sète hillside fix). WHY THE DISCRIMINATOR CANNOT WORK, ARCHITECTURALLY: `safeSampleTileHeights` (CesiumViewport.ts:9014-9036) compacts the sampler result into a bare `number[]`, discarding the (lon,lat) of every pick before the classifier ever runs. Slope and roofs differ only in whether height is a FUNCTION OF POSITION; once position is thrown away the two are genuinely indistinguishable, and no threshold on a sorted list can recover it. The `roof-gap` escape assumes the roof population is separated from the ground by a clean ≥4 m gap — true of the synthetic fixture in GlobeGroundAnchor.test.ts:473-480, false of a photoreal mesh, which is one CONTINUOUS surface that drapes from kerb up the facade to the cornice and so fills the gap with a dense continuum (measured largest step: 2.00 m). The ring also guarantees the roof-heavy input: when photoreal tiles are active the in-parcel picks are deliberately skipped (:9203-9210), so all 58 picks come from vertices pushed 1.7x outward plus two 16-point compass rings at ext+25 m and ext+55 m — i.e. entirely in the neighbours' territory, which in a dense wall-to-wall block is mostly buildings.",
  "evidence": [
    {
      "file": "apps/editor/src/ui/geospatial/globeGroundAnchor.ts",
      "line": 213,
      "quote": "if (spanM <= SLOPE_RAMP_MIN_SPAN_M) return { arm: 'plateau', lowM, medianM, spanM, maxGapM };\n    if (maxGapM > ROOF_GAP_M) return { arm: 'roof-gap', lowM, medianM, spanM, maxGapM };\n    return { arm: 'slope', lowM, medianM, spanM, maxGapM };",
      "why": "The entire discriminator. Two scalar thresholds (SLOPE_RAMP_MIN_SPAN_M=6 at :167, ROOF_GAP_M=4 at :172) over a sorted list. The founder's span 12.59 > 6 and largest step 2.00 <= 4, so it falls through to 'slope' by elimination — 'slope' is the DEFAULT arm, not a positively-established finding."
    },
    {
      "file": "apps/editor/src/ui/geospatial/globeGroundAnchor.ts",
      "line": 279,
      "quote": "if (cls.arm === 'slope' && cls.medianM !== null) return cls.medianM - seatEpsilonM;",
      "why": "The 'slope' arm seats on the ring MEDIAN. With 58 picks the median index is floor(0.5*58)=29 -> 78.94 m, which the log prints, and 78.94 - 0.30 = 78.64 = the console's seat. Exact reproduction, so there is no other contributor to the vertical error."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 619,
      "quote": "const GLOBE_GROUND_SEAT_EPSILON_M = 0.3;",
      "why": "Closes the arithmetic: seat 78.64 = median 78.94 - 0.30 exactly. Nothing else touches the number between the classifier and formaTerrainBaseHeight."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 9014,
      "quote": "static async safeSampleTileHeights<T>(\n    sampler: (() => Promise<T[]>) | undefined,\n    extract: (item: T) => number | null | undefined,\n  ): Promise<number[]> {",
      "why": "THE ARCHITECTURAL ROOT. It returns number[] — the pick's (lon,lat) is destroyed at the sampling boundary (`out.push(h)` only, and non-finite entries are dropped so even the index correspondence to samplePts is gone). Every downstream discriminator is therefore forced into a 1-D domain in which 'ramp' and 'sorted sequence of roof heights' are the SAME OBJECT."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 9203,
      "quote": "const parcelVoidCut = this.photorealTilesActive;\n      if (!parcelVoidCut) {\n        samplePts.push(centroidLL);\n        for (const p of boundaryEnu) samplePts.push(enuToLatLon(p.east, p.north));",
      "why": "With photoreal tiles active (this run) every in-parcel pick is skipped. All 58 picks come from the pushed-out ring: boundary vertices at 1.7x plus 16 points at ext+25 m and 16 at ext+55 m (:9241-9246). In a dense block those radii land on neighbouring buildings, so a roof-majority ring is the DESIGNED input, not an accident."
    },
    {
      "file": "apps/editor/__tests__/GlobeGroundAnchor.test.ts",
      "line": 473,
      "quote": "const dense = [...Array.from({ length: 20 }, (_, i) => 50 + (i % 4) * 0.2), ...Array.from({ length: 28 }, (_, i) => 65 + (i % 7) * 1.5)];",
      "why": "The only test defending the roof case builds a synthetic bimodal set with a clean 14 m gap between street and roofs. A photoreal mesh never produces that gap because facades are part of the same continuous surface — this is the repo's own documented 'fake more capable than real' shape: a fixture built from the header cannot falsify the header."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 13120,
      "quote": "inVoid = pointInRingEvenOdd(\n          anchor.lon, anchor.lat, parcel.length, (i) => parcel[i]![0], (i) => parcel[i]![1],\n        ) ? 'y' : 'n';",
      "why": "SECOND ANOMALY. The probe classifies a single POINT (`realModelOnGlobeOrigin`, set from input.originLat/Lon at :17457) against the parcel ring — but the object placed there is an extended GLB whose vertices are authored in the same LTP-ENU scene frame, so the body still covers the parcel. 'anchor-in-void=n' does not entail 'buried'."
    },
    {
      "file": "apps/editor/src/ui/site/boundaryProjection.ts",
      "line": 142,
      "quote": "export function parcelFrameOrigin(ring: ReadonlyArray<LatLon>): LatLon | null {\n    const first = ring[0];\n    return first ? { lat: first.lat, lon: first.lon } : null;",
      "why": "With SiteBoundaryDrawTool.ts:283 (`const origin = parcelFrameOrigin(this.vertices) ?? { lat: this.vertices[0]!.lat, ... }`) this proves the model anchor IS the parcel's first vertex — a point lying exactly ON the ring the probe tests it against. 28.6 m to the centroid is the expected corner->centroid distance of a ~40-60 m parcel, not a displacement."
    },
    {
      "file": "packages/geometry-kernel/src/pure/pointInPolygon.ts",
      "line": 123,
      "quote": "the two forms differ in the\n  // last ulp, which can flip the `<` for a point lying exactly on the ray.",
      "why": "The kernel says in its own words that an on-boundary point is the ulp-indeterminate case for even-odd. Since the anchor IS a ring vertex, 'anchor-in-void=n' is expected noise for a correctly placed model — the probe's confident conclusion is not supported by its own test."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 13037,
      "quote": "const top = this.formaTerrainBaseHeight - PHOTOREAL_VOID_CAP_SEAT_EPSILON_M;",
      "why": "The white void plug is seated on the SAME bad datum (constants at :653 depth 60 m, :660 epsilon 0.05). At seat 78.64 its top face floats ~13.7 m above the street too — a white slab poking out of the city. Confirms one seat bug drives the whole visual, not two independent defects."
    }
  ],
  "proposedFix": "Do NOT re-tune SLOPE_RAMP_MIN_SPAN_M or ROOF_GAP_M — any 1-D threshold is unfalsifiable here, and this bullet has already been tuned once (Sète) into the opposite failure. Stop discarding position first, then discriminate semantically.\n\n(0) PREREQUISITE. Change `safeSampleTileHeights` (CesiumViewport.ts:9014) to return `{ lat, lon, h }[]` parallel to `samplePts` instead of `number[]`. Without this nothing below is possible.\n\n(1) PRIMARY ARM — semantic mask, no statistics. NEGATIVE: drop any pick whose (lon,lat) falls inside a known context building footprint buffered ~3 m outward (to catch the mesh's facade drape). The data is already in memory — `contextBuildingPlacements[].feature.geometry.coordinates[0]` is [lon,lat] (contextBuildings.ts:89-95) — and `pointInRingEvenOdd` is already imported at CesiumViewport.ts:309 and already used exactly this way at :14814. POSITIVE: prefer picks lying on an OSM road centreline / within its carriageway half-width; `loadContextRoads` (:13718) already holds the ways. Seat = low quantile of the surviving picks. The slope/plateau arms then become unnecessary: they exist only because ground and roof were indistinguishable.\n\n(2) SECOND ARM — bare-earth cross-check, independent source, SAME datum. On the globe path `maybeAttachTerrainProvider` runs (:5250) and `contextGroundCache` already holds `sampleTerrainMostDetailed` heights; the baked terrain is ellipsoidal WGS-84 (terrain.mjs bakes the napToEllipsoidal geoid lift — see the maybeAttachTerrainProvider header at :10984ff). Compute r_i = pick_i − terrain(lat_i,lon_i). Ground picks cluster at r ≈ c (a constant tile-vs-terrain bias); roofs sit at c + storeys. Set c = low quantile of r so ANY constant datum bias cancels, then classify ground as r_i − c <= ~2.5 m. This is immune to the ADR-0268 §156 / L-142 objection because terrain is used as SHAPE only — the seat still comes from the photoreal picks themselves, never from terrain.\n\n(3) FALLBACK ARM — fit a plane, do not sort a list. Least-squares h ≈ a·east + b·north + c, trimmed to the lower envelope (fit, drop picks >2.5 m above the plane, refit, 3x). Declare `slope` only when the inliers cover >= ~60% of picks AND residuals are symmetric AND |grad h| = hypot(a,b) is in a plausible terrain range. Seat at the plane evaluated AT THE PARCEL CENTROID — not the ring median. That is the correct estimator on a real hillside too (a ring median equals the centre value only for a symmetric ring and a linear slope), so this collapses both arms into one and fixes Sète more correctly than L-12919 did. A one-sided POSITIVE residual tail is itself the roof signature; print its skew.\n\n(4) RELATIVE CEILING (cheap, ship first). Whatever arm wins, refuse a seat above min_credible + |grad h|·R_ring. On this data that is ~64.89 + 0.02·60 ≈ 66.1 m and rejects 78.64 outright. This is what the retired absolute §GLOBE-FLOAT-SAFETY cap was reaching for, expressed relatively so Paris's genuinely elevated ~80 m ground is untouched.\n\n(5) TESTS. Replace the synthetic bimodal fixture (GlobeGroundAnchor.test.ts:473-480) with the REAL 58-value Barcelona pick set captured from the founder's session. Add the Sète ring as the second real corpus. A discriminator that passes only on hand-built distributions is the defect, not the guard.\n\n(6) SECOND ANOMALY. Delete or requalify the `anchor-in-void` verdict at CesiumViewport.ts:13120-13122. Test the MODEL'S FOOTPRINT against the void (or the anchor with an explicit on-boundary tolerance), not the anchor point, since the anchor is by construction the parcel's first vertex. As written the probe prints a scary, confident, almost-always-'n' verdict for a correctly placed building — the exact §CONFIDENT-REGISTER-ROWS shape it was written to prevent.",
  "confidence": "high",
  "rivalHypothesesRuledOut": [
    "GENUINE HILLSIDE — the seat is right and something else floats. RULED OUT (medium-high) by the QUARTILE SHAPE, computed from the founder's own printed numbers: Q1 (min->p25) = 4.04 m while Q2/Q3/Q4 = 10.01 / 9.62 / 11.10 m, against 8.69 m each for a uniform ramp. A compressed low tail with three wide upper quartiles is a ground plateau with a building population above it; a hillside gives near-equal quartiles (Sète's own fixture, GlobeGroundAnchor.test.ts:456, is a perfectly uniform 74 m ramp). Also 34.77 m of relief inside a ring of radius ~ext+55 m implies a ~20-40% grade. NOT fully ruled out: the excerpt gives no site lat/lon, so I could not check the real terrain.",
    "GLB PIVOT / DOUBLE-ADDED STOREY (the model's own origin carries a level elevation added on top of the base). RULED OUT: the float tracks the ring statistics exactly — seat 78.64 = median 78.94 - 0.30, and 78.64 - 64.89 = 13.75 m above the lowest pick. A pivot error would be a fixed offset independent of the pick distribution, and the pre-L-12919 rule on this same data gives 66.05 m, i.e. flush.",
    "GEOID / VERTICAL-DATUM ERROR (the L-259 / L-477 class). RULED OUT: a datum error is a constant offset applied to every pick, but min (64.89) and median (78.94) come from the SAME sampler in the SAME ellipsoidal datum. The defect is which of the two the reduction picks, not what either means.",
    "VOID FALL-THROUGH — §GLOBE-DONT-MEASURE-THE-HOLE (L-479), rays passing through the clipped parcel. RULED OUT twice: fall-through picks are LOW and would BURY, not float; and in-parcel picks are skipped entirely whenever tiles are active (CesiumViewport.ts:9203-9210), which is this run.",
    "ELLIPSOID FALL-THROUGH PICKS — §GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477). RULED OUT: those are rejected at |h| <= 2 m (globeGroundAnchor.ts:125) and, again, drag the seat DOWN.",
    "THE 28.6 m ANCHOR OFFSET IS THE VERTICAL BUG. RULED OUT: the anchor is horizontal-only; the seat height is a single scalar (formaTerrainBaseHeight) applied identically wherever the anchor is. NOT ruled out as a SEPARATE horizontal defect on the cadastral-SELECT path — I only verified the DRAW path sets origin = ring[0]."
  ],
  "whatWouldFalsifyThis": "Mask the picks and re-measure. Concretely: log each of the 58 picks WITH its (lon,lat) and, for each, (a) whether it falls inside a loaded OSM building footprint and (b) its baked-terrain height at the same point. My diagnosis is FALSIFIED if the picks outside every building footprint still span >6 m and rise monotonically with position — i.e. the ~14 m really is terrain and the parcel sits on a genuine 20-40% slope, in which case the median seat is correct and the float has another cause. It is also falsified if seating at the p10 (66.05 m) leaves the building visibly BURIED under the tiles rather than flush. Cheapest single check: the site's lat/lon (from the `§FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF ANCHOR EVIDENCE` block, CesiumViewport.ts:9611) against a contour map — a flat block refutes the hillside rival outright. Separately, for the second anomaly: that same block prints `anchor<->LTP` and a `⚠ DIVERGED — defect (ii)` flag; if it reads 0.0 m with no flag, `anchor-in-void=n` is confirmed noise, and if it reads a large separation my false-positive verdict is wrong and there IS a real horizontal georef defect.",
  "filesToChange": [
    "apps/editor/src/ui/geospatial/globeGroundAnchor.ts",
    "apps/editor/src/ui/geospatial/CesiumViewport.ts",
    "apps/editor/__tests__/GlobeGroundAnchor.test.ts"
  ]
}