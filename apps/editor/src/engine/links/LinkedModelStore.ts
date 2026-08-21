/**
 * LinkedModelStore — the host project's table of LINKED MODEL REFERENCES.
 *
 * ── WHAT IS IN HERE, AND WHAT IS EMPHATICALLY NOT ────────────────────────────
 *
 * Only {@link LinkedModelRef} records: id, source project, pin, anchor, display
 * mode. **No elements. No geometry. No THREE.** ADR-0346 D1 — what crosses the
 * project boundary is a REFERENCE the host owns, never elements the host holds.
 * That is the whole reason C13 (project isolation) survives this feature.
 *
 * Modelled deliberately on `packages/file-format/src/import/dxf/DxfOverlayStore.ts`,
 * which is the proven shape for "N plain serialisable records beside the elements":
 * a Map, `serialize()`/`restore()`, and a module-scope `projectScopeRegistry`
 * registration so the C13 teardown owns it by name (C13 §3.10).
 *
 * ── WHY IT IS NOT AN ElementStore ────────────────────────────────────────────
 *
 * `ProjectIsolationAudit`'s `store.foreignElement` arm (`:653-662`) reads ids from
 * the fifteen `window.*Store` globals in `AUDITED_STORE_GLOBALS` (`:732-737`) and
 * flags any id absent from the loaded project's expectation. Linked elements are
 * by definition absent from it. Putting them in an ElementStore would therefore
 * trip that arm N times per link — and the arm would be RIGHT: an element in a
 * host element store IS host state, whatever we called it. So they are not there,
 * and this store is not one of the fifteen.
 *
 * ── WHY THIS STORE IS NOT ON THE StoreEventBus ───────────────────────────────
 *
 * `StoreChangeEvent` carries no projectId (`StoreEventBus.ts:63-97`, and its own
 * header says so at `:52-61`), so an event about a linked element would be
 * unattributable by construction — the exact L-713 shape. Link changes are
 * broadcast on the DOM event below instead, where the payload is a LINK id, which
 * is host state and always attributable.
 *
 * Contracts: C13 §3.10/§3.13, C05, C47. ADR-0346. Issue-log L-2900.
 */

import { projectScopeRegistry } from '@pryzm/core-app-model';
import type { LinkedModelRef, LinkedModelSnapshot } from '@pryzm/schemas';
import { LINKED_MODEL_REF_VERSION } from '@pryzm/schemas';

/**
 * Fired on `window` whenever the set of links or any link's display mode changes.
 * The renderer and the panel both listen; neither reads the store on a timer.
 */
export const LINKED_MODELS_CHANGED_EVENT = 'pryzm-linked-models-changed';

class LinkedModelStoreImpl {
    private _records = new Map<string, LinkedModelRef>();

    /** Add or replace a link. Keyed by `ref.id`, so a re-anchor is an update. */
    put(ref: LinkedModelRef): void {
        this._records.set(ref.id, ref);
        this._announce();
    }

    /** Remove a link. Returns what was removed so the caller can undo/report it. */
    remove(linkId: string): LinkedModelRef | undefined {
        const existing = this._records.get(linkId);
        if (existing === undefined) return undefined;
        this._records.delete(linkId);
        this._announce();
        return existing;
    }

    get(linkId: string): LinkedModelRef | undefined {
        return this._records.get(linkId);
    }

    getAll(): readonly LinkedModelRef[] {
        return Array.from(this._records.values());
    }

    size(): number { return this._records.size; }

    /**
     * True iff this project already links that source. Used by `link.create`'s
     * `canExecute` so a duplicate link is refused BY NAME rather than silently
     * producing two identical subtrees (C82 §1.3 — a refusal must say what).
     */
    hasSource(sourceProjectId: string): boolean {
        for (const r of this._records.values()) {
            if (r.sourceProjectId === sourceProjectId) return true;
        }
        return false;
    }

    /**
     * C13 teardown. Synchronous, idempotent, non-throwing — the
     * `projectScopeRegistry` contract (`ProjectScopeRegistry.ts:24-32`).
     *
     * NOTE this clears the REFERENCE table only. Detaching the scene subtrees is
     * `linkedModelScope.clearMountedLinks()`, a SEPARATE declared owner, because
     * the two are genuinely different surfaces and C13 §3.10 wants one named owner
     * each — the `views.mountedDrawing` lesson, where a teardown that cleared the
     * cache but not the mount left one surface half-torn-down and reported clean.
     */
    clear(): void {
        if (this._records.size === 0) return;
        this._records.clear();
        this._announce();
    }

    /** Serialize for `ProjectSnapshot.linkedModels`. */
    serialize(): LinkedModelSnapshot {
        return {
            version: LINKED_MODEL_REF_VERSION,
            links: this.getAll().map(r => structuredClone(r) as LinkedModelRef),
        };
    }

    /**
     * Restore from a snapshot.
     *
     * Rows whose `hostProjectId` names a DIFFERENT project are dropped and COUNTED,
     * never silently kept: a ref carrying someone else's host id inside this file is
     * a C13 §3.13 violation, and quietly adopting it would launder it into host
     * state. Passing `hostProjectId` in (rather than resolving it here) keeps this
     * method pure enough to unit-test.
     */
    restore(data: LinkedModelSnapshot | null | undefined, hostProjectId: string | null): number {
        this._records.clear();
        let dropped = 0;
        if (data?.links != null && Array.isArray(data.links)) {
            for (const ref of data.links) {
                if (hostProjectId !== null && ref.hostProjectId !== hostProjectId) {
                    dropped += 1;
                    console.warn(
                        `[LinkedModelStore] §C13-LINK-HOST-MISMATCH — dropped link ${ref.id}: `
                        + `its hostProjectId "${ref.hostProjectId}" is not the loaded project `
                        + `"${hostProjectId}". A link belongs to the project that created it (C13 §3.13).`,
                    );
                    continue;
                }
                this._records.set(ref.id, structuredClone(ref) as LinkedModelRef);
            }
        }
        this._announce();
        return dropped;
    }

    private _announce(): void {
        if (typeof window === 'undefined') return;
        try {
            window.dispatchEvent(new CustomEvent(LINKED_MODELS_CHANGED_EVENT));
        } catch {
            // A broadcast failure must never break a command. The store is still
            // correct; only the repaint is missed, and the next change repaints.
        }
    }
}

export const linkedModelStore = new LinkedModelStoreImpl();
export type LinkedModelStore = LinkedModelStoreImpl;

// ── C13 teardown registration: module scope, an import side effect ───────────
//
// The REFERENCE TABLE and the SCENE MOUNTS are two surfaces with two owners, on
// purpose. C13 §3.10 wants exactly one named owner per surface, and the
// `views.mountedDrawing` defect (L-1225 / C13 §7.5) is what happens when one
// teardown owns only the half it knows about: the cache was cleared, the mount was
// not, and the audit reported clean while the previous project's linework was still
// on screen. So: `linkedModelStore` clears the refs, `links.linkedModels` detaches
// the geometry, and neither pretends to do the other's job.
projectScopeRegistry.register({
    scopeName: 'linkedModelStore',
    clear: () => { linkedModelStore.clear(); },
});
