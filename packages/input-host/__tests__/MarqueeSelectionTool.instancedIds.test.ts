// @vitest-environment happy-dom
/**
 * §MULTI-SELECT-SHIFT (L-1551) — a marquee over instanced elements must return
 * REAL element ids, one per instance.
 *
 * THE DEFECT THIS PINS. `SelectionManager.getSelectableCache()` deliberately
 * includes `InstancedElementRenderer` group meshes (BUG-04, so the BVH raycaster
 * can hit them and resolve `hit.instanceId`), and the group mesh's `userData.id`
 * is the SYNTHETIC `instanced-group-<key>` handle. `_collectHits` read that field
 * directly, so a rubber-band over a row of plain walls returned
 * `['instanced-group-…']`: truthy, so nothing guarded against it, but naming no
 * store row. That is §FIX-SELECTION-PAYLOAD-INSTANCED-ID (L-813) all over again —
 * fixed for the CLICK path, left standing in the marquee.
 *
 * It failed in BOTH directions at once:
 *   • ONE id stood in for the whole group, so every command against the
 *     "selection" refused, while the UI showed a selection.
 *   • the test used the GROUP's union AABB, which for a level's worth of walls
 *     spans the whole storey — a small rectangle in one corner "selected" all of
 *     them, and a rectangle around ONE wall selected all of them too.
 *
 * This matters for the founder's SHIFT+click ask because SHIFT+drag (marquee) and
 * SHIFT+click now feed the SAME set, and `element.deleteBatch` consumes it: a
 * poisoned member is a delete that refuses for a reason the founder cannot see.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MarqueeSelectionTool } from '../src/MarqueeSelectionTool.js';

/**
 * Two unit boxes at x = -4 and x = +4, as ONE instanced group carrying the
 * synthetic handle plus a real per-slot id table — the exact shape
 * `InstancedElementRenderer` produces.
 */
function makeInstancedGroup(): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2,
    );
    im.count = 2;
    im.userData.id = 'instanced-group-wall|L0';
    im.userData.isInstancedGroup = true;
    im.userData.elementType = 'wall';
    im.userData.getOccupiedInstanceSlots = () => [0, 1];
    im.userData.getInstanceElementId = (s: number) => ['wall-left', 'wall-right'][s];
    const m = new THREE.Matrix4();
    m.setPosition(-4, 0, 0); im.setMatrixAt(0, m);
    m.setPosition(4, 0, 0);  im.setMatrixAt(1, m);
    im.updateMatrixWorld(true);
    return im;
}

const CANVAS_W = 200;
const CANVAS_H = 200;

function makeTool(cache: THREE.Object3D[]): {
    tool: MarqueeSelectionTool;
    camera: THREE.Camera;
} {
    const dom = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: CANVAS_W, height: CANVAS_H }),
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
    } as unknown as HTMLElement;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const selection = { getSelectableCache: () => cache } as never;
    const tool = new MarqueeSelectionTool({ domElement: dom, camera, selection });
    return { tool, camera };
}

/** Screen-x of a world point, in the same pixel space `_collectHits` uses. */
function screenX(camera: THREE.Camera, x: number): number {
    const v = new THREE.Vector3(x, 0, 0).project(camera);
    return (v.x * 0.5 + 0.5) * CANVAS_W;
}

function collect(
    tool: MarqueeSelectionTool,
    start: { x: number; y: number },
    end: { x: number; y: number },
    windowMode: boolean,
): string[] {
    return (tool as unknown as {
        _collectHits(a: { x: number; y: number }, b: { x: number; y: number }, w: boolean): string[];
    })._collectHits(start, end, windowMode);
}

let im: THREE.InstancedMesh;

beforeEach(() => {
    im = makeInstancedGroup();
});

describe('an instanced group expands to its members', () => {
    it('a crossing marquee over BOTH instances returns both REAL ids', () => {
        const { tool } = makeTool([im]);
        const hits = collect(tool, { x: 0, y: 0 }, { x: CANVAS_W, y: CANVAS_H }, /* window */ false);
        expect(hits.sort()).toEqual(['wall-left', 'wall-right']);
    });

    it('never returns the synthetic instanced-group handle', () => {
        const { tool } = makeTool([im]);
        const hits = collect(tool, { x: 0, y: 0 }, { x: CANVAS_W, y: CANVAS_H }, false);
        for (const h of hits) expect(h.startsWith('instanced-group-')).toBe(false);
    });

    it('a marquee around ONE instance selects ONLY that instance', () => {
        const { tool, camera } = makeTool([im]);
        const leftSx = screenX(camera, -4);
        const midSx  = screenX(camera, 0);
        // A rectangle covering the left half only. Pre-L-1551 the group's union AABB
        // spanned both instances, so this returned the whole group as one bogus id.
        const hits = collect(
            tool,
            { x: Math.max(0, leftSx - 30), y: 0 },
            { x: midSx, y: CANVAS_H },
            /* window */ false,
        );
        expect(hits).toEqual(['wall-left']);
    });

    it('a group with NO slot table is skipped, not reported as one element', () => {
        const bare = new THREE.InstancedMesh(
            new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 1,
        );
        bare.userData.id = 'instanced-group-bare';
        bare.userData.isInstancedGroup = true;
        const { tool } = makeTool([bare]);
        const hits = collect(tool, { x: 0, y: 0 }, { x: CANVAS_W, y: CANVAS_H }, false);
        expect(hits).toEqual([]);
    });
});

describe('ordinary (non-instanced) objects are unchanged', () => {
    it('a plain mesh inside the rect is returned by its own id', () => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        mesh.userData.id = 'slab-1';
        mesh.updateMatrixWorld(true);
        const { tool } = makeTool([mesh]);
        const hits = collect(tool, { x: 0, y: 0 }, { x: CANVAS_W, y: CANVAS_H }, /* window */ true);
        expect(hits).toEqual(['slab-1']);
    });
});
