/**
 * WallJunctionInfillManager — scene-level lifecycle manager for junction infill meshes.
 *
 * One THREE.Mesh is maintained per detected multi-wall junction cluster.
 * Each mesh is a vertical prism (closed top + bottom + side faces) that exactly
 * fills the void polygon left between wall end faces at the junction.
 *
 * Contract:
 *   Instantiated once by EngineBootstrap.
 *   update() is called after every WallJoinResolver.resolveLevel() pass.
 *   clearAll() is called on level switch or project close.
 *   No store writes, no command calls, no builder invocations.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { JunctionInfillData } from './WallJunctionInfill';

export class WallJunctionInfillManager {

    private readonly _meshes   = new Map<string, THREE.Mesh>();
    private readonly _material: THREE.MeshStandardMaterial;

    constructor() {
        // Match the default wall surface appearance as closely as possible.
        this._material = new THREE.MeshStandardMaterial({
            color:     0xf2f2f2,
            roughness: 0.75,
            metalness: 0.0,
            side:      THREE.DoubleSide,
        });
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Synchronises scene infill meshes with the new list of junction infills.
     *
     * • Clusters present in both old and new lists are rebuilt (geometry may
     *   have changed because a wall moved).
     * • Clusters present only in the old list are removed from the scene.
     * • Clusters present only in the new list are added to the scene.
     */
    update(infills: JunctionInfillData[], scene: THREE.Scene): void {
        const newKeys = new Set(infills.map(i => i.clusterKey));

        // Remove obsolete meshes (clusters that no longer exist).
        for (const [key, mesh] of this._meshes) {
            if (!newKeys.has(key)) {
                scene.remove(mesh);
                mesh.geometry.dispose();
                this._meshes.delete(key);
            }
        }

        // Add or replace meshes for all current infills.
        for (const infill of infills) {
            const existing = this._meshes.get(infill.clusterKey);
            if (existing) {
                scene.remove(existing);
                existing.geometry.dispose();
                this._meshes.delete(infill.clusterKey);
            }

            const geometry = this._buildPrismGeometry(infill);
            if (!geometry) continue;

            const mesh = new THREE.Mesh(geometry, this._material);
            mesh.userData.isJunctionInfill = true;
            mesh.userData.clusterKey       = infill.clusterKey;

            // Slight Z-bias so the infill is never z-fighting with wall faces.
            mesh.renderOrder = 0;

            scene.add(mesh);
            this._meshes.set(infill.clusterKey, mesh);
        }
    }

    /**
     * Removes every infill mesh from the scene (e.g. on level switch or close).
     */
    clearAll(scene: THREE.Scene): void {
        for (const [key, mesh] of this._meshes) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            this._meshes.delete(key);
        }
    }

    dispose(): void {
        this._material.dispose();
        this._meshes.clear();
    }

    // ─── Geometry builder ─────────────────────────────────────────────────────

    /**
     * Builds a non-indexed BufferGeometry for the void polygon prism.
     *
     * Face order:
     *   Top face    (n-2 triangles, normal +Y, fan from vertex 0)
     *   Bottom face (n-2 triangles, normal -Y, reversed winding)
     *   Side faces  (n quads = 2n triangles, each with a per-face normal)
     */
    private _buildPrismGeometry(infill: JunctionInfillData): THREE.BufferGeometry | null {
        const { vertices, elevation, height } = infill;
        const n = vertices.length;
        if (n < 3) return null;

        const yBot = elevation;
        const yTop = elevation + height;

        const positions: number[] = [];
        const normals:   number[] = [];

        const pushV = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
            positions.push(x, y, z);
            normals.push(nx, ny, nz);
        };

        // ── Top face (+Y normal, CCW when viewed from above) ─────────────────
        for (let i = 1; i < n - 1; i++) {
            pushV(vertices[0].x,     yTop, vertices[0].z,     0, 1, 0);
            pushV(vertices[i].x,     yTop, vertices[i].z,     0, 1, 0);
            pushV(vertices[i + 1].x, yTop, vertices[i + 1].z, 0, 1, 0);
        }

        // ── Bottom face (-Y normal, reversed winding) ─────────────────────────
        for (let i = 1; i < n - 1; i++) {
            pushV(vertices[0].x,     yBot, vertices[0].z,     0, -1, 0);
            pushV(vertices[i + 1].x, yBot, vertices[i + 1].z, 0, -1, 0);
            pushV(vertices[i].x,     yBot, vertices[i].z,     0, -1, 0);
        }

        // ── Side faces (one quad per edge, outward normals) ───────────────────
        for (let i = 0; i < n; i++) {
            const j  = (i + 1) % n;
            const ax = vertices[i].x, az = vertices[i].z;
            const bx = vertices[j].x, bz = vertices[j].z;

            // Outward normal = rotate edge vector +90° in XZ.
            const ex  = bx - ax, ez = bz - az;
            const len = Math.sqrt(ex * ex + ez * ez) || 1;
            const nx  =  ez / len;
            const nz  = -ex / len;

            // First triangle of quad.
            pushV(ax, yBot, az, nx, 0, nz);
            pushV(bx, yBot, bz, nx, 0, nz);
            pushV(ax, yTop, az, nx, 0, nz);

            // Second triangle of quad.
            pushV(bx, yBot, bz, nx, 0, nz);
            pushV(bx, yTop, bz, nx, 0, nz);
            pushV(ax, yTop, az, nx, 0, nz);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
        return geo;
    }
}
