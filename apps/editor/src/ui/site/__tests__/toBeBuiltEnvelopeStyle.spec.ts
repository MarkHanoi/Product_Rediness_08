/**
 * §TOBE-ENVELOPE (STR §25.2) — *"ANOTHER COLOUR OF ENVELOPE … AT THIS STAGE WILL BE ORIENTATIVE."*
 * §26.6.3 (2026-09-07) — *"THE MASSING SHOULD BE MORE SOLID AND SLIGHTLY WHITE-GREY LIKE IN HEKTAR."*
 *
 * ⛔ THE ONE ASSERTION THAT MATTERS IS THE COLLISION TEST. Before this module the adopted
 * design-intent LEVEL envelope and the CONFIDENT permitted envelope were both `#6600FF` — the user
 * INVENTED one of those solids and the ordinance dictated the other, and they were painted the same.
 * Under C58 §1.2 the hue IS the confidence badge, so an intent volume wearing it claims a
 * confidence it was never given. That is a honesty defect, not a cosmetic one, and it is the kind
 * that comes back the moment somebody "tidies" a palette — so it is pinned here against EVERY hue
 * in the two families that carry meaning, by importing them rather than re-typing them.
 *
 * ⭐ AND SINCE THE FILL IS NOW A GREY, "not the same hex" IS NOT ENOUGH against the PROVISIONAL
 * GREY. Two greys of similar lightness would be the collision in a new coat. So the gap is pinned
 * as a NUMBER — relative luminance, computed from the two hexes — and the ink that gives the pale
 * solid its silhouette is pinned darker than both.
 */

import { describe, it, expect } from 'vitest';

import {
    TO_BE_BUILT_FILL,
    TO_BE_BUILT_FILL_CSS,
    TO_BE_BUILT_INK,
    TO_BE_BUILT_INK_CSS,
    TO_BE_BUILT_FILL_ALPHA,
    TO_BE_BUILT_GROUND_FILL_ALPHA,
    TO_BE_BUILT_ORIENTATIVE_TEXT,
    ENVELOPE_LEGEND,
    envelopeLegendEntry,
} from '../toBeBuiltEnvelopeStyle';
import {
    CONFIDENT_VIOLET_HEX,
    PROVISIONAL_GREY_HEX,
    SUGGESTED_AMBER_HEX,
} from '../envelopeRenderStyle';
import { STUDY_MASSING_TEAL, STUDY_MASSING_FILL_ALPHA } from '../contextStudyMassingStyle';

/** WCAG relative luminance of a 0xRRGGBB, 0 (black) … 1 (white). */
function luminance(hex: number): number {
    const ch = (v: number): number => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

describe('⛔ the to-be-built envelope may never wear a meaning that is already taken', () => {
    it('the FILL is not any of the three C58 §1.2 CONFIDENCE hues', () => {
        expect(TO_BE_BUILT_FILL).not.toBe(CONFIDENT_VIOLET_HEX);
        expect(TO_BE_BUILT_FILL).not.toBe(PROVISIONAL_GREY_HEX);
        expect(TO_BE_BUILT_FILL).not.toBe(SUGGESTED_AMBER_HEX);
    });

    it('the INK is not any of them either — a rim in the confidence violet would badge the intent', () => {
        expect(TO_BE_BUILT_INK).not.toBe(CONFIDENT_VIOLET_HEX);
        expect(TO_BE_BUILT_INK).not.toBe(PROVISIONAL_GREY_HEX);
        expect(TO_BE_BUILT_INK).not.toBe(SUGGESTED_AMBER_HEX);
    });

    it('is not the CONTEXT-DERIVED STUDY teal either — an intent is not a study', () => {
        expect(TO_BE_BUILT_FILL).not.toBe(STUDY_MASSING_TEAL);
        expect(TO_BE_BUILT_INK).not.toBe(STUDY_MASSING_TEAL);
    });

    it('⭐ §26.6.3 — the fill is a PALE white-grey: far lighter than the provisional grey, by a measured gap', () => {
        // "Slightly white-grey like in Hektar": near-white, and NOT the same lightness band as the
        // permitted estimate's mid grey. The gap is a number so a future "tidy" cannot drift the two
        // together while both stay different hex literals.
        expect(luminance(TO_BE_BUILT_FILL)).toBeGreaterThan(0.75);
        expect(luminance(TO_BE_BUILT_FILL) - luminance(PROVISIONAL_GREY_HEX)).toBeGreaterThan(0.3);
        // …and it is a GREY: the three channels are within a hair of one another.
        const r = (TO_BE_BUILT_FILL >> 16) & 0xff;
        const g = (TO_BE_BUILT_FILL >> 8) & 0xff;
        const b = TO_BE_BUILT_FILL & 0xff;
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(12);
    });

    it('the INK is darker than both the fill and the provisional grey — it is a line, not a fill', () => {
        expect(luminance(TO_BE_BUILT_INK)).toBeLessThan(luminance(TO_BE_BUILT_FILL) - 0.5);
        expect(luminance(TO_BE_BUILT_INK)).toBeLessThan(luminance(PROVISIONAL_GREY_HEX));
    });

    it('the CSS strings are derived from the numbers, never hand-copied', () => {
        expect(TO_BE_BUILT_FILL_CSS).toBe(`#${TO_BE_BUILT_FILL.toString(16).padStart(6, '0')}`);
        expect(TO_BE_BUILT_INK_CSS).toBe(`#${TO_BE_BUILT_INK.toString(16).padStart(6, '0')}`);
        expect(TO_BE_BUILT_FILL_CSS).toMatch(/^#[0-9a-f]{6}$/);
        expect(TO_BE_BUILT_INK_CSS).toMatch(/^#[0-9a-f]{6}$/);
    });
});

describe('the fill weights encode WHOSE claim it is', () => {
    it('⭐ a decision draws HEAVIER than an uncertain measurement', () => {
        // The study is faint because PRYZM is unsure what the LAW allows. The to-be-built envelope
        // is not a claim about the law at all — it is what the user asked for, and PRYZM is not
        // unsure about that. Drawing a decision as faintly as a doubt is §24.1 item 3.
        expect(TO_BE_BUILT_FILL_ALPHA).toBeGreaterThan(STUDY_MASSING_FILL_ALPHA);
        // …and a flat plate (one decision short of a volume) is lighter than the volume.
        expect(TO_BE_BUILT_GROUND_FILL_ALPHA).toBeLessThan(TO_BE_BUILT_FILL_ALPHA);
        // Still visible: an invisible envelope is the defect this lane exists to remove.
        expect(TO_BE_BUILT_GROUND_FILL_ALPHA).toBeGreaterThan(0.1);
    });

    it('⭐ §26.6.3 "MORE SOLID" — the volume reads as a solid, not a tint, and still below opaque', () => {
        // A massing at ≥ 0.5 reads as a body with the ground showing faintly through; 1.0 would hide
        // the rooms per level the founder asked to see in the same sentence (L-13039).
        expect(TO_BE_BUILT_FILL_ALPHA).toBeGreaterThanOrEqual(0.5);
        expect(TO_BE_BUILT_FILL_ALPHA).toBeLessThan(1);
        expect(TO_BE_BUILT_GROUND_FILL_ALPHA).toBeGreaterThanOrEqual(0.4);
    });
});

describe('§25.2 — the legend names the three envelopes and their honesty (§26.6.3: it STAYS)', () => {
    it('has exactly the three kinds, in the order the user meets them', () => {
        expect(ENVELOPE_LEGEND.map((e) => e.kind)).toEqual(['permitted', 'to-be-built', 'room']);
    });

    it('⛔ ONLY the permitted envelope carries a confidence badge', () => {
        expect(envelopeLegendEntry('permitted')?.carriesConfidenceBadge).toBe(true);
        expect(envelopeLegendEntry('to-be-built')?.carriesConfidenceBadge).toBe(false);
        expect(envelopeLegendEntry('room')?.carriesConfidenceBadge).toBe(false);
    });

    it('the permitted row publishes NO fixed swatch — its hue is the confidence, which a legend cannot know', () => {
        expect(envelopeLegendEntry('permitted')?.swatchCss).toBeNull();
        expect(envelopeLegendEntry('permitted')?.meaning).toContain('confidence');
    });

    it('the room row publishes no swatch either — rooms take the occupancy palette', () => {
        expect(envelopeLegendEntry('room')?.swatchCss).toBeNull();
    });

    it('the to-be-built row carries the FILL AND the orientative word', () => {
        const row = envelopeLegendEntry('to-be-built')!;
        expect(row.swatchCss).toBe(TO_BE_BUILT_FILL_CSS);
        expect(row.meaning).toBe(TO_BE_BUILT_ORIENTATIVE_TEXT);
        expect(row.meaning).toContain('Orientative');
        expect(row.meaning).toContain('not a permit');
    });

    it('an unknown kind returns null, never a fabricated row', () => {
        expect(envelopeLegendEntry('massing')).toBeNull();
        expect(envelopeLegendEntry('')).toBeNull();
    });
});
