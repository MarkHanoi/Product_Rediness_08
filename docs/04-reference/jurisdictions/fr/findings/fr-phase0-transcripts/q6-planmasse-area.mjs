import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('prescription_surf.gpkg', { readOnly: true });
// GPKG geometry blob → WKB → spherical area (R=6371008.8m, spherical-trapezoid formula).
const R = 6371008.8;
function ringArea(pts) { // pts: [[lon,lat],...] degrees
  let s = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [l1, f1] = pts[i], [l2, f2] = pts[(i + 1) % n];
    s += (l2 - l1) * Math.PI / 180 * (2 + Math.sin(f1 * Math.PI / 180) + Math.sin(f2 * Math.PI / 180));
  }
  return Math.abs(s * R * R / 2);
}
function parseWkb(buf, off) {
  const le = buf[off] === 1; off += 1;
  const dv = new DataView(buf.buffer, buf.byteOffset);
  let type = dv.getUint32(off, le); off += 4;
  const hasZ = (type & 0x80000000) !== 0 || (type >= 1000 && type < 4000 && Math.floor(type / 1000) % 2 === 1);
  const hasM = (type & 0x40000000) !== 0 || (type >= 2000 && type < 4000 && Math.floor(type / 1000) >= 2);
  const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
  const base = type & 0xFF % 1000 ? (type & 0x3FFFFFFF) % 1000 : type % 1000;
  const t = (type & 0x3FFFFFFF) % 1000;
  const readRing = () => {
    const n = dv.getUint32(off, le); off += 4;
    const pts = new Array(n);
    for (let i = 0; i < n; i++) { pts[i] = [dv.getFloat64(off, le), dv.getFloat64(off + 8, le)]; off += 8 * dims; }
    return pts;
  };
  const readPolygon = () => {
    const nr = dv.getUint32(off, le); off += 4;
    let a = 0;
    for (let r = 0; r < nr; r++) { const ar = ringArea(readRing()); a += r === 0 ? ar : -ar; }
    return Math.max(a, 0);
  };
  if (t === 3) return { area: readPolygon(), off };
  if (t === 6) {
    const np = dv.getUint32(off, le); off += 4;
    let a = 0;
    for (let p = 0; p < np; p++) { const sub = parseWkb(buf, off); a += sub.area; off = sub.off; }
    return { area: a, off };
  }
  return { area: 0, off, skip: true };
}
function gpkgArea(blob) {
  const buf = Buffer.from(blob);
  if (buf[0] !== 0x47 || buf[1] !== 0x50) return null; // 'GP'
  const flags = buf[3];
  if ((flags >> 4) & 1) return 0; // empty
  const envInd = (flags >> 1) & 7;
  const envLen = [0, 32, 48, 48, 64][envInd] ?? 0;
  return parseWkb(buf, 8 + envLen).area;
}
let total = 0, n = 0, failed = 0;
const parts = new Set();
for (const r of db.prepare(`SELECT the_geom g, partition p FROM prescription_surf WHERE TRIM(typepsc)='14'`).all()) {
  parts.add(r.p);
  try { const a = gpkgArea(r.g); if (a === null) failed++; else { total += a; n++; } } catch { failed++; }
}
console.log('TYPEPSC=14 (surf): parsed', n, 'of', n + failed, 'geometries; parse failures:', failed);
console.log('total area:', (total / 1e6).toFixed(1), 'km2 =', (total / 1e4).toFixed(0), 'ha  (spherical approx, R=6371008.8m; outer ring minus holes)');
console.log('distinct partitions:', parts.size);
console.log([...parts].slice(0, 90).join(' '));
