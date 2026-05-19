/**
 * @file server/permissions.js
 * @description ISO 19650 CDE Role-Permission Matrix for PRYZM.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §C4, 17-ISO-19650-CDE-IMPLEMENTATION-PLAN Phase 1):
 *  - ALL server route handlers and Socket.io events MUST call hasPermission() before acting.
 *  - The platform owner ('owner' plan) bypasses all role checks — they are implicitly permitted
 *    to perform any action across any project.
 *  - Role is resolved per-project from the project_members table (or in-memory fallback).
 *    A user without a project_members row is treated as having no role (no access).
 *  - The five ISO 19650 roles map directly to PRYZM role keys (§1.6 of implementation plan).
 *
 * ISO 19650-1:2018 §5.1 roles:
 *   appointing_party  — client/employer; approves Published, reads all states
 *   lead_appointed    — lead consultant; moves Shared→Published, manages team
 *   team_manager      — discipline lead; moves WIP→Shared, rejects back to WIP
 *   team_member       — contributor; creates and edits in WIP
 *   viewer            — read-only; sees Shared and Published only
 */

'use strict';

// ── Permission matrix ─────────────────────────────────────────────────────────
// Each key is an action name. The value is the set of roles permitted to perform it.
// Owner plan bypasses all checks — see hasPermission().

export const ROLES = Object.freeze([
    'appointing_party',
    'lead_appointed',
    'team_manager',
    'team_member',
    'viewer',
]);

const PERMISSIONS = {
    // Model editing
    edit_model:         ['team_member', 'team_manager', 'lead_appointed'],

    // Version state transitions (ISO 19650-2 §5.3)
    move_to_shared:     ['team_manager', 'lead_appointed'],
    move_to_published:  ['lead_appointed'],
    reject_to_wip:      ['team_manager', 'lead_appointed'],
    approve_published:  ['appointing_party'],
    archive:            ['lead_appointed', 'appointing_party'],

    // Transmittals (ISO 19650-2 §5.3.4)
    create_transmittal: ['lead_appointed'],
    acknowledge_transmittal: ['team_member', 'team_manager', 'lead_appointed', 'appointing_party', 'viewer'],

    // Member management
    invite_member:      ['team_manager', 'lead_appointed', 'appointing_party'],
    change_role:        ['lead_appointed', 'appointing_party'],
    remove_member:      ['lead_appointed', 'appointing_party'],
    view_members:       ['team_member', 'team_manager', 'lead_appointed', 'appointing_party'],

    // Read access by state
    read_wip:           ['team_member', 'team_manager', 'lead_appointed'],
    read_shared:        ['team_member', 'team_manager', 'lead_appointed', 'viewer'],
    read_published:     ['team_member', 'team_manager', 'lead_appointed', 'viewer', 'appointing_party'],
    read_archived:      ['team_member', 'team_manager', 'lead_appointed', 'viewer', 'appointing_party'],

    // Project settings (EIR, naming defaults)
    manage_project_settings: ['lead_appointed', 'appointing_party'],

    // Quality reports
    view_quality_report: ['team_manager', 'lead_appointed', 'appointing_party'],

    // Issues register
    create_issue:       ['team_member', 'team_manager', 'lead_appointed'],
    update_issue:       ['team_member', 'team_manager', 'lead_appointed'],
    view_issues:        ['team_member', 'team_manager', 'lead_appointed', 'viewer', 'appointing_party'],
};

/**
 * Returns true if the given role is permitted to perform the action.
 * The platform owner (ownerPlan === true) bypasses all role checks.
 *
 * @param {string|null} role       - ISO 19650 role key, or null if user has no membership
 * @param {string}      action     - Action key from PERMISSIONS above
 * @param {boolean}     isOwner    - true when the caller has the 'owner' platform plan
 */
export function hasPermission(role, action, isOwner = false) {
    if (isOwner) return true;
    if (!role) return false;
    const allowed = PERMISSIONS[action];
    if (!allowed) {
        console.warn(`[permissions] Unknown action "${action}" — defaulting to DENY`);
        return false;
    }
    return allowed.includes(role);
}

/**
 * Express middleware factory. Resolves the caller's project role from req.auth.projectRole
 * (set by the role resolution middleware) and enforces the given permission.
 *
 * Usage:
 *   app.post('/api/projects/:id/members', authMiddleware, roleCheck('invite_member'), handler)
 */
export function roleCheck(action) {
    return (req, res, next) => {
        const role = req.auth?.projectRole ?? null;
        const isOwner = req.auth?.isOwner ?? false;
        if (!hasPermission(role, action, isOwner)) {
            return res.status(403).json({
                error: `Forbidden — "${action}" requires one of: ${(PERMISSIONS[action] ?? []).join(', ')}`,
                yourRole: role ?? 'none',
                action,
            });
        }
        next();
    };
}
