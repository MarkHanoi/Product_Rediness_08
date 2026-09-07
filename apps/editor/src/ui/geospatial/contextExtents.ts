// contextExtents.ts — §CTX-WARM-ALL-LAYERS (founder 2026-08-10, GIS speed) — the SHARED wide
// context extents, extracted from `CesiumViewport.ts` so the onboarding context warm-up can
// pre-read EXACTLY the bboxes the 3D-Site render will later ask for WITHOUT importing the
// multi-MB Cesium chunk. One authority: `CesiumViewport` imports these same constants, so the
// warm-up and the render can never drift onto different tile keys.
//
// Cesium-free by design (numbers only) — safe to import from any onboarding/UI module.

import { CONTEXT_BBOX_HALF_DEG } from './contextBuildings';
// §CTX-EXTENT-BUDGET (L-13058) — the ONE tunable table for every 3D-Site context radius/cap.
// These two extents are NOT widened by that lane (they are already 8 km / 11 km and are read at a
// coarse zoom); they derive from it so the whole family is tuned in one place.
import { CTX_WIDE_HALF_DEG_MULTIPLE, CTX_SEA_HALF_DEG_MULTIPLE } from './contextExtentBudget';

/**
 * §FORMA-CTX-WIDE-EXTENT (L-642, founder 2026-07-29 — "the grey should cover all urban areas out
 * of the circle") — the CHEAP land-use drape is fetched + drawn over a MUCH wider extent than the
 * buildings so the whole visible city reads as coloured ground, not a small grey patch on brown.
 * Sound to widen because land-use is a handful of large FLAT polygons; it does NOT touch the
 * extruded building tiers (ADR-0094 budget unchanged). §CONTEXT-DATA-HONESTY: a wider read that
 * finds no land-use still degrades to a quiet no-op, never fabricated grey.
 */
export const CONTEXT_WIDE_HALF_DEG = CONTEXT_BBOX_HALF_DEG * CTX_WIDE_HALF_DEG_MULTIPLE;   // 0.072° ≈ 8 km radius (city ground)

/**
 * §FORMA-CTX-SEA-EXTENT (L-642, founder — "the sea should … cover all the sea, the immensity") —
 * the SEA gets its OWN, much larger extent than the city ground so open water reads as vast.
 * Sea is ONE big flat polygon clipped to the real coast (§SEA-WATER-SIDE-ROBUST), so a large
 * extent is cheap + honest — inland it is a quiet no-op. ~11 km radius: past the horizon of a
 * normal 3D-Site zoom, so the coast stops reading as an island edge.
 */
export const CONTEXT_SEA_HALF_DEG = CONTEXT_BBOX_HALF_DEG * CTX_SEA_HALF_DEG_MULTIPLE; // 0.10° ≈ 11 km radius (the immensity)
