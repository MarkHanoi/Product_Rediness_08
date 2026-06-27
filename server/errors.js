/**
 * server/errors.js
 * Typed error classes for PRYZM project API routes.
 *
 * Every class carries:
 *   .statusCode  — HTTP status code to return from the route catch block
 *   .code        — machine-readable error discriminator for the client
 *
 * Contract references:
 *   C05 §1.4  — project isolation (access denial signals)
 *   C08 §2.2  — server-side ownership check
 *   C08 §4    — server is the authoritative gate for all plan/size limits
 *
 * Usage:
 *   throw new SnapshotTooLargeError(sizeBytes, SNAPSHOT_LIMIT_BYTES);
 *   ...
 *   } catch (err) {
 *       return handleProjectApiError(err, res, 'api/projects/:id/versions POST');
 *   }
 */

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ProjectNotFoundError extends Error {
    constructor(projectId) {
        super(`Project not found: ${projectId}`);
        this.name = 'ProjectNotFoundError';
        this.code = 'project_not_found';
        this.statusCode = 404;
        this.projectId = projectId;
    }
}

/**
 * §VERSIONS-410-STALE-SAVE (2026-06-27) — a version save arrived for a project
 * that no longer exists AND the caller asserted (via If-Match, or by replaying a
 * previously-synced idempotency key) that it should already exist. This is a
 * stale autosave replay for a deleted project — the client's ServerSyncQueue
 * treats any 4xx as terminal and DROPS the queued item, so we return 410 Gone
 * (rather than re-creating the project via the first-save pattern, or hard-500ing
 * in a retry loop). 410 is distinct from 404 so the client/log can tell "this
 * project was deleted" from "bad id".
 */
export class ProjectGoneError extends Error {
    constructor(projectId) {
        super(`Project no longer exists (stale save dropped): ${projectId}`);
        this.name = 'ProjectGoneError';
        this.code = 'project_gone';
        this.statusCode = 410;
        this.projectId = projectId;
    }
}

export class ProjectAccessDeniedError extends Error {
    constructor(projectId) {
        super(`Access denied to project: ${projectId}`);
        this.name = 'ProjectAccessDeniedError';
        this.code = 'project_access_denied';
        this.statusCode = 403;
        this.projectId = projectId;
    }
}

/**
 * GAP-05: snapshot byte-size exceeded.
 * Thrown before any DB write so no partial state is persisted.
 */
export class SnapshotTooLargeError extends Error {
    constructor(sizeBytes, limitBytes) {
        super(`Snapshot too large: ${sizeBytes} bytes (limit: ${limitBytes} bytes)`);
        this.name = 'SnapshotTooLargeError';
        this.code = 'snapshot_too_large';
        this.statusCode = 413;
        this.sizeBytes = sizeBytes;
        this.limitBytes = limitBytes;
    }
}

/**
 * GAP-07: version limit exceeded for the caller's plan.
 * Distinct from HTTP 403 (plan forbidden) so the client can display
 * a targeted "upgrade to save more versions" prompt.
 */
export class VersionLimitError extends Error {
    constructor(plan, limit, current) {
        super(`Version limit of ${limit} reached for plan "${plan}"`);
        this.name = 'VersionLimitError';
        this.code = 'version_limit_reached';
        this.statusCode = 403;
        this.plan = plan;
        this.limit = limit;
        this.current = current;
    }
}

/**
 * GAP-03: project exists but is owned by a different user.
 * Also used by createVersionTransactional (GAP-01) when the FOR UPDATE
 * lock reveals an owner_id mismatch inside the transaction.
 */
export class ProjectConflictError extends Error {
    constructor(projectId, detail) {
        super(detail ?? `Project conflict: ${projectId}`);
        this.name = 'ProjectConflictError';
        this.code = 'project_conflict';
        this.statusCode = 409;
        this.projectId = projectId;
    }
}

export class SnapshotInvalidError extends Error {
    constructor(issues) {
        super('Invalid snapshot payload');
        this.name = 'SnapshotInvalidError';
        this.code = 'snapshot_invalid';
        this.statusCode = 400;
        this.issues = issues;
    }
}

/**
 * GAP-06: Optimistic locking failure — the caller's expected version count
 * does not match the current version_count on the server.
 * Thrown when `If-Match: "vN"` is present but N ≠ current version_count.
 * HTTP 412 Precondition Failed.
 *
 * Client interpretation: another save has already been committed since you
 * last read this project — reload the project list and retry.
 */
export class PreconditionFailedError extends Error {
    constructor(expected, actual) {
        super(`Version precondition failed: expected version count ${expected}, got ${actual}`);
        this.name = 'PreconditionFailedError';
        this.code = 'precondition_failed';
        this.statusCode = 412;
        this.expected = expected;
        this.actual = actual;
    }
}

// ---------------------------------------------------------------------------
// Central error handler
// ---------------------------------------------------------------------------

/**
 * Map a typed ProjectError (or any unexpected Error) to an HTTP response.
 *
 * Typed errors → their declared statusCode + machine-readable JSON body.
 * Unknown errors → 500 with no internal detail leaked to the client.
 *
 * @param {Error}                          err  — caught error
 * @param {import('express').Response}     res  — Express response
 * @param {string}                         [ctx] — optional label for the server log
 */
export function handleProjectApiError(err, res, ctx = '') {
    const prefix = ctx ? `[${ctx}] ` : '';

    if (err && err.statusCode) {
        const body = { error: err.message, code: err.code };
        if (err.issues)              body.issues   = err.issues;
        if (err.sizeBytes != null)  { body.sizeBytes = err.sizeBytes; body.limit = err.limitBytes; }
        if (err.plan      != null)  { body.plan = err.plan; body.limit = err.limit; body.current = err.current; }
        if (err.expected  != null)  { body.expected = err.expected; body.actual = err.actual; }
        console.error(`${prefix}${err.name}: ${err.message}`);
        return res.status(err.statusCode).json(body);
    }

    // ── §VERSIONS-DB-ERROR-CLASSIFY (2026-06-27) ──────────────────────────────
    // Raw PostgreSQL / Supabase errors carry no `.statusCode`, so they previously
    // all collapsed into an opaque 500 that the client's ServerSyncQueue RETRIED
    // forever. Map the well-known SQL states to precise, log-rich responses so a
    // bad queued save resolves to a terminal 4xx (dropped by the queue) or a
    // clearly-retryable 503 — never a silent 500 loop.
    const code = err?.code ?? '';
    const msg  = err?.message ?? String(err);

    // 23503 foreign_key_violation — the version's project_id has no matching
    // projects row (the project was deleted; ON DELETE CASCADE removed it). This
    // is a stale autosave for a gone project → 410 so the queue DROPS it.
    if (code === '23503' || /foreign key|violates foreign key/i.test(msg)) {
        console.error(`${prefix}FK violation (project likely deleted) code=${code} detail=${err?.detail ?? ''} — returning 410`);
        return res.status(410).json({
            error: 'Project no longer exists — stale save dropped.',
            code: 'project_gone',
        });
    }
    // 23505 unique_violation — a duplicate idempotency_key / version id raced in.
    // The save effectively already exists; tell the client it succeeded-ish (409
    // is terminal for the queue, so it stops retrying without losing local data).
    if (code === '23505' || /duplicate key|unique constraint/i.test(msg)) {
        console.error(`${prefix}unique_violation code=${code} constraint=${err?.constraint ?? ''} — returning 409`);
        return res.status(409).json({
            error: 'A version with that id already exists.',
            code: 'version_duplicate',
        });
    }
    // Transient connection drops on the Supabase tx-pooler carry no statusCode and
    // are genuinely retryable — surface as 503 (the queue retries 5xx with backoff).
    if (code === '57P01' || code === '08006' || code === '08000' || code === '08003' ||
        code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE' ||
        /connection terminated|connection timeout|terminated unexpectedly|server closed the connection|socket hang up|connection error/i.test(msg)) {
        console.error(`${prefix}db connection dropped (transient) code=${code} — returning 503`);
        return res.status(503).json({
            error: 'Database connection interrupted — please retry.',
            code: 'db_connection_lost',
        });
    }

    // Genuinely unexpected error → 500, LOGGED with every diagnostic field
    // node-postgres exposes so the real cause is grep-able from one log line.
    console.error(`${prefix}Unhandled server error: ${msg}`, {
        code,
        detail:     err?.detail,
        hint:       err?.hint,
        table:      err?.table,
        column:     err?.column,
        constraint: err?.constraint,
        severity:   err?.severity,
        routine:    err?.routine,
    });
    if (err?.stack) console.error(err.stack);
    return res.status(500).json({ error: 'Internal server error', code: 'server_error' });
}
