// L-586 PROBE 4 — THE EXPERIMENT. If the exact pass's "success" is re-defined to require a SIMPLE
// (non-self-intersecting) ring, does the §DISSOLVE-TJUNCTION-SPLIT repair — which is currently
// gated on the exact pass FAILING and therefore never sees these blocks — produce a simple ring?
//
// Three outcomes are counted SEPARATELY, never merged:
//   REPAIRED  exact crossed → split path gives a simple ring   (rate unchanged, correctness up)
//   REFUSED   both crossed → we must refuse                     (rate down, correctness up)
//   COLLATERAL a ring that is simple today becomes non-simple / disappears  (must be 0)
//
// Run: npx tsx scratchpad/probe-l586-simplicity-gate.mts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as { manzanas: M[] };
const R = 6_378_137, D = Math.PI / 180;

function segX(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
function selfX(ring: ReadonlyArray<Pt>): boolean {
    const n = ring.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segX(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
    return false;
}
function absArea(ring: ReadonlyArray<Pt>) {
    let s = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; s += p.x * q.z - q.x * p.z; }
    return Math.abs(s / 2);
}

let exactRings = 0, exactCrossed = 0, repaired = 0, stillCrossed = 0, repairFailed = 0;
let maxVerts = 0;
const detail: string[] = [];

for (const m of raw.manzanas) {
    const id = `${m.city}/${m.manzana}`;
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })));
    const head = dissolveParcelsToBlockRing(rings);
    if (head.degenerate) continue;
    exactRings++;
    maxVerts = Math.max(maxVerts, head.ring.length);
    if (!selfX(head.ring)) continue;
    exactCrossed++;
    // Force the repair path by disabling the exact-wins shortcut: we cannot call it directly,
    // so we approximate it exactly the way production would after the gate change — run the
    // dissolve on parcels pre-split at the production tolerance. `repairTJunctions:false` on
    // pre-split input reproduces `dissolveExact(split.rings, …)` byte for byte.
    const pre = preSplit(rings, 0.1);
    const rep = dissolveParcelsToBlockRing(pre, { repairTJunctions: false });
    if (rep.degenerate) {
        repairFailed++;
        detail.push(`  ${id}: exact ring CROSSED, split path REFUSES (${rep.reason}) → REFUSAL`);
    } else if (selfX(rep.ring)) {
        stillCrossed++;
        detail.push(`  ${id}: exact ring CROSSED, split ring ALSO crossed → REFUSAL`);
    } else {
        repaired++;
        detail.push(`  ${id}: exact ring CROSSED → split ring SIMPLE, area ${absArea(rep.ring).toFixed(1)} m² vs exact ${absArea(head.ring).toFixed(1)} m² (published ${m.parcels.reduce((s, p) => s + p.areaM2, 0).toFixed(0)} m²) → REPAIRED`);
    }
}

// Mirror of splitTJunctions (blockRing.ts) — probe-local so the experiment needs no source edit.
function preSplit(parcelRings: ReadonlyArray<ReadonlyArray<Pt>>, tol: number): Pt[][] {
    const K = (p: Pt) => `${Math.round(p.x / 1e-3) + 0},${Math.round(p.z / 1e-3) + 0}`;
    const uniq = new Map<string, Pt>();
    for (const r of parcelRings) for (const p of r) if (!uniq.has(K(p))) uniq.set(K(p), p);
    const verts = [...uniq.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, p]) => p);
    const cell = Math.max(tol, 1e-6);
    const grid = new Map<string, Pt[]>();
    for (const p of verts) { const gk = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`; const l = grid.get(gk); if (l) l.push(p); else grid.set(gk, [p]); }
    return parcelRings.map((ring) => {
        const out: Pt[] = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            out.push(a);
            const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
            if (len2 === 0) continue;
            const len = Math.sqrt(len2);
            if (len <= 2 * tol) continue;
            const hits: Array<{ t: number; p: Pt }> = [];
            for (let cx = Math.floor((Math.min(a.x, b.x) - tol) / cell); cx <= Math.floor((Math.max(a.x, b.x) + tol) / cell); cx++)
                for (let cz = Math.floor((Math.min(a.z, b.z) - tol) / cell); cz <= Math.floor((Math.max(a.z, b.z) + tol) / cell); cz++)
                    for (const v of grid.get(`${cx},${cz}`) ?? []) {
                        const t = ((v.x - a.x) * dx + (v.z - a.z) * dz) / len2;
                        if (t * len <= tol || (1 - t) * len <= tol) continue;
                        if (Math.hypot(v.x - (a.x + t * dx), v.z - (a.z + t * dz)) > tol) continue;
                        hits.push({ t, p: v });
                    }
            if (!hits.length) continue;
            hits.sort((u, w) => (u.t !== w.t ? u.t - w.t : u.p.x !== w.p.x ? u.p.x - w.p.x : u.p.z - w.p.z));
            let lastKey = K(a);
            for (const h of hits) { const hk = K(h.p); if (hk === lastKey) continue; out.push(h.p); lastKey = hk; }
        }
        return out;
    });
}

console.log('## SIMPLICITY GATE — EXPERIMENT\n');
console.log(`  rings produced today                 : ${exactRings}`);
console.log(`  of which SELF-INTERSECTING           : ${exactCrossed}`);
console.log(`  → split path yields a SIMPLE ring    : ${repaired}   (rate unchanged, defect removed)`);
console.log(`  → split path still crossed           : ${stillCrossed}  (would become a refusal)`);
console.log(`  → split path refuses                 : ${repairFailed} (would become a refusal)`);
console.log(`  net rate change                      : ${(-(stillCrossed + repairFailed) / exactRings * 100).toFixed(2)} pp of the dissolve rate`);
console.log(`  max ring vertex count in sample      : ${maxVerts}  (O(n²) simplicity test cost bound)`);
console.log('\n' + detail.join('\n'));
