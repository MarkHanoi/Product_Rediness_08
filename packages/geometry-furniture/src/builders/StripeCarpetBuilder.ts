import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';

/**
 * StripeCarpetBuilder
 *
 * Procedural soft-furnishing carpet with vertical multi-coloured stripes that
 * smoothly fade into one another (gradient-blended bands rather than hard
 * edges) — inspired by hand-loomed kilim runners.
 *
 * Geometry (mirrors ChevronCarpetBuilder for contractual parity):
 *   - Thin BoxGeometry as the rug body (width × thickness × length).
 *   - PlaneGeometry placed slightly above the top face, textured with a
 *     procedurally-drawn striped CanvasTexture so the bands follow the rug
 *     dimensions without UV stretching.
 *   - Subtle fringe stripes at the two short ends.
 *
 * Parametric behaviour:
 *   The number of colour bands is derived from the rug's real-world width
 *   divided by a fixed band size (~12 cm). Resizing the rug in the property
 *   panel EXTENDS the stripe field (more bands at the same scale) rather
 *   than stretching the existing bands.
 *
 * Determinism: band colours are picked from a fixed retro palette via a
 *   seeded hash of the band index — same dimensions always produce the same
 *   pattern.
 *
 * Material handling: rug body / fringe use the MaterialService cache; the
 *   stripe texture is unique per build (canvas-derived) and is freed on the
 *   material's `dispose` event to avoid GPU leaks on rebuild.
 */
export class StripeCarpetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();

        const width  = data.width  || 3.0;
        const length = data.length || 2.0;
        // Carpets are very thin — clamp aggressively. Default 4 mm.
        const thickness = Math.max(0.002, Math.min(data.height || 0.004, 0.012));

        // ── 1. Rug body (thin slab) ──────────────────────────────────────────
        const baseColor = 0xe8dec4; // Pale ivory edge tone.
        const baseMat = this.materialService.getMaterial(baseColor, 'standard');
        const baseGeo = new THREE.BoxGeometry(width, thickness, length);
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(0, thickness / 2, 0);
        base.userData = { isCarpetPart: true, role: 'body' };
        group.add(base);

        // ── 2. Stripe pattern overlay (CanvasTexture on a top plane) ─────────
        const texture = this._buildStripeTexture(width, length);
        const patternMat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.92,
            metalness: 0.0,
        });
        // FurnitureFragmentBuilder disposes unique materials on rebuild but
        // material `.map` is NOT auto-disposed — hook the material's dispose
        // event so this CanvasTexture is freed too (no GPU leak).
        patternMat.addEventListener('dispose', () => texture.dispose());

        const planeGeo = new THREE.PlaneGeometry(width, length);
        const pattern = new THREE.Mesh(planeGeo, patternMat);
        pattern.rotation.x = -Math.PI / 2;
        pattern.position.set(0, thickness + 0.0008, 0);
        pattern.userData = { isCarpetPart: true, role: 'pattern' };
        group.add(pattern);

        // ── 3. Subtle fringe at the two short ends ───────────────────────────
        const fringeColor = 0xe8dec4;
        const fringeMat = this.materialService.getMaterial(fringeColor, 'standard');
        const fringeDepth = Math.min(0.04, length * 0.02);
        const fringeGeo = new THREE.BoxGeometry(width, thickness * 0.8, fringeDepth);
        const fringeFront = new THREE.Mesh(fringeGeo, fringeMat);
        fringeFront.position.set(0, thickness / 2, length / 2 + fringeDepth / 2);
        fringeFront.userData = { isCarpetPart: true, role: 'fringe' };
        const fringeBack = new THREE.Mesh(fringeGeo, fringeMat);
        fringeBack.position.set(0, thickness / 2, -length / 2 - fringeDepth / 2);
        fringeBack.userData = { isCarpetPart: true, role: 'fringe' };
        group.add(fringeFront, fringeBack);

        group.userData = { ...(group.userData ?? {}), role: 'carpet', variant: 'stripe' };
        return group;
    }

    /**
     * Draw a vertical-stripe pattern with smooth colour-to-colour gradients
     * between bands onto a 2D canvas and return it as a THREE.CanvasTexture.
     *
     * The number of bands scales with real-world width so resizing the rug
     * extends the pattern (more bands) rather than stretching the bands.
     */
    private _buildStripeTexture(width: number, length: number): THREE.CanvasTexture {
        // Real-world band size — chosen to match the reference photo.
        const BAND_WIDTH_M = 0.12;

        const bandCount = Math.max(8, Math.round(width / BAND_WIDTH_M));

        // Canvas pixel budget — enough to render smooth gradients per band.
        const PX_PER_BAND = 80;
        const canvasW = Math.min(4096, bandCount * PX_PER_BAND);
        const canvasH = Math.min(4096, Math.round(canvasW * (length / width)));

        const canvas = document.createElement('canvas');
        canvas.width  = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d')!;

        // Faded retro palette — warm earthy tones.
        const palette = [
            '#a83a2a', '#c8843a', '#d9b04a', '#e0c98a', '#5d7a3a',
            '#3a6b6b', '#2f4a6b', '#5b3a6b', '#8a5a4a', '#bda37a',
            '#7a3a3a', '#6b8a8a', '#a86b3a', '#4a5a3a', '#9a6b8a',
        ];

        // Deterministic per-band colour pick.
        const pick = (i: number): string => {
            const h = (i + 1) * 2654435761;
            return palette[Math.abs(h) % palette.length];
        };

        const bandPxW = canvasW / bandCount;

        // Each band is a vertical linearGradient that fades from its own
        // colour at the LEFT edge to the NEXT band's colour at the RIGHT edge,
        // producing a smooth colour-to-colour blend rather than a hard seam.
        for (let i = 0; i < bandCount; i++) {
            const x0 = i * bandPxW;
            const x1 = (i + 1) * bandPxW;
            const grad = ctx.createLinearGradient(x0, 0, x1, 0);
            grad.addColorStop(0, pick(i));
            grad.addColorStop(1, pick(i + 1));
            ctx.fillStyle = grad;
            // +1 px overlap on the right edge to suppress any hairline seams
            // from sub-pixel rounding between adjacent gradient regions.
            ctx.fillRect(Math.round(x0), 0, Math.ceil(bandPxW) + 1, canvasH);
        }

        // ── Subtle horizontal weave noise — adds woven-fabric texture ───────
        // Faint dark lines across the rug at constant real-world spacing.
        const WEAVE_LINE_SPACING_PX = 6;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        for (let y = 0; y < canvasH; y += WEAVE_LINE_SPACING_PX) {
            ctx.fillRect(0, y, canvasW, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        return texture;
    }
}
