#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AMB SERVICE READS — COPIED, NOT IMPORTED.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §COPIED-FROM tools/cold-start-probe/ambEnumerate.mjs. A sibling agent owns that tree; importing
// across it would couple two runs that must be able to disagree. The behaviour is reproduced and
// the copy site is named here, per the same convention task5 uses for the product code it copies.
//
// ⛔ THE THREE SERVICE TRAPS THIS FILE IS BUILT AROUND, all measured on THIS service:
//   1. `maxRecordCount` = 2000. A layer-16 Barcelona query returns EXACTLY 2000 rows behind a clean
//      HTTP 200. Any count landing on a round limit is a TRUNCATION SUSPECT until the server itself
//      clears `exceededTransferLimit` on the final page.
//   2. `resultRecordCount` alongside `returnDistinctValues` SILENTLY CANCELS de-duplication.
//      ⇒ `readDistinct()` NEVER paginates and NEVER sends `resultRecordCount`. It asserts the
//        transfer limit was not hit instead, and refuses if it was.
//   3. `NOMMUNI` is BLANK on 4,912 of Barcelona's 5,073 layer-17 rows. ⛔ KEY ON `CODI_INE`, NEVER
//      ON NAME. Every query in this tool keys on CODI_INE.
//
// `returnCountOnly` is an UNCAPPED oracle: every paged walk is reconciled against it. A walk that
// does not match its own count oracle is reported as UNKNOWN, never as the number it happened to
// reach.
export const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
const UA = 'PRYZM-amb-base-ladder-delta/1.0 (+pryzmhello@gmail.com)';

/** Every network read, recorded. An unreachable service is UNKNOWN, never empty. */
export const netLog = [];

export async function readJson(base, params, label) {
    const url = `${base}?${new URLSearchParams(params)}`;
    const t0 = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(300000) });
            const body = await r.text();
            netLog.push({ label, url: url.slice(0, 220), httpStatus: r.status, bytes: body.length, ms: Date.now() - t0, attempt, outcome: r.ok ? 'ok' : 'http-error' });
            if (!r.ok) { if (attempt < 2) continue; return null; }
            const j = JSON.parse(body);
            // ⛔ A 200 CARRYING AN ESRI ERROR BODY IS NOT A SUCCESS. "A successful response is not an
            //    applied filter" — negative-proof condition 7.
            if (j.error) { netLog[netLog.length - 1].outcome = 'esri-error'; netLog[netLog.length - 1].esriError = j.error; return null; }
            return j;
        } catch (e) {
            netLog.push({ label, url: url.slice(0, 220), httpStatus: null, bytes: 0, ms: Date.now() - t0, attempt, outcome: 'network-error', error: String(e && e.message) });
        }
    }
    return null;
}

/** The UNCAPPED count oracle. Every walk is reconciled against this, never against itself. */
export async function countOnly(layer, where, label) {
    const j = await readJson(`${SVC}/${layer}/query`, { f: 'json', where, returnCountOnly: 'true' }, label);
    return j && typeof j.count === 'number' ? j.count : null;
}

/**
 * DISTINCT read. ⛔ NO PAGINATION, NO `resultRecordCount` — either would cancel the de-duplication
 * silently and shrink the universe behind a clean 200. If the distinct read itself hits the transfer
 * limit the universe is UNKNOWN and this refuses rather than returning a truncated set.
 */
export async function readDistinct(layer, fields, where = '1=1', label = 'distinct') {
    const j = await readJson(`${SVC}/${layer}/query`, {
        f: 'json', where, outFields: fields, returnDistinctValues: 'true',
        returnGeometry: 'false', orderByFields: fields.split(',')[0],
    }, label);
    if (!j) return { ok: false, reason: 'distinct read failed — UNKNOWN, not empty' };
    if (j.exceededTransferLimit === true) return { ok: false, reason: 'the DISTINCT read ITSELF hit the transfer limit — the returned set would be a truncation, not a universe' };
    return { ok: true, rows: (j.features ?? []).map((f) => f.attributes) };
}

/** Paged walk. Reconciled by the caller against `countOnly`. */
export async function readAllPaged(layer, params, label, pageSize = 2000) {
    const feats = [];
    let offset = 0, page = 0;
    const flags = [];
    for (;;) {
        const j = await readJson(`${SVC}/${layer}/query`, { ...params, resultOffset: String(offset), resultRecordCount: String(pageSize) }, `${label}#${page}`);
        if (!j) return { ok: false, features: feats, reason: 'page-unreadable', pages: page, exceededTransferLimitByPage: flags };
        const f = j.features ?? [];
        feats.push(...f);
        flags.push(j.exceededTransferLimit === true);
        page++;
        if (!j.exceededTransferLimit || f.length === 0) {
            return { ok: true, features: feats, pages: page, exceededTransferLimitByPage: flags, terminatedBy: j.exceededTransferLimit ? 'empty-page' : 'server-cleared-exceededTransferLimit' };
        }
        offset += f.length;
        if (page > 400) return { ok: false, features: feats, reason: 'pagination-runaway', pages: page, exceededTransferLimitByPage: flags };
    }
}

/**
 * A walk PLUS its oracle, asserted. Returns `{ ok:false }` when the two disagree — a walk that
 * cannot reconcile against `returnCountOnly` has measured nothing.
 */
export async function readReconciled(layer, params, where, label) {
    const oracle = await countOnly(layer, where, `${label}:oracle`);
    const walk = await readAllPaged(layer, params, label);
    if (!walk.ok) return { ...walk, oracle };
    if (oracle === null) return { ok: false, reason: 'count oracle unreadable — the walk cannot be reconciled, so its length is UNKNOWN', features: walk.features, oracle };
    if (oracle !== walk.features.length) {
        return { ok: false, reason: `WALK/ORACLE DISAGREEMENT: returnCountOnly says ${oracle}, the walk returned ${walk.features.length}`, features: walk.features, oracle, walked: walk.features.length };
    }
    return { ...walk, oracle, reconciled: true };
}
