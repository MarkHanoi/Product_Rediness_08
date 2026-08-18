// §FLOOR-FINISH-REFUSAL-HONESTY (the SWEEP) — the other zero-token responders
// that announced an outcome without consulting one.
//
// The founder's floor-finish report was one instance of a class: a deterministic
// chat reply composed from the RESOLVER'S SUMMARY rather than from what actually
// happened. `runLocal` in ZeroTokenChatBridge ends every non-failing branch with
// `hooks.say(\`${r.summary}. (resolved without AI tokens)\`)`, and three of its
// branches could not fail by construction — because they threw their results
// away:
//
//   • `undo`  — `performUndo()` returns a four-state `UndoOutcome` whose own doc
//     says "'nothing to undo', 'I reverted something' and 'an entry is pending
//     and I could NOT revert it' are no longer the same value". The bridge
//     called it for effect and discarded the value, so "undo that" on an empty
//     history replied "Undid the last action." — past tense, about nothing.
//   • `redo`  — the exact mirror.
//   • `setActiveLevel` — wrote `projectContext.activeLevelId` behind an
//     `if (w.projectContext)` and reported "Switched the active level to X"
//     whether or not that branch was taken.
//
// These assert on the STRING the chat says, for the same reason the floor suite
// does: the outcome types were already right in production.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tryHandleZeroToken, resetZeroTokenConversation } from '../ZeroTokenChatBridge';

const undoOutcome = vi.hoisted(() => ({ value: { status: 'undone' } as Record<string, unknown> }));
const redoOutcome = vi.hoisted(() => ({ value: { status: 'redone' } as Record<string, unknown> }));

vi.mock('@app/engine/undo/performUndoRedo.js', () => ({
    performUndo: () => undoOutcome.value,
    performRedo: () => redoOutcome.value,
}));

interface TestWindow {
    selectionManager?: unknown;
    bimManager?: unknown;
    projectContext?: { activeLevelId?: string | null };
    runtime?: unknown;
}
const testWindow = (): TestWindow => window as unknown as TestWindow;

function installFacets(opts: { projectContext?: boolean } = {}): void {
    const w = testWindow();
    w.selectionManager = { selectedObject: null };
    w.bimManager = {
        getLevels: () => [
            { id: 'L0', name: 'Level 0', elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
        ],
    };
    if (opts.projectContext === false) delete w.projectContext;
    else w.projectContext = { activeLevelId: 'L0' };
    w.runtime = { bus: { executeCommand: vi.fn() }, events: { emit: vi.fn(), on: vi.fn() } };
}

function makeHooks() {
    const said: string[] = [];
    return {
        said,
        hooks: {
            say: (text: string) => { said.push(text); },
            confirm: () => Promise.resolve(true),
        },
    };
}

beforeEach(() => {
    resetZeroTokenConversation();
    undoOutcome.value = { status: 'undone', path: 'ring-buffer', stores: [], ids: [] };
    redoOutcome.value = { status: 'redone', path: 'ring-buffer', stores: [] };
    installFacets();
});

afterEach(() => {
    const w = testWindow();
    delete w.runtime;
    delete w.projectContext;
    delete w.bimManager;
    delete w.selectionManager;
});

describe('§SWEEP undo — "Undid the last action" is only said when something WAS undone', () => {
    it('an empty history is reported as nothing to undo, not as an undo', async () => {
        undoOutcome.value = { status: 'nothing-to-undo' };
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('undo that', hooks);
        const reply = said.join('\n');

        expect(handled).toBe(true);
        expect(reply).not.toMatch(/Undid the last action/i);
        expect(reply).toMatch(/nothing to undo/i);
    });

    it('a STRANDED entry says so, and says nothing was changed', async () => {
        // The state the undo layer added a name for: an entry IS pending and this
        // call could not consume it. Reporting that as a completed undo tells the
        // user their change is gone when it is still there.
        undoOutcome.value = {
            status: 'stranded',
            reason: 'no applyPatch adapter for store(s) [door] (C03 §4.8)',
            stores: ['door'],
        };
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('undo that', hooks);
        const reply = said.join('\n');

        expect(reply).not.toMatch(/Undid the last action/i);
        expect(reply).toContain('applyPatch adapter');
        expect(reply).toMatch(/nothing was changed/i);
    });

    it('a REAL undo still reads as an undo', async () => {
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('undo that', hooks);

        expect(said.join('\n')).toMatch(/Undid the last action/i);
    });
});

describe('§SWEEP redo — the mirror', () => {
    it('an empty redo stack is reported as nothing to redo', async () => {
        redoOutcome.value = { status: 'nothing-to-redo' };
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('redo that', hooks);
        const reply = said.join('\n');

        expect(reply).not.toMatch(/Redid the last undone action/i);
        expect(reply).toMatch(/nothing to redo/i);
    });

    it('a REAL redo still reads as a redo', async () => {
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('redo that', hooks);

        expect(said.join('\n')).toMatch(/Redid the last undone action/i);
    });
});

describe('§SWEEP setActiveLevel — a switch that did not happen is not reported as one', () => {
    it('with no project context open, the chat does NOT claim the level moved', async () => {
        installFacets({ projectContext: false });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('go to level 1', hooks);

        if (handled) {
            const reply = said.join('\n');
            expect(reply).not.toMatch(/Switched the active level/i);
            expect(reply).toMatch(/not (open|changed)/i);
        }
    });

    it('with a project open, the level really moves and the reply says so', async () => {
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('go to level 1', hooks);

        expect(testWindow().projectContext?.activeLevelId).toBe('L1');
        expect(said.join('\n')).toMatch(/Switched the active level to Level 1/i);
    });
});
