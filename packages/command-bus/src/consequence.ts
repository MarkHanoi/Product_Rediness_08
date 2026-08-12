// The consequence contract — plan → [confirm] → execute → read back → report.
//
// R1 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md, implementing
// ADR-0322 §1 (one authoritative consequence object), §5 (UNDETERMINED is
// first-class), §6 (`untouched` is derived, never persisted), §9 (migration,
// not flag-day) and the ADR-0324 §1–2 invocation envelope
// (`CommandExecutionContext`: actor / origin / approval).
//
// ⚠ FIRST DRAFT — the exact field shape is expected to be revised after the
// `wall.move` golden operation closes end-to-end (R2–R7). ADR-0322 "Not
// decided here" reserves that revision explicitly: the SINGULARITY of this
// type family is the decision; the field list is not frozen. Do not build a
// rival representation when a field is missing — evolve this one.
//
// THE INVARIANTS (ADR-0322 §2, restated where the types live):
//   • A `ConsequencePlanner` MUST NOT mutate authoritative state. Plans are
//     computed over read-only views; a planner that writes is a defect, not a
//     shortcut (G-REASON-01 preview purity is the gate that proves it).
//   • The executor CONSUMES the plan — it may not recompute consequences
//     under different rules (plan/execution divergence is the named
//     certification-failure class, G-REASON-03).
//   • The `ConsequenceReport` is produced from the actual execution record
//     PLUS the original plan — never from a second inference pass (R5).
//   • `untouched` appears NOWHERE below, deliberately: it is DERIVED at
//     report time as `scope − changed − excluded − undetermined` and never
//     persisted (ADR-0322 §6). The plan carries `excluded`
//     (considered-and-determined-unchanged) — a positive determination, which
//     is a different thing from "not visited".
//
// The implementation seed this generalises is
// `packages/geometry-wall/src/WallOccupancyStore.ts#planOpeningRefit`
// (STR-06 §3): input → deterministic consequence calculation → typed plan
// (relocations + refusals, both carrying their numbers) → the CALLER decides.
// `ConsequenceRefusal` below is `OpeningRefusal` generalised;
// `ImpactDetermination` is the `SemanticReadRefusal` idiom
// (SpeculativeEngine, §FIX-SPEC-SEMANTIC-DEAD-GUARD) promoted to the
// contract: "I found nothing" and "I could not look" are never the same
// value (ADR-0322 §5 — known + unknown = [] is forbidden by construction).

/** Stable element identifier, as carried in the stores (`wall-…`, ULIDs, …). */
export type ElementId = string;

/** A set of element ids whose DETERMINATION STATUS is not in question. */
export type ElementSet = readonly ElementId[];

// ─── UNDETERMINED — the load-bearing member (ADR-0322 §5) ────────────────────

/**
 * WHY an impact cell could not be computed — **the C78 §8.1 consolidated
 * union, CLOSED at eleven members.** Adding a member is a contract edit
 * (C78 §8.1); per-family specificity that does not fit here travels in the
 * typed {@link UndeterminedSubReason} beside it (C78 §8.3), NEVER in prose
 * `detail` and NEVER as a new flat member.
 *
 * The original four (ADR-0322 §5) keep their exact spellings — every
 * existing producer keeps compiling and keeps meaning what it meant:
 *
 * `NO_DEPENDENCY_INDEX`     — the substrate that would answer this question
 *                             (dependency wiring, `joinedTo`, …) has not
 *                             landed yet (roadmap phase named in `detail`).
 * `ENGINE_NOT_AVAILABLE`    — the engine that computes this branch exists but
 *                             is not reachable in this runtime (not composed,
 *                             not installed, boot order).
 * `UNSUPPORTED_ELEMENT_TYPE`— no planner family has a rule for this element
 *                             kind / verb (C78 §8.2: this member must acquire
 *                             producers — it had zero at Phase 0).
 * `STALE_DERIVED_STATE`     — the derived state this branch reads is known to
 *                             be out of date with authoritative state, so an
 *                             answer would be a guess. **Narrowed by C78 §8.2:
 *                             it stops being the default sink** — the seven
 *                             room-prediction refusals that used to collapse
 *                             into it now classify under
 *                             `GEOMETRY_UNPREDICTABLE` / `RELATIONSHIP_NOT_RECORDED`
 *                             with a typed sub-reason.
 *
 * The seven added by C78 §8.1 (one promoted, six minted):
 *
 * `INVALID_REQUEST`         — the CALLER's payload is malformed or fails its
 *                             schema. The first member that describes the
 *                             request rather than the system's capability
 *                             (closes 0C OPEN QUESTION 1; preview causes
 *                             N2/N3).
 * `GEOMETRY_UNPREDICTABLE`  — the prediction is geometrically impossible or
 *                             out of scope for the predictor (curved wall,
 *                             open loop, self-intersection, collapse,
 *                             degenerate boundary — the sub-reason says
 *                             which).
 * `TOPOLOGY_CHANGE_POSSIBLE`— the operation may SPLIT or MERGE the dependent;
 *                             only re-detection — itself a mutation — could
 *                             resolve it. Promoted verbatim from
 *                             room-topology's `RoomPredictionRefusal`: it is a
 *                             determinate statement about topology, not an
 *                             index gap (C78 §8.2).
 * `RELATIONSHIP_NOT_RECORDED` — the relationship is known to exist as a
 *                             concept but no producer writes it, so nothing
 *                             can be traversed (`contains`, `partOf`,
 *                             `boundingWallIds: []`).
 * `RELATIONSHIP_NOT_READABLE` — the edge is written but has no typed reader /
 *                             no reverse index in the direction the query
 *                             needs (C78 §4.2–§4.3; `hostedBy`, `sitsOn`).
 * `AGGREGATE_SCOPE_UNSUPPORTED` — the dependency is level-global or
 *                             aggregate; no per-element edge can express it
 *                             (C78 §5.5, the five level-global constraint
 *                             families).
 * `PLANNER_THREW`           — the planner raised; the failure is caught and
 *                             REPORTED rather than swallowed (preview cause
 *                             N5 — the overlay's silent catch, C78 §0.e).
 */
export type UndeterminedReason =
  | 'NO_DEPENDENCY_INDEX'
  | 'ENGINE_NOT_AVAILABLE'
  | 'UNSUPPORTED_ELEMENT_TYPE'
  | 'STALE_DERIVED_STATE'
  | 'INVALID_REQUEST'
  | 'GEOMETRY_UNPREDICTABLE'
  | 'TOPOLOGY_CHANGE_POSSIBLE'
  | 'RELATIONSHIP_NOT_RECORDED'
  | 'RELATIONSHIP_NOT_READABLE'
  | 'AGGREGATE_SCOPE_UNSUPPORTED'
  | 'PLANNER_THREW';

// ─── Sub-reasons — per-family specificity, TYPED (C78 §8.3) ──────────────────
//
// The rule these types implement: the flat union above does NOT grow to hold
// per-family precision, and `detail` does not carry it as parseable prose
// (`WallMoveConsequencePlanner.ts:293`'s `${p.reason}: ${p.detail}` is the
// named defect — C78 §22.f). A family's own closed refusal union survives as
// a SUB-REASON beside the C78 member, so `COLLAPSED` and "a cache is stale"
// can never print the same value again.
//
// Each sub-reason belongs to EXACTLY ONE parent member —
// {@link UNDETERMINED_SUB_REASON_PARENT} is the single, exhaustive, reviewable
// statement of that ownership (a `Record` over the closed union: a sub-reason
// missing a parent, or spelled twice, is a compile error).
//
// SPELLING NOTE (decided here, flagged for the contract owner): sub-reasons
// promoted from an existing per-family union keep that union's exact
// spelling (SCREAMING_SNAKE for room-topology's `RoomPredictionRefusal`), so
// the L2→L1 bridge is identity and grep finds one name across both layers.
// Sub-reasons MINTED here for the preview entry point use the kebab spellings
// C78's Phase 3 brief assigned them (`no-normalizer-for-verb`,
// `no-planner-registered`). The mixed convention is deliberate: renaming the
// promoted members would break the one property that makes the bridge
// trivially auditable.

/**
 * Room-prediction sub-reasons — the seven `RoomPredictionRefusal` members
 * that used to collapse into `STALE_DERIVED_STATE` through one ternary
 * (C78 §8.2's seven ⚠ room-topology rows). Spelled EXACTLY as
 * `packages/room-topology/src/predictRoomGeometry.ts:110–128` spells them
 * (identity bridge; command-bus at L1 may not import room-topology at L2,
 * so the literals are restated here and pinned by test).
 *
 * The eighth member, `TOPOLOGY_CHANGE_POSSIBLE`, is NOT here — it is
 * promoted to a full {@link UndeterminedReason} member (C78 §8.1 #7).
 */
export type RoomPredictionSubReason =
  /** → `RELATIONSHIP_NOT_RECORDED` — the room declares no wall linkage at all. */
  | 'NO_WALL_LINKAGE'
  /** → `RELATIONSHIP_NOT_RECORDED` — a declared bounding wall is absent from the wall set. */
  | 'MISSING_BOUNDING_WALL'
  /** → `GEOMETRY_UNPREDICTABLE` — a bounding wall is curved; arc prediction out of scope. */
  | 'CURVED_WALL_UNSUPPORTED'
  /** → `GEOMETRY_UNPREDICTABLE` — fewer than 3 usable segments; nothing that could be a ring. */
  | 'DEGENERATE_BOUNDARY'
  /** → `GEOMETRY_UNPREDICTABLE` — the traced chain does not close. */
  | 'OPEN_LOOP'
  /** → `GEOMETRY_UNPREDICTABLE` — the predicted ring self-intersects. */
  | 'SELF_INTERSECTING'
  /** → `GEOMETRY_UNPREDICTABLE` — the predicted ring has (near-)zero area. */
  | 'COLLAPSED';

/**
 * Preview-entry sub-reasons — the typed identity of the `null` causes the
 * preview entry point used to collapse (C78 §0.e / 0C §6; the four-cause
 * `null` this vocabulary retires via {@link PreviewOutcome}).
 */
export type PreviewEntrySubReason =
  /** → `UNSUPPORTED_ELEMENT_TYPE` — N1: no verb normalizer recognises this command type. */
  | 'no-normalizer-for-verb'
  /** → `ENGINE_NOT_AVAILABLE` — N4: the planner exists but is not composed in this runtime. */
  | 'no-planner-registered';

/**
 * Relationship-recording sub-reasons. `element-unknown-to-joinedTo-writer`
 * is core-app-model's `'wall-unknown-to-joinedTo-writer'` with the family
 * name removed, per C78 §8.2's explicit instruction ("must lose the family
 * name" — it was the only reason value in the estate naming a wall in its
 * identifier).
 */
export type RelationshipSubReason = 'element-unknown-to-joinedTo-writer';

/**
 * Every typed sub-reason a producer may attach beside an
 * {@link UndeterminedReason}. Closed, like the parent union — a new
 * per-family refusal union joining the consequence path adds its members
 * here AND to {@link UNDETERMINED_SUB_REASON_PARENT} in the same commit
 * (the `Record` makes forgetting the second half a compile error).
 */
export type UndeterminedSubReason =
  | RoomPredictionSubReason
  | PreviewEntrySubReason
  | RelationshipSubReason;

/**
 * The single, exhaustive statement of which parent member each sub-reason
 * belongs to — C78 §8.3's "every sub-reason maps to exactly one parent",
 * enforced by construction: `Record` over the closed key union means a
 * missing or duplicate key cannot compile, and the value type confines
 * parents to the closed §8.1 union.
 */
export const UNDETERMINED_SUB_REASON_PARENT: Readonly<
  Record<UndeterminedSubReason, UndeterminedReason>
> = {
  // Room prediction (C78 §8.2, the seven ⚠ rows)
  NO_WALL_LINKAGE: 'RELATIONSHIP_NOT_RECORDED',
  MISSING_BOUNDING_WALL: 'RELATIONSHIP_NOT_RECORDED',
  CURVED_WALL_UNSUPPORTED: 'GEOMETRY_UNPREDICTABLE',
  DEGENERATE_BOUNDARY: 'GEOMETRY_UNPREDICTABLE',
  OPEN_LOOP: 'GEOMETRY_UNPREDICTABLE',
  SELF_INTERSECTING: 'GEOMETRY_UNPREDICTABLE',
  COLLAPSED: 'GEOMETRY_UNPREDICTABLE',
  // Preview entry point (the retired null's four causes — §0.e)
  'no-normalizer-for-verb': 'UNSUPPORTED_ELEMENT_TYPE',
  'no-planner-registered': 'ENGINE_NOT_AVAILABLE',
  // joinedTo writer (C78 §8.2 — family name removed)
  'element-unknown-to-joinedTo-writer': 'RELATIONSHIP_NOT_RECORDED',
} as const;

/**
 * Room-topology's `RoomPredictionRefusal`, restated as literals at L1 (the
 * layer rule forbids the import; the spelling identity is pinned by test).
 * Input type of {@link classifyRoomPredictionRefusal}.
 */
export type RoomPredictionRefusalLiteral =
  | RoomPredictionSubReason
  | 'TOPOLOGY_CHANGE_POSSIBLE';

/** A C78 §8 classification: the union member plus its optional typed sub-reason. */
export interface UndeterminedClassification {
  readonly reason: UndeterminedReason;
  readonly subReason?: UndeterminedSubReason;
}

/**
 * The typed cross-channel bridge (C78 §8.5) for room-topology's
 * `RoomPredictionRefusal` — the explicit, exhaustive, reviewable function
 * that replaces the lossy ternary at `WallMoveConsequencePlanner.ts:292`.
 * Deliberately DEFAULT-FREE: an unknown value cannot funnel into a sink
 * member (`default:` funnelling is the §8.2 ternary defect rebuilt), and a
 * ninth `RoomPredictionRefusal` member fails compilation here until it is
 * classified.
 */
export function classifyRoomPredictionRefusal(
  refusal: RoomPredictionRefusalLiteral,
): UndeterminedClassification {
  switch (refusal) {
    case 'TOPOLOGY_CHANGE_POSSIBLE':
      // Promoted to a full member — a determinate statement about topology,
      // not an index gap (C78 §8.2). No sub-reason: the member IS the fact.
      return { reason: 'TOPOLOGY_CHANGE_POSSIBLE' };
    case 'NO_WALL_LINKAGE':
    case 'MISSING_BOUNDING_WALL':
    case 'CURVED_WALL_UNSUPPORTED':
    case 'DEGENERATE_BOUNDARY':
    case 'OPEN_LOOP':
    case 'SELF_INTERSECTING':
    case 'COLLAPSED':
      return { reason: UNDETERMINED_SUB_REASON_PARENT[refusal], subReason: refusal };
    default: {
      const exhausted: never = refusal;
      return exhausted;
    }
  }
}

/**
 * One impact question the planner could NOT answer — first-class, never
 * silently empty (ADR-0322 §5). Also the `undetermined` arm of
 * {@link ImpactDetermination}, minus the discriminant.
 */
export interface UndeterminedImpact {
  /**
   * WHAT question went unanswered — a human-readable scope such as
   * `'regeneration of rooms adjacent to wall-42'` or `'junction refit'`.
   * Named so a confirmation card can render "impact partially undetermined:
   * <scope>" without consulting the planner again.
   */
  readonly scope: string;
  readonly reason: UndeterminedReason;
  /**
   * C78 §8.3 — the TYPED per-family specificity beside the union member.
   * When a per-family refusal union produced this item (room prediction,
   * the preview entry point, the joinedTo writer), its precise member rides
   * here, typed — never as parseable prose inside {@link detail}. Absent
   * when the parent member is the whole story. Where present it MUST be one
   * of the parent's own sub-reasons per
   * {@link UNDETERMINED_SUB_REASON_PARENT}.
   */
  readonly subReason?: UndeterminedSubReason;
  /**
   * Optional elaboration — the missing substrate, the throwing engine, ….
   * FREE TEXT FOR HUMANS ONLY (C78 §8.3): no consumer may branch on it, and
   * no producer may encode a reason or sub-reason in it that has a typed
   * home above.
   */
  readonly detail?: string;
}

/**
 * The answer to ONE impact question: either a determined element set, or a
 * typed declaration that the question could not be answered.
 *
 * THE RULE THIS TYPE ENFORCES (ADR-0322 §5): where determination status is
 * the question, no API returns a bare array. `[]` means "determined: nothing
 * is implicated" and can ONLY be said via the `determined` arm; a planner
 * that could not look says so via the `undetermined` arm. Known + unknown =
 * empty — the session's signature defect — is unrepresentable here.
 */
export type ImpactDetermination =
  | {
      readonly kind: 'determined';
      /** May be empty — and an empty DETERMINED set is a real answer. */
      readonly elements: ElementSet;
    }
  | ({ readonly kind: 'undetermined' } & UndeterminedImpact);

// ─── Refusals (planOpeningRefit's OpeningRefusal, generalised) ───────────────

/**
 * One element (or aspect) for which the planner determined the command must
 * NOT proceed as asked — the generalisation of `OpeningRefusal`
 * (WallOccupancyStore §FIX-WALL-SHRINK-REFIT): refusal is a first-class
 * planned outcome, not an exception, and the `reason` sentence carries the
 * NUMBERS (required vs available), never a generic failure string.
 */
export interface ConsequenceRefusal {
  /** Absent when the refusal is about the command as a whole. */
  readonly elementId?: ElementId;
  /** Human-readable sentence NAMING the quantities that collide. */
  readonly reason: string;
}

/** The refusal side of a plan, as named by the R1 plan ("RefusalSet"). */
export type RefusalSet = readonly ConsequenceRefusal[];

// ─── Plan sections ───────────────────────────────────────────────────────────

/** Reference to the command a plan was computed FOR. */
export interface ConsequenceCommandRef {
  /** Canonical command type, e.g. `'wall.move'`. */
  readonly type: string;
  /** The payload the plan was computed against (the approval binds to it). */
  readonly payload: unknown;
}

/** Topology consequences — rooms/junctions/edges appearing or going away. */
export interface TopologyDelta {
  readonly added: ElementSet;
  readonly removed: ElementSet;
  readonly modified: ElementSet;
}

/** One constraint-violation reference, in the compliance registry's terms. */
export interface ViolationRef {
  readonly ruleId: string;
  readonly elementId?: ElementId;
  readonly message?: string;
}

/**
 * Validation consequences — the before/after violation DIFF, the vocabulary
 * SpeculativeEngine's clone-and-validate core already computes
 * (`newViolations` / `resolvedViolations`) and R2's violations branch will
 * mine (see the disposition header in
 * `packages/speculative-engine/src/SpeculativeEngine.ts`).
 */
export interface ValidationDelta {
  readonly violationsCreated: readonly ViolationRef[];
  readonly violationsResolved: readonly ViolationRef[];
}

/**
 * Regeneration consequences. `skipped` is regeneration that WOULD be implied
 * but is deliberately not performed — every skip carries its reason
 * (ADR-0322 §1: "regeneration required/skipped-with-reason").
 */
export interface RegenerationPlan {
  readonly required: ElementSet;
  readonly skipped: readonly { readonly id: ElementId; readonly reason: string }[];
}

// ─── Metric transitions (R5; the typed home Phase 6b was blocked on) ─────────

/**
 * WHICH quantity a {@link MetricTransition} is about. A CLOSED union rather than
 * a free string: every member below is one a planner in this repo can actually
 * compute today (`predictRoomGeometry` produces area/perimeter/volume and the
 * ring's AABB; opening refit produces offsets/widths). Enumerating honestly is
 * the point — a metric nobody can compute has no business being nameable, and
 * an open `string` would let two planners spell the same quantity two ways and
 * make the report's before→after lines un-comparable across surfaces.
 *
 * ADDING ONE IS A CONTRACT EDIT, deliberately: the moment a planner computes a
 * new quantity, this union grows in the same commit, and every renderer keeps
 * its exhaustive switch. That is cheaper than the alternative failure — a
 * report that says `"height"` in one place and `"wallHeight"` in another.
 */
export type MetricName =
  | 'area'
  | 'perimeter'
  | 'volume'
  | 'height'
  | 'width'
  | 'length'
  | 'thickness'
  | 'offset'
  | 'count';

/**
 * The UNIT `before`/`after` are expressed in. Closed for the same reason as
 * {@link MetricName}, and SI-only: the repository's authoritative geometry is
 * metres throughout (C73 tolerance policy), so a plan that carried feet would
 * be a conversion bug waiting to be rendered. `'count'` is the dimensionless
 * unit for cardinalities (e.g. openings on a wall).
 */
export type MetricUnit = 'm' | 'm2' | 'm3' | 'count';

// ─── Predicted geometry (SAFE MODE ROOM RESHAPE; the STEP-0 contract fix) ────
//
// ⚠ WHY THIS FIELD EXISTS — the measured defect it closes.
//
// Until this field landed, the ONLY room quantity that entered the hashed plan
// body was `metrics[].after` — a SCALAR area. The predicted POLYGON was computed
// by the planner (`predictRoomGeometry`), rendered in the preview, folded into the
// violations after-clone … and then DROPPED before hashing. The experiment in
// `apps/editor/__tests__/step0PlanHashPolygonCoverage.test.ts` proves the
// consequence: two plans whose predicted room rings differ by an equal-area shear
// hashed IDENTICALLY (`0c7f0283` both sides).
//
// That made the R6 approval binding hollow for exactly the thing SAFE MODE ROOM
// RESHAPE is about to COMMIT. A user could approve `Kitchen: 16 m² → 12 m²` seeing
// one shape, the world could shift so the prediction became a different 12 m² shape,
// `planHash` would still match, `ConsequenceExecutionService` would BIND the stale
// plan, and the command would write a polygon the human never saw. `APPROVAL_STALE`
// could not fire because nothing it hashes had moved.
//
// The rule this restores (ADR-0322 §10): the hash covers EVERYTHING THE PLAN
// PROMISES. A predicted value that execution will commit is a promise. It is
// carried here rather than smuggled into `metrics` because a polygon is not a
// scalar transition — the R5 header's own lesson about `regeneration.skipped`
// carrying areas is that a value riding in a field that means something else is
// the defect, not the fix.

/** One vertex of a predicted ring, world XZ metres (the room-topology `RoomVertex` shape). */
export interface PredictedVertex {
  readonly x: number;
  readonly z: number;
}

/**
 * The PREDICTED geometry of ONE element, as the planner computed it and as the
 * executor is expected to COMMIT it verbatim.
 *
 * THE CONTRACT ON THIS OBJECT: an executor consuming it WRITES WHAT IT WAS GIVEN
 * and never recomputes. That is what makes preview and execution the same
 * algorithm — the singular defect SAFE MODE ROOM RESHAPE closes. A second
 * detection pass silently replacing these numbers at execute time is a
 * plan-fidelity divergence by construction, and `check-room-reshape-fidelity`
 * is the gate that proves it did not happen.
 *
 * Only elements with a DETERMINED prediction appear. An element the planner could
 * not predict is absent HERE and present in {@link ConsequencePlan.undetermined} —
 * the §5 rule applied to geometry: "could not predict" must never render as an
 * empty polygon, and must never be converted into "nothing changed".
 */
export interface PredictedGeometry {
  readonly elementId: ElementId;
  /** The predicted ring, in the planner's traced order. Committed VERBATIM. */
  readonly polygon: readonly PredictedVertex[];
  readonly area: number;
  readonly perimeter: number;
  readonly centroid: PredictedVertex;
  readonly boundingBox: {
    readonly minX: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxZ: number;
  };
}

/**
 * ONE quantity on ONE element, BEFORE → AFTER — the founder's
 * `Kitchen area: 12.4 m² → 10.8 m²` line, as a typed value rather than a
 * sentence.
 *
 * WHY THIS EXISTS AS A FIELD AND NOT A FORMATTED STRING (the defect it
 * retires): Phase 6b computed a real predicted area transition and had no typed
 * home for it, so it rode in `regeneration.skipped[].reason` — a field whose
 * NAME says "regeneration we deliberately did not perform". A consumer counting
 * skipped regenerations would have counted room areas; a consumer reading a
 * metric would have had to parse a sentence. Both are the same class of defect:
 * a value carried in a field that means something else.
 *
 * ON THE PLAN these are PREDICTED values (`after` is what the planner computes
 * the move WOULD produce). ON THE REPORT they are ACTUAL values, measured by
 * the same independent read-back that produces `actual` — see
 * {@link ConsequenceReport.metrics}. Same shape, two readings, never mixed:
 * the report carries the plan whole, so predicted-vs-actual on a metric is
 * `report.plan.metrics` against `report.metrics`.
 *
 * `before` may be `undefined` — and that is a DETERMINED absence with a precise
 * meaning: the prior value is not recorded on the element (a room whose
 * `computed.area` was never stamped). It is NOT "we could not look"; a planner
 * that could not compute the transition at all omits the entry and declares an
 * {@link UndeterminedImpact} instead (§5).
 */
export interface MetricTransition {
  readonly elementId: ElementId;
  readonly metric: MetricName;
  /** The value BEFORE, or `undefined` when no prior value is recorded. */
  readonly before: number | undefined;
  readonly after: number;
  readonly unit: MetricUnit;
}

// ─── ConsequencePlan (ADR-0322 §1) ───────────────────────────────────────────

/**
 * The one authoritative "what WILL this command do" object — computed by a
 * {@link ConsequencePlanner} BEFORE mutation, consumed by the executor,
 * compared against reality by the {@link ConsequenceReport}. Preview,
 * confirmation, certification and AI all read THIS shape; no surface gets a
 * private representation (ADR-0322 §1 — the singularity may not evolve away).
 */
export interface ConsequencePlan {
  /** Unique id for this plan instance — what an approval names (ADR-0322 §10). */
  readonly planId: string;
  /**
   * Content hash of the plan. Approval binds to `planId` + `planHash` +
   * `stateHash` TOGETHER; execution verifies both, and staleness invalidates
   * the approval and forces re-plan (ADR-0322 §10, G-REASON-05).
   */
  readonly planHash: string;
  /** Hash of the authoritative state the plan was computed over. */
  readonly stateHash: string;
  /** The command this plan answers for. */
  readonly command: ConsequenceCommandRef;

  /** Elements the command names directly (the payload's own subjects). */
  readonly direct: ImpactDetermination;
  /** Elements reached through dependencies/topology, NOT named by the payload. */
  readonly indirect: ImpactDetermination;

  /** Elements the plan predicts WILL change. */
  readonly changed: ElementSet;
  /**
   * Elements CONSIDERED and DETERMINED unchanged — a positive verdict, which
   * is why this is `excluded` and deliberately NOT `untouched`: `untouched`
   * is the derived remainder (`scope − changed − excluded − undetermined`),
   * computed at REPORT time and never persisted (ADR-0322 §6).
   */
  readonly excluded: ElementSet;

  readonly topology: TopologyDelta;
  readonly validation: ValidationDelta;
  readonly regeneration: RegenerationPlan;

  /**
   * R5 (additive) — per-element PREDICTED metric transitions, the typed home for
   * `Kitchen area: 12.4 m² → 10.8 m²`. Optional so R1-era plans and planners
   * that compute no metric stay valid; ABSENT and EMPTY mean the same thing here
   * on purpose, and neither is a claim about undetermined branches — a planner
   * that could not compute a transition declares it in {@link undetermined}, so
   * this array is never load-bearing for the known-vs-unknown distinction.
   * Ordered deterministically by the planner (G-REASON-02 hashes it).
   */
  readonly metrics?: readonly MetricTransition[];

  /**
   * SAFE MODE ROOM RESHAPE (additive) — the PREDICTED geometry the executor will
   * commit VERBATIM. See {@link PredictedGeometry} for why this is a field of its
   * own and not a `metrics` entry, and for the hash-coverage defect it closes.
   *
   * MUST be included in the plan-hash body by every planner that emits it —
   * otherwise an approval survives a change to the very geometry it approved
   * (STEP-0 experiment, `step0PlanHashPolygonCoverage.test.ts`).
   *
   * ABSENT and EMPTY mean the same thing here (as with `metrics`) and neither is a
   * claim about undetermined branches: a room whose geometry could not be predicted
   * is declared in {@link undetermined}, never represented as a missing entry
   * meaning "unchanged". Ordered deterministically by the planner.
   */
  readonly predictedGeometry?: readonly PredictedGeometry[];

  /** What the planner determined must be refused, with the numbers. */
  readonly refused: RefusalSet;
  /**
   * Every impact question this plan could NOT answer. Honest blind spots,
   * declared from day one (BIM30 plan R2) — a consumer rendering this plan
   * MUST surface these; an empty array is a claim that every branch ran.
   */
  readonly undetermined: readonly UndeterminedImpact[];
}

// ─── PreviewOutcome — the typed determination that retires preview's `null` ──
//
// C78 §8.8 / U-INV-2: no consequence path returns `null` to mean "I could not
// determine". `ConsequencePreviewService.preview()` today returns a bare
// `null` for FOUR structurally different causes, two of them semantic
// opposites (0C §6.1, N1–N4), and its declared contract describes only one of
// them. This union is the L1 shape the preview entry point (and `planNow`,
// which re-implements the same collapse) will return instead — the follow-up
// lane rewires the services; L1 provides what they consume.
//
// The four `null` causes, each with its C78 §8.2 classification and a named
// constructor below:
//   N1  unrecognised verb      → UNSUPPORTED_ELEMENT_TYPE + 'no-normalizer-for-verb'
//                                ({@link previewUnrecognisedVerb})
//   N2/N3 malformed payload    → INVALID_REQUEST ({@link previewInvalidRequest})
//   N4  planner not composed   → ENGINE_NOT_AVAILABLE + 'no-planner-registered'
//                                ({@link previewPlannerNotComposed})
//   N5  planner threw          → PLANNER_THREW ({@link previewPlannerThrew});
//                                today swallowed by the overlay's catch and
//                                indistinguishable from all four others.
//
// N1 and N4 are OPPOSITES — "no such family" vs "the family exists, unwired"
// — and they were the same value. Here they are distinct by construction.

/**
 * The outcome of asking for a consequence preview: either a plan, or a typed
 * statement of WHY no plan could be produced. There is no third arm and no
 * `null` (C78 §1.1's two legal outcomes, applied to the entry point).
 */
export type PreviewOutcome<TPlan extends ConsequencePlan = ConsequencePlan> =
  | {
      readonly kind: 'planned';
      readonly plan: TPlan;
    }
  | {
      readonly kind: 'undetermined';
      readonly reason: UndeterminedReason;
      /** Typed per-family specificity (C78 §8.3) — see {@link UndeterminedImpact.subReason}. */
      readonly subReason?: UndeterminedSubReason;
      /** Human-readable elaboration. Never branched on; never carries a typed fact. */
      readonly detail: string;
    };

/** The `planned` arm, from a computed plan. */
export function plannedOutcome<TPlan extends ConsequencePlan>(
  plan: TPlan,
): PreviewOutcome<TPlan> {
  return { kind: 'planned', plan };
}

/**
 * The general `undetermined` arm. Prefer the four NAMED constructors below
 * for the retired `null` causes — they pin the C78 §8.2 classification so a
 * call site cannot re-collapse the causes.
 */
export function undeterminedOutcome(
  reason: UndeterminedReason,
  detail: string,
  subReason?: UndeterminedSubReason,
): PreviewOutcome<never> {
  return subReason !== undefined
    ? { kind: 'undetermined', reason, subReason, detail }
    : { kind: 'undetermined', reason, detail };
}

/** N1 — no verb normalizer recognises this command type: no planner FAMILY exists for it. */
export function previewUnrecognisedVerb(commandType: string): PreviewOutcome<never> {
  return {
    kind: 'undetermined',
    reason: 'UNSUPPORTED_ELEMENT_TYPE',
    subReason: 'no-normalizer-for-verb',
    detail: `no verb normalizer recognises '${commandType}'; no planner family answers for it`,
  };
}

/** N2/N3 — the CALLER's payload is malformed; `detail` names what failed, verbatim. */
export function previewInvalidRequest(
  commandType: string,
  problem: string,
): PreviewOutcome<never> {
  return {
    kind: 'undetermined',
    reason: 'INVALID_REQUEST',
    detail: `payload for '${commandType}' is malformed: ${problem}`,
  };
}

/** N4 — the planner family exists but is not composed in this runtime. */
export function previewPlannerNotComposed(commandType: string): PreviewOutcome<never> {
  return {
    kind: 'undetermined',
    reason: 'ENGINE_NOT_AVAILABLE',
    subReason: 'no-planner-registered',
    detail: `a planner family recognises '${commandType}' but none is registered in this runtime`,
  };
}

/** N5 — the planner raised; the failure is REPORTED, never swallowed into silence. */
export function previewPlannerThrew(
  commandType: string,
  error: unknown,
): PreviewOutcome<never> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    kind: 'undetermined',
    reason: 'PLANNER_THREW',
    detail: `planner for '${commandType}' threw: ${message}`,
  };
}

// ─── ConsequenceReport (ADR-0322 §2; R5) ─────────────────────────────────────

/**
 * Predicted-vs-actual, categorised — the heart of G-REASON-03. "Preview said
 * A/B/C, execution did A/B/D" is a NAMED certification-failure class, and
 * this is the object it is read from.
 */
export interface PredictedVsActual {
  /** Actually changed but NOT in `plan.changed` — plan-fidelity divergence. */
  readonly unexpected: ElementSet;
  /** Predicted in `plan.changed` but did NOT change. */
  readonly missing: ElementSet;
  /**
   * Was declared undetermined in the plan and turned out to change — the
   * blind spot made concrete. NOT a divergence (the plan was honest about
   * not knowing), but reported so blind spots are visible shrinking targets.
   */
  readonly undeterminedResolved: ElementSet;
}

/**
 * What ACTUALLY happened, in the plan's vocabulary — measured by INDEPENDENT
 * read-back over the authoritative stores (the CA-21 discipline, BIM30 plan
 * R4), never inferred from the plan or from the handler's own claims.
 */
export interface ActualConsequences {
  readonly changed: ElementSet;
  readonly topology: TopologyDelta;
  readonly regenerated: ElementSet;
}

/**
 * R4 (BIM30 plan R4; ADR-0322 §2/§5) — the reconciliation of ONE plan item
 * that was UNDETERMINED at plan time. Such an item cannot be scored
 * right/wrong at execute — the plan was honest about not knowing — so the
 * report carries it AS undetermined-at-plan-time with what actually happened
 * beside it. This is the data that later tightens the planners; collapsing it
 * into right/wrong (or dropping it) would waste R2's honesty.
 */
export interface UndeterminedOutcome {
  /** The plan's own undetermined item, carried verbatim. */
  readonly item: UndeterminedImpact;
  /** The fixed verdict: this item is not scoreable, by construction. */
  readonly outcome: 'undetermined-at-plan-time';
  /**
   * Actual changes the plan did NOT predict — the candidates this blind spot
   * may explain. SHARED across items rather than attributed per-item: the
   * plan's undetermined items carry scopes, not element sets, so a per-item
   * attribution would itself be an invention (check-provenance-not-invented's
   * subject matter). When the substrate lands (roadmap Phase 5), items gain
   * element-grain scopes and this narrows.
   */
  readonly actualChangedOutsidePrediction: ElementSet;
}

/**
 * R4 — divergence as a FIRST-CLASS, NAMED result (STR-06 §2: plan-fidelity
 * divergence is a certification failure class BY NAME, never a log line).
 * A consumer branches on `kind`; it never re-derives the verdict from set
 * arithmetic over {@link PredictedVsActual}.
 */
export type PlanDivergenceVerdict =
  | { readonly kind: 'plan-agreed' }
  | {
      readonly kind: 'plan-fidelity-divergence';
      readonly unexpected: ElementSet;
      readonly missing: ElementSet;
    };

/**
 * The post-mutation consequence answer — produced from the ACTUAL execution
 * record plus the original plan, NEVER from a second inference pass
 * (ADR-0322 §2; BIM30 plan R5). Same vocabulary as the plan so the two are
 * comparable field-for-field.
 */
export interface ConsequenceReport {
  /** The `EventRecord.id` of the execution this report describes. */
  readonly commandId: string;
  /** The plan the executor consumed — carried whole, not summarised. */
  readonly plan: ConsequencePlan;

  /** What ACTUALLY happened, in the plan's vocabulary (independent read-back). */
  readonly actual: ActualConsequences;

  readonly predictedVsActual: PredictedVsActual;
  /** Post-mutation validation state, as a delta against pre-mutation. */
  readonly validation: ValidationDelta;
  /**
   * R4 (additive) — set when the ACTUAL validation delta could not be
   * measured (no validator reachable at execute time). Present ⇒ `validation`
   * above is the typed-empty placeholder, NOT a determined "no delta" — the
   * §5 known-vs-unknown rule applied to the report's own read-back.
   */
  readonly validationUndetermined?: UndeterminedImpact;

  /**
   * R5 (additive) — the ACTUAL per-element metric transitions, measured by the
   * SAME independent read-back that produced {@link actual}. Compare against
   * `plan.metrics` (carried whole on `plan`) for predicted-vs-actual on a
   * quantity.
   *
   * PRESENT-BUT-EMPTY vs ABSENT are DIFFERENT here, unlike on the plan, and the
   * difference is the §5 rule applied to metrics: `[]` is a determined "the
   * read-back looked and no metric moved"; ABSENT is "this runtime has no metric
   * read-back channel", which {@link metricsUndetermined} names. A report that
   * printed an absent channel as an empty list would be the known+unknown=[]
   * defect wearing a number.
   */
  readonly metrics?: readonly MetricTransition[];
  /**
   * R5 (additive) — set when the ACTUAL metrics could not be measured. Present ⇒
   * {@link metrics} is absent or a placeholder and MUST NOT be read as "nothing
   * moved". A renderer surfaces this instead of a zero.
   */
  readonly metricsUndetermined?: UndeterminedImpact;

  /**
   * SAFE MODE ROOM RESHAPE (additive) — the ACTUAL committed geometry, measured by
   * the SAME independent read-back that produced {@link actual}, NEVER copied from
   * the plan. Compare element-by-element against `plan.predictedGeometry`: a
   * committed polygon that differs from the predicted one is the geometry arm of
   * `plan-fidelity-divergence`, and is exactly the "a second detection algorithm
   * silently replaced the prediction" failure this phase exists to make impossible.
   *
   * PRESENT-BUT-EMPTY vs ABSENT differ, as on {@link metrics}: `[]` is a determined
   * "the read-back looked and found no geometry-bearing element"; ABSENT means this
   * runtime has no geometry read-back channel, which
   * {@link geometryUndetermined} names.
   */
  readonly geometry?: readonly PredictedGeometry[];
  /**
   * SAFE MODE ROOM RESHAPE (additive) — set when the ACTUAL geometry could NOT be
   * read back. Present ⇒ {@link geometry} must not be read as "the polygons match".
   * A fidelity gate seeing this reports UNPROVEN, never PASS.
   */
  readonly geometryUndetermined?: UndeterminedImpact;
  /**
   * SAFE MODE ROOM RESHAPE (additive) — elements whose COMMITTED polygon differs
   * from the plan's predicted polygon. Non-empty ⇒ {@link divergence} is
   * `plan-fidelity-divergence`. A separate list from `predictedVsActual.unexpected`
   * because these elements DID change as predicted at set grain and diverged at
   * VALUE grain — set arithmetic cannot see that, which is how a rival algorithm
   * would have slipped through.
   */
  readonly geometryDiverged?: ElementSet;

  /**
   * R4 (additive) — the named divergence verdict over `predictedVsActual`.
   * Optional during migration (R1-era reports never carried it); every report
   * the R4 executor produces sets it.
   */
  readonly divergence?: PlanDivergenceVerdict;
  /**
   * R4 (additive) — one entry per `plan.undetermined` item, in plan order
   * (the reconciliation MUST cover every plan item — G-REASON-03's clause a).
   */
  readonly undeterminedOutcomes?: readonly UndeterminedOutcome[];

  /**
   * WHO/HOW, copied from the invocation envelope (ADR-0324 §1–2). Origin and
   * approval remain SEPARATE — see {@link CommandExecutionContext}.
   */
  readonly provenance: {
    readonly actor: CommandActor;
    readonly origin?: CommandOrigin;
    readonly approval?: CommandApproval;
  };
}

// ─── R4 — execution consumes the plan (BIM30 plan R4; ADR-0322 §2/§10) ───────

/**
 * The typed refusal to BIND a stale plan (BIM30 plan R6 names the approval
 * half; R4 lands the binding check itself). A plan is consumable ONLY if its
 * `planHash` matches a re-computation by the SAME planner over the LIVE
 * pre-state at execute time. Staleness is failure of the BINDING, not of the
 * command: the command may still execute plan-less (today's behaviour,
 * preserved), but it MUST NOT claim the stale plan as its prediction — that
 * would be a fabricated prediction, the exact defect the UNDETERMINED
 * discipline exists to forbid.
 */
export interface PlanStaleRefusal {
  readonly kind: 'PLAN_STALE';
  /** The plan that failed to bind — carried as EVIDENCE, never as prediction. */
  readonly stalePlan: ConsequencePlan;
  /** The hashes the plan was minted with. */
  readonly plannedPlanHash: string;
  readonly plannedStateHash: string;
  /**
   * The hashes re-computed over the live pre-state at execute time.
   *
   * ⚠ C78 §9.3 — **a hash field may never carry a reason.** These two fields
   * hold FNV-1a hashes and NOTHING ELSE. The two measured sentinel abuses —
   * `'UNVERIFIABLE:no-planner-for-type'` (`ConsequenceExecutionService.ts:239`)
   * and `'UNPLANNABLE'` (`ConfirmationFlow.ts:269–271`) — are reasons wearing
   * a hash's clothes: a consumer comparing hashes reports `PLAN_STALE` for a
   * fact that is not staleness.
   *
   * @deprecated AS A REASON CARRIER ONLY (the fields themselves remain the
   * hash home). Their typed successor is {@link liveVerification}: when the
   * live hashes could not be computed at all, producers set
   * `liveVerification: { kind: 'unverifiable', … }` with the C78 §8.1 member
   * that names WHY (`UNSUPPORTED_ELEMENT_TYPE` / `ENGINE_NOT_AVAILABLE` per
   * §8.2's mapping for the two sentinels) and MUST NOT mint sentinel strings
   * here. The consumer files that emit the sentinels are rewired by the
   * follow-up lane; this is the field they move into.
   */
  readonly livePlanHash: string;
  readonly liveStateHash: string;
  /**
   * C78 §9.3 (additive) — the typed statement of whether the live hashes in
   * this refusal are REAL re-computations or could not be produced. Absent on
   * legacy producers (which is exactly the pre-C78 behaviour: hashes are
   * assumed real). See {@link PlanBindingVerification}.
   */
  readonly liveVerification?: PlanBindingVerification;
}

/**
 * Whether the live plan/state hashes on a {@link PlanStaleRefusal} were
 * actually re-computed — the typed home the two hash sentinels move into
 * (C78 §9.3; §0.f).
 *
 * `verified`     — the hashes are genuine FNV-1a re-computations over the live
 *                  pre-state; a mismatch really is staleness.
 * `unverifiable` — no live re-computation was POSSIBLE, and the §8.1 member
 *                  says why: `UNSUPPORTED_ELEMENT_TYPE` (no planner family for
 *                  this type — the `'UNVERIFIABLE:no-planner-for-type'` case),
 *                  `ENGINE_NOT_AVAILABLE` (family exists, not composed here —
 *                  the `'UNPLANNABLE'` case resolves to whichever of these the
 *                  live re-plan actually produced), or `PLANNER_THREW`. A
 *                  consumer seeing this arm reports the reason, NEVER
 *                  `PLAN_STALE`-by-hash-mismatch: the fact is a capability
 *                  gap, not staleness.
 */
export type PlanBindingVerification =
  | {
      readonly kind: 'verified';
    }
  | {
      readonly kind: 'unverifiable';
      readonly reason: UndeterminedReason;
      /** Typed per-family specificity (C78 §8.3), e.g. `'no-planner-registered'`. */
      readonly subReason?: UndeterminedSubReason;
      /** Human-readable elaboration. Never branched on. */
      readonly detail?: string;
    };

/**
 * The typed ABSENCE of a prediction (BIM30 plan R4; the §5 discipline applied
 * to reporting): executing without a plan yields a result whose prediction
 * side says so — never an after-the-fact "prediction" reverse-engineered from
 * what happened.
 */
export interface PredictionAbsence {
  readonly kind: 'absent';
  readonly reason: 'NO_PLAN_SUPPLIED';
}

/**
 * The one execution-side consequence answer the R4 executor returns — three
 * arms, one per binding outcome. The `reconciled` arm carries the ONE
 * authoritative {@link ConsequenceReport} (ADR-0322 §1); the other two arms
 * exist precisely so that neither staleness nor plan-less dispatch is ever
 * dressed up as a reconciled prediction.
 */
export type ExecutionConsequence =
  | {
      /** The plan bound (planHash re-verified) and was reconciled against reality. */
      readonly kind: 'reconciled';
      readonly report: ConsequenceReport;
    }
  | {
      /** A plan was supplied but refused binding — executed plan-less. */
      readonly kind: 'plan-stale';
      readonly commandId: string;
      readonly refusal: PlanStaleRefusal;
      /** Independent read-back still runs — reality is reported either way. */
      readonly actual: ActualConsequences;
    }
  | {
      /** No plan was supplied — the prediction side is the typed absence. */
      readonly kind: 'unplanned';
      readonly commandId: string;
      readonly prediction: PredictionAbsence;
      readonly actual: ActualConsequences;
    };

// ─── ConsequencePlanner (ADR-0322 §7; STR-06 §3) ─────────────────────────────

/**
 * Minimal read-only view of one store, as a planner is allowed to see it —
 * the shape SpeculativeEngine's `makeStore` snapshot contexts already use
 * (SpeculativeEngine.ts, the `beforeCtx`/`afterCtx` construction), lifted to
 * a contract WITHOUT the `window.*` coupling that file carries
 * (its TODO(TASK-08) tags). The caller materialises these views; the planner
 * never reaches for globals.
 */
export interface ReadonlyStoreView {
  getAll(): readonly unknown[];
  getById(id: ElementId): unknown | null;
}

/**
 * Everything a planner may read. DELIBERATELY minimal (R1 plan): read-only
 * store access and nothing else — no emitters, no undo stacks, no globals.
 * Grows only when a `wall.move` branch demonstrably needs a field (R2).
 */
export interface PlanningContext {
  /** Read-only view of a store by id (`'wall'`, `'room'`, …); undefined when absent. */
  getStore(storeId: string): ReadonlyStoreView | undefined;
}

/**
 * The planning idiom, generalised from `planOpeningRefit` (ADR-0322 §7):
 * input → deterministic consequence calculation → typed plan → caller
 * decides. Per-operation planners (opening-refit, junction, room-boundary,
 * regeneration, violations) are composed by an aggregate planner per golden
 * operation, starting with `wall.move` (R2). No generic ImpactEngine before
 * one golden operation closes end-to-end.
 *
 * CONTRACT: `plan()` MUST NOT mutate authoritative state, emit events, or
 * touch undo state (G-REASON-01), and MUST be deterministic — same state +
 * same command ⇒ byte-equal plan (G-REASON-02).
 */
export interface ConsequencePlanner<TCommand, TPlan extends ConsequencePlan = ConsequencePlan> {
  plan(command: TCommand, context: PlanningContext): Promise<TPlan>;
}

// ─── Confirmation policy (ADR-0322 §10; STR-06 §10–11) ───────────────────────

/** How much confirmation the plan's severity demands — computed AFTER planning. */
export type ConfirmationRequirement = 'none' | 'recommended' | 'required';

/**
 * WHY confirmation is demanded (STR-06 §10's named examples). Open union:
 * the three canonical reasons are typo-safe; planners may mint new ones
 * without a contract change (`string & {}` keeps literal completion).
 */
export type ConfirmationReason =
  | 'removes_existing_elements'
  | 'changes_hosted_elements'
  | 'impact_partially_undetermined'
  | (string & {});

/**
 * The confirmation verdict over a plan. NEVER computed from
 * `command.isDestructive`-style static flags — always from the plan's actual
 * consequence set (STR-06 §10: that shortcut reproduces the gap).
 */
export interface ConfirmationPolicy {
  readonly requirement: ConfirmationRequirement;
  readonly reasons: readonly ConfirmationReason[];
}

// ─── The invocation envelope (ADR-0324 §1–2) ─────────────────────────────────

/**
 * WHO invoked. AI provenance is metadata about the invocation, not a
 * different command path (ADR-0324 §1) — every actor kind reaches the SAME
 * `executeCommand()`.
 */
export interface CommandActor {
  readonly kind: 'human' | 'ai' | 'system' | 'remote';
  /** Stable identifier when one exists (user id, agent id, peer client id). */
  readonly id?: string;
}

/**
 * WHERE the invocation came from — the surface (toolbar, chat, keyboard,
 * marketplace, sync) and, when it originated as an AI proposal, which one.
 *
 * ⚠ SEPARATE from {@link CommandApproval} BY CONTRACT (ADR-0324 §2): origin
 * answers WHO/WHAT initiated; approval answers WHAT WAS
 * proposed-validated-approved. An AI-initiated, human-approved command reads
 * `actor.kind === 'ai'` + `approval.approvedBy === <human>`. Never merge
 * these types, and never stamp `actorId="ai"` as a substitute.
 */
export interface CommandOrigin {
  /** e.g. `'toolbar'`, `'chat'`, `'keyboard'`, `'sync'`, `'batch'`. */
  readonly surface: string;
  /** The proposal this invocation executes, when it started as one. */
  readonly proposalId?: string;
}

/**
 * WHAT was proposed, validated and approved — the approval half of
 * ADR-0324 §2. In R6 this binds to `planId`/`planHash`/`stateHash`
 * (G-REASON-05); in R1 it is carried, unverified.
 */
export interface CommandApproval {
  readonly proposalId: string;
  /** Who granted the approval (a HUMAN id for AI-initiated commands). */
  readonly approvedBy: string;
  readonly rationale?: string;
  /** Proposer's own confidence, when the proposing surface reports one. */
  readonly confidence?: number;
}

/**
 * The optional invocation envelope riding on `executeCommand()` beside the
 * existing `gestureId` (ADR-0324 §1 — one funnel, enriched, never forked).
 *
 * R1 STATUS: carried onto the `EventRecord` verbatim and otherwise UNUSED —
 * no bus branch reads it, absence changes nothing. Authorization policy MAY
 * read it later; geometric, dependency, validation, consequence-planning and
 * mutation semantics MUST NOT (ADR-0324 §3, gated by G-REASON-04 parity via
 * `normalizeForParity` in ./parity.ts).
 */
export interface CommandExecutionContext {
  readonly actor: CommandActor;
  readonly origin?: CommandOrigin;
  readonly approval?: CommandApproval;
}
