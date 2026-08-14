/**
 * §C79-5.2-SLAB-STATES — the slab re-derivation's REPORTING CHANNEL (C79 §5.2,
 * §5.2.0, §5.2.1, §5.2.2, §5.3 · GR-12 · check-move-propagation A3/A4).
 *
 * ─── WHAT WAS MEASURED, BEFORE THIS MODULE EXISTED ───────────────────────────
 * `npx tsx tools/rac-conformance/certification/gates/check-move-propagation.ts`,
 * 2026-08-14, exit 1 at the declared level of 3:
 *
 *   ❌ all families · C79 §5.2.1 — `preserved` and `undetermined` are
 *      distinguishable at the caller: "a zero-move re-derivation and a
 *      re-derivation whose host cannot be resolved both return the SAME
 *      24.000 m² ring, byte-identical: true."
 *   ❌ all families · C79 §5.2 — a re-derivation reports exactly one of the five
 *      states: "the whole move path returns no state: SlabStore.triggerRebuild →
 *      void, SlabDependencyTracker.onWallUpdated → void,
 *      SlabFragmentBuilder.resolveLoop → a bare ring | null,
 *      WallFaceResolver.resolveOrFallback → Segment2D | null."
 *
 * C79 §5.5 states the same thing as the contract's own UNPROVEN. This module is
 * the value the move path did not have.
 *
 * ─── WHY THE FIX IS A CHANNEL AND NOT A REMOVED FALLBACK ─────────────────────
 * The information was never missing — it was discarded one line above the
 * caller. `WallFaceResolver.resolve()` returns null and KNOWS the host is gone;
 * `resolveOrFallback()` absorbed that into the stale authoring-time fallback
 * with no reason attached. C79 §4.3 REQUIRES that fallback (it is what stops a
 * deleted wall degrading the slab to nothing), so the defect is the SILENCE
 * about which branch was taken, never the fallback itself. Accordingly:
 * `WallFaceResolver.resolveWithProvenance` names the branch,
 * `SlabFragmentBuilder.resolveLoopVerdict` carries it up per edge, and this
 * module turns the pair (previous ring, resolution) into ONE of C79 §5.2's five.
 * Nothing that is drawn today is drawn differently.
 *
 * ─── HOW MANY OF THE FIVE THIS PATH CAN ACTUALLY PRODUCE ─────────────────────
 * FOUR, on the wall-MOVE path, each driven by an executed test:
 *   preserved · resized · conflicted · undetermined
 *
 * `regenerated` is DECLARED, classified, and unit-driven — but it is NOT
 * producible by a wall move today, and saying otherwise would be the inherited
 * green C70 §7.1 forbids. The reason, stated so it is not re-discovered:
 * `SketchLoopIntersector.computePolygon` returns exactly one vertex per segment
 * (parallel corners fall back to a raw endpoint rather than collapsing), and a
 * wall move changes neither the sketch's edge count nor its host set — so the
 * re-derived ring is topologically identical to the sketch, always. The state
 * becomes REACHABLE when a sketch EDIT re-derives: `DegradeSlabSketchCommand`
 * (hostReference → freeLine on a wall delete) changes the host set, which C79
 * §5.2 names as `regenerated` in those words. That path does not call this
 * classifier yet; it is the next PR, and it is named here rather than counted.
 *
 * ─── VOCABULARY: NARROWED, NEVER MINTED ──────────────────────────────────────
 * The five states are C79 §5.2's, verbatim. The `undetermined` reasons are
 * members of C78 §8.1's CLOSED eleven-member union
 * (`packages/command-bus/src/consequence.ts`), narrowed to the three this path
 * can produce — the same shape as `boundingWallDetermination.ts:46`,
 * `wallRoomAdjacencyDetermination.ts:60` and `GraphQueryService.ts:156`, and
 * proven a genuine subset by `c79RecomputeStates.test.ts`, which reads the union
 * out of command-bus's source. Per-family specificity travels in `subReason`
 * (C78 §8.3), never as a twelfth member.
 *
 * The state union is member-identical to `@pryzm/finish-host-tracker`'s
 * `ReprojectState` BY TEST, not by import: the two packages are siblings (both
 * depend on geometry-kernel + core-app-model and neither depends on the other),
 * so a shared declaration would mean a new sibling edge. `c79RecomputeStates.test.ts`
 * reads the finish path's source and fails if the two unions ever drift apart,
 * which is the property that actually matters.
 *
 * Pure: no DOM, no store, no THREE, no side effects.
 */

import { RECOMPUTE_IDENTITY_M, findSelfIntersection } from '@pryzm/geometry-kernel';

// ── The five states (C79 §5.2) ───────────────────────────────────────────────

export type SlabRecomputeState =
    | 'preserved'
    | 'resized'
    | 'regenerated'
    | 'conflicted'
    | 'undetermined';

/**
 * §5.3's ordering — `preserved < resized < regenerated < conflicted <
 * undetermined`. An element's state is the WORST of its edges.
 */
export const SLAB_RECOMPUTE_STATE_ORDER: readonly SlabRecomputeState[] = [
    'preserved', 'resized', 'regenerated', 'conflicted', 'undetermined',
];

/** C79 §5.3 — the worst of a set of per-edge states. `preserved` for an empty set. */
export function worstSlabRecomputeState(
    states: readonly SlabRecomputeState[],
): SlabRecomputeState {
    let worst: SlabRecomputeState = 'preserved';
    for (const s of states) {
        if (SLAB_RECOMPUTE_STATE_ORDER.indexOf(s) > SLAB_RECOMPUTE_STATE_ORDER.indexOf(worst)) worst = s;
    }
    return worst;
}

/**
 * The C78 §8.1 members this path can produce. CLOSED here; add members THERE.
 *
 * `STALE_DERIVED_STATE`       — the host wall did not resolve, so the segment in
 *                               hand is the authoring-time fallback and NOT a
 *                               re-derivation. We did not re-derive (§5.2.1).
 * `RELATIONSHIP_NOT_RECORDED` — no reference or no ring to re-derive from: a
 *                               host edge with no fallback (§4.3 violated at
 *                               authoring), a loop of fewer than three edges, or
 *                               no previously derived ring to compare against.
 * `ENGINE_NOT_AVAILABLE`      — the wall store this resolution reads is not
 *                               reachable in this runtime. "I could not look" is
 *                               a different fact from "I looked and it is gone",
 *                               and the two must never print the same value.
 */
export type SlabRecomputeUndeterminedReason =
    | 'STALE_DERIVED_STATE'
    | 'RELATIONSHIP_NOT_RECORDED'
    | 'ENGINE_NOT_AVAILABLE';

// ── Per-edge resolution provenance (the channel WallFaceResolver now fills) ──

/**
 * WHICH BRANCH the resolver took for one host edge.
 *   `live`         — the wall was found and the segment IS a re-derivation.
 *   `fallback`     — the wall did not resolve; the segment is the stale
 *                    authoring-time fallback kept per §4.3. NOT a re-derivation.
 *   `unresolvable` — neither; there is nothing to draw this edge from.
 *   `freeLine`     — not a host edge at all; its geometry is its own.
 */
export type SlabEdgeResolutionSource = 'live' | 'fallback' | 'unresolvable' | 'freeLine';

export interface SlabLoopEdgeOutcome {
    /** Index in `loop.edges`. */
    index: number;
    source: SlabEdgeResolutionSource;
    /** Present for host edges only. */
    hostId?: string;
    /** The C79 §5.2 state THIS EDGE is in (§5.3 folds them with `worstSlabRecomputeState`). */
    state: SlabRecomputeState;
    reason?: SlabRecomputeUndeterminedReason;
    subReason?: string;
}

/** What `SlabFragmentBuilder.resolveLoopVerdict` returns: the ring PLUS its provenance. */
export interface SlabLoopResolution {
    /** Exactly what `resolveLoop` returns — unchanged, so no draw path moves. */
    ring: { x: number; y: number }[] | null;
    edgeOutcomes: SlabLoopEdgeOutcome[];
    /**
     * True iff every host edge resolved LIVE — i.e. this ring IS a re-derivation
     * of the current walls. False means a fallback was used somewhere and the
     * ring is a memory, not a measurement.
     */
    fullyLive: boolean;
    /** Set iff the ring is not a re-derivation. Never inferred from `ring === null`. */
    undetermined?: { reason: SlabRecomputeUndeterminedReason; subReason: string };
}

// ── The verdict ──────────────────────────────────────────────────────────────

export interface SlabRecomputeVerdict {
    slabId: string;
    /** Exactly one of the five (C79 §5.2). */
    state: SlabRecomputeState;
    reason?: SlabRecomputeUndeterminedReason;
    /** C78 §8.3 per-family specificity — always present, never prose-only detail. */
    subReason: string;
    /** §5.3's inputs, kept so a caller can see WHICH edge decided the element. */
    edgeOutcomes: SlabLoopEdgeOutcome[];
    /** BOTH numbers, named, on every verdict that has them (C73 §4 / C79 §5.2.2). */
    numbers?: { oldAreaM2: number; newAreaM2: number };
    /** The re-derived ring, present iff the state is `resized` or `regenerated`. */
    ring?: { x: number; y: number }[];
}

// §C73-EPSILON-POLICY — `RECOMPUTE_IDENTITY_M` is the kernel's declared role for
// exactly this question ("did re-deriving change it AT ALL?"), not COINCIDENT_M's
// "are these the same model point?". A real sub-millimetre resize must never
// read `preserved`: `preserved` is a positive verdict, not a loose comparison.
const MIN_AREA_M2 = 1e-6;

/** Signed shoelace area in the slab's 2D frame (x = world.x, y = world.z). */
export function signedAreaXY(ring: ReadonlyArray<{ x: number; y: number }>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

/**
 * Are two rings the same closed boundary? Cyclic (the creation-time tracer and
 * the re-derived intersector walk the same boundary from different start
 * vertices) but deliberately NOT reflection-invariant — a winding flip is a real
 * change, and `conflicted` below depends on seeing it.
 *
 * Lifted unchanged from `SlabDependencyTracker.ringsEqualCyclic`, which now
 * imports it from here: the `preserved` verdict and the write-back suppression
 * MUST be the same predicate or the record and the report can disagree.
 */
export function ringsEqualCyclic(
    a: ReadonlyArray<{ x: number; y: number }>,
    b: ReadonlyArray<{ x: number; y: number }>,
    eps = RECOMPUTE_IDENTITY_M,
): boolean {
    if (a.length !== b.length) return false;
    const n = a.length;
    if (n === 0) return true;
    const first = a[0]!;
    for (let k = 0; k < n; k++) {
        const cand = b[k]!;
        if (Math.abs(first.x - cand.x) >= eps || Math.abs(first.y - cand.y) >= eps) continue;
        let all = true;
        for (let i = 1; i < n; i++) {
            const p = a[i]!;
            const q = b[(k + i) % n]!;
            if (Math.abs(p.x - q.x) >= eps || Math.abs(p.y - q.y) >= eps) { all = false; break; }
        }
        if (all) return true;
    }
    return false;
}

export interface ClassifySlabRecomputeInput {
    slabId: string;
    /** The ring the record held BEFORE this re-derivation (`SlabData.polygon`). */
    previousRing: ReadonlyArray<{ x: number; y: number }> | null | undefined;
    /** What `SlabFragmentBuilder.resolveLoopVerdict` produced for the outer loop. */
    resolution: SlabLoopResolution;
}

/**
 * Turn (previous ring, resolution) into EXACTLY ONE of C79 §5.2's five states.
 *
 * Order matters and is the contract's, not a convenience:
 *   1. `undetermined` FIRST and unconditionally — §5.2.1 forbids collapsing it
 *      into `preserved`, and a fallback-sourced ring that happens to equal the
 *      stored ring is precisely the collapse ("the same pixels, opposite facts").
 *      §5.3's worst-of-its-edges rule puts `undetermined` at the top of the
 *      ordering, so one unresolved edge decides the element.
 *   2. `preserved` — re-derived (every edge live) and nothing moved.
 *   3. `conflicted` — the re-derivation violates a rule the family enforces, and
 *      it REFUSES WITH BOTH NUMBERS (§5.2.2 / C73 §4): a degenerate ring, a
 *      winding inversion (the measured slab failure — an inverting move took the
 *      signed area 24.000 → -24.000 with no refusal), or a self-intersection.
 *   4. `regenerated` — topologically different (see the header: not producible
 *      by a move today).
 *   5. `resized` — the normal success case.
 */
export function classifySlabRecompute(input: ClassifySlabRecomputeInput): SlabRecomputeVerdict {
    const { slabId, previousRing, resolution } = input;
    const edgeOutcomes = resolution.edgeOutcomes;

    const undetermined = (
        reason: SlabRecomputeUndeterminedReason,
        subReason: string,
    ): SlabRecomputeVerdict => ({ slabId, state: 'undetermined', reason, subReason, edgeOutcomes });

    // ── 1 · undetermined ─────────────────────────────────────────────────────
    if (resolution.undetermined) {
        return undetermined(resolution.undetermined.reason, resolution.undetermined.subReason);
    }
    const ring = resolution.ring;
    if (!ring || ring.length < 3) {
        return undetermined(
            'RELATIONSHIP_NOT_RECORDED',
            `the outer loop resolved to ${ring ? `${ring.length} vertice(s)` : 'nothing'} — a boundary needs at least 3`,
        );
    }
    if (!previousRing || previousRing.length < 3) {
        // We DID re-derive, but there is no recorded ring to judge the outcome
        // against. That is a known-unknown, not a success (§5.2's own gloss on
        // `undetermined`: "could not be judged").
        return undetermined(
            'RELATIONSHIP_NOT_RECORDED',
            `re-derived ${Math.abs(signedAreaXY(ring)).toFixed(3)} m², but the record holds ` +
            `${previousRing ? `${previousRing.length} vertice(s)` : 'no ring'} to judge the outcome against`,
        );
    }

    const oldArea = signedAreaXY(previousRing);
    const newArea = signedAreaXY(ring);
    const numbers = { oldAreaM2: Math.abs(oldArea), newAreaM2: Math.abs(newArea) };
    const both = `${numbers.oldAreaM2.toFixed(3)} m² → ${numbers.newAreaM2.toFixed(3)} m²`;

    // ── 2 · preserved ────────────────────────────────────────────────────────
    if (ringsEqualCyclic(ring, previousRing)) {
        return {
            slabId, state: 'preserved', edgeOutcomes, numbers,
            subReason: `re-derived from live walls and the boundary is unchanged within ` +
                `${RECOMPUTE_IDENTITY_M} m (${both})`,
        };
    }

    // ── 3 · conflicted — refuse, naming BOTH numbers (§5.2.2) ────────────────
    if (Math.abs(newArea) < MIN_AREA_M2) {
        return {
            slabId, state: 'conflicted', edgeOutcomes, numbers,
            subReason: `the re-derived boundary is degenerate: ${numbers.oldAreaM2.toFixed(3)} m² → ` +
                `${numbers.newAreaM2.toFixed(6)} m². The slab has no area to occupy.`,
        };
    }
    if (Math.sign(newArea) !== Math.sign(oldArea)) {
        return {
            slabId, state: 'conflicted', edgeOutcomes, numbers,
            subReason: `the re-derived boundary INVERTED its winding (${both}, on the far side of ` +
                `the walls it was drawn between) — the region enclosed at authoring time no longer exists`,
        };
    }
    if (findSelfIntersection(ring.map((p) => [p.x, p.y] as [number, number])) !== null) {
        return {
            slabId, state: 'conflicted', edgeOutcomes, numbers,
            subReason: `the re-derived boundary crosses itself (${both})`,
        };
    }

    // ── 4 · regenerated — topology changed (see the header) ──────────────────
    if (ring.length !== previousRing.length) {
        return {
            slabId, state: 'regenerated', edgeOutcomes, numbers, ring: [...ring],
            subReason: `the re-derived boundary has ${ring.length} corner(s) where the record held ` +
                `${previousRing.length} — edges merged or split (${both}). The slab is not the shape it was last seen as.`,
        };
    }

    // ── 5 · resized ──────────────────────────────────────────────────────────
    return {
        slabId, state: 'resized', edgeOutcomes, numbers, ring: [...ring],
        subReason: `re-derived cleanly at its new extent, same topology (${both})`,
    };
}
