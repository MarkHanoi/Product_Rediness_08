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
