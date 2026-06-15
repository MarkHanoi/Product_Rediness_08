// A.30.c (Phase A · Sprint 2) — L3 RetentionScheduler (pure decision core).
//
// The retention sweeper's BRAIN: given a tier's `RetentionPolicy` (A.30.a L0)
// and a set of candidate records, it decides WHICH records are due for purge
// and WHY — by age (`createdAt + maxRetentionDays < now`, per [C22 §1.10]) or
// by an early-purge trigger (account-delete / consent-revoke / dsar-delete /
// project-delete / parent-delete, per [C22 §2.3]). It also surfaces the §1.10
// "missed three sweeps in a row → Sev-2" signal as `overdueSweeps`.
//
// L3-layer: imports ONLY from @pryzm/schemas/privacy (L0). It is PURE +
// DETERMINISTIC — it holds the per-tier policy table but NEVER reads a clock,
// touches a DB, or deletes anything. `now` is always passed in. The long-running
// worker that wakes on `sweepIntervalMinutes`, fetches the candidate rows, calls
// `planSweep`, and hard-deletes the result lives at `apps/retention-worker/`
// (L5 server, A.30.d PLANNED) — this is the testable core it delegates the
// decision to. The conformance test is [C22 §6.10] `check-retention-purge`.

import type {
    DataTier,
    RetentionPolicy,
    RetentionTrigger,
} from '@pryzm/schemas/privacy';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * A candidate record the scheduler evaluates. The scheduler is agnostic to what
 * the record IS (a project row, an audit row, a consent row…) — it only needs
 * the tier (to pick the policy), the creation time (for the age ceiling), and
 * any early-purge triggers that have fired for it (e.g. its owning account was
 * deleted). The id is opaque + echoed back in the plan so the worker can map a
 * decision to a concrete delete.
 */
export interface RetentionRecord {
    readonly id: string;
    readonly tier: DataTier;
    /** Creation time in epoch-ms. The age ceiling is `createdAtMs + maxDays·DAY`. */
    readonly createdAtMs: number;
    /**
     * Early-purge triggers that have fired for this record (per [C22 §2.3]). A
     * trigger only forces a purge when the tier's policy LISTS it in
     * `earlyPurgeTriggers`; an unlisted trigger is ignored (the record still
     * obeys the age ceiling).
     */
    readonly pendingTriggers?: readonly RetentionTrigger[];
}

/** Why a record is due for purge. 'max-retention' = aged past the tier ceiling;
 *  otherwise the specific early-purge trigger that fired. */
export type PurgeReason = 'max-retention' | RetentionTrigger;

/** One due-for-purge decision. */
export interface PurgeEntry {
    readonly id: string;
    readonly reason: PurgeReason;
    /**
     * For an age-expired record, how many whole `sweepIntervalMinutes` windows
     * have elapsed since it became expired. 0 = expired within the current
     * window (normal); ≥ 3 = the §1.10 "missed three sweeps" Sev-2 condition.
     * Always 0 for a trigger-driven purge (it is due the instant the trigger
     * fires, so "missed sweeps" does not apply).
     */
    readonly overdueSweeps: number;
}

/** The result of planning one tier's sweep at a given instant. */
export interface PurgePlan {
    readonly tier: DataTier;
    readonly nowMs: number;
    readonly due: readonly PurgeEntry[];
}

export class RetentionScheduler {
    private readonly _policies = new Map<DataTier, RetentionPolicy>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Policy registry ──────────────────────────────────────────────────────

    /** Register (or replace) the policy governing a tier. */
    setPolicy(policy: RetentionPolicy): void {
        if (this._disposed) {
            console.warn('[RetentionScheduler] setPolicy() after dispose — ignored');
            return;
        }
        this._policies.set(policy.tier, policy);
        this._notify();
    }

    getPolicy(tier: DataTier): RetentionPolicy | undefined {
        return this._policies.get(tier);
    }

    hasPolicy(tier: DataTier): boolean {
        return this._policies.has(tier);
    }

    /** All registered policies (insertion order). */
    policies(): readonly RetentionPolicy[] {
        return [...this._policies.values()];
    }

    // ── Pure decision helpers ─────────────────────────────────────────────────

    /** Epoch-ms at which a record of `tier` created at `createdAtMs` ages out. */
    expiryMs(tier: DataTier, createdAtMs: number): number {
        const policy = this._requirePolicy(tier);
        return createdAtMs + policy.maxDays * DAY_MS;
    }

    /** True iff the record has aged past its tier's `maxDays` ceiling at `nowMs`. */
    isExpired(record: RetentionRecord, nowMs: number): boolean {
        return nowMs >= this.expiryMs(record.tier, record.createdAtMs);
    }

    /**
     * The early-purge trigger that forces this record's purge, or null. A trigger
     * counts only when it is BOTH pending on the record AND listed in the tier
     * policy's `earlyPurgeTriggers`. Deterministic order: the first policy-listed
     * trigger that is pending (policy order wins, so the reason is stable).
     */
    firingTrigger(record: RetentionRecord): RetentionTrigger | null {
        if (!record.pendingTriggers || record.pendingTriggers.length === 0) return null;
        const policy = this._requirePolicy(record.tier);
        const pending = new Set(record.pendingTriggers);
        for (const t of policy.earlyPurgeTriggers) {
            if (pending.has(t)) return t;
        }
        return null;
    }

    /**
     * Whole `sweepIntervalMinutes` windows elapsed since the record aged out, at
     * `nowMs`. 0 when not yet expired or expired within the current window;
     * ≥ 3 is the [C22 §1.10] Sev-2 "missed three sweeps" condition. Surfaced so
     * the worker (A.30.d) can raise the alert without re-deriving the math.
     */
    overdueSweeps(record: RetentionRecord, nowMs: number): number {
        const policy = this._requirePolicy(record.tier);
        const expiry = this.expiryMs(record.tier, record.createdAtMs);
        if (nowMs < expiry) return 0;
        const windowMs = policy.sweepIntervalMinutes * MINUTE_MS;
        if (windowMs <= 0) return 0;
        return Math.floor((nowMs - expiry) / windowMs);
    }

    /**
     * Plan one tier's sweep at `nowMs`. A record is due when it has aged past the
     * ceiling OR carries a policy-listed early-purge trigger; a trigger-driven
     * purge takes precedence as the stated reason (it is the more specific cause).
     * Records of other tiers are ignored. Pure + deterministic — same inputs
     * always yield the same plan, in input order.
     */
    planSweep(tier: DataTier, records: readonly RetentionRecord[], nowMs: number): PurgePlan {
        this._requirePolicy(tier);
        const due: PurgeEntry[] = [];
        for (const r of records) {
            if (r.tier !== tier) continue;
            const trigger = this.firingTrigger(r);
            const expired = this.isExpired(r, nowMs);
            if (!trigger && !expired) continue;
            due.push({
                id: r.id,
                reason: trigger ?? 'max-retention',
                overdueSweeps: trigger ? 0 : this.overdueSweeps(r, nowMs),
            });
        }
        return { tier, nowMs, due };
    }

    /** Epoch-ms the next sweep for `tier` is due, given the last sweep time. */
    nextSweepDueMs(tier: DataTier, lastSweepMs: number): number {
        const policy = this._requirePolicy(tier);
        return lastSweepMs + policy.sweepIntervalMinutes * MINUTE_MS;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Clear the policy table — fixture tear-down. */
    reset(): void {
        if (this._disposed) return;
        if (this._policies.size === 0) return;
        this._policies.clear();
        this._notify();
    }

    /** Idempotent. Clears listeners + the policy table + freezes writes. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._policies.clear();
    }

    private _requirePolicy(tier: DataTier): RetentionPolicy {
        const policy = this._policies.get(tier);
        if (!policy) {
            throw new Error(
                `[RetentionScheduler] no RetentionPolicy registered for tier='${tier}' — ` +
                `call setPolicy() before planning a sweep (every tier MUST have a policy per C22 §1.10).`,
            );
        }
        return policy;
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (err) {
                console.warn('[RetentionScheduler] listener threw:', err);
            }
        }
    }
}
