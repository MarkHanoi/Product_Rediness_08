// LANE DK — THE DENMARK COUNTRY ADAPTER CORRECTIONS (E1 verdict §G "DK corrections in
// parallel" · plan E6 DK-parallel), against the FROZEN R-batch model. Assembles the DK
// arms into the §J shape the EE adapter established (mirror the proven executor, no
// rival): keyless sources (the re-pin) · DAWA parcel leg · the 4-layer Plandata ladder
// with R1 rank on every rule · the R2 denominator branch + its GFA consumer.
//
// §J CONFORMANCE MAP:
//   country      → 'DK'
//   sources()    → DK_ADAPTER_SOURCES (typed rows, dated probe logs — the KEYLESS re-pin)
//   parcel       → resolveDkJordstykkeAtWgs84Point (DAWA, keyless)
//   planGeometry → the wired browser path stays server/plandataZoningProxy.js + C57;
//                  this adapter reads ATTRIBUTES (the rules leg) — geometry is not
//                  re-fetched here (no rival of the proxy's winning-layer picker)
//   rules        → resolveDkParcelChain below (FetchOutcome<DkParcelChain>)
//   documents    → doklink travels VERBATIM on every rule's source.document
//   precedence   → DK_APPLICABILITY_LADDER as data; each rule carries R1
//                  rank {scheme:'dk-plan-ladder', level}; RESOLUTION engine-side
//                  (evaluateZoneParameter, verdict §F.7)
//   vocabulary   → DK_RULE_VOCABULARY (dkRuleMapper.ts)
//
// §SEAM-E1BC-FETCHCHAIN (the EE seam, unchanged here): REPORT §J sketches
// `rules.fetch(parcel): FetchOutcome<Rule[]>`; this adapter serves
// `resolveDkParcelChain(lat, lon): FetchOutcome<DkParcelChain>` — richer (minted Plan
// referents + per-layer outcomes) and keyed by point. When the shared SDK type lands,
// reconcile HERE, never by editing core to match an adapter.
//
// FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values — a ladder
// layer that answers "no plan here" is `absent`; one that does not answer is `transient`.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchFound, type FetchOutcome, type SiteIntelPlan, type SiteIntelRule } from '@pryzm/schemas';
import type { PlandataLayer } from '../../providers/mapPlandataToZoningRecord.js';
import { DK_PLANDATA_LAYERS, dkPlandataLayerAtPoint, type DkFetchDeps } from './dkPlandataClient.js';
import { resolveDkJordstykkeAtWgs84Point, type DkJordstykke } from './dkParcelProvider.js';
import { mapDkFeatureToRules } from './dkRuleMapper.js';

export * from './dkGfa.js';
export * from './dkParcelProvider.js';
export * from './dkPlandataClient.js';
export * from './dkRuleMapper.js';
export * from './dkSources.js';

const tracer = trace.getTracer('pryzm.siteintel.dk');

/**
 * §J `precedence: ApplicabilityLadder` — Denmark's, as data (lane 2 §DK-1 verbatim:
 * "a per-parcel resolver must check byggefelt → delområde → lokalplan → ramme, in that
 * precedence order — this IS the Danish applicability ladder"). Rungs 1–4 ride every
 * mapped rule as R1 rank; rung 5 is the statutory fallback DERIVATION, recorded here so
 * silence across all four layers is never read as "no rule exists".
 */
export const DK_APPLICABILITY_LADDER = [
    { step: 'byggefelt (building field — per-field maxbygnhjd/maxetager/eareal)', rankLevel: 1 },
    { step: 'lokalplandelomraade (local-plan sub-area — real per-area numbers)', rankLevel: 2 },
    { step: 'lokalplan (whole local plan)', rankLevel: 3 },
    { step: 'kommuneplanramme (municipal-plan frame — the 60.8%-filled density fallback)', rankLevel: 4 },
    {
        step:
            'BR18 §168–186 statutory defaults (30/40/60 % by typology) where every layer is ' +
            'silent — DERIVED, not MISSING; not a WFS layer and not minted as one',
        rankLevel: 5,
    },
] as const;

/** One ladder layer's resolved features: minted Plan + rules per feature. */
export interface DkResolvedPlanFeature {
    readonly layer: PlandataLayer;
    readonly plan: SiteIntelPlan;
    readonly rules: readonly SiteIntelRule[];
}

/** Per-layer outcome — absent (no plan at point on that layer) stays VISIBLE, never dropped. */
export interface DkLadderLayerResult {
    readonly layer: PlandataLayer;
    readonly rankLevel: 1 | 2 | 3 | 4;
    readonly outcome: FetchOutcome<readonly DkResolvedPlanFeature[]>;
}

/** The DK chain for one point: parcel (keyless DAWA) + all four ladder layers' rules. */
export interface DkParcelChain {
    readonly parcel: FetchOutcome<DkJordstykke>;
    /** All four rungs, most-specific first — rank resolution is the ENGINE's job, so the
     *  chain exposes every rung rather than picking a winner here. */
    readonly layers: readonly DkLadderLayerResult[];
}

/**
 * Resolve the DK chain at a WGS84 point: DAWA parcel + the four Plandata ladder layers,
 * each feature mapped to the minted Plan + R1/R2/R3/R5-typed rules. The outer outcome is
 * always `found` (the chain itself is assembled locally); every fallible leg carries its
 * OWN FetchOutcome so a transient parcel leg never masks answered plan layers (and vice
 * versa). A mapper refusal (no plan identity / codelist breach) surfaces as `transient`
 * on that layer NAMING the cause — never a silent drop.
 */
export async function resolveDkParcelChain(
    lat: number,
    lon: number,
    deps: DkFetchDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<DkParcelChain>> {
    return tracer.startActiveSpan('pryzm.siteintel.dk.resolveParcelChain', async (span): Promise<FetchOutcome<DkParcelChain>> => {
        try {
            span.setAttribute('dk.lat', lat);
            span.setAttribute('dk.lon', lon);
            const fetchedAtIso = nowIso ?? new Date().toISOString().slice(0, 10);
            const parcel = await resolveDkJordstykkeAtWgs84Point(lat, lon, deps);
            const layers: DkLadderLayerResult[] = [];
            for (const row of DK_PLANDATA_LAYERS) {
                const got = await dkPlandataLayerAtPoint(row.typeName, lat, lon, deps);
                if (got.status !== 'found') {
                    layers.push({
                        layer: row.layer,
                        rankLevel: row.rankLevel,
                        outcome: got as FetchOutcome<readonly DkResolvedPlanFeature[]>,
                    });
                    continue;
                }
                try {
                    const mapped: DkResolvedPlanFeature[] = got.value.map((f) => {
                        const set = mapDkFeatureToRules(row.layer, f.properties, fetchedAtIso);
                        return { layer: row.layer, plan: set.plan, rules: set.rules };
                    });
                    layers.push({ layer: row.layer, rankLevel: row.rankLevel, outcome: fetchFound(mapped) });
                } catch (e) {
                    // The mapper throws BY NAME (structural refusal) — surfaced as a typed
                    // transient on this rung, never a silent drop of the layer.
                    layers.push({
                        layer: row.layer,
                        rankLevel: row.rankLevel,
                        outcome: {
                            status: 'transient',
                            reason: `mapper-refusal: ${e instanceof Error ? e.message : String(e)}`,
                        },
                    });
                }
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return fetchFound({ parcel, layers });
        } finally {
            span.end();
        }
    });
}
