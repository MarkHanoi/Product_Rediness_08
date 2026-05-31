// P0.3 slice A (Family Platform) — L0 registered-family payload.
//
// The shape the FamilyRegistry stores per registered family.  Carries ONLY
// what the L0 registry needs to dispatch a discovery query (category /
// occupancy / mountClass / tag) + the identity + IFC mapping for downstream
// export.  Heavier sub-blocks — `builderRef`, `planSymbolRef`, `footprint`,
// `uiDescriptor`, `aiVocabulary`, `permissions` — are deliberately DEFERRED
// to a later P0.3 slice; adding them here would over-couple the substrate.
//
// L0-pure: Zod-only.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §3
//     (FamilyRequest — `identity` / `category` / `mountClass` blocks)
//   - §6 (FamilyRegistry data flow — index dimensions are
//     {category, occupancy, mountClass, tag})

import { z } from 'zod';
import { FamilyIdentitySchema } from './identity.js';

/**
 * Where a registered family came from.  Drives permission tier (a `user`
 * family cannot author across plugin boundaries) + UI affordance (an
 * `ai-generated` family is flagged in the picker).
 */
export const FamilyOriginSchema = z.enum(['core', 'plugin', 'user', 'ai-generated']);
export type FamilyOrigin = z.infer<typeof FamilyOriginSchema>;

/**
 * How a family attaches in space.
 *
 *   - `floor`     stands on the floor (default for furniture)
 *   - `wall`      hosted in a wall (door / window / wall-mounted radiator)
 *   - `ceiling`   hung from the ceiling (pendant light / fan)
 *   - `embedded`  embedded into a host element (handle on a door, knob on a tap)
 */
export const FamilyMountClassSchema = z.enum(['floor', 'wall', 'ceiling', 'embedded']);
export type FamilyMountClass = z.infer<typeof FamilyMountClassSchema>;

/**
 * Free-form category string (e.g. `kitchens`, `sofas`, `chairs`,
 * `pendant-lights`).  Kept as a plain string to allow plugin / user families
 * to introduce new categories without a schema change.
 */
export const FamilyCategorySchema = z.string().min(1);
export type FamilyCategory = z.infer<typeof FamilyCategorySchema>;

/**
 * Free-form occupancy string matching the apartment-room occupancy types
 * (e.g. `bedroom`, `kitchen`, `bathroom`, `living`).  Kept as a string so
 * the registry does NOT acquire a compile-time dependency on the apartment
 * `RoomType` enum (which lives in `@pryzm/schemas/apartment` and would
 * couple two otherwise-independent substrates).
 */
export const FamilyOccupancySchema = z.string().min(1);
export type FamilyOccupancy = z.infer<typeof FamilyOccupancySchema>;

/**
 * One archetype hint — "this family is suitable for an OCCUPANCY anchored
 * AT ANCHOR".  Used by the AI dispatch / auto-furnish to pick candidates.
 *
 *   - `wall-longest`  align along the room's longest wall (sofas, beds)
 *   - `wall-window`   align along the wall containing a window (desks)
 *   - `beside`        sits beside an existing family (lamp beside sofa)
 *   - `center`        floats in the room centre (dining table)
 *   - `corner`        corner-anchored (corner chair, corner shelf)
 *
 * The optional `group` collects families that should be placed together
 * (e.g. `dining-set` groups table + chairs).
 */
export const ArchetypeHintSchema = z.object({
    occupancy: FamilyOccupancySchema,
    anchor:    z.enum(['wall-longest', 'wall-window', 'beside', 'center', 'corner']),
    group:     z.string().min(1).optional(),
});
export type ArchetypeHint = z.infer<typeof ArchetypeHintSchema>;

/**
 * IFC interoperability mapping.  Stamped on the family so the IFC exporter
 * does not have to introspect the geometry to pick an entity type.
 *
 *   - `entityType`      canonical IFC entity (e.g. `IfcFurniture`, `IfcDoor`)
 *   - `predefinedType`  optional sub-classifier (e.g. `TABLE`, `CHAIR`)
 *   - `psets`           canonical Pset names the family populates
 */
export const IfcMappingSchema = z.object({
    entityType:     z.string().min(1),
    predefinedType: z.string().min(1).optional(),
    psets:          z.array(z.string().min(1)),
});
export type IfcMapping = z.infer<typeof IfcMappingSchema>;

/**
 * Top-level registered-family record.  Indexed in `FamilyRegistryState` by
 * `identity.id` (primary) + `category` + each `archetypeHints[].occupancy`
 * + `mountClass` + each `tags[]` entry.
 *
 *   - `schemaHash` is the content hash of the upstream `.pryzm-family` ZIP
 *     (or the in-memory descriptor for AI-generated families) — consumers
 *     use it to key caches and detect "same id, new revision".
 *   - `tags` is a free-form search index; the picker UI filters on it.
 *
 * NOTE: `builderRef`, `planSymbolRef`, `footprint`, `uiDescriptor`,
 *       `aiVocabulary`, `permissions` are deferred to a later slice.
 */
export const RegisteredFamilySchema = z.object({
    identity:       FamilyIdentitySchema,
    category:       FamilyCategorySchema,
    mountClass:     FamilyMountClassSchema,
    origin:         FamilyOriginSchema,
    archetypeHints: z.array(ArchetypeHintSchema),
    ifcMapping:     IfcMappingSchema,
    schemaHash:     z.string().min(1),
    tags:           z.array(z.string().min(1)).default([]),
});
export type RegisteredFamily = z.infer<typeof RegisteredFamilySchema>;
