// FRANCE — the HEIGHT DATUM as a TYPED, CO-EXTRACTED field. Founder blocker review 2026-09-04 §9.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DECISION THIS FILE RECORDS (⛔ read before touching the C2 count anywhere)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `FR-FOUNDER-BLOCKER-REVIEW.md` §9: *"a recovered '9 m' whose datum is unknown fails A2, and by
// your own provenance doctrine is arguably not a recovery … Then decide explicitly, in the
// document: does a height with `datum=unknown` count in the 15/500?"*
//
// ⭐ DECIDED — **NO.** A metric height whose FROM-datum could not be co-extracted is NOT `resolved`.
// It is `unrecovered / semantic / mechanism: present`, and the number it did read travels in the
// state's `partial` field (§DATUM-DECISION in `RuleState.ts`) — visible, reviewable, never counted.
// This is not a new rule: `RuleState.resolved.datum` already said *"a height with an unresolved
// datum is NOT `resolved` … because a number on an unknown plane cannot be multiplied into a
// volume"*. The round-one tree emitted `resolved` with `datum: null` for nine heights and thereby
// violated the vocabulary it was consuming; this module is the correction, and the 15/500 falls to
// whatever survives it. The hit is taken deliberately (FR-ENVELOPE-COMPLETION §1.7 records the
// before/after) rather than left for a customer to find.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// TWO AXES, NOT ONE — the founder's enum names both ends of the measurement
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `terrain naturel · terrain après travaux · niveau de la voie · égout · acrotère · faîtage` mixes
// the plane a height is measured FROM (the first three) with the point it is measured TO (the last
// three). They are different questions with different consequences:
//   • FROM unknown → the whole number floats: 9 m above the road and 9 m above the natural terrain
//     on a sloping parcel are different buildings. ⛔ This is the axis the DECISION above tightens on.
//   • TO unknown   → the number is anchored but bounds either the eave/parapet or the ridge — up to
//     a storey of ambiguity under a pitched roof. Recorded, reported separately, NOT (yet) a bar to
//     `resolved`: a consumer binding a TO-unknown height must read it as the LOWER of the two
//     readings (eave), never the ridge — the conservative direction (L-616).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// SEATING IN THE SHARED VOCABULARY (ADR-0377 `HeightDatum`) — stated, not papered over
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `RuleState.resolved.datum` carries the ADR-0377 member name. The FR FROM-vocabulary seats as:
//   niveau-de-la-voie     → `street-level`  (ADR-0377: "the street's finished grade fronting the parcel")
//   terrain-naturel       → ⚠ NO MEMBER. `terrain-highest` / `terrain-lowest` are the DK/DE
//                           high/low-point variants; a French PLU's "terrain naturel" is the ground
//                           BEFORE WORKS at the point considered — a different reference.
//   terrain-apres-travaux → ⚠ NO MEMBER (finished ground after works).
// ADR-0377 is APPEND-ONLY and minting a member requires an ADR citing a real ordinance. This lane
// does NOT mint (it owns no schema file outside `zoning/`). Until the ADR lands, an unseated FR
// datum is carried with an explicit jurisdiction prefix — `fr:terrain-naturel` — which (a) is a
// resolved plane, so the height COUNTS, and (b) can never be mistaken for an ADR member by a
// resolver's exhaustive switch (it is not one). `nlPeil.ts` carries its own reference classes in
// the same field the same way; this is the second such use and the prefix makes it greppable for
// the day the ADR replaces it.
//
// PURE + deterministic (C58 §1.1/§1.9): regex over supplied text. No I/O, no clock, no RNG.

import type { HeightDatumKind } from '@pryzm/schemas';

/* ───────────────────────────────── the two enums ──────────────────────────────── */

/** The plane a French height is measured FROM. `unknown` is first-class (ADR-0377 doctrine). */
export const FR_HEIGHT_DATUM_FROM = [
    'terrain-naturel',
    'terrain-apres-travaux',
    'niveau-de-la-voie',
    'unknown',
] as const;
export type FrHeightDatumFrom = (typeof FR_HEIGHT_DATUM_FROM)[number];

/** The point a French height is measured TO. */
export const FR_HEIGHT_REFERENCE_TO = ['egout', 'acrotere', 'faitage', 'unknown'] as const;
export type FrHeightReferenceTo = (typeof FR_HEIGHT_REFERENCE_TO)[number];

/**
 * FR FROM-datum → ADR-0377 member, or `null` where no member exists (see the header). The seat is
 * read through `frDatumForRuleState`, never from this table directly.
 */
export const FR_HEIGHT_DATUM_ADR0377_SEAT: Readonly<Record<FrHeightDatumFrom, HeightDatumKind | null>> =
    Object.freeze({
        'terrain-naturel': null,
        'terrain-apres-travaux': null,
        'niveau-de-la-voie': 'street-level',
        unknown: 'unknown',
    });

/**
 * The string a `RuleState.resolved.datum` carries for an FR FROM-datum: the ADR-0377 member name
 * where one is seated, else the `fr:`-prefixed FR spelling. Total.
 */
export function frDatumForRuleState(from: FrHeightDatumFrom): string {
    const seat = FR_HEIGHT_DATUM_ADR0377_SEAT[from];
    return seat ?? `fr:${from}`;
}

/** Is this FROM-datum RESOLVED (i.e. may a height measured from it count as recovered)? */
export function frDatumIsResolved(from: FrHeightDatumFrom): boolean {
    return from !== 'unknown';
}

/* ───────────────────────────────── co-extraction ──────────────────────────────── */

/**
 * The phrase patterns, in the order they are tested. Each row is the FR spelling family a règlement
 * or a CNIG libelle actually uses; the verbatim match is returned so a reviewer can check it.
 * ⚠ ORDER MATTERS within an axis only for reporting the first hit; a text naming two FROM-datums
 * (rare — "terrain naturel ou, si plus bas, niveau de la voie") is a conditional the PDF leg must
 * type, and is reported here as `ambiguous` rather than resolved to either.
 */
const FROM_PATTERNS: readonly { readonly from: Exclude<FrHeightDatumFrom, 'unknown'>; readonly re: RegExp }[] = [
    {
        from: 'terrain-apres-travaux',
        re: /(terrain|sol)\s+(apr[eè]s\s+travaux|am[ée]nag[ée]|fini)|apr[eè]s\s+travaux/i,
    },
    {
        from: 'terrain-naturel',
        re: /(terrain|sol)\s+naturel|\bT\.?N\.?\b(?![a-z])|avant\s+travaux/i,
    },
    {
        from: 'niveau-de-la-voie',
        re: /niveau\s+(de\s+la\s+|du\s+|de\s+l['’])(voie|trottoir|rue|chauss[ée]e|espace\s+public)|(à|a)\s+partir\s+(de\s+la\s+|du\s+)(voie|trottoir|chauss[ée]e)/i,
    },
];

const TO_PATTERNS: readonly { readonly to: Exclude<FrHeightReferenceTo, 'unknown'>; readonly re: RegExp }[] = [
    { to: 'egout', re: /[ée]gout(\s+du\s+toit|\s+de\s+toiture)?/i },
    { to: 'acrotere', re: /acrot[eè]re/i },
    { to: 'faitage', re: /fa[iî]tage|point\s+le\s+plus\s+haut/i },
];

export interface FrHeightDatumExtraction {
    readonly from: FrHeightDatumFrom;
    readonly to: FrHeightReferenceTo;
    /** The exact FROM phrase matched, or null. */
    readonly fromVerbatim: string | null;
    /** The exact TO phrase matched, or null. */
    readonly toVerbatim: string | null;
    /**
     * `true` when the text names MORE THAN ONE plane on an axis (e.g. "terrain naturel ou niveau
     * de la voie"). The axis is then reported `unknown` — picking one would be a determination.
     */
    readonly ambiguousFrom: boolean;
    readonly ambiguousTo: boolean;
}

const UNRESOLVED: FrHeightDatumExtraction = Object.freeze({
    from: 'unknown',
    to: 'unknown',
    fromVerbatim: null,
    toVerbatim: null,
    ambiguousFrom: false,
    ambiguousTo: false,
});

/**
 * Co-extract the datum phrases from the text(s) a height number was read out of. **Pure, total.**
 * Returns `unknown` on both axes for empty/absent text — never a default plane.
 *
 * ⚠ CO-EXTRACTION, NOT SEPARATE LOOKUP: the caller passes the SAME strings it recovered the number
 * from (a CNIG libelle/txt, or — later — the zone-scoped règlement paragraph). The founder's §9
 * point is that the datum phrase sits within a sentence or two of the number; a datum found in a
 * different document section is a different claim and must be passed explicitly.
 */
export function extractFrHeightDatum(...texts: readonly (string | null | undefined)[]): FrHeightDatumExtraction {
    const joined = texts
        .filter((t): t is string => typeof t === 'string' && t.trim() !== '')
        .join(' \n ');
    if (joined === '') return UNRESOLVED;

    const fromHits = FROM_PATTERNS.map((p) => ({ from: p.from, m: p.re.exec(joined) })).filter((h) => h.m !== null);
    const toHits = TO_PATTERNS.map((p) => ({ to: p.to, m: p.re.exec(joined) })).filter((h) => h.m !== null);

    const distinctFrom = new Set(fromHits.map((h) => h.from));
    const distinctTo = new Set(toHits.map((h) => h.to));

    const ambiguousFrom = distinctFrom.size > 1;
    const ambiguousTo = distinctTo.size > 1;

    const f = fromHits[0];
    const t = toHits[0];
    return {
        from: ambiguousFrom || f === undefined ? 'unknown' : f.from,
        to: ambiguousTo || t === undefined ? 'unknown' : t.to,
        fromVerbatim: f?.m?.[0] ?? null,
        toVerbatim: t?.m?.[0] ?? null,
        ambiguousFrom,
        ambiguousTo,
    };
}

/**
 * The one-line statement of the decision, for documents and `stoppedAt` strings — kept as a
 * constant so the wording that reaches a reader is the wording that was decided.
 */
export const FR_DATUM_DECISION =
    'A metric height whose FROM-datum (terrain naturel / terrain après travaux / niveau de la voie) ' +
    'was not co-extracted is NOT counted as recovered: it is `unrecovered / semantic` with the ' +
    'number carried in `partial`. TO-reference (égout / acrotère / faîtage) unknown is recorded and ' +
    'reported separately; it does not bar `resolved`, and a consumer must read such a height as the ' +
    'eave, never the ridge. Decided 2026-09-04 (lane ENVELOPE-FR, founder review §9).';
