/**
 * @file packages/geometry-furniture/src/builders/RoundBraidedCarpetBuilder.ts
 *
 * §CARPET97 design 7 (founder, 2026-08-25) — concentric braided rings in mixed
 * bright colours on natural jute. **THIS ONE IS ROUND**, and that is an
 * architectural difference, not a pattern swap.
 *
 * WHY IT IS ITS OWN FILE AND ITS OWN CLASS
 * ----------------------------------------
 * Every other carpet in this package is a rectangle with fringe at its two
 * SHORT ENDS. A round rug has no short ends — its edge IS the outermost braid —
 * and its body is a disc, not a slab. Bolting the rectangle's assumptions onto
 * it would produce a fringe hanging off a circle and a square body poking out
 * from under the pattern, so instead:
 *
 *   • body   — `CylinderGeometry(r, r, thickness, 48)`, centred, lifted by
 *              thickness/2 so its BOTTOM sits on y = 0 (same rule as the slab);
 *   • overlay— `CircleGeometry(r, 48)` rotated -π/2 and floated
 *              `thickness + 0.8 mm` above, exactly as the rectangles do;
 *   • fringe  — NONE. Deliberately absent, not forgotten.
 *
 * THE DIAMETER RULE
 * -----------------
 * A circle has ONE diameter but `FurnitureData` carries `width` AND `length`.
 * **diameter = min(width, length)** — the disc is inscribed in the footprint the
 * user drew, so the rug can never overhang the space allocated to it. A user who
 * drags a 3.0 × 2.0 m footprint gets a 2.0 m rug centred in it.
 *
 * ⚠ WHAT THE SURROUNDING SYSTEM STILL ASSUMES (reported, not silently absorbed):
 *   • the carousel registry entry ships a SQUARE default (2.4 × 2.4) so the
 *     inscribed disc fills it;
 *   • selection bounds / plan symbols derive from the element's width × length
 *     box, so a non-square footprint leaves a selection rectangle wider than the
 *     visible disc. That is the same behaviour the existing `kave_round_carpet`
 *     GLB has, so this builder is not introducing a new inconsistency — but it
 *     is not fixing one either. See the §CARPET97 ISSUE-LOG rows.
 *
 * Triangle budget: 192 (cylinder, 48 radial segments) + 48 (circle) = **240 tris**
 * against 38 for a rectangular rug. 48 segments puts the chord at ~16 cm on a
 * 2.4 m rug — smooth at furniture scale and still an order of magnitude below a
 * single plant.
 *
 * P2: THREE via the `@pryzm/renderer-three/three` subpath.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import { CARPET_PATTERNS, planCarpetTexture, carpetTextureBytes } from './carpetPatterns';
import { createCarpetTexture } from './carpetTexture';
import { carpetThickness } from './ParametricCarpetBuilders';

/** Radial segments for the disc. See the header for the chord-length reasoning. */
export const ROUND_CARPET_SEGMENTS = 48;

export class RoundBraidedCarpetBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const spec = CARPET_PATTERNS.round_braided;

        // THE DIAMETER RULE — inscribed in the footprint (see header).
        const diameter = Math.max(0.2, Math.min(data.width || 2.4, data.length || 2.4));
        const radius = diameter / 2;
        const thickness = carpetThickness(data.height);

        // ── 1. Disc body ─────────────────────────────────────────────────────
        const baseMat = this.materialService.getMaterial(spec.bodyColor, 'standard');
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, thickness, ROUND_CARPET_SEGMENTS),
            baseMat,
        );
        // CylinderGeometry is centred on its own origin, so +thickness/2 puts the
        // bottom face exactly on y = 0 — the same invariant as the slab carpets.
        base.position.set(0, thickness / 2, 0);
        base.userData = { isCarpetPart: true, role: 'body' };
        group.add(base);

        // ── 2. Braid pattern overlay ─────────────────────────────────────────
        // The canvas is SQUARE (diameter × diameter): CircleGeometry's UVs map a
        // unit square onto the disc, so a centred concentric drawing lands true.
        const made = createCarpetTexture('round_braided', diameter, diameter);
        const plan = made?.plan ?? planCarpetTexture('round_braided', diameter, diameter);

        const patternMat = made
            ? new THREE.MeshStandardMaterial({
                map: made.texture, roughness: spec.roughness, metalness: 0.0,
            })
            : new THREE.MeshStandardMaterial({
                color: spec.bodyColor, roughness: spec.roughness, metalness: 0.0,
            });
        if (made) {
            const { texture } = made;
            patternMat.addEventListener('dispose', () => texture.dispose());
        }

        const pattern = new THREE.Mesh(
            // A hair inside the body radius so the disc's rim is never overhung.
            new THREE.CircleGeometry(radius * 0.999, ROUND_CARPET_SEGMENTS),
            patternMat,
        );
        pattern.rotation.x = -Math.PI / 2;
        pattern.position.set(0, thickness + 0.0008, 0);
        pattern.userData = {
            isCarpetPart: true, role: 'pattern',
            patternVariant: 'round_braided',
            diameter,
            motifCountX: plan.motifCountX, motifCountY: plan.motifCountY,
            wavelengthXm: plan.wavelengthXm, wavelengthYm: plan.wavelengthYm,
            canvasW: plan.canvasW, canvasH: plan.canvasH,
            tiled: plan.tiled, textureBytes: carpetTextureBytes(plan),
        };
        group.add(pattern);

        // ── 3. NO FRINGE ─────────────────────────────────────────────────────
        // A braided round rug's perimeter is the last coil of the braid itself.
        // The rectangles' two short-end fringes have no counterpart here.

        group.userData = { ...(group.userData ?? {}), role: 'carpet', variant: 'round_braided' };
        return group;
    }
}
