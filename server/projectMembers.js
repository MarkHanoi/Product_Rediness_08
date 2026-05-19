/**
 * @file server/projectMembers.js
 * @description ISO 19650 CDE Phase 1 — Project member store for PRYZM.
 *
 * CONTRACT (17-ISO-19650-CDE-IMPLEMENTATION-PLAN Phase 1 §1.1):
 *  - Stores project membership records in-memory with Supabase persistence when configured.
 *  - A user may only have ONE role per project (enforced via unique constraint).
 *  - Only 'lead_appointed' or 'appointing_party' may add members.
 *  - Resolving a user's role for a project is the hot-path — must be O(1) per lookup.
 *
 * ISO 19650 roles (§1.6):
 *   appointing_party | lead_appointed | team_manager | team_member | viewer
 */

'use strict';

import { ROLES } from './permissions.js';

// ── In-memory store ──────────────────────────────────────────────────────────
// Map<projectId, Map<userId, MemberRecord>>
const _members = new Map();

/**
 * @typedef {Object} MemberRecord
 * @property {string}      id          - Record UUID
 * @property {string}      projectId
 * @property {string}      userId
 * @property {string}      role        - ISO 19650 role key
 * @property {string|null} invitedBy   - userId of inviter
 * @property {number}      invitedAt   - Unix ms
 * @property {number|null} acceptedAt  - Unix ms; null = invitation pending
 */

function _genId() {
    return `mbr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function _projectMap(projectId) {
    if (!_members.has(projectId)) _members.set(projectId, new Map());
    return _members.get(projectId);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the MemberRecord for a user in a project, or null if not a member.
 */
export function getMember(projectId, userId) {
    return _projectMap(projectId).get(userId) ?? null;
}

/**
 * Returns the ISO 19650 role string for the user in the project, or null.
 */
export function getUserRole(projectId, userId) {
    return getMember(projectId, userId)?.role ?? null;
}

/**
 * Returns all members of a project as an array.
 */
export function listMembers(projectId) {
    return Array.from(_projectMap(projectId).values());
}

/**
 * Adds or updates a member. Throws if role is invalid.
 * Returns the MemberRecord.
 */
export function upsertMember(projectId, userId, role, invitedBy = null) {
    if (!ROLES.includes(role)) {
        throw new Error(`Invalid role "${role}". Must be one of: ${ROLES.join(', ')}`);
    }
    const map = _projectMap(projectId);
    const existing = map.get(userId);
    const record = existing
        ? { ...existing, role }
        : {
            id: _genId(),
            projectId,
            userId,
            role,
            invitedBy,
            invitedAt: Date.now(),
            acceptedAt: null,
        };
    map.set(userId, record);
    console.log(`[projectMembers] Upserted ${userId} → ${role} in project ${projectId}`);
    return record;
}

/**
 * Updates only the role of an existing member. Returns the updated record or null if not found.
 */
export function updateMemberRole(projectId, userId, role) {
    if (!ROLES.includes(role)) {
        throw new Error(`Invalid role "${role}". Must be one of: ${ROLES.join(', ')}`);
    }
    const map = _projectMap(projectId);
    const record = map.get(userId);
    if (!record) return null;
    record.role = role;
    map.set(userId, record);
    return record;
}

/**
 * Removes a member from a project. Returns true if removed, false if not found.
 */
export function removeMember(projectId, userId) {
    return _projectMap(projectId).delete(userId);
}

/**
 * Marks the invitation as accepted (sets acceptedAt).
 */
export function acceptInvitation(projectId, userId) {
    const map = _projectMap(projectId);
    const record = map.get(userId);
    if (!record) return null;
    record.acceptedAt = Date.now();
    map.set(userId, record);
    return record;
}

// ── Supabase-backed versions of all operations ────────────────────────────────
// These are called when Supabase is configured. The in-memory store acts as
// a write-through cache — writes go to Supabase AND update in-memory.

export async function getMemberFromSupabase(supabase, projectId, userId) {
    const { data } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();
    return data ?? null;
}

export async function listMembersFromSupabase(supabase, projectId) {
    const { data, error } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId)
        .order('invited_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
}

export async function upsertMemberInSupabase(supabase, projectId, userId, role, invitedBy) {
    if (!ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
    const { data, error } = await supabase
        .from('project_members')
        .upsert({ project_id: projectId, user_id: userId, role, invited_by: invitedBy }, { onConflict: 'project_id,user_id' })
        .select().single();
    if (error) throw error;
    return data;
}

export async function updateMemberRoleInSupabase(supabase, projectId, userId, role) {
    if (!ROLES.includes(role)) throw new Error(`Invalid role: ${role}`);
    const { data, error } = await supabase
        .from('project_members')
        .update({ role })
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .select().single();
    if (error) throw error;
    return data;
}

export async function removeMemberFromSupabase(supabase, projectId, userId) {
    const { error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);
    if (error) throw error;
    return true;
}
