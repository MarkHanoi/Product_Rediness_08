/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder / Projection layer (Three.js scene only)
 * File:             src/engine/inspect/DiagnosticMaterialManager.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §2 (Builder layer rules)
 *                   02-SPATIAL-PROJECTION-CONTRACT §8.1 (scene overlay group)
 *                   04-BIM-AI-MODIFICATION-PROTOCOL §1 (declaration requirement)
 *
 * Change classification: B (Bug fix — correctness, no API surface change)
 * Impact:   INSPECT mode GPU crash and visual artefact — production-critical
 * Risk:     Low — two tightly-scoped, non-architectural changes
 *
 * Fix 1 — uZoom TRAA uniform crash (camera movement in INSPECT mode):
 *   Symptom:  Moving the camera in F2 Inspect mode throws
 *             "Cannot read properties of undefined (reading 'uZoom')"
 *             from @thatopen_components.js:8543 on every camera update.
 *   Root cause: _flushDeferredDisposals() was called synchronously inside the
 *             RAF coalescer (_applyLensImmediate) — in the same RAF execution
 *             batch as OBC camera-controls event listeners that hold live
 *             references to TRAA shader uniform objects.  Disposing WebGL
 *             programs within that batch permanently corrupted those uniforms.
 *   Fix:      Schedule _flushDeferredDisposals() on an additional scheduler
 *             tick (D.7.6: routed through getFrameScheduler().scheduleOnce
 *             with reason 'diagnostic-flush-disposals' — see _applyLensImmediate)
 *             so disposal runs after the renderer has fully flushed the frame
 *             and all camera-controls listeners have completed.
 *   Files:    _applyLensImmediate() — line ~194
 *
 * Fix 2 — Ghost profile walls from door/window sub-meshes:
 *   Symptom:  Visible ghost profiles (4% white) appear over door openings in
 *             Inspect mode, outlining door frame, leaf, hinges, and handles.
 *   Root cause: DoorBuilder/WindowBuilder place all geometry as child THREE.Mesh
 *             objects inside a THREE.Group whose userData.elementType = 'door' /
 *             'window'.  The child meshes carry no userData.elementType themselves.
 *             _applyGhostToNonRoomMesh() matched them as non-structural and
 *             applied the 4% white ghost material, creating unwanted profiles.
 *   Fix:      Walk the parent chain in _applyGhostToNonRoomMesh() and return
 *             false (skip) for any mesh whose ancestor Group is a door or window.
 *   Files:    _applyGhostToNonRoomMesh() — line ~425
 *
 * Fix 3 — ACTUAL uZoom crash root cause (SimpleGrid ShaderMaterial replacement):
 *   Symptom:  Same uZoom crash — moving the camera in Inspect mode throws
 *             "Cannot read properties of undefined (reading 'uZoom')"
 *             at _CameraControls.<anonymous> (@thatopen_components.js:8543)
 *   Root cause: OBC's SimpleGrid uses a THREE.ShaderMaterial with a `uZoom`
 *             uniform AND exposes it via `get material() { return this.three.material; }`.
 *             _applyGhostToNonRoomMesh() traversed the grid mesh (no userData,
 *             no elementType), classified it as non-structural, and replaced
 *             this.three.material with MeshPhongMaterial.  The next camera update
 *             calls grid.updateZoom() which reads this.material.uniforms.uZoom —
 *             but this.material now returns MeshPhongMaterial (no .uniforms
 *             property) → undefined.uZoom → crash on every camera move.
 *   Fix:      Check `meshMat instanceof THREE.ShaderMaterial` at the top of
 *             _applyGhostToNonRoomMesh() and return false immediately.
 *             All legitimate BIM geometry uses Standard/Phong/Basic materials;
 *             only system-level meshes (SimpleGrid) use ShaderMaterial.
 *   Files:    _applyGhostToNonRoomMesh() — line ~411
 *
 * Applies diagnostic lens shaders to Three.js scene meshes for Inspect mode (F2).
 * Implements the "Augmented Interrogator" LHS Canvas per PRYZM BIM 3.0 Specification.
 *
 * CONTRACT RULES (non-negotiable):
 *   - NEVER mutates ElementRegistry, stores, or graph
 *   - NEVER dispatches commands
 *   - All overlay objects go into scene.overlays group, NEVER scene.elements
 *   - Original materials cached in WeakMap — never lost
 *   - restore() always cleans up every overlay and material swap
 *   - DeltaMap consumed as Readonly<> — never written to
 *
 * InspectLens variants:
 *   ghost    — frosted structural ghost + volumetric health map + selected jewel (§1.1, §2.A, §1.3)
 *   spatial  — full heatmap: green/amber/red by area delta + holographic extension (§2.A)
 *   openings — ADA clearance discs at doors
 *   finishes — flat colour by material ID with MISMATCH pulsing
 *   xray     — MEP X-ray (depthTest:false, emissive)
 *   assets   — ghost wireframe boxes for missing equipment
 *
 * Augmented Interrogator features (PRYZM BIM 3.0 §1–§3):
 *   §1.1  Ghost base: structural 10% frosted + cyan edges; non-structural 4% white
 *   §1.3  Selected Jewel: room volume at 0.40–0.52 opacity, violet emissive, RAF pulse
 *   §2.A  Volumetric Health Map: room volumes coloured green/amber/red by DeltaMap
 *   §2.A  Holographic Extension: purple wireframe box for undersized rooms (negative delta)
 *   §3    Z-Slicer: overlay materials receive clip plane from pryzm-zslicer-change event
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { DeltaMap, DeltaEntry } from '@pryzm/core-app-model';
import { assetCatalogStore } from '@pryzm/core-app-model';
import { onRuntimeEvent } from '../runtimeEventBridge';

// ── Types ─────────────────────────────────────────────────────────────────────

export type InspectLens =
  | 'ghost'
  | 'spatial'
  | 'openings'
  | 'finishes'
  | 'xray'
  | 'assets';

// ── Constants ─────────────────────────────────────────────────────────────────

const GHOST_STRUCTURAL_OPACITY    = 0.10;
const GHOST_NON_STRUCTURAL_OPACITY = 0.04;
const GHOST_EDGE_COLOR            = 0x00e5ff; // cyan LineSegments on structural
const GHOST_STRUCTURAL_COLOR      = 0xc0e0ff;

const HEATMAP_PASS_COLOR          = 0x00ff88; // green
const HEATMAP_SMALL_COLOR         = 0xaa00ff; // purple — too small
const HEATMAP_LARGE_COLOR         = 0xff8800; // orange — too large
const HEATMAP_WARN_COLOR          = 0xffee00; // amber
const HEATMAP_GREY_COLOR          = 0x888888; // no requirement

const VOLUME_HEALTH_OPACITY       = 0.15; // §2.A default
const VOLUME_NO_REQ_OPACITY       = 0.06; // no requirement set
const VOLUME_SELECTED_BASE        = 0.40; // §1.3 jewel base opacity
const VOLUME_SELECTED_AMP         = 0.12; // pulse amplitude (sin ±0.12)
const VOLUME_SELECTED_EMISSIVE    = 0x8B5CF6; // violet emissive (§1.3)
const VOLUME_SELECTED_COLOR       = 0x8B5CF6; // violet jewel color
const VOLUME_FLOOR_OPACITY        = 0.00; // floor overlays hidden in ghost/spatial — volumes take over

const HOLOGRAPHIC_COLOR           = 0xCC00FF; // §2.A purple holographic extension
const XRAY_EMISSIVE_COLOR         = 0x00aaff;
const MISSING_ASSET_COLOR         = 0xffffff;
const MISMATCH_FINISH_PULSE_MS    = 800;
const MAX_SCENE_HEIGHT            = 20.0; // metres — Z-Slicer upper bound (§3)

// ── DiagnosticMaterialManager ─────────────────────────────────────────────────

export class DiagnosticMaterialManager {
  private _originals    = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private _savedMeshes: THREE.Mesh[] = [];
  private _activeLens:    InspectLens = 'ghost';
  private _overlayObjects: THREE.Object3D[] = [];
  private _overlayGroup:   THREE.Group | null = null;
  private _active = false;

  // ── §1.3 / §2.A: Selected jewel + pulse ───────────────────────────────────
  // D.7.6: rAF handle replaced by FrameScheduler disposer.
  private _pulseRafId:  TickListenerDisposer | null = null;
  private _pulseMeshes: THREE.MeshPhongMaterial[] = [];

  // ── §3: Z-Slicer clip plane ────────────────────────────────────────────────
  private _clipPlane: THREE.Plane | null = null;

  // ── Coalesce guard: RAF debounce prevents double-applyLens in same frame ──
  // Any second call within the same rAF cycle is coalesced into one.
  // D.7.6: rAF handle replaced by FrameScheduler disposer (one-shot coalescer).
  private _pendingApplyLensRafId: TickListenerDisposer | null = null;
  private _pendingApplyLensArgs:  {
    lens: InspectLens;
    deltaMap: Readonly<DeltaMap>;
    scene: THREE.Scene;
    selectedRoomId?: string;
  } | null = null;

  // ── Deferred GPU disposal: dispose() is never called during an active frame ─
  // Objects are queued here and disposed on the next rAF tick after the renderer
  // has finished drawing, preventing TRAA/post-processing uniform corruption.
  private _deferredDisposals: Array<THREE.Object3D> = [];

  // ── Discovery Heatmap: room area data (no-brief mode) ────────────────────
  private _discoveryRooms: Array<{ id: string; area: number }> = [];

  // ── Polymorphic Auditor: focused element type for ghost-with-focus lens ───
  private _focusedElementType: string | null = null;

  constructor() {
    // §3 — Z-Slicer: update clip plane whenever the slider moves.
    // Uses onRuntimeEvent() because DiagnosticMaterialManager is a module-level
    // singleton constructed before window.runtime is set. The subscription is
    // deferred until flushRuntimeEventListeners() is called from engineLauncher.ts.
    onRuntimeEvent('pryzm-zslicer-change', (payload) => {
      const pct = (payload as { pct?: number }).pct;
      if (typeof pct !== 'number') return;
      const clipY = pct * MAX_SCENE_HEIGHT;
      this._clipPlane = clipY >= MAX_SCENE_HEIGHT - 0.1
        ? null
        : new THREE.Plane(new THREE.Vector3(0, -1, 0), clipY);
      this._applyClipToCurrentOverlays();
    });

    // Discovery Heatmap: receive room list from AuditStack when no brief is set.
    // Uses onRuntimeEvent() because DiagnosticMaterialManager is a module-level
    // singleton constructed before window.runtime is set. The subscription is
    // deferred until flushRuntimeEventListeners() is called from engineLauncher.ts.
    // F.events.5 — migrated from DOM CustomEvent to runtime.events typed bus.
    onRuntimeEvent('pryzm-inspect-discovery', (payload) => {
      const rooms = (payload as { rooms?: Array<{ id: string; area: number }> }).rooms;
      if (rooms) {
        this._discoveryRooms = rooms;
        console.log('[DiagnosticMaterialManager] Discovery rooms updated:', rooms.length);
      }
    });
  }

  // ── Entry / Exit ───────────────────────────────────────────────────────────

  /**
   * Activate a lens — saves originals and applies materials.
   *
   * SAFETY: Uses a RAF-debounce coalescer so that rapid back-to-back calls
   * (e.g. pryzm-workspace-mode + pryzm-inspect-discovery firing in the same
   * microtask queue) are merged into a SINGLE application at the next frame.
   * This prevents _clearOverlays().dispose() from firing while the GPU is
   * still executing the current render pass (which would corrupt TRAA uniforms).
   */
  applyLens(
    lens:            InspectLens,
    deltaMap:        Readonly<DeltaMap>,
    scene:           THREE.Scene,
    selectedRoomId?: string,
  ): void {
    // Always update stored args so the latest lens+selection wins
    this._pendingApplyLensArgs = { lens, deltaMap, scene, selectedRoomId };

    // If already scheduled, the existing RAF tick will pick up the updated args
    if (this._pendingApplyLensRafId !== null) return;

    // D.7.6: one-shot coalescer routed through getFrameScheduler(). The
    // first caller schedules; subsequent callers within the same frame
    // short-circuit at the `if (... !== null) return;` guard above and
    // simply update `_pendingApplyLensArgs` so the latest lens+selection wins.
    this._pendingApplyLensRafId = getFrameScheduler().scheduleOnce(
      'diagnostic-apply-lens',
      () => {
        this._pendingApplyLensRafId = null;
        const args = this._pendingApplyLensArgs;
        this._pendingApplyLensArgs = null;
        if (args) this._applyLensImmediate(args.lens, args.deltaMap, args.scene, args.selectedRoomId);
      },
    );
  }

  /** Internal immediate lens application — called by the RAF coalescer only. */
  private _applyLensImmediate(
    lens:            InspectLens,
    deltaMap:        Readonly<DeltaMap>,
    scene:           THREE.Scene,
    selectedRoomId?: string,
  ): void {
    if (this._active) {
      this._stopPulse();
      this._clearOverlays(scene);
      this._restoreMaterials();
    }

    this._activeLens = lens;
    this._active     = true;
    this._ensureOverlayGroup(scene);

    switch (lens) {
      case 'ghost':
        // Re-apply ghost-with-focus if an element type is currently focused;
        // otherwise fall back to the standard ghost lens.
        if (this._focusedElementType) {
          this.applyGhostWithFocus(scene, this._focusedElementType);
        } else {
          this._applyGhost(scene, deltaMap, selectedRoomId);
        }
        break;
      case 'spatial':  this._applySpatialHeatmap(scene, deltaMap, selectedRoomId); break;
      case 'openings': this._applyOpenings(scene, selectedRoomId);                 break;
      case 'finishes': this._applyFinishes(scene, deltaMap, selectedRoomId);       break;
      case 'xray':     this._applyXray(scene, deltaMap);                           break;
      case 'assets':   this._applyAssets(scene, deltaMap, selectedRoomId);         break;
    }

    // Defer GPU disposal to the NEXT RAF tick.
    //
    // Calling _flushDeferredDisposals() synchronously here — even though we are
    // already inside an RAF callback — is not safe.  OBC's camera-controls installs
    // event listeners on the camera update cycle that read TRAA shader uniforms
    // (e.g. `uZoom`).  Those listeners fire on the SAME RAF tick when the user moves
    // the camera.  Disposing WebGL programs within the same RAF execution batch that
    // still has live uniform references corrupts those uniform objects permanently,
    // causing every subsequent camera update to throw:
    //   "Cannot read properties of undefined (reading 'uZoom')"
    //
    // Scheduling on an additional RAF guarantees disposal only happens AFTER the
    // renderer has fully flushed the current frame and all camera event listeners
    // have completed — eliminating the race condition entirely.
    // D.7.6: deferred-disposal yield routed through getFrameScheduler().
    // Disposer is intentionally discarded — this is a one-shot post-frame
    // disposal flush; there is no need (and was no prior rAF handle) to
    // cancel it, the work is idempotent.
    getFrameScheduler().scheduleOnce(
      'diagnostic-flush-disposals',
      () => this._flushDeferredDisposals(),
    );

    console.log(`[DiagnosticMaterialManager] Lens applied: ${lens}${selectedRoomId ? ` (room: ${selectedRoomId})` : ''}`);
  }

  /**
   * Restore all materials to their pre-inspect originals and remove overlays.
   * Called when leaving Inspect mode (F1).
   * Robust: safe to call even when _active is false — clears any leftover state.
   */
  restore(scene: THREE.Scene): void {
    // Cancel any pending coalesced lens application — we're leaving inspect mode
    // D.7.6: dispose any pending FrameScheduler tick.
    if (this._pendingApplyLensRafId !== null) {
      this._pendingApplyLensRafId();
      this._pendingApplyLensRafId = null;
      this._pendingApplyLensArgs  = null;
    }

    this._stopPulse();
    this._clearOverlays(scene);
    this._restoreMaterials();
    this._active              = false;
    this._discoveryRooms      = [];
    this._focusedElementType  = null;

    // Flush remaining disposals immediately on restore (safe — render is not running)
    this._flushDeferredDisposals();

    console.log('[DiagnosticMaterialManager] Restored — all materials reset');
  }

  getActiveLens(): InspectLens { return this._activeLens; }
  isActive(): boolean          { return this._active; }

  // ── §1.3 Pulse animation ───────────────────────────────────────────────────

  private _startPulse(): void {
    this._stopPulse();
    // D.7.6: continuous pulse tick driven by FrameScheduler. The original
    // `loop` self-rescheduled and self-terminated by NOT rescheduling when
    // `_active` flipped or `_pulseMeshes` emptied. With addTickListener the
    // scheduler keeps invoking the callback until the disposer is invoked,
    // so we replicate the self-stop by disposing inline on the early-out
    // branch (preserves the legacy "stops itself when no work remains"
    // semantics with no externally observable behaviour change).
    this._pulseRafId = getFrameScheduler().addTickListener(
      'diagnostic-pulse',
      () => {
        if (!this._active || this._pulseMeshes.length === 0) {
          if (this._pulseRafId !== null) {
            this._pulseRafId();
            this._pulseRafId = null;
          }
          return;
        }
        const opacity = VOLUME_SELECTED_BASE + VOLUME_SELECTED_AMP * Math.sin(Date.now() * 0.002);
        for (const mat of this._pulseMeshes) {
          mat.opacity = opacity;
          mat.needsUpdate = true;
        }
      },
      'render',
    );
  }

  private _stopPulse(): void {
    // D.7.6: dispose the FrameScheduler pulse tick.
    if (this._pulseRafId !== null) {
      this._pulseRafId();
      this._pulseRafId = null;
    }
    this._pulseMeshes = [];
  }

  // ── §3 Z-Slicer: clip plane on overlays ───────────────────────────────────

  private _applyClipToCurrentOverlays(): void {
    const planes = this._clipPlane ? [this._clipPlane] : null;
    for (const obj of this._overlayObjects) {
      if ((obj as any).material) {
        const m = (obj as any).material;
        if (Array.isArray(m)) m.forEach((x: any) => { if (x.clippingPlanes !== undefined) x.clippingPlanes = planes; });
        else if (m.clippingPlanes !== undefined) m.clippingPlanes = planes;
      }
    }
  }

  // ── Overlay group ──────────────────────────────────────────────────────────

  private _ensureOverlayGroup(scene: THREE.Scene): void {
    let overlayGroup = (scene as any).overlays as THREE.Group | undefined;
    if (!overlayGroup) {
      overlayGroup = new THREE.Group();
      overlayGroup.name = 'overlays';
      (scene as any).overlays = overlayGroup;
      scene.add(overlayGroup);
    }
    this._overlayGroup = overlayGroup;
  }

  private _addOverlay(obj: THREE.Object3D): void {
    // Apply current clip plane to the overlay material (§3)
    if (this._clipPlane && (obj as any).material) {
      const m = (obj as any).material;
      const planes = [this._clipPlane];
      if (Array.isArray(m)) m.forEach((x: any) => { if (x.clippingPlanes !== undefined) x.clippingPlanes = planes; });
      else if (m.clippingPlanes !== undefined) m.clippingPlanes = planes;
    }
    this._overlayObjects.push(obj);
    this._overlayGroup?.add(obj);
  }

  private _clearOverlays(_scene: THREE.Scene): void {
    for (const obj of this._overlayObjects) {
      this._overlayGroup?.remove(obj);
      // Queue disposal — NEVER call dispose() synchronously here.
      // Three.js / post-processing passes (TRAA, SSGI) hold references to shader
      // programs keyed by material UUID. Calling dispose() while the renderer is
      // still executing the current frame will dereference those program objects
      // mid-pass, causing uniform reads on null (e.g. 'uZoom' → TypeError crash).
      this._deferredDisposals.push(obj);
    }
    this._overlayObjects = [];
  }

  /** Flush the deferred disposal queue — only call from a safe RAF tick or restore(). */
  private _flushDeferredDisposals(): void {
    for (const obj of this._deferredDisposals) {
      if ((obj as any).geometry?.dispose) (obj as any).geometry.dispose();
      if ((obj as any).material) {
        const mat = (obj as any).material;
        if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose?.());
        else (mat as THREE.Material).dispose?.();
      }
    }
    this._deferredDisposals = [];
  }

  // ── Material caching ───────────────────────────────────────────────────────

  private _saveMaterial(mesh: THREE.Mesh): void {
    if (!this._originals.has(mesh)) {
      this._originals.set(
        mesh,
        Array.isArray(mesh.material)
          ? mesh.material.map(m => m.clone())
          : mesh.material.clone()
      );
    }
  }

  private _restoreMaterials(): void {
    for (const mesh of this._savedMeshes) {
      const original = this._originals.get(mesh);
      if (original !== undefined) {
        mesh.material = Array.isArray(original)
          ? original.map(m => m.clone())
          : original.clone();
      }
      mesh.renderOrder = 0;
    }
    this._savedMeshes = [];
  }

  private _applyToMesh(mesh: THREE.Mesh, mat: THREE.Material): void {
    this._saveMaterial(mesh);
    this._savedMeshes.push(mesh);
    mesh.material = mat;
  }

  // ── Shared ghost helper ────────────────────────────────────────────────────

  /**
   * Applies the §1.1 structural ghost base to a mesh (structural or non-structural).
   * Adds cyan LineSegments overlay for structural elements.
   * Returns true if the mesh was ghost-treated, false if it was skipped (room mesh).
   *
   * GHOST-PROFILE FIX: Door and window sub-meshes (frame, leaf, hinges, handles,
   * glazing) carry no elementType on the mesh itself — it lives on their parent
   * THREE.Group.  Without the ancestor check below, every child mesh is classified
   * as non-structural and receives the 4% white ghost material, producing clearly
   * visible ghost profiles in Inspect mode.  Walking the parent chain and bailing
   * out on 'door' or 'window' prevents this entirely.
   */
  private _applyGhostToNonRoomMesh(obj: THREE.Mesh): boolean {
    const ud = obj.userData;
    if (ud.isRoomVolume || ud.isRoomOverlay) return false;

    // ── SHADER-MATERIAL GUARD (uZoom crash fix) ────────────────────────────
    // OBC's SimpleGrid uses a THREE.ShaderMaterial whose uniforms include `uZoom`.
    // SimpleGrid exposes a `get material() { return this.three.material; }` getter.
    // If we replace gridMesh.material with MeshPhongMaterial, the getter returns
    // the new material, and camera-controls' `updateZoom` event handler then reads
    // `this.material.uniforms.uZoom` — but MeshPhongMaterial has no `uniforms`
    // property, so `undefined.uZoom` throws on every camera move.
    //
    // Guard: never ghost any mesh whose current material is a ShaderMaterial.
    // All legitimate BIM geometry (walls, slabs, doors, rooms) uses Standard/
    // Phong/Basic materials — only system-level meshes (grid) use ShaderMaterial.
    const meshMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (meshMat instanceof THREE.ShaderMaterial) return false;

    // Skip sub-meshes that belong to door or window groups.
    // DoorBuilder / WindowBuilder place all geometry as children of a THREE.Group
    // whose userData.elementType is 'door'/'window'.  The child meshes themselves
    // carry no elementType, so without this check they would be ghost-treated.
    let ancestor: THREE.Object3D | null = obj.parent;
    while (ancestor) {
      const aType = ((ancestor.userData?.elementType ?? '') as string).toLowerCase();
      if (aType === 'door' || aType === 'window') return false;
      ancestor = ancestor.parent;
    }

    const type = ((ud.type ?? ud.elementType ?? '') as string).toLowerCase();
    const isStructural = ['slab', 'column', 'wall'].some(t => type.includes(t));

    if (isStructural) {
      this._applyToMesh(obj, new THREE.MeshPhongMaterial({
        color:       GHOST_STRUCTURAL_COLOR,
        opacity:     GHOST_STRUCTURAL_OPACITY,
        transparent: true,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      }));
      // 1px cyan LineSegments wireframe (§1.1)
      // _overlayGroup lives at the scene root (world space), so we must use the
      // mesh's WORLD transform — not its local position/rotation/scale — otherwise
      // any wall mesh inside a wallGroup with a non-identity transform produces an
      // edge overlay displaced to the wrong position in the scene.
      const edges   = new THREE.EdgesGeometry(obj.geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: GHOST_EDGE_COLOR, linewidth: 1 });
      const lines   = new THREE.LineSegments(edges, lineMat);
      const wPos  = new THREE.Vector3();
      const wQuat = new THREE.Quaternion();
      const wScale = new THREE.Vector3();
      obj.getWorldPosition(wPos);
      obj.getWorldQuaternion(wQuat);
      obj.getWorldScale(wScale);
      lines.position.copy(wPos);
      lines.quaternion.copy(wQuat);
      lines.scale.copy(wScale);
      this._addOverlay(lines);
    } else {
      this._applyToMesh(obj, new THREE.MeshPhongMaterial({
        color:       0xffffff,
        opacity:     GHOST_NON_STRUCTURAL_OPACITY,
        transparent: true,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      }));
    }
    return true;
  }

  /**
   * Creates a MeshPhongMaterial for a room volume mesh based on DeltaMap health.
   * Falls back to Discovery Heatmap (blue/cyan gradients) when no brief is set.
   * Returns the material AND whether it should pulse (i.e. it's the selected jewel).
   */
  private _makeRoomVolumeMat(
    roomId:    string,
    deltaMap:  Readonly<DeltaMap>,
    isSelected: boolean,
  ): { mat: THREE.MeshPhongMaterial; pulse: boolean } {
    if (isSelected) {
      const mat = new THREE.MeshPhongMaterial({
        color:             VOLUME_SELECTED_COLOR,
        emissive:          new THREE.Color(VOLUME_SELECTED_EMISSIVE),
        emissiveIntensity: 0.45,
        opacity:           VOLUME_SELECTED_BASE,
        transparent:       true,
        side:              THREE.DoubleSide,
        depthWrite:        false,
      });
      return { mat, pulse: true };
    }

    // ── No brief: use Discovery Heatmap (blue/cyan by relative area) ──────────
    if (deltaMap.size === 0 && this._discoveryRooms.length > 0) {
      return { mat: this._makeDiscoveryMat(roomId), pulse: false };
    }

    const entries  = deltaMap.get(roomId) ?? [];
    const areaEntry = entries.find(e => e.metric === 'Area (m²)');

    let color   = HEATMAP_GREY_COLOR;
    let opacity = VOLUME_NO_REQ_OPACITY;

    if (areaEntry) {
      opacity = VOLUME_HEALTH_OPACITY;
      switch (areaEntry.severity) {
        case 'green': color = HEATMAP_PASS_COLOR;  break;
        case 'amber': color = HEATMAP_WARN_COLOR;  break;
        case 'red':
          color = (areaEntry.delta as number) < 0 ? HEATMAP_SMALL_COLOR : HEATMAP_LARGE_COLOR;
          break;
      }
    }

    const mat = new THREE.MeshPhongMaterial({
      color,
      opacity,
      transparent: true,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    return { mat, pulse: false };
  }

  /**
   * Discovery Heatmap material — blue/cyan gradient by relative room area.
   * Largest room = deepest blue (#006EB4), smallest = lightest cyan (#A8E6F0).
   */
  private _makeDiscoveryMat(roomId: string): THREE.MeshPhongMaterial {
    const areas = this._discoveryRooms.map(r => r.area);
    const maxArea = Math.max(...areas, 0.001);
    const minArea = Math.min(...areas, 0);
    const range   = Math.max(maxArea - minArea, 0.001);

    const room  = this._discoveryRooms.find(r => r.id === roomId);
    const area  = room?.area ?? 0;
    const norm  = Math.max(0, Math.min(1, (area - minArea) / range)); // 0=smallest, 1=largest

    // Interpolate from cyan (#A8E6F0 = lightest) to deep blue (#006EB4 = darkest)
    const r = Math.round(168 + (0   - 168) * norm);
    const g = Math.round(230 + (110 - 230) * norm);
    const b = Math.round(240 + (180 - 240) * norm);
    const color = (r << 16) | (g << 8) | b;

    return new THREE.MeshPhongMaterial({
      color,
      opacity:     0.20 + norm * 0.15, // 0.20 → 0.35 — larger rooms more prominent
      transparent: true,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
  }

  // ── Lens A: Ghost (§1.1 + §2.A + §1.3) ──────────────────────────────────

  /**
   * §1.1 Ghost Base: structural 10% frosted + cyan edges; non-structural 4% white.
   * §2.A Volumetric Health Map: room volumes coloured by DeltaMap health (opacity 0.15).
   * §1.3 Selected Jewel: selected room volume → violet emissive + RAF pulse.
   */
  private _applyGhost(
    scene:          THREE.Scene,
    deltaMap:       Readonly<DeltaMap>,
    selectedRoomId?: string,
  ): void {
    this._pulseMeshes = [];

    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const ud = obj.userData;

      if (ud.isRoomVolume) {
        // §2.A / §1.3 — volume mesh gets health color or jewel
        const isSelected = !!(selectedRoomId && ud.roomId === selectedRoomId);
        const { mat, pulse } = this._makeRoomVolumeMat(ud.roomId ?? '', deltaMap, isSelected);
        this._applyToMesh(obj, mat);
        if (pulse) this._pulseMeshes.push(mat);
        return;
      }

      if (ud.isRoomOverlay) {
        // Floor overlay hidden — volume takes over visually
        this._applyToMesh(obj, new THREE.MeshBasicMaterial({
          transparent: true,
          opacity:     VOLUME_FLOOR_OPACITY,
          depthWrite:  false,
        }));
        return;
      }

      // §1.1 structural ghost
      this._applyGhostToNonRoomMesh(obj);
    });

    if (this._pulseMeshes.length > 0) this._startPulse();
  }

  // ── Lens B: Spatial Heatmap (§2.A) ────────────────────────────────────────

  /**
   * §1.1 Ghost base for all non-room elements.
   * §2.A Room volumes coloured green/amber/red.
   * §2.A Holographic purple extension box for undersized rooms.
   * §1.3 Selected jewel with pulse.
   */
  private _applySpatialHeatmap(
    scene:           THREE.Scene,
    deltaMap:        Readonly<DeltaMap>,
    selectedRoomId?: string,
  ): void {
    this._pulseMeshes = [];

    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const ud = obj.userData;

      if (ud.isRoomVolume) {
        const isSelected = !!(selectedRoomId && ud.roomId === selectedRoomId);
        const { mat, pulse } = this._makeRoomVolumeMat(ud.roomId ?? '', deltaMap, isSelected);
        this._applyToMesh(obj, mat);
        if (pulse) this._pulseMeshes.push(mat);
        return;
      }

      if (ud.isRoomOverlay) {
        // Hide flat floor overlay — volumes provide the visual
        this._applyToMesh(obj, new THREE.MeshBasicMaterial({
          transparent: true,
          opacity:     VOLUME_FLOOR_OPACITY,
          depthWrite:  false,
        }));
        return;
      }

      // §1.1 ghost base for all other elements
      this._applyGhostToNonRoomMesh(obj);
    });

    // §2.A Holographic Extension — required boundary box for undersized rooms
    deltaMap.forEach((entries, roomId) => {
      const areaEntry = entries.find(
        e => e.metric === 'Area (m²)' && e.status === 'FAIL' && (e.delta as number) < 0
      );
      if (!areaEntry) return;

      const req    = areaEntry.required as number;
      const side_m = Math.sqrt(Math.max(req, 0.01));

      // Find the room volume mesh centroid to place the extension box
      let roomCenter: THREE.Vector3 | null = null;
      let roomBaseY   = 0;
      let roomHeight  = 3.0;

      scene.traverse(obj => {
        if (roomCenter) return;
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.userData.roomId !== roomId) return;
        if (!obj.userData.isRoomVolume && !obj.userData.isRoomOverlay) return;
        const box = new THREE.Box3().setFromObject(obj);
        roomCenter = new THREE.Vector3();
        box.getCenter(roomCenter);
        roomBaseY  = box.min.y;
        roomHeight = Math.max(box.max.y - box.min.y, 0.5);
      });

      if (!roomCenter) return;
      const rc = roomCenter as THREE.Vector3;

      // Purple holographic wireframe box (§2.A)
      const extGeo = new THREE.BoxGeometry(side_m, roomHeight, side_m);
      const extMat = new THREE.MeshBasicMaterial({
        color:       HOLOGRAPHIC_COLOR,
        wireframe:   true,
        transparent: true,
        opacity:     0.65,
      });
      const ext = new THREE.Mesh(extGeo, extMat);
      ext.position.set(rc.x, roomBaseY + roomHeight / 2, rc.z);
      ext.userData = { type: 'diagnostic-overlay', roomId };
      this._addOverlay(ext);

      // Translucent fill (very subtle) so edges read against ghost background
      const fillGeo = new THREE.BoxGeometry(side_m, roomHeight, side_m);
      const fillMat = new THREE.MeshBasicMaterial({
        color:       HOLOGRAPHIC_COLOR,
        transparent: true,
        opacity:     0.05,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      });
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.position.set(rc.x, roomBaseY + roomHeight / 2, rc.z);
      this._addOverlay(fill);
    });

    if (this._pulseMeshes.length > 0) this._startPulse();
  }

  // ── Lens C: Openings / ADA ────────────────────────────────────────────────

  private _applyOpenings(scene: THREE.Scene, selectedRoomId?: string): void {
    // Ghost base (without deltaMap — pass empty map so all volumes render as grey/neutral)
    this._applyGhost(scene, new Map<string, readonly DeltaEntry[]>(), selectedRoomId);

    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const type = (obj.userData.type as string | undefined) ?? '';
      if (!['door', 'Door'].includes(type)) return;

      // 1500 mm turning circle (§ADA)
      const ringGeo = new THREE.RingGeometry(0, 0.75, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffee00, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      const box  = new THREE.Box3().setFromObject(obj);
      const ctr  = new THREE.Vector3();
      box.getCenter(ctr);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(ctr.x, box.min.y + 0.01, ctr.z);
      this._addOverlay(ring);

      // Low-door red indicator
      if ((box.max.y - box.min.y) < 2.0) {
        const indGeo = new THREE.BoxGeometry(0.1, 0.05, 0.1);
        const indMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const ind    = new THREE.Mesh(indGeo, indMat);
        ind.position.set(ctr.x, box.max.y + 0.05, ctr.z);
        this._addOverlay(ind);
      }
    });
  }

  // ── Lens D: Finishes ──────────────────────────────────────────────────────

  private _applyFinishes(
    scene:    THREE.Scene,
    deltaMap: Readonly<DeltaMap>,
    selectedRoomId?: string,
  ): void {
    const MATERIAL_COLORS: Record<string, number> = {
      'vinyl':            0x44bb77,
      'vinyl-antistatic': 0x44bb77,
      'carpet':           0x8866cc,
      'tile':             0x4488ff,
      'concrete':         0x888888,
      'acoustic':         0xff8833,
      'latex':            0xeeeeee,
      'paint':            0xffffff,
      'acousitc-tile':    0xff8833,
    };
    const getColor = (name: string): number => {
      const key = Object.keys(MATERIAL_COLORS).find(k => name.toLowerCase().includes(k));
      return key ? MATERIAL_COLORS[key] : 0xaaaaaa;
    };

    // Ghost base for all non-room elements
    this._applyGhost(scene, deltaMap, selectedRoomId);

    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const ud = obj.userData;
      const roomId = ud.roomId as string | undefined;
      if (!roomId) return;
      if (ud.isRoomVolume || ud.isRoomOverlay) return;

      const entries = deltaMap.get(roomId) ?? [];
      const type    = ((ud.type ?? '') as string).toLowerCase();

      let finishEntry: DeltaEntry | undefined;
      if (type.includes('floor') || type.includes('slab')) {
        finishEntry = entries.find(e => e.metric === 'Floor Finish');
      } else if (type.includes('wall')) {
        finishEntry = entries.find(e => e.metric === 'Wall Finish');
      } else if (type.includes('ceiling')) {
        finishEntry = entries.find(e => e.metric === 'Ceiling Type');
      }

      if (!finishEntry) return;

      const requiredColor = getColor(finishEntry.required as string);
      if (finishEntry.status === 'FAIL') {
        const actualColor = getColor(finishEntry.actual as string);
        const mat = new THREE.MeshBasicMaterial({ color: requiredColor });
        this._applyToMesh(obj, mat);
        let toggle = false;
        const id = setInterval(() => {
          if (!this._active) { clearInterval(id); return; }
          (mat as THREE.MeshBasicMaterial).color.setHex(toggle ? requiredColor : actualColor);
          toggle = !toggle;
        }, MISMATCH_FINISH_PULSE_MS);
      } else {
        this._applyToMesh(obj, new THREE.MeshBasicMaterial({ color: requiredColor, side: THREE.DoubleSide }));
      }
    });
  }

  // ── Lens E: X-Ray (Systems) ───────────────────────────────────────────────

  private _applyXray(scene: THREE.Scene, deltaMap: Readonly<DeltaMap>): void {
    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const ud       = obj.userData;
      const category = ud.category as string | undefined;
      const type     = ((ud.type ?? '') as string).toLowerCase();
      const isMEP    = category === 'MEP' || ['duct', 'pipe', 'conduit', 'hvac'].some(t => type.includes(t));

      if (ud.isRoomVolume || ud.isRoomOverlay) return; // keep rooms neutral

      if (isMEP) {
        const mat = new THREE.MeshPhongMaterial({
          color:             XRAY_EMISSIVE_COLOR,
          emissive:          new THREE.Color(XRAY_EMISSIVE_COLOR),
          emissiveIntensity: 0.6,
          opacity:           0.7,
          transparent:       true,
          depthTest:         false,
          depthWrite:        false,
        });
        obj.renderOrder = 999;
        this._applyToMesh(obj, mat);
      } else {
        this._applyToMesh(obj, new THREE.MeshPhongMaterial({
          color:       0xffffff,
          opacity:     0.04,
          transparent: true,
          depthWrite:  false,
          side:        THREE.DoubleSide,
        }));
      }
    });

    // STC failure walls — acoustic leakage indicator
    deltaMap.forEach((entries, roomId) => {
      const stcEntry = entries.find(e => e.metric === 'STC (dB)' && e.status === 'FAIL');
      if (!stcEntry) return;

      scene.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.userData.roomId !== roomId) return;
        const type = ((obj.userData.type ?? '') as string).toLowerCase();
        if (!type.includes('wall')) return;

        const box  = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        const leakGeo = new THREE.BoxGeometry(size.x * 1.02, size.y * 1.02, size.z * 1.02);
        const leakMat = new THREE.MeshBasicMaterial({
          color: 0xff2200, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
        });
        const leak = new THREE.Mesh(leakGeo, leakMat);
        const ctr  = new THREE.Vector3();
        box.getCenter(ctr);
        leak.position.copy(ctr);
        this._addOverlay(leak);
      });
    });
  }

  // ── Lens F: Assets (Ghost Equipment) ──────────────────────────────────────

  private _applyAssets(
    scene:           THREE.Scene,
    deltaMap:        Readonly<DeltaMap>,
    selectedRoomId?: string,
  ): void {
    this._applyGhost(scene, deltaMap, selectedRoomId);

    const FALLBACK_W = 0.6, FALLBACK_H = 1.0, FALLBACK_D = 0.6;

    deltaMap.forEach((entries, roomId) => {
      const missingAssets = entries.filter(
        e => e.category === 'assets' && e.status === 'FAIL' && e.delta === 'MISSING'
      );
      if (missingAssets.length === 0) return;

      let roomCenter: THREE.Vector3 | null = null;
      scene.traverse(obj => {
        if (roomCenter) return;
        if (!(obj instanceof THREE.Mesh)) return;
        if (obj.userData.roomId !== roomId) return;
        if (!obj.userData.isRoomVolume && !obj.userData.isRoomOverlay) return;
        const box = new THREE.Box3().setFromObject(obj);
        roomCenter = new THREE.Vector3();
        box.getCenter(roomCenter);
      });
      if (!roomCenter) return;

      let cumulativeOffset = 0;
      missingAssets.forEach(entry => {
        const catalogEntry = assetCatalogStore.getByName(entry.metric);
        const w_m = catalogEntry ? catalogEntry.parameters.width_mm  / 1000 : FALLBACK_W;
        const h_m = catalogEntry ? catalogEntry.parameters.height_mm / 1000 : FALLBACK_H;
        const d_m = catalogEntry ? catalogEntry.parameters.depth_mm  / 1000 : FALLBACK_D;
        const clearance_m = catalogEntry?.parameters.clearanceRadius_mm
          ? catalogEntry.parameters.clearanceRadius_mm / 1000 : 0;

        const rc   = roomCenter as THREE.Vector3;
        const xPos = rc.x + cumulativeOffset + w_m / 2;
        const yPos = rc.y + h_m / 2;
        const zPos = rc.z;

        const ghostGeo = new THREE.BoxGeometry(w_m, h_m, d_m);
        const ghostMat = new THREE.MeshBasicMaterial({
          color: MISSING_ASSET_COLOR, wireframe: true, transparent: true, opacity: 0.75,
        });
        const ghost = new THREE.Mesh(ghostGeo, ghostMat);
        ghost.position.set(xPos, yPos, zPos);
        ghost.userData = { type: 'diagnostic-overlay', assetName: entry.metric };
        this._addOverlay(ghost);

        const fillGeo = new THREE.BoxGeometry(w_m, h_m, d_m);
        const fillMat = new THREE.MeshBasicMaterial({
          color: MISSING_ASSET_COLOR, transparent: true, opacity: 0.06,
          side: THREE.DoubleSide, depthWrite: false,
        });
        const fill = new THREE.Mesh(fillGeo, fillMat);
        fill.position.set(xPos, yPos, zPos);
        this._addOverlay(fill);

        if (clearance_m > 0) {
          const discGeo = new THREE.RingGeometry(0, clearance_m, 48);
          const discMat = new THREE.MeshBasicMaterial({
            color: 0xff4400, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
          });
          const disc = new THREE.Mesh(discGeo, discMat);
          disc.rotation.x = -Math.PI / 2;
          disc.position.set(xPos, rc.y + 0.01, zPos);
          this._addOverlay(disc);
        }

        cumulativeOffset += w_m + 0.3;
      });
    });
  }

  // ── Polymorphic Auditor helpers ────────────────────────────────────────────

  private _resolveElementType(obj: THREE.Object3D): string | null {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const t = cur.userData.elementType ?? cur.userData.type ?? null;
      if (t) return (t as string).toLowerCase();
      cur = cur.parent;
    }
    return null;
  }

  private _resolveElementId(obj: THREE.Object3D): string | null {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      const id = cur.userData.id ?? cur.userData.elementId ?? null;
      if (id) return id as string;
      cur = cur.parent;
    }
    return null;
  }

  private _applyClearWorldGhost(mesh: THREE.Mesh): void {
    const mat = mesh.material;
    if (!mat) return;
    const isSM = Array.isArray(mat)
      ? mat.some(m => m instanceof THREE.ShaderMaterial)
      : mat instanceof THREE.ShaderMaterial;
    if (isSM) return;
    this._applyToMesh(mesh, new THREE.MeshPhongMaterial({
      color:       0xffffff,
      opacity:     0.06,
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    }));
  }

  // ── Public: Ghost all elements except the focused type ─────────────────────

  applyGhostWithFocus(scene: THREE.Scene, elementType: string): void {
    this._focusedElementType = elementType;
    const focusNorm = elementType.toLowerCase().replace(/s$/, '');
    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!mat) return;
      const isSM = Array.isArray(mat)
        ? mat.some(m => m instanceof THREE.ShaderMaterial)
        : mat instanceof THREE.ShaderMaterial;
      if (isSM) return;
      const resolved = this._resolveElementType(obj);
      if (!resolved) {
        this._applyClearWorldGhost(obj);
        return;
      }
      const resolvedNorm = resolved.replace(/s$/, '');
      if (resolvedNorm === focusNorm || resolved === elementType.toLowerCase()) {
        // Keep focused elements — restore from material backup if available
        const orig = this._originals.get(obj);
        if (orig) {
          obj.material = Array.isArray(orig) ? [...orig] : orig;
        }
      } else {
        this._applyClearWorldGhost(obj);
      }
    });
    console.log(`[DiagnosticMaterialManager] applyGhostWithFocus — type: ${elementType}`);
  }

  // ── Public: Attribute heatmap colours for the focused element type ──────────

  applyAttributeHeatmap(
    scene:       THREE.Scene,
    elementType: string,
    heatmap:     ReadonlyArray<{ id: string; color: number }>,
  ): void {
    if (heatmap.length === 0) return;
    const colorById = new Map(heatmap.map(h => [h.id, h.color]));
    scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!mat) return;
      const isSM = Array.isArray(mat)
        ? mat.some(m => m instanceof THREE.ShaderMaterial)
        : mat instanceof THREE.ShaderMaterial;
      if (isSM) return;
      const id = this._resolveElementId(obj);
      if (!id) return;
      const color = colorById.get(id);
      if (color === undefined) return;
      this._applyToMesh(obj, new THREE.MeshPhongMaterial({
        color,
        emissive:          new THREE.Color(color),
        emissiveIntensity: 0.3,
        opacity:           0.9,
        transparent:       true,
      }));
    });
    console.log(`[DiagnosticMaterialManager] applyAttributeHeatmap — ${heatmap.length} entries for ${elementType}`);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const diagnosticMaterialManager = new DiagnosticMaterialManager();
