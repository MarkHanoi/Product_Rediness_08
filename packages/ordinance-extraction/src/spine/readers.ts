// @pryzm/ordinance-extraction — the INTERPRET stage: three readers, one contract.
//
// A reader turns {CanonicalDocument, zone context, field} into AT MOST ONE
// candidate value plus the VERBATIM span it came from — or into a typed reason why
// there is none. It never returns a bare number and it never returns `undefined`
// for "nothing": `NothingFoundReason` is mandatory when there is no value, because
// the whole point of this spine is that "the ordinance is silent", "we could not
// read the grid" and "the model made it up" are three different answers.
//
// ⭐ RETRIEVE-THEN-VERIFY (COMPASS's pattern, spec §20's rule): where a MODEL is
// involved it returns a SPAN, never a number. The span is containment-verified
// against the source, and only then does deterministic code parse a number out of
// it. `createRetrievalReader` is that contract; the model itself is an injected
// PORT, exactly like `DualPassExtractor`.
//
// COUNTRY-AGNOSTIC (control 5). The table SCHEMA, the GRAMMAR, the qualifier
// LEXICON and the stop-word list are all parameters supplied by a country adapter.
// Nothing in this file knows a German, French or Italian word.

import { type LandBasis } from '@pryzm/schemas';
import { type ExtractableField, type GateResult, type NonNumericRule } from '../types.js';
import { type NumberLocale, parseLocaleNumber } from '../gates/localeGate.js';
import { containmentGate, type StopWords } from '../gates/containment.js';
import { type QualifierLexicon } from '../gates/qualifierSurvival.js';
import { extractRules } from '../textExtract/extractor.js';
import { type HeightMeasurement, type JurisdictionGrammar } from '../textExtract/types.js';
import { type CanonicalTable } from '../ingest/types.js';
import { type CanonicalDocumentBuild } from '../structure/canonicalDocument.js';
import {
    type ClaimEvidence,
    type ExtractionMethod,
    type NothingFoundReason,
    type ZoneContext,
} from './types.js';

/** What a reader produces for ONE field. */
export interface ReaderOutcome {
    /** The parsed value, or null when there is none (then `reason` says why). */
    readonly value: number | null;
    /** Present IFF the ordinance states a RULE rather than a number. */
    readonly rule?: NonNumericRule;
    /** The exact source substring the value was read from (locale gate input). */
    readonly rawText: string;
    /** The evidence, present whenever there was anything to look at. */
    readonly evidence: ClaimEvidence | null;
    /** Null when a value was produced; a typed reason otherwise. */
    readonly reason: NothingFoundReason | null;
    readonly detail: string;
    /** Reader-level gate verdicts (containment). Carried onto the claim. */
    readonly gates: readonly GateResult[];
    /**
     * Every text seat the emitted claim WILL carry — the input to the
     * qualifier-survival gate. A reader that finds a remarks column, an exception
     * clause or a force flag puts its verbatim text here; the gate then checks that
     * nothing in the span was left out of it.
     */
    readonly qualifierCarriers: readonly string[];
    /** R5 normative force, mirrored verbatim from the source, or null. */
    readonly normativeForce: string | null;
    /** R2 value basis, carried verbatim, or undefined when the source states none. */
    readonly valueBasis?: { readonly scheme: string; readonly code: string };
    /** The unit the reader believes it read, for the claim's `unit`. */
    readonly unit: string | null;
    /** The measurement datum for a height, when the source states one. */
    readonly measurement?: HeightMeasurement;
    /** The denominator for a ratio, when the source states one. */
    readonly landBasis?: LandBasis;
}

/** The reader contract. Synchronous readers are allowed; the spine awaits either way. */
export interface ClaimReader {
    /** Stable id recorded as `ClaimEvidence.reader`. */
    readonly id: string;
    readonly method: ExtractionMethod;
    /** Which fields this reader can even attempt. */
    readonly fields: readonly ExtractableField[];
    read(
        build: CanonicalDocumentBuild,
        zone: ZoneContext,
        field: ExtractableField,
    ): ReaderOutcome | Promise<ReaderOutcome>;
}

/* ══════════════════════════ 1 · TABLE RECONSTRUCTION ═══════════════════════ */

/** One column of a zoning table, bound to an envelope parameter. Country DATA. */
export interface TableColumnBinding {
    /** Matches the HEADER cell text (e.g. `/^FH$/`). */
    readonly headerPattern: RegExp;
    readonly field: ExtractableField;
    /** The unit the column's numbers carry (`'m'`, `null` for a count/ratio). */
    readonly unit: string | null;
    /** Height datum, where the column is a height (Fassadenhöhe → `'building'`). */
    readonly measurement?: HeightMeasurement;
    /** Denominator, where the column is a ratio. */
    readonly landBasis?: LandBasis;
    /** R2 value-basis qualifier carried verbatim from the source's own vocabulary. */
    readonly valueBasis?: { readonly scheme: string; readonly code: string };
}

/** A jurisdiction's zoning-table shape. Supplied by an adapter, never invented here. */
export interface ZoneTableSchema {
    /** Stable id, e.g. `ch-lu-bzr-anhang1`. */
    readonly id: string;
    readonly language: string;
    /** Matches the header cell of the ROW KEY column (Luzern: `/^Nr\.$/`). */
    readonly keyColumn: RegExp;
    readonly columns: readonly TableColumnBinding[];
    /**
     * Columns whose text is a QUALIFIER carrier rather than a value (Luzern:
     * "Weitere Bestimmungen" — Gestaltungsplanpflicht, "höchstens", article
     * cross-references). Their verbatim text becomes a qualifier seat.
     */
    readonly qualifierColumns: readonly RegExp[];
    readonly locale: NumberLocale;
    readonly lexicon: QualifierLexicon;
    readonly stopWords?: StopWords;
}

/** Index of the first header cell matching a pattern, or -1. */
function headerIndex(header: readonly string[], pattern: RegExp): number {
    const re = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
    return header.findIndex((h) => re.test(h.trim()));
}

/** Render a row as labelled, VERBATIM cells — the span a human reviews. */
function renderRow(header: readonly string[], row: readonly string[]): string {
    const parts: string[] = [];
    row.forEach((cell, i) => {
        if (cell.trim() === '') return;
        parts.push(`${(header[i] ?? `col${i}`).trim()}=${cell.trim()}`);
    });
    return parts.join(' | ');
}

/**
 * Read a value out of a CONFIDENTLY RECONSTRUCTED grid.
 *
 * ⛔ It reads `CanonicalTable.rows` and nothing else. Layer 3 empties that array
 * whenever the grid was not trusted, so a table this reader can see is a table
 * whose columns were resolved by geometry. That is the entire defence against the
 * Luzern 7x overstatement, and it works by there being NOTHING TO READ rather than
 * by a check that could be forgotten.
 */
export function createTableReader(schema: ZoneTableSchema): ClaimReader {
    const fields = [...new Set(schema.columns.map((c) => c.field))];
    return {
        id: schema.id,
        method: 'table-reconstruction',
        fields,
        read(build, zone, field): ReaderOutcome {
            const binding = schema.columns.find((c) => c.field === field);
            if (binding === undefined) {
                return nothing('no-reader-for-field', `Table schema "${schema.id}" binds no column to ${field}.`);
            }

            // Only CONFIDENT tables are visible: `rows` is empty on the rest.
            const withheld = build.document.tables.filter(
                (t) => !t.confident && t.header !== null && headerIndex(t.header, schema.keyColumn) >= 0,
            );

            for (const table of build.document.tables) {
                if (table.header === null || table.rows.length === 0) continue;
                const keyCol = headerIndex(table.header, schema.keyColumn);
                if (keyCol < 0) continue;
                const valueCol = headerIndex(table.header, binding.headerPattern);
                if (valueCol < 0) continue;

                const row = table.rows.find((r) => (r[keyCol] ?? '').trim() === zone.zoneKey);
                if (row === undefined) continue;

                const evidence = tableEvidence(build, table, row, zone, schema, valueCol);
                const cellText = (row[valueCol] ?? '').trim();
                // ⭐ The VALUE CELL is itself a qualifier carrier. Luzern row 6 reads
                // "35 (höchstens)" in the FH column: the ceiling lives in the cell,
                // not in the remarks column, and `claimProducer` copies this text
                // verbatim into `confidence.note` — a seat INSIDE the frozen record.
                // Without this the bound would be visible to a human and invisible
                // to the record, which is precisely what control 8 forbids.
                const carriers = [
                    ...(cellText === '' ? [] : [cellText]),
                    ...qualifierCarriersOf(table.header, row, schema),
                ];

                if (cellText === '') {
                    return {
                        ...nothing(
                            'not-in-document',
                            `Zone "${zone.zoneKey}" is present on page ${table.page} but its ` +
                                `"${table.header[valueCol]}" cell is EMPTY. An empty cell is the ` +
                                `ordinance saying nothing here — it is not 0 and it is not unlimited.`,
                        ),
                        evidence,
                        qualifierCarriers: carriers,
                    };
                }

                // ⭐ THE VALUE IS PARSED BY DETERMINISTIC CODE FROM A CELL WHOSE
                // COLUMN WAS RESOLVED BY GEOMETRY. Nothing interprets anything.
                const numeric = cellText.match(/[+-]?\d[\d.,]*/u)?.[0] ?? '';
                const value = numeric === '' ? null : parseLocaleNumber(numeric, schema.locale);
                if (value === null) {
                    return {
                        ...nothing(
                            'span-not-parseable',
                            `Cell "${table.header[valueCol]}" of zone "${zone.zoneKey}" reads ` +
                                `"${cellText}", which holds no parseable number under locale ` +
                                `"${schema.locale}". Reported, never rounded or guessed.`,
                        ),
                        evidence,
                        qualifierCarriers: carriers,
                    };
                }

                return {
                    value,
                    rawText: cellText,
                    evidence,
                    reason: null,
                    detail:
                        `Read "${cellText}" from column "${table.header[valueCol]}" of row ` +
                        `"${zone.zoneKey}" on page ${table.page}; the column was resolved by page ` +
                        `geometry (anchor x=${table.columnAnchors[valueCol]?.toFixed(1)}).`,
                    gates: [
                        {
                            gate: 'containment',
                            verdict: 'not-applicable',
                            detail:
                                'No span was RETRIEVED by a model — the cell text is the page’s own ' +
                                'positioned items, so there is no fabrication for containment to catch. ' +
                                'not-applicable is not a pass.',
                            token: 'containment:not-applicable',
                        },
                    ],
                    qualifierCarriers: carriers,
                    normativeForce: null,
                    ...(binding.valueBasis !== undefined ? { valueBasis: binding.valueBasis } : {}),
                    unit: binding.unit,
                    ...(binding.measurement !== undefined ? { measurement: binding.measurement } : {}),
                    ...(binding.landBasis !== undefined ? { landBasis: binding.landBasis } : {}),
                };
            }

            if (withheld.length > 0) {
                return nothing(
                    'table-not-reconstructed',
                    `The grid(s) carrying zone "${zone.zoneKey}" on page(s) ` +
                        `${withheld.map((t) => t.page).join(', ')} were NOT confidently reconstructed, so ` +
                        `their rows were withheld. The number may well be on the page; which COLUMN it ` +
                        `sits in is what could not be established, and guessing that is exactly the ` +
                        `7x overstatement this layer exists to prevent.`,
                );
            }
            return nothing(
                'zone-not-in-document',
                `No reconstructed table in this document has a row keyed "${zone.zoneKey}".`,
            );
        },
    };
}

function tableEvidence(
    build: CanonicalDocumentBuild,
    table: CanonicalTable,
    row: readonly string[],
    zone: ZoneContext,
    schema: ZoneTableSchema,
    valueCol: number,
): ClaimEvidence {
    return {
        span: renderRow(table.header ?? [], row),
        documentId: build.document.document,
        page: table.page,
        section: null,
        cell: `${(table.header ?? [])[valueCol] ?? `col${valueCol}`} @ row ${zone.zoneKey}`,
        method: 'table-reconstruction',
        reader: schema.id,
        digitisation: build.document.digitisation.digitisation,
    };
}

function qualifierCarriersOf(
    header: readonly string[],
    row: readonly string[],
    schema: ZoneTableSchema,
): string[] {
    const out: string[] = [];
    for (const pattern of schema.qualifierColumns) {
        const i = headerIndex(header, pattern);
        if (i >= 0 && (row[i] ?? '').trim() !== '') out.push(row[i]!.trim());
    }
    return out;
}

/* ═════════════════════════════ 2 · TEXT GRAMMAR ════════════════════════════ */

/**
 * Read a value out of PROSE with a deterministic `JurisdictionGrammar` — the path
 * that already existed (`textExtract/extractor.ts`) and that had never been called
 * from anything but a hand-run CLI. This wires it into the spine unchanged.
 */
export function createGrammarReader(
    grammar: JurisdictionGrammar,
    /**
     * ⚠ NO LONGER CONSULTED, and retained only so existing call sites keep
     * compiling. It became dead when the qualifier carriers stopped being the cited
     * sentence itself (see the correction below): the lexicon is applied ONCE, by
     * the spine, against `SpineRequest.lexicon`, and a reader-local copy could only
     * ever disagree with it. Named with a leading underscore so the compiler's
     * unused-parameter check keeps saying so out loud.
     */
    _lexicon: QualifierLexicon,
    stopWords?: StopWords,
): ClaimReader {
    const fields = [...new Set(grammar.matchers.map((m) => m.field))];
    return {
        id: `grammar:${grammar.jurisdiction}`,
        method: 'text-grammar',
        fields,
        read(build, _zone, field): ReaderOutcome {
            for (const page of build.document.pages) {
                if (page.chars === 0) continue;
                const outcome = extractRules(page.text, grammar, {
                    document: build.document.document,
                    page: page.pageNumber,
                });
                if (!outcome.ok) continue;

                const rule = outcome.rules.find((r) => r.field === field);
                if (rule !== undefined) {
                    const evidence: ClaimEvidence = {
                        span: rule.citation.sentence,
                        documentId: build.document.document,
                        page: page.pageNumber,
                        section: rule.citation.section,
                        cell: null,
                        method: 'text-grammar',
                        reader: `grammar:${grammar.jurisdiction}`,
                        digitisation: build.document.digitisation.digitisation,
                    };
                    return {
                        value: rule.value,
                        rawText: rule.rawText,
                        evidence,
                        reason: null,
                        detail: `Parsed by matcher "${rule.matcherId}" from a sentence on page ${page.pageNumber}.`,
                        gates: [
                            containmentGate({
                                source: page.text,
                                span: rule.citation.sentence,
                                digitisation: build.document.digitisation.digitisation,
                                ...(stopWords !== undefined ? { stopWords } : {}),
                            }),
                        ],
                        // ⛔ CORRECTED 2026-09-02 (lane E8-SPINE). This read
                        // `[rule.citation.sentence]`, with the comment "the cited
                        // sentence IS the qualifier seat for a prose read". BOTH
                        // halves were wrong, and together they made the control-8
                        // gate A RUBBER STAMP ON THE ENTIRE PROSE PATH:
                        //
                        //  1. The gate asks "is the qualifier found in the SPAN also
                        //     present in a CARRIER?" — and the span IS
                        //     `rule.citation.sentence`. Passing the same string as
                        //     its own carrier makes the answer YES by construction.
                        //     `flag` was UNREACHABLE here. A gate that cannot fail
                        //     is not a gate, and this one carried a control-8
                        //     citation while checking nothing.
                        //  2. The sentence does NOT "travel onto the claim as the
                        //     RASE requirement text" — `produceClaim` has no such
                        //     seat. It reaches `evidence.span` and (when it differs
                        //     from the value) a `confidence.note`, neither of which
                        //     is a typed qualifier seat.
                        //
                        // The carriers are therefore the claim's ACTUAL typed seats.
                        // A qualifier that reaches none of them has genuinely been
                        // lost, and now says so.
                        qualifierCarriers: [
                            ...(rule.measurement === undefined ? [] : [rule.measurement]),
                            ...(rule.landBasis === undefined ? [] : [rule.landBasis]),
                        ],
                        normativeForce: null,
                        unit: rule.unit === 'm' ? 'm' : rule.unit === 'm2' ? 'm²' : null,
                        ...(rule.measurement !== undefined ? { measurement: rule.measurement } : {}),
                        ...(rule.landBasis !== undefined ? { landBasis: rule.landBasis } : {}),
                    };
                }

                const unknown = outcome.unknowns.find((u) => u.field === field);
                if (unknown !== undefined && unknown.reason === 'stated-as-rule-not-value') {
                    return {
                        ...nothing('stated-as-rule', unknown.detail),
                        ...(unknown.rule !== undefined ? { rule: unknown.rule } : {}),
                    };
                }
            }
            return nothing(
                'not-in-document',
                `Grammar "${grammar.jurisdiction}" found no ${field} anywhere in this document's text.`,
            );
        },
    };
}

/* ═════════════════════ 3 · AI SPAN RETRIEVAL (the PORT) ════════════════════ */

/** One passage a retriever may be asked about. */
export interface SourcePassage {
    readonly page: number;
    readonly section: string | null;
    readonly text: string;
}

/** What the retriever is asked. */
export interface SpanRetrievalRequest {
    readonly documentId: string;
    readonly field: ExtractableField;
    readonly zone: ZoneContext;
    /** The candidate passages, already cheap-filtered by the spine. */
    readonly passages: readonly SourcePassage[];
}

/** What it must return: a QUOTE, never a number. */
export interface RetrievedSpan {
    /** VERBATIM text from the passage. Anything else fails the containment gate. */
    readonly text: string;
    readonly page: number;
    readonly section: string | null;
}

/**
 * The model PORT. ⛔ IT RETURNS SPANS, NOT VALUES — that signature is the
 * enforcement of spec §20 (*AI interprets, deterministic computes*): there is no
 * channel through which a model can hand this pipeline a number.
 *
 * The concrete adapter (routing through `ai-host` per C23, writing the AIArtefact)
 * is the CALLER's to supply, exactly as `DualPassExtractor` has always been.
 */
export interface SpanRetriever {
    /** Model id + version — recorded as `ClaimEvidence.reader`. */
    readonly id: string;
    retrieve(request: SpanRetrievalRequest): Promise<readonly RetrievedSpan[]>;
}

/** Cheap keyword pre-filter (COMPASS guard #1): never call a model on irrelevant text. */
export interface PassageFilter {
    /** Keywords for this field; a passage passes when it holds at least one. */
    readonly keywords: Partial<Record<ExtractableField, readonly RegExp[]>>;
    /** Maximum passages handed to the model. Default 8. */
    readonly maxPassages?: number;
}

/**
 * Retrieve-then-verify. The model quotes; containment checks the quote is really in
 * the document; only then does the grammar parse a number out of the quote.
 *
 * Bounded and honest about giving up: after `maxAttempts` spans have each failed
 * containment it stops, and it returns `span-not-contained` — COMPASS's "not
 * returning any extracted text due to high possibility of LLM hallucination",
 * kept as a typed reason instead of a log line.
 */
export function createRetrievalReader(config: {
    readonly retriever: SpanRetriever;
    readonly grammar: JurisdictionGrammar;
    readonly filter: PassageFilter;
    readonly lexicon: QualifierLexicon;
    readonly stopWords?: StopWords;
    readonly maxAttempts?: number;
}): ClaimReader {
    const maxAttempts = config.maxAttempts ?? 3;
    const fields = [...new Set(config.grammar.matchers.map((m) => m.field))];
    return {
        id: config.retriever.id,
        method: 'ai-span-retrieval',
        fields,
        async read(build, zone, field): Promise<ReaderOutcome> {
            const keywords = config.filter.keywords[field] ?? [];
            const passages: SourcePassage[] = [];
            for (const page of build.document.pages) {
                if (page.chars === 0) continue;
                if (keywords.length > 0 && !keywords.some((k) => new RegExp(k.source, k.flags.replace(/[gy]/g, 'i')).test(page.text))) {
                    continue;
                }
                passages.push({ page: page.pageNumber, section: null, text: page.text });
                if (passages.length >= (config.filter.maxPassages ?? 8)) break;
            }
            if (passages.length === 0) {
                return nothing(
                    'not-in-document',
                    `No passage in this document mentions ${field} — the cheap keyword filter ran ` +
                        `before any model call, so no model was asked.`,
                );
            }

            const spans = await config.retriever.retrieve({
                documentId: build.document.document,
                field,
                zone,
                passages,
            });
            if (spans.length === 0) {
                return nothing('no-span-retrieved', `Retriever "${config.retriever.id}" returned no span for ${field}.`);
            }

            const gates: GateResult[] = [];
            let attempts = 0;
            for (const span of spans) {
                if (attempts >= maxAttempts) break;
                attempts += 1;
                const source =
                    build.document.pages.find((p) => p.pageNumber === span.page)?.text ?? '';
                const gate = containmentGate({
                    source,
                    span: span.text,
                    digitisation: build.document.digitisation.digitisation,
                    ...(config.stopWords !== undefined ? { stopWords: config.stopWords } : {}),
                });
                gates.push(gate);
                if (gate.verdict !== 'pass') continue;

                // ⭐ The span is verified. NOW deterministic code parses it.
                const parsed = extractRules(span.text, config.grammar, {
                    document: build.document.document,
                    page: span.page,
                });
                if (!parsed.ok) continue;
                const rule = parsed.rules.find((r) => r.field === field);
                if (rule === undefined) continue;

                const evidence: ClaimEvidence = {
                    span: span.text,
                    documentId: build.document.document,
                    page: span.page,
                    section: span.section ?? rule.citation.section,
                    cell: null,
                    method: 'ai-span-retrieval',
                    reader: config.retriever.id,
                    digitisation: build.document.digitisation.digitisation,
                };
                return {
                    value: rule.value,
                    rawText: rule.rawText,
                    evidence,
                    reason: null,
                    detail:
                        `Model "${config.retriever.id}" QUOTED a span; containment verified it against ` +
                        `page ${span.page}; matcher "${rule.matcherId}" then parsed the number. The ` +
                        `model never produced a value.`,
                    gates,
                    qualifierCarriers: [span.text],
                    normativeForce: null,
                    unit: rule.unit === 'm' ? 'm' : rule.unit === 'm2' ? 'm²' : null,
                    ...(rule.measurement !== undefined ? { measurement: rule.measurement } : {}),
                    ...(rule.landBasis !== undefined ? { landBasis: rule.landBasis } : {}),
                };
            }

            const anyFlagged = gates.some((g) => g.verdict === 'flag');
            return {
                ...nothing(
                    anyFlagged ? 'span-not-contained' : 'span-not-parseable',
                    anyFlagged
                        ? `Every span "${config.retriever.id}" returned for ${field} FAILED containment ` +
                              `against the source document after ${attempts} attempt(s): the text is not ` +
                              `in the document. Refused — a fabricated quote must never become a number.`
                        : `Spans came back and were contained in the document, but none held a ` +
                              `${field} value the grammar could parse.`,
                ),
                gates,
            };
        },
    };
}

/* ═══════════════════════════════ shared ═══════════════════════════════════ */

function nothing(reason: NothingFoundReason, detail: string): ReaderOutcome {
    return {
        value: null,
        rawText: '',
        evidence: null,
        reason,
        detail,
        gates: [],
        qualifierCarriers: [],
        normativeForce: null,
        unit: null,
    };
}
