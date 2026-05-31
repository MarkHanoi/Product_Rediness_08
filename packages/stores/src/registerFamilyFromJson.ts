// P0.5 Stage-5 wiring (Family Platform) — L0-pure-pipeline → L3-reactive-store
// bridge.
//
// Takes a raw JSON `FamilyRequest`, runs the full Family Generation Pipeline
// (the 5 pure L0 transformers in `@pryzm/schemas`), and inserts the resulting
// `RegisteredFamily` into a live `FamilyRegistryStore`.
//
// Per APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4:
//
//   raw JSON ─→ runFamilyPipeline ─→ RegisteredFamily ─→ store.register(...)
//
// This module is the SINGLE caller-facing surface that performs the store
// mutation. All upstream transformers stay pure; the lone side effect is the
// `store.register(...)` (and an optional `store.unregister(...)` when
// overwriting an existing entry).
//
// Layer rules:
//   • L3 store-layer surface — imports ONLY from `@pryzm/schemas` (L0) and
//     the sibling `FamilyRegistryStore` (same L3 package).  No THREE, no DOM,
//     no other `@pryzm/*` packages.
//   • Defensive: never throws in default mode — every failure path returns a
//     discriminated-union result.  Pipeline-internal throws (rare; only when
//     an L0 contract is violated upstream of Zod) are caught + surfaced as a
//     `pipeline-threw` failure variant.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §4
//     (Family Generation Pipeline — Stage 5 registration is the LAST step)
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §10
//     (P0.5 Stage-5 register-into-store wiring — this slice)

import {
    runFamilyPipeline,
    isPipelineSuccess,
    type RunFamilyPipelineOptions,
    type RegisteredFamily,
    type IngestionIssue,
} from '@pryzm/schemas';
import type { FamilyRegistryStore } from './familyRegistryStore.js';

/**
 * Options for {@link registerFamilyFromJson}.  Inherits every per-stage knob
 * from {@link RunFamilyPipelineOptions} so callers can pin timestamps, override
 * the assembled family's `origin` / `category` / `tags`, etc. — and adds a
 * single store-mutation flag for collision behaviour.
 */
export interface RegisterFamilyFromJsonOptions extends RunFamilyPipelineOptions {
    /** When `true` (default), an existing entry with the same family id is
     *  unregistered before the new one is inserted. When `false`, a duplicate
     *  registration is treated as a failure with a structured issue. */
    readonly overwriteExisting?: boolean;
}

/**
 * Success branch.  The freshly-assembled family is on `.registered` and
 * `replacedExisting` reports whether the store had a prior entry under the
 * same id (already overwritten by this call when `replacedExisting === true`).
 */
export interface RegisterFamilyFromJsonSuccess {
    readonly ok: true;
    /** The newly registered family.  Identical to `store.findById(id)` after
     *  this call returns. */
    readonly registered: RegisteredFamily;
    /** True iff an existing entry with the same id was replaced. */
    readonly replacedExisting: boolean;
}

/**
 * Failure branch.  Three variants disambiguated by `.kind`:
 *
 *   - `'ingestion-failed'` — raw JSON didn't validate as a `FamilyRequest`.
 *     `.issues` carries the verbatim Zod issues array.
 *   - `'duplicate'` — `overwriteExisting === false` and an entry with this id
 *     already exists in the store.
 *   - `'pipeline-threw'` — one of the L0 transformers threw (rare; only if an
 *     upstream contract is violated past the Stage-1 Zod validation).
 */
export interface RegisterFamilyFromJsonFailure {
    readonly ok: false;
    readonly kind: 'ingestion-failed' | 'duplicate' | 'pipeline-threw';
    readonly message: string;
    readonly issues?: ReadonlyArray<IngestionIssue>;
}

/** Discriminated-union result.  Narrow via `.ok` (or `.kind` on the failure
 *  branch).  The function never throws in default mode. */
export type RegisterFamilyFromJsonResult =
    | RegisterFamilyFromJsonSuccess
    | RegisterFamilyFromJsonFailure;

/**
 * Take raw JSON, run the full Family Generation Pipeline (5 pure L0
 * transformers), and register the resulting {@link RegisteredFamily} into the
 * provided {@link FamilyRegistryStore}.
 *
 * Pure-ish: the only side effect is `store.register(...)` (plus an optional
 * `store.unregister(...)` when `overwriteExisting=true` and the id already
 * exists).  All upstream transformers are pure; the store mutation fires
 * exactly once on success.  No mutation occurs on any failure variant.
 *
 * Defensive: never throws on caller-recoverable input.  Pipeline-internal
 * throws are caught + returned as `{ ok: false, kind: 'pipeline-threw' }`.
 *
 * @example
 *   const result = registerFamilyFromJson(rawJsonFromForm, runtime.familyRegistryStore);
 *   if (result.ok) {
 *     ui.showRegistered(result.registered);
 *   } else if (result.kind === 'ingestion-failed') {
 *     ui.showIssues(result.issues ?? []);
 *   } else if (result.kind === 'duplicate') {
 *     ui.confirmReplace(() => registerFamilyFromJson(rawJsonFromForm, store, { overwriteExisting: true }));
 *   } else {
 *     ui.showError(result.message);
 *   }
 */
export function registerFamilyFromJson(
    rawJson: unknown,
    store: FamilyRegistryStore,
    opts: RegisterFamilyFromJsonOptions = {},
): RegisterFamilyFromJsonResult {
    // 1. Run the pipeline behind a try/catch so a transformer-internal throw
    //    becomes a structured failure rather than crashing the caller.
    let outcome;
    try {
        outcome = runFamilyPipeline(rawJson, opts);
    } catch (err) {
        const message =
            err instanceof Error
                ? err.message
                : `runFamilyPipeline threw a non-Error value: ${String(err)}`;
        return {
            ok:      false,
            kind:    'pipeline-threw',
            message,
        };
    }

    // 2. Stage-1 ingestion failure: surface the issues verbatim.
    if (!isPipelineSuccess(outcome)) {
        return {
            ok:      false,
            kind:    'ingestion-failed',
            message: outcome.message,
            issues:  outcome.issues,
        };
    }

    const registered = outcome.registered;
    const id = registered.identity.id as Parameters<FamilyRegistryStore['findById']>[0];

    // 3. Duplicate-collision check.  `overwriteExisting` defaults to `true`.
    const existing = store.findById(id);
    const overwrite = opts.overwriteExisting !== false;

    if (existing && !overwrite) {
        return {
            ok:      false,
            kind:    'duplicate',
            message:
                `Family ${registered.identity.id} already registered ` +
                `(set overwriteExisting:true to replace)`,
        };
    }

    // 4. Overwrite path: drop the prior entry so secondary indexes for the
    //    OLD payload don't leak into the new registration.  The store's pure
    //    `registerFamily` helper already replaces the byId entry, but it does
    //    NOT scrub the prior secondary-index entries (those are keyed off the
    //    prior payload's category / tags / etc., which the new payload may
    //    differ from).  `unregister` cleanly removes every prior index entry.
    if (existing) {
        store.unregister(id);
    }

    // 5. Single-side-effect mutation.
    store.register(registered);

    return {
        ok:               true,
        registered,
        replacedExisting: !!existing,
    };
}
