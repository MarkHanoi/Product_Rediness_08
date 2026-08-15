/**
 * §FIX-FORMA-OPENINGS-UNKNOWN (GR-10, the []-means-unknown drain) —
 * DIFFERENTIATING suite for `formaOpeningsDetermination.ts`, the pure decision
 * behind CesiumViewport's massing insets + façade-study openings.
 *
 * The defect these pin: `input.openings ?? []` (massing) and
 * `(studySubject === 'envelope' ? [] : (input?.openings ?? []))` (study) made
 * an OLDER CALLER that never recorded openings indistinguishable from a
 * building examined and found to have none — solid façades presenting as a
 * determined answer. The "unrecorded" cases below FAIL against the old
 * `?? []` shape; the envelope's empty stays DETERMINED by definition (L-596).
 */
import { describe, it, expect } from 'vitest';
import { determineStudyOpenings } from '../formaOpeningsDetermination';

interface O { kind: 'window' | 'door' }

describe('determineStudyOpenings — three empties, only one of them an answer', () => {
    it('design subject, ABSENT openings -> unrecorded:true (fallback tier, NOT an answer)', () => {
        // Old shape: `input.openings ?? []` -> [] with nothing said — the flag
        // below is the observable difference; this fails against the old code.
        const d = determineStudyOpenings<O>('design', undefined, '[test]');
        expect(d.openings).toEqual([]);
        expect(d.unrecorded).toBe(true);
    });

    it('design subject, AUTHORED-EMPTY openings -> determined (a real zero-opening building)', () => {
        const d = determineStudyOpenings<O>('design', [], '[test]');
        expect(d.openings).toEqual([]);
        expect(d.unrecorded).toBe(false);
        expect(d.note).toBeUndefined();
    });

    it('the two design empties are DIFFERENT values (the collapse the ledger exists to end)', () => {
        const unrecorded = determineStudyOpenings<O>('design', undefined, '[test]');
        const authored = determineStudyOpenings<O>('design', [], '[test]');
        expect(unrecorded.unrecorded).not.toBe(authored.unrecorded);
    });

    it('ENVELOPE subject -> determined-empty BY DEFINITION even when raw is absent (L-596)', () => {
        const d = determineStudyOpenings<O>('envelope', undefined, '[test]');
        expect(d.openings).toEqual([]);
        expect(d.unrecorded).toBe(false);
    });

    it('authored openings pass through untouched (negative control)', () => {
        const d = determineStudyOpenings<O>('design', [{ kind: 'window' }, { kind: 'door' }], '[test]');
        expect(d.unrecorded).toBe(false);
        expect(d.openings).toHaveLength(2);
    });
});

describe('the unrecorded note carries its identity (§REFUSAL-IDENTITY)', () => {
    it('contains the closed reason token verbatim and the surface name', () => {
        const d = determineStudyOpenings<O>('design', undefined, '[CesiumViewport][forma]');
        expect(d.note).toContain('RELATIONSHIP_NOT_RECORDED');
        expect(d.note).toContain('[CesiumViewport][forma]');
        expect(d.note).toContain('NOT determined');
    });
});
