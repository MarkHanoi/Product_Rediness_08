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
 * Every collaborator is injected and the only runtime imports are two DOM-free modules —
 * `confirmationPolicy` (a pure function of the plan) and `ConsequencePreviewService`'s
 * `resolveConsequencePreview` (a pure router over injected maps; see `planNow` for why it is
 * shared rather than re-implemented). The certification gate drives THIS class with the real
 * planner, the real executor, the real bus and a scripted prompt — so what is certified is the
 * shipped sequence, not a re-implementation of it.
 */

import type {
  ConfirmationPolicy,
  ConsequencePlan,
  ConsequencePlanner,
  ExecutionConsequence,
  PlanningContext,
  PreviewOutcome,
  UndeterminedReason,
  UndeterminedSubReason,
  CommandExecutionContext,
} from '@pryzm/command-bus';
import type {
  NormalizerRule,
  PreviewCommand,
} from '@app/engine/consequence/ConsequencePreviewService';
import { resolveConsequencePreview } from '@app/engine/consequence/ConsequencePreviewService';
import { computeConfirmationPolicy } from './confirmationPolicy.js';

/** The `undetermined` arm of {@link PreviewOutcome} — the three fields a refusal carries. */
type PreviewUndetermined = Extract<PreviewOutcome, { readonly kind: 'undetermined' }>;

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
  /**
   * The hash of a plan computed over the state as it is NOW — **only when
   * {@link liveVerification} is `verified`**. When the re-plan could not be produced at all,
   * this holds the APPROVED hash, because that is the only real hash in evidence.
   *
   * ⚠ C78 §9.3 / §22.c — *"a hash field may never carry a reason … a field typed to hold a
   * hash must be unable to hold a sentence."* This field used to be minted `'UNPLANNABLE'`
   * when the live re-plan came back `null` (C78's §8 table, row `'UNPLANNABLE'`, cites
   * `ConfirmationFlow.ts:269–271` by line). Every consumer decides staleness by comparing
   * this to {@link approvedPlanHash}, so a CAPABILITY GAP — no planner, a bad payload, a
   * planner that threw — was reported to the user as *"the model moved under your plan"*: a
   * statement about the world that was never measured. Read {@link liveVerification} FIRST;
   * these two fields are comparable only under the `verified` arm.
   */
  readonly livePlanHash: string;
  readonly approvedStateHash: string;
  /** As {@link livePlanHash} — the approved state hash when the re-plan is unverifiable. */
  readonly liveStateHash: string;
  /**
   * ⭐ §B.4 / C78 §9.3 — WHETHER the live hashes are re-computations at all. `verified` means
   * a plan really was minted over the live state and its hash differed. `unverifiable` means
   * no live plan could be produced, carries the C78 §8.1 member saying WHY, and makes the
   * claim "the model changed" unstateable rather than merely discouraged.
   */
  readonly liveVerification: LivePlanVerification;
  /**
   * A plan to put back in front of the user. Under `verified` this is the NEW plan over
   * current state. Under `unverifiable` it is the plan they already approved — nothing newer
   * exists, and offering it back is what keeps the refusal from being a dead end (see
   * `confirm()`: the pending plan is DELIBERATELY retained on that arm so the offer works).
   */
  readonly replan: ConsequencePlan;
  /** A sentence naming what happened, for display. Never claims more than was measured. */
  readonly message: string;
}

/**
 * ⭐ §B.4 / C78 §9.3 — the typed statement of whether the confirm-time re-plan HAPPENED.
 *
 * The `unverifiable` arm is structurally {@link PreviewOutcome}'s `undetermined` arm (derived
 * from it, so a field added at L1 arrives here rather than drifting): the same closed §8.1
 * union, the same optional typed sub-reason, the same human-only `detail`. That identity is
 * the point — "I could not re-plan" is the SAME kind of fact at the consent check as it is at
 * the preview entry point, and giving it a second vocabulary here would re-open §8.8 one layer
 * up.
 */
export type LivePlanVerification =
  | {
      /** A live plan WAS computed. {@link ApprovalStaleRefusal.livePlanHash} is its hash. */
      readonly kind: 'verified';
    }
  | ({ readonly kind: 'unverifiable' } & Omit<PreviewUndetermined, 'kind'>);

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

/**
 * The flow could not produce a plan, and SAYS WHICH OF THE FOUR CAUSES it measured.
 *
 * ⚠ §B.4 / C78 §8.8 / U-INV-2 — this interface carried `kind`, `commandType` and `message`,
 * and `request()` filled the message with ONE sentence unconditionally: *"No consequence
 * planner answers for '<type>'"*. That is the N4 claim, and it was printed for all of:
 *
 *   N1    no verb normaliser recognises the type  (no planner FAMILY exists — N4's OPPOSITE)
 *   N2/N3 the payload is malformed                (a fact about the CALLER, not about PRYZM)
 *   N4    the family exists, nothing is composed  (the only case the sentence described)
 *   N5    the planner threw                       (did not even reach the sentence — it
 *                                                  propagated as a rejected promise)
 *
 * The caller could not tell them apart and — the defect that matters — could not tell any of
 * them from *"this command genuinely affects nothing"*. {@link reason} is C78 §8.1's closed
 * union; {@link subReason} is §8.3's typed per-family specificity; {@link detail} is free text
 * for humans that nothing may branch on.
 */
export interface NoPlanRefusal {
  readonly kind: 'NO_PLAN_AVAILABLE';
  readonly commandType: string;
  /** WHICH of the four causes was measured — C78 §8.1's closed union. */
  readonly reason: UndeterminedReason;
  /**
   * C78 §8.3's typed sub-reason, where the parent member is not the whole story.
   * `'no-normalizer-for-verb'` (N1) and `'no-planner-registered'` (N4) are what make the two
   * semantic opposites distinguishable at a glance; N2/N3 and N5 carry none, deliberately —
   * `INVALID_REQUEST` is not a statement about the system's capability at all.
   */
  readonly subReason?: UndeterminedSubReason;
  /** Free text for humans (C78 §8.3). Never branched on; carries no typed fact. */
  readonly detail: string;
  /** The sentence a surface displays. Carries the typed facts rather than replacing them. */
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
  /**
   * Show a typed refusal of an approval. The user MUST be told why (R6 point 3).
   *
   * `refusal` is the TYPED fact, handed over so the surface can choose WORDING without
   * re-deriving anything (the card's rule 2: *"the card renders the verdict; it never reaches
   * one"*). It is optional only so a test double may take the message alone; production
   * surfaces that ignore it will print the stale-approval wording for a refusal that is not
   * staleness, which is the §9.3 defect moved into the DOM.
   */
  showRefusal(
    message: string,
    replan: ConsequencePlan | null,
    refusal?: ApprovalStaleRefusal | ApprovalUnknownRefusal,
  ): void;
  hide(): void;
}

export interface ConfirmationFlowDeps {
  /** Keyed by CANONICAL semantic type (`'wall.move'`) — the same map the preview/executor use. */
  readonly planners: ReadonlyMap<string, ConsequencePlanner<never>>;
  /**
   * The bus-verb → semantic-command REGISTRY (`CONSEQUENCE_NORMALIZERS`), not a normalising
   * FUNCTION.
   *
   * ⚠ §B.4 — this was `normalize: (command) => {type} | null`, and that signature is itself the
   * collapse: a function returning `null` cannot distinguish *"no rule is registered for this
   * verb"* (N1 — a statement about PRYZM's coverage) from *"a rule ran and rejected this
   * payload"* (N2/N3 — a statement about the CALLER). The flow could not type what it was
   * never given. Taking the MAP moves the lookup inside, where the two facts are separable —
   * and it is the same map preview and execution already share, so no surface can form a
   * different semantic command for one dispatch (the G-REASON-03 divergence class).
   */
  readonly normalizers: ReadonlyMap<string, NormalizerRule>;
  /** Materialises read-only views over the LIVE stores at call time. */
  readonly context: () => PlanningContext;
  readonly executor: ConfirmingExecutor;
  /** Optional display surface. Absent ⇒ the flow still answers; nothing is drawn. */
  readonly prompt?: ConfirmationPrompt;
}

// ─── The sentences. Built FROM the typed facts, never instead of them ──────────────────

/**
 * The displayed sentence for a {@link NoPlanRefusal}. It names the typed reason and sub-reason
 * verbatim, and then DENIES the reading the old blanket sentence invited.
 *
 * That last clause is not decoration. C78 §1.4 forbids inferring DETERMINED-unaffected from an
 * absence, and the surface a human reads is where that inference actually gets made: a refusal
 * that merely fails to mention consequences will be read as "there are none".
 */
function noPlanMessage(commandType: string, o: PreviewUndetermined): string {
  const sub = o.subReason !== undefined ? ` / ${o.subReason}` : '';
  return (
    `No plan could be produced for '${commandType}' — ${o.reason}${sub}: ${o.detail}. ` +
    `Nothing was executed and nothing was approved. Confirmation is downstream of consequences ` +
    `(STR-06 §10) — this flow does not ask for approval of an operation it cannot describe. ` +
    `This states what PRYZM could DETERMINE and is NOT a claim that the operation would change ` +
    `nothing (C78 §1.4 / U-INV-2).`
  );
}

/**
 * ⭐ §REFUSAL-IDENTITY (C58 §1.13 / §1.13.8, ADR-0269 · GE-09) — the ONE renderer for the
 * sentence an {@link ApprovalStaleRefusal} puts in front of a human, for BOTH of its arms.
 *
 * ⚠ WHAT WAS MISSING, AND WHY HERE OF ALL PLACES. Both sentences were written inline at their
 * construction sites, and the `unverifiable` one rendered `liveVerification.reason` — a closed
 * C78 §8.1 union member — into prose while naming NO refusal. {@link ConfirmationPrompt.showRefusal}
 * takes the typed fact OPTIONALLY (deliberately: a test double may take the sentence alone), so
 * the STRING is the only carrier guaranteed to reach every sink. C58 §1.13's finding is that a
 * refusal a user cannot attribute to a rule is indistinguishable from a generic "not applicable";
 * §1.13.8's rule is that the distinction the resolver drew MUST reach the card. This family draws
 * it TWICE — `kind` (which refusal) and `liveVerification.kind` (whether anything was measured) —
 * and both now travel INSIDE the sentence as a leading bracketed token, quoting the union members
 * VERBATIM rather than restyling them, so the token a user pastes into a report greps against the
 * type that produced it.
 *
 * ONE function for both arms, deliberately: these two sentences make OPPOSITE claims about the
 * world — *"the model changed"* versus *"we could not look"* — and keeping them adjacent is what
 * stops a later edit handing the unverifiable arm the measured arm's wording again. That is not a
 * hypothetical: this family already shipped that exact collapse once, as the `'UNPLANNABLE'` hash
 * sentinel C78 §9.3 struck out.
 *
 * Takes the refusal MINUS its message, so the sentence is built from the very fields the consumer
 * branches on. Nothing is re-derived here and no union is widened — the token is the union
 * members themselves.
 */
function approvalStaleRefusalText(f: Omit<ApprovalStaleRefusal, 'message'>): string {
  const identity = `[${f.kind}/${f.liveVerification.kind}]`;

  if (f.liveVerification.kind === 'unverifiable') {
    const v = f.liveVerification;
    const sub = v.subReason !== undefined ? ` / ${v.subReason}` : '';
    return (
      `${identity} Your approval could not be RE-VERIFIED, so nothing was executed. To honour ` +
      `it, PRYZM re-plans over the model as it is now and checks that the result still matches ` +
      `the plan you read — and that check could not be run: ${v.reason}${sub} (${v.detail}). ` +
      `This is a statement about PRYZM's ability to check, and is NOT a claim that the ` +
      `model changed — that was never measured (C78 §9.3). You approved plan ` +
      `${f.approvedPlanHash} (state ${f.approvedStateHash}); it is still the plan on ` +
      `screen, so you may confirm again once the check can run.`
    );
  }

  return (
    `${identity} The model changed while this was on screen, so your approval no longer ` +
    `applies. You approved plan ${f.approvedPlanHash} (state ${f.approvedStateHash}); the ` +
    `model is now at ${f.livePlanHash} (state ${f.liveStateHash}). ` +
    `Nothing was executed. A new plan has been prepared — review it and confirm again.`
  );
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
    const outcome = await this.planNow(command);
    if (outcome.kind === 'undetermined') {
      this._pending = null;
      const refusal: NoPlanRefusal = {
        kind: 'NO_PLAN_AVAILABLE',
        commandType: command.type,
        reason: outcome.reason,
        ...(outcome.subReason !== undefined ? { subReason: outcome.subReason } : {}),
        detail: outcome.detail,
        message: noPlanMessage(command.type, outcome),
      };
      return { kind: 'refused', refusal };
    }

    const plan = outcome.plan;
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
      this.deps.prompt?.showRefusal(refusal.message, null, refusal);
      return { kind: 'approval-unknown', refusal };
    }

    // (ii) Has the model moved since the user was shown this plan? Re-plan over the LIVE
    // state with the SAME planner (contractually pure — G-REASON-01 — so this is a read) and
    // compare hashes. Equality ⇒ nothing the planner can see has changed ⇒ the picture the
    // user approved still describes what will happen.
    const live = await this.planNow(pending.command);

    // ⭐ §B.4 / C78 §9.3 — the branch that used to be a HASH SENTINEL. Two facts, and they
    // are not the same fact: the re-plan SUCCEEDED and differs (the model moved), or the
    // re-plan could not be produced at all (a capability gap — no planner, a rejected
    // payload, a planner that threw). Both refuse; only the first may say the model changed.
    if (live.kind === 'undetermined') {
      // §REFUSAL-IDENTITY — the facts FIRST, the sentence FROM them. Building the message
      // inline (as this did) is how it came to name C78 §8.1's cause without ever naming the
      // refusal that carries it: two renderings of one fact, only one of which the user reads.
      const facts: Omit<ApprovalStaleRefusal, 'message'> = {
        kind: 'APPROVAL_STALE',
        approvedPlanHash: pending.plan.planHash,
        // NOT a sentinel, and not a fabricated "live" reading: the approved hashes are the
        // only hashes in evidence. `liveVerification` is what tells a consumer they are not
        // re-computations, so comparing them can no longer manufacture a staleness claim.
        livePlanHash: pending.plan.planHash,
        approvedStateHash: pending.plan.stateHash,
        liveStateHash: pending.plan.stateHash,
        liveVerification: {
          kind: 'unverifiable',
          reason: live.reason,
          ...(live.subReason !== undefined ? { subReason: live.subReason } : {}),
          detail: live.detail,
        },
        replan: pending.plan,
      };
      const refusal: ApprovalStaleRefusal = {
        ...facts,
        message: approvalStaleRefusalText(facts),
      };
      // ⭐ THE ESCAPE HATCH (C83 §10.6.7 — a refusing half and its way through ship together).
      // The pending plan is DELIBERATELY RETAINED here, unlike the verified-stale arm below.
      // Nothing newer exists to offer, and the failure may be transient (a store view that
      // vanished for one frame); dropping it would leave the card's "confirm again" button
      // bound to a hash the flow no longer holds — a dead end WITH a button, which is worse
      // than no button. Retaining it is safe by construction: execution still happens only
      // when a live re-plan SUCCEEDS and its hash matches, so a retry can never execute an
      // unverified plan.
      this.deps.prompt?.showRefusal(refusal.message, pending.plan, refusal);
      return { kind: 'approval-stale', refusal };
    }

    if (live.plan.planHash !== pending.plan.planHash) {
      // R6 point 3: refuse VISIBLY, offer a NEW plan, and TELL the user why. Never silently
      // re-plan and execute — that executes something they never saw.
      const facts: Omit<ApprovalStaleRefusal, 'message'> = {
        kind: 'APPROVAL_STALE',
        approvedPlanHash: pending.plan.planHash,
        livePlanHash: live.plan.planHash,
        approvedStateHash: pending.plan.stateHash,
        liveStateHash: live.plan.stateHash,
        // MEASURED: a plan really was computed over the live state, and it differs.
        liveVerification: { kind: 'verified' },
        replan: live.plan,
      };
      // The SAME renderer as the unverifiable arm above — so the identity token is minted
      // from the union members in one place and the two arms cannot drift into each other's
      // wording (§REFUSAL-IDENTITY; the C78 §9.3 collapse this family already suffered).
      const refusal: ApprovalStaleRefusal = {
        ...facts,
        message: approvalStaleRefusalText(facts),
      };
      // The NEW plan becomes the pending one: the user is left with something to approve,
      // and the old hash can never be re-approved (its holder is gone).
      this._pending = {
        command: pending.command,
        plan: live.plan,
        policy: computeConfirmationPolicy(live.plan),
      };
      this.deps.prompt?.showRefusal(refusal.message, live.plan, refusal);
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
   * Mint a plan over the state AS IT IS NOW, or say WHY none could be minted. The one place
   * this flow computes a plan — both `request()` and `confirm()` call it, so the "shown" plan
   * and the "live" plan are produced by the identical path and a hash difference can only mean
   * the MODEL moved, never that two code paths disagreed.
   *
   * ⚠ §B.4 / C78 §8.8 / U-INV-2 — this returned `ConsequencePlan | null` and the `null` carried
   * the SAME four causes `preview()` collapsed, re-implemented here line for line. C78 §8.8
   * names both sites in one sentence. The fix is therefore NOT a second typed implementation:
   * this method delegates to `resolveConsequencePreview` — the one shared router — so the two
   * sites cannot drift, and it additionally CATCHES the planner throw that used to escape as a
   * rejected promise (the composition site calls `void flow.confirm(...)` from the card's click
   * handler, so that rejection became an unhandled rejection and the card simply stopped
   * responding).
   */
  private async planNow(command: PreviewCommand): Promise<PreviewOutcome> {
    return resolveConsequencePreview(
      command,
      this.deps.planners,
      this.deps.context,
      this.deps.normalizers,
    );
  }
}
