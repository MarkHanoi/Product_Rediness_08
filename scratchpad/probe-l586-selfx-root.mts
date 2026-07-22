// L-586 PROBE 2 — ROOT-CAUSE the 11 self-intersecting rings.
//
// Hypotheses, tested in order against the 11 named manzanas:
//   H1  The INPUT parcel rings are themselves self-intersecting (upstream defect, inherited).
//   H2  The block genuinely is non-simple (parcels touch at a point / pinch) and the chain
//       happened to walk it as one loop.
//   H3  `dropCollinear` introduces the crossing — the ring is simple before it, crossed after.
//   H4  The chain traversal picked the wrong branch.
//
// It re-implements the exact-cancellation pipeline stage by stage so each stage's output can be
// tested independently. The re-implementation is checked against the production function's ring
// (must be identical) so a divergence cannot be mistaken for a finding.
//
// Run: npx tsx scratchpad/probe-l586-selfx-root.mts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dissolveParcelsToBlockRing, VERTEX_MATCH_TOLERANCE_M } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { pointSegmentDistance, polygonSignedArea } from '../packages/site-validators/src/index.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as { manzanas: M[] };
const R = 6_378_137, D = Math.PI / 180;

// ── shared geometry helpers ───────────────────────────────────────────────────────────
function segX(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
function crossings(ring: ReadonlyArray<Pt>) {
    const n = ring.length; const out: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segX(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) out.push([i, j]);
    }
    return out;
}

// ── a faithful re-implementation of blockRing.ts's exact pass, stage-separated ─────────
const key = (p: Pt) => { const q = (v: number) => Math.round(v / VERTEX_MATCH_TOLERANCE_M); return `${q(p.x) + 0},${q(p.z) + 0}`; };
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function openRing(ring: ReadonlyArray<Pt>): ReadonlyArray<Pt> {
    if (ring.length < 2) return ring;
    return key(ring[0]!) === key(ring[ring.length - 1]!) ? ring.slice(0, -1) : ring;
}
function dropCollinear(ring: ReadonlyArray<Pt>): Pt[] {
    if (ring.length < 3) return [...ring];
    const out: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
        const prev = ring[(i - 1 + ring.length) % ring.length]!, cur = ring[i]!, next = ring[(i + 1) % ring.length]!;
        if (pointSegmentDistance(cur, prev, next) > VERTEX_MATCH_TOLERANCE_M) out.push(cur);
    }
    return out.length >= 3 ? out : [...ring];
}
/** Returns the chained ring BEFORE dropCollinear, or null if the exact pass would refuse. */
function chainOnly(parcelRings: ReadonlyArray<ReadonlyArray<Pt>>): Pt[] | null {
    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
    for (const rawR of parcelRings) {
        const ring = openRing(rawR);
        if (ring.length < 3) return null;
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            const ka = key(a), kb = key(b);
            if (ka === kb) continue;
            const ek = edgeKey(ka, kb);
            const f = edges.get(ek);
            if (f) { f.count += 1; if (f.count > 2) return null; } else edges.set(ek, { count: 1, a, b, ka, kb });
        }
    }
    const perimeter = [...edges.entries()].filter(([, e]) => e.count === 1)
        .sort(([k1], [k2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : 0)).map(([, e]) => e);
    if (perimeter.length < 3) return null;
    const byVertex = new Map<string, typeof perimeter>();
    for (const e of perimeter) for (const k of [e.ka, e.kb]) { const l = byVertex.get(k); if (l) l.push(e); else byVertex.set(k, [e]); }
    for (const [, l] of byVertex) if (l.length !== 2) return null;
    const start = perimeter[0]!;
    const out: Pt[] = [start.a, start.b];
    let currentKey = start.kb, previous = start;
    for (let step = 1; step < perimeter.length; step++) {
        const cands = byVertex.get(currentKey); if (!cands) return null;
        const next = cands.find((e) => e !== previous); if (!next) return null;
        const nextKey = next.ka === currentKey ? next.kb : next.ka;
        const nextPt = next.ka === currentKey ? next.b : next.a;
        if (nextKey === key(out[0]!)) { if (step !== perimeter.length - 1) return null; break; }
        out.push(nextPt); currentKey = nextKey; previous = next;
    }
    if (out.length !== perimeter.length) return null;
    return polygonSignedArea(out) < 0 ? [...out].reverse() : out;
}

const TARGETS = new Set([
    'Barcelona/96375', 'Cordoba/29588', 'Cordoba/33597', 'Cordoba/44504', 'Cordoba/44544',
    'Madrid-centro/99398', 'Sevilla/54202', 'Valencia/51296', 'Valencia/52263',
    'Valencia/55296', 'Valencia/60255',
]);

let h1 = 0, h3 = 0, other = 0;
const allRows: Array<{ id: string; inputSelfX: number; preDrop: number; post: number }> = [];

for (const m of raw.manzanas) {
    const id = `${m.city}/${m.manzana}`;
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) => p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })));
    const prod = dissolveParcelsToBlockRing(rings);
    if (prod.degenerate) continue;
    const post = crossings(prod.ring).length;
    // H1 — do any INPUT parcel rings self-intersect?
    const inputSelfX = rings.filter((r) => crossings(openRing(r)).length > 0).length;
    if (!TARGETS.has(id)) { if (post === 0 && inputSelfX === 0) continue; }
    const chained = prod.quality.path === 'exact' ? chainOnly(rings) : null;
    const preDrop = chained ? crossings(chained).length : -1;
    // sanity: our re-implementation must reproduce production exactly on the exact path
    if (chained) {
        const mine = dropCollinear(chained);
        const same = mine.length === prod.ring.length && mine.every((p, i) => key(p) === key(prod.ring[i]!));
        if (!same) console.log(`  !! re-implementation diverged on ${id} — treat its numbers with suspicion`);
    }
    allRows.push({ id, inputSelfX, preDrop, post });
}

console.log('## SELF-INTERSECTION: which STAGE introduces it?\n');
console.log('| manzana | parcels w/ self-intersecting INPUT ring | crossings BEFORE dropCollinear | crossings AFTER (shipped ring) | verdict |');
console.log('|---|---|---|---|---|');
for (const r of allRows.sort((a, b) => a.id.localeCompare(b.id))) {
    let verdict: string;
    if (r.preDrop === -1) verdict = 'repaired path — pre-drop not reconstructed';
    else if (r.preDrop > 0 && r.inputSelfX > 0) { verdict = 'H1 INPUT parcel geometry already crossed'; h1++; }
    else if (r.preDrop > 0) { verdict = 'H2/H4 crossed at chain time, inputs clean'; other++; }
    else if (r.post > 0) { verdict = 'H3 *** dropCollinear INTRODUCED it ***'; h3++; }
    else verdict = 'clean ring, but an input parcel self-intersects';
    console.log(`| ${r.id} | ${r.inputSelfX} | ${r.preDrop} | ${r.post} | ${verdict} |`);
}
console.log(`\n  H1 inherited-from-input: ${h1}   H3 dropCollinear-introduced: ${h3}   other: ${other}`);
