// ─────────────────────────────────────────────────────────────────────────────
// §SPARSE-TILE-IS-NOT-A-BROKEN-FILE (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-B) — read an UNCOMPRESSED,
// TILED, single-band Float32 GeoTIFF whose all-nodata tiles are written SPARSE (TileOffset 0,
// TileByteCount 0), which is legal GDAL output and which `geotiff.js` refuses.
//
// ── THE DEFECT THIS EXISTS TO REMOVE (measured, not inferred) ────────────────────────────────────
// The Norwegian NHM join lost WHOLE CELLS to a decode error, and the reason was not size, shape,
// latitude or flakiness — all four were probed and eliminated:
//   • same window, three request shapes × 3 attempts → the SAME failure every time (not flaky);
//   • the same dimensions at Oslo / Tromsø / west Stavanger → decode fine (not a size ceiling);
//   • splitting the cell in four → two quadrants decode, two fail identically (not a cap).
// The difference is IN THE FILE. Probed on the failing quadrant (DOM, 1000 × 1000, 2 m):
//     body 4,064,879 B · 64 tiles of 128 × 128 · full tile = 65,536 B
//     distinct TileByteCounts: **0 and 65536** · **zero-count tiles: 2** · short tiles: 0
// versus the neighbouring quadrant that works: distinct counts `65536`, zero-count tiles 0.
// A tile with offset 0 / count 0 is GDAL's "this tile is entirely NODATA, so it was not written" —
// the sparse-TIFF convention. `geotiff.js` reads it as a real offset and throws
// `Offset is outside the bounds of the DataView`, and the join then counts the CELL as an error and
// leaves every footprint in it at the assumed 9 m.
//
// ⛔ THAT IS WHY THIS MATTERS FAR BEYOND ONE CELL: a tile is all-nodata exactly where the survey has
//    a hole — sea, lake, the far side of a border. In Norway that is most of the COAST, which is where
//    Norway lives. The three-city join hid it (one cell error in an Oslo test, easy to read as noise);
//    a NATIONAL sweep would have turned it into a systematic coastal blind spot with no symptom other
//    than "the buildings look 9 m tall there" — indistinguishable from "no data here"
//    (L-422/457/467/469).
//
// WHAT THIS READER DOES AND DOES NOT DO. It handles exactly the layout the probe found and refuses
// anything else by returning null, so the caller falls back to `geotiff.js` rather than trusting a
// guess: uncompressed (Compression 1), tiled, 1 sample/px, 32-bit IEEE float (SampleFormat 3). A
// sparse tile becomes NaN — the SAME value `isNdhNodata` masking produces — so a hole reads as a hole
// and never as a height. It is NOT a general TIFF reader and must not grow into one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {ArrayBuffer} ab           the raw TIFF bytes
 * @param {object} fileDirectory     the IFD as parsed by geotiff.js (`img.fileDirectory`)
 * @param {number} width             image width in px  (`img.getWidth()`)
 * @param {number} height            image height in px (`img.getHeight()`)
 * @returns {Float32Array|null} row-major samples with sparse tiles as NaN, or null when the layout is
 *          not the one this reader is allowed to claim.
 */
export function readSparseTiledFloat32(ab, fileDirectory, width, height) {
  const fd = fileDirectory ?? {};
  const one = (v) => (Array.isArray(v) || ArrayBuffer.isView(v) ? v[0] : v);
  const compression = one(fd.Compression) ?? 1;
  const bits = one(fd.BitsPerSample);
  const fmt = one(fd.SampleFormat);
  const spp = one(fd.SamplesPerPixel) ?? 1;
  const tw = one(fd.TileWidth);
  const th = one(fd.TileLength);
  const offsets = fd.TileOffsets;
  const counts = fd.TileByteCounts;
  if (compression !== 1 || bits !== 32 || fmt !== 3 || spp !== 1) return null;   // not our layout
  if (!tw || !th || !offsets || !counts || offsets.length !== counts.length) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const tilesAcross = Math.ceil(width / tw);
  const tilesDown = Math.ceil(height / th);
  if (tilesAcross * tilesDown !== offsets.length) return null;                   // planar/multi-band — not ours

  // TIFF byte order from the file's own magic: 'II' little-endian, 'MM' big-endian.
  const head = new DataView(ab, 0, 2);
  const magic = head.getUint16(0, true);
  const littleEndian = magic === 0x4949 ? true : magic === 0x4d4d ? false : null;
  if (littleEndian === null) return null;

  const view = new DataView(ab);
  const out = new Float32Array(width * height);
  const full = tw * th * 4;
  for (let ty = 0; ty < tilesDown; ty++) {
    for (let tx = 0; tx < tilesAcross; tx++) {
      const t = ty * tilesAcross + tx;
      const off = Number(offsets[t]);
      const cnt = Number(counts[t]);
      // ⭐ THE WHOLE POINT: an unwritten (all-nodata) tile is NaN, not an error and not a zero. A zero
      // would be a 0 m surface — a lie the sampler would happily average into a roof.
      const sparse = !(cnt > 0) || !(off > 0) || off + cnt > ab.byteLength || cnt < full;
      const x0 = tx * tw, y0 = ty * th;
      const xEnd = Math.min(x0 + tw, width), yEnd = Math.min(y0 + th, height);
      for (let y = y0; y < yEnd; y++) {
        const rowBase = y * width;
        for (let x = x0; x < xEnd; x++) {
          out[rowBase + x] = sparse ? NaN : view.getFloat32(off + (((y - y0) * tw) + (x - x0)) * 4, littleEndian);
        }
      }
    }
  }
  return out;
}

/** How many of `fileDirectory`'s tiles are sparse (unwritten) — for the join's log line, so a coastal
 *  cell can SAY "12 of 64 tiles are nodata" instead of silently reading as land. */
export function sparseTileCount(fileDirectory) {
  const counts = fileDirectory?.TileByteCounts;
  if (!counts) return 0;
  let n = 0;
  for (const c of counts) if (!(Number(c) > 0)) n++;
  return n;
}
