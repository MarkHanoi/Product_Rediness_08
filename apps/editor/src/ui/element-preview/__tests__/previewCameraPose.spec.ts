/**
 * §U8-ORTHOGRAPHIC-VIEW — the family editor's camera presets, as ARITHMETIC.
 *
 * ⭐ WHY THIS FILE IS PURE AND NOT A RENDER TEST. happy-dom provides no WebGL,
 *    so `drawNow` returns `'no-webgl'` BEFORE it ever touches a camera — an
 *    assertion made through it would pass whether the camera code was right,
 *    wrong or absent (the L-9600 shape: success and total failure carrying the
 *    same value). `previewCameraPose` is the part that can actually be pinned:
 *    where the camera goes, which way is up, and whether the projection is
 *    parallel.
 *
 * What this does NOT prove, said plainly: that the pixels are orthographic. It
 * proves the rig is ASKED for an orthographic camera positioned above the
 * subject. The pixel half needs a GPU and belongs to a browser-level test.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_ORBIT, PITCH_LIMIT, previewCameraPose } from '../ElementPreviewRenderer';

const EXTENT: readonly [number, number, number] = [1, 0.6, 0.6];

describe('§U8-ORTHOGRAPHIC-VIEW — the PLAN preset is an orthographic top view', () => {
    it('⭐⭐ looks straight down, in parallel projection, with model +X across the page', () => {
        const pose = previewCameraPose(EXTENT, {
            yaw: 0, pitch: Math.PI / 2, zoom: 1, projection: 'orthographic',
        });
        expect(pose.projection).toBe('orthographic');
        // Directly ABOVE the subject: no X, no Z, positive Y.
        expect(pose.position[0]).toBeCloseTo(0, 9);
        expect(pose.position[2]).toBeCloseTo(0, 9);
        expect(pose.position[1]).toBeGreaterThan(0);
        // ⛔ +Y cannot be both the view direction and "up" on the page. −Z is up,
        // which puts +X to the right — the main viewport's plan orientation.
        expect(pose.up).toEqual([0, 0, -1]);
        expect(pose.halfExtent).not.toBeNull();
        expect(pose.halfExtent!).toBeGreaterThan(0);
    });

    it('⭐ the pole clamp WIDENS for a parallel projection instead of being removed', () => {
        // Perspective keeps PITCH_LIMIT — a perspective camera at the pole
        // degenerates, and the showroom orbit has no business there.
        const persp = previewCameraPose(EXTENT, { yaw: 0, pitch: Math.PI / 2, zoom: 1 });
        expect(persp.projection).toBe('perspective');
        expect(persp.up).toEqual([0, 1, 0]);
        const r = Math.hypot(persp.position[0], persp.position[1], persp.position[2]);
        // Clamped to PITCH_LIMIT, so it is NOT straight up.
        expect(Math.asin(persp.position[1] / r)).toBeCloseTo(PITCH_LIMIT, 6);
    });

    it('the FRONT and SIDE presets are parallel elevations on opposite axes', () => {
        const front = previewCameraPose(EXTENT, { yaw: 0, pitch: 0, zoom: 1, projection: 'orthographic' });
        expect(front.projection).toBe('orthographic');
        expect(front.up).toEqual([0, 1, 0]);
        expect(front.position[0]).toBeCloseTo(0, 9);
        expect(front.position[1]).toBeCloseTo(0, 9);
        expect(front.position[2]).toBeGreaterThan(0);

        const side = previewCameraPose(EXTENT, {
            yaw: Math.PI / 2, pitch: 0, zoom: 1, projection: 'orthographic',
        });
        expect(side.position[0]).toBeGreaterThan(0);
        expect(side.position[1]).toBeCloseTo(0, 9);
        expect(side.position[2]).toBeCloseTo(0, 9);
    });

    it('⛔ an orbit with NO projection is byte-for-byte the perspective showroom it always was', () => {
        const pose = previewCameraPose(EXTENT, { ...DEFAULT_ORBIT });
        const radius = Math.max(Math.hypot(...EXTENT) * 0.5, 0.2);
        const fov = (32 * Math.PI) / 180;
        const dist = (radius / Math.sin(fov / 2)) * 1.28 * 1;
        const p = DEFAULT_ORBIT.pitch;
        expect(pose.projection).toBe('perspective');
        expect(pose.halfExtent).toBeNull();
        expect(pose.position[0]).toBeCloseTo(dist * Math.cos(p) * Math.sin(DEFAULT_ORBIT.yaw), 12);
        expect(pose.position[1]).toBeCloseTo(dist * Math.sin(p), 12);
        expect(pose.position[2]).toBeCloseTo(dist * Math.cos(p) * Math.cos(DEFAULT_ORBIT.yaw), 12);
    });

    it('zoom scales the orthographic frustum, not the distance (a parallel view has no dolly)', () => {
        const a = previewCameraPose(EXTENT, { yaw: 0, pitch: 0, zoom: 1, projection: 'orthographic' });
        const b = previewCameraPose(EXTENT, { yaw: 0, pitch: 0, zoom: 2, projection: 'orthographic' });
        expect(b.halfExtent!).toBeCloseTo(a.halfExtent! * 2, 9);
        expect(b.position[2]).toBeCloseTo(a.position[2], 9);
    });
});
