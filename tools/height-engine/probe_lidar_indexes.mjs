#!/usr/bin/env node
// PHASE 4 — reproducible live-probe of the national open-LiDAR index/download services.
// Reachability is VERIFIED live; density + licence are characterised from each programme's spec
// (ESTIMATED). Run: `node tools/height-engine/probe_lidar_indexes.mjs`. Never fabricates a result.
async function probe(url, { timeoutMs = 25000, headers = {} } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctl.signal, headers });
    const ct = r.headers.get('content-type') || '';
    let body = '';
    try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
    return { ok: r.ok, status: r.status, ct, sample: body.replace(/\s+/g, ' ').trim() };
  } catch (e) {
    return { ok: false, status: 0, err: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

// One canonical, keyless-first endpoint per country (the one recorded in registry.py COUNTRY_SOURCES).
const SERVICES = {
  'NL AHN (PDOK ATOM)': 'https://service.pdok.nl/rws/ahn/atom/dsm_05m.xml',
  'DK DHM (Datafordeler WMS, keyless)': 'https://services.datafordeler.dk/DHMNedboer/dhm/1.0.0/WMS?service=WMS&request=GetCapabilities',
  'CH swissSURFACE3D (STAC v1)': 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swisssurface3d',
  'NO NDH (hoydedata ArcGIS REST)': 'https://hoydedata.no/arcgis/rest/services?f=json',
  'FR IGN LiDAR HD (geopf WFS)': 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&REQUEST=GetCapabilities',
  'ES PNOA-LiDAR (CNIG portal)': 'https://centrodedescargas.cnig.es/CentroDescargas/',
  'US 3DEP (TNM products API, bbox query)': 'https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Lidar%20Point%20Cloud%20(LPC)&bbox=-105.3,40.0,-105.2,40.1&max=2',
  'US 3DEP (usgs-lidar-public S3)': 'https://usgs-lidar-public.s3.amazonaws.com/?list-type=2&max-keys=2',
};

const run = async () => {
  for (const [name, url] of Object.entries(SERVICES)) {
    const r = await probe(url);
    const verdict = r.ok ? 'REACHABLE-KEYLESS' : (r.status === 401 || r.status === 403 ? 'AUTH-GATED' : `UNREACHABLE(${r.status})`);
    console.log(`${verdict.padEnd(20)} ${name}`);
    console.log(`   ${url}`);
    console.log(`   status=${r.status} ct=${r.ct ?? ''} ${r.err ? 'err=' + r.err : ''}`);
    if (r.sample) console.log(`   sample: ${r.sample.slice(0, 140)}`);
  }
};
run();
