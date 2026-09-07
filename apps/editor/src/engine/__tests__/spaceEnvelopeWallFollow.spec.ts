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
    mergeSpaceEnvelopeWallFollowPlans,
    planSpaceEnvelopeWallFollow,
    WALL_FOLLOW_CAUSE,
    type SpaceEnvelopeWallFollowPlan,
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ §ENVELOPE-PARTITIONS-FOLLOW (lane WALLS-FOLLOW-WIRE, 2026-09-07) — THE OTHER HALF OF THE ASK.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Founder: *"… PERIMETER WALLS SHALL FOLLOW **AND THEE INTERIOR PARTITIONS TOO**."*
//
// ⛔ THE PERIMETER AND THE PARTITIONS DO NOT HANG OFF THE SAME ENVELOPE, AND THAT IS THE WHOLE
// PROBLEM THIS SOLVES. `buildFromDesignPlan.ts:631` writes `envelopeRole: 'room'` on every
// partition's `derivedFrom`; a shell wall carries `'level'`. So the subject's two rings move the
// perimeter and can never move a partition. The rooms that moved in the SAME commit now travel on
// the event, each with its own two rings, and each is planned through the same planner.
//
// ✅ ESTABLISHES: a level drag that adapted a room moves that room's partitions AND the level's
//    perimeter in ONE `wall.cascadeBaseline` (C114 §6a); an `'also'` claim never moves a wall; a
//    wall two moved envelopes place differently is DROPPED and NAMED rather than silently
//    last-write-wins; a wall that moved under one envelope is not also reported as stayed under
//    another; the merge is IDENTITY on a single plan; and the whole merge for a realistic
//    13-envelope / 112-row drag costs single-digit milliseconds, ONCE, at pointer-up.
// ⛔ DOES NOT ESTABLISH: that `CascadeWallBaselineCommand` accepts the payload, or that anything
//    moves on screen. Nothing in this family is browser-verified.

/** A room seated inside RING_BEFORE, hard against edge 1 — the edge the drag moves. */
const ROOM_BEFORE: readonly WallFollowRingPoint[] = [
    { x: 4, z: 1 }, { x: 10, z: 1 }, { x: 10, z: 5 }, { x: 4, z: 5 },
];
/** The same room after the level face carried it +2 m: its edge-1 side followed to x = 12. */
const ROOM_AFTER: readonly WallFollowRingPoint[] = [
    { x: 4, z: 1 }, { x: 12, z: 1 }, { x: 12, z: 5 }, { x: 4, z: 5 },
];

const ROOM_ID = 'R-kitchen';

/** The level's four shell walls PLUS the room's four partitions, all pristine. */
function buildingWalls(): Map<string, WallFollowBaseline> {
    const m = pristineWalls();
    for (let i = 0; i < 4; i++) m.set(`P${i}`, edgeBaseline(ROOM_BEFORE, i));
    return m;
}

const primary = (wallId: string, edgeIndex: number): WallFollowLinkRow =>
    ({ wallId, edgeIndex, claim: 'primary' });
const also = (wallId: string, edgeIndex: number): WallFollowLinkRow =>
    ({ wallId, edgeIndex, claim: 'also' });

const ROOM_LINKS: readonly WallFollowLinkRow[] = [
    primary('P0', 0), primary('P1', 1), primary('P2', 2), primary('P3', 3),
];

/** A reader over a per-envelope link table. Any envelope not in it produced no walls (`[]`). */
const linksOver = (
    table: Readonly<Record<string, readonly WallFollowLinkRow[]>>,
): ((envelopeId: string) => readonly WallFollowLinkRow[] | null) =>
    (envelopeId) => table[envelopeId] ?? [];

interface Recorded2 {
    dispatched: { command: string; payload: unknown }[];
    notices: { message: string; severity: string }[];
}

function depsOverGraph(
    walls: ReadonlyMap<string, WallFollowBaseline>,
    table: Readonly<Record<string, readonly WallFollowLinkRow[]>>,
): { deps: SpaceEnvelopeWallFollowDeps; rec: Recorded2 } {
    const rec: Recorded2 = { dispatched: [], notices: [] };
    return {
        rec,
        deps: {
            readLinks: linksOver(table),
            readWall: readerOf(walls),
            dispatch: (command, payload) => { rec.dispatched.push({ command, payload }); return undefined; },
            notify: (message, severity) => { rec.notices.push({ message, severity }); },
        },
    };
}

/** The committed event for a level drag that also carried the room with it. */
const COMMITTED_WITH_ROOM: SpaceEnvelopeFaceMoveCommitted = {
    ...COMMITTED,
    adapted: [{ envelopeId: ROOM_ID, ringBefore: ROOM_BEFORE, ringAfter: ROOM_AFTER }],
};

const entryIds = (rec: Recorded2): string[] =>
    ((rec.dispatched[0]!.payload as { entries: { wallId: string }[] }).entries)
        .map((e) => e.wallId).sort();

describe('⭐ the partitions follow too — and it is still ONE undo entry', () => {
    it('⭐ THE FOUNDER’S ASK: the perimeter AND the room’s partitions move, in ONE command', () => {
        const { deps, rec } = depsOverGraph(buildingWalls(), {
            'E-ground': ALL_LINKS,
            [ROOM_ID]: ROOM_LINKS,
        });
        applySpaceEnvelopeWallFollow(COMMITTED_WITH_ROOM, deps);

        // ⛔ ONE dispatch. Two envelopes moving must NOT be two cascades and two Ctrl+Z (C114 §6a).
        expect(rec.dispatched).toHaveLength(1);
        expect(rec.dispatched[0]!.command).toBe(WALL_CASCADE_BASELINE_COMMAND);
        // Shell edges 0,1,2 moved (edge 3 did not); the room's edges 0,1,2 moved likewise.
        expect(entryIds(rec)).toEqual(['P0', 'P1', 'P2', 'W0', 'W1', 'W2']);
    });

    it('⭐ a partition lands on its ROOM’s new edge — not on the level’s', () => {
        const { deps, rec } = depsOverGraph(buildingWalls(), {
            'E-ground': ALL_LINKS,
            [ROOM_ID]: ROOM_LINKS,
        });
        applySpaceEnvelopeWallFollow(COMMITTED_WITH_ROOM, deps);

        const entries = (rec.dispatched[0]!.payload as {
            entries: { wallId: string; newBaseLine: WallFollowBaseline }[];
        }).entries;
        const p1 = entries.find((e) => e.wallId === 'P1')!;
        // Room edge 1 of ROOM_AFTER is (12,1) → (12,5). The LEVEL's edge 1 is (12,0) → (12,6):
        // a partition wired to the level's ring would land on z = 0 / z = 6 and be visibly wrong.
        expect(p1.newBaseLine[0].x).toBeCloseTo(12, 9);
        expect(p1.newBaseLine[0].z).toBeCloseTo(1, 9);
        expect(p1.newBaseLine[1].z).toBeCloseTo(5, 9);
        // And the wall's own world Y survives the room leg exactly as it does the level leg.
        expect(p1.newBaseLine[0].y).toBe(LEVEL_Y);
    });

    it('⛔ no room adapted ⇒ the perimeter still follows, and NOTHING else changes', () => {
        const { deps, rec } = depsOverGraph(buildingWalls(), {
            'E-ground': ALL_LINKS,
            [ROOM_ID]: ROOM_LINKS,
        });
        // Pulling a face OUTWARD strands no room, so the event carries no `adapted` — which is the
        // model's answer, not a gap: no room moved, so no partition has anything to follow.
        applySpaceEnvelopeWallFollow(COMMITTED, deps);
        expect(rec.dispatched).toHaveLength(1);
        expect(entryIds(rec)).toEqual(['W0', 'W1', 'W2']);
    });

    it('⛔ an `also` claim NEVER moves a wall — it would libel an untouched wall as hand-moved', () => {
        // `buildFromDesignPlan.ts:641-643` records a room's claim on a shell wall it only PARTLY
        // covers. Planning W1 against the ROOM's edge 1 would find it does not span it and would
        // tell the user "you moved this by hand" about a wall nobody has touched.
        const { deps, rec } = depsOverGraph(buildingWalls(), {
            'E-ground': ALL_LINKS,
            [ROOM_ID]: [...ROOM_LINKS, also('W1', 1)],
        });
        const plan = applySpaceEnvelopeWallFollow(COMMITTED_WITH_ROOM, deps)!;

        // W1 still travels — under the LEVEL's primary claim, exactly once.
        expect(entryIds(rec)).toEqual(['P0', 'P1', 'P2', 'W0', 'W1', 'W2']);
        // ⛔ And it is NOT named as authored, contested, or anything else.
        expect(plan.stayed.map((x) => x.wallId)).not.toContain('W1');
    });

    it('⛔ a wall two moved envelopes place DIFFERENTLY is dropped and NAMED, never overwritten', () => {
        // Both claims are `primary` and both envelopes moved — the graph is saying two
        // contradictory things about one wall, which `CascadeWallBaselineCommand` would resolve by
        // ORDER, silently. Contriving it here is the only way to pin that it does not.
        const walls = buildingWalls();
        // A wall that spans BOTH the level's edge 1 and (a copy of) the room's edge 1 is
        // impossible geometrically, so the fixture gives the room its OWN wall id for edge 1 that
        // is also claimed, pristine, by the level at a DIFFERENT edge index.
        walls.set('SHARED', edgeBaseline(RING_BEFORE, 1));
        const { deps, rec } = depsOverGraph(walls, {
            'E-ground': [primary('SHARED', 1)],
            // The room claims the same wall as its edge 1 — a different destination entirely.
            [ROOM_ID]: [primary('SHARED', 1)],
        });
        const plan = applySpaceEnvelopeWallFollow({
            ...COMMITTED_WITH_ROOM,
            // The room's ringBefore edge 1 must MATCH the wall, or it stays as `authored` instead.
            adapted: [{ envelopeId: ROOM_ID, ringBefore: RING_BEFORE, ringAfter: ROOM_AFTER }],
        }, deps)!;

        expect(rec.dispatched).toHaveLength(0);
        const stay = plan.stayed.find((x) => x.wallId === 'SHARED')!;
        expect(stay.reason).toBe('contested-by-two-envelopes');
        // ⭐ AND THE USER HEARS IT. A contested wall that only reached the console would be the
        // silent outcome C80 forbids, wearing a different name.
        expect(rec.notices.some((n) => n.message.includes('two envelopes'))).toBe(true);
    });

    it('⛔ a wall that MOVED is never also reported as STAYED by another envelope', () => {
        // W0..W3 are `edge-did-not-move` / out-of-range under the room's 4-edge ring; if the merge
        // concatenated blindly, the user would be told the perimeter both moved and did not.
        const { deps } = depsOverGraph(buildingWalls(), {
            'E-ground': ALL_LINKS,
            [ROOM_ID]: [...ROOM_LINKS, also('W0', 0)],
        });
        const plan = applySpaceEnvelopeWallFollow(COMMITTED_WITH_ROOM, deps)!;
        const moved = new Set(plan.entries.map((e) => e.wallId));
        for (const stay of plan.stayed) expect(moved.has(stay.wallId)).toBe(false);
    });

    it('⭐ the C80 rule is applied PER ENVELOPE — a hand-moved partition stays, the rest follow', () => {
        const walls = buildingWalls();
        const d = edgeBaseline(ROOM_BEFORE, 1);
        walls.set('P1', [{ ...d[0], x: d[0].x + 1 }, { ...d[1], x: d[1].x + 1 }] as const);
        const { deps, rec } = depsOverGraph(walls, {
            'E-ground': ALL_LINKS,
            [ROOM_ID]: ROOM_LINKS,
        });
        const plan = applySpaceEnvelopeWallFollow(COMMITTED_WITH_ROOM, deps)!;

        expect(entryIds(rec)).toEqual(['P0', 'P2', 'W0', 'W1', 'W2']);
        const stay = plan.stayed.find((x) => x.wallId === 'P1')!;
        expect(stay.reason).toBe('authored-since-generation');
        // Both numbers, per C80 §1.4 — the drift and the threshold.
        expect(stay.detail).toContain('1.00 m');
        expect(stay.detail).toContain(`${DEFAULT_AUTHORED_TOLERANCE_M.toFixed(2)} m`);
    });

    it('⛔ a top/bottom drag with rooms carried is STILL untoasted — the refusal survives merging', () => {
        const { deps, rec } = depsOverGraph(buildingWalls(), {
            'E-ground': ALL_LINKS,
            [ROOM_ID]: ROOM_LINKS,
        });
        applySpaceEnvelopeWallFollow({
            ...COMMITTED,
            ringAfter: RING_BEFORE,
            adapted: [{ envelopeId: ROOM_ID, ringBefore: ROOM_BEFORE, ringAfter: ROOM_BEFORE }],
        }, deps);
        expect(rec.dispatched).toHaveLength(0);
        expect(rec.notices).toHaveLength(0);
    });

    it('⛔ a room that names the SUBJECT is skipped — planning it twice would make it contest itself', () => {
        const { deps, rec } = depsOverGraph(buildingWalls(), { 'E-ground': ALL_LINKS });
        applySpaceEnvelopeWallFollow({
            ...COMMITTED,
            adapted: [{ envelopeId: 'E-ground', ringBefore: RING_BEFORE, ringAfter: RING_AFTER }],
        }, deps);
        expect(entryIds(rec)).toEqual(['W0', 'W1', 'W2']);
    });
});

describe('mergeSpaceEnvelopeWallFollowPlans — pure, total, and IDENTITY on one', () => {
    const onePlan = (): SpaceEnvelopeWallFollowPlan => planSpaceEnvelopeWallFollow({
        spaceEnvelopeId: 'E-ground',
        ringBefore: RING_BEFORE,
        ringAfter: RING_AFTER,
        links: ALL_LINKS,
        wallState: readerOf(pristineWalls()),
    });

    it('⛔ ONE plan comes back BY REFERENCE — no second spelling of an answer that exists', () => {
        const p = onePlan();
        expect(mergeSpaceEnvelopeWallFollowPlans([p])).toBe(p);
    });

    it('an empty set is a value, not a throw', () => {
        const m = mergeSpaceEnvelopeWallFollowPlans([]);
        expect(m.ok).toBe(false);
        expect(m.entries).toHaveLength(0);
        expect(m.refusal).toBeNull();
    });

    it('two envelopes AGREEING about a wall move it ONCE — agreement is not a conflict', () => {
        const p = onePlan();
        const merged = mergeSpaceEnvelopeWallFollowPlans([p, p]);
        expect(merged.entries.map((e) => e.wallId).sort()).toEqual(['W0', 'W1', 'W2']);
        expect(merged.stayed.some((x) => x.reason === 'contested-by-two-envelopes')).toBe(false);
        expect(merged.cause).toBe(WALL_FOLLOW_CAUSE);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE PERFORMANCE NUMBER, MEASURED HERE RATHER THAN ASSERTED IN A COMMENT.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §PERF-WALL-MOVE-INCREMENTAL-REBUILD (L-234 / L-250) is this family's standing trap: the prior
// defect was a POINTER-MOVE cost. This feature adds N planner runs per DRAG, so the question worth
// answering is what N costs ONCE, at pointer-up — not whether it is fast in principle.
//
// ⚠ THE ASSERTION IS DELIBERATELY LOOSE (50 ms). It is a REGRESSION TRIPWIRE, not a bench: a CI
// runner under load is not a founder's laptop, and a tight bound here would fail for reasons that
// have nothing to do with this code. The real reading is printed, and the commit message carries
// the number this machine produced.
describe('⭐ the cost of N envelopes, measured', () => {
    it('13 envelopes / 112 link rows merge in single-digit milliseconds, ONCE, at pointer-up', () => {
        const ROOMS = 12;
        const PARTITIONS_PER_ROOM = 6;
        const SHELL = 40;

        // A 40-vertex shell ring and 12 hexagonal rooms — the shape a real storey has.
        const shellBefore: WallFollowRingPoint[] = [];
        for (let i = 0; i < SHELL; i++) {
            const t = (i / SHELL) * Math.PI * 2;
            shellBefore.push({ x: 30 + 25 * Math.cos(t), z: 20 + 18 * Math.sin(t) });
        }
        const shellAfter = shellBefore.map((q) => ({ x: q.x * 1.02, z: q.z }));

        const walls = new Map<string, WallFollowBaseline>();
        const table: Record<string, readonly WallFollowLinkRow[]> = {};
        const shellLinks: WallFollowLinkRow[] = [];
        for (let i = 0; i < SHELL; i++) {
            walls.set(`S${i}`, edgeBaseline(shellBefore, i));
            shellLinks.push(primary(`S${i}`, i));
        }
        table['E-big'] = shellLinks;

        const adapted: { envelopeId: string; ringBefore: readonly WallFollowRingPoint[];
            ringAfter: readonly WallFollowRingPoint[] }[] = [];
        for (let r = 0; r < ROOMS; r++) {
            const ringBefore: WallFollowRingPoint[] = [];
            for (let i = 0; i < PARTITIONS_PER_ROOM; i++) {
                const t = (i / PARTITIONS_PER_ROOM) * Math.PI * 2;
                ringBefore.push({ x: 10 + r * 3 + 2 * Math.cos(t), z: 10 + 2 * Math.sin(t) });
            }
            const ringAfter = ringBefore.map((q) => ({ x: q.x + 0.4, z: q.z }));
            const rows: WallFollowLinkRow[] = [];
            for (let i = 0; i < PARTITIONS_PER_ROOM; i++) {
                walls.set(`R${r}P${i}`, edgeBaseline(ringBefore, i));
                rows.push(primary(`R${r}P${i}`, i));
            }
            table[`R-${r}`] = rows;
            adapted.push({ envelopeId: `R-${r}`, ringBefore, ringAfter });
        }
        expect(shellLinks.length + ROOMS * PARTITIONS_PER_ROOM).toBe(112);

        const { deps, rec } = depsOverGraph(walls, table);
        const ev: SpaceEnvelopeFaceMoveCommitted = {
            spaceEnvelopeId: 'E-big',
            face: { kind: 'side', edgeIndex: 1 },
            deltaM: 0.6,
            ringBefore: shellBefore,
            ringAfter: shellAfter,
            adapted,
        };

        const t0 = performance.now();
        const plan = applySpaceEnvelopeWallFollow(ev, deps)!;
        const ms = performance.now() - t0;

        // ⭐ EVERY WALL TRAVELS, IN ONE COMMAND. That is what the cost buys.
        expect(rec.dispatched).toHaveLength(1);
        expect(plan.entries).toHaveLength(112);
        console.log(`[perf] §ENVELOPE-PARTITIONS-FOLLOW — 13 envelopes / 112 rows / 112 entries: `
            + `${ms.toFixed(2)} ms, once, at pointer-up (0 ms per pointer-move).`);
        expect(ms).toBeLessThan(50);
    });
});
