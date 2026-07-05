/**
 * §FEAT-PROJECT-ORIGIN (L-109) — ProjectOriginMarker contract.
 *
 * The marker is the always-on BLUE SPHERE at the project origin / base point.
 * It is a coordination-datum gizmo: never a pick / delete target (raycast
 * disabled, selectable:false), toggleable by the View-Intent panel via its
 * stable userData.id, and disposable with no GPU teardown mid-frame.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '../src/three-re-export';
import { ProjectOriginMarker, PROJECT_ORIGIN_MARKER_NAME } from '../src/ProjectOriginMarker';

const FIXED_ID = 'projectOrigin_00000000000000000000000000';

describe('ProjectOriginMarker §FEAT-PROJECT-ORIGIN', () => {
    let scene: THREE.Scene;
    let marker: ProjectOriginMarker;

    beforeEach(() => {
        scene = new THREE.Scene();
        marker = new ProjectOriginMarker({ id: FIXED_ID });
    });

    it('is a non-shadowing sphere carrying the project-origin userData contract', () => {
        const mesh = marker.mesh;
        expect(mesh.name).toBe(PROJECT_ORIGIN_MARKER_NAME);
        expect(mesh.castShadow).toBe(false);
        expect(mesh.receiveShadow).toBe(false);
        expect(mesh.geometry.type).toBe('SphereGeometry');
        expect(mesh.userData.id).toBe(FIXED_ID);
        expect(mesh.userData.type).toBe('project-origin');
        expect(mesh.userData.category).toBe('project-origin');
        expect(mesh.userData.isProjectOrigin).toBe(true);
        expect(mesh.userData.selectable).toBe(false);
    });

    it('is transparent to raycasts (never a pick / snap target)', () => {
        const raycaster = new THREE.Raycaster();
        const hits: THREE.Intersection[] = [];
        // Should not throw and should not populate hits — raycast is a no-op.
        marker.mesh.raycast(raycaster, hits);
        expect(hits).toHaveLength(0);
    });

    it('attaches to / detaches from a scene idempotently', () => {
        marker.attach(scene);
        expect(scene.children).toContain(marker.mesh);
        marker.attach(scene); // idempotent
        expect(scene.children.filter((c) => c === marker.mesh)).toHaveLength(1);
        marker.detach();
        expect(scene.children).not.toContain(marker.mesh);
    });

    it('moves to the datum position', () => {
        marker.setPosition(10, 0, -5);
        expect(marker.mesh.position.x).toBe(10);
        expect(marker.mesh.position.z).toBe(-5);
    });

    it('toggles visibility without GPU teardown (View-Intent)', () => {
        expect(marker.enabled).toBe(true);
        marker.setEnabled(false);
        expect(marker.enabled).toBe(false);
        expect(marker.mesh.visible).toBe(false);
        // geometry/material survive the toggle (no dispose mid-frame)
        expect(marker.mesh.geometry).toBeTruthy();
        marker.setEnabled(true);
        expect(marker.mesh.visible).toBe(true);
    });
});
