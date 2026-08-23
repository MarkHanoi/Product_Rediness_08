// §BYOM key guard (C103 §4.5, §6.6) — PRYZM refuses a provider key rather than
// forwarding it, and the CSP allowlist cannot drift from the provider registry.
//
// ⭐ THE TWO PROPERTIES, and why each needs its own arm:
//
//   1. A KEY THAT REACHES THIS SERVER IS REFUSED. The client cannot send one by
//      construction, but a user pasting their key into the chat box is a real
//      accident, and without the guard it would land in the proxy's request log
//      and then be forwarded upstream.
//   2. THE GUARD DOES NOT EAT ORDINARY PROMPTS. This is the half that makes the
//      first half safe to ship. A guard that rejects real architectural
//      sentences would be removed within a week, so its false-positive
//      behaviour is pinned as hard as its true-positive behaviour.

import { describe, expect, it, vi } from 'vitest';
import {
    byomKeyGuard,
    findCredentialHeader,
    findVendorKeyShape,
    BYOM_KEY_REFUSAL,
} from '../byomKeyGuard.js';
import { buildConnectSrc } from '../securityHeaders.js';
import { byomConnectSrcOrigins } from '../../packages/ai-host/src/byom/ByomProviders.js';

interface FakeRes {
    statusCode: number | null;
    payload: unknown;
    status(code: number): FakeRes;
    json(body: unknown): FakeRes;
}

function res(): FakeRes {
    const r: FakeRes = {
        statusCode: null,
        payload: null,
        status(code) { r.statusCode = code; return r; },
        json(body) { r.payload = body; return r; },
    };
    return r;
}

function run(req: { headers?: Record<string, string>; body?: unknown }) {
    const r = res();
    const next = vi.fn();
    byomKeyGuard(
        { method: 'POST', path: '/api/anthropic/v1/messages', headers: {}, ...req },
        r,
        next,
    );
    return { r, next };
}

describe('§BYOM-GUARD — a provider key that reaches PRYZM is refused, not forwarded', () => {
    it.each([
        ['anthropic', 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAA'],
        ['openrouter', 'sk-or-v1-BBBBBBBBBBBBBBBBBBBBBBBBBB'],
        ['openai project', 'sk-proj-CCCCCCCCCCCCCCCCCCCCCCCCCC'],
        ['openai', 'sk-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'],
        ['google', 'AIzaEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'],
    ])('refuses a %s key pasted into a prompt', (_vendor, key) => {
        const { r, next } = run({
            body: { messages: [{ role: 'user', content: `use my key ${key} please` }] },
        });
        expect(r.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
        expect((r.payload as { code: string }).code).toBe('BYOM_KEY_REJECTED');
    });

    it('the refusal names the mistake and the remedy, and QUOTES NOTHING', () => {
        const key = 'sk-ant-api03-FFFFFFFFFFFFFFFFFFFFFFFFFF';
        const { r } = run({ body: { prompt: key } });
        const message = (r.payload as { error: string }).error;
        expect(message).toBe(BYOM_KEY_REFUSAL);
        // ⛔ The whole point: the refusal must not echo the credential back.
        expect(message).not.toContain(key);
        expect(message).toContain('AI provider keys');
        expect(message).toContain('rotate it');
    });

    it('refuses a provider credential HEADER, whatever the body says', () => {
        const { r, next } = run({ headers: { 'x-api-key': 'anything' }, body: { ok: true } });
        expect(r.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    it('refuses the browser opt-in header — a BYOM request must never come through here', () => {
        const { r } = run({
            headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
            body: {},
        });
        // If this ever passes, someone has re-routed BYOM through the BFF and
        // the "never reaches PRYZM" promise is silently broken.
        expect(r.statusCode).toBe(400);
    });

    it('finds a key nested deep in a structured body', () => {
        expect(
            findVendorKeyShape({ a: [{ b: { c: 'sk-ant-api03-GGGGGGGGGGGGGGGGGGGG' } }] }),
        ).toBe('anthropic');
    });
});

describe('§BYOM-GUARD — it does NOT eat ordinary prompts (the half that makes it shippable)', () => {
    it.each([
        'Make all the walls on level 1 white and 3 metres tall',
        'Add a door in the north wall of Bedroom 2, 900mm wide',
        'wall_01H9ZQK3M7YB4N2X8V6TJ5RGWD',
        'Why is the stair fragmenting the floor plate at grid C-4?',
        'sk-',
        'The client asked for a sk-style modern finish',
        'claude-haiku-4-5-20251014',
    ])('passes: %s', (prompt) => {
        const { r, next } = run({ body: { messages: [{ role: 'user', content: prompt }] } });
        expect(r.statusCode).toBeNull();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('passes a long base64 payload — a thumbnail is not a credential', () => {
        // ⚠ This is the case that forced the server detectors to be NARROWER
        // than the client's redaction detectors. The client carries a generic
        // "40+ high-entropy chars" arm, which is right for masking and would be
        // catastrophic here: it would reject every floor-plan image import.
        const base64 = 'iVBORw0KGgoAAAANSUhEUg'.repeat(40);
        const { r, next } = run({ body: { image: base64 } });
        expect(r.statusCode).toBeNull();
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('passes PRYZM own session bearer — rejecting it would break every call', () => {
        expect(findCredentialHeader({ authorization: 'Bearer pryzm.session.token.value' })).toBeNull();
    });

    it('is bounded on a hostile body rather than becoming a DoS', () => {
        let deep: unknown = 'leaf';
        for (let i = 0; i < 500; i++) deep = { next: deep };
        expect(() => findVendorKeyShape(deep)).not.toThrow();
    });
});

describe('§BYOM-CSP — the allowlist cannot drift from the provider registry', () => {
    it('every provider origin in the registry is present in connect-src', () => {
        // ⛔ THE DRIFT GATE. The origins are duplicated in securityHeaders.js
        // because that file is server JS and cannot import the TS registry at
        // module init. Duplication is fine; UNGATED duplication is what shipped
        // the NASA/WorldPop and R2 entries broken. This is the gate.
        const src = buildConnectSrc({}, true);
        for (const origin of byomConnectSrcOrigins()) {
            expect(src).toContain(origin);
        }
    });

    it('connect-src adds no BYOM origin the registry does not name', () => {
        const src = buildConnectSrc({}, true);
        const registry = new Set<string>(byomConnectSrcOrigins());
        // The loopback ALIAS is the one deliberate extra: Ollama binds
        // 127.0.0.1 by default and users type either spelling. Same host, same
        // trust, two names.
        registry.add('http://127.0.0.1:11434');
        const aiOrigins = src.filter(
            (o) =>
                o.includes('anthropic') ||
                o.includes('openai') ||
                o.includes('generativelanguage') ||
                o.includes('deepseek') ||
                o.includes('openrouter') ||
                o.includes('11434'),
        );
        expect(aiOrigins.length).toBeGreaterThan(0);
        for (const o of aiOrigins) expect(registry.has(o)).toBe(true);
    });

    it('PRYZM_BYOM_DISABLED=1 withholds every provider origin', () => {
        // An enterprise deployment with a strict egress policy can switch the
        // whole feature off at the CSP layer. The browser then refuses in its
        // own words rather than PRYZM pretending the feature works.
        const src = buildConnectSrc({ PRYZM_BYOM_DISABLED: '1' }, true);
        for (const origin of byomConnectSrcOrigins()) {
            expect(src).not.toContain(origin);
        }
    });

    it('the PRYZM proxy origin is unaffected either way — the default path never moves', () => {
        for (const env of [{}, { PRYZM_BYOM_DISABLED: '1' }]) {
            expect(buildConnectSrc(env, true)).toContain("'self'");
        }
    });
});
