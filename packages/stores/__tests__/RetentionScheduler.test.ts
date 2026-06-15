// A.30.c — L3 RetentionScheduler tests.
//
// Pins the C22 §1.10 (age ceiling + "missed three sweeps" Sev-2) + §2.3
// (early-purge triggers gated by policy) decision logic. Pure + clock-free:
// every assertion passes an explicit `now`.

import { describe, expect, it, beforeEach } from 'vitest';
import { RetentionScheduler, type RetentionRecord } from '../src/RetentionScheduler.js';
import type { RetentionPolicy } from '@pryzm/schemas/privacy';

const DAY = 86_400_000;

function policy(over: Partial<RetentionPolicy> = {}): RetentionPolicy {
    return {
        tier: 'pii',
        maxDays: 30,
        maxBackupDays: 90,
        earlyPurgeTriggers: ['account-delete', 'dsar-delete'],
        sweepIntervalMinutes: 60,
        ...over,
    };
}

function rec(over: Partial<RetentionRecord> = {}): RetentionRecord {
    return { id: 'r1', tier: 'pii', createdAtMs: 0, ...over };
}

describe('RetentionScheduler — policy registry', () => {
    let s: RetentionScheduler;
    beforeEach(() => { s = new RetentionScheduler(); });

    it('setPolicy / getPolicy / hasPolicy round-trip', () => {
        expect(s.hasPolicy('pii')).toBe(false);
        s.setPolicy(policy());
        expect(s.hasPolicy('pii')).toBe(true);
        expect(s.getPolicy('pii')?.maxDays).toBe(30);
        expect(s.policies()).toHaveLength(1);
    });

    it('setPolicy replaces the prior policy for a tier', () => {
        s.setPolicy(policy({ maxDays: 30 }));
        s.setPolicy(policy({ maxDays: 7 }));
        expect(s.getPolicy('pii')?.maxDays).toBe(7);
        expect(s.policies()).toHaveLength(1);
    });

    it('planSweep throws a descriptive error when the tier has no policy', () => {
        expect(() => s.planSweep('pii', [], 0)).toThrow(/no RetentionPolicy registered for tier='pii'/);
    });
});

describe('RetentionScheduler — age ceiling (§1.10)', () => {
    let s: RetentionScheduler;
    beforeEach(() => { s = new RetentionScheduler(); s.setPolicy(policy({ maxDays: 30 })); });

    it('expiryMs = createdAt + maxDays·DAY', () => {
        expect(s.expiryMs('pii', 1_000)).toBe(1_000 + 30 * DAY);
    });

    it('is NOT expired one ms before the ceiling, IS expired at it', () => {
        const r = rec({ createdAtMs: 0 });
        expect(s.isExpired(r, 30 * DAY - 1)).toBe(false);
        expect(s.isExpired(r, 30 * DAY)).toBe(true);
    });

    it('planSweep returns aged-out records with reason max-retention', () => {
        const fresh = rec({ id: 'fresh', createdAtMs: 29 * DAY });
        const old = rec({ id: 'old', createdAtMs: 0 });
        const plan = s.planSweep('pii', [fresh, old], 31 * DAY);
        expect(plan.due.map(d => d.id)).toEqual(['old']);
        expect(plan.due[0].reason).toBe('max-retention');
    });

    it('overdueSweeps counts whole sweep windows since expiry (§1.10 Sev-2 at ≥3)', () => {
        const r = rec({ createdAtMs: 0 });           // expires at 30·DAY; window = 60 min
        const expiry = 30 * DAY;
        expect(s.overdueSweeps(r, expiry)).toBe(0);                  // just expired
        expect(s.overdueSweeps(r, expiry + 60 * 60_000 - 1)).toBe(0); // within first window
        expect(s.overdueSweeps(r, expiry + 3 * 60 * 60_000)).toBe(3); // 3 windows → Sev-2
        expect(s.overdueSweeps(r, expiry - DAY)).toBe(0);            // not yet expired
    });
});

describe('RetentionScheduler — early-purge triggers (§2.3)', () => {
    let s: RetentionScheduler;
    beforeEach(() => { s = new RetentionScheduler(); s.setPolicy(policy()); });

    it('a policy-listed pending trigger forces purge even when fresh', () => {
        const r = rec({ id: 'acct', createdAtMs: 0, pendingTriggers: ['account-delete'] });
        const plan = s.planSweep('pii', [r], 1_000);   // far from the 30d ceiling
        expect(plan.due).toHaveLength(1);
        expect(plan.due[0].reason).toBe('account-delete');
        expect(plan.due[0].overdueSweeps).toBe(0);     // triggers are due instantly, no "missed sweeps"
    });

    it('an UNLISTED trigger does not force purge (still obeys the age ceiling)', () => {
        // 'project-delete' is NOT in this policy's earlyPurgeTriggers.
        const r = rec({ pendingTriggers: ['project-delete'], createdAtMs: 0 });
        expect(s.firingTrigger(r)).toBeNull();
        expect(s.planSweep('pii', [r], 1_000).due).toHaveLength(0);
    });

    it('firingTrigger picks the first policy-listed pending trigger (policy order wins → stable reason)', () => {
        // policy order: ['account-delete', 'dsar-delete']; record pends both (reversed input).
        const r = rec({ pendingTriggers: ['dsar-delete', 'account-delete'] });
        expect(s.firingTrigger(r)).toBe('account-delete');
    });

    it('a trigger takes precedence over the age reason when both apply', () => {
        const r = rec({ createdAtMs: 0, pendingTriggers: ['dsar-delete'] });
        const plan = s.planSweep('pii', [r], 100 * DAY);  // also aged out
        expect(plan.due[0].reason).toBe('dsar-delete');
    });
});

describe('RetentionScheduler — tier isolation + cadence', () => {
    let s: RetentionScheduler;
    beforeEach(() => {
        s = new RetentionScheduler();
        s.setPolicy(policy({ tier: 'pii', maxDays: 30 }));
        s.setPolicy(policy({ tier: 'telemetry', maxDays: 400, earlyPurgeTriggers: [] }));
    });

    it('planSweep only considers records of the requested tier', () => {
        const piiOld = rec({ id: 'pii-old', tier: 'pii', createdAtMs: 0 });
        const telFresh = rec({ id: 'tel', tier: 'telemetry', createdAtMs: 0 });
        const plan = s.planSweep('pii', [piiOld, telFresh], 31 * DAY);
        expect(plan.due.map(d => d.id)).toEqual(['pii-old']);
    });

    it('nextSweepDueMs = lastSweep + sweepIntervalMinutes·60s', () => {
        expect(s.nextSweepDueMs('pii', 1_000)).toBe(1_000 + 60 * 60_000);
    });
});

describe('RetentionScheduler — lifecycle', () => {
    it('reset() clears the policy table', () => {
        const s = new RetentionScheduler();
        s.setPolicy(policy());
        s.reset();
        expect(s.hasPolicy('pii')).toBe(false);
    });

    it('subscribe fires on setPolicy and unsubscribe stops it', () => {
        const s = new RetentionScheduler();
        let n = 0;
        const off = s.subscribe(() => { n++; });
        s.setPolicy(policy());
        expect(n).toBe(1);
        off();
        s.setPolicy(policy({ maxDays: 7 }));
        expect(n).toBe(1);
    });

    it('dispose() freezes writes and is idempotent', () => {
        const s = new RetentionScheduler();
        s.setPolicy(policy());
        s.dispose();
        s.dispose();                 // idempotent — no throw
        s.setPolicy(policy());       // ignored after dispose
        expect(s.hasPolicy('pii')).toBe(false);
    });
});
