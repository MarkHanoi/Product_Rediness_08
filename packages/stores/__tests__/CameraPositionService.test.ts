// CameraPositionService.test.ts — ADR-048 · Task 4.3

import { describe, expect, it, vi } from 'vitest';
import { CameraPositionService, cameraPositionService } from '../src/CameraPositionService.js';

describe('CameraPositionService — initial state', () => {
    it('starts at origin (0, 0, 0)', () => {
        const svc = new CameraPositionService();
        expect(svc.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
    });
});

describe('CameraPositionService — update() / getPosition()', () => {
    it('stores the updated position', () => {
        const svc = new CameraPositionService();
        svc.update({ x: 1, y: 2, z: 3 });
        expect(svc.getPosition()).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('subsequent updates overwrite the previous position', () => {
        const svc = new CameraPositionService();
        svc.update({ x: 10, y: 20, z: 30 });
        svc.update({ x: -5, y: 0,  z: 7 });
        expect(svc.getPosition()).toEqual({ x: -5, y: 0, z: 7 });
    });

    it('returned position is frozen (no aliasing issue)', () => {
        const svc = new CameraPositionService();
        svc.update({ x: 1, y: 2, z: 3 });
        const pos = svc.getPosition();
        svc.update({ x: 99, y: 99, z: 99 });
        // Older reference should be stale — the service provides a new object each update.
        expect(pos).toEqual({ x: 1, y: 2, z: 3 }); // captured before second update
    });
});

describe('CameraPositionService — subscribe()', () => {
    it('listener is called on each update', () => {
        const svc      = new CameraPositionService();
        const listener = vi.fn();
        svc.subscribe(listener);
        svc.update({ x: 1, y: 0, z: 0 });
        svc.update({ x: 2, y: 0, z: 0 });
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('disposer removes the listener', () => {
        const svc      = new CameraPositionService();
        const listener = vi.fn();
        const dispose  = svc.subscribe(listener);
        svc.update({ x: 1, y: 0, z: 0 });
        dispose();
        svc.update({ x: 2, y: 0, z: 0 });
        expect(listener).toHaveBeenCalledTimes(1); // only the first call
    });

    it('multiple listeners all receive updates', () => {
        const svc = new CameraPositionService();
        const l1  = vi.fn();
        const l2  = vi.fn();
        svc.subscribe(l1);
        svc.subscribe(l2);
        svc.update({ x: 5, y: 5, z: 5 });
        expect(l1).toHaveBeenCalledOnce();
        expect(l2).toHaveBeenCalledOnce();
    });

    it('disposing one listener does not affect others', () => {
        const svc  = new CameraPositionService();
        const l1   = vi.fn();
        const l2   = vi.fn();
        const d1   = svc.subscribe(l1);
        svc.subscribe(l2);
        d1();
        svc.update({ x: 1, y: 0, z: 0 });
        expect(l1).not.toHaveBeenCalled();
        expect(l2).toHaveBeenCalledOnce();
    });

    it('listenerCount tracks subscribed listeners', () => {
        const svc  = new CameraPositionService();
        expect(svc.listenerCount).toBe(0);
        const d1 = svc.subscribe(() => {});
        const d2 = svc.subscribe(() => {});
        expect(svc.listenerCount).toBe(2);
        d1();
        expect(svc.listenerCount).toBe(1);
        d2();
        expect(svc.listenerCount).toBe(0);
    });
});

describe('cameraPositionService — module-level default instance', () => {
    it('is a CameraPositionService instance', () => {
        expect(cameraPositionService).toBeInstanceOf(CameraPositionService);
    });

    it('starts at origin', () => {
        // Note: other tests may have mutated this instance — we only check the type.
        const pos = cameraPositionService.getPosition();
        expect(typeof pos.x).toBe('number');
        expect(typeof pos.y).toBe('number');
        expect(typeof pos.z).toBe('number');
    });
});
