// §VALENCIA-ALINEACIONES-PROBE-2 — resolving the one result probe.mjs did NOT settle.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT PROBE 1 SETTLED, AND WHAT IT DID NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Settled — layer 212 is NOT a street centreline:
//     FRONTAGE → 212   median 0.004 m · 80.1 % on-line (n = 56 775)
//     FRONTAGE → 223   median 8.854 m ·  1.0 % on-line   ← the publisher's OWN `Ejes de calle`
//   The axis sits ~8.9 m away — half a València street — exactly where Murcia's `pgou_ejes` sat
//   when it was convicted as a centreline. 212 is at zero. It is a frontage line, not an axis.
//
// NOT settled — the PARTY control only PARTLY fired:
//     PARTY → 212      median 0.558 m · 52.0 % on-line (n = 96 063)
//   Half of all party-wall points ALSO lie on a 212 boundary. Under the probe-1 hypothesis set that
//   is the signature of a CADASTRE COPY, which would be worth nothing. So it must be resolved
//   before any claim is made, and the honest reading of probe 1 alone is INDETERMINATE.
//
// ⚠ This is the L-529 lesson: two rival theories were both "documented-as-confirmed" and both
// wrong. So this probe does not argue — it tests three things that separate the hypotheses:
//
//   D1  GRANULARITY   — is 212 1:1 with the cadastre? City-wide counts, not a window.
//   D2  WHY the shared edge exists — for party-wall points sitting ON a 212 boundary, do the two
//       212 polygons either side carry DIFFERENT `altura`? A cadastre copy has no reason to;
//       an ordinance layer subdivides PRECISELY where the legal value changes.
//   D3  STREET COMPLEMENT — do points on the street axis fall INSIDE 212? A buildable-land layer
//       bounded by alignments must EXCLUDE the carriageway. A general zoning/cartographic layer
//       would cover it.
//
//   D4  CLIPPING REACH — over ALL parcels (not probe 1's first-25 slice), how often does 212
//       actually cut the parcel? This is what an alignment is FOR, and probe 1's unbiased answer
//       was not measured.
//
// All native EPSG:25830, no reprojection. Run: node tools/valencia-alineaciones-probe/probe2.mjs

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
    throw last; // a transport failure is NEVER degraded into "empty"
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

const ptSegDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const segmentsOf = (g) => {
    const segs = [];
    for (const part of g?.rings ?? g?.paths ?? [])
        for (let i = 0; i + 1 < part.length; i++) {
            const [ax, ay] = part[i], [bx, by] = part[i + 1];
            if (ax !== bx || ay !== by) segs.push([ax, ay, bx, by]);
        }
    return segs;
};
const minDist = (px, py, segs) => {
    let b = Infinity;
    for (const s of segs) { const d = ptSegDist(px, py, s[0], s[1], s[2], s[3]); if (d < b) b = d; if (!b) return 0; }
    return b;
};
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
const centroid = (g) => {
    let x = 0, y = 0, n = 0;
    for (const r of g?.rings ?? []) for (const p of r) (x += p[0]), (y += p[1]), n++;
    return n ? [x / n, y / n] : null;
};
function sampleEdges(ring, step) {
    const pts = [];
    for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 0.05) continue;
        const n = Math.max(1, Math.floor(len / step));
        for (let k = 0; k <= n; k++) { const t = k / n; pts.push([ax + t * (bx - ax), ay + t * (by - ay)]); }
    }
    return pts;
}
function samplePath(paths, step) {
    const pts = [];
    for (const p of paths ?? [])
        for (let i = 0; i + 1 < p.length; i++) {
            const [ax, ay] = p[i], [bx, by] = p[i + 1];
            const len = Math.hypot(bx - ax, by - ay);
            const n = Math.max(1, Math.floor(len / step));
            for (let k = 0; k <= n; k++) { const t = k / n; pts.push([ax + t * (bx - ax), ay + t * (by - ay)]); }
        }
    return pts;
}
/**
 * A bounding-box prefilter over the 212 polygons.
 *
 * ⚠ NOT an optimisation for its own sake. Without it the Monte Carlo is
 * O(samples × parcels × polygons) and the probe never finishes — and a probe that never finishes
 * reports nothing, which reads exactly like a probe that found nothing. The bbox test is EXACT
 * (a point outside a polygon's bbox is outside the polygon), so this changes the runtime and
 * NOT a single result.
 */
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

const stats = (arr) => {
    if (!arr.length) return { n: 0, median: null };
    const s = [...arr].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, median: +q(0.5).toFixed(3), p25: +q(0.25).toFixed(3), p75: +q(0.75).toFixed(3),
        p95: +q(0.95).toFixed(3), mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3) };
};
const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : null);

async function main() {
    const R = { probe: '§VALENCIA-ALINEACIONES-PROBE-2', ranAt: new Date().toISOString(), crs: `EPSG:${NATIVE_WKID} native, no reprojection` };

    // ── D1 — GRANULARITY, city-wide ───────────────────────────────────────────────────────────
    const cnt = async (id) => (await getJson(`${SERVICE}/${id}/query?where=1%3D1&returnCountOnly=true&f=json`)).count;
    const [nAlin, nParcel] = await Promise.all([cnt(L.ALIN), cnt(L.PARCELS)]);
    R.D1_granularity = {
        alineacionesPolygons: nAlin,
        urbanCadastralParcels: nParcel,
        ratio: +(nParcel / nAlin).toFixed(2),
        verdict: nParcel / nAlin > 1.5 ? 'COARSER than the cadastre — not a 1:1 copy' : 'INDETERMINATE / near 1:1',
    };
    console.log(`D1  212=${nAlin} polygons vs 216=${nParcel} parcels → ${R.D1_granularity.ratio}× · ${R.D1_granularity.verdict}`);

    // ── D2/D3/D4 over the windows ─────────────────────────────────────────────────────────────
    let sameAltura = 0, diffAltura = 0, oneSided = 0;
    const axisInside = { in: 0, total: 0 };
    const clipFracs = [];
    let clipped = 0, whole = 0, outside = 0;
    const clipExamples = [];

    for (const win of WINDOWS) {
        const [alin, parcels, axes] = await Promise.all([
            queryWindow(L.ALIN, win), queryWindow(L.PARCELS, win), queryWindow(L.AXIS, win),
        ]);
        console.log(`\n${win.name}: 212=${alin.length} 216=${parcels.length} 223=${axes.length}`);
        const parcelSegs = parcels.map((f) => segmentsOf(f.geometry));
        // Same EXACT bbox prefilter for the neighbour scan: a point further than PARTY_M from a
        // parcel's bounding box cannot be within PARTY_M of that parcel's boundary.
        const parcelBox = parcels.map((f) => {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const ring of f.geometry?.rings ?? [])
                for (const [x, y] of ring) {
                    if (x < x0) x0 = x; if (x > x1) x1 = x;
                    if (y < y0) y0 = y; if (y > y1) y1 = y;
                }
            return [x0, y0, x1, y1];
        });
        // ⚠ HOISTED. Rebuilding this inside the per-point loop made the probe O(points × polygons)
        // and it never finished — a probe that times out silently is indistinguishable from one
        // that found nothing, which is the exact failure-vs-empty trap this file is guarding.
        const alinSegs = alin.flatMap((a) => segmentsOf(a.geometry));
        const alinIdx = indexPolygons(alin);

        // ── D3 — does 212 cover the CARRIAGEWAY? ──────────────────────────────────────────────
        for (const ax of axes)
            for (const [px, py] of samplePath(ax.geometry?.paths, 5)) {
                axisInside.total++;
                if (hitIndexed(px, py, alinIdx)) axisInside.in++;
            }

        // ── D2 — party-wall points ON a 212 boundary: do the flanking alturas differ? ─────────
        for (let pi = 0; pi < parcels.length; pi++) {
            const g = parcels[pi].geometry;
            if (!g?.rings?.length) continue;
            for (const ring of g.rings)
                for (const [px, py] of sampleEdges(ring, 4)) {
                    let dNbr = Infinity;
                    for (let qi = 0; qi < parcels.length; qi++) {
                        if (qi === pi) continue;
                        const b = parcelBox[qi];
                        if (px < b[0] - 0.5 || px > b[2] + 0.5 || py < b[1] - 0.5 || py > b[3] + 0.5) continue;
                        const d = minDist(px, py, parcelSegs[qi]);
                        if (d < dNbr) dNbr = d;
                        if (dNbr <= 0.5) break;
                    }
                    if (dNbr > 0.5) continue;                       // party-wall points only
                    if (minDist(px, py, alinSegs) > 1.0) continue; // ...that sit ON a 212 boundary
                    // Which 212 polygons flank this point? Probe both normals at 1.5 m.
                    const hosts = new Set();
                    for (const [ox, oy] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
                        const h = hitIndexed(px + ox, py + oy, alinIdx);
                        if (h) hosts.add(String(h.attributes?.altura ?? '∅'));
                    }
                    if (hosts.size === 0) oneSided++;
                    else if (hosts.size === 1) sameAltura++;
                    else diffAltura++;
                }
        }

        // ── D4 — unbiased clipping reach over EVERY parcel in the window ─────────────────────
        for (const f of parcels) {
            const g = f.geometry;
            if (!g?.rings?.length) continue;
            const area = polygonArea(g);
            if (area < 40) continue;
            const ring = g.rings[0];
            const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
            const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
            let inP = 0, both = 0;
            for (let i = 0; i < 1200; i++) {
                const px = x0 + Math.random() * (x1 - x0), py = y0 + Math.random() * (y1 - y0);
                if (!pointInPolygon(px, py, g)) continue;
                inP++;
                if (hitIndexed(px, py, alinIdx)) both++;
            }
            if (inP < 120) continue;
            const frac = both / inP;
            clipFracs.push(frac);
            if (frac <= 0.02) outside++;
            else if (frac >= 0.98) whole++;
            else {
                clipped++;
                if (clipExamples.length < 12) {
                    const c = centroid(g);
                    const host = c ? hitIndexed(c[0], c[1], alinIdx) : null;
                    clipExamples.push({
                        window: win.name,
                        refcat: f.attributes?.refcat ?? null,
                        parcelAreaM2: +area.toFixed(1),
                        buildableFraction: +frac.toFixed(3),
                        buildableM2: +(frac * area).toFixed(1),
                        landRemovedM2: +((1 - frac) * area).toFixed(1),
                        hostAltura: host?.attributes?.altura ?? null,
                    });
                }
            }
        }
    }

    R.D2_whySharedEdge = {
        question: 'party-wall points lying ON a 212 boundary — do the flanking 212 polygons carry DIFFERENT altura?',
        flankingAlturaDiffers: diffAltura,
        flankingAlturaSame: sameAltura,
        noFlankingPolygon: oneSided,
        differsPct: pct(diffAltura, diffAltura + sameAltura),
        verdict:
            diffAltura > sameAltura
                ? 'ORDINANCE SUBDIVISION — the shared edge exists because the LEGAL VALUE changes there, not because the cadastre does'
                : 'INDETERMINATE — shared edges do not track a change in altura',
    };
    R.D3_streetComplement = {
        question: 'do points on the published street CENTRELINE fall inside a 212 polygon?',
        axisPointsInside212: axisInside.in,
        axisPointsTested: axisInside.total,
        insidePct: pct(axisInside.in, axisInside.total),
        verdict:
            pct(axisInside.in, axisInside.total) < 10
                ? 'STREET IS EXCLUDED — 212 is the BUILDABLE complement, and its boundary is therefore the line between buildable land and public way = the ALIGNMENT'
                : 'street is covered — 212 is not a buildable-land layer',
    };
    R.D4_clippingReach = {
        parcelsTested: clipFracs.length,
        fullyBuildable: whole,
        partiallyClipped: clipped,
        entirelyOutside212: outside,
        partiallyClippedPct: pct(clipped, clipFracs.length),
        entirelyOutsidePct: pct(outside, clipFracs.length),
        buildableFraction: stats(clipFracs),
        examples: clipExamples,
        note:
            'A parcel entirely outside 212 is NOT drawn as zero buildable — it is an UNKNOWN/■ no-rule ' +
            'case for the caller to refuse on (L-616, ADR-0283). It is counted separately here for that reason.',
    };

    mkdirSync(join(HERE, 'out'), { recursive: true });
    writeFileSync(join(HERE, 'out', 'probe2.json'), JSON.stringify(R, null, 2));

    console.log('\n════ DISCRIMINATORS ════');
    console.log('D2 flanking altura differs:', diffAltura, 'same:', sameAltura, `(${R.D2_whySharedEdge.differsPct}% differ)`);
    console.log('   →', R.D2_whySharedEdge.verdict);
    console.log('D3 street-axis points inside 212:', `${R.D3_streetComplement.insidePct}%`, `(n=${axisInside.total})`);
    console.log('   →', R.D3_streetComplement.verdict);
    console.log('D4 parcels: whole', whole, '| clipped', clipped, `(${R.D4_clippingReach.partiallyClippedPct}%)`, '| outside', outside);
    console.log('\nwrote out/probe2.json');
}

main().catch((e) => { console.error('PROBE FAILED (a FAILURE, not an empty result):', e.message); process.exit(1); });
