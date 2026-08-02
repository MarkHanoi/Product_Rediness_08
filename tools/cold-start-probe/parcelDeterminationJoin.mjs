#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// PARCEL-WEIGHTED DETERMINATION SPLIT — the five cities restated on the CADASTRAL PARCEL.
//
// Coordinator addendum 2026-08-02:
//   A · "The unit is now CADASTRAL PARCELS … we ask how many of its parcels receive a determination."
//   B · "Determination % = Envelope % + Refusal %. A bare '98.3 %' … must not appear in any report."
//
// METHOD
//   1. Draw N parcels UNIFORMLY AT RANDOM, without replacement, from the municipality's FULL
//      Catastro INSPIRE CP population (catastroParcelFrame.mjs). Every parcel weighs exactly 1.
//   2. Point-query the SAME live publisher service the production provider queries, at the parcel
//      centroid, for the SAME field.
//   3. Map the returned zone code to a determination category using the slice definitions COMMITTED
//      in `tools/city-completion/measurements/<city>.measurements.json`.
//
// ⚠ R1 DEVIATION, STATED (PROBE-DISCIPLINE §2). This calls the production PUBLISHER SERVICE, layer
// and field, but it does NOT call `dispatchParcelBoundary` — that entry point needs an editor
// runtime this tool has no way to obtain. So it measures **the zoning routing**, not the full
// dispatch. WHAT THAT CANNOT CATCH (R7): a defect between "the right zone code was read" and "the
// right refusal was emitted" — e.g. a resolver that is authored but never called (Córdoba blocker 3)
// would still score here as if it routed. The refusal audit is the instrument for that, not this.
//
// ⚠ THREE SUB-SPLITS ARE INHERITED, NOT RE-MEASURED, AND ARE LABELLED `inherited` IN THE OUTPUT:
//   • Barcelona 13a/13b/12 — 96.22 % of block-ring dissolves succeed (L-676, 178/185 blocks).
//   • Barcelona clau 18   — 26.4 % carries a parseable AMB Refós OV footprint (SIG-3).
//   • Murcia RC/RM/RN     — 52.0 % of street-width constructions resolve (SIG-MU2 probe, n=150).
//   Each needs a second engine run per parcel. Applying the city's own measured rate is honest;
//   claiming it was re-measured here would not be.
//
// §CONTEXT-DATA-HONESTY — a 403 / 499 / timeout is `unresolved-transport`, EXCLUDED from the
// denominator and reported as a failure count. It is never a refusal and never a gap.
//
// USAGE  node parcelDeterminationJoin.mjs --city barcelona --n 300 --seed 20260802
// ─────────────────────────────────────────────────────────────────────────────
import { buildFrame, drawUniform } from './catastroParcelFrame.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = 'PRYZM-cold-start-probe/1.0 (+pryzmhello@gmail.com)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _last = 0, _reqs = 0;
async function get(url, { ua = UA, timeoutMs = 45_000 } = {}) {
    const gap = Date.now() - _last;
    if (gap < 250) await sleep(250 - gap);
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    _reqs++;
    try {
        const res = await fetch(url, { signal: ac.signal, headers: { 'user-agent': ua } });
        const body = await res.text();
        _last = Date.now();
        if (!res.ok) return { outcome: 'http-error', status: res.status, message: `HTTP ${res.status}`, body };
        return { outcome: 'ok', status: res.status, body };
    } catch (e) {
        _last = Date.now();
        return { outcome: ac.signal.aborted ? 'timeout' : 'network-error', message: e?.message ?? String(e) };
    } finally { clearTimeout(t); }
}

/** The five determination categories. `nonBuildable` is a correct answer that is NOT private buildable land. */
export const CATEGORIES = ['envelope', 'refusal-terminal', 'refusal-delegated', 'refusal-external', 'no-pack', 'nonBuildable'];

// ── CITY ADAPTERS ────────────────────────────────────────────────────────────
// Each `query` hits the SAME service/layer/field the production provider hits.
// Each `classify` maps the returned code to a category using the committed measurement slices.

const BCN_BLOCK = new Set(['13a', '13b', '12']);
const BCN_20A_SUB = new Set(['20a/5', '20a/8', '20a/9', '20a/9b', '20a/9u', '20a/10', '20a/11', '20a/12']);
const BCN_TAIL = new Set(['15', '16', '17/5', '17/6', '17/7', '14a', '14b', '8a']);

export const CITIES = {
    barcelona: {
        ine: '08019', name: 'BARCELONA',
        service: 'AMB Refós qualificacio_refos_3857/MapServer/16 · field CLAU_URB',
        query: (lat, lon) => 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer/16/query'
            + `?geometry=${lon.toFixed(7)},${lat.toFixed(7)}&geometryType=esriGeometryPoint&inSR=4326`
            + '&spatialRel=esriSpatialRelIntersects&outFields=CLAU_URB,CODI_INE&returnGeometry=false&f=json',
        ua: BROWSER_UA,
        read: (body) => {
            const j = JSON.parse(body);
            if (j.error) return { err: j.error.message ?? 'arcgis error' };
            const f = (j.features ?? [])[0];
            return { code: f?.attributes?.CLAU_URB ?? null, ine: f?.attributes?.CODI_INE ?? null };
        },
        classify: ({ code }) => {
            if (!code) return { cat: 'nonBuildable', why: 'no qualification polygon at point (street / outside AMB refós)' };
            const c = String(code).trim();
            if (BCN_BLOCK.has(c)) return { cat: 'envelope', why: 'Art. 242.2 profunditat constructed (ADR-0271)', inherited: { key: 'bcn-dissolve', envelopeRate: 0.9622, elseCat: 'no-pack', elseWhy: 'block-ring dissolve refuses (L-676)' } };
            if (BCN_20A_SUB.has(c)) return { cat: 'envelope', why: 'native setback pack, Arts. 339-343' };
            if (c === '18') return { cat: 'envelope', why: 'AMB Refós OV footprint + PLANTES (SIG-3)', inherited: { key: 'bcn-clau18', envelopeRate: 0.264, elseCat: 'refusal-delegated', elseWhy: 'Art. 306 — per-site approved volumetric ordering not held' } };
            if (c === '22a') return { cat: 'refusal-delegated', why: 'Art. 350.1 — ~2,595 Pla Parcials' };
            if (c === '22@') return { cat: 'refusal-terminal', why: 'Art. 8.1 MPGM 22@ — omission intentional in law (DEC-1)' };
            if (c === '12b') return { cat: 'refusal-terminal', why: 'Arts. 320.3a/320.2a — tram de vial undefined, permanent (L-676)' };
            if (c === '20a') return { cat: 'refusal-terminal', why: 'Arts. 314.5/338.2/339 — missing SELECTOR not missing rule (L-673)' };
            if (BCN_TAIL.has(c)) return { cat: 'refusal-delegated', why: 'derived plan / verd privat protegit' };
            return { cat: 'nonBuildable', why: `clau ${c} is a system / non-urbanitzable / composite overlay — outside the L-656 private-buildable set` };
        },
    },

    madrid: {
        ine: '28079', name: 'MADRID',
        service: 'sigma.madrid.es NORMAS_ZONALES/MapServer/0 · field AMB_TX_ETIQ',
        query: (lat, lon) => 'https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query'
            + `?geometry=${lon.toFixed(7)},${lat.toFixed(7)}&geometryType=esriGeometryPoint&inSR=4326`
            + '&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json',
        ua: BROWSER_UA,
        read: (body) => {
            const j = JSON.parse(body);
            if (j.error) return { err: j.error.message ?? 'arcgis error' };
            const f = (j.features ?? [])[0];
            if (!f) return { code: null };
            const a = f.attributes ?? {};
            const k = Object.keys(a).find((x) => /AMB_TX_ETIQ/i.test(x)) ?? Object.keys(a).find((x) => /ETIQ|NORMA|NZ/i.test(x));
            return { code: k ? a[k] : null, raw: a };
        },
        classify: ({ code }) => {
            if (!code) return { cat: 'nonBuildable', why: 'no Norma Zonal polygon at point (system / APE / APR / outside NZ-governed land)' };
            const s = String(code);
            const m = s.match(/(\d+)/);
            const nz = m ? m[1] : null;
            if (nz === '3') return { cat: 'refusal-terminal', why: 'NZ 3 — Art. 8.3.1 «se ha agotado el aprovechamiento urbanístico»; terminal, permanently (L-678)' };
            if (nz === '1') return { cat: 'envelope', why: 'NZ 1 published footprint clipped to parcel (SIG-M2, Doctrine B / ADR-0280)' };
            if (['4', '5', '7', '8', '9'].includes(nz)) return { cat: 'no-pack', why: 'packed but MADRID_ENVELOPE_VERIFIED=false ⇒ no number reaches the panel (L-651)' };
            return { cat: 'nonBuildable', why: `NZ code "${s}" outside the 34-code NZ inventory scored by the record` };
        },
    },

    // ⚠ MURCIA USES THE PRODUCTION CLASSIFIER (PROBE-DISCIPLINE R1), imported from
    // tools/murcia-coverage-crosstab/classify.mjs — `calificacionFamily`, `delegationGround`,
    // `CODE_PACKED_EXACT`, `BUILDABLE_FAMILIES`. Measured 2026-08-02: the live layer publishes
    // **195 distinct in-force calificación strings**, not 34. A hand-written classifier with a
    // default branch mapping the unknown tail to `envelope` over-credits by construction — which is
    // exactly what the first draft of this adapter did before the vocabulary was enumerated.
    // ⚠ AXIS: this GeoServer serves EPSG:4326 as **lon,lat**. A lat,lon bbox returns 0 features and
    // a well-formed 200 — measured, and it scored Murcia 8/8 `nonBuildable` before the control ran.
    murcia: {
        ine: '30030', name: 'MURCIA',
        service: 'geoserver.murcia.es WFS Murcia:pgou_alineaciones (calificacion, sector, f_fin) + Murcia:pgou_sectores (clase_suelo)',
        multi: true,
        queries: (lat, lon) => {
            const d = 0.00008;
            const bbox = `${(lon - d).toFixed(7)},${(lat - d).toFixed(7)},${(lon + d).toFixed(7)},${(lat + d).toFixed(7)},EPSG:4326`;
            const base = 'https://geoserver.murcia.es/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&count=5&bbox=';
            return {
                cal: `${base}${bbox}&typeNames=Murcia:pgou_alineaciones`,
                sec: `${base}${bbox}&typeNames=Murcia:pgou_sectores`,
            };
        },
        readMulti: (bodies) => {
            const inForce = (f) => {
                const ff = f.properties?.f_fin;
                return !ff || String(ff).startsWith('2999') || new Date(ff) > new Date();
            };
            const cal = (JSON.parse(bodies.cal).features ?? []).filter(inForce)[0]?.properties ?? null;
            const sec = (JSON.parse(bodies.sec).features ?? []).filter(inForce)[0]?.properties ?? null;
            return {
                code: cal?.calificacion ?? null,
                sector: cal?.sector ?? sec?.sector ?? null,
                claseSuelo: sec?.clase_suelo,   // `undefined` ⇒ UNJOINED, a third value (classify.mjs)
            };
        },
        classify: ({ code, sector, claseSuelo }, M) => {
            if (!code) return { cat: 'nonBuildable', why: 'no in-force calificación polygon at point (viario / espacio libre / equipamiento)' };
            const raw = String(code).trim();
            const family = M.calificacionFamily(raw);
            if (!family || !M.BUILDABLE_FAMILIES.includes(family)) {
                return { cat: 'nonBuildable', why: `calificación "${raw}" is not one of the 34 buildable families (classify.mjs BUILDABLE_FAMILIES)` };
            }
            const prefix = String(sector ?? '').match(/^([A-Z]+)/)?.[1] ?? null;
            const ground = M.delegationGround(family, prefix, claseSuelo);
            if (ground) return { cat: 'refusal-delegated', why: `${ground} — ${M.GROUND_ARTICLE[ground]}` };
            if (M.CODE_PACKED_EXACT.includes(raw.toUpperCase())) {
                return { cat: 'envelope', why: 'packed + PGOU-direct calificación (SIG-MU1)' };
            }
            if (['RC', 'RM', 'RN'].includes(family)) {
                return {
                    cat: 'envelope', why: 'constructed street width (SIG-MU2)',
                    inherited: { key: 'mur-street', envelopeRate: 0.520, elseCat: 'no-pack', elseWhy: 'band-edge 44.6 % / no-opposing-frontage 3.4 % — ADR-0287 requires the refusal' },
                };
            }
            return { cat: 'no-pack', why: `PGOU-direct family ${family} but no packed ordinance — the 0.68 pp residual` };
        },
    },

    valencia: {
        ine: '46250', name: 'VALENCIA',
        service: 'geoportal.valencia.es OPENDATA/UrbanismoEInfraestructuras/MapServer/231 · fields clase, califi, origen',
        query: (lat, lon) => 'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/231/query'
            + `?geometry=${lon.toFixed(7)},${lat.toFixed(7)}&geometryType=esriGeometryPoint&inSR=4326`
            + '&spatialRel=esriSpatialRelIntersects&outFields=clase,califi,origen&returnGeometry=false&f=json',
        ua: BROWSER_UA,
        read: (body) => {
            const j = JSON.parse(body);
            if (j.error) return { err: j.error.message ?? 'arcgis error' };
            const a = (j.features ?? [])[0]?.attributes;
            return { code: a ? `${a.clase}|${a.califi}|${a.origen}` : null, clase: a?.clase, califi: a?.califi, origen: a?.origen };
        },
        classify: ({ clase, califi, origen }) => {
            if (!califi) return { cat: 'nonBuildable', why: 'no calificación polygon at point' };
            const SU6 = ['CHP', 'ENS', 'EDA', 'UFA', 'TER', 'IND'];
            const base = String(califi).toUpperCase().slice(0, 3);
            if (String(clase).toUpperCase() !== 'SU' || !SU6.includes(base)) {
                return { cat: 'nonBuildable', why: `clase=${clase} califi=${califi} — outside Art. 6.3.1's six suelo-urbano buildable zones` };
            }
            if (/^PGOU/i.test(String(origen ?? ''))) {
                return { cat: 'no-pack', why: 'PGOU-ordered, but Arts. 6.18.2/6.19.1 key every parameter to Plano C, which the city does not publish as data' };
            }
            return { cat: 'refusal-delegated', why: `expressly delegated to a derived instrument (origen=${origen})` };
        },
    },

    // ⚠ CÓRDOBA IS A PREFETCH+LOCAL-PIP ADAPTER, and that is forced by the publisher, not chosen.
    // COACo's GeoServer stores `coaco:ordenanzas` in EPSG:25830 and **ignores a bbox tagged
    // EPSG:4326 in either axis order** — measured: 0 features both ways, HTTP 200, no exception.
    // `srsName=EPSG:4326` DOES reproject the OUTPUT, so the whole layer (453 polygons) is fetched
    // once in WGS84 and point-in-polygon is done locally. R1 deviation, stated: the spatial join is
    // ours here, not the server's. It cannot catch a defect in COACo's own indexing.
    cordoba: {
        ine: '14021', name: 'CORDOBA',
        service: 'geoserver.pgou.coacordoba.org WFS coaco:ordenanzas (453 polygons prefetched in EPSG:4326) · field link',
        prefetch: async () => {
            const r = await get('https://geoserver.pgou.coacordoba.org/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature'
                + '&typeNames=coaco:ordenanzas&outputFormat=application/json&count=2000&srsName=EPSG:4326');
            if (r.outcome !== 'ok') throw new Error(`Córdoba prefetch failed: ${r.message}`);
            const j = JSON.parse(r.body);
            const polys = [];
            for (const f of j.features ?? []) {
                const g = f.geometry;
                const rings = g?.type === 'MultiPolygon' ? g.coordinates.flat() : g?.type === 'Polygon' ? g.coordinates : [];
                for (const ring of rings) {
                    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
                    for (const [x, y] of ring) {
                        if (x < minx) minx = x; if (x > maxx) maxx = x;
                        if (y < miny) miny = y; if (y > maxy) maxy = y;
                    }
                    polys.push({ ring, bbox: [minx, miny, maxx, maxy], props: f.properties });
                }
            }
            return { polys, count: j.features?.length ?? 0 };
        },
        queryLocal: (lat, lon, ctx) => {
            for (const p of ctx.polys) {
                if (lon < p.bbox[0] || lon > p.bbox[2] || lat < p.bbox[1] || lat > p.bbox[3]) continue;
                let inside = false;
                const r = p.ring;
                for (let i = 0, jj = r.length - 1; i < r.length; jj = i++) {
                    const [xi, yi] = r[i], [xj, yj] = r[jj];
                    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
                }
                if (inside) return { code: p.props?.link ?? p.props?.ordenanza ?? null, raw: p.props };
            }
            return { code: null };
        },
        classify: ({ code }) => {
            // 95.1 % of Córdoba's urban land has NO vectorised calificación at all (69 of 77 GMU CUS
            // sheets un-vectorised) — a `no-plan-at-point` refusal ships, but it names PRYZM's gap,
            // not a governing article, so it is `no-pack`, never a cited refusal.
            if (!code) return { cat: 'no-pack', why: 'outside the 2-district COACo pilot — no machine-readable calificación exists (blocker 22)' };
            const c = String(code).toUpperCase();
            if (/UAS1/.test(c)) return { cat: 'no-pack', why: 'publisher serves a 69-byte dead page for O_UAS1' };
            if (/MC/.test(c)) return { cat: 'no-pack', why: 'Manzana Cerrada — per-street-width height table (Art. 13.5.3.1) unresolved' };
            if (/EP|COMERC/.test(c)) return { cat: 'refusal-terminal', why: 'Elemento protegido Art. 13.3 / Uso Comercial Art. 13.12.2' };
            return { cat: 'no-pack', why: 'pilot ordenanza packed, but the signature (blocker 2) and resolver call (blocker 3) are both outstanding — nothing renders' };
        },
    },
};

/** Resolve one parcel. Never throws; transport failures stay their own value. */
async function resolveParcel(cfg, p, ctx) {
    let v;
    try {
        if (cfg.queryLocal) {
            v = cfg.queryLocal(p.lat, p.lon, ctx);
        } else if (cfg.multi) {
            const urls = cfg.queries(p.lat, p.lon);
            const bodies = {};
            for (const [k, u] of Object.entries(urls)) {
                const r = await get(u, { ua: cfg.ua });
                if (r.outcome !== 'ok') return { outcome: r.outcome, message: `${k}: ${r.message}` };
                bodies[k] = r.body;
            }
            v = cfg.readMulti(bodies);
        } else {
            const r = await get(cfg.query(p.lat, p.lon), { ua: cfg.ua });
            if (r.outcome !== 'ok') return { outcome: r.outcome, message: r.message };
            v = cfg.read(r.body);
        }
    } catch (e) { return { outcome: 'parse-error', message: (e?.message ?? String(e)).slice(0, 200) }; }
    if (v.err) return { outcome: 'service-error', message: v.err };
    const c = cfg.classify(v, ctx?.M);
    return { outcome: 'ok', code: v.code ?? null, ...c };
}

export async function measure(cityKey, { n = 300, seed = 20260802, log = console.log } = {}) {
    const cfg = CITIES[cityKey];
    if (!cfg) throw new Error(`unknown city ${cityKey}`);
    const frame = await buildFrame(cfg.ine, cfg.name);
    if (!frame.ok) return { ok: false, city: cityKey, reason: frame.reason, message: frame.message };
    // URBAN parcels only — see the note in the report: including rustic parcels is the single
    // easiest way to inflate Determination Coverage (Lugo would gain 79 pp for free).
    const urban = frame.parcels.filter((p) => !/^\d{5}[A-Z]\d{3}/.test(p.ref));
    const sample = drawUniform(urban, n, seed);
    log(`[${cityKey}] population ${frame.parcelCount} (urban ${urban.length}) → sampling ${sample.length} @ seed ${seed}`);

    // Context: the production Murcia classifier, and any per-city prefetch.
    const ctx = { M: await import('../murcia-coverage-crosstab/classify.mjs') };
    if (cfg.prefetch) {
        const pre = await cfg.prefetch();
        Object.assign(ctx, pre);
        log(`[${cityKey}] prefetched ${pre.count} zoning features → ${pre.polys.length} rings`);
    }

    const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    const failures = {};
    const rows = [];
    const inheritedApplied = {};
    let done = 0;
    for (const p of sample) {
        const r = await resolveParcel(cfg, p, ctx);
        done++;
        if (r.outcome !== 'ok') {
            failures[r.outcome] = (failures[r.outcome] ?? 0) + 1;
            rows.push({ ref: p.ref, lat: p.lat, lon: p.lon, outcome: r.outcome, message: r.message });
        } else {
            let cat = r.cat, why = r.why;
            if (r.inherited) {
                // Deterministic split by a hash of the parcel ref: reproducible, and applies the
                // city's own MEASURED rate rather than inventing a per-parcel answer.
                const h = [...p.ref].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) / 4294967296;
                inheritedApplied[r.inherited.key] = (inheritedApplied[r.inherited.key] ?? 0) + 1;
                if (h >= r.inherited.envelopeRate) { cat = r.inherited.elseCat; why = r.inherited.elseWhy; }
            }
            counts[cat] += 1;
            rows.push({ ref: p.ref, lat: p.lat, lon: p.lon, code: r.code, cat, why, inherited: r.inherited?.key ?? null });
        }
        if (done % 50 === 0) log(`[${cityKey}] ${done}/${sample.length}`);
    }

    const assessed = CATEGORIES.reduce((s, c) => s + counts[c], 0);
    const buildable = assessed - counts.nonBuildable;
    const envelope = counts.envelope;
    const refusal = counts['refusal-terminal'] + counts['refusal-delegated'] + counts['refusal-external'];
    return {
        ok: true, city: cityKey, ine: cfg.ine, service: cfg.service,
        measuredAt: new Date().toISOString(), seed, requested: n,
        parcelPopulationTotal: frame.parcelCount,
        parcelPopulationUrban: urban.length,
        sampled: sample.length, assessed, transportFailures: failures,
        counts,
        denominatorPrivateBuildableParcels: buildable,
        pct: {
            ofBuildable: buildable === 0 ? null : {
                envelope: envelope / buildable,
                refusalTerminal: counts['refusal-terminal'] / buildable,
                refusalDelegated: counts['refusal-delegated'] / buildable,
                refusalExternal: counts['refusal-external'] / buildable,
                refusalTotal: refusal / buildable,
                determination: (envelope + refusal) / buildable,
                noPack: counts['no-pack'] / buildable,
            },
            ofAllUrbanParcels: assessed === 0 ? null : {
                envelope: envelope / assessed,
                refusalTotal: refusal / assessed,
                determination: (envelope + refusal) / assessed,
                noPack: counts['no-pack'] / assessed,
                nonBuildable: counts.nonBuildable / assessed,
            },
        },
        inheritedApplied,
        rows,
    };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
    const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
    const only = arg('--city');
    const n = Number(arg('--n', '300'));
    const seed = Number(arg('--seed', '20260802'));
    const keys = only ? [only] : Object.keys(CITIES);
    const outDir = join(HERE, 'out');
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    for (const k of keys) {
        const rec = await measure(k, { n, seed });
        writeFileSync(join(outDir, `${k}.determination.json`), JSON.stringify(rec, null, 1));
        if (!rec.ok) { console.log(`✗ ${k}: ${rec.reason} — ${rec.message}`); continue; }
        const b = rec.pct.ofBuildable;
        if (!b) {
            console.log(`⚠ ${k}: ZERO private-buildable parcels in the sample — counts ${JSON.stringify(rec.counts)}, failures ${JSON.stringify(rec.transportFailures)}. Not a score; investigate before believing it.`);
            continue;
        }
        console.log(`▶ ${k}: buildable-parcel N=${rec.denominatorPrivateBuildableParcels}`
            + `  DETERMINATION ${(b.determination * 100).toFixed(1)}% = envelope ${(b.envelope * 100).toFixed(1)}% + refusal ${(b.refusalTotal * 100).toFixed(1)}%`
            + `  | no-pack ${(b.noPack * 100).toFixed(1)}%  | nonBuildable ${rec.counts.nonBuildable}  | failures ${JSON.stringify(rec.transportFailures)}`);
    }
    console.log(`\nupstream requests: ${_reqs}`);
}
