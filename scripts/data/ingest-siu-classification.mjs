#!/usr/bin/env node
/**
 * §L-441 Tier B — ingest Spain's NATIONAL clasificación-del-suelo corpus from SIU.
 *
 * SOURCE (verified live 2026-07-20, see docs/04-reference/spain/SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md §8):
 *   https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15
 *   "OGC_Clases_Suelo" — Ministerio de Vivienda y Agenda Urbana.
 *
 * WHY A MIRROR AND NOT A LIVE PROXY (founder decision 2026-07-20): querying SIU per
 * user-request is slow, fragile, and puts a government service on our critical path. We mirror
 * into Supabase/PostGIS and refresh on a schedule (SIU changes ~semi-annually).
 *
 * ─── THREE THINGS THIS SCRIPT DOES DELIBERATELY ────────────────────────────────────────────
 *
 * 1. USES THE ArcGIS REST VIEW, NOT WFS. The WFS projection of this layer omits `ClaseSuelo`
 *    entirely — it returns only OBJECTID/Shape/AreaLambert. Judging the service by its WFS
 *    would record a national source as empty. This cost us a near-miss; it is why the URL
 *    below is `/rest/services/...` and must stay that way.
 *
 * 2. SENDS A BROWSER User-Agent. The ministry's own portal returns HTTP 403 to a default
 *    client UA and 200 to a browser one. Several "endpoint is down" findings in the research
 *    record were this, not the server.
 *
 * 3. PAGINATES BY PROVINCE, THEN BY resultOffset. ArcGIS caps a response at
 *    `maxRecordCount` (2000 here) and does NOT tell you the result was truncated — a naive
 *    single request silently returns a partial corpus that looks complete. Province chunking
 *    keeps each page small and makes progress resumable.
 *
 * USAGE
 *   node scripts/data/ingest-siu-classification.mjs --out ./siu --provinces 08,28
 *   node scripts/data/ingest-siu-classification.mjs --out ./siu            # all 52
 *   node scripts/data/ingest-siu-classification.mjs --out ./siu --stats    # counts only, no geometry
 */

import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const LAYER =
    'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15';

/** Browser UA — see note 2 above. Not cosmetic. */
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** All 52 Spanish province codes (INE), incl. Ceuta (51) and Melilla (52). */
export const PROVINCES = Array.from({ length: 52 }, (_, i) => String(i + 1).padStart(2, '0'));

/**
 * The `ClaseSuelo` values SIU actually publishes, observed live. Kept here as the canonical
 * enumeration so an UNEXPECTED value is a loud failure rather than a silent pass-through —
 * a new class appearing after a refresh is exactly the kind of change that must not slip in
 * unnoticed and be mapped to "unknown" downstream.
 */
export const KNOWN_CLASES = Object.freeze([
    'SUELO URBANO',
    'SUELO URBANO NO CONSOLIDADO',
    'SUELO URBANIZABLE DELIMITADO O SECTORIZADO',
    'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO',
    'SUELO NO URBANIZABLE',
    'SISTEMAS GENERALES Y OTROS',
]);

/**
 * Normalise SIU's verbose Spanish class into a stable machine key.
 * PURE — exported for tests.
 *
 * `null` for an unrecognised value, never a guess: the caller must treat that as a hard
 * failure. Mapping an unknown class to a plausible neighbour would silently misclassify land.
 */
export function normaliseClase(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.trim().toUpperCase();
    switch (s) {
        case 'SUELO URBANO': return 'urbano';
        case 'SUELO URBANO NO CONSOLIDADO': return 'urbano_no_consolidado';
        case 'SUELO URBANIZABLE DELIMITADO O SECTORIZADO': return 'urbanizable_delimitado';
        case 'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO': return 'urbanizable_no_delimitado';
        case 'SUELO NO URBANIZABLE': return 'no_urbanizable';
        case 'SISTEMAS GENERALES Y OTROS': return 'sistemas_generales';
        default: return null;
    }
}

/**
 * Is this row currently in force? SIU encodes supersession in `FechaBaja`, where `99999999`
 * means "no baja date" i.e. still live. Anything else is a superseded record that must NOT be
 * mirrored as current.
 */
export function isInForce(fechaBaja) {
    const s = String(fechaBaja ?? '').trim();
    return s === '' || s === '99999999';
}

/** SIU's `ProvINE` is MISNAMED: it holds the 5-digit MUNICIPALITY INE code. */
export function municipioFromProvINE(v) {
    const s = String(v ?? '').trim();
    return /^\d{5}$/.test(s) ? s : null;
}

async function getJson(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 120)}`);
    const j = await res.json();
    if (j.error) throw new Error(`ArcGIS error: ${JSON.stringify(j.error).slice(0, 200)}`);
    return j;
}

async function countForProvince(prov) {
    const u = `${LAYER}/query?where=${encodeURIComponent(`ProvINE LIKE '${prov}%'`)}`
        + `&returnCountOnly=true&f=json`;
    return (await getJson(u)).count ?? 0;
}

/**
 * Fetch one province, paginating explicitly. Returns normalised rows.
 * `withGeometry: false` gives a fast attribute-only pass for stats/validation.
 */
export async function fetchProvince(prov, { withGeometry = true, pageSize = 500 } = {}) {
    const rows = [];
    let offset = 0;
    // ADAPTIVE PAGE SIZE. SIU geometries are enormous — Las Palmas returns 455 000 vertices
    // across 194 rows — and the server answers an over-large page with a bare
    // `{"code":500,"Error performing query operation"}` rather than a size hint. So we start
    // optimistic and HALVE on failure. Without this the ingest dies on the first dense
    // province, and a fixed small page would make the sparse 45 provinces needlessly slow.
    let page = withGeometry ? Math.min(pageSize, 100) : pageSize;
    for (;;) {
        const u = `${LAYER}/query?where=${encodeURIComponent(`ProvINE LIKE '${prov}%'`)}`
            + `&outFields=${encodeURIComponent('ProvINE,ClaseSuelo,NuclRural,FechaBaja')}`
            + `&returnGeometry=${withGeometry}`
            + (withGeometry ? '&outSR=4326' : '')
            + `&resultOffset=${offset}&resultRecordCount=${page}&f=json`;
        let j;
        try {
            j = await getJson(u);
        } catch (err) {
            // A 500 here is almost always payload size, not a broken query — the same offset
            // succeeds with a smaller page. Halve down to 1 before giving up, so a single
            // pathological multipolygon is isolated rather than killing the province.
            if (page > 1 && /\b500\b|Error performing query/i.test(String(err.message))) {
                page = Math.max(1, Math.floor(page / 2));
                console.log(`   prov ${prov}: server rejected the page, retrying at pageSize=${page}`);
                continue;
            }
            throw err;
        }
        const feats = j.features ?? [];
        const pageSizeUsed = page;
        for (const f of feats) {
            const a = f.attributes ?? {};
            const municipio = municipioFromProvINE(a.ProvINE);
            const clase = normaliseClase(a.ClaseSuelo);
            // Loud on the unexpected — see KNOWN_CLASES.
            if (a.ClaseSuelo != null && clase === null) {
                throw new Error(
                    `UNKNOWN ClaseSuelo "${a.ClaseSuelo}" (municipio ${a.ProvINE}). `
                    + `SIU has published a class this ingest does not know. Update KNOWN_CLASES `
                    + `and normaliseClase deliberately — do NOT map it to an existing class.`,
                );
            }
            rows.push({
                municipio,
                clase,
                claseRaw: a.ClaseSuelo ?? null,
                nucleoRural: String(a.NuclRural ?? '') === '1',
                inForce: isInForce(a.FechaBaja),
                fechaBaja: a.FechaBaja ?? null,
                rings: withGeometry ? (f.geometry?.rings ?? null) : undefined,
            });
        }
        // ArcGIS sets exceededTransferLimit when more remain; also stop on a short page.
        // Compare against the page size ACTUALLY used, not the requested one — after a
        // backoff those differ, and comparing to the original would end the loop early and
        // silently truncate the province.
        if (!j.exceededTransferLimit && feats.length < pageSizeUsed) break;
        offset += feats.length;
        if (feats.length === 0) break;   // defensive: never spin
    }
    return rows;
}

function arg(name, dflt = null) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
        ? process.argv[i + 1] : (process.argv.includes(`--${name}`) ? true : dflt);
}

async function main() {
    const outDir = String(arg('out', './siu-out'));
    const only = arg('provinces');
    const statsOnly = arg('stats') === true;
    const provinces = typeof only === 'string' ? only.split(',').map((s) => s.trim()) : PROVINCES;

    await mkdir(outDir, { recursive: true });
    const summary = [];
    let totalRows = 0, totalVerts = 0, superseded = 0;

    for (const prov of provinces) {
        const outFile = join(outDir, `siu-${prov}.json`);
        // Resumable: skip a province already written (province chunking is the resume unit).
        if (!statsOnly) {
            try { await access(outFile);
                  const prev = JSON.parse(await readFile(outFile, 'utf8'));
                  console.log(`prov ${prov}: already present (${prev.rows?.length ?? 0} rows) — skipping`);
                  summary.push({ prov, rows: prev.rows?.length ?? 0, skipped: true });
                  continue;
            } catch { /* not present — fetch it */ }
        }

        const expected = await countForProvince(prov);
        if (expected === 0) { console.log(`prov ${prov}: 0 rows`); summary.push({ prov, rows: 0 }); continue; }

        const rows = await fetchProvince(prov, { withGeometry: !statsOnly });

        // INTEGRITY GATE — the whole point of chunked pagination. If we did not retrieve what
        // the server said exists, FAIL rather than write a silently-partial corpus.
        if (rows.length !== expected) {
            throw new Error(
                `prov ${prov}: expected ${expected} rows, retrieved ${rows.length}. `
                + `Refusing to write a partial corpus.`,
            );
        }

        const verts = rows.reduce((a, r) => a + (r.rings?.reduce((b, g) => b + g.length, 0) ?? 0), 0);
        const sup = rows.filter((r) => !r.inForce).length;
        totalRows += rows.length; totalVerts += verts; superseded += sup;

        if (!statsOnly) {
            await writeFile(outFile, JSON.stringify({ province: prov, fetchedAt: null, rows }), 'utf8');
        }
        console.log(`prov ${prov}: ${rows.length} rows, ${verts} vertices, ${sup} superseded`);
        summary.push({ prov, rows: rows.length, vertices: verts, superseded: sup });
    }

    console.log('\n──────── SUMMARY ────────');
    console.log(`provinces: ${summary.length}  rows: ${totalRows}  vertices: ${totalVerts}  superseded: ${superseded}`);
    if (!statsOnly) console.log(`written to: ${outDir}`);
}

// Only run when invoked directly (importable for tests).
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
    || process.argv[1]?.endsWith('ingest-siu-classification.mjs')) {
    main().catch((e) => { console.error('INGEST FAILED:', e.message); process.exit(1); });
}
