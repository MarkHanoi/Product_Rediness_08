/**
 * @file src/tools/gizmo/ScaleGizmo.ts
 *
 * Lightweight Three.js overlay for the Scale tool three-point pick mode.
 * Renders:
 *   - A black line from P1 to P2 (reference segment)
 *   - A black line from P1 to cursor (target segment — updates on mousemove)
 *   - A CSS2DObject label showing the current scale factor
 *
 * Visual language: thin black lines, matches BlackGizmo / MirrorGizmo.
 *
 * Usage:
 *   const gizmo = new ScaleGizmo(scene, labelContainer);
 *   gizmo.setP1(p1);          // base point
 *   gizmo.setP2(p2);          // reference point
 *   gizmo.updateCursor(cur);  // call from mousemove
 *   gizmo.dispose();
 */

import * as THREE from '@pryzm/renderer-three/three';
import { CSS2DObject } from '@pryzm/renderer-three';

export class ScaleGizmo {
    private _lineRef:    THREE.Line | null = null;
    private _lineTgt:    THREE.Line | null = null;
    private _geoRef:     THREE.BufferGeometry | null = null;
    private _geoTgt:     THREE.BufferGeometry | null = null;
    private _label:      CSS2DObject | null = null;
    private _labelEl:    HTMLDivElement | null = null;

    private _p1: THREE.Vector3 | null = null;
    private _p2: THREE.Vector3 | null = null;
    private _refLen = 1;

    constructor(private readonly _scene: THREE.Scene) {}

    setP1(p: { x: number; y: number; z: number }): void {
        this._p1 = new THREE.Vector3(p.x, p.y, p.z);
    }

    setP2(p: { x: number; y: number; z: number }): void {
        if (!this._p1) return;
        this._p2 = new THREE.Vector3(p.x, p.y, p.z);
        this._refLen = this._p1.distanceTo(this._p2) || 1;
        this._buildRefLine();
        this._buildTargetLine();
        this._buildLabel();
    }

    updateCursor(cursor: { x: number; y: number; z: number }): void {
        if (!this._p1 || !this._geoTgt) return;
        const pos = this._geoTgt.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, this._p1.x, this._p1.y, this._p1.z);
        pos.setXYZ(1, cursor.x, cursor.y, cursor.z);
        pos.needsUpdate = true;

        // Update label
        const tgtLen = this._p1.distanceTo(new THREE.Vector3(cursor.x, cursor.y, cursor.z));
        const factor = tgtLen / this._refLen;
        if (this._labelEl) {
            this._labelEl.textContent = `× ${factor.toFixed(2)}`;
        }
        if (this._label) {
            this._label.position.set(cursor.x, cursor.y, cursor.z);
        }
    }

    /** Returns the current scale factor based on last cursor position. */
    get currentFactor(): number {
        if (!this._geoTgt || !this._p1) return 1;
        const pos = this._geoTgt.attributes.position as THREE.BufferAttribute;
        const cx  = pos.getX(1), cy = pos.getY(1), cz = pos.getZ(1);
        const tgtLen = this._p1.distanceTo(new THREE.Vector3(cx, cy, cz));
        return tgtLen / this._refLen;
    }

    dispose(): void {
        if (this._lineRef) { this._scene.remove(this._lineRef); this._geoRef?.dispose(); }
        if (this._lineTgt) { this._scene.remove(this._lineTgt); this._geoTgt?.dispose(); }
        if (this._label)   { this._scene.remove(this._label); }
        this._lineRef = this._lineTgt = this._label = null;
        this._geoRef  = this._geoTgt  = null;
        this._labelEl = null;
        this._p1      = this._p2 = null;
    }

    private _makeLine(geo: THREE.BufferGeometry, opacity = 0.85): THREE.Line {
        const mat = new THREE.LineBasicMaterial({
            color:       0x1c1c1c,
            depthTest:   false,
            transparent: true,
            opacity,
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 999;
        this._scene.add(line);
        return line;
    }

    private _buildRefLine(): void {
        if (!this._p1 || !this._p2) return;
        const positions = new Float32Array([
            this._p1.x, this._p1.y, this._p1.z,
            this._p2.x, this._p2.y, this._p2.z,
        ]);
        this._geoRef = new THREE.BufferGeometry();
        this._geoRef.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._lineRef = this._makeLine(this._geoRef, 0.45);
    }

    private _buildTargetLine(): void {
        if (!this._p1) return;
        const positions = new Float32Array([
            this._p1.x, this._p1.y, this._p1.z,
            this._p1.x, this._p1.y, this._p1.z, // cursor will move this
        ]);
        this._geoTgt = new THREE.BufferGeometry();
        this._geoTgt.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._lineTgt = this._makeLine(this._geoTgt, 0.85);
    }

    private _buildLabel(): void {
        if (!this._p1) return;
        this._labelEl = document.createElement('div');
        this._labelEl.style.cssText =
            'background:rgba(28,28,28,0.85);color:#fff;font:11px/1 "Inter",sans-serif;' +
            'padding:2px 6px;border-radius:3px;pointer-events:none;white-space:nowrap;';
        this._labelEl.textContent = '× 1.00';
        this._label   = new CSS2DObject(this._labelEl);
        this._label.position.copy(this._p1);
        this._scene.add(this._label);
    }
}
