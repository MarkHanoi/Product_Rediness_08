#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE AMB ENUMERATION — the municipality universe, read FROM THE SERVICE, never from a document.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE RULE THIS FILE EXISTS TO ENFORCE: "26", "27", "36" and "25" appear in
//    docs/03-execution/plans/ENVELOPE-REACHABILITY-TRACKER.md and
//    docs/04-reference/standards/REGIONAL-INTAKE-LIST.md as TYPED figures. None of them is
//    computed anywhere. This module computes the universe from `qualificacio_refos_3857` layer 16
//    and every downstream count derives from it. If a document disagrees, THE DOCUMENT IS THE
//    FINDING.
//
// The municipality NAME comes from the service too (`NOMMUNI`), because the Catastro ATOM match is
// NAME-authoritative (the DGC/INE collision — DGC 08204 is Sant Cugat, INE 08204 is Sant Climent,
// and BOTH are inside this universe).
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

export const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
export const UA = 'PRYZM-cold-start-probe/1.0 (+pryzmhello@gmail.com)';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Every network read this module makes, recorded — an unreachable service is UNKNOWN, never empty. */
export const netLog = [];

export async function readJson(base, params, label) {
    const url = `${base}?${new URLSearchParams(params)}`;
    const t0 = Date.now();
    try {
        const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(300000) });
        const body = await r.text();
        netLog.push({ label, url: url.slice(0, 200), httpStatus: r.status, bytes: body.length, ms: Date.now() - t0, outcome: r.ok ? 'ok' : 'http-error' });
        if (!r.ok) return null;
        const j = JSON.parse(body);
        if (j.error) { netLog[netLog.length - 1].outcome = 'esri-error'; netLog[netLog.length - 1].esriError = j.error; return null; }
        return j;
    } catch (e) {
        netLog.push({ label, url: url.slice(0, 200), httpStatus: null, bytes: 0, ms: Date.now() - t0, outcome: 'network-error', error: String(e && e.message) });
        return null;
    }
}

/**
 * ⚠⚠ PAGINATED READ — copied verbatim in behaviour from task2-pgm-cold-pipeline.mjs, which added it
 * after the Barcelona control caught a silent truncation: `maxRecordCount` is 2000 and a layer-16
 * query for Barcelona returned EXACTLY 2000 polygons / 3 distinct claus (the real figure is 89)
 * behind a clean HTTP 200.
 *
 * ⇒ TRUNCATION SUSPECT RULE, enforced by the caller: any per-municipality count landing exactly on
 *   1000 / 2000 / 3000 is suspect until `exceededTransferLimit` is shown cleared. This function
 *   returns BOTH the page count and how termination was reached, so the caller can assert it.
 */
export async function readAllPaged(base, params, label, pageSize = 2000) {
    const feats = [];
    let offset = 0, page = 0;
    const flags = [];
    for (;;) {
        const j = await readJson(base, { ...params, resultOffset: String(offset), resultRecordCount: String(pageSize) }, `${label}#${page}`);
        if (!j) return { ok: false, features: feats, reason: 'page-unreadable', pages: page, exceededTransferLimitByPage: flags };
        const f = j.features ?? [];
        feats.push(...f);
        flags.push(j.exceededTransferLimit === true);
        page++;
        if (!j.exceededTransferLimit || f.length === 0) {
            return {
                ok: true, features: feats, pages: page, exceededTransferLimitByPage: flags,
                terminatedBy: j.exceededTransferLimit ? 'empty-page' : 'server-cleared-exceededTransferLimit',
            };
        }
        offset += f.length;
        if (page > 400) return { ok: false, features: feats, reason: 'pagination-runaway', pages: page, exceededTransferLimitByPage: flags };
    }
}

/**
 * THE UNIVERSE. Distinct `CODI_INE` on layer 16, with `NOMMUNI` and the `PGM` flag.
 * Returns `{ ok, municipalities:[{ine,name,pgm,nameVariants}], distinctCount }`.
 */
export async function enumerateAmb() {
    const j = await readJson(`${SVC}/16/query`, {
        f: 'json', where: '1=1', outFields: 'CODI_INE,NOMMUNI,PGM',
        returnDistinctValues: 'true', returnGeometry: 'false', orderByFields: 'CODI_INE',
    }, 'enumerate:layer16-distinct-INE');
    if (!j) return { ok: false, reason: 'layer-16 distinct read failed — UNKNOWN, not empty' };
    const rows = (j.features ?? []).map((f) => f.attributes);
    // ⚠ A distinct read that itself hit the transfer limit would silently shrink the universe.
    if (j.exceededTransferLimit === true) return { ok: false, reason: 'the DISTINCT read itself hit the transfer limit — the universe would be truncated' };
    const by = new Map();
    for (const r of rows) {
        const ine = String(r.CODI_INE ?? '').trim();
        if (!ine) continue;
        const e = by.get(ine) ?? { ine, names: new Set(), pgm: new Set() };
        if (String(r.NOMMUNI ?? '').trim()) e.names.add(String(r.NOMMUNI).trim());
        e.pgm.add(String(r.PGM ?? '').trim());
        by.set(ine, e);
    }
    const municipalities = [...by.values()].sort((a, b) => a.ine.localeCompare(b.ine)).map((e) => ({
        ine: e.ine,
        name: [...e.names][0] ?? null,
        nameVariants: [...e.names],
        pgm: [...e.pgm].sort(),
        pgmGoverned: e.pgm.has('S'),
    }));
    return {
        ok: true,
        source: `${SVC}/16 · returnDistinctValues on CODI_INE,NOMMUNI,PGM`,
        readAt: new Date().toISOString(),
        distinctCount: municipalities.length,
        pgmS: municipalities.filter((m) => m.pgmGoverned).length,
        pgmNotS: municipalities.filter((m) => !m.pgmGoverned).length,
        mixedPgm: municipalities.filter((m) => m.pgm.length > 1).length,
        municipalities,
    };
}

/**
 * ═══ SCHEMA INTEGRITY — RAW ROWS vs DISTINCT `CODI_INE` vs DISTINCT `NOMMUNI` ══════════════════
 *
 * ⛔ THE THREE NUMBERS ARE REPORTED SEPARATELY AND NEVER RECONCILED SILENTLY.
 *
 * MEASURED 2026-08-02, and it is the empty-parse class again (L-422/457/467/469):
 *   layer 16 — 48,782 rows · 36 distinct CODI_INE · 36 distinct NOMMUNI · 0 blank.  CLEAN.
 *   layer 17 — 22,525 rows · 36 distinct CODI_INE · **37** distinct NOMMUNI, the 37th being the
 *              EMPTY STRING (not NULL — a value that a null-check passes and a schema read counts
 *              as populated).
 *
 * ⚠⚠ AND IT IS NOT ONE STRAY ROW. **4,912 of Barcelona's 5,073 OV polygons (96.83 %) carry the
 *    blank name; only 161 say "Barcelona".** Every blank row in the whole service is Barcelona's.
 *    ⇒ A NAME-KEYED ENUMERATION WOULD HAVE REPORTED BARCELONA WITH **161** OV POLYGONS AND HANDED
 *      4,912 TO A PHANTOM MUNICIPALITY. Since OV is the HEIGHT route, that is not a cosmetic
 *      mislabelling — it would have silently destroyed the height measurement for the one city that
 *      is the known-answer control, and the run would have looked clean.
 *
 * ⭐ THIS RUN KEYS ON `CODI_INE` EVERYWHERE — layers 16 and 17 alike — AND IS THEREFORE IMMUNE.
 *   Stated explicitly because being right and being right by accident are different claims:
 *   `CODI_INE='08019'` returns 5,073 = 161 + 4,912. Nothing is lost and nothing is double-counted.
 *   The Barcelona control reproducing 5,073 exactly is the evidence.
 */
export async function schemaIntegrity() {
    const out = {};
    for (const layer of ['16', '17']) {
        const count = async (where) => (await readJson(`${SVC}/${layer}/query`, { f: 'json', where, returnCountOnly: 'true' }, `integrity:L${layer}:count`))?.count ?? null;
        const distinct = async (fields) => {
            const j = await readJson(`${SVC}/${layer}/query`, { f: 'json', where: '1=1', outFields: fields, returnDistinctValues: 'true', returnGeometry: 'false' }, `integrity:L${layer}:distinct:${fields}`);
            return j ? j.features.map((f) => f.attributes) : null;
        };
        const ines = await distinct('CODI_INE');
        const noms = await distinct('NOMMUNI');
        const pairs = await distinct('CODI_INE,NOMMUNI');
        out[`layer${layer}`] = {
            rawRows: await count('1=1'),
            distinctCodiIne: ines?.length ?? null,
            distinctNommuni: noms?.length ?? null,
            distinctPairs: pairs?.length ?? null,
            nommuniEmptyString: noms?.filter((r) => r.NOMMUNI === '').length ?? null,
            nommuniNull: noms?.filter((r) => r.NOMMUNI === null).length ?? null,
            rowsWithBlankNommuni: await count("NOMMUNI=''"),
            codiIneValues: ines?.map((r) => r.CODI_INE).sort() ?? null,
            agree: (ines?.length ?? -1) === (noms?.length ?? -2),
        };
    }
    const a = out.layer16, b = out.layer17;
    out.verdict = {
        codiIneSetsIdentical: JSON.stringify(a.codiIneValues) === JSON.stringify(b.codiIneValues),
        disagreement: a.distinctNommuni === a.distinctCodiIne && b.distinctNommuni !== b.distinctCodiIne
            ? `LAYER 17 ONLY: distinct NOMMUNI (${b.distinctNommuni}) exceeds distinct CODI_INE (${b.distinctCodiIne}) by ${b.distinctNommuni - b.distinctCodiIne} — the extra value is the EMPTY STRING, and it is carried by ${b.rowsWithBlankNommuni} ROWS. The distinct-value delta is 1; the ROW delta is ${b.rowsWithBlankNommuni}, and the row delta is the one that matters.`
            : 'no NOMMUNI/CODI_INE disagreement detected on this run',
        keyedOn: 'CODI_INE — on every layer, in every query in this probe. Immune to the blank-NOMMUNI defect by construction, not by luck.',
    };
    return out;
}

// ─── CLI: emit the universe on its own, cheaply, before any Catastro traffic ────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const u = await enumerateAmb();
    if (!u.ok) { console.error('✗ ' + u.reason); process.exit(1); }
    const OUT = join(HERE, 'out');
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'amb-enumeration.json'), JSON.stringify({ ...u, network: netLog }, null, 1));
    console.log(`AMB layer 16 carries ${u.distinctCount} distinct CODI_INE · PGM='S' ${u.pgmS} · PGM≠'S' ${u.pgmNotS} · mixed ${u.mixedPgm}`);
    for (const m of u.municipalities) console.log(`  ${m.ine}  PGM=${m.pgm.join('|')}  ${m.name}${m.nameVariants.length > 1 ? '  ⚠ variants ' + JSON.stringify(m.nameVariants) : ''}`);
    console.log('→ out/amb-enumeration.json');
}
