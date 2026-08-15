/**
 * §FIX-DIAG-UNRECORDED (GR-10, the []-means-unknown drain) — DIFFERENTIATING
 * suite for `execDiagDeterminations.ts`, the pure determinations behind
 * houseExecDiagnostics' verdicts.
 *
 * The defect these pin: `w.openings ?? []` / `r.boundingWallIds ?? []` made
 * the execution-boundary diagnostic — the instrument built to locate lost
 * quality — print missing records as measurements: doors=0 (⚠ NO-DOOR) on a
 * wall whose openings were never recorded, neighbours=[none] on a room whose
 * wall linkage was never written. Every "unrecorded" case below FAILS against
 * the old `?? []` shape; present-empty stays the determined zero it is.
 */
import { describe, it, expect } from 'vitest';
import {
    determineRoomBoundingWalls,
    determineWallOpenings,
    unrecordedBasisMarker,
} from '../house-layout/execDiagDeterminations';

describe('determineWallOpenings — absent field is unrecorded, present-empty is a zero', () => {
    it('ABSENT openings -> recorded:false (a floor, not doors=0)', () => {
        // Old shape: `w.openings ?? []` -> [] with recorded-ness erased — the
        // flag is the observable difference; this fails against the old code.
        const d = determineWallOpenings({});
        expect(d.recorded).toBe(false);
        expect(d.ops).toEqual([]);
    });

    it('PRESENT-EMPTY openings -> recorded:true (a wall examined and found solid)', () => {
        const d = determineWallOpenings({ openings: [] });
        expect(d.recorded).toBe(true);
        expect(d.ops).toEqual([]);
    });

    it('the two cases are DIFFERENT values (the collapse the ledger exists to end)', () => {
        expect(determineWallOpenings({}).recorded)
            .not.toBe(determineWallOpenings({ openings: [] }).recorded);
    });

    it('recorded openings pass through untouched (negative control)', () => {
        const d = determineWallOpenings({ openings: [{ type: 'door' }, { type: 'window' }] });
        expect(d.recorded).toBe(true);
        expect(d.ops).toHaveLength(2);
    });
});

describe('determineRoomBoundingWalls — same discrimination for the room linkage', () => {
    it('ABSENT boundingWallIds -> recorded:false, never "bounded by zero walls"', () => {
        const d = determineRoomBoundingWalls({});
        expect(d.recorded).toBe(false);
        expect(d.wallIds).toEqual([]);
    });

    it('PRESENT-EMPTY vs ABSENT differ; recorded ids pass through', () => {
        expect(determineRoomBoundingWalls({ boundingWallIds: [] }).recorded).toBe(true);
        const d = determineRoomBoundingWalls({ boundingWallIds: ['w1', 'w2'] });
        expect(d.recorded).toBe(true);
        expect(d.wallIds).toEqual(['w1', 'w2']);
    });
});

describe('unrecordedBasisMarker — the verdict names its basis (§REFUSAL-IDENTITY)', () => {
    it('unrecorded room linkage -> marker carries the reason token and says FLOOR', () => {
        const m = unrecordedBasisMarker(false, false);
        expect(m).toContain('RELATIONSHIP_NOT_RECORDED');
        expect(m).toContain('FLOOR');
        expect(m).toContain('boundingWallIds');
    });

    it('unrecorded openings on a bounding wall -> a DIFFERENT marker, same token', () => {
        const m = unrecordedBasisMarker(true, true);
        expect(m).toContain('RELATIONSHIP_NOT_RECORDED');
        expect(m).toContain('openings');
        expect(m).not.toEqual(unrecordedBasisMarker(false, false));
    });

    it('fully recorded -> NO marker (a determined zero must not be hedged)', () => {
        expect(unrecordedBasisMarker(true, false)).toBe('');
    });
});
