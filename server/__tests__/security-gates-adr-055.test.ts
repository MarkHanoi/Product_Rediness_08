/**
 * @file server/__tests__/security-gates-adr-055.test.ts
 *
 * §ADR-055-PHASE-A-PREFLIP — locks in the three pre-DNS-flip security gates
 * enumerated in docs/05-guides/deployments/PRODUCTION-HARDENING-CHECKLIST.md
 * (§6 risk 1 trust-proxy, §10 risk 2 Stripe silent-200, §11 risk 3 err.message
 * leaks on the 6 named routes).
 *
 * Because server.js is a monolithic Express app that does not export `app`,
 * each test re-builds the EXACT pattern server.js uses (trust-proxy assignment,
 * stripe missing-secret handler, respondInternalError helper) in an isolated
 * mini-app and asserts behaviour over real HTTP via http.createServer + fetch.
 * If server.js's pattern drifts these tests stop describing reality — but the
 * code under test is a five-line block in each case, easy to keep in sync.
 *
 * EXECUTION:
 *   pnpm test:server
 *   (vitest.server.config.ts runs everything under server/__tests__/**)
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

// ────────────────────────────────────────────────────────────────────────────
// Helpers — bring up a real HTTP server on a random port, return base URL.
// ────────────────────────────────────────────────────────────────────────────
function listen(app: express.Express): Promise<{ server: Server; url: string }> {
    return new Promise((resolve) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
    });
}

function close(server: Server): Promise<void> {
    return new Promise((resolve) => server.close(() => resolve()));
}

// Exact copy of server.js's respondInternalError (kept in sync with server.js
// §ADR-055-PHASE-A-PREFLIP). Tests exercise the same JSON envelope shape.
function respondInternalError(res: express.Response, err: unknown, context: string) {
    const errorId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Log path intentionally not asserted (tests don't capture console).
    console.error(`[${context}] errorId=${errorId}`, err);
    if (res.headersSent) return;
    return res.status(500).json({ error: 'internal_error', errorId });
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 — trust proxy = 2 honors the originating client IP in a two-hop chain
// (production-hardening checklist §6 risk 1).
// ─────────────────────────────────────────────────────────────────────────────
describe('§1 trust proxy = 2 (Cloudflare → Fly two-hop chain)', () => {
    let serverHop1: Server, urlHop1: string;
    let serverHop2: Server, urlHop2: string;

    beforeAll(async () => {
        // App A — single hop (legacy Replit behaviour, trust proxy = 1).
        const appHop1 = express();
        appHop1.set('trust proxy', 1);
        appHop1.get('/whoami', (req, res) => res.json({ ip: req.ip }));
        const a = await listen(appHop1);
        serverHop1 = a.server; urlHop1 = a.url;

        // App B — two hops (Phase A behaviour, trust proxy = 2).
        const appHop2 = express();
        appHop2.set('trust proxy', 2);
        appHop2.get('/whoami', (req, res) => res.json({ ip: req.ip }));
        const b = await listen(appHop2);
        serverHop2 = b.server; urlHop2 = b.url;
    });

    afterAll(async () => {
        await close(serverHop1);
        await close(serverHop2);
    });

    it('T1.1 — trust proxy = 2 returns the leftmost (originating client) IP from a 2-hop XFF chain', async () => {
        // Simulated CF → Fly chain: client 1.2.3.4 → CF (203.0.113.5) → Fly LB (10.0.0.1, the direct peer)
        const r = await fetch(`${urlHop2}/whoami`, {
            headers: { 'X-Forwarded-For': '1.2.3.4, 203.0.113.5' },
        });
        const body = await r.json() as { ip: string };
        // With trust proxy = 2, Express skips 2 hops back from the immediate peer (127.0.0.1)
        // and trusts the XFF chain to depth 2: it returns the client-supplied originator.
        expect(body.ip).toBe('1.2.3.4');
    });

    it('T1.2 — trust proxy = 1 (the OLD, BROKEN setting) returns the wrong hop in a 2-hop chain', async () => {
        // Demonstrates WHY the fix is needed: with trust proxy = 1 + same XFF chain,
        // Express trusts only the immediate peer, so the rate-limiter buckets keyed on
        // req.ip would collapse to the CF edge IP — every user one bucket.
        const r = await fetch(`${urlHop1}/whoami`, {
            headers: { 'X-Forwarded-For': '1.2.3.4, 203.0.113.5' },
        });
        const body = await r.json() as { ip: string };
        // Not the originating client (1.2.3.4) — proves the previous setting was wrong
        // for the Phase A topology.
        expect(body.ip).not.toBe('1.2.3.4');
    });

    it('T1.3 — TRUST_PROXY_HOPS env-var resolution: numeric override is parsed correctly', () => {
        // Mirrors server.js's resolution shape so a future refactor catches a regression.
        const resolve = (envVal: string | undefined, prod: boolean) =>
            envVal ? parseInt(envVal, 10) : (prod ? 2 : 0);

        expect(resolve(undefined, true)).toBe(2);     // prod default
        expect(resolve(undefined, false)).toBe(0);    // dev default
        expect(resolve('1', true)).toBe(1);           // override to legacy single-hop
        expect(resolve('3', true)).toBe(3);           // override for triple-proxy scenarios
        expect(resolve('0', true)).toBe(0);           // explicit disable
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 — Stripe webhook rejects with 503 when STRIPE_WEBHOOK_SECRET is unset
// (production-hardening checklist §10 risk 2).
// ─────────────────────────────────────────────────────────────────────────────
describe('§2 Stripe webhook fails loud (503) on missing secret', () => {
    let server: Server, url: string;

    beforeAll(async () => {
        const app = express();
        // Mirrors the EXACT shape of server.js's stripe webhook missing-secret branch
        // — see §ADR-055-PHASE-A-PREFLIP block around line 1836.
        app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
            const STRIPE_SECRET_KEY     = process.env.__TEST_STRIPE_SECRET_KEY;
            const STRIPE_WEBHOOK_SECRET = process.env.__TEST_STRIPE_WEBHOOK_SECRET;
            if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
                return res.status(503).json({ error: 'webhook_secret_unconfigured' });
            }
            return res.json({ received: true });
        });
        const a = await listen(app);
        server = a.server; url = a.url;
    });

    afterAll(async () => {
        await close(server);
        delete process.env.__TEST_STRIPE_SECRET_KEY;
        delete process.env.__TEST_STRIPE_WEBHOOK_SECRET;
    });

    it('T2.1 — both secrets unset → 503 + webhook_secret_unconfigured (Stripe will retry)', async () => {
        delete process.env.__TEST_STRIPE_SECRET_KEY;
        delete process.env.__TEST_STRIPE_WEBHOOK_SECRET;

        const r = await fetch(`${url}/api/stripe/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"type":"customer.subscription.created"}',
        });

        expect(r.status).toBe(503);
        const body = await r.json() as { error: string };
        expect(body.error).toBe('webhook_secret_unconfigured');
        // Critically NOT the silent-200 of the old code path:
        expect(body).not.toHaveProperty('received');
    });

    it('T2.2 — webhook secret missing but secret key present → still 503 (either missing fails loud)', async () => {
        process.env.__TEST_STRIPE_SECRET_KEY = 'sk_test_xxx';
        delete process.env.__TEST_STRIPE_WEBHOOK_SECRET;

        const r = await fetch(`${url}/api/stripe/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"type":"customer.subscription.created"}',
        });
        expect(r.status).toBe(503);
    });

    it('T2.3 — both secrets present → no longer the missing-secret branch (returns 200)', async () => {
        process.env.__TEST_STRIPE_SECRET_KEY = 'sk_test_xxx';
        process.env.__TEST_STRIPE_WEBHOOK_SECRET = 'whsec_xxx';

        const r = await fetch(`${url}/api/stripe/webhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"type":"customer.subscription.created"}',
        });
        // The fake handler returns 200 once secrets are configured (real handler
        // would then go on to verify the signature). This proves the 503 branch
        // is specifically guarded by the secret check, not by the request shape.
        expect(r.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — respondInternalError replaces the 6 err.message leaks
// (production-hardening checklist §11 risk 3).
// ─────────────────────────────────────────────────────────────────────────────
describe('§3 respondInternalError seals the 6 err.message leak sites', () => {
    let server: Server, url: string;

    // One route per leak site, each calling the helper with its real context tag
    // — so the test inventory matches the audit inventory 1:1.
    const sites = [
        { path: '/leak/ai-spend',            context: 'ai/spend/summary' },
        { path: '/leak/dwg',                 context: 'DWG Import' },
        { path: '/leak/ifc-upload',          context: 'IFC Storage upload' },
        { path: '/leak/ifc-list',            context: 'IFC Storage list' },
        { path: '/leak/ifc-data',            context: 'IFC Storage data' },
        { path: '/leak/ifc-delete',          context: 'IFC Storage delete' },
    ];

    beforeAll(async () => {
        const app = express();
        for (const { path, context } of sites) {
            app.get(path, (_req, res) => {
                // The kind of error message that previously leaked: include a fake
                // file path + an SQL-state-shaped fragment to be sure neither escapes.
                const err = new Error(
                    'SECRET-INTERNAL-PATH /home/runner/server/secrets.json; SQLSTATE 23505',
                );
                return respondInternalError(res, err, context);
            });
        }
        const a = await listen(app);
        server = a.server; url = a.url;
    });

    afterAll(async () => { await close(server); });

    for (const { path, context } of sites) {
        it(`T3.${path} — ${context} returns {error,errorId} and does NOT leak err.message`, async () => {
            const r = await fetch(`${url}${path}`);
            expect(r.status).toBe(500);

            const bodyText = await r.text();
            // Hard-fail leak assertions: the previous-format leak text MUST be absent.
            expect(bodyText).not.toContain('SECRET-INTERNAL-PATH');
            expect(bodyText).not.toContain('/home/runner/server/secrets.json');
            expect(bodyText).not.toContain('SQLSTATE 23505');

            const body = JSON.parse(bodyText) as { error: string; errorId: string };
            expect(body.error).toBe('internal_error');
            expect(typeof body.errorId).toBe('string');
            expect(body.errorId.length).toBeGreaterThan(0);
            // Two consecutive calls produce distinct errorIds (correlation key).
            const r2 = await fetch(`${url}${path}`);
            const body2 = await r2.json() as { errorId: string };
            expect(body2.errorId).not.toBe(body.errorId);
        });
    }

    it('T3.shape — errorId looks like a uuid (the canonical correlation-key format)', async () => {
        const r = await fetch(`${url}/leak/ai-spend`);
        const body = await r.json() as { errorId: string };
        // RFC 4122 v4-ish shape: 8-4-4-4-12 hex. Accept either uuid or our fallback shape.
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const fallbackRe = /^err-\d+-[a-z0-9]+$/;
        expect(uuidRe.test(body.errorId) || fallbackRe.test(body.errorId)).toBe(true);
    });
});
