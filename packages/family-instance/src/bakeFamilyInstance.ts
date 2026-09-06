// bakeFamilyInstance — pure-Node family-instance bake pipeline.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D2.
//
// Inputs: a LoadedFamily-shape (manifest + document + ifcMapping +
// schemaHash) plus the chosen `typeId`, any per-instance overrides, and
// OPTIONALLY the `GeometryAdapter` that evaluates the geometry.
//
// Outputs: one BufferGeometryDescriptor per `solid` in the family
// document, in document order.  Returned with the resolved values map
// so the caller (the editor or the bake-worker) can attach instance
// parameters to the IFC export downstream.
//
// ═══════════════════════════════════════════════════════════════════════════
// §4D-SCHEMA-DELTA — why `sweep` / `loft` / `revolve` still refuse, and what
// EXACTLY would change that.  ⛔ Read this before "fixing" the refusal.
// ═══════════════════════════════════════════════════════════════════════════
//
// The refusal used to read *"requires the S57 constraint solver to evaluate
// path/section profiles"*.  **That reason was false.**  C74 §1.2 reserves
// SOLVING for simultaneous systems with no closed form, and none of the three
// needs one.  An exact B-Rep kernel handed today's `FamilyDocument` would be
// JUST AS UNABLE to evaluate them, because the missing information is not in
// the evaluator — it is not in the DOCUMENT.  The producers are complete, and
// as of lane 4D they are on the kernel's public surface and wired into the
// `GeometryAdapter`.  What is missing is persisted fields:
//
//   sweep    · the PATH.  `produceSweep` takes `Point3D[]` in WORLD 3-D; the
//              document has `pathProfileId`, a 2-D `Profile` bound to a plane.
//              Lifting 2-D → 3-D needs the plane basis below.  `options.closed`
//              has no field on the arm at all.
//   loft     · `section.right` and `section.up` — the in-plane basis.  Plus a
//              vertex-ARITY rule: `produceLoft` requires every section to have
//              the same vertex count and `profileIds[]` states no such rule.
//   revolve  · the AXIS.  `produceRevolve` measures `r` from an axis the
//              producer hard-wires to world +Y; the arm has no axis field, and
//              which document ordinate is `r` and which is `y` is unrecorded.
//   ⭐ ALL THREE · `ReferencePlaneSchema` is `{id, name, origin, normal,
//              isHost}`.  A `normal` fixes a plane's ORIENTATION but leaves
//              the SPIN about that normal free — one rotational degree of
//              freedom, unpersisted.  Re-measured by this lane at HEAD, after
//              lane 4B's schema work: two perfectly orthonormal bases, both
//              exactly perpendicular to the same normal, lift the same
//              document point (x=2, z=0) to (2.0000, 0, 0) and (1.0000, 0,
//              1.7321) — 2.0000 m apart, 2000 × COINCIDENT_M.
//
// ⛔ DERIVING the basis from the normal instead of persisting it is NOT a fix:
//    a dominant-axis seed flips between normals 1e-12 apart — a thousand times
//    below the repo's declared `PARALLEL_RAD` — which makes profile
//    orientation discontinuous under authoring and would be a SECOND source of
//    truth for orientation (§76 gate B).  Persist it.
//
// ⛔ AND DO NOT BUILD A SOLVER TO RESCUE THIS (C74 §4.1).  Six persisted
//    fields close it.  The delta is written up for the schema owner in
//    `audit/universal-component-editor/2026-09-01/phase4/
//     lane-4d-profile-eval-and-geometry-adapter.md`.

import { trace, SpanStatusCode } from '@opentelemetry/api';

import type {
  FamilyDocument,
  FamilyManifest,
  Profile,
  ReferencePlane,
  SolidFeature,
} from '@pryzm/file-format';
import {
  evaluate,
  ExpressionEvalError,
  kindOfDataType,
  resolveParameter,
  type EvalScope,
  type FamilyParameter,
  type FamilyType,
  type ResolverDiagnostic,
  type ScopeValue,
} from '@pryzm/family-runtime';
import {
  isNumericallyZero,
  isParallel,
  type BufferGeometryDescriptor,
  type ProfilePoint,
} from '@pryzm/geometry-kernel';

import { profileToPolygon, ProfileEvalError } from './profileToPolygon.js';
import { runtimeLengthToMetres } from './units.js';
import {
  adapterCapabilities,
  kernelGeometryAdapter,
  type GeometryAdapter,
} from './geometryAdapter.js';

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
  /**
   * The evaluator behind the kernel boundary (spec §17–20).  Defaults to
   * `kernelGeometryAdapter`, so every existing caller is unchanged.
   *
   * ⭐ Injecting it is what makes the TRANSLATION testable without the
   *    producers, and the producers replaceable without the translation.
   */
  readonly adapter?: GeometryAdapter;
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
        const adapter = input.adapter ?? kernelGeometryAdapter;
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
        const parameters = family.document.parameters as readonly FamilyParameter[];
        const resolved = resolveParameter({
          parameters,
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
        const scope = buildEvalScope(parameters, values);

        if (family.document.solids.length === 0) {
          throw new FamilyBakeError(
            'no-solids',
            `[bakeFamilyInstance] family ${family.manifest.id} has zero solids; cannot bake an instance.`,
          );
        }

        const baked: BakedSolid[] = [];
        const unsupported: UnsupportedSolid[] = [];
        for (const solid of family.document.solids) {
          const out = bakeOneSolid(solid, family.document, values, scope, adapter);
          if (out.ok) {
            baked.push(out.baked);
          } else {
            unsupported.push(out.unsupported);
          }
        }

        const ok = baked.length > 0;
        span.setAttributes({
          'family.bake.adapter': adapter.id,
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

/**
 * Build the KINDED scope the expression engine needs.
 *
 * ⭐ Kinds are carried, not erased.  Lane 4A's `§UNIT-KIND-ERASURE` fix made
 *    `EvalScope` accept `{value, kind}`, which is what gives `UnitMismatchError`
 *    a reachable throw site.  Passing bare numbers here would silently opt
 *    every profile-coordinate expression OUT of that refusal — the exact
 *    defect 4A closed, re-opened one package downstream.
 *
 * String-valued parameters are omitted rather than coerced: a string has no
 * numeric kind, and inventing one is how `unknown` becomes `scalar` by
 * accident.
 */
function buildEvalScope(
  parameters: readonly FamilyParameter[],
  values: Readonly<Record<string, number | string>>,
): EvalScope {
  const kindByName = new Map<string, ReturnType<typeof kindOfDataType>>();
  for (const p of parameters) kindByName.set(p.name, kindOfDataType(p.dataType));
  const scope: Record<string, ScopeValue> = {};
  for (const [name, v] of Object.entries(values)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    scope[name] = { value: v, kind: kindByName.get(name) ?? 'scalar' };
  }
  return scope;
}

type SolidOutcome =
  | { readonly ok: true; readonly baked: BakedSolid }
  | { readonly ok: false; readonly unsupported: UnsupportedSolid };

function refuse(
  solid: SolidFeature,
  reason: UnsupportedSolid['reason'],
  message: string,
): SolidOutcome {
  return { ok: false, unsupported: { solidId: solid.id, kind: solid.kind, reason, message } };
}

/**
 * Translate ONE document solid into a call on the injected adapter.
 *
 * ⭐ This is where the old `switch (solid.kind)` used to pick a PRODUCER.  It
 *    now decides only what the DOCUMENT describes and whether the document
 *    describes it completely; the evaluator is looked up on the port.  The
 *    remaining `switch` is over a discriminated union of persisted shapes —
 *    which is inherent to reading the document and is not the kernel coupling
 *    that was removed.
 */
function bakeOneSolid(
  solid: SolidFeature,
  document: FamilyDocument,
  values: Readonly<Record<string, number | string>>,
  scope: EvalScope,
  adapter: GeometryAdapter,
): SolidOutcome {
  switch (solid.kind) {
    case 'extrude': {
      if (!adapter.extrude) return noCapability(solid, adapter);
      const profile = document.profiles.find((p) => p.id === solid.profileId);
      if (!profile) {
        return refuse(
          solid,
          'profile-eval-failed',
          `[bakeFamilyInstance] extrude solid ${solid.id} references missing profile ${solid.profileId}`,
        );
      }
      let polygon: ProfilePoint[];
      try {
        polygon = profileToPolygon(profile, scope);
      } catch (err) {
        const code = err instanceof ProfileEvalError ? err.code : 'profile-eval-failed';
        return refuse(
          solid,
          code === 'profile-needs-solver' ? 'unsupported-feature' : 'profile-eval-failed',
          (err as Error).message,
        );
      }

      // ⭐⭐ §82.4-DIRECTED-EXTRUDE — THE DIRECTION IS READ, AND SWEPT ALONG.
      //
      // ⛔ THIS REPLACES §4D-DIRECTION-IS-NOT-READ. That note read: *"the
      //    adapter's extrude capability builds along +Y only … Closing it needs
      //    a direction/axis on ExtrudeOptions in @pryzm/geometry-kernel"*, and
      //    the bake REFUSED any other direction rather than silently building a
      //    vertical solid. The refusal was right for its day and it named its
      //    own fix; the fix has landed (`ExtrudeOptions.direction`, measured in
      //    `packages/geometry-kernel/__tests__/produceExtrude.direction.test.ts`),
      //    so the refusal is retired rather than left standing as a lie in the
      //    OTHER direction — "we cannot" said by code that can.
      //
      // ⭐ THE +Y PATH IS BIT-IDENTICAL. An explicit `direction: {0,1,0}` is the
      //    identity in the producer: same vertices, same bounds, SAME HASH as
      //    passing no option at all (asserted in that suite's first case). So
      //    handing the field through unconditionally does not re-shape, and does
      //    not re-key, one existing descriptor.
      //
      // ⛔ WHAT IS STILL REFUSED, and why it is refused HERE rather than left to
      //    throw out of the producer: a zero-length direction is SCHEMA-VALID
      //    (`Vec3` is three finite numbers; it does not require a unit vector),
      //    and a throw would take the whole bake down for one solid instead of
      //    producing the per-solid sentence spec §75 asks for.
      const dirLen = Math.hypot(solid.direction.x, solid.direction.y, solid.direction.z);
      if (!Number.isFinite(dirLen) || isNumericallyZero(dirLen)) {
        return refuse(
          solid,
          'unsupported-feature',
          `[bakeFamilyInstance] extrude solid ${solid.id} carries direction (${solid.direction.x}, ${solid.direction.y}, ${solid.direction.z}), which has zero length and so names no sweep axis. Refused rather than substituting the +Y default (spec §75) — a solid whose axis is unstated is not a solid that happens to be vertical.`,
        );
      }

      const lengthRuntime = evalLengthExpression(solid.lengthExpression, values);
      if (lengthRuntime === null) {
        return refuse(
          solid,
          'invalid-length',
          `[bakeFamilyInstance] extrude solid ${solid.id} could not evaluate lengthExpression "${solid.lengthExpression}" against the resolved scope.`,
        );
      }
      const heightM = runtimeLengthToMetres(lengthRuntime);
      if (!Number.isFinite(heightM) || heightM <= 0) {
        return refuse(
          solid,
          'invalid-length',
          `[bakeFamilyInstance] extrude solid ${solid.id} resolved heightM=${heightM} (lengthExpression=${solid.lengthExpression}); must be > 0.`,
        );
      }

      // ⭐⭐ §82.1-PARAMETRIC-DATUM — THE PLANE'S OFFSET IS READ, AND THE SOLID
      //     MOVES WITH IT.
      //
      // ⛔ THIS RETIRES HALF OF §4D-SCHEMA-DELTA's fourth bullet and half of
      //    `add-reference-plane`'s "STILL NOT HONOURED" note. Both read that a
      //    plane's ORIGIN is not applied — true of the LITERAL `origin`, which
      //    is still applied by nothing and still refused by
      //    `set-extrude-work-plane`. It is NOT true of `offsetExpression`, the
      //    parametric channel: that IS applied here, which is what makes a
      //    reference plane a datum a PARAMETER can move rather than a label.
      //
      // ⭐ THE UNDIMENSIONED PATH IS BIT-IDENTICAL. A plane with no
      //    `offsetExpression` yields `worldY = 0`, and `produceExtrude` reads
      //    `options?.worldY ?? 0` — same vertices, same bounds, SAME HASH as
      //    passing no option at all. So every existing document re-bakes to the
      //    descriptor it already had.
      const placement = resolvePlaneOffsetM(solid, profile, document, scope);
      if (!placement.ok) return refuse(solid, placement.reason, placement.message);

      // §82.4-DIRECTED-EXTRUDE — the document's axis, forwarded verbatim. The
      // producer normalises it; the bake does not pre-normalise, so there is one
      // normalisation in the system and not two that can round differently.
      const descriptor = adapter.extrude(polygon, heightM, {
        direction: solid.direction,
        worldY: placement.offsetM,
      });
      return { ok: true, baked: { solidId: solid.id, kind: 'extrude', descriptor } };
    }

    case 'sweep':
      return refuse(
        solid,
        'unsupported-feature',
        `[bakeFamilyInstance] sweep solid ${solid.id}: the adapter '${adapter.id}' PROVIDES sweep, but the document cannot describe one. ` +
          `\`pathProfileId\` names a 2-D Profile bound to a ReferencePlane, and produceSweep needs a WORLD 3-D path; ReferencePlaneSchema carries {id, name, origin, normal, isHost} and NO in-plane basis, so the lift is short one rotational degree of freedom. \`options.closed\` has no field on the arm. This is a SCHEMA gap, not a solver gap and not a tessellation gap — see §4D-SCHEMA-DELTA.`,
      );

    case 'loft':
      return refuse(
        solid,
        'unsupported-feature',
        `[bakeFamilyInstance] loft solid ${solid.id}: the adapter '${adapter.id}' PROVIDES loft, but the document cannot describe one. ` +
          `produceLoft needs each section's \`right\` and \`up\` (the in-plane basis) and requires every section to carry the SAME vertex count; ReferencePlaneSchema persists no basis and \`profileIds[]\` states no arity rule. SCHEMA gap — see §4D-SCHEMA-DELTA.`,
      );

    case 'revolve':
      return refuse(
        solid,
        'unsupported-feature',
        `[bakeFamilyInstance] revolve solid ${solid.id}: the adapter '${adapter.id}' PROVIDES revolve, but the document cannot describe one. ` +
          `produceRevolve measures \`r\` from an AXIS it hard-wires to world +Y, and the revolve arm persists no axis; nor does the document record which profile ordinate is \`r\` and which is \`y\`. \`sweepDeg\` and \`segments\` ARE supplied. SCHEMA gap — see §4D-SCHEMA-DELTA.`,
      );

    case 'boolean':
      return refuse(
        solid,
        'unsupported-feature',
        `[bakeFamilyInstance] boolean solid ${solid.id}: \`produceBoolean\` exists and works, but evaluating a boolean feature requires a FEATURE-GRAPH ORDER — which solids are consumed by the boolean and therefore must not also appear in the output. \`featureEdges[]\` was added by lane 4B and DECLARED INERT (ADR-0376 D7 OPEN). Picking an evaluation order here would decide D7 by accident and freeze it. Refused pending D7.`,
      );
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * §82.1-PARAMETRIC-DATUM — where a reference plane stops being a label
 * ══════════════════════════════════════════════════════════════════════════
 *
 * THE REVIT SEMANTIC THIS IMPLEMENTS, stated so the next reader can check the
 * code against it rather than against a hope: geometry is LOCKED to reference
 * planes; planes are positioned by PARAMETRIC dimensions; changing a parameter
 * moves the plane and the geometry follows.
 *
 * Here that is exactly three steps and no more:
 *   1. the solid's profile names a plane (`Profile.planeId` — the LOCK);
 *   2. the plane names a dimension (`ReferencePlane.offsetExpression` — an
 *      expression over the SAME resolved parameter scope every profile
 *      coordinate and every `lengthExpression` is read against, evaluated by
 *      the ONE engine, C110 §4 standing rule);
 *   3. the resolved distance is handed to `produceExtrude` as `worldY`, which
 *      offsets the solid ALONG the sweep axis before the axis is rotated into
 *      place — so the shape lands on the plane.
 *
 * ⛔ STEP 3 IS ONLY SOUND WHILE THE SWEEP AXIS IS THE PLANE'S NORMAL, and that
 *    is a document fact this function must CHECK rather than assume.
 *    `set-extrude-work-plane` writes the plane's unit normal onto the solid's
 *    `direction`, so an authored document agrees by construction — but a
 *    hand-written one need not, and `worldY` moves the solid along `direction`,
 *    not along the normal. If they disagree the offset would go somewhere the
 *    author never asked for, so this refuses and names both vectors. ⛔ Do NOT
 *    "fix" that by projecting the offset onto the axis: an offset along a plane
 *    is not a component of an offset along some other line, and the projection
 *    would silently shorten every dimension the author wrote (spec §75).
 *
 * ⚠ DECLARED ABSENCES (C84 EI-6), each with its reason:
 *   • ANTIPARALLEL is refused, not negated. A `direction` of −n̂ on a plane
 *     dimensioned `+900` leaves "which way is 900 mm" answered two ways, and
 *     picking one here would freeze the answer by accident.
 *   • Only `extrude` consults a plane, because only `extrude` bakes
 *     (`BAKEABLE_SOLID_KINDS`). The other four refuse upstream of this.
 *   • The plane's SPIN about its normal is still unpersisted
 *     (§4D-SCHEMA-DELTA). This moves a plane along its normal and rotates
 *     nothing.
 *   • The offset is measured from the MODEL ORIGIN, never from another plane.
 *     Plane-to-plane dimensioning needs a datum graph with its own cycle
 *     detection; C110 §4.3's Kahn sort is over PARAMETERS, not planes.
 */

type PlanePlacement =
  | { readonly ok: true; readonly offsetM: number }
  | {
      readonly ok: false;
      readonly reason: UnsupportedSolid['reason'];
      readonly message: string;
    };

/** Signed distance, in document metres, that this solid must move along its
 *  sweep axis because the plane its profile is locked to carries a parametric
 *  dimension. `0` when there is no plane, or no dimension — the pre-§82.1 path,
 *  which `produceExtrude` reads as `options?.worldY ?? 0` and therefore bakes
 *  byte-identically to passing no option at all. */
function resolvePlaneOffsetM(
  solid: SolidFeature,
  profile: Profile,
  document: FamilyDocument,
  scope: EvalScope,
): PlanePlacement {
  const plane = (document.referencePlanes as readonly ReferencePlane[])
    .find((pl) => pl.id === profile.planeId);
  // ⚠ A MISSING PLANE IS NOT THIS FUNCTION'S REFUSAL. `profileToPolygon` reads
  //   a profile's ordinates as model X/Z and never consulted the plane, so
  //   every v1 document with a dangling `planeId` bakes today. Refusing here
  //   would newly break documents this change is not about.
  if (!plane || plane.offsetExpression === undefined) return { ok: true, offsetM: 0 };

  const n = plane.normal;
  const nLen = Math.hypot(n.x, n.y, n.z);
  const d = solid.direction;
  const dLen = Math.hypot(d.x, d.y, d.z);
  if (isNumericallyZero(nLen)) {
    return {
      ok: false,
      reason: 'unsupported-feature',
      message:
        `[bakeFamilyInstance] extrude solid ${solid.id} is built on plane "${plane.name}" ` +
        `(${plane.id}), which is dimensioned "${plane.offsetExpression}" but carries a zero-length ` +
        'normal — so the dimension names no direction to move along.',
    };
  }

  // Unit vectors first: `isParallel` is documented as unable to tell whether it
  // was handed a cross product of NON-unit vectors, so normalising is the
  // caller's job and is done here rather than trusted to the document.
  const un = { x: n.x / nLen, y: n.y / nLen, z: n.z / nLen };
  const ud = { x: d.x / dLen, y: d.y / dLen, z: d.z / dLen };
  const cross = Math.hypot(
    un.y * ud.z - un.z * ud.y,
    un.z * ud.x - un.x * ud.z,
    un.x * ud.y - un.y * ud.x,
  );
  const dot = un.x * ud.x + un.y * ud.y + un.z * ud.z;
  if (!isParallel(cross) || dot <= 0) {
    return {
      ok: false,
      reason: 'unsupported-feature',
      message:
        `[bakeFamilyInstance] extrude solid ${solid.id} sweeps along (${d.x}, ${d.y}, ${d.z}) while ` +
        `the plane it is built on, "${plane.name}" (${plane.id}), has normal (${n.x}, ${n.y}, ${n.z}) ` +
        `and is dimensioned "${plane.offsetExpression}". The offset is measured along the plane's ` +
        'normal and the solid moves along its sweep axis; while those are not the SAME direction the ' +
        'offset would land the shape somewhere the document does not state. Refused rather than ' +
        'projecting it (spec §75). Put the solid on the plane with `set-extrude-work-plane`, which ' +
        "writes the plane's unit normal onto the solid's direction.",
    };
  }

  // ⛔ ONE POSITION, CHECKED A SECOND TIME. `set-plane-offset` refuses this pair
  //    at authoring; a hand-written document never passes through that op, and a
  //    literal origin the bake ignores sitting beside an offset the bake applies
  //    is a document that means one thing and renders another.
  const o = plane.origin;
  if (!isNumericallyZero(o.x) || !isNumericallyZero(o.y) || !isNumericallyZero(o.z)) {
    return {
      ok: false,
      reason: 'unsupported-feature',
      message:
        `[bakeFamilyInstance] plane "${plane.name}" (${plane.id}) states its position TWICE: a ` +
        `literal origin (${o.x}, ${o.y}, ${o.z}) that no evaluator applies, and the dimension ` +
        `"${plane.offsetExpression}" that this bake does apply. Refused rather than silently ` +
        'preferring one (spec §75). Return the origin to (0, 0, 0) and keep the dimension.',
    };
  }

  let runtimeLength: number;
  try {
    // ⛔ THE ONE expression engine (C110 §4, audit R1). This lane mints none,
    //    and does not add a separate branch for a bare number either: `"900"` is
    //    a NUMBER literal the grammar already reads, so a second `parseFloat`
    //    path would be a second reading of one spelling (C84 EI-9).
    runtimeLength = evaluate(plane.offsetExpression, scope);
  } catch (err) {
    const detail =
      err instanceof ExpressionEvalError || err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: 'invalid-length',
      message:
        `[bakeFamilyInstance] extrude solid ${solid.id} is built on plane "${plane.name}" ` +
        `(${plane.id}), whose dimension ${JSON.stringify(plane.offsetExpression)} did not evaluate ` +
        `against the resolved parameter scope: ${detail}`,
    };
  }
  if (!Number.isFinite(runtimeLength)) {
    return {
      ok: false,
      reason: 'invalid-length',
      message:
        `[bakeFamilyInstance] plane "${plane.name}" (${plane.id}) dimension ` +
        `${JSON.stringify(plane.offsetExpression)} resolved to ${String(runtimeLength)}, which is ` +
        'not a distance.',
    };
  }

  // §4D-ONE-LENGTH-SEAM crossed exactly once, by the one helper. ⛔ A NEGATIVE
  // offset is LEGAL and is not clamped: "150 mm below the datum" is a dimension
  // an author writes, and a clamp would silently move their geometry.
  return { ok: true, offsetM: runtimeLengthToMetres(runtimeLength) };
}

function noCapability(solid: SolidFeature, adapter: GeometryAdapter): SolidOutcome {
  const caps = adapterCapabilities(adapter);
  return refuse(
    solid,
    'unsupported-feature',
    `[bakeFamilyInstance] solid ${solid.id} is kind '${solid.kind}' and the injected adapter '${adapter.id}' does not provide that capability (provides: ${caps.length > 0 ? caps.join(', ') : 'none'}).`,
  );
}

/* §82.4-DIRECTED-EXTRUDE — `isPlusY` was here, and it is GONE ON PURPOSE.
 * It answered "is this the ONE direction the producer can build along?", a
 * question with no meaning now that the producer builds along any axis. Keeping
 * it as a branch ("fast path for vertical") would re-introduce two code paths
 * for one operation and the temptation to let them diverge. `isNumericallyZero`
 * survives at the call site above, doing the job it is actually for (C73 §2.1):
 * deciding whether a vector has length at all. */

/**
 * Evaluate `lengthExpression`.  v1 contract: must be either a
 * parameter NAME present in `values` (resolver returns lengths in the
 * `@pryzm/family-runtime` canonical length unit) or a numeric literal.
 * Full DSL evaluation is the resolver's job — solid-level expressions in v1
 * stay simple.
 *
 * Returns the value in RUNTIME length units; the caller crosses
 * `§4D-ONE-LENGTH-SEAM` exactly once, via `runtimeLengthToMetres`.
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
