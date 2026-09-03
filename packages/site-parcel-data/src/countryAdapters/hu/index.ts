// LANE HU — THE HUNGARY COUNTRY ADAPTER (REPORT §J shape; E7-family conventions §6.A `index.ts`).
//
// ⭐ HUNGARY IS A DECLARED-DEFERRAL COUNTRY WITH A REAL, KEYLESS-BUT-SAMPLE PROVIDER BEHIND THE
// DEFERRAL — a third shape distinct from Estonia (live national cadastre) and Sweden (credential-
// gated 401 with nothing behind it). The Hungarian state delivers its national cadastre through
// Lechner Tudásközpont's TAKARNET / Geoshop for a FEE; the ONE keyless Cadastral-Parcels service
// it publishes (the INSPIRE CP WFS) is real and free but covers only the Mesterszállás sampling
// municipality (1774 parcels). So this adapter:
//   • resolves a REAL parcel (helyrajzi szám + native-EOV ring) where the sample covers, proving
//     the shape against RECORDED BYTES rather than a spec ([[fake-more-capable-than-real]]); and
//   • returns a self-announcing DECLARED DEFERRAL everywhere else, including the capital — because
//     "the free sample does not reach here" is NOT "no parcel here" (§CONTEXT-DATA-HONESTY).
//
// §J CONFORMANCE MAP:
//   country      → 'HU'
//   sources()    → HU_ADAPTER_SOURCES (keyless INSPIRE CP WFS + fee-gated national cadastre rows)
//   parcel       → resolveHuParcelAtWgs84Point (+ resolveHuParcelByLabelInSample, sample-scoped)
//   buildings    → NOT WIRED — the INSPIRE BU (Buildings) sample is view-only WMS (Mesterszállás);
//                  no keyless national building geometry. Deferred with the parcel leg.
//   planGeometry → NOT WIRED — E-TÉR (Lechner's national spatial-planning e-system) is view-only
//                  WMS; no open WFS found (envelope-geometry census row 26).
//   rules        → kind: 'unavailable' — the HONEST no-rule-pack path. OTÉK is the national
//                  framework as LEGAL TEXT; local plans are HÉSZ / önkormányzati rendelet documents.
//                  No machine-readable rule channel was sweep-verified, so NO rule mapper is minted
//                  (the brief's "honest no-rule-pack path, not speculative machinery").
//   precedence   → HU_APPLICABILITY_NOTE (stated as a caveat, not a fabricated ladder)
//
// Everything is FetchOutcome end-to-end (C57 §1.5): a fetch that fails names the endpoint and the
// reason; empty and failure are DIFFERENT values, and the fee-gate deferral is neither.

import type { SiteIntelSource } from '@pryzm/schemas';
import { HU_ADAPTER_SOURCES } from './huSources.js';
import { resolveHuParcelAtWgs84Point } from './huParcelProvider.js';

/**
 * §J `precedence` — Hungary's, stated as an HONEST CAVEAT rather than a fabricated ladder. There is
 * no machine-readable normative-rule source to order: OTÉK (Országos Településrendezési és Építési
 * Követelmények) is the national framework as legal text, and the binding local instrument is the
 * municipal HÉSZ (Helyi Építési Szabályzat) / önkormányzati rendelet, also a document. E-TÉR holds
 * the plans nationally but serves them view-only. Any HU envelope will need the document-extraction
 * pipeline (tier 4→5), not a structured feed.
 */
export const HU_APPLICABILITY_NOTE =
    'No structured rule channel: OTÉK (national framework) + HÉSZ / önkormányzati rendelet (local, ' +
    'binding) are LEGAL TEXT; E-TÉR serves plans view-only. Rules require document extraction, not a feed.';

/**
 * The assembled HU country adapter — the §J shape as a value. The shared SDK *type* is not this
 * lane's to mint (see `ee/index.ts` §SEAM-E1BC-FETCHCHAIN); this is a plain object literal, matching
 * the exemplar.
 */
export const huCountryAdapter = {
    country: 'HU' as const,
    sources: (): readonly SiteIntelSource[] => HU_ADAPTER_SOURCES,
    parcel: { resolveAtWgs84Point: resolveHuParcelAtWgs84Point },
    rules: {
        kind: 'unavailable' as const,
        reason: HU_APPLICABILITY_NOTE,
    },
    precedence: HU_APPLICABILITY_NOTE,
};

export { HUNGARY_BBOX, isInHungary } from './huJurisdiction.js';
export {
    HU_INSPIRE_CP_OWS,
    HU_CP_LAYER,
    HU_NATIVE_CRS,
    HU_WGS84_URN,
    buildHuCpLabelUrl,
    buildHuCpWgs84BboxUrl,
    extractHuOwsExceptionText,
    huCpGetFeatures,
    type HuWfsDeps,
    type HuWfsFeature,
} from './huInspireCpClient.js';
export {
    HU_PARCEL_PROVIDER_ID,
    HU_PARCEL_PROVIDER_LABEL,
    HU_INSPIRE_CP_DEFERRED_TOKEN,
    HU_INSPIRE_CP_SAMPLE_COVERAGE,
    HU_CADASTRE_DEFERRAL,
    assertHuCadastreDeferralNotExpired,
    huCadastreDeferredRefusal,
    huInspireCpCoversPoint,
    parseHuParcelFeature,
    resolveHuParcelAtWgs84Point,
    resolveHuParcelByLabelInSample,
    type HuCadastralParcel,
    type HuLandUse,
} from './huParcelProvider.js';
export {
    HU_INSPIRE_CP_SOURCE_ID,
    HU_NATIONAL_CADASTRE_SOURCE_ID,
    HU_GEOSHOP_ENDPOINT,
    HU_ADAPTER_SOURCES,
    HU_ADAPTER_ENDPOINT_BINDINGS,
} from './huSources.js';
