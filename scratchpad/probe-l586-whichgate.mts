// L-586 PROBE 10 — for the 5 live Barcelona blocks that STILL refuse, which of the three
// §DISSOLVE-INTERIOR-VOID gates rejects them: (a) degree-2, (b) containment, (c) the area identity?
//
// Run: npx tsx scratchpad/probe-l586-whichgate.mts

import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { VERTEX_MATCH_TOLERANCE_M } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { pointInPolygon } from '../packages/site-validators/src/index.js';
import type { Pt } from '@pryzm/schemas';

const R = 6_378_137, D = Math.PI / 180;
const key = (p: Pt) => { const q = (v: number) => Math.round(v / VERTEX_MATCH_TOLERANCE_M); return `${q(p.x) + 0},${q(p.z) + 0}`; };
const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const A = (r: ReadonlyArray<Pt>) => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; s += p.x * q.z - q.x * p.z; } return Math.abs(s / 2); };
const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const c = Math.cos(lat0 * D);
    return ring.map((p) => ({ x: (p.lon - lon0) * D * R * c, z: -(p.lat - lat0) * D * R }));
};

for (const refcat of ['0627611DF3802H', '0422328DF3802C', '0130601DF3803A', '9720801DF2892B', '9819101DF2891H']) {
    const manzana = manzanaPrefix(refcat)!;
    const sr = await fetch('https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
        + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`);
    const sp = parseParcelCollectionGml(await sr.text()) as any[];
    const self = sp.find((p) => p.refcat === refcat) ?? sp[0];
    const lat = self.ring.reduce((s: number, p: any) => s + p.lat, 0) / self.ring.length;
    const lon = self.ring.reduce((s: number, p: any) => s + p.lon, 0) / self.ring.length;
    const br = await fetch(buildParcelBboxUrl(lat, lon));
    const all = parseParcelCollectionGml(await br.text()) as Array<{ refcat: string; ring: any[]; areaM2: number }>;
    const matched = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
    const rings = matched.map((p) => project(p.ring, lat, lon));

    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
    let nonManifold = false;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const ka = key(a), kb = key(b); if (ka === kb) continue;
        const k = ekey(ka, kb); const e = edges.get(k);
        if (e) { e.count++; if (e.count > 2) nonManifold = true; } else edges.set(k, { count: 1, a, b, ka, kb });
    }
    const perim = [...edges.values()].filter((e) => e.count === 1);
    const deg = new Map<string, number>();
    for (const e of perim) for (const k of [e.ka, e.kb]) deg.set(k, (deg.get(k) ?? 0) + 1);
    const badDeg = [...deg.entries()].filter(([, d]) => d !== 2);

    // Chain loops (only valid when degree is 2 everywhere).
    const byV = new Map<string, typeof perim>();
    for (const e of perim) for (const k of [e.ka, e.kb]) { const l = byV.get(k); if (l) l.push(e); else byV.set(k, [e]); }
    const sorted = [...edges.entries()].filter(([, e]) => e.count === 1).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, e]) => e);
    const visited = new Set<any>(); const loops: Pt[][] = [];
    let chainFail = false;
    if (badDeg.length === 0) {
        for (const seed of sorted) {
            if (visited.has(seed)) continue;
            const out: Pt[] = [seed.a, seed.b]; visited.add(seed);
            let cur = seed.kb, prev: any = seed; let closed = false;
            for (let s = 1; s < sorted.length; s++) {
                const cand = byV.get(cur); if (!cand) { chainFail = true; break; }
                const next = cand.find((e) => e !== prev); if (!next) { chainFail = true; break; }
                const nk = next.ka === cur ? next.kb : next.ka;
                const np = next.ka === cur ? next.b : next.a;
                visited.add(next);
                if (nk === seed.ka) { closed = true; break; }
                out.push(np); cur = nk; prev = next;
            }
            if (!closed) { chainFail = true; break; }
            loops.push(out);
        }
    }
    const areas = loops.map(A).sort((a, b) => b - a);
    const outerIdx = loops.reduce((bi, l, i) => (A(l) > A(loops[bi]!) ? i : bi), 0);
    const outer = loops[outerIdx];
    const inner = loops.filter((_, i) => i !== outerIdx);
    const contained = outer ? inner.map((l) => l.every((p) => pointInPolygon(p, outer))) : [];
    const parcelSum = rings.reduce((s, r) => s + A(r), 0);
    const voidSum = inner.reduce((s, r) => s + A(r), 0);
    const residual = outer ? Math.abs(A(outer) - voidSum - parcelSum) : NaN;

    console.log(`\n${refcat} m${manzana} — ${matched.length} parcels, ${perim.length} perimeter edges`);
    console.log(`  (0) non-manifold edge present : ${nonManifold}`);
    console.log(`  (a) vertices of degree ≠ 2    : ${badDeg.length} ${badDeg.length ? JSON.stringify(badDeg.slice(0, 6)) : ''}`);
    console.log(`      chain failed              : ${chainFail}`);
    console.log(`      loops                     : ${loops.length}  areas ${areas.map((a) => a.toFixed(3)).join(', ')}`);
    console.log(`  (b) inner loops contained     : ${JSON.stringify(contained)}`);
    console.log(`  (c) identity |outer|-Σvoids   : ${outer ? (A(outer) - voidSum).toFixed(4) : 'n/a'} m²  vs Σ|parcels| ${parcelSum.toFixed(4)} m²  ⇒ residual ${residual.toFixed(6)} m² (bound ${(1e-6 * parcelSum).toFixed(6)})`);
    await new Promise((r) => setTimeout(r, 500));
}
