// Office furnish — the MODULE OUTPUT vocabulary (SPEC-OFFICE-GENERATION-ENGINE §5/§11).
//
// Phase 2 of the modular Furnish Office engine. A MODULE is a reusable recipe that, given an
// anchor + orientation + a footprint budget, emits a CLUSTER of furniture items (SPEC §5): a
// single/linear/bench workstation, a collaborative/meeting/executive/phone-booth/kitchen/breakout
// block. The recipes (moduleRecipes.ts) return `PlacedItem[]` in the SAME origin-centred metric
// plan frame the office floor plate + officeCorePlan use (metres, {x,z}); the editor-side Command 2
// (officeFurnish.ts) maps each item to a `CreateFurnitureCommand` on the built floor.
//
// PURE + DETERMINISTIC — zero THREE / DOM / I/O (L2). Furniture TYPE names come straight from the
// existing `FurnitureType` vocabulary (packages/geometry-furniture) — the engine invents NO new
// element types (SPEC constraint). The `type` field is typed as a string subset of FurnitureType so
// this L2 module stays free of a geometry-furniture import (L2 may not import a peer L2 barrel for a
// type it only names); the editor validates the mapping at the command boundary.

/** A finite plan point (m, {x,z}) in the origin-centred office frame. */
export interface Pt2 { readonly x: number; readonly z: number }

/** The furniture material intents the recipes emit (subset of geometry-furniture's FurnitureMaterial). */
export type ModuleMaterial = 'wood' | 'metal' | 'fabric' | 'glass';

/**
 * One placed furniture item a module recipe emits. `furnitureType` is a member of the existing
 * `FurnitureType` union (validated editor-side); the engine substitutes the nearest existing type
 * where a bespoke office SKU is missing (documented in the ADR). Position is the item CENTRE in the
 * origin-centred plan frame; `rotY` is the Y rotation (radians).
 */
export interface PlacedItem {
    /** A member of geometry-furniture's FurnitureType (kept a bare string here to avoid the L2 import). */
    readonly furnitureType: string;
    /** Centre X (m, origin-centred plan frame). */
    readonly x: number;
    /** Centre Z (m). */
    readonly z: number;
    /** Y rotation (radians). */
    readonly rotY: number;
    /** Footprint width (m, along the item's local X before rotation). */
    readonly width: number;
    /** Footprint length/depth (m, along local Z before rotation). */
    readonly length: number;
    /** Height (m) — drives the CreateFurnitureCommand height. */
    readonly height: number;
    /** Material intent. */
    readonly material: ModuleMaterial;
}

// The reusable fit-out module kinds (SPEC §5/§6) live in officeModuleLibrary.ts (the Phase-1 seam);
// re-import the type here so the module output types can reference it without redefining it.
import type { OfficeModuleKind } from './officeModuleLibrary.js';
export type { OfficeModuleKind };

/**
 * A placed module: its kind, the items it emits, and its axis-aligned footprint bounding box (for
 * the §7 clearance / §9-8 egress validation — a module must NEVER overlap a circulation/escape band).
 */
export interface PlacedModule {
    readonly kind: OfficeModuleKind;
    /** The furniture items this module places. */
    readonly items: readonly PlacedItem[];
    /** Module anchor centre (m). */
    readonly cx: number;
    readonly cz: number;
    /** Axis-aligned footprint bbox (m), the union of the item footprints, for clearance checks. */
    readonly bbox: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

/** The desk count contributed by a module (workstations only) — used for occupancy accounting. */
export function moduleDeskCount(kind: OfficeModuleKind, items: readonly PlacedItem[]): number {
    if (kind === 'single-workstation' || kind === 'linear-workstation' || kind === 'bench-workstation') {
        return items.filter((i) => i.furnitureType === 'desk').length;
    }
    return 0;
}

/** Union the item footprints into one axis-aligned bbox (rotation-agnostic outer bound). */
export function itemsBBox(items: readonly PlacedItem[]): PlacedModule['bbox'] {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const it of items) {
        // A rotated footprint's outer bound is its half-diagonal in each axis; use the diagonal so a
        // 45°-rotated desk still bounds correctly (conservative — never under-counts the footprint).
        const half = Math.hypot(it.width, it.length) / 2;
        x0 = Math.min(x0, it.x - half); z0 = Math.min(z0, it.z - half);
        x1 = Math.max(x1, it.x + half); z1 = Math.max(z1, it.z + half);
    }
    if (!Number.isFinite(x0)) return { x0: 0, z0: 0, x1: 0, z1: 0 };
    return { x0, z0, x1, z1 };
}
