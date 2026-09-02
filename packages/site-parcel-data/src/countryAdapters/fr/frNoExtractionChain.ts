// LANE FR-STEP4 — FRANCE (FR) · THE NO-EXTRACTION CHAIN: WGS84 point → ONE typed
// FrNoExtractionRecord (or a typed transient/absent), through the ExtractMirrorPort seam.
//
// EXTENDS the FR-ZONEID chain, does not rival it: `resolveFrZoneIdentityAt` stays the
// zone-identity leg the dispatcher calls for the envelope-refusal card; THIS chain is the
// step-4 DATA PRODUCT (brief §11: "regime, derivability, zone, permitted uses,
// prescriptions, SUP, terrain, neighbours, governing document … shippable before any PDF is
// parsed"). Both share the same client, mapper and port machinery.
//
// ⚠ NO REGISTERED-JURISDICTION DEFERRAL — DELIBERATE, STATED. The zone-identity leg defers
// to registered packs (Paris) because it competes on the ENVELOPE-ANSWER surface. This
// record carries no envelope and no number, so it cannot pre-empt or contradict a certified
// pack — and the brief's own acceptance list REQUIRES a Paris intra-muros record. A consumer
// wanting the envelope answer goes through the dispatch ladder, not through this record.
//
// PARCEL GEOMETRY is NOT re-served here: the wired FR parcel path stays parcelProviders
// `ign-fr` + /api/parcel/fr (live-proven; §J conformance note in ./index.ts) — this record
// is point-addressed and rides beside the parcel row, never instead of it.
//
// FAILURE ≠ EMPTY, end to end (control 9): a severed GPU yields `transient` with the L0
// token verbatim on EVERY branch — never an RNU, never an empty. Load-bearing legs
// short-circuit; auxiliary legs degrade to typed-unresolved slices (brief §1.4).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, type FetchOutcome } from '@pryzm/schemas';
import { isInFrance, FRANCE_BBOX } from '../../parcelProviders/countryBbox.js';
import { frElevationAtPoint } from './frAltimetry.js';
import { frNeighbourBuildingsAtPoint } from './frBdTopoNeighbours.js';
import { frApiCartoExtractSource, type FrExtractSourcePort } from './frExtractMirrorPort.js';
import type { FrFetchDeps, FrGpuFeature } from './frGpuClient.js';
import {
    buildFrNoExtractionRecord,
    type FrNoExtractionFetches,
    type FrNoExtractionRecord,
} from './frNoExtraction.js';

const tracer = trace.getTracer('pryzm.siteintel.fr');

/** Injectable dependencies: the fetch seam, the source port, and the clock AS AN INPUT. */
export interface FrNoExtractionDeps extends FrFetchDeps {
    /** Override the extract-source port (tests inject a fixture port; default = API Carto). */
    readonly extractSource?: FrExtractSourcePort;
    /**
     * The record's retrieved_at stamp — an INPUT so the assembly stays deterministic
     * (brief §1.1: same input → byte-identical output; two runs with the same stamp and the
     * same upstream bytes must diff empty). Default: the current UTC instant.
     */
    readonly fetchedAtIso?: string;
}

/**
 * Resolve the FR no-extraction record at a WGS84 point.
 *
 *   • found     → FrNoExtractionRecord (possibly carrying a typed regime refusal — RNU /
 *                 POS-caduc / PSMV / secteur-cc / plan-masse / no-plan-at-point)
 *   • absent    → not French territory / sea (the municipality rung answered empty)
 *   • transient → a load-bearing source did not answer — the L0 token travels verbatim;
 *                 an outage NEVER becomes a refusal (control 9)
 */
export async function resolveFrNoExtractionAt(
    lat: number,
    lon: number,
    deps: FrNoExtractionDeps = {},
): Promise<FetchOutcome<FrNoExtractionRecord>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.fr.resolveNoExtraction',
        async (span): Promise<FetchOutcome<FrNoExtractionRecord>> => {
            try {
                span.setAttribute('fr.lat', lat);
                span.setAttribute('fr.lon', lon);
                const point = { lat, lon };
                const fetchedAtIso = deps.fetchedAtIso ?? new Date().toISOString();
                const port = deps.extractSource ?? frApiCartoExtractSource(deps);

                // Rung -1: the bbox PRE-FILTER (never the decider — the GPU's own
                // municipality answer claims/refuses; this only avoids querying France
                // about Warsaw). Same guard, same wording as the zone-identity leg.
                if (!isInFrance(lat, lon)) {
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(
                        `no-feature: ${lat},${lon} is outside FRANCE_BBOX ` +
                            `(${FRANCE_BBOX.minLat}..${FRANCE_BBOX.maxLat}, ${FRANCE_BBOX.minLon}..${FRANCE_BBOX.maxLon}) — ` +
                            'nothing to ask the GPU',
                    );
                }

                // ── Load-bearing rungs, sequential (each can short-circuit) ─────────
                const municipality = await port.featuresAtPoint('municipality', lat, lon);
                if (municipality.status !== 'found') {
                    // transient stays transient (control 9); absent = sea/foreign —
                    // the assembler would say the same; short-circuit saves 9 calls.
                    span.setStatus({ code: SpanStatusCode.OK });
                    return municipality as FetchOutcome<FrNoExtractionRecord>;
                }
                const documents = await port.featuresAtPoint('document', lat, lon);
                if (documents.status === 'transient' || documents.status === 'aborted') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'document did not answer' });
                    return documents as FetchOutcome<FrNoExtractionRecord>;
                }
                const zonesUrba = await port.featuresAtPoint('zone-urba', lat, lon);
                if (zonesUrba.status === 'transient' || zonesUrba.status === 'aborted') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'zone-urba did not answer' });
                    return zonesUrba as FetchOutcome<FrNoExtractionRecord>;
                }
                // secteur-cc only after an honest zone-urba EMPTY (the ZONEID ladder rule).
                let secteursCc: FetchOutcome<readonly FrGpuFeature[]> | null = null;
                if (zonesUrba.status === 'absent') {
                    secteursCc = await port.featuresAtPoint('secteur-cc', lat, lon);
                    if (secteursCc.status === 'transient' || secteursCc.status === 'aborted') {
                        span.setStatus({
                            code: SpanStatusCode.ERROR,
                            message: 'secteur-cc did not answer',
                        });
                        return secteursCc as FetchOutcome<FrNoExtractionRecord>;
                    }
                }

                // ── The doc_urba join key: the zone's idurba, else the document name ─
                let idurba: string | null = null;
                if (zonesUrba.status === 'found') {
                    const z = zonesUrba.value[0]?.properties['idurba'];
                    if (typeof z === 'string' && z.trim() !== '') idurba = z.trim();
                }
                if (idurba === null && secteursCc?.status === 'found') {
                    const z = secteursCc.value[0]?.properties['idurba'];
                    if (typeof z === 'string' && z.trim() !== '') idurba = z.trim();
                }
                if (idurba === null && documents.status === 'found') {
                    const n = documents.value[0]?.properties['name'];
                    if (typeof n === 'string' && n.trim() !== '') idurba = n.trim();
                }

                // ── Auxiliary legs, parallel (each degrades to a typed slice) ───────
                const [
                    prescriptionsSurf,
                    prescriptionsLin,
                    prescriptionsPct,
                    supS,
                    supL,
                    supP,
                    docUrba,
                    terrain,
                    neighbours,
                ] = await Promise.all([
                    port.featuresAtPoint('prescription-surf', lat, lon),
                    port.featuresAtPoint('prescription-lin', lat, lon),
                    port.featuresAtPoint('prescription-pct', lat, lon),
                    port.featuresAtPoint('assiette-sup-s', lat, lon),
                    port.featuresAtPoint('assiette-sup-l', lat, lon),
                    port.featuresAtPoint('assiette-sup-p', lat, lon),
                    idurba !== null ? port.docUrbaByIdurba(idurba) : Promise.resolve(null),
                    frElevationAtPoint(lat, lon, deps),
                    frNeighbourBuildingsAtPoint(lat, lon, deps),
                ]);

                const fetches: FrNoExtractionFetches = {
                    municipality,
                    documents,
                    zonesUrba,
                    secteursCc,
                    prescriptionsSurf,
                    prescriptionsLin,
                    prescriptionsPct,
                    supS,
                    supL,
                    supP,
                    docUrba,
                    terrain,
                    neighbours,
                };
                const record = buildFrNoExtractionRecord(point, fetchedAtIso, fetches);
                span.setStatus(
                    record.status === 'transient'
                        ? { code: SpanStatusCode.ERROR, message: 'assembly transient' }
                        : { code: SpanStatusCode.OK },
                );
                return record;
            } finally {
                span.end();
            }
        },
    );
}
