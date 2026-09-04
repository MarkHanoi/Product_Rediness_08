// §NSW-TERRAIN-DCP-PROBE — two named Phase 0 blockers, probed rather than assumed.
//  (10) ELVIS / Spatial Services elevation: does an endpoint exist and what does it SAY it is?
//  (§9) Council digital DCPs: are the three named sites actually APIs?
// ⛔ Never invent an endpoint. Every URL below is either published in the build prompt or
// discovered from a service's own root document. A 404/403 is a RESULT and is recorded as one.
import fs from 'node:fs';
import https from 'node:https';

const agent = new https.Agent({ keepAlive: true, maxSockets: 6 });
function head(url, timeout = 25000) {
  return new Promise((res) => {
    const req = https.get(url, { agent, timeout }, (r) => {
      let b = ''; r.setEncoding('utf8');
      r.on('data', (c) => { if (b.length < 60000) b += c; });
      r.on('end', () => res({ status: r.statusCode, ctype: r.headers['content-type'] || null, body: b }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => res({ status: 0, err: String(e) }));
  });
}

const TARGETS = [
  // Elevation — NSW Spatial Services published REST roots.
  ['elevation-root', 'https://portal.spatial.nsw.gov.au/server/rest/services?f=json'],
  ['elevation-folder', 'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Elevation_and_Depth_Theme?f=json'],
  // Council digital DCPs named in build prompt §9.
  ['sydney-dcp-root', 'https://sydneyplanning.maps.arcgis.com/sharing/rest?f=json'],
  ['newcastle-dcp', 'https://dcp.newcastle.nsw.gov.au/'],
  ['portstephens-dcp', 'https://dcp.portstephens.nsw.gov.au/'],
];

const out = { probedAt: new Date().toISOString().slice(0, 10), results: {} };
for (const [name, url] of TARGETS) {
  const r = await head(url);
  let summary = null;
  try {
    const j = JSON.parse(r.body || '');
    summary = {
      services: Array.isArray(j.services) ? j.services.map((s) => s.name).slice(0, 40) : undefined,
      folders: Array.isArray(j.folders) ? j.folders.slice(0, 40) : undefined,
      currentVersion: j.currentVersion,
      error: j.error?.message,
    };
  } catch { summary = { htmlBytes: (r.body || '').length, titleHint: ((r.body || '').match(/<title>([^<]*)<\/title>/i) || [])[1] || null }; }
  out.results[name] = { url, status: r.status, ctype: r.ctype, err: r.err ?? null, summary };
  console.log(`${name}  status=${r.status}  ${JSON.stringify(summary).slice(0, 320)}`);
}
fs.writeFileSync('../terrain-dcp-probe.json', JSON.stringify(out, null, 1));
