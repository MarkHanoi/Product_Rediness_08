/**
 * §TOBE-ENVELOPE (STR §25.2) — *"ANOTHER COLOUR OF ENVELOPE … AT THIS STAGE WILL BE ORIENTATIVE."*
 *
 * ⛔ THE ONE ASSERTION THAT MATTERS IS THE COLLISION TEST. Before this module the adopted
 * design-intent LEVEL envelope and the CONFIDENT permitted envelope were both `#6600FF` — the user
 * INVENTED one of those solids and the ordinance dictated the other, and they were painted the same.
 * Under C58 §1.2 the hue IS the confidence badge, so an intent volume wearing it claims a
 * confidence it was never given. That is a honesty defect, not a cosmetic one, and it is the kind
 * that comes back the moment somebody "tidies" a palette — so it is pinned here against EVERY hue
 * in the two families that carry meaning, by importing them rather than re-typing them.
 */

import { describe, it, expect } from 'vitest';

import {
    TO_BE_BUILT_ROSE,
    TO_BE_BUILT_ROSE_CSS,
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

describe('⛔ the to-be-built envelope may never wear a meaning that is already taken', () => {
    it('is not any of the three C58 §1.2 CONFIDENCE hues', () => {
        expect(TO_BE_BUILT_ROSE).not.toBe(CONFIDENT_VIOLET_HEX);
        expect(TO_BE_BUILT_ROSE).not.toBe(PROVISIONAL_GREY_HEX);
        expect(TO_BE_BUILT_ROSE).not.toBe(SUGGESTED_AMBER_HEX);
    });

    it('is not the CONTEXT-DERIVED STUDY teal either — an intent is not a study', () => {
        expect(TO_BE_BUILT_ROSE).not.toBe(STUDY_MASSING_TEAL);
    });

    it('the CSS string is derived from the number, never hand-copied', () => {
        expect(TO_BE_BUILT_ROSE_CSS).toBe(`#${TO_BE_BUILT_ROSE.toString(16).padStart(6, '0')}`);
        expect(TO_BE_BUILT_ROSE_CSS).toMatch(/^#[0-9a-f]{6}$/);
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
});

describe('§25.2 — the legend names the three envelopes and their honesty', () => {
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

    it('the to-be-built row carries the rose AND the orientative word', () => {
        const row = envelopeLegendEntry('to-be-built')!;
        expect(row.swatchCss).toBe(TO_BE_BUILT_ROSE_CSS);
        expect(row.meaning).toBe(TO_BE_BUILT_ORIENTATIVE_TEXT);
        expect(row.meaning).toContain('Orientative');
        expect(row.meaning).toContain('not a permit');
    });

    it('an unknown kind returns null, never a fabricated row', () => {
        expect(envelopeLegendEntry('massing')).toBeNull();
        expect(envelopeLegendEntry('')).toBeNull();
    });
});
