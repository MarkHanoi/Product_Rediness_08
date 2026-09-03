// LANE SI — SLOVENIA (SI) · source discovery: the §J `sources(): SiteIntelSource[]` leg, typed as
// E1a `SiteIntelSource` rows. Two rows, both keyless and live-confirmed:
//
//   1. si-gurs-kn-parcele-wfs  — THE PARCEL DELIVERABLE. GURS Kataster nepremičnin WFS, layer
//      `SI.GURS.KN:PARCELE`. Live-probed 2026-09-03 (Ljubljana → KO 1725 Ajdovščina parc. 2468/4).
//   2. si-mnvp-pa-wfs          — the ENVELOPE-GEOMETRY channel, recorded for the RULES half (NOT a
//      parcel source, NOT consumed by this lane's provider). The national MNVP planning WFS
//      aggregates every municipal OPN: `REG_CRTE_OPN` regulation LINES typed "Gradbena meja"
//      (building/construction boundary — the DK-byggefelt shape: geometry + type + plan link +
//      validity date), `REG_POVRSINE_OPN` regulation surfaces, `NRP_OPN` land use. Census 2026-09-02
//      (CONSUME-GEOMETRY) + pin re-confirmed 2026-09-03 (numberMatched 10,869 REG_CRTE). Numeric
//      rules (FZ, FI, heights, setbacks — prostorski izvedbeni pogoji) remain municipal act TEXT, so
//      there is NO national machine-readable rule pack — the honest no-rule-pack path (see index.ts).
//
// Licence (both rows): GURS / e-prostor open data — CC BY 4.0, GREEN (sweep 2026-08-31 read the
// "Access to geodetic data" + JGP pages; census 2026-09-02). Attribution org: Geodetska uprava
// Republike Slovenije (GURS), under the Ministry for Natural Resources and Spatial Planning (MNVP).

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { SI_KN_WFS_BASE } from './siWfsClient.js';

const SI_LICENCE = {
    id: 'CC-BY-4.0',
    colour: 'GREEN',
    verifiedDate: '2026-09-02', // census read the e-prostor licence pages
    textRef: null,
} as const;

/** The MNVP planning-WFS endpoint — the envelope-geometry channel (rules half, not the parcel leg). */
export const SI_MNVP_PA_WFS_BASE = 'https://ipi.eprostor.gov.si/wfs-si-mnvp-pa/ows';

/** The parcel source-row id — the one the registry providerId + minted entities cite. */
export const SI_PARCEL_SOURCE_ID = 'si-gurs-kn-parcele-wfs';

/**
 * The SI source registry — every endpoint this adapter knows, each with its dated probe log.
 * Validated through `SiteIntelSourceSchema` at module load (a row that does not parse is a build
 * error, not a runtime surprise).
 */
export const SI_SOURCES: readonly SiteIntelSource[] = [
    {
        id: SI_PARCEL_SOURCE_ID,
        country: 'SI',
        authority: 'GURS (Geodetska uprava RS) / e-prostor',
        dataset: 'SI.GURS.KN:PARCELE (Kataster nepremičnin parcels)',
        endpoint: SI_KN_WFS_BASE,
        protocol: 'WFS2',
        licence: SI_LICENCE,
        accessOption: 1, // live query, keyless; JGP bulk download (option 3) documented by the sweep
        gate: null,
        probes: [
            {
                date: '2026-09-03',
                note: 'LANE SI: GetCapabilities 200 (134 KB, 40 feature types); DescribeFeatureType PARCELE → PARCELA_ID/EID_PARCELA/KO_ID/NAZIV/ST_PARCELE/POVRSINA/GEOM, DefaultCRS EPSG:3794 only; GetFeature bbox(lat,lon urn:EPSG::4326) @ Ljubljana → PARCELE.100100001379837235, KO 1725 AJDOVŠČINA, ST_PARCELE 2468/4, POVRSINA 1896 m², native 3794 ring (srsName=EPSG:4326 → WGS84 ring, reprojected server-side); CQL EID_PARCELA=… → 1 feature; wrong layer → HTTP 400 ows:ExceptionReport naming the TYPENAME; point outside SI → 200 empty (absent)',
            },
        ],
        theme: 'cadastre',
        coverage: 'national (merged land+building cadastre, Kataster nepremičnin)',
        updateFrequency: 'per-feature DATUM_SYS (continuous maintenance; JGP snapshots)',
        adapterStatus: 'live',
    },
    {
        id: 'si-mnvp-pa-wfs',
        country: 'SI',
        authority: 'MNVP (Ministry for Natural Resources and Spatial Planning) / GURS',
        dataset: 'SI.MNVP.PA REG_CRTE_OPN (Gradbena meja) · REG_POVRSINE_OPN · NRP_OPN (national OPN aggregation)',
        endpoint: SI_MNVP_PA_WFS_BASE,
        protocol: 'WFS2',
        licence: SI_LICENCE,
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-02',
                note: 'census (CONSUME-GEOMETRY): GetCapabilities 200; REG_CRTE_OPN "Gradbena meja" (REGL_VR_ID=5) plan-linked (ID_PA, NAZIV_AKTA) + validity-dated (DATUM_VEL 2024-03-09); hits REG_CRTE 10,869 · REG_POVRSINE 13,632 · NRP_OPN 403,788',
            },
            {
                date: '2026-09-03',
                note: 'LANE SI pin re-confirm: GetCapabilities 200 (96,966 B, 7 feature types) + REG_CRTE_OPN resultType=hits → numberMatched 10869 (matches census). ENVELOPE-GEOMETRY / rules half — NOT the parcel leg; numeric FZ/FI/heights remain municipal OPN act text (no national machine-readable rule pack)',
            },
        ],
        theme: 'planning',
        coverage: 'national land-use complete; regulation lines/surfaces partial (fills via ZUreP-3 technical OPN updates)',
        updateFrequency: 'per-feature DATUM_VEL (valid-from); continuous municipal updates',
        adapterStatus: 'documented',
    },
].map((row) => SiteIntelSourceSchema.parse(row));
