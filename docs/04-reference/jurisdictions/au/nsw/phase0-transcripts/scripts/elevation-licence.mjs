// §ELEVATION-LICENCE (round 3) — every machine-readable place an ArcGIS service can carry a
// licence: service copyrightText, layer copyrightText, /info/iteminfo (licenseInfo,
// accessInformation), the portal item search. Closing PHASE0 blocker 10's second half.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../elevation-licence-probe.json');
const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
const get = (u, t = 40000) => new Promise((r) => {
  const q = https.get(u, { agent, timeout: t, headers: { Accept: 'application/json,text/html' } }, (x) => {
    let b = '';
    x.setEncoding('utf8');
    x.on('data', (c) => { if (b.length < 2000000) b += c; });
    x.on('end', () => { try { r({ s: x.statusCode, j: JSON.parse(b), raw: null }); } catch { r({ s: x.statusCode, j: null, raw: b }); } });
  });
  q.on('timeout', () => q.destroy(new Error('t')));
  q.on('error', (e) => r({ s: 0, err: String(e) }));
});
const ROOT = 'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Elevation_and_Depth_Theme';
const out = { probedAt: new Date().toISOString().slice(0, 10), probes: {} };
const pick = (j) => j && ({
  copyrightText: j.copyrightText, description: j.description?.slice?.(0, 400), serviceDescription: j.serviceDescription?.slice?.(0, 400),
  licenseInfo: j.licenseInfo, accessInformation: j.accessInformation, documentInfo: j.documentInfo, name: j.name, title: j.title, snippet: j.snippet, tags: j.tags,
});
const urls = {
  mapServer: `${ROOT}/MapServer?f=json`,
  featureServer: `${ROOT}/FeatureServer?f=json`,
  layer0: `${ROOT}/MapServer/0?f=json`,
  layer2: `${ROOT}/MapServer/2?f=json`,
  mapIteminfo: `${ROOT}/MapServer/info/iteminfo?f=json`,
  featIteminfo: `${ROOT}/FeatureServer/info/iteminfo?f=json`,
  portalSearch: `https://portal.spatial.nsw.gov.au/portal/sharing/rest/search?q=NSW_Elevation_and_Depth_Theme&f=json&num=10`,
  portalSearch2: `https://portal.spatial.nsw.gov.au/portal/sharing/rest/search?q=${encodeURIComponent('title:"NSW Elevation and Depth Theme"')}&f=json&num=10`,
};
for (const [k, u] of Object.entries(urls)) {
  const r = await get(u);
  const v = {
    status: r.s, picked: pick(r.j),
    results: r.j?.results?.map((x) => ({ id: x.id, title: x.title, type: x.type, licenseInfo: x.licenseInfo, accessInformation: x.accessInformation, url: x.url, owner: x.owner })) ?? null,
    error: r.j?.error ?? r.err ?? null, rawHead: r.raw?.slice(0, 300) ?? null,
  };
  out.probes[k] = v;
  console.log(`\n=== ${k} → ${r.s}`);
  console.log(JSON.stringify(v, null, 1).slice(0, 2500));
}
// Follow any portal item found to its full item JSON (licenseInfo lives on the ITEM).
const items = [...(out.probes.portalSearch?.results || []), ...(out.probes.portalSearch2?.results || [])];
const seen = new Set();
for (const it of items) {
  if (seen.has(it.id) || seen.size >= 8) continue;
  seen.add(it.id);
  const r = await get(`https://portal.spatial.nsw.gov.au/portal/sharing/rest/content/items/${it.id}?f=json`);
  out.probes[`item_${it.id}`] = { status: r.s, title: r.j?.title, type: r.j?.type, url: r.j?.url, licenseInfo: r.j?.licenseInfo, accessInformation: r.j?.accessInformation, snippet: r.j?.snippet, error: r.j?.error ?? null };
  console.log(`\n=== item ${it.id} "${r.j?.title}" (${r.j?.type}) url=${r.j?.url}\n  licenseInfo: ${JSON.stringify(r.j?.licenseInfo)}\n  accessInformation: ${JSON.stringify(r.j?.accessInformation)}`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
