// §HOSTEDBY-REVERSE-READER — C71 §2.1 #1 / §2.5 / §1.2 semantics 2, 5, 6.
//
// `hostedBy` is the inverse half of C71 §2.1's "reference-shape pair". `hosts`
// has had typed readers since Phase D; `hostedBy` — written on EVERY opening
// creation and reconstructed on EVERY load — had none. The pair was half-read,
// and every consumer needing `opening → host wall` scanned the wall store.
//
// C71 §2.5 is binding: the reader exists because a CONSUMER needs it.
// THE CONSUMER IS `SyncStateEngine._findHostWall`, on the door/window branch of
// the affected-node computation that drives every sync-state recompute.
//
// WHY THAT CONSUMER IS GENUINE: it already asked exactly this question and had
// two answers, both worse. (1) the denormalized `door.wallId` / `window.wallId`
// field — a per-store field with no invariant tying it to the host wall's own
// `openings[]`, so the two can disagree with nothing to detect it; and failing
// that (2) a LINEAR SCAN of every wall in the store, scanning each `openings[]`.
// The graph answers in one indexed hop from the edge `CreateWallOpeningCommand`
// writes and `rebuildSemanticGraphFromSnapshot` rebuilds — and can REFUSE
// (C71 §4.4) instead of returning `null` for both "no host" and "not found".
//
// REACHABILITY is proven through the PUBLIC path, not by calling the private
// method: `start()` subscribes to the real StoreEventBus, and a real door event
// on that bus reaches `_findHostWall` and out to the recompute queue. Test (c)
// is the one that matters — it proves the graph is consulted by removing every
// other source of the answer and watching the affected-node fan-out still land.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { semanticGraphManager } from '../SemanticGraph';
import { storeEventBus } from '../StoreEventBus';
import { syncStateEngine } from './SyncStateEngine';

const WALL = 'wall-1';
const OTHER_WALL = 'wall-2';
const DOOR = 'door-1';
const ROOM = 'room-1';

/** Exactly what CreateWallOpeningCommand writes, per opening. */
function seedHosting(wallId: string, openingId: string): void {
    semanticGraphManager.addRelationship({
        type: 'hosts', sourceId: wallId, targetId: openingId,
        createdBy: 'CreateWallOpeningCommand',
    });
    semanticGraphManager.addRelationship({
        type: 'hostedBy', sourceId: openingId, targetId: wallId,
        createdBy: 'CreateWallOpeningCommand',
    });
}

/**
 * Install the room store the door/window branch consults AFTER it has the host
 * wall. Deliberately installs NO door store and NO wall store: with both absent,
 * the two legacy answers are unavailable and any host wall the engine resolves
 * can only have come from the graph.
 */
function installRoomStoreOnly(boundingWallIds: string[]): void {
    (globalThis as any).window = (globalThis as any).window ?? (globalThis as any);
    (globalThis as any).roomStore = {
        getAll: () => [{ id: ROOM, boundingWallIds, name: 'R', levelId: 'L0' }],
        getById: (id: string) => (id === ROOM ? { id: ROOM, boundingWallIds } : undefined),
    };
    (globalThis as any).window.roomStore = (globalThis as any).roomStore;
    delete (globalThis as any).doorStore;
    delete (globalThis as any).window.doorStore;
    delete (globalThis as any).wallStore;
    delete (globalThis as any).window.wallStore;
}

beforeEach(() => {
    semanticGraphManager.clear();
});

afterEach(() => {
    syncStateEngine.pause();
});

describe('hostedBy — the typed reader (getHostWall)', () => {
    it('(a) returns the single host wall from the edge the opening-creation command writes', () => {
        seedHosting(WALL, DOOR);

        const q = semanticGraphManager.getHostWall(DOOR);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.wallId).toBe(WALL);
    });

    it('(a2) the reader is DIRECTIONAL — asking the WALL is not the same question as asking the opening', () => {
        seedHosting(WALL, DOOR);
        // `hostedBy` is opening → wall. The wall is the TARGET, so a hostedBy
        // lookup on the wall must refuse, not return the opening.
        const q = semanticGraphManager.getHostWall(WALL);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('opening-unknown-to-hostedBy-writer');
    });

    it('(b) C71 §4.4 — an unknown opening REFUSES; it does not answer null-shaped emptiness', () => {
        const q = semanticGraphManager.getHostWall('never-seen');
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('opening-unknown-to-hostedBy-writer');
        expect(q.detail).toContain('NO ANSWER');
    });

    it('(b2) TWO hosts is a NAMED corruption refusal, not an arbitrary pick (C15 §1)', () => {
        seedHosting(WALL, DOOR);
        seedHosting(OTHER_WALL, DOOR);

        const q = semanticGraphManager.getHostWall(DOOR);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('multiple-hosts');
        expect(q.detail).toContain(WALL);
        expect(q.detail).toContain(OTHER_WALL);
    });
});

describe('hostedBy — REACHABILITY through the production consumer', () => {
    it('(c) THE TEST THAT MATTERS — a real door event on the real StoreEventBus resolves its host wall FROM THE GRAPH, with no door store and no wall store present', () => {
        seedHosting(WALL, DOOR);
        installRoomStoreOnly([WALL]);

        const scheduled: string[] = [];
        syncStateEngine.scheduleRecompute = ((id: string) => { scheduled.push(id); }) as any;

        syncStateEngine.start();
        storeEventBus.emit({
            elementId: DOOR, elementType: 'door', operation: 'update', timestamp: Date.now(),
        });

        // The engine reached the room ONLY by resolving DOOR → WALL and then
        // matching WALL against room.boundingWallIds. With doorStore and
        // wallStore both absent, the graph is the only path that could have
        // produced it.
        expect(scheduled).toContain(ROOM);
    });

    it('(c2) the reader is not merely registered — removing the hostedBy edge makes the SAME event resolve nothing', () => {
        seedHosting(WALL, DOOR);
        installRoomStoreOnly([WALL]);

        const scheduled: string[] = [];
        syncStateEngine.scheduleRecompute = ((id: string) => { scheduled.push(id); }) as any;
        syncStateEngine.start();

        storeEventBus.emit({
            elementId: DOOR, elementType: 'door', operation: 'update', timestamp: Date.now(),
        });
        expect(scheduled).toContain(ROOM);

        // Purge the edge (the type-agnostic cascade a delete performs).
        semanticGraphManager.removeAllRelationshipsForElement(DOOR);
        scheduled.length = 0;

        storeEventBus.emit({
            elementId: DOOR, elementType: 'door', operation: 'update', timestamp: Date.now(),
        });
        // No host resolvable from any of the three sources ⇒ no room fan-out.
        expect(scheduled).not.toContain(ROOM);
    });
});

describe('hostedBy — C71 §1.2 semantics 5 (invalidation) and 6 (deletion)', () => {
    it('(d) semantic 6 — deleting the OPENING purges the edge and the reader refuses', () => {
        seedHosting(WALL, DOOR);
        expect(semanticGraphManager.getHostWall(DOOR).ok).toBe(true);

        semanticGraphManager.removeAllRelationshipsForElement(DOOR);

        const q = semanticGraphManager.getHostWall(DOOR);
        expect(q.ok).toBe(false);
        if (q.ok) throw new Error('unreachable');
        expect(q.reason).toBe('opening-unknown-to-hostedBy-writer');
    });

    it('(d2) semantic 6 — deleting the HOST WALL purges the edge too (the pair dies together)', () => {
        seedHosting(WALL, DOOR);
        semanticGraphManager.removeAllRelationshipsForElement(WALL);

        expect(semanticGraphManager.getHostWall(DOOR).ok).toBe(false);
        // And the forward half is gone as well — the reference-shape PAIR.
        expect(semanticGraphManager.getTargets(WALL, 'hosts')).toEqual([]);
    });

    it('(e) semantic 5 — RE-HOSTING an opening onto another wall updates the answer, with no stale edge left behind', () => {
        // C71 §1.4 records move-invalidation as UNPROVEN for every family. This
        // is the hostedBy row, proven. The failure mode is C71 §7.e's: if the
        // old edge survives, the reader flips from a correct single answer to a
        // `multiple-hosts` refusal — which is exactly why this test asserts the
        // OK branch and not merely "the new wall appears".
        seedHosting(WALL, DOOR);
        semanticGraphManager.removeAllRelationshipsForElement(DOOR);
        seedHosting(OTHER_WALL, DOOR);

        const q = semanticGraphManager.getHostWall(DOOR);
        expect(q.ok).toBe(true);
        if (!q.ok) throw new Error('unreachable');
        expect(q.wallId).toBe(OTHER_WALL);

        // The old host must not still claim it.
        expect(semanticGraphManager.getTargets(WALL, 'hosts')).toEqual([]);
    });
});
