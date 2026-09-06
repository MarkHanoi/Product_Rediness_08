// §PL-CHAT (lane PL-CHAT-AND-REMAINDER, 2026-09-06) — the PURE resolver behind STR §25.4's chat
// surface on the Parcel Law panel.
//
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.4 · §25.2 · §25.3 · §25.7 · ADR-0313 (the zero-token
// ladder this sits beside) · ADR-0314 (RAC capability parity) · C57 §1.5/§1.9 · C58 §1.4 · P8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S SENTENCE THIS FILE ANSWERS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"WE NEED A CHAT BOT ON THE PARCEL LAW PANEL – SO USER CAN CHAT VIA RAC OR DEFINE VIA DATA
//  MANUALLY INPUT."*
//
// The binding half of that sentence is the word OR: the two input paths are alternatives to each
// other, so **a value typed into a field and the same value asked for in natural language must
// produce the same envelope**. This module is the LANGUAGE half of that equality and nothing else.
// It turns a sentence into the value a FIELD would have received — a storey count, a ground-floor
// area in m², a cost per m², a shape family id — and hands it back as data.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS RESOLVER DOES NOT DISPATCH, AND WHY THE INTENT CARRIES *TEXT*
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The obvious build is: parse the sentence, then call `buildEnvelopeAuthoringPlan` +
// `bus.executeCommand` from the chat. That would be a SECOND dispatcher for a gesture that
// already has one, and a rival beside a working thing is this repo's most expensive recurring
// failure. So every intent below carries the STRING THE MANUAL FIELD TAKES (`storeysText`,
// `areaText`, `rateText`) rather than a parsed command, and `parcelLawChat.ts` types it into that
// field and presses that button. The language path IS the field path — one plan builder, one
// dispatcher, one refusal — and "the two agree" is true by construction rather than by review.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ OPEN LANGUAGE — NEVER A NARROWED VOCABULARY (the founder's standing RAC doctrine)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder: open language in, safety through rule gates that refuse with BOTH numbers. So:
//   · a sentence this module does not recognise is a `miss`, NOT a refusal. The caller falls
//     through to the SHIPPED chat ladder (`tryHandleZeroToken`), which is what "chat via RAC"
//     means — this is a parcel-law FRONT of that ladder, not a replacement for it;
//   · a sentence it recognises but cannot pin to a number is a `clarify` — ask, never guess.
//     Recognised-and-underspecified and unrecognised are different states and get different
//     answers (the §CONTEXT-DATA-HONESTY rule applied to language);
//   · a topic the surface HEARS but does not DRIVE ("south facing", "parking") is neither: it is
//     named in `heardNotDriven` so the reply can say what PRYZM did with it. Silence about a
//     clause the user wrote reads as compliance, which is the worst of the three.
//
// ⛔ THE REFUSALS ARE NOT HERE. Every "you asked for more than the law allows" sentence is
// produced by the control this hands to — `solveTargetFootprintArea`, `buildEnvelopeAuthoringPlan`,
// `parseIndicativeRateInput` — each of which already refuses with both numbers. A refusal written
// here would be a second copy of a legal sentence, which is the C19 §5.6 clause-1 defect with a
// parser in front of it.
//
// PURE: no DOM, no store, no THREE, no I/O, no clock, no RNG. Deterministic. Never throws.

import { trace } from '@opentelemetry/api';
import type { MassingShapeFamily } from './massingShapeOptions';

const _tracer = trace.getTracer('pryzm.site.parcelLawChatIntent');

// ─────────────────────────────────────────────────────────────────────────────
// 1. The intents — a closed union, one member per control this surface HAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A topic the surface recognises in language but does NOT take as an instruction today.
 *
 * ⛔ These are not misses and not refusals. `orientation` / `sun` / `overlooking` / `outlook` are
 * SCORE axes on the massing options (`MassingShapeAxisKey`) — PRYZM computes and displays them,
 * it does not solve a shape TO them. `parking` and `entrance` are named in STR §25.3's criteria
 * list and have no engine at all yet. Saying so out loud is the whole point of the field: the
 * founder's own worked instruction is *"180 sqm brut in ground floor – ideally L shape – south
 * facing oriented"*, and a surface that silently did two of those three would read as having done
 * all three.
 */
export type ParcelLawHeardNotDriven =
    | 'orientation'
    | 'sun'
    | 'overlooking'
    | 'outlook'
    | 'parking'
    | 'entrance';

/** What each `heardNotDriven` topic means, in the voice the reply uses. Closed; one row each. */
export const HEARD_NOT_DRIVEN_TEXT: Readonly<Record<ParcelLawHeardNotDriven, string>> = Object.freeze({
    orientation:
        'I heard an ORIENTATION ask. PRYZM measures each massing option’s south façade and street '
        + 'frontage and shows them as scores — it does not yet solve a shape TO an orientation, so '
        + 'I have not rotated anything. Read the option’s score rows and pick.',
    sun:
        'I heard a SUN ask. PRYZM raycasts real sun hours per massing option and displays them as a '
        + 'score axis — it does not yet optimise a shape for sun, so I have not changed a shape for it.',
    overlooking:
        'I heard an OVERLOOKING ask. PRYZM scores each option against the neighbouring buildings it '
        + 'has; it does not yet solve a shape to minimise being overlooked.',
    outlook:
        'I heard a VIEW ask. PRYZM scores open outlook per option; it does not yet solve a shape to '
        + 'maximise a view.',
    parking:
        'I heard a PARKING ask. STR §25.3 lists parking as a massing criterion and PRYZM has no '
        + 'parking engine yet — I have not accounted for it in anything I just did.',
    entrance:
        'I heard an ENTRANCE ask. PRYZM scores street frontage per option but does not place an '
        + 'entrance, so nothing I just did positioned one.',
});

/**
 * One thing to do, in the form the MANUAL control takes it.
 *
 * ⭐ Every payload is the STRING A FIELD RECEIVES, not a parsed command — see the header. The
 * numeric twin is carried beside it only so a caller can report and a test can assert without
 * re-parsing; the string is what is typed.
 */
export type ParcelLawChatIntent =
    /** STR §25.2 — "I want 180 sqm on the ground floor". Drives the target-area field. */
    | { readonly kind: 'set-ground-area'; readonly areaM2: number; readonly areaText: string }
    /** STR §25.3 — "ideally L shape". Drives the massing option pick of that shape family. */
    | { readonly kind: 'pick-shape'; readonly shape: MassingShapeFamily }
    /** STR §25.2/§25.6 — "create a 3 storey envelope". Drives the storeys field + Create button. */
    | { readonly kind: 'create-envelope'; readonly storeys: number; readonly storeysText: string }
    /** STR §25.7 — "cost 1800 eur per m2". Drives the rate field (and the currency select if named). */
    | {
        readonly kind: 'set-rate';
        readonly amountPerM2: number;
        readonly rateText: string;
        /** ISO-ish currency code the user NAMED, or `null` — never inferred (C38 §1.2). */
        readonly currency: string | null;
    }
    /** "clear the rate" — the empty string is an UNSET, which `parseIndicativeRateInput` honours. */
    | { readonly kind: 'clear-rate' }
    /** A question. Answered by READING the panel's own rendered figures, never by re-deriving. */
    | { readonly kind: 'ask'; readonly topic: ParcelLawAskTopic };

/** What a question is about. Each maps to a section of the panel that is READ BACK verbatim. */
export type ParcelLawAskTopic =
    /** "how much can I build on the first floor?" → the live BRUT/NET law-check table. */
    | 'remaining'
    /** "how big is the parcel / what may I build here?" → the parcel + ordinance fact rows. */
    | 'parcel'
    /** "what does it cost?" → the live quantities + indicative cost section. */
    | 'cost';

/**
 * The whole answer to one utterance.
 *
 * ⚠ `intents` is ORDERED and may hold more than one — the founder's own instruction is a compound
 * (*"180 sqm brut in ground floor – ideally L shape"*), and splitting it into two turns would be
 * PRYZM narrowing the vocabulary to fit its parser. The order is the order the controls must run
 * in: an area before a shape, because the shape families are solved AGAINST the target area
 * (`MassingOptionInputs.targetGroundFloorAreaM2`); a shape before a create, because the create
 * extrudes whatever plate is on the ground.
 */
export interface ParcelLawChatParse {
    readonly kind: 'act' | 'clarify' | 'miss';
    /** Empty unless `kind === 'act'`. */
    readonly intents: readonly ParcelLawChatIntent[];
    /** Present only when `kind === 'clarify'`: the ONE question to ask back. */
    readonly question: string | null;
    /** Topics heard and not driven. May be non-empty on ANY kind, including `miss`. */
    readonly heardNotDriven: readonly ParcelLawHeardNotDriven[];
}

const MISS: ParcelLawChatParse = Object.freeze({
    kind: 'miss', intents: Object.freeze([]), question: null, heardNotDriven: Object.freeze([]),
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lower-case, de-typographise and collapse. ⚠ `²` is folded to `2` BEFORE anything else so
 * `m²`, `m2`, `M²` and `sqm` are one token downstream — a user who types the superscript and a
 * user who types the digit asked the same question.
 */
export function normaliseUtterance(raw: string): string {
    return (raw ?? '')
        .toLowerCase()
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—−]/g, '-')
        .replace(/²/g, '2')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Read a number out of `token`, tolerating both thousands separators and decimal commas.
 *
 * ⛔ `1,200` and `1,2` are DIFFERENT numbers and this is where that is decided: a comma followed
 * by exactly three digits with a digit before it is a thousands separator (1200); anything else is
 * a decimal point (1.2). Getting this wrong turns a 1,200 m² parcel into 1.2 m², and the control
 * downstream would then refuse a perfectly legal ask with a real-looking number — the worst shape
 * of wrong answer this surface can produce.
 */
export function parseLooseNumber(token: string): number | null {
    const t = token.trim();
    if (t.length === 0) return null;
    const thousandsStripped = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t;
    const decimalFixed = /^\d+,\d{1,2}$/.test(thousandsStripped)
        ? thousandsStripped.replace(',', '.')
        : thousandsStripped;
    if (!/^\d+(\.\d+)?$/.test(decimalFixed)) return null;
    const n = Number(decimalFixed);
    return Number.isFinite(n) ? n : null;
}

/** Every number in the utterance, in order, with the character span it occupied. */
interface NumberHit { readonly value: number; readonly start: number; readonly end: number }

function findNumbers(text: string): readonly NumberHit[] {
    const out: NumberHit[] = [];
    const re = /\d[\d,.]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        // ⛔ A DIGIT GLUED TO A LETTER IS PART OF A UNIT, NOT A QUANTITY. The `2` of `m2` is the
        // one that bites: without this guard, *"cost 1800 eur per m2"* yields the numbers
        // `[1800, 2]` and the rate arm can pick the 2 — setting a €2/m² build cost from a sentence
        // that said 1800. Measured, not theorised: it is what the first run of this spec did.
        if (m.index > 0 && /[a-z]/.test(text[m.index - 1] ?? '')) continue;
        // Trim a trailing separator so "180," yields 180 rather than failing the strict test.
        const token = m[0].replace(/[.,]+$/, '');
        const value = parseLooseNumber(token);
        if (value !== null) out.push({ value, start: m.index, end: m.index + token.length });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. The vocabulary — deliberately WIDE, and exported so the reply can print it
// ─────────────────────────────────────────────────────────────────────────────

/** Area unit tokens. `m2` covers `m²` by normalisation. */
const AREA_UNIT = /\b(m2|sqm|sq ?m|square ?met(re|er)s?|met(re|er)s? squared)\b/;
/** Words that mean "the ground plate". Multilingual on purpose — the founder works in three. */
const GROUND_WORDS =
    /\b(ground ?floor|ground|footprint|implantation|implantacion|implantación|plate|planta ?baja|rez[- ]de[- ]chauss[ée]e|erdgeschoss|piano ?terra)\b/;
/** Words that mean "a storey". */
const STOREY_WORDS = /\b(storey|storeys|story|stories|floor|floors|level|levels|plantas?|etages?|étages?|stock(werk)?e?)\b/;
/** Verbs that mean "make the envelope". */
const CREATE_WORDS = /\b(create|make|build|extrude|generate|draw|add|raise)\b/;
/** The word for the thing being made. */
const ENVELOPE_WORDS = /\b(envelope|envelopes|volume|massing|box|shell)\b/;
/** Words that mean "money per square metre". */
const RATE_WORDS = /\b(cost|costs|rate|price|budget|eur\/m2|per ?m2|\/m2)\b/;
/** Words that unset the rate. */
const CLEAR_WORDS = /\b(clear|unset|remove|forget|reset|no)\b/;
/** Anything that makes the utterance a QUESTION rather than an instruction. */
const QUESTION_WORDS =
    /(^|\b)(how|what|what's|whats|which|where|when|why|can i|could i|may i|am i|is there|are there|do i|show me|tell me)\b|\?$/;
/** Words meaning "what is left over". */
const REMAINDER_WORDS = /\b(remain|remaining|remainder|left|leftover|rest|available|allowance|budget left)\b/;

/** Currency codes and symbols this surface will pass through. ⛔ Never inferred — only NAMED. */
const CURRENCY_TOKENS: ReadonlyArray<readonly [RegExp, string]> = Object.freeze([
    [/(\beur\b|€|\beuros?\b)/, 'EUR'],
    [/(\bgbp\b|£|\bpounds?\b|\bsterling\b)/, 'GBP'],
    [/(\busd\b|\$|\bdollars?\b)/, 'USD'],
    [/\bchf\b/, 'CHF'],
    [/\bsek\b/, 'SEK'],
    [/\bnok\b/, 'NOK'],
    [/\bdkk\b/, 'DKK'],
    [/\bpln\b/, 'PLN'],
    [/\bczk\b/, 'CZK'],
    [/\bhuf\b/, 'HUF'],
    [/\bron\b/, 'RON'],
    [/\bbgn\b/, 'BGN'],
]);

/** Shape family synonyms → the SHIPPED `MassingShapeFamily` ids. Order matters: longest first. */
const SHAPE_TOKENS: ReadonlyArray<readonly [RegExp, MassingShapeFamily]> = Object.freeze([
    [/\b(non[- ]?orthogonal|non[- ]?90|not ?90|angled) ?l\b|\bl[- ]?shape[d]? (at )?(an )?angle\b|\bl non[- ]?orthogonal\b/, 'ell-non-orthogonal'],
    [/\bu[- ]?shape[d]?\b|\bu ?shape\b|\bcourt(yard)?\b|\bthree wings\b/, 'u-court'],
    [/\bl[- ]?shape[d]?\b|\bl ?shape\b|\bell[- ]?shape[d]?\b|\btwo wings\b/, 'ell'],
    [/\bi[- ]?shape[d]?\b|\bbar\b|\bsingle bar\b|\blinear block\b/, 'bar-i'],
]);

/** Topics the surface hears and does not drive. See `HEARD_NOT_DRIVEN_TEXT`. */
const HEARD_TOKENS: ReadonlyArray<readonly [RegExp, ParcelLawHeardNotDriven]> = Object.freeze([
    [/\b(south|north|east|west|southern|northern|eastern|western)[- ]?(facing|oriented|orientation)?\b|\borientation\b|\borient(ed)?\b/, 'orientation'],
    [/\bsun\b|\bsunlight\b|\bsolar\b|\bdaylight\b|\bsun ?hours\b/, 'sun'],
    [/\boverlook(ing|ed)?\b|\bprivacy\b|\bnot ?be ?seen\b/, 'overlooking'],
    [/\bview\b|\bsea ?view\b|\boutlook\b|\bvista\b/, 'outlook'],
    [/\bparking\b|\bcar ?park\b|\bgarage\b/, 'parking'],
    [/\bentrance\b|\bentry\b|\bfront ?door\b/, 'entrance'],
]);

/**
 * What this surface understands, in the user's words. Rendered by the chat's own refusal so the
 * list a user is shown can never drift from the list the parser implements — a hand-typed help
 * string beside a parser is the same two-sources-of-truth defect as a hand-copied gate number.
 */
export const PARCEL_LAW_CHAT_EXAMPLES: readonly string[] = Object.freeze([
    '180 m² on the ground floor',
    'L shape',
    'create a 3 storey envelope',
    'cost 1800 EUR per m²',
    'how much can I still build above ground?',
    'what does the law allow here?',
]);

// ─────────────────────────────────────────────────────────────────────────────
// 4. The resolver
// ─────────────────────────────────────────────────────────────────────────────

function currencyIn(text: string): string | null {
    for (const [re, code] of CURRENCY_TOKENS) if (re.test(text)) return code;
    return null;
}

function shapesIn(text: string): readonly MassingShapeFamily[] {
    const out: MassingShapeFamily[] = [];
    for (const [re, family] of SHAPE_TOKENS) {
        if (re.test(text) && !out.includes(family)) out.push(family);
    }
    // ⚠ ONE SHAPE ONLY. Two shape words in one sentence is a comparison ("L or U?"), not two
    // instructions, and picking both would silently overwrite the first pick with the second.
    return out.length === 1 ? out : [];
}

function heardIn(text: string): readonly ParcelLawHeardNotDriven[] {
    const out: ParcelLawHeardNotDriven[] = [];
    for (const [re, topic] of HEARD_TOKENS) if (re.test(text)) out.push(topic);
    return out;
}

/**
 * A number followed by a PER-UNIT phrase — `1800 eur per m2`, `1500/m2`, `1800 € / sqm`.
 *
 * ⛔ THIS MUST BE TESTED BEFORE `areaNumber`, and the difference is the whole arm: `200 m2` is an
 * AREA and `1800 per m2` is a RATE, and both end in the same unit token. Classifying the rate as
 * an area would type a build cost into the ground-floor field.
 */
const PER_UNIT_TAIL =
    /^[\s,]*(eur|gbp|usd|chf|sek|nok|dkk|pln|czk|huf|ron|bgn|€|£|\$)?\s*(per\s*|\/\s*)(m2|sqm|sq ?m|square ?met(re|er)s?)/;

function isRateNumber(text: string, n: NumberHit): boolean {
    return PER_UNIT_TAIL.test(text.slice(n.end, n.end + 30));
}

/** A number that is followed (within a few characters) by an area unit and is NOT a per-unit rate. */
function areaNumber(text: string, numbers: readonly NumberHit[]): NumberHit | null {
    for (const n of numbers) {
        if (isRateNumber(text, n)) continue;
        const tail = text.slice(n.end, n.end + 22);
        if (AREA_UNIT.test(tail)) return n;
    }
    return null;
}

/**
 * A number IMMEDIATELY followed by a storey word.
 *
 * ⛔ IMMEDIATELY, not "somewhere in the next 14 characters", and that anchor is load-bearing.
 * The loose form read *"duplicate level 0 to level 1"* — a sentence the SHIPPED ladder answers —
 * as *"create a 0-storey envelope"*, because a storey word appeared later in the sentence. A chat
 * front that swallows the ladder's own vocabulary is the vocabulary-narrowing the founder's RAC
 * doctrine forbids, and it does it silently. Measured on the first run of this spec.
 */
function storeyNumber(text: string, numbers: readonly NumberHit[]): NumberHit | null {
    for (const n of numbers) {
        const tail = text.slice(n.end, n.end + 16);
        if (/^[\s-]{0,2}(storey|storeys|story|stories|floor|floors|level|levels|plantas?|etages?|étages?|stock(werk)?e?)\b/.test(tail)) {
            return n;
        }
    }
    return null;
}

/**
 * THE resolver. Pure; total; never throws.
 *
 * ⭐ THE ORDER OF THE ARMS IS LOAD-BEARING, and for the same reason it is in
 * `solveTargetFootprintArea`: a QUESTION is classified before any instruction, so *"how much can I
 * build on the first floor?"* is answered rather than silently read as *"build a first floor"*.
 * That single mis-order would turn a question into a mutation, which is the worst thing a chat
 * surface can do.
 */
export function resolveParcelLawUtterance(raw: string): ParcelLawChatParse {
    const span = _tracer.startSpan('pryzm.site.resolveParcelLawUtterance');
    try {
        const text = normaliseUtterance(raw);
        if (text.length === 0) return MISS;
        const heard = heardIn(text);
        const numbers = findNumbers(text);
        const isQuestion = QUESTION_WORDS.test(text);

        // ── 1. QUESTIONS, before any instruction arm. ────────────────────────────────────────
        if (isQuestion) {
            const topic: ParcelLawAskTopic =
                REMAINDER_WORDS.test(text) || STOREY_WORDS.test(text) ? 'remaining'
                    : RATE_WORDS.test(text) ? 'cost'
                        : /\b(parcel|plot|site|law|zoning|ordinance|allow|permitted|height|far|coverage|area)\b/.test(text)
                            ? 'parcel'
                            : 'parcel';
            // ⚠ A bare "what?" with no subject is a MISS, not a parcel answer — answering it with
            // the fact card would be PRYZM deciding what the user meant.
            if (!/\b(parcel|plot|site|law|zoning|ordinance|allow|permitted|height|far|coverage|area|build|buildable|floor|storey|story|level|remain|left|cost|price|rate|budget|envelope|m2|sqm)\b/.test(text)) {
                return { ...MISS, heardNotDriven: heard };
            }
            return { kind: 'act', intents: [{ kind: 'ask', topic }], question: null, heardNotDriven: heard };
        }

        const intents: ParcelLawChatIntent[] = [];

        // ── 2. THE COST RATE. Before the area arm, because "1800 eur/m2" carries no area unit
        //      and would otherwise fall through to the ground-floor arm as a bare number.
        const ratey = RATE_WORDS.test(text) || currencyIn(text) !== null;
        if (ratey) {
            if (CLEAR_WORDS.test(text) && numbers.length === 0) {
                return { kind: 'act', intents: [{ kind: 'clear-rate' }], question: null, heardNotDriven: heard };
            }
            // The rate number is the one carrying a PER-UNIT tail; failing that, the one that is
            // not an area. So "180 m2 at 1800 eur" gives the area to the ground arm and the 1800
            // to this one, and "cost 1800 eur per m2" gives 1800 to this one and nothing to that.
            const areaHit = areaNumber(text, numbers);
            const rateHit = numbers.find((n) => isRateNumber(text, n))
                ?? numbers.find((n) => n !== areaHit)
                ?? null;
            if (rateHit !== null) {
                intents.push({
                    kind: 'set-rate',
                    amountPerM2: rateHit.value,
                    rateText: String(rateHit.value),
                    currency: currencyIn(text),
                });
            } else if (numbers.length === 0 && RATE_WORDS.test(text) && !AREA_UNIT.test(text)) {
                return {
                    kind: 'clarify',
                    intents: [],
                    question:
                        'What cost per m² should I use? Type a number such as 1800, and name the currency if it '
                        + 'is not the one already selected — PRYZM never infers a currency from your locale.',
                    heardNotDriven: heard,
                };
            }
        }

        // ── 3. THE GROUND-FLOOR AREA (STR §25.2). ────────────────────────────────────────────
        const groundy = GROUND_WORDS.test(text);
        const areaHit = areaNumber(text, numbers);
        if (groundy || (areaHit !== null && !ratey)) {
            if (areaHit !== null) {
                intents.push({
                    kind: 'set-ground-area',
                    areaM2: areaHit.value,
                    areaText: String(areaHit.value),
                });
            } else if (groundy && numbers.length === 0) {
                return {
                    kind: 'clarify',
                    intents: [],
                    question:
                        'How many m² do you want on the ground floor? PRYZM will fit that plate inside the '
                        + 'permitted footprint, or say with both numbers why it cannot.',
                    heardNotDriven: heard,
                };
            }
        }

        // ── 4. THE SHAPE (STR §25.3). After the area, because the shape families are solved
        //      AGAINST the target ground-floor area — see `MassingOptionInputs`.
        for (const shape of shapesIn(text)) intents.push({ kind: 'pick-shape', shape });

        // ── 5. THE CREATE (STR §25.2/§25.6). Last, because it extrudes whatever is on the ground.
        const storeyHit = storeyNumber(text, numbers);
        const creatingWords = CREATE_WORDS.test(text) && ENVELOPE_WORDS.test(text);
        if (storeyHit !== null && (creatingWords || STOREY_WORDS.test(text))) {
            intents.push({
                kind: 'create-envelope',
                storeys: storeyHit.value,
                storeysText: String(storeyHit.value),
            });
        } else if (creatingWords && storeyHit === null) {
            // Recognised and underspecified: ASK. ⛔ Never default to 1 — a silent default is a
            // decision PRYZM made and the user would own.
            return {
                kind: 'clarify',
                intents: [],
                question:
                    'How many floor levels should the envelope have? PRYZM creates one level envelope per '
                    + 'storey in a single step, so one Ctrl+Z removes all of them.',
                heardNotDriven: heard,
            };
        }

        if (intents.length === 0) return { ...MISS, heardNotDriven: heard };
        span.setAttribute('pryzm.parcelLawChat.intents', intents.length);
        return { kind: 'act', intents, question: null, heardNotDriven: heard };
    } catch (e) {
        // A parser that throws must never take the chat down — the caller falls through to the
        // shipped ladder, which is exactly what a miss does.
        console.warn('[site][parcel-law-chat] resolver threw (non-fatal, treated as a miss):', e);
        return MISS;
    } finally {
        span.end();
    }
}
