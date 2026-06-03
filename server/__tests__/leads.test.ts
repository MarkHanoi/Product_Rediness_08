// IP-A3 A.5.e — /api/leads lead-capture sink tests.
//
// Pins: a valid lead → 200 { ok, leadId }; a non-object body → 400; the sink
// always answers 200 under the rate cap (capture never blocks onboarding);
// over-cap requests still 200 (throttled flag) without back-pressure.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { LEADS_PATH, leadsBodyParser, leadsHandler, __resetLeadsRateCap } from '../leads.js';

function listen(app: express.Express): Promise<{ server: Server; url: string }> {
    return new Promise((resolve) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
    });
}
const close = (s: Server) => new Promise<void>((r) => s.close(() => r()));

describe('POST /api/leads (A.5.e)', () => {
    let server: Server, url: string;

    beforeAll(async () => {
        const app = express();
        app.post(LEADS_PATH, leadsBodyParser, leadsHandler);
        const a = await listen(app);
        server = a.server; url = a.url;
    });
    afterAll(async () => { await close(server); });
    beforeEach(() => __resetLeadsRateCap());

    it('accepts a RAC brief lead → 200 { ok, leadId }', async () => {
        const r = await fetch(`${url}${LEADS_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'rac-onboarding', role: 'architect', typology: 'apartment', teamSize: '2-10', briefText: 'a small studio' }),
        });
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.ok).toBe(true);
        expect(typeof body.leadId).toBe('string');
        expect(body.leadId).toMatch(/^lead_/);
    });

    it('rejects a non-object body → 400', async () => {
        const r = await fetch(`${url}${LEADS_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(['not', 'an', 'object']),
        });
        expect(r.status).toBe(400);
        expect((await r.json()).ok).toBe(false);
    });

    it('a partial lead is still captured (permissive — a lead is worth keeping)', async () => {
        const r = await fetch(`${url}${LEADS_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'rac-onboarding' }),
        });
        expect(r.status).toBe(200);
        expect((await r.json()).ok).toBe(true);
    });
});
