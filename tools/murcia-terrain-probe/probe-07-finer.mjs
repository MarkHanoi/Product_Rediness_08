// PROBE 07 — is anything FINER than MDT05 reachable for Murcia?
//
// Candidates: an MDT02 coverage, the CNIG Centro de Descargas (PNOA LiDAR point cloud), and the
// Región de Murcia regional IDE (CARTOMUR / IDERM).
//
// HONESTY RULE for this probe: a host that does not resolve, or a path that 404s, proves only that
// THIS URL did not serve THIS request. It is recorded as `not-found-at-this-url` / UNKNOWN — never
// as "the dataset does not exist". Only a live 200 with a parseable payload earns VERIFIED.
//
// Run:  node tools/murcia-terrain-probe/probe-07-finer.mjs

import { probeFetch, owsException, saveJson, SITE } from './lib.mjs';

const out = { site: SITE, probedAt: new Date().toISOString(), checks: [] };

async function check(id, url, note, { accept = 'text/xml,application/xml,text/html,*/*' } = {}) {
  const r = await probeFetch(url, { label: id, accept, timeoutMs: 45_000 });
  const exc = r.ok ? owsException(r.text) : null;
  const covIds = [...(r.text ?? '').matchAll(/<(?:wcs:)?CoverageId>([^<]+)<\/(?:wcs:)?CoverageId>/g)].map((m) => m[1]);
  const wmsNames = [...new Set([...(r.text ?? '').matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]))];
  const rec = {
    id, url, note,
    status: r.status ?? null, kind: r.kind, contentType: r.contentType ?? null, bytes: r.bytes ?? 0,
    error: r.error ?? null, exception: exc,
    coverageIds: covIds, layerNames: wmsNames.slice(0, 40),
    verdict: r.kind === 'network' ? 'host-unreachable-or-dns-fail'
      : r.kind === 'timeout' ? 'timeout'
        : !r.ok ? `http-${r.status}`
          : exc ? 'ows-exception' : 'reachable-200',
    head: r.head?.slice(0, 200) ?? null,
  };
  out.checks.push(rec);
  console.log(`\n[${id}] ${rec.verdict}  HTTP ${rec.status} ${rec.contentType} ${rec.bytes}B`);
  if (covIds.length) console.log('  CoverageIds:', covIds.join(', '));
  else if (wmsNames.length) console.log('  Layers:', wmsNames.slice(0, 25).join(', '));
  else if (rec.head) console.log('  head:', rec.head.slice(0, 160));
  if (rec.error) console.log('  error:', rec.error.slice(0, 160));
  return rec;
}

// ── A. An MDT02 coverage on the national INSPIRE elevation WCS? ─────────────────────────────────
// Probe 01 enumerated the coverage list: the finest advertised was *_5. Re-assert by ASKING for a
// _2 coverage explicitly — a DescribeCoverage on a non-existent id returns an OWS exception, which
// is POSITIVE evidence of absence from THIS service (not evidence MDT02 does not exist nationally).
for (const id of ['Elevacion25830_2', 'Elevacion4258_2']) {
  await check(`mdt02-describe-${id}`, `https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=DescribeCoverage&COVERAGEID=${id}`,
    'Does the national INSPIRE elevation WCS carry a 2 m coverage?');
}

// ── B. CNIG Centro de Descargas — the PNOA LiDAR / MDT02 file route ─────────────────────────────
await check('cnig-centrodescargas', 'https://centrodedescargas.cnig.es/CentroDescargas/index.jsp',
  'CNIG Centro de Descargas landing — the tiled LAZ / MDT file distribution point.');
await check('cnig-descargas-root', 'https://centrodedescargas.cnig.es/CentroDescargas/',
  'CNIG Centro de Descargas root.');

// ── C. Región de Murcia regional IDE (CARTOMUR / IDERM) ─────────────────────────────────────────
await check('iderm-root', 'https://iderm.imida.es/', 'IDERM — Infraestructura de Datos Espaciales de la Región de Murcia.');
await check('cartomur-root', 'http://www.cartomur.com/', 'CARTOMUR — Región de Murcia cartographic portal.');
await check('iderm-wms-caps', 'https://iderm.imida.es/geoserver/ows?service=WMS&request=GetCapabilities',
  'IDERM GeoServer WMS capabilities (if a GeoServer is published at this path).');
await check('iderm-wcs-caps', 'https://iderm.imida.es/geoserver/ows?service=WCS&request=GetCapabilities&version=2.0.1',
  'IDERM GeoServer WCS capabilities — would carry any regional high-res DTM.');

// ── D. The national elevation WMS — does it advertise a finer layer than the WCS? ───────────────
await check('ign-mdt-wms', 'https://servicios.idee.es/wms-inspire/mdt?SERVICE=WMS&REQUEST=GetCapabilities',
  'INSPIRE elevation WMS — check whether any layer beats 5 m.');

saveJson('out-07-finer.json', out);
console.log('\nwrote out-07-finer.json');
