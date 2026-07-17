// §L-378 — globe/ECEF-scale camera guard for MultiViewCameraManager.
//
// Regression: returning from the Forma / Cesium 3D-site view drives the SHARED
// OBC THREE camera to ECEF coordinates (~12.5M units out). ViewController's
// deactivate() → saveSlot('perspective') then persisted that globe pose, and the
// following restoreSlot('perspective') replayed it against the local BIM scene,
// leaving the building a distant speck the user had to zoom into every time.
//
// These tests prove:
//  1. saveSlot() REJECTS a globe-scale pose (last valid BIM slot is preserved).
//  2. restoreSlot() REJECTS an already-contaminated globe-scale slot (MISS →
//     caller falls back to default framing).
//  3. HARD GUARD — a NORMAL in-editor BIM camera still saves and restores intact.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { MultiViewCameraManager } from './MultiViewCameraManager';

/** Minimal OBC.OrthoPerspectiveCamera stand-in for save/restore. */
function mockCamera(
    pos: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
) {
    const three = {
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        quaternion: new THREE.Quaternion(),
        zoom: 1,
        isOrthographicCamera: false,
        updateProjectionMatrix() { /* no-op */ },
    };
    const setLookAt = vi.fn((px: number, py: number, pz: number) => {
        three.position.set(px, py, pz);
    });
    const controls = {
        getTarget: (v: THREE.Vector3) => { v.set(target.x, target.y, target.z); return v; },
        setLookAt,
    };
    return { three, controls, setLookAt } as any;
}

const BIM_POS = { x: 30, y: 20, z: 30 };          // ordinary aerial 3D framing (metres)
const BIM_TGT = { x: 0, y: 0, z: 0 };
const GLOBE_POS = { x: -1675359.34, y: 660322.37, z: -12479386.9 }; // the logged ECEF pose
const GLOBE_TGT = { x: 17.53, y: 9.75, z: 9.83 };

describe('MultiViewCameraManager — §L-378 globe-scale save guard', () => {
    let mgr: MultiViewCameraManager;
    beforeEach(() => { mgr = new MultiViewCameraManager(); vi.restoreAllMocks(); });

    it('saveSlot() preserves the last valid BIM pose when a globe-scale pose is offered', () => {
        // A valid BIM pose is saved first (e.g. the user framed the building).
        mgr.saveSlot('perspective', mockCamera(BIM_POS, BIM_TGT));
        expect(mgr.hasSlotState('perspective')).toBe(true);

        // Returning from Forma: the shared camera is now at ECEF scale. This save
        // MUST NOT overwrite the valid pose.
        mgr.saveSlot('perspective', mockCamera(GLOBE_POS, GLOBE_TGT));

        const snap = mgr.getSlotSnapshot('perspective');
        expect(snap.position.x).toBeCloseTo(BIM_POS.x);
        expect(snap.position.y).toBeCloseTo(BIM_POS.y);
        expect(snap.position.z).toBeCloseTo(BIM_POS.z);
    });

    it('saveSlot() leaves an empty slot empty when only a globe-scale pose is offered', () => {
        mgr.saveSlot('perspective', mockCamera(GLOBE_POS, GLOBE_TGT));
        // No valid pose ever seen → slot stays empty so restore reports a MISS.
        expect(mgr.hasSlotState('perspective')).toBe(false);
    });
});

describe('MultiViewCameraManager — §L-378 globe-scale restore guard', () => {
    let mgr: MultiViewCameraManager;
    beforeEach(() => { mgr = new MultiViewCameraManager(); });

    it('restoreSlot() rejects an already-contaminated globe-scale slot and clears it (MISS)', () => {
        // Simulate a slot contaminated before the guard shipped (seed bypasses the
        // save-side guard, exactly like a persisted / legacy globe pose would).
        mgr.seedPerspectiveSlot(
            new THREE.Vector3(GLOBE_POS.x, GLOBE_POS.y, GLOBE_POS.z),
            new THREE.Vector3(GLOBE_TGT.x, GLOBE_TGT.y, GLOBE_TGT.z),
        );
        expect(mgr.hasSlotState('perspective')).toBe(true);

        const cam = mockCamera(BIM_POS, BIM_TGT);
        const restored = mgr.restoreSlot('perspective', cam);

        expect(restored).toBe(false);                 // MISS → caller default-frames
        expect(cam.setLookAt).not.toHaveBeenCalled(); // globe pose never replayed
        expect(mgr.hasSlotState('perspective')).toBe(false); // slot cleared
    });
});

describe('MultiViewCameraManager — §L-378 HARD GUARD: normal toggle unaffected', () => {
    let mgr: MultiViewCameraManager;
    beforeEach(() => { mgr = new MultiViewCameraManager(); });

    it('a normal in-editor BIM camera still saves and restores intact', () => {
        mgr.saveSlot('perspective', mockCamera(BIM_POS, BIM_TGT));

        const cam = mockCamera({ x: 0, y: 0, z: 0 });
        const restored = mgr.restoreSlot('perspective', cam);

        expect(restored).toBe(true);                       // HIT — user's camera restored
        expect(cam.setLookAt).toHaveBeenCalledTimes(1);
        expect(cam.three.position.x).toBeCloseTo(BIM_POS.x);
        expect(cam.three.position.y).toBeCloseTo(BIM_POS.y);
        expect(cam.three.position.z).toBeCloseTo(BIM_POS.z);
    });
});
