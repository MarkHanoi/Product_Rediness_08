import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { legacyCarpetCanvasSize } from './carpetPatterns';

/**
 * ChevronCarpetBuilder
 *
 * Procedural soft-furnishing carpet with a black-and-white chevron (zig-zag)
 * pattern, modelled to match the reference image (rectangular flat rug, very
 * thin profile, repeating chevron rows in two contrasting tones).
 *
 * Geometry:
 *   - Thin BoxGeometry as the rug body (width × height × length).
 *   - PlaneGeometry placed slightly above the top face, textured with a
 *     procedurally-drawn chevron CanvasTexture so the pattern follows the
 *     rug dimensions without UV stretching.
 *
 * Determinism: pattern is fully deterministic — depends only on dimensions.
 * Material handling: rug body uses MaterialService cache; the chevron texture
 *   is unique per build (canvas-derived), consistent with how other plant /
 *   glass builders create their own one-off materials.
 */
export class ChevronCarpetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();

        const width  = data.width  || 3.0;
        const length = data.length || 2.0;
        // Carpets are very thin — clamp aggressively. Default 4 mm.
        const thickness = Math.max(0.002, Math.min(data.height || 0.004, 0.012));

        // ── 1. Rug body (thin slab) ──────────────────────────────────────────
        const baseColor = 0xf5f5f5; // Off-white edge tone
        const baseMat = this.materialService.getMaterial(baseColor, 'standard');
        const baseGeo = new THREE.BoxGeometry(width, thickness, length);
        const base = new THREE.Mesh(baseGeo, baseMat);
        // Place body so its bottom sits exactly on the floor (y=0 at base).
        base.position.set(0, thickness / 2, 0);
        base.userData = { isCarpetPart: true, role: 'body' };
        group.add(base);

        // ── 2. Chevron pattern overlay (CanvasTexture on a top plane) ────────
        // Pattern is regenerated every rebuild (when width/length change in the
        // property panel) so the chevron rows EXTEND rather than stretch — peak
        // density stays at a constant real-world spacing regardless of size.
        // §CARPET97 (2026-08-25) — `_buildChevronTexture` may now return null
        // where there is no 2D context (headless / SSR / the happy-dom test
        // environment this package runs in). It used to write `getContext('2d')!`
        // and TypeError on the next line, which is why this builder has never
        // had a build() test. Fall back to the flat body colour instead.
        const texture = this._buildChevronTexture(width, length);
        const patternMat = texture
            ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0.0 })
            : new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.95, metalness: 0.0 });
        // FurnitureFragmentBuilder disposes unique materials on rebuild but the
        // material's `.map` texture is NOT auto-disposed — hook the material's
        // dispose event so this CanvasTexture is freed too (no GPU leak).
        if (texture) patternMat.addEventListener('dispose', () => texture.dispose());

        const planeGeo = new THREE.PlaneGeometry(width, length);
        const pattern = new THREE.Mesh(planeGeo, patternMat);
        // Lay flat (default plane is XY → rotate to XZ) and float just above
        // the top face to prevent z-fighting.
        pattern.rotation.x = -Math.PI / 2;
        pattern.position.set(0, thickness + 0.0008, 0);
        pattern.userData = { isCarpetPart: true, role: 'pattern' };
        group.add(pattern);

        // ── 3. Subtle fringe at the two short ends (visual cue for fabric) ───
        const fringeColor = 0xeeeeee;
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

        group.userData = { ...(group.userData ?? {}), role: 'carpet', variant: 'chevron' };
        return group;
    }

    /**
     * Draw a black-and-white chevron pattern onto a 2D canvas and return it as
     * a THREE.CanvasTexture.
     *
     * Parametric behaviour:
     *   The number of zig-zag rows (vertically) and peaks (horizontally) is
     *   computed from the rug's real-world dimensions divided by a fixed
     *   wavelength (~12 cm). This means resizing the rug in the property panel
     *   EXTENDS the pattern (more rows / more peaks at the same scale) rather
     *   than stretching the existing chevrons.
     *
     *   §CARPET97 (2026-08-25) — the canvas budget moved to the shared
     *   `legacyCarpetCanvasSize` (256 px/m, hard 1024 px cap) so this carpet
     *   shares one ceiling with the other twelve. It was ~80 px per peak capped
     *   at 4096, i.e. 2000 × 1333 for a 3 × 2 m rug — 13.6 MB of RGBA with mips,
     *   in every room the auto-furnish `rug` kind touches. The step maths below
     *   is `canvasW / peaks`, so the PATTERN IS UNCHANGED; only crispness moved.
     *
     * Returns null where there is no 2D context; the caller falls back to a
     * flat colour rather than throwing.
     */
    private _buildChevronTexture(width: number, length: number): THREE.CanvasTexture | null {
        // Real-world peak spacing — chosen to match the reference photo.
        const PEAK_WAVELENGTH_M = 0.12; // 12 cm horizontal wavelength
        const PEAK_HEIGHT_M     = 0.10; // 10 cm vertical row height

        const peaks    = Math.max(4, Math.round(width  / PEAK_WAVELENGTH_M));
        const rowCount = Math.max(6, Math.round(length / PEAK_HEIGHT_M));

        const { canvasW, canvasH } = legacyCarpetCanvasSize(width, length);

        if (typeof document === 'undefined') return null;
        const canvas = document.createElement('canvas');
        canvas.width  = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        // ── Background (off-white) ───────────────────────────────────────────
        ctx.fillStyle = '#f4f4f4';
        ctx.fillRect(0, 0, canvasW, canvasH);

        const peakW = canvasW / peaks;
        const rowH  = canvasH / rowCount;

        // ── Chevron stripes: thick zig-zag polylines, every other row ───────
        // Each "row" is one zig-zag period vertically (one V height).
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineCap     = 'butt';
        ctx.lineJoin    = 'miter';
        ctx.miterLimit  = 6;
        ctx.lineWidth   = rowH * 0.55; // band thickness ~55 % of row height

        for (let row = 0; row < rowCount; row += 2) {
            const yBase = row * rowH + rowH / 2;
            ctx.beginPath();
            // Zig-zag across the full width: rises by rowH/2, falls by rowH/2.
            for (let i = 0; i <= peaks; i++) {
                const x = i * peakW;
                const y = yBase + (i % 2 === 0 ? -rowH * 0.25 : rowH * 0.25);
                if (i === 0) ctx.moveTo(x, y);
                else         ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        return texture;
    }
}
