/**
 * @file server/planLimits.js
 * @description §PLAN-LIMITS-ONE-AUTHORITY (L-756) — THE single server-side source
 * of plan limits. Every server enforcement point and every server response that
 * reports a limit MUST read it from here.
 *
 * ── THE DEFECT THIS CLOSES, AND WHY IT WAS SILENT DATA LOSS ─────────────────
 * The same policy was declared THREE times with TWO different values:
 *
 *   packages/core-app-model/src/monetization/PlanConfig.ts:75  free = 1   (client)
 *   server.js  GET /api/me/plan                                free = 1   (reported)
 *   server.js  version-save enforcement                        free = 0   (ENFORCED)
 *
 * So a free-plan user was TOLD they could save one version, the client let them
 * try, and the server answered 403 on every attempt. Their work then existed only
 * in one browser's IndexedDB — no server copy, no version history, gone with a
 * cache clear or a sign-out. Nobody saw it because the two endpoints that AGREE
 * are the two anyone would check; the outlier was the one that actually enforces.
 *
 * ⚠ THE VALUE IS NOT THE FIX. Editing `0` to `1` would leave three declarations
 * and the next drift is a matter of time. The fix is that there is now ONE
 * server-side declaration, and `server/__tests__/planLimits.test.ts` parses
 * `PlanConfig.ts` and FAILS if this table and the client's ever disagree again.
 * A duplicated policy is a bug even while the copies happen to match.
 *
 * ── WHICH VALUE WON, AND WHY ────────────────────────────────────────────────
 * `free = 1`, matching `PlanConfig.ts` — the canonical product policy, and the
 * value already reported to the user by `/api/me/plan`. The enforcement point was
 * the outlier, so it is the one that was wrong. Aligning the other direction
 * (reporting 0) would have been internally consistent and product-wrong: it would
 * have made "you may not save at all" the free tier, which is not what is sold.
 *
 * ⚠ CHANGING A LIMIT HERE CHANGES WHAT USERS ARE SOLD. `PlanConfig.ts` and the
 * C39 pricing surface must move in the same commit, or the parity test fails —
 * which is the point.
 *
 * Convention, inherited from PlanConfig.ts:  -1 = unlimited · 0 = none.
 */

'use strict';

/**
 * Version-history limit per project, by plan.
 * Mirrors `PLAN_LIMITS[plan].maxVersionsPerProject` — parity is test-enforced.
 */
export const VERSION_LIMITS = Object.freeze({
    owner: -1,
    free: 1,
    architect: 15,
    studio: -1,
    firm: -1,
    enterprise: -1,
});

/** AI actions per period, by plan. */
export const AI_LIMITS = Object.freeze({
    owner: -1,
    free: 5,
    architect: 50,
    studio: 200,
    firm: 500,
    enterprise: -1,
});

/**
 * Version limit for `plan`.
 *
 * ⚠ AN UNKNOWN PLAN FALLS BACK TO `free`, NOT TO 0. The previous code used `?? 0`
 * at the enforcement point and `?? 1` at the reporting point — so an unrecognised
 * plan string (a typo, a renamed tier, a stale cached value) silently became
 * "cannot save anything" in the one place that mattered. Degrading an unknown
 * plan to the FREE tier is the honest reading: we do not know what they bought,
 * so we grant the floor rather than refuse service. It fails safe for the USER;
 * refusing all saves fails safe for nobody.
 *
 * @param {string | null | undefined} plan
 * @returns {number} -1 unlimited · 0 none · n max versions
 */
export function versionLimitFor(plan) {
    if (plan && Object.prototype.hasOwnProperty.call(VERSION_LIMITS, plan)) {
        return VERSION_LIMITS[plan];
    }
    return VERSION_LIMITS.free;
}

/**
 * AI-action limit for `plan`. Same unknown-plan reasoning as `versionLimitFor`.
 * @param {string | null | undefined} plan
 * @returns {number}
 */
export function aiLimitFor(plan) {
    if (plan && Object.prototype.hasOwnProperty.call(AI_LIMITS, plan)) {
        return AI_LIMITS[plan];
    }
    return AI_LIMITS.free;
}
