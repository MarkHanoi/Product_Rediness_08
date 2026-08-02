// STEP 13 — VERDICT. Derives every number quoted in FINDINGS.md so the artefact is GENERATED,
// not hand-typed. Re-run end-to-end to reproduce.
//
// GRAMMAR FAMILIES. The brief asks to cluster zon_suelo through `requiresBlockRing`
// (= kind 'block-derived-alignment' | 'tiered-occupation'). That clustering CANNOT be performed
// on this dataset: zon_suelo is a USE x DEVELOPMENT-STATE taxonomy (confirmed against the
// official data model, tabla 2 anexo IV) with no building-typology dimension. So the families
// below are the STRONGEST partition the data actually supports, and the residential/tertiary
// bucket is explicitly labelled UNDETERMINED rather than split into setback/block.
import { load, save } from './lib.mjs';

const codes = load('_06_codes.json');
const area = load('_10_area.json');

const FAMILY = {
    // Depth is structurally irrelevant: rural zones carry no block ring and no buildable depth.
    'ZRP-AG': 'RURAL', 'ZRP-NA-LG': 'RURAL', 'ZRP-NA-MU': 'RURAL', 'ZRP-CA': 'RURAL',
    'ZRP-CT': 'RURAL', 'ZRP-CR': 'RURAL', 'ZRP-CF': 'RURAL', 'ZRP-PC': 'RURAL',
    'ZRP-DP': 'RURAL', 'ZRP-OT': 'RURAL', 'ZRP-RI': 'RURAL',
    'ZRC-AG': 'RURAL', 'ZRC-EX': 'RURAL', 'ZRC-FO': 'RURAL',
    // Industrial: setback-family by construction; never closed-block, so never needs depth.
    'ZUR-IN': 'INDUSTRIAL', 'ZND-IN': 'INDUSTRIAL',
    // ⛔ The undetermined core: could be setback OR closed-block. The dataset cannot say.
    'ZUR-RE': 'URBAN-UNDETERMINED', 'ZND-RE': 'URBAN-UNDETERMINED',
    'ZUR-TR': 'URBAN-UNDETERMINED', 'ZND-TR': 'URBAN-UNDETERMINED',
    'ZUR-NHT': 'URBAN-UNDETERMINED',
};

const fam = (c) => FAMILY[c] || 'DIRTY/UNKNOWN';

// ── polygon-weighted (EXACT, region-wide census n=122,840) ───────────────────
const poly = {};
let polyTot = 0;
for (const c of codes.codes) { poly[fam(c.code)] = (poly[fam(c.code)] || 0) + c.n; polyTot += c.n; }

// ── area-weighted (seeded stratified sample) ─────────────────────────────────
const ar = {};
let arTot = 0;
for (const r of area.areaByCode) { ar[fam(r.code)] = (ar[fam(r.code)] || 0) + r.area_km2; arTot += r.area_km2; }

const pct = (x, t) => +((100 * x) / t).toFixed(2);

console.error(`\n══ GRAMMAR FAMILY SHARES ══`);
console.error(`(area mode: ${area.mode}, ${area.sampled} municipalities, ${area.totalArea_km2} km2)`);
console.error(`family                polygons(exact census)     area(${area.mode})`);
for (const f of ['RURAL', 'INDUSTRIAL', 'URBAN-UNDETERMINED', 'DIRTY/UNKNOWN']) {
    console.error(`  ${f.padEnd(20)} ${String(pct(poly[f] || 0, polyTot)).padStart(6)}%  (${String(poly[f] || 0).padStart(6)})     ${String(pct(ar[f] || 0, arTot)).padStart(6)}%  (${(ar[f] || 0).toFixed(0)} km2)`);
}

const urbanBuildable = (ar['URBAN-UNDETERMINED'] || 0) + (ar['INDUSTRIAL'] || 0);
const undetOfBuildable = pct(ar['URBAN-UNDETERMINED'] || 0, urbanBuildable);

console.error(`\n══ THE DEPTH BLOCKER, SIZED ══`);
console.error(`  urban + urbanisable land (the only land where an envelope is asked for): ${pct(urbanBuildable, arTot)}% of regional area`);
console.error(`  of THAT buildable land, share whose GRAMMAR IS UNDETERMINED            : ${undetOfBuildable}%`);
console.error(`  of THAT buildable land, share known setback-family (industrial)        : ${pct(ar['INDUSTRIAL'] || 0, urbanBuildable)}%`);
console.error(`\n  ⛔ The undetermined share is an UPPER BOUND on the depth blocker, not the blocker itself:`);
console.error(`     an unknown fraction of it is setback fabric that never needs depth. The dataset`);
console.error(`     cannot split it, so the split is UNKNOWN — not assumed.`);

const inv = load('_08_inventario.json');
console.error(`\n══ PARAMETER AVAILABILITY (InventarioSuSuz) ══`);
console.error(`  sectors: ${inv.sectors} across ${inv.municipalities} municipalities`);
console.error(`  FAR derivable (sup_m2>0 AND edif_m2>0): ${inv.contradiction.bothPos} = ${pct(inv.contradiction.bothPos, inv.sectors)}% of sectors`);
console.error(`  median derived FAR: ${inv.contradiction.farQuantiles.p50}`);
console.error(`  ⚠ zero-as-null CONFIRMED: ${inv.contradiction.supZeroEdifPos} rows have sup_m2==0 with edif_m2>0 (impossible)`);
console.error(`  ⚠ ${inv.contradiction.farOver20} sectors with FAR>20 (max ${inv.contradiction.farQuantiles.p95 ? 'see json' : ''}) — dirty tail`);

save('_13_verdict.json', {
    polygonWeighted: Object.fromEntries(Object.entries(poly).map(([k, v]) => [k, { n: v, pct: pct(v, polyTot) }])),
    areaWeighted: Object.fromEntries(Object.entries(ar).map(([k, v]) => [k, { km2: +v.toFixed(1), pct: pct(v, arTot) }])),
    buildableLand: { pctOfRegion: pct(urbanBuildable, arTot), undeterminedPctOfBuildable: undetOfBuildable, industrialPctOfBuildable: pct(ar['INDUSTRIAL'] || 0, urbanBuildable) },
    areaSample: { seed: area.seed, municipalities: area.sampled, km2: area.totalArea_km2 },
});
