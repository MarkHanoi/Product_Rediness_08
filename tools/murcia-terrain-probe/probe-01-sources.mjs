// PROBE 01 — enumerate the elevation coverages IGN/CNIG actually serves, and establish the
// POSTING SPACING of each from the service's own DescribeCoverage (not from a doc, not from a name).
//
// This is the probe that governs everything else: if the finest keyless posting is coarse relative
// to a ~935 m² plot, every slope/aspect number downstream is instrumentally meaningless.
//
// Run:  node tools/murcia-terrain-probe/probe-01-sources.mjs

import { probeFetch, owsException, saveJson, SITE } from './lib.mjs';

const CANDIDATES = [
  { id: 'ign-inspire-mdt-wcs', url: 'https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCapabilities',
    note: 'IGN INSPIRE Elevation WCS — the endpoint PRYZM ES terrain already uses (Elevacion4258_25).' },
  { id: 'ign-mds-wcs', url: 'https://wcs-mds.idee.es/mds?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCapabilities',
    note: 'CNIG MDS (surface) WCS — carries mdsn_e025 building nDSM per heightSources.mjs.' },
  { id: 'ign-inspire-mdt-wms', url: 'https://servicios.idee.es/wms-inspire/mdt?SERVICE=WMS&REQUEST=GetCapabilities',
    note: 'INSPIRE Elevation WMS sibling — layer list often names the MDT resolutions.' },
];

const rows = [];
for (const c of CANDIDATES) {
  const r = await probeFetch(c.url, { label: c.id, accept: 'text/xml,application/xml' });
  const exc = r.ok ? owsException(r.text) : null;
  // Coverage ids (WCS 2.0.1 CoverageSummary/CoverageId) and WMS layer names.
  const covIds = [...(r.text ?? '').matchAll(/<(?:wcs:)?CoverageId>([^<]+)<\/(?:wcs:)?CoverageId>/g)].map((m) => m[1]);
  const wmsLayers = [...(r.text ?? '').matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
  rows.push({
    id: c.id, note: c.note, url: c.url,
    status: r.status, kind: r.kind, contentType: r.contentType, bytes: r.bytes,
    lengthMismatch: r.lengthMismatch, exception: exc,
    coverageIds: covIds, wmsLayerNames: [...new Set(wmsLayers)].slice(0, 60),
    head: r.head?.slice(0, 220),
  });
  console.log(`\n[${c.id}] HTTP ${r.status} ${r.contentType} ${r.bytes}B mismatch=${r.lengthMismatch} exc=${exc ? 'YES' : 'no'}`);
  if (covIds.length) console.log('  CoverageIds:', covIds.join(', '));
  if (!covIds.length && wmsLayers.length) console.log('  WMS layer Names:', [...new Set(wmsLayers)].slice(0, 40).join(', '));
  if (!covIds.length && !wmsLayers.length) console.log('  head:', r.head?.slice(0, 300));
}

saveJson('out-01-sources.json', { site: SITE, probedAt: new Date().toISOString(), rows });
console.log('\nwrote out-01-sources.json');
