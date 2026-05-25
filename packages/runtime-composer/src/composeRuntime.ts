// composeRuntime — the single composition root for PRYZM 2.
//
// Spec: `docs/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`
//       §3.1 ("the single composition root") + §16.1 A.1/A.2 (S73 D2-D9).
//
// Phase C (S74-WIRE) — see `phases/audits/PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md`
// §16.3.  The persistence slot is now the real implementation built by
// `./buildPersistence.ts`; the `undoStack` slot wraps the legacy
// commandManager global (replaced in Phase D by an Immer reverse-apply
// backend driven by the EventLog).
//
// Construction order (per S72 §3.1):
//   1.  Async-batched data half — `bootstrapWithEverything()` builds the
//       L1 stores + L2 bus + plugin handlers + viewRegistry.  It yields
//       the main thread between every BOOT_BATCH_SIZE plugins (3) to
//       prevent a single > 50 ms LONGTASK (NFT-4, C10 §2).
//   2.  Synchronous platform-side singletons constructed with no
//       network calls — sync client, AI lazy loader, plugin host,
//       user preferences, event bus, toasts.
//   3.  Asynchronous persistence wireup — see ./buildPersistence.ts.
//       Cheap (the only awaited work is two lazy `import()`s).
//   4.  Asynchronous render half — when a `canvas` is supplied, the
//       renderer init is *kicked off* (not awaited) by the caller via
//       `composeRenderHalf()`.

import { trace, SpanStatusCode } from '@opentelemetry/api';

import type { AnyStores, CommandHandler } from '@pryzm/command-bus';
import {
  UndoStack,
  NullUndoStackBackend,
  LegacyCommandManagerAdapter,
  RingBufferUndoStack,
  type LegacyCommandManagerLike,
} from '@pryzm/runtime-undo-stack';
import { createEventLogPersistor, applyRingBufferSide, type PatchApplicable } from '@pryzm/command-bus';
import { bootstrapPhysicsIdle } from '@pryzm/physics-host';
import { bootstrapInputIdle } from '@pryzm/input-host';
import {
  bootstrapScene,
  bootstrapSceneIdle,
  type RenderEverythingBootstrapFn,
} from '@pryzm/renderer';
import type { SyncClient } from '@pryzm/sync-client';
import { LayoutOptionsStore, AiApprovalQueueStore } from '@pryzm/stores';

import { EventBus } from './EventBus.js';
import { wireCommandEventBridge } from './CommandEventBridge.js';
import { PluginHost } from './PluginHost.js';
import { UserPreferences } from './UserPreferences.js';
import { buildToastsSlot, type ShowAppToastFn } from './ToastController.js';
import { buildPersistenceSlot } from './buildPersistence.js';
import {
  buildIfcSlot,
  buildRhinoSlot,
  buildBcfSlot,
  buildPdfSlot,
} from './ImportExportSlots.js';
import {
  RuntimeNotWiredError,
  type Disposable,
  type HoverSlot,
  type PluginContribution,
  type ProjectContextSlot,
  type PryzmRuntime,
  type RuntimeAudit,
  type SceneSlot,
  type SelectionSlot,
  type ToolsSlot,
  type PersistenceSlot,
  type PersistenceClientLike,
  type PhysicsHostSlot,
  type InputHostSlot,
  type SyncSlot,
  type AiSlot,
  type AiCostSnapshot,
  type AiStreamChunk,
  type UndoStackSlot,
  type UndoStackState,
  type WorkspaceSlot,
  type WorkspaceSurfaceKind,
  type WorkspaceModeController,
  type CameraControllerSlot,
  type StoresSlot,
  type VisibilitySlot,
  type AuthSlot,
  type ShortcutsSlot,
  type ToastSlot,
  type DebugSlot,
  type DebugMetrics,
  type ExportSlot,
  type EntitlementsSlot,
  type CdeSlot,
  type GeospatialSlot,
  type PhysicsDevSlot,
  type PhysicsDevMetrics,
  type StructuralSlot,
  type SearchSlot,
} from './types.js';
import { buildViewRegistrySlot } from './buildViewRegistrySlot.js';
import { buildCameraControllerSlot } from './buildCameraControllerSlot.js';
import { buildWorkspaceModeController } from './workspace/WorkspaceModeController.js';
import { buildPickingSlot } from './buildPickingSlot.js';
import {
  buildWorkspaceSurface,
  type WorkspaceSurface,
} from '@pryzm/renderer-three';
import { installGlobalHandlers } from '@pryzm/crash-reporter';
import { evaluateVisibilityForManifest } from '@pryzm/visibility';

const COMPOSE_TRACER_NAME = 'pryzm.runtime-composer';

/** Minimal shape of the data-half bootstrap result used by composeRuntime.
 *  Defined locally so @pryzm/runtime-composer has no static dep on
 *  @pryzm/editor.  The full EverythingRuntime (in apps/editor) is a superset
 *  of this shape.  Progressive type-narrowing of the `any` slots is
 *  deferred to Wave 11 (constructor-injection sweep per C02 §1.3 P4). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface EditorBootstrapResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly bus: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly host: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly viewRegistry: any;
  tearDown(): void;
}

/** Callback type for the data-half bootstrap function.
 *  Production callers pass @pryzm/editor `bootstrapWithEverything`.
 *  Headless / bench harnesses may pass a lightweight stub. */
export type BootstrapEverythingFn = (
  opts: { readonly audit: RuntimeAudit },
) => Promise<EditorBootstrapResult>;

/** Caller-supplied options for `composeRuntime()`.  All slots are
 *  optional except `audit` and `bootstrapFn` — the bus stamps every
 *  command with audit metadata so it cannot be deferred, and the
 *  bootstrap function builds the data half before any slot is wired. */
export interface ComposeRuntimeOptions {
  /** Audit metadata — actorId / projectId / clientId.  Required: the
   *  L2 bus stamps every command with this triple per ADR-002. */
  readonly audit: RuntimeAudit;

  /** Optional renderer canvas.  When present, Phase A kicks off the
   *  asynchronous renderer init; otherwise the runtime returns with
   *  `scene.renderer === null` and panels that need pixels wait on
   *  the `'scene.ready'` event. */
  readonly canvas?: HTMLCanvasElement | null;

  /** Renderer mode forwarded to `bootstrapRenderEverything` — see
   *  ADR-007.  Defaults to `'webgl2'` in Phase A so headless / CSP
   *  contexts skip the WebGPU adapter probe (which logs scary
   *  warnings even when it falls back successfully). */
  readonly rendererMode?: 'auto' | 'webgpu' | 'webgl2';

  /** Optional escape hatch — tests / embedded harnesses may inject a
   *  stub toast helper.  In production this is omitted and
   *  `runtime.toasts` uses the package-owned DOM helper from
   *  `./showAppToast.ts` (Phase A.6 close, 2026-04-29). */
  readonly showAppToast?: ShowAppToastFn;

  /** Escape hatch — caller may pre-construct a persistence client
   *  (tests, embeds, special-purpose harnesses).  When omitted,
   *  `composeRuntime` constructs the default `ProjectListClient`
   *  + `MembersClient` from `@pryzm/persistence-client`. */
  readonly persistenceClient?: PersistenceClientLike;

  /** Phase A escape hatch — caller may pre-construct a sync client.
   *  When omitted, the slot stays `null` until Phase D wires it.
   *  Wave 4 Track A.6 (D.5.A.6, 2026-04-30): tightened from `unknown`
   *  to `SyncClient` per `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md
   *  §2 PR 4.A.6` — closes the matching `SyncSlot.client: unknown`. */
  readonly syncClient?: SyncClient;

  /** Escape hatch — caller may pre-construct an undo-stack backend.
   *  When omitted, `composeRuntime` wraps the legacy
   *  `(window as any).commandManager` if one exists, else a no-op
   *  backend (so `runtime.undoStack.canUndo()` is always safe to call). */
  readonly undoStackBackend?: ConstructorParameters<typeof UndoStack>[0];

  // D.4.2 Day-8: `workspaceMount?: workspace bridge (D.4)` removed per
  // `02-ARCHITECTURE.md §3` ("14 typed slots. No `workspace bridge (D.4)`.").
  // The browser composition root in `src/main.ts` now calls
  // `runtime.persistence.attachWorkspace(workspaceMount)` after this
  // function returns; tests / headless callers simply skip the call.

  /** F-launch.1 (S81 F.1.01) — boot-time plugin contributions assembled
   *  by the editor's `PluginRegistry.gatherAllContributions()`.  Each
   *  entry is appended into `runtime.plugins` before `composeRuntime`
   *  returns, so any panel that mounts during the first paint can read
   *  `runtime.plugins.contributions(kind)` and see the full set.
   *  Headless tests / benches that only need a subset of contributions
   *  pass them explicitly. */
  readonly pluginContributions?: readonly PluginContribution[];

  /** S04 (ADR-002, ADR-004) — server endpoint for audit trail persistence.
   *  When provided, a fire-and-forget `EventLogPersistor` subscriber is
   *  wired to `CommandBus.patches` and POSTs every EventRecord as JSON to
   *  this URL.  Omit in headless / test environments to skip HTTP traffic.
   *  Example: `'/api/event-log'`. */
  readonly eventLogEndpoint?: string;

  /** Optional headers forwarded by the EventLogPersistor on every POST
   *  (e.g. `{ Authorization: 'Bearer <token>' }`).  Only relevant when
   *  `eventLogEndpoint` is set. */
  readonly eventLogHeaders?: Record<string, string>;

  /** Data-half bootstrap function.  Constructs the L1 stores, L2 bus, and
   *  all plugin handlers.  Injected by the caller so @pryzm/runtime-composer
   *  has no static dep on @pryzm/editor (C02 §5 headless constraint, C-6).
   *  Production: pass `bootstrapWithEverything` from @pryzm/editor.
   *  Headless / bench: pass a minimal stub. */
  readonly bootstrapFn: BootstrapEverythingFn;
}

/** The composed runtime + the renderer-init promise.  The caller
 *  awaits `runtime.scene.ready` (an internal promise resolved on the
 *  'scene.ready' event) when it needs pixels; otherwise `runtime` is
 *  immediately usable for data-half work (stores / bus / plugins). */
export interface ComposedRuntime extends PryzmRuntime {
  /** Resolves once the renderer + canvas + scene-reconciler are
   *  fully wired (or once the renderer-init failed soft).  Awaiting
   *  this is optional — code that doesn't need pixels can ignore it. */
  readonly sceneReady: Promise<void>;
}

// ---------------------------------------------------------------------------
//                        Phase A stub builders
// ---------------------------------------------------------------------------

function buildSelectionStub(events: EventBus): SelectionSlot {
  let ids: readonly string[] = Object.freeze([]);
  const subs = new Set<(ids: readonly string[]) => void>();
  const notify = (): void => {
    for (const s of subs) {
      try {
        s(ids);
      } catch (err) {
        console.error('[runtime-composer/selection] subscriber threw:', err);
      }
    }
    // Phase C — broadcast on the typed RuntimeEvents bus too so panels
    // that subscribe via `runtime.events.on('selection.changed', …)` see
    // the same fan-out.
    try { events.emit('selection.changed', { ids }); }
    catch (err) { console.error('[runtime-composer/selection] events emit threw:', err); }
  };
  return {
    get ids() { return ids; },
    add(id) {
      if (ids.includes(id)) return;
      ids = Object.freeze([...ids, id]);
      notify();
    },
    remove(id) {
      if (!ids.includes(id)) return;
      ids = Object.freeze(ids.filter((x) => x !== id));
      notify();
    },
    clear() {
      if (ids.length === 0) return;
      ids = Object.freeze([]);
      notify();
    },
    set(next) {
      ids = Object.freeze([...next]);
      notify();
    },
    subscribe(listener) {
      subs.add(listener);
      return { dispose: (): void => void subs.delete(listener) };
    },
  };
}

function buildHoverStub(): HoverSlot {
  let id: string | null = null;
  const subs = new Set<(id: string | null) => void>();
  return {
    get id() { return id; },
    set(next) {
      if (id === next) return;
      id = next;
      for (const s of subs) {
        try { s(id); }
        catch (err) { console.error('[runtime-composer/hover] subscriber threw:', err); }
      }
    },
    subscribe(listener) {
      subs.add(listener);
      return { dispose: (): void => void subs.delete(listener) };
    },
  };
}

interface ProjectCtxState {
  projectId: string | null;
  projectName: string | null;
  levelId: string | null;
}

function buildProjectContextStub(initialAudit: RuntimeAudit): ProjectContextSlot {
  let ctx: ProjectCtxState = {
    projectId: initialAudit.projectId.length > 0 ? initialAudit.projectId : null,
    projectName: null,
    levelId: null,
  };
  const subs = new Set<(c: ProjectCtxState) => void>();
  const notify = (): void => {
    const snap = { ...ctx };
    for (const s of subs) {
      try { s(snap); }
      catch (err) { console.error('[runtime-composer/projectContext] subscriber threw:', err); }
    }
  };
  return {
    get projectId() { return ctx.projectId; },
    get projectName() { return ctx.projectName; },
    get levelId() { return ctx.levelId; },
    set(next) {
      ctx = { projectId: next.projectId, projectName: next.projectName, levelId: ctx.levelId };
      // Mutate the audit triple in place so every L2 command stamped
      // *after* this set() carries the right projectId.  The audit
      // object is a shared reference — bus + composer + persistence
      // all hold the same instance.
      (initialAudit as { projectId: string }).projectId = next.projectId;
      notify();
    },
    setLevelId(id) {
      ctx = { ...ctx, levelId: id };
      notify();
    },
    clear() {
      ctx = { projectId: null, projectName: null, levelId: null };
      (initialAudit as { projectId: string }).projectId = '';
      notify();
    },
    subscribe(listener) {
      subs.add(listener);
      return { dispose: (): void => void subs.delete(listener) };
    },
  };
}

function buildToolsStub(): ToolsSlot {
  let activeToolId: string | null = null;
  const subs       = new Set<(id: string | null) => void>();
  // Phase E (S78-WIRE) — real tool activators registered by Layout.ts after
  // service + toolManager are ready.  Closures read (window as any).xxxTool
  // at call-time so they work even when the engine boots lazily.
  const activators = new Map<string, (mode?: string) => void>();

  const notify = (): void => {
    for (const s of subs) {
      try { s(activeToolId); }
      catch (err) { console.error('[runtime-composer/tools] subscriber threw:', err); }
    }
  };
  return {
    get activeToolId() { return activeToolId; },

    // ── Phase E ─────────────────────────────────────────────────────────────
    register(family, activator) {
      activators.set(family, activator);
    },

    activate(id, mode?) {
      // Call the registered real activator (if any) before state tracking.
      const fn = activators.get(id);
      if (fn) {
        try { fn(mode); }
        catch (err) { console.error('[runtime-composer/tools] activator threw for', id, ':', err); }
      }
      if (activeToolId === id) return;
      activeToolId = id;
      notify();
    },

    deactivate() {
      if (activeToolId === null) return;
      activeToolId = null;
      notify();
    },
    subscribe(listener) {
      subs.add(listener);
      return { dispose: (): void => void subs.delete(listener) };
    },
  };
}

// `buildPickingSlot` (PR 4.A.5) has replaced the old `buildPickingStub` here.
// See `./buildPickingSlot.ts` for the thunk-backed implementation.

// ── D.9-prep — workspace slot stub (platform surface: landing/hub/workspace) ─
//
// `buildWorkspaceStub` wires a `WorkspaceSlot` whose initial surface is
// `'landing'` (matches the legacy PlatformShell default) and broadcasts
// changes through both the per-slot subscriber list and the typed
// `'workspace.surfaceChanged'` event on `runtime.events`.
//
// Wave 4 Track A (PR 4.A.3 / 4.A.4): the old `'workspace.modeChanged'`
// cast has been replaced with the typed `events.emit('workspace.surfaceChanged')`
// now that `RuntimeEvents` registers that topic with the correct payload.
// The render-mode event `'workspace.modeChanged'` belongs exclusively to
// `runtime.workspaceMode` (`buildWorkspaceModeController`).
function buildWorkspaceStub(events: EventBus, surface: WorkspaceSurface): WorkspaceSlot {
  let mode: WorkspaceSurfaceKind = 'landing';
  const subs = new Set<(m: WorkspaceSurfaceKind) => void>();

  // Shared mutator used by both `setMode` (sync) and `show` (async)
  // so the fan-out + event emission stay identical across both
  // entry points.  Returns true when the mode actually changed.
  const applyMode = (next: WorkspaceSurfaceKind): boolean => {
    if (mode === next) return false;
    mode = next;
    for (const s of subs) {
      try { s(mode); }
      catch (err) { console.error('[runtime-composer/workspace] subscriber threw:', err); }
    }
    // Typed emit — `'workspace.surfaceChanged'` is a member of
    // `RuntimeEvents` (PR 4.A.3).  No `as` cast.
    try { events.emit('workspace.surfaceChanged', { mode }); }
    catch (err) { console.error('[runtime-composer/workspace] events emit threw:', err); }
    return true;
  };

  // ── D.12-prep — `show()` async mount-aware sibling of `setMode()` ─────
  // Today the stub resolves immediately after mirroring `setMode()` +
  // emitting an additional `'workspace.show'` event so the D.12 proper
  // milestone can hook mount-completion telemetry without a contract
  // change.  Real PlatformShell mount/unmount sequencing lands in
  // D.12 proper (gated on D.4).
  let showWarned = false;
  const warnShowOnce = (): void => {
    if (showWarned) return;
    showWarned = true;
    console.warn(
      '[runtime-composer/workspace] D.12-prep stub: show() called before ' +
      'D.12 wires the real PlatformShell mount/unmount sequence. ' +
      'Resolves immediately after mode mutation; no DOM mount/unmount work yet.',
    );
  };

  return {
    get mode() { return mode; },
    setMode(next) { applyMode(next); },
    async show(next) {
      warnShowOnce();
      applyMode(next);
      // Pre-resolve — D.12 proper replaces this with `await mountSurface(next)`.
      return Promise.resolve();
    },
    subscribe(listener) {
      subs.add(listener);
      return { dispose: (): void => void subs.delete(listener) };
    },
    // PR 4.A.4 — typed mount/dispose handle for the workspace surface.
    // Created by `buildWorkspaceSurface()` before the stub is built so
    // boot code can call `runtime.workspace.surface.mount(platformShell)`
    // immediately after `composeRuntime()` resolves.
    surface,
  };
}

// ── Wave 4 Track A — slot adapters extracted to dedicated modules ──────────
//
// PR 4.A.1: `buildViewRegistrySlot`  → `./buildViewRegistrySlot.ts`
// PR 4.A.2: `buildCameraControllerSlot` → `./buildCameraControllerSlot.ts`
// PR 4.A.3: `buildWorkspaceModeController` → `./workspace/WorkspaceModeController.ts`
//
// Each adapter lives in its own file so it can be unit-tested in
// isolation (see `__tests__/viewRegistry.slot.test.ts`, etc.) and the
// inline stubs that lived here have been replaced.  The imports are at
// the top of this file.  See individual builder files for design notes.

function buildSyncSlot(client: SyncClient | null): SyncSlot {
  // D.5.A.6 (2026-04-30): `client` typed as `SyncClient | null` — matches
  // `SyncSlot.client: SyncClient | null` in types.ts.  `presence` stays
  // `null` until C.5.x lights up the multiplayer cursor wireup; the
  // typed-null surface lets panels declare `runtime.sync.presence?.user`
  // accessors today without a defensive `as PryzmAwareness` cast.
  // Wave A19-T5: `status` field added to SyncSlot — defaults to
  // 'disconnected' until the SyncClient connects.  Set to 'CONFLICTED'
  // by CRDTConflictResolver when auto-merge fails (C08 §3.2 / P8).
  return { client, presence: null, status: 'disconnected' };
}

// Wave 19 Phase 3A — visibility wave-chain evaluator slot.
// Wraps `evaluateVisibilityForManifest` from `@pryzm/visibility` so UI panels
// consume it via `runtime.visibility.evaluate(...)` rather than importing the
// package directly (L5 → L7.5 layer boundary per ADR-0031).
function buildVisibilitySlot(): VisibilitySlot {
  return { evaluate: evaluateVisibilityForManifest };
}

// ── Phase F first cut — AI slot promotion (S81-WIRE F.7.x) ─────────────────
//
// Phase A returned only `{ getHost, isLoaded }`.  Phase F adds the relay
// surface that AIPanel/AIChat/AISidebar consume directly:
//   • model / setModel — switching the active Anthropic model
//   • cost.snapshot() / cost.subscribe() — cumulative spend tracker
//   • streamCompletion(prompt, ctx, onChunk) — relay invocation
//
// The relay invocation itself throws RuntimeNotWiredError until F.7.4
// promotes the panel rewrites; the cost tracker carries a zeroed
// snapshot so the status pill can render today and Phase F.7.4 just
// fills it in without a contract change.
const DEFAULT_AI_MODEL = 'claude-haiku-4-5';

function buildAiSlot(
  approvalQueue: AiApprovalQueueStore,
  layoutOptions: LayoutOptionsStore,
): AiSlot {
  let loaded = false;
  let cached: unknown | null = null;
  let activeModel: string = DEFAULT_AI_MODEL;
  let costSnap: AiCostSnapshot = Object.freeze({
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
    perModel: Object.freeze({}),
  });
  const costSubs = new Set<(snap: AiCostSnapshot) => void>();

  return {
    // ── Phase A surface (kept) ─────────────────────────────────────────
    async getHost() {
      if (cached !== null) return cached;
      const mod = await import('@pryzm/ai-host');
      // #51 A5.3 — pass the approval queue so createAiHost constructs the
      // in-process AiPlane (workflows register on `host.plane`). Without a
      // queue the host has no plane and submit() only POSTs to the worker.
      cached = await mod.getAiHost({ approvalQueue });
      loaded = true;
      return cached;
    },
    isLoaded() { return loaded; },

    // ── #51 Apartment Layout stores (A5.3) ─────────────────────────────
    layoutOptions,
    approvalQueue,

    // ── Phase F.7 surface (new) ────────────────────────────────────────
    get model() { return activeModel; },
    setModel(model: string): void {
      if (typeof model !== 'string' || model.length === 0) {
        throw new TypeError('[runtime/ai] setModel: model id must be a non-empty string');
      }
      activeModel = model;
    },
    cost: {
      snapshot(): AiCostSnapshot { return costSnap; },
      subscribe(listener): Disposable {
        costSubs.add(listener);
        // Synchronous initial fan-out per the @pryzm/ai-host CostMeter
        // contract (S49 D6).  Lets the status pill render the current
        // snapshot without waiting for the next relay call.
        try { listener(costSnap); }
        catch (err) { console.error('[runtime/ai/cost] subscriber threw:', err); }
        return { dispose: (): void => void costSubs.delete(listener) };
      },
    },
    async streamCompletion(
      _prompt: string,
      _ctx: { projectId: string | null; selectionIds: readonly string[] },
      _onChunk: (chunk: AiStreamChunk) => void,
    ): Promise<{ text: string; costUsd: number }> {
      // Touch the closure variables so noUnusedLocals doesn't flag the
      // cost-tracker shape — Phase F.7.4 fills these in via the
      // AnthropicRelay's per-call cost computation.
      void costSnap; void costSubs; void activeModel;
      void _prompt; void _ctx; void _onChunk;
      throw new RuntimeNotWiredError(
        'ai.streamCompletion',
        'F.7.4 (S81-WIRE)',
      );
    },
  };
}

/** Build the undoStack slot.  Phase C wraps the legacy
 *  `(window as any).commandManager` global if one exists at compose
 *  time; otherwise a no-op backend keeps the slot safe to call.
 *  Phase D replaces this with the real Immer reverse-apply backend. */
function buildUndoStackSlot(
  override: ConstructorParameters<typeof UndoStack>[0] | undefined,
): UndoStackSlot {
  if (override !== undefined) {
    const stack = new UndoStack(override);
    return adapt(stack);
  }
  // Probe for the legacy commandManager — Phase C migration window.
  let backend: ConstructorParameters<typeof UndoStack>[0] = new NullUndoStackBackend();
  try {
    if (typeof window !== 'undefined') {
      const w = window as Window & typeof globalThis & { commandManager?: LegacyCommandManagerLike };
      if (w.commandManager) {
        backend = new LegacyCommandManagerAdapter(w.commandManager);
      }
    }
  } catch (err) {
    console.warn('[runtime-composer/undoStack] commandManager probe threw — using NullUndoStackBackend:', err);
  }
  return adapt(new UndoStack(backend));

  function adapt(stack: UndoStack): UndoStackSlot {
    return {
      canUndo: () => stack.canUndo(),
      canRedo: () => stack.canRedo(),
      undo:    () => stack.undo(),
      redo:    () => stack.redo(),
      subscribe: (listener) => stack.subscribe(listener),
    };
  }
}

// ---------------------------------------------------------------------------
//  Phase D undo/redo slot (Sprint A35 — C03 §4.1)
// ---------------------------------------------------------------------------

/**
 * Build an `UndoStackSlot` that wires `RingBufferUndoStack.undoPatch()` /
 * `redoPatch()` together with `applyRingBufferSide()` so that Ctrl-Z actually
 * applies inverse patches to L1 stores instead of only moving the undo cursor.
 *
 * `bus.fetchStores(affectedStores)` supplies the live store instances — the
 * same objects every handler's `ctx.stores` uses — so patches apply to the
 * authoritative data.  Stores absent from the provider are silently skipped.
 *
 * CONTRACT (C03 §4.1): undo and redo MUST NOT throw; empty or absent
 * `affectedStores` → no-op patch application (cursor still moves).
 *
 * Called from `composeRuntime` when no `opts.undoStackBackend` override is
 * supplied (normal production path).  Tests / legacy bridge supply an explicit
 * override and use `buildUndoStackSlot` instead (Phase C cursor-only path).
 */
function buildPhaseDUndoStackSlot(
  ringBuffer: RingBufferUndoStack,
  bus: { fetchStores(ids: readonly string[]): AnyStores },
): UndoStackSlot {
  return {
    canUndo: () => ringBuffer.canUndo(),
    canRedo: () => ringBuffer.canRedo(),

    undo: () => {
      // Snapshot affectedStores BEFORE the cursor moves — undoPatch() is atomic.
      const pair = ringBuffer.current();
      const side = ringBuffer.undoPatch(); // cursor-- + return inverse PatchSide
      if (side && pair?.affectedStores?.length) {
        const ids = pair.affectedStores as readonly string[];
        const storeMap = bus.fetchStores(ids) as Record<string, PatchApplicable | undefined>;
        applyRingBufferSide(side, ids, storeMap);
        console.debug(
          '[composeRuntime] A35 Phase D undo — %d op(s) on [%s]',
          side.ops.length,
          ids.join(', '),
        );
      }
    },

    redo: () => {
      // peek() returns the entry ABOUT to be re-applied; redoPatch() is atomic.
      const pair = ringBuffer.peek();
      const side = ringBuffer.redoPatch(); // cursor++ + return forward PatchSide
      if (side && pair?.affectedStores?.length) {
        const ids = pair.affectedStores as readonly string[];
        const storeMap = bus.fetchStores(ids) as Record<string, PatchApplicable | undefined>;
        applyRingBufferSide(side, ids, storeMap);
        console.debug(
          '[composeRuntime] A35 Phase D redo — %d op(s) on [%s]',
          side.ops.length,
          ids.join(', '),
        );
      }
    },

    subscribe: (listener) => {
      // RingBufferUndoStack fires `() => void`; adapt to UndoStackSlot's
      // `(state: UndoStackState) => void` by computing the state snapshot on
      // each notification.  Safe: ringBuffer.undoCount() / redoCount() are
      // pure reads and never throw.
      return ringBuffer.subscribe(() => {
        const state: UndoStackState = {
          canUndo:   ringBuffer.canUndo(),
          canRedo:   ringBuffer.canRedo(),
          undoCount: ringBuffer.undoCount(),
          redoCount: ringBuffer.redoCount(),
        };
        listener(state);
      });
    },
  };
}

// ---------------------------------------------------------------------------
//                          The composer itself
// ---------------------------------------------------------------------------

/** Construct the composed `PryzmRuntime`.  Phase A entry point per
 *  S72 §16.1 A.1 (`src/main.ts` runs `await composeRuntime({...})`). */
export async function composeRuntime(opts: ComposeRuntimeOptions): Promise<ComposedRuntime> {
  const tracer = trace.getTracer(COMPOSE_TRACER_NAME);
  const span = tracer.startSpan('pryzm.runtime.compose');
  const startMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  try {
    // ── 1. Cross-cutting singletons (no I/O) ──────────────────────────────
    const events = new EventBus();
    const userPreferences = new UserPreferences();
    // #51 A5.3 — AI workflow stores. `aiApprovalQueue` is passed to
    // `getAiHost({ approvalQueue })` so the in-process AiPlane is constructed
    // (workflows register on it); `layoutOptions` is the AIStore the
    // apartment-layout workflow persists scored options into. Both are exposed
    // on `runtime.ai` so the editor's post-compose registration + the §11 modal
    // reach them without a global. No I/O — pure in-memory stores.
    const aiApprovalQueue = new AiApprovalQueueStore();
    const layoutOptions = new LayoutOptionsStore();
    // F-launch.1 (S81 F.1.01) — boot-time contributions land in the
    // PluginHost via the constructor.  When `pluginContributions` is
    // omitted, the host keeps its empty registry and `register()` calls
    // (or no calls at all) populate it lazily.
    const plugins = new PluginHost(opts.pluginContributions ?? []);
    // Phase A.6 close — `buildToastsSlot()` defaults to the
    // package-owned `showAppToast` from `./showAppToast.ts`.  The
    // `opts.showAppToast` escape hatch remains for tests.
    const toasts = buildToastsSlot(opts.showAppToast ?? null);
    // Wave 19 (Phase 3D) — install crash-reporter global handlers at boot.
    // Idempotent; funnels window.onerror + unhandledrejection into the lazy
    // reporter.  @pryzm/crash-reporter defaults to NoopCrashReporter until a
    // real backend is wired (Phase F.x / OtelLinkedReporter).
    installGlobalHandlers();

    // ── 2. Data half — async-batched L1 stores + L2 bus + all plugins ─────
    // `bootstrapWithEverything` is async: it yields the main thread between
    // every BOOT_BATCH_SIZE plugins in both the stores and handlers passes
    // to prevent a single > 50 ms LONGTASK (observed: 65 ms warm, 238 ms
    // cold on a cold Replit container). Each batch targets < 16 ms per
    // NFT-4. `performance.mark` fences (pryzm:bootstrap:*) are emitted for
    // DevTools Performance panel visibility. See NFT-4, C10 §2, and
    // `docs/03_PRYZM3/03-CURRENT-STATE.md §10 2026-05-03g`.
    performance.mark('pryzm:composeRuntime:bootstrap:start');
    const inner = await opts.bootstrapFn({ audit: opts.audit });
    performance.mark('pryzm:composeRuntime:bootstrap:end');
    performance.measure(
      'pryzm:composeRuntime:bootstrap',
      'pryzm:composeRuntime:bootstrap:start',
      'pryzm:composeRuntime:bootstrap:end',
    );

    // ── S03: CommandEventBridge — wire CommandBus.patches → runtime.events ─
    // Every successful CommandBus dispatch emits 'command.executed' on the
    // typed event bus.  Replaces ad-hoc window.dispatchEvent(CustomEvent)
    // calls in the migration bridge layer (Phase E.5.x).
    // Spec: docs/03_PRYZM3/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §3
    const disposeCommandBridge = wireCommandEventBridge(inner.bus.patches, events);

    // ── A31: RingBufferUndoStack — Phase D real undo backend ───────────────
    // Creates a RingBufferUndoStack (default cap: 200) and attaches it
    // directly to CommandBus via `inner.bus.setRingBuffer(ringBuffer)`.
    // Sprint A31 swapped from patches.subscribe() → direct setRingBuffer()
    // so the push happens synchronously inside CommandBus.executeCommand()
    // after the EventRecord is built — no indirection via PatchEmitter.
    // CONTRACT: C03 §4.1 / C03 §4.2 — ring buffer cap configurable (default 200);
    //   every `source: 'user'` dispatch pushes a PatchPair (forward+inverse).
    // Spec: docs/03_PRYZM3/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §0 A31
    const ringBuffer = new RingBufferUndoStack({ maxSize: 200 });
    inner.bus.setRingBuffer(ringBuffer);
    // disposeRingBuffer is a no-op — ring buffer lifetime is tied to inner.bus.
    const disposeRingBuffer = (): void => { /* A31: ring buffer attached directly to bus */ };

    // ── S04: EventLogPersistor — fire-and-forget audit trail ──────────────
    // When opts.eventLogEndpoint is provided, every EventRecord emitted by
    // CommandBus.patches is POSTed to the server for event_log persistence.
    // Omit in headless / test environments — no HTTP traffic is generated.
    // CONTRACT: C03 §4, ADR-002, ADR-004 — non-blocking; errors swallowed.
    const disposeEventLog = opts.eventLogEndpoint
      ? inner.bus.patches.subscribe(
          createEventLogPersistor({
            endpoint: opts.eventLogEndpoint,
            ...(opts.eventLogHeaders !== undefined ? { headers: opts.eventLogHeaders } : {}),
          }),
        )
      : (): void => { /* no-op — eventLogEndpoint not set */ };

    // ── 3. Project context / selection / hover / tools / picking / ai ─────
    //
    // projectContext is built BEFORE persistence because buildPersistenceSlot
    // calls `projectContext.set(...)` from inside `openProject()`.
    const selection = buildSelectionStub(events);
    const hover = buildHoverStub();
    const projectContext = buildProjectContextStub(opts.audit);
    const tools = buildToolsStub();
    // `picking` is wired in §4c (PR 4.A.5) via `buildPickingSlot(() => null)`.
    // D.4.3 (S80-WIRE) — physics-host slot.  `bootstrapPhysicsIdle()`
    // owns the typed contract + soft-fail semantics declared in
    // `@pryzm/physics-host/src/bootstrap.ts`; the idle path returns a
    // `NullPhysicsHost` shell without a span (no boundary crossing to
    // trace).  Phase 1D swaps in the WASM-BVH backend by passing a
    // `loadEnginePhysics` callback to `bootstrapPhysics()` instead.
    // Engine-layer RAF queue lives in `src/physics/PhysicsEngine.ts`;
    // see pointer comment there for relocation status.
    const physicsHost: PhysicsHostSlot = bootstrapPhysicsIdle().physicsHost;
    // D.4.4 Wave-3: input-host slot wired through typed bootstrap surface.
    // `bootstrapInputIdle()` returns the Null backend (no DOM listeners);
    // Phase 1B's `DomInputHost` lands by passing `loadEngineInput` to
    // `bootstrapInput()`.  Body: `@pryzm/input-host/src/bootstrap.ts`.
    const inputHost: InputHostSlot = bootstrapInputIdle().inputHost;
    const ai = buildAiSlot(aiApprovalQueue, layoutOptions);

    // ── 4. Persistence + sync + undoStack ─────────────────────────────────
    // D.4.2 Day-8: `workspaceMount` no longer flows through here.  The
    // browser composition root attaches a bridge post-compose via
    // `runtime.persistence.attachWorkspace(...)`; tests / headless skip it.
    const persistence: PersistenceSlot = await buildPersistenceSlot({
      audit: opts.audit,
      events,
      projectContext,
      client: opts.persistenceClient,
    });
    const sync = buildSyncSlot(opts.syncClient ?? null);
    // Sprint A35 — Phase D Ctrl-Z wiring (C03 §4.1).
    // Default path: `buildPhaseDUndoStackSlot` wires undoPatch/redoPatch +
    // applyRingBufferSide so Ctrl-Z applies inverse patches to L1 stores.
    // Override path (test harness / legacy bridge): Phase C cursor-only slot.
    const undoStack: UndoStackSlot =
      opts.undoStackBackend !== undefined
        ? buildUndoStackSlot(opts.undoStackBackend)
        : buildPhaseDUndoStackSlot(ringBuffer, inner.bus);

    // ── 4c. D.9-prep — workspace slot + Wave 4 Track A new slots ──────────
    //
    // `workspace`     — platform surface stub (landing/hub/workspace).
    //                   PR 4.A.4: includes a `WorkspaceSurface` typed
    //                   mount/dispose handle at `workspace.surface`.
    // `workspaceMode` — PR 4.A.3: render/view mode controller (3d/plan/section).
    // `cameraController` — PR 4.A.2: typed slot backed by a `() => null` thunk
    //   today (D.10-prep); D.10 proper replaces the thunk with
    //   `() => sceneCurrent.camera ?? null` once SceneSlot exposes the live
    //   `CameraController`.  The adapter warns-once on `set()`/`snapshot()`
    //   while the thunk returns null, matching the old no-op stub behavior.
    // `picking`       — PR 4.A.5: backed by `buildPickingSlot(() => null)` —
    //   the `() => null` thunk is D.6-prep posture; D.6 proper replaces it
    //   with a real `PickStrategyResolver`-backed delegate after scene mount.
    const workspaceSurface = buildWorkspaceSurface();
    const workspace = buildWorkspaceStub(events, workspaceSurface);
    // Wave 7 (2026-05-01): wire typed WorkspaceSurface into the persistence slot.
    // openProject() now calls surface.setProjectContext() directly instead of routing
    // through the deleted workspace bridge (D.4).
    persistence.attachWorkspaceSurface(workspaceSurface);
    const workspaceMode: WorkspaceModeController = buildWorkspaceModeController(events);
    const cameraController: CameraControllerSlot = buildCameraControllerSlot(() => null, events);
    const picking = buildPickingSlot(() => null);

    // ── 4d. PR 4.A.1 — viewRegistry slot (Wave 4 Track A) ─────────────────
    // `buildViewRegistrySlot` wraps `inner.viewRegistry` (a
    // `ViewRegistry extends Store<ViewDefinition>` from `@pryzm/view-state`)
    // in the typed `ViewRegistrySlot` surface.  The `@pryzm/view-state` dep
    // is already in this package's `dependencies`; no new dep edge.
    // See `./buildViewRegistrySlot.ts` + `__tests__/viewRegistry.slot.test.ts`.
    const viewRegistry = buildViewRegistrySlot(inner.viewRegistry, events);

    // ── 4b. Phase F first cut (S81 F.12) — IFC/Rhino/BCF/PDF facades ──────
    // All four slots are constructed synchronously; the underlying
    // plugin packages are lazy-loaded on first call so the IFC schemas
    // / rhino3dm wasm / BCF zip parser stay off the editor's
    // first-paint chunk.  See ./ImportExportSlots.ts.
    const ifc   = buildIfcSlot();
    const rhino = buildRhinoSlot();
    const bcf   = buildBcfSlot();
    const pdf   = buildPdfSlot();

    // ── 4c. Wave 14 slots 19-29 — F-phase stub builders ─────────────────
    const auth: AuthSlot = {
      currentUser: null,
      async signIn(): Promise<void> {
        throw new RuntimeNotWiredError('auth.signIn', 'F.6.1 — Phase C.auth');
      },
      async signUp(): Promise<void> {
        throw new RuntimeNotWiredError('auth.signUp', 'F.6.1 — Phase C.auth');
      },
      async signOut(): Promise<void> {
        throw new RuntimeNotWiredError('auth.signOut', 'F.6.1 — Phase C.auth');
      },
    };
    const shortcuts: ShortcutsSlot = {
      dispatch(_key: string): void { /* Phase F stub — no-op */ },
      register(_key: string, _handler: () => void): { dispose(): void } {
        return { dispose(): void { /* no-op */ } };
      },
    };
    const _zeroDebug: DebugMetrics = { fps: 0, drawCalls: 0, triangles: 0, memMB: 0 };
    const debug: DebugSlot = {
      metrics: () => _zeroDebug,
      subscribe(listener: (m: DebugMetrics) => void): { dispose(): void } {
        listener(_zeroDebug);
        return { dispose(): void { /* no-op */ } };
      },
    };
    const exportSlot: ExportSlot = {
      async ifc(): Promise<Uint8Array> { throw new RuntimeNotWiredError('export.ifc', 'F.10.2'); },
      async glb(): Promise<Uint8Array> { throw new RuntimeNotWiredError('export.glb', 'F.10.2'); },
      async pdf(): Promise<Uint8Array> { throw new RuntimeNotWiredError('export.pdf', 'F.10.2'); },
      async csv(): Promise<Uint8Array> { throw new RuntimeNotWiredError('export.csv', 'F.10.2'); },
      async panorama(): Promise<Uint8Array> { throw new RuntimeNotWiredError('export.panorama', 'F.10.2'); },
    };
    const _openFeatures = new Set(['*']);
    const entitlements: EntitlementsSlot = {
      check(_feature: string): boolean { return true; },
      subscribe(listener: (f: ReadonlySet<string>) => void): { dispose(): void } {
        listener(_openFeatures);
        return { dispose(): void { /* no-op */ } };
      },
    };
    const cde: CdeSlot = {
      structuredName(rawId: string): string { return rawId; },
      isConnected(): boolean { return false; },
    };
    const geospatial: GeospatialSlot = {
      project(): { x: number; y: number; z: number } {
        throw new RuntimeNotWiredError('geospatial.project', 'F.11.4');
      },
      unproject(): { lat: number; lng: number; alt: number } {
        throw new RuntimeNotWiredError('geospatial.unproject', 'F.11.4');
      },
      isConfigured(): boolean { return false; },
    };
    const _zeroPhysics: PhysicsDevMetrics = { rigidBodies: 0, contacts: 0, ms: 0 };
    const physicsDevSlot: PhysicsDevSlot = {
      metrics: () => _zeroPhysics,
      subscribe(listener: (m: PhysicsDevMetrics) => void): { dispose(): void } {
        listener(_zeroPhysics);
        return { dispose(): void { /* no-op */ } };
      },
    };
    const structural: StructuralSlot = {
      loadPaths(): ReadonlyArray<{ id: string; forces: readonly number[] }> { return []; },
      subscribe(listener: (p: ReadonlyArray<{ id: string; forces: readonly number[] }>) => void): { dispose(): void } {
        listener([]);
        return { dispose(): void { /* no-op */ } };
      },
    };
    const search: SearchSlot = {
      async run(): Promise<ReadonlyArray<{ id: string; type: string; label: string }>> {
        return [];
      },
    };

    // ── 5. Render half — kicked off async if a canvas was supplied ────────
    // D.4.1 (S79-WIRE, Option A): the inline lazy-import block previously
    // owned the typed contract + soft-fail semantics for the scene half.
    // That ownership has moved to `bootstrapScene()` in `@pryzm/renderer`
    // (the L5 home declared by `04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md
    // §3` STATUS-UPDATE Option A).  composeRuntime now DELEGATES to it
    // and supplies the lazy `loadRenderEverything` callback so neither
    // file takes a static dependency on @pryzm/editor.
    //
    // Behaviour preserved exactly:
    //   * Idle path (no canvas) — slot stays renderer-null, sceneReady
    //     resolves immediately, no span.
    //   * Async path — `pryzm.bootstrap.scene` span is emitted by
    //     `bootstrapScene()`; soft-fail captures the error in
    //     `scene.rendererError` and logs at this layer for ops.
    //   * `tornDown` race — if tearDown landed before bootstrap resolved,
    //     we discard the result and call its tearDown.
    //
    // Flow-1 (2026-04-30, see `04-PLAN-FORWARD/04-END-TO-END-FLOWS-AND-COVERAGE.md`
    // §1 Flow 1 stage 4): the same `bootstrapScene()` delegation is now
    // ALSO reachable as `runtime.scene.mount(canvas, mode?)` AFTER the
    // runtime resolves — the typed entry point named by the spec.  Both
    // paths funnel through `runScene(canvas, mode)` below so soft-fail
    // semantics, the `scene.ready` event, the OTel span, and `tornDown`
    // race handling stay identical.  Idempotent on a per-canvas basis;
    // a different canvas after the first one rejects with a typed Error.
    let sceneSlot: SceneSlot;
    const sceneIdle = bootstrapSceneIdle(inner.host).scene;

    let sceneReady: Promise<void>;
    let tornDown = false;
    let renderTearDown: (() => void) | null = null;
    let mountedCanvas: HTMLCanvasElement | null = null;
    let mountInFlight: Promise<void> | null = null;

    /** Single closure that owns the `bootstrapScene()` invocation.
     *  Called by both the compose-time `opts.canvas` path AND by
     *  `runtime.scene.mount(canvas, mode?)` post-compose — they share
     *  every byte of soft-fail / span / tornDown / event semantics. */
    const runScene = async (
      canvas: HTMLCanvasElement,
      mode: 'auto' | 'webgpu' | 'webgl2',
    ): Promise<void> => {
      const result = await bootstrapScene({
        audit: opts.audit,
        canvas,
        mode,
        committerHost: inner.host,
        loadRenderEverything: async () => {
          const mod = await import('@pryzm/editor/bootstrap.render.everything');
          return (mod as {
            bootstrapRenderEverything: RenderEverythingBootstrapFn;
          }).bootstrapRenderEverything;
        },
      });

      if (tornDown) {
        try { result.tearDown(); } catch { /* */ }
        return;
      }

      // Mutate the slot's mutable backing fields atomically.  The slot
      // exposed to consumers is a Proxy/getter façade (built below) that
      // reads from `sceneCurrent`, so this single assignment is the
      // sole observable transition from idle → mounted.
      sceneCurrent = result.scene;
      renderTearDown = result.tearDown;
      mountedCanvas = canvas;

      if (sceneCurrent.renderer !== null) {
        events.emit('scene.ready', { renderer: sceneCurrent.renderer, canvas });
      } else if (sceneCurrent.rendererError !== null) {
        // Soft-fail: log at the composer layer so ops sees the failure
        // even when no panel inspects `rendererError`.
        console.error(
          '[runtime-composer] renderer init failed soft:',
          sceneCurrent.rendererError,
        );
      }
    };

    // Mutable backing for the scene-slot data fields.  The slot
    // surface (`sceneSlot`) reads through getters so consumers see the
    // post-mount fields without holding a stale reference.
    let sceneCurrent: typeof sceneIdle = sceneIdle;

    sceneSlot = {
      get renderer() { return sceneCurrent.renderer; },
      get scheduler() { return sceneCurrent.scheduler; },
      get host() { return sceneCurrent.host; },
      // Canonical alias per SceneSlot.committer (chunks/22 §22.3 Flow 3
      // stage 4).  Returns the SAME CommitterHost instance as `host`
      // — both getters read the same backing field, so a future wave
      // can deprecate `host` without a behaviour change.
      get committer() { return sceneCurrent.host; },
      get materialPool() { return sceneCurrent.materialPool; },
      get rendererError() { return sceneCurrent.rendererError; },
      mount(
        canvas: HTMLCanvasElement,
        mode: 'auto' | 'webgpu' | 'webgl2' = opts.rendererMode ?? 'webgl2',
      ): Promise<void> {
        if (tornDown) {
          return Promise.reject(
            new Error('[runtime-composer/scene.mount] runtime has been torn down'),
          );
        }
        if (mountedCanvas !== null) {
          if (mountedCanvas === canvas) {
            // Idempotent — same canvas, same mount.  Resolve to whatever
            // the in-flight mount is (or already resolved to).
            return mountInFlight ?? Promise.resolve();
          }
          return Promise.reject(
            new Error(
              '[runtime-composer/scene.mount] a different canvas is already mounted; ' +
                'tear down and re-compose to switch canvases',
            ),
          );
        }
        mountInFlight = runScene(canvas, mode);
        return mountInFlight;
      },
      // Wave 14 — F.4.3 / F.5.5 / F.5.6 snap stub (Phase F; Phase D wires real engine)
      snap: {
        mode: 'off' as 'off' | 'grid' | 'vertex' | 'edge' | 'face',
        setMode(_mode: 'off' | 'grid' | 'vertex' | 'edge' | 'face'): void { /* Phase D */ },
        candidate: null,
      },
    };

    if (opts.canvas !== undefined && opts.canvas !== null) {
      const canvas = opts.canvas;
      mountedCanvas = canvas;
      sceneReady = runScene(canvas, opts.rendererMode ?? 'webgl2');
      mountInFlight = sceneReady;
    } else {
      sceneReady = Promise.resolve();
    }

    // ── 6. Stores + bus surfaces (proxied through the inner runtime) ──────
    //
    // D.5.A.8 (2026-04-30 evening): `registry` now reads `inner.bus.registry`
    // directly — the `CommandBus` exposes a public typed `get registry()`
    // returning `ReadonlyMap<string, CommandHandler<unknown, AnyStores>>`.
    // The previous speculative `(inner as { commandRegistry?: ... })`
    // cast looked for a non-existent field on `EverythingRuntime` and
    // always fell through to `new Map()`, returning an always-empty
    // registry to dev-tools / panels.  Anchor: `08-WAVE-4-SLOT-TYPING-ROUTING.md
    // §2 PR 4.A.8`.
    //
    // Wave 7 (2026-05-01): `stores` is now a typed `StoresSlot` (not a raw
    // Record<string, Store<object>> cast).  `registerHydrator()` is called
    // once by `initPersistence.ts` after the engine boots; `hydrate()` is
    // the named project-snapshot fan-out leg.  Per-store typed accessors land
    // in Phase E once the element families migrate.
    let _hydratorFn: ((snapshot: unknown) => void | Promise<void>) | null = null;
    const stores: StoresSlot = {
      registerHydrator(fn: (snapshot: unknown) => void | Promise<void>): void {
        _hydratorFn = fn;
      },
      async hydrate(snapshot: unknown): Promise<void> {
        if (_hydratorFn === null) {
          throw new RuntimeNotWiredError(
            'stores.hydrate',
            'initPersistence.ts (call runtime.stores.registerHydrator() after engine boot)',
          );
        }
        await _hydratorFn(snapshot);
      },
      // Wave 14 — F.4.1/F.4.2/F.4.5 viewState stub (Phase F; Phase E wires real store)
      viewState: {
        activeLayer: null,
        activeLevel: null,
        zoom: 1.0,
        setActiveLayer(_id: string | null): void { /* Phase E */ },
        setActiveLevel(_id: string | null): void { /* Phase E */ },
        setZoom(_value: number): void { /* Phase E */ },
      },
      // Wave 14 — F.4.4 project units stub (Phase F; Phase E wires real project store)
      project: {
        units: 'metric' as 'metric' | 'imperial',
        setUnits(_units: 'metric' | 'imperial'): void { /* Phase E */ },
      },
    };
    const bus = {
      executeCommand(type: string, payload: unknown): unknown {
        return inner.bus.executeCommand(type, payload);
      },
      /**
       * §U-B2 (DAILY-USE-AUDIT 2026-05-20) — formal dispatch entry point used by
       * `RemoteCommandDispatcher` (collaboration catch-up + live broadcast). The
       * `source: 'REMOTE'` opt threads through to `executeCommand`'s `suppressUndo`,
       * so a remote collaborator's edit does NOT land on the local user's undo
       * stack (Ctrl+Z must never undo someone else's work — §30-COLLAB §3.5).
       * Pre-existing local callers continue to use `executeCommand` directly; no
       * call-site change required for them.
       */
      dispatch(
        type: string,
        payload: unknown,
        opts?: { readonly source?: 'LOCAL' | 'REMOTE' | 'PROJECT_LOAD' },
      ): unknown {
        const suppressUndo = opts?.source === 'REMOTE' || opts?.source === 'PROJECT_LOAD';
        return inner.bus.executeCommand(type, payload, { suppressUndo });
      },
      register(handler: CommandHandler<unknown>): Disposable {
        inner.bus.register(handler);
        return {
          // Phase A — the inner bus does not yet own per-handler
          // disposers.  Phase B widens this when the per-plugin
          // dispatch protocol lands.
          dispose: (): void => undefined,
        };
      },
      registry: inner.bus.registry as ReadonlyMap<string, CommandHandler<unknown, AnyStores>>,
      // Sprint F-2.0: forward ringBuffer accessor so PryzmRuntime.bus narrow type is satisfied.
      get ringBuffer() { return inner.bus.ringBuffer; },
      setRingBuffer(rb: Parameters<typeof inner.bus.setRingBuffer>[0]): void {
        inner.bus.setRingBuffer(rb);
      },
      /**
       * §U-B1 (DAILY-USE-AUDIT 2026-05-20) — clear BOTH undo stacks. Called by
       * `ProjectLifecycleController` on project switch and by `ProjectLoader`
       * after `commandManager.clearHistory()` on project load. Without this,
       * Ctrl+Z in Project B applies an inverse JSON-Patch from Project A's
       * edits (either no-op'ing on missing element IDs or corrupting B's data).
       */
      clearUndoStacks(): void {
        try { inner.bus.ringBuffer?.clear(); } catch { /* non-fatal */ }
        try { (inner.bus as { undoStack?: { clear?: () => void } }).undoStack?.clear?.(); } catch { /* non-fatal */ }
      },
    };

    const tearDown = (): void => {
      if (tornDown) return;
      tornDown = true;
      // Unsubscribe S03/S04 bridges before clearing the event bus.
      disposeCommandBridge();
      disposeRingBuffer();
      disposeEventLog();
      try { events.emit('runtime.tearDown', {}); }
      catch { /* swallow */ }
      try { renderTearDown?.(); }
      catch (err) { console.error('[runtime-composer] render tearDown threw:', err); }
      try { physicsHost.dispose(); }
      catch (err) { console.error('[runtime-composer] physicsHost dispose threw:', err); }
      try { inputHost.dispose(); }
      catch (err) { console.error('[runtime-composer] inputHost dispose threw:', err); }
      try { inner.tearDown(); }
      catch (err) { console.error('[runtime-composer] inner tearDown threw:', err); }
      events.clear();
    };

    const runtime: ComposedRuntime = {
      audit: opts.audit,
      scene: sceneSlot,
      stores,
      bus,
      selection,
      hover,
      projectContext,
      tools,
      picking,
      physicsHost,
      inputHost,
      viewRegistry,
      persistence,
      sync,
      visibility: buildVisibilitySlot(),
      ai,
      plugins,
      events,
      toasts,
      userPreferences,
      undoStack,
      workspace,
      workspaceMode,
      cameraController,
      ifc,
      rhino,
      bcf,
      pdf,
      // Wave 14 — slots 19-29
      auth,
      shortcuts,
      toast: toasts as ToastSlot,
      debug,
      export: exportSlot,
      entitlements,
      cde,
      geospatial,
      physics: physicsDevSlot,
      structural,
      search,
      sceneReady,
      tearDown,
    };

    const composeMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs;
    span.setAttribute('compose.ms', composeMs);
    span.setAttribute('compose.canvas_supplied', opts.canvas != null);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    events.emit('runtime.composed', { composeMs });

    return runtime;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    span.end();
    throw err;
  }
}
