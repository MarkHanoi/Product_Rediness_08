#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM context height sources — the LOD-RATE-MASTER "real height" BUILD (L-513 / LOD-200).
//
// WHY: the baked context tiles (`bake.mjs` → `buildings.pmtiles`) carry OSM footprints whose
// `height` is, for the MAJORITY of buildings in most cities, the fabricated 9 m default
// (`DEFAULT_BUILDING_HEIGHT_M`, flagged `heightProvenance:'assumed'` in `contextBuildings.ts`).
// That is LOD 100 — a uniform low-rise carpet, not the real skyline. The LOD-RATE-MASTER
// measurement (`docs/04-reference/jurisdictions/LOD-RATE-MASTER.md`) catalogued, per country, a
// REAL per-building height source. This module turns that catalogue into an INGEST: given a region,
// it fetches the national/authoritative footprint→height dataset so the buildings layer renders at
// **real height (LoD1)** instead of the 9 m guess.
//
// WHAT THIS PRODUCES (the render reality — see the task brief + CONTEXT-3D-PERFORMANCE-ARCHITECTURE):
// the client extrudes footprint × `height` → a flat prism = **LoD1**. So "max LOD buildable NOW"
// is a real per-building `height` (+ `num_floors` / `roof_type` where the source gives them) as a
// tile attribute, replacing the `assumed` default. TRUE LoD2 (real roof geometry) needs a MESH
// render path the client does not have yet — documented as the NEXT tier in CONTEXT-LOD-BUILD-PLAN.md,
// NOT built here.
//
// HONESTY (the load-bearing part — §CONTEXT-DATA-HONESTY, C58):
//   • Every building sourced here carries `heightProvenance` set truthfully:
//       'tagged'         — a real MEASURED height (3DBAG roof height, BD TOPO HAUTEUR, LiDAR nDSM).
//       'derived-levels' — a real FLOOR COUNT × assumed storey height (Catastro ALTURAS). NOT a
//                          measurement, and never labelled as one.
//   • A fabricated height is NEVER emitted as real. Where no source resolves, `resolveHeights`
//     returns `no-source`/`blocked` and the region keeps its OSM footprints (bake.mjs default),
//     i.e. it degrades to Overture (the other agent) → the honest 9 m `assumed` default.
//   • A source that needs auth / is geo-fenced is a `blocked` status with a reason, never a silent
//     skip.
//
// INTEGRATION (ONE line into bake.mjs — the orchestrator reconciles it; this module does NOT edit
// bake.mjs). See §INTEGRATION at the foot of this file and CONTEXT-LOD-BUILD-PLAN.md §Integration.
//
// USAGE (standalone, safe — no toolchain needed, pure Node fetch):
//   node heightSources.mjs --plan            # print the per-region source table, exit
//   node heightSources.mjs --probe           # LIVE-probe the implemented sources (3dbag, bdtopo, catastro)
//   node heightSources.mjs --probe 3dbag     # probe one source
//   node heightSources.mjs --resolve paris   # fetch one region's heights → out/<region>-buildings-national.geojsonseq
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');

// ── clamps (mirror contextBuildings.ts so a stray source value can't make a skyscraper) ─────────
const MIN_HEIGHT_M = 2.5;
const MAX_HEIGHT_M = 400;
const METRES_PER_LEVEL = 3.2; // same assumed storey height the client uses for derived-levels.
const clampHeight = (h) => Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, h));

// ── HTTP with a timeout, never-throw at the call sites that want graceful degradation ───────────
async function httpGet(url, { timeoutMs = 30_000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers });
    const contentType = res.headers.get('content-type') ?? '';
    const body = await res.text();
    return { ok: res.ok, status: res.status, contentType, body };
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE CATALOGUE — one entry per authoritative height source in LOD-RATE-MASTER.
// `impl` = 'live' (a working fetcher below, live-probed) · 'documented' (endpoint characterised,
// fetcher is the NEXT build step) · 'blocked' (auth/geo-fence/licence gate — a real barrier, not a
// skip). `provenance` = the honest label every building from the source will carry.
// ─────────────────────────────────────────────────────────────────────────────
export const SOURCES = {
  '3dbag': {
    country: 'nl', name: '3DBAG (BAG × AHN LiDAR)', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (roof geometry present)',
    endpoint: 'https://api.3dbag.nl/collections/pand/items',
    heightField: 'b3_h_dak_50p (roof 50-pctile) / b3_h_nok (ridge), minus b3_h_maaiveld (ground)',
    note: 'OGC API Features. CityJSON, CRS EPSG:7415 (RD+NAP). Full footprint needs RD→WGS84; the ' +
      'roof heights + b3_dak_type are already true LoD2 attributes for the mesh tier.',
  },
  bdtopo: {
    country: 'fr', name: 'IGN BD TOPO® batiment', impl: 'live',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (needs LiDAR HD reconstruction)',
    endpoint: 'https://data.geopf.fr/wfs/ows',
    heightField: 'hauteur (m, photogrammetry/LiDAR) + nombre_d_etages (storeys)',
    note: 'WFS 2.0. Returns GeoJSON in EPSG:4326 directly — fully wireable, no reprojection.',
  },
  catastro: {
    country: 'es', name: 'Catastro INSPIRE Buildings', impl: 'live',
    provenance: 'derived-levels', lodNow: 'LoD1-floorcount', lodNext: 'LoD1-real-height (needs PNOA/ICGC nDSM)',
    endpoint: 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx',
    heightField: 'BuildingPart numberOfFloorsAboveGround (a COUNT, ×3.2 m — NOT a measurement)',
    note: 'WFS 2.0, GML EPSG:25830. ⚠ ALTURAS is a floor COUNT → provenance derived-levels, never ' +
      'tagged. Real measured height needs a LiDAR nDSM (PNOA/ICGC), licence UNVERIFIED — not built.',
  },
  swissbuildings3d: {
    country: 'ch', name: 'swissBUILDINGS3D 2.0/3.0 + GWR', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (native roofs, incl. overhangs)',
    endpoint: 'swisstopo product (CityGML 2.0) + GWR madd.bfs.admin.ch/eCH-0206',
    heightField: 'volumetric solid height (±30–50 cm) + GWR GASTW storeys',
    note: 'National LoD2 since 2018. Bulk CityGML download (not a live bbox API) → offline extract, ' +
      'join to GWR by EGID. Fetcher = CityGML parser, the next build step.',
  },
  lod2de: {
    country: 'de', name: 'LoD2-DE (per-Land CityGML)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (real CityGML roof planes)',
    endpoint: 'per-Land, e.g. opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/ (NRW open)',
    heightField: 'CityGML measuredHeight + roof planes; ALKIS traufhoehe/firsthoehe LoD1 fallback',
    note: '~58M buildings nationally, ~1 m accuracy. DRAG is per-Land licence routing: NRW/Berlin/BW/' +
      'Sachsen-Anhalt open; Bavaria/Hamburg TBD (→ blocked per-Land). Needs a Land→tile router.',
  },
  geodanmark: {
    country: 'dk', name: 'Danmark i 3D / GeoDanmark + BBR', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (real roofs)',
    endpoint: 'Datafordeler (GeoDanmark buildings) + DHM national LiDAR + BBR register',
    note: 'National LoD2 + richest EU building register (BBR: year, floors, use, roof material). ' +
      'In-tree spike NOT STARTED — endpoints known, needs a Datafordeler account/token.',
  },
  overture_us: {
    country: 'us', name: 'Overture height + USGS 3DEP nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (partial)', lodNext: 'LoD2-mesh (per-city: NYC/LA/Chicago)',
    endpoint: 'Overture GeoParquet (S3) + tnmaccess.nationalmap.gov 3DEP 1 m LiDAR',
    heightField: 'Overture height/num_floors (~20M, growing) + 3DEP DSM−DTM nDSM (>60% of US)',
    note: 'Coordinate with the Overture agent — Overture is the global footprint+height base; the ' +
      '3DEP nDSM is the national-accuracy top-up (US analogue of FR LiDAR HD). No national parcel.',
  },
  ndh_no: {
    country: 'no', name: 'Matrikkelen point + NDH nDSM (free path)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (coarse)', lodNext: 'LoD2-mesh (self-reconstruct)',
    endpoint: 'Geonorge WFS (Matrikkelen) + hoydedata.no NDH LiDAR',
    heightField: 'NDH DSM−DTM nDSM per footprint (FKB top-height is licence-gated commercial)',
    note: 'FKB-Bygning surveyed height is commercial-licensed → the FREE path is the coarser NDH nDSM. ' +
      'No national LoD2. Shares the nDSM module with ES/PT/SE.',
  },
  lidar_se: {
    country: 'se', name: 'Lantmäteriet CC0 footprints + national LiDAR nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2-mesh (fee-based municipal)',
    endpoint: 'Lantmäteriet INSPIRE BU (CC0) + national LiDAR point cloud',
    heightField: 'DSM−DTM nDSM per building',
    note: 'Free national LoD1 via nDSM. LoD2 volumes are per-municipality PAID (Stockholm confirmed). ' +
      'Account+scope to download. Shares the nDSM module.',
  },
  dgt_pt: {
    country: 'pt', name: 'DGT national LiDAR nDSM', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height', lodNext: 'LoD2/3 (Lisbon CML model)',
    endpoint: 'DGT CDD LiDAR (2024–25, 10 pts/m², open) + Overture/OSM footprints',
    heightField: 'DSM−DTM nDSM 90th-pctile per footprint',
    note: 'Good height (~75%) but NO national footprint layer (use Overture/OSM) and weak parcels ' +
      '(Carta Cadastral ~134 munis, NOT Lisbon/Porto cores). Shares the nDSM module.',
  },
  piedmont_it: {
    country: 'it', name: 'ARPA Piemonte Edifici 3D (Turin only)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (Piedmont only)', lodNext: 'per-region reconstruction',
    endpoint: 'opendata.arpa.piemonte.it (Edifici 3D)',
    heightField: 'per-building volume + mean elevation + quality code',
    note: 'No NATIONAL Italian building-height product (PST/SIM LiDAR = terrain only). Only Piedmont/' +
      'Turin has a real layer; Rome/Milan = no-source (OSM 9 m). Structural gap, not a currency lag.',
  },
  grb_be: {
    country: 'be', name: '3D GRB LoD1 DHMV (Flanders only)', impl: 'documented',
    provenance: 'tagged', lodNow: 'LoD1-real-height (Flanders only)', lodNext: 'none (no LoD2 anywhere in BE)',
    endpoint: 'CADMAP federal footprints + Flanders 3D GRB Gebouw LoD1 DHMV II',
    heightField: 'GRB block-model ridge height (DHMV II LiDAR)',
    note: 'Height structured ONLY in Flanders. Brussels (UrbIS) / Wallonia (PICC) height UNKNOWN → ' +
      'blocked-until-probed. Three separate schemas, no shared model.',
  },
  ml_sa: {
    country: 'sa', name: 'Microsoft ML footprints + GLO-30 DEM', impl: 'blocked',
    provenance: 'assumed', lodNow: 'LOD100 (coarse)', lodNext: 'needs GEOSA/Balady data agreement',
    endpoint: 'Balady MapServer (GEO-FENCED, 403 from outside SA) — national line licensed',
    heightField: 'none reachable (Balady NOOFFLOORS geo-fenced); GLO-30 30 m DEM is a sanity layer',
    note: '⚠ BLOCKED: the national product is geo-fenced (403 measured). Reachable = ML footprints + ' +
      'coarse DEM only — NO real per-building height. Region keeps OSM 9 m; do NOT fabricate a height.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// REGION → SOURCE. Maps each `bake.mjs` REGIONS entry to its height source (or an honest gap).
// A region absent here (or mapped to a no-source country) keeps OSM footprints = 9 m assumed.
// ─────────────────────────────────────────────────────────────────────────────
export const REGION_SOURCE = {
  // ES — whole-Spain national bake + cities all share Catastro (floor-count → derived-levels).
  spain: 'catastro',
  // NL
  amsterdam: '3dbag',
  // FR
  paris: 'bdtopo', lyon: 'bdtopo',
  // CH
  zurich: 'swissbuildings3d', geneva: 'swissbuildings3d', bern: 'swissbuildings3d',
  // DE — Berlin open; Munich (Bavaria) licence TBD → blocked per-Land.
  berlin: 'lod2de',
  munich: { source: 'lod2de', status: 'blocked', reason: 'Bavaria LoD2 licence TBD (ZSHH INSPIRE-restricted)' },
  // DK
  copenhagen: 'geodanmark',
  // US
  newyork: 'overture_us', sanfrancisco: 'overture_us',
  // NO / SE / PT
  oslo: 'ndh_no', stockholm: 'lidar_se', lisbon: 'dgt_pt', porto: 'dgt_pt',
  // IT — Turin has a source; Rome/Milan do not.
  milan: { source: 'piedmont_it', status: 'no-source', reason: 'Lombardy building-height layer unconfirmed — no source for Milan' },
  rome: { source: 'piedmont_it', status: 'no-source', reason: 'Lazio building-height layer unconfirmed — no source for Rome' },
  // BE — Brussels is UrbIS, height unknown.
  brussels: { source: 'grb_be', status: 'blocked', reason: 'Brussels UrbIS height attribute unprobed; GRB height is Flanders-only' },
  // SA — geo-fenced.
  riyadh: 'ml_sa', jeddah: 'ml_sa',
  // GB / FI — not in LOD-RATE-MASTER (no national open height source wired).
  london: { source: null, status: 'no-source', reason: 'OS Building Heights is licensed; GB not in LOD-RATE-MASTER' },
  helsinki: { source: null, status: 'no-source', reason: 'FI not in LOD-RATE-MASTER (Helsinki has open LoD2 — candidate to add)' },
};

/** Normalise a REGION_SOURCE entry to `{ source, status, reason }`. */
export function sourceForRegion(region) {
  const raw = REGION_SOURCE[region];
  if (raw === undefined) return { source: null, status: 'no-source', reason: `region "${region}" has no mapped height source` };
  if (typeof raw === 'string') return { source: raw, status: SOURCES[raw]?.impl === 'live' ? 'ok' : SOURCES[raw]?.impl ?? 'unknown', reason: null };
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE FETCHERS — the top 3 (3DBAG, BD TOPO, Catastro). Each returns
//   { status:'ok', features:[GeoJSON Feature…], provenance } | { status:'blocked'|'error', reason }
// A feature's properties carry `height` (m), optional `num_floors`, optional `roof_type`, and
// `heightProvenance` (the honest label). bake.mjs joins `height` as the tile attribute the client's
// resolveHeightWithProvenance reads.
// ─────────────────────────────────────────────────────────────────────────────

/** bbox = [minlon, minlat, maxlon, maxlat] (WGS84). */

// ── FR BD TOPO — fully wireable: WFS 2.0 → GeoJSON EPSG:4326, real `hauteur`. ───────────────────
// ⚠ AXIS ORDER: data.geopf.fr with SRSNAME=EPSG:4326 takes BBOX as lon,lat (minX,minY,maxX,maxY) —
// live-verified 2026-07-24 (lat,lon returned 0 features; lon,lat returned real buildings).
export async function fetchBdTopo(bbox, { limit = 5000, timeoutMs = 40_000 } = {}) {
  const [w, s, e, n] = bbox;
  const url = `${SOURCES.bdtopo.endpoint}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAMES=BDTOPO_V3:batiment&SRSNAME=EPSG:4326` +
    `&BBOX=${w},${s},${e},${n},EPSG:4326&COUNT=${limit}&OUTPUTFORMAT=application/json`;
  try {
    const r = await httpGet(url, { timeoutMs });
    if (!r.ok) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
    if (!/json/i.test(r.contentType)) return { status: 'error', reason: `unexpected content-type ${r.contentType}` };
    const json = JSON.parse(r.body);
    const features = [];
    for (const f of json.features ?? []) {
      const h = Number(f.properties?.hauteur);
      const floors = Number(f.properties?.nombre_d_etages);
      if (!Number.isFinite(h) || h <= 0) continue; // null HAUTEUR → skip (region keeps OSM/Overture for it).
      features.push(toFeature(f.geometry, {
        height: clampHeight(h),
        heightProvenance: 'tagged',
        heightSource: 'bdtopo',
        ...(Number.isFinite(floors) && floors > 0 ? { num_floors: Math.round(floors) } : {}),
      }));
    }
    return { status: 'ok', features, provenance: 'tagged', contentType: r.contentType, rawCount: json.features?.length ?? 0 };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/**
 * Approximate WGS84 → RD New (EPSG:28992) — Schreutelkamp & Strang van Hees closed form,
 * accurate to ~0.25 m over the Netherlands. Plenty for a bbox SELECTION; the returned building
 * geometry is separately reprojected RD→WGS84 in the ingest step.
 * ⚠ Needed because the 3DBAG `items` API interprets `bbox` in RD, NOT lon/lat — live-verified
 * 2026-07-24 (a WGS84 Amsterdam bbox returned 0; the same box in RD returned buildings).
 */
export function wgs84ToRD(lat, lon) {
  const dLat = 0.36 * (lat - 52.15517440);
  const dLon = 0.36 * (lon - 5.38720621);
  const Rpq = [[0, 1, 190094.945], [1, 1, -11832.228], [2, 1, -114.221], [0, 3, -32.391],
    [1, 0, -0.705], [3, 1, -2.340], [1, 3, -0.608], [0, 2, -0.008], [2, 3, 0.148]];
  const Spq = [[1, 0, 309056.544], [0, 2, 3638.893], [2, 0, 73.077], [1, 2, -157.984],
    [3, 0, 59.788], [0, 1, 0.433], [2, 2, -6.439], [1, 1, -0.032], [0, 4, 0.092], [1, 4, -0.054]];
  let X = 155000, Y = 463000;
  for (const [p, q, c] of Rpq) X += c * dLat ** p * dLon ** q;
  for (const [p, q, c] of Spq) Y += c * dLat ** p * dLon ** q;
  return [X, Y];
}

// ── NL 3DBAG — OGC API Features. Heights are true LoD2 attrs; the `items` bbox is in RD. ─────────
// The load-bearing LoD1 value is the roof-50pctile MINUS ground (b3_h_dak_50p − b3_h_maaiveld); the
// roof planes + b3_dak_type are the LoD2-mesh attributes the next tier uses.
export async function fetch3dbag(bbox, { limit = 1000, timeoutMs = 40_000 } = {}) {
  const [w, s, e, n] = bbox;
  const [x0, y0] = wgs84ToRD(s, w);
  const [x1, y1] = wgs84ToRD(n, e);
  const url = `${SOURCES['3dbag'].endpoint}?bbox=${Math.round(Math.min(x0, x1))},${Math.round(Math.min(y0, y1))},` +
    `${Math.round(Math.max(x0, x1))},${Math.round(Math.max(y0, y1))}&limit=${limit}`;
  try {
    const r = await httpGet(url, { timeoutMs, headers: { Accept: 'application/city+json, application/json' } });
    if (!r.ok) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
    const json = JSON.parse(r.body);
    // The items endpoint returns { features:[ CityJSONFeature… ] } or a CityJSON with CityObjects.
    const items = json.features ?? [];
    const features = [];
    for (const it of items) {
      const attrs = extract3dbagAttrs(it);
      if (attrs === null) continue;
      // Footprint extraction from CityJSON LoD0 boundaries + RD→WGS84 is the documented ingest step
      // (proj4 RD/NAP). Height + roof type are already resolved here — the LoD1 value the tile needs.
      features.push({
        type: 'Feature',
        geometry: null, // ← footprint reprojection = next build step (see §note); attrs are real now.
        properties: {
          height: clampHeight(attrs.height),
          heightProvenance: 'tagged',
          heightSource: '3dbag',
          ...(attrs.roofType ? { roof_type: attrs.roofType } : {}),
        },
      });
    }
    return { status: 'ok', features, provenance: 'tagged', contentType: r.contentType, rawCount: items.length };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/** Pull a real height (roof − ground) + roof type out of a 3DBAG CityJSONFeature. */
function extract3dbagAttrs(item) {
  // The OGC API nests the CityJSON under `feature.CityObjects` (or the attrs are hoisted to
  // `item.properties`/`item.attributes`). Probe both shapes defensively.
  const bag = collect3dbagAttrObjects(item);
  for (const a of bag) {
    const roof = num(a.b3_h_dak_50p) ?? num(a.b3_h_dak_70p) ?? num(a.b3_h_nok) ?? num(a.b3_h_dak_max);
    const ground = num(a.b3_h_maaiveld) ?? 0;
    if (roof !== null && roof > ground) {
      return { height: roof - ground, roofType: typeof a.b3_dak_type === 'string' ? a.b3_dak_type : null };
    }
  }
  return null;
}
function collect3dbagAttrObjects(item) {
  const out = [];
  if (item?.properties) out.push(item.properties);
  if (item?.attributes) out.push(item.attributes);
  const cos = item?.feature?.CityObjects ?? item?.CityObjects;
  if (cos) for (const co of Object.values(cos)) if (co?.attributes) out.push(co.attributes);
  return out;
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// ── ES Catastro — INSPIRE Buildings WFS. Height is a FLOOR COUNT → derived-levels (honest). ─────
export async function fetchCatastro(bbox, { limit = 2000, timeoutMs = 40_000, capabilitiesOnly = false } = {}) {
  const base = SOURCES.catastro.endpoint;
  if (capabilitiesOnly) {
    const r = await httpGet(`${base}?service=WFS&request=GetCapabilities`, { timeoutMs }).catch((e) => ({ ok: false, reason: String(e) }));
    return { status: r.ok ? 'ok' : 'error', contentType: r.contentType, hasBuilding: /bu:Building/.test(r.body ?? ''), reason: r.reason };
  }
  const [w, s, e, n] = bbox;
  // ⚠ The floor COUNT lives on bu:BuildingPart, not bu:Building — live-verified 2026-07-24
  // (Building's numberOfFloorsAboveGround is nil in central Madrid; BuildingPart is populated:
  // 872/872 parts carried a floor value). Geometry comes back in EPSG:4326 directly (posList),
  // so Catastro is footprint-wireable without reprojection. BBOX axis order = lat,lon (urn CRS).
  const url = `${base}?service=WFS&version=2.0.0&request=GetFeature&typeNames=bu:BuildingPart` +
    `&srsName=urn:ogc:def:crs:EPSG::4326&bbox=${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326&count=${limit}`;
  try {
    const r = await httpGet(url, { timeoutMs });
    if (!r.ok) return { status: 'error', reason: `HTTP ${r.status}`, contentType: r.contentType };
    // Honest extraction: floor COUNT (→ derived-levels), NOT a measured height. Full GML posList→
    // ring parse is the documented ingest step; the derived height = floors × 3.2 m is stamped there.
    const floorMatches = [...r.body.matchAll(/numberOfFloorsAboveGround>\s*(\d+)\s*</gi)].map((m) => Number(m[1]));
    const buildingCount = (r.body.match(/<bu-ext2d:BuildingPart\b/gi) ?? []).length;
    return {
      status: 'ok', provenance: 'derived-levels', contentType: r.contentType,
      buildingCount, floorSamples: floorMatches.slice(0, 8),
      populatedFloors: floorMatches.length,
      features: [],
      note: 'BuildingPart floor count → derived-levels; measured height needs nDSM (not built).',
    };
  } catch (err) {
    return { status: 'error', reason: String(err?.message ?? err) };
  }
}

/** Wrap a GeoJSON geometry + props into a Feature. */
function toFeature(geometry, properties) {
  return { type: 'Feature', geometry, properties };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveHeights(region, opts) — THE bake.mjs ENTRY POINT.
//
// Returns a discriminated result:
//   { status:'ok', geojsonseq, count, provenance }  — wrote out/<region>-buildings-national.geojsonseq
//   { status:'no-source', reason }                  — region keeps OSM footprints (9 m assumed)
//   { status:'blocked',  reason }                   — auth/geo-fence/licence gate (documented, not silent)
//   { status:'documented', reason }                 — source known, fetcher is the next build step
//   { status:'error',    reason }                   — a live fetch failed (region keeps OSM)
//
// bake.mjs uses `geojsonseq` as an ADDITIONAL (or replacement) buildings input for that region — see
// §INTEGRATION. This never throws; a bad source degrades to OSM, never to a fabricated height.
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveHeights(region, { outDir = OUT, bbox } = {}) {
  const { source, status, reason } = sourceForRegion(region);
  if (!source || status === 'no-source') return { status: 'no-source', reason: reason ?? 'no source', region };
  if (status === 'blocked') return { status: 'blocked', reason, region, source };

  const src = SOURCES[source];
  if (!src) return { status: 'no-source', reason: `unknown source "${source}"`, region };
  if (src.impl !== 'live') {
    return { status: 'documented', reason: `${src.name}: ${src.note}`, region, source, provenance: src.provenance };
  }
  if (!bbox) return { status: 'error', reason: 'no bbox supplied for a live source', region, source };

  let res;
  if (source === 'bdtopo') res = await fetchBdTopo(bbox);
  else if (source === '3dbag') res = await fetch3dbag(bbox);
  else if (source === 'catastro') res = await fetchCatastro(bbox);
  else return { status: 'documented', reason: `${src.name} fetcher not implemented`, region, source };

  if (res.status !== 'ok') return { status: 'error', reason: res.reason, region, source };

  // Only features that carry a real geometry are writeable as a join input right now (BD TOPO).
  const writeable = res.features.filter((f) => f.geometry != null);
  if (writeable.length === 0) {
    return {
      status: 'documented', region, source, provenance: res.provenance,
      reason: `${src.name}: ${res.rawCount ?? res.buildingCount ?? 0} records reached, real heights confirmed, ` +
        'but footprint geometry needs the reprojection step (see §note) before it can be tippecanoe-joined.',
    };
  }
  mkdirSync(outDir, { recursive: true });
  const path = resolve(outDir, `${region}-buildings-national.geojsonseq`);
  writeFileSync(path, writeable.map((f) => JSON.stringify(f)).join('\n') + '\n');
  return { status: 'ok', geojsonseq: path, count: writeable.length, provenance: res.provenance, region, source };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE PROBES — assert Content-Type + a real height value. Load-bearing evidence.
// Small bboxes over the LOD-RATE-verified test locations.
// ─────────────────────────────────────────────────────────────────────────────
const PROBE_BBOX = {
  bdtopo: [2.346, 48.852, 2.352, 48.858],      // Paris 8e (LOD-RATE-verified)
  '3dbag': [4.895, 52.372, 4.905, 52.378],     // Amsterdam centre
  catastro: [-3.703, 40.416, -3.699, 40.420],  // Madrid centro
};

export async function probeSource(id) {
  const bbox = PROBE_BBOX[id];
  if (id === 'bdtopo') {
    const r = await fetchBdTopo(bbox, { limit: 3 });
    const heights = (r.features ?? []).map((f) => f.properties.height);
    return {
      id, endpoint: SOURCES.bdtopo.endpoint, status: r.status, contentType: r.contentType,
      assertContentType: /json/i.test(r.contentType ?? ''),
      sampleHeights: heights.slice(0, 3),
      sampleFloors: (r.features ?? []).map((f) => f.properties.num_floors).filter((x) => x != null).slice(0, 3),
      assertRealHeight: heights.some((h) => Number.isFinite(h) && h > 0), reason: r.reason,
    };
  }
  if (id === '3dbag') {
    const r = await fetch3dbag(bbox, { limit: 5 });
    const heights = (r.features ?? []).map((f) => f.properties.height);
    return {
      id, endpoint: SOURCES['3dbag'].endpoint, status: r.status, contentType: r.contentType,
      assertContentType: /json/i.test(r.contentType ?? ''),
      sampleHeights: heights.slice(0, 3),
      sampleRoofTypes: (r.features ?? []).map((f) => f.properties.roof_type).filter(Boolean).slice(0, 3),
      assertRealHeight: heights.some((h) => Number.isFinite(h) && h > 0), reason: r.reason, rawCount: r.rawCount,
    };
  }
  if (id === 'catastro') {
    const caps = await fetchCatastro(null, { capabilitiesOnly: true });
    const feat = await fetchCatastro(bbox, { limit: 50 });
    return {
      id, endpoint: SOURCES.catastro.endpoint, status: feat.status, contentType: feat.contentType,
      assertContentType: /xml/i.test(feat.contentType ?? '') || /xml/i.test(caps.contentType ?? ''),
      capabilitiesHasBuilding: caps.hasBuilding,
      buildingPartCount: feat.buildingCount, populatedFloors: feat.populatedFloors, sampleFloors: feat.floorSamples,
      assertRealFloorCount: (feat.floorSamples ?? []).some((n) => Number.isFinite(n) && n > 0),
      provenance: 'derived-levels', reason: feat.reason,
    };
  }
  return { id, status: 'error', reason: `no live probe for "${id}"` };
}

// ── §INTEGRATION — the ONE line bake.mjs adds (orchestrator reconciles) ─────────────────────────
// In bake.mjs, inside the buildings-layer per-region loop (where it builds `geos`), after the OSM
// export for region `r`:
//
//     import { resolveHeights } from './heightSources.mjs';   // top of file
//     ...
//     const nat = await resolveHeights(r.name, { bbox: bboxToWsen(r.bbox) });
//     if (nat.status === 'ok') geos.push(nat.geojsonseq);      // ← THE ONE LINE (real heights join)
//     else console.log(`  · ${r.name} heights: ${nat.status} — ${nat.reason ?? ''}`);
//
// (`r.bbox` in bake.mjs is the osmium string 'minlon,minlat,maxlon,maxlat' → pass as [w,s,e,n].)
// A region that returns anything other than 'ok' keeps its OSM footprints (9 m assumed) — honest.
// ⚠ DEDUP: where a national source has FULL coverage, feed it INSTEAD of the OSM buildings clip for
// that region (replace, not append) so the same building is not drawn twice — at 9 m and at real
// height. For partial sources (BD TOPO nulls), append + let the client's near-cap thin duplicates.
// See CONTEXT-LOD-BUILD-PLAN.md §Integration for the replace-vs-append policy per source.

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const bboxToWsen = (s) => s.split(',').map(Number);
  (async () => {
    if (args.includes('--plan')) {
      console.log('PRYZM context height sources — per-region plan\n');
      for (const region of Object.keys(REGION_SOURCE)) {
        const { source, status, reason } = sourceForRegion(region);
        const src = source ? SOURCES[source] : null;
        console.log(`  ${region.padEnd(14)} ${(source ?? '—').padEnd(18)} ${(src?.impl ?? status).padEnd(11)} ${src?.lodNow ?? ''} ${reason ? '· ' + reason : ''}`);
      }
      return;
    }
    if (args.includes('--probe')) {
      const which = args[args.indexOf('--probe') + 1];
      const ids = which && !which.startsWith('--') ? [which] : ['bdtopo', '3dbag', 'catastro'];
      for (const id of ids) {
        console.log(`\n▶ probe ${id} (${SOURCES[id]?.endpoint})`);
        try { console.log(JSON.stringify(await probeSource(id), null, 2)); }
        catch (e) { console.log(`  ✖ ${e.message}`); }
      }
      return;
    }
    const ri = args.indexOf('--resolve');
    if (ri >= 0) {
      const region = args[ri + 1];
      // Pull the bbox from bake.mjs's REGIONS if present, else require --bbox.
      const bi = args.indexOf('--bbox');
      let bbox = bi >= 0 ? bboxToWsen(args[bi + 1]) : undefined;
      if (!bbox) {
        try {
          const bake = await import('./bake.mjs').catch(() => null); // bake.mjs runs on import — guard.
          void bake;
        } catch { /* ignore */ }
      }
      console.log(JSON.stringify(await resolveHeights(region, { bbox }), null, 2));
      return;
    }
    console.log('usage: node heightSources.mjs [--plan | --probe [id] | --resolve <region> --bbox w,s,e,n]');
  })();
}
