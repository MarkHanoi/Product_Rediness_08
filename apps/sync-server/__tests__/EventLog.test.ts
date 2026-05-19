// Spec source: PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md S22 line 968 —
// sequence numbers MUST be monotonic and gap-free within a project.

import { describe, expect, it } from 'vitest';
import { InMemoryEventLog } from '../src/eventLog/InMemoryEventLog.js';
import { hashProjectId } from '../src/eventLog/PgEventLog.js';

const ev = (id: string, type = 'wall.create', payload: unknown = {}) => ({
  id,
  type,
  actorId: 'u1',
  payload,
});

describe('InMemoryEventLog', () => {
  it('assigns 1-based sequence numbers in append order', async () => {
    const log = new InMemoryEventLog();
    const r1 = await log.append('p1', ev('e1'));
    const r2 = await log.append('p1', ev('e2'));
    const r3 = await log.append('p1', ev('e3'));
    expect(r1.sequenceNumber).toBe(1);
    expect(r2.sequenceNumber).toBe(2);
    expect(r3.sequenceNumber).toBe(3);
  });

  it('keeps sequence numbers gap-free under burst concurrency', async () => {
    const log = new InMemoryEventLog();
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => log.append('p1', ev(`e${i}`))),
    );
    const seqs = results.map((r) => r.sequenceNumber).sort((a, b) => a - b);
    for (let i = 0; i < N; i++) {
      expect(seqs[i]).toBe(i + 1);
    }
  });

  it('isolates sequence streams per project', async () => {
    const log = new InMemoryEventLog();
    const a1 = await log.append('A', ev('a1'));
    const b1 = await log.append('B', ev('b1'));
    const a2 = await log.append('A', ev('a2'));
    expect(a1.sequenceNumber).toBe(1);
    expect(b1.sequenceNumber).toBe(1); // independent stream
    expect(a2.sequenceNumber).toBe(2);
  });

  it('dedups by event id (replay returns the original sequence)', async () => {
    const log = new InMemoryEventLog();
    const r1 = await log.append('p1', ev('e1'));
    const r2 = await log.append('p1', ev('e1'));
    expect(r1.sequenceNumber).toBe(1);
    expect(r2.sequenceNumber).toBe(1); // same — not 2
    expect(log.snapshot('p1')).toHaveLength(1);
  });

  it('load respects fromSeq exclusivity and the page limit', async () => {
    const log = new InMemoryEventLog();
    for (let i = 1; i <= 10; i++) await log.append('p1', ev(`e${i}`));
    const page = await log.load('p1', 3, 4);
    expect(page.events.map((e) => e.sequenceNumber)).toEqual([4, 5, 6, 7]);
    expect(page.nextSeq).toBe(7);
    expect(page.done).toBe(false);

    const tail = await log.load('p1', 7, 4);
    expect(tail.events.map((e) => e.sequenceNumber)).toEqual([8, 9, 10]);
    expect(tail.done).toBe(true);
  });

  it('load returns empty for unknown project', async () => {
    const log = new InMemoryEventLog();
    const page = await log.load('nope', 0, 10);
    expect(page.events).toEqual([]);
    expect(page.done).toBe(true);
  });

  it('latestSeq returns 0 for unknown project, last seq otherwise', async () => {
    const log = new InMemoryEventLog();
    expect(await log.latestSeq('p1')).toBe(0);
    await log.append('p1', ev('e1'));
    await log.append('p1', ev('e2'));
    expect(await log.latestSeq('p1')).toBe(2);
  });

  it('append fails after close()', async () => {
    const log = new InMemoryEventLog();
    await log.close();
    await expect(log.append('p1', ev('e1'))).rejects.toThrow(/closed/);
  });
});

describe('hashProjectId (FNV-1a 32-bit)', () => {
  it('returns a value within JS safe-int range', () => {
    const h = hashProjectId('a-very-long-project-id-' + 'x'.repeat(100));
    expect(Number.isSafeInteger(h)).toBe(true);
  });

  it('is deterministic for the same projectId', () => {
    expect(hashProjectId('p1')).toBe(hashProjectId('p1'));
    expect(hashProjectId('p1')).not.toBe(hashProjectId('p2'));
  });
});
