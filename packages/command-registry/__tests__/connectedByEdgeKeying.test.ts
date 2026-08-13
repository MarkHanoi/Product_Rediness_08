// §FIX-CONNECTEDBY-EDGE-KEYING — the level↔level circulation edges are keyed on
// the element that AUTHORED them, so two stairs (or two lifts) joining the same
// level pair are two distinct facts rather than one collapsed edge.
//
// THE DEFECT (surfaced by ca0a7ce3's scoping test, which correctly refused to
// paper over it): `addRelationship` was idempotent on (sourceId, targetId, type)
// and IGNORED metadata. `connectedByStair` joins two LEVELS and names the stair
// only in metadata, so a second stair between the same pair was a silent no-op
// that returned the FIRST stair's edge id. Deleting either stair then removed
// the only edge present and left the survivor with no connectedByStair edge at
// all — two levels genuinely joined by a stair, reported as unconnected.
//
// THE FIX — option (a), key the edge on the stair, NOT option (b), make
// idempotency metadata-aware:
//
//   `Relationship.authoredBy` is an OPTIONAL identity discriminator. When
//   present, edge identity is (sourceId, targetId, type, authoredBy); when
//   absent, it is (sourceId, targetId, type) exactly as before.
//
// Option (b) was rejected on blast radius. `addRelationship` is the single
// insert path for EVERY family, and several rely on metadata-blind collapse:
// `DetectAllRoomsCommand` emits `adjacentTo` once per SHARED WALL (two rooms
// sharing three walls = three identical calls), `boundedBy` is re-emitted every
// detection cycle, and `replaceJoinedToForLevelWalls` re-emits every junction
// pair each flush with `{junctionType, junctionDegree}` metadata that CHANGES as
// walls move. Keying on metadata equality would have turned each of those into a
// duplicate-CREATING call site — unbounded graph growth on the hottest write
// paths — and put a deep compare on an O(k) hot lookup. The final test in this
// file is the guard proving that did not happen.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DeleteStairCommand } from '../src/stair/DeleteStairCommand';
import type { CommandContext } from '../src/types';

const BASE_LEVEL = 'L0';
const TOP_LEVEL = 'L1';
const STAIR_A = 'stair-A';
const STAIR_B = 'stair-B';
const LIFT_A = 'lift-A';
const LIFT_B = 'lift-B';
const ROOM_1 = 'room-1';
const ROOM_2 = 'room-2';
const WALL_1 = 'wall-1';
const ALL_IDS = [BASE_LEVEL, TOP_LEVEL, STAIR_A, STAIR_B, LIFT_A, LIFT_B, ROOM_1, ROOM_2, WALL_1];

/** Exactly what CreateStairCommand writes, for one stair. */
function seedStair(stairId: string, shape: string) {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: stairId, targetId: BASE_LEVEL,
        createdBy: 'CreateStairCommand', metadata: { addedBy: 'CreateStairCommand' },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
        authoredBy: stairId,
        createdBy: 'CreateStairCommand', metadata: { stairId, shape },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByStair', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
        authoredBy: stairId,
        createdBy: 'CreateStairCommand', metadata: { stairId, shape, inverse: true },
    });
}

/** Exactly what CreateVerticalCirculationCommand writes, for one lift. */
function seedLift(liftId: string, kind: string) {
    semanticGraphManager.addRelationship({
        type: 'sitsOn', sourceId: liftId, targetId: BASE_LEVEL,
        createdBy: 'CreateVerticalCirculationCommand',
        metadata: { addedBy: 'CreateVerticalCirculationCommand' },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByLift', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
        authoredBy: liftId,
        createdBy: 'CreateVerticalCirculationCommand', metadata: { liftId, kind },
    });
    semanticGraphManager.addRelationship({
        type: 'connectedByLift', sourceId: TOP_LEVEL, targetId: BASE_LEVEL,
        authoredBy: liftId,
        createdBy: 'CreateVerticalCirculationCommand', metadata: { liftId, kind, inverse: true },
    });
}

/** Full identity of an edge minus the re-minted uuid/timestamp. */
function identity(r: any) {
    return {
        type: r.type, sourceId: r.sourceId, targetId: r.targetId,
        authoredBy: r.authoredBy ?? undefined,
        createdBy: r.createdBy, metadata: r.metadata ?? undefined,
    };
}

/** Order-independent fingerprint of every circulation edge authored by `id`. */
function fingerprintFor(id: string): string[] {
    const seen = new Map<string, any>();
    for (const anchor of [BASE_LEVEL, TOP_LEVEL, id]) {
        for (const rel of semanticGraphManager.getRelationships(anchor)) {
            if (rel.authoredBy === id || rel.sourceId === id || rel.targetId === id) {
                seen.set(rel.id, rel);
            }
        }
    }
    return [...seen.values()].map(r => JSON.stringify(identity(r))).sort();
}

function stairLinks() {
    return semanticGraphManager.getRelationships(BASE_LEVEL)
        .filter(r => r.type === 'connectedByStair');
}

function makeCtx(stairIds: string[]) {
    const map = new Map<string, any>();
    for (const id of stairIds) {
        map.set(id, {
            id, type: 'stair', baseLevelId: BASE_LEVEL, topLevelId: TOP_LEVEL,
            shape: 'straight', position: { x: 0, y: 0, z: 0 },
            totalRise: 3.0, treadDepth: 0.28, riserHeight: 0.18, width: 1.0,
        });
    }
    const stairStore = {
        add: (s: any) => { map.set(s.id, s); },
        getById: (id: string) => map.get(id),
        remove: (id: string) => { map.delete(id); },
        restoreSnapshot: (s: any) => { map.set(s.id, s); },
        getStairConnectingLevels: () => undefined,
        getAll: () => Array.from(map.values()),
    };
    return {
        stores: {
            stairStore,
            stairRailingStore: {
                getByStairId: () => [],
                removeByStairId: () => {},
                add: () => {},
            },
            wallStore: { getById: () => undefined },
        },
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
        projectContext: { activeLevelId: BASE_LEVEL },
    } as unknown as CommandContext;
}

beforeEach(() => {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
});

describe('§FIX-CONNECTEDBY-EDGE-KEYING — author-keyed circulation edges', () => {
    // ── (a) two stairs → two distinct edges ──────────────────────────────────
    it('(a) TWO stairs joining the same level pair produce TWO DISTINCT edge pairs', () => {
        seedStair(STAIR_A, 'straight');
        seedStair(STAIR_B, 'l-shaped');

        // Pre-fix this was 2: stair-B's writes were swallowed and returned
        // stair-A's edge id. Now each stair owns its own directed pair.
        const links = stairLinks();
        expect(links).toHaveLength(4);
        expect(links.filter(r => r.authoredBy === STAIR_A)).toHaveLength(2);
        expect(links.filter(r => r.authoredBy === STAIR_B)).toHaveLength(2);

        // And each carries its OWN metadata — pre-fix the survivor wore stair-A's.
        expect(links.find(r => r.authoredBy === STAIR_B && r.sourceId === BASE_LEVEL)!.metadata)
            .toEqual({ stairId: STAIR_B, shape: 'l-shaped' });
    });

    it('(a) the SAME stair writing twice is still idempotent — keying adds facts, not duplicates', () => {
        seedStair(STAIR_A, 'straight');
        seedStair(STAIR_A, 'straight'); // redo / re-entrant create
        expect(stairLinks()).toHaveLength(2);
    });

    // ── (b) delete one, survivor intact and byte-identical ───────────────────
    it('(b) deleting one stair leaves the SURVIVOR edge intact and BYTE-IDENTICAL', () => {
        seedStair(STAIR_A, 'straight');
        seedStair(STAIR_B, 'l-shaped');
        const survivorBefore = fingerprintFor(STAIR_B);
        expect(survivorBefore).toHaveLength(3); // sitsOn + both directions

        const ctx = makeCtx([STAIR_A, STAIR_B]);
        expect(new DeleteStairCommand({ stairId: STAIR_A }).execute(ctx).success).toBe(true);

        // THE POINT OF THE WHOLE LANE: pre-fix, deleting stair-A removed the one
        // shared edge and left stair-B reporting the levels as unconnected.
        expect(fingerprintFor(STAIR_A)).toHaveLength(0);
        expect(fingerprintFor(STAIR_B)).toEqual(survivorBefore);

        // Field-for-field, not a count.
        const survivors = stairLinks();
        expect(survivors).toHaveLength(2);
        expect(survivors.every(r => r.authoredBy === STAIR_B)).toBe(true);
        expect(survivors.every(r => r.metadata?.stairId === STAIR_B)).toBe(true);
    });

    it('(b) the levels remain connected after one of two stairs is deleted', () => {
        seedStair(STAIR_A, 'straight');
        seedStair(STAIR_B, 'l-shaped');
        new DeleteStairCommand({ stairId: STAIR_A }).execute(makeCtx([STAIR_A, STAIR_B]));

        // hasRelationship is author-BLIND: an existence question, correctly
        // answered `true` because stair-B still joins the pair.
        expect(semanticGraphManager.hasRelationship(BASE_LEVEL, TOP_LEVEL, 'connectedByStair')).toBe(true);
        expect(semanticGraphManager.hasRelationship(BASE_LEVEL, TOP_LEVEL, 'connectedByStair', STAIR_B)).toBe(true);
        // …and `false` for the deleted one, when asked the narrow question.
        expect(semanticGraphManager.hasRelationship(BASE_LEVEL, TOP_LEVEL, 'connectedByStair', STAIR_A)).toBe(false);
    });

    // ── (c) undo restores verbatim, without eating the survivor ──────────────
    it('(c) UNDO of that delete restores the deleted stair VERBATIM and leaves the survivor untouched', () => {
        seedStair(STAIR_A, 'straight');
        seedStair(STAIR_B, 'l-shaped');
        const aBefore = fingerprintFor(STAIR_A);
        const bBefore = fingerprintFor(STAIR_B);

        const ctx = makeCtx([STAIR_A, STAIR_B]);
        const cmd = new DeleteStairCommand({ stairId: STAIR_A });
        cmd.execute(ctx);
        cmd.undo(ctx);

        // Verbatim — including `authoredBy`. If the restore dropped that field
        // the edge would come back UNKEYED, collide with stair-B's, and this
        // would fail on both arms at once.
        expect(fingerprintFor(STAIR_A)).toEqual(aBefore);
        expect(fingerprintFor(STAIR_B)).toEqual(bBefore);
        expect(stairLinks()).toHaveLength(4);
    });

    it('(c) redo→undo cycles do not duplicate and do not merge the two stairs', () => {
        seedStair(STAIR_A, 'straight');
        seedStair(STAIR_B, 'l-shaped');
        const aBefore = fingerprintFor(STAIR_A);

        const ctx = makeCtx([STAIR_A, STAIR_B]);
        const cmd = new DeleteStairCommand({ stairId: STAIR_A });
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        cmd.undo(ctx);

        expect(fingerprintFor(STAIR_A)).toEqual(aBefore);
        expect(stairLinks()).toHaveLength(4); // 4, not 6
    });

    it('(c) author-keyed edges survive serialize/deserialize as TWO edges, not one', () => {
        seedStair(STAIR_A, 'straight');
        seedStair(STAIR_B, 'l-shaped');

        const persisted = semanticGraphManager.serialize();
        semanticGraphManager.deserialize(persisted);

        // `authoredBy` is part of identity, so it MUST round-trip — otherwise the
        // pair would silently re-collapse on every project load and the fix would
        // hold only in-session.
        const links = stairLinks();
        expect(links).toHaveLength(4);
        expect(new Set(links.map(r => r.authoredBy))).toEqual(new Set([STAIR_A, STAIR_B]));
    });

    // ── connectedByLift — the identical shape ────────────────────────────────
    it('connectedByLift had the IDENTICAL defect and is fixed identically', () => {
        seedLift(LIFT_A, 'passenger');
        seedLift(LIFT_B, 'goods');

        const liftLinks = semanticGraphManager.getRelationships(BASE_LEVEL)
            .filter(r => r.type === 'connectedByLift');
        // Two lifts in one core serving the same levels is the COMMON residential
        // case, so the collapse bit harder here than for stairs.
        expect(liftLinks).toHaveLength(4);
        expect(liftLinks.filter(r => r.authoredBy === LIFT_A)).toHaveLength(2);
        expect(liftLinks.filter(r => r.authoredBy === LIFT_B)).toHaveLength(2);
        expect(liftLinks.find(r => r.authoredBy === LIFT_B && r.sourceId === BASE_LEVEL)!.metadata)
            .toEqual({ liftId: LIFT_B, kind: 'goods' });
    });

    it('a stair and a lift between the same pair stay independent families', () => {
        seedStair(STAIR_A, 'straight');
        seedLift(LIFT_A, 'passenger');
        new DeleteStairCommand({ stairId: STAIR_A }).execute(makeCtx([STAIR_A]));

        // The lift is untouched by the stair delete (ca0a7ce3's scoping property,
        // still holding after the keying change).
        expect(semanticGraphManager.getRelationships(BASE_LEVEL)
            .filter(r => r.type === 'connectedByLift')).toHaveLength(2);
    });

    // ── (d) THE REGRESSION GUARD ─────────────────────────────────────────────
    //
    // The whole risk of this change is that `addRelationship` is the ONE insert
    // path for every family. If the keying had leaked into the default arm, every
    // duplicate-suppressing call site would have become duplicate-creating. These
    // reproduce the real hot-path call shapes verbatim and assert the collapse
    // still happens.
    describe('(d) REGRESSION GUARD — metadata-blind dedup is UNCHANGED for every unkeyed family', () => {
        it('adjacentTo: two rooms sharing THREE walls still collapse to ONE edge', () => {
            // DetectAllRoomsCommand emits once per shared wall. Three identical
            // calls, and the dedup is load-bearing.
            for (let i = 0; i < 3; i++) {
                semanticGraphManager.addRelationship({
                    type: 'adjacentTo', sourceId: ROOM_1, targetId: ROOM_2, createdBy: 'system',
                });
            }
            expect(semanticGraphManager.getRelationships(ROOM_1)
                .filter(r => r.type === 'adjacentTo')).toHaveLength(1);
        });

        it('boundedBy: re-emitting every detection cycle still collapses', () => {
            for (let cycle = 0; cycle < 4; cycle++) {
                semanticGraphManager.addRelationship({
                    type: 'boundedBy', sourceId: ROOM_1, targetId: WALL_1, createdBy: 'system',
                });
            }
            expect(semanticGraphManager.getRelationships(ROOM_1)
                .filter(r => r.type === 'boundedBy')).toHaveLength(1);
        });

        it('DIFFERING METADATA on an unkeyed family still collapses — the option-(b) trap', () => {
            // This is precisely what a metadata-AWARE idempotency would have
            // broken. `joinedTo` re-emits each flush with junction metadata that
            // CHANGES as walls move; keying on metadata equality would have grown
            // a new edge on every flush, unboundedly.
            semanticGraphManager.addRelationship({
                type: 'joinedTo', sourceId: WALL_1, targetId: ROOM_2, createdBy: 'system',
                metadata: { junctionType: 'L', junctionDegree: 2 },
            });
            semanticGraphManager.addRelationship({
                type: 'joinedTo', sourceId: WALL_1, targetId: ROOM_2, createdBy: 'system',
                metadata: { junctionType: 'T', junctionDegree: 3 }, // different!
            });
            const joined = semanticGraphManager.getRelationships(WALL_1)
                .filter(r => r.type === 'joinedTo');
            expect(joined).toHaveLength(1);
            // First write wins, exactly as before the change.
            expect(joined[0]!.metadata).toEqual({ junctionType: 'L', junctionDegree: 2 });
        });

        it('an unkeyed insert NEVER matches a keyed edge, and vice versa', () => {
            // The two keyings must not interfere in either direction, or a legacy
            // unkeyed circulation edge (from a pre-fix snapshot) would silently
            // absorb a freshly-keyed write.
            semanticGraphManager.addRelationship({
                type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
                createdBy: 'legacy-snapshot',
            });
            semanticGraphManager.addRelationship({
                type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
                authoredBy: STAIR_A, createdBy: 'CreateStairCommand',
            });
            const links = stairLinks();
            expect(links).toHaveLength(2);
            expect(links.filter(r => r.authoredBy === undefined)).toHaveLength(1);
            expect(links.filter(r => r.authoredBy === STAIR_A)).toHaveLength(1);

            // And a second unkeyed write still dedups against the unkeyed one only.
            semanticGraphManager.addRelationship({
                type: 'connectedByStair', sourceId: BASE_LEVEL, targetId: TOP_LEVEL,
                createdBy: 'legacy-snapshot',
            });
            expect(stairLinks()).toHaveLength(2);
        });

        it('sitsOn from two different elements to one level stays two edges (endpoints differ)', () => {
            // Sanity: the default keying already distinguished these by endpoint.
            semanticGraphManager.addRelationship({
                type: 'sitsOn', sourceId: STAIR_A, targetId: BASE_LEVEL, createdBy: 'system',
            });
            semanticGraphManager.addRelationship({
                type: 'sitsOn', sourceId: STAIR_B, targetId: BASE_LEVEL, createdBy: 'system',
            });
            expect(semanticGraphManager.getRelationships(BASE_LEVEL)
                .filter(r => r.type === 'sitsOn')).toHaveLength(2);
        });
    });
});
