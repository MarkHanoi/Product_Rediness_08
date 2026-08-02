#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────────────────────
// TASK 3 — ANATOMY OF BARCELONA'S NON-ENVELOPE PARCELS.
//
// "Barcelona is the only city where the envelope engine works well, and nobody has ever
//  taxonomised what it CANNOT draw."  This measures it from the failures themselves.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS AND IS NOT
// ─────────────────────────────────────────────────────────────────────────────────────────────
// It is a PURE RE-CLASSIFICATION of an artefact that already exists:
// `out/barcelona.determination.json` (400 cadastral parcels drawn uniformly at random from the
// full Catastro INSPIRE CP urban population of INE 08019, each parcel weighing exactly 1, each
// point-resolved against the live AMB Refós `qualificacio_refos_3857/MapServer/16` field
// `CLAU_URB`).  **NO NETWORK CALL IS MADE HERE.**  Every count below traces to that file plus the
// per-clau disposition table in
// `packages/site-parcel-data/src/rulepacks/esBarcelonaZoneClassification.ts`.
//
// ⚠ It therefore INHERITS every limitation of the join, including the R1 deviation stated in
// `parcelDeterminationJoin.mjs` (it measures the zoning ROUTING, not `dispatchParcelBoundary`),
// and the two INHERITED sub-splits applied by a deterministic hash of the parcel ref rather than
// by a second engine run per parcel:
//   • `bcn-dissolve` — 96.22 % of block-ring dissolves succeed (L-676, 178/185 rings).
//   • `bcn-clau18`   — 26.4 % of clau 18 carries a parseable AMB Refós OV footprint (SIG-3).
// ⇒ For any parcel whose row carries `inherited`, the parcel-level assignment is a RATE APPLIED,
//   not a per-parcel measurement.  It is flagged `rateApplied: true` on every such record, and no
//   sub-mechanism (which of L-676's seven failure modes) can be read off an individual parcel.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// DETERMINISM
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Explicit integer seed + inline mulberry32 + Fisher–Yates over a ref-SORTED population, and NO
// timestamp anywhere in the output.  Running it twice is byte-identical, and the input file's
// sha256 is recorded so a changed input cannot masquerade as the same run.
//
// USAGE  node tools/cold-start-probe/task3-bcn-taxonomy.mjs
// ─────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = 20260803;          // explicit integer seed — change it and the draw changes, visibly
const SAMPLE_N = 100;           // exactly 100, as commissioned

// ── DETERMINISTIC PRNG (mulberry32, inline — Math.random is forbidden here) ──────────────────
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Fisher–Yates over a COPY, driven by the seeded PRNG. */
function shuffleSeeded(arr, seed) {
    const rnd = mulberry32(seed);
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Wilson score interval — inlined so this script has no cross-file dependency. */
function wilson(k, n, z = 1.96) {
    if (n === 0) return [0, 0];
    const p = k / n, d = 1 + (z * z) / n;
    const c = p + (z * z) / (2 * n);
    const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE FIVE BUCKETS, and the ONE discriminator that assigns them.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// DISCRIMINATOR, stated so it can be disputed:
//   STEP 1 — is this land inside the L-656 PRIVATE BUILDABLE set?  The determination join answers
//            this with `cat === 'nonBuildable'`.  If NO, the bucket is `legally-terminal`: the
//            land is PGM public domain / *sòl no urbanitzable* / *verd privat protegit*, the
//            shipped classification row is `legallyGrounded: true`, and acquiring the per-facility
//            or per-park *Pla Especial* would still not yield a private envelope. Nobody closes it.
//   STEP 2 — otherwise, route on WHAT THE SHIPPED CODE EMITS for that clau: the refusal `code`
//            and its `legallyGrounded` flag in `esBarcelonaZoneClassification.ts`.
//              `derived-plan`         → delegated-to-instrument-not-held
//              `regime-undetermined`  → awaiting-legal-interpretation  (⚠ see §INSTRUCTED-MAPPING)
//              `no-rule-pack` / a production `refuseConstructionIncomplete`
//                                     → missing-engineering-capability
//
// ⚠⚠ §INSTRUCTED-MAPPING — A BINDING INSTRUCTION THIS SCRIPT FOLLOWS AND SIMULTANEOUSLY DISPUTES.
// The commission states that `awaiting-legal-interpretation` "includes the `legallyGrounded:false`
// refusals".  It is followed: clau `22a` (:798) and bare `20a` (:1047) are bucketed there.
// **Both docstrings say the opposite of "the instrument's meaning is unresolved".**  :983 —
// *"The LAW is fully known and transcribed. What is missing is which of its ten branches applies
// to this parcel — a statement about PRYZM's INPUTS."*  :732 — *"The LAW is fully known — both
// halves of it."*  On the bucket definitions as written, both are `missing-authoritative-data`
// (20a) or a mix of that and `missing-engineering-capability` (22a — see the 1.08 % below).
// ⇒ Every such record carries `bucketAlternate` + `alternateEvidence`, and the output publishes
//   BOTH splits.  The `missing-authoritative-data` ZERO in the primary split is an ARTEFACT OF
//   THIS INSTRUCTED MAPPING, not an empirical absence — see `_zeroProof`.
//
// ⚠ THE ONLY BUCKET THAT IS PRYZM'S OWN GAP is `missing-engineering-capability`.

const B = {
    TERMINAL: 'legally-terminal',
    DELEGATED: 'delegated-to-instrument-not-held',
    DATA: 'missing-authoritative-data',
    ENGINEERING: 'missing-engineering-capability',
    LEGAL: 'awaiting-legal-interpretation',
};
const BUCKETS = [B.TERMINAL, B.DELEGATED, B.DATA, B.ENGINEERING, B.LEGAL];

const SRC = 'packages/site-parcel-data/src/rulepacks/esBarcelonaZoneClassification.ts';

/**
 * Per-clau rules.  Keyed by the determination join's `code` field (the live `CLAU_URB` value).
 * `evidence` names the FILE AND LINE that drove the bucket — never a paraphrase.
 */
const CLAU_RULES = {
    // ── DERIVED-PLAN, legallyGrounded: true — an instrument governs and PRYZM does not hold it ──
    '18': {
        bucket: B.DELEGATED,
        shippedRefusalCode: 'derived-plan',
        legallyGrounded: true,
        missing: 'the per-site approved *ordenació volumètrica* (RPUC/NUMAMB), one document per site',
        evidence: `${SRC}:185-207 — CLASSIFICATIONS row claus:['18'], code:'derived-plan', legallyGrounded:true (:206). `
            + 'Detail: "the PGM does not state the rule — it POINTS AT ANOTHER DOCUMENT, a different one per site". '
            + 'Join `why`: "Art. 306 — per-site approved volumetric ordering not held" (rate-applied, SIG-3: 26.4 % DOES carry a parseable AMB Refós OV footprint and scores `envelope`).',
        caveat: '⚠ CITATION DEFECT, outcome unaffected. refusal-audit.result.json barcelona-2 grades the shipped Art. 306 citation `incorrect`: '
            + '"Art. 306 is the USES article for clau 18 — its whole body is «condicions d\'ús». The article that terminates this parcel is Art. 334.1.b / 334.3.a." '
            + 'WRONG-CITATION / RIGHT-OUTCOME — it does not move the bucket.',
    },
    '15': { bucket: B.DELEGATED, shippedRefusalCode: 'derived-plan', legallyGrounded: true, missing: 'the PERI / pla especial / estudi de detall for the ámbito', evidence: `${SRC}:211-225 — CLASSIFICATIONS row claus:['14a','14b','15','16','17','17/6'], code:'derived-plan', legallyGrounded:true (:224).` },
    '16': { bucket: B.DELEGATED, shippedRefusalCode: 'derived-plan', legallyGrounded: true, missing: 'the PERI / pla especial / estudi de detall for the ámbito', evidence: `${SRC}:211-225 — CLASSIFICATIONS row claus:['14a','14b','15','16','17','17/6'], code:'derived-plan', legallyGrounded:true (:224).` },
    '14a': { bucket: B.DELEGATED, shippedRefusalCode: 'derived-plan', legallyGrounded: true, missing: 'the PERI / pla especial / estudi de detall for the ámbito', evidence: `${SRC}:211-225 — CLASSIFICATIONS row claus:['14a','14b','15','16','17','17/6'], code:'derived-plan', legallyGrounded:true (:224).` },
    '17/7': {
        bucket: B.DELEGATED,
        shippedRefusalCode: 'no-rule-pack (SHIPPED) vs derived-plan (PROBE)',
        legallyGrounded: false,
        missing: 'the PERI / pla especial for the ámbito — AND the suffix is absent from the shipped enumeration',
        evidence: `${SRC}:211 — the CLASSIFICATIONS claus array is ['14a','14b','15','16','17','17/6']. **'17/7' and '17/5' ARE NOT IN IT.** `
            + `The module forbids base-code fallback (${SRC}:23-25), so a '17/7' parcel misses the table, misses the pack, and falls to `
            + `barcelonaNoRulePackRefusal (${SRC}:614-639, code:'no-rule-pack', ordinanceRef:null, legallyGrounded:false) via registry.ts:1416. `
            + "CLOSURE-REGISTER row 6 states the consequence in terms: \"no ENUMERATED Barcelona clau is a coverage gap any more — the card is now the fallback for an unenumerated clau\". "
            + 'parcelDeterminationJoin.mjs:74 BCN_TAIL scores it `refusal-delegated` — a determination — which the shipped code does not emit.',
        caveat: '⚠ PROBE / SHIPPED-CODE DISAGREEMENT, and the ENVELOPE answer is unchanged either way (a derived plan still governs), '
            + 'so the bucket stays DELEGATED. The defect is that the user is told "PRYZM has not encoded this zone" when the law says the plan delegates it. '
            + 'Reported as a citation-quality defect, NOT counted in the engineering bucket, because closing it yields ZERO extra envelopes.',
    },
    '12b': {
        bucket: B.DELEGATED,
        shippedRefusalCode: 'derived-plan',
        legallyGrounded: true,
        missing: 'a DELIMITATION of *un tram de vial* — held by the Ciutat Vella *Pla especial de protecció del patrimoni* (2000) and the four PERIs, not by the general plan',
        evidence: `${SRC}:1189-1248 — barcelona12bNeighbourMeanRefusal, code:'derived-plan' (:1199), legallyGrounded:true (:1242). `
            + 'Detail :1226-1229 — "Ciutat Vella has those instruments … and your stretch is delimited there, not in the general plan". '
            + 'CLOSURE-REGISTER blocker 6 CLOSED as GOVERNANCE on Art. 320.2a (delegation to a *pla especial*) + Art. 316.3.',
        caveat: '⚠ The determination join classes 12b `refusal-terminal` ("permanent", parcelDeterminationJoin.mjs:98) while the shipped card is `derived-plan` — '
            + 'i.e. the join says nobody closes it, the card says an instrument closes it. Bucketed on the SHIPPED CARD. '
            + 'CLOSURE-REGISTER: "Reopens only on a *pla especial* or municipal instruction that DEFINES the *tram de vial*" ⇒ the alternate reading is legally-terminal.',
        alternate: B.TERMINAL,
        alternateWhy: 'CLOSURE-REGISTER row 6 closes it as a PERMANENT refusal and records a NEGATIVE EVIDENCE search (ICGC MDS/MDT, Open Data BCN, BCNROC, CIDO) that found no instrument defining the *tram*. If no held instrument in fact delimits it, nobody closes it.',
    },
    '22@': {
        bucket: B.DELEGATED,
        shippedRefusalCode: 'derived-plan',
        legallyGrounded: true,
        missing: "the site's PMU / *fitxa urbanística* / *plànol d'ordenació* — MPGM 22@ Art. 8.1 states no *profunditat edificable* at all",
        evidence: `${SRC}:803-838 §DEC-1 — "The rule is not absent, and it is not un-encoded: it is in the derived instrument for that site." `
            + "code:'derived-plan', legallyGrounded:true. parcelDeterminationJoin.mjs:97 scores it `refusal-terminal` (\"omission intentional in law\").",
        alternate: B.TERMINAL,
        alternateWhy: 'FOUNDER-CLOSED 2026-08-01 as a PERMANENT cited refusal; §DEC-1 records the omission as INTENTIONAL across BCNROC, the 2024 municipal Instrucció and the 2025 MPGM amendment.',
    },

    // ── legallyGrounded:false — the two slices the commission routes to awaiting-legal-interpretation ──
    '22a': {
        bucket: B.LEGAL,
        shippedRefusalCode: 'regime-undetermined',
        legallyGrounded: false,
        missing: 'WHICH of PGM Art. 350\'s two regimes governs the parcel (with vs. without a definitively-approved Pla Parcial)',
        evidence: `${SRC}:798 — barcelonaRegimeUndeterminedRefusal, code:'regime-undetermined', **legallyGrounded:false**. `
            + 'Routed here by the commission\'s binding rule that the `legallyGrounded:false` refusals belong to awaiting-legal-interpretation.',
        caveat: '⚠⚠ THE PRIMARY BUCKET IS DISPUTED BY TWO INDEPENDENT MEASUREMENTS. '
            + '(a) refusal-audit.result.json barcelona-1/3/4 (14 of 30 sampled Barcelona refusals) grade this `incorrect`: "Art. 350.2 … STATES a full direct ordinance '
            + '(FAR 2 m²st/m²s, ocupació 90 %/70 %, the 350.2.b block band, the 350.2.c/e heights) **which PRYZM has already implemented**. On no-Pla-Parcial land Art. 350.1 does not govern." '
            + '(b) esBarcelonaIndustrial.ts:428-442 BCN_22A_DELEGATION_MEASURED — a COMPLETE 81-polygon census of the AMB Refós `PLAN` field (2026-08-02) measures derivedPlanShare 0.9892 / generalPlanShare 0.0108. '
            + '⇒ THE REGIME SELECTOR EXISTS IN AN AUTHORITATIVE PUBLISHED FIELD. Wiring it converts 1.08 % of clau-22a land to an envelope PRYZM already holds the pack for '
            + '(missing-engineering-capability) and leaves 98.92 % genuinely delegated to ~2,600 Pla Parcials PRYZM does not hold (delegated-to-instrument-not-held). '
            + '**Neither share is "the instrument\'s meaning is unresolved".**',
        alternate: B.DELEGATED,
        alternateWhy: 'BCN_22A_DELEGATION_MEASURED: 98.92 % of clau-22a land is recorded by the AMB Refós as governed by a derived plan (~2,600 instruments, none held). The residual 1.08 % is missing-engineering-capability (wire the Refós `PLAN` field as the regime selector).',
        alternateSplit: { [B.DELEGATED]: 0.9892, [B.ENGINEERING]: 0.0108 },
    },
    '20a': {
        bucket: B.LEGAL,
        shippedRefusalCode: 'regime-undetermined',
        legallyGrounded: false,
        missing: 'the SUBZONE SUFFIX (`20a/N`) — every envelope figure in the zone is keyed to it; all ten subzones are already packed',
        evidence: `${SRC}:1047 — barcelona20aSubzoneUndeterminedRefusal, code:'regime-undetermined', **legallyGrounded:false**. `
            + "Routed here by the commission's binding rule.",
        caveat: '⚠⚠ THE PRIMARY BUCKET IS CONTRADICTED BY THE SHIPPED DOCSTRING ITSELF. '
            + `${SRC}:983 — "⚠ legallyGrounded: false. **The LAW is fully known and transcribed.** What is missing is which of its ten branches applies to this parcel — a statement about PRYZM's INPUTS." `
            + `And :1038-1042 — "The missing input is a single fact about your parcel: which subzone the ordering plan assigns it… **A municipal or metropolitan layer recording the suffix would resolve it outright — what is missing is that selector, not a rule.**" `
            + 'parcelDeterminationJoin.mjs:99 says the same: "missing SELECTOR not missing rule (L-673)". '
            + 'There is NO unresolved question of legal meaning here. On the bucket definitions as written this is `missing-authoritative-data`.',
        alternate: B.DATA,
        alternateWhy: 'No machine-readable authoritative source publishing the `20a/N` suffix has been demonstrated; the ordinance (Arts. 314.5 / 338.2 / 339 / 340 / 342 / 343) is read, transcribed and packed in bcn20aSubzones.ts.',
    },

    // ── PRODUCTION REFUSAL, no shipped legal ground: the block-ring dissolve ──────────────────
    '13b': {
        bucket: B.ENGINEERING,
        shippedRefusalCode: "refuseConstructionIncomplete('block-dissolve-refused')",
        legallyGrounded: null,
        missing: 'a block RING for this parcel — `dissolveParcelsToBlockRing` refuses, so Art. 242.2 has no illa to construct the profunditat from',
        evidence: 'parcelDeterminationJoin.mjs:93 inherited `bcn-dissolve`, elseCat `no-pack`, elseWhy "block-ring dissolve refuses (L-676)". '
            + "Production path: siteDispatch.ts:4307 refuseConstructionIncomplete('block-dissolve-refused') publishes NO envelope. "
            + 'The rule and pack exist and are cited (ADR-0271, Art. 242.2); only the geometry step fails. ⇒ PRYZM\'s own gap.',
        rateSource: 'L-676 §BLOCK-DISSOLVE-AUDIT — census of 185 rings (Eixample 108 + Ciutat Vella 77); 178 succeed = 96.22 %.',
    },
    '12': {
        bucket: B.ENGINEERING,
        shippedRefusalCode: "refuseConstructionIncomplete('block-dissolve-refused')",
        legallyGrounded: null,
        missing: 'a block RING for this parcel — `dissolveParcelsToBlockRing` refuses, so Art. 242.2 has no illa to construct the profunditat from',
        evidence: 'parcelDeterminationJoin.mjs:93 inherited `bcn-dissolve`, elseCat `no-pack`, elseWhy "block-ring dissolve refuses (L-676)". '
            + "Production path: siteDispatch.ts:4307 refuseConstructionIncomplete('block-dissolve-refused') publishes NO envelope. "
            + 'The rule and pack exist and are cited (ADR-0271, Art. 242.2); only the geometry step fails. ⇒ PRYZM\'s own gap.',
        rateSource: 'L-676 §BLOCK-DISSOLVE-AUDIT — census of 185 rings (Eixample 108 + Ciutat Vella 77); 178 succeed = 96.22 %.',
    },
    '13a': {
        bucket: B.ENGINEERING,
        shippedRefusalCode: "refuseConstructionIncomplete('block-dissolve-refused')",
        legallyGrounded: null,
        missing: 'a block RING for this parcel — `dissolveParcelsToBlockRing` refuses',
        evidence: 'parcelDeterminationJoin.mjs:93 inherited `bcn-dissolve`, elseCat `no-pack`. Same mechanism as 13b/12.',
        rateSource: 'L-676 §BLOCK-DISSOLVE-AUDIT — 178/185 rings = 96.22 %.',
    },
};

/**
 * The `nonBuildable` claus — STEP 1 of the discriminator.  Each carries the CLASSIFICATIONS row
 * that terminates it, or an explicit note that the clau is NOT ENUMERATED and reaches its answer
 * only through the weaker harmonised-MUC `S…` fallback.
 */
const NONBUILDABLE_RULES = {
    '6a': { code: 'public-open-space', line: '123-134', enumerated: true, what: 'PGM parcs i jardins urbans' },
    '6b': { code: 'public-open-space', line: '123-134', enumerated: true, what: 'PGM parcs i jardins urbans' },
    '6c': { code: 'public-open-space', line: '123-134', enumerated: true, what: 'PGM parcs i jardins urbans' },
    '7a': { code: 'facility-plan', line: '137-149', enumerated: true, what: 'PGM equipaments comunitaris i dotacions' },
    '7b': { code: 'facility-plan', line: '137-149', enumerated: true, what: 'PGM equipaments comunitaris i dotacions' },
    '7c': { code: 'facility-plan', line: '137-149', enumerated: true, what: 'PGM equipaments comunitaris i dotacions' },
    '28': { code: 'protected-soil', line: '152-166', enumerated: true, what: 'Collserola parc forestal — sòl no urbanitzable' },
    '29': { code: 'protected-soil', line: '152-166', enumerated: true, what: 'Collserola parc forestal — sòl no urbanitzable' },
    '9': { code: 'protected-soil', line: '152-166', enumerated: true, what: 'protective easement around a general system' },
    '27': { code: 'protected-soil', line: '152-166', enumerated: true, what: 'Collserola parc forestal — sòl no urbanitzable' },
    '5b': { code: 'public-system', line: '107-119', enumerated: true, what: 'PGM sistema (vies cíviques)' },
    '1a': { code: 'public-system', line: '107-119', enumerated: true, what: 'PGM sistema' },
    '1c': { code: 'public-system', line: '107-119', enumerated: true, what: 'PGM sistema' },
    '3': { code: 'public-system', line: '107-119', enumerated: true, what: 'PGM sistema viari bàsic' },
    '4': { code: 'public-system', line: '107-119', enumerated: true, what: 'PGM sistema' },
    '8a': { code: 'protected-private-green', line: '169-182', enumerated: true, what: 'verd privat protegit — PRIVATE land, deliberately unbuilt' },
    '5': { code: 'public-system (harmonised fallback only)', line: '305-322', enumerated: false, what: 'PGM sistema viari — bare `5` is NOT in the CLASSIFICATIONS claus arrays (only `5b` is)' },
    '7b-6b': { code: 'public-system (harmonised fallback only)', line: '305-322', enumerated: false, what: 'COMPOSITE clau — the module header (:270-302) states composites are open-ended and are caught by CODI_QUAL_MUC `S…`, not by enumeration' },
};

// ═════════════════════════════════════════════════════════════════════════════════════════════
// RUN
// ═════════════════════════════════════════════════════════════════════════════════════════════
const inPath = join(HERE, 'out', 'barcelona.determination.json');
const raw = readFileSync(inPath);
const sha256 = createHash('sha256').update(raw).digest('hex');
const j = JSON.parse(raw.toString('utf8'));

// ── Every parcel weighs 1. The join's own denominators, restated. ────────────────────────────
const assessed = j.rows.filter((r) => r.cat);                       // 0 transport failures in this file
const transportFailures = j.rows.filter((r) => !r.cat);
const buildable = assessed.filter((r) => r.cat !== 'nonBuildable'); // the L-656 private-buildable set
const nonEnvelopeAll = assessed.filter((r) => r.cat !== 'envelope');
const nonEnvelopeBuildable = buildable.filter((r) => r.cat !== 'envelope');
const URBAN_POPULATION = j.parcelPopulationUrban;   // the frame the 400 were drawn from

/** Classify ONE row into exactly one bucket, with the evidence that drove it. */
function classify(r) {
    const code = String(r.code ?? '(null)');
    if (r.cat === 'nonBuildable') {
        const nb = NONBUILDABLE_RULES[code];
        return {
            bucket: B.TERMINAL,
            shippedRefusalCode: nb ? nb.code : 'UNMAPPED',
            legallyGrounded: true,
            missing: null,
            evidence: nb
                ? `${SRC}:${nb.line} — CLASSIFICATIONS row, code:'${nb.code}', legallyGrounded:true. ${nb.what}. `
                  + `enumerated:${nb.enumerated}` + (nb.enumerated ? '' : ' ⚠ NOT ENUMERATED — reaches its answer only if the caller supplies `harmonisedCode` beginning `S` (registry.ts:1405-1409, hints.harmonisedCode). The AMB Refós layer this join reads publishes CLAU_URB, not CODI_QUAL_MUC; whether the production dispatch supplies the MUC code on this path is NOT established by this artefact.')
                : `⚠ clau "${code}" is outside both the CLASSIFICATIONS enumeration and NONBUILDABLE_RULES — join classed it nonBuildable at parcelDeterminationJoin.mjs:101 by DEFAULT BRANCH. Bucket asserted, evidence weak.`,
            enumerated: nb ? nb.enumerated : false,
            rateApplied: false,
        };
    }
    const rule = CLAU_RULES[code];
    if (!rule) {
        return {
            bucket: B.DELEGATED,
            shippedRefusalCode: 'UNMAPPED',
            legallyGrounded: null,
            missing: null,
            evidence: `⚠ UNMAPPED buildable clau "${code}" (join cat '${r.cat}', why "${r.why}"). No rule in CLAU_RULES — this is a HOLE in this taxonomy, not a finding about Barcelona.`,
            enumerated: null,
            rateApplied: Boolean(r.inherited),
            unmapped: true,
        };
    }
    return {
        bucket: rule.bucket,
        shippedRefusalCode: rule.shippedRefusalCode,
        legallyGrounded: rule.legallyGrounded,
        missing: rule.missing,
        evidence: rule.evidence,
        caveat: rule.caveat ?? null,
        bucketAlternate: rule.alternate ?? null,
        alternateEvidence: rule.alternateWhy ?? null,
        alternateSplit: rule.alternateSplit ?? null,
        rateSource: rule.rateSource ?? null,
        enumerated: code === '17/7' ? false : true,
        rateApplied: Boolean(r.inherited),
    };
}

const toRecord = (r) => {
    const c = classify(r);
    return {
        parcelRef: r.ref,
        clau: r.code ?? null,
        lat: r.lat, lon: r.lon,
        joinCategory: r.cat,
        joinWhy: r.why,
        inheritedSplit: r.inherited ?? null,
        bucket: c.bucket,
        evidence: c.evidence,
        shippedRefusalCode: c.shippedRefusalCode,
        legallyGrounded: c.legallyGrounded,
        whatIsMissing: c.missing ?? null,
        rateApplied: c.rateApplied,
        enumeratedInShippedTable: c.enumerated,
        bucketAlternate: c.bucketAlternate ?? null,
        alternateEvidence: c.alternateEvidence ?? null,
        caveat: c.caveat ?? null,
    };
};

// ── THE SEEDED DRAW — exactly 100, without replacement, from the ref-SORTED population ────────
const population = [...nonEnvelopeAll].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
const drawn = shuffleSeeded(population, SEED).slice(0, SAMPLE_N);
const sample = drawn.map(toRecord).sort((a, b) => (a.parcelRef < b.parcelRef ? -1 : a.parcelRef > b.parcelRef ? 1 : 0));
const census = population.map(toRecord);

const tally = (recs, key = 'bucket') => {
    const t = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    for (const r of recs) t[r[key] ?? r.bucket] += 1;
    return t;
};
const tallyAlternate = (recs) => {
    const t = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
    for (const r of recs) t[r.bucketAlternate ?? r.bucket] += 1;
    return t;
};

const sampleTally = tally(sample);
const censusTally = tally(census);
const sampleAlt = tallyAlternate(sample);
const censusAlt = tallyAlternate(census);

// ── ENGINEERING-BUCKET RANKING — by parcel count, broken down by WHAT is missing ─────────────
function rankEngineering(recs, label, denomAll, denomBuildable) {
    const groups = new Map();
    for (const r of recs) {
        if (r.bucket !== B.ENGINEERING) continue;
        const k = `${r.clau} · ${r.whatIsMissing}`;
        if (!groups.has(k)) groups.set(k, { clau: r.clau, missing: r.whatIsMissing, parcels: 0, refs: [], rateApplied: r.rateApplied });
        const g = groups.get(k);
        g.parcels += 1; g.refs.push(r.parcelRef);
    }
    // Roll the per-clau rows up into the MECHANISM they share, which is what a roadmap buys.
    const rows = [...groups.values()].sort((a, b) => b.parcels - a.parcels || (a.clau < b.clau ? -1 : 1));
    for (const g of rows) {
        g.refs.sort();
        g.shareOfSample = g.parcels / recs.length;
        g.ci95OfSample = wilson(g.parcels, recs.length);
    }
    const total = rows.reduce((s, g) => s + g.parcels, 0);
    return {
        label,
        engineeringParcels: total,
        ofNonEnvelopeSample: recs.length ? total / recs.length : null,
        ofAllAssessedParcels: total / denomAll,
        ofPrivateBuildableParcels: total / denomBuildable,
        ci95OfAllAssessed: wilson(total, denomAll),
        // ⚠ A PROJECTION, labelled as one: the measured share applied to the full urban cadastral
        // population. It is what a roadmap item is worth in parcels, and its width is the CI's.
        projectedUrbanParcels: {
            point: Math.round((total / denomAll) * URBAN_POPULATION),
            ci95: wilson(total, denomAll).map((x) => Math.round(x * URBAN_POPULATION)),
            base: URBAN_POPULATION,
            _note: 'Point estimate and 95 % Wilson interval scaled to the urban cadastral population. NOT a count of identified parcels.',
        },
        rows,
    };
}

// The engineering bucket in the 400-parcel FRAME (the honest denominator for a roadmap: what
// share of the city's parcels would a fix convert?).  Census counts, not the 100-sample, because
// the 100-sample is a 76 % subsample of a 131-parcel population and adds only noise here.
const engSample = rankEngineering(sample, 'seeded 100-parcel sample', assessed.length, buildable.length);
const engCensus = rankEngineering(census, 'full non-envelope census (all 131)', assessed.length, buildable.length);

// The alternate-reading engineering bucket: adds the measured 1.08 % of clau 22a whose regime
// selector IS published (AMB Refós `PLAN`).  Reported as an EXPECTED PARCEL COUNT, not an integer,
// because it is a rate applied to a slice — never dressed up as a per-parcel finding.
const clau22aCensus = census.filter((r) => r.clau === '22a').length;
const engAlternate = {
    _what: 'The engineering bucket under the DISPUTED reading of §INSTRUCTED-MAPPING. Fractional by construction — a measured RATE applied to a slice, not a parcel count.',
    dissolveRefusals: engCensus.engineeringParcels,
    clau22aRegimeSelectorWirable: {
        clau22aNonEnvelopeParcelsInCensus: clau22aCensus,
        generalPlanShare: 0.0108,
        expectedParcels: clau22aCensus * 0.0108,
        source: 'esBarcelonaIndustrial.ts:428-442 BCN_22A_DELEGATION_MEASURED — complete 81-polygon census of the AMB Refós `PLAN` field, 2026-08-02.',
    },
};

// ── L-676's SEVEN dissolve failures, by MECHANISM — the only sub-breakdown that exists ───────
const dissolveMechanism = {
    _what: 'What specifically fails inside `dissolveParcelsToBlockRing`. Source: CLOSURE-REGISTER row 4 (§BLOCK-DISSOLVE-AUDIT, L-676, CLOSED 2026-08-01) — a CENSUS of 185 rings, not a sample.',
    _warning: '⚠ THIS CANNOT BE ATTRIBUTED PER PARCEL. The determination join assigns dissolve failure by a deterministic HASH of the parcel ref at the 96.22 % city rate, so no individual parcel in the sample above carries a mechanism. These are the census proportions, and applying them to the sample would be inventing a per-parcel answer.',
    ringsMeasured: 185,
    ringsSucceeded: 178,
    ringsFailed: 7,
    successRate: 0.9622,
    byMechanism: [
        { mechanism: 'structural-input-defect', rings: 4, isPryzmGap: false, note: 'the PUBLISHED cadastral tiling is open or disjoint. CLOSURE-REGISTER: "a mechanism that is not ours". Re-dissolved across a 0.10→1.00 m tolerance ladder — `tolerance-tail` cases: ZERO. On the bucket definitions this is missing-authoritative-data, not engineering.' },
        { mechanism: 'disjoint-blocks-under-one-prefix', rings: 3, isPryzmGap: true, note: 'the 5-char refcat `manzanaPrefix` heuristic in server/parcelZoningProxy.js collected TWO REAL blocks. CLOSURE-REGISTER calls it a "residual lever (deferred, not refused)" and notes it is SHARED across Madrid/Córdoba/València. THIS is the buildable engineering item.' },
    ],
    additionalNamedDefect: {
        mechanism: 'C19 §7.3 vertex-cap hard-reject (KV-3)',
        rings: 1,
        isPryzmGap: true,
        note: 'Eixample manzana 00329 dissolves CORRECTLY to 326 vertices and is then hard-rejected by C19 §7.3. Counted in CLOSURE-REGISTER as a SEPARATE attribution from the 7 above — it is a ring that succeeded and was thrown away. ⚠ "must not be closed by silently simplifying a ring that feeds a compliance number".',
    },
    _honestyNote: '⇒ Of the 7 dissolve refusals, ~3 (43 %) are PRYZM\'s block-IDENTITY heuristic and ~4 (57 %) are a defect in the published cadastral tiling. Every dissolve-refusal parcel in this taxonomy is bucketed `missing-engineering-capability` — the CONSERVATIVE direction for a self-audit — but on the census mechanism split, roughly 4/7 of them belong in `missing-authoritative-data`.',
};

// ── BASELINES ────────────────────────────────────────────────────────────────────────────────
const envCount = assessed.filter((r) => r.cat === 'envelope').length;
const auditCorrected = JSON.parse(readFileSync(join(HERE, 'out', 'audit-corrected.json'), 'utf8'))
    .rows.find((r) => r.city === 'barcelona');

const out = {
    _what: 'TASK 3 — the anatomy of Barcelona\'s NON-ENVELOPE parcels: what the only working envelope engine cannot draw, taxonomised from the failures.',
    _method: 'Pure re-classification of out/barcelona.determination.json (no network). Seeded mulberry32 Fisher–Yates draw of exactly 100 from the ref-sorted non-envelope population. Buckets assigned from the SHIPPED per-clau disposition table in ' + SRC + '.',
    _determinism: { seed: SEED, prng: 'mulberry32 (inline)', shuffle: 'Fisher–Yates over a ref-sorted copy', timestampsInOutput: false, note: 'Two runs are byte-identical. The input sha256 below is the guard against a changed input masquerading as the same run.' },
    inputArtefact: { path: 'tools/cold-start-probe/out/barcelona.determination.json', sha256, joinSeed: j.seed, joinMeasuredAt: j.measuredAt, service: j.service },

    // ─────────────────────────────────────────────────────────────────────────────────────────
    baselines: {
        _unit: 'THE CADASTRAL PARCEL. Every parcel weighs exactly 1. No area weighting anywhere in this file.',
        parcelPopulationTotal: j.parcelPopulationTotal,
        parcelPopulationUrban: j.parcelPopulationUrban,
        sampled: j.sampled,
        assessed: assessed.length,
        transportFailures: transportFailures.length,
        envelopeParcels: envCount,

        uncorrected: {
            _source: 'out/barcelona.determination.json pct.ofBuildable',
            denominatorPrivateBuildableParcels: j.denominatorPrivateBuildableParcels,
            determination: j.pct.ofBuildable.determination,
            envelope: j.pct.ofBuildable.envelope,
            nonEnvelope: 1 - j.pct.ofBuildable.envelope,
        },
        auditCorrected: {
            _source: 'out/audit-corrected.json (auditCorrected.mjs) — moves clau 22a + bare 20a refusals to `no-pack` on the shipped `legallyGrounded:false` flag (' + SRC + ':798, :1047).',
            n: auditCorrected.n,
            moved: auditCorrected.moved,
            determination: auditCorrected.determination,
            envelope: auditCorrected.envelope,
            nonEnvelope: 1 - auditCorrected.envelope,
        },
        _findingOnTheCorrection: '⭐ THE AUDIT CORRECTION IS A NO-OP FOR THE NON-ENVELOPE FIGURE. auditCorrected.mjs:36 moves rows from `refusal-*` to `no-pack`; it never touches `envelope`. Both baselines therefore report the SAME envelope count ('
            + envCount + '/' + buildable.length + ') and the SAME non-envelope share. What the correction moves is DETERMINATION (98.0 % → 94.9 %), not envelope coverage. Any statement of the form "the non-envelope figure must be recomputed against the audit-corrected baseline" is arithmetically satisfied by construction.',
        _findingOn983: '⚠ 98.3 % is the AREA-base determination figure (COLD-START-PROBE-DENOMINATOR-AND-DETERMINATION.md §4.3). The PARCEL-base uncorrected figure in this artefact is 98.02 %. The 17.15 pp `legallyGrounded:false` share quoted in the framing is likewise on the AREA base; on the PARCEL base the same correction moves ' + auditCorrected.moved + '/' + auditCorrected.n + ' = ' + (100 * auditCorrected.moved / auditCorrected.n).toFixed(2) + ' pp.',
    },

    nonEnvelopePopulation: {
        _definitionA: 'D1 — non-envelope within the L-656 PRIVATE BUILDABLE set (the denominator the determination record scores on).',
        D1_denominator: buildable.length,
        D1_nonEnvelopeN: nonEnvelopeBuildable.length,
        D1_nonEnvelopePct: nonEnvelopeBuildable.length / buildable.length,
        D1_ci95: wilson(nonEnvelopeBuildable.length, buildable.length),
        _definitionB: 'D2 — non-envelope among ALL assessed urban cadastral parcels (adds the `nonBuildable` parcels: streets, parks, equipaments, Collserola). This is the LITERAL "the engine draws nothing here" population, and it is the only one large enough to draw 100 from.',
        D2_denominator: assessed.length,
        D2_nonEnvelopeN: nonEnvelopeAll.length,
        D2_nonEnvelopePct: nonEnvelopeAll.length / assessed.length,
        D2_ci95: wilson(nonEnvelopeAll.length, assessed.length),
        _drawnFrom: 'D2 — because D1 contains only ' + nonEnvelopeBuildable.length + ' parcels and a 100-parcel draw from it is impossible. The 100 are ' + (100 / nonEnvelopeAll.length * 100).toFixed(1) + ' % of D2, so the sample is close to a census and the FULL census is published alongside it.',
    },

    sampleOf100: {
        seed: SEED, n: sample.length,
        // ⭐⭐ PRIMARY = THE EVIDENCE-LED READING. The commission's instructed mapping was WRONG and
        // the founder has since said so: binding `legallyGrounded:false` → awaiting-legal-interpretation
        // contradicts the shipped docstrings at esBarcelonaZoneClassification.ts:983 and :1038, which
        // state plainly that what is missing is a SELECTOR — an INPUT — not a legal meaning
        // (:983 "The LAW is fully known and transcribed… a statement about PRYZM's INPUTS";
        //  :1038 "what is missing is that selector, not a rule").
        // The instructed mapping is retained in full below as `bucketCountsInstructedMapping` so the
        // two are diffable and neither is lost.
        _primaryReadingIs: 'evidence-led: legallyGrounded:false routed by what the shipped docstring says is missing (an input), not to awaiting-legal-interpretation',
        bucketCounts: sampleAlt,
        bucketPct: Object.fromEntries(BUCKETS.map((b) => [b, sampleAlt[b] / sample.length])),
        sumCheck: BUCKETS.reduce((s, b) => s + sampleAlt[b], 0),
        bucketCountsInstructedMapping: sampleTally,
        _whyInstructedMappingIsNotPrimary: 'The commission bound `legallyGrounded:false` to awaiting-legal-interpretation. Measured against the shipped code, that is wrong: clau 22a (:798/:983) and bare 20a (:1047/:1038) are the two slices whose docstrings describe a missing DATUM, not a contested meaning. Under the instructed mapping missing-authoritative-data reads 0, which is an artefact of the mapping and not a property of the city.',
        strata: {
            fromD1_privateBuildable: sample.filter((r) => r.joinCategory !== 'nonBuildable').length,
            fromNonBuildable: sample.filter((r) => r.joinCategory === 'nonBuildable').length,
            rateApplied: sample.filter((r) => r.rateApplied).length,
        },
        parcels: sample,
    },

    fullCensus: {
        _what: 'ALL ' + census.length + ' non-envelope parcels in the 400-parcel frame, classified by the same rules. Published because the 100-draw is a 76 % subsample of it and the census is strictly more informative.',
        n: census.length,
        _primaryReadingIs: 'evidence-led (see sampleOf100._primaryReadingIs)',
        bucketCounts: censusAlt,
        bucketPct: Object.fromEntries(BUCKETS.map((b) => [b, censusAlt[b] / census.length])),
        bucketCountsInstructedMapping: censusTally,
        byClau: (() => {
            const m = {};
            for (const r of census) {
                const k = `${r.bucket} | clau ${r.clau}`;
                m[k] = (m[k] ?? 0) + 1;
            }
            return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
        })(),
    },

    engineeringRanking: {
        _what: 'THE DELIVERABLE THAT MATTERS: the envelope roadmap measured from failures, not from an outside-in capability inventory. Ranked by PARCEL COUNT.',
        _warning: '⚠ This is the ONLY bucket that is PRYZM\'s own gap, and in Barcelona it is SMALL. That is the finding, not a measurement failure.',
        inSample100: engSample,
        inCensus131: engCensus,
        underDisputedMapping: engAlternate,
        dissolveMechanism,
    },

    _zeroProof: {
        _what: 'NEGATIVE-PROOF TREATMENT for the one bucket that scores ZERO in the primary split.',
        bucket: B.DATA,
        primaryCount: censusTally[B.DATA],
        verdict: 'ARTEFACT OF THE INSTRUCTED MAPPING — **not** an empirical absence, and it must not be read as one.',
        why: [
            'The commission binds `legallyGrounded:false` refusals to `awaiting-legal-interpretation`. The two Barcelona slices that carry that flag (clau 22a :798, bare 20a :1047) are EXACTLY the two whose shipped docstrings describe a missing DATUM, not a contested meaning: :983 "The LAW is fully known and transcribed… a statement about PRYZM\'s INPUTS", :1038 "what is missing is that selector, not a rule".',
            'Under the alternate reading published in `bucketCountsAlternateReading`, `missing-authoritative-data` is NOT zero.',
            'Checks the constraint asks for, and what each returns: AXIS ORDER — the join issues `geometry=<lon>,<lat>&inSR=4326` against an ArcGIS `esriGeometryPoint` (x,y = lon,lat), which is correct, and it resolved 400/400 with 0 transport failures and a plausible 11.75 % nonBuildable share; a swapped axis would have returned a uniform null. CRS — inSR=4326 against a 3857 service; the service reprojects, and 353/400 returned a private-buildable clau. MUNICIPALITY FILTER — the join draws its frame from the Catastro INSPIRE CP population for INE 08019 by ATTRIBUTE (catastroParcelFrame.mjs), never a bbox, and requests CODI_INE as an output field. ALTERNATE PARAMETERISATION — not applicable: this script issues no query.',
            '⚠ WHAT I CANNOT DISTINGUISH: whether a THIRD kind of missing-authoritative-data exists in Barcelona that this 400-parcel frame simply did not sample. A slice under ~0.75 % of urban parcels would be expected to miss a 400-draw entirely. This taxonomy can say the frame contains none; it cannot say the city contains none.',
        ],
    },

    _limits: [
        'R1 (inherited) — the determination join measures the ZONING ROUTING, not `dispatchParcelBoundary`. A defect between "the right clau was read" and "the right refusal was emitted" is invisible here. The refusal audit is the instrument for that.',
        'RATE-APPLIED PARCELS — ' + census.filter((r) => r.rateApplied).length + ' of ' + census.length + ' census records got their category from a deterministic hash at a city-measured rate (bcn-dissolve 96.22 %, bcn-clau18 26.4 %), not from a per-parcel engine run. Their BUCKET is sound (the mechanism is the same for every parcel in the slice); their IDENTITY is not — a different hash would name different parcels.',
        'The `nonBuildable` → `legally-terminal` step is a JUDGEMENT, stated: claus 6*/7* are refused because "buildability is set by a *Pla Especial* … never by a zone parameter" (' + SRC + ':128-130, :142-145), which is structurally a delegation. It is bucketed TERMINAL because acquiring that Pla Especial still yields no PRIVATE envelope on public-domain land — nobody closes it. Reclassifying all 6*/7* as delegated would move ' + census.filter((r) => ['6a', '6b', '6c', '7a', '7b', '7c'].includes(r.clau)).length + ' census parcels.',
        'Two non-envelope claus in this frame are NOT ENUMERATED in the shipped table and reach an answer only through weaker paths: bare `5` and the composite `7b-6b` (harmonised CODI_QUAL_MUC `S…` fallback, ' + SRC + ':305-322, conditional on the caller supplying `harmonisedCode`), and `17/7` (falls through to the generic `no-rule-pack` coverage-gap card). Closing the `17/5`/`17/7` enumeration gap yields ZERO extra envelopes, so it is reported as a citation-quality defect and deliberately kept OUT of the engineering bucket.',
    ],
};

const outDir = join(HERE, 'out');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'task3-bcn-taxonomy.json'), JSON.stringify(out, null, 1));

// ── CONSOLE SUMMARY ──────────────────────────────────────────────────────────────────────────
const pc = (x) => (x * 100).toFixed(2) + ' %';
console.log(`\nTASK 3 — BARCELONA NON-ENVELOPE ANATOMY   seed ${SEED}   input sha256 ${sha256.slice(0, 16)}…`);
console.log('─'.repeat(96));
console.log(`Unit: CADASTRAL PARCEL, weight 1.  Frame ${assessed.length} assessed of ${j.parcelPopulationUrban} urban (${j.parcelPopulationTotal} total).  Transport failures: ${transportFailures.length}`);
console.log(`\nBASELINES — envelope count is IDENTICAL under both (the correction moves refusal→no-pack, never envelope):`);
console.log(`  uncorrected     determination ${pc(j.pct.ofBuildable.determination)}   envelope ${pc(j.pct.ofBuildable.envelope)}   ⇒ NON-ENVELOPE ${pc(1 - j.pct.ofBuildable.envelope)}  (n=${j.denominatorPrivateBuildableParcels})`);
console.log(`  AUDIT-CORRECTED determination ${pc(auditCorrected.determination)}   envelope ${pc(auditCorrected.envelope)}   ⇒ NON-ENVELOPE ${pc(1 - auditCorrected.envelope)}  (n=${auditCorrected.n})`);
console.log(`\nNON-ENVELOPE POPULATION`);
console.log(`  D1 private-buildable : N=${nonEnvelopeBuildable.length} of ${buildable.length} = ${pc(nonEnvelopeBuildable.length / buildable.length)}  95% CI [${pc(wilson(nonEnvelopeBuildable.length, buildable.length)[0])}, ${pc(wilson(nonEnvelopeBuildable.length, buildable.length)[1])}]`);
console.log(`  D2 all urban parcels : N=${nonEnvelopeAll.length} of ${assessed.length} = ${pc(nonEnvelopeAll.length / assessed.length)}  95% CI [${pc(wilson(nonEnvelopeAll.length, assessed.length)[0])}, ${pc(wilson(nonEnvelopeAll.length, assessed.length)[1])}]`);
console.log(`\nFIVE-BUCKET SPLIT — seeded sample of exactly ${sample.length} (drawn from D2)`);
for (const b of BUCKETS) console.log(`  ${String(sampleTally[b]).padStart(4)}  ${pc(sampleTally[b] / sample.length).padStart(8)}  ${b}`);
console.log(`  ${String(BUCKETS.reduce((s, b) => s + sampleTally[b], 0)).padStart(4)}  ${'SUM'.padStart(8)}`);
console.log(`\n  alternate reading (disputed §INSTRUCTED-MAPPING):`);
for (const b of BUCKETS) console.log(`  ${String(sampleAlt[b]).padStart(4)}  ${pc(sampleAlt[b] / sample.length).padStart(8)}  ${b}`);
console.log(`\nFULL CENSUS of all ${census.length} non-envelope parcels`);
for (const b of BUCKETS) console.log(`  ${String(censusTally[b]).padStart(4)}  ${pc(censusTally[b] / census.length).padStart(8)}  ${b}`);
console.log(`\nENGINEERING BUCKET — ranked by parcel count (census, N=${census.length}):`);
if (engCensus.rows.length === 0) console.log('  (empty)');
for (const g of engCensus.rows) {
    console.log(`  ${String(g.parcels).padStart(3)} parcels  clau ${String(g.clau).padEnd(5)} — ${g.missing}`);
}
console.log(`  TOTAL ${engCensus.engineeringParcels} parcels = ${pc(engCensus.ofAllAssessedParcels)} of all assessed parcels, ${pc(engCensus.ofPrivateBuildableParcels)} of private-buildable parcels, 95% CI [${pc(engCensus.ci95OfAllAssessed[0])}, ${pc(engCensus.ci95OfAllAssessed[1])}]`);
console.log(`  PROJECTION → ${engCensus.projectedUrbanParcels.point} urban cadastral parcels (95% CI ${engCensus.projectedUrbanParcels.ci95[0]}–${engCensus.projectedUrbanParcels.ci95[1]} of ${URBAN_POPULATION})`);
console.log(`\n  mechanism (L-676 census of 185 rings — NOT attributable per parcel):`);
for (const m of dissolveMechanism.byMechanism) console.log(`    ${m.rings}/7  ${m.mechanism.padEnd(34)} PRYZM gap: ${m.isPryzmGap}`);
console.log(`    +1   ${dissolveMechanism.additionalNamedDefect.mechanism} (separate attribution)`);
console.log(`\n→ out/task3-bcn-taxonomy.json`);
