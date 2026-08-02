#!/usr/bin/env node
/**
 * M1 - MADRID: read the ALREADY-COMMITTED per-municipality census and ask the one
 * question nobody asked: is NM_FDO_MX_ED (buildable depth) badly served EVERYWHERE,
 * or only in the CAPITAL?
 *
 * The capital's 12.94% was quoted as "Madrid depth coverage". That is a CAPITAL figure
 * being reported as a REGIONAL figure - exactly the error already found for NM_ALTURA
 * (capital 8.86%, median municipality much higher).
 *
 * No network. Input is tools/madrid-spacm-probe/out/05-coverage-by-municipality.csv,
 * committed, 178 municipalities + header.
 *
 * CONTROL: the same statistic is computed for every numeric column, so the depth
 * result can be read against its siblings. A column that behaves like all the others
 * is not evidence of anything; a column that stands out is.
 */
import fs from 'node:fs';
import path from 'node:path';

const CSV = process.argv[2] || path.resolve(
  'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/madrid-spacm-probe/out/05-coverage-by-municipality.csv');
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'out');

function parseCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const rows = parseCsv(fs.readFileSync(CSV, 'utf8'));
const header = rows[0];
const body = rows.slice(1);
const NUMCOLS = header.slice(3); // everything after cd,municipio,n

const recs = body.map(r => {
  const o = { cd: r[0], municipio: r[1], n: Number(r[2]) };
  NUMCOLS.forEach((c, i) => { o[c] = Number(r[3 + i]); });
  return o;
});

const totalPolys = recs.reduce((a, b) => a + b.n, 0);

function stats(col) {
  const vals = recs.map(r => r[col]).filter(v => Number.isFinite(v));
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  // polygon-weighted regional coverage: sum(n_i * pct_i) / sum(n_i)
  const weighted = recs.reduce((a, r) => a + r.n * (r[col] / 100), 0) / totalPolys * 100;
  const capital = recs.find(r => r.cd === '079')[col];
  return {
    column: col,
    capitalPct: capital,
    medianMunicipalityPct: +median.toFixed(2),
    meanMunicipalityPct: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2),
    polygonWeightedRegionalPct: +weighted.toFixed(2),
    municipalitiesOver50: vals.filter(v => v > 50).length,
    municipalitiesOver80: vals.filter(v => v > 80).length,
    municipalitiesAtZero: vals.filter(v => v === 0).length,
    nMunicipalities: vals.length,
  };
}

const table = NUMCOLS.map(stats);
const depth = table.find(t => t.column === 'NM_FDO_MX_ED');

// The specific claim under test.
const verdict = {
  claimUnderTest: 'Madrid buildable depth NM_FDO_MX_ED = 12.9% (quoted from the CAPITAL row)',
  capitalPct: depth.capitalPct,
  medianMunicipalityPct: depth.medianMunicipalityPct,
  polygonWeightedRegionalPct: depth.polygonWeightedRegionalPct,
  municipalitiesOver50: depth.municipalitiesOver50,
  nMunicipalities: depth.nMunicipalities,
  ratioMedianToCapital: +(depth.medianMunicipalityPct / depth.capitalPct).toFixed(2),
};

// Best-served municipalities for depth, so the ladder can be pulled next.
const topDepth = [...recs].sort((a, b) => b.NM_FDO_MX_ED - a.NM_FDO_MX_ED)
  .slice(0, 20).map(r => ({ cd: r.cd, municipio: r.municipio, n: r.n, depthPct: r.NM_FDO_MX_ED }));

const out = { source: CSV, totalPolygons: totalPolys, nMunicipalities: recs.length, table, verdict, topDepthMunicipalities: topDepth };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'm1-madrid-depth-census.json'), JSON.stringify(out, null, 2));

console.log('MADRID depth re-read of the COMMITTED census');
console.log(`  polygons ${totalPolys}  municipalities ${recs.length}\n`);
console.log('col                capital   medMuni   meanMuni  polyWtd   >50  >80  ==0');
for (const t of table) {
  console.log(`${t.column.padEnd(18)} ${String(t.capitalPct).padStart(7)} ${String(t.medianMunicipalityPct).padStart(9)} ${String(t.meanMunicipalityPct).padStart(10)} ${String(t.polygonWeightedRegionalPct).padStart(8)} ${String(t.municipalitiesOver50).padStart(5)} ${String(t.municipalitiesOver80).padStart(4)} ${String(t.municipalitiesAtZero).padStart(4)}`);
}
console.log('\nDEPTH VERDICT'); console.log(JSON.stringify(verdict, null, 2));
console.log('\ntop depth municipalities:');
for (const r of topDepth) console.log(`  ${r.cd} ${r.municipio.padEnd(28)} n=${String(r.n).padStart(6)}  ${r.depthPct}%`);
