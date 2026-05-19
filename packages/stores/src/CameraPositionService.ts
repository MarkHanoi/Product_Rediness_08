// CameraPositionService — ADR-048 · Task 4.3
//
// Holds the current camera world-space position as a plain { x, y, z } tuple
// so that `LRUElementMap` can score camera-distance eviction candidates WITHOUT
// importing from `packages/renderer/` or `three`.
//
// Design invariants:
//   P2 — No import from 'three' or '@pryzm/renderer-three/three'.
//         Exposes only plain Vec3Like = { x, y, z }.
//   P3 — No requestAnimationFrame usage.
//
// Wiring (engine layer, NOT this file):
//   The engine connects CameraController → CameraPositionService at startup:
//
//     import type { CameraController } from '@pryzm/renderer';
//     import { cameraPositionService } from '@pryzm/stores';
//
//     // Called each 'update' tick when the camera is dirty:
//     frameScheduler.schedule('update', () => {
//       const { position } = cameraController.snapshotPlain();
//       cameraPositionService.update(position);
//     });
//
// The service is intentionally NOT a singleton — callers construct it and
// pass it to LRUElementMap via the `cameraPosition` option.  A module-level
// default export is provided for the common single-camera use case.

// ---------------------------------------------------------------------------
// Public types (mirror of Vec3Like in packages/renderer/src/CameraController.ts
// without the THREE dependency)
// ---------------------------------------------------------------------------

/** Plain XYZ tuple — no THREE dependency.  Structurally compatible with
 *  CameraController.Vec3Like and THREE.Vector3. */
export interface Vec3Like {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Subscriber notified whenever the camera position changes. */
export type CameraPositionListener = () => void;

// ---------------------------------------------------------------------------
// CameraPositionService
// ---------------------------------------------------------------------------

/**
 * Holds the current camera world-space position for consumption by stores
 * that need spatial eviction (ADR-048).
 *
 * Thread model: single-threaded main-thread only.  `update()` is called
 * from the FrameScheduler 'update' tick; `getPosition()` is called from
 * `LRUElementMap._evict()` which runs synchronously during `set()`.
 */
export class CameraPositionService {
    private _pos: Vec3Like = { x: 0, y: 0, z: 0 };
    private readonly _listeners: Set<CameraPositionListener> = new Set();

    // ── Write path (called by engine wiring) ────────────────────────────

    /**
     * Update the stored camera position.
     * Notifies all registered listeners synchronously after update.
     *
     * Called from the engine's FrameScheduler 'update' callback whenever
     * the camera is marked dirty by `CameraController`.
     */
    update(pos: Vec3Like): void {
        this._pos = { x: pos.x, y: pos.y, z: pos.z };
        for (const listener of this._listeners) {
            listener();
        }
    }

    // ── Read path (called by LRUElementMap._evict) ──────────────────────

    /**
     * Returns the most-recently-set camera position.
     * The returned object is freshly constructed on each `update()` call;
     * callers may hold a reference for the duration of a synchronous
     * operation (the value is immutable).
     */
    getPosition(): Readonly<Vec3Like> {
        return this._pos;
    }

    // ── Subscription API ────────────────────────────────────────────────

    /**
     * Register a listener that fires after every `update()` call.
     * Returns a disposer; calling the disposer removes the listener.
     */
    subscribe(listener: CameraPositionListener): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Number of currently-registered listeners (useful for tests). */
    get listenerCount(): number {
        return this._listeners.size;
    }
}

// ---------------------------------------------------------------------------
// Module-level default instance — used when a single camera covers the scene.
// ---------------------------------------------------------------------------

/**
 * Default `CameraPositionService` instance shared across the application.
 * Import and call `cameraPositionService.update(pos)` from the engine's
 * FrameScheduler 'update' tick to keep it current.
 */
export const cameraPositionService = new CameraPositionService();
