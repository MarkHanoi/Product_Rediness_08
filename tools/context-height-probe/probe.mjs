#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM baked-context HEIGHT PROVENANCE probe — §CTX-HEIGHT-PROVENANCE (L-459) / §CONTEXT-DATA-HONESTY.
//
// WHY THIS EXISTS. `tools/context-bake/` can report that it stamped N measured heights, and that report
// is about the GeoJSONSeq it fed to tippecanoe. It says nothing about what the CLIENT ends up reading,
// because between the two sit: tippecanoe's simplification/drop-densest, the PMTiles merge across
// regions, the R2 upload, and the client's own provenance ladder. Every one of those can silently turn
// a measured height into an assumed one. The founder's question is never "did the join run" — it is
// "when I drop a site here, how much of what I see is real?", and only a read of the SHIPPED tiles
// answers that. So this probe reads `buildings.pmtiles` from the SAME URL the browser reads, with the
// SAME decoder libraries the client imports, and applies the SAME provenance rules.
//
// ⚠ §CONTEXT-DATA-HONESTY — A FETCH FAILURE AND A GENUINE EMPTY ARE DIFFERENT VALUES and this probe
// keeps them apart in the `verdict`, because collapsing them is the exact family of bug that produced
// L-422 / L-457 / L-467 / L-469:
//     unreachable   — the archive/header could not be read. We know NOTHING. Not a data verdict.
//     not-baked     — the archive is fine, but NO tile exists at this location. The city was never
//                     baked (or the bbox is outside every baked region). This is the L-607 gap.
//     empty         — tiles exist and decoded, but hold zero building footprints here. Genuinely
//                     nothing built (sea, forest, airfield) — a real answer, not a failure.
//     unmeasured    — footprints exist, but ZERO carry the measured marker. This is the Córdoba shape:
//                     "we have context, and it is guessed."
//     measured      — footprints exist AND at least one carries a real measured height.
//
// USAGE:
//   node probe.mjs --at 50.9375,6.9603 --name koln
//   node probe.mjs --at 41.3874,2.1686 --name barcelona --json
//   node probe.mjs --at 37.8882,-4.7794 --name cordoba --half-deg 0.02
//   node probe.mjs --at 50.9375,6.9603 --name koln --base http://localhost:5000/api/context-tiles/
//   node probe.mjs --at 50.9375,6.9603 --name koln --geojsonseq ../context-bake/out/koln-buildings-stamped.geojsonseq
//
// `--geojsonseq` probes a LOCAL bake artefact (pre-tippecanoe) instead of the shipped tiles, using the
// identical provenance ladder — that is how you get an honest BEFORE/AFTER without a publish. The two
// modes are labelled distinctly in the output (`source: 'pmtiles' | 'geojsonseq'`); they are NOT the
// same measurement and must never be quoted as if they were.
//
// EXIT CODES: 0 = a verdict was reached (any verdict). 2 = unreachable (no verdict possible).
//             3 = bad arguments / missing decoder deps.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, parse as parsePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── the shipped tiles base ──────────────────────────────────────────────────
// The public R2 base the bake publishes to and the deploy hands the client as `VITE_CONTEXT_TILES_URL`
// (.github/workflows/context-bake.yml `PUBLIC_BASE`). Reading the SAME bytes the browser reads is the
// point; anything else measures a different system (the "probe can be wrong three ways" trap).
const DEFAULT_TILES_BASE = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/';

// ── client parity constants — mirrored from apps/editor/src/ui/geospatial/ ──
// ⚠ These are DUPLICATED, not imported: this is a plain-Node `tools/` script and the client is TS
// inside a Vite app. Each one names its source so a drift is findable; if you change the client, change
// these, or the probe silently starts measuring a system nobody ships.
const LAYER = 'buildings';
const LAYER_Z = 16;                       // contextTiles.ts LAYER_ZOOM.buildings
const HALF_DEG_DEFAULT = 0.008;           // contextBuildings.ts CONTEXT_BBOX_HALF_DEG (the NEAR ring)
const LAYER_DEFINING_TAGS = ['building', 'building:part']; // contextTiles.ts LAYER_DEFINING_TAGS.buildings
const MEASURED_TAG = 'pryzm:height_src';  // heightSources.mjs MEASURED_HEIGHT_SRC_TAG
const MEASURED_VALUE = 'measured-lidar';  // heightSources.mjs MEASURED_HEIGHT_SRC_VALUE
const DEFAULT_BUILDING_HEIGHT_M = 9;      // contextBuildings.ts DEFAULT_BUILDING_HEIGHT_M
const METRES_PER_LEVEL = 3.2;             // contextBuildings.ts METRES_PER_LEVEL

/**
 * Resolve a height + its PROVENANCE from OSM-style tags.
 *
 * ⚠ THIS IS A LINE-FOR-LINE MIRROR of `resolveHeightWithProvenance` in
 * apps/editor/src/ui/geospatial/contextBuildings.ts (the `pryzm:height_src` branch first, then
 * `height`, then `building:levels`, then the 9 m default). The ladder ORDER is the whole measurement —
 * reading `height` before the marker would collapse `measured-lidar` into `tagged` and report a
 * measured city as a merely-surveyed one. Kept as a function, not inlined, so the parity is checkable.
 */
function resolveHeightWithProvenance(tags) {
  if (tags) {
    if (tags[MEASURED_TAG] === MEASURED_VALUE) {
      const hm = parseFloat(tags.height ?? tags['building:height'] ?? '');
      if (Number.isFinite(hm) && hm > 0) return { height_m: hm, provenance: 'measured-lidar' };
    }
    const h = parseFloat(tags.height ?? tags['building:height'] ?? '');
    if (Number.isFinite(h) && h > 0) return { height_m: h, provenance: 'tagged' };
    const lvl = parseFloat(tags['building:levels'] ?? tags.levels ?? '');
    if (Number.isFinite(lvl) && lvl > 0) {
      const roof = parseFloat(tags['roof:height'] ?? '');
      return { height_m: lvl * METRES_PER_LEVEL + (Number.isFinite(roof) && roof > 0 ? roof : 0), provenance: 'derived-levels' };
    }
  }
  return { height_m: DEFAULT_BUILDING_HEIGHT_M, provenance: 'assumed' };
}

/**
 * Does this provenance render as an OPAQUE SOLID (LOD200) rather than a translucent ghost massing?
 *
 * §CTX-HEIGHT-FIDELITY-RENDER (L-647) — apps/editor/src/ui/geospatial/CesiumViewport.ts:
 *   `const heightAccurate = provenance === 'tagged' || provenance === 'measured-lidar';`
 * Everything else draws as a soft grey block, the honest "height not surveyed" signal. So
 * `solidRenderFraction` is not a cosmetic statistic: it is literally the share of the skyline the
 * founder will see as real massing.
 */
const rendersSolid = (p) => p === 'tagged' || p === 'measured-lidar';

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const AT = arg('--at');
const NAME = arg('--name', 'site');
const HALF_DEG = Number(arg('--half-deg', String(HALF_DEG_DEFAULT)));
const BASE_RAW = arg('--base', process.env.PRYZM_CONTEXT_TILES_URL ?? DEFAULT_TILES_BASE);
const GEOJSONSEQ = arg('--geojsonseq');
const JSON_OUT = argv.includes('--json');
/**
 * §LOCAL-PMTILES (L-658) — probe a PMTiles file ON DISK instead of over HTTP. This is what lets CI
 * assert PROVENANCE on the tileset it just baked, BEFORE publishing it to R2. Without it the only
 * way to check a bake was to publish it first and probe the public URL — i.e. ship the defect, then
 * discover it.
 */
const PMTILES_FILE = arg('--pmtiles');
/**
 * §MEASURED-GATE (L-658) — exit non-zero unless at least N footprints carry a MEASURED height.
 * Turns the probe into a CI assertion. `derived-levels` deliberately does NOT count: a floor count
 * times an assumed storey height is not a measurement.
 */
const REQUIRE_MEASURED = arg('--require-measured') === null ? null : Number(arg('--require-measured'));
/**
 * §OFFICIAL-FOOTPRINTS GATE (L-12939, 2026-09-05) — exit non-zero unless the named national-register
 * reference is PRESENT in the tiles with at least `--require-floors` storeys.
 *
 * WHY A REFCAT AND NOT A COUNT. The measured-height gate above asks "are there ≥ N measured
 * footprints here", which is the right question for a raster stamp. It is the WRONG question for a
 * footprint swap: a region can carry half a million OSM footprints, pass every count-based check,
 * and still be missing the specific 2020 house the founder is standing in — which is exactly the
 * defect this lane exists to close (CL Isla Lanzarote 4, Córdoba, refcat 1950501UG4915S: "Residencial
 * · 320 m² · 2020" on the Sede Electrónica, ABSENT from our map because our footprints are OSM).
 * "A building we know exists, by its own national identifier, at its own storey count" is the only
 * assertion that can tell a real official bake from an OSM bake that happens to be large.
 *
 * `--require-floors` reads `building:levels` — the register's REAL integer. It deliberately does
 * NOT read a metre value: Catastro publishes storey COUNTS, and `pryzm:height_floors_m` is our own
 * `floors × 3.0` derivation. Asserting the derivation would be asserting our own arithmetic.
 */
const REQUIRE_REF = arg('--require-ref');
const REQUIRE_FLOORS = arg('--require-floors') === null ? null : Number(arg('--require-floors'));
/**
 * §FR-BDTOPO-FOOTPRINTS GATE (L-12940, 2026-09-06) — the FRENCH half of the named-building gate:
 * the matched `--require-ref` must carry a `pryzm:height_kind` of this value, and when that value
 * is 'measured' it must ALSO carry a finite `height` > 0.
 *
 * WHY `--require-floors` COULD NOT SERVE. It reads `building:levels` on purpose, because Spain's
 * register publishes storey COUNTS and asserting our own floors×3.0 derivation would be asserting
 * our own arithmetic. France is the opposite case: IGN's BD TOPO publishes `hauteur` IN METRES,
 * measured, and cross-checked against the LiDAR HD MNH raster to a median |delta| of 0.73 m over
 * the founder's two parcels. The founder's Sète complaint is "not true HEIGHT", so the gate has to
 * assert the metre value and its PROVENANCE — a `floors×3.0` estimate satisfying a height gate is
 * the honesty inversion C57 §1.9 bans, and a storey count says nothing about it either way.
 *
 * Deliberately NOT a numeric threshold on the metres. A hard-coded "≥ 7.0 m at Sète" would fail on
 * IGN's next re-survey of a building that is still perfectly correct; the durable assertions are
 * "this building exists, by its national identifier" and "its height is MEASURED, not derived".
 */
const REQUIRE_HEIGHT_KIND = arg('--require-height-kind');

if (!AT || !/^-?[\d.]+,\s*-?[\d.]+$/.test(AT.trim())) {
  console.error('✖ --at lat,lon is required, e.g. --at 50.9375,6.9603 --name koln');
  process.exit(3);
}
const [LAT, LON] = AT.split(',').map((s) => Number(s.trim()));
if (!Number.isFinite(LAT) || !Number.isFinite(LON) || !Number.isFinite(HALF_DEG) || HALF_DEG <= 0) {
  console.error('✖ --at must be finite lat,lon and --half-deg a positive number');
  process.exit(3);
}
const BASE = BASE_RAW.endsWith('/') ? BASE_RAW : `${BASE_RAW}/`;

// ── bbox / tile math — mirrors contextBuildings.contextBboxAround + contextTiles.tilesCovering ──
function contextBboxAround(lat, lon, halfDeg) {
  const lonScale = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return [lon - halfDeg * lonScale, lat - halfDeg, lon + halfDeg * lonScale, lat + halfDeg];
}
const lonToTileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
function latToTileY(lat, z) {
  const c = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const r = (c * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
function tilesCovering([w, s, e, n], z) {
  const out = [];
  const max = 2 ** z;
  for (let y = latToTileY(n, z); y <= latToTileY(s, z); y++) {
    for (let x = lonToTileX(w, z); x <= lonToTileX(e, z); x++) {
      if (x < 0 || y < 0 || x >= max || y >= max) continue;
      out.push({ x, y });
    }
  }
  return out;
}
function ringIntersectsBbox(ring, [w, s, e, n]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return maxX >= Math.min(w, e) && minX <= Math.max(w, e) && maxY >= Math.min(s, n) && minY <= Math.max(s, n);
}

// ── decoder deps ────────────────────────────────────────────────────────────
/**
 * Borrow the CLIENT'S OWN tile decoders (`pmtiles`, `@mapbox/vector-tile`, `pbf`) by resolving them
 * from the workspace that DECLARES them (`apps/editor/package.json`). Deliberately not a new
 * `package.json` under `tools/`: adding one to a pnpm workspace changes the lockfile, and an
 * out-of-sync lockfile fails the Fly build silently. Deliberately not a re-implementation either — a
 * hand-rolled PMTiles/MVT reader is a second decoder that can disagree with the shipped one, i.e. a
 * probe that measures a system nobody runs. Returns null (honest, with an install hint) if absent.
 */
/**
 * The nearest ancestor directory holding an INSTALLED `apps/editor` (i.e. `apps/editor/node_modules`).
 *
 * ⚠ Not simply `../../apps/editor`: under pnpm's strict (non-hoisted) layout a package is only visible
 * through the symlink farm of the workspace that declares it, and a `git worktree` checkout has no
 * `node_modules` of its own — so the honest anchor is the nearest INSTALLED checkout up the tree, which
 * for a worktree under `<repo>/.claude/worktrees/…` is the main checkout. Returns null if none.
 */
function findEditorAnchor() {
  let dir = HERE;
  const { root } = parsePath(dir);
  for (;;) {
    const pkg = resolve(dir, 'apps', 'editor', 'package.json');
    if (existsSync(pkg) && existsSync(resolve(dir, 'apps', 'editor', 'node_modules'))) return pkg;
    if (dir === root) return null;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * §CONTEXT-CACHE-BUST (L-658) — read `CONTEXT_TILESET_VERSION` out of the CLIENT'S OWN source.
 *
 * The probe exists to read the SAME BYTES the browser reads. `<layer>.pmtiles` is path-stable and
 * R2 publishes it `max-age=31536000, immutable`, so the client stamps `?v=<version>` on the archive
 * URL to make a re-bake visible. If the probe did not stamp the SAME value it would be reading a
 * different cache entry from the browser — and the probe's whole job is to be authoritative about
 * what the browser sees. So the version is parsed from the one file that DEFINES it rather than
 * duplicated here, where the copy could silently drift.
 *
 * Returns null when the source cannot be found (a bare tools-only checkout) — the caller then reads
 * the unstamped URL and SAYS SO, rather than guessing a version.
 */
function readContextTilesetVersion() {
  let dir = HERE;
  const { root } = parsePath(dir);
  for (;;) {
    const src = resolve(dir, 'apps', 'editor', 'src', 'ui', 'geospatial', 'contextTiles.ts');
    if (existsSync(src)) {
      const m = /export const CONTEXT_TILESET_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(readFileSync(src, 'utf8'));
      return m ? m[1] : null;
    }
    if (dir === root) return null;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
const TILESET_VERSION = readContextTilesetVersion();

async function loadTileDeps() {
  try {
    const anchor = findEditorAnchor();
    if (!anchor) return null;
    const req = createRequire(anchor);
    const load = async (id) => import(pathToFileURL(req.resolve(id)).href);
    const pmtiles = await load('pmtiles');           // CJS → named + default both carry PMTiles
    const vt = await load('@mapbox/vector-tile');    // ESM → named VectorTile
    const pbf = await load('pbf');                   // ESM → named PbfReader (pbf v5, as contextTiles.ts imports)
    const PMTiles = pmtiles.PMTiles ?? pmtiles.default?.PMTiles;
    const VectorTile = vt.VectorTile ?? vt.default?.VectorTile;
    const Pbf = pbf.PbfReader ?? pbf.default?.PbfReader ?? pbf.default ?? pbf.Pbf;
    if (!PMTiles || !VectorTile || !Pbf) return null;
    return { PMTiles, VectorTile, Pbf };
  } catch {
    return null;
  }
}

/**
 * §LOCAL-PMTILES — the `pmtiles` reader's `Source` interface, backed by a local file. PMTiles is a
 * RANGE format: the reader asks for byte windows (header, directories, one tile) and never reads the
 * whole archive, so this stays cheap even on a 2.3 GB tileset. Mirrors what the HTTP source does with
 * a `Range:` header.
 */
class FileSource {
  constructor(path) { this.path = path; this.size = statSync(path).size; }
  getKey() { return this.path; }
  async getBytes(offset, length) {
    const len = Math.max(0, Math.min(length, this.size - offset));
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(this.path, 'r');
    try { readSync(fd, buf, 0, len, offset); } finally { closeSync(fd); }
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }
}

// ── the two read modes ──────────────────────────────────────────────────────
/** Read the SHIPPED PMTiles. Returns `{ status, tags[], tilesRead, tilesEmpty, tilesFailed, z }`. */
async function readFromPmtiles(bbox) {
  const deps = await loadTileDeps();
  if (!deps) {
    return { status: 'unreachable', reason: 'tile decoders (pmtiles / @mapbox/vector-tile / pbf) are not installed — run `pnpm install` at the repo root, then re-run. NOT a statement about the tiles.' };
  }
  const { PMTiles, VectorTile, Pbf } = deps;
  // §LOCAL-PMTILES — a `--pmtiles <path>` run reads the file on disk through a minimal range source,
  // so CI can assert provenance on the tileset it just baked, BEFORE it is published.
  // §CONTEXT-CACHE-BUST — stamp the archive URL exactly as the client does, so the probe and the
  // browser resolve to the SAME cache entry. A local file needs no stamp.
  const httpUrl = TILESET_VERSION ? `${BASE}${LAYER}.pmtiles?v=${TILESET_VERSION}` : `${BASE}${LAYER}.pmtiles`;
  const url = PMTILES_FILE ? resolve(process.cwd(), PMTILES_FILE) : httpUrl;
  if (PMTILES_FILE && !existsSync(url)) {
    return { status: 'unreachable', reason: `local tileset not found: ${url}`, url };
  }
  const archive = new PMTiles(PMTILES_FILE ? new FileSource(url) : url);
  let z = LAYER_Z;
  let header;
  try {
    header = await archive.getHeader();
    z = Math.min(z, header.maxZoom);
    if (z < header.minZoom) return { status: 'unreachable', reason: `zoom ${z} below tileset minZoom ${header.minZoom}` };
  } catch (e) {
    // §CONTEXT-DATA-HONESTY — this is the "we know nothing" branch. It is NOT "there is no context".
    return { status: 'unreachable', reason: `header read failed for ${url}: ${e?.message ?? e}` };
  }
  const tiles = tilesCovering(bbox, z);
  const tags = [];
  let tilesRead = 0, tilesEmpty = 0, tilesFailed = 0, pieces = 0;
  const seenIds = new Set();
  for (const { x, y } of tiles) {
    let data = null;
    try { data = (await archive.getZxy(z, x, y))?.data ?? null; }
    catch { tilesFailed++; continue; }
    if (!data) { tilesEmpty++; continue; }  // a genuinely absent tile — the not-baked signal
    tilesRead++;
    let vtLayer;
    try { vtLayer = new VectorTile(new Pbf(new Uint8Array(data))).layers[LAYER]; }
    catch { tilesFailed++; continue; }
    if (!vtLayer) continue;
    for (let i = 0; i < vtLayer.length; i++) {
      const f = vtLayer.feature(i);
      const t = {};
      for (const [k, v] of Object.entries(f.properties)) t[k] = String(v);
      if (!LAYER_DEFINING_TAGS.some((k) => k in t)) continue;
      const g = f.toGeoJSON(x, y, z).geometry;
      const ring = g.type === 'Polygon' ? g.coordinates[0]
        : g.type === 'MultiPolygon' ? g.coordinates[0]?.[0]
          : null;
      if (!ring || ring.length < 3 || !ringIntersectsBbox(ring, bbox)) continue;
      pieces++;
      // A footprint straddling a tile seam is baked as one CLIPPED PIECE PER TILE (contextTiles.ts
      // §BAKE-UNIQUE-ID note). Counting pieces would inflate the footprint count near seams, so
      // de-duplicate on the real OSM id the bake carries (`--add-unique-id=type_id`) where present.
      const id = f.id ?? t['@id'] ?? null;
      if (id != null) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
      }
      tags.push(t);
    }
  }
  return { status: 'ok', tags, tilesRead, tilesEmpty, tilesFailed, tilesCovering: tiles.length, pieces, z, url };
}

/** Read a LOCAL bake artefact (GeoJSONSeq, pre-tippecanoe). Same ladder, different source. */
function readFromGeojsonseq(path, bbox) {
  if (!existsSync(path)) return { status: 'unreachable', reason: `geojsonseq not found: ${path}` };
  const tags = [];
  let lines = 0, malformed = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s) continue;
    lines++;
    let feat;
    try { feat = JSON.parse(s); } catch { malformed++; continue; }
    const g = feat?.geometry;
    const ring = g?.type === 'Polygon' ? g.coordinates?.[0]
      : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0]
        : null;
    if (!Array.isArray(ring) || ring.length < 3 || !ringIntersectsBbox(ring, bbox)) continue;
    const t = {};
    for (const [k, v] of Object.entries(feat.properties ?? {})) t[k] = String(v);
    if (!LAYER_DEFINING_TAGS.some((k) => k in t)) continue;
    tags.push(t);
  }
  return { status: 'ok', tags, lines, malformed, path };
}

// ── the measurement ─────────────────────────────────────────────────────────
/** Tally provenance across decoded tag bags. Mirrors `summariseContextHeightProvenance`. */
function summarise(tagBags) {
  const hist = { measuredLidar: 0, tagged: 0, derivedLevels: 0, assumed: 0 };
  const heights = [];
  let measuredMarkerCount = 0, solid = 0;
  for (const t of tagBags) {
    if (t[MEASURED_TAG] === MEASURED_VALUE) measuredMarkerCount++;
    const { height_m, provenance } = resolveHeightWithProvenance(t);
    if (provenance === 'measured-lidar') hist.measuredLidar++;
    else if (provenance === 'tagged') hist.tagged++;
    else if (provenance === 'derived-levels') hist.derivedLevels++;
    else hist.assumed++;
    if (rendersSolid(provenance)) solid++;
    heights.push(height_m);
  }
  const total = tagBags.length;
  heights.sort((a, b) => a - b);
  return {
    footprints: total,
    provenance: hist,
    assumedFraction: total ? Number((hist.assumed / total).toFixed(3)) : 0,
    solidRenderFraction: total ? Number((solid / total).toFixed(3)) : 0,
    // ⚠ measuredMarkerCount counts the TAG; provenance.measuredLidar counts footprints that also had a
    // usable numeric height. They should be equal — a gap means the bake stamped the marker onto a
    // footprint with a missing/junk height, which the client resolves DOWN the ladder (honestly) and
    // which is a bake bug worth seeing rather than averaging away.
    measuredMarkerCount,
    heightStats: total
      ? { min: heights[0], median: heights[(heights.length / 2) | 0], max: heights[heights.length - 1] }
      : null,
  };
}

/** The five-valued verdict. Read the §CONTEXT-DATA-HONESTY block at the top before changing this. */
function verdictFor(read, s) {
  if (read.status !== 'ok') return 'unreachable';
  if (s.footprints === 0) {
    // Distinguish "no tile at all here" (never baked) from "tiles decoded, nothing built" (genuine).
    return read.tilesRead === 0 ? 'not-baked' : 'empty';
  }
  return s.measuredMarkerCount > 0 ? 'measured' : 'unmeasured';
}

const VERDICT_TEXT = {
  unreachable: '✖ UNREACHABLE — no verdict. This says NOTHING about the data; the source could not be read.',
  'not-baked': '✖ NOT BAKED — the archive is healthy but holds NO tile at this location. The city has no baked context (the L-607 gap). Add a `bake.mjs` REGION and re-bake.',
  empty: '○ EMPTY — tiles decoded here and contain zero building footprints. A genuine "nothing built", not a failure.',
  unmeasured: '⚠ UNMEASURED — context exists, but NOT ONE footprint carries a measured height. Every height here is an OSM tag, a levels guess, or the 9 m default.',
  measured: '✔ MEASURED — real per-building heights from an authoritative source are present in the shipped tiles.',
};

// ── run ─────────────────────────────────────────────────────────────────────
const bbox = contextBboxAround(LAT, LON, HALF_DEG);
const t0 = Date.now();
const read = GEOJSONSEQ ? readFromGeojsonseq(resolve(process.cwd(), GEOJSONSEQ), bbox) : await readFromPmtiles(bbox);
const stats = read.status === 'ok' ? summarise(read.tags) : summarise([]);
const verdict = verdictFor(read, stats);
const report = {
  name: NAME,
  at: { lat: LAT, lon: LON },
  bbox,
  halfDeg: HALF_DEG,
  source: GEOJSONSEQ ? 'geojsonseq' : 'pmtiles',
  origin: GEOJSONSEQ ? read.path : read.url ?? `${BASE}${LAYER}.pmtiles`,
  verdict,
  reason: read.reason ?? null,
  ...stats,
  tiles: GEOJSONSEQ
    ? { lines: read.lines ?? 0, malformed: read.malformed ?? 0 }
    : { covering: read.tilesCovering ?? 0, read: read.tilesRead ?? 0, absent: read.tilesEmpty ?? 0, failed: read.tilesFailed ?? 0, pieces: read.pieces ?? 0, zoom: read.z ?? null },
  ms: Date.now() - t0,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const p = report.provenance;
  console.log(`\nPRYZM context height probe — ${report.name} @ ${LAT}, ${LON}  (±${HALF_DEG}°)`);
  console.log(`  source        : ${report.source} ← ${report.origin}`);
  console.log(`  verdict       : ${verdict}`);
  console.log(`                  ${VERDICT_TEXT[verdict]}`);
  if (report.reason) console.log(`  reason        : ${report.reason}`);
  console.log(`  footprints    : ${report.footprints}`);
  console.log(`  provenance    : ${p.measuredLidar} measured-lidar · ${p.tagged} tagged · ${p.derivedLevels} derived-levels · ${p.assumed} ASSUMED (${DEFAULT_BUILDING_HEIGHT_M} m default)`);
  console.log(`  assumedFraction      : ${report.assumedFraction}   ← share of heights that are FABRICATED`);
  console.log(`  solidRenderFraction  : ${report.solidRenderFraction}   ← share drawn as opaque LOD200 massing (L-647)`);
  console.log(`  measuredMarkerCount  : ${report.measuredMarkerCount}   ← footprints carrying ${MEASURED_TAG}=${MEASURED_VALUE}`);
  if (report.heightStats) console.log(`  height m      : min ${report.heightStats.min} · median ${report.heightStats.median} · max ${report.heightStats.max}`);
  console.log(`  tiles         : ${JSON.stringify(report.tiles)}`);
  console.log(`  ms            : ${report.ms}\n`);
}

// §MEASURED-GATE (L-658) — the CI assertion. `Assert the tiles are real` used to check only the
// tileset's SIZE and its magic header, which is why a 2.3 GB buildings.pmtiles carrying ZERO measured
// heights in Barcelona, Köln and Copenhagen passed as green on 2026-08-01. Size is not provenance.
// With `--require-measured N` the probe asserts the thing that actually matters, per city.
if (REQUIRE_MEASURED !== null) {
  if (!Number.isFinite(REQUIRE_MEASURED) || REQUIRE_MEASURED < 0) {
    console.error('✖ --require-measured expects a non-negative number');
    process.exit(3);
  }
  if (read.status !== 'ok') {
    console.error(`✖ MEASURED GATE — ${NAME}: could not read the tiles (${verdict}${report.reason ? `: ${report.reason}` : ''}). This is NOT a statement about the data.`);
    process.exit(5);
  }
  if (report.measuredMarkerCount < REQUIRE_MEASURED) {
    console.error(
      `✖ MEASURED GATE FAILED — ${NAME}: ${report.measuredMarkerCount} footprint(s) carry a measured height, ` +
      `required ≥ ${REQUIRE_MEASURED}.\n` +
      `  ${report.footprints} footprint(s) here render ${Math.round(report.assumedFraction * 100)}% fabricated heights. ` +
      'derived-levels does NOT count as measured — a floor count × an assumed storey height is not a measurement.');
    process.exit(6);
  }
  console.log(`✔ MEASURED GATE — ${NAME}: ${report.measuredMarkerCount} measured footprint(s) (≥ ${REQUIRE_MEASURED}).`);
}

// §OFFICIAL-FOOTPRINTS GATE (L-12939) — the footprint-swap assertion. See --require-ref above.
if (REQUIRE_REF !== null) {
  if (read.status !== 'ok') {
    console.error(`✖ OFFICIAL FOOTPRINTS GATE — ${NAME}: could not read the tiles (${verdict}${report.reason ? `: ${report.reason}` : ''}). This is NOT a statement about the data.`);
    process.exit(5);
  }
  // The tag keys mirror tools/context-bake/footprints/officialFootprints.mjs OFFICIAL_TAGS. Both
  // sides carry their own copy on purpose (the bake is .mjs, this is a standalone probe with no
  // import of it); esCatastro.spec.ts pins the producing half, and a rename that reaches only one
  // side fails HERE — loudly — rather than shipping tiles whose data nothing reads.
  const REF_TAG = 'pryzm:ref';
  const PART_TAG = 'pryzm:part';
  const SRC_TAG = 'pryzm:source';
  const hits = read.tags.filter((t) => t[REF_TAG] === REQUIRE_REF);
  if (hits.length === 0) {
    const anyOfficial = read.tags.filter((t) => t[SRC_TAG]).length;
    console.error(
      `✖ OFFICIAL FOOTPRINTS GATE FAILED — ${NAME}: reference ${REQUIRE_REF} is NOT in the tiles.
` +
      `  ${report.footprints} footprint(s) read here, of which ${anyOfficial} carry an official ${SRC_TAG}. ` +
      (anyOfficial === 0
        ? 'NONE are official — the run baked OSM footprints. Did it pass `--footprints official`, and did the region declare a footprintSource?'
        : 'Official footprints ARE present, so the merge ran — but this specific building is missing from them. Check the municipality resolved from the ATOM feed and its bbox.'));
    process.exit(7);
  }
  const floors = hits
    .map((t) => Number(t['building:levels']))
    .filter((v) => Number.isFinite(v));
  const best = floors.length ? Math.max(...floors) : null;
  const parts = hits.filter((t) => t[PART_TAG] === 'true').length;
  if (REQUIRE_FLOORS !== null && (best === null || best < REQUIRE_FLOORS)) {
    console.error(
      `✖ OFFICIAL FOOTPRINTS GATE FAILED — ${NAME}: reference ${REQUIRE_REF} is present ` +
      `(${hits.length} feature(s), ${parts} part(s)) but its storey count is ${best === null ? 'ABSENT' : best}, ` +
      `required ≥ ${REQUIRE_FLOORS}.
` +
      '  A footprint with no `building:levels` renders as the fabricated 9 m default, which is the ' +
      'flat carpet this gate exists to catch — the register HAS the number.');
    process.exit(8);
  }
  // §FR-BDTOPO-FOOTPRINTS GATE (L-12940) — the metre value AND its provenance. See --require-height-kind.
  if (REQUIRE_HEIGHT_KIND !== null) {
    const KIND_TAG = 'pryzm:height_kind';
    const kinds = hits.map((t) => t[KIND_TAG] ?? 'ABSENT');
    const qualifying = hits.filter((t) => t[KIND_TAG] === REQUIRE_HEIGHT_KIND
      && (REQUIRE_HEIGHT_KIND !== 'measured' || (Number.isFinite(Number(t.height)) && Number(t.height) > 0)));
    if (qualifying.length === 0) {
      console.error(
        `✖ OFFICIAL FOOTPRINTS GATE FAILED — ${NAME}: reference ${REQUIRE_REF} is present ` +
        `(${hits.length} feature(s)) but NONE carries ${KIND_TAG}='${REQUIRE_HEIGHT_KIND}'` +
        `${REQUIRE_HEIGHT_KIND === 'measured' ? ' with a height > 0' : ''}.\n` +
        `  kinds read: ${[...new Set(kinds)].join(', ')} · heights read: ${[...new Set(hits.map((t) => t.height ?? 'ABSENT'))].join(', ')}\n` +
        (kinds.every((k) => k === 'ABSENT')
          ? `  NO feature here carries ${KIND_TAG} at all — these are OSM footprints, or the adapter's tag contract regressed.`
          : '  The footprint landed but its height is DERIVED, not measured. A floors×3.0 estimate must never satisfy a measured-height gate (C57 §1.9).'));
      process.exit(9);
    }
    console.log(`✔ MEASURED-HEIGHT GATE — ${NAME}: ${REQUIRE_REF} · ${qualifying.length}/${hits.length} feature(s) `
      + `${KIND_TAG}='${REQUIRE_HEIGHT_KIND}' · height ${qualifying.map((t) => t.height).join(', ')} m.`);
  }
  console.log(
    `✔ OFFICIAL FOOTPRINTS GATE — ${NAME}: ${REQUIRE_REF} present · ${hits.length} feature(s) ` +
    `(${parts} part(s) + ${hits.length - parts} outline(s)) · source ${hits[0][SRC_TAG] ?? 'UNSTAMPED'} · ` +
    `max ${best ?? 'no'} storey(s)${REQUIRE_FLOORS !== null ? ` (≥ ${REQUIRE_FLOORS})` : ''}.`);
}
process.exit(verdict === 'unreachable' ? 2 : 0);
