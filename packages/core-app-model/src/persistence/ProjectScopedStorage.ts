/**
 * ProjectScopedStorage — Type-safe, leak-proof per-project localStorage.
 *
 * Contract C13 — Project Lifecycle and Isolation (§3.9).
 * (Historically mis-cited as "Contract 48"; C48 is Backup & DR. Corrected in
 *  L-224 §AUDIT-PROJECT-ISOLATION-E2E.)
 *
 * Why this exists
 * ───────────────
 * The historical leak surface for project isolation has always been
 * "side-channel localStorage writes that forgot to include projectId in
 * the key" (UnderlayPersistence, Apr 2026 was the most recent example).
 *
 * Routing per-project persistence through THIS helper makes the bug
 * structurally impossible: keys are auto-prefixed with the active project
 * id, and writes are silently suppressed when no project is bound (e.g.
 * during the brief teardown window between `pryzm-project-switch` and
 * `pryzm-project-loaded`, when the outgoing project's tools are being
 * disposed and could otherwise stamp data into the incoming project's key).
 *
 * Usage
 * ─────
 * ```ts
 * import { projectScopedStorage } from '@/core/persistence/ProjectScopedStorage';
 *
 * projectScopedStorage.setItem('myFeature.state', JSON.stringify(state));
 * const raw = projectScopedStorage.getItem('myFeature.state');
 * projectScopedStorage.removeItem('myFeature.state');
 * ```
 *
 * The actual localStorage key is `pryzm.scoped.<projectId>.myFeature.state`.
 *
 * Static guarantees
 * ─────────────────
 * `scripts/check-storage-isolation.mjs` skips this module's source — every
 * key it produces is `pryzm.scoped.${projectId}.…` which trivially passes
 * the project-scope check.
 *
 * Cleanup
 * ───────
 * When a PROJECT is deleted (not switched), call `clearAllForProject(id)`
 * from the project-deletion path to wipe every key that this project owned.
 */

const STORAGE_KEY_PREFIX = 'pryzm.scoped.';

class ProjectScopedStorageImpl {
    private _projectId: string | null = null;
    private _installed = false;

    /**
     * Wire lifecycle listeners. Idempotent — safe to call multiple times.
     * Called once at boot from `installUnderlayPersistence`'s sibling site
     * (initTools.ts).
     */
    install(): void {
        if (this._installed) return;

        if (typeof window === 'undefined') return;

        // §L-224 — subscribe on the TYPED `runtime.events` bus. The prior
        // `window.addEventListener` binding was dead after the F.events migration
        // (the events are emitted only on `runtime.events`), so `_projectId` was
        // never bound and every scoped read/write silently no-op'd.
        const bus = (window as unknown as {
            runtime?: { events?: { on(ev: string, cb: (p: unknown) => void): (() => void) } };
        }).runtime?.events;
        if (!bus || typeof bus.on !== 'function') {
            console.error('[ProjectScopedStorage] runtime.events unavailable at install — NOT wired.');
            return;
        }

        this._installed = true;

        bus.on('pryzm-project-switch', () => {
            // Suspend writes during the gap between switch and load. Any
            // teardown-time `setItem` will silently no-op rather than write
            // into the OUTGOING project's key (or worse, the INCOMING one).
            this._projectId = null;
        });

        bus.on('pryzm-project-loaded', (payload: unknown) => {
            const detail = (payload as { projectId?: string } | undefined) ?? {};
            const projectId = detail.projectId;
            if (projectId) this._projectId = projectId;
        });

        if (typeof console !== 'undefined') {
            console.log('[ProjectScopedStorage] Installed — auto-keyed by projectId (typed runtime.events)');
        }
    }

    /** Returns the current bound project id, or null when no project is loaded. */
    get currentProjectId(): string | null {
        return this._projectId;
    }

    /** Internal — build the scoped key for the current project. */
    private fullKey(localKey: string, projectIdOverride?: string): string | null {
        const id = projectIdOverride ?? this._projectId;
        if (!id) return null;
        return `${STORAGE_KEY_PREFIX}${id}.${localKey}`;
    }

    /**
     * Persist `value` under the current project's scope. No-op when no
     * project is bound — this is intentional and matches the persistence
     * suspension that prevents teardown-time writes leaking across projects.
     */
    setItem(localKey: string, value: string): boolean {
        const key = this.fullKey(localKey);
        if (!key) {
            console.warn(`[ProjectScopedStorage] setItem("${localKey}") refused — no current project`);
            return false;
        }
        try {
            // @project-isolation: by construction. `key` is the result of
            // fullKey(localKey) which returns `${STORAGE_KEY_PREFIX}${id}.${k}`
            // and short-circuits to null when no project is bound (caught above).
            localStorage.setItem(key, value);
            return true;
        } catch (err) {
            console.warn(`[ProjectScopedStorage] setItem("${localKey}") failed:`, err);
            return false;
        }
    }

    /** Read `value` from the current project's scope. Null on miss / no project. */
    getItem(localKey: string): string | null {
        const key = this.fullKey(localKey);
        if (!key) return null;
        try { return localStorage.getItem(key); } catch { return null; }
    }

    /** Remove `localKey` from the current project's scope. */
    removeItem(localKey: string): void {
        const key = this.fullKey(localKey);
        if (!key) return;
        try { localStorage.removeItem(key); } catch { /* ignore quota / private mode */ }
    }

    /**
     * Wipe every scoped key for the given project. Use ONLY from the
     * project-deletion code path — switching projects must NOT call this
     * (each project's record must survive for next visit).
     */
    clearAllForProject(projectId: string): number {
        if (!projectId || typeof localStorage === 'undefined') return 0;
        const prefix = `${STORAGE_KEY_PREFIX}${projectId}.`;
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(prefix)) toRemove.push(k);
        }
        toRemove.forEach(k => {
            try { localStorage.removeItem(k); } catch { /* ignore */ }
        });
        if (toRemove.length > 0) {
            console.log(`[ProjectScopedStorage] Wiped ${toRemove.length} key(s) for project ${projectId}`);
        }
        return toRemove.length;
    }

    /**
     * Snapshot every key currently held under the scoped prefix, grouped
     * by projectId. Used by ProjectIsolationAudit to detect cross-project
     * leftovers when an "empty" project loads.
     */
    snapshotAllProjects(): Record<string, string[]> {
        const out: Record<string, string[]> = {};
        if (typeof localStorage === 'undefined') return out;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith(STORAGE_KEY_PREFIX)) continue;
            const rest = k.slice(STORAGE_KEY_PREFIX.length);
            const dot = rest.indexOf('.');
            if (dot < 0) continue;
            const pid = rest.slice(0, dot);
            const suffix = rest.slice(dot + 1);
            (out[pid] ??= []).push(suffix);
        }
        return out;
    }
}

export const projectScopedStorage = new ProjectScopedStorageImpl();

if (typeof window !== 'undefined') {
    (window as any).__projectScopedStorage = projectScopedStorage;
}
