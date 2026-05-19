/**
 * @file src/core/rendering/RenderMaterialLibrary.ts
 * @description Photorealistic PBR material definitions for Render Mode.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §3.5):
 *  - This library ONLY defines material parameters. It never mutates stores,
 *    accesses the scene directly, or calls builders.
 *  - Loaded lazily when the user enters Render Mode (zero startup cost).
 *  - The existing materialLibrary.ts (BIM authoring materials) is NOT modified.
 *
 * Texture sources (all CC0 / free commercial use):
 *  - Polyhaven Materials: polyhaven.com/textures
 *  - AmbientCG: ambientcg.com
 */

import * as THREE from '@pryzm/renderer-three/three';

export interface RenderMaterialDef {
    id: string;
    label: string;
    category: 'Concrete' | 'Metal' | 'Wood' | 'Glass' | 'Fabric' | 'Plaster' | 'Tile';
    params: THREE.MeshStandardMaterialParameters;
}

/**
 * Enhanced PBR material definitions for path-traced renders.
 * All values use physically correct ranges.
 * Textures are intentionally absent here; add via lazy TextureLoader
 * if you place 4K PBR maps in public/textures/render/.
 */
export const RENDER_MATERIAL_LIBRARY: RenderMaterialDef[] = [
    // ── CONCRETE ─────────────────────────────────────────────────────────────
    {
        id: 'render-concrete-smooth',
        label: 'Concrete · Smooth',
        category: 'Concrete',
        params: {
            color: new THREE.Color('#c8c8c4'),
            roughness: 0.82,
            metalness: 0.0,
            envMapIntensity: 0.4,
        },
    },
    {
        id: 'render-concrete-rough',
        label: 'Concrete · Rough',
        category: 'Concrete',
        params: {
            color: new THREE.Color('#b0b0aa'),
            roughness: 0.95,
            metalness: 0.0,
            envMapIntensity: 0.2,
        },
    },
    // ── PLASTER ──────────────────────────────────────────────────────────────
    {
        id: 'render-plaster-white',
        label: 'Plaster · White',
        category: 'Plaster',
        params: {
            color: new THREE.Color('#f5f5f2'),
            roughness: 0.9,
            metalness: 0.0,
            envMapIntensity: 0.3,
        },
    },
    {
        id: 'render-plaster-warm',
        label: 'Plaster · Warm White',
        category: 'Plaster',
        params: {
            color: new THREE.Color('#f2eeea'),
            roughness: 0.88,
            metalness: 0.0,
            envMapIntensity: 0.3,
        },
    },
    // ── METAL ────────────────────────────────────────────────────────────────
    {
        id: 'render-steel-brushed',
        label: 'Steel · Brushed',
        category: 'Metal',
        params: {
            color: new THREE.Color('#9aa0a8'),
            roughness: 0.35,
            metalness: 0.95,
            envMapIntensity: 1.0,
        },
    },
    {
        id: 'render-steel-polished',
        label: 'Steel · Polished',
        category: 'Metal',
        params: {
            color: new THREE.Color('#b8bec8'),
            roughness: 0.05,
            metalness: 1.0,
            envMapIntensity: 1.5,
        },
    },
    {
        id: 'render-aluminum',
        label: 'Aluminum · Anodised',
        category: 'Metal',
        params: {
            color: new THREE.Color('#c0c4cc'),
            roughness: 0.15,
            metalness: 0.9,
            envMapIntensity: 1.2,
        },
    },
    // ── WOOD ─────────────────────────────────────────────────────────────────
    {
        id: 'render-wood-oak',
        label: 'Wood · Oak',
        category: 'Wood',
        params: {
            color: new THREE.Color('#c8a96e'),
            roughness: 0.65,
            metalness: 0.0,
            envMapIntensity: 0.3,
        },
    },
    {
        id: 'render-wood-walnut',
        label: 'Wood · Walnut',
        category: 'Wood',
        params: {
            color: new THREE.Color('#6b4a35'),
            roughness: 0.7,
            metalness: 0.0,
            envMapIntensity: 0.25,
        },
    },
    {
        id: 'render-wood-pine',
        label: 'Wood · Pine',
        category: 'Wood',
        params: {
            color: new THREE.Color('#ddc08a'),
            roughness: 0.75,
            metalness: 0.0,
            envMapIntensity: 0.2,
        },
    },
    // ── GLASS ────────────────────────────────────────────────────────────────
    {
        id: 'render-glass-clear',
        label: 'Glass · Clear',
        category: 'Glass',
        params: {
            color: new THREE.Color(0.85, 0.9, 1.0),
            roughness: 0.02,
            metalness: 0.0,
            transparent: true,
            opacity: 0.15,
            envMapIntensity: 1.5,
        },
    },
    {
        id: 'render-glass-frosted',
        label: 'Glass · Frosted',
        category: 'Glass',
        params: {
            color: new THREE.Color(0.92, 0.92, 0.95),
            roughness: 0.55,
            metalness: 0.0,
            transparent: true,
            opacity: 0.45,
            envMapIntensity: 0.8,
        },
    },
    // ── FABRIC ───────────────────────────────────────────────────────────────
    {
        id: 'render-fabric-linen',
        label: 'Fabric · Linen',
        category: 'Fabric',
        params: {
            color: new THREE.Color('#e8dcc8'),
            roughness: 0.97,
            metalness: 0.0,
            envMapIntensity: 0.1,
        },
    },
    {
        id: 'render-fabric-dark',
        label: 'Fabric · Dark',
        category: 'Fabric',
        params: {
            color: new THREE.Color('#2a2a2a'),
            roughness: 0.98,
            metalness: 0.0,
            envMapIntensity: 0.05,
        },
    },
    // ── TILE ─────────────────────────────────────────────────────────────────
    {
        id: 'render-tile-marble',
        label: 'Tile · Marble',
        category: 'Tile',
        params: {
            color: new THREE.Color('#f0ede8'),
            roughness: 0.1,
            metalness: 0.0,
            envMapIntensity: 0.7,
        },
    },
    {
        id: 'render-tile-terracotta',
        label: 'Tile · Terracotta',
        category: 'Tile',
        params: {
            color: new THREE.Color('#c4704a'),
            roughness: 0.85,
            metalness: 0.0,
            envMapIntensity: 0.2,
        },
    },
];

/**
 * Returns a fresh THREE.MeshStandardMaterial instance from a render library definition.
 * Each call returns a new instance so sharing material state across meshes is avoided.
 */
export function createRenderMaterial(id: string): THREE.MeshStandardMaterial | null {
    const def = RENDER_MATERIAL_LIBRARY.find(d => d.id === id);
    if (!def) return null;
    return new THREE.MeshStandardMaterial(def.params);
}

/**
 * Maps BIM authoring material IDs to render-mode equivalents.
 * This enables automatic render-quality substitution when entering Render Mode.
 */
export const BIM_TO_RENDER_MATERIAL_MAP: Record<string, string> = {
    'concrete-smooth':   'render-concrete-smooth',
    'concrete-rough':    'render-concrete-rough',
    'steel-structural':  'render-steel-brushed',
    'wood-oak':          'render-wood-oak',
    'glass-clear':       'render-glass-clear',
    'glass-frosted':     'render-glass-frosted',
    'plastic-white':     'render-plaster-white',
};
