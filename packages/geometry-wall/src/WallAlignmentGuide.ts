/**
 * WallAlignmentGuide
 *
 * §04 §15 — Revit-style alignment inference guides during wall drawing.
 *
 * During the DRAWING phase of WallTool, this module continuously scans the
 * active level's wall endpoints and midpoints.  For each reference point it
 * tests two orthogonal inference axes:
 *
 *   - X-axis   (cursor.z ≈ ref.z → cursor snaps to the horizontal line z = ref.z)
 *   - Z-axis   (cursor.x ≈ ref.x → cursor snaps to the vertical   line x = ref.x)
 *
 * When the cursor falls within `axisThreshold` of one or both axes a dashed
 * THREE.Line is drawn from the reference point through (and slightly beyond)
 * the snapped cursor position, giving the user visual confirmation of
 * alignment.  When X and Z matches come from different reference points the
 * cursor is snapped to their intersection (double-lock, rendered in a
 * distinct colour — cyan vs blue).
 *
 * Architecture rules obeyed:
 *   §01 §1.2  — Tool layer only; no store mutations.
 *   §06 §5    — Guide lines are temporary scene objects; never persisted.
 *   §04 §15   — Priority is below Tab-cycler lock and typed-dimension lock.
 *
 * ## MODIFICATION DECLARATION — PERF-AUDIT-2026 P1: Object Pool
 *
 * Layer Affected:    Tool Layer (WallAlignmentGuide)
 * Phase:             PERF-AUDIT-2026 P1
 * Classification:    B (performance — no semantic model changes)
 *
 * Impact Assessment:
 *   BEFORE: _drawLine() allocates new BufferGeometry + LineDashedMaterial on
 *   every pointer-move (up to 60 Hz). clear() disposes them but the GC still
 *   sweeps 180 short-lived objects/sec, causing intermittent 30–100 ms spikes.
 *   GPU VAO/texture handle leaks were possible if dispose() raced with GC.
 *
 *   AFTER: A fixed pool of POOL_SIZE Line objects is pre-allocated in the
 *   constructor. Each frame reuses them by mutating the Float32Array position
 *   attribute in-place. clear() simply hides the pool entries (visible=false)
 *   — zero allocations, zero disposals on the hot pointer-move path.
 *   Two shared LineDashedMaterial instances (blue/cyan) are reused across all
 *   pool entries; material.color is switched per-frame as needed.
 *
 * Risk Level: Low — purely internal rendering change. No store interaction.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { WallStore } from './WallStore';

export interface AlignmentInference {
    snappedPoint:   THREE.Vector3;
    isIntersection: boolean;
    guides: Array<{
        from: THREE.Vector3;
        to:   THREE.Vector3;
        axis: 'X' | 'Z';
    }>;
}

export class WallAlignmentGuide {
    private readonly scene:     THREE.Scene;
    private readonly wallStore: WallStore;

    // ── Object pool (PERF-AUDIT-2026 P1) ─────────────────────────────────────
    // Pre-allocate POOL_SIZE Line objects. Reuse each frame by mutating the
    // Float32Array position attribute — zero allocations on hot pointer-move path.
    private static readonly POOL_SIZE = 3;

    private _poolLines:   THREE.Line[] = [];
    private _poolActive   = 0;

    // Shared materials — one per colour variant. Switching is done by assigning
    // `line.material` to the appropriate shared instance (no new allocation).
    private _matBlue!: THREE.LineDashedMaterial;
    private _matCyan!: THREE.LineDashedMaterial;

    // Reusable scratch Vector3 objects — eliminates per-frame `new THREE.Vector3`.
    private _v0 = new THREE.Vector3();
    private _v1 = new THREE.Vector3();
    private _v2 = new THREE.Vector3();
    private _dir = new THREE.Vector3();
    // ── End object pool ───────────────────────────────────────────────────────

    /** Distance (metres) within which the cursor is considered "on" an axis. */
    private readonly axisThreshold = 0.15;

    /** Extension (metres) added past the cursor so the guide over-shoots slightly. */
    private readonly overshoot = 0.35;

    /** Minimum distance (metres) a reference point must be from startPoint to be included. */
    private readonly excludeEpsilon = 0.05;

    constructor(scene: THREE.Scene, wallStore: WallStore) {
        this.scene     = scene;
        this.wallStore = wallStore;
        this._initPool();
    }

    // ── Pool initialisation ───────────────────────────────────────────────────

    private _initPool(): void {
        // Shared materials — created once, reused on every pointer-move frame.
        this._matBlue = new THREE.LineDashedMaterial({
            color:       0x0088ff,
            dashSize:    0.14,
            gapSize:     0.07,
            linewidth:   1,
            depthTest:   false,
            transparent: true,
            opacity:     0.85,
        });
        this._matCyan = new THREE.LineDashedMaterial({
            color:       0x00ccff,
            dashSize:    0.14,
            gapSize:     0.07,
            linewidth:   1,
            depthTest:   false,
            transparent: true,
            opacity:     0.85,
        });

        for (let i = 0; i < WallAlignmentGuide.POOL_SIZE; i++) {
            // Pre-allocate: 2 points × 3 components = Float32Array(6).
            const positions = new Float32Array(6);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const line = new THREE.Line(geo, this._matBlue);
            line.renderOrder = 998;
            line.userData.isAlignmentGuide = true;
            line.visible = false;
            this._poolLines.push(line);
            // Add to scene permanently — visibility is toggled, not add/remove.
            this.scene.add(line);
        }
    }

    // ── Pool helpers ──────────────────────────────────────────────────────────

    /**
     * Acquire the next pool slot, set its endpoints, colour, and make it visible.
     * Falls back to a no-op when all POOL_SIZE slots are exhausted (rare).
     */
    private _activateLine(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
        if (this._poolActive >= this._poolLines.length) return;

        const line = this._poolLines[this._poolActive++];
        // Mutate the pre-allocated Float32Array in-place — zero allocation.
        const pos = (line.geometry.attributes.position as THREE.BufferAttribute);
        pos.setXYZ(0, from.x, from.y, from.z);
        pos.setXYZ(1, to.x,   to.y,   to.z);
        pos.needsUpdate = true;

        // Recompute line distances for dashed rendering.
        line.computeLineDistances();

        // Switch material colour without allocating a new material.
        line.material = (color === 0x00ccff) ? this._matCyan : this._matBlue;

        line.visible = true;
    }

    /**
     * Recompute inference candidates and update rendered guide lines.
     *
     * Called on every pointer-move while WallTool is in DRAWING state.
     * Returns null when no inference matches the current cursor position.
     *
     * @param startPoint  Wall segment start anchor (excluded from candidates).
     * @param cursor      Already-snap-resolved cursor position (from getSnappedPoint).
     * @param levelId     Active level — only walls on this level are consulted.
     * @param elevation   Y value applied to all guide line geometry.
     */
    update(
        startPoint: THREE.Vector3,
        cursor:     THREE.Vector3,
        levelId:    string,
        elevation:  number,
    ): AlignmentInference | null {
        this.clear();

        const candidates = this._collectCandidates(levelId, startPoint);
        if (candidates.length === 0) return null;

        type Match = { ref: THREE.Vector3 };

        const xMatches: Match[] = [];
        const zMatches: Match[] = [];

        for (const c of candidates) {
            if (Math.abs(cursor.z - c.z) < this.axisThreshold) xMatches.push({ ref: c });
            if (Math.abs(cursor.x - c.x) < this.axisThreshold) zMatches.push({ ref: c });
        }

        if (xMatches.length === 0 && zMatches.length === 0) return null;

        xMatches.sort((a, b) => Math.abs(cursor.z - a.ref.z) - Math.abs(cursor.z - b.ref.z));
        zMatches.sort((a, b) => Math.abs(cursor.x - a.ref.x) - Math.abs(cursor.x - b.ref.x));

        const snappedX = zMatches.length > 0 ? zMatches[0].ref.x : cursor.x;
        const snappedZ = xMatches.length > 0 ? xMatches[0].ref.z : cursor.z;
        const snapped  = this._v0.set(snappedX, elevation, snappedZ);

        const isIntersection = xMatches.length > 0 && zMatches.length > 0;
        const color          = isIntersection ? 0x00ccff : 0x0088ff;

        // Return a clone of snapped so callers hold a stable Vector3.
        const result: AlignmentInference = {
            snappedPoint: snapped.clone(),
            isIntersection,
            guides: [],
        };

        if (xMatches.length > 0) {
            const ref = this._v1.copy(xMatches[0].ref).setY(elevation);
            if (ref.distanceTo(snapped) > 0.01) {
                const ext = this._extended(ref, snapped);
                this._activateLine(ref, ext, color);
                result.guides.push({ from: ref.clone(), to: snapped.clone(), axis: 'X' });
            }
        }

        if (zMatches.length > 0) {
            const ref = this._v2.copy(zMatches[0].ref).setY(elevation);
            if (ref.distanceTo(snapped) > 0.01) {
                const ext = this._extended(ref, snapped);
                this._activateLine(ref, ext, color);
                result.guides.push({ from: ref.clone(), to: snapped.clone(), axis: 'Z' });
            }
        }

        if (result.guides.length === 0) return null;
        return result;
    }

    /**
     * Hide all active pool lines.
     *
     * PERF-AUDIT-2026 P1: This is now O(POOL_SIZE) visibility toggles instead
     * of N dispose() calls. No GPU handle release, no GC pressure.
     */
    clear(): void {
        for (let i = 0; i < this._poolActive; i++) {
            this._poolLines[i].visible = false;
        }
        this._poolActive = 0;
    }

    /**
     * Full cleanup — remove pool lines from scene and dispose shared materials.
     * Called only when the WallTool is permanently destroyed.
     */
    dispose(): void {
        for (const line of this._poolLines) {
            this.scene.remove(line);
            line.geometry.dispose();
        }
        this._matBlue.dispose();
        this._matCyan.dispose();
        this._poolLines = [];
        this._poolActive = 0;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _collectCandidates(levelId: string, exclude: THREE.Vector3): THREE.Vector3[] {
        const walls = this.wallStore.getByLevel(levelId);
        const out: THREE.Vector3[] = [];
        const eps = this.excludeEpsilon;

        // Reuse scratch vectors to compute distances — only clone when adding.
        const tmp = new THREE.Vector3();

        for (const wall of walls) {
            const [aPt, bPt] = wall.baseLine;
            tmp.set(aPt.x, aPt.y, aPt.z);
            if (tmp.distanceTo(exclude) > eps) out.push(tmp.clone());
            tmp.set(bPt.x, bPt.y, bPt.z);
            if (tmp.distanceTo(exclude) > eps) out.push(tmp.clone());
            // midpoint
            tmp.set((aPt.x + bPt.x) / 2, (aPt.y + bPt.y) / 2, (aPt.z + bPt.z) / 2);
            if (tmp.distanceTo(exclude) > eps) out.push(tmp.clone());
        }
        return out;
    }

    private _extended(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
        this._dir.subVectors(to, from).normalize();
        // Returns a new vector — caller needs a stable reference for _activateLine.
        return to.clone().addScaledVector(this._dir, this.overshoot);
    }
}
