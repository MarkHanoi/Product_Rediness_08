// §ENVELOPE-WALLS-FOLLOW — THE C80 DECISION, DRIVEN WITH NO STORE, NO GRAPH AND NO BUS.
// C80 §2.2/§3.1/§3.2/§3.3 · C114 §6a · C84 EI-9 · P6.
//
// Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEANS THE CONTEXT WALLS -
// PERIMETER WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO - AS PER BIM3.0 PRINCIPALS."*
//
// ✅ ESTABLISHES: a wall still sitting on its generated edge FOLLOWS, with its `y` and its own
//    direction preserved; a wall the user moved by hand STAYS and is NAMED (the C80 branch); an
//    unreadable link graph REFUSES and is never read as "no walls"; a link row whose wall is gone
//    is skipped, not crashed on; a top/bottom drag plans no BASELINE because the ring did not
//    change; a changed vertex COUNT refuses rather than matching the wrong wall; one committed drag
//    dispatches EXACTLY ONE `wall.cascadeBaseline` (C114 §6a) rather than one command per wall;
//    and — §ENVELOPE-TOP-FACE-HEIGHT, L-13118 — a TOP drag makes the walls TALLER in exactly one
//    `wall.updateHeightBatch`, without overwriting a height the user set by hand.
//
// ⛔ DOES NOT ESTABLISH: that any wall moves on screen, that `CascadeWallBaselineCommand` accepts
//    these payloads, or that the semantic graph really holds the rows in a live project. This file
//    drives the PLANNER and the WIRE with hand-written readers — the same split, and the same
//    limit, as `spaceEnvelopeDragSurfacePorts.spec.ts`. Nothing here is browser-verified.

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_AUTHORED_TOLERANCE_M,
    groupWallFollowHeightEntries,
    mergeSpaceEnvelopeWallFollowPlans,
    planSpaceEnvelopeWallFollow,
    WALL_FOLLOW_CAUSE,
    type SpaceEnvelopeWallFollowPlan,
    type SpaceEnvelopeWallFollowRequest,
    type WallFollowBaseline,
    type WallFollowHeightEntry,
    type WallFollowLinkRow,
    type WallFollowRingPoint,
    type WallFollowWallState,
} from '../spaceEnvelopeWallFollowPlan';
import {
    applySpaceEnvelopeWallFollow,
    registerSpaceEnvelopeWallFollow,
    WALL_CASCADE_BASELINE_COMMAND,
    WALL_UPDATE_HEIGHT_BATCH_COMMAND,
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §ENVELOPE-TOP-FACE-HEIGHT (L-13118) — DRAG THE ROOF, THE WALLS GET TALLER
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// ✅ ESTABLISHES: a top-face drag (ring IDENTICAL, height changed) produces height entries and no
//    baseline entries; the HEIGHT ANALOGUE of the C80 test — a wall whose height the user changed
//    by hand KEEPS it and is NAMED with both numbers; a wall whose height cannot be READ is never
//    re-heighted from a default; a BOTTOM drag is refused by name because no verb here moves a
//    wall's base; `edgeIndex: -1` still follows the height because a height needs no edge; N walls
//    at ONE target height cost ONE `wall.updateHeightBatch`; two envelopes wanting two heights for
//    one wall contest and DROP; and a side drag is bit-for-bit what it was.
//
// ⛔ DOES NOT ESTABLISH: that `wall.updateHeightBatch` accepts these payloads in a live runtime,
//    that any wall grows on screen, or that the founder's gesture works in a browser. This drives
//    the PLANNER and the WIRE with hand-written readers. Nothing here is browser-verified
//    (C114 §14d).

/** The envelope was 3 m tall and the roof was pulled to 4.2 m. */
const H_BEFORE = 3;
const H_AFTER = 4.2;

/** A reader that reports a baseline AND a height. Absent height ⇒ the field is OMITTED, not 0. */
const readerOfHeights = (
    walls: ReadonlyMap<string, WallFollowBaseline>,
    heights: ReadonlyMap<string, number>,
): ((wallId: string) => WallFollowWallState | null) =>
    (wallId) => {
        const baseLine = walls.get(wallId);
        if (!baseLine) return null;
        const h = heights.get(wallId);
        return h === undefined ? { wallId, baseLine } : { wallId, baseLine, heightM: h };
    };

/** Every wall standing at the envelope's generated height — the state a top drag starts from. */
const pristineHeights = (h = H_BEFORE): Map<string, number> =>
    new Map([['W0', h], ['W1', h], ['W2', h], ['W3', h]]);

/** A TOP-face drag: the ring is the SAME ring, and only the height moved. */
const topDrag = (over: Partial<SpaceEnvelopeWallFollowRequest> = {}): SpaceEnvelopeWallFollowPlan =>
    planSpaceEnvelopeWallFollow({
        spaceEnvelopeId: 'E-ground',
        // ⛔ THE SAME VERTICES, deliberately. `SpaceEnvelopeFaceMove.ts:78` — *"For top/bottom moves
        // this is unchanged"* — so a fixture whose ring differed would be testing a side drag.
        ringBefore: RING_BEFORE,
        ringAfter: RING_BEFORE.map((p) => ({ x: p.x, z: p.z })),
        links: ALL_LINKS,
        wallState: readerOfHeights(pristineWalls(), pristineHeights()),
        heightBefore: H_BEFORE,
        heightAfter: H_AFTER,
        baseOffsetBefore: 0,
        baseOffsetAfter: 0,
        ...over,
    });

describe('⭐⭐ the TOP face makes the walls taller (L-13118)', () => {
    it('⭐ THE FOUNDER’S GESTURE: the ring did not move, and every wall follows the new HEIGHT', () => {
        const plan = topDrag();

        expect(plan.ok).toBe(true);
        expect(plan.refusal).toBeNull();
        // ⛔ NO BASELINE MOVED, and that is correct rather than a shortfall: the footprint is
        // identical, so there is no new edge for any wall to land on.
        expect(plan.entries).toEqual([]);
        expect(plan.stayed).toEqual([]);
        expect(plan.heightEntries).toHaveLength(4);
        for (const e of plan.heightEntries) {
            expect(e.newHeightM).toBeCloseTo(H_AFTER, 9);
            expect(e.prevHeightM).toBeCloseTo(H_BEFORE, 9);
        }
        expect(plan.heightEntries.map((e) => e.wallId).sort()).toEqual(['W0', 'W1', 'W2', 'W3']);
    });

    it('⛔⭐ THE HEIGHT ANALOGUE OF THE C80 BRANCH — a hand-set height KEEPS it, with BOTH numbers', () => {
        const heights = pristineHeights();
        heights.set('W2', 2.4); // the user shortened this one by hand
        const plan = topDrag({ wallState: readerOfHeights(pristineWalls(), heights) });

        expect(plan.heightEntries.map((e) => e.wallId).sort()).toEqual(['W0', 'W1', 'W3']);
        const stay = plan.heightStayed.find((s) => s.wallId === 'W2')!;
        expect(stay.reason).toBe('height-authored-since-generation');
        // ⭐ BOTH NUMBERS, read off the geometry — C114 §12a. A refusal that names neither is a
        // shrug with a citation attached.
        expect(stay.detail).toContain('2.40 m');
        expect(stay.detail).toContain('3.00 m');
        expect(stay.detail).toContain(`${DEFAULT_AUTHORED_TOLERANCE_M.toFixed(2)} m`);
    });

    it('the SAME tolerance governs both axes — drift inside it is still the generated wall', () => {
        const heights = pristineHeights();
        heights.set('W2', H_BEFORE + DEFAULT_AUTHORED_TOLERANCE_M * 0.5);
        const plan = topDrag({ wallState: readerOfHeights(pristineWalls(), heights) });
        expect(plan.heightEntries).toHaveLength(4);
        // ⭐ AND IT IS THE ENVELOPE'S NEW HEIGHT, NOT `prev + delta`. The verb carries ONE height
        // for N walls, so a per-wall arithmetic result would need N dispatches.
        expect(plan.heightEntries.every((e) => e.newHeightM === H_AFTER)).toBe(true);
    });

    it('⛔ a wall whose height cannot be READ is never re-heighted from a default', () => {
        const heights = pristineHeights();
        heights.delete('W1');
        const plan = topDrag({ wallState: readerOfHeights(pristineWalls(), heights) });
        expect(plan.heightEntries.map((e) => e.wallId).sort()).toEqual(['W0', 'W2', 'W3']);
        const stay = plan.heightStayed.find((s) => s.wallId === 'W1')!;
        expect(stay.reason).toBe('height-not-recorded');
    });

    it('⭐ `edgeIndex: -1` STILL follows the height — a height needs no edge, a baseline does', () => {
        const plan = topDrag({ links: [{ wallId: 'W1', edgeIndex: -1 }] });
        expect(plan.heightEntries).toHaveLength(1);
        expect(plan.heightEntries[0]!.wallId).toBe('W1');
        // The same row on a SIDE drag is `edge-index-unrecoverable` and moves nothing.
        const side = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E-ground',
            ringBefore: RING_BEFORE,
            ringAfter: RING_AFTER,
            links: [{ wallId: 'W1', edgeIndex: -1 }],
            wallState: readerOf(pristineWalls()),
        });
        expect(side.stayed[0]!.reason).toBe('edge-index-unrecoverable');
    });

    it('a row whose wall is GONE is named on the height axis too, never crashed on', () => {
        const plan = topDrag({ wallState: readerOfHeights(new Map(), new Map()) });
        expect(plan.heightEntries).toEqual([]);
        expect(plan.heightStayed.every((s) => s.reason === 'wall-no-longer-exists')).toBe(true);
    });

    it('⛔ THE BOTTOM FACE IS REFUSED BY NAME — PRYZM moves a wall’s height, not its base', () => {
        // A bottom drag: `SpaceEnvelopeFaceMove.ts:220-221` writes BOTH a new height and a new base.
        const plan = topDrag({ heightAfter: 4, baseOffsetBefore: 0, baseOffsetAfter: -1 });
        expect(plan.ok).toBe(false);
        expect(plan.refusal?.code).toBe('envelope-base-moved');
        // Both numbers, again.
        expect(plan.refusal?.message).toContain('0.00 m');
        expect(plan.refusal?.message).toContain('-1.00 m');
        expect(plan.heightEntries).toEqual([]);
        expect(plan.entries).toEqual([]);
    });

    it('⛔ a surface that reports NO height behaves exactly as it did before this leg existed', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E-ground',
            ringBefore: RING_BEFORE,
            ringAfter: RING_BEFORE.map((p) => ({ x: p.x, z: p.z })),
            links: ALL_LINKS,
            wallState: readerOfHeights(pristineWalls(), pristineHeights()),
        });
        expect(plan.refusal?.code).toBe('ring-unchanged');
        expect(plan.heightEntries).toEqual([]);
        // ⛔ AND THE OLD SENTENCE IS GONE. It said *"PRYZM does not yet carry that through to wall
        // heights"*, which became FALSE the day this shipped — a stale refusal is a wrong answer
        // with a citation attached.
        expect(plan.refusal?.message).not.toContain('does not yet');
        expect(plan.refusal?.message).not.toMatch(/wall heights/i);
    });

    it('⛔ ONE READING IS NOT A CHANGE — a half-reported height is treated as unreported', () => {
        const plan = topDrag({ heightAfter: undefined });
        expect(plan.refusal?.code).toBe('ring-unchanged');
        expect(plan.heightEntries).toEqual([]);
    });

    it('⭐ A SIDE DRAG IS BIT-FOR-BIT WHAT IT WAS — the height leg adds nothing to it', () => {
        const plan = planSpaceEnvelopeWallFollow({
            spaceEnvelopeId: 'E-ground',
            ringBefore: RING_BEFORE,
            ringAfter: RING_AFTER,
            links: ALL_LINKS,
            wallState: readerOfHeights(pristineWalls(), pristineHeights()),
            // The height is REPORTED and UNCHANGED — the ordinary side-drag reading.
            heightBefore: H_BEFORE,
            heightAfter: H_BEFORE,
            baseOffsetBefore: 0,
            baseOffsetAfter: 0,
        });
        expect(plan.entries.map((e) => e.wallId).sort()).toEqual(['W0', 'W1', 'W2']);
        expect(plan.heightEntries).toEqual([]);
        expect(plan.heightStayed).toEqual([]);
    });

    it('the summary of a pure height gesture talks about HEIGHT, not about "0 walls followed"', () => {
        const plan = topDrag();
        expect(plan.summary).toContain('followed the envelope’s new height');
        expect(plan.summary).not.toContain('0 walls');
    });
});

describe('⭐ groupWallFollowHeightEntries — the verb takes ONE height, so the plan groups', () => {
    const entry = (wallId: string, newHeightM: number): WallFollowHeightEntry =>
        ({ wallId, newHeightM, prevHeightM: 3 });

    it('⭐ N walls at ONE height are ONE group — the founder’s gesture is exactly this', () => {
        const groups = groupWallFollowHeightEntries([entry('A', 4.2), entry('B', 4.2), entry('C', 4.2)]);
        expect(groups).toHaveLength(1);
        expect(groups[0]!.heightM).toBe(4.2);
        expect(groups[0]!.wallIds).toEqual(['A', 'B', 'C']);
    });

    it('two target heights are two groups, in ASCENDING order — deterministic, not incidental', () => {
        const groups = groupWallFollowHeightEntries([entry('A', 4.2), entry('B', 2.5), entry('C', 4.2)]);
        expect(groups.map((g) => g.heightM)).toEqual([2.5, 4.2]);
        expect(groups[0]!.wallIds).toEqual(['B']);
        expect(groups[1]!.wallIds).toEqual(['A', 'C']);
    });

    it('an empty plan groups to nothing — no empty dispatch', () => {
        expect(groupWallFollowHeightEntries([])).toEqual([]);
    });
});

describe('⭐ the height leg merges across envelopes on the same rules as the ring leg', () => {
    const planWith = (
        heightAfter: number,
        wallId: string,
    ): SpaceEnvelopeWallFollowPlan => planSpaceEnvelopeWallFollow({
        spaceEnvelopeId: `E-${heightAfter}`,
        ringBefore: RING_BEFORE,
        ringAfter: RING_BEFORE.map((p) => ({ x: p.x, z: p.z })),
        links: [{ wallId, edgeIndex: 0 }],
        wallState: readerOfHeights(pristineWalls(), pristineHeights()),
        heightBefore: H_BEFORE,
        heightAfter,
        baseOffsetBefore: 0,
        baseOffsetAfter: 0,
    });

    it('two envelopes AGREEING about a height move the wall ONCE — agreement is not a conflict', () => {
        const merged = mergeSpaceEnvelopeWallFollowPlans([planWith(4.2, 'W0'), planWith(4.2, 'W0')]);
        expect(merged.heightEntries).toHaveLength(1);
        expect(merged.heightStayed).toEqual([]);
    });

    it('⛔ two envelopes wanting TWO heights DROP the wall and NAME it — never last-write-wins', () => {
        const merged = mergeSpaceEnvelopeWallFollowPlans([planWith(4.2, 'W0'), planWith(2.6, 'W0')]);
        expect(merged.heightEntries).toEqual([]);
        expect(merged.heightStayed).toHaveLength(1);
        expect(merged.heightStayed[0]!.reason).toBe('height-contested-by-two-envelopes');
        expect(merged.heightStayed[0]!.wallId).toBe('W0');
    });

    it('⛔ a wall whose HEIGHT followed is never also reported as having kept it', () => {
        const merged = mergeSpaceEnvelopeWallFollowPlans([planWith(4.2, 'W0'), planWith(4.2, 'W1')]);
        const moved = new Set(merged.heightEntries.map((e) => e.wallId));
        expect(merged.heightStayed.every((s) => !moved.has(s.wallId))).toBe(true);
    });

    it('⛔ a `ring-unchanged` subject with a HEIGHT change is NOT a refusal — it is a height change', () => {
        const merged = mergeSpaceEnvelopeWallFollowPlans([planWith(4.2, 'W0'), planWith(4.2, 'W1')]);
        expect(merged.refusal).toBeNull();
        expect(merged.ok).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE WIRE, ON THE HEIGHT AXIS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The committed event a TOP-face drag raises: identical rings, a new height. */
const COMMITTED_TOP: SpaceEnvelopeFaceMoveCommitted = {
    spaceEnvelopeId: 'E-ground',
    face: { kind: 'top' },
    deltaM: 1.2,
    ringBefore: RING_BEFORE,
    ringAfter: RING_BEFORE.map((p) => ({ x: p.x, z: p.z })),
    heightBefore: H_BEFORE,
    heightAfter: H_AFTER,
    baseOffsetBefore: 0,
    baseOffsetAfter: 0,
    surfaceId: 'site-3d',
};

function heightDepsOver(
    walls: ReadonlyMap<string, WallFollowBaseline>,
    heights: ReadonlyMap<string, number>,
    links: readonly WallFollowLinkRow[] | null,
): { deps: SpaceEnvelopeWallFollowDeps; rec: Recorded } {
    const rec: Recorded = { dispatched: [], notices: [] };
    return {
        rec,
        deps: {
            readLinks: () => links,
            readWall: readerOfHeights(walls, heights),
            dispatch: (command, payload) => { rec.dispatched.push({ command, payload }); return undefined; },
            notify: (message, severity) => { rec.notices.push({ message, severity }); },
        },
    };
}

describe('⭐⭐ one roof drag → EXACTLY ONE wall.updateHeightBatch (C114 §6a)', () => {
    it('⭐ THE CLOSE OF L-13118: forty walls get taller in ONE command, and NO cascade runs', () => {
        const { deps, rec } = heightDepsOver(pristineWalls(), pristineHeights(), ALL_LINKS);
        applySpaceEnvelopeWallFollow(COMMITTED_TOP, deps);

        expect(rec.dispatched).toHaveLength(1);
        expect(rec.dispatched[0]!.command).toBe(WALL_UPDATE_HEIGHT_BATCH_COMMAND);
        // ⛔ ASSERTED AGAINST THE EXPORTED CONSTANT **AND** THE LITERAL: a spec that re-spelled it
        // would pass while production and the bus disagreed.
        expect(WALL_UPDATE_HEIGHT_BATCH_COMMAND).toBe('wall.updateHeightBatch');
        const payload = rec.dispatched[0]!.payload as { wallIds: string[]; height: number };
        expect([...payload.wallIds].sort()).toEqual(['W0', 'W1', 'W2', 'W3']);
        expect(payload.height).toBeCloseTo(H_AFTER, 9);
        // ⛔ And NOT a baseline cascade — a top drag has no new edge to land any wall on.
        expect(rec.dispatched.some((d) => d.command === WALL_CASCADE_BASELINE_COMMAND)).toBe(false);
    });

    it('⭐ the user is TOLD what got taller — a silent success is still a silent outcome', () => {
        const { deps, rec } = heightDepsOver(pristineWalls(), pristineHeights(), ALL_LINKS);
        applySpaceEnvelopeWallFollow(COMMITTED_TOP, deps);
        expect(rec.notices[0]?.severity).toBe('info');
        expect(rec.notices[0]?.message).toContain('new height');
    });

    it('⛔ A SIDE DRAG DISPATCHES NO HEIGHT COMMAND — the regression guard for the existing path', () => {
        const { deps, rec } = heightDepsOver(pristineWalls(), pristineHeights(), ALL_LINKS);
        applySpaceEnvelopeWallFollow(
            { ...COMMITTED, heightBefore: H_BEFORE, heightAfter: H_BEFORE, baseOffsetBefore: 0, baseOffsetAfter: 0 },
            deps,
        );
        expect(rec.dispatched).toHaveLength(1);
        expect(rec.dispatched[0]!.command).toBe(WALL_CASCADE_BASELINE_COMMAND);
    });

    it('⛔ nothing is dispatched when every wall’s height was authored — and the user hears why', () => {
        const heights = new Map([['W0', 2.4], ['W1', 2.4], ['W2', 2.4], ['W3', 2.4]]);
        const { deps, rec } = heightDepsOver(pristineWalls(), heights, ALL_LINKS);
        applySpaceEnvelopeWallFollow(COMMITTED_TOP, deps);
        expect(rec.dispatched).toHaveLength(0);
        expect(rec.notices[0]?.message).toContain('by hand');
    });

    it('⛔ a BOTTOM drag IS surfaced — unlike `ring-unchanged`, it is not the ordinary outcome', () => {
        const { deps, rec } = heightDepsOver(pristineWalls(), pristineHeights(), ALL_LINKS);
        applySpaceEnvelopeWallFollow(
            { ...COMMITTED_TOP, face: { kind: 'bottom' }, heightAfter: 4, baseOffsetAfter: -1 },
            deps,
        );
        expect(rec.dispatched).toHaveLength(0);
        expect(rec.notices[0]?.severity).toBe('warning');
        expect(rec.notices[0]?.message).toContain('Drag the TOP face');
    });

    it('⭐ THE MIXED GESTURE — baselines FIRST, then heights, and both really happen', () => {
        // A room that had to shrink in plan AND in height in the same commit
        // (`SpaceEnvelopeContext.ts:305-363` runs both loops). Rare, real, and named.
        const { deps, rec } = heightDepsOver(pristineWalls(), pristineHeights(), ALL_LINKS);
        applySpaceEnvelopeWallFollow(
            {
                ...COMMITTED,
                heightBefore: H_BEFORE,
                heightAfter: 2.6,
                baseOffsetBefore: 0,
                baseOffsetAfter: 0,
            },
            deps,
        );
        expect(rec.dispatched.map((d) => d.command)).toEqual([
            WALL_CASCADE_BASELINE_COMMAND,
            WALL_UPDATE_HEIGHT_BATCH_COMMAND,
        ]);
    });

    it('⛔ a REFUSED height batch reaches the USER — never an unhandled rejection', async () => {
        const notices: { message: string; severity: string }[] = [];
        const deps: SpaceEnvelopeWallFollowDeps = {
            readLinks: () => ALL_LINKS,
            readWall: readerOfHeights(pristineWalls(), pristineHeights()),
            dispatch: () => Promise.reject(new Error('A wall cannot be taller than 20 m; 42 m was requested.')),
            notify: (message, severity) => { notices.push({ message, severity }); },
        };
        applySpaceEnvelopeWallFollow(COMMITTED_TOP, deps);
        await Promise.resolve();
        await Promise.resolve();
        expect(notices.some((n) => n.severity === 'error' && n.message.includes('20 m'))).toBe(true);
    });

    it('⭐ the cost of the height leg, MEASURED — 112 walls, one dispatch, once at pointer-up', () => {
        const walls = new Map<string, WallFollowBaseline>();
        const heights = new Map<string, number>();
        const links: WallFollowLinkRow[] = [];
        for (let i = 0; i < 112; i++) {
            walls.set(`H${i}`, edgeBaseline(RING_BEFORE, i % 4));
            heights.set(`H${i}`, H_BEFORE);
            links.push(primary(`H${i}`, i % 4));
        }
        const { deps, rec } = heightDepsOver(walls, heights, links);

        const t0 = performance.now();
        const plan = applySpaceEnvelopeWallFollow(COMMITTED_TOP, deps)!;
        const ms = performance.now() - t0;

        expect(plan.heightEntries).toHaveLength(112);
        expect(rec.dispatched).toHaveLength(1);
        console.log(`[perf] §ENVELOPE-TOP-FACE-HEIGHT — 112 walls / 1 wall.updateHeightBatch: `
            + `${ms.toFixed(2)} ms, once, at pointer-up (0 ms per pointer-move).`);
        // A REGRESSION TRIPWIRE, not a bench — see the note on the sibling perf test.
        expect(ms).toBeLessThan(50);
    });
});
