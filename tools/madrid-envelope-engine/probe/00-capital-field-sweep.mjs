// 00-capital-field-sweep — DOES THE MUNICIPAL PGOUM SERVICE CARRY THE PARAMETERS THE REGIONAL
// LAYER LACKS FOR THE CAPITAL?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION THIS EXISTS TO ANSWER, AND WHY IT MUST BE ASKED AGAIN
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The regional service `idem.comunidad.madrid` publishes `NM_ALTURA` / `NM_N_PLTA` / `NM_OCP_MX` /
// `NM_FDO_MX_ED` / `NM_RTR_*` per ordinance polygon. Measured over the full census
// (`tools/madrid-spacm-probe/out/05-coverage-by-municipality.csv`, 179 rows):
//
//     MADRID capital (cd=079, n=22181) — ALTURA 8.86 %
//     MEDIAN MUNICIPALITY             — ALTURA 79.42 %
//
// A NINE-FOLD gap. Two readings, and they lead to opposite programmes:
//   (a) the capital's parameters are absent from the REGIONAL layer because they live in the
//       city's OWN service (`sigma.madrid.es`), which the regional census never touched; or
//   (b) they are genuinely absent everywhere and the capital is simply thin.
//
// ⛔ (b) MAY NOT BE CONCLUDED WITHOUT TESTING (a). Madrid's regional endpoint was itself only
// found by reading a viewer's `Config.js` after nine hosts returned 404/DNS — a dead host list is
// not an answer, and a thin regional layer is not evidence that a municipal one is thin.
//
// ⚠ A PRIOR PASS ALREADY CLAIMS AN ANSWER, AND THIS PROBE DELIBERATELY DOES NOT TRUST IT.
// `findings/MADRID-DATA-RECON-SPIKE.md` §5 records *"coded-value domains / ALTURA·FONDO·RETRANQUEO
// attributes — ABSENT — full field inventory across 6 services"*. That was **6 of 40 folders**,
// chosen because they were the ones already known. This sweep is the SUPERSET: every folder, every
// service, every layer, every field — so the negative, if it holds, is a census rather than a
// sample of the places we happened to look. (§probe-can-be-wrong-three-ways: wrong RUNTIME /
// PROPERTY / SYSTEM. The prior pass could have had the wrong SYSTEM.)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// METHOD
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. `GET /hosted/rest/services?f=json` → folder list (asserted `application/json`, not the viewer
//    HTML that a naïve `/arcgis/` path returns with HTTP 200 — the L-438 discipline).
// 2. For each folder, list services; for each MapServer/FeatureServer, `?f=json` for its layers;
//    for each layer, `/{id}?f=json` for its `fields[]`.
// 3. Score every field name + alias against the PARAMETRIC LEXEME SET. ⭐ The lexeme set is
//    DELIBERATELY WIDER than `fondo`: Málaga defines *profundidad edificable*, not *fondo*, and
//    every prior Spanish depth probe searched `fondo` alone. A field missed by vocabulary reads
//    identically to a field that does not exist.
// 4. Emit `out/00-capital-field-sweep.json` — every hit with its service, layer, field, type and
//    alias, plus the exhaustive denominator (folders/services/layers/fields visited) so the
//    negative is auditable.
//
// ⚠ TRANSPORT FAILURES ARE RECORDED SEPARATELY AND NEVER SCORED AS ABSENCE (§CONTEXT-DATA-HONESTY,
// L-422/457/467/469). A folder that 500s is UNKNOWN, not empty.
//
// Deterministic: no sampling, no randomness. Re-running reproduces the figures unless the
// publisher changes the data.
//
//   node tools/madrid-envelope-engine/probe/00-capital-field-sweep.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'out');
const ROOT = 'https://sigma.madrid.es/hosted/rest/services';

/**
 * ⭐ THE PARAMETRIC LEXEME SET — the words a Spanish planning parameter is actually spelled with.
 *
 * Split by DIMENSION so a hit is attributed, not just counted. `profundidad` sits beside `fondo`
 * deliberately (see header §3); `retiro` beside `retranqueo`; `edificabilidad` beside `aprovechamiento`.
 */
const LEXEMES = {
    height: ['altura', 'alt_', 'hmax', 'h_max', 'cornisa', 'rasante'],
    storeys: ['planta', 'plta', 'nplant', 'num_plt', 'niveles'],
    depth: ['fondo', 'fdo', 'profundidad', 'prof_', 'profund'],
    setback: ['retranqueo', 'retiro', 'rtr', 'separacion', 'separación', 'linderos'],
    occupation: ['ocupacion', 'ocupación', 'ocup', 'ocp'],
    buildability: ['edificabilidad', 'edificab', 'aprovechamiento', 'aprov', 'coef_ed', 'c_ed', 's_max_ed'],
    frontage: ['frente', 'frte', 'parcela_min', 'parcelamin'],
};

const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function classify(fieldName, alias) {
    const hay = `${norm(fieldName)} ${norm(alias)}`;
    const hits = [];
    for (const [dim, words] of Object.entries(LEXEMES)) {
        if (words.some((w) => hay.includes(norm(w)))) hits.push(dim);
    }
    return hits;
}

const failures = [];

async function getJson(url) {
    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const ct = res.headers.get('content-type') ?? '';
        if (!res.ok) {
            failures.push({ url, kind: 'http', status: res.status });
            return null;
        }
        // ⚠ HTTP 200 + text/html is the viewer, NOT the API. Asserting on Content-Type is the
        // whole reason the `/arcgis/` path was misread as reachable for two prior passes.
        if (!ct.includes('json')) {
            failures.push({ url, kind: 'content-type', contentType: ct });
            return null;
        }
        const body = await res.json();
        if (body && body.error) {
            failures.push({ url, kind: 'arcgis-error', code: body.error.code, message: body.error.message });
            return null;
        }
        return body;
    } catch (e) {
        failures.push({ url, kind: 'transport', message: String(e?.message ?? e) });
        return null;
    }
}

async function main() {
    const root = await getJson(`${ROOT}?f=json`);
    if (!root) {
        console.error('⛔ services root unreachable — this is UNKNOWN, not an answer. Aborting.');
        process.exit(1);
    }

    const folders = ['', ...(root.folders ?? [])];
    const hits = [];
    let servicesVisited = 0;
    let layersVisited = 0;
    let fieldsVisited = 0;
    const serviceIndex = [];

    for (const folder of folders) {
        const folderUrl = folder ? `${ROOT}/${folder}` : ROOT;
        const listing = await getJson(`${folderUrl}?f=json`);
        if (!listing) continue;

        for (const svc of listing.services ?? []) {
            if (svc.type !== 'MapServer' && svc.type !== 'FeatureServer') continue;
            // svc.name already carries the folder prefix when inside one.
            const svcUrl = `${ROOT}/${svc.name}/${svc.type}`;
            const meta = await getJson(`${svcUrl}?f=json`);
            servicesVisited += 1;
            if (!meta) continue;
            serviceIndex.push({
                service: svc.name,
                type: svc.type,
                layers: (meta.layers ?? []).length,
                description: (meta.serviceDescription ?? '').slice(0, 160),
            });

            for (const lyr of meta.layers ?? []) {
                const lmeta = await getJson(`${svcUrl}/${lyr.id}?f=json`);
                layersVisited += 1;
                if (!lmeta) continue;
                for (const f of lmeta.fields ?? []) {
                    fieldsVisited += 1;
                    const dims = classify(f.name, f.alias);
                    if (dims.length === 0) continue;
                    hits.push({
                        service: svc.name,
                        type: svc.type,
                        layerId: lyr.id,
                        layerName: lmeta.name,
                        geometryType: lmeta.geometryType ?? null,
                        field: f.name,
                        alias: f.alias ?? null,
                        fieldType: f.type,
                        dimensions: dims,
                        hasDomain: Boolean(f.domain),
                    });
                }
            }
        }
    }

    const byDimension = {};
    for (const dim of Object.keys(LEXEMES)) {
        byDimension[dim] = hits.filter((h) => h.dimensions.includes(dim)).length;
    }

    const report = {
        probe: 'madrid-capital-field-sweep',
        ranAt: new Date().toISOString().slice(0, 10),
        root: ROOT,
        // ⚠ THE DENOMINATOR. A negative without one is not a measurement.
        denominator: {
            foldersListed: folders.length,
            servicesVisited,
            layersVisited,
            fieldsVisited,
        },
        // ⚠ NEVER folded into the denominator — an unreachable folder is UNKNOWN, not empty.
        transportFailures: failures.length,
        failures: failures.slice(0, 200),
        lexemes: LEXEMES,
        hitCount: hits.length,
        byDimension,
        hits,
        serviceIndex,
    };

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, '00-capital-field-sweep.json'), JSON.stringify(report, null, 2));

    console.log(`folders ${folders.length} · services ${servicesVisited} · layers ${layersVisited} · fields ${fieldsVisited}`);
    console.log(`transport/arcgis failures (UNKNOWN, not empty): ${failures.length}`);
    console.log(`parametric-lexeme field hits: ${hits.length}`);
    console.log(JSON.stringify(byDimension, null, 2));
    for (const h of hits) {
        console.log(`  ${h.service}/${h.type}/${h.layerId} «${h.layerName}» ${h.field} (${h.alias}) [${h.dimensions.join(',')}]`);
    }
}

main();
