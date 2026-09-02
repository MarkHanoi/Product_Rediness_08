// @pryzm/ordinance-extraction — THE SPINE: {document, zone context} → tier-4 CLAIMS.
//
// Six stages, `acquire → read → STRUCTURE → interpret → VERIFY → attribute`. Four
// already existed. This orchestrator composes them and is deliberately THIN — it
// contains no parsing, no geometry, no country knowledge and no tier arithmetic.
// Every one of those lives in a component that was already here or that this lane
// added beside it:
//
//   STRUCTURE  `structure/canonicalDocument.ts`   (built by this lane)
//   INTERPRET  `spine/readers.ts`                 (table / grammar / retrieval)
//   VERIFY     `pipeline.ts` + `gates/*`          (existing, now REACHED)
//   ATTRIBUTE  `spine/claimProducer.ts`           (the first AI_EXTRACTED producer)
//
// ── THE THREE OUTCOMES, AND WHY THEY MUST STAY THREE (control 9, at the pipeline
// level) ─────────────────────────────────────────────────────────────────────
//   `ran`     — the spine worked. `claims` MAY BE EMPTY, and every empty carries a
//               typed `NothingFoundReason`. This is a statement about the DOCUMENT.
//   `refused` — a legal gate said no before extraction (superseded instrument; a
//               regime like German §34/§35 that defines no numeric envelope). A
//               POSITIVE, cited product answer.
//   `failed`  — the spine could not run. This says NOTHING about the document.
// Collapsing any two of them is the `failure ≠ absence` defect this package was
// built to avoid, at its outermost seam.
//
// One OTel span wraps the entry point (C58 §1.10 / P8 hygiene). No other I/O.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    type DocumentExtractionPlan,
    runDocumentExtraction,
} from '../pipeline.js';
import { type DualPassExtractor, type FieldExtractionRequest } from '../gates/dualPassAgreement.js';
import { qualifierSurvivalGate, type QualifierLexicon } from '../gates/qualifierSurvival.js';
import { type NumberLocale } from '../gates/localeGate.js';
import { type FieldBounds } from '../gates/rangeSanityGate.js';
import { type RegimeGateResult } from '../gates/regimeGate.js';
import {
    type ExtractableField,
    type ExtractionCandidate,
    type GateResult,
} from '../types.js';
import { type OrdinanceDocumentRef } from '../enumerator.js';
import { type CanonicalDocumentBuild } from '../structure/canonicalDocument.js';
import { type ClaimReader, type ReaderOutcome } from './readers.js';
import { parameterPolarityFor, produceClaim } from './claimProducer.js';
import {
    type ClaimValidity,
    type DocumentClaimFailure,
    type DocumentClaimOutcome,
    type ExtractedClaim,
    type NothingFound,
    type SpineFailureReason,
    type ZoneContext,
} from './types.js';

const tracer = trace.getTracer('pryzm.ordinance-extraction');

/** Everything the spine needs for ONE document read for ONE zone. */
export interface SpineRequest {
    /**
     * The PRIMARY structured document. Layer 3/4's output — built by
     * `buildCanonicalDocument` from page geometry.
     */
    readonly primary: CanonicalDocumentBuild;
    /**
     * An INDEPENDENT second reconstruction of the same document, built with
     * PERTURBED layout options (a tighter `columnTolerance` is the obvious choice).
     *
     * ⭐ THIS IS THE DUAL-PASS, HONESTLY REDEFINED FOR A GEOMETRIC READ. The
     * existing gate's premise is that two strategies which FAIL DIFFERENTLY make
     * agreement meaningful ("A loses table structure; B mis-orders two-column
     * layouts"). For a grid read there is exactly one thing that can go wrong —
     * which COLUMN a value was assigned to — and it is a function of the snapping
     * tolerance. So pass B re-reads the document under a different tolerance: a
     * value that is stable under perturbation agrees; a value that sits between
     * columns does not, and disagreement routes it to a human.
     *
     * Omit it and the dual-pass gate degrades to comparing a pass with itself,
     * which is NOT a check — so omitting it is recorded as a flag, never as a pass.
     */
    readonly perturbed?: CanonicalDocumentBuild;
    readonly zone: ZoneContext;
    /** The readers to try, in order. The first that yields a value wins. */
    readonly readers: readonly ClaimReader[];
    /** The fields to seek. Defaults to the union of every reader's fields. */
    readonly fields?: readonly ExtractableField[];
    /** The jurisdiction's qualifier vocabulary — control 8's input. */
    readonly lexicon: QualifierLexicon;
    /** Number locale of the source text (`de` and `es` share a convention). */
    readonly locale: NumberLocale;
    /** The claim's validity window and what it is a claim ABOUT (R3). */
    readonly validity: ClaimValidity;
    /** Stage-0 in-force signals; when supplied, a dead instrument REFUSES. */
    readonly documentRef?: OrdinanceDocumentRef;
    /** The parcel's legal-regime verdict; when supplied, a no-numbers regime REFUSES. */
    readonly regime?: RegimeGateResult;
    /** Per-field plausibility-band overrides for the range gate. */
    readonly bounds?: Partial<Record<ExtractableField, FieldBounds>>;
}

/** Key for the evidence side-channel: one reading per (field, zone). */
function key(field: ExtractableField, zoneKey: string): string {
    return `${field}|${zoneKey}`;
}

/** Run every reader in order until one produces a value; keep the last reason. */
async function readField(
    build: CanonicalDocumentBuild,
    zone: ZoneContext,
    field: ExtractableField,
    readers: readonly ClaimReader[],
): Promise<ReaderOutcome> {
    let last: ReaderOutcome | null = null;
    for (const reader of readers) {
        if (!reader.fields.includes(field)) continue;
        const outcome = await reader.read(build, zone, field);
        if (outcome.value !== null) return outcome;
        // Prefer the most SPECIFIC reason: a withheld grid or a refused span says
        // more than "no reader for this field".
        if (last === null || last.reason === 'no-reader-for-field') last = outcome;
    }
    return (
        last ?? {
            value: null,
            rawText: '',
            evidence: null,
            reason: 'no-reader-for-field',
            detail: `No configured reader can read ${field} in this jurisdiction.`,
            gates: [],
            qualifierCarriers: [],
            normativeForce: null,
            unit: null,
        }
    );
}

/**
 * Turn a document into claims.
 *
 * NEVER throws for a data condition — every failure is a typed `failed` outcome.
 * The ONE exception is a tier-lock breach, which throws on purpose: that is a
 * defect in the code, not a condition of the corpus (see `tierLock.ts`).
 */
export async function documentToClaims(request: SpineRequest): Promise<DocumentClaimOutcome> {
    const span = tracer.startSpan('pryzm.ordinance-extraction.documentToClaims');
    const documentId = request.primary?.document?.document ?? '(unknown)';
    try {
        span.setAttribute('pryzm.documentId', documentId);
        span.setAttribute('pryzm.zoneKey', request.zone?.zoneKey ?? '(none)');

        // ── Guards. Each is a FAILURE, never an empty. ──
        if (request.zone === undefined || request.zone.zoneKey.trim() === '') {
            return failed(documentId, null, 'invalid-zone-context', 'No zone context was supplied — a document must be read FOR a zone.');
        }
        if (documentId.trim() === '' || documentId === '(unknown)') {
            return failed(documentId, request.zone, 'no-document-id', 'The document carries no id — a value with no citeable document must never be emitted.');
        }
        const doc = request.primary.document;
        if (doc.pageCount === 0) {
            return failed(documentId, request.zone, 'no-pages', 'The document produced no pages to read.');
        }
        if (doc.digitisation.totalChars === 0) {
            return failed(
                documentId,
                request.zone,
                'no-text-layer',
                `The document opened but contains ZERO characters over ${doc.pageCount} page(s) — it is a ` +
                    `SCAN. That is a correct measurement and an OCR-queue input, not an extraction failure ` +
                    `and not evidence that the ordinance is silent.`,
            );
        }

        // ── Stage 0 — legal refusals, BEFORE any reading. ──
        if (request.regime !== undefined && !request.regime.shouldExtract) {
            return {
                ok: false,
                kind: 'refused',
                documentId,
                zone: request.zone,
                refusedBy: 'regime',
                detail: request.regime.refusal ?? request.regime.gate.detail,
            };
        }

        const fields =
            request.fields ?? [...new Set(request.readers.flatMap((r) => [...r.fields]))];

        // ⛔ A run that sought NOTHING is not a run that found nothing. With no
        // reader (or no reader covering any requested field) the loops below are
        // no-ops and the outcome would be `ran · claims 0 · nothingFound 0` — which
        // a consumer reads as "the ordinance is silent". It is not: PRYZM never
        // looked. Measured on the real Marseille règlement; see the reason's note.
        if (fields.length === 0) {
            return failed(
                documentId,
                request.zone,
                'no-reader-configured',
                `No reader is configured that can read any field in this jurisdiction ` +
                    `(${request.readers.length} reader(s) supplied). This is a GAP IN PRYZM, not a ` +
                    `statement about the document: nothing was looked for, so nothing being found ` +
                    `means nothing. A clean empty run here would be a false negative.`,
            );
        }

        // ── INTERPRET — read every field under BOTH reconstructions. ──
        const evidenceA = new Map<string, ReaderOutcome>();
        const evidenceB = new Map<string, ReaderOutcome>();
        for (const field of fields) {
            evidenceA.set(key(field, request.zone.zoneKey), await readField(request.primary, request.zone, field, request.readers));
            if (request.perturbed !== undefined) {
                evidenceB.set(
                    key(field, request.zone.zoneKey),
                    await readField(request.perturbed, request.zone, field, request.readers),
                );
            }
        }

        const toCandidate = (
            outcome: ReaderOutcome | undefined,
            field: ExtractableField,
            pass: 'A' | 'B',
        ): ExtractionCandidate => ({
            field,
            value: outcome?.value ?? null,
            ...(outcome?.rule !== undefined ? { rule: outcome.rule } : {}),
            zoneCode: request.zone.zoneKey,
            rawText: outcome?.rawText ?? '',
            pass,
        });

        const extractor: DualPassExtractor = {
            extractPassA: (req: FieldExtractionRequest) =>
                Promise.resolve(toCandidate(evidenceA.get(key(req.field, request.zone.zoneKey)), req.field, 'A')),
            extractPassB: (req: FieldExtractionRequest) =>
                Promise.resolve(
                    request.perturbed === undefined
                        ? // No independent second reconstruction: report a DIFFERENT
                          // shape so the agreement gate flags rather than rubber-stamps.
                          { field: req.field, value: null, zoneCode: '(no-second-pass)', rawText: '', pass: 'B' as const }
                        : toCandidate(evidenceB.get(key(req.field, request.zone.zoneKey)), req.field, 'B'),
                ),
        };

        // ── VERIFY — the EXISTING orchestrator and its gates, unchanged. ──
        const documentRef: OrdinanceDocumentRef = request.documentRef ?? {
            documentId,
            cityId: `${request.zone.country}/${request.zone.authority}`,
            instrument: request.zone.dataset,
            fetchUrl: '',
            // No register signals supplied ⇒ the Stage-0 gate resolves `unknown`,
            // which is deliberately NOT extractable. A caller that knows the
            // instrument is in force must say so; silence is not a licence.
            supersession: { vigencia: 'vigent' },
            textLayer: doc.digitisation.digitisation === 'scanned' ? 'no-text' : 'has-text',
            imageRegime: null,
        };

        const plan: DocumentExtractionPlan = {
            documentRef,
            locale: request.locale,
            extractionModel: request.readers.map((r) => `${r.method}:${r.id}`).join('+'),
            promptHash: 'n/a-deterministic',
            fields: fields.map((field) => ({
                request: {
                    documentId,
                    page: evidenceA.get(key(field, request.zone.zoneKey))?.evidence?.page ?? 1,
                    field,
                    cropRef: evidenceA.get(key(field, request.zone.zoneKey))?.evidence?.cell ?? '',
                    ordinanceRef: request.zone.dataset,
                    zoneCode: request.zone.zoneKey,
                },
                ...(request.bounds !== undefined ? { bounds: request.bounds } : {}),
            })),
        };

        const verified = await runDocumentExtraction(plan, extractor);
        if (!verified.supersession.shouldExtract) {
            return {
                ok: false,
                kind: 'refused',
                documentId,
                zone: request.zone,
                refusedBy: 'supersession',
                detail: verified.supersession.detail,
            };
        }

        // ── ATTRIBUTE — the first AI_EXTRACTED producer. ──
        const claims: ExtractedClaim[] = [];
        const nothingFound: NothingFound[] = [];
        for (const field of fields) {
            const outcome = evidenceA.get(key(field, request.zone.zoneKey))!;
            const gated = verified.extracted.find((f) => f.field === field);

            if (outcome.value === null || outcome.evidence === null || gated === undefined) {
                nothingFound.push({
                    field,
                    parameter: field,
                    reason: outcome.reason ?? 'not-in-document',
                    detail: outcome.detail,
                    evidence: outcome.evidence,
                });
                continue;
            }

            // ── The 9th gate: did the span's qualifiers survive? (control 8) ──
            const qualifier = qualifierSurvivalGate({
                span: outcome.evidence.span,
                lexicon: request.lexicon,
                carried: outcome.qualifierCarriers,
                parameterPolarity: parameterPolarityFor(field),
            });
            const gates: GateResult[] = [...gated.gates, ...outcome.gates, qualifier.gate];

            claims.push(
                produceClaim({
                    field,
                    value: outcome.value,
                    unit: outcome.unit,
                    zone: request.zone,
                    evidence: outcome.evidence,
                    validity: request.validity,
                    gates,
                    normativeForce: outcome.normativeForce,
                    ...(outcome.rawText !== '' ? { verbatim: outcome.rawText } : {}),
                    ...(outcome.valueBasis !== undefined ? { valueBasis: outcome.valueBasis } : {}),
                    ...(outcome.measurement !== undefined ? { measurement: outcome.measurement } : {}),
                    ...(outcome.landBasis !== undefined ? { landBasis: outcome.landBasis } : {}),
                }),
            );
        }

        const withheldTables = request.primary.document.tables
            .filter((t) => !t.confident)
            .map((t) => ({ page: t.page, detail: t.detail }));

        span.setAttribute('pryzm.claims', claims.length);
        span.setAttribute('pryzm.nothingFound', nothingFound.length);
        span.setAttribute('pryzm.withheldTables', withheldTables.length);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            ok: true,
            kind: 'ran',
            documentId,
            zone: request.zone,
            claims,
            nothingFound,
            withheldTables,
        };
    } catch (err) {
        // A tier-lock breach is a CODE defect and must not be swallowed.
        if ((err as Error).message?.startsWith('[ordinance-extraction/tier-lock]')) throw err;
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        return failed(
            documentId,
            request.zone ?? null,
            'internal-error',
            `Contained error: ${(err as Error).message}`,
        );
    } finally {
        span.end();
    }
}

function failed(
    documentId: string,
    zone: ZoneContext | null,
    reason: SpineFailureReason,
    detail: string,
): DocumentClaimFailure {
    return { ok: false, kind: 'failed', documentId, zone, reason, detail };
}
