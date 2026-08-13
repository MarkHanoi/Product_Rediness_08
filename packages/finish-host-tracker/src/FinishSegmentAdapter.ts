/**
 * FinishSegmentAdapter — the `{x,z}` ↔ `{x,y}` coordinate adapter (§FINISH-FOLLOWS-WALL).
 *
 * WHY THIS FILE EXISTS, measured before it was written:
 * `check-move-propagation` arm A5/A6 (move-propagation.json, 2026-08-13) recorded
 * the structural gap verbatim: *"the finish edge speaks `{x,z}`
 * (FloorTypes.ts:205-212) while the ONE resolver in the tree (WallFaceResolver,
 * Segment2D `{x,y}`) speaks `{x,y}`, so even a new tracker could not call it
 * without a coordinate adapter that does not exist."* This is that adapter — a
 * NAMED, TESTED unit, not inline swizzling at call sites, so the frame conversion
 * exists in exactly one place and cannot silently diverge between the floor and
 * ceiling trackers (C79 §3.4 / §7.4).
 *
 * THE TWO FRAMES:
 *  · Resolver frame (`@pryzm/geometry-slab` WallFaceResolver.ts:4-7, `Segment2D`)
 *    — slab 2D space, documented in the resolver itself as `x = world.x,
 *    y = world.z`.
 *  · Finish frame (`FloorHostReferenceEdge` / `CeilingHostReferenceEdge`,
 *    FloorTypes.ts:205-212 / CeilingTypes.ts:108-115) — world X-Z, `{x, z}`.
 * The conversion is therefore a pure axis RENAME (y ↔ z), no negation, no swap of
 * handedness. Everything else about the edge — the five §1.1 facts (`type`,
 * `hostId`, `hostType`, `reference`, `offset`) — passes through byte-identical.
 *
 * SINGLE-RESOLVER RULE (C79 §6.5): this module re-implements NO wall-face maths.
 * The resolver is INJECTED as `WallFaceResolverLike` — a structural view of the
 * real `WallFaceResolver` static surface — and the engine wiring passes the one
 * real class. Injection rather than a package import is deliberate twice over:
 * it is the same late-binding shape the slab tracker already uses for its
 * command manager, and it keeps this package's compile graph off the
 * geometry-slab ROOT BARREL (whose transitive source graph reaches THREE,
 * file-format and the whole tool layer). Two resolvers is how one fix reaches
 * one family; the roof's second tracer is the standing cautionary tale — this
 * file adds a frame conversion, never a rival resolver.
 */

// ── The resolver frame (structural view of @pryzm/geometry-slab types) ───────

export interface ResolverPoint { x: number; y: number }

/** Structural `Segment2D` (WallFaceResolver.ts:4-7). */
export interface ResolverSegment { start: ResolverPoint; end: ResolverPoint }

/** Structural `HostReferenceEdge` (geometry-slab SketchTypes.ts:34-46). */
export interface ResolverHostReferenceEdge {
    type: 'hostReference';
    hostId: string;
    hostType: 'wall';
    reference: 'centerLine' | 'exteriorFace' | 'interiorFace' | 'coreExterior' | 'coreInterior';
    offset: number;
    fallback?: ResolverSegment;
}

export interface ResolverFreeLineEdge {
    type: 'freeLine';
    start: ResolverPoint;
    end: ResolverPoint;
}

/**
 * The static surface of the ONE resolver in the tree. The real
 * `WallFaceResolver` class satisfies this structurally — wiring passes the
 * class itself (`{ resolver: WallFaceResolver }`).
 */
export interface WallFaceResolverLike {
    resolve(edge: ResolverHostReferenceEdge): ResolverSegment | null;
    degrade(edge: ResolverHostReferenceEdge): ResolverFreeLineEdge | null;
}

/**
 * The static surface of the ONE loop intersector in the tree
 * (`SketchLoopIntersector` — the unit `SlabFragmentBuilder.resolveLoop` uses),
 * so a finish corner and a slab corner can never be computed by rival maths.
 */
export interface SketchLoopIntersectorLike {
    computePolygon(segments: (ResolverSegment | null)[]): ResolverPoint[] | null;
}

/** The pair the engine wiring injects — both are the real geometry-slab classes. */
export interface FinishGeometryServices {
    resolver: WallFaceResolverLike;
    intersector: SketchLoopIntersectorLike;
}

// ── The finish frame ─────────────────────────────────────────────────────────

/** Planar point in the world X-Z frame every finish boundary is authored in. */
export interface XZ { x: number; z: number }

export interface XZSegment { start: XZ; end: XZ }

/**
 * Structural shape of `FloorHostReferenceEdge` / `CeilingHostReferenceEdge`
 * (deliberately assignable FROM both — C79 §3.4 made them byte-identical so one
 * consumer can serve both families).
 */
export interface FinishHostReferenceEdgeLike {
    type: 'hostReference';
    hostId: string;
    hostType: 'wall' | 'slab';
    reference: 'centerLine' | 'interiorFace' | 'exteriorFace';
    offset: number;
    fallback?: XZSegment;
}

export interface FinishFreeLineEdgeLike {
    type: 'freeLine';
    start: XZ;
    end: XZ;
}

export type FinishSketchEdgeLike = FinishHostReferenceEdgeLike | FinishFreeLineEdgeLike;

// ── Point / segment conversions ──────────────────────────────────────────────

/** Finish `{x,z}` → resolver `{x,y}` (y = world.z, per WallFaceResolver's own doc). */
export function xzPointToResolverPoint(p: XZ): ResolverPoint {
    return { x: p.x, y: p.z };
}

/** Resolver `{x,y}` → finish `{x,z}`. */
export function resolverPointToXzPoint(p: ResolverPoint): XZ {
    return { x: p.x, z: p.y };
}

export function xzSegmentToResolverSegment(s: XZSegment): ResolverSegment {
    return { start: xzPointToResolverPoint(s.start), end: xzPointToResolverPoint(s.end) };
}

export function resolverSegmentToXzSegment(s: ResolverSegment): XZSegment {
    return { start: resolverPointToXzPoint(s.start), end: resolverPointToXzPoint(s.end) };
}

// ── Edge conversion ──────────────────────────────────────────────────────────

/**
 * Convert a finish host-reference edge to the resolver's `HostReferenceEdge`
 * shape. The five facts pass through untouched; only the fallback's frame is
 * renamed.
 *
 * Returns `null` for a non-wall host: the finish types declare
 * `hostType: 'wall' | 'slab'` but the one resolver in the tree resolves WALLS
 * (`HostReferenceEdge.hostType: 'wall'`, and it reads `window.wallStore`). No
 * production path mints a slab-hosted finish edge today; if one appears, the
 * honest answer is "cannot resolve", never a wall lookup by a slab id
 * (C79 §2.3 — a wrong host is strictly worse than no host).
 */
export function finishEdgeToResolverEdge(edge: FinishHostReferenceEdgeLike): ResolverHostReferenceEdge | null {
    if (edge.hostType !== 'wall') return null;
    return {
        type: 'hostReference',
        hostId: edge.hostId,
        hostType: 'wall',
        reference: edge.reference,
        offset: edge.offset,
        ...(edge.fallback ? { fallback: xzSegmentToResolverSegment(edge.fallback) } : {}),
    };
}

// ── Resolution, in the finish frame ──────────────────────────────────────────

/**
 * Resolve a finish host edge to its CURRENT wall segment, in `{x,z}`, through
 * the injected real resolver.
 *
 * Uses `resolver.resolve` — NOT `resolveOrFallback` — deliberately.
 * `resolveOrFallback` is the measured C79 §5.2.1 collapse ("preserved" and
 * "undetermined" byte-identical at the caller, move-propagation.json A3): it
 * absorbs a vanished host into the stale authoring-time fallback with no reason
 * attached. Here `null` stays `null`, so the caller can report `undetermined`
 * with a named reason instead of silently drawing the old line.
 */
export function resolveFinishHostEdgeXZ(
    resolver: WallFaceResolverLike,
    edge: FinishHostReferenceEdgeLike,
): XZSegment | null {
    const resolverEdge = finishEdgeToResolverEdge(edge);
    if (!resolverEdge) return null;
    const segment = resolver.resolve(resolverEdge);
    return segment ? resolverSegmentToXzSegment(segment) : null;
}

/**
 * Degrade a finish host edge to a freeLine at its current-else-fallback
 * geometry, in `{x,z}`. Used on wall REMOVAL, where falling back to the authored
 * geometry is exactly what C79 §4.3 shipped the fallback for. Returns `null`
 * only when both live resolution and fallback are unavailable — the caller keeps
 * the original edge in that case (the slab tracker's own precedent,
 * SlabDependencyTracker.ts `if (!freeEdge) return edge`).
 */
export function degradeFinishHostEdgeXZ(
    resolver: WallFaceResolverLike,
    edge: FinishHostReferenceEdgeLike,
): FinishFreeLineEdgeLike | null {
    const resolverEdge = finishEdgeToResolverEdge(edge);
    // A non-wall host cannot be resolved live, but its authored fallback is
    // still the honest degradation target (§4.3).
    if (!resolverEdge) {
        return edge.fallback
            ? { type: 'freeLine', start: { ...edge.fallback.start }, end: { ...edge.fallback.end } }
            : null;
    }
    const freeLine = resolver.degrade(resolverEdge);
    if (!freeLine) return null;
    return {
        type: 'freeLine',
        start: resolverPointToXzPoint(freeLine.start),
        end: resolverPointToXzPoint(freeLine.end),
    };
}
