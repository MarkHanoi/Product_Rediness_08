#!/usr/bin/env node
// OLD (area, three incompatible bases) vs NEW (cadastral parcel, one national base).
// The OLD column is recomputed FROM the committed measurement records, never retyped from a doc —
// `ES-CITY-ENVELOPE-CERTIFIABILITY-SURVEY.md` is the cautionary example of a retyped number.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MEAS = join(HERE, '..', 'city-completion', 'measurements');

/** Wilson score interval — correct for proportions near 0 and 1, where normal approximation lies. */
export function wilson(k, n, z = 1.96) {
    if (!n) return [null, null];
    const p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d;
    const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
}

const CITIES = ['barcelona', 'murcia', 'madrid', 'valencia', 'cordoba'];
const out = [];

for (const city of CITIES) {
    const m = JSON.parse(readFileSync(join(MEAS, `${city}.measurements.json`), 'utf8'));
    const cov = m.envelope.coverage;
    const sum = (pred) => cov.filter(pred).reduce((s, c) => s + c.buildableLandShare, 0);
    const envelopeOld = sum((c) => ['block-constructed', 'estimated-ruleset', 'setback', 'authoritative', 'structured', 'pipeline-extracted-unverified'].includes(c.tier));
    const refusalOld = sum((c) => c.tier === 'not-determined');
    const noPackOld = sum((c) => c.tier === 'no-pack');

    const njPath = join(HERE, 'out', `${city}.determination.json`);
    let nw = null;
    if (existsSync(njPath)) {
        const j = JSON.parse(readFileSync(njPath, 'utf8'));
        if (j.ok && j.pct?.ofBuildable) {
            const n = j.denominatorPrivateBuildableParcels;
            nw = {
                n,
                sampled: j.sampled,
                popTotal: j.parcelPopulationTotal,
                popUrban: j.parcelPopulationUrban,
                envelope: j.pct.ofBuildable.envelope,
                refusalTerminal: j.pct.ofBuildable.refusalTerminal,
                refusalDelegated: j.pct.ofBuildable.refusalDelegated,
                refusal: j.pct.ofBuildable.refusalTotal,
                determination: j.pct.ofBuildable.determination,
                noPack: j.pct.ofBuildable.noPack,
                ci: wilson(Math.round(j.pct.ofBuildable.determination * n), n),
                nonBuildable: j.counts.nonBuildable,
                failures: j.transportFailures,
                allUrban: j.pct.ofAllUrbanParcels,
            };
        }
    }
    out.push({
        city,
        old: { denominator: m.envelope.denominator.split('=')[0].trim(), envelope: envelopeOld, refusal: refusalOld, noPack: noPackOld, determination: envelopeOld + refusalOld },
        new: nw,
    });
}

const pc = (x) => x == null ? '   —  ' : (x * 100).toFixed(1).padStart(5) + '%';
console.log('\nDETERMINATION — OLD (area, own base) vs NEW (cadastral parcel, national base)');
console.log('city        │  OLD det = env + ref  │  NEW det = env + ref   │ Δ det   │ 95% CI (new)      │ n');
console.log('────────────┼───────────────────────┼────────────────────────┼─────────┼───────────────────┼─────');
const ranked = [...out].sort((a, b) => (b.new?.determination ?? -1) - (a.new?.determination ?? -1));
for (const r of out) {
    const o = r.old, n = r.new;
    const delta = n ? ((n.determination - o.determination) * 100) : null;
    console.log(
        `${r.city.padEnd(11)} │ ${pc(o.determination)} = ${pc(o.envelope)}+${pc(o.refusal)} │ ${pc(n?.determination)} = ${pc(n?.envelope)}+${pc(n?.refusal)} │ ${delta == null ? '   —   ' : (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' pp'} │ ${n ? `[${(n.ci[0] * 100).toFixed(1)}–${(n.ci[1] * 100).toFixed(1)}]`.padEnd(17) : '—'.padEnd(17)} │ ${n?.n ?? '—'}`,
    );
}
console.log('\nRANK — old (by determination) vs new');
const oldRank = [...out].sort((a, b) => b.old.determination - a.old.determination).map((r) => r.city);
const newRank = ranked.filter((r) => r.new).map((r) => r.city);
console.log('  old:', oldRank.join(' > '));
console.log('  new:', newRank.join(' > '));

console.log('\nPARCEL POPULATIONS (Catastro INSPIRE CP, exact)');
for (const r of out) if (r.new) console.log(`  ${r.city.padEnd(11)} total ${String(r.new.popTotal).padStart(7)}  urban ${String(r.new.popUrban).padStart(7)}  sampled ${r.new.sampled}  non-buildable-in-sample ${r.new.nonBuildable}  failures ${JSON.stringify(r.new.failures)}`);

writeFileSync(join(HERE, 'out', 'old-vs-new.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rows: out, oldRank, newRank }, null, 1));
console.log('\n→ out/old-vs-new.json');
