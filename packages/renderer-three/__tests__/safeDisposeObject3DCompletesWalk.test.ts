/**
 * §ENVELOPE-EDIT-GPU-LIFETIME (L-13313) — `safeDisposeObject3D` finishes its walk before it
 * reports a non-§I2 error.
 *
 * Its own docstring promised "a single stale render object can never abort the whole teardown",
 * but a non-`usedTimes` error thrown by one node aborted `traverse` there and leaked every node
 * after it. Through the frame-boundary funnel that leak was permanent: `drainGpuReleaseQueue`
 * logs the error and moves on, so nothing ever offered the siblings their release again.
 * Envelope edits route every teardown through that funnel, so the gap became theirs.
 *
 * ✅ ESTABLISHES: the walk completes (the same node's other resource and every later node are
 * released), and the error is still surfaced, both directly and through the drain.
 * ⛔ DOES NOT ESTABLISH: anything about the §I2 family itself — `safeDispose.test.ts` owns that.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { drainGpuReleaseQueue, safeDisposeObject3D, scheduleGpuRelease } from '../src/safeDispose.js';

// ⚠ Must NOT contain the §I2 keyword — `isUsedTimesDisposeError` matches on the message text.
const NOT_I2 = 'boom — a genuine disposal bug, outside the device-loss family';

/** root → [first, bad, last]; `bad`'s GEOMETRY throws a non-§I2 error. Group.traverse visits in that order. */
function subtreeWithOneBadHandle() {
    const root = new THREE.Group();
    const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const bad = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const last = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(first, bad, last);
    vi.spyOn(bad.geometry, 'dispose').mockImplementation(() => { throw new Error(NOT_I2); });
    return {
        root,
        firstGeo: vi.spyOn(first.geometry, 'dispose'),
        badMat: vi.spyOn(bad.material as THREE.Material, 'dispose'),
        lastGeo: vi.spyOn(last.geometry, 'dispose'),
        lastMat: vi.spyOn(last.material as THREE.Material, 'dispose'),
    };
}

beforeEach(() => { drainGpuReleaseQueue(); });
afterEach(() => { drainGpuReleaseQueue(); vi.restoreAllMocks(); });

describe('§ENVELOPE-EDIT-GPU-LIFETIME — safeDisposeObject3D finishes the walk, then reports', () => {
    it('one bad handle no longer strands the rest of the subtree — and the error is still thrown', () => {
        const s = subtreeWithOneBadHandle();

        expect(() => safeDisposeObject3D(s.root)).toThrow(NOT_I2);

        expect(s.firstGeo).toHaveBeenCalledTimes(1);
        expect(s.badMat, "the bad node's OTHER resource").toHaveBeenCalledTimes(1);
        expect(s.lastGeo, 'a sibling AFTER the bad node').toHaveBeenCalledTimes(1);
        expect(s.lastMat).toHaveBeenCalledTimes(1);
    });

    it('through the frame-boundary funnel: siblings are released and the failure is still reported', () => {
        const s = subtreeWithOneBadHandle();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        scheduleGpuRelease(s.root);
        expect(() => drainGpuReleaseQueue()).not.toThrow();

        expect(s.lastGeo).toHaveBeenCalledTimes(1);
        expect(s.lastMat).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls.some((c) => String(c[1] ?? '').includes(NOT_I2))).toBe(true);
    });
});
