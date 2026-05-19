/**
 * FurnitureCategoryRegistry.ts
 *
 * Phase F1 + Kave Catalog Integration — Furniture Subcategory Taxonomy Foundation.
 *
 * Authoritative registry: FurnitureCategory → ordered list of items available
 * in that category, each with display metadata and default placement dimensions.
 *
 * Design rules (contracts enforced):
 *  - Pure data module — no imports from Three.js, engine, or store layers.
 *    (01-BIM §1.1: UI layer must not reference builders or stores directly)
 *  - No `any` types. (03-BIM §1.1)
 *  - getDescriptorForType() throws explicitly on unknown type.
 *    (07-BIM-SECURITY §7.2: hard failure policy)
 *  - Default dimensions are used by FurnitureDragDropHandler when dispatching
 *    CreateFurnitureCommand — they are the ONLY write path (01-BIM §1.1).
 *  - Categories with zero items are included so the carousel can render an
 *    empty state ("Coming soon") rather than crashing on missing data.
 *  - Kave catalog items carry `glbPath` + `thumbnailPath` and are placed via
 *    the addFurniture(path) flow, not CreateFurnitureCommand.
 *
 * Split (WS-B S85-WIRE):
 *   FurnitureCategoryTypes.ts  — shared interface definitions
 *   FurnitureCategoryDataA.ts  — sofas, chairs, tables, beds, wardrobes, bedroom, outdoor
 *   FurnitureCategoryDataB.ts  — decor, soft furnishings, lighting, kitchen, bathroom,
 *                                storage, kids, teens, pets, technical
 *
 * See docs/furniture/00-FURNITURE-SYSTEM-MASTER-DOCUMENT.md §1 for full spec.
 */

export type {
    FurnitureDefaultDimensions,
    FurnitureTypeDescriptor,
    FurnitureCategoryDescriptor,
} from './FurnitureCategoryTypes';

import type { FurnitureCategoryDescriptor, FurnitureTypeDescriptor } from './FurnitureCategoryTypes';
import { FurnitureCategory } from '@pryzm/geometry-furniture';
import { CATEGORIES_A } from './FurnitureCategoryDataA';
import { CATEGORIES_B } from './FurnitureCategoryDataB';

// ── Registry data ─────────────────────────────────────────────────────────────

const CATEGORIES: readonly FurnitureCategoryDescriptor[] = [
    ...CATEGORIES_A,
    ...CATEGORIES_B,
];

// ── Internal lookup maps (built once at module load) ──────────────────────────

const CATEGORY_MAP = new Map<FurnitureCategory, FurnitureCategoryDescriptor>(
    CATEGORIES.map(c => [c.id, c as FurnitureCategoryDescriptor])
);

const TYPE_TO_DESCRIPTOR_MAP = new Map<string, FurnitureTypeDescriptor>();
for (const cat of CATEGORIES) {
    for (const item of cat.items) {
        if (!TYPE_TO_DESCRIPTOR_MAP.has(item.type)) {
            TYPE_TO_DESCRIPTOR_MAP.set(item.type, item as FurnitureTypeDescriptor);
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the full ordered list of category descriptors.
 * Used by the carousel to build the category tab bar.
 */
export function getCategories(): readonly FurnitureCategoryDescriptor[] {
    return CATEGORIES;
}

/**
 * Returns the descriptor for a specific category.
 * Throws if the category id is unknown — per 07-BIM-SECURITY §7.2.
 */
export function getCategoryById(id: FurnitureCategory): FurnitureCategoryDescriptor {
    const cat = CATEGORY_MAP.get(id);
    if (!cat) {
        throw new Error(
            `FurnitureCategoryRegistry: Unknown FurnitureCategory "${id}". ` +
            `Ensure it is defined in CATEGORIES.`
        );
    }
    return cat;
}

/**
 * Returns the ordered item list for a category.
 * Empty array for categories with no items yet (not an error).
 */
export function getItemsForCategory(id: FurnitureCategory): readonly FurnitureTypeDescriptor[] {
    return getCategoryById(id).items;
}

/**
 * Returns the descriptor for a specific FurnitureType or Kave item string ID,
 * or undefined if the type has no registry entry yet.
 * Callers that require a descriptor must handle the undefined case explicitly.
 */
export function getDescriptorForType(type: string): FurnitureTypeDescriptor | undefined {
    return TYPE_TO_DESCRIPTOR_MAP.get(type);
}

/**
 * Returns the descriptor for a specific FurnitureType.
 * Throws if the type has no registry entry — use when a descriptor is required.
 * Per 07-BIM-SECURITY §7.2: fail explicitly, no silent fallback.
 */
export function requireDescriptorForType(type: string): FurnitureTypeDescriptor {
    const descriptor = TYPE_TO_DESCRIPTOR_MAP.get(type);
    if (!descriptor) {
        throw new Error(
            `FurnitureCategoryRegistry: No descriptor for FurnitureType "${type}". ` +
            `Add it to the appropriate category in FurnitureCategoryRegistry.ts.`
        );
    }
    return descriptor;
}
