/**
 * `ai-seam.ts` — the ONE interface through which the story card may reach AI,
 * and the bound that keeps "Research ALL elements" from fanning out over
 * 111,263 objects.
 *
 * §IFC-TREE-AI-SEAM (L-8360..L-8364) · C23 (provenance & AI audit).
 *
 * ---------------------------------------------------------------------------
 * ⛔ THERE IS NO SECOND AI CALL PATH, AND THIS FILE CANNOT MAKE ONE
 * ---------------------------------------------------------------------------
 * This module declares an INTERFACE and a POLICY. It contains no transport, no
 * fetch, no key handling, and no provider. The implementation is injected by
 * the editor's composition wiring and is expected to be whatever the BYOK lane
 * lands (bring-your-own-key routing through `packages/ai-host`).
 *
 * If that lane has not landed, the correct behaviour is `null` — the UI renders
 * the Ask affordances DISABLED with a stated reason. It does NOT fall back to a
 * direct call, because a fallback path is exactly the second path this is
 * forbidden to create.
 *
 * ---------------------------------------------------------------------------
 * ⚠ THE FAN-OUT BOUND — the founder's model is 111,263 elements
 * ---------------------------------------------------------------------------
 * The reference UI offers "Research ALL elements' unknowns". Shipped naively
 * against his model that is a six-figure request count. This module refuses to
 * describe such a run as available: a batch is REFUSED above
 * `MAX_BATCH_ELEMENTS`, and every batch must be confirmed against a stated
 * element count and a cost estimate.
 *
 * ⭐ AND WHEN NO COST ESTIMATE IS AVAILABLE, IT SAYS SO rather than inventing a
 * number. A fabricated "≈ $0.40" would be worse than no figure, because the
 * founder would act on it. `estimate: null` renders "cost not estimated".
 */

import type { SlotId } from './story-model.js';

/**
 * Hard ceiling on a single batch. Deliberately small.
 *
 * The reference's "ALL elements" button is not reproduced as an unbounded
 * action. The most this feature will ever launch in one go is a selection of
 * this size, named, counted and confirmed.
 */
export const MAX_BATCH_ELEMENTS = 50;

/** Sub-questions per element are capped by the slot count itself — at most 8. */
export const MAX_QUESTIONS_PER_ELEMENT = 8;

export interface AiCostEstimate {
  readonly elements: number;
  readonly questions: number;
  /** Currency-formatted, from the spend surface. NEVER computed here. */
  readonly formattedCost: string;
  readonly source: string;
}

export interface AiStoryRequest {
  readonly elementId: string;
  readonly slots: readonly SlotId[];
  /** Model facts handed as grounding, so the answer can cite what it saw. */
  readonly grounding: Readonly<Record<string, unknown>>;
}

/**
 * The injected port. ONE method for one element, ONE for a bounded batch, and
 * ONE pre-flight estimate. Nothing else.
 */
export interface AiStoryPort {
  /**
   * Answer open slots for ONE element. Implementations SHOULD issue a single
   * upstream call carrying all requested slots, not one call per slot.
   */
  answerOne(req: AiStoryRequest): Promise<ReadonlyMap<SlotId, string>>;

  /**
   * Pre-flight cost. Returning `null` is legitimate and means "this deployment
   * exposes no estimate" — the UI must then say cost is not estimated.
   */
  estimate(reqs: readonly AiStoryRequest[]): Promise<AiCostEstimate | null>;

  answerBatch(
    reqs: readonly AiStoryRequest[],
  ): Promise<ReadonlyMap<string, ReadonlyMap<SlotId, string>>>;
}

export type BatchDecision =
  | { readonly allowed: false; readonly reason: string }
  | {
      readonly allowed: true;
      readonly elements: number;
      readonly questions: number;
      /** ⭐ `null` means NOT ESTIMATED. It does not mean free. */
      readonly estimate: AiCostEstimate | null;
      /** The exact confirmation sentence. Always names the element count. */
      readonly confirmation: string;
    };

/**
 * Gate a batch BEFORE any call is made.
 *
 * ⭐ `estimate` being `null` does not block the run — it changes the sentence.
 * Refusing to proceed without a cost figure would be a gate whose "yes" branch
 * waits on a decision nobody has made; naming the absence is the honest move.
 */
export function gateBatch(
  reqs: readonly AiStoryRequest[],
  estimate: AiCostEstimate | null,
  port: AiStoryPort | null,
): BatchDecision {
  if (port === null) {
    return {
      allowed: false,
      reason:
        'AI is not wired in this build. The story card can still show everything the model knows; ' +
        'asking is unavailable until the bring-your-own-key route is connected.',
    };
  }
  if (reqs.length === 0) {
    return { allowed: false, reason: 'Nothing to ask — every slot in the selection is already answered.' };
  }
  if (reqs.length > MAX_BATCH_ELEMENTS) {
    return {
      allowed: false,
      reason:
        `Refused: ${reqs.length.toLocaleString()} elements exceeds the ${MAX_BATCH_ELEMENTS}-element cap for one run. ` +
        'Narrow the selection — there is deliberately no "research every element" action, because on a ' +
        '100k-element model that is a six-figure request count.',
    };
  }

  const questions = reqs.reduce(
    (n, r) => n + Math.min(r.slots.length, MAX_QUESTIONS_PER_ELEMENT),
    0,
  );
  const costLine = estimate
    ? `Estimated cost ${estimate.formattedCost} (${estimate.source}).`
    : '⚠ Cost is not estimated in this build — this run may incur charges that are not shown here.';

  return {
    allowed: true,
    elements: reqs.length,
    questions,
    estimate,
    confirmation:
      `Ask AI about ${reqs.length.toLocaleString()} ${reqs.length === 1 ? 'element' : 'elements'}, ` +
      `${questions.toLocaleString()} open ${questions === 1 ? 'question' : 'questions'}. ${costLine} ` +
      'Answers are AI-inferred and are labelled as such — they are not facts about the building.',
  };
}
