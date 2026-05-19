// bakeFamilyInstance — pure-Node family-instance bake pipeline.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D2.
//
// Inputs: a LoadedFamily-shape (manifest + document + ifcMapping +
// schemaHash) plus the chosen `typeId` and any per-instance overrides.
//
// Outputs: one BufferGeometryDescriptor per `solid` in the family
// document, in document order.  Returned with the resolved values map
// so the caller (the editor or the bake-worker) can attach instance
// parameters to the IFC export downstream.
//
// v1 producer support (plan §19.5 D2):
//   • `extrude` — fully wired.
//   • `sweep` / `loft` / `revolve` — return a structured
//     `unsupported-feature` error per solid; the bake completes the
//     supported solids and reports the unsupported ones.  Lighting up
//     these producers requires the constraint solver (S57) so that path
//     and section profiles can be evaluated; the BIM core team is
//     scheduled to land that next sprint.

import { trace, SpanStatusCode } from '@opentelemetry/api';

import type { FamilyDocument, FamilyManifest, SolidFeature } from '@pryzm/file-format';
import {
  resolveParameter,
  type FamilyParameter,
  type FamilyType,
  type ResolverDiagnostic,
} from '@pryzm/family-runtime';
import {
  produceExtrude,
  type BufferGeometryDescriptor,
  type ProfilePoint,
} from '@pryzm/geometry-kernel';

import { profileToPolygon, ProfileEvalError } from './profileToPolygon.js';

const tracer = trace.getTracer('@pryzm/family-instance');

/** Family inputs accepted by `bakeFamilyInstance`.  Compatible with the
 *  `LoadedFamily` shape returned by `@pryzm/family-loader` but kept
 *  structurally typed so this package does not depend on the loader. */
export interface FamilyInput {
  readonly manifest: FamilyManifest;
  readonly document: FamilyDocument;
  /** `sha256:<hex>` content hash; included on the OTel span and inside
   *  each `BakedSolid` so the bake-worker can content-address the
   *  resulting chunks. */
  readonly schemaHash: string;
}

export interface BakeFamilyInstanceInput {
  readonly family: FamilyInput;
  /** Selected family-type id.  Must exist in `family.document.types`. */
  readonly typeId: string;
  /** Per-instance overrides keyed by parameter id.  May be empty. */
  readonly instanceOverrides?: Readonly<Record<string, number | string | boolean>>;
}

export interface BakedSolid {
  readonly solidId: string;
  readonly kind: SolidFeature['kind'];
  readonly descriptor: BufferGeometryDescriptor;
}

export interface UnsupportedSolid {
  readonly solidId: string;
  readonly kind: SolidFeature['kind'];
  readonly reason: 'unsupported-feature' | 'profile-eval-failed' | 'invalid-length';
  readonly message: string;
}

export interface BakeFamilyInstanceResult {
  readonly ok: boolean;
  /** Successfully baked solids, in document order. */
  readonly baked: readonly BakedSolid[];
  /** Solids that were skipped, with the reason.  When `baked.length`
   *  is zero AND `unsupported.length > 0` the caller SHOULD treat the
   *  result as an error. */
  readonly unsupported: readonly UnsupportedSolid[];
  /** Resolved parameter values keyed by name (matches resolver output). */
  readonly resolvedValues: Readonly<Record<string, number | string>>;
  /** Resolver diagnostics — non-fatal warnings when `ok === true`. */
  readonly diagnostics: readonly ResolverDiagnostic[];
}

export class FamilyBakeError extends Error {
  constructor(
    public readonly code:
      | 'unknown-type'
      | 'resolver-failed'
      | 'no-solids',
    message: string,
    public readonly diagnostics: readonly ResolverDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'FamilyBakeError';
  }
}

const MM_PER_M = 1000;

export async function bakeFamilyInstance(
  input: BakeFamilyInstanceInput,
): Promise<BakeFamilyInstanceResult> {
  return tracer.startActiveSpan(
    'pryzm.family.bake.instance',
    {
      attributes: {
        'family.id': input.family.manifest.id,
        'family.semver': input.family.manifest.semver,
        'family.schemaHash': input.family.schemaHash,
        'family.typeId': input.typeId,
      },
    },
    async (span): Promise<BakeFamilyInstanceResult> => {
      try {
        const { family, typeId } = input;
        const fType = family.document.types.find((t) => t.id === typeId);
        if (!fType) {
          throw new FamilyBakeError(
            'unknown-type',
            `[bakeFamilyInstance] family ${family.manifest.id} has no type ${typeId}; available: ${family.document.types.map((t) => t.id).join(', ')}`,
          );
        }

        const overrides = coerceOverrides(input.instanceOverrides ?? {});
        const numericTypeValues: Record<string, number | string> = {};
        for (const [k, v] of Object.entries(fType.values)) {
          numericTypeValues[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
        }
        const ftype: FamilyType = { id: fType.id, name: fType.name, values: numericTypeValues };

        // Resolve parameters → values keyed by NAME (resolver convention).
        const resolved = resolveParameter({
          parameters: family.document.parameters as readonly FamilyParameter[],
          type: ftype,
          instanceOverrides: overrides,
        });
        if (!resolved.ok) {
          throw new FamilyBakeError(
            'resolver-failed',
            `[bakeFamilyInstance] resolver failed for type ${typeId} with ${resolved.diagnostics.length} diagnostic(s)`,
            resolved.diagnostics,
          );
        }
        const values = resolved.values;
        const diagnostics = resolved.diagnostics;

        if (family.document.solids.length === 0) {
          throw new FamilyBakeError(
            'no-solids',
            `[bakeFamilyInstance] family ${family.manifest.id} has zero solids; cannot bake an instance.`,
          );
        }

        const baked: BakedSolid[] = [];
        const unsupported: UnsupportedSolid[] = [];
        for (const solid of family.document.solids) {
          const out = bakeOneSolid(solid, family.document, values);
          if (out.ok) {
            baked.push(out.baked);
          } else {
            unsupported.push(out.unsupported);
          }
        }

        const ok = baked.length > 0;
        span.setAttributes({
          'family.bake.solidCount': family.document.solids.length,
          'family.bake.bakedCount': baked.length,
          'family.bake.unsupportedCount': unsupported.length,
          'family.bake.diagnosticCount': diagnostics.length,
        });
        span.setStatus({ code: ok ? SpanStatusCode.OK : SpanStatusCode.ERROR });
        return { ok, baked, unsupported, resolvedValues: values, diagnostics };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

function bakeOneSolid(
  solid: SolidFeature,
  document: FamilyDocument,
  values: Readonly<Record<string, number | string>>,
):
  | { readonly ok: true; readonly baked: BakedSolid }
  | { readonly ok: false; readonly unsupported: UnsupportedSolid } {
  if (solid.kind === 'extrude') {
    const profile = document.profiles.find((p) => p.id === solid.profileId);
    if (!profile) {
      return {
        ok: false,
        unsupported: {
          solidId: solid.id,
          kind: 'extrude',
          reason: 'profile-eval-failed',
          message: `[bakeFamilyInstance] extrude solid ${solid.id} references missing profile ${solid.profileId}`,
        },
      };
    }
    let polygon: ProfilePoint[];
    try {
      polygon = profileToPolygon(profile);
    } catch (err) {
      const code = err instanceof ProfileEvalError ? err.code : 'profile-eval-failed';
      return {
        ok: false,
        unsupported: {
          solidId: solid.id,
          kind: 'extrude',
          reason: code === 'profile-needs-solver' ? 'unsupported-feature' : 'profile-eval-failed',
          message: (err as Error).message,
        },
      };
    }

    const lengthMm = evalLengthExpression(solid.lengthExpression, values);
    if (lengthMm === null) {
      return {
        ok: false,
        unsupported: {
          solidId: solid.id,
          kind: 'extrude',
          reason: 'invalid-length',
          message: `[bakeFamilyInstance] extrude solid ${solid.id} could not evaluate lengthExpression "${solid.lengthExpression}" against the resolved scope.`,
        },
      };
    }
    const heightM = lengthMm / MM_PER_M;
    if (!Number.isFinite(heightM) || heightM <= 0) {
      return {
        ok: false,
        unsupported: {
          solidId: solid.id,
          kind: 'extrude',
          reason: 'invalid-length',
          message: `[bakeFamilyInstance] extrude solid ${solid.id} resolved heightM=${heightM} (lengthExpression=${solid.lengthExpression}); must be > 0.`,
        },
      };
    }

    const descriptor = produceExtrude(polygon, heightM, {});
    return {
      ok: true,
      baked: { solidId: solid.id, kind: 'extrude', descriptor },
    };
  }

  // sweep / loft / revolve — gated on the constraint solver (S57).
  return {
    ok: false,
    unsupported: {
      solidId: solid.id,
      kind: solid.kind,
      reason: 'unsupported-feature',
      message: `[bakeFamilyInstance] solid kind '${solid.kind}' requires the S57 constraint solver to evaluate path/section profiles; v1 supports 'extrude' only.`,
    },
  };
}

/**
 * Evaluate `lengthExpression`.  v1 contract: must be either a
 * parameter NAME present in `values` (resolver returns numbers in mm
 * for `length` parameters) or a numeric literal.  Full DSL evaluation
 * is the resolver's job — solid-level expressions in v1 stay simple.
 *
 * Returns the value in millimetres, or null when no numeric value
 * could be derived.
 */
function evalLengthExpression(
  expr: string,
  values: Readonly<Record<string, number | string>>,
): number | null {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return null;
  const direct = values[trimmed];
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return direct;
  }
  const literal = Number.parseFloat(trimmed);
  if (Number.isFinite(literal) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return literal;
  }
  return null;
}

function coerceOverrides(
  raw: Readonly<Record<string, number | string | boolean>>,
): Readonly<Record<string, number | string>> {
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return out;
}
