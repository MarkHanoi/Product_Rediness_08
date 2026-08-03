// §VALENCIA-ALINEACIONES-PROBE-3 — the result that nearly shipped a STREET as a buildable footprint.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE FINDING THAT FORCED THIS PROBE
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Probe 2's D3 asked whether the published street CENTRELINE falls inside layer 212. If 212 were the
// buildable complement bounded by alignments, the answer had to be ~0 %.
//
//     D3  street-axis points inside a 212 polygon:  40.8 %  (n = 12 647)
//
// It is not ~0 %. Taken at face value that REFUTES "212 = buildable land", and probe 2 duly printed
// «street is covered — 212 is not a buildable-land layer».
//
// But there is a second reading, and `esValenciaAlineaciones.ts` already records the fact that
// distinguishes them: `altura` = `'0'` is the layer's single most common value (4 195 features,
// 34,13 % of layer AREA but only 10,3 % of BUILDABLE land) and it "co-occurs with non-buildable
// ground (street complement, *espacios libres*)". So 212 may TILE THE WHOLE CITY — carriageway
// included — with the non-buildable ground carried at `altura = 0`, in which case:
//
//   ⇒ the ALIGNMENT is not the outer edge of the 212 fabric.
//     It is the boundary BETWEEN altura-bearing polygons and altura-zero polygons.
//   ⇒ the buildable footprint is the union of the NON-ZERO polygons, NOT the union of all of them.
//
// ⚠⚠ THE STAKES. Under the wrong reading, a provider that returns "the 212 polygon at this point"
// hands back a CARRIAGEWAY as a buildable footprint wherever the click lands on street ground — an
// over-grant of exactly the L-616 kind, and one that a well-formed HTTP 200 would never reveal.
// This probe exists to settle which reading is true BEFORE any provider returns a ring.
//
// D5  what `altura` do the street-axis points inside 212 actually carry?
// D6  re-run the parcel clip against the NON-ZERO union only — the number probe 2's D4 could not mean.
// D7  do altura-zero polygons behave like street ground? (share of layer area, and whether the
//     CENTRELINE prefers them) — the direct test of the "street complement" claim.
//
// All native EPSG:25830, no reprojection. Run: node tools/valencia-alineaciones-probe/probe3.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = 'PRYZM-valencia-alineaciones-probe/1.0 (+https://pryzm.app)';
const SERVICE =
    'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer';
const NATIVE_WKID = 25830;
const L = { ALIN: 212, PARCELS: 216, AXIS: 223 };

const WINDOWS = [
    { name: 'Eixample / Ruzafa (closed block)', x: 725600, y: 4371900, half: 320 },
    { name: 'Ciutat Vella (medieval irregular)', x: 725150, y: 4373150, half: 300 },
    { name: 'Extramurs / Gran Via (open block)', x: 724500, y: 4372450, half: 320 },
    { name: 'Benimaclet (peripheral grid)', x: 727100, y: 4374600, half: 320 },
    { name: 'Camins al Grau (modern)', x: 728400, y: 4372600, half: 320 },
];

/**
 * Is this `altura` a value that could ever denote BUILDING above the ground?
 *
 * ⚠ Mirrors `parseValenciaAltura`'s classes deliberately and stays just as dumb: it asks whether the
 * string is a POSITIVE quantity or a heritage/aspect marker, and NEVER what the number means.
 * `'0'` and `'0*'` are non-building. Blank/`'_'`/`'-+-'` are UNKNOWN and are counted apart — an
 * unknown is never folded into either side (L-616, ADR-0283).
 */
function alturaClass(raw) {
    const s = String(raw ?? '').trim();
    if (!s || s === '_' || s === '-+-' || s === '?') return 'unknown';
    if (/^0\**$/.test(s)) return 'zero';
    if (/^\d+$/.test(s)) return +s > 0 ? 'positive-integer' : 'zero';
    if (/^<=\s*\d+/.test(s) || /^max/i.test(s)) return 'bounded';
    if (/^\d+(?:[.,]\d+)?\s*m$/i.test(s)) return 'metres';
    if (/protegido|bic|brl|bc\b|ptipologica|pparcial/i.test(s)) return 'protected';
    return 'other';
}
/** The polygons that could carry building. Deliberately EXCLUDES `unknown`. */
const isBuildableClass = (c) => c === 'positive-integer' || c === 'bounded' || c === 'metres' || c === 'protected';

async function getJson(url, tries = 4) {
    let last;
    for (let a = 1; a <= tries; a++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
            const t = await res.text();
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j = JSON.parse(t);
            if (j.error) throw new Error(`ArcGIS ${j.error.code}: ${j.error.message}`);
            return j;
        } catch (e) {
            last = e;
            if (a < tries) await new Promise((r) => setTimeout(r, 1500 * a));
        }
    }
    throw last;
}

async function queryWindow(id, win) {
    const env = {
        xmin: win.x - win.half, ymin: win.y - win.half,
        xmax: win.x + win.half, ymax: win.y + win.half,
        spatialReference: { wkid: NATIVE_WKID },
    };
    const out = [];
    let offset = 0;
    for (;;) {
        const j = await getJson(
            `${SERVICE}/${id}/query?where=1%3D1&outFields=*&returnGeometry=true` +
            `&geometry=${encodeURIComponent(JSON.stringify(env))}&geometryType=esriGeometryEnvelope` +
            `&spatialRel=esriSpatialRelIntersects&inSR=${NATIVE_WKID}&outSR=${NATIVE_WKID}` +
            `&resultOffset=${offset}&resultRecordCount=2000&f=json`);
        const f = j.features ?? [];
        if (f.length && j.spatialReference?.wkid !== NATIVE_WKID)
            throw new Error(`layer ${id} answered wkid ${j.spatialReference?.wkid}`);
        out.push(...f);
        if (!j.exceededTransferLimit || !f.length) break;
        offset += f.length;
        if (offset > 20_000) break;
    }
    return out;
}

function pointInPolygon(px, py, g) {
    let inside = false;
    for (const ring of g?.rings ?? [])
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
    return inside;
}
function polygonArea(g) {
    let a = 0;
    for (const ring of g?.rings ?? []) {
        let s = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
            s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        a += s / 2;
    }
    return Math.abs(a);
}
function indexPolygons(features) {
    return features.map((f) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const ring of f.geometry?.rings ?? [])
            for (const [x, y] of ring) {
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
        return { f, x0, y0, x1, y1 };
    });
}
const hitIndexed = (px, py, idx) => {
    for (const e of idx)
        if (px >= e.x0 && px <= e.x1 && py >= e.y0 && py <= e.y1 && pointInPolygon(px, py, e.f.geometry)) return e.f;
    return null;
};
function samplePath(paths, step) {
    const pts = [];
    for (const p of paths ?? [])
        for (let i = 0; i + 1 < p.length; i++) {
            const [ax, ay] = p[i], [bx, by] = p[i + 1];
            const n = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / step));
            for (let k = 0; k <= n; k++) { const t = k / n; pts.push([ax + t * (bx - ax), ay + t * (by - ay)]); }
        }
    return pts;
}
const stats = (arr) => {
    if (!arr.length) return { n: 0, median: null };
    const s = [...arr].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, median: +q(0.5).toFixed(3), p25: +q(0.25).toFixed(3), p75: +q(0.75).toFixed(3),
        mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3) };
};
const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : null);

async function main() {
    const R = { probe: '§VALENCIA-ALINEACIONES-PROBE-3', ranAt: new Date().toISOString(), crs: `EPSG:${NATIVE_WKID} native` };

    // ── D7a — city-wide AREA by altura class, straight from the service ───────────────────────
    const areaByClass = {};
    {
        const j = await getJson(
            `${SERVICE}/${L.ALIN}/query?where=1%3D1&outFields=altura&returnGeometry=false` +
            `&groupByFieldsForStatistics=altura&outStatistics=` +
            encodeURIComponent(JSON.stringify([{ statisticType: 'count', onStatisticField: 'objectid', outStatisticFieldName: 'n' }])) +
            `&f=json`);
        for (const f of j.features ?? []) {
            const c = alturaClass(f.attributes.altura);
            areaByClass[c] = (areaByClass[c] ?? 0) + (f.attributes.n ?? 0);
        }
    }
    R.D7a_layerCompositionByFeatureCount = areaByClass;
    console.log('D7a 212 composition by altura class:', JSON.stringify(areaByClass));

    // ── the windowed tests ────────────────────────────────────────────────────────────────────
    const axisHost = { zero: 0, positive: 0, bounded: 0, metres: 0, protected: 0, other: 0, unknown: 0, none: 0 };
    let axisTotal = 0;
    const clipAll = [];
    const clipBuildable = [];
    let wholeB = 0, clippedB = 0, outsideB = 0;
    const examples = [];
    let areaZero = 0, areaBuildable = 0, areaUnknown = 0;

    for (const win of WINDOWS) {
        const [alin, parcels, axes] = await Promise.all([
            queryWindow(L.ALIN, win), queryWindow(L.PARCELS, win), queryWindow(L.AXIS, win),
        ]);
        console.log(`\n${win.name}: 212=${alin.length} 216=${parcels.length} 223=${axes.length}`);

        for (const a of alin) {
            const c = alturaClass(a.attributes?.altura);
            const ar = polygonArea(a.geometry);
            if (c === 'zero') areaZero += ar;
            else if (c === 'unknown') areaUnknown += ar;
            else if (isBuildableClass(c)) areaBuildable += ar;
        }

        const allIdx = indexPolygons(alin);
        const buildableIdx = indexPolygons(alin.filter((a) => isBuildableClass(alturaClass(a.attributes?.altura))));

        // ── D5 — what does the CENTRELINE sit on? ─────────────────────────────────────────────
        for (const ax of axes)
            for (const [px, py] of samplePath(ax.geometry?.paths, 5)) {
                axisTotal++;
                const h = hitIndexed(px, py, allIdx);
                if (!h) { axisHost.none++; continue; }
                const c = alturaClass(h.attributes?.altura);
                if (c === 'zero') axisHost.zero++;
                else if (c === 'positive-integer') axisHost.positive++;
                else if (c === 'bounded') axisHost.bounded++;
                else if (c === 'metres') axisHost.metres++;
                else if (c === 'protected') axisHost.protected++;
                else if (c === 'unknown') axisHost.unknown++;
                else axisHost.other++;
            }

        // ── D6 — parcel clip against the NON-ZERO union only ─────────────────────────────────
        for (const f of parcels) {
            const g = f.geometry;
            if (!g?.rings?.length) continue;
            const area = polygonArea(g);
            if (area < 40) continue;
            const ring = g.rings[0];
            const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            let inP = 0, inAll = 0, inB = 0;
            for (let i = 0; i < 1500; i++) {
                const px = x0 + Math.random() * (x1 - x0), py = y0 + Math.random() * (y1 - y0);
                if (!pointInPolygon(px, py, g)) continue;
                inP++;
                if (hitIndexed(px, py, allIdx)) inAll++;
                if (hitIndexed(px, py, buildableIdx)) inB++;
            }
            if (inP < 150) continue;
            clipAll.push(inAll / inP);
            const fb = inB / inP;
            clipBuildable.push(fb);
            if (fb <= 0.02) outsideB++;
            else if (fb >= 0.98) wholeB++;
            else {
                clippedB++;
                if (examples.length < 12)
                    examples.push({
                        window: win.name,
                        refcat: f.attributes?.refcat ?? null,
                        parcelAreaM2: +area.toFixed(1),
                        buildableFraction: +fb.toFixed(3),
                        buildableM2: +(fb * area).toFixed(1),
                        landRemovedByAlignmentM2: +((1 - fb) * area).toFixed(1),
                    });
            }
        }
    }

    R.D5_whatTheCentrelineSitsOn = {
        question: 'street-axis points inside a 212 polygon — what altura does the HOST carry?',
        sampled: axisTotal,
        host: axisHost,
        insideAnyPct: pct(axisTotal - axisHost.none, axisTotal),
        ofThoseInside_zeroPct: pct(axisHost.zero, axisTotal - axisHost.none),
        ofThoseInside_buildablePct: pct(
            axisHost.positive + axisHost.bounded + axisHost.metres + axisHost.protected, axisTotal - axisHost.none),
        verdict:
            pct(axisHost.zero, axisTotal - axisHost.none) > 80
                ? '⭐ 212 TILES THE CITY: the carriageway IS inside 212, but carried at altura=0. The '
                  + 'ALIGNMENT is therefore the boundary between altura-bearing and altura-zero polygons '
                  + '— NOT the outer edge of the 212 fabric. The buildable footprint is the NON-ZERO union.'
                : '⚠ the centreline sits on altura-BEARING polygons — 212 does not separate street from '
                  + 'buildable ground, and must NOT be used as a footprint.',
    };
    R.D6_parcelClipAgainstNonZeroUnion = {
        note:
            'Probe 2 D4 intersected against ALL 212 polygons and so measured almost nothing (streets ' +
            'included). This is the number that means something.',
        parcelsTested: clipBuildable.length,
        againstAllPolygons: stats(clipAll),
        againstBuildableOnly: stats(clipBuildable),
        fullyBuildable: wholeB,
        partiallyClipped: clippedB,
        partiallyClippedPct: pct(clippedB, clipBuildable.length),
        entirelyNonBuildable: outsideB,
        entirelyNonBuildablePct: pct(outsideB, clipBuildable.length),
        examples,
    };
    R.D7b_areaShare = {
        zeroM2: +areaZero.toFixed(0),
        buildableM2: +areaBuildable.toFixed(0),
        unknownM2: +areaUnknown.toFixed(0),
        zeroSharePct: pct(areaZero, areaZero + areaBuildable + areaUnknown),
        note: 'An UNKNOWN altura is carried as its own bucket and never folded into either side.',
    };

    mkdirSync(join(HERE, 'out'), { recursive: true });
    writeFileSync(join(HERE, 'out', 'probe3.json'), JSON.stringify(R, null, 2));

    console.log('\n════ D5 — what the centreline sits on ════');
    console.log(JSON.stringify(axisHost));
    console.log(`inside any 212: ${R.D5_whatTheCentrelineSitsOn.insideAnyPct}% · of those, altura=0: ${R.D5_whatTheCentrelineSitsOn.ofThoseInside_zeroPct}% · buildable: ${R.D5_whatTheCentrelineSitsOn.ofThoseInside_buildablePct}%`);
    console.log('→', R.D5_whatTheCentrelineSitsOn.verdict);
    console.log('\n════ D6 — clip against NON-ZERO union ════');
    console.log('all-polygons fraction:', JSON.stringify(R.D6_parcelClipAgainstNonZeroUnion.againstAllPolygons));
    console.log('buildable-only fraction:', JSON.stringify(R.D6_parcelClipAgainstNonZeroUnion.againstBuildableOnly));
    console.log(`whole ${wholeB} · clipped ${clippedB} (${R.D6_parcelClipAgainstNonZeroUnion.partiallyClippedPct}%) · none ${outsideB}`);
    console.log('\nD7b area share zero:', `${R.D7b_areaShare.zeroSharePct}%`);
    console.log('\nwrote out/probe3.json');
}

main().catch((e) => { console.error('PROBE FAILED (a FAILURE, not an empty result):', e.message); process.exit(1); });
