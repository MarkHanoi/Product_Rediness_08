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

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-MEMBERS-PG-WRITE-PATH + §FIX-MEMBERS-ABSENT-VS-UNREACHABLE
// (closes L-806(b), logged 2026-08-09 and still open)
// ─────────────────────────────────────────────────────────────────────────────
//
// THE DEFECT THIS CLOSES
// ----------------------
// Everything above this line speaks exactly two backends: Supabase, or a
// volatile in-process `Map`. PRODUCTION speaks NEITHER — it runs on PostgreSQL
// via `DATABASE_URL` (which `pgClient.js` itself PREFERS over Supabase), and
// `getSupabaseClient()` returns null there. So on production:
//
//   * `GET  /api/projects/:id/members` read the empty `Map` and answered
//     `{members: []}` with HTTP 200 — a confident "0 members" produced by a
//     store that had never been written to and never could be. The
//     `project_members` TABLE (dbMigrate.js §4) was never consulted.
//   * `POST /api/projects/:id/members` with an email hit `if (!supabase)` and
//     answered `400 "Inviting by email requires the database connection."` —
//     naming a cause that is FALSE. The database connection is up; the same
//     process serves fifty projects out of it. What was missing was a CODE PATH.
//
// Both halves are C01 §6 rule 6: ABSENT and UNREACHABLE reported as the same
// value, and a specific-but-wrong diagnosis printed for a generic failure.
//
// DESIGN RULES FOR EVERYTHING BELOW
// ---------------------------------
// 1. THREE backends, fixed priority: supabase -> postgres -> memory. The
//    priority matches `canUserAccessProject`, so the ACCESS GATE and the MEMBER
//    LIST can never disagree about who is a member of a project.
// 2. EVERY read/write reports its `source`. A caller that cannot tell which
//    store answered cannot tell `[]` from "not stored here".
// 3. NO SILENT FALLBACK. If a backend exists and THROWS, the error propagates.
//    Degrading to the Map on a pooler blip is exactly the §FIX-DEGRADE-HONESTY
//    (L-789) defect, one layer up.
// 4. The pool is passed IN, never imported — so these are unit-testable against
//    a fake pool, the way projectStore's tests already work.

/** Coerces a Postgres TIMESTAMPTZ / ISO string / epoch-ms into epoch-ms or null. */
function _toEpochMs(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v instanceof Date) { const t = v.getTime(); return Number.isNaN(t) ? null : t; }
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? null : t;
}

/**
 * Normalises ANY of the three backends' row shapes into the ONE shape the
 * client `ProjectMember` interface declares.
 *
 * This is not cosmetic. `ProjectMemberPanel.renderMemberRow` does
 * `escHtml(m.displayName ?? m.userId)`, and `listMembersFromSupabase` returns
 * RAW snake_case (`user_id`) — so both were undefined and
 * `escHtml(undefined).replace` threw, blanking the modal. The in-memory path
 * returned camelCase and did not. Two backends, two shapes, one consumer: the
 * Supabase branch could never have rendered a single member row.
 */
export function toMemberDTO(row) {
    if (!row || typeof row !== 'object') return null;
    return {
        id: row.id ?? null,
        projectId: row.projectId ?? row.project_id ?? null,
        userId: row.userId ?? row.user_id ?? null,
        displayName: row.displayName ?? row.display_name ?? row.name ?? null,
        email: row.email ?? null,
        role: row.role ?? null,
        invitedBy: row.invitedBy ?? row.invited_by ?? null,
        invitedAt: _toEpochMs(row.invitedAt ?? row.invited_at),
        acceptedAt: _toEpochMs(row.acceptedAt ?? row.accepted_at),
    };
}

// ── PostgreSQL-backed operations (the branch that did not exist) ─────────────

const _PG_MEMBER_COLUMNS =
    'm.id, m.project_id, m.user_id, m.role, m.invited_by, m.invited_at, m.accepted_at';

/** SELECT the real `project_members` rows, joined to `pryzm_users` for identity. */
export async function listMembersFromPg(pool, projectId) {
    const { rows } = await pool.query(
        `SELECT ${_PG_MEMBER_COLUMNS}, u.email, u.name
           FROM project_members m
           LEFT JOIN pryzm_users u ON u.id = m.user_id
          WHERE m.project_id = $1
          ORDER BY m.invited_at ASC`,
        [projectId],
    );
    return rows ?? [];
}

/** Idempotent INSERT, upserting on the UNIQUE (project_id, user_id) constraint. */
export async function upsertMemberInPg(pool, projectId, userId, role, invitedBy = null) {
    if (!ROLES.includes(role)) {
        throw new Error(`Invalid role "${role}". Must be one of: ${ROLES.join(', ')}`);
    }
    const { rows } = await pool.query(
        `INSERT INTO project_members (project_id, user_id, role, invited_by)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
           RETURNING id, project_id, user_id, role, invited_by, invited_at, accepted_at`,
        [projectId, userId, role, invitedBy],
    );
    return rows?.[0] ?? null;
}

/** Returns the updated row, or null when the member does not exist (route -> 404). */
export async function updateMemberRoleInPg(pool, projectId, userId, role) {
    if (!ROLES.includes(role)) {
        throw new Error(`Invalid role "${role}". Must be one of: ${ROLES.join(', ')}`);
    }
    const { rows } = await pool.query(
        `UPDATE project_members SET role = $3
          WHERE project_id = $1 AND user_id = $2
      RETURNING id, project_id, user_id, role, invited_by, invited_at, accepted_at`,
        [projectId, userId, role],
    );
    return rows?.[0] ?? null;
}

/** Returns true when a row was actually deleted. */
export async function removeMemberFromPg(pool, projectId, userId) {
    const res = await pool.query(
        `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId],
    );
    return (res?.rowCount ?? 0) > 0;
}

/**
 * Resolves an email to a PRYZM userId against the LOCAL Postgres user
 * directory. Case-insensitive EXACT match, no wildcards — mirroring the
 * Supabase `.ilike(email)` call so the two directories cannot disagree.
 */
export async function findUserIdByEmailInPg(pool, email) {
    const { rows } = await pool.query(
        `SELECT id FROM pryzm_users WHERE lower(email) = lower($1) LIMIT 1`,
        [String(email ?? '').trim()],
    );
    return rows?.[0]?.id ?? null;
}

// ── Backend-selecting orchestrators — the ONLY thing routes should call ──────

/**
 * @returns {Promise<{members: object[], source: 'supabase'|'postgres'|'memory'}>}
 *
 * `source` is the whole point. `{members: [], source: 'postgres'}` means the
 * project genuinely has no member rows — a MEASUREMENT.
 * `{members: [], source: 'memory'}` means nobody has written to this process
 * since boot and the answer is worthless. They are DIFFERENT FACTS, and the
 * caller now receives them as different values.
 */
export async function listMembersForProject({ supabase = null, pool = null, projectId }) {
    if (supabase) {
        const rows = await listMembersFromSupabase(supabase, projectId);
        return { members: rows.map(toMemberDTO), source: 'supabase' };
    }
    if (pool) {
        const rows = await listMembersFromPg(pool, projectId);
        return { members: rows.map(toMemberDTO), source: 'postgres' };
    }
    return { members: listMembers(projectId).map(toMemberDTO), source: 'memory' };
}

/**
 * Resolves the invite target (a raw userId, or an email) to a userId.
 *
 * Never throws for a "cannot resolve" outcome — returns a discriminated result
 * carrying the HTTP status, a machine `code`, and a message that names the
 * ACTUAL cause. The string it replaces ("Inviting by email requires the
 * database connection.") was wrong on production, in the exact deployment shape
 * that produced it.
 *
 * @returns {Promise<{ok: true, userId: string, source: string}
 *                 | {ok: false, status: number, code: string, error: string}>}
 */
export async function resolveInviteTarget({ supabase = null, pool = null, target }) {
    const raw = typeof target === 'string' ? target.trim() : '';
    if (raw.length === 0) {
        return { ok: false, status: 400, code: 'target_required', error: 'userId (or email) and role are required.' };
    }
    if (!raw.includes('@')) {
        return { ok: true, userId: raw, source: 'literal' };
    }
    if (supabase) {
        const { data } = await supabase
            .from('pryzm_users').select('id').ilike('email', raw).maybeSingle();
        if (!data?.id) {
            return { ok: false, status: 404, code: 'user_not_found', error: `No PRYZM user found with email "${raw}". Ask them to sign up first.` };
        }
        return { ok: true, userId: data.id, source: 'supabase' };
    }
    if (pool) {
        const id = await findUserIdByEmailInPg(pool, raw);
        if (!id) {
            return { ok: false, status: 404, code: 'user_not_found', error: `No PRYZM user found with email "${raw}". Ask them to sign up first.` };
        }
        return { ok: true, userId: id, source: 'postgres' };
    }
    // The ONLY state in which the old message was even close to true — and even
    // here the honest reading is "this process has no user directory", not "the
    // database connection is missing", because in-memory mode is a DECLARED
    // backend (PRYZM_FORCE_INMEMORY, or no DATABASE_URL at all), not an outage.
    return {
        ok: false,
        status: 503,
        code: 'user_directory_unavailable',
        error: 'Cannot invite by email: this server has no user directory configured '
             + '(neither Supabase nor PostgreSQL), so an email cannot be resolved to a '
             + 'PRYZM account. Invite by user ID instead.',
    };
}

/** Writes the member to the highest-priority backend available; reports which. */
export async function upsertMemberForProject({ supabase = null, pool = null, projectId, userId, role, invitedBy = null }) {
    if (supabase) {
        return { member: toMemberDTO(await upsertMemberInSupabase(supabase, projectId, userId, role, invitedBy)), source: 'supabase' };
    }
    if (pool) {
        return { member: toMemberDTO(await upsertMemberInPg(pool, projectId, userId, role, invitedBy)), source: 'postgres' };
    }
    return { member: toMemberDTO(upsertMember(projectId, userId, role, invitedBy)), source: 'memory' };
}

/** @returns {Promise<{member: object|null, source: string}>} — a null member means 404. */
export async function updateMemberRoleForProject({ supabase = null, pool = null, projectId, userId, role }) {
    if (supabase) {
        return { member: toMemberDTO(await updateMemberRoleInSupabase(supabase, projectId, userId, role)), source: 'supabase' };
    }
    if (pool) {
        return { member: toMemberDTO(await updateMemberRoleInPg(pool, projectId, userId, role)), source: 'postgres' };
    }
    return { member: toMemberDTO(updateMemberRole(projectId, userId, role)), source: 'memory' };
}

/** @returns {Promise<{removed: boolean, source: string}>} */
export async function removeMemberForProject({ supabase = null, pool = null, projectId, userId }) {
    if (supabase) {
        await removeMemberFromSupabase(supabase, projectId, userId);
        return { removed: true, source: 'supabase' };
    }
    if (pool) {
        return { removed: await removeMemberFromPg(pool, projectId, userId), source: 'postgres' };
    }
    return { removed: removeMember(projectId, userId), source: 'memory' };
}
