// L-550 PROBE — score the L-538 clau measurement against the SHIPPING registry.
//
// WHY A SECOND PROBE RATHER THAN A NUMBER IN A DOC: the L-538 probe measured the LAND
// (`scratchpad/bcn-clau-distribution.json` — 2 907 grid points, 1 014 resolved inside INE 08019,
// via the production `fetchQualificationAtPoint`). What changes phase to phase is not the land,
// it is WHAT PRYZM DOES WITH IT. So this probe re-uses that measurement verbatim and asks the
// SHIPPING `resolveZoneDisposition` — the exact function `applyBcnZoningThenFallback` calls —
// what each point would now get. It therefore cannot disagree with the code path it scores
// (the SPAIN-CADASTRAL-DISSOLVE-PROBE precedent), and a phase landing moves this output by
// construction rather than by anyone re-typing a percentage.
//
// Run:  npx tsx scratchpad/probe-bcn-coverage-tiering.mts

import { readFileSync } from 'node:fs';
import {
    resolveZoneDisposition,
    BCN_JURISDICTION_ID,
} from '../packages/site-parcel-data/src/rulepacks/registry.js';

interface Hit {
    lat: number;
    lon: number;
    clau: string | null;
    label: string | null;
    mucCode: string | null;
    ine: string | null;
}

const INE_BARCELONA = '08019';

const raw = JSON.parse(
    readFileSync(new URL('./bcn-clau-distribution.json', import.meta.url), 'utf8'),
) as { total: number; buildableTotal: number; hits: Hit[] };

const inCity = raw.hits.filter((h) => h.ine === INE_BARCELONA && h.clau);

// The plan's "private buildable land" denominator = the points NOT classified as a system /
// protected soil. It is derived here from the SHIPPING classification, so the denominator and
// the numerator move together and cannot drift apart the way two hand-kept lists would.
type Tier = 'constructed' | 'refused-legal' | 'refused-coverage-gap' | 'estimated-unregistered';

const byClau = new Map<
    string,
    { n: number; tier: Tier; label: string | null; refusalCode: string | null }
>();
for (const h of inCity) {
    const clau = h.clau!;
    // The harmonised code is passed EXACTLY as `applyBcnZoningThenFallback` passes it, so the
    // probe scores the real decision and not a re-implementation of it.
    const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau, { harmonisedCode: h.mucCode });
    // L-553 — a refusal is now TWO different answers and the probe must not merge them: a legal
    // refusal is a statement about the ordinance, a coverage-gap refusal a statement about PRYZM.
    // Merging them would make the headline number flatter to us than it is to a user.
    const tier: Tier =
        d.kind === 'pack'
            ? 'constructed'
            : d.kind === 'refusal'
            ? d.refusal.legallyGrounded
                ? 'refused-legal'
                : 'refused-coverage-gap'
            : 'estimated-unregistered';
    const e =
        byClau.get(clau) ??
        { n: 0, tier, label: h.label, refusalCode: d.kind === 'refusal' ? d.refusal.code : null };
    e.n += 1;
    byClau.set(clau, e);
}

// "Private buildable land" excludes public systems, public open space, facilities and protected
// soil — those are not a coverage shortfall, they are land nobody may build on. A `derived-plan`
// refusal (clau 18, 15, 16, 17) IS private buildable land, and stays in the denominator: it is
// land we refuse ON, not land that is excluded.
const NON_BUILDABLE_CODES = new Set([
    'public-system',
    'public-open-space',
    'facility-plan',
    'protected-soil',
    'protected-private-green',
]);

let buildableTotal = 0;
let constructed = 0;
let refusedOnBuildable = 0;
let coverageGapOnBuildable = 0;
let estimatedOnBuildable = 0;
let systemsRefused = 0;

for (const [, e] of byClau) {
    const isNonBuildable = e.refusalCode !== null && NON_BUILDABLE_CODES.has(e.refusalCode);
    if (isNonBuildable) {
        systemsRefused += e.n;
        continue;
    }
    buildableTotal += e.n;
    if (e.tier === 'constructed') constructed += e.n;
    else if (e.tier === 'refused-legal') refusedOnBuildable += e.n;
    else if (e.tier === 'refused-coverage-gap') coverageGapOnBuildable += e.n;
    else estimatedOnBuildable += e.n;
}

// Anything the classification table makes no claim about AND that is a known system-shaped clau
// would show up here — a sanity check that the enumeration has not missed a family.
const pct = (n: number, d: number) => (d > 0 ? ((n / d) * 100).toFixed(1) : '—');

const rows = [...byClau.entries()].sort((a, b) => b[1].n - a[1].n);
console.log('\n── L-550 — Barcelona coverage tiering, scored against the SHIPPING registry ──\n');
console.log('clau'.padEnd(10), 'n'.padStart(4), ' tier'.padEnd(26), 'refusal code');
for (const [clau, e] of rows) {
    console.log(clau.padEnd(10), String(e.n).padStart(4), ` ${e.tier}`.padEnd(26), e.refusalCode ?? '');
}


// ── SUMMARY ───────────────────────────────────────────────────────────────────────────────────
// L-553 splits the old single "refused" line in two, because they are different answers to the
// user: a LEGAL refusal is settled (the ordinance grants no envelope here) while a COVERAGE-GAP
// refusal is temporary (PRYZM has not encoded this zone yet). Reporting them merged would flatter
// us — it would count a roadmap item as a finished answer.
console.log('\n── SUMMARY ──');
console.log(`resolved points inside INE ${INE_BARCELONA}: ${inCity.length}`);
console.log(
    `non-buildable land (systems / open space / facilities / protected): ${systemsRefused} points ` +
        `— all REFUSED with a cited reason (was: a fabricated setback triple).`,
);
console.log(`\nPRIVATE BUILDABLE LAND: n = ${buildableTotal}`);
console.log(
    `  CONSTRUCTED (a rule pack answers)        : ${constructed} = ${pct(constructed, buildableTotal)} %`,
);
console.log(
    `  REFUSED — LEGAL (derived-plan zones)     : ${refusedOnBuildable} = ${pct(refusedOnBuildable, buildableTotal)} %`,
);
console.log(
    `  REFUSED — COVERAGE GAP (L-553, no pack)  : ${coverageGapOnBuildable} = ${pct(coverageGapOnBuildable, buildableTotal)} %`,
);
console.log(
    `  ESTIMATED setback triple STILL DRAWN     : ${estimatedOnBuildable} = ${pct(estimatedOnBuildable, buildableTotal)} %`,
);
console.log(
    `\n  POSITIVELY ANSWERED (constructed + legal refusal): ${constructed + refusedOnBuildable} = ` +
        `${pct(constructed + refusedOnBuildable, buildableTotal)} % of private buildable land`,
);
console.log(
    `  NOTHING WRONG-SHAPED DRAWN (all three tiers)    : ` +
        `${constructed + refusedOnBuildable + coverageGapOnBuildable} = ` +
        `${pct(constructed + refusedOnBuildable + coverageGapOnBuildable, buildableTotal)} %`,
);
console.log(`\n  FABRICATED SETBACK TRIPLES REMAINING IN THE WHOLE CITY: ${estimatedOnBuildable}`);
console.log(
    `  ALL Barcelona ground with a constructed-or-refused answer: ` +
        `${pct(systemsRefused + constructed + refusedOnBuildable + coverageGapOnBuildable, inCity.length)} %`,
);
