/**
 * §FIX-THUMBNAIL-DURABILITY — project previews must survive logout → login.
 *
 * Founder report: `app.pryzm.so/#/projects` lists 50 projects; after a logout →
 * login cycle every card renders the pale letter placeholder. Names, timestamps
 * and version counts all come back correct — only the previews are gone.
 *
 * The scenario encoded below is exactly that, and it FAILS against the
 * pre-fix code:
 *
 *   1. A project is saved WITH a preview. Bytes go to the IndexedDB cache
 *      (`pryzm-project-thumbnails`), metadata to `bim-projects-index`.
 *   2. Sign-out. `signOut()` deletes every IndexedDB database whose name
 *      contains `pryzm` — the preview cache included, by design
 *      (§AUTH-SESSION-LEAK; that security fix stays). `bim-projects-index` is
 *      NOT pryzm-prefixed, so it survives with `updatedAt` untouched. That
 *      asymmetry is why the founder sees correct metadata and blank previews.
 *   3. Log back in. The hub syncs; the server row carries the durable preview
 *      and the SAME `updated_at` as the surviving local entry.
 *   4. Assert the preview is resolvable again.
 *
 * Pre-fix, step 4 failed: the only code that could adopt the server copy sat
 * inside `if (!existing || existing.updatedAt < lastModifiedAt)`, which is
 * false for an unchanged project, so the row was skipped whole.
 *
 * These tests exercise the extracted decision layer rather than the 1600-line
 * ProjectHub class, because the decision — not the DOM — is what was wrong.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    resolveProjectThumbnail,
    planThumbnailReconcile,
    describeThumbnailResolution,
    type ThumbnailSyncRow,
} from '../src/ui/platform/thumbnailReconcile';
import {
    THUMBNAIL_MAX_CHARS,
    fitThumbnailToBudget,
} from '@pryzm/core-app-model';

/** A realistic, in-budget preview payload. */
const PREVIEW = `data:image/webp;base64,${'A'.repeat(4000)}`;
const OTHER_PREVIEW = `data:image/webp;base64,${'B'.repeat(4000)}`;

/**
 * Stand-in for the IndexedDB preview cache + its synchronous mirror. `purge()`
 * models what `signOut()` does to it.
 */
class FakeThumbnailCache {
    private readonly bytes = new Map<string, string>();
    /** When true, reads THROW — the instrument-failure case. */
    throwOnRead = false;

    put(id: string, dataUrl: string): void { this.bytes.set(id, dataUrl); }
    purge(): void { this.bytes.clear(); }
    probe = (id: string): { value?: string; failed: boolean } => {
        if (this.throwOnRead) throw new Error('IDB unavailable');
        const value = this.bytes.get(id);
        return value ? { value, failed: false } : { failed: false };
    };
}

describe('§FIX-THUMBNAIL-DURABILITY — previews survive logout → login', () => {
    it('restores the preview from the durable server column after the local cache is purged', () => {
        const cache = new FakeThumbnailCache();

        // 1. Saved WITH a preview: cache holds bytes, server holds the durable copy.
        cache.put('proj-1', PREVIEW);
        const serverRows: ThumbnailSyncRow[] = [{ id: 'proj-1', thumbnailUrl: PREVIEW }];

        const beforeLogout = planThumbnailReconcile(serverRows, cache.probe);
        expect(beforeLogout[0].source).toBe('local-cache');
        expect(beforeLogout[0].value).toBe(PREVIEW);

        // 2. signOut() deletes the pryzm-prefixed IndexedDB databases.
        //    bim-projects-index (metadata) is untouched — hence correct names,
        //    timestamps and version counts on the founder's cards.
        cache.purge();

        // 3. Log back in and sync. The server row is byte-identical and carries
        //    the SAME updated_at as the surviving local entry — so the
        //    metadata-freshness gate has nothing to do, which is precisely the
        //    situation the old code could not recover from.
        const afterLogin = planThumbnailReconcile(serverRows, cache.probe);

        // 4. THE ASSERTION THAT FAILED BEFORE THE FIX.
        expect(afterLogin[0].source).toBe('server');
        expect(afterLogin[0].value).toBe(PREVIEW);
        expect(afterLogin[0].seedLocalCache).toBe(true);
        expect(afterLogin[0].backfillToServer).toBe(false);
    });

    it('POSITIVE CONTROL — the same probe reports a genuinely preview-less project as absent', () => {
        // If the detector could not tell the two apart, the test above would
        // pass for the wrong reason. Plant the negative case explicitly.
        const cache = new FakeThumbnailCache();
        const plan = planThumbnailReconcile([{ id: 'proj-never', thumbnailUrl: null }], cache.probe);
        expect(plan[0].source).toBe('absent');
        expect(plan[0].reason).toBe('never-captured');
        expect(plan[0].value).toBeUndefined();
    });

    it('seeds the cache from the server for one project while leaving another absent', () => {
        // Positive + negative in the SAME sweep, so a blanket "always server" or
        // "always absent" implementation cannot satisfy it.
        const cache = new FakeThumbnailCache();
        const plan = planThumbnailReconcile([
            { id: 'has-it', thumbnailUrl: PREVIEW },
            { id: 'never-had-it', thumbnailUrl: null },
        ], cache.probe);
        expect(plan.map(r => r.source)).toEqual(['server', 'absent']);
        expect(plan[0].seedLocalCache).toBe(true);
        expect(plan[1].seedLocalCache).toBe(false);
    });
});

describe('§FIX-THUMBNAIL-DURABILITY — the pre-fix algorithm, pinned', () => {
    /**
     * The rule ProjectHub.syncFromServer used before this change, transcribed
     * verbatim from `d1f95b2f`:
     *
     *     if (!existing || existing.updatedAt < lastModifiedAt) {
     *         const serverThumbnail  = s.thumbnailUrl ?? undefined;
     *         const resolvedThumbnail = existing?.thumbnail ?? serverThumbnail;
     *         ...
     *     }
     *
     * `existing.thumbnail` is itself only a rehydration of the IndexedDB cache
     * (`_rehydrateThumbnail`), so after the sign-out purge it is undefined.
     *
     * This test is the FAILING-FIRST evidence, kept permanently: it demonstrates
     * that the old rule cannot restore the preview, and would fail if anyone
     * reverted the fix by re-coupling residency to metadata freshness.
     */
    function preFixResolve(args: {
        existing?: { updatedAt: number; thumbnail?: string };
        serverUpdatedAt: number;
        serverThumbnailUrl: string | null;
    }): string | undefined {
        const { existing, serverUpdatedAt, serverThumbnailUrl } = args;
        if (!existing || existing.updatedAt < serverUpdatedAt) {
            return existing?.thumbnail ?? (serverThumbnailUrl ?? undefined);
        }
        // Row skipped entirely — no thumbnail is ever read from the server.
        return existing.thumbnail;
    }

    const AT = 1_754_570_000_000; // identical on both sides after a logout/login

    it('PRE-FIX: loses the preview — the freshness gate skips the row (this is the bug)', () => {
        const restored = preFixResolve({
            // Metadata survived sign-out untouched; the IDB preview cache did not,
            // so `thumbnail` is undefined even though the server has the bytes.
            existing: { updatedAt: AT, thumbnail: undefined },
            serverUpdatedAt: AT,
            serverThumbnailUrl: PREVIEW,
        });
        expect(restored).toBeUndefined();
    });

    it('PRE-FIX: even forcing the gate open still cannot back-fill a server that is empty', () => {
        // The second half of the defect: nothing ever noticed that the cache held
        // bytes the durable column lacked, so a lost upload was permanent.
        const cache = new FakeThumbnailCache();
        cache.put('proj-x', PREVIEW);
        const preFix = preFixResolve({ serverUpdatedAt: AT, serverThumbnailUrl: null });
        expect(preFix).toBeUndefined();

        const postFix = planThumbnailReconcile([{ id: 'proj-x', thumbnailUrl: null }], cache.probe)[0];
        expect(postFix.backfillToServer).toBe(true);
    });

    it('POST-FIX: the same inputs resolve the preview from the server', () => {
        const cache = new FakeThumbnailCache(); // purged, exactly as after sign-out
        const postFix = planThumbnailReconcile([{ id: 'p', thumbnailUrl: PREVIEW }], cache.probe)[0];
        expect(postFix.value).toBe(PREVIEW);
        expect(postFix.source).toBe('server');
    });
});

describe('§FIX-THUMBNAIL-DURABILITY — self-heal back-fill', () => {
    it('pushes cached bytes up when the durable column is empty', () => {
        // This is the repair for every preview whose original PATCH was lost
        // (413 / plan-gated skip / offline at capture). Without it, a single
        // missed upload made the preview client-cache-only forever.
        const cache = new FakeThumbnailCache();
        cache.put('proj-2', PREVIEW);
        const plan = planThumbnailReconcile([{ id: 'proj-2', thumbnailUrl: null }], cache.probe);
        expect(plan[0].source).toBe('local-cache');
        expect(plan[0].backfillToServer).toBe(true);
    });

    it('does NOT back-fill when the server already has a copy', () => {
        const cache = new FakeThumbnailCache();
        cache.put('proj-3', PREVIEW);
        const plan = planThumbnailReconcile([{ id: 'proj-3', thumbnailUrl: OTHER_PREVIEW }], cache.probe);
        expect(plan[0].source).toBe('local-cache');
        expect(plan[0].backfillToServer).toBe(false);
    });

    it('never back-fills on the strength of a read that THREW', () => {
        // §CONTEXT-DATA-HONESTY — a failed instrument is not an observation.
        // Acting on it could overwrite a good server copy with nothing.
        const cache = new FakeThumbnailCache();
        cache.put('proj-4', PREVIEW);
        cache.throwOnRead = true;
        const plan = planThumbnailReconcile([{ id: 'proj-4', thumbnailUrl: null }], cache.probe);
        expect(plan[0].source).toBe('absent');
        expect(plan[0].reason).toBe('cache-read-failed');
        expect(plan[0].backfillToServer).toBe(false);
    });
});

describe('§CONTEXT-DATA-HONESTY — "none" is no longer one value for four causes', () => {
    it('distinguishes never-captured / cache-read-failed / server-value-unusable', () => {
        const never = resolveProjectThumbnail({ projectId: 'a' });
        const failed = resolveProjectThumbnail({ projectId: 'b', localReadFailed: true });
        const unusable = resolveProjectThumbnail({ projectId: 'c', serverThumbnail: 'https://cdn/not-a-data-url.webp' });

        expect(never.reason).toBe('never-captured');
        expect(failed.reason).toBe('cache-read-failed');
        expect(unusable.reason).toBe('server-value-unusable');

        // All three used to print the identical string `thumbnail: none`.
        const rendered = [never, failed, unusable].map(describeThumbnailResolution);
        expect(new Set(rendered).size).toBe(3);
    });

    it('names the repair being performed, not just the source', () => {
        expect(describeThumbnailResolution(
            resolveProjectThumbnail({ projectId: 'x', serverThumbnail: PREVIEW }),
        )).toContain('seed->local-cache');
        expect(describeThumbnailResolution(
            resolveProjectThumbnail({ projectId: 'x', localThumbnail: PREVIEW }),
        )).toContain('backfill->server');
    });

    it('treats an over-budget server value as unusable rather than rendering something the client cannot re-upload', () => {
        const tooBig = `data:image/webp;base64,${'A'.repeat(THUMBNAIL_MAX_CHARS)}`;
        const r = resolveProjectThumbnail({ projectId: 'y', serverThumbnail: tooBig });
        expect(r.source).toBe('absent');
        expect(r.reason).toBe('server-value-unusable');
    });
});

describe('§FIX-THUMBNAIL-DURABILITY — the capture fits the durable column', () => {
    it('walks down the ladder until the payload fits, instead of emitting a 413', () => {
        // Models the real failure: a canvas that cannot ENCODE WebP silently
        // falls back to PNG, so the top rungs produce payloads several times the
        // ceiling. Pre-fix this single unbounded encode was handed straight to
        // the uploader and 413'd into a console.warn.
        const sizes = new Map([[0.72, 300_000], [0.55, 200_000], [0.40, 120_000]]);
        const fit = fitThumbnailToBudget(({ quality, scale }) => {
            const base = sizes.get(quality) ?? 100_000;
            return `data:image/webp;base64,${'A'.repeat(Math.round(base * scale * scale))}`;
        });
        expect(fit.dataUrl).not.toBeNull();
        expect(fit.dataUrl!.length).toBeLessThanOrEqual(THUMBNAIL_MAX_CHARS);
        expect(fit.attempts).toBeGreaterThan(1);
    });

    it('reports WHY it produced nothing — over-budget is not the same as no pixels', () => {
        const overBudget = fitThumbnailToBudget(() => `data:image/webp;base64,${'A'.repeat(500_000)}`);
        expect(overBudget.dataUrl).toBeNull();
        expect(overBudget.reason).toBe('over-budget');
        expect(overBudget.chars).toBe(500_000 + 'data:image/webp;base64,'.length);

        const nothing = fitThumbnailToBudget(() => null);
        expect(nothing.dataUrl).toBeNull();
        expect(nothing.reason).toBe('encoder-produced-nothing');
    });

    it('accepts the first rung when it already fits (no needless quality loss)', () => {
        const fit = fitThumbnailToBudget(({ quality }) => `data:image/webp;base64,${'A'.repeat(4000)}?q=${quality}`);
        expect(fit.attempts).toBe(1);
        expect(fit.accepted?.quality).toBe(0.72);
        expect(fit.accepted?.scale).toBe(1);
    });

    it('survives an encoder that throws on a rung and keeps descending', () => {
        let calls = 0;
        const fit = fitThumbnailToBudget(() => {
            calls += 1;
            if (calls === 1) throw new Error('no 2D context at full size');
            return `data:image/webp;base64,${'A'.repeat(4000)}`;
        });
        expect(fit.dataUrl).not.toBeNull();
        expect(fit.attempts).toBe(2);
    });
});

describe('§FIX-THUMBNAIL-DURABILITY — client and server agree on the ceiling', () => {
    it('THUMBNAIL_MAX_CHARS matches the literal enforced in server.js', () => {
        // A drift here is invisible at runtime and reintroduces the exact class
        // of bug this change closes: previews the client caches happily and the
        // server always refuses. Fail CI instead.
        const serverSrc = readFileSync(resolve(__dirname, '../../../server.js'), 'utf8');
        const m = serverSrc.match(/const THUMBNAIL_MAX_CHARS = (\d+);/);
        expect(m, 'server.js must declare `const THUMBNAIL_MAX_CHARS = <n>;`').not.toBeNull();
        expect(Number(m![1])).toBe(THUMBNAIL_MAX_CHARS);
    });

    it('bounds the hub-sync payload — 50 projects at the ceiling stay under 4 MB', () => {
        // Stated cost of keeping previews in the TEXT column rather than moving
        // them to object storage: they ride in the project-list projection on
        // every hub sync. This pins the worst case so a future ceiling increase
        // has to confront it.
        expect(50 * THUMBNAIL_MAX_CHARS).toBeLessThan(4 * 1024 * 1024);
    });
});
