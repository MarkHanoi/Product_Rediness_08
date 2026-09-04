// §LICENCE-CKAN (round 3) — the HTML pages 403 a plain fetch; CKAN's JSON action API is the same
// record without the WAF. license_title / license_id are the fields that answer blocker 10.
import fs from 'node:fs'; import path from 'node:path'; import https from 'node:https'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';
const get = (u) => new Promise((r) => { const q = https.get(u, { timeout: 45000, headers: { 'User-Agent': UA, Accept: 'application/json,text/html' } }, (x) => { let b = ''; x.setEncoding('utf8'); x.on('data', (c) => { if (b.length < 3000000) b += c; }); x.on('end', () => { try { r({ s: x.statusCode, j: JSON.parse(b) }); } catch { r({ s: x.statusCode, j: null, raw: b }); } }); }); q.on('timeout', () => q.destroy(new Error('t'))); q.on('error', (e) => r({ s: 0, err: String(e) })); });
const out = { probedAt: new Date().toISOString().slice(0, 10), probes: {} };
const pick = (p) => p && ({ title: p.title, license_title: p.license_title, license_id: p.license_id, license_url: p.license_url, organization: p.organization?.title, author: p.author, maintainer: p.maintainer, metadata_modified: p.metadata_modified, update_freq: p.update_frequency ?? p.frequency ?? null, notes: (p.notes || '').slice(0, 600), resources: (p.resources || []).map((x) => ({ name: x.name, format: x.format, url: x.url })), extras: (p.extras || []).filter((e) => /licen|attribution|copyright|terms|access/i.test(e.key + e.value)).slice(0, 12) });
for (const [k, u] of Object.entries({
  nsw_theme_service: 'https://data.nsw.gov.au/data/api/3/action/package_show?id=1-85ca688f5e9c43e28363dda4bbf23d42',
  nsw_theme_profile: 'https://data.nsw.gov.au/data/api/3/action/package_show?id=nsw-foundation-spatial-data-framework-elevation-and-depth-theme-profile',
  nsw_theme_alt: 'https://data.nsw.gov.au/data/api/3/action/package_show?id=1-a9acf411599c4d0c8c91fc2ef0f99f5f',
  gov_au: 'https://data.gov.au/data/api/3/action/package_show?id=nsw-1-ca62b4699e5d43119617a9dce5bbe0c4',
  nsw_search: 'https://data.nsw.gov.au/data/api/3/action/package_search?q=%22Elevation+and+Depth%22+Spatial+Services&rows=10',
  spatial_copyright_html: 'https://www.spatial.nsw.gov.au/copyright',
  portal_tos_html: 'https://portal.spatial.nsw.gov.au/portal/apps/sites/#/homepage/pages/terms-of-service',
})) {
  const r = await get(u);
  let v;
  if (r.j?.result) v = r.j.result.results ? { count: r.j.result.count, items: r.j.result.results.map((p) => ({ name: p.name, title: p.title, license_title: p.license_title, org: p.organization?.title })) } : pick(r.j.result);
  else v = { raw: r.raw ? r.raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500) : null, err: r.err ?? r.j?.error ?? null };
  out.probes[k] = { status: r.s, ...v };
  console.log(`\n=== ${k} → ${r.s}\n${JSON.stringify(v, null, 1).slice(0, 2200)}`);
}
fs.writeFileSync(path.resolve(HERE, '../licence-ckan-probe.json'), JSON.stringify(out, null, 1));
