/**
 * BatchCoordinator perf-decision unit tests — ADR-0094.
 *
 * Covers the PURE static decision the coordinator uses to gate the post-geometry
 * synchronous `rpm.render()` compile (§PERF-POSTGEOM-COMPILE-NO-SYNC-BLOCK). The
 * method is side-effect free (no renderer, no DOM), so it is unit-testable directly.
 *
 * Regression it locks: a large office/resi build feeds its geometry through the bus
 * UNCOUNTED, so the batch's EXPECTED element count is ~0/≤32 while the ACTUAL scene
 * is 1200+ meshes. The old decision judged small-vs-large by the expected count alone
 * and let a single synchronous `rpm.render()` run — a live build logged
 * `single pass took 49942.9ms > 100ms`, freezing the viewport ~50s on BOTH WebGPU and
 * WebGL. The fix adds the actual-scene-mesh-count arm tested here.
 */
import { describe, it, expect } from 'vitest';
import { BatchCoordinator } from './BatchCoordinator';

describe('BatchCoordinator.shouldSkipPostGeometrySyncCompile (§PERF-POSTGEOM-COMPILE-NO-SYNC-BLOCK, ADR-0094)', () => {
    const CAP = BatchCoordinator.POSTGEOM_SYNC_COMPILE_MAX_SCENE_MESHES;

    it('runs the single sync pass for a genuinely small batch (small scene, few elements)', () => {
        // Small showcase batch: not skipPbr, ≤32 expected, tiny actual scene → DO NOT skip
        // (a single sub-100ms pass is affordable here — pre-fix behaviour preserved).
        expect(BatchCoordinator.shouldSkipPostGeometrySyncCompile({
            skipPbrUpgrade: false,
            expectedElements: 8,
            sceneMeshCount: 50,
        })).toBe(false);
    });

    it('SKIPS the sync pass when the ACTUAL scene is large even though expected count is ~0 (THE bug)', () => {
        // Office/resi: geometry arrives via the bus uncounted → expectedElements ≈ 0,
        // but the real scene is 1200+ meshes. This must SKIP the ~50s synchronous render.
        expect(BatchCoordinator.shouldSkipPostGeometrySyncCompile({
            skipPbrUpgrade: false,
            expectedElements: 0,
            sceneMeshCount: 1_211, // the live office-build evidence count
        })).toBe(true);
    });

    it('SKIPS at exactly one mesh over the cap, RUNS at exactly the cap', () => {
        expect(BatchCoordinator.shouldSkipPostGeometrySyncCompile({
            skipPbrUpgrade: false, expectedElements: 0, sceneMeshCount: CAP + 1,
        })).toBe(true);
        expect(BatchCoordinator.shouldSkipPostGeometrySyncCompile({
            skipPbrUpgrade: false, expectedElements: 0, sceneMeshCount: CAP,
        })).toBe(false);
    });

    it('SKIPS when skipPbrUpgrade=true regardless of counts (CW/slab prewarmed batches)', () => {
        expect(BatchCoordinator.shouldSkipPostGeometrySyncCompile({
            skipPbrUpgrade: true, expectedElements: 0, sceneMeshCount: 10,
        })).toBe(true);
    });

    it('SKIPS when the EXPECTED element count is large (>32), scene count unknown', () => {
        expect(BatchCoordinator.shouldSkipPostGeometrySyncCompile({
            skipPbrUpgrade: false, expectedElements: 33, sceneMeshCount: -1,
        })).toBe(true);
    });

    it('ignores an UNKNOWN (-1) scene count — falls back to expected-count behaviour', () => {
        // provider unwired (-1): a small expected batch still runs the pass (no regression).
        expect(BatchCoordinator.shouldSkipPostGeometrySyncCompile({
            skipPbrUpgrade: false, expectedElements: 8, sceneMeshCount: -1,
        })).toBe(false);
    });

    it('exposes conservative, evidence-aligned thresholds', () => {
        // Cap sits well below the observed 1200-mesh freeze but above any small batch.
        expect(BatchCoordinator.POSTGEOM_SYNC_COMPILE_MAX_SCENE_MESHES).toBe(200);
        // Large-batch PBR auto-skip aligns with the render tier's large-scene cap.
        expect(BatchCoordinator.LARGE_BATCH_SKIP_PBR_SCENE_MESHES).toBe(1_200);
        expect(BatchCoordinator.LARGE_BATCH_SKIP_PBR_ELEMENTS).toBe(400);
    });
});
