// §MANUALENV159 (L-12640) — `userSuppliedStudyHeightState.ts`: the RAW, PROJECT-persisted
// "assume this height" decision, keyed by site id. Pins the properties the module header states:
// serialize/restore round-trips exactly, `undefined` (never `{}`) when nothing was ever typed,
// and a project switch (`resetUserSuppliedStudyHeightState`) never leaks project A's decision
// into project B (C13 §4).

import { describe, it, expect, afterEach } from 'vitest';
import {
    setUserSuppliedStudyHeight,
    getUserSuppliedStudyHeight,
    clearUserSuppliedStudyHeight,
    resetUserSuppliedStudyHeightState,
    serializeUserSuppliedStudyHeights,
    restoreUserSuppliedStudyHeights,
    type UserSuppliedStudyHeightRecord,
} from '../userSuppliedStudyHeightState';

afterEach(() => {
    resetUserSuppliedStudyHeightState();
});

const RECORD_A: UserSuppliedStudyHeightRecord = {
    heightM: 24.5,
    setbackM: 0,
    savedAtIso: '2026-08-27T09:00:00.000Z',
};
const RECORD_B: UserSuppliedStudyHeightRecord = {
    heightM: 18,
    setbackM: 2,
    savedAtIso: '2026-08-27T10:00:00.000Z',
};

describe('§MANUALENV159 — set/get/clear', () => {
    it('RED: nothing was ever typed for this site — get returns null', () => {
        expect(getUserSuppliedStudyHeight('site-nobody-typed-here')).toBeNull();
    });

    it('GREEN: a saved decision reads back byte-identical', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        expect(getUserSuppliedStudyHeight('site-1')).toEqual(RECORD_A);
    });

    it('a second save for the SAME site OVERWRITES, never merges or appends', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        setUserSuppliedStudyHeight('site-1', RECORD_B);
        expect(getUserSuppliedStudyHeight('site-1')).toEqual(RECORD_B);
    });

    it('two sites never collide', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        setUserSuppliedStudyHeight('site-2', RECORD_B);
        expect(getUserSuppliedStudyHeight('site-1')).toEqual(RECORD_A);
        expect(getUserSuppliedStudyHeight('site-2')).toEqual(RECORD_B);
    });

    it('clearUserSuppliedStudyHeight drops exactly one site, leaving siblings intact', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        setUserSuppliedStudyHeight('site-2', RECORD_B);
        clearUserSuppliedStudyHeight('site-1');
        expect(getUserSuppliedStudyHeight('site-1')).toBeNull();
        expect(getUserSuppliedStudyHeight('site-2')).toEqual(RECORD_B);
    });
});

describe('§MANUALENV159 — C47 additive-optional serialize/restore (the §RATES157 pattern)', () => {
    it('RED: nothing recorded ⇒ serialize returns `undefined`, never `{}` — an untouched project carries no key at all', () => {
        expect(serializeUserSuppliedStudyHeights()).toBeUndefined();
    });

    it('GREEN: a recorded decision serializes to `{ [siteId]: record }`', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        expect(serializeUserSuppliedStudyHeights()).toEqual({ 'site-1': RECORD_A });
    });

    it('ROUND-TRIP: serialize → reset (simulating project switch) → restore is byte-identical', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        setUserSuppliedStudyHeight('site-2', RECORD_B);
        const serialized = serializeUserSuppliedStudyHeights();
        resetUserSuppliedStudyHeightState();
        expect(getUserSuppliedStudyHeight('site-1')).toBeNull(); // confirms the reset actually ran
        restoreUserSuppliedStudyHeights(serialized);
        expect(getUserSuppliedStudyHeight('site-1')).toEqual(RECORD_A);
        expect(getUserSuppliedStudyHeight('site-2')).toEqual(RECORD_B);
    });

    it('restoring `undefined` (a pre-§MANUALENV159 snapshot) is a clean no-op, never a throw', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A); // leftover from a PRIOR project
        expect(() => restoreUserSuppliedStudyHeights(undefined)).not.toThrow();
        // A load is a FULL-STATE operation (mirrors `resetContextDerivedStudyEnvelopeState` at
        // project-switch) — the prior project's leftover must not survive into the new one just
        // because the new snapshot happened to carry no `manualStudyHeight` key.
        expect(getUserSuppliedStudyHeight('site-1')).toBeNull();
    });

    it('restoring `null` behaves identically to `undefined`', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        restoreUserSuppliedStudyHeights(null);
        expect(getUserSuppliedStudyHeight('site-1')).toBeNull();
    });
});

describe('§MANUALENV159 — C13 §4 project-switch isolation', () => {
    it('resetUserSuppliedStudyHeightState drops EVERY recorded decision, not just one site', () => {
        setUserSuppliedStudyHeight('site-1', RECORD_A);
        setUserSuppliedStudyHeight('site-2', RECORD_B);
        resetUserSuppliedStudyHeightState();
        expect(getUserSuppliedStudyHeight('site-1')).toBeNull();
        expect(getUserSuppliedStudyHeight('site-2')).toBeNull();
        expect(serializeUserSuppliedStudyHeights()).toBeUndefined();
    });
});
