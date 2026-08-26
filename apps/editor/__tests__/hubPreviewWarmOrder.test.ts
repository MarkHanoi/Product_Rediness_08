/**
 * @vitest-environment happy-dom
 */
// hubPreviewWarmOrder — §FIX-PREVIEW-WAITS-ON-VERSION-HISTORY (L-10402).
//
// ─── THE DEFECT, AS THE FOUNDER SAW IT ──────────────────────────────────────
//
// The hub paints placeholder cards ("BIM Project" + an initial glyph), then
// roughly a second later the real previews appear. *"It looks like a bug."*
//
// It is not the thumbnails. `ProjectHub._warmThenSync()` read:
//
//     await warmVersionCache();      // ← every project's ENTIRE version history
//     await warmThumbnailCache();
//     this.refreshGrid();            // ← the previews appear HERE
//
// `warmVersionCache()` cursors every row of the `versions` object store and
// materialises each project's whole compressed version-history payload into a
// Map (`VersionCacheStore.warm()`). On the founder's account that is ~100
// projects of up to 45 versions each — the perf ledger records 5.4 MB
// *compressed* for a single project's snapshot. The grid does not use ANY of it,
// and yet the first repaint was `await`ed strictly behind it.
//
// ⛔ THE INTUITIVE FIX IS THE WRONG ONE, which is why this test asserts ordering
// rather than a source. The same console reports `0 painted from the durable
// server column`, and painting from the server instead would be strictly SLOWER
// — a network round-trip replacing an in-memory mirror read. Nor may the
// skeleton be removed: it occupies the same `.ph-card-thumb` box as the real
// `<img>` (`ProjectHubTemplates.ts:435-441`), so it costs no reflow and an empty
// card would be worse.
//
// ⚠ L-148 IS THE CONSTRAINT THIS MUST NOT BREAK, and the second test is here for
// exactly that reason: both migrations must still complete before the first
// server-sync index write. The fix runs the warms CONCURRENTLY — it does not
// drop the version warm, and it does not let the sync start early.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────
//
// `ProjectHub` is real, its DOM is real, and the project list is seeded through
// `localStorage['bim-projects-index']` — the same key production reads. Exactly
// TWO exports of `ProjectRepository` are replaced, `warmVersionCache` and
// `warmThumbnailCache`, because the subject under test is WHEN the hub waits on
// them; everything else in that module is the real implementation via
// `importOriginal`. `runtime` is `null`, a value the hub's own callers pass, so
// `syncFromServer` takes its documented offline-degrading fallback.

import { describe, expect, it, beforeEach, vi } from 'vitest';

/** Resolved by the test, so "still pending" is an assertable state. */
let releaseVersionWarm: () => void;
let versionWarmSettled = false;
let versionWarmStarted = false;
let thumbWarmStarted = false;

vi.mock('../src/ui/platform/ProjectRepository.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/ui/platform/ProjectRepository.js')>();
    return {
        ...actual,
        warmVersionCache: (): Promise<void> => {
            versionWarmStarted = true;
            return new Promise<void>(resolve => {
                releaseVersionWarm = () => { versionWarmSettled = true; resolve(); };
            });
        },
        warmThumbnailCache: (): Promise<void> => {
            thumbWarmStarted = true;
            return Promise.resolve();
        },
    };
});

const { ProjectHub } = await import('../src/ui/platform/ProjectHub.js');

const USER = { id: 'u-1', email: 'founder@example.test', name: 'Founder', createdAt: 0 } as const;
const PROJECT_ID = 'proj-1755555555555-abcdef';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Let every already-queued microtask run, without advancing wall-clock time. */
const flush = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    localStorage.setItem('bim-projects-index', JSON.stringify([
        { id: PROJECT_ID, name: 'Riverside Tower', updatedAt: Date.now(), versionCount: 45 },
    ]));
    versionWarmSettled = false;
    versionWarmStarted = false;
    thumbWarmStarted = false;
    releaseVersionWarm = () => {};
});

describe('L-10402 — the previews must not wait on every project\'s version history', () => {
    it('⭐ repaints the grid while the version warm is STILL PENDING', async () => {
        new ProjectHub(document.body, USER as any, { onOpenProject: () => {}, onSignOut: () => {} }, null);

        // The constructor is synchronous through `build()`, so this marker is in
        // place before any async repaint can run. Its disappearance IS the
        // repaint — `refreshGrid()` reassigns `#ph-grid.innerHTML`.
        const grid = document.querySelector('#ph-grid');
        expect(grid, 'the shell must render a #ph-grid synchronously').not.toBeNull();
        const marker = document.createElement('span');
        marker.id = 'l10402-marker';
        grid!.appendChild(marker);

        await flush();

        // ⛔ THE ASSERTION. Before the fix the marker survived here, because the
        // repaint sat behind an unresolved `warmVersionCache()`.
        expect(versionWarmSettled, 'fixture: the version warm must still be pending').toBe(false);
        expect(document.querySelector('#l10402-marker'), 'the grid must have repainted already').toBeNull();
    });

    it('starts BOTH warms — the version warm is run concurrently, never dropped', async () => {
        new ProjectHub(document.body, USER as any, { onOpenProject: () => {}, onSignOut: () => {} }, null);
        await flush();
        // ⚠ A "fix" that simply stopped warming versions would pass the test
        // above and silently break the synchronous auto-restore read at
        // project-open (§VERSION-QUOTA-INDEXEDDB). Both must be in flight.
        expect(versionWarmStarted).toBe(true);
        expect(thumbWarmStarted).toBe(true);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ⚠ REWRITTEN 2026-08-26 BY LANE PERF104 (§PERF104, L-11540) — DELIBERATELY,
    // AND THE REASON IS THE POINT, SO IT IS RECORDED RATHER THAN QUIETLY EDITED.
    //
    // This test used to read: *"the server sync does not start until the version
    // warm settles"*, and it passed. But that is NOT what L-148 requires. L-148's
    // invariant, in its own words at `ProjectHub._warmThenSync`, is that **both
    // migrations complete before the first server-sync `saveProject*` WRITE** —
    // because the heavy legacy `bim-project-<id>-versions` blobs must be out of
    // localStorage before that index write lands, or it hits "quota exceeded —
    // eviction exhausted" once per project.
    //
    // "Before the write" and "before the sync starts" are different conditions,
    // and the second is strictly stronger. Asserting the stronger PROXY had a real
    // cost: it pinned the server list round-trip — the same list the OPEN path
    // needs (`buildPersistence.openProject` step 1) — behind a cursor over every
    // project's entire version container. Opening ONE project became a function of
    // how many OTHER projects exist. On the founder's 2026-08-26 run that warm was
    // 93 ms and the sync behind it ~509 ms.
    //
    // ⛔ SO THE PROXY IS REPLACED BY THE ACTUAL INVARIANT, NOT DROPPED. The write
    // is now the thing observed. A regression that let the index write land on an
    // unmigrated localStorage still fails here, which is the whole job of this test.
    // ⛔ Do not "restore" the old assertion: it would re-serialise the open path
    // behind whole-corpus maintenance and it never tested what its name claimed.
    // ─────────────────────────────────────────────────────────────────────────
    it('⭐ the server list fetch NO LONGER queues behind the whole-corpus version warm', async () => {
        const fetchSpy = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
        (globalThis as any).fetch = fetchSpy;

        new ProjectHub(document.body, USER as any, { onOpenProject: () => {}, onSignOut: () => {} }, null);
        await flush();

        // The warm is STILL PENDING and the list has already been asked for. This is
        // the ~0.5 s of serialized hub work that §PERF104 removed from ahead of the
        // first possible click.
        expect(versionWarmSettled, 'fixture: the version warm must still be pending').toBe(false);
        expect(fetchSpy, 'the list fetch must not wait for the corpus warm').toHaveBeenCalled();

        releaseVersionWarm();
        await flush();
        expect(versionWarmSettled).toBe(true);
    });

    it('⚠ L-148 PRESERVED: the index WRITE still waits for the version warm', async () => {
        // Two server rows, so the reconcile has genuine upserts to write. Without
        // them `saveProjectsBatch` is never reached and this test would pass
        // vacuously — the failure mode a "did not happen" assertion always has.
        const fetchSpy = vi.fn(async () => ({
            ok: true,
            json: async () => ({ projects: [
                { id: 'proj-1755555555556-aaaaaa', name: 'Server A', updated_at: new Date(Date.now() + 60_000).toISOString(), owner_id: 'u-1' },
                { id: 'proj-1755555555557-bbbbbb', name: 'Server B', updated_at: new Date(Date.now() + 60_000).toISOString(), owner_id: 'u-1' },
            ] }),
        }));
        (globalThis as any).fetch = fetchSpy;

        new ProjectHub(document.body, USER as any, { onOpenProject: () => {}, onSignOut: () => {} }, null);
        await flush();

        expect(fetchSpy, 'fixture: the reconcile must have fetched').toHaveBeenCalled();
        // ⛔ THE INVARIANT. The migration is still moving legacy blobs out of
        // localStorage, so the full-index write must NOT have landed yet.
        expect(versionWarmSettled, 'fixture: the version warm must still be pending').toBe(false);
        expect(
            localStorage.getItem('bim-projects-index'),
            'the index write must wait for the version migration (L-148)',
        ).not.toContain('Server A');

        releaseVersionWarm();
        await flush();
        // …and once it settles, the write lands.
        expect(localStorage.getItem('bim-projects-index')).toContain('Server A');
        expect(localStorage.getItem('bim-projects-index')).toContain('Server B');
    });
});
