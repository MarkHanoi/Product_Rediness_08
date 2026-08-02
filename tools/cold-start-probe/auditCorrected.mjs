#!/usr/bin/env node
// AUDIT-CORRECTED DETERMINATION. The refusal audit measured that some slices tiered
// `not-determined` are, by the SHIPPED CODE'S OWN FLAG, PRYZM's data gap rather than a legal
// refusal. Reclassifying them is not a judgement made here — it is applying
// `legallyGrounded: false`, which the product already ships.
//
//   Barcelona 22a       — esBarcelonaZoneClassification.ts:798  `legallyGrounded: false`
//   Barcelona bare 20a  — esBarcelonaZoneClassification.ts:1047 `legallyGrounded: false`
//   València `origen` LIKE 'MP%' — a *modificación puntual* AMENDS the PGOU; it is not a derived
//                         instrument the plan delegates to. The land stays PGOU-ordered, so the
//                         honest class is a document-acquisition gap, not a cited delegation.
//
// Everything else the audit found was WRONG-CITATION / RIGHT-OUTCOME: the parcel is still
// terminated, by a different article. Those do NOT move the determination split — they are a
// citation-quality defect, reported separately and never netted off against coverage.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wilson } from './oldVsNew.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const RECLASS = {
    barcelona: (r) => r.code === '22a' || r.code === '20a',
    valencia: (r) => /\|MP/i.test(String(r.code ?? '')),
};

const rows = [];
for (const city of ['barcelona', 'murcia', 'madrid', 'valencia', 'cordoba']) {
    const j = JSON.parse(readFileSync(join(HERE, 'out', `${city}.determination.json`), 'utf8'));
    const pred = RECLASS[city];
    let env = 0, refT = 0, refD = 0, noPack = 0, nonB = 0, moved = 0;
    for (const r of j.rows) {
        if (!r.cat) continue;
        let cat = r.cat;
        if (pred && pred(r) && cat.startsWith('refusal')) { cat = 'no-pack'; moved++; }
        if (cat === 'envelope') env++;
        else if (cat === 'refusal-terminal') refT++;
        else if (cat === 'refusal-delegated') refD++;
        else if (cat === 'no-pack') noPack++;
        else if (cat === 'nonBuildable') nonB++;
    }
    const n = env + refT + refD + noPack;
    const det = (env + refT + refD) / n;
    rows.push({
        city, n, moved,
        envelope: env / n, refusalTerminal: refT / n, refusalDelegated: refD / n,
        refusal: (refT + refD) / n, determination: det, noPack: noPack / n,
        ci: wilson(env + refT + refD, n),
    });
}

const p = (x) => (x * 100).toFixed(1).padStart(5) + '%';
console.log('\nAUDIT-CORRECTED — parcel denominator, refusals the shipped code flags `legallyGrounded:false` moved to no-pack');
console.log('city        │ DETERMINATION = ENVELOPE + REFUSAL(terminal + delegated) │ no-pack │ 95% CI      │ n   │ moved');
console.log('────────────┼──────────────────────────────────────────────────────────┼─────────┼─────────────┼─────┼──────');
for (const r of rows) {
    console.log(`${r.city.padEnd(11)} │ ${p(r.determination)} = ${p(r.envelope)} + ${p(r.refusal)} (${p(r.refusalTerminal)} + ${p(r.refusalDelegated)})  │ ${p(r.noPack)}  │ [${(r.ci[0] * 100).toFixed(1)}–${(r.ci[1] * 100).toFixed(1)}] │ ${String(r.n).padStart(3)} │ ${r.moved}`);
}
console.log('\nRANK (audit-corrected):', [...rows].sort((a, b) => b.determination - a.determination).map((r) => r.city).join(' > '));
writeFileSync(join(HERE, 'out', 'audit-corrected.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 1));
console.log('→ out/audit-corrected.json');
