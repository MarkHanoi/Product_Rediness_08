// L-581 — FREEZE the real Barcelona blocks into a deterministic fixture.
//
// WHY THIS EXISTS. Every L-581 measurement so far depends on a live Catastro WFS round-trip, so it
// is slow, flaky, and NOT reproducible — a reviewer re-running the comparison can legitimately get
// different numbers because the upstream failed on a different block. That is unacceptable for a
// decision this size: the evidence for a change to legally-binding geometry must be re-checkable
// byte-for-byte, offline, by someone who does not trust me.
//
// So: touch the network ONCE, here, and write the dissolved block rings + their front/side edge
// classifications to a JSON fixture. Everything downstream (the miter-vs-half-plane comparison, the
// eventual regression tests) reads the fixture and is pure.
//
// ⚠ The classification is derived from `measureStreetWidths`, NOT invented — an edge is a street
// frontage exactly when a ray cast from it reached an opposing frontage. Freezing an INVENTED
// classification would make every downstream test measure my assumption instead of the ordinance.
//
// Run:  npx tsx scratchpad/probe-l581-build-fixture.mts
import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { measureStreetWidths } from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import type { Pt } from '@pryzm/schemas';
import { readFileSync, writeFileSync } from 'node:fs';

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
/** Is the ring convex? Recorded per block so the CONCAVITY limitation can be measured, not assumed. */
function convexity(ring: Pt[]): { convex: boolean; reflexCount: number } {
    let pos = 0, neg = 0, reflex = 0;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!, c = ring[(i + 2) % ring.length]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (cross > 1e-9) pos++; else if (cross < -1e-9) neg++;
    }
    const ccw = pos >= neg;
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!, c = ring[(i + 2) % ring.length]!;
        const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
        if (ccw ? cross < -1e-9 : cross > 1e-9) reflex++;
    }
    return { convex: reflex === 0, reflexCount: reflex };
}

interface BP { refcat: string; ring: Array<{ lat: number; lon: number }> }
const prior = JSON.parse(readFileSync(new URL('./l576-layer6.json', import.meta.url), 'utf8')) as
    Array<{ refcat: string }>;
const subjects = [...new Set(prior.map((r) => r.refcat))];

interface Fixture {
    refcat: string; manzana: string;
    blockRing: Pt[];
    edgeClassifications: string[];
    blockAreaM2: number;
    frontEdges: number; totalEdges: number;
    shortestEdgeM: number;
    convex: boolean; reflexCount: number;
}
const out: Fixture[] = [];

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
        const ring = dis.ring as Pt[];
        let shortest = Infinity;
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            shortest = Math.min(shortest, Math.hypot(b.x - a.x, b.z - a.z));
        }
        const cx = convexity(ring);
        out.push({
            refcat, manzana,
            // Round to millimetres: below that is cadastral noise, and an unrounded float would make
            // the fixture churn on every re-fetch for no informational gain.
            blockRing: ring.map((p) => ({ x: Math.round(p.x * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 })),
            edgeClassifications: ring.map((_, i) => (front.has(i) ? 'front' : 'side')),
            blockAreaM2: Math.round(areaOf(ring) * 100) / 100,
            frontEdges: front.size, totalEdges: ring.length,
            shortestEdgeM: Math.round(shortest * 1000) / 1000,
            convex: cx.convex, reflexCount: cx.reflexCount,
        });
        const f = out[out.length - 1]!;
        console.log(`✔ ${refcat} — ${f.blockAreaM2} m², ${f.totalEdges} edges (${f.frontEdges} front), ` +
            `shortest ${f.shortestEdgeM} m, ${f.convex ? 'CONVEX' : `${f.reflexCount} reflex vertices`}`);
    } catch (e) {
        console.warn(`✖ ${refcat}: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 350));
}

writeFileSync(new URL('./l581-blocks.fixture.json', import.meta.url), JSON.stringify(out, null, 1));
const convexN = out.filter((f) => f.convex).length;
console.log(`\nfrozen ${out.length} block(s) → scratchpad/l581-blocks.fixture.json`);
console.log(`convexity: ${convexN} convex · ${out.length - convexN} with reflex vertices`);
console.log('⚠ The non-convex count is the population where the half-plane method\'s known limitation');
console.log('  can bite. If it is ~0, the 30-block comparison CANNOT settle that question and a');
console.log('  synthetic L-shaped block must be added before the swap is trusted.');
