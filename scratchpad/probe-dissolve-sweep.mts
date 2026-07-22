// L-539 PROBE, STAGE 3 — the TOLERANCE SWEEP. Prototype only; nothing here ships.
//
// WHY IT IS A SEPARATE STAGE FROM THE CLASSIFIER. Stage 2 measures the failures with no repair
// in sight. This stage asks a different question: *for a repair of a given shape, how does
// success behave as the tolerance grows?* The answer is only usable if the curve has a PLATEAU —
// a range where success is already won and further loosening buys nothing. A tolerance chosen on
// a plateau is a property of the data; a tolerance chosen on a slope is a tuned number, which is
// exactly what the brief (and L-529) forbids.
//
// It also measures the COST side, which a success curve alone cannot see:
//   • how far vertices actually had to move (the ring's own inaccuracy);
//   • how many manzanas the repair FLIPS to a different ring vs. produce a first ring;
//   • the block AREA delta against the sum of the cadastral parcel areas — an independent
//     published number the repaired ring can be checked against, so "it closed" is not mistaken
//     for "it closed correctly".
//
// Run:  npx tsx scratchpad/probe-dissolve-sweep.mts

import { readFileSync } from 'node:fs';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

interface RawManzana {
    city: string; manzana: string;
    parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }>;
}

function project(ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] {
    const cos0 = Math.cos(lat0 * DEG2RAD);
    return ring.map((p) => ({
        x: (p.lon - lon0) * DEG2RAD * EARTH_RADIUS_M * cos0,
        z: -((p.lat - lat0) * DEG2RAD * EARTH_RADIUS_M),
    }));
}

// ── The prototype repair ────────────────────────────────────────────────────────────────
/**
 * Greedy sequential weld. Deterministic BY CONSTRUCTION: vertices are visited in lexicographic
 * (x,z) order, and each either joins the lexicographically smallest existing representative
 * within `eps` or becomes one. Every welded vertex therefore sits within `eps` of its
 * representative — no transitive chaining can drag a vertex an unbounded distance, which a naive
 * union-find weld would allow.
 */
function weld(rings: Pt[][], eps: number): { rings: Pt[][]; moved: number; maxMove: number } {
    const all: Pt[] = [];
    for (const r of rings) for (const p of r) all.push(p);
    const order = all.map((_, i) => i).sort((i, j) => {
        const a = all[i]!, b = all[j]!;
        return a.x !== b.x ? a.x - b.x : a.z !== b.z ? a.z - b.z : i - j;
    });

    const cell = Math.max(eps, 1e-9);
    const grid = new Map<string, Pt[]>();
    const gkey = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    const repOf = new Map<number, Pt>();
    let moved = 0, maxMove = 0;

    for (const i of order) {
        const p = all[i]!;
        let best: Pt | null = null;
        let bestD = Infinity;
        const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
            for (const q of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
                const d = Math.hypot(p.x - q.x, p.z - q.z);
                if (d > eps) continue;
                // Tie-break lexicographically so the choice cannot depend on insertion order.
                if (d < bestD || (d === bestD && best && (q.x < best.x || (q.x === best.x && q.z < best.z)))) {
                    best = q; bestD = d;
                }
            }
        }
        if (best) {
            repOf.set(i, best);
            if (bestD > 0) { moved++; maxMove = Math.max(maxMove, bestD); }
        } else {
            repOf.set(i, p);
            const k = gkey(p.x, p.z);
            const list = grid.get(k);
            if (list) list.push(p); else grid.set(k, [p]);
        }
    }

    let n = 0;
    const out = rings.map((r) => r.map(() => ({ x: 0, z: 0 })));
    for (let ri = 0; ri < rings.length; ri++) {
        for (let vi = 0; vi < rings[ri]!.length; vi++) out[ri]![vi] = repOf.get(n++)!;
    }
    return { rings: out, moved, maxMove };
}

/** Split every edge at any welded vertex lying on its INTERIOR. Constructs no new vertex — the
 *  split point is the neighbour's own existing vertex. */
function splitT(rings: Pt[][], eps: number): { rings: Pt[][]; splits: number } {
    const verts: Pt[] = [];
    const seen = new Set<string>();
    for (const r of rings) for (const p of r) {
        const k = `${p.x},${p.z}`;
        if (!seen.has(k)) { seen.add(k); verts.push(p); }
    }
    const cell = Math.max(eps * 4, 1);
    const grid = new Map<string, Pt[]>();
    for (const p of verts) {
        const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
        const l = grid.get(k); if (l) l.push(p); else grid.set(k, [p]);
    }

    let splits = 0;
    const out = rings.map((ring) => {
        const res: Pt[] = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            res.push(a);
            const dx = b.x - a.x, dz = b.z - a.z;
            const L2 = dx * dx + dz * dz;
            if (L2 === 0) continue;
            const L = Math.sqrt(L2);
            const hits: Array<{ t: number; p: Pt }> = [];
            const x0 = Math.min(a.x, b.x) - eps, x1 = Math.max(a.x, b.x) + eps;
            const z0 = Math.min(a.z, b.z) - eps, z1 = Math.max(a.z, b.z) + eps;
            for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
                for (let cz = Math.floor(z0 / cell); cz <= Math.floor(z1 / cell); cz++) {
                    for (const v of grid.get(`${cx},${cz}`) ?? []) {
                        if (v === a || v === b) continue;
                        const t = ((v.x - a.x) * dx + (v.z - a.z) * dz) / L2;
                        if (t * L <= eps || (1 - t) * L <= eps) continue;
                        const perp = Math.hypot(v.x - (a.x + t * dx), v.z - (a.z + t * dz));
                        if (perp > eps) continue;
                        hits.push({ t, p: v });
                    }
                }
            }
            if (!hits.length) continue;
            hits.sort((u, w) => (u.t !== w.t ? u.t - w.t : u.p.x !== w.p.x ? u.p.x - w.p.x : u.p.z - w.p.z));
            let last: Pt | null = null;
            for (const h of hits) {
                if (last && h.p.x === last.x && h.p.z === last.z) continue;
                res.push(h.p); last = h.p; splits++;
            }
        }
        return res;
    });
    return { rings: out, splits };
}

function area(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—'; }

function main() {
    const raw = JSON.parse(readFileSync(new URL('./dissolve-sample.json', import.meta.url), 'utf8')) as { manzanas: RawManzana[] };
    const cities = [...new Set(raw.manzanas.map((m) => m.city))].sort();

    const projected = raw.manzanas.map((m) => {
        const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
        return {
            city: m.city, manzana: m.manzana,
            cadastralAreaM2: m.parcels.reduce((s, p) => s + p.areaM2, 0),
            rings: m.parcels.map((p) => project(p.ring, lat0, lon0)),
        };
    });

    const base = projected.map((m) => dissolveParcelsToBlockRing(m.rings));

    console.log(`\n## SWEEP — ${projected.length} manzanas; baseline ${base.filter((b) => !b.degenerate).length} rings (${pct(base.filter((b) => !b.degenerate).length, base.length)})\n`);
    console.log('| eps (m) | weld only | weld + T-split | Δ changed ring | max vertex move | p95 |Δarea| vs cadastral |');
    console.log('|---|---|---|---|---|---|');

    for (const eps of [0.001, 0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3, 0.5, 1.0]) {
        let okWeld = 0, okSplit = 0, changed = 0, maxMove = 0;
        const areaErr: number[] = [];
        projected.forEach((m, i) => {
            const w = weld(m.rings, eps);
            maxMove = Math.max(maxMove, w.maxMove);
            const rw = dissolveParcelsToBlockRing(w.rings);
            if (!rw.degenerate) okWeld++;
            const s = splitT(w.rings, eps);
            const rs = dissolveParcelsToBlockRing(s.rings);
            if (!rs.degenerate) {
                okSplit++;
                if (m.cadastralAreaM2 > 0) areaErr.push(Math.abs(area(rs.ring) - m.cadastralAreaM2) / m.cadastralAreaM2);
            }
            const b = base[i]!;
            if (!b.degenerate && !rs.degenerate && JSON.stringify(b.ring) !== JSON.stringify(rs.ring)) changed++;
        });
        areaErr.sort((a, b) => a - b);
        const p95 = areaErr.length ? areaErr[Math.floor(0.95 * areaErr.length)]! : NaN;
        console.log(`| ${eps} | ${okWeld} (${pct(okWeld, projected.length)}) | ${okSplit} (${pct(okSplit, projected.length)}) | ${changed} | ${maxMove.toFixed(4)} | ${(p95 * 100).toFixed(1)}% |`);
    }

    // Per-city at a few candidate tolerances.
    for (const eps of [0.01, 0.02, 0.05, 0.1]) {
        console.log(`\n### per city @ eps=${eps} m (weld + T-split)`);
        console.log('| city | n | before | after |');
        console.log('|---|---|---|---|');
        for (const c of cities) {
            const idx = projected.map((m, i) => ({ m, i })).filter((e) => e.m.city === c);
            let before = 0, after = 0;
            for (const { m, i } of idx) {
                if (!base[i]!.degenerate) before++;
                const w = weld(m.rings, eps);
                const s = splitT(w.rings, eps);
                if (!dissolveParcelsToBlockRing(s.rings).degenerate) after++;
            }
            console.log(`| ${c} | ${idx.length} | ${before} (${pct(before, idx.length)}) | ${after} (${pct(after, idx.length)}) |`);
        }
    }
}

main();
