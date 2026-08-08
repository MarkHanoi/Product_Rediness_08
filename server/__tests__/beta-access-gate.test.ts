/**
 * server/__tests__/beta-access-gate.test.ts
 * ============================================================================
 * §BETA-ACCESS-GATE — the private-beta allowlist (founder ruling 2026-08-07:
 * "only these can access; nobody else can sign up or anything").
 *
 * These tests exist because an allowlist is the kind of control that LOOKS
 * correct while being trivially bypassable. The three ways this specific gate
 * could be wrong-but-green are each pinned below:
 *
 *   1. Gating signup but not SIGNIN — every pre-gate account keeps working.
 *   2. Gating the password routes but not the OAUTH callbacks — `upsertOAuthUser`
 *      creates users implicitly, so an ungated callback is an open signup door
 *      that is not called "signup".
 *   3. Leaking account EXISTENCE by refusing known and unknown addresses with
 *      different messages or status codes.
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import {
    isBetaAllowed,
    BETA_ACCESS_ALLOWLIST,
    BETA_REFUSAL_MESSAGE,
} from '../betaAccessAllowlist.js';
import { notifierStatus, notifyBlockedAccessAttempt, __resetAccessNotifierCap } from '../accessAttemptNotifier.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverJs = readFileSync(resolve(repoRoot, 'server.js'), 'utf8');

describe('§1 the allowlist itself', () => {
    it('T1.1 — contains exactly the four founder-supplied addresses', () => {
        expect([...BETA_ACCESS_ALLOWLIST].sort()).toEqual([
            'antoniocanerosan@gmail.com',
            'antoniocanerosantisteban@gmail.com',
            'antoniocansan@gmail.com',
            'lookwithinjourney@gmail.com',
        ]);
    });

    it('T1.2 — admits every allowlisted address', () => {
        for (const e of BETA_ACCESS_ALLOWLIST) expect(isBetaAllowed(e)).toBe(true);
    });

    it('T1.3 — is case-insensitive and whitespace-tolerant', () => {
        expect(isBetaAllowed('  AntonioCaneroSan@Gmail.COM ')).toBe(true);
    });

    it('T1.4 — refuses everyone else, including near-misses', () => {
        for (const e of [
            'someone@example.com',
            'antoniocanerosan@gmail.co',        // truncated TLD
            'antoniocanerosan@gmail.com.evil.io', // suffix attack
            'xantoniocanerosan@gmail.com',       // prefix
        ]) expect(isBetaAllowed(e)).toBe(false);
    });

    it('T1.5 — refuses empty / null / non-string (there is no anonymous member)', () => {
        for (const e of ['', null, undefined, 123, {}, []] as unknown[]) {
            expect(isBetaAllowed(e as string)).toBe(false);
        }
    });

    it('T1.6 — Gmail dot/plus aliases are REFUSED, and that is the documented choice', () => {
        // Gmail delivers these to an allowlisted inbox, but the comparison is
        // deliberately literal: a stricter match can only wrongly refuse (fixable
        // by adding the exact spelling), a looser one could wrongly admit.
        expect(isBetaAllowed('antonio.canerosan@gmail.com')).toBe(false);
        expect(isBetaAllowed('antoniocanerosan+test@gmail.com')).toBe(false);
    });

    it('T1.7 — the refusal message does NOT disclose whether the account exists', () => {
        expect(BETA_REFUSAL_MESSAGE).not.toMatch(/exist|already|taken|registered|unknown|not found/i);
    });
});

describe('§2 the gate is wired at EVERY identity entry point', () => {
    // Static assertions against server.js. A behavioural test would need a live
    // Supabase; these prove the check is present and, critically, that it is
    // present at all four doors rather than only the obvious one.
    const ENTRY_POINTS = [
        { name: 'POST /api/auth/signup', marker: "app.post('/api/auth/signup'" },
        { name: 'POST /api/auth/signin', marker: "app.post('/api/auth/signin'" },
        { name: 'GET /api/auth/google/callback', marker: "app.get('/api/auth/google/callback'" },
        { name: 'GET /api/auth/microsoft/callback', marker: "app.get('/api/auth/microsoft/callback'" },
    ];

    for (const ep of ENTRY_POINTS) {
        it(`T2 — ${ep.name} calls isBetaAllowed before admitting anyone`, () => {
            const start = serverJs.indexOf(ep.marker);
            expect(start, `${ep.name} not found in server.js — route renamed?`).toBeGreaterThan(-1);
            // Look within the handler body (generous window; handlers here are short).
            const body = serverJs.slice(start, start + 2600);
            expect(body, `${ep.name} has NO isBetaAllowed check`).toContain('isBetaAllowed');
        });
    }

    it('T2.5 — the OAuth gates sit BEFORE upsertOAuthUser (or a refused user is still created)', () => {
        for (const provider of ['google', 'microsoft']) {
            const start = serverJs.indexOf(`app.get('/api/auth/${provider}/callback'`);
            const body = serverJs.slice(start, start + 2600);
            // ⚠ Match the CALL SITES, not the bare identifiers. The first draft of
            // this test searched for `upsertOAuthUser` and matched the word inside
            // the explanatory COMMENT above the gate — reporting the gate as running
            // after the upsert when the code was correct. A test that reads comments
            // as code is a probe measuring the wrong property, and it would have sent
            // someone hunting a bug that did not exist.
            const gateAt = body.indexOf('if (!isBetaAllowed(');
            const upsertAt = body.indexOf('await upsertOAuthUser(');
            expect(gateAt, `${provider}: no gate`).toBeGreaterThan(-1);
            expect(upsertAt, `${provider}: no upsert`).toBeGreaterThan(-1);
            expect(gateAt, `${provider}: gate runs AFTER the upsert — the refused user is created anyway`)
                .toBeLessThan(upsertAt);
        }
    });

    it('T2.6 — signup refuses BEFORE touching the auth store', () => {
        const start = serverJs.indexOf("app.post('/api/auth/signup'");
        const body = serverJs.slice(start, start + 2600);
        expect(body.indexOf('if (!isBetaAllowed(')).toBeLessThan(body.indexOf('await authSignUp('));
    });
});

describe('§3 blocked-attempt notification', () => {
    it('T3.1 — states its transport honestly rather than leaving it to be inferred', () => {
        const s = notifierStatus();
        expect(['log-only', 'resend']).toContain(s.transport);
        expect(s.to).toBeTruthy();
        // With no RESEND_API_KEY the status MUST carry the reason, so a quiet
        // inbox is never mistaken for "nobody tried".
        if (s.transport === 'log-only') expect(s.reason).toMatch(/RESEND_API_KEY/);
    });

    it('T3.2 — never throws and never rejects, whatever it is handed', async () => {
        // Property 2: a notification failure must not turn a clean refusal into a 500.
        __resetAccessNotifierCap();
        await expect(notifyBlockedAccessAttempt({ email: 'x@y.z', surface: 'signup', ip: '1.2.3.4' })).resolves.toBeUndefined();
        await expect(notifyBlockedAccessAttempt({} as never)).resolves.toBeUndefined();
        await expect(notifyBlockedAccessAttempt(undefined as never)).resolves.toBeUndefined();
    });

    it('T3.3 — callers do NOT await it (fire-and-forget at every call site)', () => {
        // `void notify...` is the shape; an `await` here would let a slow mail
        // provider hold the auth response open.
        const calls = serverJs.match(/notifyBlockedAccessAttempt\(/g) ?? [];
        // FIVE surfaces, not four. The fifth is §BETA-GATE-CHECKED-PER-REQUEST
        // (L-754): `authMiddleware` re-checks admission on EVERY request, because
        // gating the four MINT points still left every token minted before the gate
        // valid for its full 30-day life. Issuance and access are different gates.
        expect(calls.length).toBe(5);
        expect(serverJs).not.toMatch(/await\s+notifyBlockedAccessAttempt/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — §BETA-GATE-CHECKED-PER-REQUEST (L-754): admission is re-checked on every
// request, not only when a token is minted.
//
// The launch-readiness audit found the gate bypassable for up to 30 days: the four
// mint points refused non-allowlisted identities, but `authMiddleware` never looked
// again and `TOKEN_EXPIRY = '30d'`. Every token issued BEFORE the gate shipped kept
// working. "Production is closed" was true of issuance and false of access.
// ─────────────────────────────────────────────────────────────────────────────
describe('§4 the gate is re-checked per request, not only at mint', () => {
    it('T4.1 — authMiddleware calls isBetaAllowed', () => {
        const start = serverJs.indexOf('async function authMiddleware(');
        expect(start, 'authMiddleware not found — renamed?').toBeGreaterThan(-1);
        const body = serverJs.slice(start, start + 6000);
        expect(body, 'authMiddleware does NOT re-check the allowlist — pre-gate tokens still work')
            .toContain('isBetaAllowed');
    });

    it('T4.2 — the re-check runs BEFORE req.auth is set to the real user', () => {
        // If the identity is attached first and checked after, any handler reading
        // req.auth in between sees an admitted user. Order is the control.
        const start = serverJs.indexOf('async function authMiddleware(');
        const body = serverJs.slice(start, start + 6000);
        const gateAt = body.indexOf('if (!isBetaAllowed(');
        const assignAt = body.indexOf('req.auth = { userId: payload.sub');
        expect(gateAt).toBeGreaterThan(-1);
        expect(assignAt).toBeGreaterThan(-1);
        expect(gateAt, 'the allowlist re-check runs AFTER the authenticated identity is attached')
            .toBeLessThan(assignAt);
    });

    it('T4.3 — a refused token downgrades to anonymous, it does not fall through', () => {
        const start = serverJs.indexOf('async function authMiddleware(');
        const body = serverJs.slice(start, start + 6000);
        const gateAt = body.indexOf('if (!isBetaAllowed(');
        const block = body.slice(gateAt, gateAt + 700);
        expect(block).toContain("userId: 'anonymous'");
        expect(block).toContain('return next()');
    });

    it('T4.4 — it fails CLOSED: a token with no email claim is refused', () => {
        // An email-less token is BY CONSTRUCTION a pre-gate token — the claim was
        // added with the gate. Its absence is evidence of the age we are voiding.
        // `isBetaAllowed(null)` is already pinned false in §1; this asserts the
        // middleware routes the null case through the same refusal rather than
        // treating "unknown" as "allowed".
        expect(isBetaAllowed(null)).toBe(false);
        const start = serverJs.indexOf('async function authMiddleware(');
        const body = serverJs.slice(start, start + 6000);
        // The check is on `email`, which may be null — not on a truthiness guard
        // that would skip the check entirely when the claim is missing.
        expect(body).toMatch(/if \(!isBetaAllowed\(email\)\)/);
    });
});
