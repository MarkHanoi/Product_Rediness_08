/**
 * @file packages/geometry-furniture/src/builders/ParametricCarpetBuilders.ts
 *
 * §CARPET97 (founder, 2026-08-25) — nine RECTANGULAR procedural carpets, built
 * to the exact shape `ChevronCarpetBuilder` / `PatchworkCarpetBuilder` /
 * `StripeCarpetBuilder` established. The tenth design is round and lives in
 * `RoundBraidedCarpetBuilder.ts`, because a circle is a different body, not a
 * different pattern.
 *
 * WHAT IS SHARED, AND WHY
 * -----------------------
 * The existing three carpets each inline the SAME 40 lines of body / overlay /
 * fringe geometry. Repeating that nine more times would be copy-paste, not
 * parity, so the geometry lives once in `ParametricCarpetBuilder` and each
 * design is a two-line subclass naming its pattern. The runtime shape is
 * byte-for-byte the shape the existing three produce:
 *
 *   • thin `BoxGeometry(width × thickness × length)` body, thickness clamped to
 *     [2 mm, 12 mm] and positioned so its BOTTOM sits on y = 0;
 *   • a `PlaneGeometry` overlay rotated -π/2 and floated `thickness + 0.8 mm`
 *     above the top face to defeat z-fighting;
 *   • body / fringe materials from the `MaterialService` cache, pattern
 *     material unique per build with `dispose` hooked to free its CanvasTexture;
 *   • fringe boxes at the two short ends;
 *   • `userData = { isCarpetPart: true, role: 'body' | 'pattern' | 'fringe' }`
 *     on the parts and `{ role: 'carpet', variant }` on the group.
 *
 * Triangle budget: 12 (body) + 2 (overlay) + 2 × 12 (fringe) = **38 tris per
 * rug**, identical to the existing three. The only thing that changed is how
 * many texture bytes ride along — see `carpetPatterns.ts` §2.
 *
 * The pattern overlay additionally stamps the parametric plan onto its
 * `userData` (`motifCountX/Y`, `wavelengthXm/Ym`, `canvasW/H`, `textureBytes`).
 * That is what lets a test prove a resized rug EXTENDS its pattern rather than
 * stretching it, without needing a GPU or a working 2D canvas.
 *
 * P2: THREE via the `@pryzm/renderer-three/three` subpath.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { IFurnitureBuilder } from './IFurnitureBuilder';
import { FurnitureData } from '../FurnitureTypes';
import { MaterialService } from '../MaterialService';
import {
    type CarpetPatternId,
    CARPET_PATTERNS,
    planCarpetTexture,
    carpetTextureBytes,
    carpetSeedFromPosition,
} from './carpetPatterns';
import { createCarpetTexture } from './carpetTexture';
import { ChevronCarpetBuilder } from './ChevronCarpetBuilder';
import { PatchworkCarpetBuilder } from './PatchworkCarpetBuilder';
import { StripeCarpetBuilder } from './StripeCarpetBuilder';

/** Carpets are very thin — clamp aggressively. Default 4 mm. (Inherited.) */
export function carpetThickness(height: number | undefined): number {
    return Math.max(0.002, Math.min(height || 0.004, 0.012));
}

/**
 * The rectangular procedural carpet. One class, one pattern id.
 *
 * Not abstract: `new ParametricCarpetBuilder(ms, 'moons')` is a perfectly good
 * way to build one. The named subclasses below exist only so `FurnitureFactory`
 * reads the way it already reads for the existing three.
 */
export class ParametricCarpetBuilder implements IFurnitureBuilder {
    constructor(
        protected materialService: MaterialService,
        protected patternId: CarpetPatternId,
    ) {}

    build(data: FurnitureData): THREE.Group {
        const group = new THREE.Group();
        const spec = CARPET_PATTERNS[this.patternId];

        const width = data.width || 3.0;
        const length = data.length || 2.0;
        const thickness = carpetThickness(data.height);

        // ── 1. Rug body (thin slab) ──────────────────────────────────────────
        const baseMat = this.materialService.getMaterial(spec.bodyColor, 'standard');
        const base = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, length), baseMat);
        base.position.set(0, thickness / 2, 0);
        base.userData = { isCarpetPart: true, role: 'body' };
        group.add(base);

        // ── 2. Pattern overlay (CanvasTexture on a top plane) ────────────────
        // Regenerated on every rebuild, so a resize in the property panel adds
        // MOTIFS at constant real-world scale instead of stretching the ones
        // already there. `plan` is computed either way so the parametric facts
        // reach userData even where no 2D context exists (headless / tests).
        const made = createCarpetTexture(this.patternId, width, length);
        const plan = made?.plan ?? planCarpetTexture(this.patternId, width, length);

        const patternMat = made
            ? new THREE.MeshStandardMaterial({
                map: made.texture, roughness: spec.roughness, metalness: 0.0,
            })
            : new THREE.MeshStandardMaterial({
                color: spec.bodyColor, roughness: spec.roughness, metalness: 0.0,
            });
        if (made) {
            // FurnitureFragmentBuilder disposes unique materials on rebuild but
            // the material's `.map` texture is NOT auto-disposed — hook the
            // material's dispose event so this CanvasTexture is freed too.
            const { texture } = made;
            patternMat.addEventListener('dispose', () => texture.dispose());
        }

        const pattern = new THREE.Mesh(new THREE.PlaneGeometry(width, length), patternMat);
        pattern.rotation.x = -Math.PI / 2;
        pattern.position.set(0, thickness + 0.0008, 0);
        pattern.userData = {
            isCarpetPart: true, role: 'pattern',
            patternVariant: this.patternId,
            motifCountX: plan.motifCountX, motifCountY: plan.motifCountY,
            wavelengthXm: plan.wavelengthXm, wavelengthYm: plan.wavelengthYm,
            canvasW: plan.canvasW, canvasH: plan.canvasH,
            tiled: plan.tiled, textureBytes: carpetTextureBytes(plan),
        };
        group.add(pattern);

        // ── 3. Fringe at the two short ends ──────────────────────────────────
        const fringeMat = this.materialService.getMaterial(spec.fringeColor, 'standard');
        const fringeDepth = Math.min(0.04, length * 0.02);
        const fringeGeo = new THREE.BoxGeometry(width, thickness * 0.8, fringeDepth);
        const fringeFront = new THREE.Mesh(fringeGeo, fringeMat);
        fringeFront.position.set(0, thickness / 2, length / 2 + fringeDepth / 2);
        fringeFront.userData = { isCarpetPart: true, role: 'fringe' };
        const fringeBack = new THREE.Mesh(fringeGeo, fringeMat);
        fringeBack.position.set(0, thickness / 2, -length / 2 - fringeDepth / 2);
        fringeBack.userData = { isCarpetPart: true, role: 'fringe' };
        group.add(fringeFront, fringeBack);

        group.userData = { ...(group.userData ?? {}), role: 'carpet', variant: this.patternId };
        return group;
    }
}

// ─── The nine rectangular designs ────────────────────────────────────────────
// Reference photographs supplied by the founder, 2026-08-25.

/** 1 — Horizontal terracotta bands on cream, phase-offset across three vertical
 *  columns. The OFFSET is the design; plain stripes are `parametric_stripe_carpet`. */
export class StaggeredStripeCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'staggered_stripe'); }
}

/** 2 — Large rust / cream squares, ~8 columns across a 3 m rug, edge to edge. */
export class CheckerboardCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'checkerboard'); }
}

/** 3 — Natural jute field with an inset checkered sage/natural border on all four sides. */
export class BorderedJuteCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'bordered_jute'); }
}

/** 4 — Plain natural jute worked as concentric rectangular braid rings. Tonal only. */
export class BraidedJuteCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'braided_jute'); }
}

/** 5 — Bauhaus colour block: asymmetric charcoal / slate / teal / mustard / grey /
 *  cream rectangles with a pale-blue L as the focal point. */
export class ColourBlockCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'colour_block'); }
}

/** 6 — Overlapping circles and half-circles in navy / mid-blue / grey / cream. */
export class MoonsCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'moons'); }
}

/** 8 — One continuous meandering black line looping on cream. */
export class LineArtCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'line_art'); }
}

/** 9 — Dense thin dark stripes on cream, interrupted by orange and tan blocks. */
export class FineStripeCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'fine_stripe'); }
}

/**
 * 10 — MY CHOICE, and the reasoning, stated rather than invented silently.
 *
 * A Moroccan-style indigo diamond lattice on ivory. Picked because:
 *   • it is the one classic rug grammar absent from designs 1-9 — those are
 *     bands, blocks, circles, freehand line and jute weave, and not one of them
 *     is a DIAGONAL repeat;
 *   • its colourway (indigo) is unused as a dominant anywhere in 1-9, so it does
 *     not collide with `line_art`'s black-on-cream at carousel scale;
 *   • it is perfectly periodic, so it is the CHEAPEST of the ten — a 128 × 128
 *     tile, ~87 KB mipmapped, against ~2.1 MB for a full-canvas 3 × 2 m design;
 *   • it is quiet enough to sit under a bed or a sofa, which is what the
 *     auto-furnish `rug` slot mostly needs.
 */
export class DiamondTrellisCarpetBuilder extends ParametricCarpetBuilder {
    constructor(ms: MaterialService) { super(ms, 'diamond_trellis'); }
}

// ─── The auto-furnish `rug` kind ─────────────────────────────────────────────

/**
 * §CARPET97 — the semantic `rug` the D-FLE engine lays under a bed / dining
 * table / sofa. It used to hand EVERY room the same patchwork carpet; the
 * founder's ask ("add the ones created on the FURNISH ALL") is that the new
 * designs appear there.
 *
 * Variety is deterministic from the rug's WORLD POSITION — the same
 * §DECOR-VARIETY seed `WallTapestryBuilder` has used since 2026-06-18. Stable
 * across regenerations for a given layout, different per room, no randomness,
 * so command snapshots still round-trip byte-identically.
 *
 * The pool keeps the three ORIGINAL carpets alongside the nine new ones —
 * nothing that was reachable before became unreachable — and excludes the round
 * design, which would silently shrink a rectangular footprint to min(w, l).
 */
export class VarietyRugBuilder implements IFurnitureBuilder {
    constructor(private materialService: MaterialService) {}

    build(data: FurnitureData): THREE.Group {
        const pool = rugVarietyPool(this.materialService);
        const seed = carpetSeedFromPosition(data.position?.x, data.position?.y, data.position?.z);
        const chosen = pool[seed % pool.length]!;
        return chosen.build(data);
    }
}

/**
 * The twelve rectangular carpet builders the `rug` kind draws from: the three
 * originals plus the nine §CARPET97 designs. Builders are stateless wrappers
 * around the shared MaterialService, so minting the list per build is free.
 */
export function rugVarietyPool(ms: MaterialService): IFurnitureBuilder[] {
    return [
        new ChevronCarpetBuilder(ms),
        new PatchworkCarpetBuilder(ms),
        new StripeCarpetBuilder(ms),
        new StaggeredStripeCarpetBuilder(ms),
        new CheckerboardCarpetBuilder(ms),
        new BorderedJuteCarpetBuilder(ms),
        new BraidedJuteCarpetBuilder(ms),
        new ColourBlockCarpetBuilder(ms),
        new MoonsCarpetBuilder(ms),
        new LineArtCarpetBuilder(ms),
        new FineStripeCarpetBuilder(ms),
        new DiamondTrellisCarpetBuilder(ms),
    ];
}

// NOTE: `carpetSeedFromPosition` / `pickCarpetPatternForSeed` are deliberately
// NOT re-exported from here. The package barrel star-exports both this module
// and `carpetPatterns`, and a name reachable through two star exports is an
// ambiguity ESM resolves by dropping it. One home per export.
