/**
 * RoomBoundaryBuilder — THREE.js mesh overlay for room floor fills + 3D volumes.
 *
 * Sprint J extraction (2026-05-10): moved from src/engine/subsystems/rooms/ to
 * @pryzm/room-topology. Import remapping:
 *   ../../../ui/UiPreferences → @pryzm/core-app-model
 */

import * as THREE from '@pryzm/renderer-three/three';
import { RoomData } from './RoomTypes';
import { RoomColourSystem, RoomVisualisationMode } from './RoomColourSystem';
import { BimManager } from '@pryzm/core-app-model';
import { UiPreferences } from '@pryzm/core-app-model';

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

  private _refreshAllRoomColours(): void {
    const rs = this._resolveRoomStore();
    if (!rs) return;
    try {
      const allRooms: RoomData[] = rs.getAll?.() ?? [];
      for (const room of allRooms) {
        this.updateRoom(room);
      }
    } catch (e) {
      console.warn('[RoomBoundaryBuilder] _refreshAllRoomColours error:', e);
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

    let hex     = RoomColourSystem.resolve(room);
    const opacity = RoomColourSystem.resolveOpacity(room);
    if (opacity <= 0) return;

    const workspaceMode = this._resolveWorkspaceController()?.getMode?.() as string | undefined;
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
    volumeMesh.userData.selectable = false;
    volumeMesh.name = `room-volume-${room.id}`;

    this.scene.add(volumeMesh);
    this._volumeMeshes.set(room.id, volumeMesh);
  }

  removeRoom(roomId: string): void {
    const existing = this.meshes.get(roomId);
    if (existing) {
      this.scene.remove(existing);
      existing.geometry.dispose();
      if (Array.isArray(existing.material)) {
        existing.material.forEach(m => m.dispose());
      } else {
        (existing.material as THREE.Material).dispose();
      }
      this.meshes.delete(roomId);
    }

    const volume = this._volumeMeshes.get(roomId);
    if (volume) {
      this.scene.remove(volume);
      volume.geometry.dispose();
      if (Array.isArray(volume.material)) {
        volume.material.forEach(m => m.dispose());
      } else {
        (volume.material as THREE.Material).dispose();
      }
      this._volumeMeshes.delete(roomId);
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
          mat.color.setStyle(RoomColourSystem.resolve(room));
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
          mat.color.setStyle(RoomColourSystem.resolve(room));
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

  setVisualisationMode(mode: RoomVisualisationMode): void {
    this.visualisationMode = mode;
    this.clearHighlight();

    const roomStore = this._resolveRoomStore();
    if (!roomStore) return;

    const allRooms: RoomData[] = typeof roomStore.getAll === 'function' ? roomStore.getAll() : [];

    for (const [roomId, mesh] of this.meshes) {
      const room: RoomData | undefined = roomStore.getById?.(roomId);
      if (!room) continue;

      const hex = RoomColourSystem.resolveForMode(room, mode, allRooms);
      (mesh.material as THREE.MeshBasicMaterial).color.set(hex);
    }

    console.log(`[RoomBoundaryBuilder] Visualisation mode → ${mode}`);
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
