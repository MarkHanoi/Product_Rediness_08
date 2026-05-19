/**
 * @file WallRegionExtractor.ts
 *
 * @deprecated
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURAL STATUS: PLACEHOLDER — DO NOT EXTEND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file is currently used only by AIService.ts → CREATE_ROOF_BY_REGION intent.
 * It contains two known contract violations and one algorithmic inadequacy:
 *
 * 1. CONTRACT VIOLATION (Class C — 04-BIM-AI-MODIFICATION-PROTOCOL §3.1):
 *    Directly accesses `window.wallStore` instead of using AIReadModel or // TODO(TASK-08)
 *    the Store Event Bus. This breaks the AI layer's isolation contract.
 *
 * 2. CONTRACT VIOLATION (01-BIM-ENGINE-CORE-CONTRACT §1.2 Phase 2):
 *    This class is supposed to implement the Topology Layer (planar graph +
 *    cycle detection). The current implementation is a convex hull, not a
 *    planar graph. A convex hull cannot represent L-shaped, U-shaped, or
 *    courtyard buildings — it always produces the outermost rectangular
 *    approximation, which is wrong for any non-convex building.
 *
 * 3. ALGORITHMIC INADEQUACY:
 *    The Jarvis march (gift wrapping) convex hull algorithm cannot detect
 *    rooms or non-convex building perimeters. The class comment itself
 *    acknowledges: "In a real implementation, this would use a graph-based
 *    cycle detection."
 *
 * PLANNED REPLACEMENT (Phase E):
 *    Replace with a true Topology Layer implementing:
 *    - Planar graph construction from wall intersection nodes and edges
 *    - DFS cycle detection for room face identification
 *    - Outer face extraction for building perimeter (→ slab and roof polygon)
 *    - Driven via AIReadModel.getWallsByLevel() — no direct store access
 *
 * Until Phase E is implemented, this placeholder remains in use for the roof
 * creation feature. Do not copy its patterns elsewhere in the codebase.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from '@pryzm/renderer-three/three';
import { AIWall } from './AITypes.js';

export class WallRegionExtractor {
    /**
     * Extracts the outermost closed perimeter from a set of walls.
     *
     * @deprecated See file-level deprecation notice. This uses a convex hull,
     * not a planar graph. Produces incorrect results for non-convex buildings.
     * Replacement is tracked under Phase E of the PDF-to-BIM reconstruction plan.
     */
    static extractOutermostRegion(walls: AIWall[]): THREE.Vector2[] | null {
        if (walls.length < 3) return null;

        // CONTRACT VIOLATION: direct window.wallStore access.
        // This should use AIReadModel.getWallsByLevel() per 04-BIM §3.1.
        // Retained as-is pending Phase E replacement.
        const wallStore = window.wallStore; // TODO(TASK-08)
        if (!wallStore) return null;

        const levelId = walls[0]!.levelId;
        const levelWalls = wallStore.getByLevel(levelId);

        if (levelWalls.length < 3) return null;

        const points: THREE.Vector2[] = [];
        for (const wall of levelWalls) {
            if (wall.baseLine && wall.baseLine.length >= 2) {
                points.push(new THREE.Vector2(wall.baseLine[0].x, wall.baseLine[0].z));
                points.push(new THREE.Vector2(wall.baseLine[1].x, wall.baseLine[1].z));
            }
        }

        if (points.length < 3) return null;

        // Convex hull via Jarvis march (gift wrapping).
        // NOTE: This is NOT a room boundary algorithm. For convex buildings it
        // approximates the perimeter. For L-shaped or non-convex buildings it
        // will produce a hull that cuts across interior space.
        const hull: THREE.Vector2[] = [];

        let l = 0;
        for (let i = 1; i < points.length; i++) {
            if (points[i]!.x < points[l]!.x) l = i;
        }

        let p = l, q;
        do {
            hull.push(points[p]!);
            q = (p + 1) % points.length;

            for (let i = 0; i < points.length; i++) {
                const val =
                    (points[i]!.y - points[p]!.y) * (points[q]!.x - points[i]!.x) -
                    (points[i]!.x - points[p]!.x) * (points[q]!.y - points[i]!.y);
                if (val < 0) q = i;
            }

            p = q;
        } while (p !== l);

        return hull;
    }
}
