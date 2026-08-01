// ─────────────────────────────────────────────────────────────────────────────
// §GEOJSONSEQ-READ (L-658) — the ONE reader every OSM-footprint height join uses.
//
// WHY THIS IS ITS OWN MODULE. It is pure file I/O with ZERO external dependencies, deliberately kept
// out of `heightSources.mjs` (which lazy-imports `geotiff`, a dep provisioned only inside the bake
// job). That separation is what lets the reader be unit-tested in the ordinary vitest run instead of
// only inside a 2.5-hour bake — which is precisely how the defect below reached production.
//
// WHAT WENT WRONG. Every join (ES mds / DK dhm / CH swiss / DE lod2nrw) used to open bake's own
// footprint file with `readFileSync(inPath,'utf8').split('\n')`. That is wrong TWICE, and the
// 2026-08-01 whole-layer bake (run 30687958478) hit BOTH at once while REPORTING SUCCESS:
//
//   1. V8 MAX STRING LENGTH. A whole-country clip is far bigger than V8's 0x1fffffe8 (512 MiB)
//      string cap, so `readFileSync(…,'utf8')` THROWS before a single feature is parsed. Observed
//      verbatim in that run's log:
//        "national heights · spain:   MDS join error — Cannot create a string longer than 0x1fffffe8 characters"
//        "national heights · denmark: DHM join error — Cannot create a string longer than 0x1fffffe8 characters"
//      The throw happened OUTSIDE each join's try{}, so bake.mjs's catch turned it into
//      `status:'error'` and the region silently kept the fabricated 9 m default.
//
//   2. THE RFC 8142 RECORD SEPARATOR. `osmium export -f geojsonseq` emits GeoJSON Text Sequence,
//      which prefixes EVERY record with RS (0x1e). `String.prototype.trim()` does NOT strip 0x1e
//      (it is not JS whitespace), so `JSON.parse` rejected every single line and the join reported
//      "0 OSM footprint(s) in the clip" for a file that demonstrably held thousands. Observed for
//      Köln in the same run, whose 4,267 footprints tippecanoe then tiled perfectly happily. That
//      join had been validated against footprints fetched from OVERPASS (hand-written JSON lines,
//      no RS) — never against osmium's real output — which is exactly why it passed review.
//
// So this reader (a) streams in bounded chunks and never materialises one giant string, and
// (b) strips RS. It returns a STRUCTURED result rather than throwing — the `tools/*.mjs` idiom for
// P8 observability (these are plain Node scripts with no tracer): every counter a caller needs to
// tell the failure modes apart is on the object.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, openSync, readSync, closeSync } from 'node:fs';

/** RFC 8142 record separator. `osmium export -f geojsonseq` writes it before each record. */
export const GEOJSONSEQ_RS = 0x1e;

/**
 * Stream a GeoJSON Text Sequence / JSON-lines file into parsed Features.
 * Never throws and never builds a >512 MiB string, so it is safe on a whole-country clip.
 * @param inPath absolute path to the .geojsonseq
 * @returns {{status:'ok'|'error', feats:object[], lines:number, parsed:number, malformed:number, rsStripped:number, bytes:number, reason?:string}}
 */
export function readGeojsonseqFeatures(inPath, { chunkBytes = 8 << 20 } = {}) {
  const out = { status: 'ok', feats: [], lines: 0, parsed: 0, malformed: 0, rsStripped: 0, bytes: 0 };
  if (!inPath || !existsSync(inPath)) {
    return { ...out, status: 'error', reason: `geojsonseq read: file not found (${inPath})` };
  }
  // Strip leading/trailing RS + ASCII whitespace at the BYTE level, then decode just this record.
  const pushLine = (buf) => {
    let a = 0, b = buf.length;
    let sawRs = false;
    while (a < b) {
      const c = buf[a];
      if (c === GEOJSONSEQ_RS) { sawRs = true; a++; continue; }
      if (c === 0x20 || c === 0x09 || c === 0x0d || c === 0x0a) { a++; continue; }
      break;
    }
    while (b > a) {
      const c = buf[b - 1];
      if (c === GEOJSONSEQ_RS || c === 0x20 || c === 0x09 || c === 0x0d || c === 0x0a) { b--; continue; }
      break;
    }
    if (b <= a) return; // blank line — not a record, not a failure
    out.lines++;
    if (sawRs) out.rsStripped++;
    try { out.feats.push(JSON.parse(buf.toString('utf8', a, b))); out.parsed++; }
    catch { out.malformed++; }
  };
  let fd;
  try {
    fd = openSync(inPath, 'r');
    const chunk = Buffer.allocUnsafe(chunkBytes);
    let tail = Buffer.alloc(0);
    for (;;) {
      const n = readSync(fd, chunk, 0, chunkBytes, null);
      if (n <= 0) break;
      out.bytes += n;
      const data = tail.length ? Buffer.concat([tail, chunk.subarray(0, n)]) : Buffer.from(chunk.subarray(0, n));
      let start = 0;
      for (;;) {
        const nl = data.indexOf(0x0a, start);
        if (nl === -1) break;
        pushLine(data.subarray(start, nl));
        start = nl + 1;
      }
      tail = Buffer.from(data.subarray(start)); // copy — `chunk` is reused next read
    }
    if (tail.length) pushLine(tail);
  } catch (err) {
    return { ...out, status: 'error', reason: `geojsonseq read failed: ${String(err?.message ?? err)}` };
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
  }
  return out;
}

/**
 * Load a join's footprints and classify the outcome. §CONTEXT-DATA-HONESTY keeps THREE values
 * that the old code collapsed into one cheerful `documented`:
 *   • the file is genuinely EMPTY          → 'documented' (there is nothing here; not a defect)
 *   • the file has records we CANNOT PARSE → 'error'      (a PIPELINE defect — say so, loudly)
 *   • the file read OK                     → 'ok'
 * @returns {{status:'ok'|'documented'|'error', feats?:object[], reason?:string, read:object}}
 */
export function loadJoinFootprints(inPath, label) {
  const read = readGeojsonseqFeatures(inPath);
  if (read.status === 'error') return { status: 'error', reason: `${label}: ${read.reason}`, read };
  if (read.lines === 0) return { status: 'documented', reason: `${label}: 0 OSM footprint(s) in the clip; nothing to stamp.`, read };
  if (read.parsed === 0) {
    return {
      status: 'error',
      reason: `${label}: ${read.lines} record(s) present (${(read.bytes / 1e6).toFixed(1)} MB) but NOT ONE parsed as ` +
        `GeoJSON (${read.malformed} malformed, ${read.rsStripped} RS-prefixed). The join cannot read the file bake ` +
        'just wrote — a PIPELINE defect, NOT "no data".',
      read,
    };
  }
  return { status: 'ok', feats: read.feats, read };
}
