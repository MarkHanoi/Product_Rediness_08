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
} from '@pryzm/command-bus';
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
}

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
    let stale: { livePlanHash: string; liveStateHash: string } | undefined;

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
          stale = { livePlanHash: livePlan.planHash, liveStateHash: livePlan.stateHash };
        }
      } else {
        // A plan for a command this service cannot re-plan is unverifiable — an
        // unverifiable binding is REFUSED, not assumed (the §5 discipline: "could
        // not check" must never print as "checked, fine").
        stale = { livePlanHash: 'UNVERIFIABLE:no-planner-for-type', liveStateHash: 'UNVERIFIABLE:no-planner-for-type' };
      }
    }

    // ── 2. Pre-state fingerprints (the read-back baseline) ────────────────────────
    const pre = this.fingerprint();
    const violationsBefore = this.deps.violations?.();

    // ── 3. THE dispatch — one funnel, the plan riding only when it bound ──────────
    const record = await this.deps.bus.executeCommand<T>(command.type, command.payload, {
      ...(opts?.suppressUndo !== undefined ? { suppressUndo: opts.suppressUndo } : {}),
      ...(opts?.gestureId !== undefined ? { gestureId: opts.gestureId } : {}),
      ...(opts?.context !== undefined ? { context: opts.context } : {}),
      ...(bound !== undefined ? { plan: bound } : {}),
    });

    // ── 4. Independent read-back (CA-21 discipline) ───────────────────────────────
    const actual = this.readback(pre);
    const validation = this.validationDelta(violationsBefore);

    // ── 5. The typed consequence answer ───────────────────────────────────────────
    const consequence: ExecutionConsequence = bound
      ? { kind: 'reconciled', report: this.reconcile(record, bound, actual, validation.delta, validation.undetermined, opts?.context) }
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

    // Divergence is a FIRST-CLASS, NAMED verdict (STR-06 §2), never a log line.
    const divergence: PlanDivergenceVerdict =
      unexpected.length > 0 || missing.length > 0
        ? { kind: 'plan-fidelity-divergence', unexpected, missing }
        : { kind: 'plan-agreed' };

    // One outcome PER plan.undetermined item, in plan order — the reconciliation
    // covers every plan item; an UNDETERMINED item is carried, never scored.
    const undeterminedOutcomes: UndeterminedOutcome[] = plan.undetermined.map((item) => ({
      item,
      outcome: 'undetermined-at-plan-time',
      actualChangedOutsidePrediction: unexpected,
    }));

    return {
      commandId: record.id,
      plan,
      actual,
      predictedVsActual,
      validation,
      ...(validationUndetermined !== undefined ? { validationUndetermined } : {}),
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
