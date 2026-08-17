/**
 * §B.4 — the plan-only view of a `ConsequencePreviewProvider`, for suites whose subject is
 * the PLANNER'S OUTPUT rather than the preview entry point's outcome type.
 *
 * `ConsequencePreviewService.preview()` used to return `ConsequencePlan | null`, where the
 * `null` collapsed four causes (C78 §8.8 / U-INV-2). It now returns a typed
 * {@link PreviewOutcome}. The suites in this directory were written against the old shape
 * and assert things like `plan!.planId` and `plan!.topology.removed` — assertions about
 * what the PLANNER computed, which the seam change did not alter.
 *
 * This adapter restores exactly the old surface for them: the `planned` arm unwraps to its
 * plan, every `undetermined` arm maps to `null`. That mapping is deliberately LOSSY, and
 * that is correct here — these files are not the control for the typed seam. The control
 * for that is `apps/editor/src/engine/__tests__/ConsequencePreviewOverlayWiring.spec.ts`,
 * which asserts the reason reaches the user; and the bar-3 gate
 * (`check-relationship-determination`), which reads the entry-point signature directly.
 *
 * ⚠ Do NOT reach for this in new tests. A new suite should assert on the outcome union —
 * `kind === 'undetermined'` plus its `reason` — because collapsing to `null` is precisely
 * the defect B.4 removed. This exists to keep pre-existing plan assertions honest across
 * the change, not to make the old shape available going forward.
 *
 * @file apps/editor/__tests__/_previewPlanAdapter.ts
 *   Named with a leading underscore and no `.test.ts` suffix so
 *   `apps/editor/vitest.config.ts`'s `__tests__/**\/*.test.ts` glob does not collect it.
 */

import type { ConsequencePlan } from '@pryzm/command-bus';
import type {
  ConsequencePreviewProvider,
  PreviewCommand,
} from '../src/engine/consequence/ConsequencePreviewService';

/** The pre-B.4 surface: a plan, or `null` for every non-planned outcome. */
export interface PlanOnlyPreviewProvider {
  preview(command: PreviewCommand): Promise<ConsequencePlan | null>;
}

/** Wrap a real provider so `preview()` yields the plan, or `null` when undetermined. */
export function planOnly(service: ConsequencePreviewProvider): PlanOnlyPreviewProvider {
  return {
    async preview(command: PreviewCommand): Promise<ConsequencePlan | null> {
      const outcome = await service.preview(command);
      return outcome.kind === 'planned' ? outcome.plan : null;
    },
  };
}
