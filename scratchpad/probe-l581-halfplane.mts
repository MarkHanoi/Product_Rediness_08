// L-581 — CANDIDATE FIX, MEASURED BEFORE PROPOSED.
//
// THE DEFECT (proven): `insetPolygonPerEdge` mitres per-edge offset lines and, when an inset
// segment reverses, DROPS that edge's line and re-mitres. Dropping ABANDONS that edge's constraint,
// so neighbours mitre deep into the polygon and cascade further reversals. Measured on a real
// Eixample block at front=5: side=5 → 48 verts, 4.9 → 40, 4 → 24, 2 → DEGENERATE. The collapse
// scales with the DIFFERENCE between adjacent setbacks, and Art. 242 is the worst possible case
// (`front: 29 m, side: 0`).
//
// THE CANDIDATE: for the Art. 242 question specifically — *"the part of the block further than d
// from EVERY street frontage"* — clip the block by one HALF-PLANE per front edge (Sutherland–
// Hodgman). Properties that matter here:
//   • MONOTONE in d by construction. The bisection in `solveBlockDerivedDepth` REQUIRES monotonicity
//     and today does not get it — a collapse makes area jump 94% → 0 across an infinitesimal step.
//   • CANNOT collapse spuriously. Clipping only ever removes area; an empty result means genuinely
//     no free area, which is exactly the semantic the solver wants to read.
//   • Non-front edges are never clipped, so the block keeps its real boundary — literally
//     "equidistant from the street frontages".
//
// ⚠ ITS KNOWN LIMITATION, STATED UP FRONT: a half-plane is INFINITE, so a CONCAVE front edge can cut
// away legitimate area far from itself. On a convex-ish Eixample illa that is negligible; on an
// L-shaped block it would UNDER-report the depth. Under-reporting is the conservative direction for
// a compliance number, but it is still wrong, and this probe exists to size that error rather than
// assume it away.
//
// WHAT THIS MEASURES: over the same 65 real blocks — (a) how many produce a sound result under each
// method, and (b) where BOTH succeed, how far the depths disagree. If they agree closely where both
// work, the half-plane method is a safe replacement. If it systematically under-reports, it is not.
import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { measureStreetWidths } from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import type { Pt } from '@pryzm/schemas';
import { readFileSync } from 'node:fs';

const R = 6_378_137, D2R = Math.PI / 180;
const project = (r: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const c = Math.cos(lat0 * D2R);
    return r.map((p) => ({ x: (p.lon - lon0) * D2R * R * c, z: -(p.lat - lat0) * D2R * R }));
};
const areaOf = (r: ReadonlyArray<Pt>): number => {
    if (r.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a) / 2;
};
const signed = (r: ReadonlyArray<Pt>): number => {
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p.x * q.z - q.x * p.z; }
    return a / 2;
};

/** Sutherland–Hodgman: keep the part of `poly` with (p − a)·n ≥ 0. */
function clipHalfPlane(poly: Pt[], a: Pt, n: Pt): Pt[] {
    if (poly.length < 3) return [];
    const side = (p: Pt) => (p.x - a.x) * n.x + (p.z - a.z) * n.z;
    const out: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
        const cur = poly[i]!, nxt = poly[(i + 1) % poly.length]!;
        const dc = side(cur), dn = side(nxt);
        if (dc >= 0) out.push(cur);
        if ((dc >= 0) !== (dn >= 0)) {
            const t = dc / (dc - dn);
            out.push({ x: cur.x + t * (nxt.x - cur.x), z: cur.z + t * (nxt.z - cur.z) });
        }
    }
    return out;
}

/** The candidate erosion: clip the block by one inward half-plane per FRONT edge. */
function erodeByFrontHalfPlanes(ring: Pt[], cls: string[], d: number): Pt[] {
    // Canonicalise to CCW so the inward normal is consistently (−uz, ux).
    let r = ring, c = cls;
    if (signed(ring) < 0) {
        const n = ring.length;
        r = ring.slice().reverse();
        c = new Array(n);
        for (let i = 0; i < n; i++) c[i] = cls[(n - 1 - i + n) % n]!;
    }
    let poly = r.map((p) => ({ x: p.x, z: p.z }));
    for (let i = 0; i < r.length; i++) {
        if (c[i] !== 'front') continue;
        const a = r[i]!, b = r[(i + 1) % r.length]!;
        const ux = b.x - a.x, uz = b.z - a.z;
        const len = Math.hypot(ux, uz);
        if (len < 1e-9) continue;
        const nx = -uz / len, nz = ux / len;                 // inward normal (CCW)
        poly = clipHalfPlane(poly, { x: a.x + nx * d, z: a.z + nz * d }, { x: nx, z: nz });
        if (poly.length < 3) return [];
    }
    return poly;
}

interface BP { refcat: string; ring: Array<{ lat: number; lon: number }> }
const rows = JSON.parse(readFileSync(new URL('./l576-layer6.json', import.meta.url), 'utf8')) as
    Array<{ refcat: string }>;
const subjects = rows.map((r) => r.refcat).slice(0, 30); // 30 is enough to size the disagreement

const INTERIOR = 0.30, MIN_D = 11, MAX_D = 30;
/** Bisect for the largest d whose free ratio still meets the ordinance, using `freeAt`. */
function solve(freeAt: (d: number) => number, blockArea: number): { d: number; ratio: number; ok: boolean } {
    const need = blockArea * INTERIOR;
    if (freeAt(MIN_D) < need) return { d: MIN_D, ratio: freeAt(MIN_D) / blockArea, ok: false };
    if (freeAt(MAX_D) >= need) return { d: MAX_D, ratio: freeAt(MAX_D) / blockArea, ok: true };
    let lo = MIN_D, hi = MAX_D;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (freeAt(m) >= need) lo = m; else hi = m; }
    return { d: lo, ratio: freeAt(lo) / blockArea, ok: true };
}

let bothOk = 0, onlyHalf = 0, onlyMiter = 0, neither = 0;
const deltas: number[] = [];
console.log('refcat            miter            half-plane        Δdepth');
for (const refcat of subjects) {
    const manzana = manzanaPrefix(refcat);
    try {
        const u = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
            + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
        const parsed = parseParcelCollectionGml(await (await fetch(u)).text()) as BP[];
        const self = parsed.find((p) => p.refcat === refcat) ?? parsed[0];
        if (!self) continue;
        const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
        const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;
        const all = parseParcelCollectionGml(await (await fetch(buildParcelBboxUrl(lat, lon))).text()) as BP[];
        const mine = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
        const others = all.filter((p) => manzanaPrefix(p.refcat) !== manzana);
        const dis = dissolveParcelsToBlockRing(mine.map((p) => project(p.ring, lat, lon)));
        if (dis.degenerate) continue;
        const meas = measureStreetWidths(dis.ring, others.map((p) => project(p.ring, lat, lon)));
        const front = new Set(meas.measurements.map((m) => m.edgeIndex));
        const cls = dis.ring.map((_, i) => (front.has(i) ? 'front' : 'side'));
        const blockArea = areaOf(dis.ring);
        const ring = dis.ring as Pt[];

        const miterFree = (d: number) => {
            const r = insetPolygonPerEdge(ring, cls as never[], { front: d, side: 0, rear: 0, unclassified: 0 });
            return r.degenerate ? 0 : areaOf(r.polygon);
        };
        const halfFree = (d: number) => areaOf(erodeByFrontHalfPlanes(ring, cls, d));

        const m = solve(miterFree, blockArea);
        const h = solve(halfFree, blockArea);
        if (m.ok && h.ok) { bothOk++; deltas.push(h.d - m.d); }
        else if (h.ok) onlyHalf++;
        else if (m.ok) onlyMiter++;
        else neither++;
        const dl = m.ok && h.ok ? `${(h.d - m.d >= 0 ? '+' : '')}${(h.d - m.d).toFixed(1)} m` : '—';
        console.log(`${refcat}  ${(m.ok ? `${m.d.toFixed(1)}m ${(m.ratio * 100).toFixed(0)}%` : 'FAIL').padEnd(16)} ` +
            `${(h.ok ? `${h.d.toFixed(1)}m ${(h.ratio * 100).toFixed(0)}%` : 'FAIL').padEnd(17)} ${dl}`);
    } catch { /* skip */ }
    await new Promise((r) => setTimeout(r, 350));
}

console.log(`\nboth ok ${bothOk} · only HALF-PLANE ${onlyHalf} · only miter ${onlyMiter} · neither ${neither}`);
if (deltas.length) {
    deltas.sort((a, b) => a - b);
    const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
    console.log(`Δdepth where both succeed: min ${deltas[0]!.toFixed(2)} · median ` +
        `${deltas[Math.floor(deltas.length / 2)]!.toFixed(2)} · max ${deltas[deltas.length - 1]!.toFixed(2)} · mean ${mean.toFixed(2)} m`);
    console.log(mean < -0.5
        ? '⇒ the half-plane method UNDER-reports depth — the concavity limitation is REAL here. Not a safe swap.'
        : Math.abs(mean) <= 0.5
        ? '⇒ the two AGREE where both work, and the half-plane method also solves the cases the miter path fails. SAFE SWAP.'
        : '⇒ the half-plane method reports DEEPER — investigate before trusting it.');
}
