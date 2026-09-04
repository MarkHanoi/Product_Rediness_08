// FRANCE — the CNIG PLU 2025 prescription code table as a DETERMINISTIC DECISION TREE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FINDING THIS IMPLEMENTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Founder transmission, `FR-FOUNDER-REACHABILITY-BOUNDARY.md` §2 — "the finding that most changes
// the build order":
//
//     "This is MUCH BETTER than searching a 200-page PDF with an LLM."
//
// The CNIG prescription code list already CLASSIFIES rules by type, nationally, in a structured
// field PRYZM already fetches. So the first leg of parameter extraction is not NLP over a
// règlement — it is a table lookup on `typepsc`/`stypepsc`:
//
//     parcel → intersect prescriptions
//            → 39.02?  ⇒ a maximum-height rule applies here
//            → 15.01?  ⇒ a road setback applies
//            → 38.02?  ⇒ a maximum emprise applies
//            → 40.02?  ⇒ a volumetric rule applies
//
// ⭐ AND THE PART THAT CHANGES THE ANSWER, NOT JUST THE SPEED: `39.97` / `38.97` / `40.97` are
// EXPLICIT QUALITATIVE codes and `.98` are EXPLICIT ALTERNATIVE codes. So where a rule is legally
// non-numeric, PRYZM can answer **`QUALITATIVE RULE`** instead of **`UNKNOWN`** — a different, and
// honest, answer that THE SOURCE ITSELF LICENSES (R151-12 makes non-numeric rules legally valid).
// Reporting those as "unknown" understates our reading of a document we read correctly.
//
// `FR-DATA-GAP-AUDIT.md` §1.5 / §2(g)(ii) logged the gap this closes, verified by grep:
// "no FR code distinguishes the qualitative prescription SUBTYPES (38.97 / 39.97 / 40.97) or the
// alternative subtypes (.98) … A 39.97 feature today falls into the untyped carried-verbatim
// bucket — reachable, not yet reported as QUALITATIVE-RULE."
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. ⛔ NOT a new fetch path, and not a rival of `frPrescriptionGeometry.ts`. That module consumes
//     DRAWN GEOMETRY (14 plan-masse, 15 marges de recul, 39/02 height polygons) into envelope
//     contributions. This module classifies the CODE and states what KIND of answer the rule
//     admits. It takes already-fetched property bags as an input and performs no I/O.
//  2. ⛔ NOT a second vocabulary. Every output is a `RuleState` from `@pryzm/schemas`
//     (§RULE-STATE) carrying the ratified 8-field `RuleSourceRef`. The whole point of landing that
//     vocabulary was that FR would consume it rather than mint an FR spelling.
//  3. ⛔ NOT an extension of the CNIG table beyond what is SOURCED. The codes below are exactly
//     those named in the founder's §2 transmission plus TYPEPSC 14 (already consumed in shipped
//     code). ⚠ The real CNIG `PrescriptionSUrbaType` list is LARGER. Do not add rows from memory —
//     verify against the CNIG PLU 2025 standard first (§NEVER-INVENT-AN-ENDPOINT applied to a code
//     table: an invented code silently mis-files a real rule).
//
// PURE + deterministic (C58 §1.1/§1.9): no I/O, no clock (`fetchedAtIso` would be an INPUT if this
// needed one — it does not), no THREE, no DOM, no RNG. Same inputs → identical output.

import {
    type EnvelopeParameterKey,
    type RuleSourceRef,
    type RuleState,
} from '@pryzm/schemas';

/* ────────────────────────────── the code table ─────────────────────────────── */

/**
 * What KIND of statement a CNIG subtype makes about its parameter. This is the axis the shipped FR
 * code was missing: it typed `typepsc` (which parameter) but never `stypepsc` (what kind of answer).
 *
 *   - `maximum`     — `.02`: a numeric ceiling. The number may still live in the libelle or the text.
 *   - `qualitative` — `.97`: the rule is legally NON-NUMERIC. ⭐ An answer, not an unknown.
 *   - `alternative` — `.98`: the instrument states several readings and does not pick one here.
 *   - `implantation`— the `15.xx` family: a setback expressed as a DRAWN LINE. The geometry IS the
 *                     rule (`ConstraintForm` `linear`), so a missing number is not a missing rule.
 *   - `drawn-volume`— `14`: a secteur de plan de masse (R151-40). The buildable volume is DRAWN;
 *                     ⚠ the drawn plan then GOVERNS and zone-rule derivation does not apply.
 *   - `unspecified` — `.00`/absent: the family applies, the subtype says nothing further.
 */
export type FrCnigSemantic =
    | 'maximum'
    | 'qualitative'
    | 'alternative'
    | 'implantation'
    | 'drawn-volume'
    | 'unspecified';

export interface FrCnigClassification {
    /** The envelope parameter (`STR-ENVELOPE-PARAMETER-REFERENCE` key), or null when non-envelope. */
    readonly parameter: EnvelopeParameterKey | null;
    readonly semantic: FrCnigSemantic;
    /** The founder's transmission wording for this code, kept so the mapping is auditable. */
    readonly label: string;
    /** `'39.02'` — the canonical dotted spelling used in reports and citations. */
    readonly code: string;
}

/**
 * TYPEPSC → the envelope parameter its family constrains. ⚠ ONLY the families the transmission
 * names. An unlisted `typepsc` classifies as non-envelope, which is honest: we hold no sourced
 * mapping for it. It must NEVER be guessed into a parameter.
 */
const FR_CNIG_FAMILY: Readonly<Record<string, { parameter: EnvelopeParameterKey; label: string }>> = {
    '14': { parameter: 'C4', label: 'secteur de plan de masse (R151-40)' },
    '15': { parameter: 'C5', label: 'implantation / marge de recul (R151-39)' },
    '38': { parameter: 'C4', label: 'emprise au sol' },
    '39': { parameter: 'C2', label: 'hauteur' },
    '40': { parameter: 'C6', label: 'volumétrie' },
};

/** `15.xx` sub-families — which boundary the setback is measured to. */
const FR_CNIG_IMPLANTATION: Readonly<Record<string, string>> = {
    '01': 'implantation par rapport aux voies et emprises publiques',
    '02': 'implantation par rapport aux limites séparatives latérales',
    '03': 'implantation par rapport aux limites de fond de parcelle',
};

/** Normalise a CNIG subtype: absent / `''` / `'0'` / `'00'` all mean "unspecified". */
function normaliseStypepsc(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    const t = raw.trim();
    if (t === '' || t === '0' || t === '00') return null;
    return t.length === 1 ? `0${t}` : t;
}

/** Normalise a CNIG type: `'39'`, `'9'` → `'39'`, `'09'`. */
function normaliseTypepsc(raw: string | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    const t = raw.trim();
    if (t === '') return null;
    return t.length === 1 ? `0${t}` : t;
}

/**
 * Classify one CNIG prescription code. **Total and pure**; returns `null` for a code carrying no
 * SOURCED envelope meaning — which is different from, and must never be reported as, "no rule".
 */
export function classifyFrCnigCode(
    typepscRaw: string | null | undefined,
    stypepscRaw: string | null | undefined,
): FrCnigClassification | null {
    const typepsc = normaliseTypepsc(typepscRaw);
    if (typepsc === null) return null;
    const fam = FR_CNIG_FAMILY[typepsc];
    if (fam === undefined) return null;

    const stypepsc = normaliseStypepsc(stypepscRaw);
    const code = stypepsc === null ? typepsc : `${typepsc}.${stypepsc}`;

    if (typepsc === '14') {
        return { parameter: fam.parameter, semantic: 'drawn-volume', label: fam.label, code };
    }
    if (typepsc === '15') {
        const sub = stypepsc === null ? null : FR_CNIG_IMPLANTATION[stypepsc];
        return {
            parameter: fam.parameter,
            semantic: 'implantation',
            label: sub ?? fam.label,
            code,
        };
    }
    // The 38 / 39 / 40 families share one subtype grammar — which is exactly why the `.97` / `.98`
    // rungs are worth typing once rather than three times.
    switch (stypepsc) {
        case '02':
            return { parameter: fam.parameter, semantic: 'maximum', label: `${fam.label} maximale`, code };
        case '97':
            return { parameter: fam.parameter, semantic: 'qualitative', label: `${fam.label} qualitative`, code };
        case '98':
            return { parameter: fam.parameter, semantic: 'alternative', label: `${fam.label} alternative`, code };
        default:
            return { parameter: fam.parameter, semantic: 'unspecified', label: fam.label, code };
    }
}

/* ─────────────────────── numeric recovery from the libelle ─────────────────────── */

/**
 * The CNIG prescription schema mandates NO universal numeric field — it carries `TYPEPSC`,
 * `STYPEPSC`, `LIBELLE`, `TXT`, `NOMFIC`, `URLFIC`, geometry (founder §4). So where a number is
 * published at all, it is inside free text.
 *
 * ⚠ MEASURED, NOT ASSUMED: in the 100-parcel audit (2026-09-04) Paris's `39.02` feature carries
 * `libelle = "Hauteur plafond"` with an EMPTY `txt` — the rule TYPE and no value. That is the
 * founder's `RULE EXISTS=YES · TYPE=YES · LOCATION=YES · SOURCE=YES · VALUE=NOT ALWAYS`, observed.
 *
 * Units are kept VERBATIM as matched, never normalised here: `m` and `niveaux` are different
 * parameters (C2 vs C3) and silently folding one into the other is how a storey count becomes
 * metres.
 */
const FR_NUMERIC_IN_TEXT =
    /(\d+(?:[.,]\d+)?)\s*(m\b|mètres?|metres?|%|niveaux?|étages?|niv\b)/i;

export interface FrRecoveredNumber {
    readonly value: number;
    readonly unit: string;
    /** The exact source string the number was read out of — reviewable, never paraphrased. */
    readonly verbatim: string;
}

/** Recover a number from CNIG free text. Pure; returns null when no number is present. */
export function recoverFrNumberFromText(
    ...texts: readonly (string | null | undefined)[]
): FrRecoveredNumber | null {
    for (const t of texts) {
        if (typeof t !== 'string' || t.trim() === '') continue;
        const m = FR_NUMERIC_IN_TEXT.exec(t);
        if (m !== null && m[1] !== undefined && m[2] !== undefined) {
            const value = Number.parseFloat(m[1].replace(',', '.'));
            if (Number.isFinite(value)) {
                return { value, unit: m[2].toLowerCase(), verbatim: t };
            }
        }
    }
    return null;
}

/* ────────────────────────────── the decision tree ─────────────────────────────── */

/** One already-fetched GPU prescription row (the fields `frNoExtraction.parseFrPrescription` reads). */
export interface FrPrescriptionRow {
    readonly typepsc: string | null;
    readonly stypepsc: string | null;
    readonly libelle: string | null;
    readonly txt: string | null;
    readonly nomfic: string | null;
    readonly idurba: string | null;
}

export interface FrCnigTreeInput {
    readonly prescriptions: readonly FrPrescriptionRow[];
    /** The parcel's governing document reference, for the citation on every emitted state. */
    readonly ref: RuleSourceRef;
    /**
     * Is the règlement document REACHABLE (a NOMFIC or URLFIC was served)? Decides whether a
     * missing value is `pdf` (the document exists and no extractor read it) or `missing-source`
     * (nothing points at a document at all). ⚠ Two different remedies; never one label.
     */
    readonly reglementReachable: boolean;
}

/**
 * Walk the prescriptions at a parcel and emit one `RuleState` per envelope parameter the CNIG codes
 * speak to. **Pure, total, deterministic** — output order follows `FR_CNIG_TREE_ORDER`, never the
 * server's feature order, so two runs over the same parcel are byte-comparable.
 *
 * ⚠ WHAT IT DELIBERATELY DOES NOT DO: it never emits a state for a parameter no code speaks to.
 * A parameter with no prescription is NOT "no limit" — the rule is very probably in the règlement
 * text — and manufacturing an `unrecovered` row here would put OUR unparsed document into the same
 * bucket as a plan that genuinely lacks the mechanism (F1). The caller owns that judgement because
 * only the caller knows whether the document was opened.
 */
export const FR_CNIG_TREE_ORDER: readonly EnvelopeParameterKey[] = ['C2', 'C4', 'C5', 'C6'];

export function frCnigRuleStates(input: FrCnigTreeInput): readonly RuleState[] {
    const byParameter = new Map<EnvelopeParameterKey, { row: FrPrescriptionRow; cls: FrCnigClassification }[]>();
    for (const row of input.prescriptions) {
        const cls = classifyFrCnigCode(row.typepsc, row.stypepsc);
        if (cls === null || cls.parameter === null) continue;
        const list = byParameter.get(cls.parameter) ?? [];
        list.push({ row, cls });
        byParameter.set(cls.parameter, list);
    }

    const out: RuleState[] = [];
    for (const parameter of FR_CNIG_TREE_ORDER) {
        const hits = byParameter.get(parameter);
        if (hits === undefined || hits.length === 0) continue;

        // ⚠ PRECEDENCE IS NORMATIVE AND IS NOT "FIRST ROW WINS". A drawn volume overrides a zone
        // rule (the plan-masse governs, R151-40 — shipped doctrine in `frPlanMasseRefusal`); an
        // explicit qualitative code is a stronger statement about the rule's NATURE than an
        // unspecified sibling; and a `.98` alternative outranks an unspecified row for the same
        // reason. Server feature order carries no legal meaning and must never decide this.
        const drawn = hits.find((h) => h.cls.semantic === 'drawn-volume');
        const qualitative = hits.find((h) => h.cls.semantic === 'qualitative');
        const alternative = hits.find((h) => h.cls.semantic === 'alternative');
        const implantation = hits.find((h) => h.cls.semantic === 'implantation');
        const maximum = hits.find((h) => h.cls.semantic === 'maximum');
        const chosen = drawn ?? qualitative ?? alternative ?? maximum ?? implantation ?? hits[0]!;

        const ref: RuleSourceRef = {
            ...input.ref,
            dataset: 'prescription',
            object_id: `TYPEPSC=${chosen.cls.code}`,
            document: chosen.row.nomfic ?? input.ref.document,
            plan_id: chosen.row.idurba ?? input.ref.plan_id,
        };

        switch (chosen.cls.semantic) {
            case 'drawn-volume':
                // The buildable volume is DRAWN. Authoritative geometry: consume it, never re-derive.
                out.push({
                    rule: parameter,
                    status: 'resolved',
                    reachability: 'source-complete',
                    value: 'secteur de plan de masse (drawn volume)',
                    unit: null,
                    datum: null,
                    provenance: 'published-structured',
                    ref,
                });
                break;

            case 'implantation':
                // A marge de recul is a DRAWN LINE — the geometry IS the constraint, so this is a
                // recovered rule even when no number appears anywhere.
                out.push({
                    rule: parameter,
                    status: 'resolved',
                    reachability: 'source-complete',
                    value:
                        recoverFrNumberFromText(chosen.row.libelle, chosen.row.txt)?.value ??
                        'drawn implantation line',
                    unit: recoverFrNumberFromText(chosen.row.libelle, chosen.row.txt)?.unit ?? null,
                    datum: null,
                    provenance: 'published-structured',
                    ref,
                });
                break;

            case 'qualitative':
                // ⭐ THE HONEST THIRD ANSWER. Never converted to a number by any path below.
                out.push({
                    rule: parameter,
                    status: 'qualitative',
                    reachability: 'interpretive',
                    text: chosen.row.libelle ?? chosen.row.txt ?? chosen.cls.label,
                    ref,
                });
                break;

            case 'alternative': {
                // `.98` says several readings are stated; the CNIG row rarely enumerates them, so
                // where we cannot name at least two we must NOT claim an alternative set — that
                // would be a bounded-looking answer with nothing bounding it.
                const named = [chosen.row.libelle, chosen.row.txt]
                    .filter((s): s is string => typeof s === 'string' && s.trim() !== '');
                if (named.length >= 2) {
                    out.push({ rule: parameter, status: 'alternative', reachability: 'extractable', alternatives: named, ref });
                } else {
                    out.push({
                        rule: parameter,
                        status: 'unrecovered',
                        partial: null,
                        reachability: 'extractable',
                        failure: input.reglementReachable ? 'pdf' : 'missing-source',
                        mechanism: 'present',
                        stoppedAt: `CNIG ${chosen.cls.code} (alternative rule stated; the alternatives are enumerated in the règlement, not in the feature)`,
                        ref,
                    });
                }
                break;
            }

            case 'maximum':
            case 'unspecified': {
                const n = recoverFrNumberFromText(chosen.row.libelle, chosen.row.txt);
                if (n !== null) {
                    out.push({
                        rule: parameter,
                        status: 'resolved',
                        reachability: 'source-complete',
                        value: n.value,
                        unit: n.unit,
                        // ⚠ THE DATUM IS NOT IN THE FEATURE. A height number on an unresolved plane
                        // cannot be multiplied into a volume (ADR-0377; `RuleState.resolved.datum`
                        // null means "no datum resolved", and a consumer must not bind it as a cap).
                        datum: null,
                        provenance: 'published-structured',
                        ref,
                    });
                } else {
                    // The mechanism IS drawn and the VALUE is not in it — the founder's
                    // "RULE EXISTS=YES … VALUE=NOT ALWAYS", encoded. `mechanism: 'present'` keeps
                    // this OUT of the F1 gap bucket: the plan is not silent, our extractor is.
                    out.push({
                        rule: parameter,
                        status: 'unrecovered',
                        partial: null,
                        reachability: 'extractable',
                        failure: input.reglementReachable ? 'pdf' : 'missing-source',
                        mechanism: 'present',
                        stoppedAt: `CNIG ${chosen.cls.code} drawn with no numeric value in libelle/txt${
                            chosen.row.nomfic !== null ? ` — value is in ${chosen.row.nomfic}` : ''
                        }`,
                        ref,
                    });
                }
                break;
            }
        }
    }
    return out;
}
