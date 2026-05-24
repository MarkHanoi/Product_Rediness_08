/**
 * FloorTool — Drawing tool for the Floor Finish subsystem.
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/03-FLOOR-COMMAND-PIPELINE-CONTRACT.md §2–§3
 *           docs/00_Contracts/49-FLOOR-CEILING-DRAWING-MODE-PARITY-CONTRACT.md
 *
 * State machine: IDLE → DRAWING → (createFloor) → IDLE  [continuous]
 *                ESC → deactivate
 *
 * Drawing modes (uniform with WallTool / CeilingTool):
 *   • LINEAR     — freeform straight segments, no axis snap
 *   • ORTHO      — 90°-constrained polygon (axis-only snap from previous vertex)
 *   • ARC        — arc segments  (currently routes to LINEAR — true arc draw deferred)
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
import { CreateFloorCommand } from '@pryzm/command-registry';
import { FloorVertex, FloorToolState, FloorLayer } from '@pryzm/core-app-model/stores';
import { computeFloorArea as computeArea } from '@pryzm/core-app-model/stores';
import { projectContext } from '@pryzm/core-app-model';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';

export interface FloorCreationParams {
  kind: 'floor';
  thickness: number;
  baseOffset: number;
}
export interface FloorModalOptions {
  params: FloorCreationParams;
  polygonArea?: number;
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

  // Pending floor parameters (set by property panel before activation)
  private _pendingSystemTypeId: string | undefined;
  // Room linkage — set when AUTO_FROM_ROOM detects a room or when draw polygon overlaps a room
  private _pendingHostRoomId: string | undefined;
  private _pendingBaseOffset = 0;      // Y offset above level datum (metres)
  private _pendingThickness = 0.075;   // Assembly thickness (metres) — default 75 mm screed+tile
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

    // Mode-switch hygiene: clear in-flight rectangle anchor, keep already-placed polygon points.
    this._rectAnchor = null;

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

  setPendingSystemType(id: string | undefined): void {
    this._pendingSystemTypeId = id;
  }

  setPendingBaseOffset(offset: number): void {
    if (offset >= 0) this._pendingBaseOffset = offset;
  }

  setPendingThickness(t: number): void {
    if (t > 0) this._pendingThickness = t;
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
      console.log('[FloorTool] Activated.', { mode: this._drawingMode, ffl: this._levelElevation + this._pendingBaseOffset });
    }
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
      if (e.key === 'Escape') { this.deactivate(); return; }
      if (e.key === 'Enter' && this._points.length >= 3) { this._commitPolygon(); }
      if (e.key === 'Backspace' && this._points.length > 0) {
        // Undo last vertex
        this._points.pop();
        this._removeLastVertexMarker();
        this._updatePreviewObjects();
        if (this._points.length === 0) this._state = 'IDLE';
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
    // Double-click → commit polygon (≥ 3 points)
    if (isDoubleClick && this._points.length >= 3) {
      this._commitPolygon();
      return;
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
        thickness:  this._pendingThickness,
        baseOffset: this._pendingBaseOffset,
      },
      polygonArea: area,
      onConfirm: (params) => {
        if (params.kind === 'floor') {
          this._pendingThickness  = params.thickness;
          this._pendingBaseOffset = params.baseOffset;
        }
        this._createFloor(polygon);
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

  private _createFloor(polygon: FloorVertex[]): void {
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

    // Resolve layers snapshot from the selected system type, so the element stores
    // its own immutable layer list (type edits won't retroactively change existing floors).
    let resolvedLayers: FloorLayer[] | undefined;
    if (this._pendingSystemTypeId) {
      const typeStore = (this._deps.getFloorSystemTypeStore?.() as any) ?? floorSystemTypeStore;
      const sysType = typeStore.getById?.(this._pendingSystemTypeId);
      if (sysType?.layers?.length) {
        resolvedLayers = structuredClone(sysType.layers) as FloorLayer[];
      }
    }

    const cmd = new CreateFloorCommand({
      floorId,
      ifcGuid,
      polygon,
      baseOffset: this._pendingBaseOffset,
      thickness: this._pendingThickness,
      levelId,
      systemTypeId: this._pendingSystemTypeId,
      layers: resolvedLayers,
      hostSlabId: this._pendingHostSlabId,
      hostRoomId: this._pendingHostRoomId,
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
    const ffl = this._levelElevation + this._pendingBaseOffset;
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

    // Main line
    const mainPts = this._points.map(p => new THREE.Vector3(p.x, previewY, p.z));
    mainPts.push(new THREE.Vector3(cursor.x, previewY, cursor.z));
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
    const markerY = this._levelElevation + this._pendingBaseOffset + 0.01;
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
    this._disposePreviewFill();
    this._disposeVertexMarkers();
    if (this._mainLine) this._mainLine.visible = false;
    if (this._closingLine) this._closingLine.visible = false;
  }

  // ── Guide HUD ──────────────────────────────────────────────────────────────
  // See Contract §42, docs/00_Contracts/42-ELEMENT-CREATION-HUD-CONTRACT.md.

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
      const groundY = this._levelElevation + this._pendingBaseOffset;
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
          thickness:  this._pendingThickness,
          baseOffset: this._pendingBaseOffset,
        },
        polygonArea,
        onConfirm: (params) => {
          if (params.kind === 'floor') {
            this._pendingThickness  = params.thickness;
            this._pendingBaseOffset = params.baseOffset;
          }
          this._createFloor(polygon);
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

  private _pointInPolygon(pt: { x: number; z: number }, polygon: Array<{ x: number; z: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, zi = polygon[i].z;
      const xj = polygon[j].x, zj = polygon[j].z;
      const intersect = ((zi > pt.z) !== (zj > pt.z)) &&
        pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
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
