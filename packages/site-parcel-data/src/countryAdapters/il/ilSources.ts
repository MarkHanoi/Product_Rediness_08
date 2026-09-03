// LANE ME-OPEN — ISRAEL · source discovery: the typed `SiteIntelSource` rows for the IL adapter,
// validated through `SiteIntelSourceSchema` at module load (a row that does not parse is a build
// error, not a runtime surprise) — same shape as `eeSources.ts`.
//
// ⚠ LICENCE = YELLOW (UNREAD), DELIBERATELY. The me-sweep flags the national BULK shapefile
// (parcel_all.zip via data.gov.il CKAN) with a licence field reading "Other (Open)", but (a) that is
// the BULK product, not the govmap QUERY API this adapter uses, and (b) nobody on this lane has READ
// the govmap terms-of-use text. Per the brief ("several licences UNREAD — flag, do not assume
// open"), the query row is YELLOW with verifiedDate null and the exact unread-gate named. Flipping it
// GREEN requires reading govmap's usage terms — recorded as the probe that would settle it.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { IL_GOVMAP_IDENTIFY_ENDPOINT } from './ilGovmapClient.js';

/** The govmap parcel-identify source id — the id a minted IL parcel record would cite. */
export const IL_GOVMAP_PARCEL_SOURCE_ID = 'il-govmap-parcel-identify';

const IL_LICENCE_UNREAD = {
    id: 'govmap usage terms (UNREAD)',
    colour: 'YELLOW',
    verifiedDate: null,
    textRef: null,
} as const;

/**
 * The IL source registry — the keyless parcel-query channel and the vantage-gated national bulk
 * channel, each with its dated 2026-09-02 live probe. The bulk row is recorded so a reader sees the
 * OPEN licence + the IP-fence are DIFFERENT facts (the pipe is fenced, the licence is open).
 */
export const IL_ADAPTER_SOURCES: readonly SiteIntelSource[] = [
    {
        id: IL_GOVMAP_PARCEL_SOURCE_ID,
        country: 'IL',
        authority: 'govmap / Survey of Israel (המרכז למיפוי ישראל)',
        dataset: 'PARCEL_ALL point-identify (gush/helka + registered area + status), ITM/EPSG:2039',
        endpoint: IL_GOVMAP_IDENTIFY_ENDPOINT,
        protocol: 'REST',
        licence: IL_LICENCE_UNREAD,
        accessOption: 1, // live query, keyless
        gate: null,
        theme: 'cadastre',
        coverage: 'national (point query)',
        updateFrequency: null,
        adapterStatus: 'live',
        probes: [
            {
                date: '2026-09-02',
                note: 'ME-OPEN: POST IdentifyByXY ITM (179254,665111) → HTTP 200, gush 6952 / helka 139 / registered area 7404 m² / status מוסדר / centroid ITM (179256.4375,665120.5938) → WGS84 (32.0783,34.7780); keyless from a foreign IP; QUERY endpoint is NOT the fenced bulk product',
            },
        ],
    },
    {
        id: 'il-mapi-parcel-all-bulk',
        country: 'IL',
        authority: 'Survey of Israel (המרכז למיפוי ישראל) via data.gov.il CKAN',
        dataset: 'parcel_all.zip — full national parcel shapefile',
        endpoint: 'https://data.gov.il/dataset (parcel_all.zip on aws-e.data.gov.il)',
        protocol: 'bulk',
        licence: {
            id: 'Other (Open) — declared on the CKAN dataset',
            colour: 'YELLOW', // OPEN per the field, but the payload host IP-fences foreign IPs → not usable from here yet
            verifiedDate: '2026-09-02',
            textRef: null,
        },
        accessOption: 3, // nightly mirror is the intended path once an IL-IP fetch is available
        gate: 'IL-IP (data.gov.il S3 payload host returns 403 to foreign IPs; metadata API is open)',
        theme: 'cadastre',
        coverage: 'national (full shapefile)',
        updateFrequency: null,
        adapterStatus: 'blocked',
        probes: [
            {
                date: '2026-09-02',
                note: 'me-sweep §8: CKAN package_search/package_show OPEN from a foreign IP, licence field "Other (Open)"; GET parcel_all.zip → HTTP 403 (payload host geo-restricts) — the licence is open, the pipe is fenced. Probe to settle: fetch via an IL vantage.',
            },
        ],
    },
].map((row) => SiteIntelSourceSchema.parse(row));
