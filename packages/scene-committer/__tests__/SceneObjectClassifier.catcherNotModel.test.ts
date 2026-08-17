/**
 * §CAM-CATCHER-NOT-MODEL (L-931) — PRYZM's own scene infrastructure is not the model.
 *
 * FOUNDER, 2026-08-16, production: *"select a parcel and the camera sits TOO FAR — I must
 * click to get a usable view."* Their trace carried two numbers, and both are closed-form
 * consequences of ONE object rather than of any race between the four framing actors:
 *
 *   `_activate3DView`      setLookAt(target=0,0,0  dist=8000.0)   = maxDim x 2, maxDim 4000
 *   `§CAM-FRAME-INVARIANT` auto-framed and VERIFIED  dist=6505.4m = computeFitPose of the same
 *
 * The object is {@link GroundShadowCatcher} — the invisible 4000 x 4000 m L0 contact-shadow
 * receiver (ADR-0106), centred on the origin. It is a plain `THREE.Mesh` whose `userData`
 * carries `role` / `pickable` / `isGroundShadowCatcher` but NO `elementType` and NO
 * `isHelper`, so every arm of `shouldExcludeFromBounds` passed it through and every framer
 * honestly framed a 4 km subject the user never selected.
 *
 * This is the L-749 lesson recurring — *"nothing about element identity will ever exclude
 * them"* — with the offender being PRYZM's own infrastructure rather than three.js's.
 *
 * These tests use the REAL `GroundShadowCatcher`, not a stand-in, so the exclusion cannot
 * pass here while missing the object that actually ships.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { GroundShadowCatcher } from '@pryzm/renderer-three';
import { SceneObjectClassifier } from '../src/SceneObjectClassifier.js';
import { computeBimFitBounds } from '../src/bimFitBounds.js';

describe('SceneObjectClassifier §CAM-CATCHER-NOT-MODEL (L-931)', () => {
    it('the REAL ground shadow catcher is excluded from the bounds population', () => {
        const catcher = new GroundShadowCatcher().mesh;
        expect(SceneObjectClassifier.isSceneInfrastructure(catcher)).toBe(true);
        expect(SceneObjectClassifier.shouldExcludeFromBounds(catcher, null)).toBe(true);
    });

    it('exclusion is ancestry-walked — grouped infrastructure is excluded too', () => {
        const group = new THREE.Group();
        group.userData.role = 'ground-shadow-catcher';
        const child = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial());
        group.add(child);
        expect(SceneObjectClassifier.shouldExcludeFromBounds(child, null)).toBe(true);
    });

    it('`userData.isSceneInfrastructure` is the open door for the NEXT such mesh', () => {
        // So the author of the next 4 km render aid does not have to find and edit a set.
        const future = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshBasicMaterial());
        future.userData = { isSceneInfrastructure: true };
        expect(SceneObjectClassifier.shouldExcludeFromBounds(future, null)).toBe(true);
    });

    it('real BIM geometry is still INCLUDED — the exclusion must not eat the model', () => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), new THREE.MeshStandardMaterial());
        wall.userData = { elementType: 'wall', id: 'w1', role: 'element' };
        expect(SceneObjectClassifier.isSceneInfrastructure(wall)).toBe(false);
        expect(SceneObjectClassifier.shouldExcludeFromBounds(wall, null)).toBe(false);
    });

    it('a mesh with no userData at all is still INCLUDED (absence is not a licence to exclude)', () => {
        // ADR-0305: exclusion is a POSITIVE declaration by the producer. The absence of
        // identity is exactly what a control looks like — but also what an un-tagged
        // imported mesh looks like, and dropping those would silently shrink the model.
        const anon = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
        expect(SceneObjectClassifier.isSceneInfrastructure(anon)).toBe(false);
    });

    it("the founder's scene: the fallback fit pass no longer measures 4 km", () => {
        // A parcel has been selected and site context has loaded; nothing is authored, so
        // `computeBimFitBounds` pass 1 finds no BIM type and falls through to the
        // classified all-mesh pass — the pass the catcher used to dominate.
        const scene = new THREE.Scene();
        const context = new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial());
        context.position.set(60, 7, 20);
        scene.add(context);
        new GroundShadowCatcher().attach(scene);
        scene.updateMatrixWorld(true);

        const { bounds, usedBimTypePass } = computeBimFitBounds(scene, null);
        expect(usedBimTypePass).toBe(false);
        const size = bounds.getSize(new THREE.Vector3());
        expect(size.x).toBeLessThan(100);   // was exactly 4000
        expect(size.z).toBeLessThan(100);
    });
});
