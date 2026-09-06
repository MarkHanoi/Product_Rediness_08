#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// §GEOID-REBAKE-RANK (L-12977) — WHICH of the live city tilesets actually need re-baking after
// §GEOID-PER-TILE-DATUM (L-12975), in what order, and — said just as plainly — WHICH DO NOT.
//
// zz-probe-geoid-swing.mjs answers "how wrong is the constant for every ROW IN THE TABLE". That is not
// the founder's question. His question is "what do I re-bake", and three facts stand between the two:
//   (1) a row in the table is not a tileset — 9 of the 592 city rows have NOTHING live on R2, and two
//       more (riyadh/jeddah) have an ORPHAN tileset no current code path can even reproduce;
//   (2) the 122 NATIONAL_REGIONS rows were baked per-post from the day they existed (a75be0fb,
//       2026-09-04, `geoidMode = 'egm08'` default; terrain-bake-regions.yml passes no override), so
//       their swing column is the error a constant WOULD have made and NOT an error that shipped;
//   (3) NL is a deliberate carve-out (§GEOID-NL-STAYS-NAP) — AHN is NAP, and NAP is not EGM2008.
// This script joins the probe's measured swing to those three facts and to a MEASURED weight, and
// prints the re-bake waves plus the exact dispatch strings.
//
// HOW EACH NUMBER IS OBTAINED (C57 §1.5 — no modelled value is presented as measured):
//   • |ΔZ| and swing — MEASURED by zz-probe-geoid-swing.mjs from the NGA EGM2008 2.5′ COG the bake
//     itself reads (cdn.proj.org/us_nga_egm08_25.tif). This script never recomputes N; it consumes
//     that probe's `--json`, so the two can never disagree.
//   • LIVE / NOT LIVE — MEASURED by an HTTP GET of `<R2 public base>/tiles/terrain/<slug>/layer.json`.
//     The exact status code is recorded. A 429 is a RATE LIMIT, not an absence, and is retried; it is
//     never folded into "missing" (failure ≠ empty).
//   • WEIGHT — there is NO user telemetry in this repo, so "users served" CANNOT be measured and is
//     not claimed. The stand-in is RESIDENTS INSIDE THE ROW'S OWN BBOX, summed from GeoNames
//     `cities5000.txt` (CC BY 4.0, © GeoNames) — the same corpus the §ES-ALL-MUNI city list came from.
//     It is a PROXY for exposure and is labelled as one everywhere it is printed.
//
// USAGE (the probe first, then this):
//   node zz-probe-geoid-swing.mjs --tif <us_nga_egm08_25.tif> --cities --json > swing.txt
//   sed -n '/^{/,$p' swing.txt > swing.json          # the JSON tail of that run
//   node zz-rank-geoid-rebake.mjs --swing swing.json [--geonames cities5000.txt] [--threshold 1.0]
//                                 [--live live.json] [--no-probe]
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const val = (f, d = null) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const has = (f) => argv.includes(f);

/** The public R2 origin the bake workflows verify against (terrain-bake.yml `R2_BASE`). */
const R2_BASE = 'https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev/tiles/terrain/';

/** GET `layer.json` for one slug. A 429 is retried — a rate limit is not an absence (C57 §1.9). */
async function probeSlug(slug) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(`${R2_BASE}${slug}/layer.json`, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.status === 429) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); continue; }
      if (r.status === 200) await r.text();
      return { status: r.status, lastModified: r.headers.get('last-modified') };
    } catch (e) { if (attempt === 3) return { status: 0, error: `${e.name}: ${e.message}` }; }
  }
  return { status: 429, note: 'still rate-limited after 4 attempts — UNKNOWN, not absent' };
}

async function probeAll(slugs) {
  const out = new Map(); let i = 0;
  const worker = async () => { for (;;) { const k = i++; if (k >= slugs.length) return; out.set(slugs[k], await probeSlug(slugs[k])); } };
  await Promise.all(Array.from({ length: 16 }, worker));
  return out;
}

/** Residents inside `bbox` from GeoNames cities5000 (a PROXY for exposure, never a user count). */
function loadPopulation(path) {
  if (!path) return null;
  const pts = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    const lat = +f[4], lon = +f[5], pop = +f[14];
    if (Number.isFinite(lat) && Number.isFinite(lon) && pop > 0) pts.push([lon, lat, pop]);
  }
  return (b) => { let s = 0; for (const [lon, lat, pop] of pts) if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]) s += pop; return s; };
}

async function main() {
  const swingPath = val('--swing');
  if (!swingPath) { console.error('need --swing <the JSON tail of zz-probe-geoid-swing.mjs --cities --json>'); process.exit(1); }
  const swing = JSON.parse(readFileSync(swingPath, 'utf8'));
  const threshold = Number(val('--threshold', '1.0'));
  const popOf = loadPopulation(val('--geonames'));

  const live = val('--live') ? new Map(Object.entries(JSON.parse(readFileSync(val('--live'), 'utf8'))))
    : has('--no-probe') ? new Map()
      : await probeAll(swing.cities.map((c) => c.name));

  const rows = swing.cities.map((c) => {
    const L = live.get(c.name);
    return {
      ...c,
      liveStatus: L?.status ?? null,
      lastModified: L?.lastModified ?? null,
      errCentreM: c.constant == null || c.nAtCentre == null ? null : +Math.abs(c.nAtCentre - c.constant).toFixed(3),
      popInBbox: popOf ? popOf(c.bbox) : null,
    };
  });

  const notLive = rows.filter((r) => r.liveStatus !== null && r.liveStatus !== 200);
  const orphan = rows.filter((r) => r.liveStatus === 200 && r.constant == null);
  const nl = rows.filter((r) => r.liveStatus === 200 && r.source === 'nl');
  const pop = rows.filter((r) => r.liveStatus === 200 && r.source !== 'nl' && r.constant != null);

  console.log(`# §GEOID-REBAKE-RANK — swing measured ${swing.generatedAt} from ${swing.grid}`);
  console.log(`# R2 liveness probed ${new Date().toISOString()} against ${R2_BASE}\n`);
  console.log(`rows in table              ${rows.length}`);
  console.log(`  NOT live on R2           ${notLive.length}  (${notLive.map((r) => `${r.name}:${r.liveStatus}`).join(' ') || '—'})`);
  console.log(`  live but NO datum        ${orphan.length}  (${orphan.map((r) => r.name).join(' ') || '—'}) — orphan tilesets; no current path re-bakes them`);
  console.log(`  live, NL carve-out       ${nl.length}  (${nl.map((r) => r.name).join(' ') || '—'}) — §GEOID-NL-STAYS-NAP, NAP ≠ EGM2008`);
  console.log(`  ⇒ RE-BAKE POPULATION     ${pop.length}\n`);

  const band = (lo, hi) => pop.filter((r) => r.errCentreM >= lo && r.errCentreM < hi);
  console.log('## |ΔZ| at the row centre — the constant-vs-truth offset that SHIPPED');
  for (const [lo, hi] of [[10, Infinity], [5, 10], [3, 5], [1, 3], [0.5, 1], [0.25, 0.5], [0, 0.25]]) {
    const b = band(lo, hi);
    const p = popOf ? ` · ${(b.reduce((a, r) => a + r.popInBbox, 0) / 1e6).toFixed(2)} M residents in-bbox (PROXY)` : '';
    console.log(`  ${String(lo).padStart(5)} ≤ |ΔZ| < ${hi === Infinity ? '  ∞' : String(hi).padStart(4)} m : ${String(b.length).padStart(3)} rows${p}`);
  }
  const sw = pop.map((r) => r.swingM).sort((a, b) => a - b);
  const q = (f) => sw[Math.floor((sw.length - 1) * f)];
  console.log(`\n## within-bbox SWING — the part a constant can NEVER represent (a false tilt across the row)`);
  console.log(`  min ${sw[0].toFixed(2)} · p50 ${q(0.5).toFixed(2)} · p95 ${q(0.95).toFixed(2)} · max ${sw[sw.length - 1].toFixed(2)} m`);

  const need = pop.filter((r) => r.errCentreM >= threshold).sort((a, b) => (b.errCentreM * (b.popInBbox ?? 1)) - (a.errCentreM * (a.popInBbox ?? 1)));
  const leave = pop.filter((r) => r.errCentreM < threshold);
  console.log(`\n## THRESHOLD ${threshold} m → RE-BAKE ${need.length}, LEAVE ${leave.length} ALONE`);
  console.log('rank city                 src  |ΔZ|c  worst  swing  pop-in-bbox(PROXY)');
  need.forEach((r, i) => console.log(`${String(i + 1).padStart(4)} ${r.name.padEnd(21)} ${r.source.padEnd(4)} ${r.errCentreM.toFixed(2).padStart(5)} ${r.worstErrM.toFixed(2).padStart(6)} ${r.swingM.toFixed(2).padStart(6)}  ${String(r.popInBbox ?? '—').padStart(9)}`));

  console.log(`\n## DISPATCH — paste into terrain-bake.yml \`city\` (the loop word-splits, so a list is one run)`);
  for (const [name, lo, hi] of [['WAVE 1  |ΔZ| ≥ 5 m', 5, Infinity], ['WAVE 2  3–5 m', 3, 5], ['WAVE 3  1–3 m', 1, 3]]) {
    const w = need.filter((r) => r.errCentreM >= lo && r.errCentreM < hi);
    if (!w.length) continue;
    console.log(`\n### ${name} — ${w.length} cities`);
    console.log(w.map((r) => r.name).join(' '));
  }
  console.log(`\n## LEAVE ALONE (|ΔZ| < ${threshold} m) — ${leave.length} cities, worst ${Math.max(...leave.map((r) => r.worstErrM)).toFixed(2)} m anywhere in any of their bboxes`);
  console.log(leave.map((r) => r.name).sort().join(' '));

  if (has('--json')) console.log('\n' + JSON.stringify({ threshold, generatedAt: new Date().toISOString(), swingGeneratedAt: swing.generatedAt, need, leave, notLive, orphan, nl }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
