/**
 * @file server/pendingInvites.js
 * @description #114 (INVITE-BY-EMAIL-NONUSERS) phase 1 — pending-invite store.
 *
 * Today, inviting a collaborator by an email that has no PRYZM account 404s
 * ("Ask them to sign up first", server.js POST /api/projects/:id/members). This
 * module is the foundation for the better flow: persist a PENDING invite keyed by
 * email, and when that email later signs up, convert the pending invites into
 * project_members ("join on signup").
 *
 * This is the PURE, in-memory lifecycle core — fully unit-testable with no DB. It
 * is deliberately SINGLE-RESPONSIBILITY: it stores/looks-up/removes pending
 * invites and never touches membership itself. The caller (signup flow) reads the
 * resolved invites, upserts a project_member per invite via projectMembers, then
 * deletes each pending invite by id.
 *
 * DEFERRED to the #114 integration phase (needs Supabase + email infra + the
 * architect's verification — see SPEC notes):
 *   - a `pending_invites` table migration + Supabase-backed mirrors,
 *   - wiring POST /members to create a pending invite on unknown-email instead of
 *     404, and the signup handler to resolve+convert,
 *   - the email notification to the invitee.
 *
 * Roles reuse the ISO 19650 set from permissions.js (same as projectMembers).
 */

'use strict';

import { ROLES } from './permissions.js';

/** @typedef {Object} PendingInvite
 *  @property {string}      id
 *  @property {string}      projectId
 *  @property {string}      email      - normalised (trimmed + lower-cased)
 *  @property {string}      role
 *  @property {string|null} invitedBy
 *  @property {number}      invitedAt  - Unix ms
 */

// id → PendingInvite
const _pending = new Map();

function _genId() {
    return `pi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Normalise an email for case-insensitive matching (same key on invite + signup). */
export function normalizeInviteEmail(email) {
    return String(email ?? '').trim().toLowerCase();
}

/**
 * Create (or update) a pending invite for an email that has no account yet.
 * One pending invite per (projectId, email) — re-inviting updates the role.
 * Throws on an invalid role or a blank email.
 */
export function createPendingInvite(projectId, email, role, invitedBy = null) {
    if (!ROLES.includes(role)) {
        throw new Error(`Invalid role "${role}". Must be one of: ${ROLES.join(', ')}`);
    }
    const normEmail = normalizeInviteEmail(email);
    if (!normEmail) throw new Error('createPendingInvite: email is required.');

    // Dedup on (projectId, email): update the existing invite rather than stack.
    for (const inv of _pending.values()) {
        if (inv.projectId === projectId && inv.email === normEmail) {
            inv.role = role;
            inv.invitedBy = invitedBy;
            inv.invitedAt = Date.now();
            return inv;
        }
    }
    const rec = {
        id: _genId(),
        projectId,
        email: normEmail,
        role,
        invitedBy,
        invitedAt: Date.now(),
    };
    _pending.set(rec.id, rec);
    return rec;
}

/** All pending invites addressed to `email` (case-insensitive), across projects. */
export function listPendingInvitesByEmail(email) {
    const n = normalizeInviteEmail(email);
    if (!n) return [];
    return Array.from(_pending.values()).filter(i => i.email === n);
}

/** All pending invites for a project (e.g. to show "invited, not yet joined"). */
export function listPendingInvitesForProject(projectId) {
    return Array.from(_pending.values()).filter(i => i.projectId === projectId);
}

/** Remove a pending invite by id. Returns true if one was removed. */
export function deletePendingInvite(id) {
    return _pending.delete(id);
}

/**
 * Resolve the pending invites a newly-signed-up email should join.
 * Pure read (does not mutate) — the signup flow upserts a member per returned
 * invite and then calls deletePendingInvite(invite.id) for each.
 */
export function resolvePendingInvitesForEmail(email) {
    return listPendingInvitesByEmail(email);
}

/** TEST-ONLY — clear all pending invites so suites stay isolated. */
export function __resetPendingInvitesForTests() {
    _pending.clear();
}
