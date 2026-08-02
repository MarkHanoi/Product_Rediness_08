// STEP 7 — SCHEMA OF EVERY TYPENAME ON THE SERVICE (M3).
//
// Step 0 only described the three Planeamiento layers. The service also advertises
// InventarioSuSuz (the "Inventario de Suelo Urbano y Urbanizable" the brief flagged as a
// candidate INSTRUMENT-SELECTOR and "not in our corpus"), MinimizacionViviendasSNU and
// DeclaracionInteresComunitario. Those are the remaining places a PARAMETER could hide.
//
// Answers three M3 questions at field level, for the whole service:
//   - is there an `altura` field anywhere?
//   - is there an `operacionbaja` field anywhere?
//   - does BUILDABLE DEPTH (fondo / fondo edificable) appear anywhere?
// plus: are INSPIRE provenance fields (legalDocument/beginLifeSpan/endLifeSpan) present?
import { BASE, get, owsException, save } from './lib.mjs';

const TYPENAMES = [
    'ms:MinimizacionViviendasSNU',
    'ms:InventarioSuSuz',
    'ms:DeclaracionInteresComunitario',
    'ms:Planeamiento.Dotaciones',
    'ms:Planeamiento.Zonificacion',
    'ms:Planeamiento.Clasificacion',
];

// Parameter vocabulary we are hunting, in Castilian/Valencian planning usage.
const PARAM_PATTERNS = {
    altura: /altur|alcada|alçada|height|plantas|plantes|num_pl|npl/i,
    depth: /fondo|fons|profund|depth|edificable/i,
    far: /edificabilidad|edificabilitat|aprovech|coef|far|indice|index/i,
    occupancy: /ocupacion|ocupacio|occup/i,
    setback: /retranqueo|reculada|separacion/i,
    operacionbaja: /operacionbaja|operacion_baja|baja/i,
    inspire: /legaldocument|beginlifespan|endlifespan|inspire|validfrom|validto/i,
};

const out = {};
for (const tn of TYPENAMES) {
    const u = `${BASE}?service=WFS&version=1.1.0&request=DescribeFeatureType&typename=${encodeURIComponent(tn)}`;
    const r = await get(u, 120000);
    const exc = owsException(r.body);
    if (!r.ok || exc) {
        out[tn] = { st: 'UNKNOWN', why: exc || `HTTP ${r.http ?? r.err}` };
        console.error(`${tn}: UNKNOWN ${out[tn].why}`);
        continue;
    }
    const fields = [...r.body.matchAll(/<element\s+([^>]*)\/>/g)]
        .map((m) => ({
            name: (m[1].match(/name="([^"]+)"/) || [])[1],
            type: (m[1].match(/type="([^"]+)"/) || [])[1],
        }))
        .filter((f) => f.name && f.name !== 'msGeometry' && !f.type?.includes('Type'));
    const hits = {};
    for (const [k, re] of Object.entries(PARAM_PATTERNS)) {
        const m = fields.filter((f) => re.test(f.name)).map((f) => f.name);
        if (m.length) hits[k] = m;
    }
    out[tn] = { st: 'OK', nFields: fields.length, fields: fields.map((f) => f.name), paramHits: hits };
    console.error(`\n${tn}  (${fields.length} fields)`);
    console.error(`  ${fields.map((f) => f.name).join(', ')}`);
    console.error(`  PARAM HITS: ${Object.keys(hits).length ? JSON.stringify(hits) : 'NONE'}`);
}

save('_07_schemas_all.json', out);

const all = Object.values(out).filter((v) => v.st === 'OK');
const union = [...new Set(all.flatMap((v) => v.fields))];
const anyHit = (k) => all.some((v) => v.paramHits?.[k]);
console.error(`\n=== SERVICE-WIDE (union of ${union.length} distinct field names across ${all.length} typenames) ===`);
for (const k of Object.keys(PARAM_PATTERNS))
    console.error(`  ${k.padEnd(14)}: ${anyHit(k) ? 'PRESENT' : 'ABSENT from every declared schema'}`);
console.error(`\nUNION: ${union.join(', ')}`);
