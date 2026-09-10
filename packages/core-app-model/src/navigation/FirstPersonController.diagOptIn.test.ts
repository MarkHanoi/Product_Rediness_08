/**
 * @vitest-environment happy-dom
 *
 * §WALK-DIAG-IS-OPT-IN — per-tick and per-key walk diagnostics are silent in
 * production and speak only behind `window.__pryzmDebugWalk`.
 *
 * FOUNDER'S CAPTURE, 2026-09-10: `[FPC tick] keys F=true … dt=0.100` /
 * `dt=0.049` streaming for the whole walk, plus `[FPC] key down: KeyW` on every
 * press. Each is a template-string interpolation and a console write, paid on
 * the frame bus in production, for nobody.
 *
 * The gate is the repo's existing per-subsystem opt-in idiom — the wall pipeline's
 * `__pryzmDebugWalls` — not a new mechanism. Lifecycle logs (activate, eye seed,
 * level change, deactivate) are one-shot and are deliberately NOT gated; the arms
 * below assert that too, so a future "quiet everything" cannot silently take the
 * founder's diagnostic breadcrumbs with it.
 *
 * ⛔ WHAT THESE ARMS DRIVE. The tick is invoked through the callback the
 * controller registers on the frame bus (captured by spying on
 * `unifiedFrameLoop.addTickListener`) — the bus calling the listener is exactly
 * the production path. Keys arrive as real `keydown` events on `window`.
 *
 * ⭐ SCRAMBLE CONTROL (L-586): deleting `&& walkDiagOn()` from the tick log
 * reddens "silent by default: no [FPC tick]"; deleting it from the key log
 * reddens "silent by default: no [FPC] key down". Verified by hand before commit.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { FirstPersonController } from './FirstPersonController.js';
import { unifiedFrameLoop } from '../rendering/UnifiedFrameLoop';

type Flagged = Window & { __pryzmDebugWalk?: boolean };
type TickCb = (deltaMs: number, timestamp: number) => void;

function makeController() {
    const camera   = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
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

    let tick: TickCb | null = null;
    const spy = vi.spyOn(unifiedFrameLoop, 'addTickListener').mockImplementation((l) => {
        tick = l.callback as TickCb;
        return () => { tick = null; };
    });

    const fpc = new FirstPersonController(
        { three: camera, controls, projection: { set: () => Promise.resolve() } } as never,
        dom,
        new THREE.Scene(),
    );
    return { fpc, dom, tick: () => tick, spy };
}

const pressW = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));
const releaseW = () => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true, cancelable: true }));

function collectLogs(): { lines: string[]; stop: () => void } {
    const lines: string[] = [];
    const s = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
    });
    return { lines, stop: () => s.mockRestore() };
}

describe('§WALK-DIAG-IS-OPT-IN', () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
        cleanups.splice(0).forEach(fn => { try { fn(); } catch { /* ignore */ } });
        (window as Flagged).__pryzmDebugWalk = undefined;
        vi.restoreAllMocks();
    });

    it('silent by default: no [FPC tick] on the frame bus while walking', async () => {
        (window as Flagged).__pryzmDebugWalk = undefined;
        const { fpc, dom, tick } = makeController();
        cleanups.push(() => { releaseW(); fpc.deactivate(); dom.remove(); });
        await fpc.activate();
        expect(tick()).not.toBeNull();

        const { lines, stop } = collectLogs();
        pressW();
        // Well past the 500 ms throttle, so an ungated log WOULD fire.
        for (let i = 0; i < 20; i++) tick()!(100, performance.now() + i * 100);
        stop();

        expect(lines.filter(l => l.includes('[FPC tick]'))).toHaveLength(0);
    });

    it('silent by default: no [FPC] key down on a key press', async () => {
        (window as Flagged).__pryzmDebugWalk = undefined;
        const { fpc, dom } = makeController();
        cleanups.push(() => { releaseW(); fpc.deactivate(); dom.remove(); });
        await fpc.activate();

        const { lines, stop } = collectLogs();
        pressW();
        stop();

        expect(lines.filter(l => l.includes('[FPC] key down'))).toHaveLength(0);
    });

    it('speaks when opted in: __pryzmDebugWalk = true restores both diagnostics', async () => {
        (window as Flagged).__pryzmDebugWalk = true;
        const { fpc, dom, tick } = makeController();
        cleanups.push(() => { releaseW(); fpc.deactivate(); dom.remove(); });
        await fpc.activate();

        const { lines, stop } = collectLogs();
        pressW();
        for (let i = 0; i < 20; i++) tick()!(100, performance.now() + i * 100);
        stop();

        expect(lines.some(l => l.includes('[FPC] key down: KeyW'))).toBe(true);
        expect(lines.some(l => l.includes('[FPC tick]'))).toBe(true);
    });

    it('the one-shot lifecycle breadcrumbs are NOT gated — the founder keeps his entry/exit lines', async () => {
        (window as Flagged).__pryzmDebugWalk = undefined;
        const { fpc, dom } = makeController();
        cleanups.push(() => { dom.remove(); });

        const { lines, stop } = collectLogs();
        await fpc.activate();
        fpc.deactivate();
        stop();

        expect(lines.some(l => l.includes('[FPC] Walk mode activating'))).toBe(true);
        expect(lines.some(l => l.includes('[FPC] Eye seeded at'))).toBe(true);
        expect(lines.some(l => l.includes('[FPC] Walk mode inactive'))).toBe(true);
    });
});
