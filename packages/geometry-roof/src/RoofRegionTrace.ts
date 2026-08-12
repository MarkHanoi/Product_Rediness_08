/**
 * RoofRegionTrace — roof-by-region on the SHARED region tracer.
 *
 * §ROOF-REGION-SHARED-TRACER (C79 §6.5, 2026-08-12)
 *
 * THE DEFECT THIS CLOSES: roof-by-region ran on a SECOND, INDEPENDENT tracer
 * (`WallRegionDetector`, now retired — see the tombstone in `index.ts`), whose
 * signature `detect(hitPoint, wallStore): Pt[] | null` projected the traced loop
 * to bare coordinates and **discarded wall identity before returning** — there
 * was no field to fill in. A roof created by region could therefore never know,
 * let alone follow, the walls that bounded it, silently (C79 §0). Meanwhile the
 * slab path was fixed in `e6c8cb58` and roof — with the identical defect and the
 * byte-identical user-facing promise ("By Region · Auto-detect from enclosed
 * walls") — did not move at all. Two tracers is how one fix reaches one family;
 * C79 §6.5 directs the duplicate be RETIRED onto the shared tracer, not extended
 * in parallel.
 *
 * This module is deliberately a THIN ADAPTER with ZERO tracing logic: it
 * delegates to `traceRegionSketchAtPoint` (`@pryzm/geometry-slab/region-tracer`,
 * a pure, THREE-free subpath — no barrel load, so the pre-existing
 * geometry-roof ⇄ command-registry ⇄ geometry-slab package cycle is never walked
 * at module scope) and reshapes the result into roof's `[x, z][]` polygon
 * convention. By construction the port inherits everything the shared tracer
 * knows that the retired detector did not:
 *
 *   • §FIX-REGION-RING-PRETRIM-FRAME — curved walls sampled in the PRE-trim
 *     frame `curve.control` was authored in, then clipped to the post-trim span
 *     (the retired detector fit the Bézier through post-trim endpoints and
 *     overshot the authored arc);
 *   • §ARC-DENSITY — adaptive, curvature-derived chord density from the ONE
 *     shared authority, with `curve.segments` honoured as a floor;
 *   • §REGION-HOST-ATTRIBUTION — every ring edge attributed to the wall whose
 *     own centreline produced it (BY CONSTRUCTION, never by proximity), with
 *     the three honest refusals (`curved` / `noWallId` / `ambiguous`) COUNTED.
 *
 * ⚠ WHAT ROOF CANNOT YET DO WITH THE ATTRIBUTION — the C79 §6 NAMED STORAGE GAP.
 * `RoofData.footprint` is a bare `polygon: [number, number][]`
 * (`RoofTypes.ts` — no edge-typed sketch, no field that can carry a
 * `HostReferenceEdge`), and the plan surface dispatches `roof.create` through
 * the L0 schema whose `boundary` is `Vec3[]` (`packages/schemas/src/elements/
 * Roof.ts`) — Zod strips unknown keys, so a reference cannot even TRANSIT the
 * bus. Storing references on only the 3D path would be C79 §7.4's per-path
 * divergence anti-pattern (worse than uniform absence), and writing a field the
 * model cannot honour would be `boundingWallIds: []` again (C79 §7.1). So until
 * the roof data model grows a reference-capable boundary, the honest state is:
 * the attribution EXISTS at creation, is RETURNED to both callers, and is
 * REPORTED with all five counts (C79 §2.6) — never silently absorbed — and the
 * storage gap is a named row in C79 §6.3, not a plausible-looking empty field.
 */

import {
    traceRegionSketchAtPoint,
    type RegionSketchAttribution,
    type RegionWallLike,
} from '@pryzm/geometry-slab/region-tracer';

export type { RegionSketchAttribution, RegionWallLike };

/** Result of {@link traceRoofRegionAtPoint}. */
export interface RoofRegionTraceResult {
    /**
     * The traced boundary in roof's `[x, z]` convention, wound CCW (positive
     * signed area) — the exact contract the retired `WallRegionDetector.detect`
     * documented, so no caller's downstream normalisation changes.
     */
    polygon: [number, number][];
    /**
     * §REGION-HOST-ATTRIBUTION — which walls produced the boundary, and per-reason
     * counts for every edge that could NOT be attributed. C79 §2.5: the counts are
     * part of the creation result, RETURNED, never absorbed.
     */
    attribution: RegionSketchAttribution;
}

/**
 * Find the minimal closed wall loop enclosing `(x, z)` — the roof-by-region
 * boundary — via the ONE shared region tracer.
 *
 * Same answer shape as the retired detector (`null` = no region encloses the
 * point), plus the attribution the detector structurally could not carry.
 */
export function traceRoofRegionAtPoint(
    walls: ReadonlyArray<RegionWallLike>,
    x: number,
    z: number,
): RoofRegionTraceResult | null {
    const traced = traceRegionSketchAtPoint(walls, x, z);
    if (!traced || traced.ring.length < 3) return null;

    // Tracer ring: {x, y} with y = world Z → roof convention [x, z].
    let polygon: [number, number][] = traced.ring.map(p => [p.x, p.y]);

    // Winding: the retired detector guaranteed CCW (positive area); the shared
    // tracer's walk does not. Normalise AFTER the counts are taken (reversal
    // changes vertex→edge alignment, not how many edges were attributable).
    if (signedAreaXZ(polygon) < 0) polygon = [...polygon].reverse();

    return { polygon, attribution: traced.attribution };
}

/**
 * §REGION-HOST-ATTRIBUTION / C79 §2.6 — the creation-time report, ONE form for
 * BOTH roof surfaces (plan + 3D) so the two buttons cannot drift apart (§7.4).
 *
 * Modelled on the slab plan handler's reference log line, with the roof-specific
 * honesty appended: roof currently has NOWHERE to store the references, so even
 * attributed edges will not follow their walls — that is the C79 §6.3 named
 * storage gap, stated at the moment it applies rather than discovered later.
 * Zero-host and all-host are different values here BY READING (C74's rule
 * applied to attribution).
 */
export function formatRoofRegionAttributionReport(a: RegionSketchAttribution): string {
    return (
        `§ROOF-REGION-SHARED-TRACER region traced: `
        + `${a.hostEdges} wall-attributed edge(s) across ${a.hostWallIds.length} wall(s), `
        + `${a.freeEdges} unattributed edge(s) `
        + `(curved=${a.curvedFallbacks}, no-wall-id=${a.missingIdFallbacks}, `
        + `ambiguous=${a.ambiguousFallbacks}). `
        + `NOTE: RoofData stores a bare polygon — the attribution is measured and `
        + `reported here but NOT persisted, so this roof will not follow its walls `
        + `(C79 §6.3 named storage gap, owner @pryzm/geometry-roof).`
    );
}

/** Signed shoelace area in roof's `[x, z]` convention (positive = CCW). */
function signedAreaXZ(polygon: ReadonlyArray<[number, number]>): number {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i]![0] * polygon[j]![1];
        area -= polygon[j]![0] * polygon[i]![1];
    }
    return area / 2;
}
