// GATE — n-gram CONTAINMENT: is the span the model claims to have quoted actually
// in the source document?
//
// ── PROVENANCE OF THIS ALGORITHM (verified at source, lane E8-SCOUT §2.1) ─────
// Ported from NREL / NatLabRockies **COMPASS** (`compass/utilities/ngrams.py`,
// `compass/validation/content.py`), BSD-3-Clause, confirmed at the LICENSE file.
// PORTED, NOT DEPENDED ON: COMPASS is Python ≥3.12 + poppler + tesseract + docling
// layout models + playwright + nltk + an LLM key. That is a second runtime, a
// second deploy target and a second supply chain for ~30 lines of pure logic
// (E8-SCOUT §2.4 — the answer was (a) port the patterns, and a Python dependency
// was never described as free).
//
// ⭐ THE PATTERN WORTH TAKING IS NOT THE NUMBER 0.9. It is that **the model returns
// a SPAN, never a number**: the LLM's job is RETRIEVAL, the deterministic side
// parses. That is spec §20 — *AI interprets, deterministic computes* — implemented.
// This gate is the verification half of that contract.
//
// ⛔ AND ITS HONEST LIMIT, WHICH MUST NOT BE IMPORTED BLINDLY. Containment is a
// one-directional measure: it catches text the model INVENTED; it can never catch
// text the model OMITTED. A model that quotes three words verbatim and silently
// drops "höchstens", "gilt nicht für", "sofern ein Gestaltungsplan vorliegt" or
// "sous réserve de" scores 1.0 — and for European ordinances that omission IS the
// overstatement (L-616 in a different costume; a direct breach of control 8).
// `gates/qualifierSurvival.ts` is the completeness check PRYZM writes itself and
// COMPASS does not have. NEITHER GATE IS SUFFICIENT ALONE. Run both.
//
// Pure: two strings + a threshold → verdict. No I/O.

import { type DigitisationClass } from '../ingest/types.js';
import { type GateResult } from '../types.js';

/**
 * Words dropped before forming n-grams. COMPASS uses NLTK's English stop-word
 * list; PRYZM has no NLTK and — control 5 — a stop-word list is per-LANGUAGE data,
 * not core logic, so the core takes it as a parameter and the country adapter
 * supplies it. The default is EMPTY, which makes the check STRICTER (every token
 * counts), never looser: a gate whose default silently ignores words would be a
 * gate that passes more fabrications than it should.
 */
export type StopWords = ReadonlySet<string>;

/** No stop-words — the strict default. */
export const NO_STOP_WORDS: StopWords = new Set<string>();

/** Split into sentences the way the text-parse path already does. */
function sentences(text: string): string[] {
    return text
        .split(/\r?\n|(?<=[.!?])\s+(?=[A-ZÄÖÜÀ-Þ§])/u)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Lower-case word tokens, punctuation stripped, stop-words removed. */
function tokens(sentence: string, stopWords: StopWords): string[] {
    return sentence
        .toLowerCase()
        .split(/[^\p{L}\p{N}.,]+/u)
        .map((t) => t.replace(/^[.,]+|[.,]+$/g, ''))
        .filter((t) => t.length > 0 && !stopWords.has(t));
}

/** Word n-grams of one sentence. */
function ngramsOf(sentence: string, n: number, stopWords: StopWords): string[] {
    const t = tokens(sentence, stopWords);
    if (t.length < n) return t.length > 0 ? [t.join(' ')] : [];
    const out: string[] = [];
    for (let i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n).join(' '));
    return out;
}

/**
 * The fraction of `test`'s stop-word-filtered word n-grams that appear in
 * `original`'s n-gram set. Returns 0 when `test` yields no n-grams — COMPASS's own
 * convention, and the safe one: an empty quote is not a verified quote.
 *
 * ⚠ Direction matters and is easy to get backwards. This asks "is everything the
 * model SAID also in the SOURCE" (precision against fabrication). It does NOT ask
 * "is everything in the source also in what the model said" (recall against
 * omission) — see the header, and `qualifierSurvival.ts`.
 */
export function sentenceNgramContainment(
    original: string,
    test: string,
    n = 4,
    stopWords: StopWords = NO_STOP_WORDS,
): number {
    const source = new Set<string>();
    for (const s of sentences(original)) for (const g of ngramsOf(s, n, stopWords)) source.add(g);

    const probe: string[] = [];
    for (const s of sentences(test)) probe.push(...ngramsOf(s, n, stopWords));
    if (probe.length === 0) return 0;

    let hits = 0;
    for (const g of probe) if (source.has(g)) hits += 1;
    return hits / probe.length;
}

/**
 * The containment threshold, as a function of HOW the text was obtained.
 *
 * ⭐ COMPASS keys this off `doc.attrs['from_ocr']` — drift tolerance is a function
 * of the INGESTION PATH, because OCR legitimately garbles characters and a quote
 * of garbled text cannot match a clean source exactly. PRYZM's
 * `DigitisationProfile.digitisation` already carries the equivalent fact and
 * currently gates nothing on it; this is that wiring.
 *
 * COMPASS's published values: 0.9 poppler-parsed, 0.75 OCR'd. `hybrid` — a
 * document with BOTH text and scanned pages, a class COMPASS does not model — takes
 * the OCR value, because the looser of two thresholds is the one that cannot
 * wrongly reject a true quote, and a wrongly-rejected quote is a lost claim while a
 * wrongly-accepted one is a fabricated number.
 */
export function containmentThresholdFor(digitisation: DigitisationClass): number {
    switch (digitisation) {
        case 'born-digital-text':
            return 0.9;
        case 'hybrid':
        case 'scanned':
            return 0.75;
        case 'empty':
            // No text at all: nothing can be contained in it, so nothing may pass.
            return 1.0;
    }
}

/** What the containment gate needs. */
export interface ContainmentInput {
    /** The SOURCE text the span is claimed to come from (a page, a section, a cell). */
    readonly source: string;
    /** The span the extractor returned, verbatim as it returned it. */
    readonly span: string;
    /** How the source text was obtained — sets the threshold. */
    readonly digitisation: DigitisationClass;
    /** Per-language stop-words from the country adapter (default: none = strict). */
    readonly stopWords?: StopWords;
    /** n-gram size. Default 4, COMPASS's value. */
    readonly n?: number;
    /** Threshold override; defaults to {@link containmentThresholdFor}. */
    readonly threshold?: number;
}

/**
 * Run the containment check.
 *   - `pass` — the span's n-grams are in the source at or above threshold.
 *   - `flag` — below threshold: the extractor produced text the source does not
 *              contain. NEVER auto-accept; this is the fabrication signal.
 *   - `not-applicable` — there is no span to check (nothing was retrieved). That
 *              is NOT a pass: "we did not check" and "we checked and it was fine"
 *              are different answers and this vocabulary keeps them apart.
 */
export function containmentGate(input: ContainmentInput): GateResult {
    if (input.span.trim() === '') {
        return {
            gate: 'containment',
            verdict: 'not-applicable',
            detail: 'No span was returned, so there was nothing to verify against the source.',
            token: 'containment:not-applicable',
        };
    }
    const n = input.n ?? 4;
    const threshold = input.threshold ?? containmentThresholdFor(input.digitisation);
    const score = sentenceNgramContainment(
        input.source,
        input.span,
        n,
        input.stopWords ?? NO_STOP_WORDS,
    );
    const ok = score >= threshold;
    const pct = (score * 100).toFixed(1);
    return {
        gate: 'containment',
        verdict: ok ? 'pass' : 'flag',
        detail: ok
            ? `Span is contained in the source: ${pct}% of its ${n}-grams found (threshold ` +
              `${(threshold * 100).toFixed(0)}%, ${input.digitisation}).`
            : `Span is NOT contained in the source: only ${pct}% of its ${n}-grams found ` +
              `(threshold ${(threshold * 100).toFixed(0)}%, ${input.digitisation}) — the extractor ` +
              `produced text the document does not contain. Refuse the span; do not parse it.`,
        token: ok ? 'containment:pass' : 'containment:flag',
    };
}
