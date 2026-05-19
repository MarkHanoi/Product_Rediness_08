/**
 * ViewPlane — Contract 24 §3.1
 *
 * Defines the abstract "work plane" for any 2D view type. All interactive
 * coordinate reconstruction (element creation, annotation placement, snapping)
 * must go through this abstraction rather than assuming the XZ horizontal plane.
 *
 * Contract compliance:
 *   §01 §3.3  — Pure runtime type; no store, no DOM, no Three.js renderer access.
 *   §03 §1.1  — ViewPlane is NOT serialised; it is computed on-demand from ViewDefinition.
 *   §05       — No DOM or UI imports.
 *   §23 §1.3  — Coordinate system: world-up = +Y; plan proj plane = XZ; section = XY or ZY.
 *
 * Usage:
 *   const plane = viewPlaneFromDefinition(viewDef, levelElevation);
 *   const world3D = canvasHitToWorld3D(hit, plane);
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { ViewDefinition } from './ViewDefinitionTypes';

// ── Shared scratch objects (never exposed) ────────────────────────────────────
const _worldUp = new THREE.Vector3(0, 1, 0);
const _scratch  = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime description of the interactive work plane for a 2D view.
 *
 * Coordinate axes (all unit vectors in world space):
 *   normal  — points AWAY from the viewer (into the screen).
 *   right   — points to the right as seen in the 2D canvas.
 *   up      — points upward as seen in the 2D canvas.
 *   origin  — a representative point on the plane (used for plane construction).
 */
export interface ViewPlane {
    readonly normal:     THREE.Vector3;
    readonly right:      THREE.Vector3;
    readonly up:         THREE.Vector3;
    readonly origin:     THREE.Vector3;
    /**
     * THREE.Plane for use with THREE.Raycaster.ray.intersectPlane().
     * Satisfies: normal · x + constant = 0 for all points x on the plane.
     */
    readonly threePlane: THREE.Plane;
    /** The view type this plane was derived from — for diagnostics only. */
    readonly viewType:   string;
    /**
     * Whether the view is a "vertical" view (section/elevation).
     * When true, the vertical canvas axis maps to world-Y (elevation).
     * When false, the vertical canvas axis maps to world-Z (depth in plan).
     */
    readonly isVertical: boolean;
    /**
     * The world axis that maps to the HORIZONTAL canvas axis.
     * 'x' → worldX is horizontal; 'z' → worldZ is horizontal.
     * Mirrors PlanViewCanvas._hWorldAxis.
     */
    readonly hWorldAxis: 'x' | 'z';
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a `ViewPlane` from a `ViewDefinition` and the active level elevation.
 *
 * - Plan / ceiling-plan / structural-plan / detail / drafting:
 *     Horizontal plane at `levelElevation`. Normal = (0, +1, 0), right = (1, 0, 0), up = (0, 0, -1).
 *
 * - Section / elevation:
 *     Vertical plane whose normal is derived from `spatial.projectionDirection`
 *     (or `spatial.sectionPlane.normal`). right = cross(worldUp, normal); up = worldUp.
 *
 * The returned object is immutable. Create a new one whenever the view changes.
 */
export function viewPlaneFromDefinition(
    viewDef: ViewDefinition,
    levelElevation: number,
): ViewPlane {
    const vt = viewDef.viewType ?? 'plan';

    if (vt === 'section' || vt === 'elevation') {
        return _buildVerticalPlane(viewDef, levelElevation);
    }

    // Plan-family: plan, ceiling-plan, structural-plan, detail, drafting, analysis, etc.
    return _buildHorizontalPlane(levelElevation, vt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a 2D canvas hit returned by `PlanViewCanvas.screenToWorld()` into a
 * 3D world-space point that lies on the given ViewPlane.
 *
 * ## Why this is needed
 * `PlanViewCanvas.screenToWorld()` always returns `{ worldX, worldZ }`. The
 * variable name `worldZ` is misleading for section/elevation views where it
 * actually carries **world-Y (elevation)** — see Contract 22 §6.1.
 * This function encapsulates the axis mapping so callers never deal with it.
 *
 * ## Plan-family views (isVertical = false)
 *   world3D = (hit.worldX, levelElevation, hit.worldZ)
 *   (worldZ is true world-Z; levelElevation from the plane origin)
 *
 * ## Section/elevation views (isVertical = true)
 *   The "horizontal" canvas axis is `hWorldAxis` ('x' or 'z').
 *   The "vertical" canvas axis maps to world-Y (elevation).
 *   hit.worldX → world[hWorldAxis]
 *   hit.worldZ → worldY (elevation)
 *
 *   So:
 *     if hWorldAxis = 'x': world3D = (hit.worldX, hit.worldZ, plane.origin.z)
 *     if hWorldAxis = 'z': world3D = (plane.origin.x, hit.worldZ, hit.worldX)
 *
 * @returns A THREE.Vector3 on the view plane in world space.
 */
export function canvasHitToWorld3D(
    hit: { worldX: number; worldZ: number },
    plane: ViewPlane,
): THREE.Vector3 {
    if (!plane.isVertical) {
        // Plan-family: worldX → X, worldZ → Z, Y = level elevation
        return new THREE.Vector3(hit.worldX, plane.origin.y, hit.worldZ);
    }

    // Section / elevation — reconstruct correct 3D position
    if (plane.hWorldAxis === 'x') {
        // Front/back sections: horizontal axis = worldX, vertical = worldY
        return new THREE.Vector3(hit.worldX, hit.worldZ, plane.origin.z);
    } else {
        // Left/right sections: horizontal axis = worldZ, vertical = worldY
        return new THREE.Vector3(plane.origin.x, hit.worldZ, hit.worldX);
    }
}

/**
 * Snap a 3D world point onto the view plane surface.
 * Useful for clamping a 3D tool cursor to the active view plane.
 */
export function snapToViewPlane(point3D: THREE.Vector3, plane: ViewPlane): THREE.Vector3 {
    const dist = plane.threePlane.distanceToPoint(point3D);
    return _scratch.copy(plane.normal).multiplyScalar(-dist).add(point3D).clone();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal builders
// ─────────────────────────────────────────────────────────────────────────────

function _buildHorizontalPlane(levelElevation: number, viewType: string): ViewPlane {
    const normal  = new THREE.Vector3(0, 1, 0);
    const right   = new THREE.Vector3(1, 0, 0);
    const up      = new THREE.Vector3(0, 0, -1);
    const origin  = new THREE.Vector3(0, levelElevation, 0);
    const threePlane = new THREE.Plane(normal.clone(), -levelElevation);

    return Object.freeze({
        normal, right, up, origin, threePlane,
        viewType,
        isVertical: false,
        hWorldAxis: 'x',
    });
}

function _buildVerticalPlane(viewDef: ViewDefinition, levelElevation: number): ViewPlane {
    // Resolve view direction ─────────────────────────────────────────────────
    // Priority: explicit projectionDirection > sectionPlane normal > fallback (0,0,-1)
    let dir: THREE.Vector3;

    const explicitDir = viewDef.spatial?.projectionDirection;
    if (explicitDir && (explicitDir.x !== 0 || explicitDir.y !== 0 || explicitDir.z !== 0)) {
        dir = new THREE.Vector3(explicitDir.x, explicitDir.y, explicitDir.z).normalize();
    } else {
        const spn = viewDef.spatial?.sectionPlane?.normal;
        if (spn) {
            dir = new THREE.Vector3(spn[0], spn[1], spn[2]).normalize();
        } else {
            dir = new THREE.Vector3(0, 0, -1); // fallback: front elevation
        }
    }

    // Force dir to be horizontal (vertical planes have no Y component in the normal)
    dir.y = 0;
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, -1);
    dir.normalize();

    // Build axes ─────────────────────────────────────────────────────────────
    // normal = view direction (pointing into screen)
    const normal = dir.clone();
    // right = cross(worldUp, normal) — points right in the 2D canvas
    const right  = new THREE.Vector3().crossVectors(_worldUp, normal).normalize();
    // up = worldUp (elevation increases upward in all section/elevation views)
    const up     = new THREE.Vector3(0, 1, 0);

    // Determine hWorldAxis: if abs(dir.x) > abs(dir.z), the view is front/back → hAxis = 'x'
    // (matches PlanViewCanvas._buildContext logic in PlanViewManager)
    const hWorldAxis: 'x' | 'z' = Math.abs(dir.x) > Math.abs(dir.z) ? 'z' : 'x';

    // Origin: on the section plane if defined, else on world origin at level elevation
    let origin: THREE.Vector3;
    const sp = viewDef.spatial?.sectionPlane;
    if (sp) {
        // Plane eq: n·x + constant = 0 → origin = n × (−constant)
        origin = new THREE.Vector3(
            sp.normal[0] * (-sp.constant),
            levelElevation,
            sp.normal[2] * (-sp.constant),
        );
    } else {
        origin = new THREE.Vector3(0, levelElevation, 0);
    }

    const threePlane = new THREE.Plane(normal.clone(), -normal.dot(origin));

    return Object.freeze({
        normal, right, up, origin, threePlane,
        viewType: viewDef.viewType ?? 'section',
        isVertical: true,
        hWorldAxis,
    });
}
