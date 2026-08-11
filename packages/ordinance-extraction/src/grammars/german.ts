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
    type RuleReferencePattern,
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

// An optional bracket CLOSING an abbreviation, allowed between the keyword and its
// connective.
//
// ⚠ REGRESSION GUARD — this exists because of real data, not theory. The Berlin
// probe's verbatim fragment (PROBE-VERDICT-2026-07-31.md §4) begins mid-sentence at
// "(GRZ) von 0,3": the long form "Grundflächenzahl" is on the previous line, so what
// reaches the matcher is the bare abbreviation still wearing its closing paren.
// Without this the `GRZ` alternative matched the letters and then died on ")", and
// GRZ silently came back `not-stated-in-text` on the one string we KNOW states it.
// Every hand-written test sentence had passed, because they all supplied the long
// form. Real extracted text is ragged; the grammar has to survive it.
const KEYWORD_TAIL = '\\s*[)\\]]?\\s*';

// A STATUTORY CITATION appearing between a keyword and its value, consumed as ONE
// unit. Measured need (Berlin 8-30 p56, the plan's actual binding Festsetzung):
//   "…die zulässige Geschossflächenzahl GFZ gemäß § 20 Abs. 2 BauNVO auf 1,2 …"
// Without this the GFZ keyword cannot reach `1,2` and the plan's real FAR is
// silently missed.
//
// ⚠ WHY A STRUCTURED SKIP AND NOT A WILDCARD. A citation is full of digits —
// `§ 20 Abs. 2` — so a lazy `.*?` between keyword and number would happily bind
// GFZ to **20** or **2**. This alternative matches the citation as a whole named
// unit and consumes its digits, so the first number left for `NUM` is the real
// value. Same discipline as CONNECTIVE: a closed grammar of attested forms.
//
// ⚠ EVERY `\d+` CARRIES A `\b`, AND THAT IS LOAD-BEARING. Without it the regex
// engine backtracks: on "Die GRZ nach § 19 Abs. 2 BauNVO …" it happily matches the
// citation number as `§ 1`, leaves the `9` unconsumed, and binds **GRZ = 9**.
// Measured on Berlin 8-30 p87 the moment this skip was introduced. (The range gate
// did flag it — 9 ∉ [0,1] — which is defence-in-depth working, but a grammar that
// relies on a downstream gate to catch its own backtracking is a grammar with a
// bug.) `\d+\b` forces the whole digit run to be consumed.
const CITATION_SKIP =
    '(?:(?:gemäß|gemaess|nach|entsprechend|i\\.?\\s?V\\.?\\s?m\\.?)\\s*)?' +
    '§+\\s*\\d+\\b\\s*[a-z]?\\s*(?:Abs\\.?\\s*\\d+\\b\\s*)?(?:Satz\\s*\\d+\\b\\s*)?' +
    '(?:Nr\\.?\\s*\\d+\\b\\s*)?(?:[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]*\\s*)?';

/** Build a ratio matcher (GRZ/GFZ) — keyword, optional connective, then a number. */
function ratioMatcher(
    id: string,
    field: FieldMatcher['field'],
    keyword: string,
    landBasis: MatchPayload['landBasis'],
): FieldMatcher {
    return {
        id,
        field,
        unit: 'ratio',
        pattern: new RegExp(
            `(?:${keyword})${KEYWORD_TAIL}(?:${CITATION_SKIP})?${CONNECTIVE}\\s*${NUM}`,
            'gi',
        ),
        keyword: new RegExp(`(?:${keyword})`, 'gi'),
        interpret: (m, ctx) => {
            const value = ctx.parseNumber(m[1]!);
            if (value === null) return null;
            return landBasis !== undefined
                ? { value, rawText: m[1]!, landBasis }
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
        pattern: new RegExp(
            `(?:${keyword})${KEYWORD_TAIL}(?:${CITATION_SKIP})?${CONNECTIVE}\\s*${NUM}\\s*m\\b`,
            'gi',
        ),
        keyword: new RegExp(`(?:${keyword})`, 'gi'),
        interpret: (m, ctx) => {
            const value = ctx.parseNumber(m[1]!);
            if (value === null) return null;
            return { value, rawText: m[1]!, measurement };
        },
    };
}

// ⚠ W5-2 — BOTH GERMAN RATIOS NOW DECLARE THEIR DENOMINATOR, AND IT IS THE SAME ONE.
//
// GRZ used to be built with `undefined`: the grammar had no statement of what its denominator
// was, so `densityCoherence()` related a per-plot GFZ to a basis-less GRZ and called the pair
// coherent. That silence was not a property of German law — §19(1) BauNVO defines the
// Grundflächenzahl as Grundfläche ÷ **Grundstücksfläche**, and §20(2) defines the
// Geschossflächenzahl as Geschossfläche ÷ the SAME Grundstücksfläche. The two ratios share a
// denominator by statute, which is precisely why GFZ ≤ GRZ × Z is a valid identity in Germany.
//
// So the honest fix is to SAY SO, citing the statute, rather than to let the identity rest on
// an undeclared assumption. `'parcel'` is the L0 `LandBasis` member for Grundstücksfläche.
//
// ⚠ It is NOT `'buildable'`. A Grundstück may contain ground that may not be built on; C63
// §3.2's buildable-land denominator is a different, smaller area and nothing here measures it.
/** The German field matchers, in priority order. */
const MATCHERS: readonly FieldMatcher[] = [
    // Grundflächenzahl (GRZ) → ground coverage, a fraction of the Grundstücksfläche (§19(1) BauNVO).
    ratioMatcher('de-grz', 'maxCoverage', 'Grundflächenzahl\\s*(?:\\(GRZ\\))?|GRZ', 'parcel'),
    // Geschossflächenzahl (GFZ) → FAR, over the same Grundstücksfläche (§20(2) BauNVO).
    ratioMatcher(
        'de-gfz',
        'maxFAR',
        'Geschossflächenzahl\\s*(?:\\(GFZ\\))?|GFZ',
        'parcel',
    ),
    // Zahl der Vollgeschosse (keyword first): "…Vollgeschosse von 3" / "…: III".
    {
        id: 'de-vollgeschosse',
        field: 'maxFloors',
        unit: 'storeys',
        pattern: new RegExp(
            `(?:Zahl der Vollgeschosse|Vollgeschoss(?:e|zahl|igkeit)?)${KEYWORD_TAIL}${CONNECTIVE}\\s*([0-9]{1,2}|[IVXLC]+)\\b`,
            'gi',
        ),
        keyword: /Vollgeschoss(?:e|zahl|igkeit)?/gi,
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
        keyword: /Vollgeschoss(?:e|zahl|ig)?/gi,
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

    // ── INSTRUMENT ATTRIBUTION ────────────────────────────────────────────────
    // Added because the REAL corpus forced it, not from theory. Running the parser
    // over the full 209-page Berlin 8-30 Begründung showed it happily reading GRZ
    // values of 0,3 · 0,4 · 0,8 · 0,39 out of one document, all cited, all correct
    // as READINGS, and only one of them the plan's binding Festsetzung (0,4).
    //
    // German planning law marks the difference with specific verbs, and the
    // distinction is legally exact:
    //   • "festgesetzt" / "begrenzt auf"  → §9 BauGB — THIS plan binds. The value.
    //   • "dargestellt"                   → §5 BauGB — a PREPARATORY instrument
    //                                        (FNP / Baunutzungsplan) merely DEPICTS.
    //   • "Überschreitung … §19 Abs. 4"   → a permitted OVERRUN ceiling for
    //                                        Garagen/Nebenanlagen, never the base.
    //   • "rechnerische GRZ"              → a figure the author COMPUTED to describe
    //                                        an existing building, not a rule.
    //
    // ⚠ WHY THIS MATTERS MORE THAN A PARSING NICETY. On 8-30 the un-attributed
    // reading yields GRZ 0,8 (the §19(4) overrun) or 0,3 (the superseded 1958/60
    // Baunutzungsplan) where the binding value is 0,4 — a 2× error on buildable
    // footprint in one direction and a 25% understatement in the other. This is the
    // L-616 "solid overstates on partial data" class arriving through the parser.
    {
        id: 'de-dargestellt-not-festgesetzt',
        // "…wird ein Allgemeines Wohngebiet mit einer GRZ von 0,3 … dargestellt."
        pattern: /\bdargestellt\b|\bAusweisungen\b|\bFlächennutzungsplan\b|\bBaunutzungsplan\b/gi,
        // …but not when the same sentence states a binding Festsetzung.
        unless: /\bfestgesetzt|\bfestsetz|\bbegrenzt\b/gi,
        detail:
            'Value is DEPICTED (dargestellt) by a preparatory instrument — FNP (§5 BauGB) or the legacy Baunutzungsplan — not FESTGESETZT (§9 BauGB) by this B-Plan. It is another instrument’s number.',
    },
    {
        id: 'de-ueberschreitung-19-4',
        // "…überschritten werden darf, das einer GRZ von 0,8 entspricht."
        //
        // ⚠ NARROWLY SCOPED, and it has to be. A first, broader version matched the
        // bare verb `überschreiten` and immediately mis-fired on
        // "Die Gebäudehöhe darf 18 m nicht überschreiten" — which is the STANDARD
        // binding phrasing for a height Festsetzung, not an overrun at all. The
        // §19(4) allowance is specifically about the GRZ / Grundfläche, so the
        // pattern requires either the explicit article reference or the overrun
        // noun/participle CO-OCCURRING with a coverage term.
        pattern:
            /§\s*19\s*Abs\.?\s*4|(?:Überschreitung|überschritten|überschreiten)[^.]{0,90}(?:GRZ|Grundflächenzahl|Grundfläche)|(?:GRZ|Grundflächenzahl|Grundfläche)[^.]{0,90}(?:Überschreitung|überschritten|überschreiten)/gi,
        // ⚠ The escape must require the Festsetzung term to actually CARRY A VALUE.
        // A first version matched any "festgesetzte <term>", which let Berlin 8-30
        // p47 through — "…§ 14 BauNVO die FESTGESETZTE GRUNDFLÄCHE bis zu einem Maß
        // zu überschreiten, das einer GRZ von 0,8 entspricht" — a sentence that
        // names the festgesetzte Grundfläche only to say what may EXCEED it. The
        // trailing "von <digit>" is what distinguishes "the Festsetzung is 0,4" from
        // "the Festsetzung may be exceeded".
        //
        // The second alternative is the German idiom that separates a BINDING CAP
        // from an OVERRUN: an ordinance that says a value "darf … NICHT
        // überschreiten" is setting the limit; one that says something may "zu
        // überschreiten" / "überschritten werden" is granting permission to exceed
        // it. The presence of `nicht` flips the meaning, so it must veto the reject.
        unless: /festgesetzte[nrs]?\s+(?:GRZ|GFZ|Grundflächenzahl|Geschossflächenzahl)\s+von\s+\d|nicht\s+(?:zu\s+)?überschreiten/gi,
        detail:
            'Value is the §19(4) BauNVO OVERRUN ceiling (Garagen/Nebenanlagen may exceed the GRZ up to this), not the base Festsetzung. Using it as the GRZ overstates buildable footprint.',
    },
    {
        id: 'de-rechnerisch',
        // "…entspricht die zulässige Überbauung einer rechnerischen GRZ von 0,39."
        pattern: /rechnerisch\w*|ergibt sich rechnerisch/gi,
        detail:
            'A COMPUTED descriptive figure (rechnerische GRZ) characterising existing or permitted building, not a Festsetzung.',
    },
];

/**
 * Phrases meaning "this parameter IS regulated, but its value is not in the prose".
 * German B-Plan Festsetzungen constantly delegate the number to the Planzeichnung /
 * Nutzungsschablone — the drawing carries the Baugrenze, the Nutzungsschablone the
 * GRZ/GFZ/Z cell. A parcel whose GFZ "ergibt sich aus der Planzeichnung" is NOT a
 * parcel with no GFZ; treating the two alike is the silent-empty bug class
 * (L-422/457/467/469), and here it would send a consumer looking in the wrong
 * document. This is the text-parse twin of `gates/algorithmDetector.ts`.
 */
const RULE_REFERENCES: readonly RuleReferencePattern[] = [
    {
        id: 'de-planzeichnung',
        pattern:
            /(?:ergib\w*|ergeben)\s+sich\s+aus\s+(?:der\s+)?(?:Planzeichnung|zeichnerischen\s+Festsetzung(?:en)?|Nutzungsschablone)/gi,
        rule: 'on-drawing',
        detail: 'Value is delegated to the Planzeichnung / Nutzungsschablone — read the drawing, not the prose.',
    },
    {
        id: 'de-planzeichnung-entnehmen',
        pattern:
            /(?:ist|sind)\s+(?:der\s+)?(?:Planzeichnung|Nutzungsschablone)\s+zu\s+entnehmen/gi,
        rule: 'on-drawing',
        detail: 'Value is stated on the Planzeichnung / Nutzungsschablone, not in the text.',
    },
    {
        id: 'de-zeichnerisch-festgesetzt',
        pattern: /(?:plan)?zeichnerisch\s+festgesetzt/gi,
        rule: 'on-drawing',
        detail: 'Festsetzung is graphical (zeichnerisch) — the number lives on the plan sheet.',
    },
    {
        id: 'de-siehe-planzeichnung',
        pattern: /(?:siehe|vgl\.?|gemäß|entsprechend)\s+(?:der\s+)?(?:Planzeichnung|Nutzungsschablone)/gi,
        rule: 'on-drawing',
        detail: 'Text points at the Planzeichnung / Nutzungsschablone for the value.',
    },
    {
        id: 'de-errechnet-sich',
        pattern: /(?:errechnet|berechnet|bemisst)\s+sich\s+(?:aus|nach)/gi,
        rule: 'derived',
        detail: 'Value is DERIVED by applying other parameters — the ordinance states no number.',
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
    ruleReferences: RULE_REFERENCES,
    findSection: findGermanSection,
};
