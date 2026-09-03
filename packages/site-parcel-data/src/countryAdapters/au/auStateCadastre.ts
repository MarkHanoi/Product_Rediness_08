// LANE AU-OPEN — AUSTRALIA · the SHARED state-cadastre parcel resolver (one client, six states).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Australia has NO national cadastre — cadastre is a STATE competency (au-sweep.md §0). Six of the
// eight states/territories serve a keyless point-queryable parcel service that returned a real legal
// identifier live this session:
//
//   AU-NSW  DCS Spatial Services  ArcGIS FeatureServer  lot//plan   (100//DP1048011)
//   AU-VIC  Vicmap open-data      GeoServer WFS 2.0     SPI         (PC366537)
//   AU-QLD  QSpatial              ArcGIS MapServer      lotplan     (47SP317615)
//   AU-SA   PlanSA / SAPPA        ArcGIS MapServer *    plan/parcel (C21367 F1, CT 5954/719)
//   AU-TAS  theLIST               ArcGIS MapServer      PID + title (3321248, 40374/3)
//   AU-ACT  ACTmapi AGOL          ArcGIS FeatureServer  block/section(12/19 …)
//     * AU-SA is behind a soft CloudFront WAF Referer rule (see AU_SA_REFERER) — not IP-geofenced;
//       the same-origin proxy adds the Referer server-side. Data itself is CC BY (open downloads).
//
// FIVE OF SIX SPEAK THE SAME ArcGIS REST `/query` SHAPE, one (VIC) speaks WFS-GeoJSON. Rather than
// six copy-pasted providers this is ONE resolver parameterised by an `AuStateDescriptor` per state
// (the lane's "one stateCadastre client parameterised by regionCode — DRY without hiding per-state
// provenance" instruction). The per-state provenance is NOT hidden: each descriptor carries its own
// probed endpoint, id-field mapping, licence and dated probe note, and `auSources.ts` is the typed
// source registry beside it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SHAPE — mirrors the proven US sub-national idiom (`sfParcelProvider`/`nycPlutoParcelProvider`),
// NOT the richer §J CountryAdapter (EE/DK): this lane resolves PARCELS only.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//   • a bbox routing predicate (in auJurisdiction.ts) + an injectable-fetch resolver that NEVER throws;
//   • a pure, byte-deterministic parse of the upstream feature → a typed OK/refusal union;
//   • a same-origin proxy path per state the editor calls (the network hop is L5's, not L2's);
//   • a CRS honesty guard: consume WGS84, REFUSE a projected (state-plane / GDA MGA metre) ring;
//   • geometry-derived area (equirectangular shoelace) — a geometry fact, never a trusted upstream field.
//
// The parser accepts BOTH the ArcGIS Esri-JSON body (`{features:[{attributes,geometry:{rings}}]}`,
// outSR=4326) AND the WFS GeoJSON body (`{features:[{properties,geometry:{coordinates}}]}`,
// srsName=EPSG:4326 → lon/lat), so one proxy per state can pass either upstream through unchanged.
//
// PURITY (C58 §1.9): the fetch is injected; given the same body the parse is byte-deterministic.
// OTel span `pryzm.parcel.auStateCadastre` (P8). NEVER throws — every miss/unreachable/malformed body
// is a typed refusal, so the editor falls to the OSM footprint, never a crash and never a guess.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { AuBbox } from './auJurisdiction.js';
import {
    isInNsw,
    isInVic,
    isInQld,
    isInSaAu,
    isInTas,
    isInAct,
    AU_NSW_BBOX,
    AU_VIC_BBOX,
    AU_QLD_BBOX,
    AU_SA_BBOX,
    AU_TAS_BBOX,
    AU_ACT_BBOX,
} from './auJurisdiction.js';

const tracer = trace.getTracer('pryzm.parcel');

/** A WGS84 point — the frame the resolver queries with and returns the ring in. */
export interface AuLatLon {
    readonly lat: number;
    readonly lon: number;
}

/** The regionCodes this shared client resolves LIVE (WA/NT are deferrals, not handled here). */
export type AuCadastralRegionCode = 'AU-NSW' | 'AU-VIC' | 'AU-QLD' | 'AU-SA' | 'AU-TAS' | 'AU-ACT';

/** The soft CloudFront WAF Referer the SA (SAPPA) endpoint requires — added server-side by the proxy. */
export const AU_SA_REFERER = 'https://sappa.plan.sa.gov.au/';

/** The legal identity of an Australian parcel, as its state serves it (never fabricated). */
export interface AuParcelIdentity {
    /** The primary legal identifier (lot//plan · SPI · lotplan · plan/parcel · PID · block/section). */
    readonly parcelId: string;
    /** Human label for the parcel info card (state-specific composition). */
    readonly label: string;
    /** Certificate-of-title reference (volume/folio) where the state serves one, else null. */
    readonly title: string | null;
    /** Locality / address where the state serves one, else null. */
    readonly locality: string | null;
    /** The served attribute values that composed the identity, kept verbatim for provenance. */
    readonly components: Readonly<Record<string, string>>;
}

/** A resolved Australian parcel: WGS84 ring + the state's own legal identity + geometry-derived area. */
export interface AuParcel {
    readonly regionCode: AuCadastralRegionCode;
    /** Convenience mirror of `identity.parcelId` (the routing/display key). */
    readonly parcelId: string;
    readonly identity: AuParcelIdentity;
    /** The parcel boundary as a WGS84 lon/lat ring (outer ring). */
    readonly ring: readonly AuLatLon[];
    /** Parcel area in m², COMPUTED from the WGS84 ring (equirectangular shoelace). 0 for a degenerate ring. */
    readonly areaM2: number;
    /** A real legal id + a valid point-in-parcel ring from a point query is the strong case. */
    readonly confidence: 'high';
    /** Provenance/provider id (`au-<state>-cadastre`). */
    readonly source: string;
}

/** Why an AU resolution refused. Closed vocabulary — operationally distinct (mirrors sfParcelProvider). */
export type AuParcelRefusalReason =
    | 'no-point'
    | 'out-of-region'
    | 'endpoint-unreachable'
    | 'no-parcel'
    | 'no-id'
    | 'degenerate-geometry'
    | 'crs-unprojected';

export type AuParcelResult =
    | { readonly ok: true; readonly parcel: AuParcel }
    | { readonly ok: false; readonly reason: AuParcelRefusalReason };

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE HELPERS — attribute read, ring parse, CRS + area gates (mirroring sfParcelProvider)
// ──────────────────────────────────────────────────────────────────────────────────────────────

const M_PER_DEG_LAT = 111_320;

/** Case-insensitive attribute reader over a flat record: first present, non-null name wins. */
export function auAttr(rec: Record<string, unknown>, ...names: string[]): unknown {
    const lower: Record<string, unknown> = {};
    for (const k of Object.keys(rec)) lower[k.toLowerCase()] = rec[k];
    for (const n of names) {
        const v = lower[n.toLowerCase()];
        if (v !== undefined && v !== null) return v;
    }
    return undefined;
}

/** A non-empty trimmed string, or null. A finite number is stringified (ArcGIS serves numeric ids). */
export function auStr(v: unknown): string | null {
    if (typeof v === 'string') {
        const s = v.trim();
        return s === '' ? null : s;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Collapse internal whitespace runs to a single space (SA serves `C21367   F1` with padding). */
export function auCollapseWs(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

/**
 * Parse the outer ring from either an ArcGIS Esri-JSON geometry (`{ rings: [[[x,y],…]] }`) or a
 * GeoJSON geometry (`{ type:'Polygon'|'MultiPolygon', coordinates }`). Returns `[lon,lat]` pairs,
 * dropping non-finite vertices; null when no usable ring is present. Never re-projects.
 */
export function auParseRing(geometry: unknown): Array<[number, number]> | null {
    if (!geometry || typeof geometry !== 'object') return null;
    const g = geometry as Record<string, unknown>;
    if (Array.isArray(g.rings)) return auCoordsToPairs(g.rings[0]);
    const type = typeof g.type === 'string' ? g.type : null;
    if (type === 'Polygon' && Array.isArray(g.coordinates)) {
        return auCoordsToPairs((g.coordinates as unknown[])[0]);
    }
    if (type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
        const first = (g.coordinates as unknown[])[0];
        return auCoordsToPairs(Array.isArray(first) ? (first as unknown[])[0] : null);
    }
    return null;
}

function auCoordsToPairs(raw: unknown): Array<[number, number]> | null {
    if (!Array.isArray(raw)) return null;
    const pairs: Array<[number, number]> = [];
    for (const p of raw) {
        if (!Array.isArray(p) || p.length < 2) continue;
        const lon = typeof p[0] === 'number' && Number.isFinite(p[0]) ? (p[0] as number) : null;
        const lat = typeof p[1] === 'number' && Number.isFinite(p[1]) ? (p[1] as number) : null;
        if (lon === null || lat === null) continue;
        pairs.push([lon, lat]);
    }
    return pairs.length > 0 ? pairs : null;
}

/** True when any coordinate is out of WGS84 range (projected metres) — refuse over mis-plotting. */
function looksProjected(pairs: Array<[number, number]>): boolean {
    for (const [lon, lat] of pairs) {
        if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return true;
    }
    return false;
}

/** Parcel area in m² from a WGS84 lon/lat ring by a local equirectangular shoelace. Geometry fact. */
export function auRingAreaM2(ring: readonly AuLatLon[]): number {
    if (ring.length < 3) return 0;
    let latSum = 0;
    for (const p of ring) latSum += p.lat;
    const meanLat = latSum / ring.length;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos((meanLat * Math.PI) / 180);
    let twiceArea = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        twiceArea +=
            a.lon * mPerDegLon * (b.lat * M_PER_DEG_LAT) - b.lon * mPerDegLon * (a.lat * M_PER_DEG_LAT);
    }
    return Math.abs(twiceArea) / 2;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE PER-STATE DESCRIPTOR — endpoint + identity extraction, one row per live state
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** How ONE state's cadastre is queried and how its feature yields a legal identity. */
export interface AuStateDescriptor {
    readonly regionCode: AuCadastralRegionCode;
    readonly stateName: string;
    readonly providerId: string;
    readonly label: string;
    /** The same-origin proxy path the editor calls (`/api/parcel/au-nsw`). */
    readonly proxyPath: string;
    /** The upstream service `/query` (ArcGIS) or GetFeature (WFS) URL — PROBED live, for the proxy. */
    readonly upstream: string;
    readonly protocol: 'arcgis-rest' | 'wfs-geojson';
    readonly bbox: AuBbox;
    readonly contains: (lat: number, lon: number) => boolean;
    /** Extra request headers the proxy must send (SA's soft Referer gate), else null. */
    readonly requiredHeaders: Readonly<Record<string, string>> | null;
    /** One-line licence verdict (from a CKAN licence field / probe this session). */
    readonly licence: string;
    /**
     * Extract the legal identity from ONE feature's attribute map, or null when this feature carries
     * no usable id (QLD "Unlinked parcel", ACT RETIRED lifecycle) so the parser skips it.
     */
    readonly extractId: (attrs: Record<string, unknown>) => AuParcelIdentity | null;
    /** Lower = preferred when several features are accepted (ACT lifecycle: CURRENT < APPROVED < …). */
    readonly featureRank?: (attrs: Record<string, unknown>) => number;
}

function nswIdentity(a: Record<string, unknown>): AuParcelIdentity | null {
    const lotId = auStr(auAttr(a, 'lotidstring'));
    const planLabel = auStr(auAttr(a, 'planlabel'));
    const lotNumber = auStr(auAttr(a, 'lotnumber'));
    const sectionNumber = auStr(auAttr(a, 'sectionnumber'));
    // lotidstring is the served legal id (`100//DP1048011`); fall back to lot//section/plan.
    const parcelId = lotId ?? (lotNumber && planLabel ? `${lotNumber}//${sectionNumber ?? ''}/${planLabel}` : null);
    if (!parcelId) return null;
    const components: Record<string, string> = {};
    if (lotNumber) components.lot = lotNumber;
    if (sectionNumber) components.section = sectionNumber;
    if (planLabel) components.plan = planLabel;
    return { parcelId, label: `Lot ${parcelId} (NSW)`, title: null, locality: null, components };
}

function vicIdentity(a: Record<string, unknown>): AuParcelIdentity | null {
    const spi = auStr(auAttr(a, 'parcel_spi', 'spi'));
    if (!spi) return null;
    const plan = auStr(auAttr(a, 'parcel_plan_number'));
    const lot = auStr(auAttr(a, 'parcel_lot_number'));
    const components: Record<string, string> = {};
    if (plan) components.plan = plan;
    if (lot) components.lot = lot;
    return { parcelId: spi, label: `SPI ${spi} (VIC)`, title: null, locality: null, components };
}

function qldIdentity(a: Record<string, unknown>): AuParcelIdentity | null {
    const lotplan = auStr(auAttr(a, 'lotplan'));
    if (!lotplan) return null; // skips "Unlinked parcel or interest" features (null lotplan)
    const lot = auStr(auAttr(a, 'lot'));
    const plan = auStr(auAttr(a, 'plan'));
    const tenure = auStr(auAttr(a, 'tenure'));
    const locality = auStr(auAttr(a, 'locality'));
    const components: Record<string, string> = {};
    if (lot) components.lot = lot;
    if (plan) components.plan = plan;
    if (tenure) components.tenure = tenure;
    return { parcelId: lotplan, label: `Lot/plan ${lotplan} (QLD)`, title: null, locality, components };
}

function saIdentity(a: Record<string, unknown>): AuParcelIdentity | null {
    const rawId = auStr(auAttr(a, 'parcel_id'));
    const planT = auStr(auAttr(a, 'plan_t'));
    const plan = auStr(auAttr(a, 'plan'));
    const parcelT = auStr(auAttr(a, 'parcel_t'));
    const parcel = auStr(auAttr(a, 'parcel'));
    const titleT = auStr(auAttr(a, 'title_t'));
    const volume = auStr(auAttr(a, 'volume'));
    const folio = auStr(auAttr(a, 'folio'));
    // Prefer the served parcel_id (`C21367   F1`), whitespace-collapsed; else compose plan+parcel.
    const composed = planT && plan && parcelT && parcel ? `${planT}${plan} ${parcelT}${parcel}` : null;
    const parcelId = rawId ? auCollapseWs(rawId) : composed;
    if (!parcelId) return null;
    const title = titleT && volume && folio ? `${titleT} ${volume}/${folio}` : null;
    const components: Record<string, string> = {};
    if (plan) components.plan = (planT ?? '') + plan;
    if (parcel) components.parcel = (parcelT ?? '') + parcel;
    if (volume && folio) components.title = `${volume}/${folio}`;
    return { parcelId, label: `Parcel ${parcelId} (SA)`, title, locality: null, components };
}

function tasIdentity(a: Record<string, unknown>): AuParcelIdentity | null {
    const pid = auStr(auAttr(a, 'PID'));
    const volume = auStr(auAttr(a, 'VOLUME'));
    const folio = auStr(auAttr(a, 'FOLIO'));
    const address = auStr(auAttr(a, 'PROP_ADD'));
    const tenure = auStr(auAttr(a, 'TENURE_TY'));
    // PID is theLIST's parcel identifier; where absent (rare) fall back to the title reference.
    const parcelId = pid ?? (volume && folio ? `${volume}/${folio}` : null);
    if (!parcelId) return null;
    const title = volume && folio ? `${volume}/${folio}` : null;
    const components: Record<string, string> = {};
    if (pid) components.pid = pid;
    if (title) components.title = title;
    if (tenure) components.tenure = tenure;
    return { parcelId, label: `PID ${parcelId} (TAS)`, title, locality: address, components };
}

/** ACT lifecycle ordering: only non-RETIRED blocks are accepted; CURRENT preferred over APPROVED. */
const ACT_LIFECYCLE_RANK: Readonly<Record<string, number>> = { CURRENT: 0, APPROVED: 1 };
function actLifecycle(a: Record<string, unknown>): string {
    return (auStr(auAttr(a, 'CURRENT_LIFECYCLE_STAGE')) ?? '').toUpperCase();
}
function actIdentity(a: Record<string, unknown>): AuParcelIdentity | null {
    if (actLifecycle(a) === 'RETIRED') return null; // superseded block — never asserted as the parcel
    const block = auStr(auAttr(a, 'BLOCK_NUMBER'));
    const section = auStr(auAttr(a, 'SECTION_NUMBER'));
    // ⚠ The served BLOCK_SECTION field is SECTION/BLOCK order ("19/12" for block 12 section 19); the
    // id is composed from the EXPLICIT block+section fields (block/section) so its ordering is
    // unambiguous, and the raw served composite is kept as a component for provenance.
    const blockSection = auStr(auAttr(a, 'BLOCK_SECTION'));
    const district = auStr(auAttr(a, 'DISTRICT_NAME'));
    const volFolio = auStr(auAttr(a, 'VOLUME_FOLIO'));
    const parcelId = block && section ? `${block}/${section}` : blockSection;
    if (!parcelId) return null;
    const components: Record<string, string> = {};
    if (block) components.block = block;
    if (section) components.section = section;
    if (blockSection) components.blockSectionRaw = blockSection;
    if (district) components.district = district;
    if (volFolio) components.title = volFolio;
    const label =
        block && section
            ? `Block ${block} Section ${section}${district ? `, ${district}` : ''} (ACT)`
            : `Block ${parcelId} (ACT)`;
    return { parcelId, label, title: volFolio, locality: district, components };
}
function actRank(a: Record<string, unknown>): number {
    const rank = ACT_LIFECYCLE_RANK[actLifecycle(a)];
    return rank === undefined ? 2 : rank;
}

/** The six live-cadastre descriptors, keyed by regionCode. Provenance lives on each row. */
export const AU_STATE_DESCRIPTORS: Readonly<Record<AuCadastralRegionCode, AuStateDescriptor>> = {
    'AU-NSW': {
        regionCode: 'AU-NSW',
        stateName: 'New South Wales',
        providerId: 'au-nsw-dcs-cadastre',
        label: 'Land Parcel (NSW · DCS Spatial Services · lot/plan)',
        proxyPath: '/api/parcel/au-nsw',
        upstream:
            'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8/query',
        protocol: 'arcgis-rest',
        bbox: AU_NSW_BBOX,
        contains: isInNsw,
        requiredHeaders: null,
        licence: 'CC Attribution (data.nsw CKAN "NSW FSDF - Land Parcel and Property - Cadastral Fabric")',
        extractId: nswIdentity,
    },
    'AU-VIC': {
        regionCode: 'AU-VIC',
        stateName: 'Victoria',
        providerId: 'au-vic-vicmap-cadastre',
        label: 'Vicmap Parcel (VIC · SPI)',
        proxyPath: '/api/parcel/au-vic',
        upstream:
            'https://opendata.maps.vic.gov.au/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=open-data-platform:v_parcel_mp&outputFormat=application/json&srsName=EPSG:4326&count=1',
        protocol: 'wfs-geojson',
        bbox: AU_VIC_BBOX,
        contains: isInVic,
        requiredHeaders: null,
        licence: 'CC BY 4.0 (discover.data.vic CKAN "Vicmap Property - Parcel Polygon")',
        extractId: vicIdentity,
    },
    'AU-QLD': {
        regionCode: 'AU-QLD',
        stateName: 'Queensland',
        providerId: 'au-qld-qspatial-cadastre',
        label: 'Cadastral Parcel (QLD · QSpatial · lotplan)',
        proxyPath: '/api/parcel/au-qld',
        upstream:
            'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4/query',
        protocol: 'arcgis-rest',
        bbox: AU_QLD_BBOX,
        contains: isInQld,
        requiredHeaders: null,
        licence: 'CC BY 4.0 (data.qld CKAN "Cadastral data - Queensland series")',
        extractId: qldIdentity,
    },
    'AU-SA': {
        regionCode: 'AU-SA',
        stateName: 'South Australia',
        providerId: 'au-sa-sappa-cadastre',
        label: 'Parcel (SA · PlanSA / SAPPA · plan/parcel + title)',
        proxyPath: '/api/parcel/au-sa',
        upstream:
            'https://lsa2.geohub.sa.gov.au/arcgis/rest/services/SAPPA/PropertyPlanningAtlasV19/MapServer/41/query',
        protocol: 'arcgis-rest',
        bbox: AU_SA_BBOX,
        contains: isInSaAu,
        // Soft CloudFront WAF Referer rule (403 without it, 200 with — probed this session). The
        // proxy adds it server-side; NOT IP-geofenced. Data itself is CC BY (open downloads exist).
        requiredHeaders: { Referer: AU_SA_REFERER },
        licence: 'CC Attribution (data.sa "Planning Zones and Policy Areas"; SAPPA is a soft-WAF convenience channel)',
        extractId: saIdentity,
    },
    'AU-TAS': {
        regionCode: 'AU-TAS',
        stateName: 'Tasmania',
        providerId: 'au-tas-thelist-cadastre',
        label: 'CadastreParcel (TAS · theLIST · PID + title)',
        proxyPath: '/api/parcel/au-tas',
        upstream:
            'https://services.thelist.tas.gov.au/arcgis/rest/services/Public/CadastreParcels/MapServer/0/query',
        protocol: 'arcgis-rest',
        bbox: AU_TAS_BBOX,
        contains: isInTas,
        requiredHeaders: null,
        licence:
            'Access keyless (probed); licence string UNKNOWN — read the listdata.thelist.tas.gov.au record (usually CC BY 3.0 AU)',
        extractId: tasIdentity,
    },
    'AU-ACT': {
        regionCode: 'AU-ACT',
        stateName: 'Australian Capital Territory',
        providerId: 'au-act-actmapi-blocks',
        label: 'Block (ACT · ACTmapi · block/section)',
        proxyPath: '/api/parcel/au-act',
        upstream:
            'https://services1.arcgis.com/E5n4f1VY84i0xSjy/arcgis/rest/services/ACTGOV_BLOCKS/FeatureServer/0/query',
        protocol: 'arcgis-rest',
        bbox: AU_ACT_BBOX,
        contains: isInAct,
        requiredHeaders: null,
        licence: 'CC-BY-4.0 (ACT open-data hub item, example probed); confirm per-item on actmapi-actgov.opendata.arcgis.com',
        extractId: actIdentity,
        featureRank: actRank,
    },
};

// ──────────────────────────────────────────────────────────────────────────────────────────────
// PURE PARSE — one feature, and a full response envelope
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Read a feature's attribute map from either an ArcGIS feature (`attributes`) or GeoJSON (`properties`). */
function featureAttrs(feature: Record<string, unknown>): Record<string, unknown> {
    if (feature.attributes && typeof feature.attributes === 'object') {
        return feature.attributes as Record<string, unknown>;
    }
    if (feature.properties && typeof feature.properties === 'object') {
        return feature.properties as Record<string, unknown>;
    }
    return feature;
}

/** Parse ONE feature (ArcGIS or GeoJSON) into an `AuParcel` under `descriptor`, or a typed refusal. */
export function parseAuFeature(feature: unknown, descriptor: AuStateDescriptor): AuParcelResult {
    if (!feature || typeof feature !== 'object') return { ok: false, reason: 'no-parcel' };
    const f = feature as Record<string, unknown>;
    const attrs = featureAttrs(f);
    const identity = descriptor.extractId(attrs);
    if (!identity) return { ok: false, reason: 'no-id' };
    const pairs = auParseRing(f.geometry);
    if (!pairs) return { ok: false, reason: 'degenerate-geometry' };
    if (looksProjected(pairs)) return { ok: false, reason: 'crs-unprojected' };
    const distinct = new Set(pairs.map(([lon, lat]) => `${lon},${lat}`)).size;
    if (distinct < 3) return { ok: false, reason: 'degenerate-geometry' };
    const ring: AuLatLon[] = pairs.map(([lon, lat]) => ({ lat, lon }));
    return {
        ok: true,
        parcel: {
            regionCode: descriptor.regionCode,
            parcelId: identity.parcelId,
            identity,
            ring,
            areaM2: auRingAreaM2(ring),
            confidence: 'high',
            source: descriptor.providerId,
        },
    };
}

/**
 * Parse a full response — an ArcGIS `{features:[…]}` body or a GeoJSON FeatureCollection — picking the
 * governing feature: features whose `extractId` yields null are DROPPED (QLD unlinked, ACT retired),
 * the rest are ordered by `featureRank` (ACT lifecycle) and the first is parsed. Pure + deterministic.
 */
export function parseAuResponse(json: unknown, descriptor: AuStateDescriptor): AuParcelResult {
    let features: unknown[] = [];
    if (Array.isArray(json)) features = json;
    else if (json && typeof json === 'object') {
        const j = json as Record<string, unknown>;
        if (Array.isArray(j.features)) features = j.features;
        else if (j.parcel !== undefined) features = [j.parcel];
        else features = [j];
    }
    if (features.length === 0) return { ok: false, reason: 'no-parcel' };

    // Keep only features that yield a usable identity, remembering their attrs for ranking.
    const accepted: Array<{ feature: unknown; attrs: Record<string, unknown> }> = [];
    for (const feature of features) {
        if (!feature || typeof feature !== 'object') continue;
        const attrs = featureAttrs(feature as Record<string, unknown>);
        if (descriptor.extractId(attrs) !== null) accepted.push({ feature, attrs });
    }
    if (accepted.length === 0) return { ok: false, reason: 'no-id' };
    if (descriptor.featureRank) {
        const rank = descriptor.featureRank;
        accepted.sort((a, b) => rank(a.attrs) - rank(b.attrs));
    }
    return parseAuFeature(accepted[0]!.feature, descriptor);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE IMPURE SEAM — never throws
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Injectable dependencies so the resolver is unit-testable without the network. */
export interface AuCadastreDeps {
    /** Override `globalThis.fetch` (tests inject a fake; production hits the same-origin proxy). */
    readonly fetchImpl?: typeof fetch;
    /** Override the proxy base path (default: the descriptor's `proxyPath`). */
    readonly pathBase?: string;
}

/**
 * Resolve the real state cadastral parcel at a WGS84 point via the same-origin proxy for `regionCode`.
 * Returns a typed OK/refusal union and NEVER throws — every miss/unreachable/malformed body is a
 * refusal, so the editor falls to the OSM footprint. OTel span `pryzm.parcel.auStateCadastre` (P8).
 */
export async function fetchAuParcelAtPoint(
    regionCode: AuCadastralRegionCode,
    point: AuLatLon | null | undefined,
    deps: AuCadastreDeps = {},
): Promise<AuParcelResult> {
    const descriptor = AU_STATE_DESCRIPTORS[regionCode];
    const span = tracer.startSpan('pryzm.parcel.auStateCadastre');
    span.setAttribute('pryzm.parcel.provider', descriptor.providerId);
    span.setAttribute('pryzm.parcel.region', regionCode);
    try {
        if (
            !point ||
            typeof point.lat !== 'number' ||
            typeof point.lon !== 'number' ||
            !Number.isFinite(point.lat) ||
            !Number.isFinite(point.lon)
        ) {
            span.setAttribute('pryzm.parcel.result', 'no-point');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'no-point' };
        }
        if (!descriptor.contains(point.lat, point.lon)) {
            span.setAttribute('pryzm.parcel.result', 'out-of-region');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'out-of-region' };
        }

        const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
        if (typeof fetchImpl !== 'function') {
            span.setAttribute('pryzm.parcel.result', 'no-fetch');
            span.setStatus({ code: SpanStatusCode.OK });
            return { ok: false, reason: 'endpoint-unreachable' };
        }
        const base = deps.pathBase ?? descriptor.proxyPath;
        const url =
            `${base}?lat=${encodeURIComponent(String(point.lat))}` +
            `&lon=${encodeURIComponent(String(point.lon))}`;

        let json: unknown;
        try {
            const res = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });
            if (!res || !res.ok) {
                span.setAttribute('pryzm.parcel.result', 'upstream-miss');
                span.setStatus({ code: SpanStatusCode.OK });
                return { ok: false, reason: 'endpoint-unreachable' };
            }
            json = await res.json();
        } catch (fetchErr) {
            span.setAttribute('pryzm.parcel.result', 'fetch-error');
            span.setStatus({ code: SpanStatusCode.OK });
            console.warn(
                `[${descriptor.providerId}] fetch failed (non-fatal):`,
                (fetchErr as Error)?.message ?? fetchErr,
            );
            return { ok: false, reason: 'endpoint-unreachable' };
        }

        const parsed = parseAuResponse(json, descriptor);
        if (parsed.ok) {
            span.setAttribute('pryzm.parcel.result', 'ok');
            span.setAttribute('pryzm.parcel.parcelId', parsed.parcel.parcelId);
            span.setAttribute('pryzm.parcel.areaM2', parsed.parcel.areaM2);
        } else {
            span.setAttribute('pryzm.parcel.result', parsed.reason);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return parsed;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        console.warn(`[${descriptor.providerId}] unexpected error (non-fatal):`, (err as Error)?.message ?? err);
        return { ok: false, reason: 'endpoint-unreachable' };
    } finally {
        span.end();
    }
}

/** A provider handle per live state, mirroring the US sub-national provider objects (id + label + fetch). */
export interface AuStateParcelProvider {
    readonly id: string;
    readonly label: string;
    readonly kind: 'cadastral';
    readonly regionCode: AuCadastralRegionCode;
    readonly contains: (lat: number, lon: number) => boolean;
    readonly fetchParcelAtPoint: (
        point: AuLatLon | null | undefined,
        deps?: AuCadastreDeps,
    ) => Promise<AuParcelResult>;
}

/** Build the handle for one state (used by the barrel to export nsw/vic/qld/sa/tas/act providers). */
export function auStateParcelProvider(regionCode: AuCadastralRegionCode): AuStateParcelProvider {
    const d = AU_STATE_DESCRIPTORS[regionCode];
    return {
        id: d.providerId,
        label: d.label,
        kind: 'cadastral',
        regionCode,
        contains: d.contains,
        fetchParcelAtPoint: (point, deps) => fetchAuParcelAtPoint(regionCode, point, deps),
    };
}
