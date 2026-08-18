/**
 * @file planarFaceWalk.ts
 * §C73-PTE-CANONICAL — THE planar left-face half-edge walk (C73 §3.1 family
 * `planar-topology-engine`; GE-12). Pure, THREE-free, DOM-free, I/O-free, RNG-free.
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS (C73 §3.6/§3.7 — the founder's ruling, verbatim)
 * ════════════════════════════════════════════════════════════════════════════════
 * > "Adopt the extraction. The ~45-line planar walk moves to `geometry-kernel/src/pure/`
 * > and becomes the canonical implementation. THREE remains an adapter. Put the
 * > algorithm/logic in the pure geometry kernel. Keep THREE-specific types at the
 * > adapter boundary. Both callers should consume the same extracted implementation."
 * > "Make filtering and deterministic tiebreak semantics EXPLICIT rather than inheriting
 * > incidental behaviour. Document: what candidates are filtered out; what happens when
 * > multiple candidates qualify; the deterministic tiebreak order. That prevents
 * > GR-05/GE-12 from having subtly different geometric answers."
 *
 * The two shipping bodies this replaces:
 *   • `packages/room-topology/src/PlanarTopologyEngine.ts` (`computeTopology`) — the
 *     survivor of an earlier collapse (an ai-host copy was proven byte-equivalent at
 *     7,058 normalised chars and removed).
 *   • `packages/auto-dimension/src/perimeter.ts` (`traceFaces`) — a hand PORT, not an
 *     import, and GENUINELY DRIFTED. It could not import the owner: `@pryzm/auto-dimension`
 *     depended on `@pryzm/schemas` ALONE, while `room-topology`'s barrel pulls THREE
 *     through eight files. A THREE-free home in the kernel is exactly what unblocks it.
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * THE ALGORITHM
 * ════════════════════════════════════════════════════════════════════════════════
 * Given an undirected plane graph (nodes at XZ positions, edges between them), split
 * every edge into two directed half-edges and walk each one's LEFT face: arriving at `v`
 * from `u`, leave along the neighbour that sits immediately CLOCKWISE of `u` in `v`'s
 * angular order (`(uIdx - 1 + n) % n`). Orbits of that "next" permutation are exactly
 * the faces of the embedding. Interior faces come back COUNTER-CLOCKWISE (positive
 * shoelace); the face that encloses the graph from outside comes back CLOCKWISE
 * (negative shoelace) — which is why "the outer face" is spelled "most negative area"
 * throughout this file and its callers.
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * §PTE-FILTERED — WHAT CANDIDATES ARE FILTERED OUT (and by WHOM)
 * ════════════════════════════════════════════════════════════════════════════════
 * IN THE WALK, ALWAYS — three PRECONDITION drops, applied to EDGES before any tracing.
 * Each one is a shape the walk cannot represent, not a policy choice:
 *   (F1) an edge whose start and end node ids are equal (a self-loop). Both callers
 *        already dropped these upstream (`buildWallGraph:277`, `buildGraph:115`); stating
 *        it here means the walk is total rather than relying on a caller's habit.
 *   (F2) an edge either of whose endpoints has no entry in `positions`. THIS IS THE
 *        DRIFT AXIS "missing position": `room-topology` guarded (a missing position made
 *        its shoelace `continue` and its angular comparator `return 0` — a silently
 *        WRONG area and an unstable sort); `auto-dimension` asserted with `!` and would
 *        have produced `NaN` angles and an `undefined.z` throw. NEITHER was right, so
 *        neither was inherited. Dropping the edge is the only answer that is total AND
 *        never reports an area computed from a hole. Callers that care can compare
 *        `edges.length` before and after — the drop is deterministic, not silent luck.
 *   (F3) `nodeIds.length < minRingNodes` (default 3). A ring of fewer than three nodes
 *        encloses nothing. Identical in both prior bodies.
 *
 * BY THE CALLER, VIA `minAbsFaceAreaM2` — THE DRIFT AXIS "face-area filter".
 *   `room-topology:163` dropped faces with `|area| < 0.1`; `auto-dimension:307` applied
 *   NO area filter at all. THE DEFAULT HERE IS 0 — the walk reports EVERY closed face —
 *   and the threshold is an explicit caller parameter. This is a decision, not a
 *   split-the-difference: an area threshold is a DOMAIN judgement about what a face
 *   MEANS ("is this a room?"), not a fact about the topology. Baking 0.1 into the walk
 *   would silently change `auto-dimension`'s shipped output (a small courtyard or a
 *   narrow lightwell is a real face); baking 0 into `room-topology` would promote
 *   sub-0.1 m² slivers into its room pipeline. Both callers keep exactly the number they
 *   shipped with, and both now say it out loud at the call site.
 *   ⚠ `auto-dimension` does NOT thereby run unfiltered: `buildings.ts:142` drops faces at
 *   `MIN_BUILDING_AREA_M2 = 1e-6` as a degeneracy guard, downstream, where "a BUILDING
 *   must enclose area" is the domain statement. That is the same principle, one layer up.
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * §PTE-TIEBREAK — WHAT HAPPENS WHEN MULTIPLE CANDIDATES QUALIFY
 * ════════════════════════════════════════════════════════════════════════════════
 * (T1) ANGULAR ORDER, two neighbours at the SAME atan2 angle from a node — i.e. exactly
 *      collinear, overlapping edges. `room-topology:128` broke the tie with
 *      `localeCompare`; `auto-dimension:260` with codepoint `<`. SETTLED: CODEPOINT.
 *      `localeCompare` is ICU/locale-dependent — the same wall graph could produce a
 *      different room decomposition on a different machine, which is not a tiebreak but
 *      a nondeterminism with a tiebreak's job title. Codepoint order is total, stable and
 *      environment-independent. Tie beyond that (same neighbour id twice — parallel
 *      duplicate edges) falls through to `edgeId`, also codepoint.
 * (T2) SEED ORDER, which half-edge starts a face. `room-topology:139` seeded in `Map`
 *      insertion order — and its `Map` is keyed by a random `uuid()`
 *      (`WallIntersectionResolver:279`), so the order was incidental in the strict sense:
 *      reorder the input walls and the output rotates. `auto-dimension:286` seeded in
 *      sorted wall-id order. SETTLED: SORTED, by `(id, startNodeId, endNodeId)` — a total
 *      key, because a split wall legitimately yields several edges sharing one `wallId`.
 *      ⚠ WHAT THIS CHANGES AND WHAT IT CANNOT: the "next half-edge" map is a BIJECTION on
 *      half-edges, so faces are its ORBITS — the SET of faces, their areas and their
 *      membership are invariant to seed order. Only the ORDER of the returned array and
 *      the ROTATION of each ring depend on it. `auto-dimension` was already sorted and is
 *      therefore unchanged; `room-topology` gains reorder-stability it never had.
 * (T3) HALF-EDGE → EDGE ID, when two distinct edges join the same ordered node pair
 *      (duplicated walls). Both prior bodies let the LAST writer win an insertion-ordered
 *      `Map` — incidental. SETTLED: the lexicographically SMALLEST edge id wins, which is
 *      first-wins over the sorted seed list. Geometry is identical either way; only the
 *      reported `edgeIds` differ, and now they differ deterministically.
 * (T4) OUTER-FACE SELECTION, two faces tied on the most-negative area. Both prior bodies
 *      kept the first encountered, which under (T2) was incidental. SETTLED: the face
 *      whose lexicographically smallest node id is smaller wins; if that also ties, the
 *      earlier face in trace order wins (now itself deterministic). Reachable in practice:
 *      two congruent disjoint footprints on one level tie exactly.
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * §PTE-OUTER-FACE — THE DANGEROUS AXIS, DELIBERATELY NOT UNIFIED
 * ════════════════════════════════════════════════════════════════════════════════
 * `room-topology:170` takes ONE outer face: the single most-negative face of the whole
 * graph. `auto-dimension:170` (`tracePerimeters`) partitions by connected component and
 * takes one outer face PER COMPONENT — because L-268 was exactly this: the founder had
 * two buildings, the singular rule kept the larger, and the smaller was discarded in
 * silence with nothing said.
 *
 * THESE ARE DIFFERENT ANSWERS, NOT DIFFERENT STYLES, and a silent winner here would be a
 * regression whichever side won: force per-component on `room-topology` and a detached
 * garden wall starts contributing an "outer face" the room pipeline never expected;
 * force singular on `auto-dimension` and L-268 comes straight back. So the walk does NOT
 * decide. It returns every face, and the two policies are separate, named, exported
 * functions — {@link selectOuterFaceXZ} and {@link selectOuterFacePerComponentXZ}. A
 * caller must therefore NAME which question it is asking, and a reader of the call site
 * can see the answer without reading this file.
 *
 * ════════════════════════════════════════════════════════════════════════════════
 * REUSE (C73 §3.1, `polygon-area-and-winding`)
 * ════════════════════════════════════════════════════════════════════════════════
 * Signed area comes from the canonical shoelace `polygonSignedAreaOrdinates`
 * (`pure/polygonOffset.ts`, §C73-AREA-CANONICAL). It is CALLED, never re-spelled — both
 * prior bodies carried their own accumulation, and both are struck from that family's
 * census by this collapse.
 *
 * ORACLE (C73 §6): `packages/room-topology/src/__tests__/planarTopologyOracle.test.ts`
 * and `packages/auto-dimension/__tests__/planarFaceWalkOracle.test.ts` — hand-computable
 * answers, asserted against BOTH adapters and against this function directly.
 */

import { polygonSignedAreaOrdinates } from './polygonOffset.js';

/** Plan-view point in metres (world XZ, y dropped — the estate's plan convention). */
export interface PlanarPointXZ {
    readonly x: number;
    readonly z: number;
}

/**
 * One undirected edge of the plane graph. `id` is the caller's own identity for it (a
 * wall id, typically) and is carried through onto the traced rings; it is NOT required
 * to be unique — a wall split at T-junctions yields several edges sharing one id, which
 * is why every ordering key in this module is a tuple, never `id` alone.
 */
export interface PlanarEdgeXZ {
    readonly id: string;
    readonly startNodeId: string;
    readonly endNodeId: string;
}

export interface PlanarGraphXZ {
    /** node id → position. An edge endpoint missing here drops the edge — §PTE-FILTERED (F2). */
    readonly positions: ReadonlyMap<string, PlanarPointXZ>;
    readonly edges: readonly PlanarEdgeXZ[];
}

/** One traced face. `edgeIds[i]` joins `nodeIds[i]` → `nodeIds[(i + 1) % n]`. */
export interface PlanarFaceXZ {
    readonly nodeIds: readonly string[];
    readonly edgeIds: readonly string[];
    /** Shoelace. Positive ⇒ interior (CCW); negative ⇒ encloses the graph (CW). */
    readonly signedAreaM2: number;
}

export interface PlanarFaceWalkOptions {
    /**
     * Faces with `|signedAreaM2|` strictly below this are dropped. DEFAULT 0 — no filter,
     * every closed face is reported. §PTE-FILTERED explains why the walk does not own
     * this number. `room-topology` passes 0.1; `auto-dimension` passes nothing.
     */
    readonly minAbsFaceAreaM2?: number;
    /** Minimum nodes in a ring. DEFAULT 3 — fewer encloses nothing. */
    readonly minRingNodes?: number;
}

/**
 * Iteration ceiling for one face walk: `edgeCount * MULTIPLIER + SLACK`. A face cycle
 * visits at most `2 * edgeCount` half-edges, so 4× is slack on top of slack; it exists
 * to make a malformed adjacency terminate, not to bound a legitimate face. Both prior
 * bodies used exactly these numbers — this axis never drifted.
 */
export const PLANAR_FACE_MAX_ITER_MULTIPLIER = 4;
export const PLANAR_FACE_MAX_ITER_SLACK = 16;

interface NeighbourRef {
    readonly neighborId: string;
    readonly edgeId: string;
}

/** Codepoint compare. Deliberately NOT `localeCompare` — see §PTE-TIEBREAK (T1). */
function byCodepoint(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Shoelace signed area of a ring given by node ids, in the XZ plane. Positive ⇒ CCW.
 *
 * Node ids with no position are dropped from the ring before the accumulation (the
 * §PTE-FILTERED (F2) guarantee makes this unreachable from within the walk itself; it is
 * kept total because this helper is exported and callers hold their own node lists).
 * Delegates to the canonical shoelace — this module mints no area body of its own.
 */
export function planarRingSignedAreaXZ(
    nodeIds: readonly string[],
    positions: ReadonlyMap<string, PlanarPointXZ>,
): number {
    const pts: PlanarPointXZ[] = [];
    for (const id of nodeIds) {
        const p = positions.get(id);
        if (p) pts.push(p);
    }
    return polygonSignedAreaOrdinates(pts.length, (i) => pts[i]!.x, (i) => pts[i]!.z);
}

/**
 * Trace EVERY closed face of the plane graph — the canonical left-face half-edge walk.
 *
 * Deterministic for a given `PlanarGraphXZ` regardless of the order the edges arrive in:
 * seeds are sorted (§PTE-TIEBREAK T2), angular ties break on codepoint (T1), duplicate
 * half-edges resolve to the smallest edge id (T3).
 *
 * Selecting an "outer face" among the result is NOT this function's job — see
 * §PTE-OUTER-FACE and the two named policies below.
 */
export function tracePlanarFacesXZ(
    graph: PlanarGraphXZ,
    options: PlanarFaceWalkOptions = {},
): PlanarFaceXZ[] {
    const minAbsFaceAreaM2 = options.minAbsFaceAreaM2 ?? 0;
    const minRingNodes = options.minRingNodes ?? 3;
    const { positions } = graph;

    // §PTE-FILTERED (F1) + (F2) — preconditions, applied before anything is traced.
    const usable = graph.edges.filter(
        (e) =>
            e.startNodeId !== e.endNodeId &&
            positions.has(e.startNodeId) &&
            positions.has(e.endNodeId),
    );
    if (usable.length === 0) return [];

    // §PTE-TIEBREAK (T2) — a total seed order over a tuple, not over `id` alone.
    const seedEdges = [...usable].sort(
        (a, b) =>
            byCodepoint(a.id, b.id) ||
            byCodepoint(a.startNodeId, b.startNodeId) ||
            byCodepoint(a.endNodeId, b.endNodeId),
    );

    const adj = new Map<string, NeighbourRef[]>();
    const halfEdgeId = new Map<string, string>();
    const link = (from: string, to: string, edgeId: string): void => {
        let list = adj.get(from);
        if (!list) { list = []; adj.set(from, list); }
        list.push({ neighborId: to, edgeId });
    };
    for (const e of seedEdges) {
        const { id, startNodeId: s, endNodeId: t } = e;
        link(s, t, id);
        link(t, s, id);
        // §PTE-TIEBREAK (T3) — first (= smallest, the list is sorted) writer wins.
        if (!halfEdgeId.has(`${s}→${t}`)) halfEdgeId.set(`${s}→${t}`, id);
        if (!halfEdgeId.has(`${t}→${s}`)) halfEdgeId.set(`${t}→${s}`, id);
    }

    // Angular order about each node. `!` is sound: (F2) guaranteed every id here is a
    // key of `positions`, which is precisely why that filter is a precondition and not
    // a per-comparison guard returning 0 (the old room-topology shape, an unstable sort).
    const adjSorted = new Map<string, NeighbourRef[]>();
    for (const [nodeId, neighbours] of adj) {
        const v = positions.get(nodeId)!;
        const sorted = [...neighbours].sort((a, b) => {
            const ap = positions.get(a.neighborId)!;
            const bp = positions.get(b.neighborId)!;
            const aA = Math.atan2(ap.z - v.z, ap.x - v.x);
            const bA = Math.atan2(bp.z - v.z, bp.x - v.x);
            if (aA !== bA) return aA - bA;
            // §PTE-TIEBREAK (T1) — codepoint, never locale.
            return byCodepoint(a.neighborId, b.neighborId) || byCodepoint(a.edgeId, b.edgeId);
        });
        adjSorted.set(nodeId, sorted);
    }

    /** Arriving at `v` from `u`, leave along the neighbour immediately CLOCKWISE of `u`. */
    function nextHalfEdge(
        uId: string,
        vId: string,
    ): { nextU: string; nextV: string } | null {
        const neighbours = adjSorted.get(vId) ?? [];
        const n = neighbours.length;
        if (n === 0) return null;
        if (n === 1) {
            // A leaf: the only way on is back along the edge we arrived by.
            const only = neighbours[0]!;
            return only.neighborId === uId ? { nextU: vId, nextV: uId } : null;
        }
        const uIdx = neighbours.findIndex((nb) => nb.neighborId === uId);
        if (uIdx === -1) {
            // Unreachable for a consistent adjacency (we arrived FROM u, so u is a
            // neighbour of v). Retained from both prior bodies verbatim rather than
            // converted to a throw: this is a walk over user geometry, and refusing to
            // return a face is not worth a crash.
            const fb = neighbours.find((nb) => nb.neighborId !== uId);
            return fb ? { nextU: vId, nextV: fb.neighborId } : null;
        }
        const chosen = neighbours[(uIdx - 1 + n) % n]!;
        return { nextU: vId, nextV: chosen.neighborId };
    }

    const visited = new Set<string>();
    const maxIter = seedEdges.length * PLANAR_FACE_MAX_ITER_MULTIPLIER + PLANAR_FACE_MAX_ITER_SLACK;
    const faces: PlanarFaceXZ[] = [];

    for (const e of seedEdges) {
        const directions: ReadonlyArray<readonly [string, string]> = [
            [e.startNodeId, e.endNodeId],
            [e.endNodeId, e.startNodeId],
        ];
        for (const [sId, tId] of directions) {
            if (visited.has(`${sId}→${tId}`)) continue;

            const nodeIds: string[] = [];
            const edgeIds: string[] = [];
            let curU = sId;
            let curV = tId;
            let iter = 0;

            while (iter < maxIter) {
                const key = `${curU}→${curV}`;
                if (visited.has(key)) break;
                visited.add(key);
                nodeIds.push(curU);
                edgeIds.push(halfEdgeId.get(key) ?? '');
                const next = nextHalfEdge(curU, curV);
                if (!next) break;
                curU = next.nextU;
                curV = next.nextV;
                iter++;
            }

            // §PTE-FILTERED (F3), then the caller's area policy.
            if (nodeIds.length < minRingNodes) continue;
            const signedAreaM2 = planarRingSignedAreaXZ(nodeIds, positions);
            if (Math.abs(signedAreaM2) < minAbsFaceAreaM2) continue;
            faces.push({ nodeIds, edgeIds, signedAreaM2 });
        }
    }

    return faces;
}

/** Lexicographically smallest node id in a face — the §PTE-TIEBREAK (T4) key. */
function smallestNodeId(face: PlanarFaceXZ): string {
    let best: string | null = null;
    for (const id of face.nodeIds) if (best === null || id < best) best = id;
    return best ?? '';
}

function beatsAsOuter(candidate: PlanarFaceXZ, incumbent: PlanarFaceXZ): boolean {
    if (candidate.signedAreaM2 !== incumbent.signedAreaM2) {
        return candidate.signedAreaM2 < incumbent.signedAreaM2;
    }
    // §PTE-TIEBREAK (T4).
    return smallestNodeId(candidate) < smallestNodeId(incumbent);
}

/**
 * POLICY A — ONE outer face for the WHOLE graph: the single most-negative-area face.
 *
 * §PTE-OUTER-FACE: singular BY DESIGN, and therefore only meaningful on a graph you
 * already know to be one connected footprint. On a level with two disjoint buildings this
 * keeps the LARGER and discards the other in silence — that is L-268, and it is retained
 * as a named policy precisely so that a caller choosing it has chosen it.
 *
 * `null` when there are no faces (an open run of walls encloses nothing — empty is the
 * honest answer, not a failure).
 */
export function selectOuterFaceXZ(faces: readonly PlanarFaceXZ[]): PlanarFaceXZ | null {
    let best: PlanarFaceXZ | null = null;
    for (const f of faces) {
        if (best === null || beatsAsOuter(f, best)) best = f;
    }
    return best;
}

/**
 * Connected components of the plane graph, as `nodeId → componentKey`, fully compressed.
 *
 * The representative is ALWAYS the lexicographically smallest node id in the component,
 * so the key is a stable identity a caller may use as a building id (which
 * `auto-dimension/buildings.ts` does). Union-find; order-stable — the same graph yields
 * the same keys regardless of the order the edges arrived in.
 *
 * Nodes with a position but no edge are their own component (`positions` seeds the
 * forest, not `edges`), so an isolated node cannot silently join its nearest neighbour.
 */
export function planarComponentsXZ(graph: PlanarGraphXZ): Map<string, string> {
    const parent = new Map<string, string>();
    for (const id of graph.positions.keys()) parent.set(id, id);

    const find = (a: string): string => {
        let r = a;
        while (parent.get(r) !== r) r = parent.get(r)!;
        let c = a;
        while (parent.get(c) !== r) {
            const nxt = parent.get(c)!;
            parent.set(c, r);
            c = nxt;
        }
        return r;
    };

    for (const e of graph.edges) {
        if (!parent.has(e.startNodeId) || !parent.has(e.endNodeId)) continue;
        const rs = find(e.startNodeId);
        const re = find(e.endNodeId);
        if (rs === re) continue;
        // Smaller id wins the representative → the key is the component's minimum.
        parent.set(rs < re ? re : rs, rs < re ? rs : re);
    }

    for (const id of [...parent.keys()]) parent.set(id, find(id));
    return parent;
}

/**
 * POLICY B — ONE outer face PER CONNECTED COMPONENT, returned in ascending component-key
 * order.
 *
 * §PTE-OUTER-FACE / §FIX-AUTODIM-MULTI-BUILDING (L-268): the partition happens ALWAYS —
 * a single footprint is simply N = 1 down the same path, so there is no "if two buildings"
 * branch for a future author to forget. A component with no closed face contributes
 * nothing (an open run of walls is not a footprint).
 *
 * Faces are attributed to a component by their first node; every node of a traced face is
 * in one component by construction.
 */
export function selectOuterFacePerComponentXZ(
    graph: PlanarGraphXZ,
    faces: readonly PlanarFaceXZ[],
): PlanarFaceXZ[] {
    if (faces.length === 0) return [];
    const componentOf = planarComponentsXZ(graph);

    const bestByComponent = new Map<string, PlanarFaceXZ>();
    for (const f of faces) {
        const anchor = f.nodeIds[0];
        if (anchor === undefined) continue;
        const key = componentOf.get(anchor) ?? anchor;
        const cur = bestByComponent.get(key);
        if (!cur || beatsAsOuter(f, cur)) bestByComponent.set(key, f);
    }

    return [...bestByComponent.entries()]
        .sort((a, b) => byCodepoint(a[0], b[0]))
        .map(([, face]) => face);
}
