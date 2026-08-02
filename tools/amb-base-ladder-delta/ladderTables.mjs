#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR LADDERS — PARSED FROM THE RULEPACK SOURCE, NEVER HAND-TYPED.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ WHY PARSED AND NOT TYPED. The whole defect this run measures is a MISATTRIBUTION between two
//   numerically-plausible tables. A hand-typed copy of either one would be a fourth transcription of
//   figures that have already been transcribed wrong three times (`bcnAlcadaReguladora.ts` records
//   the recurrence). The bands are read out of the committed `.ts` and asserted against the shape
//   the source itself documents. If the source shape changes, this THROWS rather than silently
//   returning fewer bands.
//
// ⛔ READ-ONLY. A sibling Catalunya agent is sole owner of `bcnAlcadaReguladora.ts` and
//   `bcnAlcadaSemiintensiva.ts`. This module opens them for reading and never writes.
//
// ⚠ THE MAIN CHECKOUT IS THE SOURCE OF TRUTH, NOT THIS WORKTREE. The worktree branches from a stale
//   `origin/main`; the tables were applied under SIG-2 on local `main`. Reading the worktree copy
//   could silently read a PRE-SIG-2 table and produce a delta of ZERO for the wrong reason — the
//   most dangerous possible failure for this particular measurement. `RULEPACK_DIR` therefore
//   resolves to the MAIN CHECKOUT and the SIG-2 fingerprint below is asserted.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const MAIN_CHECKOUT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08';
export const RULEPACK_DIR = join(MAIN_CHECKOUT, 'packages', 'site-parcel-data', 'src', 'rulepacks');

function src(file) {
    const p = join(RULEPACK_DIR, file);
    if (!existsSync(p)) throw new Error(`rulepack source not found: ${p} — the read is UNKNOWN, not empty`);
    return readFileSync(p, 'utf8');
}

/**
 * Extract one `Object.freeze([...])` band array by its exported const name.
 * Accepts `Infinity` for the open top band. Returns bands in source order.
 */
function extractBands(text, constName) {
    // ⛔⛔ ANCHORED ON `export const`, AND THAT IS NOT PEDANTRY — THE LOOSE VERSION SILENTLY READ THE
    //    WRONG TABLE AND THE SIG-2 FINGERPRINT IS WHAT CAUGHT IT.
    //    The first version was `${constName}[^=]*=\s*Object\.freeze\(\[`. `BCN_ART327_BASE_METROPOLITAN_TABLE`
    //    is MENTIONED in a comment at line 75, ~66 lines BEFORE its declaration — and there is no `=`
    //    in the prose between that mention and line 141, which is where BARCELONA's table is
    //    declared. So the regex matched the comment mention and returned BARCELONA'S BANDS AS THE
    //    BASE LADDER. Every delta would have been exactly ZERO, the run would have looked clean, and
    //    it would have reported "the published figures stand" for entirely the wrong reason.
    //    ⇒ The known-answer fingerprint (base band 1 MUST be 8.55, Barcelona's MUST be 9.00) is the
    //      only reason this was not published. A probe without a known answer cannot catch this class.
    const re = new RegExp(`export const ${constName}\\s*(?::[^=]*?)?=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`);
    const m = re.exec(text);
    if (!m) throw new Error(`could not locate the DECLARATION of ${constName} in source — the source shape changed; fix the extractor, do not type the numbers`);
    const bands = [...m[1].matchAll(/\{\s*minWidth_m:\s*([\d.]+),\s*maxWidth_m:\s*(Infinity|[\d.]+),\s*height_m:\s*([\d.]+),\s*floorsAboveGround:\s*(\d+)\s*\}/g)]
        .map((b) => ({ minWidth_m: Number(b[1]), maxWidth_m: b[2] === 'Infinity' ? Infinity : Number(b[2]), height_m: Number(b[3]), floorsAboveGround: Number(b[4]) }));
    if (bands.length === 0) throw new Error(`${constName} matched but yielded ZERO bands — a parse that returns empty is the failure-vs-empty conflation; refusing`);
    return bands;
}

const ALC = src('bcnAlcadaReguladora.ts');
const SEMI = src('bcnAlcadaSemiintensiva.ts');

/** Art. 327.2a — clau 13a. Barcelona's MPGM-2007 modification. SIGNED SIG-2. */
export const ART327_BARCELONA_MPGM2007 = extractBands(ALC, 'BCN_ALCADA_REGULADORA_TABLE');
/** Art. 327.2a — clau 13a. The BASE metropolitan ladder. ⭐ NOTHING IN THE PRODUCT READS THIS. */
export const ART327_BASE_METROPOLITAN = extractBands(ALC, 'BCN_ART327_BASE_METROPOLITAN_TABLE');
/** Art. 328.2a — clau 13b (semiintensiva). Barcelona's MPGM-2007 modification. SIGNED SIG-2. */
export const ART328_BARCELONA_MPGM2007 = extractBands(SEMI, 'BCN_ALCADA_SEMIINTENSIVA_TABLE');
/** Art. 328.2a — clau 13b. The BASE metropolitan ladder. ⭐ NOTHING IN THE PRODUCT READS THIS. */
export const ART328_BASE_METROPOLITAN = extractBands(SEMI, 'BCN_ART328_BASE_METROPOLITAN_TABLE');

/**
 * §SIG-2 FINGERPRINT — asserted, because reading a PRE-SIG-2 file would yield a delta of ZERO for
 * entirely the wrong reason and the run would look clean.
 * Barcelona's Art. 327 band 1 is 9.00 m post-SIG-2 and 8.55 m pre-SIG-2. If they are equal the file
 * predates the signature and this measurement is meaningless.
 */
export function assertSig2Applied() {
    const b = ART327_BARCELONA_MPGM2007[0].height_m, m = ART327_BASE_METROPOLITAN[0].height_m;
    if (b === m) throw new Error(`SIG-2 FINGERPRINT FAILED: the "Barcelona" table equals the base table (${b} m). The source read predates SIG-2 — this measurement would report a false ZERO. Read the MAIN CHECKOUT on local main.`);
    if (b !== 9.0 || m !== 8.55) throw new Error(`SIG-2 FINGERPRINT FAILED: expected Barcelona band 1 = 9.00 m and base band 1 = 8.55 m; read ${b} / ${m}.`);
    return { ok: true, barcelonaBand1_m: b, baseBand1_m: m };
}

/**
 * ⭐⭐ THE STRUCTURAL FACT THAT DECIDES THE COVERAGE VERDICT, ASSERTED RATHER THAN ASSUMED.
 *
 * The base and the modified table share IDENTICAL width band boundaries and IDENTICAL storey
 * counts. `bcnAlcadaReguladora.ts` states it («READ THE floorsChange COLUMN FIRST: IT IS ZERO
 * EVERYWHERE») — but ⛔ THIS WHOLE EXERCISE EXISTS BECAUSE A REPO ASSERTION AND THE REPO'S
 * BEHAVIOUR DISAGREED, so the claim is re-derived from the parsed bands here rather than trusted.
 *
 * CONSEQUENCE, and it is the load-bearing one:
 *   • NO parcel changes width band under the substitution.
 *   • NO parcel changes storey count.
 *   • Therefore NO parcel changes ROUTE, changes REFUSAL CLASS, or gains/loses an envelope.
 *   ⇒ Every COVERAGE percentage is invariant under the substitution BY CONSTRUCTION.
 *   ⇒ What moves is the METRE VALUE, and only the metre value.
 */
export function bandStructureIdentity(modified, base, label) {
    const key = (t) => t.map((b) => `${b.minWidth_m}|${b.maxWidth_m}|${b.floorsAboveGround}`).join(' ; ');
    const identical = key(modified) === key(base);
    const deltas = modified.map((b, i) => ({
        floorsAboveGround: b.floorsAboveGround,
        bandLabel: b.maxWidth_m === Infinity ? `≥${b.minWidth_m} m` : `${b.minWidth_m}–${b.maxWidth_m} m`,
        modified_m: b.height_m,
        base_m: base[i]?.height_m ?? null,
        delta_m: base[i] ? +(b.height_m - base[i].height_m).toFixed(2) : null,
        floorsChange: base[i] ? b.floorsAboveGround - base[i].floorsAboveGround : null,
        bandBoundaryChange: base[i] ? (b.minWidth_m !== base[i].minWidth_m || b.maxWidth_m !== base[i].maxWidth_m) : null,
    }));
    return {
        label, identical,
        bandCountModified: modified.length, bandCountBase: base.length,
        deltas,
        floorsChangeIsZeroEverywhere: deltas.every((d) => d.floorsChange === 0),
        bandBoundariesUnchanged: deltas.every((d) => d.bandBoundaryChange === false),
        everyDeltaPositive: deltas.every((d) => d.delta_m !== null && d.delta_m > 0),
        deltaWidensWithHeight: deltas.every((d, i, a) => i === 0 || d.delta_m >= a[i - 1].delta_m),
        verdict: identical
            ? 'BAND STRUCTURE IDENTICAL — no parcel changes band and no parcel changes storey count under the substitution. Only the METRE VALUE moves.'
            : '⛔ BAND STRUCTURE DIFFERS — parcels COULD change band, so coverage is NOT invariant and must be re-measured parcel by parcel.',
    };
}

// ── THE STOREYS→METRES CONSTANTS the product extrapolates on, above the table's top band ─────────
// Read from source for the same reason the bands are.
function num(text, name) {
    const m = new RegExp(`export const ${name}\\s*=\\s*([\\d.]+)`).exec(text);
    if (!m) throw new Error(`could not read ${name} from source`);
    return Number(m[1]);
}
export const STOREY_MODULE_M = num(ALC, 'BCN_STOREY_MODULE_M');
export const GROUND_FLOOR_DATUM_M = num(ALC, 'BCN_GROUND_FLOOR_DATUM_M');

/**
 * ⚠⚠ §EXTRAPOLATION-DISCONTINUITY — A SECOND, SEPARATE DEFECT, FOUND WHILE MEASURING THE FIRST.
 *
 * `heightFromFloorsAboveGround()` has TWO branches:
 *   • floors ≤ 6 — return the BAND's certified height. After SIG-2 that is BARCELONA'S table.
 *   • floors > 6 — `GROUND_FLOOR_DATUM_M + STOREY_MODULE_M × floors`.
 *
 * The two constants are 5.5 and 3.05, and the module comment derives them EXPLICITLY from the BASE
 * table: «module = (23.8 − 8.55)/(6 − 1) = 3.05 m and base = 8.55 − 3.05 = 5.5 m». SIG-2 replaced the
 * table and DID NOT replace the constants.
 *
 * ⇒ The function is now internally inconsistent: PB+1…PB+6 come off Barcelona's 3.35 m/storey ladder
 *   and PB+7 upward off the base ladder's 3.05 m slope. At the seam:
 *       PB+6 → 25.75 m (table)        PB+7 → 5.5 + 3.05×7 = 26.85 m (extrapolated)
 *   — a whole extra storey buys 1.10 m. The function is NON-MONOTONIC IN THE STOREY MODULE.
 *
 * ⛔ THIS IS NOT THE DEFECT UNDER MEASUREMENT AND IT IS NOT FIXED HERE. It is recorded because
 *   `OV_Trames.PLANTES` reaches B+32, so the extrapolation branch is not a corner case — it is the
 *   branch that serves every tall parcel. Reported alongside, never merged into, the ladder delta.
 */
export function extrapolationSeam() {
    const top = ART327_BARCELONA_MPGM2007[ART327_BARCELONA_MPGM2007.length - 1];
    const topBase = ART327_BASE_METROPOLITAN[ART327_BASE_METROPOLITAN.length - 1];
    const slopeBarcelona = +((top.height_m - ART327_BARCELONA_MPGM2007[0].height_m) / (top.floorsAboveGround - 1)).toFixed(4);
    const slopeBase = +((topBase.height_m - ART327_BASE_METROPOLITAN[0].height_m) / (topBase.floorsAboveGround - 1)).toFixed(4);
    const nextFloor = top.floorsAboveGround + 1;
    const extrapolatedNext = +(GROUND_FLOOR_DATUM_M + STOREY_MODULE_M * nextFloor).toFixed(2);
    return {
        constants: { GROUND_FLOOR_DATUM_M, STOREY_MODULE_M },
        constantsDerivedFrom: 'the BASE table: (23.8 − 8.55)/5 = 3.05 and 8.55 − 3.05 = 5.5 — stated verbatim in the module comment',
        slope_m_per_storey: { barcelonaTable: slopeBarcelona, baseTable: slopeBase, extrapolationBranch: STOREY_MODULE_M },
        seam: { atFloors: top.floorsAboveGround, tableHeight_m: top.height_m, nextFloors: nextFloor, extrapolatedHeight_m: extrapolatedNext, gainForOneWholeStorey_m: +(extrapolatedNext - top.height_m).toFixed(2) },
        verdict: Math.abs(slopeBarcelona - STOREY_MODULE_M) < 1e-9
            ? 'consistent — the extrapolation slope matches the applied table'
            : `⛔ INCONSISTENT — the applied table's slope is ${slopeBarcelona} m/storey but the extrapolation branch uses ${STOREY_MODULE_M} m/storey (the BASE table's slope, left behind by SIG-2). Above PB+${top.floorsAboveGround} the function silently reverts to the base ladder's module for EVERY municipality including Barcelona.`,
        scope: 'SEPARATE DEFECT. Not measured by this run and not fixed by the proposed diff. Recorded so it is not lost.',
    };
}
