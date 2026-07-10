/**
 * §FIX-ELEV-LIVE-CROP-REPROJECT-AND-4X-DEFAULT (L-202) — the elevation per-element
 * projection cache must invalidate when the view's CLIP RANGE changes.
 *
 * Founder bug: changing the Ground-Floor plan crop re-projects the elevation live, but the
 * elements newly captured as the scope GREW rendered incorrectly while the original set
 * stayed sound. Root cause: the per-element cache key carried only the element `version`,
 * so a cache entry produced under the OLD (shallower) clip range was re-served verbatim for
 * the NEW range — the newly-captured geometry inherited a stale classification/clip.
 *
 * Fix: `computeClipSignature()` folds every input that changes what a projection captures or
 * how it classifies (view type, projection direction, near/far, cut plane, plan below-band,
 * section depth bands, section volume box) into the cache key alongside `version`. These
 * tests pin the invariant that MATTERS: grow the crop (`far`) → the signature changes → the
 * cache misses → the element re-projects fresh, identical to a from-scratch projection.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { computeClipSignature, type ClipSignatureInput } from '../views/EdgeProjectorService';

/** A representative ELEVATION clip range (looking down -Z), at the default 50 m capture depth. */
function baseElevationInput(): ClipSignatureInput {
    return {
        viewType: 'elevation',
        direction: new THREE.Vector3(0, 0, -1),
        near: 0,
        far: 50,
        planBelowDepthOffset: 0,
        cutPlaneY: null,
        planFloorY: null,
        planBelowY: null,
        sectionDepthBands: { projectionDepth: 12, farClipDepth: 50 },
        sectionVolumeBox: null,
    };
}

describe('EdgeProjectorService §FIX-ELEV-LIVE-CROP-REPROJECT (L-202) — clip signature', () => {
    it('is deterministic: identical clip inputs produce an identical signature (cache HITS are still allowed)', () => {
        // The fix must not defeat the cache entirely — an unchanged view must keep hitting.
        expect(computeClipSignature(baseElevationInput()))
            .toBe(computeClipSignature(baseElevationInput()));
    });

    it('CHANGES when the crop GROWS (far 50 → 200) — the founder\'s bug: newly-captured elements must re-project', () => {
        const before = computeClipSignature(baseElevationInput());
        const grown  = computeClipSignature({ ...baseElevationInput(), far: 200 });
        // Different signature ⇒ cache miss ⇒ the deeper capture re-projects from scratch
        // instead of re-serving linework computed against the shallower 50 m range.
        expect(grown).not.toBe(before);
    });

    it('CHANGES when the section depth bands move (proj→beyond boundary), so classification cannot go stale', () => {
        const before = computeClipSignature(baseElevationInput());
        const rebanded = computeClipSignature({
            ...baseElevationInput(),
            sectionDepthBands: { projectionDepth: 12, farClipDepth: 200 },
        });
        expect(rebanded).not.toBe(before);
    });

    it('CHANGES on near-plane, projection-direction and cut-plane moves (every capture-affecting input is keyed)', () => {
        const base = computeClipSignature(baseElevationInput());

        expect(computeClipSignature({ ...baseElevationInput(), near: 1.2 })).not.toBe(base);
        expect(computeClipSignature({ ...baseElevationInput(), direction: new THREE.Vector3(1, 0, 0) })).not.toBe(base);
        expect(computeClipSignature({ ...baseElevationInput(), cutPlaneY: 1.2 })).not.toBe(base);
        expect(computeClipSignature({ ...baseElevationInput(), viewType: 'plan' })).not.toBe(base);
    });

    it('distinguishes a null vs a present section volume box (crop region applied vs not)', () => {
        const noBox = computeClipSignature(baseElevationInput());
        const withBox = computeClipSignature({
            ...baseElevationInput(),
            sectionVolumeBox: {
                origin:  new THREE.Vector3(0, 0, 0),
                forward: new THREE.Vector3(0, 0, -1),
                minRight: -3, maxRight: 3,
                minDepth: 0,  maxDepth: 50,
                minY: 0,      maxY: 3,
            } as ClipSignatureInput['sectionVolumeBox'],
        });
        expect(withBox).not.toBe(noBox);
    });
});
