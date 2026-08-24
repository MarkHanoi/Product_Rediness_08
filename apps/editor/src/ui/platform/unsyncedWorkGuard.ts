/**
 * unsyncedWorkGuard — §FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT (L-10401)
 *
 * ─── THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE ───────────────────────
 *
 * `signOut()` calls `purgeUserScopedClientState()`, which deletes **every**
 * IndexedDB database whose name contains "pryzm" (`AuthModal.ts`). That is
 * correct and must stay — it closes the cross-tenant leak §AUTH-SESSION-LEAK.
 *
 * But `pryzm-project-versions` is one of those databases, and it holds two
 * things that exist NOWHERE ELSE:
 *
 *   • version-history snapshots (`VersionCacheStore.ts:40`), which
 *     `warmVersionCache()` MIGRATES out of localStorage — so after the first
 *     warm, IndexedDB is the only copy;
 *   • the **ServerSyncQueue overflow queue** (`syncQueue` store, same database),
 *     which since L-1310 deliberately RETAINS the payloads of uploads the server
 *     refused, precisely so they are not lost.
 *
 * ⭐ So L-1310 stopped `ServerSyncQueue` from throwing rejected uploads away, and
 * `signOut()` throws away the place it keeps them. The retention is real and the
 * sign-out is silent, and the user is given no indication that pressing "Sign
 * out" destroys work no server has ever accepted.
 *
 * ─── THE RULING ─────────────────────────────────────────────────────────────
 *
 * **A destructive action must not be silent about what it destroys, and when it
 * cannot establish that it is safe, it must ask.**
 *
 * ⛔ The fix is NOT to weaken the purge. The purge is a security control and a
 * *narrower* purge would re-open a cross-tenant data leak — trading a loss the
 * user can be warned about for one they cannot. ⛔ Nor is it to quietly copy the
 * at-risk payloads somewhere the purge misses: that is the leak, rebuilt by hand.
 *
 * The fix is CONSENT. Count what is provably unsynced, name it, and let the user
 * decide. Declining costs nothing; proceeding is then a choice rather than an
 * accident.
 *
 * ⚠ **The bar for warning is EVIDENCE, not suspicion.** A dialog on every
 * sign-out is a dialog nobody reads, and a guard everybody clicks through
 * protects less than no guard at all — so this warns only on work the server has
 * positively refused or has never been offered. In particular it does NOT warn
 * merely because a project is missing from the server's list: that list is a
 * page of 50, and reading absence from it is the separate defect L-10400
 * (`serverListCompleteness.ts`) exists to prevent. Chaining one unproven
 * inference into a scary dialog would be that same defect wearing a warning
 * label.
 *
 * ─── WHY A REGISTRY ─────────────────────────────────────────────────────────
 *
 * `signOut()` lives in `AuthModal.ts`, at the bottom of the platform stack.
 * `ServerSyncQueue` sits above it. Importing the queue into the auth module
 * would invert that and create exactly the module cycle that produces
 * `undefined`-at-load white screens (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD).
 * So holders of at-risk work PUSH a probe down here, and `signOut()` pulls.
 * Nothing is imported in the wrong direction and the policy stays pure.
 */

/**
 * What one holder of local work reports about its own contents.
 *
 * ⚠ `unreadable` is a THIRD state alongside "some" and "none". A probe that
 * threw has established NOTHING, and folding that into `0` is the defect
 * `localOnlyProjectFate` exists to record: absence of evidence read as evidence
 * of absence, resolved in the destructive direction.
 */
export interface UnsyncedWorkReport {
    /** Which subsystem is speaking, e.g. `'sync-queue'`. Appears in the dialog. */
    readonly source: string;
    /**
     * Uploads the server ANSWERED NO to (plan limit, validation, auth). Their
     * payloads are retained locally by L-1310 and exist nowhere else.
     */
    readonly blockedSaves: number;
    /** Uploads queued and not yet accepted by the server. */
    readonly pendingSaves: number;
    /** Distinct projects the above belong to. Used only for the count shown. */
    readonly projectIds: readonly string[];
    /** True when this holder could not read its own store at all. */
    readonly unreadable?: boolean;
    /** Why it could not be read. Free text — shown to the user verbatim. */
    readonly unreadableReason?: string;
}

export type SignOutRisk =
    /** Nothing at risk was found, and every probe answered. Sign out silently. */
    | { readonly action: 'proceed'; readonly reason: 'no-unsynced-work' }
    /**
     * Ask first. `headline` is the one-line statement of the loss; `detail` is
     * the body. `atRisk` is the number of items that would be destroyed, or -1
     * when a probe failed and the number is genuinely unknown.
     */
    | {
          readonly action: 'warn';
          readonly reason: 'unsynced-work-present' | 'cannot-verify';
          readonly headline: string;
          readonly detail: string;
          readonly atRisk: number;
          readonly projectCount: number;
      };

// ── Registry ─────────────────────────────────────────────────────────────────

type Probe = () => UnsyncedWorkReport;

const _probes = new Set<Probe>();

/**
 * Register a source of local-only work. Returns an unregister function.
 *
 * Callers register from their constructor and unregister on dispose. A probe
 * MUST NOT throw; if it cannot read its store it returns
 * `{ unreadable: true }` so the guard can say "I could not verify" rather than
 * "there is nothing" — the distinction this whole family of bugs turns on.
 */
export function registerUnsyncedWorkProbe(probe: Probe): () => void {
    _probes.add(probe);
    return () => { _probes.delete(probe); };
}

/** Test seam — drops every registered probe. */
export function _resetUnsyncedWorkProbes(): void {
    _probes.clear();
}

/**
 * Run every registered probe. A probe that throws despite the contract is
 * recorded as `unreadable` rather than being allowed to abort the guard — a
 * crashed guard would fall through to the silent destructive path, which is the
 * one outcome this module must never produce.
 */
export function collectUnsyncedWorkReports(): UnsyncedWorkReport[] {
    const out: UnsyncedWorkReport[] = [];
    for (const probe of _probes) {
        try {
            out.push(probe());
        } catch (err) {
            out.push({
                source: 'unknown-probe',
                blockedSaves: 0,
                pendingSaves: 0,
                projectIds: [],
                unreadable: true,
                unreadableReason: err instanceof Error ? err.message : String(err),
            });
        }
    }
    return out;
}

// ── Policy (pure) ────────────────────────────────────────────────────────────

/**
 * Decide whether sign-out may proceed silently.
 *
 * ⚠ ORDER IS LOAD-BEARING. Counted work is tested BEFORE unreadability, so a
 * report that is BOTH partially readable and partially broken produces the
 * concrete, actionable message (with real numbers) rather than the vaguer
 * "could not verify" one.
 */
export function assessSignOutRisk(reports: readonly UnsyncedWorkReport[]): SignOutRisk {
    let blocked = 0;
    let pending = 0;
    const projects = new Set<string>();
    const unreadable: UnsyncedWorkReport[] = [];

    for (const r of reports) {
        blocked += r.blockedSaves;
        pending += r.pendingSaves;
        for (const id of r.projectIds) projects.add(id);
        if (r.unreadable) unreadable.push(r);
    }

    const atRisk = blocked + pending;

    // 1 — ⭐ COUNTED, PROVEN LOSS. The strongest case, and the only one that can
    // quote numbers. Say exactly what goes and exactly what survives.
    if (atRisk > 0) {
        const parts: string[] = [];
        if (blocked > 0) parts.push(`${blocked} the server REFUSED (plan limit, size, or permissions)`);
        if (pending > 0) parts.push(`${pending} still waiting to upload`);
        return {
            action: 'warn',
            reason: 'unsynced-work-present',
            atRisk,
            projectCount: projects.size,
            headline:
                `Sign out will DELETE ${atRisk} unsaved version${atRisk === 1 ? '' : 's'} ` +
                `across ${projects.size} project${projects.size === 1 ? '' : 's'}.`,
            detail:
                `${parts.join(', and ')}.\n\n` +
                'These snapshots exist only in this browser. Signing out clears the local ' +
                'database that holds them (required, so the next account cannot read your ' +
                'data), and there is no copy on the server to restore them from.\n\n' +
                'Cancel to stay signed in — anything the server accepts later is safe.\n\n' +
                'Sign out anyway?',
        };
    }

    // 2 — Nothing counted, but a probe could not look. We cannot say "you will
    // lose nothing", so we do not. This is the honest arm, and it is quiet in
    // practice because a readable probe never reaches it.
    if (unreadable.length > 0) {
        const why = unreadable
            .map(r => `${r.source}${r.unreadableReason ? `: ${r.unreadableReason}` : ''}`)
            .join('; ');
        return {
            action: 'warn',
            reason: 'cannot-verify',
            atRisk: -1,
            projectCount: 0,
            headline: 'Sign out could not confirm that all your work is saved to the server.',
            detail:
                `Local storage could not be inspected (${why}).\n\n` +
                'Signing out clears this browser\'s copy of your projects. Normally the server ' +
                'holds them, but that could not be verified right now.\n\n' +
                'Sign out anyway?',
        };
    }

    // 3 — Every probe answered and all of them said nothing is pending.
    return { action: 'proceed', reason: 'no-unsynced-work' };
}

/** The dialog text, assembled once so the wording is testable. */
export function formatSignOutWarning(risk: SignOutRisk): string {
    if (risk.action === 'proceed') return '';
    return `${risk.headline}\n\n${risk.detail}`;
}
