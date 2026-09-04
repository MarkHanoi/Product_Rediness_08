#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-nsw-da-crossref.ts
 *
 * GA Gate — **THE GOVERNMENT'S OWN APPROVALS, USED AS A CHECK ON OUR RESOLVED CONTROLS.**
 * Lane ENVELOPE-NSW round 4, 2026-09-04.
 *
 * ── THE IDEA, AND WHY IT IS WORTH A GATE ─────────────────────────────────────
 * PRYZM resolves what a site MAY have. NSW publishes, free and unauthenticated, what sites WERE
 * ACTUALLY GIVEN — the Online DA data API (`api.apps1.nsw.gov.au/eplanning/data/v0/OnlineDA`),
 * 1,841 determined City of Sydney applications for 2025 alone. Joining an approval to the control
 * that applied at its coordinates turns every determination in the state into a free test case.
 * ⭐ A systematic gap between "approved" and "resolved" is the rule graph telling us where its
 * holes are, at a scale no hand-written fixture reaches.
 *
 * ── ⛔ THE COMPARISON IS STOREYS-AGAINST-STOREYS AND NOTHING ELSE ────────────
 * The DA feed serves `NumberOfStoreys` and **no metric height at all** (asserted below, on the
 * captured record set: zero records carry a height field). The LEP serves metres and no storeys.
 * Comparing them requires a floor-to-floor assumption, which is a design decision dressed as
 * arithmetic — the same refusal `nswDcpStoreys.ts` is built around, and the same one lane PT
 * reports from RGEU art. 65. **This gate therefore compares the DA's storeys to the DCP's storeys,
 * and carries the LEP's metres alongside for the reader, never into a comparison.**
 *
 * ── WHAT THE FIRST RUN MEASURED, AND THE READING THE MISSION BRIEF DID NOT LIST ──
 *   356 of 1,841 determined DAs carry a storey count and a served X/Y.
 *   within-dcp-storeys .......... 224      no-dcp-storeys-polygon ....  29
 *   storeys-exceed-dcp .......... 100      dcp-storeys-non-numeric ....  3
 *
 *   Of the 100 exceedances: **88 are exactly +1 storey**, and **88 are "Alterations or additions
 *   to an existing building"**. The cl 4.6 variation flag is `Y` on only 50 of them.
 *
 * ⭐ THE BRIEF NAMED THREE POSSIBLE CAUSES — a missing SEPP override, an unapplied incentive, a
 * wrong measurement convention — AND THE MEASUREMENT SUPPORTS A FOURTH THAT IT DID NOT NAME:
 * **a development control plan is not a development standard.** A DCP is a guideline; cl 4.6
 * variations attach to LEP standards (the metric height), not to DCP controls, so a consent
 * authority may depart from a DCP storey map on merit with no variation of any kind. That is why
 * half the exceedances carry `EPIVariationProposedFlag = N` and are approved anyway, and why the
 * modal case is a terrace gaining one storey in a "2 storeys" area.
 *
 * ⛔ SO "APPROVED ABOVE RESOLVED" IS **NOT** A DEFECT SIGNAL ON ITS OWN, AND A GATE THAT TREATED
 * IT AS ONE WOULD FIRE 100 TIMES A YEAR IN ONE LGA AND BE MUTED WITHIN A WEEK. What survives as a
 * signal is the residue the guideline reading does NOT explain:
 *   • not an alteration to an existing building — so existing fabric cannot account for it, and
 *   • two or more storeys over — so it is not the systematic +1.
 * Measured: **4 of 356**. Those four are the ratchet.
 *
 * ── ARMS ─────────────────────────────────────────────────────────────────────
 *   ARM A — NO UNIT CONVERSION · hard-0. The captured DA records carry no metric height, and this
 *           gate's own comparator source contains no arithmetic between metres and storeys.
 *   ARM B — THE ">15" TRAP · hard-0. A non-numeric DCP storey value is never scored as a number.
 *           `parseInt(">15")` is NaN and `Number(">15")` is NaN, but a `.replace(/\D/g,'')` reader
 *           returns 15 — a limit where the plan states none.
 *   ARM C — UNRECONCILED CROSS-REFERENCES · shrink-only ratchet, baselined at 4. Each is closed by
 *           investigating it and recording what it was, never by widening the filter.
 *
 * ── TEETH ────────────────────────────────────────────────────────────────────
 *   T-1  a 20-storey approval over a ">15" polygon must NOT be scored as an exceedance
 *   T-2  a NEW-BUILD approval 3 storeys over must be flagged unreconciled
 *   T-3  an alteration exactly +1 over must NOT be flagged (or the ratchet is just a count of DAs)
 *
 * ── EXIT CODES ───────────────────────────────────────────────────────────────
 *   0 PASS · 1 FAIL (arm A or B) · 2 UNPROVEN (honesty floor / blind tooth) · 3 ARM C exceeded.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { nswReadStoreys } from '../../packages/site-parcel-data/src/rulepacks/au/nswDcpStoreys.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ ARM C — THE RATCHET. SHRINK-ONLY.
//
// Approvals the "a DCP is a guideline" reading does NOT explain: not an alteration to an existing
// building, AND two or more storeys over the DCP polygon. Baselined 2026-09-04 from the first run
// over the captured 2025 City of Sydney record set.
//
// ⛔ IT FALLS BY INVESTIGATING A ROW, NOT BY NARROWING THE FILTER. Adding "…and not a residential
// flat building" would take it to 1 and would be the forbidden fix wearing a predicate.
// §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836).
// ──────────────────────────────────────────────────────────────────────────────────────────────
const ARM_C_CEILING = 4;

/** Honesty floors — below these the gate is not measuring, and says so rather than passing. */
const MIN_RECORDS = 300;
const MIN_EXCEEDANCES = 1;

interface DaRecord {
    readonly pan: string;
    readonly councilRef: string | null;
    readonly address: string | null;
    readonly storeys: number;
    readonly epiVariation: string | null;
    readonly devTypes: readonly string[];
    readonly authority: string | null;
    readonly determined: string | null;
    readonly dcp: ReadonlyArray<{ Storeys: string | number | null; DCP_Name: string | null }>;
    readonly dcpMaxStoreys: number | null;
    readonly hob: ReadonlyArray<{ epi: string; v: string; units: string; clause: string }>;
    readonly verdict: string;
}
interface Fixture {
    readonly capturedAt: string;
    readonly endpoint: string;
    readonly pulled: number;
    readonly candidates: number;
    readonly records: readonly DaRecord[];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(
    HERE,
    '../../packages/site-parcel-data/__tests__/fixtures/nsw-onlineda-sydney-2025.json',
);
const DCP_MODULE = path.resolve(
    HERE,
    '../../packages/site-parcel-data/src/rulepacks/au/nswDcpStoreys.ts',
);

/** Alterations to an existing building: the existing fabric can account for the storey count. */
function isAlteration(r: DaRecord): boolean {
    return (r.devTypes ?? []).some((t) => /Alterations or additions/i.test(t));
}

/**
 * ⛔ THE SCORER. Storeys in, storeys out. It never sees `hob`.
 *
 * The DCP maximum is taken as the largest NUMERIC storey value among the intersecting polygons —
 * and only when EVERY intersecting polygon is numeric. One `">15"` in the set makes the whole
 * comparison non-numeric, because "more than 15" does not bound anything and taking the max of the
 * numeric subset would silently substitute a bound the plan declines to state.
 */
function score(r: DaRecord): 'exceeds' | 'within' | 'non-numeric' | 'no-polygon' {
    if (!r.dcp || r.dcp.length === 0) return 'no-polygon';
    const limits = r.dcp.map((d) => nswReadStoreys(d.Storeys));
    if (!limits.every((l) => l.kind === 'count')) return 'non-numeric';
    const max = Math.max(...limits.map((l) => (l.kind === 'count' ? l.maxStoreys : Number.NaN)));
    if (!Number.isFinite(max)) return 'non-numeric';
    return r.storeys > max ? 'exceeds' : 'within';
}

/** The residue the guideline reading does not explain. See the ARM C banner. */
function isUnreconciled(r: DaRecord): boolean {
    if (score(r) !== 'exceeds') return false;
    if (r.dcpMaxStoreys === null) return false;
    if (isAlteration(r)) return false;
    return r.storeys - r.dcpMaxStoreys >= 2;
}

function main(): number {
    let fx: Fixture;
    try {
        fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
    } catch (e) {
        console.error(`[nsw-da-crossref] UNPROVEN: cannot read the fixture at ${FIXTURE}: ${String(e)}`);
        return 2;
    }
    const records = fx.records ?? [];

    // ── Honesty floors ────────────────────────────────────────────────────────────────────────
    if (records.length < MIN_RECORDS) {
        console.error(
            `[nsw-da-crossref] UNPROVEN: ${records.length} joined record(s), floor is ${MIN_RECORDS}. ` +
                '"Looked nowhere" and "found nothing wrong" are different verdicts.',
        );
        return 2;
    }
    const exceed = records.filter((r) => score(r) === 'exceeds');
    if (exceed.length < MIN_EXCEEDANCES) {
        console.error(
            '[nsw-da-crossref] UNPROVEN: the capture contains no approval above its DCP storey ' +
                'polygon, so this gate is measuring nothing. Measured on the 2025 City of Sydney set, ' +
                '100 of 356 exceed — a capture with none is not representative and must be re-taken.',
        );
        return 2;
    }

    const findings: string[] = [];

    // ── ARM A — no unit conversion, anywhere. ─────────────────────────────────────────────────
    // A1: the source data has no metres of its own, so any metric comparison would be invented.
    const HEIGHT_KEY = /height|metre|meter|_m$/i;
    const withOwnHeight = records.filter((r) => Object.keys(r).some((k) => HEIGHT_KEY.test(k)));
    if (withOwnHeight.length > 0) {
        findings.push(
            `ARM A — ${withOwnHeight.length} DA record(s) carry a height-like field ` +
                `(${Object.keys(withOwnHeight[0]!).filter((k) => HEIGHT_KEY.test(k)).join(', ')}). ` +
                'The capture that this gate was reasoned about had none, so the storeys-only ' +
                'restriction may no longer be the honest reading. Re-establish it before comparing.',
        );
    }
    // A2: neither this gate nor the DCP module may divide or multiply across the two units.
    // ⚠ A SOURCE-LEVEL GUARD, LIKE THE `Math.min` ONE IN THE PRECEDENCE SUITE, AND FOR THE SAME
    // REASON: the invariant is that the code never ACQUIRES a converter, and only reading the
    // source can assert that. A behavioural test passes right up until someone adds the constant.
    for (const file of [fileURLToPath(import.meta.url), DCP_MODULE]) {
        let src: string;
        try {
            src = readFileSync(file, 'utf8');
        } catch {
            console.error(`[nsw-da-crossref] UNPROVEN: cannot read ${file} for the ARM A source guard.`);
            return 2;
        }
        const code = src
            .split('\n')
            .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
            .join('\n');
        // A floor-to-floor constant is the only way to convert, and it always looks like this.
        //
        // ⚠ THE PATTERN IS ASSEMBLED FROM FRAGMENTS BECAUSE ITS FIRST RUN FAILED ON ITSELF. Written
        // as one literal, the identifiers it hunts for appear IN this file, so the guard reported
        // its own source as a violation — a self-match, not a finding. Recorded rather than quietly
        // fixed: a source-level guard that can match its own definition will produce exactly one
        // confident false positive, and the reflex on seeing one is to weaken the guard.
        const converter = new RegExp(
            [
                String.raw`storey\w*\s*[*/]\s*\d`,
                String.raw`\d\s*[*/]\s*storey\w*`,
                'floor' + 'ToFloor',
                'FLOOR' + '_TO_FLOOR',
                'storey' + 'Height',
            ].join('|'),
            'i',
        );
        const m = converter.exec(code);
        if (m) {
            findings.push(
                `ARM A — ${path.basename(file)} contains ${JSON.stringify(m[0])}, which is arithmetic ` +
                    'between storeys and metres. The two axes are not inter-convertible: a ' +
                    'floor-to-floor constant invents a storey on a generous section and deletes one ' +
                    'on a tight one.',
            );
        }
    }

    // ── ARM B — the ">15" trap. ───────────────────────────────────────────────────────────────
    const gt15 = nswReadStoreys('>15');
    if (gt15.kind !== 'open-ended') {
        findings.push(
            `ARM B — nswReadStoreys(">15") returned kind='${gt15.kind}'. The DCP states no upper ` +
                'bound in storeys on 38 polygons; reading one there imposes a limit the plan declines ' +
                'to state.',
        );
    }
    const nonNumeric = records.filter((r) => score(r) === 'non-numeric');
    for (const r of nonNumeric) {
        if (r.dcpMaxStoreys !== null) {
            findings.push(
                `ARM B — ${r.pan} has a non-numeric DCP storey value ` +
                    `(${r.dcp.map((d) => JSON.stringify(d.Storeys)).join(', ')}) and a numeric ` +
                    `dcpMaxStoreys of ${r.dcpMaxStoreys}. A number was manufactured from a string ` +
                    'that is not one.',
            );
        }
    }

    // ── TEETH ─────────────────────────────────────────────────────────────────────────────────
    const teeth: string[] = [];
    const base = records.find((r) => score(r) === 'exceeds')!;
    const t1: DaRecord = {
        ...base,
        storeys: 20,
        dcp: [{ Storeys: '>15', DCP_Name: 'tamper' }],
        dcpMaxStoreys: null,
    };
    if (score(t1) === 'exceeds') {
        teeth.push('T-1: a 20-storey approval over a ">15" polygon was scored as an EXCEEDANCE — the open-ended value was read as a bound.');
    }
    const t2: DaRecord = {
        ...base,
        storeys: 6,
        devTypes: ['Residential flat building', 'Erection of a new structure'],
        dcp: [{ Storeys: '3', DCP_Name: 'tamper' }],
        dcpMaxStoreys: 3,
    };
    if (!isUnreconciled(t2)) {
        teeth.push('T-2: a NEW-BUILD approval three storeys over its DCP polygon was NOT flagged — ARM C is blind to the case it exists for.');
    }
    const t3: DaRecord = {
        ...base,
        storeys: 3,
        devTypes: ['Dwelling house', 'Alterations or additions to an existing building or structure'],
        dcp: [{ Storeys: '2', DCP_Name: 'tamper' }],
        dcpMaxStoreys: 2,
    };
    if (isUnreconciled(t3)) {
        teeth.push('T-3: the modal case (an alteration exactly one storey over) WAS flagged — ARM C is then a count of approvals, not a defect signal, and will be muted.');
    }
    if (teeth.length > 0) {
        console.error('[nsw-da-crossref] UNPROVEN — the gate cannot see what it polices:');
        for (const t of teeth) console.error(`  ${t}`);
        return 2;
    }

    // ── Verdict ───────────────────────────────────────────────────────────────────────────────
    const within = records.filter((r) => score(r) === 'within').length;
    const noPoly = records.filter((r) => score(r) === 'no-polygon').length;
    const plusOne = exceed.filter((r) => r.dcpMaxStoreys !== null && r.storeys - r.dcpMaxStoreys === 1).length;
    const alterations = exceed.filter(isAlteration).length;
    const varY = exceed.filter((r) => r.epiVariation === 'Y').length;
    console.log(
        `[nsw-da-crossref] ${fx.pulled} determined DAs pulled (${fx.endpoint}), ${records.length} ` +
            `joined at a served X/Y · within ${within} · exceeds ${exceed.length} · no polygon ` +
            `${noPoly} · non-numeric ${nonNumeric.length} · teeth T-1/T-2/T-3 all fired.`,
    );
    console.log(
        `[nsw-da-crossref] Of ${exceed.length} exceedances: ${plusOne} are exactly +1 storey, ` +
            `${alterations} are alterations to an existing building, ${varY} carry a cl 4.6 ` +
            'variation flag. ⭐ A development control plan is a GUIDELINE, not a development ' +
            'standard — it may be departed from on merit with no variation — so an exceedance is ' +
            'expected, not a defect. Only the residue below is a signal.',
    );

    if (findings.length > 0) {
        console.error(`[nsw-da-crossref] FAIL: ${findings.length} finding(s) on the hard-0 arms.`);
        for (const f of findings) console.error(`  ${f}`);
        return 1;
    }
    console.log('[nsw-da-crossref] ARM A (no unit conversion) OK · ARM B (">15" is not 15) OK.');

    const unreconciled = records.filter(isUnreconciled);
    if (unreconciled.length > ARM_C_CEILING) {
        console.error(
            `[nsw-da-crossref] ARM C RATCHET EXCEEDED: ${unreconciled.length} unreconciled ` +
                `cross-reference(s) > ceiling ${ARM_C_CEILING}.`,
        );
        for (const r of unreconciled) {
            console.error(
                `  ${r.pan} ${r.councilRef ?? ''} — ${r.storeys} storeys vs DCP ${r.dcpMaxStoreys} · ` +
                    `HOB ${r.hob.map((h) => `${h.v} ${h.units}`).join(' + ') || 'none'} · ` +
                    `cl 4.6 flag=${r.epiVariation ?? '?'} · ${r.address ?? ''}`,
            );
        }
        console.error(
            '  ⛔ Fix by INVESTIGATING a row — a missing SEPP override, an unapplied incentive, a ' +
                'stale DCP polygon, or a bad point join — and recording what it was. Narrowing the ' +
                'filter, or raising the ceiling, is the one forbidden fix.',
        );
        return 3;
    }
    console.log(
        `[nsw-da-crossref] ARM C: ${unreconciled.length} / ${ARM_C_CEILING} unreconciled ` +
            'cross-references (not an alteration, and 2+ storeys over):',
    );
    for (const r of unreconciled) {
        console.log(
            `  ${r.pan} ${r.councilRef ?? ''} — ${r.storeys} storeys vs DCP ${r.dcpMaxStoreys} · ` +
                `HOB ${r.hob.map((h) => `${h.v} ${h.units}`).join(' + ') || 'none'} · ` +
                `cl 4.6 flag=${r.epiVariation ?? '?'} · ${r.address ?? ''}`,
        );
    }
    console.log(
        '  ⚠ The HOB above is CARRIED, NOT COMPARED. Reading "8 storeys against 12 m" as a ' +
            'contradiction requires a floor-to-floor assumption this gate refuses to make; it is ' +
            'printed so a human with that judgement can exercise it.',
    );
    return 0;
}

process.exit(main());
