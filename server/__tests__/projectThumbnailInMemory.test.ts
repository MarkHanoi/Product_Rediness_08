/**
 * server/__tests__/projectThumbnailInMemory.test.ts — §SUSTAIN109 (L-10405 / L-11548)
 *
 * ⭐ THE PAYLOAD MEASUREMENT AT THE FOUNDER'S SCALE — 50 projects, each holding a
 * preview near the server ceiling — through the REAL no-pool `listProjects` path
 * (the `projectStore-inmemory.test.ts` harness: no DATABASE_URL in the test env, so
 * `_inMemoryProjects` is the declared backend). The "before" figure is the exact
 * wire shape the list used to send: the same rows with `thumbnail` inline.
 *
 * Also pins the two in-memory fixes that came with the projection:
 *   • `imSetProjectThumbnail` — `server.js`'s no-DB PATCH used to write onto the v0
 *     COPY `imGetProject` returns, so an in-memory preview was never stored;
 *   • `getProjectThumbnail` (no pool) — owner-only, like `getProject`'s branch.
 */

import { describe, it, expect } from 'vitest';
import {
    createProject,
    listProjects,
    getProjectThumbnail,
    imSetProjectThumbnail,
} from '../projectStore.js';
import { projectThumbnailUrl } from '../projectThumbnail.js';

let _seq = 0;
const uid = (p: string) => `${p}-${Date.now()}-${(_seq++).toString(36)}`;

/** A preview a little under the 65 536-char server ceiling, like a real WebP capture. */
const THUMB = `data:image/webp;base64,${'QUJD'.repeat(15_000)}`;   // 60 023 chars

describe('§SUSTAIN109 — the in-memory list at 50 projects: bytes leave the response', () => {
    it('⭐ MEASURED: 50 previews inline vs metadata-only', async () => {
        const owner = uid('user');
        const ids: string[] = [];
        for (let i = 0; i < 50; i++) {
            const row = await createProject(`Project ${i}`, owner);
            ids.push(row.id);
            expect(imSetProjectThumbnail(row.id, owner, THUMB)).toBe(true);
        }

        const rows = await listProjects(owner, { limit: 50 }) as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(50);
        expect(rows.every(r => !('thumbnail' in r))).toBe(true);
        expect(rows.every(r => r.has_thumbnail === true)).toBe(true);
        expect(rows.every(r => r.thumbnail_url === projectThumbnailUrl(r.id as string))).toBe(true);

        const after = JSON.stringify(rows).length;
        // The OLD wire shape: the same rows with the bytes inline (what
        // `SELECT … p.thumbnail …` shipped for every row of every page).
        const before = JSON.stringify(rows.map(r => ({ ...r, thumbnail: THUMB }))).length;

        console.log(
            `[test] §SUSTAIN109 GET /api/v1/projects at 50 projects × ${THUMB.length}-char previews: ` +
            `${(before / 1024 / 1024).toFixed(2)} MB inline → ${(after / 1024).toFixed(1)} KB metadata ` +
            `(${(before / after).toFixed(0)}× smaller).`,
        );
        expect(after).toBeLessThan(50 * 1024);          // a list is KILOBYTES now
        expect(after).toBeLessThan(before / 100);       // and two orders of magnitude under the old one
    });

    it('imSetProjectThumbnail stores through the map (owner-only) and getProjectThumbnail reads it back', async () => {
        const owner = uid('user');
        const other = uid('user');
        const row = await createProject('P', owner);

        expect(imSetProjectThumbnail(row.id, other, THUMB)).toBe(false);   // write scope: OWNER only
        expect(await getProjectThumbnail(row.id, owner)).toEqual({ thumbnail: null });

        expect(imSetProjectThumbnail(row.id, owner, THUMB)).toBe(true);
        expect(await getProjectThumbnail(row.id, owner)).toEqual({ thumbnail: THUMB });
        expect(await getProjectThumbnail(row.id, other)).toBeNull();        // read scope (no pool): owner only
        expect(await getProjectThumbnail(uid('proj'), owner)).toBeNull();
    });

    it('listing never deletes the preview from the store itself (the rows are copies)', async () => {
        const owner = uid('user');
        const row = await createProject('P', owner);
        imSetProjectThumbnail(row.id, owner, THUMB);
        await listProjects(owner);
        await listProjects(owner);
        expect(await getProjectThumbnail(row.id, owner)).toEqual({ thumbnail: THUMB });
    });
});
