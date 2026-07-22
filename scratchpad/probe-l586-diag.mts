// L-586 diagnostic — where does the capsule-union inset of block 02309 die?
// Replicates ONLY the post-step-4 pipeline by re-deriving the raw offset ring from the shipped
// module's own exported entry is impossible, so this rebuilds the ring with the SAME formulas and
// then reports gate-by-gate. Used for diagnosis only, never as evidence.
import { readFileSync } from 'node:fs';
import { polygonSignedArea, pointInPolygon, pointPolygonEdgeDistance } from '../packages/site-validators/src/index.js';

type Pt = { x: number; z: number };
const src = readFileSync('packages/site-parcel-data/__tests__/insetPolygon.test.ts', 'utf8');
const start = src.indexOf('const BLOCK_02309');
const body = src.slice(start, src.indexOf('];', start));
const RING: Pt[] = [...body.matchAll(/\{\s*x:\s*(-?[\d.]+),\s*z:\s*(-?[\d.]+)\s*\}/g)]
    .map((m) => ({ x: parseFloat(m[1]!), z: parseFloat(m[2]!) }));

const EPS = 1e-9;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, z: a.z - b.z });
const cross = (a: Pt, b: Pt): number => a.x * b.z - a.z * b.x;
const len = (v: Pt): number => Math.hypot(v.x, v.z);
function lineIntersect(p0: Pt, d0: Pt, p1: Pt, d1: Pt): Pt | null {
    const den = cross(d0, d1);
    if (Math.abs(den) < EPS) return null;
    const t = cross(sub(p1, p0), d1) / den;
    return { x: p0.x + t * d0.x, z: p0.z + t * d0.z };
}
function bisect(c: Pt, r: number, e: Pt, q: Pt, lv: number, out: Pt[]): void {
    if (lv === 0) return;
    const mx = (e.x + q.x) / 2 - c.x, mz = (e.z + q.z) / 2 - c.z;
    const m = Math.hypot(mx, mz);
    if (m < EPS) return;
    const mid = { x: c.x + (mx / m) * r, z: c.z + (mz / m) * r };
    bisect(c, r, e, mid, lv - 1, out); out.push(mid); bisect(c, r, mid, q, lv - 1, out);
}
function buildRing(ring: Pt[], s: number[]): Pt[] {
    const n = ring.length;
    const dirs: Pt[] = [], nrms: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const v = sub(ring[(i + 1) % n]!, ring[i]!); const L = len(v);
        dirs.push({ x: v.x / L, z: v.z / L }); nrms.push({ x: -v.z / L, z: v.x / L });
    }
    const out: Pt[] = [];
    const push = (p: Pt) => { const l = out[out.length - 1]; if (l && len(sub(p, l)) < 1e-6) return; out.push(p); };
    for (let i = 0; i < n; i++) {
        const V = ring[i]!, ip = (i - 1 + n) % n;
        const dp = dirs[ip]!, np = nrms[ip]!, a = s[ip]!, dc = dirs[i]!, nc = nrms[i]!, b = s[i]!;
        const pP = { x: V.x + a * np.x, z: V.z + a * np.z };
        const pC = { x: V.x + b * nc.x, z: V.z + b * nc.z };
        const m = lineIntersect(pP, dp, pC, dc);
        if (m) {
            const tp = (m.x - V.x) * dp.x + (m.z - V.z) * dp.z;
            const tc = (m.x - V.x) * dc.x + (m.z - V.z) * dc.z;
            if (tp <= EPS && tc >= -EPS) { push(m); continue; }
        }
        const r = Math.max(a, b);
        if (r < EPS) { push({ x: V.x, z: V.z }); continue; }
        const back = Math.sqrt(Math.max(0, r * r - a * a)), fwd = Math.sqrt(Math.max(0, r * r - b * b));
        const e = { x: pP.x - back * dp.x, z: pP.z - back * dp.z };
        const q = { x: pC.x + fwd * dc.x, z: pC.z + fwd * dc.z };
        push(e);
        const arc: Pt[] = []; const chord = len(sub(q, e));
        if (chord > EPS && r > EPS) { let lv = 0, ra = chord / r; while (ra > 0.261 && lv < 3) { ra /= 2; lv++; } if (lv) bisect(V, r, e, q, lv, arc); }
        for (const p of arc) push(p);
        push(q);
    }
    while (out.length >= 2 && len(sub(out[out.length - 1]!, out[0]!)) < 1e-6) out.pop();
    return out;
}
const area = (r: Pt[]) => Math.abs(polygonSignedArea(r));
const parcelArea = area(RING);
const ccw = polygonSignedArea(RING) > 0 ? RING : [...RING].reverse();
console.log(`block 02309: ${RING.length} verts, ${parcelArea.toFixed(0)} m²`);
for (const d of [4, 8, 12, 16]) {
    const raw = buildRing(ccw, ccw.map(() => d));
    const sa = polygonSignedArea(raw);
    let escaped = 0, maxEsc = 0;
    for (const p of raw) {
        if (pointInPolygon(p, ccw)) continue;
        const e = pointPolygonEdgeDistance(p, ccw);
        if (e > 1e-3) { escaped++; maxEsc = Math.max(maxEsc, e); }
    }
    console.log(`  d=${d}: raw ${raw.length} verts, signedArea ${sa.toFixed(0)} (parcel ${parcelArea.toFixed(0)}), escaped ${escaped} max ${maxEsc.toFixed(2)} m`);
}

// which points escape, and what generated them
{
    const d = 12;
    const raw = buildRing(ccw, ccw.map(() => d));
    raw.forEach((p, i) => {
        if (pointInPolygon(p, ccw)) return;
        const e = pointPolygonEdgeDistance(p, ccw);
        if (e <= 1e-3) return;
        console.log(`  escape idx ${i}/${raw.length} at (${p.x.toFixed(2)},${p.z.toFixed(2)}) out by ${e.toFixed(2)} m`);
        console.log(`     prev (${raw[(i-1+raw.length)%raw.length]!.x.toFixed(2)},${raw[(i-1+raw.length)%raw.length]!.z.toFixed(2)}) next (${raw[(i+1)%raw.length]!.x.toFixed(2)},${raw[(i+1)%raw.length]!.z.toFixed(2)})`);
    });
    // nearest original vertices
}

// tag origin of each emitted point
{
    const d = 12; const s = ccw.map(() => d);
    const n = ccw.length;
    const dirs: Pt[] = [], nrms: Pt[] = [];
    for (let i = 0; i < n; i++) { const v = sub(ccw[(i + 1) % n]!, ccw[i]!); const L = len(v); dirs.push({ x: v.x / L, z: v.z / L }); nrms.push({ x: -v.z / L, z: v.x / L }); }
    for (let i = 0; i < n; i++) {
        const V = ccw[i]!, ip = (i - 1 + n) % n;
        const dp = dirs[ip]!, np = nrms[ip]!, a = s[ip]!, dc = dirs[i]!, nc = nrms[i]!, b = s[i]!;
        const pP = { x: V.x + a * np.x, z: V.z + a * np.z }, pC = { x: V.x + b * nc.x, z: V.z + b * nc.z };
        const m = lineIntersect(pP, dp, pC, dc);
        let kind = 'arc'; let pt: Pt = pP;
        if (m) { const tp = (m.x - V.x) * dp.x + (m.z - V.z) * dp.z, tc = (m.x - V.x) * dc.x + (m.z - V.z) * dc.z; if (tp <= EPS && tc >= -EPS) { kind = 'miter'; pt = m; } }
        const cands: Pt[] = kind === 'miter' ? [pt] : [
            { x: pP.x, z: pP.z }, { x: pC.x, z: pC.z },
        ];
        for (const c of cands) {
            if (pointInPolygon(c, ccw) || pointPolygonEdgeDistance(c, ccw) <= 1e-3) continue;
            const turn = Math.atan2(cross(dp, dc), dp.x * dc.x + dp.z * dc.z) * 180 / Math.PI;
            console.log(`  ESCAPE(${kind}) vtx ${i} V=(${V.x.toFixed(2)},${V.z.toFixed(2)}) turn ${turn.toFixed(2)}° -> (${c.x.toFixed(2)},${c.z.toFixed(2)}) out ${pointPolygonEdgeDistance(c, ccw).toFixed(2)} prevLen=${len(sub(V, ccw[ip]!)).toFixed(2)} nextLen=${len(sub(ccw[(i + 1) % n]!, V)).toFixed(2)}`);
        }
    }
}
