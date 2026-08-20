// @vitest-environment happy-dom
/**
 * §MULTI-SELECT-SHIFT (L-1550) — SHIFT+click multi-selection on the 3-D viewport.
 *
 * TWO defects are pinned here, and the second is the one that made the first
 * dangerous to build on:
 *
 *  1. A SHIFT+click on the 3-D viewport REPLACED the selection. The set model
 *     already existed (`selectionBus.selectMany` / `currentIds`) but its only
 *     producer was `MarqueeSelectionTool` (SHIFT+DRAG); a SHIFT+CLICK reached
 *     `performSelection` and was handled as an ordinary click.
 *
 *  2. A PLAIN 3-D click never wrote into `selectionBus` AT ALL. The bus is the
 *     documented C27 §4 authority — `PlanViewCanvas`, `AIPanel` and
 *     `ZeroTokenChatBridge` read `currentIds` as THE selected set — and after a
 *     3-D click it still reported the PREVIOUS selection. The viewport and the
 *     plan view genuinely disagreed, in the direction hardest to notice: the 3-D
 *     highlight, the thing the user is looking at, was the one that was right.
 *
 * The click is driven through `performSelection` (not `select`) via the
 * hover-anchor fast path, because the modifier is latched in `performSelection`
 * and consumed in `select` — testing `select` alone would prove nothing about
 * whether a real click reaches it with the modifier intact.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { selectionBus } from '@pryzm/core-app-model';
import { SelectionManager } from '../src/SelectionManager.js';

function makeManager(scene: THREE.Scene): SelectionManager {
    const threeRenderer = {
        domElement: { clientWidth: 100, clientHeight: 100 },
        capabilities: { maxTextureSize: 4096 },
        getRenderTarget: () => null,
        setRenderTarget: () => {},
        render: () => {},
        readRenderTargetPixels: () => {},
    };
    const world = { scene: { three: scene }, renderer: { three: threeRenderer } };
    const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    cam.position.set(0, 0, 10);
    const dom = {
        style: {},
        addEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    };
    const tc = { attach: vi.fn(), detach: vi.fn(), addEventListener: vi.fn() };
    return new SelectionManager(
        world as never, { three: cam } as never, dom as never, tc as never, () => {},
    );
}

function makeWall(id: string, x: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    m.position.set(x, 0, 0);
    m.userData.id = id;
    m.userData.elementType = 'wall';
    m.userData.selectable = true;
    return m;
}

/**
 * Simulate a click that lands on `target` via the hover-anchor fast path — the
 * path a real click takes whenever the GPU hover has already confirmed a hit
 * under the cursor, which is the ordinary case at any normal pointer speed.
 */
function clickOn(
    mgr: SelectionManager,
    target: THREE.Object3D,
    opts: { shift?: boolean; instanceId?: string } = {},
): void {
    const m = mgr as unknown as {
        _lastHoveredObjectGpu: THREE.Object3D | null;
        _lastHoveredInstanceIdGpu: string | null;
        _lastHoverConfirmedClientX: number | null;
        _lastHoverConfirmedClientY: number | null;
        performSelection(e: unknown): void;
    };
    m._lastHoveredObjectGpu = target;
    m._lastHoveredInstanceIdGpu = opts.instanceId ?? null;
    m._lastHoverConfirmedClientX = 50;
    m._lastHoverConfirmedClientY = 50;
    m.performSelection({ clientX: 50, clientY: 50, button: 0, shiftKey: opts.shift === true });
}

let scene: THREE.Scene;
let mgr: SelectionManager;

beforeEach(() => {
    selectionBus.clear();
    selectionBus.setSelectionManager(null);
    scene = new THREE.Scene();
    mgr = makeManager(scene);
});

describe('a PLAIN 3-D click is mirrored into the SelectionBus', () => {
    it('leaves the bus holding exactly the clicked element', () => {
        const a = makeWall('wall-a', 0);
        scene.add(a);
        clickOn(mgr, a);
        expect(selectionBus.currentIds).toEqual(['wall-a']);
        expect(selectionBus.currentId).toBe('wall-a');
    });

    it('REPLACES a previous set rather than adding to it', () => {
        const a = makeWall('wall-a', 0);
        const b = makeWall('wall-b', 3);
        scene.add(a, b);
        clickOn(mgr, a);
        clickOn(mgr, b, { shift: true });
        expect(selectionBus.currentIds).toEqual(['wall-a', 'wall-b']);

        clickOn(mgr, a);                 // plain click — no modifier
        expect(selectionBus.currentIds).toEqual(['wall-a']);
    });
});

describe('SHIFT+click adds, toggles out, and clears', () => {
    it('adds a second element to the set, and it becomes the primary', () => {
        const a = makeWall('wall-a', 0);
        const b = makeWall('wall-b', 3);
        scene.add(a, b);

        clickOn(mgr, a);
        clickOn(mgr, b, { shift: true });

        expect(selectionBus.currentIds).toEqual(['wall-a', 'wall-b']);
        expect(selectionBus.currentId).toBe('wall-b');
        expect(mgr.selectedObject).toBe(b);
    });

    it('builds a set of three across repeated SHIFT+clicks', () => {
        const els = ['a', 'b', 'c'].map((n, i) => makeWall(`wall-${n}`, i * 3));
        for (const e of els) scene.add(e);

        clickOn(mgr, els[0]!);
        clickOn(mgr, els[1]!, { shift: true });
        clickOn(mgr, els[2]!, { shift: true });
        expect(selectionBus.currentIds).toEqual(['wall-a', 'wall-b', 'wall-c']);
    });

    it('SHIFT+click on an ALREADY-SELECTED element removes it', () => {
        const a = makeWall('wall-a', 0);
        const b = makeWall('wall-b', 3);
        scene.add(a, b);

        clickOn(mgr, a);
        clickOn(mgr, b, { shift: true });
        expect(selectionBus.currentIds).toEqual(['wall-a', 'wall-b']);

        clickOn(mgr, b, { shift: true });
        expect(selectionBus.currentIds).toEqual(['wall-a']);
    });

    it('SHIFT+click removing the LAST member clears the selection', () => {
        const a = makeWall('wall-a', 0);
        scene.add(a);
        clickOn(mgr, a);
        clickOn(mgr, a, { shift: true });
        expect(selectionBus.currentIds).toEqual([]);
        expect(selectionBus.currentId).toBeNull();
    });

    it('the modifier does NOT leak into the next click', () => {
        const a = makeWall('wall-a', 0);
        const b = makeWall('wall-b', 3);
        const c = makeWall('wall-c', 6);
        scene.add(a, b, c);

        clickOn(mgr, a);
        clickOn(mgr, b, { shift: true });
        clickOn(mgr, c);                          // plain — latch must be clear
        expect(selectionBus.currentIds).toEqual(['wall-c']);
    });
});

describe('a bus-driven selection is not collapsed by the 3-D mirror', () => {
    it('a plan-view multi-selection survives reaching the SelectionManager', () => {
        const a = makeWall('wall-a', 0);
        const b = makeWall('wall-b', 3);
        scene.add(a, b);
        selectionBus.setSelectionManager(mgr as never);

        // What PlanViewInteraction does on a shift+click in the plan pane.
        selectionBus.select('wall-a', 'plan-view');
        selectionBus.toggle('wall-b', 'plan-view');

        // The bus reached selectById → select(), which mirrors back as '3d-canvas'.
        // Without the `isDispatching` guard that echo replaced the set with one id.
        expect(selectionBus.currentIds).toEqual(['wall-a', 'wall-b']);
    });
});

describe('an unresolvable pick is not added to the set', () => {
    it('a synthetic instanced-group handle falls through to a plain select', () => {
        // The group mesh's own userData.id is the synthetic hosting handle, which
        // names no store row. Adding it would build a set every command refuses.
        const im = new THREE.InstancedMesh(
            new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2,
        );
        im.count = 2;
        im.userData.id = 'instanced-group-abc';
        im.userData.isInstancedGroup = true;
        im.userData.elementType = 'wall';
        im.userData.getInstanceElementId = (s: number) => ['w0', 'w1'][s];
        scene.add(im);

        const a = makeWall('wall-a', 5);
        scene.add(a);

        clickOn(mgr, a);
        clickOn(mgr, im, { shift: true });          // no per-instance id resolved
        expect(selectionBus.currentIds).not.toContain('instanced-group-abc');
        // …and it does not leave the PREVIOUS selection standing either: a surface
        // reading the bus would otherwise report wall-a as selected while the
        // viewport highlights the instanced group.
        expect(selectionBus.currentIds).toEqual([]);
        // The viewport still shows the user what they clicked.
        expect(mgr.selectedObject).toBe(im);
    });

    it('an instanced element WITH a resolved per-instance id IS added', () => {
        const im = new THREE.InstancedMesh(
            new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2,
        );
        im.count = 2;
        im.userData.id = 'instanced-group-abc';
        im.userData.isInstancedGroup = true;
        im.userData.elementType = 'wall';
        im.userData.getInstanceElementId = (s: number) => ['w0', 'w1'][s];
        scene.add(im);

        const a = makeWall('wall-a', 5);
        scene.add(a);

        clickOn(mgr, a);
        clickOn(mgr, im, { shift: true, instanceId: 'w1' });
        expect(selectionBus.currentIds).toEqual(['wall-a', 'w1']);
    });
});
