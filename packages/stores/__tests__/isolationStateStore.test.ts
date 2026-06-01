// @vitest-environment happy-dom
//
// C27 INS-α-6 (BIM 3.0 Inspect Model) — IsolationStateStore tests.
//
// Verifies the L3 state container + selection-to-isolation reducer.
// Covers the public surface declared in the INS-α-6 contract:
//   • Initial state matches the documented default.
//   • applyIsolation populates overrides + flips isActive + records the
//     source selection.
//   • applyIsolation across the four relationship tiers (SELECTED,
//     CHILD, SIBLING, UNRELATED) populates one entry per supplied
//     element.
//   • applyIsolation with an empty elements array still flips isActive
//     (the user explicitly asked for isolation) and records the source.
//   • applyIsolation honours `opts.hideUnrelated` — UNRELATED tier is
//     HIDDEN, not DIMMED.
//   • applyIsolation called twice REPLACES (does not accumulate) — the
//     second call's overrides set is exactly what the resolver returned.
//   • clearIsolation empties + isActive=false + sourceSelection=null.
//   • clearIsolation is idempotent — no spurious notify when already
//     inactive.
//   • reset() === clearIsolation() (same semantics, same notify
//     convention).
//   • subscribe receives the fresh snapshot on each change.
//   • Multiple subscribers all fire on applyIsolation.
//   • Unsubscribe stops further callbacks.
//   • get() returns a frozen snapshot — external attempts to mutate
//     `overrides` throw and do not leak in either way.
//   • dispose() teardown semantics — listeners cleared, future
//     applyIsolation warns + ignores.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
    IsolationStateStore,
    createIsolationStateStore,
    type ElementLocation,
} from '../src/IsolationStateStore.js';
import type { InspectSelection } from '@pryzm/schemas';

// Tree layout used by the relationship-tier tests:
//
//   project (p)
//   └── building (b)
//       └── level (l)
//           ├── apartment (apt-1)            ← the SELECTED node
//           │   └── room (room-1)            ← CHILD of selected
//           └── apartment (apt-2)            ← SIBLING of selected
//
//   And an unrelated element off-tree: room-99 under apt-99.

const SELECTED_APT: InspectSelection = {
    kind: 'apartment',
    id: 'apt-1',
    level: 3,
    breadcrumb: [
        { kind: 'project', id: 'p' },
        { kind: 'building', id: 'b' },
        { kind: 'level', id: 'l' },
    ],
};

const locSelected: ElementLocation = {
    elementId: 'apt-1',
    kind: 'apartment',
    parentChain: [
        { kind: 'project', id: 'p' },
        { kind: 'building', id: 'b' },
        { kind: 'level', id: 'l' },
    ],
};

const locChild: ElementLocation = {
    elementId: 'room-1',
    kind: 'room',
    parentChain: [
        { kind: 'project', id: 'p' },
        { kind: 'building', id: 'b' },
        { kind: 'level', id: 'l' },
        { kind: 'apartment', id: 'apt-1' },
    ],
};

const locSibling: ElementLocation = {
    elementId: 'apt-2',
    kind: 'apartment',
    parentChain: [
        { kind: 'project', id: 'p' },
        { kind: 'building', id: 'b' },
        { kind: 'level', id: 'l' },
    ],
};

const locUnrelated: ElementLocation = {
    elementId: 'room-99',
    kind: 'room',
    parentChain: [
        { kind: 'project', id: 'p2' },
        { kind: 'building', id: 'b2' },
        { kind: 'level', id: 'l2' },
        { kind: 'apartment', id: 'apt-99' },
    ],
};

const ALL_LOCATIONS: ReadonlyArray<ElementLocation> = [
    locSelected,
    locChild,
    locSibling,
    locUnrelated,
];

describe('IsolationStateStore (C27 INS-α-6)', () => {
    let store: IsolationStateStore;

    beforeEach(() => { store = createIsolationStateStore(); });
    afterEach(() => { vi.restoreAllMocks(); });

    // ── initial state ───────────────────────────────────────────────────

    it('initial state: empty overrides, isActive=false, sourceSelection=null', () => {
        const s = store.get();
        expect(s.overrides.size).toBe(0);
        expect(s.isActive).toBe(false);
        expect(s.sourceSelection).toBeNull();
    });

    it('createIsolationStateStore() returns an IsolationStateStore instance', () => {
        expect(store).toBeInstanceOf(IsolationStateStore);
    });

    // ── applyIsolation: basic shape ─────────────────────────────────────

    it('applyIsolation populates overrides, flips isActive=true, sets sourceSelection', () => {
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        const s = store.get();
        expect(s.isActive).toBe(true);
        expect(s.sourceSelection).toEqual(SELECTED_APT);
        expect(s.overrides.size).toBe(4);
    });

    it('applyIsolation across SELECTED + CHILD + SIBLING + UNRELATED writes one override per element', () => {
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        const o = store.get().overrides;
        // Verify each element id has an override entry.
        expect(o.has('apt-1')).toBe(true);
        expect(o.has('room-1')).toBe(true);
        expect(o.has('apt-2')).toBe(true);
        expect(o.has('room-99')).toBe(true);
        // SELECTED + CHILD = FULL; SIBLING + UNRELATED = DIMMED (default).
        expect(o.get('apt-1')?.tier).toBe('FULL');
        expect(o.get('room-1')?.tier).toBe('FULL');
        expect(o.get('apt-2')?.tier).toBe('DIMMED');
        expect(o.get('room-99')?.tier).toBe('DIMMED');
    });

    it('applyIsolation with empty elements still flips isActive + records source', () => {
        store.applyIsolation(SELECTED_APT, []);
        const s = store.get();
        expect(s.overrides.size).toBe(0);
        expect(s.isActive).toBe(true);
        expect(s.sourceSelection).toEqual(SELECTED_APT);
    });

    it('applyIsolation honours opts.hideUnrelated — UNRELATED tier becomes HIDDEN', () => {
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS, { hideUnrelated: true });
        const o = store.get().overrides;
        expect(o.get('room-99')?.tier).toBe('HIDDEN');
        // SIBLING is still DIMMED — only UNRELATED is hidden.
        expect(o.get('apt-2')?.tier).toBe('DIMMED');
    });

    it('applyIsolation twice REPLACES — does not accumulate', () => {
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        expect(store.get().overrides.size).toBe(4);

        const otherSelection: InspectSelection = {
            kind: 'apartment',
            id: 'apt-2',
            level: 3,
            breadcrumb: SELECTED_APT.breadcrumb,
        };
        // Re-apply with a smaller set — overrides must be exactly the new set.
        store.applyIsolation(otherSelection, [locSelected, locSibling]);
        const s = store.get();
        expect(s.overrides.size).toBe(2);
        expect(s.sourceSelection?.id).toBe('apt-2');
        // The previously-isolated room-1 / room-99 are gone — no accumulation.
        expect(s.overrides.has('room-1')).toBe(false);
        expect(s.overrides.has('room-99')).toBe(false);
    });

    // ── clearIsolation / reset ──────────────────────────────────────────

    it('clearIsolation empties overrides + flips isActive=false + nulls sourceSelection', () => {
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        store.clearIsolation();
        const s = store.get();
        expect(s.overrides.size).toBe(0);
        expect(s.isActive).toBe(false);
        expect(s.sourceSelection).toBeNull();
    });

    it('clearIsolation is idempotent — no spurious notify when already inactive', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        // Store is fresh — already inactive. Clearing must NOT notify.
        store.clearIsolation();
        expect(fn).not.toHaveBeenCalled();
        // After an apply + clear, a second clear ALSO must not notify.
        store.applyIsolation(SELECTED_APT, [locSelected]);
        store.clearIsolation();
        const callsAfterFirstClear = fn.mock.calls.length;
        store.clearIsolation();
        expect(fn.mock.calls.length).toBe(callsAfterFirstClear);
    });

    it('reset() is an alias for clearIsolation() — same state + same notify convention', () => {
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        const fn = vi.fn();
        store.subscribe(fn);
        store.reset();
        const s = store.get();
        expect(s.overrides.size).toBe(0);
        expect(s.isActive).toBe(false);
        expect(s.sourceSelection).toBeNull();
        expect(fn).toHaveBeenCalledTimes(1);
        // Second reset on already-inactive store must NOT notify.
        store.reset();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    // ── subscribe ───────────────────────────────────────────────────────

    it('subscribe receives the fresh snapshot on each change', () => {
        const received: Array<{ size: number; isActive: boolean }> = [];
        store.subscribe((s) => {
            received.push({ size: s.overrides.size, isActive: s.isActive });
        });
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        store.clearIsolation();
        store.applyIsolation(SELECTED_APT, [locSelected]);
        expect(received).toEqual([
            { size: 4, isActive: true },
            { size: 0, isActive: false },
            { size: 1, isActive: true },
        ]);
    });

    it('multiple subscribers all fire on applyIsolation', () => {
        const a = vi.fn();
        const b = vi.fn();
        const c = vi.fn();
        store.subscribe(a);
        store.subscribe(b);
        store.subscribe(c);
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(c).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe stops further callbacks', () => {
        const fn = vi.fn();
        const unsub = store.subscribe(fn);
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        expect(fn).toHaveBeenCalledTimes(1);
        unsub();
        store.applyIsolation(SELECTED_APT, [locSelected]);
        expect(fn).toHaveBeenCalledTimes(1); // unchanged
    });

    it('a throwing listener does not starve the others', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = vi.fn(() => { throw new Error('boom'); });
        const b = vi.fn();
        store.subscribe(a);
        store.subscribe(b);
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(errSpy).toHaveBeenCalled();
    });

    // ── snapshot immutability ───────────────────────────────────────────

    it('get() returns a frozen snapshot — external mutation cannot leak in', () => {
        store.applyIsolation(SELECTED_APT, ALL_LOCATIONS);
        const snap = store.get();
        // The top-level snapshot object is frozen — attempting to write
        // a top-level property throws in strict mode (vitest is strict).
        expect(() => {
            (snap as { isActive: boolean }).isActive = false;
        }).toThrow();
        // The overrides Map is also frozen — mutator methods throw.
        expect(() => {
            (snap.overrides as Map<string, never>).set('hax', null as never);
        }).toThrow();
        expect(() => {
            (snap.overrides as Map<string, never>).delete('apt-1');
        }).toThrow();
        // State after the throw attempts is unchanged.
        const reread = store.get();
        expect(reread.isActive).toBe(true);
        expect(reread.overrides.size).toBe(4);
        expect(reread.overrides.has('apt-1')).toBe(true);
    });

    // ── dispose ─────────────────────────────────────────────────────────

    it('dispose() clears listeners and applyIsolation after dispose warns + is a no-op', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        store.dispose();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // applyIsolation after dispose: warn + ignore (no throw, no notify).
        expect(() => store.applyIsolation(SELECTED_APT, ALL_LOCATIONS)).not.toThrow();
        expect(fn).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        // State stays in its initial / cleared shape after dispose.
        const s = store.get();
        expect(s.overrides.size).toBe(0);
        expect(s.isActive).toBe(false);
        expect(s.sourceSelection).toBeNull();
    });

    it('subscribe() after dispose returns a no-op disposer', () => {
        store.dispose();
        const unsub = store.subscribe(() => {});
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
    });

    it('clearIsolation() / reset() after dispose are silent no-ops', () => {
        store.dispose();
        expect(() => store.clearIsolation()).not.toThrow();
        expect(() => store.reset()).not.toThrow();
    });

    it('dispose() is idempotent', () => {
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
    });
});
