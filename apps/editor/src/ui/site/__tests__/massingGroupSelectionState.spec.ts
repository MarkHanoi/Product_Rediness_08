// ADR-0383 S6 / D6 (lane MP-UI, 2026-09-09) — THE ONE SELECTION CHANNEL'S BINDING ARMS.
//
// ADR-0383 D6 · C59 §2.10 (one owner per view region) · [[view-region-one-owner]] · P6 · P8.
//
// ⭐ WHY THIS FILE IS WORTH ITS LINES: the split-view "the views get mixed up" report was SIX
// writers of `#container.style.width` oscillating (C59 §2.10). D6 adopts one-owner for the group
// selection BEFORE the second writer exists. These arms pin the properties that make that true —
// the refusal of an unselectable id, the self-healing reconcile, and the single predicate every
// surface must ask instead of comparing ids itself.
//
// The cross-surface proof (all three surfaces reading ONE id) lives in
// `massingGroupOneOwner.spec.ts`; this file pins the channel in isolation.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getMassingGroupSelection,
    setMassingGroupSelection,
    subscribeMassingGroupSelection,
    clearMassingGroupSelection,
    isMassingGroupSelected,
    getSelectedMassingGroupId,
    reconcileMassingGroupSelection,
    __resetMassingGroupSelectionForTests,
} from '../massingGroupSelectionState';

beforeEach(() => {
    __resetMassingGroupSelectionForTests();
});

const A = { groupId: 'g-a', label: 'Block A', source: 'site-panel' } as const;
const B = { groupId: 'g-b', label: 'Block B', source: 'site-3d' } as const;

describe('the slot itself', () => {
    it('starts empty, and NOTHING is selected — the unselected default emphasises nothing', () => {
        // ⛔ The opposite polarity to a RESTRICTION gate, deliberately: a permissive default here
        // would light every building at once, which means the same as lighting none.
        expect(getMassingGroupSelection()).toBeNull();
        expect(getSelectedMassingGroupId()).toBeNull();
        expect(isMassingGroupSelected('g-a')).toBe(false);
        expect(isMassingGroupSelected('anything')).toBe(false);
    });

    it('round-trips a selection and answers the ONE predicate for that group only', () => {
        setMassingGroupSelection(A);
        expect(getMassingGroupSelection()).toEqual(A);
        expect(getSelectedMassingGroupId()).toBe('g-a');
        expect(isMassingGroupSelected('g-a')).toBe(true);
        expect(isMassingGroupSelected('g-b')).toBe(false);
    });

    it('clear() deselects, and every group goes back to being a peer', () => {
        setMassingGroupSelection(A);
        clearMassingGroupSelection();
        expect(getMassingGroupSelection()).toBeNull();
        expect(isMassingGroupSelected('g-a')).toBe(false);
    });
});

describe('⛔ an id that can select nothing is REFUSED rather than stored', () => {
    // A stored `''` would have every surface report "a group is selected" while nothing was
    // emphasised and the roster showed an empty row — a selection that looks like it works and
    // points at nothing. Refusing loudly is the only reading of that state anyone can act on.

    it('an empty groupId is refused and the slot is UNCHANGED', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setMassingGroupSelection(A);
        setMassingGroupSelection({ groupId: '', label: 'nothing', source: 'site-panel' });
        expect(getMassingGroupSelection()).toEqual(A);      // ⛔ NOT cleared, and NOT replaced
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('a whitespace-only groupId is refused too — trim is part of the check, not of the store', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setMassingGroupSelection({ groupId: '   ', label: 'x', source: 'site-map-2d' });
        expect(getMassingGroupSelection()).toBeNull();
        warn.mockRestore();
    });

    it('a refusal does NOT notify subscribers — a no-op that repaints is a lie about state', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fn = vi.fn();
        subscribeMassingGroupSelection(fn);
        setMassingGroupSelection({ groupId: '', label: 'x', source: 'chat' });
        expect(fn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('null IS accepted — deselecting is not the same gesture as selecting nothing', () => {
        setMassingGroupSelection(A);
        setMassingGroupSelection(null);
        expect(getMassingGroupSelection()).toBeNull();
    });
});

describe('the push channel', () => {
    it('notifies every subscriber on a real change', () => {
        const a = vi.fn();
        const b = vi.fn();
        subscribeMassingGroupSelection(a);
        subscribeMassingGroupSelection(b);
        setMassingGroupSelection(A);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('an IDENTICAL re-selection does not notify — three surfaces would each repaint for nothing', () => {
        const fn = vi.fn();
        setMassingGroupSelection(A);
        subscribeMassingGroupSelection(fn);
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-panel' });
        expect(fn).not.toHaveBeenCalled();
    });

    it('the SAME group re-selected from a DIFFERENT surface does notify — provenance changed', () => {
        const fn = vi.fn();
        setMassingGroupSelection(A);
        subscribeMassingGroupSelection(fn);
        setMassingGroupSelection({ groupId: 'g-a', label: 'Block A', source: 'site-3d' });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(getMassingGroupSelection()!.source).toBe('site-3d');
    });

    it('unsubscribe stops delivery to that listener only', () => {
        const a = vi.fn();
        const b = vi.fn();
        const off = subscribeMassingGroupSelection(a);
        subscribeMassingGroupSelection(b);
        off();
        setMassingGroupSelection(A);
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('a listener that THROWS does not stop the others — one bad surface cannot freeze the rest', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const good = vi.fn();
        subscribeMassingGroupSelection(() => { throw new Error('surface exploded'); });
        subscribeMassingGroupSelection(good);
        expect(() => setMassingGroupSelection(A)).not.toThrow();
        expect(good).toHaveBeenCalledTimes(1);
        expect(getMassingGroupSelection()).toEqual(A);
        warn.mockRestore();
    });
});

describe('reconcile — self-healing on read, because a dissolved group fires no event', () => {
    // ADR-0383 D2: *"an empty group is not representable"* — delete every member and the group is
    // simply GONE, with nothing that says so. A rule that must be remembered at N seams (a
    // dissolve verb, an undo, a delete of the last member, a project switch) is a rule that will be
    // forgotten at one, so the reconcile is driven by the caller that already read the store.

    it('drops a selection whose group is no longer live, and REPORTS that it dropped it', () => {
        setMassingGroupSelection(A);
        const dropped = reconcileMassingGroupSelection(['g-b', 'g-c']);
        expect(dropped).toBe(true);
        expect(getMassingGroupSelection()).toBeNull();
    });

    it('keeps a selection that is still live, and reports no change', () => {
        setMassingGroupSelection(A);
        expect(reconcileMassingGroupSelection(['g-a', 'g-b'])).toBe(false);
        expect(getSelectedMassingGroupId()).toBe('g-a');
    });

    it('is a no-op when nothing is selected — including against an EMPTY live list', () => {
        expect(reconcileMassingGroupSelection([])).toBe(false);
        expect(getMassingGroupSelection()).toBeNull();
    });

    it('an empty live list DOES drop a live selection — the last member was deleted', () => {
        setMassingGroupSelection(A);
        expect(reconcileMassingGroupSelection([])).toBe(true);
        expect(getMassingGroupSelection()).toBeNull();
    });

    it('notifies subscribers when it drops, so all three surfaces stop emphasising a dead group', () => {
        setMassingGroupSelection(A);
        const fn = vi.fn();
        subscribeMassingGroupSelection(fn);
        reconcileMassingGroupSelection(['g-z']);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

describe('⛔ the channel stores an ID, never a member list (C84 EI-9)', () => {
    it('the stored selection carries exactly groupId / label / source and no membership', () => {
        // A member list captured at selection time is a CACHE of a store query. It goes stale the
        // instant a storey is added, and the surface holding it would emphasise four prisms of a
        // five-prism building while the panel beside it counted five.
        setMassingGroupSelection(B);
        const sel = getMassingGroupSelection()!;
        expect(Object.keys(sel).sort()).toEqual(['groupId', 'label', 'source']);
        expect((sel as unknown as Record<string, unknown>)['memberIds']).toBeUndefined();
        expect((sel as unknown as Record<string, unknown>)['storeys']).toBeUndefined();
    });
});
