// @vitest-environment happy-dom
//
// §SECTION-3D-CAPABILITY (L-1761, 2026-08-21) — SectionBoxTool's clip mechanism.
//
// Regression guards for the two writes this tool USED to make and must never
// make again:
//
//   1. `renderer.localClippingEnabled = true` — BANNED by QF-1 /
//      LevelClipPlaneCache: it forces every material in the scene to recompile
//      its shader with the CLIPPING_PLANES variant, measured at up to 15 SECONDS
//      on a 20-level model. `ViewController` and `LevelClipPlaneCache` both
//      re-assert it to false; this tool was the last writer of `true`.
//   2. per-material `mat.clippingPlanes` — the same recompile cost via
//      `needsUpdate`, plus the §F15 null-vs-[] restore hazard, and a no-op on
//      every Phase-5 backend because the live renderer never reads it.
//
// The tool had NO test of any kind before this file, which is why both survived
// a renderer migration that silently retired them.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SectionBoxTool } from '@pryzm/input-host';

describe('§SECTION-3D-CAPABILITY — SectionBoxTool uses renderer-level planes only', () => {
    let scene: THREE.Scene;
    let mat: THREE.MeshStandardMaterial;
    let renderer: { localClippingEnabled: boolean; clippingPlanes: unknown[] };
    let container: HTMLElement;
    let tool: SectionBoxTool;

    beforeEach(() => {
        scene = new THREE.Scene();
        mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), mat);
        mesh.userData.id = 'wall-1';
        mesh.userData.elementType = 'wall';
        scene.add(mesh);

        renderer = { localClippingEnabled: false, clippingPlanes: [] };
        container = document.createElement('div');
        (window as any).world = { renderer: { three: renderer, needsUpdate: false } };

        tool = new SectionBoxTool();
        tool.enable(
            renderer as unknown as THREE.WebGLRenderer,
            scene,
            new THREE.PerspectiveCamera(),
            container,
        );
    });

    afterEach(() => {
        try { tool.disable(); } catch { /* already disabled */ }
        delete (window as any).world;
    });

    it('applying a cut sets exactly one renderer-level clipping plane', () => {
        (tool as any)._applyPlane();
        expect(renderer.clippingPlanes).toHaveLength(1);
        expect((renderer.clippingPlanes[0] as THREE.Plane).isPlane).toBe(true);
    });

    it('⛔ NEVER sets localClippingEnabled (QF-1 — the 15-second shader recompile)', () => {
        (tool as any)._applyPlane();
        expect(renderer.localClippingEnabled).toBe(false);
    });

    it('⛔ NEVER writes per-material clippingPlanes', () => {
        const before = (mat as any).clippingPlanes;
        (tool as any)._applyPlane();
        expect((mat as any).clippingPlanes).toBe(before);
    });

    it('⛔ NEVER hides meshes as a "something happened" fallback (C84 EI-1b)', () => {
        // The old fallback hid every mesh whose AABB centre fell on the cut
        // side, which made a FAILED cut and a SUCCESSFUL cut look identical —
        // and vanished whole walls that merely straddled the plane.
        (tool as any)._applyPlane();
        const hidden: string[] = [];
        scene.traverse(o => {
            if ((o as THREE.Mesh).isMesh && !o.visible) hidden.push(o.userData?.id ?? o.uuid);
        });
        expect(hidden).toEqual([]);
    });

    it('disable() clears the renderer-level slot and leaves the flag false', () => {
        (tool as any)._applyPlane();
        expect(renderer.clippingPlanes).toHaveLength(1);

        tool.disable();
        expect(renderer.clippingPlanes).toHaveLength(0);
        expect(renderer.localClippingEnabled).toBe(false);
        expect(tool.enabled).toBe(false);
    });

    it('§F32 — a degenerate plane leaves the prior clip state intact', () => {
        (tool as any)._applyPlane();
        const applied = renderer.clippingPlanes[0];

        (tool as any)._normal.set(0, 0, 0);   // degenerate normal
        (tool as any)._applyPlane();

        // Unchanged — not replaced by a garbage plane, not cleared.
        expect(renderer.clippingPlanes[0]).toBe(applied);
    });
});
