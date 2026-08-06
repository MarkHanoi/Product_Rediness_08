// §FIX-HOSTED-TYPE-CHANGE (L-620) — the door/window members of the uniform
// "change element type" contract (ADR-0105).
//
// THE DEFECT THESE PIN: the properties-panel Door/Window Type dropdown routed
// `element.changeType` to the plugin-bus `door.setType` / `window.setType` handlers,
// which produceCommand against the DETACHED plugin Immer DTO store. For a PLACED door
// that store has no record, so canExecute returned "door not found: <id>" and NOTHING
// changed — not the type, not the mesh, not even the host-wall rebuild nudge (it sat in
// the rejected promise's `.then`). These tests drive the LEGACY commands that now own
// the swap, against the REAL geometry stores the builders subscribe to.
//
// Contract guarantees asserted, per family:
//   (1) the type is swapped and PERSISTED in the store the builders read;
//   (2) the store emits 'update' → the mesh rebuild is triggered;
//   (3) C15 — the element id, openingId, host wallId and the structural void
//       (offset / width / height / sillHeight) are UNCHANGED, so the host wall's CSG
//       opening is never disturbed and the hosted relationship survives;
//   (4) undo restores the EXACT prior record (including back to UNTYPED — which a
//       merge-patch could not express, hence `replace()`); redo re-applies it;
//   (5) the element id is stable throughout;
//   (6) the command serialises for collaboration replay.

import { describe, it, expect, beforeEach } from 'vitest';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { UpdateDoorSystemTypeCommand } from '../src/doors/UpdateDoorSystemTypeCommand';
import { UpdateWindowSystemTypeCommand } from '../src/windows/UpdateWindowSystemTypeCommand';
import type { CommandContext } from '../src/types';

const ctx = {} as unknown as CommandContext;   // both commands own their store access

/** Two distinct catalogue types of the family, or `null` when the catalogue is too
 *  small to express a swap (a finding, not a silent skip). */
function twoTypes(all: readonly { id: string }[]): [string, string] | null {
    return all.length >= 2 ? [all[0].id, all[1].id] : null;
}

describe('UpdateDoorSystemTypeCommand — §FIX-HOSTED-TYPE-CHANGE (L-620)', () => {
    const DOOR_ID = 'test-door-typechange-1';

    beforeEach(() => {
        if (doorStore.has(DOOR_ID)) doorStore.remove(DOOR_ID);
        doorStore.add({
            id: DOOR_ID,
            openingId: 'op-1',
            wallId: 'wall-1',
            offset: 1.25,
            width: 0.9,
            height: 2.1,
            sillHeight: 0,
            doorType: 'single',
        } as never);
    });

    it('the catalogue can express a swap (two built-in types exist)', () => {
        expect(twoTypes(doorSystemTypeStore.getAll())).not.toBeNull();
    });

    it('swaps systemTypeId in the GEOMETRY store, emits update, and preserves id + host + void', () => {
        const pair = twoTypes(doorSystemTypeStore.getAll())!;
        const target = pair[0];

        const before = doorStore.getById(DOOR_ID)!;
        expect(before.systemTypeId).toBeUndefined();   // the pre-swap record is untyped

        // (2) the rebuild trigger: DoorBuilder subscribes to exactly this event.
        const events: string[] = [];
        const unsub = doorStore.subscribe((e) => { events.push(e); });

        const cmd = new UpdateDoorSystemTypeCommand({ doorId: DOOR_ID, systemTypeId: target });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        unsub?.();

        const after = doorStore.getById(DOOR_ID)!;
        expect(after.systemTypeId).toBe(target);                       // (1)
        expect(events).toContain('update');                            // (2)
        expect(after.id).toBe(DOOR_ID);                                // (3)(5) stable id
        expect(after.openingId).toBe(before.openingId);
        expect(after.wallId).toBe(before.wallId);
        expect(after.offset).toBe(before.offset);                      // the void is inviolate
        expect(after.width).toBe(before.width);
        expect(after.height).toBe(before.height);
        expect(after.sillHeight).toBe(before.sillHeight);
        // The type must actually reach the finish fields the builders + schedules read.
        const t = doorSystemTypeStore.getById(target)!;
        expect(after.frameColor).toBe(t.frameFinish.materialColor);
        expect(after.leafColor).toBe(t.leafFinish.materialColor);
    });

    it('undo restores the EXACT prior record (back to UNTYPED) and redo re-applies — id stable', () => {
        const [a, b] = twoTypes(doorSystemTypeStore.getAll())!;

        const first = new UpdateDoorSystemTypeCommand({ doorId: DOOR_ID, systemTypeId: a });
        first.execute(ctx);
        expect(doorStore.getById(DOOR_ID)!.systemTypeId).toBe(a);

        const second = new UpdateDoorSystemTypeCommand({ doorId: DOOR_ID, systemTypeId: b });
        second.execute(ctx);
        expect(doorStore.getById(DOOR_ID)!.systemTypeId).toBe(b);

        expect(second.undo(ctx).success).toBe(true);
        expect(doorStore.getById(DOOR_ID)!.systemTypeId).toBe(a);      // (4) previous type
        expect(doorStore.getById(DOOR_ID)!.id).toBe(DOOR_ID);          // (5)

        expect(first.undo(ctx).success).toBe(true);
        // replace(), not update(): the field is UNSET again, which a merge cannot do.
        expect(doorStore.getById(DOOR_ID)!.systemTypeId).toBeUndefined();

        // Redo = re-execute the same command object (the CommandManager contract).
        first.execute(ctx);
        expect(doorStore.getById(DOOR_ID)!.systemTypeId).toBe(a);
        expect(doorStore.getById(DOOR_ID)!.id).toBe(DOOR_ID);
    });

    it('REFUSES an unresolvable type instead of inventing one, and leaves the record untouched', () => {
        const cmd = new UpdateDoorSystemTypeCommand({ doorId: DOOR_ID, systemTypeId: 'dt-does-not-exist' });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(doorStore.getById(DOOR_ID)!.systemTypeId).toBeUndefined();
    });

    it('rejects an unknown door id', () => {
        const cmd = new UpdateDoorSystemTypeCommand({ doorId: 'no-such-door', systemTypeId: 'x' });
        expect(cmd.canExecute(ctx).ok).toBe(false);
    });

    it('serialises for collaboration replay', () => {
        const [a] = twoTypes(doorSystemTypeStore.getAll())!;
        const s = new UpdateDoorSystemTypeCommand({ doorId: DOOR_ID, systemTypeId: a }).serialize();
        expect(s.type).toBe('UPDATE_DOOR_SYSTEM_TYPE');
        expect(s.targetIds).toEqual([DOOR_ID]);
        expect(s.payload).toMatchObject({ doorId: DOOR_ID, systemTypeId: a });
    });
});

describe('UpdateWindowSystemTypeCommand — §FIX-HOSTED-TYPE-CHANGE (L-620)', () => {
    const WIN_ID = 'test-window-typechange-1';

    beforeEach(() => {
        if (windowStore.has(WIN_ID)) windowStore.remove(WIN_ID);
        windowStore.add({
            id: WIN_ID,
            openingId: 'op-w1',
            wallId: 'wall-1',
            offset: 2.0,
            width: 1.2,
            height: 1.4,
            sillHeight: 0.9,
            windowType: 'single',
        } as never);
    });

    it('the catalogue can express a swap (two built-in types exist)', () => {
        expect(twoTypes(windowSystemTypeStore.getAll())).not.toBeNull();
    });

    it('swaps systemTypeId in the GEOMETRY store, emits update, and preserves id + host + void', () => {
        const target = twoTypes(windowSystemTypeStore.getAll())![0];
        const before = windowStore.getById(WIN_ID)!;

        const events: string[] = [];
        const unsub = windowStore.subscribe((e) => { events.push(e); });

        const cmd = new UpdateWindowSystemTypeCommand({ windowId: WIN_ID, systemTypeId: target });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        unsub?.();

        const after = windowStore.getById(WIN_ID)!;
        expect(after.systemTypeId).toBe(target);
        expect(events).toContain('update');
        expect(after.id).toBe(WIN_ID);
        expect(after.openingId).toBe(before.openingId);
        expect(after.wallId).toBe(before.wallId);
        expect(after.offset).toBe(before.offset);
        expect(after.width).toBe(before.width);
        expect(after.height).toBe(before.height);
        expect(after.sillHeight).toBe(before.sillHeight);
        const t = windowSystemTypeStore.getById(target)!;
        expect(after.frameColor).toBe(t.frameFinish.materialColor);
    });

    it('undo restores the EXACT prior record and redo re-applies — id stable', () => {
        const [a, b] = twoTypes(windowSystemTypeStore.getAll())!;

        const first = new UpdateWindowSystemTypeCommand({ windowId: WIN_ID, systemTypeId: a });
        first.execute(ctx);
        const second = new UpdateWindowSystemTypeCommand({ windowId: WIN_ID, systemTypeId: b });
        second.execute(ctx);
        expect(windowStore.getById(WIN_ID)!.systemTypeId).toBe(b);

        second.undo(ctx);
        expect(windowStore.getById(WIN_ID)!.systemTypeId).toBe(a);
        first.undo(ctx);
        expect(windowStore.getById(WIN_ID)!.systemTypeId).toBeUndefined();
        expect(windowStore.getById(WIN_ID)!.id).toBe(WIN_ID);

        first.execute(ctx);
        expect(windowStore.getById(WIN_ID)!.systemTypeId).toBe(a);
    });

    it('REFUSES an unresolvable type instead of inventing one', () => {
        const cmd = new UpdateWindowSystemTypeCommand({ windowId: WIN_ID, systemTypeId: 'wt-does-not-exist' });
        expect(cmd.canExecute(ctx).ok).toBe(false);
        expect(windowStore.getById(WIN_ID)!.systemTypeId).toBeUndefined();
    });

    it('serialises for collaboration replay', () => {
        const [a] = twoTypes(windowSystemTypeStore.getAll())!;
        const s = new UpdateWindowSystemTypeCommand({ windowId: WIN_ID, systemTypeId: a }).serialize();
        expect(s.type).toBe('UPDATE_WINDOW_SYSTEM_TYPE');
        expect(s.targetIds).toEqual([WIN_ID]);
    });
});
