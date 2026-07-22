// L-586 PROBE 6 — two questions the taxonomy raised.
//
// Q1. The 7 "ours" failures are ONE big loop + hair loops (0.001–0.325% of its area), with EVERY
//     vertex of degree exactly 2 and no 3+-shared edge. The §DISSOLVE-TJUNCTION-SPLIT repair was
//     built for exactly that and yet reports splitCount 0. WHY does it find no candidate? Measure
//     each hair loop: vertex count, area, perimeter, longest edge, and the perpendicular offset of
//     its vertices from the nearest MAIN-loop edge. If those offsets sit above 0.111 m the repair
//     is correctly declining; if they sit below, the repair has a reachability bug.
//
// Q2. The 7 `too-few-parcels` refusals: is the manzana genuinely ONE parcel occupying a whole
//     block (→ upstream reality, and our <3 guard is over-refusing), or did the 5-char prefix
//     filter lose siblings? INDEPENDENT ORACLE: blocks are separated by STREETS, so a parcel that
//     really is a whole manzana shares NO boundary with any parcel of another manzana. Count
//     shared-boundary length against every other bbox parcel.
//
// Run: npx tsx scratchpad/probe-l586-hairloops.mts

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { VERTEX_MATCH_TOLERANCE_M } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const R = 6_378_137, D = Math.PI / 180;

const Q1 = ['0627611DF3802H', '0422328DF3802C', '0130601DF3803A', '9720801DF2892B', '9819101DF2891H', '0942306DF3804D', '1437807DF3813E'];
const Q2 = ['0123301DF3802C', '9521901DF2892B', '0939501DF3803H', '1637801DF3813F', '1735701DF3813F', '0011101DF3801C', '0013201DF3801C'];

const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const c = Math.cos(lat0 * D);
    return ring.map((p) => ({ x: (p.lon - lon0) * D * R * c, z: -(p.lat - lat0) * D * R }));
};
const key = (p: Pt) => { const q = (v: number) => Math.round(v / VERTEX_MATCH_TOLERANCE_M); return `${q(p.x) + 0},${q(p.z) + 0}`; };
const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function ptSeg(p: Pt, a: Pt, b: Pt) {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    if (l2 === 0) return Math.hypot(p.x - a.x, p.z - a.z);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

interface Fetched { refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }
async function fetchBlock(refcat: string) {
    const selfUrl = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
        + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
    const sr = await fetch(selfUrl); if (!sr.ok) throw new Error(`self HTTP ${sr.status}`);
    const sp = parseParcelCollectionGml(await sr.text()) as Fetched[];
    const self = sp.find((p) => p.refcat === refcat) ?? sp[0];
    if (!self) throw new Error('self missing');
    const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
    const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;
    const br = await fetch(buildParcelBboxUrl(lat, lon)); if (!br.ok) throw new Error(`bbox HTTP ${br.status}`);
    const all = parseParcelCollectionGml(await br.text()) as Fetched[];
    return { lat, lon, self, all, manzana: manzanaPrefix(refcat)! };
}

// ── Q1 ────────────────────────────────────────────────────────────────────────────────
console.log('## Q1 — the hair loops: what are they, and why does the 0.10 m split miss them?\n');
const q1rows: any[] = [];
for (const refcat of Q1) {
    let f;
    try { f = await fetchBlock(refcat); } catch (e) { console.log(`  ${refcat}: NETWORK ${(e as Error).message}`); continue; }
    const matched = f.all.filter((p) => manzanaPrefix(p.refcat) === f.manzana);
    const rings = matched.map((p) => project(p.ring, f.lat, f.lon));
    const edges = new Map<string, { count: number; a: Pt; b: Pt; ka: string; kb: string }>();
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        const ka = key(a), kb = key(b); if (ka === kb) continue;
        const k = ekey(ka, kb); const e = edges.get(k); if (e) e.count++; else edges.set(k, { count: 1, a, b, ka, kb });
    }
    const perim = [...edges.values()].filter((e) => e.count === 1);
    // components
    const parent = new Map<string, string>();
    const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; return r; };
    for (const e of perim) for (const k of [e.ka, e.kb]) if (!parent.has(k)) parent.set(k, k);
    for (const e of perim) { const a = find(e.ka), b = find(e.kb); if (a !== b) parent.set(a, b); }
    const comps = new Map<string, typeof perim>();
    for (const e of perim) { const r = find(e.ka); const c = comps.get(r); if (c) c.push(e); else comps.set(r, [e]); }
    const sized = [...comps.values()].map((es) => {
        let s = 0; for (const e of es) s += e.a.x * e.b.z - e.b.x * e.a.z;
        return { es, area: Math.abs(s / 2), edges: es.length, perim: es.reduce((t, e) => t + Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z), 0) };
    }).sort((a, b) => b.area - a.area);
    const main = sized[0]!;
    console.log(`  ${refcat} m${f.manzana}: ${matched.length} parcels, main loop ${main.edges} edges ${main.area.toFixed(0)} m²; ${sized.length - 1} hair loop(s)`);
    for (const h of sized.slice(1)) {
        const verts = [...new Set(h.es.flatMap((e) => [e.a, e.b]))];
        const offs = verts.map((v) => Math.min(...main.es.map((e) => ptSeg(v, e.a, e.b))));
        const longest = Math.max(...h.es.map((e) => Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z)));
        console.log(
            `      hair: ${h.edges} edges, area ${h.area.toFixed(4)} m², perimeter ${h.perim.toFixed(3)} m, longest edge ${longest.toFixed(3)} m; ` +
            `vertex offsets to MAIN loop: min ${Math.min(...offs).toFixed(4)} m  max ${Math.max(...offs).toFixed(4)} m`,
        );
        q1rows.push({ refcat, hairEdges: h.edges, hairArea: h.area, hairPerim: h.perim, longestEdge: longest, minOffset: Math.min(...offs), maxOffset: Math.max(...offs) });
    }
    await new Promise((r) => setTimeout(r, 500));
}

// ── Q2 ────────────────────────────────────────────────────────────────────────────────
console.log('\n## Q2 — single-parcel manzanas: whole block, or lost siblings?\n');
console.log('  ORACLE: a parcel that is a whole manzana is surrounded by STREET, so it shares no');
console.log('  boundary with any parcel of another manzana. Shared length is measured at 0.15 m.\n');
const q2rows: any[] = [];
for (const refcat of Q2) {
    let f;
    try { f = await fetchBlock(refcat); } catch (e) { console.log(`  ${refcat}: NETWORK ${(e as Error).message}`); continue; }
    const self = project(f.self.ring, f.lat, f.lon);
    let sharedLen = 0; const sharers = new Set<string>();
    let minGap = Infinity;
    for (const p of f.all) {
        if (p.refcat === f.self.refcat) continue;
        const other = project(p.ring, f.lat, f.lon);
        for (let i = 0; i < self.length; i++) {
            const a = self[i]!, b = self[(i + 1) % self.length]!;
            const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
            let d = Infinity;
            for (let j = 0; j < other.length; j++) d = Math.min(d, ptSeg(mid, other[j]!, other[(j + 1) % other.length]!));
            minGap = Math.min(minGap, d);
            if (d < 0.15) { sharedLen += Math.hypot(b.x - a.x, b.z - a.z); sharers.add(p.refcat); }
        }
    }
    let peri = 0; for (let i = 0; i < self.length; i++) { const a = self[i]!, b = self[(i + 1) % self.length]!; peri += Math.hypot(b.x - a.x, b.z - a.z); }
    let area = 0; for (let i = 0; i < self.length; i++) { const a = self[i]!, b = self[(i + 1) % self.length]!; area += a.x * b.z - b.x * a.z; }
    area = Math.abs(area / 2);
    const verdict = sharedLen / peri < 0.02
        ? 'FREE-STANDING → genuinely a whole manzana; our <3 guard is REFUSING A VALID BLOCK'
        : `ABUTS ${sharers.size} other-manzana parcel(s) over ${(sharedLen / peri * 100).toFixed(1)}% of its perimeter → not a whole block`;
    console.log(`  ${refcat} m${f.manzana}: area ${area.toFixed(0)} m², perimeter ${peri.toFixed(0)} m, shared with other manzanas ${sharedLen.toFixed(1)} m (${(sharedLen / peri * 100).toFixed(1)}%), nearest other parcel ${minGap.toFixed(2)} m — ${verdict}`);
    q2rows.push({ refcat, manzana: f.manzana, area, perimeter: peri, sharedLen, sharedPct: sharedLen / peri * 100, sharers: [...sharers], minGap });
    await new Promise((r) => setTimeout(r, 500));
}

writeFileSync(resolve(ROOT, 'scratchpad/l586-hairloops.json'), JSON.stringify({ ranAt: new Date().toISOString(), q1: q1rows, q2: q2rows }, null, 2));
console.log('\nwrote scratchpad/l586-hairloops.json');
