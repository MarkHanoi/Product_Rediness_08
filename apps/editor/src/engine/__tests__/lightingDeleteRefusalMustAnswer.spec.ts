/**
 * §LIGHT121 (L-11902) — C74 pin: a lighting delete that legitimately REFUSES
 * must SAY SO, never silently no-op.
 *
 * The founder's "I can't remove some lighting fixtures" root cause (measured in
 * `lightingBusBridgeBuildsMesh.spec.ts` / `busCreatedFixtureReachesMeshAndDeletes
 * .test.ts`) was a fixture that was never SELECTABLE at all — no mesh, so no
 * click/keyboard delete ever had a target. That is now fixed at the source (the
 * `lighting.created` bridge builds a mesh). This suite pins the OTHER half of
 * C74: once a lighting fixture IS selected and a delete genuinely cannot
 * proceed (the exact `DeleteLightingCommand.canExecute` refusal —
 * `Lighting element not found: <id>` — the shape `§DOOR125` already closed for
 * doors), that refusal must reach BOTH the console and the shared toast bus,
 * per `BimService.deleteSelected()`'s `§DELETE-MUST-ANSWER` (L-1403) contract.
 *
 * Runs the REAL `resolveDeleteCommand` → `DeleteLightingCommand` mapping (not a
 * stand-in): only the `CommandManager` shell and the `lightingStore` probe are
 * lightweight fakes, because `canExecute`'s actual refusal text is what this
 * suite asserts on, and a faked refusal could not falsify it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BimService } from '../BimService';
import { resolveDeleteCommand } from '@pryzm/command-registry';
import type { Command, CommandContext } from '@pryzm/command-registry';

type Toast = { message: string; severity?: string };

function makeContext(hasRecord: boolean): CommandContext {
    return {
        stores: { lightingStore: { has: () => hasRecord, get: () => undefined } },
        bimManager: { unregisterElement: () => {}, registerElement: () => {} },
    } as unknown as CommandContext;
}

describe('§LIGHT121 / L-11902 — DeleteLightingCommand refuses BY NAME, with the id', () => {
    it('canExecute refuses when the store has no such record', () => {
        const cmd = resolveDeleteCommand('missing-lamp-id', 'lighting');
        const result = cmd.canExecute(makeContext(false));
        expect(result.ok, 'a missing record must refuse, not silently proceed').toBe(false);
        expect(result.reason).toContain('missing-lamp-id');
        expect(result.reason).toContain('Lighting element not found');
    });

    it('canExecute allows when the record exists — the refusal is not unconditional', () => {
        const cmd = resolveDeleteCommand('real-lamp-id', 'lighting');
        const result = cmd.canExecute(makeContext(true));
        expect(result.ok, 'a real record must not be refused').toBe(true);
    });

    it('the "lighting" kind really does route to DeleteLightingCommand, not the generic DeleteElementCommand fallback', () => {
        const cmd = resolveDeleteCommand('x', 'lighting');
        expect(cmd.constructor.name).toBe('DeleteLightingCommand');
        // Case-insensitivity — `BimService` passes `userData.elementType` verbatim
        // (deliberately un-lowercased, per its own header) and `resolveDeleteCommand`
        // normalises it (`resolveDeleteCommand.ts:80`).
        expect(resolveDeleteCommand('x', 'Lighting').constructor.name).toBe('DeleteLightingCommand');
    });
});

describe('§LIGHT121 / L-11902 — BimService.deleteSelected() answers a real lighting refusal, on BOTH channels', () => {
    beforeEach(() => { vi.restoreAllMocks(); });

    it('a selected lighting fixture whose record is gone refuses via console.warn AND the toast bus — never silent', () => {
        const warnings: string[] = [];
        const toasts: Toast[] = [];
        vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
            warnings.push(a.map(String).join(' '));
        });

        const w = (globalThis as unknown as { window: Record<string, unknown> }).window;
        w.runtime = { events: { emit: (k: string, p: Toast) => { if (k === 'pryzm:toast') toasts.push(p); } } };

        const unselectCalls: string[] = [];
        const selectionManager = {
            // A fixture the founder's flow would have selected via the plan
            // symbol click (post-fix, now resolvable) — `elementType: 'Lighting'`,
            // matching what `LightingFragmentBuilder.add()` stamps on `userData`.
            selectedObject: { userData: { id: 'missing-lamp-id', elementType: 'Lighting' } },
            unselectAll: (reason?: string) => { unselectCalls.push(reason ?? 'unspecified'); },
        };

        // A CommandManager shell whose execute() defers to the REAL command's
        // own canExecute() — the refusal text under test is the command's, not
        // this shell's invention.
        const commandManager = {
            execute: (cmd: Command) => {
                const verdict = cmd.canExecute(makeContext(false));
                if (!verdict.ok) return { success: false, error: verdict.reason };
                return cmd.execute(makeContext(false));
            },
        };
        w.commandManager = commandManager;

        const svc = new BimService({
            bimManager: {}, wallTool: {}, slabTool: {},
            selectionManager, toolManager: { commandManager },
        });

        svc.deleteSelected();

        expect(warnings.some((w2) => w2.includes('DELETE-MUST-ANSWER')), 'the refusal must reach the console').toBe(true);
        expect(toasts, 'the refusal must reach the toast bus — the founder\'s eyes mid-gesture').toHaveLength(1);
        expect(toasts[0]!.message).toContain('Lighting');
        expect(toasts[0]!.message).toContain('missing-lamp-id');
        expect(toasts[0]!.severity).toBe('warning');
        // ⛔ On a refusal the selection SURVIVES — it is the user's only handle
        // on the thing that would not delete (§DELETE-MUST-ANSWER's own rule).
        expect(unselectCalls, 'a refusal must not clear the selection').toEqual([]);
    });

    it('control: the SAME fixture, with its record present, deletes cleanly and the selection clears', () => {
        const toasts: Toast[] = [];
        const w = (globalThis as unknown as { window: Record<string, unknown> }).window;
        w.runtime = { events: { emit: (k: string, p: Toast) => { if (k === 'pryzm:toast') toasts.push(p); } } };

        const unselectCalls: string[] = [];
        const selectionManager = {
            selectedObject: { userData: { id: 'real-lamp-id', elementType: 'Lighting' } },
            unselectAll: (reason?: string) => { unselectCalls.push(reason ?? 'unspecified'); },
        };
        const commandManager = {
            execute: (cmd: Command) => {
                const verdict = cmd.canExecute(makeContext(true));
                if (!verdict.ok) return { success: false, error: verdict.reason };
                return { success: true };
            },
        };
        w.commandManager = commandManager;

        const svc = new BimService({
            bimManager: {}, wallTool: {}, slabTool: {},
            selectionManager, toolManager: { commandManager },
        });
        svc.deleteSelected();

        expect(toasts, 'a successful delete must not toast a refusal').toHaveLength(0);
        expect(unselectCalls).toEqual(['deleted']);
    });
});
