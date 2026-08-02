// STEP 5 — ⭐ THE DENOMINATOR. Split the 6.83% buildable land into PRIVATE DEVELOPABLE and
// PUBLIC / SYSTEMS.
//
// WHY THIS STEP EXISTS: on Balears this split moved the answer TWENTY POINTS — 32.55% of
// buildable land was road, public open space and infrastructure, which has NO private envelope
// at ANY data completeness. Reporting "envelope % of buildable land" without it overstates the
// prize by whatever that share is.
//
// THE SEPARATOR, established from primary data not assumed: `dotacion` / `dot_descri` on
// ms:Planeamiento.Zonificacion. Opened for València capital (3,589 polygons, 31 distinct
// values): `PV`/`SV` = zonas verdes, `PQ*`/`SQ*` = equipamiento (docente, sanitario, deportivo,
// administrativo, infraestructuras), `PC*`/`SC*` = comunicaciones — red viaria and ferrocarril
// explicitly labelled "(dominio público)". A NULL `dotacion` is zoned land that is not a public
// system. That is exactly the Balears split.
//
// ⛔ msGeometry MUST BE NAMED EXPLICITLY in `propertyname`. Naming attributes without it is
// precisely the mechanism that SUPPRESSES geometry and made a prior run report 0 km² for every
// code — a zero manufactured by the query, not a fact about the data.
//
// CONTROL: the region-wide total must reproduce the prior probe's independent area census
// (23,275 km² over the same 542 municipalities). That is an EXTERNAL check on this pull — not
// a `Clasificacion`-vs-`Zonificacion` self-comparison, which is two views of one table and
// therefore structurally guaranteed to agree.
import { wfsUrl, likeFilter, get, owsException, featureArea, save, load, pool, pct } from './lib.mjs';

const MUNIS = load('_01_urlabs.json').municipalities;
const TN = 'ms:Planeamiento.Zonificacion';
const PRIOR_CENSUS_KM2 = 23275;   // tools/valencia-grammar-probe/_10_area.json, mode=census, 542 munis

const URBAN = new Set(['ZUR-RE', 'ZUR-NHT', 'ZUR-TR', 'ZUR-IN']);              // SU
const URBANISABLE = new Set(['ZND-RE', 'ZND-IN', 'ZND-TR']);                    // SUZ
const INDUSTRIAL = new Set(['ZUR-IN', 'ZND-IN']);
const BUILDABLE = new Set([...URBAN, ...URBANISABLE]);

async function one(m) {
    const u = wfsUrl({
        typename: TN, filter: likeFilter(m.ine),
        propertyname: 'msGeometry,zon_suelo,clas_suelo,dotacion,dot_descri',
    });
    const r = await get(u, 300000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { ine: m.ine, st: 'UNKNOWN', why: (exc || r.http || r.err).toString().slice(0, 80) };
    const chunks = r.body.split('<gml:featureMember>').slice(1);
    const byKey = {};
    let wrongMuni = 0;
    for (const c of chunks) {
        const code = (c.match(/<ms:zon_suelo>([^<]*)<\/ms:zon_suelo>/) || [])[1] ?? '__ABSENT__';
        const dot = (c.match(/<ms:dotacion>([^<]*)<\/ms:dotacion>/) || [])[1] || '';
        const key = `${code}|${dot ? dot : '∅'}`;
        byKey[key] = (byKey[key] || 0) + featureArea(c);
    }
    return { ine: m.ine, st: 'OK', polygons: chunks.length, wrongMuni, byKey: Object.fromEntries(Object.entries(byKey).map(([k, v]) => [k, Math.round(v)])) };
}

const t0 = Date.now();
const rows = await pool(MUNIS, 3, one, (done, total) => {
    if (done % 25 === 0 || done === total) {
        const el = (Date.now() - t0) / 1000;
        console.error(`  ${done}/${total}  ${el.toFixed(0)}s  eta ${((el / done) * (total - done)).toFixed(0)}s`);
    }
});

const failed = rows.filter((r) => r.st !== 'OK');
console.error(`\nfailed=${failed.length} ${failed.map((f) => f.ine + ':' + f.why).slice(0, 10).join(' ')}`);

// ── AGGREGATE ────────────────────────────────────────────────────────────────
const areaByKey = new Map();
for (const r of rows) {
    if (r.st !== 'OK') continue;
    for (const [k, v] of Object.entries(r.byKey)) areaByKey.set(k, (areaByKey.get(k) || 0) + v);
}
let total = 0, buildable = 0, buildablePublic = 0, buildablePrivate = 0;
const byCode = {};
for (const [k, v] of areaByKey) {
    const [code, dot] = k.split('|');
    total += v;
    byCode[code] ??= { total: 0, public: 0, private: 0, dotKinds: {} };
    byCode[code].total += v;
    const isPublic = dot !== '∅';
    if (isPublic) { byCode[code].public += v; byCode[code].dotKinds[dot] = (byCode[code].dotKinds[dot] || 0) + Math.round(v); }
    else byCode[code].private += v;
    if (BUILDABLE.has(code)) {
        buildable += v;
        if (isPublic) buildablePublic += v; else buildablePrivate += v;
    }
}

const km2 = (x) => +(x / 1e6).toFixed(2);
const control = { priorCensusKm2: PRIOR_CENSUS_KM2, thisRunKm2: km2(total), ratio: +(total / 1e6 / PRIOR_CENSUS_KM2).toFixed(4) };
console.error(`\n⭐ EXTERNAL CONTROL: this run ${control.thisRunKm2} km² vs prior independent census ${PRIOR_CENSUS_KM2} km² → ×${control.ratio}`);

// families inside buildable
function fam(codes) {
    let t = 0, pub = 0, priv = 0;
    for (const c of codes) { const b = byCode[c]; if (!b) continue; t += b.total; pub += b.public; priv += b.private; }
    return { km2: km2(t), publicKm2: km2(pub), privateKm2: km2(priv), pctOfBuildable: pct(t, buildable), privatePctOfBuildable: pct(priv, buildable) };
}

const out = {
    control,
    totals: {
        regionKm2: km2(total),
        buildableKm2: km2(buildable),
        buildablePctOfRegion: pct(buildable, total),
        buildablePublicKm2: km2(buildablePublic),
        buildablePrivateKm2: km2(buildablePrivate),
        publicPctOfBuildable: pct(buildablePublic, buildable),
        privatePctOfBuildable: pct(buildablePrivate, buildable),
        privatePctOfRegion: pct(buildablePrivate, total),
    },
    families: {
        URBAN_SU: fam([...URBAN]),
        URBANISABLE_SUZ: fam([...URBANISABLE]),
        INDUSTRIAL: fam([...INDUSTRIAL]),
        RESIDENTIAL_NHT_TR: fam(['ZUR-RE', 'ZUR-NHT', 'ZUR-TR', 'ZND-RE', 'ZND-TR']),
    },
    byCode: Object.fromEntries(Object.entries(byCode).sort((a, b) => b[1].total - a[1].total).map(([c, b]) => [c, {
        km2: km2(b.total), publicKm2: km2(b.public), privateKm2: km2(b.private),
        publicPct: pct(b.public, b.total),
        topDot: Object.entries(b.dotKinds).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k}:${km2(v)}km2`),
    }])),
    failed: failed.map((f) => ({ ine: f.ine, why: f.why })),
    perMuni: rows,
};

console.error(`\n── BUILDABLE LAND (SU + SUZ), area-weighted, 542-municipality census ──`);
console.error(`   buildable          ${out.totals.buildableKm2} km²  = ${out.totals.buildablePctOfRegion}% of region`);
console.error(`   ├ PUBLIC/SYSTEMS   ${out.totals.buildablePublicKm2} km²  = ${out.totals.publicPctOfBuildable}% of buildable`);
console.error(`   └ PRIVATE DEVELOP. ${out.totals.buildablePrivateKm2} km²  = ${out.totals.privatePctOfBuildable}% of buildable (${out.totals.privatePctOfRegion}% of region)`);
for (const [k, v] of Object.entries(out.families)) console.error(`   ${k.padEnd(20)} ${String(v.km2).padStart(9)} km²  private ${String(v.privateKm2).padStart(9)} km² = ${v.privatePctOfBuildable}% of buildable`);
save('_05_denominator.json', out);
