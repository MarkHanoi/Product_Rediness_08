/**
 * §FIX-DOOR-PREVIEW-EXACT (L-127) — Door dimension resolver.
 *
 * THE SINGLE SOURCE OF TRUTH for a door's real dimensions (width, height,
 * frame thickness, frame depth, leaf thickness). Every placement-preview and
 * every placed-door geometry path — the plan tool (`DoorPlanToolHandler`), the
 * 3D tool (`DoorTool`), the 3D builder (`DoorBuilder`) and the plan-symbol
 * builder (`DoorPlanSymbolBuilder`) — resolves its dimensions HERE so the
 * preview is dimensionally identical to the placed door (founder: "the preview
 * must be SOUND — perfectly accurate, NOT a default door; the dimension of the
 * door needs to be EXACTLY correct").
 *
 * Dimensions come from the SELECTED `DoorSystemType` (its optional `dimensions`
 * block). When a type is not selected / not found / carries no dimensions, we
 * fall back to the canonical residential defaults below — which are exactly the
 * historical hard-coded constants for frame/leaf so pre-existing typeless doors
 * are byte-for-byte unchanged.
 *
 * Architecture: pure read of `doorSystemTypeStore` (a side-system store, not in
 * undo history). No THREE, no DOM. P8 — the exported resolver emits one span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import { doorSystemTypeStore } from './DoorSystemTypeStore';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-door', '0.1.0');
    return _cachedTracer;
}

/** Fully-resolved real dimensions of a door instance (metres). */
export interface ResolvedDoorDimensions {
    /** Structural opening (void) width along the wall baseline. */
    width: number;
    /** Leaf height (sill → head). */
    height: number;
    /** Frame member face width. */
    frameThickness: number;
    /** Frame depth across the wall reveal (overridden by wall thickness at build). */
    frameDepth: number;
    /** Leaf panel thickness. */
    leafThickness: number;
}

/**
 * Canonical residential fallbacks. `frameThickness` / `frameDepth` /
 * `leafThickness` match the historical `DoorOpeningSchema` defaults so a
 * typeless door renders exactly as before this change.
 */
export const DEFAULT_DOOR_DIMENSIONS = Object.freeze({
    /** Single-leaf structural opening width (924 mm leaf + frame reveal). */
    singleWidth: 0.9,
    /** Double-leaf structural opening width. */
    doubleWidth: 1.8,
    height: 2.1,
    frameThickness: 0.05,
    frameDepth: 0.07,
    leafThickness: 0.04,
});

/**
 * Resolve the real dimensions of a door of `doorType`, hosted on the selected
 * `systemTypeId`. Single source of truth — preview and placement MUST both call
 * this so `preview ≡ placed door`.
 *
 * @param systemTypeId  The user-selected `DoorSystemType.id` (or `undefined`).
 * @param doorType      `'single'` or `'double'` (drives which width is used).
 */
export function resolveDoorDimensions(
    systemTypeId: string | undefined,
    doorType: 'single' | 'double',
): ResolvedDoorDimensions {
    return _tracer().startActiveSpan('pryzm.door.resolveDimensions', (span) => {
        try {
            const type = systemTypeId ? doorSystemTypeStore.getById(systemTypeId) : undefined;
            const d = type?.dimensions;
            const isDouble = doorType === 'double';

            const width = isDouble
                ? (d?.doubleWidth
                    ?? (d?.width != null ? d.width * 2 : DEFAULT_DOOR_DIMENSIONS.doubleWidth))
                : (d?.width ?? DEFAULT_DOOR_DIMENSIONS.singleWidth);

            const resolved: ResolvedDoorDimensions = {
                width,
                height:         d?.height         ?? DEFAULT_DOOR_DIMENSIONS.height,
                frameThickness: d?.frameThickness ?? DEFAULT_DOOR_DIMENSIONS.frameThickness,
                frameDepth:     d?.frameDepth     ?? DEFAULT_DOOR_DIMENSIONS.frameDepth,
                leafThickness:  d?.leafThickness  ?? DEFAULT_DOOR_DIMENSIONS.leafThickness,
            };

            span.setAttribute('pryzm.door.systemTypeId', systemTypeId ?? '<default>');
            span.setAttribute('pryzm.door.doorType', doorType);
            span.setAttribute('pryzm.door.width', resolved.width);
            span.setAttribute('pryzm.door.resolvedFromType', d !== undefined);
            span.end();
            return resolved;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}
