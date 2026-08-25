/**
 * §G3-STALE-EVENT-HAS-NO-TRACKER — L-11042 (lane LEVELHEIGHT61).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MEASUREMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Undoing a batch in the founder's session (2026-08-24) emitted
 *
 *     [VDT] §G3-STALE-EVENT for unregistered element <uuid>
 *
 * nine times for windows, then again for slabs — each one forcing the coarse
 * `no-graft-ids` WHOLE-DRAWING re-projection instead of the O(dirty) graft the
 * incremental path exists to provide. Undo was re-adding elements under ids
 * `ViewDependencyTracker` had never been told about.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOT CAUSE — the fix for this was written, is correct, and reached NOTHING
 * ─────────────────────────────────────────────────────────────────────────────
 * `elementUndoStoreAdapter` already carried the right call:
 *
 *     _onElementWillAdd → _vdt()?.registerElement?.(id, levelId)
 *
 * with a comment explaining precisely why it must run BEFORE `store.add` ("the
 * §G3-STALE-FIX for create … on redo the bridge does NOT fire, so the adapter
 * must"). ⛔ But `_vdt()` read `window.__viewDependencyTracker`, and that
 * property is **never assigned in any build**:
 *
 *   · it is written at ONE site — `window-shim.ts:106`, inside
 *     `exposeDevHelpers(refs)`, guarded by `refs.viewDependencyTracker !== undefined`;
 *   · its ONE production caller is `engineLauncher.ts:1494`:
 *         if (import.meta.env.DEV) { … exposeDevHelpers({}); … }
 *     — an EMPTY object, inside a DEV-only branch.
 *
 * So in dev the ref is absent and in production the branch is not taken.
 * `_vdt()` returned `undefined` on every call ever made, both call sites
 * optional-chained past it, and nothing anywhere said so.
 *
 * ⭐ This is [[committed-is-not-reachable]] and [[authored-but-unwired-is-the-bottleneck]]
 * in four lines. The fix is to import the singleton, so a rename or a removed
 * export fails the BUILD instead of failing silently at runtime.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARMS
 * ─────────────────────────────────────────────────────────────────────────────
 *   ARM A — ⭐ THE JOIN. Drive the adapter's REAL public entry point
 *           (`applyPatch`, the same one `performUndoRedo` calls) with an `add`
 *           patch, and assert the REAL tracker singleton was told. This is the
 *           arm that fails against the shipped code.
 *   ARM B — the ORDERING. Registration must land BEFORE `store.add`, because
 *           the add synchronously fires the store event the tracker attributes.
 *           Registering after it is the same defect with a smaller window.
 *   ARM C — the DEAD ALIAS, pinned as an assertion so nobody restores it: the
 *           only writer of `window.__viewDependencyTracker` is a DEV-only shim
 *           that its one caller invokes with `{}`.
 *
 * Governance: C03 §4.6 (undo) · C04 §3.3 (re-projection) · ADR-0331 §D3.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import { elementUndoStoreAdapter } from '../src/engine/undo/elementUndoStoreAdapter';

/** Resolve relative to THIS FILE, never the cwd — the app suite runs from
 *  `apps/editor`, the root suite from the repo root. */
const src = (rel: string): string => fileURLToPath(new URL(`../src/${rel}`, import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Harness — a minimal legacy element store, recording the order of operations
// ─────────────────────────────────────────────────────────────────────────────

function recordingStore(seed: Record<string, any> = {}) {
    const byId = new Map<string, any>(Object.entries(seed));
    const log: string[] = [];
    return {
        log,
        byId,
        getById: (id: string) => byId.get(id),
        add: (v: any) => { log.push(`add:${v?.id}`); byId.set(v.id, v); },
        remove: (id: string) => { log.push(`remove:${id}`); byId.delete(id); },
        update: (id: string, patch: any) => { byId.set(id, { ...byId.get(id), ...patch }); },
        getAll: () => Array.from(byId.values()),
    };
}

afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
// ARM A — ⭐ the JOIN
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11042 ARM A — undo re-add tells the REAL ViewDependencyTracker', () => {
    it('registers the re-added element against its level', () => {
        const spy = vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => { /* record only */ });
        const store = recordingStore();

        elementUndoStoreAdapter(store as any, 'windowStore').applyPatch([
            { op: 'add', path: ['win-1'], value: { id: 'win-1', levelId: 'L0', type: 'window' } },
        ]);

        // ⭐ Against the shipped code this is `[]`: `_vdt()` read a window property
        // that no build ever assigns, so the call optional-chained into nothing.
        expect(spy).toHaveBeenCalledWith('win-1', 'L0');
        expect(store.byId.has('win-1')).toBe(true);
    });

    it('a `replace` that lands on a missing element registers it too', () => {
        // The forward-patch path (ADR-0331 §D3) has no undo snapshot, so `replace`
        // degrades to add — and took the same dead branch.
        const spy = vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => { /* record only */ });
        const store = recordingStore();

        elementUndoStoreAdapter(store as any, 'slabStore').applyPatch([
            { op: 'replace', path: ['slab-9'], value: { id: 'slab-9', levelId: 'L1', type: 'slab' } },
        ]);

        expect(spy).toHaveBeenCalledWith('slab-9', 'L1');
    });

    it('an element with NO levelId registers nothing — UNKNOWN is not a level', () => {
        const spy = vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => { /* record only */ });
        const store = recordingStore();

        elementUndoStoreAdapter(store as any, 'windowStore').applyPatch([
            { op: 'add', path: ['win-2'], value: { id: 'win-2', type: 'window' } },
        ]);

        expect(spy).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARM B — the ordering
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11042 ARM B — registration lands BEFORE the store add', () => {
    it('the tracker knows the element by the time the add fires its store event', () => {
        // `store.add` SYNCHRONOUSLY emits the StoreEventBus event the tracker
        // attributes to a level. Registering after the add is the same defect with
        // a smaller window: the event still arrives unattributed.
        const order: string[] = [];
        vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation((id: string) => {
            order.push(`register:${id}`);
        });
        const store = recordingStore();
        const originalAdd = store.add;
        store.add = (v: any) => { order.push(`add:${v?.id}`); originalAdd(v); };

        elementUndoStoreAdapter(store as any, 'windowStore').applyPatch([
            { op: 'add', path: ['win-3'], value: { id: 'win-3', levelId: 'L0', type: 'window' } },
        ]);

        expect(order).toEqual(['register:win-3', 'add:win-3']);
    });

    it('a tracker that throws must not break the undo — the element still lands', () => {
        vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => {
            throw new Error('tracker unavailable');
        });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* the adapter's own guard */ });
        const store = recordingStore();

        elementUndoStoreAdapter(store as any, 'windowStore').applyPatch([
            { op: 'add', path: ['win-4'], value: { id: 'win-4', levelId: 'L0', type: 'window' } },
        ]);

        expect(store.byId.has('win-4')).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARM C — the dead alias, pinned
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11042 ARM C — the window alias that was never assigned', () => {
    /**
     * Source-level, and labelled as such: a text guard can pass while the runtime
     * is broken (L-3013). ARM A covers the runtime. This arm exists so that a
     * future edit restoring `window.__viewDependencyTracker` as the SOURCE has to
     * delete an assertion that says, in one place, why it cannot work.
     */
    it('exposeDevHelpers is the only writer, and its only caller passes {}', () => {
        const shim = readFileSync(src('engine/window-shim.ts'), 'utf8');
        const launcher = readFileSync(src('engine/engineLauncher.ts'), 'utf8');

        // Exactly one assignment, and it is guarded by the ref being present.
        const writes = shim.match(/window\.__viewDependencyTracker\s*=/g) ?? [];
        expect(writes.length).toBe(1);
        expect(shim).toContain('refs.viewDependencyTracker !== undefined');

        // …and the one production caller supplies no refs at all.
        expect(launcher).toContain('exposeDevHelpers({})');
    });

    it('the undo adapter no longer sources the tracker from that alias', () => {
        const adapter = readFileSync(src('engine/undo/elementUndoStoreAdapter.ts'), 'utf8');
        // The identifier survives only inside the explanatory comment; it must not
        // be READ as a value again.
        expect(adapter).not.toMatch(/\)\s*\.__viewDependencyTracker/);
        expect(adapter).toContain("import { viewDependencyTracker } from '@pryzm/core-app-model'");
    });
});
