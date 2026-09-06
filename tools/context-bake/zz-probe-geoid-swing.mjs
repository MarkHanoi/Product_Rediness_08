#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// §GEOID-CONSTANT-CANNOT-SPAN-A-NATION (L-12975) — MEASURE THE ERROR BEFORE FIXING IT.
//
// For every terrain row in terrain.mjs — the 122 §11 NATIONAL_REGIONS rows AND the 592 §1b city
// rows — read the TRUE EGM2008 separation N(lon,lat) across the row's OWN bbox and print:
//   N at the row's anchor (the probe city for a region; the bbox centre for a city),
//   N min / max across the bbox, and the resulting worst-case Z error if ONE constant is used.
//
// HOW IT IS MEASURED (C57 §1.5 — the exact source of every number):
//   • The sampler is terrain.mjs's OWN `loadGeoidGrid()`, imported, not reimplemented. Same
//     bilinear pixel-centre interpolation the default `--geoid egm08` bake applies per post.
//   • The grid is the SAME artefact the bake reads: the NGA EGM2008 2.5′ geoid COG published by
//     the PROJ CDN, `https://cdn.proj.org/us_nga_egm08_25.tif` (8640×4321 @ 0.0416667°,
//     80,585,622 B, Accept-Ranges: bytes, Content-Type image/tiff). Pass `--tif <path>` to read a
//     LOCAL copy of that identical file (offline, byte-for-byte the same grid); with no --tif the
//     probe range-reads the CDN exactly as a bake does.
//   • ACCURACY OF THE GRID ITSELF: EGM2008 is NGA's 2190-degree spherical-harmonic geoid model;
//     the 2.5′ grid is its official tabulation. NGA's published global RMS against GPS/levelling
//     is ~0.11 m over well-surveyed regions and worse (metre-level) where the underlying gravity
//     data is sparse. So a per-post EGM2008 lift is decimetre-honest, and every swing this probe
//     reports as ">1 m" is real signal well above that noise floor. Licence: EGM2008 is US
//     Government work released without restriction; the PROJ CDN grid ships under PROJ's
//     data licence (public-domain / permissive, keyless, no attribution requirement for use).
//
// ⛔ WHAT THIS PROBE NEVER DOES: it never invents an N. A row whose bbox cannot be windowed is
//    printed as REFUSED, not as 0.
//
// USAGE:
//   node zz-probe-geoid-swing.mjs [--tif <local us_nga_egm08_25.tif>] [--json] [--cities]
// ─────────────────────────────────────────────────────────────────────────────
import { NATIONAL_REGIONS, REGIONS, TERRAIN_SOURCES, loadGeoidGrid } from './terrain.mjs';

const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const has = (f) => argv.includes(f);

/** geotiff module facade: `fromUrl` reads the LOCAL file when --tif is given (identical grid). */
async function geotiffModule(tifPath) {
  const gt = await import('geotiff');
  if (!tifPath) return gt;
  return { ...gt, fromUrl: async () => gt.fromFile(tifPath) };
}

/** Dense sample of N over `bbox`, at ~the grid's own 2.5′ post spacing (min 8 steps/axis). */
function swingOverBbox(sample, [w, s, e, n], resDeg) {
  const nx = Math.max(8, Math.ceil((e - w) / resDeg) + 1);
  const ny = Math.max(8, Math.ceil((n - s) / resDeg) + 1);
  let mn = Infinity, mx = -Infinity, mnAt = null, mxAt = null;
  for (let j = 0; j < ny; j++) {
    const lat = s + (n - s) * (ny === 1 ? 0 : j / (ny - 1));
    for (let i = 0; i < nx; i++) {
      const lon = w + (e - w) * (nx === 1 ? 0 : i / (nx - 1));
      const v = sample(lon, lat);
      if (!Number.isFinite(v)) continue;
      if (v < mn) { mn = v; mnAt = [lon, lat]; }
      if (v > mx) { mx = v; mxAt = [lon, lat]; }
    }
  }
  if (!Number.isFinite(mn)) return null;
  return { minN: mn, maxN: mx, minAt: mnAt, maxAt: mxAt, samples: nx * ny };
}

const f2 = (v) => (v == null ? '  n/a' : v.toFixed(2).padStart(7));

async function main() {
  const tif = val('--tif');
  const gt = await geotiffModule(tif);
  console.log(`# EGM2008 N swing per terrain row — grid: ${tif ? `LOCAL ${tif}` : 'https://cdn.proj.org/us_nga_egm08_25.tif'}`);
  console.log(`# sampler: terrain.mjs loadGeoidGrid() (the production --geoid egm08 path), bilinear, pixel-centre\n`);

  const out = { generatedAt: new Date().toISOString(), grid: tif ?? 'https://cdn.proj.org/us_nga_egm08_25.tif', regions: [], cities: [] };

  // ── §11 NATIONAL_REGIONS ────────────────────────────────────────────────────
  console.log('## NATIONAL_REGIONS (122 rows) — constant vs truth across the row\'s own bbox');
  console.log('row                  group        spanDeg     const   N@anchor  Nmin    Nmax    swing  |worstErr|');
  for (const r of NATIONAL_REGIONS) {
    let g;
    try { g = await loadGeoidGrid(r.bbox, { geotiffMod: gt, padDeg: 0 }); }
    catch (e) { console.log(`${r.name.padEnd(20)} REFUSED — ${e.message}`); out.regions.push({ name: r.name, status: 'refused', reason: e.message }); continue; }
    const sw = swingOverBbox(g.sample, r.bbox, g.resDeg);
    const anchor = Array.isArray(r.probe) ? g.sample(r.probe[0], r.probe[1]) : null;
    const [w, s, e, n] = r.bbox;
    const worst = r.geoidSepM == null || !sw ? null : Math.max(Math.abs(sw.maxN - r.geoidSepM), Math.abs(sw.minN - r.geoidSepM));
    console.log(`${r.name.padEnd(20)} ${String(r.group).padEnd(12)} ${`${(e - w).toFixed(1)}x${(n - s).toFixed(1)}`.padEnd(11)}${f2(r.geoidSepM)} ${f2(anchor)}  ${f2(sw?.minN)} ${f2(sw?.maxN)} ${f2(sw ? sw.maxN - sw.minN : null)} ${f2(worst)}`);
    out.regions.push({ name: r.name, group: r.group, bbox: r.bbox, constant: r.geoidSepM, probeCity: r.probeCity, probe: r.probe,
      nAtAnchor: anchor == null ? null : +anchor.toFixed(3), minN: sw ? +sw.minN.toFixed(3) : null, maxN: sw ? +sw.maxN.toFixed(3) : null,
      minAt: sw?.minAt, maxAt: sw?.maxAt, swingM: sw ? +(sw.maxN - sw.minN).toFixed(3) : null, worstErrM: worst == null ? null : +worst.toFixed(3),
      samples: sw?.samples ?? 0, status: 'ok' });
  }

  // ── §1b city REGIONS (each baked with ONE per-COUNTRY constant) ─────────────
  if (has('--cities')) {
    console.log('\n## §1b city REGIONS (592 rows) — the per-COUNTRY constant vs truth over the CITY bbox');
    console.log('city                 src  const   N@centre  Nmin    Nmax    swing  |worstErr|');
    for (const c of REGIONS) {
      const src = TERRAIN_SOURCES[c.source];
      const k = src?.geoidSepM;
      let g;
      try { g = await loadGeoidGrid(c.bbox, { geotiffMod: gt, padDeg: 0.5 }); }
      catch (e) { console.log(`${c.name.padEnd(20)} REFUSED — ${e.message}`); out.cities.push({ name: c.name, status: 'refused', reason: e.message }); continue; }
      const sw = swingOverBbox(g.sample, c.bbox, g.resDeg / 4);
      const [w, s, e, n] = c.bbox;
      const centre = g.sample((w + e) / 2, (s + n) / 2);
      const worst = k == null || !sw ? null : Math.max(Math.abs(sw.maxN - k), Math.abs(sw.minN - k));
      console.log(`${c.name.padEnd(20)} ${c.source.padEnd(4)}${f2(k)} ${f2(centre)}  ${f2(sw?.minN)} ${f2(sw?.maxN)} ${f2(sw ? sw.maxN - sw.minN : null)} ${f2(worst)}`);
      out.cities.push({ name: c.name, source: c.source, bbox: c.bbox, constant: k ?? null,
        nAtCentre: centre == null ? null : +centre.toFixed(3), minN: sw ? +sw.minN.toFixed(3) : null, maxN: sw ? +sw.maxN.toFixed(3) : null,
        swingM: sw ? +(sw.maxN - sw.minN).toFixed(3) : null, worstErrM: worst == null ? null : +worst.toFixed(3), status: 'ok' });
    }
  }

  if (has('--json')) console.log('\n' + JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
