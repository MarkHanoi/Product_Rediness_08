// P0.4 slice A (Family Platform) — L0 behaviour / constraints / placement /
// AI-hint sub-schemas for a FamilyRequest.
//
// Models the user's stated BEHAVIOURAL intent (movable, hosted, mount class),
// dimensional constraints (min/max overrides), placement preferences (anchor
// types, walls to exclude), and AI-dispatch hints (semantic names, synonyms,
// prompt cues).  Downstream Stage-1 ingestion + Stage-4 registration carry
// these through into the eventual RegisteredFamily — but registration tier
// adds the strict permissions/licensing wrappers (deferred to a later slice).
//
// Cross-imports `FamilyMountClassSchema` from sibling `../family-registry/`
// — both directories are L0 within the same package, so the cross-import is
// architecturally permitted and avoids enum-duplication.
//
// L0-pure: Zod-only.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §3
//     (FamilyRequest data shape — `behaviour` / `constraints` / `placement`
//     / `ai` blocks)
//   - §4 Stage 4 (Registration — `mountClass` flows into the RegisteredFamily
//     `mountClass` field)

import { z } from 'zod';
import { FamilyMountClassSchema } from '../family-registry/registered-family.js';

/**
 * Core behavioural triad for the family.
 *
 *   - `movable`     can the user reposition an instance after creation?
 *   - `hosted`      does an instance require a host element to exist?
 *   - `mountClass`  attachment surface (floor / wall / ceiling / embedded) —
 *                   reuses the registry's canonical enum
 */
export const FamilyBehaviourSchema = z.object({
    movable:    z.boolean(),
    hosted:     z.boolean(),
    mountClass: FamilyMountClassSchema,
});
export type FamilyBehaviour = z.infer<typeof FamilyBehaviourSchema>;

/**
 * Dimensional constraints — optional min/max overrides for downstream
 * validation.  Every field is positive; absence means "no constraint" (the
 * dimensions block alone is authoritative).  `excludeWallTypes` lets the
 * author block specific wall-system ids (e.g. "no glass-panel wall").
 *
 * The schema does NOT enforce min ≤ max — Stage-1 ingestion is the
 * authoritative validator.
 */
export const FamilyConstraintsSchema = z.object({
    minWidthM:        z.number().positive().optional(),
    maxWidthM:        z.number().positive().optional(),
    minDepthM:        z.number().positive().optional(),
    maxDepthM:        z.number().positive().optional(),
    minHeightM:       z.number().positive().optional(),
    maxHeightM:       z.number().positive().optional(),
    excludeWallTypes: z.array(z.string()).default([]),
});
export type FamilyConstraints = z.infer<typeof FamilyConstraintsSchema>;

/**
 * Placement preferences — `defaultAnchor` is the primary archetype anchor
 * the auto-furnish should try first; `allowedAnchors` lists every anchor the
 * family will accept (auto-furnish falls back through this list if the
 * default doesn't fit).  `excludedWalls` is a list of wall-system ids the
 * family must not be hosted on.
 *
 * Anchor enum mirrors `ArchetypeHintSchema.anchor` (family-registry) but is
 * NOT cross-imported — that schema's enum is wrapped in a larger object;
 * duplicating the five values here keeps the import surface minimal.  Both
 * are kept in lock-step as a code-review convention; a Stage-1 ingestion
 * test will assert the union match.
 */
export const FamilyPlacementHintSchema = z.object({
    defaultAnchor:  z.enum(['wall-longest', 'wall-window', 'beside', 'center', 'corner']),
    allowedAnchors: z.array(z.enum(['wall-longest', 'wall-window', 'beside', 'center', 'corner'])).default([]),
    excludedWalls:  z.array(z.string()).default([]),
});
export type FamilyPlacementHint = z.infer<typeof FamilyPlacementHintSchema>;

/**
 * AI-dispatch hints — the vocabulary the AI uses when proposing this family.
 *
 *   - `semanticNames`   at least one name the AI can refer to the family by
 *                       (e.g. `["office chair", "swivel chair"]`)
 *   - `synonyms`        additional alternates the prompt-router accepts
 *   - `cuesForPrompts`  short phrases the AI should mention when proposing
 *                       (e.g. `["ergonomic seating", "rolls on castors"]`)
 */
export const FamilyAiHintSchema = z.object({
    semanticNames:  z.array(z.string()).min(1),
    synonyms:       z.array(z.string()).default([]),
    cuesForPrompts: z.array(z.string()).default([]),
});
export type FamilyAiHint = z.infer<typeof FamilyAiHintSchema>;
