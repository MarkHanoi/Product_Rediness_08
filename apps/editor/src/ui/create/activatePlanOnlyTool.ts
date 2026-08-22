/**
 * activatePlanOnlyTool — §FEAT-BALCONY-COMPOUND (L-5606) · C11 · C103 §7.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS FILE IS AXIS 3 OF THE POOL'S FOUR, GENERALISED.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A create-palette row normally activates a tool through
 * `runtime.tools.activate(family, mode)` — the 3-D `ToolManager`. That is correct for
 * every tool that HAS a `ToolManager` activator, and wrong for the ones that do not.
 *
 * ⚠ MEASURED, 2026-08-22 — and this is why the file exists:
 *
 *     grep -rniE "'pool'|\"pool\"|swimming" apps/editor/src/ui/ \
 *       | grep -viE "pool_table|pool-table"        -> 0 hits
 *
 * (The bare `grep -rni "pool" apps/editor/src/ui/` returns 65, ALL irrelevant — a
 * local variable named `pool` in `boundaryGuard.ts` and a `kave_pool_table` furniture
 * entry. Stating the pattern AND the exclusions is the point: an unqualified
 * substring count is a hypothesis, not a measurement, and this lane has already been
 * bitten by the inverse — a NUL byte and a barrel gap each made real code read as
 * absent.)
 *
 * So the swimming pool — a fully dispatchable command with a plan-tool handler in the
 * shared registry — has **no palette row at all**, and `PluginRegistry.ts`'s comment
 * claiming "the LANDSCAPE palette row" closed axis 3 is FALSE. The founder's original
 * report ("there is an element called swimming pool that at least is not able to
 * access via UI") is still live.
 *
 * The reason a naive row would not have helped is that `runtime.tools.activate('pool')`
 * has nothing to activate: `TOOL_MANAGER_TOOL_KEYS` has no `pool` key and no `balcony`
 * key, by design — both are plan-only, and both say so in `elementCreationMatrix.ts`.
 * A plan-only tool is armed by the PLAN OVERLAY, not by the ToolManager:
 *
 *     window.planViewToolOverlay.setActiveTool('balcony')   // main plan view
 *     window.svpPlanToolOverlay .setActiveTool('balcony')   // split-view plan pane
 *
 * Both overlays build their handler map from the single `planToolHandlerRegistry`
 * (L-73), so activating on every ATTACHED surface is the parity-preserving move.
 *
 * ─── ⛔ AND IT REFUSES OUT LOUD WHEN THERE IS NO PLAN SURFACE ──────────────────
 * If the user is in the 3-D viewport, there is no plan overlay attached and this
 * function activates NOTHING. Returning `false` silently is the founder's "Create
 * Stair" defect exactly — a control that reports activation and activates nothing.
 * So the caller is handed a REASON, and `activatePlanOnlyToolOrExplain()` puts it in
 * front of a person. C16 CA-18: name the reason AND the route back to success.
 *
 * ─── ⚠ A PRE-EXISTING PRIVATE TWIN, NAMED RATHER THAN SILENTLY DUPLICATED ──────
 * `ContextualEditBar._activatePlanTool` (`ContextualEditBar.ts:1224`) is the same
 * two-overlay loop, private to that class, used for move / rotate / align /
 * copy-place. It is NOT refactored here: that is a 1300-line file this lane does not
 * own and three sibling lanes are committing into the same tree. Collapsing the two
 * into this one function is recorded as L-5614 rather than left for the next reader
 * to discover as a surprise.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('@pryzm/editor.activate-plan-only-tool', '0.1.0');

/** The narrowest shape of a plan overlay this module needs. */
interface PlanOverlayLike {
  isAttached?: () => boolean;
  setActiveTool?: (tool: string) => void;
}

export interface PlanToolActivation {
  readonly ok: boolean;
  /** How many plan surfaces accepted the tool. `0` whenever `ok` is false. */
  readonly surfaces: number;
  /** Present iff `!ok`. Names the reason AND the route back to success (C16 CA-18). */
  readonly reason?: string;
}

/**
 * Arm a PLAN-ONLY creation tool on every attached plan surface.
 *
 * @param tool  a key from `PLAN_TOOL_KEYS` (`planToolHandlerRegistry.ts`)
 * @param label the human name for the refusal message
 *
 * P8: emits `pryzm.plan_tools.activate_plan_only`.
 */
export function activatePlanOnlyTool(tool: string, label: string): PlanToolActivation {
  return _tracer.startActiveSpan('pryzm.plan_tools.activate_plan_only', (span) => {
    try {
      const overlays: Array<PlanOverlayLike | undefined> = [
        (window as { planViewToolOverlay?: PlanOverlayLike }).planViewToolOverlay,
        (window as { svpPlanToolOverlay?: PlanOverlayLike }).svpPlanToolOverlay,
      ];

      let surfaces = 0;
      for (const ov of overlays) {
        if (ov?.isAttached?.() && typeof ov.setActiveTool === 'function') {
          ov.setActiveTool(tool);
          surfaces++;
        }
      }

      span.setAttribute('pryzm.plan_tools.tool', tool);
      span.setAttribute('pryzm.plan_tools.surfaces', surfaces);

      if (surfaces === 0) {
        return {
          ok: false,
          surfaces: 0,
          reason:
            `${label} is placed in a PLAN view, and no plan view is open. ` +
            `Open a floor plan (or switch to split view) and choose ${label} again.`,
        };
      }
      return { ok: true, surfaces };
    } finally {
      span.end();
    }
  });
}

/**
 * Arm a plan-only tool and, when it cannot be armed, PUT THE REASON IN FRONT OF THE
 * USER rather than in the console.
 *
 * ⭐ `console.warn` is not a refusal — it is a refusal nobody reads. Every palette row
 * for a plan-only tool goes through here, so a click always either arms the tool or
 * says why it did not.
 */
export function activatePlanOnlyToolOrExplain(tool: string, label: string): boolean {
  const result = activatePlanOnlyTool(tool, label);
  if (result.ok) return true;
  const reason = result.reason ?? `${label} could not be activated.`;
  // ⭐ THE APP'S OWN TOAST CHANNEL, not an invented one. `pryzm:toast` on the runtime
  // event bus is what `apartmentFromBoundary.ts` / `apartmentFromScratch.ts` already
  // emit ("Site store unavailable — restart the dev server", etc.), so this refusal
  // appears where every other user-facing refusal appears rather than in a second
  // notification system nobody styled. `alert` is deliberately NOT a fallback: it
  // blocks the thread and reads as a crash. The console line is the floor, and it is
  // reached only when no runtime bus exists at all (very early boot, tests).
  const events = (window as { runtime?: { events?: { emit?: (k: string, p: unknown) => void } } })
    .runtime?.events;
  if (typeof events?.emit === 'function') {
    events.emit('pryzm:toast', { message: reason, severity: 'error' });
  } else {
    console.warn(`[activatePlanOnlyTool] ${reason}`);
  }
  return false;
}
