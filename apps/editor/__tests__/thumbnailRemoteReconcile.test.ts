// @vitest-environment happy-dom
//
// §SUSTAIN109 (L-10405 / L-11548) — the THIRD server-side thumbnail state, and the
// two §FIX-THUMBNAIL-DURABILITY tiers that had to keep telling the truth around it.
//
// The list row used to carry the preview BYTES (`thumbnailUrl` = a `data:image/…`
// string) for every project — the payload PERF104 ranked the top remaining suspect
// for the founder's cold-network open. It now carries `hasThumbnail` + a per-project
// URL. `thumbnailReconcile.ts` must therefore distinguish:
//
//   inline bytes              → 'server'         (an older server; unchanged)
//   hasThumbnail + URL        → 'server-remote'  (NEW: fetch lazily, then seed)
//   bare URL, no such claim   → 'absent (server-value-unusable)'  (unchanged — a
//                               value the client cannot verify is not trusted on
//                               its shape; `thumbnailDurability.test.ts:222` pins it)
//
// ⚠ THE TRAP THIS FILE EXISTS TO PIN. Without the new arm, every row with a local
// cache and a remote URL would have read as `!serverOk` → `backfillToServer: true`
// → fifty re-PATCHes of previews the server already holds, on every hub mount —
// the L-11543 storm rebuilt by a payload fix. And every row WITHOUT a local cache
// (the post-sign-out case) would have read `absent`, silently re-opening the very
// bug §FIX-THUMBNAIL-DURABILITY closed.

import { describe, it, expect } from 'vitest';
import {
    resolveProjectThumbnail,
    planThumbnailReconcile,
    describeThumbnailResolution,
    type ThumbnailSyncRow,
} from '../src/ui/platform/thumbnailReconcile';
import { rowToSummary } from '@pryzm/persistence-client';

const PREVIEW = `data:image/webp;base64,${'A'.repeat(4000)}`;
const URL = '/api/v1/projects/proj-1/thumbnail';

class FakeThumbnailCache {
    private readonly bytes = new Map<string, string>();
    put(id: string, dataUrl: string): void { this.bytes.set(id, dataUrl); }
    purge(): void { this.bytes.clear(); }
    probe = (id: string): { value?: string; failed: boolean } => {
        const value = this.bytes.get(id);
        return value ? { value, failed: false } : { failed: false };
    };
}

describe('§SUSTAIN109 — the server-remote arm', () => {
    it('⭐ local cache present + server holds bytes remotely → paint local, NO back-fill, NO fetch', () => {
        const r = resolveProjectThumbnail({
            projectId: 'proj-1', localThumbnail: PREVIEW, serverThumbnail: URL, serverHoldsThumbnail: true,
        });
        expect(r.source).toBe('local-cache');
        expect(r.value).toBe(PREVIEW);
        expect(r.backfillToServer).toBe(false);      // ⛔ the storm, prevented
        expect(r.fetchFromServer).toBe(false);
    });

    it('⭐ cache purged (sign-out) + server holds bytes remotely → fetch, then seed', () => {
        const cache = new FakeThumbnailCache();
        cache.put('proj-1', PREVIEW);
        const rows: ThumbnailSyncRow[] = [{ id: 'proj-1', thumbnailUrl: URL, hasThumbnail: true }];

        const before = planThumbnailReconcile(rows, cache.probe)[0]!;
        expect(before.source).toBe('local-cache');

        cache.purge();                                   // what signOut() does to IndexedDB
        const after = planThumbnailReconcile(rows, cache.probe)[0]!;
        expect(after.source).toBe('server-remote');
        expect(after.fetchFromServer).toBe(true);
        expect(after.serverUrl).toBe(URL);
        expect(after.value).toBeUndefined();             // nothing paints from the list itself
        expect(after.seedLocalCache).toBe(false);        // the fetch seeds; the plan does not
        expect(after.backfillToServer).toBe(false);
        expect(describeThumbnailResolution(after)).toBe('server-remote +fetch->local-cache');
    });

    it('a bare URL WITHOUT the server\'s claim stays unusable — shape alone proves nothing', () => {
        const r = resolveProjectThumbnail({ projectId: 'c', serverThumbnail: 'https://cdn/not-a-data-url.webp' });
        expect(r.source).toBe('absent');
        expect(r.reason).toBe('server-value-unusable');
        expect(r.fetchFromServer).toBe(false);
    });

    it('the claim WITHOUT a URL is a projection defect, not "never captured"', () => {
        const r = resolveProjectThumbnail({ projectId: 'd', serverThumbnail: null, serverHoldsThumbnail: true });
        expect(r.source).toBe('absent');
        expect(r.reason).toBe('server-value-unusable');
    });

    it('an OLDER server that still inlines bytes is unchanged: source "server", seed the cache', () => {
        const r = resolveProjectThumbnail({ projectId: 'e', serverThumbnail: PREVIEW, serverHoldsThumbnail: true });
        expect(r.source).toBe('server');
        expect(r.seedLocalCache).toBe(true);
        expect(r.fetchFromServer).toBe(false);
    });

    it('a genuinely preview-less project (has_thumbnail: false, no URL) is still "never-captured"', () => {
        const r = resolveProjectThumbnail({ projectId: 'f', serverThumbnail: null, serverHoldsThumbnail: false });
        expect(r.source).toBe('absent');
        expect(r.reason).toBe('never-captured');
    });
});

describe('§SUSTAIN109 — rowToSummary forwards has_thumbnail with three states intact', () => {
    it('true / false are forwarded; absent stays absent', () => {
        const base = { id: 'proj-1', name: 'P', owner_id: 'u', updated_at: '2026-08-26T00:00:00Z' };
        expect(rowToSummary({ ...base, has_thumbnail: true, thumbnail_url: URL })).toMatchObject({ hasThumbnail: true, thumbnailUrl: URL });
        expect(rowToSummary({ ...base, has_thumbnail: false, thumbnail_url: null })).toMatchObject({ hasThumbnail: false, thumbnailUrl: null });
        // An older server: no flag, bytes inline — `hasThumbnail` must not be invented.
        const legacy = rowToSummary({ ...base, thumbnail: PREVIEW });
        expect(legacy.thumbnailUrl).toBe(PREVIEW);
        expect('hasThumbnail' in legacy).toBe(false);
    });
});
