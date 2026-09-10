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
// EXIT 0 = every requested layer CARRIED · 1 = at least one LOST · 2 = no verdict possible
//      3 = bad arguments · 4 = §ABSENCE-IS-A-FINDING: a layer's bytes are STAGED and NOT LIVE.
//
// ⭐ EXIT 4 IS THE ONE ADDED 2026-09-10 (L-13271) AND IT IS THE WHOLE POINT OF THE ROLL-UP. This
// tool used to answer "did the merge LOSE anything?" over the WHOLE RUN — so a layer that had never
// been published lost nothing, and its rows rode out of the run behind a different layer's pass:
// measured 35 samples · 1 carried · 14 not-published · 6 claim-unknown → **RC=0, headline CARRIED**,
// with four of five layers absent from the live map. The verdict is PER LAYER now. See
// `layerVerdict` for the full account; the short version is that a per-run aggregate was answering
// a per-layer question, and an EMPTINESS was sharing an exit code with a PASS.
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

/**
 * ⭐⭐ §ABSENCE-IS-A-FINDING (L-13271, lane DELAWARE-DETAIL 2026-09-10) — **THE ROLL-UP IS PER
 * LAYER, BECAUSE THE QUESTION IS PER LAYER.**
 *
 * ⛔ THE DEFECT THIS RETIRES, AND IT WAS IN THIS FILE'S OWN VERDICT BLOCK. The "did this run
 * establish anything?" guard was written as `if (informative.length === 0)` over **every row of the
 * whole run**. So the moment ONE layer had one informative sample, the guard was skipped and every
 * OTHER layer's rows — including `not-published`, i.e. *staged bytes exist and the live archive has
 * none* — fell straight through to `✔ CARRIED … 0 lost` and **exit 0**. Measured on the run that
 * found it: **35 samples · 1 carried (buildings) · 14 not-published · 6 claim-unknown → RC=0**, with
 * roads, water, landuse and parks entirely absent from the live map. The headline said CARRIED and
 * four of the five layers someone was asking about were not on R2 at all.
 *
 * ⭐ THE AXIS, WHICH IS THE PART WORTH CARRYING (memory `gate-blind-on-the-wrong-axis`): the
 * instrument was not wrong about its own question. `classify` is right, every row was right, and
 * "did the merge LOSE anything?" was answered correctly — **a layer that was never published loses
 * nothing.** The error is that a PER-RUN aggregate was used to answer a PER-LAYER question, so one
 * layer's evidence was allowed to discharge another layer's burden. Population, not arithmetic.
 *
 * ⛔ AND IT IS THE §CONTEXT-DATA-HONESTY COLLAPSE (L-581 / L-616) COMMITTED BY THE INSTRUMENT: a
 * FAILURE and an EMPTINESS must never share a value. `agree-empty` (the tile is genuinely empty in
 * BOTH archives — nothing to carry, nothing to report) and `not-published` (**the region is baked,
 * its bytes are sitting in `tiles-staging/`, and the live map does not have them**) are different
 * facts, and exactly one of them is fine. They shared an exit code.
 *
 * THE STATES, in precedence order — the first that applies wins:
 *   `LOST`          the manifest CLAIMS the region and the bytes are missing. Corruption. exit 1.
 *   `PARTIAL`       some sampled tiles carried and others have staged bytes with nothing live.
 *                   Ranked ABOVE `CARRIED` deliberately: a half-published layer must never be
 *                   reported by its good half.
 *   `NOT-PUBLISHED` every informative-capable sample has staged bytes and no live bytes. A MEASURED
 *                   ABSENCE — not corruption, not unmeasurable, and NOT a pass. exit 4.
 *   `CARRIED`       at least one sample carried or re-encoded, and no absence.
 *   `UNREACHABLE`   reads failed; excluded from any verdict rather than guessed at. exit 2.
 *   `NO-VERDICT`    every sample was absent in the STAGED archive too, so the run proved nothing
 *                   about this layer. Pass `--at` points where the layer actually has data.
 *
 * @param {Array<{verdict:string, staged:number|null|'unreachable'}>} rows rows for ONE layer
 */
export function layerVerdict(rows) {
  const of = (...v) => rows.filter((r) => v.includes(r.verdict));
  const informative = of('carried', 're-encoded');
  const lost = of('LOST');
  // ⭐ THE ARM THE TOOL DID NOT HAVE. `not-published` / `claim-unknown` are only ever reached from
  // `classify`'s "staged has a tile, live does not" branch, so every one of these rows is a tile we
  // BAKED and did not ship. That is a measured absence, and it is the finding — never a pass.
  const absent = of('not-published', 'claim-unknown');
  const unreachable = of('unreachable');
  const stagedBytes = absent.reduce((n, r) => n + (typeof r.staged === 'number' ? r.staged : 0), 0);
  const base = {
    samples: rows.length, informative: informative.length, lost: lost.length,
    absent: absent.length, unreachable: unreachable.length, stagedBytes,
  };
  if (lost.length > 0) return { ...base, state: 'LOST' };
  if (absent.length > 0) return { ...base, state: informative.length > 0 ? 'PARTIAL' : 'NOT-PUBLISHED' };
  if (informative.length > 0) return { ...base, state: 'CARRIED' };
  if (unreachable.length > 0) return { ...base, state: 'UNREACHABLE' };
  return { ...base, state: 'NO-VERDICT' };
}

/** The run's exit code, from the per-layer states. Highest severity wins; 0 only if every layer CARRIED. */
export function exitCodeFor(states) {
  if (states.includes('LOST')) return 1;                                   // corruption
  if (states.includes('PARTIAL') || states.includes('NOT-PUBLISHED')) return 4;  // measured absence
  if (states.includes('UNREACHABLE') || states.includes('NO-VERDICT')) return 2; // nothing established
  return 0;
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

  // ⭐ §ABSENCE-IS-A-FINDING (L-13271) — PER LAYER. See `layerVerdict` for what this replaced and
  // why: the old block aggregated every row of the run, so one carried layer discharged the burden
  // for all the others and four unpublished layers exited 0 behind one published one.
  const verdicts = layers.map((l) => [l, layerVerdict(rows.filter((r) => r.layer === l))]);
  const code = exitCodeFor(verdicts.map(([, v]) => v.state));

  if (!JSON_OUT) {
    const lost = rows.filter((r) => r.verdict === 'LOST');
    console.log(`\n  ${rows.length} sample(s): ${rows.filter((r) => r.verdict === 'carried').length} carried · ` +
      `${rows.filter((r) => r.verdict === 're-encoded').length} re-encoded · ${lost.length} LOST · ` +
      `${rows.filter((r) => r.verdict === 'agree-empty').length} agree-empty · ` +
      `${rows.filter((r) => r.verdict === 'not-published').length} not-published · ` +
      `${rows.filter((r) => r.verdict === 'claim-unknown').length} claim-unknown · ` +
      `${rows.filter((r) => r.verdict === 'unreachable').length} unreachable`);

    // ⭐ THE ROLL-UP IS IN THE VERDICT, NOT THE DETAIL. "1 informative sample" used to be the only
    // clue that 34 of 35 rows established nothing, and it was printed as a reassurance.
    const MARK = { CARRIED: '✔', LOST: '✖', PARTIAL: '✖', 'NOT-PUBLISHED': '✖', UNREACHABLE: '⚠', 'NO-VERDICT': '⚠' };
    console.log('\n  per layer — each layer is its OWN question; one layer\'s pass never answers another\'s:');
    for (const [l, v] of verdicts) {
      const detail = v.state === 'NOT-PUBLISHED' || v.state === 'PARTIAL'
        ? `${v.absent} tile(s) staged (${v.stagedBytes} B) with NOTHING live`
        : v.state === 'NO-VERDICT'
          ? `0 of ${v.samples} sample(s) informative — the staged archive is empty at every point too`
          : `${v.informative} of ${v.samples} sample(s) informative`;
      console.log(`    ${MARK[v.state] ?? '·'} ${l.padEnd(10)} ${v.state.padEnd(14)} ${detail}`);
    }
  }

  for (const r of rows.filter((x) => x.verdict === 'LOST')) {
    console.error(`✖ LOST — ${r.layer} z${r.z}/${r.x}/${r.y}: staged has ${r.staged} B, the LIVE archive has no tile.`);
  }
  if (rows.some((r) => r.verdict === 'LOST')) {
    console.error('  The merge listed this region but did not carry its bytes. The manifest is claiming coverage the map does not have.');
  }
  // ⛔ THE ARM THE TOOL DID NOT HAVE. A layer whose bytes are baked and NOT on the live map is a
  // MEASURED ABSENCE — not corruption (exit 1), not unmeasurable (exit 2), and never a pass. It gets
  // its own code so a caller can tell "publish it" from "investigate it" from "sample it better".
  const missing = verdicts.filter(([, v]) => v.state === 'NOT-PUBLISHED' || v.state === 'PARTIAL');
  if (missing.length > 0) {
    console.error(`\n✖ NOT ON THE LIVE MAP — ${missing.length} layer(s): ${missing.map(([l]) => l).join(', ')}`);
    for (const [l, v] of missing) {
      console.error(`  ${l}: ${v.absent} sampled tile(s) have bytes in tiles-staging/${region}/ and NOTHING in the live archive` +
        `${v.state === 'PARTIAL' ? ` — and ${v.informative} other sample(s) DID carry, so this layer is HALF published` : ''}.`);
    }
    console.error('  The bake is done and the publish is not. This is an EMPTINESS, not a loss — and it is');
    console.error('  still a finding: §CONTEXT-DATA-HONESTY, a failure and an emptiness never share a value.');
  }
  for (const [l, v] of verdicts.filter(([, x]) => x.state === 'UNREACHABLE')) {
    console.error(`⚠ ${l}: ${v.unreachable} sample(s) UNREACHABLE — excluded from the verdict, and NOT counted as lost.`);
  }
  for (const [l, v] of verdicts.filter(([, x]) => x.state === 'NO-VERDICT')) {
    console.error(`⚠ ${l}: NO VERDICT — all ${v.samples} sample(s) were absent in the STAGED archive too, so this run`);
    console.error(`  established nothing about ${l}. Pass --at points where ${l} actually has data.`);
    console.error('  (Printing "0 lost" here would be a gate that passes by measuring nothing.)');
  }

  const carried = verdicts.filter(([, v]) => v.state === 'CARRIED');
  if (carried.length > 0) {
    const inf = carried.reduce((n, [, v]) => n + v.informative, 0);
    console.log(`\n✔ CARRIED — ${carried.length} layer(s): ${carried.map(([l]) => l).join(', ')} ` +
      `(${inf} informative sample(s) of ${rows.length} taken, 0 lost).`);
  }
  process.exit(code);
}
