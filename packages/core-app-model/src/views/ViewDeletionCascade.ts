/**
 * ViewDeletionCascade — §FIX-VIEW-DELETE-ORPHANS (G8, V1-audit §3.5)
 *
 * THE DEFECT. Deleting a ViewDefinition removed exactly ONE record: the view
 * itself (`viewDefinitionStore.delete`). Every piece of per-view state keyed by
 * that view id was left behind:
 *
 *   • ViewIntentInstanceStore — the view's visibility intent + its per-view
 *     overrides. This store IS SERIALISED into the project snapshot
 *     (ProjectSerializer §viewIntentInstances), so every deleted view left a
 *     permanent, growing orphan on disk that no code path could ever reach again.
 *   • ViewCameraStateStore — the per-view saved camera (in-memory only).
 *
 * `DeleteViewDefinitionCommand` even DECLARES the cascade in its `affectedStores`
 * (["view", "view-intent-instance", "view-camera-state"]) and its own header
 * admits the orphan ("downstream cleanup may target them") — the cleanup was
 * simply never written.
 *
 * THE FIX — and why it is an event cascade, not a command edit. The view's
 * dependent state is OWNED by this layer (core-app-model), and the store already
 * broadcasts the two lifecycle facts we need:
 *
 *   vd:view-deleted  ← viewDefinitionStore.delete()
 *   vd:view-created  ← viewDefinitionStore.create() AND .restore()
 *
 * `.restore()` is precisely what `DeleteViewDefinitionCommand.undo()` calls, so a
 * cascade hung on this pair is UNDO-SYMMETRIC by construction: purge on delete,
 * re-instate on the restore of the same id. No command in `packages/command-registry`
 * (or any of the FOUR delete call sites) has to remember to do it, and a delete that
 * arrives from ANY path — command, plugin handler, CRDT merge — cascades identically.
 * This mirrors the shipped elevation-mark cascade in DefaultViewsManager (which
 * already removes a default elevation's marks on `vd:view-deleted` and re-guarantees
 * them alongside the view).
 *
 * Contract compliance:
 *   C03 §1.1 — no schema change; only removes records that reference a dead id.
 *   C05      — the project snapshot no longer accumulates unreachable per-view state.
 *   C06      — view management is a first-class, reversible operation.
 *   §05      — pure client-side module; no DOM rendering, no Three.js.
 *
 * P8 (OTel): `purgeViewDependentState` / `restoreViewDependentState` each open a
 * span via `withViewSpan`.
 */

import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';
import type { ViewIntentInstance } from '../presentation/VisibilityIntentTypes';
import { withViewSpan } from './otel';

/**
 * Everything keyed by a view id that must die WITH the view — and come back with it
 * on undo. Extend this record (and the two functions below) when a new per-view
 * store is added; that is the single place the cascade is defined.
 */
export interface ViewDependentState {
    /** The view's visibility-intent instance (incl. its per-view overrides). */
    intentInstance: ViewIntentInstance | null;
}

/**
 * The state captured at delete time, so an undo (restore) can re-instate it.
 * Bounded: an entry is dropped as soon as it is restored, and the map is capped so
 * a long editing session that deletes many views cannot grow it without limit.
 */
const _tombstones = new Map<string, ViewDependentState>();
const _MAX_TOMBSTONES = 64;

/** Capture + purge every per-view record for `viewId`. Returns what was captured. */
export function purgeViewDependentState(viewId: string): ViewDependentState {
    return withViewSpan('view.purgeDependentState', { 'pryzm.view.id': viewId }, () => {
        const captured: ViewDependentState = {
            intentInstance: viewIntentInstanceStore.get(viewId) ?? null,
        };
        if (captured.intentInstance) viewIntentInstanceStore.delete(viewId);
        return captured;
    });
}

/** Re-instate the per-view records captured by a previous purge of `viewId`. */
export function restoreViewDependentState(viewId: string, state: ViewDependentState): void {
    withViewSpan('view.restoreDependentState', { 'pryzm.view.id': viewId }, () => {
        if (state.intentInstance && !viewIntentInstanceStore.has(viewId)) {
            viewIntentInstanceStore.restore(state.intentInstance);
        }
    });
}

let _initialised = false;

/**
 * Call once at boot (next to initDefaultViewsManager). Idempotent — a second call
 * is a no-op, so a project re-open never double-registers the listeners.
 */
export function initViewDeletionCascade(): void {
    if (_initialised || typeof window === 'undefined') return;
    _initialised = true;

    window.addEventListener('vd:view-deleted', (e: Event) => {
        const viewId = (e as CustomEvent).detail?.viewId as string | undefined;
        if (!viewId) return;
        const captured = purgeViewDependentState(viewId);
        if (!captured.intentInstance) return;   // nothing to remember
        _tombstones.set(viewId, captured);
        if (_tombstones.size > _MAX_TOMBSTONES) {
            // Drop the oldest (Map preserves insertion order).
            const oldest = _tombstones.keys().next().value;
            if (oldest !== undefined) _tombstones.delete(oldest);
        }
    });

    // UNDO of a delete = viewDefinitionStore.restore() → 'vd:view-created' with the
    // SAME id. A genuinely new view has no tombstone, so this is a no-op for it.
    window.addEventListener('vd:view-created', (e: Event) => {
        const viewId = (e as CustomEvent).detail?.viewId as string | undefined;
        if (!viewId) return;
        const tomb = _tombstones.get(viewId);
        if (!tomb) return;
        _tombstones.delete(viewId);
        restoreViewDependentState(viewId, tomb);
    });

    console.log('[ViewDeletionCascade] Initialized — per-view state is purged with its view and restored on undo.');
}

/** Test-only: forget every captured tombstone. */
export function __resetViewDeletionCascadeForTests(): void {
    _tombstones.clear();
}
