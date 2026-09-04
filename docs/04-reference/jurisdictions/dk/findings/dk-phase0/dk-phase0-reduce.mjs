#!/usr/bin/env node
// DK PHASE 0 — REDUCER. Turns the two raw samples into the D1-D6 numbers the DK master prompt's
// twenty determinations actually turn on.
//
// Lane ENVELOPE-NLDK, 2026-09-04.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS DOES NOT DO, STATED FIRST (R2 / R4)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It reduces WHAT THE SAMPLE HOLDS. The sample holds four keyless Plandata `_vedtaget` themes and
// DAWA's Matriklen mirror. It holds NO BBR, NO DHM, NO environmental/heritage/road overlay, and no
// Datafordeler anything — those are credential-gated and the gate probe recorded 401/403/404 per
// service. So NOTHING here is a statement about Danish data coverage in general; every figure is
// scoped to "the adopted Plandata planning stack, reachable without credentials".
//
// It also never converts a FIELD into a LEGAL EFFECT (R4). `bebygpct = 40` is measured as "the
// field is populated", never as "40% is buildable here" — the denominator (`bebygpctaf`) decides
// whether that number is usable at all, and D3 is the measurement of exactly that.
//
// USAGE: node dk-phase0-reduce.mjs

import fs from 'node:fs';

const SAMPLES = [
    ['land', 'dk-phase0-sample-land.json'],
    ['urban', 'dk-phase0-sample-urban.json'],
];

const RUNGS = ['byggefelt', 'lokalplandelomraade', 'lokalplan', 'kommuneplanramme'];

/** Rungs strongest -> weakest. A parcel's "reach" is the strongest rung carrying a feature. */
const RUNG_ORDER = ['byggefelt', 'lokalplandelomraade', 'lokalplan', 'kommuneplanramme'];

// ──────────────────────────────────────────────────────────────────────────────────────────────
// bebygpctaf — the CRITICAL denominator code (master §4.3).
//
// ⚠ THE FIRST DRAFT OF THIS FUNCTION WAS WRONG, AND THE WAY IT WAS WRONG IS WORTH KEEPING.
// It pattern-matched Danish PROSE ("grund" / "ejendom" / "helhed"), on the assumption that
// `bebygpctaf` carried a label. It does not: it carries an INTEGER 1-4. Every one of the 192
// populated values fell through to `OTHER:1` / `OTHER:2` / `OTHER:3` / `OTHER:4`, and the reducer
// duly reported "0.0% parcel-scoped and therefore computable" — a clean, plausible, totally false
// number that would have said Denmark publishes no usable denominator anywhere. That is a
// wrong-PROPERTY probe error (memory: probe-can-be-wrong-three-ways) reproduced exactly.
//
// The fix was NOT to guess what 1-4 mean. The repo already holds the codelist, IMPORTED from the
// state register and live-probed 2026-08-31:
//   packages/schemas/src/siteintel/vocabularies/dk.ts  (`pdk:theme_pdk_codelist_bygberegnaf_v`)
// and the code -> scope mapping is already SIGNED under L-449:
//   packages/site-parcel-data/src/rulepacks/dkPlandataEnvelope.ts `dkDensityScopeFromBygberegnaf`
//     1 = "Omraadet som helhed"   -> planningArea  (shared budget; NOT per-parcel)
//     2 = "Den enkelte ejendom"   -> property      (may span several matrikler; PRYZM lacks the
//                                                   property boundary, so NOT per-parcel)
//     3 = "Den enkelte grund"     -> parcel
//     4 = "Det enkelte jordstykke"-> parcel
// This reducer is a .mjs analysis script and cannot import the TS module, so the table is
// TRANSCRIBED below with its provenance — and the transcription is asserted against the shipped
// source in `dkBygberegnaf.test.ts` so the copy cannot drift silently.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Transcribed from vocabularies/dk.ts + dkDensityScopeFromBygberegnaf. Do not edit in isolation. */
const BYGBEREGNAF = {
    1: { da: 'Omraadet som helhed', en: 'the plan area as a whole', scope: 'planningArea' },
    2: { da: 'Den enkelte ejendom', en: 'the property/estate (BFE unit)', scope: 'property' },
    3: { da: 'Den enkelte grund', en: 'the individual plot', scope: 'parcel' },
    4: { da: 'Det enkelte jordstykke', en: 'the individual cadastral parcel', scope: 'parcel' },
};

function classifyBebygpctaf(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return 'ABSENT(no denominator served)';
    const n = typeof raw === 'number' ? raw : (/^\s*[0-9]+\s*$/.test(String(raw)) ? Number.parseInt(String(raw), 10) : null);
    if (n === null || !(n in BYGBEREGNAF)) {
        // A fifth value is a NATIONAL SCHEMA CHANGE and must be visible, never absorbed.
        return 'OUTSIDE-CODELIST:' + String(raw).trim().slice(0, 40);
    }
    const row = BYGBEREGNAF[n];
    return `${n}=${row.da} [${row.scope}]`;
}

/** Is this denominator one a per-parcel multiply may legally use? Codes 3 and 4 only (L-449). */
function isParcelScoped(raw) {
    const n = typeof raw === 'number' ? raw : (/^\s*[0-9]+\s*$/.test(String(raw ?? '')) ? Number.parseInt(String(raw), 10) : null);
    return n === 3 || n === 4;
}

/** Numeric-present test that does not read 0 as absent, and does not read "" as 0. */
function hasNum(v) {
    if (v === null || v === undefined || v === '') return false;
    const n = Number(v);
    return Number.isFinite(n);
}
function truthy(v) {
    if (v === null || v === undefined || v === '') return null; // UNKNOWN, not false
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    if (s === 'true' || s === 't' || s === '1' || s === 'ja') return true;
    if (s === 'false' || s === 'f' || s === '0' || s === 'nej') return false;
    return null;
}

function bump(m, k, by = 1) { m[k] = (m[k] ?? 0) + by; }
function pct(a, b) { return b === 0 ? 'n/a' : a + '/' + b + ' = ' + ((100 * a) / b).toFixed(1) + '%'; }

function reduceSample(label, file) {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rows = doc.rows;

    // ── D1 — ladder coverage ──────────────────────────────────────────────────────────────────
    const rungHits = Object.fromEntries(RUNGS.map((r) => [r, 0]));
    const reachHist = {};
    const anyPlanning = [];
    for (const r of rows) {
        let reach = 'NONE';
        for (const k of RUNG_ORDER) {
            const f = r.layers[k];
            if (Array.isArray(f) && f.length > 0) {
                rungHits[k]++;
                if (reach === 'NONE') reach = k;
            }
        }
        bump(reachHist, reach);
        if (reach !== 'NONE') anyPlanning.push(r);
    }

    // ── D2 — structured-field fill, PER RUNG. Measured on the rung's own features, so a
    //         kommuneplanramme number is never credited to a lokalplan.
    const FIELDS = {
        maxbygnhjd: ['maxbygnhjd'],
        maxetager: ['maxetager'],
        bebygpct: ['bebygpct'],
        eareal: ['eareal'],
        m3_m2: ['m3_m2'],
        boligenhed: ['boligenhed', 'maxboligenhed'],
    };
    const d2 = {};
    for (const rung of RUNGS) {
        const feats = [];
        for (const r of rows) for (const f of r.layers[rung] ?? []) feats.push(f);
        const row = { featuresSeen: feats.length };
        for (const [name, keys] of Object.entries(FIELDS)) {
            const n = feats.filter((f) => keys.some((k) => hasNum(f[k]))).length;
            row[name] = pct(n, feats.length);
        }
        d2[rung] = row;
    }

    // ── D3 — bebygpctaf denominator distribution. The master's CRITICAL field.
    const d3 = { byRung: {}, rawValues: {} };
    for (const rung of RUNGS) {
        const feats = [];
        for (const r of rows) for (const f of r.layers[rung] ?? []) feats.push(f);
        const withPct = feats.filter((f) => hasNum(f.bebygpct));
        const hist = {};
        for (const f of withPct) {
            const cls = classifyBebygpctaf(f.bebygpctaf);
            bump(hist, cls);
            if (f.bebygpctaf) bump(d3.rawValues, String(f.bebygpctaf).trim());
        }
        const computable = withPct.filter((f) => isParcelScoped(f.bebygpctaf)).length;
        d3.byRung[rung] = {
            featuresWithABebygpct: withPct.length,
            denominatorClass: hist,
            parcelScopedAndThereforeComputable: pct(computable, withPct.length),
        };
    }

    // ── D4 — honesty-flag census. iomfangreg = "the structured fields do NOT fully represent
    //         the regulation". The shipped mapper reads it NOWHERE. This is the exposure.
    const FLAGS = ['iomfangreg', 'ianvreg', 'izonereg', 'iudstykreg', 'kompleks',
        'bygvejledende', 'bygkunifelt', 'bygtillagtosh'];
    const d4 = {};
    for (const rung of RUNGS) {
        const feats = [];
        for (const r of rows) for (const f of r.layers[rung] ?? []) feats.push(f);
        if (feats.length === 0) continue;
        const row = { featuresSeen: feats.length };
        for (const flag of FLAGS) {
            if (!(flag in (feats[0] ?? {}))) continue;
            let t = 0, fa = 0, u = 0;
            for (const f of feats) {
                const v = truthy(f[flag]);
                if (v === true) t++; else if (v === false) fa++; else u++;
            }
            row[flag] = { true: t, false: fa, unknown: u, truePct: pct(t, feats.length) };
        }
        d4[rung] = row;
    }

    // ── D4b — THE ONE THAT MATTERS: of the features that DO publish a usable structured number,
    //          how many simultaneously say iomfangreg=true ("these fields are not the whole rule")?
    const d4b = {};
    for (const rung of RUNGS) {
        const feats = [];
        for (const r of rows) for (const f of r.layers[rung] ?? []) feats.push(f);
        const withHeight = feats.filter((f) => hasNum(f.maxbygnhjd));
        const contradicted = withHeight.filter((f) => truthy(f.iomfangreg) === true).length;
        const complexToo = withHeight.filter((f) => truthy(f.kompleks) === true).length;
        if (withHeight.length === 0) continue;
        d4b[rung] = {
            featuresPublishingAMaxHeight: withHeight.length,
            ofWhichIomfangregTrue: pct(contradicted, withHeight.length),
            ofWhichKompleksTrue: pct(complexToo, withHeight.length),
        };
    }

    // ── D4c — ⭐ THE FINDING. Is `iomfangreg` a PREDICTOR of the dimensional fields being empty?
    //          If iomfangreg=true never co-occurs with a published number, the flag is not an
    //          OVERSTATEMENT risk (it never contradicts a number we would draw) — it is a
    //          REFUSAL-QUALITY field: it says WHY the number is missing, with legal grounding.
    const d4c = {};
    for (const rung of RUNGS) {
        const feats = [];
        for (const r of rows) for (const f of r.layers[rung] ?? []) feats.push(f);
        if (feats.length === 0 || !('iomfangreg' in (feats[0] ?? {}))) continue;
        const yes = feats.filter((f) => truthy(f.iomfangreg) === true);
        const no = feats.filter((f) => truthy(f.iomfangreg) === false);
        const shape = (set) => ({
            n: set.length,
            maxbygnhjd: pct(set.filter((f) => hasNum(f.maxbygnhjd)).length, set.length),
            bebygpct: pct(set.filter((f) => hasNum(f.bebygpct)).length, set.length),
            maxetager: pct(set.filter((f) => hasNum(f.maxetager)).length, set.length),
        });
        d4c[rung] = { iomfangregTrue: shape(yes), iomfangregFalse: shape(no) };
    }

    // ── D5 — zone. R8: landzone is CONDITIONAL, never automatic no-build.
    //   ⚠ `zone` is an INTEGER CODE, and the register ALSO serves the verbatim Danish label in
    //   `zonestatus` — so the code meaning is EVIDENCED by the data, never guessed. Both are
    //   reported as a PAIR for exactly that reason. Codes 4 and 7 are COMPOSITE ("Byzone og
    //   landzone", "Byzone, landzone og sommerhusområde"): a parcel under one of those cannot
    //   have its zone regime settled from the feature alone, and collapsing it to "byzone" would
    //   silently convert a landzone parcel (where a landzonetilladelse is REQUIRED) into an
    //   unconditional one. That is an R8 violation, so the pair is kept and the composite named.
    const d5 = { byParcel: {}, codeToLabelPairsObserved: {} };
    for (const r of rows) {
        let z = null;
        for (const k of RUNG_ORDER) {
            const f = (r.layers[k] ?? [])[0];
            if (f && (f.zone !== null && f.zone !== undefined && f.zone !== '')) {
                z = String(f.zone) + ' = ' + String(f.zonestatus ?? '(no zonestatus label served)');
                break;
            }
        }
        bump(d5.byParcel, z ?? '(no zone published at the point)');
    }
    for (const r of rows) {
        for (const k of RUNG_ORDER) {
            for (const f of r.layers[k] ?? []) {
                if (f.zone === null || f.zone === undefined || f.zone === '') continue;
                bump(d5.codeToLabelPairsObserved, String(f.zone) + ' = ' + String(f.zonestatus ?? '(none)'));
            }
        }
    }

    // ── D6 — deterministic vs conditional vs unresolved, per parcel. The determinations 16-18
    //         partition, computed with the honesty flags HONOURED (which is the entire point).
    const d6 = {};
    const d6Detail = {};
    for (const r of rows) {
        let strongest = null, rungName = null;
        for (const k of RUNG_ORDER) {
            const f = (r.layers[k] ?? [])[0];
            if (f) { strongest = f; rungName = k; break; }
        }
        if (!strongest) { bump(d6, 'F2_or_F1_NO_PLAN_AT_POINT'); continue; }
        const h = hasNum(strongest.maxbygnhjd);
        const p = hasNum(strongest.bebygpct);
        const denomOk = p && isParcelScoped(strongest.bebygpctaf);
        const iomfang = truthy(strongest.iomfangreg) === true;
        const kompleks = truthy(strongest.kompleks) === true;
        const landzone = /landzone/i.test(String(strongest.zone ?? strongest.zonestatus ?? ''));

        let cls;
        if (kompleks) cls = 'CONDITIONAL_kompleks_route_to_document';
        else if (iomfang && (h || p)) cls = 'CONDITIONAL_iomfangreg_fields_incomplete';
        else if (h && denomOk) cls = 'DETERMINISTIC_height_and_parcel_scoped_pct';
        else if (h && p && !denomOk) cls = 'PARTIAL_height_only_pct_denominator_unusable';
        else if (h) cls = 'PARTIAL_height_only';
        else if (p && denomOk) cls = 'PARTIAL_pct_only';
        else cls = 'UNRESOLVED_plan_present_no_usable_number';
        if (landzone) cls += '+LANDZONE_CONDITIONAL';
        bump(d6, cls);
        bump(d6Detail, rungName + ' :: ' + cls);
    }

    return {
        label,
        source: { file, sampled: doc.sampled, skipped: doc.skipped, skipReasons: doc.skipReasons, seed: doc.seed, stratum: doc.stratum },
        D1_ladderCoverage: {
            parcels: rows.length,
            featurePresentPerRung: Object.fromEntries(RUNGS.map((k) => [k, pct(rungHits[k], rows.length)])),
            strongestRungReached: reachHist,
            anyPlanningInstrument: pct(anyPlanning.length, rows.length),
        },
        D2_structuredFieldFill: d2,
        D3_bebygpctafDenominator: d3,
        D4_honestyFlags: d4,
        D4b_numbersContradictedByTheirOwnFlag: d4b,
        D4c_iomfangregPredictsEmptyFields: d4c,
        D5_zone: d5,
        D6_partition: { classes: d6, byRung: d6Detail },
    };
}

const out = {
    generatedAt: new Date().toISOString(),
    lane: 'ENVELOPE-NLDK',
    spec: 'DK-ENVELOPE-MASTER-PROMPT.md — D1..D6 (see dk-phase0-parcels.mjs header)',
    scopeCaveat:
        'Adopted Plandata themes + DAWA Matriklen mirror ONLY, both keyless. No BBR, no DHM, no ' +
        'environmental/heritage/road overlay, no Datafordeler — all credential-gated (see ' +
        'dk-phase0-gates.json: 401 MAT, 401 GeoDanmark, 403 BBR, 404 DHM). Nothing here is a ' +
        'statement about Danish data coverage in general.',
    samples: SAMPLES.map(([label, file]) => reduceSample(label, file)),
};

fs.writeFileSync('dk-phase0-report.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
console.error('\nWROTE dk-phase0-report.json');
