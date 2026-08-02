// §ANDALUCIA-ENVELOPE-MAX / step 15 — IS CÓRDOBA'S `et` A HEIGHT?
//
// coaco:ordenanzas carries exactly four fields: ordenanza, et, sup_m2, link. `et` takes the values
// 1, 2, 4, "(II)", "2 (III)". Spanish planning writes NÚMERO DE PLANTAS in Roman numerals, so the
// hypothesis is: et = "<grade> (<plantas>)". If true, Córdoba serves a NORMATIVE HEIGHT after all
// and the envelope is not 0 %.
//
// ⛔ AN UNSOURCED DENOMINATOR IS NOT A CONTROL. Guessing a field's meaning from its value shape is
// exactly how a wrong number gets manufactured. So this does NOT assert; it TESTS, against an
// INDEPENDENT observable: Catastro's built storey count (vcatastro_urbanismo.max_plantas, which is
// OBSERVED reality, not the norm). A normative plantas cap should DOMINATE the built stock — most
// buildings at or below it, few above. A field that is not a height will show no such relation.
//
// Two-sided: a null result refutes the hypothesis and Córdoba stays at no served height.
import { getJson, isValid, pct } from './lib.mjs';
import { writeFileSync } from 'node:fs';

const GS = 'https://geoserver.pgou.coacordoba.org/geoserver/wfs';
const q = tn => `${GS}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${tn}&outputFormat=application/json&srsName=EPSG:25830&count=100000`;
const [ord, parc] = await Promise.all([
    getJson(q('coaco:ordenanzas'), { timeout: 180000 }),
    getJson(q('coaco:vcatastro_urbanismo'), { timeout: 300000 }),
]);
// ⛔ TRUNCATION CONTROL — returned must equal numberMatched, else every rate below is a fiction.
const trunc = {
    ordenanzas: { got: ord.json.features.length, matched: ord.json.numberMatched },
    parcels: { got: parc.json.features.length, matched: parc.json.numberMatched },
};
console.log('truncation control:', JSON.stringify(trunc));

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const parseEt = v => {
    if (!isValid(v)) return null;
    const s = String(v).trim();
    const rom = s.match(/\(([IVX]+)\)/);
    const ara = s.match(/^(\d+)/);
    return { raw: s, grade: ara ? Number(ara[1]) : null, plantasRoman: rom ? ROMAN[rom[1]] ?? null : null };
};

// ---- ring-based point-in-polygon so a parcel can be located inside an ordenanza polygon ----
const ringsOf = g => {
    if (!g) return [];
    const ps = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return ps.map(p => p[0]);
};
const bboxOf = rs => { let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; for (const r of rs) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const centroid = g => { const rs = ringsOf(g); if (!rs.length) return null; let sx = 0, sy = 0, n = 0; for (const [x, y] of rs[0]) { sx += x; sy += y; n++; } return n ? [sx / n, sy / n] : null; };

const ordPolys = ord.json.features.map(f => { const rs = ringsOf(f.geometry); return { p: f.properties, rs, bb: bboxOf(rs) }; }).filter(o => o.rs.length);

// ---- ROUTING BY GEOMETRY (independent of the publisher's attribute join) ----
let geomUnique = 0, geomMulti = 0, geomNone = 0, geomAgree = 0, geomDisagree = 0, attrPresent = 0;
const pairs = [];
for (const f of parc.json.features) {
    const c = centroid(f.geometry); if (!c) continue;
    const [x, y] = c;
    const hits = ordPolys.filter(o => x >= o.bb[0] && x <= o.bb[2] && y >= o.bb[1] && y <= o.bb[3] && o.rs.some(r => inRing(r, x, y)));
    const codes = [...new Set(hits.map(h => h.p.ordenanza))];
    if (codes.length === 0) geomNone++;
    else if (codes.length > 1) geomMulti++;
    else {
        geomUnique++;
        const et = parseEt(hits[0].p.et);
        const mp = Number(f.properties.max_plantas);
        if (isValid(f.properties.ordenanza)) { attrPresent++; if (String(f.properties.ordenanza) === String(codes[0])) geomAgree++; else geomDisagree++; }
        if (et && et.plantasRoman && Number.isFinite(mp) && mp > 0) pairs.push({ et: et.plantasRoman, built: mp, zone: codes[0] });
    }
}
const routing = {
    parcels: parc.json.features.length, geomUnique, geomMulti, geomNone,
    geometricUniqueAssignmentRate: pct(geomUnique, parc.json.features.length),
    crossCheckAgainstPublisherAttribute: { comparable: attrPresent, agree: geomAgree, disagree: geomDisagree, agreementRate: pct(geomAgree, attrPresent) },
};
console.log('\n=== ROUTING BY GEOMETRY (independent of the attribute join) ===');
console.log(JSON.stringify(routing, null, 2));

// ---- THE `et` TEST ----
const et = { distinct: {}, pairs: pairs.length, byEt: {} };
for (const f of ord.json.features) { const k = String(f.properties.et ?? '(null)'); et.distinct[k] = (et.distinct[k] ?? 0) + 1; }
for (const p of pairs) { const b = (et.byEt[p.et] ??= { n: 0, atOrBelow: 0, above: 0, builtSum: 0, max: 0 }); b.n++; b.builtSum += p.built; b.max = Math.max(b.max, p.built); if (p.built <= p.et) b.atOrBelow++; else b.above++; }
console.log('\n=== `et` VALUE SPACE ===', JSON.stringify(et.distinct));
console.log('\n=== `et` (Roman) vs CATASTRO BUILT max_plantas ===');
console.log(' et | n     | mean built | max built | built<=et | built>et | %<=et');
for (const k of Object.keys(et.byEt).sort((a, b) => a - b)) {
    const b = et.byEt[k];
    console.log(` ${String(k).padStart(2)} | ${String(b.n).padStart(5)} | ${(b.builtSum / b.n).toFixed(2).padStart(10)} | ${String(b.max).padStart(9)} | ${String(b.atOrBelow).padStart(9)} | ${String(b.above).padStart(8)} | ${String(pct(b.atOrBelow, b.n)).padStart(5)}%`);
}
const tot = Object.values(et.byEt).reduce((a, b) => ({ n: a.n + b.n, ok: a.ok + b.atOrBelow }), { n: 0, ok: 0 });
et.overallConsistency = pct(tot.ok, tot.n);
et.verdict = tot.n < 30 ? `INSUFFICIENT EVIDENCE — only ${tot.n} parcels carry both an et Roman numeral and a built storey count. UNKNOWN, never NO.`
    : et.overallConsistency >= 85 ? `SUPPORTED — ${et.overallConsistency}% of built stock is at or below the et Roman numeral, the signature of a normative cap.`
        : `REFUTED — only ${et.overallConsistency}% of built stock respects it; et is NOT a plantas cap. Córdoba serves NO normative height.`;
console.log('\nVERDICT:', et.verdict);

// how much of the ordenanza corpus even carries an et Roman numeral?
const withRoman = ord.json.features.filter(f => parseEt(f.properties.et)?.plantasRoman).length;
et.polygonsWithRomanNumeral = withRoman;
et.polygonCoverageOfRoman = pct(withRoman, ord.json.features.length);
let m2R = 0, m2A = 0;
for (const f of ord.json.features) { const a = Number(f.properties.sup_m2) || 0; m2A += a; if (parseEt(f.properties.et)?.plantasRoman) m2R += a; }
et.landWeightedCoverageOfRoman = pct(m2R, m2A);
console.log(`et carries a Roman plantas numeral on ${withRoman}/${ord.json.features.length} polygons = ${et.polygonCoverageOfRoman}% row-weighted, ${et.landWeightedCoverageOfRoman}% LAND-weighted`);

writeFileSync(new URL('./out/15-cordoba-et-hypothesis.json', import.meta.url), JSON.stringify({ measuredAt: new Date().toISOString(), truncationControl: trunc, routing, et, samplePairs: pairs.slice(0, 60) }, null, 2));
console.log('\nwrote out/15-cordoba-et-hypothesis.json');
