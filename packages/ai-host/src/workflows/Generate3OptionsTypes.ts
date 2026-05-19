// @pryzm/ai-host — Generate3Options types (S52 D1).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S52
//     lines 422-462 — generative fan-out workflow definition.
//   • SPEC-28 §3 — per-call ceiling $0.18; this workflow fan-outs
//     three $0.05 calls so the descriptor estimate is $0.15 with
//     headroom under the registry's hard cap.
//   • [strategic ADR-014] — generative workflows DO mutate state on
//     approval (proposedCommands non-empty), unlike PlanCritique.
//
// PURE — zero deps on @pryzm/command-bus, @pryzm/stores, THREE,
// DOM, or Node primitives. Bake-worker safe.

import type { CommandPayloadRef } from '../types.js';

/** A user-selected region of a plan view. The editor captures the
 *  rectangular world-space bounds + an architectural intent
 *  ("kitchen", "bathroom", "office") that the LLM uses as a hint. */
export interface PlanRegion {
  /** Stable id (often the view-id + selection seq) so the workflow
   *  can echo it back into preview URLs. */
  readonly id: string;
  /** World-space (mm) bounding rectangle: [minX, minY, maxX, maxY]. */
  readonly bounds: readonly [number, number, number, number];
  /** Architectural intent — free-form so plugins can introduce new
   *  intents without an ai-host change. Common values: "kitchen",
   *  "bathroom", "office", "lobby". */
  readonly intent: string;
  /** Optional list of currently visible elements in the region (their
   *  ids) so the LLM can reference them when proposing changes. */
  readonly visibleElementIds?: readonly string[];
}

/** The three style axes the generative workflow fans out across. Per
 *  spec lines 433-438 — three labelled options give the user a
 *  three-way A/B/C decision rather than an open-ended creativity
 *  question.  The labels are stable strings so the approval-queue UI
 *  can render them as tabs without an i18n round-trip. */
export type OptionStyle = 'minimal' | 'efficient' | 'generous';

/** All three option styles, in display order. The plane fans out
 *  exactly these in `Promise.all`. */
export const OPTION_STYLES: readonly OptionStyle[] = [
  'minimal',
  'efficient',
  'generous',
] as const;

/** Display label for an option style — used in approval-queue card
 *  titles. */
export const OPTION_STYLE_LABELS: Readonly<Record<OptionStyle, string>> = {
  minimal: 'Minimal',
  efficient: 'Efficient',
  generous: 'Generous',
};

/** A single generated option — what one of the three parallel relay
 *  calls produces. */
export interface GenerateOption {
  /** Style label for the option. */
  readonly style: OptionStyle;
  /** Commands the user would dispatch if they approve this option.
   *  Each command is an opaque `CommandPayloadRef` — the command-bus
   *  validates the payload at dispatch time. */
  readonly proposedCommands: ReadonlyArray<CommandPayloadRef>;
  /** Cost in USD of the relay call that produced this option. The
   *  parent action sums these for the total. */
  readonly costUsd: number;
  /** Optional preview image URL — the bake worker renders a 200×200
   *  thumbnail into the per-project storage and surfaces the public
   *  URL here. The mock impl supplies a `data:` URL placeholder. */
  readonly previewUrl?: string;
  /** Free-form short summary the LLM produces for the option ("3
   *  pendant lights, bench seating, low-back chairs"). */
  readonly summary?: string;
}

/** Result of one workflow run — discriminated on `status`. */
export type Generate3Result =
  | {
      readonly status: 'ok';
      /** Total cost across the three fan-out calls. */
      readonly totalCostUsd: number;
      /** The three generated options, in `OPTION_STYLES` order. */
      readonly options: readonly GenerateOption[];
    }
  | {
      readonly status: 'rejected';
      /** Human-readable reason — surfaced in the approval-queue UI. */
      readonly reason: string;
      /** If a refund was issued (post-call overshoot), the refunded
       *  amount in USD. */
      readonly refundedUsd?: number;
    };

/** Cost estimate the descriptor declares (USD).
 *  Three $0.05 fan-out calls + small orchestration headroom = $0.15.
 *  Sits comfortably under the SPEC-28 §3 $0.18 per-call ceiling that
 *  the registry enforces at registration time. */
export const GENERATE_3_OPTIONS_COST_USD_ESTIMATE = 0.15;

/** Per-option budget (USD). The fan-out cost-verification path uses
 *  this as the per-option soft cap; the hard cap is the workflow's
 *  $0.18 (= ceiling) total — anything over that triggers a refund
 *  per spec lines 444-447. */
export const PER_OPTION_BUDGET_USD = 0.05;

/** Hard post-call ceiling — the workflow refunds + rejects if
 *  `totalCostUsd > GENERATE_3_OPTIONS_HARD_CEILING_USD`. Set to the
 *  SPEC-28 §3 per-call ceiling. */
export const GENERATE_3_OPTIONS_HARD_CEILING_USD = 0.18;
