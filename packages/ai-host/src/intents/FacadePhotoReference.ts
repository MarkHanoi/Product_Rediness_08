// §CHAT-PHOTO-REFERENCE (L-10901) — "did this sentence point at an image?"
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S SENTENCE, AND THE ONE CLAUSE THE RESOLVER COULD NOT SEE
// ═══════════════════════════════════════════════════════════════════════════════
//
//   "create a residential building with the facade as per the image —
//    5 storey building … on the current boundary line"
//
// `parseGenerateBuildingIntent` reads every clause in that sentence except one:
// "as per the image". It is the clause that decides whether a PHOTOGRAPH is part
// of the request — and until this file existed, a sentence that named an image
// with NO image attached built a plain block and never mentioned the omission.
//
// ⭐ THAT IS THE DEFECT THIS FILE CLOSES, AND IT IS THE SILENT-HALF-SENTENCE
// FAMILY AGAIN (the same one `FacadeIntent.ts` closes for unbuildable façade
// words). A user who says "as per the image" and gets a building has been told,
// by the ABSENCE of any remark, that the image was used. It was not.
//
// ── WHY THIS IS A LANGUAGE RULE IN L2 AND NOT A CHECK IN THE CHAT ────────────
// Two facts must meet before anything can be said:
//
//   A · DID THE SENTENCE REFER TO AN IMAGE?  — a language question. Pure. Here.
//   B · IS AN IMAGE ACTUALLY ATTACHED?       — UI state. Only the panel knows.
//
// B lives in the browser and can never move down here; A is a measurement rule and
// a client may not own one (the same split `FacadePhotoBrief.ts` states in its own
// header). So this file answers A and owns the refusal COPY for the A-and-not-B
// case, and the chat bridge — which holds both halves — composes them.
//
// ── ⛔ OPEN LANGUAGE, NOT AN ENUM (founder ruling, standing) ─────────────────
// Nothing here is a fixed phrase list. The shape recognised is
//
//     <referring word> · <optional determiners> · <image noun>
//
// so "as per the image", "from the photo", "like the picture", "based on the
// attached photograph", "matching this render" and phrasings nobody has typed yet
// all land, while a bare noun in an unrelated clause does not. A sentence this
// misses is NOT rejected — the caller simply has no image clause to honour, which
// is exactly today's behaviour and no worse.
//
// FALSE-POSITIVE / FALSE-NEGATIVE ASYMMETRY, stated because it drove the design:
// a false POSITIVE costs one question ("attach the photo, or say 'ignore the
// image'"). A false NEGATIVE silently drops half the founder's sentence. The
// expensive direction is the silent one, so this errs generous — the same
// reasoning `GEN_ON_BOUNDARY_LINE_RE` records for itself.
//
// LAYERING — L2, pure: no DOM, no THREE, no I/O, and it imports NOTHING from the
// capability registry (the one-way discipline that keeps a module-load cycle from
// forming — [[scc-no-barrel-access-at-module-load]]).

/**
 * The nouns a person uses for "the thing I attached".
 *
 * ⚠ `picture` and `render` are here despite "picture window" and "render" being
 * real architectural words: the pattern below requires a REFERRING WORD in front
 * of the noun, so "create a picture window" cannot match while "like the picture"
 * can. That guard is why the noun set can afford to be generous.
 */
const IMAGE_NOUN =
    '(?:images?|photos?|photographs?|pictures?|pics?|snapshots?|screenshots?|renders?|renderings?|attachments?|jpe?g|png|heic|webp)';

/**
 * Determiners and adjectives that may sit between the referring word and the
 * noun. Zero or more, so "as per image" (no article) matches too.
 */
const DETERMINER =
    '(?:(?:the|this|that|these|those|my|a|an|attached|uploaded|given|provided|supplied|reference|referenced|above|following|shown|same|first|second)\\s+){0,3}';

/**
 * A referring word or phrase — what turns a noun into a POINTER at the
 * attachment. Longest alternatives first inside each group so the echoed phrase
 * is the whole clause the user typed rather than a prefix of it.
 */
const REFERRING =
    '(?:as\\s+(?:per|in|shown\\s+in|seen\\s+in|on)|per|from|like|matching|matched|match|based\\s+on|copied\\s+from|copying|copy|replicating|replicate|following|according\\s+to|same\\s+as|similar\\s+to|resembling|in|of|using|use|with)';

/**
 * ⭐ THE PATTERN. `<referring> <determiner…> <noun>`, plus two shapes that carry
 * their own referring force and need no preposition at all:
 *
 *   • an ATTACHMENT ADJECTIVE — "the attached photo", "the uploaded image".
 *     "attached" IS the reference; requiring a preposition would miss
 *     "create a building, attached photo, 5 storeys".
 *   • a DEICTIC — "this image", "that photograph". Pointing is referring.
 */
const IMAGE_REFERENCE_RE = new RegExp(
    '\\b(?:' +
        `${REFERRING}\\s+${DETERMINER}${IMAGE_NOUN}` +
        '|' +
        `(?:the\\s+|this\\s+|that\\s+|my\\s+)?(?:attached|uploaded|enclosed)\\s+${DETERMINER}${IMAGE_NOUN}` +
        '|' +
        `(?:this|that)\\s+${IMAGE_NOUN}` +
        ')\\b',
    'i',
);

/**
 * ⛔ THE NEGATION GUARD. "without the image", "ignore the photo", "not from the
 * picture" all NAME an image in order to EXCLUDE it, and reading them as a
 * request for one would be the opposite of what was asked.
 *
 * It is also the founder's escape hatch: when this rule fires on a sentence he
 * did not mean as an image reference, "ignore the image" turns it off IN WORDS
 * rather than forcing him to rephrase around a matcher
 * ([[refusing-half-needs-its-escape-hatch]]).
 */
// ⚠ THE OPTIONAL `REFERRING` SLOT IS NOT TIDINESS — it was a MEASURED miss.
// "build it from my words, NOT FROM THE PICTURE" negates, and without that slot
// the negator had to sit directly against the determiner, so this sentence read
// as a REQUEST for the picture it was explicitly excluding. The referring word is
// exactly what sits between "not" and the noun in the way people actually write.
const IMAGE_NEGATION_RE = new RegExp(
    `\\b(?:without|no|not|ignore|ignoring|skip|skipping|forget|disregard|drop)\\s+(?:${REFERRING}\\s+)?(?:any\\s+)?${DETERMINER}${IMAGE_NOUN}\\b`,
    'i',
);

/** What the sentence said about an image, and in whose words. */
export interface ImageReferenceReading {
    /** True when the sentence points at an attachment. */
    readonly referenced: boolean;
    /**
     * The user's OWN words that did the pointing — e.g. `as per the image`.
     * Quoted back in the refusal so he can see WHICH clause was read that way and
     * correct it, rather than being told an abstraction about his own sentence.
     * `null` when nothing matched.
     */
    readonly phrase: string | null;
    /**
     * True when the sentence named an image in order to EXCLUDE it. `referenced`
     * is then false, and the caller must NOT ask for an attachment.
     */
    readonly negated: boolean;
}

const NOT_REFERENCED: ImageReferenceReading = { referenced: false, phrase: null, negated: false };

/**
 * Does this sentence point at an attached image?
 *
 * PURE and case-insensitive. Takes the sentence as the user typed it — the
 * resolver lower-cases before its own matchers, and either shape works here.
 */
export function readImageReference(text: string): ImageReferenceReading {
    if (typeof text !== 'string' || text.length === 0) return NOT_REFERENCED;
    if (IMAGE_NEGATION_RE.test(text)) {
        return { referenced: false, phrase: null, negated: true };
    }
    const m = IMAGE_REFERENCE_RE.exec(text);
    if (m === null) return NOT_REFERENCED;
    return { referenced: true, phrase: m[0].trim(), negated: false };
}

/**
 * C74 — the refusal for A-AND-NOT-B: the sentence asked for an image and none is
 * attached.
 *
 * ⭐ IT ASKS RATHER THAN BUILDS. Generating a plain building here would answer a
 * question the user did not ask and would read, from the transcript, as success.
 * Every branch names the exact way forward, and one of them is "build it anyway
 * from your words", so the user is never trapped by his own phrasing.
 *
 * @param phrase the user's own words, from `readImageReference`.
 */
export function missingImageRefusal(phrase: string | null): string {
    const quoted = phrase === null ? 'an image' : `"${phrase}"`;
    return (
        `You asked for the façade ${quoted}, and no image is attached to this message — so I have ` +
        'nothing to read a façade off, and I will not build a plain block and let it look like I used ' +
        'a photo. Attach one with the 📎 button beside the input, drag it onto this panel, or paste it ' +
        'with Ctrl+V, then send the same sentence again. JPEG, PNG, WebP, AVIF and HEIC are all read ' +
        'directly — a phone photo needs no conversion. If you did not mean a photograph, send the same ' +
        'sentence with "ignore the image" and I will build from your words alone.'
    );
}
