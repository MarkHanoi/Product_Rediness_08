// §DK-IOMFANGREG (lane ENVELOPE-NLDK, 2026-09-04) — Denmark's F1 DISCRIMINATOR.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT THAT MOTIVATES THIS MODULE, AND HOW IT REFRAMED THE AUDIT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `DK-DATA-GAP-AUDIT.md` §1.2 ranks "the shipped mapper reads `iomfangreg` NOWHERE" as its #2 gap,
// and frames it as an OVERSTATEMENT exposure: a plan could publish a height while flagging that
// the structured fields do not represent the regulation, and PRYZM would draw the height anyway.
//
// Phase 0 measured it (dk-phase0-report.json §D4c, 654 parcels / 4 Plandata rungs / 2 strata):
//
//   iomfangreg = true   →  maxbygnhjd 0/183 · bebygpct 0/183 · maxetager 0/183   ZERO EXCEPTIONS
//   iomfangreg = false  →  maxbygnhjd published 25–80% of the time, per rung
//
// **The feared overstatement does not occur.** Danish municipalities use the flag consistently:
// when they say "the bulk regulation is not in these fields", they also leave the fields empty.
// Reporting that as a fixed vulnerability would have been stale-pessimistic — real budget spent
// on a problem the data says is not there.
//
// ⭐ WHAT `iomfangreg` ACTUALLY IS, AND WHY IT IS MORE VALUABLE THAN THE AUDIT THOUGHT.
// It is not a contradiction detector. It is the ONE FIELD DENMARK PUBLISHES THAT EXPLAINS AN
// ABSENCE. Without it, a null `maxbygnhjd` has three indistinguishable causes:
//     (a) the plan regulates bulk, in prose, in the PDF        → extraction failure, `mechanism: present`
//     (b) the plan genuinely does not regulate bulk here        → F1, a real gap
//     (c) our request failed / we never asked                   → `mechanism: unknown`
// `iomfangreg = true` picks out (a), with the register's own authority. That is the F1 separation
// the NL and NSW audits both name as their open gap, handed to us as a published boolean — and it
// covers 61.2% of lokalplan features (41/67 land, 61/79 urban).
//
// The product consequence is a REFUSAL-QUALITY upgrade, which is the opposite of a coverage
// upgrade and is worth just as much: PRYZM stops saying "no height available" (about us) and
// starts saying "this lokalplan DOES regulate building extent — in §X of the plan document, not
// in the queryable fields", with the doklink. A user can act on the second sentence.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// R4 (DATA ≠ LEGAL EFFECT) AND R8 (CONDITIONAL ≠ ALLOWED) — WHAT THIS MODULE REFUSES TO DO
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `iomfangreg = false` is NOT a licence to treat the published numbers as the whole rule. It means
// the municipality did not raise the flag. Absence of the flag is not a certificate of
// completeness, and this module never converts it into one — `flagAbsent` and `flagFalse` are
// separate states below for exactly that reason.
//
// `kompleks = true` is routed to document interpretation and is NEVER deterministic (master §4.2:
// "kompleks = true → route to document/legal interpretation"). Phase 0 observed it at 0% on every
// rung, so this branch is untested against live positives — stated, not hidden.
//
// PURE (C58 §1.9). Deterministic (C58 §1.1). No I/O, no THREE, no DOM.

import type { RuleState } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Reading the flags — three-valued, never two
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ THREE VALUES, NOT TWO. Plandata serves booleans over WFS as `true`/`false`/`"true"`/`"t"`/`1`
 * and, on some features, not at all. A missing flag is `null` — UNKNOWN — and must never coerce to
 * `false`, because `false` is a positive statement by the municipality ("the fields DO represent
 * the regulation") that an absent field has not made. Reading absence as `false` would upgrade
 * silence into an assurance, which is the §CONTEXT-DATA-HONESTY failure in miniature.
 */
export function readDkPlandataFlag(raw: unknown): boolean | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).trim().toLowerCase();
    if (s === 'true' || s === 't' || s === '1' || s === 'ja') return true;
    if (s === 'false' || s === 'f' || s === '0' || s === 'nej') return false;
    return null; // an unrecognised token is UNKNOWN, never silently false
}

/** The Plandata honesty flags this module consumes. All optional; all three-valued once read. */
export interface DkOmfangFlags {
    /** `iomfangreg` — "the structured fields do NOT fully represent the extent regulation". */
    readonly iomfangreg?: unknown;
    /** `kompleks` — the plan is complex; route to document/legal interpretation (master §4.2). */
    readonly kompleks?: unknown;
    /** `kbeskriv` — the municipality's free-text description of that complexity. */
    readonly kbeskriv?: unknown;
    /** `ianvreg` — use (anvendelse) regulation not fully in the fields. Reported, not envelope. */
    readonly ianvreg?: unknown;
}

/** The dimensional fields, so this module can state whether a number is actually present. */
export interface DkOmfangNumbers {
    readonly maxbygnhjd?: unknown;
    readonly bebygpct?: unknown;
    readonly maxetager?: unknown;
}

function hasNumber(v: unknown): boolean {
    if (v === null || v === undefined || v === '') return false;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
    return Number.isFinite(n);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The verdict
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type DkOmfangVerdict =
    /**
     * 🟡 `iomfangreg = true` — THE VALUABLE CASE. The plan regulates building extent and the
     * regulation is NOT in the structured fields. A cited, legally grounded explanation of an
     * absence. ⚠ `mechanism: 'present'` downstream — this is NOT F1.
     */
    | {
          readonly kind: 'regulated-outside-structured-fields';
          readonly numbersPresent: boolean;
          readonly statement: string;
          readonly doklink: string | null;
      }
    /**
     * 🟠 `kompleks = true` — route to document/legal interpretation. Never deterministic.
     * ⚠ Phase 0 observed 0 live positives, so this branch is UNTESTED against real data.
     */
    | {
          readonly kind: 'complex-requires-interpretation';
          readonly description: string | null;
          readonly statement: string;
          readonly doklink: string | null;
      }
    /**
     * 🟢 `iomfangreg = false` AND a dimensional number is present. The fields are the municipality's
     * own answer, and it declared them representative. The strongest DK structured state.
     */
    | {
          readonly kind: 'structured-fields-declared-representative';
          readonly statement: string;
      }
    /**
     * ⚪ `iomfangreg = false` and NO number. The municipality says the fields represent the rule,
     * and the fields are empty. ⚠ THIS IS THE ONE STATE THAT MAY BE GENUINE **F1** — and this
     * module still does not assert it, because "the fields are representative and empty" is
     * consistent both with "no extent rule here" and with a data-entry omission. It is escalated
     * as a NAMED AMBIGUITY rather than resolved, per the F1 discipline.
     */
    | {
          readonly kind: 'declared-representative-but-empty';
          readonly statement: string;
      }
    /**
     * ⚫ The flag was not served. UNKNOWN — about us and the request, not about the plan.
     */
    | {
          readonly kind: 'flag-not-served';
          readonly numbersPresent: boolean;
          readonly statement: string;
      };

/**
 * Classify one Plandata feature's extent-regulation state. Pure and total.
 *
 * BRANCH ORDER IS LEGAL: `kompleks` outranks `iomfangreg`, because a plan flagged complex requires
 * interpretation regardless of whether its extent fields happen to be populated.
 */
export function resolveDkOmfangRegulation(opts: {
    readonly flags: DkOmfangFlags;
    readonly numbers?: DkOmfangNumbers;
    readonly doklink?: string | null;
    /** The plan's own name/number, for the citation sentence. */
    readonly planLabel?: string | null;
}): DkOmfangVerdict {
    const iomfang = readDkPlandataFlag(opts.flags.iomfangreg);
    const kompleks = readDkPlandataFlag(opts.flags.kompleks);
    const doklink = typeof opts.doklink === 'string' && opts.doklink.trim() !== '' ? opts.doklink : null;
    const plan = typeof opts.planLabel === 'string' && opts.planLabel.trim() !== '' ? opts.planLabel : 'the governing plan';
    const n = opts.numbers ?? {};
    const numbersPresent = hasNumber(n.maxbygnhjd) || hasNumber(n.bebygpct) || hasNumber(n.maxetager);

    if (kompleks === true) {
        const desc = typeof opts.flags.kbeskriv === 'string' && opts.flags.kbeskriv.trim() !== ''
            ? opts.flags.kbeskriv.trim()
            : null;
        return {
            kind: 'complex-requires-interpretation',
            description: desc,
            doklink,
            statement:
                `${plan} is flagged kompleks=true by the municipality. Plandata's own semantics ` +
                'route a complex plan to document and legal interpretation, so no deterministic ' +
                'envelope is derived from its structured fields' +
                (desc ? ` — the municipality describes it as: "${desc}"` : '') +
                (doklink ? `. Plan document: ${doklink}` : '.'),
        };
    }

    if (iomfang === true) {
        return {
            kind: 'regulated-outside-structured-fields',
            numbersPresent,
            doklink,
            statement:
                `${plan} DOES regulate building extent (omfang), and the municipality has flagged ` +
                'iomfangreg=true: the regulation is NOT fully represented by the queryable WFS ' +
                'fields. The rule lives in the plan document. ⚠ This is a statement about the ' +
                'INSTRUMENT, not a gap in PRYZM — the plan is not silent on building extent' +
                (doklink ? `. Read it here: ${doklink}` : '.') +
                (numbersPresent
                    ? ' ⚠ Some dimensional fields ARE populated on this feature; treat them as ' +
                      'partial facts, never as the complete extent rule.'
                    : ''),
        };
    }

    if (iomfang === false) {
        if (numbersPresent) {
            return {
                kind: 'structured-fields-declared-representative',
                statement:
                    `${plan} publishes its extent regulation in the structured fields and flags ` +
                    'iomfangreg=false — the municipality declares those fields representative of ' +
                    'the regulation. ⚠ Not a certificate of completeness: it is the municipality’s ' +
                    'own declaration, and other instruments (kommuneplanramme, BR18, overlays) still bind.',
            };
        }
        return {
            kind: 'declared-representative-but-empty',
            statement:
                `${plan} flags iomfangreg=false (the structured fields represent the extent rule) ` +
                'and publishes NO height, building percentage or storey count. ⚠ AMBIGUOUS, and ' +
                'deliberately left so: this is consistent BOTH with the plan setting no extent ' +
                'limit here (a correct null) AND with a data-entry omission. PRYZM does not choose ' +
                'between them, and in particular does not report "the plan sets no limit".',
        };
    }

    return {
        kind: 'flag-not-served',
        numbersPresent,
        statement:
            `iomfangreg was not served on this ${plan} feature, so whether the structured fields ` +
            'represent the extent regulation is UNKNOWN. ⚠ Absence of the flag is not the same as ' +
            'iomfangreg=false; it is a fact about the response, not about the plan.',
    };
}

/**
 * Project onto the shared `RuleState` vocabulary. Parameter **C6 — shaping constraints** is not
 * right here; the extent regulation governs the whole bulk, so this reports against **C4
 * (footprint limit)** by default and the caller may re-key it for C2/C3.
 *
 * ⭐ THE MAPPING IS THE POINT OF THE WHOLE MODULE:
 *   regulated-outside-structured-fields → `unrecovered`, failure `pdf`, **mechanism `present`**
 *       The register itself testifies the mechanism exists. This is the ONLY place in the DK
 *       stack where `mechanism: 'present'` can be asserted on the register's authority rather
 *       than on a human having opened the PDF.
 *   complex-requires-interpretation     → `refused` / `requires-determination` (legallyGrounded)
 *   structured-fields-declared-repr.    → the caller emits the NUMBER as `resolved`; this returns
 *                                         null, because the verdict is not itself a rule value.
 *   declared-representative-but-empty   → `unrecovered`, failure `semantic`, mechanism `unknown`
 *       ⚠ NOT `absent`. `absent` is F1 and would assert the plan has no extent rule; the flag
 *       combination genuinely does not establish that.
 *   flag-not-served                     → `unrecovered`, failure `inaccessible`, mechanism `unknown`
 *       `inaccessible` because it is the ONLY failure label a retry may clear, and a missing
 *       attribute in one response is precisely the retryable class.
 */
export function dkOmfangToRuleState(
    v: DkOmfangVerdict,
    ref: RuleState['ref'],
    rule: RuleState['rule'] = 'C4',
): RuleState | null {
    switch (v.kind) {
        case 'regulated-outside-structured-fields':
            return {
                rule,
                status: 'unrecovered',
                reachability: 'extractable',
                failure: 'pdf',
                mechanism: 'present',
                stoppedAt: v.doklink ?? 'the lokalplan document (doklink not served)',
                ref,
            };
        case 'complex-requires-interpretation':
            return {
                rule,
                status: 'refused',
                reachability: 'interpretive',
                basis: 'requires-determination',
                reason: v.statement,
                ref,
            };
        case 'structured-fields-declared-representative':
            return null; // the caller emits the number itself; this verdict adds no rule value
        case 'declared-representative-but-empty':
            return {
                rule,
                status: 'unrecovered',
                reachability: 'extractable',
                failure: 'semantic',
                mechanism: 'unknown',
                stoppedAt: v.statement,
                ref,
            };
        case 'flag-not-served':
            return {
                rule,
                status: 'unrecovered',
                reachability: 'derivable',
                failure: 'inaccessible',
                mechanism: 'unknown',
                stoppedAt: 'iomfangreg not present in the WFS response for this feature',
                ref,
            };
    }
}
