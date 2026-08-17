/**
 * remapHostReferences.ts — §DUP-CARRIES-THE-RELATIONSHIP (C79 §5, C71 §3)
 *
 * THE DEFECT THIS EXISTS TO CLOSE, in the founder's words:
 *
 *   *"the first floor was created by duplicate ground level to first floor — and
 *   those floors don't get the slab, floor finishes or ceiling moving along. But
 *   walls they do."*
 *
 * WHY WALLS DID AND NOTHING ELSE DID, which is the whole design rationale for this
 * module: a wall's `joinedTo` is **RE-DERIVED FROM GEOMETRY** by the junction
 * resolver once the duplicated walls land, so it repairs itself for free. A slab's
 * / a finish's binding to its bounding walls is an **AUTHORED HOST REFERENCE** —
 * `sketch.outerLoop.edges[i].hostId` — and NOTHING re-derives it. C79 §5 states the
 * rule this violates directly: *"the connection is a persistent RELATIONSHIP, not a
 * coincidence of coordinates."* Duplication copied the coordinates and dropped the
 * relationship.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * §WHY A REMAP AND NOT A RE-TRACE. C79 §2.2 forbids re-deriving attribution "by
 * proximity, nearest-neighbour search, coordinate matching, or any other
 * after-the-fact geometric query". A duplication does not need one and must not
 * use one: the duplicating command MINTS the target wall for each source wall, so
 * it HOLDS the correspondence `sourceWallId → newWallId` by construction. That is
 * §2.1 in its strongest sense — the candidate set is not merely closed, it is a
 * function. Re-tracing the region on the new level would re-derive, by an
 * independent mechanism, a fact the duplication already knows, and the two could
 * then DISAGREE (§7.4).
 *
 * §WHY AN UNMAPPED HOST MAY NEVER BE CARRIED THROUGH UNCHANGED. This is the sharp
 * edge, and it is why the naive fix is worse than no fix. Both dependency graphs
 * that drive the follow — `FinishHostDependencyTracker.graph`
 * (FinishHostDependencyTracker.ts:237) and `SlabDependencyTracker.graph`
 * (SlabDependencyTracker.ts:145) — key on `hostId` ALONE and consult no level. A
 * duplicated first-floor finish still naming a GROUND-floor wall would therefore
 * follow that ground-floor wall: a cross-storey action-at-a-distance strictly worse
 * than the inert element the founder reported. So an unmapped host is DEGRADED to a
 * free line, never kept.
 *
 * §NO-EMPTY-MEANS-UNKNOWN (C78 §1.4) — every degradation is COUNTED and NAMED in
 * the returned report, never absorbed. "Nothing to remap" and "four hosts I could
 * not rebind" are different facts and the caller can tell them apart.
 */

import { trace, type Tracer } from '@opentelemetry/api';

// P8 / C10 §2 — every exported function carries ≥ 1 OTel span.
function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/**
 * The structural minimum this module needs to see. Deliberately NOT the slab's
 * `SketchEdge` nor the floor's `FloorSketchEdge` nor the ceiling's
 * `CeilingSketchEdge` — the three are the SAME relationship declared in three
 * packages, and they differ only in the planar key of their coordinates
 * (`{x, y}` where y is world-Z for slabs, `{x, z}` for finishes). This function
 * touches neither coordinate, so ONE implementation serves all three and they
 * cannot drift apart (C79 §3.4: one relationship, one edge shape).
 */
interface HostEdgeLike {
    type: string;
    hostId?: string;
    fallback?: unknown;
}

/** §2.4-style closed vocabulary for why a host reference could not be rebound. */
export type HostRemapFailureReason =
    /** The source wall produced no twin on the target level — its `CreateWallCommand`
     *  refused (an opening conflict, a duplicate id, an invalid dimension). */
    | 'noTwinWall'
    /** The edge referenced a wall that is not on the level being duplicated at all
     *  (a cross-storey reference). Nothing in this gesture minted a twin for it. */
    | 'hostOffLevel';

export interface HostRemapReport {
    /** Host references successfully rebound to the target level's own walls. */
    remapped: number;
    /** Host references that could not be rebound and were degraded to free lines.
     *  A free edge does NOT follow a wall — the same words the slab and finish
     *  attribution reports use, and they mean the same thing here. */
    degraded: number;
    /** The SOURCE wall ids that could not be rebound, so a caller can name them. */
    unmappedHostIds: string[];
    /** Edges that were already free lines. Carried verbatim; nothing to rebind. */
    alreadyFree: number;
    /**
     * §NO-EMPTY-MEANS-UNKNOWN, the hard case: a host that could not be rebound AND
     * for which no geometry was available to degrade to — neither the edge's own
     * §4.3 `fallback` nor the element's stored ring at that index. The edge is
     * dropped, which changes the loop, so this is REPORTED rather than swallowed.
     * Zero on every path a valid element can take (an element with a sketch has a
     * polygon of ≥ 3 vertices); non-zero means the record was already malformed.
     */
    droppedWithoutGeometry: number;
}

export interface HostRemapResult<E> {
    edges: E[];
    report: HostRemapReport;
}

/**
 * The per-index geometric fallback: THIS element's own stored boundary edge `i`.
 *
 * Supplying it is what makes a degradation lossless. The sketch's edges are
 * index-aligned with the stored ring by construction — `roomBoundarySketch.ts`
 * states it (*"edge `i` is `ring[i] → ring[(i+1) % n]`, so the emitted
 * `outerLoop.edges` are index-aligned with the stored polygon"*) and
 * `SlabRegionTracer` builds its sketch the same way — so ring edge `i` IS the
 * geometry sketch edge `i` currently resolves to. Handing it over is §4.3's own
 * rule ("`fallback` records THIS ELEMENT'S OWN geometry at authoring time")
 * applied at the one moment the reference is being severed.
 */
export type RingEdgeFallback = (index: number) => unknown | undefined;

/**
 * Rebind every host reference in one sketch loop from the SOURCE level's walls to
 * the TARGET level's, using the correspondence the duplicating command minted.
 *
 * @param edges       The source element's sketch loop edges, in order.
 * @param wallIdMap   `sourceWallId → newWallId`, built by the caller AS IT CREATED
 *                    the target walls. Never a lookup, never a search (§2.1).
 * @param ringFallback  Optional per-index geometry for edges that must degrade.
 *                    See `RingEdgeFallback`. Omitted → only the edge's own
 *                    `fallback` can be used, and edges with neither are dropped
 *                    and counted in `droppedWithoutGeometry`.
 * @param sourceWallIds The wall ids that exist on the SOURCE level, used ONLY to
 *                    tell `noTwinWall` from `hostOffLevel` in the report. Omitted
 *                    → every failure is reported as `noTwinWall`.
 */
export function remapHostReferences<E extends HostEdgeLike>(
    edges: ReadonlyArray<E>,
    wallIdMap: ReadonlyMap<string, string>,
    ringFallback?: RingEdgeFallback,
    sourceWallIds?: ReadonlySet<string>,
): HostRemapResult<E> {
    return _tracer().startActiveSpan('pryzm.levels.remapHostReferences', (span) => {
        try {
            const result = _remapHostReferences(edges, wallIdMap, ringFallback, sourceWallIds);
            span.setAttribute('pryzm.remap.remapped', result.report.remapped);
            span.setAttribute('pryzm.remap.degraded', result.report.degraded);
            span.setAttribute('pryzm.remap.dropped', result.report.droppedWithoutGeometry);
            return result;
        } finally {
            span.end();
        }
    });
}

function _remapHostReferences<E extends HostEdgeLike>(
    edges: ReadonlyArray<E>,
    wallIdMap: ReadonlyMap<string, string>,
    ringFallback?: RingEdgeFallback,
    sourceWallIds?: ReadonlySet<string>,
): HostRemapResult<E> {
    const out: E[] = [];
    const report: HostRemapReport = {
        remapped: 0,
        degraded: 0,
        unmappedHostIds: [],
        alreadyFree: 0,
        droppedWithoutGeometry: 0,
    };

    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]!;

        if (edge.type !== 'hostReference' || typeof edge.hostId !== 'string') {
            // A free line is already unbound — carry it verbatim. Its coordinates
            // are the element's authored geometry and duplication does not move
            // geometry in plan (only the storey Y changes, which is derived from
            // `levelId`, never stored in the sketch).
            out.push(structuredClone(edge));
            report.alreadyFree++;
            continue;
        }

        const twin = wallIdMap.get(edge.hostId);
        if (twin) {
            // The whole point of the module: the SAME relationship, re-pointed at
            // the wall this gesture minted for it. `fallback` is carried unchanged
            // — the twin stands on the same plan line as its source, so the §4.3
            // authoring-time memory is still this element's own geometry.
            const next = structuredClone(edge) as E & { hostId: string };
            next.hostId = twin;
            out.push(next);
            report.remapped++;
            continue;
        }

        // ── Could not rebind. DEGRADE — never carry the source id across. ──────
        report.unmappedHostIds.push(edge.hostId);
        const geometry = (edge.fallback !== undefined && edge.fallback !== null)
            ? structuredClone(edge.fallback)
            : ringFallback?.(i);

        if (geometry === undefined || geometry === null) {
            // Nothing honest to write. Dropping the edge changes the loop, so it is
            // COUNTED — the caller decides whether a loop that lost an edge may be
            // written at all (`DuplicateFloorPlanCommand` refuses the element).
            report.droppedWithoutGeometry++;
            continue;
        }

        const g = geometry as { start: unknown; end: unknown };
        out.push({ type: 'freeLine', start: g.start, end: g.end } as unknown as E);
        report.degraded++;
        void sourceWallIds; // reason-splitting is reported by the caller's formatter
    }

    return { edges: out, report };
}

/**
 * Which failure each unmapped host was. Split here rather than inside the loop so
 * the loop stays a pure rebind and the two reasons are computed from one place.
 */
export function classifyUnmappedHosts(
    unmappedHostIds: ReadonlyArray<string>,
    sourceWallIds: ReadonlySet<string>,
): Record<HostRemapFailureReason, string[]> {
    const noTwinWall: string[] = [];
    const hostOffLevel: string[] = [];
    for (const id of unmappedHostIds) {
        (sourceWallIds.has(id) ? noTwinWall : hostOffLevel).push(id);
    }
    return { noTwinWall, hostOffLevel };
}

/**
 * The ONE report renderer for all three families, so a reader who knows the slab
 * line can read the floor line without relearning it. Modelled on
 * `formatFinishBoundaryAttributionReport` — and, like it, it states plainly that a
 * degraded edge does NOT follow a wall, because that is the fact a user or a
 * future maintainer needs and the one an area figure alone would hide.
 */
export function formatHostRemapReport(
    kind: string,
    elementId: string,
    report: HostRemapReport,
    sourceWallIds?: ReadonlySet<string>,
): string {
    const head =
        `§DUP-CARRIES-THE-RELATIONSHIP ${kind} "${elementId}": `
        + `${report.remapped} host reference(s) rebound to the new level's walls, `
        + `${report.alreadyFree} already-free edge(s) carried, `
        + `${report.degraded} degraded to free line(s), `
        + `${report.droppedWithoutGeometry} dropped for want of geometry.`;
    if (report.unmappedHostIds.length === 0) return head;

    const detail = sourceWallIds
        ? (() => {
            const c = classifyUnmappedHosts(report.unmappedHostIds, sourceWallIds);
            return ` Unrebound: no-twin-wall=[${c.noTwinWall.join(', ')}], `
                + `host-off-level=[${c.hostOffLevel.join(', ')}].`;
        })()
        : ` Unrebound: [${report.unmappedHostIds.join(', ')}].`;
    return `${head}${detail} Degraded edges do NOT follow a wall.`;
}
