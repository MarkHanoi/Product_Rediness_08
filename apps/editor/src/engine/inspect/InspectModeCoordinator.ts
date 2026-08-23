/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder layer (engine-side coordinator — Three.js scene only)
 * File:             src/engine/inspect/InspectModeCoordinator.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2 (Builder layer)
 *                   02-SPATIAL-PROJECTION-CONTRACT §8.1 (overlays group)
 *                   05-BIM-UI-ARCHITECTURE-CONTRACT §6.1 (WorkspaceController uses events, not engine imports)
 *
 * Bridges workspace / lens / delta / room-focus / z-slicer / discovery events to
 * DiagnosticMaterialManager lens application. Keeps all Three.js/engine
 * concerns OUT of WorkspaceController (which is a pure UI-layer class).
 *
 * Events handled (all via runtime.events typed bus — F.events.2d/5/6):
 *   pryzm-workspace-mode           { mode }       → enter/leave inspect
 *   pryzm-set-inspect-lens         { lens }        → switch active lens
 *   pryzm-delta-updated            { deltaMap }    → re-apply lens with fresh DeltaMap
 *   pryzm-inspect-room-focus       { roomId }      → §1.3 selected jewel — re-apply with selection
 *   pryzm-zslicer-change           { pct: 0..1 }   → §3 Z-Slicer — set renderer.clippingPlanes
 *   pryzm-inspect-discovery        { rooms, ... }  → discovery heatmap (DiagnosticMaterialManager)
 *   pryzm-inspect-element-type     { elementType } → toggle room-lens ↔ ghost-with-focus
 *   pryzm-inspect-attribute-focus  { elementType, attributeKey, heatmap } → attribute heatmap
 *
 * CONTRACT RULES:
 *   - NEVER mutates stores, ElementRegistry, or the semantic graph
 *   - NEVER dispatches commands
 *   - Reads DeltaMap from comparisonEngine singleton (read-only)
 *   - Delegates all material work to diagnosticMaterialManager singleton
 *   - All overlays managed exclusively by DiagnosticMaterialManager
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { diagnosticMaterialManager, InspectLens } from './DiagnosticMaterialManager';
import { toFocusSet, EMPTY_FOCUS } from './inspectFocus';
import { levelExplodeController } from './LevelExplodeController';
import { comparisonEngine, selectionBus } from '@pryzm/core-app-model';
import type { IInspectModeCoordinator } from '@pryzm/editor-ui';

const MAX_SCENE_HEIGHT = 20.0; // metres — matches DiagnosticMaterialManager constant

export class InspectModeCoordinator implements IInspectModeCoordinator {
  private _scene:           THREE.Scene | null = null;
  private _activeLens:      InspectLens = 'ghost';
  /**
   * §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200) — the element ids the Inspect lenses
   * emphasise. ⛔ THIS FIELD WAS `_selectedRoomId: string | undefined`, and the
   * name was the bug: `ProjectTreeZone` emitted `pryzm-inspect-room-focus` with
   * `roomId: el.id` for EVERY family, so a wall id was stored in it and then
   * compared against `userData.roomId` — a comparison no wall mesh can satisfy.
   * See `inspectFocus.ts` for the full measurement. C84 EI-9: one name, one meaning.
   */
  private _focusedElementIds: ReadonlySet<string> = EMPTY_FOCUS;

  /** F.events.2d / F.events.5 / F.events.6 — all subscriptions on runtime.events typed bus.
   *  No DOM addEventListener / removeEventListener in this class. */
  private _unsubLens:           (() => void) | null = null;
  private _unsubZSlicer:        (() => void) | null = null;
  private _unsubDiscovery:      (() => void) | null = null;
  private _unsubMode:           (() => void) | null = null;
  private _unsubDelta:          (() => void) | null = null;
  private _unsubRoomFocus:      (() => void) | null = null;
  private _unsubElementType:    (() => void) | null = null;
  private _unsubAttributeFocus: (() => void) | null = null;
  private _unsubSelection:      (() => void) | null = null;
  /** §FIX-ANALYSIS-HIGHLIGHT-HAS-NO-EMITTER (L-6600) — the LIVE selection wire. */
  private _unsubSelectionBus:   (() => void) | null = null;

  init(scene: THREE.Scene): void {
    this._scene = scene;

    // Wire level explode controller — init once, lifecycle driven by workspace mode events
    levelExplodeController.init(scene);

    // F.events.2d / F.events.5 / F.events.6 — all events on runtime.events typed bus.
    // init() is called after flushRuntimeEventListeners() in engineLauncher so
    // window.runtime?.events is guaranteed to be available here.
    this._unsubLens           = window.runtime?.events?.on('pryzm-set-inspect-lens',         this._onSetLens.bind(this)) ?? null;
    this._unsubZSlicer        = window.runtime?.events?.on('pryzm-zslicer-change',           this._onZSlicerChange.bind(this)) ?? null;
    this._unsubDiscovery      = window.runtime?.events?.on('pryzm-inspect-discovery',        this._onDiscovery.bind(this)) ?? null;
    // F.events.6 — final 5 DOM events migrated to runtime.events typed bus.
    this._unsubMode           = window.runtime?.events?.on('pryzm-workspace-mode',           this._onWorkspaceMode.bind(this)) ?? null;
    this._unsubDelta          = window.runtime?.events?.on('pryzm-delta-updated',            this._onDeltaUpdated.bind(this)) ?? null;
    this._unsubRoomFocus      = window.runtime?.events?.on('pryzm-inspect-room-focus',       this._onRoomFocus.bind(this)) ?? null;
    this._unsubElementType    = window.runtime?.events?.on('pryzm-inspect-element-type',     this._onElementType.bind(this)) ?? null;
    this._unsubAttributeFocus = window.runtime?.events?.on('pryzm-inspect-attribute-focus',  this._onAttributeFocus.bind(this)) ?? null;
    // §ANALYSIS-IS-GREY-AND-PURPLE (L-6410) — the canonical selection event.
    // `runtime-composer/src/types.ts:126` declares `'selection.changed'` as the
    // replacement for the legacy `'pryzm-selection-changed'` DOM event, emitted
    // whenever `runtime.selection.{add,remove,clear,set}` mutates the set. Using
    // the retired DOM name here would subscribe to something nothing emits.
    this._unsubSelection      = window.runtime?.events?.on('selection.changed',              this._onSelectionChanged.bind(this)) ?? null;

    // ═══════════════════════════════════════════════════════════════════════
    // §FIX-ANALYSIS-HIGHLIGHT-HAS-NO-EMITTER (L-6600) — the line above subscribes
    // to an event NOTHING EMITS, so the Analysis purple was UNREACHABLE, not absent.
    // ═══════════════════════════════════════════════════════════════════════
    // Measured 2026-08-22, before changing anything:
    //   grep -rn "emit('selection.changed'" --include=*.ts apps packages plugins
    //     -> 1 hit: `runtime-composer/src/composeRuntime.ts:317`, inside
    //        `buildSelectionStub().notify()`.
    //   `notify()` runs ONLY from `runtime.selection.{add,remove,clear,set}`.
    //   grep -rnE "selection\.(set|add|remove|clear)\(" --include=*.ts apps packages plugins
    //     (minus tests / DrawingSelectionIndex) -> 1 hit,
    //     `plugins/selection/src/handlers/ClearSelection.ts:29`, and that is
    //     `ctx.stores.selection` — a `SelectionStore` from the plugin SDK, a
    //     DIFFERENT object from the runtime's `SelectionSlot`.
    //
    // So: ZERO production sites ever put an id INTO `runtime.selection`, therefore
    // `selection.changed` never fires with a non-empty set, therefore
    // `_onSelectionChanged` never ran in production. The paint code added by
    // 596f7cb2 (`DiagnosticMaterialManager._applyAnalysisSelection`) was correct
    // and complete; the event it hung off was dead. C01 §6 rule 6: this is
    // UNREACHABLE, not ABSENT — both ends existed, the wire between them did not.
    //
    // ⭐ THE LIVE WIRE IS `selectionBus`, and it is the RIGHT one on the merits,
    // not merely the one that works. C27 §4 names SelectionBus "the single
    // authorised entry point for all selection sources", and every surface the
    // founder clicks already dispatches on it — the 3-D viewport, the plan view,
    // the project browser, the schedules, and (via `selectFigure`) every widget
    // on the Analysis surface. Subscribing here joins the existing chorus instead
    // of minting a second idea of what "selected" means.
    //
    // ⛔ BOTH subscriptions are kept, and they are NOT rivals: they are two
    // SOURCES feeding ONE SINK (`_setAnalysisEmphasis`). `selection.changed` is
    // the runtime-canonical event and costs nothing while it is dead; if
    // `runtime.selection` is ever given writers, `SelectionManager` already
    // mirrors into `selectionBus` (§MULTI-SELECT-SHIFT, L-1550), so whoever
    // wires it must keep the two agreeing. One sink is what makes that safe.
    //
    // ⚠ INERT OUTSIDE ANALYSIS. `setAnalysisSelection` re-applies only when the
    // Analysis lens is the ACTIVE lens, so a plain 3-D click in Author mode
    // updates the stored set and paints nothing. That is deliberate: entering
    // Analysis afterwards then shows what is already selected, which is the
    // answer the founder's sentence implies.
    this._unsubSelectionBus = selectionBus.subscribe((ev) => {
      // 'select' and 'clear' are the two events that MEAN the set changed;
      // 'highlight' / 'isolate' / 'focus-camera' are decorations OVER the current
      // selection and `SelectionBus.dispatch` deliberately does not let them
      // rewrite `currentIds`. Repainting on them would paint a set that did not
      // move — and, for 'clear', repaint before the bus had cleared it.
      if (ev.type !== 'select' && ev.type !== 'clear') return;
      const ids = ev.type === 'clear' ? [] : selectionBus.currentIds;
      this._setAnalysisEmphasis(ids);
      // ═══════════════════════════════════════════════════════════════════════
      // §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200) — the SAME live wire now also
      // feeds INSPECT's focus, and that is the point rather than a convenience.
      // ═══════════════════════════════════════════════════════════════════════
      // The founder's report is *"when I select a WALL"*, and every surface he can
      // select a wall from — the 3-D viewport, the plan view, the project browser,
      // the Inspect panel's own tree — already dispatches on `selectionBus`
      // (C27 §4 names it "the single authorised entry point for all selection
      // sources"). Before this line, Inspect's focus could ONLY be set by
      // `pryzm-inspect-room-focus`, an event with four emitters, three of which
      // are room rows — so selecting a wall in the VIEWPORT could not reach the
      // lens at all, and selecting one in the TREE reached it wearing a room's name.
      //
      // ⚠ Same shape as the Analysis wire directly above: TWO SOURCES, ONE SINK.
      // `pryzm-inspect-room-focus` stays (the audit-grid room rows use it and do
      // NOT go through selectionBus), and both funnel into `_setFocusedElements`
      // so they cannot become two rival answers to "what is focused".
      this._setFocusedElements(ids);
    });

    // ── Bug fix: restoreFromStorage() fires BEFORE init() — re-check current mode
    // so the lens is applied if we're already in inspect mode when the scene is ready.
    // D.7.6: routed through getFrameScheduler() instead of raw rAF.
    getFrameScheduler().scheduleOnce('inspect-coordinator-init-catchup', () => {
      const wc = window.workspaceController; // TODO(D.4): replace with runtime.workspaceController — Phase D.4.x
      const startMode = wc?.getMode?.();
      if (startMode === 'inspect') {
        const deltaMap = comparisonEngine.getDeltaMap();
        diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene!, this._focusedElementIds);
        levelExplodeController.activate();
        console.log('[InspectModeCoordinator] Init catch-up — applied lens for pre-set inspect mode');
      } else if (startMode === 'analysis') {
        // §ANALYSIS-IS-GREY-AND-PURPLE (L-6410) — this catch-up carried the SAME
        // enumeration gap as `_onWorkspaceMode`: it tested only for 'inspect', so
        // reloading the page while Analysis was the active workspace produced an
        // unstyled scene until the user switched modes and back. Both sites read
        // the mode; both must know every mode that paints.
        const deltaMap = comparisonEngine.getDeltaMap();
        diagnosticMaterialManager.applyLens('analysis', deltaMap, this._scene!, this._focusedElementIds);
        console.log('[InspectModeCoordinator] Init catch-up — applied lens for pre-set analysis mode');
      }
    });

    console.log('[InspectModeCoordinator] Initialized');
  }

  dispose(): void {
    // F.events.2d / F.events.5 / F.events.6 — dispose all runtime.events subscriptions (no DOM cleanup needed).
    this._unsubLens?.();           this._unsubLens = null;
    this._unsubZSlicer?.();        this._unsubZSlicer = null;
    this._unsubDiscovery?.();      this._unsubDiscovery = null;
    this._unsubMode?.();           this._unsubMode = null;
    this._unsubDelta?.();          this._unsubDelta = null;
    this._unsubRoomFocus?.();      this._unsubRoomFocus = null;
    this._unsubElementType?.();    this._unsubElementType = null;
    this._unsubAttributeFocus?.(); this._unsubAttributeFocus = null;
    this._unsubSelection?.();      this._unsubSelection = null;
    this._unsubSelectionBus?.();   this._unsubSelectionBus = null;
    levelExplodeController.dispose();
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private _onWorkspaceMode(payload: unknown): void {
    const mode = (payload as { mode?: string })?.mode;
    if (!this._scene) return;

    if (mode === 'inspect') {
      const deltaMap = comparisonEngine.getDeltaMap();
      diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._focusedElementIds);
      levelExplodeController.activate();
      console.log(`[InspectModeCoordinator] Entered inspect — lens: ${this._activeLens}`);
    } else if (mode === 'analysis') {
      // §ANALYSIS-IS-GREY-AND-PURPLE (L-6410).
      //
      // ⛔ THE DEFECT THIS FIXES: 'analysis' appeared in NEITHER branch. The chain
      // was `if (inspect) {…} else if (author || data) { restore }` — so entering
      // Analysis FROM Inspect fell through both arms and left Inspect's cyan ghost
      // painted over the model, while entering from Author applied nothing at all.
      // The founder saw exactly that: "the analysis tab should behave like the
      // inspect tab — when elements are selected they should be highlighted".
      //
      // ⚠ This is an ENUMERATED mode list. Adding a seventh workspace mode without
      // adding it here reproduces the bug silently — the `else` does nothing. If a
      // mode is added, it belongs in one of these three arms by explicit choice.
      const deltaMap = comparisonEngine.getDeltaMap();
      diagnosticMaterialManager.applyLens('analysis', deltaMap, this._scene, this._focusedElementIds);
      console.log(
        `[InspectModeCoordinator] Entered analysis — lens: analysis ` +
        `(light-grey ghost + PRYZM purple selection)`,
      );
    } else if (mode === 'author' || mode === 'data') {
      if (diagnosticMaterialManager.isActive()) {
        diagnosticMaterialManager.restore(this._scene);
        // Clear global renderer clip plane when leaving inspect
        this._clearRendererClip();
        console.log('[InspectModeCoordinator] Left inspect — materials restored');
      }
      if (levelExplodeController.isActive()) {
        levelExplodeController.deactivate();
      }
    }
  }

  /**
   * §ANALYSIS-IS-GREY-AND-PURPLE (L-6410) — keep the Analysis lens' purple set in
   * step with the real selection.
   *
   * `setAnalysisSelection` re-applies ONLY when the Analysis lens is the active
   * one, so this subscription is inert in Author / Inspect / Data and cannot
   * disturb Inspect's own palette.
   */
  private _onSelectionChanged(payload: unknown): void {
    const ids = (payload as { ids?: readonly string[] })?.ids ?? [];
    this._setAnalysisEmphasis(ids);
    // §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200) — the runtime-canonical source
    // feeds the Inspect sink too, for the same reason it feeds the Analysis one:
    // it has zero emitters today (see `init()`), and the day it acquires one the
    // two surfaces must already agree rather than be made to agree afterwards.
    this._setFocusedElements(ids);
  }

  /**
   * THE ONE SINK for "which elements read as selected in the Analysis lens".
   *
   * §FIX-ANALYSIS-HIGHLIGHT-HAS-NO-EMITTER (L-6600). Two sources reach it — the
   * runtime's `selection.changed` (canonical, currently zero emitters, see
   * `init()`) and `selectionBus` (live). Routing both through one method is what
   * stops them becoming two rival answers to the same question the day the first
   * one acquires a writer.
   */
  private _setAnalysisEmphasis(ids: readonly string[]): void {
    diagnosticMaterialManager.setAnalysisSelection(ids, this._scene);
  }

  /**
   * §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200) — THE ONE SINK for "which elements
   * the INSPECT lenses emphasise". Sibling of `_setAnalysisEmphasis` above, and
   * deliberately its sibling rather than its extension: same mechanism (a set of
   * element ids), separate palettes (L-3511 cyan/violet/blue vs L-6410 grey/purple).
   *
   * Three sources reach it — `pryzm-inspect-room-focus` (the audit-grid and
   * discovery ROOM rows), `selectionBus` (live; every click surface), and the
   * runtime's `selection.changed` (canonical, currently zero emitters).
   *
   * ⚠ RE-APPLIES ONLY WHEN A LENS IS ACTIVE. `isActive()` is false outside
   * Inspect/Analysis, so a plain 3-D click in Author mode updates the stored set
   * and paints nothing — and entering Inspect afterwards then shows what is
   * already selected, which is the behaviour the founder's sentence implies.
   *
   * ⛔ The apply is RAF-coalesced inside `applyLens`, so the two sources firing on
   * the SAME click (a tree row emits room-focus and then `selectionBus.select`)
   * collapse into ONE application at the next frame with the LAST set winning.
   * That coalescer is also why the old code's flicker was exactly one frame long.
   */
  private _setFocusedElements(ids: Iterable<string>): void {
    this._focusedElementIds = toFocusSet(ids);
    if (!this._scene || !diagnosticMaterialManager.isActive()) return;
    const deltaMap = comparisonEngine.getDeltaMap();
    diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._focusedElementIds);
  }

  private _onSetLens(payload: unknown): void {
    const lens = (payload as { lens?: string })?.lens as InspectLens | undefined;
    if (!lens || !this._scene) return;
    this._activeLens = lens;

    const deltaMap = comparisonEngine.getDeltaMap();
    diagnosticMaterialManager.applyLens(lens, deltaMap, this._scene, this._focusedElementIds);
    console.log(`[InspectModeCoordinator] Lens set to: ${lens}`);
  }

  private _onDeltaUpdated(_payload: unknown): void {
    if (!diagnosticMaterialManager.isActive() || !this._scene) return;
    const deltaMap = comparisonEngine.getDeltaMap();
    diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._focusedElementIds);
    console.log('[InspectModeCoordinator] Delta updated — re-applied lens');
  }

  /**
   * §1.3 Selected Jewel — fired by AuditStack when the user clicks a room in the tree.
   * Stores the selectedRoomId and re-applies the active lens so the jewel appears immediately.
   */
  private _onRoomFocus(payload: unknown): void {
    const roomId = (payload as { roomId?: string })?.roomId;
    if (!this._scene) return;

    // §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200) — routed through the ONE sink.
    // This handler used to write the focus field directly AND re-apply, which is
    // what made it a rival to the selection wire rather than a source feeding it.
    this._setFocusedElements(roomId ? [roomId] : []);
    if (!diagnosticMaterialManager.isActive()) return;
    // ⛔ The old line read `Room focused: ${roomId} — jewel applied` and the
    // founder's own console printed `Room focused: wall_01M0PTPAWMNKP0B1G841G7XR04`
    // under it. A log that names the SLOT instead of the VALUE is how a wall id in
    // a room field reads as normal for months. It now names the event, not a type
    // it cannot check.
    console.log(`[InspectModeCoordinator] Inspect focus set from room-focus event: ${roomId ?? '(cleared)'}`);
  }

  /**
   * §3 Z-Slicer — fired by WorkspaceController slider.
   * Sets renderer.clippingPlanes globally so the entire scene respects the cut height.
   * Also enables renderer.localClippingEnabled so per-material planes work.
   */
  private _onZSlicerChange(payload: unknown): void {
    const pct = (payload as { pct?: number })?.pct;
    if (typeof pct !== 'number') return;

    const renderer = window.world?.renderer?.three as THREE.WebGLRenderer | undefined;
    if (!renderer) return;

    renderer.localClippingEnabled = true;

    if (pct >= 0.999) {
      // Slider at maximum — no clipping
      renderer.clippingPlanes = [];
      console.log('[InspectModeCoordinator] Z-Slicer: clip removed (full height)');
    } else {
      const clipY  = pct * MAX_SCENE_HEIGHT;
      // Clips everything ABOVE clipY: plane normal (0,-1,0), offset = clipY
      const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), clipY);
      renderer.clippingPlanes = [plane];
      console.log(`[InspectModeCoordinator] Z-Slicer: clip at Y=${clipY.toFixed(2)} m (${(pct * 100).toFixed(0)}%)`);
    }
  }

  private _clearRendererClip(): void {
    const renderer = window.world?.renderer?.three as THREE.WebGLRenderer | undefined;
    if (renderer) {
      renderer.clippingPlanes = [];
    }
  }

  /**
   * Discovery mode — fired by AuditStack._dispatchInspectMode().
   *
   * NO re-application needed here. The event listener ordering guarantees that
   * DiagnosticMaterialManager (registered first in its constructor) stores the
   * discovery rooms BEFORE InspectModeCoordinator._onWorkspaceMode fires and
   * calls applyLens(). So the heatmap colors are already applied correctly on
   * the first applyLens() call.
   *
   * Previous architecture used a setTimeout(0) re-apply here which caused a
   * double applyLens() — the second call triggered _clearOverlays().dispose()
   * while the GPU was still rendering, corrupting TRAA shader uniforms and
   * causing the 'Cannot read properties of undefined (reading uZoom)' crash.
   */
  // F.events.5: payload typed directly (no Event cast needed — runtime.events typed bus).
  private _onDiscovery(_payload: unknown): void {
    // Intentionally empty — discovery rooms stored in DiagnosticMaterialManager
    // by its own onRuntimeEvent() subscription before this handler fires.
    console.log('[InspectModeCoordinator] Discovery event acknowledged (no re-apply needed)');
  }

  /**
   * Element type change — fired by AuditStack's dropdown.
   * For non-room types, applies ghost-with-focus so only the selected type is opaque.
   */
  private _onElementType(payload: unknown): void {
    const elementType = (payload as { elementType?: string })?.elementType;
    if (!elementType || !this._scene) return;
    console.log(`[InspectModeCoordinator] Element type changed: ${elementType}`);
    if (elementType === 'rooms') {
      // L-2035 — drop the previously focused family FIRST. Without this,
      // `_applyLensImmediate` sees a stale `_focusedElementType` and re-applies
      // ghost-with-focus on the old family instead of the room heat map.
      diagnosticMaterialManager.clearElementFocus();
      if (diagnosticMaterialManager.isActive()) {
        const deltaMap = comparisonEngine.getDeltaMap();
        diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._focusedElementIds);
      }
    } else {
      diagnosticMaterialManager.applyGhostWithFocus(this._scene, elementType);
    }
  }

  /**
   * Attribute focus — fired by AuditStack column header click.
   * Applies attribute heatmap colours on top of the ghost-with-focus base.
   */
  private _onAttributeFocus(payload: unknown): void {
    const { elementType, heatmap } = (payload as { elementType?: string; heatmap?: ReadonlyArray<{ id: string; color: number }> }) ?? {};
    if (!elementType || !this._scene || !Array.isArray(heatmap)) return;
    // Reapply ghost base first, then overlay heatmap colours
    diagnosticMaterialManager.applyGhostWithFocus(this._scene, elementType);
    diagnosticMaterialManager.applyAttributeHeatmap(this._scene, elementType, heatmap);
    console.log(`[InspectModeCoordinator] Attribute focus — type: ${elementType}, heatmap entries: ${heatmap.length}`);
  }
}

export const inspectModeCoordinator = new InspectModeCoordinator();
