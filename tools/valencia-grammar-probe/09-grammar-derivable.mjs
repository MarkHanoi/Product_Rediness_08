// STEP 9 — ⛔ THE DECISIVE TEST: IS THE GRAMMAR DERIVABLE FROM THE REGIONAL LAYER AT ALL?
//
// M2 asks to cluster zon_suelo BY GRAMMAR through `requiresBlockRing`. That presupposes the
// dataset distinguishes a SETBACK zone from a CLOSED-BLOCK zone. The 23-code vocabulary suggests
// it does not: ZUR-RE is "zona urbanizada residencial" — a USE x DEVELOPMENT-STATE label, not a
// building typology. If one code covers both an Eixample closed block and a detached-villa
// suburb, then requiresBlockRing is UNDECIDABLE from this source and the depth blocker cannot
// even be SIZED from it.
//
// The test uses the remaining un-measured fields. If any of denominaci / info_adici / dot_descri
// carries the MUNICIPAL sub-zone (Barcelona's "clau" equivalent), the grammar IS derivable and
// the hypothesis is strongly supported. If they are provenance/administrative only, it is not.
//
// KNOWN-ANSWER CONTROL: València capital (46250) is independently known to contain BOTH closed
// block (Eixample) and open/setback fabric. If both resolve to the same zon_suelo code with no
// discriminating attribute, the undecidability is demonstrated, not asserted.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, DIR, get, owsException, countMembers, save } from './lib.mjs';

const TN = 'ms:Planeamiento.Zonificacion';
const F = ['cod_ine_mun', 'zon_suelo', 'denominaci', 'info_adici', 'dot_descri', 'dotacion'];

const file = path.join(DIR, '_census_C.xml');
if (!fs.existsSync(file)) {
    const u = `${BASE}?service=WFS&version=1.1.0&request=GetFeature&typename=${encodeURIComponent(TN)}&propertyname=${encodeURIComponent(F.join(','))}`;
    const r = await get(u, 560000);
    const exc = owsException(r.body);
    if (!r.ok || exc) { console.error('UNKNOWN', exc || r.http); process.exit(1); }
    console.error(`census C: members=${countMembers(r.body)} (expect 122840) bytes=${r.body.length}`);
    fs.writeFileSync(file, r.body);
}
const body = fs.readFileSync(file, 'utf8');
const rows = [];
const chunks = body.split('<gml:featureMember>');
for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];
    const rec = {};
    for (const f of F) {
        const m = c.match(new RegExp(`<ms:${f}>([^<]*)</ms:${f}>`));
        rec[f] = m ? m[1] : null;
    }
    rows.push(rec);
}
console.error(`parsed ${rows.length} rows`);

// ── FIELD POPULATION, three-valued, region-wide ──────────────────────────────
console.error(`\n── ZONIFICACION FIELD POPULATION (n=${rows.length}) ──`);
const pop = {};
for (const f of F) {
    let absent = 0, empty = 0, valued = 0;
    const distinct = new Set();
    for (const r of rows) {
        const v = r[f];
        if (v === null) absent++;
        else if (v.trim() === '') empty++;
        else { valued++; distinct.add(v); }
    }
    pop[f] = { absent, empty, valued, pctValued: +((100 * valued) / rows.length).toFixed(2), distinct: distinct.size };
    console.error(`  ${f.padEnd(13)} valued=${String(pop[f].pctValued).padStart(6)}%  distinctValues=${pop[f].distinct}`);
}

// ── KNOWN-ANSWER CONTROL: València capital ───────────────────────────────────
const vlc = rows.filter((r) => r.cod_ine_mun === '46250');
console.error(`\n── VALÈNCIA CAPITAL (46250): ${vlc.length} polygons ──`);
const vByCode = new Map();
for (const r of vlc) vByCode.set(r.zon_suelo, (vByCode.get(r.zon_suelo) || 0) + 1);
for (const [k, v] of [...vByCode.entries()].sort((a, b) => b[1] - a[1]))
    console.error(`  ${String(v).padStart(5)}  ${k}`);

// Within València's dominant residential code, how many DISTINCT discriminators exist?
for (const code of ['ZUR-RE', 'ZUR-NHT']) {
    const sub = vlc.filter((r) => r.zon_suelo === code);
    if (!sub.length) continue;
    const den = new Set(sub.map((r) => r.denominaci).filter((x) => x && x.trim()));
    const inf = new Set(sub.map((r) => r.info_adici).filter((x) => x && x.trim()));
    console.error(`\n  ${code} in València: ${sub.length} polygons`);
    console.error(`    distinct denominaci : ${den.size}  e.g. ${[...den].slice(0, 3).map((s) => s.slice(0, 70))}`);
    console.error(`    distinct info_adici : ${inf.size}  e.g. ${[...inf].slice(0, 3).map((s) => s.slice(0, 70))}`);
}

// ── IS denominaci A SUB-ZONE OR AN INSTRUMENT NAME? ──────────────────────────
// If denominaci is the PLAN's name (one value per municipality) it is provenance, not typology.
const denPerMuni = new Map();
for (const r of rows) {
    let s = denPerMuni.get(r.cod_ine_mun);
    if (!s) denPerMuni.set(r.cod_ine_mun, (s = new Set()));
    if (r.denominaci && r.denominaci.trim()) s.add(r.denominaci);
}
const counts = [...denPerMuni.values()].map((s) => s.size).sort((a, b) => a - b);
const med = counts[Math.floor(counts.length / 2)];
console.error(`\n── denominaci per municipality: median=${med} min=${counts[0]} max=${counts[counts.length - 1]} ──`);
console.error(`   (a median near 1 ⇒ denominaci is the INSTRUMENT NAME, i.e. provenance, not a sub-zone)`);

save('_09_grammar_derivable.json', {
    n: rows.length, population: pop,
    valencia: { polygons: vlc.length, byCode: [...vByCode.entries()] },
    denominaciPerMuni: { median: med, min: counts[0], max: counts[counts.length - 1] },
});
