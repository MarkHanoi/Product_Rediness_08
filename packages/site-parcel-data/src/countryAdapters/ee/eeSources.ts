// E1d — ESTONIA (EE) · source discovery: the §J `sources(): SourceDescriptor[]` leg, typed
// as E1a `SiteIntelSource` rows (REPORT §I: "the per-row probe notes are a working source
// registry — this is that registry's typed form, not a rival of the runtime provider
// registry").
//
// Licence (ALL rows): the Estonian open-data licence — custom national licence, NOT CC:
// attribution + keep licence text, commercial use allowed, redistribution allowed, no
// share-alike. GREEN. Text at https://geoportaal.maaruum.ee/opendata-licence (fetched by
// lane 4, 2026-08-31). Attribution org: Maa- ja Ruumiamet (Land and Spatial Development
// Board — the 2025 Maa-amet merger; lane 4 EE-2 says use maaruum.ee URLs in prose).
//
// PLANIS REGIME NOTE (lane 4 EE-1): PLANK stopped accepting submissions Jan 2026; the WFS
// below continues as the valid-plans service under PLANIS. Watch planeerimine.ee for URL
// churn after June 2026 — the probe log is where a churn lands, not a silent URL edit.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { EE_GEOSERVER_BASE, EE_PLANK_WFS_BASE } from './eeWfsClient.js';

const EE_LICENCE = {
    id: 'Estonian open-data licence (Maa- ja Ruumiamet)',
    colour: 'GREEN',
    verifiedDate: '2026-08-31', // lane 4 EE-2 fetched + read the PDF
    textRef: null,
} as const;

/**
 * The PLANK/PLANIS source-row id — the `source` every minted EE Plan/Prescription cites
 * (`SiteIntelPlan.source` / `SiteIntelPrescription.source` → `SiteIntelSource.id`). ONE
 * constant so the registry row and the minted entities cannot drift apart.
 */
export const EE_PLANK_SOURCE_ID = 'ee-plank-wfs';

/**
 * The EE source registry — every endpoint this adapter knows, each with its dated probe log.
 * Validated through `SiteIntelSourceSchema` at module load (a source row that does not parse
 * is a build error, not a runtime surprise).
 */
export const EE_SOURCES: readonly SiteIntelSource[] = [
    {
        id: 'ee-maaamet-kataster-wfs',
        country: 'EE',
        authority: 'Maa- ja Ruumiamet',
        dataset: 'kataster:ky_kehtiv (valid cadastral units)',
        endpoint: `${EE_GEOSERVER_BASE}/kataster/ows`,
        protocol: 'WFS2',
        licence: EE_LICENCE,
        accessOption: 1, // live query, keyless; nightly GPKG mirror (option 3/4) documented by lane 4 as the SLA path
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'lane 4 EE-2: GetFeature bbox EPSG:3301 → parcels with tunnus/address/use/area, keyless; caps 1091 layers',
            },
            {
                date: '2026-09-01',
                note: 'E1d: tunnus=78401:101:7194 → 1 feature (Kopli tn 2, ELAMUMAA 80/ÄRIMAA 20, 1670 m²); INTERSECTS needs NATIVE axis order POINT(N E) — (E N) returns 0 silently; urn:...EPSG::4326 bbox (lat,lon) reprojected server-side',
            },
        ],
    },
    {
        id: EE_PLANK_SOURCE_ID,
        country: 'EE',
        authority: 'PLANK/PLANIS (Maa- ja Ruumiamet)',
        dataset: 'dp_hoonestus · dp_krunt · dp_kehtiv · detailplaneering · yp_maakasutus',
        endpoint: EE_PLANK_WFS_BASE,
        protocol: 'WFS2',
        licence: EE_LICENCE,
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'lane 4 EE-1: GetCapabilities 200, title PLANK, 181 layers; DescribeFeatureType dp_krunt/dp_hoonestus; Kalamaja GetFeature tihedus 2.1/protsent 61/korgus 17.4/sbp 3500',
            },
            {
                date: '2026-09-01',
                note: 'E1d: dp_hoonestus bbox(N,E urn:3301) @ Kopli tn 2 → the audited tuple + sibling korgus "0" (UNKNOWN case); detailplaneering Filter-XML sysid=30100071 → DP041780 "Osaliselt kehtiv" kehtestkp 2025-07-03 + planviide doc URL; numerics served as STRINGS; wrong layer → HTTP 400 ExceptionReport naming the TYPENAME',
            },
        ],
    },
    {
        id: 'ee-etak-ehr-hooned-wfs',
        country: 'EE',
        authority: 'Maa- ja Ruumiamet (ETAK) + ehitisregister (EHR)',
        dataset: 'etak_tuletis:etak_ehr_hooned (state-conflated footprints ↔ building register)',
        endpoint: `${EE_GEOSERVER_BASE}/etak_tuletis/ows`,
        protocol: 'WFS2',
        licence: EE_LICENCE,
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-01',
                note: 'E1d: geometry column is `shape` (cadastre-style `geom` → HTTP 400 "Illegal property name", measured); INTERSECTS(shape,POINT(N E)) @ Kopli tn 2 → etak_id 9368512 / ehr_gid 121395845 / 5 floors / korgus 17.4 (register) / korgus_m null (no ALS height) / seisund Olemas / ehr_url served',
            },
        ],
    },
    {
        id: 'ee-ehr-opendata',
        country: 'EE',
        authority: 'ehitisregister (EHR)',
        dataset: 'building register open data (CSV daily; current-data API; permits + notices)',
        endpoint: 'https://livekluster.ehr.ee/ui/ehr/v1/opendata',
        protocol: 'REST',
        licence: EE_LICENCE,
        accessOption: 6, // metadata + on-demand join by ehr_gid; the WFS conflation layer already carries the common attributes
        gate: null,
        probes: [
            {
                date: '2026-08-31',
                note: 'lane 4 EE-3: open-data UI 200; swaggerui.ehr.ee current-data service 200 (auth mode NOT yet exercised — X-tee gates SOME EHR services, the open-data channel does not); NOT re-probed by E1d — the etak_ehr_hooned join already serves the chain',
            },
        ],
    },
].map((row) => SiteIntelSourceSchema.parse(row));
