/**
 * reprojectFinishBoundary — pure re-derivation of a finish boundary after a
 * bounding wall MOVED (§FINISH-FOLLOWS-WALL · GR-12 · C79 §5).
 *
 * THE GEOMETRY PROBLEM, stated exactly, because it is the one place this differs
 * from the slab: a slab's region ring IS the traced centreline, so re-resolving
 * `centerLine @ 0` reproduces the ring directly (that is how
 * `SlabFragmentBuilder.resolveLoop` follows). A FINISH ring is INSET from the
 * centrelines to the walls' inner faces — `roomBoundarySketch.ts` records the
 * reason the inset was NOT encoded as a face reference or a signed offset at
 * authoring time: the interior/exterior SIGN cannot be determined from a ring
 * walk (C79 §3.2 — a face pick would be a coin flip written as a number).
 *
 * At RE-PROJECTION time the sign is not a coin flip. We hold the edge's own
 * authored geometry (`fallback`, kept fresh per §4.3) AND the wall's
 * PRE-mutation centreline (`prevState`, the §STEP7 third callback argument
 * WallStore emits — C72 §3.1). The inset is therefore MEASURED:
 *
 *     d = signed perpendicular distance of the edge from the OLD centreline
 *     new edge line = NEW centreline shifted by d along the NEW normal
 *
 * using the same right-hand normal convention as `WallFaceResolver.computeSegment`
 * (`n = (dz, -dx)/len`, walking start→end). A wall translation preserves the
 * inset exactly; a wall rotation carries the edge with the wall's own frame.
 *
 * Per C72 §3.5, `prevState` is NEVER reconstructed by re-reading the store (the
 * store already holds the moved wall — a re-read would measure the inset against
 * the new line and report "unchanged"). No `prevState` ⇒ honest `undetermined`.
 *
 * THE FIVE STATES (C79 §5.2) — this function RETURNS one, which the slab path
 * measurably does not (`triggerRebuild → void`, move-propagation.json A4):
 *   preserved | resized | regenerated | conflicted | undetermined
 * `regenerated` is structurally unreachable here — the edge set is fixed by the
 * sketch, so topology cannot change — and is kept in the union so the element
 * state's ordering matches the contract, not because this path can produce it.
 * The element-level state is the WORST of its edges (§5.3).
 *
 * `undetermined` reasons are members of C78 §8.1's closed union (per C79 §5.2.0),
 * with the per-family specificity in `subReason` (§8.3), never a new vocabulary:
 *   · STALE_DERIVED_STATE      — no `prevState` to measure against, or the host
 *                                wall no longer resolves; an answer would be a guess
 *   · GEOMETRY_UNPREDICTABLE   — degenerate centreline/edge, or a reference frame
 *                                this path cannot re-derive from a snapshot
 *   · RELATIONSHIP_NOT_RECORDED — no sketch / no usable reference to re-derive from
 *
 * Pure: no store access, no DOM, no side effects. The live-wall resolution is
 * INJECTED (`resolveHostSegmentXZ`) so the unit is testable without a window and
 * the production caller can hand it the adapter + the one real resolver.
 */

import { RECOMPUTE_IDENTITY_M } from '@pryzm/geometry-kernel';
import {
    xzPointToResolverPoint,
    resolverPointToXzPoint,
    type FinishHostReferenceEdgeLike,
    type FinishSketchEdgeLike,
    type SketchLoopIntersectorLike,
    type XZ,
    type XZSegment,
} from './FinishSegmentAdapter';

// ── Verdict vocabulary ───────────────────────────────────────────────────────

export type ReprojectState =
    | 'preserved'
    | 'resized'
    | 'regenerated'
    | 'conflicted'
    | 'undetermined';

/** C78 §8.1 members this path can produce (closed — add members THERE, not here). */
export type ReprojectUndeterminedReason =
    | 'STALE_DERIVED_STATE'
    | 'GEOMETRY_UNPREDICTABLE'
    | 'RELATIONSHIP_NOT_RECORDED';

export interface ReprojectEdgeOutcome {
    index: number;
    state: 'preserved' | 'resized' | 'undetermined';
    reason?: ReprojectUndeterminedReason;
    subReason?: string;
}

export interface ReprojectFinishBoundaryResult {
    /** Element-level verdict — the WORST of the edges (C79 §5.3). */
    state: ReprojectState;
    reason?: ReprojectUndeterminedReason;
    subReason?: string;
    edgeOutcomes: ReprojectEdgeOutcome[];
    /** BOTH numbers, named, on every verdict that has them (C73 §4 / C79 §5.2.2). */
    numbers?: { oldAreaM2: number; newAreaM2: number };
    /** Present ONLY when state === 'resized': the re-derived ring, index-aligned
     *  with `edges` (edge i runs polygon[i] → polygon[(i+1) % n]). */
    polygon?: XZ[];
    /** Present ONLY when state === 'resized': the sketch edges with geometry
     *  (host fallbacks + freeLine endpoints) refreshed to the new ring (§4.3). */
    edges?: FinishSketchEdgeLike[];
}

/** The wall snapshot the §STEP7 `prevState` callback argument carries. */
export interface WallSnapshotLike {
    id: string;
    baseLine: ReadonlyArray<{ x: number; y?: number; z: number }>;
    thickness?: number;
}

export interface ReprojectFinishBoundaryInput {
    /** The finish's outer-loop sketch edges, index-aligned with its stored ring. */
    edges: ReadonlyArray<FinishSketchEdgeLike>;
    movedWallId: string;
    /** The PRE-mutation wall (C72 §STEP7). Absent ⇒ undetermined, never a guess. */
    prevWall?: WallSnapshotLike;
    /** Live resolution of a host edge to its CURRENT centreline, in `{x,z}` —
     *  in production: `resolveFinishHostEdgeXZ` (adapter → the one WallFaceResolver). */
    resolveHostSegmentXZ: (edge: FinishHostReferenceEdgeLike) => XZSegment | null;
    /** The ONE loop intersector in the tree (`SketchLoopIntersector`), injected —
     *  same corner maths as the slab path, never a rival implementation. */
    intersector: SketchLoopIntersectorLike;
}

// ── Small pure geometry (XZ frame) ───────────────────────────────────────────

// §C73-EPSILON-POLICY — the preserved-vs-changed verdict consumes the kernel's
// RECOMPUTE_IDENTITY_M role directly (metres): "did re-deriving the ring
// change it AT ALL?", NOT COINCIDENT_M's "are these the same model point?".
// A real sub-millimetre resize must never read `preserved` (C79 §5 —
// `preserved` is a positive verdict, not a loose comparison).
const DEGENERATE_LEN_M = 1e-9;
const MIN_AREA_M2 = 1e-6;

/** Signed shoelace area in the XZ plane. Sign encodes winding; |value| is m². */
export function signedAreaXZ(ring: ReadonlyArray<XZ>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}

/** The edge's own current geometry: host → fresh fallback (§4.3); free → its line. */
function edgeGeometryXZ(edge: FinishSketchEdgeLike): XZSegment | null {
    if (edge.type === 'freeLine') return { start: edge.start, end: edge.end };
    return edge.fallback ?? null;
}

interface Frame { ox: number; oz: number; ux: number; uz: number; nx: number; nz: number; len: number }

/** Direction + right-hand normal of a segment — WallFaceResolver's own convention
 *  (`n = (dz, -dx)/len`, right-hand side walking start→end). */
function frameOf(seg: XZSegment): Frame | null {
    const dx = seg.end.x - seg.start.x;
    const dz = seg.end.z - seg.start.z;
    const len = Math.hypot(dx, dz);
    if (len < DEGENERATE_LEN_M) return null;
    return { ox: seg.start.x, oz: seg.start.z, ux: dx / len, uz: dz / len, nx: dz / len, nz: -dx / len, len };
}

/** Signed perpendicular distance of a point from a segment's infinite line. */
function signedPerp(p: XZ, f: Frame): number {
    return (p.x - f.ox) * f.nx + (p.z - f.oz) * f.nz;
}

/** Centreline of a wall SNAPSHOT, in `{x,z}`. Snapshot-side only — the LIVE wall
 *  goes through the injected resolver so there is exactly one live resolver. */
function snapshotCentrelineXZ(wall: WallSnapshotLike): XZSegment | null {
    const v0 = wall.baseLine[0];
    const v1 = wall.baseLine[wall.baseLine.length - 1];
    if (!v0 || !v1 || wall.baseLine.length < 2) return null;
    return { start: { x: v0.x, z: v0.z }, end: { x: v1.x, z: v1.z } };
}

/** O(n²) proper-crossing check between non-adjacent edges of the ring. */
function ringSelfIntersects(ring: ReadonlyArray<XZ>): boolean {
    const n = ring.length;
    const cross = (ax: number, az: number, bx: number, bz: number): number => ax * bz - az * bx;
    for (let i = 0; i < n; i++) {
        const a1 = ring[i]!, a2 = ring[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            // Skip adjacent edges (they share a vertex by construction).
            if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
            const b1 = ring[j]!, b2 = ring[(j + 1) % n]!;
            const d1x = a2.x - a1.x, d1z = a2.z - a1.z;
            const d2x = b2.x - b1.x, d2z = b2.z - b1.z;
            const denom = cross(d1x, d1z, d2x, d2z);
            if (Math.abs(denom) < 1e-12) continue;
            const t = cross(b1.x - a1.x, b1.z - a1.z, d2x, d2z) / denom;
            const u = cross(b1.x - a1.x, b1.z - a1.z, d1x, d1z) / denom;
            if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return true;
        }
    }
    return false;
}

// ── The re-derivation ────────────────────────────────────────────────────────

export function reprojectFinishBoundary(input: ReprojectFinishBoundaryInput): ReprojectFinishBoundaryResult {
    const { edges, movedWallId, prevWall } = input;
    const n = edges.length;
    const edgeOutcomes: ReprojectEdgeOutcome[] = [];

    const undetermined = (
        reason: ReprojectUndeterminedReason,
        subReason: string,
    ): ReprojectFinishBoundaryResult => ({ state: 'undetermined', reason, subReason, edgeOutcomes });

    if (n < 3) {
        return undetermined('RELATIONSHIP_NOT_RECORDED', `outer loop has ${n} edge(s) — a boundary needs at least 3`);
    }

    // ── Per-edge lines. Moved host edges are re-derived; everything else keeps
    //    its current geometry (unmoved walls get their own events). ─────────────
    const lines: XZSegment[] = [];
    let movedEdgeCount = 0;

    for (let i = 0; i < n; i++) {
        const edge = edges[i]!;
        const current = edgeGeometryXZ(edge);
        if (!current) {
            // A host edge with no fallback: §4.3 says the fallback MUST exist at
            // authoring time; without it there is nothing to measure the inset
            // against and nothing to degrade to. Refuse, never guess.
            edgeOutcomes.push({ index: i, state: 'undetermined', reason: 'RELATIONSHIP_NOT_RECORDED', subReason: 'host edge carries no fallback geometry (§4.3 violated at authoring)' });
            return { ...undetermined('RELATIONSHIP_NOT_RECORDED', `edge ${i} carries no geometry to re-derive from`), edgeOutcomes };
        }

        const isMoved = edge.type === 'hostReference' && edge.hostId === movedWallId;
        if (!isMoved) {
            lines.push(current);
            edgeOutcomes.push({ index: i, state: 'preserved' });
            continue;
        }
        movedEdgeCount++;

        // §3.1/§3.2 — finishes only ever mint `centerLine @ 0`. Any other frame
        // cannot be re-derived from a snapshot without deciding the side §3.2
        // says is undecidable; refuse rather than guess (C79 §2.3).
        if (edge.reference !== 'centerLine' || edge.offset !== 0) {
            edgeOutcomes.push({ index: i, state: 'undetermined', reason: 'GEOMETRY_UNPREDICTABLE', subReason: `reference "${edge.reference}" @ ${edge.offset} is not the centerLine@0 frame this re-derivation is defined on` });
            return { ...undetermined('GEOMETRY_UNPREDICTABLE', `edge ${i} is not centerLine@0`), edgeOutcomes };
        }

        // C72 §3.5 — prevState is never reconstructed from the store. Without it
        // the inset cannot be measured; the answer would be a guess.
        if (!prevWall) {
            edgeOutcomes.push({ index: i, state: 'undetermined', reason: 'STALE_DERIVED_STATE', subReason: 'no-prevState — the emitter did not carry the pre-mutation wall (C72 §3.1)' });
            return { ...undetermined('STALE_DERIVED_STATE', 'no-prevState'), edgeOutcomes };
        }

        const oldCentre = snapshotCentrelineXZ(prevWall);
        const oldFrame = oldCentre ? frameOf(oldCentre) : null;
        if (!oldFrame) {
            edgeOutcomes.push({ index: i, state: 'undetermined', reason: 'GEOMETRY_UNPREDICTABLE', subReason: 'degenerate pre-mutation centreline' });
            return { ...undetermined('GEOMETRY_UNPREDICTABLE', 'degenerate pre-mutation centreline'), edgeOutcomes };
        }

        const newCentre = input.resolveHostSegmentXZ(edge);
        const newFrame = newCentre ? frameOf(newCentre) : null;
        if (!newFrame) {
            edgeOutcomes.push({ index: i, state: 'undetermined', reason: 'STALE_DERIVED_STATE', subReason: `host wall "${edge.hostId}" did not resolve to a live centreline` });
            return { ...undetermined('STALE_DERIVED_STATE', `host wall "${edge.hostId}" unresolvable`), edgeOutcomes };
        }

        // Measure the authored inset against the OLD frame; re-apply on the NEW.
        const mid: XZ = { x: (current.start.x + current.end.x) / 2, z: (current.start.z + current.end.z) / 2 };
        const inset = signedPerp(mid, oldFrame);

        lines.push({
            start: { x: newCentre!.start.x + newFrame.nx * inset, z: newCentre!.start.z + newFrame.nz * inset },
            end: { x: newCentre!.end.x + newFrame.nx * inset, z: newCentre!.end.z + newFrame.nz * inset },
        });
        edgeOutcomes.push({ index: i, state: 'resized' });
    }

    if (movedEdgeCount === 0) {
        // This element holds no reference to the moved wall — the tracker's graph
        // said otherwise, but the SKETCH is the authority. Nothing happened, and
        // we checked (that is what makes this 'preserved', not 'undetermined').
        return { state: 'preserved', edgeOutcomes, subReason: `no outer-loop edge references wall "${movedWallId}"` };
    }

    // ── Ring reconstruction: intersect consecutive edge LINES. Reuses the ONE
    //    intersector in the tree (SketchLoopIntersector — the same unit the slab
    //    path uses at SlabFragmentBuilder.resolveLoop), injected, through the
    //    adapter — a finish corner and a slab corner can never be computed by
    //    rival maths. ─────────────────────────────────────────────────────────
    const resolverSegments = lines.map((s) => ({ start: xzPointToResolverPoint(s.start), end: xzPointToResolverPoint(s.end) }));
    const corners = input.intersector.computePolygon(resolverSegments);
    if (!corners || corners.length !== n) {
        return { ...undetermined('GEOMETRY_UNPREDICTABLE', 'corner intersection did not produce one vertex per edge'), edgeOutcomes };
    }
    // computePolygon returns vertices[i] = corner(seg[i], seg[i+1]) — the vertex at
    // the END of edge i, i.e. ring index (i+1). Rotate by one so the returned ring
    // keeps the sketch's index alignment (edge i runs ring[i] → ring[(i+1) % n]).
    const newRing: XZ[] = new Array(n);
    for (let i = 0; i < n; i++) {
        newRing[(i + 1) % n] = resolverPointToXzPoint(corners[i]!);
    }

    // ── Verdict ──────────────────────────────────────────────────────────────
    const currentRing: XZ[] = new Array(n);
    for (let i = 0; i < n; i++) {
        currentRing[i] = edgeGeometryXZ(edges[i]!)!.start;
    }
    const oldArea = signedAreaXZ(currentRing);
    const newArea = signedAreaXZ(newRing);
    const numbers = { oldAreaM2: Math.abs(oldArea), newAreaM2: Math.abs(newArea) };

    const unchanged = newRing.every((p, i) =>
        Math.abs(p.x - currentRing[i]!.x) < RECOMPUTE_IDENTITY_M && Math.abs(p.z - currentRing[i]!.z) < RECOMPUTE_IDENTITY_M);
    if (unchanged) {
        return { state: 'preserved', edgeOutcomes: edgeOutcomes.map((o) => ({ ...o, state: 'preserved' as const })), numbers };
    }

    // C79 §5.2.2 — `conflicted` refuses with BOTH numbers, never a silent clamp.
    // A winding flip is the measured slab failure (an inverting move re-derived a
    // ring covering ground the user never enclosed, signed 24 → -24, no refusal).
    if (Math.abs(newArea) < MIN_AREA_M2) {
        return { state: 'conflicted', subReason: `re-derived ring is degenerate: ${numbers.oldAreaM2.toFixed(3)} m² → ${numbers.newAreaM2.toFixed(6)} m²`, edgeOutcomes, numbers };
    }
    if (Math.sign(newArea) !== Math.sign(oldArea)) {
        return { state: 'conflicted', subReason: `re-derived ring inverted its winding (${numbers.oldAreaM2.toFixed(3)} m² → ${numbers.newAreaM2.toFixed(3)} m² on the far side) — the region the user enclosed no longer exists`, edgeOutcomes, numbers };
    }
    if (ringSelfIntersects(newRing)) {
        return { state: 'conflicted', subReason: `re-derived ring self-intersects (${numbers.oldAreaM2.toFixed(3)} m² → ${numbers.newAreaM2.toFixed(3)} m²)`, edgeOutcomes, numbers };
    }

    // ── 'resized' — refresh every edge's geometry to the new ring (§4.3: the
    //    fallback is always the element's OWN current geometry, kept fresh). ────
    const newEdges: FinishSketchEdgeLike[] = edges.map((edge, i) => {
        const start = newRing[i]!;
        const end = newRing[(i + 1) % n]!;
        if (edge.type === 'freeLine') {
            return { type: 'freeLine', start: { ...start }, end: { ...end } };
        }
        return { ...edge, fallback: { start: { ...start }, end: { ...end } } };
    });

    return { state: 'resized', edgeOutcomes, numbers, polygon: newRing, edges: newEdges };
}
