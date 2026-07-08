// §FIX-GISLAYOUT-PLACE-REAL-MODEL-FORMA-AND-GLOBE-REENTRY (L-193) — unit tests for the PURE
// view-switch decision helpers that back the two founder-visible Cesium regressions. The live
// Cesium viewport cannot run headless, so we pin the DECISION logic (which entry point runs,
// reuse-vs-re-export, cache invalidation) here — the same approach as
// GlobeClampToPhotorealTiles.test.ts (selectPhotorealTileBaseHeight) and the L-186
// shouldReuseGlobeRealModel SSOT. The helpers are pure (no Cesium import), so no stub needed.

import { describe, it, expect } from 'vitest';
import {
    decideGlobeReactivationAction,
    decideFormaRealPlacement,
    invalidateFormaRealCacheOnPhotorealGlobeEntry,
    type FormaRealCacheState,
} from '../src/ui/geospatial/globePlacementDecisions';

describe('§L-193 Symptom B — decideGlobeReactivationAction (toggleGIS re-activation branch)', () => {
    it('LEGACY placeBimOnEarth building → re-sync via loadBimGltf (unchanged behaviour)', () => {
        // Preserved exactly: a building placed via the legacy path is re-synced, never doubled
        // with the modern real-model overlay — independent of the suppression flag.
        expect(decideGlobeReactivationAction({ isBimPlacedOnEarth: true, selfPlaceSuppressed: false }))
            .toBe('legacy-gltf-resync');
        expect(decideGlobeReactivationAction({ isBimPlacedOnEarth: true, selfPlaceSuppressed: true }))
            .toBe('legacy-gltf-resync');
    });

    it('DIRECT globe re-entry of a modern real-model building → restore the real model (the fix)', () => {
        // nav-rail GIS button / onboarding pryzmToggleGIS: nobody else places → the branch must
        // re-place + reframe (was: nothing ran → empty globe / "building is gone").
        expect(decideGlobeReactivationAction({ isBimPlacedOnEarth: false, selfPlaceSuppressed: false }))
            .toBe('restore-real-model');
    });

    it('orchestrator self-places (applyResultView / engageFormaCesium) → skip (no double-place)', () => {
        expect(decideGlobeReactivationAction({ isBimPlacedOnEarth: false, selfPlaceSuppressed: true }))
            .toBe('skip');
    });
});

describe('§L-193 Symptom A — decideFormaRealPlacement (Forma "3D Site" real-model cache)', () => {
    const base = {
        fidelity: 'real' as const,
        hasViewportApi: true,
        exporting: false,
        currentSig: 'sig-v1',
        cache: { lastSig: null, placed: false } satisfies FormaRealCacheState,
    };

    it('massing fidelity → keep the abstract study blocks', () => {
        expect(decideFormaRealPlacement({ ...base, fidelity: 'massing' })).toBe('skip-massing-fidelity');
    });

    it('viewport lacks the API (old build) → keep massing', () => {
        expect(decideFormaRealPlacement({ ...base, hasViewportApi: false })).toBe('skip-no-viewport-api');
    });

    it('export already in flight → skip', () => {
        expect(decideFormaRealPlacement({ ...base, exporting: true })).toBe('skip-export-in-flight');
    });

    it('FIRST entry (no cache) → export and place', () => {
        expect(decideFormaRealPlacement(base)).toBe('export-and-place');
    });

    it('unchanged geometry AND a live placed model → reuse (no re-export)', () => {
        expect(decideFormaRealPlacement({
            ...base,
            currentSig: 'sig-v1',
            cache: { lastSig: 'sig-v1', placed: true },
        })).toBe('reuse-placed');
    });

    it('geometry edited (signature changed) → re-export even though a model is placed', () => {
        expect(decideFormaRealPlacement({
            ...base,
            currentSig: 'sig-v2',
            cache: { lastSig: 'sig-v1', placed: true },
        })).toBe('export-and-place');
    });
});

describe('§L-193 Symptom A — globe→forma→globe round-trip re-places the real house', () => {
    it('after the photoreal globe destroys the Forma primitive, the cache invalidation forces a re-export', () => {
        // 1. On the Forma "3D Site" view the real model was placed and the cache remembers it.
        let cache: FormaRealCacheState = { lastSig: 'sig-v1', placed: true };
        // While still on Forma with unchanged geometry, we correctly REUSE (no wasteful re-export).
        expect(decideFormaRealPlacement({
            fidelity: 'real', hasViewportApi: true, exporting: false, currentSig: 'sig-v1', cache,
        })).toBe('reuse-placed');

        // 2. The user switches to the photoreal "3D globe": entering it runs
        //    CesiumViewport.restorePhotorealMode() → clearRealModelOnForma(), DESTROYING the
        //    Forma real-model primitive. GISAreaLayout invalidates its cache to match.
        cache = invalidateFormaRealCacheOnPhotorealGlobeEntry();
        expect(cache).toEqual({ lastSig: null, placed: false });

        // 3. The user switches BACK to Forma "3D Site". WITHOUT the invalidation (the pre-fix
        //    bug) the cache would still say placed:true/sig-v1 → 'reuse-placed' → the destroyed
        //    model is "reused" → the massing prism stays on screen (the founder's regression).
        //    WITH the invalidation the decision is 'export-and-place' → the real house re-renders.
        expect(decideFormaRealPlacement({
            fidelity: 'real', hasViewportApi: true, exporting: false, currentSig: 'sig-v1', cache,
        })).toBe('export-and-place');
    });
});
