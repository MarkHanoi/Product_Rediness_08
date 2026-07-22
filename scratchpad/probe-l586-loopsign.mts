// L-586 PROBE 11 — WHAT A SECOND LOOP ACTUALLY IS. The sign of the identity decides it.
//
// For the parcel union P, the divergence theorem gives Area(P) = Σ signed areas of the boundary
// loops. So for a perimeter that chains into `outer` plus small loops:
//   Σ|parcels| == |outer| − Σ|small|   ⇒ the small loops are HOLES (interior voids). Recoverable.
//   Σ|parcels| == |outer| + Σ|small|   ⇒ the small loops are SEPARATE components: either a detached
//                                        fragment of the manzana, or two parcels that OVERLAP (the
//                                        overlap is bounded twice and never cancels). Neither is a
//                                        tiling; both must refuse.
//   neither                            ⇒ mixed or worse; refuse.
//
// This is the measurement that decides how much of the multi-loop population is ours to fix.
//
// Run: npx tsx scratchpad/probe-l586-loopsign.mts

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VERTEX_MATCH_TOLERANCE_M } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { pointInPolygon } from '../packages/site-validators/src/index.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as { manzanas: M[] };
const R = 6_378_137, D = Math.PI / 180;
const key = (p: Pt) => { const q = (v: number) => Math.round(v / VERTEX_MATCH_TOLERANCE_M); return `${q(p.x) + 0},${q(p.z) + 0}`; };
const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const A = (r: ReadonlyArray<Pt>) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; s += p.x * q.z - q.x * p.z; } return Math.abs(s / 2); };

const tally: Record<string, number> = {};
const rows: any[] = [];
for (const m of raw.manzanas) {
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon, c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })));
    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
    let nm = false, bad = false;
    for (const ring of rings) {
        if (ring.length < 3) { bad = true; break; }
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            const ka = key(a), kb = key(b); if (ka === kb) continue;
            const k = ekey(ka, kb); const e = edges.get(k);
            if (e) { e.count++; if (e.count > 2) nm = true; } else edges.set(k, { count: 1, a, b, ka, kb });
        }
    }
    if (bad) { tally['malformed-parcel'] = (tally['malformed-parcel'] ?? 0) + 1; continue; }
    if (nm) { tally['non-manifold'] = (tally['non-manifold'] ?? 0) + 1; continue; }
    const perim = [...edges.entries()].filter(([, e]) => e.count === 1).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => e);
    if (perim.length < 3) { tally['perimeter<3'] = (tally['perimeter<3'] ?? 0) + 1; continue; }
    const byV = new Map<string, typeof perim>();
    for (const e of perim) for (const k of [e.ka, e.kb]) { const l = byV.get(k); if (l) l.push(e); else byV.set(k, [e]); }
    if ([...byV.values()].some((l) => l.length !== 2)) { tally['degree≠2'] = (tally['degree≠2'] ?? 0) + 1; continue; }
    const visited = new Set<any>(); const loops: Pt[][] = []; let ok = true;
    for (const seed of perim) {
        if (visited.has(seed)) continue;
        const out: Pt[] = [seed.a, seed.b]; visited.add(seed);
        let cur = seed.kb, prev: any = seed, closed = false;
        for (let s = 1; s < perim.length; s++) {
            const cand = byV.get(cur)!; const next = cand.find((e) => e !== prev);
            if (!next) { ok = false; break; }
            const nk = next.ka === cur ? next.kb : next.ka, np = next.ka === cur ? next.b : next.a;
            visited.add(next);
            if (nk === seed.ka) { closed = true; break; }
            out.push(np); cur = nk; prev = next;
        }
        if (!ok || !closed) { ok = false; break; }
        loops.push(out);
    }
    if (!ok) { tally['chain-failed'] = (tally['chain-failed'] ?? 0) + 1; continue; }
    if (loops.length === 1) { tally['single-loop (fine)'] = (tally['single-loop (fine)'] ?? 0) + 1; continue; }

    const oi = loops.reduce((bi, l, i) => (A(l) > A(loops[bi]!) ? i : bi), 0);
    const outer = loops[oi]!, inner = loops.filter((_, i) => i !== oi);
    const pSum = rings.reduce((s, r) => s + A(r), 0);
    const vSum = inner.reduce((s, r) => s + A(r), 0);
    const tol = 1e-6 * Math.max(pSum, 1);
    const isVoid = Math.abs(A(outer) - vSum - pSum) <= tol;
    const isAdd = Math.abs(A(outer) + vSum - pSum) <= tol;
    const allIn = inner.every((l) => l.every((p) => pointInPolygon(p, outer)));
    const label = isVoid ? 'HOLE — interior void (recoverable)'
        : isAdd ? (allIn ? 'ADD, inner — parcels OVERLAP (refuse)' : 'ADD, outer — DETACHED fragment (refuse)')
            : 'MIXED / neither identity (refuse)';
    tally[label] = (tally[label] ?? 0) + 1;
    rows.push({ id: `${m.city}/${m.manzana}`, loops: loops.length, outer: A(outer), voidSum: vSum, parcelSum: pSum, label, allIn });
}

console.log('## WHAT A MULTI-LOOP PERIMETER ACTUALLY IS — 956 frozen manzanas\n');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);
const multi = rows.length;
console.log(`\n  multi-loop total: ${multi}`);
for (const l of ['HOLE — interior void (recoverable)', 'ADD, inner — parcels OVERLAP (refuse)', 'ADD, outer — DETACHED fragment (refuse)', 'MIXED / neither identity (refuse)']) {
    const g = rows.filter((r) => r.label === l);
    console.log(`    ${String(g.length).padStart(3)}  ${l}`);
    for (const r of g.slice(0, 4)) console.log(`          e.g. ${r.id}: outer ${r.outer.toFixed(1)} m², ${r.loops - 1} small loop(s) ${r.voidSum.toFixed(2)} m², parcels ${r.parcelSum.toFixed(1)} m²`);
}
writeFileSync(resolve(ROOT, 'scratchpad/l586-loopsign.json'), JSON.stringify({ ranAt: new Date().toISOString(), tally, rows }, null, 2));
console.log('\nwrote scratchpad/l586-loopsign.json');
