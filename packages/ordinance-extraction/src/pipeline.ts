// @pryzm/ordinance-extraction — the shared orchestrator (Stages 0 → 4). Composes
// the supersession gate and the four field-level gates over an INJECTED dual-pass
// extractor, emitting `pipeline-extracted-unverified` fields with full C23
// provenance.
//
// The model call is a PORT (`DualPassExtractor`), so the core is pure/offline-
// testable; the concrete adapter (routing through ai-host, writing the AIArtefact
// per C23 §1.1) is supplied by the caller. One OTel span wraps the orchestration
// (C58 §1.10 / P8-style hygiene), using the default no-op tracer so the core does
// no I/O of its own.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
    type ExtractionProvenance,
    type SupersessionStatus,
} from '@pryzm/schemas';
import {
    type DocumentExtractionResult,
    type ExtractableField,
    type ExtractedField,
    type ExtractionCandidate,
    type GateResult,
} from './types.js';
import { type OrdinanceDocumentRef } from './enumerator.js';
import {
    type DualPassExtractor,
    type FieldExtractionRequest,
    dualPassAgreement,
} from './gates/dualPassAgreement.js';
import { supersessionGate } from './gates/supersessionGate.js';
import { algorithmGate } from './gates/algorithmDetector.js';
import { localeGate, type NumberLocale } from './gates/localeGate.js';
import { rangeSanityGate, type FieldBounds } from './gates/rangeSanityGate.js';
import {
    arithmeticCrossCheck,
    type ArithmeticCrossCheckInput,
} from './gates/arithmeticCrossCheck.js';
import { PIPELINE_TIER } from './confidence.js';

const tracer = trace.getTracer('pryzm.ordinance-extraction');

/** One field's extraction plan: the request + optional redundancy/bounds specs. */
export interface FieldExtractionPlan {
    readonly request: FieldExtractionRequest;
    /**
     * The arithmetic identity to cross-check this value against, where the
     * document is internally redundant (e.g. floorArea × storeys = builtArea).
     * Omit when there is no redundant sibling.
     */
    readonly arithmetic?: ArithmeticCrossCheckInput;
    /** Per-field plausibility-band override (else the field default). */
    readonly bounds?: Partial<Record<ExtractableField, FieldBounds>>;
}

/** The whole-document plan the caller hands the orchestrator. */
export interface DocumentExtractionPlan {
    readonly documentRef: OrdinanceDocumentRef;
    /** The jurisdiction number locale (Spain/Catalonia → 'es'). */
    readonly locale: NumberLocale;
    /** Model id + version (C23 reproducibility). */
    readonly extractionModel: string;
    /** Hash of the extraction prompt (C23 reproducibility). */
    readonly promptHash: string;
    /** The fields to extract. */
    readonly fields: readonly FieldExtractionPlan[];
}

/** True verdict is a hard stop for auto-accept; not-applicable/pass are fine. */
function isFlag(g: GateResult): boolean {
    return g.verdict === 'flag';
}

/** The accepted candidate is Pass A (== Pass B when agreed); carried either way. */
function acceptedValue(passA: ExtractionCandidate): {
    value: number | null;
    rule: ExtractionCandidate['rule'];
    zoneCode: string;
    rawText: string;
} {
    return { value: passA.value, rule: passA.rule, zoneCode: passA.zoneCode, rawText: passA.rawText };
}

async function extractField(
    plan: DocumentExtractionPlan,
    fieldPlan: FieldExtractionPlan,
    extractor: DualPassExtractor,
    supersededCheck: SupersessionStatus,
    supersessionCaveat: string | null,
): Promise<ExtractedField> {
    const [passA, passB] = await Promise.all([
        extractor.extractPassA(fieldPlan.request),
        extractor.extractPassB(fieldPlan.request),
    ]);

    const accepted = acceptedValue(passA);
    const gates: GateResult[] = [];

    // Stage 4 — the four field-level gates, in order.
    const dp = dualPassAgreement(passA, passB);
    gates.push(dp);
    gates.push(algorithmGate(accepted.rawText, accepted.value));
    gates.push(localeGate(accepted.rawText, accepted.value, plan.locale));
    gates.push(rangeSanityGate(fieldPlan.request.field, accepted.value, fieldPlan.bounds));
    if (fieldPlan.arithmetic) {
        gates.push(arithmeticCrossCheck(fieldPlan.arithmetic));
    }

    const flags = gates.filter(isFlag).map((g) => g.detail);
    const autoAccepted = flags.length === 0;

    const provenance: ExtractionProvenance = {
        documentId: fieldPlan.request.documentId,
        page: fieldPlan.request.page,
        cropRef: fieldPlan.request.cropRef,
        ordinanceRef: fieldPlan.request.ordinanceRef,
        extractionModel: plan.extractionModel,
        promptHash: plan.promptHash,
        dualPassAgreed: dp.verdict === 'pass',
        crossChecks: gates.map((g) => g.token),
        supersededCheck,
        humanVerifiedBy: null,
        verifiedAt: null,
    };

    const field: ExtractedField = {
        field: fieldPlan.request.field,
        value: accepted.value,
        ...(accepted.rule !== undefined ? { rule: accepted.rule } : {}),
        fieldProvenance: 'pipeline-extracted',
        confidence: PIPELINE_TIER,
        zoneCode: accepted.zoneCode,
        provenance,
        gates,
        autoAccepted,
        flags: supersessionCaveat ? [...flags, supersessionCaveat] : flags,
    };
    return field;
}

/**
 * Run the shared extract+verify core over one document.
 *
 * Stage 0 FIRST: if the supersession gate says the document is not extractable
 * (derogated / unconfirmed), NO field is extracted and the result carries the
 * cited refusal — an honest non-result, never a silent empty.
 *
 * Otherwise every planned field is extracted, gated, and emitted at the permanent
 * `pipeline-extracted-unverified` tier with full C23 provenance.
 */
export async function runDocumentExtraction(
    plan: DocumentExtractionPlan,
    extractor: DualPassExtractor,
): Promise<DocumentExtractionResult> {
    const span = tracer.startSpan('pryzm.ordinance-extraction.runDocumentExtraction');
    try {
        span.setAttribute('pryzm.documentId', plan.documentRef.documentId);
        span.setAttribute('pryzm.cityId', plan.documentRef.cityId);

        // ── Stage 0 — supersession, BEFORE any extraction. ──
        const supersession = supersessionGate(plan.documentRef.supersession);
        span.setAttribute('pryzm.supersession', supersession.status);

        if (!supersession.shouldExtract) {
            span.setAttribute('pryzm.extracted', 0);
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                documentId: plan.documentRef.documentId,
                cityId: plan.documentRef.cityId,
                supersession,
                extracted: [],
            };
        }

        // ── Stages 1-4 — extract + gate every planned field. ──
        const extracted = await Promise.all(
            plan.fields.map((fp) =>
                extractField(plan, fp, extractor, supersession.status, supersession.caveat),
            ),
        );

        span.setAttribute('pryzm.extracted', extracted.length);
        span.setAttribute(
            'pryzm.autoAccepted',
            extracted.filter((f) => f.autoAccepted).length,
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return {
            documentId: plan.documentRef.documentId,
            cityId: plan.documentRef.cityId,
            supersession,
            extracted,
        };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}
