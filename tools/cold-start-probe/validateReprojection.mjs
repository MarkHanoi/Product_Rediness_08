#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// INDEPENDENT ORACLE for the ATOM→WGS84 reprojection (PROBE-DISCIPLINE R2 — "validate against a
// source that cannot share the bug"; a second variant of the same algorithm is not an oracle).
//
// THE BUG IT EXISTS TO CATCH: the per-municipality ATOM GML is ETRS89/UTM in three different zones.
// Read as lat/lon it produces coordinates in the Atlantic, and every zoning service then answers a
// well-formed "no polygon here" — a FALSE NEGATIVE that survives a 200. Six of six Barcelona
// parcels scored `nonBuildable` on the first run because of it.
//
// THE ORACLE: `ovc.catastro.meh.es/INSPIRE/wfsCP.aspx` is a DIFFERENT service, on a DIFFERENT host,
// which answers in EPSG:4326 directly and never touches our projection code. For each sampled
// parcel we send our REPROJECTED centroid to it as a tiny bbox and assert the parcel it returns
// carries THE SAME cadastral reference we started from. That is a round trip through an independent
// coordinate path: if our maths is wrong, the reference comes back different or empty.
//
// R7 — WHAT THIS CANNOT SEE: it validates the CENTROID, not the ring; a parcel whose centroid falls
// outside its own (concave or multipart) polygon can report a neighbour's reference and be counted
// a miss. Those are reported separately as `ref-mismatch`, not folded into failures.
// ─────────────────────────────────────────────────────────────────────────────
import { buildFrame, drawUniform } from './catastroParcelFrame.mjs';

const UA = 'PRYZM-cold-start-probe/1.0 (+pryzmhello@gmail.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BOARD = [
    { city: 'barcelona', ine: '08019', name: 'BARCELONA' },
    { city: 'madrid', ine: '28079', name: 'MADRID' },
    { city: 'murcia', ine: '30030', name: 'MURCIA' },
    { city: 'cordoba', ine: '14021', name: 'CORDOBA' },
    { city: 'valencia', ine: '46250', name: 'VALENCIA' },
    { city: 'lugo', ine: '27028', name: 'LUGO' },
];

const N = Number(process.argv[process.argv.indexOf('--n') + 1] ?? 12);

for (const b of BOARD) {
    const f = await buildFrame(b.ine, b.name);
    if (!f.ok) { console.log(`✗ ${b.city}: ${f.reason}`); continue; }
    const sample = drawUniform(f.parcels, N, 424242);
    let hit = 0, mismatch = 0, empty = 0, fail = 0;
    const misses = [];
    for (const p of sample) {
        const d = 0.00004;
        const url = 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&version=2.0.0&request=GetFeature'
            + '&typeNames=cp:CadastralParcel&srsName=EPSG:4326'
            + `&bbox=${(p.lat - d).toFixed(7)},${(p.lon - d).toFixed(7)},${(p.lat + d).toFixed(7)},${(p.lon + d).toFixed(7)}`;
        await sleep(320);
        let body;
        try {
            const res = await fetch(url, { headers: { 'user-agent': UA } });
            body = await res.text();
            if (!res.ok) { fail++; continue; }
        } catch { fail++; continue; }
        if (/No records founded for BBOX/i.test(body)) { empty++; misses.push(`${p.ref} → EMPTY at ${p.lat},${p.lon}`); continue; }
        const refs = [...body.matchAll(/gml:id="ES\.SDGC\.CP\.([^"]+)"/g)].map((m) => m[1]);
        if (refs.includes(p.ref)) hit++;
        else { mismatch++; misses.push(`${p.ref} → got ${refs.slice(0, 2).join(',') || '(none)'}`); }
    }
    const verdict = hit === sample.length ? '✅ EXACT' : hit / sample.length >= 0.8 ? '⚠ mostly' : '⛔ BROKEN';
    console.log(`${verdict} ${b.city.padEnd(10)} srs=${f.parcels[0]?.srs?.split('/').pop()}  hit ${hit}/${sample.length}  ref-mismatch ${mismatch}  empty ${empty}  transport-fail ${fail}`);
    for (const m of misses.slice(0, 3)) console.log(`      · ${m}`);
}
