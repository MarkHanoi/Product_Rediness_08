// ADR-0383 S8 (lane MP-UI, 2026-09-09) — THE COMPOSED EMPHASIS, AND THE DOUBLE-DIM IT PREVENTS.
//
// ADR-0383 D6 · C59 §2.10 · C84 EI-9 · §L-616 · [[same-rule-two-implementations]].

import { describe, it, expect } from 'vitest';
import {
    composeMassingGroupEmphasis,
    massingGroupAlphaFactors,
    MASSING_GROUP_OUTLINE_WEIGHT,
    MASSING_GROUP_SELECTED_OUTLINE_WEIGHT,
} from '../massingGroupEmphasis';
import { SITE_HIGHLIGHT_RECEDE_FACTOR } from '../siteGeometryHighlight';

const R = SITE_HIGHLIGHT_RECEDE_FACTOR;

describe('nothing selected ⇒ every block is a peer', () => {
    it('passes the highlight factor straight through, unmodified', () => {
        expect(composeMassingGroupEmphasis(1, null, 'g-a').alphaFactor).toBe(1);
        expect(composeMassingGroupEmphasis(R, null, 'g-a').alphaFactor).toBe(R);
        expect(composeMassingGroupEmphasis(1, null, null).alphaFactor).toBe(1);
    });

    it('and no prism gains outline weight — lighting every building means lighting none', () => {
        expect(composeMassingGroupEmphasis(1, null, 'g-a').outlineWidth)
            .toBe(MASSING_GROUP_OUTLINE_WEIGHT);
        expect(composeMassingGroupEmphasis(1, null, 'g-a').isMember).toBe(false);
    });
});

describe('a block selected, no card figure highlighted', () => {
    it('the MEMBER keeps EXACTLY its authored alpha — the subject is never brightened', () => {
        // ⛔ Brightening the subject would make the selected block read as more certain than the
        // one beside it — the §L-616 overstatement one step removed.
        const m = composeMassingGroupEmphasis(1, 'g-a', 'g-a');
        expect(m.alphaFactor).toBe(1);
        expect(m.isMember).toBe(true);
        expect(m.outlineWidth).toBe(MASSING_GROUP_SELECTED_OUTLINE_WEIGHT);
    });

    it('a NON-member recedes by exactly one factor', () => {
        const o = composeMassingGroupEmphasis(1, 'g-a', 'g-b');
        expect(o.alphaFactor).toBe(R);
        expect(o.isMember).toBe(false);
        expect(o.outlineWidth).toBe(MASSING_GROUP_OUTLINE_WEIGHT);
    });

    it('an UNGROUPED prism is a non-member — it is in no block, so it is not in this one', () => {
        expect(composeMassingGroupEmphasis(1, 'g-a', null).alphaFactor).toBe(R);
        expect(composeMassingGroupEmphasis(1, 'g-a', null).isMember).toBe(false);
    });
});

describe('⭐ THE ARM THIS MODULE EXISTS FOR — the two channels compose ONCE, never twice', () => {
    it('a NON-member during a card highlight recedes by ONE factor, not two', () => {
        // ⛔ THE DEFECT THIS PINS: if the site-highlight channel and the group channel each applied
        // SITE_HIGHLIGHT_RECEDE_FACTOR independently, this would be R × R = 0.0484 of authored
        // alpha — a solid the user drew, effectively vanishing because they clicked a number on a
        // parcel card. And the 2D map and the 3D scene would each be free to get it wrong
        // differently.
        const both = composeMassingGroupEmphasis(R, 'g-a', 'g-b').alphaFactor;
        expect(both).toBeCloseTo(R * R, 10);
        // ⚠ READ THAT CAREFULLY: R × R IS CORRECT HERE and is NOT the double-dim. The two channels
        // are answering DIFFERENT questions — "is this figure the card's subject?" and "is this
        // block the selected one?" — and a prism that fails BOTH is twice-uninteresting. The defect
        // would be applying the GROUP factor twice, which is what the next arm forbids.
        expect(both).not.toBe(R);
    });

    it('a MEMBER during a card highlight recedes by the CARD factor ONLY', () => {
        // ⭐ THIS is the arm that catches the real double-dim: the selected block must not be dimmed
        // for not being itself.
        expect(composeMassingGroupEmphasis(R, 'g-a', 'g-a').alphaFactor).toBe(R);
    });

    it('the composition is a MULTIPLIER on the authored alpha, never a target', () => {
        // A flat target would let a near-wireframe shell come out DENSER while receding than it was
        // authored — the honesty regression the multiplier exists to make impossible.
        for (const base of [1, 0.5, 0.08, R]) {
            expect(composeMassingGroupEmphasis(base, 'g-a', 'g-a').alphaFactor).toBe(base);
            expect(composeMassingGroupEmphasis(base, 'g-a', 'g-b').alphaFactor).toBeCloseTo(base * R, 12);
        }
    });
});

describe('massingGroupAlphaFactors — the GPU-expression pair, derived from the same composer', () => {
    it('returns the member and non-member numbers for a selected block', () => {
        const f = massingGroupAlphaFactors(1, 'g-a');
        expect(f.member).toBe(1);
        expect(f.other).toBeCloseTo(R, 12);
    });

    it('collapses to one number when nothing is selected — the resting state stays cheap', () => {
        const f = massingGroupAlphaFactors(0.6, null);
        expect(f.member).toBe(0.6);
        expect(f.other).toBe(0.6);
    });

    it('⭐ AGREES WITH composeMassingGroupEmphasis — the 2D and 3D paths cannot diverge', () => {
        // [[same-rule-two-implementations]]'s prescription is a cross-model agreement check. The 2D
        // map paints from these two numbers and the 3D scene calls the composer per entity; if they
        // ever disagreed, one surface would dim a block the other did not.
        for (const base of [1, R, 0.35]) {
            const f = massingGroupAlphaFactors(base, 'g-a');
            expect(f.member).toBe(composeMassingGroupEmphasis(base, 'g-a', 'g-a').alphaFactor);
            expect(f.other).toBe(composeMassingGroupEmphasis(base, 'g-a', 'g-zzz').alphaFactor);
        }
    });
});

describe('⛔ NO HUE. The module mints no palette, and that is asserted, not assumed', () => {
    it('the emphasis carries alpha, weight and membership — and nothing colour-shaped', () => {
        // `envelopeRenderStyle.ts` spends hue on CONFIDENCE; a per-group tint would launder a study
        // into a permit one colour at a time (§L-616). The brief for this stage said "per-group
        // tint" and `massingGroupSelectionState.ts:56-66` forbids it; this arm pins the resolution.
        const keys = Object.keys(composeMassingGroupEmphasis(1, 'g-a', 'g-a')).sort();
        expect(keys).toEqual(['alphaFactor', 'isMember', 'outlineWidth']);
        for (const k of keys) expect(k.toLowerCase()).not.toMatch(/colou?r|hue|tint/);
    });

    it('the selected weight is HEAVIER than the resting one — the distinction is real', () => {
        expect(MASSING_GROUP_SELECTED_OUTLINE_WEIGHT).toBeGreaterThan(MASSING_GROUP_OUTLINE_WEIGHT);
    });
});
