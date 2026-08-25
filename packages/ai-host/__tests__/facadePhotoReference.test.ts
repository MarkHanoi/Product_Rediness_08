/**
 * §CHAT-PHOTO-REFERENCE (L-10901) — the image clause, measured.
 *
 * ⚠ WHAT MAKES THESE ASSERTIONS WORTH ANYTHING. Every positive case below is a
 * sentence a person would actually type at this chat, and the NEGATIVE block is
 * the half that carries the risk: this rule fires a QUESTION, and a rule that
 * fires on ordinary generation sentences would put a question in front of every
 * build. So the negatives are not padding — they are the ceiling on the cost of
 * being generous.
 *
 * C108 §6.2: "no error thrown" is not an assertion. Nothing here asserts a
 * function returned.
 */

import { describe, it, expect } from 'vitest';

import { missingImageRefusal, readImageReference } from '../src/intents/FacadePhotoReference.js';

describe('§CHAT-PHOTO-REFERENCE · the founder\'s own sentence', () => {
    it('reads "as per the image" out of the sentence he wrote in the brief', () => {
        const r = readImageReference(
            'create a residential building with the facade as per the image - 5 storey building on the current boundary line',
        );
        expect(r.referenced).toBe(true);
        expect(r.negated).toBe(false);
        // ⭐ HIS WORDS, not a paraphrase — the refusal quotes this back.
        expect(r.phrase).toBe('as per the image');
    });
});

describe('§CHAT-PHOTO-REFERENCE · phrasings that MUST land (open language)', () => {
    // Each row is <sentence, the clause that must be echoed>. The echoed phrase
    // is asserted, not merely `referenced` — a matcher that fires on the wrong
    // three words would quote the wrong three words back at the user.
    const CASES: ReadonlyArray<readonly [string, string]> = [
        ['create a residential building from the photo, five storeys', 'from the photo'],
        ['build a residential block like the picture with 5 floors', 'like the picture'],
        ['generate a residential tower as in the attached photo', 'as in the attached photo'],
        ['make a residential building matching the uploaded image', 'matching the uploaded image'],
        ['create a residential building based on this photograph', 'based on this photograph'],
        ['residential building, 5 storeys, as per image', 'as per image'],
        ['create a building copying the attached jpeg', 'copying the attached jpeg'],
        ['create a residential building, attached photo, 5 storeys', 'attached photo'],
        // ⭐ The echoed clause is "use this image", not the bare deictic: the
        // REFERRING alternative wins because it starts earlier, and the fuller
        // clause is the better thing to quote back at the user.
        ['use this image to create a 5 storey residential building', 'use this image'],
        ['create a residential building similar to the reference image', 'similar to the reference image'],
        ['create a building according to the screenshot', 'according to the screenshot'],
        ['create a residential building with the facade in the photograph', 'in the photograph'],
        ['replicate the render as a 5 storey residential building', 'replicate the render'],
        ['create a residential building following the attached png', 'following the attached png'],
    ];

    for (const [sentence, phrase] of CASES) {
        it(`reads "${phrase}" out of: ${sentence}`, () => {
            const r = readImageReference(sentence);
            expect(r.referenced).toBe(true);
            expect(r.phrase).toBe(phrase);
        });
    }

    it('is case-insensitive — he types in sentence case and in caps', () => {
        expect(readImageReference('Create a residential building AS PER THE IMAGE').referenced).toBe(true);
    });
});

describe('§CHAT-PHOTO-REFERENCE · ⭐ the sentences that must NOT fire', () => {
    // ⚠ THE EXPENSIVE HALF. A false positive here puts "attach an image" in front
    // of an ordinary build. These are the ordinary builds.
    const QUIET = [
        'create a 5 storey residential building on the current boundary line',
        'generate a 3-storey house with a gable roof',
        'create an office building with 5 floors',
        'make the house walls white',
        'create a residential building with balconies and a shopfront ground floor',
        'create a 3 bedroom apartment',
        'what is the area of this room',
        'generate a residential building with a green facade',
    ];
    for (const s of QUIET) {
        it(`stays quiet on: ${s}`, () => {
            const r = readImageReference(s);
            expect(r.referenced).toBe(false);
            expect(r.phrase).toBeNull();
        });
    }

    it('does not read "picture window" as a reference to an attachment', () => {
        // The noun set contains `picture` deliberately; the REFERRING-WORD guard
        // is what keeps this quiet. If that guard is ever removed this fails.
        expect(readImageReference('create a picture window in the north wall').referenced).toBe(false);
    });
});

describe('§CHAT-PHOTO-REFERENCE · the escape hatch is a NEGATION, not a rephrase', () => {
    const NEGATED = [
        'create a 5 storey residential building, ignore the image',
        'create a residential building without the photo',
        'build it from my words, not from the picture',
        'create a residential building, disregard the attached image',
    ];
    for (const s of NEGATED) {
        it(`treats as EXCLUSION, so nothing is asked for: ${s}`, () => {
            const r = readImageReference(s);
            expect(r.negated).toBe(true);
            // ⛔ Both halves matter: negated AND not referenced. A reading that
            // set both would still make the caller ask for an attachment.
            expect(r.referenced).toBe(false);
        });
    }
});

describe('§CHAT-PHOTO-REFERENCE · C74 — the refusal names the way forward', () => {
    it('quotes the user\'s own clause back', () => {
        const msg = missingImageRefusal('as per the image');
        expect(msg).toContain('"as per the image"');
    });

    it('names ALL THREE ways to attach, because only one of them is discoverable', () => {
        const msg = missingImageRefusal('from the photo');
        expect(msg).toContain('📎');
        expect(msg.toLowerCase()).toContain('drag');
        expect(msg).toContain('Ctrl+V');
    });

    it('states that a phone photo needs no conversion — the JPEG question, answered before it is asked', () => {
        const msg = missingImageRefusal(null);
        expect(msg).toContain('JPEG');
        expect(msg).toContain('HEIC');
        expect(msg.toLowerCase()).toContain('no conversion');
    });

    it('offers the escape hatch in the user\'s own vocabulary', () => {
        expect(missingImageRefusal(null)).toContain('ignore the image');
    });

    it('does not say a building was created', () => {
        // The whole point: this branch BUILDS NOTHING and must not read like it did.
        const msg = missingImageRefusal('as per the image').toLowerCase();
        expect(msg).not.toContain('built the');
        expect(msg).not.toContain('created the');
    });
});
