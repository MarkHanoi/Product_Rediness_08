/**
 * thumbnailDurability.test.js — §FIX-THUMBNAIL-DURABILITY
 *
 * The server half of "project previews disappear after logout → login".
 *
 * `projects.thumbnail` is the DURABLE, per-user home for a preview — the only
 * copy that survives `signOut()` deleting the client's IndexedDB cache. Two
 * defects made that column unreliable in a way no caller could detect:
 *
 *   1. `updateProjectThumbnail` discarded the query result and the route
 *      answered `{ ok: true }` unconditionally. An UPDATE matching ZERO rows
 *      (wrong owner, project absent from this store) reported that the preview
 *      had been durably stored when nothing was written. "Write succeeded" and
 *      "write hit nothing" were the same value — the §CONTEXT-DATA-HONESTY
 *      failure this whole bug is an instance of.
 *   2. The 65 536-char ceiling lived only as a bare literal in server.js, so
 *      nothing on the capture side knew it existed and every over-budget
 *      preview 413'd into a client-side `console.warn`.
 *
 * Mirrors the harness style of projectStore-inmemory.test.ts (direct module
 * unit tests, no HTTP), stubbing pgClient so the row-count contract can be
 * exercised without a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const _here = dirname(fileURLToPath(import.meta.url));

const _query = vi.fn();
vi.mock('../pgClient.js', () => ({
    query: (...args) => _query(...args),
    withTransaction: vi.fn(),
    getPgPool: () => ({}),
}));

const { updateProjectThumbnail } = await import('../projectStore.js');

beforeEach(() => { _query.mockReset(); });

describe('§FIX-THUMBNAIL-DURABILITY — updateProjectThumbnail reports whether it stored anything', () => {
    it('returns true when the owner\'s row was updated', async () => {
        _query.mockResolvedValue({ rowCount: 1, rows: [] });
        await expect(updateProjectThumbnail('proj-1', 'user-1', 'data:image/webp;base64,AAA')).resolves.toBe(true);
    });

    it('returns FALSE when the UPDATE matched no row — the silent-loss case', async () => {
        // Pre-fix this was indistinguishable from success, so a preview that was
        // never persisted was reported to the client as durably stored.
        _query.mockResolvedValue({ rowCount: 0, rows: [] });
        await expect(updateProjectThumbnail('proj-1', 'wrong-owner', 'data:image/webp;base64,AAA')).resolves.toBe(false);
    });

    it('scopes the write to BOTH the project id and the owner (C08 §2.1)', async () => {
        _query.mockResolvedValue({ rowCount: 1, rows: [] });
        await updateProjectThumbnail('proj-9', 'user-9', 'data:image/webp;base64,AAA');
        const [sql, params] = _query.mock.calls[0];
        expect(sql).toMatch(/UPDATE\s+projects\s+SET\s+thumbnail/i);
        expect(sql).toMatch(/WHERE\s+id\s*=\s*\$2\s+AND\s+owner_id\s*=\s*\$3/i);
        expect(params).toEqual(['data:image/webp;base64,AAA', 'proj-9', 'user-9']);
    });

    it('treats a driver result without rowCount as "nothing stored", never as success', async () => {
        // Fail CLOSED: an unknown outcome must not be reported as durable.
        _query.mockResolvedValue(undefined);
        await expect(updateProjectThumbnail('proj-1', 'user-1', 'data:image/webp;base64,AAA')).resolves.toBe(false);
    });
});

describe('§FIX-THUMBNAIL-DURABILITY — the payload ceiling is a named, shared constant', () => {
    const serverSrc = readFileSync(resolve(_here, '../../server.js'), 'utf8');

    it('server.js declares THUMBNAIL_MAX_CHARS instead of a bare literal', () => {
        expect(serverSrc).toMatch(/const THUMBNAIL_MAX_CHARS = 65536;/);
    });

    it('the thumbnail route enforces the constant, not a magic number', () => {
        expect(serverSrc).toMatch(/thumbnail\.length > THUMBNAIL_MAX_CHARS/);
    });

    it('the client mirrors the same value', () => {
        const clientSrc = readFileSync(
            resolve(_here, '../../packages/core-app-model/src/preview/thumbnailBudget.ts'), 'utf8',
        );
        const m = clientSrc.match(/export const THUMBNAIL_MAX_CHARS = ([\d_]+);/);
        expect(m).not.toBeNull();
        expect(Number(m[1].replace(/_/g, ''))).toBe(65536);
    });

    it('a 0-row write is answered as not-found rather than ok:true', () => {
        // Both DB paths must surface the miss. Pinned at the source level because
        // the route is only reachable through the full Express app.
        expect(serverSrc).toMatch(/matched 0 rows for project/);
        const route = serverSrc.slice(serverSrc.indexOf("app.patch('/api/projects/:id/thumbnail'"));
        const body = route.slice(0, route.indexOf('\n});'));
        // No unqualified success response survives in the route.
        expect(body).not.toMatch(/return res\.json\(\{ ok: true \}\);/);
    });
});
