/**
 * WallFaceDetector — §DIM-I4
 *
 * Moved from src/engine/subsystems/core/views/plantools/WallFaceDetector.ts
 * during Sprint C (S5.1-P2 2026-05-10). Original path is now a re-export shim.
 *
 * WallData / WallLayer are now defined as minimal structural stubs here
 * (type-only; compatible with the actual WallData from @pryzm/walls).
 */

import * as THREE from '@pryzm/renderer-three/three';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal structural stubs for WallData / WallLayer
// (No dependency on @pryzm/walls — type-only structural compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export interface WallLayer {
    function: string;
    thickness: number;
}

export interface WallData {
    id: string;
    baseLine: Array<{ x: number; y: number; z: number }>;
    thickness?: number;
    width?: number;
    layers?: WallLayer[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public face types
// ─────────────────────────────────────────────────────────────────────────────

export type WallFaceType =
    | 'face:exterior'
    | 'face:interior'
    | 'wall:centerline'
    | 'core:exterior'
    | 'core:interior'
    | 'core:centerline';

export const ALL_WALL_FACE_TYPES: readonly WallFaceType[] = [
    'face:exterior',
    'face:interior',
    'wall:centerline',
    'core:exterior',
    'core:interior',
    'core:centerline',
];

export interface WallFaceHit {
    faceType:   WallFaceType;
    param:      number;
    facePoint:  THREE.Vector3;
    faceNormal: THREE.Vector3;
    wallId:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer analysis helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface WallCoreOffsets {
    exteriorFinish: number;
    interiorFinish: number;
}

export function computeWallCoreOffsets(layers: WallLayer[] | undefined): WallCoreOffsets {
    if (!layers || layers.length === 0) return { exteriorFinish: 0, interiorFinish: 0 };
    const firstStructIdx = layers.findIndex(l => l.function === 'structure');
    if (firstStructIdx === -1) return { exteriorFinish: 0, interiorFinish: 0 };
    let lastStructIdx = firstStructIdx;
    for (let i = layers.length - 1; i > firstStructIdx; i--) {
        if (layers[i]!.function === 'structure') { lastStructIdx = i; break; }
    }
    const exteriorFinish = layers.slice(0, firstStructIdx).reduce((sum, l) => sum + l.thickness, 0);
    const interiorFinish = layers.slice(lastStructIdx + 1).reduce((sum, l) => sum + l.thickness, 0);
    return { exteriorFinish, interiorFinish };
}

export function wallFaceSignedOffset(
    faceType: WallFaceType,
    halfThick: number,
    exteriorFinish: number,
    interiorFinish: number
): number {
    switch (faceType) {
        case 'face:exterior':   return  halfThick;
        case 'face:interior':   return -halfThick;
        case 'wall:centerline': return  0;
        case 'core:exterior':   return  halfThick - exteriorFinish;
        case 'core:interior':   return -(halfThick - interiorFinish);
        case 'core:centerline': {
            const coreExterior = halfThick - exteriorFinish;
            const coreInterior = -(halfThick - interiorFinish);
            return (coreExterior + coreInterior) * 0.5;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — detectWallFace
// ─────────────────────────────────────────────────────────────────────────────

export function detectWallFace(
    hitPoint: THREE.Vector3,
    wall: WallData,
    preferredFace: WallFaceType = 'face:exterior'
): WallFaceHit | null {
    const bl = wall.baseLine;
    if (!bl || bl.length < 2) return null;

    const s = new THREE.Vector3(bl[0]!.x, bl[0]!.y, bl[0]!.z);
    const e = new THREE.Vector3(bl[1]!.x, bl[1]!.y, bl[1]!.z);

    const wallVec = new THREE.Vector3().subVectors(e, s);
    const wallLen = wallVec.length();
    if (wallLen < 0.001) return null;

    const wallDir    = wallVec.clone().normalize();
    const Y_UP       = new THREE.Vector3(0, 1, 0);
    const faceNormal = new THREE.Vector3().crossVectors(wallDir, Y_UP).normalize();

    const toHit     = new THREE.Vector3().subVectors(hitPoint, s);
    const paramRaw  = toHit.dot(wallDir) / wallLen;
    const param     = Math.max(0, Math.min(1, paramRaw));
    const basePoint = new THREE.Vector3().lerpVectors(s, e, param);
    const lateralVec = new THREE.Vector3().subVectors(hitPoint, basePoint);
    const signedLat  = lateralVec.dot(faceNormal);

    const halfThick = (wall.thickness ?? wall.width ?? 0.2) * 0.5;
    const { exteriorFinish, interiorFinish } = computeWallCoreOffsets(wall.layers);

    const TIE_TOL = 0.0005;
    let bestFace = preferredFace;
    let bestDist = Infinity;

    for (const faceType of ALL_WALL_FACE_TYPES) {
        const planeOffset = wallFaceSignedOffset(faceType, halfThick, exteriorFinish, interiorFinish);
        const dist = Math.abs(signedLat - planeOffset);
        if (dist < bestDist - TIE_TOL) {
            bestDist = dist; bestFace = faceType;
        } else if (dist < bestDist + TIE_TOL && faceType === preferredFace) {
            bestDist = dist; bestFace = faceType;
        }
    }

    const snapOffset = wallFaceSignedOffset(bestFace, halfThick, exteriorFinish, interiorFinish);
    const facePoint  = basePoint.clone().addScaledVector(faceNormal, snapOffset);

    return { faceType: bestFace, param, facePoint, faceNormal: faceNormal.clone(), wallId: wall.id };
}
