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
// `docs/architecture/adr/`.

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

export { CommandBus, CommandBusError } from './CommandBus.js';
export { produceCommand, produceWithPatchesPerStore } from './produceCommand.js';
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
export type { PatchApplicable } from './PatchSnapshot.js';
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
} from './commands.js';
