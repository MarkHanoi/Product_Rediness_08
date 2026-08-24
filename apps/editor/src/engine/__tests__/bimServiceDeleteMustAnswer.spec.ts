/**
 * §DELETE-MUST-ANSWER (L-1403) — the Delete BUTTON discarded its own result.
 *
 * FOUNDER-REPORTED, live, 2026-08-24: *"Also the slab can not be deleted? why?"*
 * His snapshot line climbed to `25 elements, 1 levels, 16 walls, **8 slabs**` while
 * he retried, and his screenshot shows a large grey slab he cannot get rid of.
 *
 * ⚠ TWO OF THE THREE LEADS WE STARTED WITH ARE REFUTED, AND THE REFUTATIONS ARE
 * WORTH MORE THAN THE GUESSES:
 *
 *  1. "`type=Slab` capitalised vs `type=wall` lowercase falls through a lowercase
 *     switch" — **REFUTED.** `SlabFragmentBuilder.ts:546` really does mint
 *     `elementType: 'Slab'`, but every delete branch normalises before testing
 *     (`plugins/view/src/handlers/DeleteElement.ts:125`
 *     `(cmd.elementType ?? '').toLowerCase()`), and the command that actually does
 *     the work — `DeleteElementCommand` — **never reads a type string at all**: it
 *     self-discovers by store probe (`stores.slabStore?.getById?.(id)`). Capitals
 *     are also the NORM for half the families (`Column`, `Handrail`, `Furniture`),
 *     and those delete fine.
 *  2. "no `DELETE_SLAB` in the log, so the delete never dispatched" — **REFUTED, it
 *     is a NON-SYMPTOM.** `DeleteSlabCommand` is invoked as a DELEGATE from
 *     `DeleteElementCommand` (`:462-464`), never through the manager, so
 *     `[CommandManager] EXECUTE:` never prints it. A fully working slab delete logs
 *     `EXECUTE: DELETE_ELEMENT` and nothing else.
 *  3. The `toolState === 'DRAWING'` guard at `initUI.ts:3438` is **DEAD CODE** —
 *     `getToolState()` is called with NO ARGUMENT while
 *     `ToolManager.getToolState(toolName)` requires one, so
 *     `toolRegistry.get(undefined)` returns undefined and the guard returns `null`
 *     every time. It has never once suppressed anything. (Left switched OFF
 *     deliberately: turning it on now would NEWLY block deletes while a tool is
 *     armed, which is not a change to make under a live founder.)
 *
 * ⭐ WHAT THE EVIDENCE DOES POINT AT. His log carries
 * `[§SELECT-CLEARED] reason=unspecified id=4fd18c72-… type=Slab`. `reason=unspecified`
 * is `SelectionManager.unselectAll`'s DEFAULT parameter — and `BimService.deleteSelected()`
 * is the one delete route that calls it with no argument. So that line IS the delete
 * attempt, and it fires **unconditionally, after a result nobody looked at**:
 *
 *     const result = manager.execute(command);   // ← result DISCARDED
 *     this.selectionManager.unselectAll();       // ← runs either way
 *
 * If `DeleteElementCommand.canExecute` refuses — its terminal refusal is
 * `Element ${id} not found in any store` — the user sees the highlight vanish and
 * the slab stay, with no error anywhere. That is exactly "the slab can not be
 * deleted", and it is exactly the shape §CENSUS-DELETESELECTED (L-1109) closed for
 * the KEYBOARD route in `initUI` and left open here.
 *
 * `BimService.deleteSelected()` is the shared sink for THREE of the user's routes:
 * the ContextualEditBar Delete button, its own `Del` key, and the SelectionOverlay
 * Delete item.
 *
 * ⛔ WHAT THIS TEST DOES NOT CLAIM. It does not establish that the founder's delete
 * refused rather than succeeded-and-failed-to-remove; only his
 * `[CommandManager] EXECUTE: DELETE_ELEMENT` / `REFUSED DELETE_ELEMENT` line can
 * settle that, and it was not in the excerpt we were given. What it DOES establish
 * is that a refusal here is invisible today, which is why the question could not be
 * answered from his console in the first place.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BimService } from '../BimService';

type Toast = { message: string; severity?: string };

interface Harness {
    svc: BimService;
    toasts: Toast[];
    warnings: string[];
    /** The fake model. Delete removes from here ONLY when the command succeeds. */
    slabIds: string[];
    unselectCalls: string[];
}

/**
 * A command manager whose `execute` answers exactly as the real one does:
 * `{ success: false, error }` on a refusal, `{ success: true }` on a real delete.
 */
function makeHarness(opts: {
    selected: Record<string, unknown> | null;
    outcome: 'success' | 'refusal' | 'no-manager';
    refusalText?: string;
}): Harness {
    const toasts: Toast[] = [];
    const warnings: string[] = [];
    const unselectCalls: string[] = [];
    const slabIds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']; // the founder's 8

    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
        warnings.push(a.map(String).join(' '));
    });

    (globalThis as unknown as { window: Record<string, unknown> }).window.runtime = {
        events: {
            emit: (k: string, p: Toast) => { if (k === 'pryzm:toast') toasts.push(p); },
        },
    };

    const selectionManager = {
        selectedObject: opts.selected,
        unselectAll: (reason?: string) => {
            unselectCalls.push(reason ?? 'unspecified');
            selectionManager.selectedObject = null;
        },
        // ⚠ NOTE: no `deleteSelected` method — the real SelectionManager has none
        // either. `BimService` used to call it in the no-manager branch, which is a
        // guaranteed TypeError, never a delete.
    };

    const commandManager = opts.outcome === 'no-manager' ? null : {
        execute: (cmd: { elementId?: string; id?: string }) => {
            if (opts.outcome === 'refusal') {
                return { success: false, error: opts.refusalText ?? 'Element s8 not found in any store' };
            }
            const id = (cmd as unknown as { elementId?: string }).elementId
                ?? (opts.selected?.userData as { id?: string } | undefined)?.id;
            const i = slabIds.indexOf(String(id));
            if (i >= 0) slabIds.splice(i, 1);
            return { success: true };
        },
    };

    const svc = new BimService({
        bimManager: {},
        wallTool: {},
        slabTool: {},
        selectionManager,
        toolManager: { commandManager },
    });
    // The getter falls back to `window.commandManager` — keep it null so the
    // no-manager arm is genuinely reachable.
    (globalThis as unknown as { window: Record<string, unknown> }).window.commandManager =
        opts.outcome === 'no-manager' ? undefined : commandManager;

    return { svc, toasts, warnings, slabIds, unselectCalls };
}

const SELECTED_SLAB = {
    userData: { id: 's8', elementType: 'Slab', type: 'slab' },
};

beforeEach(() => { vi.restoreAllMocks(); });

describe('§DELETE-MUST-ANSWER — a delete that cannot proceed must SAY SO', () => {
    it('THE COUNT MOVES on a real delete: 8 slabs → 7, and the selection clears', () => {
        // The control. This is what a working delete looks like, and it must keep
        // working — the fix must not turn a success into a refusal.
        const h = makeHarness({ selected: SELECTED_SLAB, outcome: 'success' });
        expect(h.slabIds).toHaveLength(8);
        h.svc.deleteSelected();
        expect(h.slabIds).toHaveLength(7);
        expect(h.slabIds).not.toContain('s8');
        expect(h.unselectCalls).toHaveLength(1);
    });

    it('FAILS ON HEAD: a REFUSED delete says nothing at all — and clears the selection anyway', () => {
        const h = makeHarness({
            selected: SELECTED_SLAB,
            outcome: 'refusal',
            refusalText: 'Element s8 not found in any store',
        });
        h.svc.deleteSelected();

        // The count correctly does not move — the command refused.
        expect(h.slabIds).toHaveLength(8);

        // ⭐ BEFORE THE FIX both of these fail: zero toasts, zero warnings, and the
        // selection was cleared regardless — the founder's `§SELECT-CLEARED
        // reason=unspecified type=Slab` over a slab that did not go away.
        expect(h.toasts).toHaveLength(1);
        expect(h.toasts[0]!.message).toContain('not found in any store');
        expect(h.warnings.join('\n')).toContain('§DELETE-MUST-ANSWER');

        // ⛔ AND THE SELECTION SURVIVES. It is the user's only handle on the thing
        // that would not delete; clearing it takes the handle away and makes the
        // refusal indistinguishable from a success.
        expect(h.unselectCalls).toHaveLength(0);
    });

    it('FAILS ON HEAD: nothing selected is answered, not ignored', () => {
        const h = makeHarness({ selected: null, outcome: 'success' });
        h.svc.deleteSelected();
        expect(h.toasts).toHaveLength(1);
        expect(h.toasts[0]!.message.toLowerCase()).toContain('nothing is selected');
    });

    it('FAILS ON HEAD: a selection carrying no element id is answered, not ignored', () => {
        const h = makeHarness({
            selected: { userData: { elementType: 'Slab' } },
            outcome: 'success',
        });
        h.svc.deleteSelected();
        expect(h.slabIds).toHaveLength(8);
        expect(h.toasts).toHaveLength(1);
        expect(h.toasts[0]!.message).toContain('no element id');
    });

    it('FAILS ON HEAD: no command manager is answered — it used to call a method that does not exist', () => {
        // `SelectionManager` has no `deleteSelected`; the old fallback was a
        // guaranteed TypeError, i.e. never a delete under any circumstance.
        const h = makeHarness({ selected: SELECTED_SLAB, outcome: 'no-manager' });
        expect(() => h.svc.deleteSelected()).not.toThrow();
        expect(h.slabIds).toHaveLength(8);
        expect(h.toasts).toHaveLength(1);
        expect(h.toasts[0]!.message).toContain('command manager');
    });

    it('the successful clear NAMES ITSELF, so a delete-driven clear is legible in the log', () => {
        // `reason=unspecified` in the founder's console is what made this route
        // indistinguishable from every other selection clear.
        const h = makeHarness({ selected: SELECTED_SLAB, outcome: 'success' });
        h.svc.deleteSelected();
        expect(h.unselectCalls).toEqual(['deleted']);
    });
});
