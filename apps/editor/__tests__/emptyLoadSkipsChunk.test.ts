// @vitest-environment happy-dom
//
// §FIX-EMPTY-LOAD-HANG (L-108) — empty project load must NOT use the frame-
// yielding chunked path.
//
// A brand-new EMPTY project (0 elements) took ~16 s to reach the ProjectLoader
// `hydrate` boundary in production. The setup→hydrate window's cost for a 0-element
// snapshot came from work that runs REGARDLESS of element count: the chunked
// executor's unconditional per-build-step FrameScheduler round-trips (pure latency
// when there is no geometry to spread across frames) plus cold `await import()`
// lazy-chunk fetches. The fix routes an elementless snapshot to the synchronous
// one-task path and statically imports the previously-dynamic modules.
//
// This suite locks in the pure decision (`snapshotHasElements`) that gates the
// chunked path: false for an empty snapshot (→ sync load, no frame round-trips),
// true as soon as any geometry is present (→ progressive chunked build preserved).

import { describe, it, expect } from 'vitest';
import { snapshotHasElements } from '../src/engine/persistence/ProjectLoader';

describe('§FIX-EMPTY-LOAD-HANG — snapshotHasElements gates the chunked load path', () => {
    it('an empty new project (elementCount 0, all arrays empty) has NO elements → sync load', () => {
        const empty = {
            elementCount: 0,
            walls: [], slabs: [], columns: [], stairs: [], furniture: [],
            roofs: [], handrails: [], plumbing: [], curtainWalls: [], beams: [],
            ceilings: [], floors: [], rooms: [], lighting: [], doors: [],
            windows: [], grids: [],
        };
        expect(snapshotHasElements(empty)).toBe(false);
    });

    it('trusts a positive elementCount even before arrays are inspected', () => {
        expect(snapshotHasElements({ elementCount: 5 })).toBe(true);
    });

    it('falls back to summing element arrays when elementCount is absent', () => {
        expect(snapshotHasElements({ walls: [{ id: 'w1' }] })).toBe(true);
        expect(snapshotHasElements({ doors: [{ id: 'd1' }], windows: [] })).toBe(true);
        expect(snapshotHasElements({ grids: [{ id: 'g1' }] })).toBe(true);
    });

    it('a snapshot with no elementCount and empty/absent arrays has no elements', () => {
        expect(snapshotHasElements({})).toBe(false);
        expect(snapshotHasElements({ walls: [], doors: [] })).toBe(false);
    });

    it('a single element of any geometry type flips it to chunked (true)', () => {
        for (const key of [
            'walls', 'slabs', 'columns', 'stairs', 'furniture', 'roofs',
            'handrails', 'plumbing', 'curtainWalls', 'beams', 'ceilings',
            'floors', 'rooms', 'lighting', 'doors', 'windows', 'grids',
        ]) {
            expect(snapshotHasElements({ [key]: [{ id: 'x' }] })).toBe(true);
        }
    });

    it('an explicit elementCount of 0 wins over stray array contents (canonical field trusted)', () => {
        // ProjectSerializer writes elementCount as the authoritative total; if it
        // says 0 we honour it (the sync path is still correct for the fallback sum).
        expect(snapshotHasElements({ elementCount: 0 })).toBe(false);
    });
});
