/**
 * @file apps/editor/src/engine/scheduleClickZoom.ts
 * @description §SCHEDULE-CLICK-ZOOM — shared "select + zoom" reaction for
 *              schedule row clicks.
 *
 * WHY
 * ───────────────────────────────────────────────────────────────────────────
 * Clicking a row in ANY schedule (rooms, doors, windows, walls, slabs,
 * columns, beams, stairs, furniture, …) emits the typed runtime event
 * `pryzm-element-selected` with `source: 'schedule'` (see
 * apps/editor/src/ui/SchedulePanel/SchedulePanel.ts).  engineLauncher already
 * listens to that event and calls `selectionManager.selectById(id)`.
 *
 * This helper is the ONE chokepoint that, after a successful schedule-driven
 * selection, also dispatches the existing `zoom-selected` command (registered
 * at §C-B1 in engineLauncher) so the 3D camera frames the element.  Because
 * every schedule routes through the same event + the same listener, the zoom
 * generalises to every schedule and every element type for free — no per-
 * schedule wiring and no new camera path.
 *
 * P6 — the zoom is dispatched through the command bus (`zoom-selected`), not by
 *      poking the renderer/camera directly.
 * P4 — no `(window as any)`; the bus and selection are passed in as typed deps.
 * P8 — `reactToScheduleSelection` is exported and therefore wraps its work in an
 *      OTel span (`pryzm.schedule.clickZoom`).
 *
 * Edge cases (all graceful — never throws):
 *   • non-schedule source (3d / living-graph / inspect) → select only, no zoom.
 *   • missing elementId / elementType → ignored.
 *   • element on a non-active level or not yet in the scene → selectById
 *     returns false → no zoom dispatched (avoids a fit-all "flash").
 *   • element with no geometry → the `zoom-selected` handler boxes the object
 *     and falls back to zoomToAll on an empty box (handled there, not here).
 */

/** Minimal shape of the runtime event payload this helper consumes. */
export interface ScheduleSelectionDetail {
  readonly elementId: string;
  readonly elementType?: string;
  readonly source: string;
}

/** Narrow surface of the selection manager used here (typed, no `any`). */
export interface SelectByIdLike {
  selectById(id: string): boolean;
}

/** Narrow surface of the command bus used here (typed, no `any`). */
export interface CommandDispatchLike {
  executeCommand(type: string, payload: Record<string, unknown>): unknown;
}

// ── OTel span (P8) — no-op tracer by default so headless/test contexts run
// without an SDK; the editor may swap in a real tracer at boot. ──────────────
export interface ClickZoomSpan {
  end(): void;
  setAttribute?(key: string, value: string | number | boolean): void;
}
export interface ClickZoomTracer {
  startSpan(name: string, attrs?: Readonly<Record<string, string | number | boolean>>): ClickZoomSpan;
}
const NOOP_SPAN: ClickZoomSpan = Object.freeze({ end() { /* noop */ } });
const NOOP_TRACER: ClickZoomTracer = Object.freeze({ startSpan: () => NOOP_SPAN });
let currentTracer: ClickZoomTracer = NOOP_TRACER;
export function setScheduleClickZoomTracer(t: ClickZoomTracer): void { currentTracer = t; }
export function clearScheduleClickZoomTracer(): void { currentTracer = NOOP_TRACER; }

/** Result of the reaction — useful for tests/observability. */
export interface ScheduleSelectionResult {
  /** Whether `selectById` found and selected the element. */
  readonly selected: boolean;
  /** Whether `zoom-selected` was dispatched. */
  readonly zoomed: boolean;
}

/**
 * §SCHEDULE-CLICK-ZOOM — react to a `pryzm-element-selected` event.
 *
 * Always attempts the selection (preserving prior select-only behaviour for
 * every source).  Additionally, when the selection came from a schedule row
 * AND the element was actually found/selected, dispatches the existing
 * `zoom-selected` command so the camera frames it.  Source `'3d'` is ignored
 * entirely (the 3D click already selected + the camera is already there).
 */
export function reactToScheduleSelection(
  detail: ScheduleSelectionDetail,
  selection: SelectByIdLike,
  bus: CommandDispatchLike,
): ScheduleSelectionResult {
  const span = currentTracer.startSpan('pryzm.schedule.clickZoom', {
    source: detail?.source ?? '',
    elementType: detail?.elementType ?? '',
  });
  try {
    // The 3D viewport already drives its own camera; never re-zoom on its echo.
    if (!detail || detail.source === '3d') return { selected: false, zoomed: false };
    if (!detail.elementType) return { selected: false, zoomed: false };
    if (!detail.elementId) return { selected: false, zoomed: false };

    const selected = selection.selectById(detail.elementId);
    span.setAttribute?.('selected', selected);

    // Only the schedule surface opts into the auto-zoom; other panels keep
    // their prior select-only behaviour.  Gate on a successful select so an
    // off-level / not-yet-rendered element does not trigger a fit-all flash.
    let zoomed = false;
    if (selected && detail.source === 'schedule') {
      try {
        bus.executeCommand('zoom-selected', {});
        zoomed = true;
      } catch (err) {
        // Non-fatal: keep the selection, just skip the camera move.
        console.warn('[§SCHEDULE-CLICK-ZOOM] zoom-selected dispatch failed (non-fatal):', err);
      }
    }
    span.setAttribute?.('zoomed', zoomed);
    return { selected, zoomed };
  } finally {
    span.end();
  }
}
