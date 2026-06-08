// @pryzm/ai-host — CfWorkerRelay tests (SPEC-47 §7, #51 A7).
//
// Mock fetch — proves the RelayRequest→Anthropic mapping, the response parse,
// and the cost computed from usage tokens (no live network).

import { describe, expect, it, vi } from 'vitest';
import { createCfWorkerRelay, createResilientRelay, modelClassOf, DEFAULT_RELAY_ENDPOINT } from '../src/CfWorkerRelay.js';
import type { RelayPorter, RelayResponse } from '../src/AnthropicRelay.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, statusText: ok ? 'OK' : 'ERR', json: async () => body } as unknown as Response;
}

const ANTHROPIC_OK = {
    content: [{ type: 'text', text: '[{"summary":"x"}]' }, { type: 'thinking', text: 'ignore' }],
    usage: { input_tokens: 1000, output_tokens: 500 },
    model: 'claude-haiku-4-5-20251014',
    stop_reason: 'end_turn',
};

describe('modelClassOf', () => {
    it('maps model ids to pricing classes (haiku default)', () => {
        expect(modelClassOf('claude-opus-4-7')).toBe('opus');
        expect(modelClassOf('claude-sonnet-4-6')).toBe('sonnet');
        expect(modelClassOf('gpt-4o')).toBe('gpt-4o');
        expect(modelClassOf('claude-haiku-4-5-20251014')).toBe('haiku');
        expect(modelClassOf('mystery')).toBe('haiku');
    });
});

describe('createCfWorkerRelay', () => {
    it('POSTs the RelayRequest as an Anthropic /v1/messages body', async () => {
        const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse(ANTHROPIC_OK));
        const relay = createCfWorkerRelay('/api/anthropic/v1/messages', fetchImpl as unknown as typeof fetch);
        await relay.complete({ model: 'claude-haiku-4-5-20251014', system: 'SYS', user: 'USER', maxTokens: 3000 });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0]!;
        expect(url).toBe('/api/anthropic/v1/messages');
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.model).toBe('claude-haiku-4-5-20251014');
        expect(body.max_tokens).toBe(3000);
        expect(body.system).toBe('SYS');
        expect(body.messages).toEqual([{ role: 'user', content: 'USER' }]);
    });

    it('parses text + tokens + computes cost from usage (haiku pricing)', async () => {
        const relay = createCfWorkerRelay('/x', (async () => jsonResponse(ANTHROPIC_OK)) as unknown as typeof fetch);
        const r = await relay.complete({ model: 'claude-haiku-4-5-20251014', system: '', user: 'u' });
        expect(r.text).toBe('[{"summary":"x"}]');          // only 'text' blocks, joined
        expect(r.tokens).toEqual({ input: 1000, output: 500 });
        expect(r.model).toBe('claude-haiku-4-5-20251014');
        expect(r.stopReason).toBe('end_turn');
        // haiku: 1.0k input × $0.25 + 0.5k output × $1.25 = 0.25 + 0.625 = 0.875
        expect(r.costUsd).toBeCloseTo(0.875, 6);
    });

    it('throws on a non-2xx relay response (loud-fail → orchestrator retries/rejects)', async () => {
        const relay = createCfWorkerRelay('/x', (async () => jsonResponse({}, false, 503)) as unknown as typeof fetch);
        await expect(relay.complete({ model: 'm', system: '', user: 'u' })).rejects.toThrow(/503/);
    });

    it('tolerates a missing usage block (zero tokens → zero cost)', async () => {
        const relay = createCfWorkerRelay('/x', (async () => jsonResponse({ content: [{ type: 'text', text: 'hi' }] })) as unknown as typeof fetch);
        const r = await relay.complete({ model: 'claude-haiku-4-5', system: '', user: 'u' });
        expect(r.text).toBe('hi');
        expect(r.tokens).toEqual({ input: 0, output: 0 });
        expect(r.costUsd).toBe(0);
    });

    it('defaults the endpoint to the server proxy path', () => {
        expect(DEFAULT_RELAY_ENDPOINT).toBe('/api/anthropic/v1/messages');
    });
});

describe('createResilientRelay', () => {
    const resp = (text: string): RelayResponse => ({ text, costUsd: 0.01, model: 'm', tokens: { input: 1, output: 1 } });
    const ok = (text: string): RelayPorter => ({ complete: vi.fn(async () => resp(text)) });
    const fail = (): RelayPorter => ({ complete: vi.fn(async () => { throw new Error('relay down'); }) });

    it('returns the primary result when the primary succeeds (no fallback)', async () => {
        const primary = ok('PRIMARY');
        const fallback = ok('FALLBACK');
        const onFallback = vi.fn();
        const r = createResilientRelay(primary, fallback, onFallback);
        const out = await r.complete({ model: 'm', system: 's', user: 'u' });
        expect(out.text).toBe('PRIMARY');
        expect(fallback.complete).not.toHaveBeenCalled();
        expect(onFallback).not.toHaveBeenCalled();
    });

    it('falls back to the secondary when the primary throws + notifies onFallback', async () => {
        const primary = fail();
        const fallback = ok('FALLBACK');
        const onFallback = vi.fn();
        const r = createResilientRelay(primary, fallback, onFallback);
        const out = await r.complete({ model: 'm', system: 's', user: 'u' });
        expect(out.text).toBe('FALLBACK');
        expect(fallback.complete).toHaveBeenCalledTimes(1);
        expect(onFallback).toHaveBeenCalledTimes(1);
    });

    it('a throwing onFallback listener does not break the fallback', async () => {
        const r = createResilientRelay(fail(), ok('FALLBACK'), () => { throw new Error('listener boom'); });
        const out = await r.complete({ model: 'm', system: 's', user: 'u' });
        expect(out.text).toBe('FALLBACK');
    });
});
