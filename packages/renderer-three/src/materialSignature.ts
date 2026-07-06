// §PERF-INSTANCE-MATERIAL-DEDUP (L-131 P6) — pure VISUAL-SIGNATURE serializer.
//
// PROBLEM this exists to solve (C04 / ADR-0076 Axis 3):
//   GPU instancing groups elements by `_hashGeometry(geometry, material, level)`,
//   whose key includes `material.uuid` (InstancedElementRenderer.ts). Builders
//   that mint a FRESH THREE.Material on every element (ColumnFragmentBuilder,
//   BeamFragmentBuilder, HandrailFragmentBuilder, StairRailingBuilder, …) give
//   every element a UNIQUE uuid → one InstanceGroup of size 1 per element →
//   instancing collapses NOTHING (N elements = N draw calls). Walls already fixed
//   this locally with a colour-keyed cache (§INSTANCE-MAT-SHARE); this generalises
//   the idea for ALL instanced element types via a shared cache keyed by the
//   value below.
//
// WHAT THIS IS: a PURE, deterministic fingerprint of a material's VISUAL identity
//   — every property that changes how the surface looks. Two materials with the
//   same signature render identically, so they can safely SHARE one THREE.Material
//   instance (and therefore one InstanceGroup / one draw call). Two materials that
//   differ in ANY captured property get different signatures and are never merged,
//   so genuinely-different appearances stay distinct.
//
// CONSERVATIVE BY CONSTRUCTION: returns `null` (→ "do NOT dedup, keep this
//   material's own uuid") for any material this serializer does not fully
//   understand — a non-classic material type (ShaderMaterial / *NodeMaterial /
//   custom), or one explicitly opted out via `userData.__noInstanceDedup`. This
//   guarantees exotic / AI-authored / per-instance-mutated materials never get
//   force-shared into a cross-element colour bleed. Missing-but-known props read
//   as their absent sentinel, so Basic/Lambert/Phong/Standard/Physical all share
//   one code path.
//
// P2 (single THREE owner): THREE is imported via the renderer-three re-export;
//   this file lives INSIDE renderer-three so it may read THREE material types.
//   It is a pure THREE-reading serializer — no allocation, no mutation, no I/O.

import * as THREE from './three-re-export';

/**
 * Classic material `.type` strings this serializer fully captures. Anything else
 * (ShaderMaterial, MeshStandardNodeMaterial, MeshPhysicalNodeMaterial, sprite /
 * points / line materials, custom subclasses) returns `null` from
 * {@link materialInstanceSignature} → the caller must NOT dedup it.
 */
const DEDUP_ELIGIBLE_TYPES: ReadonlySet<string> = new Set([
    'MeshBasicMaterial',
    'MeshLambertMaterial',
    'MeshPhongMaterial',
    'MeshStandardMaterial',
    'MeshPhysicalMaterial',
]);

/**
 * Scalar / boolean / enum properties that affect appearance. Read generically —
 * a material missing a key contributes the `u` (undefined) sentinel, so all five
 * eligible types share one code path. Order is fixed so the key is stable.
 */
const SCALAR_KEYS: readonly string[] = [
    // Common Material base
    'opacity', 'transparent', 'alphaTest', 'alphaHash', 'side', 'shadowSide',
    'depthTest', 'depthWrite', 'colorWrite', 'wireframe', 'vertexColors',
    'toneMapped', 'premultipliedAlpha', 'blending', 'dithering', 'fog',
    'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits',
    // Standard / Physical PBR scalars
    'roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity',
    'aoMapIntensity', 'bumpScale', 'displacementScale', 'displacementBias',
    'flatShading', 'reflectivity', 'refractionRatio', 'combine',
    // Phong / Lambert
    'shininess',
    // Physical extras
    'clearcoat', 'clearcoatRoughness', 'ior', 'transmission', 'thickness',
    'sheen', 'sheenRoughness', 'specularIntensity', 'iridescence',
    'iridescenceIOR', 'attenuationDistance', 'anisotropy', 'anisotropyRotation',
];

/** THREE.Color properties that affect appearance. */
const COLOR_KEYS: readonly string[] = [
    'color', 'emissive', 'specular', 'sheenColor', 'specularColor',
    'attenuationColor',
];

/**
 * THREE.Texture-bearing properties. Captured by texture `.uuid` — textures are
 * already shared/cached upstream, so uuid equality is the correct identity test.
 * Two materials that reference DIFFERENT maps therefore never merge.
 */
const TEXTURE_KEYS: readonly string[] = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'bumpMap', 'displacementMap', 'alphaMap', 'envMap', 'lightMap',
    'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
    'sheenColorMap', 'sheenRoughnessMap', 'specularMap', 'specularColorMap',
    'specularIntensityMap', 'transmissionMap', 'thicknessMap',
    'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap',
];

function scalarToken(v: unknown): string {
    if (v === undefined) return 'u';
    if (v === null) return 'n';
    if (typeof v === 'number') {
        // Round to 4dp so float noise ('0.30000000004') cannot fork the cache.
        return Number.isFinite(v) ? v.toFixed(4) : String(v);
    }
    if (typeof v === 'boolean') return v ? 'T' : 'F';
    return String(v);
}

/**
 * Compute a stable VISUAL signature for a material, or `null` when the material
 * must NOT be deduped (unrecognised type or explicit opt-out).
 *
 * PURE: reads only; never allocates a THREE object, never mutates the material.
 *
 * @param material any THREE.Material
 * @returns a signature string safe to use as a shared-material cache key, or
 *          `null` meaning "leave this material on its own uuid" (no sharing).
 */
export function materialInstanceSignature(material: THREE.Material): string | null {
    // Explicit opt-out escape hatch — a builder can stamp this on a genuinely
    // per-instance material (e.g. an AI-tinted one it mutates in place) to keep
    // it off the shared path even if its current props happen to collide.
    if ((material.userData as { __noInstanceDedup?: boolean } | undefined)?.__noInstanceDedup === true) {
        return null;
    }

    const type = material.type;
    if (!DEDUP_ELIGIBLE_TYPES.has(type)) return null;

    const m = material as unknown as Record<string, unknown>;
    const parts: string[] = [type];

    for (const key of SCALAR_KEYS) {
        parts.push(`${key}=${scalarToken(m[key])}`);
    }

    for (const key of COLOR_KEYS) {
        const c = m[key] as THREE.Color | undefined;
        parts.push(`${key}=${c && typeof c.getHexString === 'function' ? c.getHexString() : 'u'}`);
    }

    for (const key of TEXTURE_KEYS) {
        const t = m[key] as THREE.Texture | null | undefined;
        parts.push(`${key}=${t ? t.uuid : 'x'}`);
    }

    // normalScale is a Vector2 — capture both components.
    const ns = m['normalScale'] as THREE.Vector2 | undefined;
    if (ns && typeof ns.x === 'number') {
        parts.push(`normalScale=${scalarToken(ns.x)},${scalarToken(ns.y)}`);
    }

    return parts.join('|');
}
