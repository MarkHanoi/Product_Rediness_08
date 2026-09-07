/**
 * pointerSurface — WHICH VIEW SURFACE was the pointer over?
 *
 * §PROBE-CANNOT-CONFUSE-NA-WITH-FAILURE (L-13209 · §CONTEXT-DATA-HONESTY · C59 §1.4)
 *
 * ⭐ THE DEFECT THIS EXISTS TO REMOVE. The founder double-clicked, nothing happened, and the
 * console printed four copies of:
 *
 *     [dblclick-zoom] §PROBE-DBLCLICK-ZOOM-WHICH-ARM returned at: raycast MISS and no usable fallback
 *
 * That sentence was not true and could not be. The `dblclick` handler lives on `#container`, and
 * the other view surfaces are DESCENDANTS of `#container`: the single Cesium container
 * (`#cesium-viewport-container`, re-parented into whichever pane hosts 3D Site — C59 §1.3) and
 * the MapLibre 2D site map. **Neither registers a `dblclick` handler of its own**, so the event
 * bubbles up into a handler that raycasts the BIM three.js world and frames `world.camera.controls`.
 * Cesium is a different camera on a different scene graph; even a HIT would have moved a camera
 * the user is not looking through.
 *
 * ⚠ Worse than a miss: over Cesium the raycast is not even measured where he clicked. The OBC
 * raycaster's `Mouse` listens for `pointermove` on the BIM canvas, and the Cesium container COVERS
 * that canvas as a sibling at z-index 15 — so no pointermove over Cesium ever reaches the listener
 * and the caster still holds the last position the pointer had over the BIM canvas. The reported
 * MISS was a stale-coordinate raycast against a scene the click had nothing to do with.
 *
 * **A diagnostic that prints the same sentence for "this surface does not do this" and "this
 * surface does this and it failed" is the defect it exists to prevent.** That is the whole point
 * of this module: it is what lets the probe say NOT APPLICABLE.
 *
 * ⛔ POSITIVE IDENTIFICATION ONLY — never "not the BIM canvas ⇒ not BIM". Room labels, gizmo
 * chrome, measurement overlays and every other DOM overlay sit ABOVE the BIM canvas and are
 * legitimate BIM-surface targets; a negative test would break `§ROOM-LABEL-EDIT` and anything
 * else that double-clicks an overlay. An unrecognised target is `'bim'`, which is exactly the
 * behaviour that shipped before this module — so adding it can only ADD honesty, never remove a
 * working path.
 */

export type ViewSurface = 'cesium-3d-site' | 'maplibre-2d-site' | 'bim';

/**
 * The DOM markers that positively identify a non-BIM view surface.
 *
 * · `#cesium-viewport-container` — set in `CesiumViewport`'s constructor; it is the ONE container
 *   node, re-parented between panes rather than duplicated (§L-412), so the id is stable wherever
 *   the globe currently lives.
 * · `.maplibregl-map` — applied by MapLibre GL itself to whatever element it is given as
 *   `container`. Library-guaranteed, so it does not rot when PRYZM renames its own wrapper.
 */
const SURFACE_MARKERS: ReadonlyArray<readonly [selector: string, surface: ViewSurface]> = [
    ['#cesium-viewport-container', 'cesium-3d-site'],
    ['.maplibregl-map', 'maplibre-2d-site'],
];

/** Which view surface owns this pointer target? Defaults to `'bim'` for anything unrecognised. */
export function surfaceUnderPointer(target: EventTarget | null | undefined): ViewSurface {
    const el = target as Element | null | undefined;
    if (!el || typeof (el as Element).closest !== 'function') return 'bim';
    for (const [selector, surface] of SURFACE_MARKERS) {
        try {
            if (el.closest(selector)) return surface;
        } catch {
            /* an exotic selector engine — fall through to 'bim', never throw out of a UI handler */
        }
    }
    return 'bim';
}

/**
 * Does the BIM three.js pick + camera-frame path apply to this surface at all?
 *
 * `false` is NOT a failure — it is "this handler does not own this surface". Keeping the two
 * apart is the entire contribution of this module.
 */
export function bimPickingApplies(surface: ViewSurface): boolean {
    return surface === 'bim';
}

/**
 * The sentence the probe prints when the pointer was over a surface this handler does not own.
 *
 * ⚠ It states a MISSING FEATURE, not a failure. Double-click-to-frame on the Cesium globe or the
 * 2-D map is a real thing to want and it does not exist; it belongs to whoever owns that surface
 * and is tracked as **L-13210**. What this removes is the false claim that the BIM pick was tried
 * there and missed.
 */
export function notApplicableReason(surface: ViewSurface): string {
    return (
        `NOT APPLICABLE — the pointer is over the '${surface}' surface, which this handler does ` +
        `not own. It raycasts the BIM three.js world and frames the BIM camera; that surface has ` +
        `its own camera, so no result here could be correct. Double-click framing is NOT ` +
        `IMPLEMENTED for it (L-13210) — this is not a failed pick.`
    );
}
