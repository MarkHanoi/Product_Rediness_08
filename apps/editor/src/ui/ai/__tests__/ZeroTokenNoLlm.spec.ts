// ADR-0313 §NL — the zero-token bridge behavioural proof:
//
//  1. A naturally-phrased, locally-resolvable request ("Hey, could you make
//     this wall 3 meters tall?") dispatches through the command bus and the
//     LLM path (aiService.query) is NEVER invoked — the spy stays at 0 calls.
//  2. A destructive natural request renders the Confirm/Cancel card and
//     dispatches NOTHING until confirmed (and nothing at all on Cancel).
//  3. A free-form ask ("Make this apartment feel more spacious.") is NOT
//     handled — the bridge returns false, which is the ONLY path on which
//     AIPanel._executeSend proceeds to aiService.query.
//  4. A recognized-but-underspecified ask becomes a clarifying chat reply —
//     handled locally, still zero tokens.
//
// Environment: happy-dom (root vitest.config.ts). The window facets the
// bridge reads (selectionManager / bimManager / projectContext / runtime.bus)
// are stubbed exactly as the editor shell exposes them.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiService } from '@pryzm/ai-host';
import { tryHandleZeroToken, resetZeroTokenConversation } from '../ZeroTokenChatBridge';

interface TestWindowFacets {
    selectionManager?: { selectedObject?: unknown };
    bimManager?: { getLevels?: () => ReadonlyArray<{ id: string; name?: string; elevation?: number }> };
    projectContext?: { activeLevelId?: string | null };
    runtime?: {
        bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> };
        events?: { emit(name: string, payload: unknown): void };
    };
}
const testWindow = (): TestWindowFacets => window as unknown as TestWindowFacets;

function installFacets(selection?: { id: string; type: string }): {
    executeCommand: ReturnType<typeof vi.fn>;
} {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const w = testWindow();
    w.selectionManager = {
        selectedObject: selection !== undefined
            ? { userData: { id: selection.id, elementType: selection.type }, parent: null }
            : null,
    };
    w.bimManager = {
        getLevels: () => [
            { id: 'L0', name: 'Level 0', elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
        ],
    };
    w.projectContext = { activeLevelId: 'L0' };
    w.runtime = { bus: { executeCommand }, events: { emit: vi.fn() } };
    return { executeCommand };
}

function makeHooks(confirmAnswer = true) {
    const said: string[] = [];
    const confirm = vi.fn().mockResolvedValue(confirmAnswer);
    return {
        said,
        confirm,
        hooks: {
            say: (text: string) => { said.push(text); },
            confirm: (summary: string) => confirm(summary) as Promise<boolean>,
        },
    };
}

describe('ZeroTokenChatBridge — natural language, zero tokens (ADR-0313 §NL)', () => {
    let querySpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        resetZeroTokenConversation();
        vi.restoreAllMocks();
        querySpy = vi.spyOn(aiService, 'query').mockRejectedValue(
            new Error('aiService.query must NOT be called for locally resolvable requests'),
        );
    });

    it('"Hey, could you make this wall 3 meters tall?" dispatches locally — ZERO LLM calls', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('Hey, could you make this wall 3 meters tall?', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).toHaveBeenCalledTimes(1);
        expect(executeCommand).toHaveBeenCalledWith('wall.updateDimensions', { wallId: 'wall-1', height: 3 });
        expect(querySpy).not.toHaveBeenCalled(); // ← the zero-token proof
        expect(said.some((s) => s.includes('Done'))).toBe(true);
    });

    it('"Can you remove the doors I\'ve selected?" → Confirm card first, dispatch only after Confirm', async () => {
        const { executeCommand } = installFacets({ id: 'door-1', type: 'door' });
        const { hooks, confirm } = makeHooks(true);
        confirm.mockImplementation(() => {
            // At the moment the card is shown, NOTHING may have been dispatched.
            expect(executeCommand).not.toHaveBeenCalled();
            return Promise.resolve(true);
        });

        const handled = await tryHandleZeroToken("Can you remove the doors I've selected?", hooks);

        expect(handled).toBe(true);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(executeCommand).toHaveBeenCalledWith('element.delete', {
            elementId: 'door-1', elementType: 'door', source: 'AI_CHAT_ZERO_TOKEN',
        });
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('Cancel on the destructive card dispatches nothing and says so honestly', async () => {
        const { executeCommand } = installFacets({ id: 'door-1', type: 'door' });
        const { hooks, said } = makeHooks(false);

        const handled = await tryHandleZeroToken('could you get rid of the selected door?', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.some((s) => s.includes('Cancelled'))).toBe(true);
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('"Make the wall taller" (no amount) → clarifying question, handled locally, zero tokens', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('Make the wall taller', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.some((s) => s.toLowerCase().includes('height'))).toBe(true);
        expect(querySpy).not.toHaveBeenCalled();

        // …and answering the question completes the edit — still zero tokens.
        const handled2 = await tryHandleZeroToken('2700', hooks);
        expect(handled2).toBe(true);
        expect(executeCommand).toHaveBeenCalledWith('wall.updateDimensions', { wallId: 'wall-1', height: 2.7 });
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('follow-up across turns: "make this wall 3m tall" then "actually, make it 3.2m"', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks } = makeHooks();

        await tryHandleZeroToken('make this wall 3m tall', hooks);
        await tryHandleZeroToken('actually, make it 3.2m', hooks);

        expect(executeCommand).toHaveBeenNthCalledWith(1, 'wall.updateDimensions', { wallId: 'wall-1', height: 3 });
        expect(executeCommand).toHaveBeenNthCalledWith(2, 'wall.updateDimensions', { wallId: 'wall-1', height: 3.2 });
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('"Make this apartment feel more spacious." is NOT handled — the LLM seam stays open', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks } = makeHooks();

        const handled = await tryHandleZeroToken('Make this apartment feel more spacious.', hooks);

        expect(handled).toBe(false); // AIPanel only calls aiService.query on false
        expect(executeCommand).not.toHaveBeenCalled();
    });

    it('LIVE REPRO (build 70667276): the compound window sentence is ONE dispatch — no stale-id window', async () => {
        // "Make this window 2 meters height, 2 meters width and 0.1 meters sill
        // height" used to end in "window not found: b0a84065-…": a command
        // SEQUENCE let the first dimension change rebuild the host wall and
        // re-mint the opening id before the later commands dispatched. The fix
        // is the plan shape: one command carrying all the values.
        const { executeCommand } = installFacets({ id: 'win-1', type: 'window' });
        // Simulate the re-mint: after the FIRST dispatch, any further command
        // addressing the captured id dies exactly like production did.
        let dispatched = 0;
        executeCommand.mockImplementation((_type: string, payload: { elementId?: string; windowId?: string }) => {
            dispatched += 1;
            if (dispatched > 1 && (payload.elementId === 'win-1' || payload.windowId === 'win-1')) {
                return Promise.reject(new Error('canExecute rejected — window not found: win-1'));
            }
            return Promise.resolve(undefined);
        });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken(
            'Make this window 2 meters height, 2 meters width and 0.1 meters sill height', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).toHaveBeenCalledTimes(1); // ← the plan-shape proof
        expect(executeCommand).toHaveBeenCalledWith('element.updateParameters', {
            elementId: 'win-1', elementType: 'window',
            parameters: { height: 2, width: 2, sillHeight: 0.1 },
        });
        expect(said.some((s) => s.includes('did not complete'))).toBe(false);
        expect(said.some((s) => s.includes('Done'))).toBe(true);
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('a capability-gap ask ("paint the wall blue") is an honest refusal — handled, zero tokens', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('paint the wall blue', hooks);

        expect(handled).toBe(true); // refusal, NOT a fall-through to the LLM
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.some((s) => s.includes("isn't connected to chat yet"))).toBe(true);
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('a recognized-but-wrong-kind ask refuses locally — handled, zero tokens', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('set sill height to 1m', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.length).toBeGreaterThan(0);
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('follow-up level revision: "go to level 1" then "actually 0" switches again locally', async () => {
        installFacets();
        const { hooks } = makeHooks();
        const w = testWindow();

        await tryHandleZeroToken('go to level 1', hooks);
        expect(w.projectContext?.activeLevelId).toBe('L1');

        const handled = await tryHandleZeroToken('actually 0', hooks);
        expect(handled).toBe(true);
        expect(w.projectContext?.activeLevelId).toBe('L0');
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('a failed dispatch is reported as a failure, never dressed as success', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        executeCommand.mockRejectedValue(new Error('wall is locked'));
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('make this wall 3m tall', hooks);

        expect(handled).toBe(true);
        expect(said.some((s) => s.includes('did not complete'))).toBe(true);
        expect(said.some((s) => s.includes('Done'))).toBe(false);
        expect(querySpy).not.toHaveBeenCalled();
    });
});
