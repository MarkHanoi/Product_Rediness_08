// @pryzm/command-bus — public surface.
//
// L2 of the architecture stack.  Owns:
//   • CommandHandler<T, TStores> contract (canExecute + execute)
//   • CommandBus (handler registry + executeCommand + OTel span)
//   • Immer-patch producer (`produceCommand`, `produceWithPatchesPerStore`)
//   • PatchEmitter (MessagePack wire format — ADR-004, S04)
//   • EventLogPersistor (fire-and-forget audit trail subscriber — S04)
//   • UndoStack (bounded + clear-on-load)
//
// L1 stores subscribe to PatchEmitter; L7 plugins call CommandBus.
//
// Per ADR-002 (this sprint) and ADR-006 (idle budget) — see
// `docs/02-decisions/adrs/`.

import { enablePatches } from 'immer';

// `enablePatches()` is the single entry point for Immer's patch generation
// across PRYZM 2.  Per `§S02-T3` we call it ONCE at module load here so
// every consumer of `@pryzm/command-bus` (incl. `produceCommand`,
// `produceWithPatchesPerStore`, plugin handlers) is guaranteed to see
// patch-enabled `produceWithPatches`.  Idempotent per Immer's contract.
enablePatches();

export type {
  CommandHandler,
  HandlerContext,
  HandlerResult,
  AuditMetadata,
  AuditDefaults,
  EventRecord,
  PatchSnapshotEntry,
  StoreId,
  AnyStores,
  ValidationResult,
  Patch,
} from './types.js';

// BIM30 R1 (ADR-0322 §1/§5/§6/§9 + ADR-0324 §1–2) — the consequence contract
// (first draft; expect field-shape revision after wall.move closes) and the
// optional invocation envelope. Types only in R1: no engine, no consumer.
export type {
  ElementId,
  ElementSet,
  UndeterminedReason,
  UndeterminedImpact,
  ImpactDetermination,
  ConsequenceRefusal,
  RefusalSet,
  ConsequenceCommandRef,
  TopologyDelta,
  ViolationRef,
  ValidationDelta,
  RegenerationPlan,
  // R5 — the typed per-element metric transition (`area: 12.4 m² → 10.8 m²`).
  MetricName,
  MetricUnit,
  MetricTransition,
  // SAFE MODE ROOM RESHAPE — the predicted geometry the executor commits verbatim
  // (and the plan-hash coverage that makes an approval bind to it).
  PredictedVertex,
  PredictedGeometry,
  ConsequencePlan,
  PredictedVsActual,
  ConsequenceReport,
  // R4 (BIM30 plan R4; ADR-0322 §2/§10) — execution consumes the plan.
  ActualConsequences,
  UndeterminedOutcome,
  PlanDivergenceVerdict,
  PlanStaleRefusal,
  PredictionAbsence,
  ExecutionConsequence,
  ReadonlyStoreView,
  PlanningContext,
  ConsequencePlanner,
  ConfirmationRequirement,
  ConfirmationReason,
  ConfirmationPolicy,
  CommandActor,
  CommandOrigin,
  CommandApproval,
  CommandExecutionContext,
} from './consequence.js';
// G-REASON-04's normalize rule (ADR-0324 §3) — authored in R1, gated in R7.
export { normalizeForParity } from './parity.js';
export type {
  NormalizedEventRecord,
  NormalizedPatchEntry,
  NormalizedConsequence,
} from './parity.js';

export { CommandBus, CommandBusError } from './CommandBus.js';
// §UNDO-GESTURE-ID (C03 §4.6 U-10) — the identity `performUndo` groups on, so a
// dual-dispatch twin is recognised by WHAT PRODUCED IT rather than by how many
// milliseconds apart the two stacks were stamped. See ./gestureScope.ts.
export {
  newGestureId,
  currentGestureId,
  withGesture,
  withGestureId,
  __resetGestureScopeForTests,
} from './gestureScope.js';
export { produceCommand, produceWithPatchesPerStore, produceMultiStoreCommand } from './produceCommand.js';
export { PatchEmitter } from './PatchEmitter.js';
export type { EmitterListener } from './PatchEmitter.js';
export { createEventLogPersistor } from './EventLogPersistor.js';
export type { EventLogPersistorOptions } from './EventLogPersistor.js';
export { UndoStack } from './UndoStack.js';
// Sprint A31 — C03 §4.1: re-export so callers that pass `ringBuffer` to
// CommandBusOptions do not need a separate @pryzm/runtime-undo-stack import.
export { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
export {
  captureOne,
  captureMany,
  toJsonPointer,
  fromJsonPointer,
  patchSideToImmer,           // Sprint A33 — C03 §4.1: PatchSide → Immer Patch[] for applyPatches
  applyRingBufferSide,        // Sprint A34 — C03 §4.1: Phase D undo/redo store applicator
} from './PatchSnapshot.js';
export type { PatchApplicable, ApplyRingBufferOutcome } from './PatchSnapshot.js';
export {
  CascadeRunner,
  CascadeRunnerError,
  CascadeDepthExceededError,
  MAX_CASCADE_DEPTH,
  defaultExtractEntityId,
} from './cascade.js';
export type {
  CascadeRule,
  CascadeContext,
  CascadeCommand,
  CascadeOtelSpan,
  CascadeDispatchStats,
} from './cascade.js';

// wave-6-c-d1..d10: typed command registry (grows each wave-6-c-dN batch)
export type {
  EmptyPayload,
  CommandRegistry,
  PayloadOf,
  MainToolbarCommands,
  DrawingToolbarCommands,
  EditToolbarCommands,
  ViewToolbarCommands,
  LayerToolbarCommands,
  DimensionToolbarCommands,
  TextToolbarCommands,
  AnnotationToolbarCommands,
  RoomToolbarCommands,
  AreaToolbarCommands,
  ColorToolbarCommands,
  ScheduleToolbarCommands,
  SheetToolbarCommands,
  SectionToolbarCommands,
  PlanToolbarCommands,
  ElevationToolbarCommands,
  FamilyToolbarCommands,
  IfcInspectorToolbarCommands,
  IfcFilterToolbarCommands,
  SheetSetsToolbarCommands,
  PrintSetupToolbarCommands,
  CoordinationToolbarCommands,
  CDEToolbarCommands,
  ClashDetectionToolbarCommands,
  BCFToolbarCommands,
  AnalysisToolbarCommands,
  QuantityToolbarCommands,
  ModelManagementToolbarCommands,
  PluginManagerToolbarCommands,
  SettingsToolbarCommands,
  // §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — 3D drag-gizmo authoring verbs.
  TransformDragCommands,
} from './commands.js';
// §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — compile-time-checked dispatch helper.
export { dispatchTyped } from './commands.js';
