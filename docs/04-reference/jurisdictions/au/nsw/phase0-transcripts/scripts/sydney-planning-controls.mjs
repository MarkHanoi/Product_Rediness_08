// §SYDNEY-PLANNING-CONTROLS (round 3) — City of Sydney publishes `Planning_Controls` and
// `SydneyLEP2012MapSheet` on its own AGOL org. If they carry the LEP HOB/FSR, that is an
// INDEPENDENT second reading of the same law (§PROBE-CAN-BE-WRONG-THREE-WAYS demands one) — the
// oracle role the 10.7(2) certificate was going to play, at zero cost. Proven on the fixture
// parcels whose State-served values we already hold.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../sydney-planning-controls.json');
const agent = new https.Agent({ keepAlive: true, maxSockets: 6 });
const get = (u, t = 40000) => new Promise((r) => { const q = https.get(u, { agent, timeout: t }, (x) => { let b = ''; x.setEncoding('utf8'); x.on('data', (c) => { if (b.length < 4000000) b += c; }); x.on('end', () => { try { r({ s: x.statusCode, j: JSON.parse(b) }); } catch { r({ s: x.statusCode, j: null, raw: b.slice(0, 300) }); } }); }); q.on('timeout', () => q.destroy(new Error('t'))); q.on('error', (e) => r({ s: 0, err: String(e) })); });
const ORG = 'https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services';
const out = { probedAt: new Date().toISOString().slice(0, 10), services: {}, parcels: {} };
// Fixture parcels inside the City of Sydney LGA, with the STATE's Principal/14 reading.
const PARCELS = [
  { id: '5//DP240402', lon: 151.19913072882292, lat: -33.8984423075379, stateHob: '12 m (Sydney LEP 2012, Clause 4.3)', stateAltHob: '25 (layer 771)' },
  { id: '54//DP1259000', lon: 151.21091413732495, lat: -33.86284388257842, stateHob: '110 m (Sydney LEP 2012, Clause 4.3)' },
];
for (const svc of ['Planning_Controls', 'SydneyLEP2012MapSheet', 'Property_Dcp_Lep_Amend', 'DCP_LEP_Amendment_2021_gdb']) {
  for (const kind of ['FeatureServer', 'MapServer']) {
    const r = await get(`${ORG}/${svc}/${kind}?f=json`);
    if (!r.j || r.j.error) continue;
    const layers = (r.j.layers || []).map((l) => ({ id: l.id, name: l.name }));
    out.services[`${svc}/${kind}`] = { layers, copyrightText: r.j.copyrightText ?? null, description: (r.j.serviceDescription || r.j.description || '').slice(0, 300) };
    console.log(`\n=== ${svc}/${kind}: ${layers.length} layers · © ${JSON.stringify(r.j.copyrightText ?? null)}`);
    for (const l of layers) {
      const m = await get(`${ORG}/${svc}/${kind}/${l.id}?f=json`);
      const fields = (m.j?.fields || []).map((f) => f.name);
      const cnt = await get(`${ORG}/${svc}/${kind}/${l.id}/query?where=1%3D1&returnCountOnly=true&f=json`);
      console.log(`   ${String(l.id).padStart(3)} ${l.name.padEnd(60)} n=${cnt.j?.count ?? 'n/a'}  fields=${fields.slice(0, 14).join(',')}`);
      out.services[`${svc}/${kind}`].layers.find((x) => x.id === l.id).fields = fields;
      out.services[`${svc}/${kind}`].layers.find((x) => x.id === l.id).count = cnt.j?.count ?? null;
      // Point query at each fixture parcel on any layer that looks like a height / FSR control.
      if (/height|hob|fsr|floor space|zon/i.test(l.name)) {
        for (const p of PARCELS) {
          const q = await get(`${ORG}/${svc}/${kind}/${l.id}/query?geometry=${p.lon},${p.lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json`);
          const rows = (q.j?.features || []).map((f) => f.attributes);
          out.parcels[p.id] ??= { state: p, council: {} };
          out.parcels[p.id].council[`${svc}/${kind}/${l.id} ${l.name}`] = rows;
          console.log(`      @${p.id}: ${rows.length} hit(s) ${rows.map((a) => JSON.stringify(a).slice(0, 260)).join(' | ')}`);
        }
      }
    }
    break; // one kind per service is enough
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('\nwrote', OUT);
