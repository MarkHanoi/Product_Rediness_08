import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';

/**
 * ViewMode defines the supported camera orientations
 */
export type ViewMode = '3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' | 'Left' | 'Right';

/**
 * ViewNavigationManager handles the logic for switching between 3D perspective 
 * and fixed orthographic BIM views without mutating the scene or tools.
 */
export class ViewNavigationManager {
  private _currentMode: ViewMode = '3D';
  private _camera: OBC.OrthoPerspectiveCamera;
  private _isTransitioning = false;
  /** Stored reference so the plan-mode lock can always be removed, even across call boundaries. */
  private _controlLockHandler: (() => void) | null = null;

  constructor(camera: OBC.OrthoPerspectiveCamera) {
    this._camera = camera;
  }

  get currentMode() {
    return this._currentMode;
  }

  /**
   * Remove any active plan-mode control lock and reset the mode to '3D'.
   * Called by ViewController whenever it activates a 3D view so that any
   * lock added by a direct navManager.setViewMode('Top') call is cleaned up.
   */
  clearControlLock(): void {
    const controls = this._camera.controls;
    if (this._controlLockHandler) {
      (controls as any).removeEventListener('control', this._controlLockHandler);
      this._controlLockHandler = null;
      console.log('[ViewNav] clearControlLock — stale plan-mode lock removed');
    }
    this._currentMode = '3D';
    controls.mouseButtons.left = 1; // ROTATE
    (controls.touches as any).one = 1;
  }

  /**
   * Transitions the camera to a specific BIM view mode.
   * Implementation uses the OrthoPerspectiveCamera's internal projection switching
   * and rotation locking to prevent 3D drift.
   */
  async setViewMode(mode: ViewMode) {
    if (this._isTransitioning) return;
    this._isTransitioning = true;
    this._currentMode = mode;

    const controls = this._camera.controls;
    const target = new THREE.Vector3();
    controls.getTarget(target);
    
    console.log(`[ViewNav] Mode: ${mode}, Current Target:`, target.toArray());

    // If target is at origin or looks invalid, force a decent starting point
    const isAtOrigin = target.lengthSq() < 0.001;
    
    if (isAtOrigin || mode !== '3D') {
      const worlds = this._camera.components.get(OBC.Worlds);
      const world = worlds.list.get("main");
      const scene = world?.scene;
      if (scene) {
        const box = new THREE.Box3().setFromObject(scene.three);
        // Exclude grid if it's too large and empty
        if (!box.isEmpty() && box.getSize(new THREE.Vector3()).lengthSq() > 0.1) {
          box.getCenter(target);
          console.log(`[ViewNav] New Target from Scene:`, target.toArray());
        } else {
          target.set(0, 0, 0);
          console.log(`[ViewNav] Target forced to Origin (Empty Scene)`);
        }
      }
    }
    
    // ── Camera Anti-Clip: Constraint 4 — Bounding-Box Auto-Framing ─────────────
    // Replaces hardcoded distance=50 with a scene-aware calculation.
    // Mirrors Pascal custom-camera-controls.tsx preview auto-navigation:
    //   const maxDim   = Math.max(tempSize.x, tempSize.y, tempSize.z)
    //   const distance = Math.max(maxDim * 2, 15)
    // PRYZM is in real metres; minimum 10 m, multiplier 1.5× (start conservative).
    let distance = 50; // safe fallback for empty scene
    {
        const worlds = this._camera.components.get(OBC.Worlds);
        const world = worlds.list.get('main');
        const scene = world?.scene;
        if (scene) {
            const sceneBox  = new THREE.Box3().setFromObject(scene.three);
            if (!sceneBox.isEmpty()) {
                const sceneSize = new THREE.Vector3();
                sceneBox.getSize(sceneSize);
                const maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);
                if (Number.isFinite(maxDim) && maxDim > 0) {
                    distance = Math.max(maxDim * 1.5, 10);
                }
            }
        }
    }

    // 1. Handle Projection & Controls Lock
    if (mode === '3D') {
      this._camera.projection.set('Perspective');
      controls.mouseButtons.left = 1; // ROTATE
      (controls.touches as any).one = 1; // TOUCH_ROTATE
    } else {
      this._camera.projection.set('Orthographic');
      controls.mouseButtons.left = 2; // PAN
      (controls.touches as any).one = 2; // TOUCH_PAN
      
      // Force orthographic zoom to a reasonable level
      if (this._camera.three instanceof THREE.OrthographicCamera) {
          const cam = this._camera.three as THREE.OrthographicCamera;
          cam.zoom = 1.0;
      }
    }
    
    // Crucial: Update matrix before animation starts
    this._camera.three.updateProjectionMatrix();

    // Always remove the previous lock handler before (re-)attaching.
    // This prevents stale closures from earlier setViewMode('Top') calls
    // surviving into 3D mode when ViewController later calls activate('3D')
    // without going through navManager.setViewMode().
    if (this._controlLockHandler) {
      (controls as any).removeEventListener('control', this._controlLockHandler);
      this._controlLockHandler = null;
    }

    // For non-3D modes: create, track, and attach a fresh lock handler.
    // For 3D mode: no lock handler needed — controls are already reset above.
    if (mode !== '3D') {
      const lockControls = () => {
        if (this._currentMode !== '3D') {
          // Force the camera mode back to Orthographic if it was changed
          if (this._camera.projection.current !== 'Orthographic') {
            console.warn(`[ViewNav] Correcting projection mode for ${this._currentMode}`);
            this._camera.projection.set('Orthographic');
          }

          // Lock mouse and touch inputs to PAN (2)
          controls.mouseButtons.left = 2;
          (controls.touches as any).one = 2;

          // Force horizontal alignment for Top/RCP views to prevent any rotation drift
          if (this._currentMode === 'Top' || this._currentMode === 'Ceiling' || this._currentMode === 'ceiling-plan') {
            if (Math.abs(this._camera.three.rotation.x + Math.PI / 2) > 0.01 ||
                Math.abs(this._camera.three.rotation.y) > 0.01 ||
                Math.abs(this._camera.three.rotation.z) > 0.01) {
              const t = controls.getTarget(new THREE.Vector3());
              controls.setLookAt(
                this._camera.three.position.x,
                this._camera.three.position.y,
                this._camera.three.position.z,
                t.x, t.y, t.z,
                false
              );
            }
          }
        }
      };
      this._controlLockHandler = lockControls;
      (controls as any).addEventListener('control', lockControls);
    }

    // 2. Position Camera based on mode
    const pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    // 3. Fix Position and Up Vector specifically for each mode
    switch (mode) {
      case 'Top':
        pos.set(target.x, target.y + distance, target.z);
        // Standard architectural top-down view: North is UP (Y in 2D is -Z in 3D)
        up.set(0, 0, -1);
        break;
      case 'Ceiling':
      case 'ceiling-plan':
        pos.set(target.x, target.y - distance, target.z);
        up.set(0, 0, -1);
        break;
      case 'Front':
        pos.set(target.x, target.y, target.z + distance);
        up.set(0, 1, 0);
        break;
      case 'Back':
        pos.set(target.x, target.y, target.z - distance);
        up.set(0, 1, 0);
        break;
      case 'Left':
        pos.set(target.x - distance, target.y, target.z);
        up.set(0, 1, 0);
        break;
      case 'Right':
        pos.set(target.x + distance, target.y, target.z);
        up.set(0, 1, 0);
        break;
      case '3D':
        // No lock handler to remove — it was already cleared above before the switch.
        this._camera.three.up.set(0, 1, 0); // Restore world up
        // If coming from a flat view, restore a nice 3D angle
        if (Math.abs(this._camera.three.position.x - target.x) < 0.1 && 
            Math.abs(this._camera.three.position.z - target.z) < 0.1) {
          pos.set(target.x + 20, target.y + 20, target.z + 20);
        } else {
          this._isTransitioning = false;
          return;
        }
        break;
    }

    console.log(`[ViewNav] Setting LookAt: Pos`, pos.toArray(), "Target", target.toArray());
    
    // Set up vector BEFORE animation
    this._camera.three.up.copy(up);
    
    await controls.setLookAt(
      pos.x, pos.y, pos.z,
      target.x, target.y, target.z,
      true
    );

    this._camera.three.updateProjectionMatrix();
    
    // Force renderer update
    const worlds = this._camera.components.get(OBC.Worlds);
    const world = worlds.list.get("main");
    if (world && world.renderer) {
      if ('needsUpdate' in world.renderer) {
        (world.renderer as any).needsUpdate = true;
      }
    }
    
    // Wait a frame and refresh again to be absolutely sure
    setTimeout(() => {
      if (world && world.renderer && 'needsUpdate' in world.renderer) {
        (world.renderer as any).needsUpdate = true;
      }
    }, 100);
    
    this._isTransitioning = false;

    // Safety-net: dispatch 'view-activated' so RenderPipelineManager.updateCamera()
    // is triggered even when this method is called directly (bypassing ViewController).
    // ViewController.activate() is the preferred path — it dispatches this event
    // itself after full camera setup.  This guard ensures the WebGPU TSL pipeline
    // always rebuilds against the new camera object, preventing scene freezes.
    const viewType = mode === '3D' ? 'perspective' : 'orthographic';
    window.dispatchEvent(new CustomEvent('view-activated', { // TODO(TASK-15)
      detail: { view: null, mode, type: viewType }
    }));
  }

  /**
   * Rotate the camera azimuth CCW, snapping to the nearest 90° grid.
   *
   * Pascal pattern (custom-camera-controls.tsx §orbitCCW):
   *   const snapped = Math.round(currentAzimuth / (π/2)) * (π/2)
   *   controls.rotateTo(snapped - π/2, currentPolar, animate=true)
   *
   * This ensures repeated presses always land on cardinal directions (0°, 90°,
   * 180°, 270°) rather than drifting by 45° each time.
   */
  async orbitLeft(): Promise<void> {
    if (this._currentMode !== '3D') return;
    const controls = this._camera.controls;
    const currentAzimuth = controls.azimuthAngle;
    const currentPolar   = controls.polarAngle;
    const snapped        = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2);
    await controls.rotateTo(snapped - Math.PI / 2, currentPolar, true);
    console.log('[Camera] orbitLeft — snapped azimuth', snapped.toFixed(2), '→', (snapped - Math.PI / 2).toFixed(2));
  }

  /**
   * Rotate the camera azimuth CW, snapping to the nearest 90° grid.
   *
   * Pascal pattern (custom-camera-controls.tsx §orbitCW):
   *   const snapped = Math.round(currentAzimuth / (π/2)) * (π/2)
   *   controls.rotateTo(snapped + π/2, currentPolar, animate=true)
   */
  async orbitRight(): Promise<void> {
    if (this._currentMode !== '3D') return;
    const controls = this._camera.controls;
    const currentAzimuth = controls.azimuthAngle;
    const currentPolar   = controls.polarAngle;
    const snapped        = Math.round(currentAzimuth / (Math.PI / 2)) * (Math.PI / 2);
    await controls.rotateTo(snapped + Math.PI / 2, currentPolar, true);
    console.log('[Camera] orbitRight — snapped azimuth', snapped.toFixed(2), '→', (snapped + Math.PI / 2).toFixed(2));
  }

  /**
   * Toggle between top-down view (polar=0°) and 45° isometric.
   *
   * Pascal pattern (custom-camera-controls.tsx §topViewToggle):
   *   const targetAngle = currentPolar < 0.1 ? π/4 : 0
   *   controls.rotatePolarTo(targetAngle, animate=true)
   *
   * If the camera is already looking straight down (polar < 0.1 rad ≈ 6°),
   * return to the standard 45° isometric. Otherwise go to top-down.
   * Only operates in 3D mode; ignored in flat orthographic views.
   */
  async toggleTopView(): Promise<void> {
    if (this._currentMode !== '3D') return;
    const controls    = this._camera.controls;
    const currentPolar = controls.polarAngle;
    const targetPolar  = currentPolar < 0.1 ? Math.PI / 4 : 0;
    await controls.rotateTo(controls.azimuthAngle, targetPolar, true);
    console.log('[Camera] toggleTopView — polar', currentPolar.toFixed(2), '→', targetPolar.toFixed(2));
  }
}
