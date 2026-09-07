// §ENVELOPE-WALLS-FOLLOW — THE C80 DECISION, DRIVEN WITH NO STORE, NO GRAPH AND NO BUS.
// C80 §2.2/§3.1/§3.2/§3.3 · C114 §6a · C84 EI-9 · P6.
//
// Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEANS THE CONTEXT WALLS -
// PERIMETER WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO - AS PER BIM3.0 PRINCIPALS."*
//
// ✅ ESTABLISHES: a wall still sitting on its generated edge FOLLOWS, with its `y` and its own
//    direction preserved; a wall the user moved by hand STAYS and is NAMED (the C80 branch); an
//    unreadable link graph REFUSES and is never read as "no walls"; a link row whose wall is gone
//    is skipped, not crashed on; a top/bottom drag plans nothing because the ring did not change;
//    a changed vertex COUNT refuses rather than matching the wrong wall; and one committed drag
//    dispatches EXACTLY ONE `wall.cascadeBaseline` (C114 §6a) rather than one command per wall.
//
// ⛔ DOES NOT ESTABLISH: that any wall moves on screen, that `CascadeWallBaselineCommand` accepts
//    these payloads, or that the semantic graph really holds the rows in a live project. This file
//    drives the PLANNER and the WIRE with hand-written readers — the same split, and the same
//    limit, as `spaceEnvelopeDragSurfacePorts.spec.ts`. Nothing here is browser-verified.

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AUTHORED_TOLERANCE_M,
    planSpaceEnvelopeWallFollow,
    WALL_FOLLOW_CAUSE,
    type WallFollowBaseline,
    type WallFollowLinkRow,
    type WallFollowRingPoint,
    type WallFollowWallState,
} from '../spaceEnvelopeWallFollowPlan';
import {
    applySpaceEnvelopeWallFollow,
    registerSpaceEnvelopeWallFollow,
    WALL_CASCADE_BASELINE_COMMAND,
    type SpaceEnvelopeWallFollowDeps,
} from '../spaceEnvelopeWallFollow';
import {
    SPACE_ENVELOPE_FACE_MOVED_EVENT,
    type SpaceEnvelopeFaceMoveCommitted,
} from '../spaceEnvelopeDragSurface';

/** A 10 × 6 m rectangle. Edge 1 is the segment (10,0) → (10,6) — the plane x = 10. */
const RING_BEFORE: readonly WallFollowRingPoint[] = [
    { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 }, { x: 0, z: 6 },
];
/** The same rectangle after edge 1 was pulled +2 m along its outward normal (+x). */
const RING_AFTER: readonly WallFollowRingPoint[] = [
    { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 6 }, { x: 0, z: 6 },
];

/** Walls sit at the storey datum: `baseLine[*].y` is world Y (`WallTypes.ts:319-334`). */
const LEVEL_Y = 3.5;

const edgeBaseline = (
    ring: readonly WallFollowRingPoint[],
    i: number,
    y = LEVEL_Y,
): WallFollowBaseline => {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    return [{ x: a.x, y, z: a.z }, { x: b.x, y, z: b.z }] as const;
};

const link = (wallId: string, edgeIndex: number): WallFollowLinkRow => ({ wallId, edgeIndex });

/** A wall reader over a fixed map. Absent id ⇒ `null`, which is "the wall is gone". */
const readerOf = (
    walls: ReadonlyMap<string, WallFollowBaseline>,
): ((wallId: string) => WallFollowWallState | null) =>
    (wallId) => {
        const baseLine = walls.get(wallId);
        return baseLine ? { wallId, baseLine } : null;
    };

/** Every edge of RING_BEFORE, generated and untouched. Four walls, one per edge. */
function pristineWalls(): Map<string, WallFollowBaseline> {
    const m = new Map<string, WallFollowBaseline>();
    for (let i = 0; i < 4; i++) m.set(`W${i}`, edgeBaseline(RING_BEFORE, i));
    return m;
}

const ALL_LINKS: readonly WallFollowLinkRow[] = [
    link('W0', 0), link('W1', 1), link('W2', 2), link('W3', 3),
];

describe('⭐ the walls follow the face — and the ones the user touched do not', () => {
    it('a wall still on its generated edge FOLLOWS, and lands on the new edge', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E-ground',
            ringBefore: RING_BEFORE,
            ringAfter: RING_AFTER,
            links: [link('W1', 1)],
            wallState: readerOf(pristineWalls()),
        });

        expect(plan.ok).toBe(true);
        expect(plan.refusal).toBeNull();
        expect(plan.entries).toHaveLength(1);
        const e = plan.entries[0]!;
        expect(e.wallId).toBe('W1');
        // Edge 1 of RING_AFTER is (12,0) → (12,6).
        expect(e.newBaseLine[0].x).toBeCloseTo(12, 9);
        expect(e.newBaseLine[0].z).toBeCloseTo(0, 9);
        expect(e.newBaseLine[1].x).toBeCloseTo(12, 9);
        expect(e.newBaseLine[1].z).toBeCloseTo(6, 9);
        // `prevBaseLine` is the wall as the store holds it — what the cascade reverts to.
        expect(e.prevBaseLine[0].x).toBeCloseTo(10, 9);
    });

    it('⛔ the wall’s OWN y is carried through — writing the ring’s y would drop the storey to 0', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E-ground',
            ringBefore: RING_BEFORE,
            ringAfter: RING_AFTER,
            links: [link('W1', 1)],
            wallState: readerOf(pristineWalls()),
        });
        const e = plan.entries[0]!;
        expect(e.newBaseLine[0].y).toBe(LEVEL_Y);
        expect(e.newBaseLine[1].y).toBe(LEVEL_Y);
    });

    it('⭐ a REVERSED wall follows too, and keeps its own direction', () => {
        // Nothing requires a generated wall to run the same way round as the ring edge, and
        // treating a reversed wall as "not its edge" would strand a correct perimeter forever.
        const walls = pristineWalls();
        const fwd = edgeBaseline(RING_BEFORE, 1);
        walls.set('W1', [fwd[1], fwd[0]] as const);

        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E-ground',
            ringBefore: RING_BEFORE,
            ringAfter: RING_AFTER,
            links: [link('W1', 1)],
            wallState: readerOf(walls),
        });

        expect(plan.entries).toHaveLength(1);
        const e = plan.entries[0]!;
        // It started at (10,6) and must now start at (12,6) — not at (12,0).
        expect(e.newBaseLine[0].z).toBeCloseTo(6, 9);
        expect(e.newBaseLine[1].z).toBeCloseTo(0, 9);
    });

    it('⛔⭐ THE C80 BRANCH — a wall the user moved by hand STAYS, and is NAMED with both numbers', () => {
        const walls = pristineWalls();
        // The user pulled this partition 0.4 m off the envelope edge. C80 §3.1: that is authored
        // work, and a regeneration may not destroy it.
        const drifted = edgeBaseline(RING_BEFORE, 1);
        walls.set('W1', [
            { ...drifted[0], x: drifted[0].x + 0.4 },
            { ...drifted[1], x: drifted[1].x + 0.4 },
        ] as const);

        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E-ground',
            ringBefore: RING_BEFORE,
            ringAfter: RING_AFTER,
            links: ALL_LINKS,
            wallState: readerOf(walls),
        });

        expect(plan.entries.map((e) => e.wallId)).not.toContain('W1');
        const stay = plan.stayed.find((s) => s.wallId === 'W1');
        expect(stay?.reason).toBe('authored-since-generation');
        // C80 §1.4 / §3.2 — the drift AND the threshold, and what is being protected.
        expect(stay?.detail).toContain('0.40 m');
        expect(stay?.detail).toContain('0.05 m');
        // C80 §3.4 — over-protection is also a failure: protecting W1 must not stop the rest.
        // ⚠ W3 is absent for a DIFFERENT reason and the two must not be conflated — edge 3 is
        // (0,6) → (0,0) in both rings, so it is `edge-did-not-move`, not a C80 protection.
        expect(plan.entries.map((e) => e.wallId).sort()).toEqual(['W0', 'W2']);
        expect(plan.stayed.find((s) => s.wallId === 'W3')?.reason).toBe('edge-did-not-move');
        // C80 §3.3 — the pass reports what it declined to touch, in words the user reads.
        expect(plan.summary).toContain('by hand');
    });

    it('the tolerance is injectable — a drift inside it is still the generated wall', () => {
        const walls = pristineWalls();
        const drifted = edgeBaseline(RING_BEFORE, 1);
        walls.set('W1', [
            { ...drifted[0], x: drifted[0].x + 0.03 },
            { ...drifted[1], x: drifted[1].x + 0.03 },
        ] as const);

        const strict = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_AFTER,
            links: [link('W1', 1)], wallState: readerOf(walls), toleranceM: 0.01,
        });
        expect(strict.stayed[0]?.reason).toBe('authored-since-generation');

        const relaxed = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_AFTER,
            links: [link('W1', 1)], wallState: readerOf(walls),
        });
        expect(DEFAULT_AUTHORED_TOLERANCE_M).toBe(0.05);
        expect(relaxed.entries).toHaveLength(1);
    });

    it('⭐ a wall on an edge that did NOT move stays, and says so — it is not a C80 refusal', () => {
        // Edge 3 is (0,6) → (0,0) in both rings. Distinguishing this from "you authored it"
        // matters: one is a protection, the other is simply nothing to do.
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_AFTER,
            links: ALL_LINKS, wallState: readerOf(pristineWalls()),
        });
        expect(plan.stayed.find((s) => s.wallId === 'W3')?.reason).toBe('edge-did-not-move');
    });
});

describe('⛔ the honest-absence rules — a missing answer is never an empty one', () => {
    it('⛔ an UNREADABLE link graph REFUSES — it is not "this envelope has no walls"', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_AFTER,
            links: null, wallState: readerOf(pristineWalls()),
        });
        expect(plan.ok).toBe(false);
        expect(plan.refusal?.code).toBe('link-graph-unreadable');
        expect(plan.entries).toHaveLength(0);
    });

    it('an EMPTY link set is not a refusal — the envelope simply produced no walls', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_AFTER,
            links: [], wallState: readerOf(pristineWalls()),
        });
        expect(plan.refusal).toBeNull();
        expect(plan.entries).toHaveLength(0);
        expect(plan.summary).toContain('No walls are linked');
    });

    it('a row whose wall is GONE is skipped by name — an undone batch leaves rows behind', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_AFTER,
            links: [link('W1', 1), link('W-deleted', 0)],
            wallState: readerOf(pristineWalls()),
        });
        expect(plan.entries.map((e) => e.wallId)).toEqual(['W1']);
        expect(plan.stayed.find((s) => s.wallId === 'W-deleted')?.reason).toBe('wall-no-longer-exists');
    });

    it('`edgeIndex: -1` is unrecoverable provenance, and is NOT index 0', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_AFTER,
            links: [link('W?', -1)], wallState: readerOf(pristineWalls()),
        });
        expect(plan.entries).toHaveLength(0);
        expect(plan.stayed[0]?.reason).toBe('edge-index-unrecoverable');
    });

    it('⛔ a changed vertex COUNT refuses — an edge index would name a different edge', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E',
            ringBefore: RING_BEFORE,
            ringAfter: [...RING_AFTER, { x: 6, z: 9 }],
            links: ALL_LINKS, wallState: readerOf(pristineWalls()),
        });
        expect(plan.refusal?.code).toBe('ring-arity-changed');
        expect(plan.entries).toHaveLength(0);
    });

    it('⭐ a TOP/BOTTOM drag plans nothing, and the message says why rather than staying silent', () => {
        // `SpaceEnvelopeFaceMove.ts:78` — for top/bottom moves the ring is unchanged.
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E', ringBefore: RING_BEFORE, ringAfter: RING_BEFORE,
            links: ALL_LINKS, wallState: readerOf(pristineWalls()),
        });
        expect(plan.refusal?.code).toBe('ring-unchanged');
        expect(plan.refusal?.message).toContain('height');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE WIRE
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface Recorded {
    readonly dispatched: { command: string; payload: unknown }[];
    readonly notices: { message: string; severity: string }[];
}

function depsOver(
    walls: ReadonlyMap<string, WallFollowBaseline>,
    links: readonly WallFollowLinkRow[] | null,
): { deps: SpaceEnvelopeWallFollowDeps; rec: Recorded } {
    const rec: Recorded = { dispatched: [], notices: [] };
    return {
        rec,
        deps: {
            readLinks: () => links,
            readWall: readerOf(walls),
            dispatch: (command, payload) => { rec.dispatched.push({ command, payload }); return undefined; },
            notify: (message, severity) => { rec.notices.push({ message, severity }); },
        },
    };
}

const COMMITTED: SpaceEnvelopeFaceMoveCommitted = {
    spaceEnvelopeId: 'E-ground',
    face: { kind: 'side', edgeIndex: 1 },
    deltaM: 2,
    ringBefore: RING_BEFORE,
    ringAfter: RING_AFTER,
    surfaceId: 'site-3d',
};

describe('⭐ one committed drag → EXACTLY ONE wall.cascadeBaseline (C114 §6a)', () => {
    it('forty walls would be one command, not forty — the entries travel together', () => {
        const { deps, rec } = depsOver(pristineWalls(), ALL_LINKS);
        applySpaceEnvelopeWallFollow(COMMITTED, deps);

        expect(rec.dispatched).toHaveLength(1);
        expect(rec.dispatched[0]!.command).toBe(WALL_CASCADE_BASELINE_COMMAND);
        expect(WALL_CASCADE_BASELINE_COMMAND).toBe('wall.cascadeBaseline');
        const payload = rec.dispatched[0]!.payload as {
            entries: { wallId: string }[]; cause: string;
        };
        // W3's edge did not move, so three of the four travel.
        expect(payload.entries.map((e) => e.wallId).sort()).toEqual(['W0', 'W1', 'W2']);
        expect(payload.cause).toBe(WALL_FOLLOW_CAUSE);
    });

    it('⛔ NOTHING is dispatched when no wall may move — no empty cascade', () => {
        const { deps, rec } = depsOver(pristineWalls(), []);
        applySpaceEnvelopeWallFollow(COMMITTED, deps);
        expect(rec.dispatched).toHaveLength(0);
    });

    it('an unreadable graph dispatches nothing and TELLS the user', () => {
        const { deps, rec } = depsOver(pristineWalls(), null);
        applySpaceEnvelopeWallFollow(COMMITTED, deps);
        expect(rec.dispatched).toHaveLength(0);
        expect(rec.notices[0]?.severity).toBe('warning');
        expect(rec.notices[0]?.message).toContain('could not read');
    });

    it('⛔ a top/bottom drag is NOT toasted — it is the ordinary outcome, not a fault', () => {
        const { deps, rec } = depsOver(pristineWalls(), ALL_LINKS);
        applySpaceEnvelopeWallFollow({ ...COMMITTED, ringAfter: RING_BEFORE }, deps);
        expect(rec.dispatched).toHaveLength(0);
        expect(rec.notices).toHaveLength(0);
    });

    it('⭐ the C80 outcome reaches the USER, not just the console', () => {
        const walls = pristineWalls();
        const d = edgeBaseline(RING_BEFORE, 1);
        walls.set('W1', [{ ...d[0], x: d[0].x + 1 }, { ...d[1], x: d[1].x + 1 }] as const);
        // Only W1 is linked, so nothing moves at all — the user dragged a face and the building
        // did not follow, and is owed the reason.
        const { deps, rec } = depsOver(walls, [link('W1', 1)]);
        applySpaceEnvelopeWallFollow(COMMITTED, deps);
        expect(rec.dispatched).toHaveLength(0);
        expect(rec.notices[0]?.message).toContain('by hand');
    });

    it('a reader that THROWS is treated as unreadable, never as empty, and never propagates', () => {
        const { rec } = depsOver(pristineWalls(), ALL_LINKS);
        const deps: SpaceEnvelopeWallFollowDeps = {
            readLinks: () => { throw new Error('graph exploded'); },
            readWall: readerOf(pristineWalls()),
            dispatch: (command, payload) => { rec.dispatched.push({ command, payload }); return undefined; },
            notify: (message, severity) => { rec.notices.push({ message, severity }); },
        };
        expect(() => applySpaceEnvelopeWallFollow(COMMITTED, deps)).not.toThrow();
        expect(rec.dispatched).toHaveLength(0);
        expect(rec.notices[0]?.message).toContain('could not read');
    });

    it('registers on the ONE event name the gesture raises', () => {
        const handlers = new Map<string, (ev: SpaceEnvelopeFaceMoveCommitted) => void>();
        const { deps, rec } = depsOver(pristineWalls(), ALL_LINKS);
        registerSpaceEnvelopeWallFollow(
            { on: (name, fn) => { handlers.set(name, fn); return undefined; } },
            deps,
        );
        expect(handlers.has(SPACE_ENVELOPE_FACE_MOVED_EVENT)).toBe(true);
        handlers.get(SPACE_ENVELOPE_FACE_MOVED_EVENT)!(COMMITTED);
        expect(rec.dispatched).toHaveLength(1);
    });
});
