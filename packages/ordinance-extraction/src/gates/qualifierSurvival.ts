// GATE — QUALIFIER SURVIVAL: did every semantic qualifier in the cited span reach
// a typed seat on the emitted claim?
//
// ⭐ THIS IS THE GATE COMPASS DOES NOT HAVE, AND THE ONE EUROPE NEEDS MOST.
// `gates/containment.ts` catches FABRICATION — text the model invented. It is
// structurally incapable of catching OMISSION: a model that quotes three words
// verbatim and drops the qualifying clause scores 1.0 on containment. For a
// European ordinance that omission IS the overstatement:
//
//     "Die Fassadenhöhe beträgt HÖCHSTENS 21 m"          → 21 becomes a floor, not a ceiling
//     "gilt NICHT FÜR Garagen und Nebenanlagen"          → an exception becomes a rule
//     "SOFERN ein Gestaltungsplan vorliegt"              → a condition becomes unconditional
//     "hauteur … SOUS RÉSERVE DE l'article UA 10.3"      → a deferral becomes a determination
//     "Orientierungswert" (DE) / "rekomendacinio" (LT)   → advice becomes binding
//
// Each of those is §L-616 (`envelope-solid-overstates-partial-data`) arriving
// through a new door, and each is a direct breach of E4 CONTROL 8 — *semantic
// qualifiers for every load-bearing planning value must survive normalization*.
// This file is control 8 turned into an executable check.
//
// COUNTRY-AGNOSTIC CORE, PER-COUNTRY LEXICON (control 5). Nothing here knows a
// German or French word: the vocabulary is a {@link QualifierLexicon} the country
// adapter supplies as DATA, exactly as `JurisdictionGrammar` already works.
//
// ⚠ WHAT THIS GATE CANNOT DO, said plainly so nobody reads more into a `pass`:
// it checks that a qualifier PRESENT IN THE SPAN was CARRIED. It cannot check that
// a qualifier the span does not contain — because the extractor quoted too narrow a
// span, or because it lives three sentences away — was honoured. A narrow quote
// with all its qualifiers carried passes. That is a real gap, it is named here
// rather than hidden, and it is why the span a retriever returns should be a whole
// sentence or a whole table row, never a fragment.
//
// Pure: span + lexicon + carried seats → verdict. No I/O.

import { type GateResult } from '../types.js';

/**
 * WHAT KIND of qualification a phrase expresses — the axis that says which TYPED
 * SEAT should have caught it. These map onto seats that already exist; no new
 * canonical entity is minted (control 2):
 *   - `bound`         — the value is a maximum/minimum, not a point value
 *                       ("höchstens", "au plus", "mindestens"). Seat: the rule's
 *                       own comparison operator / RASE `requirement`.
 *   - `exception`     — the requirement is DISAPPLIED somewhere ("gilt nicht für",
 *                       "sauf", "excepto"). Seat: RASE `exception` (E1b).
 *   - `condition`     — it binds only if something holds ("sofern", "sous réserve
 *                       de", "Gestaltungsplanpflicht"). Seat: RASE `applicability`
 *                       + the rule's `applicability.predicate`.
 *   - `applicability` — it binds only somewhere/somewhen ("nur für", "im Bereich",
 *                       a percentage of the parcel). Seat: RASE `applicability`.
 *   - `force`         — it is advisory rather than binding ("Orientierungswert",
 *                       "vejledende", "rekomendacinio pobūdžio"). Seat: R5
 *                       `RuleProvenance.normativeForce`.
 *   - `basis`         — it names WHAT the value is measured against ("der
 *                       anrechenbaren Grundstücksfläche", "bruttoetageareal").
 *                       Seat: R2 `RuleProvenance.valueBasis`.
 *   - `temporal`      — it names a validity window or a pending change. Seat: R3
 *                       `validityBasis` + `valid_from`/`valid_to`.
 */
export type QualifierKind =
    | 'bound'
    | 'exception'
    | 'condition'
    | 'applicability'
    | 'force'
    | 'basis'
    | 'temporal';

/** One qualifier phrase a jurisdiction uses. */
export interface QualifierPattern {
    /** Stable id recorded on the verdict (e.g. `de-hoechstens`). */
    readonly id: string;
    /** The phrase. Matched case-insensitively against the span. */
    readonly pattern: RegExp;
    readonly kind: QualifierKind;
    /**
     * For `kind: 'bound'` ONLY — which DIRECTION the phrase bounds in.
     *
     * ⭐ ADDED 2026-09-02 (lane E8-SPINE) FOR A MEASURED OVERSTATEMENT, not for
     * symmetry. Running the spine over a real Berlin Bebauungsplan-Begründung
     * (`0100062b_1-62b.pdf`, cached, 2,513,468 bytes) emitted:
     *
     *     maxHeight_m = 19   from   "einer MINDESTbauhöhe (Oberkante) von 19,0 m"
     *
     * A MINIMUM published as a MAXIMUM — the envelope ceiling set from a floor.
     * That is §L-616 (`envelope-solid-overstates-partial-data`) in its purest
     * form, and it auto-accepted. Carriage alone cannot catch it: the word
     * "Mindestbauhöhe" could be copied into every seat on the claim and the value
     * would still be a floor wearing a ceiling's name. Only POLARITY catches it.
     */
    readonly polarity?: 'min' | 'max';
    /** One line a human reads: what this phrase does to the value. */
    readonly detail: string;
}

/** A jurisdiction's qualifier vocabulary — DATA, supplied by a country adapter. */
export interface QualifierLexicon {
    /** Language/jurisdiction tag, e.g. `'de-CH'`, `'fr'`. */
    readonly language: string;
    readonly patterns: readonly QualifierPattern[];
}

/** One qualifier found in the span, and whether it survived. */
export interface QualifierFinding {
    readonly id: string;
    readonly kind: QualifierKind;
    /** The exact text matched in the span. */
    readonly matched: string;
    /** True when that text is present in at least one carried seat. */
    readonly carried: boolean;
    /**
     * True when the phrase bounds in the OPPOSITE direction to the parameter —
     * a minimum read into a maximum, or the reverse. Always a `flag`, and it is
     * NOT redeemable by carriage.
     */
    readonly polarityConflict: boolean;
    readonly detail: string;
}

/** What the qualifier gate needs. */
export interface QualifierSurvivalInput {
    /** The cited span, VERBATIM, exactly as it will be shown to a reviewer. */
    readonly span: string;
    /** The jurisdiction's qualifier vocabulary. */
    readonly lexicon: QualifierLexicon;
    /**
     * The TEXT held in the claim's typed qualifier seats — RASE
     * requirement/applicability/selection/exception, `normativeForce`,
     * `valueBasis.code`, an applicability predicate rendered as text, a confidence
     * `note`. Order and origin do not matter; presence does.
     */
    readonly carried: readonly string[];
    /**
     * Which direction the TARGET PARAMETER bounds in — `'max'` for `maxHeight_m` /
     * `maxFloors` / `maxFAR` / `maxCoverage`, `'min'` for `minParcelArea_m2` and
     * for a setback (a setback is a minimum distance). `null`/omitted when the
     * parameter has no polarity or the caller does not know.
     *
     * Country-agnostic (control 5): the CALLER states the parameter's polarity and
     * the LEXICON states the phrase's; this file only compares them.
     */
    readonly parameterPolarity?: 'min' | 'max' | null;
}

/** The gate's verdict plus every finding behind it. */
export interface QualifierSurvivalResult {
    readonly gate: GateResult;
    readonly findings: readonly QualifierFinding[];
}

/** Case/whitespace-insensitive containment of `needle` in any carried seat. */
function isCarried(needle: string, carried: readonly string[]): boolean {
    const norm = (s: string): string => s.toLowerCase().replace(/\s+/gu, ' ').trim();
    const n = norm(needle);
    if (n === '') return false;
    return carried.some((c) => norm(c).includes(n));
}

/**
 * Run the qualifier-survival check.
 *   - `not-applicable` — the span contains no qualifier this lexicon knows. ⚠ NOT
 *                        a pass: it means "nothing to check here", and a lexicon
 *                        that is thin will say this often. Read it as a statement
 *                        about the LEXICON as much as about the span.
 *   - `pass`           — every qualifier found in the span is present in a seat.
 *   - `flag`           — at least one is not. Route to a human; do NOT publish the
 *                        value as if the ordinance had stated it unconditionally.
 */
export function qualifierSurvivalGate(input: QualifierSurvivalInput): QualifierSurvivalResult {
    const findings: QualifierFinding[] = [];
    for (const p of input.lexicon.patterns) {
        const re = new RegExp(p.pattern.source, p.pattern.flags.replace(/[gy]/g, '') + 'i');
        const m = re.exec(input.span);
        if (m === null) continue;
        const polarityConflict =
            p.polarity !== undefined &&
            input.parameterPolarity !== undefined &&
            input.parameterPolarity !== null &&
            p.polarity !== input.parameterPolarity;
        // ⭐ A BOUND THAT AGREES WITH THE PARAMETER IS CARRIED BY THE PARAMETER.
        // "höchstzulässige … GRZ von 0,5" written to `maxCoverage` has not lost its
        // ceiling: the seat that records it is the parameter's own semantics, and
        // demanding the WORD as well would flag every correctly-read maximum in the
        // corpus. A gate that flags everything is as useless as one that flags
        // nothing. The DISAGREEING case is handled above and is never redeemable.
        const carriedByParameter =
            p.kind === 'bound' &&
            p.polarity !== undefined &&
            input.parameterPolarity !== undefined &&
            input.parameterPolarity !== null &&
            p.polarity === input.parameterPolarity;
        findings.push({
            id: p.id,
            kind: p.kind,
            matched: m[0],
            carried: carriedByParameter || isCarried(m[0], input.carried),
            polarityConflict,
            detail: p.detail,
        });
    }

    if (findings.length === 0) {
        return {
            findings,
            gate: {
                gate: 'qualifier',
                verdict: 'not-applicable',
                detail:
                    `No qualifier in the ${input.lexicon.language} lexicon (${input.lexicon.patterns.length} ` +
                    `phrase(s)) appears in the cited span — nothing to check. This is NOT a statement ` +
                    `that the value is unqualified.`,
                token: 'qualifier:not-applicable',
            },
        };
    }

    // ── POLARITY FIRST. A bound that points the WRONG WAY is not a carriage
    // problem and carriage cannot redeem it: the value is a floor wearing a
    // ceiling's name (or the reverse), and publishing it sets the envelope from
    // the wrong end. This branch outranks every other verdict.
    const inverted = findings.filter((f) => f.polarityConflict);
    if (inverted.length > 0) {
        return {
            findings,
            gate: {
                gate: 'qualifier',
                verdict: 'flag',
                detail:
                    `POLARITY CONFLICT — ${inverted.length} qualifier(s) in the cited span bound in the ` +
                    `OPPOSITE direction to the target parameter (${input.parameterPolarity}): ` +
                    inverted.map((f) => `${f.id}("${f.matched}")`).join('; ') +
                    `. The span states the opposite bound and the value is being written ` +
                    `to a ${input.parameterPolarity ?? '?'}imum seat. Publishing it would set the envelope ` +
                    `from the wrong end (control 8 / L-616). This is NOT redeemable by carrying the ` +
                    `qualifier text: the direction is wrong, not the wording.`,
                token: 'qualifier:flag-polarity',
            },
        };
    }

    const lost = findings.filter((f) => !f.carried);
    if (lost.length === 0) {
        return {
            findings,
            gate: {
                gate: 'qualifier',
                verdict: 'pass',
                detail:
                    `All ${findings.length} qualifier(s) in the cited span survived into a typed seat: ` +
                    findings.map((f) => `${f.id}("${f.matched}")`).join(', ') + '.',
                token: 'qualifier:pass',
            },
        };
    }

    return {
        findings,
        gate: {
            gate: 'qualifier',
            verdict: 'flag',
            detail:
                `${lost.length} of ${findings.length} qualifier(s) in the cited span did NOT survive ` +
                `into any typed seat: ` +
                lost.map((f) => `${f.id}("${f.matched}", ${f.kind} — ${f.detail})`).join('; ') +
                `. Publishing the value without them would state as unconditional what the ordinance ` +
                `states conditionally (control 8 / L-616).`,
            token: 'qualifier:flag',
        },
    };
}
