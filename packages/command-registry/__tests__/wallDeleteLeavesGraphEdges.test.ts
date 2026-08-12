// §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C7 — honest reports / graph
// integrity on delete) — deleting a wall-family element must purge its
// SemanticGraph edges, and undo must restore them.
//
// THE BUG: thirteen element kinds in DeleteElementCommand call
// semanticGraphManager.removeAllRelationshipsForElement on delete — the wall
// family (wall + cascaded window/door children, hosted window, hosted door,
// window-orphan, door-orphan) never did. Graph edges are NOT self-erasing: a
// well-formed edge pointing at a deleted id survives serialize()/deserialize()
// and persists forever. So every wall delete leaked its `hosts` edges, its
// children's `hostedBy` edges, any `boundedBy` edge a room authored against it,
// and any `supports` edge a beam authored against it — into persisted state.
//
// THE TEETH: these tests drive the REAL DeleteElementCommand against the REAL
// semanticGraphManager singleton (and real windowStore/doorStore singletons),
// seeding the exact edges the production writers author (CreateWallOpeningCommand
// writes hosts/hostedBy; DetectAllRooms writes boundedBy; CreateBeamCommand
// writes supports). On the OLD code, every "graph has NO edge referencing the
// deleted id" assertion FAILS — the edges survived the delete.
//
// UNDO SYMMETRY: the other kinds RE-CREATE their edges on undo (beam re-adds
// sitsOn/supports at DeleteElementCommand undo 'beam' case; furniture re-adds
// sitsOn; slab/column delegates re-add sitsOn) — so the wall family must too,
// or the fix would convert "stale edges forever" into "undo silently loses
// topology". The wall family restores VERBATIM from a pre-delete capture,
// because `boundedBy` (room→wall) and `supports` (wall→beam) are authored by
// OTHER elements' commands and cannot be reconstructed from the wall snapshot.

import { describe, it, expect, beforeEach } from 'vitest';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { windowStore } from '@pryzm/geometry-window';
import { doorStore } from '@pryzm/geometry-door';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

interface Opening {
    id: string; type: 'window' | 'door'; elementId: string;
    offset: number; width: number; height: number; sillHeight: number;
}
interface FakeWall {
    id: string; type: 'wall'; levelId: string;
    baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    height: number; thickness: number; openings: Opening[]; childrenIds: string[];
    _sourceBaseLine?: undefined;
}

function makeWall(id: string, lengthM: number): FakeWall {
    return {
        id, type: 'wall', levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: lengthM, y: 0, z: 0 }],
        height: 2.4, thickness: 0.2, openings: [], childrenIds: [],
    };
}

/**
 * Faithful wallStore double — same shape as windowDeleteLeavesMesh.test.ts's,
 * extended with add/remove/update so the WALL branch (not just the hosted
 * branches) runs end to end, including undo's wallStore.add(snapshot) and the
 * neighbour-baseline restore pass.
 */
function makeCtx(walls: FakeWall[]) {
    const byId = new Map(walls.map(w => [w.id, w]));
    const winIndex = new Map<string, { wallId: string; openingId: string; record: any }>();
    const doorIndex = new Map<string, { wallId: string; openingId: string; record: any }>();

    const wallStore = {
        getById: (id: string) => byId.get(id),
        getAll: () => [...byId.values()],
        add: (w: any) => { byId.set(w.id, w); },
        remove: (id: string) => {
            const w = byId.get(id);
            if (!w) return;
            // Real WallStore.remove() cascades to removeOpening() for children.
            for (const childId of w.childrenIds ?? []) {
                winIndex.delete(childId);
                doorIndex.delete(childId);
            }
            byId.delete(id);
        },
        update: (id: string, patch: any) => {
            const w = byId.get(id);
            if (w) Object.assign(w, patch);
        },
        getWindow: (id: string) => { const r = winIndex.get(id); return r ? { ...r.record } : undefined; },
        getDoor: (id: string) => { const r = doorIndex.get(id); return r ? { ...r.record } : undefined; },
        removeWindow: (id: string) => {
            const ref = winIndex.get(id);
            if (!ref) return;
            winIndex.delete(id);
            const w = byId.get(ref.wallId);
            if (w) w.openings = w.openings.filter(o => o.elementId !== id);
        },
        removeDoor: (id: string) => {
            const ref = doorIndex.get(id);
            if (!ref) return;
            doorIndex.delete(id);
            const w = byId.get(ref.wallId);
            if (w) w.openings = w.openings.filter(o => o.elementId !== id);
        },
        addWindow: (rec: any) => { winIndex.set(rec.id, { wallId: rec.wallId, openingId: rec.openingId, record: { ...rec } }); },
        addDoor: (rec: any) => { doorIndex.set(rec.id, { wallId: rec.wallId, openingId: rec.openingId, record: { ...rec } }); },
        restoreOpening: (wallId: string, opening: Opening) => {
            const w = byId.get(wallId);
            if (w && !w.openings.some(o => o.id === opening.id)) w.openings.push({ ...opening });
        },
        removeOpening: (wallId: string, openingId: string) => {
            const w = byId.get(wallId);
            if (w) w.openings = w.openings.filter(o => o.id !== openingId);
        },
        _hostDoor: (doorId: string, wallId: string, op: Opening, record: any) =>
            doorIndex.set(doorId, { wallId, openingId: op.id, record: { id: doorId, wallId, openingId: op.id, ...op, ...record } }),
        _hostWindow: (winId: string, wallId: string, op: Opening, record: any) =>
            winIndex.set(winId, { wallId, openingId: op.id, record: { id: winId, wallId, openingId: op.id, ...op, ...record } }),
    };
    const ctx = { stores: { wallStore }, bimManager: {} } as unknown as CommandContext;
    return { ctx, wallStore, byId };
}

/** Every edge in the live graph touching `id` as source OR target. */
function edgesTouching(id: string) {
    return semanticGraphManager.getRelationships(id);
}

/** True if NO edge anywhere in the graph references any of `ids`. */
function graphCleanOf(...ids: string[]): boolean {
    return ids.every(id => edgesTouching(id).length === 0);
}

const WALL_ID = 'w1';
const DOOR_ID = 'door-1';
const WIN_ID = 'win-1';
const ROOM_ID = 'room-1';
const BEAM_ID = 'beam-1';
const ALL_IDS = [WALL_ID, DOOR_ID, WIN_ID, ROOM_ID, BEAM_ID];

function seedProductionEdges() {
    // CreateWallOpeningCommand.ts:232/:238 — hosts + hostedBy for the door.
    semanticGraphManager.addRelationship({
        type: 'hosts', sourceId: WALL_ID, targetId: DOOR_ID,
        createdBy: 'CreateWallOpeningCommand', metadata: { openingId: 'op-d1' },
    });
    semanticGraphManager.addRelationship({
        type: 'hostedBy', sourceId: DOOR_ID, targetId: WALL_ID,
        createdBy: 'CreateWallOpeningCommand', metadata: { openingId: 'op-d1' },
    });
    // DetectAllRooms:151 — boundedBy (room → wall), authored by ANOTHER element's
    // command: invisible in the wall snapshot, only restorable from capture.
    semanticGraphManager.addRelationship({
        type: 'boundedBy', sourceId: ROOM_ID, targetId: WALL_ID,
        createdBy: 'DetectAllRoomsCommand', metadata: {},
    });
    // CreateBeamCommand:204 — supports (wall → beam), same property.
    semanticGraphManager.addRelationship({
        type: 'supports', sourceId: WALL_ID, targetId: BEAM_ID,
        createdBy: 'CreateBeamCommand', metadata: { role: 'startSupport' },
    });
}

function cleanSingletons() {
    for (const id of ALL_IDS) semanticGraphManager.removeAllRelationshipsForElement(id);
    for (const id of [DOOR_ID, WIN_ID]) {
        if (doorStore.has(id)) doorStore.remove(id);
        if (windowStore.has(id)) windowStore.remove(id);
    }
}

beforeEach(cleanSingletons);

describe('§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — wall delete purges edges; undo restores; redo purges again', () => {
    function setup() {
        const doorOp: Opening = { id: 'op-d1', type: 'door', elementId: DOOR_ID, offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 };
        const { ctx, wallStore, byId } = makeCtx([
            { ...makeWall(WALL_ID, 8), openings: [doorOp], childrenIds: [DOOR_ID] },
            makeWall('w2', 6), // neighbour — exercises the neighbour-snapshot path
        ]);
        doorStore.add({ id: DOOR_ID, openingId: 'op-d1', wallId: WALL_ID, offset: 2.0, width: 0.9, height: 2.1, sillHeight: 0 });
        (wallStore as any)._hostDoor(DOOR_ID, WALL_ID, doorOp, { doorType: 'single' });
        seedProductionEdges();
        // Pre-condition: the create path left hosts + hostedBy (+ boundedBy + supports).
        expect(edgesTouching(WALL_ID).length).toBe(4);
        expect(edgesTouching(DOOR_ID).length).toBe(2);
        return { ctx, byId };
    }

    it('THE TOOTH: after wall delete the graph holds NO edge referencing the wall OR its cascaded child', () => {
        const { ctx } = setup();
        const cmd = new DeleteElementCommand(WALL_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);

        // On the OLD code all four edges survived — this is the C7 gap.
        expect(graphCleanOf(WALL_ID, DOOR_ID)).toBe(true);
    });

    it('undo restores ALL four edges verbatim (hosts, hostedBy, boundedBy, supports) — including edges other elements authored', () => {
        const { ctx } = setup();
        const cmd = new DeleteElementCommand(WALL_ID);
        cmd.execute(ctx);
        expect(graphCleanOf(WALL_ID, DOOR_ID)).toBe(true);

        cmd.undo(ctx);

        const wallEdges = edgesTouching(WALL_ID);
        expect(wallEdges.length).toBe(4);
        const byType = (t: string) => wallEdges.filter(r => r.type === t);
        expect(byType('hosts')).toHaveLength(1);
        expect(byType('hosts')[0]).toMatchObject({ sourceId: WALL_ID, targetId: DOOR_ID });
        expect(byType('boundedBy')).toHaveLength(1);
        expect(byType('boundedBy')[0]).toMatchObject({ sourceId: ROOM_ID, targetId: WALL_ID, createdBy: 'DetectAllRoomsCommand' });
        expect(byType('supports')).toHaveLength(1);
        expect(byType('supports')[0]).toMatchObject({ sourceId: WALL_ID, targetId: BEAM_ID, metadata: { role: 'startSupport' } });
        const doorEdges = edgesTouching(DOOR_ID);
        expect(doorEdges.some(r => r.type === 'hostedBy' && r.sourceId === DOOR_ID && r.targetId === WALL_ID)).toBe(true);
    });

    it('redo purges again, second undo restores again — no duplication (addRelationship idempotency)', () => {
        const { ctx } = setup();
        const cmd = new DeleteElementCommand(WALL_ID);
        cmd.execute(ctx);
        cmd.undo(ctx);
        cmd.execute(ctx); // redo
        expect(graphCleanOf(WALL_ID, DOOR_ID)).toBe(true);
        cmd.undo(ctx);
        expect(edgesTouching(WALL_ID).length).toBe(4); // exactly 4, not 8
        expect(edgesTouching(DOOR_ID).length).toBe(2);
    });

    it('SAVE/RELOAD after delete: serialized graph is clean — the fix reaches persisted state, not just memory', () => {
        const { ctx } = setup();
        new DeleteElementCommand(WALL_ID).execute(ctx);

        // Persist exactly as ProjectSnapshot.semanticGraph does…
        const persisted = semanticGraphManager.serialize();
        expect(persisted.relationships.some(
            r => r.sourceId === WALL_ID || r.targetId === WALL_ID ||
                 r.sourceId === DOOR_ID || r.targetId === DOOR_ID,
        )).toBe(false);

        // …and reload: still no edge referencing the deleted wall or its child.
        semanticGraphManager.deserialize(persisted);
        expect(graphCleanOf(WALL_ID, DOOR_ID)).toBe(true);
    });
});

describe('§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — hosted WINDOW delete (branch 2) purges + undo restores', () => {
    function setup() {
        const winOp: Opening = { id: 'op-w1', type: 'window', elementId: WIN_ID, offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 };
        const { ctx, wallStore } = makeCtx([
            { ...makeWall(WALL_ID, 8), openings: [winOp], childrenIds: [WIN_ID] },
        ]);
        windowStore.add({ id: WIN_ID, openingId: 'op-w1', wallId: WALL_ID, offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 });
        (wallStore as any)._hostWindow(WIN_ID, WALL_ID, winOp, { windowType: 'fixed' });
        semanticGraphManager.addRelationship({
            type: 'hosts', sourceId: WALL_ID, targetId: WIN_ID,
            createdBy: 'CreateWallOpeningCommand', metadata: { openingId: 'op-w1' },
        });
        semanticGraphManager.addRelationship({
            type: 'hostedBy', sourceId: WIN_ID, targetId: WALL_ID,
            createdBy: 'CreateWallOpeningCommand', metadata: { openingId: 'op-w1' },
        });
        return { ctx };
    }

    it('delete purges hostedBy + the host wall\'s hosts edge; undo restores both; redo purges again', () => {
        const { ctx } = setup();
        const cmd = new DeleteElementCommand(WIN_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(graphCleanOf(WIN_ID)).toBe(true);
        expect(edgesTouching(WALL_ID).length).toBe(0); // the wall's hosts edge went too

        cmd.undo(ctx);
        expect(edgesTouching(WIN_ID).length).toBe(2);
        expect(edgesTouching(WIN_ID).some(r => r.type === 'hostedBy' && r.targetId === WALL_ID)).toBe(true);
        expect(edgesTouching(WIN_ID).some(r => r.type === 'hosts' && r.sourceId === WALL_ID)).toBe(true);

        cmd.execute(ctx); // redo
        expect(graphCleanOf(WIN_ID, WALL_ID)).toBe(true);
    });
});

describe('§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — hosted DOOR delete (branch 3) purges + undo restores', () => {
    it('delete purges; undo restores; redo purges', () => {
        const doorOp: Opening = { id: 'op-d1', type: 'door', elementId: DOOR_ID, offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0 };
        const { ctx, wallStore } = makeCtx([
            { ...makeWall(WALL_ID, 8), openings: [doorOp], childrenIds: [DOOR_ID] },
        ]);
        doorStore.add({ id: DOOR_ID, openingId: 'op-d1', wallId: WALL_ID, offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0 });
        (wallStore as any)._hostDoor(DOOR_ID, WALL_ID, doorOp, { doorType: 'single' });
        semanticGraphManager.addRelationship({
            type: 'hosts', sourceId: WALL_ID, targetId: DOOR_ID,
            createdBy: 'CreateWallOpeningCommand', metadata: { openingId: 'op-d1' },
        });
        semanticGraphManager.addRelationship({
            type: 'hostedBy', sourceId: DOOR_ID, targetId: WALL_ID,
            createdBy: 'CreateWallOpeningCommand', metadata: { openingId: 'op-d1' },
        });

        const cmd = new DeleteElementCommand(DOOR_ID);
        cmd.execute(ctx);
        expect(graphCleanOf(DOOR_ID, WALL_ID)).toBe(true);
        cmd.undo(ctx);
        expect(edgesTouching(DOOR_ID).length).toBe(2);
        cmd.execute(ctx);
        expect(graphCleanOf(DOOR_ID, WALL_ID)).toBe(true);
    });
});

describe('§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — ORPHAN branches (3b) purge + undo restores', () => {
    it('window-orphan: delete purges its hostedBy edge; undo restores it', () => {
        // Orphan = external windowStore only, NOT in wallStore.windows (L-82 desync).
        const { ctx } = makeCtx([makeWall(WALL_ID, 8)]);
        windowStore.add({ id: WIN_ID, openingId: 'op-w1', wallId: WALL_ID, offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 });
        semanticGraphManager.addRelationship({
            type: 'hostedBy', sourceId: WIN_ID, targetId: WALL_ID,
            createdBy: 'CreateWallOpeningCommand', metadata: {},
        });

        const cmd = new DeleteElementCommand(WIN_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(graphCleanOf(WIN_ID)).toBe(true);
        cmd.undo(ctx);
        expect(edgesTouching(WIN_ID).some(r => r.type === 'hostedBy' && r.targetId === WALL_ID)).toBe(true);
    });

    it('door-orphan: delete purges its hostedBy edge; undo restores it', () => {
        const { ctx } = makeCtx([makeWall(WALL_ID, 8)]);
        doorStore.add({ id: DOOR_ID, openingId: 'op-d1', wallId: WALL_ID, offset: 3.0, width: 0.9, height: 2.1, sillHeight: 0 });
        semanticGraphManager.addRelationship({
            type: 'hostedBy', sourceId: DOOR_ID, targetId: WALL_ID,
            createdBy: 'CreateWallOpeningCommand', metadata: {},
        });

        const cmd = new DeleteElementCommand(DOOR_ID);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(graphCleanOf(DOOR_ID)).toBe(true);
        cmd.undo(ctx);
        expect(edgesTouching(DOOR_ID).some(r => r.type === 'hostedBy' && r.targetId === WALL_ID)).toBe(true);
    });
});
