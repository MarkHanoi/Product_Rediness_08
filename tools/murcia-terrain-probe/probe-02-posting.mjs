// PROBE 02 — VERIFY THE POSTING SPACING from the service's own DescribeCoverage.
//
// ⚠ THE V8 TRAP. A coverage NAMED "_5" is not evidence of a 5 m posting. The only honest evidence is
// the grid geometry the service publishes: the RectifiedGrid offsetVector pair (ground distance per
// pixel step) together with the GridEnvelope and the domain envelope. This probe reads those and
// derives the spacing arithmetically, then states what that spacing can and cannot resolve for a
// ~935 m² plot (~30 m across).
//
// Run:  node tools/murcia-terrain-probe/probe-02-posting.mjs

import { probeFetch, owsException, saveJson, SITE } from './lib.mjs';

const TARGETS = [
  { svc: 'https://servicios.idee.es/wcs-inspire/mdt', id: 'Elevacion25830_5',  claim: 'MDT05 in ETRS89/UTM30N' },
  { svc: 'https://servicios.idee.es/wcs-inspire/mdt', id: 'Elevacion25830_25', claim: 'MDT25 in ETRS89/UTM30N' },
  { svc: 'https://servicios.idee.es/wcs-inspire/mdt', id: 'Elevacion4258_5',   claim: 'MDT05 in ETRS89 geographic' },
  { svc: 'https://wcs-mds.idee.es/mds',               id: 'mdsn_e025',         claim: 'MDS normalizado Edificacion 2.5 m' },
  { svc: 'https://wcs-mds.idee.es/mds',               id: 'mds05',             claim: 'MDS surface 5 m' },
];

/** Pull the grid geometry facts out of a WCS 2.0.1 DescribeCoverage document. */
function parseGrid(xml) {
  const grab = (re) => { const m = xml.match(re); return m ? m[1].trim().replace(/\s+/g, ' ') : null; };
  const low  = grab(/<(?:gml:)?low>([^<]+)<\/(?:gml:)?low>/i);
  const high = grab(/<(?:gml:)?high>([^<]+)<\/(?:gml:)?high>/i);
  const lc   = grab(/<(?:gml:)?lowerCorner>([^<]+)<\/(?:gml:)?lowerCorner>/i);
  const uc   = grab(/<(?:gml:)?upperCorner>([^<]+)<\/(?:gml:)?upperCorner>/i);
  const offsets = [...xml.matchAll(/<(?:gml:)?offsetVector[^>]*>([^<]+)<\/(?:gml:)?offsetVector>/gi)]
    .map((m) => m[1].trim().split(/\s+/).map(Number));
  const origin = grab(/<(?:gml:)?[Pp]os>([^<]+)<\/(?:gml:)?[Pp]os>/);
  const srs = grab(/srsName="([^"]+)"/);
  const axisLabels = grab(/axisLabels="([^"]+)"/);
  const uom = grab(/uomLabels="([^"]+)"/);
  const fields = [...xml.matchAll(/<(?:swe:)?field[^>]*name="([^"]+)"/gi)].map((m) => m[1]);
  const nil = [...xml.matchAll(/<(?:swe:)?nilValue[^>]*>([^<]+)</gi)].map((m) => m[1].trim());
  const formats = [...new Set([...xml.matchAll(/<(?:wcs:)?(?:supported)?[Ff]ormat>([^<]+)</g)].map((m) => m[1].trim()))];
  return { srs, axisLabels, uom, low, high, lowerCorner: lc, upperCorner: uc, origin, offsets, fields, nilValues: nil, formats };
}

/** Posting spacing = the magnitude of each offsetVector (ground units moved per one pixel step). */
function spacingFromOffsets(offsets) {
  if (!offsets?.length) return null;
  return offsets.map((v) => Math.hypot(...v.map((x) => Number(x) || 0)));
}

/** Cross-check: (envelope span) / (grid cell count) must agree with the offsetVector magnitude. */
function spacingFromEnvelope(g) {
  if (!g.lowerCorner || !g.upperCorner || !g.low || !g.high) return null;
  const lo = g.lowerCorner.split(' ').map(Number), hi = g.upperCorner.split(' ').map(Number);
  const gl = g.low.split(' ').map(Number), gh = g.high.split(' ').map(Number);
  return lo.map((_, i) => {
    const span = hi[i] - lo[i];
    const cells = (gh[i] - gl[i]) + 1;
    return cells > 0 ? span / cells : null;
  });
}

const rows = [];
for (const t of TARGETS) {
  const url = `${t.svc}?SERVICE=WCS&VERSION=2.0.1&REQUEST=DescribeCoverage&COVERAGEID=${t.id}`;
  const r = await probeFetch(url, { label: `describe:${t.id}`, accept: 'text/xml' });
  const exc = r.ok ? owsException(r.text) : null;
  const g = r.ok && !exc ? parseGrid(r.text) : null;
  const offSpacing = g ? spacingFromOffsets(g.offsets) : null;
  const envSpacing = g ? spacingFromEnvelope(g) : null;
  rows.push({ ...t, url, status: r.status, kind: r.kind, bytes: r.bytes, lengthMismatch: r.lengthMismatch,
    exception: exc, grid: g, postingFromOffsetVectors: offSpacing, postingFromEnvelopeDivGrid: envSpacing,
    head: r.head?.slice(0, 200) });

  console.log(`\n[${t.id}] HTTP ${r.status} ${r.bytes}B  (${t.claim})`);
  if (exc) { console.log('  OWS EXCEPTION:', exc.slice(0, 200)); continue; }
  if (!g) { console.log('  head:', r.head?.slice(0, 200)); continue; }
  console.log(`  srsName          : ${g.srs}`);
  console.log(`  axisLabels/uom   : ${g.axisLabels} / ${g.uom}`);
  console.log(`  gridEnvelope     : low[${g.low}] high[${g.high}]`);
  console.log(`  domainEnvelope   : LC[${g.lowerCorner}] UC[${g.upperCorner}]`);
  console.log(`  offsetVectors    : ${JSON.stringify(g.offsets)}`);
  console.log(`  POSTING (offsets): ${offSpacing?.map((v) => v.toFixed(6)).join(' x ')}`);
  console.log(`  POSTING (env/grid): ${envSpacing?.map((v) => v == null ? 'n/a' : Math.abs(v).toFixed(6)).join(' x ')}`);
  console.log(`  rangeType fields : ${g.fields.join(',')}  nil=${g.nilValues.join(',')}`);
}

saveJson('out-02-posting.json', { site: SITE, probedAt: new Date().toISOString(), rows });
console.log('\nwrote out-02-posting.json');
