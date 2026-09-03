// LANE LV — THE LATVIA COUNTRY ADAPTER (REPORT §J shape), built on the ESTONIA exemplar
// (`countryAdapters/ee/`) and the europe-adapters-2 sibling `countryAdapters/ro/` — one authority
// per concept (C84 EI-9), same FetchOutcome discipline, same DECLARED-DEFERRAL idiom for a gate
// this lane cannot clear. Where LV deviates it is because the SOURCE differs, and every deviation
// is named:
//
//   • PARCEL LEG IS LIVE (unlike RO). Latvia's cadastre is a keyless, CC-BY-4.0 GeoServer WFS
//     (geolatvija `vraa:parcel`), live-probed at the capital 2026-09-03. So this adapter ships a
//     WORKING parcel provider — `resolveLvParcelByCode` / `resolveLvParcelAtWgs84Point` — not a
//     deferred stub. The `parcel: { byNationalId, atPoint }` shape mirrors ro/index.ts exactly.
//   • RULES ARE DEFERRED, HONESTLY (the no-rule-pack path). There is NO served numeric envelope in
//     Latvia: TAPIS serves functional-zone GEOMETRY + national codes but no numeric attributes and
//     no building-line layer; the numbers live per zone index in the TIAN legal text (likumi.lv,
//     structured HTML — an F-extraction target). The brief is explicit — "advertise nothing with
//     zero national fill" (PILN/ATN_DOK, census L-12872) — so this adapter refuses to invent a
//     structured rules chain. `rules.kind: 'deferred'` (fr/ro use the same token for a
//     non-structured rules leg). The TAPIS substrate is still recorded in `sources()` so the
//     rules half is discoverable when an extraction lane picks it up.
//   • ROUTING IS DORMANT ON ONE GATE (the resolver-geometry gate). LVA is a refusal-only NEIGHBOUR
//     in `nationalBoundaries.json`, not a claimable country, so `claimsNation('LV')` is false
//     everywhere today and the registry row is DORMANT — see `lvJurisdiction.ts`
//     `LV_JURISDICTION_DEFERRAL`. This is the ONLY gate on Latvia (the SERVICE is open), and it
//     flips live with a single-line boundary-wave addition, no edit here.
//
// §J CONFORMANCE MAP (the interface is REPORT §J's TypeScript sketch):
//   country      → 'LV'
//   sources()    → LV_SOURCES (the live cadastre WFS + the documented TAPIS zoning substrate)
//   parcel       → { byNationalId: resolveLvParcelByCode, atPoint: resolveLvParcelAtWgs84Point }
//   buildings    → NOT WIRED. `vraa:building` (ēkas footprints) is served on the same WFS but is
//                  outside this lane's approved PARCEL scope (E4 control 2 — recorded, not faked).
//   planGeometry → NOT WIRED as a rules source (TAPIS functional zones carry no numeric envelope);
//                  recorded in `sources()` + the ladder as the F-extraction substrate.
//   rules        → kind 'deferred' — no served numeric rules channel; refuses to invent one.
//   documents    → the TIAN saistošie noteikumi on likumi.lv (structured legal HTML), per zone
//                  index — the deferred extraction target, named on the ladder, not fetched here.
//   precedence   → LV_APPLICABILITY_LADDER, recorded as DATA with its honest caveat
//
// §SEAM-E1BC-FETCHCHAIN (inherited from the EE/RO adapter headers): REPORT §J sketches the rules
// leg; the shared SDK `CountryAdapter` type is E1bc's to mint (a grep still finds no such type
// outside the adapter directories). When it lands, reconcile HERE (rename/wrap), never by editing
// core to match an adapter.
//
// Everything is FetchOutcome end-to-end (C57 §1.5): a fetch that fails names the endpoint and the
// reason; EMPTY and FAILURE are DIFFERENT VALUES.

import type { SiteIntelSource } from '@pryzm/schemas';
import { resolveLvParcelByCode, resolveLvParcelAtWgs84Point } from './lvParcelProvider.js';
import { LV_SOURCES } from './lvSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Latvia's, as data. It records where the numeric rules
 * ACTUALLY live, so a consumer is never misled into reading TAPIS geometry as an envelope.
 */
export const LV_APPLICABILITY_LADDER = [
    {
        step: 'Kadastrs land-unit (vraa:parcel) — identity, address, area, purpose_use',
        mode: 'DIRECT structured attributes (live, keyless). Geometry + identity only; NO envelope.',
    },
    {
        step: 'TAPIS funkcionalais_zonejums — functional zone + national code + document linkage',
        mode:
            'DIRECT for the zone CLASSIFICATION (geometry + code + governing document id/date). ' +
            'NO numeric envelope served — TAPIS carries no height/intensity/coverage attributes.',
    },
    {
        step: 'the TIAN (teritorijas izmantošanas un apbūves noteikumi) per zone index',
        mode:
            'the LEGAL source of every numeric limit — structured HTML on likumi.lv, per municipal ' +
            'saistošie noteikumi. NOT served as data → extraction pipeline (F). Deferred, never guessed.',
    },
    {
        step: 'no zone / null numerics',
        mode:
            'absent != no regulation, and null != zero: emitted as UNKNOWN, never read as ' +
            'no-limit (E4 control 9 / §CONTEXT-DATA-HONESTY).',
    },
] as const;

/**
 * The assembled LV country adapter — the §J shape as a value (the EE/RO pattern). The shared SDK
 * *type* is not this lane's to mint: see §SEAM-E1BC-FETCHCHAIN above before "reconciling" this.
 * `rules.kind: 'deferred'` is the honest no-rule-pack path — there is no served numeric rules
 * channel in Latvia and this adapter refuses to invent one.
 */
export const lvCountryAdapter = {
    country: 'LV' as const,
    sources: (): readonly SiteIntelSource[] => LV_SOURCES,
    parcel: {
        byNationalId: resolveLvParcelByCode,
        atPoint: resolveLvParcelAtWgs84Point,
    },
    rules: {
        kind: 'deferred' as const,
        reason:
            'no national machine-readable numeric-rules channel: TAPIS serves functional-zone ' +
            'geometry + national codes but no envelope attributes and no building-line layer; the ' +
            'numbers live per zone index in the TIAN legal text (likumi.lv, structured HTML — ' +
            'F-extraction). PILN/ATN_DOK nationally unpopulated (census L-12872).',
    },
    precedence: LV_APPLICABILITY_LADDER,
};

export {
    LATVIA_BBOX,
    LV_JURISDICTION_DEFERRAL,
    claimsLatvia,
    isInLatvia,
} from './lvJurisdiction.js';
export {
    LV_NATIVE_CRS,
    LV_OUTPUT_CRS,
    LV_VRAA_WFS_BASE,
    LV_WGS84_URN,
    buildLvCqlUrl,
    buildLvWgs84BboxUrl,
    extractLvOwsExceptionText,
    lvWfsGetFeatures,
    type LvWfsDeps,
    type LvWfsFeature,
} from './lvWfsClient.js';
export {
    LV_PARCEL_LAYER,
    LV_PARCEL_PROVIDER_ID,
    LV_PARCEL_PROVIDER_LABEL,
    parseLvParcelFeature,
    resolveLvParcelAtWgs84Point,
    resolveLvParcelByCode,
    type LvCadastralParcel,
} from './lvParcelProvider.js';
export {
    LV_CADASTRE_SOURCE_ID,
    LV_SOURCES,
    LV_TAPIS_WFS_BASE,
    LV_TAPIS_ZONING_SOURCE_ID,
} from './lvSources.js';
