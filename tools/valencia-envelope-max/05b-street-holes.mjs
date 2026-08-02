// STEP 5b — ⛔ IS 15.85% THE PUBLIC SHARE, OR ONLY THE PART THE FIELD HAPPENS TO NAME?
//
// Step 5 measured PUBLIC/SYSTEMS = 15.85% of buildable land from the `dotacion` field. Balears
// measured 32.55%. Before that difference is reported as a fact about València, it has to
// survive one obvious alternative explanation: **the street network may simply not be in the
// field.**
//
// The suspicion is quantitative, not vague. Across ALL 1,590.67 km² of València's buildable
// land the `PCV`+`SCV` codes — "comunicaciones red viaria (dominio público)" — total ~24.6 km²,
// about 1.5%. Street surface in a Spanish town is nothing like 1.5% of its urban land. So
// either the streets are inside the zone polygons, or they are HOLES in the layer.
//
// ⛔ Σ AREA CANNOT DECIDE THIS. The prior probe's Σ zonificación ÷ municipal area = 1.020 for
// València is consistent with BOTH readings: urban land is ~15% of that municipality, so even a
// 20% street hole inside it moves the ratio by 3% — inside the noise, and cancellable against
// overlap elsewhere. A test that cannot separate the two hypotheses is not a test.
//
// So this step decides it GEOMETRICALLY, by RASTER SAMPLING declared dense-urban boxes:
//   coverage = (sampled points falling inside ANY Zonificacion polygon) / (points in the box)
//     ≈ 1.00           → the layer is a true partition; streets are INSIDE the zone polygons,
//                        and 15.85% is a floor, not the public share.
//     ≈ 0.70 – 0.90    → streets are HOLES; the layer maps blocks, and the holes ARE the
//                        street area, which can then be added to the public side.
//
// The boxes are PURPOSIVE and their coordinates are printed, so anyone can re-run them.
import { wfsUrl, likeFilter, get, owsException, save, pct } from './lib.mjs';

// ⛔ THE BOX IS CHOSEN BY THE DATA, NOT BY ME. Hand-typed coordinates are an unsourced input:
// if I place a box badly I get a coverage number that is an artefact of my typing. So each
// municipality's box is SELECTED as the 1 km cell containing the most distinct urban-fabric
// (ZUR-RE / ZUR-NHT) polygons — i.e. the densest consolidated fabric the layer itself knows
// about. The selected coordinates are printed and saved so the run is reproducible.
const TARGETS = [
    { ine: '46250', name: 'València capital' },
    { ine: '12135', name: 'Vila-real' },
    { ine: '03014', name: 'Alacant' },
    { ine: '12040', name: 'Castelló de la Plana' },
    { ine: '46131', name: 'Gandia' },
    { ine: '03130', name: 'Tollos (small rural — the tail)' },
];
const FABRIC = new Set(['ZUR-RE', 'ZUR-NHT']);
const HALF = 500;
const STEP = 2;   // 2 m raster → 250,000 points per box. Street widths are 8–20 m; 2 m resolves them.

/** Parse gml:Polygon rings out of one featureMember chunk. Returns [{ext:[[x,y]..], int:[...]}] */
function polygons(chunk) {
    const out = [];
    for (const pm of chunk.matchAll(/<gml:Polygon[\s\S]*?<\/gml:Polygon>/g)) {
        const p = pm[0];
        const ring = (m) => { const c = m.trim().split(/\s+/).map(Number); const r = []; for (let i = 0; i < c.length; i += 2) r.push([c[i], c[i + 1]]); return r; };
        const ext = [], int = [];
        for (const m of p.matchAll(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) ext.push(ring(m[1]));
        for (const m of p.matchAll(/<gml:interior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) int.push(ring(m[1]));
        for (const e of ext) out.push({ ext: e, int });
    }
    return out;
}

function bbox(r) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
}

/** Even-odd ray casting. */
function inRing(x, y, r) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

const results = [];
for (const b of TARGETS) {
    const u = wfsUrl({ typename: 'ms:Planeamiento.Zonificacion', filter: likeFilter(b.ine), propertyname: 'msGeometry,zon_suelo,clas_suelo,dotacion' });
    const r = await get(u, 300000);
    const exc = owsException(r.body);
    if (!r.ok || exc) { console.error(`⛔ ${b.name}: ${exc || r.http || r.err}`); results.push({ ...b, st: 'UNKNOWN' }); continue; }

    const all = [];
    for (const c of r.body.split('<gml:featureMember>').slice(1)) {
        const code = (c.match(/<ms:zon_suelo>([^<]*)<\/ms:zon_suelo>/) || [])[1] ?? '?';
        const dot = (c.match(/<ms:dotacion>([^<]*)<\/ms:dotacion>/) || [])[1] || '';
        for (const p of polygons(c)) all.push({ code, dot, ...p, bb: bbox(p.ext) });
    }
    // ── SELECT THE BOX: the 1 km cell with the most urban-fabric AREA.
    //
    // ⛔ SELF-CORRECTION, RECORDED. The first selector maximised the COUNT of fabric polygons
    // whose centroid fell in the cell. For València that chose a cell that was 44.6% ZRP-NA-LG
    // and 42.4% ZRP-CA — the Albufera natural park, where the layer carries many TINY dispersed
    // ZUR-RE polygons. A box that is mostly protected wetland measures nothing about street
    // geometry, and its 100% coverage was an artefact of the selector, not a finding about the
    // register. Counting polygons rewards fragmentation; the quantity that means "dense urban
    // fabric" is AREA. Fixed, and the rejected result is kept in the file rather than deleted.
    const cells = new Map();
    for (const f of all) {
        if (!FABRIC.has(f.code) || f.dot) continue;                       // built fabric, not dotacional
        const a = Math.abs((f.bb[2] - f.bb[0]) * (f.bb[3] - f.bb[1]));
        const cx = Math.floor((f.bb[0] + f.bb[2]) / 2 / (2 * HALF));
        const cy = Math.floor((f.bb[1] + f.bb[3]) / 2 / (2 * HALF));
        const k = `${cx},${cy}`;
        const cur = cells.get(k) || { n: 0, area: 0 };
        cur.n++; cur.area += Math.min(a, 4 * HALF * HALF);                // one polygon cannot exceed the cell
        cells.set(k, cur);
    }
    if (!cells.size) { console.error(`⛔ ${b.name}: no ZUR-RE/ZUR-NHT fabric polygons at all`); results.push({ ...b, st: 'NO-FABRIC' }); continue; }
    const [bestK, best] = [...cells].sort((a, z) => z[1].area - a[1].area)[0];
    const bestN = best.n;
    const [gx, gy] = bestK.split(',').map(Number);
    const X0 = gx * 2 * HALF, Y0 = gy * 2 * HALF, X1 = X0 + 2 * HALF, Y1 = Y0 + 2 * HALF;

    const feats = all.filter((f) => !(f.bb[2] < X0 || f.bb[0] > X1 || f.bb[3] < Y0 || f.bb[1] > Y1));
    if (!feats.length) { console.error(`⛔ ${b.name}: 0 polygons intersect the selected box — selector bug, NOT a coverage result`); results.push({ ...b, st: 'NO-POLYGONS-IN-BOX' }); continue; }
    console.error(`${b.name} — box selected [${X0},${Y0}]–[${X1},${Y1}] EPSG:25830 (${bestN} fabric polygons centred in it)`);

    let total = 0, covered = 0;
    const byCode = {}, byDot = { public: 0, private: 0 };
    for (let x = X0; x <= X1; x += STEP) {
        for (let y = Y0; y <= Y1; y += STEP) {
            total++;
            let hit = null;
            for (const f of feats) {
                if (x < f.bb[0] || x > f.bb[2] || y < f.bb[1] || y > f.bb[3]) continue;
                if (!inRing(x, y, f.ext)) continue;
                if (f.int.some((h) => inRing(x, y, h))) continue;
                hit = f; break;
            }
            if (hit) {
                covered++;
                byCode[hit.code] = (byCode[hit.code] || 0) + 1;
                if (hit.dot) byDot.public++; else byDot.private++;
            }
        }
    }
    const cov = covered / total;
    const verdict = cov > 0.97 ? 'PARTITION — streets are INSIDE the zone polygons'
        : cov < 0.92 ? 'HOLES — the layer maps blocks; the uncovered fraction is street/public space'
            : 'AMBIGUOUS';
    console.error(`${b.name.padEnd(32)} polys-in-box=${String(feats.length).padStart(4)}  coverage=${(100 * cov).toFixed(2)}%  → ${verdict}`);
    console.error(`   covered split: public(dotacion)=${pct(byDot.public, covered)}%  private=${pct(byDot.private, covered)}%   codes=${JSON.stringify(Object.fromEntries(Object.entries(byCode).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, +(100 * v / covered).toFixed(1)])))}`);
    results.push({
        ...b, st: 'OK', box: [X0, Y0, X1, Y1], stepM: STEP, polygonsInBox: feats.length,
        points: total, covered, coverage: +(cov).toFixed(4), verdict,
        coveredPublicPct: pct(byDot.public, covered), coveredPrivatePct: pct(byDot.private, covered),
        byCodePct: Object.fromEntries(Object.entries(byCode).map(([k, v]) => [k, +(100 * v / covered).toFixed(2)])),
    });
}

const ok = results.filter((r) => r.st === 'OK');
const meanCov = ok.length ? ok.reduce((a, b) => a + b.coverage, 0) / ok.length : null;
const allPartition = ok.length > 0 && ok.every((r) => r.coverage > 0.97);
const allHoles = ok.length > 0 && ok.every((r) => r.coverage < 0.92);
console.error(`\n⭐ VERDICT: mean coverage ${meanCov == null ? 'n/a' : (100 * meanCov).toFixed(2) + '%'} over ${ok.length} boxes → ${allPartition ? 'PARTITION' : allHoles ? 'HOLES' : 'MIXED/AMBIGUOUS — report both readings'}`);
save('_05b_street_holes.json', { boxes: results, meanCoverage: meanCov, allPartition, allHoles, stepM: STEP, crs: 'EPSG:25830' });
