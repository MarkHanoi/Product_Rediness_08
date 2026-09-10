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
import { DrawingModeBar } from '../DrawingModeBar';
import { creationModes } from '@app/engine/views/plantools/elementCreationMatrix';
import {
  setActivePoolDrawMode,
  resolveActivePoolDrawMode,
} from '@app/engine/views/plantools/activePoolDrawMode';
import {
  setActiveBalconyDrawMode,
  resolveActiveBalconyDrawMode,
} from '@app/engine/views/plantools/activeBalconyPlacement';
// §FIX-PLAN-TOOL-FINISH-GESTURE (L-9302) — the boundary line's mode store. It had a
// live handler arm for all six modes and NO production writer; see PLAN_ONLY_MODE_STORES.
import {
  setActiveBoundaryLineDrawMode,
  resolveActiveBoundaryLineDrawMode,
} from '@app/engine/views/plantools/activeBoundaryLineDrawMode';
// C116 §11 / ADR-0384 — the siteworks GESTURE store. The ROLE half lives in the same
// module and is written by the rail entry, not by the mode strip; see PLAN_ONLY_MODE_STORES.
import {
  setActiveSiteworksDrawMode,
  resolveActiveSiteworksDrawMode,
} from '@app/engine/views/plantools/activeSiteworksAuthoring';
import {
  captureArmedSelection,
  clearArmedSelection,
} from '@app/engine/views/plantools/armedSelectionSnapshot';


const _tracer = trace.getTracer('@pryzm/editor.activate-plan-only-tool', '0.1.0');

/** The narrowest shape of a plan overlay this module needs. */
interface PlanOverlayLike {
  isAttached?: () => boolean;
  setActiveTool?: (tool: string) => void;
  /** §FIX-PLAN-TOOL-FINISH-GESTURE (L-9303) — uncommitted stroke on THIS surface. */
  hasActiveStroke?: () => boolean;
}

/** Both plan surfaces, in the order `activatePlanOnlyTool` arms them. */
function planOverlays(): Array<PlanOverlayLike | undefined> {
  return [
    (window as { planViewToolOverlay?: PlanOverlayLike }).planViewToolOverlay,
    (window as { svpPlanToolOverlay?: PlanOverlayLike }).svpPlanToolOverlay,
  ];
}

/**
 * §FIX-PLAN-TOOL-FINISH-GESTURE (L-9303) — is there an uncommitted stroke on ANY
 * attached plan surface?
 *
 * ⭐ THE QUESTION ESCAPE HAS TO ASK, AND THE ONE IT WAS NOT ASKING. A plan-only tool is
 * armed on EVERY attached plan surface (see `activatePlanOnlyTool` above) and each
 * surface holds its OWN handler instance from the shared registry, so an in-progress
 * outline lives in exactly one of them. Both overlays listen for Escape on `window` in
 * the CAPTURE phase; whichever runs first used to decide the two-stage gesture from its
 * own handler alone. When the main plan surface is also up, that first reader is the
 * EMPTY one — it reports "no stroke", stage 2 runs, and the architect's half-drawn pool
 * in the other pane is disarmed. Asking every surface makes the answer a property of the
 * TOOL, which is what the two-stage rule was always about.
 */
export function anyPlanSurfaceHasStroke(): boolean {
  for (const ov of planOverlays()) {
    try {
      if (ov?.isAttached?.() && ov.hasActiveStroke?.() === true) return true;
    } catch {
      /* an overlay mid-teardown must never take Escape with it */
    }
  }
  return false;
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
 * Put a sentence in front of a PERSON.
 *
 * ⚠ CORRECTED 2026-08-22 (L-7005) — THIS FUNCTION USED TO EMIT `pryzm:toast` AND
 * NOTHING ELSE, AND `pryzm:toast` HAS NO SUBSCRIBER.
 *
 *     rg "on\('pryzm:toast'" --glob '**\/*.ts'      ->  0 matches
 *     rg "'pryzm:toast'"     --glob '**\/*.ts'      ->  40+ matches, ALL emitters
 *
 * The typed event exists (`runtime-composer/src/types.ts:2055` declares it, with the
 * comment *"Replaces the TASK-15 `pryzm:toast` CustomEvent"*) and forty-odd sites emit
 * it — so the channel reads as live at every call site and is dead at the far end. The
 * previous revision's own header called `console.warn` *"a refusal nobody reads"*; the
 * channel it moved to was a refusal nobody CAN read, which is strictly worse because it
 * looks fixed. That is this repo's authored-but-unwired shape, and the reason C01 §6
 * rule 6 asks for ABSENT-vs-UNREACHABLE before anything else.
 *
 * ⭐ THE LIVE CHANNEL IS `runtime.toasts` — `buildToastsSlot()` in
 * `packages/runtime-composer/src/ToastController.ts`, which renders real DOM through
 * `showAppToast` and is what `initUI.ts`'s own `toast(...)` helper uses for every IFC /
 * Rhino / export message the user actually sees. So this writes THERE first, keeps the
 * `pryzm:toast` emit as a compat signal for whoever eventually subscribes, and falls
 * back to the console only when no runtime exists at all (very early boot, tests).
 */
function notifyUser(message: string, kind: 'info' | 'error'): void {
  const rt = (
    window as {
      runtime?: {
        toasts?: { show?: (m: string, k?: string, d?: number) => unknown };
        events?: { emit?: (k: string, p: unknown) => void };
      };
    }
  ).runtime;
  let delivered = false;
  try {
    if (typeof rt?.toasts?.show === 'function') {
      rt.toasts.show(message, kind, kind === 'error' ? 7000 : 4000);
      delivered = true;
    }
  } catch {
    /* a toast that throws must never take the palette click with it */
  }
  // Compat: keep the typed event flowing for any future subscriber. Never the ONLY leg.
  try {
    rt?.events?.emit?.('pryzm:toast', { message, severity: kind });
  } catch {
    /* same */
  }
  if (!delivered) console.warn(`[activatePlanOnlyTool] ${message}`);
}

/**
 * §FIX-PLAN-TOOL-FINISH-GESTURE (L-9301) — put a plan-tool REFUSAL in front of a person.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ A REFUSAL PAINTED ON THE PREVIEW CANVAS IS ERASED ~16 ms LATER.
 * ═══════════════════════════════════════════════════════════════════════════════
 * `PoolPlanToolHandler._refuse` and `BoundaryLinePlanToolHandler._refuse` each draw
 * their sentence on the overlay canvas — which is the right SECOND channel and was the
 * only one. `SvpPlanToolOverlay._onMouseMove` (and its main-plan twin) begins EVERY
 * pointer sample with `ctx.clearRect(...)` and then calls the handler, whose points
 * `_refuse()` has just reset to zero — so the handler redraws the idle hint, or nothing
 * at all, over the reason. MEASURED, `planOnlyToolFinishGesture.spec.ts` A-4: after one
 * `mousemove` the on-screen text was `"Pool · Click the first corner"` and the refusal
 * was gone.
 *
 * ⛔ THAT IS THE WHOLE OF *"the swimming pool would not create"*. The pool refuses when
 * there is no slab under the outline (`CreatePoolHandler.canExecute`: *"a pool with no
 * slab to cut into is not a pool; it is a hole in the air"*), which is CORRECT — and the
 * architect saw a completed rectangle, then silence. C11 §7.6, "a dead click behind a
 * perfect preview", with the reason computed and thrown away.
 *
 * ⭐ `runtime.toasts` IS THE LIVE CHANNEL, and this is exactly what L-7005 established:
 * `pryzm:toast` had 40+ emitters and ZERO subscribers, while `buildToastsSlot()` renders
 * real DOM through `showAppToast`. Handlers reuse it here rather than each growing its
 * own notification ladder.
 */
export function notifyPlanToolRefusal(message: string): void {
  notifyUser(message, 'error');
}

/**
 * §FIX-PLAN-TOOL-FINISH-GESTURE (L-9305) — confirm, BY NAME, that the element exists.
 *
 * ⛔ THIS IS NOT DECORATION, AND IT IS NOT NOISE ADDED TO EVERY TOOL. It is scoped to
 * the two families that today create something a person CANNOT SEE, and it is there
 * because the alternative is indistinguishable from the founder's bug report.
 *
 * ⚠ MEASURED 2026-08-23, and it is the finding that reorders this whole lane:
 *   • `pool.create` has **no `case` in `CommandEventBridge`** — it falls to `default:`,
 *     so no `wall.created` / `slab.created` reaches the legacy mirrors in `initTools`
 *     and no mesh is ever built. A repo-wide search for `PoolMeshBuilder` /
 *     `WaterBuilder` returns ZERO: there is no render path AND no render asset.
 *   • `boundaryLine.create` falls to the same `default:`, and is dropped even more
 *     quietly — the L-7825 compound detector requires `patch.path.length === 2` and
 *     more than one store, and a single-store family satisfies neither, so it warns
 *     nothing. `boundaryLineSolid()` exists and has zero production callers.
 *
 * So both commands succeed, write real records, take one undo entry — and put zero
 * pixels anywhere. Until the bridge cases land, a confirmation is the ONLY signal that
 * separates "created" from "silently refused", and shipping the two apart is what
 * turned a correct refusal into three founder reports. C11 §7.6.
 */
export function notifyPlanToolCreated(message: string): void {
  notifyUser(message, 'info');
}

/**
 * Arm a plan-only tool FOR A PERSON: arm it, make it visible, defend it, and when it
 * cannot be armed put the reason in front of them rather than in the console.
 *
 * ⭐ THIS IS THE FUNCTION THE FOUNDER'S THREE REPORTS ALL LAND ON. Arming alone was
 * never the problem — `activatePlanOnlyTool()` above already worked, and a pointer
 * event dispatched on the plan pane already reached the handler and already dispatched
 * `balcony.create` (measured, `pointerReachesArmedHandler.spec.ts` ARM A). What was
 * missing is everything AROUND the arm, and it is all in `beginPlanOnlyToolSession`:
 * the mode strip, the suppression of 3-D selection, and one sentence saying WHERE to
 * click. See that function's header for the measurements.
 */
export function activatePlanOnlyToolOrExplain(tool: string, label: string): boolean {
  const result = activatePlanOnlyTool(tool, label);
  if (!result.ok) {
    notifyUser(result.reason ?? `${label} could not be activated.`, 'error');
    return false;
  }
  beginPlanOnlyToolSession(tool, label);
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE SESSION — §FIX-PLAN-TOOL-POINTER-UNREACHABLE (L-7000..L-7005)
// ═══════════════════════════════════════════════════════════════════════════════
//
// ⭐ THE FOUNDER'S THREE REPORTS, AND WHAT EACH ONE MEASURED TO.
//
//   "Balcony doesn't preview on wall — and I could not create it."
//   "Swimming pool — I did not have the mode tool ... I created a few lines but the
//    creation did not trigger."
//   "Lift — it should be under Architecture, but could not see it!"
//
// His console carried the answer to the first one, and it is NOT the one the brief for
// this lane proposed. Both of the brief's hypotheses were tested:
//
//   H1 "WRONG SURFACE — the handler arms on the split-view pane while he clicks the
//       3-D viewport."   ⭐ CONFIRMED, and it is the whole of the balcony report.
//       `[PickResolver] ... strategy=gpu-pick` and `[WallTransform] gizmo aligned` are
//       emitted by `packages/input-host/src/SelectionManager.ts` — the 3-D picker.
//       A plan-only tool cannot see a click that lands in the 3-D viewport, ever.
//
//   H2 "SELECTION WINS THE EVENT — both are listening and the pick path consumes the
//       click first."    ⚠ REFUTED AS STATED, and the refutation matters. The two
//       surfaces are NOT racing: `SvpPlanToolOverlay._onMouseDown` is bound to the SVP
//       CANVAS and `SelectionManager` to the 3-D canvas, so exactly one of them sees
//       any given click. Measured at the pointer layer
//       (`pointerReachesArmedHandler.spec.ts` ARM A): with `balcony` armed, ONE
//       synthetic `mousedown` on the plan pane produced exactly ONE `balcony.create`.
//       The handler was never the defect.
//
//       ⭐ BUT ITS SECOND SENTENCE — *"a tool being armed must suppress ordinary
//       selection"* — IS RIGHT, and is a REAL defect with a different mechanism.
//       `ToolManager.activateTool` disables selection for every 3-D tool
//       (`selectionManager.setEnabled(false)`, ToolManager.ts:551). A plan-only tool
//       is armed by the OVERLAY and never touches the ToolManager, so selection stayed
//       LIVE and a click in the 3-D viewport picked a wall and attached a gizmo — the
//       exact console the founder pasted. That is closed by `suppressSelection()`.
//
// ⭐ AND THE REPEATED `Handler activated: balcony` (x11, x8, x5 …) IS ITS OWN FINDING,
// with TWO measured causes, neither of which is "a pointer event re-arms the tool":
//
//   (a) `setActiveTool()` had no idempotence guard, so every palette click re-armed —
//       tearing the handler down and rebuilding it. Closed in both overlays.
//   (b) ⛔ THE SERIOUS ONE — L-7002. Both overlays subscribe to `toolManager`, and the
//       subscription unconditionally does `_deactivateHandler(); _activateHandler(tm's
//       tool)`. A plan-only tool is invisible to the ToolManager, so THE VERY NEXT
//       ToolManager notification SILENTLY DISARMED IT. Measured before the fix:
//       `isPlacing()` true, then `notify('none')`, then false. A user whose tool
//       disarms itself clicks the palette again — which is precisely the x11 shape.
//
// WHAT A SESSION OWNS, AND WHY IT IS ONE OBJECT RATHER THAN FIVE CALL SITES:
//   1. the mode strip                — so the pool's five shapes exist on screen
//   2. suppression of 3-D selection  — so an armed create tool cannot select a wall
//   3. the armed-selection snapshot  — so (2) does not break the pool's host override
//   4. one sentence naming the PANE  — so "I could not create it" has an answer
//   5. teardown on Escape / on a real 3-D tool taking over — so none of it leaks
//
// Every palette row for a plan-only tool already routes through
// `activatePlanOnlyToolOrExplain`, so wiring the session there covers `CreateRailPanel`
// AND `CreatePanelLayout` — both live create surfaces (L-1380) — in one place instead
// of two that drift.

/**
 * The surface-independent mode store each plan-only family reads on every click.
 *
 * ⭐ THE POOL'S BAR IS THE FOUNDER'S "I did not have the mode tool", AND THE STORE WAS
 * ALREADY THERE. Measured 2026-08-22, before this table existed: a repo-wide search for
 * `setActivePoolDrawMode` / `setActiveBalconyDrawMode` returned the definitions, the
 * handlers' READS, and NOT ONE production WRITER.
 *
 * So `activePoolDrawMode.ts` declared six modes, `PoolPlanToolHandler` had a live arm
 * for all six, `ELEMENT_CREATION_MATRIX` declared them for a bar to render — and
 * nothing on any screen could set one. `ToolsAreaLayout` mounts a `DrawingModeBar` for
 * slab, railing and stair-path only, and the pool and balcony are not activated through
 * `service.activate*`, so they were never going to acquire one there. This is the
 * `creationShapes()`-with-no-callers shape PERF13 measured on the stair, one family over.
 *
 * ⛔ NO NEW MODE VOCABULARY IS MINTED HERE. The ids come from `creationModes(tool)` —
 * the same declaration the matrix spec asserts against — and the writers are the
 * existing per-family stores, which validate and IGNORE an unknown id rather than
 * storing a mode no handler has an arm for.
 */
const PLAN_ONLY_MODE_STORES: Readonly<
  Record<
    string,
    { readonly write: (id: string) => void; readonly read: () => string; readonly label: string }
  >
> = {
  pool: { write: setActivePoolDrawMode, read: resolveActivePoolDrawMode, label: 'Pool:' },
  balcony: { write: setActiveBalconyDrawMode, read: resolveActiveBalconyDrawMode, label: 'Balcony:' },
  // ⭐⭐ §FIX-PLAN-TOOL-FINISH-GESTURE (L-9302) — THE BOUNDARY LINE'S STRIP, WHICH
  // NEVER EXISTED. This table is what mounts the shared `DrawingModeBar`, and
  // `boundary-line` was not in it — so `beginPlanOnlyToolSession` found no store, built
  // no bar, and FIVE of the tool's six declared modes were unreachable from any screen.
  //
  // ⚠ MEASURED, 2026-08-23, before this row:
  //     grep -rn "setActiveBoundaryLineDrawMode" apps packages plugins
  //       -> the DEFINITION, the `__resetForTests` helper, and FOUR CALLS,
  //          ALL FOUR INSIDE `boundaryLinePointerReach.spec.ts`.
  //     Production writers: ZERO.
  // So every boundary line the founder could draw shipped `linear`, and the spec that
  // proves `rectangular` works proves it by calling the setter the UI does not call.
  // That is the same shape as the header's own `grep -> 0 hits` for the pool's palette
  // row (L-5690) and as `activePoolDrawMode`'s "not one production WRITER" note — the
  // THIRD recurrence in this family. The row is what stops it being a fourth.
  //
  // ⛔ NO NEW VOCABULARY. `creationModes('boundary-line')` is still the one declaration;
  // this only names the store the bar writes into.
  'boundary-line': {
    write: setActiveBoundaryLineDrawMode,
    read: resolveActiveBoundaryLineDrawMode,
    label: 'Boundary:',
  },
  // ⭐ C116 §11 / ADR-0384 — THE SITEWORKS STRIP, LANDED WITH THE TOOL RATHER THAN
  // AFTER IT. The boundary line's row above is the record of what happens otherwise:
  // it shipped six declared modes, a handler with a live arm for all six, and NO row
  // here — so no strip was mounted and five of the six were unreachable from any
  // screen for a day. That was the THIRD recurrence in this family (pool, balcony,
  // boundary line). This row is written in the same commit as
  // `SiteworksPlanToolHandler` so there is never a window in which it is the fourth.
  //
  // ⛔ NO NEW VOCABULARY. `creationModes('siteworks')` is still the one declaration;
  // this only names the store the bar writes into.
  //
  // ⚠ THE STRIP CARRIES THE GESTURE, NOT THE ROLE. Road / parking / pedestrian is the
  // SECOND axis (`shapes` in the matrix row) and is set by the rail entry that armed
  // the tool, exactly as the wall's system type is. Folding it into this one-axis bar
  // is the §STAIR-TWO-AXES defect.
  siteworks: {
    write: setActiveSiteworksDrawMode,
    read: resolveActiveSiteworksDrawMode,
    label: 'Siteworks:',
  },
};

/**
 * §FIX-PLAN-TOOL-FINISH-GESTURE (L-9302) — the mode store the STRIP writes for a tool,
 * or `undefined` when the tool has none (and therefore gets no strip).
 *
 * ⭐ EXPOSED SO A TEST CAN DRIVE THE CHANNEL A PERSON HAS, not the setter underneath it.
 * `boundaryLinePointerReach.spec.ts` set `rectangular` by calling
 * `setActiveBoundaryLineDrawMode` directly and was green, while this table had no
 * `boundary-line` row — so no strip was ever mounted and the mode was unreachable on
 * every screen. A census driven through THIS function fails when the row is missing,
 * which is the difference between proving the store works and proving the tool does.
 */
export function planOnlyToolModeStore(
  tool: string,
): { readonly write: (id: string) => void; readonly read: () => string; readonly label: string } | undefined {
  return PLAN_ONLY_MODE_STORES[tool];
}

/** One live session at a time — arming a second tool ends the first. */
interface PlanOnlySession {
  readonly tool: string;
  readonly bar: DrawingModeBar | null;
  readonly teardown: readonly (() => void)[];
}

let _session: PlanOnlySession | null = null;

/** The narrowest shape of the 3-D selection manager this module needs. */
interface SelectionManagerLike {
  setEnabled?: (enabled: boolean) => void;
  getSelectedId?: () => string | null;
  selectedObject?: { userData?: { id?: string } };
}

function selectionManager(): SelectionManagerLike | undefined {
  return (window as { selectionManager?: SelectionManagerLike }).selectionManager;
}

/**
 * Suppress 3-D selection for the duration of the session, and return the restore.
 *
 * ⚠ THE SNAPSHOT IS TAKEN **BEFORE** THE SUPPRESSION, and that order is load-bearing:
 * `SelectionManager.setEnabled(false)` calls `unselectAll()` on the way down
 * (SelectionManager.ts:1084), so reading the selection afterwards returns nothing.
 * `PoolPlanToolHandler` uses an explicitly-selected slab as its host OVERRIDE, so
 * closing the gizmo defect without this line would have opened a pool defect — see
 * `armedSelectionSnapshot.ts` for the full argument.
 */
function suppressSelection(): () => void {
  const sm = selectionManager();
  const selected = sm?.selectedObject?.userData?.id ?? sm?.getSelectedId?.() ?? null;
  captureArmedSelection(selected);
  if (typeof sm?.setEnabled !== 'function') return (): void => clearArmedSelection();
  try {
    sm.setEnabled(false);
  } catch {
    /* a selection manager mid-teardown must not take the palette click with it */
  }
  return (): void => {
    clearArmedSelection();
    try {
      selectionManager()?.setEnabled?.(true);
    } catch {
      /* same */
    }
  };
}

/**
 * Begin a plan-only tool session. Idempotent per tool: re-arming the SAME tool refreshes
 * the strip rather than tearing the session down and rebuilding it, so a second palette
 * click cannot destroy a half-drawn pool outline (§T-B1, and cause (a) of the repeated
 * activation described above).
 *
 * P8: emits `pryzm.plan_tools.begin_plan_only_session`.
 */
export function beginPlanOnlyToolSession(tool: string, label: string): void {
  _tracer.startActiveSpan('pryzm.plan_tools.begin_plan_only_session', (span) => {
    try {
      span.setAttribute('pryzm.plan_tools.tool', tool);
      if (_session?.tool === tool) {
        span.setAttribute('pryzm.plan_tools.session_reused', true);
        const current = PLAN_ONLY_MODE_STORES[tool]?.read();
        if (current) _session.bar?.setMode(current);
        return;
      }
      endPlanOnlyToolSession();

      const teardown: Array<() => void> = [suppressSelection()];

      // ── The mode strip ────────────────────────────────────────────────────────
      // The SHARED `DrawingModeBar` — the wall's control, the same `.wdh-*` styles,
      // driven by the family's OWN declared modes. Never a look-alike, and never a
      // list re-typed here: `creationModes(tool)` is the single declaration.
      let bar: DrawingModeBar | null = null;
      const store = PLAN_ONLY_MODE_STORES[tool];
      const modes = creationModes(tool);
      if (store && modes.length > 0) {
        bar = new DrawingModeBar();
        bar.show({
          label: store.label,
          modes,
          initialMode: store.read(),
          // ⛔ WRITE THE STORE, NEVER RE-ARM THE TOOL. Re-activating tears the handler
          // down and with it the vertices already placed — the whole reason
          // `DrawingModeBar` exists (§FEAT-PERSISTENT-MODE-BAR). Both handlers re-read
          // their store on every click and mousemove, so a switch applies to the very
          // next click and the in-progress outline survives.
          onSelect: (id) => store.write(id),
        });
        const b = bar;
        teardown.push((): void => b.dismiss());
      }

      // ── Escape ends the session ───────────────────────────────────────────────
      // ⭐ CORRECTED 2026-08-23 (§FIX-PLAN-TOOL-ESCAPE-RUNAWAY, L-7800). This listener
      // used to be the WHOLE of Escape, and it tore down the session CHROME while
      // leaving the TOOL ARMED — see `endPlanOnlyToolSession`'s header for the
      // measured consequence and the founder report that named it.
      //
      // The precise decision now lives in the OVERLAY (`planOnlyToolEscape`), because
      // the overlay is the only surface that can see a half-drawn stroke BEFORE
      // `cancel()` wipes it. This listener is the FALLBACK for the case the overlay
      // cannot serve: Escape pressed while the pointer is outside the plan pane, where
      // both overlays' `_onKeyDown` return early on their focus guard and nothing else
      // would put the tool away.
      //
      // ⚠ THE MARKER IS LOAD-BEARING, AND SO IS THE PHASE. The overlays listen on
      // `window` in the CAPTURE phase and are registered at attach — i.e. BEFORE this
      // session exists — so they always run first and always stamp the event before
      // this bubble-phase listener sees it. Without the marker a mid-stroke Escape
      // would be cancelled by the overlay (stroke gone, `hasActiveStroke()` now false)
      // and then disarmed by this listener reading that same false — collapsing the
      // two-stage gesture into one and destroying the pool's half-drawn outline.
      const onKey = (e: KeyboardEvent): void => {
        if (e.key !== 'Escape') return;
        if ((e as { __pryzmPlanToolEscape?: boolean }).__pryzmPlanToolEscape) return;
        // No overlay claimed it, so no overlay held a stroke this Escape could cancel.
        planOnlyToolEscape(false);
      };
      window.addEventListener('keydown', onKey);
      teardown.push((): void => window.removeEventListener('keydown', onKey));

      // ── A REAL 3-D tool taking over ends the session ──────────────────────────
      // `ToolManager.activateTool` fires `tool:activated` and disables selection
      // itself, so the session must stand down rather than fight it for the flag.
      const onToolActivated = (): void => endPlanOnlyToolSession();
      window.addEventListener('tool:activated', onToolActivated);
      teardown.push((): void => window.removeEventListener('tool:activated', onToolActivated));

      _session = { tool, bar, teardown };
      span.setAttribute('pryzm.plan_tools.session_reused', false);
      span.setAttribute('pryzm.plan_tools.mode_bar', bar !== null);

      // ── ⭐ THE SENTENCE THAT ANSWERS "I could not create it" ───────────────────
      // The founder armed the balcony on the SPLIT-VIEW PLAN PANE and clicked in the
      // 3-D viewport. Nothing on screen said which pane owned the tool, and a
      // plan-only tool has no 3-D arm to fall back to, so the click could only ever
      // become a wall selection. Naming the surface is the cheapest thing that makes
      // that gesture impossible to get wrong twice.
      notifyUser(`${label} is placed in the PLAN pane — move the pointer there and click.`, 'info');
    } finally {
      span.end();
    }
  });
}

/**
 * Disarm the plan-only tool on every attached plan surface.
 *
 * ⭐ §FIX-PLAN-TOOL-ESCAPE-RUNAWAY (L-7801) — THE EXACT INVERSE OF
 * `activatePlanOnlyTool`, and it did not exist. Arming had a function; putting the
 * tool away had none, and that asymmetry is the whole defect: `endPlanOnlyToolSession`
 * unwound the CHROME and left the HANDLER armed, so the very next click in the plan
 * pane created another element.
 *
 * `setActiveTool('none')` is the disarm both overlays already implement
 * (`_deactivateHandler()`, `_activeTool = 'none'`, `_programmaticTool = false`), and
 * `'none'` is not in `ACTIVE_TOOL_KEYS`, so `_onMouseEnter`'s first line returns before
 * it can re-activate anything. That is what closes the founder's re-arm: his log shows
 * `Handler activated: balcony` AFTER the Escape, which is `_onMouseEnter` rebuilding a
 * handler for a tool that was never disarmed.
 *
 * @returns how many plan surfaces were disarmed.
 *
 * P8: emits `pryzm.plan_tools.disarm_plan_only`.
 */
export function disarmPlanOnlyTool(): number {
  return _tracer.startActiveSpan('pryzm.plan_tools.disarm_plan_only', (span) => {
    try {
      const overlays: Array<PlanOverlayLike | undefined> = [
        (window as { planViewToolOverlay?: PlanOverlayLike }).planViewToolOverlay,
        (window as { svpPlanToolOverlay?: PlanOverlayLike }).svpPlanToolOverlay,
      ];
      let surfaces = 0;
      for (const ov of overlays) {
        if (ov?.isAttached?.() && typeof ov.setActiveTool === 'function') {
          try {
            ov.setActiveTool('none');
            surfaces++;
          } catch {
            /* one overlay mid-teardown must never strand the other */
          }
        }
      }
      span.setAttribute('pryzm.plan_tools.surfaces', surfaces);
      return surfaces;
    } finally {
      span.end();
    }
  });
}

/**
 * THE ESCAPE DECISION FOR A PLAN-ONLY TOOL — two stages, the CAD convention.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THE FOUNDER: *"Balcony works — but it doesn't have an ESC option. It will create
 * balconies indefinitely."* MEASURED IN HIS OWN LOG: element count 14 → 19 → 24 → 29,
 * five members per balcony, three balconies he did not want.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Stage 1 — THERE IS A HALF-DRAWN STROKE: Escape cancels the stroke and the tool STAYS
 * ARMED. That is `PlanToolHandler.cancel()`'s documented contract verbatim (*"Handler
 * resets its multi-step state but stays active (tool remains selected)"*) and it is
 * what the pool's multi-point outline needs — a mis-clicked vertex must not cost the
 * architect the tool.
 *
 * Stage 2 — THERE IS NOTHING TO CANCEL: Escape PUTS THE TOOL AWAY. For the balcony and
 * the lift — single-click tools that never hold a stroke — stage 2 is the only stage,
 * which is exactly why the founder experienced Escape as having no effect at all.
 *
 * ⚠ `hadActiveStroke` MUST BE SAMPLED BEFORE `cancel()` RUNS. The caller is the
 * overlay's own Escape branch for precisely that reason: `cancel()` resets `_points`,
 * so anything asking afterwards reads a false negative and collapses the two stages
 * into one. This is not a theoretical ordering — both overlays register their keydown
 * listener on `window` in the CAPTURE phase at attach time, so they are guaranteed to
 * run before any bubble-phase listener a session installs later.
 *
 * ⛔ A NO-OP WHEN NO PLAN-ONLY SESSION IS LIVE, and that guard is the point. Wall,
 * slab, roof and every other plan tool is armed through the 3-D `ToolManager`, which
 * owns its own Escape; disarming those here would make Escape mean two different things
 * for two families of tool. Only a tool the ToolManager cannot own is disarmed here.
 *
 * @param hadActiveStroke whether the armed handler held uncommitted stroke state
 *        immediately BEFORE `cancel()` ran.
 * @returns true iff the tool was put away (stage 2).
 *
 * P8: emits `pryzm.plan_tools.escape`.
 */
export function planOnlyToolEscape(hadActiveStroke: boolean): boolean {
  return _tracer.startActiveSpan('pryzm.plan_tools.escape', (span) => {
    try {
      span.setAttribute('pryzm.plan_tools.had_stroke', hadActiveStroke);
      span.setAttribute('pryzm.plan_tools.had_session', _session !== null);
      if (_session === null) {
        span.setAttribute('pryzm.plan_tools.disarmed', false);
        return false;
      }
      // ⭐ §FIX-PLAN-TOOL-FINISH-GESTURE (L-9303) — OR IN EVERY OTHER PLAN SURFACE.
      // The caller passes what IT saw before cancelling; the outline may be on the
      // other pane. See `anyPlanSurfaceHasStroke()` for the measurement.
      if (hadActiveStroke || anyPlanSurfaceHasStroke()) {
        // Stage 1. The overlay has already cancelled the stroke; the tool stays armed
        // and the chrome stays up, so the next click starts a new outline.
        span.setAttribute('pryzm.plan_tools.disarmed', false);
        return false;
      }
      const label = _session.tool;
      disarmPlanOnlyTool();
      endPlanOnlyToolSession();
      span.setAttribute('pryzm.plan_tools.disarmed', true);
      span.setAttribute('pryzm.plan_tools.tool', label);
      return true;
    } finally {
      span.end();
    }
  });
}

/**
 * End the current plan-only tool session: dismiss the strip, give 3-D selection back,
 * drop the armed-selection snapshot, unbind the listeners. Safe to call when no session
 * is live.
 *
 * ⚠ CORRECTED 2026-08-23 (§FIX-PLAN-TOOL-ESCAPE-RUNAWAY, L-7800) — THIS HEADER USED TO
 * STATE THE DEFECT AS A DELIBERATE DESIGN DECISION, AND THAT IS WHY IT SURVIVED. It read:
 *
 *     "⛔ It deliberately does NOT disarm the plan handler. Escape inside a plan tool
 *      means 'cancel this stroke', not 'put the tool away' — that is the plan overlays'
 *      own contract, and overriding it here would make Escape mean two different things
 *      depending on which surface had focus."
 *
 * ⭐ THE PREMISE IS TRUE AND THE CONCLUSION DOES NOT FOLLOW. "Cancel this stroke" is the
 * right meaning for a tool that HAS a stroke. The balcony and the lift are single-click
 * tools that never hold one, so for them "cancel the stroke" cancels nothing and Escape
 * became a key with no observable effect — the founder's report, measured in his own
 * log as 14 → 19 → 24 → 29 elements with an Escape between each pair.
 *
 * This function's job is unchanged — it unwinds the session CHROME and nothing else, so
 * it remains safe to call on its own. The two-stage decision lives in
 * `planOnlyToolEscape()` above, and the disarm in `disarmPlanOnlyTool()`; callers that
 * want "Escape" want `planOnlyToolEscape`, not this.
 *
 * P8: emits `pryzm.plan_tools.end_plan_only_session`.
 */
export function endPlanOnlyToolSession(): void {
  _tracer.startActiveSpan('pryzm.plan_tools.end_plan_only_session', (span) => {
    try {
      span.setAttribute('pryzm.plan_tools.had_session', _session !== null);
      const s = _session;
      _session = null;
      for (const fn of s?.teardown ?? []) {
        try {
          fn();
        } catch {
          /* one failed teardown must never strand the rest */
        }
      }
    } finally {
      span.end();
    }
  });
}

/** Test seam + read model: the tool whose session is live, or `null`. */
export function activePlanOnlySessionTool(): string | null {
  return _session?.tool ?? null;
}
