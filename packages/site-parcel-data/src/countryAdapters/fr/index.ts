// LANE FR-ZONEID (demo gap G3) — THE FRANCE COUNTRY ADAPTER: national ZONE IDENTITY + the
// zone-named, source-cited refusal. Assembled on the §J shape the EE/DK/LT/PL adapters
// established (mirror the proven executor, no rival).
//
// WHAT THIS LEG DELIVERS AND REFUSES, IN ONE SENTENCE: every French point gets a NAMED
// answer — "zone UCe1b of PLUi 200046977_PLUI_20260326, règlement not yet extracted — no
// envelope asserted" — instead of the blind Estimated triple; NUMERIC envelopes remain the
// E8 French reader's job and are structurally unrepresentable in this adapter's output.
//
// §J CONFORMANCE MAP:
//   country      → 'FR'
//   sources()    → FR_ADAPTER_SOURCES (typed row, dated probe log — frSources.ts)
//   parcel       → NOT here: the wired path stays parcelProviders `ign-fr` + /api/parcel/fr
//                  (live-proven, DEMO-READINESS axis 1) — no rival is minted
//   planGeometry → NOT here: identity only; zone polygons are not re-served
//   rules        → kind: 'zone-identity' — resolveFrZoneIdentityAt below
//                  (FetchOutcome<FrZoneIdentityResolution>; identity + refusal, NEVER a number)
//   documents    → nomfic/urlfic + the #page anchor travel VERBATIM on every identity
//   precedence   → FR_APPLICABILITY_LADDER (registered pack → zone-urba → secteur-cc →
//                  municipality/RNU), recorded as DATA + honest caveat
//   vocabulary   → NONE, deliberately: this adapter maps no numeric parameters, so declaring
//                  a rule vocabulary would advertise a mapping that does not exist
//
// ⛔ THE PRE-EMPTION GUARD (this lane's acceptance arm 2 — the regression arm). France
// already has a DEEPER, certified-pack path: Paris (fr-75056-paris, PLU bioclimatique —
// `resolveParisEnvelope` + the L5 dispatch), registered in `rulepacks/registry.ts`. The
// national identity leg must NEVER pre-empt a registered jurisdiction, so the chain consults
// `resolveRegisteredJurisdictionAt` FIRST — the ONE source of truth (never a re-spelled
// Paris bbox: a copied box here would be the exact drift defect L-12871/E7 keep recording) —
// and yields BY NAME (`kind: 'deferred'`) without touching the network. The dispatcher
// continues down its existing ladder unchanged.
//
// FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values — a rung that
// answers "no document here" is `absent` and the chain falls to the next rung; a rung that
// does not answer is `transient` and the chain STOPS (falling through a failure would
// fabricate "no PLU here" out of an outage — §CONTEXT-DATA-HONESTY).

import { SpanStatusCode, trace } from '@opentelemetry/api';
import { fetchAbsent, fetchFound, fetchTransient, type FetchOutcome } from '@pryzm/schemas';
import type { EnvelopeRefusal } from '@pryzm/schemas';
import { isInFrance, FRANCE_BBOX } from '../../parcelProviders/countryBbox.js';
import {
    resolveRegisteredJurisdictionAt,
    type JurisdictionClaimResolution,
    type JurisdictionCoverage,
} from '../../rulepacks/registry.js';
import {
    frGpuFeaturesAtPoint,
    type FrFetchDeps,
    type FrGpuFeature,
} from './frGpuClient.js';
import {
    frNoZoneServedRefusal,
    frRnuRefusal,
    frZoneNamedRefusal,
    parseFrGpuZoneFeature,
    parseFrMunicipalityFeature,
    type FrMunicipalityStatus,
    type FrZoneDocumentKind,
    type FrZoneIdentity,
} from './frZoneIdentity.js';
import { FR_ADAPTER_SOURCES } from './frSources.js';

const tracer = trace.getTracer('pryzm.siteintel.fr');

/**
 * §J `precedence: ApplicabilityLadder` — France's, as DATA. Rung 0 is not a GPU layer: it is
 * the registered-jurisdiction guard (Paris today; any future PLUi pack) that this national
 * leg yields to structurally. Numeric rules never appear on any rung of THIS adapter.
 */
export const FR_APPLICABILITY_LADDER = [
    {
        step: 'registered jurisdiction pack (fr-75056-paris PLU bioclimatique today) — the certified/deeper path',
        mode:
            'DEFER: the chain consults resolveRegisteredJurisdictionAt first and yields by name; ' +
            'the L5 dispatch ladder owns every per-parcel outcome inside a registered extent.',
    },
    {
        step: 'GPU zone-urba (PLU / PLUi / POS / PSMV zone at point)',
        mode:
            'IDENTITY: libelle/typezone/idurba/nomfic verbatim → zone-named no-rule-pack refusal. ' +
            'Numbers live in the règlement (E8 reader, no-reader-configured today) — never asserted here.',
    },
    {
        step: 'GPU secteur-cc (carte communale sector at point)',
        mode:
            'IDENTITY: libelle/typesect/idurba (…_CC_…) → sector-named no-rule-pack refusal. Measured ' +
            '2026-09-02: the brief\'s own rural point is a CC sector "N" invisible to zone-urba.',
    },
    {
        step: 'GPU municipality (commune + is_rnu)',
        mode:
            'REGIME: is_rnu=true → RNU named refusal (national rules ARE the answer, not a gap); ' +
            'is_rnu=false with no zone served → no-plan-at-point refusal naming the commune; ' +
            '0 features → honest absent (sea / not French territory).',
    },
] as const;

/* ────────────────────────────── the resolution union ──────────────────── */

/** The chain yielded to a DEEPER registered path (Paris today). Not a refusal, not a card. */
export interface FrResolutionDeferred {
    readonly kind: 'deferred';
    /** The registered jurisdiction id(s) that claim the point (1 when resolved; 2+ on a tie). */
    readonly to: readonly string[];
    /** Display name(s), same order. */
    readonly displayNames: readonly string[];
}

/** A zone/sector identity resolved — carried WITH its zone-named refusal. */
export interface FrResolutionZone {
    readonly kind: 'zone';
    readonly documentKind: FrZoneDocumentKind;
    /** Every zone the GPU served at the point, verbatim order. Overlaps are NAMED, never ranked here. */
    readonly zones: readonly FrZoneIdentity[];
    readonly refusal: EnvelopeRefusal;
}

/** The commune is under the Règlement national d'urbanisme — a regime answer. */
export interface FrResolutionRnu {
    readonly kind: 'rnu';
    readonly municipality: FrMunicipalityStatus;
    readonly refusal: EnvelopeRefusal;
}

/** A local document exists (is_rnu=false) but no zone polygon is published at the point. */
export interface FrResolutionNoZoneServed {
    readonly kind: 'no-zone-served';
    readonly municipality: FrMunicipalityStatus;
    readonly refusal: EnvelopeRefusal;
}

/**
 * The FR national zone-identity resolution. Every non-deferred branch carries a typed,
 * CITED `EnvelopeRefusal` naming what IS known — there is deliberately no branch that
 * carries a number.
 */
export type FrZoneIdentityResolution =
    | FrResolutionDeferred
    | FrResolutionZone
    | FrResolutionRnu
    | FrResolutionNoZoneServed;

/** Injectable dependencies for the chain (fetch + the registered-jurisdiction guard). */
export interface FrChainDeps extends FrFetchDeps {
    /**
     * Override the registered-jurisdiction guard (tests inject a fake). Production default is
     * THE `resolveRegisteredJurisdictionAt` — never a copied bbox.
     */
    readonly resolveRegisteredJurisdiction?: (
        lat: number,
        lon: number,
    ) => JurisdictionClaimResolution<JurisdictionCoverage>;
}

/* ────────────────────────────── the chain ─────────────────────────────── */

/** Map one GPU document rung's features → identities, refusing by name when unusable. */
function mapZoneRung(
    documentKind: FrZoneDocumentKind,
    features: readonly FrGpuFeature[],
): FetchOutcome<FrResolutionZone> {
    const zones: FrZoneIdentity[] = [];
    for (const f of features) {
        const z = parseFrGpuZoneFeature(documentKind, f.properties);
        if (z !== null) zones.push(z);
    }
    if (zones.length === 0) {
        // The source answered with features none of which carries a libelle — an unusable
        // answer is a REFUSAL naming the cause, never "no zone here" (settled spelling
        // `mapper-refused:` — L-12874; no new token minted).
        return fetchTransient(
            `mapper-refused: gpu/${documentKind} served ${features.length} feature(s) with no libelle — identity unreadable`,
        );
    }
    return fetchFound({
        kind: 'zone',
        documentKind,
        zones,
        refusal: frZoneNamedRefusal(zones as [FrZoneIdentity, ...FrZoneIdentity[]]),
    });
}

/**
 * Resolve the FR national zone identity at a WGS84 point: registered-pack guard → zone-urba
 * → secteur-cc → municipality/RNU (FR_APPLICABILITY_LADDER as code, same order).
 *
 * PURE ORCHESTRATION of typed outcomes + the pure mapper: no envelope math, no typology
 * decisions, and NO NUMBER on any path. Every leg that fails names itself; a failed leg
 * never fabricates an empty; an empty leg never wears a retry card.
 */
export async function resolveFrZoneIdentityAt(
    lat: number,
    lon: number,
    deps: FrChainDeps = {},
): Promise<FetchOutcome<FrZoneIdentityResolution>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.fr.resolveZoneIdentity',
        async (span): Promise<FetchOutcome<FrZoneIdentityResolution>> => {
            try {
                span.setAttribute('fr.lat', lat);
                span.setAttribute('fr.lon', lon);

                // Rung -1: the bbox PRE-FILTER (never the decider — L-12871: the GPU's own
                // municipality answer is what claims/refuses; this only avoids querying a
                // French national service about Warsaw).
                if (!isInFrance(lat, lon)) {
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(
                        `no-feature: ${lat},${lon} is outside FRANCE_BBOX ` +
                            `(${FRANCE_BBOX.minLat}..${FRANCE_BBOX.maxLat}, ${FRANCE_BBOX.minLon}..${FRANCE_BBOX.maxLon}) — ` +
                            'nothing to ask the GPU',
                    );
                }

                // Rung 0: the registered-jurisdiction guard — the certified/deeper path wins,
                // structurally, before any network I/O (acceptance arm 2).
                const resolveGuard = deps.resolveRegisteredJurisdiction ?? resolveRegisteredJurisdictionAt;
                const claim = resolveGuard(lat, lon);
                if (claim.kind === 'resolved') {
                    span.setAttribute('fr.deferredTo', claim.jurisdiction.jurisdictionId);
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchFound<FrZoneIdentityResolution>({
                        kind: 'deferred',
                        to: [claim.jurisdiction.jurisdictionId],
                        displayNames: [claim.jurisdiction.displayName],
                    });
                }
                if (claim.kind === 'ambiguous') {
                    // A registry tie is the DISPATCHER's to arbitrate, never this leg's to
                    // pre-empt — yield naming every candidate.
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchFound<FrZoneIdentityResolution>({
                        kind: 'deferred',
                        to: claim.candidates.map((c) => c.jurisdictionId),
                        displayNames: claim.candidates.map((c) => c.displayName),
                    });
                }

                // Rung 1: zone-urba (PLU/PLUi/POS/PSMV).
                const zoneUrba = await frGpuFeaturesAtPoint('zone-urba', lat, lon, deps);
                if (zoneUrba.status === 'transient' || zoneUrba.status === 'aborted') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'zone-urba did not answer' });
                    return zoneUrba as FetchOutcome<FrZoneIdentityResolution>;
                }
                if (zoneUrba.status === 'found') {
                    const mapped = mapZoneRung('zone-urba', zoneUrba.value);
                    span.setStatus({ code: SpanStatusCode.OK });
                    return mapped as FetchOutcome<FrZoneIdentityResolution>;
                }

                // Rung 2: secteur-cc (carte communale) — only after an honest zone-urba EMPTY.
                const secteurCc = await frGpuFeaturesAtPoint('secteur-cc', lat, lon, deps);
                if (secteurCc.status === 'transient' || secteurCc.status === 'aborted') {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'secteur-cc did not answer' });
                    return secteurCc as FetchOutcome<FrZoneIdentityResolution>;
                }
                if (secteurCc.status === 'found') {
                    const mapped = mapZoneRung('secteur-cc', secteurCc.value);
                    span.setStatus({ code: SpanStatusCode.OK });
                    return mapped as FetchOutcome<FrZoneIdentityResolution>;
                }

                // Rung 3: municipality — the regime answer, and the honest-absent decider.
                const municipality = await frGpuFeaturesAtPoint('municipality', lat, lon, deps);
                if (municipality.status !== 'found') {
                    // transient stays transient; absent = no French commune claims the point
                    // (sea / foreign territory inside the coarse bbox) — the honest absent.
                    span.setStatus({ code: SpanStatusCode.OK });
                    return municipality as FetchOutcome<FrZoneIdentityResolution>;
                }
                const mun = parseFrMunicipalityFeature(municipality.value[0]!.properties);
                if (mun === null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'municipality unreadable' });
                    return fetchTransient(
                        'mapper-refused: gpu/municipality served a feature without insee/name/is_rnu — regime unreadable',
                    );
                }
                span.setStatus({ code: SpanStatusCode.OK });
                if (mun.isRnu) {
                    return fetchFound<FrZoneIdentityResolution>({
                        kind: 'rnu',
                        municipality: mun,
                        refusal: frRnuRefusal(mun),
                    });
                }
                return fetchFound<FrZoneIdentityResolution>({
                    kind: 'no-zone-served',
                    municipality: mun,
                    refusal: frNoZoneServedRefusal(mun),
                });
            } finally {
                span.end();
            }
        },
    );
}

/**
 * The assembled FR country adapter — the §J shape as a value. `rules.kind` is
 * `'zone-identity'`, DELIBERATELY distinct from the siblings' `'structured'`: a consumer
 * that treats this chain as a numeric-rule source is wrong by type, not by accident.
 * (The shared SDK type is still E1bc's to mint — the EE §SEAM-E1BC-FETCHCHAIN note applies
 * verbatim; reconcile HERE when it lands, never by editing core to match an adapter.)
 */
export const frCountryAdapter = {
    country: 'FR' as const,
    sources: () => FR_ADAPTER_SOURCES,
    rules: { kind: 'zone-identity' as const, fetchChain: resolveFrZoneIdentityAt },
    precedence: FR_APPLICABILITY_LADDER,
};

export {
    FR_GPU_APICARTO_BASE,
    FR_GPU_MODULES,
    FR_GPU_USER_AGENT,
    buildFrGpuPointUrl,
    frGpuGetJson,
    frGpuFeaturesAtPoint,
    type FrFetchDeps,
    type FrGpuFeature,
    type FrGpuModule,
} from './frGpuClient.js';
export {
    frInstrumentLabel,
    frNoZoneServedRefusal,
    frRnuRefusal,
    frZoneNamedRefusal,
    parseFrGpuZoneFeature,
    parseFrIdurba,
    parseFrMunicipalityFeature,
    parseFrReglementPageAnchor,
    type FrInstrumentKind,
    type FrMunicipalityStatus,
    type FrZoneDocumentKind,
    type FrZoneIdentity,
} from './frZoneIdentity.js';
export { FR_ADAPTER_SOURCES, FR_GPU_SOURCE_ID } from './frSources.js';
