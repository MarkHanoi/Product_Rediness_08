// STEP 7 — `InventarioSuSuz`: A PARAMETER WITHOUT A GRAMMAR.
//
// ⛔ FAR ALONE IS A VOLUME, NOT A SHAPE. It says how many square metres may be built; it says
// nothing about where the footprint sits, how far it stands off the boundary, or how tall it
// goes. Infinitely many envelopes satisfy any given FAR. So this is reported as ITS OWN TIER and
// is NEVER added to the envelope count. It is included because it is real and it is large, and
// because a reader who is told only "0% envelope" would wrongly conclude "no data".
//
// The prior probe established the attribute side: 8,446 sectors, FAR derivable on 87.40%,
// median 0.574, and ZERO-AS-NULL CONFIRMED BY CONTRADICTION (3 sectors carry sup_m2 == 0 with
// edif_m2 > 0, which is impossible if 0 meant "zero square metres"). This step adds the thing
// that was missing: HOW MUCH LAND, measured geometrically, so the tier can be stated as a share
// of the same buildable-land denominator as everything else rather than as a sector count.
//
// ⛔ TWO INDEPENDENT AREAS, DELIBERATELY. `sup_m2` is a DECLARED attribute; the polygon is
// MEASURED. Reporting only the declared figure would leave a systematic error undetectable, so
// both are computed and their ratio is printed. They are not assumed to agree.
import { wfsUrl, likeFilter, get, owsException, featureArea, save, load, pool, pct } from './lib.mjs';

const MUNIS = load('_01_urlabs.json').municipalities;
const TN = 'ms:InventarioSuSuz';

// Filter gate, both halves, on THIS typename — the gate was established on Zonificacion and
// does not transfer for free.
const neg = await get(wfsUrl({ typename: TN, filter: likeFilter('28079'), maxfeatures: 50 }), 120000);
const negN = (neg.body.match(/<gml:featureMember>/g) || []).length;
const hits = await get(wfsUrl({ typename: TN, hits: true }), 180000);
const totalHits = Number((hits.body.match(/numberOfFeatures="(\d+)"/) || [])[1]) || null;
console.error(`GATE negative Madrid 28079 → ${negN} features ${negN === 0 ? 'CLEAN' : '⛔ FILTER NOT APPLIED'}`);
console.error(`resultType=hits → ${totalHits} sectors region-wide`);

async function one(m) {
    const u = wfsUrl({ typename: TN, filter: likeFilter(m.ine), propertyname: 'msGeometry,clasificacion,uso,sup_m2,edif_m2,ord_porm,situacion' });
    const r = await get(u, 300000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { ine: m.ine, st: 'UNKNOWN', why: (exc || r.http || r.err).toString().slice(0, 60) };
    const chunks = r.body.split('<gml:featureMember>').slice(1);
    const rows = [];
    for (const c of chunks) {
        const g = (f) => (c.match(new RegExp(`<ms:${f}>([^<]*)</ms:${f}>`)) || [])[1] ?? null;
        rows.push({
            clas: g('clasificacion'), uso: g('uso'), ordPorm: g('ord_porm'),
            sup: Number(g('sup_m2')) || 0, edif: Number(g('edif_m2')) || 0,
            geomArea: featureArea(c),
        });
    }
    return { ine: m.ine, st: 'OK', n: rows.length, rows };
}

const t0 = Date.now();
const res = await pool(MUNIS, 3, one, (d, t) => { if (d % 50 === 0 || d === t) console.error(`  ${d}/${t}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); });
const failed = res.filter((r) => r.st !== 'OK');
const all = res.filter((r) => r.st === 'OK').flatMap((r) => r.rows.map((x) => ({ ...x, ine: r.ine })));
console.error(`\nsectors pulled ${all.length}  (hits said ${totalHits}) ${all.length === totalHits ? 'RECONCILED' : '⚠ MISMATCH — explain before reporting'}  failed municipalities ${failed.length}`);

// ── FAR derivability, AREA-weighted ──────────────────────────────────────────
// ⚠ ZERO IS NULL HERE, and that is not an assumption: 3 sectors carry sup_m2 == 0 together with
// edif_m2 > 0. A sector with genuinely zero surface cannot have positive buildable floorspace,
// so 0 is a missing-value sentinel, not a measurement. Sectors with sup == 0 or edif == 0 are
// therefore NOT-DERIVABLE, not "FAR = 0".
const derivable = all.filter((s) => s.sup > 0 && s.edif > 0);
const geomTotal = all.reduce((a, b) => a + b.geomArea, 0);
const geomDeriv = derivable.reduce((a, b) => a + b.geomArea, 0);
const declTotal = all.reduce((a, b) => a + b.sup, 0);
const declDeriv = derivable.reduce((a, b) => a + b.sup, 0);

const fars = derivable.map((s) => s.edif / s.sup).sort((a, b) => a - b);
const q = (p) => +fars[Math.floor(p * (fars.length - 1))].toFixed(3);

// ⭐ THE SAME DENOMINATOR AS EVERY OTHER SHARE IN THIS PROBE. Not a new one.
const den = load('_05_denominator.json').totals;

const byUso = {};
for (const s of all) {
    byUso[s.uso || '∅'] ??= { n: 0, geom: 0, derivN: 0, derivGeom: 0 };
    const b = byUso[s.uso || '∅'];
    b.n++; b.geom += s.geomArea;
    if (s.sup > 0 && s.edif > 0) { b.derivN++; b.derivGeom += s.geomArea; }
}

const km2 = (x) => +(x / 1e6).toFixed(2);
const out = {
    gate: { negativeN: negN, clean: negN === 0 }, hits: totalHits, pulled: all.length,
    reconciled: all.length === totalHits, failedMunicipalities: failed.map((f) => f.ine),
    sectors: all.length,
    derivableSectors: derivable.length, derivablePctByCount: pct(derivable.length, all.length),
    area: {
        measuredKm2: km2(geomTotal), declaredKm2: km2(declTotal),
        measuredVsDeclared: +(geomTotal / declTotal).toFixed(4),
        derivableMeasuredKm2: km2(geomDeriv), derivablePctByArea: pct(geomDeriv, geomTotal),
        derivableDeclaredKm2: km2(declDeriv), derivablePctByDeclaredArea: pct(declDeriv, declTotal),
    },
    // ⛔ STATE THE WEIGHTING ON EVERY SHARE — polygon- and area-weighting disagreed 7× earlier
    // in this corpus, so a bare percentage is not a result.
    farOnlyTier: {
        ofBuildableLand_areaWeighted: pct(geomDeriv, den.buildableKm2 * 1e6),
        ofPrivateDevelopable_areaWeighted: pct(geomDeriv, den.buildablePrivateKm2 * 1e6),
        note: 'DOES NOT DRAW — a ratio without a footprint rule or a height is a volume, not a shape.',
    },
    farQuantiles: { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) },
    byUso: Object.fromEntries(Object.entries(byUso).map(([k, b]) => [k, { sectors: b.n, km2: km2(b.geom), derivableSectors: b.derivN, derivableKm2: km2(b.derivGeom), derivablePctByArea: pct(b.derivGeom, b.geom) }])),
};
console.error(`\n── FAR TIER (does NOT draw) ──`);
console.error(`   sectors ${all.length}, FAR derivable ${derivable.length} = ${out.derivablePctByCount}% by COUNT`);
console.error(`   measured ${out.area.measuredKm2} km² vs declared sup_m2 ${out.area.declaredKm2} km² → ×${out.area.measuredVsDeclared}`);
console.error(`   FAR-derivable AREA ${out.area.derivableMeasuredKm2} km² = ${out.area.derivablePctByArea}% of sector area`);
console.error(`   ⇒ ${out.farOnlyTier.ofBuildableLand_areaWeighted}% of BUILDABLE land · ${out.farOnlyTier.ofPrivateDevelopable_areaWeighted}% of PRIVATE DEVELOPABLE land (area-weighted)`);
console.error(`   FAR median ${out.farQuantiles.p50}  (p05 ${out.farQuantiles.p05} … p95 ${out.farQuantiles.p95})`);
for (const [k, b] of Object.entries(out.byUso)) console.error(`   ${k.padEnd(14)} ${String(b.km2).padStart(8)} km²  derivable ${String(b.derivableKm2).padStart(8)} km² = ${b.derivablePctByArea}%`);
save('_07_far_tier.json', out);
