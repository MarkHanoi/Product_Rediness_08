// @pryzm/ordinance-extraction — the BORN-DIGITAL TEXT-PARSE path (Stage 2/3 for the
// `born-digital-text` image-regime, `ORDINANCE-EXTRACTION-PIPELINE.md` §1/§2).
//
// WHY THIS EXISTS, DISTINCT FROM THE DUAL-PASS LLM PORT
// ----------------------------------------------------
// The Berlin probe (jurisdictions/de/de-be/11000-berlin/PROBE-VERDICT-2026-07-31.md)
// PROVED that modern §13a Begründungen are born-digital German TEXT — the exact
// planning parameters ("(GRZ) von 0,3 sowie einer GFZ von 0,9") are read verbatim
// out of the PDF's Flate content streams. For that corpus the extraction is a
// TEXT-PARSE problem over legal German, NOT OCR and NOT a vision-LLM call. This
// module is that deterministic parser: ordinance TEXT + a jurisdiction GRAMMAR
// adapter → cited `ExtractedRule[]`. It complements (does not replace) the
// `DualPassExtractor` LLM port, which stays the path for scanned/faded corpora.
//
// HONESTY (the whole point — §CONTEXT-DATA-HONESTY, ADR-0269, L-449):
//   - NO value is emitted without a RESOLVED citation (document + exact sentence).
//   - EVERY emitted value ships at `pipeline-extracted-unverified` — strictly below
//     `estimated-ruleset`, NEVER auto-graduating (the L-449 human-verification gate).
//   - `unknown` where the text lacks the value — never inferred, rounded, or guessed.
//   - phrases that are NOT parcel rules (Orientierungswerte / BauNVO §17 national
//     table) are REJECTED with a recorded reason, never emitted as a value.
//
// Pure data + types: no I/O, no THREE, no DOM (P5-consistent; this is an L2 leaf).

import {
    type EnvelopeConfidence,
    type FieldProvenance,
    type DomainConfidence,
} from '@pryzm/schemas';
import { type ExtractableField, type NonNumericRule } from '../types.js';
import { type NumberLocale } from '../gates/localeGate.js';

/**
 * The physical unit of an extracted value — load-bearing, because `0,3` means a
 * fraction for GRZ but `12,5` means metres for a Traufhöhe:
 *   - `ratio`   — a dimensionless coefficient (GRZ→coverage, GFZ→FAR).
 *   - `storeys` — a count of full floors (Vollgeschosse).
 *   - `m`       — metres (Traufhöhe / Firsthöhe / Gebäudehöhe).
 *   - `m2`      — square metres (minimum parcel area).
 */
export type RuleUnit = 'ratio' | 'storeys' | 'm' | 'm2';

/**
 * For a floor-area RATIO, the denominator the ratio is measured against — the
 * German GFZ (Geschossflächenzahl) relates gross floor area to the PLOT area
 * (Grundstücksfläche), so it is a per-plot ratio, NOT a net/gross-lot FAR. Stamped
 * so a downstream envelope solver never silently treats a per-plot GFZ as a
 * per-net-lot FAR (the L-616 "which denominator" class of error):
 *   - `per-plot-area` — ratio ÷ Grundstücksfläche (German GFZ; Spanish edificabilitat neta on the parcel).
 *   - `per-net-area`  — ratio ÷ net developable area.
 *   - `per-gross-area`— ratio ÷ gross block/sector area (edificabilitat bruta).
 *   - `unknown`       — the text stated the ratio but not its basis (honest, never assumed).
 */
export type DensityScope = 'per-plot-area' | 'per-net-area' | 'per-gross-area' | 'unknown';

/**
 * For a HEIGHT, WHICH datum the metre value measures to — a Traufhöhe (eaves) and
 * a Firsthöhe (ridge) on the same building differ by a whole roof, so the datum is
 * not decoration (the terrain/rasant-datum honesty class, memory §TERRAIN-RASANT):
 *   - `eaves`    — Traufhöhe (TH): to the eaves line.
 *   - `ridge`    — Firsthöhe (FH): to the roof ridge.
 *   - `building` — Gebäudehöhe / Höhe baulicher Anlagen / Oberkante: overall building height.
 *   - `unknown`  — a height was stated but its datum was not (never assumed).
 */
export type HeightMeasurement = 'eaves' | 'ridge' | 'building' | 'unknown';

/**
 * A RESOLVED citation — the honesty invariant: a value that cannot point at an
 * exact sentence in an exact document is NEVER emitted. `document` + `sentence`
 * are always present (the locator a human verifies against, L-449); `section` and
 * `page` sharpen it when the grammar/source can supply them.
 */
export interface RuleCitation {
    /** The source document id / title the value was read from (never empty). */
    readonly document: string;
    /** 0-based page index if the source knew it, else null (honest unknown). */
    readonly page: number | null;
    /** The governing § / article the grammar found in the sentence, else null. */
    readonly section: string | null;
    /** The EXACT sentence the value was read from — the evidence a human reviews. */
    readonly sentence: string;
}

/**
 * ONE cited buildable-envelope rule parsed from ordinance TEXT. `value` is always a
 * real number — the ABSENCE of a value is not an `ExtractedRule` with `null`, it is
 * a `FieldOutcome` unknown (so "we found 0,3" and "the text is silent" can never be
 * the same value — §CONTEXT-DATA-HONESTY).
 *
 * ⚠ `confidence` is ALWAYS `pipeline-extracted-unverified` and `fieldProvenance`
 * ALWAYS `pipeline-extracted`. The parser cannot mint a higher tier — the only door
 * up is a recorded human sign-off (`confidence.ts` `canGraduateTier`, L-449).
 */
export interface ExtractedRule {
    /** The envelope field this rule sets (GRZ→maxCoverage, GFZ→maxFAR, …). */
    readonly field: ExtractableField;
    /** The resolved numeric value (locale-parsed; decimal-comma handled). */
    readonly value: number;
    /** The unit of `value`. */
    readonly unit: RuleUnit;
    /** For a FAR/ratio field: the denominator the ratio is measured against. */
    readonly densityScope?: DensityScope;
    /** For a height field: which datum the metres measure to. */
    readonly measurement?: HeightMeasurement;
    /** The resolved citation (document + sentence always; § + page when known). */
    readonly citation: RuleCitation;
    /** ALWAYS `pipeline-extracted-unverified` (the permanent bottom tier). */
    readonly confidence: EnvelopeConfidence;
    /** ALWAYS `pipeline-extracted` (machine, un-verified). */
    readonly fieldProvenance: FieldProvenance;
    /** The C62 rollup: tier = the confidence, validationState = `not-checked`. */
    readonly domainConfidence: DomainConfidence;
    /** The exact substring matched (kept for the locale gate + human review). */
    readonly rawText: string;
    /** The stable id of the grammar matcher that produced this (audit / debug). */
    readonly matcherId: string;
}

/**
 * WHY a field the grammar looked for produced no rule — the honest counterpart to a
 * silent empty. The extractor sees ONE document's text, so these reasons are
 * scoped to THIS text (they are NOT the pan-pipeline `UnknownReason`; the whole
 * document may still be one input among many):
 *   - `not-stated-in-text`      — the field simply does not appear in this text.
 *   - `stated-as-rule-not-value`— it appears but points at a drawing/algorithm
 *                                 ("ergibt sich aus der Planzeichnung") → no number.
 *   - `rejected-not-parcel-rule`— it appears in a sentence flagged as a non-binding
 *                                 reference (Orientierungswerte / BauNVO §17 table).
 */
export type FieldUnknownReason =
    | 'not-stated-in-text'
    | 'stated-as-rule-not-value'
    | 'rejected-not-parcel-rule';

/** A field the grammar sought but did not emit, with its honest reason. */
export interface FieldOutcome {
    readonly field: ExtractableField;
    readonly reason: FieldUnknownReason;
    /** A one-line human-readable explanation. */
    readonly detail: string;
    /**
     * Present IFF `reason` is `stated-as-rule-not-value`: WHICH kind of rule the
     * text pointed at. This is the load-bearing distinction — `on-drawing` tells a
     * downstream consumer the number exists but lives on the Planzeichnung (go read
     * the drawing), whereas `derived` says it is computed from other parameters.
     * Neither is "the ordinance is silent", and neither may become a number here
     * (the fabricated-number trap — `gates/algorithmDetector.ts`).
     */
    readonly rule?: NonNumericRule;
    /** The id of the rule-reference pattern that fired, when one did. */
    readonly ruleReferenceId?: string;
}

/** A match deliberately dropped by a reject pattern — kept as an audit trail. */
export interface RejectedMatch {
    readonly field: ExtractableField;
    /** The raw numeric text the reject prevented from becoming a value. */
    readonly rawText: string;
    /** The sentence it was found in. */
    readonly sentence: string;
    /** Which reject pattern fired (e.g. `orientierungswerte`, `baunvo-17`). */
    readonly rejectId: string;
}

/** The typed refusal reasons — the extractor NEVER throws, it returns one of these. */
export type RefusalReason =
    | 'invalid-input' // text was not a string
    | 'empty-input' // text was empty / whitespace only
    | 'no-document-id' // the source carried no document id → nothing citeable
    | 'no-matchers' // the grammar defined no field matchers
    | 'internal-error'; // an unexpected error was caught and contained

/** The extractor refused to parse — an honest, typed non-result (never a throw). */
export interface ExtractionRefusal {
    readonly ok: false;
    readonly reason: RefusalReason;
    readonly detail: string;
}

/** A successful parse — cited rules + honest unknowns + the reject audit trail. */
export interface TextExtractionSuccess {
    readonly ok: true;
    /** The jurisdiction the grammar served (e.g. `'de'`). */
    readonly jurisdiction: string;
    /**
     * The number locale the values were parsed under. Carried so a downstream
     * consumer can re-run the locale gate on `rawText` WITHOUT having to guess the
     * convention — guessing is exactly how the `2.000`→`2.0` 1000× trap fires.
     */
    readonly locale: NumberLocale;
    /** The source document the text came from (mirrors every citation). */
    readonly document: string;
    /** The cited rules parsed (each at `pipeline-extracted-unverified`). */
    readonly rules: readonly ExtractedRule[];
    /** Fields sought but not emitted, each with an honest reason (never silent). */
    readonly unknowns: readonly FieldOutcome[];
    /** Matches dropped by a reject pattern (audit trail). */
    readonly rejected: readonly RejectedMatch[];
}

/** The extractor's outcome — a success OR a typed refusal. Never a throw. */
export type TextExtractionOutcome = TextExtractionSuccess | ExtractionRefusal;

/** The document the text was pulled from — supplies the citation's document/page. */
export interface TextSource {
    /** The document id / title (RPUC idDocument, Berlin `grund_www` file, …). */
    readonly document: string;
    /** 0-based page index if known (born-digital text may be page-flat → null). */
    readonly page?: number | null;
}

/**
 * The parse payload a grammar matcher returns for one regex hit — or `null` to
 * decline (e.g. the captured token was not a parseable number).
 */
export interface MatchPayload {
    /** The resolved numeric value (the matcher owns roman-numeral / word parsing). */
    readonly value: number;
    /** The exact substring the value came from (for the locale gate + review). */
    readonly rawText: string;
    /** For a FAR/ratio field: the ratio's denominator basis. */
    readonly densityScope?: DensityScope;
    /** For a height field: the datum the metres measure to. */
    readonly measurement?: HeightMeasurement;
}

/** Helpers the core injects into a matcher's `interpret` (keeps grammars pure). */
export interface MatcherContext {
    /** Locale-correct number parse (decimal-comma for `de`/`es`), or null. */
    readonly parseNumber: (raw: string) => number | null;
}

/**
 * ONE field matcher in a jurisdiction grammar. `pattern` MUST be a global (`/g`)
 * regex; the core clones it per sentence so matcher state never leaks. `interpret`
 * turns each hit into a typed payload (owning any jurisdiction-specific parsing —
 * roman numerals, measurement disambiguation) or declines with `null`.
 */
export interface FieldMatcher {
    /** Stable id, e.g. `de-grz`, `de-gfz`, `de-vollgeschosse`, `de-traufhoehe`. */
    readonly id: string;
    /** The envelope field this matcher populates. */
    readonly field: ExtractableField;
    /** The unit of the values this matcher produces. */
    readonly unit: RuleUnit;
    /** A GLOBAL regex whose groups the `interpret` fn reads. */
    readonly pattern: RegExp;
    /**
     * A BARE keyword regex — the field's name with NO number attached ("GRZ",
     * "Geschossflächenzahl", "Traufhöhe"). Used ONLY to answer "does this sentence
     * TALK ABOUT this field?" when the sentence carries a rule reference but no
     * number, so `stated-as-rule-not-value` can be told apart from
     * `not-stated-in-text`. Optional: a grammar that omits it simply never reports
     * that finer reason (it degrades to `not-stated-in-text`, never to a value).
     */
    readonly keyword?: RegExp;
    /** Turn one regex hit into a typed payload, or `null` to decline. */
    readonly interpret: (match: RegExpMatchArray, ctx: MatcherContext) => MatchPayload | null;
}

/**
 * A sentence-level pattern meaning "this field is stated as a RULE, not a number"
 * — the text-parse twin of `gates/algorithmDetector.ts` (which guards the LLM
 * path). German Festsetzungen routinely say "Die Zahl der Vollgeschosse ergibt sich
 * aus der Planzeichnung": the parameter IS regulated, its value simply is not in
 * the prose. Reporting that as "not stated" would be a silent empty standing in
 * for a real, differently-shaped answer (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
 */
export interface RuleReferencePattern {
    /** Stable id recorded on the `FieldOutcome` (e.g. `de-planzeichnung`). */
    readonly id: string;
    /** The phrase that marks the sentence as a rule reference. */
    readonly pattern: RegExp;
    /** Which kind of non-numeric rule the phrase denotes. */
    readonly rule: NonNumericRule;
    /** One line a human reads: where the real value lives. */
    readonly detail: string;
}

/** A sentence-level pattern that marks text as NOT a binding parcel rule. */
export interface RejectPattern {
    /** Stable id recorded on a `RejectedMatch` (e.g. `orientierungswerte`). */
    readonly id: string;
    /** The pattern; if it matches a sentence, no value is emitted from that sentence. */
    readonly pattern: RegExp;
    /** One line explaining why this is not a parcel rule. */
    readonly detail: string;
}

/**
 * The per-jurisdiction GRAMMAR — the ONLY per-country surface of the text-parse
 * path (§1 of the pipeline spec: "the extraction core is shared; the grammar
 * differs"). A Phase-2 country adapter supplies exactly this object: field
 * matchers (patterns + field map + interpretation), reject patterns, a number
 * locale, and an optional section finder. Everything else is the shared core.
 */
export interface JurisdictionGrammar {
    /** ISO-ish jurisdiction id, e.g. `'de'`. */
    readonly jurisdiction: string;
    /** Human label, e.g. `'Germany (BauNVO Festsetzungen)'`. */
    readonly displayName: string;
    /** The source-text number locale (`de` = decimal-comma, dot-thousands). */
    readonly locale: NumberLocale;
    /** The field matchers, tried in order. */
    readonly matchers: readonly FieldMatcher[];
    /** Sentences matching ANY of these emit no value (recorded as rejected). */
    readonly rejectPatterns: readonly RejectPattern[];
    /**
     * Phrases meaning "the value is a rule / lives on the drawing". Optional; when
     * absent the extractor simply never distinguishes `stated-as-rule-not-value`.
     */
    readonly ruleReferences?: readonly RuleReferencePattern[];
    /** Find the governing § / article in a sentence, or null. Optional. */
    readonly findSection?: (sentence: string) => string | null;
}
