// L-539 PROBE, STAGE 1 — collect a large, reproducible sample of real *manzanas*.
//
// WHY A SEPARATE STAGE. The classification (stage 2) and the before/after acceptance run
// (stage 3) must see the BYTE-IDENTICAL input, otherwise "the ring changed" is unfalsifiable —
// it could be a different parcel set rather than a different algorithm. So the network is
// touched exactly once, here, and the result is frozen to JSON on disk.
//
// ⚠ IT REUSES THE PRODUCTION PARSERS. `parseParcelCollectionGml`, `buildParcelBboxUrl` and
// `manzanaPrefix` are imported from `server/parcelZoningProxy.js` — the same functions
// `/api/catastro/block` serves. So the probe cannot disagree with the code path it diagnoses
// (the precedent set by SPAIN-CADASTRAL-DISSOLVE-PROBE.md).
//
// ⚠ THE SAMPLING ARTEFACT THIS PROBE MUST NOT COMMIT. A WFS bbox returns every parcel that
// INTERSECTS it. A manzana straddling the bbox edge therefore arrives TRUNCATED — some of its
// parcels are outside and were never returned. Dissolving a truncated manzana fails (or worse,
// succeeds with a wrong ring), and counting that as a cadastral-geometry failure would inflate
// the failure rate with an artefact of our own sampling. Production never has this problem: it
// centres the bbox on the subject parcel, so the manzana is comfortably interior. So: a manzana
// is ADMITTED only if every one of its parcels lies strictly inside the bbox with a margin.
//
// Run:  npx tsx scratchpad/probe-dissolve-fetch.mts

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { buildParcelBboxUrl, parseParcelCollectionGml, manzanaPrefix } from '../server/parcelZoningProxy.js';

const HALF_DEG = 0.002; // production's BLOCK_BBOX_HALF_DEG (~±220 m)
/** Margin (degrees) a parcel must keep from the bbox edge for its manzana to be admitted. */
const EDGE_MARGIN_DEG = 0.00012; // ~13 m

interface City { name: string; lat: number; lon: number; nx: number; ny: number }

// Centres of dense, historically distinct urban fabric in each city. The grid step is 2×HALF_DEG
// so the boxes tile without overlapping (a manzana admitted twice would be double-counted).
const CITIES: City[] = [
    { name: 'Barcelona', lat: 41.3915, lon: 2.1620, nx: 5, ny: 5 },   // Eixample / Dreta
    { name: 'Barcelona-old', lat: 41.3810, lon: 2.1740, nx: 3, ny: 3 }, // Ciutat Vella / Gòtic
    { name: 'Madrid', lat: 40.4270, lon: -3.6870, nx: 5, ny: 5 },     // Salamanca / Chamberí
    { name: 'Madrid-centro', lat: 40.4150, lon: -3.7050, nx: 3, ny: 3 },
    { name: 'Cordoba', lat: 37.8880, lon: -4.7790, nx: 5, ny: 5 },    // centro + ensanche
    { name: 'Valencia', lat: 39.4700, lon: -0.3760, nx: 4, ny: 4 },
    { name: 'Sevilla', lat: 37.3890, lon: -5.9930, nx: 4, ny: 4 },
];

const CACHE_DIR = new URL('./dissolve-probe-cache/', import.meta.url);

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
        Array.from({ length: n }, async () => {
            for (;;) {
                const i = next++;
                if (i >= items.length) return;
                out[i] = await fn(items[i]!, i);
            }
        }),
    );
    return out;
}

async function fetchBbox(lat: number, lon: number): Promise<string | null> {
    const url = buildParcelBboxUrl(lat, lon, HALF_DEG);
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 60_000);
            const res = await fetch(url, { signal: ctrl.signal });
            clearTimeout(t);
            if (res.ok) {
                const text = await res.text();
                if (text && text.length > 200) return text;
            }
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    return null;
}

async function main() {
    mkdirSync(CACHE_DIR, { recursive: true });

    const boxes: Array<{ city: string; lat: number; lon: number }> = [];
    for (const c of CITIES) {
        for (let iy = 0; iy < c.ny; iy++) {
            for (let ix = 0; ix < c.nx; ix++) {
                boxes.push({
                    city: c.name,
                    lat: Number((c.lat + (iy - (c.ny - 1) / 2) * 2 * HALF_DEG).toFixed(6)),
                    lon: Number((c.lon + (ix - (c.nx - 1) / 2) * 2 * HALF_DEG).toFixed(6)),
                });
            }
        }
    }
    console.log(`[fetch] ${boxes.length} bbox fetches across ${CITIES.length} sample areas.`);

    let done = 0;
    const results = await pool(boxes, 3, async (b, i) => {
        const file = new URL(`./bbox-${i}.xml`, CACHE_DIR);
        let gml: string | null = null;
        if (existsSync(file)) gml = readFileSync(file, 'utf8');
        else {
            gml = await fetchBbox(b.lat, b.lon);
            if (gml) writeFileSync(file, gml);
        }
        done++;
        console.log(`[fetch] ${done}/${boxes.length} ${b.city} ${gml ? `${gml.length} B` : 'FAILED'}`);
        return { ...b, gml };
    });

    // ── Parse + admit complete manzanas. ────────────────────────────────────────────────
    const manzanas: Array<{
        city: string; manzana: string;
        parcels: Array<{ refcat: string; ring: Array<{ lat: number; lon: number }>; areaM2: number }>;
    }> = [];
    const seen = new Set<string>();
    let truncatedBoxes = 0;
    let droppedEdge = 0;
    let droppedSmall = 0;

    for (const r of results) {
        if (!r?.gml) continue;
        // Catastro caps a bbox response; if we hit the cap the sample is silently partial.
        const matched = r.gml.match(/numberMatched="(\d+)"/)?.[1];
        const returned = r.gml.match(/numberReturned="(\d+)"/)?.[1];
        if (matched && returned && matched !== returned) truncatedBoxes++;

        const all = parseParcelCollectionGml(r.gml);
        const groups = new Map<string, typeof all>();
        for (const p of all) {
            const m = manzanaPrefix(p.refcat);
            if (!m) continue;
            const g = groups.get(m) ?? [];
            g.push(p);
            groups.set(m, g);
        }
        const lo = { lat: r.lat - HALF_DEG + EDGE_MARGIN_DEG, lon: r.lon - HALF_DEG + EDGE_MARGIN_DEG };
        const hi = { lat: r.lat + HALF_DEG - EDGE_MARGIN_DEG, lon: r.lon + HALF_DEG - EDGE_MARGIN_DEG };
        for (const [m, g] of groups) {
            if (g.length < 3) { droppedSmall++; continue; }  // production's own `< 3` refusal
            const interior = g.every((p) =>
                p.ring.every((v) => v.lat > lo.lat && v.lat < hi.lat && v.lon > lo.lon && v.lon < hi.lon));
            if (!interior) { droppedEdge++; continue; }
            const key = `${m}@${g[0]!.refcat}`;
            if (seen.has(key)) continue;
            seen.add(key);
            manzanas.push({ city: r.city, manzana: m, parcels: g });
        }
    }

    manzanas.sort((a, b) => (a.city + a.manzana < b.city + b.manzana ? -1 : 1));
    const out = new URL('./dissolve-sample.json', import.meta.url);
    writeFileSync(out, JSON.stringify({ halfDeg: HALF_DEG, edgeMarginDeg: EDGE_MARGIN_DEG, manzanas }));
    console.log(
        `\n[fetch] admitted ${manzanas.length} complete manzanas ` +
        `(dropped: ${droppedEdge} straddling a bbox edge, ${droppedSmall} with < 3 parcels; ` +
        `${truncatedBoxes} bbox responses were capped by the server).`,
    );
    const byCity = new Map<string, number>();
    for (const m of manzanas) byCity.set(m.city, (byCity.get(m.city) ?? 0) + 1);
    for (const [c, n] of [...byCity].sort()) console.log(`  ${c.padEnd(16)} ${n}`);
}

main().catch((e) => { console.error('[fetch] FAILED', e); process.exit(1); });
