// A.30.c (Phase A · Sprint 2) — L3 ConsentStore.
//
// Reactive store for `Consent` rows from the L0 C22 substrate
// (A.30.a). Per [C22 §3.1] the store is the authoritative source for
// "is this user consented to purpose X right now?". Withdrawal flips
// `revokedAt` non-null + triggers the retention sweeper's
// 'consent-revoke' purge for the affected data.
//
// L3-layer: imports ONLY from @pryzm/schemas/privacy (L0). The HTTP
// surface that fronts this lives in `server/consentStore.js` (L5
// PLANNED A.30.d) and writes through the consent.* command surface
// (A.30.d PLANNED).
//
// Per [C13 §3.8] isolation: `reset()` is the canonical project-switch
// hook (but consent is USER-scoped, not project-scoped — reset is
// only used for fixture-tear-down in tests; the L5 lifecycle keeps
// the store alive across projects).

import type {
    Consent,
    ConsentPurpose,
} from '@pryzm/schemas/privacy';

/**
 * One entry in the store, keyed by `(userId, purpose, version)`. A
 * user can have multiple consent rows per purpose — one per version
 * they've ever agreed to — but at most ONE is active at a time
 * (revokedAt === null).
 */
function rowKey(c: Consent): string {
    return `${c.userId}::${c.purpose}::${c.version}`;
}

export class ConsentStore {
    private readonly _byKey = new Map<string, Consent>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    /** Lookup a specific consent row by user + purpose + version. */
    get(userId: string, purpose: ConsentPurpose, version: string): Consent | undefined {
        return this._byKey.get(`${userId}::${purpose}::${version}`);
    }

    /**
     * Returns the CURRENTLY-ACTIVE consent for `(userId, purpose)` — the
     * row whose `revokedAt === null`. If multiple active rows exist
     * (latest grant wins), the one with the latest `grantedAt` is
     * returned. Returns undefined when the user has never consented to
     * this purpose, or has revoked every version.
     */
    activeFor(userId: string, purpose: ConsentPurpose): Consent | undefined {
        let best: Consent | undefined;
        for (const c of this._byKey.values()) {
            if (c.userId !== userId) continue;
            if (c.purpose !== purpose) continue;
            if (c.revokedAt !== null) continue;
            if (!best || c.grantedAt > best.grantedAt) best = c;
        }
        return best;
    }

    /** True iff there is an active consent row for `(userId, purpose)`. */
    isConsented(userId: string, purpose: ConsentPurpose): boolean {
        return this.activeFor(userId, purpose) !== undefined;
    }

    /** Every consent row (active + historical) for a user. */
    listForUser(userId: string): readonly Consent[] {
        const out: Consent[] = [];
        for (const c of this._byKey.values()) {
            if (c.userId === userId) out.push(c);
        }
        return out.sort((a, b) =>
            a.grantedAt < b.grantedAt
                ? -1
                : a.grantedAt > b.grantedAt
                  ? 1
                  : 0,
        );
    }

    /** Every active (non-revoked) consent for a user. */
    activeForUser(userId: string): readonly Consent[] {
        return this.listForUser(userId).filter((c) => c.revokedAt === null);
    }

    /** Snapshot count of all stored rows. */
    size(): number {
        return this._byKey.size;
    }

    // ── Write API ──────────────────────────────────────────────────────────

    /**
     * Grant or update a consent row. The key is `(userId, purpose, version)`;
     * granting an identical-version row is a no-op (idempotent), granting
     * a NEW version supersedes prior active versions of the same purpose
     * — those prior rows are auto-flipped to `revokedAt: grantedAt` so
     * the audit history is preserved.
     *
     * Returns the rows that were superseded (so the L3 retention
     * scheduler can fire the 'consent-revoke' purge for them).
     */
    grant(consent: Consent): readonly Consent[] {
        if (this._disposed) {
            console.warn('[ConsentStore] grant() after dispose — ignored');
            return [];
        }
        const key = rowKey(consent);
        const existing = this._byKey.get(key);
        if (existing && existing.grantedAt === consent.grantedAt && existing.revokedAt === consent.revokedAt) {
            return []; // idempotent
        }

        // Supersede any other active versions of the same purpose.
        const superseded: Consent[] = [];
        for (const [k, c] of this._byKey) {
            if (c.userId !== consent.userId) continue;
            if (c.purpose !== consent.purpose) continue;
            if (c.version === consent.version) continue;
            if (c.revokedAt !== null) continue;
            const revokedRow: Consent = { ...c, revokedAt: consent.grantedAt };
            this._byKey.set(k, revokedRow);
            superseded.push(revokedRow);
        }

        this._byKey.set(key, consent);
        this._notify();
        return superseded;
    }

    /**
     * Revoke the active consent for `(userId, purpose)`. If no active
     * consent exists this is a no-op. Returns the revoked row (or
     * undefined when no-op).
     */
    revoke(userId: string, purpose: ConsentPurpose, revokedAt: string): Consent | undefined {
        if (this._disposed) {
            console.warn('[ConsentStore] revoke() after dispose — ignored');
            return undefined;
        }
        const active = this.activeFor(userId, purpose);
        if (!active) return undefined;
        const revoked: Consent = { ...active, revokedAt };
        this._byKey.set(rowKey(revoked), revoked);
        this._notify();
        return revoked;
    }

    /**
     * Hard-delete every consent row for a user — the GDPR Art. 17
     * "right to erasure" purge. ONLY callable from the DSAR worker.
     * Returns the count purged.
     */
    purgeUser(userId: string): number {
        if (this._disposed) {
            console.warn('[ConsentStore] purgeUser() after dispose — ignored');
            return 0;
        }
        let purged = 0;
        for (const [k, c] of this._byKey) {
            if (c.userId === userId) {
                this._byKey.delete(k);
                purged++;
            }
        }
        if (purged > 0) this._notify();
        return purged;
    }

    /** Clear all rows — used by fixture tear-down. */
    reset(): void {
        if (this._disposed) return;
        if (this._byKey.size === 0) return;
        this._byKey.clear();
        this._notify();
    }

    // ── Subscription / lifecycle ───────────────────────────────────────────

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Idempotent. Clears listeners + freezes writes. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._byKey.clear();
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (err) {
                console.warn('[ConsentStore] listener threw:', err);
            }
        }
    }
}
