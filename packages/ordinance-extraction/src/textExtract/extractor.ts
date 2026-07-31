// @pryzm/ordinance-extraction — the SHARED, jurisdiction-agnostic TEXT-PARSE core.
//
// `extractRules(text, grammar, source)` parses born-digital ordinance TEXT into
// cited `ExtractedRule[]`. It is PURE (no fetch, no I/O beyond one OTel span),
// injectable (the grammar is a parameter), and NEVER throws — every failure is a
// typed `ExtractionRefusal`. It owns everything shared across jurisdictions:
// sentence segmentation, locale-correct number parsing, reject-scoping, citation
// resolution, the honest unknown/reject accounting, and stamping the permanent
// `pipeline-extracted-unverified` tier. A jurisdiction supplies ONLY the grammar.
//
// One OTel span wraps the entry point (mirrors `pipeline.ts` / C58 §1.10 hygiene),
// using the default no-op tracer so the core does no I/O of its own.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { type DomainConfidence } from '@pryzm/schemas';
import { type ExtractableField, type NonNumericRule } from '../types.js';
import { parseLocaleNumber } from '../gates/localeGate.js';
import { PIPELINE_TIER } from '../confidence.js';
import {
    type ExtractedRule,
    type ExtractionRefusal,
    type FieldMatcher,
    type FieldOutcome,
    type FieldUnknownReason,
    type JurisdictionGrammar,
    type MatchPayload,
    type RejectedMatch,
    type RuleCitation,
    type RuleReferencePattern,
    type TextExtractionOutcome,
    type TextExtractionSuccess,
    type TextSource,
} from './types.js';

const tracer = trace.getTracer('pryzm.ordinance-extraction');

/**
 * Split ordinance text into locator SEGMENTS. Deliberately conservative: split on
 * line breaks and on sentence-final punctuation followed by whitespace + an
 * upper-case/§ start, so a "sowie"-joined clause ("GRZ von 0,3 sowie … GFZ von
 * 0,9") stays ONE segment (both values cite the same sentence) while a separate
 * Orientierungswerte sentence stays its own segment (reject-scoped independently).
 * A comma-decimal (`0,9`) and an abbreviation dot (`Abs.`) never trigger a split.
 */
function segment(text: string): string[] {
    return text
        .split(/\r?\n|(?<=[.!?])\s+(?=[A-ZÄÖÜ§])/u)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** Clone a matcher's global regex so its `lastIndex` never leaks between calls. */
function freshGlobal(re: RegExp): RegExp {
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    return new RegExp(re.source, flags);
}

/** The C62 domain-confidence rollup every pipeline rule carries (never-checked). */
function pipelineDomainConfidence(): DomainConfidence {
    return {
        tier: PIPELINE_TIER,
        score: null,
        validationState: 'not-checked',
    };
}

/** Build the resolved citation for a value — document + sentence are mandatory. */
function resolveCitation(
    source: TextSource,
    sentence: string,
    grammar: JurisdictionGrammar,
): RuleCitation {
    return {
        document: source.document,
        page: source.page ?? null,
        section: grammar.findSection ? grammar.findSection(sentence) : null,
        sentence,
    };
}

/** Assemble one `ExtractedRule` from a matcher payload — stamps the honesty tier. */
function toRule(
    matcher: FieldMatcher,
    payload: MatchPayload,
    citation: RuleCitation,
): ExtractedRule {
    return {
        field: matcher.field,
        value: payload.value,
        unit: matcher.unit,
        ...(payload.densityScope !== undefined ? { densityScope: payload.densityScope } : {}),
        ...(payload.measurement !== undefined ? { measurement: payload.measurement } : {}),
        citation,
        confidence: PIPELINE_TIER, // LOCK 1 — never higher (L-449 / ADR-0269).
        fieldProvenance: 'pipeline-extracted',
        domainConfidence: pipelineDomainConfidence(),
        rawText: payload.rawText,
        matcherId: matcher.id,
    };
}

/** A stable dedupe key so the same value cited to the same sentence emits once. */
function ruleKey(r: ExtractedRule): string {
    return `${r.field}|${r.value}|${r.citation.sentence}`;
}

/**
 * Parse ordinance TEXT into cited buildable-envelope rules under a jurisdiction
 * grammar. NEVER throws — returns a `TextExtractionSuccess` or a typed
 * `ExtractionRefusal`.
 *
 * Honesty guarantees (each is a test):
 *   - every emitted rule carries a resolved citation (document + exact sentence);
 *   - every emitted rule is `pipeline-extracted-unverified` (LOCK 1);
 *   - a field the grammar sought but did not find → a `FieldOutcome` unknown,
 *     never a fabricated value and never a silent omission;
 *   - a value inside a reject sentence (Orientierungswerte / BauNVO §17) is dropped
 *     to `rejected` with the field marked `rejected-not-parcel-rule`.
 */
export function extractRules(
    text: unknown,
    grammar: JurisdictionGrammar,
    source: TextSource,
): TextExtractionOutcome {
    const span = tracer.startSpan('pryzm.ordinance-extraction.extractRules');
    try {
        span.setAttribute('pryzm.jurisdiction', grammar.jurisdiction);

        // ── Typed refusals (never a throw). ──
        if (typeof text !== 'string') {
            span.setAttribute('pryzm.refusal', 'invalid-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse('invalid-input', 'Ordinance text must be a string.');
        }
        if (text.trim() === '') {
            span.setAttribute('pryzm.refusal', 'empty-input');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse('empty-input', 'Ordinance text was empty or whitespace only.');
        }
        if (!source.document || source.document.trim() === '') {
            span.setAttribute('pryzm.refusal', 'no-document-id');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse(
                'no-document-id',
                'No source document id — a value with no citeable document must never be emitted.',
            );
        }
        if (grammar.matchers.length === 0) {
            span.setAttribute('pryzm.refusal', 'no-matchers');
            span.setStatus({ code: SpanStatusCode.OK });
            return refuse('no-matchers', `Grammar "${grammar.jurisdiction}" defines no field matchers.`);
        }

        const parseNumber = (raw: string): number | null => parseLocaleNumber(raw, grammar.locale);
        const segments = segment(text);

        const rules: ExtractedRule[] = [];
        const seen = new Set<string>();
        const rejected: RejectedMatch[] = [];
        // Track why each field ended without a rule (worst-known reason per field).
        const emitted = new Set<ExtractableField>();
        const fieldReason = new Map<ExtractableField, ReasonNote>();
        const ruleReferences = grammar.ruleReferences ?? [];

        for (const sentence of segments) {
            // Is this whole sentence a non-binding reference (reject-scoped)?
            const reject = grammar.rejectPatterns.find((rp) =>
                freshGlobal(rp.pattern).test(sentence),
            );
            // Does this sentence say "the value is a rule / on the drawing"?
            const ruleRef = ruleReferences.find((rr) => freshGlobal(rr.pattern).test(sentence));
            // Which fields produced a value IN THIS SENTENCE (so a rule reference in
            // the same sentence does not overwrite a real, stated number).
            const valuedHere = new Set<ExtractableField>();

            for (const matcher of grammar.matchers) {
                const re = freshGlobal(matcher.pattern);
                for (const match of sentence.matchAll(re)) {
                    const payload = matcher.interpret(match, { parseNumber });
                    if (payload === null) {
                        // Matched the keyword but the token was not a number → the
                        // field is present-but-unvalued here (drawing/algorithm ref).
                        noteReason(fieldReason, matcher.field, {
                            reason: 'stated-as-rule-not-value',
                            detail: 'Field matched but the captured token was not a parseable number.',
                        });
                        continue;
                    }
                    valuedHere.add(matcher.field);
                    if (reject) {
                        rejected.push({
                            field: matcher.field,
                            rawText: payload.rawText,
                            sentence,
                            rejectId: reject.id,
                        });
                        noteReason(fieldReason, matcher.field, {
                            reason: 'rejected-not-parcel-rule',
                            detail: reject.detail,
                        });
                        continue;
                    }
                    const citation = resolveCitation(source, sentence, grammar);
                    const rule = toRule(matcher, payload, citation);
                    const key = ruleKey(rule);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    rules.push(rule);
                    emitted.add(matcher.field);
                }
            }

            // ── Rule references: "Die Zahl der Vollgeschosse ergibt sich aus der
            // Planzeichnung." The field IS regulated; its value is simply not in the
            // prose. Recording that as `not-stated-in-text` would let a real,
            // differently-shaped answer masquerade as silence.
            if (ruleRef) noteRuleReference(fieldReason, grammar.matchers, sentence, valuedHere, ruleRef);
        }

        const unknowns = buildUnknowns(grammar.matchers, emitted, fieldReason);

        span.setAttribute('pryzm.rules', rules.length);
        span.setAttribute('pryzm.unknowns', unknowns.length);
        span.setAttribute('pryzm.rejected', rejected.length);
        span.setStatus({ code: SpanStatusCode.OK });

        const result: TextExtractionSuccess = {
            ok: true,
            jurisdiction: grammar.jurisdiction,
            locale: grammar.locale,
            document: source.document,
            rules,
            unknowns,
            rejected,
        };
        return result;
    } catch (err) {
        // The core NEVER throws — an unexpected error is contained as a refusal.
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        return refuse('internal-error', `Contained error: ${(err as Error).message}`);
    } finally {
        span.end();
    }
}

/** What we learned about a field that produced no rule, with its explanation. */
interface ReasonNote {
    readonly reason: FieldUnknownReason;
    readonly detail: string;
    readonly rule?: NonNumericRule;
    readonly ruleReferenceId?: string;
}

/**
 * Reason strength — a MORE SPECIFIC finding always wins over a vaguer one, so a
 * field that is silent in sentence 1 and rule-referenced in sentence 7 reports the
 * rule reference, never "not stated".
 */
const REASON_RANK: Readonly<Record<FieldUnknownReason, number>> = Object.freeze({
    'not-stated-in-text': 0,
    'stated-as-rule-not-value': 1,
    'rejected-not-parcel-rule': 2,
});

/** Record the "worst known" reason a field lacked a rule (reject > rule > absent). */
function noteReason(
    map: Map<ExtractableField, ReasonNote>,
    field: ExtractableField,
    note: ReasonNote,
): void {
    const prev = map.get(field);
    if (prev === undefined || REASON_RANK[note.reason] > REASON_RANK[prev.reason]) {
        map.set(field, note);
    }
}

/**
 * A sentence carried a rule reference ("…ergibt sich aus der Planzeichnung"). Mark
 * every field the sentence NAMES but did not VALUE as `stated-as-rule-not-value`,
 * carrying which kind of rule it is. A field that WAS valued in this same sentence
 * is untouched — a stated number outranks a co-located rule phrase.
 */
function noteRuleReference(
    map: Map<ExtractableField, ReasonNote>,
    matchers: readonly FieldMatcher[],
    sentence: string,
    valuedHere: ReadonlySet<ExtractableField>,
    ruleRef: RuleReferencePattern,
): void {
    for (const matcher of matchers) {
        if (matcher.keyword === undefined) continue;
        if (valuedHere.has(matcher.field)) continue;
        if (!freshGlobal(matcher.keyword).test(sentence)) continue;
        noteReason(map, matcher.field, {
            reason: 'stated-as-rule-not-value',
            detail: ruleRef.detail,
            rule: ruleRef.rule,
            ruleReferenceId: ruleRef.id,
        });
    }
}

/** Every distinct field the grammar CAN populate, in first-seen order. */
function grammarFields(matchers: readonly FieldMatcher[]): ExtractableField[] {
    const out: ExtractableField[] = [];
    for (const m of matchers) if (!out.includes(m.field)) out.push(m.field);
    return out;
}

/** Fields the grammar sought but did not emit, each with an honest reason. */
function buildUnknowns(
    matchers: readonly FieldMatcher[],
    emitted: ReadonlySet<ExtractableField>,
    fieldReason: ReadonlyMap<ExtractableField, ReasonNote>,
): FieldOutcome[] {
    const out: FieldOutcome[] = [];
    for (const field of grammarFields(matchers)) {
        if (emitted.has(field)) continue;
        const note = fieldReason.get(field) ?? {
            reason: 'not-stated-in-text' as const,
            detail: 'Field not stated anywhere in this text.',
        };
        out.push({
            field,
            reason: note.reason,
            detail: note.detail,
            ...(note.rule !== undefined ? { rule: note.rule } : {}),
            ...(note.ruleReferenceId !== undefined
                ? { ruleReferenceId: note.ruleReferenceId }
                : {}),
        });
    }
    return out;
}

/** Build a typed refusal. */
function refuse(reason: ExtractionRefusal['reason'], detail: string): ExtractionRefusal {
    return { ok: false, reason, detail };
}
