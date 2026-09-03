// LANE GR — THE GREECE COUNTRY ADAPTER (REPORT §J shape; europe-adapters conventions: the ladder
// as data, the `<cc>CountryAdapter` value, the explicit re-exports). Assembles the GR arms into
// the §J shape.
//
// ⭐ GREECE IS A LIVE-CADASTRE / DOCUMENTS-ONLY-RULES COUNTRY, AND THAT SPLIT IS THE POINT.
//   • PARCEL — LIVE, KEYLESS, PROVEN. The Hellenic Cadastre operating parcels answer a keyless
//     ArcGIS Online FeatureServer; Athens/Syntagma resolves to a real KAEK with a WGS84 ring
//     (grKtimatologioClient.ts / grParcelProvider.ts). The channel hint said "likely GATED"; the
//     live re-probe REFUTED that — the gate is on the OLD INSPIRE path, not on the current AGOL org.
//   • RULES — DOCUMENTS-ONLY. Greek building terms (όροι δόμησης: συντελεστής δόμησης = FAR,
//     κάλυψη = coverage, ύψος = height) are set by presidential decree published in the Government
//     Gazette (FEK) as PDF/SCANNED text + diagrams. The street-alignment and building lines
//     (ρυμοτομικές + οικοδομικές γραμμές) exist in approved street plans as scanned diagrams only.
//     There is NO national machine-readable zoning register; the digitization programmes
//     (e-Poleodomia) are dead/unreachable stubs (gis.epoleodomia.gov.gr = dead page,
//     geoportal.ypen.gr = connect-fail; census 2026-09-02). So this adapter serves NO rule pack —
//     `rules.kind: 'documents-only'` — rather than a stub client written against nothing
//     ([[fake-more-capable-than-real]]). A future FEK/AI-extraction pipeline is the retirement path.
//
// §J CONFORMANCE MAP:
//   country      -> 'GR'
//   sources()    -> GR_SOURCES (one probed row: the operating-cadastre parcel layer)
//   parcel       -> resolveGrParcelAtWgs84Point / resolveGrParcelByKaek (grParcelProvider.ts)
//   buildings    -> NOT SERVED here: no national open footprint+height product confirmed (sweep:
//                   DTM/orthophotos via Ktimatologio; OSM/Overture/EUBUCCO fallback) — the OSM
//                   footprint the universal fallback already provides is the honest answer.
//   planGeometry -> DOCUMENTS-ONLY (see above) — no machine-readable channel exists to serve.
//   rules        -> kind: 'documents-only' — the honest no-rule-pack path (below).
//   documents    -> the FEK gazette + the parcel's own LINK (ΟΤΑ card URL) carried on each parcel.
//   precedence   -> GR_APPLICABILITY_LADDER (FEK decree -> street plan lines), recorded as DATA + caveat.
//
// ⛔ ROUTING NOTE (grJurisdiction.ts): the registry row's `contains` is `claimsNation('GR')`, and
// GR is NOT YET modelled by the national-jurisdiction resolver — so the row is REGISTERED-BUT-INERT
// today (an Athens click falls to the OSM footprint). The parcel adapter is nonetheless LIVE and
// directly usable (and directly proven); the deferral is of the two shared-infrastructure wiring
// steps named in GREECE_ROUTING_DEFERRAL, not of the data. See grJurisdiction.ts.
//
// Everything here is FetchOutcome end-to-end (C57 §1.5): empty and failure are DIFFERENT values.

import type { SiteIntelSource } from '@pryzm/schemas';
import { GR_SOURCES } from './grSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Greece's, AS DATA and with its caveat. It exists in LAW
 * (the FEK decree hierarchy) but NOT as a machine-readable register: every rung is a document, so
 * no rung emits a per-rule R1 numeric today. Analogous in shape to LU/NO's laddered `precedence`,
 * but every step's `mode` is DOCUMENT extraction, never a served attribute.
 */
export const GR_APPLICABILITY_LADDER = [
    {
        step: 'όροι δόμησης by presidential decree (FEK): συντελεστής δόμησης (FAR) · κάλυψη (coverage) · ύψος (height)',
        mode: 'DOCUMENT — FEK gazette PDF/scan; no machine-readable register (extraction pipeline tier 5+)',
    },
    {
        step: 'approved street plan (ρυμοτομικό σχέδιο): ρυμοτομική + οικοδομική γραμμή (street-alignment + building lines)',
        mode: 'DOCUMENT — scanned diagrams only; the founder\'s Type-A objects, not served as geometry today',
    },
    {
        step: 'local plan (Τοπικό/Ειδικό Πολεοδομικό Σχέδιο) + special regimes (traditional settlements, coastal, forest)',
        mode: 'DOCUMENT — decree + map; e-Poleodomia digitization dead/unreachable this pass (census 2026-09-02)',
    },
] as const;

/** The rules leg, stated as a VALUE: Greece serves no machine-readable rule pack. */
export const GR_RULES_DOCUMENTS_ONLY = Object.freeze({
    kind: 'documents-only' as const,
    reason:
        'Greek building terms (όροι δόμησης) are FEK-gazette PDF/scanned decrees; there is no ' +
        'national machine-readable zoning register, and the e-Poleodomia digitization channels are ' +
        'dead/unreachable (gis.epoleodomia.gov.gr = dead page, geoportal.ypen.gr = connect-fail, ' +
        'census 2026-09-02). No rule pack is served rather than a stub written against nothing. ' +
        'Retirement path: an FEK/AI legal-text extraction pipeline (a large future market, LL-quality ' +
        'Greek legal text — sweep 2026-08-31).',
});

/**
 * The assembled GR country adapter — the §J shape as a value. Field-for-field mapping to the
 * REPORT §J sketch is in the header comment. The shared SDK `CountryAdapter` TYPE is not this
 * lane's to mint (grep 2026-09-03 finds none outside the adapter dirs) — this is a structural value.
 */
export const grCountryAdapter = {
    country: 'GR' as const,
    sources: (): readonly SiteIntelSource[] => GR_SOURCES,
    rules: GR_RULES_DOCUMENTS_ONLY,
    precedence: GR_APPLICABILITY_LADDER,
};

export {
    GREECE_BBOX,
    isInGreece,
    GREECE_ROUTING_DEFERRAL,
} from './grJurisdiction.js';
export {
    GR_KTIMATOLOGIO_AGOL_BASE,
    GR_PARCEL_SERVICE,
    GR_PARCEL_LAYER_ID,
    GR_LAYER_STORAGE_CRS,
    GR_RING_CRS,
    GR_PARCEL_OUT_FIELDS,
    grParcelQueryUrl,
    grParcelPointQuery,
    grParcelWhereQuery,
    extractGrArcgisError,
    grSqlLiteral,
    grStr,
    grNum,
    grEsriOuterRing,
    type GrArcgisDeps,
} from './grKtimatologioClient.js';
export {
    GR_PARCEL_PROVIDER_ID,
    GR_PARCEL_PROVIDER_LABEL,
    GR_INCOMPLETE_CADASTRE_CAVEAT,
    parseGrParcelFeature,
    resolveGrParcelAtWgs84Point,
    resolveGrParcelByKaek,
    type GrCadastralParcel,
} from './grParcelProvider.js';
export { GR_PARCEL_SOURCE_ID, GR_SOURCES, GR_ADAPTER_ENDPOINT_BINDINGS } from './grSources.js';
