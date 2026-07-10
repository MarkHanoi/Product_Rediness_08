/**
 * §FIX-ELEV-NME-CACHE-MULTIVIEW (L-114) — the proxy cache must not thrash to a 0%
 * hit rate on reprojection of an elevation-sized element set, and the SINGLE GLOBAL
 * LRU must let the multiple always-present views (the 4 default L-110 elevations +
 * 3D + plan) coexist without evicting each other.
 *
 * Symptom (L-114): on the South elevation of a 7-level / 909-element project the §H2
 * cache logged `cacheSize=500/500 hitRate=0% misses=776`. §FIX-NME-ADAPTIVE-LRU
 * (L-117/L-118) sized the cap off the CURRENT view only, which fixes a view thrashing
 * itself but not the multi-view case: with several views each exporting ~all N
 * elements, switching the active view re-evicted the previous view and reprojected
 * from scratch. This suite locks both:
 *   1. a >500-element view reprojects at a NON-ZERO (full) hit rate — the audit's
 *      literal acceptance criterion; and
 *   2. reprojecting view A after an interleaved projection of view B (same element
 *      set, combined working set exceeding one view's cap) still fully hits — the
 *      multi-view residual this fix closes.
 *
 * Nothing is culled — the exported element SET is unchanged (still includes every
 * element the elevation legitimately shows, incl. L-190 hosted openings and the
 * nearer occluders L-196 needs for :beyond classification). This is a cache-sizing
 * fix only.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { NativeElementMeshExporter } from './NativeElementMeshExporter';

function rootWith(id: string): THREE.Group {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2), new THREE.MeshBasicMaterial());
    mesh.userData.elementType = 'Wall';
    group.add(mesh);
    group.userData = { id, elementType: 'Wall' };
    return group;
}

function fakeBimManager(levels: Array<{ id: string; elevation: number; height: number; childrenIds: string[] }>) {
    return {
        getLevels: () => levels,
        getLevelById: (id: string) => levels.find(l => l.id === id),
    } as any;
}

/** Register `count` wall roots and return their ids. */
function seedElements(prefix: string, count: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
        const id = `${prefix}-${i}`;
        elementRegistry.registerRoot(id, rootWith(id));
        ids.push(id);
    }
    return ids;
}

/** Parse the last `[NME] §H2-NME-CACHE hits=X misses=Y …` line captured by the spy. */
function lastCacheStats(logs: string[]): { hits: number; misses: number } {
    for (let i = logs.length - 1; i >= 0; i--) {
        const m = /§H2-NME-CACHE hits=(\d+) misses=(\d+)/.exec(logs[i]);
        if (m) return { hits: Number(m[1]), misses: Number(m[2]) };
    }
    throw new Error('no §H2-NME-CACHE line was logged');
}

describe('§FIX-ELEV-NME-CACHE-MULTIVIEW — proxy cache sizing', () => {
    let logs: string[];
    let spy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        elementRegistry.clear();
        logs = [];
        spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
            logs.push(args.map(a => String(a)).join(' '));
        });
    });

    afterEach(() => {
        spy.mockRestore();
    });

    it('a >500-element elevation reprojects at a full (non-zero) hit rate — no 0% thrash', () => {
        // 600 > BASE_CACHE_ENTRIES (500): the old fixed-500 cap self-evicted within one
        // pass and re-missed everything; the adaptive cap must hold the whole set.
        const ids = seedElements('w', 600);
        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager([
            { id: 'L0', elevation: 0, height: 3, childrenIds: ids },
        ]));
        const view = { id: 'vd-elev-south', viewType: 'elevation', spatial: {} } as any;

        // First pass — all misses (cold cache).
        const first = exporter.exportForView(view);
        exporter.releaseGroups(first, { disposeProxies: true });
        expect(lastCacheStats(logs).hits).toBe(0);

        // Second pass — the whole 600-element set must be resident: 0 misses, 600 hits.
        logs.length = 0;
        const second = exporter.exportForView(view);
        const stats = lastCacheStats(logs);
        exporter.releaseGroups(second, { disposeProxies: true });

        expect(stats.misses).toBe(0);
        expect(stats.hits).toBe(600);
    });

    it('reprojecting an elevation after an interleaved second view still fully hits (no cross-view eviction)', () => {
        // Two elevations over the SAME element set (as the 4 default elevations are).
        // 350 each ⇒ combined working set 700 > any single view's ceil(350×1.25)=438
        // and > BASE 500, so the OLD single-view cap (500) evicted view A while view B
        // projected. The summed multi-view cap must hold BOTH.
        const ids = seedElements('w', 350);
        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager([
            { id: 'L0', elevation: 0, height: 3, childrenIds: ids },
        ]));
        const viewA = { id: 'vd-elev-a', viewType: 'elevation', spatial: {} } as any;
        const viewB = { id: 'vd-elev-b', viewType: 'elevation', spatial: {} } as any;

        exporter.releaseGroups(exporter.exportForView(viewA), { disposeProxies: true }); // cold A
        exporter.releaseGroups(exporter.exportForView(viewB), { disposeProxies: true }); // cold B (would evict A pre-fix)

        // Re-project A: with the summed cap A's entries survived B's projection → full hit.
        logs.length = 0;
        const reA = exporter.exportForView(viewA);
        const stats = lastCacheStats(logs);
        exporter.releaseGroups(reA, { disposeProxies: true });

        expect(stats.misses).toBe(0);
        expect(stats.hits).toBe(350);
    });

    it('does not cull any element from the exported set (SET unchanged — cache-sizing only)', () => {
        const ids = seedElements('w', 40);
        const exporter = new NativeElementMeshExporter();
        exporter.setBimManager(fakeBimManager([
            { id: 'L0', elevation: 0, height: 3, childrenIds: ids },
        ]));
        const view = { id: 'vd-elev-check', viewType: 'elevation', spatial: {} } as any;

        const groups = exporter.exportForView(view);
        const exported = new Set(groups.map(g => g.userData.elementUUID as string));
        exporter.releaseGroups(groups, { disposeProxies: true });

        for (const id of ids) expect(exported.has(id)).toBe(true);
        expect(exported.size).toBe(40);
    });
});
