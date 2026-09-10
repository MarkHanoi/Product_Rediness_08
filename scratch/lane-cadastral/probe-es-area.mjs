import { catastroParcelsAreaHandler } from '../../server/jurisdiction/parcelZoningProxy.js';
function fakeRes() {
  const r = { _s: 200, _j: null, headers: {} };
  r.status = (s) => { r._s = s; return r; };
  r.json = (j) => { r._j = j; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
for (const [name, lat, lon] of [
  ['ES Barcelona Eixample', 41.3874, 2.1686],
  ['ES Albox (rural)', 37.3894, -2.1447],
  ['ES sea (expect ok:[] or out-of-bounds)', 40.0, 1.0],
]) {
  const res = fakeRes(); const t0 = Date.now();
  await catastroParcelsAreaHandler({ query: { lat: String(lat), lon: String(lon), radiusM: '150' } }, res);
  const j = res._j || {};
  const n = j.parcels?.length ?? 0;
  const bad = (j.parcels ?? []).filter(p => !(Array.isArray(p.ring) && p.ring.length >= 3)).length;
  const named = (j.parcels ?? []).filter(p => p.refcat).length;
  console.log(`${name.padEnd(42)} HTTP ${res._s} outcome=${String(j.outcome).padEnd(12)} n=${String(n).padEnd(4)} named=${named} badRings=${bad} trunc=${j.truncated} ${Date.now()-t0}ms${j.reason ? ' | ' + j.reason.slice(0,70) : ''}`);
  if (n) console.log(`${' '.repeat(42)} e.g. refcat=${j.parcels[0].refcat} pts=${j.parcels[0].ring.length} areaM2=${Math.round(j.parcels[0].areaM2 ?? 0)}`);
}
