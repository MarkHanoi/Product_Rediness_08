// §GR13-ADJACENCY-READER / §GR13-CONTAINS-READER
// — C71 §2.1 / §4.4 · C78 §1.4 / §5.2 · C79 §5.2.1 / §5.3.
//
// ─── THE ROWS THIS FILE PAYS ─────────────────────────────────────────────────
// `relationship:adjacentTo/cannot-refuse`, `relationship:connectedTo/cannot-refuse`
// and `relationship:contains/cannot-refuse` on
// `tools/rac-conformance/certification/gates/relationship-determination.json`.
// All three families were read ONLY through bare `getTargets`, whose `[]` is the
// same value for "this room touches/contains nothing" and "nobody has ever
// determined that" — C78 §1.4's forbidden inference, available to every caller
// however well its planner was composed.
//
// ─── WHAT MAKES THIS MORE THAN A REFACTOR ────────────────────────────────────
// `SemanticGraph.ts`'s own `invalidateRegionConclusionsForDeletedElement`
// docblock already named this row and declined to pay it:
//
//     "…neither family has a refusal-bearing reader to absorb the difference, so
//      removing them would trade a stale TRUE-shaped answer for a silent empty
//      one — this repository's signature defect … That needs its own reader
//      first."
//
// `describe('THE DIFFERENTIATOR')` is the centre of the file: for each family
// the two states are asserted SIDE BY SIDE in one test — the raw lookup
// producing one value and the typed reader producing two — so the claim cannot
// drift apart from its evidence. `(d) the delete case` is the sharpest: there
// the raw lookup is not merely ambiguous but CONFIDENTLY WRONG, because the
// room↔room edges survive a purge keyed on the deleted wall.
//
// ─── THE NEGATIVE CONTROLS (C70 §5.6) ────────────────────────────────────────
// A "fix" that refused for every room would satisfy every refusal assertion here
// and destroy all three readers — and for `connectedTo` it would destroy the
// feature the reader exists to serve ("rooms without a door" needs the POSITIVE
// empty). `(neg)` pins the other direction in each describe: a covered room
// answers `ok:true`, and a covered room with no edges answers `ok:true` with
// `[]`.

import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticGraphManager } from './SemanticGraph';

const ROOM_A = 'room-a';
const ROOM_B = 'room-b';
const ROOM_LONELY = 'room-lonely';
const ROOM_NEVER_SEEN = 'room-never-detected';
const WALL_SHARED = 'wall-shared';
const DESK = 'furniture-desk';

/** Exactly what DetectAllRoomsCommand / ReDetectRoomsCommand write per detected room. */
function seedBoundedBy(g: SemanticGraphManager, roomId: string, wallId: string): void {
    g.addRelationship({ type: 'boundedBy', sourceId: roomId, targetId: wallId, createdBy: 'system' });
}

/** Exactly what the pairwise scan writes for one adjacent, door-joined pair. */
function seedAdjacency(g: SemanticGraphManager, a: string, b: string, withDoor: boolean): void {
    g.addRelationship({ type: 'adjacentTo', sourceId: a, targetId: b, createdBy: 'system' });
    g.addRelationship({ type: 'adjacentTo', sourceId: b, targetId: a, createdBy: 'system' });
    if (withDoor) {
        g.addRelationship({ type: 'connectedTo', sourceId: a, targetId: b, createdBy: 'system' });
        g.addRelationship({ type: 'connectedTo', sourceId: b, targetId: a, createdBy: 'system' });
    }
}

/** A COMPLETED detection pass over a level: bounded, scanned, then marked. */
function seedCompletedDetection(g: SemanticGraphManager, rooms: readonly string[], opts?: { door?: boolean }): void {
    for (const r of rooms) seedBoundedBy(g, r, WALL_SHARED);
    if (rooms.length >= 2) seedAdjacency(g, rooms[0]!, rooms[1]!, opts?.door ?? false);
    g.markAdjacencyCoverage(rooms);
}

let g: SemanticGraphManager;

beforeEach(() => {
    g = new SemanticGraphManager();
});

describe('adjacentTo — the typed reader (getAdjacentRooms)', () => {
    it('(a) returns the rooms the detection pairwise scan wrote edges for', () => {
        seedCompletedDetection(g, [ROOM_A, ROOM_B]);

        const q = g.getAdjacentRooms(ROOM_A);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect([...q.adjacentRoomIds]).toEqual([ROOM_B]);
    });

    it('(b) REFUSES for a room no completed pass has covered, naming the writer', () => {
        const q = g.getAdjacentRooms(ROOM_NEVER_SEEN);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('room-unknown-to-adjacency-writer');
        expect(q.detail).toContain('NO ANSWER');
    });

    it('(c) REFUSES when the pass ran but a bounding element then MOVED', () => {
        seedCompletedDetection(g, [ROOM_A, ROOM_B]);
        g.invalidateRegionConclusionsForMovedElement(WALL_SHARED);

        const q = g.getAdjacentRooms(ROOM_A);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('boundary-undetermined-after-element-move');
    });

    it('(d) the coverage mark is NOT a licence to answer: an invalidated room stays refused '
        + 'even though it is still marked covered', () => {
        seedCompletedDetection(g, [ROOM_A, ROOM_B]);
        g.invalidateRegionConclusionsForMovedElement(WALL_SHARED);
        // Re-marking (as a later, unrelated level pass might) must NOT talk the
        // reader out of the refusal — only a fresh boundedBy write does that.
        g.markAdjacencyCoverage([ROOM_A]);

        expect(g.getAdjacentRooms(ROOM_A).ok).toBe(false);
    });

    it('(e) a completed re-detection RESOLVES the refusal (the mark is not a one-way trap)', () => {
        seedCompletedDetection(g, [ROOM_A, ROOM_B]);
        g.invalidateRegionConclusionsForMovedElement(WALL_SHARED);
        expect(g.getAdjacentRooms(ROOM_A).ok).toBe(false);

        // Re-detection: the boundedBy write clears the undetermined mark, the
        // completed scan re-marks coverage.
        seedCompletedDetection(g, [ROOM_A, ROOM_B]);

        const q = g.getAdjacentRooms(ROOM_A);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect([...q.adjacentRoomIds]).toEqual([ROOM_B]);
    });

    it('(neg) a COVERED room that touches nothing answers ok:true with [] — a positive '
        + '"adjacent to nothing", not a refusal', () => {
        seedCompletedDetection(g, [ROOM_LONELY]);

        const q = g.getAdjacentRooms(ROOM_LONELY);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.adjacentRoomIds).toEqual([]);
    });

    it('(neg) a pass whose adjacency scan THREW marks nothing, so its rooms refuse rather '
        + 'than report "adjacent to nothing"', () => {
        // The writers emit boundedBy in one try/catch and run the pairwise scan
        // in a second one that logs and continues. This is that half-run state:
        // bounded, never marked.
        seedBoundedBy(g, ROOM_LONELY, WALL_SHARED);

        const q = g.getAdjacentRooms(ROOM_LONELY);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('room-unknown-to-adjacency-writer');
    });
});

describe('connectedTo — the typed reader (getConnectedRooms)', () => {
    it('(a) returns the rooms joined by a door', () => {
        seedCompletedDetection(g, [ROOM_A, ROOM_B], { door: true });

        const q = g.getConnectedRooms(ROOM_A);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect([...q.connectedRoomIds]).toEqual([ROOM_B]);
    });

    it('(b) REFUSES for an uncovered room — a caller must not report it as a room without '
        + 'a door', () => {
        const q = g.getConnectedRooms(ROOM_NEVER_SEEN);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('room-unknown-to-adjacency-writer');
        expect(q.detail).toContain('without a door');
    });

    it('(c) REFUSES after a bounding element is DELETED — the deleted wall may be the one '
        + 'that carried the door', () => {
        seedCompletedDetection(g, [ROOM_A, ROOM_B], { door: true });
        g.removeAllRelationshipsForElement(WALL_SHARED);

        const q = g.getConnectedRooms(ROOM_A);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('boundary-undetermined-after-element-delete');
    });

    it('(neg) a COVERED room with no door-joined neighbour answers ok:true with [] — the '
        + 'positive empty the "rooms without a door" query is actually about', () => {
        // Adjacent, but no door on the shared wall.
        seedCompletedDetection(g, [ROOM_A, ROOM_B], { door: false });

        const q = g.getConnectedRooms(ROOM_A);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.connectedRoomIds).toEqual([]);
        // …and the room IS still adjacent to B: the two families are answered
        // independently, so "no door" never degrades into "no neighbour".
        const adj = g.getAdjacentRooms(ROOM_A);
        expect(adj.ok).toBe(true);
        if (!adj.ok) throw new Error('unreachable');
        expect([...adj.adjacentRoomIds]).toEqual([ROOM_B]);
    });
});

describe('contains — the typed reader (getContainedElements)', () => {
    it('(a) returns what the furniture writer put in the room', () => {
        g.addRelationship({ type: 'contains', sourceId: ROOM_A, targetId: DESK, createdBy: 'CreateFurnitureCommand' });

        const q = g.getContainedElements(ROOM_A);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect([...q.containedIds]).toEqual([DESK]);
    });

    it('(b) REFUSES for a room the furniture writer has never covered', () => {
        const q = g.getContainedElements(ROOM_NEVER_SEEN);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('room-unknown-to-contains-writer');
        expect(q.detail).toContain('NO ANSWER');
    });

    it('(c) a moved bounding wall does NOT make contains undetermined — the family is '
        + 'id-keyed and the furniture did not move', () => {
        seedBoundedBy(g, ROOM_A, WALL_SHARED);
        g.addRelationship({ type: 'contains', sourceId: ROOM_A, targetId: DESK, createdBy: 'CreateFurnitureCommand' });
        g.invalidateRegionConclusionsForMovedElement(WALL_SHARED);

        // The room's ADJACENCY is now undetermined…
        expect(g.getAdjacentRooms(ROOM_A).ok).toBe(false);
        // …and its CONTENTS are not. Region invalidation must not spill into
        // id-keyed families.
        const q = g.getContainedElements(ROOM_A);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect([...q.containedIds]).toEqual([DESK]);
    });

    it('(neg) the mark OUTLIVES the edges: a room whose last item is deleted answers '
        + 'ok:true with [] — "known, and now empty"', () => {
        g.addRelationship({ type: 'contains', sourceId: ROOM_A, targetId: DESK, createdBy: 'CreateFurnitureCommand' });
        g.removeAllRelationshipsForElement(DESK);

        const q = g.getContainedElements(ROOM_A);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.containedIds).toEqual([]);
    });

    it('(neg) deleting the ROOM makes it unknown again, not "covered, contains nothing"', () => {
        g.addRelationship({ type: 'contains', sourceId: ROOM_A, targetId: DESK, createdBy: 'CreateFurnitureCommand' });
        g.removeAllRelationshipsForElement(ROOM_A);

        expect(g.getContainedElements(ROOM_A).ok).toBe(false);
    });
});

// ─── THE DIFFERENTIATOR ──────────────────────────────────────────────────────
// One test per family, asserting the raw lookup's single value and the typed
// reader's two answers side by side. If a future change collapses the two
// states again, these fail — they are the control that cannot pass by accident.

describe('THE DIFFERENTIATOR — [] from the raw lookup, two answers from the reader', () => {
    it('adjacentTo: "covered, touches nothing" and "never covered" are the SAME [] and '
        + 'DIFFERENT determinations', () => {
        seedCompletedDetection(g, [ROOM_LONELY]);

        // The forbidden inference, still available on the raw lookup:
        expect(g.getTargets(ROOM_LONELY, 'adjacentTo')).toEqual([]);
        expect(g.getTargets(ROOM_NEVER_SEEN, 'adjacentTo')).toEqual([]);

        // The typed reader tells them apart:
        expect(g.getAdjacentRooms(ROOM_LONELY).ok).toBe(true);
        expect(g.getAdjacentRooms(ROOM_NEVER_SEEN).ok).toBe(false);
    });

    it('connectedTo: the "rooms without a door" indictment is only earned by the FIRST '
        + 'of these two rooms', () => {
        seedCompletedDetection(g, [ROOM_LONELY]);

        expect(g.getTargets(ROOM_LONELY, 'connectedTo')).toEqual([]);
        expect(g.getTargets(ROOM_NEVER_SEEN, 'connectedTo')).toEqual([]);

        expect(g.getConnectedRooms(ROOM_LONELY).ok).toBe(true);
        expect(g.getConnectedRooms(ROOM_NEVER_SEEN).ok).toBe(false);
    });

    it('contains: an empty room and an unknown room are the SAME [] and DIFFERENT '
        + 'determinations', () => {
        g.addRelationship({ type: 'contains', sourceId: ROOM_A, targetId: DESK, createdBy: 'CreateFurnitureCommand' });
        g.removeAllRelationshipsForElement(DESK);

        expect(g.getTargets(ROOM_A, 'contains')).toEqual([]);
        expect(g.getTargets(ROOM_NEVER_SEEN, 'contains')).toEqual([]);

        expect(g.getContainedElements(ROOM_A).ok).toBe(true);
        expect(g.getContainedElements(ROOM_NEVER_SEEN).ok).toBe(false);
    });

    it('THE DELETE CASE — the raw lookup is not merely ambiguous here, it is CONFIDENTLY '
        + 'WRONG: the room↔room edges SURVIVE a purge keyed on the deleted wall', () => {
        seedCompletedDetection(g, [ROOM_A, ROOM_B], { door: true });
        g.removeAllRelationshipsForElement(WALL_SHARED);

        // Both endpoints are rooms, so the deleted wall appears in no index and
        // no purge can reach these. Harness H7 measured them FALSE, not merely
        // unverified — a re-detect takes them to [].
        expect(g.getTargets(ROOM_A, 'adjacentTo')).toEqual([ROOM_B]);
        expect(g.getTargets(ROOM_A, 'connectedTo')).toEqual([ROOM_B]);

        // The typed readers refuse rather than hand back the survivors.
        const adj = g.getAdjacentRooms(ROOM_A);
        const conn = g.getConnectedRooms(ROOM_A);
        expect(adj.ok).toBe(false);
        expect(conn.ok).toBe(false);
        if (adj.ok || conn.ok) throw new Error('unreachable');
        expect(adj.reason).toBe('boundary-undetermined-after-element-delete');
        expect(conn.reason).toBe('boundary-undetermined-after-element-delete');
    });
});
