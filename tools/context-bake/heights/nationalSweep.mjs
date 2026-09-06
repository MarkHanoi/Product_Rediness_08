// ─────────────────────────────────────────────────────────────────────────────
// §NATIONAL-SWEEP (2026-09-06, lane HEIGHTS-WHOLE-COUNTRY-A) — the SHARED, dependency-free kernel a
// measured-height join needs to reach a WHOLE COUNTRY instead of a city list: the tile grid, the
// bounded-heap swathe plan, the deterministic sweep order, the resume cursor, the km² accounting and
// the sentence a truncated run prints.
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────────
// Two lanes have already written this, independently, in the same week:
//   • heights/mdsNational.mjs   (§MDS-NATIONAL-TILING, Spain, L-12946)
//   • heights/usOpenHeights.mjs (§USAS-SWATHE / usasTileGrid / usasNationalSwathes, the USA)
// They are the same eight functions with different prefixes. A THIRD hand-rolled copy per country —
// and this lane's half alone is twelve countries — is the repo's most expensive recurring failure
// ("grep for the existing implementation first"). So the kernel is extracted ONCE here and the new
// national joins parameterise it.
//
// ⚠ WHAT THIS LANE DELIBERATELY DID **NOT** DO, so the next reader does not mistake it for finished:
// mdsNational.mjs and usOpenHeights.mjs are NOT refactored onto this kernel. Spain and the USA are
// LIVE national sweeps whose constants are pinned byte-for-byte by mdsNational.spec.ts and
// usOpenHeights.spec.ts; rewiring them is a behaviour-preserving refactor of two shipping joins and
// belongs to its own change, not to a lane whose job is to take more countries national. The
// duplication is therefore NAMED here rather than silently tripled. It is owed, not hidden.
//
// ── WHAT "WHOLE-COUNTRY" MEANS, AND WHAT IT DOES NOT ────────────────────────────────────────────
// It means the join's RETAIN SET is the country — every footprint the bake clipped is reachable by
// the sweep, and a town's absence from a hand-written city list can no longer make it permanently
// unmeasurable. It does NOT mean one bake run measures the whole country: these are raster/vector
// sweeps costing hours (measured, per country, in each adapter's header), so a run takes a declared
// slice, prints an EXACT resume cursor, and says how much populated ground it skipped.
//
// ⚠ AND IT DOES NOT MEAN SUCCESSIVE RUNS ACCUMULATE. Each bake regenerates
// `<region>-buildings-stamped.geojsonseq` from the OSM clip, so a second dispatch with a cursor
// stamps a DIFFERENT slice into a DIFFERENT tileset. That limitation is Spain's
// (§MDS-NATIONAL-SWEEP "HONESTY LIMIT") and it is inherited unchanged here. Accumulating slices
// needs a per-region incremental merge that does not exist. Named, not built.
//
// ⛔ NEVER FABRICATE. A cell the sweep did not open, a source that refused, a footprint the source
//    could not serve — all three end in the SAME honest state: the footprint keeps its ORIGINAL OSM
//    tags and the client draws the labelled `assumed` default. That is indistinguishable on the map
//    from "the source has no data here" (L-422/457/467/469), which is exactly why the skipped km²
//    and the cursor are PRINTED rather than implied.
// ─────────────────────────────────────────────────────────────────────────────

/** Metres per degree of latitude — the spheroid-free approximation this toolchain uses for km²
 *  reporting. This is a LOG number, not a measurement. */
const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/**
 * The tile grid for a region bbox. `nx`/`ny` are counts; `ordOf` gives the deterministic sweep order
 * key (row-major, SOUTH→NORTH then WEST→EAST) that the resume cursor is expressed in.
 *
 * ⚠ The grid is derived from the REGION bbox, never from a band — so a cell's `ord` is identical in
 * every bounded-heap pass and a cursor written by one band is readable by the next.
 *
 * @param {[number,number,number,number]} bbox [w,s,e,n] WGS84
 */
export function nationalTileGrid(bbox, { lonDeg, latDeg } = {}) {
  const [w, s, e, n] = bbox;
  const lon = Number(lonDeg) > 0 ? Number(lonDeg) : 0.01;
  const lat = Number(latDeg) > 0 ? Number(latDeg) : lon;
  const nx = Math.max(1, Math.ceil((e - w) / lon));
  const ny = Math.max(1, Math.ceil((n - s) / lat));
  return {
    w, s, e, n, nx, ny, lonDeg: lon, latDeg: lat,
    cellIx: (l) => Math.min(nx - 1, Math.max(0, Math.floor((l - w) / lon))),
    cellIy: (l) => Math.min(ny - 1, Math.max(0, Math.floor((l - s) / lat))),
    ordOf: (ix, iy) => iy * nx + ix,
    ixOf: (ord) => ord % nx,
    iyOf: (ord) => Math.floor(ord / nx),
  };
}

/** The [w,s,e,n] of one grid cell, clipped to the region bbox (the last row/column is short). */
export function nationalCellBbox(grid, ix, iy) {
  const tw = grid.w + ix * grid.lonDeg;
  const ts = grid.s + iy * grid.latDeg;
  return [tw, ts, Math.min(tw + grid.lonDeg, grid.e), Math.min(ts + grid.latDeg, grid.n)];
}

/** Ground area of one grid cell in km² — for the "how much did we stamp vs skip" log line. */
export function nationalCellKm2(grid, ix, iy) {
  const [tw, ts, te, tn] = nationalCellBbox(grid, ix, iy);
  const midLat = (ts + tn) / 2;
  return ((te - tw) * mPerDegLon(midLat) * (tn - ts) * M_PER_DEG_LAT) / 1e6;
}

/**
 * Ground area of one cell, PREFERRING the grid's own answer when it has one.
 *
 * ⭐ A grid built by `nativeTileGrid` measures in PROJECTED METRES, not degrees, so
 * `nationalCellKm2`'s cos(lat) formula would read its eastings as longitudes and report a cell
 * ~10^10 times too large. That is not a cosmetic error: km² stamped vs skipped IS the
 * §LOUD-AND-ORDERED-TRUNCATION sentence — the number a reader uses to decide how much of a country
 * is still shipping the labelled `assumed` default. A wrong one is worse than none.
 *
 * The hook is a `?? fallback`, never a mode flag, so every degree grid that existed before this
 * function takes the identical path it took before (nativeTileSweep.spec.ts pins that equality).
 */
export function cellKm2Of(grid, ix, iy) {
  return typeof grid?.cellKm2 === 'function' ? grid.cellKm2(ix, iy) : nationalCellKm2(grid, ix, iy);
}

/**
 * §NATIVE-TILE-GRID (2026-09-06, lane HEIGHTS-LAST-NINE) — the sweep grid for a join whose PUBLISHER
 * tiles in projected metres rather than in degrees.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT "the degree grid with different numbers". Two of the nine joins
 * this lane inherited (CH swisstopo, DK DHM) fetch on their own national metric grid: swisstopo
 * publishes swissSURFACE3D / swissALTI3D as 1 km × 1 km LV95 tiles and the join MATCHES an asset href
 * on the tile token (`_2683-1248_`), never constructs one. `nationalHeightsAssessed.mjs` recorded CH
 * as `not-done-shape` for exactly this reason: *"the blocker is shape, not data — this join sweeps by
 * swisstopo's OWN 1 km LV95 tile key rather than by a degree grid, so the shared kernel's cell `ord`
 * (and therefore its resume cursor) does not apply unmodified."* This IS that ordinal.
 *
 * ⛔ THE ALTERNATIVE WAS TRIED ON PAPER AND REJECTED, so nobody re-derives it: laying a DEGREE grid
 *    over a 1 km-tiled publisher makes every cell straddle 2–4 publisher tiles, so a tile shared by
 *    two cells is fetched twice (≈ 4/L overhead for an L-km cell — 57 % at L = 7 km) and, worse, the
 *    cursor's ord space stops agreeing with the band order.
 *
 * ⭐ AND THE BANDS MUST BE IN THE SAME SPACE AS THE ORD. `nationalSwathes` bands by ROW INDEX and
 *    `intersectAreas` is a pure numeric box intersection — neither reads a unit — so a caller that
 *    hands the runner a native grid AND a native retain set gets bands whose `ordFrom`/`ordTo` are
 *    strictly increasing in the same ord space the cursor is written in. That monotonicity is the
 *    whole reason the resume cursor is safe across bands; a WGS84 band over a native ord space is
 *    NOT monotone (LV95 northing at a fixed parallel varies by kilometres across CH's longitude
 *    span) and would let the cursor silently step over real cells.
 *
 * @param bboxNative [minX, minY, maxX, maxY] in the publisher's CRS, metres
 * @param tileM      the publisher's own tile edge in metres (CH 1000; DK the join's own span)
 */
export function nativeTileGrid([minX, minY, maxX, maxY], tileM, { originX = null, originY = null } = {}) {
  const t = Number(tileM) > 0 ? Number(tileM) : 1000;
  const w = originX === null ? Math.floor(minX / t) * t : originX;
  const s = originY === null ? Math.floor(minY / t) * t : originY;
  const nx = Math.max(1, Math.ceil((maxX - w) / t));
  const ny = Math.max(1, Math.ceil((maxY - s) / t));
  const km2 = (t * t) / 1e6;
  return {
    native: true, tileM: t,
    w, s, e: w + nx * t, n: s + ny * t, nx, ny, lonDeg: t, latDeg: t,
    cellIx: (X) => Math.min(nx - 1, Math.max(0, Math.floor((X - w) / t))),
    cellIy: (Y) => Math.min(ny - 1, Math.max(0, Math.floor((Y - s) / t))),
    ordOf: (ix, iy) => iy * nx + ix,
    ixOf: (ord) => ord % nx,
    iyOf: (ord) => Math.floor(ord / nx),
    /** Exact, not approximated: a projected grid's cells are all the same size by construction. */
    cellKm2: () => km2,
    /** The publisher's own key for a cell, in whole tiles — what a swisstopo href carries. */
    keyOf: (ix, iy) => ({ x: Math.round(w / t) + ix, y: Math.round(s / t) + iy }),
  };
}

/**
 * §SWATHE — the bounded-heap passes: contiguous bands of whole tile ROWS, SOUTH→NORTH.
 *
 * WHY THIS EXISTS. "Make the retain set the whole country" and "hold the retained footprints in the
 * V8 heap" are incompatible, and pretending otherwise is how run 30693132326 died (`Ineffective
 * mark-compacts near heap limit`, 4.04 GB, 23 minutes in). The MEASURED cost is ~1,256 B of heap per
 * parsed OSM footprint (geojsonseqRead.spec.ts §heap-budget); a country is millions of footprints.
 *
 * So the country is retained a BAND AT A TIME. Each pass streams its input, holds only the
 * footprints whose centroid is in the band, stamps them, appends them to the output, and writes
 * every other record straight through as raw bytes to the NEXT pass's input — which is therefore
 * strictly smaller than the last. Peak heap tracks ONE band, never the nation, and no footprint is
 * dropped, duplicated or fabricated: bands partition latitude, so a footprint is retained by exactly
 * one band, and anything left over after the final band is concatenated unchanged.
 *
 * Bands are whole tile ROWS, never round degrees, so no raster cell straddles two bands and gets
 * fetched twice.
 *
 * @returns {{index:number, iy0:number, iy1:number, bbox:[number,number,number,number], ordFrom:number, ordTo:number}[]}
 */
export function nationalSwathes(grid, { swatheRows = 6 } = {}) {
  const rows = Math.max(1, Math.floor(swatheRows));
  const out = [];
  for (let iy0 = 0, index = 0; iy0 < grid.ny; iy0 += rows, index++) {
    const iy1 = Math.min(iy0 + rows, grid.ny);
    out.push({
      index,
      iy0,
      iy1,
      bbox: [grid.w, grid.s + iy0 * grid.latDeg, grid.e, Math.min(grid.s + iy1 * grid.latDeg, grid.n)],
      ordFrom: iy0 * grid.nx,
      ordTo: iy1 * grid.nx, // exclusive
    });
  }
  return out;
}

/**
 * Order the populated cells for the sweep, dropping anything the resume cursor has already covered.
 * Deterministic on the NUMERIC `ord`, never lexicographic on "ix,iy" — that sorted "10,3" before
 * "2,3" and made a capped run un-resumable (mdsNational's scar, kept).
 *
 * @param keys        iterable of "ix,iy" bucket keys
 * @param startCursor ord to resume AT (inclusive), or null/0 for the beginning
 */
export function nationalSweepOrder(keys, grid, startCursor = null) {
  const cells = [];
  for (const k of keys) {
    const [ix, iy] = String(k).split(',').map(Number);
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
    cells.push({ key: String(k), ix, iy, ord: grid.ordOf(ix, iy) });
  }
  cells.sort((a, b) => a.ord - b.ord);
  if (!startCursor) return cells;
  return cells.filter((c) => c.ord >= startCursor);
}

/** Split an ordered cell list into fixed-size batches. A batch is issued concurrently but batches run
 *  in order, so "the first cell of the first incomplete batch" is an EXACT resume cursor. */
export function nationalSweepBatches(cells, concurrency = 1) {
  const size = Math.max(1, Math.floor(concurrency));
  const out = [];
  for (let i = 0; i < cells.length; i += size) out.push(cells.slice(i, i + size));
  return out;
}

/**
 * The declared working set clipped to one swathe band.
 *
 * ⛔ A band NARROWS the retain set for HEAP reasons; it may never WIDEN it. So this is an
 * INTERSECTION and an empty result means "this band holds none of the declared working set" — skip
 * the band, never fall back to the whole band. (usasNationalStamp's `intersectAreas`, kept.)
 */
export function intersectAreas(areas, [bw, bs, be, bn]) {
  const out = [];
  for (const [w, s, e, n] of areas ?? []) {
    const x0 = Math.max(w, bw), y0 = Math.max(s, bs), x1 = Math.min(e, be), y1 = Math.min(n, bn);
    if (x1 > x0 && y1 > y0) out.push([x0, y0, x1, y1]);
  }
  return out;
}

/** A resume cursor from an option or an environment variable. Anything that is not a finite positive
 *  ord ⇒ start at the beginning — NEVER throw, and never silently start halfway. */
export function resolveSweepCursor(opt, envValue = null) {
  const raw = opt ?? envValue ?? null;
  const v = raw === null || raw === '' ? 0 : Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Tile rows per bounded-heap pass, from an option or an environment variable. `0` (or negative) is
 *  a deliberate, meaningful value: SINGLE PASS, which is what a city-sized caller and every unit
 *  test wants. The env knob exists so a band that trips the HEAP WATCHDOG can be halved on the next
 *  dispatch WITHOUT a code change — never by raising the heap. */
export function resolveSwatheRows(opt, envValue = null, dflt = 0) {
  const raw = opt ?? envValue ?? null;
  const v = raw === null || raw === '' ? dflt : Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/**
 * The SHARED, MUTABLE budget a swathed sweep threads through every band, so the tile cap, the wall
 * clock and the resume cursor are GLOBAL across bands rather than per band (a per-band cap would
 * multiply the real cost by the number of bands and nothing would say so).
 */
export function makeSweepBudget({ maxTiles = 4000, budgetMs = 0, startCursor = 0 } = {}) {
  const ms = Number(budgetMs) > 0 ? Number(budgetMs) : 0;
  // ⛔ ZERO IS A REAL VALUE, NOT "unset". `maxTiles: 0` means "open no cell at all" and is how the
  // conservation harness proves the maximally-truncated national run without issuing one request.
  // Collapsing it into the default was a bug this file had for exactly one test run.
  const cap = Number(maxTiles);
  return {
    maxTiles: Number.isFinite(cap) && cap >= 0 ? cap : 4000,
    budgetMs: ms,
    startedAt: Date.now(),
    deadlineAt: ms > 0 ? Date.now() + ms : Infinity,
    startCursor: resolveSweepCursor(startCursor),
    nextCursor: resolveSweepCursor(startCursor),
    tilesUsed: 0,
    stopReason: null,
    cellsStamped: 0,
    cellsSkipped: 0,
    km2Stamped: 0,
    km2Skipped: 0,
    swathesTotal: 1,
    swathesScanned: 0,
    /** Every measured height of the WHOLE sweep, so the aggregate stats are the country's, not the
     *  last band's. A stamp with no budget keeps its own local array — same code path. */
    heights: [],
  };
}

/**
 * Drive one pass's populated cells: ordered, cursor-aware, cap-aware, km²-accounted.
 *
 * `onCell(cell, records)` does whatever the country's source needs and returns TRUE when the cell
 * was actually read (so a source failure is counted as an opened-but-failed cell, never as stamped
 * ground). It must not throw for a source failure; a throw is treated as §ABORT-IS-NOT-A-CAP by the
 * caller's own try/catch, exactly as before.
 *
 * ⭐ THE CAP IS CHECKED BEFORE A CELL, so `nextCursor` is the ord of the first cell that did NOT run
 * — an EXACT resume point, not an approximation.
 */
export async function sweepPopulatedCells({ buckets, grid, budget, done = new Set(), onCell }) {
  const cells = nationalSweepOrder([...buckets.keys()].filter((k) => !done.has(k)), grid, budget.nextCursor);
  let i = 0;
  for (; i < cells.length; i++) {
    const c = cells[i];
    if (budget.tilesUsed >= budget.maxTiles) { budget.stopReason ??= `maxTiles ${budget.maxTiles}`; break; }
    if (Date.now() > budget.deadlineAt) { budget.stopReason ??= `time budget ${Math.round(budget.budgetMs / 1000)} s`; break; }
    done.add(c.key);
    budget.tilesUsed++;
    const read = await onCell(c, buckets.get(c.key) ?? []);
    if (read) { budget.cellsStamped++; budget.km2Stamped += cellKm2Of(grid, c.ix, c.iy); }
    budget.nextCursor = c.ord + 1;
  }
  // What did this pass NOT open? Everything from the first cell that did not run onward. Cells the
  // CURSOR skipped are NOT counted — a previous run covered them, by construction.
  if (budget.stopReason && i < cells.length) {
    budget.nextCursor = cells[i].ord;
    for (let j = i; j < cells.length; j++) {
      budget.cellsSkipped++;
      budget.km2Skipped += cellKm2Of(grid, cells[j].ix, cells[j].iy);
    }
  }
  return { visited: i, total: cells.length };
}

/**
 * §LOUD-AND-ORDERED-TRUNCATION — the sentence a truncated national run prints.
 *
 * A cap being respected is a BUDGET; a sweep that stopped early and said nothing is a LIE about
 * coverage (§ABORT-IS-NOT-A-CAP, and the failure-vs-empty family one level up). So the note always
 * carries: why it stopped, the km² actually stamped, the km² of POPULATED ground it scanned and
 * skipped, how many bands it never opened at all, and the cursor to resume from.
 */
export function formatNationalSweepSummary(st, { label = 'national sweep', cursorEnv = null } = {}) {
  const km2 = (v) => `${Math.round(v ?? 0).toLocaleString('en-US')} km²`;
  const total = st.swathesTotal ?? 1;
  const scanned = st.swathesScanned ?? 0;
  if (!st.stopReason || st.stopReason === 'complete') {
    return `${label} COMPLETE — ${st.cellsStamped ?? 0} populated cell(s) / ${km2(st.km2Stamped)} stamped ` +
      `across ${scanned}/${total} swathe(s).`;
  }
  const resume = cursorEnv ? `${cursorEnv}=${st.nextCursor}` : `cursor ${st.nextCursor}`;
  const where = Number.isFinite(st.nextCursorLat) && Number.isFinite(st.nextCursorLon)
    ? ` (cell ord; SW corner lat ${st.nextCursorLat.toFixed(3)} lon ${st.nextCursorLon.toFixed(3)})` : '';
  return `⚠ ${label} TRUNCATED (${st.stopReason}) — ${st.cellsStamped ?? 0} populated cell(s) / ` +
    `${km2(st.km2Stamped)} stamped; ${st.cellsSkipped ?? 0} populated cell(s) / ${km2(st.km2Skipped)} SKIPPED in the ` +
    `${scanned} swathe(s) scanned; ${Math.max(0, total - scanned)} swathe(s) never opened ` +
    `(their footprints stream through with their ORIGINAL OSM tags — honest assumed, never fabricated). ` +
    `RESUME with ${resume}${where}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// §NATIONAL-RETAIN-SETS — the whole-country retain sets this lane wired.
//
// ⛔ EACH ONE IS BYTE-IDENTICAL TO ITS `bake.mjs` REGION ROW `bbox`, and nationalSweep.spec.ts pins
//    that equality by reading both files. It must not be re-typed or "tidied": a retain set SMALLER
//    than the baked region is precisely the silent, permanent hole
//    §MDS-BBOX-MUST-COVER-THE-REGION exists to forbid — the footprints outside it can never be
//    measured by any number of re-bakes, and they ship the labelled `assumed` default, which on the
//    map is indistinguishable from "the source has no data here".
//
// The per-country city lists are NOT deleted. They keep their second job: a PRIORITY ORDER, stamped
// first and uncapped, so a truncated run still helps the most users (§MDS-LIST-IS-PRIORITY-ONLY).
// ─────────────────────────────────────────────────────────────────────────────

/** bake.mjs `netherlands` row — `bbox: '3.30,50.75,7.30,53.70'`. */
export const NL_3DBAG_NATIONAL_BBOX = [3.30, 50.75, 7.30, 53.70];
export const NL_3DBAG_NATIONAL_BBOXES = [NL_3DBAG_NATIONAL_BBOX];

/** bake.mjs `czechia` row — `bbox: '12.05,48.50,18.90,51.10'`. */
export const CZ_CUZK_NATIONAL_BBOX = [12.05, 48.50, 18.90, 51.10];
export const CZ_CUZK_NATIONAL_BBOXES = [CZ_CUZK_NATIONAL_BBOX];

/** bake.mjs `austria` row — `bbox: '9.50,46.30,17.20,49.05'`. */
export const AT_BEV_NATIONAL_BBOX = [9.50, 46.30, 17.20, 49.05];
export const AT_BEV_NATIONAL_BBOXES = [AT_BEV_NATIONAL_BBOX];

/** bake.mjs `france` row — `bbox: '-5.15,41.30,9.60,51.10'`. */
export const MNH_FR_NATIONAL_BBOX = [-5.15, 41.30, 9.60, 51.10];
export const MNH_FR_NATIONAL_BBOXES = [MNH_FR_NATIONAL_BBOX];

// ─────────────────────────────────────────────────────────────────────────────
// §NATIVE-RETAIN-SETS (2026-09-06, lane HEIGHTS-LAST-NINE) — the two countries whose publisher tiles
// in PROJECTED METRES. Each carries TWO constants and they are not interchangeable:
//
//   • `*_NATIONAL_BBOX(ES)`  — WGS84, BYTE-IDENTICAL to the bake.mjs region row, exactly like the four
//     rows above. This is what `stampBboxesFor` returns and what the coverage ledger reads; it is the
//     DECLARATION that the retain set is the country.
//   • `*_NATIVE_BOX`         — the same ground in the publisher's own CRS, used as the runner's retain
//     set so that the swathe bands, the cell ords and the resume cursor all live in ONE space
//     (§NATIVE-TILE-GRID explains why mixing them silently steps the cursor over real cells).
//
// ⛔ THE NATIVE BOX IS AN OUTER ENVELOPE OF THE WGS84 BOX, NOT A RE-TYPED APPROXIMATION OF THE COUNTRY.
//    It is the bounding box of the region bbox's PERIMETER sampled at 21/41 points and rounded
//    OUTWARD, so it CONTAINS the region — the §MDS-BBOX-MUST-COVER-THE-REGION invariant, in the other
//    CRS. A native box smaller than the region is the same permanent, silent hole in a different unit.
// ─────────────────────────────────────────────────────────────────────────────

/** bake.mjs `switzerland` row — `bbox: '5.90,45.80,10.50,47.85'`. */
export const SWISS_NATIONAL_BBOX = [5.90, 45.80, 10.50, 47.85];
export const SWISS_NATIONAL_BBOXES = [SWISS_NATIONAL_BBOX];
/**
 * SWISS_NATIONAL_BBOX in LV95 (EPSG:2056), metres — COMPUTED 2026-09-06 with the repo's own
 * `reproject.mjs` projector (proj4, `+proj=somerc … +towgs84=674.374,15.056,405.346`), by sampling
 * each edge of the WGS84 box at 21 points and taking the outward-rounded envelope:
 *   minX 2480365 · minY 1072037 · maxX 2837984 · maxY 1304416
 * Control point, same run: Zürich HB (8.5402 E, 47.3782 N) → 2683189, 1248069 — i.e. swisstopo tile
 * key 2683-1248, one row north of the 2683-1247 the module header names for the station forecourt.
 * On swisstopo's 1 km grid that is 358 × 233 = 83,414 cells; only POPULATED ones are ever opened, and
 * Switzerland's land area is 41,285 km², so the sweep's real ceiling is well under half the grid.
 */
export const SWISS_LV95_NATIVE_BOX = [2480000, 1072000, 2838000, 1305000];
export const SWISS_LV95_NATIVE_BOXES = [SWISS_LV95_NATIVE_BOX];

/** bake.mjs `denmark` row — `bbox: '7.70,54.40,15.30,57.90'`. */
export const DHM_NATIONAL_BBOX = [7.70, 54.40, 15.30, 57.90];
export const DHM_NATIONAL_BBOXES = [DHM_NATIONAL_BBOX];
/**
 * DHM_NATIONAL_BBOX in ETRS89 / UTM 32N (EPSG:25832), metres — the DHM WCS's own CRS. COMPUTED
 * 2026-09-06 with heightSources.mjs's OWN closed-form `wgs84ToUtm32` (no proj4 — the DK join has
 * never needed it), sampling each edge at 41 points:
 *   minX 415606 · minY 6028027 · maxX 908727 · maxY 6434981
 * Control point, same run: Copenhagen City Hall (55.6759 N, 12.5655 E) → 724177, 6175773.
 * ⭐ The service's OWN declared reach is what makes a national retain set legitimate at all:
 * `api.dataforsyningen.dk/dhm_wcs_DAF?REQUEST=GetCapabilities` (HTTP 200 text/xml, 2,170 B, 0.28 s,
 * KEYLESS, `<fees>NONE</fees>`) declares BOTH `dhm_terraen` and `dhm_overflade` over lonLatEnvelope
 * 8.00830949937517 54.4354651516217 → 15.5979112056959 57.7690657013977 — the whole of Denmark,
 * Bornholm included. Probed 2026-09-06; see heights/dhmNationalStamp.mjs §DHM-NATIONAL-SWEEP.
 */
export const DHM_UTM32_NATIVE_BOX = [414000, 6028000, 910000, 6436000];
export const DHM_UTM32_NATIVE_BOXES = [DHM_UTM32_NATIVE_BOX];
