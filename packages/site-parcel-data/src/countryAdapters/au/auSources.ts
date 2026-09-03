// LANE AU-OPEN — AUSTRALIA · the typed source registry beside the resolver (per-state provenance).
//
// This is the working "per-row probe notes as a source registry" leg, in the light US-idiom form
// (plain typed constants, NOT the §J `SiteIntelSourceSchema` the EE/DK adapters carry). Every row is
// PROBED this session — a live HTTP request whose transcript lives in
// `audit/intl-parcels/2026-09-02/transcripts-au/` — or a DECLARED DEFERRAL carrying its gate
// transcript + a reviewBy date, per the lane's honesty rules (a gated service is a deferral with the
// live gate transcript, never a silent "absent").

/** Whether the parcel channel is reachable keylessly, soft-gated, or a declared deferral. */
export type AuAccessClass =
    /** Keyless live point query — probed OK this session. */
    | 'keyless-live'
    /** Reachable but behind a soft WAF header rule the same-origin proxy can satisfy (SA Referer). */
    | 'soft-waf-referer'
    /** A declared deferral: the channel exists but is gated (licence / viewer / JS-app mediation). */
    | 'declared-deferral';

/** One AU parcel/planning source row, with its dated live-probe evidence. */
export interface AuSource {
    readonly regionCode:
        | 'AU-NSW'
        | 'AU-VIC'
        | 'AU-QLD'
        | 'AU-SA'
        | 'AU-TAS'
        | 'AU-ACT'
        | 'AU-WA'
        | 'AU-NT';
    readonly stateName: string;
    readonly authority: string;
    readonly dataset: string;
    /** The service endpoint (ArcGIS service root / WFS base / gated host). */
    readonly endpoint: string;
    readonly protocol: 'arcgis-rest' | 'wfs-geojson' | 'gated';
    readonly access: AuAccessClass;
    readonly licence: string;
    /** The blocker for a deferral (licence class / viewer mediation), else null. */
    readonly gate: string | null;
    /** For a deferral: when to re-probe / re-decide. */
    readonly reviewBy: string | null;
    /** Dated probe evidence — the live result this session + its saved transcript filename. */
    readonly probe: { readonly date: string; readonly note: string; readonly transcript: string };
}

/**
 * The AU source registry. Six live cadastres + two declared deferrals (WA identifiers, NT viewer).
 * Transcript filenames are relative to `audit/intl-parcels/2026-09-02/transcripts-au/`.
 */
export const AU_SOURCES: readonly AuSource[] = [
    {
        regionCode: 'AU-NSW',
        stateName: 'New South Wales',
        authority: 'DCS Spatial Services (NSW)',
        dataset: 'NSW_Land_Parcel_Property_Theme · layer 8 (Lot)',
        endpoint:
            'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer',
        protocol: 'arcgis-rest',
        access: 'keyless-live',
        licence: 'CC Attribution (data.nsw CKAN "NSW FSDF - Land Parcel and Property - Cadastral Fabric")',
        gate: null,
        reviewBy: null,
        probe: {
            date: '2026-09-03',
            note: 'point query @ Sydney Town Hall (151.20658,-33.87344) → 1 feature, lotidstring "100//DP1048011" (planlabel DP1048011, cadid 100105498), WGS84 polygon 21 verts, keyless HTTP 200',
            transcript: 'live-nsw-townhall.json',
        },
    },
    {
        regionCode: 'AU-VIC',
        stateName: 'Victoria',
        authority: 'DTP Victoria / Vicmap (open-data GeoServer)',
        dataset: 'open-data-platform:v_parcel_mp (Standard Parcel Identifier)',
        endpoint: 'https://opendata.maps.vic.gov.au/geoserver/wfs',
        protocol: 'wfs-geojson',
        access: 'keyless-live',
        licence: 'CC BY 4.0 (discover.data.vic CKAN "Vicmap Property - Parcel Polygon")',
        gate: null,
        reviewBy: null,
        probe: {
            date: '2026-09-03',
            note: 'WFS 2.0 GetFeature INTERSECTS(geom,POINT(-37.8136 144.9631)) — CQL is lat,lon order; srsName=EPSG:4326 → GeoJSON lon/lat; parcel_spi "PC366537" (parcel_pfi 152191430, status A), crs urn EPSG::7844 (GDA2020)',
            transcript: 'live-vic-melbourne.json',
        },
    },
    {
        regionCode: 'AU-QLD',
        stateName: 'Queensland',
        authority: 'Queensland Government (QSpatial / Resources)',
        dataset: 'PlanningCadastre/LandParcelPropertyFramework · layer 4 (Cadastral parcels)',
        endpoint:
            'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer',
        protocol: 'arcgis-rest',
        access: 'keyless-live',
        licence: 'CC BY 4.0 (data.qld CKAN "Cadastral data - Queensland series")',
        gate: null,
        reviewBy: null,
        probe: {
            date: '2026-09-03',
            note: 'point query @ Brisbane CBD (153.0260,-27.4705) → 2 features; the Lot Type Parcel carries lotplan "47SP317615" (lot 47/plan SP317615, tenure Lands Lease); the 2nd is an "Unlinked parcel or interest" with null lotplan (parser skips it)',
            transcript: 'live-qld-brisbane.json',
        },
    },
    {
        regionCode: 'AU-SA',
        stateName: 'South Australia',
        authority: 'PlanSA / Location SA (SAPPA)',
        dataset: 'SAPPA/PropertyPlanningAtlasV19 · layer 41 (Parcels Combined)',
        endpoint: 'https://lsa2.geohub.sa.gov.au/arcgis/rest/services/SAPPA/PropertyPlanningAtlasV19/MapServer',
        protocol: 'arcgis-rest',
        access: 'soft-waf-referer',
        licence: 'CC Attribution (data.sa "Planning Zones and Policy Areas"; SAPPA is a soft-WAF convenience channel, open downloads exist regardless)',
        gate: 'Soft CloudFront WAF: 403 to a bare request, 200 with Referer https://sappa.plan.sa.gov.au/ (proxy adds it server-side). NOT IP-geofenced (unlike Saudi Balady). PlanSA data terms owed a read before the LIVE endpoint is wired; the data itself is open.',
        reviewBy: '2026-12-01',
        probe: {
            date: '2026-09-03',
            note: 'point query @ Rundle Mall (138.6010,-34.9235) WITH Referer → 1 feature parcel_id "C21367   F1" (plan C21367 F1, title CT 5954/719). CONTROL: identical request with NO Referer → HTTP 403 CloudFront (live-sa-noreferer.txt) — the gate is real and the header satisfies it.',
            transcript: 'live-sa-rundle.json',
        },
    },
    {
        regionCode: 'AU-TAS',
        stateName: 'Tasmania',
        authority: 'Land Tasmania (theLIST)',
        dataset: 'Public/CadastreParcels · layer 0',
        endpoint: 'https://services.thelist.tas.gov.au/arcgis/rest/services/Public/CadastreParcels/MapServer/0',
        protocol: 'arcgis-rest',
        access: 'keyless-live',
        licence: 'Access keyless (probed). Licence string UNKNOWN this session — read the per-record metadata on listdata.thelist.tas.gov.au (LIST records usually carry CC BY 3.0 AU).',
        gate: null,
        reviewBy: '2026-10-15',
        probe: {
            date: '2026-09-03',
            note: 'point query @ Hobart (147.3272,-42.8821) → 1 feature PID 3321248, title VOLUME 40374 FOLIO 3, TENURE_TY Council, PROP_ADD "49-51 MURRAY ST HOBART TAS 7000", COMP_AREA 28.678',
            transcript: 'live-tas-hobart.json',
        },
    },
    {
        regionCode: 'AU-ACT',
        stateName: 'Australian Capital Territory',
        authority: 'ACT Government (ACTmapi / Environment, Planning)',
        dataset: 'ACTGOV_BLOCKS · layer 0 (block/section, Territory-Plan zone denormalised on the row)',
        endpoint:
            'https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0',
        protocol: 'arcgis-rest',
        access: 'keyless-live',
        licence: 'CC-BY-4.0 (ACT open-data hub item, example probed); per-item confirmation owed on actmapi-actgov.opendata.arcgis.com',
        gate: null,
        reviewBy: '2026-10-15',
        probe: {
            date: '2026-09-03',
            note: 'point query @ Civic (149.1300,-35.2809) → 4 features. THREE are CURRENT_LIFECYCLE_STAGE=RETIRED (superseded blocks — parser drops them), ONE is APPROVED (block 44 section 19, BLOCK_KEY 11080190044, CANBERRA CENTRAL) — the resolved parcel. Confirms lifecycle filtering is mandatory (RETIRED ≠ current).',
            transcript: 'live-act-civic.json',
        },
    },
    {
        regionCode: 'AU-WA',
        stateName: 'Western Australia',
        authority: 'Landgate (SLIP)',
        dataset:
            'SLIP_Public_Services/Property_and_Planning · layer 2 "Cadastre (No Attributes) (LGATE-001)" — geometry only; attributed cadastre (LGATE-217 etc.) is licensed',
        endpoint:
            'https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer',
        protocol: 'gated',
        access: 'declared-deferral',
        licence: 'Attributed cadastre "Custom (Other)" = Landgate\'s own terms (catalogue.data.wa.gov.au); geometry-only layer is keyless',
        gate: 'Geometry keyless BUT the legal identifier is GATED: layer 2 "Cadastre (No Attributes)" returns polygon geometry with NO lot/plan/id (probed: {objectid, view_scale} only). The attributed products carry license_title "Custom (Other)" = a Landgate data agreement (price class unread this session — geoscape.com.au 403 to our probe). Wiring parcel SELECTION would give a polygon but no legal label; deferred until the Landgate attributed-cadastre licence is decided (buy vs geometry-only honesty label).',
        reviewBy: '2026-11-15',
        probe: {
            date: '2026-09-02',
            note: 'au-sweep §4.1: layer 2 @ Perth CBD (115.8575,-31.9505) → 4 features, attributes verbatim {"objectid":1149809,"view_scale":"4K"} — polygon, no lot, no plan, no id. Planning layers (R-Codes, zones) ARE keyless. See transcripts-au/wa-layer2-perth.json.',
            transcript: '../../geo-expansion/2026-09-02/transcripts-au/wa-layer2-perth.json',
        },
    },
    {
        regionCode: 'AU-NT',
        stateName: 'Northern Territory',
        authority: 'NT Government (DIPL — NR Maps / NTLIS / iPlan)',
        dataset: 'Cadastre + planning-scheme zoning — visible in the NR Maps viewer, no machine endpoint greppable this session',
        endpoint: 'https://nrmaps.nt.gov.au/',
        protocol: 'gated',
        access: 'declared-deferral',
        licence: 'UNKNOWN (viewer-gated; data.nt.gov.au CKAN rows are CC BY but carry no cadastre/zoning dataset)',
        gate: 'Viewer / JS-app mediated: NR Maps issues a jsessionid from a JS loader with no REST/OGC endpoint in its loader JS; NTLIS/iPlan → 302 → dipl.nt.gov.au behind a Cloudflare "Just a moment…" challenge (HTTP 403); data.nt.gov.au CKAN has NO cadastre / planning-scheme dataset. Machine channel UNKNOWN, not zero — settle via a browser-session network capture of NR Maps (its ArcGIS/WMS backend shows in DevTools; our curl environment cannot execute its JS). Smallest market, last in launch order.',
        reviewBy: '2026-12-15',
        probe: {
            date: '2026-09-02',
            note: 'au-sweep §8.1: nrmaps.nt.gov.au 200 (JS loader 1,843 bytes, no endpoint); NTLIS/iPlan → Cloudflare 403; data.nt CKAN searches cadastre/zoning/planning-scheme → weed/water zones only. See transcripts-au/nt-nrmaps.html, nt-iplan.html, nt-ckan*.json.',
            transcript: '../../geo-expansion/2026-09-02/transcripts-au/nt-nrmaps.html',
        },
    },
];

/** The two declared-deferral rows (WA identifiers, NT viewer) — surfaced for the registry notes. */
export const AU_DEFERRALS: readonly AuSource[] = AU_SOURCES.filter((s) => s.access === 'declared-deferral');
