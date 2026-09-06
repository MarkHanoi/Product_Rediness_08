// profileToPolygon — evaluate a `Profile` into the closed XZ polygon
// consumed by the geometry adapter's `extrude` capability.
//
// ═══════════════════════════════════════════════════════════════════════════
// §4D-CLOSED-FORM-PROFILE — what changed, and the measurement that decided it
// ═══════════════════════════════════════════════════════════════════════════
//
// v1 accepted `point` entities ONLY and threw `profile-needs-solver` on the
// first `line`/`arc`/`circle`, citing "the S57 constraint solver".  Two
// separate things were wrong with that:
//
//  1. ⛔ **A FULLY-DETERMINED profile needs no solver.**  C74 §1.2 reserves
//     SOLVING for simultaneous systems with no closed form.  A `line` between
//     two determined points, an `arc` with a determined centre/radius/angles
//     and a `circle` with a determined centre/radius are each closed-form:
//     no simultaneity, no iteration.  Flattening them is arithmetic.
//     ⭐ The refusal is KEPT for the case it was always true of — an entity
//     whose data does NOT determine it (Problem B).  So the code
//     `'profile-needs-solver'` — a value on the wire, which C69 §1.1 makes a
//     versioned change to rename — is not renamed; it stops being thrown where
//     it was FALSE and keeps being thrown where it is TRUE.
//
//  2. ⛔ **`arcToPoints` CANNOT be the arc flattener**, and the audit line that
//     says it can (§5.3 fact #2, restated in the lane-4D row) is false.
//     `producers/_internal/WallPath.ts:arcToPoints` is a QUADRATIC BÉZIER
//     sampler — its own header says so — and a quadratic Bézier is a different
//     curve from a circle.  Re-measured by this lane, from source, at HEAD
//     (`probes/probe-4d-arc.local.mts`, transcript in
//     `audit/universal-component-editor/2026-09-01/phase4/probe-4d-arc.txt`):
//
//        90° arc, R = 1 m — max |r − R| = 0.060660 m at segments = 8, 32,
//        256 AND 4096.  The error is INVARIANT in `segments`: it converges to
//        the Bézier, never to the circle.  That is 60.7 × COINCIDENT_M.
//
//        Spec §64's "arched top" is a SEMICIRCLE.  Its end tangents are
//        anti-parallel, so no finite control point exists; searching k over
//        [0.1, 8] for the best symmetric control point (0, 0, k·R) bottoms out
//        at max |r − R| = 0.1077 m at k = 2.215 — 108 × COINCIDENT_M.  There
//        is no tolerance at which one quadratic span expresses it.
//
//        The closed-form trig alternative below places every vertex ON the
//        circle: max |r − R| = 2.220e-16 m at n = 16.
//
//     A CHAIN of Bézier spans does converge — so "reuse arcToPoints" is not
//     absurd, it is merely LONGER: it needs an arc-subdivision routine that
//     does not exist in this repo, on top of more code than the six lines of
//     trigonometry it would be wrapping.  The instruction to reuse it is
//     therefore not followed, and this block is the reason.
//
// ═══════════════════════════════════════════════════════════════════════════
// §4D-ENTITY-READ-CONTRACT — what this evaluator reads out of `entity.data`
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ **`ProfileEntitySchema.data` is `z.record(string, number|string|boolean|
//    null)` — it requires NO key and forbids none.**  Re-verified at HEAD
//    AFTER lane 4B's schema work (E4c of the probe: an `arc` with `{}` and an
//    `arc` with `{banana: 3}` both parse).  So the payload is UNCONTRACTED and
//    this file cannot avoid reading *something*.
//
// ⭐ **It reads the spelling that already exists rather than minting one**
//    (audit R1: EXTEND, do not mint).  The table below is copied from
//    `apps/component-editor/src/sketch/entities.ts` — `SketchPoint` /
//    `SketchLine` / `SketchCircle` / `SketchArc`, the S52–S53 sketch surface
//    ADR-0376 **D1** rules is HARVESTED rather than rebuilt.  Only the unit
//    changes: the sketch store is millimetres, the document is metres (D3).
//
//    | kind     | keys                                     | meaning                                     |
//    |----------|------------------------------------------|---------------------------------------------|
//    | `point`  | `x`, `z`                                 | a vertex                                    |
//    | `line`   | `p1`, `p2`                               | ids of two sibling `point` entities         |
//    | `circle` | `center`, `radius`                       | `center` = id of a sibling `point`          |
//    | `arc`    | `center`, `radius`, `startAngle`, `endAngle` | angles RADIANS, CCW from +X            |
//    | `spline` | `degree`, `count`, `cp0`…`cp{count−1}`   | cubic Bézier chain — see §CURVE-SPLINE-SPELLING |
//
// ═══════════════════════════════════════════════════════════════════════════
// §CURVE-SPLINE-SPELLING — the free-form curve, and why THIS spelling
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ **THIS BLOCK REPLACES A REFUSAL THAT WAS CORRECT WHEN IT WAS WRITTEN.**
//   Until now this evaluator threw on `spline` with the reason *"no spline
//   control-point spelling is defined by ProfileEntitySchema or by the sketch
//   surface, so the curve is not determined by the document"*. That was true:
//   the enum member existed, the payload did not, and the sketch surface had
//   no spline entity either. The refusal is retired by DEFINING the spelling
//   (contract `C111 §9.6`), not by loosening the evaluator — a polyline
//   through "whatever points happen to be in `data`" is still forbidden.
//
//   | key            | type    | meaning                                          |
//   |----------------|---------|--------------------------------------------------|
//   | `degree`       | number  | ⛔ MUST be 3. Any other value is REFUSED.         |
//   | `count`        | number  | control-point count; MUST be `3k+1`, `k ≥ 1`     |
//   | `cp0`…`cpN`    | string  | ids of sibling `point` entities, IN CURVE ORDER  |
//
// ⭐ **`degree` and `count` are COUNTS and are NOT expression-valued.** Every
//    other numeric key here admits a string expression, deliberately — that is
//    what makes a profile regenerate from parameters. These two do not, because
//    a parameter-dependent control-point COUNT would make the entity's topology
//    (and therefore its identity, and the meaning of every constraint attached
//    to it) change under a parameter edit. Refusing is the honest answer; the
//    coordinates stay fully parametric.
//
// ⭐ **Control points are sibling `point` entities, not inline coordinates.**
//    That is not a stylistic choice: it is what puts every control point into
//    the constraint solver's variable space for free (`${id}-x` / `${id}-y`),
//    so a `fixed` pin on a control point is a real constraint on the curve
//    rather than a decoy. It also makes `§4D-CONSTRUCTION-BY-REFERENCE` apply
//    to them automatically — a referenced point emits no boundary vertex of
//    its own.
//
// ⛔ **RATIONAL curves (weighted NURBS) are NOT expressible.** Declared in
//    `packages/geometry-kernel/src/math/cubicBezier.ts` and repeated here so a
//    reader of either file learns it: an exact circle is the `arc` kind's job,
//    not a cubic's. See C111 §9.6-d.
//
// ⛔ The refusal CODE stays `'profile-needs-solver'` for a malformed or
//    unsupported-degree spline. It is a value on the wire (C69 §1.1) and
//    `bakeFamilyInstance` maps exactly that code to the bake reason
//    `'unsupported-feature'`, which is the truthful reason for `degree: 5`.
//    Minting a new code would silently re-route it to `'profile-eval-failed'`.
//
//    Every LENGTH-valued key (`x`, `z`, `radius`) and every ANGLE-valued key
//    (`startAngle`, `endAngle`) may be either a NUMBER (already in document
//    units — metres / radians) or a STRING (an expression evaluated against
//    the resolved parameter scope through `@pryzm/family-runtime`, the ONE
//    expression engine — audit R1 again).  A string LENGTH crosses
//    `§4D-ONE-LENGTH-SEAM`; a string ANGLE does not (radians both sides).
//    ⭐ **Expression-valued coordinates are what makes a profile REGENERATE
//    FROM PARAMETERS** (spec §67) — and they need NO schema change, because
//    `data` already admits `string`.
//
// ⛔ **THE SCHEMA HALF IS OWED AND IS NOT THIS LANE'S FILE.**  This table is a
//    READ contract enforced by refusal; it is not a persisted contract.  Until
//    `ProfileEntitySchema.data` becomes a discriminated union per `kind`
//    (lane 4B's `packages/file-format/**`), a document can persist an `arc`
//    this evaluator must refuse, and nothing upstream stops it.  The delta is
//    written up in `phase4/lane-4d-profile-eval-and-geometry-adapter.md`.
//
// §4D-CONSTRUCTION-BY-REFERENCE — an entity that is REFERENCED by another
//    entity (as `p1`/`p2`/`center`) is construction geometry: it is consumed
//    by its referrer and is NOT emitted as a boundary vertex of its own.  This
//    is a DERIVED rule and needs no new field.  ⭐ It is also what makes the
//    change backward-compatible: in a v1 all-`point` profile nothing is
//    referenced, so every point still emits, in document order, exactly as
//    before.

import type { Profile } from '@pryzm/file-format';
import { evaluate, ExpressionEvalError, type EvalScope } from '@pryzm/family-runtime';
// §C73-EPSILON-POLICY (C73 §2.2) — the chord tolerance and the "same point"
// predicate are CONSUMED from the kernel's declared module.  This file
// declares no tolerance of its own; `check-epsilon-policy`'s E2/E5 ratchets
// are RED at HEAD and a new literal here would make them worse.
import {
  COINCIDENT_M,
  arePointsCoincident2D,
  // §CURVE-ONE-CUBIC-OWNER — the free-form curve primitive is CONSUMED from the
  // kernel, never re-implemented here. This file and the component-editor
  // sketch surface are its two consumers, which is why it lives in neither.
  CUBIC_BEZIER_DEGREE,
  isCubicBezierChainLength,
  sampleCubicBezierChainXZ,
  type Pt2,
} from '@pryzm/geometry-kernel';

import { runtimeLengthToMetres } from './units.js';

export class ProfileEvalError extends Error {
  constructor(
    public readonly code:
      | 'profile-needs-solver'
      | 'profile-not-closed'
      | 'profile-too-few-points'
      | 'profile-non-finite-coord',
    message: string,
  ) {
    super(message);
    this.name = 'ProfileEvalError';
  }
}

export interface PolygonPoint {
  readonly x: number;
  readonly z: number;
}

type ProfileEntity = Profile['entities'][number];

const MIN_POINTS = 3;

/** Segment-count bounds.  Counts, not tolerances — deliberately named so they
 *  carry no `EPS`/`TOL` segment, because they are neither. */
const MIN_CURVE_SEGMENTS = 2;
const MIN_CIRCLE_SEGMENTS = 3;
const MAX_CURVE_SEGMENTS = 512;

/** The keys whose value is an id of a SIBLING entity rather than a number. */
const REFERENCE_KEYS = ['p1', 'p2', 'center'] as const;

/** §CURVE-SPLINE-SPELLING — a spline's control-point keys are INDEXED
 *  (`cp0`, `cp1`, …) because `ProfileEntitySchema.data` is a flat record of
 *  scalars and cannot hold an array. This predicate is the one place that
 *  shape is recognised; it matches nothing on any other entity kind, so
 *  adding it to the reference sweep cannot change how a v1 document reads. */
const CONTROL_POINT_KEY = /^cp(0|[1-9][0-9]*)$/;

function isReferenceKey(key: string): boolean {
  return (REFERENCE_KEYS as readonly string[]).includes(key) || CONTROL_POINT_KEY.test(key);
}

/**
 * Segments needed to hold a circular sweep inside the declared model-space
 * coincidence tolerance.
 *
 * ⭐ **Pure in its inputs.**  `check-deterministic-regeneration` is RED at
 *    HEAD (D1 92/84, D2 46/41) and TESS's condition 2 is explicit: a density
 *    that depends on anything but the resolved inputs breaks
 *    regenerate-twice-byte-identical.  There is no clock, no random, no
 *    counter and no LOD input here — only `radiusM`, `sweepRad` and the
 *    kernel's declared `COINCIDENT_M`.
 *
 * ⚠ NOT PROVEN (C73 §5.4-b): CROSS-MACHINE determinism.  `Math.acos` /
 *   `Math.cos` / `Math.sin` are not required by IEEE-754 to be correctly
 *   rounded, so this is "deterministic on one engine version", which is the
 *   claim the audit's own Phase-5C row instructs lanes to make until measured
 *   otherwise.  It is not a claim of bit-equality across machines.
 */
export function segmentsForSweep(
  radiusM: number,
  sweepRad: number,
  minimum: number = MIN_CURVE_SEGMENTS,
): number {
  const sweep = Math.abs(sweepRad);
  // A radius at or below the coincidence tolerance is not a curve at model
  // scale; refusing to spend vertices on it is the honest answer.
  if (!Number.isFinite(radiusM) || radiusM <= COINCIDENT_M) return minimum;
  const ratio = 1 - COINCIDENT_M / radiusM;
  const maxStepRad = 2 * Math.acos(Math.min(1, Math.max(-1, ratio)));
  if (!(maxStepRad > 0)) return MAX_CURVE_SEGMENTS;
  const n = Math.ceil(sweep / maxStepRad);
  if (!Number.isFinite(n)) return MAX_CURVE_SEGMENTS;
  return Math.min(MAX_CURVE_SEGMENTS, Math.max(minimum, n));
}

interface EmittedPoint {
  readonly x: number;
  readonly z: number;
  /** Id of the entity that produced this vertex. */
  readonly sourceId: string;
  /** True when the vertex was COMPUTED on a curve rather than authored. */
  readonly onCurve: boolean;
}

/**
 * Walk the profile entities and emit a closed polygon in winding order.
 *
 * The polygon is returned WITHOUT a duplicated last==first vertex —
 * geometry-kernel producers handle the closing edge themselves.
 *
 * @param scope resolved parameter values, kinded, for expression-valued
 *        coordinates.  ⭐ OPTIONAL and defaulting to empty: a v1 document
 *        whose coordinates are all numeric literals evaluates identically
 *        with or without it, which is what keeps this change backward
 *        compatible.  A STRING coordinate with no scope refuses rather than
 *        guessing.
 */
export function profileToPolygon(profile: Profile, scope: EvalScope = {}): PolygonPoint[] {
  const byId = new Map<string, ProfileEntity>();
  for (const e of profile.entities) byId.set(e.id, e);

  // §4D-CONSTRUCTION-BY-REFERENCE — an entity consumed by a referrer does not
  // emit a vertex of its own.
  const referenced = new Set<string>();
  for (const e of profile.entities) {
    for (const [key, v] of Object.entries(e.data)) {
      if (!isReferenceKey(key)) continue;
      if (typeof v === 'string' && byId.has(v)) referenced.add(v);
    }
  }

  const emitted: EmittedPoint[] = [];
  const push = (p: EmittedPoint): void => {
    const last = emitted[emitted.length - 1];
    if (last) {
      // Exact, identity-based: the shared endpoint of two consecutive edges IS
      // the same authored entity.  No tolerance is involved and none is needed.
      if (last.sourceId === p.sourceId && !last.onCurve && !p.onCurve) return;
      // Tolerance-based, and ONLY where a curve is involved: a computed curve
      // endpoint and the authored vertex it meets are the same model point.
      // ⛔ Deliberately NOT applied between two authored `point` entities —
      // those are two vertices the author wrote, and merging them would change
      // the meaning of every v1 document.
      if ((last.onCurve || p.onCurve) && arePointsCoincident2D(last.x, last.z, p.x, p.z)) return;
    }
    emitted.push(p);
  };

  for (const e of profile.entities) {
    if (referenced.has(e.id)) continue;
    switch (e.kind) {
      case 'point': {
        const { x, z } = readPointCoords(profile, e, scope);
        push({ x, z, sourceId: e.id, onCurve: false });
        break;
      }
      case 'line': {
        for (const key of ['p1', 'p2'] as const) {
          const target = resolveReference(profile, e, key, byId);
          const { x, z } = readPointCoords(profile, target, scope);
          push({ x, z, sourceId: target.id, onCurve: false });
        }
        break;
      }
      case 'circle': {
        const centre = readPointCoords(profile, resolveReference(profile, e, 'center', byId), scope);
        const radius = readLength(profile, e, 'radius', scope);
        const segments = segmentsForSweep(radius, Math.PI * 2, MIN_CIRCLE_SEGMENTS);
        // Full turn: emit `segments` vertices and let the polygon close itself.
        for (let i = 0; i < segments; i++) {
          const t = (Math.PI * 2 * i) / segments;
          push({
            x: centre.x + radius * Math.cos(t),
            z: centre.z + radius * Math.sin(t),
            sourceId: e.id,
            onCurve: true,
          });
        }
        break;
      }
      case 'arc': {
        const centre = readPointCoords(profile, resolveReference(profile, e, 'center', byId), scope);
        const radius = readLength(profile, e, 'radius', scope);
        const a0 = readAngle(profile, e, 'startAngle', scope);
        const a1 = readAngle(profile, e, 'endAngle', scope);
        // ⭐ The sweep is taken AS AUTHORED (`endAngle − startAngle`), not
        // normalised — `SketchArc`'s own header rules that the long way round
        // is expressed by the angles themselves.  Normalising here would
        // silently shorten an authored major arc.
        const sweep = a1 - a0;
        const segments = segmentsForSweep(radius, sweep);
        for (let i = 0; i <= segments; i++) {
          const t = a0 + (sweep * i) / segments;
          push({
            x: centre.x + radius * Math.cos(t),
            z: centre.z + radius * Math.sin(t),
            sourceId: e.id,
            onCurve: true,
          });
        }
        break;
      }
      case 'spline': {
        // §CURVE-SPLINE-SPELLING (C111 §9.6). The REFUSAL that stood here
        // until the spelling existed is retired above, in the header, with
        // its reason — not deleted silently.
        const controls = readSplineControlPoints(profile, e, byId, scope);
        // The chain's own endpoints are AUTHORED points and are emitted as
        // such; the interior vertices are computed. `push`'s tolerance-based
        // merge (which applies only where a curve is involved) then joins the
        // span to the line or arc that meets it.
        for (const c of sampleCubicBezierChainXZ(controls)) {
          push({ x: c[0], z: c[1], sourceId: e.id, onCurve: true });
        }
        break;
      }
    }
  }

  const points: PolygonPoint[] = emitted.map((p) => ({ x: p.x, z: p.z }));

  // Drop a duplicated trailing point if the author closed the loop
  // explicitly — geometry-kernel adds the closing edge itself.
  //
  // ⚠ The 1e-9 band below is PRE-EXISTING and is deliberately left byte-for-
  //   byte alone.  C73 §2.5 lets a declared tolerance SHRINK but never widen,
  //   and swapping it for `COINCIDENT_M` (1e-3 m) would WIDEN this test 10^6×
  //   — changing what "already closed" means for every existing document, to
  //   make a refactor tidier.  Migrating it is a separate, argued change.
  const first = points[0];
  const last = points[points.length - 1];
  if (
    first &&
    last &&
    points.length > MIN_POINTS &&
    Math.abs(first.x - last.x) < 1e-9 &&
    Math.abs(first.z - last.z) < 1e-9
  ) {
    points.pop();
  }
  if (points.length < MIN_POINTS) {
    throw new ProfileEvalError(
      'profile-too-few-points',
      `[profileToPolygon] profile ${profile.id} resolved to ${points.length} unique points; need at least ${MIN_POINTS}.`,
    );
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Reading `entity.data` — every path either yields a finite number or  */
/* refuses.  Nothing is defaulted, because a defaulted coordinate is an */
/* invented one (spec §75).                                             */
/* ------------------------------------------------------------------ */

function resolveReference(
  profile: Profile,
  entity: ProfileEntity,
  key: string,
  byId: ReadonlyMap<string, ProfileEntity>,
): ProfileEntity {
  const raw = entity.data[key];
  if (typeof raw !== 'string') {
    throw new ProfileEvalError(
      'profile-needs-solver',
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') has no '${key}' reference (got ${JSON.stringify(raw)}); the entity is not determined by the document. See §4D-ENTITY-READ-CONTRACT.`,
    );
  }
  const target = byId.get(raw);
  if (!target) {
    throw new ProfileEvalError(
      'profile-needs-solver',
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') references '${key}'=${JSON.stringify(raw)}, which is not an entity of this profile; the entity is not determined by the document.`,
    );
  }
  if (target.kind !== 'point') {
    throw new ProfileEvalError(
      'profile-needs-solver',
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') references '${key}'=${target.id}, which is a '${target.kind}' and not a 'point'. See §4D-ENTITY-READ-CONTRACT.`,
    );
  }
  return target;
}

/**
 * §CURVE-SPLINE-SPELLING — resolve `degree` + `count` + `cp0…cpN` into the
 * control polygon, refusing at every step where the document does not
 * determine the curve.
 *
 * ⛔ Every refusal here carries `'profile-needs-solver'` and NAMES what is
 *    missing or unsupported. None of them substitutes a default: a spline with
 *    no `count` is under-determined, and inventing one would be inventing
 *    geometry the author did not draw (spec §75).
 */
function readSplineControlPoints(
  profile: Profile,
  entity: ProfileEntity,
  byId: ReadonlyMap<string, ProfileEntity>,
  scope: EvalScope,
): Pt2[] {
  const degree = entity.data['degree'];
  if (degree !== CUBIC_BEZIER_DEGREE) {
    throw new ProfileEvalError(
      'profile-needs-solver',
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('spline') declares degree ${JSON.stringify(degree)}; only degree ${CUBIC_BEZIER_DEGREE} (cubic Bézier chain) is evaluable. Rational/weighted curves are a declared gap — see C111 §9.6-d.`,
    );
  }
  const count = entity.data['count'];
  if (typeof count !== 'number' || !isCubicBezierChainLength(count)) {
    throw new ProfileEvalError(
      'profile-needs-solver',
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('spline') has count ${JSON.stringify(count)}; a cubic Bézier chain needs a literal 3k+1 control-point count (4, 7, 10, …). 'count' is a COUNT and is deliberately not expression-valued — see §CURVE-SPLINE-SPELLING.`,
    );
  }
  const controls: Pt2[] = [];
  for (let i = 0; i < count; i++) {
    // ⭐ The SAME reference resolver every other kind uses (`p1` / `p2` /
    //    `center`) — so a dangling or non-`point` control point refuses with
    //    the one message this file already emits, not a second dialect of it.
    const target = resolveReference(profile, entity, `cp${i}`, byId);
    const { x, z } = readPointCoords(profile, target, scope);
    controls.push([x, z]);
  }
  return controls;
}

function readPointCoords(
  profile: Profile,
  entity: ProfileEntity,
  scope: EvalScope,
): { x: number; z: number } {
  return {
    x: readLength(profile, entity, 'x', scope),
    z: readLength(profile, entity, 'z', scope),
  };
}

/** A LENGTH-valued key: a number is already document metres; a string is an
 *  expression whose result crosses `§4D-ONE-LENGTH-SEAM`. */
function readLength(
  profile: Profile,
  entity: ProfileEntity,
  key: string,
  scope: EvalScope,
): number {
  const raw = entity.data[key];
  if (typeof raw === 'number') return finite(profile, entity, key, raw);
  if (typeof raw === 'string') {
    return finite(profile, entity, key, runtimeLengthToMetres(evalExpression(profile, entity, key, raw, scope)));
  }
  throw missingKey(profile, entity, key, raw);
}

/** An ANGLE-valued key: radians on BOTH sides of the runtime boundary, so
 *  there is no conversion — see the declared absence in `units.ts`. */
function readAngle(
  profile: Profile,
  entity: ProfileEntity,
  key: string,
  scope: EvalScope,
): number {
  const raw = entity.data[key];
  if (typeof raw === 'number') return finite(profile, entity, key, raw);
  if (typeof raw === 'string') {
    return finite(profile, entity, key, evalExpression(profile, entity, key, raw, scope));
  }
  throw missingKey(profile, entity, key, raw);
}

function evalExpression(
  profile: Profile,
  entity: ProfileEntity,
  key: string,
  src: string,
  scope: EvalScope,
): number {
  try {
    // ⛔ THE ONE expression engine (audit R1). This lane mints none.
    return evaluate(src, scope);
  } catch (err) {
    const detail = err instanceof ExpressionEvalError || err instanceof Error ? err.message : String(err);
    throw new ProfileEvalError(
      'profile-needs-solver',
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} key '${key}' holds expression ${JSON.stringify(src)} which did not evaluate against the resolved parameter scope: ${detail}`,
    );
  }
}

function finite(profile: Profile, entity: ProfileEntity, key: string, v: number): number {
  if (!Number.isFinite(v)) {
    throw new ProfileEvalError(
      'profile-non-finite-coord',
      `[profileToPolygon] profile ${profile.id} entity ${entity.id} key '${key}' resolved to a non-finite value (${String(v)}).`,
    );
  }
  return v;
}

function missingKey(
  profile: Profile,
  entity: ProfileEntity,
  key: string,
  raw: unknown,
): ProfileEvalError {
  // ⭐ THIS is the case `'profile-needs-solver'` was always TRUE of: the data
  // does not determine the entity.  C74 §4.2(c)'s under-determined sketch.
  return new ProfileEvalError(
    'profile-needs-solver',
    `[profileToPolygon] profile ${profile.id} entity ${entity.id} ('${entity.kind}') has no numeric or expression value for '${key}' (got ${JSON.stringify(raw)}); the entity is under-determined. See §4D-ENTITY-READ-CONTRACT.`,
  );
}
