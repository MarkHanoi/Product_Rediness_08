// @vitest-environment happy-dom
//
// C27 INS-α-2 (BIM 3.0 Inspect Model) — InspectSelectionStore tests.
//
// Verifies the L3 reactive wrapper around the L0 `InspectSelection`
// substrate from `@pryzm/schemas`.  Covers:
//   • New store: get() returns null
//   • set() updates + fires subscribers
//   • set() validates input (Zod throws on invalid selection)
//   • clear() resets to null + fires subscribers ONLY when there was data
//   • clear() on already-null store is a true no-op (no spurious notify)
//   • subscribe() returns a disposer that unsubscribes the listener
//   • Multiple listeners all fire on set
//   • One throwing listener does not starve the others
//   • dispose() clears listeners + prevents future notify
//   • set() after dispose warns and ignores (no throw)
//   • clear() after dispose is a no-op
//   • subscribe() after dispose returns a no-op disposer
//   • dispose() is idempotent
//
// `happy-dom` matches the project convention used by sibling store tests
// (e.g. `registerFamilyFromJson.test.ts`).

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { InspectSelectionStore } from '../src/InspectSelectionStore.js';
import type { InspectSelection } from '@pryzm/schemas';

const validSelection = (over: Partial<InspectSelection> = {}): InspectSelection => ({
    kind: 'apartment',
    id: 'apt-1',
    level: 3,
    breadcrumb: [],
    ...over,
});

describe('InspectSelectionStore (C27 INS-α-2)', () => {
    let store: InspectSelectionStore;

    beforeEach(() => { store = new InspectSelectionStore(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('new store: get() returns null', () => {
        expect(store.get()).toBeNull();
    });

    it('set() updates the selection', () => {
        const sel = validSelection();
        store.set(sel);
        expect(store.get()).toEqual(sel);
    });

    it('set() fires subscribers', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        store.set(validSelection());
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('set() validates — Zod throws on invalid selection', () => {
        // Negative level — fails schema.
        expect(() => store.set({ ...validSelection(), level: -1 })).toThrow();
        // Mutation did NOT happen.
        expect(store.get()).toBeNull();
    });

    it('clear() resets to null + fires subscribers when there was a selection', () => {
        store.set(validSelection());
        const fn = vi.fn();
        store.subscribe(fn);
        store.clear();
        expect(store.get()).toBeNull();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('clear() on already-null store is a no-op (no spurious notify)', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        store.clear();
        expect(fn).not.toHaveBeenCalled();
    });

    it('subscribe() returns a disposer that unsubscribes the listener', () => {
        const fn = vi.fn();
        const dispose = store.subscribe(fn);
        store.set(validSelection({ id: 'apt-1' }));
        expect(fn).toHaveBeenCalledTimes(1);
        dispose();
        store.set(validSelection({ id: 'apt-2' }));
        expect(fn).toHaveBeenCalledTimes(1); // unchanged
    });

    it('multiple listeners all fire on set', () => {
        const a = vi.fn();
        const b = vi.fn();
        const c = vi.fn();
        store.subscribe(a);
        store.subscribe(b);
        store.subscribe(c);
        store.set(validSelection());
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(c).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not starve the others', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const a = vi.fn(() => { throw new Error('boom'); });
        const b = vi.fn();
        store.subscribe(a);
        store.subscribe(b);
        store.set(validSelection());
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        expect(errSpy).toHaveBeenCalled();
    });

    it('dispose() clears listeners + prevents future notify', () => {
        const fn = vi.fn();
        store.subscribe(fn);
        store.dispose();
        // After dispose, set warns + ignores — no notify.
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        store.set(validSelection());
        expect(fn).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('dispose() nulls the selection', () => {
        store.set(validSelection());
        store.dispose();
        expect(store.get()).toBeNull();
    });

    it('set() after dispose() warns and ignores (no throw)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        store.dispose();
        expect(() => store.set(validSelection())).not.toThrow();
        expect(store.get()).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('clear() after dispose() is a no-op', () => {
        store.dispose();
        expect(() => store.clear()).not.toThrow();
        expect(store.get()).toBeNull();
    });

    it('subscribe() after dispose() returns a no-op disposer', () => {
        store.dispose();
        const disposer = store.subscribe(() => {});
        expect(typeof disposer).toBe('function');
        // The disposer should not throw when called.
        expect(() => disposer()).not.toThrow();
    });

    it('dispose() is idempotent', () => {
        store.dispose();
        expect(() => store.dispose()).not.toThrow();
        expect(store.get()).toBeNull();
    });

    it('breadcrumb is preserved through set/get', () => {
        const sel: InspectSelection = {
            kind: 'room',
            id: 'room-7',
            level: 4,
            breadcrumb: [
                { kind: 'project', id: 'p' },
                { kind: 'building', id: 'b' },
                { kind: 'level', id: 'l' },
                { kind: 'apartment', id: 'apt-1' },
            ],
        };
        store.set(sel);
        expect(store.get()).toEqual(sel);
    });
});
