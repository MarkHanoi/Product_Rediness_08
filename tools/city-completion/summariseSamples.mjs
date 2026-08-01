#!/usr/bin/env node
// C63 Axis 1 — read the `samples/*.parcel-sample.json` records and print the THREE numbers L-656
// says must never be conflated, each beside its own denominator, sample size and Wilson 95 % CI:
//
//   1. AXIS SCORE      — denominator: private buildable land (the OSM footprint proxy). C63 PARCEL.
//   2. CLICK COVERAGE  — denominator: ALL clicks in the region bbox. What a random user sees.
//   3. ANSWER CORRECTNESS — denominator: ALL clicks. Did every click get a TRUE answer (a parcel OR
//      an honest "no parcel here")? A transport failure is the ONLY wrong answer; it is counted
//      here and excluded from 1 and 2.
//
// Usage: node summariseSamples.mjs [--dir samples]
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wilson95 } from './computeScorecard.mjs';
import { CITY_BOARD } from './parcelSampleProbe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const dir = resolve(HERE, arg('--dir', 'samples'));

const pct = (x) => (x === null ? '—' : (x * 100).toFixed(1) + '%');
const rows = [];
for (const c of CITY_BOARD) {
    const f = join(dir, `${c.city}.parcel-sample.json`);
    if (!existsSync(f)) { rows.push({ city: c.city, status: 'NO SAMPLE FILE' }); continue; }
    const r = JSON.parse(readFileSync(f, 'utf8'));
    const b = r.buildable, a = r.allclicks;
    const nB = b.counts.high + b.counts.medium + b.counts.low + b.counts.none;
    const failB = Object.values(b.failures).reduce((s, v) => s + v, 0);
    const nA = a.counts.high + a.counts.medium + a.counts.low + a.counts.none;
    const failA = Object.values(a.failures).reduce((s, v) => s + v, 0);
    const axis = nB === 0 ? null : (b.counts.high + 0.5 * b.counts.medium) / nB;
    // The CI is on the `high` proportion — the quantity the axis is dominated by.
    const ci = wilson95(b.counts.high, nB);
    rows.push({
        city: c.city,
        provider: r.providerId,
        'AXIS (buildable)': nB === 0 ? 'not-assessed' : pct(axis),
        'N(buildable)': nB,
        'high/med/low/none': `${b.counts.high}/${b.counts.medium}/${b.counts.low}/${b.counts.none}`,
        '95% CI on high': ci ? `${pct(ci.lo)}–${pct(ci.hi)}` : '—',
        'excluded failures': failB ? JSON.stringify(b.failures) : '0',
        'CLICK COVERAGE': nA === 0 ? 'not-assessed' : pct((a.counts.high + a.counts.medium + a.counts.low) / nA),
        'N(all clicks)': nA,
        // ⚠ NOT `0 %` when every probe failed. Answer-correctness asks "did the click get a TRUE
        // answer?", and during an upstream outage this probe cannot tell — the SHIPPED path would
        // fall through to a labelled OSM footprint, which IS a true answer this tool never sees.
        // Scoring the outage 0 % would be a claim about our data made from a claim about the network.
        'ANSWER CORRECTNESS': nA === 0
            ? (failA > 0 ? 'not-assessed (upstream outage)' : 'not-assessed')
            : pct(nA / (nA + failA)),
    });
}
console.log('\n▶ C63 Axis 1 PARCEL — three numbers, three denominators, never conflated (L-656):');
console.table(rows);
for (const c of CITY_BOARD) {
    const f = join(dir, `${c.city}.parcel-sample.json`);
    if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, 'utf8'));
    console.log(`\n· ${c.city} (${r.jurisdictionId}) measured ${r.measuredAt} · seed ${r.seed} · bbox [${r.bbox.join(', ')}]`);
    console.log(`  frame: ${r.frame.note}${r.frame.overpassOk ? '' : ' ⚠ ' + r.frame.overpassMessage}`);
    const bad = r.buildable.points.filter((p) => p.outcome !== 'ok' && p.outcome !== 'none');
    if (bad.length) console.log(`  ⚠ ${bad.length} transport failure(s), first: ${bad[0].outcome} — ${(bad[0].message ?? '').slice(0, 160)}`);
}
