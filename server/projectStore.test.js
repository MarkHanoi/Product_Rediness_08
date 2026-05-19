/**
 * server/projectStore.test.js
 * GAP-16 fix — Automated unit tests for the project storage layer.
 *
 * Run: node --test server/projectStore.test.js
 *
 * Contract: C05 §1.3 (project isolation) · C08 §4 (server as authoritative gate)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_SRC = await readFile(join(__dirname, 'projectStore.js'), 'utf8');

// ── Import modules under test ─────────────────────────────────────────────────

const {
    isValidProjectId,
    isValidVersionId,
    listVersions,
    createVersionTransactional,
    deleteProject,
    touchProject,
} = await import('./projectStore.js').catch((err) => {
    console.error('[projectStore.test] Import failed:', err.message);
    process.exit(1);
});

const {
    ProjectNotFoundError,
    ProjectAccessDeniedError,
    SnapshotTooLargeError,
    VersionLimitError,
    ProjectConflictError,
    SnapshotInvalidError,
    handleProjectApiError,
} = await import('./errors.js');

// ── 1. ID generation — entropy and allowlist validation (GAP-04) ──────────────

describe('ID generation — entropy and validation (GAP-04)', () => {

    test('isValidProjectId accepts a freshly-generated proj- hex ID', () => {
        const id = `proj-${Date.now()}-${randomBytes(6).toString('hex')}`;
        assert.ok(isValidProjectId(id), `Expected valid, got: ${id}`);
    });

    test('isValidProjectId accepts a legacy base-36 ID (backward compat)', () => {
        assert.ok(isValidProjectId('proj-1746000000000-a3f9z'));
        assert.ok(isValidProjectId('proj-1746000000000-ab12cd3'));
    });

    test('isValidProjectId rejects missing prefix', () => {
        assert.equal(isValidProjectId('1746000000000-abc123'), false);
    });

    test('isValidProjectId rejects path-traversal attempt', () => {
        assert.equal(isValidProjectId('proj-1746000000000-../../etc'), false);
    });

    test('isValidProjectId rejects uppercase chars', () => {
        assert.equal(isValidProjectId('proj-1746000000000-ABC123'), false);
    });

    test('isValidProjectId rejects empty string', () => {
        assert.equal(isValidProjectId(''), false);
    });

    test('isValidProjectId rejects null / undefined / number', () => {
        assert.equal(isValidProjectId(null), false);
        assert.equal(isValidProjectId(undefined), false);
        assert.equal(isValidProjectId(42), false);
    });

    test('isValidVersionId accepts a freshly-generated ver- hex ID', () => {
        const id = `ver-${Date.now()}-${randomBytes(6).toString('hex')}`;
        assert.ok(isValidVersionId(id), `Expected valid, got: ${id}`);
    });

    test('isValidVersionId rejects a proj- prefix', () => {
        assert.equal(isValidVersionId('proj-1746000000000-abc123def456'), false);
    });

    test('generated IDs are unique across 1000 calls', () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
            ids.add(`proj-${Date.now()}-${randomBytes(6).toString('hex')}`);
        }
        assert.equal(ids.size, 1000);
    });

    test('generateId function body uses randomBytes not Math.random', () => {
        // Narrow to the generateId function body only — the JSDoc comment legitimately
        // references "Math.random()" as context for the fix; only the body matters.
        const fnStart = STORE_SRC.indexOf('function generateId(prefix)');
        const fnEnd   = STORE_SRC.indexOf('\n}', fnStart) + 2;
        const fnBody  = STORE_SRC.slice(fnStart, fnEnd);
        assert.ok(fnBody.includes("randomBytes(6).toString('hex')"),
            'generateId must call randomBytes (GAP-04)');
        assert.ok(!fnBody.includes('Math.random()'),
            'generateId body must not call Math.random() (GAP-04)');
    });
});

// ── 2. touchProject SQL shape (GAP-08) ───────────────────────────────────────

describe('touchProject — atomic increment, not re-count (GAP-08)', () => {

    test('touchProject function is exported', () => {
        assert.equal(typeof touchProject, 'function');
    });

    test('touchProject source uses "version_count = version_count + 1" (atomic)', () => {
        assert.ok(
            STORE_SRC.includes('version_count = version_count + 1'),
            'Must use atomic increment SQL (GAP-08 regression guard)'
        );
    });

    test('touchProject block does NOT use SELECT COUNT(*) subquery', () => {
        const start = STORE_SRC.indexOf('export async function touchProject');
        const end   = STORE_SRC.indexOf('export async function renameProject');
        const fnBlock = STORE_SRC.slice(start, end);
        assert.ok(
            !fnBlock.includes('SELECT COUNT(*)'),
            'touchProject must not recount — that is non-atomic (GAP-08)'
        );
    });
});

// ── 3. listVersions userId guard (GAP-15) ────────────────────────────────────

describe('listVersions — userId required (GAP-15)', () => {

    test('listVersions function is exported', () => {
        assert.equal(typeof listVersions, 'function');
    });

    test('listVersions returns [] and logs when called without userId', async () => {
        const origError = console.error;
        let loggedMsg = '';
        console.error = (msg) => { loggedMsg = String(msg); };
        const result = await listVersions('proj-any', undefined);
        console.error = origError;
        assert.deepEqual(result, []);
        assert.ok(loggedMsg.includes('listVersions called without userId'),
            `Guard log missing; got: "${loggedMsg}"`);
    });

    test('listVersions source enforces userId check before any query', () => {
        const start = STORE_SRC.indexOf('export async function listVersions');
        const end   = STORE_SRC.indexOf('export async function listVersionsAdmin');
        const fnBlock = STORE_SRC.slice(start, end);
        assert.ok(fnBlock.includes('if (!userId)'), 'GAP-15: userId guard must be first check');
        assert.ok(fnBlock.includes('return [];'),   'GAP-15: must return [] on missing userId');
    });
});

// ── 4. createVersionTransactional — structure (GAP-01) ───────────────────────

describe('createVersionTransactional — transaction structure (GAP-01)', () => {

    test('createVersionTransactional function is exported', () => {
        assert.equal(typeof createVersionTransactional, 'function');
    });

    test('createVersionTransactional source uses FOR UPDATE lock', () => {
        const start   = STORE_SRC.indexOf('export async function createVersionTransactional');
        const fnBlock = STORE_SRC.slice(start);
        assert.ok(fnBlock.includes('FOR UPDATE'),
            'createVersionTransactional must acquire FOR UPDATE lock (GAP-01)');
        assert.ok(fnBlock.includes('withTransaction'),
            'createVersionTransactional must use withTransaction (GAP-01)');
        assert.ok(fnBlock.includes('ON CONFLICT (id) DO NOTHING'),
            'createVersionTransactional must be idempotent (GAP-01)');
        assert.ok(fnBlock.includes('owner_id'),
            'createVersionTransactional must check ownership (GAP-03)');
    });
});

// ── 5. deleteProject — cascade-only delete (GAP-14) ─────────────────────────

describe('deleteProject — cascade-only delete (GAP-14)', () => {

    test('deleteProject function is exported', () => {
        assert.equal(typeof deleteProject, 'function');
    });

    test('deleteProject source does NOT manually delete project_versions', () => {
        const start   = STORE_SRC.indexOf('export async function deleteProject');
        const end     = STORE_SRC.indexOf('export async function getProjectStatus');
        const fnBlock = STORE_SRC.slice(start, end);
        assert.ok(
            !fnBlock.includes('DELETE FROM project_versions'),
            'GAP-14: deleteProject must not manually delete project_versions — rely on CASCADE'
        );
        assert.ok(fnBlock.includes('DELETE FROM projects'),
            'deleteProject must delete from projects table');
        assert.ok(fnBlock.includes('owner_id'),
            'deleteProject must enforce ownership in the WHERE clause');
    });
});

// ── 6. Error classes — shape + HTTP code (GAP-07) ────────────────────────────

describe('Error classes — shape and statusCode (GAP-07)', () => {

    test('ProjectNotFoundError — shape', () => {
        const e = new ProjectNotFoundError('proj-abc');
        assert.ok(e instanceof Error);
        assert.equal(e.statusCode, 404);
        assert.equal(e.code, 'project_not_found');
        assert.equal(e.projectId, 'proj-abc');
        assert.ok(e.message.includes('proj-abc'));
    });

    test('ProjectAccessDeniedError — shape', () => {
        const e = new ProjectAccessDeniedError('proj-xyz');
        assert.ok(e instanceof Error);
        assert.equal(e.statusCode, 403);
        assert.equal(e.code, 'project_access_denied');
    });

    test('SnapshotTooLargeError — shape', () => {
        const e = new SnapshotTooLargeError(55_000_000, 52_428_800);
        assert.ok(e instanceof Error);
        assert.equal(e.statusCode, 413);
        assert.equal(e.code, 'snapshot_too_large');
        assert.equal(e.sizeBytes, 55_000_000);
        assert.equal(e.limitBytes, 52_428_800);
        assert.ok(e.message.includes('55000000'));
    });

    test('VersionLimitError — shape', () => {
        const e = new VersionLimitError('architect', 15, 15);
        assert.ok(e instanceof Error);
        assert.equal(e.statusCode, 403);
        assert.equal(e.code, 'version_limit_reached');
        assert.equal(e.plan, 'architect');
        assert.equal(e.limit, 15);
        assert.equal(e.current, 15);
    });

    test('ProjectConflictError — shape', () => {
        const e = new ProjectConflictError('proj-123', 'different owner');
        assert.ok(e instanceof Error);
        assert.equal(e.statusCode, 409);
        assert.equal(e.code, 'project_conflict');
        assert.equal(e.projectId, 'proj-123');
        assert.ok(e.message.includes('different owner'));
    });

    test('SnapshotInvalidError — shape', () => {
        const issues = [{ path: ['name'], message: 'Required' }];
        const e = new SnapshotInvalidError(issues);
        assert.ok(e instanceof Error);
        assert.equal(e.statusCode, 400);
        assert.equal(e.code, 'snapshot_invalid');
        assert.deepEqual(e.issues, issues);
    });
});

// ── 7. handleProjectApiError — HTTP mapping (GAP-07) ─────────────────────────

describe('handleProjectApiError — maps typed errors to HTTP responses (GAP-07)', () => {

    function mockRes() {
        const r = { _status: null, _body: null };
        r.status = (s) => { r._status = s; return r; };
        r.json   = (b) => { r._body  = b; return r; };
        return r;
    }

    test('maps ProjectNotFoundError → 404', () => {
        const res = mockRes();
        handleProjectApiError(new ProjectNotFoundError('proj-x'), res, 'test');
        assert.equal(res._status, 404);
        assert.equal(res._body.code, 'project_not_found');
    });

    test('maps ProjectAccessDeniedError → 403', () => {
        const res = mockRes();
        handleProjectApiError(new ProjectAccessDeniedError('proj-x'), res, 'test');
        assert.equal(res._status, 403);
        assert.equal(res._body.code, 'project_access_denied');
    });

    test('maps SnapshotTooLargeError → 413 with sizeBytes + limit', () => {
        const res = mockRes();
        handleProjectApiError(new SnapshotTooLargeError(60e6, 50e6), res, 'test');
        assert.equal(res._status, 413);
        assert.equal(res._body.code, 'snapshot_too_large');
        assert.equal(res._body.sizeBytes, 60e6);
        assert.equal(res._body.limit, 50e6);
    });

    test('maps VersionLimitError → 403 with plan + limit + current', () => {
        const res = mockRes();
        handleProjectApiError(new VersionLimitError('architect', 15, 15), res, 'test');
        assert.equal(res._status, 403);
        assert.equal(res._body.code, 'version_limit_reached');
        assert.equal(res._body.plan, 'architect');
        assert.equal(res._body.limit, 15);
        assert.equal(res._body.current, 15);
    });

    test('maps ProjectConflictError → 409', () => {
        const res = mockRes();
        handleProjectApiError(new ProjectConflictError('proj-x', 'owner mismatch'), res, 'test');
        assert.equal(res._status, 409);
        assert.equal(res._body.code, 'project_conflict');
    });

    test('maps SnapshotInvalidError → 400 with issues array', () => {
        const res = mockRes();
        handleProjectApiError(new SnapshotInvalidError([{ field: 'name' }]), res, 'test');
        assert.equal(res._status, 400);
        assert.equal(res._body.code, 'snapshot_invalid');
        assert.ok(Array.isArray(res._body.issues));
    });

    test('maps unknown Error → 500, does not leak internal message to client', () => {
        const res = mockRes();
        handleProjectApiError(new Error('internal pg connection string'), res, 'test');
        assert.equal(res._status, 500);
        assert.equal(res._body.code, 'server_error');
        assert.ok(!JSON.stringify(res._body).includes('internal pg connection string'),
            'Internal error detail must not leak to client response');
    });
});
