/**
 * @vitest-environment happy-dom
 *
 * §WALK-DISARMS-THE-GIZMO — walk mode disables the transform gizmo for its
 * duration, exactly as it already disables the orbit controls.
 *
 * FOUNDER'S CAPTURE, 2026-09-10 (split view, walking, pointer lock held):
 *   [FPC] Pointer lock acquired — full FPS mouse look active.
 *   … picks a Furniture element …
 *   Uncaught InvalidStateError: Failed to execute 'setPointerCapture' on
 *   'Element'   (vendor-three, twice)
 *
 * `vendor-three` is `node_modules/three/` and the only caller of
 * `setPointerCapture` that this app reaches inside it is
 * `TransformControls.onPointerDown`. Its guard reads `document.pointerLockElement`,
 * which Chrome reports as `null` while a lock is PENDING even though the browser
 * already refuses capture — so the guard passes and the call throws. And even
 * when the guard holds, `getPointer()` under lock returns NDC (0,0): every gizmo
 * interaction while walking operates at screen-centre regardless of the mouse.
 * The gizmo has no valid behaviour in walk mode at all; disabling it makes
 * `onPointerDown` return at its FIRST line, before the capture call.
 *
 * ⛔ WHAT THESE ARMS DRIVE. The reachability arm constructs the REAL three
 * `TransformControls` on the walk canvas, gives that canvas a `setPointerCapture`
 * that throws the way Chrome does, and dispatches a real `pointerdown` — the
 * exact event the founder's click produced. It does not stub the gizmo and it
 * does not call any FPC private. [[fake-more-capable-than-real]]: a fake gizmo
 * built from the header could not falsify the header.
 *
 * ⭐ SCRAMBLE CONTROL (L-586): deleting `this._setGizmoEnabled(false)` from
 * `activate()` reddens "disarmed on entry" AND "the real TransformControls no
 * longer throws"; deleting `this._restoreGizmoEnabled()` from `deactivate()`
 * reddens "restored on exit" and "a user who had it OFF keeps it OFF".
 * Verified by hand before commit.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { TransformControls } from '@pryzm/renderer-three';
import { FirstPersonController } from './FirstPersonController.js';

type WindowWithGizmo = Window & { transformControls?: { enabled?: boolean } | undefined };

function makeController() {
    const camera   = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(10, 40, 20);
    const controls = {
        enabled: true,
        setLookAt: vi.fn(() => Promise.resolve()),
        getTarget: (v: THREE.Vector3) => v,
        update: vi.fn(),
    };
    (window as unknown as { bimManager: unknown }).bimManager = {
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
        getLevels:    () => [{ id: 'L0', elevation: 0 }],
    };
    (window as unknown as { projectContext: unknown }).projectContext = { activeLevelId: 'L0' };

    const dom = document.createElement('div');
    document.body.appendChild(dom);

    const fpc = new FirstPersonController(
        { three: camera, controls, projection: { set: () => Promise.resolve() } } as never,
        dom,
        new THREE.Scene(),
    );
    return { fpc, camera, dom };
}

/** Chrome's behaviour with a pointer lock held or pending. */
function chromeLikeCapture(): never {
    throw new DOMException(
        "Failed to execute 'setPointerCapture' on 'Element': InvalidStateError",
        'InvalidStateError',
    );
}

describe('§WALK-DISARMS-THE-GIZMO', () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
        cleanups.splice(0).forEach(fn => { try { fn(); } catch { /* ignore */ } });
        (window as WindowWithGizmo).transformControls = undefined;
        vi.restoreAllMocks();
    });

    it('disarms the gizmo on entry, next to the orbit controls it already disarms', async () => {
        const gizmo = { enabled: true };
        (window as WindowWithGizmo).transformControls = gizmo;
        const { fpc, dom } = makeController();
        cleanups.push(() => { fpc.deactivate(); dom.remove(); });

        await fpc.activate();

        expect(gizmo.enabled).toBe(false);
    });

    it('restores the gizmo on exit', async () => {
        const gizmo = { enabled: true };
        (window as WindowWithGizmo).transformControls = gizmo;
        const { fpc, dom } = makeController();
        cleanups.push(() => { dom.remove(); });

        await fpc.activate();
        fpc.deactivate();

        expect(gizmo.enabled).toBe(true);
    });

    it('a user who had the gizmo OFF keeps it OFF after walking — restore means "as found"', async () => {
        const gizmo = { enabled: false };
        (window as WindowWithGizmo).transformControls = gizmo;
        const { fpc, dom } = makeController();
        cleanups.push(() => { dom.remove(); });

        await fpc.activate();
        expect(gizmo.enabled).toBe(false);
        fpc.deactivate();

        expect(gizmo.enabled).toBe(false);
    });

    it('tolerates the gizmo being absent — no throw, walk mode still enters', async () => {
        (window as WindowWithGizmo).transformControls = undefined;
        const { fpc, dom } = makeController();
        cleanups.push(() => { fpc.deactivate(); dom.remove(); });

        await expect(fpc.activate()).resolves.toBeUndefined();
        expect(fpc.active).toBe(true);
    });

    it('⭐ the REAL TransformControls no longer throws on pointerdown while walking', async () => {
        const { fpc, camera, dom } = makeController();
        cleanups.push(() => { dom.remove(); });

        // Chrome under a held/pending pointer lock.
        (dom as unknown as { setPointerCapture: () => void }).setPointerCapture = chromeLikeCapture;
        (dom as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => { /* no-op */ };

        const tc = new TransformControls(camera, dom);
        cleanups.push(() => tc.dispose());
        (window as WindowWithGizmo).transformControls = tc;

        // Prove the arm can fail: BEFORE walk mode, with the gizmo armed and no
        // `document.pointerLockElement` (happy-dom, like Chrome mid-request,
        // reports none), the real handler reaches the capture call and throws.
        const down = () => dom.dispatchEvent(new PointerEvent('pointerdown', {
            pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true, cancelable: true,
        }));
        const errorsBefore: unknown[] = [];
        const onErr = (e: ErrorEvent) => { errorsBefore.push(e.error ?? e.message); e.preventDefault(); };
        window.addEventListener('error', onErr);
        try { down(); } catch (e) { errorsBefore.push(e); }
        window.removeEventListener('error', onErr);
        expect(errorsBefore.length).toBeGreaterThan(0);   // the founder's throw, reproduced

        // Now enter walk mode: the same pointerdown must be inert.
        await fpc.activate();
        expect(tc.enabled).toBe(false);

        const errorsDuring: unknown[] = [];
        const onErr2 = (e: ErrorEvent) => { errorsDuring.push(e.error ?? e.message); e.preventDefault(); };
        window.addEventListener('error', onErr2);
        try { down(); } catch (e) { errorsDuring.push(e); }
        window.removeEventListener('error', onErr2);
        expect(errorsDuring).toHaveLength(0);

        fpc.deactivate();
        expect(tc.enabled).toBe(true);
    });
});
