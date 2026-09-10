/**
 * §WALK-CAMERA-FOLLOWS-THE-LEVEL — the walk camera adopts the storey the plan
 * pane has already adopted.
 *
 * The founder's report: in split view, walking on Ground, he switches to
 * "Level 1 +5.000 m".  The plan pane retargets (correct), the 3-D walk camera
 * does not — `[FPC tick]` keeps printing `intPos=(…, 1.70, …)` on a storey
 * whose slab is at 5.00.  The two halves of split view then show different
 * buildings.
 *
 * These arms drive the PRODUCT SURFACE, not the handler: they dispatch the real
 * `activeLevelChanged` window CustomEvent that `ProjectContext.emit()` fires,
 * and they assert on the real `THREE.Camera` the controller writes.  Nothing
 * here calls the private handler, so an arm cannot pass by talking to a method
 * the running app never reaches.
 *
 * SCRAMBLE CONTROL (L-586): deleting the
 * `window.addEventListener('activeLevelChanged', …)` line from `activate()`
 * turns "adopts the new storey" and "preserves the fly-up offset" RED; deleting
 * the `removeEventListener` in `deactivate()` turns "stops following once walk
 * mode exits" RED.  Verified by hand before commit.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { FirstPersonController } from './FirstPersonController.js';

const EYE = 1.7;

interface FakeLevel { id: string; elevation: number; }

/** A camera-controls stand-in: records setLookAt, never smooths. */
function makeFakeControls() {
    return {
        enabled: true,
        setLookAt: vi.fn(() => Promise.resolve()),
        getTarget: (v: THREE.Vector3) => v,
        update: vi.fn(),
    };
}

function makeController(levels: FakeLevel[], activeLevelId: string) {
    const camera   = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(10, 40, 20);
    const controls = makeFakeControls();

    (window as unknown as { bimManager: unknown }).bimManager = {
        getLevelById: (id: string) => levels.find(l => l.id === id),
        getLevels:    () => levels,
    };
    (window as unknown as { projectContext: unknown }).projectContext = { activeLevelId };

    const obcCamera = {
        three:    camera,
        controls,
        projection: { set: () => Promise.resolve() },
    };

    const dom = document.createElement('div');
    document.body.appendChild(dom);

    const fpc = new FirstPersonController(
        obcCamera as never,
        dom,
        new THREE.Scene(),
    );
    return { fpc, camera, controls, dom };
}

/** The real signal: exactly what ProjectContext.emit() dispatches. */
function switchLevel(levelId: string): void {
    window.dispatchEvent(new CustomEvent('activeLevelChanged', { detail: { levelId } }));
}

const LEVELS: FakeLevel[] = [
    { id: 'L0', elevation: 0 },
    { id: 'L1', elevation: 5 },
    { id: 'L2', elevation: 9.4 },
];

describe('§WALK-CAMERA-FOLLOWS-THE-LEVEL', () => {
    let cleanup: Array<() => void> = [];

    beforeEach(() => { cleanup = []; });
    afterEach(() => {
        cleanup.forEach(fn => { try { fn(); } catch { /* ignore */ } });
        vi.restoreAllMocks();
    });

    it('seeds the eye on the ACTIVE level at entry (the pre-existing rule this builds on)', async () => {
        const { fpc, camera, dom } = makeController(LEVELS, 'L1');
        cleanup.push(() => { fpc.deactivate(); dom.remove(); });

        await fpc.activate();

        expect(camera.position.y).toBeCloseTo(5 + EYE, 5);
    });

    it('adopts the new storey when the active level changes mid-walk', async () => {
        const { fpc, camera, dom } = makeController(LEVELS, 'L0');
        cleanup.push(() => { fpc.deactivate(); dom.remove(); });

        await fpc.activate();
        expect(camera.position.y).toBeCloseTo(0 + EYE, 5);

        switchLevel('L1');

        // The founder's defect was Y staying at 1.70 on a 5.00 m storey.
        expect(camera.position.y).toBeCloseTo(5 + EYE, 5);
    });

    it('keeps him over the same point in plan — only Y moves', async () => {
        const { fpc, camera, dom } = makeController(LEVELS, 'L0');
        cleanup.push(() => { fpc.deactivate(); dom.remove(); });

        await fpc.activate();
        const { x, z } = camera.position;

        switchLevel('L2');

        expect(camera.position.x).toBeCloseTo(x, 6);
        expect(camera.position.z).toBeCloseTo(z, 6);
        expect(camera.position.y).toBeCloseTo(9.4 + EYE, 5);
    });

    it('never lands inside the new slab — the arrival is at least eye height above it', async () => {
        const { fpc, camera, dom } = makeController(LEVELS, 'L2');
        cleanup.push(() => { fpc.deactivate(); dom.remove(); });

        await fpc.activate();          // seeded at 9.4 + 1.7 = 11.1
        switchLevel('L0');             // descending three storeys

        expect(camera.position.y).toBeGreaterThanOrEqual(0 + EYE - 1e-6);
        expect(camera.position.y).toBeCloseTo(0 + EYE, 5);
    });

    it('does not move at all when the level id cannot be resolved (null is not 0)', async () => {
        const { fpc, camera, dom } = makeController(LEVELS, 'L1');
        cleanup.push(() => { fpc.deactivate(); dom.remove(); });

        await fpc.activate();
        const before = camera.position.y;

        switchLevel('L-does-not-exist');

        // An unresolvable lookup must NOT be reported as "ground floor, y=0".
        expect(camera.position.y).toBeCloseTo(before, 6);
    });

    it('stops following once walk mode exits — no leaked listener', async () => {
        const { fpc, camera, dom } = makeController(LEVELS, 'L0');
        cleanup.push(() => { dom.remove(); });

        await fpc.activate();
        fpc.deactivate();

        const after = camera.position.y;
        switchLevel('L2');

        expect(camera.position.y).toBeCloseTo(after, 6);
    });

    it('ignores the event entirely before walk mode is ever activated', () => {
        const { fpc, camera, dom } = makeController(LEVELS, 'L0');
        cleanup.push(() => { dom.remove(); });

        const before = camera.position.y;      // 40 — the orbit pose
        switchLevel('L1');

        expect(fpc.active).toBe(false);
        expect(camera.position.y).toBeCloseTo(before, 6);
    });
});
