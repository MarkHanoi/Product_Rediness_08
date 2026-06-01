// C28 DAT-α-3 — PredicateRegistry unit tests.

import { describe, expect, it } from 'vitest';
import {
    PredicateRegistry,
    createPredicateRegistry,
    type PredicateFn,
} from '../src/predicates/PredicateRegistry.js';

const stubPass: PredicateFn = () => ({ pass: true });
const stubFail: PredicateFn = () => ({ pass: false });

describe('PredicateRegistry — empty state', () => {
    it('has() returns false on an empty registry', () => {
        const r = new PredicateRegistry();
        expect(r.has('anything')).toBe(false);
    });

    it('get() returns undefined on an empty registry', () => {
        const r = new PredicateRegistry();
        expect(r.get('anything')).toBeUndefined();
    });

    it('list() returns an empty array on an empty registry', () => {
        const r = new PredicateRegistry();
        expect(r.list()).toEqual([]);
    });

    it('unregister() returns false when the id is absent', () => {
        const r = new PredicateRegistry();
        expect(r.unregister('nope')).toBe(false);
    });
});

describe('PredicateRegistry — register / get / has', () => {
    it('register() makes the id resolvable via get/has/list', () => {
        const r = new PredicateRegistry();
        r.register('test.id', stubPass);
        expect(r.has('test.id')).toBe(true);
        expect(r.get('test.id')).toBe(stubPass);
        expect(r.list()).toEqual(['test.id']);
    });

    it('register() throws on duplicate ids', () => {
        const r = new PredicateRegistry();
        r.register('dup', stubPass);
        expect(() => r.register('dup', stubFail)).toThrow(/duplicate predicateId/);
    });

    it('get() returns the exact function reference passed to register()', () => {
        const r = new PredicateRegistry();
        const fn: PredicateFn = () => ({ pass: true, fixSuggestion: 'x' });
        r.register('ref.identity', fn);
        expect(r.get('ref.identity')).toBe(fn);
    });
});

describe('PredicateRegistry — unregister + clear', () => {
    it('unregister() returns true when removal succeeds + the id is gone', () => {
        const r = new PredicateRegistry();
        r.register('a', stubPass);
        expect(r.unregister('a')).toBe(true);
        expect(r.has('a')).toBe(false);
        expect(r.get('a')).toBeUndefined();
    });

    it('clear() empties every entry', () => {
        const r = new PredicateRegistry();
        r.register('a', stubPass);
        r.register('b', stubFail);
        r.register('c', stubPass);
        r.clear();
        expect(r.list()).toEqual([]);
        expect(r.has('a')).toBe(false);
    });

    it('after clear() the same id may be re-registered', () => {
        const r = new PredicateRegistry();
        r.register('a', stubPass);
        r.clear();
        // Would throw if the old entry leaked through.
        expect(() => r.register('a', stubFail)).not.toThrow();
        expect(r.get('a')).toBe(stubFail);
    });
});

describe('PredicateRegistry — list() ordering', () => {
    it('list() returns ids sorted lexicographically (stable across calls)', () => {
        const r = new PredicateRegistry();
        r.register('zebra', stubPass);
        r.register('alpha', stubPass);
        r.register('mango', stubPass);
        expect(r.list()).toEqual(['alpha', 'mango', 'zebra']);
    });
});

describe('PredicateRegistry — factory', () => {
    it('createPredicateRegistry() returns a fresh registry', () => {
        const a = createPredicateRegistry();
        const b = createPredicateRegistry();
        a.register('x', stubPass);
        expect(a.has('x')).toBe(true);
        expect(b.has('x')).toBe(false);
    });
});
