// P0.4 slice A (Family Platform) — L0 top-level FamilyRequest schema.
//
// The CANONICAL ingestion-side artefact: what a user / AI / developer
// submits to the Family Generation Pipeline to BE registered.  Stage-1
// ingestion parses it; Stage-2 decomposition + Stage-3 synthesis + Stage-4
// registration consume it; Stage-5 produces the RegisteredFamily already
// shipped under `family-registry/`.
//
// Reuses two schemas from the sibling `family-registry/` substrate to avoid
// duplicating the identity + IFC mapping contracts (both directories are L0
// within the same package — the cross-import is architecturally permitted):
//   - `FamilyIdentitySchema`  the canonical id/name/version/author/license
//   - `IfcMappingSchema`      IFC entity type + Pset mapping for export
//
// L0-pure: Zod-only.
//
// Deferred to later P0.4 slices (per the strategic doc §10):
//   - permissions    (who can install / instantiate this family)
//   - versioning     (changelog, migrations across versions)
//   - licensing      (SPDX is on `FamilyIdentity`; full marketplace
//                    licensing terms — royalties, distribution scope — defer)
//   - provenance     (AI-generated request metadata: model id, prompt hash)
//   - signing        (plugin-marketplace cryptographic signatures)
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §3
//     (FamilyRequest data shape — every sub-block)
//   - §4 (Family Generation Pipeline — FamilyRequest as Stage-1 input)
//   - §10 P0.4 (this slice scope — INGESTION substrate only)

import { z } from 'zod';
import { FamilyIdentitySchema } from '../family-registry/identity.js';
import { IfcMappingSchema }      from '../family-registry/registered-family.js';
import { FamilyDocumentationSchema } from './documentation.js';
import { FamilyGeometrySchema }      from './geometry.js';
import {
    FamilyBehaviourSchema,
    FamilyConstraintsSchema,
    FamilyPlacementHintSchema,
    FamilyAiHintSchema,
} from './behaviour.js';

/**
 * Top-level FamilyRequest.  Aggregates every sub-block + reuses the
 * registry's identity + IFC contracts.
 *
 *   - `identity`       canonical id/name/version/author/license
 *   - `documentation`  user-supplied PDFs / spec sheets / reference images
 *   - `geometry`       dimensions, parametric ranges, hosted relationship
 *   - `behaviour`      movable / hosted / mountClass
 *   - `constraints`    optional min/max dimensional + wall-type exclusions
 *   - `placement`      default + allowed anchors, excluded walls
 *   - `bim`            IFC entity type + Pset mapping for export
 *   - `ai`             semantic names / synonyms / prompt cues for AI dispatch
 */
export const FamilyRequestSchema = z.object({
    identity:      FamilyIdentitySchema,
    documentation: FamilyDocumentationSchema,
    geometry:      FamilyGeometrySchema,
    behaviour:     FamilyBehaviourSchema,
    constraints:   FamilyConstraintsSchema,
    placement:     FamilyPlacementHintSchema,
    bim:           IfcMappingSchema,
    ai:            FamilyAiHintSchema,
});
export type FamilyRequest = z.infer<typeof FamilyRequestSchema>;
