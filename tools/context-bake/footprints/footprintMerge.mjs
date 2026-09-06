// ─────────────────────────────────────────────────────────────────────────────
// §ES-CATASTRO-FOOTPRINTS — the bake-side driver (L-12939, 2026-09-05, lane ES-CATASTRO-FOOTPRINTS)
//
// Writes Spain's official footprints into the ONE working-set file `bake.mjs`'s
// `applyNationalFootprints` then merges, using the `footprintMerge: 'replace-in-bbox'` machinery
// the France lane built (`frBdtopo.mjs`, L-12940).
//
// ⚠ THIS FILE DELIBERATELY OWNS NO MERGE. It had one — a second, ES-specific `official-wins` merge
// with its own centroid-in-outline index — and it was DELETED on discovery that L-12940 had already
// landed `mergeReplaceInBbox` in the working tree, doing the same job with better-argued semantics
// (a plain `replace` deletes the uncovered country; a plain `append` draws every covered building
// twice). Two rival merges for "national footprints beat OSM" is exactly the kind of duplication
// that later reads as one being the fix for the other. There is one merge, in `frBdtopo.mjs`, and
// both countries call it. This file supplies the FOOTPRINTS; that file decides who wins.
//
// ⚠ SPAIN IS OPT-IN AND FRANCE IS NOT — a MEASURED asymmetry, not a preference. The Catastro pull
// is a bulk ZIP-per-municipality download: Córdoba alone is 22.9 MB of ZIP that inflates to 597 MB
// of GML and parses in ~250 s, so the nine-city working set is ~40–70 minutes ON TOP of a bake that
// already runs to a 330-minute ceiling. That cost may not be added to every Spanish bake silently.
// `optIn: 'footprints'` makes it wait for `--footprints official`; a source without the flag (BD
// TOPO's WFS, which pages) runs whenever its region declares it, exactly as it does today.
// ─────────────────────────────────────────────────────────────────────────────
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { HEIGHT_KIND_FLOORS } from './officialFootprints.mjs';
import { ES_CATASTRO, downloadMunicipalityZip, parseMunicipalityZip, resolveMunicipalities } from './esCatastro.mjs';

/** The `footprintSource` values with a wired adapter. A row not here is a CONFIG error. */
export const FOOTPRINT_SOURCE_KEYS = Object.freeze(['es_catastro', 'fr_bdtopo']);

/** The only merge semantics either country may declare — see the frBdtopo.mjs rationale. */
export const FOOTPRINT_MERGE_MODE = 'replace-in-bbox';

/**
 * Validate every region's footprint config BEFORE a byte is downloaded (bake's `--check` step).
 * ~2 ms, and it is the difference between finding a mis-declared row now and at hour four.
 */
export function assertFootprintConfig(regions) {
  const problems = [];
  for (const r of regions) {
    if (!r.footprintSource) continue;
    if (!FOOTPRINT_SOURCE_KEYS.includes(r.footprintSource)) {
      problems.push(`${r.name}: footprintSource '${r.footprintSource}' is not one of ${FOOTPRINT_SOURCE_KEYS.join(', ')}`);
    }
    if (r.footprintMerge !== FOOTPRINT_MERGE_MODE) {
      problems.push(`${r.name}: footprintMerge '${r.footprintMerge ?? 'unset'}' — only '${FOOTPRINT_MERGE_MODE}' is supported `
        + '(a plain `replace` deletes the uncovered country; a plain `append` draws every covered building twice)');
    }
    if (!Array.isArray(r.footprintBboxes) || r.footprintBboxes.length === 0) {
      // §FOOTPRINT-BUDGET — the §HEIGHT-STAMP-BUDGET lesson (L-659), which cost run 30693132326
      // twenty-three minutes and an OOM. A whole-country footprint pull needs a declared working set.
      problems.push(`${r.name}: footprintSource is set but its working set is EMPTY — a whole-country footprint pull cannot finish`);
    }
  }
  return problems;
}

/**
 * Write Spain's official footprints for `bboxes` into ONE GeoJSONSeq at `outPath`.
 *
 * Matches `frBdtopo.mjs`'s `writeBdtopoWorkingSet` contract exactly — `(outPath, { onArea })` →
 * `{ status, written, measured, floorsDerived, unknown, cells, cellsFailed, areas }` — so
 * `applyNationalFootprints` drives both countries through the identical code path and neither can
 * acquire a private branch.
 *
 * ⚠ `measured` IS ALWAYS 0 FOR SPAIN, and that is the honest answer rather than a gap in the
 * implementation. Catastro publishes storey COUNTS (`numberOfFloorsAboveGround`), never metres;
 * every height derivable from it is `floors×3.0`. Spain's MEASURED heights come from the CNIG MDS
 * raster stamp (`heightJoin:'mds'`), which is a different join over these same footprints. Counting
 * a floors derivation as `measured` would rank it above a real OSM survey — the honesty inversion
 * C57 §1.9 bans, and the one `frBdtopo.mjs` guards with the same three-way split.
 */
export async function writeCatastroWorkingSet(outPath, bboxes, { onArea = () => {}, outDir = null, maxMunicipalities = 400 } = {}) {
  const dir = outDir ?? resolve(outPath, '..');
  writeFileSync(outPath, '');

  // ── 1. resolve municipalities across every working bbox, from the ATOM feeds ──
  const seen = new Map();
  const areas = [];
  for (const raw of bboxes) {
    const box = typeof raw === 'string' ? raw.split(',').map(Number) : raw;
    let res;
    try { res = await resolveMunicipalities(box, {}); }
    catch (e) { res = { status: 'error', reason: e.message }; }
    if (res.status !== 'ok') {
      areas.push({ area: box.join(','), status: 'error', reason: res.reason, kept: 0 });
      continue;
    }
    for (const m of res.municipalities) if (!seen.has(m.code)) seen.set(m.code, { ...m, area: box.join(',') });
  }
  const munis = [...seen.values()];
  if (munis.length === 0) {
    // §CONTEXT-DATA-HONESTY — a REAL answer, not a failure: Catastro's territorial scope excludes
    // the Basque provinces and Navarra, which run foral cadastres and publish no ES.SDGC feed.
    // The bbox keeps its OSM footprints, and the run says why.
    return {
      status: 'error', written: 0, measured: 0, floorsDerived: 0, unknown: 0, cells: 0, cellsFailed: 0, areas,
      reason: 'no Catastro municipality meets the working set (foral cadastre, or outside national coverage) — OSM footprints kept',
    };
  }
  if (munis.length > maxMunicipalities) {
    return {
      status: 'error', written: 0, measured: 0, floorsDerived: 0, unknown: 0, cells: munis.length, cellsFailed: 0, areas,
      reason: `${munis.length} municipalities exceed the ${maxMunicipalities} cap — narrow the working set rather than raising it`,
    };
  }

  // ── 2. download + stream-parse each, appending to the one working-set file ──
  let written = 0, floorsDerived = 0, unknown = 0, failed = 0, zipBytes = 0;
  let buf = '';
  const flush = () => { if (buf) { appendFileSync(outPath, buf); buf = ''; } };
  mkdirSync(resolve(dir, 'catastro'), { recursive: true });

  for (const m of munis) {
    const before = { written, floorsDerived, unknown };
    let status = 'ok', reason = null;
    try {
      const dl = await downloadMunicipalityZip(m, resolve(dir, 'catastro'), {});
      zipBytes += dl.bytes;
      await parseMunicipalityZip(dl.path, m.epsg, (feat) => {
        buf += JSON.stringify(feat) + '\n';
        // §SEQ-WRITE-STREAMED (L-12937) — bounded chunks; never one whole-set string. That failure
        // is one week old and cost France a four-hour bake, read afterwards as "0 measured heights".
        if (buf.length >= 8 * 1024 * 1024) flush();
        written++;
        if (feat.properties['pryzm:height_kind'] === HEIGHT_KIND_FLOORS) floorsDerived++;
        else unknown++;
      }, {});
    } catch (e) {
      status = 'error'; reason = e.message; failed++;
    }
    flush();
    areas.push({
      area: `${m.code}-${m.name}`, status, reason,
      kept: written - before.written,
      measured: 0,
      floorsDerived: floorsDerived - before.floorsDerived,
      unknown: unknown - before.unknown,
      dropped: 0, cells: 1, cellsFailed: status === 'ok' ? 0 : 1,
    });
    onArea(`${m.code}-${m.name}`, areas[areas.length - 1]);
  }
  flush();

  if (written === 0) {
    return {
      status: 'error', written: 0, measured: 0, floorsDerived: 0, unknown: 0,
      cells: munis.length, cellsFailed: failed, areas,
      reason: `parsed ${munis.length} municipalit(ies) but produced ZERO footprints`,
    };
  }
  return {
    // §CONTEXT-DATA-HONESTY — a municipality that failed leaves a HOLE, not an empty area, and the
    // status says so by name. `partial` is what `applyNationalFootprints` prints the warning for.
    status: failed > 0 ? 'partial' : 'ok',
    written, measured: 0, floorsDerived, unknown,
    cells: munis.length, cellsFailed: failed, areas, zipBytes,
    bytes: existsSync(outPath) ? statSync(outPath).size : 0,
  };
}

/**
 * The `FOOTPRINT_SOURCES` row bake.mjs registers. `defaultBboxes` is supplied BY BAKE when it
 * spreads this object (the working set resolves to MDS_CITY_BBOXES, which lives in bake.mjs, so
 * Spain's footprints and its measured heights cover the SAME ground — §MDS-BBOX-MUST-COVER-THE-REGION);
 * everything else is owned here.
 *
 * ⚠ `write`'s PARAMETER ORDER IS THE CONSUMER'S, NOT THIS FILE'S — `(outPath, bboxes, onArea)`,
 * exactly as `applyNationalFootprints` calls it and exactly as the `fr_bdtopo` row declares it.
 * It read `(outPath, onArea, bboxes, outDir)` until 2026-09-06, which silently passed the bbox
 * array as the progress CALLBACK and the callback as the bboxes: the first `onArea(...)` would
 * have thrown "onArea is not a function" deep inside a 40-minute pull, with the two lanes that
 * wrote this file and its call site an hour apart each reading a signature the other did not use.
 * Both national rows now go through ONE shape, so neither country can acquire a private branch —
 * which is the whole reason the two adapters share a table instead of an `if`.
 */
export const ES_CATASTRO_FOOTPRINTS = Object.freeze({
  label: ES_CATASTRO.label,
  attribution: ES_CATASTRO.attribution,
  /** ⚠ See the file header: the Catastro bulk pull is ~40–70 min and may not run unasked. */
  optIn: 'footprints',
  write: (outPath, bboxes, onArea) => writeCatastroWorkingSet(outPath, bboxes, { onArea }),
});
