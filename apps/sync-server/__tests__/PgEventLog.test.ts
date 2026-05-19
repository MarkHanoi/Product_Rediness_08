// PgEventLog tests against a stubbed PgPoolLike — no live Postgres
// required.  Verifies SQL shape + advisory-lock acquire/release order
// + dedup behaviour.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PgEventLog, type PgPoolLike } from '../src/eventLog/PgEventLog.js';

interface QueryCall {
  text: string;
  values: readonly unknown[] | undefined;
}

class StubPool implements PgPoolLike {
  readonly calls: QueryCall[] = [];
  /** Map of canned answers keyed by a SQL substring matcher. */
  responses: Array<{ match: RegExp; rows: unknown[] }> = [];
  /** Per-(project_id, event_id) pseudo-table for dedup tests. */
  rows = new Map<string, { event_id: string; created_at: Date }>();
  ended = false;

  async query<T = unknown>(text: string, values?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, values });
    // CREATE TABLE / CREATE INDEX
    if (/CREATE TABLE|CREATE INDEX/i.test(text)) return { rows: [] as T[] };
    if (/pg_advisory_lock|pg_advisory_unlock/i.test(text)) return { rows: [] as T[] };
    if (/INSERT INTO/i.test(text)) {
      const projectId = values?.[0] as string;
      const eventId = values?.[1] as string;
      const key = `${projectId}::${eventId}`;
      if (this.rows.has(key)) {
        return { rows: [] as T[] }; // ON CONFLICT DO NOTHING
      }
      const created = new Date('2026-04-27T10:00:00Z');
      this.rows.set(key, { event_id: eventId, created_at: created });
      return { rows: [{ created_at: created }] as T[] };
    }
    if (/SELECT created_at/i.test(text)) {
      const key = `${values?.[0]}::${values?.[1]}`;
      const r = this.rows.get(key);
      return { rows: r ? [{ created_at: r.created_at }] as T[] : [] };
    }
    if (/SELECT COUNT\(\*\)/i.test(text)) {
      const projectId = values?.[0] as string;
      let n = 0;
      for (const k of this.rows.keys()) if (k.startsWith(projectId + '::')) n++;
      return { rows: [{ n: String(n) }] as T[] };
    }
    if (/ROW_NUMBER/i.test(text)) {
      const projectId = values?.[0] as string;
      const fromSeq = values?.[1] as number;
      const limit = values?.[2] as number;
      const all = Array.from(this.rows.entries())
        .filter(([k]) => k.startsWith(projectId + '::'))
        .map(([_k, v], idx) => ({
          seq: String(idx + 1),
          event_id: v.event_id,
          event_type: 'wall.create',
          actor_id: 'u1',
          event_payload: { foo: 1 },
          created_at: v.created_at,
        }))
        .filter((r) => parseInt(r.seq, 10) > fromSeq)
        .slice(0, limit);
      return { rows: all as T[] };
    }
    return { rows: [] as T[] };
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

const ev = (id: string) => ({ id, type: 'wall.create', actorId: 'u1', payload: { foo: 1 } });

describe('PgEventLog', () => {
  let pool: StubPool;
  let log: PgEventLog;

  beforeEach(() => {
    pool = new StubPool();
    log = new PgEventLog({ pool });
  });
  afterEach(async () => {
    await log.close();
  });

  it('runs CREATE TABLE + CREATE INDEX exactly once across many appends', async () => {
    await log.append('p1', ev('e1'));
    await log.append('p1', ev('e2'));
    const ddl = pool.calls.filter((c) => /CREATE TABLE|CREATE INDEX/i.test(c.text));
    // Two DDL statements, each run once.
    expect(ddl).toHaveLength(2);
  });

  it('wraps the INSERT in pg_advisory_lock + pg_advisory_unlock', async () => {
    await log.append('p1', ev('e1'));
    const callOrder = pool.calls.map((c) => c.text);
    const lockIdx = callOrder.findIndex((t) => /pg_advisory_lock/i.test(t));
    const insertIdx = callOrder.findIndex((t) => /INSERT INTO/i.test(t));
    const unlockIdx = callOrder.findIndex((t) => /pg_advisory_unlock/i.test(t));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(lockIdx);
    expect(unlockIdx).toBeGreaterThan(insertIdx);
  });

  it('uses the same advisory-lock key for the same projectId', async () => {
    await log.append('p1', ev('e1'));
    await log.append('p1', ev('e2'));
    const lockKeys = pool.calls
      .filter((c) => /pg_advisory_lock/i.test(c.text))
      .map((c) => c.values?.[0]);
    expect(lockKeys).toHaveLength(2);
    expect(lockKeys[0]).toBe(lockKeys[1]);
  });

  it('uses different advisory-lock keys for different projectIds', async () => {
    await log.append('p1', ev('e1'));
    await log.append('p2', ev('e1'));
    const lockKeys = pool.calls
      .filter((c) => /pg_advisory_lock/i.test(c.text))
      .map((c) => c.values?.[0]);
    expect(lockKeys[0]).not.toBe(lockKeys[1]);
  });

  it('dedups duplicate event ids and returns the original persistedAt', async () => {
    const r1 = await log.append('p1', ev('e1'));
    const r2 = await log.append('p1', ev('e1'));
    expect(r2.sequenceNumber).toBe(r1.sequenceNumber);
    expect(r2.persistedAt).toBe(r1.persistedAt);
    expect(pool.rows.size).toBe(1);
  });

  it('load returns paginated events with per-project sequence numbers', async () => {
    for (let i = 1; i <= 5; i++) await log.append('p1', ev(`e${i}`));
    const page = await log.load('p1', 2, 10);
    expect(page.events.map((e) => e.sequenceNumber)).toEqual([3, 4, 5]);
    expect(page.done).toBe(true);
  });

  it('latestSeq counts rows for the project', async () => {
    expect(await log.latestSeq('p1')).toBe(0);
    await log.append('p1', ev('e1'));
    await log.append('p1', ev('e2'));
    await log.append('p2', ev('x1'));
    expect(await log.latestSeq('p1')).toBe(2);
    expect(await log.latestSeq('p2')).toBe(1);
  });

  it('close() ends the pool and rejects further calls', async () => {
    await log.close();
    expect(pool.ended).toBe(true);
    await expect(log.append('p1', ev('e1'))).rejects.toThrow(/closed/);
  });
});
