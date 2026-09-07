// ─────────────────────────────────────────────────────────────────────────────
// §US-OPEN-HEIGHTS-OSM-JOIN (2026-09-05, lane HEIGHTS-US) — stamp OPEN per-metro building heights (NYC
// height_roof · SF LiDAR hgt_maxcm · Boston BPDA BLDG_HGT_2010) onto bake's OWN OSM footprints: the
// NETWORK + STREAM half of the US stamp. The decisions (adapter table, page URL + axis order, the
// unit rule, the building filter, the part→height rule) are in heights/usOpenHeights.mjs and are
// unit-tested there against verbatim fixtures; this file only sweeps cells, fetches pages, and writes.
//
// WHY ITS OWN MODULE and not a hunk in heightSources.mjs: that file is edited by several lanes at
// once (§SHARED-FILE-COLLISION), so this stamp lives beside its pure half and bake.mjs imports it
// directly. It borrows the join helpers heightSources.mjs already has (`loadJoinFootprintsBounded`,
// `footprintFromFeature`, `stampAreasFor`, `inAnyArea`, `bucketRecords`, `httpGetSafe`, `statsOf`)
// rather than re-implementing them, so the retained-working-set / heap-watchdog / failure-vs-empty
// behaviour is the SAME code every other join runs — "exactly like mds" (bake.mjs §MDS-OSM-JOIN).
//
// Like NRW, Melbourne and NL (vectors, not a raster) the height is TRANSCRIBED from the authority's
// attribute, not computed from pixels. Why a STAMP and not a replace: same as every join here — one
// footprint set, coherent with the roads/water/landuse baked from the same OSM clip, plus the one
// attribute the city has that OSM lacks.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • page refused / timed out / undecodable  → `tileErrors++` — a FAILURE (the portal, or us). The cell's
//                                                footprints keep their OSM tags.
//   • page decodes to ZERO components          → `voidTiles++` — an honest EMPTY (park, water, or every
//                                                record there had NULL height); footprints keep OSM tags.
//   • footprint matches no component           → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • footprint outside US_OPEN_CITY_BBOXES    → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
//   • a metro with no adapter row (chicago)    → the region never declares heightJoin:'us_open'; if it
//                                                did, every footprint would pass through unstamped and the
//                                                §MEASURED-HEIGHT-GATE would fail the bake, by design.
// ⚠ THE MARKER. Every stamped footprint carries `pryzm:height_src=measured-lidar`, the ONE value the
// client (contextBuildings.ts) and the CI probe (context-height-probe) recognise as "a REAL MEASURED
// per-building height from a regional/national authority source". SF's hgt_maxcm IS LiDAR; NYC's
// height_roof and Boston's BLDG_HGT_2010 are authority-measured PHOTOGRAMMETRIC / as-built heights, not
// LiDAR — exactly as Melbourne's LoD1 (photogrammetric) and NRW's LoD2 already are under the same
// marker. The method is recorded per footprint in `heightSource` (the adapter's heightSourceTag) and
// per metro in `measurement`; the marker's NAME is a repo-wide misnomer this stamp does not widen.
// KEYLESS: anonymous Socrata SODA (NYC, SF) and an anonymous ArcGIS FeatureServer (Boston) — no key,
// no app token, no repo secret. Licences per adapter row (NYC Terms of Use · SF PDDL · Boston PDDL).
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf,
} from '../heightSources.mjs';
import { US_OPEN_HEIGHTS, parseUsOpenPage, usOpenComponents, usOpenHeightForFootprint, usOpenMetroForPoint, usOpenPageUrl } from './usOpenHeights.mjs';

/**
 * Stamp US open per-metro heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own clip).
 * Reads `inPath`, keeps only footprints inside a stamp bbox AND a metro with an adapter row, tiles the
 * region at the metro's `tileSpanDeg`, fetches the metro's pages per POPULATED cell, and sets `height`
 * (metres) + the measured marker on every footprint a component matches. Writes to `outPath` (same
 * footprints, heights added — a REPLACE input, no double-draw). Never throws; a source failure leaves
 * footprints at the OSM default. Same result shape as the other joins (bake.mjs reads it).
 * @param bbox [w,s,e,n] WGS84 — the bake region row's bbox.
 */
export async function stampUsOpenHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, padDeg = 0.0005, maxTiles = 2000, maxPagesPerCell = 25, retainBboxes = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `US open-heights join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'US open-heights join: no bbox supplied' };
  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — hold only footprints inside a stamp bbox AND inside a metro that serves
  // heights (a footprint in a stamp bbox with no adapter row cannot be stamped: pass it through).
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    const m = usOpenMetroForPoint(fp.clon, fp.clat);
    if (!m) return null;
    return { feat, ...fp, metro: m.metro };
  }, 'US open-heights join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  // One region = one metro in practice (each US row is a metro clip); the cell span is the adapter's.
  // If a region ever spans two adapters, the finer span is used for both (bounded bytes either way).
  const metros = [...new Set(records.map((r) => r.metro))].map((k) => US_OPEN_HEIGHTS[k]).filter(Boolean);
  const tileSpanDeg = metros.length ? Math.min(...metros.map((m) => m.tileSpanDeg)) : 0.01;
  const nx = Math.max(1, Math.ceil((e - w) / tileSpanDeg));
  const ny = Math.max(1, Math.ceil((n - s) / tileSpanDeg));
  const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / tileSpanDeg)));
  const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / tileSpanDeg)));
  const buckets = bucketRecords(records, (r) => [cellIx(r.clon), cellIy(r.clat)]);
  let processedTiles = 0, tileErrors = 0, voidTiles = 0, tileCapHit = false, requests = 0, pageCapHits = 0;
  let componentsFetched = 0, bytesFetched = 0;
  const rules = new Map();
  const skippedTotals = { notBuilding: 0, noHeight: 0, noGeometry: 0 };
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();
  try {
    // Visit ONLY populated cells (sorted → deterministic under the cap).
    for (const key of [...buckets.keys()].sort()) {
      const inTile = buckets.get(key);
      if (!inTile || inTile.length === 0) continue;
      if (processedTiles >= maxTiles) { tileCapHit = true; break; }
      const [ix, iy] = key.split(',').map(Number);
      const tw = w + ix * tileSpanDeg, ts = s + iy * tileSpanDeg;
      const cell = [tw, ts, Math.min(tw + tileSpanDeg, e), Math.min(ts + tileSpanDeg, n)];
      // A cell may straddle two metros' working sets; each gets its own pages.
      const byM = new Map();
      for (const r of inTile) { const b = byM.get(r.metro); if (b) b.push(r); else byM.set(r.metro, [r]); }
      let cellOk = false;
      for (const [mid, recs] of byM) {
        const m = US_OPEN_HEIGHTS[mid];
        if (!m) continue;
        // Page through the cell. A FAILED page fails the whole cell for this metro (partial pages would
        // stamp the first N buildings and silently skip the rest — a truncation, §BDTOPO-CAP-TRUNCATE).
        const comps = [];
        let offset = 0, pages = 0, failed = false;
        for (;;) {
          if (pages >= maxPagesPerCell) { pageCapHits++; break; }
          requests++; pages++;
          const rr = await httpGetSafe(usOpenPageUrl(m, cell, { offset, padDeg }), { timeoutMs, headers: { Accept: 'application/json' } });
          if (!rr.ok) { failed = true; break; }              // refused / timed out — a FAILURE, never "nothing here"
          const page = parseUsOpenPage(rr.body, m);
          if (!page) { failed = true; break; }               // undecodable / an error document — a FAILURE
          bytesFetched += rr.body.length;
          const built = usOpenComponents(page, m);
          for (const k of Object.keys(skippedTotals)) skippedTotals[k] += built.skipped[k];
          comps.push(...built.components);
          if (!page.more || page.features.length === 0) break;
          offset += page.features.length;
        }
        if (failed) { tileErrors++; continue; }
        cellOk = true;
        componentsFetched += comps.length;
        if (comps.length === 0) { voidTiles++; continue; }   // an honest EMPTY: the portal answered, nothing measured here
        for (const r of recs) {
          const h = usOpenHeightForFootprint(r.ext, r.interiors, r.clon, r.clat, comps);
          if (!h) continue;
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: h.height, heightSource: m.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
          heights.push(h.height);
          rules.set(h.rule, (rules.get(h.rule) ?? 0) + 1);
        }
      }
      if (cellOk) processedTiles++;
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFileSync(outPath, records.map((r) => JSON.stringify(r.feat)).join('\n') + '\n');
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, nx * ny - buckets.size);
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, voidTiles, emptyTiles, tileCapHit, sweepAborted, sweepAbortReason, tileGrid: `${nx}×${ny}`,
    tileSpanDeg, metros: metros.map((m) => m.metro), requests, pageCapHits, componentsFetched, componentsSkipped: skippedTotals,
    bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    matchRules: Object.fromEntries(rules), elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells: buckets.size,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `US open per-metro heights (${metros.map((m) => `${m.metro}: ${m.heightField}×${m.unit}`).join(', ') || 'no metro'}) stamped onto OSM footprints → ` +
      `${measured}/${records.length} RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) / metro(s) passed ` +
      `through with their original OSM tags; ${processedTiles} cell(s) read at ${tileSpanDeg}° (${requests} page(s), ${componentsFetched} components, ` +
      `${(bytesFetched / 1e6).toFixed(0)} MB; skipped ${skippedTotals.noHeight} no-height / ${skippedTotals.notBuilding} non-building record(s)), ` +
      `${voidTiles} empty cell(s), ${tileErrors} page error(s)${pageCapHits ? `, ${pageCapHits} cell(s) hit the ${maxPagesPerCell}-page cap` : ''}` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
