// ─────────────────────────────────────────────────────────────────────────────
// §CA-OPEN-HEIGHTS-OSM-JOIN (2026-09-06, lane MEXICO-CANADA) — stamp OPEN per-jurisdiction Canadian
// building heights (Vancouver's LiDAR topelev_m/baseelev_m · Toronto's DERIVED_HEIGHT) onto bake's
// OWN OSM footprints: the NETWORK + STREAM half of the Canadian stamp. The decisions (adapter table,
// request URL + axis order, the element parser, the stack→one-metre rule, what counts as TRUNCATED)
// are in heights/caOpenHeights.mjs and are unit-tested there against verbatim fixtures; this file
// only sweeps cells, fetches, and writes.
//
// WHY ITS OWN MODULE and not a hunk in heightSources.mjs: that file is edited by several lanes at
// once (§SHARED-FILE-COLLISION), so this stamp lives beside its pure half and bake.mjs imports it
// directly — the usOpenHeightsStamp / nl3dbagStamp / ealidarGbStamp precedent. It borrows the join
// helpers heightSources.mjs already has (`loadJoinFootprintsBounded`, `footprintFromFeature`,
// `stampAreasFor`, `inAnyArea`, `bucketRecords`, `httpGetSafe`, `statsOf`) rather than
// re-implementing them, so the retained-working-set / heap-watchdog / failure-vs-empty behaviour is
// the SAME code every other join runs.
//
// Like NRW, Melbourne, NL and the US metros (vectors, not a raster) the height is TRANSCRIBED from
// the authority's own attribute, not computed from pixels. Why a STAMP and not a replace: one
// footprint set, coherent with the roads/water/landuse baked from the same OSM clip, plus the one
// attribute the city has that OSM lacks.
//
// ⭐ THE ONE THING THIS JOIN DOES THAT ITS SIBLINGS DO NOT — PER-JURISDICTION CELL SIZE. Its two
// channels have DIFFERENT caps, measured 2026-09-06: Vancouver's /exports/geojson has no row cap
// (41 features in a CBD sliver, 0.57 s) while Toronto's ArcGIS layer caps at maxRecordCount 2000 and
// a 0.04° downtown box returns exactly 2000 of a true 18,358 with `exceededTransferLimit: true`.
// The US join takes `min(tileSpanDeg)` across its metros because its regions are single-metro clips;
// here the two jurisdictions sit in DIFFERENT bake regions (vancouver→britishcolumbia,
// toronto→ontario) 3,300 km apart, so a shared minimum would quadruple Vancouver's request count for
// nothing. Each jurisdiction is therefore bucketed on its OWN grid. That is a loop, not a mechanism.
//
// §CONTEXT-DATA-HONESTY — the values this join keeps DIFFERENT:
//   • request refused / timed out / undecodable → `tileErrors++` — a FAILURE (the portal, or us). The
//                                                 cell's footprints keep their OSM tags.
//   • ⛔ answer TRUNCATED (exceededTransferLimit, or a count landing on the declared cap)
//                                               → `tileErrors++` AND `truncatedCells++`. An HTTP 200
//                                                 that is not a complete answer is a FAILURE, never a
//                                                 partial success: stamping the fraction the server
//                                                 chose to send would leave the rest at a 9 m default
//                                                 with nothing anywhere saying so.
//   • answer decodes to ZERO elements            → `voidTiles++` — an honest EMPTY (park, rail yard,
//                                                 water); footprints keep their OSM tags. Not an error.
//   • footprint matches no element               → keeps its ORIGINAL OSM tags. Never a neighbour's height.
//   • footprint outside CA_OPEN_CITY_BBOXES      → streamed through untouched (§JOIN-BOUNDED-WORKING-SET).
//   • a province with no adapter row (quebec …)  → never declares heightJoin:'ca_open'; if it did,
//                                                 every footprint would pass through unstamped and the
//                                                 §MEASURED-HEIGHT-GATE would fail the bake, by design.
//
// ⚠ THE MARKER. Every stamped footprint carries `pryzm:height_src=measured-lidar`, the ONE value the
// client (contextBuildings.ts) and the CI probe (context-height-probe) recognise as "a REAL MEASURED
// per-building height from a regional/national authority source". Vancouver's 2009 surfaces ARE
// LiDAR-derived; Toronto's DERIVED_HEIGHT is an authority-measured height whose capture method the
// city does not state on the service — exactly as Melbourne's LoD1 (photogrammetric), NYC's
// height_roof and Boston's BLDG_HGT_2010 already sit under the same marker. The method is recorded
// per footprint in `heightSource` (the adapter's heightSourceTag); the marker's NAME is a repo-wide
// misnomer this stamp does not widen.
// KEYLESS: an anonymous Opendatasoft Explore export and the City of Toronto's own anonymous ArcGIS
// MapServer — no key, no app token, no repo secret. Licences per adapter row.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  MEASURED_HEIGHT_SRC_TAG, MEASURED_HEIGHT_SRC_VALUE, loadJoinFootprintsBounded,
  footprintFromFeature, stampAreasFor, inAnyArea, bucketRecords, httpGetSafe, statsOf,
  appendFeaturesSeq,
} from '../heightSources.mjs';
import {
  CA_OPEN_HEIGHTS, caElements, caOpenHeightForFootprint, caOpenIsTruncated,
  caOpenJurisdictionForPoint, caOpenRequestUrl, parseCaGeojson,
} from './caOpenHeights.mjs';

/**
 * Stamp Canadian open per-jurisdiction heights onto an EXISTING OSM buildings GeoJSONSeq (bake's own
 * clip). Reads `inPath`, keeps only footprints inside a stamp bbox AND a jurisdiction with an adapter
 * row, tiles each jurisdiction's own share of the region at THAT jurisdiction's `tileSpanDeg`,
 * fetches one request per POPULATED cell, and sets `height` (metres) + the measured marker on every
 * footprint an element matches. Writes to `outPath` (same footprints, heights added — a REPLACE
 * input, no double-draw). Never throws; a source failure leaves footprints at the OSM default. Same
 * result shape as the other joins (bake.mjs reads it).
 * @param bbox [w,s,e,n] WGS84 — the bake region row's bbox.
 */
export async function stampCaOpenHeightsOnGeojsonseq(inPath, outPath, bbox, {
  timeoutMs = 60_000, padDeg = 0.0005, maxTiles = 2000, retainBboxes = null,
} = {}) {
  if (!inPath || !existsSync(inPath)) return { status: 'error', reason: `CA open-heights join: input footprints not found (${inPath})` };
  if (!bbox || bbox.length !== 4) return { status: 'error', reason: 'CA open-heights join: no bbox supplied' };
  const [w, s, e, n] = bbox;
  const stampAreas = stampAreasFor(retainBboxes, bbox);
  mkdirSync(dirname(outPath), { recursive: true });
  // §JOIN-BOUNDED-WORKING-SET — hold only footprints inside a stamp bbox AND inside a jurisdiction that
  // serves heights (a footprint in a stamp bbox with no adapter row cannot be stamped: pass it through).
  const load = loadJoinFootprintsBounded(inPath, outPath, (feat) => {
    const fp = footprintFromFeature(feat);
    if (!fp) return null;
    if (!inAnyArea(fp.clon, fp.clat, stampAreas)) return null;
    const j = caOpenJurisdictionForPoint(fp.clon, fp.clat);
    if (!j) return null;
    return { feat, ...fp, jurisdiction: j.jurisdiction };
  }, 'CA open-heights join');
  if (load.status !== 'ok') return { status: load.status, reason: load.reason, read: load.read };
  const records = load.retained;
  const read = load.read;

  const byJurisdiction = new Map();
  for (const r of records) { const b = byJurisdiction.get(r.jurisdiction); if (b) b.push(r); else byJurisdiction.set(r.jurisdiction, [r]); }

  let processedTiles = 0, tileErrors = 0, voidTiles = 0, truncatedCells = 0, tileCapHit = false, requests = 0;
  let elementsFetched = 0, bytesFetched = 0, gridCells = 0, populatedCells = 0;
  const rules = new Map();
  const grids = [];
  // §ABORT-IS-NOT-A-CAP — kept SEPARATE from `tileCapHit` on purpose (see the MDS join's catch).
  let sweepAborted = false, sweepAbortReason = null;
  const heights = [];
  const t0 = Date.now();
  try {
    // Each jurisdiction is swept on its OWN grid — see the header: the two channels' caps differ by
    // 4× and their bake regions are a continent apart, so one shared cell size serves neither.
    for (const [jid, recs] of [...byJurisdiction.entries()].sort()) {
      const j = CA_OPEN_HEIGHTS[jid];
      if (!j) continue;
      const span = j.tileSpanDeg;
      const nx = Math.max(1, Math.ceil((e - w) / span));
      const ny = Math.max(1, Math.ceil((n - s) / span));
      gridCells += nx * ny;
      grids.push(`${jid} ${nx}×${ny} @ ${span}°`);
      const cellIx = (lon) => Math.min(nx - 1, Math.max(0, Math.floor((lon - w) / span)));
      const cellIy = (lat) => Math.min(ny - 1, Math.max(0, Math.floor((lat - s) / span)));
      const buckets = bucketRecords(recs, (r) => [cellIx(r.clon), cellIy(r.clat)]);
      populatedCells += buckets.size;
      // Visit ONLY populated cells (sorted → deterministic under the cap).
      for (const key of [...buckets.keys()].sort()) {
        const inTile = buckets.get(key);
        if (!inTile || inTile.length === 0) continue;
        if (processedTiles >= maxTiles) { tileCapHit = true; break; }
        const [ix, iy] = key.split(',').map(Number);
        const tw = w + ix * span, ts = s + iy * span;
        const cell = [tw, ts, Math.min(tw + span, e), Math.min(ts + span, n)];
        requests++;
        const rr = await httpGetSafe(caOpenRequestUrl(j, cell, { padDeg }), { timeoutMs, headers: { Accept: 'application/json' } });
        if (!rr.ok) { tileErrors++; continue; }             // refused / timed out — a FAILURE, never "nothing here"
        const fc = parseCaGeojson(rr.body);
        if (!fc) { tileErrors++; continue; }                // undecodable / an error document — a FAILURE
        // ⛔ A TRUNCATED 200 IS A FAILURE. Counted twice on purpose: `tileErrors` so the
        // §SOURCE-OUTAGE-VS-PIPELINE-DEFECT bookkeeping sees it, and `truncatedCells` so the note can
        // say the cell grid is too coarse for this density rather than blaming the portal.
        if (caOpenIsTruncated(fc, j)) { tileErrors++; truncatedCells++; continue; }
        bytesFetched += rr.body.length;
        const els = caElements(fc, j);
        elementsFetched += els.length;
        if (els.length === 0) { voidTiles++; processedTiles++; continue; } // an honest EMPTY: it answered, nothing built here
        for (const r of inTile) {
          const h = caOpenHeightForFootprint(r.ext, r.interiors, r.clon, r.clat, els, j);
          if (!h) continue;
          r.feat.properties = { ...(r.feat.properties ?? {}), building: r.feat.properties?.building ?? 'yes', height: h.height, heightSource: j.heightSourceTag, [MEASURED_HEIGHT_SRC_TAG]: MEASURED_HEIGHT_SRC_VALUE };
          heights.push(h.height);
          rules.set(h.rule, (rules.get(h.rule) ?? 0) + 1);
        }
        processedTiles++;
      }
      if (tileCapHit) break;
    }
  } catch (err) { sweepAborted = true; sweepAbortReason = String(err?.message ?? err); } // §ABORT-IS-NOT-A-CAP

  // Pass-through footprints are already in outPath; append the retained (stamped or not) ones.
  if (records.length) appendFeaturesSeq(outPath, records.map((r) => r.feat));
  const measured = heights.length;
  heights.sort((a, b) => a - b);
  const emptyTiles = Math.max(0, gridCells - populatedCells);
  const jNames = [...byJurisdiction.keys()].sort();
  return {
    status: 'ok', outPath, count: read.parsed, footprintCount: records.length, measuredCount: measured,
    coverage: records.length ? Number((measured / records.length).toFixed(3)) : 0,
    heightStats: statsOf(heights), heightSamples: heights.slice(0, 8),
    tilesProcessed: processedTiles, tileErrors, voidTiles, emptyTiles, truncatedCells, tileCapHit,
    sweepAborted, sweepAbortReason, tileGrid: grids.join(' · '),
    jurisdictions: jNames, requests, elementsFetched, bytesFetchedMB: Number((bytesFetched / 1e6).toFixed(1)),
    matchRules: Object.fromEntries(rules), elapsedS: Number(((Date.now() - t0) / 1000).toFixed(1)),
    retainedFootprints: records.length, passedThroughFootprints: read.passedThrough,
    stampAreas: stampAreas.length, populatedCells,
    peakHeapUsedMB: read.peakHeapUsedMB, heapLimitMB: read.heapLimitMB,
    note: `CA open per-jurisdiction heights (${jNames.map((k) => `${k}: ${CA_OPEN_HEIGHTS[k]?.aglField}`).join(', ') || 'no jurisdiction'}) stamped onto OSM footprints → ` +
      `${measured}/${records.length} RETAINED footprint(s) got a MEASURED height (tagged); ${read.passedThrough} outside the ${stampAreas.length} stamp bbox(es) / jurisdiction(s) ` +
      `passed through with their original OSM tags; ${processedTiles} cell(s) read (${grids.join(' · ') || 'no grid'}; ${requests} request(s), ${elementsFetched} elements, ` +
      `${(bytesFetched / 1e6).toFixed(0)} MB), ${voidTiles} empty cell(s), ${tileErrors} error(s)` +
      `${truncatedCells ? ` of which ${truncatedCells} were TRUNCATED answers (cap hit — the cell grid is too coarse for that density; NOT a portal outage)` : ''}` +
      `${tileCapHit ? ` (maxTiles ${maxTiles} cap hit — rest keep OSM)` : ''}` +
      `${sweepAborted ? ` ⚠ SWEEP ABORTED after ${processedTiles} cell(s) — ${sweepAbortReason}; the rest keep OSM (a FAILURE, not a cap)` : ''}` +
      `; peak heap ${read.peakHeapUsedMB} MB of ${read.heapLimitMB} MB.`,
  };
}
