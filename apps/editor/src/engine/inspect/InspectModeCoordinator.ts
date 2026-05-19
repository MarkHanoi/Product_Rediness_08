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
import { levelExplodeController } from './LevelExplodeController';
import { comparisonEngine } from '@pryzm/core-app-model';
import type { IInspectModeCoordinator } from '@pryzm/editor-ui';

const MAX_SCENE_HEIGHT = 20.0; // metres — matches DiagnosticMaterialManager constant

export class InspectModeCoordinator implements IInspectModeCoordinator {
  private _scene:           THREE.Scene | null = null;
  private _activeLens:      InspectLens = 'ghost';
  private _selectedRoomId:  string | undefined;

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

    // ── Bug fix: restoreFromStorage() fires BEFORE init() — re-check current mode
    // so the lens is applied if we're already in inspect mode when the scene is ready.
    // D.7.6: routed through getFrameScheduler() instead of raw rAF.
    getFrameScheduler().scheduleOnce('inspect-coordinator-init-catchup', () => {
      const wc = window.workspaceController; // TODO(D.4): replace with runtime.workspaceController — Phase D.4.x
      if (wc?.getMode?.() === 'inspect') {
        const deltaMap = comparisonEngine.getDeltaMap();
        diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene!, this._selectedRoomId);
        levelExplodeController.activate();
        console.log('[InspectModeCoordinator] Init catch-up — applied lens for pre-set inspect mode');
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
    levelExplodeController.dispose();
  }

  // ── Event handlers ─────────────────────────────────────────────────────────

  private _onWorkspaceMode(payload: unknown): void {
    const mode = (payload as { mode?: string })?.mode;
    if (!this._scene) return;

    if (mode === 'inspect') {
      const deltaMap = comparisonEngine.getDeltaMap();
      diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._selectedRoomId);
      levelExplodeController.activate();
      console.log(`[InspectModeCoordinator] Entered inspect — lens: ${this._activeLens}`);
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

  private _onSetLens(payload: unknown): void {
    const lens = (payload as { lens?: string })?.lens as InspectLens | undefined;
    if (!lens || !this._scene) return;
    this._activeLens = lens;

    const deltaMap = comparisonEngine.getDeltaMap();
    diagnosticMaterialManager.applyLens(lens, deltaMap, this._scene, this._selectedRoomId);
    console.log(`[InspectModeCoordinator] Lens set to: ${lens}`);
  }

  private _onDeltaUpdated(_payload: unknown): void {
    if (!diagnosticMaterialManager.isActive() || !this._scene) return;
    const deltaMap = comparisonEngine.getDeltaMap();
    diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._selectedRoomId);
    console.log('[InspectModeCoordinator] Delta updated — re-applied lens');
  }

  /**
   * §1.3 Selected Jewel — fired by AuditStack when the user clicks a room in the tree.
   * Stores the selectedRoomId and re-applies the active lens so the jewel appears immediately.
   */
  private _onRoomFocus(payload: unknown): void {
    const roomId = (payload as { roomId?: string })?.roomId;
    if (!this._scene) return;

    this._selectedRoomId = roomId;
    if (!diagnosticMaterialManager.isActive()) return;

    const deltaMap = comparisonEngine.getDeltaMap();
    diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._selectedRoomId);
    console.log(`[InspectModeCoordinator] Room focused: ${roomId} — jewel applied`);
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
      if (diagnosticMaterialManager.isActive()) {
        const deltaMap = comparisonEngine.getDeltaMap();
        diagnosticMaterialManager.applyLens(this._activeLens, deltaMap, this._scene, this._selectedRoomId);
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
