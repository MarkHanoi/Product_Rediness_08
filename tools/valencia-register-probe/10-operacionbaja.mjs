// STEP 10 — ⭐ RESOLVE `operacionbaja`. THIS CAN INVALIDATE EVERYTHING.
//
// THE CLAIM: a field `operacionbaja` exists on València planning data and is "91% non-null".
// THE PRIOR FINDING: it does NOT exist on any of the 6 typenames of `0702_Planeamiento`, and the
// 91% figure exists only in prose. Its REFERENT IS UNKNOWN.
//
// ⭐ WHY IT MATTERS: if `operacionbaja` means SUPERSESSION — a record struck off the register —
// then every figure measured on this service may be drawn from SUPERSEDED geometry, and none of
// the rest matters. So the question is not only "where does the field live" but "IS THE LAYER WE
// MEASURED CURRENT".
//
// ⛔ ALREADY ELIMINATED, DO NOT RE-DERIVE: there is NO INSPIRE provenance on this service, so
// `endLifeSpan` is not it.
//
// This step attacks it three ways, all against live endpoints:
//   A. Widen the SERVICE surface — the prior run looked at ONE service. Enumerate the ICV
//      terramapas services and DescribeFeatureType every planning-ish layer.
//   B. Dump the FULL FIELD UNION and match on the STEM, not the compound. A regex that does not
//      match is not an absent field: `operacionbaja` may be stored as `op_baja`, `f_baja`,
//      `baja`, `fbaja`, `situacion`… Search for `baja`/`alta`/`vigen`/`derog`/`sustit` anywhere.
//   C. Ask the CURRENCY question directly and independently of the field name: does the service
//      carry superseded records at all? Test by counting OVERLAPPING zonificación polygons for
//      one municipality with many expedientes — a register that keeps superseded geometry
//      alongside current geometry must overlap itself.
import { get, owsException, save, likeFilter, wfsUrl, parseFeatures } from './lib.mjs';

const out = { A_services: [], B_fieldUnion: null, C_currency: null };

// ── A. SERVICE SURFACE ───────────────────────────────────────────────────────
// The prior run measured ONE service. `operacionbaja` may live on a sibling. The ICV numbering
// scheme is `NNNN_Name`; probe the neighbourhood plus the documented planning/cadastral ones.
const CANDIDATES = [
    '0702_Planeamiento', '0701_Planeamiento', '0703_Planeamiento', '0704_Planeamiento',
    '0700_Planeamiento', '0702_Planeamiento_Historico', '0705_Planeamiento',
    '07_Planeamiento', 'Planeamiento', '0201_Catastro', '0801_Urbanismo',
];
console.error('── A. SERVICE SURFACE');
for (const s of CANDIDATES) {
    const u = `https://terramapas.icv.gva.es/${s}?SERVICE=WFS&REQUEST=GetCapabilities&VERSION=1.1.0`;
    const r = await get(u, 45000);
    const exc = owsException(r.body);
    // ⚠ SELF-INFLICTED ZERO, CORRECTED. The first version filtered layer names to those
    // containing ':' — on the assumption capabilities would carry the `ms:` prefix. It does NOT:
    // MapServer publishes bare `<Name>Planeamiento.Zonificacion</Name>` and the `ms:` prefix is
    // only required on the REQUEST. That filter returned 0 layers and therefore a 0-field union,
    // which would have been reported as "operacionbaja absent from a surface I never looked at".
    // A ZERO MUST BE EXPLAINED BEFORE IT IS REPORTED, INCLUDING WHEN THE PROBE CAUSED IT.
    const names = [...r.body.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    const isWfs = /WFS_Capabilities/.test(r.body);
    console.error(`  ${s.padEnd(30)} http=${String(r.http ?? r.err).padEnd(6)} wfs=${isWfs} layers=${names.length} ${exc ? 'exc=' + exc.slice(0, 60) : ''}`);
    if (names.length) console.error(`      ${names.join(', ')}`);
    out.A_services.push({ service: s, http: r.http ?? null, err: r.err ?? null, isWfs, layers: names, exception: exc });
}

// ── B. FULL FIELD UNION ──────────────────────────────────────────────────────
// ⛔ DUMP FIRST, MATCH SECOND. The grammar probe reported "FAR absent from every schema" and was
// WRONG because `edif_m2` did not match its /far|coef|edificabilidad/ pattern. So: every field
// name on every reachable layer goes into one list, and the list is printed IN FULL.
console.error('\n── B. FULL FIELD UNION across every reachable layer');
const union = new Map(); // field -> [typenames]
for (const svc of out.A_services.filter((s) => s.isWfs && s.layers.length)) {
    for (const tn of svc.layers) {
        const u = `https://terramapas.icv.gva.es/${svc.service}?service=WFS&version=1.1.0&request=DescribeFeatureType&typename=${encodeURIComponent('ms:' + tn)}`;
        const r = await get(u, 45000);
        if (!r.ok) { console.error(`  ⛔ ${tn}: HTTP ${r.http ?? r.err}`); continue; }
        const fields = [...r.body.matchAll(/<(?:xsd:)?element\s+name="([^"]+)"/g)].map((m) => m[1]);
        for (const f of fields) {
            if (!union.has(f)) union.set(f, []);
            union.get(f).push(`${svc.service}/${tn}`);
        }
        console.error(`  ${tn.padEnd(42)} ${fields.length} fields`);
    }
}
const all = [...union.keys()].sort();
console.error(`\n  UNION = ${all.length} distinct field names:`);
console.error(`  ${all.join(' · ')}`);

// STEM matching, not compound matching.
const STEMS = { baja: /baja/i, alta: /alta/i, operacion: /operac/i, vigen: /vigen/i, derog: /derog|anul|nul/i, sustit: /sustit|supers|reempl/i, fecha: /^f_|fecha|_f$/i, estado: /estado|situac|status/i };
const stemHits = {};
for (const [k, re] of Object.entries(STEMS)) stemHits[k] = all.filter((f) => re.test(f));
console.error('\n  STEM MATCHES (the anti-"regex-that-does-not-match" check):');
for (const [k, v] of Object.entries(stemHits)) console.error(`    ${k.padEnd(10)} ${v.length ? v.join(', ') : '— none —'}`);
const exact = all.filter((f) => /^operacion[_ ]?baja$/i.test(f));
console.error(`\n  ⭐ EXACT \`operacionbaja\` (any separator/case): ${exact.length ? exact.join(', ') : 'ABSENT from every reachable layer'}`);
out.B_fieldUnion = { distinctFields: all.length, fields: all, byField: Object.fromEntries(union), stemHits, exactMatches: exact };

// ── C. THE CURRENCY QUESTION, ASKED WITHOUT THE FIELD NAME ───────────────────
// ⭐ THIS IS THE PART THAT ACTUALLY MATTERS. Whatever `operacionbaja` turns out to be, the
// decision-relevant question is: DOES `Planeamiento.Zonificacion` CONTAIN SUPERSEDED GEOMETRY?
//
// A register that retains struck-off records alongside live ones MUST OVERLAP ITSELF: the same
// ground would be covered by both the old expediente's polygon and the new one's. A register
// that holds only the CURRENT consolidated picture is a partition — one zoning polygon per
// point. So: count distinct expedientes per municipality, and test whether the zonificación
// polygons of one municipality double-cover any ground.
//
// ⚠ This is a NECESSARY-CONDITION test, not a sufficient one. Overlap proves retention; ABSENCE
// of overlap is consistent with "current only" but does not prove it (a superseded polygon could
// be geometrically identical to its replacement). The result is reported with that limit stated.
console.error('\n── C. IS THE MEASURED LAYER CURRENT? (asked geometrically, not by field name)');
const TN = 'ms:Planeamiento.Zonificacion';
const cur = { municipalities: [] };
for (const ine of ['46250', '12135', '03130']) {
    const u = wfsUrl({ typename: TN, filter: likeFilter(ine), maxfeatures: null, propertyname: 'cod_ine_mun,expediente,zon_suelo,clas_suelo,denominaci' });
    const r = await get(u, 240000);
    if (!r.ok || owsException(r.body)) { cur.municipalities.push({ ine, st: 'UNKNOWN', why: owsException(r.body) || r.http }); continue; }
    const f = parseFeatures(r.body);
    const exps = new Map();
    for (const x of f) exps.set(x.expediente, (exps.get(x.expediente) || 0) + 1);
    const wrong = f.filter((x) => x.cod_ine_mun !== ine).length;
    console.error(`  ${ine}: polygons=${f.length} wrongMuni=${wrong} distinctExpedientes=${exps.size}`);
    console.error(`      expediente histogram: ${JSON.stringify([...exps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12))}`);
    cur.municipalities.push({ ine, st: 'OK', polygons: f.length, wrongMuni: wrong, distinctExpedientes: exps.size, expedienteHistogram: [...exps.entries()].sort((a, b) => b[1] - a[1]) });
}
out.C_currency = cur;
save('_10_operacionbaja.json', out);
