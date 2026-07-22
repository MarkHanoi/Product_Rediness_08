// L-581 — WHICH condition makes the inset collapse on a real Eixample block at 1 m?
//
// The Art. 242 call is MIXED: `{front: d, side: 0, rear: 0, unclassified: 0}`. Zero-setback edges
// keep their original supporting line while front edges move inward, which is the party-wall
// (*mitgera*) configuration L-462 already had to patch once. Four variants isolate the cause:
//
//   A  as production          front=d, others 0      ← the failing call
//   B  uniform                every edge = d         ← is it the MIXTURE, or the ring itself?
//   C  as production, tiny d  front=0.01             ← does ANY nonzero front setback collapse it?
//   D  uniform, tiny d        every edge = 0.01
//
// If B survives where A fails, the ring is fine and the MIXTURE is the defect.
// If both fail, the ring geometry (50 verts, cadastral noise) defeats the offset regardless.
import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { measureStreetWidths } from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import type { Pt } from '@pryzm/schemas';

const R = 6_378_137, D2R = Math.PI / 180;
const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const c = Math.cos(lat0 * D2R);
    return ring.map((p) => ({ x: (p.lon - lon0) * D2R * R * c, z: -(p.lat - lat0) * D2R * R }));
};
const areaOf = (r: ReadonlyArray<Pt>): number => {
    if (r.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a) / 2;
};
interface BP { refcat: string; ring: Array<{ lat: number; lon: number }> }

for (const refcat of ['0128801DF3802G', '9619801DF2891H']) {
    const manzana = manzanaPrefix(refcat);
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
    const d = dissolveParcelsToBlockRing(mine.map((p) => project(p.ring, lat, lon)));
    if (d.degenerate) continue;
    const meas = measureStreetWidths(d.ring, others.map((p) => project(p.ring, lat, lon)));
    const front = new Set(meas.measurements.map((m) => m.edgeIndex));
    const mixed = d.ring.map((_, i) => (front.has(i) ? 'front' : 'side')) as never[];
    const uniform = d.ring.map(() => 'front') as never[];
    const blockArea = areaOf(d.ring);

    // Shortest edge — a ring full of centimetre-scale cadastral noise is the classic offset killer.
    let shortest = Infinity;
    for (let i = 0; i < d.ring.length; i++) {
        const a = d.ring[i]!, b = d.ring[(i + 1) % d.ring.length]!;
        shortest = Math.min(shortest, Math.hypot(b.x - a.x, b.z - a.z));
    }

    console.log(`\n═══ ${refcat} — block ${blockArea.toFixed(0)} m², ${d.ring.length} verts, ` +
        `${front.size} front / ${d.ring.length - front.size} side, shortest edge ${shortest.toFixed(3)} m`);

    const run = (label: string, cls: never[], front: number, side: number) => {
        const r = insetPolygonPerEdge(d.ring, cls, { front, side, rear: side, unclassified: side });
        const a = r.degenerate ? 0 : areaOf(r.polygon);
        console.log(`  ${label.padEnd(30)} → ${r.degenerate ? 'DEGENERATE' : `ok ${String(r.polygon.length).padStart(3)} verts, ${a.toFixed(0)} m²`}`);
    };
    // ⚠ THE DECISIVE MATRIX. If side=0 fails while an infinitesimal side=0.001 succeeds, the defect
    // is the EXACTLY-ZERO setback (an unmoved supporting line mitered against moved ones), not the
    // depth and not the ring. That distinction picks the fix.
    // ⚠ THE DECISIVE PAIR. Same MIXED classification array both times; the only difference is
    // whether the two setback VALUES are equal. Equal values make the mixed call numerically
    // identical to the uniform one that succeeds — so if `front=5 side=5` works and `front=5
    // side=4.9` does not, the defect is DIFFERING setbacks, and the classification plumbing is
    // exonerated. If `front=5 side=5` ALSO fails, the defect is in how the classification array
    // itself is consumed, since uniform-classification/uniform-value succeeds on this same ring.
    run('mixed cls, front=5 side=5', mixed, 5, 5);
    run('mixed cls, front=5 side=4.9', mixed, 5, 4.9);
    run('mixed cls, front=5 side=4', mixed, 5, 4);
    run('mixed cls, front=5 side=2', mixed, 5, 2);
    console.log('  --- uniform classification, same values (control) ---');
    run('unif  cls, front=5 side=5', uniform, 5, 5);
    run('unif  cls, front=5 side=0', uniform, 5, 0);
}
