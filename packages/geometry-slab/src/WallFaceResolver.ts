import * as THREE from '@pryzm/renderer-three/three';
import { WallFaceRef, HostReferenceEdge, FreeLineEdge } from './SketchTypes';
import type {
    SlabEdgeResolutionSource,
    SlabRecomputeUndeterminedReason,
} from './slabRecomputeVerdict';

export interface Segment2D {
    start: { x: number; y: number };
    end: { x: number; y: number };
}

/**
 * §C79-5.2-SLAB-STATES — a resolution WITH the branch it took.
 *
 * `resolveOrFallback` returns a segment and says nothing about where it came
 * from, which is how a slab that did not follow became indistinguishable from a
 * slab that had nothing to follow (C79 §0/§5.2.1, measured by
 * check-move-propagation A3). This is the same answer plus the fact.
 */
export interface HostEdgeResolution {
    /** Exactly what `resolveOrFallback` returns — the fallback is NEVER removed (§4.3). */
    segment: Segment2D | null;
    source: Extract<SlabEdgeResolutionSource, 'live' | 'fallback' | 'unresolvable'>;
    hostId: string;
    /** Absent iff `source === 'live'`. A C78 §8.1 member, narrowed (never minted). */
    reason?: SlabRecomputeUndeterminedReason;
    subReason?: string;
}

/**
 * WallFaceResolver
 *
 * Resolves a HostReferenceEdge to a concrete 2D line segment by reading the
 * current wall geometry from the WallStore (via window.wallStore). // TODO(TASK-08)
 *
 * Contract compliance:
 * - §02 Projection-Only: This resolver is stateless and pure — it does not
 *   mutate any store or register any spatial element.
 * - §01 §2.1: All store reads are read-only (via getById).
 * - The returned Segment2D is in slab 2D space: x = world.x, y = world.z.
 *
 * Math:
 * Wall baseLine is the wall's center line in world XZ space.
 * Given direction d = normalize(end – start):
 *   Normal n = (d.z, –d.x)   (right-hand perpendicular when walking start→end)
 *   exteriorFace offset = +thickness/2 in n direction
 *   interiorFace offset = –thickness/2 in n direction
 *   centerLine   offset = 0
 *   coreExterior / coreInterior mirror exterior/interior (simplified — no layer model yet)
 */
export class WallFaceResolver {

    /**
     * Attempt to resolve a HostReferenceEdge to its current 2D segment.
     * Returns null if the host wall cannot be found.
     *
     * §L-921-SLAB-PREFLIGHT — `storeOverride` is ADDITIVE and defaults to the
     * historical `window.wallStore` read, so every existing caller resolves
     * byte-identically. It exists for exactly one caller:
     * `previewSlabConnectivityWeld`, which must ask "what would this edge
     * resolve to if the moved wall stood at its PROPOSED baseline?" — a question
     * the global store cannot answer, because the move has not happened yet and
     * must not happen before the answer is known. Same reasoning, and the same
     * shim shape, as `moveReweldPreflight`'s: without it a pre-flight would be a
     * plausible-looking approximation that disagrees with the real cascade in
     * precisely the corner cases the gate exists for.
     */
    static resolve(
        edge: HostReferenceEdge,
        storeOverride?: { getById?: (id: string) => { baseLine?: readonly THREE.Vector3[]; thickness?: number } | undefined },
    ): Segment2D | null {
        const store = storeOverride ?? WallFaceResolver.storeFor(edge);
        if (!store) return null;

        const host = store.getById?.(edge.hostId) as
            | { baseLine?: readonly { x: number; z: number }[]; thickness?: number; mullionSize?: number }
            | undefined;
        if (!host || !host.baseLine || host.baseLine.length < 2) return null;

        return WallFaceResolver.computeSegment(
            host.baseLine[0] as THREE.Vector3,
            host.baseLine[1] as THREE.Vector3,
            WallFaceResolver.faceThicknessOf(edge, host),
            edge.reference,
            edge.offset
        );
    }

    /**
     * §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) — which store owns this host.
     *
     * The host KIND, not the id, decides. Reading the wrong store is not a missing
     * value, it is a MISS that degrades to the edge's authoring-time fallback and
     * reports `preserved` while following nothing (C79 §5.2.1) — which is exactly
     * why L-1125 refused to attribute a curtain wall at all rather than attribute it
     * to a store that could never answer.
     */
    private static storeFor(edge: HostReferenceEdge):
        { getById?: (id: string) => unknown } | undefined {
        return edge.hostType === 'curtain-wall'
            ? (window as unknown as { curtainWallStore?: { getById?: (id: string) => unknown } }).curtainWallStore // TODO(TASK-07)
            : window.wallStore; // TODO(TASK-08)
    }

    /**
     * ⭐ §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) · C87 CW-Region-3 — THE FACE.
     *
     * FOUNDER, 2026-08-19, asked directly because the two candidates differ by 4x and
     * picking silently is the [confident-register-rows] shape: **"to the mullion
     * always."**
     *
     * A curtain wall's face for region resolution is the MULLION face —
     * `mullionSize` (0.08 default), the frame's outer envelope and the structural
     * reading a BIM slab conventionally takes. A floor plate meeting a curtain wall
     * stops at the FRAME, not at the glass.
     *
     * ⛔ `panelThickness` (0.02 default) MUST NOT enter region resolution. C87
     * CW-Region-3 pins the inverse explicitly: a slab that stops at the glazing line
     * and one that stops at the mullion "are not the same drawing". If a future
     * façade genuinely needs a glass-line plate, that is a NEW decision against that
     * contract row — never a parameter swap here.
     *
     * The `?? 0.08` mirrors `CreateCurtainWallCommand.ts:162`, which is where the
     * default is actually minted; it is a fallback for a record that predates the
     * field, not a second opinion about what a mullion is.
     */
    private static faceThicknessOf(
        edge: HostReferenceEdge,
        host: { thickness?: number; mullionSize?: number },
    ): number {
        if (edge.hostType === 'curtain-wall') return host.mullionSize ?? 0.08;
        return host.thickness ?? 0;
    }

    /**
     * §C79-5.2-SLAB-STATES — resolve, and SAY WHICH BRANCH WAS TAKEN.
     *
     * THE ONE implementation of "live, else fallback, else nothing".
     * `resolveOrFallback` is a projection of this, so the two can never disagree
     * about what a caller gets while disagreeing about what happened.
     *
     * The three branches are three different facts and now print three different
     * values:
     *   `live`         — the wall was read; the segment IS a re-derivation.
     *   `fallback`     — the wall did not resolve; this is the authoring-time
     *                    memory kept per §4.3. C79 §5.2's `undetermined`: we did
     *                    NOT re-derive, and that must never read as `preserved`.
     *   `unresolvable` — no wall and no fallback; there is nothing to draw from.
     *
     * `ENGINE_NOT_AVAILABLE` is separated from `STALE_DERIVED_STATE` deliberately:
     * "the wall store is not reachable in this runtime" and "I read the store and
     * the wall is gone" are opposite diagnoses, and collapsing them would rebuild
     * the very defect this channel exists to remove.
     */
    static resolveWithProvenance(edge: HostReferenceEdge): HostEdgeResolution {
        const live = WallFaceResolver.resolve(edge);
        if (live) return { segment: live, source: 'live', hostId: edge.hostId };

        // §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) — ask about the store the
        // host actually lives in. Checking `window.wallStore` for a curtain-wall
        // host would report ENGINE_NOT_AVAILABLE when the wall store merely happens
        // to be absent, and STALE_DERIVED_STATE when it happens to be present — two
        // diagnoses, neither of them about the host that failed. This is the same
        // read `resolve()` performs, which is the property that keeps the branch and
        // its explanation from disagreeing.
        const engineMissing = !WallFaceResolver.storeFor(edge);
        const kind = edge.hostType === 'curtain-wall' ? 'curtain wall' : 'wall';
        const storeName = edge.hostType === 'curtain-wall' ? 'curtain-wall store' : 'wall store';
        const reason: SlabRecomputeUndeterminedReason = engineMissing
            ? 'ENGINE_NOT_AVAILABLE'
            : 'STALE_DERIVED_STATE';
        const why = engineMissing
            ? `the ${storeName} is not reachable in this runtime, so the host was never looked up`
            : `host ${kind} "${edge.hostId}" was looked up and did not resolve`;

        if (edge.fallback) {
            return {
                segment: edge.fallback,
                source: 'fallback',
                hostId: edge.hostId,
                reason,
                subReason: `${why} — the segment returned is the authoring-time fallback kept per ` +
                    `C79 §4.3, NOT a re-derivation of the current walls`,
            };
        }
        return {
            segment: null,
            source: 'unresolvable',
            hostId: edge.hostId,
            reason: engineMissing ? reason : 'RELATIONSHIP_NOT_RECORDED',
            subReason: `${why}, and the edge carries no fallback (C79 §4.3 requires one at authoring time)`,
        };
    }

    /**
     * Resolve or fall back to last known fallback geometry.
     * Returns null only if both live resolution and fallback are unavailable.
     *
     * Behaviour is unchanged and is now a PROJECTION of
     * {@link resolveWithProvenance} — callers that need to know which branch was
     * taken (C79 §5.2) call that one instead of re-deriving the answer here.
     */
    static resolveOrFallback(edge: HostReferenceEdge): Segment2D | null {
        return WallFaceResolver.resolveWithProvenance(edge).segment;
    }

    /**
     * Resolve a HostReferenceEdge and capture the result as its fallback,
     * returning an updated copy of the edge. Use this when building the
     * geometry so that the fallback is always fresh.
     */
    static resolveAndCache(edge: HostReferenceEdge): { segment: Segment2D | null; updatedEdge: HostReferenceEdge } {
        const segment = WallFaceResolver.resolve(edge);
        const updatedEdge: HostReferenceEdge = { ...edge };
        if (segment) {
            updatedEdge.fallback = { start: segment.start, end: segment.end };
        }
        return { segment, updatedEdge };
    }

    /**
     * Convert a HostReferenceEdge to a FreeLineEdge using its current or
     * fallback geometry. Used when the host wall is deleted.
     */
    static degrade(edge: HostReferenceEdge): FreeLineEdge | null {
        const segment = WallFaceResolver.resolveOrFallback(edge);
        if (!segment) return null;
        return {
            type: 'freeLine',
            start: segment.start,
            end: segment.end
        };
    }

    private static computeSegment(
        v0: THREE.Vector3,
        v1: THREE.Vector3,
        thickness: number,
        reference: WallFaceRef,
        lateralOffset: number
    ): Segment2D {
        const dx = v1.x - v0.x;
        const dz = v1.z - v0.z;
        const len = Math.sqrt(dx * dx + dz * dz);

        // Unit normal perpendicular to wall direction (right-hand side when walking start→end)
        const nx = len > 0 ? dz / len : 0;
        const ny = len > 0 ? -dx / len : 0;

        // Compute face offset from center line
        let faceOffset = 0;
        switch (reference) {
            case 'exteriorFace':
            case 'coreExterior':
                faceOffset = thickness / 2;
                break;
            case 'interiorFace':
            case 'coreInterior':
                faceOffset = -thickness / 2;
                break;
            case 'centerLine':
            default:
                faceOffset = 0;
                break;
        }

        const totalOffset = faceOffset + lateralOffset;

        return {
            start: {
                x: v0.x + nx * totalOffset,
                y: v0.z + ny * totalOffset
            },
            end: {
                x: v1.x + nx * totalOffset,
                y: v1.z + ny * totalOffset
            }
        };
    }
}
