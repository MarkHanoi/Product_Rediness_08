/**
 * ProjectScopeRegistry — Single source of truth for "what is per-project state".
 *
 * Contract: docs/02-decisions/contracts/C13-PROJECT-LIFECYCLE-AND-ISOLATION.md
 *   (§3.10 — every switch-reset surface has a NAMED OWNER; this registry is the
 *    owner-of-record for module-singleton stores.)
 * (The prior header cited `44-…-ANALYSIS.md` / `45-…-IMPLEMENTATION-PLAN.md`,
 *  which do not exist; corrected to C13 in L-224 §AUDIT-PROJECT-ISOLATION-E2E.)
 *
 * Historically, ClearProjectCommand and ProjectSerializer maintained two
 * hand-written lists of stores. They drifted apart, leaving ~18 serialized
 * stores that ClearProjectCommand never wiped — including ifcModelStore,
 * dxfOverlayStore, hierarchyStore, and the four *SystemTypeStores. Imported
 * IFC/DXF/PDF files and custom system types leaked across projects, creating
 * a confidentiality risk.
 *
 * The registry closes the gap. Every per-project store calls
 * projectScopeRegistry.register({ scopeName, clear, reseed? }) at module
 * load time. ClearProjectCommand iterates the registry instead of (in
 * addition to) its hand-written list. New stores added in the future cannot
 * forget to participate — the CI guard test asserts that every member of
 * ProjectSerializer's input list is also a registered scope.
 *
 * Rules:
 *   - clear() MUST be synchronous and idempotent.
 *   - clear() MUST NOT throw — exceptions are captured and logged.
 *   - reseed() runs AFTER clearAll() returns. Use it to repopulate
 *     built-in presets / default views / etc.
 *   - Registration order does not matter — no scope may depend on another's
 *     prior clear having run.
 *   - The registry never holds references to stores' data, only the clear
 *     callback. Safe for HMR / hot-reload.
 */

export interface ProjectScopedStore {
    /** Stable, human-readable identifier used in logs and the CI guard. */
    scopeName: string;
    /** Wipes every byte of per-project state held by this store. Synchronous. */
    clear(): void;
    /**
     * Optional — invoked after every clearAll() once all scopes have cleared.
     * Use this to reseed built-in presets that should always be present
     * (e.g. default schedules, factory wall types).
     */
    reseed?(): void;
}

export interface ClearReport {
    cleared: string[];
    failures: Array<{ scope: string; error: unknown }>;
}

class ProjectScopeRegistryImpl {
    private readonly _scopes = new Map<string, ProjectScopedStore>();

    register(store: ProjectScopedStore): void {
        if (!store?.scopeName) {
            console.warn('[ProjectScopeRegistry] Refusing to register scope with no scopeName');
            return;
        }
        if (this._scopes.has(store.scopeName)) {
            // HMR re-registers existing modules; replace silently.
            this._scopes.set(store.scopeName, store);
            return;
        }
        this._scopes.set(store.scopeName, store);
    }

    list(): ReadonlyArray<ProjectScopedStore> {
        return [...this._scopes.values()];
    }

    has(scopeName: string): boolean {
        return this._scopes.has(scopeName);
    }

    clearAll(): ClearReport {
        const cleared: string[] = [];
        const failures: Array<{ scope: string; error: unknown }> = [];
        for (const store of this._scopes.values()) {
            try {
                store.clear();
                cleared.push(store.scopeName);
            } catch (error) {
                failures.push({ scope: store.scopeName, error });
                console.error(`[ProjectScopeRegistry] clear() failed for "${store.scopeName}":`, error);
            }
        }
        return { cleared, failures };
    }

    /**
     * §L-676-B (C13 §3.7) — clear a NAMED SUBSET of the registered scopes, with the
     * same per-scope failure isolation as {@link clearAll}.
     *
     * WHY. `clearAll()` runs from `ClearProjectCommand`, i.e. at priority 0 of the
     * INCOMING project's load. C13 §3.7 additionally requires the GIS/site half to be
     * torn down synchronously on `pryzm-project-switch`, BEFORE the incoming project's
     * context is set — and `siteProjectScope`'s switch listener could previously only
     * run the three scopes it constructs itself. The two GIS scopes owned elsewhere
     * (`gis.cesiumViewport`, registered in `CesiumViewport`'s constructor, and
     * `gis.areaLayout`, registered in `mountGISArea`) were therefore torn down only on
     * the LATER `clearAll()` pass. Naming them here lets the switch listener reach the
     * registered owner instead of duplicating its clear logic — one owner, one body.
     *
     * A name with no registered owner is reported in `missing`, never silently skipped:
     * "nothing to clear" and "the owner was never registered" are the same value, and
     * L-676 is the second bug in this subsystem caused by not distinguishing them.
     */
    clearScopes(scopeNames: readonly string[]): ClearReport & { missing: string[] } {
        const cleared: string[] = [];
        const failures: Array<{ scope: string; error: unknown }> = [];
        const missing: string[] = [];
        for (const name of scopeNames) {
            const store = this._scopes.get(name);
            if (!store) { missing.push(name); continue; }
            try {
                store.clear();
                cleared.push(name);
            } catch (error) {
                failures.push({ scope: name, error });
                console.error(`[ProjectScopeRegistry] clear() failed for "${name}":`, error);
            }
        }
        return { cleared, failures, missing };
    }

    reseedAll(): void {
        for (const store of this._scopes.values()) {
            if (typeof store.reseed !== 'function') continue;
            try {
                store.reseed();
            } catch (error) {
                console.error(`[ProjectScopeRegistry] reseed() failed for "${store.scopeName}":`, error);
            }
        }
    }
}

export const projectScopeRegistry = new ProjectScopeRegistryImpl();

if (typeof window !== 'undefined') {
    (window as any).__projectScopeRegistry = projectScopeRegistry;
}
