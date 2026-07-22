// §FACADE-STUDY-SUBJECT (L-596) — the guard that stops the envelope study decaying into L-272.
//
// L-272: an earlier `renderFacadeAnalysis` silently used `input.boundary` (the PARCEL ring) when
// no building existed, and presented the result as the building's façade study — a phantom
// envelope at the plot line, self-shadowed by the real building inside it. The founder's request
// here IS "analyse the envelope", so it must be an EXPLICIT, LABELLED mode. These tests assert
// exactly that: no substitution in either direction, a labelled result, and a stated refusal.

import { describe, it, expect } from 'vitest';
import {
    resolveFacadeStudySubject,
    includeProposedMassingAsOccluder,
    ENVELOPE_STUDY_LABEL,
} from '../facadeStudySubject';

const RING = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];

describe('🔴 no silent substitution — in EITHER direction', () => {
    it('a missing building REFUSES; it does not quietly study the envelope', () => {
        const r = resolveFacadeStudySubject({
            subject: 'building',
            envelope: { ring: RING, maxHeightM: 20.75 },   // a perfectly good envelope is present…
            hasBuildingRing: false,
        });
        expect(r.status).toBe('refused');
        expect(r.subject).toBe('building');                 // …and is NOT substituted
        if (r.status === 'refused') {
            expect(r.reason).toMatch(/different question/i); // it OFFERS the choice, in words
        }
    });

    it('a missing envelope REFUSES; it does not quietly study the building', () => {
        const r = resolveFacadeStudySubject({
            subject: 'envelope', envelope: null, hasBuildingRing: true,
        });
        expect(r.status).toBe('refused');
        expect(r.subject).toBe('envelope');
        if (r.status === 'refused') expect(r.reason).toMatch(/no buildable envelope/i);
    });

    it('a degenerate envelope ring refuses rather than painting a sliver', () => {
        const r = resolveFacadeStudySubject({
            subject: 'envelope', envelope: { ring: [{ x: 0, z: 0 }, { x: 1, z: 1 }], maxHeightM: 20 },
            hasBuildingRing: false,
        });
        expect(r.status).toBe('refused');
    });
});

describe('§ENVELOPE-NO-FABRICATED-HEIGHT reached through the analysis path', () => {
    it('refuses an envelope with no constructed legal height rather than inventing one', () => {
        for (const h of [null, 0, -3]) {
            const r = resolveFacadeStudySubject({
                subject: 'envelope', envelope: { ring: RING, maxHeightM: h }, hasBuildingRing: false,
            });
            expect(r.status, `maxHeightM=${h}`).toBe('refused');
            if (r.status === 'refused') {
                expect(r.reason).toMatch(/fabricated|inventing/i);
                expect(r.reason).toMatch(/fix the height source/i);
            }
        }
    });
});

describe('R2 — the answer carries its subject', () => {
    it('an envelope study is LABELLED an envelope study and says what it is not', () => {
        const r = resolveFacadeStudySubject({
            subject: 'envelope', envelope: { ring: RING, maxHeightM: 20.75 }, hasBuildingRing: false,
        });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.label).toBe(ENVELOPE_STUDY_LABEL);
        expect(r.caption).toMatch(/buildable envelope/i);
        expect(r.caption).toMatch(/not a façade study of a building/i);
        expect(r.ring).toBe(RING);
        expect(r.heightM).toBe(20.75);
    });

    it('a building study is labelled as one and carries no envelope geometry', () => {
        const r = resolveFacadeStudySubject({
            subject: 'building', envelope: { ring: RING, maxHeightM: 20.75 }, hasBuildingRing: true,
        });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.label).not.toBe(ENVELOPE_STUDY_LABEL);
        expect(r.ring).toBeUndefined();
        expect(r.heightM).toBeUndefined();
    });
});

describe('occluders — the L-272 self-shadowing artefact, stated as code', () => {
    it('the proposed massing shades the BUILDING study (unchanged behaviour)', () => {
        expect(includeProposedMassingAsOccluder('building')).toBe(true);
    });

    it('the proposed massing must NOT shade the ENVELOPE study', () => {
        // A design inside the envelope is the same space counted twice; letting it occlude the
        // envelope reproduces "the real building self-shadowing the phantom".
        expect(includeProposedMassingAsOccluder('envelope')).toBe(false);
    });
});
