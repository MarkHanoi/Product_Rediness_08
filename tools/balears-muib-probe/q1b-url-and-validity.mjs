/**
 * Q1b - THE URL TRAP CHECK, plus VALID (not merely non-null) rates.
 *
 * ⛔ Valencia's `UrlLink` had 99% COVERAGE and TWENTY DISTINCT VALUES - register
 * homepages, not per-feature documents. Coverage alone fabricated a ~99% tier
 * estimate. So this probe ALWAYS reports coverage % AND distinct-value count.
 *
 * "VALID" here excludes NULL, empty string, whitespace-only, and the common
 * sentinel substitutes ('0','-','NULL','S/N','ND','SN'). Populated is not present.
 *
 * Run:  node tools/balears-muib-probe/q1b-url-and-validity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, distinct, sleep, EsriError } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

// Layers carrying a normativa URL and/or a plan code, per q1-schema.json.
const TARGETS = [
  { id: 6, name: 'SISTEMES', fields: ['URL', 'CODIPLA', 'CODIMUIB', 'CODIMUNI'] },
  { id: 8, name: 'GESTIO', fields: ['URL', 'CODIPLA', 'CODIMUIB', 'CODIMUNI', 'NOM'] },
  { id: 9, name: 'CATALEG', fields: ['URL', 'CODIPLA', 'CODIMUNI'] },
  { id: 10, name: 'QUALIFICACIONS', fields: ['URL', 'CODIPLA', 'CODIAJ', 'CODIMUIB', 'CODICLAS', 'CODIMUNI', 'OBS'] },
  { id: 11, name: 'CATEGORIES_RUSTIC', fields: ['URL', 'CODIPLA', 'CODIMUIB', 'CODICLAS', 'CODIMUNI', 'OBS'] },
  { id: 12, name: 'CLASSIFICACIO', fields: ['CODICLAS', 'CODIMUNI'] },
];

// ⚠ MEASURED CONSTRAINT: this backend REJECTS `TRIM()` and `LEN()` with an
// Esri 400 carried inside an HTTP 200. `CHAR_LENGTH()` is supported. So
// whitespace-only values are excluded by enumerating space-strings as
// sentinels rather than by TRIM. LIMITATION: a whitespace-only value longer
// than 4 spaces would still count as valid. Stated, not hidden.
const SENTINELS = [
  '0', '-', '--', 'null', 'NULL', 'S/N', 'ND', 'SN', 'N/D', '.',
  ' ', '  ', '   ', '    ',
];

// SQL fragment: field is VALID (not null, not blank, not a sentinel).
function validWhere(f) {
  const sent = SENTINELS.map((s) => `'${s.replace(/'/g, "''")}'`);
  return `${f} IS NOT NULL AND ${f} <> '' AND CHAR_LENGTH(${f}) > 0 AND ${f} NOT IN (${sent.join(',')})`;
}

const result = { probe: 'q1b-url-and-validity', runAt: new Date().toISOString(), layers: {}, errors: [] };

for (const t of TARGETS) {
  const rec = { id: t.id, name: t.name, fields: {} };
  try {
    const total = await count(t.id);
    rec.total = total.count;
    rec.totalTruncationSuspect = total.truncationSuspect;

    for (const f of t.fields) {
      const fr = {};
      try {
        const nonNull = await count(t.id, `${f} IS NOT NULL`);
        const valid = await count(t.id, validWhere(f));
        fr.nonNull = nonNull.count;
        fr.valid = valid.count;
        fr.nonNullPct = +((100 * nonNull.count) / rec.total).toFixed(2);
        fr.validPct = +((100 * valid.count) / rec.total).toFixed(2);
        // ⭐ THE TRAP CHECK: distinct-value count, always alongside coverage.
        const d = await distinct(t.id, f, validWhere(f));
        fr.distinctCount = d.n;
        fr.distinctTruncationSuspect = d.truncationSuspect;
        fr.distinctExceededTransferLimit = d.exceededTransferLimit;
        // Keep a sample of distinct values (all of them if few).
        const vals = d.rows.map((r) => r[f]);
        fr.distinctSample = d.n <= 60 ? vals : vals.slice(0, 40);
        // Ratio: distinct per feature. ~1 => per-feature identity. Tiny => a lookup table.
        fr.distinctPerFeature = +(d.n / Math.max(1, valid.count)).toFixed(6);
      } catch (err) {
        fr.error = String(err.message || err);
        fr.errorClass = err instanceof EsriError ? 'esri-error-in-200' : 'transport';
        result.errors.push({ layer: t.id, field: f, error: fr.error, class: fr.errorClass });
      }
      rec.fields[f] = fr;
      process.stderr.write(
        `${t.name}.${f}: valid ${fr.validPct ?? '?'}% (${fr.valid ?? '?'}/${rec.total}) distinct=${fr.distinctCount ?? '?'}\n`,
      );
      await sleep(150);
    }
  } catch (err) {
    rec.error = String(err.message || err);
    result.errors.push({ layer: t.id, error: rec.error });
  }
  result.layers[t.name] = rec;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'q1b-url-and-validity.json'), JSON.stringify(result, null, 2));
console.error(`\nDONE. errors=${result.errors.length}`);
