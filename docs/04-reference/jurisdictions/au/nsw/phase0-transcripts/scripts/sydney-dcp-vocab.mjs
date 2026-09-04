// §SYDNEY-DCP-VOCAB (round 3) — the CLOSED vocabularies the DCP consumer needs: every distinct
// SetbackType (layers 3, 12), Storeys (5, 7), Section (4, 16), and the per-feature Date range.
// Plus the AGOL org's service list: does City of Sydney publish its OWN LEP HOB (an independent
// source for the 10.7 oracle question)?
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../sydney-dcp-vocab.json');
const agent = new https.Agent({ keepAlive: true, maxSockets: 6 });
const get = (u, t = 40000) => new Promise((r) => {
  const q = https.get(u, { agent, timeout: t }, (x) => {
    let b = '';
    x.setEncoding('utf8');
    x.on('data', (c) => { if (b.length < 4000000) b += c; });
    x.on('end', () => { try { r({ s: x.statusCode, j: JSON.parse(b) }); } catch { r({ s: x.statusCode, j: null, raw: b.slice(0, 300) }); } });
  });
  q.on('timeout', () => q.destroy(new Error('t')));
  q.on('error', (e) => r({ s: 0, err: String(e) }));
});
const ORG = 'https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services';
const SYD = `${ORG}/Sydney_Development_Control_Plan_2012/FeatureServer`;
const out = { probedAt: new Date().toISOString().slice(0, 10), service: SYD, vocab: {}, orgServices: null };
const fmt = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString().slice(0, 10) : null);
async function distinct(layer, field) {
  const stats = encodeURIComponent(JSON.stringify([{ statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'n' }]));
  const r = await get(`${SYD}/${layer}/query?where=1%3D1&groupByFieldsForStatistics=${field}&outStatistics=${stats}&f=json`);
  const rows = (r.j?.features || []).map((f) => f.attributes).sort((a, b) => b.n - a.n);
  const dstats = encodeURIComponent(JSON.stringify([
    { statisticType: 'min', onStatisticField: 'Date', outStatisticFieldName: 'dmin' },
    { statisticType: 'max', onStatisticField: 'Date', outStatisticFieldName: 'dmax' },
  ]));
  const dates = await get(`${SYD}/${layer}/query?where=1%3D1&outStatistics=${dstats}&f=json`);
  const d = dates.j?.features?.[0]?.attributes || {};
  return { field, distinct: rows.length, rows, dateMin: fmt(d.dmin), dateMax: fmt(d.dmax), error: r.j?.error ?? null };
}
for (const [layer, field] of [[3, 'SetbackType'], [12, 'SetbackType'], [5, 'Storeys'], [7, 'Storeys'], [4, 'Section'], [16, 'Section'], [3, 'DCP_Name'], [7, 'DCP_Name']]) {
  const v = await distinct(layer, field);
  out.vocab[`${layer}.${field}`] = v;
  console.log(`\n=== layer ${layer} · ${field}: ${v.distinct} distinct · dates ${v.dateMin}..${v.dateMax}${v.error ? ' ERROR ' + JSON.stringify(v.error) : ''}`);
  for (const r of v.rows) console.log(`   ${String(r.n).padStart(5)}  ${JSON.stringify(r[field])}`);
}
const org = await get(`${ORG}?f=json`);
const names = (org.j?.services || []).map((s) => s.name);
out.orgServices = { count: names.length, planning: names.filter((n) => /LEP|Height|Zoning|FSR|Floor|Planning|DCP|Heritage/i.test(n)), all: names };
console.log(`\n=== AGOL org services: ${names.length}; planning-looking: ${JSON.stringify(out.orgServices.planning, null, 1)}`);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
