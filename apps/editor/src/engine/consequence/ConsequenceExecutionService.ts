// ConsequenceExecutionService — R4 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md.
//
// EXECUTION CONSUMES THE PLAN (ADR-0322 §2; STR-06 §2). This is the wall.move
// execution surface for plan-carrying callers: it takes the SAME `(type, payload)`
// the bus dispatches plus an optional `ConsequencePlan` (produced by the SAME
// planner the preview used), and returns the dispatch record TOGETHER with the one
// execution-side consequence answer (`ExecutionConsequence`, consequence.ts):
//
//   plan bound      → `reconciled`  — a full ConsequenceReport: predicted vs actual
//                                     from INDEPENDENT read-back, divergence as a
//                                     first-class named verdict (G-REASON-03), and
//                                     every plan-time UNDETERMINED item carried as
//                                     `undetermined-at-plan-time` with reality beside it.
//   plan stale      → `plan-stale`  — a TYPED refusal to bind (`PLAN_STALE`): the
//                                     command still executes plan-less (today's
//                                     behaviour, preserved) but the stale plan is
//                                     carried as EVIDENCE, never claimed as prediction.
//   no plan         → `unplanned`   — the prediction side is the typed absence;
//                                     never a fabricated after-the-fact "prediction".
//
// ── THE BINDING RULE (plan doc R6 owns approval; R4 lands the hash check) ───────────
// A plan is consumable ONLY if its `planHash` matches a RE-COMPUTATION by the same
// planner over the live pre-state at execute time. The planner is contractually pure
// and deterministic (G-REASON-01/02, proven by check-preview-purity), so re-planning
// is a safe read and hash equality means "nothing the planner can see has moved".
// Anything planner-VISIBLE that moved ⇒ stale (refuse to bind); anything planner-
// BLIND that diverges ⇒ caught downstream by the reconciliation. Between them the
// two mechanisms cover the plan-fidelity failure class from both sides.
//
// ── WHY L7, AND WHY NOT INSIDE CommandBus (same reasoning as R3's preview) ──────────
// Binding verification needs the PLANNER (L7 composition of L2 collaborators) and
// read-back needs live store views; the L1 bus importing either would be the upward
// edge check-layer-boundaries exits 3 on. The bus's R4 contribution is exactly the
// R1 idiom: an additive `opts.plan` envelope, carried onto the EventRecord, read by
// nothing in the bus (CommandBus.ts). Every other verb's plan-less dispatch is
// byte-identical to pre-R4 behaviour.
//
// All heavyweight collaborators are INJECTED; every package import below is
// `import type` (erased), so this file couples nothing at import and is testable in
// a plain node env with doubles — the same discipline as the planner and preview.

import type {
  ConsequencePlan,
  ConsequencePlanner,
  ConsequenceReport,
  ExecutionConsequence,
  ActualConsequences,
  UndeterminedOutcome,
  PlanDivergenceVerdict,
  PredictedVsActual,
  ViolationRef,
  ValidationDelta,
  PlanningContext,
  CommandExecutionContext,
  EventRecord,
  ElementId,
  PredictedGeometry,
  UndeterminedImpact,
  PlanBindingVerification,
  UndeterminedSubReason,
} from '@pryzm/command-bus';
// `UNDETERMINED_SUB_REASON_PARENT` is a VALUE (the §8.3 sub-reason → parent map), so
// this import is not erased. It is the one place the parent of a sub-reason may be
// decided: hand-writing the parent here would let the two drift silently.
import { newGestureId, withGestureId, UNDETERMINED_SUB_REASON_PARENT } from '@pryzm/command-bus';
import type { WallMoveCommand } from './WallMoveConsequencePlanner.js';
import { stableStringify } from './WallMoveConsequencePlanner.js';
import { normalizeToWallMove, type PreviewCommand } from './ConsequencePreviewService.js';

// ─── Injected collaborators ──────────────────────────────────────────────────────────

/** The dispatch funnel — `CommandBus.executeCommand`, structurally (one funnel, ADR-0324 §1). */
export interface ConsequenceDispatcher {
  executeCommand<T>(
    type: string,
    payload: T,
    opts?: {
      readonly suppressUndo?: boolean;
      readonly gestureId?: string;
      readonly context?: CommandExecutionContext;
      readonly plan?: ConsequencePlan;
    },
  ): Promise<EventRecord<T>>;
}

/**
 * A snapshot of the CURRENT violation set, in the registry's terms. OPTIONAL: when
 * absent, the report's `validation` is the typed-empty placeholder and
 * `validationUndetermined` says so (consequence.ts §5 discipline) — never a silently
 * determined "no delta".
 */
export type ViolationSnapshotter = () => readonly ViolationRef[];

export interface ConsequenceExecutionDeps {
  readonly bus: ConsequenceDispatcher;
  /** Keyed by the CANONICAL semantic type (`'wall.move'`), same map shape as preview. */
  readonly planners: ReadonlyMap<string, ConsequencePlanner<WallMoveCommand>>;
  /** Materialises the read-only views over the LIVE stores at call time. */
  readonly context: () => PlanningContext;
  /**
   * Store families the independent read-back fingerprints. Defaults to the five the
   * wall.move planner reasons over — read-back must cover at least the plan's own
   * vocabulary or "unexpected" would be structurally blind.
   */
  readonly readbackStores?: readonly string[];
  /** Optional violation snapshotter for the ACTUAL validation delta. */
  readonly violations?: ViolationSnapshotter;
  /**
   * R5 — where the finished consequence answer is DELIVERED (the report surface).
   * A plain callback, so this service stays DOM-free and untestable-by-accident:
   * production passes `ConsequenceReportView.showConsequence`, the certification gate
   * and the unit suite pass a collector. Absent ⇒ the answer is still RETURNED (every
   * caller gets it) but nothing is displayed — which is the honest state before a view
   * is composed, not a silent drop.
   *
   * It receives the whole {@link ExecutionConsequence}, not just the report, because the
   * OTHER two arms are the ones that must never render as a confident blank: a sink given
   * only `reconciled` reports would leave stale/plan-less executions showing nothing at
   * all, which reads identically to "nothing changed".
   */
  readonly sink?: ConsequenceSink;

  // ── SAFE MODE ROOM RESHAPE ───────────────────────────────────────────────────
  /**
   * Commits the plan's PREDICTED room geometry, VERBATIM, as part of the bound
   * wall-move execution.
   *
   * WHY THIS IS INJECTED AND NOT CALLED DIRECTLY. This service must stay
   * constructible without it — and an ABSENT reshaper is the honest
   * `ENGINE_NOT_AVAILABLE` case (the report says the geometry was not applied),
   * NOT a silent fall-through to the observer's redetect. That distinction is the
   * whole §5 discipline applied to the reshape itself: "no reshaper composed" and
   * "nothing to reshape" must never be the same value.
   *
   * The implementation dispatches `ApplyPredictedRoomGeometryCommand`. It receives
   * the gesture id so the wall mutation and the room mutation are ONE undo unit.
   */
  readonly applyPredictedRoomGeometry?: PredictedRoomGeometryApplier;
  /**
   * Holds/releases the topology observer's AUTO-redetect for the levels the plan
   * covered, so a second detection algorithm cannot overwrite the geometry that
   * was just committed from the prediction. SCOPED to this execution and released
   * in a `finally` (C72 §4). Absent ⇒ no suppression is taken, which is safe but
   * means the observer may re-detect over the committed rings — the fidelity gate
   * would then see the divergence rather than the system hiding it.
   */
  readonly redetectSuppressor?: RedetectSuppressor;
  /**
   * Reads the CURRENT committed geometry of the named rooms, for the report's
   * INDEPENDENT read-back. Must read the authoritative store, NEVER the plan.
   * Absent ⇒ `report.geometryUndetermined`, never a silent "the polygons match".
   */
  readonly readRoomGeometry?: RoomGeometryReader;
}

/** Applies the plan's predicted room geometry. Returns what it actually wrote. */
export type PredictedRoomGeometryApplier = (
  predicted: readonly PredictedGeometry[],
  undetermined: readonly UndeterminedImpact[],
  gestureId: string,
) => { readonly applied: readonly ElementId[]; readonly levelIds: readonly string[] };

/** Scoped, reversible hold on the observer's AUTO-redetect (C72 §4). */
export interface RedetectSuppressor {
  markPlanCoveredLevels(levelIds: readonly string[]): void;
  releasePlanCoveredLevels(levelIds: readonly string[]): void;
}

/** Independent read-back of committed room geometry (never the plan's copy). */
export type RoomGeometryReader = (
  elementIds: readonly ElementId[],
) => readonly PredictedGeometry[];

/** Where a finished {@link ExecutionConsequence} is delivered for display (R5). */
export type ConsequenceSink = (consequence: ExecutionConsequence) => void;

/** Dispatch options accepted by {@link ConsequenceExecutionService.execute}. */
export interface ConsequenceExecuteOptions {
  readonly plan?: ConsequencePlan;
  readonly gestureId?: string;
  readonly context?: CommandExecutionContext;
  readonly suppressUndo?: boolean;
}

export interface ConsequenceExecutionResult<T = unknown> {
  readonly record: EventRecord<T>;
  readonly consequence: ExecutionConsequence;
}

const DEFAULT_READBACK_STORES = ['wall', 'room', 'door', 'window', 'stair'] as const;

/**
 * SAFE MODE ROOM RESHAPE — what the reshape step actually did. THREE arms, one per
 * outcome, so the report never has to infer from an empty list which one happened:
 * "nothing to apply" and "nothing composed to apply it" produce the same empty
 * `applied` array and mean completely different things (the §5 discipline).
 */
type ReshapeOutcome =
  | { readonly kind: 'applied'; readonly applied: readonly ElementId[] }
  | { readonly kind: 'nothing-to-apply'; readonly applied: readonly ElementId[] }
  | {
      readonly kind: 'no-applier';
      readonly applied: readonly ElementId[];
      readonly undetermined: UndeterminedImpact;
    };

/** Per-store fingerprint map: elementId → stable serialisation of the element. */
type Fingerprints = Map<string, Map<string, string>>;

export class ConsequenceExecutionService {
  constructor(private readonly deps: ConsequenceExecutionDeps) {}

  /**
   * Execute `command` through the ONE bus funnel, consuming `opts.plan` when it
   * binds. Always returns the dispatch record plus the typed consequence answer;
   * a dispatch failure (bus throw / canExecute refusal) propagates unchanged —
   * this service adds a consequence envelope, never a rival error path.
   */
  async execute<T>(
    command: PreviewCommand & { readonly payload: T },
    opts?: ConsequenceExecuteOptions,
  ): Promise<ConsequenceExecutionResult<T>> {
    // ── 1. Binding (only when a plan was supplied) ────────────────────────────────
    const supplied = opts?.plan;
    let bound: ConsequencePlan | undefined;
    let stale:
      | { livePlanHash: string; liveStateHash: string; verification: PlanBindingVerification }
      | undefined;

    if (supplied) {
      const semantic = normalizeToWallMove(command);
      const planner = semantic ? this.deps.planners.get(semantic.type) : undefined;
      if (semantic && planner) {
        // Re-compute over the LIVE pre-state with the SAME planner (pure, so this
        // is a read). Hash equality ⇒ nothing the planner can see has moved.
        const livePlan = await planner.plan(semantic, this.deps.context());
        if (livePlan.planHash === supplied.planHash) {
          bound = supplied;
        } else {
          stale = {
            livePlanHash: livePlan.planHash,
            liveStateHash: livePlan.stateHash,
            // The hashes ARE real re-computations, so a mismatch really is staleness.
            verification: { kind: 'verified' },
          };
        }
      } else {
        // A plan for a command this service cannot re-plan is unverifiable — an
        // unverifiable binding is REFUSED, not assumed (the §5 discipline: "could
        // not check" must never print as "checked, fine").
        //
        // ── C78 §9.3 — A HASH FIELD MAY NEVER CARRY A REASON ─────────────────────
        // This branch used to mint `'UNVERIFIABLE:no-planner-for-type'` into BOTH
        // hash fields. That is a reason wearing a hash's clothes, and it is worse
        // than ugly: every consumer here compares `plannedPlanHash !== livePlanHash`
        // and reports PLAN_STALE, so a CAPABILITY GAP (no planner for this verb) was
        // reported to the user as "the model moved under your plan" — a false
        // statement about the world, produced by a type that could hold a sentence.
        //
        // The reason now goes in `liveVerification`, its typed home (consequence.ts
        // `PlanBindingVerification`), with the C78 §8.1 member that names WHY and the
        // §8.3 sub-reason that names it per-family. The hash fields keep the ONE
        // honest thing they can say about a re-computation that never happened: the
        // planned hashes, unchanged — never a fabricated "live" value, because there
        // is no live re-computation to report.
        const subReason: UndeterminedSubReason = semantic ? 'no-planner-registered' : 'no-normalizer-for-verb';
        stale = {
          livePlanHash: supplied.planHash,
          liveStateHash: supplied.stateHash,
          verification: {
            kind: 'unverifiable',
            reason: UNDETERMINED_SUB_REASON_PARENT[subReason],
            subReason,
            detail: semantic
              ? `no planner is composed for '${semantic.type}' in this runtime, so the plan's hash could not be ` +
                're-computed over the live pre-state. This is a capability gap, NOT staleness: the model may not ' +
                'have moved at all. The hash fields carry the PLANNED hashes because no live hash exists.'
              : `no normalizer recognises command type '${command.type}', so no semantic command could be formed ` +
                'to re-plan. This is a capability gap, NOT staleness. The hash fields carry the PLANNED hashes ' +
                'because no live hash exists.',
          },
        };
      }
    }

    // ── 2. Pre-state fingerprints (the read-back baseline) ────────────────────────
    const pre = this.fingerprint();
    const violationsBefore = this.deps.violations?.();

    // ── 2b. ONE GESTURE for the wall mutation AND its room consequences ───────────
    // SAFE MODE ROOM RESHAPE / C03 §4.6 U-10. The wall move and the room reshape are
    // ONE user action ("I dragged this wall"), so they must be ONE undo unit — a
    // Ctrl+Z that reverted the wall and left the rooms reshaped would leave the model
    // internally inconsistent, which is strictly worse than either state alone.
    //
    // The id is passed EXPLICITLY to both dispatches rather than relying on the
    // ambient scope, because `executeCommand` is awaited between them: the ambient
    // gesture scope is SYNCHRONOUS BY CONTRACT (gestureScope.ts) and does not survive
    // an `await`. Honouring the caller's id when one was supplied means a tool that
    // already opened a gesture (a drag) keeps ONE id across the whole drag.
    const gestureId = opts?.gestureId ?? newGestureId('wall-move-consequence');

    // ── 3. THE dispatch — one funnel, the plan riding only when it bound ──────────
    const record = await this.deps.bus.executeCommand<T>(command.type, command.payload, {
      ...(opts?.suppressUndo !== undefined ? { suppressUndo: opts.suppressUndo } : {}),
      gestureId,
      ...(opts?.context !== undefined ? { context: opts.context } : {}),
      ...(bound !== undefined ? { plan: bound } : {}),
    });

    // ── 3b. Commit the PREDICTED room geometry, verbatim ──────────────────────────
    const reshape = this.applyReshape(bound, gestureId);

    // ── 4. Independent read-back (CA-21 discipline) ───────────────────────────────
    const actual = this.readback(pre);
    const validation = this.validationDelta(violationsBefore);

    // ── 5. The typed consequence answer ───────────────────────────────────────────
    const consequence: ExecutionConsequence = bound
      ? { kind: 'reconciled', report: this.reconcile(record, bound, actual, validation.delta, validation.undetermined, opts?.context, reshape) }
      : supplied && stale
        ? {
            kind: 'plan-stale',
            commandId: record.id,
            refusal: {
              kind: 'PLAN_STALE',
              stalePlan: supplied,
              plannedPlanHash: supplied.planHash,
              plannedStateHash: supplied.stateHash,
              livePlanHash: stale.livePlanHash,
              liveStateHash: stale.liveStateHash,
              // C78 §9.3 — the typed statement of whether those two hashes are real
              // re-computations. A consumer that reads this arm must report the
              // REASON, never PLAN_STALE-by-hash-mismatch.
              liveVerification: stale.verification,
            },
            actual,
          }
        : {
            kind: 'unplanned',
            commandId: record.id,
            prediction: { kind: 'absent', reason: 'NO_PLAN_SUPPLIED' },
            actual,
          };

    // ── 6. Deliver it to the report surface (R5) ──────────────────────────────────
    // ALL THREE ARMS go to the sink, including the two that carry no report: a display
    // that only ever hears about reconciled executions renders nothing for a stale or
    // plan-less one, and "nothing" is indistinguishable from "nothing changed". A sink
    // that throws must not corrupt the execution answer — the command already ran, and a
    // rendering failure is not a mutation failure.
    if (this.deps.sink) {
      try { this.deps.sink(consequence); }
      catch (e) { console.warn('[ConsequenceExecutionService] consequence sink threw (render failure, not a mutation failure):', e); }
    }

    return { record, consequence };
  }

  // ── SAFE MODE ROOM RESHAPE ───────────────────────────────────────────────────

  /**
   * Commit the plan's PREDICTED room geometry, verbatim, inside the wall move's
   * gesture — with the observer's AUTO-redetect held for the covered levels only,
   * and released in a `finally`.
   *
   * ORDER MATTERS AND IS NOT ARBITRARY. The suppression is taken BEFORE the apply
   * and released AFTER it, because the observer's redetect is driven by the WALL
   * commit that already happened in step 3 — it is armed on a debounce and would
   * otherwise fire between the wall write and the room write, re-detecting rooms
   * from the moved wall with a rival algorithm and then having its answer
   * overwritten (or worse, overwriting ours).
   *
   * Returns the typed outcome so the report can say which of three things
   * happened, never conflating them:
   *   • `applied`         — the geometry was written; `elements` names it.
   *   • `nothing-to-apply`— the plan carried no determined geometry (every affected
   *                         room was UNDETERMINED, or the planner emitted none).
   *   • `no-applier`      — nothing is composed to apply it. An ENGINE_NOT_AVAILABLE
   *                         case, which the report surfaces rather than hiding.
   */
  private applyReshape(
    bound: ConsequencePlan | undefined,
    gestureId: string,
  ): ReshapeOutcome {
    if (!bound) return { kind: 'nothing-to-apply', applied: [] };

    const predicted = bound.predictedGeometry ?? [];
    if (predicted.length === 0) {
      // Not a failure — and NOT a claim that no room changed. The plan's own
      // `undetermined` items (carried onto every report as `undeterminedOutcomes`)
      // are what say why, and the observer's fallback redetect is deliberately NOT
      // suppressed here, so unpredicted rooms still get refreshed by the old path.
      return { kind: 'nothing-to-apply', applied: [] };
    }

    if (!this.deps.applyPredictedRoomGeometry) {
      return {
        kind: 'no-applier',
        applied: [],
        undetermined: {
          scope: `application of predicted room geometry for ${predicted.length} room(s)`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no predicted-room-geometry applier is composed in this runtime; the plan PREDICTED these rooms ' +
            'would be reshaped and that reshape was NOT performed here. Any room geometry that changed came ' +
            'from the topology observer\'s own re-detection, which is a DIFFERENT algorithm from the preview.',
        },
      };
    }

    // Levels are held only for rooms we are ACTUALLY writing. A level whose rooms
    // all came back UNDETERMINED is never held — its fallback redetect must run.
    let levelIds: readonly string[] = [];
    let applied: readonly ElementId[] = [];
    try {
      // The apply runs INSIDE the gesture scope as well as receiving the id, so a
      // legacy `commandManager.execute` reached from the applier inherits it too
      // (gestureScope.ts case A — "executed inside this dispatch" is a fact about
      // the call stack). Synchronous by contract: no `await` inside.
      const result = withGestureId(gestureId, () =>
        this.deps.applyPredictedRoomGeometry!(predicted, bound.undetermined, gestureId));
      applied = result.applied;
      levelIds = result.levelIds;
      if (levelIds.length > 0) this.deps.redetectSuppressor?.markPlanCoveredLevels(levelIds);
    } catch (e) {
      // A reshape that threw is NOT "no rooms changed" — it is a read/write that did
      // not complete, and the report must say so.
      return {
        kind: 'no-applier',
        applied: [],
        undetermined: {
          scope: `application of predicted room geometry for ${predicted.length} room(s)`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: `the predicted-room-geometry applier threw: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    } finally {
      // C72 §4 — the hold is bounded by THIS execution. Released even on a throw;
      // the release discharges any commit the hold swallowed.
      if (levelIds.length > 0) this.deps.redetectSuppressor?.releasePlanCoveredLevels(levelIds);
    }

    return { kind: 'applied', applied };
  }

  /**
   * Compare the plan's PREDICTED geometry against what is ACTUALLY in the store —
   * the geometry arm of the plan-fidelity check (G-REASON-03).
   *
   * This is the check that makes "no second algorithm silently replaced the
   * prediction" a MEASURED property rather than a claim about the code. Set-grain
   * comparison cannot see it: if the observer re-detected a room, that room is in
   * `plan.changed` AND in `actual.changed`, so `unexpected` and `missing` are both
   * empty and the plan reads as AGREED while carrying a polygon nobody approved.
   * Only a VALUE comparison catches it.
   */
  private geometryReadback(plan: ConsequencePlan): {
    geometry?: readonly PredictedGeometry[];
    geometryUndetermined?: UndeterminedImpact;
    diverged: ElementId[];
  } {
    const predicted = plan.predictedGeometry ?? [];
    if (predicted.length === 0) return { diverged: [] };

    if (!this.deps.readRoomGeometry) {
      return {
        diverged: [],
        geometryUndetermined: {
          scope: `committed geometry of ${predicted.length} predicted room(s)`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no room-geometry reader is composed in this runtime; the committed polygons were NOT compared ' +
            'against the predicted ones. Absence of a reported divergence here is NOT evidence of fidelity.',
        },
      };
    }

    let actualGeometry: readonly PredictedGeometry[];
    try {
      actualGeometry = this.deps.readRoomGeometry(predicted.map((p) => p.elementId));
    } catch (e) {
      return {
        diverged: [],
        geometryUndetermined: {
          scope: `committed geometry of ${predicted.length} predicted room(s)`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: `the room-geometry reader threw: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    }

    const byId = new Map(actualGeometry.map((g) => [g.elementId, g]));
    const diverged: ElementId[] = [];
    for (const p of predicted) {
      const a = byId.get(p.elementId);
      // A room the reader could not return is a DIVERGENCE candidate we cannot
      // score, not a pass. It is named as diverged so it can never read as fidelity.
      if (!a) { diverged.push(p.elementId); continue; }
      // BYTE-IDENTICAL on the ring, via the same serialisation the fingerprints use,
      // so "identical" means the same thing everywhere in this file.
      if (stableStringify(p.polygon) !== stableStringify(a.polygon)) diverged.push(p.elementId);
    }
    diverged.sort();
    return { geometry: actualGeometry, diverged };
  }

  // ── Read-back ──────────────────────────────────────────────────────────────────

  private storeIds(): readonly string[] {
    return this.deps.readbackStores ?? DEFAULT_READBACK_STORES;
  }

  /** Serialise every element of every read-back store — values, not references. */
  private fingerprint(): Fingerprints {
    const ctx = this.deps.context();
    const out: Fingerprints = new Map();
    for (const storeId of this.storeIds()) {
      const view = ctx.getStore(storeId);
      const perStore = new Map<string, string>();
      if (view) {
        for (const item of view.getAll()) {
          const id = (item as { id?: unknown })?.id;
          if (typeof id === 'string') perStore.set(id, stableStringify(item));
        }
      }
      out.set(storeId, perStore);
    }
    return out;
  }

  /**
   * Diff post-state against the pre-state fingerprints. `changed` = mutated,
   * appeared or vanished; topology added/removed = appearance/disappearance at
   * store grain (the independent signal available without the Phase-5 dependency
   * substrate); `regenerated` stays empty because read-back has NO regeneration
   * channel yet — that blind spot is NOT hidden: the plan's own regeneration
   * UNDETERMINED item flows through `undeterminedOutcomes` on every report.
   */
  private readback(pre: Fingerprints): ActualConsequences {
    const post = this.fingerprint();
    const changed: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];
    for (const storeId of this.storeIds()) {
      const before = pre.get(storeId) ?? new Map<string, string>();
      const after = post.get(storeId) ?? new Map<string, string>();
      for (const [id, fp] of after) {
        const prev = before.get(id);
        if (prev === undefined) { added.push(id); changed.push(id); }
        else if (prev !== fp) { modified.push(id); changed.push(id); }
      }
      for (const id of before.keys()) {
        if (!after.has(id)) { removed.push(id); changed.push(id); }
      }
    }
    const uniq = (xs: string[]): ElementId[] => Array.from(new Set(xs)).sort();
    return {
      changed: uniq(changed),
      topology: { added: uniq(added), removed: uniq(removed), modified: uniq(modified) },
      regenerated: [],
    };
  }

  /** Actual validation delta — measured when a snapshotter is composed, typed-unknown when not. */
  private validationDelta(before: readonly ViolationRef[] | undefined): {
    delta: ValidationDelta;
    undetermined?: { scope: string; reason: 'ENGINE_NOT_AVAILABLE'; detail: string };
  } {
    if (!this.deps.violations || before === undefined) {
      return {
        delta: { violationsCreated: [], violationsResolved: [] },
        undetermined: {
          scope: 'post-mutation validation delta',
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'no violation snapshotter is composed in this runtime; the actual validation delta was not measured (the empty delta above is a placeholder, not a determination)',
        },
      };
    }
    const after = this.deps.violations();
    const key = (v: ViolationRef): string => `${v.ruleId}:${v.elementId ?? ''}`;
    const beforeKeys = new Set(before.map(key));
    const afterKeys = new Set(after.map(key));
    const byKey = (a: ViolationRef, b: ViolationRef): number => key(a).localeCompare(key(b));
    return {
      delta: {
        violationsCreated: after.filter((v) => !beforeKeys.has(key(v))).sort(byKey),
        violationsResolved: before.filter((v) => !afterKeys.has(key(v))).sort(byKey),
      },
    };
  }

  // ── Reconciliation (G-REASON-03's subject) ───────────────────────────────────────

  private reconcile(
    record: EventRecord<unknown>,
    plan: ConsequencePlan,
    actual: ActualConsequences,
    validation: ValidationDelta,
    validationUndetermined: { scope: string; reason: 'ENGINE_NOT_AVAILABLE'; detail: string } | undefined,
    context: CommandExecutionContext | undefined,
    reshape: ReshapeOutcome,
  ): ConsequenceReport {
    const predictedSet = new Set(plan.changed);
    const actualSet = new Set(actual.changed);
    const unexpected = actual.changed.filter((id) => !predictedSet.has(id));
    const missing = plan.changed.filter((id) => !actualSet.has(id));

    // `undeterminedResolved` needs per-element attribution of unpredicted changes to
    // plan blind spots — the plan's undetermined items carry SCOPES, not element
    // sets, so that attribution is not computable yet. It stays [] (a determined
    // empty: nothing is ATTRIBUTED), and the blind-spot data is preserved per-item
    // in `undeterminedOutcomes` below instead of being invented here. Deliberately
    // NOT subtracted from `unexpected`: absorbing unpredicted changes into blind
    // spots by default would let real divergence hide inside honesty — the exact
    // "absorbed silently" failure the gate's positive control exists to catch.
    const predictedVsActual: PredictedVsActual = {
      unexpected,
      missing,
      undeterminedResolved: [],
    };

    // SAFE MODE ROOM RESHAPE — the VALUE-grain fidelity check. Runs before the
    // divergence verdict because a diverged polygon MUST make the verdict diverge:
    // a rival algorithm's polygon on an element that was correctly predicted to
    // change is invisible to the set arithmetic above.
    const geo = this.geometryReadback(plan);

    // Divergence is a FIRST-CLASS, NAMED verdict (STR-06 §2), never a log line.
    const divergence: PlanDivergenceVerdict =
      unexpected.length > 0 || missing.length > 0 || geo.diverged.length > 0
        ? {
            kind: 'plan-fidelity-divergence',
            // A geometry divergence is reported on the element it happened to.
            // Unioned into `unexpected` (rather than given a private verdict arm)
            // so every EXISTING consumer of the verdict — the report view, the
            // certification gates, the AI host — sees it without being taught a
            // new shape. `geometryDiverged` below carries the precise attribution.
            unexpected: Array.from(new Set([...unexpected, ...geo.diverged])).sort(),
            missing,
          }
        : { kind: 'plan-agreed' };

    // One outcome PER plan.undetermined item, in plan order — the reconciliation
    // covers every plan item; an UNDETERMINED item is carried, never scored.
    // The reshape's own UNDETERMINED (no applier composed / the applier threw) is
    // APPENDED rather than dropped: an execution that did not apply the geometry it
    // planned to apply must not read as one that applied it successfully.
    const undeterminedOutcomes: UndeterminedOutcome[] = plan.undetermined.map((item) => ({
      item,
      outcome: 'undetermined-at-plan-time',
      actualChangedOutsidePrediction: unexpected,
    }));
    if (reshape.kind === 'no-applier') {
      undeterminedOutcomes.push({
        item: reshape.undetermined,
        outcome: 'undetermined-at-plan-time',
        actualChangedOutsidePrediction: unexpected,
      });
    }

    return {
      commandId: record.id,
      plan,
      actual,
      predictedVsActual,
      validation,
      ...(validationUndetermined !== undefined ? { validationUndetermined } : {}),
      // SAFE MODE ROOM RESHAPE — the committed geometry, measured independently, and
      // the elements whose committed ring differs from the predicted one. ABSENT vs
      // PRESENT-BUT-EMPTY differ here (consequence.ts): absent means no read-back
      // channel, which `geometryUndetermined` names.
      ...(geo.geometry !== undefined ? { geometry: geo.geometry } : {}),
      ...(geo.geometryUndetermined !== undefined ? { geometryUndetermined: geo.geometryUndetermined } : {}),
      ...(geo.diverged.length > 0 ? { geometryDiverged: geo.diverged } : {}),
      divergence,
      undeterminedOutcomes,
      provenance: {
        // ADR-0324 §1–2: the envelope is optional in R1–R4. When the caller supplied
        // none, the actor is recorded as system-invoked AT THIS SURFACE; the record's
        // own `audit.actorId` remains the authoritative WHO for the dispatch.
        actor: context?.actor ?? { kind: 'system' },
        ...(context?.origin !== undefined ? { origin: context.origin } : {}),
        ...(context?.approval !== undefined ? { approval: context.approval } : {}),
      },
    };
  }
}
