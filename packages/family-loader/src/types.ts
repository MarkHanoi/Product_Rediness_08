// @pryzm/family-loader — public types.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D1.

import type {
  FamilyDocument,
  FamilyEvent,
  FamilyIfcBindingExport,
  FamilyManifest,
} from '@pryzm/file-format';
import type { ResolverDiagnostic } from '@pryzm/family-runtime';

/** A family loaded into memory and ready to be placed.  Treat the
 *  entire object as readonly — the cache shares it across callers. */
export interface LoadedFamily {
  readonly manifest: FamilyManifest;
  readonly document: FamilyDocument;
  readonly events: readonly FamilyEvent[];
  readonly ifcMapping: FamilyIfcBindingExport;
  /** `sha256:<hex>` of the document + ifc projection. */
  readonly schemaHash: string;
  /** Pre-flight resolver result for the FIRST type in `document.types`.
   *  The loader runs the resolver eagerly so the editor surfaces invalid
   *  defaults immediately on placement.  Subsequent placements re-resolve
   *  with their own type / overrides; this is just the smoke-test. */
  readonly preflight: PreflightResult;
  /** Where the bytes came from.  `'bytes'` for in-memory tests. */
  readonly source: 'bytes' | { readonly path: string };
  /** Original ZIP byte length — handy for cost telemetry. */
  readonly byteLength: number;
}

export interface PreflightResult {
  readonly ok: boolean;
  /** Diagnostics from the resolver; safe to display in the editor's
   *  inspector panel without further translation. */
  readonly diagnostics: readonly ResolverDiagnostic[];
}

export interface LoadFamilyOptions {
  /** Optional cache override.  Defaults to the process-default cache. */
  readonly cache?: import('./cache.js').FamilyCache;
  /** Verify the recorded schema hash matches the recomputed one.
   *  Default `true` — the editor's load path always verifies; tests can
   *  set it `false` to load tampered fixtures. */
  readonly verifySchemaHash?: boolean;
  /** Override the source label for in-memory loads.  Required by
   *  `loadFamilyFromBytes()`. */
  readonly source?: LoadedFamily['source'];
}

export type LoadFamilyErrorReason =
  | 'read-failed'
  | 'unpack-failed'
  | 'preflight-failed'
  | 'cache-error';

export type LoadFamilyResult =
  | { readonly ok: true; readonly family: LoadedFamily; readonly cacheHit: boolean }
  | {
      readonly ok: false;
      readonly reason: LoadFamilyErrorReason;
      readonly message: string;
    };
