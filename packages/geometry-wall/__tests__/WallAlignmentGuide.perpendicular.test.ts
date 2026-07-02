/**
 * §FIX-ALIGN-GUIDE-PERPENDICULAR (L-26)
 *
 * The wall-draw alignment inference guide must PREFER the axis PERPENDICULAR to
 * the current draw direction and SUPPRESS the colinear (same-direction) guide,
 * which merely extends the line the user is already dragging and conveys nothing.
 *
 * These tests exercise the pure axis-selection policy
 * `WallAlignmentGuide.guideAxisPreference(dx, dz)` which decides, for the two
 * inference axes, which one is colinear-with-draw and should be dropped:
 *
 *   - axis 'X' guide = HORIZONTAL line (extends along world-X) → colinear when
 *     drawing along world-X → should be suppressed (suppressX).
 *   - axis 'Z' guide = VERTICAL line (extends along world-Z) → colinear when
 *     drawing along world-Z → should be suppressed (suppressZ).
 *
 * The helper is static/pure so no THREE.Scene / WebGL is required.
 */
import { describe, it, expect } from 'vitest';
import { WallAlignmentGuide } from '../src/WallAlignmentGuide';

describe('WallAlignmentGuide.guideAxisPreference — perpendicular preference', () => {
    it('drawing along +X suppresses the colinear X guide, keeps the perpendicular Z guide', () => {
        const pref = WallAlignmentGuide.guideAxisPreference(5, 0);
        expect(pref.suppressX).toBe(true);   // horizontal guide is colinear → drop
        expect(pref.suppressZ).toBe(false);  // vertical (perpendicular) guide kept
    });

    it('drawing along -X (reverse) behaves the same — direction is axis-agnostic', () => {
        const pref = WallAlignmentGuide.guideAxisPreference(-5, 0);
        expect(pref.suppressX).toBe(true);
        expect(pref.suppressZ).toBe(false);
    });

    it('drawing along +Z suppresses the colinear Z guide, keeps the perpendicular X guide', () => {
        const pref = WallAlignmentGuide.guideAxisPreference(0, 5);
        expect(pref.suppressZ).toBe(true);   // vertical guide is colinear → drop
        expect(pref.suppressX).toBe(false);  // horizontal (perpendicular) guide kept
    });

    it('drawing along -Z behaves the same', () => {
        const pref = WallAlignmentGuide.guideAxisPreference(0, -5);
        expect(pref.suppressZ).toBe(true);
        expect(pref.suppressX).toBe(false);
    });

    it('a slightly-off-axis (near-horizontal) draw is still treated as along X', () => {
        // ~10° off horizontal → still clearly X-dominant (well inside the ±22.5° cone)
        const dx = Math.cos((10 * Math.PI) / 180);
        const dz = Math.sin((10 * Math.PI) / 180);
        const pref = WallAlignmentGuide.guideAxisPreference(dx, dz);
        expect(pref.suppressX).toBe(true);
        expect(pref.suppressZ).toBe(false);
    });

    it('a diagonal (45°) draw keeps BOTH guides — neither axis dominates', () => {
        const pref = WallAlignmentGuide.guideAxisPreference(3, 3);
        expect(pref.suppressX).toBe(false);
        expect(pref.suppressZ).toBe(false);
    });

    it('a near-diagonal (~35°) draw stays in the neutral zone and keeps both', () => {
        const dx = Math.cos((35 * Math.PI) / 180);
        const dz = Math.sin((35 * Math.PI) / 180);
        const pref = WallAlignmentGuide.guideAxisPreference(dx, dz);
        expect(pref.suppressX).toBe(false);
        expect(pref.suppressZ).toBe(false);
    });

    it('a zero-length (cursor on start) draw keeps both guides — no meaningful direction', () => {
        const pref = WallAlignmentGuide.guideAxisPreference(0, 0);
        expect(pref.suppressX).toBe(false);
        expect(pref.suppressZ).toBe(false);
    });

    it('never suppresses BOTH guides simultaneously (would leave the user with none)', () => {
        const dirs: Array<[number, number]> = [
            [5, 0], [0, 5], [3, 3], [-4, 1], [1, -6], [10, 4], [2, 9], [0.5, 0.5],
        ];
        for (const [dx, dz] of dirs) {
            const pref = WallAlignmentGuide.guideAxisPreference(dx, dz);
            expect(pref.suppressX && pref.suppressZ).toBe(false);
        }
    });
});
