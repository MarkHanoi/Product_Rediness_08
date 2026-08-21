/**
 * RoomBoundaryBuilder — THREE.js mesh overlay for room floor fills + 3D volumes.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. Import remapping:
 *   ../../../ui/UiPreferences → @pryzm/core-app-model
 */

import * as THREE from '@pryzm/renderer-three/three';
// §GPU-RESOURCE-LIFETIME (ADR-0297 INVARIANT L2) — see removeRoom().
import { scheduleGpuRelease } from '@pryzm/renderer-three';
import { RoomData } from './RoomTypes';
import { RoomColourSystem, RoomVisualisationMode, DEFAULT_UNIFORM_FILL } from './RoomColourSystem';
import { BimManager } from '@pryzm/core-app-model';
import { UiPreferences } from '@pryzm/core-app-model';
// §ROOM-VG-CATEGORY (L-1610) -- the room colour MODE is a VG category property
// resolved per view, not a field on this builder. This builder is the mechanism;
// vgGovernanceStore is the authority. See core-app-model/presentation/RoomColourIntent.ts.
import { activeRoomColourIntent } from '@pryzm/core-app-model';

type IRoomStoreLite           = { getAll?: () => RoomData[]; getById?: (id: string) => RoomData | undefined };
type IWorkspaceControllerLite = { getMode?: () => string };
type IHierarchyStoreLite      = { getById?: (id: string) => any };

const FLOOR_EPSILON = 0.01;

const SYNC_FILL_COLOURS: Record<string, string> = {
  'no-template':  '#9ca3af',
  'planned-only': '#d1d5db',
  'partial':      '#3B8BD4',
  'synced':       '#1D9E75',
  'conflict':     '#E24B4A',
  'derived':      '#EF9F27',
};

const ROOM_RENDER_ORDER = 5;
const VOLUME_OPACITY_FALLBACK = 0.25;
const VOLUME_RENDER_ORDER = 4;

export class RoomBoundaryBuilder {
  private meshes: Map<string, THREE.Mesh> = new Map();
  private _volumeMeshes: Map<string, THREE.Mesh> = new Map();
  private visualisationMode: RoomVisualisationMode = 'detection';
  /** The single colour `uniform` mode paints with (the room VG category fill). */
  private _uniformColour: string = DEFAULT_UNIFORM_FILL;
  /**
   * Scope the `area` ramp is computed against. Cached only for the duration of a
   * batch repaint -- recomputing `getAll()` once per room would make a level
   * rebuild O(n^2).
   */
  private _scopeCache: RoomData[] | null = null;
  private _batching = false;
  /**
   * §ROOM-VG-CATEGORY (L-1617) -- has the mode been read from the VG cascade yet?
   *
   * Without this, a project SAVED with "all white" would load and render in
   * 'detection' until the user happened to switch views, because the only things
   * that call syncFromViewIntent() are events. A stored determination that only
   * appears after an unrelated interaction is indistinguishable, to the user,
   * from not having been stored at all.
   */
  private _intentPrimed = false;
  private _rebuildingRooms = new Set<string>();
  private highlightOverrides: Map<string, string> = new Map();
  private _complianceStatus: Map<string, 'error' | 'warning'> = new Map();

  private _roomStore?: IRoomStoreLite;
  private _workspaceController?: IWorkspaceControllerLite;
  private _hierarchyStore?: IHierarchyStoreLite;

  attachDependencies(deps: {
    roomStore?:           IRoomStoreLite;
    workspaceController?: IWorkspaceControllerLite;
    hierarchyStore?:      IHierarchyStoreLite;
  }): void {
    if (deps.roomStore)           this._roomStore           = deps.roomStore;
    if (deps.workspaceController) this._workspaceController = deps.workspaceController;
    if (deps.hierarchyStore)      this._hierarchyStore      = deps.hierarchyStore;
  }

  private _resolveRoomStore(): IRoomStoreLite | undefined {
    return this._roomStore ?? (window as any).roomStore;
  }
  private _resolveWorkspaceController(): IWorkspaceControllerLite | undefined {
    return this._workspaceController ?? (window as any).workspaceController;
  }
  private _resolveHierarchyStore(): IHierarchyStoreLite | undefined {
    return this._hierarchyStore ?? (window as any).hierarchyStore;
  }

  constructor(
    private readonly scene: THREE.Scene,
    private readonly bimManager?: BimManager,
  ) {
    let _lastComplianceHash = '';
    window.addEventListener('pryzm-constraints-updated', (e: Event) => {
      const { results } = (e as CustomEvent).detail ?? {};
      if (!Array.isArray(results)) return;
      const sig = (results as any[])
        .map(r => `${r.elementId}|${r.severity}`)
        .sort()
        .join(',');
      if (sig === _lastComplianceHash) return;
      _lastComplianceHash = sig;
      // A.21.D33(c) — the compliance room-tint overlay is OPT-IN. The validation
      // pass still runs (results are kept for CompliancePanel / IntentPrompt), but
      // we don't auto-paint red/orange/yellow tints onto rooms after generation.
      // Tinting is gated on the existing 'showRoomComplianceMessages' toggle.
      this._applyComplianceColors(results as Array<{ elementId: string; severity: string }>);
    });

    // A.21.D33(c) — the canonical UiPreferences dispatches a DOM CustomEvent;
    // re-evaluate the overlay when the compliance toggle flips so the tint
    // appears/clears immediately without waiting for the next constraint broadcast.
    window.addEventListener('pryzm-ui-pref-changed', (e: Event) => {
      const { key } = (e as CustomEvent).detail ?? {};
      if (key === 'showRoomComplianceMessages') {
        this._refreshComplianceTint();
      }
    });

    // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
    // Uses (window as any) bridge because packages/ cannot import from apps/.
    (window as any).runtime?.events?.on('pryzm-workspace-mode', () => {
      this._refreshAllRoomColours();
    });

    // §ROOM-VG-CATEGORY (L-1610) -- the room colour mode is a per-VIEW VG override,
    // so the shared 3-D scene has to re-resolve it whenever the active view changes
    // or the room category is edited. `view-selected` / `vg:*` on `window` is the
    // channel UnderlayRenderService and CropRegionFilterService already ride; this
    // subscribes to the same one rather than minting a rival.
    for (const evt of [
      'view-selected',
      'view-closed',
      'vg:view-style-set',
      'vg:view-style-reset',
      'vg:category-style-set',
      'vg:category-style-reset',
      'vg:model-template-assigned',
      'vg:template-updated',
    ]) {
      window.addEventListener(evt, () => this.syncFromViewIntent());
    }

    // F.events.14 — pryzm-ui-pref-changed migrated from DOM CustomEvent to runtime.events.
    (window as any).runtime?.events?.on('pryzm-ui-pref-changed', ({ key, value }: { key: string; value: unknown }) => {
      if (key === 'showRoomVolumeColour') {
        this._applyVolumeVisibility(value as boolean);
      } else if (key === 'roomVolumeOpacity') {
        this._applyVolumeOpacity(value as number);
      } else if (key === 'showRoomComplianceMessages') {
        // A.21.D33(c) — also handle the runtime.events dispatch path (apps/editor
        // UiPreferences) so the compliance tint toggles regardless of which
        // UiPreferences instance fired the change.
        this._refreshComplianceTint();
      }
    });
  }

  private _applyVolumeVisibility(show: boolean): void {
    const opacity = UiPreferences.get('roomVolumeOpacity') as number;
    for (const [, volumeMesh] of this._volumeMeshes) {
      volumeMesh.visible = show;
      volumeMesh.userData.vgBaseVisible = show;
      if (show) {
        const mat = volumeMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = opacity;
        mat.needsUpdate = true;
      }
    }
    console.log(`[RoomBoundaryBuilder] Room Volume Colour → ${show ? 'ON' : 'OFF'} (${this._volumeMeshes.size} volumes, opacity=${opacity})`);
  }

  private _applyVolumeOpacity(opacity: number): void {
    const show = UiPreferences.get('showRoomVolumeColour') as boolean;
    if (!show) return;
    for (const [, volumeMesh] of this._volumeMeshes) {
      const mat = volumeMesh.material as THREE.MeshBasicMaterial;
      mat.opacity = opacity;
      mat.needsUpdate = true;
    }
    console.log(`[RoomBoundaryBuilder] Volume opacity → ${Math.round(opacity * 100)}% (${this._volumeMeshes.size} volumes updated)`);
  }

  private _resolveWorldY(room: RoomData): number {
    const baseOffset = room.boundary?.baseOffset ?? 0;
    const bm = this.bimManager ?? (window as any).bimManager as BimManager | undefined;
    if (bm) {
      const level = bm.getLevelById(room.levelId);
      if (level) return level.elevation + baseOffset;
    }
    return baseOffset;
  }

  /**
   * §ROOM-VG-CATEGORY (L-1612) -- THE single place a room fill colour is decided.
   *
   * Every paint site in this file goes through here. It used to be
   * `RoomColourSystem.resolve(room)` (mode-LESS) at build time and
   * `resolveForMode(...)` only inside `setVisualisationMode()`, which meant the
   * chosen mode lasted exactly until the next room rebuild -- a rename, a
   * reshape, an occupancy change -- and then the whole level silently reverted
   * to the detection palette.
   */
  private _fillFor(room: RoomData): string {
    if (!this._intentPrimed) {
      this._intentPrimed = true;
      this._readViewIntent();
    }
    return RoomColourSystem.resolveForMode(
      room,
      this.visualisationMode,
      this.visualisationMode === 'area' ? this._colourScope() : undefined,
      { uniformColour: this._uniformColour },
    );
  }

  /** Rooms the `area` ramp is measured across. Only computed for `area` mode. */
  private _colourScope(): RoomData[] | undefined {
    if (this._scopeCache) return this._scopeCache;
    const rs = this._resolveRoomStore();
    const all = rs?.getAll?.() ?? [];
    if (this._batching) this._scopeCache = all;
    return all;
  }

  /**
   * §ROOM-VG-CATEGORY (L-1610) -- re-read the room colour intent for the view
   * that is on screen and repaint. This is what makes the mode a VIEW property:
   * a plan colour-coded by room type and an all-white presentation elevation are
   * the same model resolved through two different VG view records.
   */
  syncFromViewIntent(): void {
    this._intentPrimed = true;
    const intent = this._readIntentOrNull();
    if (!intent) return;
    this.setVisualisationMode(intent.mode, { uniformColour: intent.uniformColour });
  }

  /** Prime the mode WITHOUT repainting -- used on the very first paint. */
  private _readViewIntent(): void {
    const intent = this._readIntentOrNull();
    if (!intent) return;
    this.visualisationMode = intent.mode;
    this._uniformColour = intent.uniformColour;
  }

  private _readIntentOrNull(): { mode: RoomVisualisationMode; uniformColour: string } | null {
    try {
      return activeRoomColourIntent();
    } catch (e) {
      // A resolution failure must not silently become "detection" -- say so.
      console.warn('[RoomBoundaryBuilder] room colour intent unresolved; leaving the current mode in place:', e);
      return null;
    }
  }

  private _refreshAllRoomColours(): void {
    const rs = this._resolveRoomStore();
    if (!rs) return;
    try {
      const allRooms: RoomData[] = rs.getAll?.() ?? [];
      this._batching = true;
      this._scopeCache = allRooms;
      for (const room of allRooms) {
        this.updateRoom(room);
      }
    } catch (e) {
      console.warn('[RoomBoundaryBuilder] _refreshAllRoomColours error:', e);
    } finally {
      this._batching = false;
      this._scopeCache = null;
    }
  }

  updateRoom(room: RoomData): void {
    if (this._rebuildingRooms.has(room.id)) {
      console.debug(`[RoomBoundaryBuilder] Rebuild already in progress for room '${room.id}' — skipping concurrent call.`);
      return;
    }
    this._rebuildingRooms.add(room.id);
    try {
      this._doUpdateRoom(room);
    } finally {
      this._rebuildingRooms.delete(room.id);
    }
  }

  private _doUpdateRoom(room: RoomData): void {
    this.removeRoom(room.id);

    const polygon = room.boundary?.polygon;
    if (!polygon || polygon.length < 3) {
      console.debug(`[RoomBoundaryBuilder] Room '${room.id}' has no valid polygon — skipping`);
      return;
    }

    // §ROOM-VG-CATEGORY (L-1612) -- was `RoomColourSystem.resolve(room)`, the
    // MODE-LESS resolver, which is why every chosen mode died at the next rebuild.
    let hex     = this._fillFor(room);
    const opacity = RoomColourSystem.resolveOpacity(room);
    if (opacity <= 0) return;

    // The inspect/data workspace sync tint is an IMPLICIT overlay. An explicit
    // user choice of mode outranks it -- otherwise picking "all white" in the
    // inspect workspace would appear to do nothing.
    const workspaceMode = this.visualisationMode === 'detection'
      ? this._resolveWorkspaceController()?.getMode?.() as string | undefined
      : undefined;
    if (workspaceMode === 'inspect' || workspaceMode === 'data') {
      const hs = this._resolveHierarchyStore();
      if (hs && room.unitId) {
        const unit = hs.getById?.(room.unitId);
        const syncState = unit?.syncState as string | undefined;
        if (syncState && SYNC_FILL_COLOURS[syncState]) {
          hex = SYNC_FILL_COLOURS[syncState];
        }
      }
    }

    const shape = this._buildShape(polygon);
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const worldY = this._resolveWorldY(room);
    mesh.position.set(0, worldY + FLOOR_EPSILON, 0);
    mesh.renderOrder = ROOM_RENDER_ORDER;

    mesh.userData.roomId = room.id;
    mesh.userData.id = room.id;
    mesh.userData.type = 'room';
    mesh.userData.elementType = 'room';
    mesh.userData.levelId = room.levelId;
    mesh.userData.selectable = true;
    mesh.userData.isRoomOverlay = true;
    mesh.userData.polygon = polygon;
    mesh.userData.height  = room.boundary?.height ?? 3.0;
    mesh.name = `room-overlay-${room.id}`;

    this.scene.add(mesh);
    this.meshes.set(room.id, mesh);

    // A.21.D33(c) — only re-apply the compliance tint to a freshly built room
    // mesh when the overlay is explicitly enabled. Otherwise the room keeps its
    // normal/neutral fill.
    const cs = this._complianceStatus.get(room.id);
    if (cs && this._complianceTintEnabled()) {
      (mesh.material as THREE.MeshBasicMaterial).color.setStyle(
        cs === 'error' ? '#ef4444' : '#f59e0b'
      );
    }

    const roomHeight = room.boundary?.height ?? 3.0;
    if (roomHeight > 0 && opacity > 0) {
      this._buildVolumeMesh(room, polygon, worldY, roomHeight, hex);
    }
  }

  private _buildVolumeMesh(
    room: RoomData,
    polygon: Array<{ x: number; z: number }>,
    worldY: number,
    height: number,
    hex: string,
  ): void {
    const volumeShape = new THREE.Shape();
    volumeShape.moveTo(polygon[0].x, -polygon[0].z);
    for (let i = 1; i < polygon.length; i++) {
      volumeShape.lineTo(polygon[i].x, -polygon[i].z);
    }
    volumeShape.closePath();

    const geometry = new THREE.ExtrudeGeometry(volumeShape, {
      depth: height,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);

    const showVolume = UiPreferences.get('showRoomVolumeColour');
    const volumeOpacity = (UiPreferences.get('roomVolumeOpacity') as number | undefined) ?? VOLUME_OPACITY_FALLBACK;
    const material = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: volumeOpacity,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const volumeMesh = new THREE.Mesh(geometry, material);
    volumeMesh.visible = showVolume;
    volumeMesh.position.set(0, worldY, 0);
    volumeMesh.renderOrder = VOLUME_RENDER_ORDER;

    volumeMesh.userData.roomId = room.id;
    volumeMesh.userData.id = room.id;
    volumeMesh.userData.type = 'room';
    volumeMesh.userData.elementType = 'room';
    volumeMesh.userData.levelId = room.levelId;
    volumeMesh.userData.isRoomVolume = true;
    // §ROOM-VG-CATEGORY (L-1613) -- the room VG category can HIDE rooms, but VG's
    // default `visible: true` must not force a volume back on that the user turned
    // off via the 'showRoomVolumeColour' preference. VGSceneApplicator ANDs its
    // verdict with this flag rather than overwriting `mesh.visible`.
    volumeMesh.userData.vgBaseVisible = showVolume;
    volumeMesh.userData.selectable = false;
    volumeMesh.name = `room-volume-${room.id}`;

    this.scene.add(volumeMesh);
    this._volumeMeshes.set(room.id, volumeMesh);
  }

  /**
   * §GPU-RESOURCE-LIFETIME (ADR-0297 INVARIANT L2(b), L-944a) — "DETACH now,
   * RELEASE at the boundary".
   *
   * ── Why this method in particular ───────────────────────────────────────────
   * The founder's post-undo WebGPU error is
   *
   *   Vertex buffer slot 0 required by [RenderPipeline
   *     "renderPipeline_MeshBasicMaterial_6268"] was not set.
   *     - While encoding [RenderPassEncoder].Draw(48, 1, 0, 0).
   *
   * `Draw(48, 1, 0, 0)` is a NON-INDEXED 48-vertex draw on a MeshBasicMaterial
   * pipeline. `ExtrudeGeometry(<n-gon>, { bevelEnabled: false })` is non-indexed and
   * emits 12·n vertices, so 48 means n = 5 and no other n (measured against three
   * r183 — the assertion lives in
   * packages/room-topology/__tests__/L944RoomOverlayGpuLifetime.test.ts so a THREE
   * upgrade that re-tessellates turns this identification RED rather than letting it
   * rot). The room VOLUME overlay built by `_buildVolumeMesh` above is an
   * ExtrudeGeometry + MeshBasicMaterial over the room polygon; the room FLOOR fill is
   * a ShapeGeometry, which is INDEXED and would appear as a DrawIndexed. So the mesh
   * that drew after its buffer was released is a five-corner ROOM overlay — and
   * L-943 measured this same undo rewriting the room polygon (it "invented 63 m² of
   * floor"), which is exactly what makes this builder run on `UNDO:
   * CASCADE_WALL_BASELINE`.
   *
   * ── What was wrong ──────────────────────────────────────────────────────────
   * The detach was already correct; the RELEASE was not. `dispose()` ran inline, on
   * the mutation tick — a store-event / undo tick with no relationship to the frame
   * boundary. INVARIANT L2 has two halves and only (a) was satisfied: a buffer may be
   * freed only once the frame that last referenced it has finished encoding AND
   * submitting. `scheduleGpuRelease()` defers to the one instant where that is true
   * by construction, drained at the top of `RenderPipelineManager.render()`.
   *
   * `removeFromParent()` rather than `this.scene.remove(mesh)`: `Object3D.remove` is
   * a silent no-op if the mesh has been re-parented, which would leave a live mesh
   * holding a released buffer — the precise failure this method exists to prevent.
   */
  removeRoom(roomId: string): void {
    const existing = this.meshes.get(roomId);
    if (existing) {
      existing.removeFromParent();        // (a) DETACH — unreachable from the scene now
      this.meshes.delete(roomId);
      scheduleGpuRelease(existing);       // (b) RELEASE at the next frame boundary
    }

    const volume = this._volumeMeshes.get(roomId);
    if (volume) {
      volume.removeFromParent();
      this._volumeMeshes.delete(roomId);
      scheduleGpuRelease(volume);
    }
  }

  removeAll(): void {
    for (const id of [...this.meshes.keys()]) {
      this.removeRoom(id);
    }
    for (const id of [...this._volumeMeshes.keys()]) {
      this.removeRoom(id);
    }
  }

  hasMesh(roomId: string): boolean {
    return this.meshes.has(roomId);
  }

  /**
   * A.21.D33(c) — is the room-compliance tint overlay opted-in?
   * Reuses the existing 'showRoomComplianceMessages' preference (default OFF) so
   * generated plans render with clean neutral room fills instead of red/orange/
   * yellow compliance shades. The validation pass still runs and the status is
   * still tracked in _complianceStatus — we just don't paint it unless asked.
   */
  private _complianceTintEnabled(): boolean {
    try {
      return UiPreferences.get('showRoomComplianceMessages') === true;
    } catch {
      return false;
    }
  }

  /**
   * Repaint every room according to the current compliance status (when the
   * overlay is ON) or restore neutral fills (when it is OFF). Invoked when the
   * user flips the 'showRoomComplianceMessages' toggle.
   */
  private _refreshComplianceTint(): void {
    const on = this._complianceTintEnabled();
    for (const [roomId, mesh] of this.meshes) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const status = on ? this._complianceStatus.get(roomId) : undefined;
      if (status === 'error') {
        mat.color.setStyle('#ef4444');
      } else if (status === 'warning') {
        mat.color.setStyle('#f59e0b');
      } else {
        const roomStore = this._resolveRoomStore();
        const room: RoomData | undefined = roomStore?.getById?.(roomId);
        if (room) {
          mat.color.setStyle(this._fillFor(room));
        }
      }
    }
  }

  private _applyComplianceColors(
    results: Array<{ elementId: string; severity: string }>
  ): void {
    const newStatus = new Map<string, 'error' | 'warning'>();
    for (const r of results) {
      const current = newStatus.get(r.elementId);
      if (r.severity === 'error') {
        newStatus.set(r.elementId, 'error');
      } else if (r.severity === 'warning' && current !== 'error') {
        newStatus.set(r.elementId, 'warning');
      }
    }

    const toUpdate = new Set([...this._complianceStatus.keys(), ...newStatus.keys()]);
    this._complianceStatus.clear();
    for (const [id, sev] of newStatus) {
      this._complianceStatus.set(id, sev);
    }

    // A.21.D33(c) — keep the validation status (above) but only PAINT the tint
    // when the overlay is explicitly enabled. When OFF, restore neutral fills so
    // any previously-tinted rooms revert and freshly generated rooms stay clean.
    const tintOn = this._complianceTintEnabled();

    for (const roomId of toUpdate) {
      const mesh = this.meshes.get(roomId);
      if (!mesh) continue;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const status = tintOn ? this._complianceStatus.get(roomId) : undefined;
      if (status === 'error') {
        mat.color.setStyle('#ef4444');
      } else if (status === 'warning') {
        mat.color.setStyle('#f59e0b');
      } else {
        const roomStore = this._resolveRoomStore();
        const room: RoomData | undefined = roomStore?.getById?.(roomId);
        if (room) {
          mat.color.setStyle(this._fillFor(room));
        }
      }
    }

    const errorCount   = [...this._complianceStatus.values()].filter(s => s === 'error').length;
    const warningCount = [...this._complianceStatus.values()].filter(s => s === 'warning').length;
    if (errorCount + warningCount > 0) {
      console.log(
        `[RoomBoundaryBuilder] Compliance overlay: ${errorCount} error, ${warningCount} warning room(s) ` +
        (tintOn ? 'tinted' : 'tracked (overlay OFF — enable Room Compliance Messages to tint)')
      );
    }
  }

  get currentVisualisationMode(): RoomVisualisationMode {
    return this.visualisationMode;
  }

  /**
   * §ROOM-VG-CATEGORY (L-1612) -- repaint every room under `mode`.
   *
   * Two things changed here beyond the mode plumbing:
   *   1. The VOLUME meshes are repainted too. They are what an ELEVATION, a
   *      SECTION and the 3-D view actually show; repainting only the floor fill
   *      left every non-plan view on the previous palette, which is precisely
   *      the "make it happen for all view types, elevation etc." half.
   *   2. `this.visualisationMode` is now read by `_doUpdateRoom()`, so the mode
   *      survives a rebuild instead of being a one-shot repaint.
   */
  setVisualisationMode(mode: RoomVisualisationMode, opts?: { uniformColour?: string }): void {
    this.visualisationMode = mode;
    if (opts?.uniformColour) this._uniformColour = opts.uniformColour;
    this.clearHighlight();

    const roomStore = this._resolveRoomStore();
    if (!roomStore) return;

    const allRooms: RoomData[] = typeof roomStore.getAll === 'function' ? roomStore.getAll() : [];
    this._batching = true;
    this._scopeCache = allRooms;
    try {
      const ids = new Set([...this.meshes.keys(), ...this._volumeMeshes.keys()]);
      for (const roomId of ids) {
        const room: RoomData | undefined = roomStore.getById?.(roomId);
        if (!room) continue;
        const hex = this._fillFor(room);
        const fill = this.meshes.get(roomId);
        if (fill) (fill.material as THREE.MeshBasicMaterial).color.set(hex);
        const volume = this._volumeMeshes.get(roomId);
        if (volume) (volume.material as THREE.MeshBasicMaterial).color.set(hex);
      }
    } finally {
      this._batching = false;
      this._scopeCache = null;
    }

    console.log(`[RoomBoundaryBuilder] Visualisation mode → ${mode} (uniform=${this._uniformColour})`);
  }

  highlightPath(roomIds: string[]): void {
    this.clearHighlight();

    const PATH_COLOUR = '#FFD600';
    const START_COLOUR = '#00C853';
    const END_COLOUR = '#D50000';

    roomIds.forEach((id, idx) => {
      const mesh = this.meshes.get(id);
      if (!mesh) return;

      const mat = mesh.material as THREE.MeshBasicMaterial;
      const current = '#' + mat.color.getHexString();
      this.highlightOverrides.set(id, current);

      const colour =
        idx === 0 ? START_COLOUR :
        idx === roomIds.length - 1 ? END_COLOUR :
        PATH_COLOUR;
      mat.color.set(colour);
    });
  }

  clearHighlight(): void {
    for (const [roomId, originalHex] of this.highlightOverrides) {
      const mesh = this.meshes.get(roomId);
      if (mesh) {
        (mesh.material as THREE.MeshBasicMaterial).color.set(originalHex);
      }
    }
    this.highlightOverrides.clear();
  }

  private _buildShape(polygon: Array<{ x: number; z: number }>): THREE.Shape {
    const shape = new THREE.Shape();
    const first = polygon[0];
    shape.moveTo(first.x, first.z);
    for (let i = 1; i < polygon.length; i++) {
      shape.lineTo(polygon[i].x, polygon[i].z);
    }
    shape.closePath();
    return shape;
  }
}
