// L-539 — extract a REAL cadastral manzana fixture for the regression test.
//
// L-529's lesson, applied: synthetic shapes did not reproduce that bug, and the test that pinned
// the fix used the real 58-vertex block ring. Same precedent here — the T-junction population is a
// property of Catastro's 1e-6° coordinate rounding and cannot be hand-written convincingly.
//
// Picks (a) a manzana the EXACT pass already dissolves, to pin that its ring never moves, and
// (b) a compact manzana the exact pass refuses and the repair fixes.

import { readFileSync, writeFileSync } from 'node:fs';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const R = 6_378_137, D = Math.PI / 180;
interface M { city: string; manzana: string; parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }> }

const raw = JSON.parse(readFileSync(new URL('./dissolve-sample.json', import.meta.url), 'utf8')) as { manzanas: M[] };

function proj(m: M): Pt[][] {
    const lat0 = m.parcels[0]!.ring[0]!.lat, lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    return m.parcels.map((p) => p.ring.map((v) => ({
        x: Number(((v.lon - lon0) * D * R * c).toFixed(4)),
        z: Number((-((v.lat - lat0) * D * R)).toFixed(4)),
    })));
}

const cands = raw.manzanas.map((m) => {
    const rings = proj(m);
    const off = dissolveParcelsToBlockRing(rings, { repairTJunctions: false });
    const on = dissolveParcelsToBlockRing(rings);
    const verts = rings.reduce((s, r) => s + r.length, 0);
    return { m, rings, off, on, verts, area: m.parcels.reduce((s, p) => s + p.areaM2, 0) };
});

const repaired = cands
    .filter((c) => c.off.degenerate && !c.on.degenerate && c.verts < 130 && c.m.parcels.length >= 4)
    .sort((a, b) => a.verts - b.verts);
const exact = cands
    .filter((c) => !c.off.degenerate && c.verts < 130 && c.m.parcels.length >= 5)
    .sort((a, b) => a.verts - b.verts);

for (const [label, list] of [['REPAIRED', repaired], ['EXACT', exact]] as const) {
    console.log(`\n=== ${label} candidates (${list.length}) ===`);
    for (const c of list.slice(0, 6)) {
        console.log(`${c.m.city} ${c.m.manzana} parcels=${c.m.parcels.length} verts=${c.verts} ` +
            `cadastralArea=${c.area.toFixed(0)} ringVerts=${c.on.ring.length} splits=${c.on.quality.splitCount} ` +
            `maxOffset=${c.on.quality.maxOffset_m.toFixed(4)}`);
    }
}

// Chosen for SUBSTANCE, not smallness: a 4,162 m² block with 4 T-junction splits exercises the
// repair far better than a 418 m² courtyard, and its published cadastral area is big enough that
// a 0.1 m geometric error cannot hide in the rounding.
const pickR = repaired.find((c) => c.m.manzana === '32598')!;
const pickE = exact.find((c) => c.m.manzana === '44559')!;
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify({
    repaired: { city: pickR.m.city, manzana: pickR.m.manzana, cadastralAreaM2: pickR.area, rings: pickR.rings },
    exact: { city: pickE.m.city, manzana: pickE.m.manzana, cadastralAreaM2: pickE.area, rings: pickE.rings, ring: pickE.off.ring },
}, null, 0));
console.log('\nwrote scratchpad/fixture.json');
