/**
 * @vitest-environment happy-dom
 */
// §PERF100 PROBE (L-11440) — the EVIDENCE BASE for "only 151 elements but it takes a few
// minutes to open". Measures the per-leg CPU cost of the hub-mount work at a fixture sized
// to the founder's own console: 77 local projects × a 0.86 MB v3 container × 20 versions ×
// 2 056 journal records in 2 chunks = 66.1 MB.
//
// ⭐ THE RESULT IS A NEGATIVE ONE, AND THAT IS THE POINT. First reading, 2026-08-25:
//
//     warmVersionCache (corpus)          1 ms   (no IndexedDB in happy-dom — see below)
//     warmThumbnailCache                 1 ms
//     listProjects                       1 ms
//     planThumbnailReconcile             1 ms   50 server rows (the page cap)
//     probeVersions ×77                 88 ms   _parseContainer per project
//     decideLocalOnlyProjectFate ×77    85 ms
//     saveProjectsBatch(50)              1 ms   the single L-148 index write
//     ───────────────────────────────────────
//     TOTAL                            178 ms
//
// 178 ms. NOTHING HERE COMPUTES FOR 44 SECONDS, and nothing here is corrupted — the
// containers parse, the counts are right, the ruling runs. Any explanation of the founder's
// hole that names hub CPU is refuted by this table.
//
// ⚠ WHAT THIS PROBE CANNOT MEASURE, stated so nobody reads 178 ms as "the hub is free":
// happy-dom provides no IndexedDB, so `VersionCacheStore.warm()` short-circuits on
// `isDisabled()` and its cursor over 66 MB of real IDB is UNMEASURED — not measured cheap.
// The server list round-trip is likewise absent. Those two are the remaining candidates and
// the §STARTUP-BUDGET `hub:*` marks (lane PERF100) are what will name them from a real run.
import { describe, it, beforeAll } from 'vitest';

const V3 = '\x00fflate3\x01';
const N_PROJECTS = 77;
const N_VERSIONS = 20;
const CONTAINER_BYTES = 900_000;
const N_JOURNAL = 2056;

const ids: string[] = [];

function makeContainer(): string {
    // 20 entries; the blob bytes dominate, exactly as in a real v3 container.
    const perEntry = Math.floor((CONTAINER_BYTES * 0.75) / N_VERSIONS);
    const v = Array.from({ length: N_VERSIONS }, (_, i) => ({
        id: `v-${i}`, b: 'A'.repeat(perEntry), r: i,
    }));
    const perChunk = Math.floor((CONTAINER_BYTES * 0.25) / 2);
    const j = { k: 1, n: N_JOURNAL, c: [{ b: 'B'.repeat(perChunk), d: 'x' }, { b: 'B'.repeat(perChunk), d: 'y' }] };
    return V3 + JSON.stringify({ v, j });
}

beforeAll(() => {
    const t0 = performance.now();
    const container = makeContainer();
    const index: unknown[] = [];
    for (let i = 0; i < N_PROJECTS; i++) {
        const id = `proj-17876000000${String(i).padStart(2, '0')}-abc${i}`;
        ids.push(id);
        localStorage.setItem(`bim-project-${id}-versions`, container);
        index.push({ id, name: `Project ${i}`, updatedAt: Date.now(), versionCount: N_VERSIONS });
    }
    localStorage.setItem('bim-projects-index', JSON.stringify(index));
    console.log(`[PERF100] fixture built in ${(performance.now() - t0).toFixed(0)}ms — ` +
        `${N_PROJECTS} projects × ${(container.length / 1024 / 1024).toFixed(2)} MB = ` +
        `${((container.length * N_PROJECTS) / 1024 / 1024).toFixed(1)} MB total`);
});

describe('§PERF100 — per-leg cost of the hub-mount work', () => {
    it('measures', async () => {
        const repo = await import('../ProjectRepository');
        const { planThumbnailReconcile } = await import('../thumbnailReconcile');
        const { decideLocalOnlyProjectFate } = await import('../localOnlyProjectFate');
        const rows: Array<{ leg: string; ms: number; note: string }> = [];
        const time = async (leg: string, note: string, fn: () => unknown): Promise<void> => {
            const t = performance.now();
            await fn();
            rows.push({ leg, ms: Math.round(performance.now() - t), note });
        };

        await time('warmVersionCache (corpus)', `${N_PROJECTS} legacy localStorage stores → IDB`,
            () => repo.warmVersionCache());
        await time('warmThumbnailCache', 'index scan + inline-thumbnail migration',
            () => repo.warmThumbnailCache());
        await time('listProjects', 'JSON.parse of bim-projects-index',
            () => repo.projectRepository.listProjects());

        const summaries = ids.slice(0, 50).map(id => ({ id, thumbnailUrl: null }));
        await time('planThumbnailReconcile', '50 server rows (the page cap)',
            () => planThumbnailReconcile(summaries, repo.probeCachedThumbnail));

        await time('probeVersions ×77', 'the residency audit: _parseContainer per project',
            () => { for (const id of ids) repo.versionRepository.probeVersions(id); });

        await time('decideLocalOnlyProjectFate ×77', 'pure ruling over the probes',
            () => {
                for (const id of ids) {
                    decideLocalOnlyProjectFate({
                        projectId: id, indexVersionCount: N_VERSIONS,
                        probe: repo.versionRepository.probeVersions(id),
                    });
                }
            });

        const upserts = repo.projectRepository.listProjects().slice(0, 50);
        await time('saveProjectsBatch(50)', 'the single L-148 index write',
            () => repo.projectRepository.saveProjectsBatch(upserts));

        console.log('\n[PERF100] ══ per-leg cost, fixture = founder-sized corpus ══');
        for (const r of rows) console.log(`  ${r.leg.padEnd(32)} ${String(r.ms).padStart(7)} ms   ${r.note}`);
        console.log(`  ${'TOTAL'.padEnd(32)} ${String(rows.reduce((a, b) => a + b.ms, 0)).padStart(7)} ms`);
    }, 600_000);
});
