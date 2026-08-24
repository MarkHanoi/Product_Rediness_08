/**
 * §FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT (L-10401)
 *
 * `signOut()` purges every `pryzm`-named IndexedDB database — including
 * `pryzm-project-versions`, which holds the ServerSyncQueue's RETAINED payloads
 * for uploads the server refused. L-1310 stopped the queue discarding those;
 * sign-out was still deleting the place it keeps them, silently.
 *
 * ⛔ The invariant: the guard warns on PROVEN loss, stays silent when there is
 * none, and never resolves "I could not look" as "there is nothing".
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    assessSignOutRisk,
    registerUnsyncedWorkProbe,
    collectUnsyncedWorkReports,
    _resetUnsyncedWorkProbes,
    formatSignOutWarning,
    type UnsyncedWorkReport,
} from '../src/ui/platform/unsyncedWorkGuard';

const empty = (over: Partial<UnsyncedWorkReport> = {}): UnsyncedWorkReport => ({
    source: 'sync-queue', blockedSaves: 0, pendingSaves: 0, projectIds: [], ...over,
});

beforeEach(() => { _resetUnsyncedWorkProbes(); });

describe('§FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT — when to warn', () => {
    it('stays SILENT when nothing is pending — a guard nobody reads protects nothing', () => {
        expect(assessSignOutRisk([empty()]).action).toBe('proceed');
    });

    it('stays silent with no probes registered at all', () => {
        expect(assessSignOutRisk([]).action).toBe('proceed');
    });

    it('⭐ warns on a server-REFUSED save — the payload exists nowhere else', () => {
        const risk = assessSignOutRisk([empty({ blockedSaves: 3, projectIds: ['a', 'b'] })]);
        expect(risk.action).toBe('warn');
        expect(risk.action === 'warn' && risk.reason).toBe('unsynced-work-present');
        expect(risk.action === 'warn' && risk.atRisk).toBe(3);
        expect(risk.action === 'warn' && risk.projectCount).toBe(2);
    });

    it('warns on a save still waiting to upload', () => {
        expect(assessSignOutRisk([empty({ pendingSaves: 1, projectIds: ['a'] })]).action).toBe('warn');
    });

    it('sums across every reporter and de-duplicates the project count', () => {
        const risk = assessSignOutRisk([
            empty({ source: 'sync-queue', blockedSaves: 2, projectIds: ['a', 'b'] }),
            empty({ source: 'other', pendingSaves: 4, projectIds: ['b', 'c'] }),
        ]);
        expect(risk.action === 'warn' && risk.atRisk).toBe(6);
        expect(risk.action === 'warn' && risk.projectCount).toBe(3);
    });
});

describe('§FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT — "I could not look" is its own answer', () => {
    it('⭐ an unreadable probe warns — absence of evidence is not evidence of safety', () => {
        const risk = assessSignOutRisk([empty({ unreadable: true, unreadableReason: 'IDB blocked' })]);
        expect(risk.action).toBe('warn');
        expect(risk.action === 'warn' && risk.reason).toBe('cannot-verify');
        expect(risk.action === 'warn' && risk.atRisk).toBe(-1);
        expect(formatSignOutWarning(risk)).toContain('IDB blocked');
    });

    it('⚠ ORDER: counted loss outranks unreadability, so the message can quote real numbers', () => {
        const risk = assessSignOutRisk([
            empty({ blockedSaves: 2, projectIds: ['a'] }),
            empty({ source: 'broken', unreadable: true }),
        ]);
        expect(risk.action === 'warn' && risk.reason).toBe('unsynced-work-present');
        expect(risk.action === 'warn' && risk.atRisk).toBe(2);
    });
});

describe('§FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT — the registry', () => {
    it('collects from every registered probe', () => {
        registerUnsyncedWorkProbe(() => empty({ source: 'one', blockedSaves: 1, projectIds: ['p'] }));
        registerUnsyncedWorkProbe(() => empty({ source: 'two', pendingSaves: 2, projectIds: ['q'] }));
        expect(assessSignOutRisk(collectUnsyncedWorkReports()).action).toBe('warn');
    });

    it('unregistering stops a disposed holder reporting stale work', () => {
        const off = registerUnsyncedWorkProbe(() => empty({ blockedSaves: 5, projectIds: ['p'] }));
        expect(assessSignOutRisk(collectUnsyncedWorkReports()).action).toBe('warn');
        off();
        expect(assessSignOutRisk(collectUnsyncedWorkReports()).action).toBe('proceed');
    });

    it('⛔ a THROWING probe becomes "unreadable", never a silent zero', () => {
        // The one outcome that must be impossible: a crashed guard falling
        // through to the silent destructive path.
        registerUnsyncedWorkProbe(() => { throw new Error('store exploded'); });
        const risk = assessSignOutRisk(collectUnsyncedWorkReports());
        expect(risk.action).toBe('warn');
        expect(risk.action === 'warn' && risk.reason).toBe('cannot-verify');
        expect(formatSignOutWarning(risk)).toContain('store exploded');
    });
});

describe('§FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT — the wording is part of the fix', () => {
    it('names the count, the project count, and that there is no server copy', () => {
        const text = formatSignOutWarning(assessSignOutRisk([empty({ blockedSaves: 47, projectIds: Array.from({ length: 12 }, (_, i) => `p${i}`) })]));
        expect(text).toContain('47');
        expect(text).toContain('12 projects');
        expect(text).toMatch(/only in this browser/i);
        expect(text).toMatch(/no copy on the server/i);
        // The cancel path must be offered explicitly — a dialog that only says
        // "are you sure" teaches people to click through.
        expect(text).toMatch(/cancel/i);
    });

    it('distinguishes a REFUSED upload from one merely waiting', () => {
        const refused = formatSignOutWarning(assessSignOutRisk([empty({ blockedSaves: 1, projectIds: ['a'] })]));
        const waiting = formatSignOutWarning(assessSignOutRisk([empty({ pendingSaves: 1, projectIds: ['a'] })]));
        expect(refused).toMatch(/REFUSED/);
        expect(waiting).toMatch(/waiting to upload/);
    });
});
