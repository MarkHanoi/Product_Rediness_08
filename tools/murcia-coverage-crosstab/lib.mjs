// §MURCIA-CROSSTAB — shared helpers for the calificación × clase-de-suelo cross-tab.
//
// WHY THIS TOOL EXISTS
// --------------------
// `docs/04-reference/jurisdictions/es/es-mc/30030-murcia/RATE.md` §CLOSURE carried a BOUND, not a
// number: "solver coverage after sign-off would be ≤ 33.0 % of buildable land". Two shares had been
// measured on two DIFFERENT tests and never intersected:
//
//   • 33.0 %  — PGOU-DIRECT land, by the clase-de-suelo / ámbito delegation test
//   • 38.7 %  — the 14 packed calificaciones, by calificación CODE
//
// `murciaEnvelopeDisposition` applies the delegation test FIRST (Arts. 5.25.3.3 / 5.26.3.3: inside a
// delegating ámbito a zonal code's scope «se reduce a las condiciones de uso y tipología … pero no a
// los parámetros definitorios de la altura o edificabilidad»), so the answerable land is the
// INTERSECTION of the two sets, not either one. Nobody had computed it. This tool does.
//
// ⚠ A SECTORES-LAYER CENSUS IS STRUCTURALLY BLIND TO 41.4 pp OF MURCIA'S DELEGATION, because that
// delegation is published on the `calificacion` attribute, not on the sector code
// (`findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md` §3c). Both attributes are cross-tabbed here.
// Measuring only sectores reproduces the error that forced the retraction of a ~75 % ceiling.
//
// DISCIPLINE (§CONTEXT-DATA-HONESTY, L-422/457/467/469)
// ----------------------------------------------------
// A fetch FAILURE, a genuine EMPTY and a resolved-but-unjoined value are three different values and
// are never collapsed. Unjoined polygons are reported as their own bucket with their own area — they
// are never silently folded into "delegated" or into "direct".
//
// Every page is cached to `./.cache` (gitignored) so a re-run never re-hits the municipal service.
// Pass `--refresh` to force a re-fetch.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE = join(HERE, '.cache');

/** The municipal GeoServer WFS (keyless, public). ⚠ https — the http host 301-redirects. */
export const WFS = 'https://geoserver.murcia.es/geoserver/wfs';

/** ⚠ MISLEADINGLY NAMED: a MultiSurface POLYGON layer carrying the CALIFICACIÓN. */
export const LAYER_CALIFICACION = 'Murcia:pgou_alineaciones';
/** The ámbito/sector layer, carrying `clase_suelo` + `categoria`. */
export const LAYER_SECTOR = 'Murcia:pgou_sectores';

/** Native CRS of both layers. Areas are computed here, in metres — never in degrees. */
export const NATIVE_CRS = 'EPSG:25830';

export const PAGE = 1000;
export const TIMEOUT_MS = 120_000;

// ─────────────────────────────────────────────────────────────────────────────
// fetch + cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One paged `GetFeature` URL. `sortBy` is MANDATORY: GeoServer paging without a stable sort may
 * repeat or drop features between pages, which would silently corrupt an area total.
 */
export function pageUrl(typeName, startIndex, propertyName, count = PAGE) {
    const qs = new URLSearchParams({
        service: 'WFS',
        version: '2.0.0',
        request: 'GetFeature',
        typeNames: typeName,
        outputFormat: 'application/json',
        srsName: NATIVE_CRS,
        sortBy: 'id',
        count: String(count),
        startIndex: String(startIndex),
        propertyName,
    });
    return `${WFS}?${qs.toString()}`;
}

/** `resultType=hits` → the authoritative feature count, or `null` if the service did not answer. */
export async function fetchCount(typeName) {
    const url = `${WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(typeName)}&resultType=hits`;
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return null;
        const xml = await res.text();
        const m = xml.match(/numberMatched="(\d+)"/);
        return m ? Number(m[1]) : null;
    } catch {
        return null;
    }
}

/**
 * Download every feature of a layer, paged and disk-cached.
 *
 * ⚠ Returns `null` on ANY page failure and NEVER a short array. A truncated download and a genuinely
 * small layer are different values; collapsing them would understate an area denominator and inflate
 * every share computed from it.
 */
export async function fetchAll(typeName, propertyName, { refresh = false, log = () => {} } = {}) {
    mkdirSync(CACHE, { recursive: true });
    const total = await fetchCount(typeName);
    if (total == null) {
        log(`  ✖ ${typeName}: resultType=hits did not answer — FETCH FAILURE, not an empty layer.`);
        return null;
    }
    log(`  ${typeName}: numberMatched=${total}`);
    const slug = typeName.replace(/[^A-Za-z0-9]+/g, '_');
    const out = [];
    for (let start = 0; start < total; start += PAGE) {
        const file = join(CACHE, `${slug}_${String(start).padStart(6, '0')}.json`);
        let json;
        if (!refresh && existsSync(file)) {
            json = JSON.parse(readFileSync(file, 'utf8'));
        } else {
            const url = pageUrl(typeName, start, propertyName);
            let text;
            try {
                const res = await fetch(url, {
                    headers: { Accept: 'application/json', 'User-Agent': 'PRYZM-Murcia-Crosstab/1.0' },
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                });
                if (!res.ok) {
                    log(`  ✖ page ${start}: HTTP ${res.status} — FETCH FAILURE.`);
                    return null;
                }
                text = await res.text();
            } catch (err) {
                log(`  ✖ page ${start}: ${err?.message ?? err} — FETCH FAILURE.`);
                return null;
            }
            try {
                json = JSON.parse(text);
            } catch {
                // GeoServer answers an XML ExceptionReport on a bad request — a FAILURE, not empty.
                log(`  ✖ page ${start}: non-JSON body (OGC ExceptionReport?) — FETCH FAILURE.`);
                return null;
            }
            writeFileSync(file, JSON.stringify(json));
        }
        if (!Array.isArray(json?.features)) {
            log(`  ✖ page ${start}: no features array — FETCH FAILURE.`);
            return null;
        }
        out.push(...json.features);
        log(`    …${out.length}/${total}`);
    }
    if (out.length !== total) {
        log(`  ✖ ${typeName}: got ${out.length} of ${total} — TRUNCATED, refusing to report.`);
        return null;
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// geometry — planar area in the layer's native metric CRS
// ─────────────────────────────────────────────────────────────────────────────

/** Shoelace area of one linear ring, signed. Coordinates are EPSG:25830 metres. */
export function ringArea(ring) {
    let a = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % n];
        a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
}

/**
 * Net area (m²) of a GeoJSON Polygon / MultiPolygon in a metric CRS: outer ring MINUS its holes.
 *
 * ⚠ Holes are subtracted, not ignored. Murcia's calificación polygons are frequently annular around
 * an inner ámbito, and summing outer rings alone double-counts land that belongs to another code.
 */
export function geometryArea(geom) {
    if (!geom) return 0;
    const polys =
        geom.type === 'MultiPolygon' ? geom.coordinates
            : geom.type === 'Polygon' ? [geom.coordinates]
                : [];
    let total = 0;
    for (const poly of polys) {
        for (let i = 0; i < poly.length; i++) {
            const a = Math.abs(ringArea(poly[i]));
            total += i === 0 ? a : -a;
        }
    }
    return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// the legal classification — every rule below carries its article
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ámbito-code prefixes the DISPOSITION treats as remitted.
 *
 * ⚠ MIRRORS `REMITTED_AMBITO_PREFIXES` in `murciaZoningProvider.ts` EXACTLY, and a test pins that it
 * still does. This is the set the shipping code actually branches on — it is deliberately NARROWER
 * than the full legal delegation test below, and measuring the difference is half the point of this
 * tool.
 */
export const CODE_REMITTED_PREFIXES = ['TA', 'TM', 'UA', 'UH', 'UM'];

/**
 * Ámbito-code prefixes the PGOU delegates to a derived instrument, in FULL.
 *
 * `UE` Unidad de Actuación (Art. 5.25.1) · `UD` Estudio de Detalle (Art. 5.25.2) ·
 * `P…` Planes Especiales / Parciales (Arts. 5.26.2, 6.6) · plus the remitted set above.
 */
export const LEGAL_DELEGATING_PREFIXES = [...CODE_REMITTED_PREFIXES, 'UE', 'UD'];

/** `TA-379` → `{ prefix: 'TA', expediente: '379' }`. Mirrors `parseSectorCode`. */
export function parseSectorCode(sector) {
    if (!sector) return null;
    const m = String(sector).trim().toUpperCase().match(/^([A-Z]+)(?:-(\w+))?/);
    if (!m || !m[1]) return null;
    return { prefix: m[1], expediente: m[2] ?? null };
}

/** Is this an in-force record? `f_fin = 2999-12-30` is Murcia's "still in force" sentinel. */
export function inForce(f_inicial, f_fin, asOf) {
    const norm = (s) => {
        if (!s) return null;
        const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
    };
    const start = norm(f_inicial);
    const end = norm(f_fin);
    const now = norm(asOf);
    if (!now) return null;
    if (!start && !end) return null;
    if (start && now < start) return false;
    if (end && now >= end) return false;
    return true;
}

/** Fixed-width % helper. */
export function pct(n, d) {
    return d > 0 ? (100 * n) / d : 0;
}

export function writeJson(file, value) {
    writeFileSync(join(HERE, file), `${JSON.stringify(value, null, 2)}\n`);
}
