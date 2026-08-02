// §ANDALUCIA-ENVELOPE-MAX / step 16b — FULL column list per mandated feature class.
// ⛔ Step 16's non-greedy CREATE TABLE regex stopped at the first ')' and truncated every column
// list. A REGEX THAT DOES NOT MATCH IS NOT AN ABSENT FIELD — and one that half-matches is worse,
// because it returns a plausible short list. Re-parse with balanced-paren scanning.
import { writeFileSync } from 'node:fs';
import { UA } from './lib.mjs';
import zlib from 'node:zlib';

const ZIP = 'https://www.juntadeandalucia.es/sites/default/files/inline-files/2026/07/2026.07.31_Plantilla_NNDD.zip';
const buf = Buffer.from(await (await fetch(ZIP, { headers: UA })).arrayBuffer());
function readZip(b) {
    let eocd = -1;
    for (let i = b.length - 22; i >= 0 && i > b.length - 70000; i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    const n = b.readUInt16LE(eocd + 10), cdOff = b.readUInt32LE(eocd + 16);
    const es = []; let p = cdOff;
    for (let i = 0; i < n; i++) {
        if (b.readUInt32LE(p) !== 0x02014b50) break;
        const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), usize = b.readUInt32LE(p + 24);
        const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), lho = b.readUInt32LE(p + 42);
        es.push({ name: b.subarray(p + 46, p + 46 + nl).toString('utf8'), method, csize, usize, lho });
        p += 46 + nl + el + cl;
    }
    return es;
}
const e = readZip(buf).find(x => /\.gpkg$/i.test(x.name));
const nl = buf.readUInt16LE(e.lho + 26), el = buf.readUInt16LE(e.lho + 28);
const start = e.lho + 30 + nl + el;
const data = e.method === 0 ? buf.subarray(start, start + e.csize) : zlib.inflateRawSync(buf.subarray(start, start + e.csize));
const s = data.toString('latin1');

// balanced-paren CREATE TABLE scan
const tables = new Map();
const re = /CREATE TABLE\s+"?([A-Za-z0-9_]+)"?\s*\(/g;
let m;
while ((m = re.exec(s))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < s.length && depth > 0) { const c = s[i]; if (c === '(') depth++; else if (c === ')') depth--; i++; }
    const body = s.slice(m.index + m[0].length, i - 1);
    // split on top-level commas
    const cols = []; let d = 0, cur = '';
    for (const c of body) { if (c === '(') d++; else if (c === ')') d--; if (c === ',' && d === 0) { cols.push(cur.trim()); cur = ''; } else cur += c; }
    if (cur.trim()) cols.push(cur.trim());
    const defs = cols.filter(c => !/^(CONSTRAINT|PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\b/i.test(c))
        .map(c => { const t = c.replace(/^"([^"]+)"/, '$1').split(/\s+/); return { name: t[0].replace(/"/g, ''), type: t[1] ?? '' }; });
    const prev = tables.get(m[1]);
    if (!prev || defs.length > prev.length) tables.set(m[1], defs);
}

const FEATURE = [...tables.entries()].filter(([t]) => /^INE_TIP_(FT|TR)_/i.test(t));
const CODELIST = [...tables.entries()].filter(([t]) => !/^(INE_TIP_|gpkg_|sqlite_|rtree_|ogr_)/i.test(t));

const out = { measuredAt: new Date().toISOString(), source: ZIP, featureClasses: {}, codeLists: {} };
console.log(`=== MANDATED FEATURE CLASSES (${FEATURE.length}) — Orden 18-feb-2026, Anexo 4 ===`);
for (const [t, cols] of FEATURE.sort()) {
    out.featureClasses[t] = cols;
    console.log(`\n${t}  (${cols.length} cols)`);
    console.log('   ' + cols.map(c => `${c.name}:${c.type}`).join('  '));
}
console.log(`\n=== CODE LISTS (${CODELIST.length}) ===`);
for (const [t, cols] of CODELIST.sort()) { out.codeLists[t] = cols; console.log(`  ${t.padEnd(16)} ${cols.map(c => c.name).join(' ')}`); }

// ---- THE PREDICTION TEST, on the full field union ----
const union = [...new Set(Object.values(out.featureClasses).flat().map(c => c.name))].sort();
out.fieldUnion = union;
const HEIGHT = /^(ALT|ALTU|ALTURA|H_?MAX|N_?PLANT|NUM_?PLANT|PLANT|CORNISA|RASANTE)/i;
const BULK = /^(EDIF|DENS|APROV|OCUP|SUP|COEF)/i;
const SETBACK = /^(RETRANQ|SEP|LIND|FONDO|ALIN)/i;
out.heightFields = union.filter(c => HEIGHT.test(c));
out.bulkFields = union.filter(c => BULK.test(c));
out.setbackFields = union.filter(c => SETBACK.test(c));
const zsu = out.featureClasses['INE_TIP_FT_OU_04_ZSU'] ?? [];
out.zoningClassOU_04_ZSU = zsu.map(c => c.name);
out.verdict = out.heightFields.length === 0 && out.bulkFields.length > 0
    ? '⭐ CONFIRMED — BULK WITHOUT HEIGHT. The mandated schema defines EDIF_*/DENS and defines NO height, no storey count, no setback and no depth. A dataset can be 100% conformant to the Andalusian standard and still be incapable of producing an envelope: the standard normalises the RATIO layer, not the FORM layer.'
    : out.heightFields.length > 0 ? `REFUTED — height-shaped fields exist in the mandated schema: ${out.heightFields.join(', ')}`
        : 'INDETERMINATE';
console.log('\n=== FIELD UNION ACROSS THE MANDATED SCHEMA ===');
console.log(union.join(' '));
console.log('\nOU_04_ZSU (the zoning class):', out.zoningClassOU_04_ZSU.join(' '));
console.log('HEIGHT-shaped :', out.heightFields.join(', ') || 'NONE');
console.log('BULK          :', out.bulkFields.join(', ') || 'NONE');
console.log('SETBACK/DEPTH :', out.setbackFields.join(', ') || 'NONE');
console.log('\nVERDICT:', out.verdict);
writeFileSync(new URL('./out/16b-nndd-full-columns.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('\nwrote out/16b-nndd-full-columns.json');
