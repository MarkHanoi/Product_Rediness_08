// L-586 PROBE — root-cause the TWO defects the aggregates hid (found by the L-585 oracle):
//   (1) 11 dissolved rings SELF-INTERSECT.
//   (2) Valencia's worst ring is 15.85% off the published cadastral area.
//
// This probe NAMES every offending manzana, reports which dissolve PATH produced it
// (exact vs t-junction-split), where the crossing is, and how far the ring departs from the
// published area. Offline: reads only the frozen scratchpad/dissolve-sample.json.
//
// Run: npx tsx scratchpad/probe-l586-defects.mts

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dissolveParcelsToBlockRing } from '../packages/site-parcel-data/src/geometry/blockRing.js';
import type { Pt } from '@pryzm/schemas';

const ROOT = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

interface M {
    city: string;
    manzana: string;
    parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }>;
}
const raw = JSON.parse(readFileSync(resolve(ROOT, 'scratchpad/dissolve-sample.json'), 'utf8')) as {
    manzanas: M[];
};

const R = 6_378_137,
    D = Math.PI / 180;

function area(ring: ReadonlyArray<Pt>) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!,
            q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}
function signedArea(ring: ReadonlyArray<Pt>) {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!,
            q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return a / 2;
}
function segX(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
    const o1 = o(a, b, c),
        o2 = o(a, b, d),
        o3 = o(c, d, a),
        o4 = o(c, d, b);
    return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
function crossings(ring: ReadonlyArray<Pt>) {
    const n = ring.length;
    const out: Array<{ i: number; j: number; segLenI: number; segLenJ: number; gap: number }> = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            const a = ring[i]!,
                b = ring[(i + 1) % n]!,
                c = ring[j]!,
                d = ring[(j + 1) % n]!;
            if (segX(a, b, c, d)) {
                out.push({
                    i,
                    j,
                    segLenI: Math.hypot(b.x - a.x, b.z - a.z),
                    segLenJ: Math.hypot(d.x - c.x, d.z - c.z),
                    gap: j - i,
                });
            }
        }
    }
    return out;
}

const rows = raw.manzanas.map((m) => {
    const lat0 = m.parcels[0]!.ring[0]!.lat,
        lon0 = m.parcels[0]!.ring[0]!.lon;
    const c = Math.cos(lat0 * D);
    const rings = m.parcels.map((p) =>
        p.ring.map((v) => ({ x: (v.lon - lon0) * D * R * c, z: -((v.lat - lat0) * D * R) })),
    );
    const before = dissolveParcelsToBlockRing(rings, { repairTJunctions: false });
    const after = dissolveParcelsToBlockRing(rings);
    const cadastral = m.parcels.reduce((s, p) => s + p.areaM2, 0);
    // Sum of parcel-ring GEOMETRIC areas (independent of the published number) — separates
    // "our dissolve is wrong" from "the published area disagrees with the published geometry".
    const geomSum = rings.reduce((s, r) => s + area(r), 0);
    return {
        m,
        rings,
        before,
        after,
        cadastral,
        geomSum,
        ringArea: after.degenerate ? null : area(after.ring),
        errPct: after.degenerate ? null : (Math.abs(area(after.ring) - cadastral) / cadastral) * 100,
        errVsGeomPct: after.degenerate ? null : (Math.abs(area(after.ring) - geomSum) / geomSum) * 100,
        repaired: before.degenerate && !after.degenerate,
        xs: after.degenerate ? [] : crossings(after.ring),
    };
});

console.log('## 1. SELF-INTERSECTING RINGS — every one, named\n');
console.log('| city | manzana | parcels | verts | path | splits | maxOff m | crossings | area err vs published | vs parcel-geometry |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
const bad = rows.filter((r) => r.xs.length > 0);
for (const r of bad) {
    console.log(
        `| ${r.m.city} | ${r.m.manzana} | ${r.m.parcels.length} | ${r.after.ring.length} | ${r.after.quality.path} | ${r.after.quality.splitCount} | ${r.after.quality.maxOffset_m.toFixed(4)} | ${r.xs.length} | ${r.errPct!.toFixed(2)}% | ${r.errVsGeomPct!.toFixed(2)}% |`,
    );
}
console.log(`\ntotal self-intersecting: ${bad.length} of ${rows.filter((r) => !r.after.degenerate).length} rings`);

console.log('\n## 1b. CROSSING GEOMETRY — how big are the offending segments?\n');
for (const r of bad) {
    console.log(`  ${r.m.city}/${r.m.manzana}: ring ${r.after.ring.length} verts, ${r.xs.length} crossings`);
    for (const x of r.xs.slice(0, 6)) {
        console.log(
            `     edge ${x.i} (len ${x.segLenI.toFixed(3)} m)  ×  edge ${x.j} (len ${x.segLenJ.toFixed(3)} m)   index-gap ${x.gap}`,
        );
    }
}

console.log('\n## 2. WORST AREA ERRORS (top 12 by |ring - published| %)\n');
console.log('| city | manzana | parcels | verts | path | ring m2 | published m2 | parcel-geom m2 | err vs pub | err vs geom | self-x |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of [...rows.filter((x) => !x.after.degenerate)].sort((a, b) => b.errPct! - a.errPct!).slice(0, 12)) {
    console.log(
        `| ${r.m.city} | ${r.m.manzana} | ${r.m.parcels.length} | ${r.after.ring.length} | ${r.after.quality.path} | ${r.ringArea!.toFixed(0)} | ${r.cadastral.toFixed(0)} | ${r.geomSum.toFixed(0)} | ${r.errPct!.toFixed(2)}% | ${r.errVsGeomPct!.toFixed(2)}% | ${r.xs.length > 0} |`,
    );
}

console.log('\n## 2b. PUBLISHED-AREA vs PARCEL-GEOMETRY disagreement (upstream, not ours) — top 8\n');
for (const r of [...rows]
    .map((r) => ({ r, d: (Math.abs(r.geomSum - r.cadastral) / r.cadastral) * 100 }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 8)) {
    console.log(
        `  ${r.r.m.city}/${r.r.m.manzana}: parcel geometry sums ${r.r.geomSum.toFixed(0)} m² but published sums ${r.r.cadastral.toFixed(0)} m² → ${r.d.toFixed(2)}% apart (${r.r.m.parcels.length} parcels)`,
    );
}

writeFileSync(
    resolve(ROOT, 'scratchpad/l586-defects.json'),
    JSON.stringify(
        {
            ranAt: new Date().toISOString(),
            totalManzanas: rows.length,
            rings: rows.filter((r) => !r.after.degenerate).length,
            selfIntersecting: bad.map((r) => ({
                city: r.m.city,
                manzana: r.m.manzana,
                parcels: r.m.parcels.length,
                verts: r.after.ring.length,
                path: r.after.quality.path,
                splitCount: r.after.quality.splitCount,
                crossings: r.xs,
                errPct: r.errPct,
            })),
        },
        null,
        2,
    ),
);
console.log('\nwrote scratchpad/l586-defects.json');
