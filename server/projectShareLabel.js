/**
 * @file server/projectShareLabel.js
 * @description §SHARE101 — the ONE place that answers "how does this project relate
 * to the caller?" for a project-list row.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The founder's report was *"the user I am adding doesn't see the new project.
 * Where could it access?"* — two questions, and the second one is the one no code
 * answered. `GET /api/projects` (and `GET /api/v1/projects`) had, since
 * §FIX-ACCESS-MEMBERSHIP (L-336 part 2), correctly RETURNED projects the caller is
 * a member of — `projectStore.memberOrOwner()` admits them. But every row came back
 * shaped exactly like an owned project. There was no `role`, no `sharedWithMe`, no
 * way for any client to say "this one is Antonio's, shared with you". A list that
 * includes a shared project but cannot say it is shared answers "where can they
 * access it?" with silence.
 *
 * ── THE CONTRACT, STATED ONCE ───────────────────────────────────────────────
 * Every list row gains exactly three fields, and they are ADDITIVE — no existing
 * field changes shape, so a client that ignores them sees precisely the old
 * behaviour:
 *
 *   ownerId       string|null   who owns the project (already present as owner_id;
 *                               restated in camelCase so the client needs one spelling)
 *   role          string|null   'owner', or the caller's ISO 19650 project role
 *                               ('team_member' | 'viewer' | …), or null = UNKNOWN
 *   sharedWithMe  boolean|null  true  = reached via membership, not ownership
 *                               false = the caller owns it
 *                               null  = THIS BACKEND CANNOT TELL (see below)
 *
 * ── ⚠ `null` IS A THIRD ANSWER AND IT IS DELIBERATE ─────────────────────────
 * This is [[context-data-honesty-family]] / C01 §6 rule 6: ABSENT and UNKNOWN must
 * not be reported as the same value as FALSE. The in-memory dev backend has no
 * membership source at all (`_inMemoryProjects` holds no roles), so it genuinely
 * cannot distinguish "you own this" from "you are a member". Returning
 * `sharedWithMe: false` there would be a CLAIM the store cannot support — and it
 * would be wrong in exactly the case the founder is testing. So that backend
 * returns `null` and says so, rather than asserting ownership it did not check.
 *
 * A caller rendering a badge must therefore treat the three states as three, not
 * two: `true` → "Shared with you", `false` → no badge, `null` → no badge AND no
 * claim of ownership.
 */

'use strict';

import { ROLES } from './permissions.js';

/** The role string used for the project's owner. Not an ISO 19650 role — ownership
 *  sits ABOVE the role matrix (`hasPermission(role, action, isOwner)` short-circuits
 *  on the owner flag), so it deliberately does not collide with any `ROLES` entry. */
export const OWNER_ROLE = 'owner';

/** A role is only a role if the matrix knows it. Unknown ⇒ null (fail closed),
 *  mirroring `projectAccess._validRole` so the two cannot drift apart. */
function _validRole(role) {
    return typeof role === 'string' && ROLES.includes(role) ? role : null;
}

/**
 * Decorate ONE project row with the caller's relationship to it.
 *
 * @param {Record<string, unknown>} row      a project row (snake_case or camelCase)
 * @param {string}                  userId   the caller
 * @param {object}                 [opts]
 * @param {string|null}  [opts.memberRole]   the caller's `project_members.role`, when
 *                                           the backend was able to look one up
 * @param {boolean}      [opts.membershipKnown=true]
 *        FALSE when the backend has no membership source at all. Forces
 *        `sharedWithMe: null` for non-owned rows rather than a false negative.
 * @returns {Record<string, unknown>} the SAME row object, mutated and returned, plus
 *          `ownerId` / `role` / `sharedWithMe`.
 */
export function labelProjectForCaller(row, userId, opts = {}) {
    if (!row || typeof row !== 'object') return row;
    const { memberRole = null, membershipKnown = true } = opts;

    const ownerId = row.ownerId ?? row.owner_id ?? null;
    const isOwner = ownerId != null && userId != null && ownerId === userId;

    row.ownerId = ownerId;
    if (isOwner) {
        row.role = OWNER_ROLE;
        row.sharedWithMe = false;
        return row;
    }

    const validated = _validRole(memberRole);
    if (validated) {
        row.role = validated;
        row.sharedWithMe = true;
        return row;
    }

    // Not the owner, and no role resolved. Two very different situations:
    //   • the backend LOOKED and found no role   → it still reached us through a
    //     membership predicate, so it IS shared; the role is merely unreadable.
    //   • the backend cannot look at all         → we must not claim either way.
    row.role = null;
    row.sharedWithMe = membershipKnown ? true : null;
    return row;
}

/**
 * Decorate a whole page of rows. Rows are mutated in place and the array returned.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} userId
 * @param {object} [opts] — same as {@link labelProjectForCaller}, except
 *        `memberRole` is replaced by `roleFor(row) => string|null`.
 * @param {(row: Record<string, unknown>) => (string|null)} [opts.roleFor]
 */
export function labelProjectsForCaller(rows, userId, opts = {}) {
    if (!Array.isArray(rows)) return rows;
    const { roleFor = null, membershipKnown = true } = opts;
    for (const row of rows) {
        labelProjectForCaller(row, userId, {
            memberRole: roleFor ? roleFor(row) : (row.member_role ?? row.memberRole ?? null),
            membershipKnown,
        });
    }
    return rows;
}

/**
 * Split a labelled page into owned / shared counts, for the §AUTH-SESSION-LEAK-2
 * diagnostic line. The leak this repo actually suffered was an account seeing
 * ANOTHER account's projects, and §SHARE101 widens this list BY DESIGN — which
 * makes it the change most able to re-introduce that leak. The diagnostic must
 * therefore stop reporting a single total: a jump from 3 to 40 means one thing if
 * the 37 are shared and something very different if they are owned.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @returns {{ owned: number, shared: number, unknown: number, total: number }}
 */
export function countOwnedVsShared(rows) {
    let owned = 0, shared = 0, unknown = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
        if (row?.sharedWithMe === true) shared++;
        else if (row?.sharedWithMe === false) owned++;
        else unknown++;
    }
    return { owned, shared, unknown, total: owned + shared + unknown };
}
