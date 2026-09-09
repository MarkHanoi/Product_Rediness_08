#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// §PUBLISH-FIDELITY — did the merge actually carry this region's BYTES into the live archive?
// Lane DELAWARE-R2, 2026-09-09.
//
// ⛔ THE GAP THIS CLOSES, and it is a gap in the gates, not in a document.
// `merge-tiles.mjs`'s no-loss gate is a gate on NAMES: it compares region name SETS between the
// live manifest and what this run will merge, and refuses by name when one would disappear. And
// context-merge-publish.yml's "Assert the merged tiles are real" is a gate on SIZE and MAGIC:
// > 50 KB and the seven bytes "PMTiles".
//
// Neither asks whether the region's tiles are IN there. A merge that listed `delaware` in
// `layers.<l>.regions` and produced an archive containing no Delaware tile would pass BOTH: the
// name set is right, and the archive is 25 GB of everyone else. The manifest would say the map has
// Delaware, and the map would not. That is the committed-≠-reachable shape, one layer down —
// RUNBOOK-CONTEXT-R2-PUBLISH §3 already warns that "a run's exit code is not the evidence, the
// bytes are", and then verifies the bytes of the ARCHIVE rather than of the REGION.
//
// HOW IT ANSWERS. It reads the same tile z/x/y out of BOTH the live archive and the region's own
// staged archive, through the same pmtiles@4.4.1 the browser uses, and compares:
//     staged present + live present, equal length  -> CARRIED
//     staged present + live absent                 -> ⛔ LOST IN THE MERGE
//     staged present + live present, LENGTH DIFFERS-> ⚠ RE-ENCODED (tile-join re-merges border
//                                                    tiles shared with a neighbour — expected at a
//                                                    frontier, suspicious in the interior)
//     staged absent  + live absent                 -> AGREE, the tile is genuinely empty
// The staged archive is the right reference precisely because it is what the merge was FED.
//
// ⛔ §CONTEXT-DATA-HONESTY — "absent" and "unreachable" are never merged. A tile the archive could
// not be read at yields `unreachable`, is excluded from the verdict, and sets exit 2 (no verdict),
// never exit 1 (a bad verdict). A flaky CDN must not be reportable as a lost region.
//
// ⛔ AN ALL-ABSENT SAMPLE IS NOT A PASS. If every sampled tile is absent in BOTH, the run proves
// nothing about the publish and says so (exit 2) rather than printing a green "0 lost" — that would
// be the vacuous-gate defect this lane already found once today, where a spot-check with zero rows
// in scope passed while measuring nothing.
//
// USAGE
//   node verify-published-region.mjs --region delaware --layers buildings,roads,water
//   node verify-published-region.mjs --region delaware --at 39.7459,-75.5466 --at 39.1582,-75.5244
//   node verify-published-region.mjs --region delaware --layers trees --json
//
// EXIT 0 = every sampled tile carried · 1 = at least one LOST · 2 = no verdict possible
//      3 = bad arguments.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(join(HERE, '../../apps/editor/package.json'));
const { PMTiles, FetchSource } = require_('pmtiles');

const R2 = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev';
/** contextTiles.ts CONTEXT_TILESET_VERSION — the live archives are addressed with this stamp. */
const STAMP = 'L663a';
/** contextTiles.ts LAYER_ZOOM — the zoom the CLIENT reads each layer at. Duplicated with its source
 *  named, exactly as probe.mjs duplicates its client-parity constants; a drift is findable. */
const LAYER_Z = { buildings: 16, roads: 16, water: 16, parks: 16, landuse: 16, rail: 16, trees: 16, sea: 14, furniture: 16 };

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const la = (lat * Math.PI) / 180;
  return [
    Math.floor(((lon + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n),
  ];
}

/**
 * Sample points spread across a bbox: the four interior quarter-points plus the centre. Interior,
 * not corners — a corner of a national bbox is usually sea or another country, and a sample that
 * is empty everywhere proves nothing.
 */
export function samplePoints(bbox) {
  const [w, s, e, n] = bbox;
  const at = (fx, fy) => [w + (e - w) * fx, s + (n - s) * fy];
  return [at(0.5, 0.5), at(0.25, 0.25), at(0.75, 0.25), at(0.25, 0.75), at(0.75, 0.75)];
}

/**
 * Classify one tile pair. PURE — this is the decision, and it is what the test binds.
 *
 * ⛔ `claimed` IS LOAD-BEARING, and it was added after the tool falsely accused its own pipeline.
 * The first version had no such argument, so running it on a layer that had simply not been merged
 * for this region yet printed:
 *     LOST — roads: staged has 6602 B, the LIVE archive has no tile.
 *     "The merge listed this region but did not carry its bytes."
 * Every word of which was wrong: no merge had listed it, because no roads merge had run. A tool
 * that reports NOT-YET-DONE as DATA LOSS is the §CONTEXT-DATA-HONESTY defect committed by the
 * instrument instead of the pipeline — and it is worse than silence, because it would send someone
 * hunting a corruption that does not exist.
 *
 * `claimed` is a THREE-valued answer from `manifestClaims`, never a boolean:
 *   true      the layer's own `regions` record names this region  -> a missing tile IS a loss
 *   false     the record exists and does NOT name it              -> `not-published`, not a loss
 *   'unknown' the record cannot answer (no per-layer `regions`)   -> `claim-unknown`, NEVER a loss
 *
 * ⛔ THE THIRD VALUE IS NOT PEDANTRY, it is the second bug this function had. The fix above used a
 * BOOLEAN and fell back to the tileset-wide `regions` list when a layer carried no record of its
 * own. That list is rewritten by EVERY merge from the sets that participated, so after one trees
 * publish it named `delaware` — and `roads`, carried forward untouched since 2026-09-04 and
 * containing no Delaware byte, was thereby "claimed". The tool went on calling it LOST. That is
 * precisely the blindness this lane documented in merge-tiles.mjs's own no-loss gate (a non-optional
 * layer with no `regions[]` falls back to a tileset-wide list that describes a different merge),
 * reproduced inside the instrument written to catch it. UNKNOWN IS NOT CLAIMED.
 *
 * @param {number|null|'unreachable'} stagedLen
 * @param {number|null|'unreachable'} liveLen
 * @param {boolean|'unknown'} claimed
 */
export function classify(stagedLen, liveLen, claimed = true) {
  if (stagedLen === 'unreachable' || liveLen === 'unreachable') return 'unreachable';
  if (stagedLen === null && liveLen === null) return claimed === true ? 'agree-empty' : 'not-published';
  if (stagedLen !== null && liveLen === null) {
    if (claimed === true) return 'LOST';
    return claimed === 'unknown' ? 'claim-unknown' : 'not-published';
  }
  if (stagedLen === null && liveLen !== null) return 'live-only';   // another region's tile here
  return stagedLen === liveLen ? 'carried' : 're-encoded';
}

/**
 * Does the live manifest claim this region for this layer? Reads the per-layer `regions` record the
 * merge writes. A layer with NO `regions` array is an older record that cannot answer, so it falls
 * back to the tileset-wide list — the same fallback merge-tiles.mjs's own no-loss gate uses, rather
 * than a second interpretation of the same document.
 */
export function manifestClaims(manifest, layer, region) {
  const rec = manifest?.layers?.[layer];
  if (!rec) return false;                                   // the layer is not live at all
  if (Array.isArray(rec.regions)) return rec.regions.includes(region);
  return 'unknown';                                         // see classify() — never the top-level list
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
  const argAll = (k) => argv.reduce((a, v, i) => (v === k && argv[i + 1] ? [...a, argv[i + 1]] : a), []);
  const JSON_OUT = argv.includes('--json');
  const region = arg('--region');
  if (!region) { console.error('verify-published-region: --region <slug> is required'); process.exit(3); }
  const layers = (arg('--layers') ?? 'buildings,roads,water,parks,landuse,rail,trees').split(',').map((s) => s.trim()).filter(Boolean);
  const bad = layers.filter((l) => !(l in LAYER_Z));
  if (bad.length) { console.error(`verify-published-region: unknown layer(s) ${bad.join(', ')}`); process.exit(3); }

  // Points: explicit --at wins; otherwise sample the region's own bbox out of bake.mjs's table —
  // the EXISTING seam merge-tiles.mjs itself uses, never a second copy of the region list.
  let pts = argAll('--at').map((s) => { const [lat, lon] = s.split(',').map(Number); return [lon, lat]; });
  if (pts.length === 0) {
    const tables = JSON.parse(execFileSync('node', [join(HERE, 'bake.mjs'), '--regions-json'], { encoding: 'utf8', maxBuffer: 32e6 }));
    const row = tables.allRegions.find((r) => r.name === region);
    if (!row) { console.error(`verify-published-region: '${region}' is not a bake.mjs region`); process.exit(3); }
    pts = samplePoints(row.bbox.split(',').map(Number));
  }

  // The LIVE manifest, so a layer never merged for this region reads as `not-published` (or
  // `claim-unknown`) rather than as data loss. Served no-cache, so this is always the current claim.
  let liveManifest = null;
  try {
    const r = await fetch(`${R2}/tiles/tileset-manifest.json`, { headers: { 'cache-control': 'no-cache' } });
    if (r.ok) liveManifest = await r.json();
  } catch { /* handled below */ }
  if (!liveManifest) {
    // UNKNOWN IS NOT ABSENT. Without the manifest this cannot tell "not published yet" from "lost
    // in the merge", and guessing either way is the failure the tool exists to avoid.
    console.error('✖ could not read the live tileset-manifest.json — cannot tell "not published yet"');
    console.error('  from "lost in the merge", and will not guess. No verdict.');
    process.exit(2);
  }

  const open = (u) => new PMTiles(new FetchSource(u));
  const rows = [];
  for (const layer of layers) {
    const z = LAYER_Z[layer];
    const live = open(`${R2}/tiles/${layer}.pmtiles?v=${STAMP}`);
    const stg = open(`${R2}/tiles-staging/${region}/${layer}.pmtiles`);
    const len = async (p, zz, x, y) => {
      try { const t = await p.getZxy(zz, x, y); return t ? t.data.byteLength : null; }
      catch { return 'unreachable'; }
    };
    for (const [lon, lat] of pts) {
      const [x, y] = lonLatToTile(lon, lat, z);
      const [sl, ll] = [await len(stg, z, x, y), await len(live, z, x, y)];
      const claimed = manifestClaims(liveManifest, layer, region);
      rows.push({ layer, z, x, y, lon, lat, staged: sl, live: ll, claimed, verdict: classify(sl, ll, claimed) });
    }
  }

  if (JSON_OUT) console.log(JSON.stringify({ region, stamp: STAMP, rows }, null, 2));
  else {
    console.log(`§PUBLISH-FIDELITY — region '${region}' · live ?v=${STAMP} vs tiles-staging/${region}/\n`);
    console.log('layer        z   x/y                    staged      live        verdict');
    for (const r of rows) {
      console.log(`${r.layer.padEnd(12)} ${String(r.z).padEnd(3)} ${`${r.x}/${r.y}`.padEnd(22)} ` +
        `${String(r.staged ?? 'absent').padEnd(11)} ${String(r.live ?? 'absent').padEnd(11)} ${r.verdict}` +
        `${r.claimed === true ? '' : `   (manifest claim: ${r.claimed})`}`);
    }
  }

  const lost = rows.filter((r) => r.verdict === 'LOST');
  const unreachable = rows.filter((r) => r.verdict === 'unreachable');
  const informative = rows.filter((r) => r.verdict === 'carried' || r.verdict === 're-encoded' || r.verdict === 'LOST');
  const reenc = rows.filter((r) => r.verdict === 're-encoded');
  if (!JSON_OUT) {
    console.log(`\n  ${rows.length} sample(s): ${rows.filter((r) => r.verdict === 'carried').length} carried · ` +
      `${reenc.length} re-encoded · ${lost.length} LOST · ${rows.filter((r) => r.verdict === 'agree-empty').length} agree-empty · ` +
      `${rows.filter((r) => r.verdict === 'not-published').length} not-published · ` +
      `${rows.filter((r) => r.verdict === 'claim-unknown').length} claim-unknown · ` +
      `${unreachable.length} unreachable`);
  }
  if (lost.length > 0) {
    for (const r of lost) console.error(`✖ LOST — ${r.layer} z${r.z}/${r.x}/${r.y}: staged has ${r.staged} B, the LIVE archive has no tile.`);
    console.error('  The merge listed this region but did not carry its bytes. The manifest is claiming coverage the map does not have.');
    process.exit(1);
  }
  if (informative.length === 0) {
    const cu = rows.filter((r) => r.verdict === 'claim-unknown');
    if (cu.length > 0) {
      const ls = [...new Set(cu.map((r) => r.layer))].join(', ');
      console.error(`⚠ NO VERDICT — the live manifest carries no per-layer 'regions' record for [${ls}],`);
      console.error(`  so it cannot say whether it ever claimed '${region}'. Those layer records are`);
      console.error('  carriedForward from an older merge. UNKNOWN IS NOT A LOSS and is not reported as one.');
      console.error('  Re-run after that layer is merged: the merge writes its own regions record.');
      process.exit(2);
    }
    const np = rows.filter((r) => r.verdict === 'not-published');
    if (np.length > 0) {
      console.error(`⚠ NO VERDICT — the live manifest does not list '${region}' for [${[...new Set(np.map((r) => r.layer))].join(', ')}].`);
      console.error('  Those layers have not been merged for this region yet. That is NOT a loss and is');
      console.error('  deliberately not reported as one — re-run after each layer publishes.');
      process.exit(2);
    }
    console.error('⚠ NO VERDICT — every sampled tile was absent in the staged archive too, so this run');
    console.error('  established nothing about the publish. Pass --at points where the region has data.');
    console.error('  (Printing "0 lost" here would be a gate that passes by measuring nothing.)');
    process.exit(2);
  }
  if (unreachable.length > 0) {
    console.error(`⚠ ${unreachable.length} sample(s) UNREACHABLE — excluded from the verdict, and NOT counted as lost.`);
    process.exit(2);
  }
  console.log(`✔ CARRIED — ${informative.length} informative sample(s), 0 lost.`);
}
