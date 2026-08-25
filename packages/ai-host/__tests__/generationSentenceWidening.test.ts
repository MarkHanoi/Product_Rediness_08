/**
 * §CHAT-ATTACH-BOUNDARY-ADJ (L-10900) · §CHAT-ATTACH-STOREYS-ALT (L-10902) ·
 * §CHAT-ATTACH-ROOF-FORM-DEAD (L-10903) — three MEASURED misses in the sentence
 * the founder actually types, and the guard that keeps the fixes from widening
 * into someone else's sentence.
 *
 * ── HOW THESE WERE FOUND, WHICH IS THE POINT ────────────────────────────────
 * Not by reading the regexes — by RUNNING them over the phrasings in the founder's
 * own brief plus the obvious neighbours of each. Two of the three misses are his
 * sentence minus one word ("on the current boundary" without "line"), and the
 * third is a feature that had never once executed.
 *
 * ⚠ EACH `describe` HAS A NEGATIVE HALF, and the negative half is the expensive
 * one. A grammar widening that also claims sentences belonging to another
 * capability does not read as a bug — it reads as the OTHER capability being
 * broken, somewhere else, later.
 */

import { describe, it, expect } from 'vitest';

import { parseGenerateBuildingIntent } from '../src/intents/ZeroTokenResolver.js';

/** The resolver lower-cases before its matchers; mirror that here. */
function parse(sentence: string) {
    return parseGenerateBuildingIntent(sentence.toLowerCase());
}

describe('§CHAT-ATTACH-BOUNDARY-ADJ (L-10900) — the founder\'s sentence, one word short', () => {
    it('⭐ "on the current boundary line" — the sentence in the brief, verbatim', () => {
        const r = parse(
            'create a residential building with the facade as per the image - 5 storey building on the current boundary line',
        );
        expect(r).not.toBeNull();
        expect(r!.typology).toBe('residential-building');
        expect(r!.floors).toBe(5);
        expect(r!.onBoundaryLine).toBe(true);
    });

    it('⭐ "on the current boundary" — WITHOUT "line". This was the MISS.', () => {
        // Before L-10900 the determiner slot was the closed list the|this|that|my,
        // so "current" was unknown and this silently built on the site PARCEL.
        const r = parse('create a residential building as per the image on the current boundary');
        expect(r).not.toBeNull();
        expect(r!.onBoundaryLine).toBe(true);
    });

    const ALSO_HITS = [
        'create a residential building on the active boundary',
        'create a residential building within the current boundary',
        'create a residential building on the existing boundary',
        'create a residential building on the plot boundary',
        'create a residential building on the site boundary',
        'create a residential building using the boundary line',
        'create a residential building at the drawn boundary',
    ];
    for (const s of ALSO_HITS) {
        it(`reads the boundary source out of: ${s}`, () => {
            expect(parse(s)?.onBoundaryLine).toBe(true);
        });
    }
});

describe('§CHAT-ATTACH-BOUNDARY-ADJ — ⭐ the widening does NOT bridge across clauses', () => {
    // The adjective slot is up-to-three WORDS. These pin the ceiling: an
    // unrelated later clause must not be swept into the boundary reading, or an
    // ordinary parcel generation silently moves onto a line.
    it('does not claim "on the site and add the boundary" (four words apart)', () => {
        const r = parse('create a house on the site and add the boundary');
        expect(r).not.toBeNull();
        expect(r!.onBoundaryLine).toBeUndefined();
    });

    it('does not claim a plain parcel generation', () => {
        const r = parse('generate a 3-storey residential building');
        expect(r!.onBoundaryLine).toBeUndefined();
    });

    it('cannot cross a comma — punctuation is the natural barrier', () => {
        // `[a-z]+\s+` cannot match "site," so the preposition cannot reach the noun.
        const r = parse('create a residential building on the site, then show me the boundary');
        expect(r!.onBoundaryLine).toBeUndefined();
    });
});

describe('§CHAT-ATTACH-STOREYS-ALT (L-10902) — storey counts written the other way round', () => {
    it('reads a noun-first spec line: "storeys: 5"', () => {
        expect(parse('create a residential building within the current boundary, storeys: 5')?.floors).toBe(5);
    });

    it('reads "levels = 6"', () => {
        expect(parse('create a residential building, levels = 6')?.floors).toBe(6);
    });

    it('⭐ reads "G+4" as FIVE — ground plus four upper floors, a TOTAL', () => {
        // The payload's `floors` is the TOTAL including ground. Reading G+4 as 4
        // would build one storey short and look entirely plausible doing it.
        expect(parse('create a residential building on the plot boundary, g+4')?.floors).toBe(5);
    });

    it('reads "ground plus 4" as the same FIVE', () => {
        expect(parse('create a residential building on the existing boundary, ground plus 4')?.floors).toBe(5);
    });

    it('reads "ground floor + 2" as three', () => {
        expect(parse('create a residential building, ground floor + 2')?.floors).toBe(3);
    });

    it('⛔ the primary pattern still WINS — the fallbacks only run on a miss', () => {
        // "5 storey" is read by GEN_FLOORS_RE; the G+N fallback must not also fire
        // and overwrite it. Both shapes present, primary must win.
        expect(parse('create a residential building, 5 storey, g+9')?.floors).toBe(5);
    });

    it('still returns null when the sentence names no count at all', () => {
        const r = parse('create a residential building on the current boundary line');
        expect(r!.floors).toBeNull();
    });
});

describe('§CHAT-ATTACH-ROOF-FORM-DEAD (L-10903) — the roof matcher had never executed', () => {
    it('⭐ "create a 3-storey house with a gable roof" now RESOLVES — it was a MISS', () => {
        // EVERY string GEN_ROOF_RE can match contains the word "roof", and the
        // element-noun guard rejected `roof` before the roof matcher ran. So
        // `roofKind` could not be set by any utterance in the language.
        const r = parse('create a 3-storey house with a gable roof');
        expect(r).not.toBeNull();
        expect(r!.typology).toBe('house');
        expect(r!.floors).toBe(3);
        expect(r!.roofKind).toBe('gable');
    });

    it('reads a flat roof', () => {
        expect(parse('generate a 2-storey house with a flat roof')?.roofKind).toBe('flat');
    });

    it('reads a hipped roof', () => {
        expect(parse('create a house with a hipped roof')?.roofKind).toBe('hip');
    });

    it('⛔ "make the house roof white" is STILL not a generation ask', () => {
        // The mask removes only the ROOF-FORM phrase. A bare `roof` still trips
        // the element guard, so the colour capability keeps its sentence.
        expect(parse('make the house roof white')).toBeNull();
    });

    it('⛔ "create a wall under the flat roof" is STILL not a generation ask', () => {
        // "flat roof" is masked, but `wall` remains and must still reject.
        expect(parse('create a wall under the flat roof')).toBeNull();
    });

    it('⛔ a window ask is still not a generation ask', () => {
        expect(parse('create a window in the north wall')).toBeNull();
    });
});
