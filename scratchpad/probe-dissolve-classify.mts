// L-539 PROBE, STAGE 2 — WHY does `dissolveParcelsToBlockRing` refuse a real manzana?
//
// ⚠ THE GATE THIS EXISTS TO SATISFY. The brief forbids inventing a tolerance and tuning it until
// blocks pass — that is the L-529 failure (a "confirmed" root cause agreed by three documents,
// demolished by one probe). So this stage measures the STRUCTURE of every failure and reports a
// frequency distribution, BEFORE any repair is designed. It applies no repair at all.
//
// It reuses the PRODUCTION dissolve to decide success/failure and re-derives the production
// quantisation key locally, so a manzana this file calls "failing" is exactly one the product
// refuses.
//
// Run:  npx tsx scratchpad/probe-dissolve-classify.mts

import { readFileSync, writeFileSync } from 'node:fs';
import { dissolveParcelsToBlockRing, VERTEX_MATCH_TOLERANCE_M } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

interface RawManzana {
    city: string; manzana: string;
    parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }>;
}

/** The PRODUCTION projection (`latLonToSceneXZ`), inlined — apps/editor is not importable here. */
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
    if (r.length < 2) return r;
    return key(r[0]!) === key(r[r.length - 1]!) ? r.slice(0, -1) : r;
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    if (L2 === 0) return Math.hypot(p.x - a.x, p.z - a.z);
    let t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

/** Perpendicular distance to the INFINITE line, plus the clamped parameter — a T-junction needs
 *  the vertex to be interior to the segment, not merely near its endpoint. */
function projOnSeg(p: Pt, a: Pt, b: Pt): { t: number; perp: number } {
    const dx = b.x - a.x, dz = b.z - a.z;
    const L2 = dx * dx + dz * dz;
    if (L2 === 0) return { t: 0, perp: Math.hypot(p.x - a.x, p.z - a.z) };
    const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
    const ct = Math.max(0, Math.min(1, t));
    return { t, perp: Math.hypot(p.x - (a.x + ct * dx), p.z - (a.z + ct * dz)) };
}

/** How far a vertex may sit off an edge, and off another vertex, to be CALLED a T-junction /
 *  near-coincidence in this survey. Deliberately GENEROUS (0.25 m) — the point is to see the
 *  distribution, not to pick a threshold. The chosen tolerance is derived from that distribution
 *  afterwards, in the sweep (stage 3). */
const SURVEY_RADIUS_M = 0.25;

interface Diag {
    city: string; manzana: string; parcels: number;
    ok: boolean; reason: string | null;
    nonManifoldEdges: number;
    perimeterEdges: number;
    /** Perimeter vertices whose degree ≠ 2 — where the chain breaks. */
    badDegree: number;
    degreeHist: Record<number, number>;
    /** Connected components of the perimeter graph, and how many of them are closed loops. */
    components: number;
    closedComponents: number;
    /** Perimeter vertices sitting on the INTERIOR of another perimeter edge (T-junctions). */
    tJunctions: number;
    /** Distinct near-coincident vertex pairs: 0 < d ≤ SURVEY_RADIUS. */
    nearPairs: number;
    /** Nearest-non-identical-neighbour distance for each bad-degree vertex (m). */
    gaps: number[];
    /** Perpendicular offsets of the detected T-junction incidences (m). */
    tPerps: number[];
    /** Shortest genuine (post-quantisation) parcel edge in this manzana, m. */
    minEdgeLen: number;
    areaM2: number;
}

function diagnose(m: RawManzana): Diag {
    const lat0 = m.parcels[0]!.ring[0]!.lat;
    const lon0 = m.parcels[0]!.ring[0]!.lon;
    const rings = m.parcels.map((p) => openRing(project(p.ring, lat0, lon0)));

    const res = dissolveParcelsToBlockRing(rings);

    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
    const vertexPt = new Map<string, Pt>();
    let nonManifold = 0;
    let minEdgeLen = Infinity;
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            const ka = key(a), kb = key(b);
            vertexPt.set(ka, a);
            vertexPt.set(kb, b);
            if (ka === kb) continue;
            minEdgeLen = Math.min(minEdgeLen, Math.hypot(b.x - a.x, b.z - a.z));
            const ek = edgeKey(ka, kb);
            const f = edges.get(ek);
            if (f) { f.count++; if (f.count === 3) nonManifold++; }
            else edges.set(ek, { count: 1, a, b, ka, kb });
        }
    }

    const perimeter = [...edges.values()].filter((e) => e.count === 1);
    const byVertex = new Map<string, number>();
    for (const e of perimeter) {
        byVertex.set(e.ka, (byVertex.get(e.ka) ?? 0) + 1);
        byVertex.set(e.kb, (byVertex.get(e.kb) ?? 0) + 1);
    }
    const degreeHist: Record<number, number> = {};
    let badDegree = 0;
    for (const [, d] of byVertex) {
        degreeHist[d] = (degreeHist[d] ?? 0) + 1;
        if (d !== 2) badDegree++;
    }

    // Components of the perimeter graph (union-find over vertex keys).
    const parent = new Map<string, string>();
    const find = (x: string): string => {
        let r = x;
        while (parent.get(r) !== r) r = parent.get(r)!;
        while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
        return r;
    };
    for (const k of byVertex.keys()) parent.set(k, k);
    for (const e of perimeter) { const ra = find(e.ka), rb = find(e.kb); if (ra !== rb) parent.set(ra, rb); }
    const comp = new Map<string, { v: number; e: number; allDeg2: boolean }>();
    for (const [k, d] of byVertex) {
        const r = find(k);
        const c = comp.get(r) ?? { v: 0, e: 0, allDeg2: true };
        c.v++;
        if (d !== 2) c.allDeg2 = false;
        comp.set(r, c);
    }
    for (const e of perimeter) { const c = comp.get(find(e.ka))!; c.e++; }
    const closedComponents = [...comp.values()].filter((c) => c.allDeg2 && c.v === c.e && c.v >= 3).length;

    // T-junctions + near-coincident pairs, surveyed over the PERIMETER only (the edges that
    // failed to cancel — an interior T-junction that still cancelled is not a problem).
    const perimVerts = [...byVertex.keys()].map((k) => ({ k, p: vertexPt.get(k)! }));
    let tJunctions = 0;
    const tPerps: number[] = [];
    for (const e of perimeter) {
        for (const v of perimVerts) {
            if (v.k === e.ka || v.k === e.kb) continue;
            const { t, perp } = projOnSeg(v.p, e.a, e.b);
            if (perp > SURVEY_RADIUS_M) continue;
            const len = Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
            if (t * len < SURVEY_RADIUS_M || (1 - t) * len < SURVEY_RADIUS_M) continue; // endpoint, not interior
            if (t < 0 || t > 1) continue;
            tJunctions++;
            tPerps.push(perp);
        }
    }

    let nearPairs = 0;
    const gaps: number[] = [];
    for (let i = 0; i < perimVerts.length; i++) {
        let best = Infinity;
        for (let j = 0; j < perimVerts.length; j++) {
            if (i === j) continue;
            const d = Math.hypot(perimVerts[i]!.p.x - perimVerts[j]!.p.x, perimVerts[i]!.p.z - perimVerts[j]!.p.z);
            if (d > 0 && d < best) best = d;
        }
        if (best <= SURVEY_RADIUS_M) nearPairs++;
        if ((byVertex.get(perimVerts[i]!.k) ?? 0) !== 2 && Number.isFinite(best)) gaps.push(best);
    }

    return {
        city: m.city, manzana: m.manzana, parcels: m.parcels.length,
        ok: !res.degenerate, reason: res.reason,
        nonManifoldEdges: nonManifold,
        perimeterEdges: perimeter.length,
        badDegree, degreeHist,
        components: comp.size, closedComponents,
        tJunctions, nearPairs: nearPairs / 2,
        gaps, tPerps,
        minEdgeLen: Number.isFinite(minEdgeLen) ? minEdgeLen : 0,
        areaM2: m.parcels.reduce((s, p) => s + p.areaM2, 0),
    };
}

/** Deterministic PRIMARY class, most-decisive first. A manzana may exhibit several; the
 *  co-occurrence table below reports that honestly. */
function primaryClass(d: Diag): string {
    if (d.ok) return 'ok';
    if (d.nonManifoldEdges > 0) return 'non-manifold (3+ parcels on an edge)';
    if (d.perimeterEdges < 3) return 'no-perimeter (everything cancelled)';
    if (d.badDegree === 0 && d.closedComponents > 1) return 'disjoint-components (several closed loops)';
    if (d.badDegree === 0 && d.closedComponents === 1) return 'closed-but-rejected';
    if (d.tJunctions > 0 && d.gaps.filter((g) => g <= SURVEY_RADIUS_M).length === 0) return 'T-junction only';
    if (d.tJunctions === 0 && d.gaps.filter((g) => g <= SURVEY_RADIUS_M).length > 0) return 'near-coincident only';
    if (d.tJunctions > 0) return 'T-junction + near-coincident';
    return 'genuine gap / overlap (no near feature)';
}

function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—'; }
function quantiles(a: number[], qs: number[]) {
    if (!a.length) return qs.map(() => NaN);
    const s = [...a].sort((x, y) => x - y);
    return qs.map((q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!);
}

function main() {
    const raw = JSON.parse(readFileSync(new URL('./dissolve-sample.json', import.meta.url), 'utf8')) as { manzanas: RawManzana[] };
    const diags = raw.manzanas.map(diagnose);

    // ── Success by city ─────────────────────────────────────────────────────────────────
    const cities = [...new Set(diags.map((d) => d.city))].sort();
    console.log(`\n## BASELINE — production dissolve, ${diags.length} complete manzanas\n`);
    console.log('| city | n | ring | rate |');
    console.log('|---|---|---|---|');
    for (const c of cities) {
        const g = diags.filter((d) => d.city === c);
        console.log(`| ${c} | ${g.length} | ${g.filter((d) => d.ok).length} | ${pct(g.filter((d) => d.ok).length, g.length)} |`);
    }
    console.log(`| **ALL** | ${diags.length} | ${diags.filter((d) => d.ok).length} | ${pct(diags.filter((d) => d.ok).length, diags.length)} |`);

    // ── Failure classes ─────────────────────────────────────────────────────────────────
    const failing = diags.filter((d) => !d.ok);
    const classes = new Map<string, number>();
    for (const d of failing) classes.set(primaryClass(d), (classes.get(primaryClass(d)) ?? 0) + 1);
    console.log(`\n## FAILURE CLASSES — ${failing.length} failing manzanas\n`);
    console.log('| class | n | % of failures |');
    console.log('|---|---|---|');
    for (const [k, n] of [...classes].sort((a, b) => b[1] - a[1])) {
        console.log(`| ${k} | ${n} | ${pct(n, failing.length)} |`);
    }

    // ── Co-occurrence (a manzana can have several defects) ──────────────────────────────
    console.log(`\n## DEFECT PRESENCE (not exclusive)\n`);
    const has = (f: (d: Diag) => boolean) => failing.filter(f).length;
    console.log(`| defect | manzanas | % |`);
    console.log('|---|---|---|');
    console.log(`| any T-junction (≤ ${SURVEY_RADIUS_M} m) | ${has((d) => d.tJunctions > 0)} | ${pct(has((d) => d.tJunctions > 0), failing.length)} |`);
    console.log(`| any near-coincident pair | ${has((d) => d.nearPairs > 0)} | ${pct(has((d) => d.nearPairs > 0), failing.length)} |`);
    console.log(`| non-manifold edge | ${has((d) => d.nonManifoldEdges > 0)} | ${pct(has((d) => d.nonManifoldEdges > 0), failing.length)} |`);
    console.log(`| >1 perimeter component | ${has((d) => d.components > 1)} | ${pct(has((d) => d.components > 1), failing.length)} |`);
    console.log(`| all degrees == 2 (closed loops only) | ${has((d) => d.badDegree === 0)} | ${pct(has((d) => d.badDegree === 0), failing.length)} |`);

    // ── The gap distribution — this is what a tolerance must be derived FROM ────────────
    const allGaps = failing.flatMap((d) => d.gaps);
    console.log(`\n## GAP DISTRIBUTION — nearest-neighbour distance of the ${allGaps.length} break vertices (m)\n`);
    const bins = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 50, Infinity];
    let prev = 0;
    console.log('| gap range (m) | n | cumulative % |');
    console.log('|---|---|---|');
    let cum = 0;
    for (const b of bins) {
        const n = allGaps.filter((g) => g > prev && g <= b).length;
        cum += n;
        console.log(`| ${prev} – ${b} | ${n} | ${pct(cum, allGaps.length)} |`);
        prev = b;
    }
    const gq = quantiles(allGaps, [0.05, 0.25, 0.5, 0.75, 0.95]);
    console.log(`\nquantiles p5/p25/p50/p75/p95 = ${gq.map((v) => v.toFixed(3)).join(' / ')} m`);

    // ── T-junction perpendicular offsets ───────────────────────────────────────────────
    const allT = failing.flatMap((d) => d.tPerps);
    const tq = quantiles(allT, [0.5, 0.75, 0.9, 0.95, 0.99]);
    console.log(`\n## T-JUNCTION PERPENDICULAR OFFSET — ${allT.length} incidences`);
    console.log(`p50/p75/p90/p95/p99 = ${tq.map((v) => v.toFixed(4)).join(' / ')} m`);
    let tprev = 0;
    for (const b of [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25]) {
        console.log(`  ≤ ${b} m: ${pct(allT.filter((v) => v <= b).length, allT.length)}`);
        tprev = b;
    }

    // ── The UPPER bound on any tolerance: the shortest genuine cadastral edge ───────────
    const minEdges = diags.map((d) => d.minEdgeLen).filter((v) => v > 0);
    const mq = quantiles(minEdges, [0.001, 0.01, 0.05, 0.5]);
    console.log(`\n## SHORTEST GENUINE EDGE per manzana — p0.1/p1/p5/p50 = ${mq.map((v) => v.toFixed(3)).join(' / ')} m`);
    console.log(`  manzanas whose shortest edge is < 0.05 m: ${minEdges.filter((v) => v < 0.05).length} / ${minEdges.length}`);
    console.log(`  manzanas whose shortest edge is < 0.10 m: ${minEdges.filter((v) => v < 0.10).length} / ${minEdges.length}`);
    console.log(`  manzanas whose shortest edge is < 0.25 m: ${minEdges.filter((v) => v < 0.25).length} / ${minEdges.length}`);

    writeFileSync(new URL('./dissolve-diagnostics.json', import.meta.url), JSON.stringify(diags));
    console.log(`\n[classify] raw → scratchpad/dissolve-diagnostics.json`);
}

main();
