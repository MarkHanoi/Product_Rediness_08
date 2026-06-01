// A.7.d (Phase A · Sprint 2) — Edge classifications length check tests.

import { describe, expect, it } from 'vitest';
import { checkEdgeClassifications } from '../src/edgeClassifications.js';

describe('checkEdgeClassifications', () => {
    it('passes when lengths match', () => {
        const r = checkEdgeClassifications(
            [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 8 },
            ],
            ['front', 'side', 'rear'],
        );
        expect(r.ok).toBe(true);
        expect(r.message).toBe('');
    });

    it('passes for empty polygon + empty classifications', () => {
        const r = checkEdgeClassifications([], []);
        expect(r.ok).toBe(true);
    });

    it('fails when classifications is shorter than polygon', () => {
        const r = checkEdgeClassifications(
            [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
                { x: 10, z: 8 },
                { x: 0, z: 8 },
            ],
            ['front', 'side'],
        );
        expect(r.ok).toBe(false);
        expect(r.polygonLen).toBe(4);
        expect(r.classificationsLen).toBe(2);
        expect(r.message).toMatch(/MUST equal/i);
        expect(r.message).toMatch(/C19 §2\.7/);
    });

    it('fails when classifications is longer than polygon', () => {
        const r = checkEdgeClassifications(
            [
                { x: 0, z: 0 },
                { x: 10, z: 0 },
            ],
            ['front', 'side', 'rear', 'side'],
        );
        expect(r.ok).toBe(false);
        expect(r.polygonLen).toBe(2);
        expect(r.classificationsLen).toBe(4);
    });
});
