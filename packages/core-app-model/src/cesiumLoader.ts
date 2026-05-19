/**
 * cesiumLoader.ts
 *
 * PERF-FIX-#1: Lazy Cesium loader.
 *
 * Cesium is ~2 MB minified. Statically importing it in Layout.ts pulled the
 * entire library into the EngineBootstrap bundle unconditionally — even for
 * users who never open the GIS panel.
 *
 * This module provides a single getCesium() helper that dynamically imports
 * Cesium only when it is first needed (GIS panel activation or GLB placement).
 * Subsequent calls return the already-resolved module instantly via the cached
 * promise, so there is zero overhead after the first load.
 *
 * Contract compliance:
 *   §01: Additive only — no existing behaviour changed.
 *   §05: No UI state side-effects.
 */

let _cesiumPromise: Promise<typeof import('cesium')> | null = null;

/**
 * Returns the Cesium namespace, loading it on demand the first time.
 * Safe to call multiple times — the import() is executed at most once.
 */
export function getCesium(): Promise<typeof import('cesium')> {
    if (!_cesiumPromise) {
        _cesiumPromise = import('cesium');
    }
    return _cesiumPromise;
}
