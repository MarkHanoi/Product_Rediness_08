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
        bus?: {
            // ⭐ §AI-ACTOR-STAMP (ADR-0324 §1-2) — the third argument is real, so the
            // stub declares it. A stub whose signature is narrower than the product's
            // teaches the suite that a dropped stamp is untestable.
            executeCommand(
                type: string,
                payload: unknown,
                opts?: { readonly context?: unknown },
            ): Promise<unknown>;
        };
        events?: { emit(name: string, payload: unknown): void };
    };
}
const testWindow = (): TestWindowFacets => window as unknown as TestWindowFacets;

/**
 * ⭐ §AI-ACTOR-STAMP (ADR-0324 §1-2 / C16 §6 / spec §76 gate D) — the invocation
 * envelope EVERY dispatch in `ZeroTokenChatBridge` now carries as its third
 * argument.
 *
 * It is ASSERTED here, not tolerated. Before it existed, an AI-authored edit and a
 * toolbar click were BYTE-IDENTICAL in the audit trail; "the same funnel" and
 * "indistinguishable" are different claims and only the first one is wanted. These
 * assertions used to read `toHaveBeenCalledWith(type, payload)` — a two-argument
 * match that a third argument fails — so the stamp landing turned seven green
 * dispatch proofs red without a single one of them being about the stamp.
 *
 * ⛔ SPELLED ONCE, ON PURPOSE. Inlining `{ context: … }` at each site would mean a
 * dropped stamp fails one assertion and a reviewer deletes one object; naming it
 * means the whole file moves together. `actor` says WHO, `origin` says WHERE, and
 * they stay separate (ADR-0324 §2: *"never stamp actorId='ai' as a substitute"*).
 */
const AI_STAMP = {
    context: { actor: { kind: 'ai' }, origin: { surface: 'chat' } },
} as const;

/**
 * §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the report event each batch bridge
 * ALWAYS broadcasts. The plugin handlers emit on the success path, on the
 * refusal path, when `window.commandManager` is missing and when the bridge
 * throws — there is no path on which one of these commands runs and stays
 * silent. The stub bus must therefore emit too: a command that declares a
 * report event and sends none is now classified INDETERMINATE (it used to be
 * read as `{ ok: true }` and rendered "Done"), so a silent stub would be
 * testing a state the product cannot produce.
 */
const STUB_REPORT_EVENTS: Readonly<Record<string, string>> = {
    'wall.updateColorBatch': 'pryzm-wall-color-batch-report',
    'wall.updateSystemTypeBatch': 'pryzm-wall-type-batch-report',
    'wall.updateRakeBatch': 'pryzm-wall-rake-batch-report',
    'wall.addLayerBatch': 'pryzm-wall-layer-batch-report',
    'window.updateSystemTypeBatch': 'pryzm-window-type-batch-report',
    'window.parametricCreate': 'pryzm-window-parametric-report',
    'door.updateSystemTypeBatch': 'pryzm-door-type-batch-report',
    'element.deleteBatch': 'pryzm-delete-batch-report',
    // §FEAT-BULK-DIMENSIONS (L-949) — mirrors BATCH_REPORT_EVENTS.
    'element.updateDimensionsBatch': 'pryzm-dimensions-batch-report',
    'wall.updateHeightBatch': 'pryzm-wall-height-batch-report',
    // §FIX-SIDEFINISH-REPORT-UNHEARD (L-996) — the three verbs whose handlers had
    // ALWAYS broadcast and which BATCH_REPORT_EVENTS never subscribed to. Mirrored
    // here in the same commit: a stub that stays silent where the real handler
    // reports would now drive the bridge into 'indeterminate' and test a state the
    // product cannot produce — which is what this stub's own header forbids.
    'wall.setSideFinishBatch': 'pryzm-wall-side-finish-batch-report',
    'slab.updateSystemTypeBatch': 'pryzm-slab-type-batch-report',
    'ceiling.updateSystemTypeBatch': 'pryzm-ceiling-type-batch-report',
    'generation.rooms': 'pryzm-generation-report',
    'generation.finish-chain': 'pryzm-generation-report',
    'generation.building': 'pryzm-generation-report',
    'generation.apartment': 'pryzm-generation-report',
};

/** Broadcast the report the real bridge would, for a command that has one. */
function emitStubReport(type: string, detail: { success: boolean; info: string[] }): void {
    const ev = STUB_REPORT_EVENTS[type];
    if (ev !== undefined) window.dispatchEvent(new CustomEvent(ev, { detail }));
}

function installFacets(selection?: { id: string; type: string }): {
    executeCommand: ReturnType<typeof vi.fn>;
} {
    const executeCommand = vi.fn().mockImplementation((type: string) => {
        emitStubReport(type, { success: true, info: [] });
        return Promise.resolve(undefined);
    });
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
        expect(executeCommand).toHaveBeenCalledWith('wall.updateDimensions', { wallId: 'wall-1', height: 3 }, AI_STAMP);
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
        }, AI_STAMP);
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
        expect(executeCommand).toHaveBeenCalledWith('wall.updateDimensions', { wallId: 'wall-1', height: 2.7 }, AI_STAMP);
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('follow-up across turns: "make this wall 3m tall" then "actually, make it 3.2m"', async () => {
        const { executeCommand } = installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks } = makeHooks();

        await tryHandleZeroToken('make this wall 3m tall', hooks);
        await tryHandleZeroToken('actually, make it 3.2m', hooks);

        expect(executeCommand).toHaveBeenNthCalledWith(1, 'wall.updateDimensions', { wallId: 'wall-1', height: 3 }, AI_STAMP);
        expect(executeCommand).toHaveBeenNthCalledWith(2, 'wall.updateDimensions', { wallId: 'wall-1', height: 3.2 }, AI_STAMP);
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
        }, AI_STAMP);
        expect(said.some((s) => s.includes('did not complete'))).toBe(false);
        expect(said.some((s) => s.includes('Done'))).toBe(true);
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('a capability-gap ask ("paint the door blue") is an honest refusal — handled, zero tokens', async () => {
        // §FEAT-WALL-COLOR-BATCH (ADR-0314): WALL colour is a live capability
        // now, so the representative gap moved to the DOOR, whose colour route
        // (door.setFrameColor) remains deliberately deferred.
        const { executeCommand } = installFacets({ id: 'door-1', type: 'door' });
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('paint the door blue', hooks);

        expect(handled).toBe(true); // refusal, NOT a fall-through to the LLM
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.some((s) => s.includes("isn't connected to chat yet"))).toBe(true);
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('§FEAT-WALL-COLOR-BATCH: "make all walls white" dispatches ONE batch command — zero tokens', async () => {
        const { executeCommand } = installFacets();
        const { hooks, said } = makeHooks();

        const handled = await tryHandleZeroToken('make all walls white', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).toHaveBeenCalledTimes(1);
        expect(executeCommand).toHaveBeenCalledWith('wall.updateColorBatch', {
            wallIds: 'all', materialColor: '#ffffff',
        }, AI_STAMP);
        expect(said.some((s) => s.includes('did not complete'))).toBe(false);
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

    // ── §PLAN (RAC U6) — compound sentences ─────────────────────────────────
    //
    // ONE Confirm card for the whole plan, ONE ordered dispatch pass, and an
    // undo cost that is the real one. The bridge proof that matters is the
    // ORDER and the STOPPING: a step that fails must take the rest of the plan
    // down with it and say how far it got.

    it('§PLAN: a two-step sentence shows ONE card listing both steps, then dispatches in order', async () => {
        const { executeCommand } = installFacets();
        const { hooks, said, confirm } = makeHooks(true);
        confirm.mockImplementation((summary: string) => {
            // Nothing may have run at the moment the card is shown.
            expect(executeCommand).not.toHaveBeenCalled();
            expect(summary).toContain('2 steps, in this order:');
            expect(summary).toContain('1. Paint every wall in the project white');
            expect(summary).toContain('2. Run ceilings on every qualifying room');
            // U6.3 — the REAL undo cost, on the card, before consent.
            expect(summary).toContain('Undo cost: 2 steps — Ctrl+Z twice.');
            return Promise.resolve(true);
        });

        const handled = await tryHandleZeroToken(
            'make all walls white then add ceilings to every room', hooks);

        expect(handled).toBe(true);
        expect(confirm).toHaveBeenCalledTimes(1); // ONE card for the whole plan
        expect(executeCommand).toHaveBeenNthCalledWith(1, 'wall.updateColorBatch', {
            wallIds: 'all', materialColor: '#ffffff',
        }, AI_STAMP);
        expect(executeCommand).toHaveBeenNthCalledWith(2, 'generation.rooms', {
            steps: ['ceilings'], levelId: 'L0',
        }, AI_STAMP);
        expect(said.join(' ')).toContain('Step 1 done');
        expect(said.join(' ')).toContain('Step 2 done');
        expect(said.join(' ')).toContain('Ctrl+Z twice');
        expect(querySpy).not.toHaveBeenCalled();
    });

    it('§PLAN: Cancel runs NOTHING — not even the first step', async () => {
        const { executeCommand } = installFacets();
        const { hooks, said } = makeHooks(false);

        const handled = await tryHandleZeroToken(
            'make all walls white then add ceilings to every room', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.some((s) => s.includes('Cancelled'))).toBe(true);
    });

    it('§PLAN: a step that fails at EXECUTION stops the plan and reports how far it got', async () => {
        const { executeCommand } = installFacets();
        executeCommand.mockImplementation((type: string) => {
            if (type === 'generation.rooms') {
                return Promise.reject(new Error('no rooms on this level — detect rooms first'));
            }
            emitStubReport(type, { success: true, info: [] });
            return Promise.resolve(undefined);
        });
        const { hooks, said } = makeHooks(true);

        const handled = await tryHandleZeroToken(
            'make all walls white then add ceilings to every room', hooks);

        expect(handled).toBe(true);
        const reply = said.join(' ');
        expect(reply).toContain('Step 1 done');
        expect(reply).toContain('Step 2 refused');
        expect(reply).toContain('no rooms on this level — detect rooms first');
        expect(reply).toContain('nothing after it ran');
        // …and it never reads like the whole plan succeeded.
        expect(reply).not.toContain('Step 2 done');
    });

    it('§PLAN: an engine that reports success:false stops the plan too', async () => {
        const { executeCommand } = installFacets();
        executeCommand.mockImplementation((type: string) => {
            // The seam's own honesty channel: it ran, and it changed nothing.
            emitStubReport(type, type === 'generation.rooms'
                ? { success: false, info: ['there is no closed shell on this level'] }
                : { success: true, info: [] });
            return Promise.resolve(undefined);
        });
        const { hooks, said } = makeHooks(true);

        await tryHandleZeroToken('make all walls white then add ceilings to every room', hooks);

        const reply = said.join(' ');
        expect(reply).toContain('Step 2 refused');
        expect(reply).toContain('there is no closed shell on this level');
    });

    it('§PLAN: a clause that would be refused alone refuses the WHOLE plan — nothing dispatches', async () => {
        const { executeCommand } = installFacets();
        const { hooks, said, confirm } = makeHooks(true);

        const handled = await tryHandleZeroToken(
            'make all walls white, then duplicate level 0 to level 9', hooks);

        expect(handled).toBe(true);
        expect(confirm).not.toHaveBeenCalled(); // no card for a plan that cannot run
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.join(' ')).toContain('No level called "9"');
        expect(said.join(' ')).toContain('Nothing in the plan was run');
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
