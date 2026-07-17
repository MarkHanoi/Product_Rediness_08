// §L-378 — globe/ECEF-scale camera guard for ViewCameraStateStore.
//
// ViewCameraStateStore is the FALLBACK restore path used by _activate3DView when
// the MultiViewCameraManager perspective slot misses. On return from the Forma /
// Cesium 3D-site view, deactivate() → save('3D') captured the ECEF-scale shared
// camera under the '3D' key; a later restore('3D') then replayed the globe pose
// against the local BIM scene. These tests prove save() rejects it and restore()
// never replays a contaminated state, while a NORMAL BIM camera round-trips.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViewCameraStateStore } from './ViewCameraStateStore';

/** Minimal OBC.OrthoPerspectiveCamera stand-in. */
function mockCamera(
    pos: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
) {
    const three = { position: { ...pos }, zoom: 1 };
    const setLookAt = vi.fn();
    const controls = { _target: { ...target }, setLookAt };
    return { three, controls, setLookAt } as any;
}

const BIM_POS = { x: 30, y: 20, z: 30 };
const BIM_TGT = { x: 0, y: 0, z: 0 };
const GLOBE_POS = { x: -1675359.34, y: 660322.37, z: -12479386.9 };
const GLOBE_TGT = { x: 17.53, y: 9.75, z: 9.83 };

describe('ViewCameraStateStore — §L-378 globe-scale save guard', () => {
    let store: ViewCameraStateStore;
    beforeEach(() => { store = new ViewCameraStateStore(); });

    it('save() skips a globe-scale pose (nothing cached under the key)', () => {
        store.save('3D', mockCamera(GLOBE_POS, GLOBE_TGT));
        expect(store.has('3D')).toBe(false);
    });

    it('save() does not overwrite a prior valid BIM state with a globe-scale pose', () => {
        store.save('3D', mockCamera(BIM_POS, BIM_TGT));
        store.save('3D', mockCamera(GLOBE_POS, GLOBE_TGT)); // ignored
        expect(store.has('3D')).toBe(true);

        const cam = mockCamera({ x: 0, y: 0, z: 0 });
        expect(store.restore('3D', cam)).toBe(true);
        // Restored the BIM pose, not the globe pose.
        expect(cam.setLookAt).toHaveBeenCalledWith(
            BIM_POS.x, BIM_POS.y, BIM_POS.z, BIM_TGT.x, BIM_TGT.y, BIM_TGT.z, false,
        );
    });
});

describe('ViewCameraStateStore — §L-378 globe-scale restore guard', () => {
    let store: ViewCameraStateStore;
    beforeEach(() => { store = new ViewCameraStateStore(); });

    it('restore() drops a contaminated globe-scale state and reports MISS', () => {
        // Inject a legacy/pre-guard globe state directly (bypasses the save guard).
        (store as any)._states.set('3D', {
            position: [GLOBE_POS.x, GLOBE_POS.y, GLOBE_POS.z],
            target: [GLOBE_TGT.x, GLOBE_TGT.y, GLOBE_TGT.z],
            zoom: 1,
        });

        const cam = mockCamera(BIM_POS, BIM_TGT);
        const restored = store.restore('3D', cam);

        expect(restored).toBe(false);                 // MISS → _activate3DView default-frames
        expect(cam.setLookAt).not.toHaveBeenCalled(); // globe pose never replayed
        expect(store.has('3D')).toBe(false);          // dropped
    });
});

describe('ViewCameraStateStore — §L-378 HARD GUARD: normal toggle unaffected', () => {
    let store: ViewCameraStateStore;
    beforeEach(() => { store = new ViewCameraStateStore(); });

    it('a normal BIM camera saves and restores intact', () => {
        store.save('3D', mockCamera(BIM_POS, BIM_TGT));
        const cam = mockCamera({ x: 0, y: 0, z: 0 });
        expect(store.restore('3D', cam)).toBe(true);
        expect(cam.setLookAt).toHaveBeenCalledWith(
            BIM_POS.x, BIM_POS.y, BIM_POS.z, BIM_TGT.x, BIM_TGT.y, BIM_TGT.z, false,
        );
    });
});
