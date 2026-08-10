/**
 * Q2 - DOES MUIB RESOLVE A UNIQUE GOVERNING INSTRUMENT FOR A PARCEL?
 *
 * ⭐ THIS IS THE `R` MEASUREMENT. THE AMBIGUITY RATE IS THE ANSWER.
 *
 * SAMPLE FRAME IS INDEPENDENT OF MUIB. Parcels come from the Spanish Catastro
 * INSPIRE WFS, NOT from MUIB. Sampling points out of a MUIB layer and then
 * asking whether MUIB covers them would be tautological - that is exactly
 * PROBE-DISCIPLINE artefact #1 (computed maxVolume, then compared it to itself).
 *
 * Two independent classifications per parcel:
 *   (a) CENTROID  - point-in-polygon at the parcel's representative point
 *   (b) FOOTPRINT - polygon intersect with the whole parcel ring
 * (b) is the honest test for envelope purposes: a parcel that STRADDLES two
 * zones is genuinely ambiguous even when its centroid is not. Reporting both
 * shows how much of the resolution is an artefact of using a point.
 *
 * Errors, sea/no-cadastre rejects and genuine zeroes are counted SEPARATELY (R5).
 *
 * Run:  node tools/balears-muib-probe/q2-routing-sample.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agsGet, rng, sleep, EsriError } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const _HERE = path.dirname(fileURLToPath(import.meta.url));

// ── REPRODUCIBILITY ──────────────────────────────────────────────────────────
const SEED = 20260802;
const TARGET_PER_ISLAND = { Mallorca: 60, Menorca: 20, Eivissa: 20, Formentera: 10 };
const MAX_DRAWS_PER_ISLAND = 900;

const QUAL = 10, RUSTIC = 11, CLASSIF = 12, GESTIO = 8;
const ISLAND_BBOX = {
  Mallorca: { lon: [2.28, 3.55], lat: [39.24, 40.00] },
  Menorca: { lon: [3.75, 4.35], lat: [39.78, 40.12] },
  Eivissa: { lon: [1.18, 1.68], lat: [38.82, 39.16] },
  Formentera: { lon: [1.35, 1.62], lat: [38.60, 38.82] },
};

const census = JSON.parse(fs.readFileSync(path.join(OUT, 'q3-municipal-census.json'), 'utf8'));
const muniByIsland = {};
for (const m of Object.values(census.municipalities)) {
  (muniByIsland[m.island] ||= []).push(m);
}

// ── Catastro INSPIRE WFS: the INDEPENDENT parcel source ──────────────────────
async function catastroParcels(lon, lat, half = 0.0012) {
  const bbox = `${lat - half},${lon - half},${lat + half},${lon + half}`;
  const url =
    'http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0' +
    `&request=GetFeature&typeNames=cp:CadastralParcel&srsName=EPSG::4326&bbox=${bbox}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PRYZM-balears-muib-probe/1.0' } });
  const xml = await res.text();
  if (!res.ok) throw new Error(`Catastro HTTP ${res.status}`);
  if (/<ows:Exception/i.test(xml)) throw new Error('Catastro OWS exception');
  const out = [];
  const re = /<cp:CadastralParcel gml:id="([^"]+)"[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g;
  let m;
  while ((m = re.exec(xml))) {
    const nums = m[2].trim().split(/\s+/).map(Number);
    // Catastro posList in EPSG:4326 is lat lon. ArcGIS wants x=lon, y=lat.
    const ring = [];
    for (let i = 0; i + 1 < nums.length; i += 2) ring.push([nums[i + 1], nums[i]]);
    if (ring.length >= 4) out.push({ ref: m[1].replace(/^ES\.SDGC\.CP\./, ''), ring });
  }
  return out;
}

// Signed area (shoelace). ArcGIS wants a CLOCKWISE exterior ring.
function signedArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
function centroidOf(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-14) {
    const s = ring.reduce((p, c) => [p[0] + c[0], p[1] + c[1]], [0, 0]);
    return [s[0] / ring.length, s[1] / ring.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

const OUTF = ['CODIMUNI', 'MUNICIPI', 'CODIPLA', 'CODIAJ', 'CODIMUIB', 'CODICLAS', 'URL', 'OBS', 'NOM'];

async function atPoint(layer, lon, lat, fields) {
  const b = await agsGet(`/${layer}/query`, {
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: fields.join(','), returnGeometry: 'false', where: '1=1',
  });
  return (b.features || []).map((f) => f.attributes);
}
async function atPolygon(layer, ring, fields) {
  const r = signedArea(ring) > 0 ? [...ring].reverse() : ring; // clockwise exterior
  const b = await agsGet(`/${layer}/query`, {
    geometry: JSON.stringify({ rings: [r], spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPolygon', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: fields.join(','), returnGeometry: 'false', where: '1=1',
  });
  return (b.features || []).map((f) => f.attributes);
}

const uniq = (rows, f) => [...new Set(rows.map((r) => r[f]).filter((v) => v != null && v !== ''))];
const classify = (n) => (n === 0 ? 'NONE' : n === 1 ? 'UNIQUE' : 'AMBIGUOUS');

const result = {
  probe: 'q2-routing-sample',
  runAt: new Date().toISOString(),
  seed: SEED,
  targetPerIsland: TARGET_PER_ISLAND,
  sampleFrame: 'Catastro INSPIRE WFS cp:CadastralParcel - INDEPENDENT of MUIB',
  method: 'seeded uniform draw in municipality extent -> nearest Catastro parcel -> MUIB point + footprint query',
  parcels: [],
  rejects: { seaOrNoCadastre: 0, offIsland: 0, catastroError: 0, muibError: 0 },
  rejectDetail: [],
};

const rand = rng(SEED);

for (const [island, target] of Object.entries(TARGET_PER_ISLAND)) {
  const munis = muniByIsland[island] || [];
  let got = 0, draws = 0;
  while (got < target && draws < MAX_DRAWS_PER_ISLAND) {
    draws++;
    const mu = munis[Math.floor(rand() * munis.length)];
    const e = mu.extent4326;
    const lon = e.xmin + rand() * (e.xmax - e.xmin);
    const lat = e.ymin + rand() * (e.ymax - e.ymin);

    let parcels;
    try {
      parcels = await catastroParcels(lon, lat);
    } catch (err) {
      result.rejects.catastroError++;
      result.rejectDetail.push({ island, lon, lat, reason: 'catastroError', msg: String(err.message) });
      await sleep(600);
      continue;
    }
    if (!parcels.length) { result.rejects.seaOrNoCadastre++; await sleep(250); continue; }

    const p = parcels[Math.floor(rand() * parcels.length)];
    const [clon, clat] = centroidOf(p.ring);
    const bb = ISLAND_BBOX[island];
    if (clon < bb.lon[0] || clon > bb.lon[1] || clat < bb.lat[0] || clat > bb.lat[1]) {
      result.rejects.offIsland++; await sleep(150); continue;
    }

    const rec = { island, cadastralRef: p.ref, lon: +clon.toFixed(6), lat: +clat.toFixed(6), drawnInMuni: mu.municipi };
    try {
      const [gP, qP, rP, cP] = [
        await atPoint(GESTIO, clon, clat, OUTF),
        await atPoint(QUAL, clon, clat, OUTF),
        await atPoint(RUSTIC, clon, clat, OUTF),
        await atPoint(CLASSIF, clon, clat, ['CODIMUNI', 'MUNICIPI', 'CODICLAS']),
      ];
      const [gF, qF] = [await atPolygon(GESTIO, p.ring, OUTF), await atPolygon(QUAL, p.ring, OUTF)];

      rec.point = {
        gestio: { n: gP.length, instruments: uniq(gP, 'CODIPLA'), class: classify(uniq(gP, 'CODIPLA').length) },
        qualificacions: {
          n: qP.length, instruments: uniq(qP, 'CODIPLA'), zones: uniq(qP, 'CODIMUIB'),
          class: classify(uniq(qP, 'CODIPLA').length),
          zoneClass: classify(uniq(qP, 'CODIMUIB').length),
          urls: uniq(qP, 'URL'), obs: uniq(qP, 'OBS'),
        },
        rustic: { n: rP.length, obs: uniq(rP, 'OBS').length > 0 },
        classificacio: { n: cP.length, classes: uniq(cP, 'CODICLAS'), munis: uniq(cP, 'MUNICIPI') },
      };
      rec.footprint = {
        gestio: { n: gF.length, instruments: uniq(gF, 'CODIPLA'), class: classify(uniq(gF, 'CODIPLA').length) },
        qualificacions: {
          n: qF.length, instruments: uniq(qF, 'CODIPLA'), zones: uniq(qF, 'CODIMUIB'),
          class: classify(uniq(qF, 'CODIPLA').length),
          zoneClass: classify(uniq(qF, 'CODIMUIB').length),
        },
      };
      rec.muni = rec.point.classificacio.munis[0] || null;
      rec.soilClass = rec.point.qualificacions.n ? (uniq(qP, 'CODICLAS')[0] || null) : (uniq(cP, 'CODICLAS')[0] || null);
    } catch (err) {
      result.rejects.muibError++;
      result.rejectDetail.push({ island, ref: p.ref, reason: 'muibError', msg: String(err.message), cls: err instanceof EsriError ? 'esri-error-in-200' : 'transport' });
      await sleep(400);
      continue;
    }

    result.parcels.push(rec);
    got++;
    process.stderr.write(
      `${island.padEnd(11)} ${String(got).padStart(3)}/${target} ${rec.cadastralRef.padEnd(16)} ${String(rec.muni).padEnd(22)} ` +
      `Q:${rec.point.qualificacions.class}/${rec.footprint.qualificacions.class} G:${rec.point.gestio.class} cls=${rec.soilClass}\n`,
    );
    await sleep(200);
  }
  process.stderr.write(`--- ${island}: ${got}/${target} after ${draws} draws\n`);
}

// ── AGGREGATE: the R measurement ─────────────────────────────────────────────
function summarise(list, pick) {
  const s = { UNIQUE: 0, AMBIGUOUS: 0, NONE: 0 };
  for (const p of list) s[pick(p)]++;
  const n = list.length || 1;
  return { n: list.length, ...s, uniquePct: +((100 * s.UNIQUE) / n).toFixed(2), ambiguousPct: +((100 * s.AMBIGUOUS) / n).toFixed(2), nonePct: +((100 * s.NONE) / n).toFixed(2) };
}
const P = result.parcels;
result.summary = {
  total: P.length,
  byIsland: Object.fromEntries(Object.keys(TARGET_PER_ISLAND).map((i) => [i, P.filter((p) => p.island === i).length])),
  point_qual_instrument: summarise(P, (p) => p.point.qualificacions.class),
  footprint_qual_instrument: summarise(P, (p) => p.footprint.qualificacions.class),
  point_qual_zone: summarise(P, (p) => p.point.qualificacions.zoneClass),
  footprint_qual_zone: summarise(P, (p) => p.footprint.qualificacions.zoneClass),
  point_gestio: summarise(P, (p) => p.point.gestio.class),
  footprint_gestio: summarise(P, (p) => p.footprint.gestio.class),
  bySoilClass: Object.fromEntries(
    [...new Set(P.map((p) => p.soilClass))].map((c) => [
      String(c), summarise(P.filter((p) => p.soilClass === c), (p) => p.footprint.qualificacions.class),
    ]),
  ),
  parcelsWithNormativaUrl: P.filter((p) => p.point.qualificacions.urls.length > 0).length,
  parcelsUnderObsWarning: P.filter((p) => p.point.qualificacions.obs.length > 0).length,
  parcelsUnderRusticPtiFlag: P.filter((p) => p.point.rustic.obs).length,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'q2-routing-sample.json'), JSON.stringify(result, null, 2));
console.error('\n=== SUMMARY ===');
console.error(JSON.stringify(result.summary, null, 2));
console.error('=== REJECTS (counted separately, never folded into a rate) ===');
console.error(JSON.stringify(result.rejects, null, 2));
