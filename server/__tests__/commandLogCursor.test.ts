/**
 * commandLogCursor.test.ts — §CATCHUP-CURSOR-NOT-TIMESTAMP (L-10043)
 *
 * ⛔ HANDOFF PROOF for lane PERF5. The first describe block is the one that
 * matters: it DEMONSTRATES A LIVE DEFECT in the shipped catch-up query rather
 * than asserting a preference for integers over timestamps.
 *
 * The defect: `WHERE created_at > $2 ORDER BY created_at ASC LIMIT 500` over a
 * column that is not unique. Postgres `NOW()` is transaction-start time, so a
 * batched write gives every row it inserts the SAME `created_at`. When such a
 * run straddles the page boundary, the client advances past the whole run and
 * the remainder is never delivered.
 */

import { describe, it, expect } from 'vitest';

import {
    formatCompositeCursor,
    parseCompositeCursor,
    nextCompositeCursor,
    compareRows,
    pageByCompositeCursor,
    pageByTimestampCursor,
} from '../commandLogCursor.js';

/**
 * 12 rows. Rows 3..8 share ONE timestamp — the shape a single batched
 * `runBatch()` produces, where every insert carries the transaction start time.
 */
function makeLog() {
    const rows: Array<{ id: string; created_at: string; command_type: string }> = [];
    const push = (id: string, at: string) => rows.push({ id, created_at: at, command_type: 'wall.create' });
    push('c01', '2026-08-23T10:00:00.000Z');
    push('c02', '2026-08-23T10:00:01.000Z');
    // ── one transaction, six rows, one timestamp ──
    for (let i = 3; i <= 8; i++) push(`c0${i}`, '2026-08-23T10:00:02.000Z');
    push('c09', '2026-08-23T10:00:03.000Z');
    push('c10', '2026-08-23T10:00:04.000Z');
    push('c11', '2026-08-23T10:00:05.000Z');
    push('c12', '2026-08-23T10:00:06.000Z');
    return rows;
}

/** Drain the log the way a reconnecting client does, page by page. */
function drainTimestamp(rows: ReturnType<typeof makeLog>, limit: number) {
    const seen: string[] = [];
    let since: string | null = null;
    for (let page = 0; page < 20; page++) {
        const { rows: got, nextSince } = pageByTimestampCursor(rows, since, limit);
        if (got.length === 0) break;
        for (const r of got) seen.push(r.id);
        if (nextSince === since) break;  // no forward progress
        since = nextSince;
    }
    return seen;
}

function drainComposite(rows: ReturnType<typeof makeLog>, limit: number) {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
        const { rows: got, nextCursor } = pageByCompositeCursor(rows, cursor, limit);
        if (got.length === 0) break;
        for (const r of got) seen.push(r.id);
        if (nextCursor === cursor) break;
        cursor = nextCursor;
    }
    return seen;
}

describe('§CATCHUP-CURSOR — ⛔ THE DEFECT: the shipped timestamp cursor silently drops rows', () => {
    it('loses every row of a batched write that falls past the page boundary', () => {
        const rows = makeLog();
        // Page size 4 puts the boundary inside the six rows that share
        // 10:00:02.000Z. The production LIMIT is 500 and the production batch is
        // hundreds of rows; the arithmetic is the same, only larger.
        const seen = drainTimestamp(rows, 4);

        // Page 1 returns c01..c04 and the client advances its baseline to
        // 10:00:02.000Z — the timestamp FOUR MORE ROWS still share. Page 2 asks
        // for `> 10:00:02.000Z` and starts at c09.
        expect(seen).toEqual(['c01', 'c02', 'c03', 'c04', 'c09', 'c10', 'c11', 'c12']);
        for (const lost of ['c05', 'c06', 'c07', 'c08']) expect(seen).not.toContain(lost);
        // FOUR peer edits, accepted by the server, acknowledged to their author,
        // and never delivered to the reconnecting client. No error is raised.
        expect(rows.length - seen.length).toBe(4);
    });

    it('the loss is NOT a clock-skew problem — every timestamp here is server-minted', () => {
        // §FIX-REPLAY-AT-MOST-ONCE (L-814) already made the baseline advance in
        // server time only, and it is correct. This loss survives that fix
        // untouched, because the ORDER the cursor is expressed in is not TOTAL.
        const rows = makeLog();
        const { nextSince } = pageByTimestampCursor(rows, null, 4);
        expect(nextSince).toBe('2026-08-23T10:00:02.000Z');
        // The very next request asks for `> 10:00:02.000Z`, which excludes the
        // four rows still sitting AT 10:00:02.000Z.
        const { rows: nextPage } = pageByTimestampCursor(rows, nextSince, 4);
        expect(nextPage.map(r => r.id)).not.toContain('c05');
    });
});

describe('§CATCHUP-CURSOR — STEP 1: the composite (created_at, id) cursor, no migration', () => {
    it('⭐ delivers every row, at every page size', () => {
        const rows = makeLog();
        for (const limit of [1, 2, 3, 4, 5, 6, 7, 11, 12, 50]) {
            const seen = drainComposite(rows, limit);
            expect(seen, `limit=${limit}`).toHaveLength(rows.length);
            expect(new Set(seen).size, `limit=${limit}`).toBe(rows.length);
        }
    });

    it('delivers each row exactly ONCE — replay-at-most-once is preserved', () => {
        const seen = drainComposite(makeLog(), 4);
        expect(new Set(seen).size).toBe(seen.length);
    });

    it('orders by created_at then id, matching Postgres row-value comparison', () => {
        expect(compareRows({ created_at: 'a', id: 'z' }, { created_at: 'b', id: 'a' })).toBeLessThan(0);
        expect(compareRows({ created_at: 'a', id: 'a' }, { created_at: 'a', id: 'b' })).toBeLessThan(0);
        expect(compareRows({ created_at: 'a', id: 'a' }, { created_at: 'a', id: 'a' })).toBe(0);
    });

    it('round-trips a cursor, and refuses one it does not recognise', () => {
        const c = formatCompositeCursor('2026-08-23T10:00:02.000Z', 'c07');
        expect(parseCompositeCursor(c)).toEqual({ createdAt: '2026-08-23T10:00:02.000Z', id: 'c07' });
        // ⭐ A BARE LEGACY TIMESTAMP parses as null rather than throwing, so a
        // client mid-migration falls back to the old path instead of getting a 400.
        expect(parseCompositeCursor('2026-08-23T10:00:02.000Z')).toBeNull();
        expect(parseCompositeCursor('')).toBeNull();
        expect(parseCompositeCursor(null)).toBeNull();
        expect(parseCompositeCursor('|c07')).toBeNull();
        expect(parseCompositeCursor('not-a-date|c07')).toBeNull();
    });

    it('takes the LAST row of the page, not the maximum timestamp in it', () => {
        // This one line is the entire difference from `nextCatchUpBaseline`.
        const next = nextCompositeCursor(null, {
            commands: [
                { id: 'c03', created_at: '2026-08-23T10:00:02.000Z' },
                { id: 'c04', created_at: '2026-08-23T10:00:02.000Z' },
            ],
        });
        expect(next).toBe('2026-08-23T10:00:02.000Z|c04');
    });

    it('KEEPS the previous cursor rather than guessing when a page carries nothing usable', () => {
        const prev = formatCompositeCursor('2026-08-23T10:00:02.000Z', 'c07');
        expect(nextCompositeCursor(prev, { commands: [] })).toBe(prev);
        expect(nextCompositeCursor(prev, {})).toBe(prev);
        expect(nextCompositeCursor(prev, { commands: [{ id: undefined, created_at: undefined }] })).toBe(prev);
        // A stale cursor costs one redundant request; a wrong one loses data.
    });

    it('never throws on malformed input', () => {
        expect(() => nextCompositeCursor(null, undefined as never)).not.toThrow();
        expect(() => pageByCompositeCursor([], 'garbage', 10)).not.toThrow();
    });
});
