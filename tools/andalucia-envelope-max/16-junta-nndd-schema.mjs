// §ANDALUCIA-ENVELOPE-MAX / step 16 — THE MANDATED REGIONAL SCHEMA, READ FROM THE OFFICIAL FILE.
//
// ⭐ THE PREDICTION UNDER TEST: Andalucía's Orden de 18-feb-2026 (Normas Directoras, BOJA 37,
// in force for instruments not initially approved by 24 April 2026) mandates a spatial-data schema
// that carries EDIF_* + DENS AND NO altura — i.e. BULK WITHOUT HEIGHT, a `P` failure at height
// specifically. ⚠ TEST IT, DO NOT ASSUME IT.
//
// ⛔ AND REPORT TWO NUMBERS, NEVER ONE. The mandate is FORWARD-ONLY, so SCHEMA SCOPE (what the
// standard defines) and CORPUS SERVED (what any endpoint actually returns today) are independent.
// A rich schema with an empty corpus is worth 0 % of envelope and must not be reported as coverage.
//
// Source of truth = the official normalised template ZIP linked from the Junta's own page, opened
// and read here. Not a summary, not a press note. The .gpkg inside is a SQLite database; its
// gpkg_contents + column definitions are the schema.
import { writeFileSync, mkdirSync } from 'node:fs';
import { UA } from './lib.mjs';
import zlib from 'node:zlib';

const ZIP = 'https://www.juntadeandalucia.es/sites/default/files/inline-files/2026/07/2026.07.31_Plantilla_NNDD.zip';
const r = await fetch(ZIP, { headers: UA });
const buf = Buffer.from(await r.arrayBuffer());
console.log(`plantilla ZIP: HTTP ${r.status} ${buf.length} bytes`);
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });

// --- minimal ZIP reader (central directory) ---
function readZip(b) {
    let eocd = -1;
    for (let i = b.length - 22; i >= 0 && i > b.length - 70000; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('no EOCD');
    const n = b.readUInt16LE(eocd + 10), cdOff = b.readUInt32LE(eocd + 16);
    const entries = []; let p = cdOff;
    for (let i = 0; i < n; i++) {
        if (b.readUInt32LE(p) !== 0x02014b50) break;
        const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), usize = b.readUInt32LE(p + 24);
        const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
        const lho = b.readUInt32LE(p + 42);
        const name = b.subarray(p + 46, p + 46 + nl).toString('utf8');
        entries.push({ name, method, csize, usize, lho });
        p += 46 + nl + el + cl;
    }
    return entries;
}
function extract(b, e) {
    const nl = b.readUInt16LE(e.lho + 26), el = b.readUInt16LE(e.lho + 28);
    const start = e.lho + 30 + nl + el;
    const raw = b.subarray(start, start + e.csize);
    return e.method === 0 ? raw : zlib.inflateRawSync(raw);
}
const entries = readZip(buf);
console.log(`\nZIP contents (${entries.length} entries):`);
for (const e of entries) console.log(`  ${String(e.usize).padStart(10)}B  ${e.name}`);

const out = { measuredAt: new Date().toISOString(), source: ZIP, zipStatus: r.status, zipBytes: buf.length, entries: entries.map(e => ({ name: e.name, bytes: e.usize })), featureClasses: {} };

// --- GeoPackage = SQLite. Read the file header pages and pull CREATE TABLE statements from
//     sqlite_master, which lives in the b-tree pages as literal SQL text. ---
const HEIGHT = /\b(ALT|ALTU|ALTURA|HMAX|H_MAX|PLANT|NPLANT|N_PLANT|NUMPLANT|CORNISA)\b/i;
const gpkgs = entries.filter(e => /\.gpkg$/i.test(e.name));
for (const g of gpkgs) {
    const data = extract(buf, g);
    const s = data.toString('latin1');
    const creates = [...s.matchAll(/CREATE TABLE\s+"?([A-Za-z0-9_]+)"?\s*\(([^;]{0,4000}?)\)/g)]
        .map(m => ({ table: m[1], cols: m[2].split(',').map(c => c.trim().split(/\s+/)[0].replace(/"/g, '')).filter(c => /^[A-Za-z]/.test(c)) }));
    const userTables = creates.filter(c => !/^(gpkg_|sqlite_|rtree_|OGC)/i.test(c.table));
    out.featureClasses[g.name] = userTables;
    console.log(`\n=== ${g.name} — ${userTables.length} user feature classes ===`);
    for (const t of userTables) console.log(`  ${t.table.padEnd(18)} ${t.cols.join(' ')}`);
}

// --- THE TEST ---
const all = Object.values(out.featureClasses).flat();
const allCols = [...new Set(all.flatMap(t => t.cols))];
out.fieldUnionAcrossMandatedSchema = allCols.sort();
out.heightShapedFields = allCols.filter(c => HEIGHT.test(c));
out.bulkFields = allCols.filter(c => /^(EDIF|DENS|APROV|OCUP|SUP)/i.test(c));
out.zoningTables = all.filter(t => /ZSU|ZOU|CALIF|ORDEN|ZON/i.test(t.table)).map(t => t.table);
out.prediction = {
    claim: 'the mandated schema carries EDIF_* + DENS and NO altura -> a P failure at HEIGHT specifically',
    heightShapedFieldsFound: out.heightShapedFields,
    bulkFieldsFound: out.bulkFields,
    verdict: out.heightShapedFields.length === 0 && out.bulkFields.length > 0
        ? 'CONFIRMED — bulk without height. The regional standard normalises the RATIO layer and not the FORM layer, so no conforming dataset can ever yield an envelope HEIGHT.'
        : out.heightShapedFields.length > 0
            ? `REFUTED — the schema does carry height-shaped fields: ${out.heightShapedFields.join(', ')}`
            : 'INDETERMINATE — neither bulk nor height fields recovered; extraction may have failed, treat as UNKNOWN',
};
console.log('\n=== PREDICTION TEST ===');
console.log('height-shaped fields:', out.heightShapedFields.length ? out.heightShapedFields.join(', ') : 'NONE');
console.log('bulk fields         :', out.bulkFields.join(', ') || 'NONE');
console.log('VERDICT:', out.prediction.verdict);

writeFileSync(new URL('./out/16-junta-nndd-schema.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/16-junta-nndd-schema.json');
