/**
 * armedSelectionSnapshot — §FIX-PLAN-TOOL-POINTER-UNREACHABLE (L-7004) · C103 §7 · C11.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE SELECTION THE ARCHITECT HAD **AT THE MOMENT THE TOOL WAS ARMED**.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Arming a creation tool DISABLES 3-D selection — `ToolManager.activateTool` has done
 * exactly that for every 3-D tool since forever (`selectionManager.setEnabled(false)`,
 * ToolManager.ts:551), and L-7003 extends the same rule to the PLAN-ONLY tools, which
 * previously left selection live so a click in the 3-D viewport picked a wall and
 * attached a transform gizmo while a create tool was armed. That was the founder's
 * report, verbatim: *"Balcony doesn't preview on wall — and I could not create it"*,
 * with `[WallTransform] gizmo aligned` in the same console.
 *
 * ⚠ BUT `setEnabled(false)` ALSO CALLS `unselectAll()`. And one plan tool depends on
 * the live selection: `PoolPlanToolHandler._resolveHostSlab` falls back to an
 * explicitly-selected slab when GEOMETRY cannot settle the host (overlapping slabs, or
 * a pool deliberately off-centre from the plate it is cut into). Disabling selection
 * without preserving that id would have CLOSED the founder's gizmo defect by silently
 * OPENING a pool host-resolution defect — one regression traded for another, which is
 * not a fix.
 *
 * So the id is snapshotted HERE, immediately BEFORE selection is suppressed, and the
 * pool handler consults it as its LAST fallback. This is `ToolsAreaLayout`'s
 * `_bySlabCapture` pattern (the wall's "By Slab" flow, which has the identical problem
 * and solved it the identical way) — reused rather than re-derived.
 *
 * ⛔ NOT A SECOND SELECTION MODEL. It holds ONE id, it is written at exactly one
 * moment (tool arm), and it is cleared when the tool is disarmed. A reader that wants
 * "what is selected NOW" must ask the SelectionManager; this module can only answer
 * "what WAS selected when the current tool was armed", and its name says so.
 */

import { trace } from '@opentelemetry/api';
import { projectScopeRegistry } from '@pryzm/core-app-model';

const _tracer = trace.getTracer('@pryzm/editor.armed-selection-snapshot', '0.1.0');

/** The element id selected at arm time, or `null` when nothing was. */
let _armedSelectionId: string | null = null;

/**
 * Record the element id that was selected at the instant a tool was armed.
 *
 * `null` is a real value meaning "nothing was selected" and is stored as such — it is
 * NOT the same as "never armed", which this module deliberately does not distinguish,
 * because no caller has a use for the difference and inventing a third state would be
 * a state nobody tests.
 *
 * P8: emits `pryzm.plan_tools.capture_armed_selection`.
 */
export function captureArmedSelection(id: string | null): void {
  _tracer.startActiveSpan('pryzm.plan_tools.capture_armed_selection', (span) => {
    try {
      _armedSelectionId = id && id.length > 0 ? id : null;
      span.setAttribute('pryzm.plan_tools.armed_selection_present', _armedSelectionId !== null);
    } finally {
      span.end();
    }
  });
}

/**
 * The element id selected when the current tool was armed, or `null`.
 *
 * P8: emits `pryzm.plan_tools.read_armed_selection`.
 */
export function armedSelectionId(): string | null {
  return _tracer.startActiveSpan('pryzm.plan_tools.read_armed_selection', (span) => {
    try {
      span.setAttribute('pryzm.plan_tools.armed_selection_present', _armedSelectionId !== null);
      return _armedSelectionId;
    } finally {
      span.end();
    }
  });
}

/** Forget the snapshot — called when the tool session ends. */
export function clearArmedSelection(): void {
  _armedSelectionId = null;
}

/** Test seam — one spec must never leak its snapshot into the next. */
export function __resetArmedSelectionForTests(): void {
  _armedSelectionId = null;
}

// ── §C13-CANDIDATE-OWNERS (L-8110) — project-switch owner ────────────────────
//
// `_armedSelectionId` is an ELEMENT ID. Carried across a switch it names an element
// that does not exist in the incoming project, so the next tool arming reads a
// dangling id — the `activeWallSystemType` shape already on the ADR-0298 debt list.
// `clearArmedSelection()` existed and was called only when a tool session ended,
// which a project switch is not.
projectScopeRegistry.register({
    scopeName: 'plantools.armedSelection',
    clear: () => clearArmedSelection(),
});
