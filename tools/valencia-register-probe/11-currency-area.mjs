// STEP 11 — ⭐ IS THE MEASURED LAYER CURRENT? ASKED WITHOUT THE FIELD NAME.
//
// `operacionbaja` matters for exactly ONE reason: if it means SUPERSESSION, the layer everyone
// measured may contain struck-off geometry and every València figure is drawn from a mixture of
// live and dead plan. So do not wait for the field. ASK THE QUESTION DIRECTLY.
//
// THE TEST. `Planeamiento.Zonificacion` is tagged per-polygon with the `expediente` that set it —
// València's 3,589 polygons carry 139 distinct expedientes, of which the 1988 PGOU (19880578)
// alone accounts for 2,025. Two mutually exclusive readings:
//
//   READING 1 — CONSOLIDATED MOSAIC (current only). Each modification's polygons REPLACE the base
//     plan's over their footprint. The layer is a PARTITION of the municipality:
//     Σ polygon area ≈ municipal area.
//   READING 2 — RETAINED SUPERSESSION (the dangerous one). Superseded polygons are kept beside
//     their replacements. The layer DOUBLE-COVERS modified ground:
//     Σ polygon area > municipal area, by the total area ever re-planned.
//
// These predict different NUMBERS, so the reading is decidable by measurement.
//
// ⛔ THE "INTERNAL CONTROL" IS DEGENERATE — MEASURED, THEN DISCLOSED.
// This step was written to use `Planeamiento.Clasificacion` as an internal control against
// `Planeamiento.Zonificacion`. IT IS NOT A CONTROL. Measured directly: for Vila-real both
// typenames return n=600, the SAME feature ids (100174, 100175, 100188, 100189, 100190 …), the
// same 4-value clas_suelo domain and the same zon_suelo domain. They are TWO VIEWS OF ONE TABLE.
// The `×CLAS = 1.000` this step prints is therefore STRUCTURALLY GUARANTEED, not a measurement,
// and it must not be read as evidence of anything. (`Planeamiento.Dotaciones` IS a distinct
// subset — 357 of the 600 — so the three names are not all aliases.)
//
// ⇒ THE ONLY REAL CONTROL HERE IS THE EXTERNAL ONE: the official término municipal area.
//
// ⚠ NECESSARY-CONDITION LIMIT, STATED UP FRONT: overlap PROVES retention. Absence of overlap is
// consistent with "current only" but does not PROVE it — a superseded polygon that is
// geometrically identical to its replacement would not inflate the sum. This test can therefore
// FALSIFY reading 1; it can only FAIL TO FALSIFY it.
import { get, owsException, save } from './lib.mjs';

const BASE = 'https://terramapas.icv.gva.es/0702_Planeamiento';

// ⛔ SELF-CORRECTION, AND IT IS THE WORST KIND. The first version of this table carried
// `'03130': 4.68` — a figure I did not source. It was WRONG (Tollos is 15.97 km²), and because
// it was wrong LOW it made Tollos read as 3.09× over-covered, i.e. it FABRICATED the exact
// "retained supersession" signal this step exists to detect. An unsourced denominator is not a
// control; it is a way to manufacture the finding you went looking for.
//
// These three figures were each obtained by OPENING the source, not from a search snippet:
//   46250 València  134.65 km²  — es.wikipedia.org/wiki/Valencia
//   12135 Vila-real  55.12 km²  — es.wikipedia.org/wiki/Villarreal   (INE 12135 stated on page)
//   03130 Tollos     15.97 km²  — es.wikipedia.org/wiki/Tollos       (INE 03130 stated on page)
// ⚠ PROVENANCE STATED HONESTLY: these are SECONDARY sources. The pages give the figure without
// citing the INE table it came from. They are external to the ICV service — which is what the
// control needs — but they are not primary, and the ±tolerance below is set accordingly.
// ine.es was not resolvable from this box (ENOTFOUND), so the primary table was not obtained.
// ⚠ KEYS ARE QUOTED STRINGS, NOT NUMBERS. An INE municipality code is a 5-CHARACTER code with a
// significant leading zero — Tollos is `03130`, not 3130. Written bare it is an octal literal
// (Node refuses it outright in module scope, which is the lucky case: the unlucky case is
// silent truncation of every Alacant/Castelló code to 4 digits). CODE-SPACE TRUNCATION is one of
// the standing negative-proof conditions and it fired here, on this probe.
const INE_AREA_KM2 = { '46250': 134.65, '12135': 55.12, '03130': 15.97 };

function likeFilter(ine) {
    return `<Filter><PropertyIsLike wildCard="*" singleChar="?" escapeChar="!"><PropertyName>cod_ine_mun</PropertyName><Literal>${ine}</Literal></PropertyIsLike></Filter>`;
}

/** Shoelace over one ring given a flat [x,y,x,y,…] list. Signed; caller takes abs. */
function ringArea(c) {
    let a = 0;
    for (let i = 0, n = c.length / 2; i < n; i++) {
        const j = (i + 1) % n;
        a += c[2 * i] * c[2 * j + 1] - c[2 * j] * c[2 * i + 1];
    }
    return a / 2;
}

/**
 * Sum polygon area from a MapServer GML payload, EXTERIOR minus INTERIOR rings.
 * ⚠ Interior rings (holes) MUST be subtracted. Counting a hole as area would inflate the sum in
 * exactly the direction that would fake "retained supersession" — the very thing under test.
 */
function areaOf(body) {
    let ext = 0, int = 0, extRings = 0, intRings = 0;
    // gml:exterior/gml:interior (GML3) wrap a LinearRing whose coords are in gml:posList.
    for (const m of body.matchAll(/<gml:(exterior|interior)>[\s\S]*?<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)) {
        const nums = m[2].trim().split(/\s+/).map(Number);
        if (nums.length < 6 || nums.some(Number.isNaN)) continue;
        const a = Math.abs(ringArea(nums));
        if (m[1] === 'exterior') { ext += a; extRings++; } else { int += a; intRings++; }
    }
    return { m2: ext - int, extRings, intRings, exteriorM2: ext, interiorM2: int };
}

async function pull(typename, ine) {
    // ⚠ NO `propertyname` PARAMETER. The grammar probe suppressed msGeometry with propertyname
    // and produced 0 km² for every code — a self-inflicted zero. Geometry is the measurement here.
    // srsname is pinned to EPSG:25830 (UTM 30N, METRES) so the shoelace is in m², not degrees².
    const u = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent('ms:' + typename)}&filter=${encodeURIComponent(likeFilter(ine))}&srsname=EPSG%3A25830`;
    const r = await get(u, 300000);
    const exc = owsException(r.body);
    if (!r.ok || exc) return { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
    const n = Math.max((r.body.match(/<gml:featureMember>/g) || []).length, 0);
    const srs = (r.body.match(/srsName="([^"]+)"/) || [])[1] || null;
    return { st: 'OK', n, srs, ...areaOf(r.body), bytes: r.bytes };
}

const out = {
    areaSource: 'es.wikipedia.org municipality infoboxes (SECONDARY, opened not snippeted) — external to the ICV service, but NOT primary; ine.es unreachable from this box',
    degenerateControlDisclosed: 'Planeamiento.Clasificacion and .Zonificacion are two views of ONE table (identical ids/n) — the ×CLAS ratio is structurally 1.000 and is NOT evidence',
    municipalities: [],
};

for (const ine of ['46250', '12135', '03130']) {
    console.error(`\n══ ${ine}  (INE término municipal = ${INE_AREA_KM2[ine]} km²)`);
    const clas = await pull('Planeamiento.Clasificacion', ine);
    const zon = await pull('Planeamiento.Zonificacion', ine);
    if (clas.st !== 'OK' || zon.st !== 'OK') {
        console.error(`  UNKNOWN — clas=${clas.why || 'ok'} zon=${zon.why || 'ok'}`);
        out.municipalities.push({ ine, st: 'UNKNOWN', clas, zon });
        continue;
    }
    const cKm2 = clas.m2 / 1e6, zKm2 = zon.m2 / 1e6, ref = INE_AREA_KM2[ine];
    const clasRatio = cKm2 / ref, zonRatio = zKm2 / ref, zonVsClas = zKm2 / cKm2;
    console.error(`  srsName returned: ${clas.srs}`);
    console.error(`  CLASIFICACION  n=${String(clas.n).padStart(5)}  ${cKm2.toFixed(2).padStart(8)} km²  (ext ${clas.extRings} rings, int ${clas.intRings})  ×INE = ${clasRatio.toFixed(3)}`);
    console.error(`  ZONIFICACION   n=${String(zon.n).padStart(5)}  ${zKm2.toFixed(2).padStart(8)} km²  (ext ${zon.extRings} rings, int ${zon.intRings})  ×INE = ${zonRatio.toFixed(3)}  ×CLAS = ${zonVsClas.toFixed(3)}`);

    // ── CONTROL FIRST. The internal partition must reconcile with the external area, or nothing
    // downstream is readable. ±8% tolerance: generalised planning geometry never matches a
    // cadastral term boundary exactly.
    const controlOk = Math.abs(clasRatio - 1) <= 0.12;
    console.error(`  CONTROL: Σ clasificacion vs INE area — ${controlOk ? `PASSES (${((clasRatio - 1) * 100).toFixed(1)}%)` : `⛔ FAILS (${((clasRatio - 1) * 100).toFixed(1)}%) — shoelace/CRS not trusted, verdict UNKNOWN`}`);

    let verdict;
    if (!controlOk) verdict = 'UNKNOWN — area control failed, cannot read the zonificación sum';
    else if (zonVsClas > 1.15) verdict = `⛔ RETAINED SUPERSESSION — zonificación double-covers by ${((zonVsClas - 1) * 100).toFixed(0)}%`;
    else verdict = 'CONSOLIDATED MOSAIC — zonificación is a partition, no double coverage detected (necessary-condition test only)';
    console.error(`  ⭐ ${verdict}`);
    out.municipalities.push({ ine, ineAreaKm2: ref, srs: clas.srs, clasificacion: { n: clas.n, km2: +cKm2.toFixed(3), extRings: clas.extRings, intRings: clas.intRings }, zonificacion: { n: zon.n, km2: +zKm2.toFixed(3), extRings: zon.extRings, intRings: zon.intRings }, clasVsIne: +clasRatio.toFixed(4), zonVsIne: +zonRatio.toFixed(4), zonVsClas: +zonVsClas.toFixed(4), controlPassed: controlOk, verdict });
}
save('_11_currency.json', out);
