/**
 * §EDGE131 (L-12100) — the floor-finish edge overlay must obey the ONE edge
 * visibility authority, exactly as walls and structural slabs already do.
 *
 * THE FOUNDER'S REPORT: *"Can you in this view exclude the black lines that comes
 * over and over again from the floor finishes?"* — said of the 3-D Author view,
 * whose screenshot showed a heavy jagged outline repeating over EVERY storey.
 *
 * THE ATTRIBUTION HELD, and the mechanism is a MISSING REGISTRATION, not a stray
 * `visible = true`. `WallEdgeVisibilityService` matches an overlay on
 * `role === 'edges'` **AND** a known `elementType`. `FloorPanelBuilder` stamped
 * `{ floorId, role: 'edges' }` and no `elementType`, so it matched NO arm of the
 * authority: entering 3-D never hid it, entering plan never restyled it, and it
 * kept the `visible = true` a fresh THREE.LineSegments is born with. Once per
 * floor, once per storey. `CeilingPanelBuilder` had the identical gap.
 *
 * These tests assert the CONVENTION across the family rather than one flag:
 *   • the two repaired families are born hidden AND registered (3-D requirement);
 *   • a plan render-mode switch still reaches them and still yields black,
 *     always-on-top linework (the PLAN requirement — a fix that killed plan
 *     linework would be a regression, not a fix);
 *   • a CONTROL from a family that was already correct — the real
 *     `buildWallEdgeOverlay` from `@pryzm/geometry-wall` — behaves identically,
 *     so the suite proves uniformity rather than pinning a single builder;
 *   • an untagged line is still ignored, so the widened matcher did not become
 *     a catch-all that would swallow parcel rings or projection linework.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildWallEdgeOverlay } from '@pryzm/geometry-wall';
import type { FloorData } from '@pryzm/core-app-model/stores';
import type { CeilingVertex } from '@pryzm/core-app-model/stores';
import { FloorPanelBuilder } from '../src/floor/FloorPanelBuilder';
import { CeilingPanelBuilder } from '../src/ceiling/CeilingPanelBuilder';
import {
    SLAB_EDGE_MODE_SETTINGS,
    SLAB_FAMILY_EDGE_TYPES,
    applySlabEdgeRenderMode,
    isSlabFamilyEdge,
} from '../src/SlabFragmentBuilder';

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

const RECT: Array<{ x: number; z: number }> = [
    { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
];

function makeFloor(id: string): FloorData {
    return {
        id,
        levelId: 'level-1',
        boundary: { polygon: RECT, baseOffset: 0, thickness: 0.05 },
        serviceHoles: [],
        finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
        visible: true,
    } as unknown as FloorData;
}

/** The floor's perimeter overlay, located the way the authority locates it. */
function edgeOverlayUnder(root: THREE.Object3D): THREE.LineSegments {
    const found: THREE.Object3D[] = [];
    root.traverse(o => { if (o.userData?.role === 'edges') found.push(o); });
    expect(found).toHaveLength(1);
    return found[0] as THREE.LineSegments;
}

function buildFloorEdge(id: string): THREE.LineSegments {
    const scene = new THREE.Scene();
    const builder = new FloorPanelBuilder(scene, stubBim);
    builder.buildFloor(makeFloor(id));
    return edgeOverlayUnder(builder.getRootById(id)!);
}

/**
 * The ceiling's public `buildCeiling()` defers through the FrameScheduler drain
 * (C11 §2 step 3), so — exactly as `CeilingPanelBuilderGpuLifetime.test.ts` does —
 * this suite drives the seam under repair directly rather than pumping frames.
 */
function buildCeilingEdge(): THREE.LineSegments {
    const scene = new THREE.Scene();
    const builder = new CeilingPanelBuilder(scene);
    const root = new THREE.Group();
    root.userData = { id: 'CL-1' };
    (builder as unknown as {
        _buildEdgeOverlay: (p: CeilingVertex[], h: unknown[], y: number, r: THREE.Group) => void;
    })._buildEdgeOverlay(RECT as unknown as CeilingVertex[], [], 2.7, root);
    return edgeOverlayUnder(root);
}

/** The CONTROL: a family that already obeyed the authority before L-12100. */
function buildControlWallEdge(): THREE.LineSegments {
    return buildWallEdgeOverlay(new THREE.BoxGeometry(1, 1, 1), 'W-1') as THREE.LineSegments;
}

describe('§EDGE131 — floor-finish edges are REGISTERED with the edge-visibility authority', () => {
    it('the floor overlay carries an elementType the authority recognises', () => {
        const edge = buildFloorEdge('fl-reg');
        expect(edge.userData.elementType).toBe('FloorEdges');
        expect(edge.userData.role).toBe('edges');
        // Registration is what the authority actually tests — assert THAT, not
        // just the string, so renaming the type without updating the roster fails.
        expect(isSlabFamilyEdge(edge)).toBe(true);
    });

    it('the ceiling overlay — the sibling with the identical gap — is registered too', () => {
        const edge = buildCeilingEdge();
        expect(edge.userData.elementType).toBe('CeilingEdges');
        expect(isSlabFamilyEdge(edge)).toBe(true);
    });

    it('the roster names all three slab-family plate types, and nothing else', () => {
        expect([...SLAB_FAMILY_EDGE_TYPES]).toEqual(['SlabEdges', 'FloorEdges', 'CeilingEdges']);
    });

    it('the overlay is attributable — it no longer stamps an undefined element id', () => {
        // `_buildEdgeOverlay` runs BEFORE `root.userData` is assigned, so the old
        // `root.userData.id` read yielded `undefined` on every FIRST build.
        const edge = buildFloorEdge('fl-attrib');
        expect(edge.userData.floorId).toBe('fl-attrib');
        expect(edge.userData.parentId).toBe('fl-attrib');
        expect(edge.userData.selectable).toBe(false);
    });
});

describe('§EDGE131 — 3-D hides the overlay, and the CONVENTION is uniform', () => {
    it('a floor finish is born HIDDEN, exactly like the wall control', () => {
        expect(buildFloorEdge('fl-hidden').visible).toBe(false);
        // Control — this family was already correct; if it ever regresses, the
        // suite must not be able to pass by pinning floors alone.
        expect(buildControlWallEdge().visible).toBe(false);
    });

    it('a ceiling is born HIDDEN too', () => {
        expect(buildCeilingEdge().visible).toBe(false);
    });

    it("a floor born in 3-D carries the '3d' material, not the plan material", () => {
        const edge = buildFloorEdge('fl-3d');
        const mat = edge.material as THREE.LineBasicMaterial;
        expect(mat.color.getHex()).toBe(SLAB_EDGE_MODE_SETTINGS['3d'].color);
        expect(mat.depthTest).toBe(SLAB_EDGE_MODE_SETTINGS['3d'].depthTest);
        expect(edge.renderOrder).toBe(SLAB_EDGE_MODE_SETTINGS['3d'].renderOrder);
        // The black + always-on-top pair IS the plan setting. Being born with it
        // in a 3-D context is the shape of the defect; pin that it is absent.
        expect(mat.color.getHex()).not.toBe(0x000000);
    });

    it('every floor built repeats the SAME hidden state — the per-storey repeat is gone', () => {
        const scene = new THREE.Scene();
        const builder = new FloorPanelBuilder(scene, stubBim);
        for (const id of ['L0', 'L1', 'L2', 'L3', 'L4']) builder.buildFloor(makeFloor(id));

        let visibleEdges = 0;
        scene.traverse(o => { if (isSlabFamilyEdge(o) && o.visible) visibleEdges++; });
        expect(visibleEdges).toBe(0);
    });
});

describe('§EDGE131 — PLAN still gets its linework (the half a bad fix would break)', () => {
    it("applyRenderMode('plan') reaches a floor overlay and yields black, on-top lines", () => {
        const edge = buildFloorEdge('fl-plan');
        applySlabEdgeRenderMode(edge, 'plan');

        const mat = edge.material as THREE.LineBasicMaterial;
        expect(mat.color.getHex()).toBe(0x000000);
        expect(mat.depthTest).toBe(false);
        expect(edge.renderOrder).toBe(999);
    });

    it('the ceiling overlay reaches plan mode as well', () => {
        const edge = buildCeilingEdge();
        applySlabEdgeRenderMode(edge, 'plan');
        expect((edge.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x000000);
        expect(edge.renderOrder).toBe(999);
    });

    it("plan → 3-D → plan round-trips, so a view switch is not one-way", () => {
        const edge = buildFloorEdge('fl-round');
        applySlabEdgeRenderMode(edge, 'plan');
        applySlabEdgeRenderMode(edge, '3d');
        expect((edge.material as THREE.LineBasicMaterial).color.getHex()).toBe(SLAB_EDGE_MODE_SETTINGS['3d'].color);
        applySlabEdgeRenderMode(edge, 'plan');
        expect((edge.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x000000);
    });

    it('each floor owns its material — restyling one does not restyle its neighbours', () => {
        const a = buildFloorEdge('fl-a');
        const b = buildFloorEdge('fl-b');
        applySlabEdgeRenderMode(a, 'plan');
        expect((b.material as THREE.LineBasicMaterial).color.getHex()).toBe(SLAB_EDGE_MODE_SETTINGS['3d'].color);
    });
});

describe('§EDGE131 — the widened matcher did NOT become a catch-all', () => {
    it('an untagged line is neither registered nor restyled', () => {
        const stray = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0x6600ff }),
        );
        expect(isSlabFamilyEdge(stray)).toBe(false);
        applySlabEdgeRenderMode(stray, 'plan');
        // The parcel ring is PRYZM purple on purpose (§L-426 wants it in 3-D).
        expect((stray.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x6600ff);
    });

    it("a node with role 'edges' but a foreign elementType is not claimed", () => {
        const foreign = new THREE.Object3D();
        foreign.userData = { role: 'edges', elementType: 'WallEdges' };
        expect(isSlabFamilyEdge(foreign)).toBe(false);
    });

    it('the floor TILE GRID is not an edge overlay and is left alone', () => {
        const scene = new THREE.Scene();
        const builder = new FloorPanelBuilder(scene, stubBim);
        const floor = makeFloor('fl-tiles');
        (floor as unknown as { finishSpec: { finishPattern: string } }).finishSpec.finishPattern = 'tile-600x600';
        builder.buildFloor(floor);

        let grids = 0;
        builder.getRootById('fl-tiles')!.traverse(o => {
            if (o.userData?.role === 'tile-grid') { grids++; expect(isSlabFamilyEdge(o)).toBe(false); }
        });
        expect(grids).toBe(1);
    });
});
