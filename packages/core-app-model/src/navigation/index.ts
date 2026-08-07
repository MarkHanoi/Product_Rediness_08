/**
 * @pryzm/core-app-model — navigation sub-barrel (Wave 10 Task 2 W10-A)
 */

export type { Georeference } from './GeospatialAdapter.js';
export { GeospatialAdapter } from './GeospatialAdapter.js';

// ── P9-W7 Batch A (2026-05-10) — navigation files ────────────────────────────

export { frameObject, frameObjects } from './CameraFramingUtils.js';
// §CAM-FRAME-INVARIANT (L-742) — the single framing authority shared by 3D-view
// activation and Fit All. See cameraFraming.ts header.
export type { FitPose, FitPoseOptions } from './cameraFraming.js';
export { computeFitPose, boundsVisibleToCamera, boundsFramedByCamera, shouldPersistDepartingCamera, MIN_FRAMED_SCREEN_FRACTION } from './cameraFraming.js';
// §CAM-BIM-SCALE-BOUNDS (L-744) — the guard that stops ECEF/globe contamination
// reaching the DEFAULT-FRAMING path (L-378 guarded only the saved pose).
export { GLOBE_SCALE_LIMIT_M, isGlobeScalePosition, isGlobeScaleBounds } from './cameraFraming.js';
export type { DepartingCameraContext } from './cameraFraming.js';
export { FirstPersonController } from './FirstPersonController.js';
export type { KeyboardOrbitCamera } from './KeyboardOrbitPlugin.js';
export { KeyboardOrbitPlugin } from './KeyboardOrbitPlugin.js';
export type { CameraSlot, CameraState } from './MultiViewCameraManager.js';
export { MultiViewCameraManager } from './MultiViewCameraManager.js';
export type { ViewMode } from './ViewNavigationManager.js';
export { ViewNavigationManager } from './ViewNavigationManager.js';
