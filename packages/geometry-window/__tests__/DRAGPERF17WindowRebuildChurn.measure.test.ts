/**
 * §DRAGPERF17-WINDOW-REBUILD-CHURN (L-10240) — THE SECOND LEG OF THE GHOST-DRAG LEDGER.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * The founder: *"while moving a window ghosted on a raked, edited-profile wall (it seems
 * performance is terrible) the WebGL collapsed."*
 *
 * A plan-view window ghost-drag writes the store on EVERY pointermove
 * (`PlanElementDragController._moveDoorWindow` → `WallStore.updateWindow`). That fans out
 * to TWO builders, and a ledger that measures one of them proves nothing about the other:
 *
 *   LEG 1 — `WallFragmentBuilder.updateWall` (the void re-cut). Measured in
 *           `geometry-wall/__tests__/DRAGPERF17OpeningDragChurn.measure.test.ts`.
 *   LEG 2 — `WindowBuilder.rebuild` (the frame, glass, sill and reveal). ⭐ THIS FILE.
 *
 * ⭐ WHY LEG 2 IS THE ONE THAT COULD ACTUALLY COLLAPSE A DEVICE. Leg 1's rebuild routes
 * every release through `detachAndReleaseChildren` / `scheduleGpuRelease` — one helper,
 * one queue, drained at the frame boundary. Leg 2 does NOT release uniformly by design:
 * `WindowBuilder.dispose()` deliberately SKIPS the frame/glass materials, because those
 * are cache-owned and back every other identical window (`_sharedFrameMats` /
 * `_sharedGlassMats`). A cache whose KEY varied per frame would therefore mint a material
 * per pointermove that nothing ever frees — the textbook path to GPU memory exhaustion →
 * device lost → the founder's "collapsed". That is a real, checkable claim, and this file
 * checks it rather than asserting it.
 *
 * Creates are counted from three.js's own monotonic `id` counters (a construction count,
 * immune to pooling or caching); disposes by wrapping the two `dispose` prototypes. Both
 * are restored after each run.
 *
 * ⛔ READ THE CACHE ROW FIRST. `sharedFrameMats` / `sharedGlassMats` must be FLAT across
 * the drag. If they grow per frame, the ledger's "materials created" number is a leak and
 * nothing else in the row matters.
 *
 * @file packages/geometry-window/__tests__/DRAGPERF17WindowRebuildChurn.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { WindowBuilder } from '../src/WindowBuilder';

const RAKE_DEG = 80;   // the founder's angle

function hostWall(raked: boolean) {
    return {
        id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        ...(raked ? { rakeAngleDeg: RAKE_DEG } : {}),
    };
}

const BASE_WIN = {
    id: 'win1', wallId: 'w1', openingId: 'o1',
    offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9,
    frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
    columnRatios: [1], rowRatios: [1],
    columnDividerThickness: 0.03, rowDividerThickness: 0.03,
    sill: true, sillDepth: 0.08, sillThickness: 0.03,
    glassOpacity: 0.3, windowType: 'single',
};

// ── The instrument ────────────────────────────────────────────────────────────

function geoIdNow(): number { return new THREE.BufferGeometry().id; }
function matIdNow(): number { return new THREE.MeshBasicMaterial().id; }

interface Row {
    variant: string;
    frames: number;
    geoCreated: number;
    geoDisposed: number;
    matCreated: number;
    matDisposed: number;
    sceneObjBefore: number;
    sceneObjAfter: number;
    frameMatsBefore: number;
    frameMatsAfter: number;
    glassMatsBefore: number;
    glassMatsAfter: number;
    pendingAfter: number;
    msTotal: number;
}

const rows: Row[] = [];

function countObjects(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse(() => { n++; });
    return n;
}

function census(variant: string, raked: boolean, FRAMES: number): Row {
    const w = hostWall(raked);
    const wallStoreStub = {
        getById: () => w,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub) as unknown as {
        rebuild(win: unknown, prev?: unknown): void;
        _sharedFrameMats: Map<string, unknown>;
        _sharedGlassMats: Map<string, unknown>;
    };

    // Frame 0 — the window as it stood when the user grabbed it. Not counted.
    builder.rebuild({ ...BASE_WIN });
    drainGpuReleaseQueue();
    const sceneObjBefore = countObjects(scene);
    const frameMatsBefore = builder._sharedFrameMats.size;
    const glassMatsBefore = builder._sharedGlassMats.size;

    const origGeoDispose = THREE.BufferGeometry.prototype.dispose;
    const origMatDispose = THREE.Material.prototype.dispose;
    let geoDisposed = 0, matDisposed = 0;
    THREE.BufferGeometry.prototype.dispose = function (this: THREE.BufferGeometry) {
        geoDisposed++; return origGeoDispose.call(this);
    };
    THREE.Material.prototype.dispose = function (this: THREE.Material) {
        matDisposed++; return origMatDispose.call(this);
    };

    const g0 = geoIdNow();
    const m0 = matIdNow();
    const t0 = Date.now();

    let prev = { ...BASE_WIN };
    for (let f = 1; f <= FRAMES; f++) {
        // Exactly what a pointermove writes: the offset, and nothing else.
        const next = { ...BASE_WIN, offset: 2.0 + f * 0.02 };
        builder.rebuild(next, prev);
        drainGpuReleaseQueue();               // the frame boundary
        prev = next;
    }

    const t1 = Date.now();
    const g1 = geoIdNow();
    const m1 = matIdNow();
    THREE.BufferGeometry.prototype.dispose = origGeoDispose;
    THREE.Material.prototype.dispose = origMatDispose;

    const row: Row = {
        variant, frames: FRAMES,
        geoCreated: g1 - g0 - 1,
        geoDisposed,
        matCreated: m1 - m0 - 1,
        matDisposed,
        sceneObjBefore, sceneObjAfter: countObjects(scene),
        frameMatsBefore, frameMatsAfter: builder._sharedFrameMats.size,
        glassMatsBefore, glassMatsAfter: builder._sharedGlassMats.size,
        pendingAfter: pendingGpuReleaseCount(),
        msTotal: t1 - t0,
    };
    rows.push(row);
    return row;
}

function fmt(r: Row): string {
    const per = (n: number) => (n / r.frames).toFixed(1).padStart(6);
    return (
        `${r.variant.padEnd(24)}` +
        ` geo ${String(r.geoCreated).padStart(5)}c/${String(r.geoDisposed).padStart(5)}d (${per(r.geoCreated)}c ${per(r.geoDisposed)}d /frame)` +
        ` | mat ${String(r.matCreated).padStart(4)}c/${String(r.matDisposed).padStart(4)}d (${per(r.matCreated)}c ${per(r.matDisposed)}d /frame)` +
        ` | scene-objs ${r.sceneObjBefore}→${r.sceneObjAfter}` +
        ` | frameMats ${r.frameMatsBefore}→${r.frameMatsAfter}` +
        ` glassMats ${r.glassMatsBefore}→${r.glassMatsAfter}` +
        ` | queue-left ${r.pendingAfter}` +
        ` | ${String(r.msTotal).padStart(5)} ms (${(r.msTotal / r.frames).toFixed(2)} ms/frame)`
    );
}

describe('§DRAGPERF17 — WindowBuilder: what ONE ghost-drag frame allocates, and whether it comes back', () => {
    it('⭐ the per-frame create/dispose ledger, vertical host vs the founder\'s raked host', () => {
        const FRAMES = 30;
        census('plain-host (CONTROL)', false, FRAMES);
        census(`raked-host @${RAKE_DEG}deg`, true, FRAMES);

        const report = [
            '§DRAGPERF17-WINDOW-REBUILD-CHURN — per-frame GPU-object ledger (LEG 2)',
            `frames per drag: ${FRAMES}   (one pointermove each, offset +20 mm)`,
            '',
            ...rows.map(fmt),
            '',
            'READ THE CACHE COLUMNS FIRST: frameMats / glassMats must be FLAT across a drag.',
            'A cache that grows per frame mints a material nothing ever frees — the path to',
            'GPU memory exhaustion, device-lost, and the founder\'s "collapsed".',
        ].join('\n');
        // eslint-disable-next-line no-console
        console.log('\n' + report + '\n');
        try {
            writeFileSync(join(tmpdir(), 'dragperf17-window-rebuild-churn.txt'), report);
        } catch { /* diagnostics only */ }

        for (const r of rows) {
            expect(r.geoCreated, `${r.variant} created no geometry — instrument dead?`).toBeGreaterThan(0);
        }
    });

    it('⛔ THE CACHE GATE — the shared frame/glass material caches must NOT grow across a drag', () => {
        for (const r of rows) {
            expect(
                r.frameMatsAfter,
                `${r.variant}: _sharedFrameMats grew ${r.frameMatsBefore} → ${r.frameMatsAfter} over ${r.frames} frames ` +
                `— a per-frame material the builder never frees`,
            ).toBe(r.frameMatsBefore);
            expect(
                r.glassMatsAfter,
                `${r.variant}: _sharedGlassMats grew ${r.glassMatsBefore} → ${r.glassMatsAfter} over ${r.frames} frames`,
            ).toBe(r.glassMatsBefore);
        }
    });

    it('⛔ THE LEAK GATE — a ghost-drag frame must RETURN the geometry it allocates', () => {
        for (const r of rows) {
            const ratio = r.geoDisposed / Math.max(1, r.geoCreated);
            expect(
                ratio,
                `${r.variant}: geometry creates ${r.geoCreated} vs disposes ${r.geoDisposed} ` +
                `(ratio ${ratio.toFixed(3)}) — below 0.9 is an unbounded per-frame leak`,
            ).toBeGreaterThan(0.9);
        }
    });

    it('⛔ the scene graph must not GROW across a drag (no orphaned window groups)', () => {
        for (const r of rows) {
            expect(
                r.sceneObjAfter,
                `${r.variant}: scene objects grew ${r.sceneObjBefore} → ${r.sceneObjAfter} across the drag`,
            ).toBeLessThanOrEqual(r.sceneObjBefore + 2);
        }
    });
});
