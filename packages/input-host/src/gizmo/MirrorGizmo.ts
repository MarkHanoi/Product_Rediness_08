/**
 * @file src/tools/gizmo/MirrorGizmo.ts
 *
 * Lightweight Three.js overlay that renders a dashed axis line from P1 to the
 * cursor while the user is picking the second mirror-axis point.
 *
 * Usage:
 *   const gizmo = new MirrorGizmo(scene);
 *   gizmo.setP1({ x, y, z });
 *   gizmo.updateCursor({ x, y, z });   // call from mousemove handler
 *   gizmo.dispose();                   // removes line from scene
 *
 * Visual language: matches BlackGizmo — thin black dashed line,
 * depth-test disabled so it always draws on top.
 */

import * as THREE from '@pryzm/renderer-three/three';

export class MirrorGizmo {
    private _line:    THREE.Line | null = null;
    private _p1:      THREE.Vector3 | null = null;
    private _geometry: THREE.BufferGeometry | null = null;

    constructor(private readonly _scene: THREE.Scene) {}

    /** Call when the user has confirmed P1. */
    setP1(p1: { x: number; y: number; z: number }): void {
        this._p1 = new THREE.Vector3(p1.x, p1.y, p1.z);
        this._buildLine();
    }

    /** Call on every mousemove to update the preview line end-point. */
    updateCursor(cursor: { x: number; y: number; z: number }): void {
        if (!this._p1 || !this._line || !this._geometry) return;
        const positions = this._geometry.attributes.position as THREE.BufferAttribute;
        // p1 is constant; p2 follows cursor
        positions.setXYZ(0, this._p1.x, this._p1.y, this._p1.z);
        positions.setXYZ(1, cursor.x,   cursor.y,   cursor.z);
        positions.needsUpdate = true;
        this._geometry.computeBoundingSphere();
    }

    /** Remove from scene and free GPU resources. */
    dispose(): void {
        if (this._line) {
            this._scene.remove(this._line);
            this._line = null;
        }
        if (this._geometry) {
            this._geometry.dispose();
            this._geometry = null;
        }
        this._p1 = null;
    }

    private _buildLine(): void {
        if (this._line) {
            this._scene.remove(this._line);
            this._geometry?.dispose();
        }

        const p = this._p1!;
        // Two identical points initially — cursor will push point [1]
        const positions = new Float32Array([p.x, p.y, p.z,  p.x, p.y, p.z]);
        this._geometry  = new THREE.BufferGeometry();
        this._geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.LineDashedMaterial({
            color:       0x1c1c1c,
            dashSize:    0.25,
            gapSize:     0.12,
            linewidth:   1,
            depthTest:   false,
            transparent: true,
            opacity:     0.85,
        });

        this._line = new THREE.Line(this._geometry, material);
        this._line.computeLineDistances();
        this._line.renderOrder = 999;
        this._scene.add(this._line);
    }
}
