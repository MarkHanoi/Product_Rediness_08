/**
 * @file server/betaAccessAllowlist.js
 * @description PRIVATE BETA ACCESS GATE — the closed set of people who may hold an
 * account on `app.pryzm.so` at all. Founder ruling 2026-08-07: "gate access to
 * app.pryzm.so — only these can access; nobody else can sign up or anything."
 *
 * ⚠ THIS IS NOT `adminAllowlist.js`, AND MERGING THE TWO WOULD BE A DESIGN ERROR.
 * `PRYZM_ADMIN_ALLOWLIST` answers "who may use the manual admin-zone testing
 * shortcut" — a privilege held by people who already have accounts. THIS list
 * answers "who may have an account". The memberships happen to overlap today and
 * WILL diverge the moment the beta widens by one person: the first external tester
 * must be able to sign in without inheriting admin zone-entry rights. Two questions,
 * two lists.
 *
 * ── ENFORCEMENT MODEL ────────────────────────────────────────────────────────
 * SERVER-SIDE ONLY, AT EVERY IDENTITY ENTRY POINT. A client-side check is
 * decoration: the SPA bundle is public and anyone can call `/api/auth/signup`
 * directly with curl. The gate therefore lives in the four places an identity can
 * enter the system, and a fifth must never be added without adding the check:
 *
 *   1. POST /api/auth/signup           — password signup
 *   2. POST /api/auth/signin           — password signin (locks out anyone who
 *                                        already holds an account from before the gate)
 *   3. GET  /api/auth/google/callback  — OAuth, creates users implicitly
 *   4. GET  /api/auth/microsoft/callback
 *
 * ⚠ SIGN-IN IS GATED, NOT ONLY SIGN-UP. Gating signup alone would leave every
 * pre-existing account working — and there are accounts in this database that
 * predate the beta. "Nobody else can access" means the existing ones stop too.
 *
 * ── GMAIL ALIASING, STATED RATHER THAN GUESSED ───────────────────────────────
 * Comparison is lowercase + trimmed only. It deliberately does NOT strip Gmail
 * dots or `+tags`, which means `antonio.canerosan@gmail.com` is REJECTED even
 * though Gmail delivers it to an allowlisted inbox. That is the safe direction for
 * an allowlist (a stricter match can only refuse someone who should be let in —
 * recoverable by adding the literal address; a looser match could admit someone who
 * should not be — not recoverable). If a founder address bounces off the gate, add
 * the exact spelling here rather than loosening the comparison.
 */

'use strict';

/**
 * The closed beta. Founder-supplied 2026-08-07.
 * Hardcoded, not an env var, for the same reason as `adminAllowlist.js`: it stays
 * reviewable in a diff and out of a secrets store a different operator could
 * silently edit. Changing who can reach production should require a commit.
 */
export const BETA_ACCESS_ALLOWLIST = Object.freeze([
    'antoniocanerosan@gmail.com',
    'antoniocansan@gmail.com',
    'antoniocanerosantisteban@gmail.com',
    'lookwithinjourney@gmail.com',
]);

const _normalized = new Set(BETA_ACCESS_ALLOWLIST.map((e) => e.toLowerCase().trim()));

/**
 * Returns true iff `email` may hold an account. Case-insensitive, whitespace-tolerant.
 * Null/undefined/empty/non-string → false. There is no anonymous beta member.
 *
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function isBetaAllowed(email) {
    if (!email || typeof email !== 'string') return false;
    return _normalized.has(email.toLowerCase().trim());
}

/**
 * The refusal message shown to a non-allowlisted visitor.
 *
 * ⚠ IT DOES NOT SAY WHETHER THE ACCOUNT EXISTS. On signup this is an access
 * refusal, not "email already taken"; on signin it is the same string as a wrong
 * password would produce upstream. Saying "you are not on the list" to one address
 * and "wrong password" to another turns this endpoint into an account-existence
 * oracle, which is the enumeration leak C08 §1 forbids.
 */
export const BETA_REFUSAL_MESSAGE =
    'PRYZM is in private beta. This email is not on the access list. '
    + 'Contact the team if you believe you should have access.';
