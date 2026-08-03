// §VALENCIA-ALINEACIONES-PROBE — is `MapServer/212` a LEGAL ALIGNMENT, or a cartographic edge?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS PROBE EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// València's Open Data portal publishes "PGOU - Alineaciones" as a live ArcGIS feature service.
// A layer NAMED "alineaciones" is not evidence that it IS one — this repo has already been burned
// twice on exactly that inference:
//
//   • Murcia  `pgou_ejes`      — named like an axis, IS an axis (2.1 % on-frontage, 69.7 % midway,
//                                asymmetry median 0.49).  ⇒ centreline, NOT an alignment.
//   • Murcia  `pgou_alineaciones` — named "alineaciones", is actually the CALIFICACIÓN plane
//                                (see providers/resolveMurciaZoning.ts, which says so verbatim).
//   • Córdoba `sup_viales`     — 83.9 % on-frontage, median 0 m, vs its axis at 16.7 %.
//                                ⇒ street EDGE.  The FIRST Córdoba method was a ray test and it
//                                was BROKEN; only the PAIRED CONTROL caught it.
//
// ⇒ Therefore: point-to-segment distance, never a ray test, and never a single distribution.
//   Every number below is reported against a control drawn from the SAME publisher, the SAME
//   service and the SAME CRS, so that a systematic error moves both and cancels.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// CRS — READ, NOT INFERRED  (task rule 3)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every layer used here declares `sourceSpatialReference.wkid = 25830` (ETRS89 / UTM 30N) in its
// own published `?f=json` metadata — asserted at runtime by `assertNativeCrs()`, which REFUSES if
// the service ever answers in anything else. All queries pass `inSR=25830&outSR=25830`, so no
// reprojection happens at any point and every metre below is a real metre on the publisher's own
// grid. This is the trap a sibling agent hit in Murcia: measuring on 4326 geometry quantised to
// ~10 m against legal bands at 8 m and 12 m. Nothing here is reprojected, for display or otherwise.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE PAIRED CONTROL — three groups, one of which MUST fail if 212 is an alignment
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A parcel edge is classified by an INDEPENDENT criterion — whether another cadastral parcel
// shares it — before any distance to 212 is looked at:
//
//   FRONTAGE  edge with no neighbouring parcel behind it  → faces the street
//   PARTY     edge shared with another parcel (≤ PARTY_M) → interior to the block   ⟵ THE CONTROL
//
// Then, for each group, distance to (a) the 212 boundary and (b) layer 223 `Ejes de calle`, the
// publisher's own street CENTRELINE — the second control, and the same discriminator that convicted
// Murcia's `pgou_ejes`.
//
//   if 212 is a LEGAL ALIGNMENT  → FRONTAGE d212 ≈ 0 · PARTY d212 ≫ 0 · d223 ≈ half street width
//   if 212 is a CADASTRE COPY    → FRONTAGE d212 ≈ 0 · PARTY d212 ≈ 0        ⟵ control fires
//   if 212 is a STREET AXIS      → FRONTAGE d212 ≈ half street width, and d212 ≈ d223
//
// The PARTY group is the whole point: without it, "frontage sits on the line" is equally consistent
// with 212 being a redrawn copy of the cadastre, which would be worth nothing.
//
// ⚠ NOTHING in this file interprets `altura`. Founder ruling R2 stands: the offset convention is
// undocumented and measured two-sided, and engineering may not retire it. This probe is about
// GEOMETRY only — see esValenciaAlineaciones.ts for the parser that likewise refuses to interpret.
//
// Run:  node tools/valencia-alineaciones-probe/probe.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = 'PRYZM-valencia-alineaciones-probe/1.0 (+https://pryzm.app)';

const SERVICE =
    'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer';

/** The layer under test, and the controls. All four are published by the SAME service. */
const LAYER = {
    ALINEACIONES: 212, // "PGOU - Alineacions / PGOU - Alineaciones"  ← the candidate
    PARCELS: 216, // "Parcel·les cadastrals urbana"                   ← independent edge classifier
    STREET_AXIS: 223, // "Eixos de carrer / Ejes de calle"            ← CONTROL: a real centreline
    BUILDINGS: 112, // "Cartografia Base Edificis"                    ← reality check
};

/** The CRS the publisher declares. Asserted, never assumed. */
const NATIVE_WKID = 25830;

/** Two parcels are treated as sharing a party edge below this separation, in NATIVE metres. */
const PARTY_M = 0.5;
/** "On the line" threshold, in NATIVE metres. Deliberately tight: this is survey-grade UTM. */
const ON_LINE_M = 1.0;

/**
 * Test windows in NATIVE EPSG:25830, chosen inside the layer's own published extent
 * (xmin 720795.8 · ymin 4351286.2 · xmax 734982.1 · ymax 4382754.7) and spread across
 * morphologies so a result cannot be an artefact of one block type.
 */
const WINDOWS = [
    { name: 'Eixample / Ruzafa (closed block)', x: 725600, y: 4371900, half: 320 },
    { name: 'Ciutat Vella (medieval irregular)', x: 725150, y: 4373150, half: 300 },
    { name: 'Extramurs / Gran Via (open block)', x: 724500, y: 4372450, half: 320 },
    { name: 'Benimaclet (peripheral grid)', x: 727100, y: 4374600, half: 320 },
    { name: 'Camins al Grau (modern)', x: 728400, y: 4372600, half: 320 },
];

// ── plumbing ──────────────────────────────────────────────────────────────────────────────────

async function getJson(url, tries = 4) {
    let last;
    for (let attempt = 1; attempt <= tries; attempt++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
            const text = await res.text();
            if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
            let j;
            try {
                j = JSON.parse(text);
            } catch {
                throw new Error(`non-JSON (${text.slice(0, 160)})`);
            }
            // ⚠ ArcGIS answers HTTP 200 with an `error` body. Treating that as "empty" is the
            // failure-vs-empty conflation of L-422/457/467/469. It is an ERROR and it throws.
            if (j.error) throw new Error(`ArcGIS error ${j.error.code}: ${j.error.message}`);
            return j;
        } catch (e) {
            last = e;
            // ⚠ A transport failure is NOT an empty result. It is retried, and if it never
            // succeeds it THROWS — it is never silently degraded into "no features here".
            if (attempt < tries) await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
    }
    throw last;
}

/** Layer metadata. Also where the CRS is READ from. */
async function layerMeta(id) {
    return getJson(`${SERVICE}/${id}?f=json`);
}

function assertNativeCrs(meta, id) {
    const wkid = meta?.sourceSpatialReference?.wkid ?? meta?.extent?.spatialReference?.wkid ?? null;
    if (wkid !== NATIVE_WKID) {
        throw new Error(
            `layer ${id} declares wkid ${wkid}, expected ${NATIVE_WKID}. REFUSING — every distance ` +
                `in this probe assumes the publisher's own metric grid, and an unverified CRS makes ` +
                `every metre below a fiction.`,
        );
    }
    return wkid;
}

/** Query one layer inside one native-CRS envelope. Pages past maxRecordCount. */
async function queryWindow(id, win) {
    const env = {
        xmin: win.x - win.half,
        ymin: win.y - win.half,
        xmax: win.x + win.half,
        ymax: win.y + win.half,
        spatialReference: { wkid: NATIVE_WKID },
    };
    const out = [];
    let offset = 0;
    for (;;) {
        const url =
            `${SERVICE}/${id}/query?` +
            `where=1%3D1&outFields=*&returnGeometry=true` +
            `&geometry=${encodeURIComponent(JSON.stringify(env))}` +
            `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects` +
            `&inSR=${NATIVE_WKID}&outSR=${NATIVE_WKID}` +
            `&resultOffset=${offset}&resultRecordCount=2000&f=json`;
        const j = await getJson(url);
        const feats = j.features ?? [];
        out.push(...feats);
        // The response ALSO carries a spatialReference. Assert it too — an outSR the server
        // silently declined is precisely how a lossy reprojection sneaks in unnoticed.
        if (feats.length && j.spatialReference && j.spatialReference.wkid !== NATIVE_WKID) {
            throw new Error(`layer ${id} answered in wkid ${j.spatialReference.wkid}, not ${NATIVE_WKID}`);
        }
        if (!j.exceededTransferLimit || feats.length === 0) break;
        offset += feats.length;
        if (offset > 20_000) break;
    }
    return out;
}

// ── pure geometry, in native metres ───────────────────────────────────────────────────────────

/** Point-to-SEGMENT distance. NOT a ray test — the Córdoba agent's ray method was broken. */
function ptSegDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t; // clamp to the SEGMENT
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** All segments of an esri polygon/polyline geometry, as flat [ax,ay,bx,by] tuples. */
function segmentsOf(geom) {
    const parts = geom?.rings ?? geom?.paths ?? [];
    const segs = [];
    for (const part of parts) {
        for (let i = 0; i + 1 < part.length; i++) {
            const [ax, ay] = part[i];
            const [bx, by] = part[i + 1];
            if (ax === bx && ay === by) continue;
            segs.push([ax, ay, bx, by]);
        }
    }
    return segs;
}

function minDistToSegs(px, py, segs) {
    let best = Infinity;
    for (const s of segs) {
        const d = ptSegDist(px, py, s[0], s[1], s[2], s[3]);
        if (d < best) best = d;
        if (best === 0) return 0;
    }
    return best;
}

/** Shoelace area of one ring, absolute, in native m². */
function ringArea(ring) {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return Math.abs(a) / 2;
}

/** Even-odd point-in-polygon over all rings of an esri polygon. */
function pointInPolygon(px, py, geom) {
    let inside = false;
    for (const ring of geom?.rings ?? []) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
    }
    return inside;
}

function polygonArea(geom) {
    // Esri rings: outer CW, holes CCW. Signed sum handles holes.
    let a = 0;
    for (const ring of geom?.rings ?? []) {
        let s = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
        }
        a += s / 2;
    }
    return Math.abs(a);
}

function centroidOf(geom) {
    let bx = 0,
        by = 0,
        n = 0;
    for (const ring of geom?.rings ?? []) for (const [x, y] of ring) (bx += x), (by += y), n++;
    return n ? [bx / n, by / n] : null;
}

/** Sample points along every edge of a ring: returns {x,y,edgeIdx}. */
function sampleRingEdges(ring, stepM) {
    const pts = [];
    for (let i = 0; i + 1 < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[i + 1];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 0.05) continue;
        const n = Math.max(1, Math.floor(len / stepM));
        for (let k = 0; k <= n; k++) {
            const t = n === 0 ? 0.5 : k / n;
            pts.push({ x: ax + t * (bx - ax), y: ay + t * (by - ay), edgeIdx: i, edgeLen: len });
        }
    }
    return pts;
}

function stats(arr) {
    if (!arr.length) return { n: 0, median: null, p25: null, p75: null, mean: null };
    const s = [...arr].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return {
        n: s.length,
        median: +q(0.5).toFixed(3),
        p25: +q(0.25).toFixed(3),
        p75: +q(0.75).toFixed(3),
        mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3),
    };
}

const pct = (num, den) => (den ? +((100 * num) / den).toFixed(1) : null);

// ── the probe ─────────────────────────────────────────────────────────────────────────────────

async function main() {
    const report = { probe: '§VALENCIA-ALINEACIONES-PROBE', ranAt: new Date().toISOString(), service: SERVICE };

    // ── STEP 0 — CRS and shape of the layer, read from published metadata ─────────────────────
    const metas = {};
    for (const [k, id] of Object.entries(LAYER)) {
        const m = await layerMeta(id);
        metas[k] = {
            id,
            name: m.name,
            geometryType: m.geometryType,
            wkid: assertNativeCrs(m, id),
            fields: (m.fields ?? []).map((f) => f.name),
            maxRecordCount: m.maxRecordCount,
        };
        console.log(`layer ${id} ${m.name} · ${m.geometryType} · EPSG:${metas[k].wkid}`);
    }
    report.layers = metas;
    report.crs = {
        epsg: NATIVE_WKID,
        source: 'published sourceSpatialReference.wkid on each layer ?f=json — READ, not inferred',
        reprojection: 'NONE. inSR=outSR=25830 on every query; all distances are native metres.',
    };

    // ── STEP 1 — attribute completeness (question a) ──────────────────────────────────────────
    const total = (await getJson(`${SERVICE}/${LAYER.ALINEACIONES}/query?where=1%3D1&returnCountOnly=true&f=json`))
        .count;
    const withAltura = (
        await getJson(
            `${SERVICE}/${LAYER.ALINEACIONES}/query?where=${encodeURIComponent(
                "altura IS NOT NULL AND altura <> ''",
            )}&returnCountOnly=true&f=json`,
        )
    ).count;
    const withTtggss = (
        await getJson(
            `${SERVICE}/${LAYER.ALINEACIONES}/query?where=${encodeURIComponent(
                "ttggss IS NOT NULL AND ttggss <> ''",
            )}&returnCountOnly=true&f=json`,
        )
    ).count;
    report.attributes = {
        totalFeatures: total,
        withAltura,
        withAlturaPct: pct(withAltura, total),
        withTtggss,
        withTtggssPct: pct(withTtggss, total),
        note: 'geometry-only would show 0 here; a legal layer carries per-polygon ordinance keys.',
    };
    console.log(`\n212: ${total} polygons · altura present ${withAltura} (${report.attributes.withAlturaPct}%) · ttggss ${withTtggss}`);

    // ── STEP 2 — the paired-control distance test (question b) ────────────────────────────────
    const G = {
        frontage: { d212: [], d223: [] },
        party: { d212: [], d223: [] },
    };
    const perWindow = [];
    let coverageNum = 0;
    let coverageDen = 0;
    const parcelsPerAlin = [];

    for (const win of WINDOWS) {
        const [alin, parcels, axes] = await Promise.all([
            queryWindow(LAYER.ALINEACIONES, win),
            queryWindow(LAYER.PARCELS, win),
            queryWindow(LAYER.STREET_AXIS, win),
        ]);
        console.log(`\n${win.name}: 212=${alin.length} · 216=${parcels.length} · 223=${axes.length}`);
        if (!alin.length || !parcels.length) {
            perWindow.push({ window: win.name, alin: alin.length, parcels: parcels.length, skipped: 'empty' });
            continue;
        }

        const alinSegs = alin.flatMap((f) => segmentsOf(f.geometry));
        const axisSegs = axes.flatMap((f) => segmentsOf(f.geometry));
        const parcelSegs = parcels.map((f) => segmentsOf(f.geometry));

        const w = { window: win.name, alin: alin.length, parcels: parcels.length, axes: axes.length, frontage: 0, party: 0 };

        for (let pi = 0; pi < parcels.length; pi++) {
            const geom = parcels[pi].geometry;
            if (!geom?.rings?.length) continue;

            // ── coverage: is the parcel INSIDE the 212 fabric? ────────────────────────────────
            const c = centroidOf(geom);
            if (c) {
                coverageDen++;
                if (alin.some((a) => pointInPolygon(c[0], c[1], a.geometry))) coverageNum++;
            }

            for (const ring of geom.rings) {
                for (const p of sampleRingEdges(ring, 2)) {
                    // INDEPENDENT classifier first — never look at 212 to decide the group.
                    let dNbr = Infinity;
                    for (let qi = 0; qi < parcels.length; qi++) {
                        if (qi === pi) continue;
                        const d = minDistToSegs(p.x, p.y, parcelSegs[qi]);
                        if (d < dNbr) dNbr = d;
                        if (dNbr <= PARTY_M) break;
                    }
                    const group = dNbr <= PARTY_M ? 'party' : 'frontage';
                    const d212 = minDistToSegs(p.x, p.y, alinSegs);
                    const d223 = axisSegs.length ? minDistToSegs(p.x, p.y, axisSegs) : null;
                    G[group].d212.push(d212);
                    if (d223 !== null) G[group].d223.push(d223);
                    w[group]++;
                }
            }
        }

        // aggregation: how many parcels fall inside one 212 polygon?
        for (const a of alin) {
            let n = 0;
            for (const f of parcels) {
                const c = centroidOf(f.geometry);
                if (c && pointInPolygon(c[0], c[1], a.geometry)) n++;
            }
            if (n > 0) parcelsPerAlin.push(n);
        }
        perWindow.push(w);
    }

    const onLine = (arr) => pct(arr.filter((d) => d <= ON_LINE_M).length, arr.length);
    report.pairedControl = {
        method:
            'point-to-SEGMENT distance (clamped, never a ray) from parcel-boundary sample points ' +
            'every 2 m, in native EPSG:25830 metres. Groups assigned by an INDEPENDENT criterion ' +
            `(shared with another cadastral parcel within ${PARTY_M} m) BEFORE any 212 distance is read.`,
        onLineThresholdM: ON_LINE_M,
        FRONTAGE: {
            meaning: 'parcel edge with no neighbouring parcel — faces the street',
            toAlineaciones212: { ...stats(G.frontage.d212), onLinePct: onLine(G.frontage.d212) },
            toStreetAxis223: { ...stats(G.frontage.d223), onLinePct: onLine(G.frontage.d223) },
        },
        PARTY: {
            meaning: 'edge shared with another parcel — interior to the block. THE CONTROL.',
            toAlineaciones212: { ...stats(G.party.d212), onLinePct: onLine(G.party.d212) },
            toStreetAxis223: { ...stats(G.party.d223), onLinePct: onLine(G.party.d223) },
        },
    };
    report.perWindow = perWindow;
    report.nesting = {
        parcelCentroidsInsideAlineaciones: coverageNum,
        parcelCentroidsTested: coverageDen,
        coveragePct: pct(coverageNum, coverageDen),
        parcelsPerAlineacionPolygon: stats(parcelsPerAlin),
    };

    // ── STEP 3 — end-to-end parcel intersection (question c) ──────────────────────────────────
    // One real parcel, one real 212 polygon, measured. No synthesis.
    const demoWin = WINDOWS[0];
    const [alinD, parcelsD] = await Promise.all([
        queryWindow(LAYER.ALINEACIONES, demoWin),
        queryWindow(LAYER.PARCELS, demoWin),
    ]);
    const samples = [];
    for (const f of parcelsD.slice(0, 400)) {
        const geom = f.geometry;
        if (!geom?.rings?.length) continue;
        const pArea = polygonArea(geom);
        if (pArea < 60) continue;
        // Monte-Carlo the intersection area: robust, and it cannot fabricate a ring.
        const ring = geom.rings[0];
        const xs = ring.map((p) => p[0]);
        const ys = ring.map((p) => p[1]);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        let inP = 0;
        let inBoth = 0;
        const N = 4000;
        for (let i = 0; i < N; i++) {
            const px = x0 + Math.random() * (x1 - x0);
            const py = y0 + Math.random() * (y1 - y0);
            if (!pointInPolygon(px, py, geom)) continue;
            inP++;
            if (alinD.some((a) => pointInPolygon(px, py, a.geometry))) inBoth++;
        }
        if (inP < 200) continue;
        const host = alinD.find((a) => {
            const c = centroidOf(geom);
            return c && pointInPolygon(c[0], c[1], a.geometry);
        });
        samples.push({
            refcat: f.attributes?.refcat ?? f.attributes?.refpar ?? null,
            parcelAreaM2: +pArea.toFixed(1),
            buildableFractionOfParcel: +(inBoth / inP).toFixed(3),
            derivedBuildableM2: +((inBoth / inP) * pArea).toFixed(1),
            hostAlineacionAltura: host?.attributes?.altura ?? null,
            hostAlineacionTtggss: host?.attributes?.ttggss ?? null,
            hostAlineacionAreaM2: host ? +polygonArea(host.geometry).toFixed(1) : null,
        });
        if (samples.length >= 25) break;
    }
    const fracs = samples.map((s) => s.buildableFractionOfParcel);
    report.parcelIntersection = {
        method:
            'real Catastro-referenced parcel (layer 216, carries `refcat`) ∩ union of layer-212 ' +
            'polygons, area by 4000-point Monte Carlo inside the parcel, native CRS. ' +
            'An UNKNOWN is never drawn as 0 or as the whole parcel — a parcel with no 212 host is ' +
            'reported as such, not as unbounded.',
        sampled: samples.length,
        buildableFraction: stats(fracs),
        fullyInside: samples.filter((s) => s.buildableFractionOfParcel >= 0.99).length,
        partiallyClipped: samples.filter((s) => s.buildableFractionOfParcel > 0.01 && s.buildableFractionOfParcel < 0.99)
            .length,
        noBuildableArea: samples.filter((s) => s.buildableFractionOfParcel <= 0.01).length,
        samples,
    };

    mkdirSync(join(HERE, 'out'), { recursive: true });
    writeFileSync(join(HERE, 'out', 'probe.json'), JSON.stringify(report, null, 2));

    console.log('\n════ PAIRED CONTROL ════');
    console.log('FRONTAGE → 212:', JSON.stringify(report.pairedControl.FRONTAGE.toAlineaciones212));
    console.log('FRONTAGE → 223:', JSON.stringify(report.pairedControl.FRONTAGE.toStreetAxis223));
    console.log('PARTY    → 212:', JSON.stringify(report.pairedControl.PARTY.toAlineaciones212));
    console.log('PARTY    → 223:', JSON.stringify(report.pairedControl.PARTY.toStreetAxis223));
    console.log('\nnesting:', JSON.stringify(report.nesting));
    console.log('intersection:', JSON.stringify(report.parcelIntersection.buildableFraction),
        'fully', report.parcelIntersection.fullyInside, 'clipped', report.parcelIntersection.partiallyClipped,
        'none', report.parcelIntersection.noBuildableArea);
    console.log('\nwrote out/probe.json');
}

main().catch((e) => {
    console.error('PROBE FAILED (this is a FAILURE, not an empty result):', e.message);
    process.exit(1);
});
