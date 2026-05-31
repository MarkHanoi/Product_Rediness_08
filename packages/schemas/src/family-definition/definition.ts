// P0.4 slice B (Family Platform) — L0 FamilyDefinition schema.
//
// The CANONICAL structured form that emerges from Stage-1 ingestion
// (post-parse, post-OCR, post-normalisation).  Strict SUPERSET of
// FamilyRequest: every FamilyRequest field is carried through verbatim plus
// a `derived` block of canonical/derived facts the parser computes (volume,
// footprint area, canonicalised semantic-name vocabulary, content hash,
// ingestion timestamp).
//
// Pipeline flow per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   FamilyRequest  ─[Stage 1 Ingestion]→  FamilyDefinition (canonical)
//                  ─[Stages 2-4]→         Generated*
//                  ─[Stage 5]→            RegisteredFamily
//
// Cross-imports from the two sibling L0 substrates within `@pryzm/schemas`:
//   - `family-registry/identity.js`           → FamilyIdentitySchema
//   - `family-registry/registered-family.js`  → IfcMappingSchema
//   - `family-request/*`                      → every sub-block schema
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` imports
// outside the `@pryzm/schemas` package itself.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 1 (Ingestion — FamilyDefinition is the canonical output)
//   - §10 P0.4 (this slice scope — canonical structured form substrate)

import { z } from 'zod';
import { FamilyIdentitySchema } from '../family-registry/identity.js';
import { IfcMappingSchema }      from '../family-registry/registered-family.js';
import {
    FamilyDocumentationSchema,
    FamilyGeometrySchema,
    FamilyBehaviourSchema,
    FamilyConstraintsSchema,
    FamilyPlacementHintSchema,
    FamilyAiHintSchema,
} from '../family-request/index.js';

/**
 * Derived facts the Stage-1 parser computes from the raw FamilyRequest.
 * These are NOT in FamilyRequest — they're the value-add of ingestion and
 * are what downstream Stages 2-4 (decomposition / synthesis / registration)
 * consume for cache-keying, geometry sizing, and AI dispatch.
 *
 *   - `canonicalSemanticNames`  lower-cased + trimmed + de-duplicated +
 *                               sorted vocabulary for AI dispatch; min 1
 *   - `volumeM3`                cubic-metre bounding volume (w × d × h)
 *   - `footprintAreaM2`         floor-projection area in m² (w × d)
 *   - `canonicalHash`           stable hash of the canonical form for caches
 *   - `ingestedAt`              ISO 8601 timestamp the parser ran at
 */
export const FamilyDefinitionDerivedSchema = z.object({
    canonicalSemanticNames: z.array(z.string()).min(1),
    volumeM3:               z.number().positive(),
    footprintAreaM2:        z.number().positive(),
    canonicalHash:          z.string().min(1),
    ingestedAt:             z.string().min(1),
});
export type FamilyDefinitionDerived = z.infer<typeof FamilyDefinitionDerivedSchema>;

/**
 * Top-level FamilyDefinition — the canonical structured form downstream
 * stages consume.  STRICT SUPERSET of FamilyRequest: every sub-block flows
 * through verbatim, plus a `derived` block of parser-computed facts.
 *
 *   - `identity` … `ai`  identical to FamilyRequest (carried through)
 *   - `derived`          parser-derived canonical facts (see schema above)
 */
export const FamilyDefinitionSchema = z.object({
    identity:      FamilyIdentitySchema,
    documentation: FamilyDocumentationSchema,
    geometry:      FamilyGeometrySchema,
    behaviour:     FamilyBehaviourSchema,
    constraints:   FamilyConstraintsSchema,
    placement:     FamilyPlacementHintSchema,
    bim:           IfcMappingSchema,
    ai:            FamilyAiHintSchema,
    derived:       FamilyDefinitionDerivedSchema,
});
export type FamilyDefinition = z.infer<typeof FamilyDefinitionSchema>;
