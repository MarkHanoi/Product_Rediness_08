/**
 * FloorTool — Drawing tool for the Floor Finish subsystem.
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/03-FLOOR-COMMAND-PIPELINE-CONTRACT.md §2–§3
 *           docs/02-decisions/contracts/49-FLOOR-CEILING-DRAWING-MODE-PARITY-CONTRACT.md
 *
 * State machine: IDLE → DRAWING → (createFloor) → IDLE  [continuous]
 *                ESC → deactivate
 *
 * Drawing modes (uniform with WallTool / CeilingTool):
 *   • LINEAR     — freeform straight segments, no axis snap
 *   • ORTHO      — 90°-constrained polygon (axis-only snap from previous vertex)
 *   • ARC        — §FEAT-BOUNDARY-CURVE-DRAW (2026-08-06): true arc segments — after a
 *                  vertex, click the arc MIDPOINT then the arc END (the wall tool's
 *                  3-click pattern); the quadratic-Bézier segment is tessellated into
 *                  the polygon via the shared `boundaryArc` helper (the ONE arc model).
 *   • RECTANGLE  — 2-click axis-aligned rectangle, commits immediately
 *   • AUTO_FROM_ROOM — click inside a room and use the room boundary
 *
 * Continuous creation pattern (mirrors SlabTool):
 *   After each successful creation the polygon state resets but listeners,
 *   camera lock, and HUD remain attached.  Only ESC, exitDrawing(), or
 *   deactivate() fully tears down.
 *
 * KEY GEOMETRY DIFFERENCE vs CeilingTool:
 * - Floor preview is drawn at FFL = level.elevation + pendingBaseOffset (ON the ground)
 * - There is no separate "height" dimension (ceiling exists above slab, floor sits on slab)
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
import { CreateFloorCommand } from '@pryzm/command-registry';
import { FloorVertex, FloorToolState } from '@pryzm/core-app-model/stores';
import { computeFloorArea as computeArea } from '@pryzm/core-app-model/stores';
import { projectContext } from '@pryzm/core-app-model';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
// §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the ONE floor-finish chokepoint. The 3D tool
// no longer holds the architect's choice in its own `_pending*` fields (fields the plan path
// could never see); it WRITES the choice here and RESOLVES the concrete record here, exactly
// as `FloorPlanToolHandler` does. See FloorToolConfigStore's header for the disease + cure.
import {
  getFloorToolConfig, setFloorToolConfig, resolveFloorFinish,
} from '@pryzm/core-app-model/stores';

export interface FloorCreationParams {
  kind: 'floor';
  thickness: number;
  baseOffset: number;
  // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — finish type chosen in the creation panel.
  systemTypeId?: string;
}
/** §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — a finish type surfaced in the create panel. */
export interface FloorTypeOption {
  id: string;
  name: string;
  totalThickness: number;
}
export interface FloorModalOptions {
  params: FloorCreationParams;
  polygonArea?: number;
  // §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — the finish catalogue (from the floor
  // system-type store) offered as a dropdown in the "Set parameters" panel.
  systemTypes?: FloorTypeOption[];
  onConfirm: (params: FloorCreationParams) => void;
  onCancel: () => void;
}

export type FloorDrawingMode = 'LINEAR' | 'ORTHO' | 'ARC' | 'RECTANGLE' | 'AUTO_FROM_ROOM';

// §41 (2026-05-22): unified to the single PRYZM brand purple #6600FF — every
// creation preview reads identically (was 0x8fb4c8 muted blue). NOTE: kept as a
// LITERAL, not PREVIEW_COLOR.PRIMARY, deliberately. This const is evaluated at
// module-load time, and core-app-model ↔ geometry-* form a circular dependency
// (SCC); reading the core-app-model barrel here at load time can see an
// uninitialised PREVIEW_COLOR (undefined) → TypeError → white screen. Keep the
// value in sync with PREVIEW_COLOR.PRIMARY in PreviewStyle.ts (Contract §41 §2).
const FLOOR_PREVIEW_COLOR = 0x6600ff;
const CLOSURE_THRESHOLD = 0.25;         // metres — click this close to first point to close
const DOUBLE_CLICK_MS = 300;

// §FIX-FLOORFINISH-DEFAULT-THICKNESS — single source of truth for the interactive Floor
// Finish defaults lives in the pure `floorFinishDefaults` module (no THREE/@thatopen, so it
// is testable in a node env). Re-exported below so callers of this class keep one import.
import {
  DEFAULT_FLOOR_FINISH_BASE_OFFSET_M,
  DEFAULT_FLOOR_FINISH_THICKNESS_M,
} from './floorFinishDefaults';
// §FEAT-BOUNDARY-CURVE-DRAW — the ONE arc model (wall-tool midpoint-Bézier semantics).
import { arcSegmentThroughMidpoint } from '../boundaryArc';
// §FIX-COMMIT-STEALS-VIEW (2026-08-07) — the Enter that commits a floor must be
// consumed, or the browser delivers it to a focused toolbar button and the view
// switches to 3D mid-commit. See toolKeyGuard.ts for the full root cause.
import { consumeToolKey, releaseFocusedControl } from '../toolKeyGuard';
export { DEFAULT_FLOOR_FINISH_BASE_OFFSET_M, DEFAULT_FLOOR_FINISH_THICKNESS_M };

export interface FloorToolDeps {
  getCommandManager?: () => any;
  getFloorStore?: () => any;
  getFloorSystemTypeStore?: () => any;
  getBimManager?: () => any;
  openCreationModal?: (opts: FloorModalOptions) => void;
  dismissCreationModal?: () => void;
}

export class FloorTool {
  private readonly _world: OBC.World;
  private readonly _components: OBC.Components;
  private _deps: FloorToolDeps;

  // State machine
  private _state: FloorToolState = 'IDLE';
  private _isActive = false;

  // Drawing mode (LINEAR / ORTHO / ARC / RECTANGLE / AUTO_FROM_ROOM)
  private _drawingMode: FloorDrawingMode = 'LINEAR';

  // Auto-from-room single-click listener + ESC key listener
  private _onRoomPick: ((e: PointerEvent) => void) | null = null;
  private _onRoomEscKey: ((e: KeyboardEvent) => void) | null = null;

  // Polygon accumulation
  private _points: FloorVertex[] = [];
  private _cursorPos: FloorVertex = { x: 0, z: 0 };
  private _snappedCursorPos: FloorVertex = { x: 0, z: 0 };
  private _levelElevation = 0;
  private _shiftPressed = false;
  private _lastClickTime = 0;

  // Rectangle (2-point) drawing anchor — first corner is set on first click,
  // second click commits an axis-aligned 4-vertex rectangle.
  private _rectAnchor: FloorVertex | null = null;

  // §FEAT-BOUNDARY-CURVE-DRAW — ARC mode state (mirrors WallPlanToolHandler):
  //   _arcMidPt set   → awaiting the arc END click.
  //   _arcMidPt null  → next click sets the arc midpoint (when a start vertex exists).
  private _arcMidPt: FloorVertex | null = null;
  // Per committed SEGMENT run length (1 for a straight vertex, N for a tessellated
  // arc) so Backspace removes a whole arc, never strands a partial tessellation.
  private _segmentRuns: number[] = [];

  // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the finish TYPE, THICKNESS and BASE OFFSET
  // are NO LONGER instance fields of this tool. They were the three fields the PLAN path
  // could not see (it has no FloorTool instance), so it dropped all three and let three
  // different downstream defaults invent them. They now live in the ONE `FloorToolConfigStore`
  // BELOW the tools, and this tool RESOLVES them through `resolveFloorFinish()` — the same
  // store and the same resolver `FloorPlanToolHandler` reads. Parity by construction (C11 §3).
  //
  // What legitimately remains per-GESTURE (not per-architect-choice) is the host linkage:
  private _pendingHostRoomId: string | undefined;   // set by AUTO_FROM_ROOM / centroid autodetect
  private _pendingHostSlabId: string | undefined;

  // Preview scene objects
  private _previewObjects: THREE.Object3D[] = [];
  private _mainLine: THREE.Line | null = null;
  private _closingLine: THREE.Line | null = null;
  private _previewFillMesh: THREE.Mesh | null = null;
  private _vertexMarkers: THREE.Mesh[] = [];
  private _cursorRing: THREE.Mesh | null = null;

  // Guide HUD (th-overlay pill) — Contract §42 §2.2
  private _hudEl: HTMLDivElement | null = null;
  private _hudText: HTMLDivElement | null = null;

  // Event listener refs for cleanup
  private _onPointerDown: ((e: PointerEvent) => void) | null = null;
  private _onPointerMove: ((e: PointerEvent) => void) | null = null;
  private _onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private _onKeyUp: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    world: OBC.World,
    components: OBC.Components,
    deps: FloorToolDeps = {}
  ) {
    this._world = world;
    this._components = components;
    this._deps = deps;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get isActive(): boolean { return this._isActive; }
  get state(): FloorToolState { return this._state; }

  setDeps(deps: Partial<FloorToolDeps>): void {
    this._deps = { ...this._deps, ...deps };
  }

  /** Active drawing mode (read by Layout / plan handlers). */
  getDrawingMode(): FloorDrawingMode { return this._drawingMode; }

  /**
   * Set the drawing mode.  Accepts both the new enum and the legacy
   * 'DRAW' / 'AUTO_FROM_ROOM' strings for backwards compatibility with
   * older call sites that haven't been migrated yet.
   */
  setMode(mode: FloorDrawingMode | 'DRAW'): void {
    const normalized: FloorDrawingMode =
      mode === 'DRAW' ? 'LINEAR' : mode;
    this.setDrawingMode(normalized);
  }

  /** Switch drawing mode mid-session.  Re-attaches the appropriate listener set. */
  setDrawingMode(mode: FloorDrawingMode): void {
    if (this._drawingMode === mode) return;
    const wasAuto    = this._drawingMode === 'AUTO_FROM_ROOM';
    const switchAuto = mode === 'AUTO_FROM_ROOM';
    this._drawingMode = mode;

    // Mode-switch hygiene: clear in-flight rectangle anchor + pending arc midpoint,
    // keep already-placed polygon points.
    this._rectAnchor = null;
    this._arcMidPt = null;

    // If we transition between AUTO and DRAW modes mid-session, swap listener sets.
    if (this._isActive && wasAuto !== switchAuto) {
      if (switchAuto) {
        this._detachListeners();
        this._attachRoomPickListener();
      } else {
        this._detachRoomPickListener();
        this._attachListeners();
        if (!this._cursorRing) this._createPreviewObjects();
      }
    }
    this._updateHUDText();
    console.log('[FloorTool] setDrawingMode →', mode);
  }

  /**
   * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the architect's chosen finish, and the
   * resolved record it implies, read from the ONE store below the tools. Every dimension
   * this tool draws or commits comes from here; there is no `_pending*` field left to drift.
   */
  private _finish() {
    return resolveFloorFinish();
  }

  setPendingSystemType(id: string | undefined): void {
    // `undefined` from the picker means "— Plain Floor —", an explicit choice, so it is
    // forwarded as `''` (the store's clear token) rather than as a no-op patch.
    setFloorToolConfig({ systemTypeId: id ?? '' });
  }

  /**
   * §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — alias for setPendingSystemType.
   * BimService.activateFloorTool() and the create-panel FloorModePicker both call
   * `setSystemTypeId(id)`; that method did not exist, so the mode-picker's finish
   * selection never reached the tool.
   *
   * §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — it now writes to the shared
   * `FloorToolConfigStore`, so the plan handler sees the SAME choice. Before this, the
   * FloorModePicker's finish dropdown wrote to THIS instance only, which is why a plan user
   * who picked "Porcelain Tile" got an untyped, layerless floor: the plan handler had no
   * FloorTool instance to read.
   */
  setSystemTypeId(id: string | undefined): void {
    setFloorToolConfig({ systemTypeId: id ?? '' });
  }

  /**
   * The architect's chosen finish type — read by `PropertyPanelPreDraw.showFloorPreDraw()`,
   * which called `floorTool.getSystemTypeId?.()` against a method that DID NOT EXIST (so the
   * pre-draw panel always opened on "— Plain Floor —", whatever the user had picked).
   */
  getSystemTypeId(): string | undefined {
    return getFloorToolConfig().systemTypeId;
  }

  /**
   * §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — resolve the finish catalogue for the
   * creation-panel dropdown from the SAME floor system-type store the post-creation
   * property-panel dropdown reads (single source of truth). Best-effort; empty on failure.
   */
  private _resolveFloorTypeOptions(): FloorTypeOption[] {
    try {
      const typeStore = (this._deps.getFloorSystemTypeStore?.() as any) ?? floorSystemTypeStore;
      const all = (typeStore?.getAll?.() ?? []) as any[];
      return all.map((t: any) => ({ id: t.id, name: t.name, totalThickness: t.totalThickness }));
    } catch {
      return [];
    }
  }

  setPendingBaseOffset(offset: number): void {
    setFloorToolConfig({ baseOffsetM: offset });
  }

  setPendingThickness(t: number): void {
    setFloorToolConfig({ thicknessM: t });
  }

  setPendingHostSlabId(slabId: string | undefined): void {
    this._pendingHostSlabId = slabId;
  }

  activate(): void {
    if (this._isActive) return;
    this._isActive = true;
    this._state = 'IDLE';
    this._points = [];
    this._rectAnchor = null;
    this._resolveElevation();

    if (this._drawingMode === 'AUTO_FROM_ROOM') {
      this._attachRoomPickListener();
      console.log('[FloorTool] Activated in AUTO_FROM_ROOM mode — click inside a room to create floor');
    } else {
      this._createPreviewObjects();
      this._attachListeners();
      console.log('[FloorTool] Activated.', { mode: this._drawingMode, ffl: this._levelElevation + this._finish().baseOffsetM });
    }
    // §FIX-COMMIT-STEALS-VIEW — the user almost always reaches this tool by CLICKING
    // a toolbar button, which leaves that button focused. Drop the focus now so no
    // canvas keystroke (Enter to commit, Space to pan) can re-activate it.
    releaseFocusedControl();
    this._showHUD();
  }

  deactivate(): void {
    if (!this._isActive) return;
    this._isActive = false;
    this._state = 'IDLE';
    this._drawingMode = 'LINEAR';
    this._rectAnchor = null;
    this._detachRoomPickListener();
    this._cancel();
    this._detachListeners();
    this._hideHUD();
    console.log('[FloorTool] Deactivated.');
  }

  cancel(): void {
    if (!this._isActive) return;
    this._detachRoomPickListener();
    this._cancel();
    this._state = 'IDLE';
  }

  dispose(): void {
    this.deactivate();
    this._disposePreviewObjects();
  }

  // ── Private event handling ─────────────────────────────────────────────────

  private _attachListeners(): void {
    const renderer = this._world.renderer;
    if (!renderer) return;
    const dom = (renderer as any).three?.domElement as HTMLElement | null;
    if (!dom) {
      console.warn('[FloorTool] Could not find renderer DOM element.');
      return;
    }

    this._onPointerDown = (e) => {
      if (!this._isActive || e.button !== 0) return;
      e.preventDefault();
      this._handleClick(e, dom);
    };

    this._onPointerMove = (e) => {
      if (!this._isActive) return;
      this._handleMove(e, dom);
    };

    this._onKeyDown = (e) => {
      // §FLOOR-3D-ENTER (DAILY-USE 2026-05-22): probe BEFORE the _isActive guard
      // so the live log distinguishes (a) this FloorTool's listener never being
      // the active one in 3D (no log on Enter → ToolManager routed to the plan
      // handler instead) from (b) active-but-points<3 (log shows points count).
      // Architect: "after 2 lines, Enter should create the floor in 3D — works
      // in plan, not in 3D."
      if (e.key === 'Enter') {
        // §FLOOR-3D-ENTER self-diagnosing probe: the single line below now states the
        // exact decision so one 3D Enter press pinpoints the cause without a back-and-forth.
        const reason = !this._isActive
          ? 'IGNORED — tool not active in this view (routing/activation problem)'
          : this._points.length < 3
            ? 'IGNORED — fewer than 3 points (clicks not accumulating in 3D — raycast/level?)'
            : 'COMMITTING — calling _commitPolygon()';
        console.log(
          `[FloorTool] §FLOOR-3D-ENTER Enter — active=${this._isActive} ` +
          `points=${this._points.length} → ${reason}`,
        );
      }
      if (!this._isActive) return;
      if (e.key === 'Shift') { this._shiftPressed = true; return; }
      if (e.key === 'Escape') { consumeToolKey(e); this.deactivate(); return; }
      // §FIX-COMMIT-STEALS-VIEW (founder 2026-08-07): "when the user wants to
      // finish the process and clicks ENTER — one time the view went to 3D SITE
      // VIEW". The Enter that commits the floor MUST be consumed here. Without
      // `preventDefault()` + `stopPropagation()` the browser delivers it to
      // whatever control still holds DOM focus, and the camera/view buttons are
      // focusable <button>s whose activation calls `viewController.activate('3D')`
      // — which is precisely the spurious `activate("3D") ENTRY —
      // activeDefinitionId=null` seen in the log 0.0 ms after this commit line,
      // BEFORE CREATE_FLOOR ran. Committing an element must never change the view.
      if (e.key === 'Enter' && this._points.length >= 3) { consumeToolKey(e); this._commitPolygon(); }
      if (e.key === 'Backspace') {
        // §FEAT-BOUNDARY-CURVE-DRAW — a pending arc midpoint is the most recent input.
        if (this._arcMidPt) {
          this._arcMidPt = null;
          this._updatePreviewObjects();
          this._updateHUDText();
          return;
        }
        if (this._points.length > 0) {
          // Undo the last SEGMENT run (1 vertex for a straight click, the whole
          // tessellated vertex run for an arc — never a partial arc).
          const run = this._segmentRuns.pop() ?? 1;
          for (let i = 0; i < run && this._points.length > 0; i++) this._points.pop();
          this._removeLastVertexMarker();
          this._updatePreviewObjects();
          if (this._points.length === 0) this._state = 'IDLE';
        }
      }
    };

    this._onKeyUp = (e) => {
      if (e.key === 'Shift') this._shiftPressed = false;
    };

    dom.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    dom.addEventListener('pointermove', this._onPointerMove, { passive: false });
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  private _detachListeners(): void {
    const renderer = this._world.renderer;
    const dom = (renderer as any)?.three?.domElement as HTMLElement | null;
    if (dom && this._onPointerDown) {
      dom.removeEventListener('pointerdown', this._onPointerDown);
      dom.removeEventListener('pointermove', this._onPointerMove!);
    }
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    if (this._onKeyUp) document.removeEventListener('keyup', this._onKeyUp);
    this._onPointerDown = null;
    this._onPointerMove = null;
    this._onKeyDown = null;
    this._onKeyUp = null;
  }

  private _handleMove(e: PointerEvent, dom: HTMLElement): void {
    const worldPt = this._raycastGroundPlane(e, dom);
    if (!worldPt) return;

    // Snap to 0.5 m grid
    const gridX = Math.round(worldPt.x * 2) / 2;
    const gridZ = Math.round(worldPt.z * 2) / 2;
    this._cursorPos = { x: gridX, z: gridZ };

    const lastPt = this._points[this._points.length - 1];
    const mode   = this._drawingMode;

    if (mode === 'ORTHO' && lastPt && !this._shiftPressed) {
      // Axis-only: lock cursor to the dominant axis from last vertex.
      const dx = Math.abs(this._cursorPos.x - lastPt.x);
      const dz = Math.abs(this._cursorPos.z - lastPt.z);
      this._snappedCursorPos = dx >= dz
        ? { x: this._cursorPos.x, z: lastPt.z }
        : { x: lastPt.x, z: this._cursorPos.z };
    } else {
      // §FLOOR-LINEAR-FREEFORM (2026-05-22): LINEAR (and ARC, which currently
      // routes to LINEAR) are FREEFORM — any-angle segments, no axis/diagonal
      // snap, per the FloorDrawingMode contract ("LINEAR — freeform straight
      // segments, no axis snap"). The previous branch applied
      // calculateSnapPoint's 0/45/90 snap in LINEAR mode ("pre-mode behavior"),
      // so Lineal (L) behaved like a constrained orthogonal sketch — the
      // architect's reported bug. Only ORTHO (O) snaps now; everything else
      // (LINEAR, ARC, no last vertex, Shift held) uses the raw cursor.
      this._snappedCursorPos = { ...this._cursorPos };
    }

    this._updatePreviewObjects();
  }

  private _handleClick(e: PointerEvent, dom: HTMLElement): void {
    const worldPt = this._raycastGroundPlane(e, dom);
    if (!worldPt) return;

    const now = Date.now();
    const isDoubleClick = (now - this._lastClickTime) < DOUBLE_CLICK_MS;
    this._lastClickTime = now;

    const clickPt = this._snappedCursorPos;

    // ── RECTANGLE mode — 2-point axis-aligned commit ─────────────────────────
    if (this._drawingMode === 'RECTANGLE') {
      if (!this._rectAnchor) {
        this._rectAnchor = { ...clickPt };
        this._points = [{ ...clickPt }];
        this._state = 'DRAWING';
        this._addVertexMarker(clickPt);
        this._updatePreviewObjects();
        this._updateHUDText();
        console.log('[FloorTool] Rectangle anchor set:', clickPt);
        return;
      }
      // Second corner — emit a 4-vertex rectangle (CCW from min corner).
      const a = this._rectAnchor;
      const b = clickPt;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minZ = Math.min(a.z, b.z);
      const maxZ = Math.max(a.z, b.z);
      if (maxX - minX < 0.01 || maxZ - minZ < 0.01) {
        console.warn('[FloorTool] Rectangle too small — ignoring.');
        return;
      }
      this._points = [
        { x: minX, z: minZ },
        { x: maxX, z: minZ },
        { x: maxX, z: maxZ },
        { x: minX, z: maxZ },
      ];
      this._commitPolygon();
      return;
    }

    // ── POLYGON modes (LINEAR / ORTHO / ARC) ─────────────────────────────────
    // Double-click → commit polygon (≥ 3 points). Suppressed while an arc midpoint
    // is pending (the double-click would otherwise eat the arc-end click).
    if (isDoubleClick && this._points.length >= 3 && !this._arcMidPt) {
      this._commitPolygon();
      return;
    }

    // §FEAT-BOUNDARY-CURVE-DRAW — ARC mode: vertex → midpoint → end (wall pattern).
    if (this._drawingMode === 'ARC' && this._points.length > 0) {
      const last = this._points[this._points.length - 1]!;
      if (!this._arcMidPt) {
        // Click near first point (no pending mid) still closes the polygon below.
        const first = this._points[0];
        const closes = first && this._points.length >= 3 &&
          Math.hypot(clickPt.x - first.x, clickPt.z - first.z) <= CLOSURE_THRESHOLD;
        if (!closes) {
          this._arcMidPt = { ...clickPt };
          this._updatePreviewObjects();
          this._updateHUDText();
          console.log(`[FloorTool] Arc midpoint set: (${clickPt.x.toFixed(2)}, ${clickPt.z.toFixed(2)})`);
          return;
        }
      } else {
        // Arc END. If it lands on the first vertex, close the loop with the arc.
        const first = this._points[0]!;
        const closes = this._points.length >= 3 &&
          Math.hypot(clickPt.x - first.x, clickPt.z - first.z) <= CLOSURE_THRESHOLD;
        const end = closes ? { ...first } : { ...clickPt };
        const arcRun = arcSegmentThroughMidpoint(last, this._arcMidPt, end);
        if (closes) arcRun.pop(); // do not duplicate the first vertex
        this._points.push(...arcRun);
        this._segmentRuns.push(arcRun.length);
        this._arcMidPt = null;
        this._state = 'DRAWING';
        if (!closes) this._addVertexMarker(end);
        this._updatePreviewObjects();
        this._updateHUDText();
        console.log(`[FloorTool] Arc segment committed (${arcRun.length} tessellated verts). Total: ${this._points.length}`);
        if (closes) this._commitPolygon();
        return;
      }
    }

    // Click near first point → close polygon (≥ 3 existing points)
    const firstPt = this._points[0];
    if (firstPt && this._points.length >= 3) {
      const dx = clickPt.x - firstPt.x;
      const dz = clickPt.z - firstPt.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= CLOSURE_THRESHOLD) {
        this._commitPolygon();
        return;
      }
    }

    // Add vertex
    this._points.push({ ...clickPt });
    this._segmentRuns.push(1);
    this._state = 'DRAWING';
    this._addVertexMarker(clickPt);
    this._updatePreviewObjects();
    this._updateHUDText();
    console.log(`[FloorTool] Vertex added: (${clickPt.x.toFixed(2)}, ${clickPt.z.toFixed(2)}). Total: ${this._points.length}`);
  }

  private _commitPolygon(): void {
    if (this._points.length < 3) {
      console.warn('[FloorTool] Cannot commit polygon — need at least 3 vertices.');
      return;
    }
    this._state = 'DRAWING'; // keep state consistent while modal is shown
    this._hideHUD();          // ElementCreationModal takes over the foreground

    // Snapshot polygon before _cancel() clears this._points
    const polygon = this._points.slice();
    const area = computeArea(polygon);

    // Freeze drawing inputs but keep the preview fill visible
    this._detachListeners();
    if (this._cursorRing) this._cursorRing.visible = false;
    if (this._closingLine) this._closingLine.visible = false;

    this._deps.openCreationModal?.({
      params: {
        kind: 'floor',
        thickness:  this._finish().thicknessM,
        baseOffset: this._finish().baseOffsetM,
        systemTypeId: this._finish().systemTypeId,
      },
      polygonArea: area,
      systemTypes: this._resolveFloorTypeOptions(),
      onConfirm: (params) => {
        if (params.kind === 'floor') {
          // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the modal is ONE UI that FEEDS the
          // shared config store; it is not itself the source of truth. `_createFloor` then
          // re-resolves from the store, so a floor committed from 3D and a floor committed
          // from the plan modal cannot differ.
          setFloorToolConfig({
            thicknessM:   params.thickness,
            baseOffsetM:  params.baseOffset,
            systemTypeId: params.systemTypeId ?? '',
          });
        }
        // DRAW mode — the polygon is the user's stated geometry: stored verbatim (L-240 P3).
        this._createFloor(polygon, 'explicit-polygon');
        // CONTINUOUS-CREATION: reset polygon state but keep listeners + HUD.
        // Only ESC / deactivate() fully tears down.  Mirrors SlabTool.
        this._resetForNext();
      },
      onCancel: () => {
        // Cancelling the modal returns to drawing state; the user can keep
        // creating floors (or press ESC to leave the tool entirely).
        this._resetForNext();
      },
    });
  }

  /**
   * Reset the polygon state for the next floor while keeping listeners,
   * preview objects, camera state, and HUD attached.  Called after each
   * successful (or cancelled) floor commit.  Mirrors SlabTool._resetForNextSlab.
   */
  private _resetForNext(): void {
    this._cancel();
    this._rectAnchor = null;
    this._state = 'IDLE';
    // Re-attach listeners if they were detached during commit.
    if (this._isActive && this._drawingMode !== 'AUTO_FROM_ROOM' && !this._onPointerDown) {
      this._attachListeners();
    }
    if (this._cursorRing)  this._cursorRing.visible  = true;
    if (this._closingLine) this._closingLine.visible = false;
    this._showHUD();   // refresh prompt text for "first vertex"
  }

  /**
   * @param boundarySource §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — what `polygon`
   * MEANS, declared to the `CreateFloorCommand` chokepoint:
   *
   *   • AUTO_FROM_ROOM passes the room's boundary ring, which runs along the wall
   *     CENTRELINES → `'room-centreline'`. The command insets it to the bounding walls'
   *     INNER FACES. Before L-240 this tool shipped that ring RAW, so the finish overshot
   *     into every wall by half its thickness (the founder's bug). The geometry is NOT
   *     derived here: `@pryzm/geometry-slab` deliberately does not depend on
   *     `@pryzm/room-topology` (that edge would add a new arc to the core-app-model SCC),
   *     and the derivation is a rule of the ELEMENT TYPE, not of this tool.
   *   • DRAW passes the user's hand-drawn polygon → `'explicit-polygon'`, stored VERBATIM.
   *     The centroid room-autodetect below is a HOSTING link, never a licence to re-derive
   *     the user's stated geometry (C11 §Floor-finish boundary).
   */
  private _createFloor(
    polygon: FloorVertex[],
    boundarySource: 'room-centreline' | 'explicit-polygon',
  ): void {
    const cm = this._deps.getCommandManager?.();
    if (!cm) {
      console.error('[FloorTool] CommandManager not available.');
      return;
    }

    const levelId = projectContext.activeLevelId;
    if (!levelId) {
      console.error('[FloorTool] No active level selected.');
      return;
    }

    // In DRAW mode, auto-detect the room whose boundary contains the polygon centroid
    if (!this._pendingHostRoomId && this._drawingMode !== 'AUTO_FROM_ROOM') {
      this._pendingHostRoomId = this._detectRoomAtCentroid(polygon, levelId);
    }

    const floorId = crypto.randomUUID();
    const ifcGuid = crypto.randomUUID();

    // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — THE ONE RESOLUTION. Type, layers snapshot,
    // thickness and base offset (the FFL elevation) all come out of `resolveFloorFinish()`,
    // the same call `FloorPlanToolHandler` makes. The layer-snapshot walk that used to live
    // here (typeStore → getById → structuredClone) was a hand-copy the plan path never had;
    // it now lives INSIDE the resolver, so both paths get the identical immutable snapshot
    // (a later edit of the TYPE must not retroactively rewrite placed floors).
    //
    // NO LITERAL DIMENSION IS PERMITTED IN THIS METHOD — a number typed here is, by
    // definition, a number the other creation path cannot see. That is the bug (C11 §3).
    const finish = resolveFloorFinish(
      undefined,
      (this._deps.getFloorSystemTypeStore?.() as any) ?? floorSystemTypeStore,
    );

    const cmd = new CreateFloorCommand({
      floorId,
      ifcGuid,
      polygon,
      baseOffset: finish.baseOffsetM,
      thickness: finish.thicknessM,
      levelId,
      systemTypeId: finish.systemTypeId,
      layers: finish.layers,
      hostSlabId: this._pendingHostSlabId,
      hostRoomId: this._pendingHostRoomId,
      boundarySource,   // §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240)
      createdBy: 'user',
    });

    const validation = cmd.canExecute({ ...this._buildCommandContext(), stores: this._buildStores() });
    if (!validation.ok) {
      console.error(`[FloorTool] Cannot create floor: ${validation.reason}`);
      return;
    }

    cm.execute(cmd);
    console.log(`[FloorTool] Floor created: ${floorId} with ${polygon.length} vertices.`);
  }

  // ── Preview geometry ───────────────────────────────────────────────────────

  private _createPreviewObjects(): void {
    const scene = this._world.scene.three as THREE.Scene;

    // Cursor ring at floor level (FFL)
    const ringGeo = new THREE.RingGeometry(0.12, 0.18, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: FLOOR_PREVIEW_COLOR,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.7,
    });
    this._cursorRing = new THREE.Mesh(ringGeo, ringMat);
    this._cursorRing.rotation.x = -Math.PI / 2;
    this._cursorRing.renderOrder = 3;
    this._cursorRing.userData.isPreview = true;
    scene.add(this._cursorRing);
    this._previewObjects.push(this._cursorRing);

    // Main perimeter line at FFL
    const mainLineMat = new THREE.LineBasicMaterial({ color: FLOOR_PREVIEW_COLOR, depthTest: false });
    this._mainLine = new THREE.Line(new THREE.BufferGeometry(), mainLineMat);
    this._mainLine.visible = false;
    this._mainLine.userData.isPreview = true;
    scene.add(this._mainLine);
    this._previewObjects.push(this._mainLine);

    // Closing line (cursor → first vertex)
    const closingLineMat = new THREE.LineBasicMaterial({
      color: FLOOR_PREVIEW_COLOR,
      depthTest: false,
      transparent: true,
      opacity: 0.5,
    });
    this._closingLine = new THREE.Line(new THREE.BufferGeometry(), closingLineMat);
    this._closingLine.visible = false;
    this._closingLine.userData.isPreview = true;
    scene.add(this._closingLine);
    this._previewObjects.push(this._closingLine);
  }

  private _updatePreviewObjects(): void {
    const ffl = this._levelElevation + this._finish().baseOffsetM;
    const previewY = ffl + 0.005; // 5mm above FFL so it's visible
    const cursor = this._snappedCursorPos;

    // Cursor ring at FFL
    this._cursorRing?.position.set(cursor.x, previewY, cursor.z);

    if (this._points.length === 0) {
      this._mainLine && (this._mainLine.visible = false);
      this._closingLine && (this._closingLine.visible = false);
      this._disposePreviewFill();
      return;
    }

    // Main line — §FEAT-BOUNDARY-CURVE-DRAW: while an arc midpoint is pending, the
    // trailing segment previews as the tessellated Bézier through it to the cursor.
    const mainPts = this._points.map(p => new THREE.Vector3(p.x, previewY, p.z));
    if (this._drawingMode === 'ARC' && this._arcMidPt && this._points.length > 0) {
      const last = this._points[this._points.length - 1]!;
      for (const v of arcSegmentThroughMidpoint(last, this._arcMidPt, cursor)) {
        mainPts.push(new THREE.Vector3(v.x, previewY, v.z));
      }
    } else {
      mainPts.push(new THREE.Vector3(cursor.x, previewY, cursor.z));
    }
    this._mainLine!.geometry.dispose();
    this._mainLine!.geometry = new THREE.BufferGeometry().setFromPoints(mainPts);
    this._mainLine!.visible = true;

    // Closing line
    const firstPt = this._points[0];
    if (this._points.length >= 2 && firstPt) {
      const closingPts = [
        new THREE.Vector3(cursor.x, previewY, cursor.z),
        new THREE.Vector3(firstPt.x, previewY, firstPt.z),
      ];
      this._closingLine!.geometry.dispose();
      this._closingLine!.geometry = new THREE.BufferGeometry().setFromPoints(closingPts);
      this._closingLine!.visible = true;
    } else {
      this._closingLine!.visible = false;
    }

    // Preview fill (≥ 3 points)
    if (this._points.length >= 3) {
      this._updatePreviewFill(previewY, cursor);
    } else {
      this._disposePreviewFill();
    }
  }

  private _updatePreviewFill(previewY: number, cursor: FloorVertex): void {
    const scene = this._world.scene.three as THREE.Scene;
    const allPts = [...this._points, cursor];

    const firstPt = allPts[0]!;
    const shape = new THREE.Shape();
    shape.moveTo(firstPt.x, -firstPt.z);
    for (let i = 1; i < allPts.length; i++) {
      const pt = allPts[i]!;
      shape.lineTo(pt.x, -pt.z);
    }
    shape.closePath();

    if (this._previewFillMesh) {
      this._previewFillMesh.geometry.dispose();
      this._previewFillMesh.geometry = new THREE.ShapeGeometry(shape);
      this._previewFillMesh.position.y = previewY;
    } else {
      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({
        color: FLOOR_PREVIEW_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.2,
        depthTest: false,
      });
      this._previewFillMesh = new THREE.Mesh(geo, mat);
      this._previewFillMesh.rotation.x = -Math.PI / 2;
      this._previewFillMesh.position.y = previewY;
      this._previewFillMesh.userData.isPreview = true;
      this._previewFillMesh.renderOrder = 1;
      scene.add(this._previewFillMesh);
    }
  }

  private _disposePreviewFill(): void {
    const scene = this._world.scene.three as THREE.Scene;
    if (this._previewFillMesh) {
      this._previewFillMesh.geometry.dispose();
      (this._previewFillMesh.material as THREE.Material).dispose();
      scene.remove(this._previewFillMesh);
      this._previewFillMesh = null;
    }
  }

  private _addVertexMarker(pt: FloorVertex): void {
    const scene = this._world.scene.three as THREE.Scene;
    const markerY = this._levelElevation + this._finish().baseOffsetM + 0.01;
    const geo = new THREE.SphereGeometry(0.07, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: FLOOR_PREVIEW_COLOR, depthTest: false });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.set(pt.x, markerY, pt.z);
    marker.userData.isPreview = true;
    scene.add(marker);
    this._vertexMarkers.push(marker);
  }

  private _removeLastVertexMarker(): void {
    const scene = this._world.scene.three as THREE.Scene;
    const marker = this._vertexMarkers.pop();
    if (marker) {
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
      scene.remove(marker);
    }
  }

  private _disposeVertexMarkers(): void {
    const scene = this._world.scene.three as THREE.Scene;
    for (const m of this._vertexMarkers) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      scene.remove(m);
    }
    this._vertexMarkers = [];
  }

  private _cancel(): void {
    this._deps.dismissCreationModal?.();
    this._points = [];
    this._arcMidPt = null;
    this._segmentRuns = [];
    this._disposePreviewFill();
    this._disposeVertexMarkers();
    if (this._mainLine) this._mainLine.visible = false;
    if (this._closingLine) this._closingLine.visible = false;
  }

  // ── Guide HUD ──────────────────────────────────────────────────────────────
  // See Contract §42, docs/02-decisions/contracts/42-ELEMENT-CREATION-HUD-CONTRACT.md.

  private _showHUD(): void {
    this._hideHUD();
    const ui = document.createElement('div');
    ui.id = 'floor-tool-ui';
    ui.className = 'th-overlay';

    const text = document.createElement('div');
    text.className = 'th-text';
    ui.appendChild(text);

    document.body.appendChild(ui);
    this._hudEl = ui;
    this._hudText = text;
    this._updateHUDText();
  }

  private _updateHUDText(): void {
    if (!this._hudText) return;
    const m = this._drawingMode;
    if (m === 'AUTO_FROM_ROOM') {
      this._hudText.innerHTML =
        '<strong>Floor · Auto</strong> — Click inside a room to place · Esc to finish';
      return;
    }
    if (m === 'RECTANGLE') {
      this._hudText.innerHTML = !this._rectAnchor
        ? '<strong>Floor · Rectangle</strong> — Click to set first corner · Esc to finish'
        : '<strong>Floor · Rectangle</strong> — Click to set opposite corner · Esc to finish';
      return;
    }
    const modeLabel = m === 'ORTHO' ? 'Orthogonal' : (m === 'ARC' ? 'Curved' : 'Linear');
    const n = this._points.length;
    if (m === 'ARC' && n > 0) {
      this._hudText.innerHTML = this._arcMidPt
        ? '<strong>Floor · Curved</strong> — Click the arc END point · Backspace to re-pick midpoint · Esc to finish'
        : `<strong>Floor · Curved</strong> — Click the arc MIDPOINT (then its end)${n >= 3 ? ' · Click first point or Enter to finish' : ''} · Esc to finish`;
      return;
    }
    if (n === 0) {
      this._hudText.innerHTML =
        `<strong>Floor · ${modeLabel}</strong> — Click to set first vertex · Esc to finish`;
    } else if (n < 3) {
      this._hudText.innerHTML =
        `<strong>Floor · ${modeLabel}</strong> — Click to add vertex (${n} of at least 3) · Esc to finish`;
    } else {
      this._hudText.innerHTML =
        `<strong>Floor · ${modeLabel}</strong> — Click to add vertex · Click first point or Enter to finish · Esc to finish`;
    }
  }

  private _hideHUD(): void {
    if (this._hudEl) {
      this._hudEl.remove();
      this._hudEl = null;
      this._hudText = null;
    }
    const stale = document.getElementById('floor-tool-ui');
    if (stale) stale.remove();
  }

  private _disposePreviewObjects(): void {
    const scene = this._world.scene.three as THREE.Scene;
    for (const obj of this._previewObjects) {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).geometry.dispose();
        ((obj as THREE.Mesh).material as THREE.Material).dispose();
      } else if ((obj as any).isLine) {
        (obj as THREE.Line).geometry.dispose();
        ((obj as THREE.Line).material as THREE.Material).dispose();
      }
      scene.remove(obj);
    }
    this._previewObjects = [];
    this._mainLine = null;
    this._closingLine = null;
    this._cursorRing = null;
    this._disposePreviewFill();
    this._disposeVertexMarkers();
  }

  // ── Geometry helpers ───────────────────────────────────────────────────────

  private _raycastGroundPlane(e: PointerEvent, dom: HTMLElement): THREE.Vector3 | null {
    try {
      const rect = dom.getBoundingClientRect();
      const mouseVec = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycasterObj = this._components.get(OBC.Raycasters).get(this._world);
      const raycaster = (raycasterObj as any).three as THREE.Raycaster;
      raycaster.setFromCamera(mouseVec, this._world.camera.three as THREE.PerspectiveCamera);

      // Raycast at FFL elevation
      const groundY = this._levelElevation + this._finish().baseOffsetM;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, target);
      return target.lengthSq() > 0 ? target : null;
    } catch {
      return null;
    }
  }

  private _resolveElevation(): void {
    try {
      const bm = this._deps.getBimManager?.();
      const levelId = projectContext.activeLevelId;
      const level = bm?.getLevelById(levelId);
      this._levelElevation = level?.elevation ?? 0;
    } catch {
      this._levelElevation = 0;
    }
  }

  // ── Auto-from-room helpers ─────────────────────────────────────────────────

  private _attachRoomPickListener(): void {
    const renderer = this._world.renderer;
    if (!renderer) return;
    const dom = (renderer as any).three?.domElement as HTMLElement | null;
    if (!dom) {
      console.warn('[FloorTool] AUTO_FROM_ROOM: could not find renderer DOM element.');
      return;
    }

    this._onRoomPick = (e: PointerEvent) => {
      if (!this._isActive || e.button !== 0) return;
      e.preventDefault();
      const worldPt = this._raycastGroundPlane(e, dom);
      if (!worldPt) return;

      const levelId = projectContext.activeLevelId;
      const roomStore = window.roomStore; // TODO(TASK-08)
      if (!roomStore || !levelId) {
        console.warn('[FloorTool] AUTO_FROM_ROOM: roomStore or levelId not available');
        return;
      }

      const rooms: any[] = roomStore.getAll().filter((r: any) => r.levelId === levelId);
      const clickedPt = { x: worldPt.x, z: worldPt.z };
      const room = rooms.find(r => {
        const poly = r.boundary?.polygon;
        return poly && this._pointInPolygon(clickedPt, poly);
      });

      if (!room) {
        console.warn('[FloorTool] AUTO_FROM_ROOM: no room found at clicked point');
        return;
      }

      this._detachRoomPickListener();
      this._pendingHostRoomId = room.id;

      const polygon: FloorVertex[] = room.boundary.polygon.map((v: any) => ({ x: v.x, z: v.z }));
      const area = room.boundary.polygon.reduce((acc: number, _: any, i: number, arr: any[]) => {
        const j = (i + 1) % arr.length;
        return acc + arr[i].x * arr[j].z - arr[j].x * arr[i].z;
      }, 0);
      const polygonArea = Math.abs(area) / 2;

      this._deps.openCreationModal?.({
        params: {
          kind: 'floor',
          thickness:  this._finish().thicknessM,
          baseOffset: this._finish().baseOffsetM,
          systemTypeId: this._finish().systemTypeId,
        },
        polygonArea,
        systemTypes: this._resolveFloorTypeOptions(),
        onConfirm: (params) => {
          if (params.kind === 'floor') {
            // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — see _commitPolygon: the modal feeds
            // the ONE store; the record is re-resolved from it at commit.
            setFloorToolConfig({
              thicknessM:   params.thickness,
              baseOffsetM:  params.baseOffset,
              systemTypeId: params.systemTypeId ?? '',
            });
          }
          // §FIX-FLOOR-FINISH-INNER-FACE-ALL-PATHS (L-240) — `polygon` is the ROOM BOUNDARY
          // ring, which runs along the wall CENTRELINES. Declare that to the chokepoint;
          // CreateFloorCommand insets it to the bounding walls' INNER FACES, exactly as the
          // batch generators and the plan tool already did. Before this, the raw ring shipped
          // and the finish overshot half a wall thickness into every bounding wall.
          this._createFloor(polygon, 'room-centreline');
          this._pendingHostRoomId = undefined;
          // CONTINUOUS-CREATION: re-attach the room-pick listener so the user
          // can keep clicking rooms.  Only ESC fully tears down.
          if (this._isActive && this._drawingMode === 'AUTO_FROM_ROOM') {
            this._attachRoomPickListener();
            this._showHUD();
          }
        },
        onCancel: () => {
          this._pendingHostRoomId = undefined;
          if (this._isActive && this._drawingMode === 'AUTO_FROM_ROOM') {
            this._attachRoomPickListener();
            this._showHUD();
          }
        },
      });
    };

    dom.addEventListener('pointerdown', this._onRoomPick, { passive: false });

    this._onRoomEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.deactivate();
      }
    };
    document.addEventListener('keydown', this._onRoomEscKey);
    console.log('[FloorTool] AUTO_FROM_ROOM listener attached');
  }

  private _detachRoomPickListener(): void {
    if (!this._onRoomPick) return;
    const renderer = this._world.renderer;
    const dom = (renderer as any)?.three?.domElement as HTMLElement | null;
    if (dom) dom.removeEventListener('pointerdown', this._onRoomPick);
    this._onRoomPick = null;
    if (this._onRoomEscKey) {
      document.removeEventListener('keydown', this._onRoomEscKey);
      this._onRoomEscKey = null;
    }
  }

  /**
   * Given a polygon, compute its centroid and find which room (on the active level) contains it.
   * Returns the room id if found, undefined otherwise.
   */
  private _detectRoomAtCentroid(polygon: Array<{ x: number; z: number }>, levelId: string): string | undefined {
    if (!polygon.length) return undefined;
    const cx = polygon.reduce((s, v) => s + v.x, 0) / polygon.length;
    const cz = polygon.reduce((s, v) => s + v.z, 0) / polygon.length;
    const roomStore = window.roomStore; // TODO(TASK-08)
    if (!roomStore) return undefined;
    const rooms: any[] = roomStore.getAll().filter((r: any) => r.levelId === levelId);
    const match = rooms.find(r => {
      const poly = r.boundary?.polygon;
      return poly && this._pointInPolygon({ x: cx, z: cz }, poly);
    });
    if (match) {
      console.log(`[FloorTool] Linked floor to room: ${match.id} (${match.name ?? match.label ?? match.roomNumber})`);
    }
    return match?.id;
  }

  /** §C73-PIP-CANONICAL — delegates to the kernel's one even-odd body (XZ plane). */
  private _pointInPolygon(pt: { x: number; z: number }, polygon: Array<{ x: number; z: number }>): boolean {
    return pointInPolygonXZ(pt.x, pt.z, polygon);
  }

  // ── CommandContext helpers ─────────────────────────────────────────────────

  private _buildCommandContext(): any {
    const bm = this._deps.getBimManager?.();
    return { bimManager: bm, projectContext };
  }

  private _buildStores(): any {
    const fs = this._deps.getFloorStore?.();
    const fsts = this._deps.getFloorSystemTypeStore?.();
    return { floorStore: fs, floorSystemTypeStore: fsts };
  }
}
