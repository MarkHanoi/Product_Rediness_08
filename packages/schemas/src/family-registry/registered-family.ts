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
// C75 §2.4 — provenance lives in L0, beside the value it describes.
import {
    ValueProvenanceSchema,
    unknownProvenance,
    type ValueProvenance,
} from '../provenance/ValueOrigin.js';

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
    /**
     * C75 §2.1/§2.5 — WHERE `origin` came from, which `origin` itself cannot say.
     *
     * `FamilyOriginSchema` has four members and none of them means "nobody told
     * us". Before this field, `assembleRegisteredFamily` closed that gap with
     * `opts.origin ?? 'user'` (C75's ledger, `from-pipeline.ts:225`): a family
     * assembled by the pipeline with no stated origin was recorded as one a
     * PERSON uploaded, and `origin` drives a permission tier — so an invented
     * `'user'` is not cosmetic.
     *
     * Widening `FamilyOrigin` with an `unknown` member was the other option and
     * was rejected: C75 §1.4 is explicit that unknown is a value with a REASON,
     * not a sixth member of an origin vocabulary — a sixth member becomes the
     * thing the next `??` defaults to, which is the same defect relabelled.
     *
     * ⭐ **`.optional()`, NOT `.default()`, and the difference is the whole
     * point — C75 §1.4.** A `.default()` would have been the tidier-looking
     * choice and it is the wrong one here, because `z.infer` widens a defaulted
     * field to REQUIRED on the OUTPUT type. `RegisteredFamily` is a hand-authored
     * TypeScript literal at 59 core-seed sites (`stores/src/seedCoreFamilies.ts`)
     * that are registered directly and never `.parse()`d, so the default would
     * never have executed there: it would only have forced 59 authors to type a
     * provenance value to satisfy the compiler. **That is a bulk default wearing
     * a schema's clothes** — precisely the failure C75 §0 exists to prevent, and
     * the invented `'auto-topology'` is what it looks like once it is in a file.
     *
     * With `.optional()`, an absent field means exactly what C75 §1.4 says an
     * absent field means: **the origin is not known**. Read it through
     * {@link familyOriginProvenance}, which turns that silence into an explicit
     * UNKNOWN-with-reason rather than letting a consumer read `undefined` as
     * anything. Existing persisted families parse unchanged (§2.5) and answer
     * "not known" instead of making a claim about who made them.
     */
    originProvenance: ValueProvenanceSchema.optional(),
    archetypeHints: z.array(ArchetypeHintSchema),
    ifcMapping:     IfcMappingSchema,
    schemaHash:     z.string().min(1),
    tags:           z.array(z.string().min(1)).default([]),
});
export type RegisteredFamily = z.infer<typeof RegisteredFamilySchema>;

/**
 * Where this family's `origin` came from — **never `undefined`** (C75 §1.4).
 *
 * The single reader for {@link RegisteredFamilySchema}'s optional
 * `originProvenance`. A family that carries no provenance is not a family whose
 * provenance is blank: it is one whose origin we do not know, and this returns
 * that as a value with a reason, so no consumer has to decide what a missing
 * field means. Every place that would otherwise write
 * `f.originProvenance ?? something` calls this instead — which is the point,
 * because that `??` is how C75's whole ledger got written.
 *
 * The reason is `producer-not-instrumented` rather than `not-recorded`: the
 * families that lack the field are the 59 hand-authored core seeds
 * (`@pryzm/stores` `seedCoreFamilies.ts`), and their silence is OURS — the seed
 * table has no column for provenance — not a producer that had one and skipped
 * it. `LandBasis.ts` draws the same distinction between `basis-not-declared`
 * and `basis-unknown`, and for the same reason: the two close differently. This
 * one closes by authoring the field on the seeds, deliberately, one at a time.
 *
 * ⚠ Note what this does NOT assert. It does not claim the core seeds are
 * un-authored — they are hand-written literals in this repo and `origin: 'core'`
 * is a defensible description of them. It asserts only that **nothing in the
 * record says so**, which is a different and weaker claim, and the only one the
 * data supports today.
 */
export function familyOriginProvenance(family: RegisteredFamily): ValueProvenance {
    return family.originProvenance ?? unknownProvenance('producer-not-instrumented');
}
