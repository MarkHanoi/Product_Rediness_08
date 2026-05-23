/**
 * server/projectStore.js
 * PostgreSQL-backed project and version storage for PRYZM.
 *
 * Used as the persistent fallback when SUPABASE_URL is not configured
 * but DATABASE_URL (Replit PostgreSQL) is available.
 *
 * Contract: §09-DATABASE-PERSISTENCE-ARCHITECTURE — persistent storage layer.
 * All queries filter by owner_id so users only see their own data.
 *
 * NOTE: Table names match the schema in server/dbMigrate.js exactly:
 *   projects              (not pryzm_projects)
 *   project_versions      (not pryzm_project_versions)
 */

import { randomBytes } from 'crypto';
import { query, withTransaction, getPgPool } from './pgClient.js';
import { ProjectConflictError, VersionLimitError, PreconditionFailedError } from './errors.js';

// §SERVER-V1-INMEMORY-FALLBACK (DAILY-USE 2026-05-21, Round 40) — last-resort
// in-memory fallback so the architect can create / list / open projects even
// when the PG pool is not configured (missing SUPABASE_DB_URL / DATABASE_URL,
// connection refused, schema not yet applied at startup, etc.).
//
// The unversioned /api/projects route (server.js:2418) has had an in-memory
// fallback for ages — `_projects.get(id)` keeps the architect productive in
// local-dev / first-boot scenarios. The /api/v1/projects routes did NOT have
// this fallback; every call required a working PG pool. When the architect's
// pool was misconfigured (the cause of the persistent project-create 500 the
// architect has been blocked on across Rounds 25-39), every v1 call threw
// 'PostgreSQL not configured' → Round 28 returned 503 db_not_configured —
// technically correct, but the architect was still blocked from creating any
// project at all.
//
// Round 40 adds a process-wide in-memory map. When the PG pool is absent,
// every projectStore method falls back to the in-memory map; when the pool
// IS present, it's bypassed. The fallback is owner-scoped (same isolation
// invariant as the PG path).
//
// IMPORTANT: this is a DEV / first-boot helper. The data does NOT persist
// across server restarts — every restart resets the map. Production
// deployments should still configure a real DB; the fallback exists so
// architects can iterate locally without the DB-config friction.
const _inMemoryProjects = new Map(); // id → { id, name, owner_id, ... }
function _inMemoryRowFor(id, name, userId) {
    const now = new Date().toISOString();
    return {
        id,
        name,
        owner_id:      userId,
        version_count: 0,
        thumbnail:     null,
        is_archived:   false,
        is_starred:    false,
        description:   null,
        updated_at:    now,
        created_at:    now,
        latest_element_count: 0,
        is_empty:      true,
    };
}
function _hasPool() { return !!getPgPool(); }

/**
 * §SERVER-V1-INMEMORY-FALLBACK (Round 40b) — Exposed for cross-module read.
 * The unversioned /api/projects/:id/versions route (server.js) keeps its OWN
 * in-memory map for version snapshots; it needs to check whether the project
 * id exists in projectStore's in-memory map too (because a v1 fallback create
 * lands here, not in server.js's map). This getter is read-only by design;
 * mutations go through the named functions (createProject, deleteProject, …)
 * so cache-coherence invariants hold.
 */
export function _hasInMemoryProject(projectId, userId) {
    const row = _inMemoryProjects.get(projectId);
    return !!row && (!userId || row.owner_id === userId);
}

// ── §STORE-UNIFY (2026-05-23) — single in-memory PROJECT authority ──────────────
// The unversioned /api/projects routes in server.js used to keep their OWN
// `_projects` Map; the v1 /api/v1/projects routes create projects in
// `_inMemoryProjects` here. The two maps DIVERGED: a v1-created project was
// invisible to the v0 open / list / delete / version-save fallbacks, so a
// just-created project failed to open (#74), delete restored it (#76), and
// auto-save version counts desynced (#134) — all previously patched defensively.
//
// These accessors make `_inMemoryProjects` the ONE in-memory project store.
// server.js now delegates to them and no longer keeps a parallel `_projects`
// map. Rows are translated to the v0 shape the unversioned routes expect
// ({ id, name, updatedAt:<ms>, versionCount, ownerId }) so server.js's existing
// field reads (`.ownerId`, `.versionCount`, `.updatedAt`) are unchanged.
//
// They write/read `_inMemoryProjects` UNCONDITIONALLY (not gated on `_hasPool()`):
// the v0 routes seed this map as a Socket.io join-project race-window cache even
// when Supabase/PG is the durable store (server.js create path), exactly as the
// old `_projects` map did. The `is_empty` / `latest_element_count` fields keep
// the v1 hub list accurate after an in-memory version save.

function _toV0Project(row) {
    if (!row) return null;
    return {
        id:           row.id,
        name:         row.name,
        updatedAt:    new Date(row.updated_at).getTime(),
        versionCount: row.version_count ?? 0,
        ownerId:      row.owner_id,
    };
}

/** v0-shaped read of the single in-memory project store; null when absent. */
export function imGetProject(projectId) {
    return _toV0Project(_inMemoryProjects.get(projectId) ?? null);
}

/** All v0-shaped rows (optionally owner-filtered), newest-first. */
export function imListProjects(userId) {
    const out = [];
    for (const row of _inMemoryProjects.values()) {
        if (!userId || row.owner_id === userId) out.push(_toV0Project(row));
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
}

/** Create-or-update the in-memory row; returns the v0-shaped row. */
export function imUpsertProject(projectId, name, ownerId) {
    const existing = _inMemoryProjects.get(projectId);
    if (existing) {
        if (name != null) existing.name = name;
        existing.updated_at = new Date().toISOString();
        return _toV0Project(existing);
    }
    const row = _inMemoryRowFor(projectId, name ?? 'Untitled', ownerId);
    _inMemoryProjects.set(projectId, row);
    return _toV0Project(row);
}

/** Delete; returns true when a row was removed. */
export function imDeleteProject(projectId) {
    return _inMemoryProjects.delete(projectId);
}

/**
 * Record a version save against the in-memory row: bump updated_at + set the
 * authoritative version_count (server.js owns the in-memory version list), and
 * refresh the hub-display derived fields so the v1 project list stops showing a
 * saved-into project as empty.
 */
export function imRecordVersionSave(projectId, versionCount, elementCount) {
    const row = _inMemoryProjects.get(projectId);
    if (!row) return;
    row.updated_at = new Date().toISOString();
    if (typeof versionCount === 'number') row.version_count = versionCount;
    if (typeof elementCount === 'number') {
        row.latest_element_count = elementCount;
        row.is_empty = false;
    }
}

/** Map-like adapter for canUserAccessProject's `projectsMap` (reads `.ownerId`). */
export const imProjectsMapAdapter = { get: (projectId) => imGetProject(projectId) };

/**
 * GAP-04 fix — 48-bit cryptographic entropy instead of Math.random().
 * Format: <prefix>-<13-digit ms timestamp>-<12 hex chars>
 * Collision probability with 1M entries: < 1 in 10^10.
 */
function generateId(prefix) {
    return `${prefix}-${Date.now()}-${randomBytes(6).toString('hex')}`;
}

/**
 * GAP-04 fix — allowlist validators for caller-supplied IDs.
 * Accepts both legacy base-36 format (5–9 chars) and new hex format (12 chars).
 * Rejects path-traversal, null bytes, oversized strings, and unexpected chars.
 *
 * Regex breakdown: ^proj-  literal prefix
 *                  \d{10,16}  millisecond timestamp (valid 2001–2286)
 *                  -[a-z0-9]{5,16}$  alphanumeric suffix (base-36 or hex)
 */
const PROJECT_ID_RE = /^proj-\d{10,16}-[a-z0-9]{5,16}$/;
const VERSION_ID_RE = /^ver-\d{10,16}-[a-z0-9]{5,16}$/;

export function isValidProjectId(id) {
    return typeof id === 'string' && PROJECT_ID_RE.test(id);
}

export function isValidVersionId(id) {
    return typeof id === 'string' && VERSION_ID_RE.test(id);
}

// ── Projects ──────────────────────────────────────────────────────────────────

// Common SELECT projection so list / get / patch / duplicate all return
// the same column set.  Phase C §16.3 added is_archived / is_starred /
// description; older databases that haven't run the column migration
// will return undefined for those fields, which the client tolerates.
const PROJECT_COLUMNS = `
    id, name, owner_id, version_count, thumbnail,
    is_archived, is_starred, description,
    updated_at, created_at
`;

/**
 * GAP-12 fix — include latestElementCount and isEmpty in the list response.
 * Uses LEFT JOIN LATERAL to get the most recent version's element_count in a
 * single query without reading the `snapshot` column. The hub can now detect
 * empty projects without opening them.
 */
export async function listProjects(userId) {
    // §SERVER-V1-INMEMORY-FALLBACK — no pool → list from in-memory map
    if (!_hasPool()) {
        const rows = [];
        for (const row of _inMemoryProjects.values()) {
            if (row.owner_id === userId) rows.push(row);
        }
        rows.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return rows.slice(0, 50);
    }
    const result = await query(
        `SELECT
             p.id, p.name, p.owner_id, p.version_count, p.thumbnail,
             p.is_archived, p.is_starred, p.description,
             p.updated_at, p.created_at,
             COALESCE(v.element_count, 0) AS latest_element_count,
             (v.id IS NULL)               AS is_empty
         FROM projects p
         LEFT JOIN LATERAL (
             SELECT id, element_count
             FROM   project_versions
             WHERE  project_id = p.id
             ORDER  BY created_at DESC
             LIMIT  1
         ) v ON true
         WHERE p.owner_id = $1
         ORDER BY p.updated_at DESC
         LIMIT 50`,
        [userId]
    );
    return result.rows;
}

export async function createProject(name, userId) {
    const id = generateId('proj');
    // §SERVER-V1-INMEMORY-FALLBACK — no pool → write to in-memory map
    if (!_hasPool()) {
        if (_inMemoryProjects.has(id)) {
            // Pathological collision (Date.now + 6 random bytes ≈ 1 in 10^10) — regenerate
            return createProject(name, userId);
        }
        const row = _inMemoryRowFor(id, name, userId);
        _inMemoryProjects.set(id, row);
        console.log(`[projectStore] §SERVER-V1-INMEMORY-FALLBACK created in-memory project ${id} for user ${userId} (no PG pool configured)`);
        return row;
    }
    const result = await query(
        `INSERT INTO projects (id, name, owner_id)
         VALUES ($1, $2, $3)
         RETURNING ${PROJECT_COLUMNS}`,
        [id, name, userId]
    );
    return result.rows[0];
}

export async function getProject(projectId, userId) {
    // §SERVER-V1-INMEMORY-FALLBACK — no pool → read from in-memory map
    if (!_hasPool()) {
        const row = _inMemoryProjects.get(projectId);
        if (!row || row.owner_id !== userId) return null;
        return row;
    }
    const result = await query(
        `SELECT ${PROJECT_COLUMNS}
         FROM projects
         WHERE id = $1 AND owner_id = $2`,
        [projectId, userId]
    );
    return result.rows[0] ?? null;
}

export async function updateProjectThumbnail(projectId, userId, thumbnail) {
    await query(
        `UPDATE projects SET thumbnail = $1, updated_at = NOW()
         WHERE id = $2 AND owner_id = $3`,
        [thumbnail, projectId, userId]
    );
}

export async function upsertProject(projectId, name, userId) {
    // GAP-03 fix: the WHERE clause means the UPDATE only applies when the
    // existing row's owner_id matches the caller — a concurrent upsert from a
    // different user becomes a no-op rather than silently overwriting the name.
    // The caller MUST follow this with an ownership check (see server.js GAP-03).
    await query(
        `INSERT INTO projects (id, name, owner_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, updated_at = NOW()
         WHERE projects.owner_id = EXCLUDED.owner_id`,
        [projectId, name, userId]
    );
}

/**
 * GAP-08 fix — atomic increment instead of a full re-count subquery.
 * `version_count + 1` is a single-statement atomic update; a subquery COUNT(*)
 * is non-atomic relative to concurrent inserts (TOCTOU gap).
 *
 * NOTE: createVersionTransactional() still uses the full recount inside its
 * FOR UPDATE lock because it needs the accurate count for plan-limit enforcement.
 * This simpler form is only called from the Supabase / legacy non-transactional path.
 */
export async function touchProject(projectId) {
    await query(
        `UPDATE projects
         SET updated_at    = NOW(),
             version_count = version_count + 1
         WHERE id = $1`,
        [projectId]
    );
}

export async function renameProject(projectId, userId, name) {
    const result = await query(
        `UPDATE projects
         SET name = $1, updated_at = NOW()
         WHERE id = $2 AND owner_id = $3
         RETURNING ${PROJECT_COLUMNS}`,
        [name, projectId, userId]
    );
    return result.rows[0] ?? null;
}

/**
 * Phase C §16.3 — apply a sparse patch and return the updated row.
 * `patch` may include: { name?, isArchived?, isStarred?, description? }.
 * Builds a dynamic SET clause so unspecified fields are not touched.
 */
export async function patchProject(projectId, userId, patch) {
    const sets = [];
    const params = [];
    let pIdx = 1;
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
        sets.push(`name = $${pIdx++}`);
        params.push(patch.name);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'isArchived')) {
        sets.push(`is_archived = $${pIdx++}`);
        params.push(patch.isArchived);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'isStarred')) {
        sets.push(`is_starred = $${pIdx++}`);
        params.push(patch.isStarred);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
        sets.push(`description = $${pIdx++}`);
        params.push(patch.description);
    }
    if (sets.length === 0) {
        // Nothing to update — return the current row so the caller's
        // store stays consistent.
        return await getProject(projectId, userId);
    }
    sets.push(`updated_at = NOW()`);
    params.push(projectId, userId);
    const result = await query(
        `UPDATE projects
         SET ${sets.join(', ')}
         WHERE id = $${pIdx++} AND owner_id = $${pIdx++}
         RETURNING ${PROJECT_COLUMNS}`,
        params
    );
    return result.rows[0] ?? null;
}

/**
 * Phase C §16.3 sub-phase C.4.06 — duplicate a project owned by the
 * caller.  The new project starts empty (no versions, no thumbnail);
 * full content copy is the .pryzm exporter + importer round-trip.
 */
export async function duplicateProject(projectId, userId, explicitName) {
    const source = await getProject(projectId, userId);
    if (!source) return null;
    const newId = generateId('proj');
    const newName = (explicitName ?? `${source.name} (copy)`).slice(0, 200);
    const result = await query(
        `INSERT INTO projects (id, name, owner_id, description)
         VALUES ($1, $2, $3, $4)
         RETURNING ${PROJECT_COLUMNS}`,
        [newId, newName, userId, source.description ?? null]
    );
    return result.rows[0];
}

export async function deleteProject(projectId, userId) {
    // §SERVER-V1-INMEMORY-FALLBACK — no pool → delete from in-memory map
    if (!_hasPool()) {
        const row = _inMemoryProjects.get(projectId);
        if (!row || row.owner_id !== userId) return false;
        _inMemoryProjects.delete(projectId);
        return true;
    }
    // GAP-14 fix: the schema declares project_versions with ON DELETE CASCADE.
    // Removing the manual DELETE of project_versions makes the operation atomic —
    // a single DELETE FROM projects cascades to versions in the same transaction,
    // preventing orphaned version rows if the server crashes between two statements.
    const result = await query(
        `DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id`,
        [projectId, userId]
    );
    return result.rows.length > 0;
}

/**
 * GAP-17 fix — Lightweight project status without the full snapshot column.
 *
 * Uses LEFT JOIN LATERAL to fetch the most recent version's metadata
 * (id, label, created_at, element_count) in a single query without reading
 * the `snapshot` column (which can be 50+ MB).
 *
 * Returns null if the project doesn't exist or is not owned by userId.
 */
export async function getProjectStatus(projectId, userId) {
    const result = await query(
        `SELECT
             p.id,
             p.name,
             p.version_count,
             p.updated_at,
             v.id            AS latest_version_id,
             v.label         AS latest_version_label,
             v.created_at    AS latest_version_created_at,
             v.element_count AS latest_element_count
         FROM projects p
         LEFT JOIN LATERAL (
             SELECT id, label, created_at, element_count
             FROM   project_versions
             WHERE  project_id = p.id
             ORDER  BY created_at DESC
             LIMIT  1
         ) v ON true
         WHERE p.id = $1 AND p.owner_id = $2`,
        [projectId, userId]
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
        id:                     r.id,
        name:                   r.name,
        versionCount:           r.version_count,
        updatedAt:              r.updated_at,
        latestVersionId:        r.latest_version_id         ?? null,
        latestVersionLabel:     r.latest_version_label      ?? null,
        latestVersionCreatedAt: r.latest_version_created_at ?? null,
        latestElementCount:     r.latest_element_count      ?? 0,
        isEmpty:                r.latest_version_id === null,
    };
}

// ── Versions ──────────────────────────────────────────────────────────────────

export async function listVersions(projectId, userId) {
    // GAP-15 fix: userId is now required (not optional).
    // If called without one, we refuse rather than silently bypassing ownership.
    // Use listVersionsAdmin() for internal calls that genuinely don't need a user.
    if (!userId) {
        console.error('[projectStore] listVersions called without userId — refusing (GAP-15)');
        return [];
    }
    const ownerCheck = await query(
        `SELECT id FROM projects WHERE id = $1 AND owner_id = $2`,
        [projectId, userId]
    );
    if (ownerCheck.rows.length === 0) return [];

    const result = await query(
        `SELECT id, project_id, label, element_count, created_at, created_by
         FROM project_versions
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [projectId]
    );
    return result.rows;
}

/**
 * Internal-only: list versions without an ownership check.
 * Use ONLY for server-internal tasks (migrations, admin scripts, webhooks).
 * Never call from a user-facing route — use listVersions(projectId, userId) instead.
 */
export async function listVersionsAdmin(projectId) {
    const result = await query(
        `SELECT id, project_id, label, element_count, created_at, created_by
         FROM project_versions
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [projectId]
    );
    return result.rows;
}

export async function countVersions(projectId) {
    const result = await query(
        `SELECT COUNT(*) AS cnt FROM project_versions WHERE project_id = $1`,
        [projectId]
    );
    return parseInt(result.rows[0]?.cnt ?? '0', 10);
}

export async function getVersionByIdempotencyKey(projectId, key) {
    const result = await query(
        `SELECT id, project_id, label, element_count, created_at
         FROM project_versions
         WHERE project_id = $1 AND idempotency_key = $2`,
        [projectId, key]
    );
    return result.rows[0] ?? null;
}

export async function getVersionById(projectId, versionId, userId) {
    // Project-isolation: if userId is provided, verify ownership before returning.
    if (userId) {
        const ownerCheck = await query(
            `SELECT id FROM projects WHERE id = $1 AND owner_id = $2`,
            [projectId, userId]
        );
        if (ownerCheck.rows.length === 0) return null;
    }
    const result = await query(
        `SELECT id, project_id, label, snapshot, element_count, created_at, created_by
         FROM project_versions
         WHERE id = $1 AND project_id = $2`,
        [versionId, projectId]
    );
    return result.rows[0] ?? null;
}

/**
 * Returns the most recently saved version (with full snapshot) for a project.
 * Used by the REST API to serve model data without requiring a version ID.
 */
export async function getLatestVersionSnapshot(projectId) {
    const result = await query(
        `SELECT id, project_id, label, snapshot, element_count, created_at, created_by
         FROM project_versions
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [projectId]
    );
    return result.rows[0] ?? null;
}

/**
 * GAP-11 fix — Command-log delta fetch for reconnect replay.
 *
 * Returns all project_command_log entries for a project created after the
 * given cursor timestamp (ISO 8601). Used by `GET /api/projects/:id/command-log`
 * so that a reconnecting client can replay only the commands it missed, rather
 * than requesting a full snapshot resend.
 *
 * @param {string}  projectId   — project to query
 * @param {string}  [afterCursor] — ISO 8601 timestamp; omit to fetch from the start
 * @param {number}  [limit=100] — max entries to return (capped at 500)
 * @returns {Promise<Array<{id,project_id,user_id,command_type,payload,created_at}>>}
 */
export async function getCommandLogAfter(projectId, afterCursor, limit = 100) {
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
    if (afterCursor) {
        const result = await query(
            `SELECT id, project_id, user_id, command_type, payload, created_at
             FROM project_command_log
             WHERE project_id = $1 AND created_at > $2
             ORDER BY created_at ASC
             LIMIT $3`,
            [projectId, afterCursor, safeLimit]
        );
        return result.rows;
    }
    const result = await query(
        `SELECT id, project_id, user_id, command_type, payload, created_at
         FROM project_command_log
         WHERE project_id = $1
         ORDER BY created_at ASC
         LIMIT $2`,
        [projectId, safeLimit]
    );
    return result.rows;
}

export async function createVersion({ versionId, projectId, label, snapshot, elementCount, createdBy, idempotencyKey }) {
    const id = versionId || generateId('ver');
    const result = await query(
        `INSERT INTO project_versions
             (id, project_id, label, snapshot, element_count, created_by, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, project_id, label, element_count, created_at`,
        [id, projectId, label, JSON.stringify(snapshot), elementCount, createdBy, idempotencyKey || id]
    );
    return result.rows[0];
}

/**
 * GAP-01 fix — Atomic version save wrapped in a single BEGIN/COMMIT transaction.
 *
 * Sequence inside the transaction (all-or-nothing):
 *   1. SELECT … FOR UPDATE on the projects row — serialises concurrent saves
 *      for the same project so no two requests can both pass the count-check
 *      simultaneously.
 *   2. If the project row does not exist yet, INSERT it (first-save creation).
 *      If it exists, verify the caller is the owner — throws ProjectConflictError
 *      on mismatch (GAP-03 coverage for the PG path).
 *   3. COUNT existing versions inside the locked transaction context
 *      (consistent read — prevents TOCTOU race on version limits).
 *   4. INSERT the version row (ON CONFLICT DO NOTHING for idempotency).
 *   5. UPDATE projects.version_count atomically.
 *
 * @param {{
 *   versionId:      string,
 *   projectId:      string,
 *   projectName:    string,
 *   userId:         string,
 *   label:          string,
 *   snapshot:       object,
 *   elementCount:   number,
 *   idempotencyKey: string,
 *   maxVersions:    number,   // -1 = unlimited
 *   plan:           string,
 * }} params
 * @returns {Promise<object>} — the newly inserted version row (id, project_id, label, element_count, created_at)
 */
export async function createVersionTransactional({
    versionId, projectId, projectName, userId, label, snapshot,
    elementCount, idempotencyKey, maxVersions, plan,
    expectedVersionCount,
}) {
    return withTransaction(async (client) => {
        // ── Step 1: Lock the project row (or detect that it doesn't exist yet) ──
        const projResult = await client.query(
            `SELECT id, owner_id, version_count FROM projects WHERE id = $1 FOR UPDATE`,
            [projectId]
        );

        if (projResult.rows.length === 0) {
            // ── Step 1b: GAP-06 — Optimistic locking check on first-save ──
            // If the client asserted a non-zero expected version count, the project
            // should already exist. A mismatch here means a race or stale client.
            if (expectedVersionCount !== undefined && expectedVersionCount !== 0) {
                throw new PreconditionFailedError(expectedVersionCount, 0);
            }

            // ── Step 2a: First-save creation — project does not exist yet ──
            // ON CONFLICT DO NOTHING is a safety net only; the FOR UPDATE lock
            // above means no concurrent INSERT can race us here.
            await client.query(
                `INSERT INTO projects (id, name, owner_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO NOTHING`,
                [projectId, (projectName ?? 'Untitled').slice(0, 200), userId]
            );
        } else {
            // ── Step 2b: Project exists — verify caller is the owner ──
            // (GAP-03 coverage for the PG transaction path)
            const existingOwnerId = projResult.rows[0].owner_id;
            if (existingOwnerId !== userId) {
                throw new ProjectConflictError(
                    projectId,
                    `Project ${projectId} is owned by a different user — save rejected`
                );
            }

            // ── Step 2c: GAP-06 — Optimistic locking check (inside FOR UPDATE lock) ──
            // The FOR UPDATE lock means this read is serialised against all concurrent
            // saves — the count we see is the true current count at this instant.
            if (expectedVersionCount !== undefined) {
                const actualCount = parseInt(projResult.rows[0].version_count ?? 0, 10);
                if (actualCount !== expectedVersionCount) {
                    throw new PreconditionFailedError(expectedVersionCount, actualCount);
                }
            }

            // Keep the project name current if the caller supplied one.
            if (projectName) {
                await client.query(
                    `UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2`,
                    [projectName.slice(0, 200), projectId]
                );
            }
        }

        // ── Step 3: Count existing versions (inside transaction = serialised) ──
        if (maxVersions !== -1) {
            const countResult = await client.query(
                `SELECT COUNT(*) AS cnt FROM project_versions WHERE project_id = $1`,
                [projectId]
            );
            const existingCount = parseInt(countResult.rows[0].cnt, 10);
            if (existingCount >= maxVersions) {
                throw new VersionLimitError(plan, maxVersions, existingCount);
            }
        }

        // ── Step 4: Insert version (idempotent) ──
        const resolvedId = versionId || generateId('ver');
        const ikey = idempotencyKey || resolvedId;
        const insertResult = await client.query(
            `INSERT INTO project_versions
                 (id, project_id, label, snapshot, element_count, created_by, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING
             RETURNING id, project_id, label, element_count, created_at`,
            [resolvedId, projectId, label, JSON.stringify(snapshot), elementCount, userId, ikey]
        );

        // ── Step 5: Update project's version_count atomically ──
        await client.query(
            `UPDATE projects
             SET updated_at = NOW(),
                 version_count = (SELECT COUNT(*) FROM project_versions WHERE project_id = $1)
             WHERE id = $1`,
            [projectId]
        );

        // ON CONFLICT DO NOTHING returns no rows when a duplicate is silently
        // swallowed — re-fetch the existing row so the caller always gets a valid response.
        if (insertResult.rows.length === 0) {
            const existing = await client.query(
                `SELECT id, project_id, label, element_count, created_at
                 FROM project_versions WHERE id = $1`,
                [resolvedId]
            );
            return existing.rows[0] ?? null;
        }
        return insertResult.rows[0];
    });
}
