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
 * WHY an impact cell could not be computed. The four reasons are fixed by
 * ADR-0322 §5 — a planner that cannot compute a branch names which of these
 * holds; it never returns `[]` for a question it did not answer.
 *
 * `NO_DEPENDENCY_INDEX`     — the substrate that would answer this question
 *                             (dependency wiring, `joinedTo`, …) has not
 *                             landed yet (roadmap phase named in `detail`).
 * `ENGINE_NOT_AVAILABLE`    — the engine that computes this branch exists but
 *                             is not reachable in this runtime (not composed,
 *                             not installed, boot order).
 * `UNSUPPORTED_ELEMENT_TYPE`— the planner has no rule for this element kind.
 * `STALE_DERIVED_STATE`     — the derived state this branch reads is known to
 *                             be out of date with authoritative state, so an
 *                             answer would be a guess.
 */
export type UndeterminedReason =
  | 'NO_DEPENDENCY_INDEX'
  | 'ENGINE_NOT_AVAILABLE'
  | 'UNSUPPORTED_ELEMENT_TYPE'
  | 'STALE_DERIVED_STATE';

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
  /** Optional elaboration — the missing substrate, the throwing engine, …. */
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

  /** What the planner determined must be refused, with the numbers. */
  readonly refused: RefusalSet;
  /**
   * Every impact question this plan could NOT answer. Honest blind spots,
   * declared from day one (BIM30 plan R2) — a consumer rendering this plan
   * MUST surface these; an empty array is a claim that every branch ran.
   */
  readonly undetermined: readonly UndeterminedImpact[];
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
  /** The hashes re-computed over the live pre-state at execute time. */
  readonly livePlanHash: string;
  readonly liveStateHash: string;
}

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
