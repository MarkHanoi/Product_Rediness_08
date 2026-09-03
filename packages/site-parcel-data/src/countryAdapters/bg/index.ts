// LANE BG — THE BULGARIA COUNTRY ADAPTER (REPORT §J shape; europe-adapters conventions: the ladder
// as data, the `<cc>CountryAdapter` value, the explicit re-exports). Assembles the BG arms into the
// §J shape.
//
// ⭐ BULGARIA IS A LIVE-CADASTRE / DOCUMENTS-ONLY-RULES COUNTRY, AND THAT SPLIT IS THE POINT.
//   • PARCEL — LIVE, KEYLESS, PROVEN. The GCCA/AGKK INSPIRE Cadastral-Parcels service answers a
//     keyless ArcGIS REST query (capabilities Data,Map,Query) at inspire.cadastre.bg; Sofia resolves
//     to a real cadastral identifier "68134.100.5" (68134 = the EKATTE settlement code for Sofia)
//     with a WGS84 ring (bgCadastreClient.ts / bgParcelProvider.ts). The channel hint said "likely
//     credential-gated"; the live re-probe REFUTED that for the PARCEL leg — the gate is on the
//     official PAID extract and on the WAF-guarded KAIS app backend (arcgis.cadastre.bg), not on the
//     INSPIRE view/query channel.
//   • RULES — DOCUMENTS-ONLY. Bulgarian development control lives in устройствени планове per
//     municipality — общ устройствен план (ОУП) + подробен устройствен план (ПУП), under the ЗУТ
//     framework — as PDF/DWG documents, with NO national machine-readable zoning register. Sofia has
//     a city GIS island (Sofiaplan / sofia-agk, incl. a code→ЗУЗСО-table join — envelope-geometry
//     census 2026-09-02), but that is one city, not a national feed. So this adapter serves NO rule
//     pack — `rules.kind: 'documents-only'` — rather than a stub client written against nothing
//     ([[fake-more-capable-than-real]]). A future ОУП/ПУП extraction pipeline is the retirement path.
//
// §J CONFORMANCE MAP:
//   country      → 'BG'
//   sources()    → BG_SOURCES (the keyless INSPIRE parcel service + the paid KAIS extract row)
//   parcel       → resolveBgParcelAtWgs84Point / resolveBgParcelByReference (bgParcelProvider.ts)
//   buildings    → NOT SERVED here: the GCCA INSPIRE Buildings WMS is a VIEW service (no keyless
//                  feature geometry+height product confirmed; no national LoD/height) — the OSM
//                  footprint the universal fallback already provides is the honest answer.
//   planGeometry → DOCUMENTS-ONLY (see above) — no national machine-readable channel exists to serve.
//   rules        → kind: 'documents-only' — the honest no-rule-pack path (below).
//   documents    → OUP/PUP municipal plan documents; the parcel carries its INSPIRE id for a join.
//   precedence   → BG_APPLICABILITY_LADDER (ЗУТ framework → ОУП → ПУП), recorded as DATA + caveat.
//
// ⛔ ROUTING NOTE (bgJurisdiction.ts): the registry row's `contains` is `claimsNation('BG')`, and BG
// is NOT modelled by the national-jurisdiction resolver — so the row is REGISTERED-BUT-INERT today
// (a Sofia click falls to the OSM footprint). The parcel adapter is nonetheless LIVE and directly
// usable (and directly proven); the deferral is of the two shared-infrastructure wiring steps named
// in BG_ROUTING_DEFERRAL, not of the data. See bgJurisdiction.ts.
//
// Everything here is FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values.

import type { SiteIntelSource } from '@pryzm/schemas';
import { BG_SOURCES } from './bgSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Bulgaria's, AS DATA and with its caveat. It exists in LAW
 * (the ЗУТ / Устройство на територията framework) but NOT as a machine-readable register: every
 * rung is a document, so no rung emits a per-rule R1 numeric today. Analogous in shape to GR's
 * laddered `precedence`, but every step's `mode` is DOCUMENT extraction, never a served attribute.
 */
export const BG_APPLICABILITY_LADDER = [
    {
        step: 'ЗУТ (Закон за устройство на територията) — the national framework: use categories + устройствени режими',
        mode: 'DOCUMENT — legal text; the national framework, not per-parcel numerics',
    },
    {
        step: 'общ устройствен план (ОУП) — the municipal comprehensive plan: устройствени зони + parameters (Кинт/плътност/височина)',
        mode: 'DOCUMENT — PDF/DWG per municipality; no national machine-readable register (extraction pipeline tier 5+)',
    },
    {
        step: 'подробен устройствен план (ПУП) — the detailed plan: застроителна линия + specific parameters per УПИ',
        mode: 'DOCUMENT — scanned/DWG plan sheets; Sofia has a city GIS island (Sofiaplan), not a national feed',
    },
] as const;

/** The rules leg, stated as a VALUE: Bulgaria serves no national machine-readable rule pack. */
export const BG_RULES_DOCUMENTS_ONLY = Object.freeze({
    kind: 'documents-only' as const,
    reason:
        'Bulgarian development control (устройствени планове — ОУП/ПУП under the ЗУТ framework) is ' +
        'PDF/DWG per municipality; there is NO national machine-readable zoning register. Sofia has a ' +
        'city GIS island (Sofiaplan / sofia-agk, incl. a code→ЗУЗСО-table join — envelope-geometry ' +
        'census 2026-09-02), but one city is not a national feed. No rule pack is served rather than a ' +
        'stub written against nothing. Retirement path: an ОУП/ПУП document-extraction pipeline.',
});

/**
 * The assembled BG country adapter — the §J shape as a value. Field-for-field mapping to the REPORT
 * §J sketch is in the header comment. The shared SDK `CountryAdapter` TYPE is not this lane's to
 * mint (grep 2026-09-03 finds none outside the adapter dirs) — this is a structural value.
 */
export const bgCountryAdapter = {
    country: 'BG' as const,
    sources: (): readonly SiteIntelSource[] => BG_SOURCES,
    rules: BG_RULES_DOCUMENTS_ONLY,
    precedence: BG_APPLICABILITY_LADDER,
};

export {
    BULGARIA_BBOX,
    isInBulgaria,
    BG_ROUTING_DEFERRAL,
} from './bgJurisdiction.js';
export {
    BG_INSPIRE_CADASTRE_BASE,
    BG_INSPIRE_CADASTRE_WMS,
    BG_PARCEL_LAYER_ID,
    BG_WMS_LAYER,
    BG_LAYER_STORAGE_CRS,
    BG_RING_CRS,
    BG_PARCEL_OUT_FIELDS,
    bgParcelQueryUrl,
    bgParcelPointQuery,
    bgParcelWhereQuery,
    buildBgWmsGetFeatureInfoUrl,
    parseBgWmsGetFeatureInfo,
    extractBgArcgisError,
    bgSqlLiteral,
    bgStr,
    bgNum,
    bgEsriOuterRing,
    type BgArcgisDeps,
} from './bgCadastreClient.js';
export {
    BG_PARCEL_PROVIDER_ID,
    BG_PARCEL_PROVIDER_LABEL,
    BG_INCOMPLETE_CADASTRE_CAVEAT,
    parseBgParcelFeature,
    resolveBgParcelAtWgs84Point,
    resolveBgParcelByReference,
    type BgCadastralParcel,
} from './bgParcelProvider.js';
export {
    BG_PARCEL_SOURCE_ID,
    BG_KAIS_EXTRACT_SOURCE_ID,
    BG_KAIS_ENDPOINT,
    BG_WMS_ENDPOINT,
    BG_SOURCES,
    BG_ADAPTER_ENDPOINT_BINDINGS,
} from './bgSources.js';
