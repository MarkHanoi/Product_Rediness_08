// §CONTAINS-FIRST-PARTY-WRITER — C71 §2.1 #7, §5.2, §2.5, §1.2 semantics 1, 4, 6.
//
// `contains` was the inverse failure to `sitsOn`: READ by production, written by
// NOBODY. Two live typed readers ask `getTargets(room.id, 'contains')` and both
// got `[]` forever, so on any native project "this room contains nothing" and
// "nobody ever wrote this edge" were THE SAME VALUE (C71 §0) — this repository's
// signature defect, appearing in the graph. The IFC escape hatch was illusory
// too: IfcImporter's `contains` arm sits under an `adjacentTo|boundedBy` ternary
// and is unreachable, so the family had no writer on ANY path.
//
// THE CONSUMERS WERE ALREADY LIVE AND WAITING ON DATA, not on wiring
// (C71 §2.5 requires a writer to name its first consumer):
//   · `HierarchyTreePanel._appendFurnitureGroup` — `getTargets(room.id,'contains')`.
//     C71 §5.2: its Furniture group has NEVER rendered.
//   · `WorldModelAdapter` — `getTargets(room.id,'contains')` → `containedIds` in
//     the AI world model's per-room summary.
//
// SOURCE OF TRUTH is `hostedSpaceId`, the room id the D-FLE furnish engine
// stamps on every placed item and both ProjectSerializers persist. The edge
// MIRRORS that field; it never guesses one.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { CreateFurnitureCommand } from '../src/furniture/CreateFurnitureCommand';
import type { CommandContext } from '../src/types';

const LEVEL = 'L0';
const ROOM = 'room-living';
const OTHER_ROOM = 'room-bedroom';

function makeCtx(): CommandContext {
    const furniture = new Map<string, any>();
    return {
        bimManager: {
            getLevelById: (id: string) =>
                (id === LEVEL ? { id: LEVEL, name: 'Ground', elevation: 0, childrenIds: [] } : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
        },
        stores: {
            furnitureStore: {
                add: (f: any) => { furniture.set(f.id, f); },
                get: (id: string) => furniture.get(id),
                getById: (id: string) => furniture.get(id),
                remove: (id: string) => { furniture.delete(id); },
                getAll: () => [...furniture.values()],
            },
            floorStore: { getAll: () => [] },
        },
        projectContext: { activeLevelId: LEVEL },
    } as unknown as CommandContext;
}

/** The payload shape `buildFurnishCommands` emits for one placed item. */
function furnishPayload(id: string, hostedSpaceId: string | undefined) {
    return {
        id,
        furnitureType: 'sofa' as any,
        position: { x: 1, y: 0, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        levelId: LEVEL,
        baseOffset: 0,
        width: 2, length: 0.9, height: 0.8,
        material: 'fabric' as any,
        metadata: hostedSpaceId !== undefined ? { hostedSpaceId } : {},
    };
}

beforeEach(() => {
    semanticGraphManager.clear();
});

describe('contains — the first-party WRITER (CreateFurnitureCommand)', () => {
    it('(a) THE TEST THAT MATTERS — creating furniture in a room makes the LIVE READERS\' query answer, where it previously returned [] forever', () => {
        const ctx = makeCtx();

        // Exactly the query HierarchyTreePanel and WorldModelAdapter run.
        expect(semanticGraphManager.getTargets(ROOM, 'contains')).toEqual([]);

        const res = new CreateFurnitureCommand(furnishPayload('furn-1', ROOM)).execute(ctx);
        expect(res.success).toBe(true);

        expect(semanticGraphManager.getTargets(ROOM, 'contains')).toEqual(['furn-1']);
    });

    it('(a2) the edge direction is room → element, matching the union declaration and BOTH readers', () => {
        const ctx = makeCtx();
        new CreateFurnitureCommand(furnishPayload('furn-1', ROOM)).execute(ctx);

        const edge = semanticGraphManager.getRelationships('furn-1', 'contains')[0]!;
        expect(edge.sourceId).toBe(ROOM);
        expect(edge.targetId).toBe('furn-1');
        expect(edge.createdBy).toBe('CreateFurnitureCommand');

        // The reverse query must NOT answer — a furniture item contains nothing.
        expect(semanticGraphManager.getTargets('furn-1', 'contains')).toEqual([]);
    });

    it('(a3) two items in one room, one in another — each room answers only for its own', () => {
        const ctx = makeCtx();
        new CreateFurnitureCommand(furnishPayload('furn-1', ROOM)).execute(ctx);
        new CreateFurnitureCommand(furnishPayload('furn-2', ROOM)).execute(ctx);
        new CreateFurnitureCommand(furnishPayload('furn-3', OTHER_ROOM)).execute(ctx);

        expect(semanticGraphManager.getTargets(ROOM, 'contains').sort()).toEqual(['furn-1', 'furn-2']);
        expect(semanticGraphManager.getTargets(OTHER_ROOM, 'contains')).toEqual(['furn-3']);
    });

    it('(b) NO hostedSpaceId ⇒ NO edge — the writer mirrors the authoritative field and never invents a containment', () => {
        const ctx = makeCtx();
        const res = new CreateFurnitureCommand(furnishPayload('furn-loose', undefined)).execute(ctx);

        expect(res.success).toBe(true);
        // The item exists and sits on its level, but no room claims it.
        expect(semanticGraphManager.getTargets('furn-loose', 'sitsOn')).toEqual([LEVEL]);
        expect(semanticGraphManager.getAll().filter(r => r.type === 'contains')).toEqual([]);
    });

    it('(b2) a failing `contains` write is NON-FATAL — a furniture create never fails for a containment edge', () => {
        const ctx = makeCtx();
        const original = semanticGraphManager.addRelationship.bind(semanticGraphManager);
        let calls = 0;
        (semanticGraphManager as any).addRelationship = (rel: any) => {
            calls++;
            if (rel.type === 'contains') throw new Error('synthetic graph failure');
            return original(rel);
        };
        try {
            const res = new CreateFurnitureCommand(furnishPayload('furn-1', ROOM)).execute(ctx);
            expect(res.success).toBe(true);
            expect(calls).toBeGreaterThan(1);
        } finally {
            (semanticGraphManager as any).addRelationship = original;
        }
        // sitsOn still landed; only the contains edge is missing.
        expect(semanticGraphManager.getTargets('furn-1', 'sitsOn')).toEqual([LEVEL]);
        expect(semanticGraphManager.getTargets(ROOM, 'contains')).toEqual([]);
    });
});

describe('contains — C71 §1.2 semantic 6 (deletion)', () => {
    it('(c) undoing the create purges the containment edge — the room stops claiming a furniture item that no longer exists', () => {
        const ctx = makeCtx();
        const cmd = new CreateFurnitureCommand(furnishPayload('furn-1', ROOM));
        cmd.execute(ctx);
        expect(semanticGraphManager.getTargets(ROOM, 'contains')).toEqual(['furn-1']);

        cmd.undo(ctx);

        // The cascade purges every edge for the deleted element, source OR
        // target — so the room→furniture edge dies with the furniture.
        expect(semanticGraphManager.getTargets(ROOM, 'contains')).toEqual([]);
    });

    it('(c2) deleting the ROOM endpoint purges it too (either endpoint dying strands nothing)', () => {
        const ctx = makeCtx();
        new CreateFurnitureCommand(furnishPayload('furn-1', ROOM)).execute(ctx);

        semanticGraphManager.removeAllRelationshipsForElement(ROOM);

        expect(semanticGraphManager.getTargets(ROOM, 'contains')).toEqual([]);
        expect(semanticGraphManager.getRelationships('furn-1', 'contains')).toEqual([]);
    });
});
