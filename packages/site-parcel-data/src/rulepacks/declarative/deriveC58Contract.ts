// LANE E1bc — THE C58 LOADER: DeclarativeRulePackDocument → the
// `JurisdictionZoningContract` the engine consumes (C58 §2.2).
//
// NON-RIVALRY (ruleformat.ts header, C84 EI-9): "`JurisdictionZoningContract`
// STAYS the pack shape the engine consumes. This document is the AUTHORING
// format; the L2 loader derives a C58 contract from it" — THIS module is that
// loader. It re-declares no C58 vocabulary: the derived object goes through
// `JurisdictionZoningContractSchema.parse`, which is the one authority for
// the closed enums (source, defaultConfidence, PermittedUse) and for field
// order — the same parse the hand-written TS packs run, which is what makes
// byte-comparison against them meaningful.
//
// DERIVATION RULES (each is a golden-parity test arm):
//   - every scalar seat is answered by `evaluateZoneParameter` under a
//     `current-set` query at the pack's `lastReviewed` date — the loader
//     NEVER reads a rule's value directly, so the evaluator (temporal gate,
//     R1 basis contract, rank precedence, tier-6 split) is on the parity
//     path, not beside it;
//   - a parameter with outcome `no-rule` loads as null — "absence is the
//     honest encoding of the packs' deliberate nulls" (ruleformat.ts);
//   - `unknown-tier6` ALSO loads as null (an unknown scalar is a null plus
//     its guard — the envelope seam is protected by `envelopeSolidHeightCap`,
//     not by inventing a number);
//   - a REFUSAL outcome (dangling basis, rank conflict, unknown fact,
//     temporal unanswerable) is a MIGRATION DEFECT and throws: a loader that
//     silently nulled a refused parameter would convert a named defect into
//     an honest-looking absence — failure ≠ absence;
//   - `maxCoveragePercent` → C58 `maxCoverage` via ÷100 (the calculation is
//     named in DECLARATIVE_PARAMETERS and in the rule's evidence chain);
//   - the geometric rule: when all three setback seats resolve, the C58
//     `geometricRule` is the setback triple stated explicitly
//     (`kind: 'setback'`) — the ordinance's own operation for edificació
//     aïllada fabric, NOT a geometric construction (no body dialect tag
//     needed; the Art. 242.4 class stays deferred per verdict §E);
//   - zone METADATA (label, permittedUse, fieldProvenance, ordinanceRef)
//     loads verbatim from the DeclarativeZone — curation facts, not rules.
//
// PURE + deterministic. P8: OTel span on the exported entry point.

import { trace } from '@opentelemetry/api';
import {
    JurisdictionZoningContractSchema,
    type DeclarativeRulePackDocument,
    type JurisdictionZoningContract,
} from '@pryzm/schemas';
import {
    evaluateZoneParameter,
    type DeclarativeInstrumentContext,
    type DeclarativeParameterEvaluation,
} from './evaluateDeclarative.js';
import { DECLARATIVE_PARAMETER_BY_NAME } from './factVocabulary.js';

const _tracer = trace.getTracer('pryzm.zoning.declarative');

/** Extract the resolved numeric value, null for honest absence, throw on defects. */
function scalarOrNull(evaluation: DeclarativeParameterEvaluation): number | null {
    const o = evaluation.outcome;
    switch (o.kind) {
        case 'attributed': {
            if (o.resolution.status === 'resolved' && typeof o.resolution.value === 'number') {
                return o.resolution.value;
            }
            throw new Error(
                `[declarative→C58] ${evaluation.zoneCode}/${evaluation.parameter}: attribution ` +
                    `did not resolve to a number (status ${o.resolution.status}) — a migration ` +
                    'defect, never silently nulled (failure ≠ absence)',
            );
        }
        case 'resolved-unattributed': {
            if (typeof o.value === 'number') return o.value;
            throw new Error(
                `[declarative→C58] ${evaluation.zoneCode}/${evaluation.parameter}: resolved to a ` +
                    `non-number (${typeof o.value}) where C58 expects a numeric seat`,
            );
        }
        case 'no-rule':
            // Absence-from-rules = the pack's deliberate null (a POSITIVE
            // curation finding, e.g. "this is a construction, not a scalar").
            return null;
        case 'unknown-tier6':
            // UNKNOWN also loads as null — C58's null-plus-provenance-flag
            // seat. The envelope seam is guarded by envelopeSolidHeightCap.
            return null;
        default:
            throw new Error(
                `[declarative→C58] ${evaluation.zoneCode}/${evaluation.parameter}: refused — ` +
                    `${o.kind}${'detail' in o ? `: ${o.detail}` : ''} — a refusal is a migration ` +
                    'defect and must fail the load, never become an honest-looking null',
            );
    }
}

/**
 * Derive the C58 contract for ONE pack entry (index `packIndex`) of a
 * declarative document. The temporal query is `current-set` at the pack's
 * own `lastReviewed` date — the derivation asks "what is in the current
 * resolved set as curated", which both validity bases answer (REPORT §K.2).
 */
export function deriveC58Contract(
    doc: DeclarativeRulePackDocument,
    ctx: DeclarativeInstrumentContext,
    packIndex = 0,
): JurisdictionZoningContract {
    const span = _tracer.startSpan('pryzm.zoning.declarative.deriveC58Contract');
    try {
        const pack = doc.packs[packIndex];
        if (!pack) {
            throw new Error(
                `[declarative→C58] document has no pack at index ${packIndex} ` +
                    `(${doc.packs.length} pack(s))`,
            );
        }
        span.setAttribute('pryzm.jurisdiction', pack.meta.jurisdictionId);
        span.setAttribute('pryzm.zones', pack.zones.length);
        const query = { basis: 'current-set', date: pack.meta.lastReviewed } as const;

        const zones = pack.zones.map((zone) => {
            const seat = (parameter: string): number | null => {
                if (!DECLARATIVE_PARAMETER_BY_NAME.has(parameter)) {
                    // The deriver polices its OWN spellings too — a seat name
                    // absent from the parameter vocabulary is the two-spellings
                    // defect on the consumer side (factVocabulary.ts doctrine).
                    throw new Error(
                        `[declarative→C58] seat "${parameter}" is not in DECLARATIVE_PARAMETERS — ` +
                            'one parameter, one spelling',
                    );
                }
                return scalarOrNull(evaluateZoneParameter(doc, zone.code, parameter, query, ctx));
            };

            const maxHeight_m = seat('maxHeight_m');
            const maxFloors = seat('maxFloors');
            const plotRatioFAR = seat('plotRatioFAR');
            const coveragePercent = seat('maxCoveragePercent');
            // The named calculation (DECLARATIVE_PARAMETERS): percent → fraction.
            const maxCoverage = coveragePercent === null ? null : coveragePercent / 100;
            const front_m = seat('setback.front_m');
            const side_m = seat('setback.side_m');
            const rear_m = seat('setback.rear_m');

            const geometricRule =
                front_m !== null && side_m !== null && rear_m !== null
                    ? { kind: 'setback' as const, front_m, side_m, rear_m }
                    : null;

            return {
                code: zone.code,
                label: zone.label,
                permittedUse: zone.permittedUse,
                maxHeight_m,
                maxFloors,
                plotRatioFAR,
                maxCoverage,
                setbacks: { front_m, side_m, rear_m },
                geometricRule,
                fieldProvenance: zone.fieldProvenance,
                ordinanceRef: zone.ordinanceRef,
            };
        });

        return JurisdictionZoningContractSchema.parse({
            jurisdictionId: pack.meta.jurisdictionId,
            displayName: pack.meta.displayName,
            source: pack.meta.source,
            crs: pack.meta.crs,
            lastReviewed: pack.meta.lastReviewed,
            defaultConfidence: pack.meta.defaultConfidence,
            zones,
        });
    } finally {
        span.end();
    }
}
