/**
 * FurnitureCategoryTypes.ts
 *
 * Shared type definitions for the PRYZM furniture category registry.
 * Extracted from FurnitureCategoryRegistry.ts (WS-B S85-WIRE).
 *
 * Design rules (contracts enforced):
 *  - Pure types module — no runtime values, no Three.js imports.
 *  - All interfaces are readonly for immutability (03-BIM §1.1).
 */

import { FurnitureCategory, FurnitureMaterial, FurnitureType } from '@pryzm/geometry-furniture';

// ── Type definitions ──────────────────────────────────────────────────────────

/**
 * Default placement dimensions for a furniture type.
 * Used by FurnitureDragDropHandler when building CreateFurnitureCommand payload.
 * All values in metres. baseOffset lifts the element off the floor plane.
 */
export interface FurnitureDefaultDimensions {
    readonly width: number;
    readonly length: number;
    readonly height: number;
    readonly baseOffset: number;
}

/**
 * Full descriptor for a single furniture type within a category.
 * Drives both the carousel card label and the command payload defaults.
 *
 * When `glbPath` is present, the item is a Kave-catalog GLB item:
 *  - `thumbnailPath` points to the pre-rendered WebP thumbnail.
 *  - Drag payload is `glbPath`, handled by FurnitureDragDropHandler → fc-add-glb.
 * When `glbPath` is absent, `type` must be a valid FurnitureType and the item
 * is placed via CreateFurnitureCommand (parametric geometry builder).
 */
export interface FurnitureTypeDescriptor {
    readonly type:               FurnitureType | string;
    readonly label:              string;
    readonly defaultDimensions:  FurnitureDefaultDimensions;
    readonly defaultMaterial:    FurnitureMaterial;
    readonly glbPath?:           string;
    readonly thumbnailPath?:     string;
    /**
     * Optional default fabric/body colour (`#RRGGBB`) — used by parametric
     * builders that vary appearance per descriptor entry (e.g. multiple
     * sofa palettes mapping to the same FurnitureType).
     */
    readonly defaultColor?:      string;
    /**
     * Optional default `properties` payload — forwarded as `metadata` on the
     * CreateFurnitureCommand and surfaces on FurnitureData.properties.
     * No `any` (03-BIM §1.1).
     */
    readonly defaultProperties?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Full descriptor for a furniture category, including its ordered item list.
 */
export interface FurnitureCategoryDescriptor {
    readonly id: FurnitureCategory;
    readonly label: string;
    readonly description: string;
    readonly items: readonly FurnitureTypeDescriptor[];
}

