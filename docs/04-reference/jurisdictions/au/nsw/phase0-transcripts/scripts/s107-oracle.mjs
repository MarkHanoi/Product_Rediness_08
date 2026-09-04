// §S107-ORACLE (round 4) — the s10.7(2) planning certificate as an INDEPENDENT reading of the
// same law (§PROBE-CAN-BE-WRONG-THREE-WAYS). Round 3 proved City of Sydney publishes no HOB layer
// of its own, so the council-AGOL oracle failed. This probe asks the two remaining candidates:
//
//   A. The NSW Planning Portal ePlanning DATA API surface (api.apps1.nsw.gov.au/eplanning/data/v0).
//      The Spatial Viewer's own back end. If `FetchEPILayers` answers for a lot id, that is the
//      STATE's own per-property answer to "which instruments and controls apply here" — the exact
//      content s10.7(2) certifies, machine-readable, free, and published by the same authority.
//   B. A named council's online planning-certificate endpoint.
//
// ⛔ WHAT THIS PROBE MAY NOT CONCLUDE. A 200 is not a licence and a JSON body is not a certificate.
// s10.7(2) is a STATUTORY document issued by a council under EP&A Act s10.7; an API that happens to
// return the same numbers is a CROSS-CHECK, not a certificate, and must be reported as such.
import fs from 'node:fs'; import path from 'node:path'; import https from 'node:https';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../s107-oracle-probe.json');
const agent = new https.Agent({ keepAlive: true, maxSockets: 4 });
function req(url, headers = {}) {
  return new Promise((r) => {
    const u = new URL(url);
    const q = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/html;q=0.8', ...headers },
      timeout: 45000, agent }, (x) => {
      let b = ''; x.setEncoding('utf8');
      x.on('data', (c) => { if (b.length < 4000000) b += c; });
      x.on('end', () => { try { r({ s: x.statusCode, j: JSON.parse(b), raw: null, len: b.length }); }
        catch { r({ s: x.statusCode, j: null, raw: b.slice(0, 600), len: b.length }); } });
    });
    q.on('timeout', () => q.destroy(new Error('timeout')));
    q.on('error', (e) => r({ s: 0, err: String(e) }));
    q.end();
  });
}
const out = { probedAt: new Date().toISOString().slice(0, 10), armA: {}, armB: {}, verdict: null };

// ── ARM A: the ePlanning data API. Two fixture parcels with a KNOWN Principal/14 reading. ──────
// 5//DP240402   Sydney LEP 2012 HOB 12 m (cl 4.3) + Alternative HOB 25 (layer 771)
// 54//DP1259000 Sydney LEP 2012 HOB 110 m (cl 4.3)
const V0 = 'https://api.apps1.nsw.gov.au/eplanning/data/v0';
const LOTS = [
  { label: '5//DP240402', lot: '5//DP240402', lon: 151.19913072882292, lat: -33.8984423075379, stateHob: '12 m cl 4.3' },
  { label: '54//DP1259000', lot: '54//DP1259000', lon: 151.21091413732495, lat: -33.86284388257842, stateHob: '110 m cl 4.3' },
];
const ATTEMPTS = [
  (l) => ({ name: 'fetchGeometry(lot)', url: `${V0}/FetchGeometry?id=${encodeURIComponent(l.lot)}&Type=lot` }),
  (l) => ({ name: 'address(lot)', url: `${V0}/Address?a=${encodeURIComponent(l.lot)}&noOfRecords=5` }),
  (l) => ({ name: 'fetchEPILayers(point)', url: `${V0}/FetchEPILayers?id=${l.lon},${l.lat}` }),
  (l) => ({ name: 'fetchLandusePermissibility', url: `${V0}/FetchLandusePermissibility?id=${encodeURIComponent(l.lot)}` }),
  (l) => ({ name: 'principalPlanningLayers', url: `${V0}/GetPrincipalPlanningLayers?id=${encodeURIComponent(l.lot)}` }),
];
for (const l of LOTS) {
  out.armA[l.label] = { state: l, attempts: [] };
  for (const mk of ATTEMPTS) {
    const a = mk(l);
    const r = await req(a.url);
    const rec = { name: a.name, url: a.url, status: r.s, len: r.len ?? null,
      topKeys: r.j && typeof r.j === 'object' ? Object.keys(Array.isArray(r.j) ? (r.j[0] ?? {}) : r.j).slice(0, 30) : null,
      body: r.j ? JSON.stringify(r.j).slice(0, 2500) : null, raw: r.raw ?? null, err: r.err ?? null };
    out.armA[l.label].attempts.push(rec);
    console.log(`A ${l.label} · ${a.name}: ${r.s} len=${r.len ?? 0} keys=${JSON.stringify(rec.topKeys)}`);
    if (rec.body) console.log('   ', rec.body.slice(0, 400));
    if (rec.raw) console.log('   raw:', rec.raw.slice(0, 200));
  }
}

// ── ARM B: named council online planning-certificate surfaces. ────────────────────────────────
const COUNCILS = [
  { name: 'City of Sydney — planning certificate page', url: 'https://www.cityofsydney.nsw.gov.au/development-applications/planning-certificates' },
  { name: 'NSW Planning Portal — planning certificate info', url: 'https://www.planningportal.nsw.gov.au/opendata/dataset' },
];
for (const c of COUNCILS) {
  const r = await req(c.url);
  out.armB[c.name] = { url: c.url, status: r.s, len: r.len ?? null, isJson: !!r.j,
    head: (r.raw ?? (r.j ? JSON.stringify(r.j) : '')).slice(0, 500), err: r.err ?? null };
  console.log(`B ${c.name}: ${r.s} len=${r.len ?? 0} json=${!!r.j}`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
