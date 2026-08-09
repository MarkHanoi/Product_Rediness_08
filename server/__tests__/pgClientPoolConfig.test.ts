/**
 * server/__tests__/pgClientPoolConfig.test.ts
 *
 * §FIX-POOL-CAPACITY (L-787) — the pool sizing and the statement timeout that
 * §D7 had to remove on the transaction-pooler path.
 *
 * TWO DEFECTS, ONE FILE
 * ---------------------
 * 1. `max: 10` was the whole application's database capacity — every hub load,
 *    project open, autosave, thumbnail PATCH, command-log insert, AI-usage write
 *    and health probe, in a single process. Overflow does not fail fast; it
 *    queues for `connectionTimeoutMillis` (10 s) and then 500s.
 *
 * 2. §D7 correctly disabled the session-level `SET statement_timeout` on a
 *    transaction pooler — the SET hangs there and collided with the preflight
 *    SELECT 1. But disabling it left the PRODUCTION path (Supabase Supavisor)
 *    with NO runaway-query protection at all, which is the configuration where
 *    a stuck statement holding 1 of 10 slots is most damaging. The guard was
 *    removed and never replaced.
 *
 * WHY `SET LOCAL` IS THE ANSWER, AND WHY NOT THE CONNECTION STRING
 * ----------------------------------------------------------------
 * A transaction pooler pins a backend for the duration of a TRANSACTION, so
 * transaction-scoped state is exactly the state it CAN carry. `SET LOCAL` inside
 * the transaction therefore works where a session `SET` cannot, and it is folded
 * into the same round trip as `BEGIN` so it costs no extra latency.
 *
 * The connection-string route (`?options=-c%20statement_timeout%3D60s`) would
 * also cover single statements outside a transaction — but poolers vary in
 * whether they accept startup-packet `options`, and one that rejects it fails
 * EVERY connection, i.e. a total outage. That cannot be verified from here, so it
 * is available behind `PG_STATEMENT_TIMEOUT_VIA_OPTIONS` and defaults OFF. The
 * bounded thing is bounded; the unverifiable thing is opt-in with its risk stated.
 *
 * Contract: C05 §1.3.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildPoolConfig, buildTransactionPreamble, isTransactionPooler } from '../pgClient.js';

const DIRECT = 'postgresql://u:p@db.example.supabase.co:5432/postgres';
const POOLER = 'postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const SAVED = { ...process.env };
beforeEach(() => {
    delete process.env.PG_POOL_MAX;
    delete process.env.PG_STATEMENT_TIMEOUT_MS;
    delete process.env.PG_STATEMENT_TIMEOUT_VIA_OPTIONS;
});
afterEach(() => {
    process.env = { ...SAVED };
    vi.restoreAllMocks();
});

describe('§FIX-POOL-CAPACITY (L-787) — pool sizing', () => {
    it('defaults to a pool larger than the old hard-coded 10', () => {
        // The specific number is a tuning decision (see the constant's comment);
        // what this pins is that the application is no longer capped at ten
        // connections by a literal nobody can override without a deploy.
        expect(buildPoolConfig(DIRECT).max).toBeGreaterThan(10);
    });

    it('is overridable by PG_POOL_MAX, because the right value depends on instance count', () => {
        process.env.PG_POOL_MAX = '40';
        expect(buildPoolConfig(DIRECT).max).toBe(40);
    });

    it('ignores a nonsensical PG_POOL_MAX rather than creating a 0- or NaN-sized pool', () => {
        // A pool of 0 deadlocks the whole server, and `Number(undefined)` is NaN.
        // Fail back to the default; never let a typo in an env var take the app down.
        for (const bad of ['0', '-5', 'lots', '']) {
            process.env.PG_POOL_MAX = bad;
            expect(buildPoolConfig(DIRECT).max).toBeGreaterThan(10);
        }
    });

    it('keeps SSL off for localhost and on (unverified) for remote', () => {
        expect(buildPoolConfig('postgresql://u:p@localhost:5432/db').ssl).toBe(false);
        expect(buildPoolConfig(DIRECT).ssl).toEqual({ rejectUnauthorized: false });
    });
});

describe('§FIX-POOL-CAPACITY (L-787) — transaction-pooler detection', () => {
    it('recognises the Supavisor host, the :6543 port and an explicit pgbouncer flag', () => {
        expect(isTransactionPooler(POOLER)).toBe(true);
        expect(isTransactionPooler('postgresql://u:p@h:6543/db')).toBe(true);
        expect(isTransactionPooler('postgresql://u:p@h:5432/db?pgbouncer=true')).toBe(true);
    });

    it('does not mistake a direct connection for a pooler', () => {
        expect(isTransactionPooler(DIRECT)).toBe(false);
        expect(isTransactionPooler('postgresql://u:p@localhost:5432/db')).toBe(false);
    });
});

describe('§FIX-POOL-CAPACITY (L-787) — the timeout §D7 removed is restored per transaction', () => {
    it('folds BEGIN and the timeouts into ONE statement (no extra round trip)', () => {
        const sql = buildTransactionPreamble();
        // One string → one round trip. Issuing SET LOCAL as a second query would
        // add a round trip to every transaction on a hot path, which is how a
        // safety guard turns into a latency regression nobody wants to keep.
        expect(sql.startsWith('BEGIN')).toBe(true);
        expect(sql).toMatch(/SET LOCAL statement_timeout/i);
        expect(sql).toMatch(/SET LOCAL idle_in_transaction_session_timeout/i);
    });

    it('uses SET LOCAL, never a session SET — the distinction §D7 turned on', () => {
        // A session-level SET is what hangs on a transaction pooler and collided
        // with the preflight SELECT 1. SET LOCAL is transaction-scoped, which is
        // exactly the unit a transaction pooler pins.
        const sql = buildTransactionPreamble();
        expect(sql).not.toMatch(/(^|;)\s*SET\s+statement_timeout/i);
        expect(sql).not.toMatch(/(^|;)\s*SET\s+idle_in_transaction/i);
    });

    it('honours PG_STATEMENT_TIMEOUT_MS', () => {
        process.env.PG_STATEMENT_TIMEOUT_MS = '15000';
        expect(buildTransactionPreamble()).toMatch(/statement_timeout = '15000ms'/i);
    });

    it('never interpolates an unvalidated env value into the SQL', () => {
        // The preamble is built by string concatenation and runs as a simple
        // query with no parameters — so a non-numeric env var must be rejected
        // outright, not passed through.
        process.env.PG_STATEMENT_TIMEOUT_MS = "0'; DROP TABLE projects; --";
        const sql = buildTransactionPreamble();
        expect(sql).not.toMatch(/DROP TABLE/i);
        expect(sql).toMatch(/statement_timeout = '\d+ms'/i);
    });
});

describe('§FIX-POOL-CAPACITY (L-787) — the connection-string route is opt-in', () => {
    it('does NOT add startup options by default, on either connection kind', () => {
        // Default OFF is the point: a pooler that rejects startup-packet options
        // fails EVERY connection. That is a total outage traded for a guard we
        // already have transaction-scoped.
        expect(buildPoolConfig(POOLER).connectionString).toBe(POOLER);
        expect(buildPoolConfig(DIRECT).connectionString).toBe(DIRECT);
    });

    it('adds them when explicitly enabled, preserving an existing query string', () => {
        process.env.PG_STATEMENT_TIMEOUT_VIA_OPTIONS = '1';
        process.env.PG_STATEMENT_TIMEOUT_MS = '60000';
        const withQs = buildPoolConfig(`${POOLER}?sslmode=require`).connectionString;
        expect(withQs).toContain('sslmode=require');
        expect(withQs).toContain('options=');
        expect(withQs).toMatch(/statement_timeout/);
        // and uses `?` when there was no query string to append to
        expect(buildPoolConfig(POOLER).connectionString).toContain('?options=');
    });
});
