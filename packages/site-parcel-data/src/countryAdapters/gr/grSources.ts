// LANE GR — GREECE (GR) · source discovery: the §J `sources(): SiteIntelSource[]` leg, typed as
// E1a `SiteIntelSource` rows and validated at module load by the registry's own loader
// (`defineSources` — a malformed row is a BUILD error naming its row, not a runtime surprise).
//
// ⚠ THIS IS A SELF-CONTAINED SOURCES FILE, like the EE exemplar (`ee/eeSources.ts`), NOT a rival
// of `sourceRegistry/*` (C84 EI-9). There is no `sourceRegistry/gr.ts` yet — Greece is new — and
// `sourceRegistry/index.ts` is a SHARED file this lane may not edit under the barrel protocol. The
// migration of this row into `sourceRegistry/gr.ts` is queued for the orchestrator in
// audit/europe-adapters-2/2026-09-02/barrel-additions-gr.txt; when it lands, delete this and
// re-export the registry's — do NOT leave two.
//
// ONE PROBED ROW: the OPERATING-cadastre parcel layer this adapter actually reads. The four
// sibling GEOTEMAXIA layers (ANARTHSH / PROKATARKTIKA / APOKLEISTIKES / DOULEIES) are named in the
// dataset prose but NOT seeded — they were not individually probed this pass, and an unprobed row
// is an unverified claim (defineSources rejects an empty probe log by design).
//
// LICENCE HONESTY: the Hellenic Cadastre data is open-access via the public geoportal/viewer, but
// the exact licence TEXT was not captured this pass (the sweep flagged "licence id not confirmed").
// So `colour: YELLOW`, `verifiedDate: null` — an honest "read the licence before relying on
// redistribution terms", never a GREEN this lane cannot back.

import type { SiteIntelSource } from '@pryzm/schemas';
import { defineSources } from '../../sourceRegistry/defineSources.js';
import { GR_PARCEL_SERVICE } from './grKtimatologioClient.js';
import { GR_PARCEL_PROVIDER_ID } from './grParcelProvider.js';

/** The operating-cadastre parcel source-row id — identical to the provider/provenance id. */
export const GR_PARCEL_SOURCE_ID = GR_PARCEL_PROVIDER_ID;

/**
 * Every source this adapter reads. Validated through `SiteIntelSourceSchema` at module load.
 */
export const GR_SOURCES: readonly SiteIntelSource[] = defineSources('GR', [
    {
        id: GR_PARCEL_SOURCE_ID,
        country: 'GR',
        authority: 'Ελληνικό Κτηματολόγιο (Hellenic Cadastre)',
        dataset:
            'GEOTEMAXIA_LEITOURGOUN_ON_gdb/FeatureServer/0 "LEITOURGOUN" — γεωτεμάχια που ' +
            'λειτουργούν (OPERATING-cadastre parcels), ArcGIS Online hosted FeatureServer, keyless. ' +
            'Fields: KAEK (12-digit national cadastre code, the id) · MAIN_USE + DESCR (use code + ' +
            'Greek description) · PERCENTAGE · PROP_VERT/PROP_HOR · LINK (ΟΤΑ card URL) · AREA ' +
            '(register m²) · PERIMETER (register m). Four sibling lifecycle layers on the same org ' +
            '(ANARTHSH = public display, PROKATARKTIKA = preliminary, APOKLEISTIKES, DOULEIES) are ' +
            'NOT consumed. Stored EPSG:3857; reprojects server-side to any outSR.',
        endpoint: `${GR_PARCEL_SERVICE}/0`,
        // ArcGIS-REST dialect — classed REST per the FROZEN protocol enum; dialect named in prose.
        protocol: 'REST',
        licence: {
            id: 'Hellenic Cadastre open geoportal access (exact licence text not captured this pass; sweep 2026-08-31 flagged "licence id not confirmed")',
            colour: 'YELLOW',
            verifiedDate: null,
            textRef: null,
        },
        // Live keyless query; a nightly mirror (option 3/4) is the SLA path, not exercised here.
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-03',
                note:
                    'LANE GR PROBED LIVE. Channel discovered by tracing the official public viewer ' +
                    'maps.ktimatologio.gr (ArcGIS Experience Builder) -> its runtime config ' +
                    'cdn/2/config.json -> services-eu1.arcgis.com/40tFGWzosjaLJpmn. Layer ?f=json 200: ' +
                    'Feature Layer, esriGeometryPolygon, capabilities "Query", maxRecordCount 2000. ' +
                    'Point query inSR=4326&outSR=4326 @ Athens/Syntagma (37.9755,23.7348) -> 1 feature, ' +
                    'KAEK 050095701001, AREA 10839.77 m², 10-vertex WGS84 ring. where KAEK=\'050095701001\' ' +
                    '-> same 1 feature. Sea point (37.90,23.60) -> HTTP 200, 0 features (durable absent). ' +
                    'Invalid field -> HTTP 200 {"error":{"code":400,...}} (classified transient). ' +
                    'Bodies recorded at __tests__/fixtures/gr-athens-2026-09-03/recorded-live-2026-09-03.json.',
            },
            {
                date: '2026-09-03',
                note:
                    'NEGATIVE PROBE (recorded so it is not re-attempted): the OLD INSPIRE ArcGIS path ' +
                    'gis.ktimanet.gr/inspire/rest/services/cadastralparcels/CadastralParcel/MapServer/' +
                    'exts/InspireFeatureDownload/service?REQUEST=GetCapabilities&SERVICE=WFS (cited by ' +
                    'the EU INSPIRE geoportal record) -> HTTP 404 (Next.js app). geoportal.ypen.gr / ' +
                    'www.epoleodomia.gov.gr -> connect-fail (census 2026-09-02, re-confirmed). The AGOL ' +
                    'org above is the live channel; the INSPIRE geoportal was migrated away from it.',
            },
        ],
        theme: 'cadastre',
        coverage:
            'national but INCOMPLETE — the operating cadastre covers completed areas only; ' +
            'coverage varies by area, forest-map + registration programmes ongoing (sweep 2026-08-31)',
        updateFrequency: 'periodic (per the Hellenic Cadastre operating-cadastre update cycle; exact cadence not captured)',
        adapterStatus: 'live',
    },
]);

/**
 * Endpoints this adapter actually calls, paired with the registry row that documents each — the
 * assertion a test can make that no endpoint is reached without a registered, probed row behind it
 * (the "committed != reachable" discipline applied to sources).
 */
export const GR_ADAPTER_ENDPOINT_BINDINGS: readonly {
    readonly sourceId: string;
    readonly endpoint: string;
}[] = [{ sourceId: GR_PARCEL_SOURCE_ID, endpoint: `${GR_PARCEL_SERVICE}/0` }];
