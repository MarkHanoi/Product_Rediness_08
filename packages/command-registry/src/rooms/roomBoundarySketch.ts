/**
 * roomBoundarySketch.ts — §REGION-HOST-ATTRIBUTION for room-hosted FINISH elements.
 *
 * C79 §6.3 rows 6/7/8 (`CreateFloorCommand`, `CreateCeilingCommand`, and their
 * by-room batch siblings). THE defect this closes, stated exactly:
 *
 *   `FloorData.boundingWallIds` / `CeilingData.boundingWallIds` were written
 *   `[]` UNCONDITIONALLY on every creation path — C79 §7.1's named anti-pattern,
 *   which is none of the three legal branches (§7.2 POPULATE / REMOVE / DECLARE).
 *   The field's NAME is a claim ("this floor is bounded by these walls"); written
 *   empty it lies to a reader, to a grep-auditor, and to every future consumer.
 *   Meanwhile `FloorData.sketch?: FloorSketch` and `CeilingData.sketch?:
 *   CeilingSketch` — reference-CAPABLE boundary storage carrying all five §1.1
 *   facts (`{type, hostId, hostType, reference, offset, fallback}`) — existed in
 *   the type and were NEVER WRITTEN by any creation path. The storage gap that
 *   blocks roof (C79 §6.3, `RoofData.footprint` is a bare polygon) does NOT
 *   exist here. Nothing was missing but the writing down.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * §10.3 — THE DESIGN DECISION: DERIVE FROM THE ROOM. Recorded here, not only
 * in the commit message, because a future implementer will meet this question
 * again at the ceiling/floor plan-tool rows (C79 §6.3 rows 9–10) and must not
 * silently re-decide it.
 *
 * C79 §10.3 asks whether these families should get a REGION MODE of their own
 * (their own hit-point trace over the wall store, à la `SlabRegionTracer`), or
 * DERIVE FROM THE ROOM and inherit the relationship transitively. The two are
 * not equivalent under §5: a transitive derivation is `undetermined` whenever
 * the room's own detection is.
 *
 * DERIVE FROM THE ROOM, for three reasons, in order of weight:
 *
 *  1. **A SECOND TRACER IS THE DISEASE C79 §6.5 EXISTS TO FORBID.** Roof-by-region
 *     had its own `WallRegionDetector`, and that is precisely why `e6c8cb58`'s
 *     slab fix never reached it — one fix, one family. Minting a third tracer for
 *     finishes would repeat the mistake knowingly, in 2026, which §6.6 names as
 *     creating the §0 defect NEW in a family that never had it.
 *
 *  2. **A FINISH IS NOT INDEPENDENTLY BOUNDED — IT IS THE ROOM'S SURFACE.** These
 *     commands do not trace anything today: they COPY `room.boundary.polygon` and
 *     then inset it to the bounding walls' inner faces
 *     (`resolveRoomFinishBoundary`, L-240). The boundary relationship the user
 *     expressed is "the floor OF THIS ROOM" (`hostRoomId`), and the room already
 *     carries a populated, BY-CONSTRUCTION `boundingWallIds` — produced by the
 *     planar face walk (`PlanarTopologyEngine:152,174`), where each half-edge
 *     records the wall that produced it. Re-tracing from a hit point would
 *     re-derive, by an independent mechanism, a fact the model already holds, and
 *     the two could then DISAGREE — C79 §7.4's per-path divergence, which is worse
 *     than uniform absence because the field looks honoured to whoever checks
 *     first.
 *
 *  3. **THE TRANSITIVE `undetermined` IS THE HONEST ANSWER, NOT A COST.** §10.3
 *     notes the transitive design is `undetermined` whenever the room's detection
 *     is. That is correct and desirable: a finish whose room could not be detected
 *     genuinely HAS no known boundary relationship, and §2.3 is explicit that no
 *     host beats a wrong host. An independent tracer would manufacture an answer
 *     in exactly the case the room could not — which is the invention defect, not
 *     a capability.
 *
 * ⚠ THE PRICE OF THIS CHOICE, STATED RATHER THAN HIDDEN (C79 §5.3 / §7.3): the
 * derivation is only as trustworthy as `room.boundingWallIds`. That array IS
 * populated by construction — but as a **`Set`**: `PlanarTopologyEngine:174` does
 * `[...new Set(face.wallIds.filter(Boolean))]`, collapsing the ordered, index-
 * aligned per-half-edge correspondence (`face.wallIds[i]` ↔ `face.nodeIds[i]`)
 * that the walk HAD into an unordered membership set. So the room knows WHICH
 * walls bound it — by construction — but no longer WHICH EDGE came from WHICH
 * WALL. See `§EDGE-ATTRIBUTION-IS-CONSTRAINED-NOT-SEARCHED` below for why that
 * makes this module's per-edge step a CONSTRAINED match rather than a §2.2
 * proximity search, and `C79-NOTE` at the bottom for the named gap this leaves.
 * ────────────────────────────────────────────────────────────────────────── */

import { trace, type Tracer } from '@opentelemetry/api';
import type { RoomFinishWall } from '@pryzm/room-topology';

// P8 / C10 §2 — every exported function carries ≥ 1 OTel span. Same tracer-name
// idiom as `SeatingDatumResolver.ts` / `StairSlabOpeningReconciler.ts` in this package.
function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/** Planar point in the world X-Z frame every room / finish boundary is authored in. */
export interface XZ { x: number; z: number }

/**
 * The five §1.1 facts, in the shape `FloorHostReferenceEdge` / `CeilingHostReferenceEdge`
 * already declare (`FloorTypes.ts:205-212`, `CeilingTypes.ts:108-115`). Deliberately
 * structurally identical to both so a single builder can serve both families and the
 * two can never drift (C79 §3.4: one relationship, ONE edge shape).
 */
export interface FinishHostReferenceEdge {
    type: 'hostReference';
    hostId: string;
    hostType: 'wall';
    /** §3.1 — the frame the ring was actually TRACED on, at offset 0. Never a face. */
    reference: 'centerLine';
    offset: number;
    /** §4.3 — populated AT AUTHORING TIME from the traced geometry itself. */
    fallback: { start: XZ; end: XZ };
}

export interface FinishFreeLineEdge {
    type: 'freeLine';
    start: XZ;
    end: XZ;
}

export type FinishSketchEdge = FinishHostReferenceEdge | FinishFreeLineEdge;

/**
 * §2.4 — the closed vocabulary of AUTHORING-TIME attribution failures. The three
 * `SlabRegionTracer` names are the contract minimum and are reproduced VERBATIM
 * (§3.4: copy the shape, do not invent one).
 *
 * ⚠ §5.2.0 — this is an AUTHORING-time vocabulary, one layer BELOW the consequence
 * path. It explains why a reference was never minted. It MUST NOT be surfaced in
 * place of a C78 §8.1 member when a re-derivation later reports `undetermined`.
 */
export type AttributionFailureReason =
    | 'curved'
    | 'noWallId'
    | 'ambiguous'
    /**
     * §10.3-TRANSITIVE — this family's ONE added reason, permitted by §2.4 ("a family
     * MAY add reasons") and named rather than folded into an existing one because it
     * is a genuinely different fact: the room itself declared no bounding walls, so
     * there was nothing to attribute AGAINST. Collapsing it into `noWallId` (which
     * means "the producing wall carried no id") would hide the transitive-derivation
     * cost §10.3 warns about behind a wall-level excuse.
     */
    | 'roomUndetected';

/**
 * §2.5 — the five counts, RETURNED, never absorbed. Same field names and the same
 * per-reason split as `RegionSketchAttribution` (`SlabRegionTracer.ts:615-627`) so
 * a reader who knows the slab report can read this one without relearning it.
 *
 * §2.6 — zero-host and all-host MUST NOT be the same value at the caller. They are
 * not: `hostEdges` and `hostWallIds` differ, and every fallback carries its reason.
 */
export interface FinishBoundaryAttribution {
    /** Edges attributed to a wall BY CONSTRUCTION. */
    hostEdges: number;
    /** Edges that could not be attributed — the honest refusals. */
    freeEdges: number;
    curvedFallbacks: number;
    missingIdFallbacks: number;
    ambiguousFallbacks: number;
    /** §10.3-TRANSITIVE — the room declared no bounding walls at all. */
    roomUndetectedFallbacks: number;
    /** Distinct walls that produced at least one edge. Feeds `boundingWallIds`. */
    hostWallIds: string[];
}

export interface FinishBoundarySketch {
    outerLoop: { edges: FinishSketchEdge[] };
    attribution: FinishBoundaryAttribution;
    /**
     * §7.2(a) POPULATE — the value `boundingWallIds` must now carry. It is
     * `attribution.hostWallIds`, i.e. exactly the walls that PRODUCED an edge of
     * this element's boundary — never the room's whole declared set, because a
     * wall the room lists but which produced no edge of THIS finish's ring is not
     * a wall this finish is bounded by, and writing it would be a §2.3 wrong host
     * dressed as thoroughness.
     */
    boundingWallIds: string[];
}

/** A wall as this module needs to see it: `RoomFinishWall` plus its id. */
export interface IdentifiedFinishWall extends RoomFinishWall {
    id: string;
}

/** The store surface the builder needs. Injected, so this module stays pure. */
export interface RoomBoundarySketchLookup {
    /** Host-room lookup — `boundingWallIds` is the by-construction wall set. */
    readonly getRoomById?: (id: string) => { boundingWallIds?: string[] } | undefined | null;
    /** Wall lookup by id. MUST return the wall's own id so attribution can name it. */
    readonly getWallById?: (id: string) => IdentifiedFinishWall | undefined | null;
}

/** Perpendicular tolerance for the constrained edge↔wall match (m). Mirrors
 *  `_wallForFinishEdge`'s 200 mm — tolerant of join-trim / miter offsets at ends. */
const PERP_TOL_M = 0.20;
/** Direction agreement: > ~10° off is not the same wall line. Mirrors `dot < 0.985`. */
const DIR_TOL = 0.985;

/**
 * §REGION-HOST-ATTRIBUTION — build the reference-carrying sketch for a room-hosted
 * finish boundary.
 *
 * @param ring    The finish's FINAL stored boundary ring (world X-Z, already inset
 *                to the inner faces). Edge `i` is `ring[i] → ring[(i+1) % n]`, so the
 *                emitted `outerLoop.edges` are index-aligned with the stored polygon —
 *                which is what lets a later re-derivation know which edge to move.
 * @param hostRoomId  The room this finish is the surface of. Absent → nothing to
 *                derive from; every edge is free with reason `roomUndetected`.
 * @param lookup  Store access, injected.
 *
 * §EDGE-ATTRIBUTION-IS-CONSTRAINED-NOT-SEARCHED — WHY THIS IS §2.1 AND NOT §2.2.
 *
 * §2.2 forbids re-deriving attribution "by proximity, nearest-neighbour search,
 * coordinate matching, or any other after-the-fact geometric query", because
 * proximity is precisely where a WRONG `hostId` comes from (§2.3). The distinction
 * that matters is not whether geometry is consulted — `SlabRegionTracer` consults
 * geometry too — but whether the CANDIDATE SET is closed by construction or open.
 *
 * Here it is CLOSED BY CONSTRUCTION: candidates are exactly `room.boundingWallIds`,
 * which the planar face walk produced from the half-edges that BUILT this room's
 * ring (`PlanarTopologyEngine:152,174`). A wall outside that set cannot be selected
 * no matter how near it lies — so the nearest-wall failure mode §2.3 describes
 * (following a neighbour's partition, an unrelated wall that happens to be closer)
 * is structurally unreachable, not merely improbable. What remains is recovering the
 * ORDER the `new Set(...)` discarded, within a set every member of which is already
 * known to bound this room.
 *
 * And where that recovery is not unambiguous, it REFUSES (`ambiguous` → `hostId`
 * null) rather than keeping the first or nearest writer — the §2.3 rule applied at
 * the only point where this design could still invent an answer. Two walls that both
 * satisfy the constraint on one edge is exactly the welded-wall case
 * `SlabRegionTracer.ts:388-399` drops to null, and it is dropped here for the same
 * reason and with the same reason-name.
 *
 * This is weaker than the slab's attribution and the difference is REAL, not
 * cosmetic — see `C79-NOTE` at the bottom of this file. It is recorded as a named
 * gap rather than papered over.
 */
export function buildRoomFinishBoundarySketch(
    ring: ReadonlyArray<XZ>,
    hostRoomId: string | undefined,
    lookup: RoomBoundarySketchLookup,
): FinishBoundarySketch {
    return _tracer().startActiveSpan('pryzm.room.buildFinishBoundarySketch', (span) => {
        try {
            const sketch = _buildRoomFinishBoundarySketch(ring, hostRoomId, lookup);
            span.setAttribute('pryzm.room.hostRoomId', hostRoomId ?? '');
            span.setAttribute('pryzm.attribution.hostEdges', sketch.attribution.hostEdges);
            span.setAttribute('pryzm.attribution.freeEdges', sketch.attribution.freeEdges);
            span.setAttribute('pryzm.attribution.hostWalls', sketch.attribution.hostWallIds.length);
            return sketch;
        } finally {
            span.end();
        }
    });
}

function _buildRoomFinishBoundarySketch(
    ring: ReadonlyArray<XZ>,
    hostRoomId: string | undefined,
    lookup: RoomBoundarySketchLookup,
): FinishBoundarySketch {
    const edges: FinishSketchEdge[] = [];
    const attribution: FinishBoundaryAttribution = {
        hostEdges: 0,
        freeEdges: 0,
        curvedFallbacks: 0,
        missingIdFallbacks: 0,
        ambiguousFallbacks: 0,
        roomUndetectedFallbacks: 0,
        hostWallIds: [],
    };

    if (!ring || ring.length < 3) {
        return { outerLoop: { edges }, attribution, boundingWallIds: [] };
    }

    // ── The candidate set, closed by construction (see §EDGE-ATTRIBUTION above) ──
    const candidates: IdentifiedFinishWall[] = [];
    let roomDeclaredWalls = false;
    if (hostRoomId) {
        const ids = lookup.getRoomById?.(hostRoomId)?.boundingWallIds ?? [];
        roomDeclaredWalls = ids.length > 0;
        for (const id of ids) {
            const w = lookup.getWallById?.(id);
            if (!w) continue;
            // §2.4 `noWallId` — a wall the room names but which carries no id of its
            // own cannot be referenced. There is nothing to point at. Excluded from
            // the candidate set here; edges it would have produced fall back below.
            if (typeof w.id !== 'string' || w.id.length === 0) continue;
            candidates.push(w);
        }
    }

    const hostWallIds = new Set<string>();
    const n = ring.length;

    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const fallback = { start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } };

        // §10.3-TRANSITIVE — the room declared nothing to attribute against. The
        // transitive design is `undetermined` exactly when the room's detection is,
        // and that is the honest answer (§2.3), not a reason to guess.
        if (!roomDeclaredWalls || candidates.length === 0) {
            edges.push({ type: 'freeLine', start: fallback.start, end: fallback.end });
            attribution.freeEdges++;
            if (!roomDeclaredWalls) attribution.roomUndetectedFallbacks++;
            else attribution.missingIdFallbacks++;
            continue;
        }

        const match = _attributeEdge(a, b, candidates);

        if (match.kind === 'host') {
            // §3.1 — `centerLine` at offset 0, the frame the room ring was traced on.
            // §3.2 forbids naming a face: it would move the geometry by half the wall
            // thickness, and the interior/exterior SIDE cannot be determined from a
            // ring walk that does not preserve the wall's authored start→end sense.
            //
            // NOTE ON THE INSET, stated because it is the one thing a reader will
            // challenge: the STORED ring is inset to the inner face, so this edge's
            // `fallback` geometry is NOT on the centreline. That is correct and
            // deliberate. `reference: 'centerLine', offset: 0` names WHERE THE
            // REFERENCE RESOLVES — the wall's centreline, the frame the room ring was
            // traced on — while `fallback` records THIS ELEMENT'S OWN geometry at
            // authoring time, which is what §4.3 requires it to degrade to. Encoding
            // the inset as `offset: thickness/2` was rejected: the sign of that offset
            // is the interior/exterior sense §3.2 says cannot be determined from the
            // ring walk, so it would be a coin flip written as a number.
            edges.push({
                type: 'hostReference',
                hostId: match.wallId,
                hostType: 'wall',
                reference: 'centerLine',
                offset: 0,
                fallback,
            });
            attribution.hostEdges++;
            hostWallIds.add(match.wallId);
            continue;
        }

        edges.push({ type: 'freeLine', start: fallback.start, end: fallback.end });
        attribution.freeEdges++;
        if (match.reason === 'curved') attribution.curvedFallbacks++;
        else if (match.reason === 'ambiguous') attribution.ambiguousFallbacks++;
        else attribution.missingIdFallbacks++;
    }

    attribution.hostWallIds = [...hostWallIds];
    return {
        outerLoop: { edges },
        attribution,
        boundingWallIds: attribution.hostWallIds,
    };
}

type EdgeAttribution =
    | { kind: 'host'; wallId: string }
    | { kind: 'free'; reason: AttributionFailureReason };

/**
 * Attribute ONE ring edge to at most one wall of the closed candidate set.
 *
 * Returns `ambiguous` when two DIFFERENT candidate walls both satisfy the
 * constraint on this edge — §2.3's wrong-host scenario, dropped to null rather
 * than resolved by first-writer or by nearest (`SlabRegionTracer.ts:388-399`).
 *
 * Returns `curved` when the sole satisfying wall is curved: §2.5 makes curved
 * fallback PERMANENT, because `WallFaceRef` cannot express "the 7th chord of this
 * arc" and attributing it would re-project every chord of the arc onto one straight
 * chord, destroying the curve (§2.4, §10.5).
 */
function _attributeEdge(
    a: XZ,
    b: XZ,
    candidates: ReadonlyArray<IdentifiedFinishWall>,
): EdgeAttribution {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const ex = b.x - a.x, ez = b.z - a.z;
    const elen = Math.hypot(ex, ez);
    // A degenerate edge has no direction to match against — nothing to attribute.
    if (elen < 1e-6) return { kind: 'free', reason: 'noWallId' };
    const eux = ex / elen, euz = ez / elen;

    const satisfying = new Map<string, { curved: boolean; perp: number }>();

    for (const w of candidates) {
        const w0 = w.baseLine?.[0], w1 = w.baseLine?.[1];
        if (!w0 || !w1) continue;
        const curved = !!w.curve
            && Number.isFinite(w.curve.control?.x)
            && Number.isFinite(w.curve.control?.z);

        // Match against the wall's CHORD. For a straight wall the chord IS the
        // centreline. For a curved wall the chord is only an approximation — which
        // is precisely why a curved match refuses below rather than attributing.
        const wdx = w1.x - w0.x, wdz = w1.z - w0.z;
        const wlen = Math.hypot(wdx, wdz);
        if (wlen < 1e-6) continue;
        const wux = wdx / wlen, wuz = wdz / wlen;

        let perp: number;
        if (curved) {
            // A curved wall's arc edges are not parallel to its chord, so the
            // straight test would reject them. Accept on midpoint PROXIMITY to the
            // chord's span only — enough to know the edge came from this arc, never
            // enough to attribute it (it refuses immediately below).
            const vx = mx - w0.x, vz = mz - w0.z;
            const t = (vx * wux + vz * wuz) / wlen;
            if (t < -0.05 || t > 1.05) continue;
            perp = Math.hypot(mx - (w0.x + t * wdx), mz - (w0.z + t * wdz));
            // Curved walls bulge away from the chord by the sagitta, which can far
            // exceed PERP_TOL_M; bound by the chord length so an unrelated far wall
            // is still excluded.
            if (perp > wlen) continue;
        } else {
            if (Math.abs(eux * wux + euz * wuz) < DIR_TOL) continue;
            const vx = mx - w0.x, vz = mz - w0.z;
            const t = (vx * wux + vz * wuz) / wlen;
            if (t < -0.02 || t > 1.02) continue;
            perp = Math.hypot(mx - (w0.x + t * wdx), mz - (w0.z + t * wdz));
            // The stored ring is INSET from the centreline by the wall's
            // half-thickness, so the honest perpendicular distance here is
            // `thickness/2`, not ~0. Allow that plus the join-trim tolerance.
            if (perp > PERP_TOL_M + Math.max(0, w.thickness) / 2) continue;
        }

        const prior = satisfying.get(w.id);
        if (!prior || perp < prior.perp) satisfying.set(w.id, { curved, perp });
    }

    if (satisfying.size === 0) return { kind: 'free', reason: 'noWallId' };

    // §CURVED-RIVAL-IS-NOT-AMBIGUITY — MEASURED, then fixed. The curved test above
    // accepts on midpoint proximity to the CHORD bounded by the chord length, which
    // is deliberately generous (an arc bulges away from its chord by the sagitta).
    // On the 3-straight + 1-arc reference fixture that generosity made the arc a
    // rival on ALL FOUR edges, reading `curved=1, ambiguous=3` and attributing
    // NOTHING — the three straight walls lost references they had legitimately
    // earned by direction. That is over-refusal, and §2.3's "no host beats a wrong
    // host" is not a licence for it: refusing an edge whose producer IS determinable
    // discards authored information just as surely as §0's defect did, only with a
    // reason attached.
    //
    // A straight match is DIRECTIONAL (|dot| ≥ 0.985 — the edge lies along the
    // wall's own line); a curved match is merely POSITIONAL. They are not the same
    // strength of evidence, so they do not vote equally. Where at least one straight
    // candidate satisfies this edge, curved candidates are dropped from the tally
    // before ambiguity is judged. This can never manufacture a host: the surviving
    // straight candidates are still checked for ambiguity among THEMSELVES below, so
    // two welded straight walls still refuse.
    let contenders = [...satisfying.entries()];
    const straights = contenders.filter(([, v]) => !v.curved);
    if (straights.length > 0) contenders = straights;

    // §2.3 — two DIFFERENT walls both satisfying this edge with the SAME strength of
    // evidence is the wrong-host scenario. Drop to null with a NAMED reason; never
    // keep first-writer, never keep nearest. A wrong host is strictly worse than no
    // host.
    if (contenders.length > 1) return { kind: 'free', reason: 'ambiguous' };

    const [wallId, info] = contenders[0]!;
    // §2.5 — curved boundaries ALWAYS fall back. Structural, permanent (§10.5).
    if (info.curved) return { kind: 'free', reason: 'curved' };
    return { kind: 'host', wallId };
}

/**
 * §2.6 — the creation-time report. ONE form for BOTH families (floor + ceiling) and
 * BOTH entry points (single + batch), so the paths cannot drift apart (§7.4).
 * Modelled on the slab plan handler's reference log line
 * (`SlabPlanToolHandler.ts:394-404`), which states plainly that free edges do NOT
 * follow a wall. Zero-host and all-host are different READINGS here, per C74's rule
 * applied to attribution.
 */
export function formatFinishBoundaryAttributionReport(
    kind: 'floor' | 'ceiling',
    a: FinishBoundaryAttribution,
): string {
    return (
        `§REGION-HOST-ATTRIBUTION ${kind} boundary: `
        + `${a.hostEdges} wall-attributed edge(s) across ${a.hostWallIds.length} wall(s), `
        + `${a.freeEdges} unattributed edge(s) `
        + `(curved=${a.curvedFallbacks}, no-wall-id=${a.missingIdFallbacks}, `
        + `ambiguous=${a.ambiguousFallbacks}, room-undetected=${a.roomUndetectedFallbacks}). `
        + `Free edges do NOT follow a wall.`
    );
}

/**
 * C79-NOTE — THE NAMED GAP THIS MODULE LEAVES OPEN (C70 §7.1 / C79 §6.2).
 * Recorded so it is never read as an inherited green.
 *
 * OWNER: `@pryzm/room-topology` (`PlanarTopologyEngine:174`).
 *
 * WHAT IS CLOSED HERE: floors and ceiling finishes now carry HOST REFERENCES
 * instead of copied coordinates; `boundingWallIds` is POPULATED (§7.2(a)) with
 * exactly the walls that produced an edge; every reference ships a `fallback` at
 * authoring time (§4.3); the reference frame is `centerLine` at offset 0 (§3.1);
 * and all attribution counts are RETURNED, never absorbed (§2.5/§2.6).
 *
 * WHAT IS NOT: the per-edge step above recovers a correspondence that
 * `PlanarTopologyEngine:174` ALREADY HAD and threw away —
 * `[...new Set(face.wallIds.filter(Boolean))]` collapses the ordered, index-aligned
 * `face.wallIds[i] ↔ face.nodeIds[i]` half-edge record into an unordered set. That
 * is C79 §0's mechanism ("the information was never missing; it was discarded on
 * the way out") occurring one layer upstream of this file. Because of it, this
 * module's attribution is CONSTRAINED (candidate set closed by construction, and
 * refusing on ambiguity) rather than fully BY CONSTRUCTION in §2.1's strongest
 * sense, and it will report `ambiguous` on collinear welded partitions where the
 * face walk itself knew the answer.
 *
 * CLOSING CONDITION: `DetectedRoom` grows an ordered per-edge wall channel
 * (e.g. `boundaryWallIdByEdge: (string | null)[]`, index-aligned with
 * `polygonVertices`), `RoomData` persists it, and this module consumes it directly
 * — at which point `_attributeEdge` deletes and attribution becomes §2.1-exact for
 * every edge the walk attributed, including the welded case. That change is in
 * `@pryzm/room-topology`, which is NOT this lane's to edit.
 */
