// P0.4 Stage-1 (Family Platform) — pure unknown-JSON → FamilyDefinition
// ingestion entry point.
//
// Wraps the existing two-stage Stage-1 path:
//
//   unknown JSON
//     ─[FamilyRequestSchema.safeParse]→  FamilyRequest
//     ─[fromRequest]→                    FamilyDefinition
//
// Builds on:
//   - `FamilyRequestSchema`  (P0.4-A, the FamilyRequest validator)
//   - `fromRequest`          (P0.4 Stage-1 slice B, the pure transformer)
//
// Caller surface: the Stage-1 ingress for FORM UPLOADS, AI GENERATION,
// FILE IMPORT, and MARKETPLACE DOWNLOAD — every Stage-1 input mode that
// produces a structured JSON payload converges on this function.
//
// Design contract:
//   - Pure: no I/O.
//   - Defensive (default `safe: true`): never throws for caller-recoverable
//     input.  Validation errors surface as an IngestionFailure discriminated-
//     union variant carrying the verbatim Zod issues array.
//   - Unsafe mode (`safe: false`): uses `FamilyRequestSchema.parse` and
//     therefore throws `ZodError` on invalid input — for callers that want
//     to handle errors via try/catch instead of a result tag.
//   - Re-uses ALL the contracts FamilyRequestSchema enforces (semver, semantic
//     names min-1, dimensions, etc.) by VALIDATING FIRST, then transforming.
//
// L0-pure: Zod-only.  No `@pryzm/*` imports outside `@pryzm/schemas`.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     Stage 1 (Ingestion — unknown JSON ingress for every input mode)
//   - §10 P0.4 (this slice scope — ingestion entry point)

import type { z } from 'zod';
import { FamilyRequestSchema } from '../family-request/index.js';
import type { FamilyRequest } from '../family-request/index.js';
import type { FamilyDefinition } from './definition.js';
import { fromRequest, type FromRequestOptions } from './from-request.js';

/** Single validation issue surfaced from the Zod validator, verbatim. */
export type IngestionIssue = z.ZodIssue;

/** Common shape of every IngestionOutcome — useful as a structural base. */
export interface IngestionResult {
    readonly ok: boolean;
}

/** Success branch: the canonical FamilyDefinition is available on `.definition`. */
export interface IngestionSuccess extends IngestionResult {
    readonly ok: true;
    readonly definition: FamilyDefinition;
}

/** Failure branch: validation rejected; the Zod issues array carries detail. */
export interface IngestionFailure extends IngestionResult {
    readonly ok: false;
    readonly issues: ReadonlyArray<IngestionIssue>;
    /** Top-level error message; the issues array carries detail. */
    readonly message: string;
}

/** Discriminated union — narrow via `o.ok` or {@link isIngestionSuccess}. */
export type IngestionOutcome = IngestionSuccess | IngestionFailure;

/** Options for {@link ingestFromJson}. */
export interface IngestFromJsonOptions {
    /** Forwarded verbatim to {@link fromRequest}.  Use this to pin the
     *  ingestion timestamp for deterministic tests. */
    readonly fromRequestOpts?: FromRequestOptions;
    /** When `true` (default), the function uses `safeParse` and returns
     *  {@link IngestionFailure} for any validation error.  When `false`, it
     *  uses `parse` and throws a `ZodError` instead. */
    readonly safe?: boolean;
}

/**
 * Ingest unknown JSON as a {@link FamilyRequest} and transform to a
 * {@link FamilyDefinition}.
 *
 * - PURE: no I/O.
 * - DEFENSIVE: in default `safe: true` mode, never throws — invalid input
 *   returns an {@link IngestionFailure} with the verbatim Zod issues array.
 * - TWO-STEP: validates as `FamilyRequest` first, then transforms via
 *   {@link fromRequest} — preserves all the contracts `FamilyRequestSchema`
 *   enforces (semver, semantic-names min 1, positive dimensions, etc.).
 * - REUSE: no duplication of validation or transform logic — strictly a
 *   thin caller-facing composition over the two existing primitives.
 *
 * @example
 *   const outcome = ingestFromJson(rawFromForm);
 *   if (isIngestionSuccess(outcome)) {
 *     await registry.register(outcome.definition);
 *   } else {
 *     ui.showIssues(outcome.issues);
 *   }
 */
export function ingestFromJson(
    raw: unknown,
    opts: IngestFromJsonOptions = {},
): IngestionOutcome {
    const safe = opts.safe !== false;

    if (safe) {
        const parsed = FamilyRequestSchema.safeParse(raw);
        if (!parsed.success) {
            return {
                ok:      false,
                issues:  parsed.error.issues,
                message: `FamilyRequest validation failed: ${parsed.error.issues.length} issue(s)`,
            };
        }
        return {
            ok:         true,
            definition: fromRequest(parsed.data, opts.fromRequestOpts),
        };
    }

    // Unsafe mode: `parse()` throws ZodError if invalid.  Callers in this
    // mode opt in to try/catch handling.
    const request: FamilyRequest = FamilyRequestSchema.parse(raw);
    return {
        ok:         true,
        definition: fromRequest(request, opts.fromRequestOpts),
    };
}

/**
 * Type-guard: narrows an {@link IngestionOutcome} to {@link IngestionSuccess}.
 *
 * @example
 *   const o = ingestFromJson(raw);
 *   if (isIngestionSuccess(o)) {
 *     // o.definition is typed as FamilyDefinition here.
 *   }
 */
export function isIngestionSuccess(o: IngestionOutcome): o is IngestionSuccess {
    return o.ok === true;
}
