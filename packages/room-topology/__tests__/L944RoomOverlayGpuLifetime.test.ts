/**
 * L-944(a) — §GPU-RESOURCE-LIFETIME (ADR-0297 INVARIANT L2) for the ROOM OVERLAY.
 *
 * ── What the founder measured, and what it identifies ────────────────────────
 *
 *   [RenderPipelineManager] uncaptured WebGPU error: Vertex buffer slot 0 required by
 *     [RenderPipeline "renderPipeline_MeshBasicMaterial_6268"] was not set.
 *     - While encoding [RenderPassEncoder (unlabeled)].Draw(48, 1, 0, 0).
 *
 * `Draw(48, 1, 0, 0)` is a NON-INDEXED draw of 48 vertices with a MeshBasicMaterial
 * pipeline. That is a fingerprint, not a coincidence:
 *
 *   • `THREE.ExtrudeGeometry(<n-gon>, { bevelEnabled: false })` is non-indexed and
 *     emits 12·n vertices. n = 5 gives EXACTLY 48; no other n does (measured against
 *     three r183 — the first test below re-measures it, so a THREE upgrade that
 *     re-tessellates makes this identification go RED instead of silently rotting).
 *   • The only producers of `ExtrudeGeometry` + `MeshBasicMaterial` reachable in the
 *     editor viewport are room-POLYGON extrusions: `RoomBoundaryBuilder._buildVolumeMesh`
 *     (the room volume overlay) and `SelectionBoundsRegistry.buildRoom` (the room
 *     selection highlight, built from the SAME `userData.polygon`).
 *   • The room floor fill is `ShapeGeometry` — INDEXED — so it would appear as a
 *     `DrawIndexed`, and the wall hit-proxy is a `BoxGeometry` (indexed, 24 verts).
 *
 * ⇒ The mesh that drew after its buffer was released is a FIVE-CORNER ROOM overlay,
 *   not a wall. That matters: L-943 measured this same undo INVENTING 63 m² of floor,
 *   i.e. the room polygon is exactly what `UNDO: CASCADE_WALL_BASELINE` rewrites.
 *
 * ── The defect these tests lock ──────────────────────────────────────────────
 * `removeRoom()` detached correctly but RELEASED on the mutation tick — the tick of a
 * store event, which has no relationship to the frame boundary. ADR-0297 INVARIANT L2
 * is BOTH halves: (a) detach before release, and (b) release only once the frame that
 * last referenced the buffer has finished encoding and submitting. The §GPU-RESOURCE-
 * LIFETIME migration routed curtain-wall, slab, ceiling, stair, furniture, roof, column
 * and InstanceGroup through the deferred queue and skipped every builder on the
 * wall/room path.
 *
 * These tests assert ORDERING, not pixels — there is no WebGPU in vitest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue, pendingGpuReleaseCount } from '@pryzm/renderer-three';
import { RoomBoundaryBuilder } from '../src/RoomBoundaryBuilder';

/** n-gon THREE.Shape, closed. */
function gon(n: number, r = 2): THREE.Shape {
    const s = new THREE.Shape();
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (i === 0) s.moveTo(x, z); else s.lineTo(x, z);
    }
    s.closePath();
    return s;
}

/**
 * The builder's constructor registers `window` listeners and the package's vitest
 * environment is `node`. The methods under test read only `scene` / the two mesh maps,
 * so arm the instance directly — the constructor is not what is being measured.
 */
function armBuilder(): { scene: THREE.Scene; builder: RoomBoundaryBuilder } {
    const scene = new THREE.Scene();
    const builder = Object.create(RoomBoundaryBuilder.prototype) as RoomBoundaryBuilder;
    const priv = builder as unknown as {
        scene: THREE.Scene;
        meshes: Map<string, THREE.Mesh>;
        _volumeMeshes: Map<string, THREE.Mesh>;
    };
    priv.scene = scene;
    priv.meshes = new Map();
    priv._volumeMeshes = new Map();
    return { scene, builder };
}

function seedRoom(scene: THREE.Scene, builder: RoomBoundaryBuilder, id: string) {
    const priv = builder as unknown as {
        meshes: Map<string, THREE.Mesh>;
        _volumeMeshes: Map<string, THREE.Mesh>;
    };
    // Floor fill — ShapeGeometry, as production builds it.
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(gon(5)), new THREE.MeshBasicMaterial());
    // Volume overlay — the 48-vertex ExtrudeGeometry the founder's draw names.
    const volume = new THREE.Mesh(
        new THREE.ExtrudeGeometry(gon(5), { depth: 3, bevelEnabled: false }),
        new THREE.MeshBasicMaterial(),
    );
    const floorGeoDispose = vi.fn();
    const floorMatDispose = vi.fn();
    const volGeoDispose = vi.fn();
    const volMatDispose = vi.fn();
    floor.geometry.dispose = floorGeoDispose;
    (floor.material as THREE.Material).dispose = floorMatDispose;
    volume.geometry.dispose = volGeoDispose;
    (volume.material as THREE.Material).dispose = volMatDispose;
    scene.add(floor);
    scene.add(volume);
    priv.meshes.set(id, floor);
    priv._volumeMeshes.set(id, volume);
    return { floor, volume, floorGeoDispose, floorMatDispose, volGeoDispose, volMatDispose };
}

describe('L-944(a) — the failing draw is a five-corner room-polygon extrusion', () => {
    it('ExtrudeGeometry(5-gon, bevelEnabled:false) is non-indexed and has EXACTLY 48 vertices', () => {
        const g = new THREE.ExtrudeGeometry(gon(5), { depth: 3, bevelEnabled: false });
        expect(g.index).toBeNull();
        expect(g.getAttribute('position').count).toBe(48);
    });

    it('no other polygon size produces 48 — the identification is specific, not a coincidence', () => {
        const counts = new Map<number, number>();
        for (let n = 3; n <= 12; n++) {
            counts.set(
                n,
                new THREE.ExtrudeGeometry(gon(n), { depth: 3, bevelEnabled: false })
                    .getAttribute('position').count,
            );
        }
        const at48 = [...counts.entries()].filter(([, c]) => c === 48).map(([n]) => n);
        expect(at48).toEqual([5]);
    });

    it('the room FLOOR fill is indexed — so it cannot be the reported non-indexed Draw', () => {
        expect(new THREE.ShapeGeometry(gon(5)).index).not.toBeNull();
    });
});

describe('L-944(a) — RoomBoundaryBuilder: detach on the mutation tick, release at the frame boundary', () => {
    beforeEach(() => { drainGpuReleaseQueue(); });
    afterEach(() => { drainGpuReleaseQueue(); });

    it('removeRoom disposes NOTHING on the mutation tick', () => {
        const { scene, builder } = armBuilder();
        const s = seedRoom(scene, builder, 'r1');

        builder.removeRoom('r1');

        expect(s.floorGeoDispose).not.toHaveBeenCalled();
        expect(s.volGeoDispose).not.toHaveBeenCalled();
        expect(s.floorMatDispose).not.toHaveBeenCalled();
        expect(s.volMatDispose).not.toHaveBeenCalled();
        expect(pendingGpuReleaseCount()).toBeGreaterThan(0);
    });

    it('the volume overlay is detached BEFORE its buffers are released (INVARIANT L2(a))', () => {
        const { scene, builder } = armBuilder();
        const s = seedRoom(scene, builder, 'r1');

        let reachableAtRelease: boolean | null = null;
        s.volGeoDispose.mockImplementation(() => {
            reachableAtRelease = scene.children.includes(s.volume);
        });

        builder.removeRoom('r1');
        drainGpuReleaseQueue();

        expect(s.volGeoDispose).toHaveBeenCalledTimes(1);
        expect(reachableAtRelease).toBe(false);
    });

    it('the frame-boundary drain releases floor AND volume, geometry AND material, exactly once', () => {
        const { scene, builder } = armBuilder();
        const s = seedRoom(scene, builder, 'r1');

        builder.removeRoom('r1');
        drainGpuReleaseQueue();

        expect(s.floorGeoDispose).toHaveBeenCalledTimes(1);
        expect(s.floorMatDispose).toHaveBeenCalledTimes(1);
        expect(s.volGeoDispose).toHaveBeenCalledTimes(1);
        expect(s.volMatDispose).toHaveBeenCalledTimes(1);
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('removeRoom of an unknown id is a no-op — no phantom queue growth', () => {
        const { scene, builder } = armBuilder();
        seedRoom(scene, builder, 'r1');
        builder.removeRoom('nope');
        expect(pendingGpuReleaseCount()).toBe(0);
    });

    it('the maps are cleared on the mutation tick even though the release is deferred', () => {
        const { scene, builder } = armBuilder();
        seedRoom(scene, builder, 'r1');
        const priv = builder as unknown as {
            meshes: Map<string, THREE.Mesh>;
            _volumeMeshes: Map<string, THREE.Mesh>;
        };

        builder.removeRoom('r1');

        expect(priv.meshes.has('r1')).toBe(false);
        expect(priv._volumeMeshes.has('r1')).toBe(false);
    });
});
