// LANE LV — LATVIA (LV) · source discovery: the §J `sources(): SourceDescriptor[]` leg, typed as
// E1a `SiteIntelSource` rows with dated probe logs. Validated through `SiteIntelSourceSchema` at
// module load (a source row that does not parse is a build error, not a runtime surprise — the RO
// lane's pattern).
//
// TWO ROWS, and their statuses DIFFER, deliberately (§CONTEXT-DATA-HONESTY):
//
//   1. THE CADASTRE — LIVE. The geolatvija VRAA GeoServer `vraa:parcel` layer resolves real
//      Latvian land-units at a WGS84 point, keyless, CC-BY-4.0. This is the lane's deliverable and
//      it is PROVEN (probe log below). `adapterStatus: 'live'`.
//   2. TAPIS FUNCTIONAL ZONING — DOCUMENTED, NO NUMERIC FILL. The national territorial-planning
//      WFS serves functional-zone GEOMETRY + national unified zone codes + a document linkage, but
//      NO numeric envelope attributes — the numbers (max height, intensity, coverage) live per
//      zone index in the TIAN legal text on likumi.lv (structured HTML, an F-extraction target).
//      The brief's warning is explicit — "advertise nothing with zero national fill": the census
//      measured PILN/ATN_DOK as nationally unpopulated (L-12872), so this row is recorded as a
//      zoning-geometry substrate, NOT a served rules channel, and NO rule mapper is built on it
//      (index.ts carries `rules.kind: 'deferred'`). `adapterStatus: 'documented'`.

import { SiteIntelSourceSchema, type SiteIntelSource } from '@pryzm/schemas';
import { LV_VRAA_WFS_BASE } from './lvWfsClient.js';
import { LV_PARCEL_PROVIDER_ID } from './lvParcelProvider.js';

/** The cadastre source-row id — the `source` a minted LV Parcel cites. ONE constant, no drift. */
export const LV_CADASTRE_SOURCE_ID = LV_PARCEL_PROVIDER_ID;

/** The TAPIS functional-zoning source-row id (documented substrate; not a served rules channel). */
export const LV_TAPIS_ZONING_SOURCE_ID = 'lv-tapis-funkcionalais-zonejums';

/** The TAPIS INSPIRE WFS base (VARAM/VRAA territorial planning), confirmed live this session. */
export const LV_TAPIS_WFS_BASE = 'https://tapis.gov.lv/izpl/geoserver/wfs';

/**
 * The LV source registry. Every field is either MEASURED (the probe log) or DOCUMENTED-and-
 * labelled (the endpoint/licence), never assumed.
 */
export const LV_SOURCES: readonly SiteIntelSource[] = [
    {
        id: LV_CADASTRE_SOURCE_ID,
        country: 'LV',
        authority: 'Valsts zemes dienests (VZD), served via VRAA geolatvija portal',
        dataset:
            'Kadastrālie zemes gabali (INSPIRE) — cadastral land-units (zemes vienība), ' +
            'GeoServer workspace `vraa`, layer `vraa:parcel`; attributes code (cadastral ' +
            'designation) / property_code / objectcode / address / purpose_use / area / ' +
            'owner (ownership FORM, not identity) / owned_by_municipality / geom_act_d',
        endpoint: LV_VRAA_WFS_BASE,
        protocol: 'WFS2',
        licence: {
            id: 'CC-BY-4.0',
            colour: 'GREEN',
            // Read the machine-readable licence fields on the data.gov.lv CKAN record this session.
            verifiedDate: '2026-09-03',
            textRef: null,
        },
        accessOption: 1, // query dynamically (point/CQL); weekly bulk SHP exists for a cache/mirror
        gate: null, // keyless — ows:Fees NONE, ows:AccessConstraints NONE (GetCapabilities)
        probes: [
            {
                date: '2026-09-03',
                note:
                    'LANE LV live probe: endpoint DISCOVERED from geolatvija runtime-config ' +
                    '(geoserverUrl https://geolatvija.lv/geoserver) + SPA route /geoserver/vraa/wfs ' +
                    '(the data.gov.lv INSPIRE resource links only the geoProductId=175 viewer). ' +
                    'GetCapabilities HTTP 200 (120 KB, WFS 2.0.0, vraa:parcel DefaultCRS ' +
                    'urn:ogc:def:crs:EPSG::3059). CLICK: WGS84 bbox @ Rīga (56.9496,24.1052), ' +
                    'srsName=EPSG:4326 → real MultiPolygon land-unit code 01000070006 ' +
                    '(Pils iela 23, Rīga, LV1050; area 1435 m²; owner "juridiska persona"). ' +
                    'BY-CODE: cql code=01000070006 → 1 feature. NEGATIVE controls: wrong layer ' +
                    'vraa:parcel_WRONG → HTTP 400 ows:ExceptionReport (transient); Gulf of Rīga ' +
                    'water point → HTTP 200, 0 features (absent).',
            },
        ],
        theme: 'cadastre',
        coverage:
            'national land-units; open spatial data updated WEEKLY (data.gov.lv ' +
            'kadastralie-zemes-gabali-inspire); text/attribute open data is a separate bulk XML set',
        updateFrequency: 'weekly (VZD Kadastrs open spatial data)',
        adapterStatus: 'live', // parcel provider proven; registry row dormant only on GATE 2 (resolver)
    },
    {
        id: LV_TAPIS_ZONING_SOURCE_ID,
        country: 'LV',
        authority: 'VARAM / VRAA — TAPIS (Teritorijas attīstības plānošanas informācijas sistēma)',
        dataset:
            'TAPIS consolidated territorial-planning WFS (workspace tapis_apvienotie), incl. ' +
            'funkcionalais_zonejums (functional zoning, national unified codes) with document ' +
            'linkage (dok_id/dok_nos/dok_datums_no). ⚠ NO numeric envelope attributes served, and ' +
            'NO būvlaide (building-line) layer — numeric parameters live per zone index in the ' +
            'TIAN legal text (likumi.lv, structured HTML). PILN/ATN_DOK nationally unpopulated ' +
            '(census L-12872) — this row is a zoning-GEOMETRY substrate, not a served rules channel.',
        endpoint: LV_TAPIS_WFS_BASE,
        protocol: 'WFS2',
        licence: {
            id: 'CC0-1.0',
            colour: 'GREEN',
            verifiedDate: null, // census DOC 2026-09-02 (CC0); full licence text not re-read this session
            textRef: null,
        },
        accessOption: 1,
        gate: null,
        probes: [
            {
                date: '2026-09-03',
                note:
                    'LANE LV re-probe of the census pin: GetCapabilities HTTP 200 (~116 KB, WFS ' +
                    '2.0.0, INSPIRE download service, ows:Fees NONE / AccessConstraints NONE). ' +
                    'Feature types incl. funkcionalais_zonejums per census 2026-09-02 ' +
                    '(audit/envelope-geometry-census/2026-09-02/transcripts-nordic-baltic/lv-*). ' +
                    'NOT wired as a rules channel — no numeric envelope served.',
            },
        ],
        theme: 'planning',
        coverage:
            'national — all municipal teritorijas plānojumi flow through TAPIS; functional-zone ' +
            'geometry + national codes machine-readable, numeric rules text-locked (TIAN)',
        updateFrequency: null,
        adapterStatus: 'documented', // geometry+codes served; numbers = F-extraction, deferred
    },
].map((row) => SiteIntelSourceSchema.parse(row));
