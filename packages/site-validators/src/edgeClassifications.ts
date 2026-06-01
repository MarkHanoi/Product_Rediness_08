// A.7.d (Phase A · Sprint 2) — Cross-schema validation: edge
// classifications length MUST equal polygon length (C19 §2.7 invariant 3).
//
// L2-layer: pure. No I/O.

import type { Pt } from '@pryzm/schemas';
import type { EdgeClassification } from './containment.js';

export interface EdgeClassificationsCheck {
    readonly ok: boolean;
    readonly polygonLen: number;
    readonly classificationsLen: number;
    readonly message: string;
}

/**
 * Per C19 §2.7 invariant 3:
 *   `parcel.boundary.edgeClassifications.length === parcel.boundary.polygon.length`
 *
 * Returns a structured result so the UI surface can render a precise
 * "polygon has 5 vertices but only 4 edge classifications" message
 * rather than a generic "invalid payload".
 *
 * Empty + empty is treated as OK (the canonical empty-parcel default).
 */
export function checkEdgeClassifications(
    polygon: ReadonlyArray<Pt>,
    classifications: ReadonlyArray<EdgeClassification>,
): EdgeClassificationsCheck {
    const polygonLen = polygon.length;
    const classificationsLen = classifications.length;
    if (polygonLen === classificationsLen) {
        return {
            ok: true,
            polygonLen,
            classificationsLen,
            message: '',
        };
    }
    return {
        ok: false,
        polygonLen,
        classificationsLen,
        message:
            `edgeClassifications.length (${classificationsLen}) MUST equal ` +
            `polygon.length (${polygonLen}) per C19 §2.7 invariant 3`,
    };
}
