// §GEN-FACADE-INTENT (L-10773) — façade language for `generate-building`.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER SHOWED A PHOTOGRAPH, NOT A FORM
// ═══════════════════════════════════════════════════════════════════════════════
//
// A five-storey urban apartment block: an ARCADED GROUND FLOOR with shopfronts,
// rounded corners, deep continuous BALCONIES, green GLAZED TILE, oxblood timber
// shutters, a full-height glass-block stair core. He then asked to describe it in
// words to the chat.
//
// ⛔ THIS FILE IS NOT AN ENUM OF FIVE FAÇADE STYLES, AND MUST NEVER BECOME ONE.
// The founder's standing direction on exactly this shape is OPEN LANGUAGE, never a
// narrowed vocabulary: safety comes from rule gates that refuse with BOTH numbers,
// not from restricting what he may type. So nothing here rejects a sentence for
// containing words it does not know. Unrecognised description is simply not acted
// on — and, crucially, IT IS REPORTED AS NOT ACTED ON.
//
// ⭐ PHOTO → FAÇADE EXTRACTION IS OUT OF SCOPE, deliberately and permanently for
// this slice. Reading a façade off a photograph is GenRecon, which is explicitly
// NOT V1. Everything here is driven by WORDS THE USER TYPES.
//
// ─── THE TWO TABLES, AND WHY THE SECOND ONE IS THE IMPORTANT ONE ──────────────
//
// `FACADE_MAPPED` — description this build can actually honour, because the
// request field ALREADY EXISTS. Every one of these four is a field
// `residentialBriefMapper.ts` has carried since 2026-06-24 (§RESI-PREVIEW-OPTIONS)
// and that the modal has been setting all along. ⭐ THE CHAT PAYLOAD DROPPED ALL
// FOUR ON THE FLOOR: the founder could pick "commercial shopfront ground floor" in
// the wizard, but saying it to the chat did nothing and said nothing. This is
// therefore threading four live fields, NOT inventing a façade language.
//
// `FACADE_UNAVAILABLE` — description this build RECOGNISES as façade intent and
// CANNOT honour, each with a stated reason. This is the half that matters, and it
// copies a precedent rather than inventing one: `CHAT_UNAVAILABLE` in
// `ChatCapabilityRegistry.ts` and the UNAVAILABLE list in
// `ElementTypeAuthoringRegistry.ts` both exist because a capability that is silently
// absent is worse than one that is loudly absent.
//
// ⚠ THE DEFECT THIS PREVENTS IS SPECIFIC. Without the second table, "create a
// 5-storey residential building with an arcaded ground floor, deep balconies,
// rounded corners and green glazed tile" would build a plain block with balconies
// and a shopfront, say "Built the residential building", and NEVER MENTION that
// rounded corners and glazed tile were discarded. The user would reasonably
// conclude the generator had tried and failed at them. Silently ignoring half a
// sentence is the defect family this whole session has been closing.
//
// PURE: no I/O, no DOM, no THREE, and it imports NOTHING from the capability
// registry — the one-way discipline `DeleteFamilies` / `DimensionFamilies` follow,
// so a cycle can never form (the §SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD white-screen
// hazard).

import { resolveColorRef } from './colorRef.js';

/** The façade options a generation can actually carry today. Every field maps 1:1
 *  onto a `ResidentialBuildingRequest` field that already exists. */
export interface FacadeIntent {
    /** §RESI-GROUND-COMMERCIAL-CURTAIN — the arcaded / shopfront ground floor. */
    readonly groundCommercialCurtain?: boolean;
    /** §RESI-BALCONIES — projecting balconies. Default ON, so `false` is the
     *  meaningful value here: it records that the user asked to REMOVE them. */
    readonly balconies?: boolean;
    /** §RESI-FACADE-COLOUR — `#rrggbb`, resolved through the SAME colour table the
     *  wall/Rhino recolour capabilities use. One colour vocabulary, not two. */
    readonly facadeColor?: string;
    /** §RESI-ROOF-GARDEN — the roof amenity deck. */
    readonly roofGarden?: boolean;
}

/** What the sentence asked for, split into what will happen and what will not. */
export interface FacadeIntentParse {
    readonly intent: FacadeIntent;
    /** Human phrases that WILL be honoured — echoed so the Confirm card can show
     *  the user their own description reflected back before anything is built. */
    readonly applied: readonly string[];
    /** Recognised façade description this generator cannot produce, each already
     *  paired with its reason. NEVER silently dropped. */
    readonly unavailable: readonly string[];
}

/**
 * Recognised façade description this generator CANNOT produce.
 *
 * ⚠ EVERY ENTRY IS A REAL LIMIT, NOT A PLACEHOLDER. The reasons name what the
 * generator does instead, so the user learns the shape of the tool rather than
 * being told "no". Adding a row here is how a future lane records a gap; adding a
 * row to `FACADE_MAPPED` is how it closes one.
 *
 * The first four are, verbatim, what is visible in the founder's photograph beyond
 * the arcade and the balconies — which is exactly why they are listed. A table of
 * unavailable features that does not cover the case in front of you is decoration.
 */
export const FACADE_UNAVAILABLE: ReadonlyArray<{ readonly test: RegExp; readonly say: string }> = [
    {
        test: /\brounded corners?\b|\bcurved corners?\b|\bradiused corners?\b/,
        say: 'rounded corners — the generator builds straight-run shell walls, so corners come out square',
    },
    {
        test: /\bglazed tile\b|\btiled facade\b|\btiled fa[çc]ade\b|\bceramic tile\b|\bazulejo\b/,
        say: 'a glazed-tile finish — I can set a façade COLOUR, but not a tile material or pattern',
    },
    {
        test: /\bshutters?\b|\blouvres?\b|\blouvers?\b/,
        say: 'timber shutters — shutters are not an element the generator places',
    },
    {
        test: /\bglass[\s-]?block\b|\bglass brick\b/,
        say: 'a glass-block stair core — the core is built solid, with one door per level',
    },
    {
        test: /\bcornices?\b|\bmouldings?\b|\bmoldings?\b|\bstring courses?\b/,
        say: 'cornices or mouldings — the generator emits no decorative profiles',
    },
    {
        test: /\barch(?:es|ed)\b|\barcade[sd]?\b(?=.*\barch)/,
        say: 'arched openings — the arcade is built as a square-headed shopfront, not as arches',
    },
    {
        test: /\bbrick(?:work)?\b|\bstone(?:work)?\b|\brender\b|\bstucco\b|\btimber clad\w*\b/,
        say: 'a specific façade material — I can set a COLOUR, but the material itself is not a parameter yet',
    },
    {
        test: /\bsetback\b|\bstepped\b|\bmansard\b|\bpitched roof\b/,
        say: 'a stepped or pitched profile — a residential building is generated with a flat roof',
    },
];

/** Balcony REMOVAL must be tested before balcony presence — "without balconies"
 *  contains "balconies". Negation-first ordering is the whole reason these are
 *  separate constants rather than one alternation. */
const BALCONY_NEGATED_RE =
    /\b(?:no|without|remove|omit|skip|drop|lose|minus)\s+(?:the\s+)?(?:deep\s+|continuous\s+|projecting\s+)?balcon(?:y|ies)\b/;
const BALCONY_RE = /\bbalcon(?:y|ies)\b|\bterraces?\b/;

/** The arcaded / shopfront ground floor. Generous on purpose — this is the single
 *  most legible thing in the founder's photograph and he may name it many ways. */
const GROUND_COMMERCIAL_RE =
    /\barcade[sd]?\b|\barcaded\b|\bshop\s?fronts?\b|\bshopfronts?\b|\bshops?\b|\bretail\b|\bcommercial ground\b|\bground[\s-]floor (?:shops?|retail|commercial)\b|\bcolonnade[sd]?\b/;

const ROOF_GARDEN_RE = /\broof garden\b|\broof terrace\b|\broof deck\b|\bgreen roof\b|\broof amenity\b/;

/**
 * Façade colour. Reuses `resolveColorRef` — the SAME table `set-wall-color` and
 * `set-rhino-material` resolve against — so "oxblood" or "sage green" means the
 * same thing everywhere in the product. A second colour vocabulary for façades
 * would be the two-sources-of-truth defect C84 EI-8 names.
 *
 * ⭐ ENGLISH PUTS THE COLOUR ON EITHER SIDE OF THE NOUN and both must work:
 * "a GREEN FAÇADE" and "a FAÇADE IN GREEN" are the same ask. A single regex that
 * assumed one order silently dropped the other — caught by the acceptance test on
 * this feature's first run, which is why the extraction is a function that tries
 * BOTH neighbourhoods rather than one clever pattern.
 */
/**
 * ⛔ ONLY GENUINELY FAÇADE-SPECIFIC NOUNS ANCHOR A COLOUR, and the exclusions are
 * the load-bearing part. `building`, `block` and `walls` were in this set for one
 * iteration and broke it outright: they appear in EVERY generation sentence, so
 * "create a residential BUILDING with a green façade" anchored on "a residential
 * building" — the earliest match in the string — and never reached "green façade"
 * at all. An anchor that matches everywhere identifies nothing.
 */
const FACADE_NOUN = String.raw`(?:fa[cç]ade|exterior|render|cladding|finish)`;
/** colour AFTER the noun: "façade in sage green", "exterior colour olive". */
const COLOR_AFTER_RE = new RegExp(
    String.raw`\b${FACADE_NOUN}\s+(?:colou?r\s+)?(?:in\s+|is\s+|painted\s+)?([a-z]+(?:\s+[a-z]+)?)\b`,
    'g',
);
/** colour BEFORE the noun: "a green façade", "an oxblood render". */
const COLOR_BEFORE_RE = new RegExp(String.raw`\b([a-z]+(?:\s+[a-z]+)?)\s+${FACADE_NOUN}\b`, 'g');
/** an explicit hex, which needs no table at all. */
const COLOR_HEX_RE = /(#[0-9a-f]{6})\b/;

/** Articles and fillers that ride along in a two-word capture and are never part
 *  of a colour name. Stripped so "a green" can still resolve as "green". */
const COLOR_FILLER = /^(?:a|an|the|its|their|in|of|with|and|to|is|be|painted|coloured|colored)\s+/;

/**
 * Resolve a façade colour from either side of the noun. Tries the longest capture
 * first ("sage green" beats "green"), then the trimmed remainder.
 *
 * ⚠ Returns null freely and that is CORRECT. The captures here are deliberately
 * loose, so most of them are ordinary words ("residential building", "the block").
 * Treating every miss as a failed colour ask would manufacture complaints about
 * sentences that never mentioned colour — see the note at the call site.
 */
function resolveFacadeColor(lower: string): { hex: string; label: string } | null {
    const hex = COLOR_HEX_RE.exec(lower)?.[1];
    if (hex !== undefined) return { hex, label: hex };

    // ⚠ EVERY match, not just the first. A sentence can mention a façade noun more
    // than once, and the earliest occurrence is not necessarily the one carrying the
    // colour. Taking `exec` once was the other half of the bug the noun set above
    // records.
    const candidates: string[] = [];
    for (const re of [COLOR_AFTER_RE, COLOR_BEFORE_RE]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(lower)) !== null) {
            const raw = m[1]?.trim();
            if (raw === undefined || raw.length === 0) continue;
            candidates.push(raw);
            const stripped = raw.replace(COLOR_FILLER, '').trim();
            if (stripped.length > 0 && stripped !== raw) candidates.push(stripped);
            // "deep balconies and a green" → the last word is the real candidate.
            const lastWord = stripped.split(/\s+/).pop();
            if (lastWord !== undefined && lastWord.length > 0) candidates.push(lastWord);
        }
    }
    for (const c of candidates) {
        const hit = resolveColorRef(c);
        if (hit !== null) return { hex: hit.hex, label: hit.label };
    }
    return null;
}

/**
 * Parse façade description out of a building-generation sentence.
 *
 * Returns BOTH halves always: what will be honoured and what will not. A caller
 * that renders only the first half reintroduces the silent-drop defect, which is
 * why `unavailable` is not optional.
 */
export function parseFacadeIntent(text: string): FacadeIntentParse {
    const lower = text.toLowerCase();
    const intent: {
        groundCommercialCurtain?: boolean;
        balconies?: boolean;
        facadeColor?: string;
        roofGarden?: boolean;
    } = {};
    const applied: string[] = [];

    if (GROUND_COMMERCIAL_RE.test(lower)) {
        intent.groundCommercialCurtain = true;
        applied.push('a commercial shopfront ground floor');
    }

    // Negation first — see the note on BALCONY_NEGATED_RE.
    if (BALCONY_NEGATED_RE.test(lower)) {
        intent.balconies = false;
        applied.push('no balconies');
    } else if (BALCONY_RE.test(lower)) {
        // Balconies default ON, so an explicit ask is echoed but changes nothing.
        // Saying so is better than staying silent: the user asked for something and
        // deserves to know it will be there.
        intent.balconies = true;
        applied.push('balconies (already the default)');
    }

    if (ROOF_GARDEN_RE.test(lower)) {
        intent.roofGarden = true;
        applied.push('a roof garden');
    }

    // ⚠ An UNRESOLVABLE colour word is deliberately NOT an error and NOT an
    // unavailable row. The captures are loose enough to catch ordinary nouns
    // ("residential building", "the block"), so treating every miss as a façade
    // colour the user asked for would manufacture false complaints about sentences
    // that never mentioned colour. A word the table does not know is not a colour ask.
    const colour = resolveFacadeColor(lower);
    if (colour !== null) {
        intent.facadeColor = colour.hex;
        applied.push(`a ${colour.label} façade`);
    }

    const unavailable: string[] = [];
    for (const row of FACADE_UNAVAILABLE) {
        if (row.test.test(lower)) unavailable.push(row.say);
    }

    return { intent, applied, unavailable };
}

/**
 * The sentence shown BEFORE building (on the Confirm card) naming what will not be
 * honoured. Empty string when everything asked for can be done.
 *
 * ⭐ IT IS SHOWN BEFORE, NOT AFTER, AND THAT IS THE POINT. Telling someone after
 * five storeys have been generated that half their description was ignored is a
 * report; telling them before they confirm is a choice.
 */
export function facadeUnavailableSentence(unavailable: readonly string[]): string {
    if (unavailable.length === 0) return '';
    return (
        `I can't do ${unavailable.length === 1 ? 'one part' : `${unavailable.length} parts`} of that ` +
        `and I'll build the rest: ${unavailable.join('; ')}.`
    );
}
