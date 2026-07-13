// @vitest-environment happy-dom
//
// §G8-VIEW-LIFECYCLE — I2: CREATE / RENAME / DELETE A VIEW THROUGH THE COMMAND BUS.
//
// P6 says commands are the only mutation path, so "view management works" means
// exactly this: the payload the UI sends reaches the store, and each operation is
// ONE undo entry. This suite drives the REAL bridge registrations from
// initBusHandlers() (the handlers that actually win the bus registration — they are
// installed before registerViewHandlers(), and the bus is first-registration-wins),
// against the real command-registry commands and the real viewDefinitionStore.
// Only the CommandManager is a double, and it is a faithful one: canExecute → execute
// → push one undo entry.
//
// WHAT THIS SUITE CAUGHT (§FIX-VIEW-UPDATE-PAYLOAD-KEY):
//   ViewPropertiesPanel dispatches `view.updateDefinition` with `{ viewId, patch }` —
//   the shape declared in packages/command-bus/src/commands.ts ('view.updateDefinition':
//   { viewId: string; patch: Record<string, unknown> }). The bridge read `cmd.updates`.
//   So EVERY property-panel edit — rename, discipline, purpose, phase filter,
//   description — constructed `new UpdateViewDefinitionCommand(viewId, undefined)`,
//   whose canExecute() does `Object.keys(this.patch)` → TypeError, swallowed by the
//   bridge's catch. Renaming a view from the properties panel was a SILENT NO-OP.
//
// The bridge now accepts BOTH keys (`patch` canonical, `updates` legacy) — the L-222
// scope-drag commit (PlanViewInteraction, one command carrying spatial AND crop) rides
// on `updates` and is pinned below so it stays intact.
//
// Contract: C06 (view management), C03 §commands, C16 (command authoring).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initBusHandlers } from '@app/engine/initBusHandlers';
import {
    viewDefinitionStore,
    viewIntentInstanceStore,
    initViewDeletionCascade,
} from '@pryzm/core-app-model';

// ── A faithful CommandManager double: canExecute → execute → ONE undo entry ──────
interface Undoable {
    canExecute(ctx: unknown): { ok: boolean; reason?: string };
    execute(ctx: unknown): { success: boolean };
    undo(ctx: unknown): { success: boolean };
}
class FakeCommandManager {
    readonly stack: Undoable[] = [];
    readonly rejected: string[] = [];
    execute(cmd: Undoable): { success: boolean } {
        const v = cmd.canExecute({});
        if (!v.ok) {
            this.rejected.push(v.reason ?? 'rejected');
            return { success: false };
        }
        const r = cmd.execute({});
        if (r.success) this.stack.push(cmd);
        return r;
    }
    undo(): void {
        const cmd = this.stack.pop();
        cmd?.undo({});
    }
}

// ── A bus that behaves like the real one: first registration wins ───────────────
function makeBus() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers = new Map<string, any>();
    return {
        registry: { has: (t: string) => handlers.has(t) },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        register: (h: any) => {
            if (handlers.has(h.type)) throw new Error(`handler already registered: ${h.type}`);
            handlers.set(h.type, h);
        },
        executeCommand: (type: string, payload: unknown) => {
            const h = handlers.get(type);
            if (!h) throw new Error(`no handler for ${type}`);
            const v = h.canExecute({ stores: {} }, payload);
            if (!v.valid) throw new Error(v.reason);
            return h.execute({ stores: {} }, payload);
        },
        has: (t: string) => handlers.has(t),
    };
}

let cm: FakeCommandManager;
let bus: ReturnType<typeof makeBus>;

describe('§G8-VIEW-LIFECYCLE — I2: view CRUD through the command bus (P6)', () => {
    beforeEach(() => {
        viewDefinitionStore.reset();
        viewIntentInstanceStore.reset();
        initViewDeletionCascade();
        cm = new FakeCommandManager();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).commandManager = cm;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        bus = makeBus();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initBusHandlers({ bus } as any);
    });

    function createView(id: string, name = 'Level 3 Plan'): void {
        bus.executeCommand('view.createDefinition', {
            id, name, viewType: 'plan', spatial: { levelId: 'L3' },
        });
    }

    it('CREATE: view.createDefinition creates the view — ONE undo entry, undo removes it', () => {
        createView('vd-bus-1');

        expect(viewDefinitionStore.has('vd-bus-1')).toBe(true);
        expect(viewDefinitionStore.get('vd-bus-1')!.name).toBe('Level 3 Plan');
        expect(cm.stack).toHaveLength(1);          // exactly one undo entry

        cm.undo();
        expect(viewDefinitionStore.has('vd-bus-1')).toBe(false);
        expect(viewIntentInstanceStore.has('vd-bus-1')).toBe(false);  // no orphan left by undo
    });

    it('RENAME: view.updateDefinition with the { viewId, patch } payload the UI sends renames the view', () => {
        createView('vd-bus-2', 'Old Name');

        // The EXACT payload ViewPropertiesPanel._updateViewDef sends.
        bus.executeCommand('view.updateDefinition', { viewId: 'vd-bus-2', patch: { name: 'New Name' } });

        expect(viewDefinitionStore.get('vd-bus-2')!.name).toBe('New Name');
        expect(cm.rejected).toEqual([]);           // …and it was not silently rejected
        expect(cm.stack).toHaveLength(2);          // create + rename = ONE entry each

        cm.undo();                                  // undo the rename only
        expect(viewDefinitionStore.get('vd-bus-2')!.name).toBe('Old Name');
        expect(viewDefinitionStore.has('vd-bus-2')).toBe(true);
    });

    it('RENAME: the other property-panel edits (discipline / intent) also reach the store', () => {
        createView('vd-bus-3');
        bus.executeCommand('view.updateDefinition', {
            viewId: 'vd-bus-3',
            patch: { discipline: 'structural', intent: 'Setting-out plan' },
        });
        const def = viewDefinitionStore.get('vd-bus-3')!;
        expect(def.discipline).toBe('structural');
        expect(def.intent).toBe('Setting-out plan');
    });

    const DRAG_CROP = { enabled: true, region: { min: [-3, -3], max: [3, 3] }, farClip: { offset: 9 } };
    const DRAG_SPATIAL = { levelId: 'L3', cropRegion: { min: [-3, -3], max: [3, 3] } };

    /** The scope-drag commit from PlanViewInteraction — legacy `updates` key, ONE command. */
    function scopeDragCommit(viewId: string): void {
        bus.executeCommand('view.updateDefinition', {
            viewId, updates: { spatial: DRAG_SPATIAL, crop: DRAG_CROP },
        });
    }

    it('§PERF-ELEV-CROP-DRAG-FLOW (L-222) INVARIANT: one command carries BOTH spatial and crop, one undo entry', () => {
        createView('vd-bus-4');
        scopeDragCommit('vd-bus-4');

        const def = viewDefinitionStore.get('vd-bus-4')!;
        expect(def.crop).toEqual(DRAG_CROP);                              // the crop rides on the same command
        expect(def.spatial.cropRegion).toEqual(DRAG_SPATIAL.cropRegion);  // …and so does the spatial
        expect(cm.stack).toHaveLength(2);                                 // create + ONE drag commit

        cm.undo();                                                        // ONE undo entry for the whole drag
        expect(viewDefinitionStore.get('vd-bus-4')!.crop).toBeUndefined();
        expect(cm.stack).toHaveLength(1);
    });

    // §VIEW-UNDO-SPATIAL-MERGE-RESIDUE (G8) — KNOWN GAP, pinned as an executable guard.
    //
    // `UpdateViewDefinitionCommand.undo()` restores by calling
    // `viewDefinitionStore.update({ spatial: snap.spatial })`, and `update()` MERGES spatial
    // (`{ ...view.spatial, ...patch.spatial }`). A key the FORWARD patch ADDED — here
    // `cropRegion`, in production also `sectionVolume` / `sectionPlane` on the first scope-box
    // drag of an elevation — is simply ABSENT from the pre-command snapshot, so the merge cannot
    // remove it: it SURVIVES THE UNDO. `crop` is restored correctly (it is a replace-semantics
    // field); the spatial scope box is not, so the elevation stays scoped after Ctrl+Z.
    //
    // THE FIX is one line in packages/command-registry (owned by another agent this sprint):
    // undo() must call the replace-semantics `viewDefinitionStore.setSpatial(viewId, snap.spatial)`
    // — added for exactly this in ViewDefinitionStore — instead of `update({ spatial })`.
    // `it.fails` PASSES while the bug is live and turns RED the moment it is fixed, at which
    // point this guard is deleted and the assertion folded back into the test above.
    it.fails('KNOWN GAP §VIEW-UNDO-SPATIAL-MERGE-RESIDUE: undo leaves spatial keys the forward patch added', () => {
        createView('vd-bus-4b');
        scopeDragCommit('vd-bus-4b');
        cm.undo();
        expect(viewDefinitionStore.get('vd-bus-4b')!.spatial.cropRegion).toBeUndefined();
    });

    it('the replace-semantics setSpatial() DOES restore a view exactly (the shape undo must call)', () => {
        createView('vd-bus-4c');
        const before = viewDefinitionStore.get('vd-bus-4c')!.spatial;
        scopeDragCommit('vd-bus-4c');
        expect(viewDefinitionStore.get('vd-bus-4c')!.spatial.cropRegion).toBeTruthy();

        viewDefinitionStore.setSpatial('vd-bus-4c', before);

        expect(viewDefinitionStore.get('vd-bus-4c')!.spatial).toEqual(before);
        expect(viewDefinitionStore.get('vd-bus-4c')!.spatial.cropRegion).toBeUndefined();
    });

    it('DELETE: view.deleteDefinition removes the view + its dependent state; undo restores BOTH', () => {
        createView('vd-bus-5');
        expect(viewIntentInstanceStore.has('vd-bus-5')).toBe(true);   // CreateViewDefinitionCommand assigns an intent
        const intentBefore = viewIntentInstanceStore.get('vd-bus-5');

        bus.executeCommand('view.deleteDefinition', { viewId: 'vd-bus-5' });

        expect(viewDefinitionStore.has('vd-bus-5')).toBe(false);
        expect(viewIntentInstanceStore.has('vd-bus-5')).toBe(false);  // §FIX-VIEW-DELETE-ORPHANS
        expect(cm.stack).toHaveLength(2);                             // create + delete = ONE entry each

        cm.undo();
        expect(viewDefinitionStore.has('vd-bus-5')).toBe(true);
        expect(viewIntentInstanceStore.get('vd-bus-5')).toEqual(intentBefore);
    });

    it('an empty patch is REJECTED, not silently applied (no phantom undo entry)', () => {
        createView('vd-bus-6');
        expect(() => bus.executeCommand('view.updateDefinition', { viewId: 'vd-bus-6', patch: {} }))
            .toThrow(/patch/i);
        expect(cm.stack).toHaveLength(1);   // still just the create
    });
});
