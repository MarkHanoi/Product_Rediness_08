// §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193) — PURE decision
// helpers for the GISAreaLayout Cesium view-switch orchestration. No THREE, no DOM,
// no Cesium, no I/O — deterministic reductions that pin the two founder-visible
// regressions' logic so they are unit-testable WITHOUT a live Cesium viewer (which
// cannot run headless). Mirrors the precedent `CesiumViewport.shouldReuseGlobeRealModel`
// (L-186) — pure decisions are P8 span-exempt.
//
// The two symptoms both root in one file (GISAreaLayout.ts) and one class of bug:
// a view-switch DESTROYS a Cesium primitive while a caller-side "already placed"
// cache flag stays stale-true, so re-entry short-circuits to an EMPTY view.
//   • Symptom A — Forma "3D Site" shows the massing prism, not the real house, after a
//     globe→forma round-trip: entering the photoreal globe runs
//     `CesiumViewport.restorePhotorealMode()` which calls `clearRealModelOnForma()`,
//     destroying the Forma real-model primitive. The GISAreaLayout Forma cache
//     (`formaRealPlaced` / `formaRealLastSig`) was NOT invalidated, so the next Forma
//     entry's `placeRealModelOnForma` reused a destroyed model (no re-export) and left
//     the massing fallback on screen. This is the exact L-186 gap on the Forma side.
//   • Symptom B — the globe loses the building on a DIRECT re-entry (nav-rail GIS
//     button / onboarding `pryzmToggleGIS`, NOT the result-toggle bar): the `toggleGIS`
//     re-activation branch only re-loaded via the LEGACY `loadBimGltf` gated on
//     `isBimPlacedOnEarth`, and never re-ran the modern real-model placement + reframe.

/** Which action the `toggleGIS` re-activation branch should take on globe re-entry. */
export type GlobeReactivationAction =
    /** Legacy `placeBimOnEarth` path: re-export + `loadBimGltf` (no camera fly). */
    | 'legacy-gltf-resync'
    /** Modern real-model path: re-place on the photoreal globe + reframe (idempotent). */
    | 'restore-real-model'
    /** A higher-level orchestrator drives its own post-mount placement — do nothing. */
    | 'skip';

export interface GlobeReactivationInput {
    /** True when the building was placed via the LEGACY `placeBimOnEarth` (loadBimGltf) path. */
    isBimPlacedOnEarth: boolean;
    /**
     * True while an orchestrator (`applyResultView('3D')` / `engageFormaCesium`) drives
     * its OWN post-mount placement around its `toggleGIS(true)` call, so the re-activation
     * branch must NOT also place (avoids a double-place / fighting the Forma mode). Direct
     * entries (nav-rail GIS button, onboarding) leave it false → the branch restores the globe.
     */
    selfPlaceSuppressed: boolean;
}

/**
 * §FIX-GISLAYOUT-…-GLOBE-REENTRY (Symptom B) — decide what the `toggleGIS` re-activation
 * branch does. The LEGACY GLB re-sync is preserved exactly (unchanged when the building was
 * placed via `placeBimOnEarth`); the NEW behaviour restores the modern real-model globe
 * placement on the direct re-entry paths that previously did nothing. Pure + deterministic.
 */
export function decideGlobeReactivationAction(input: GlobeReactivationInput): GlobeReactivationAction {
    // Legacy path is authoritative + independent (preserves the pre-existing behaviour):
    // a building placed via placeBimOnEarth is re-synced through loadBimGltf, never doubled
    // with the real-model overlay.
    if (input.isBimPlacedOnEarth) return 'legacy-gltf-resync';
    // An orchestrator is about to place on its own — don't double-place.
    if (input.selfPlaceSuppressed) return 'skip';
    // Direct re-entry (nav-rail / onboarding) of a modern real-model building — restore it.
    return 'restore-real-model';
}

/** The GISAreaLayout-side perf cache for the REAL model on the Forma "3D Site" study. */
export interface FormaRealCacheState {
    /** The building geometry signature at the last successful real-model placement. */
    lastSig: string | null;
    /** True once a real model was actually placed on the Forma study. */
    placed: boolean;
}

/** What `placeRealModelOnForma` should do, given fidelity + cache + export state. */
export type FormaRealPlacementAction =
    /** Fidelity is 'massing' — the study look was chosen; keep the abstract blocks. */
    | 'skip-massing-fidelity'
    /** The viewport lacks `renderRealModelOnForma` (old build) — keep massing. */
    | 'skip-no-viewport-api'
    /** An export is already in flight — let it complete. */
    | 'skip-export-in-flight'
    /** Geometry unchanged AND a live model is placed — reuse it (no re-export). */
    | 'reuse-placed'
    /** Re-export the GLB and place the real model. */
    | 'export-and-place';

export interface FormaRealPlacementInput {
    fidelity: 'massing' | 'real';
    /** Whether `CesiumViewport.renderRealModelOnForma` exists on the live viewport. */
    hasViewportApi: boolean;
    /** Whether a GLB export for the Forma real model is currently in flight. */
    exporting: boolean;
    /** The building geometry signature computed NOW. */
    currentSig: string;
    cache: FormaRealCacheState;
}

/**
 * §FIX-GISLAYOUT-…-FORMA (Symptom A) — decide whether `placeRealModelOnForma` reuses the
 * cached placement or re-exports. The reuse conjuncts mirror the L-186 globe SSOT
 * (`shouldReuseGlobeRealModel`): reuse ONLY when a model was placed AND the signature is
 * unchanged. The FIX is upstream — `invalidateFormaRealCacheOnPhotorealGlobeEntry()` clears
 * `placed`/`lastSig` when the photoreal globe destroys the Forma primitive — so after a
 * globe round-trip this returns 'export-and-place' instead of a stale 'reuse-placed'.
 */
export function decideFormaRealPlacement(input: FormaRealPlacementInput): FormaRealPlacementAction {
    if (input.fidelity !== 'real') return 'skip-massing-fidelity';
    if (!input.hasViewportApi) return 'skip-no-viewport-api';
    if (input.exporting) return 'skip-export-in-flight';
    if (input.cache.placed && input.cache.lastSig !== null && input.currentSig === input.cache.lastSig) {
        return 'reuse-placed';
    }
    return 'export-and-place';
}

/**
 * §FIX-GISLAYOUT-…-FORMA (Symptom A) — entering the photoreal globe runs
 * `CesiumViewport.restorePhotorealMode()` → `clearRealModelOnForma()`, DESTROYING the Forma
 * study real-model primitive. Return the invalidated Forma cache so the NEXT Forma "3D Site"
 * entry re-exports + re-places the real house (instead of reusing a destroyed model and
 * leaving the massing prism on screen). Mirrors the L-186 liveness invalidation on the globe
 * side, expressed as a state transition because CesiumViewport exposes no `hasRealModelOnForma`.
 */
export function invalidateFormaRealCacheOnPhotorealGlobeEntry(): FormaRealCacheState {
    return { lastSig: null, placed: false };
}
