/**
 * server/__tests__/stripe-webhook-idempotency.test.ts
 * ============================================================================
 * §STRIPE-WEBHOOK-IDEMPOTENT (L-778) — two money defects the launch-readiness
 * audit found in `POST /api/stripe/webhook`:
 *
 *   1. The plan-persist DB write was FIRE-AND-FORGET with `.catch(warn)`, so a
 *      failed write still fell through to `res.json({received: true})`. Stripe
 *      treats 200 as delivered and NEVER RETRIES — a customer could pay, the
 *      write could fail, and the plan would exist only in an in-memory cache
 *      until the next restart. Silent revenue loss with nothing to reconcile.
 *   2. NO event deduplication at all. Stripe delivers AT LEAST ONCE, so a
 *      redelivered `checkout.session.completed` inserted a second purchase row.
 *
 * These are STATIC assertions against server.js. A behavioural test needs a live
 * Postgres and a signature-valid Stripe payload; what actually regresses here is
 * someone reintroducing a non-awaited write or dropping the ledger, and that is
 * plainly visible in the source. Stated so nobody mistakes this for proof that a
 * real webhook was exercised — it is not.
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverJs = readFileSync(resolve(repoRoot, 'server.js'), 'utf8');

const start = serverJs.indexOf("app.post('/api/stripe/webhook'");
const handler = serverJs.slice(start, start + 14000);

describe('§1 the webhook claims each event before doing work', () => {
    it('T1.1 — the webhook route still exists', () => {
        expect(start, 'route renamed or removed — these assertions would silently pass on an empty slice')
            .toBeGreaterThan(-1);
    });

    it('T1.2 — the event is CLAIMED in the ledger before any business logic', () => {
        const claimAt = handler.indexOf('stripe_webhook_events');
        const switchAt = handler.indexOf('switch (event.type)');
        expect(claimAt, 'no idempotency ledger claim').toBeGreaterThan(-1);
        expect(switchAt).toBeGreaterThan(-1);
        expect(claimAt, 'the claim runs AFTER the handler body — duplicates would be processed')
            .toBeLessThan(switchAt);
    });

    it('T1.3 — a duplicate delivery returns 200 without reprocessing', () => {
        expect(handler).toMatch(/duplicate: true/);
    });

    it('T1.4 — the claim is promoted to completed only AFTER processing', () => {
        // If the event were marked done on arrival, a crash between claim and
        // writes would make every future retry a silent no-op — stranding a
        // customer who has PAID, with no way for Stripe to fix it.
        const completeAt = handler.indexOf("status = 'completed'");
        const switchAt = handler.indexOf('switch (event.type)');
        expect(completeAt, "no 'completed' promotion").toBeGreaterThan(-1);
        expect(completeAt, 'the event is marked completed BEFORE the work runs')
            .toBeGreaterThan(switchAt);
    });

    it('T1.5 — an unreachable ledger REFUSES rather than risking a double-provision', () => {
        // Cannot reach the ledger ⇒ cannot prove this is not a duplicate.
        // Processing anyway risks double-charging work; 503 asks Stripe to retry.
        expect(handler).toMatch(/idempotency_ledger_unavailable/);
        expect(handler).toMatch(/res\.status\(503\)/);
    });
});

describe('§2 the plan persist can no longer fail silently', () => {
    it('T2.1 — the plan UPDATE is AWAITED, not fire-and-forget', () => {
        expect(handler).toMatch(/await pgQuery\(\s*`UPDATE pryzm_users/);
    });

    it('T2.2 — no plan write is swallowed by .catch(warn)', () => {
        // The exact regression shape: pgQuery(...).catch(err => console.warn(...))
        // around the pryzm_users update. If this returns, a 200 hides a failed
        // provision and Stripe never retries.
        const planWrite = handler.slice(handler.indexOf('UPDATE pryzm_users'));
        const next400 = planWrite.slice(0, 400);
        expect(next400, 'the plan write is still swallowed — 200 would hide a failed provision')
            .not.toMatch(/\.catch\(err =>\s*console\.warn/);
    });

    it('T2.3 — a 0-row plan UPDATE is treated as a FAILURE', () => {
        // Postgres reports no error when WHERE matches nothing, so an unknown or
        // renamed userId in Stripe metadata looked identical to a successful
        // provision. Same shape as the thumbnail 0-row UPDATE that returned ok:true.
        expect(handler).toMatch(/rowCount \?\? 0\) === 0/);
        expect(handler).toMatch(/matched 0 rows/);
    });

    it('T2.4 — processing failure returns 500 so Stripe retries', () => {
        expect(handler).toMatch(/res\.status\(500\)\.json\(\{ error: 'Event processing failed\.' \}\)/);
    });
});

describe('§3 the ledger schema exists and is shaped for reclaim', () => {
    const migrate = readFileSync(resolve(repoRoot, 'server', 'dbMigrate.js'), 'utf8');

    it('T3.1 — stripe_webhook_events table is declared', () => {
        expect(migrate).toMatch(/CREATE TABLE IF NOT EXISTS stripe_webhook_events/);
    });

    it('T3.2 — it carries a status column, not just a set of seen ids', () => {
        // A bare id set cannot distinguish "done" from "started and crashed",
        // which is the difference between a safe retry and a stranded payment.
        const t = migrate.slice(migrate.indexOf('CREATE TABLE IF NOT EXISTS stripe_webhook_events'));
        expect(t.slice(0, 800)).toMatch(/status\s+TEXT/);
    });

    it('T3.3 — the migration is additive (IF NOT EXISTS), matching repo convention', () => {
        // dbMigrate.js is purely additive and idempotent under an advisory lock,
        // which is what makes an image rollback schema-safe. Do not break that.
        expect(migrate).toMatch(/CREATE TABLE IF NOT EXISTS stripe_webhook_events/);
        expect(migrate).toMatch(/CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status/);
    });
});
