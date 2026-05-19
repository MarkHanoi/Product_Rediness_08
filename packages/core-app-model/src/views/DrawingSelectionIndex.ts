/**
 * DrawingSelectionIndex — Contract 19, Phase 3
 *
 * Module-level WeakMap keyed on TechnicalDrawing that maps each projected
 * THREE.LineSegments object (native-element geometry) back to the element UUID
 * that produced it. This is the authoritative source for plan-view hitTest UUID
 * resolution.
 *
 * Contract 19 §7 rule:
 *   Element UUID tagging MUST be stored outside any PRYZM store.
 *   Use a module-level WeakMap<TechnicalDrawing, SegmentUUIDMap>.
 *
 * Architecture:
 *   - EdgeProjectorService calls registerSegmentUUID() once per projected
 *     LineSegments, immediately after OBC.TechnicalDrawing.toDrawingSpace().
 *   - PlanViewCanvas.hitTest() calls lookupElementUUID() as its primary UUID
 *     resolution path (before falling back to userData).
 *   - WeakMap semantics: when a TechnicalDrawing is garbage-collected (cache
 *     eviction), all associated LineSegments entries are automatically released.
 */

import * as THREE from '@pryzm/renderer-three/three';

/**
 * Maps a projected THREE.LineSegments → the element UUID that generated it.
 * One entry per projected LineSegments object (one per element per ISO layer).
 */
export type SegmentUUIDMap = WeakMap<THREE.LineSegments, string>;

const _index = new WeakMap<object, SegmentUUIDMap>();

/**
 * Register the element UUID for a projected LineSegments within a drawing.
 *
 * Called by EdgeProjectorService after each per-element native projection:
 *   registerSegmentUUID(drawing, projectedLineSegments, elementUUID)
 *
 * @param drawing       OBC TechnicalDrawing (used as the outer WeakMap key).
 * @param lineSegments  The projected LineSegments returned by toDrawingSpace().
 * @param elementUUID   The PRYZM element UUID that owns this geometry.
 */
export function registerSegmentUUID(
    drawing: object,
    lineSegments: THREE.LineSegments,
    elementUUID: string,
): void {
    let map = _index.get(drawing);
    if (!map) {
        map = new WeakMap<THREE.LineSegments, string>();
        _index.set(drawing, map);
    }
    map.set(lineSegments, elementUUID);
}

/**
 * Look up which element UUID owns a specific projected LineSegments.
 *
 * Returns null when:
 *  - The drawing has no registered entries (IFC-only drawing).
 *  - The LineSegments was not tagged (e.g. IFC projection geometry, symbol
 *    bridges like DoorPlanSymbolBuilder).
 *
 * @param drawing      OBC TechnicalDrawing.
 * @param lineSegments The LineSegments child being tested in hitTest().
 * @returns            PRYZM element UUID, or null.
 */
export function lookupElementUUID(
    drawing: object,
    lineSegments: THREE.LineSegments,
): string | null {
    return _index.get(drawing)?.get(lineSegments) ?? null;
}
