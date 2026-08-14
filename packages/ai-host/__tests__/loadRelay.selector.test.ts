// @pryzm/ai-host — loadRelay() selector honesty (C74 §3.3, CO-02).
//
// SUBJECT: the two miss modes of the relay selector must be DIFFERENT observable
// outcomes. NOT-CONFIGURED (`ANTHROPIC_RELAY_URL` unset) is the stated MockAnthropicRelay
// default and says so through `kind = 'mock'`. CONFIGURED-BUT-FAILED (URL supplied,
// adapter unloadable) is a FAILURE, not a default — the one action a caller can take
// to ask for a real relay must never silently hand back demo layouts.
//
// C74 §3.4 — no fixture supplies the value under test here: both cases call the
// PRODUCTION construction (`loadRelay({ env })`), with no injected underlying and no
// stubbed importer. The only input is the environment variable a deployer actually sets.

import { describe, expect, it } from 'vitest';
import { loadRelay, MockAnthropicRelay } from '../src/AnthropicRelay.js';

describe('loadRelay — C74 §3.3 selector honesty', () => {
    it('NOT CONFIGURED: returns the stated mock default, labelled at its own boundary', async () => {
        const relay = await loadRelay({ env: {} });
        expect(relay).toBeInstanceOf(MockAnthropicRelay);
        expect((relay as MockAnthropicRelay).kind).toBe('mock');
    });

    it('CONFIGURED: never silently returns the mock — a miss is a FAILURE, not a default', async () => {
        let outcome: unknown;
        let threw: Error | undefined;
        try {
            outcome = await loadRelay({ env: { ANTHROPIC_RELAY_URL: 'https://relay.invalid/v1/messages' } });
        } catch (err) {
            threw = err instanceof Error ? err : new Error(String(err));
        }

        // Exactly one of two honest outcomes: a real relay, or a loud failure.
        if (threw) {
            expect(threw.message).toContain('ANTHROPIC_RELAY_URL');
            expect(threw.message).toMatch(/could not be loaded|CONFIGURED-BUT-FAILED/);
        } else {
            expect(outcome).not.toBeInstanceOf(MockAnthropicRelay);
            expect((outcome as { kind?: string }).kind).not.toBe('mock');
        }
    });
});
