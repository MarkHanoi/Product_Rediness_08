// LANE SI — THE SLOVENIA COUNTRY ADAPTER (REPORT §J shape), built on the Estonia exemplar
// (`countryAdapters/ee/index.ts`) — same boundary, same FetchOutcome discipline, same separation of
// the ONE impure fetch seam from pure parsing. Where SI deviates from EE it is because the SOURCE
// differs, and every deviation is named:
//
//   • ONE keyless service, not two. Slovenia's GURS Kataster nepremičnin is a single national
//     GeoServer WFS serving parcels (this lane's deliverable) alongside buildings/land-use layers.
//     The parcel leg is LIVE and keyless — no MitID/APIM/self-service gate anywhere (contrast SE,
//     whose parcel leg is a declared 401 deferral).
//
//   • NATIVE CRS ON THE OBJECT. The KN WFS advertises only EPSG:3794 (D96/TM) yet reprojects a
//     WGS84 query server-side (measured). The provider queries with a WGS84 bbox and keeps the
//     ring in native 3794 — the EE `NativeCrsGeometry` discipline; no hand-rolled projection. The
//     browser proxy (`server/jurisdiction/euCadastreProxy.js` `si` row) is the one that asks for a
//     WGS84 ring via `srsName=EPSG:4326`, exactly as the EE proxy does over EE's projected CRS.
//
//   • NO NATIONAL RULE PACK — the honest no-rule-pack path. Slovenia's numeric building rules
//     (prostorski izvedbeni pogoji: FZ, FI, heights, setbacks) live in municipal OPN act TEXT, not
//     in a machine-readable national feed (sweep 2026-08-31 · census 2026-09-02). What IS national
//     and machine-readable is ENVELOPE GEOMETRY — the MNVP planning WFS's `REG_CRTE_OPN` regulation
//     lines typed "Gradbena meja" (building boundary) + `REG_POVRSINE_OPN` + `NRP_OPN` land use —
//     recorded in `siSources.ts` as the rules/envelope half and pointed at by
//     {@link SI_ENVELOPE_GEOMETRY_CHANNEL}, but NOT turned into a rule mapper by this parcel lane
//     (a stub built without a live numeric-rule channel would be the fake-more-capable-than-real
//     defect). So `rules.kind` is `'none'`, with the reason and the pointer carried honestly.
//
// §J CONFORMANCE MAP:
//   country      → 'SI'
//   sources()    → SI_SOURCES (the KN parcel WFS + the MNVP planning WFS, dated probe logs)
//   parcel       → resolveSiParcelAtWgs84Point / resolveSiParcelByEid (KN, keyless, native 3794)
//   buildings    → NOT WIRED by this lane. ⚠ DISCOVERY, recorded not actioned: the SAME KN WFS
//                  serves `SI.GURS.KN:STAVBE` / `STAVBE_OBRIS` (buildings + outlines) and
//                  `DELI_STAVB` / `ETAZE` (units + storeys) — a buildings-lane job, noted in
//                  audit/europe-adapters-2/2026-09-02/lane-si.md.
//   planGeometry → NOT WIRED by this lane. The MNVP planning WFS (REG_CRTE_OPN etc.) is the
//                  envelope-geometry channel — {@link SI_ENVELOPE_GEOMETRY_CHANNEL}.
//   rules        → kind: 'none' — no national machine-readable numeric rule pack (municipal text).
//   documents    → n/a for the parcel leg.
//   precedence   → SI_APPLICABILITY_LADDER, recorded as DATA with its honest caveat.
//   vocabulary   → n/a (no rule mapper minted).
//
// Everything is FetchOutcome end-to-end (C57 §1.5): a fetch that fails names the endpoint and the
// reason; EMPTY and FAILURE are DIFFERENT VALUES.

import type { SiteIntelSource } from '@pryzm/schemas';
import { SI_MNVP_PA_WFS_BASE, SI_SOURCES } from './siSources.js';

/**
 * §J `precedence: ApplicabilityLadder` — Slovenia's, as DATA. Recorded so silence on the machine
 * channels is never read as "no rule exists": the numeric rungs are in municipal OPN act TEXT.
 */
export const SI_APPLICABILITY_LADDER = [
    {
        step: 'REG_CRTE_OPN / REG_POVRSINE_OPN (OPN regulation lines/surfaces — "Gradbena meja" building boundary)',
        mode: 'DIRECT GEOMETRY (national MNVP WFS, plan-linked + validity-dated) — the envelope-geometry channel',
    },
    {
        step: 'NRP_OPN (namenska raba prostora — land use from every municipal OPN)',
        mode: 'DIRECT (use category) national, machine-readable',
    },
    {
        step: 'prostorski izvedbeni pogoji (PIP: FZ, FI, heights, setbacks)',
        mode: 'DOCUMENT-BOUND — municipal OPN act TEXT (PIS portal pis.eprostor.gov.si); NO national machine-readable feed → tier 4→5 extraction, not minted here',
    },
] as const;

/**
 * The rules half's live channel — recorded, not consumed by this PARCEL lane. The MNVP planning WFS
 * serves the envelope geometry (regulation lines typed "Gradbena meja", regulation surfaces, land
 * use); a rule mapper over it is a separate rules/envelope lane, not a parcel deliverable.
 */
export const SI_ENVELOPE_GEOMETRY_CHANNEL = {
    endpoint: SI_MNVP_PA_WFS_BASE,
    layers: ['SI.MNVP.PA:REG_CRTE_OPN', 'SI.MNVP.PA:REG_POVRSINE_OPN', 'SI.MNVP.PA:NRP_OPN'] as const,
    note:
        'ENVELOPE-GEOMETRY / rules half (census CONSUME-GEOMETRY). Numeric FZ/FI/heights are ' +
        'municipal OPN act text, so no national rule pack is minted here.',
} as const;

/**
 * The assembled SI country adapter — the §J shape as a value. The shared SDK *type* is E1bc's to
 * mint (§SEAM-E1BC-FETCHCHAIN in the EE header); this is field-for-field to the §J sketch. `rules`
 * is the honest no-rule-pack path — a `kind: 'none'` that names the reason and points at the
 * envelope-geometry channel, rather than a stub that would fake a national numeric feed.
 */
export const siCountryAdapter = {
    country: 'SI' as const,
    sources: (): readonly SiteIntelSource[] => SI_SOURCES,
    rules: {
        kind: 'none' as const,
        reason:
            'No national machine-readable numeric rule pack: Slovenia\'s FZ/FI/height/setback rules ' +
            'are municipal OPN act text. National machine-readable planning data is ENVELOPE GEOMETRY ' +
            '(MNVP REG_CRTE_OPN "Gradbena meja" + REG_POVRSINE_OPN + NRP_OPN) — see SI_ENVELOPE_GEOMETRY_CHANNEL.',
        envelopeGeometryChannel: SI_ENVELOPE_GEOMETRY_CHANNEL,
    },
    precedence: SI_APPLICABILITY_LADDER,
};

export { SLOVENIA_BBOX, isInSlovenia, SLOVENIA_BBOX_OVERLAP_AUDIT } from './siJurisdiction.js';
export {
    SI_KN_WFS_BASE,
    SI_PARCEL_LAYER,
    SI_NATIVE_CRS,
    SI_WGS84_URN,
    extractSiOwsExceptionText,
    siWfsGetFeatures,
    buildSiWgs84BboxUrl,
    buildSiEidCqlUrl,
    type SiWfsDeps,
    type SiWfsFeature,
} from './siWfsClient.js';
export {
    SI_PARCEL_PROVIDER_ID,
    SI_PARCEL_PROVIDER_LABEL,
    parseSiParcelFeature,
    resolveSiParcelAtWgs84Point,
    resolveSiParcelByEid,
    type SiParcel,
} from './siParcelProvider.js';
export { SI_MNVP_PA_WFS_BASE, SI_PARCEL_SOURCE_ID, SI_SOURCES } from './siSources.js';
