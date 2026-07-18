// C58 §3.2 — `ZoningRulesEngine`: the PURE, deterministic buildable-envelope
// solver. `(parcel + edge classifications + zoning record + rule pack)` →
// `BuildableEnvelope`.
//
// L2-pure (C58 §1.9): no THREE / DOM / I-O / RNG / clock. Same inputs →
// byte-identical output (C58 §1.1). The ONLY runtime surface is the OTel span
// (C58 §1.10 / P8) — the default no-op tracer performs no I/O.
//
// Jurisdiction-agnostic (C58 §1.5): zero jurisdiction-specific logic. All
// jurisdiction knowledge lives in the `ZoningRecord` (from a provider) + the
// `JurisdictionZoningContract` (a data pack). Adding DK/ES is a new pack, never
// an engine edit.
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §3.2.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type {
    Pt,
    ParcelEdgeClassification,
    ZoningRecord,
    JurisdictionZoningContract,
    ZoningRule,
    BuildableEnvelope,
    DerivationEntry,
    EnvelopeConfidence,
    FieldProvenance,
    PermittedUse,
} from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import { insetPolygonPerEdge, type PerEdgeSetbacks } from './geometry/insetPolygon.js';

const tracer = trace.getTracer('pryzm.zoning');

export interface ComputeBuildableEnvelopeInput {
    /** Closed parcel ring in scene-XZ metres (C19 `Parcel.boundary.polygon`). */
    readonly parcelRing: ReadonlyArray<Pt>;
    /** One classification per edge (C19 §2.3); may be all `unclassified`. */
    readonly edgeClassifications: ReadonlyArray<ParcelEdgeClassification>;
    /** The raw zoning at the parcel (from a provider, or the estimated default). */
    readonly zoning: ZoningRecord;
    /** The curated rule pack for the jurisdiction, or null (structured-only). */
    readonly rulePack: JurisdictionZoningContract | null;
}

/** A single numeric field resolution (C58 §1.2 priority order). */
interface Resolved<T> {
    readonly value: T | null;
    readonly provenance: FieldProvenance;
    readonly from: 'structured' | 'pack' | 'none';
}

function findZone(
    pack: JurisdictionZoningContract | null,
    zoneCode: string,
): ZoningRule | null {
    if (!pack) return null;
    return pack.zones.find((z) => z.code === zoneCode) ?? null;
}

/**
 * Resolve one numeric field in C58 §1.2 priority order:
 *   1. structured (provider published it directly) → `published-structured`.
 *   2. rule-pack zone value → the pack's per-field provenance (default estimated).
 *   3. none → null.
 */
function resolveNumber(
    structured: number | null | undefined,
    packValue: number | null | undefined,
    packProvenance: FieldProvenance | undefined,
): Resolved<number> {
    if (structured !== null && structured !== undefined) {
        return { value: structured, provenance: 'published-structured', from: 'structured' };
    }
    if (packValue !== null && packValue !== undefined) {
        return { value: packValue, provenance: packProvenance ?? 'estimated', from: 'pack' };
    }
    return { value: null, provenance: 'estimated', from: 'none' };
}

/**
 * Solve the buildable envelope (C58 §3.2). Deterministic + pure. Emits the
 * `pryzm.zoning.computeBuildableEnvelope` span (C58 §1.10 / P8).
 */
export function computeBuildableEnvelope(
    input: ComputeBuildableEnvelopeInput,
): BuildableEnvelope {
    const span = tracer.startSpan('pryzm.zoning.computeBuildableEnvelope');
    try {
        const { parcelRing, edgeClassifications, zoning, rulePack } = input;
        const zone = findZone(rulePack, zoning.zoneCode);
        const structured = zoning.structuredFields ?? {};
        const packProv = zone?.fieldProvenance ?? {};
        const source = zone
            ? rulePack!.jurisdictionId
            : zoning.provenance.source;
        // C58 §1.3 — cite the governing document. A curated pack zone's ordinanceRef
        // wins; else a structured provider's record-level citation (DK Plandata
        // `doklink`); else null (never fabricated).
        const ordinanceRef = zone?.ordinanceRef ?? zoning.ordinanceRef ?? null;

        // ── Resolve each constraint (C58 §1.2). ──────────────────────────────
        const front = resolveNumber(
            structured.setbacks?.front_m,
            zone?.setbacks.front_m,
            packProv['setback.front'],
        );
        const side = resolveNumber(
            structured.setbacks?.side_m,
            zone?.setbacks.side_m,
            packProv['setback.side'],
        );
        const rear = resolveNumber(
            structured.setbacks?.rear_m,
            zone?.setbacks.rear_m,
            packProv['setback.rear'],
        );
        const maxHeight = resolveNumber(
            structured.maxHeight_m,
            zone?.maxHeight_m,
            packProv['maxHeight'],
        );
        const maxFloors = resolveNumber(
            structured.maxFloors,
            zone?.maxFloors,
            packProv['maxFloors'],
        );
        const maxFAR = resolveNumber(
            structured.plotRatioFAR,
            zone?.plotRatioFAR,
            packProv['maxFAR'],
        );
        const maxCoverage = resolveNumber(
            structured.maxCoverage,
            zone?.maxCoverage,
            packProv['maxCoverage'],
        );
        const permittedUse: PermittedUse[] =
            structured.permittedUse && structured.permittedUse.length > 0
                ? structured.permittedUse
                : zone?.permittedUse ?? [];
        const permittedUseProv: FieldProvenance =
            structured.permittedUse && structured.permittedUse.length > 0
                ? 'published-structured'
                : packProv['permittedUse'] ?? 'estimated';

        const resolutions = [front, side, rear, maxHeight, maxFloors, maxFAR, maxCoverage];
        const anyResolved = resolutions.some((r) => r.from !== 'none') || permittedUse.length > 0;

        // ── Confidence (C58 §1.2). ───────────────────────────────────────────
        // Structured only iff EVERY resolved number came from the provider; else
        // estimated-ruleset (any pack-derived number taints it — the honest label).
        const anyFromPack = resolutions.some((r) => r.from === 'pack') || permittedUseProv === 'estimated';
        const anyFromStructured = resolutions.some((r) => r.from === 'structured');
        let confidence: EnvelopeConfidence = 'estimated-ruleset';
        if (anyResolved && !anyFromPack && anyFromStructured) confidence = 'structured';

        // ── Build the derivation trace (C58 §1.3). ───────────────────────────
        const derivation: DerivationEntry[] = [];
        const addEntry = (
            constraint: DerivationEntry['constraint'],
            r: Resolved<number>,
        ): void => {
            if (r.value === null) return;
            derivation.push({
                constraint,
                value: r.value,
                zoneCode: zoning.zoneCode,
                source,
                fieldProvenance: r.provenance,
                ordinanceRef,
            });
        };
        addEntry('setback.front', front);
        addEntry('setback.side', side);
        addEntry('setback.rear', rear);
        addEntry('maxHeight', maxHeight);
        addEntry('maxFAR', maxFAR);
        addEntry('maxCoverage', maxCoverage);
        if (permittedUse.length > 0) {
            derivation.push({
                constraint: 'permittedUse',
                value: permittedUse,
                zoneCode: zoning.zoneCode,
                source,
                fieldProvenance: permittedUseProv,
                ordinanceRef,
            });
        }

        const caveats: string[] = [];

        // ── Compute the setback inset (C58 §3.2). ────────────────────────────
        // C58 §10.3: until per-edge front/side/rear classification exists, a
        // uniform setback is the sanctioned fallback (flagged in caveats).
        const allUnclassified =
            edgeClassifications.length === 0 ||
            edgeClassifications.every((c) => c === 'unclassified');
        const frontV = front.value ?? 0;
        const sideV = side.value ?? 0;
        const rearV = rear.value ?? 0;
        const present = [frontV, sideV, rearV].filter((v) => v > 0);
        const uniform = present.length > 0 ? present.reduce((a, b) => a + b, 0) / present.length : 0;
        if (allUnclassified && (frontV || sideV || rearV)) {
            caveats.push(
                `Uniform setback ${uniform.toFixed(2)} m applied (parcel edges are unclassified — ` +
                    `per-edge front/side/rear pending C19 edge classification, C58 §10.3).`,
            );
        }
        const setbacks: PerEdgeSetbacks = {
            front: frontV,
            side: sideV,
            rear: rearV,
            unclassified: uniform,
        };

        let status: BuildableEnvelope['status'] = 'none';
        let insetPolygon: Pt[] = [];
        let insetAreaM2 = 0;
        let maxVolumeM3: number | null = null;

        if (!anyResolved) {
            caveats.push('No zoning data resolved for this parcel — no envelope (C58 §1.2 fidelity “none”).');
        } else if (parcelRing.length < 3) {
            status = 'degenerate';
            caveats.push('Parcel polygon is degenerate (< 3 vertices) — no envelope.');
        } else {
            const inset = insetPolygonPerEdge(parcelRing, edgeClassifications, setbacks);
            if (inset.degenerate || inset.polygon.length < 3) {
                status = 'degenerate';
                caveats.push(
                    'Setbacks consume the whole parcel (≥ half its width) — no buildable envelope remains.',
                );
            } else {
                status = 'ok';
                insetPolygon = inset.polygon;
                insetAreaM2 = polygonArea(insetPolygon);
                if (maxHeight.value !== null) {
                    maxVolumeM3 = insetAreaM2 * maxHeight.value;
                }
            }
        }

        if (confidence === 'estimated-ruleset' && status === 'ok') {
            caveats.push('Estimated envelope — verify against the governing ordinance before relying on it (C58 §1.4).');
        }

        span.setAttribute('jurisdictionId', zoning.jurisdictionId);
        span.setAttribute('zoneCode', zoning.zoneCode);
        span.setAttribute('confidence', confidence);
        span.setAttribute('provider', zoning.provenance.source);
        span.setAttribute('status', status);
        span.setAttribute('insetAreaM2', insetAreaM2);
        if (maxHeight.value !== null) span.setAttribute('maxHeight', maxHeight.value);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            insetPolygon,
            maxHeight_m: maxHeight.value,
            maxFloors: maxFloors.value,
            maxFAR: maxFAR.value,
            maxCoverage: maxCoverage.value,
            maxVolumeM3,
            insetAreaM2,
            permittedUse,
            confidence,
            status,
            zoneCode: anyResolved ? zoning.zoneCode : null,
            derivation,
            caveats,
        };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
    } finally {
        span.end();
    }
}
