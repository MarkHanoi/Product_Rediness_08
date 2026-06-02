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
import { buildConnectSrc } from '../securityHeaders.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// §4 — oauth-callback-html-leak: the 2 OAuth provider callbacks
// (/api/auth/google/callback + /api/auth/microsoft/callback) used to interpolate
// `err.message` into the popup HTML AND into the postMessage payload to the
// opener — leaking internal paths, SQL traces, or third-party error text into
// the user's screen + browser history. The fix (server.js around lines 1820
// and 1862) generates a short errorId, logs full error server-side, and feeds
// callbackHtml ONLY a sanitised "Sign-in failed. (id <8-char>)" string.
// ─────────────────────────────────────────────────────────────────────────────
describe('§4 oauth-callback-html-leak (the 2 OAuth popup HTML sites)', () => {
    let server: Server, url: string;

    // Local mini-copy of server/oauthService.js#callbackHtml so the test does
    // not have to import the real one (no new imports per task constraint).
    // Must match the real template's interpolation surface 1:1 — the payload
    // JSON is embedded in BOTH the <script> body (view-source visible) and
    // the postMessage payload to the opener.
    function callbackHtml(payload: Record<string, unknown>, origin?: string): string {
        const json = JSON.stringify(payload).replace(/</g, '\\u003c');
        return `<!DOCTYPE html><html><body><script>
(function(){
  var payload = ${json};
  var target  = ${JSON.stringify(origin ?? '*')};
  try { if (window.opener) window.opener.postMessage({ type: 'pryzm-oauth', payload: payload }, target); } catch(e){}
})();
</script></body></html>`;
    }

    // Exact shape of server.js's OAuth catch-block fix (sites at ~L1820 + ~L1862).
    function handleOauthCallback(providerTag: string, res: express.Response, err: unknown) {
        const errorId = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID().split('-')[0]
            : `err-${Date.now().toString(36)}`;
        console.error(`[${providerTag}] errorId=${errorId}`, err);
        res.send(callbackHtml({ error: `Sign-in failed. (id ${errorId})` }));
    }

    beforeAll(async () => {
        const app = express();

        // Forced-error endpoints: simulate the catch branch of each provider's
        // callback when the userinfo fetch / token exchange throws.
        app.get('/api/auth/google/callback', (_req, res) => {
            const err = new Error(
                'GoogleProfileFetchError: SECRET-INTERNAL-PATH /home/runner/server/oauth.json; tokens=sk_live_LEAKED',
            );
            return handleOauthCallback('oauth-google-callback', res, err);
        });

        app.get('/api/auth/microsoft/callback', (_req, res) => {
            const err = new Error(
                'MicrosoftProfileFetchError: SECRET-INTERNAL-PATH /home/runner/server/oauth.json; SQLSTATE 23505',
            );
            return handleOauthCallback('oauth-microsoft-callback', res, err);
        });

        const a = await listen(app);
        server = a.server; url = a.url;
    });

    afterAll(async () => { await close(server); });

    it('T4.1 — google callback popup HTML does NOT leak err.message + DOES carry "id <8-char>"', async () => {
        const r = await fetch(`${url}/api/auth/google/callback`);
        expect(r.status).toBe(200); // popup is always a 200 HTML page
        const body = await r.text();

        // The previously-leaked error text MUST be absent from BOTH the HTML
        // body and the embedded postMessage payload (single string check
        // covers both surfaces because they share the JSON interpolation).
        expect(body).not.toContain('SECRET-INTERNAL-PATH');
        expect(body).not.toContain('/home/runner/server/oauth.json');
        expect(body).not.toContain('sk_live_LEAKED');
        expect(body).not.toContain('GoogleProfileFetchError');

        // The sanitised message + an 8-char correlation id must be present
        // (so the user can quote it to support).
        expect(body).toContain('Sign-in failed.');
        expect(body).toMatch(/id [0-9a-f]{8}/);
    });

    it('T4.2 — microsoft callback popup HTML does NOT leak err.message + DOES carry "id <8-char>"', async () => {
        const r = await fetch(`${url}/api/auth/microsoft/callback`);
        expect(r.status).toBe(200);
        const body = await r.text();

        expect(body).not.toContain('SECRET-INTERNAL-PATH');
        expect(body).not.toContain('/home/runner/server/oauth.json');
        expect(body).not.toContain('SQLSTATE 23505');
        expect(body).not.toContain('MicrosoftProfileFetchError');

        expect(body).toContain('Sign-in failed.');
        expect(body).toMatch(/id [0-9a-f]{8}/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — apex-route-surface (C51 §3.2.1): the app MUST NOT render apex marketing
// routes in-place. When reached as the app surface (app.pryzm.so), a request for
// /pricing, /manifesto, or /trust must 301 to the apex equivalent rather than
// fall through to the SPA catch-all. Local dev + the apex itself are unaffected
// (hostname guard). Mirrors the block in server.js immediately above the static
// / Vite middleware.
// ─────────────────────────────────────────────────────────────────────────────
describe('§5 apex-route-surface redirect (C51 §3.2.1)', () => {
    let server: Server, url: string;

    // Exact copy of server.js's C51 §3.2.1 block.
    const APEX_ORIGIN = 'https://pryzm.so';
    const APP_HOSTS = new Set(['app.pryzm.so', 'api.pryzm.so']);

    beforeAll(async () => {
        const app = express();
        // trust the X-Forwarded-Host the test sets, the way Fly's two-hop chain does.
        app.set('trust proxy', 2);
        app.get(['/pricing', '/manifesto', '/trust'], (req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (APP_HOSTS.has((req.hostname || '').toLowerCase())) {
                return res.redirect(301, `${APEX_ORIGIN}${req.path}`);
            }
            return next();
        });
        // SPA catch-all stand-in: anything not redirected renders the "editor shell".
        app.get('*', (_req: express.Request, res: express.Response) => res.status(200).send('<html>editor-shell</html>'));
        const a = await listen(app);
        server = a.server; url = a.url;
    });

    afterAll(async () => { await close(server); });

    for (const path of ['/pricing', '/manifesto', '/trust']) {
        it(`T5.1 — app.pryzm.so${path} → 301 → pryzm.so${path}`, async () => {
            const r = await fetch(`${url}${path}`, {
                headers: { 'X-Forwarded-Host': 'app.pryzm.so', 'X-Forwarded-Proto': 'https' },
                redirect: 'manual',
            });
            expect(r.status).toBe(301);
            expect(r.headers.get('location')).toBe(`https://pryzm.so${path}`);
        });
    }

    it('T5.2 — localhost (dev) does NOT redirect — renders the editor shell', async () => {
        // No X-Forwarded-Host → req.hostname is 127.0.0.1, not an app host.
        const r = await fetch(`${url}/pricing`, { redirect: 'manual' });
        expect(r.status).toBe(200);
        expect(await r.text()).toContain('editor-shell');
    });

    it('T5.3 — a non-marketing path on the app host is untouched (falls through)', async () => {
        const r = await fetch(`${url}/projects`, {
            headers: { 'X-Forwarded-Host': 'app.pryzm.so', 'X-Forwarded-Proto': 'https' },
            redirect: 'manual',
        });
        expect(r.status).toBe(200);
        expect(await r.text()).toContain('editor-shell');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 — CSP connect-src is configuration-derived (C51 §3.1.2.2). buildConnectSrc
// derives the EXACT Supabase project origin from SUPABASE_URL (no wildcard when
// configured), never emits a third-party AI origin (the browser uses the
// same-origin BFF), and permits insecure ws: only in development.
// ─────────────────────────────────────────────────────────────────────────────
describe('§6 connect-src config-derivation (C51 §3.1.2.2)', () => {
    it('T6.1 — SUPABASE_URL set → exact project origin (https+wss), NO *.supabase.co wildcard', () => {
        const src = buildConnectSrc({ SUPABASE_URL: 'https://abcdef123.supabase.co' }, true);
        expect(src).toContain('https://abcdef123.supabase.co');
        expect(src).toContain('wss://abcdef123.supabase.co');
        expect(src).not.toContain('https://*.supabase.co');
    });

    it('T6.2 — SUPABASE_URL unset → SAFE fallback to the *.supabase.co wildcard (never breaks persistence)', () => {
        const src = buildConnectSrc({}, true);
        expect(src).toContain('https://*.supabase.co');
        expect(src).toContain('wss://*.supabase.co');
    });

    it('T6.3 — malformed SUPABASE_URL → falls back to the wildcard rather than throwing', () => {
        const src = buildConnectSrc({ SUPABASE_URL: 'not a url' }, true);
        expect(src).toContain('https://*.supabase.co');
    });

    it('T6.4 — NO third-party AI origin (CF_WORKER_URL is never reflected into connect-src)', () => {
        const src = buildConnectSrc({ CF_WORKER_URL: 'https://worker.example.workers.dev' }, true);
        expect(src.some((s) => s.includes('workers.dev'))).toBe(false);
    });

    it('T6.5 — insecure ws: is dev-only; production is wss-only; Cesium + self always present', () => {
        const prod = buildConnectSrc({}, true);
        const dev = buildConnectSrc({}, false);
        expect(prod).not.toContain('ws:');
        expect(dev).toContain('ws:');
        for (const s of [prod, dev]) {
            expect(s).toContain("'self'");
            expect(s).toContain('wss:');
            expect(s).toContain('https://api.cesium.com');
        }
    });
});
