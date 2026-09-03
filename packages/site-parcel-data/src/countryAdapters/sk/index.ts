// LANE SK — THE SLOVAKIA COUNTRY ADAPTER (REPORT §J shape). Assembles the SK arms into the §J shape
// the EE adapter established (mirror the proven executor, no rival). Slovakia is the GR shape: a
// LIVE, KEYLESS, LIVE-PROVEN cadastre whose only open gate is JURISDICTION ROUTING, plus a
// DOCUMENTS-ONLY rules stance.
//
//   PARCEL  (LIVE)        — ÚGKK/GKÚ ESKN C-register parcels answer a keyless ArcGIS MapServer and
//                           were LIVE-PROVEN at Bratislava (register-C id 2090872505, parcel №15,
//                           k.ú. 2933, 832 m²). skParcelProvider.ts / skEsknClient.ts carry it.
//   ROUTING (DEFERRED)    — SVK is a REFUSAL-ONLY NEIGHBOUR (not a claimable country) in the
//                           resolver's boundary set, so claimsNation('SK') is false everywhere and
//                           the registry row is DORMANT until a boundary wave PROMOTES SVK
//                           (skJurisdiction.ts SK_ROUTING_DEFERRAL). This is the single-line flip the
//                           L-12871 design promises — no change here when it lands.
//   RULES   (DOCUMENTS)   — the honest NO-RULE-PACK path (see below); no rule mapper.
//
// §J CONFORMANCE MAP:
//   country      → 'SK'
//   sources()    → SK_SOURCES (1 row: the ESKN C-parcel layer, LIVE, with the dated probe log)
//   parcel       → resolveSkParcelAtWgs84Point / resolveSkParcelByRegisterCId
//   planGeometry → none — Slovakia serves no national plan geometry (územné plány = municipal PDFs)
//   rules        → kind: 'documents-only' — the honest no-rule-pack path; no rule mapper
//   documents    → none served for a structured path (municipal PDFs; no machine-readable register)
//   precedence   → SK_APPLICABILITY_LADDER, recorded as DATA with its honest caveats
//   vocabulary   → none (no structured rule channel to map)
//
// ⛔ WHY NO RULE MAPPER (the honest no-rule-pack path, per this lane's brief). The rest-of-europe
// sweep verified NO rules channel serving normative envelope parameters per parcel. Slovakia's
// planning stock (územné plány) is per-municipality PDFs + scattered GIS; the 2022–2025
// construction-law reform created the Úrad pre územné plánovanie a výstavbu with an information-system
// digitization programme on a ~2028 horizon, but it serves no plan geometry today and no
// standard-conformant machine-readable plan package has been observed served (sweep + envelope census
// row 25 "DOCUMENTS-ONLY"). A rule mapper stub is justified ONLY where a real rules channel was
// sweep-verified; there is none, so this adapter mints no rules and says so — never a speculative
// vocabulary built from a reform roadmap ([[fake-more-capable-than-real]]).
//
// ⛔ C74 §3.8 — the deferral is DECLARED IN THE BARREL, not only in the header. The one deferred leg
// (ROUTING) is `SK_ROUTING_DEFERRAL`, an assertable data record; the two parcel resolvers are LIVE
// (not deferred), so there is no `SK_DEFERRED_LEGS` list of refusing callables — everything callable
// here actually answers.
//
// §SEAM-E1BC-FETCHCHAIN (the EE seam, unchanged): when the shared SDK `CountryAdapter`/`fetchChain`
// type lands, reconcile HERE (rename/wrap), never by editing core to match an adapter.

import type { SiteIntelSource } from '@pryzm/schemas';
import {
    SLOVAKIA_BBOX,
    SK_ROUTING_DEFERRAL,
    claimsSlovakia,
    isInSlovakia,
} from './skJurisdiction.js';
import {
    SK_PARCEL_PROVIDER_ID,
    SK_PARCEL_PROVIDER_LABEL,
    resolveSkParcelAtWgs84Point,
    resolveSkParcelByRegisterCId,
    type SkCadastralParcel,
} from './skParcelProvider.js';
import { SK_PARCEL_SOURCE_ID, SK_SOURCES } from './skSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Slovakia's, as DATA. It exists in LAW (územný plán obce /
 * zóny → the regulatívy of the ÚPN) but NOT as machine-readable geometry today, so no rung is
 * emitted as a per-rule rank — recording the ladder here and refusing to fake a per-rule value is
 * the distinction between "no ladder exists" and "the ladder exists but is adapter data".
 */
export const SK_APPLICABILITY_LADDER = [
    {
        step: 'územný plán zóny (ÚPN-Z, zonal plan) — the most specific binding instrument',
        mode:
            'DOCUMENT-BOUND (regulatívy: index podlažnosti / zastavanosť / výška) as PDF/scattered ' +
            'GIS per municipality. NOT REACHABLE as geometry — no national channel.',
    },
    {
        step: 'územný plán obce (ÚPN-O, municipal general plan) + záväzná časť',
        mode:
            'DOCUMENT-BOUND today (per-municipality PDFs). The 2022–2025 reform + the Úrad pre územné ' +
            'plánovanie a výstavbu IS programme (~2028 horizon) is the emerging channel; stock stays PDF. ' +
            'Watch: first standard-conformant machine-readable plan package becomes consumable.',
    },
    {
        step: 'stavebný zákon / vyhlášky (national building norms) — defaults where the plan is silent',
        mode: 'LEGAL-TEXT. Not consumed by this lane (control: recorded, not scoped).',
    },
    {
        step: 'not-in-cadastre disambiguation',
        mode:
            'absent from the C-register ≠ no parcel: a point may fall on an E-register (former ' +
            'land-register) parcel or outside KN coverage — a registration-fabric fact, never "no land here".',
    },
] as const;

/**
 * The assembled SK country adapter — the §J shape as a value. `rules.kind: 'documents-only'` is the
 * honest no-rule-pack path (gr/index.ts uses the same token): the planning stock IS documents
 * (územné plány), just not machine-readable, and this adapter refuses to invent a structured
 * channel. When the E1bc SDK `CountryAdapter` type lands, reconcile HERE (rename/wrap), never by
 * editing core to match an adapter (§SEAM-E1BC-FETCHCHAIN, ee/index.ts).
 */
export const skCountryAdapter = {
    country: 'SK' as const,
    sources: (): readonly SiteIntelSource[] => SK_SOURCES,
    parcel: {
        atPoint: resolveSkParcelAtWgs84Point,
        byRegisterCId: resolveSkParcelByRegisterCId,
    },
    rules: {
        kind: 'documents-only' as const,
        reason:
            'no national machine-readable rules channel: územné plány are per-municipality PDFs; the ' +
            '2022–2025 construction-law reform + Úrad pre územné plánovanie a výstavbu IS programme ' +
            '(~2028) serves no plan geometry yet.',
    },
    precedence: SK_APPLICABILITY_LADDER,
};

export {
    SLOVAKIA_BBOX,
    SK_ROUTING_DEFERRAL,
    claimsSlovakia,
    isInSlovakia,
} from './skJurisdiction.js';
export {
    SK_ESKN_KN_SERVICE,
    SK_PARCEL_C_LAYER_ID,
    SK_LAYER_STORAGE_CRS,
    SK_RING_CRS,
    SK_PARCEL_OUT_FIELDS,
    skParcelQueryUrl,
    skParcelPointQuery,
    skParcelByObjectIdQuery,
    extractSkArcgisError,
    skStr,
    skNum,
    skEsriOuterRing,
    type SkArcgisDeps,
} from './skEsknClient.js';
export {
    SK_PARCEL_PROVIDER_ID,
    SK_PARCEL_PROVIDER_LABEL,
    parseSkParcelFeature,
    resolveSkParcelAtWgs84Point,
    resolveSkParcelByRegisterCId,
    type SkCadastralParcel,
} from './skParcelProvider.js';
export {
    SK_PARCEL_SOURCE_ID,
    SK_PARCEL_ENDPOINT,
    SK_SOURCES,
    SK_ADAPTER_ENDPOINT_BINDINGS,
} from './skSources.js';
