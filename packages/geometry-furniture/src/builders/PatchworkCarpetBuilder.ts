import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * PatchworkCarpetBuilder
 *
 * Procedural soft-furnishing carpet inspired by hand-woven patchwork rugs:
 * a grid of small rectangular tiles in muted earthy/jewel tones (terracotta,
 * mustard, teal, navy, ivory, sage, charcoal, plum…).
 *
 * Geometry (mirrors ChevronCarpetBuilder for contractual parity):
 *   - Thin BoxGeometry as the rug body (width × thickness × length).
 *   - PlaneGeometry placed slightly above the top face, textured with a
 *     procedurally-drawn patchwork CanvasTexture so the tile pattern follows
 *     the rug dimensions without UV stretching.
 *   - Subtle fringe stripes at the two short ends.
 *
 * Parametric behaviour:
 *   The number of tile columns / rows is derived from the rug's real-world
 *   dimensions divided by a fixed tile size (~10 cm). Resizing the rug in the
 *   property panel EXTENDS the patchwork (more tiles at the same scale)
 *   rather than stretching the existing tiles.
 *
 * Determinism: tile colours are picked from a fixed palette via a seeded
 *   hash of (col, row) — same dimensions always produce the same pattern.
 *
 * Material handling: rug body / fringe use the MaterialService cache; the
 *   patchwork texture is unique per build (canvas-derived) and is freed on
 *   the material's `dispose` event to avoid GPU leaks on rebuild.
 */
export class PatchworkCarpetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();

        const width  = data.width  || 3.0;
        const length = data.length || 2.0;
        // Carpets are very thin — clamp aggressively. Default 4 mm.
        const thickness = Math.max(0.002, Math.min(data.height || 0.004, 0.012));

        // ── 1. Rug body (thin slab) ──────────────────────────────────────────
        const baseColor = 0xf1ead8; // Pale ivory — matches the patchwork ground.
        const baseMat = this.materialService.getMaterial(baseColor, 'standard');
        const baseGeo = new THREE.BoxGeometry(width, thickness, length);
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(0, thickness / 2, 0);
        base.userData = { isCarpetPart: true, role: 'body' };
        group.add(base);

        // ── 2. Patchwork pattern overlay (CanvasTexture on a top plane) ──────
        const texture = this._buildPatchworkTexture(width, length);
        const patternMat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.92,
            metalness: 0.0,
        });
        // FurnitureFragmentBuilder disposes unique materials on rebuild but the
        // material's `.map` texture is NOT auto-disposed — hook the material's
        // dispose event so this CanvasTexture is freed too (no GPU leak).
        patternMat.addEventListener('dispose', () => texture.dispose());

        const planeGeo = new THREE.PlaneGeometry(width, length);
        const pattern = new THREE.Mesh(planeGeo, patternMat);
        pattern.rotation.x = -Math.PI / 2;
        pattern.position.set(0, thickness + 0.0008, 0);
        pattern.userData = { isCarpetPart: true, role: 'pattern' };
        group.add(pattern);

        // ── 3. Subtle fringe at the two short ends ───────────────────────────
        const fringeColor = 0xe8dec4; // Warm ivory — matches woven trim.
        const fringeMat = this.materialService.getMaterial(fringeColor, 'standard');
        const fringeDepth = Math.min(0.04, length * 0.02);
        const fringeGeo = new THREE.BoxGeometry(width, thickness * 0.8, fringeDepth);
        const fringeFront = new THREE.Mesh(fringeGeo, fringeMat);
        fringeFront.position.set(0, thickness / 2, length / 2 + fringeDepth / 2);
        fringeFront.userData = { isCarpetPart: true, role: 'fringe' };
        const fringeBack = new THREE.Mesh(fringeGeo, fringeMat);
        fringeBack.position.set(0, thickness / 2, -length / 2 - fringeDepth / 2);
        fringeBack.userData = { isCarpetPart: true, role: 'fringe' };
        group.add(fringeFront);
        group.add(fringeBack);

        group.userData = { ...(group.userData ?? {}), role: 'carpet', variant: 'patchwork' };
        return group;
    }

    /**
     * Draw a multi-coloured patchwork grid onto a 2D canvas and return it as a
     * THREE.CanvasTexture. The grid resolution scales with the rug's real-world
     * dimensions so resizing extends the pattern (more tiles) rather than
     * stretching individual tiles.
     */
    private _buildPatchworkTexture(width: number, length: number): THREE.CanvasTexture {
        // Real-world tile size — chosen to match the reference photo (~10 cm).
        const TILE_SIZE_M = 0.10;

        const cols = Math.max(6, Math.round(width  / TILE_SIZE_M));
        const rows = Math.max(6, Math.round(length / TILE_SIZE_M));

        // Canvas pixel budget: ~64 px per tile, capped at 4096 in either dim.
        const PX_PER_TILE = 64;
        const canvasW = Math.min(4096, cols * PX_PER_TILE);
        const canvasH = Math.min(4096, rows * PX_PER_TILE);

        const canvas = document.createElement('canvas');
        canvas.width  = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d')!;

        // Pale ivory ground — same tone as the lightest tiles so tile borders
        // disappear (no dark seams between patches).
        ctx.fillStyle = '#f1ead8';
        ctx.fillRect(0, 0, canvasW, canvasH);

        const tileW = canvasW / cols;
        const tileH = canvasH / rows;

        // Faded retro palette — dusty pastels with low saturation.
        const palette = [
            '#c98a7a', '#d9a86a', '#e0c98a', '#a8b78a', '#8ab0a8',
            '#7a98b0', '#a890b0', '#c0a090', '#d4c0a0', '#f0e6cc',
            '#b88a8a', '#8a8a8a', '#a8c0c0', '#c8a890', '#9ab098',
            '#b89ab0', '#8aa098', '#dccaa0', '#b09a88', '#b8b890',
        ];

        // Deterministic colour pick — same dimensions always produce the same
        // pattern. Hash uses col+row so adjacent tiles vary.
        const pick = (c: number, r: number): string => {
            const h = (c * 73856093) ^ (r * 19349663);
            return palette[Math.abs(h) % palette.length];
        };

        // Tiles are drawn edge-to-edge with a +1 px overlap to guarantee no
        // background hairlines bleed through between adjacent patches.
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                ctx.fillStyle = pick(c, r);
                const x0 = Math.round(c * tileW);
                const y0 = Math.round(r * tileH);
                const x1 = Math.round((c + 1) * tileW);
                const y1 = Math.round((r + 1) * tileH);
                ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        return texture;
    }
}
