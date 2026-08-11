// §REFUSAL-IDENTITY (C58 §1.13, ADR-0269) — the AI-proposal validation refusal, rendered
// WITHOUT manufacturing a sentence nobody said.
//
// ─── THE DEFECT ──────────────────────────────────────────────────────────────
// `ValidatePanel.ts` and `AIPanel.ts` both rendered a failed proposal as:
//
//     proposal.validation.reason || 'Validation failed'
//
// Two different facts collapse onto that one string:
//
//   (a) the validator refused AND SAID WHY  → `reason` is prose the user can act on;
//   (b) the validator refused AND SAID NOTHING → the UI INVENTS "Validation failed",
//       a sentence with the grammatical shape of an explanation and the information
//       content of a shrug.
//
// (b) is the §CONTEXT-DATA-HONESTY family (L-422/L-467/L-469) at the approval gate,
// and it is worse than a blank: a fabricated generic reason is indistinguishable from
// a real one, so nobody can tell that a `canExecute` implementation forgot to state a
// reason. The bug hides itself. C58 §1.13 makes exactly this unrepresentable for the
// envelope (`EnvelopeRefusalSchema.detail` is `z.string().min(1)`, required); this
// module applies the same discipline to the proposal path.
//
// ─── WHAT IDENTITY ACTUALLY EXISTS HERE ──────────────────────────────────────
// `CommandValidationResult` (`packages/command-registry/src/types.ts`) is `{ ok,
// reason?, ... }` with NO code — so there is no code to thread, and this module does
// NOT invent one. Inventing a taxonomy of validation refusals here would be minting an
// authority this layer does not have (the L-526 error).
//
// But identity is not absent. `proposal.command.type` — the registered command name —
// is real, present, and is precisely the attribution the user and a bug report need:
// it says WHICH command refused. Rendering it is C58 §1.13 done with the identity that
// exists, rather than with one made up to fill the field.
//
// PURE: no DOM, no store reads. Plain-Node tests.

/** The `{ ok, reason? }` shape both panels read off `CommandProposal.validation`. */
export interface ProposalValidationLike {
    readonly ok: boolean;
    readonly reason?: string | undefined;
}

/**
 * Render a FAILED proposal validation.
 *
 * - reason stated  → the reason verbatim, attributed to the command that refused.
 * - reason absent  → says SO, plainly, still attributed. Never a manufactured
 *                    "Validation failed", because the validator did not say that.
 *
 * `commandType` is required, not optional: the whole point is that the refusal is
 * attributable, and an optional attribution is one a caller will omit.
 */
export function validationFailureText(
    validation: ProposalValidationLike,
    commandType: string,
): string {
    const stated = typeof validation.reason === 'string' ? validation.reason.trim() : '';
    const who = commandType.trim() || 'an unnamed command';
    if (stated) return `${who} cannot run here: ${stated}`;
    // The honest form of "we do not know why". It is longer than "Validation failed"
    // and that is the point — a user can tell it apart from a real reason, and a
    // developer reading a screenshot can see the validator is under-reporting.
    return `${who} refused this proposal and stated no reason. `
        + `That is a gap in the command's own validation, not a finding about your model.`;
}

/**
 * The one-word audit-trail summary written into `aiApprovalStore.validationSummary`.
 * Same rule: 'FAILED' is a manufactured verdict when nothing was stated, so the two
 * cases stay distinguishable in the stored record too — an audit log that cannot tell
 * "refused, reason X" from "refused, silently" is not an audit log (C23).
 */
export function validationSummaryFor(validation: ProposalValidationLike): string {
    if (validation.ok) return 'VALID';
    const stated = typeof validation.reason === 'string' ? validation.reason.trim() : '';
    return stated ? `REFUSED: ${stated}` : 'REFUSED-WITHOUT-REASON';
}
