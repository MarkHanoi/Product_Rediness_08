/**
 * §FIX-ENTRANCE-OCCUPANCY-UNKNOWN (GR-10, the []-means-unknown drain) —
 * DIFFERENTIATING suite for `houseEntranceWall.determineOccupiedSpans`.
 *
 * The defect this pins: `occupiedSpansByWall?.get(wallId) ?? []` placed the
 * entrance door as if the wall's claimed spans were KNOWN-clear both when the
 * occupancy map said "zero claims" (determined, by dense construction) AND
 * when no map was ever supplied (nothing examined — the placement may collide
 * with an unclaimed window, the exact §ENTRANCE-DOOR-CLEAR defect). The
 * "unknown" cases below FAIL against the old `?? []` shape.
 */
import { describe, it, expect } from 'vitest';
import {
    determineOccupiedSpans,
    occupancyLogNote,
} from '../house-layout/houseEntranceWall';

type Span = readonly [number, number];
const mapOf = (entries: Record<string, Span[]>): ReadonlyMap<string, readonly Span[]> =>
    new Map(Object.entries(entries));

describe('determineOccupiedSpans — absent map is unknown, missing bucket is determined-zero', () => {
    it('NO map supplied -> known:false (RELATIONSHIP_NOT_RECORDED), never a clear wall', () => {
        // Old shape: `undefined?.get(w) ?? []` -> [] — this assertion fails against it.
        const d = determineOccupiedSpans(undefined, 'w1');
        expect(d.known).toBe(false);
        if (!d.known) expect(d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('map supplied, wall has NO bucket -> determined-zero (dense-construction contract)', () => {
        const d = determineOccupiedSpans(mapOf({ other: [[1, 2]] }), 'w1');
        expect(d).toEqual({ known: true, spans: [] });
    });

    it('the two cases are DIFFERENT values (the collapse the ledger exists to end)', () => {
        const unknown = determineOccupiedSpans(undefined, 'w1');
        const zero = determineOccupiedSpans(mapOf({}), 'w1');
        expect(unknown.known).not.toBe(zero.known);
    });

    it('claimed spans pass through untouched (negative control)', () => {
        const d = determineOccupiedSpans(mapOf({ w1: [[0.5, 1.7], [3, 4]] }), 'w1');
        expect(d.known).toBe(true);
        if (d.known) expect(d.spans).toHaveLength(2);
    });
});

describe('occupancyLogNote — the verdict line names its basis (§REFUSAL-IDENTITY)', () => {
    it('unknown carries the reason token verbatim, not an implied clear', () => {
        const note = occupancyLogNote(determineOccupiedSpans(undefined, 'w1'));
        expect(note).toContain('RELATIONSHIP_NOT_RECORDED');
        expect(note).toContain('UNKNOWN');
    });

    it('examined-zero and unknown print DIFFERENT notes', () => {
        const zero = occupancyLogNote(determineOccupiedSpans(mapOf({}), 'w1'));
        const unknown = occupancyLogNote(determineOccupiedSpans(undefined, 'w1'));
        expect(zero).not.toEqual(unknown);
        expect(zero).toContain('0 claimed span(s) examined');
    });
});
