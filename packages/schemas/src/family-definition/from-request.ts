// P0.4 slice B (Family Platform) — pure FamilyRequest → FamilyDefinition
// transformer.
//
// Implements the Stage-1 Ingestion JSON-mode path: takes an already-validated
// FamilyRequest and produces a canonical FamilyDefinition by applying
// defaults and deriving canonical fields (volume, footprint area, normalised
// semantic-name vocabulary, content hash, ingestion timestamp).
//
// Pure data transform: NO I/O.  The only non-determinism is
// `new Date().toISOString()` — and that is opt-out-able via
// `opts.ingestedAt` for deterministic tests.
//
// PDF / OCR / image ingestion is a LATER slice (Stage-1 has multiple input
// modes; this slice ships the JSON-mode path only).
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 1 (Ingestion — the JSON-mode FamilyRequest → FamilyDefinition arc)
//   - §10 P0.4 (this slice scope)

import type { FamilyRequest } from '../family-request/index.js';
import type { FamilyDefinition, FamilyDefinitionDerived } from './definition.js';

/** Options for {@link fromRequest}. */
export interface FromRequestOptions {
    /**
     * Override the ingestion timestamp.  Provide a fixed ISO 8601 string in
     * tests to keep the transformer fully deterministic; otherwise the
     * transformer stamps `new Date().toISOString()` at call time.
     */
    readonly ingestedAt?: string;
}

/**
 * Pure FamilyRequest → FamilyDefinition transformer.
 *
 * Applies defaults + derives canonical fields:
 *   - `canonicalSemanticNames`  lower-case + trim + de-dup + sort of
 *                               `request.ai.semanticNames`
 *   - `volumeM3`                widthM × depthM × heightM (m³)
 *   - `footprintAreaM2`         widthM × depthM (m²)
 *   - `canonicalHash`           deterministic non-cryptographic cache key
 *   - `ingestedAt`              `opts.ingestedAt ?? new Date().toISOString()`
 *
 * Sub-blocks (`identity`, `documentation`, `geometry`, `behaviour`,
 * `constraints`, `placement`, `bim`, `ai`) flow through by REFERENCE — the
 * transformer does NOT copy, so consumers must not mutate the input.
 */
export function fromRequest(
    request: FamilyRequest,
    opts: FromRequestOptions = {},
): FamilyDefinition {
    const ingestedAt = opts.ingestedAt ?? new Date().toISOString();

    const canonicalSemanticNames = canonicaliseSemanticNames(request.ai.semanticNames);
    const { widthM, depthM, heightM } = request.geometry.dimensions;
    const footprintAreaM2 = widthM * depthM;
    const volumeM3        = footprintAreaM2 * heightM;
    const canonicalHash   = computeCanonicalHash(request, canonicalSemanticNames);

    const derived: FamilyDefinitionDerived = {
        canonicalSemanticNames,
        volumeM3,
        footprintAreaM2,
        canonicalHash,
        ingestedAt,
    };

    return {
        identity:      request.identity,
        documentation: request.documentation,
        geometry:      request.geometry,
        behaviour:     request.behaviour,
        constraints:   request.constraints,
        placement:     request.placement,
        bim:           request.bim,
        ai:            request.ai,
        derived,
    };
}

/**
 * Canonicalise a list of semantic names: lower-case, trim, drop empties,
 * de-duplicate, sort lexicographically.  Pure + deterministic — same input
 * (modulo order) → same output.
 *
 * Exported for unit-testing the canonicalisation rules in isolation.
 *
 * @example
 *   canonicaliseSemanticNames(['Sofa', 'sofa', '  COUCH  ', ''])
 *   // → ['couch', 'sofa']
 */
export function canonicaliseSemanticNames(names: readonly string[]): string[] {
    const normalised = names.map(n => n.toLowerCase().trim()).filter(n => n.length > 0);
    return [...new Set(normalised)].sort();
}

/**
 * Compute a stable, deterministic, non-cryptographic cache key for a
 * FamilyRequest in its canonicalised form.  Stability is order-insensitive
 * w.r.t. `semanticNames` because the caller passes the already-sorted
 * `canonicalSemanticNames` array.
 *
 * Format: `def:<id>|<version>|<w>|<d>|<h>|<mountClass>|<names>`.  This is
 * NOT cryptographic — it is a join of authoritative fields suitable for
 * cache keying only.  A future slice may swap in a fast non-crypto hash
 * (e.g. xxhash) without changing the call surface.
 *
 * Exported for unit-testing in isolation.
 */
export function computeCanonicalHash(
    request: FamilyRequest,
    canonicalNames: readonly string[],
): string {
    const parts = [
        request.identity.id,
        request.identity.version,
        request.geometry.dimensions.widthM.toFixed(6),
        request.geometry.dimensions.depthM.toFixed(6),
        request.geometry.dimensions.heightM.toFixed(6),
        request.behaviour.mountClass,
        canonicalNames.join(','),
    ];
    return `def:${parts.join('|')}`;
}
