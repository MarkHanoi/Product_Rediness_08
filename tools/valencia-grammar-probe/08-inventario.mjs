// STEP 8 — InventarioSuSuz: THE ONLY PARAMETER-BEARING LAYER ON THE SERVICE.
//
// ⚠ SELF-CORRECTION. Step 7's automated pattern reported "far: ABSENT from every declared
// schema". That was a FALSE ABSENCE caused by my own regex — `edif_m2` does not match
// /edificabilidad|coef|far|.../. The union dump caught it. Recording the miss because the
// method note "populated is not present" has a twin: A PATTERN THAT DOES NOT MATCH IS NOT AN
// ABSENT FIELD. The verdict below is built from the FULL field list, not from a regex.
//
// InventarioSuSuz carries, per SECTOR (not per parcel, not per zone):
//   sup_m2   — sector surface
//   edif_m2  — buildable floor area        ⇒ a FAR is CONSTRUCTIBLE as edif_m2 / sup_m2
//   ord_porm — whether detailed ordinance (ordenación pormenorizada) exists
//   legislacion_pp / legislacion_pg / f_aprob / f_public — provenance
//
// ⛔ POPULATED IS NOT PRESENT. Aragón proved `0` was its schema's null substitute (70/78 rows
// with shape_area > 0 AND perimeter == 0). The same contradiction test is applied here: a row
// claiming sup_m2 == 0 while carrying real geometry, or edif_m2 == 0 on an approved sector, is
// a null wearing a number.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, DIR, get, owsException, countMembers, save } from './lib.mjs';

const TN = 'ms:InventarioSuSuz';
const FIELDS = ['cod_ine_mun', 'noms_mun', 'clasificacion', 'uso', 'ord_porm', 'sup_m2', 'edif_m2', 'situacion', 'gestion', 'legislacion_pg', 'legislacion_pp', 'f_aprob', 'cons_edif'];

const hitsU = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN)}&resultType=hits`;
const hr = await get(hitsU, 120000);
const expect = Number((hr.body.match(/numberOfFeatures="(\d+)"/) || hr.body.match(/numberMatched="(\d+)"/) || [])[1]);
console.error(`InventarioSuSuz hits = ${expect}  roundSuspect=${[1000, 2000, 3000, 4000, 5000, 10000].includes(expect)}`);

const u = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN)}&propertyname=${encodeURIComponent(FIELDS.join(','))}`;
const r = await get(u, 400000);
const exc = owsException(r.body);
if (!r.ok || exc) {
    console.error(`UNKNOWN: ${exc || r.http || r.err}`);
    process.exit(1);
}
const n = countMembers(r.body);
fs.writeFileSync(path.join(DIR, '_inventario.xml'), r.body);
console.error(`downloaded members=${n} hits=${expect} ${n === expect ? 'AGREE' : '**DISAGREE — truncation**'}`);

const rows = [];
const chunks = r.body.split('<gml:featureMember>');
for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];
    const rec = {};
    for (const f of FIELDS) {
        const m = c.match(new RegExp(`<ms:${f}>([^<]*)</ms:${f}>`));
        rec[f] = m ? m[1] : null; // null = element absent entirely
    }
    rows.push(rec);
}

/** Three-valued population: ABSENT (no element) / EMPTY (element, no text) / VALUED. */
function population(field) {
    let absent = 0, empty = 0, valued = 0, zero = 0;
    for (const r of rows) {
        const v = r[field];
        if (v === null) absent++;
        else if (v.trim() === '') empty++;
        else {
            valued++;
            if (Number(v) === 0) zero++;
        }
    }
    return {
        absent, empty, valued, zeroValued: zero,
        pctValued: +((100 * valued) / rows.length).toFixed(2),
        pctValuedNonZero: +((100 * (valued - zero)) / rows.length).toFixed(2),
    };
}

const pop = {};
for (const f of FIELDS) pop[f] = population(f);
console.error(`\nFIELD POPULATION over ${rows.length} sectors  (pctValued / pctValued-and-nonzero)`);
for (const f of FIELDS)
    console.error(`  ${f.padEnd(16)} valued=${String(pop[f].pctValued).padStart(6)}%  nonZero=${String(pop[f].pctValuedNonZero).padStart(6)}%  absent=${pop[f].absent} empty=${pop[f].empty} zeros=${pop[f].zeroValued}`);

// ── CONTRADICTION TEST (the Aragón null-substitute signature) ────────────────
let bothZero = 0, supZeroEdifPos = 0, edifZeroSupPos = 0, bothPos = 0;
const fars = [];
for (const r of rows) {
    const s = Number(r.sup_m2), e = Number(r.edif_m2);
    const sOk = r.sup_m2 && !Number.isNaN(s), eOk = r.edif_m2 && !Number.isNaN(e);
    if (!sOk || !eOk) continue;
    if (s === 0 && e === 0) bothZero++;
    else if (s === 0 && e > 0) supZeroEdifPos++;   // ⛔ impossible: floor area on zero land
    else if (e === 0 && s > 0) edifZeroSupPos++;   // suspicious: a sector with zero buildability
    else if (s > 0 && e > 0) { bothPos++; fars.push(e / s); }
}
fars.sort((a, b) => a - b);
const q = (p) => fars.length ? +fars[Math.floor(p * (fars.length - 1))].toFixed(3) : null;

console.error(`\n── sup_m2 / edif_m2 CONTRADICTION TEST ──`);
console.error(`  both > 0 (usable FAR) : ${bothPos}  (${((100 * bothPos) / rows.length).toFixed(2)}% of sectors)`);
console.error(`  both == 0             : ${bothZero}`);
console.error(`  sup==0 & edif>0       : ${supZeroEdifPos}   ⛔ IMPOSSIBLE if 0 were a real area`);
console.error(`  edif==0 & sup>0       : ${edifZeroSupPos}   (zero buildability, or 0-as-null)`);
console.error(`  derived FAR quantiles : p05=${q(0.05)} p25=${q(0.25)} p50=${q(0.5)} p75=${q(0.75)} p95=${q(0.95)} max=${fars.length ? +fars[fars.length - 1].toFixed(2) : null}`);
const absurd = fars.filter((f) => f > 20).length;
console.error(`  FAR > 20 (implausible): ${absurd}`);

// ── ord_porm: does a detailed ordinance exist for the sector? ────────────────
const ordVals = new Map();
for (const r of rows) ordVals.set(r.ord_porm, (ordVals.get(r.ord_porm) || 0) + 1);
console.error(`\nord_porm domain: ${JSON.stringify([...ordVals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))}`);
const clasVals = new Map();
for (const r of rows) clasVals.set(r.clasificacion, (clasVals.get(r.clasificacion) || 0) + 1);
console.error(`clasificacion domain: ${JSON.stringify([...clasVals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))}`);
const usoVals = new Map();
for (const r of rows) usoVals.set(r.uso, (usoVals.get(r.uso) || 0) + 1);
console.error(`uso domain: ${JSON.stringify([...usoVals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))}`);

save('_08_inventario.json', {
    sectors: rows.length, hits: expect, agree: n === expect,
    municipalities: new Set(rows.map((r) => r.cod_ine_mun)).size,
    population: pop,
    contradiction: { bothPos, bothZero, supZeroEdifPos, edifZeroSupPos, farQuantiles: { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95) }, farOver20: absurd },
    domains: { ord_porm: [...ordVals.entries()], clasificacion: [...clasVals.entries()], uso: [...usoVals.entries()] },
});
