import * as THREE from "@pryzm/renderer-three/three";
import * as OBC from "@thatopen/components";

export class OrthoPlanCameraLockController {
  private _world: OBC.World;
  private _controls: any;

  private _originalState = {
    enableRotate: true,
    up: new THREE.Vector3(),
    rotation: new THREE.Euler(),
  };

  private _boundLockHandler = this._lockOrientation.bind(this);

  constructor(world: OBC.World) {
    this._world = world;
    this._controls = world.camera.controls;
  }

  /** Always returns the live Three.js camera — safe after projection switches. */
  private get _camera(): THREE.Camera {
    return this._world.camera.three;
  }

  activate(): void {
    this._storeState();
    this._applyLock();
  }

  deactivate(): void {
    this._restoreState();
  }

  private _storeState(): void {
    this._originalState.enableRotate = this._controls.enableRotate;
    this._originalState.up.copy(this._camera.up);
    this._originalState.rotation.copy(this._camera.rotation);
  }

  private _applyLock(): void {
    this._controls.enableRotate = false;

    this._camera.up.set(0, 0, -1);
    this._camera.rotation.set(-Math.PI / 2, 0, 0);

    this._controls.addEventListener("update", this._boundLockHandler);

    (this._camera as any).updateProjectionMatrix?.();
  }

  private _lockOrientation(): void {
    const cam = this._camera;
    cam.rotation.x = -Math.PI / 2;
    cam.rotation.y = 0;
    cam.rotation.z = 0;

    // Hard lock Y position to prevent vertical drift during pan/zoom.
    const target = this._controls.getTarget(new THREE.Vector3());
    const currentDist = cam.position.y - target.y;
    if (Math.abs(currentDist - 50) > 0.001) {
      cam.position.y = target.y + 50;
    }
  }

  private _restoreState(): void {
    // RC3-FIX: Do NOT restore up/rotation here.
    //
    // deactivate() is called while the camera is still OrthographicCamera (before
    // camera.projection.set('Perspective') runs in _activate3DView).  Copying
    // _originalState.up / _originalState.rotation onto the OrthographicCamera is a
    // meaningless operation on the wrong camera type — OBC discards the state when
    // it constructs the new PerspectiveCamera for the projection switch.
    //
    // _activate3DView() already sets:
    //   camera.three.up.set(0, 1, 0)
    //   controls.setLookAt(..., false)   ← snaps camera to the correct 3D position
    //   controls.update(0)               ← syncs camera-controls internal state
    //
    // So restoring up/rotation here is both wrong (wrong camera type) and redundant
    // (overwritten by _activate3DView immediately after).
    this._controls.enableRotate  = this._originalState.enableRotate;
    this._controls.enableDamping = true;
    this._controls.removeEventListener("update", this._boundLockHandler);
  }
}
