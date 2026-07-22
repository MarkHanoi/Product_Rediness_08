// L-581 MECHANISM PROBE — is `binding: 'interior-ratio'` at 93.8% free actually INSET COLLAPSE
// wearing a legal label?
//
// THE HYPOTHESIS, STATED BEFORE THE EVIDENCE SO IT CAN LOSE. `interiorFreeAreaAt` ends:
//     return res.degenerate ? 0 : area(res.polygon);
// so a FAILED inset is indistinguishable from a courtyard that shrank to nothing. The solver
// bisects for the largest depth whose free area is ≥ 30% of the block; if the inset collapses at
// some depth D, every d ≥ D reads as 0 and therefore "violates the ratio", so the bisection
// converges just below D and reports `binding: 'interior-ratio'` — a LEGAL claim — for what is
// actually a geometry failure. The tell is the achieved ratio: a genuine ratio-bound answer lands
// AT 30%; these land at 44–94%.
//
// IF TRUE: depths are UNDER-reported on real Eixample blocks (conservative, but wrong), and the
// "why this number" row shown to a user cites the wrong rule. Same family as L-529, where a greedy
// cleanup collapsed 40 verts → 2 and floored the depth.
// IF FALSE: the ladder below will show area falling smoothly through 30% with no degeneracy, and
// my reading of the solver is wrong.
//
// Run:  npx tsx scratchpad/probe-l581-inset-collapse.mts

import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import { measureStreetWidths } from '../packages/site-parcel-data/src/geometry/streetWidth.js';
import { insetPolygonPerEdge } from '../packages/site-parcel-data/src/geometry/insetPolygon.js';
import type { Pt } from '@pryzm/schemas';

const EARTH_RADIUS_M = 6_378_137, DEG2RAD = Math.PI / 180;
const project = (ring: Array<{ lat: number; lon: number }>, lat0: number, lon0: number): Pt[] => {
    const cos0 = Math.cos(lat0 * DEG2RAD);
    return ring.map((p) => ({
        x: (p.lon - lon0) * DEG2RAD * EARTH_RADIUS_M * cos0,
        z: -(p.lat - lat0) * DEG2RAD * EARTH_RADIUS_M,
    }));
};
const areaOf = (r: ReadonlyArray<Pt>): number => {
    if (r.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; a += p.x * q.z - q.x * p.z; }
    return Math.abs(a) / 2;
};
interface BboxParcel { refcat: string; ring: Array<{ lat: number; lon: number }> }

// Two blocks the layer-6 sweep flagged as implausible, plus one it agreed with as a CONTROL.
const CASES: Array<[string, string]> = [
    ['0128801DF3802G', 'min-floor DEGENERATE — "ordinance cannot be honoured"'],
    ['0131203DF3803A', 'min-floor DEGENERATE — "ordinance cannot be honoured"'],
    ['0331201DF3803A', 'reported depth 26.3 m, free 30.0% — CONTROL, looks correct'],
];

for (const [refcat, note] of CASES) {
    console.log(`\n═══ ${refcat} — ${note}`);
    const manzana = manzanaPrefix(refcat);
    const selfUrl = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0'
        + `&request=GetFeature&STOREDQUERIE_ID=GetParcel&REFCAT=${encodeURIComponent(refcat)}&srsName=EPSG:4326`;
    const parsed = parseParcelCollectionGml(await (await fetch(selfUrl)).text()) as BboxParcel[];
    const self = parsed.find((p) => p.refcat === refcat) ?? parsed[0];
    if (!self) { console.log('  self-parcel unresolved'); continue; }
    const lat = self.ring.reduce((s, p) => s + p.lat, 0) / self.ring.length;
    const lon = self.ring.reduce((s, p) => s + p.lon, 0) / self.ring.length;
    const all = parseParcelCollectionGml(await (await fetch(buildParcelBboxUrl(lat, lon))).text()) as BboxParcel[];
    const mine = all.filter((p) => manzanaPrefix(p.refcat) === manzana);
    const others = all.filter((p) => manzanaPrefix(p.refcat) !== manzana);
    const d = dissolveParcelsToBlockRing(mine.map((p) => project(p.ring, lat, lon)));
    if (d.degenerate) { console.log(`  dissolve ${d.reason}`); continue; }

    const measured = measureStreetWidths(d.ring, others.map((p) => project(p.ring, lat, lon)));
    const frontEdges = new Set(measured.measurements.map((m) => m.edgeIndex));
    const cls = d.ring.map((_, i) => (frontEdges.has(i) ? 'front' : 'side')) as never[];
    const blockArea = areaOf(d.ring);
    console.log(`  block ${blockArea.toFixed(0)} m², ${d.ring.length} verts, ${frontEdges.size}/${d.ring.length} edges classified front`);
    console.log('  depth →  verts   area m²    free%   state');

    let firstCollapse: number | null = null;
    for (let dep = 1; dep <= 30; dep += 1) {
        const res = insetPolygonPerEdge(d.ring, cls, { front: dep, side: 0, rear: 0, unclassified: 0 });
        const a = res.degenerate ? 0 : areaOf(res.polygon);
        const state = res.degenerate ? '⚠ DEGENERATE — reads as 0, i.e. "ratio violated"' : '';
        if (res.degenerate && firstCollapse === null) firstCollapse = dep;
        console.log(`  ${String(dep).padStart(5)} → ${String(res.polygon.length).padStart(6)} ${a.toFixed(0).padStart(9)} ${((a / blockArea) * 100).toFixed(1).padStart(7)}%   ${state}`);
    }
    console.log(firstCollapse !== null
        ? `  ⇒ INSET COLLAPSES at ${firstCollapse} m. Every deeper d reads as 0 free area, so the`
          + `\n    solver stops just below it and calls it 'interior-ratio'. THE LABEL IS A LEGAL`
          + `\n    CLAIM FOR A GEOMETRY FAILURE, and the depth is UNDER-reported.`
        : '  ⇒ no collapse in 2–30 m — area falls smoothly; the ratio label is honest here.');
}
