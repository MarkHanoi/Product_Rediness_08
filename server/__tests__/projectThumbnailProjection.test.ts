/**
 * server/__tests__/projectThumbnailProjection.test.ts — §SUSTAIN109 (L-10405 / L-11548)
 *
 * THE PROJECT LIST NO LONGER SHIPS THUMBNAIL BYTES.
 *
 * `GET /api/v1/projects` selected `p.thumbnail` inline — a base64 image of up to
 * 65 536 chars (`THUMBNAIL_MAX_CHARS`) — for every row of a 50-row page, so the hub
 * downloaded up to fifty previews in one JSON body on every mount. Lane DURABLE25
 * named it (L-10405); PERF104 ranked it the top remaining suspect for the founder's
 * 44 s cold-network open (L-11548). The list now projects `has_thumbnail` +
 * `thumbnail_url`; `GET /api/v1/projects/:id/thumbnail` serves the bytes of ONE
 * project with an ETag.
 *
 * Harness: pgClient stubbed (the SQL-shape style of
 * `projectStore-membership-reads.test.ts`); the pure helpers are exercised directly;
 * the route is pinned at the source level, the way `thumbnailDurability.test.ts`
 * pins the PATCH route, because it is only reachable through the full Express app.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const _here = dirname(fileURLToPath(import.meta.url));

const mockQuery = vi.fn();
vi.mock('../pgClient.js', () => ({
    getPgPool: () => ({}),
    query: (...args: unknown[]) => mockQuery(...args),
    withTransaction: vi.fn(),
}));

import {
    projectThumbnailUrl,
    withThumbnailMetadata,
    decodeThumbnailDataUrl,
    isUsableStoredThumbnail,
} from '../projectThumbnail.js';

let store: typeof import('../projectStore.js');

const USER = 'user-caller';
const PROJECT = 'proj-1786000000000-aaaaaa';
const MEMBERSHIP_PREDICATE = /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+project_members/i;

// 1×1 transparent WebP-ish payload is not needed — the decoder is format-agnostic
// beyond the `image/` prefix; a real base64 body is what matters.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const DATA_URL = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;

beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    store = await import('../projectStore.js');
});

function sqlOf(n = 0): string { return String(mockQuery.mock.calls[n]?.[0] ?? ''); }

describe('§SUSTAIN109 — the pure projection helpers', () => {
    it('projectThumbnailUrl spells the ONE route, id-encoded', () => {
        expect(projectThumbnailUrl(PROJECT)).toBe(`/api/v1/projects/${PROJECT}/thumbnail`);
        expect(projectThumbnailUrl('a b/c')).toBe('/api/v1/projects/a%20b%2Fc/thumbnail');
    });

    it('withThumbnailMetadata strips the BYTES and states the fact', () => {
        const row: Record<string, unknown> = { id: PROJECT, name: 'x', thumbnail: DATA_URL };
        const out = withThumbnailMetadata(row);
        expect(out).toBe(row);                                   // same object, like the labeller
        expect('thumbnail' in out).toBe(false);
        expect(out.has_thumbnail).toBe(true);
        expect(out.thumbnail_url).toBe(projectThumbnailUrl(PROJECT));
    });

    it('withThumbnailMetadata answers FALSE — never undefined — for a row with no preview', () => {
        for (const thumbnail of [null, undefined, '', 'not-a-data-url']) {
            const out = withThumbnailMetadata({ id: PROJECT, thumbnail });
            expect(out.has_thumbnail).toBe(false);
            expect(out.thumbnail_url).toBeNull();
            expect('thumbnail' in out).toBe(false);
        }
    });

    it('withThumbnailMetadata accepts a row the SQL already projected as has_thumbnail', () => {
        const out = withThumbnailMetadata({ id: PROJECT, has_thumbnail: true });
        expect(out.thumbnail_url).toBe(projectThumbnailUrl(PROJECT));
    });

    it('decodeThumbnailDataUrl round-trips bytes, content type and a length-suffixed ETag', () => {
        const img = decodeThumbnailDataUrl(DATA_URL)!;
        expect(img).not.toBeNull();
        expect(img.contentType).toBe('image/png');
        expect(Buffer.compare(img.bytes, PNG_BYTES)).toBe(0);
        expect(img.etag).toMatch(/^[0-9a-f]{8}-[0-9a-f]+$/);
        // Deterministic, and sensitive to the stored string.
        expect(decodeThumbnailDataUrl(DATA_URL)!.etag).toBe(img.etag);
        expect(decodeThumbnailDataUrl(DATA_URL + 'A')!.etag).not.toBe(img.etag);
    });

    it('decodeThumbnailDataUrl refuses anything that is not a base64 image data URL', () => {
        for (const bad of [null, '', 'https://cdn/x.webp', 'data:text/plain;base64,QUJD', 'data:image/png,ABC', 'data:image/png;base64,']) {
            expect(decodeThumbnailDataUrl(bad)).toBeNull();
        }
        expect(isUsableStoredThumbnail('data:image/webp;base64,AAAA')).toBe(true);
        expect(isUsableStoredThumbnail('data:text/plain;base64,AAAA')).toBe(false);
    });
});

describe('§SUSTAIN109 — listProjects projects METADATA, not bytes', () => {
    it('the list SQL no longer selects p.thumbnail and projects has_thumbnail instead', async () => {
        await store.listProjects(USER);
        const sql = sqlOf();
        expect(sql).not.toMatch(/\bp\.thumbnail\s*,/);          // the old inline column
        expect(sql).toMatch(/\(p\.thumbnail IS NOT NULL AND p\.thumbnail <> ''\)\s+AS has_thumbnail/i);
        expect(sql).toMatch(MEMBERSHIP_PREDICATE);               // the read scope is untouched
    });

    it('rows come back with thumbnail_url and without thumbnail', async () => {
        mockQuery.mockResolvedValue({
            rows: [
                { id: PROJECT, name: 'A', owner_id: USER, has_thumbnail: true, updated_at: '2026-08-26T00:00:00Z' },
                { id: 'proj-1786000000000-bbbbbb', name: 'B', owner_id: USER, has_thumbnail: false, updated_at: '2026-08-26T00:00:00Z' },
            ],
            rowCount: 2,
        });
        const rows = await store.listProjects(USER) as Array<Record<string, unknown>>;
        expect(rows[0]!.thumbnail_url).toBe(projectThumbnailUrl(PROJECT));
        expect(rows[0]!.has_thumbnail).toBe(true);
        expect(rows[1]!.thumbnail_url).toBeNull();
        expect(rows[1]!.has_thumbnail).toBe(false);
        expect(rows.every(r => !('thumbnail' in r))).toBe(true);
    });

    it('getProjectThumbnail is a READ: it admits members and selects only the column', async () => {
        mockQuery.mockResolvedValue({ rows: [{ thumbnail: DATA_URL }], rowCount: 1 });
        const out = await store.getProjectThumbnail(PROJECT, USER);
        expect(out).toEqual({ thumbnail: DATA_URL });
        expect(sqlOf()).toMatch(MEMBERSHIP_PREDICATE);
        expect(sqlOf()).toMatch(/SELECT\s+p\.thumbnail\s+FROM\s+projects/i);
        expect(mockQuery.mock.calls[0]![1]).toEqual([PROJECT, USER]);
    });

    it('getProjectThumbnail refuses without a userId and answers null for an invisible project', async () => {
        expect(await store.getProjectThumbnail(PROJECT, undefined)).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        expect(await store.getProjectThumbnail(PROJECT, USER)).toBeNull();
    });
});

describe('§SUSTAIN109 — the route, pinned at the source (reachable only through the Express app)', () => {
    const routesSrc = readFileSync(resolve(_here, '../api/v1/routes.js'), 'utf8');
    const serverSrc = readFileSync(resolve(_here, '../../server.js'), 'utf8');

    it('GET /projects/:id/thumbnail exists, validates the id, and serves bytes with an ETag + 304', () => {
        const at = routesSrc.indexOf("v1Router.get('/projects/:id/thumbnail'");
        expect(at).toBeGreaterThan(-1);
        const body = routesSrc.slice(at, routesSrc.indexOf('\n});', at));
        expect(body).toMatch(/isValidProjectId\(id\)/);
        expect(body).toMatch(/getProjectThumbnail\(id, userId\)/);
        expect(body).toMatch(/decodeThumbnailDataUrl\(row\.thumbnail\)/);
        expect(body).toMatch(/'Cache-Control', 'private, max-age=86400'/);
        expect(body).toMatch(/'ETag', etag/);
        expect(body).toMatch(/if-none-match.*\n?.*304/);
        expect(body).toMatch(/res\.status\(200\)\.end\(img\.bytes\)/);
        // Both "not yours" and "no preview" are 404 — a caller learns nothing about existence.
        expect(body).toMatch(/project_not_found/);
        expect(body).toMatch(/no_thumbnail/);
    });

    it('the legacy GET /api/projects strips Supabase rows to metadata before responding', () => {
        const at = serverSrc.indexOf("app.get('/api/projects', authMiddleware");
        const body = serverSrc.slice(at, serverSrc.indexOf('\n});', at));
        expect(body).toMatch(/\(data \?\? \[\]\)\.map\(withThumbnailMetadata\)/);
    });

    it('the in-memory PATCH leg writes through the store, not onto the v0 copy', () => {
        const at = serverSrc.indexOf("app.patch('/api/projects/:id/thumbnail'");
        const body = serverSrc.slice(at, serverSrc.indexOf('\n});', at));
        expect(body).toMatch(/imSetProjectThumbnail\(id, userId, thumbnail\)/);
        // The CODE line, not the comment that names the old defect: a statement at
        // the start of a line, terminated.
        expect(body).not.toMatch(/^\s*proj\.thumbnail = thumbnail;/m);
    });
});
