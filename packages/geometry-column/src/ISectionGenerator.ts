/**
 * ISectionGenerator
 *
 * Procedural I/H-section geometry builder for steel columns (UC) and beams (UB).
 * Follows EN 10025 / BS4 cross-section definitions with parametric D, B, t, T, r.
 *
 * Architecture:
 *   - Pure geometry module — no scene, no store, no event bus.
 *   - Returns THREE.BufferGeometry / THREE.LOD for use by builders.
 *   - All input dimensions are in METRES (callers convert mm→m via SteelProfileLibrary.toMetres).
 *
 * LOD levels:
 *   'close'   (< 15 m from camera) — full 12-point I-shape + fillet segments
 *   'medium'  (15–40 m)            — simplified 12-point I-shape (no fillets)
 *   'far'     (> 40 m)             — simple BoxGeometry
 *
 * Contract: §01 §D.3 — builders receive frozen data; geometry computed here.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { SteelProfile, SteelProfileLibrary } from './SteelProfileLibrary';

export type LODLevel = 'close' | 'medium' | 'far';

/**
 * Cache key: `{profileName}:{length_mm}:{lod}`
 * Caches identical profiles+length combinations to avoid re-triangulation.
 */
const _geoCache = new Map<string, THREE.BufferGeometry>();

function cacheKey(profileName: string, lengthM: number, lod: LODLevel): string {
    return `${profileName}:${Math.round(lengthM * 1000)}:${lod}`;
}

// ── Shape builders ─────────────────────────────────────────────────────────────

/**
 * Build the I-section TWO.Shape in the XY plane, centred at origin.
 *
 * The 12 outer vertices traverse the I-outline counter-clockwise:
 *   bottom-left flange → bottom-right flange → web step up →
 *   web → top web step → top-left flange → back
 *
 * All dimensions in metres.
 */

/**
 * Build the I-section THREE.Shape in the XY plane, centred at origin.
 *
 * 12 outer vertices traverse the I-outline counter-clockwise for correct winding.
 * When withFillets is true, each of the 4 web/flange junctions is approximated
 * with a small arc (6 segments) of radius r.
 *
 * All dimensions in metres.
 */
function buildIShape(D: number, B: number, t: number, T: number, r: number, withFillets: boolean): THREE.Shape {
    const hw = B / 2;   // half flange width
    const hd = D / 2;   // half total depth
    const ht = t / 2;   // half web thickness

    // Inner flange face Y coordinate (= top of bottom flange, bottom of top flange)
    const fi = hd - T;  // flange inner Y (distance from centre to inner face)

    const shape = new THREE.Shape();

    // ── 12-point precise I-outline ──────────────────────────────────────────
    // Both LOD levels use the same 12-point shape; 'close' adds fillet arcs
    // at the 4 re-entrant web/flange corners.
    if (!withFillets || r < 0.001) {
        shape.moveTo(-hw, -hd);
        shape.lineTo( hw, -hd);
        shape.lineTo( hw, -fi);
        shape.lineTo( ht, -fi);
        shape.lineTo( ht,  fi);
        shape.lineTo( hw,  fi);
        shape.lineTo( hw,  hd);
        shape.lineTo(-hw,  hd);
        shape.lineTo(-hw,  fi);
        shape.lineTo(-ht,  fi);
        shape.lineTo(-ht, -fi);
        shape.lineTo(-hw, -fi);
        shape.closePath();
    } else {
        // Clamp fillet radius so it fits within web/flange geometry
        const ef = Math.min(r, Math.min(T * 0.45, (hw - ht) * 0.45));

        // Bottom flange — left to right bottom edge
        shape.moveTo(-hw, -hd);
        shape.lineTo( hw, -hd);
        // Right flange drop to inner face
        shape.lineTo( hw, -fi);
        // Fillet: bottom-right re-entrant corner (+X web, -Y flange inner)
        // Arc centre at (ht + ef, -fi + ef), radius ef
        // Goes from angle -PI/2 (top of circle) clockwise to PI (left side)
        shape.lineTo(ht + ef, -fi);
        shape.absarc(ht + ef, -fi + ef, ef, -Math.PI / 2, Math.PI, true);
        // Web right face going up
        shape.lineTo(ht, fi - ef);
        // Fillet: top-right re-entrant corner
        shape.absarc(ht + ef, fi - ef, ef, Math.PI, Math.PI / 2, true);
        shape.lineTo(hw, fi);
        // Top flange
        shape.lineTo(hw, hd);
        shape.lineTo(-hw, hd);
        shape.lineTo(-hw, fi);
        // Fillet: top-left re-entrant corner
        shape.lineTo(-ht - ef, fi);
        shape.absarc(-ht - ef, fi - ef, ef, Math.PI / 2, 0, true);
        // Web left face going down
        shape.lineTo(-ht, -fi + ef);
        // Fillet: bottom-left re-entrant corner
        shape.absarc(-ht - ef, -fi + ef, ef, 0, -Math.PI / 2, true);
        shape.lineTo(-hw, -fi);
        shape.closePath();
    }

    return shape;
}

/**
 * Generate extruded I-section geometry for a column (vertical extrusion along world Y).
 *
 * The shape is defined in the XY plane (X = B, Y = D), extruded along Z,
 * then rotated rotateX(PI/2) so the extrusion axis becomes world Y (upward).
 *
 * The resulting geometry spans Y from 0 (base) to `height` (top).
 * Builders should position the mesh at (x, baseY + baseOffset, z).
 */
export function generateColumnISection(
    profile: SteelProfile,
    height: number,
    lod: LODLevel = 'medium',
): THREE.BufferGeometry {
    const key = cacheKey(profile.name + ':col', height, lod);
    const cached = _geoCache.get(key);
    if (cached) return cached.clone();

    const { D, B, t, T, r } = SteelProfileLibrary.toMetres(profile);

    let geo: THREE.BufferGeometry;

    if (lod === 'far') {
        // Simple box approximation
        geo = new THREE.BoxGeometry(B, height, D);
        geo.translate(0, height / 2, 0);
    } else {
        const withFillets = lod === 'close';
        const shape = buildIShape(D, B, t, T, r, withFillets);
        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
            depth: height,
            bevelEnabled: false,
        };
        geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Shape is in XY: X=B-dir, Y=D-dir, extrusion along +Z=[0, height].
        //
        // rotateX(π/2) matrix is
        //     | 1  0  0 |
        //     | 0  0 -1 |
        //     | 0  1  0 |
        // so it maps (x, y, z) → (x, -z, y). The extrusion's +Z direction
        // therefore lands on -Y, and the geometry ends up spanning Y in
        // [-height, 0] — i.e. hanging BELOW the local origin.
        //
        // (Bug fixed 2026-04-23: an earlier comment claimed the post-rotate
        // span was [0, height]; it is not. The "steel column dives below the
        // floor when zoomed in" symptom — visible only on the medium/close
        // LODs where this branch runs — was caused by the missing translate.
        // The 'far' LOD uses BoxGeometry+translate(0, height/2, 0) so it
        // never exhibited the bug, which is why zooming out "fixed" it.)
        //
        // Lift the geometry by +height so it spans Y in [0, height], matching
        // the concrete BoxGeometry/CylinderGeometry path and matching the
        // OBB highlight expectation (root.y + height/2 = OBB centre).
        geo.rotateX(Math.PI / 2);
        geo.translate(0, height, 0);
        // After rotate + translate the geometry spans Y from 0 (base) to
        // `height` (top), with the local origin at the column base.
    }

    geo.computeBoundingBox();
    geo.computeVertexNormals();

    _geoCache.set(key, geo.clone());
    return geo;
}

/**
 * Generate extruded I-section geometry for a beam (extrusion along Z for length, then oriented).
 *
 * The shape is defined in the XY plane (X = B/flange-width, Y = D/total-depth).
 * Extruded along Z for the full beam length, centred so the midpoint is at origin.
 *
 * Builders should then:
 *   1. Position the mesh at the beam midpoint
 *   2. Apply orientation so local Z aligns with (end - start) using setFromUnitVectors or lookAt
 *
 * The geometry is centred in XY (shape centroid at 0,0) and centred in Z (spans -length/2 to +length/2).
 */
export function generateBeamISection(
    profile: SteelProfile,
    length: number,
    lod: LODLevel = 'medium',
): THREE.BufferGeometry {
    const key = cacheKey(profile.name + ':beam', length, lod);
    const cached = _geoCache.get(key);
    if (cached) return cached.clone();

    const { D, B, t, T, r } = SteelProfileLibrary.toMetres(profile);

    let geo: THREE.BufferGeometry;

    if (lod === 'far') {
        geo = new THREE.BoxGeometry(B, D, length);
    } else {
        const withFillets = lod === 'close';
        const shape = buildIShape(D, B, t, T, r, withFillets);
        const extrudeSettings: THREE.ExtrudeGeometryOptions = {
            depth: length,
            bevelEnabled: false,
        };
        geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Centre along Z (extrusion axis): shift by -length/2
        geo.translate(0, 0, -length / 2);
    }

    geo.computeBoundingBox();
    geo.computeVertexNormals();

    _geoCache.set(key, geo.clone());
    return geo;
}

/**
 * Create a THREE.LOD object for a steel column with three detail levels.
 * The LOD group is positioned at the column base; builders set world position externally.
 */
export function createColumnLOD(
    profile: SteelProfile,
    height: number,
    material: THREE.Material,
): THREE.LOD {
    const lod = new THREE.LOD();

    const geoClose  = generateColumnISection(profile, height, 'medium');
    const geoMedium = generateColumnISection(profile, height, 'medium');
    const geoFar    = generateColumnISection(profile, height, 'far');

    lod.addLevel(new THREE.Mesh(geoClose,  material), 0);
    lod.addLevel(new THREE.Mesh(geoMedium, material), 15);
    lod.addLevel(new THREE.Mesh(geoFar,    material), 40);

    return lod;
}

/**
 * Create a THREE.LOD object for a steel beam with three detail levels.
 * Builders set world position and orientation externally.
 */
export function createBeamLOD(
    profile: SteelProfile,
    length: number,
    material: THREE.Material,
): THREE.LOD {
    const lod = new THREE.LOD();

    const geoClose  = generateBeamISection(profile, length, 'close');
    const geoMedium = generateBeamISection(profile, length, 'medium');
    const geoFar    = generateBeamISection(profile, length, 'far');

    lod.addLevel(new THREE.Mesh(geoClose,  material), 0);
    lod.addLevel(new THREE.Mesh(geoMedium, material), 15);
    lod.addLevel(new THREE.Mesh(geoFar,    material), 40);

    return lod;
}

/**
 * Invalidate the geometry cache for a specific profile.
 * Call when a profile's dimensions change (parametric update).
 */
export function invalidateProfileCache(profileName: string): void {
    for (const key of _geoCache.keys()) {
        if (key.startsWith(profileName + ':')) {
            const geo = _geoCache.get(key)!;
            geo.dispose();
            _geoCache.delete(key);
        }
    }
}

/**
 * Clear the entire geometry cache. Useful on scene teardown.
 */
export function clearSectionCache(): void {
    for (const geo of _geoCache.values()) geo.dispose();
    _geoCache.clear();
}

/**
 * Compute snap targets for a steel column in world space.
 * Returns an array of {point, label} for use by SteelSnapProvider.
 *
 * Snap targets:
 *   - centreBase    — base centre of column
 *   - centreTop     — top centre of column
 *   - flange edges  — 4 flange-tip midpoints at mid-height
 */
export function columnSnapTargets(
    profile: SteelProfile,
    position: { x: number; y: number; z: number },
    height: number,
    rotation: number,
    baseOffset: number,
): Array<{ point: THREE.Vector3; label: string }> {
    const { D, B } = SteelProfileLibrary.toMetres(profile);
    const baseY = position.y + baseOffset;
    const topY  = baseY + height;
    const midY  = baseY + height / 2;
    const cx = position.x;
    const cz = position.z;

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Local axes (rotation about Y)
    const ax = cos; const az = -sin; // local X axis in world XZ
    const bx = sin; const bz =  cos; // local Z axis in world XZ

    const hw = B / 2;
    const hd = D / 2;

    const targets: Array<{ point: THREE.Vector3; label: string }> = [
        { point: new THREE.Vector3(cx, baseY, cz), label: 'centreBase' },
        { point: new THREE.Vector3(cx, topY,  cz), label: 'centreTop' },
        { point: new THREE.Vector3(cx, midY,  cz), label: 'centreMid' },
        // Flange tips (along B direction)
        { point: new THREE.Vector3(cx + ax * hw, midY, cz + az * hw), label: 'flangeEdge+X' },
        { point: new THREE.Vector3(cx - ax * hw, midY, cz - az * hw), label: 'flangeEdge-X' },
        // Web tips (along D direction)
        { point: new THREE.Vector3(cx + bx * hd, midY, cz + bz * hd), label: 'webEdge+Z' },
        { point: new THREE.Vector3(cx - bx * hd, midY, cz - bz * hd), label: 'webEdge-Z' },
    ];

    return targets;
}

/**
 * Compute snap targets for a steel beam in world space.
 */
export function beamSnapTargets(
    start: { x: number; y: number; z: number },
    end:   { x: number; y: number; z: number },
): Array<{ point: THREE.Vector3; label: string }> {
    const s = new THREE.Vector3(start.x, start.y, start.z);
    const e = new THREE.Vector3(end.x,   end.y,   end.z);
    const m = s.clone().add(e).multiplyScalar(0.5);

    return [
        { point: s.clone(), label: 'beamStart' },
        { point: e.clone(), label: 'beamEnd' },
        { point: m,         label: 'beamMidpoint' },
    ];
}
