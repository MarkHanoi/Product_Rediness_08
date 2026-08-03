// §CORDOBA-ALIGNMENT-PROBE — prove today's Córdoba failure BEFORE changing anything.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The brief for making ES-Córdoba reachable states the blocker is "the ALIGNMENT LAYER, needed by
// roughly 74 % of rows". That is a CLAIM. This probe measures it, live, with real counts, and it
// is deliberately shipped BEFORE the fix (§CONTEXT-DATA-HONESTY: ship the probe before the fix;
// a FAILURE and an EMPTY answer are otherwise the same value — L-422/457/467/469).
//
// It answers three questions, each independently:
//
//   A  LAYER SWEEP        Does Córdoba publish an ALIGNMENT (alineación) layer at all? Sweep the
//                         complete WFS inventory of BOTH publishers for the alignment lexemes.
//                         Distinguishes "endpoint down" (failure) from "endpoint answered, zero
//                         alignment layers" (empty). These are NOT the same value.
//
//   B  ALIGNMENT vs       ⭐ THE LOAD-BEARING TEST. `idecordoba:ejes_red_viaria` is the only
//      CENTRELINE         street LINE layer Córdoba publishes. "Eje" is Spanish for AXIS. An
//                         alignment sits ON a frontage; a centreline sits BETWEEN two opposing
//                         frontages. Confusing them silently fabricates a setback.
//                         Method: sample points along each line, cast a perpendicular ray both
//                         ways, measure the distance to the first `idecordoba:manzana` (block)
//                         boundary on each side. Report the DISTRIBUTION and the SAMPLE SIZE.
//                           • centreline ⇒ dLeft ≈ dRight, both > 0  (symmetric, straddling)
//                           • alignment  ⇒ min(dLeft,dRight) ≈ 0     (it lies on a frontage)
//
//   C  COVERAGE CENSUS    Of the 453 published `coaco:ordenanzas` polygons — the ONLY land in
//                         Córdoba with a machine-readable calificación — how many can bind a
//                         BOUNDED buildable envelope today, how many cannot, and for each failure
//                         WHICH constraint is missing. Area-weighted (L-656: the denominator is
//                         buildable land, not clicks).
//
// CRS: every layer here is native EPSG:25830 (ETRS89 / UTM 30N) — a PROJECTED, metric frame, so
// all distances below are metres directly, with no reprojection and no degree-to-metre fudge.
// ⚠ A bare EPSG:4326 bbox against these layers returns SILENTLY EMPTY (the documented Córdoba
// gotcha) — this probe therefore queries in 25830 throughout and never mixes frames.
//
// Run:  node tools/cordoba-alignment-probe/probe.mjs
// Out:  tools/cordoba-alignment-probe/out/probe.json  (+ a human summary on stdout)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'out');

// ── The two publishers, both keyless and public, both verified live ────────────────────────────
const IDE_WFS = 'https://ide.cordoba.es/geoserver/wfs';
const COACO_WFS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';

/** ETRS89 / UTM zone 30N — the native frame of EVERY layer this probe reads. Metric. */
const CRS = 'urn:ogc:def:crs:EPSG::25830';
const EPSG = 'EPSG:25830';

/**
 * The alignment lexemes. If Córdoba published an alineación layer under ANY of these it would
 * appear here. `eje` is deliberately included so the sweep SURFACES the centreline trap rather
 * than hiding it — matching `eje` is not a positive result, it is the thing Probe B then tests.
 */
const ALIGNMENT_LEXEMES = [
    'alinea',   // alineación — the legal alignment line itself
    'retranq',  // retranqueo — setback
    'rasant',   // rasante — the levelling datum alignments are measured from
    'fondo',    // fondo edificable — buildable depth measured FROM the alignment
    'fachada',  // fachada — façade line
    'frente',   // frente — frontage
    'edificab', // edificabilidad envelope terms
];

const TIMEOUT_MS = 120_000;

/**
 * ⚠ A TRANSPORT FAILURE MUST NEVER BE COLLAPSED INTO "THE ANSWER IS EMPTY" (§CONTEXT-DATA-HONESTY,
 * L-422/457/467/469). Every non-answer below is returned as an explicit `error`, never as `[]`.
 * Retries exist because these municipal GeoServers intermittently drop a large GetFeature — an
 * exhausted retry budget is still reported as a FAILURE, not as zero features.
 */
async function get(url, attempts = 3) {
    let last = null;
    for (let i = 0; i < attempts; i++) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
        try {
            const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'PRYZM-probe/1.0' } });
            const body = await r.text();
            clearTimeout(t);
            if (r.ok) return { ok: true, status: r.status, body };
            last = { ok: false, status: r.status, body: '', error: `HTTP ${r.status}` };
        } catch (e) {
            clearTimeout(t);
            last = { ok: false, status: 0, body: '', error: String(e?.message ?? e) };
        }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
    return { ...last, error: `${last.error} (after ${attempts} attempts)` };
}

async function wfsJson(endpoint, typeName, extra = '') {
    const url =
        `${endpoint}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(typeName)}` +
        `&outputFormat=application/json&srsName=${encodeURIComponent(CRS)}${extra}`;
    const res = await get(url);
    if (!res.ok) return { ok: false, status: res.status, error: res.error ?? `HTTP ${res.status}`, url };
    try {
        return { ok: true, status: res.status, json: JSON.parse(res.body), url };
    } catch (e) {
        return { ok: false, status: res.status, error: `unparseable body: ${String(e?.message ?? e)}`, url };
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROBE A — the layer sweep
// ══════════════════════════════════════════════════════════════════════════════════════════════
async function probeA() {
    const publishers = [
        { id: 'ide.cordoba.es', endpoint: IDE_WFS },
        { id: 'geoserver.pgou.coacordoba.org', endpoint: COACO_WFS },
    ];
    const out = [];
    for (const p of publishers) {
        const res = await get(`${p.endpoint}?service=WFS&version=2.0.0&request=GetCapabilities`);
        if (!res.ok) {
            // FAILURE — explicitly NOT "zero alignment layers".
            out.push({ publisher: p.id, reachable: false, error: res.error ?? `HTTP ${res.status}`, layers: null, hits: null });
            continue;
        }
        const names = [...res.body.matchAll(/<Name>([^<]+)<\/Name>/g)]
            .map((m) => m[1])
            .filter((n) => n.includes(':'));
        const unique = [...new Set(names)];
        const hits = {};
        for (const lex of ALIGNMENT_LEXEMES) {
            hits[lex] = unique.filter((n) => n.toLowerCase().includes(lex));
        }
        // The CRS every layer is advertised in — a layer in the wrong CRS is the classic silent failure.
        const crsHits = [...new Set([...res.body.matchAll(/urn:ogc:def:crs:EPSG::(\d+)/g)].map((m) => m[1]))];
        out.push({
            publisher: p.id,
            reachable: true,
            layerCount: unique.length,
            advertisedCRS: crsHits.map((c) => `EPSG:${c}`),
            hits,
            // "eje" is reported SEPARATELY — it is the trap, not a find.
            ejeLayers: unique.filter((n) => /\beje/i.test(n) || n.toLowerCase().includes('eje_') || n.toLowerCase().includes('ejes')),
            streetLayers: unique.filter((n) => /vial|viaria|calle|street/i.test(n)),
            layers: unique,
        });
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROBE B — alignment vs centreline, by perpendicular distance
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Flatten any GeoJSON geometry into an array of rings/lines of [x,y] in EPSG:25830 metres. */
function toLines(geom) {
    if (!geom) return [];
    const g = geom.type, c = geom.coordinates;
    if (g === 'LineString') return [c];
    if (g === 'MultiLineString') return c;
    if (g === 'Polygon') return c;
    if (g === 'MultiPolygon') return c.flat();
    return [];
}

/**
 * Ray/segment intersection. Returns the ray parameter t (metres, since dir is unit and the frame
 * is metric) at which ray(origin,dir) crosses segment [a,b], or null.
 */
function rayHit(ox, oy, dx, dy, ax, ay, bx, by) {
    const ex = bx - ax, ey = by - ay;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return null;           // parallel
    const t = ((ax - ox) * ey - (ay - oy) * ex) / den; // along the ray
    const u = ((ax - ox) * dy - (ay - oy) * dx) / den; // along the segment
    if (t <= 1e-9 || u < 0 || u > 1) return null;
    return t;
}

/** Nearest hit of the ray against every segment in `lines`, capped at maxD metres. */
function nearestHit(ox, oy, dx, dy, lines, maxD) {
    let best = Infinity;
    for (const ln of lines) {
        for (let i = 0; i + 1 < ln.length; i++) {
            const a = ln[i], b = ln[i + 1];
            const t = rayHit(ox, oy, dx, dy, a[0], a[1], b[0], b[1]);
            if (t !== null && t < best) best = t;
        }
    }
    return best <= maxD ? best : null;
}

/**
 * Perpendicular distance from a point to the nearest segment in `lines`.
 *
 * ⚠⚠ THIS EXISTS BECAUSE THE RAY TEST ALONE IS STRUCTURALLY BLIND TO AN ALIGNMENT, AND THE
 * PAIRED CONTROL CAUGHT IT. When a line COINCIDES with a block boundary — which is precisely what
 * an alignment does — the two segments are PARALLEL, `rayHit`'s determinant is ~0, the hit is
 * rejected, and the "nearest frontage" silently becomes the frontage on the FAR side of the
 * street. Run that way, a perfect alignment scores like a centreline. The first run of this probe
 * did exactly that: the known-edge control (`sup_viales`) and the known-axis subject
 * (`ejes_red_viaria`) came back indistinguishable (6.1 % vs 12.4 % on-frontage), which is a
 * BROKEN METHOD, not a finding. Point-to-segment distance has no parallel pathology: an alignment
 * measures ~0 by construction.
 */
function nearestBoundaryDistance(px, py, lines) {
    let best = Infinity;
    for (const ln of lines) {
        for (let i = 0; i + 1 < ln.length; i++) {
            const [ax, ay] = ln[i], [bx, by] = ln[i + 1];
            const vx = bx - ax, vy = by - ay;
            const len2 = vx * vx + vy * vy;
            let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
            const d = Math.hypot(dx, dy);
            if (d < best) best = d;
        }
    }
    return Number.isFinite(best) ? best : null;
}

function quantile(sorted, q) {
    if (sorted.length === 0) return null;
    const i = (sorted.length - 1) * q;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function stats(arr) {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    return {
        n: s.length,
        min: +s[0].toFixed(3),
        p10: +quantile(s, 0.1).toFixed(3),
        median: +quantile(s, 0.5).toFixed(3),
        mean: +(sum / s.length).toFixed(3),
        p90: +quantile(s, 0.9).toFixed(3),
        max: +s[s.length - 1].toFixed(3),
    };
}

/**
 * The decisive test. For each sampled point on a street line, measure perpendicular distance to
 * the nearest block boundary on the LEFT and on the RIGHT.
 *
 *   ALIGNMENT  ⇒ the line lies ON a frontage ⇒ min(L,R) ≈ 0 and asymmetry ≈ 1
 *   CENTRELINE ⇒ the line straddles the street ⇒ both > 0 and asymmetry ≈ 0
 *
 * asymmetry = |L − R| / (L + R)  — 0 = perfectly equidistant, 1 = sitting on one side.
 */
function measurePerpendicular(lineFeatures, blockLines, opts) {
    const { maxD = 60, minSegLen = 4, samplesPerSeg = 1, cap = 4000 } = opts ?? {};
    const rows = [];
    outer: for (const f of lineFeatures) {
        for (const ln of toLines(f.geometry)) {
            for (let i = 0; i + 1 < ln.length; i++) {
                const [ax, ay] = ln[i], [bx, by] = ln[i + 1];
                const vx = bx - ax, vy = by - ay;
                const len = Math.hypot(vx, vy);
                if (len < minSegLen) continue;         // too short to carry a reliable normal
                const ux = vx / len, uy = vy / len;
                const nx = -uy, ny = ux;               // unit normal
                for (let k = 1; k <= samplesPerSeg; k++) {
                    const s = k / (samplesPerSeg + 1);
                    const px = ax + vx * s, py = ay + vy * s;
                    const L = nearestHit(px, py, nx, ny, blockLines, maxD);
                    const R = nearestHit(px, py, -nx, -ny, blockLines, maxD);
                    if (L === null || R === null) continue; // one side unbounded — not a street cross-section
                    const sum = L + R;
                    if (sum <= 0.01) continue;
                    // ⭐ The parallel-safe measurement — see `nearestBoundaryDistance`. This, not
                    // min(L,R), is what decides ALIGNMENT vs CENTRELINE.
                    const dFrontage = nearestBoundaryDistance(px, py, blockLines);
                    rows.push({
                        left: +L.toFixed(3),
                        right: +R.toFixed(3),
                        min: +Math.min(L, R).toFixed(3),
                        dFrontage: dFrontage === null ? null : +dFrontage.toFixed(3),
                        span: +sum.toFixed(3),
                        asymmetry: +(Math.abs(L - R) / sum).toFixed(4),
                    });
                    if (rows.length >= cap) break outer;
                }
            }
        }
    }
    return rows;
}

/**
 * Summarise one candidate line layer against the block frontages.
 *
 * ⭐ CENTREDNESS = min(L,R) / (L+R) is the single decisive statistic:
 *      0.50 ⇒ the line sits exactly BETWEEN the two frontages — a CENTRELINE
 *      0.00 ⇒ the line sits ON a frontage                     — an ALIGNMENT
 * It is scale-free, so a wide avenue and a narrow alley contribute equally.
 */
function summariseCandidate(label, lineFeatures, blockLines, opts) {
    const all = measurePerpendicular(lineFeatures, blockLines, opts);
    // A ray can escape across a plaza or a park and hit a block 90 m away; such a cross-section is
    // not a street. Report BOTH populations and how many were excluded — never silently filter.
    const PLAUSIBLE_SPAN_M = 40;
    const street = all.filter((r) => r.span <= PLAUSIBLE_SPAN_M && r.dFrontage !== null);
    // ⭐ Parallel-safe centredness: the true perpendicular offset from the frontage, over the
    // frontage-to-frontage span. 0 ⇒ ON the frontage (ALIGNMENT); 0.5 ⇒ dead centre (CENTRELINE).
    const c = street.map((r) => r.dFrontage / r.span);
    const NEAR_FRONTAGE_M = 1.0;
    const onFrontage = street.filter((r) => r.dFrontage <= NEAR_FRONTAGE_M).length;
    const nearHalf = c.filter((v) => v >= 0.35).length;
    const medianCentredness = quantile([...c].sort((a, b) => a - b), 0.5) ?? 0;
    return {
        label,
        lineFeaturesInWindow: lineFeatures.length,
        sampleSizeAll: all.length,
        sampleSizeStreet: street.length,
        excludedAsNonStreet: all.length - street.length,
        plausibleSpanCap_m: PLAUSIBLE_SPAN_M,
        distanceToNearestFrontage_m: stats(street.map((r) => r.dFrontage)),
        frontageToFrontageSpan_m: stats(street.map((r) => r.span)),
        centredness: stats(c),
        onFrontageFraction: street.length ? +(onFrontage / street.length).toFixed(4) : null,
        nearHalfFraction: street.length ? +(nearHalf / street.length).toFixed(4) : null,
        verdict:
            street.length < 30
                ? 'INDETERMINATE — sample too small'
                : onFrontage / street.length >= 0.6
                    ? 'ALIGNMENT — lies ON a frontage'
                    : medianCentredness >= 0.25
                        ? 'CENTRELINE — straddles the street, NOT an alignment'
                        : 'MIXED / INDETERMINATE — do not use as an alignment',
    };
}

async function probeB() {
    // Study area: the COACo pilot — the only Córdoba land with a machine-readable calificación,
    // so the only land where an alignment could ever bind an envelope.
    const ord = await wfsJson(COACO_WFS, 'coaco:ordenanzas', '&count=453');
    if (!ord.ok) return { ok: false, stage: 'ordenanzas', error: ord.error };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of ord.json.features ?? []) {
        for (const ln of toLines(f.geometry)) {
            for (const [x, y] of ln) {
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
        }
    }
    if (!Number.isFinite(minX)) return { ok: false, stage: 'ordenanzas-bbox', error: 'no geometry' };

    // Study window at the CENTROID of the pilot. Widened to 2.4 km so the sample has real power —
    // the first pass ran a 700 m box and returned n = 181, which is not a distribution.
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, H = 1200;
    const bbox = `${cx - H},${cy - H},${cx + H},${cy + H},${EPSG}`;
    const bboxParam = `&bbox=${encodeURIComponent(bbox)}`;

    // ⭐ THE PAIRED CONTROL, and it is what makes this test admissible.
    // `idecordoba:sup_viales` is the street-SURFACE polygon; its boundary is BY CONSTRUCTION the
    // street edge, i.e. it coincides with the block frontage. `idecordoba:ejes_red_viaria` is the
    // street AXIS. Running the IDENTICAL method over both, in the same window, against the same
    // blocks, calibrates the method: if the known-edge layer does not score as an ALIGNMENT, the
    // method is broken and the eje verdict means nothing.
    const [ejes, manz, viales] = await Promise.all([
        wfsJson(IDE_WFS, 'idecordoba:ejes_red_viaria', `${bboxParam}&count=20000`),
        wfsJson(IDE_WFS, 'idecordoba:manzana', `${bboxParam}&count=20000`),
        wfsJson(IDE_WFS, 'idecordoba:sup_viales', `${bboxParam}&count=20000`),
    ]);
    if (!ejes.ok) return { ok: false, stage: 'ejes', error: ejes.error };
    if (!manz.ok) return { ok: false, stage: 'manzana', error: manz.error };

    const manzFeatures = manz.json.features ?? [];
    const blockLines = manzFeatures.flatMap((f) => toLines(f.geometry));
    const opts = { maxD: 60, minSegLen: 4, samplesPerSeg: 3, cap: 20000 };

    const candidates = [
        summariseCandidate('idecordoba:ejes_red_viaria (SUBJECT — street axis)', ejes.json.features ?? [], blockLines, opts),
    ];
    if (viales.ok) {
        candidates.push(
            summariseCandidate('idecordoba:sup_viales (CONTROL — street-surface edge)', viales.json.features ?? [], blockLines, opts),
        );
    }

    return {
        ok: true,
        method:
            'perpendicular ray from sampled points on each line to the nearest `idecordoba:manzana` ' +
            'boundary on each side; centredness = min(L,R)/(L+R); all distances in metres in EPSG:25830',
        studyArea: { crs: EPSG, bbox, halfExtent_m: H, pilotExtent: { minX, minY, maxX, maxY } },
        blockLayer: 'idecordoba:manzana',
        blockFeaturesInWindow: manzFeatures.length,
        controlAvailable: viales.ok,
        candidates,
    };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// PROBE C — the coverage census (area-weighted, L-656 denominator)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** `.../O_MC3.pdf` → `MC-3`. Mirrors `subzoneCodeFromLink` in the shipped resolver. */
function subzoneFromLink(link) {
    if (typeof link !== 'string' || link.length === 0) return null;
    const base = link.split('/').pop()?.replace(/\.pdf$/i, '') ?? '';
    const m = /^O_([A-Z]+)(\d+)$/i.exec(base);
    if (m) return `${m[1].toUpperCase()}-${m[2]}`;
    const m2 = /^O_([A-Z]+)$/i.exec(base);
    return m2 ? m2[1].toUpperCase() : null;
}

/**
 * ⭐ READ THE SHIPPED PACK, DO NOT MIRROR IT.
 *
 * The first cut of this probe carried a hand-written `SUBZONE_NEED` table. That makes a
 * before/after coverage delta CIRCULAR — the table is edited by the same hand that edits the pack,
 * so it would "move" whether or not the shipped rule changed. This parses
 * `esCordobaPGOU2001.ts` itself, so the census reports what the pack ACTUALLY carries.
 *
 * Per subzone it returns:
 *   'bounded'         — carries a `geometricRule` that BOUNDS the footprint (`alignment`,
 *                       `block-derived-alignment`) AND a resolvable height.
 *   'needs-depth'     — a real setback zone with NO footprint-bounding rule: the inset alone
 *                       governs, so a deep parcel is over-stated (L-616 mechanism A).
 *   'needs-alignment' — height is null because it is a per-street-width TABLE, and the width needs
 *                       an ALIGNMENT that is not published (blocker 8 / §COR-ALIGNMENT). These
 *                       carry an `explicit-area` rule with an UNRESOLVABLE handle = a structural
 *                       refusal, which is the correct answer, not a bug.
 *   'unpacked'        — the subzone is not in the pack at all.
 */
function readPackNeeds() {
    const src = readFileSync(
        join(HERE, '..', '..', 'packages', 'site-parcel-data', 'src', 'rulepacks', 'esCordobaPGOU2001.ts'),
        'utf8',
    );
    // Split the zone array on each `code: 'X',` marker; each slice is one zone's literal.
    const parts = src.split(/\n\s*\{\s*\n\s*code:\s*'/).slice(1);
    const needs = {};
    for (const part of parts) {
        const code = part.slice(0, part.indexOf("'"));
        if (!code || /[^A-Z0-9-]/.test(code)) continue;
        // Trim to this zone's literal: stop at the next `ordinanceRef` close, which every zone has.
        const body = part.slice(0, part.indexOf('ordinanceRef') >= 0 ? part.indexOf('ordinanceRef') : part.length);
        const ruleKind = /geometricRule:\s*\{[^}]*kind:\s*'([a-z-]+)'/.exec(body)?.[1]
            ?? (/geometricRule:\s*\{\s*kind:\s*'([a-z-]+)'/.exec(body)?.[1] ?? null);
        const heightNull = /maxHeight_m:\s*null/.test(body);
        // ⚠⚠ THIS BUCKET REPORTS WHAT THE PACK CARRIES — IT DOES NOT ADJUDICATE THE ORDINANCE.
        // Two earlier cuts of this parser over-claimed and both were caught by reading the pack:
        //   1. it labelled every rule-less zone `needs-depth`, which accused PAS/OA of the L-616
        //      defect;
        //   2. the repair then demanded front > 0 AND rear > 0, which still accused OA-1 — whose
        //      `front: null, side: 10.5, rear: 10.5` inset bounds it to ~265 m² of a 1200 m² plot.
        // Whether a SETBACK-bound zone additionally has a stated *profundidad edificable* is a
        // question about that zone's article, answerable only by reading it (that is how D1 was
        // found for UAD, at 380 dpi). So the honest label is `setback-bound`: bounded by its
        // inset, carrying no depth rule — NOT an assertion that one is missing.
        needs[code] =
            ruleKind === 'alignment' || ruleKind === 'block-derived-alignment'
                ? 'alignment-depth-bound'
                : heightNull || ruleKind === 'explicit-area'
                    ? 'needs-alignment'
                    : 'setback-bound';
    }
    return needs;
}

async function probeC() {
    const ord = await wfsJson(COACO_WFS, 'coaco:ordenanzas', '&count=453');
    if (!ord.ok) return { ok: false, error: ord.error };
    const feats = ord.json.features ?? [];
    const packNeeds = readPackNeeds();

    const byNeed = {};
    let totalArea = 0, attempted = 0;
    const bySubzone = {};

    for (const f of feats) {
        attempted++;
        const p = f.properties ?? {};
        const area = Number(p.sup_m2) || 0;
        totalArea += area;
        const sz = subzoneFromLink(p.link);
        const need = sz === null ? 'unresolvable-subzone' : (packNeeds[sz] ?? 'unpacked');
        byNeed[need] ??= { rows: 0, area_m2: 0 };
        byNeed[need].rows++;
        byNeed[need].area_m2 += area;
        const key = sz ?? '(no link)';
        bySubzone[key] ??= { rows: 0, area_m2: 0, need };
        bySubzone[key].rows++;
        bySubzone[key].area_m2 += area;
    }

    const pct = (v) => (totalArea > 0 ? +((v / totalArea) * 100).toFixed(3) : null);
    for (const k of Object.keys(byNeed)) {
        byNeed[k].area_m2 = +byNeed[k].area_m2.toFixed(2);
        byNeed[k].areaPct = pct(byNeed[k].area_m2);
        byNeed[k].rowsPct = +((byNeed[k].rows / attempted) * 100).toFixed(3);
    }
    for (const k of Object.keys(bySubzone)) {
        bySubzone[k].area_m2 = +bySubzone[k].area_m2.toFixed(2);
        bySubzone[k].areaPct = pct(bySubzone[k].area_m2);
    }

    return {
        ok: true,
        denominator: 'the 453 published `coaco:ordenanzas` polygons — the ONLY Córdoba land with a machine-readable calificación',
        attemptedRows: attempted,
        totalArea_m2: +totalArea.toFixed(2),
        byNeed,
        bySubzone,
    };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    console.log('§CORDOBA-ALIGNMENT-PROBE — measuring, not assuming.\n');

    console.log('PROBE A — alignment-layer sweep across both publishers…');
    const A = await probeA();
    for (const p of A) {
        if (!p.reachable) { console.log(`  ${p.publisher}: ⚠ UNREACHABLE (${p.error}) — this is a FAILURE, not "no alignment layer".`); continue; }
        const found = Object.entries(p.hits).filter(([, v]) => v.length > 0);
        console.log(`  ${p.publisher}: ${p.layerCount} layers, CRS ${p.advertisedCRS.join('/')}`);
        console.log(`    alignment lexemes matched: ${found.length === 0 ? 'ZERO' : found.map(([k, v]) => `${k}(${v.length})`).join(', ')}`);
        if (p.ejeLayers.length) console.log(`    ⚠ "eje"/axis layers present (the CENTRELINE trap): ${p.ejeLayers.join(', ')}`);
    }

    console.log('\nPROBE B — alignment vs centreline, by perpendicular distance…');
    const B = await probeB();
    if (!B.ok) console.log(`  ⚠ FAILED at ${B.stage}: ${B.error}`);
    else {
        console.log(`  study window ${B.studyArea.halfExtent_m * 2} m box · ${B.blockFeaturesInWindow} blocks (${B.blockLayer})`);
        if (!B.controlAvailable) console.log('  ⚠ CONTROL LAYER UNAVAILABLE — the subject verdict is uncalibrated.');
        for (const c of B.candidates) {
            console.log(`\n  ── ${c.label}`);
            console.log(`     n = ${c.sampleSizeStreet} street cross-sections (${c.excludedAsNonStreet} excluded: span > ${c.plausibleSpanCap_m} m)`);
            console.log(`     distance to NEAREST frontage (m): ${JSON.stringify(c.distanceToNearestFrontage_m)}`);
            console.log(`     frontage-to-frontage span    (m): ${JSON.stringify(c.frontageToFrontageSpan_m)}`);
            console.log(`     centredness min/(L+R):            ${JSON.stringify(c.centredness)}`);
            console.log(`     on-frontage (≤1 m): ${(c.onFrontageFraction * 100).toFixed(1)} %   near-half (≥0.35): ${(c.nearHalfFraction * 100).toFixed(1)} %`);
            console.log(`     ⭐ VERDICT: ${c.verdict}`);
        }
    }

    console.log('\nPROBE C — coverage census over the published calificación…');
    const C = await probeC();
    if (!C.ok) console.log(`  ⚠ FAILED: ${C.error}`);
    else {
        console.log(`  attempted ${C.attemptedRows} rows / ${(C.totalArea_m2 / 1e6).toFixed(3)} km²`);
        for (const [k, v] of Object.entries(C.byNeed).sort((a, b) => b[1].area_m2 - a[1].area_m2)) {
            console.log(`    ${k.padEnd(22)} ${String(v.rows).padStart(4)} rows  ${String(v.areaPct).padStart(7)} % of area`);
        }
    }

    const payload = { probe: '§CORDOBA-ALIGNMENT-PROBE', stamp: new Date().toISOString(), crs: EPSG, A, B, C };
    writeFileSync(join(OUT_DIR, 'probe.json'), JSON.stringify(payload, null, 2));
    console.log(`\nwrote ${join(OUT_DIR, 'probe.json')}`);
}

main().catch((e) => { console.error('probe failed:', e); process.exitCode = 1; });
