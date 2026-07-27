// §ENVELOPE-CONFIDENCE-COLOUR (L-608) / §L-619 — the honest-presentation decision for a buildable
// envelope's FLAT render (plan/BIM overlay + card), isolated so the Three view and the info card
// cannot drift. `envelopeRenderStyle` is now a thin adapter over the shared L2 classifier
// (`classifyEnvelopeCompleteness`, C58 §1.14) — the same authority the 3D massing (`envelopeToMassing`)
// uses — so these assertions equally pin that shared rule.
//
// The §L-619 cases below are the founder's Copenhagen defect: DK Plandata publishes no setbacks, so
// the engine fills the parcel and flags the footprint an UPPER BOUND. A "structured" confidence is
// real for the HEIGHT/FAR but NOT for the footprint — so the render must never be a confident violet
// solid. These assert exactly that: upper-bound forces provisional grey + the `footprintUpperBound`
// flag the renderers read to draw a near-wireframe "maximum extent".

import { describe, it, expect } from 'vitest';
import { envelopeRenderStyle } from '../envelopeRenderStyle';

const VIOLET = '#6600FF';
const GREY = '#9A93B0';

describe('envelopeRenderStyle — confident vs provisional (L-608)', () => {
    it('a real determination WITH a real height is the confident violet', () => {
        const s = envelopeRenderStyle('structured', true);
        expect(s.complete).toBe(true);
        expect(s.footprintUpperBound).toBe(false);
        expect(s.cssHex).toBe(VIOLET);
    });

    it('an estimate greys even with a real height', () => {
        const s = envelopeRenderStyle('estimated-ruleset', true);
        expect(s.complete).toBe(false);
        expect(s.cssHex).toBe(GREY);
    });

    it('unknown confidence (persisted ring) greys', () => {
        const s = envelopeRenderStyle(null, true);
        expect(s.complete).toBe(false);
        expect(s.cssHex).toBe(GREY);
    });

    it('a trusted confidence WITHOUT a real height (flat footprint) greys', () => {
        const s = envelopeRenderStyle('structured', false);
        expect(s.complete).toBe(false);
        expect(s.cssHex).toBe(GREY);
    });
});

describe('§L-619 — an UPPER-BOUND footprint is never a confident solid', () => {
    it('forces provisional grey EVEN when the confidence is structured and the height is real', () => {
        // The Copenhagen case: height/FAR are structured, but the footprint == the whole parcel only
        // because no setbacks were published. It must NOT read as a confident buildable solid.
        const s = envelopeRenderStyle('structured', true, true);
        expect(s.complete).toBe(false);
        expect(s.footprintUpperBound).toBe(true);
        expect(s.cssHex).toBe(GREY);
        expect(s.reason).toMatch(/maximum extent/i);
    });

    it('default arg (false) preserves the pre-L-619 confident-violet behaviour byte-for-byte', () => {
        const withDefault = envelopeRenderStyle('structured', true);
        const explicitFalse = envelopeRenderStyle('structured', true, false);
        expect(withDefault).toEqual(explicitFalse);
        expect(withDefault.footprintUpperBound).toBe(false);
        expect(withDefault.cssHex).toBe(VIOLET);
    });

    it('wins over EVERY confidence tier — the footprint is the thing in doubt', () => {
        for (const c of ['authoritative', 'structured', 'block-constructed'] as const) {
            const s = envelopeRenderStyle(c, true, true);
            expect(s.complete).toBe(false);
            expect(s.footprintUpperBound).toBe(true);
            expect(s.cssHex).toBe(GREY);
        }
    });
});
