// ─────────────────────────────────────────────────────────────────────────────
// §ES-CATASTRO-FOOTPRINTS (L-12939, 2026-09-05, lane ES-CATASTRO-FOOTPRINTS)
//
// Spain's official building footprints, from the Dirección General del Catastro's INSPIRE
// Buildings download service — the source the founder pointed at when CL Isla Lanzarote 4
// (Córdoba, refcat 1950501UG4915S, "Residencial · 320 m² · 2020") turned out to be ABSENT from
// PRYZM's map because our `buildings` layer is OSM. See `officialFootprints.mjs` for the shared
// record shape, the merge rule, and the three measured facts that shape both files.
//
// ── THE ACCESS PATHS, PROBED FROM THIS MACHINE 2026-09-05 (exact answers) ────────────────────
//
// A. **ATOM / bulk ZIP — the path this adapter uses.** ✅
//    GET https://www.catastro.hacienda.gob.es/INSPIRE/buildings/ES.SDGC.BU.atom.xml
//      → HTTP 200, 682,565 B, 1.86 s, 56 <entry> (one per territorial office / province).
//    The Córdoba entry carries `<link rel="enclosure" href=".../14/ES.SDGC.bu.atom_14.xml"/>`
//    plus a `<georss:polygon>` bbox — SO THE FEED ITSELF ANSWERS "which provinces meet my bbox",
//    with no gazetteer and no hard-coded table. (⚠ that province href is `http://`; the server
//    answers **HTTP 302** on it and 200 on the https form — follow redirects or use https.)
//      GET .../buildings/14/ES.SDGC.bu.atom_14.xml → HTTP 200, 134,561 B, 0.37 s, 77 <entry>,
//      one per municipality, each with its OWN georss bbox, its ZIP enclosure, and — critically —
//      `<category term="http://www.opengis.net/def/crs/EPSG/0/25830" label="ETRS89"/>`, i.e. the
//      UTM ZONE IS DECLARED PER MUNICIPALITY. Spain spans EPSG:25829/25830/25831; reading the
//      zone off the feed is why this adapter needs no per-province projection table.
//      GET .../Buildings/14/14900-CORDOBA/A.ES.SDGC.BU.14900.zip → HTTP 200, **22,926,867 B**,
//      11.0 s, `application/x-zip-compressed`, containing
//        A.ES.SDGC.BU.14900.building.gml      183,967,642 B
//        A.ES.SDGC.BU.14900.buildingpart.gml  388,042,441 B
//        A.ES.SDGC.BU.14900.otherconstruction.gml 24,959,142 B
//        A.ES.SDGC.BU.MD.14900.xml                    20,001 B
//      ⚠ 22.9 MB of ZIP inflates to **597 MB** for ONE city. Nothing here may hold a whole GML
//      in memory, and nothing may build a >512 MiB string (the L-12937 France failure, one week
//      old). Both files are inflated and parsed as a bounded chunk stream.
//
// B. **WFS — works, but NOT for a bake.** ⚠
//    ⛔ **THE GATE IS THE `User-Agent`, NOT THE VERSION TOKEN.** ⚠ CORRECTED 2026-09-06 — the
//    original entry here read *"`version=2.0.0` is REFUSED … `version=2` is the form that works.
//    That one token was the entire difference between 'the WFS is down' and 'the WFS is fine'"*.
//    **That attribution is FALSE, and it was tested and disproved by re-running the probe.** What
//    `ovc.catastro.meh.es` actually rejects is curl's DEFAULT User-Agent, and it rejects it for
//    EVERY request — GetCapabilities included — with an identical **HTTP 400, 2,189 B of
//    text/html** whose only body text is *"No se puede procesar su petición."* Measured, same
//    minute, same machine:
//        curl (default UA)  ?version=2      &request=GetCapabilities → **HTTP 400**, 2,189 B
//        curl (default UA)  ?version=2.0.0  &request=GetCapabilities → **HTTP 400**, 2,189 B
//        curl -A "Mozilla/5.0 …Chrome/126…" ?version=2     &…       → **HTTP 200**, 16,182 B
//        curl -A "Mozilla/5.0 …Chrome/126…" ?version=2.0.0 &…       → **HTTP 200**, 16,182 B
//    **BOTH version tokens work; NEITHER works without a browser UA.** The identical 2,189-byte
//    body for every request — including one that cannot be malformed — is the tell, and it is what
//    the first reading missed: a version token was varied and a UA was not, so the difference got
//    pinned on the thing that happened to be varied. (§PROBE-CAN-BE-WRONG-THREE-WAYS: the probe
//    answered honestly and the DIAGNOSIS was wrong.) This adapter has always sent
//    `ES_CATASTRO.ua` on all three of its fetch sites, so nothing behaved differently — but an
//    agent who trusted the old note would have burned the next hour on the version string.
//    ✅ GET .../INSPIRE/wfsBU.aspx?service=wfs&version=2&request=GetCapabilities (WITH a UA) → HTTP 200,
//       16,182 B; FeatureTypes `bu:Building`, `bu:BuildingPart`, `bu:OtherConstruction`.
//    ⛔ `STOREDQUERIE_ID=GetBuildingPartByRefcat` (the name in the lane brief) → HTTP 200 with an
//       OWS ExceptionReport: `OperationProcessingFailed` /
//       *"Request parameter GetBuildingPartByRefcat not exists"*. ListStoredQueries names the
//       five that DO exist: GetBuildingByParcel · GetFeatureById · **GetBuildingPartByParcel** ·
//       GetOtherBuildingByParcel · GetAllConstructionByParcel.
//    ✅ `STOREDQUERIE_ID=GetBuildingPartByParcel&refcat=1950501UG4915S&srsname=EPSG::25830`
//       → HTTP 200, 11,274 B, **4 BuildingParts**.
//    ✅ bbox form `typeNames=bu:BuildingPart&srsname=EPSG::4326&bbox=37.885,-4.80,37.892,-4.79`
//       → HTTP 200, **7,365,789 B, 2,938 BuildingParts**, complete (closing
//       `</gml:FeatureCollection>`, no exception, no paging cursor).
//    ⛔ WHY THE BAKE STILL USES THE ZIP: 2,938 parts / 7.4 MB for a 0.01°×0.007° bbox is ~7 MB
//       per 0.8 km². Whole-Spain at that density is thousands of requests against a service with
//       no advertised paging (`ImplementsResultPaging` is declared but no CountDefault is), i.e.
//       the §BDTOPO-CAP-TRUNCATE shape one country over. The ZIP is 22.9 MB for a whole city.
//       The WFS is kept wired for the SINGLE-PARCEL door (`fetchParcelParts`) — the Parcel Law /
//       parcel-select surfaces want one refcat, live, not a re-bake.
//
// ── THE FOUNDER'S OWN PARCEL, READ BACK FROM ALL THREE PATHS (the gate's fixture) ────────────
//   Building `ES.SDGC.BU.1950501UG4915S`: currentUse `1_residential`, officialArea
//   **320 m² grossFloorArea** (the Sede's "320 m²"), dateOfConstruction **2020** (the Sede's
//   "2020"), conditionOfConstruction `functional`, `numberOfFloorsAboveGround` **NIL**.
//   Its four parts, ATOM ZIP and WFS-by-parcel agreeing exactly:
//       26.7 m² → 0 floors (a patio)   ·   10.2 m² → 2 floors
//       44.8 m² → 3 floors             ·   62.4 m² → 2 floors
//   ⇒ derived Building floors = max = **3**. Footprints sum to 144.1 m² of ground under 320 m²
//   of gross floor area — the shape of a real 3-storey house, and exactly the per-volume detail
//   the founder saw in the Visor 3D and asked for.
//   (The WFS **bbox** path returns those four geometries with parts 1↔2 swapped and the patio at
//   floors **1** — `officialFootprints.mjs` header fact 2. The ZIP is what we bake.)
//
// ── WHAT IS NOT CLAIMED ──────────────────────────────────────────────────────────────────────
//   • Catastro's territorial scope EXCLUDES the Basque provinces and Navarra (foral cadastres,
//     no ES.SDGC feed). Those municipalities resolve to ZERO official municipalities and keep
//     their OSM footprints — see the merge rule's second ⚠ in officialFootprints.mjs.
//   • `floors × 3.0 m` is a DERIVATION and is labelled one everywhere. Catastro publishes storey
//     COUNTS, not metres; no measured height is claimed from this source. Spain's measured
//     heights keep coming from the CNIG MDS raster stamp (`heightJoin:'mds'`), which now runs on
//     these footprints instead of OSM's — the two compose, they do not compete.
// ─────────────────────────────────────────────────────────────────────────────
import { createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { createInflateRaw } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';

import { getProjector } from '../reproject.mjs';
import {
  officialFootprintFeature,
  OFFICIAL_METRES_PER_FLOOR,
} from './officialFootprints.mjs';

export const ES_CATASTRO = Object.freeze({
  source: 'es_catastro',
  /** The root ATOM: one entry per territorial office (province). */
  rootAtom: 'https://www.catastro.hacienda.gob.es/INSPIRE/buildings/ES.SDGC.BU.atom.xml',
  /** Named so a probe/log can say WHICH register answered, never a bare "official". */
  label: 'DG del Catastro · INSPIRE Buildings (ATOM/GML)',
  /** The live single-parcel door. `version=2` — NOT 2.0.0; see the header. */
  wfs: 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx',
  /** Sede Electrónica terms: free reuse with attribution to the DG del Catastro. */
  attribution: 'Dirección General del Catastro (Ministerio de Hacienda)',
  /** Some Catastro hosts answer 400/403 to a default agent; a browser UA is stable. */
  ua: 'Mozilla/5.0 (compatible; PRYZM-context-bake/1.0; +https://pryzm.app)',
});

// ── PURE: ATOM parsing ──────────────────────────────────────────────────────

/**
 * `<georss:polygon>` is "lat lon lat lon …" (the INSPIRE download-service profile says so, and
 * the values confirm it: Córdoba reads 37.67…/-4.98…). Returns [w, s, e, n] in lon/lat order,
 * which is the order EVERY other bbox in this pipeline uses — converting here rather than at
 * each call site is deliberate: a half-converted bbox is a silent 90°-rotated query.
 */
export function parseGeorssPolygonBbox(text) {
  if (typeof text !== 'string') return null;
  const nums = text.trim().split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 6 || nums.length % 2 !== 0) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    const lat = nums[i], lon = nums[i + 1];
    if (lat < s) s = lat;
    if (lat > n) n = lat;
    if (lon < w) w = lon;
    if (lon > e) e = lon;
  }
  return [w, s, e, n];
}

/** Do two [w,s,e,n] boxes overlap? INTERSECTS, matching every other bbox test in the bake. */
export function bboxesIntersect(a, b) {
  if (!a || !b) return false;
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * `<category term="http://www.opengis.net/def/crs/EPSG/0/25830"/>` → 'EPSG:25830'.
 * Returns null when absent — the caller must then REFUSE the municipality rather than guess a
 * zone. A wrong UTM zone puts a building ~400 km from where it is, and it would look plausible.
 */
export function parseCrsFromCategory(entryXml) {
  const m = /def\/crs\/EPSG\/0\/(\d{4,5})/.exec(entryXml);
  return m ? `EPSG:${m[1]}` : null;
}

/**
 * Parse an INSPIRE ATOM feed into entries. Works for BOTH levels (the root's provinces and a
 * province's municipalities) because both use the same `<entry>` shape.
 * @returns {{title:string, href:string|null, bbox:number[]|null, epsg:string|null}[]}
 */
export function parseAtomEntries(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = (/<title\s*>([\s\S]*?)<\/title>/.exec(e)?.[1] ?? '').trim();
    const href = /<link[^>]*rel="enclosure"[^>]*href="([^"]+)"/.exec(e)?.[1] ?? null;
    const geo = /<georss:polygon>([\s\S]*?)<\/georss:polygon>/.exec(e)?.[1] ?? null;
    out.push({
      title,
      // The root feed's province hrefs are http:// and answer 302; normalise once, here.
      href: href ? href.replace(/^http:\/\/www\.catastro/, 'https://www.catastro') : null,
      bbox: geo ? parseGeorssPolygonBbox(geo) : null,
      epsg: parseCrsFromCategory(e),
    });
  }
  return out;
}

/** `" 14900-CORDOBA buildings"` → `{ code: '14900', name: 'CORDOBA' }`. */
export function parseMunicipalityTitle(title) {
  const m = /(\d{5})-(.+?)\s*(?:buildings)?\s*$/.exec(String(title).trim());
  return m ? { code: m[1], name: m[2].trim() } : null;
}

// ── PURE: GML feature parsing ───────────────────────────────────────────────

/** `1_residential` / `2_industrial` → the OSM-ish `building` value the client colours by. */
export const CATASTRO_USE_MAP = Object.freeze({
  '1_residential': 'residential',
  '2_agriculture': 'farm',
  '3_industrial': 'industrial',
  '4_1_office': 'office',
  '4_2_retail': 'retail',
  '4_3_publicServices': 'public',
});

export function mapCatastroUse(raw) {
  if (!raw) return null;
  return CATASTRO_USE_MAP[raw] ?? 'yes';
}

/**
 * Read the FIRST `<gml:posList>` of a featureMember and return native XY pairs.
 *
 * ⚠ FIRST, DELIBERATELY: a Catastro Surface's `<gml:exterior>` precedes any `<gml:interior>`, so
 * the first posList is the OUTER ring. Interiors (courtyards) are NOT carried — the bake's
 * buildings layer is `LAYER_KEEPS_HOLES: false` for buildings (contextTiles.ts), so a hole would
 * be discarded downstream anyway, and pretending to carry one here would be a shape the pipeline
 * cannot honour.
 */
export function parsePosList(memberXml) {
  const m = /<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/.exec(memberXml);
  if (!m) return null;
  const nums = m[1].trim().split(/\s+/);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]), y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    pts.push([x, y]);
  }
  return pts.length >= 3 ? pts : null;
}

/**
 * An INSPIRE nillable integer: `<…>3</…>` → 3, but
 * `<… xsi:nil="true" nilReason="other:unpopulated"></…>` → **null, not 0**.
 *
 * ⚠ THIS IS THE WHOLE POINT OF THE FUNCTION. Every Catastro Building has a nil
 * `numberOfFloorsAboveGround`; reading nil as 0 would silently flatten the entire country to
 * ground level and the pipeline would report full coverage. UNKNOWN and ZERO are different
 * values (C57 §1.5), and here one of them is also a real, common measurement (a patio IS
 * 0 storeys — see officialFootprints.mjs header fact 3), so they can never be collapsed.
 */
export function parseNillableInt(memberXml, localName) {
  const re = new RegExp(`<bu-ext2d:${localName}([^>]*)>([\\s\\S]*?)</bu-ext2d:${localName}>`);
  const m = re.exec(memberXml);
  if (!m) {
    // Self-closing nil form: `<bu-ext2d:numberOfFloorsAboveGround xsi:nil="true"/>`.
    const selfClosing = new RegExp(`<bu-ext2d:${localName}([^>]*)/>`).exec(memberXml);
    return selfClosing ? null : undefined;
  }
  if (/xsi:nil="true"/.test(m[1])) return null;
  const v = Number(m[2].trim());
  return Number.isFinite(v) ? v : null;
}

/** Parse ONE `<gml:featureMember>` holding a Building or a BuildingPart. Pure. */
export function parseCatastroMember(memberXml) {
  const isPart = memberXml.includes('<bu-ext2d:BuildingPart');
  const isBuilding = !isPart && memberXml.includes('<bu-ext2d:Building ');
  if (!isPart && !isBuilding) return null;

  // localId is `1950501UG4915S` on a Building and `1950501UG4915S_part3` on a part; the refcat is
  // the stem. ⚠ The `_partN` suffix is NOT a stable key across access paths (officialFootprints.mjs
  // header fact 2) — it is parsed only to recover the refcat, and never emitted.
  const localId = /<base:localId>([^<]+)<\/base:localId>/.exec(memberXml)?.[1]?.trim() ?? null;
  const ref = localId ? localId.split('_part')[0] : null;
  const pts = parsePosList(memberXml);
  if (!ref || !pts) return null;

  const floors = parseNillableInt(memberXml, 'numberOfFloorsAboveGround');
  const floorsBelow = parseNillableInt(memberXml, 'numberOfFloorsBelowGround');
  const condition = /<bu-core2d:conditionOfConstruction(?![^>]*xsi:nil="true")[^>]*>([^<]+)</
    .exec(memberXml)?.[1]?.trim() ?? null;
  const builtRaw = /<bu-core2d:beginning>(\d{4})-/.exec(memberXml)?.[1] ?? null;
  const use = /<bu-ext2d:currentUse>([^<]+)<\/bu-ext2d:currentUse>/.exec(memberXml)?.[1]?.trim() ?? null;

  return {
    ref,
    part: isPart,
    pts,
    floors: floors === undefined ? null : floors,
    floorsBelow: floorsBelow === undefined ? null : floorsBelow,
    use: mapCatastroUse(use),
    built: builtRaw ? Number(builtRaw) : null,
    condition,
  };
}

/**
 * Derive a Building's floor count from its parts. `max`, and labelled `'max-of-parts'`.
 *
 * ⚠ Returns null — NOT 0 — when the building has no parts at all, because "we hold no parts for
 * this refcat" and "every part of this building is 0 storeys" are different facts and only the
 * second is a height. `max` over an all-zero part set correctly returns 0 (a pure patio parcel).
 */
export function buildingFloorsFromParts(partFloors) {
  const known = partFloors.filter((f) => Number.isFinite(f));
  return known.length === 0 ? null : Math.max(...known);
}

/**
 * Split an inflating GML byte stream into `<gml:featureMember>` records without ever holding the
 * document. Latin-1 because the GML declares `encoding="ISO-8859-1"` — decoding those bytes as
 * UTF-8 corrupts every Spanish place name and can split a multi-byte sequence across chunks.
 * @param {AsyncIterable<Buffer>} chunks
 * @param {(memberXml: string) => void} onMember
 */
export async function streamFeatureMembers(chunks, onMember) {
  const CLOSE = '</gml:featureMember>';
  const OPEN = '<gml:featureMember>';
  let buf = '';
  let cursor = 0;   // §SPLIT-CURSOR — see below
  let members = 0;
  for await (const chunk of chunks) {
    buf += chunk.toString('latin1');
    for (;;) {
      const end = buf.indexOf(CLOSE, cursor);
      if (end < 0) break;
      const stop = end + CLOSE.length;
      const start = buf.indexOf(OPEN, cursor);
      if (start >= 0 && start < stop) { onMember(buf.slice(start, stop)); members++; }
      cursor = stop;
    }
    // §SPLIT-CURSOR — `buf = buf.slice(consumed)` after EVERY record is O(remaining) per record,
    // i.e. quadratic inside each chunk; a cursor + one compaction per chunk is linear.
    //
    // ⚠ MEASURED, AND THE MEASUREMENT IS THE POINT: on the real Córdoba ZIP (597 MB of inflated
    // GML) this took the run from **287.1 s to 246.1 s — 1.17×**, not the order of magnitude the
    // quadratic-slice reasoning predicts. The buffer copying was NOT the bottleneck. The cost is
    // dominated by `parseCatastroMember`'s ~7 regexes against every one of the municipality's
    // ~408,000 featureMembers, which happens whether or not the member is inside the bbox (the
    // geometry has to be read to know). Keep the cursor — it is strictly better and free — but do
    // not read this comment as "parsing is solved". If a future lane needs a faster pull, the
    // regex pass is where the time is; measure before optimising, as this line had to.
    //
    // ⇒ THE NUMBER THAT ACTUALLY CONSTRAINS THE DESIGN: ~250 s per city-sized municipality. The
    // whole-Spain feed is 5.66 GB of ZIP across 7,597 municipalities (HEAD-swept 2026-09-05,
    // 52 provinces, 0 failures) — roughly 250× Córdoba, i.e. ~17 h. The workflow's ceiling is 330
    // minutes. A whole-country footprint pull IS NOT POSSIBLE in one job, which is why
    // `footprintBboxes` is mandatory (footprintMerge.mjs assertFootprintConfig) rather than a
    // nice-to-have. A 9-city working set is ~40–70 min, which fits.
    if (cursor > 0) { buf = buf.slice(cursor); cursor = 0; }
    // A record is at most a few kB; anything larger means we are NOT looking at Catastro GML.
    // Refuse loudly rather than grow a string to the 512 MiB cap (the L-12937 shape).
    if (buf.length > 64 << 20) throw new Error('esCatastro: no </gml:featureMember> in 64 MB — not Catastro GML?');
  }
  return members;
}

// ── ZIP: stream ONE entry out of a local .zip, dependency-free ──────────────
//
// Node ships `zlib.createInflateRaw`, and a ZIP entry is exactly a raw DEFLATE stream after its
// local header. No unzip dependency is added (an added dep would mean a package.json edit, which
// this lane is forbidden from making, and it would be a dependency for 40 lines of work).

/** Parse the central directory → `{ name, compressedSize, uncompressedSize, method, localOffset }[]`. */
export function readZipCentralDirectory(zipPath) {
  const size = statSync(zipPath).size;
  const fd = openSync(zipPath, 'r');
  try {
    // End of Central Directory: scan the last 64 kB + 22 for signature 0x06054b50.
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.allocUnsafe(tailLen);
    readSync(fd, tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(`esCatastro: no ZIP end-of-central-directory in ${zipPath}`);
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    const cd = Buffer.allocUnsafe(cdSize);
    readSync(fd, cd, 0, cdSize, cdOffset);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10);
      const compressedSize = cd.readUInt32LE(p + 20);
      const uncompressedSize = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.toString('latin1', p + 46, p + 46 + nameLen);
      entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } finally { closeSync(fd); }
}

/** An async byte stream of ONE inflated ZIP entry. Method 8 (deflate) and 0 (stored) only. */
export function zipEntryStream(zipPath, entry) {
  const fd = openSync(zipPath, 'r');
  let dataStart;
  try {
    const lh = Buffer.allocUnsafe(30);
    readSync(fd, lh, 0, 30, entry.localOffset);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`esCatastro: bad local header for ${entry.name}`);
    dataStart = entry.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  } finally { closeSync(fd); }
  const raw = createReadStream(zipPath, { start: dataStart, end: dataStart + entry.compressedSize - 1 });
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`esCatastro: unsupported ZIP method ${entry.method} for ${entry.name}`);
  return raw.pipe(createInflateRaw());
}

// ── NETWORK ─────────────────────────────────────────────────────────────────

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': ES_CATASTRO.ua }, redirect: 'follow' });
  if (!r.ok) throw new Error(`esCatastro: GET ${url} → HTTP ${r.status}`);
  return await r.text();
}

/**
 * Resolve the municipalities whose georss bbox meets `bbox` ([w,s,e,n]).
 * Two feed levels, both read live — no hard-coded province or municipality table anywhere.
 * @returns {{status:'ok', municipalities:{code,name,href,epsg,bbox}[], provinces:number}
 *          |{status:'error', reason:string}}
 */
export async function resolveMunicipalities(bbox, { log = () => {} } = {}) {
  let root;
  try { root = await getText(ES_CATASTRO.rootAtom); }
  catch (e) { return { status: 'error', reason: `root ATOM unreachable: ${e.message}` }; }
  const provinces = parseAtomEntries(root).filter((p) => p.href && bboxesIntersect(p.bbox, bbox));
  log(`  catastro: ${provinces.length} province feed(s) meet the bbox`);
  const municipalities = [];
  const refused = [];
  for (const p of provinces) {
    let feed;
    try { feed = await getText(p.href); }
    catch (e) { refused.push(`${p.title}: ${e.message}`); continue; }
    for (const m of parseAtomEntries(feed)) {
      if (!m.href || !bboxesIntersect(m.bbox, bbox)) continue;
      const t = parseMunicipalityTitle(m.title);
      if (!t) continue;
      // ⚠ REFUSE, never guess. Spain spans EPSG:25829/25830/25831 and a wrong zone displaces a
      // building by hundreds of km while still looking like a plausible footprint.
      if (!m.epsg) { refused.push(`${t.code}-${t.name}: no EPSG in <category>`); continue; }
      municipalities.push({ code: t.code, name: t.name, href: m.href, epsg: m.epsg, bbox: m.bbox });
    }
  }
  return { status: 'ok', municipalities, provinces: provinces.length, refused };
}

/** Download one municipality ZIP to `dir` (skipped when already present and non-empty). */
export async function downloadMunicipalityZip(muni, dir, { log = () => {} } = {}) {
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `BU.${muni.code}.zip`);
  if (existsSync(path) && statSync(path).size > 1024) return { path, cached: true, bytes: statSync(path).size };
  const r = await fetch(muni.href, { headers: { 'User-Agent': ES_CATASTRO.ua }, redirect: 'follow' });
  if (!r.ok) throw new Error(`esCatastro: ZIP ${muni.code} → HTTP ${r.status}`);
  await pipeline(r.body, createWriteStream(path));
  const bytes = statSync(path).size;
  log(`  catastro: ${muni.code}-${muni.name} ZIP ${bytes.toLocaleString()} B`);
  return { path, cached: false, bytes };
}

/**
 * Parse ONE municipality ZIP → official footprint Features (parts AND derived outlines).
 *
 * Order matters and is the reason the parts file is read FIRST: a Building's floor count is
 * `max` over its parts (header fact 1), so the part index must exist before outlines are emitted.
 * Only the per-refcat max floor count is retained between passes — an integer per building, not
 * a geometry — so peak heap tracks BUILDINGS, not vertices.
 *
 * @param {(feat:object)=>void} emit called once per Feature, in stream order
 * @returns {{parts:number, buildings:number, partsSkipped:number, buildingsSkipped:number}}
 */
export async function parseMunicipalityZip(zipPath, epsg, emit, { bbox = null, log = () => {} } = {}) {
  const proj = getProjector(epsg); // throws for an unregistered zone — refuse, never guess
  const entries = readZipCentralDirectory(zipPath);
  const partEntry = entries.find((e) => /\.buildingpart\.gml$/i.test(e.name));
  const bldEntry = entries.find((e) => /\.building\.gml$/i.test(e.name));
  if (!partEntry || !bldEntry) {
    throw new Error(`esCatastro: ${zipPath} has no building/buildingpart GML (${entries.map((e) => e.name).join(', ')})`);
  }

  const toWgs = (pts) => {
    const ring = pts.map(([x, y]) => {
      const [lon, lat] = proj.inverse(x, y);
      return [Number(lon.toFixed(7)), Number(lat.toFixed(7))];
    });
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx !== lx || fy !== ly) ring.push([fx, fy]);
    return ring;
  };
  const inBbox = (ring) => {
    if (!bbox) return true;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of ring) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    return bboxesIntersect([minX, minY, maxX, maxY], bbox);
  };

  // ── pass 1: BuildingParts (emit each; remember max floors per refcat) ──
  const maxFloors = new Map();
  let parts = 0, partsSkipped = 0;
  await streamFeatureMembers(zipEntryStream(zipPath, partEntry), (xml) => {
    const rec = parseCatastroMember(xml);
    if (!rec || !rec.part) { partsSkipped++; return; }
    const ring = toWgs(rec.pts);
    if (!inBbox(ring)) return;
    if (Number.isFinite(rec.floors)) {
      const prev = maxFloors.get(rec.ref);
      if (prev === undefined || rec.floors > prev) maxFloors.set(rec.ref, rec.floors);
    }
    emit(officialFootprintFeature({
      source: ES_CATASTRO.source,
      ref: rec.ref,
      part: true,
      floors: rec.floors,
      floorsBelow: rec.floorsBelow,
      floorsKind: 'register',
      use: null,
      built: rec.built,
      condition: rec.condition,
    }, [ring]));
    parts++;
  });

  // ── pass 2: Buildings (outline; floors DERIVED from the parts seen above) ──
  let buildings = 0, buildingsSkipped = 0, buildingsWithoutParts = 0;
  await streamFeatureMembers(zipEntryStream(zipPath, bldEntry), (xml) => {
    const rec = parseCatastroMember(xml);
    if (!rec || rec.part) { buildingsSkipped++; return; }
    const ring = toWgs(rec.pts);
    if (!inBbox(ring)) return;
    const derived = maxFloors.has(rec.ref) ? maxFloors.get(rec.ref) : null;
    if (derived === null) buildingsWithoutParts++;
    emit(officialFootprintFeature({
      source: ES_CATASTRO.source,
      ref: rec.ref,
      part: false,
      // ⚠ Register floors on a Building are ALWAYS nil (header fact 1); `rec.floors` is kept in
      // the ladder only so a future feed that DOES populate it wins over our derivation.
      floors: Number.isFinite(rec.floors) ? rec.floors : derived,
      floorsBelow: rec.floorsBelow,
      floorsKind: Number.isFinite(rec.floors) ? 'register' : 'max-of-parts',
      use: rec.use,
      built: rec.built,
      condition: rec.condition,
    }, [ring]));
    buildings++;
  });

  log(`  catastro: ${parts} part(s) · ${buildings} building(s) · ${buildingsWithoutParts} building(s) with no parts (floors stay UNKNOWN, never 0)`);
  return { parts, buildings, partsSkipped, buildingsSkipped, buildingsWithoutParts, metresPerFloor: OFFICIAL_METRES_PER_FLOOR };
}

/**
 * The LIVE single-parcel door (WFS `GetBuildingPartByParcel`, `version=2`). Not used by the bake;
 * wired for the parcel-select / Parcel Law surfaces, which want ONE refcat now, not a re-bake.
 * @returns {{status:'ok', parts:object[]}|{status:'error', reason:string, http?:number}}
 */
export function wfsParcelPartsUrl(refcat, srs = 'EPSG::25830') {
  return `${ES_CATASTRO.wfs}?service=wfs&version=2&request=getfeature`
    + `&STOREDQUERIE_ID=GetBuildingPartByParcel&refcat=${encodeURIComponent(refcat)}&srsname=${srs}`;
}

export async function fetchParcelParts(refcat, { epsg = 'EPSG:25830' } = {}) {
  const url = wfsParcelPartsUrl(refcat, epsg.replace('EPSG:', 'EPSG::'));
  let r;
  try { r = await fetch(url, { headers: { 'User-Agent': ES_CATASTRO.ua } }); }
  catch (e) { return { status: 'error', reason: `WFS unreachable: ${e.message}` }; }
  const body = await r.text();
  if (!r.ok) return { status: 'error', reason: `WFS HTTP ${r.status}: ${body.slice(0, 200)}`, http: r.status };
  // §CONTEXT-DATA-HONESTY — an OWS ExceptionReport arrives as HTTP 200. "Zero parts" and "the
  // service refused" must never be the same value, so the exception is read BEFORE the parts.
  if (body.includes('<ExceptionReport')) {
    const t = /<ExceptionText>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/ExceptionText>/.exec(body)?.[1]?.trim();
    return { status: 'error', reason: `WFS exception: ${t ?? 'unparsed'}`, http: r.status };
  }
  const proj = getProjector(epsg);
  const parts = [];
  for (const m of body.matchAll(/<gml:featureMember>[\s\S]*?<\/gml:featureMember>/g)) {
    const rec = parseCatastroMember(m[0]);
    if (!rec || !rec.part) continue;
    parts.push({
      ref: rec.ref,
      floors: rec.floors,
      floorsBelow: rec.floorsBelow,
      ring: rec.pts.map(([x, y]) => proj.inverse(x, y)),
    });
  }
  return { status: 'ok', parts, url };
}
