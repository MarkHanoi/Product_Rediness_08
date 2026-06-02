// A.7.d (Phase A · Sprint 2) — Footprint containment + setback validator.
//
// Implements [C19 §1.6]: the BuildingFootprint polygon MUST lie inside
// the Parcel boundary, and every vertex MUST stand at least `setback`
// metres from the corresponding edge (front / side / rear classification).
//
// L2-layer: pure geometry. No I/O.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md §1.6 + §2.7

import type { Pt } from '@pryzm/schemas';
import {
    pointInPolygon,
    pointSegmentDistance,
    polygonArea,
} from './polygonGeometry.js';

export type EdgeClassification = 'front' | 'side' | 'rear' | 'unclassified';

export interface SetbackSpec {
    readonly front: number;
    readonly side: number;
    readonly rear: number;
}

export interface ContainmentViolation {
    /** The index of the offending vertex of the footprint polygon. */
    readonly vertexIndex: number;
    /** Why it failed. */
    readonly kind:
        | 'outside-parcel'           // vertex sits outside parcel polygon
        | 'setback-front'            // vertex is closer than `setbacks.front` to a front edge
        | 'setback-side'             // closer than `setbacks.side` to a side edge
        | 'setback-rear';            // closer than `setbacks.rear` to a rear edge
    /** Human-readable message for the UI. */
    readonly message: string;
}

export interface ContainmentReport {
    /** True iff zero violations. */
    readonly ok: boolean;
    readonly violations: readonly ContainmentViolation[];
}

/**
 * Run the C19 §1.6 containment + setback compliance check.
 *
 * - For each footprint vertex: verify it lies inside the parcel polygon.
 * - For each parcel edge classified `front | side | rear`: verify every
 *   footprint vertex is at least the corresponding setback metres away
 *   from that edge.
 *
 * Returns a report with one entry per violation (UI surfaces them in
 * the Site Inspector per C19 §5.3). Empty `footprint` polygons trivially
 * pass; an empty `parcel` polygon trivially fails (no enclosing space).
 */
export function checkFootprintContainment(
    footprint: ReadonlyArray<Pt>,
    parcel: ReadonlyArray<Pt>,
    edgeClassifications: ReadonlyArray<EdgeClassification>,
    setbacks: SetbackSpec,
): ContainmentReport {
    if (footprint.length === 0) {
        return { ok: true, violations: [] };
    }
    if (parcel.length < 3) {
        // Degenerate parcel — every footprint vertex is "outside".
        const violations: ContainmentViolation[] = footprint.map((_, i) => ({
            vertexIndex: i,
            kind: 'outside-parcel' as const,
            message: 'parcel polygon is degenerate (< 3 vertices)',
        }));
        return { ok: false, violations };
    }

    const violations: ContainmentViolation[] = [];

    for (let vi = 0; vi < footprint.length; vi++) {
        const v = footprint[vi]!;

        // Step 1 — containment.
        if (!pointInPolygon(v, parcel)) {
            violations.push({
                vertexIndex: vi,
                kind: 'outside-parcel',
                message: `footprint vertex ${vi} (${v.x.toFixed(2)}, ${v.z.toFixed(2)}) lies outside the parcel polygon`,
            });
            continue;        // setback check is moot for an out-of-bounds vertex
        }

        // Step 2 — setback compliance, edge by edge.
        for (let ei = 0; ei < parcel.length; ei++) {
            const a = parcel[ei]!;
            const b = parcel[(ei + 1) % parcel.length]!;
            const cls = edgeClassifications[ei] ?? 'unclassified';
            if (cls === 'unclassified') continue;
            const required = setbacks[cls];
            if (required <= 0) continue;          // no setback configured
            const dist = pointSegmentDistance(v, a, b);
            if (dist < required) {
                violations.push({
                    vertexIndex: vi,
                    kind:
                        cls === 'front'
                            ? 'setback-front'
                            : cls === 'side'
                            ? 'setback-side'
                            : 'setback-rear',
                    message:
                        `footprint vertex ${vi} is ${dist.toFixed(2)}m from a ${cls} edge — ` +
                        `setback requires ≥ ${required}m`,
                });
            }
        }
    }

    return { ok: violations.length === 0, violations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor Area Ratio (FAR) compliance — per C19 §1.6 invariant 4.
// ─────────────────────────────────────────────────────────────────────────────

export interface FARReport {
    /** True iff `gfaTotal / parcelArea ≤ maxFAR` (or maxFAR is null). */
    readonly ok: boolean;
    /** Computed ratio `gfaTotal / parcelArea` (Infinity if parcelArea === 0). */
    readonly ratio: number;
    readonly maxFAR: number | null;
    /** Human-readable message; empty when `ok: true`. */
    readonly message: string;
}

/**
 * Check FAR compliance per C19 §1.6 invariant 4:
 * `sum(buildingGrossFloorAreas) / area(Parcel.boundary) ≤ Parcel.maxFAR`.
 *
 * When `maxFAR` is null the parcel is FAR-unrestricted and the check
 * trivially passes. When the parcel polygon is degenerate (< 3 vertices)
 * the ratio is Infinity and the check fails iff a maxFAR is set.
 *
 * Soft validation: the SiteModelStore / Site Inspector surfaces this as
 * a lint warning per C19 §1.6. The IFC exporter promotes it to a hard
 * fail at export time (per C25 §1.4).
 */
export function checkFAR(
    parcelPolygon: ReadonlyArray<Pt>,
    gfaTotal: number,
    maxFAR: number | null,
): FARReport {
    if (maxFAR === null) {
        return { ok: true, ratio: 0, maxFAR: null, message: '' };
    }
    const parcelArea = polygonArea(parcelPolygon);
    if (parcelArea === 0) {
        return {
            ok: false,
            ratio: Number.POSITIVE_INFINITY,
            maxFAR,
            message: 'parcel polygon has zero area — FAR cannot be evaluated',
        };
    }
    const ratio = gfaTotal / parcelArea;
    if (ratio > maxFAR) {
        return {
            ok: false,
            ratio,
            maxFAR,
            message:
                `FAR violation: ${ratio.toFixed(3)} exceeds parcel cap ${maxFAR.toFixed(3)} ` +
                `(GFA total ${gfaTotal.toFixed(2)}m² / parcel area ${parcelArea.toFixed(2)}m²)`,
        };
    }
    return { ok: true, ratio, maxFAR, message: '' };
}
