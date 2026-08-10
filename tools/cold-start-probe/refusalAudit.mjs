#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// REFUSAL AUDIT — COLD START PROBE
//
// THE QUESTION: for a parcel that PRYZM refuses with a cited article, does that article actually
// terminate THAT parcel? Refusal correctness has been ASSERTED and never MEASURED, and
// Determination Coverage = Envelope % + Refusal % is gameable by refusing.
//
// METHOD (stated so it can be disputed and re-run):
//   • SEEDED uniform-over-AREA draw inside each city's canonical terrain.mjs bbox. Uniform over a
//     rectangle ⇒ area-weighted by construction; no per-polygon bias.
//   • Each point is resolved by the LIVE municipal zoning service, with the SAME query shape the
//     production proxy issues (server/*Proxy.js), so this is not a re-implementation of the chain.
//   • Rejection sampling: points that land outside the municipality, on non-buildable land, or on a
//     slice that is NOT `not-determined` are recorded and discarded from the refusal sample.
//   • THREE OUTCOMES, KEPT APART (PROBE-DISCIPLINE R5): correct · incorrect · unverifiable.
//     A 403/499/timeout/network error is UNVERIFIABLE. Never "incorrect", never "correct".
//
// WHAT THIS CHECK CANNOT SEE (R7), stated up front:
//   • It cannot detect an article that is correctly cited but MIS-TRANSCRIBED upstream of the pack.
//     Article text is checked against the committed corpus PDFs where they exist (BCN/MAD/MUR);
//     Córdoba and València have no in-repo corpus, so their article check is weaker evidence.
//   • It samples LAND, not user sessions. A slice that is measured as `not-determined` but which the
//     SHIPPED runtime never reaches is flagged separately (the `shipped` field), not folded in.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, politeGet } from '../city-completion/parcelSampleProbe.mjs';
import { calificacionFamily, delegationGround, GROUND_ARTICLE, CODE_PACKED_EXACT } from '../murcia-coverage-crosstab/classify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SEED = 20260802;
export const TARGET = 30;
export const MAX_DRAWS = 700;

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const wanted = arg('--city', null);
const target = Number(arg('--n', String(TARGET)));

// ─────────────────────────────────────────────────────────────────────────────
// LIVE SERVICES — hosts + query shapes lifted from the PRODUCTION proxies.
// ─────────────────────────────────────────────────────────────────────────────
const BCN_MS = 'https://geoportal.amb.cat/geoserveis/rest/services/qualificacio_refos_3857/MapServer';
const MAD_NZ = 'https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0/query';
const MUR_WFS = 'https://geoserver.murcia.es/geoserver/wfs';
const VLC_MS = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/231/query';
const COR_WFS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';

const esriPoint = (lon, lat) => encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));

async function esriIdentify(base, lon, lat, outFields, where) {
    const url = `${base}?geometry=${esriPoint(lon, lat)}&geometryType=esriGeometryPoint&inSR=4326`
        + `&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(outFields)}`
        + (where ? `&where=${encodeURIComponent(where)}` : '&where=1%3D1')
        + `&returnGeometry=false&outSR=4326&f=json`;
    const r = await politeGet(url, { timeoutMs: 45_000, accept: 'application/json' });
    if (r.outcome !== 'ok') return { fail: r.message ?? r.outcome, status: r.status };
    let j; try { j = JSON.parse(r.body); } catch { return { fail: 'non-json' }; }
    if (j?.error) return { fail: `esri-error ${j.error.code}: ${j.error.message}` };
    return { features: (j.features ?? []).map((f) => f.attributes ?? {}) };
}

/** WFS point-intersect via a tiny bbox, EXPLICIT urn axis order — the murciaPgouProxy contract. */
async function wfsPoint(endpoint, typeName, lon, lat, half = 0.00005) {
    const bbox = `${(lat - half).toFixed(7)},${(lon - half).toFixed(7)},${(lat + half).toFixed(7)},${(lon + half).toFixed(7)},urn:ogc:def:crs:EPSG::4326`;
    const url = `${endpoint}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(typeName)}`
        + `&bbox=${encodeURIComponent(bbox)}&srsName=EPSG:4326&outputFormat=${encodeURIComponent('application/json')}&count=10`;
    const r = await politeGet(url, { timeoutMs: 45_000, accept: 'application/json' });
    if (r.outcome !== 'ok') return { fail: r.message ?? r.outcome, status: r.status };
    let j; try { j = JSON.parse(r.body); } catch { return { fail: 'non-json' }; }
    return { features: (j.features ?? []).map((f) => f.properties ?? {}) };
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-CITY SLICE MAPS — read off the measurement records, VERBATIM.
// ─────────────────────────────────────────────────────────────────────────────

/** Barcelona: the six `not-determined` slices of barcelona.measurements.json. */
const BCN_REFUSAL = {
    '18': { article: 'Art. 306 PGM', slice: '18 — cited Art. 306 refusal (73.6 % of clau 18)' },
    '22a': { article: 'Art. 350.1 PGM', slice: '22a — cited Art. 350.1 refusal' },
    '22@': { article: 'Art. 8.1 MPGM 22@', slice: '22@ — permanent cited derived-plan refusal' },
    '12b': { article: 'Arts. 320.3a / 320.2a PGM', slice: '12b — permanent cited derived-plan refusal' },
    '20a': { article: 'Arts. 314.5 / 338.2 / 339 PGM', slice: 'bare 20a — cited regime-undetermined refusal' },
    '15': { article: 'derived plan / verd privat protegit', slice: 'tail' },
    '16': { article: 'derived plan / verd privat protegit', slice: 'tail' },
    '17/5': { article: 'derived plan', slice: 'tail' }, '17/6': { article: 'derived plan', slice: 'tail' },
    '17/7': { article: 'derived plan', slice: 'tail' },
    '14a': { article: 'derived plan', slice: 'tail' }, '14b': { article: 'derived plan', slice: 'tail' },
    '8a': { article: 'verd privat protegit', slice: 'tail' },
};
/** The claus that are NOT refusals: the packed/envelope-bearing slices. */
const BCN_ENVELOPE = new Set(['13a', '13b', '12', '20a/5', '20a/8', '20a/9', '20a/9b', '20a/9u', '20a/10', '20a/11', '20a/12']);

const CITIES = {
    barcelona: {
        bbox: [2.09, 41.32, 2.23, 41.47], seedOffset: 1,
        async resolve(lon, lat) {
            const qu = await esriIdentify(`${BCN_MS}/16/query`, lon, lat, 'CLAU_URB,CODI_INE', "CODI_INE='08019'");
            if (qu.fail) return { unverifiable: qu.fail };
            if (!qu.features.length) return { skip: 'outside-08019-or-no-qualificacio' };
            const clau = String(qu.features[0].CLAU_URB ?? '').trim();
            if (!clau) return { skip: 'empty-clau' };
            if (BCN_ENVELOPE.has(clau)) return { skip: `envelope-slice:${clau}` };
            const ref = BCN_REFUSAL[clau];
            if (!ref) return { skip: `not-in-any-slice:${clau}` };
            const out = { zone: clau, article: ref.article, slice: ref.slice, attrs: qu.features[0] };
            // ⚠ clau 18 splits 26.4 % (OV footprint published ⇒ envelope) / 73.6 % (Art. 306 refusal).
            // The ONLY way to know which side a point is on is to ask layer 17, which is what the
            // production `bcnRefosOVProvider` does. So we ask it.
            if (clau === '18') {
                const ov = await esriIdentify(`${BCN_MS}/17/query`, lon, lat, 'CLAU,PLANTES,EXP', "CODI_INE='08019'");
                if (ov.fail) { out.ovProbe = { unverifiable: ov.fail }; }
                else if (ov.features.length) {
                    out.ovProbe = { hit: true, plantes: ov.features[0].PLANTES ?? null, exp: ov.features[0].EXP ?? null };
                } else out.ovProbe = { hit: false };
            }
            return out;
        },
    },
    madrid: {
        bbox: [-3.80, 40.33, -3.58, 40.52], seedOffset: 2,
        async resolve(lon, lat) {
            const r = await esriIdentify(MAD_NZ, lon, lat, 'AMB_TX_ETIQ,OBJECTID', null);
            if (r.fail) return { unverifiable: r.fail };
            if (!r.features.length) return { skip: 'no-norma-zonal-at-point' };
            const nz = String(r.features[0].AMB_TX_ETIQ ?? '').trim();
            if (!nz) return { skip: 'empty-AMB_TX_ETIQ' };
            const isNZ3 = /^(NZ\s*)?3\b/i.test(nz) || /norma\s*zonal\s*3/i.test(nz) || nz === '3';
            if (!isNZ3) return { skip: `not-nz3:${nz}` };
            return {
                zone: nz, article: 'Art. 8.3.1 PGOUM-97 (contested against Art. 8.3.5)',
                slice: 'NZ 3 Volumetría Específica — not-determined', attrs: r.features[0],
            };
        },
    },
    murcia: {
        bbox: [-1.2007, 37.9322, -1.0607, 38.0522], seedOffset: 3,
        async resolve(lon, lat) {
            const cal = await wfsPoint(MUR_WFS, 'Murcia:pgou_alineaciones', lon, lat);
            if (cal.fail) return { unverifiable: `calificacion: ${cal.fail}` };
            if (!cal.features.length) return { skip: 'no-calificacion-at-point' };
            const live = cal.features.filter((f) => !f.f_fin);
            const f = (live[0] ?? cal.features[0]);
            const raw = String(f.calificacion ?? '').trim();
            const fam = calificacionFamily(raw);
            if (!fam) return { skip: `not-private-buildable:${raw}` };
            const sec = await wfsPoint(MUR_WFS, 'Murcia:pgou_sectores', lon, lat);
            if (sec.fail) return { unverifiable: `sector: ${sec.fail}` };
            const s = (sec.features.filter((x) => !x.f_fin)[0] ?? sec.features[0]);
            const sector = String(s?.sector ?? f.sector ?? '').trim();
            const claseSuelo = s ? String(s.clase_suelo ?? '') : undefined;
            const prefix = (sector.match(/^[A-Z]+/) ?? [null])[0];
            const ground = delegationGround(fam, prefix, claseSuelo);
            if (!ground) return { skip: `pgou-direct:${fam}/${sector || '-'}` };
            return {
                zone: `${raw} (family ${fam})`, article: GROUND_ARTICLE[ground],
                slice: 'legally delegated to a derived instrument (67 %)',
                attrs: { calificacion: raw, family: fam, sector, claseSuelo, ground, packedExact: CODE_PACKED_EXACT.includes(raw.toUpperCase()) },
            };
        },
    },
    valencia: {
        bbox: [-0.43, 39.40, -0.30, 39.52], seedOffset: 4,
        async resolve(lon, lat) {
            const r = await esriIdentify(VLC_MS, lon, lat, 'califi,tipoca,origen,clase', null);
            if (r.fail) return { unverifiable: r.fail };
            if (!r.features.length) return { skip: 'no-calificacion-at-point' };
            const a = r.features[0];
            const califi = String(a.califi ?? '').trim();
            const origen = String(a.origen ?? '').trim();
            const clase = String(a.clase ?? '').trim();
            const base = califi.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
            const SIX = ['CHP', 'ENS', 'EDA', 'UFA', 'TER', 'IND'];
            if (!SIX.includes(base)) return { skip: `not-in-Art-6.3.1-six:${califi}` };
            if (clase && clase.toUpperCase() !== 'SU') return { skip: `not-suelo-urbano:${clase}` };
            if (/^PGOU/i.test(origen)) return { skip: `PGOU-ordered(no-pack):${origen}` };
            return {
                zone: `${califi} · origen=${origen}`, article: `derived instrument «${origen}»`,
                slice: 'legally delegated to a derived instrument (36.40 %)', attrs: a,
            };
        },
    },
    cordoba: {
        // ⚠ CÓRDOBA IS SAMPLED DIFFERENTLY AND THE REASON IS STATED: its `not-determined` slices are
        // 2.962 pp of SUELO URBANO and live ENTIRELY inside the 2-district COACo pilot. A uniform
        // draw over the municipal bbox would return ~1 refusal in 35 draws. So the draw is uniform
        // over the PILOT bbox (`coaco:distritos`), which is the smallest rectangle that contains the
        // whole population of cited refusals — still uniform-over-area, just over a tighter frame.
        // Two rectangles = the two published `coaco:distritos` extents (measured live 2026-08-02:
        // Sur [-4.7898,37.8557,-4.7684,37.8786] · Noroeste [-4.8091,37.8838,-4.7812,37.8983]),
        // drawn area-weighted between them so the union draw stays uniform-over-area.
        rects: [[-4.7898, 37.8557, -4.7684, 37.8786], [-4.8091, 37.8838, -4.7812, 37.8983]],
        bbox: [-4.8091, 37.8557, -4.7684, 37.8983], seedOffset: 5,
        async resolve(lon, lat) {
            const ord = await wfsPoint(COR_WFS, 'coaco:ordenanzas', lon, lat, 0.00008);
            if (ord.fail) return { unverifiable: `ordenanzas: ${ord.fail}` };
            const ug = await wfsPoint(COR_WFS, 'coaco:usos_globales', lon, lat, 0.00008);
            if (ug.fail) return { unverifiable: `usos_globales: ${ug.fail}` };
            if (!ord.features.length && !ug.features.length) return { skip: 'outside-pilot-vector-coverage' };
            const o = ord.features[0] ?? null;
            const u = ug.features[0] ?? null;
            const link = String(o?.link ?? '').trim();
            const ordenanza = String(o?.ordenanza ?? '').trim();
            const uso = String(u?.tipo ?? '').trim();
            const LUCRATIVE = /residencial|industrial|terciario/i;
            // ⚠ `coaco:ordenanzas` carries NO `actuacion` column (measured 2026-08-02: the schema is
            // ordenanza·et·sup_m2·link). The delegation is a SPATIAL JOIN against `coaco:actuaciones`,
            // exactly as the measurement record's "728 522.65 m² delegated" derivation describes.
            const ac = await wfsPoint(COR_WFS, 'coaco:actuaciones', lon, lat, 0.00008);
            if (ac.fail) return { unverifiable: `actuaciones: ${ac.fail}` };
            const a = ac.features[0] ?? null;
            const instrumento = String(a?.instrumento ?? '').trim();
            const DELEGATING_INSTRUMENT = /plan parcial|plan especial|peri|estudio de detalle|reforma interior/i;
            const isCampoVerdad = /campo de la verdad|CTP1/i.test(ordenanza) || /CTP1/i.test(link);
            const isProtegido = /protegid/i.test(ordenanza) || /O_EP/i.test(link);
            const isComercial = /comercial/i.test(ordenanza) || /O_UC/i.test(link);
            if (u && LUCRATIVE.test(uso) && String(u.actuacion ?? '').trim()) {
                return {
                    zone: `usos_globales «${uso}» · actuacion=${u.actuacion}`,
                    article: `derived instrument via actuación ${u.actuacion}${instrumento ? ` (${instrumento})` : ''}`,
                    slice: '`usos_globales` lucrative — 48 of 48 carrying an `actuacion`',
                    attrs: { ...(u ?? {}), joinedActuacion: a ?? null },
                };
            }
            if (o && a && DELEGATING_INSTRUMENT.test(instrumento)) {
                return {
                    zone: `${ordenanza} · actuacion=${a.actuacion}`,
                    article: `${instrumento} (cited delegation; ficha=${a.ficha} doc=${a.doc})`,
                    slice: 'pilot ordenanza DELEGATED to a Plan Parcial / PE / PERI / ED',
                    attrs: { ...(o ?? {}), joinedActuacion: a },
                };
            }
            if (o && (isCampoVerdad || isProtegido || isComercial)) {
                return {
                    zone: ordenanza, slice: 'legally-grounded refusal (Campo de la Verdad / Elemento protegido / Uso Comercial)',
                    article: isCampoVerdad ? 'Art. 13.4.1 → Tomo VI' : isProtegido ? 'Art. 13.3' : 'Art. 13.12.2',
                    attrs: { ...(o ?? {}), joinedActuacion: a ?? null },
                };
            }
            return { skip: `pilot-not-a-cited-refusal:${ordenanza || uso || 'unknown'}${a ? `|actuacion=${a.actuacion}(${instrumento})` : ''}` };
        },
    },
};

// ─────────────────────────────────────────────────────────────────────────────
async function runCity(name) {
    const cfg = CITIES[name];
    const rnd = mulberry32(SEED + cfg.seedOffset);
    const rects = cfg.rects ?? [cfg.bbox];
    const areas = rects.map(([w, s, e, n]) => (e - w) * (n - s));
    const areaTot = areas.reduce((a, b) => a + b, 0);
    const samples = [], skipped = [], failures = [];
    let draws = 0;
    while (samples.length < target && draws < MAX_DRAWS) {
        draws++;
        let pick = rnd() * areaTot, ri = 0;
        while (ri < rects.length - 1 && pick > areas[ri]) { pick -= areas[ri]; ri++; }
        const [w, s, e, n] = rects[ri];
        const lon = w + rnd() * (e - w);
        const lat = s + rnd() * (n - s);
        const r = await cfg.resolve(lon, lat);
        if (r.unverifiable) { failures.push({ draw: draws, lon, lat, reason: r.unverifiable }); continue; }
        if (r.skip) { skipped.push({ draw: draws, lon, lat, reason: r.skip }); continue; }
        samples.push({ id: `${name}-${samples.length + 1}`, draw: draws, lon: +lon.toFixed(7), lat: +lat.toFixed(7), ...r });
        process.stderr.write(`  ${name} ${samples.length}/${target} (draw ${draws}) ${r.zone}\n`);
    }
    return { city: name, seed: SEED + cfg.seedOffset, bbox: cfg.bbox, draws, samples, skipped, failures };
}

const cities = wanted ? [wanted] : Object.keys(CITIES);
const out = {};
for (const c of cities) {
    process.stderr.write(`\n=== ${c} ===\n`);
    out[c] = await runCity(c);
    mkdirSync(HERE, { recursive: true });
    writeFileSync(join(HERE, 'refusal-audit.raw.json'), JSON.stringify(out, null, 2));
}
process.stderr.write('\nDONE\n');
for (const c of cities) {
    const r = out[c];
    process.stderr.write(`${c}: samples=${r.samples.length} draws=${r.draws} skipped=${r.skipped.length} failures=${r.failures.length}\n`);
}
