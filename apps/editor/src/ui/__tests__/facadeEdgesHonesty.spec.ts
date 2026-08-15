/**
 * §FIX-RESI-FACADE-UNKNOWN (GR-10, the []-means-unknown drain) —
 * DIFFERENTIATING suite for `facadeEdgesDetermination.ts`.
 *
 * The defect these pin: `(apt.facadeEdges ?? [])` in ResidentialBuildingExecutor
 * read "façade set never recorded" as "interior cell with zero façade edges" —
 * re-minting the §RESI-NO-DOUBLE-WALL coincident-wall defect on the cell
 * perimeter and silently skipping the balcony. The "unknown" cases below FAIL
 * against the old `?? []` shape; determined-empty (a real interior cell)
 * stays a first-class answer.
 */
import { describe, it, expect } from 'vitest';
import {
    determineFacadeEdges,
    facadeEdgesUnknownNote,
} from '../residential-building/facadeEdgesDetermination';

describe('determineFacadeEdges — absent is unknown, empty is an interior cell', () => {
    it('ABSENT facadeEdges -> known:false (RELATIONSHIP_NOT_RECORDED), never an interior cell', () => {
        // Old shape: `undefined ?? []` -> [] — this assertion fails against it.
        const d = determineFacadeEdges(undefined);
        expect(d.known).toBe(false);
        if (!d.known) expect(d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('PRESENT-EMPTY array -> determined-empty (a REAL interior cell, all party walls)', () => {
        const d = determineFacadeEdges([]);
        expect(d.known).toBe(true);
        if (d.known) expect(d.edges.size).toBe(0);
    });

    it('the two cases are DIFFERENT values (the collapse the ledger exists to end)', () => {
        expect(determineFacadeEdges(undefined).known).not.toBe(determineFacadeEdges([]).known);
    });

    it('both seam shapes pass through: readonly array and ReadonlySet (negative controls)', () => {
        const fromArray = determineFacadeEdges(['z0', 'x1']);
        const fromSet = determineFacadeEdges(new Set(['z0', 'x1']));
        expect(fromArray.known).toBe(true);
        expect(fromSet.known).toBe(true);
        if (fromArray.known && fromSet.known) {
            expect([...fromArray.edges].sort()).toEqual([...fromSet.edges].sort());
        }
    });

    it('malformed (non-array, non-Set) -> unknown, never coerced', () => {
        const d = determineFacadeEdges('z0' as never);
        expect(d.known).toBe(false);
    });
});

describe('facadeEdgesUnknownNote — the skip states its basis (§REFUSAL-IDENTITY)', () => {
    it('carries the reason token verbatim plus the stated consequence', () => {
        const d = determineFacadeEdges(undefined);
        if (d.known) throw new Error('control precondition failed');
        const note = facadeEdgesUnknownNote(d, 'no balcony can be sited.');
        expect(note).toContain('RELATIONSHIP_NOT_RECORDED');
        expect(note).toContain('no balcony can be sited.');
    });
});
