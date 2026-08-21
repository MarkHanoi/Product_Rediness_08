/**
 * §ROOF-FOLLOWS-WALL — the roof re-derivation's REPORTING CHANNEL
 * (C79 §5.1, §5.2, §5.2.1, §5.2.2, §5.3 · C78 §8.1 · GR-12 ·
 * check-move-propagation A7).
 *
 * ─── WHAT WAS MEASURED, BEFORE THIS MODULE EXISTED ───────────────────────────
 * `roofFollowsMovedWall.test.ts`, committed RED at 86d1d4e0:
 *
 *   × MEASURED TODAY — a bounding wall moves 2 m and the roof record does not change
 *     AssertionError: expected 36 to be close to 48, received difference is 12
 *
 * The traced REGION grows 36.000 → 48.000 m² over the move (the control in that
 * suite proves it, so "the roof did not follow" is falsifiable). The roof's
 * record stays at its authoring-time 36 m², because `packages/geometry-roof`
 * has no `wallStore.subscribe` site and roof appears in no arm of any wall-move
 * path — no subscriber, no tracker, no command.
 *
 * ─── WHY ROOF RE-DERIVES BY RE-TRACING, AND NOT BY THE SLAB'S MECHANISM ──────
 * This is the ONE place this family may not copy its precedent verbatim, and the
 * reason is a property of the data model rather than a preference:
 *
 *   · SLAB re-derives by intersecting a stored per-edge SKETCH whose edges each
 *     carry a `HostReferenceEdge` (`SlabFragmentBuilder.resolveLoopVerdict` →
 *     `classifySlabRecompute`). A roof has no sketch.
 *   · FLOOR/CEILING re-derive by re-applying a signed perpendicular INSET
 *     measured against the pre-mutation centreline
 *     (`reprojectFinishBoundary`). That needs a per-edge host and an inset
 *     distance. A roof has neither.
 *   · ROOF, by construction, records exactly two things about how its boundary
 *     came to be: the WALL-ID SET that produced it (`boundingWallIds`, added in
 *     6cd4e8e5) and the ANCHOR the user clicked, which survives as
 *     `footprint.centroid`. So the honest re-derivation is to ASK THE SAME
 *     QUESTION AGAIN: re-run `traceRoofRegionAtPoint` at the anchor against the
 *     CURRENT walls. That is not a weaker re-derivation — it is the identical
 *     production tracer that authored the boundary, so record and mesh cannot
 *     diverge by construction, and it inherits the shared tracer's curve
 *     handling and host attribution for free.
 *
 * 6cd4e8e5 refused to invent a `RoofSketch` / per-edge `RoofHostReferenceEdge`
 * triple precisely because "the roof tracer reports `hostEdges` as a COUNT and
 * exposes host identity only as a distinct wall-id LIST, so there is no per-edge
 * host mapping in hand to populate one with." Re-tracing is what the wall-id
 * list can honestly support. When the tracer surfaces per-edge identity, this
 * family can move to the slab's mechanism; until then, claiming the slab's
 * mechanism would mean claiming data nobody holds.
 *
 * ─── HOW MANY OF THE FIVE THIS PATH CAN ACTUALLY PRODUCE ─────────────────────
 * FOUR, on the wall-MOVE path, each driven by an executed test:
 *   preserved · resized · conflicted · undetermined
 *
 * `regenerated` is DECLARED and classified but is NOT producible by a wall move,
 * and saying otherwise would be the inherited green C70 §7.1 forbids. The
 * reason, stated so it is not re-discovered: a wall MOVE relocates the loop's
 * corners without changing which walls close the loop, so the re-traced ring has
 * the same vertex count and the same host set as the authored one. The state
 * becomes REACHABLE when the move changes TOPOLOGY — a wall dragged until a
 * different loop encloses the anchor — which is a wall-graph change rather than
 * a baseline change and is not what `CASCADE_WALL_BASELINE` commits. It is
 * classified here so that the day such a move arrives it is reported rather than
 * mistaken for `resized`.
 *
 * ─── VOCABULARY: NARROWED, NEVER MINTED ──────────────────────────────────────
 * The five states are C79 §5.2's, verbatim. The `undetermined` reasons are
 * members of C78 §8.1's CLOSED eleven-member union
 * (`packages/command-bus/src/consequence.ts`), narrowed to the four this path
 * can produce — the same shape as `slabRecomputeVerdict.ts:115`,
 * `reprojectFinishBoundary.ts:72`, `boundingWallDetermination.ts:46` and
 * `wallRoomAdjacencyDetermination.ts:60`, and proven a genuine subset by
 * `roofRecomputeStates.test.ts`, which reads the union out of command-bus's
 * SOURCE rather than trusting this file. Per-family specificity travels in
 * `subReason` (C78 §8.3), never as a twelfth member.
 *
 * Pure: no DOM, no store, no THREE, no side effects.
 */

import { RECOMPUTE_IDENTITY_M } from '@pryzm/geometry-kernel';

/** Roof's 2D convention throughout this module: `[x, z]` in WORLD coordinates. */
export type RoofXZ = readonly [number, number];

// ── The five states (C79 §5.2) ───────────────────────────────────────────────

export type RoofRecomputeState =
    | 'preserved'
    | 'resized'
    | 'regenerated'
    | 'conflicted'
    | 'undetermined';

/**
 * §5.3's ordering — `preserved < resized < regenerated < conflicted <
 * undetermined`. An element's state is the WORST of its parts.
 */
export const ROOF_RECOMPUTE_STATE_ORDER: readonly RoofRecomputeState[] = [
    'preserved', 'resized', 'regenerated', 'conflicted', 'undetermined',
];

/** C79 §5.3 — the worst of a set of states. `preserved` for an empty set. */
export function worstRoofRecomputeState(
    states: readonly RoofRecomputeState[],
): RoofRecomputeState {
    let worst: RoofRecomputeState = 'preserved';
    for (const s of states) {
        if (ROOF_RECOMPUTE_STATE_ORDER.indexOf(s) > ROOF_RECOMPUTE_STATE_ORDER.indexOf(worst)) worst = s;
    }
    return worst;
}

/**
 * The C78 §8.1 members this path can produce. CLOSED here; add members THERE.
 *
 * `GEOMETRY_UNPREDICTABLE`    — the re-trace found NO closed wall loop enclosing
 *                               the roof's anchor, or one too degenerate to be a
 *                               boundary. §8.1: "the prediction is geometrically
 *                               impossible or out of scope for the predictor."
 *                               This is the state the RED suite's ARM 3 pins:
 *                               it must never be reported as an empty polygon.
 * `STALE_DERIVED_STATE`       — walls this roof is recorded as bounded by are no
 *                               longer in the wall set, so whatever ring is in
 *                               hand is a memory and not a measurement. We did
 *                               not re-derive (§5.2.1).
 * `RELATIONSHIP_NOT_RECORDED` — there is no anchor or no previously recorded
 *                               ring to judge a re-derivation against.
 * `ENGINE_NOT_AVAILABLE`      — the wall set this re-derivation reads is not
 *                               reachable in this runtime. "I could not look" is
 *                               a different fact from "I looked and it is gone",
 *                               and the two must never print the same value.
 */
export type RoofRecomputeUndeterminedReason =
    | 'GEOMETRY_UNPREDICTABLE'
    | 'STALE_DERIVED_STATE'
    | 'RELATIONSHIP_NOT_RECORDED'
    | 'ENGINE_NOT_AVAILABLE';

// ── What the re-trace produced (the channel the tracker fills) ───────────────

/**
 * The outcome of re-asking the region question at the roof's anchor.
 *
 * `ring === null` and `undetermined` are DELIBERATELY separate fields: a null
 * ring is one specific reason among several, and collapsing "no region" into
 * "something went wrong" is the same defect in miniature that this whole row
 * exists to close.
 */
export interface RoofRegionResolution {
    /** The re-traced WORLD ring, or `null` when no closed region encloses the anchor. */
    ring: readonly RoofXZ[] | null;
    /** Distinct wall ids the re-trace attributed the NEW ring to. */
    hostWallIds: readonly string[];
    /**
     * Of the roof's RECORDED `boundingWallIds`, those still present in the wall
     * set. Present ≠ unmoved: this is an existence check, and a wall that moved
     * is still `resolved`.
     */
    resolvedHostIds: readonly string[];
    /** Recorded bounding walls that are no longer in the wall set at all. */
    missingHostIds: readonly string[];
    /** Set iff the re-trace could not be attempted. Never inferred from `ring === null`. */
    undetermined?: { reason: RoofRecomputeUndeterminedReason; subReason: string };
}

// ── The verdict ──────────────────────────────────────────────────────────────

export interface RoofRecomputeVerdict {
    roofId: string;
    /** Exactly one of the five (C79 §5.2). */
    state: RoofRecomputeState;
    reason?: RoofRecomputeUndeterminedReason;
    /** C78 §8.3 per-family specificity — always present, never prose-only detail. */
    subReason: string;
    /** BOTH numbers, named, on every verdict that has them (C73 §4 / C79 §5.2.2). */
    numbers?: { oldAreaM2: number; newAreaM2: number };
    /**
     * The re-derived footprint in the roof's STORED form — centroid-local
     * polygon plus world centroid, exactly as `RoofTool._normalisePolygon`
     * produces it, so a caller can write it back without re-deriving anything.
     *
     * Present iff the state is `resized`, `regenerated` or `conflicted` — i.e.
     * whenever a real re-derivation exists. ABSENT on `undetermined`, which is
     * the property ARM 3 pins: there is nothing to write, and an empty ring
     * would be an answer where there is none.
     */
    footprint?: { polygon: [number, number][]; centroid: [number, number] };
    /** The re-derived host attribution, so a write-back keeps the reference fresh. */
    boundingWallIds?: string[];
}

// §C73-EPSILON-POLICY — `RECOMPUTE_IDENTITY_M` is the kernel's declared role for
// exactly this question ("did re-deriving change it AT ALL?"), not COINCIDENT_M's
// "are these the same model point?". A real sub-millimetre resize must never read
// `preserved`: `preserved` is a positive verdict, not a loose comparison.
const MIN_AREA_M2 = 1e-6;

/** Signed shoelace area in roof's `[x, z]` convention (positive = CCW). */
export function signedAreaXZ(ring: ReadonlyArray<RoofXZ>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
}

/**
 * Are two rings the same closed boundary? Cyclic — the tracer's walk may start
 * at a different vertex between two runs — but deliberately NOT
 * reflection-invariant: a winding flip is a real change, and `conflicted` below
 * depends on seeing it.
 *
 * Same predicate and same epsilon as `slabRecomputeVerdict.ringsEqualCyclic`,
 * re-expressed in roof's `[x, z]` tuple convention rather than imported, because
 * importing it would mean converting every vertex twice per comparison to cross
 * a package boundary for eleven lines of arithmetic. `roofRecomputeStates.test.ts`
 * pins the two against each other so they cannot drift.
 */
export function ringsEqualCyclicXZ(
    a: ReadonlyArray<RoofXZ>,
    b: ReadonlyArray<RoofXZ>,
    eps = RECOMPUTE_IDENTITY_M,
): boolean {
    if (a.length !== b.length) return false;
    const n = a.length;
    if (n === 0) return true;
    const first = a[0]!;
    for (let k = 0; k < n; k++) {
        const cand = b[k]!;
        if (Math.abs(first[0] - cand[0]) >= eps || Math.abs(first[1] - cand[1]) >= eps) continue;
        let all = true;
        for (let i = 1; i < n; i++) {
            const p = a[i]!, q = b[(k + i) % n]!;
            if (Math.abs(p[0] - q[0]) >= eps || Math.abs(p[1] - q[1]) >= eps) { all = false; break; }
        }
        if (all) return true;
    }
    return false;
}

/**
 * Does a closed ring cross itself? A self-intersecting boundary is not a
 * buildable roof footprint, so it is `conflicted` rather than `resized`.
 *
 * Deliberately local rather than `geometry-kernel`'s `findSelfIntersection`:
 * that helper speaks `{x, y}` and this module speaks `[x, z]` tuples, and the
 * conversion at every call site is more surface than the O(n²) segment test it
 * would save. Roof footprints are single-digit vertex counts.
 */
export function selfIntersectsXZ(ring: ReadonlyArray<RoofXZ>): boolean {
    const n = ring.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
        const a1 = ring[i]!, a2 = ring[(i + 1) % n]!;
        for (let j = i + 1; j < n; j++) {
            // Skip adjacent segments (they legitimately share a vertex) and the
            // wrap-around pair that shares the ring's first vertex.
            if (j === i || (j + 1) % n === i || j === (i + 1) % n) continue;
            const b1 = ring[j]!, b2 = ring[(j + 1) % n]!;
            if (segmentsProperlyCross(a1, a2, b1, b2)) return true;
        }
    }
    return false;
}

function cross(o: RoofXZ, a: RoofXZ, b: RoofXZ): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsProperlyCross(p1: RoofXZ, p2: RoofXZ, q1: RoofXZ, q2: RoofXZ): boolean {
    const d1 = cross(q1, q2, p1);
    const d2 = cross(q1, q2, p2);
    const d3 = cross(p1, p2, q1);
    const d4 = cross(p1, p2, q2);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
        && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * `RoofTool._normalisePolygon`'s storage form — centroid-local polygon plus the
 * world centroid. Re-expressed here (and pinned against the tool by
 * `roofFollowsMovedWall.test.ts`) so a re-derivation lands in EXACTLY the shape
 * a creation lands in: a write-back that stored a world ring would silently
 * double the offset the next time anything read the footprint.
 */
export function toStoredFootprint(
    worldRing: ReadonlyArray<RoofXZ>,
): { polygon: [number, number][]; centroid: [number, number] } {
    let cx = 0, cz = 0;
    for (const [x, z] of worldRing) { cx += x; cz += z; }
    cx /= worldRing.length; cz /= worldRing.length;
    return {
        polygon: worldRing.map(([x, z]) => [x - cx, z - cz] as [number, number]),
        centroid: [cx, cz],
    };
}

/** The inverse — the stored footprint read back as a WORLD ring. */
export function toWorldRing(
    footprint: { polygon: ReadonlyArray<RoofXZ>; centroid: RoofXZ },
): RoofXZ[] {
    const [cx, cz] = footprint.centroid;
    return footprint.polygon.map(([x, z]) => [x + cx, z + cz] as RoofXZ);
}

export interface ClassifyRoofRecomputeInput {
    roofId: string;
    /** The WORLD ring the record held BEFORE this re-derivation. */
    previousRing: ReadonlyArray<RoofXZ> | null | undefined;
    /** The wall ids the record says bounded it (`RoofData.boundingWallIds`). */
    recordedHostIds: readonly string[];
    /** What re-tracing at the roof's anchor produced. */
    resolution: RoofRegionResolution;
}

/**
 * Turn (previous ring, re-trace) into EXACTLY ONE of C79 §5.2's five states.
 *
 * Order matters and is the contract's, not a convenience:
 *   1. `undetermined` FIRST and unconditionally — §5.2.1 forbids collapsing it
 *      into `preserved`, and a stale ring that happens to equal the stored ring
 *      is precisely the collapse ("the same pixels, opposite facts"). §5.3's
 *      worst-of-its-parts rule puts `undetermined` at the top of the ordering.
 *   2. `preserved` — re-derived from live walls and nothing moved.
 *   3. `conflicted` — the re-derivation violates a rule the family enforces, and
 *      it REFUSES WITH BOTH NUMBERS (§5.2.2 / C73 §4): a degenerate ring, a
 *      winding inversion (the region now encloses the far side of the walls it
 *      was drawn between), or a self-intersection.
 *   4. `regenerated` — topologically different (see the header: not producible
 *      by a baseline move today).
 *   5. `resized` — the normal success case.
 */
export function classifyRoofRecompute(input: ClassifyRoofRecomputeInput): RoofRecomputeVerdict {
    const { roofId, previousRing, recordedHostIds, resolution } = input;

    const undetermined = (
        reason: RoofRecomputeUndeterminedReason,
        subReason: string,
    ): RoofRecomputeVerdict => ({ roofId, state: 'undetermined', reason, subReason });

    // ── 1 · undetermined ─────────────────────────────────────────────────────
    if (resolution.undetermined) {
        return undetermined(resolution.undetermined.reason, resolution.undetermined.subReason);
    }
    if (resolution.missingHostIds.length > 0) {
        // A wall this roof is recorded as bounded by is GONE. Whatever the
        // re-trace returned is not a re-derivation of the boundary that was
        // authored, and §4.3's keep-the-old-ring rule means the ring in hand is
        // a memory. Report that, rather than a number that looks measured.
        return undetermined(
            'STALE_DERIVED_STATE',
            `${resolution.missingHostIds.length} of ${recordedHostIds.length} recorded bounding wall(s) ` +
            `are no longer in the wall set (${resolution.missingHostIds.join(', ')}) — the boundary in ` +
            `hand is the authoring-time ring, not a re-derivation`,
        );
    }
    const ring = resolution.ring;
    if (!ring || ring.length < 3) {
        return undetermined(
            'GEOMETRY_UNPREDICTABLE',
            ring
                ? `re-tracing at the roof's anchor closed a ${ring.length}-vertex loop — a boundary needs at least 3`
                : `no closed wall loop encloses the roof's anchor after the move — the region this roof was ` +
                  `traced from no longer exists, and there is no boundary to re-derive`,
        );
    }
    if (!previousRing || previousRing.length < 3) {
        // We DID re-derive, but there is no recorded ring to judge the outcome
        // against. A known-unknown, not a success (§5.2's own gloss on
        // `undetermined`: "could not be judged").
        return undetermined(
            'RELATIONSHIP_NOT_RECORDED',
            `re-derived ${Math.abs(signedAreaXZ(ring)).toFixed(3)} m², but the record holds ` +
            `${previousRing ? `${previousRing.length} vertice(s)` : 'no ring'} to judge the outcome against`,
        );
    }

    const oldArea = signedAreaXZ(previousRing);
    const newArea = signedAreaXZ(ring);
    const numbers = { oldAreaM2: Math.abs(oldArea), newAreaM2: Math.abs(newArea) };
    const both = `${numbers.oldAreaM2.toFixed(3)} m² → ${numbers.newAreaM2.toFixed(3)} m²`;
    const stored = toStoredFootprint(ring);
    const boundingWallIds = [...resolution.hostWallIds];

    // ── 2 · preserved ────────────────────────────────────────────────────────
    if (ringsEqualCyclicXZ(ring, previousRing)) {
        return {
            roofId, state: 'preserved', numbers, boundingWallIds,
            subReason: `re-derived from live walls and the boundary is unchanged within ` +
                `${RECOMPUTE_IDENTITY_M} m (${both})`,
        };
    }

    // ── 3 · conflicted — refuse, naming BOTH numbers (§5.2.2) ────────────────
    if (Math.abs(newArea) < MIN_AREA_M2) {
        return {
            roofId, state: 'conflicted', numbers, footprint: stored, boundingWallIds,
            subReason: `the re-derived boundary collapsed to ${numbers.newAreaM2.toFixed(6)} m² ` +
                `(${both}) — a roof cannot be built on it`,
        };
    }
    if (Math.sign(newArea) !== Math.sign(oldArea)) {
        return {
            roofId, state: 'conflicted', numbers, footprint: stored, boundingWallIds,
            subReason: `the re-derived boundary INVERTED its winding (${both}, on the far side of the ` +
                `walls it was drawn between) — the region enclosed at authoring time no longer exists`,
        };
    }
    if (selfIntersectsXZ(ring)) {
        return {
            roofId, state: 'conflicted', numbers, footprint: stored, boundingWallIds,
            subReason: `the re-derived boundary crosses itself (${both}) — not a buildable roof footprint`,
        };
    }

    // ── 4 · regenerated — see the header: not producible by a baseline move ──
    const sameHosts =
        recordedHostIds.length === boundingWallIds.length &&
        [...recordedHostIds].sort().join('\u0000') === [...boundingWallIds].sort().join('\u0000');
    if (ring.length !== previousRing.length || !sameHosts) {
        return {
            roofId, state: 'regenerated', numbers, footprint: stored, boundingWallIds,
            subReason: ring.length !== previousRing.length
                ? `the re-derived boundary has ${ring.length} vertices where the record held ` +
                  `${previousRing.length} (${both}) — the loop's topology changed, not only its size`
                : `the re-derived boundary is closed by a different wall set ` +
                  `(recorded ${recordedHostIds.join(', ') || 'none'} → now ${boundingWallIds.join(', ') || 'none'}, ` +
                  `${both}) — a different region encloses the anchor`,
        };
    }

    // ── 5 · resized — the normal success case ────────────────────────────────
    return {
        roofId, state: 'resized', numbers, footprint: stored, boundingWallIds,
        subReason: `re-derived from live walls; the boundary followed the move (${both})`,
    };
}
