/**
 * @file server/adminAllowlist.js
 * @description The PRYZM_ADMIN allowlist — a SMALL, hard-coded set of named individuals allowed
 * to use the manual-admin-zone-entry testing shortcut (see `manualAdminZoneStore.js` +
 * `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/TRACED-ZONE-SERVICE-2026-08-05.md`).
 *
 * ⚠⚠ DELIBERATELY NOT AN ENV VAR. This mirrors `PRYZM_OWNER_EMAIL`'s single-owner gating pattern
 * (see `server.js` around the `/api/export/authorize`, `/api/me/plan`, and project-version-limit
 * routes) but these are specific named people, not a per-deployment configuration knob — hardcoding
 * keeps the allowlist reviewable in a diff and out of Replit/Fly secrets that a different operator
 * could silently change.
 *
 * SERVER-SIDE ONLY. Every write and every read of a manual admin zone entry MUST go through
 * `isPryzmAdmin()` on the server — never trust a client-supplied "isAdmin" flag. See
 * `server.js`'s `/api/manual-zone/*` routes.
 */

'use strict';

/**
 * The allowlisted admin emails. Comparison is case-insensitive + trimmed (mirrors the
 * `PRYZM_OWNER_EMAIL` comparison idiom already used throughout `server.js`).
 */
export const PRYZM_ADMIN_ALLOWLIST = Object.freeze([
    'antoniocansan@gmail.com',
    'antoniocanerosantisteban@gmail.com',
    'antoniocanerosan@gmail.com',
]);

const _normalized = new Set(PRYZM_ADMIN_ALLOWLIST.map((e) => e.toLowerCase().trim()));

/**
 * Returns true iff `email` is on the PRYZM_ADMIN allowlist. Case-insensitive, whitespace-tolerant.
 * Returns false for null/undefined/empty — there is no "anonymous admin".
 *
 * @param {string | null | undefined} email
 * @returns {boolean}
 */
export function isPryzmAdmin(email) {
    if (!email || typeof email !== 'string') return false;
    return _normalized.has(email.toLowerCase().trim());
}
