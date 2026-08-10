import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const stage0 = JSON.parse(fs.readFileSync(path.join(DIR, '_stage0_siu.json'), 'utf8'));
const byIne = Object.fromEntries(stage0.map((m) => [m.ine, m]));
const BASE = 'https://idem.comunidad.madrid/geoserver3/wfs';
async function get(u) {
  try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); return { http: r.status, ok: r.ok, body: await r.text() }; }
  catch (e) { return { http: null, ok: false, body: '', err: String(e.name || e) }; }
}
const out = { schema: null, muni: [] };
// 1. field list
{
  const r = await get(`${BASE}?service=WFS&version=2.0.0&request=DescribeFeatureType&typenames=${encodeURIComponent('sitcm:VPLA_V_ORDENANZA')}`);
  out.schema = r.ok ? [...r.body.matchAll(/name="([^"]+)"\s+(?:minOccurs[^>]*)?type="([^"]+)"/g)].map((m) => m[1] + ':' + m[2]) : 'FAIL ' + r.http;
  console.error('SCHEMA', JSON.stringify(out.schema).slice(0, 900));
}
// 2. one sample to learn the municipality key
{
  const r = await get(`${BASE}?service=WFS&version=2.0.0&request=GetFeature&typenames=${encodeURIComponent('sitcm:VPLA_V_ORDENANZA')}&count=1&outputFormat=${encodeURIComponent('application/json')}`);
  try { const j = JSON.parse(r.body); console.error('SAMPLE', JSON.stringify(j.features?.[0]?.properties).slice(0, 700)); out.sample = j.features?.[0]?.properties; }
  catch { console.error('SAMPLE FAIL', r.http, r.body.slice(0, 200)); }
}
// 3. per-municipality, trying plausible keys
const KEYS = ['CD_INE', 'CODINE', 'COD_INE', 'CD_MUNICIPIO', 'MUNICIPIO', 'CDMUN', 'CD_MUN', 'INE'];
for (const ine of ['28023', '28047', '28113', '28058', '28065']) {
  const m = byIne[ine];
  const rec = { ine, name: m.name, tries: [] };
  for (const k of KEYS) {
    for (const val of [`'${ine}'`, `${Number(ine)}`, `'${ine.slice(2)}'`]) {
      const u = `${BASE}?service=WFS&version=2.0.0&request=GetFeature&typenames=${encodeURIComponent('sitcm:VPLA_V_ORDENANZA')}&CQL_FILTER=${encodeURIComponent(`${k}=${val}`)}&count=2&outputFormat=${encodeURIComponent('application/json')}`;
      const r = await get(u);
      if (r.ok && r.body.trim().startsWith('{')) {
        try {
          const j = JSON.parse(r.body); const n = (j.features || []).length;
          if (n) { rec.hit = { key: k, val, n, props: j.features[0].properties }; break; }
        } catch { /* §SWALLOW-PROBE — a body that does not parse as JSON means this key/value guess missed; `rec.hit` stays unset and the miss is what gets reported */ }
      }
    }
    if (rec.hit) break;
  }
  // fallback: bbox then post-filter
  if (!rec.hit) {
    const e = m.extent;
    const u = `${BASE}?service=WFS&version=2.0.0&request=GetFeature&typenames=${encodeURIComponent('sitcm:VPLA_V_ORDENANZA')}&bbox=${e.xmin},${e.ymin},${e.xmax},${e.ymax},EPSG:4326&count=5&outputFormat=${encodeURIComponent('application/json')}`;
    const r = await get(u);
    try { const j = JSON.parse(r.body); rec.bbox = { n: (j.features || []).length, props: j.features?.[0]?.properties }; } catch { rec.bbox = 'FAIL ' + r.http + ' ' + r.body.slice(0, 120); }
  }
  out.muni.push(rec);
  console.error(ine, m.name.padEnd(20), rec.hit ? 'HIT ' + rec.hit.key + ' n=' + rec.hit.n : 'bbox=' + JSON.stringify(rec.bbox).slice(0, 300));
}
fs.writeFileSync(path.join(DIR, '_round9.json'), JSON.stringify(out, null, 1));
