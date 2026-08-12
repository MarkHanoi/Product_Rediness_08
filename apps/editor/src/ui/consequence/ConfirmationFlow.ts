/**
 * ConfirmationFlow — R6 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md
 * (ADR-0322 §10 · ADR-0324 §4–5 · STR-06 §10–11). The plan doc's R6 exit condition is
 * "G-REASON-05 green; the card renders the plan", and R6's own sentence is:
 *
 *   "`ConfirmationRequirement` computed from the plan (severity classification + reasons);
 *    `planHash` + state-hash binding; stale approval → refuse/replan (**G-REASON-05**)."
 *
 * This file is the ORCHESTRATION — the sequence — and it is DOM-free by construction so the
 * sequence can be certified without a renderer. The card (ConfirmationCard.ts) is injected as
 * a `ConfirmationPrompt`; the executor is injected as a `ConfirmingExecutor`.
 *
 * ════ THE PROBLEM THIS FLOW SOLVES, WHICH R4 LEFT OPEN DELIBERATELY ════════════════════
 * R4 proved plan-binding works and wired it to NO production surface, and its composition
 * file says why: the R3 preview plan is minted at HOVER time, so binding it at drag-end would
 * ALWAYS read PLAN_STALE — the wall moved between hover and release, and the model
 * legitimately changed. A binding that always refuses is not a safety property; it is noise.
 *
 * The fix is not a looser binding. It is a DIFFERENT MOMENT:
 *
 *   PLAN AT CONFIRM TIME, NOT AT HOVER TIME.
 *
 *   1. the user finishes the gesture (drag end / second click) — the payload is now FINAL
 *   2. the system produces a FRESH plan over the CURRENT state          ← `request()`
 *   3. that plan is SHOWN, and the confirmation requirement is computed FROM it
 *   4. the user confirms          → the approval binds THAT `planHash`  ← `confirm()`
 *   5. execution re-verifies the hash against the live state and executes
 *
 * Between (3) and (4) the user is reading. If ANYTHING changes the model in that window —
 * a collaborator's edit, a sync merge, an AI command, an undo — the plan they read no longer
 * describes what would happen. The approval is then VOID: the flow refuses it as typed-stale,
 * says WHY, and offers a NEW plan. It never silently re-plans and executes (that would execute
 * something the user never saw) and never applies the stale plan (R4 already forbids it).
 *
 * ════ WHY THERE ARE TWO STALENESS CHECKS, AND WHY BOTH ARE LOAD-BEARING ════════════════
 *   THIS FILE checks the approval against the plan it was SHOWN: the confirm() caller must
 *   present the `planHash` of the pending plan, and the flow re-plans over the live state at
 *   confirm time and compares. This is the CONSENT check — "is the thing you approved still
 *   the thing that would happen?" — and its failure mode is a user approving a stale picture.
 *
 *   ConsequenceExecutionService (R4) checks again at dispatch. That is the EXECUTION check,
 *   and it exists because time passes between confirm and dispatch too.
 *
 * They are not redundant: this one can EXPLAIN the refusal to a human and re-offer a plan;
 * R4's can only refuse to claim a prediction. Removing this one would mean the user's consent
 * is verified by a layer that has no way to ask them again.
 *
 * ════ WHY THE FLOW OWNS NO DOM AND NO RUNTIME ══════════════════════════════════════════
 * Every collaborator is injected and every package import is `import type` (erased). The
 * certification gate drives THIS class with the real planner, the real executor, the real bus
 * and a scripted prompt — so what is certified is the shipped sequence, not a re-implementation
 * of it.
 */

import type {
  ConfirmationPolicy,
  ConsequencePlan,
  ConsequencePlanner,
  ExecutionConsequence,
  PlanningContext,
  CommandExecutionContext,
} from '@pryzm/command-bus';
import type { PreviewCommand } from '@app/engine/consequence/ConsequencePreviewService';
import { computeConfirmationPolicy } from './confirmationPolicy.js';

// ─── The typed refusals (the §5 discipline applied to CONSENT) ─────────────────────────

/**
 * The approval the user granted no longer matches a plan over the LIVE state — the model
 * moved while they were reading. TYPED, because "we could not honour your approval" and
 * "you did not approve" are different facts and must never print the same.
 *
 * Carries the FRESH plan, not just a complaint: R6 point 3 requires that a stale approval is
 * refused AND a new plan offered. A refusal that leaves the user with nothing to approve is a
 * dead end, and dead ends are what make people click through warnings.
 */
export interface ApprovalStaleRefusal {
  readonly kind: 'APPROVAL_STALE';
  /** The hash the user was shown and approved. */
  readonly approvedPlanHash: string;
  /** The hash of a plan computed over the state as it is NOW. */
  readonly livePlanHash: string;
  readonly approvedStateHash: string;
  readonly liveStateHash: string;
  /** The NEW plan, over current state — what the user must now be shown and asked about. */
  readonly replan: ConsequencePlan;
  /** A sentence naming what happened, for display. Carries both hashes. */
  readonly message: string;
}

/**
 * The approval names a plan this flow is not holding — a confirm() for a plan that was never
 * shown, or was superseded by a later request(). Distinct from APPROVAL_STALE: staleness is
 * "your plan aged out", this is "that is not the plan on screen". Collapsing them would let a
 * replayed or forged approval read as a mere timing problem.
 */
export interface ApprovalUnknownRefusal {
  readonly kind: 'APPROVAL_UNKNOWN_PLAN';
  readonly approvedPlanHash: string;
  readonly pendingPlanHash: string | null;
  readonly message: string;
}

/** The flow refused to plan at all — no planner for this command type. */
export interface NoPlanRefusal {
  readonly kind: 'NO_PLAN_AVAILABLE';
  readonly commandType: string;
  readonly message: string;
}

/**
 * What `request()` answers. Two arms is the point of R6's first requirement — *"the user
 * never confirms before seeing the plan"*: there is no arm that produces a confirmation
 * prompt without a plan, because a prompt is only ever built from `pending.plan`.
 */
export type ConfirmationRequest =
  | {
      readonly kind: 'pending';
      /** The FRESH plan, over CURRENT state, minted at confirm time. */
      readonly plan: ConsequencePlan;
      /** Computed FROM that plan (confirmationPolicy.ts) — never from the verb. */
      readonly policy: ConfirmationPolicy;
      /**
       * TRUE when the policy says `none` — the operation is below the confirmation
       * threshold and the caller may execute directly. The plan is still returned (it is
       * still the prediction execution will bind), so "no confirmation" never means
       * "no plan".
       */
      readonly autoProceed: boolean;
    }
  | { readonly kind: 'refused'; readonly refusal: NoPlanRefusal };

/** What `confirm()` answers. */
export type ConfirmationOutcome =
  | { readonly kind: 'executed'; readonly consequence: ExecutionConsequence }
  | { readonly kind: 'approval-stale'; readonly refusal: ApprovalStaleRefusal }
  | { readonly kind: 'approval-unknown'; readonly refusal: ApprovalUnknownRefusal }
  | { readonly kind: 'cancelled' };

// ─── Injected collaborators ────────────────────────────────────────────────────────────

/** The R4 executor, structurally — the ONE dispatch funnel that consumes a plan. */
export interface ConfirmingExecutor {
  execute<T>(
    command: PreviewCommand & { readonly payload: T },
    opts?: {
      readonly plan?: ConsequencePlan;
      readonly gestureId?: string;
      readonly context?: CommandExecutionContext;
    },
  ): Promise<{ readonly consequence: ExecutionConsequence }>;
}

/**
 * The display surface. An INTERFACE, so the flow never imports a DOM module: production
 * injects `ConfirmationCard`, the gate injects a scripted prompt, and the sequence under test
 * is the one that ships.
 */
export interface ConfirmationPrompt {
  /** Show the plan + its policy, and the blocking sentences it carries. */
  show(plan: ConsequencePlan, policy: ConfirmationPolicy): void;
  /** Show a typed refusal of an approval. The user MUST be told why (R6 point 3). */
  showRefusal(message: string, replan: ConsequencePlan | null): void;
  hide(): void;
}

export interface ConfirmationFlowDeps {
  /** Keyed by CANONICAL semantic type (`'wall.move'`) — the same map the preview/executor use. */
  readonly planners: ReadonlyMap<string, ConsequencePlanner<never>>;
  /** Normalises a dispatched `(type, payload)` onto the semantic command. ONE rule, shared. */
  readonly normalize: (command: PreviewCommand) => { type: string } | null;
  /** Materialises read-only views over the LIVE stores at call time. */
  readonly context: () => PlanningContext;
  readonly executor: ConfirmingExecutor;
  /** Optional display surface. Absent ⇒ the flow still answers; nothing is drawn. */
  readonly prompt?: ConfirmationPrompt;
}

/** What the flow is holding between show and confirm. */
interface Pending {
  readonly command: PreviewCommand;
  readonly plan: ConsequencePlan;
  readonly policy: ConfirmationPolicy;
}

// ─── The flow ──────────────────────────────────────────────────────────────────────────

export class ConfirmationFlow {
  private _pending: Pending | null = null;

  constructor(private readonly deps: ConfirmationFlowDeps) {}

  /** The plan currently awaiting a decision, if any. Read-only; exposed for tests + the gate. */
  get pending(): ConsequencePlan | null {
    return this._pending?.plan ?? null;
  }

  /**
   * STEP 2–3: mint a FRESH plan over the CURRENT state for a FINAL payload, classify it, and
   * show it. Called when the gesture is FINISHED — never on hover (that is the R3 preview's
   * job, and a hover plan can never be bound).
   *
   * Replaces any previously pending plan: the newest plan on screen is the only one that may
   * be approved, which is what makes `APPROVAL_UNKNOWN_PLAN` meaningful.
   */
  async request(command: PreviewCommand): Promise<ConfirmationRequest> {
    const plan = await this.planNow(command);
    if (!plan) {
      this._pending = null;
      const refusal: NoPlanRefusal = {
        kind: 'NO_PLAN_AVAILABLE',
        commandType: command.type,
        message:
          `No consequence planner answers for '${command.type}', so no plan could be shown. ` +
          `Confirmation is downstream of consequences (STR-06 §10) — this flow does not ask ` +
          `for approval of an operation it cannot describe.`,
      };
      return { kind: 'refused', refusal };
    }

    const policy = computeConfirmationPolicy(plan);
    this._pending = { command, plan, policy };

    // R6 point 5 — not every operation needs confirmation. The POLICY decides, from the
    // plan's own consequence set, and the decision is DATA the caller reads. A card that is
    // shown for `none` would be the "always ask" behaviour the requirement forbids.
    if (policy.requirement !== 'none') this.deps.prompt?.show(plan, policy);

    return { kind: 'pending', plan, policy, autoProceed: policy.requirement === 'none' };
  }

  /**
   * STEP 4–5: the user approved the plan whose hash is `approvedPlanHash`. The hash is a
   * REQUIRED argument, not read from internal state, because that is what "approval binds to
   * the planHash it was shown" MEANS: the caller must present the identity of the artefact
   * the human looked at. A confirm() that trusted `this._pending` would bind to whatever is
   * current, which is exactly the substitution this whole phase exists to prevent.
   */
  async confirm(approvedPlanHash: string, context?: CommandExecutionContext): Promise<ConfirmationOutcome> {
    const pending = this._pending;

    // (i) Is this even the plan on screen?
    if (!pending || pending.plan.planHash !== approvedPlanHash) {
      const refusal: ApprovalUnknownRefusal = {
        kind: 'APPROVAL_UNKNOWN_PLAN',
        approvedPlanHash,
        pendingPlanHash: pending?.plan.planHash ?? null,
        message:
          `This approval names plan ${approvedPlanHash}, which is not the plan awaiting a ` +
          `decision (${pending?.plan.planHash ?? 'none'}). Nothing was executed — an approval ` +
          `is only ever honoured for the exact plan it was shown.`,
      };
      this.deps.prompt?.showRefusal(refusal.message, null);
      return { kind: 'approval-unknown', refusal };
    }

    // (ii) Has the model moved since the user was shown this plan? Re-plan over the LIVE
    // state with the SAME planner (contractually pure — G-REASON-01 — so this is a read) and
    // compare hashes. Equality ⇒ nothing the planner can see has changed ⇒ the picture the
    // user approved still describes what will happen.
    const live = await this.planNow(pending.command);
    if (!live || live.planHash !== pending.plan.planHash) {
      // R6 point 3: refuse VISIBLY, offer a NEW plan, and TELL the user why. Never silently
      // re-plan and execute — that executes something they never saw.
      const replan = live ?? pending.plan;
      const refusal: ApprovalStaleRefusal = {
        kind: 'APPROVAL_STALE',
        approvedPlanHash: pending.plan.planHash,
        livePlanHash: live?.planHash ?? 'UNPLANNABLE',
        approvedStateHash: pending.plan.stateHash,
        liveStateHash: live?.stateHash ?? 'UNPLANNABLE',
        replan,
        message:
          `The model changed while this was on screen, so your approval no longer applies. ` +
          `You approved plan ${pending.plan.planHash} (state ${pending.plan.stateHash}); the ` +
          `model is now at ${live?.planHash ?? 'an unplannable state'} (state ${live?.stateHash ?? '—'}). ` +
          `Nothing was executed. A new plan has been prepared — review it and confirm again.`,
      };
      // The NEW plan becomes the pending one: the user is left with something to approve,
      // and the old hash can never be re-approved (its holder is gone).
      if (live) {
        const policy = computeConfirmationPolicy(live);
        this._pending = { command: pending.command, plan: live, policy };
      } else {
        this._pending = null;
      }
      this.deps.prompt?.showRefusal(refusal.message, live);
      return { kind: 'approval-stale', refusal };
    }

    // (iii) Bound. Execute, handing the executor THE PLAN THE USER APPROVED — it verifies
    // the hash again at dispatch (R4) and reconciles predicted-vs-actual against it.
    this._pending = null;
    this.deps.prompt?.hide();
    const { consequence } = await this.deps.executor.execute(
      { type: pending.command.type, payload: pending.command.payload },
      { plan: pending.plan, ...(context !== undefined ? { context } : {}) },
    );
    return { kind: 'executed', consequence };
  }

  /** The user dismissed the card. Nothing executes; the pending plan is dropped. */
  cancel(): ConfirmationOutcome {
    this._pending = null;
    this.deps.prompt?.hide();
    return { kind: 'cancelled' };
  }

  /**
   * Mint a plan over the state AS IT IS NOW. The one place this flow computes a plan — both
   * `request()` and `confirm()` call it, so the "shown" plan and the "live" plan are produced
   * by the identical path and a hash difference can only mean the MODEL moved, never that two
   * code paths disagreed.
   */
  private async planNow(command: PreviewCommand): Promise<ConsequencePlan | null> {
    const semantic = this.deps.normalize(command);
    if (!semantic) return null;
    const planner = this.deps.planners.get(semantic.type);
    if (!planner) return null;
    return planner.plan(semantic as never, this.deps.context());
  }
}
