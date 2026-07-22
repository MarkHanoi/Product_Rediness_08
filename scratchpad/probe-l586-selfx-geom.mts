// L-586 PROBE 3 — LOOK AT THE ACTUAL GEOMETRY of the crossings. How big is the folded lobe,
// how far along the edges does the crossing sit, and which parcels contributed the edges?
//
// Run: npx tsx scratchpad/probe-l586-selfx-geom.mts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as { manzanas: M[] };
const R = 6_378_137, D = Math.PI / 180;

function segX(a: Pt, b: Pt, c: Pt, d: Pt) {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    if (!(o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0)) return null;
    const den = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x);
    const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / den;
    const u = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / den;
    return { t, u, p: { x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) } };
}
function absArea(ring: ReadonlyArray<Pt>) {
    let s = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; s += p.x * q.z - q.x * p.z; }
    return Math.abs(s / 2);
}
const TARGETS = ['Barcelona/96375', 'Cordoba/29588', 'Cordoba/33597', 'Cordoba/44504', 'Cordoba/44544',
    'Madrid-centro/99398', 'Sevilla/54202', 'Valencia/51296', 'Valencia/52263', 'Valencia/55296', 'Valencia/60255'];

for (const m of raw.manzanas) {
    const id = `${m.city}/${m.manzana}`;
    if (!TARGETS.includes(id)) continue;
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })));
    const res = dissolveParcelsToBlockRing(rings);
    const ring = res.ring; const n = ring.length;
    console.log(`\n=== ${id}  (${m.parcels.length} parcels, ${n} ring verts, ${res.quality.path}, ring area ${absArea(ring).toFixed(1)} m²) ===`);
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const a = ring[i]!, b = ring[(i + 1) % n]!, cc = ring[j]!, d = ring[(j + 1) % n]!;
        const x = segX(a, b, cc, d); if (!x) continue;
        const lenI = Math.hypot(b.x - a.x, b.z - a.z), lenJ = Math.hypot(d.x - cc.x, d.z - cc.z);
        // The folded lobe = the sub-ring between the two crossing points.
        const lobe: Pt[] = [x.p];
        for (let k = i + 1; k <= j; k++) lobe.push(ring[k % n]!);
        const ang = (() => {
            const a1 = Math.atan2(b.z - a.z, b.x - a.x), a2 = Math.atan2(d.z - cc.z, d.x - cc.x);
            let t = ((a2 - a1) * 180) / Math.PI; while (t < 0) t += 180; while (t >= 180) t -= 180;
            return Math.min(t, 180 - t);
        })();
        console.log(
            `  edge ${i}×${j}  gap ${j - i}  lenI ${lenI.toFixed(3)} lenJ ${lenJ.toFixed(3)}  ` +
            `crossing at t=${x.t.toFixed(4)} (${(x.t * lenI).toFixed(3)} m in) u=${x.u.toFixed(4)} (${(x.u * lenJ).toFixed(3)} m in)  ` +
            `angle ${ang.toFixed(2)}°  LOBE AREA ${absArea(lobe).toFixed(4)} m² (${(absArea(lobe) / absArea(ring) * 100).toFixed(4)}% of block)`,
        );
        console.log(`     verts ${i}..${j + 1}: ` + Array.from({ length: j - i + 2 }, (_, k) => {
            const p = ring[(i + k) % n]!; return `(${p.x.toFixed(3)},${p.z.toFixed(3)})`;
        }).join(' → '));
    }
}
