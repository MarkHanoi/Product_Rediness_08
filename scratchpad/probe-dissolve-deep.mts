// L-539 PROBE, STAGE 2b — interrogate the two classes stage 2 says dominate.
//
// Stage 2 found: 66.8 % of failures are SEVERAL CLOSED LOOPS (every vertex degree 2 — nothing is
// "broken", the perimeter is simply not one loop), and 86 % carry at least one T-junction. It
// also found NO near-coincident vertices at all below 0.05 m, which contradicts the assumption
// baked into the brief and into blockRing.ts's own header ("slivers", "near-coincident vertices").
// Three questions decide the design, and each is answered against the data, not by argument:
//
//   Q1. Are the multiple loops NESTED (one loop contains the others — a courtyard parcel, i.e. a
//       genuine block with an island) or SIDE BY SIDE (the manzana prefix really did collect two
//       separate blocks)? Only the first is safely repairable.
//   Q2. Is the island caused by OUR OWN PARSER? `parseParcelGml` keeps only the FIRST posList of a
//       feature — every interior ring is silently discarded. If enclosed parcels correlate with
//       discarded interior rings, the defect is ours, not the cadastre's.
//   Q3. What IS the cutoff in the T-junction perpendicular offsets? A distribution that is flat to
//       ~0.1 m and then stops dead is not measurement noise (which peaks at zero) — it is a
//       publisher's generalisation tolerance. If that is what it is, the tolerance is a property
//       of the dataset that can be CITED rather than chosen.
//
// Run:  npx tsx scratchpad/probe-dissolve-deep.mts

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dissolveParcelsToBlockRing, VERTEX_MATCH_TOLERANCE_M } from '../packages/site-parcel-data/src/geometry/blockRing.js';
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
const key = (p: Pt) => {
    const q = (v: number) => Math.round(v / VERTEX_MATCH_TOLERANCE_M);
    return `${q(p.x) + 0},${q(p.z) + 0}`;
};
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function openRing(r: Pt[]): Pt[] {
    return r.length >= 2 && key(r[0]!) === key(r[r.length - 1]!) ? r.slice(0, -1) : r;
}
function areaOf(ring: Pt[]): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a / 2);
}
function pointInRing(p: Pt, ring: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!, b = ring[j]!;
        if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
}
function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—'; }
function quantiles(a: number[], qs: number[]) {
    if (!a.length) return qs.map(() => NaN);
    const s = [...a].sort((x, y) => x - y);
    return qs.map((q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!);
}

/** Extract the closed loops of the perimeter graph. Returns null if any vertex degree ≠ 2. */
function perimeterLoops(rings: Pt[][]): { loops: Pt[][]; badDegree: number } | null {
    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            const ka = key(a), kb = key(b);
            if (ka === kb) continue;
            const ek = edgeKey(ka, kb);
            const f = edges.get(ek);
            if (f) f.count++; else edges.set(ek, { count: 1, a, b, ka, kb });
        }
    }
    const perim = [...edges.values()].filter((e) => e.count === 1);
    const byVertex = new Map<string, typeof perim>();
    for (const e of perim) {
        for (const k of [e.ka, e.kb]) { const l = byVertex.get(k); if (l) l.push(e); else byVertex.set(k, [e]); }
    }
    let bad = 0;
    for (const [, l] of byVertex) if (l.length !== 2) bad++;
    if (bad > 0) return { loops: [], badDegree: bad };

    const used = new Set<typeof perim[number]>();
    const loops: Pt[][] = [];
    for (const seed of perim) {
        if (used.has(seed)) continue;
        const loop: Pt[] = [seed.a, seed.b];
        used.add(seed);
        let ck = seed.kb, prev = seed;
        for (let guard = 0; guard < perim.length + 1; guard++) {
            const cands = byVertex.get(ck);
            if (!cands) break;
            const next = cands.find((e) => e !== prev);
            if (!next || used.has(next)) break;
            used.add(next);
            const nk = next.ka === ck ? next.kb : next.ka;
            const np = next.ka === ck ? next.b : next.a;
            if (nk === key(loop[0]!)) break;
            loop.push(np); ck = nk; prev = next;
        }
        if (loop.length >= 3) loops.push(loop);
    }
    return { loops, badDegree: 0 };
}

function main() {
    const raw = JSON.parse(readFileSync(new URL('./dissolve-sample.json', import.meta.url), 'utf8')) as { manzanas: RawManzana[] };

    // ── Q2 prep: which refcats had an INTERIOR ring in the source GML? ──────────────────
    const dir = fileURLToPath(new URL('./dissolve-probe-cache/', import.meta.url));
    const withInterior = new Set<string>();
    let featuresWithInterior = 0, featuresTotal = 0;
    for (const f of readdirSync(dir)) {
        if (!f.endsWith('.xml')) continue;
        const gml = readFileSync(dir + f, 'utf8');
        for (const chunk of gml.split(/<cp:CadastralParcel\b/).slice(1)) {
            featuresTotal++;
            const rc = chunk.match(/<(?:[\w.-]+:)?nationalCadastralReference>([^<]+)</i)?.[1]?.trim();
            if (/<(?:[\w.-]+:)?interior\b/i.test(chunk)) {
                featuresWithInterior++;
                if (rc) withInterior.add(rc);
            }
        }
    }
    console.log(`\n## Q2 — INTERIOR RINGS IN THE SOURCE GML`);
    console.log(`${featuresWithInterior} of ${featuresTotal} parsed features (${pct(featuresWithInterior, featuresTotal)}) carry ≥1 <gml:interior> ring.`);
    console.log(`\`parseParcelGml\` keeps only the FIRST <posList>, so every one of those interior rings is DISCARDED.`);

    // ── Q1 + Q2 — nesting of the multi-loop failures ───────────────────────────────────
    let multi = 0, nested = 0, sideBySide = 0, nestedWithInteriorSource = 0, mixed = 0;
    const islandAreaShare: number[] = [];
    const perCityNested = new Map<string, number>();
    const perCitySide = new Map<string, number>();

    // ── Q3 — full T-junction perpendicular distribution, WIDE survey radius ────────────
    const WIDE = 1.0;
    const tPerp: number[] = [];
    const allEdgeLen: number[] = [];

    for (const m of raw.manzanas) {
        const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
        const rings = m.parcels.map((p) => openRing(project(p.ring, lat0, lon0)));
        for (const r of rings) {
            for (let i = 0; i < r.length; i++) {
                const a = r[i]!, b = r[(i + 1) % r.length]!;
                const L = Math.hypot(b.x - a.x, b.z - a.z);
                if (L > 0) allEdgeLen.push(L);
            }
        }
        const res = dissolveParcelsToBlockRing(rings);
        if (!res.degenerate) continue;

        const pl = perimeterLoops(rings);
        if (pl && pl.badDegree === 0 && pl.loops.length > 1) {
            multi++;
            const sorted = [...pl.loops].sort((a, b) => areaOf(b) - areaOf(a));
            const outer = sorted[0]!;
            const inner = sorted.slice(1);
            const allInside = inner.every((l) => l.every((v) => pointInRing(v, outer)));
            const noneInside = inner.every((l) => l.every((v) => !pointInRing(v, outer)));
            if (allInside) {
                nested++;
                perCityNested.set(m.city, (perCityNested.get(m.city) ?? 0) + 1);
                islandAreaShare.push(inner.reduce((s, l) => s + areaOf(l), 0) / areaOf(outer));
                // Q2 — does an enclosed loop coincide with a parcel that HAD an interior ring?
                if (m.parcels.some((p) => withInterior.has(p.refcat))) nestedWithInteriorSource++;
            } else if (noneInside) {
                sideBySide++;
                perCitySide.set(m.city, (perCitySide.get(m.city) ?? 0) + 1);
            } else mixed++;
        }

        // T-junction survey with a WIDE radius, to find where the distribution really stops.
        const verts = new Map<string, Pt>();
        const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
        for (const ring of rings) {
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
                const ka = key(a), kb = key(b);
                verts.set(ka, a); verts.set(kb, b);
                if (ka === kb) continue;
                const ek = edgeKey(ka, kb);
                const f = edges.get(ek);
                if (f) f.count++; else edges.set(ek, { count: 1, a, b, ka, kb });
            }
        }
        const perim = [...edges.values()].filter((e) => e.count === 1);
        for (const e of perim) {
            const L = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
            if (L === 0) continue;
            for (const [k, v] of verts) {
                if (k === e.ka || k === e.kb) continue;
                const t = ((v.x - e.a.x) * (e.b.x - e.a.x) + (v.z - e.a.z) * (e.b.z - e.a.z)) / (L * L);
                if (t * L < 0.3 || (1 - t) * L < 0.3) continue;
                const perp = Math.hypot(v.x - (e.a.x + t * (e.b.x - e.a.x)), v.z - (e.a.z + t * (e.b.z - e.a.z)));
                if (perp <= WIDE) tPerp.push(perp);
            }
        }
    }

    console.log(`\n## Q1 — SHAPE OF THE MULTI-LOOP FAILURES (${multi} manzanas)`);
    console.log(`| shape | n | % |`);
    console.log('|---|---|---|');
    console.log(`| NESTED (every extra loop inside the largest) | ${nested} | ${pct(nested, multi)} |`);
    console.log(`| SIDE BY SIDE (genuinely separate blocks) | ${sideBySide} | ${pct(sideBySide, multi)} |`);
    console.log(`| mixed | ${mixed} | ${pct(mixed, multi)} |`);
    const q = quantiles(islandAreaShare, [0.05, 0.5, 0.95]);
    console.log(`island area as a share of the outer loop: p5/p50/p95 = ${q.map((v) => (v * 100).toFixed(1) + '%').join(' / ')}`);
    console.log(`nested manzanas containing ≥1 parcel whose GML HAD an interior ring: ${nestedWithInteriorSource} / ${nested} (${pct(nestedWithInteriorSource, nested)})`);
    console.log(`\nper city — nested / side-by-side:`);
    for (const c of [...new Set(raw.manzanas.map((m) => m.city))].sort()) {
        console.log(`  ${c.padEnd(16)} ${String(perCityNested.get(c) ?? 0).padStart(4)} / ${perCitySide.get(c) ?? 0}`);
    }

    console.log(`\n## Q3 — T-JUNCTION PERPENDICULAR OFFSET, survey radius ${WIDE} m (${tPerp.length} incidences)`);
    let prev = 0;
    for (const b of [0.001, 0.002, 0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 1.0]) {
        const n = tPerp.filter((v) => v > prev && v <= b).length;
        console.log(`  ${String(prev).padStart(6)} – ${String(b).padEnd(6)} : ${String(n).padStart(5)}  (cum ${pct(tPerp.filter((v) => v <= b).length, tPerp.length)})`);
        prev = b;
    }

    console.log(`\n## EDGE-LENGTH FLOOR — ${allEdgeLen.length} parcel edges`);
    const eq = quantiles(allEdgeLen, [0.0001, 0.001, 0.005, 0.01, 0.05, 0.5]);
    console.log(`p0.01/p0.1/p0.5/p1/p5/p50 = ${eq.map((v) => v.toFixed(4)).join(' / ')} m`);
    for (const b of [0.005, 0.01, 0.02, 0.05, 0.08, 0.1, 0.2, 0.5]) {
        console.log(`  edges shorter than ${b} m: ${allEdgeLen.filter((v) => v < b).length} (${pct(allEdgeLen.filter((v) => v < b).length, allEdgeLen.length)})`);
    }

    // Coordinate quantisation — is the publisher on a grid?
    const decs = new Map<number, number>();
    for (const m of raw.manzanas.slice(0, 50)) {
        for (const p of m.parcels) for (const v of p.ring) {
            const d = (String(v.lat).split('.')[1] ?? '').length;
            decs.set(d, (decs.get(d) ?? 0) + 1);
        }
    }
    console.log(`\n## COORDINATE PRECISION (decimal places of latitude, first 50 manzanas)`);
    for (const [d, n] of [...decs].sort((a, b) => a[0] - b[0])) console.log(`  ${d} dp: ${n}`);
}

main();
