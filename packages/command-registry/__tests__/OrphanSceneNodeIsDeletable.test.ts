/**
 * ⭐ §FIX-ORPHANED-HOSTED-MESH (L-3404, founder 2026-08-22) — THE OTHER HALF: an object the
 * user can SELECT must be an object the user can REMOVE.
 *
 * The founder's console, verbatim:
 *
 *     [PickDiag] candidates=[Window:2f9fb49c@197.27, ...]        <- selectable
 *     [CommandManager] EXECUTE: DELETE_ELEMENT
 *     [CommandManager] REFUSED DELETE_ELEMENT: Element 2f9fb49c... not found in any store
 *
 * The refusal was CORRECT — no store held the record — and it had no "yes" branch behind
 * it, so he was left with a window he could click and could not delete. A refusal whose
 * escape hatch does not exist is a regression with a contract citation attached
 * ([[refusing-half-needs-its-escape-hatch]]).
 *
 * ⛔ THE ROOT IS FIXED SEPARATELY (L-3400: the builders' dispose() now cancels the queued
 * build, so this orphan can no longer be MINTED). This file guards the hatch, which covers
 * orphans already alive in a session and any future path that mints one — a class the
 * builder fix cannot close on its own.
 *
 * ⛔ IT ALSO GUARDS THE OPPOSITE DIRECTION, which is the more dangerous one: the hatch must
 * be the LAST branch, so a scene root can NEVER authorise a delete for an element that a
 * store still holds. §3 proves that with a live window.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { windowStore } from '@pryzm/geometry-window';
import { wallStore } from '@pryzm/geometry-wall';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';

const ORPHAN_ID = 'orphan-window-1';

/**
 * A minimal Object3D-shaped scene node. The registry only ever calls `parent?.remove(root)`
 * on it, so a structural stand-in exercises the real code path without dragging THREE into
 * a command-layer test — and, more to the point, lets the test ASSERT the detach happened.
 */
function fakeSceneNode() {
    const children: unknown[] = [];
    const parent = {
        children,
        remove(child: unknown) {
            const i = children.indexOf(child);
            if (i >= 0) children.splice(i, 1);
        },
    };
    const node = { name: `window-${ORPHAN_ID}`, userData: { id: ORPHAN_ID }, parent };
    children.push(node);
    return { node, parent };
}

function ctx(): any {
    return { stores: { wallStore }, bimManager: null };
}

beforeEach(() => {
    windowStore.clear?.();
    elementRegistry.unregisterRoot(ORPHAN_ID);
});

describe('§1 — ⭐ the orphan is DELETABLE, and the result says what it really was', () => {
    it('canExecute ACCEPTS an id that is in no store but has a scene root', () => {
        const { node } = fakeSceneNode();
        elementRegistry.registerRoot(ORPHAN_ID, node as never);

        const cmd = new DeleteElementCommand(ORPHAN_ID);
        expect(cmd.canExecute(ctx()).ok).toBe(true);
    });

    it('execute DETACHES the scene node and drops the registry entry', () => {
        const { node, parent } = fakeSceneNode();
        elementRegistry.registerRoot(ORPHAN_ID, node as never);
        expect(parent.children).toContain(node);   // non-vacuity: it really was attached

        const res = new DeleteElementCommand(ORPHAN_ID).execute(ctx());

        expect(res.success).toBe(true);
        expect(parent.children).not.toContain(node);          // ⭐ the scene graph, not a return value
        expect(elementRegistry.getRoot(ORPHAN_ID)).toBeUndefined();
    });

    it('⛔ it is reported as a STRAY OBJECT, never as a normal element delete', () => {
        const { node } = fakeSceneNode();
        elementRegistry.registerRoot(ORPHAN_ID, node as never);

        const res = new DeleteElementCommand(ORPHAN_ID).execute(ctx());
        const info = (res.info ?? []).join(' ').toLowerCase();
        expect(info).toContain('no store');
        expect(info).toContain('cannot be undone');
    });

    it('undo does not throw, and says WHY it restored nothing', () => {
        const { node } = fakeSceneNode();
        elementRegistry.registerRoot(ORPHAN_ID, node as never);

        const cmd = new DeleteElementCommand(ORPHAN_ID);
        cmd.execute(ctx());
        const undone = cmd.undo(ctx());

        expect(undone.success).toBe(true);
        expect((undone.info ?? []).join(' ').toLowerCase()).toContain('nothing to restore');
        // ⭐ AND IT CLAIMS NOTHING: an undo that restored no element must not report one.
        expect(undone.affectedElementIds).toEqual([]);
    });
});

describe('§2 — a genuinely absent id is still REFUSED (the hatch is not a blanket yes)', () => {
    it('no store record AND no scene root ⇒ the original refusal, unchanged', () => {
        const cmd = new DeleteElementCommand('never-existed');
        const v = cmd.canExecute(ctx());
        expect(v.ok).toBe(false);
        expect(String((v as { reason?: string }).reason)).toContain('not found in any store');
    });
});

describe('§3 — ⛔ THE DANGEROUS DIRECTION: a LIVE element is never reaped as an orphan', () => {
    // If the hatch could fire for an element a store still holds, it would detach a real
    // element's mesh behind its builder's back — strictly worse than the bug it fixes.
    // It cannot, because it is the LAST branch; this proves that rather than asserting it.
    const LEVEL = { id: 'level-0', name: 'Level 0', elevation: 0, height: 3 };
    const bimKernel: any = {
        getLevels: () => [LEVEL],
        getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
        registerElement: () => {},
    };

    it('a window present in the wall store takes the WINDOW branch, not the reap', () => {
        wallStore.attachEngine({} as never, bimKernel);
        wallStore.clear?.();
        wallStore.add({
            id: 'wall-live', type: 'wall',
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
            height: 3, thickness: 0.3, levelId: 'level-0',
        } as never);
        wallStore.addOpening('wall-live', {
            id: 'op-live', type: 'window', offset: 2, width: 1.2, height: 1.5,
            sillHeight: 0.9, elementId: 'win-live',
        } as never);

        // The live window ALSO has a scene root — this is the case that must not be confused.
        const children: unknown[] = [];
        const node = { name: 'window-win-live', userData: { id: 'win-live' }, parent: { children, remove(c: unknown) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); } } };
        children.push(node);
        elementRegistry.registerRoot('win-live', node as never);

        const res = new DeleteElementCommand('win-live').execute(ctx());

        expect(res.success).toBe(true);
        // ⭐ THE DISCRIMINATOR: the reap always emits its "no store" note. The window
        // branch emits none, so an empty info proves which branch ran.
        expect((res.info ?? []).join(' ')).not.toContain('no store');
        // and the real delete actually happened, so this is not passing vacuously
        expect(wallStore.getWindow('win-live')).toBeFalsy();
    });
});
