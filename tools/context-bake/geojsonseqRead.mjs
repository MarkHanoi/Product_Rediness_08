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
//
// ─────────────────────────────────────────────────────────────────────────────
// §JOIN-BOUNDED-WORKING-SET (L-659, 2026-08-01) — THE SECOND CRASH, AND WHY STREAMING THE *READ*
// WAS NOT ENOUGH.
//
// The L-658 fix above made the reader stream its INPUT. It still returned every parsed Feature in
// one `feats` array, and every join then built a SECOND per-footprint `records` array on top. So the
// pipeline still materialised the whole country. Run 30693132326 (sha bb92b276) therefore died
// 23 minutes in, immediately after `export buildings · spain → GeoJSONSeq`, with
//     FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of memory
//     Mark-Compact 4045.6 (4131.0) -> 4039.9 (4141.8) MB   [exit 134]
// and a native stack ending in `Factory::NewFixedDoubleArray` — i.e. V8 allocating polygon
// coordinate arrays inside `JSON.parse`, in `readGeojsonseqFeatures`, on the whole-Spain clip.
//
// MEASURED, not assumed (tools/context-bake/__tests__/geojsonseqRead.spec.ts §heap-budget):
//   a 13-vertex osmium-exported building footprint costs ~400 BYTES ON DISK and
//   **~1.26 kB of V8 HEAP** once parsed — a ~3.2× amplification.
// OSM Spain holds millions of building ways+relations (Catastro import), so `feats` alone wants
// well over 10 GB. THAT IS WHY RAISING THE HEAP ALONE IS NOT A FIX: `--max-old-space-size=14336`
// moves the cliff by ~3.5×, it does not remove it, and the runner only has 16 GB total.
//
// THE STRUCTURAL FIX IS TO BOUND THE WORKING SET, not to enlarge the container. A height join can
// only ever stamp footprints inside the bboxes whose raster it actually fetches; every other
// footprint is carried through the join UNCHANGED. `partitionGeojsonseq` below therefore RETAINS
// only what the caller selects and writes everything else straight to the output file AS RAW BYTES,
// never holding a parsed object for it. Peak heap becomes a function of the STAMP AREA, not of the
// region — a national bake and a city bake cost the same.
//
// §CONTEXT-DATA-HONESTY. A passed-through footprint keeps its ORIGINAL OSM tags byte-for-byte — its
// own `height`/`building:levels`, else the client's assumed 9 m default. It is never dressed as
// measured, and it is never dropped. The three values stay three values.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, openSync, readSync, writeSync, closeSync } from 'node:fs';
import { getHeapStatistics } from 'node:v8';

/** RFC 8142 record separator. `osmium export -f geojsonseq` writes it before each record. */
export const GEOJSONSEQ_RS = 0x1e;

/**
 * §HEAP-WATCHDOG (L-659) — abort a read BEFORE V8 does, so the failure is diagnosable.
 *
 * A V8 `FATAL ERROR: Ineffective mark-compacts` kills the process with exit 134 and a native stack
 * that names no region, no file and no count — 23 minutes of bake, and the log cannot tell you WHICH
 * join was too big. Crossing this fraction of the heap limit instead returns a structured `error`
 * naming the file, the line count and the measured bytes/feature, which the bake's measured-height
 * gate then reports and fails on. Loud and early beats a core dump.
 */
export const HEAP_WATCHDOG_FRACTION = 0.85;
/** Measured heap cost of one parsed 13-vertex osmium footprint (see §JOIN-BOUNDED-WORKING-SET). */
export const HEAP_BYTES_PER_FOOTPRINT = 1256;

/**
 * Scan a GeoJSONSeq in bounded chunks, handing each record's RAW BYTES to `onRecord`.
 * Shared by every reader below so the RS-stripping + chunk-boundary logic exists ONCE.
 * `onRecord(buf, a, b)` receives the backing buffer and the [a,b) slice of ONE trimmed record.
 * Returns the same counters every caller reports. Never throws.
 * @param {(buf: Buffer, a: number, b: number, sawRs: boolean) => void} onRecord
 */
function scanGeojsonseqRecords(inPath, onRecord, { chunkBytes = 8 << 20, onProgress = null } = {}) {
  const out = { status: 'ok', lines: 0, rsStripped: 0, bytes: 0 };
  let fd;
  try {
    fd = openSync(inPath, 'r');
    const chunk = Buffer.allocUnsafe(chunkBytes);
    let tail = Buffer.alloc(0);
    const emit = (buf, from, to) => {
      let a = from, b = to;
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
      onRecord(buf, a, b, sawRs);
    };
    for (;;) {
      const n = readSync(fd, chunk, 0, chunkBytes, null);
      if (n <= 0) break;
      out.bytes += n;
      const data = tail.length ? Buffer.concat([tail, chunk.subarray(0, n)]) : Buffer.from(chunk.subarray(0, n));
      let start = 0;
      for (;;) {
        const nl = data.indexOf(0x0a, start);
        if (nl === -1) break;
        emit(data, start, nl);
        start = nl + 1;
      }
      tail = Buffer.from(data.subarray(start)); // copy — `chunk` is reused next read
      if (onProgress) {
        const stop = onProgress(out);
        if (stop) return { ...out, status: 'error', reason: stop };
      }
    }
    if (tail.length) emit(tail, 0, tail.length);
  } catch (err) {
    return { ...out, status: 'error', reason: `geojsonseq read failed: ${String(err?.message ?? err)}` };
  } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
  }
  return out;
}

/** Buffered synchronous appender — keeps the pass-through path allocation-flat. */
function makeSink(fd, flushBytes = 4 << 20) {
  let parts = [];
  let held = 0;
  const flush = () => {
    if (!held) return;
    writeSync(fd, Buffer.concat(parts, held));
    parts = []; held = 0;
  };
  return {
    /** Append one raw record slice plus a newline (RS deliberately NOT re-emitted). */
    writeSlice(buf, a, b) {
      parts.push(Buffer.from(buf.subarray(a, b)), NEWLINE);
      held += (b - a) + 1;
      if (held >= flushBytes) flush();
    },
    writeString(s) {
      const b = Buffer.from(s, 'utf8');
      parts.push(b); held += b.length;
      if (held >= flushBytes) flush();
    },
    flush,
  };
}
const NEWLINE = Buffer.from('\n');

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
  const scan = scanGeojsonseqRecords(inPath, (buf, a, b) => {
    try { out.feats.push(JSON.parse(buf.toString('utf8', a, b))); out.parsed++; }
    catch { out.malformed++; }
  }, { chunkBytes });
  return { ...out, ...scan, feats: out.feats, parsed: out.parsed, malformed: out.malformed };
}

/**
 * §JOIN-BOUNDED-WORKING-SET (L-659) — stream a GeoJSONSeq, RETAINING only what `select` picks and
 * writing every other record straight to `passThroughPath` as RAW BYTES.
 *
 * This is the memory-safe replacement for `readGeojsonseqFeatures` in any join over a region whose
 * footprint count is not bounded by a city bbox. `readGeojsonseqFeatures` holds EVERY feature; this
 * holds only the ones the caller will actually touch, so peak heap tracks the STAMP AREA rather than
 * the region. See the module header for the measured 1.26 kB/footprint that makes this mandatory
 * for a whole-country clip.
 *
 * The output file is TRUNCATED and receives the passed-through records immediately, in input order.
 * The caller is expected to append its retained (mutated) records afterwards — record ORDER in a
 * GeoJSONSeq carries no meaning and tippecanoe does not depend on it.
 *
 * §CONTEXT-DATA-HONESTY — a MALFORMED record is neither retained nor passed through: it is counted
 * in `malformed` and dropped, exactly as `readGeojsonseqFeatures` has always dropped it. Emitting
 * an unparseable line would poison tippecanoe; silently counting it as data would be a lie.
 *
 * @param inPath           absolute path to the .geojsonseq bake just wrote
 * @param passThroughPath  absolute path to write the non-retained records to (truncated)
 * @param select           (feat) => retainedValue | null | undefined | false. A truthy return is
 *                         pushed to `retained` AND withheld from the pass-through file, so the
 *                         caller owns emitting it. Returning the derived record (not the feature)
 *                         avoids a second parse/derive pass.
 * @returns {{status:'ok'|'error', retained:any[], lines:number, parsed:number, retainedCount:number,
 *            passedThrough:number, malformed:number, rsStripped:number, bytes:number,
 *            peakHeapUsedMB:number, heapLimitMB:number, reason?:string}}
 */
export function partitionGeojsonseq(inPath, passThroughPath, select, { chunkBytes = 8 << 20, watchdogFraction = HEAP_WATCHDOG_FRACTION } = {}) {
  const out = {
    status: 'ok', retained: [], lines: 0, parsed: 0, retainedCount: 0, passedThrough: 0,
    malformed: 0, rsStripped: 0, bytes: 0, peakHeapUsedMB: 0, heapLimitMB: 0,
  };
  const heapLimit = getHeapStatistics().heap_size_limit;
  out.heapLimitMB = Math.round(heapLimit / 1e6);
  if (!inPath || !existsSync(inPath)) {
    return { ...out, status: 'error', reason: `geojsonseq partition: file not found (${inPath})` };
  }
  if (!passThroughPath) {
    return { ...out, status: 'error', reason: 'geojsonseq partition: no pass-through path supplied' };
  }
  let fd;
  try { fd = openSync(passThroughPath, 'w'); }
  catch (err) {
    return { ...out, status: 'error', reason: `geojsonseq partition: cannot open output (${String(err?.message ?? err)})` };
  }
  const sink = makeSink(fd);
  try {
    const scan = scanGeojsonseqRecords(inPath, (buf, a, b) => {
      let feat;
      try { feat = JSON.parse(buf.toString('utf8', a, b)); }
      catch { out.malformed++; return; }
      out.parsed++;
      let keep = null;
      try { keep = select(feat); } catch { keep = null; }
      if (keep) { out.retained.push(keep); out.retainedCount++; return; }
      sink.writeSlice(buf, a, b);
      out.passedThrough++;
    }, {
      chunkBytes,
      // §HEAP-WATCHDOG — checked once per 8 MB chunk (cheap), not per record.
      onProgress: () => {
        const used = process.memoryUsage().heapUsed;
        if (used > out.peakHeapUsedMB * 1e6) out.peakHeapUsedMB = Math.round(used / 1e6);
        if (used > heapLimit * watchdogFraction) {
          return `geojsonseq partition: HEAP WATCHDOG tripped at ${Math.round(used / 1e6)} MB of a `
            + `${Math.round(heapLimit / 1e6)} MB limit after ${out.lines} record(s) `
            + `(${out.retainedCount} retained). The retained working set is UNBOUNDED for this region — `
            + 'declare narrower stamp bboxes, or raise NODE_OPTIONS=--max-old-space-size. '
            + `Budget ~${HEAP_BYTES_PER_FOOTPRINT} B of heap per retained footprint.`;
        }
        return null;
      },
    });
    sink.flush();
    const used = process.memoryUsage().heapUsed;
    if (used > out.peakHeapUsedMB * 1e6) out.peakHeapUsedMB = Math.round(used / 1e6);
    return { ...out, ...scan, retained: out.retained };
  } finally {
    try { closeSync(fd); } catch { /* already closed */ }
  }
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

/**
 * §JOIN-BOUNDED-WORKING-SET (L-659) — `loadJoinFootprints`'s memory-safe twin, for a join whose
 * region is NOT bounded by a city bbox (whole-Spain, whole-Denmark).
 *
 * Same THREE honest outcomes as `loadJoinFootprints`, plus the one this crash added:
 *   • the file is genuinely EMPTY          → 'documented'
 *   • the file has records we CANNOT PARSE → 'error'  (a PIPELINE defect)
 *   • the heap watchdog tripped            → 'error'  (a BUDGET defect — the region's stamp area is
 *                                                      unbounded; this used to be a bare V8 abort)
 *   • the file read OK                     → 'ok'
 *
 * ⚠ A ZERO retained count is NOT an error. It means the clip holds footprints but none inside the
 * declared stamp bboxes — a real, sayable answer ("nothing here to measure"), not a failure. The
 * caller reports `retainedCount` so the bake's measured-height gate can tell it from a crash.
 *
 * @returns {{status:'ok'|'documented'|'error', retained?:any[], reason?:string, read:object}}
 */
export function loadJoinFootprintsBounded(inPath, passThroughPath, select, label, opts = {}) {
  const read = partitionGeojsonseq(inPath, passThroughPath, select, opts);
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
  return { status: 'ok', retained: read.retained, read };
}
