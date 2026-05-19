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

    const msg = err?.message ?? String(err);
    console.error(`${prefix}Unhandled server error: ${msg}`);
    if (err?.stack) console.error(err.stack);
    return res.status(500).json({ error: 'Internal server error', code: 'server_error' });
}
