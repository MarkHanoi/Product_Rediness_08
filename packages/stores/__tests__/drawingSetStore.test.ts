// @vitest-environment happy-dom
//
// C30 DSM-α-2 (Drawing Set Management) — DrawingSetStore tests.
//
// Verifies the L3 state container wrapping the L0 drawing-set substrate
// from `@pryzm/schemas/drawing-set` (DSM-α-1).  Covers the public
// surface declared in the DSM-α-2 spec:
//   • Initial state matches the documented default.
//   • createDrawingSet / updateDrawingSet / deleteDrawingSet round-trip
//     + duplicate / unknown-id / invalid-input guards.
//   • setActiveDrawingSet + getActiveDrawingSet convenience.
//   • addRevision: appends, bumps `currentRevision`, rejects duplicate
//     letter and invalid letter shape.
//   • markStatus: 'issued' stamps `issueDate` from the injected `now`.
//   • addSheetToSet / removeSheetFromSet: per-discipline order
//     uniqueness via re-parse; remove is idempotent.
//   • Snapshot immutability — external mutation of the returned
//     `drawingSets` array does NOT leak into internal state.
//   • reset() + dispose() teardown semantics.
//
// `happy-dom` matches the convention used by sibling store tests
// (dataStore.test.ts, isolationStateStore.test.ts).

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
    DrawingSetStore,
    createDrawingSetStore,
    type DrawingSetStoreState,
} from '../src/DrawingSetStore.js';
import type {
    DrawingSet,
    Revision,
    SheetReference,
} from '@pryzm/schemas';

// ── fixture helpers ────────────────────────────────────────────────────

function makeRevision(letter = 'A', date = '2026-06-01'): Revision {
    return {
        letter,
        date,
        description: `Issue ${letter}`,
        author: 'pryzm',
    };
}

function makeSheet(
    overrides: Partial<SheetReference> = {},
): SheetReference {
    return {
        sheetId: 'sheet-1',
        sheetNumber: 'A-101',
        sheetName: 'GROUND FLOOR PLAN',
        discipline: 'A',
        order: 0,
        ...overrides,
    };
}

function makeDrawingSet(overrides: Partial<DrawingSet> = {}): DrawingSet {
    return {
        id: 'ds-1',
        name: 'Tender Set',
        projectId: 'project-1',
        sheets: [],
        currentRevision: 'A',
        revisions: [makeRevision('A')],
        status: 'draft',
        ...overrides,
    };
}

describe('DrawingSetStore (C30 DSM-α-2)', () => {
    let store: DrawingSetStore;
    let fakeNow: Date;

    beforeEach(() => {
        fakeNow = new Date('2026-06-01T09:00:00Z');
        store = createDrawingSetStore({ now: () => fakeNow });
    });
    afterEach(() => { vi.restoreAllMocks(); });

    // ── initial state ───────────────────────────────────────────────────

    it('initial state is empty list + null active', () => {
        const s = store.get();
        expect(s.drawingSets).toEqual([]);
        expect(s.activeDrawingSetId).toBeNull();
    });

    it('createDrawingSetStore() returns a DrawingSetStore instance', () => {
        expect(store).toBeInstanceOf(DrawingSetStore);
    });

    // ── createDrawingSet ────────────────────────────────────────────────

    it('createDrawingSet adds and notifies subscribers', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        store.createDrawingSet(makeDrawingSet());
        expect(store.get().drawingSets).toHaveLength(1);
        expect(store.get().drawingSets[0]!.id).toBe('ds-1');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('createDrawingSet rejects duplicate id', () => {
        store.createDrawingSet(makeDrawingSet());
        expect(() => store.createDrawingSet(makeDrawingSet())).toThrow(/duplicate/i);
        // List unchanged.
        expect(store.get().drawingSets).toHaveLength(1);
    });

    it('createDrawingSet rejects invalid currentRevision (Zod refine)', () => {
        const bad = makeDrawingSet({ currentRevision: 'NOT-IN-REVISIONS' });
        expect(() => store.createDrawingSet(bad)).toThrow();
        expect(store.get().drawingSets).toHaveLength(0);
    });

    it('createDrawingSet rejects an invalid revision letter (Zod regex)', () => {
        const bad = makeDrawingSet({
            currentRevision: 'A',
            revisions: [{ ...makeRevision('A'), letter: 'lowercase' } as unknown as Revision],
        });
        expect(() => store.createDrawingSet(bad)).toThrow();
    });

    // ── updateDrawingSet ────────────────────────────────────────────────

    it('updateDrawingSet patches an existing set', () => {
        store.createDrawingSet(makeDrawingSet());
        store.updateDrawingSet('ds-1', { name: 'Renamed Set' });
        expect(store.get().drawingSets[0]!.name).toBe('Renamed Set');
    });

    it('updateDrawingSet throws on unknown id', () => {
        expect(() => store.updateDrawingSet('ghost', { name: 'x' })).toThrow(/unknown/i);
    });

    it('updateDrawingSet throws when patch produces an invalid result', () => {
        store.createDrawingSet(makeDrawingSet());
        expect(() =>
            store.updateDrawingSet('ds-1', { currentRevision: 'Z' }),
        ).toThrow();
        // Original unchanged.
        expect(store.get().drawingSets[0]!.currentRevision).toBe('A');
    });

    // ── deleteDrawingSet ────────────────────────────────────────────────

    it('deleteDrawingSet drops by id', () => {
        store.createDrawingSet(makeDrawingSet());
        store.createDrawingSet(makeDrawingSet({ id: 'ds-2' }));
        store.deleteDrawingSet('ds-1');
        expect(store.get().drawingSets).toHaveLength(1);
        expect(store.get().drawingSets[0]!.id).toBe('ds-2');
    });

    it('deleteDrawingSet clears active when the active id was deleted', () => {
        store.createDrawingSet(makeDrawingSet());
        store.setActiveDrawingSet('ds-1');
        expect(store.get().activeDrawingSetId).toBe('ds-1');
        store.deleteDrawingSet('ds-1');
        expect(store.get().activeDrawingSetId).toBeNull();
    });

    it('deleteDrawingSet preserves active when a different id was deleted', () => {
        store.createDrawingSet(makeDrawingSet());
        store.createDrawingSet(makeDrawingSet({ id: 'ds-2' }));
        store.setActiveDrawingSet('ds-1');
        store.deleteDrawingSet('ds-2');
        expect(store.get().activeDrawingSetId).toBe('ds-1');
    });

    it('deleteDrawingSet is a no-op (no notify) for an unknown id', () => {
        store.createDrawingSet(makeDrawingSet());
        const fn = vi.fn();
        store.subscribe(fn);
        store.deleteDrawingSet('ghost');
        expect(fn).not.toHaveBeenCalled();
        expect(store.get().drawingSets).toHaveLength(1);
    });

    // ── setActiveDrawingSet ─────────────────────────────────────────────

    it('setActiveDrawingSet accepts null + a valid id', () => {
        store.createDrawingSet(makeDrawingSet());
        store.setActiveDrawingSet('ds-1');
        expect(store.get().activeDrawingSetId).toBe('ds-1');
        store.setActiveDrawingSet(null);
        expect(store.get().activeDrawingSetId).toBeNull();
    });

    it('setActiveDrawingSet throws on an unknown non-null id', () => {
        expect(() => store.setActiveDrawingSet('ghost')).toThrow(/unknown/i);
        expect(store.get().activeDrawingSetId).toBeNull();
    });

    // ── addRevision ─────────────────────────────────────────────────────

    it('addRevision appends and bumps currentRevision', () => {
        store.createDrawingSet(makeDrawingSet());
        store.addRevision('ds-1', makeRevision('B', '2026-06-15'));
        const ds = store.get().drawingSets[0]!;
        expect(ds.revisions.map((r) => r.letter)).toEqual(['A', 'B']);
        expect(ds.currentRevision).toBe('B');
    });

    it('addRevision rejects duplicate letter within the same set', () => {
        store.createDrawingSet(makeDrawingSet());
        expect(() => store.addRevision('ds-1', makeRevision('A'))).toThrow(/duplicate/i);
        expect(store.get().drawingSets[0]!.revisions).toHaveLength(1);
    });

    it('addRevision rejects an invalid letter shape (Zod regex)', () => {
        store.createDrawingSet(makeDrawingSet());
        expect(() =>
            store.addRevision('ds-1', { ...makeRevision('B'), letter: '@@@@' } as Revision),
        ).toThrow();
    });

    it('addRevision throws on an unknown DrawingSet id', () => {
        expect(() => store.addRevision('ghost', makeRevision('A'))).toThrow(/unknown/i);
    });

    // ── markStatus ──────────────────────────────────────────────────────

    it("markStatus moves to 'issued' and stamps issueDate from injected now()", () => {
        store.createDrawingSet(makeDrawingSet());
        store.markStatus('ds-1', 'issued');
        const ds = store.get().drawingSets[0]!;
        expect(ds.status).toBe('issued');
        expect(ds.issueDate).toBe(fakeNow.toISOString());
    });

    it("markStatus moves to a non-issued status without touching issueDate", () => {
        store.createDrawingSet(makeDrawingSet({ issueDate: undefined }));
        store.markStatus('ds-1', 'archived');
        const ds = store.get().drawingSets[0]!;
        expect(ds.status).toBe('archived');
        expect(ds.issueDate).toBeUndefined();
    });

    it('markStatus rejects an unknown status', () => {
        store.createDrawingSet(makeDrawingSet());
        expect(() =>
            store.markStatus('ds-1', 'bogus' as unknown as 'draft'),
        ).toThrow();
        expect(store.get().drawingSets[0]!.status).toBe('draft');
    });

    it('markStatus throws on an unknown DrawingSet id', () => {
        expect(() => store.markStatus('ghost', 'issued')).toThrow(/unknown/i);
    });

    // ── addSheetToSet / removeSheetFromSet ──────────────────────────────

    it('addSheetToSet appends a SheetReference', () => {
        store.createDrawingSet(makeDrawingSet());
        store.addSheetToSet('ds-1', makeSheet());
        expect(store.get().drawingSets[0]!.sheets).toHaveLength(1);
        expect(store.get().drawingSets[0]!.sheets[0]!.sheetNumber).toBe('A-101');
    });

    it('addSheetToSet rejects a duplicate order within the same discipline', () => {
        store.createDrawingSet(makeDrawingSet());
        store.addSheetToSet('ds-1', makeSheet({ sheetId: 's1', order: 0 }));
        expect(() =>
            store.addSheetToSet('ds-1', makeSheet({ sheetId: 's2', order: 0 })),
        ).toThrow();
        expect(store.get().drawingSets[0]!.sheets).toHaveLength(1);
    });

    it('addSheetToSet allows the same order across different disciplines', () => {
        store.createDrawingSet(makeDrawingSet());
        store.addSheetToSet('ds-1', makeSheet({ sheetId: 's-a', discipline: 'A', order: 0 }));
        store.addSheetToSet('ds-1', makeSheet({ sheetId: 's-s', discipline: 'S', order: 0 }));
        expect(store.get().drawingSets[0]!.sheets).toHaveLength(2);
    });

    it('addSheetToSet throws on an unknown DrawingSet id', () => {
        expect(() => store.addSheetToSet('ghost', makeSheet())).toThrow(/unknown/i);
    });

    it('removeSheetFromSet drops by sheetId', () => {
        store.createDrawingSet(makeDrawingSet());
        store.addSheetToSet('ds-1', makeSheet({ sheetId: 's1', order: 0 }));
        store.addSheetToSet('ds-1', makeSheet({ sheetId: 's2', order: 1 }));
        store.removeSheetFromSet('ds-1', 's1');
        expect(store.get().drawingSets[0]!.sheets.map((s) => s.sheetId)).toEqual(['s2']);
    });

    it('removeSheetFromSet is idempotent (no notify) for a missing sheetId', () => {
        store.createDrawingSet(makeDrawingSet());
        store.addSheetToSet('ds-1', makeSheet({ sheetId: 's1', order: 0 }));
        const fn = vi.fn();
        store.subscribe(fn);
        store.removeSheetFromSet('ds-1', 'ghost');
        expect(fn).not.toHaveBeenCalled();
        expect(store.get().drawingSets[0]!.sheets).toHaveLength(1);
    });

    it('removeSheetFromSet throws on an unknown DrawingSet id', () => {
        expect(() => store.removeSheetFromSet('ghost', 's1')).toThrow(/unknown/i);
    });

    // ── getDrawingSet / getActiveDrawingSet ─────────────────────────────

    it('getDrawingSet returns undefined for an unknown id', () => {
        expect(store.getDrawingSet('ghost')).toBeUndefined();
    });

    it('getDrawingSet returns the row for a known id', () => {
        store.createDrawingSet(makeDrawingSet());
        expect(store.getDrawingSet('ds-1')?.name).toBe('Tender Set');
    });

    it('getActiveDrawingSet returns undefined when active is null', () => {
        store.createDrawingSet(makeDrawingSet());
        expect(store.getActiveDrawingSet()).toBeUndefined();
    });

    it('getActiveDrawingSet returns the active row when one is set', () => {
        store.createDrawingSet(makeDrawingSet());
        store.setActiveDrawingSet('ds-1');
        expect(store.getActiveDrawingSet()?.id).toBe('ds-1');
    });

    // ── reset ───────────────────────────────────────────────────────────

    it('reset() returns to the initial state', () => {
        store.createDrawingSet(makeDrawingSet());
        store.setActiveDrawingSet('ds-1');
        store.reset();
        const s = store.get();
        expect(s.drawingSets).toEqual([]);
        expect(s.activeDrawingSetId).toBeNull();
    });

    it('reset() notifies subscribers', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        store.reset();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    // ── immutability ────────────────────────────────────────────────────

    it('external mutation of the returned drawingSets array does NOT affect internal state', () => {
        store.createDrawingSet(makeDrawingSet());
        const snap = store.get();
        // The drawingSets array is frozen — mutating attempts throw in
        // strict mode.  Trying to push must not corrupt the next
        // snapshot either way.
        expect(() => {
            (snap.drawingSets as DrawingSet[]).push(makeDrawingSet({ id: 'rogue' }));
        }).toThrow();
        expect(store.get().drawingSets).toHaveLength(1);
        expect(store.get().drawingSets.map((d) => d.id)).toEqual(['ds-1']);
    });

    it('input DrawingSet is defensively cloned — mutating the caller ref does not leak in', () => {
        const input = makeDrawingSet();
        store.createDrawingSet(input);
        // Caller mutates their original reference — must not leak.
        (input as { name: string }).name = 'HIJACKED';
        expect(store.get().drawingSets[0]!.name).toBe('Tender Set');
    });

    // ── subscribe / lifecycle ───────────────────────────────────────────

    it('subscribe() returns an unsubscribe function that stops callbacks', () => {
        const fn = vi.fn();
        const unsub = store.subscribe(fn);
        store.createDrawingSet(makeDrawingSet());
        expect(fn).toHaveBeenCalledTimes(1);
        unsub();
        store.createDrawingSet(makeDrawingSet({ id: 'ds-2' }));
        expect(fn).toHaveBeenCalledTimes(1); // unchanged after unsubscribe
    });

    it('subscriber receives the fresh snapshot as its argument', () => {
        let received: DrawingSetStoreState | undefined;
        store.subscribe((s) => { received = s; });
        store.createDrawingSet(makeDrawingSet());
        expect(received?.drawingSets).toHaveLength(1);
    });

    it('a throwing listener does not starve the others', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = vi.fn(() => { throw new Error('boom'); });
        const b = vi.fn();
        store.subscribe(a);
        store.subscribe(b);
        store.createDrawingSet(makeDrawingSet());
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(errSpy).toHaveBeenCalled();
    });

    // ── dispose ─────────────────────────────────────────────────────────

    it('mutators after dispose() warn and are no-ops', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        store.dispose();
        store.createDrawingSet(makeDrawingSet());
        store.updateDrawingSet('ds-1', { name: 'x' });
        store.deleteDrawingSet('ds-1');
        store.setActiveDrawingSet(null);
        store.addRevision('ds-1', makeRevision('B'));
        store.markStatus('ds-1', 'issued');
        store.addSheetToSet('ds-1', makeSheet());
        store.removeSheetFromSet('ds-1', 's1');
        store.reset();
        expect(warnSpy).toHaveBeenCalled();
        const s = store.get();
        expect(s.drawingSets).toEqual([]);
        expect(s.activeDrawingSetId).toBeNull();
    });

    it('subscribe() after dispose returns a no-op disposer', () => {
        store.dispose();
        const unsub = store.subscribe(() => {});
        expect(typeof unsub).toBe('function');
        expect(() => unsub()).not.toThrow();
    });

    it('dispose() is idempotent', () => {
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
    });
});
