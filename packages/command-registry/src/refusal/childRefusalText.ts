/**
 * §REFUSAL-IDENTITY (GE-09, C58 §1.13 / §1.13.8) — the ONE renderer for a child
 * command's refusal at an orchestrating seam (batch commands, sub-command runners).
 *
 * THE DEFECT THIS RETIRES: every batch command in this package carried the shape
 *
 *     refusals.push(v.reason ?? `Door ${id} refused the type change`);
 *     this._skipped.push({ doorId: id, reason: v.reason ?? 'refused' });
 *
 * which collapses two different facts onto one sentence: "the child refused AND
 * said why" versus "the child refused AND SAID NOTHING". The second got a string
 * with the grammatical shape of an explanation and the information content of a
 * shrug — and, being indistinguishable from a real reason, it HID the
 * under-reporting child validator (check-refusal-identity arm A; the same class
 * C58 §1.13 makes unrepresentable for the buildable envelope).
 *
 * THE CONTRACT HERE, mirroring `canPlaceRefusalText()` (the GE-09 reference
 * pattern, d18bc7a5):
 *
 *   · a STATED reason passes through VERBATIM — this seam adds nothing, drops
 *     nothing, and never rewrites the layer that knows (C58 §1.13.8: "the
 *     resolver's distinction MUST reach the card");
 *   · an ABSENT reason is NAMED as an absence, carrying a stable code token
 *     INSIDE the user string (it survives string-only sinks) plus the identity
 *     of the validator that went silent and the subject it declined. That line
 *     on a user's screen is attributable — it points at the under-reporting
 *     validator instead of impersonating it.
 *
 * The function name deliberately ends in `RefusalText(` — the identity-carrier
 * shape check-refusal-identity's CARRIES_IDENTITY_RE recognises at render sites.
 */

/** The code token a silent child's refusal carries to the user. Stable; grep-able. */
export const REFUSED_WITHOUT_REASON_CODE = 'REFUSED_WITHOUT_REASON';

/**
 * Render a child command's refusal for a user-facing roster line.
 *
 * @param stated    the child's own refusal text (`v.reason`, `r.info?.[0]`) — may
 *                  legitimately be absent; that absence is the thing this renders honestly
 * @param validator the child seam that refused, e.g. `'UpdateDoorSystemTypeCommand.canExecute'`
 * @param subject   what was declined, e.g. `` `door ${id}` `` — so N grouped roster
 *                  lines stay attributable per element
 */
export function childRefusalText(
    stated: string | undefined,
    validator: string,
    subject: string,
): string {
    const text = stated?.trim();
    if (text) return text;
    return `[${REFUSED_WITHOUT_REASON_CODE}] ${validator} declined ${subject} without stating a reason (a defect in that validator, not information about the element).`;
}
