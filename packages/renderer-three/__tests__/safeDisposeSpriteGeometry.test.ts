/**
 * §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) · §GPU-RESOURCE-LIFETIME INVARIANT L1 (ADR-0281).
 *
 * ⭐ THREE's SPRITE GEOMETRY BELONGS TO THREE, NOT TO THE SPRITE.
 *
 * three r183.2 `Sprite.js:12,69-93` builds ONE module-level `_geometry` (indexed, with an
 * interleaved position/uv buffer) the first time a Sprite is constructed, and assigns that SAME
 * object to every Sprite ever made. `safeDisposeObject3D` — which the frame-boundary release
 * funnel (`scheduleGpuRelease` → `drainGpuReleaseQueue`) runs on every detached subtree — used to
 * free `node.geometry` for ANY node carrying one, so releasing a subtree that holds a label
 * sprite freed the geometry every OTHER sprite in the app still draws with: room labels,
 * envelope labels — translucent and indexed, i.e. exactly the `_renderTransparents` →
 * `setIndexBuffer … not of type 'GPUBuffer'` shape L-13313 is about.
 *
 * The envelope builder side-stepped it by hand (it disposed only `isMesh` geometries); routing
 * the envelope teardown through the funnel — the L-13313 fix — would have walked straight into
 * it. So the rule moves to the one place every caller passes through.
 *
 * ✅ ESTABLISHES: the direct helper and the deferred funnel both release a sprite's MATERIAL and
 *    never its geometry; a sibling mesh's geometry is still released (not a blanket leak).
 * ⛔ DOES NOT ESTABLISH: anything about a GPU. No renderer is constructed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from '../src/three-re-export.js';
import {
    drainGpuReleaseQueue,
    pendingGpuReleaseCount,
    safeDisposeObject3D,
    scheduleGpuRelease,
} from '../src/safeDispose.js';

afterEach(() => {
    // Never let a queued release leak into another test.
    drainGpuReleaseQueue();
});

/** A group holding one ordinary mesh and one label sprite — the envelope group's shape. */
function labelledGroup() {
    const meshGeometry = new THREE.BoxGeometry(1, 1, 1);
    const meshMaterial = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
    const spriteMaterial = new THREE.SpriteMaterial();
    const sprite = new THREE.Sprite(spriteMaterial);
    const group = new THREE.Group();
    group.add(mesh, sprite);
    const spriteGeometryDisposed = vi.fn();
    sprite.geometry.addEventListener('dispose', spriteGeometryDisposed);
    const spies = {
        meshGeometry: vi.spyOn(meshGeometry, 'dispose'),
        meshMaterial: vi.spyOn(meshMaterial, 'dispose'),
        spriteMaterial: vi.spyOn(spriteMaterial, 'dispose'),
        spriteGeometryDisposed,
    };
    const detachProbe = () => sprite.geometry.removeEventListener('dispose', spriteGeometryDisposed);
    return { group, sprite, spies, detachProbe };
}

describe('§ENVELOPE-EDIT-GPU-LIFETIME — a sprite never owns its geometry', () => {
    it('the premise, measured: three hands EVERY sprite the SAME geometry object', () => {
        const a = new THREE.Sprite(new THREE.SpriteMaterial());
        const b = new THREE.Sprite(new THREE.SpriteMaterial());
        expect(a.geometry).toBe(b.geometry);
    });

    it("safeDisposeObject3D releases a sprite's material and NEVER its (shared) geometry", () => {
        const { group, spies, detachProbe } = labelledGroup();
        try {
            safeDisposeObject3D(group);
            expect(spies.spriteGeometryDisposed).not.toHaveBeenCalled();
            expect(spies.spriteMaterial).toHaveBeenCalledTimes(1);
            // ⛔ NOT A BLANKET LEAK — the ordinary mesh beside it is still released.
            expect(spies.meshGeometry).toHaveBeenCalledTimes(1);
            expect(spies.meshMaterial).toHaveBeenCalledTimes(1);
        } finally {
            detachProbe();
        }
    });

    it('the frame-boundary funnel honours the same rule — nothing on the tick, sprite geometry never', () => {
        const { group, spies, detachProbe } = labelledGroup();
        try {
            scheduleGpuRelease(group);
            // L2 — the release waits for the boundary.
            expect(pendingGpuReleaseCount()).toBe(1);
            expect(spies.meshGeometry).not.toHaveBeenCalled();
            drainGpuReleaseQueue();
            expect(spies.spriteGeometryDisposed).not.toHaveBeenCalled();
            expect(spies.spriteMaterial).toHaveBeenCalledTimes(1);
            expect(spies.meshGeometry).toHaveBeenCalledTimes(1);
        } finally {
            detachProbe();
        }
    });
});
