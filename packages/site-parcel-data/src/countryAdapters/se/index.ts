// LANE E7-SE — THE SWEDEN COUNTRY ADAPTER (REPORT §J shape; E7-family conventions §6.A `index.ts`:
// the ladder as data, the chain resolver, the `<cc>CountryAdapter` value, the explicit re-exports).
//
// ⭐ SWEDEN IS THE FIRST HONESTLY-GATED COUNTRY IN THIS WAVE, AND THE SHAPE IS THE POINT.
// The Swedish state splits the answer across two authorities, and only one of them will talk to an
// unregistered client:
//
//     Boverket · Planbestämmelsekatalogen v2   KEYLESS, LIVE, imported      → WHICH parameters exist
//     Lantmäteriet · NGP detaljplaner          HTTP 401 · 900902 · DEFERRED → WHAT the numbers are
//
// So this adapter can say, for any Swedish parcel, EXACTLY which 83 numeric parameters a detaljplan
// may carry, with each one's denominator, measurement basis, Max/Min/Exakt sense, map symbol and
// legal in-force date — and it says **UNKNOWN, 83 of 83, for every value**. That ratio is asserted
// in the test suite, not narrated. It is the [[identity-bootstrap-gate-offline-legislation-pattern]]
// executed literally: ship the offline half, stub the gated half, never fake a client.
//
// §J CONFORMANCE MAP:
//   country      → 'SE'
//   sources()    → SE_ADAPTER_SOURCES (1 live row + 2 rows whose `gate` is the measured 401)
//   parcel       → resolveSeParcelByDesignation / resolveSeParcelAtWgs84Point  ⛔ DEFERRED
//   planGeometry → resolveSeDetaljplanAtWgs84Point / resolveSeDetaljplanById    ⛔ DEFERRED
//   rules        → kind: 'structured' — resolveSeProvisionChain (LIVE, keyless, Boverket)
//   documents    → the release-pinned catalogue URL rides every rule's `source.document`; no
//                  separate retriever is needed for the structured path
//   precedence   → SE_APPLICABILITY_LADDER, recorded as DATA with its honest caveat
//   vocabulary   → SE_RULE_VOCABULARY (= the 83 imported provisions, seRuleMapper.ts)
//
// ⛔ C74 §3.8 — THE UNWIRED IS DECLARED IN THE BARREL, NOT ONLY IN THE FILES. `SE_DEFERRED_LEGS`
// below is the machine-readable list of everything in this directory that looks callable and
// deliberately refuses. An audit of EXISTENCE must not be able to pass where an audit of
// REACHABILITY fails ([[committed-is-not-reachable]]).
//
// §SEAM-E1BC-FETCHCHAIN — the same seam EE documents: REPORT §J sketches
// `rules.fetch(parcel): FetchOutcome<Rule[]>`; this adapter serves
// `rules.fetchChain(kod, deps?, nowIso?)` keyed by a national PROVISION CODE rather than by a
// parcel, because a parcel-keyed chain is exactly what the credential gate forbids. When the E1bc
// SDK type lands, reconcile HERE (rename/wrap), never by editing core to match an adapter.

import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
    fetchAbsent,
    fetchFound,
    fetchTransient,
    type FetchOutcome,
    type SiteIntelRegulation,
    type SiteIntelRule,
    type SiteIntelSource,
} from '@pryzm/schemas';
import { SE_PBK_PINNED_RELEASE_ID, type SeBoverketDeps } from './seBoverketClient.js';
import { SE_NGP_GATED_ENDPOINTS, seNgpDeferredRefusal } from './seNgpGate.js';
import {
    SE_PROVISIONS_BY_KOD,
    resolveSeProvisionByUuid,
    seProvisionDrift,
    type SePlanProvision,
    type SeServedProvisionRow,
} from './sePlanProvisionCatalogue.js';
import { mapSeProvisionToRules } from './seRuleMapper.js';
import { SE_ADAPTER_SOURCES } from './seSources.js';

const tracer = trace.getTracer('pryzm.siteintel.se');

/**
 * §J `precedence: ApplicabilityLadder` — Sweden's, as DATA. It is NOT emitted as a per-rule R1
 * `rank`, because Boverket serves no rank column (see seRuleMapper.ts's R1 paragraph); recording
 * it here and refusing to fake a per-rule value is the §6.E distinction between "no ladder exists"
 * and "the ladder exists but is adapter data".
 */
export const SE_APPLICABILITY_LADDER = [
    {
        step: 'detaljplan (DP) — the legally binding local plan, PBL 4 kap.',
        mode:
            'STRUCTURED where the plan post-dates BFS 2020:5 (2022-01-01): bestämmelser keyed to ' +
            "Boverket's catalogue with typed values. ⛔ NOT REACHABLE — Lantmäteriet NGP, HTTP 401.",
    },
    {
        step: 'områdesbestämmelser (OB) — binding, used where no detaljplan exists',
        mode: 'same NGP channel, same gate. NOT REACHABLE.',
    },
    {
        step: 'översiktsplan (ÖP) — the municipal comprehensive plan',
        mode:
            'GUIDING, not binding (PBL 3 kap.). Boverket serves a separate ÖP-katalogen API ' +
            '(api.boverket.se/opmodell, also keyless) — NOT consumed by this lane (control 10: ' +
            'recorded, not scoped).',
    },
    {
        step: 'PBL (2010:900) + BBR — national default rules where the plan is silent',
        mode:
            'DOCUMENT-BOUND. Boverket serves its författningssamling as a keyless API ' +
            '(api.boverket.se/forfattningssamling) — recorded, not consumed by this lane.',
    },
    {
        step: 'not-in-NGP disambiguation',
        mode:
            'absent from NGP ≠ no plan: 54 of 290 kommuner had published nothing to NGP as of ' +
            '2025-04, and pre-2022 plans remain scanned PDF until converted. A municipal ' +
            'confirmation step, never an assumption.',
    },
] as const;

/**
 * C74 §3.8 — every export in this directory that is callable and deliberately refuses, with the
 * reason and the endpoint. A test asserts each one actually refuses, so this list cannot drift
 * into a stale claim of deferral for something that has since been wired (or the reverse).
 */
export const SE_DEFERRED_LEGS = [
    { leg: 'parcel by designation', fn: 'resolveSeParcelByDesignation' },
    { leg: 'parcel at WGS84 point', fn: 'resolveSeParcelAtWgs84Point' },
    { leg: 'detaljplan at WGS84 point', fn: 'resolveSeDetaljplanAtWgs84Point' },
    { leg: 'detaljplan by id', fn: 'resolveSeDetaljplanById' },
] as const;

/**
 * One resolved provision with its rules AND the minted referent those rules cite — the R1 referent
 * contract carried IN the result, so no consumer needs an out-of-band id registry.
 */
export interface SeProvisionChain {
    /** The imported definition (this adapter's own row). */
    readonly provision: SePlanProvision;
    /** The row Boverket served just now, for the drift check. */
    readonly served: SeServedProvisionRow;
    /** The minted national-instrument referent every rule's `basis` cites. */
    readonly regulation: SiteIntelRegulation;
    /** The rules — currently always exactly one, and always tier-6 UNKNOWN. */
    readonly rules: readonly SiteIntelRule[];
    /**
     * The gated half, stated as a value rather than as prose: what a Swedish parcel would need
     * before any of `rules` could carry a number.
     */
    readonly valueLeg: FetchOutcome<never>;
}

/**
 * Resolve the SE chain for one Boverket provision code: imported definition → LIVE Boverket
 * re-read (release-pinned) → drift check → E1a rules + minted referent.
 *
 * PURE ORCHESTRATION of typed outcomes. Every leg that fails names itself; a failed leg never
 * fabricates an empty; a code that is not in the imported set is `absent` (a durable fact about
 * the import, not a network failure); a drift between the import and the live service is
 * `transient` naming BOTH strings rather than silently preferring either.
 */
export async function resolveSeProvisionChain(
    kod: string,
    deps: SeBoverketDeps = {},
    nowIso?: string,
): Promise<FetchOutcome<SeProvisionChain>> {
    return tracer.startActiveSpan(
        'pryzm.siteintel.se.resolveProvisionChain',
        async (span): Promise<FetchOutcome<SeProvisionChain>> => {
            try {
                span.setAttribute('se.bestammelsekod', kod);
                // §6.F — the parenthesised form, the only one that survives a caller passing a
                // full ISO timestamp (E7-family §4).
                const fetchedAtIso = (nowIso ?? new Date().toISOString()).slice(0, 10);

                const provision = SE_PROVISIONS_BY_KOD.get(kod);
                if (provision === undefined) {
                    span.setStatus({ code: SpanStatusCode.OK });
                    return fetchAbsent(
                        `no-provision: '${kod}' is not one of the ${SE_PROVISIONS_BY_KOD.size} ` +
                            'in-force NUMERIC provisions this adapter imported from Boverket release ' +
                            `${SE_PBK_PINNED_RELEASE_ID}. Boverket's catalogue holds 3,707 provisions ` +
                            'and 908 in force; the 825 in-force ones with no numeric slot are ' +
                            'deliberately not imported (they carry no value a rule could hold).',
                    );
                }

                const servedOutcome = await resolveSeProvisionByUuid(
                    provision.uuid,
                    deps,
                    SE_PBK_PINNED_RELEASE_ID,
                );
                if (servedOutcome.status !== 'found') {
                    span.setStatus(
                        servedOutcome.status === 'transient'
                            ? { code: SpanStatusCode.ERROR, message: servedOutcome.reason }
                            : { code: SpanStatusCode.OK },
                    );
                    return servedOutcome;
                }
                const served = servedOutcome.value;

                const drift = seProvisionDrift(provision, served);
                if (drift !== null) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'upstream-failed' });
                    return fetchTransient(
                        `upstream-failed: Boverket drift on release ${SE_PBK_PINNED_RELEASE_ID} — ` +
                            `${drift}. The imported vocabulary and the live catalogue disagree; ` +
                            're-run the generator (sePlanProvisionCatalogue.ts header) rather than ' +
                            'preferring either side.',
                    );
                }

                let mapped: ReturnType<typeof mapSeProvisionToRules>;
                try {
                    mapped = mapSeProvisionToRules(provision, fetchedAtIso);
                } catch (e) {
                    span.setStatus({ code: SpanStatusCode.ERROR, message: 'mapper-refused' });
                    return fetchTransient(
                        `mapper-refused: ${e instanceof Error ? e.message : String(e)}`,
                    );
                }

                span.setAttribute('se.rules', mapped.rules.length);
                span.setAttribute(
                    'se.unknownRules',
                    mapped.rules.filter((r) => r.provenance.value === null).length,
                );
                span.setStatus({ code: SpanStatusCode.OK });
                return fetchFound({
                    provision,
                    served,
                    regulation: mapped.regulation,
                    rules: mapped.rules,
                    valueLeg: seNgpDeferredRefusal<never>(
                        `values for provision ${kod}`,
                        SE_NGP_GATED_ENDPOINTS.detaljplanSearch,
                    ),
                });
            } finally {
                span.end();
            }
        },
    );
}

/**
 * The assembled SE country adapter — the §J shape as a VALUE. (DK is currently missing its adapter
 * value entirely, L-12875; that gap is not copied here.)
 */
export const seCountryAdapter = {
    country: 'SE' as const,
    sources: (): readonly SiteIntelSource[] => SE_ADAPTER_SOURCES,
    rules: { kind: 'structured' as const, fetchChain: resolveSeProvisionChain },
    precedence: SE_APPLICABILITY_LADDER,
};

export { SWEDEN_BBOX, SWEDEN_BBOX_OVERLAP_AUDIT, isInSweden } from './seJurisdiction.js';
export {
    SE_NATIVE_CRS,
    SE_PBK_BASE,
    SE_PBK_PINNED_RELEASE_ID,
    SE_PBK_PINNED_RELEASE_NAME,
    SE_PBK_PINNED_RELEASE_PUBLISHED,
    SE_PBK_PINNED_RELEASE_TYPE,
    SE_PBK_PORTAL_CATALOGUE_URL,
    buildSePbkFullFlatReleaseUrl,
    buildSePbkProvisionInReleaseUrl,
    buildSePbkProvisionUrl,
    buildSePbkReleaseUrl,
    buildSePbkValueDomainUrl,
    isSePbkAbsenceBody,
    seBoverketGetJson,
    type SeBoverketDeps,
} from './seBoverketClient.js';
export {
    SE_NGP_DEFERRAL,
    SE_NGP_DEFERRED_TOKEN,
    SE_NGP_GATED_ENDPOINTS,
    SE_NGP_GATE_CODE,
    SE_NGP_GATE_MESSAGE,
    assertSeNgpDeferralNotExpired,
    seNgpDeferredRefusal,
} from './seNgpGate.js';
export {
    SE_NUMERIC_PROVISIONS,
    SE_PBK_CENSUS,
    SE_PBK_CLOSED_VALUE_DOMAINS,
    SE_PROVISIONS_BY_KOD,
    SE_PROVISIONS_BY_UUID,
    assertSeClosedDomainValue,
    parseSeServedProvisionRow,
    resolveSeProvisionByUuid,
    seProvisionDrift,
    type SePlanProvision,
    type SeServedProvisionRow,
} from './sePlanProvisionCatalogue.js';
export {
    SE_PARCEL_PROVIDER_ID,
    SE_PARCEL_PROVIDER_LABEL,
    resolveSeParcelAtWgs84Point,
    resolveSeParcelByDesignation,
    type SeCadastralParcel,
} from './seParcelProvider.js';
export {
    SE_DETALJPLAN_COVERAGE,
    resolveSeDetaljplanAtWgs84Point,
    resolveSeDetaljplanById,
    type SeDetaljplanArea,
    type SeDetaljplanProvisionInstance,
} from './sePlanProvider.js';
export {
    SE_NORMATIVE_FORCE,
    SE_RULE_AUTHORITY,
    SE_RULE_DATASET,
    SE_RULE_VOCABULARY,
    SE_VALUE_BASIS_SCHEME,
    isSeTolkningsbestammelse,
    mapSeNumericProvisionCatalogue,
    mapSeProvisionToRules,
    seRegulationEntityId,
    seRuleEntityId,
    type SeCatalogueRuleSet,
    type SeMappedRuleSet,
} from './seRuleMapper.js';
export {
    SE_ADAPTER_ENDPOINT_BINDINGS,
    SE_ADAPTER_SOURCES,
    SE_FASTIGHETSINDELNING_SOURCE_ID,
    SE_NGP_DETALJPLAN_SOURCE_ID,
    SE_PBK_SOURCE_ID,
} from './seSources.js';
