// §PLANNER (RAC U10.2) — the LAST rung, wired and pinned.
//
// Four claims, and each of them is a thing that regresses silently if nobody
// pins it:
//
//  1. LADDER ORDER / TOKEN COST. A sentence tier 0/1 or the NL layer claims is
//     handled by `tryHandleZeroToken` and never reaches the planner, so the
//     relay is never called. This is the guarantee that "make all walls white"
//     stays free forever.
//  2. NO RELAY ⇒ SKIPPED CLEANLY. Production carries neither CF_WORKER_URL nor
//     ANTHROPIC_API_KEY. `/api/health` says so, the planner is skipped, no
//     request is made, and the caller falls through — never a mystery 401.
//  3. A PLANNED INTENT RUNS THROUGH THE SAME EXECUTOR — the same bus verbs a
//     typed sentence dispatches, and a DESTRUCTIVE planned intent still shows
//     its Confirm card and dispatches nothing on Cancel.
//  4. AN OUT-OF-REGISTRY ATTEMPT IS REFUSED OUT LOUD, with the model's own
//     reading quoted back — never a silent fallthrough and never a coerced
//     guess at a nearby capability.
//
// Environment: happy-dom (root vitest.config.ts). `fetch` is stubbed at the
// window level, which is the only I/O this rung performs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetPlannerShapeCache } from '@pryzm/ai-host';
import { resetZeroTokenConversation, tryHandleZeroToken } from '../ZeroTokenChatBridge';
import { tryHandleWithPlanner } from '../LlmPlannerBridge';
import { resetAiAvailabilityCache } from '../floorplan-import/FPTiers';

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

/** Stub the two HTTP surfaces this rung touches: the health probe (is any AI
 *  upstream configured?) and the relay itself. `relayAnswer === null` models the
 *  PRODUCTION deploy: configured = false, and the relay must never be called. */
function installFetch(relayAnswer: string | null): {
    relayCalls: () => number;
    promptOf: (i: number) => { system: string; user: string };
} {
    const prompts: Array<{ system: string; user: string }> = [];
    const fetchImpl = vi.fn(async (input: unknown, init?: { body?: string }) => {
        const url = String(input);
        if (url.includes('/api/health')) {
            return new Response(
                JSON.stringify({ features: { anthropic: relayAnswer !== null } }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            );
        }
        if (url.includes('/api/anthropic/v1/messages')) {
            const body = JSON.parse(init?.body ?? '{}') as { system?: string; messages?: Array<{ content?: string }> };
            prompts.push({ system: body.system ?? '', user: body.messages?.[0]?.content ?? '' });
            if (relayAnswer === null) throw new Error('the relay must not be called when nothing is configured');
            return new Response(
                JSON.stringify({
                    content: [{ type: 'text', text: relayAnswer }],
                    usage: { input_tokens: 100, output_tokens: 20 },
                    model: 'claude-haiku-4-5',
                }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            );
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    return {
        relayCalls: () => prompts.length,
        promptOf: (i: number) => prompts[i] ?? { system: '', user: '' },
    };
}

const realFetch = globalThis.fetch;

beforeEach(() => {
    resetZeroTokenConversation();
    resetAiAvailabilityCache();
    resetPlannerShapeCache();
    vi.restoreAllMocks();
});

afterEach(() => { globalThis.fetch = realFetch; });

describe('§PLANNER — the ladder order and the token-cost guarantee', () => {
    it('a sentence the grammar claims is handled BEFORE the planner — the relay is never called', async () => {
        const relay = installFetch('{"steps":[{"intent":"zoom-fit"}]}');
        installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks } = makeHooks();

        const handled = await tryHandleZeroToken('make this wall 3 meters tall', hooks);

        expect(handled).toBe(true);
        expect(relay.relayCalls()).toBe(0);
    });

    it('the deterministic reply still says it cost nothing', async () => {
        installFetch('{"steps":[{"intent":"zoom-fit"}]}');
        installFacets({ id: 'wall-1', type: 'wall' });
        const { hooks, said } = makeHooks();

        await tryHandleZeroToken('make this wall 3 meters tall', hooks);

        expect(said.join(' ')).toContain('resolved without AI tokens');
    });
});

describe('§PLANNER — no AI upstream configured (the production truth)', () => {
    it('is skipped cleanly, makes no relay request, and falls through', async () => {
        const relay = installFetch(null);
        installFacets();
        const { hooks, said } = makeHooks();

        const handled = await tryHandleWithPlanner('make this apartment feel more spacious', hooks);

        expect(handled).toBe(false);
        expect(relay.relayCalls()).toBe(0);
        // Nothing is said here: the panel owns the "no AI upstream" sentence,
        // and saying it twice would be worse than saying it once.
        expect(said).toEqual([]);
    });
});

describe('§PLANNER — a planned intent runs through the SAME executor', () => {
    it('free phrasing the grammar cannot parse becomes a validated intent and dispatches', async () => {
        const relay = installFetch(JSON.stringify({
            steps: [{ intent: 'set-wall-color', colorRef: 'white', scope: 'all' }],
            clauses: ['give the whole place a fresh coat of white'],
        }));
        const { executeCommand } = installFacets();
        const { hooks, said } = makeHooks();

        const handled = await tryHandleWithPlanner('give the whole place a fresh coat of white', hooks);

        expect(handled).toBe(true);
        expect(relay.relayCalls()).toBe(1);
        expect(executeCommand).toHaveBeenCalledWith('wall.updateColorBatch', expect.anything());
        // Token honesty: the deterministic line is NOT printed on a planned result.
        expect(said.join(' ')).not.toContain('resolved without AI tokens');
        expect(said.join(' ')).toContain('AI planner');
    });

    it('the prompt it sent was GENERATED from the registry, not hand-written', async () => {
        const relay = installFetch(JSON.stringify({ steps: [{ intent: 'zoom-fit' }] }));
        installFacets();
        const { hooks } = makeHooks();

        await tryHandleWithPlanner('let me see the whole thing at once', hooks);

        const prompt = relay.promptOf(0);
        expect(prompt.system).toContain('"set-wall-color"');
        expect(prompt.system).toContain('"generate-building"');
        expect(prompt.system).toContain('Never invent an id');
        expect(prompt.user).toContain('let me see the whole thing at once');
    });

    it('a planned DESTRUCTIVE intent still shows its Confirm card, and Cancel dispatches nothing', async () => {
        installFetch(JSON.stringify({
            steps: [{ intent: 'generate-building', typology: 'house', floors: 2 }],
            clauses: ['somewhere for a family of four to live, over two floors'],
        }));
        const { executeCommand } = installFacets();
        const { hooks, confirm, said } = makeHooks(false);

        const handled = await tryHandleWithPlanner('somewhere for a family of four to live, over two floors', hooks);

        expect(handled).toBe(true);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.join(' ')).toContain('Cancelled');
    });

    it('a planned intent the capability refuses still refuses — no guard is bypassed', async () => {
        installFetch(JSON.stringify({
            steps: [{ intent: 'rename-room', name: 'Kitchen' }],
            clauses: ['this space should be the kitchen'],
        }));
        const { executeCommand } = installFacets(); // nothing selected
        const { hooks, said } = makeHooks();

        const handled = await tryHandleWithPlanner('this space should be the kitchen', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.length).toBeGreaterThan(0);
    });
});

describe('§PLANNER — adversarial: the model may not invent authority', () => {
    it('a verb outside the registry is REFUSED out loud, with the reading quoted back', async () => {
        installFetch(JSON.stringify({
            steps: [{ intent: 'demolish-building', force: true }],
            clauses: ['knock it all down'],
        }));
        const { executeCommand } = installFacets();
        const { hooks, said } = makeHooks();

        const handled = await tryHandleWithPlanner('knock it all down', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
        const reply = said.join(' ');
        expect(reply).toContain('I understood it as');
        expect(reply).toContain('demolish-building');
        expect(reply).toContain('Nothing was changed');
    });

    it('a raw bus command string is not a vocabulary — it is refused too', async () => {
        installFetch(JSON.stringify({
            steps: [{ intent: 'wall.updateColorBatch', colorRef: 'white' }],
            clauses: ['paint them'],
        }));
        const { executeCommand } = installFacets();
        const { hooks, said } = makeHooks();

        await tryHandleWithPlanner('paint them', hooks);

        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.join(' ')).toContain("isn't something I can do");
    });

    it("the model's own 'I cannot map this' is relayed honestly, not padded", async () => {
        installFetch(JSON.stringify({ cannot: 'you want a cost estimate for the building' }));
        const { executeCommand } = installFacets();
        const { hooks, said } = makeHooks();

        const handled = await tryHandleWithPlanner('what will this cost me', hooks);

        expect(handled).toBe(true);
        expect(executeCommand).not.toHaveBeenCalled();
        expect(said.join(' ')).toContain('cost estimate for the building');
    });
});
