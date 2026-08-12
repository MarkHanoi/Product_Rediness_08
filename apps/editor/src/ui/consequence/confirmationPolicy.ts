/**
 * confirmationPolicy — R6 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md
 * (ADR-0322 §10 · STR-06 §10–11). The plan doc's R6 opens with the sentence this file
 * implements verbatim:
 *
 *   "`ConfirmationRequirement` computed from the plan (severity classification + reasons)"
 *
 * ── WHY THIS IS A PURE FUNCTION OVER THE PLAN, AND NOT A UI CONDITION ─────────────────
 * STR-06 §10 forbids the shortcut BY NAME: *"Never `if (command.isDestructive)
 * showConfirm()` — that reproduces the gap."* A confirmation decided by the verb, by a
 * static flag, or by a `if (plan.refused.length)` written inside a renderer is the same
 * defect wearing three hats: the decision is then INVISIBLE to every other surface. AI,
 * batch, chat and future automation each re-derive it, each slightly differently, and the
 * consent semantics stop being deterministic — which is precisely what §11 says the plan
 * binding exists to give us ("one safety substrate for UI, AI, batch and future
 * automation").
 *
 * So the requirement is DATA COMPUTED FROM THE PLAN, by this one function, and the card is
 * handed the result. The card renders a verdict; it never reaches a verdict. A gate can
 * therefore assert the policy directly, without a DOM, and two surfaces asking "does this
 * need confirmation?" are asking the SAME function about the SAME plan and cannot disagree.
 *
 * ── WHY IT IS NOT A FIELD ON `ConsequencePlan` ITSELF ─────────────────────────────────
 * It could be, and the contract has room for it. It is NOT, for one reason: the policy is a
 * JUDGEMENT over the plan, while the plan is a MEASUREMENT of consequences. Freezing a
 * judgement into the hashed plan body would make every policy tweak a plan-hash change —
 * i.e. it would invalidate every outstanding approval and every determinism baseline
 * (G-REASON-02 hashes the plan) for a reason that has nothing to do with the model. Keeping
 * it a pure derivation means the SAME plan hash yields the SAME requirement at any time, and
 * a policy change is a code change reviewed as one. `computeConfirmationPolicy(plan)` is
 * referentially transparent over the plan, so "data on the plan" is satisfied without
 * welding the judgement to the measurement.
 *
 * ── THE POLICY, AND WHERE EACH CLAUSE COMES FROM ──────────────────────────────────────
 * STR-06 §10 names the ladder (`none | recommended | required`) and three canonical
 * reasons. This function maps the plan's own sections onto them:
 *
 *   REQUIRED
 *     · `refused` is non-empty            → `plan_refuses_part_of_the_operation`
 *       The planner has already determined part of this cannot proceed as asked, WITH the
 *       numbers. Executing without showing the user those numbers is executing something
 *       they never saw.
 *     · `validation.violationsCreated` is non-empty (severity: a created violation is a
 *       rule the model would break)       → `creates_rule_violations`
 *     · `topology.removed` is non-empty   → `removes_existing_elements`  (§10's own name)
 *
 *   RECOMMENDED
 *     · `undetermined` is non-empty       → `impact_partially_undetermined` (§10's own name)
 *       Deliberately NOT `required`: with the Phase-5 substrate absent, EVERY wall.move plan
 *       carries at least the regeneration blind spot. Making that `required` would demand a
 *       confirmation on literally every operation — which is the "always ask" behaviour
 *       point 5 of the R6 brief exists to forbid, arriving by the honest door instead of the
 *       lazy one. It is surfaced, and it nudges; it does not block.
 *     · hosted elements are implicated    → `changes_hosted_elements`     (§10's own name)
 *       C15: doors/windows are hosted; moving their host relocates them. Detected from the
 *       plan's own predicted change set by id prefix, which is the only element-kind signal
 *       a plan carries today — see HOSTED_PREFIXES for why that is declared, not hidden.
 *     · the predicted change set is BROAD (> BROAD_CHANGE_THRESHOLD) → `broad_impact`
 *
 *   NONE
 *     · everything else. A plan with no refusals, no new violations, no removals, no blind
 *       spots and a small determined change set is a routine edit, and nagging about it
 *       trains the user to dismiss the card unread — which would make the REQUIRED cases
 *       less safe, not more.
 *
 * The requirement is the MAXIMUM over the clauses that fired; every clause that fired
 * contributes its reason, in a deterministic order, so the card can list them all and a gate
 * can assert on them by name.
 */

import type {
  ConfirmationPolicy,
  ConfirmationReason,
  ConfirmationRequirement,
  ConsequencePlan,
} from '@pryzm/command-bus';

/**
 * Above this many predicted changes, a move stops being a local edit. 8 is a judgement, and
 * it is written HERE as a named constant rather than inline in a condition so that changing
 * it is a visible, reviewable act rather than a tweak buried in a boolean.
 */
export const BROAD_CHANGE_THRESHOLD = 8;

/**
 * Id prefixes that identify HOSTED elements (C15: doors and windows live in walls).
 *
 * ⚠ DECLARED WEAKNESS, not a hidden heuristic: a `ConsequencePlan` carries element IDS, not
 * element KINDS — `ElementSet = readonly ElementId[]`. So the only kind signal available at
 * policy time is the id shape the stores mint (`door-…`, `window-…`, `opening-…`). This is a
 * PREFIX TEST, and it can UNDER-detect on an id scheme that does not carry the kind (a ULID
 * door is invisible to it). That direction is the acceptable one: `changes_hosted_elements`
 * only ever raises the requirement to `recommended`, never to `required`, so a miss costs a
 * nudge — it never lets a blocker through, because blockers come from `refused` and
 * `violationsCreated`, which are kind-independent.
 *
 * ⚠ AND THE SHORT PREFIXES ARE DELIBERATELY ABSENT. `'d_'` and `'w_'` were here first and the
 * certification gate caught them immediately: this repo's wall fixtures mint `w_0`, `w_1`, …,
 * so `'w_'` classified every WALL as a hosted element and made every plan `recommended` —
 * i.e. it silently reinstated "always ask" through the back door, which is precisely what R6
 * point 5 forbids. A two-character prefix is not a kind signal; it is a coincidence waiting to
 * happen. Only prefixes that spell the kind are listed. When the contract grows a
 * kind-carrying change set, this function reads that instead and the constant goes away.
 */
const HOSTED_PREFIXES = ['door', 'window', 'opening'] as const;

const RANK: Record<ConfirmationRequirement, number> = { none: 0, recommended: 1, required: 2 };

const stronger = (a: ConfirmationRequirement, b: ConfirmationRequirement): ConfirmationRequirement =>
  RANK[a] >= RANK[b] ? a : b;

function looksHosted(id: string): boolean {
  const lower = id.toLowerCase();
  return HOSTED_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * THE policy function. Pure: same plan ⇒ same verdict, always, on every surface.
 *
 * Reads ONLY the plan. It does not consult the command type, a destructive-verb list, the
 * store, the user, or the clock — all of which would make the verdict un-reproducible from
 * the artefact the user was shown, and therefore un-bindable.
 */
export function computeConfirmationPolicy(plan: ConsequencePlan): ConfirmationPolicy {
  let requirement: ConfirmationRequirement = 'none';
  const reasons: ConfirmationReason[] = [];

  const raise = (level: ConfirmationRequirement, reason: ConfirmationReason): void => {
    requirement = stronger(requirement, level);
    reasons.push(reason);
  };

  // ── REQUIRED clauses ───────────────────────────────────────────────────────────
  if (plan.refused.length > 0) raise('required', 'plan_refuses_part_of_the_operation');
  if (plan.validation.violationsCreated.length > 0) raise('required', 'creates_rule_violations');
  if (plan.topology.removed.length > 0) raise('required', 'removes_existing_elements');

  // ── RECOMMENDED clauses ────────────────────────────────────────────────────────
  if (plan.undetermined.length > 0) raise('recommended', 'impact_partially_undetermined');
  if (plan.changed.some(looksHosted)) raise('recommended', 'changes_hosted_elements');
  if (plan.changed.length > BROAD_CHANGE_THRESHOLD) raise('recommended', 'broad_impact');

  return { requirement, reasons };
}

/**
 * The blocking half of the plan, extracted for display — every refusal and every created
 * violation, as SENTENCES THAT ALREADY CARRY THEIR NUMBERS.
 *
 * ── THE RULE THIS FUNCTION EXISTS TO OBEY ────────────────────────────────────────────
 * "Refusals carry BOTH numbers" is satisfied by SURFACING the producer's sentence, never by
 * re-deriving it here. `ROOM_MIN_AREA` already emits
 * `"Kitchen — area 6.4m² is below minimum 7m²"` (ConstraintEngine.ts), and `planOpeningRefit`
 * already emits refusals naming required-vs-available. A second formatter over the same
 * quantities is a second source of truth for a number the user will act on: it can round
 * differently, unit differently, or drift when the rule changes. So this function
 * concatenates and labels; it computes no quantity of its own.
 *
 * Returned as data (not HTML) so the certification gate can assert the DIGITS appear without
 * parsing a DOM, and so a non-DOM surface (chat, AI) renders the same sentences.
 */
export interface BlockingItem {
  /** `'refusal'` — the planner determined this cannot proceed; `'violation'` — a rule the move would break. */
  readonly kind: 'refusal' | 'violation';
  readonly elementId?: string;
  /** The producer's own sentence, verbatim, numbers included. NEVER re-formatted. */
  readonly sentence: string;
  /** For violations: the rule that produced it, so the user can name what stopped them. */
  readonly ruleId?: string;
}

export function blockingItems(plan: ConsequencePlan): readonly BlockingItem[] {
  const out: BlockingItem[] = [];
  for (const r of plan.refused) {
    out.push({
      kind: 'refusal',
      ...(r.elementId !== undefined ? { elementId: r.elementId } : {}),
      sentence: r.reason,
    });
  }
  for (const v of plan.validation.violationsCreated) {
    // A violation with NO message is a rule that reported without saying why. It is still
    // surfaced — dropping it would hide a blocker — but the absence is stated rather than
    // papered over with an invented sentence.
    out.push({
      kind: 'violation',
      ...(v.elementId !== undefined ? { elementId: v.elementId } : {}),
      ruleId: v.ruleId,
      sentence: v.message ?? `${v.ruleId} — the rule reported no message; the numbers behind it were not supplied by the rule.`,
    });
  }
  return out;
}
