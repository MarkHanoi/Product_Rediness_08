import fs from 'fs';
const SCRATCH = process.argv[2];
const gj = JSON.parse(fs.readFileSync(SCRATCH + '/ne_10m.geojson', 'utf8'));

const M_PER_DEG_LAT = 110574.0;
const M_PER_DEG_LON_EQ = 111319.49;
const DEG2RAD = Math.PI / 180;

// Metric Douglas-Peucker: keep original [lon,lat] points; distances in local equirectangular m.
function dpSimplify(ring, epsM, latRef) {
  const kx = Math.cos(latRef * DEG2RAD) * M_PER_DEG_LON_EQ;
  const ky = M_PER_DEG_LAT;
  const pts = ring.map(([lon, lat]) => ({ lon, lat, x: lon * kx, y: lat * ky }));
  const n = pts.length;
  if (n < 3) return ring.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1, idx = -1;
    const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i].x, py = pts[i].y;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx, cy = ay + t * dy;
      const d = Math.hypot(px - cx, py - cy);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > epsM && idx !== -1) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push([pts[i].lon, pts[i].lat]);
  return out;
}

function round5(v) { return Math.round(v * 1e5) / 1e5; }

function ringsFromGeometry(geom) {
  const rings = [];
  if (geom.type === 'Polygon') for (const r of geom.coordinates) rings.push(r);
  else if (geom.type === 'MultiPolygon') for (const poly of geom.coordinates) for (const r of poly) rings.push(r);
  return rings;
}

function processCountry(a3, regionCode) {
  const feat = gj.features.find(f => (f.properties.ADM0_A3 || f.properties.adm0_a3) === a3);
  if (!feat) throw new Error('missing ' + a3);
  const rawRings = ringsFromGeometry(feat.geometry);
  const outRings = [];
  for (const rr of rawRings) {
    if (rr.length < 4) continue; // degenerate
    // latRef = mean lat of ring
    let s = 0; for (const p of rr) s += p[1]; const latRef = s / rr.length;
    let simp = dpSimplify(rr, 100, latRef);
    // round to 5 decimals
    simp = simp.map(([lon, lat]) => [round5(lon), round5(lat)]);
    // ensure closed
    const first = simp[0], last = simp[simp.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) simp.push([first[0], first[1]]);
    if (simp.length >= 4) outRings.push(simp);
  }
  const vert = outRings.reduce((a, r) => a + r.length, 0);
  return { regionCode, rings: outRings, ringCount: outRings.length, vert, ring0: outRings[0] ? outRings[0].length : 0 };
}

// CONTROL: re-derive SAU and compare to stored
const sau = processCountry('SAU', 'SA');
const stored = JSON.parse(fs.readFileSync('./packages/site-parcel-data/src/jurisdiction/data/nationalBoundaries.json', 'utf8')).countries.SAU;
console.log('CONTROL SAU: mine rings=' + sau.ringCount + ' verts=' + sau.vert + ' ring0=' + sau.ring0 + '  |  stored rings=' + stored.rings.length + ' ring0=' + stored.rings[0].length);
console.log('  mine ring0[0]=' + JSON.stringify(sau.rings[0][0]) + '  stored ring0[0]=' + JSON.stringify(stored.rings[0][0]));

const targets = [['ARE','AE'],['KWT','KW'],['BHR','BH'],['OMN','OM'],['QAT','QA']];
const result = {};
for (const [a3, rc] of targets) {
  const c = processCountry(a3, rc);
  result[a3] = { regionCode: c.regionCode, rings: c.rings };
  console.log(a3 + ' (' + rc + '): rings=' + c.ringCount + ' verts=' + c.vert + ' ring0=' + c.ring0);
}
fs.writeFileSync(SCRATCH + '/gulf-geometry.json', JSON.stringify(result));
console.log('written gulf-geometry.json');
