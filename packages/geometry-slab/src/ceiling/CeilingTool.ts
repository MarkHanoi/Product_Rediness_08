/**
 * CeilingTool
 *
 * Contract: docs/01_ELEMENTS/12_Ceilings/05-CEILING-TYPE-SYSTEM-CONTRACT.md §2–§3
 *           docs/00_Contracts/49-FLOOR-CEILING-DRAWING-MODE-PARITY-CONTRACT.md
 *
 * State machine: IDLE → DRAWING → CONFIRMING → (createCeiling) → IDLE [continuous]
 *                ESC → deactivate
 *
 * Drawing modes (uniform with WallTool / FloorTool):
 *   • LINEAR     — freeform polygon, axis + diagonal snap
 *   • ORTHO      — 90°-constrained polygon
 *   • ARC        — arc segments  (currently routes to LINEAR — true arc draw deferred)
 *   • RECTANGLE  — 2-click axis-aligned rectangle, commits immediately
 *   • AUTO_FROM_ROOM — click inside a room to use room boundary
 *
 * Continuous creation pattern (mirrors SlabTool):
 *   After each successful creation the polygon state resets but listeners,
 *   camera lock, and HUD remain attached.  Only ESC, exitDrawing(), or
 *   deactivate() fully tears down.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreateCeilingCommand } from '@pryzm/command-registry';
import { CeilingVertex, CeilingToolState, CeilingLayer } from '@pryzm/core-app-model/stores';
import { computeCeilingArea as computeArea } from '@pryzm/core-app-model/stores';
import { projectContext } from '@pryzm/core-app-model';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';

export interface CeilingCreationParams {
  kind: 'ceiling';
  height: number;
  thickness: number;
}
export interface CeilingModalOptions {
  params: CeilingCreationParams;
  polygonArea?: number;
  onConfirm: (params: CeilingCreationParams) => void;
  onCancel: () => void;
}

export type CeilingDrawingMode = 'LINEAR' | 'ORTHO' | 'ARC' | 'RECTANGLE' | 'AUTO_FROM_ROOM';

// §41 (2026-05-22): unified to the single PRYZM brand purple #6600FF — every
// creation preview reads identically (was 0x818cf8 indigo). NOTE: kept as a
// LITERAL, not PREVIEW_COLOR.PRIMARY, deliberately — this const is evaluated at
// module-load time and core-app-model ↔ geometry-* form a circular dependency
// (SCC); reading the barrel here at load time can see an uninitialised
// PREVIEW_COLOR (undefined) → TypeError → white screen. Keep in sync with
// PREVIEW_COLOR.PRIMARY in PreviewStyle.ts (Contract §41 §2).
const CEILING_PREVIEW_COLOR = 0x6600ff;
const CLOSURE_THRESHOLD = 0.25;           // metres
const DOUBLE_CLICK_MS = 300;

export interface CeilingToolDeps {
  getCommandManager?: () => any;
  getCeilingStore?: () => any;
  getCeilingSystemTypeStore?: () => any;
  getBimManager?: () => any;
  openCreationModal?: (opts: CeilingModalOptions) => void;
  dismissCreationModal?: () => void;
}

export class CeilingTool {
  private readonly _world: OBC.World;
  private readonly _components: OBC.Components;
  private _deps: CeilingToolDeps;

  // State machine
  private _state: CeilingToolState = 'IDLE';
  private _isActive = false;

  // Drawing mode (LINEAR / ORTHO / ARC / RECTANGLE / AUTO_FROM_ROOM)
  private _drawingMode: CeilingDrawingMode = 'LINEAR';

  // Auto-from-room single-click listener + ESC key listener
  private _onRoomPick: ((e: PointerEvent) => void) | null = null;
  private _onRoomEscKey: ((e: KeyboardEvent) => void) | null = null;

  // Polygon accumulation
  private _points: CeilingVertex[] = [];
  private _cursorPos: CeilingVertex = { x: 0, z: 0 };
  private _snappedCursorPos: CeilingVertex = { x: 0, z: 0 };
  private _levelElevation = 0;
  private _shiftPressed = false;
  private _lastClickTime = 0;

  // Rectangle (2-point) drawing anchor
  private _rectAnchor: CeilingVertex | null = null;

  // Pending system type (set by property panel before activation)
  private _pendingSystemTypeId: string | undefined;
  private _pendingHeight = 2.7;   // metres above level datum
  private _pendingThickness = 0.025;
  // Room linkage — set when AUTO_FROM_ROOM detects a room or when draw polygon overlaps a room
  private _pendingHostRoomId: string | undefined;

  // Preview scene objects
  private _previewObjects: THREE.Object3D[] = [];
  private _mainLine: THREE.Line | null = null;
  private _closingLine: THREE.Line | null = null;
  private _groundMainLine: THREE.Line | null = null;
  private _groundClosingLine: THREE.Line | null = null;
  private _previewFillMesh: THREE.Mesh | null = null;
  private _groundFillMesh: THREE.Mesh | null = null;
  private _vertexMarkers: THREE.Mesh[] = [];
  private _cursorSphere: THREE.Mesh | null = null;
  private _groundCursorRing: THREE.Mesh | null = null;

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
    deps: CeilingToolDeps = {}
  ) {
    this._world = world;
    this._components = components;
    this._deps = deps;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get isActive(): boolean { return this._isActive; }
  get state(): CeilingToolState { return this._state; }

  setDeps(deps: Partial<CeilingToolDeps>): void {
    this._deps = { ...this._deps, ...deps };
  }

  /** Active drawing mode (read by Layout / plan handlers). */
  getDrawingMode(): CeilingDrawingMode { return this._drawingMode; }

  /**
   * Set the drawing mode.  Accepts both the new enum and the legacy
   * 'DRAW' / 'AUTO_FROM_ROOM' strings for backwards compatibility.
   */
  setMode(mode: CeilingDrawingMode | 'DRAW'): void {
    const normalized: CeilingDrawingMode =
      mode === 'DRAW' ? 'LINEAR' : mode;
    this.setDrawingMode(normalized);
  }

  /** Switch drawing mode mid-session.  Re-attaches the appropriate listener set. */
  setDrawingMode(mode: CeilingDrawingMode): void {
    if (this._drawingMode === mode) return;
    const wasAuto    = this._drawingMode === 'AUTO_FROM_ROOM';
    const switchAuto = mode === 'AUTO_FROM_ROOM';
    this._drawingMode = mode;
    this._rectAnchor = null;

    if (this._isActive && wasAuto !== switchAuto) {
      if (switchAuto) {
        this._detachListeners();
        this._attachRoomPickListener();
      } else {
        this._detachRoomPickListener();
        this._attachListeners();
        if (!this._cursorSphere) this._createPreviewObjects();
      }
    }
    this._updateHUDText();
    console.log('[CeilingTool] setDrawingMode →', mode);
  }

  setPendingSystemType(id: string | undefined): void {
    this._pendingSystemTypeId = id;
  }

  setPendingHeight(h: number): void {
    if (h > 0) this._pendingHeight = h;
  }

  setPendingThickness(t: number): void {
    if (t > 0) this._pendingThickness = t;
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
      console.log('[CeilingTool] Activated in AUTO_FROM_ROOM mode — click inside a room to create ceiling');
    } else {
      this._createPreviewObjects();
      this._attachListeners();
      console.log('[CeilingTool] Activated.', { mode: this._drawingMode });
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
    console.log('[CeilingTool] Deactivated.');
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
      console.warn('[CeilingTool] Could not find renderer DOM element.');
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
      // — mirrors FloorTool. No log on Enter in 3D ⇒ this tool isn't the active
      // handler there (ToolManager routed to the plan handler); a log with
      // points<3 ⇒ vertices weren't captured in 3D.
      if (e.key === 'Enter') {
        // §FLOOR-3D-ENTER self-diagnosing probe (mirrors FloorTool): one 3D Enter press
        // now states the exact decision/cause.
        const reason = !this._isActive
          ? 'IGNORED — tool not active in this view (routing/activation problem)'
          : this._points.length < 3
            ? 'IGNORED — fewer than 3 points (clicks not accumulating in 3D — raycast/level?)'
            : 'COMMITTING — calling _commitPolygon()';
        console.log(
          `[CeilingTool] §FLOOR-3D-ENTER Enter — active=${this._isActive} ` +
          `points=${this._points.length} → ${reason}`,
        );
      }
      if (!this._isActive) return;
      if (e.key === 'Shift') { this._shiftPressed = true; return; }
      if (e.key === 'Escape') { this.deactivate(); return; }
      if (e.key === 'Enter' && this._points.length >= 3) { this._commitPolygon(); }
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
      const dx = Math.abs(this._cursorPos.x - lastPt.x);
      const dz = Math.abs(this._cursorPos.z - lastPt.z);
      this._snappedCursorPos = dx >= dz
        ? { x: this._cursorPos.x, z: lastPt.z }
        : { x: lastPt.x, z: this._cursorPos.z };
    } else {
      // §FLOOR-LINEAR-FREEFORM (2026-05-22): LINEAR (and ARC, routing to LINEAR)
      // are FREEFORM — any-angle segments, no axis/diagonal snap. Previously
      // LINEAR called calculateSnapPoint (0/45/90 snap), so Lineal (L) behaved
      // like a constrained orthogonal sketch — the architect's reported bug.
      // Only ORTHO (O) snaps now. Mirrors the FloorTool fix.
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
        console.log('[CeilingTool] Rectangle anchor set:', clickPt);
        return;
      }
      const a = this._rectAnchor;
      const b = clickPt;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minZ = Math.min(a.z, b.z);
      const maxZ = Math.max(a.z, b.z);
      if (maxX - minX < 0.01 || maxZ - minZ < 0.01) {
        console.warn('[CeilingTool] Rectangle too small — ignoring.');
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
    if (isDoubleClick && this._points.length >= 3) {
      this._commitPolygon();
      return;
    }

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

    this._points.push({ ...clickPt });
    this._state = 'DRAWING';
    this._addVertexMarker(clickPt);
    this._updatePreviewObjects();
    this._updateHUDText();
    console.log(`[CeilingTool] Vertex added: (${clickPt.x}, ${clickPt.z}). Total: ${this._points.length}`);
  }

  private _commitPolygon(): void {
    if (this._points.length < 3) return;
    this._state = 'CONFIRMING';
    this._hideHUD(); // ElementCreationModal takes over the foreground

    // Snapshot the polygon now — _cancel() will clear this._points
    const polygon = this._points.slice();
    const area = computeArea(polygon);

    // Freeze drawing (remove listeners + scene cursors) but keep the
    // filled preview visible so the user can see what they drew.
    this._detachListeners();
    if (this._cursorSphere) this._cursorSphere.visible = false;
    if (this._groundCursorRing) this._groundCursorRing.visible = false;
    if (this._closingLine) this._closingLine.visible = false;
    if (this._groundClosingLine) this._groundClosingLine.visible = false;

    this._deps.openCreationModal?.({
      params: {
        kind: 'ceiling',
        height:    this._pendingHeight,
        thickness: this._pendingThickness,
      },
      polygonArea: area,
      onConfirm: (params) => {
        if (params.kind === 'ceiling') {
          this._pendingHeight    = params.height;
          this._pendingThickness = params.thickness;
        }
        this._createCeiling(polygon);
        // CONTINUOUS-CREATION: reset polygon state but keep listeners + HUD.
        this._resetForNext();
      },
      onCancel: () => {
        this._resetForNext();
      },
    });
  }

  /**
   * Reset for the next ceiling.  Keeps listeners, preview objects, camera
   * state, and HUD attached.  Mirrors SlabTool._resetForNextSlab.
   */
  private _resetForNext(): void {
    this._cancel();
    this._rectAnchor = null;
    this._state = 'IDLE';
    if (this._isActive && this._drawingMode !== 'AUTO_FROM_ROOM' && !this._onPointerDown) {
      this._attachListeners();
    }
    if (this._cursorSphere)     this._cursorSphere.visible = true;
    if (this._groundCursorRing) this._groundCursorRing.visible = true;
    if (this._closingLine)      this._closingLine.visible = false;
    if (this._groundClosingLine) this._groundClosingLine.visible = false;
    this._showHUD();
  }

  private _createCeiling(polygon: CeilingVertex[]): void {
    const cm = this._deps.getCommandManager?.();
    if (!cm) {
      console.error('[CeilingTool] CommandManager not available.');
      return;
    }

    const levelId = projectContext.activeLevelId;
    if (!levelId) {
      console.error('[CeilingTool] No active level.');
      return;
    }

    // In DRAW mode, auto-detect the room whose boundary contains the polygon centroid
    if (!this._pendingHostRoomId && this._drawingMode !== 'AUTO_FROM_ROOM') {
      this._pendingHostRoomId = this._detectRoomAtCentroid(polygon, levelId);
    }

    const ceilingId = crypto.randomUUID();
    const ifcGuid = crypto.randomUUID();

    // Resolve layers snapshot from the selected system type, so the element stores
    // its own immutable layer list (type edits won't retroactively change existing ceilings).
    let resolvedLayers: CeilingLayer[] | undefined;
    if (this._pendingSystemTypeId) {
      const typeStore = (this._deps.getCeilingSystemTypeStore?.() as any) ?? ceilingSystemTypeStore;
      const sysType = typeStore.getById?.(this._pendingSystemTypeId);
      if (sysType?.layers?.length) {
        resolvedLayers = structuredClone(sysType.layers) as CeilingLayer[];
      }
    }

    const cmd = new CreateCeilingCommand({
      ceilingId,
      ifcGuid,
      polygon,
      height: this._pendingHeight,
      thickness: this._pendingThickness,
      baseOffset: 0,
      levelId,
      systemTypeId: this._pendingSystemTypeId,
      layers: resolvedLayers,
      hostRoomId: this._pendingHostRoomId,
      createdBy: 'user',
    });

    const validation = cmd.canExecute({ ...this._buildCommandContext(), stores: this._buildStores() });
    if (!validation.ok) {
      console.error(`[CeilingTool] Cannot create ceiling: ${validation.reason}`);
      return;
    }

    cm.execute(cmd);
    console.log(`[CeilingTool] Ceiling created: ${ceilingId} with ${polygon.length} vertices.`);
  }

  // ── Preview geometry ───────────────────────────────────────────────────────

  private _createPreviewObjects(): void {
    const scene = this._world.scene.three as THREE.Scene;

    // Cursor sphere at ceiling height
    const sphereGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: CEILING_PREVIEW_COLOR, depthTest: false });
    this._cursorSphere = new THREE.Mesh(sphereGeo, sphereMat);
    this._cursorSphere.renderOrder = 3;
    this._cursorSphere.userData.isPreview = true;
    scene.add(this._cursorSphere);
    this._previewObjects.push(this._cursorSphere);

    // Ground cursor ring
    const ringGeo = new THREE.RingGeometry(0.15, 0.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: CEILING_PREVIEW_COLOR,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.5,
    });
    this._groundCursorRing = new THREE.Mesh(ringGeo, ringMat);
    this._groundCursorRing.rotation.x = -Math.PI / 2;
    this._groundCursorRing.renderOrder = 2;
    this._groundCursorRing.userData.isPreview = true;
    scene.add(this._groundCursorRing);
    this._previewObjects.push(this._groundCursorRing);

    // Main line (ceiling height)
    const mainLineMat = new THREE.LineBasicMaterial({ color: CEILING_PREVIEW_COLOR, depthTest: false });
    this._mainLine = new THREE.Line(new THREE.BufferGeometry(), mainLineMat);
    this._mainLine.visible = false;
    this._mainLine.userData.isPreview = true;
    scene.add(this._mainLine);
    this._previewObjects.push(this._mainLine);

    // Closing line
    const closingLineMat = new THREE.LineBasicMaterial({ color: CEILING_PREVIEW_COLOR, depthTest: false, transparent: true, opacity: 0.5 });
    this._closingLine = new THREE.Line(new THREE.BufferGeometry(), closingLineMat);
    this._closingLine.visible = false;
    this._closingLine.userData.isPreview = true;
    scene.add(this._closingLine);
    this._previewObjects.push(this._closingLine);

    // Ground main line
    const groundMainMat = new THREE.LineBasicMaterial({ color: CEILING_PREVIEW_COLOR, depthTest: false, transparent: true, opacity: 0.3 });
    this._groundMainLine = new THREE.Line(new THREE.BufferGeometry(), groundMainMat);
    this._groundMainLine.visible = false;
    this._groundMainLine.userData.isPreview = true;
    scene.add(this._groundMainLine);
    this._previewObjects.push(this._groundMainLine);

    // Ground closing line
    const groundClosingMat = new THREE.LineBasicMaterial({ color: CEILING_PREVIEW_COLOR, depthTest: false, transparent: true, opacity: 0.15 });
    this._groundClosingLine = new THREE.Line(new THREE.BufferGeometry(), groundClosingMat);
    this._groundClosingLine.visible = false;
    this._groundClosingLine.userData.isPreview = true;
    scene.add(this._groundClosingLine);
    this._previewObjects.push(this._groundClosingLine);
  }

  private _updatePreviewObjects(): void {
    const el = this._levelElevation;
    const ceilingY = el + this._pendingHeight;
    const gridY = el + 0.02;
    const cursor = this._snappedCursorPos;

    // Cursor sphere at ceiling height
    this._cursorSphere?.position.set(cursor.x, ceilingY, cursor.z);
    // Ground cursor ring
    this._groundCursorRing?.position.set(cursor.x, gridY, cursor.z);

    if (this._points.length === 0) {
      this._mainLine && (this._mainLine.visible = false);
      this._closingLine && (this._closingLine.visible = false);
      this._groundMainLine && (this._groundMainLine.visible = false);
      this._groundClosingLine && (this._groundClosingLine.visible = false);
      this._disposePreviewFills();
      return;
    }

    // Main line (ceiling height)
    const mainPts = this._points.map(p => new THREE.Vector3(p.x, ceilingY, p.z));
    mainPts.push(new THREE.Vector3(cursor.x, ceilingY, cursor.z));
    this._mainLine!.geometry.dispose();
    this._mainLine!.geometry = new THREE.BufferGeometry().setFromPoints(mainPts);
    this._mainLine!.visible = true;

    // Ground main line
    const groundMainPts = this._points.map(p => new THREE.Vector3(p.x, gridY, p.z));
    groundMainPts.push(new THREE.Vector3(cursor.x, gridY, cursor.z));
    this._groundMainLine!.geometry.dispose();
    this._groundMainLine!.geometry = new THREE.BufferGeometry().setFromPoints(groundMainPts);
    this._groundMainLine!.visible = true;

    // Closing line (from cursor back to first point)
    const firstPt = this._points[0];
    if (this._points.length >= 2 && firstPt) {
      const closingPts = [
        new THREE.Vector3(cursor.x, ceilingY, cursor.z),
        new THREE.Vector3(firstPt.x, ceilingY, firstPt.z),
      ];
      this._closingLine!.geometry.dispose();
      this._closingLine!.geometry = new THREE.BufferGeometry().setFromPoints(closingPts);
      this._closingLine!.visible = true;

      const groundClosingPts = [
        new THREE.Vector3(cursor.x, gridY, cursor.z),
        new THREE.Vector3(firstPt.x, gridY, firstPt.z),
      ];
      this._groundClosingLine!.geometry.dispose();
      this._groundClosingLine!.geometry = new THREE.BufferGeometry().setFromPoints(groundClosingPts);
      this._groundClosingLine!.visible = true;
    } else {
      this._closingLine!.visible = false;
      this._groundClosingLine!.visible = false;
    }

    // Preview fill (≥ 3 points)
    if (this._points.length >= 3) {
      this._updatePreviewFill(ceilingY, gridY, cursor);
    } else {
      this._disposePreviewFills();
    }
  }

  private _updatePreviewFill(ceilingY: number, gridY: number, cursor: CeilingVertex): void {
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

    // Ceiling height fill
    if (this._previewFillMesh) {
      this._previewFillMesh.geometry.dispose();
      this._previewFillMesh.geometry = new THREE.ShapeGeometry(shape);
      this._previewFillMesh.position.y = ceilingY;
    } else {
      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({
        color: CEILING_PREVIEW_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.15,
        depthTest: false,
      });
      this._previewFillMesh = new THREE.Mesh(geo, mat);
      this._previewFillMesh.rotation.x = -Math.PI / 2;
      this._previewFillMesh.position.y = ceilingY;
      this._previewFillMesh.userData.isPreview = true;
      this._previewFillMesh.renderOrder = 1;
      scene.add(this._previewFillMesh);
    }

    // Ground fill
    if (this._groundFillMesh) {
      this._groundFillMesh.geometry.dispose();
      this._groundFillMesh.geometry = new THREE.ShapeGeometry(shape.clone());
      this._groundFillMesh.position.y = gridY;
    } else {
      const geo = new THREE.ShapeGeometry(shape.clone());
      const mat = new THREE.MeshBasicMaterial({
        color: CEILING_PREVIEW_COLOR,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.1,
        depthTest: false,
      });
      this._groundFillMesh = new THREE.Mesh(geo, mat);
      this._groundFillMesh.rotation.x = -Math.PI / 2;
      this._groundFillMesh.position.y = gridY;
      this._groundFillMesh.userData.isPreview = true;
      this._groundFillMesh.renderOrder = 0;
      scene.add(this._groundFillMesh);
    }
  }

  private _disposePreviewFills(): void {
    const scene = this._world.scene.three as THREE.Scene;
    if (this._previewFillMesh) {
      this._previewFillMesh.geometry.dispose();
      (this._previewFillMesh.material as THREE.Material).dispose();
      scene.remove(this._previewFillMesh);
      this._previewFillMesh = null;
    }
    if (this._groundFillMesh) {
      this._groundFillMesh.geometry.dispose();
      (this._groundFillMesh.material as THREE.Material).dispose();
      scene.remove(this._groundFillMesh);
      this._groundFillMesh = null;
    }
  }

  private _addVertexMarker(pt: CeilingVertex): void {
    const scene = this._world.scene.three as THREE.Scene;
    const ceilingY = this._levelElevation + this._pendingHeight;
    const geo = new THREE.SphereGeometry(0.08, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: CEILING_PREVIEW_COLOR, depthTest: false });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.set(pt.x, ceilingY + 0.01, pt.z);
    marker.userData.isPreview = true;
    scene.add(marker);
    this._vertexMarkers.push(marker);
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
    this._disposePreviewFills();
    this._disposeVertexMarkers();
    if (this._mainLine) this._mainLine.visible = false;
    if (this._closingLine) this._closingLine.visible = false;
    if (this._groundMainLine) this._groundMainLine.visible = false;
    if (this._groundClosingLine) this._groundClosingLine.visible = false;
  }

  // ── Guide HUD ──────────────────────────────────────────────────────────────
  // See Contract §42, docs/00_Contracts/42-ELEMENT-CREATION-HUD-CONTRACT.md.

  private _showHUD(): void {
    this._hideHUD();
    const ui = document.createElement('div');
    ui.id = 'ceiling-tool-ui';
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
        '<strong>Ceiling · Auto</strong> — Click inside a room to place · Esc to finish';
      return;
    }
    if (m === 'RECTANGLE') {
      this._hudText.innerHTML = !this._rectAnchor
        ? '<strong>Ceiling · Rectangle</strong> — Click to set first corner · Esc to finish'
        : '<strong>Ceiling · Rectangle</strong> — Click to set opposite corner · Esc to finish';
      return;
    }
    const modeLabel = m === 'ORTHO' ? 'Orthogonal' : (m === 'ARC' ? 'Curved' : 'Linear');
    const n = this._points.length;
    if (n === 0) {
      this._hudText.innerHTML =
        `<strong>Ceiling · ${modeLabel}</strong> — Click to set first vertex · Esc to finish`;
    } else if (n < 3) {
      this._hudText.innerHTML =
        `<strong>Ceiling · ${modeLabel}</strong> — Click to add vertex (${n} of at least 3) · Esc to finish`;
    } else {
      this._hudText.innerHTML =
        `<strong>Ceiling · ${modeLabel}</strong> — Click to add vertex · Click first point or Enter to finish · Esc to finish`;
    }
  }

  private _hideHUD(): void {
    if (this._hudEl) {
      this._hudEl.remove();
      this._hudEl = null;
      this._hudText = null;
    }
    const stale = document.getElementById('ceiling-tool-ui');
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
    this._groundMainLine = null;
    this._groundClosingLine = null;
    this._cursorSphere = null;
    this._groundCursorRing = null;
    this._disposePreviewFills();
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

      const groundY = this._levelElevation;
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
      console.warn('[CeilingTool] AUTO_FROM_ROOM: could not find renderer DOM element.');
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
        console.warn('[CeilingTool] AUTO_FROM_ROOM: roomStore or levelId not available');
        return;
      }

      const rooms: any[] = roomStore.getAll().filter((r: any) => r.levelId === levelId);
      const clickedPt = { x: worldPt.x, z: worldPt.z };
      const room = rooms.find(r => {
        const poly = r.boundary?.polygon;
        return poly && this._pointInPolygon(clickedPt, poly);
      });

      if (!room) {
        console.warn('[CeilingTool] AUTO_FROM_ROOM: no room found at clicked point');
        return;
      }

      this._detachRoomPickListener();
      this._pendingHostRoomId = room.id;

      const polygon: CeilingVertex[] = room.boundary.polygon.map((v: any) => ({ x: v.x, z: v.z }));
      const area = room.boundary.polygon.reduce((acc: number, _: any, i: number, arr: any[]) => {
        const j = (i + 1) % arr.length;
        return acc + arr[i].x * arr[j].z - arr[j].x * arr[i].z;
      }, 0);
      const polygonArea = Math.abs(area) / 2;

      this._deps.openCreationModal?.({
        params: {
          kind: 'ceiling',
          height:    this._pendingHeight,
          thickness: this._pendingThickness,
        },
        polygonArea,
        onConfirm: (params) => {
          if (params.kind === 'ceiling') {
            this._pendingHeight    = params.height;
            this._pendingThickness = params.thickness;
          }
          this._createCeiling(polygon);
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
    console.log('[CeilingTool] AUTO_FROM_ROOM listener attached');
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
      console.log(`[CeilingTool] Linked ceiling to room: ${match.id} (${match.name ?? match.label ?? match.roomNumber})`);
    }
    return match?.id;
  }

  /**
   * Point-in-polygon test using ray casting (works for any simple polygon).
   * Polygon vertices are { x, z } (XZ plane).
   */
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
    return {
      bimManager: bm,
      projectContext,
    };
  }

  private _buildStores(): any {
    const cs = this._deps.getCeilingStore?.();
    const csts = this._deps.getCeilingSystemTypeStore?.();
    return { ceilingStore: cs, ceilingSystemTypeStore: csts };
  }
}
