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

// §OPEN-TOP-INDICATIVE (ADR-0293 / L-677) — the FLAT surface's half of the posture contract. The L2
// classifier is pinned exhaustively in `site-parcel-data/__tests__/envelopePosturePresentation.test.ts`;
// what THIS file must prove is that the flat overlay + card ADAPTER maps that class to the right
// pixels — that an indicative envelope never receives the determination violet, and that the fourth
// argument's default left the three pre-existing call sites alone.
describe('§OPEN-TOP-INDICATIVE — an indicative envelope never gets the determination violet', () => {
    it('⭐ THE CONTRACT: it greys and flags `openTop` even at the STRONGEST possible signals', () => {
        // Authoritative confidence, a real height, a genuinely solved footprint — the exact case
        // that used to classify `complete` and paint #6600FF, identical to a signed determination.
        const s = envelopeRenderStyle('authoritative', true, false, 'open-top-indicative');
        expect(s.complete).toBe(false);
        expect(s.openTop).toBe(true);
        expect(s.cssHex).toBe(GREY);
        expect(s.cssHex).not.toBe(VIOLET);
        expect(s.reason).toMatch(/indicative/i);
        expect(s.reason).toMatch(/open top/i);
    });

    it('⛔ the violet is UNREACHABLE for an indicative envelope, over every input combination', () => {
        for (const c of [
            'authoritative',
            'structured',
            'block-constructed',
            'estimated-ruleset',
            'not-determined',
            null,
        ] as const) {
            for (const h of [true, false]) {
                for (const u of [true, false]) {
                    const s = envelopeRenderStyle(c, h, u, 'open-top-indicative');
                    expect(s.complete, `${c}/${h}/${u}`).toBe(false);
                    expect(s.openTop, `${c}/${h}/${u}`).toBe(true);
                    expect(s.cssHex, `${c}/${h}/${u}`).toBe(GREY);
                    expect(s.hex, `${c}/${h}/${u}`).not.toBe(0x6600ff);
                }
            }
        }
    });

    it('NO NEW COLOUR SYSTEM — the swatch set is still exactly {violet, grey}', () => {
        const swatches = new Set(
            (['determination', 'open-top-indicative', 'refused', null] as const).flatMap((p) => [
                envelopeRenderStyle('authoritative', true, false, p).cssHex,
                envelopeRenderStyle('estimated-ruleset', true, false, p).cssHex,
                envelopeRenderStyle('structured', true, true, p).cssHex,
            ]),
        );
        expect([...swatches].sort()).toEqual([GREY, VIOLET].sort());
    });

    it('⇒ INDICATIVE is separated from merely-provisional by the SILHOUETTE, not a third swatch', () => {
        const estimate = envelopeRenderStyle('estimated-ruleset', true);
        const indicative = envelopeRenderStyle('authoritative', true, false, 'open-top-indicative');
        expect(indicative.cssHex).toBe(estimate.cssHex); // same grey — no new colour
        expect(indicative.openTop).toBe(true); // …and a DIFFERENT shape
        expect(estimate.openTop).toBe(false);
    });

    it('⚠ the two doubts COMPOSE — upper-bound footprint AND indicative posture report both flags', () => {
        const s = envelopeRenderStyle('structured', true, true, 'open-top-indicative');
        expect(s.footprintUpperBound).toBe(true);
        expect(s.openTop).toBe(true);
        expect(s.cssHex).toBe(GREY);
    });

    it('a `refused` posture greys and is NOT dressed up as an open top', () => {
        const s = envelopeRenderStyle('authoritative', true, false, 'refused');
        expect(s.complete).toBe(false);
        expect(s.openTop).toBe(false);
        expect(s.cssHex).toBe(GREY);
    });
});

describe('§OPEN-TOP-INDICATIVE — the pre-existing 3-arg call site is byte-identical', () => {
    it('⭐ 3-arg === null === undefined === `determination`, over the whole matrix', () => {
        // This adapter is one of the THREE shipped call sites. Had the fourth argument's default
        // been anything but inert, every confident envelope in every jurisdiction would have greyed.
        for (const c of [
            'authoritative',
            'structured',
            'block-constructed',
            'estimated-ruleset',
            'not-determined',
            null,
        ] as const) {
            for (const h of [true, false]) {
                for (const u of [true, false]) {
                    const three = envelopeRenderStyle(c, h, u);
                    const label = `${c}/${h}/${u}`;
                    expect(envelopeRenderStyle(c, h, u, null), label).toEqual(three);
                    expect(envelopeRenderStyle(c, h, u, undefined), label).toEqual(three);
                    expect(envelopeRenderStyle(c, h, u, 'determination'), label).toEqual(three);
                    expect(three.openTop, label).toBe(false);
                }
            }
        }
    });

    it('the confident violet still happens — the guard did not simply grey everything', () => {
        expect(envelopeRenderStyle('structured', true).cssHex).toBe(VIOLET);
        expect(envelopeRenderStyle('authoritative', true, false, 'determination').cssHex).toBe(VIOLET);
    });
});
