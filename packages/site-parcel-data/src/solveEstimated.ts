// C58 — the first-slice convenience solve: parcel → estimated envelope.
//
// L2-pure. Wraps `computeBuildableEnvelope` with the single shipped
// `estimated-default` rule pack (C58 §1.2 fidelity 2 → `estimated-ruleset`).
// This is what the editor's `site.parcel-boundary-set` wiring calls until real
// `ZoningProvider` adapters land (L-399): no provider fetch, no I/O — a pure
// parcel-geometry → envelope solve.
//
// When a real provider exists, the editor calls `computeBuildableEnvelope`
// directly with the fetched `ZoningRecord` + the jurisdiction's pack instead.

import type { Pt, ParcelEdgeClassification, BuildableEnvelope } from '@pryzm/schemas';
import { ZoningRecordSchema } from '@pryzm/schemas';
import { computeBuildableEnvelope } from './ZoningRulesEngine.js';
import {
    ESTIMATED_DEFAULT_PACK,
    estimatedDefaultZoningRecord,
} from './rulepacks/estimatedDefault.js';

/**
 * Solve a buildable envelope for a parcel using the estimated default rule pack.
 * The result is always `confidence: 'estimated-ruleset'` (the honest label) and
 * carries a full derivation trace + caveats.
 *
 * @param parcelRing          closed ring, scene-XZ metres (C19 boundary polygon).
 * @param edgeClassifications one per edge (may be all `unclassified`).
 */
export function solveEstimatedEnvelope(
    parcelRing: ReadonlyArray<Pt>,
    edgeClassifications: ReadonlyArray<ParcelEdgeClassification>,
): BuildableEnvelope {
    const zoning = ZoningRecordSchema.parse(estimatedDefaultZoningRecord());
    return computeBuildableEnvelope({
        parcelRing,
        edgeClassifications,
        zoning,
        rulePack: ESTIMATED_DEFAULT_PACK,
    });
}
