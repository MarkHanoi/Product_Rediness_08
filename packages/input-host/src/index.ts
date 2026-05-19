// @pryzm/input-host — PHASE-1A skeleton, Wave-8-D3 deliverable.
//
// Spec: `docs/03_PRYZM3/reference/phases/PHASE-1/1A-SKELETON-RAILS.md` —
// the renderer-track row "input-host package + composeRuntime slot".
//
// PURPOSE
// ─────────────────────────────────────────────────────────────────────────────
// The input-host owns the CANONICAL event source for every gesture
// PRYZM consumes:
//   • pointer (mouse / pen / touch — unified PointerEvent),
//   • wheel (zoom + pan-with-modifier),
//   • keyboard (down / up + the live modifier mask).
//
// Tools / panels / the renderer's picking pipeline subscribe through
// `runtime.inputHost.subscribe(channel, handler)` instead of attaching
// their own `addEventListener` calls to `window` / `canvas`.  This
// removes the Phase-0 problem where a panel's `keydown` handler
// would race with the renderer's first-person controller for the
// same key.
//
// PHASE-1A SCOPE (this package, today)
// ─────────────────────────────────────────────────────────────────────────────
// * `InputHost` — the runtime contract (interface).  Same structural
//   shape as `InputHostSlot` in `@pryzm/runtime-composer`.
// * `NullInputHost` — a no-op backend.  `subscribe()` records the
//   handler so the call shape is honest, but the host never emits
//   (no DOM listeners attached).  `getModifiers()` returns the
//   all-false mask.  Used by `composeRuntime` when no DOM is present
//   (test harness, headless mode) and as the default backend before
//   Phase 1B's DOM-listener pump lands.
// * `createNullInputHost()` — factory the composer calls.
//
// PHASE-1B SCOPE (next, NOT in this package yet)
// ─────────────────────────────────────────────────────────────────────────────
// * `DomInputHost` — backed by a single `addEventListener` per
//   channel on `canvas` (pointer/wheel) + `window` (keyboard).
//   Adopts a stable event-ordering contract so subscribers can
//   reason about ordering across channels.  Wired in Phase 1B.
//
// PURE: no DOM / no Node-only globals.  Safe to import from a Worker.

/** The four input channels surfaced by the host.  `'wheel'` is split
 *  from `'pointer'` because wheel events do not map onto the
 *  pointer-down/move/up lifecycle and tools subscribe to it
 *  separately (zoom-with-Ctrl, pan-with-Shift, etc.). */
export type InputChannel =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'wheel'
  | 'keydown'
  | 'keyup';

/** A 2D point in canvas pixel space (origin top-left). */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/** The live modifier mask at the time of the event.  Mirrors the
 *  DOM `KeyboardEvent.getModifierState` shape but flattened into a
 *  plain struct so handlers can destructure without an extra call. */
export interface ModifierMask {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/** A pointer event (down / up / move) in canvas-local coordinates. */
export interface InputPointerEvent {
  readonly channel: 'pointerdown' | 'pointerup' | 'pointermove';
  readonly point: CanvasPoint;
  readonly button: 0 | 1 | 2 | -1;
  readonly buttons: number;
  readonly modifiers: ModifierMask;
  readonly pointerType: 'mouse' | 'pen' | 'touch';
  readonly timestamp: number;
}

/** A wheel event — `deltaY` is normalized to "lines" (sign-only +1/-1)
 *  per the Phase-1A contract; Phase 1B's `DomInputHost` widens this
 *  to the raw deltaY in pixels along with deltaMode. */
export interface InputWheelEvent {
  readonly channel: 'wheel';
  readonly point: CanvasPoint;
  readonly deltaY: number;
  readonly modifiers: ModifierMask;
  readonly timestamp: number;
}

/** A keyboard event. */
export interface InputKeyEvent {
  readonly channel: 'keydown' | 'keyup';
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
  readonly modifiers: ModifierMask;
  readonly timestamp: number;
}

/** Discriminated union — handlers narrow on `channel`. */
export type InputEvent = InputPointerEvent | InputWheelEvent | InputKeyEvent;

/** Map from channel to its concrete event payload — used by the
 *  typed `subscribe<C>(channel, handler)` overload. */
export interface InputEventByChannel {
  pointerdown: InputPointerEvent;
  pointerup: InputPointerEvent;
  pointermove: InputPointerEvent;
  wheel: InputWheelEvent;
  keydown: InputKeyEvent;
  keyup: InputKeyEvent;
}

/** Disposer returned by `subscribe(...)`.  Idempotent. */
export interface InputDisposable {
  dispose(): void;
}

/** The host contract.  Structurally compatible with `InputHostSlot`
 *  in `@pryzm/runtime-composer/types`. */
export interface InputHost {
  /** True once the host has attached its DOM listeners.  Phase 1A
   *  `NullInputHost` always returns `false`; Phase 1B's `DomInputHost`
   *  flips to `true` after the first listener attach. */
  isReady(): boolean;

  /** The live modifier mask.  Phase 1A always returns the all-false
   *  mask (no DOM source); Phase 1B updates from the latest event. */
  getModifiers(): ModifierMask;

  /** Subscribe to a single channel.  The handler receives the typed
   *  event payload for that channel.  Returns a disposer.
   *
   *  Phase 1A records the subscriber but never fires (no DOM source). */
  subscribe<C extends InputChannel>(
    channel: C,
    handler: (event: InputEventByChannel[C]) => void,
  ): InputDisposable;

  /** Idempotent.  `composeRuntime`'s `tearDown()` calls this last. */
  dispose(): void;
}

/** Phase 1A no-op backend.  Records subscribers (so the call shape is
 *  honest + leak detectors can count attached listeners) but never
 *  emits.  `getModifiers()` returns the all-false mask. */
export class NullInputHost implements InputHost {
  private _disposed = false;
  /** Per-channel subscriber sets.  Recorded so leak detectors can
   *  count `subscriberCount()` from tests; the host never invokes them. */
  private readonly _subscribers: Map<InputChannel, Set<(ev: unknown) => void>> = new Map();

  isReady(): boolean {
    return false;
  }

  getModifiers(): ModifierMask {
    return ALL_FALSE_MODIFIERS;
  }

  subscribe<C extends InputChannel>(
    channel: C,
    handler: (event: InputEventByChannel[C]) => void,
  ): InputDisposable {
    if (this._disposed) {
      throw new Error('[input-host] subscribe() called on a disposed NullInputHost');
    }
    let set = this._subscribers.get(channel);
    if (set === undefined) {
      set = new Set();
      this._subscribers.set(channel, set);
    }
    const cast = handler as (ev: unknown) => void;
    set.add(cast);
    let disposed = false;
    return {
      dispose: (): void => {
        if (disposed) return;
        disposed = true;
        set?.delete(cast);
      },
    };
  }

  /** TEST-ONLY surface — count of recorded subscribers per channel.
   *  Phase 1B's `DomInputHost` exposes the same accessor for the
   *  leak-detector test that runs at every release tag.  Not part
   *  of the slot contract on `runtime.inputHost`. */
  subscriberCount(channel: InputChannel): number {
    return this._subscribers.get(channel)?.size ?? 0;
  }

  dispose(): void {
    this._disposed = true;
    this._subscribers.clear();
  }
}

/** Frozen all-false modifier mask reused by `getModifiers()` — keeps
 *  the GC quiet on the hot path. */
const ALL_FALSE_MODIFIERS: ModifierMask = Object.freeze({
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
});

/** Factory the composer calls.  Returns a fresh `NullInputHost` —
 *  cheap to allocate, no shared state with siblings. */
export function createNullInputHost(): InputHost {
  return new NullInputHost();
}

// ── D.4.4 bootstrap surface (Wave 3) ─────────────────────────────────────────
// The three files below own the TYPED CONTRACTS for the input-host
// bootstrap layer.  Engine-layer bodies live in
// `src/engine/subsystems/initTools.ts` (Phase F-1 extraction) and will
// relocate fully in Wave 4 once L7 dep factoring is complete.

export {
  bootstrapInput,
  bootstrapInputIdle,
  type InputBootstrapAudit,
  type InputBootstrapInput,
  type InputBootstrapResult,
} from './bootstrap.js';

export {
  bootstrapSelection,
  bootstrapSelectionIdle,
  type SelectionBootstrapAudit,
  type SelectionBootstrapInput,
  type SelectionBootstrapResult,
  type SelectionSlotShape,
  type SelectionId,
  type EngineSelectionBootstrapFn,
} from './SelectionBootstrap.js';

export {
  bootstrapToolBindings,
  createNullToolBindings,
  type ToolRegistration,
  type ToolBindingsTable,
  type ToolBindingsInput,
  type ToolBindingsResult,
  type ToolsSlotShape,
  type ToolId,
  type ToolKind,
  type ToolShortcut,
} from './ToolBindings.js';

// ── Sprint AH (2026-05-12) — tools/ → @pryzm/input-host ──────────────────────

export type { ITool, ToolName, ToolStateInfo, ToolContext } from './types.js';
export { ToolState, ToolEventEmitter } from './types.js';
export type { ToolDescriptor } from './ToolDescriptor.js';
export { toolRegistry } from './ToolRegistry.js';
export { BaseTool } from './BaseTool.js';
export { LevelPlaneConstraint } from './LevelPlaneConstraint.js';
export { SelectionManager } from './SelectionManager.js';
export { SelectionBoundsRegistry, buildDefaultSelectionBoundsRegistry } from './SelectionBoundsRegistry.js';
export type { HighlightResult, OBBResult, MeshResult, HighlightBuilderFn } from './SelectionBoundsRegistry.js';
export { MarqueeSelectionTool } from './MarqueeSelectionTool.js';
export { DetailViewTool } from './DetailViewTool.js';
export { WallEndpointController } from './WallEndpointController.js';
export { WallTransformController } from './WallTransformController.js';
export { HostedElementDragController } from './HostedElementDragController.js';
export { BeamTool } from './BeamTool.js';
export type { BeamTypeConfig } from './BeamTool.js';
export type { UnderlayOptions, UnderlayState } from './FloorPlanUnderlayTool.js';
export { FloorPlanUnderlayTool } from './FloorPlanUnderlayTool.js';
export { DxfUnderlayTool } from './DxfUnderlayTool.js';
export type { DxfOverlayState } from './DxfUnderlayTool.js';
export { SectionBoxTool } from './SectionBoxTool.js';
export type { UnderlayScaleMode, UnderlayScaleHUDCallbacks } from './UnderlayReferenceScaleTool.js';
export { UnderlayReferenceScaleTool } from './UnderlayReferenceScaleTool.js';
export { UnderlayReferenceRotateTool } from './UnderlayReferenceRotateTool.js';
export { ToolManager } from './ToolManager.js';
export type { ActiveTool } from './ToolManager.js';
export type { OpeningDrawingMode } from './OpeningTool.js';
export { OpeningTool } from './OpeningTool.js';

// gizmo
export { BlackGizmo } from './gizmo/BlackGizmo.js';
export { MirrorGizmo } from './gizmo/MirrorGizmo.js';
export { ScaleGizmo } from './gizmo/ScaleGizmo.js';

// operations
export {
  JoinTool,
  CutTool,
  MirrorTool,
  CopyPasteTool,
  ScaleTool,
  OffsetTool,
  ReferenceEditTool,
  OperationToolBase,
  canDo,
  availableOps,
  hasLinearOps,
} from './operations/index.js';
export type { OperationId, ActiveElementContext } from './operations/index.js';
