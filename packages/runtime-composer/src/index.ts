// @pryzm/runtime-composer — public barrel.
//
// Phase A of PRYZM2-ENTERPRISE-WIREUP-PLAN-S72 (S73).  Owns the single
// composition root for PRYZM 2 — `composeRuntime()` — and the
// `PryzmRuntime` typed contract that every `src/ui/` panel will reach
// the engine through after Phase B widens panel constructors.
//
// Per S72 §3.1, this is NOT a bridge package.  It is a one-shot
// wire-up.  The white UI imports the contract from
// `@pryzm/runtime-composer/types`; the boot path (`src/main.ts`) is
// the only file that imports `composeRuntime` from this barrel.

export { composeRuntime, type ComposeRuntimeOptions, type ComposedRuntime } from './composeRuntime.js';
export { EventBus } from './EventBus.js';
export { PluginHost } from './PluginHost.js';
export { UserPreferences } from './UserPreferences.js';
export { buildToastsSlot, type ShowAppToastFn } from './ToastController.js';

// Re-export the contract for ergonomics — callers may import from the
// barrel or from `@pryzm/runtime-composer/types` interchangeably.
export type {
  PryzmRuntime,
  RuntimeAudit,
  RuntimeEvents,
  TypedEventEmitter,
  Disposable,
  ToastKind,
  SceneSlot,
  SelectionSlot,
  HoverSlot,
  ProjectContextSlot,
  ToolsSlot,
  PickingSlot,
  PersistenceSlot,
  PersistenceTierSlot,
  PryzmProjectBundle,
  StoresSlot,
  PersistenceClientLike,
  PersistenceStatus,
  PersistenceOpenProgress,
  ProjectPatch,
  ProjectMemberRole,
  MemberRecord,
  MembersClientLike,
  PryzmExporterLike,
  PryzmImporterLike,
  SyncSlot,
  AiSlot,
  AiCostSnapshot,
  AiStreamChunk,
  PluginsSlot,
  PluginDescriptor,
  IfcSlot,
  IfcImportOptions,
  IfcImportResult,
  IfcExportOptions,
  IfcExportResult,
  RhinoSlot,
  BcfSlot,
  PdfSlot,
  ToastsSlot,
  UserPreferencesSlot,
  UndoStackSlot,
  UndoStackState,
  WorkspaceSlot,
  WorkspaceSurfaceKind,
  WorkspaceMode,
  WorkspaceModeController,
  CameraControllerSlot,
  PhysicsHostSlot,
  PhysicsVec3,
  PhysicsAabbBox,
  PhysicsRaycastHit,
  InputHostSlot,
  InputChannel,
  InputModifierMask,
  InputCanvasPoint,
  InputPointerEventPayload,
  InputWheelEventPayload,
  InputKeyEventPayload,
  InputEventByChannel,
  // Wave 6 Phase B — panel-binding API types
  PanelViewSpec,
  ViewRegistrySlot,
  ViewRegistrySummary,
} from './types.js';

export { RuntimeNotWiredError } from './types.js';

// Phase C — buildPersistence is exported so the test harness can build
// just the persistence slot without spinning up the whole runtime.
export { buildPersistenceSlot, type BuildPersistenceOptions } from './buildPersistence.js';

// Wave 4 Track A (PR 4.A.3) — `buildWorkspaceModeController` is
// exported so the unit test (`__tests__/workspaceMode.slot.test.ts`)
// and any future host can drive the slot in isolation without a
// full `composeRuntime()`.  Mirrors the `buildPersistenceSlot` /
// `buildToastsSlot` pattern.
export {
  buildWorkspaceModeController,
  type BuildWorkspaceModeControllerOptions,
} from './workspace/WorkspaceModeController.js';

// Wave 4 Track A (PR 4.A.4) — the `WorkspaceSurface` class + factory
// + typed errors + `WorkspaceSurfaceHost` interface are surfaced
// through this barrel so `src/main.ts` (the only intra-app caller
// that mounts the surface) can name them without reaching into
// `@pryzm/renderer-three` directly.  `runtime.workspace.surface`
// is constructed by `composeRuntime()`; this re-export exists for
// callers that need the *types* (test doubles, telemetry) and for
// the very small set of callers that need the typed errors for
// `instanceof`-based branching.
export {
  WorkspaceSurface,
  buildWorkspaceSurface,
  WorkspaceSurfaceNotMountedError,
  WorkspaceSurfaceDisposedError,
  type WorkspaceSurfaceHost,
} from '@pryzm/renderer-three';

// Wave 4 Track A (PR 4.A.5) — `buildPickingSlot` + `PickerDelegate` exported
// for isolation testing and D.6 wiring (host passes a real `PickerDelegate`
// thunk once the scene-canvas is mounted).  Mirrors the `buildWorkspaceModeController`
// export convention.
export { buildPickingSlot, type PickerDelegate } from './buildPickingSlot.js';

// S03: CommandEventBridge — wires CommandBus.patches → runtime.events.
// Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §3
export { wireCommandEventBridge } from './CommandEventBridge.js';

// Task 5.2 — ProjectLifecycleController (C13 project-isolation teardown).
export { ProjectLifecycleController, type IBatchCoordinatorTeardown } from './ProjectLifecycleController.js';

// ── Wave A20-T27 — MarketplaceFacet ───────────────────────────────────────────
export {
  MarketplaceFacet,
  buildMarketplaceSlot,
  type MarketplacePlugin,
  type MarketplaceInstallResult,
  type MarketplaceListResult,
  type MarketplaceSlot,
} from './facets/MarketplaceFacet.js';
