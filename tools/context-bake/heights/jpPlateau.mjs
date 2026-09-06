// ─────────────────────────────────────────────────────────────────────────────
// §PLATEAU-JP (2026-09-06, lane JAPAN-FULL) — MLIT Project PLATEAU 3D都市モデル, LoD1 building model:
// the PURE, dependency-free half of the Japanese national measured-height stamp.
//
// WHY THIS FILE IS SEPARATE FROM heightSources.mjs — the heights/nl3dbag.mjs / heights/eeHeights.mjs
// precedent, for the same two reasons: heightSources.mjs is edited by many lanes at once and a
// whole-function insertion there collides, and vitest cannot import it (its transform rejects the file
// with a bare SyntaxError). Every DECISION the stamp makes — the index URLs, which tileset of a
// municipality to read, the b3dm header arithmetic, the two batch-table encodings, WHICH heights are
// honest, the tile-tree walk, the match rule, the city working set — lives here as a total function of
// its arguments and is unit-tested against fixtures taken from the live service
// (__tests__/jpPlateau.spec.ts). The network + join half is heights/jpPlateauStamp.mjs.
//
// ═══ THE CHANNEL — LIVE-PROBED 2026-09-06, every number below is a measurement, not a reading ═══
//
// 1. THE INDEX IS MACHINE-READABLE. G空間情報センター (the National Spatial Data Infrastructure portal)
//    runs CKAN: `https://www.geospatial.jp/ckan/api/3/action/package_search?q=plateau&rows=1`
//    → HTTP 200 application/json 212,606 B, `"count": 495`. Every municipality is one dataset named
//    `plateau-<JIS city code>-<romaji>-<fiscal year>` (e.g. `plateau-13101-chiyoda-ku-2025`), licence
//    `license_id: "plateau"` / `license_title: "PLATEAU Site Policy 「３．著作権について」に拠る"`.
//    The PORTAL dataset (`name: "plateau"`) carries SIX per-year index JSONs — the resource URLs in
//    JP_PLATEAU_INDEX_URLS below. Each 302-redirects to a presigned `ckan-storage.s3.amazonaws.com`
//    link (follow redirects; the CKAN URL itself is stable, the S3 signature is minted per request).
//    Fetched 2026-09-06, following redirects: 2020 → HTTP 200 497,273 B · 2021 → 13,641 B ·
//    2022 → 478,854 B · 2023 → 1,019,901 B · 2024 → 757,358 B · 2025 → 1,049,768 B.
//    Aggregated: **474 municipality rows across the six years**, of which **305 publish a textured
//    LoD1 building 3D-Tiles tileset**. (The brief said "200+ municipalities"; the measured figure is
//    474 rows / 439 distinct city codes, so the brief was CONSERVATIVE, not wrong.)
//
// 2. ⭐ THE DERIVATIVES ARE PUBLISHED UNZIPPED, AT STABLE HTTPS URLS. This is the whole reason this
//    stamp is cheap. Each index row carries BOTH:
//      • `files[]` — the bulk ZIPs. Chiyoda-ku 2025 CityGML = `13101_chiyoda-ku_pref_2025_citygml_1_op.zip`,
//        REAL size read by range GET: **2,107,396,115 B (2.11 GB)**, `accept-ranges: bytes`, HTTP 206.
//        (⚠ the index's own `sizeinbytes` for that file says 2,254,857,830 — it does NOT match the
//        server. Read the server, not the index field.) A 2 GB unzip-and-XML-parse per ward is NOT a
//        bake channel; it is why the CityGML route was rejected.
//      • `tileset[]` — the SAME model already converted to 3D Tiles and SERVED, one `tileset.json` per
//        (municipality × LoD × texture) at `https://assets.cms.plateau.reearth.io/assets/…/tileset.json`.
//        Chiyoda LoD1 textured: HTTP 200, 14,778 B, `last-modified: Tue, 10 Mar 2026 11:19:34 GMT`.
//
// 3. ⭐⭐ THE TILESET DECLARES THE HEIGHT, AND THE b3dm BATCH TABLE CARRIES IT PER BUILDING **WITH A
//    POSITION**. Chiyoda LoD1 `tileset.json` `properties` (verbatim key list in the fixture) includes
//    `"bldg:measuredHeight": { "minimum": 0.8, "maximum": 209.5 }`, `bldg:storeysAboveGround` (1..44),
//    `uro:BuildingIDAttribute_uro:buildingID`, `uro:lod1HeightType`, and — decisively —
//    **`_x`, `_y`, `_xmin`, `_xmax`, `_ymin`, `_ymax`, `_zmin`, `_zmax`**.
//    A b3dm's batch table is PLAIN JSON in the file header, before the glTF, so a RANGE GET of the
//    first (28 + ftJSON + ftBIN + btJSON + btBIN) bytes reads every building's attributes without
//    downloading one triangle. PROBED on `data/data4.b3dm`: header range 0-27 → HTTP 206, magic
//    `b3dm`, version 1, byteLength 197,452, ftJSON 20, ftBIN 0, btJSON 105,416, btBIN 1,888; the
//    107,352-byte prefix decodes to 19 buildings, e.g. `13101-bldg-3931` h=198.60 m at
//    139.762825,35.687662 (Otemachi — a real Marunouchi tower). That prefix IS the fixture
//    `jp-plateau-b3dm-chiyoda-data4-2026-09-06.bin`, byte-for-byte.
//
//    ⚠ THE ENCODING IS NOT UNIFORM ACROSS TILES, and a reader that assumes one of them silently
//    produces ZERO measured heights on half the tiles. In `data4.b3dm` `bldg:measuredHeight` is a
//    BINARY reference `{byteOffset:0, componentType:"DOUBLE", type:"SCALAR"}`; in the leaf
//    `data0.b3dm` the SAME key is a plain JSON `ARRAY[1846]` while `_x`/`_y` stay binary references.
//    `batchTableColumn` below handles both, and both branches are pinned by REAL bytes.
//    ⚠ btJSON is a BYTE length, not a character count — the batch table is full of Japanese text, so
//    slicing by characters desynchronises the binary body. `parseB3dmHeader` returns byte offsets only.
//
// 4. ⭐ THE PROVENANCE IS IN THE DATA, AND IT IS NOT ALL MEASURED. `uro:lod1HeightType` takes two
//    values in Chiyoda (whole-tileset census, all 15 leaf tiles, 12,558 buildings, 2026-09-06):
//      • `点群から取得_中央値` ("obtained from the point cloud — median")  **12,059 (96.0 %)**
//      • `取得不可のため一律値（3m）` ("uniform value (3 m) because acquisition was impossible")
//        **499 (4.0 %)** — and in the batch table their `bldg:measuredHeight` is **null**.
//    The second class is a DEFAULT wearing a measured field's clothes, and stamping it would recreate
//    the fabricated-9 m-carpet defect this repo keeps fighting (L-12946 / §CONTEXT-DATA-HONESTY).
//    `plateauPartsFromBatchTable` REFUSES it BY NAME and counts it, and only
//    `点群から取得_中央値` earns `pryzm:height_src=measured-lidar` — it is a LiDAR point-cloud
//    median, which is exactly what that marker asserts. The per-building CityGML `attributes` blob
//    names the instrument in the same words: `uro:publicSurveySrcDescLod1: ["数値地形図データ",
//    "航空レーザ測量の測量成果"]` — "airborne laser survey results".
//
// 5. THE JOIN IS GEOMETRIC, NOT BY ID. PLATEAU keys buildings by `uro:buildingID`
//    (`13101-bldg-3037`) and by `gml_id`; OSM has neither, so there is no id to join on and none is
//    claimed. The join is `_x`,`_y` (the building's WGS84 centroid) point-in-polygon into bake's OWN
//    OSM footprint, with a reverse fallback (OSM centroid inside the PLATEAU `_xmin.._ymax` box) for
//    footprints OSM has split — the eeHeights / usOpenHeights rule.
//    ⭐ MEASURED MATCH RATE ON A REAL SAMPLE (2026-09-06, Chiyoda leaf tile `data0` vs live Overpass
//    over the identical rectangle 139.76962,35.69614,139.78270,35.70514 — Kanda/Akihabara):
//      • OSM building ways in the rectangle: **4,285** (1,298 = 30.3 % carry `height` or `building:levels`)
//      • PLATEAU rows there with an HONEST measured height: **1,804**
//      • PLATEAU centroid falls inside an OSM building polygon: **1,693 / 1,804 = 93.8 %**
//      • distinct OSM footprints that receive a measured height: **1,596 / 4,285 = 37.2 %**
//      • of those, **1,022 had NO `height` and NO `building:levels`** — they go from fabricated to measured
//      • where BOTH exist (574): mean signed diff **+5.25 m** (PLATEAU taller — OSM `levels`×3 and
//        Japanese eaves-height tags both under-read), median |diff| 3.90 m, p90 |diff| 12.60 m.
//    The 37.2 % is NOT a defect to hide: PLATEAU LoD1 models registered buildings, while Japanese OSM
//    carries a dense import of small structures (garages, canopies, covered walkways) that PLATEAU
//    does not model. Those keep their honest OSM tags. The 6.2 % of PLATEAU rows that land in no OSM
//    polygon are buildings OSM lacks, or geometry offsets — they are DROPPED, never snapped to a
//    neighbour.
//
// 6. LICENCE — 公共データ利用規約（第1.0版）(PDL 1.0). MLIT's own site policy, fetched 2026-09-06
//    (https://www.mlit.go.jp/plateau/site-policy/ → HTTP 200 text/html 31,822 B), verbatim:
//    「本利用ルールは、クリエイティブ・コモンズ・ライセンスの表示4.0 国際ライセンス（以下「CC BY」）と
//    互換性があります。」 — the rules are CC BY 4.0 COMPATIBLE. Attribution is required
//    (「出典：国土交通省 PLATEAUウェブサイト」) and edits must be declared as edits. Copyright in the
//    3D city models published on G空間情報センター rests with each LOCAL GOVERNMENT, not MLIT.
//    ⚠ The same policy flags 測量法 (the Survey Act) constraints on public-survey results and points at
//    「3D都市モデル整備のための測量マニュアル」 — named here so the constraint is not discovered later.
//    KEYLESS: no account, no subscription key, no repo secret, on every URL this module uses.
//
// 7. WHAT THIS MODULE DOES **NOT** CLAIM. It reads LoD1 (one measured height per building). The LoD2
//    tilesets (206 municipalities) carry roof FORM, which nothing in the bake consumes today — named,
//    not read. GSI's DEM tiles (§ below, in jpPlateauStamp) are terrain, not building heights. And a
//    municipality with no PLATEAU row keeps its honest OSM `assumed` default: this is a
//    §JOIN-BOUNDED-WORKING-SET stamp, and the boundary is stated, not hidden.
// ─────────────────────────────────────────────────────────────────────────────

export const JP_PLATEAU = {
  // The CKAN portal dataset that indexes every year's municipality table (probed 2026-09-06).
  ckanPortal: 'https://www.geospatial.jp/ckan/dataset/plateau',
  ckanSearch: 'https://www.geospatial.jp/ckan/api/3/action/package_search?q=plateau',
  // The b3dm attribute names the join reads. All six were read out of the LIVE Chiyoda tileset.
  heightKey: 'bldg:measuredHeight',
  lonKey: '_x',
  latKey: '_y',
  bboxKeys: ['_xmin', '_ymin', '_xmax', '_ymax'],
  idKey: 'uro:BuildingIDAttribute_uro:buildingID',
  heightTypeKey: 'uro:lod1HeightType',
  storeysKey: 'bldg:storeysAboveGround',
  // ⭐ THE HONESTY GATE. Only these `uro:lod1HeightType` values are a MEASUREMENT. Anything else —
  // including the 4.0 % `取得不可のため一律値（3m）` rows, whose measuredHeight is null anyway — is
  // refused BY NAME and counted, never stamped. A new value appearing in a future release lands in
  // `skippedUnknownType` and shows up in the stamp's note, rather than silently becoming "measured".
  measuredHeightTypes: ['点群から取得_中央値', '点群から取得_最頻値', '点群から取得_平均値'],
  refusedHeightTypes: ['取得不可のため一律値（3m）'],
  heightSourceTag: 'plateau-lod1-measuredHeight',
  attribution: '出典：国土交通省 Project PLATEAU 3D都市モデル（G空間情報センター）— 公共データ利用規約 第1.0版（PDL 1.0、CC BY 4.0 互換）。'
    + '3D都市モデルの著作権は各地方公共団体に帰属。PRYZM が OSM フットプリントへ結合して加工。',
  // A LoD1 building tileset URL looks like `…_bldg_3dtiles…lod1/tileset.json`; `…lod1_no_texture`
  // exists for some municipalities and is equivalent for our purposes (we read attributes, not pixels),
  // so it is accepted as a FALLBACK only — preferring one shape keeps a run reproducible.
  lod1TilesetRe: /_bldg_3dtiles.*lod1(?:_no_texture)?\/tileset\.json$/i,
  lod1NoTextureRe: /lod1_no_texture\/tileset\.json$/i,
  // Physical sanity, applied AFTER the type gate. Chiyoda's own tileset declares min 0.8 / max 209.5;
  // Abeno Harukas (Osaka, Japan's tallest building) is 300 m. Anything outside is a decode fault.
  minHeightM: 0.5,
  maxHeightM: 400,
};

/**
 * The six per-year index JSONs published as resources of the `plateau` portal dataset. Each is a CKAN
 * download URL that 302s to a presigned S3 link — follow redirects. Fetched sizes 2026-09-06 are in
 * the header above; do NOT hard-code a row count from them, the tables grow every fiscal year.
 */
export const JP_PLATEAU_INDEX_URLS = [
  { year: 2025, url: 'https://www.geospatial.jp/ckan/dataset/eb3f1d15-e495-4f78-8eba-0da82c0d081f/resource/d0718cfb-9f6b-43f8-92f6-112476c99442/download/mlit_plateau_3d_2025.json' },
  { year: 2024, url: 'https://www.geospatial.jp/ckan/dataset/eb3f1d15-e495-4f78-8eba-0da82c0d081f/resource/9fa03dce-2241-4913-807a-72d359c804e5/download/mlit_plateau_3d_2024.json' },
  { year: 2023, url: 'https://www.geospatial.jp/ckan/dataset/eb3f1d15-e495-4f78-8eba-0da82c0d081f/resource/e4c459e2-446b-4a29-b0d5-dd65cbdcf782/download/mlit_plateau_3d_2023.json' },
  { year: 2022, url: 'https://www.geospatial.jp/ckan/dataset/eb3f1d15-e495-4f78-8eba-0da82c0d081f/resource/e6b9e7fb-a0ad-4ae0-a997-7ce1bebf59a7/download/mlit_plateau_3d_2022.json' },
  { year: 2021, url: 'https://www.geospatial.jp/ckan/dataset/eb3f1d15-e495-4f78-8eba-0da82c0d081f/resource/8c8bbe8a-d1ec-4b9a-8773-6da897e4797e/download/mlit_plateau_3d_2021.json' },
  { year: 2020, url: 'https://www.geospatial.jp/ckan/dataset/eb3f1d15-e495-4f78-8eba-0da82c0d081f/resource/ad62ad7e-a113-47a6-ab8e-7c073ad80e99/download/mlit_plateau_3d_2020.json' },
];

/**
 * §JOIN-BOUNDED-WORKING-SET (L-659 / L-12947) — the bboxes the `japan` join may HOLD footprints for.
 * Japan is one whole-country bake row (0.03–0.05 deg² per city here against ~380 deg² for the nation),
 * so the working set is a CITY LIST, exactly as germany / netherlands / estonia / norway do, and a
 * footprint outside every box streams through with its ORIGINAL OSM tags. THAT BOUNDARY IS A KNOWN
 * SHORTFALL, not a claim of national coverage: heightJoinCoverage.spec.ts is the register that pins it.
 *
 * Every city below was CHECKED against the live index on 2026-09-06 — the count is the number of
 * municipalities within ±0.25° lon / ±0.20° lat that publish a LoD1 tileset:
 *   tokyo 45 · yokohama 13 · osaka 12 · nagoya 4 · sapporo 1 · fukuoka 3 · kyoto 2 · kobe 3 ·
 *   sendai 1 · hiroshima 2.
 * The stamp resolves the ACTUAL tilesets per run from the index (`plateauRecordsForBboxes`), so a
 * municipality added in a later fiscal year is picked up without editing this list.
 */
export const JP_CITY_BBOXES = [
  // city         [w, s, e, n] WGS84 (osmium -b order)
  { city: 'tokyo', bbox: [139.66, 35.60, 139.85, 35.76] },
  { city: 'yokohama', bbox: [139.55, 35.40, 139.72, 35.52] },
  { city: 'osaka', bbox: [135.42, 34.62, 135.58, 34.76] },
  { city: 'nagoya', bbox: [136.83, 35.10, 136.98, 35.23] },
  { city: 'sapporo', bbox: [141.26, 43.00, 141.44, 43.12] },
  { city: 'fukuoka', bbox: [130.33, 33.54, 130.46, 33.64] },
  { city: 'kyoto', bbox: [135.68, 34.94, 135.82, 35.06] },
  { city: 'kobe', bbox: [135.11, 34.65, 135.26, 34.74] },
  { city: 'sendai', bbox: [140.82, 38.22, 140.94, 38.32] },
  { city: 'hiroshima', bbox: [132.40, 34.34, 132.52, 34.44] },
];

/** True when two [w,s,e,n] boxes overlap (inclusive). */
export function bboxesIntersect(a, b) {
  if (!Array.isArray(a) || a.length !== 4 || !Array.isArray(b) || b.length !== 4) return false;
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/** Grow a [w,s,e,n] box by `padDeg` on every side. */
export function padBbox(b, padDeg) {
  return [b[0] - padDeg, b[1] - padDeg, b[2] + padDeg, b[3] + padDeg];
}

/**
 * A 3D Tiles `boundingVolume` → [w,s,e,n] DEGREES, or `null` when it is a `box`/`sphere` we cannot
 * cheaply convert. PLATEAU's tilesets use `region` (radians) throughout — verified on the Chiyoda
 * fixture — but returning `null` rather than guessing keeps an unexpected volume from silently
 * becoming "the whole world" and pulling every tile.
 */
export function regionOfBoundingVolume(bv) {
  const r = bv && bv.region;
  if (!Array.isArray(r) || r.length < 4) return null;
  const D = 180 / Math.PI;
  const out = [r[0] * D, r[1] * D, r[2] * D, r[3] * D];
  return out.every((v) => Number.isFinite(v)) ? out : null;
}

/**
 * Walk a tileset tree and return the tiles worth READING for `bbox`: the LEAVES (nodes with content
 * and no children). PLATEAU tilesets are `refine: "REPLACE"` — verified on the Chiyoda fixture, whose
 * root and mid nodes hold only 19–20 coarse buildings while the 15 leaves hold all 12,558 — so the
 * leaves are the complete set and reading a parent as well would double-count.
 * Returns `[{ uri, bbox }]`, filtered to tiles whose region intersects `bbox` when one is given.
 */
export function tilesetLeafTiles(tilesetJson, bbox = null) {
  const out = [];
  const walk = (t) => {
    if (!t || typeof t !== 'object') return;
    const kids = Array.isArray(t.children) ? t.children : [];
    if (t.content && typeof t.content.uri === 'string' && kids.length === 0) {
      const region = regionOfBoundingVolume(t.content.boundingVolume) ?? regionOfBoundingVolume(t.boundingVolume);
      if (!bbox || !region || bboxesIntersect(region, bbox)) out.push({ uri: t.content.uri, bbox: region });
    }
    for (const c of kids) walk(c);
  };
  walk(tilesetJson && tilesetJson.root);
  return out;
}

/** Resolve a tile's relative `uri` against its `tileset.json` URL. */
export function resolveTileUrl(tilesetUrl, uri) {
  if (/^https?:\/\//i.test(uri)) return uri;
  return tilesetUrl.replace(/[^/]*$/, '') + uri.replace(/^\.?\//, '');
}

/**
 * ⭐ WHICH TILE FORMAT a leaf uses — `'b3dm' | 'glb' | 'other'`. PLATEAU does NOT publish one format:
 * MEASURED over the whole JP_CITY_BBOXES working set on 2026-09-06 (150 index candidates → 38
 * tilesets actually covering the ten city boxes): **2,571 `.b3dm` leaf tiles across 37 municipalities
 * and 571 `.glb` leaf tiles across exactly ONE — `13106` 台東区 (Taito-ku, Tokyo)**; no municipality
 * mixes the two.
 *
 * ⛔ A `.glb` tile is 3D Tiles 1.1: its per-feature attributes live in glTF `EXT_structural_metadata`
 * property tables inside buffer views, NOT in a b3dm batch table, and this module CANNOT read them.
 * That is a NAMED REFUSAL with a count, never a silent skip — `stampJpPlateauHeightsOnGeojsonseq`
 * reports `glbTiles` and `glbMunicipalities` separately from `tileErrors`, because "we have not built
 * this reader" and "the server refused us" are different facts with different owners. Taito-ku
 * therefore keeps its honest OSM `assumed` heights, and an EXT_structural_metadata reader is the owed
 * follow-up. It was found the only way such a thing is ever found: the first end-to-end run over a
 * real Tokyo rectangle logged 35 tile errors reading `not a b3dm (first 4 bytes "glTF")`.
 */
export function tileFormatOf(uri) {
  if (typeof uri !== 'string') return 'other';
  if (/\.b3dm(\?|$)/i.test(uri)) return 'b3dm';
  if (/\.(glb|gltf)(\?|$)/i.test(uri)) return 'glb';
  return 'other';
}

/**
 * Parse the 28-byte b3dm header. Every field is a BYTE length (see the ⚠ in §3 of this file's header:
 * the batch-table JSON is full of Japanese text, so a character-based slice desynchronises the binary
 * body). Returns `null` when the magic is not `b3dm`, so a proxy's HTML error page can never be read
 * as a tile.
 */
export function parseB3dmHeader(buf) {
  if (!buf || buf.length < 28) return null;
  if (buf.toString('latin1', 0, 4) !== 'b3dm') return null;
  const version = buf.readUInt32LE(4);
  const byteLength = buf.readUInt32LE(8);
  const ftJSON = buf.readUInt32LE(12), ftBIN = buf.readUInt32LE(16);
  const btJSON = buf.readUInt32LE(20), btBIN = buf.readUInt32LE(24);
  const btJsonStart = 28 + ftJSON + ftBIN;
  const btBinStart = btJsonStart + btJSON;
  return {
    version, byteLength, ftJSON, ftBIN, btJSON, btBIN, btJsonStart, btBinStart,
    // The prefix a range GET must ask for to read every attribute and no geometry.
    prefixBytes: btBinStart + btBIN,
  };
}

/**
 * Decode the batch-table JSON + binary out of a buffer that starts at the b3dm magic. Returns
 * `{ json, bin }` or `null`. The buffer may be SHORTER than `byteLength` (that is the point — we
 * range-GET only `prefixBytes`), but it must reach the end of the batch-table binary.
 */
export function readB3dmBatchTable(buf) {
  const h = parseB3dmHeader(buf);
  if (!h) return null;
  if (buf.length < h.btBinStart + h.btBIN) return null;
  let json;
  try { json = JSON.parse(buf.toString('utf8', h.btJsonStart, h.btJsonStart + h.btJSON)); }
  catch { return null; }
  if (!json || typeof json !== 'object') return null;
  return { json, bin: buf.subarray(h.btBinStart, h.btBinStart + h.btBIN), header: h };
}

const COMPONENT_READ = {
  DOUBLE: { size: 8, read: (b, o) => b.readDoubleLE(o) },
  FLOAT: { size: 4, read: (b, o) => b.readFloatLE(o) },
  BYTE: { size: 1, read: (b, o) => b.readInt8(o) },
  UNSIGNED_BYTE: { size: 1, read: (b, o) => b.readUInt8(o) },
  SHORT: { size: 2, read: (b, o) => b.readInt16LE(o) },
  UNSIGNED_SHORT: { size: 2, read: (b, o) => b.readUInt16LE(o) },
  INT: { size: 4, read: (b, o) => b.readInt32LE(o) },
  UNSIGNED_INT: { size: 4, read: (b, o) => b.readUInt32LE(o) },
};

/**
 * ⭐ Read one batch-table column as a plain array of length `n`, handling BOTH encodings the live
 * service uses in the SAME tileset — a JSON array, or a `{byteOffset, componentType, type}` reference
 * into the batch-table binary. Chiyoda `data4.b3dm` encodes `bldg:measuredHeight` as a binary DOUBLE
 * while the leaf `data0.b3dm` encodes the SAME key as a JSON array (both branches pinned by real
 * bytes in __tests__/jpPlateau.spec.ts). A reader that assumes one of them ships zero heights on half
 * the tiles, and — because an unstamped footprint is indistinguishable from a footprint with no data —
 * says nothing while doing it. Returns `null` when the column is absent or unreadable.
 */
export function batchTableColumn(json, bin, key, n) {
  const spec = json ? json[key] : undefined;
  if (spec === undefined || spec === null) return null;
  if (Array.isArray(spec)) return spec.length >= n ? spec.slice(0, n) : null;
  if (typeof spec !== 'object' || typeof spec.byteOffset !== 'number') return null;
  if (spec.type && spec.type !== 'SCALAR') return null;     // VEC2/VEC3 columns are not used by this join
  const c = COMPONENT_READ[spec.componentType];
  if (!c || !bin) return null;
  const end = spec.byteOffset + n * c.size;
  if (spec.byteOffset < 0 || end > bin.length) return null;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = c.read(bin, spec.byteOffset + i * c.size);
  return out;
}

/** The number of features in a batch table — the length of any per-feature JSON array column. */
export function batchTableFeatureCount(json) {
  if (!json || typeof json !== 'object') return 0;
  for (const k of ['gml_id', 'feature_type', 'city_code']) if (Array.isArray(json[k])) return json[k].length;
  for (const v of Object.values(json)) if (Array.isArray(v)) return v.length;
  return 0;
}

/**
 * ⭐ THE HONESTY GATE + the part builder. Turn one decoded batch table into the parts the join owns:
 * `{ id, h, clon, clat, x0, y0, x1, y1, area }`, one per building that carries a REAL measured height.
 *
 * A building is refused, BY NAME and with a count, when:
 *   • its `uro:lod1HeightType` is a declared non-measurement (`取得不可のため一律値（3m）` — 4.0 % of
 *     Chiyoda) → `refusedType`. Its height is null in the data anyway; the count is what matters,
 *     because it is the honest answer to "why is this building still 9 m?".
 *   • its `uro:lod1HeightType` is a value this module has never seen → `unknownType`. NOT stamped:
 *     a new code must be read before it is trusted (the [[confident-register-rows-are-the-wrong-ones]] rule).
 *   • its height is null / non-finite / outside [minHeightM, maxHeightM] → `noHeight` / `outOfRange`.
 *   • it has no `_x`/`_y` → `noPosition`. Never placed by its tile's bounding volume.
 * `area` is the `_xmin.._ymax` box area in deg² — a PROXY for footprint area (PLATEAU's batch table
 * publishes no polygon), used only to weight the P90 when one OSM footprint owns several buildings.
 */
/**
 * Strict numeric coercion. `Number(null)` is **0**, not NaN — so a batch-table column that carries an
 * explicit `null` for a missing `_x`/`_y` would otherwise read as longitude 0, latitude 0 and place the
 * building in the Gulf of Guinea instead of being counted as `noPosition`. That is exactly the
 * failure-looks-like-a-value collapse §CONTEXT-DATA-HONESTY exists to stop, and it was caught by the
 * spec rather than by a bake — keep this helper on every field that can be absent.
 */
function num(v) {
  return (v === null || v === undefined || v === '' || typeof v === 'boolean') ? NaN : Number(v);
}

export function plateauPartsFromBatchTable(json, bin, cfg = JP_PLATEAU) {
  const n = batchTableFeatureCount(json);
  const skipped = { refusedType: 0, unknownType: 0, noHeight: 0, outOfRange: 0, noPosition: 0 };
  const heightTypes = {};
  if (n === 0) return { parts: [], skipped, heightTypes, features: 0 };
  const h = batchTableColumn(json, bin, cfg.heightKey, n);
  const xs = batchTableColumn(json, bin, cfg.lonKey, n);
  const ys = batchTableColumn(json, bin, cfg.latKey, n);
  const [kx0, ky0, kx1, ky1] = cfg.bboxKeys;
  const x0s = batchTableColumn(json, bin, kx0, n), y0s = batchTableColumn(json, bin, ky0, n);
  const x1s = batchTableColumn(json, bin, kx1, n), y1s = batchTableColumn(json, bin, ky1, n);
  const ids = batchTableColumn(json, bin, cfg.idKey, n) ?? batchTableColumn(json, bin, 'gml_id', n);
  const types = batchTableColumn(json, bin, cfg.heightTypeKey, n);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = types ? types[i] : null;
    if (t != null) heightTypes[t] = (heightTypes[t] ?? 0) + 1;
    if (t != null && cfg.refusedHeightTypes.includes(t)) { skipped.refusedType++; continue; }
    if (t != null && !cfg.measuredHeightTypes.includes(t)) { skipped.unknownType++; continue; }
    const hv = h ? num(h[i]) : NaN;
    if (!Number.isFinite(hv) || hv <= 0) { skipped.noHeight++; continue; }
    if (hv < cfg.minHeightM || hv > cfg.maxHeightM) { skipped.outOfRange++; continue; }
    const clon = xs ? num(xs[i]) : NaN, clat = ys ? num(ys[i]) : NaN;
    if (!Number.isFinite(clon) || !Number.isFinite(clat)) { skipped.noPosition++; continue; }
    const bx0 = Number.isFinite(num(x0s?.[i])) ? num(x0s[i]) : clon, by0 = Number.isFinite(num(y0s?.[i])) ? num(y0s[i]) : clat;
    const bx1 = Number.isFinite(num(x1s?.[i])) ? num(x1s[i]) : clon, by1 = Number.isFinite(num(y1s?.[i])) ? num(y1s[i]) : clat;
    const area = Math.max(0, (bx1 - bx0)) * Math.max(0, (by1 - by0));
    parts.push({ id: ids ? String(ids[i]) : `#${i}`, h: hv, clon, clat, x0: bx0, y0: by0, x1: bx1, y1: by1, area });
  }
  return { parts, skipped, heightTypes, features: n };
}

/** Ray-cast point-in-ring (the usOpenHeights.mjs rule, kept local so this module imports nothing). */
export function pointInRing(x, y, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/**
 * A coarse uniform grid over the parts of ONE tile, so a footprint tests against its neighbours only.
 * `get([x0,y0,x1,y1])` returns the candidate parts for a footprint's bbox.
 */
export function partGrid(parts, cellDeg = 0.002) {
  const cells = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  for (const p of parts) {
    const cx = Math.floor(p.clon / cellDeg), cy = Math.floor(p.clat / cellDeg);
    const k = key(cx, cy);
    let a = cells.get(k); if (!a) { a = []; cells.set(k, a); }
    a.push(p);
  }
  return {
    cellDeg,
    get([x0, y0, x1, y1]) {
      const out = [];
      const cx0 = Math.floor(x0 / cellDeg) - 1, cx1 = Math.floor(x1 / cellDeg) + 1;
      const cy0 = Math.floor(y0 / cellDeg) - 1, cy1 = Math.floor(y1 / cellDeg) + 1;
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
        const a = cells.get(key(cx, cy)); if (a) out.push(...a);
      }
      return out;
    },
  };
}

/**
 * Match a footprint record `{ ext, interiors, clon, clat }` to the PLATEAU parts it owns.
 *   FORWARD  — every part whose CENTROID lies inside the footprint's outer ring (and in no hole).
 *              This is the normal case and the one the 93.8 % sample measured.
 *   REVERSE  — none did, but the FOOTPRINT's centroid lies inside a part's `_xmin.._ymax` box. This
 *              catches an OSM footprint that splits one PLATEAU building into wings. The SMALLEST
 *              containing box wins, so a footprint inside a large box and a small one takes the small.
 * Returns `{ owned, via }` with `via` `'forward' | 'reverse' | null`. `null` means the footprint keeps
 * its ORIGINAL OSM tags — never a neighbour's height.
 */
export function matchPartsToFootprint(rec, candidates) {
  const cand = candidates ?? [];
  const owned = [];
  for (const p of cand) {
    if (!pointInRing(p.clon, p.clat, rec.ext)) continue;
    let inHole = false;
    for (const h of (rec.interiors ?? [])) if (pointInRing(p.clon, p.clat, h)) { inHole = true; break; }
    if (!inHole) owned.push(p);
  }
  if (owned.length) return { owned, via: 'forward' };
  let best = null, bestArea = Infinity;
  for (const p of cand) {
    if (rec.clon < p.x0 || rec.clon > p.x1 || rec.clat < p.y0 || rec.clat > p.y1) continue;
    const a = Math.max(p.area, Number.EPSILON);
    if (a < bestArea) { best = p; bestArea = a; }
  }
  return best ? { owned: [best], via: 'reverse' } : { owned: [], via: null };
}

/**
 * The height a footprint takes from the parts it owns: the AREA-WEIGHTED P90 of their measured
 * heights — the eeHeights rule, and the vector analogue of what the raster joins take over pixels.
 * One owned part → that part's height exactly. Returns `null` when nothing is usable.
 */
export function areaWeightedP90(parts) {
  const rows = (parts ?? []).filter((p) => Number.isFinite(p.h) && p.h > 0);
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0].h;
  const sorted = [...rows].sort((a, b) => a.h - b.h);
  const total = sorted.reduce((s, p) => s + Math.max(p.area, Number.EPSILON), 0);
  let acc = 0;
  for (const p of sorted) {
    acc += Math.max(p.area, Number.EPSILON);
    if (acc >= total * 0.9) return p.h;
  }
  return sorted[sorted.length - 1].h;
}

/**
 * Pick the LoD1 building tileset URL out of one index row's `tileset[]`. Prefers the TEXTURED LoD1
 * (the shape 305 of 474 rows publish); falls back to `lod1_no_texture` when that is all a
 * municipality shipped. Returns `null` when the row publishes no LoD1 building tileset at all — 169
 * of the 474 rows are in that state, and they are a NAMED skip, not a silent one.
 */
export function plateauLod1TilesetUrl(record, cfg = JP_PLATEAU) {
  const list = Array.isArray(record && record.tileset) ? record.tileset : [];
  const urls = list.map((t) => t && t.url).filter((u) => typeof u === 'string' && cfg.lod1TilesetRe.test(u));
  if (urls.length === 0) return null;
  return urls.find((u) => !cfg.lod1NoTextureRe.test(u)) ?? urls[0];
}

/** The 5-digit JIS municipality code of an index row (`PLT:city_code`, else the first 5 of `DPF:municipality_code`). */
export function plateauCityCode(record) {
  const m = (record && record.metadata) || {};
  const c = m['PLT:city_code'] ?? m['DPF:municipality_code'];
  return c == null ? null : String(c).slice(0, 5);
}

/**
 * Choose the municipalities worth fetching for a working set. An index row carries a POINT
 * (`DPF:latitude`/`DPF:longitude`, the municipality's centre), not a bbox, so this is a coarse
 * pre-filter — `padDeg` must be at least half a large municipality's span. The precise decision is
 * taken later, per tileset, from its root `boundingVolume` (the 14 KB `tileset.json` is cheap).
 *
 * When the SAME city code appears in several fiscal years, the NEWEST wins: PLATEAU re-publishes a
 * municipality's whole model, and reading two years would double-count the same buildings.
 * Returns `[{ code, year, city, lon, lat, tilesetUrl }]`, sorted by code for a deterministic run.
 */
export function plateauRecordsForBboxes(indexes, bboxes, { padDeg = 0.35, cfg = JP_PLATEAU } = {}) {
  const boxes = (bboxes ?? []).map((b) => padBbox(b, padDeg));
  const best = new Map();
  for (const { year, json } of (indexes ?? [])) {
    for (const r of ((json && json.data_update) || [])) {
      const m = r.metadata || {};
      const lon = Number(m['DPF:longitude']), lat = Number(m['DPF:latitude']);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (!boxes.some((b) => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3])) continue;
      const tilesetUrl = plateauLod1TilesetUrl(r, cfg);
      if (!tilesetUrl) continue;
      const code = plateauCityCode(r);
      if (!code) continue;
      const prev = best.get(code);
      if (!prev || year > prev.year) best.set(code, { code, year, city: m['PLT:city'] ?? m['DPF:title'] ?? code, lon, lat, tilesetUrl, id: r.ori_id });
    }
  }
  return [...best.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
