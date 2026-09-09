#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PRYZM baked-context height-provenance SWEEP — many points, one table, one verdict.
// §CTX-HEIGHT-PROVENANCE (L-459) · §CONTEXT-DATA-HONESTY (L-581/L-616) · C57.
//
// WHY THIS EXISTS, and why it is not a second probe. `probe.mjs` answers "how much of what I see
// HERE is real?" for ONE point. That is the right unit for a gate row, and the wrong unit for the
// question a region raises: **is this region uniformly good, or is it good where I happened to look?**
//
// It was written because that difference bit, hard, and the bake could not see it.
// Lane DELAWARE-R2, 2026-09-09, measured against the staged `delaware` bake (run 34397872497):
//   · bake.mjs's own §MEASURED-HEIGHT-GATE printed `✔ delaware (usas): 21979/112354 measured` and
//     PASSED. One number, statewide, 19.6 % — green.
//   · the founder's demo site at Lewes (38.781987,-75.089744) read **0 measured of 48 footprints,
//     solidRenderFraction 0, median height 9 m** — the fabricated 9 m carpet that the workflow's
//     CITIES spot-check exists to make unshippable.
//   · Wilmington, 107 km north in the same archive, read **1227 of 1295 measured, 0.947 solid** —
//     Barcelona-grade (Barcelona reads 0.958).
// A single statewide fraction cannot distinguish "uniformly 19.6 % everywhere" from "95 % in two
// counties and 0 % in the third", and those are completely different products. The gate row model
// cannot either: it asserts a floor at ONE point, so it is satisfied by Wilmington while Lewes ships
// a carpet. Only a SPREAD answers it. That is this file.
//
// ⛔ §CONTEXT-DATA-HONESTY — this sweep never collapses a failure into an emptiness. It reports
// `probe.mjs`'s own five verdicts verbatim (`unreachable` / `not-baked` / `empty` / `unmeasured` /
// `measured`) and NEVER aggregates across them: a point the archive could not be read at is excluded
// from every fraction and counted in its own column, because averaging an unreachable point into a
// coverage number is the precise defect L-581/L-616 are named after.
//
// ⛔ IT SHELLS OUT TO probe.mjs ON PURPOSE. The repo's dominant defect is one rule with two
// implementations, where the fix lands in the copy nobody reads. There is exactly one provenance
// ladder in this repo and it lives in probe.mjs; this file must never grow a second one. If a number
// here disagrees with probe.mjs, probe.mjs is right and this file is broken.
//
// USAGE
//   node sweep.mjs --points delaware                    # a named point set (see POINT_SETS)
//   node sweep.mjs --points delaware --base <url>       # probe a STAGED archive before publishing
//   node sweep.mjs --at 38.78,-75.08 --at 39.74,-75.54  # ad-hoc points
//   node sweep.mjs --points delaware --json
//   node sweep.mjs --points delaware --require-solid 0.5   # exit 1 if any point falls below
//
// EXIT: 0 = every point reached a verdict and any --require-* floors held.
//       1 = a --require-* floor was breached (a DATA verdict).
//       2 = at least one point was `unreachable` (NO verdict — never reported as bad data).
//       3 = bad arguments.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, 'probe.mjs');

// ── named point sets ────────────────────────────────────────────────────────
// A set is a SPREAD, not a list of landmarks: points are chosen to span the axis along which
// coverage is suspected to vary, so the table can show a gradient rather than assert a level.
const POINT_SETS = {
  // Delaware runs N→S because the USAS (FEMA/ORNL) measured-height subset is NGA-LiDAR-derived and
  // its Delaware coverage follows the county line, not the state line. Every point is a populated
  // place with real footprints — an empty point proves nothing about heights.
  delaware: [
    ['wilmington', 39.7459, -75.5466, 'New Castle Co · largest city'],
    ['newark-de', 39.6837, -75.7497, 'New Castle Co · university town'],
    ['dover', 39.1582, -75.5244, 'Kent Co · state capital'],
    ['milford', 38.9126, -75.4277, 'Kent/Sussex county line'],
    ['georgetown', 38.6912, -75.4032, 'Sussex Co · county seat'],
    ['lewes-town', 38.7746, -75.1393, 'Sussex Co · historic centre'],
    ['lewes-demo', 38.781987, -75.089744, '⭐ THE FOUNDER DEMO SITE'],
    ['rehoboth', 38.7168, -75.0760, 'Sussex Co · coastal resort'],
    ['fenwick', 38.5507, -75.0575, 'Sussex Co · southern tip'],
  ],
  // The parity control. Quoted as FRACTIONS only — every shipped feature carries a null id, so the
  // probe's seam de-duplication never runs and the absolute count is inflated 14–18.8 %.
  barcelona: [['barcelona', 41.3874, 2.1686, 'parity control']],
};

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = argv.indexOf(k);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const argAll = (k) => argv.reduce((a, v, i) => (v === k && argv[i + 1] ? [...a, argv[i + 1]] : a), []);

const JSON_OUT = argv.includes('--json');
const BASE = arg('--base');
const HALF_DEG = arg('--half-deg');
const REQUIRE_SOLID = arg('--require-solid') === null ? null : Number(arg('--require-solid'));
const REQUIRE_MEASURED = arg('--require-measured') === null ? null : Number(arg('--require-measured'));

let points = [];
for (const name of argAll('--points')) {
  const set = POINT_SETS[name];
  if (!set) {
    console.error(`sweep: unknown point set '${name}'. Known: ${Object.keys(POINT_SETS).join(', ')}`);
    process.exit(3);
  }
  points.push(...set);
}
for (const at of argAll('--at')) {
  const [lat, lon] = at.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.error(`sweep: --at needs "lat,lon", got '${at}'`);
    process.exit(3);
  }
  points.push([`at-${lat},${lon}`, lat, lon, 'ad-hoc']);
}
if (points.length === 0) {
  console.error('sweep: nothing to probe — pass --points <set> and/or --at lat,lon');
  process.exit(3);
}

// ── run ─────────────────────────────────────────────────────────────────────
function probeOne(name, lat, lon) {
  const a = [PROBE, '--at', `${lat},${lon}`, '--name', name, '--json'];
  if (BASE) a.push('--base', BASE);
  if (HALF_DEG) a.push('--half-deg', HALF_DEG);
  try {
    // probe.mjs exits 2 on `unreachable` while still printing a JSON verdict, so a non-zero exit is
    // NOT on its own an error here — parse first, and only treat unparseable output as a tool failure.
    const out = execFileSync('node', a, { encoding: 'utf8', maxBuffer: 64e6, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(out);
  } catch (e) {
    const out = e.stdout ? String(e.stdout) : '';
    try { return JSON.parse(out); } catch { /* fall through */ }
    // A TOOL failure is not a DATA verdict. Say which one this is.
    return { name, at: { lat, lon }, verdict: 'unreachable', reason: `probe.mjs did not return JSON: ${e.message}`, toolFailure: true };
  }
}

const rows = [];
for (const [name, lat, lon, note] of points) {
  const r = probeOne(name, lat, lon);
  rows.push({ ...r, note });
}

// ── report ──────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE ?? 'default (live tiles)', points: rows }, null, 2));
} else {
  console.log(`PRYZM context height-provenance SWEEP — ${rows.length} point(s)`);
  console.log(`  archive: ${BASE ?? 'default (LIVE tiles)'}`);
  console.log('');
  console.log('point           verdict      footprints  measured  assumedFrac  solidFrac  medianH  tiles r/c  note');
  for (const r of rows) {
    const p = r.provenance ?? {};
    const t = r.tiles ?? {};
    const h = r.heightStats ?? {};
    const num = (v, w, d = 3) => (v === undefined || v === null ? '—' : Number(v).toFixed(d)).padStart(w);
    console.log(
      `${String(r.name).padEnd(15)} ${String(r.verdict).padEnd(12)} ` +
        `${String(r.footprints ?? '—').padStart(10)}  ${String(p.measuredLidar ?? '—').padStart(8)}  ` +
        `${num(r.assumedFraction, 11)}  ${num(r.solidRenderFraction, 9)}  ` +
        `${String(h.median ?? '—').padStart(7)}  ${String(t.read ?? '—').padStart(3)}/${String(t.covering ?? '—').padEnd(5)} ${r.note ?? ''}`,
    );
  }

  // ⛔ The SPREAD is the point. Aggregate ONLY over points that reached a data verdict, and say how
  // many were excluded — an unreachable point averaged in is the L-581/L-616 defect.
  const dataRows = rows.filter((r) => r.verdict !== 'unreachable');
  const excluded = rows.length - dataRows.length;
  const withSolid = dataRows.filter((r) => typeof r.solidRenderFraction === 'number');
  if (withSolid.length > 0) {
    const s = withSolid.map((r) => r.solidRenderFraction).sort((a, b) => a - b);
    const worst = withSolid.reduce((a, b) => (a.solidRenderFraction <= b.solidRenderFraction ? a : b));
    const best = withSolid.reduce((a, b) => (a.solidRenderFraction >= b.solidRenderFraction ? a : b));
    console.log('');
    console.log(`  solidRenderFraction across ${withSolid.length} point(s) with a data verdict` +
      `${excluded ? ` (${excluded} unreachable, EXCLUDED — not averaged in)` : ''}:`);
    console.log(`    min ${s[0].toFixed(3)} (${worst.name})  ·  median ${s[Math.floor(s.length / 2)].toFixed(3)}  ·  max ${s[s.length - 1].toFixed(3)} (${best.name})`);
    const unmeasured = dataRows.filter((r) => r.verdict === 'unmeasured');
    if (unmeasured.length > 0) {
      console.log(`  ⚠ ${unmeasured.length}/${dataRows.length} point(s) verdict=UNMEASURED — context exists there and every height is fabricated:`);
      console.log(`      ${unmeasured.map((r) => r.name).join(', ')}`);
    }
    if (s[s.length - 1] - s[0] > 0.5) {
      console.log('  ⛔ SPREAD > 0.5 — this region is NOT uniform. A single statewide fraction, and a single');
      console.log('     gate row, would both report this region as fine. Quote the spread, never the mean.');
    }
  }
}

// ── exits ───────────────────────────────────────────────────────────────────
let rc = 0;
const unreachable = rows.filter((r) => r.verdict === 'unreachable');
if (REQUIRE_SOLID !== null) {
  const bad = rows.filter((r) => typeof r.solidRenderFraction === 'number' && r.solidRenderFraction < REQUIRE_SOLID);
  for (const r of bad) console.error(`✖ ${r.name}: solidRenderFraction ${r.solidRenderFraction} < required ${REQUIRE_SOLID}`);
  if (bad.length > 0) rc = 1;
}
if (REQUIRE_MEASURED !== null) {
  const bad = rows.filter((r) => r.verdict !== 'unreachable' && (r.measuredMarkerCount ?? 0) < REQUIRE_MEASURED);
  for (const r of bad) console.error(`✖ ${r.name}: measuredMarkerCount ${r.measuredMarkerCount ?? 0} < required ${REQUIRE_MEASURED}`);
  if (bad.length > 0) rc = 1;
}
// An unreachable point is NOT a data failure — it is the absence of a verdict, and gets its own code.
if (rc === 0 && unreachable.length > 0) {
  for (const r of unreachable) console.error(`⚠ ${r.name}: UNREACHABLE — ${r.reason ?? 'no reason given'} (no verdict; NOT a claim about the data)`);
  rc = 2;
}
process.exit(rc);
