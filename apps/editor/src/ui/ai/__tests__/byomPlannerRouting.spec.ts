// §BYOM at the WIRING layer (C105 §6.4) — what the founder actually experiences.
//
// ⭐ WHY THIS FILE EXISTS SEPARATELY FROM THE PURE TESTS. `packages/ai-host`
// already proves the vault, the relay and the route decision in isolation, and
// all of that can be perfect while the editor never calls any of it —
// [[committed-is-not-reachable]]: four fixes in one session ran nowhere because
// they were proven at the pure-function return rather than at the layer the
// user experiences. So these tests drive the REAL `tryHandleWithPlanner` with a
// REAL browser storage area and assert on the URL that was actually fetched.
//
// Environment: happy-dom (root vitest.config.ts), which supplies localStorage,
// sessionStorage and a stubbable global fetch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetPlannerShapeCache } from '@pryzm/ai-host';
import { resetZeroTokenConversation } from '../ZeroTokenChatBridge';
import { tryHandleWithPlanner, describeActiveAiRoute } from '../LlmPlannerBridge';
import { __resetByomVaultsForTest } from '../byom/byomDeviceStorage';
import { resetAiAvailabilityCache } from '../floorplan-import/FPTiers';

const USER_KEY = 'sk-ant-api03-FOUNDERKEYFOUNDERKEYFOUNDERKEY42';

interface TestWindowFacets {
    selectionManager?: { selectedObject?: unknown };
    bimManager?: { getLevels?: () => ReadonlyArray<{ id: string; name?: string; elevation?: number }> };
    projectContext?: { activeLevelId?: string | null };
    runtime?: {
        bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> };
        events?: { emit(name: string, payload: unknown): void };
    };
}

function installFacets(): { executeCommand: ReturnType<typeof vi.fn> } {
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const w = window as unknown as TestWindowFacets;
    w.selectionManager = { selectedObject: null };
    w.bimManager = { getLevels: () => [{ id: 'L0', name: 'Level 0', elevation: 0 }] };
    w.projectContext = { activeLevelId: 'L0' };
    w.runtime = { bus: { executeCommand }, events: { emit: vi.fn() } };
    return { executeCommand };
}

function makeHooks() {
    const said: string[] = [];
    return {
        said,
        hooks: {
            say: (text: string) => { said.push(text); },
            confirm: async () => true,
        },
    };
}

const PLANNED = JSON.stringify({
    steps: [{ intent: 'set-wall-color', colorRef: 'white', scope: 'all' }],
    clauses: ['give the whole place a fresh coat of white'],
});

/**
 * One fetch stub for BOTH topologies, recording every URL it is asked for. The
 * assertions below are about WHICH host was contacted — that is the whole
 * subject of this file, so the stub answers everything and records everything
 * rather than throwing on the path it does not expect.
 */
function installFetch(opts: {
    pryzmAvailable?: boolean;
    providerStatus?: number;
    providerBody?: unknown;
}): { urls: string[]; headersFor: (fragment: string) => Record<string, string> } {
    const urls: string[] = [];
    const headers: Array<{ url: string; headers: Record<string, string> }> = [];
    const impl = (async (input: unknown, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        urls.push(url);
        headers.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });

        if (url.includes('/api/health')) {
            return new Response(
                JSON.stringify({ features: { anthropic: opts.pryzmAvailable ?? true } }),
                { status: 200, headers: { 'content-type': 'application/json' } },
            );
        }
        const anthropicOk = JSON.stringify({
            content: [{ type: 'text', text: PLANNED }],
            usage: { input_tokens: 100, output_tokens: 20 },
            model: 'claude-haiku-4-5',
        });
        if (url.includes('/api/anthropic/v1/messages')) {
            return new Response(anthropicOk, { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.includes('api.anthropic.com')) {
            const status = opts.providerStatus ?? 200;
            return new Response(
                JSON.stringify(opts.providerBody ?? JSON.parse(anthropicOk)),
                { status, headers: { 'content-type': 'application/json' } },
            );
        }
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    globalThis.fetch = impl;
    return {
        urls,
        headersFor: (fragment) => headers.find((h) => h.url.includes(fragment))?.headers ?? {},
    };
}

/** Write a credential the way the keys panel does — through real localStorage. */
function saveAndEnable(secret: string): void {
    localStorage.setItem('pryzm-byom-p-anthropic', JSON.stringify({ k: secret }));
    localStorage.setItem('pryzm-byom-active', 'anthropic');
}

const realFetch = globalThis.fetch;

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetByomVaultsForTest();
    resetZeroTokenConversation();
    resetAiAvailabilityCache();
    resetPlannerShapeCache();
    vi.restoreAllMocks();
});

afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
    sessionStorage.clear();
    __resetByomVaultsForTest();
});

describe('§DEFAULT-UNCHANGED — the founder stated requirement, proven at the wire', () => {
    it('with NO key stored, the chat calls PRYZM proxy and NEVER a provider directly', async () => {
        const net = installFetch({ pryzmAvailable: true });
        installFacets();
        const { hooks } = makeHooks();

        const handled = await tryHandleWithPlanner('give the whole place a fresh coat of white', hooks);

        expect(handled).toBe(true);
        // The one call that matters: PRYZM's own proxy, exactly as today.
        expect(net.urls.some((u) => u.includes('/api/anthropic/v1/messages'))).toBe(true);
        // ⛔ and nothing left for a third party.
        expect(net.urls.some((u) => u.includes('api.anthropic.com'))).toBe(false);
    });

    it('a key SAVED but NOT enabled still routes through PRYZM — storing is not enabling', async () => {
        const net = installFetch({ pryzmAvailable: true });
        installFacets();
        localStorage.setItem('pryzm-byom-p-anthropic', JSON.stringify({ k: USER_KEY }));
        // …deliberately NOT setting `pryzm-byom-active`.
        __resetByomVaultsForTest();

        await tryHandleWithPlanner('give the whole place a fresh coat of white', makeHooks().hooks);

        expect(net.urls.some((u) => u.includes('/api/anthropic/v1/messages'))).toBe(true);
        expect(net.urls.some((u) => u.includes('api.anthropic.com'))).toBe(false);
    });

    it('the default route describes itself as PRYZM built-in AI', () => {
        expect(describeActiveAiRoute()).toContain("PRYZM's built-in AI");
    });
});

describe('§BYOM-ACTIVE — an enabled key inverts the topology', () => {
    it('calls the provider DIRECTLY and never PRYZM proxy', async () => {
        const net = installFetch({ pryzmAvailable: true });
        installFacets();
        saveAndEnable(USER_KEY);
        __resetByomVaultsForTest();

        const handled = await tryHandleWithPlanner('give the whole place a fresh coat of white', makeHooks().hooks);

        expect(handled).toBe(true);
        expect(net.urls.some((u) => u.includes('api.anthropic.com'))).toBe(true);
        // ⛔ THE PROMISE. The key leaves this device only to call the provider
        // the user chose — PRYZM's own AI path is not touched at all.
        expect(net.urls.some((u) => u.includes('/api/anthropic/v1/messages'))).toBe(false);
    });

    it('sends the user key plus the browser opt-in header, and no PRYZM session', async () => {
        const net = installFetch({ pryzmAvailable: true });
        installFacets();
        saveAndEnable(USER_KEY);
        __resetByomVaultsForTest();

        await tryHandleWithPlanner('give the whole place a fresh coat of white', makeHooks().hooks);

        const headers = net.headersFor('api.anthropic.com');
        expect(headers['x-api-key']).toBe(USER_KEY);
        expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
        // ⛔ PRYZM's own session must NOT ride along to a third party.
        expect(headers['authorization']).toBeUndefined();
    });

    it('tells the user, in the transcript, that their own key answered', async () => {
        installFetch({ pryzmAvailable: true });
        installFacets();
        saveAndEnable(USER_KEY);
        __resetByomVaultsForTest();
        const { hooks, said } = makeHooks();

        await tryHandleWithPlanner('give the whole place a fresh coat of white', hooks);

        const transcript = said.join(' ');
        expect(transcript).toContain('your own Claude key');
        expect(transcript).toContain("did not use PRYZM's AI quota");
        // ⛔ and the disclosure must never quote the key itself.
        expect(transcript).not.toContain(USER_KEY);
    });

    it('§NO-FALLBACK — a rejected key says so and does NOT reach PRYZM proxy', async () => {
        const net = installFetch({
            pryzmAvailable: true,
            providerStatus: 401,
            providerBody: { error: { message: 'invalid x-api-key' } },
        });
        installFacets();
        saveAndEnable(USER_KEY);
        __resetByomVaultsForTest();
        const { hooks, said } = makeHooks();

        const handled = await tryHandleWithPlanner('give the whole place a fresh coat of white', hooks);

        // HANDLED — the user is told what happened, not left with a silence.
        expect(handled).toBe(true);
        const transcript = said.join(' ');
        expect(transcript).toContain('rejected your API key');
        expect(transcript).toContain('invalid x-api-key');
        expect(transcript).toContain('did NOT fall back');
        expect(transcript).not.toContain(USER_KEY);
        // ⛔ THE MONEY CLAIM. PRYZM's proxy was never called, so nothing was
        // spent on PRYZM's key for a request the user made on their own.
        expect(net.urls.some((u) => u.includes('/api/anthropic/v1/messages'))).toBe(false);
    });
});
