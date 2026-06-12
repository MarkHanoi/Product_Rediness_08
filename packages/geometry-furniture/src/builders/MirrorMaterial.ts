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
 * - `metalness: 0.95`       — a near-pure metallic reflector (a hair under 1.0 so
 *                             a sliver of diffuse remains → never pitch-black when
 *                             no env map is bound; pure metal has NO diffuse term
 *                             and relies entirely on reflections, which is exactly
 *                             how the §63.1 fix could still read dark in the
 *                             default no-IBL scene the founder tested).
 * - `roughness: 0.06`       — near-mirror-smooth, but rough enough that direct
 *                             scene lights produce a visible specular highlight
 *                             (a perfectly smooth metal with no env map shows
 *                             almost nothing).
 * - `color: MIRROR_SILVER`  — light silvery tint so it never renders dark.
 * - `envMapIntensity: 1.8`  — boost any available scene reflection (IBL / env map);
 *                             harmless when no env map is bound.
 * - `emissive` faint silver  — a small floor brightness so the panel reads as a
 *                             bright mirror even in a flat / unlit preview. This is
 *                             a LIFT (light), not the §63.1-era dark emissive that
 *                             made it read black.
 */
export function makeMirrorMaterial(color: number = MIRROR_SILVER): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.95,
        roughness: 0.06,
        envMapIntensity: 1.8,
        emissive: new THREE.Color(0x222a30),
        emissiveIntensity: 0.35,
    });
}
