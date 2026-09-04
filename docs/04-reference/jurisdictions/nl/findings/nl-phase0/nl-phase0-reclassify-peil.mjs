#!/usr/bin/env node
// NL PHASE 0 — OFFLINE RE-CLASSIFICATION of the stored peil definitions. NO NETWORK TRAFFIC.
//
// Lane ENVELOPE-NLDK, 2026-09-04.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — a measurement defect caught by a UNIT TEST, not by re-measuring
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `nl-phase0-plantext.mjs`'s `classifyPeil` detected the `adjoining-finished-ground` class with:
//
//     /aansluitend (afgewerkt )?(maaiveld|terrein)|gemiddelde hoogte van het (aansluitende )?(terrein|maaiveld)/
//
// Both branches require UNINFLECTED adjectives — "aansluitend afgewerkt maaiveld". Dutch legal
// prose overwhelmingly writes the INFLECTED form, "het aansluitende afgewerkte maaiveld", which
// neither branch matches: branch 1 fails on "aansluitende", branch 2 fails because "afgewerkte"
// sits between "het aansluitende" and "maaiveld". The class was therefore reported on **1 of 20**
// plans carrying a peil definition. Re-classified with the inflection allowed: **11 of 20**.
//
// The defect was found because `packages/site-parcel-data/__tests__/nlPeil.test.ts` asserted the
// classifier against a definition QUOTED FROM THE SAMPLE (NL.IMRO.0344.BPCHWZUILEN-VA01) and the
// assertion failed. A classifier tested only against text written by the same author who wrote the
// regex would have passed — the fixture had to come from the corpus.
//
// ⚠ WHY THIS MATTERS LEGALLY, AND NOT MERELY ARITHMETICALLY. `aansluitend AFGEWERKT terrein` is the
// FINISHED ground *after construction* — expressly NOT the current terrain. It is the single class
// most likely to be silently substituted with an AHN elevation, because it sounds like "ground
// level". The audit had it at 1/20, which made it look like a rarity not worth handling. It is the
// joint-commonest physical reference in the corpus.
//
// ⚠ NOTHING IS RE-MEASURED. The plan texts were fetched once (70 plans, 66 parsed) and are stored
// verbatim in `nl-phase0-plantext.json`. This script re-derives `peilClasses` from those stored
// texts and rewrites that field ONLY. No third-party endpoint is contacted; the sample is
// untouched evidence and the reduction is a pure function of it.
//
// USAGE: node nl-phase0-reclassify-peil.mjs   (then re-run nl-phase0-reduce.mjs)

import fs from 'node:fs';

const FILE = 'nl-phase0-plantext.json';

/** The CORRECTED classifier. Kept character-identical to `nlPeil.ts`'s `classifyNlPeilDefinition`
 *  and to the (now patched) `classifyPeil` in `nl-phase0-plantext.mjs` — three copies, one
 *  behaviour, because a runtime and an audit that classify differently cannot be compared. */
function classifyPeil(text) {
    const s = text.toLowerCase();
    const hits = [];
    if (/kruin van de weg|kruin van de aangrenzende|wegdek/.test(s)) hits.push('road-crown');
    if (/aansluitende?\s+(afgewerkte?\s+)?(maaiveld|terrein)|gemiddelde hoogte van het\s+(aansluitende?\s+)?(afgewerkte?\s+)?(terrein|maaiveld)/.test(s)) hits.push('adjoining-finished-ground');
    if (/\bmaaiveld\b/.test(s) && !hits.includes('adjoining-finished-ground')) hits.push('maaiveld-other');
    if (/\bn\.?a\.?p\.?\b|normaal amsterdams peil/.test(s)) hits.push('nap-absolute');
    if (/hoofdtoegang|toegang van het gebouw|entree/.test(s)) hits.push('main-entrance-referenced');
    if (/bovenkant.*(afgewerkte )?vloer|begane[- ]grondvloer/.test(s)) hits.push('ground-floor-level');
    if (/dijk|kade|waterpeil|waterstand|boezempeil/.test(s)) hits.push('water-or-dike');
    if (/burgemeester en wethouders|bevoegd gezag|nader.{0,20}bepaal/.test(s)) hits.push('authority-determined');
    if (hits.length === 0) hits.push('unclassified');
    return hits;
}

const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const rows = doc.results ?? doc.plans ?? [];

const before = {};
const after = {};
let changed = 0;
for (const r of rows) {
    if (!r.peilDefinition) continue;
    for (const c of r.peilClasses ?? []) before[c] = (before[c] ?? 0) + 1;
    const next = classifyPeil(r.peilDefinition);
    for (const c of next) after[c] = (after[c] ?? 0) + 1;
    if (JSON.stringify(next) !== JSON.stringify(r.peilClasses)) changed++;
    r.peilClasses = next;
}

doc.reclassifiedAt = new Date().toISOString();
doc.reclassifyNote =
    'peilClasses re-derived OFFLINE from the stored peilDefinition texts after the ' +
    'adjoining-finished-ground regex was corrected for Dutch adjectival inflection ' +
    '(lane ENVELOPE-NLDK, 2026-09-04). No network traffic; the fetched texts are unchanged.';

fs.writeFileSync(FILE, JSON.stringify(doc, null, 1));

console.log('plans re-classified:', changed, 'of', rows.filter((r) => r.peilDefinition).length, 'with a peil definition');
console.log('\nclass frequency BEFORE:', JSON.stringify(before, null, 1));
console.log('\nclass frequency AFTER :', JSON.stringify(after, null, 1));
console.log('\nWROTE', FILE, '— now re-run nl-phase0-reduce.mjs');
