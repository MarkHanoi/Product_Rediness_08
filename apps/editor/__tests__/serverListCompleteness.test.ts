/**
 * §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400)
 *
 * ⭐ THE READING THIS SUITE EXISTS FOR — founder's console, 2026-08-24:
 *
 *     thumbnails: 50 row(s) …
 *     §PROBE-LOCAL-ONLY-VERSION-EXPOSURE — 47 project(s) exist ONLY in this browser
 *     §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION — 3 project(s) were KEPT
 *
 * The server list came back with EXACTLY 50 rows — its hard cap
 * (`server/projectStore.js`, `LIMIT 50`; `server.js:2927`, `.limit(50)`) — and
 * 50 local rows did not appear in it. `ProjectHub` reported all fifty as absent
 * from the server, and before L-1289 DELETED them on that reasoning.
 *
 * ⛔ The assertion that must never regress: **a page that is full proves
 * nothing.** Not that the collection is bigger, not that it is complete.
 */

import { describe, it, expect } from 'vitest';
import {
    assessListCompleteness,
    mayConcludeAbsence,
    describeCompleteness,
    LEGACY_SERVER_PAGE_LIMIT,
} from '../src/ui/platform/serverListCompleteness';

describe('§FIX-A-PAGE-IS-NOT-AN-INVENTORY — the saturated page', () => {
    it('⭐ THE FOUNDER\'S READING: 50 rows against a 50-row cap is UNKNOWN, never complete', () => {
        const c = assessListCompleteness({ rowCount: 50 });
        expect(c.kind).toBe('unknown');
        expect(mayConcludeAbsence(c)).toBe(false);
    });

    it('⛔ absence must NOT be concludable from a saturated page — this is the delete gate', () => {
        expect(mayConcludeAbsence(assessListCompleteness({ rowCount: LEGACY_SERVER_PAGE_LIMIT }))).toBe(false);
    });

    it('a page OVER the assumed limit is still unknown, not complete', () => {
        // A server whose cap is higher than we assumed. We under-estimated the
        // page size; that is a reason for less confidence, not more.
        expect(assessListCompleteness({ rowCount: 120 }).kind).toBe('unknown');
    });

    it('names the ambiguity in its description rather than printing a bare verdict', () => {
        const text = describeCompleteness(assessListCompleteness({ rowCount: 50 }));
        expect(text).toContain('UNKNOWN');
        expect(text).toMatch(/indistinguishable/i);
    });
});

describe('§FIX-A-PAGE-IS-NOT-AN-INVENTORY — completeness that IS established', () => {
    it('a SHORT page ends the collection: the server had room and sent none', () => {
        const c = assessListCompleteness({ rowCount: 12 });
        expect(c.kind).toBe('complete');
        expect(c.kind === 'complete' && c.basis).toBe('short-page');
        expect(mayConcludeAbsence(c)).toBe(true);
    });

    it('an EMPTY list is complete — zero rows is a short page, not a failure', () => {
        expect(mayConcludeAbsence(assessListCompleteness({ rowCount: 0 }))).toBe(true);
    });

    it('the short-page test uses the CLIENT\'s requested limit when it set one', () => {
        // Asked for 200, got 50 → complete, even though 50 is the legacy default.
        const c = assessListCompleteness({ rowCount: 50, requestedLimit: 200 });
        expect(c.kind).toBe('complete');
        expect(mayConcludeAbsence(c)).toBe(true);
    });

    it('⚠ and NOT the legacy constant, when the client asked for less than it', () => {
        // Asked for 10, got 10 → saturated at the REQUESTED size. The legacy 50
        // is irrelevant here and using it would wrongly declare completeness.
        expect(assessListCompleteness({ rowCount: 10, requestedLimit: 10 }).kind).toBe('unknown');
    });
});

describe('§FIX-A-PAGE-IS-NOT-AN-INVENTORY — the server\'s own declaration wins', () => {
    it('hasMore:false makes a SATURATED page complete', () => {
        const c = assessListCompleteness({ rowCount: 50, serverDeclaredHasMore: false });
        expect(c.kind).toBe('complete');
        expect(c.kind === 'complete' && c.basis).toBe('server-declared-no-more');
        expect(mayConcludeAbsence(c)).toBe(true);
    });

    it('hasMore:true makes even a SHORT page truncated', () => {
        // The inference would have said "complete". The server knows better.
        const c = assessListCompleteness({ rowCount: 3, serverDeclaredHasMore: true });
        expect(c.kind).toBe('truncated');
        expect(mayConcludeAbsence(c)).toBe(false);
    });

    it('⭐ UNDEFINED IS NOT FALSE — "the server did not say" must not become "there is no more"', () => {
        // The exact defect shape `localOnlyProjectFate` records for
        // `indexVersionCount`: a missing reading collapsing into a meaningful one.
        const silent = assessListCompleteness({ rowCount: 50, serverDeclaredHasMore: undefined });
        const denied = assessListCompleteness({ rowCount: 50, serverDeclaredHasMore: false });
        expect(silent.kind).toBe('unknown');
        expect(denied.kind).toBe('complete');
        expect(silent.kind).not.toBe(denied.kind);
    });
});
