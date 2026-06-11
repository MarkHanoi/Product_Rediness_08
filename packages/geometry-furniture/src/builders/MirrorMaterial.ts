// §63.1 / bedroom-mirror (2026-06-11) — shared reflective MIRROR material.
//
// ROOT CAUSE this fixes: the mirror builders (wall_mirror / bathroom_mirror /
// wc_mirror) previously hard-coded a dark-emissive glass slab (color ~#e8eef0
// over emissive 0x303030, metalness ~0.9) framed in a near-black 0x303030 frame.
// With no scene reflection that read as a flat DARK / BLACK board — the §63.1
// "bathroom mirror is black" defect and the bedroom's blank-panel look.
//
// A real mirror is a near-perfect specular reflector: metalness ≈ 1.0, very low
// roughness, a light silver tint, and a boosted envMapIntensity so it picks up
// whatever scene reflection (env map / IBL) is available. With no env map it
// still reads as a bright polished-silver surface (the closest non-reflective
// approximation), NOT a black board.
//
// Pure: returns a fresh MeshStandardMaterial per call (no shared-mutation leak;
// the mirror builders own + dispose their own materials).

import * as THREE from '@pryzm/renderer-three/three';

/** Light near-white silver — the canonical mirror glass tint. */
export const MIRROR_SILVER = 0xeef2f4;

/**
 * Build the reflective mirror-glass material.
 *
 * - `metalness: 1.0`        — a mirror is a pure metallic reflector.
 * - `roughness: 0.04`       — near-mirror-smooth (0.03–0.08 reads as glass mirror).
 * - `color: MIRROR_SILVER`  — light silvery tint so it never renders dark.
 * - `envMapIntensity: 1.6`  — boost any available scene reflection (IBL / env map);
 *                             harmless when no env map is bound.
 * - NO `emissive` darkening  — the previous dark emissive is what made it read black.
 */
export function makeMirrorMaterial(color: number = MIRROR_SILVER): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color,
        metalness: 1.0,
        roughness: 0.04,
        envMapIntensity: 1.6,
    });
}
