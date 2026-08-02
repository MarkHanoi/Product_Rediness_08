#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// TASK 2 — ONE CATALUNYA MUNICIPALITY, COLD, ALL THE WAY TO AN ENVELOPE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ HARD RULE HONOURED: this file contains ZERO municipality branches. The municipality enters
//    every query and every rule as a PARAMETER. There is no `if (ine === ...)` anywhere below.
//    Where the PRODUCT would need a Barcelona-specific path, that is RECORDED as a finding in
//    `barcelonaSpecificPathsRequired`, not worked around.
//
// SELECTION RULE — stated before any work on the city (see task2 log):
//   universe = 36 CODI_INE on AMB layer 16
//   (a) keep PGM-GOVERNED only: published flag PGM='S' AND NORMATIV root 'num_pgm'
//   (b) exclude 08019 Barcelona (reference; owns the MPGM-2007 modification)
//   (c) exclude the 4 with an existing rulepack file (08015, 08073, 08101, 08200) — not cold
//   (d) N=22; MEDIAN by 0-based index floor(22/2)=11 on ascending CODI_INE  =>  08204
//
// CITIES RUN
//   08204 Sant Climent de Llobregat  — THE PRE-DECLARED MEDIAN DRAW. The headline result.
//   08245 Santa Coloma de Gramenet   — DECLARED, NOT RANDOM. Added after the median returned a
//                                      1,447-parcel village, to bracket the answer with real dense
//                                      urban fabric. Reported as a declared second case, never
//                                      folded into the median result.
//   08019 Barcelona                  — CONTROL (PROBE-DISCIPLINE R2). The same parameterised code
//                                      must reproduce Barcelona's known envelope share. If it does
//                                      not, the pipeline is wrong and the cold results mean nothing.
//
// STAGES map onto C64 §3 layers (there is no "Stage 0..7" ladder in C64 — corrected here):
//   S0  dataset discovery (DATASET-DISCOVERY-PROTOCOL S0.1-S0.7, abbreviated: publisher known)
//   L0  ParcelContext      — the cadastral parcel frame (the denominator)
//   L1  LegalStack         — which instrument governs, per zone, with its article
//   L2/3 Variable resolution — the C64 §4 ladder, per variable
//   L6  Constraint composition
//   L7  Envelope synthesis  — envelope Y/N
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFrame, drawUniform } from './catastroParcelFrame.mjs';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ CODE SPACE — STATED BEFORE THE RUN, AND VERIFIED DURING IT.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EVERY code in the selection rule and in CITIES below is an **INE** code. It is the `CODI_INE`
// field of AMB layer 16 — the same code space SIU keys on (`ProvINE`) and the same one the rest of
// this repo uses. It is NOT the Catastro DGC code.
//
// The two collide, and 08204 is the THIRD measured collision:
//     DGC 08204 = SANT CUGAT DEL VALLES   ·   INE 08204 = SANT CLIMENT DE LLOBREGAT
// and — worse than Valencia/Turis — the colliding municipality is ITSELF in the AMB 36, so a naive
// "is the frame inside the AMB extent?" check PASSES on the wrong city.
//
// ⇒ TWO INDEPENDENT GUARDS, both of which must hold before any figure from this run is reported:
//   G1 NAME-AUTHORITATIVE ATOM MATCH. `catastroParcelFrame.mjs` matches the Catastro enclosure by
//      NAME and refuses a bare code match. It reports the DGC code it actually used.
//   G2 EXTENT NESTING, per city. The parcel frame's bbox must nest inside the bbox of THAT
//      municipality's layer-16 polygons (selected by the municipality ATTRIBUTE filter
//      `CODI_INE='<ine>'`, never a bbox). A frame for the colliding municipality fails this: Sant
//      Cugat is ~14 km north of Sant Climent and the two are disjoint.
// A failure of either guard ABORTS the city rather than producing a plausible wrong number.

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SVC = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';

// ── The claus Barcelona's registry ACTUALLY answers for, read from source (R8: never hand-typed) ──
const RP = join(HERE, '..', '..', 'packages', 'site-parcel-data', 'src', 'rulepacks');
function registeredBarcelonaClaus() {
    const sub = readFileSync(join(RP, 'bcn20aSubzones.ts'), 'utf8');
    const codes20a = [...sub.matchAll(/clau:\s*'(20a\/[^']+)'/g)].map((m) => m[1]);
    const ens = readFileSync(join(RP, 'esBarcelonaEnsanche.ts'), 'utf8');
    const base = /BCN_ENSANCHE_BASE_ZONE_CODE = '([^']+)'/.exec(ens)?.[1];
    const e13 = /BCN_13E_ZONE_CODE = '([^']+)'/.exec(ens)?.[1];
    const semi = /BCN_SEMIINTENSIVA_ZONE_CODES = \[([^\]]*)\]/.exec(readFileSync(join(RP, 'esBarcelonaSemiintensiva.ts'), 'utf8'))?.[1];
    const nucli = /BCN_NUCLI_ANTIC_ZONE_CODES = \[([^\]]*)\]/.exec(readFileSync(join(RP, 'esBarcelonaNucliAntic.ts'), 'utf8'))?.[1];
    const lit = (s) => [...String(s ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const set = new Set([...codes20a, base, e13, ...lit(semi), ...lit(nucli)].filter(Boolean));
    if (set.size < 12) throw new Error('registered-clau extraction returned ' + set.size + ' — the source shape changed; fix the probe.');
    return set;
}
const REGISTERED_CLAUS = registeredBarcelonaClaus();

// ── The Barcelona-EXCLUSIVE instruments baked into those packs, detected from source, not assumed ──
function barcelonaExclusiveModifications() {
    const found = [];
    const alc = readFileSync(join(RP, 'bcnAlcadaReguladora.ts'), 'utf8');
    if (/al terme municipal de Barcelona|al terme muncipal de Barcelona/.test(alc)) {
        found.push({ articles: ['239', '320.3a', '327.2a', '328.2a'], instrument: 'MPGM 02-03-2007, DOGC 4893', scope: 'al terme municipal de Barcelona', appliesTo: ['13a', '13E', '13b', '12'], file: 'rulepacks/bcnAlcadaReguladora.ts' });
    }
    const a20 = readFileSync(join(RP, 'esBarcelona20aAillada.ts'), 'utf8');
    if (/de Barcelona.*20-10-2004|DOGC núm\. 4277/.test(a20)) {
        found.push({ articles: ['342', '343'], instrument: 'MPGM 20-10-2004, DOGC 4277', scope: "l'ordenació de l'edificació aïllada, de Barcelona", appliesTo: ['20a/*'], file: 'rulepacks/esBarcelona20aAillada.ts' });
    }
    const ov = readFileSync(join(HERE, '..', '..', 'packages', 'site-parcel-data', 'src', 'providers', 'bcnRefosOVProvider.ts'), 'utf8');
    if (/BCN_INE_CODE = '08019'/.test(ov)) {
        found.push({ articles: ['306'], instrument: "hardcoded CODI_INE='08019' in the resolver's own WHERE clause", scope: 'Barcelona only, by construction', appliesTo: ['18'], file: 'providers/bcnRefosOVProvider.ts' });
    }
    return found;
}
const BCN_EXCLUSIVE = barcelonaExclusiveModifications();

// ── net ────────────────────────────────────────────────────────────────────────────────────────
const net = [];
async function read(url, label) {
    const t0 = Date.now();
    try {
        const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(300000) });
        const body = await r.text();
        net.push({ label, url: url.slice(0, 160), httpStatus: r.status, contentType: r.headers.get('content-type'), bytes: body.length, ms: Date.now() - t0, outcome: r.ok ? 'ok' : 'http-error' });
        return r.ok ? JSON.parse(body) : null;
    } catch (e) {
        net.push({ label, url: url.slice(0, 160), httpStatus: null, contentType: null, bytes: 0, ms: Date.now() - t0, outcome: 'network-error', error: String(e && e.message) });
        return null;
    }
}
/**
 * ⚠⚠ PAGINATED READ — ADDED AFTER THE BARCELONA CONTROL CAUGHT MY OWN DEFECT.
 *
 * `qualificacio_refos_3857` declares `maxRecordCount: 2000`. A layer-16 query for Barcelona returned
 * EXACTLY 2000 polygons and 3 distinct claus (the real figure is 89) behind a clean HTTP 200 — no
 * error, no warning, just a silently truncated answer that scored 87.77 % of the city
 * `no-determination`. The two small cold cities sit under the cap (292 and 999) so they were never
 * affected, and WITHOUT THE CONTROL THE DEFECT WOULD HAVE SHIPPED AS A FINDING ABOUT BARCELONA.
 *
 * This pages with `resultOffset` until the server stops setting `exceededTransferLimit`, and ASSERTS
 * termination rather than trusting a single page. A page that comes back short AND flagged aborts.
 */
async function readAllPaged(base, params, label) {
    const feats = [];
    let offset = 0, page = 0;
    for (;;) {
        const j = await read(`${base}?${new URLSearchParams({ ...params, resultOffset: String(offset), resultRecordCount: '2000' })}`, `${label}#${page}`);
        if (!j) return { ok: false, features: feats, reason: 'page-unreadable', pages: page };
        const f = j.features ?? [];
        feats.push(...f);
        page++;
        if (!j.exceededTransferLimit || f.length === 0) return { ok: true, features: feats, pages: page, terminatedBy: j.exceededTransferLimit ? 'empty-page' : 'server-cleared-exceededTransferLimit' };
        offset += f.length;
        if (page > 200) return { ok: false, features: feats, reason: 'pagination-runaway', pages: page };
    }
}

function inRing(x, y, ring) {
    let s = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) s = !s;
    }
    return s;
}

/**
 * Bbox pre-filter. The join is O(parcels x polygons x vertices); Barcelona is ~78k x ~11k and does
 * not finish without this. Purely an index — it changes no verdict, only the number of ring tests.
 * `bboxOf` is computed once per feature; `hit()` rejects on four comparisons before any ring walk.
 */
function indexFeatures(feats) {
    for (const f of feats) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const rg of f.rings) for (const [x, y] of rg) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        f.bb = [x0, y0, x1, y1];
    }
    return feats;
}
/** Point-in-any-ring with the bbox gate. Even-odd across rings (so holes subtract). */
function locate(feats, lon, lat) {
    for (const f of feats) {
        const b = f.bb;
        if (!b || lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
        let ins = false;
        for (const rg of f.rings) if (inRing(lon, lat, rg)) ins = !ins;
        if (ins) return f;
    }
    return null;
}
const bboxOfParcels = (ps) => ps.reduce((a, p) => [Math.min(a[0], p.lon), Math.min(a[1], p.lat), Math.max(a[2], p.lon), Math.max(a[3], p.lat)], [Infinity, Infinity, -Infinity, -Infinity]);
const bboxOfFeats = (fs) => fs.reduce((a, f) => [Math.min(a[0], f.bb[0]), Math.min(a[1], f.bb[1]), Math.max(a[2], f.bb[2]), Math.max(a[3], f.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
const parsePlantes = (v) => {
    const m = /^(B|PX)\+(\d{1,2})(\+A)?$/.exec(String(v ?? '').trim().toUpperCase());
    return m ? { storeys: 1 + Number(m[2]) + (m[3] ? 1 : 0), raw: String(v).trim() } : null;
};
const has = (v) => v !== null && v !== undefined && String(v).trim() !== '';

// ═══════════════════════════════════════════════════════════════════════════════════════════════
async function runCity(ine, name, role) {
    const clocks = {};
    const t = (k) => { clocks[k] = { start: Date.now() }; };
    const e = (k) => { clocks[k].ms = Date.now() - clocks[k].start; delete clocks[k].start; };
    const blockers = [];
    const bcnPaths = [];

    // ── S0 — dataset discovery (abbreviated: publisher and service already in the evidence register)
    t('S0_discovery');
    const svcMeta = await read(`${SVC}?f=json`, `${ine}:service-meta`);
    const layer16Meta = await read(`${SVC}/16?f=json`, `${ine}:layer16-meta`);
    e('S0_discovery');

    // ── L0 — ParcelContext: the cadastral parcel frame (the denominator) ─────────────────────────
    t('L0_parcelContext');
    const frame = await buildFrame(ine, name);
    e('L0_parcelContext');
    if (!frame.ok) return { ine, name, role, failed: 'L0', reason: frame.reason, message: frame.message, clocks };
    // G1 — the ATOM match must be NAME-authoritative. A bare corroborated-code match is the Turis bug.
    // ⚠ HONESTY ON G1: `buildFrame` short-circuits the ATOM hop on a cache hit, so on a cached frame
    // it returns no `matchedBy`. That is NOT a passed guard — it is a guard NOT RE-EXERCISED. Said so
    // explicitly rather than rendering a null as a tick.
    const g1 = frame.cached === false && frame.matchedBy
        ? { exercised: true, dgcCodeUsed: frame.dgcCode ?? null, matchedBy: frame.matchedBy, collisionWarning: frame.warning ?? null }
        : { exercised: false, note: 'frame served from disk cache; the name-authoritative ATOM match ran when the frame was FIRST built, not on this run. G2 is the guard actually exercised here.' };
    // Seeded uniform draw for populations too large to join exhaustively. DECLARED, never silent.
    const SAMPLE_ABOVE = 6000, SAMPLE_N = 3000, SEED = 20260802;
    const sampled = frame.parcelCount > SAMPLE_ABOVE;
    const parcels = sampled ? drawUniform(frame.parcels, SAMPLE_N, SEED) : frame.parcels;
    const sampling = sampled
        ? { sampled: true, population: frame.parcelCount, drawn: parcels.length, seed: SEED, method: 'uniform without replacement over the full Catastro INSPIRE CP parcel population; every parcel weighs 1' }
        : { sampled: false, population: frame.parcelCount, drawn: parcels.length };

    // ── L1 — LegalStack: which instrument governs, per zone, with its article ───────────────────
    t('L1_legalStack');
    const z = await readAllPaged(`${SVC}/16/query`, { f: 'json', where: `CODI_INE='${ine}'`, outFields: 'CLAU_URB,PLAN,NORMATIV,EQUI_PGM,PGM,DESCRIP', returnGeometry: 'true', outSR: '4326' }, `${ine}:layer16-geometry`);
    e('L1_legalStack');
    if (!z.ok) return { ine, name, role, failed: 'L1', reason: `layer-16 read incomplete (${z.reason}) — UNKNOWN, not empty`, clocks };
    // ⚠ NEGATIVE PROOF: a zero here must never be reported as "no zoning".
    if (z.features.length === 0) {
        const alt = await read(`${SVC}/16/query?${new URLSearchParams({ f: 'json', where: '1=1', outFields: 'CODI_INE', returnDistinctValues: 'true', returnGeometry: 'false' })}`, `${ine}:negative-proof-distinct-ine`);
        return { ine, name, role, failed: 'L1', reason: 'ZERO zoning features for the municipality ATTRIBUTE filter — negative proof attached, NOT reported as absence', distinctIneCount: alt?.features?.length ?? null, clocks };
    }
    const zoneFeats = indexFeatures(z.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] })));
    // G2 — EXTENT NESTING. The parcel frame must sit inside THIS municipality's zoning extent.
    // Guards the DGC/INE collision: the colliding municipality is disjoint, so a wrong frame fails.
    // ⚠ THE TEST IS OVERLAP, NOT CONTAINMENT — and the first version of this guard was WRONG.
    // Strict containment rejected BARCELONA by 0.0002 deg (~17 m): its parcels reach marginally west
    // of the zoning clip at the Zona Franca. Loosening the pad until it passes would have destroyed
    // the guard. The COLLISION SIGNATURE IS DISJOINTNESS — the colliding municipality is 14+ km away
    // — so the discriminating statistic is the fraction of the parcel bbox covered by the zoning
    // bbox. Marginal overflow scores ~0.99; a wrong municipality scores 0.
    const pbb = bboxOfParcels(parcels), zbb = bboxOfFeats(zoneFeats);
    const ix = Math.max(0, Math.min(pbb[2], zbb[2]) - Math.max(pbb[0], zbb[0]));
    const iy = Math.max(0, Math.min(pbb[3], zbb[3]) - Math.max(pbb[1], zbb[1]));
    const parcelArea = Math.max(1e-12, (pbb[2] - pbb[0]) * (pbb[3] - pbb[1]));
    const overlapFraction = +((ix * iy) / parcelArea).toFixed(4);
    const OVERLAP_MIN = 0.5;
    const nested = overlapFraction >= OVERLAP_MIN;
    const g2 = { test: 'bbox overlap fraction of the parcel frame covered by this municipality\'s zoning', overlapFraction, threshold: OVERLAP_MIN, parcelBbox: pbb.map((v) => +v.toFixed(4)), zoningBbox: zbb.map((v) => +v.toFixed(4)), nested };
    if (!nested) {
        return { ine, name, role, failed: 'G2-extent-nesting', reason: 'The parcel frame does NOT nest inside this municipality\'s layer-16 zoning extent. This is the DGC/INE collision signature. ABORTING rather than reporting a plausible wrong number.', guards: { g1, g2 }, clocks };
    }
    const pgmGoverned = zoneFeats.some((f) => String(f.a.PGM) === 'S');
    const instrumentRoots = [...new Set(zoneFeats.map((f) => String(f.a.NORMATIV ?? '').split('.')[0]))];

    // ── L2/L3 — variable resolution inputs ──────────────────────────────────────────────────────
    t('L23_variableResolution');
    const qmj = await read(`${SVC}/18/query?${new URLSearchParams({ f: 'json', where: `CODI_MUN LIKE '${ine}%'`, outFields: '*', returnGeometry: 'false' })}`, `${ine}:table18-QUAL_MUNI`);
    const qmRows = qmj?.features?.map((f) => f.attributes) ?? [];
    const qmByClau = new Map(qmRows.map((r) => [String(r.CODI_MUN).slice(ine.length + 1), r]));
    const ovj = await readAllPaged(`${SVC}/17/query`, { f: 'json', where: `CODI_INE='${ine}'`, outFields: 'CLAU,CLAU_URB,PLANTES,PLAN', returnGeometry: 'true', outSR: '4326' }, `${ine}:layer17-OV_Trames`);
    if (!ovj.ok) return { ine, name, role, failed: 'L23', reason: `layer-17 read incomplete (${ovj.reason}) — UNKNOWN, not empty`, clocks };
    const ovFeats = indexFeatures(ovj.features.map((f) => ({ a: f.attributes, rings: f.geometry?.rings ?? [] })));
    const paging = { layer16Pages: z.pages, layer16TerminatedBy: z.terminatedBy, layer17Pages: ovj.pages, layer17TerminatedBy: ovj.terminatedBy };
    e('L23_variableResolution');

    // ── L6/L7 — constraint composition + envelope synthesis, per parcel ─────────────────────────
    // PRECEDENCE, stated then applied (same order Probe A converged on, so the two are comparable):
    //  1 OV footprint + parsable PLANTES        -> envelope (explicit-area)
    //  2 Asterisc / PD*                         -> refuse delegated
    //  3 NORMATIV titol_2 or titol_3 (sistemes) -> refuse terminal (public systems, no private land)
    //  4 QUAL_MUNI carries ARM+N_PLANTES+OCUP_MAX+SEP_FVIAL -> envelope (published values)
    //  5 clau is in Barcelona's REGISTERED PGM pack set AND the PGM governs -> envelope-by-regional-pack
    //  6 otherwise                              -> refuse
    t('L67_envelopeSynthesis');
    const rows = [];
    for (const p of parcels) {
        const zf = locate(zoneFeats, p.lon, p.lat);
        if (!zf) { rows.push({ ref: p.ref, final: 'no-determination', reason: 'centroid outside every layer-16 polygon' }); continue; }
        const clau = String(zf.a.CLAU_URB ?? ''), norm = String(zf.a.NORMATIV ?? ''), plan = String(zf.a.PLAN ?? '');
        const ov = locate(ovFeats, p.lon, p.lat);
        const pl = ov ? parsePlantes(ov.a.PLANTES) : null;
        const q = qmByClau.get(clau) ?? null;
        const base = { ref: p.ref, clau, plan, normativ: norm, equiPgm: String(zf.a.EQUI_PGM ?? '') };
        if (pl) { rows.push({ ...base, final: 'envelope', via: 'OV_Trames', rung: 2, storeys: pl.storeys }); continue; }
        if (ov) { rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data', via: 'OV_Trames', reason: `PLANTES='${ov.a.PLANTES}' unparseable — refuses rather than defaulting` }); continue; }
        if (norm === 'Asterisc' || plan.includes('PD*')) { rows.push({ ...base, final: 'refuse', cat: 'delegated', reason: `PLAN='${plan}' NORMATIV='Asterisc' — delegated to a pla derivat not in corpus` }); continue; }
        if (/^num_\w+\.titol_(2|3)\./.test(norm)) { rows.push({ ...base, final: 'refuse', cat: 'terminal', reason: `${norm} — sistemes / public land; no private envelope exists` }); continue; }
        if (q && has(q.ARM) && has(q.N_PLANTES) && has(q.OCUP_MAX) && has(q.SEP_FVIAL)) { rows.push({ ...base, final: 'envelope', via: 'QUAL_MUNI', rung: 1 }); continue; }
        if (pgmGoverned && REGISTERED_CLAUS.has(clau)) { rows.push({ ...base, final: 'envelope', via: 'PGM_REGIONAL_PACK', rung: 4, reason: `clau '${clau}' is answered by a registered PGM pack and NORMATIV cites ${norm}` }); continue; }
        if (q) { rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data', reason: `QUAL_MUNI row exists for '${clau}' but every envelope field is NULL` }); continue; }
        rows.push({ ...base, final: 'refuse', cat: 'missing-authoritative-data', reason: `no QUAL_MUNI row and no registered pack for clau '${clau}'` });
    }
    e('L67_envelopeSynthesis');

    // ── what the PRODUCT would have needed, per envelope route ──────────────────────────────────
    const viaPack = rows.filter((r) => r.via === 'PGM_REGIONAL_PACK').length;
    const viaOv = rows.filter((r) => r.via === 'OV_Trames').length;
    if (ine !== '08019') {
        if (viaPack > 0) {
            bcnPaths.push({ module: 'packages/site-parcel-data/src/rulepacks/registry.ts', why: `The PGM packs are registered under jurisdictionId 'es-08019-barcelona' with BARCELONA_BBOX. resolveRegisteredJurisdictionAt(lat,lon) would route ${viaPack} parcels here only because that bbox is declared 'metropolitan' and happens to contain them — the pack's citations would then be Barcelona's.`, blockerClass: 'Engineering', affects: viaPack });
            for (const mod of BCN_EXCLUSIVE.filter((m) => m.appliesTo.some((c) => c.endsWith('*') ? rows.some((r) => r.clau?.startsWith(c.slice(0, -1))) : rows.some((r) => r.clau === c)))) {
                bcnPaths.push({ module: mod.file, why: `Arts. ${mod.articles.join('/')} are read from ${mod.instrument}, whose own scope is «${mod.scope}». It does NOT govern ${name}. Publishing this pack's numbers here would cite an instrument that does not apply.`, blockerClass: 'Legal', affects: rows.filter((r) => mod.appliesTo.some((c) => c.endsWith('*') ? r.clau?.startsWith(c.slice(0, -1)) : r.clau === c)).length });
            }
        }
        if (viaOv > 0) {
            bcnPaths.push({ module: 'packages/site-parcel-data/src/providers/bcnRefosOVProvider.ts', why: `The resolver hardcodes CODI_INE='08019' in its WHERE clause, so it returns 'no-feature' for every parcel here. Additionally apps/editor/src/ui/site/siteDispatch.ts:4146 guards the branch to clau exactly '18'.`, blockerClass: 'Engineering', affects: viaOv });
            bcnPaths.push({ module: 'packages/site-parcel-data/src/rulepacks/bcnAlcadaReguladora.ts', why: `heightFromFloorsAboveGround() converts storeys->metres using BCN_ALCADA_REGULADORA_TABLE, the Art. 327.2a ladder AS MODIFIED FOR BARCELONA. The base metropolitan ladder that governs other AMB municipalities is present as BCN_ART327_BASE_METROPOLITAN_TABLE but NOTHING READS IT.`, blockerClass: 'Legal', affects: viaOv });
        }
    }

    const N = parcels.length; // the JOINED denominator; equals the population unless sampled (declared)
    const pc = (x) => +((100 * x) / N).toFixed(2);
    const cnt = (f) => rows.filter(f).length;
    const env = cnt((r) => r.final === 'envelope');
    const tally = {
        envelope: env, envelopePct: pc(env),
        envelope_OV: viaOv, envelope_QUAL_MUNI: cnt((r) => r.via === 'QUAL_MUNI'), envelope_PGM_PACK: viaPack,
        refuse_delegated: cnt((r) => r.cat === 'delegated'),
        refuse_terminal: cnt((r) => r.cat === 'terminal'),
        refuse_missingData: cnt((r) => r.cat === 'missing-authoritative-data'),
        noDetermination: cnt((r) => r.final === 'no-determination'),
    };
    return {
        ine, name, role, N,
        codeSpace: 'INE (AMB layer-16 CODI_INE) — NOT the Catastro DGC code',
        guards: { g1, g2 }, sampling, paging,
        instrument: { pgmGoverned, instrumentRoots, equiPgmPublished: zoneFeats.some((f) => has(f.a.EQUI_PGM)) },
        counts: { zonePolygons: zoneFeats.length, distinctClaus: new Set(zoneFeats.map((f) => f.a.CLAU_URB)).size, qualMuniRows: qmRows.length, qualMuniWithArm: qmRows.filter((r) => has(r.ARM)).length, ovPolygons: ovFeats.length },
        tally, pct: Object.fromEntries(Object.entries(tally).filter(([k]) => !k.endsWith('Pct')).map(([k, v]) => [k, pc(v)])),
        barcelonaSpecificPathsRequired: bcnPaths,
        clocks, rows,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
const CITIES = [
    ['08204', 'SANT CLIMENT DE LLOBREGAT', 'PRIMARY — pre-declared median draw'],
    ['08245', 'SANTA COLOMA DE GRAMENET', 'DECLARED second case — dense urban fabric bracket, NOT a random draw'],
    ['08019', 'BARCELONA', 'CONTROL — the same parameterised code must reproduce the known figure (R2)'],
];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const results = [];
for (const [ine, name, role] of CITIES) {
    if (only && ine !== only) continue;
    const t0 = Date.now();
    const r = await runCity(ine, name, role);
    r.wallClockTotalMs = Date.now() - t0;
    results.push(r);
    console.log(`\n══ ${ine} ${name} ══  [${role}]`);
    if (r.failed) { console.log(`  ⛔ BLOCKED AT ${r.failed}: ${r.reason}`); if (r.guards) console.log(`     guards: ${JSON.stringify(r.guards)}`); continue; }
    console.log(`  G1 ATOM name-match: ${r.guards.g1.exercised ? `EXERCISED — DGC ${r.guards.g1.dgcCodeUsed} by "${r.guards.g1.matchedBy}"${r.guards.g1.collisionWarning ? ' ⚠ ' + r.guards.g1.collisionWarning : ''}` : 'NOT RE-EXERCISED (cached frame) — see note'}`);
    console.log(`  G2 extent overlap: ${r.guards.g2.nested ? 'PASS' : 'FAIL'} fraction=${r.guards.g2.overlapFraction} (threshold ${r.guards.g2.threshold})`);
    console.log(`  N = ${r.N.toLocaleString()} parcels joined${r.sampling.sampled ? ` (SEEDED SAMPLE of ${r.sampling.population.toLocaleString()}, seed ${r.sampling.seed})` : ' (full population)'} · PGM-governed=${r.instrument.pgmGoverned} · instrument roots ${r.instrument.instrumentRoots.join('|')}`);
    console.log(`  paging: layer16 ${r.paging.layer16Pages} page(s) [${r.paging.layer16TerminatedBy}] · layer17 ${r.paging.layer17Pages} page(s) [${r.paging.layer17TerminatedBy}]`);
    console.log(`  zoning polys ${r.counts.zonePolygons} · distinct claus ${r.counts.distinctClaus} · QUAL_MUNI rows ${r.counts.qualMuniRows} (ARM populated ${r.counts.qualMuniWithArm}) · OV polys ${r.counts.ovPolygons}`);
    console.log(`  ENVELOPE ${r.tally.envelopePct} %  =  OV ${r.pct.envelope_OV} % + QUAL_MUNI ${r.pct.envelope_QUAL_MUNI} % + PGM-pack ${r.pct.envelope_PGM_PACK} %`);
    console.log(`  refuse: delegated ${r.pct.refuse_delegated} % · terminal ${r.pct.refuse_terminal} % · missing-data ${r.pct.refuse_missingData} % · no-determination ${r.pct.noDetermination} %`);
    console.log(`  wall clock by stage: ` + Object.entries(r.clocks).map(([k, v]) => `${k} ${(v.ms / 1000).toFixed(1)}s`).join(' · '));
    if (r.barcelonaSpecificPathsRequired.length) {
        console.log(`  ⛔ BARCELONA-SPECIFIC PATHS THAT WOULD BE REQUIRED (logged, NOT written):`);
        for (const b of r.barcelonaSpecificPathsRequired) console.log(`     [${b.blockerClass}] ${b.module} — affects ${b.affects} parcels`);
    }
}
writeFileSync(join(OUT, 'task2-pgm-cold-pipeline.json'), JSON.stringify({ probe: 'TASK-2 · PGM cold municipality, full pipeline', registeredBarcelonaClaus: [...REGISTERED_CLAUS], barcelonaExclusiveModifications: BCN_EXCLUSIVE, network: net, results }, null, 1));
console.log('\n→ out/task2-pgm-cold-pipeline.json');
