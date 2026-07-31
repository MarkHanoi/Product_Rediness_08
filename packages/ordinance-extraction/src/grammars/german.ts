// @pryzm/ordinance-extraction — the GERMAN grammar adapter (the first, proven on
// the Berlin corpus). The ONLY per-jurisdiction surface of the text-parse path:
// patterns + field map + interpretation. The shared core (`textExtract/extractor`)
// does everything else.
//
// PROVEN against the Berlin 8-30 Begründung (born-digital text, no OCR —
// jurisdictions/de/de-be/11000-berlin/PROBE-VERDICT-2026-07-31.md §4):
//   "…einer Grundflächenzahl (GRZ) von 0,3 sowie einer Geschossflächenzahl
//    (GFZ) von 0,9…"   →  GRZ 0,3 (maxCoverage) + GFZ 0,9 (maxFAR), each cited.
//
// FIELD MAP (BauNVO Festsetzungen → C58 envelope fields):
//   Grundflächenzahl (GRZ)                     → maxCoverage      (ratio)
//   Geschossflächenzahl (GFZ)                  → maxFAR           (ratio, per-plot)
//   Zahl der Vollgeschosse / roman "III"       → maxFloors        (storeys)
//   Traufhöhe (TH)                             → maxHeight_m      (m, eaves)
//   Firsthöhe (FH)                             → maxHeight_m      (m, ridge)
//   Gebäudehöhe / Höhe baulicher Anlagen / OK  → maxHeight_m      (m, building)
//
// REJECTS (NOT binding parcel rules): Orientierungswerte and the national §17
// BauNVO Obergrenzen table — these are orientation ceilings, never a parcel value.
//
// German numbers are decimal-comma (`0,3`→0.3, `2.000`→2000) — handled by the
// shared locale parser via `locale: 'de'`.

import {
    type FieldMatcher,
    type JurisdictionGrammar,
    type MatchPayload,
    type MatcherContext,
    type RejectPattern,
} from '../textExtract/types.js';

/**
 * Convert a Roman numeral (I…) to an integer, or null if malformed. German
 * Festsetzungen state the storey count as a Roman numeral ("III Vollgeschosse").
 * Case-insensitive; validated by round-trip so "IIII"/"VV" (invalid) return null.
 */
export function romanToInt(raw: string): number | null {
    const s = raw.trim().toUpperCase();
    if (s === '' || !/^[IVXLC]+$/.test(s)) return null;
    const val: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
    let total = 0;
    for (let i = 0; i < s.length; i++) {
        const cur = val[s[i]!]!;
        const next = i + 1 < s.length ? val[s[i + 1]!]! : 0;
        total += cur < next ? -cur : cur;
    }
    // Round-trip guard: reject non-canonical numerals (IIII, VX, …).
    return intToRoman(total) === s ? total : null;
}

/** Canonical Roman rendering (guard for {@link romanToInt}). */
function intToRoman(n: number): string {
    if (n <= 0 || n > 399) return '';
    const table: readonly [number, string][] = [
        [100, 'C'],
        [90, 'XC'],
        [50, 'L'],
        [40, 'XL'],
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I'],
    ];
    let out = '';
    let rem = n;
    for (const [v, sym] of table) {
        while (rem >= v) {
            out += sym;
            rem -= v;
        }
    }
    return out;
}

/** Parse a captured storey token — Arabic (`3`) or Roman (`III`) — or null. */
function parseStoreys(raw: string, ctx: MatcherContext): number | null {
    const arabic = ctx.parseNumber(raw);
    if (arabic !== null && Number.isInteger(arabic) && arabic > 0) return arabic;
    return romanToInt(raw);
}

// Shared quantifier connective between a keyword and its number. ZERO OR MORE
// words, so multi-word forms parse ("beträgt maximal 12,5 m") and the table form
// with no connective still matches ("GRZ 0,3"). Each word may trail whitespace.
//
// ⚠ This is a deliberately CLOSED set of attested Festsetzung connectives, never a
// wildcard `.*?`. A wildcard would let a keyword reach across an unrelated clause
// and bind the WRONG number to it ("die GRZ und die GFZ von 0,9" → GRZ 0,9), which
// is the confident-wrong-attribution failure this pipeline exists to prevent
// (ORDINANCE-EXTRACTION-PIPELINE.md §intro, L-590g). Adding a word here widens what
// a keyword may skip — only add forms attested in real Festsetzungen text.
// Attested forms covered:
//   "GRZ von 0,3" · "GRZ = 0,4" · "GRZ: 0,4" · "GRZ 0,3" (Nutzungsschablone table)
//   "Traufhöhe beträgt maximal 12,5 m" · "höchstens 3" · "bis zu 18 m"
//   "wird auf 0,4 festgesetzt" · "wird mit 15,0 m festgesetzt"
//   "Die Gebäudehöhe darf 18 m nicht überschreiten" (modal — the negation and the
//    verb sit AFTER the number, so only the modal itself needs to be skippable)
const CONNECTIVE =
    '(?:(?:von|=|:|beträgt|betragen|betragt|darf|dürfen|auf|mit|wird|werden|max\\.?|maximal|höchstens|bis zu|ein(?:e|er|en)?)\\s*)*';
const NUM = '([0-9]+(?:[.,][0-9]+)?)'; // a decimal-comma or dot number token.

/** Build a ratio matcher (GRZ/GFZ) — keyword, optional connective, then a number. */
function ratioMatcher(
    id: string,
    field: FieldMatcher['field'],
    keyword: string,
    densityScope: MatchPayload['densityScope'],
): FieldMatcher {
    return {
        id,
        field,
        unit: 'ratio',
        pattern: new RegExp(`(?:${keyword})\\s*${CONNECTIVE}\\s*${NUM}`, 'gi'),
        interpret: (m, ctx) => {
            const value = ctx.parseNumber(m[1]!);
            if (value === null) return null;
            return densityScope !== undefined
                ? { value, rawText: m[1]!, densityScope }
                : { value, rawText: m[1]! };
        },
    };
}

/** Build a height matcher — keyword … number … the mandatory `m` unit. */
function heightMatcher(
    id: string,
    keyword: string,
    measurement: NonNullable<MatchPayload['measurement']>,
): FieldMatcher {
    return {
        id,
        field: 'maxHeight_m',
        unit: 'm',
        // The trailing `m` unit is REQUIRED — it disambiguates a height from a bare
        // number and stops the matcher grabbing an unrelated figure.
        pattern: new RegExp(`(?:${keyword})\\s*${CONNECTIVE}\\s*${NUM}\\s*m\\b`, 'gi'),
        interpret: (m, ctx) => {
            const value = ctx.parseNumber(m[1]!);
            if (value === null) return null;
            return { value, rawText: m[1]!, measurement };
        },
    };
}

/** The German field matchers, in priority order. */
const MATCHERS: readonly FieldMatcher[] = [
    // Grundflächenzahl (GRZ) → ground coverage, a fraction.
    ratioMatcher('de-grz', 'maxCoverage', 'Grundflächenzahl\\s*(?:\\(GRZ\\))?|GRZ', undefined),
    // Geschossflächenzahl (GFZ) → FAR, measured on the plot (Grundstücksfläche).
    ratioMatcher(
        'de-gfz',
        'maxFAR',
        'Geschossflächenzahl\\s*(?:\\(GFZ\\))?|GFZ',
        'per-plot-area',
    ),
    // Zahl der Vollgeschosse (keyword first): "…Vollgeschosse von 3" / "…: III".
    {
        id: 'de-vollgeschosse',
        field: 'maxFloors',
        unit: 'storeys',
        pattern: new RegExp(
            `(?:Zahl der Vollgeschosse|Vollgeschoss(?:e|zahl|igkeit)?)\\s*${CONNECTIVE}\\s*([0-9]{1,2}|[IVXLC]+)\\b`,
            'gi',
        ),
        interpret: (m, ctx) => {
            const value = parseStoreys(m[1]!, ctx);
            return value === null ? null : { value, rawText: m[1]! };
        },
    },
    // Vollgeschosse (numeral first): "III Vollgeschosse" / "3 Vollgeschosse".
    {
        id: 'de-vollgeschosse-leading',
        field: 'maxFloors',
        unit: 'storeys',
        pattern: new RegExp(`\\b([0-9]{1,2}|[IVXLC]+)\\s+Vollgeschoss(?:e|ig)?\\b`, 'gi'),
        interpret: (m, ctx) => {
            const value = parseStoreys(m[1]!, ctx);
            return value === null ? null : { value, rawText: m[1]! };
        },
    },
    // Heights — the datum is stamped from WHICH keyword matched.
    heightMatcher('de-traufhoehe', 'Traufhöhe\\s*(?:\\(TH\\))?|TH', 'eaves'),
    heightMatcher('de-firsthoehe', 'Firsthöhe\\s*(?:\\(FH\\))?|FH', 'ridge'),
    heightMatcher(
        'de-gebaeudehoehe',
        'Gebäudehöhe|Höhe der baulichen Anlagen|Höhe baulicher Anlagen|Oberkante',
        'building',
    ),
];

/** Sentences that are NOT binding parcel rules — never emit a value from them. */
const REJECTS: readonly RejectPattern[] = [
    {
        id: 'orientierungswerte',
        pattern: /Orientierungswert/gi,
        detail: 'Orientierungswerte are non-binding orientation values, not a parcel Festsetzung.',
    },
    {
        id: 'baunvo-17-obergrenze',
        pattern: /§\s*17\s*(?:der\s+)?(?:BauNVO|Baunutzungsverordnung)/gi,
        detail: 'The §17 BauNVO table is the national density CEILING, not a parcel-set value.',
    },
    {
        id: 'baunvo-17-obergrenze-prose',
        pattern: /Obergrenze[n]?[^.]*BauNVO/gi,
        detail: 'A reference to the BauNVO Obergrenzen (national ceiling), not a parcel value.',
    },
];

/** Find the governing § / article in a sentence (German syntax), or null. */
function findGermanSection(sentence: string): string | null {
    const m = sentence.match(/§\s*(\d+\s*[a-z]?)(?:\s*Abs\.?\s*(\d+))?/i);
    if (!m) return null;
    const num = m[1]!.replace(/\s+/g, '');
    return m[2] ? `§ ${num} Abs. ${m[2]}` : `§ ${num}`;
}

/**
 * The German grammar adapter. Hand this (with born-digital ordinance text + a
 * source) to `extractRules` to parse GRZ / GFZ / Vollgeschosse / Trauf-/First-/
 * Gebäudehöhe into cited `pipeline-extracted-unverified` rules.
 */
export const GERMAN_GRAMMAR: JurisdictionGrammar = {
    jurisdiction: 'de',
    displayName: 'Germany (BauNVO Festsetzungen)',
    locale: 'de',
    matchers: MATCHERS,
    rejectPatterns: REJECTS,
    findSection: findGermanSection,
};
