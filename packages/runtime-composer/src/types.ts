// @pryzm/runtime-composer/types — the PryzmRuntime contract.
//
// Spec: `docs/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`
//       §3.2 (interface shape) + §16.1 A.3 (14 named slots).
//
// This file is the ONLY module under `packages/` that the white UI
// (`src/ui/`) is allowed to import from once the Phase H lint rule
// (`eslint-plugin-pryzm/no-runtime-package-import`) lands. Every panel
// reaches the engine through `runtime.<slot>` and never via deep-import
// or `(window as any)`.
//
// Phase A (S73) deliverable: the interface shape is final; many slots
// hold typed-but-stub implementations to keep the contract honest while
// later phases (B–G) replace each stub with the real subsystem.  Slots
// not yet wired carry a JSDoc `@phase X.y` tag pointing to the
// destruction sub-phase that finishes their wiring.
//
// Phase C (S74-WIRE, this commit) — see PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md
// §16.3 — extends the contract with:
//   • RuntimeEvents: `persistence.status`, `persistence.openProgress`,
//                    `persistence.projectListChanged`, `selection.changed`.
//   • PersistenceSlot widened to a real client + store + eventLog +
//     exporter + importer + no-reload openProject().
//   • UndoStackSlot — drives the SaveUndoRedoHUD's Cmd+Z / Cmd+Shift+Z.
//   • WorkspaceSlot, CameraControllerSlot — Phase-D-shaped skeletons
//     declared here so panels can name them in their constructors today
//     without waiting for the Phase D wireup.

import type { AnyStores, CommandHandler, RingBufferUndoStack } from '@pryzm/command-bus';
import type { SyncClient, PryzmAwareness } from '@pryzm/sync-client';
import type { LayoutOptionsStore, AiApprovalQueueStore, ApartmentParameterPropagator, FamilyRegistryStore, SiteModelStore, ClimateStore, BuildingStore, LevelStore, ApartmentStore, RoomStore, ProvenanceStore, IfcMetaStore, SiteCreatedEvent, SiteLocationChangedEvent, SiteParcelBoundarySetEvent, SiteZoningUpdatedEvent } from '@pryzm/stores';
import type {
  TypologyRegistry,
  PipelineRouter,
} from '@pryzm/typology-pipeline';
import type { Renderer, MaterialPool, FrameScheduler, CommitterHost, CameraController, PlainPose } from '@pryzm/renderer';
import type { WorkspaceSurface } from '@pryzm/renderer-three';
import type {
  VisibilityElement,
  VisibilityView,
  VisibilityFeatureFlags,
  WaveVisibilityResult,
  ViewVisibilityIntentStore,
} from '@pryzm/visibility';
// W3-2 — the scene-projection half of visibility intent. Local to this package
// (it writes `node.visible`, which is a rendering act and therefore may not live
// in the L1 domain package — ARM A of check-visibility-intent-not-ui).
import type { VisibilitySceneNode, VisibilityProjectionResult } from './visibilitySceneApplier.js';

// ---------------------------------------------------------------------------
//                       Cross-cutting helper types
// ---------------------------------------------------------------------------

/** A disposer returned from `register(...)` / `subscribe(...)` calls.
 *  Idempotent — calling `dispose()` more than once is safe.  Pure
 *  contract type; lives here so `src/ui/` can declare disposable
 *  fields without importing it from a deeper package. */
export interface Disposable {
  dispose(): void;
}

/** §EVENTBUS-CALLABLE-DISPOSABLE (2026-05-24) — a subscription handle that is
 *  BOTH callable (`unsub()`) AND a `Disposable` (`unsub.dispose()`).
 *  `TypedEventEmitter.on` returns this so the ~dozens of F.events-migration call
 *  sites that store the return and call it as a function keep working alongside
 *  `Disposable` consumers. Previously `on` returned a pure `{ dispose }` object,
 *  so every `unsub()` site threw `TypeError: … is not a function` on teardown. */
export type EventSubscription = Disposable & (() => void);

/** Toast severity levels — matches the existing `AppToast.ToastType`
 *  alphabet so the wrapper is a no-op transformation. */
export type ToastKind = 'info' | 'success' | 'warn' | 'error';

/** Typed event emitter contract — minimal, no inheritance from Node's
 *  `EventEmitter` (which leaks `MaxListenersExceededWarning` in the
 *  browser).  Subscribe returns the disposer (idempotent). */
// Constraint is `object` (not `Record<string, unknown>`) because the
// `RuntimeEvents` interface below uses dotted property names and TS does
// not implicitly add an index signature to interfaces — so the stricter
// constraint would reject our own contract.  `object` is sufficient for
// the type-mapper logic below (we only ever read `keyof TMap`).
export interface TypedEventEmitter<TMap extends object> {
  on<K extends keyof TMap>(event: K, handler: (payload: TMap[K]) => void): EventSubscription;
  off<K extends keyof TMap>(event: K, handler: (payload: TMap[K]) => void): void;
  emit<K extends keyof TMap>(event: K, payload: TMap[K]): void;
}

/** Cross-cutting events emitted by the runtime.  Phase A registers
 *  three; later phases extend the union (e.g. `'persistence.status'`,
 *  `'persistence.openProgress'`, `'sync.peer.joined'`).  Listeners use
 *  the typed `runtime.events.on('scene.ready', handler)` API. */
export interface RuntimeEvents {
  /** Fired exactly once when `runtime.scene.renderer` is non-null and
   *  the canvas has painted its first frame.  Replaces the legacy
   *  `bim-store-mutated` + `pryzm-project-loaded` DOM events for
   *  panels that need to wait for scene readiness. */
  'scene.ready': { renderer: Renderer; canvas: HTMLCanvasElement };

  /** Fired when `composeRuntime()` resolves successfully — useful for
   *  test harnesses + perf benches that need a deterministic "runtime
   *  is now constructible" signal. */
  'runtime.composed': { composeMs: number };

  /** Fired by `tearDown()` before the destructor walk runs.  Panels
   *  that hold long-lived subscriptions can release them here. */
  'runtime.tearDown': Record<string, never>;

  // ── Phase C (§16.3) — persistence + selection ────────────────────────────

  /** SaveUndoRedoHUD subscribes to flip its dirty/saving/synced badge.
   *  Emitted by `runtime.persistence` whenever its lifecycle state
   *  changes. */
  'persistence.status': PersistenceStatus;

  /** Open-project progress — PlatformShell subscribes and animates the
   *  inline progress bar through the four phases below.  No reload. */
  'persistence.openProgress': PersistenceOpenProgress;

  /** ProjectHub subscribes; the hub re-renders whenever the project
   *  list is refreshed / mutated through the `runtime.persistence` slot
   *  (no localStorage, no global reads). */
  'persistence.projectListChanged': { count: number };

  /** SelectionOverlay + the right-rail inspectors subscribe.  Emitted
   *  whenever `runtime.selection.{add,remove,clear,set}` mutates the
   *  selection set.  Replaces the legacy `'pryzm-selection-changed'`
   *  DOM event. */
  'selection.changed': { ids: readonly string[] };

  // ── #51 Apartment Layout (SPEC-APARTMENT-LAYOUT-GENERATOR §13) ─────────────

  /** Fired by the `apartment-layout-generate` workflow when N ranked,
   *  validated, scored interior-layout options are ready. The §11 modal
   *  subscribes; `options` are `ScoredLayoutOption[]` (typed loosely here
   *  to keep this contract free of an ai-host import — the modal narrows).
   *  Replaces a `window.dispatchEvent` (P4). */
  'apartment.layout-options-ready': { runId: string; options: readonly unknown[] };

  /** Fired by the §11 modal when the user picks an option ("Use this
   *  layout"). The A6 execute handler subscribes → reads
   *  `runtime.ai.layoutOptions.optionAt(optionIndex)` → builds the batch. */
  'apartment.layout-execute': { optionIndex: number };

  /** Fired by the A6 execute handler after the layout is committed as one
   *  undoable batch (rooms then auto-redetect). */
  'apartment.layout-executed': {
    createdWallCount: number;
    createdDoorCount: number;
    /** §PREVIEW-VS-BUILD (2026-05-27) — drop visibility: how many walls the
     *  chosen LayoutOption carried vs how many actually landed. Lets tests,
     *  telemetry, and AI follow-ups observe partial builds without scraping
     *  the console. Optional for back-compat with older emitters. */
    previewWallCount?: number;
    droppedWallCount?: number;
    warnings?: readonly string[];
    /** The level id the executor was active on — needed by the
     *  furnish/ceiling/lighting follow-up triggers to scope their work. */
    levelId?: string;
    /** Optional sub-zone metadata for downstream consumers (the inspect
     *  panel uses this to badge rooms by zone). */
    subZones?: unknown;
  };

  /** Fired by the §11 modal on cancel — the AIStore pending run is cleared. */
  'apartment.layout-cancel': Record<string, never>;

  /** §REJECT-SURFACE (2026-05-31) — fired by the engine when it declines
   *  to generate a layout (envelope too big/small, deterministic engine
   *  declined, AI relay failed without procedural fallback). The
   *  ApartmentLayoutController subscribes and toasts the reason. */
  'apartment.layout-rejected': {
    runId?: string;
    reason: string;
    attempts?: number;
  };

  /** §POLL-TELEMETRY — fired by the executor after the post-batch
   *  wall-poll loop finishes. Lets tests + telemetry observe how long
   *  the wall settle took. */
  'apartment.wall-poll-completed': {
    levelId: string;
    elapsedMs: number;
    iterations: number;
    wallsReady: number;
    wallsNeeded: number;
    forced: boolean;
  };

  /** §POLL-TELEMETRY — fired after the room-name pass finishes (rooms
   *  detected + renamed + occupancies set). */
  'apartment.room-name-completed': {
    levelId: string;
    source: string;
    elapsedMs: number;
    detectedRooms: number;
  };

  // ── #52 D-FLE Furniture Layout Engine — events ────────────────────────────
  /** Fired by the trigger (console command / apartment.layout-executed auto-
   *  fire) to ask the FurnishLayoutExecutor to furnish every furnishable room
   *  on a level. When `levelId` is supplied (§FIX-FURNISH-ALL-FLOORS-COVERAGE,
   *  L-101, the all-floors driver) that EXACT level is furnished; otherwise the
   *  active level (`window.projectContext.activeLevelId`) is used. */
  'furnish.layout-execute': { levelId?: string };
  /** Fired by FurnishLayoutExecutor after the runBatch settles. `placedCount`
   *  is the total number of furniture items dispatched (in ONE
   *  `furniture.batch.create` — §FIX-FURNISH-BATCH-PERF, L-100).
   *  `validationWarnings` carries circulation / overlap warnings collected
   *  pre-dispatch (per WS-1.A); empty array when the layout is clean.
   *  `roomsFurnished`/`roomsSkipped`/`skipped` are the per-unit coverage report
   *  (§FIX-FURNISH-ALL-FLOORS-COVERAGE, L-101): every room that received no
   *  furniture carries an explicit reason. */
  'furnish.layout-executed': {
    placedCount: number;
    roomCount: number;
    levelId: string;
    roomsFurnished?: number;
    roomsSkipped?: number;
    skipped?: ReadonlyArray<{ roomId: string; name?: string; reason: string }>;
    validationWarnings?: readonly string[];
  };

  // ── #53 D-LE Lighting Layout Engine — events ──────────────────────────────
  /** Fired by the trigger (console command / furnish.layout-executed auto-
   *  fire) to ask the LightingLayoutExecutor to auto-place ceiling fixtures
   *  in every room on the active level. */
  'lighting.layout-execute': Record<string, never>;
  /** Fired by LightingLayoutExecutor after the runBatch settles. */
  'lighting.layout-executed': {
    placedCount: number;
    roomCount: number;
    levelId: string;
  };

  // ── #54 D-CE Ceiling Layout Engine — events ───────────────────────────────
  /** Fired by the trigger (console command / apartment.layout-executed auto-
   *  fire) to ask the CeilingLayoutExecutor to auto-place ONE ceiling slab
   *  per ceilable room on the active level. */
  'ceiling.layout-execute': Record<string, never>;
  /** Fired by CeilingLayoutExecutor after the runBatch settles. The furnish
   *  trigger listens for this so the full chain is
   *  apartment → CEIL → furnish → light. */
  'ceiling.layout-executed': {
    placedCount: number;
    roomCount: number;
    levelId: string;
  };

  // ── Wave 4 Track A — typed-slot events ────────────────────────────────────

  /** PR 4.A.1 (D.11-prep) — emitted by `buildViewRegistrySlot.activate()`
   *  on every successful (non-no-op) activation.  `viewId` is `null`
   *  when `activate('')` clears the active view. */
  'viewRegistry.activate': { viewId: string | null };

  /** PR 4.A.2 (D.10-prep) — emitted by `buildCameraControllerSlot.set()`
   *  after `CameraController.applyPose()` succeeds.  Payload carries
   *  the *post-apply* `snapshotPlain()` so listeners see clamped values
   *  (pitch limit, distance clamp, etc.). */
  'cameraController.poseChanged': { pose: PlainPose };

  /** PR 4.A.3 — emitted by `buildWorkspaceModeController.set()` on every
   *  successful (non-no-op) render-mode change (`'3d'|'plan'|'section'`).
   *  `previous` carries the mode before the mutation. */
  'workspace.modeChanged': { mode: WorkspaceMode; previous: WorkspaceMode };

  // ── Wave 6 panel-binding events ───────────────────────────────────────────
  // Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2
  // OTel: pryzm.ui.panel.activate / pryzm.ui.panel.deactivate  (P8)

  /** Emitted by `ViewRegistrySlot.activatePanel()` on every successful
   *  (non-idempotent) panel activation.  Phase F plugins can subscribe to
   *  know which panels are currently visible without querying the DOM. */
  'ui.panel.activated': { panelId: string };

  /** Emitted by `ViewRegistrySlot.deactivatePanel()` on every successful
   *  (non-idempotent) panel deactivation. */
  'ui.panel.deactivated': { panelId: string };

  /** PR 4.A.3 / 4.A.4 — emitted by the `workspace` slot when the
   *  *platform surface* switches between `'landing'|'hub'|'workspace'`.
   *  Distinct from `'workspace.modeChanged'` which is the render-mode
   *  event owned by `runtime.workspaceMode`. */
  'workspace.surfaceChanged': { mode: WorkspaceSurfaceKind };

  // ── S03: CommandEventBridge — typed domain-event relay ───────────────────
  // Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §3
  // Emitted by CommandEventBridge after EVERY successful CommandBus dispatch.
  // Replaces ad-hoc window.dispatchEvent(new CustomEvent(...)) calls in the
  // migration bridge layer (Phase E.5.x+).
  //
  // Consumers: any panel, plugin, or test that needs to react to bus activity
  // without coupling to store subscriptions.  Prefer store.subscribe() for
  // fine-grained reactive updates; use 'command.executed' only for cross-cutting
  // concerns (telemetry collectors, room-redetect bridge, undo history HUD).
  /** Fired by CommandEventBridge after every successful CommandBus.executeCommand().
   *  `id` is the ULID from EventRecord (sortable, unique per dispatch).
   *  `affectedStores` mirrors handler.affectedStores so consumers can filter
   *  by store key without parsing the type string. */
  'command.executed': {
    readonly id: string;
    readonly type: string;
    readonly affectedStores: readonly string[];
    readonly actorId: string;
    readonly projectId: string;
  };

  // ── A24: Typed family domain events (C11 §5.2) ───────────────────────────
  // Emitted by CommandEventBridge after wall-create commands succeed.
  // Handlers are pure and MUST NOT emit these directly (L4→L2 inversion).
  // Consumers: rooms redetect bridge, analytics, future AI listeners.
  //
  // Design note: handlers signal creation via CommandBus; CommandEventBridge
  // (L2) translates to typed family events.  This keeps the L4→L2 layer
  // boundary clean — plugins subscribe via runtime.events (passed as a
  // typed interface) without importing @pryzm/runtime-composer directly.
  //
  // Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §5.1
  //       C11 §5.2 ("handler MUST emit a typed domain event after mutation")

  /** Fired after `wall.create` or `wall.batch.create` succeeds.
   *  `commandType` distinguishes single vs batch create.
   *  `levelId` is the owning level (empty string when level store is
   *  not yet wired — S07 allowance per CreateWallPayload contract).
   *  `wallCount` is 1 for single creates; N for batch. */
  'wall.created': {
    readonly commandId: string;
    readonly commandType: 'wall.create' | 'wall.batch.create';
    readonly levelId: string;
    readonly wallCount: number;
    // §P2.1 (IMPL-PLAN-2026-05-17): geometry fields forwarded by CommandEventBridge for
    // the F-1.2 legacy-store bridge in initTools.ts.  Present only for single creates
    // (commandType === 'wall.create') where the caller passed id and baseLine.  Absent
    // for batch creates — batch payloads carry arrays and are bridged separately.
    readonly wallId?: string;
    readonly baseLine?: ReadonlyArray<Readonly<{ readonly x: number; readonly y?: number; readonly z: number }>>;
    readonly height?: number;
    readonly thickness?: number;
    readonly baseOffset?: number;
    readonly systemTypeId?: string;
    // §RESI-FACADE-COLOUR-PERSIST (2026-06-24): per-wall opaque finish colour (hex `#rrggbb`),
    // forwarded by CommandEventBridge so the initTools legacy-store mirror can carry it to the
    // mesh-building WallStore. Without this the residential façade colour (and any batch-created
    // wall's Color Override) was dropped between the Immer store and the legacy render store.
    readonly materialColor?: string;
    // ⭐ C100 §2.1 / L-1461: the MASTER catalogue id this wall references. `materialColor`
    // above is a RESOLVED CACHE of it; C100 §2.1 makes the id the authority and the hex the
    // cache, so forwarding only the hex leaves the render store unable to re-resolve when the
    // master changes (§2.2). Measured 2026-08-20: no interactive creation path sets it yet.
    readonly materialId?: string;
    // §RESI-FACADE-INTERIOR-WHITE (2026-06-24): per-layer finish stack, forwarded so the legacy-store
    // mirror builds a LAYERED wall (exterior façade colour + interior white = per-face finishes).
    readonly layers?: ReadonlyArray<Readonly<{
      readonly name: string;
      readonly function: string;
      readonly thickness: number;
      readonly materialId?: string;
      readonly materialColor?: string;
    }>>;
    // §FIX-WALL-CURVE-PLAN-VS-3D-CREATION (2026-08-06): quadratic-Bézier curve descriptor
    // (the Wall schema's ONE curvature representation), forwarded so the initTools §P2.1
    // legacy-store mirror builds the arc mesh + plan projection instead of the straight chord.
    readonly curve?: Readonly<{
      readonly control: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
      readonly segments: number;
    }>;
  };

  /**
   * §L-946 — the MUTATION channel. Fired after any declared level-change verb
   * succeeds (`wall.changeLevel`, `roof.changeLevel`; the set is the
   * `LEVEL_CHANGE_VERBS` table in `CommandEventBridge.ts`).
   *
   * WHY IT IS FAMILY-AGNOSTIC, unlike every `<family>.created` above: those
   * carry family-specific GEOMETRY, so one event type per family is unavoidable.
   * A level change carries the same three facts for every family, and the twelve
   * `.created` events are the standing demonstration of what happens when that
   * is copy-pasted — each drifted its own set of dropped fields. One event, one
   * subscriber, `elementKind` selecting the legacy store to mirror into.
   *
   * `newElevationY` is present only for families whose verb carries it (wall
   * does; roof does not). Its ABSENCE means "this family does not state an
   * elevation", never "the elevation is 0".
   */
  'element.level-changed': {
    readonly commandId: string;
    /** The bus verb that produced this, e.g. `'wall.changeLevel'`. */
    readonly commandType: string;
    /** Element family — selects the legacy store the app-side mirror writes. */
    readonly elementKind: string;
    readonly elementId: string;
    /** Destination level. Guaranteed non-empty — the bridge refuses to emit
     *  a move with no target rather than let '' reach a spatial register. */
    readonly newLevelId: string;
    readonly newElevationY?: number;
  };

  /**
   * §MIRROR-UPDATE (L-9942) — THE SECOND MUTATION CHANNEL, and the one that
   * closes the asymmetry `tools/ga-gate/check-mirror-completeness.ts` exists to
   * measure:
   *
   *     grep -c "\.created'"  apps/editor/src/engine/initTools.ts   -> 17
   *     grep -c "\.updated'"  apps/editor/src/engine/initTools.ts   ->  0
   *
   * Every element family could be CREATED and reach the render layer. **None
   * could be UPDATED and reach it.** `element.level-changed` above is the one
   * exception and it moves exactly one field, `levelId`. Everything else — a
   * thickness, a base offset, a hole punched through a floor plate — committed
   * to the plugin DTO store, reported success, and left the legacy store the
   * fragment builders / plan projector / IFC exporter / ProjectSerializer all
   * read holding its own unchanged copy.
   *
   * ─── ⭐ WHY THE EVENT CARRIES FIELD **NAMES** AND NOT FIELD **VALUES** ─────
   * Because a second copy of a value on the wire is a second thing that can be
   * wrong. The `.created` events carry values and L-927 is the standing receipt
   * for what that costs: `materialColor`, `layers` and `curve` were each a
   * separate founder-visible defect, fixed one field at a time, because a field
   * the emitter's whitelist did not know about could never arrive.
   *
   * So this event says WHICH fields the handler committed, and the app-side
   * mirror (`apps/editor/src/engine/elementUpdatedMirror.ts`) reads their values
   * out of the PLUGIN store — the store the handler actually wrote. One value,
   * one owner (C84 EI-9).
   *
   * ⚠ THAT MAKES SUBSCRIBER ORDER LOAD-BEARING, AND IT IS MEASURED RATHER THAN
   * ASSUMED. `PatchEmitter.listeners` is an insertion-ordered `Set`;
   * `bootstrap()` calls `attachStores(emitter, stores)` (bootstrap.ts:103)
   * BEFORE `composeRuntime()` calls `wireCommandEventBridge(inner.bus.patches,
   * events)` (composeRuntime.ts:956), so the plugin store has already applied
   * the forward patches by the time this event is emitted. The mirror does NOT
   * rely on that silently: a record it cannot find is a NAMED refusal in the
   * log, never a quiet no-op (§context-data-honesty — failure and emptiness are
   * never the same value).
   *
   * ⛔ IT IS NOT A GENERAL "COPY EVERY FIELD ACROSS" RELAY, and it must not
   * become one. A moved wall is not a repainted wall: `WallStore.update()`
   * clears `_sourceBaseLine` and re-runs join resolution, so a mirror that blind-
   * copied a baseline would silently un-weld every corner it touched. Which
   * fields may cross is DECLARED per verb in `ELEMENT_UPDATE_VERBS`
   * (`CommandEventBridge.ts`) and which family they may cross into is DECLARED
   * in `LEGACY_UPDATABLE_STORES` (the mirror). A verb with no row emits nothing.
   */
  'element.updated': {
    readonly commandId: string;
    /** The bus verb that produced this, e.g. `'slab.setThickness'`. Compounds
     *  stamp their OWN verb here (`'pool.create'` for the host slab's void), so
     *  a reader can tell a direct edit from a cascade. */
    readonly commandType: string;
    /** Element family — selects the legacy store the app-side mirror writes. */
    readonly elementKind: string;
    readonly elementId: string;
    /**
     * The TOP-LEVEL fields the handler committed, in the PLUGIN record's own
     * vocabulary. Deep patches collapse to their top-level field (`holes.3` →
     * `holes`), because the legacy stores this feeds all take whole-field
     * writes and a sub-path write is exactly the annihilating-partial defect
     * `SlabStore.changeLevel`'s header records as L-977.
     *
     * NEVER empty: the bridge refuses to emit a change that names no field.
     */
    readonly changedFields: readonly string[];
  };

  /**
   * §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944) · C106 · L-9305.
   *
   * ⭐ THE FAMILY WITH EXACTLY ONE STORE, AND THEREFORE THE ONE EVENT THAT
   * CARRIES AN **ID** RATHER THAN A FIELD LIST.
   *
   * `plugins/boundary-line/src/store.ts` opens by declaring that this family has
   * ONE authority on purpose — no legacy geometry twin to drift from. So the
   * subscriber does not need the record copied onto the wire: it reads the
   * authoritative record straight out of `runtime.stores.boundaryLine`. `line`
   * is carried anyway, off the COMMIT, for the two cases where reading the store
   * would be the weaker answer:
   *   · it makes the create path independent of subscriber ordering;
   *   · it is what a test can drive without standing up a store registry.
   *
   * ⚠ IT IS ABSENT FOR `boundaryLine.move`, and that absence is information.
   * The move is the L-220 distinct-verb bridge to `MoveBoundaryLineCommand`
   * (`initBusHandlers.ts`), which declares `stores: []` and produces NO patches
   * — it writes the store through `BoundaryLineStorePort`. There is nothing on
   * the commit to read, so the subscriber falls back to the store, which for
   * this family is the authority anyway.
   */
  'boundaryLine.created': {
    readonly commandId: string;
    readonly commandType: 'boundaryLine.create';
    readonly levelId: string;
    readonly boundaryLineId: string;
    /** The committed record, read off the `{op:'add', path:[id]}` patch. */
    readonly line?: Readonly<Record<string, unknown>>;
  };

  /**
   * §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944) — the UPDATE half, and the
   * first `*.updated` mirror this codebase has ever had (the mirror-completeness
   * gate's census read `0 '*.updated' mirrors` on 2026-08-23).
   *
   * `commandType` is deliberately a plain `string` rather than a union: five
   * verbs reach it (`update`, `attach`, `detach`, `move`, and any later one),
   * they all mean "this line's record changed, redraw it", and a union here
   * would have to be edited in lock-step with a table it cannot see — the
   * `§FIX-CW-BRIDGE-DEAD-ARMS` (L-972) failure shape, inverted.
   */
  'boundaryLine.updated': {
    readonly commandId: string;
    readonly commandType: string;
    readonly levelId: string;
    readonly boundaryLineId: string;
    /** Present when the verb committed a whole-record patch; ABSENT for
     *  `boundaryLine.move`, which is a legacy-command bridge with no patches. */
    readonly line?: Readonly<Record<string, unknown>>;
  };

  /** §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9944) — the line is gone; the
   *  subscriber disposes its group. Carries no record on purpose: there is
   *  nothing left to describe, and an id is all a removal needs. */
  'boundaryLine.deleted': {
    readonly commandId: string;
    readonly commandType: 'boundaryLine.delete';
    readonly boundaryLineId: string;
  };

  // ── A25: Remaining-family typed domain events (C11 §5.2) ─────────────────
  // Pattern mirrors 'wall.created' from A24.  Emitted by CommandEventBridge
  // (L2) after each create command succeeds — handlers remain pure / L4.
  // `levelId` is '' when the handler does not carry a levelId in its payload
  // (S07 allowance).  `elementCount` is present on batch-capable families.
  //
  // Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/34-HANDLER-PROTOCOL-GAP-ANALYSIS.md §3
  //       C11 §5.2 ("handler MUST emit a typed domain event after mutation")

  /** Fired after `wall.opening.create` or `wall.createOpening` succeeds (§P2.3).
   *  `opening` carries the full opening payload including the stable id + elementId
   *  pre-generated by the plan tool so both the PRYZM3 Immer store and the legacy
   *  WallStore (via the initTools.ts bridge) share the same IDs. */
  'wall.opening.created': {
    readonly commandId: string;
    readonly commandType: 'wall.opening.create' | 'wall.createOpening';
    readonly wallId: string;
    readonly opening: Readonly<Record<string, unknown>>;
  };

  /** Fired after `slab.create` or `slab.batch.create` succeeds (Sprint A27/A29).
   *  `elementCount` is 1 for single create; N for batch.
   *  §FT1 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): geometry fields enriched for the
   *  legacy-store bridge in `initTools.ts`. The bridge mirrors the slab into the legacy
   *  `SlabStore` / `SlabFragmentBuilder` rendering path using these fields. */
  'slab.created': {
    readonly commandId: string;
    readonly commandType: 'slab.create' | 'slab.batch.create';
    readonly levelId: string;
    readonly elementCount: number;
    /** §FT1: slab element id (present for single slab.create only). */
    readonly id?: string;
    /** §FT1: IFC GUID — as generated by SlabPlanToolHandler (crypto.randomUUID()). */
    readonly ifcGuid?: string;
    /** §FT1: plan-view polygon — {x, y}[] where y = worldZ (plan-tool coordinate convention).
     *  Present for single slab.create only. Matches SlabData.polygon shape. */
    readonly polygon?: ReadonlyArray<{ readonly x: number; readonly y: number }>;
    /** §FT1: slab origin in world space. Always {0,0,0} from SlabPlanToolHandler
     *  (centroid is NOT added here — SlabFragmentBuilder adds it internally). */
    readonly position?: { readonly x: number; readonly y: number; readonly z: number };
    readonly width?: number;
    readonly depth?: number;
    readonly thickness?: number;
    readonly baseOffset?: number;
    readonly materialId?: string;
  };

  /** Fired after `slab.updateLayers` succeeds (TASK-12).
   *  Signals that a slab's system-type or layer stack has changed so
   *  FragmentBuilder subscribers can trigger a mesh rebuild. */
  'slab.layer-updated': {
    readonly commandId: string;
    readonly commandType: 'slab.updateLayers';
    readonly slabId?: string;
    readonly systemTypeId?: string;
    readonly layerCount: number;
    readonly thickness?: number;
  };

  /** Fired after `curtain-wall.create` or `curtain-wall.batch.create` succeeds.
   *  For batch creates, CEB emits one event per element (TASK-01, 2026-05-18) using
   *  commandType 'curtain-wall.create' so initTools §P3.1-CW subscriber accepts all events.
   *  §P3.1-CW (IMPL-PLAN-2026-05-17): geometry fields populated by CEB so initTools.ts
   *  can mirror the curtain wall into the legacy CurtainWallStore for 3D mesh rebuild.
   *  TASK-02 (MASTER-IMPL-PLAN-2026-05-18): bayWidth/bayHeight/mullionThickness added to
   *  fix the empty-mesh bug (migrateToGridSystem() NaN-spacing → 0 mullion cells). */
  'curtain-wall.created': {
    readonly commandId: string;
    /**
     * §FIX-CW-BRIDGE-DEAD-ARMS (L-972 · C84 EI-2b) — ONE literal, deliberately.
     * `CommandEventBridge` writes `'curtain-wall.create'` on BOTH its single and
     * its batch case (the batch loop sets the single-create value on purpose, so
     * one subscriber guard serves both). Declaring `'curtain-wall.batch.create'`
     * here as well made three unreachable accept-arms in the §P3.1-CW bridge
     * type-check and read as deliberate tolerance. Narrowed so a future arm for a
     * value no emitter writes fails compilation (TS2367) instead of surviving as
     * dead code.
     */
    readonly commandType: 'curtain-wall.create';
    readonly levelId: string;
    readonly elementCount: number;
    /** Curtain wall id. */
    readonly id?: string;
    /** baseLine endpoints [start, end] in level-plane coordinates (Y=0). */
    readonly baseLine?: ReadonlyArray<{ x: number; y?: number; z: number }>;
    /** Wall height in metres. */
    readonly height?: number;
    /** Bay width (horizontal mullion spacing) in metres.
     *  Maps to legacy gridXSpacing — required by migrateToGridSystem(). */
    readonly bayWidth?: number;
    /** Bay height (vertical mullion spacing) in metres.
     *  Maps to legacy gridYSpacing — required by migrateToGridSystem(). */
    readonly bayHeight?: number;
    /** Mullion profile thickness in metres. */
    readonly mullionThickness?: number;
    /**
     * §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972) — signed base offset in metres.
     * Maps to legacy `CurtainWallData.baseOffset`.
     *
     * ⚠ The §P3.1-CW bridge TESTED FOR this field for months
     * (`typeof _cwEv['baseOffset'] === 'number'`) while neither this event nor
     * the L0 `CurtainWall` schema declared it — a guard that could never be
     * true, so the default always won (C84 EI-2b).
     */
    readonly baseOffset?: number;
    /** §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972) — panel build thickness in metres.
     *  The second half of the same defect; maps to legacy `panelThickness`. */
    readonly panelThickness?: number;
    /** §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972) — the L0 `CurtainWall.materialId`
     *  (folded with `systemTypeId` exactly as `CreateCurtainWallHandler` folds
     *  them). On the schema, previously dropped here outright. */
    readonly materialId?: string;
    /** §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972) — the L0 `CurtainWall.panels`
     *  (`CurtainWall.ts:70`), previously dropped here outright. */
    readonly panels?: ReadonlyArray<{ readonly id: string }>;
    /**
     * §CW90-PLAN-TYPE-PARITY (C84 EI-11) — the armed curtain-wall TYPE, carried
     * FIRST-CLASS. `materialId` above folds `systemTypeId` in (matching the DTO
     * handler's seed), which is exactly why the mirror could never recover the
     * intent from it — three legacy slots, one ambiguous id. These four fields
     * carry the resolved type the way `CurtainWallData` actually spells it, so a
     * curtain wall drawn on the PLAN surface lands with the same type the 3-D
     * surface writes via `CreateCurtainWallCommand`.
     */
    readonly systemTypeId?: string;
    /** §CW90-PLAN-TYPE-PARITY — legacy `CurtainWallData.mullionMaterialId`. */
    readonly mullionMaterialId?: string;
    /** §CW90-PLAN-TYPE-PARITY — legacy `CurtainWallData.mullionColor`. */
    readonly mullionColor?: string;
    /** §CW90-PLAN-TYPE-PARITY — legacy `CurtainWallData.glazingMaterialId`
     *  (the wall's default panel material, inherited by every synced cell). */
    readonly glazingMaterialId?: string;
  };

  /** Fired after `column.create` or `column.batch.create` succeeds (Sprint A28/A29).
   *  `elementCount` is 1 for single create; N for batch.
   *  §P3.3-CO: geometry fields enriched for legacy-store bridge.
   *  The legacy bridge in `initTools.ts` remaps `origin`→`position`, `shape`→`profile`
   *  for the legacy `ColumnStore` / `ColumnFragmentBuilder` rendering path. */
  'column.created': {
    readonly commandId: string;
    readonly commandType: 'column.create' | 'column.batch.create';
    readonly levelId: string;
    readonly elementCount: number;
    /** §P3.3-CO: column element id (present for single column.create only). */
    readonly id?: string;
    /** §P3.3-CO: world-space origin Vec3 (maps to legacy ColumnData.position). */
    readonly origin?: { readonly x: number; readonly y: number; readonly z: number };
    /** §P3.3-CO: profile shape (maps to legacy ColumnData.profile). */
    readonly shape?: string;
    readonly width?: number;
    readonly depth?: number;
    readonly height?: number;
    readonly baseOffset?: number;
    readonly rotation?: number;
    readonly materialId?: string;
  };

  /** Fired after `beam.create` or `beam.batch.create` succeeds (Sprint A28/A29).
   *  `elementCount` is 1 for single create; N for batch.
   *  §FT2 (ELEMENT-FUNCTIONAL-FIX-PLAN-2026-05-18): geometry fields enriched for the
   *  legacy-store bridge in `initTools.ts`. The bridge mirrors the beam into the legacy
   *  `BeamStore` / `BeamFragmentBuilder` rendering path using these fields. */
  'beam.created': {
    readonly commandId: string;
    readonly commandType: 'beam.create' | 'beam.batch.create';
    readonly levelId: string;
    readonly elementCount: number;
    /** §FT2: beam element id (present for single beam.create only). */
    readonly id?: string;
    /** §FT2: beam start endpoint in world space — matches BeamData.startPoint. */
    readonly startPoint?: { readonly x: number; readonly y: number; readonly z: number };
    /** §FT2: beam end endpoint in world space — matches BeamData.endPoint. */
    readonly endPoint?: { readonly x: number; readonly y: number; readonly z: number };
    /**
     * §FT2 / §FIX-BEAM-CEB-STEEL (L-974): the L0 `Beam.shape` —
     * `'rectangular' | 'i-section' | 't-section'`, as COMMITTED.
     *
     * ⚠ This doc used to read "'rectangular' | 'UB' | 'UC'. Maps to
     * BeamData.sectionType", and it was wrong in a way that mattered: those are
     * the LEGACY `sectionType` members, the emitter always carried `shape`, and
     * the two vocabularies overlap in exactly one member. The legacy value is
     * derived from this field plus `steelProfileName` in `beamCreatedMirror.ts`.
     */
    readonly shape?: string;
    readonly width?: number;
    readonly depth?: number;
    readonly materialId?: string;
    /**
     * §FIX-BEAM-CEB-STEEL (L-974) — is this beam load-bearing, as COMMITTED.
     * Read by the IFC `LoadBearing` pset (`BeamReader.ts:23`), the beam schedule
     * (`ScheduleExtractor.ts:414`) and the fire-rating rule
     * (`RuleEngine.ts:1005`). `undefined` only when the handler committed no
     * value at all; the L0 default is `true`.
     */
    readonly loadBearing?: boolean;
    /** §FIX-BEAM-CEB-STEEL (L-974) — fire-resistance rating, as COMMITTED. */
    readonly fireRating?: string;
    /** §FIX-BEAM-CEB-STEEL (L-974) — the `SteelProfileLibrary` section name.
     *  `BeamFragmentBuilder.ts:253` gates its steel branch on this being
     *  present, so dropping it here rendered every copied steel beam as a box. */
    readonly steelProfileName?: string;
  };

  /** Fired after `door.create` or `door.batch.create` succeeds (Sprint A28/A29).
   *  `elementCount` is 1 for single create; N for batch. */
  'door.created': {
    readonly commandId: string;
    readonly commandType: 'door.create' | 'door.batch.create';
    readonly levelId: string;
    readonly elementCount: number;
  };

  /** Fired after `window.create` or `window.batch.create` succeeds (Sprint A28/A29).
   *  `elementCount` is 1 for single create; N for batch. */
  'window.created': {
    readonly commandId: string;
    readonly commandType: 'window.create' | 'window.batch.create';
    readonly levelId: string;
    readonly elementCount: number;
  };

  /** Fired after `stair.create` or `stair.batch.create` succeeds (Sprint A30).
   *  `elementCount` is 1 for single create; N for batch. */
  'stair.created': {
    readonly commandId: string;
    readonly commandType: 'stair.create' | 'stair.batch.create';
    readonly levelId: string;
    readonly elementCount: number;
  };

  /**
   * Fired after `lift.create` succeeds — §FEAT-LIFT-OBSERVATION-FRAME (L-9400),
   * C104 §13.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * ⭐ THIS EVENT CARRIES ONLY THE MEMBERS THAT HAVE NO FAMILY OF THEIR OWN.
   * ═══════════════════════════════════════════════════════════════════════════
   * A lift is a COMPOUND, and C104 §13.1 / the balcony's worked example fix the
   * idiom: a compound emits ONE MEMBER EVENT PER MEMBER, stamped with the MEMBER's
   * own verb, so the existing legacy mirrors treat each part exactly as if the
   * architect had drawn it by hand. `lift.create` therefore emits
   * `wall.created` for its opaque enclosure sides, `curtain-wall.created` for its
   * glass ones, and `wall.opening.created` for its landing doors — three channels
   * that already existed, already had live subscribers, and needed connecting
   * rather than inventing.
   *
   * ⚠ THE CABIN, THE FRAME AND THE RAILS HAVE NO SUCH CHANNEL, and that is a
   * DIFFERENT defect from the other three rather than more of the same. There is no
   * legacy `liftPart` family to mirror into and there was no fragment builder: the
   * thing was ABSENT, not unwired. This event is that missing channel, and it
   * carries exactly the members with nowhere else to go.
   *
   * ⛔ IT IS NOT A SECOND WAY TO DRAW THE ENCLOSURE. The walls and the glass are
   * drawn by their own families' builders from their own records. Emitting them
   * here as well would put two producers of one surface in the scene — z-fighting,
   * doubled transmission cost on the WebGL backend, and one id meaning two objects
   * (C84 EI-9).
   */
  'lift.created': {
    readonly commandId: string;
    readonly commandType: 'lift.create';
    /** The lift's BASE level — the storey it is anchored on and filed under. */
    readonly levelId: string;
    readonly liftId: string;
    /** Shaft footprint centre, world coordinates. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    /** Plan angle (radians about world Y). Local -Z is the LANDING side. */
    readonly rotation: number;
    readonly enclosureType?: string;
    /**
     * Car floor top face when parked, in metres RELATIVE TO THE LEVEL DATUM.
     * The cabin parts' `offsetY` is measured from this plane, so without it five
     * car-local boxes have no elevation to stand at. See C104 §4.
     */
    readonly carParkOffsetY: number;
    readonly mark?: string;
    /**
     * The committed `liftPart` records: the five cabin parts, the four corner
     * columns, the per-storey ring beams, the top-bay bracing and the guide rails.
     *
     * ⚠ READ OFF THE COMMIT, NOT THE REQUEST (ADR-002 §5). The frame geometry is
     * computed by `buildLiftAssembly` and is NOT in the command payload, which
     * carries only the origin, the served levels and the pre-minted ids — so an
     * event built from the payload would describe a lift that has no frame.
     */
    readonly parts: ReadonlyArray<{
      readonly id: string;
      readonly kind: string;
      readonly width: number;
      readonly depth: number;
      readonly height: number;
      readonly offsetY: number;
      readonly materialId?: string;
      readonly axis?: {
        readonly start: { readonly x: number; readonly y: number; readonly z: number };
        readonly end: { readonly x: number; readonly y: number; readonly z: number };
      };
    }>;
  };

  /** Fired after `ceiling.create` or `ceiling.batch.create` succeeds (Sprint A28/A29).
   *  `elementCount` is 1 for single create; N for batch.
   *  §P3.2-CL: `id`, `boundary`, `ceilingHeight`, `thickness` enriched for legacy-store bridge. */
  'ceiling.created': {
    readonly commandId: string;
    readonly commandType: 'ceiling.create' | 'ceiling.batch.create';
    readonly levelId: string;
    readonly elementCount: number;
    /** §P3.2-CL: ceiling element id (present for single ceiling.create only). */
    readonly id?: string;
    /** §P3.2-CL: Vec3[] boundary polygon in world-space XZ plane (y=0). */
    readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
    /** §P3.2-CL: ceiling height above level base in metres. */
    readonly ceilingHeight?: number;
    /** §P3.2-CL: ceiling slab thickness in metres. */
    readonly thickness?: number;
    /**
     * §FIX-CEILING-BRIDGE-FINISH (L-973) — the L0 `Ceiling.materialId`
     * (`Ceiling.ts:54`). Maps to legacy `CeilingFinishSpec.soffitMaterialId`.
     *
     * ⚠ On the schema and accepted by `CreateCeilingHandler` since it was
     * written; absent from this named subset, which is why the §P3.2-CL bridge
     * hardcoded the entire finish specification instead of reading one
     * (C84 EI-2a).
     */
    readonly materialId?: string;
    /** §FIX-CEILING-BRIDGE-FINISH (L-973) — the L0 `Ceiling.materialColor`
     *  (`Ceiling.ts:55`). Maps to legacy `CeilingFinishSpec.soffitColor`, the
     *  field `CeilingColourSystem.ts:38` colours the mesh from. */
    readonly materialColor?: string;
  };

  /** Fired after `ceiling.updateLayers` succeeds (TASK-12).
   *  Signals that a ceiling's system-type or layer stack has changed so
   *  FragmentBuilder subscribers can trigger a mesh rebuild. */
  'ceiling.layer-updated': {
    readonly commandId: string;
    readonly commandType: 'ceiling.updateLayers';
    readonly ceilingId?: string;
    readonly systemTypeId?: string;
    readonly layerCount: number;
    readonly thickness?: number;
  };

  /** Fired after `room.create` succeeds. */
  'room.created': {
    readonly commandId: string;
    readonly commandType: 'room.create';
    readonly levelId: string;
  };

  /** Fired after `grid.create` succeeds. */
  'grid.created': {
    readonly commandId: string;
    readonly commandType: 'grid.create';
    readonly levelId: string;
  };

  /** Fired after `handrail.create` succeeds. */
  'handrail.created': {
    readonly commandId: string;
    readonly commandType: 'handrail.create';
    readonly levelId: string;
    /** §FT-HANDRAIL (HANDRAIL-BUS-MIGRATION, C11 §11.9): geometry fields so the
     *  initTools §FT-HANDRAIL bridge can mirror the handrail into the legacy
     *  HandrailStore (HandrailFragmentBuilder mesh + plan-view projection).
     *  Present for the bus-dispatched plan-tool path. */
    readonly id?: string;
    readonly path?: ReadonlyArray<{ readonly x: number; readonly y?: number; readonly z: number }>;
    readonly height?: number;
    readonly diameter?: number;
    readonly shape?: string;
    readonly hostId?: string;
    readonly materialId?: string;
  };

  /** Fired after `furniture.create` succeeds. */
  'furniture.created': {
    readonly commandId: string;
    readonly commandType: 'furniture.create';
    readonly levelId: string;
    /** §FT-FURNITURE (FURNITURE-BUS-MIGRATION, C11 §11.10): geometry fields so the
     *  initTools §FT-FURNITURE bridge can mirror the item into the legacy
     *  FurnitureStore → furniture builder 3D mesh. */
    readonly id?: string;
    readonly furnitureType?: string;
    readonly position?: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotation?: number;
    readonly baseOffset?: number;
    readonly width?: number;
    readonly length?: number;
    readonly height?: number;
    readonly material?: string;
    /**
     * ⭐ C100 §2.1 / L-1460 — the MASTER catalogue id this furniture references.
     *
     * ⛔ Its absence was the first of five layers on which furniture's material had
     * nowhere to live. `material` above is the legacy FOUR-VALUE construction hint
     * (`wood|metal|fabric|glass`) against a master of 205 rows, and it is the field
     * the property inspector labels "Material" to the user — so the panel truthfully
     * reported that furniture has no material, because on this path it could not
     * have one. See `FurnitureTypes.ts` `materialId` for the full trace.
     */
    readonly materialId?: string;
    readonly color?: string;            // A.21.D4 — style-driven colour (hex)
    readonly furnitureCategory?: string;
    readonly kitchenConfig?: unknown;
    readonly wardrobeCabinetConfig?: unknown;
  };

  /** Fired after `lighting.create` succeeds. */
  'lighting.created': {
    readonly commandId: string;
    readonly commandType: 'lighting.create';
    readonly levelId: string;
    /** §FT-LIGHTING (LIGHTING-BUS-MIGRATION, C11 §11.11): geometry fields so the
     *  initTools §FT-LIGHTING bridge can mirror the fixture into the legacy
     *  LightingStore (LightingFragmentBuilder 3D mesh). */
    readonly id?: string;
    readonly kind?: string;
    readonly origin?: { readonly x: number; readonly y: number; readonly z: number };
  };

  /** Fired after `plumbing.create` succeeds. */
  'plumbing.created': {
    readonly commandId: string;
    readonly commandType: 'plumbing.create';
    readonly levelId: string;
  };

  /** Fired after `structural.create` succeeds. */
  'structural.created': {
    readonly commandId: string;
    readonly commandType: 'structural.create';
    readonly levelId: string;
  };

  /** Fired after `annotation.create` succeeds. */
  'annotation.created': {
    readonly commandId: string;
    readonly commandType: 'annotation.create';
    readonly levelId: string;
  };

  /** Fired after `dimension.create` succeeds. */
  'dimension.created': {
    readonly commandId: string;
    readonly commandType: 'dimension.create';
    readonly levelId: string;
  };

  /** Fired after `roof.create` succeeds.
   *  §P3.2-RF: `id`, `boundary`, `shape`, `overhang`, `thickness` enriched for legacy-store bridge.
   *  §FT6 / BUG-6: `baseOffset` added so the initTools bridge forwards the caller-supplied value
   *  instead of ignoring it (the hardcoded 2.7 fallback was hiding the real command value).
   *  The legacy bridge in `initTools.ts` recomputes `footprint.{polygon, centroid}` for
   *  `RoofFragmentBuilder` which still reads from the legacy `RoofStore`. */
  'roof.created': {
    readonly commandId: string;
    readonly commandType: 'roof.create';
    readonly levelId: string;
    /** §P3.2-RF: roof element id (present for single roof.create only). */
    readonly id?: string;
    /** §P3.2-RF: Vec3[] boundary polygon in world-space XZ plane (y=0). */
    readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
    /** §P3.2-RF: roof shape variant (e.g. 'flat', 'gable', 'hip'). */
    readonly shape?: string;
    /** §P3.2-RF: roof overhang distance in metres. */
    readonly overhang?: number;
    /** §P3.2-RF: roof slab thickness in metres. */
    readonly thickness?: number;
    /**
     * §FIX-ROOF-PLAN-SHAPE-HARDCODED (L-699) — roof pitch in RADIANS, as the L0
     * `Roof` schema stores it.
     *
     * ⚠ It was absent, and the absence was structural: the legacy-store bridge in
     * `initTools.ts` had no pitch to forward, so `RoofStore.slope` was always
     * undefined and a roof created from the PLAN surface could never slope, no
     * matter what the user selected. Optional and additive — an emitter that does
     * not set it leaves the bridge on its previous defaults exactly as before.
     */
    readonly pitch?: number;
    /** §FT6 / BUG-6: base elevation offset (metres above level datum). Forwarded from
     *  CreateRoofCommand.payload.baseOffset so the roof mesh sits at the correct height.
     *  Falls back to 2.7 in the bridge when omitted (legacy behaviour). */
    readonly baseOffset?: number;
    /**
     * §ROOF-FOLLOWS-WALL (L-924) — the walls whose centrelines produced this
     * roof's footprint, when it was drawn in REGION mode.
     *
     * ⚠ Its absence was STRUCTURAL, in the same shape as `pitch` above. The
     * plan handler traced the region, reported the attribution, and dispatched
     * without it; the bridge re-emits a named subset of `record.payload`, so
     * even a corrected dispatch would have been dropped here. With no
     * attribution in the event, the §P3.2-RF mirror in `initTools.ts` had none
     * to store, so a region roof drawn in PLAN could never follow its walls
     * while one drawn in 3D could — the per-path divergence C79 §7.4 rates as
     * worse than uniform absence.
     *
     * `undefined` = not region-traced (rectangle / polyline). NEVER `[]` for
     * that case: `[]` means "traced, and bounded by no wall".
     */
    readonly boundingWallIds?: readonly string[];
  };

  /** Fired after `floor.create` succeeds.
   *  §P3.2-FL: full geometry payload enriched for the legacy-store bridge.
   *  The bridge in `initTools.ts` reconstructs a `FloorData` and calls `floorStore.add()`
   *  which triggers the `bim-floor-add` DOM event → `FloorFragmentBuilder` mesh render.
   *  §TODO(F.1.x): remove bridge and this event when FloorFragmentBuilder reads the Immer store. */
  /** Fired after `floor.updateLayers` succeeds (TASK-12).
   *  Signals that a floor's system-type or layer stack has changed so
   *  FragmentBuilder subscribers can trigger a mesh rebuild. */
  'floor.layer-updated': {
    readonly commandId: string;
    readonly commandType: 'floor.updateLayers';
    readonly floorId?: string;
    readonly systemTypeId?: string;
    readonly layerCount: number;
    readonly thickness?: number;
  };

  'floor.created': {
    readonly commandId: string;
    readonly commandType: 'floor.create';
    readonly levelId: string;
    /** §P3.2-FL: floor element id. */
    readonly floorId?: string;
    /** §P3.2-FL: IFC GUID for round-trip stability. */
    readonly ifcGuid?: string;
    /** §P3.2-FL: CCW boundary polygon in world-space XZ plane (y=0). */
    readonly polygon?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
    /** §P3.2-FL: Y offset above level datum in metres. */
    readonly baseOffset?: number;
    /** §P3.2-FL: assembly thickness in metres. */
    readonly thickness?: number;
    /** §P3.2-FL: display label. */
    readonly label?: string;
    readonly systemTypeId?: string;
    readonly layers?: ReadonlyArray<unknown>;
    readonly finishSpec?: Readonly<Record<string, unknown>>;
    readonly serviceHoles?: ReadonlyArray<unknown>;
    readonly hostSlabId?: string;
    readonly hostRoomId?: string;
    readonly createdBy?: string;
  };

  /**
   * §POOL95 — THE WATER BODY OF A SWIMMING POOL (ADR-0124 §4, L-9941).
   *
   * ⭐ THE CHANNEL `CommandEventBridge` NAMED AS MISSING, IN THOSE WORDS. Its
   * `pool.create` case has been printing *"'water' has no typed event, no
   * subscriber and no mesh builder anywhere in the tree; the basin renders and
   * the water in it does not"* on every pool a person creates. This is the typed
   * event; the subscriber and the builder land with it, because any one of the
   * three alone leaves the sentence true.
   *
   * ⛔ NOT `slab.created` WITH A BLUE MATERIAL, AND THE REFUSAL IS LOAD-BEARING.
   * ADR-0124 §4 decided water is its own family on three independent arguments,
   * the decisive one being mechanical: a slab's thickness grows DOWN from its
   * top, so a "water slab" couples the water SURFACE to the pool FLOOR and
   * "the water level sits below the coping" becomes UNREPRESENTABLE. Smuggling
   * water through the slab channel to make something blue appear would also put
   * one id on two families (C84 EI-9) and add 8 m² of concrete to the building's
   * gross floor area (§4.2). The bridge already refuses this in prose; the
   * existence of this event is what makes the refusal affordable.
   *
   * ⚠ `surfaceElevation` / `bottomElevation` ARE ABSOLUTE WORLD-Y, NOT OFFSETS,
   * and they are carried separately for the same reason they are stored
   * separately: the whole point of the family is that the two move independently.
   * A consumer that re-derives one from the other plus a thickness has rebuilt
   * the blue slab inside the renderer.
   */
  'water.created': {
    readonly commandId: string;
    readonly commandType: string;
    readonly levelId: string;
    /** The water record's own id — also its mesh id and its selection id. */
    readonly waterId: string;
    /** The owning pool. Stamped as `parentId` so a click resolves to the pool (C15 §12). */
    readonly poolId?: string;
    /** Water-surface plan outline, WORLD coordinates, OPEN loop (no repeated vertex). */
    readonly boundary?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>;
    /** ABSOLUTE world-Y of the water's top face. */
    readonly surfaceElevation?: number;
    /** ABSOLUTE world-Y of the water's underside (= the pool floor's top face). */
    readonly bottomElevation?: number;
    /** Authored render intent, already resolved through the three-tier chain. */
    readonly color?: string;
    readonly opacity?: number;
  };

  // ── F.events.1: Engine + Collaboration + IFC domain events ───────────────
  // Phase F.events.1 structural pass — adds typed entries for all TASK-15 and
  // TASK-12 tagged CustomEvent dispatches in apps/editor/src/engine/*.
  // These entries are the foundation for F.events.2a migration waves that
  // replace DOM-level CustomEvent dispatches with runtime.events.emit().
  // Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5
  // Trajectory: 297 apps-tier sites → 0 via F.events.2a–2c migration waves.

  // ── Collaboration presence (TASK-15 / initCollaboration.ts) ──────────────

  /** Emitted when a remote collaborator's socket joins the project room.
   *  Replaces TASK-15 DOM-level `pryzm-presence-added` dispatch in initCollaboration.ts.
   *  Consumed by PresenceStrip in PlatformShell. */
  'pryzm-presence-added': {
    readonly userId: string;
    readonly displayName?: string;
    /** CSS hex colour assigned to this collaborator's cursor. */
    readonly color: string;
  };

  /** Emitted when a remote collaborator's socket disconnects from the room.
   *  Replaces TASK-15 `pryzm-presence-removed` CustomEvent. */
  'pryzm-presence-removed': {
    readonly userId: string;
  };

  /** Emitted when the socket disconnects (all remote presences invalidated).
   *  Replaces TASK-15 `pryzm-presence-cleared` CustomEvent. */
  'pryzm-presence-cleared': Record<string, never>;

  /** Emitted after a remote collaborator's command is received and dispatched.
   *  `payload` carries the raw SerializedCommand (command-registry owns its
   *  type mapping).  Extra server-side keys are folded into `Record<string, unknown>`.
   *  Replaces TASK-15 `pryzm-remote-command` CustomEvent. */
  'pryzm-remote-command': Record<string, unknown>;

  // ── Visibility-intent remote sync (TASK-15 / initCollaboration.ts) ────────

  /** Emitted after a remote `vi:intent-updated` socket event has been merged
   *  into the local visibilityIntentStore.  Replaces the TASK-15 CustomEvent. */
  'vi:intent-remote-synced': {
    readonly intentId: string;
  };

  /** Emitted after a remote `vi:instance-updated` socket event has been
   *  applied to the local viewIntentInstanceStore. */
  'vi:instance-remote-synced': {
    readonly projectId: string;
    readonly viewId: string;
    readonly intentId?: string;
  };

  /** Emitted after a remote `vi:overrides-cleared` event has been applied
   *  to the local viewIntentInstanceStore. */
  'vi:overrides-remote-cleared': {
    readonly projectId: string;
    readonly viewId: string;
  };

  /** Emitted locally (from `vi:override-set` socket handler) to force a
   *  cache invalidation on the affected view's drawing. */
  'vi:instance-updated': {
    readonly viewId: string;
    readonly instanceId: string;
  };

  /** Emitted after a remote `vi:override-set` socket event is received.
   *  Downstream consumers re-fetch the affected view's overrides. */
  'vi:remote-override-set': {
    readonly projectId: string;
    readonly viewId: string;
  };

  // ── Split-view events (TASK-15 / SplitViewManager.ts) ────────────────────

  /** Emitted by SplitViewManager.activate() — signals that the 2-pane
   *  Canvas2D + 3D split layout has become active. */
  'split-view-activated': Record<string, never>;

  /** Emitted by SplitViewManager.deactivate() — split layout torn down. */
  'split-view-deactivated': Record<string, never>;

  /** Emitted whenever the drag-divider ratio changes or the split-view is
   *  activated/deactivated.  `splitRatio` is 0 when deactivated. */
  'split-view-layout-changed': {
    readonly splitRatio: number;
  };

  /** Emitted when the active plan view inside the 2D pane changes.
   *  `viewId` is `null` when the split-view is deactivated. */
  'split-view-view-changed': {
    readonly viewId: string | null;
  };

  // ── View lifecycle events (TASK-15 / ViewController.ts) ──────────────────

  /** Emitted by ViewController after every successful view activation
   *  (3D ↔ plan ↔ section ↔ elevation switch).  `view` is the raw OBC view
   *  instance; `camera` is the THREE.Camera at dispatch time.
   *  Replaces the TASK-15 `view-activated` CustomEvent. */
  'view-activated': {
    readonly view: object;
    readonly mode: string;
    readonly type: string;
    readonly source: string;
    readonly camera: object;
  };

  /** Emitted immediately after `view-activated`, carrying the stable
   *  ViewDefinition id (or `null` for the 3D view).
   *  Also emitted by the OBC viewpoints panel with an OBC View object
   *  (`view` field) instead of a ViewDefinition id — consumers should
   *  check whichever field they need.
   *  Replaces the TASK-15 `view-selected` CustomEvent. */
  'view-selected': {
    readonly viewId?: string | null;
    /** OBC View object, carried by the initViewpointsPanel dispatch path. */
    readonly view?: object;
  };

  /** Emitted when a Canvas2D plan view was requested but no ViewDefinition
   *  is available.  Consumers can show a warning or fall back.
   *  Replaces the TASK-15 `plan-view-unavailable` CustomEvent. */
  'plan-view-unavailable': {
    readonly reason: string;
    readonly disabled: boolean;
    readonly hasSafePath: boolean;
  };

  /** Emitted by ViewController after a background 2D projection for a
   *  section/elevation view completes.  SVP tool overlays listen to refresh.
   *  Replaces the TASK-15 `svp:drawing-refreshed` CustomEvent. */
  'svp:drawing-refreshed': {
    readonly viewId: string;
  };

  // ── Plan-view interaction events (TASK-15 / PlanViewInteraction.ts) ───────

  /** Emitted after the floor-plan underlay mesh position is committed by a
   *  drag gesture in the plan view.  `x` / `z` are world-space coordinates.
   *  Replaces the TASK-15 `underlay:transform-changed` CustomEvent. */
  'underlay:transform-changed': {
    readonly x: number;
    readonly z: number;
  };

  /** Emitted when an element (annotation, furniture, etc.) is selected in
   *  the plan view.  `annotationId` is only present for annotation hits.
   *  Replaces the TASK-15 `pryzm-element-selected` CustomEvent. */
  'pryzm-element-selected': {
    readonly elementId: string;
    readonly elementType?: string;
    readonly annotationId?: string;
    readonly source: string;
  };

  /** Emitted when a level datum line or level head is clicked in the plan view.
   *  `level` carries the raw level store record (shape varies by store version).
   *  Replaces the TASK-15 `pryzm-level-selected` CustomEvent. */
  'pryzm-level-selected': {
    readonly levelId: string;
    readonly level?: Record<string, unknown>;
    readonly source: string;
  };

  /** Emitted when a grid line label is clicked in the plan view.
   *  `grid` carries the raw grid store record.
   *  Replaces the TASK-15 `pryzm-grid-selected` CustomEvent. */
  'pryzm-grid-selected': {
    readonly gridId: string;
    readonly grid?: Record<string, unknown>;
    readonly source: string;
  };

  // ── IFC / Rhino import events (TASK-12 / initUI.ts) ──────────────────────

  /** Emitted after IFC selectables are registered for a model.
   *  Replaces the TASK-12 `pryzm-ifc-ready` CustomEvent. */
  'pryzm-ifc-ready': {
    readonly modelId: string;
    readonly selectableCount: number;
  };

  /** Emitted when a feature gate check fails (e.g. IFC export on a free plan).
   *  `feature` is the canonical feature key; `plan` is the plan that blocks it.
   *  Replaces the TASK-12 `pryzm-upgrade-required` CustomEvent. */
  'pryzm-upgrade-required': {
    readonly feature: string;
    readonly reason?: string;
    readonly plan?: string;
  };

  // 'pryzm-ifc-native-conversion-complete' and 'pryzm-ifc-imported' defined
  // with precise types in the F.events.13 block below (duplicate removed).

  /** Emitted after the IFC spatial tree needs to refresh (model added/removed). */
  'pryzm-ifc-tree-updated': Record<string, never>;

  /** Emitted after a Rhino file has been parsed and loaded into the scene.
   *  Replaces the TASK-12 `pryzm-rhino-imported` CustomEvent. */
  'pryzm-rhino-imported': {
    readonly modelId: string;
    readonly fileName: string;
  };

  // ── AI preview-window events (TASK-12 / PreviewManager.ts) ───────────────

  /** Emitted by PreviewManager when a design proposal is displayed as ghost meshes.
   *  `count` is the number of elements shown; `elements` is the schema array. */
  'pvw-proposal-shown': {
    readonly count: number;
    readonly elements: readonly object[];
  };

  /** Emitted by PreviewManager when the user accepts all ghost proposals. */
  'pvw-proposals-accepted': {
    readonly elements: readonly object[];
  };

  /** Emitted by PreviewManager when the user declines all ghost proposals. */
  'pvw-proposals-declined': Record<string, never>;

  /** Emitted by PreviewManager when a single element's proposal accept falls back
   *  (partial accept — element could not be created via bus command). */
  'pvw-element-accept-fallback': Record<string, unknown>;

  // ── WorkspaceController inspect events (TASK-15 / WorkspaceController.ts) ─

  /** Emitted by WorkspaceController / BottomActionMenu when the inspect-mode
   *  level-explode mode or solo level changes.
   *  Replaces the TASK-15 `pryzm-inspect-level-explode` CustomEvent. */
  'pryzm-inspect-level-explode': {
    readonly mode: string;
    readonly soloLevelId?: string;
    readonly source?: string;
  };

  /** Emitted by WorkspaceController when the active inspect lens is changed.
   *  Replaces the TASK-15 `pryzm-set-inspect-lens` CustomEvent. */
  'pryzm-set-inspect-lens': {
    readonly lens: string;
  };

  /** Emitted by WorkspaceController when the Z-slicer clip-plane percentage changes.
   *  `pct` is in the range 0..1 where 1 means no clipping.
   *  Replaces the TASK-15 `pryzm-zslicer-change` CustomEvent. */
  'pryzm-zslicer-change': {
    readonly pct: number;
  };

  /** Emitted by AuditStack / DiscoveryModeZone when the inspect panel enters
   *  discovery mode (no brief set — showing measured room values).
   *  `rooms` is the current snapshot from roomStore; `elementType` is the
   *  active element-type filter (defaults to 'rooms' when omitted).
   *  Replaces the TASK-15 `pryzm-inspect-discovery` CustomEvent.
   *  F.events.5 — 2026-05-16 */
  'pryzm-inspect-discovery': {
    readonly rooms: ReadonlyArray<{ id: string; area: number; [key: string]: unknown }>;
    readonly elementType?: string;
  };

  // ── F.events.6 — 2026-05-16 — inspect-mode family (workspace + delta + room/element/attribute focus) ──

  /** Emitted by WorkspaceController.setMode() / restoreFromStorage() on every
   *  workspace mode transition (`'author' | 'inspect' | 'data'`).
   *  Replaces the TASK-15 `pryzm-workspace-mode` CustomEvent.
   *  F.events.6 — 2026-05-16 */
  'pryzm-workspace-mode': {
    readonly mode: string;
  };

  /** Emitted by ComparisonEngine._emit() after every delta recalculation.
   *  Consumers should call `comparisonEngine.getDeltaMap()` directly for the
   *  latest snapshot; the `deltaMap` hint in the payload is untyped because
   *  DeltaMap lives in apps/ and cannot be imported from packages/.
   *  Replaces the TASK-15 `pryzm-delta-updated` CustomEvent.
   *  F.events.6 — 2026-05-16 */
  'pryzm-delta-updated': {
    readonly deltaMap: unknown;
  };

  /** Emitted when the user clicks a room in the inspect panel (AuditGridZone,
   *  ProjectTreeZone, DiscoveryModeZone, RoomTool).  InspectModeCoordinator
   *  subscribes to re-apply the jewel highlight on the selected room mesh.
   *  Replaces the TASK-15 `pryzm-inspect-room-focus` CustomEvent.
   *  F.events.6 — 2026-05-16 */
  'pryzm-inspect-room-focus': {
    readonly roomId: string;
  };

  /** §HILITE140 (L-12292), 2026-08-26 — emitted by the Analysis relationship
   *  graph card (`analysisRelatedHighlight.ts`) whenever the selection changes,
   *  carrying the CURRENT relationship view's neighbourhood: every related
   *  element id, mapped to its own hop distance (1 = direct neighbour, 2 = a
   *  neighbour of a neighbour, …). `InspectModeCoordinator` subscribes and
   *  forwards it to `diagnosticMaterialManager.setAnalysisRelated()`, which
   *  ramps the colour/opacity lighter as the hop grows — a DELIBERATELY
   *  SEPARATE event from `pryzm-audit-room-select`/`selectionBus`: those carry
   *  "what is selected", this carries "what the graph says is related to it",
   *  and the two are computed by different producers (a click vs. a BFS). An
   *  empty `hops` array means "nothing selected, or nothing related" — both
   *  clear the ramp, which is the honest rendering of either fact. */
  'pryzm-analysis-related-elements': {
    readonly hops: ReadonlyArray<readonly [string, number]>;
  };

  /** Emitted by AuditStack when the element-type dropdown changes.
   *  InspectModeCoordinator subscribes to toggle room-lens ↔ ghost-with-focus.
   *  Replaces the TASK-15 `pryzm-inspect-element-type` CustomEvent.
   *  F.events.6 — 2026-05-16 */
  'pryzm-inspect-element-type': {
    readonly elementType: string;
  };

  /** Emitted by AuditGridZone when the user clicks a column header to focus an
   *  attribute key.  InspectModeCoordinator subscribes to apply the heatmap
   *  overlay colours on top of the ghost-with-focus base.
   *  Replaces the TASK-15 `pryzm-inspect-attribute-focus` CustomEvent.
   *  F.events.6 — 2026-05-16 */
  'pryzm-inspect-attribute-focus': {
    readonly elementType: string;
    readonly attributeKey: string;
    readonly heatmap: ReadonlyArray<{ readonly id: string; readonly value: number; readonly color?: string }>;
  };

  // ── F.events.9 — 2026-05-16 — pryzm-project-loaded ──

  /** Fired by PlatformShell (×3) and PlatformVersionController (×1) once a
   *  project snapshot has been fully loaded into the BIM scene.  The `empty`
   *  flag is `true` for blank/error paths (no geometry).
   *  Replaces the TASK-15 `pryzm-project-loaded` CustomEvent.
   *  F.events.9 — 2026-05-16 */
  'pryzm-project-loaded': {
    readonly projectId: string;
    readonly projectName: string;
    readonly empty?: boolean;
  };

  // ── F.events.8 — 2026-05-16 — view-activated + view-selected + model-updated + bim-tool-changed ──

  /** Emitted whenever the model geometry changes and UI panels should refresh.
   *  No payload — consumers invoke their own refresh logic.
   *  Replaces the TASK-12/TASK-15 `model-updated` CustomEvent.
   *  F.events.8 — 2026-05-16 */
  'model-updated': Record<string, never>;

  /** Emitted by furniture tool handlers (KitchenCabinetTool, WardrobeCabinetTool)
   *  when a placement tool is activated or deactivated.  `tool` is the tool
   *  identifier string, or `null` when the tool is deactivated.
   *  Replaces the TASK-11 `bim-tool-changed` CustomEvent.
   *  F.events.8 — 2026-05-16 */
  'bim-tool-changed': {
    readonly tool: string | null;
  };

  // ── F.events.7 — 2026-05-16 — DataWorkbench navigation + split-view family ──

  /** Emitted by any DataWorkbench panel row/node click to navigate to and
   *  highlight the corresponding element.  Different dispatch sites use
   *  different identifier keys by convention (`id`, `nodeId`, `elementId`);
   *  all are carried as optional fields on a single unified payload so
   *  consumers can check whichever key they expect.
   *  Replaces the TASK-15 `pryzm-workbench-select` CustomEvent.
   *  F.events.7 — 2026-05-16 */
  'pryzm-workbench-select': {
    readonly id?: string;
    readonly nodeId?: string;
    readonly elementId?: string;
    readonly type?: string;
    readonly nodeType?: string;
    readonly elementType?: string;
    readonly label?: string;
    readonly source?: string;
    readonly roomId?: string;
  };

  // ── F.events.10 — 2026-05-16 — SVP tool-focus/blur, viewpoints, vpt-mode, stair-path, operations ──

  /** Emitted by SvpPlanToolOverlay when the SVP canvas gains mouse focus while a
   *  plan tool is active.  PlanViewToolOverlay listens to pause its own handler so
   *  only one pane processes pointer events at a time.
   *  Replaces the TASK-15 `svp:tool-focus` CustomEvent.  F.events.10 — 2026-05-16 */
  'svp:tool-focus': Record<string, never>;

  /** Emitted by SvpPlanToolOverlay when the SVP canvas loses mouse focus.
   *  PlanViewToolOverlay resumes its handler on receipt.
   *  Replaces the TASK-15 `svp:tool-blur` CustomEvent.  F.events.10 — 2026-05-16 */
  'svp:tool-blur': Record<string, never>;

  /** Emitted (conceptually) by PlanViewToolOverlay to acknowledge that its handler
   *  has been paused following a `svp:tool-focus` signal.  SvpPlanToolOverlay
   *  listens to confirm the handoff is complete.
   *  Structural type only — no active dispatch site in apps/.
   *  F.events.10 — 2026-05-16 */
  'svp:tool-focus-ack': Record<string, never>;

  /** Emitted when the OBC Viewpoints table should refresh its data.
   *  Replaces the TASK-15 `update-viewpoints` CustomEvent.  F.events.10 — 2026-05-16 */
  'update-viewpoints': Record<string, never>;

  /** Emitted when the OBC Views table should refresh its data.
   *  Replaces the TASK-15 `update-views` CustomEvent.  F.events.10 — 2026-05-16 */
  'update-views': Record<string, never>;

  /** Emitted when the viewport path-tracer (VPT) render mode is activated or
   *  deactivated.  `active: true` means the path tracer is running; `false` means
   *  it has been disabled (either manually or via auto-exit on model edit).
   *  Replaces the TASK-12 `vpt-mode-changed` CustomEvent.  F.events.10 — 2026-05-16 */
  'vpt-mode-changed': {
    readonly active: boolean;
  };

  /** Emitted by the platform toolbar "Data" button to toggle the DataWorkbench
   *  panel open or closed.
   *  Replaces the TASK-15 `pryzm-toggle-workbench` CustomEvent.  F.events.10 — 2026-05-16 */
  'pryzm-toggle-workbench': Record<string, never>;

  /** Emitted by StairPathPlanToolHandler when the stair-path drawing tool is
   *  activated on a plan view.
   *  Replaces the TASK-15 `stair-path-tool:activated` CustomEvent.  F.events.10 — 2026-05-16 */
  'stair-path-tool:activated': Record<string, never>;

  /** Emitted by StairPathPlanToolHandler when the stair-path drawing tool is
   *  deactivated (tool switch, ESC, or panel close).
   *  Replaces the TASK-15 `stair-path-tool:deactivated` CustomEvent.  F.events.10 — 2026-05-16 */
  'stair-path-tool:deactivated': Record<string, never>;

  /** Emitted when a BIM multi-step operation (e.g. Align) is cancelled by the
   *  user.  `operationId` identifies the operation that was cancelled so
   *  subscribers can ignore unrelated events.
   *  Replaces the TASK-11 `bim-operation-cancelled` CustomEvent.  F.events.10 — 2026-05-16 */
  'bim-operation-cancelled': {
    readonly operationId: string;
  };

  // ── F.events.11 — render-queue job lifecycle + import triggers ─────────────

  /** Emitted by PanoramaPanel and RenderPanel when a long-running render job
   *  begins.  RenderQueuePanel listens to create a job row in the queue UI.
   *  `type` is one of the three known render modes; narrowed here to avoid a
   *  package→app dependency on RenderQueuePanel's `RenderJobType` alias.
   *  Replaces the TASK-12 `rq-job-start` CustomEvent.  F.events.11 — 2026-05-16 */
  'rq-job-start': {
    readonly id:   string;
    readonly name: string;
    readonly type: 'render' | 'panorama' | 'video';
  };

  /** Emitted periodically during a render job to report progress.
   *  `pct` is 0–100; `status` is a human-readable stage description.
   *  Replaces the TASK-12 `rq-job-progress` CustomEvent.  F.events.11 — 2026-05-16 */
  'rq-job-progress': {
    readonly id:     string;
    readonly pct:    number;
    readonly status: string;
  };

  /** Emitted by PanoramaPanel, RenderPanel, or VideoExportPanel when a render
   *  job finishes successfully.
   *  Replaces the TASK-12 `rq-job-complete` CustomEvent.  F.events.11 — 2026-05-16 */
  'rq-job-complete': {
    readonly id: string;
  };

  /** Emitted when a render job fails or is cancelled by the user.
   *  `error` carries a human-readable failure reason.
   *  Replaces the TASK-12 `rq-job-error` CustomEvent.  F.events.11 — 2026-05-16 */
  'rq-job-error': {
    readonly id:    string;
    readonly error: string;
  };

  /** Emitted (signal only — no payload) to trigger the IFC file-picker flow.
   *  initUI.ts listens and opens the browser file-input + import-mode dialog.
   *  Replaces the TASK-11/12 `import-ifc` CustomEvent.  F.events.11 — 2026-05-16 */
  'import-ifc': Record<string, never>;

  /** Emitted to trigger the Revit-guided import wizard + IFC file picker.
   *  initUI.ts listens and shows RevitWizardPanel before opening the picker.
   *  Replaces the TASK-11/12 `import-revit-guided` CustomEvent.  F.events.11 — 2026-05-16 */
  'import-revit-guided': Record<string, never>;

  /** Emitted to trigger the Rhino .3DM file picker.
   *  initUI.ts listens and opens the browser file-input for .3dm files.
   *  Replaces the TASK-11/12 `import-rhino` CustomEvent.  F.events.11 — 2026-05-16 */
  'import-rhino': Record<string, never>;

  /** Emitted to trigger the DXF overlay import flow (toggles the DXF panel).
   *  NavigationAreaLayout listens and calls ai.toggleDxfPanel().
   *  Replaces the TASK-11/12 `import-dxf` CustomEvent.  F.events.11 — 2026-05-16 */
  'import-dxf': Record<string, never>;

  // ── F.events.12 — 2026-05-16 ─────────────────────────────────────────────
  // NOTE: 'pryzm-upgrade-required' type already declared above (F.events.2d).

  /** Signal-only event — navigate the platform shell back to the Project Hub.
   *  PlatformRouter, PlatformCollabPill, and initCollaboration all listen.
   *  Replaces the TASK-15 `pryzm-go-hub` CustomEvent. */
  'pryzm-go-hub': Record<string, never>;

  /** Emitted by audit zone components (AuditGridZone, DiscoveryModeZone,
   *  ProjectTreeZone) when the user selects a room/element in the audit grid.
   *  AuditStack listens to synchronise the tree view selection.
   *  `source` discriminates the originating zone so AuditStack can avoid
   *  re-rendering when the select came from its own tree.
   *  Replaces the TASK-15 `pryzm-audit-room-select` CustomEvent. */
  'pryzm-audit-room-select': {
    readonly roomId: string;
    readonly source: string;
  };

  /** Emitted by RailPanelController whenever a rail panel is opened, closed,
   *  or its pin state changes.  ProjectBrowserPanel listens to refresh toolbar
   *  button states.
   *  Replaces the TASK-15 `pryzm-rail-panel-state-changed` CustomEvent. */
  'pryzm-rail-panel-state-changed': {
    readonly activeId: string | null;
    readonly pinned: boolean;
  };

  /** Emitted by AICreatePanel and Step6CommitView when a new command proposal
   *  is ready for review.  AIPanel listens and renders an inline proposal card.
   *  `proposal` is typed `unknown` to avoid a package→app circular dependency
   *  on the AIProposal shape in apps/editor.
   *  Replaces the TASK-11/12 `ai-proposal-added` CustomEvent. */
  'ai-proposal-added': {
    readonly proposal: unknown;
  };

  /** Signal-only event — emitted after a command proposal is successfully
   *  applied (AIPanel, ValidatePanel).  AIPanel listens as a hook for any
   *  post-apply refresh logic.
   *  Replaces the TASK-12 `ai-model-update` CustomEvent. */
  'ai-model-update': Record<string, never>;

  /** Emitted by AICreatePanel step 4 to instruct the containing AI panel
   *  layout to switch to the given tab by name.
   *  AIAreaLayout listens and triggers the tab button click.
   *  Replaces the TASK-11 `ai-switch-tab` CustomEvent. */
  'ai-switch-tab': {
    readonly tab: string;
  };

  /** Signal-only event — emitted alongside `ai-model-update` after a proposal
   *  is applied, to notify the view browser to refresh its scene thumbnail.
   *  No listener currently registered via window; kept as typed signal for
   *  future view-browser refresh subscriber.
   *  Replaces the TASK-12 `update-view-browser` CustomEvent. */
  'update-view-browser': Record<string, never>;

  /** Signal-only event — emitted when the furniture carousel panel is hidden
   *  (via X button, Escape, or programmatic setVisible(false)).
   *  CreatePanelLayout listens to pop the carousel-mode nav stack layer.
   *  Replaces the TASK-15 `furniture-carousel-hidden` CustomEvent. */
  'furniture-carousel-hidden': Record<string, never>;

  /** Emitted when the user begins dragging a furniture item over the 3-D canvas.
   *  FurnitureDragDropHandler listens to activate the drop-preview indicator.
   *  `furnitureType` is either a parametric type key or a GLB file path.
   *  Replaces the TASK-15 `fc-drag-start` CustomEvent. */
  'fc-drag-start': {
    readonly furnitureType: string;
  };

  /** Signal-only event — emitted when a furniture drag gesture ends (drop,
   *  pointer-up, or dragend).  FurnitureDragDropHandler listens to clean up
   *  the preview indicator mesh.
   *  Replaces the TASK-15 `fc-drag-end` CustomEvent. */
  'fc-drag-end': Record<string, never>;

  /** Emitted when a GLB catalog item is dropped onto or click-placed on the
   *  3-D canvas.  CreatePanelLayout listens and calls addFurniture().
   *  `label` is optional (omitted on plain drag-drop, present on click-place).
   *  `position` is the world-space hit point; dispatchers guarantee non-null.
   *  Replaces the TASK-15 `fc-add-glb` CustomEvent. */
  'fc-add-glb': {
    readonly path: string;
    readonly label?: string;
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    /**
     * §FEAT-PLACEMENT-SPACEBAR-ROTATE (ADR-0105) — pre-placement yaw (radians,
     * about world-up Y) chosen by pressing SPACE during click-to-place. Optional
     * / defaults to 0 so plain drag-drop (no preview rotation) is unaffected.
     */
    readonly rotationY?: number;
  };

  /** Emitted by FurnitureSidePanel when the user clicks a GLB catalog card to
   *  enter click-to-place mode.  FurnitureDragDropHandler listens to arm the
   *  pointer-move / pointer-down placement handlers on the canvas.
   *  Replaces the TASK-15 `fc-place-glb-start` CustomEvent. */
  'fc-place-glb-start': {
    readonly path: string;
    readonly label?: string;
    /**
     * §FIX-PLACEMENT-PREVIEW (L-21) — the catalog descriptor's declared
     * placement footprint (metres). FurnitureDragDropHandler builds the
     * click-to-place ghost from these dims so the preview matches the item's
     * real size instead of a fixed 1×1×1 m box — critical when the GLB 404s and
     * the ghost is the only size cue the user gets. Optional so any legacy
     * emitter still works (falls back to the 1 m block).
     */
    readonly dimensions?: {
      readonly width: number;
      readonly length: number;
      readonly height: number;
      readonly baseOffset?: number;
    };
  };

  // ── F.events.13 — 2026-05-16 ─────────────────────────────────────────────
  // Underlay / floor-plan family, DXF overlay family, import-manager + IFC family.

  /** Emitted when the user triggers the 3-point reference-scale gesture for a
   *  floor-plan underlay (from ContextualEditBar, PropertyPanelElementRenderers,
   *  or the FloorPlanDOMBuilder controls bar 'S' key / scale button).
   *  `underlayTool` is the active FloorPlanUnderlayTool instance; typed as
   *  `unknown` to avoid a package→app circular dependency.
   *  Replaces the TASK-15 `underlay:reference-scale-activate` CustomEvent. */
  'underlay:reference-scale-activate': {
    readonly underlayTool: unknown;
  };

  /** Emitted when the user triggers the 3-point reference-rotate gesture for a
   *  floor-plan underlay (ContextualEditBar rotate button / R key).
   *  Replaces the TASK-15 `underlay:reference-rotate-activate` CustomEvent. */
  'underlay:reference-rotate-activate': {
    readonly underlayTool: unknown;
  };

  /** Signal-only — emitted when the floor-plan underlay is unlocked for
   *  free dragging (ContextualEditBar move button).
   *  Replaces the TASK-15 `underlay:move-activated` CustomEvent. */
  'underlay:move-activated': Record<string, never>;

  /** Emitted by UnderlayPersistence (on session restore) and Step3UnderlayView
   *  (on first placement) once a floor-plan underlay is active in the scene.
   *  `restored: true` when this is a session-restore placement.
   *  ImportManagerPanel and UnderlayPersistence listen.
   *  Replaces the TASK-15 `pryzm-floor-plan-underlay-placed` CustomEvent. */
  'pryzm-floor-plan-underlay-placed': {
    readonly underlayId: string;
    readonly fileName: string;
    readonly restored?: boolean;
  };

  /** Signal-only — emitted when the floor-plan underlay is removed from the
   *  scene (Step6CommitView or Import Manager delete action).
   *  UnderlayPersistence + ImportManagerPanel listen to clear persisted state.
   *  Replaces the TASK-12 `pryzm-floor-plan-underlay-removed` CustomEvent. */
  'pryzm-floor-plan-underlay-removed': Record<string, never>;

  /** Emitted by FloorPlanImportPanel after toggling underlay visibility via the
   *  Import Manager set-visibility command.  Currently informational; future
   *  subscribers can react to opacity state changes.
   *  Replaces the TASK-15 `pryzm-floor-plan-underlay-visibility-changed` CustomEvent. */
  'pryzm-floor-plan-underlay-visibility-changed': {
    readonly visible: boolean;
  };

  /** Emitted by ImportManagerPanel when the user toggles the eye icon for the
   *  floor-plan underlay row.  FloorPlanImportPanel listens to call setVisible.
   *  Replaces the TASK-12 `pryzm-floor-plan-underlay-set-visibility` CustomEvent. */
  'pryzm-floor-plan-underlay-set-visibility': {
    readonly visible: boolean;
  };

  /** Emitted by ImportManagerPanel when the user toggles the pin / no-select
   *  icon for the floor-plan underlay row.  FloorPlanImportPanel listens to
   *  call setLocked.
   *  Replaces the TASK-12 `pryzm-floor-plan-underlay-set-locked` CustomEvent. */
  'pryzm-floor-plan-underlay-set-locked': {
    readonly locked: boolean;
    readonly noSelect?: boolean;
  };

  /** Signal-only — emitted by ImportManagerPanel when the user presses the
   *  delete button for the floor-plan underlay row.  FloorPlanImportPanel
   *  listens to call handleRemoveUnderlay.
   *  Replaces the TASK-12 `pryzm-floor-plan-underlay-remove` CustomEvent. */
  'pryzm-floor-plan-underlay-remove': Record<string, never>;

  /** Emitted by DxfImportPanel after a DXF file is successfully placed in the
   *  scene.  ImportManagerPanel listens to register the overlay entry.
   *  `group` is the Three.js Group for the overlay (typed `unknown` to avoid
   *  a package→app circular dependency).
   *  Replaces the TASK-12 `pryzm-dxf-overlay-added` CustomEvent. */
  'pryzm-dxf-overlay-added': {
    readonly overlayId: string;
    readonly fileName: string;
    readonly group?: unknown;
  };

  /** Signal-only — emitted by DxfImportPanel when the active DXF overlay is
   *  removed (doRemoveOverlay or the Import Manager remove bridge).
   *  ImportManagerPanel listens to clear its DXF entries.
   *  Replaces the TASK-12 `pryzm-dxf-overlay-removed` CustomEvent. */
  'pryzm-dxf-overlay-removed': Record<string, never>;

  /** Emitted by ImportManagerPanel when the user presses the delete button for
   *  a DXF overlay row.  DxfImportPanel listens to dispose the active overlay.
   *  `overlayId` is optional — DxfImportPanel skips if it doesn't match the
   *  current overlay.
   *  Replaces the TASK-12 `pryzm-dxf-overlay-remove` CustomEvent. */
  'pryzm-dxf-overlay-remove': {
    readonly overlayId?: string;
  };

  /** Emitted by ImportManagerPanel when the user toggles the pin/no-select
   *  icon for a DXF overlay row.  DxfImportPanel listens to call setLocked.
   *  Replaces the TASK-12 `pryzm-dxf-overlay-set-locked` CustomEvent. */
  'pryzm-dxf-overlay-set-locked': {
    readonly overlayId?: string;
    readonly locked: boolean;
    readonly noSelect?: boolean;
  };

  /** Emitted by ImportManagerPanel when the user toggles the eye icon for a
   *  DXF overlay row.  DxfImportPanel listens to call setOpacity.
   *  Replaces the TASK-12 `pryzm-dxf-overlay-set-visibility` CustomEvent. */
  'pryzm-dxf-overlay-set-visibility': {
    readonly overlayId?: string;
    readonly visible: boolean;
  };

  /** Emitted by ProjectLoader when a saved project snapshot contains DXF
   *  overlay data that needs geometry rebuild after the scene is ready.
   *  NavigationAreaLayout listens and calls restoreDxfOverlay for each entry.
   *  Replaces the TASK-12 `pryzm-dxf-restore-overlays` CustomEvent. */
  'pryzm-dxf-restore-overlays': {
    readonly overlays: readonly unknown[];
  };

  /** Emitted by initUI after a complete IFC import (processIfcFile).
   *  ImportManagerPanel, ImportedModelsPanel, PlanViewManager,
   *  UnifiedBrowserPanel, and registerTransformDragHandler all listen.
   *  Payload fields are typed to the minimal consumed subset; the full result
   *  object may carry additional IFC-specific fields.
   *  Replaces the TASK-12 `pryzm-ifc-imported` CustomEvent. */
  'pryzm-ifc-imported': {
    readonly modelId: string;
    readonly modelName?: string;
    readonly fileName?: string;
    readonly geometry?: {
      readonly meshCount: number;
      readonly triangleCount: number;
      readonly name?: string;
    };
    readonly stats?: {
      readonly totalSpaces: number;
      readonly totalStoreys: number;
      readonly totalRelationships: number;
      readonly totalElements?: number;
    };
    readonly relationships?: readonly unknown[];
  };

  /** Emitted by ImportManagerPanel and ImportedModelsPanel when the user
   *  toggles the eye icon for an IFC model row.  initUI listens and sets
   *  the THREE.Group visibility.
   *  Replaces the TASK-12 `pryzm-import-model-visibility` CustomEvent. */
  'pryzm-import-model-visibility': {
    readonly modelId: string;
    readonly visible: boolean;
  };

  /** Emitted by ImportManagerPanel when the user toggles the pin / no-select
   *  state for an IFC model row.  initUI listens and updates userData flags
   *  and per-mesh selectability.
   *  Replaces the TASK-12 `pryzm-import-model-set-locked` CustomEvent. */
  'pryzm-import-model-set-locked': {
    readonly modelId: string;
    readonly locked: boolean;
    readonly noSelect?: boolean;
  };

  /** Emitted by ImportManagerPanel and ImportedModelsPanel when the user
   *  presses the delete button for an IFC model row.  initUI, SpatialTree,
   *  and ImportManagerPanel itself listen to dispose geometry and clean state.
   *  Replaces the TASK-12 `pryzm-import-model-remove` CustomEvent. */
  'pryzm-import-model-remove': {
    readonly modelId: string;
  };

  /** Emitted by ImportedModelsPanel to request a native IFC dry-run (preview
   *  what will be converted without committing).  initUI listens and calls
   *  runIfcNativeConversion('dry-run').
   *  Replaces the TASK-12 `pryzm-ifc-native-dry-run` CustomEvent. */
  'pryzm-ifc-native-dry-run': {
    readonly modelId?: string;
    readonly selectedOnly?: boolean;
  };

  /** Emitted by ImportedModelsPanel to trigger full IFC → BIM element
   *  conversion for the entire model.  initUI listens and calls
   *  runIfcNativeConversion('convert', false).
   *  Replaces the TASK-12 `pryzm-ifc-native-convert-model` CustomEvent. */
  'pryzm-ifc-native-convert-model': {
    readonly modelId?: string;
  };

  /** Emitted by ImportedModelsPanel to trigger IFC → BIM conversion for the
   *  current selection only.  initUI listens and calls
   *  runIfcNativeConversion('convert', true).
   *  Replaces the TASK-12 `pryzm-ifc-native-convert-selected` CustomEvent. */
  'pryzm-ifc-native-convert-selected': {
    readonly modelId?: string;
  };

  /** Signal-only — emitted by ImportedModelsPanel to open the IFC conversion
   *  fidelity report dialog.  initUI listens and calls showIfcConversionReport.
   *  Replaces the TASK-12 `pryzm-ifc-native-report` CustomEvent. */
  'pryzm-ifc-native-report': Record<string, never>;

  /** Emitted by ImportedModelsPanel when the user toggles "Show/Hide Source"
   *  for a converted IFC model.  initUI listens and calls
   *  IfcConversionCoordinator.toggleSourceVisibility.
   *  Replaces the TASK-12 `pryzm-ifc-native-source-visibility` CustomEvent. */
  'pryzm-ifc-native-source-visibility': {
    readonly modelId: string;
    readonly visible: boolean;
  };

  /** Emitted by runIfcNativeConversion (in initUI) after a successful
   *  conversion to signal the fidelity report listener.
   *  Already emitted via runtime.events (F.events.13 listener migration);
   *  the dispatch was previously window.runtime?.events?.emit at initUI:863.
   *  `report` is the IfcConversionReport object (typed as unknown to avoid
   *  a package→app circular dependency).
   *  Migrates the TASK-12 `pryzm-ifc-native-conversion-complete` listener. */
  'pryzm-ifc-native-conversion-complete': unknown;

  /** Signal-only — emitted by PlatformProjectBrowser when the user clicks the
   *  "Import PDF/Image" button in the hub menu.  NavigationAreaLayout listens
   *  to open the floor-plan import panel (ai.toggleFloorPlanPanel()).
   *  Replaces the TASK-11 `pryzm-import-pdf` CustomEvent. */
  'pryzm-import-pdf': Record<string, never>;

  /** Signal-only — emitted by PlatformProjectBrowser and ExportRailPanel when
   *  the user clicks the Import Manager toggle.  initUI listens to call
   *  importManagerPanel.toggle().
   *  Replaces the TASK-11/12 `pryzm-import-manager-toggle` CustomEvent. */
  'pryzm-import-manager-toggle': Record<string, never>;

  // ── F.events.14 — 2026-05-16 — View rendering settings, consequence preview, ─
  // video export recording, active-level, ui-pref, history-ghost, material,
  // day-night / wall-cut / reset-view BAM controls.
  //
  // Dispatch sites: ViewPropertiesSection, ConsequencePreviewOverlay helpers,
  //   VideoExportPanel, LeftNavRail, DesignHistoryPanel, MaterialsBucket,
  //   UiPreferences, BottomActionMenu.
  // Listener sites: initUI (rendering settings), ConsequencePreviewOverlay,
  //   RenderQueuePanel, LeftNavRail, GhostOverlayRenderer, MaterialsBucket,
  //   RoomBoundaryBuilder, LightingFragmentBuilder.

  /** Emitted by ViewPropertiesSection when the user toggles Ambient Occlusion.
   *  initUI.ts listens and updates postproduction.aoPass.blendIntensity.
   *  Replaces the TASK-15 `pryzm-set-ao` CustomEvent.  F.events.14 */
  'pryzm-set-ao': { readonly enabled: boolean };

  /** Emitted by ViewPropertiesSection when the user toggles Bloom post-processing.
   *  initUI.ts listens and calls window.enableEnhancedBloom / disableEnhancedBloom.
   *  Replaces the TASK-15 `pryzm-set-bloom` CustomEvent.  F.events.14 */
  'pryzm-set-bloom': { readonly enabled: boolean };

  /** Emitted by ViewPropertiesSection when the user toggles shadow casting.
   *  initUI.ts listens, calls toggleShadows(), and syncs DirectionalLight.castShadow.
   *  Replaces the TASK-15 `pryzm-toggle-shadows` CustomEvent.  F.events.14 */
  'pryzm-toggle-shadows': { readonly enabled: boolean };

  /** Emitted by ViewPropertiesSection when the sun intensity slider changes.
   *  `intensity` is a 0–2 scale value.  initUI.ts listens and updates OBC
   *  ShadowedScene + all scene DirectionalLight.intensity values.
   *  Replaces the TASK-15 `pryzm-set-sun-intensity` CustomEvent.  F.events.14 */
  'pryzm-set-sun-intensity': { readonly intensity: number };

  /** Emitted by ViewPropertiesSection when the azimuth/elevation sliders change.
   *  `x`, `y`, `z` form a Three.js normalised direction vector (unit magnitude).
   *  initUI.ts listens and updates all scene DirectionalLights.
   *  Replaces the TASK-15 `pryzm-set-sun-direction` CustomEvent.  F.events.14 */
  'pryzm-set-sun-direction': { readonly x: number; readonly y: number; readonly z: number };

  /** Emitted by ViewPropertiesSection when the Exposure slider changes.
   *  initUI.ts listens and sets renderer.toneMapping + renderer.toneMappingExposure.
   *  Replaces the TASK-15 `pryzm-set-exposure` CustomEvent.  F.events.14 */
  'pryzm-set-exposure': { readonly exposure: number };

  /** §ENV-PANEL-CLIMATE — founder request: heat for ALL views.
   *  Emitted by ViewPropertiesSection when the Temperature/Humidity sliders
   *  change. `temperature` in °C, `humidity` in %. */
  'pryzm-set-climate': { readonly temperature: number; readonly humidity: number };

  /** §ENV-PANEL-CLIMATE — founder request: wind for ALL views.
   *  Emitted by ViewPropertiesSection when the Wind Direction/Speed sliders
   *  change. `direction` in ° (0 = North), `speed` in m/s. */
  'pryzm-set-wind': { readonly direction: number; readonly speed: number };

  /** §ENV-PANEL-CLIMATE — founder request: population density for ALL views.
   *  Emitted by ViewPropertiesSection when the Density slider changes.
   *  `density` in persons/ha. */
  'pryzm-set-population-density': { readonly density: number };

  /** §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — sun MODE toggle.
   *  Emitted by ViewPropertiesSection. 'real+offset' = ephemeris sun + panel
   *  offsets; 'manual' = the panel az/el/intensity are absolute. initScene's
   *  RealEnvironmentService listens and calls setSunMode(). */
  'pryzm-set-sun-mode': { readonly mode: 'real+offset' | 'manual' };

  /** §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — sun offsets/multipliers.
   *  Emitted by ViewPropertiesSection. In real+offset mode `azimuthDeg`/
   *  `elevationDeg` are offsets (deg) and `intensity` a multiplier; in manual
   *  they are absolute. Any field may be omitted. */
  'pryzm-set-sun-offsets': { readonly azimuthDeg?: number; readonly elevationDeg?: number; readonly intensity?: number };

  /** §FEAT-REAL-ENVIRONMENT-SUN (ADR-0106) — sun time-of-day (decimal hours). */
  'pryzm-set-sun-time': { readonly hours: number };

  /** §FEAT-GROUND-SHADOW-CATCHER (ADR-0106) — toggle the invisible L0 ground
   *  shadow-catcher plane. Default ON. */
  'pryzm-toggle-ground-shadows': { readonly enabled: boolean };

  /** Emitted by triggerConsequencePreview() when a destructive-tool hover fires.
   *  `action` is the SpeculativeAction (typed unknown to avoid pkg→app coupling).
   *  `mouseX`/`mouseY` are client-space cursor coordinates.
   *  ConsequencePreviewOverlay listens and calls schedulePreview().
   *  Replaces the TASK-15 `pryzm-consequence-preview` CustomEvent.  F.events.14 */
  'pryzm-consequence-preview': { readonly action: unknown; readonly mouseX: number; readonly mouseY: number };

  /** Signal-only — emitted by hideConsequencePreview() when the cursor leaves a
   *  destructive-tool target.  ConsequencePreviewOverlay listens and calls hide().
   *  Replaces the TASK-15 `pryzm-consequence-hide` CustomEvent.  F.events.14 */
  'pryzm-consequence-hide': Record<string, never>;

  /** Emitted by VideoExportPanel when a video recording session begins.
   *  `fps` and `duration` mirror the panel's selected recording parameters.
   *  RenderQueuePanel listens to create a running job entry.
   *  Replaces the TASK-12 `ve-recording-started` CustomEvent.  F.events.14 */
  've-recording-started': { readonly fps: number; readonly duration: number };

  /** Emitted by VideoExportPanel when a recording session completes successfully.
   *  RenderQueuePanel listens to mark the job complete and clean up the job-id ref.
   *  Replaces the TASK-12 `ve-recording-complete` CustomEvent.  F.events.14 */
  've-recording-complete': { readonly id: string; readonly name: string; readonly frames: number };

  /** Emitted by LeftNavRail when the user clicks a level tab to switch the active level.
   *  LeftNavRail itself listens to refresh the MODEL sub-panel on level roster changes.
   *  Replaces the TASK-15 `pryzm-active-level-changed` CustomEvent.  F.events.14 */
  'pryzm-active-level-changed': { readonly levelId: string };

  /** Emitted by UiPreferences.set() after every preference mutation and persist.
   *  `key` is the UiPrefsData field name; `value` is the new value (untyped to
   *  avoid a package→app circular dependency — consumers cast to the expected type).
   *  RoomBoundaryBuilder listens to apply room-volume visibility / opacity.
   *  Replaces the TASK-15 `pryzm-ui-pref-changed` CustomEvent.  F.events.14 */
  'pryzm-ui-pref-changed': { readonly key: string; readonly value: unknown };

  /** Emitted by DesignHistoryPanel when the ghost overlay is activated at a scrub timestamp.
   *  GhostOverlayRenderer (packages/core-app-model) listens to materialise ghost geometry.
   *  Replaces the TASK-15 `pryzm-history-ghost-activate` CustomEvent.  F.events.14 */
  'pryzm-history-ghost-activate': { readonly timestamp: number };

  /** Signal-only — emitted by DesignHistoryPanel when the ghost overlay is deactivated.
   *  GhostOverlayRenderer listens to restore original mesh materials and dispose ghosts.
   *  Replaces the TASK-15 `pryzm-history-ghost-deactivate` CustomEvent.  F.events.14 */
  'pryzm-history-ghost-deactivate': Record<string, never>;

  /** Emitted by MaterialsBucket when the user selects a BIM-library material card.
   *  `null` payload signals a clear/deselect action.
   *  MaterialsBucket's element-types tab listens to highlight matching dropdowns.
   *  Replaces the TASK-15 `pryzm-material-selected` CustomEvent.  F.events.14 */
  'pryzm-material-selected': { readonly id: string; readonly color: string; readonly label: string; readonly source: string } | null;

  /** Emitted by BottomActionMenu when the wall cut-away mode changes.
   *  `mode` is 'cutaway' (clip at 1.2 m), 'down' (clip at 0.6 m), or 'up' (no clip).
   *  Replaces the TASK-11 `bam:wall-cut-mode-changed` CustomEvent.  F.events.14 */
  'bam:wall-cut-mode-changed': { readonly mode: 'cutaway' | 'down' | 'up' };

  /** Signal-only — emitted by BottomActionMenu when the user resets the view to the
   *  stacked/full-height level mode.  Camera and section-box listeners can reset state.
   *  Replaces the TASK-11 `bam:reset-view-controls` CustomEvent.  F.events.14 */
  'bam:reset-view-controls': Record<string, never>;

  /** Emitted by BottomActionMenu when the user toggles between day and night lighting mode.
   *  LightingFragmentBuilder (packages/geometry-lighting) listens to sync fixture intensities.
   *  Replaces the TASK-11 `bam:day-night-changed` CustomEvent.  F.events.14 */
  'bam:day-night-changed': { readonly mode: 'day' | 'night' };

  // ── F.events.15 — 2026-05-16 ─────────────────────────────────────────────
  // BIM mutation signals, export/import actions, platform navigation,
  // selection/highlight bus, data-workbench signals, generative AI events,
  // view-settings signals, geospatial, physics, toast — all 40 types.

  /** Emitted by WallRebuildCoordinator once a batch of wall mutations has been
   *  committed and the scene is quiescent.  RoomTopologyObserver (packages/room-topology)
   *  listens to re-run topology analysis.
   *  Replaces the TASK-15 `bim-wall-mutation-committed` CustomEvent.  F.events.15 */
  'bim-wall-mutation-committed': {
    readonly levelIds: readonly string[];
    readonly sourceCommandId?: string;
  };

  /** Emitted by registerTransformDragHandler when a 3D-gizmo move on a stair
   *  is rejected (stair geometry is defined by flight data — move not supported).
   *  Triggers StairMeshBuilder/StairRailingBuilder to snap the mesh back.
   *  Replaces the TASK-15 `bim-stair-updated` CustomEvent.  F.events.15 */
  'bim-stair-updated': { readonly id?: string; readonly stair?: unknown };

  /** Emitted by registerTransformDragHandler when a 3D-gizmo move on a handrail/railing
   *  is rejected.  Triggers mesh snap-back.
   *  Replaces the TASK-15 `bim-railing-updated` CustomEvent.  F.events.15 */
  'bim-railing-updated': { readonly id: string };

  /** Broadcast by BottomActionMenu after it mutates scene visibility or layer state
   *  so that other panels (e.g. ProjectBrowserPanel) can refresh their tallies.
   *  Replaces the TASK-11 `bim-scene-mutated` CustomEvent.  F.events.15 */
  'bim-scene-mutated': { readonly source: string };

  /** Broadcast when a mutation to the project store has been committed (project
   *  name change, etc.).  LegacyCommandManagerAdapter in runtime-undo-stack listens
   *  to trigger undo/redo button refreshes.
   *  Replaces the TASK-11 `bim-store-mutated` CustomEvent.  F.events.15 */
  'bim-store-mutated': Record<string, never>;

  /** Triggers the full IFC export flow (server auth → entitlement check → file save).
   *  `exportScope` controls whether imported IFC models are included.
   *  initUI.ts listens.  BimService dispatches.
   *  Replaces the TASK-12 `export-ifc` CustomEvent.  F.events.15 */
  'export-ifc': { readonly exportScope?: 'native-only' | 'native-and-imported' };

  /** Triggers an IFC 2x3 (Revit-compatible) export.  initUI.ts listens.
   *  ExportRailPanel dispatches.
   *  Replaces the TASK-12 `export-ifc-revit` CustomEvent.  F.events.15 */
  'export-ifc-revit': Record<string, never>;

  /** Triggers the IFC export flow from the platform project browser.
   *  NavigationAreaLayout listens.
   *  Replaces the TASK-11 `pryzm-export-ifc` CustomEvent.  F.events.15 */
  'pryzm-export-ifc': Record<string, never>;

  /** Triggers GLB export from the platform project browser.
   *  NavigationAreaLayout listens.
   *  Replaces the TASK-11 `pryzm-export-glb` CustomEvent.  F.events.15 */
  'pryzm-export-glb': Record<string, never>;

  /** Triggers DXF export sheet-picker dialog.  ExportRailPanel dispatches.
   *  Replaces the TASK-12 `pryzm-export-dxf-pick` CustomEvent.  F.events.15 */
  'pryzm-export-dxf-pick': { readonly sheets: readonly unknown[] };

  /** Requests removal of an imported Rhino model from the scene.
   *  ImportManagerPanel dispatches; initUI.ts (Rhino bridge §32) listens.
   *  Replaces the TASK-12 `pryzm-rhino-remove` CustomEvent.  F.events.15 */
  'pryzm-rhino-remove': { readonly modelId: string };

  /** Sets the visibility of an imported Rhino model.
   *  ImportManagerPanel dispatches; initUI.ts (Rhino bridge §32) listens.
   *  Replaces the TASK-12 `pryzm-rhino-set-visibility` CustomEvent.  F.events.15 */
  'pryzm-rhino-set-visibility': {
    readonly modelId: string;
    readonly visible: boolean;
  };

  /** Sets the locked/noSelect flags of an imported Rhino model.
   *  ImportManagerPanel dispatches; initUI.ts (Rhino bridge §32) listens.
   *  Replaces the TASK-12 `pryzm-rhino-set-locked` CustomEvent.  F.events.15 */
  'pryzm-rhino-set-locked': {
    readonly modelId: string;
    readonly locked: boolean;
    readonly noSelect?: boolean;
  };

  /** Fired by PlatformShell immediately before a new project is loaded.
   *  initScene and UnderlayPersistence listen to flush/suspend state.
   *  Replaces the TASK-15 `pryzm-project-switch` CustomEvent.  F.events.15 */
  'pryzm-project-switch': {
    readonly projectId: string;
    readonly projectName: string;
  };

  /** Fired by PlatformShell once project context (id + name) has been set.
   *  Replaces the TASK-15 `pryzm-project-context-set` CustomEvent.  F.events.15 */
  'pryzm-project-context-set': {
    readonly projectId: string;
    readonly projectName: string;
  };

  /** Instructs PlatformVersionController to load a specific saved version.
   *  PlatformSaveController dispatches; PlatformVersionController listens.
   *  Replaces the TASK-12 `plat-load-version` CustomEvent.  F.events.15 */
  'plat-load-version': { readonly version: unknown };

  /** Triggers the sign-out flow.  PlatformProjectBrowser dispatches;
   *  PlatformRouter listens.
   *  Replaces the TASK-11 `pryzm-sign-out` CustomEvent.  F.events.15 */
  'pryzm-sign-out': Record<string, never>;

  /** Cross-panel hub action signal (e.g. 'save', 'open').
   *  SaveUndoRedoHUD + ProjectBrowserPanel dispatch; PlatformProjectBrowser listens.
   *  Replaces the TASK-11/15 `pryzm-hub-action` CustomEvent.  F.events.15 */
  'pryzm-hub-action': { readonly action: string };

  /** Requests navigation focus to a specific element (e.g. from AmbientIndicator).
   *  Replaces the TASK-15 `pryzm-navigate-to` CustomEvent.  F.events.15 */
  'pryzm-navigate-to': { readonly elementId: string };

  /** Broadcast by BottomActionMenu when elements-in-view filter is toggled.
   *  `ids` is the set of visible element IDs; `active` indicates filter state.
   *  Replaces the TASK-11 `pryzm:elements-in-view` CustomEvent.  F.events.15 */
  'pryzm:elements-in-view': {
    readonly ids: readonly string[];
    readonly active: boolean;
  };

  /** Requests that a specific section of the ProjectBrowserPanel be opened
   *  (fallback when the DOM node cannot be found directly).
   *  Replaces the TASK-11 `pryzm:open-panel-section` CustomEvent.  F.events.15 */
  'pryzm:open-panel-section': { readonly section: string };

  /** Emitted by PhysicsRailPanel when the user selects a physics overlay mode.
   *  initDataPlatform and PhysicsPanel listen to keep the dropdown in sync.
   *  NOTE: Fixes pre-existing event name mismatch (dispatch was 'pryzm-physics-mode',
   *  listeners expected 'pryzm-physics-mode-changed') — unified to the listener name.
   *  Replaces the TASK-15 `pryzm-physics-mode` / `pryzm-physics-mode-changed` CustomEvents.
   *  F.events.15 */
  'pryzm-physics-mode-changed': { readonly mode: string };

  /** Emitted by ViewRangePanel when the view-range clip settings change.
   *  Replaces the TASK-15 `pryzm:view:range-update` CustomEvent.  F.events.15 */
  'pryzm:view:range-update': { readonly [key: string]: unknown };

  /** Emitted by ViewTemplatePanel when view template settings are applied.
   *  Replaces the TASK-15 `pryzm:view:template-apply` CustomEvent.  F.events.15 */
  'pryzm:view:template-apply': { readonly [key: string]: unknown };

  /** Emitted by WorksetPanel when workset visibility/discipline settings change.
   *  Replaces the TASK-15 `pryzm:workset:settings-update` CustomEvent.  F.events.15 */
  'pryzm:workset:settings-update': { readonly [key: string]: unknown };

  /** Requests selection of multiple elements by ID (e.g. from HierarchyTreePanel
   *  search results or SpatialQueryPanel results).
   *  Replaces the TASK-15 `pryzm-select-multiple` CustomEvent.  F.events.15 */
  'pryzm-select-multiple': { readonly ids: readonly string[] };

  /** Requests selection + 3D highlight of a single element by ID.
   *  RelationshipExplorerPanel dispatches.
   *  Replaces the TASK-11 `pryzm-select-element` CustomEvent.  F.events.15 */
  'pryzm-select-element': { readonly elementId: string };

  /** Requests highlight (not full selection) of a set of elements.
   *  RelationshipExplorerPanel dispatches.
   *  Replaces the TASK-11 `pryzm-highlight-elements` CustomEvent.  F.events.15 */
  'pryzm-highlight-elements': { readonly elementIds: readonly string[] };

  /** Requests selection of elements by ID (from ProjectVisibilitySection).
   *  Replaces the TASK-15 `pryzm-select-ids` CustomEvent.  F.events.15 */
  'pryzm-select-ids': { readonly ids: readonly string[] };

  /** Emitted by HierarchyTreePanel when a tree node is clicked.
   *  DataSheetPanel listens to display the element's data sheet.
   *  Replaces the TASK-15 `pryzm-hierarchy-node-selected` CustomEvent.  F.events.15 */
  'pryzm-hierarchy-node-selected': {
    readonly nodeId: string;
    readonly nodeType?: string;
  };

  /** Emitted by CompliancePanel when the user clicks a compliance check result row.
   *  `result` is the full ComplianceResult record.
   *  Replaces the TASK-15 `pryzm-compliance-row-selected` CustomEvent.  F.events.15 */
  'pryzm-compliance-row-selected': { readonly [key: string]: unknown };

  /** Emitted by DataVisualizerService when the heatmap mode changes.
   *  `mode` is the new HeatmapMode; `prev` is the previous value.
   *  Replaces the TASK-15 `pryzm-heatmap-mode-changed` CustomEvent.  F.events.15 */
  'pryzm-heatmap-mode-changed': { readonly mode: string; readonly prev: string };

  /** Requests opening the Template Editor panel with an optional pre-selected
   *  template or node.  SyncStateDetailDrawer dispatches.
   *  Replaces the TASK-15 `pryzm-open-template-editor` CustomEvent.  F.events.15 */
  'pryzm-open-template-editor': {
    readonly templateId?: string;
    readonly nodeId?: string;
  };

  /** Triggers layout generation in VariantBrowserPanel.
   *  BriefInputPanel dispatches; VariantBrowserPanel listens.
   *  Replaces the TASK-15 `pryzm-generative-generate` CustomEvent.  F.events.15 */
  'pryzm-generative-generate': { readonly brief: unknown };

  /** Emitted by VariantBrowserPanel when a generated layout variant is applied.
   *  Replaces the TASK-15 `pryzm-generative-applied` CustomEvent.  F.events.15 */
  'pryzm-generative-applied': {
    readonly variantIndex: number;
    readonly roomCount: number;
  };

  /** Broadcast when the sync / template-assignment state changes and panels
   *  should refresh their content.
   *  BriefInputPanel dispatches; AnalyticsPanel, DataSheetPanel, HierarchyTreePanel,
   *  ProgrammePanel, and ConstraintEngine listen.
   *  Replaces the TASK-15 `pryzm-sync-state-changed` CustomEvent.  F.events.15 */
  'pryzm-sync-state-changed': { readonly source?: string };

  /** Emitted by IntentPrompt when the user records a design decision.
   *  Replaces the TASK-15 `pryzm-decision-recorded` CustomEvent.  F.events.15 */
  'pryzm-decision-recorded': { readonly [key: string]: unknown };

  /** Requests display of a toast notification.
   *  StairPlanToolHandler dispatches.
   *  Replaces the TASK-15 `pryzm:toast` CustomEvent.  F.events.15 */
  'pryzm:toast': { readonly message: string; readonly severity?: string };

  /** A.5.g — fired post-auth by `PlatformRouter` when the RAC onboarding
   *  conversation captured a brief before sign-up. The in-editor pipeline
   *  subscribes to seed the first project from the conversation (A.5.g.2:
   *  create project → draw a default exterior shell → run apartment
   *  generation). The payload is intentionally loose — the conversation is
   *  freeform — so consumers narrow `metadata`. Replaces a `window` global
   *  handoff (P4). */
  'pryzm:onboarding-brief-ready': {
    readonly role: string;
    readonly typologyId: string;
    readonly metadata: Record<string, unknown>;
  };

  // ── A.7.c (Phase A) — Site (C19) domain events ────────────────────────────
  /** Emitted by the Site L5 dispatch helper (`createSiteFromRect`, and the
   *  future GIS boundary-draw tool A.8.c) after the corresponding pure command
   *  handler succeeds. The apartment-from-boundary path (A.5.g.3) + a future
   *  LTP-ENU rebase (C12/C19 §1.3) subscribe. Typology-agnostic site substrate. */
  'site.created': SiteCreatedEvent;
  'site.location-changed': SiteLocationChangedEvent;
  'site.parcel-boundary-set': SiteParcelBoundarySetEvent;
  /** C19 §4.2 / C58 — emitted after `site.updateZoning` patches the parcel's
   *  mutable zoning fields (setbacks / maxHeight / maxFAR / zoning). The
   *  buildable-envelope wiring (C58 L-402b) dispatches this after the pure
   *  envelope solve; the Site Inspector + Forma envelope card may subscribe. */
  'site.zoning-updated': SiteZoningUpdatedEvent;
  /** §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58) — emitted when the user presses
   *  "✓ Use this placement" on the site-plan overlay (a georeferenced client
   *  PDF/image). The onboarding wizard listens to advance Step 2 → the
   *  boundary-trace / plot step: per L-38 a geolocated + calibrated plan is a
   *  valid located plot, so no mandatory boundary trace is required to proceed.
   *  Payload intentionally empty — the placement + θ (Project North) are already
   *  applied via `dispatchSiteTrueNorth` before this fires. */
  'site.overlay-placement-committed': Record<string, never>;

  /** Requests placement of a detail component in the active view.
   *  DetailComponentPanel dispatches.
   *  Replaces the TASK-15 `pryzm:detail-component:place` CustomEvent.  F.events.15 */
  'pryzm:detail-component:place': { readonly [key: string]: unknown };

  /** Emitted by CesiumViewport / TransformGizmo when a Cesium model's matrix
   *  has been updated via drag.  CesiumThreeBridge (packages/renderer-three) listens
   *  to keep the Three.js anchor in sync.
   *  Replaces the TASK-15 `cesium-model-transformed` CustomEvent.  F.events.15 */
  'cesium-model-transformed': {
    readonly matrix: unknown;
    readonly position: unknown;
  };

  // ── F.events.16 additions ────────────────────────────────────────────────

  // Level lifecycle (command-registry/levels — AddLevelCommand, DeleteLevelCommand,
  // UpdateLevelCommand).  Replaces the TODO(TASK-10) window CustomEvents.  F.events.16

  /** Emitted by AddLevelCommand.execute() and DeleteLevelCommand.undo() when a level
   *  is created.  LevelClipPlaneCache (initScene) and UnifiedBrowserPanel listen.
   *  `elevation` is optional to keep the type stable when the caller does not carry it.
   *  Replaces the TASK-10 `bim-level-added` CustomEvent.  F.events.16 */
  'bim-level-added': { readonly id: string; readonly elevation?: number };

  /** Emitted by DeleteLevelCommand.execute() and AddLevelCommand.undo() when a level
   *  is removed.  SpatialTree, UnifiedBrowserPanel, CreatePanelLayout listen.
   *  Replaces the TASK-10 `bim-level-removed` CustomEvent.  F.events.16 */
  'bim-level-removed': { readonly id: string };

  /** Emitted by UpdateLevelCommand.execute() and .undo() when level properties change.
   *  Replaces the TASK-10 `bim-level-updated` CustomEvent.  F.events.16 */
  'bim-level-updated': { readonly id: string };

  /** Emitted by CreatePlanViewCommand.execute() and .undo() when a plan view is
   *  created or destroyed.  ViewBrowser and SplitViewManager listen.
   *  Replaces the TASK-15 `plan-view-added` CustomEvent.  F.events.16 */
  'plan-view-added': { readonly viewId: string };

  /** Emitted by AddLevelCommand / DeleteLevelCommand / UpdateLevelCommand alongside
   *  the specific level event to trigger a full project-UI refresh.
   *  Replaces the TASK-10 `update-project-ui` CustomEvent (already in RuntimeEvents
   *  as signal-only; this entry is the F.events.16 migration anchor).  F.events.16
   *  Note: `update-project-ui` is declared earlier in RuntimeEvents (line ~874) —
   *  this comment is intentionally a no-op anchor, not a duplicate declaration. */

  // Ceiling CRUD (CeilingStore — packages/core-app-model)  F.events.16

  /** Emitted by CeilingStore.add() when a ceiling is created.
   *  Replaces the TASK-10 `bim-ceiling-added` CustomEvent.  F.events.16 */
  'bim-ceiling-added': { readonly id: string };

  /** Emitted by CeilingStore.update(), .addHoleElement(), .removeHoleElement(),
   *  and .triggerRebuild() when ceiling geometry changes.
   *  Replaces the TASK-10 `bim-ceiling-updated` CustomEvent.  F.events.16 */
  'bim-ceiling-updated': { readonly id: string };

  /** Emitted by CeilingStore.remove() when a ceiling is deleted.
   *  Replaces the TASK-10 `bim-ceiling-removed` CustomEvent.  F.events.16 */
  'bim-ceiling-removed': { readonly id: string };

  // Stair CRUD (StairStore — packages/core-app-model)  F.events.16

  /** Emitted by StairStore.add() when a stair is created.
   *  Replaces the TASK-10 `bim-stair-added` CustomEvent.  F.events.16 */
  'bim-stair-added': { readonly id: string };

  /** Emitted by StairStore.remove() when a stair is deleted.
   *  Replaces the TASK-10 `bim-stair-removed` CustomEvent.  F.events.16 */
  'bim-stair-removed': { readonly id: string };

  // Roof CRUD (RoofStore — packages/core-app-model)  F.events.16

  /** Emitted by RoofStore.add() when a roof is created.
   *  Replaces the TASK-10 `bim-roof-added` CustomEvent.  F.events.16 */
  'bim-roof-added': { readonly id: string };

  /** Emitted by RoofStore.remove() when a roof is deleted.
   *  Replaces the TASK-10 `bim-roof-removed` CustomEvent.  F.events.16 */
  'bim-roof-removed': { readonly id: string };

  /** Emitted by RoofStore.update() and .restoreSnapshot() when roof properties change.
   *  Replaces the TASK-10 `bim-roof-updated` CustomEvent.  F.events.16 */
  'bim-roof-updated': { readonly id: string };

  // Requirement / AssetCatalog domain events  F.events.16

  /** Emitted by RequirementStore.add(), .update(), .remove(), and .clear() on
   *  every requirement mutation.  AI compliance panels and AuditGridZone listen.
   *  Replaces the TASK-15 `pryzm-requirement-changed` CustomEvent.  F.events.16 */
  'pryzm-requirement-changed': { readonly operation: string; readonly id: string };

  /** Emitted by AssetCatalogStore.add(), .update(), .remove(), .clear(), and
   *  .setDirect() on every asset-catalog mutation.  AI panels listen.
   *  Replaces the TASK-15 `pryzm-asset-catalog-changed` CustomEvent.  F.events.16 */
  'pryzm-asset-catalog-changed': { readonly operation: string; readonly id: string };

  /** Emitted by SelectionManager, FloorPlanUnderlayTool, UnderlayReferenceScaleTool,
   *  UnderlayReferenceRotateTool, deleteIfcElement, and RelationshipExplorerPanel
   *  whenever the BIM element selection changes.  All 2D panels listen for re-render.
   *
   *  `object` is `THREE.Object3D | null` — typed as `unknown` here to avoid a
   *  circular dependency on the `three` package.  The primary 3D-selection signal.
   *  `elementId` is emitted by workbench / relationship panels (string IDs).
   *  `deletedId` carries the ID of a freshly-deleted element (from deleteIfcElement).
   *
   *  Replaces the TASK-11 `bim-selection-changed` CustomEvent.  F.events.16 */
  'bim-selection-changed': {
    readonly object?: unknown;
    readonly elementId?: string;
    readonly elementType?: string;
    readonly deletedId?: string;
  };

  /** Emitted by RelationshipViewer when the user clicks a relationship chip to
   *  navigate to a related element.
   *  `id` is the target BIM element ID.
   *  Replaces the TASK-11 `bim-select-element` CustomEvent.  F.events.16 */
  'bim-select-element': { readonly id: string };
}

// ---------------------------------------------------------------------------
//                       The 14-slot PryzmRuntime contract
// ---------------------------------------------------------------------------
//
// The slot list is fixed by S72 §16.1 A.3:
//   scene · stores · bus · selection · tools · picking · viewRegistry ·
//   persistence · sync · ai · plugins · events · toasts · userPreferences
//
// Several slots accept a typed-but-stub implementation in Phase A so the
// contract is testable end-to-end without blocking on later phases.
// The stubs throw `RuntimeNotWiredError` from any non-trivial method so
// a Phase B+ panel that accidentally calls into a not-yet-wired slot
// gets a *named* failure rather than `undefined is not a function`.

/** Thrown by stub methods on Phase A's runtime when a panel calls into
 *  a slot whose real implementation has not yet landed.  The message
 *  carries the sub-phase id so the caller can grep the plan. */
export class RuntimeNotWiredError extends Error {
  constructor(slot: string, subPhase: string) {
    super(
      `[runtime-composer] runtime.${slot} is a Phase A stub — wired by ${subPhase}. ` +
      `See docs/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md §16 for the full schedule.`,
    );
    this.name = 'RuntimeNotWiredError';
  }
}

/** Audit metadata stamped onto every command + event log entry by the
 *  bus.  Mirrored from `@pryzm/command-bus`'s `BootstrapOptions.audit`
 *  shape so the contract is self-contained. */
export interface RuntimeAudit {
  readonly actorId: string;
  readonly projectId: string;
  readonly clientId: string;
}

/** Selection slot — Phase A stub; Phase B widens to the real
 *  `SelectionStore`.  The methods here are the minimum surface that
 *  Phase B's `B.10 SelectionOverlay` will consume. */
export interface SelectionSlot {
  readonly ids: readonly string[];
  add(id: string): void;
  remove(id: string): void;
  clear(): void;
  set(ids: readonly string[]): void;
  subscribe(listener: (ids: readonly string[]) => void): Disposable;
}

/** Hover slot — separate from selection (a hovered element is *not*
 *  selected; the visual treatment differs).  Phase A stub. */
export interface HoverSlot {
  readonly id: string | null;
  set(id: string | null): void;
  subscribe(listener: (id: string | null) => void): Disposable;
}

/** Picking slot — Wave 4 Track A PR 4.A.5.  Backed by
 *  `buildPickingSlot` from `./buildPickingSlot.ts`.  The slot
 *  delegates to a lazy `PickerDelegate` thunk (D.6-prep posture:
 *  thunk returns `null`; warns-once on first call).  D.6 proper
 *  replaces the thunk with a real `PickStrategyResolver`-backed
 *  delegate after `runtime.scene.mount(canvas)` resolves. */
export interface PickingSlot {
  /** Pick the topmost element under the canvas pixel `(x, y)`.
   *  Returns `null` when no element occupies the pixel or the picker
   *  is not yet wired (D.6-prep). */
  pickAt(x: number, y: number): string | null;
  /** Pick all elements whose projected bounds intersect the canvas
   *  rectangle `rect`.  Returns an empty array when nothing
   *  intersects or the picker is not yet wired (D.6-prep). */
  pickInRect(rect: { x: number; y: number; w: number; h: number }): string[];
}

/** Tools slot — Phase A stub widened in Phase E (S78-WIRE).
 *
 * Phase E adds `register(family, activator)` so engine-boot code can wire the
 * real per-family drawing tool to the slot.  `activate(id, mode?)` then calls
 * the registered activator (if any) before updating `activeToolId` and
 * notifying subscribers.  Per-tool activation was originally slated for
 * Phase F.5.x; Phase E lands the gesture-routing half ahead of schedule. */
export interface ToolsSlot {
  readonly activeToolId: string | null;
  /**
   * Phase E — Register a real activator for a tool family.
   * The activator is called inside `activate(family, mode?)` before state
   * changes.  Safe to call at any time; later calls overwrite earlier ones.
   * @param family  Canonical family key, e.g. `'wall'`, `'slab'`, `'door'`.
   * @param activator  Sync callback.  Receives the optional mode string.
   */
  register(family: string, activator: (mode?: string) => void): void;
  /**
   * Activate a tool family, optionally specifying a draw mode.
   *
   * §FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN (L-4600, founder 2026-08-22).
   *
   * ⭐ RETURNS `true` ONLY WHEN A REGISTERED ACTIVATOR ACTUALLY RAN.
   *
   * This used to return `void`, and the implementation set `activeToolId` and
   * notified subscribers **whether or not an activator existed for `toolId`**.
   * A caller therefore could not distinguish "the tool is now armed" from
   * "nobody has ever registered this family, and I have just recorded a tool
   * id that arms nothing". The chat placement capability
   * (`apps/editor/src/ui/ai/chatPlacementActivation.ts`) consumed exactly that
   * non-signal and replied *"<X> tool is active — click to place"* for six
   * families that had no activator at all — a capability reporting success
   * while activating nothing, which is the defect shape this repo has paid for
   * repeatedly (see `[[committed-is-not-reachable]]`, C01 §6 rule 6).
   *
   * `false` means: NO activator is registered under `toolId`. The active-tool
   * id is still recorded (subscribers that only track "which button looks
   * pressed" keep working exactly as before, so this is a widening, not a
   * behaviour change) — but the caller now has the fact it needs in order to
   * be honest with the user instead of guessing.
   *
   * ⛔ Do NOT make the caller's message vaguer to accommodate a `false`. Either
   * register an activator, or say which family had none.
   */
  activate(toolId: string, mode?: string): boolean;
  /**
   * §FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN (L-4600) — is a real activator
   * registered for `family`? Lets a caller ask BEFORE committing to a sentence,
   * and lets a coverage gate enumerate the slot without activating anything.
   */
  hasActivator(family: string): boolean;
  deactivate(): void;
  subscribe(listener: (toolId: string | null) => void): Disposable;
}

/** Project context slot — replaces the ad-hoc
 *  `(window as any).platformShell.currentProjectName` reads scattered
 *  through the white UI today. */
export interface ProjectContextSlot {
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly levelId: string | null;
  set(ctx: { projectId: string; projectName: string }): void;
  setLevelId(id: string | null): void;
  clear(): void;
  subscribe(listener: (ctx: { projectId: string | null; projectName: string | null; levelId: string | null }) => void): Disposable;
}

// ---------------------------------------------------------------------------
//                Phase C — Persistence widened types (§16.3)
// ---------------------------------------------------------------------------

/** Body shape accepted by `runtime.persistence.client.patch()` and the
 *  server's `PATCH /api/v1/projects/:id` endpoint.  Every field is
 *  optional — at least one MUST be supplied. */
export interface ProjectPatch {
  readonly name?: string;
  readonly isArchived?: boolean;
  readonly isStarred?: boolean;
  readonly description?: string;
}

/** Member roles on a PRYZM project (`/api/projects/:id/members*`). */
export type ProjectMemberRole = 'viewer' | 'editor' | 'admin' | 'owner';

export interface MemberRecord {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly role: ProjectMemberRole;
  readonly addedAt: string;
}

/** Loose contract for the members sub-API exposed under
 *  `runtime.persistence.client.members.*`.  Implemented by
 *  `MembersClient` from `@pryzm/persistence-client` but typed loosely
 *  here so callers (panels) that hold a `runtime.persistence.client`
 *  ref do not need to import that package. */
export interface MembersClientLike {
  list(projectId: string): Promise<readonly MemberRecord[]>;
  invite(projectId: string, email: string, role: ProjectMemberRole): Promise<MemberRecord>;
  remove(projectId: string, userId: string): Promise<void>;
  setRole(projectId: string, userId: string, role: ProjectMemberRole): Promise<MemberRecord>;
}

/** Auth user shape returned by `AuthClientLike` calls.  Mirrored loosely
 *  here so callers (notably `src/ui/platform/AuthModal.ts`) can read
 *  `runtime.persistence.client.auth.*` results without importing
 *  `@pryzm/persistence-client` directly.  `plan` / `planStatus` are
 *  string-typed because the L0 layer is forbidden from importing the
 *  L5 typed enums in `src/monetization/PlanConfig.ts`. */
export interface AuthUserLike {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly createdAt: number;
  readonly plan?: string;
  readonly planStatus?: string;
}

export interface AuthResultLike {
  readonly user: AuthUserLike;
  readonly token: string;
}

/** Loose contract for the typed auth surface exposed under
 *  `runtime.persistence.client.auth.*` per chunks/22 §22.1 step 1.2
 *  ("Flow 1 — Landing → Signup → Hub", architectural leg
 *  `runtime.persistence.client.auth.signInWithGoogle()`).  Implemented
 *  by `AuthClient` from `@pryzm/persistence-client`.  The OAuth popup
 *  lifecycle (window.open + postMessage listener + cancelled-popup
 *  detection) and session persistence (`bim-platform-token` +
 *  `bim-platform-user` localStorage keys per chunks/02 §3.8) live
 *  inside the implementation; this contract is just the surface the
 *  white UI calls. */
export interface AuthClientLike {
  signInWithGoogle(): Promise<AuthResultLike>;
  signInWithMicrosoft(): Promise<AuthResultLike>;
  signInWithEmail(email: string, password: string): Promise<AuthResultLike>;
  signUpWithEmail(email: string, password: string, name: string): Promise<AuthResultLike>;
  signOut(): void;
  getCurrentUser(): AuthUserLike | null;
  getToken(): string | null;
  isSignedIn(): boolean;
}

/** Loose contract for `runtime.persistence.client.*`.  Implemented by
 *  `ProjectListClient` (from `@pryzm/persistence-client`) but typed
 *  here so the white UI never has to depend on the implementing
 *  package directly.  Returned summaries are typed as `unknown` so
 *  this contract is independent of the `ProjectSummary` shape's
 *  evolution — callers cast at the call site (or, more typically,
 *  read from `runtime.persistence.projectListStore` instead). */
export interface PersistenceClientLike {
  list(): Promise<readonly unknown[]>;
  /**
   * §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — enumerate EVERY project and say
   * whether the enumeration finished.
   *
   * ⚠ OPTIONAL, deliberately. `list()` returns at most one server page (50 rows
   * by default) and cannot say whether more exist; callers that reason about
   * ABSENCE — "the server does not have this project" — must not use it. This
   * method exists so they have something they can. It is optional so the several
   * hand-rolled `PersistenceClientLike` stubs across the test suite keep
   * compiling; a caller feature-detects and falls back to `list()` with the
   * completeness left UNKNOWN, which is the honest reading.
   */
  listAll?(): Promise<{ readonly projects: readonly unknown[]; readonly complete: boolean }>;
  create(name: string): Promise<unknown>;
  delete(id: string): Promise<void>;
  rename(id: string, name: string): Promise<unknown>;
  patch(id: string, patch: ProjectPatch): Promise<unknown>;
  duplicate(id: string, newName?: string): Promise<unknown>;
  signOut(): Promise<void>;
  getAuthToken(): string | null;
  readonly members: MembersClientLike;
  /** Typed auth surface — chunks/22 §22.1 step 1.2 leg.  Owned by
   *  `ProjectListClient` via composition; the implementation lives in
   *  `@pryzm/persistence-client/AuthClient`. */
  readonly auth: AuthClientLike;
}

/** SaveUndoRedoHUD subscribes via `runtime.events.on('persistence.status', …)`
 *  and recolours its inline pulse + timestamp accordingly. */
export type PersistenceStatus =
  | { readonly kind: 'idle';    readonly isDirty: boolean }
  | { readonly kind: 'saving';  readonly isDirty: true }
  | { readonly kind: 'syncing'; readonly isDirty: false }
  | { readonly kind: 'offline'; readonly isDirty: boolean }
  | { readonly kind: 'error';   readonly isDirty: boolean; readonly message: string };

/** No-reload openProject progress — emitted by
 *  `runtime.persistence.openProject(id)` so PlatformShell can drive a
 *  determinate inline progress bar.  Phases:
 *    fetching   → REST list + per-project handshake
 *    hydrating  → store population from snapshot + tail event-log replay
 *    painting   → renderer first-frame (when a canvas is mounted)
 *    done       → PlatformShell flips into workspace mode
 */
export interface PersistenceOpenProgress {
  readonly phase: 'fetching' | 'hydrating' | 'painting' | 'done';
  readonly pct: number;
  readonly label?: string;
}

/** `.pryzm` archive exporter (lazy JSZip — see PryzmArchive.ts). */
export interface PryzmExporterLike {
  toPryzm(projectId: string): Promise<Blob>;
}

/** `.pryzm` archive importer.  Returns the id of the new project the
 *  importer created via `runtime.persistence.client.create(...)`. */
export interface PryzmImporterLike {
  fromPryzm(file: File | Blob): Promise<{ projectId: string; name: string }>;
}

// ── Wave 7 (2026-05-01) — workspace bridge (D.4) DELETED ──────────────────────
//
// `workspace bridge (D.4)` is deleted per the in-code "DELETE in Wave 4" comment
// (now overdue).  `openProject()` now chains through two typed runtime legs:
//   • `runtime.persistence.tier.streamLoad(id)` — fetches the latest saved
//     version bundle from the server REST surface.
//   • `runtime.stores.hydrate(snapshot)` — umbrella that fans out the snapshot
//     to per-store hydration via the registered engine delegate.
// The composition root wires both legs via `attachEngineBootstrap()` and
// `attachWorkspaceSurface()` — replacing the opaque bridge with typed
// first-class runtime collaborators.
//
// Engine bootstrap (legacy `ensure()`) is still needed until Phase D.3 mounts
// the renderer from boot.  It is registered via `attachEngineBootstrap()` on
// `PersistenceSlot` and is the ONLY remaining bridge responsibility.

// ── Wave 7 — typed project-open bundle ──────────────────────────────────────

/** Opaque project bundle returned by `runtime.persistence.tier.streamLoad()`.
 *  Contains the raw server version payload.  `snapshot` is typed `unknown`
 *  at the `packages/` boundary; `src/` consumers cast to `IProjectSnapshot`
 *  (see `PlatformShellTypes.ts`) after the shared `@pryzm/file-format` package
 *  exports a canonical schema type in Wave 8. */
export interface PryzmProjectBundle {
  readonly projectId: string;
  readonly versionId: string;
  readonly versionLabel: string;
  readonly snapshot: unknown;
  readonly elementCount: number;
  readonly createdAt: string;
}

/** Typed persistence tier — owns the project-data fetch step.
 *
 *  Wave 7: `streamLoad(id)` extracts the server-fetch step out of the
 *  deleted `attachedWorkspace.show()` bridge so it is independently
 *  testable.  Future waves add streaming chunks (cold/warm/hot tiered
 *  cache) per `chunks/15 §15.4`. */
export interface PersistenceTierSlot {
  /** Fetch the latest saved project bundle from the server.
   *  Returns `null` when no version has been saved yet (brand-new project).
   *  The returned bundle is threaded into `setProjectContext()` opts so
   *  `PlatformShell` can skip the redundant internal server round-trip. */
  streamLoad(projectId: string): Promise<PryzmProjectBundle | null>;
}

/** Minimal structural handle on an authoritative element store —
 *  the duck type every PRYZM ElementStore already satisfies (mirrors
 *  `BimStore` in `@pryzm/core-app-model/store-registry`; kept structural
 *  here so `runtime-composer/types` stays import-free for UI consumers).
 *  Read-shaped by design: writes go through commands (P6), never through
 *  this handle. */
export interface ElementStoreHandle {
  getAll(): unknown[];
  has?: (id: string) => boolean;
  get?: (id: string) => unknown;
  getById?: (id: string) => unknown;
}

/** ADR-0318 (`§ADR-0318-ELEMENTS-SLOT`) — the authoritative element-store
 *  slot. A LIVE, typed view over the module-singleton `storeRegistry`
 *  from `@pryzm/core-app-model` — the registry `engineLauncher`'s
 *  `registerAllStores()` populates with the exact instances
 *  `ProjectSerializer` reads. Identity, not construction: `get('wall')`
 *  after engine boot IS the serializer's wall store, never a copy
 *  (invariant I-1). A kind that has not been registered reads
 *  `undefined` — honest absence, no scaffold (invariant I-3).
 *
 *  Headless: `composeRuntime` itself registers the door/window module
 *  singletons, so those two kinds are present by design without a DOM
 *  boot; the remaining kinds join per ADR-0318's per-kind migration. */
export interface ElementStoresSlot {
  /** O(1) live lookup by canonical element-type key ('wall', 'door', …
   *  — the §3.2 keys `initStores.ts` registers). */
  get(kind: string): ElementStoreHandle | undefined;
  /** True when an authoritative store is registered for the kind. */
  has(kind: string): boolean;
  /** The canonical type keys registered at call time (live, not a snapshot
   *  guarantee — re-call after engine boot for the full set). */
  kinds(): readonly string[];
  /** O(n) ownership scan: the store that claims the element id, if any. */
  forElement(id: string): ElementStoreHandle | undefined;
  /** Register an authoritative store under its canonical kind. Idempotent
   *  for the same instance; replacing with a DIFFERENT instance warns
   *  (registry contract) and is a P1/ADR-0318 I-2 violation outside a
   *  per-kind migration. */
  register(kind: string, store: ElementStoreHandle): void;
}

/**
 * The one member the composition root — and its consumers — call on a plugin DTO
 * store built by `PluginRegistry` and keyed by its descriptor's `storeKey`.
 *
 * ⚠ Deliberately a NAMED STRUCTURAL SHAPE rather than `unknown` plus a cast at the
 * call site. An `any`-shaped seam is a defect factory
 * ([[fake-more-capable-than-real]]), and this type exists because a cast hid a
 * store that was never attached at all. `ProjectSerializer`'s `boundaryLineStore`
 * port states the same rule for the same reason: a store that cannot answer
 * `getState()` must be a COMPILE error, not a runtime silence.
 *
 * ⛔ Structural on purpose, so no layer inverts: the store classes live in
 * `plugins/*` (L6) and this package is L3. Nothing is imported.
 */
export interface PluginDtoStoreHandle {
  getState(): ReadonlyMap<string, unknown>;
}

/** Stores slot — typed umbrella for all registered element stores.
 *
 *  Wave 7: adds `hydrate(snapshot)` so the project-open chain has a
 *  named, independently-testable hydration leg.  `registerHydrator()` is
 *  the internal wiring point called by `initPersistence.ts` once the
 *  engine has booted and `loadDelegate.load()` is available.
 *
 *  Future waves:
 *   - per-store `.hydrate()` methods land in Phase E (store migrations).
 *   - `registerHydrator()` is deleted once every store implements its own
 *     `hydrate()` and the umbrella fan-out is driven by discovery. */
export interface StoresSlot {
  /** ADR-0318 — the authoritative element stores, reachable from the
   *  composed runtime instead of module-scope accident. See
   *  `ElementStoresSlot`. */
  readonly elements: ElementStoresSlot;

  /**
   * §BLSTORE-COMPOSED-PLUGIN-STORES (L-11060 · C106 §1 · C84 EI-1) — the ONE
   * authority for the boundary-line family, reachable from the composed runtime.
   *
   * ⛔ THIS FIELD'S ABSENCE WAS THE FOUNDER'S #1 BLOCKER, and it is worth stating
   * exactly what was wrong so nobody re-derives the "obvious" shortcut.
   *
   * FOUR production call sites were already written as `runtime.stores.boundaryLine`
   * — `initTools.ts`'s 3-D bridge and its plan-symbol reader, `ProjectSerializer`'s
   * save-time fallback, and `generationChatSeam.ts`'s footprint read. Every one of
   * them reached the key through a cast, because `StoresSlot` did not declare it.
   * `composeRuntime` never attached it. So all four read `undefined`, in silence,
   * with the compiler unable to see the disagreement. Measured on a real
   * `composeRuntime`: `Object.keys(runtime.stores)` → `['elements',
   * 'registerHydrator', 'hydrate', 'viewState', 'project']`.
   *
   * ⭐ WHY THIS FAMILY IS DECLARED HERE AND THE OTHER 28 PLUGIN STORES ARE NOT.
   * ADR-0318 moved the authoritative element stores behind `elements` precisely so
   * nobody reads a plugin DTO store for a family that HAS a geometry twin — reading
   * `stores.wall` would be reading the store MT-01 says nobody reads. `boundaryLine`
   * has NO geometry twin: `plugins/boundary-line/src/store.ts` opens by declaring
   * that this family has EXACTLY ONE store on purpose, so C84 EI-1 holds by
   * construction. For this family the plugin store IS the record, not a DTO mirror
   * of one, and exposing it is correct rather than a leak.
   *
   * Optional, and the absence is honest rather than defensive: a `bootstrapFn` that
   * contributes no plugins (bench / headless stubs) leaves it undefined, and every
   * consumer must keep saying UNREADABLE rather than guessing — `undefined` here
   * means "this session cannot answer", never "there are no boundary lines"
   * ([[context-data-honesty-family]]).
   */
  readonly boundaryLine?: PluginDtoStoreHandle | undefined;

  /**
   * §BATH102 (L-11480 · C109 §9 axis 1 · L-11064) — the ONE authority for the
   * bathroom-pod family, reachable from the composed runtime.
   *
   * ⭐ SAME TEST AS `boundaryLine`, PASSED FOR THE SAME REASON, AND IT IS NOT
   * "every plugin store gets a field". ADR-0318 moved the authoritative element
   * stores behind `elements` precisely so nobody reads a plugin DTO store for a
   * family that HAS a geometry twin — reading `stores.wall` would be reading the
   * store MT-01 says nobody reads. `bathroomPod` has **no geometry twin**:
   * `plugins/plumbing/src/bathroomPodStore.ts` opens by declaring that this family
   * has EXACTLY ONE store on purpose, so C84 EI-1 holds by construction. For this
   * family the plugin store IS the record, not a DTO mirror of one.
   *
   * ⛔ AND THE FAMILY'S SIBLING `plumbing` DELIBERATELY GETS NO FIELD, which is the
   * cleanest available illustration of the rule: `plumbing` HAS a twin (the legacy
   * `@pryzm/geometry-plumbing` fixture store on `window.plumbingStore`), and C99
   * measured them diverging — after any project load the DTO store is EMPTY while
   * the legacy store holds N. Exposing it here would hand consumers the empty one.
   *
   * Optional, and the absence is honest rather than defensive: a `bootstrapFn` that
   * contributes no plugins (bench / headless stubs) leaves it undefined, and every
   * consumer must keep saying UNREADABLE rather than guessing — `undefined` here
   * means "this session cannot answer", never "there are no bathroom pods"
   * ([[context-data-honesty-family]]).
   */
  readonly bathroomPod?: PluginDtoStoreHandle | undefined;

  /**
   * §BATH102 (L-11064) — the C104 LIFT COMPOUND's two stores, adopted for the same
   * reason as `boundaryLine` and closing the arm L-11060 explicitly left open.
   *
   * ⛔ THE DEFECT THIS CLOSES IS LIVE AND IS ALREADY WRITTEN DOWN ELSEWHERE.
   * `apps/editor/src/engine/undo/liftUndoAdapter.ts`'s production resolver
   * `resolveLiftStoresFromWindow()` reads `window.runtime.stores.lift` /
   * `.liftPart` **through a cast**, because this interface did not declare them —
   * and `composeRuntime` never attached them, so it returned `null` in every real
   * browser session. A `null` resolve makes `_applyOrThrow` throw a NAMED error, so
   * the lift's Ctrl+Z reported a per-store failure instead of reverting. That is
   * exactly the shape L-11060 measured for `boundaryLine` (four production call
   * sites reading `undefined` in silence), one family over, and L-11064 is the row
   * that recorded it as *"the SAME latent unreachability, logged rather than fixed
   * blind"*. This is the fix, taken deliberately rather than blind: `lift` /
   * `liftPart` are the two families whose consumer was already written against the
   * key.
   *
   * ⚠ `lift` HAS a namesake on `window.liftStore` and it is a DIFFERENT store — the
   * LOD-200 MASSING lift (C104 §1; the two co-exist deliberately). The field below
   * is the COMPOUND (`PluginRegistry` storeKey `lift` → `new LiftCompoundStore()`).
   * ⛔ Do not "unify" them: aliasing would apply an inverse patch to a store that
   * never received the forward — C03 §4.6 U-2b, forbidden by name in
   * `performUndoRedo.ts`.
   */
  readonly lift?: PluginDtoStoreHandle | undefined;
  /** §BATH102 (L-11064) — the lift's cabin/shaft parts. See `lift` above. */
  readonly liftPart?: PluginDtoStoreHandle | undefined;

  /**
   * §BATH102 (L-11064) — the ADR-0124 POOL ASSEMBLY's two stores, in the same state
   * and closed for the same reason as `lift` / `liftPart` above.
   *
   * ⛔ MEASURED, NOT ASSUMED: `poolUndoAdapter.ts`'s production resolver
   * `resolvePoolStoresFromWindow()` reads `window.runtime.stores.pool` / `.water`
   * through a cast, and neither was declared here or attached by `composeRuntime` —
   * so §POOL95 (L-11350) landed a correct adapter onto a resolver that returned
   * `null`, and every pool Ctrl+Z threw a named per-store failure instead of
   * reverting. Precisely the lift's shape.
   *
   * ⭐ AND THIS FAMILY PASSES THE NO-GEOMETRY-TWIN TEST BY MEASUREMENT, not by
   * assertion: `performUndoRedo.ts`'s own L-980 correction records that **nothing
   * ever assigns `window.poolStore` / `window.waterStore`** — the four legacy map
   * entries were `undefined` from the day they were added. There is no twin to
   * diverge from, so exposing these is correct rather than a leak.
   */
  readonly pool?: PluginDtoStoreHandle | undefined;
  /** §BATH102 (L-11064) — the water body a pool holds (ADR-0124 §4). See `pool`. */
  readonly water?: PluginDtoStoreHandle | undefined;

  /** Fan out a full project snapshot to all registered stores via the
   *  engine's `loadDelegate.load()`.  Throws `RuntimeNotWiredError` if
   *  called before `initPersistence` registers the hydrator. */
  hydrate(snapshot: unknown): Promise<void>;
  /** Internal engine-layer wiring — called once by `initPersistence.ts`
   *  after `ProjectLoader` + `loadDelegate` are available.  Not for UI. */
  registerHydrator(fn: (snapshot: unknown) => void | Promise<void>): void;

  /** View-state sub-slot — Phase F.4.  Surfaces the active layer, level,
   *  and zoom so bottom-bar widgets read runtime state instead of window
   *  globals.  Phase F stub returns `null / null / 1.0`; setters are no-ops.
   *  Phase E wires the real store. */
  readonly viewState: {
    readonly activeLayer: string | null;
    readonly activeLevel: string | null;
    readonly zoom: number;
    setActiveLayer(id: string | null): void;
    setActiveLevel(id: string | null): void;
    setZoom(value: number): void;
  };

  /** Project-metadata sub-slot — Phase F.4.  Surfaces the current unit
   *  system to bottom-bar UnitDisplay.  Phase F stub returns 'metric';
   *  setUnits is a no-op.  Phase E wires the real project store. */
  readonly project: {
    readonly units: 'metric' | 'imperial';
    setUnits(units: 'metric' | 'imperial'): void;
  };
}

/** Persistence slot — Phase C real impl.  Unifies the project hub
 *  client, the project-list store, the event log, the .pryzm
 *  exporter / importer, and the no-reload `openProject` lifecycle. */
export interface PersistenceSlot {
  readonly client: PersistenceClientLike;
  /** A `ProjectListStore` from `@pryzm/stores` — typed loosely so the
   *  contract does not pin the store class shape (white UI is allowed
   *  to import the class for its `subscribe` typing). */
  readonly projectListStore: unknown;
  /** A `RuntimeEventLog` from `@pryzm/persistence-client` — typed
   *  loosely for the same reason. */
  readonly eventLog: unknown;
  readonly exporter: PryzmExporterLike;
  readonly importer: PryzmImporterLike;
  /** Typed fetch tier — `tier.streamLoad(id)` is the canonical project
   *  data fetch leg, replacing the deleted `attachedWorkspace.show()` bridge. */
  readonly tier: PersistenceTierSlot;
  /** Open a project — fetches bundle via `tier.streamLoad`, hydrates stores,
   *  paints.  No page reload; PlatformShell flips to workspace mode on the
   *  `'persistence.openProgress'` event with `phase === 'done'`.
   *
   *  `hint` (optional, forward-compatible) — `isNewProject: true` skips the
   *  server round-trip and uses an empty snapshot.  Deep-link flows omit the
   *  hint and rely on the controller refresh as the canonical resolution path. */
  openProject(
    projectId: string,
    hint?: { readonly name?: string; readonly isNewProject?: boolean },
  ): Promise<void>;
  /** Close the current project — clears `projectContext`, resets the
   *  workspace status to idle / not-dirty. */
  closeProject(): Promise<void>;

  /** Wave 7 — attach the engine bootstrap bridge (for `ensure()` only).
   *  Idempotent.  Browser composition root calls this once after
   *  `composeRuntime()` returns; headless / test callers omit it.
   *  The bridge is responsible ONLY for lazy-booting the legacy engine
   *  (creating the BIM canvas + window.platformShell).  The project-open
   *  data path is handled by the typed `tier.streamLoad()` leg.
   *
   *  DELETE when the renderer is mounted from boot (Phase D.3). */
  attachEngineBootstrap(bridge: { ensure(): Promise<void> }): void;

  /** Wave 7 — attach the `WorkspaceSurface` typed lifecycle handle.
   *  Called from `composeRuntime()` after `buildWorkspaceSurface()`.
   *  `openProject()` calls `surface.setProjectContext(id, name, opts)` on
   *  this surface instead of routing through the deleted `workspace bridge (D.4)`.
   *
   *  DELETE when `openProject()` owns the full surface flip directly
   *  (Phase D snapshot pipeline). */
  attachWorkspaceSurface(surface: WorkspaceSurface): void;
}

/** Sync slot — wraps `@pryzm/sync-client`'s `SyncClient` + the
 *  S44-land `PryzmAwareness`.  Phase A constructs the client (no
 *  WebSocket open).  Phase D.4 wires the broadcast plumbing.
 *
 *  Wave 4 Track A.6 (D.5.A.6, 2026-04-30 evening): `client` and
 *  `presence` tightened from `unknown` / `unknown | null` to the
 *  concrete `SyncClient` / `PryzmAwareness` types from
 *  `@pryzm/sync-client`.  This closes the last two `unknown`s on the
 *  top-level `PryzmRuntime` slot list (D.11-prep already typed
 *  `viewRegistry`; D.9-prep typed `workspace` + `cameraController`;
 *  D.4.x typed `scene` + `persistence` + `physicsHost` + `inputHost`).
 *  Anchors: `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2 PR 4.A.6`,
 *  `04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §8 row 4`. */
/** Sync conflict status values — Wave A19-T5 (Phase 2D).
 *
 * CONTRACT (C08 §3.2 / P8): 'CONFLICTED' is the explicit signal that two
 * concurrent clients edited the same element property and the CRDT auto-merge
 * could not produce valid BIM semantics.  The UI MUST show ConflictResolutionDialog
 * when this status is set.  Silent LWW overwrite is FORBIDDEN. */
export type SyncStatus = 'connected' | 'disconnected' | 'syncing' | 'CONFLICTED';

export interface SyncSlot {
  readonly client: SyncClient | null;
  /** Multiplayer cursor presence.  Phase A: null until Phase C.5.x. */
  readonly presence: PryzmAwareness | null;
  /** CRDT sync status — 'CONFLICTED' triggers the resolution dialog (Wave A19).
   *  Defaults to 'disconnected' until sync client connects. */
  readonly status: SyncStatus;
}

/** Visibility wave-chain evaluator slot — Phase 3A (Wave 19, S114-WIRE),
 *  completed at W3-2.
 *
 *  Exposes `packages/visibility`'s manifest-honoured evaluation surface via
 *  `PryzmRuntime` so UI panels don't import `@pryzm/visibility` directly
 *  (enforces the L5 → L7.5 layer boundary).
 *
 *  ── W3-2: the write side landed (P1 + P7 / C01 §1) ────────────────────────
 *  This slot used to be `{ evaluate }` and nothing else, and its own doc-comment
 *  conceded the gap: *"Phase 3A completion (post-Wave-20) will add a stateful
 *  `subscribe` surface once the per-view visibility intent store lands."* The
 *  store had never landed, so waves 8 and 9 read `activeView.temporaryIsolation`
 *  / `activeView.hiddenElementIds` — two fields NOTHING in production ever wrote.
 *  A fully-tested 11-wave evaluator with no writer resolves every element
 *  visible, forever, no matter what the user asks for.
 *
 *  `intent` is that writer, and it is deliberately reached through the slot
 *  rather than constructed by callers: P1 means one runtime, therefore ONE
 *  authoritative intent store. Three existing `IsolationStateStore` consumers
 *  each `new` their own private instance, which is how "shared visibility state"
 *  became three disagreeing copies; this slot exists so that cannot recur.
 *
 *  ⚠ `evaluate` is UNCHANGED — same signature, same pure semantics, and it still
 *  ignores `intent` entirely. Every existing caller passes a view it built
 *  itself, and silently folding intent into `evaluate` would change the result
 *  of calls that were written to be intent-free. Use `resolve` when you want the
 *  user's intent applied; use `evaluate` when you want the pure chain over a
 *  view you fully control. The two are separate on purpose. */
export interface VisibilitySlot {
  /** Pure 11-wave evaluation of `view` exactly as given. No side effects, no
   *  I/O, no DOM, and NO intent — see the ⚠ note above. */
  readonly evaluate: (
    elements: readonly VisibilityElement[],
    view: VisibilityView,
    flags?: VisibilityFeatureFlags | null,
  ) => ReadonlyMap<string, WaveVisibilityResult>;

  /** `evaluate` with the recorded user intent for `view.id` merged in first —
   *  i.e. `evaluate(elements, intent.applyToView(view), flags)`.
   *
   *  THIS is the function whose output answers "is the user seeing this
   *  element?". Renderers and panels want this one. */
  readonly resolve: (
    elements: readonly VisibilityElement[],
    view: VisibilityView,
    flags?: VisibilityFeatureFlags | null,
  ) => ReadonlyMap<string, WaveVisibilityResult>;

  /** The single per-runtime visibility-intent store (the write surface).
   *  Constructed by `composeRuntime`; disposed by `tearDown`. */
  readonly intent: ViewVisibilityIntentStore;

  /** The `subscribe` surface the original comment promised. Fires with the
   *  view id whose intent changed. Returns an idempotent unsubscribe. */
  readonly subscribe: (listener: (viewId: string) => void) => () => void;

  /** W3-2 — project the ACTIVE view's intent onto the named elements of a scene
   *  graph, writing `node.visible`.
   *
   *  This is the sanctioned replacement for a UI panel walking the scene and
   *  assigning `.visible` itself (P7: the UI states intent, the composition layer
   *  performs it). It touches ONLY nodes whose `userData.id` appears in
   *  `elementIds`, so it cannot clobber a visibility decision some other system
   *  made about a node it was not asked about.
   *
   *  It projects INTENT only — waves 8/9 — not the full 11-wave chain; use
   *  `resolve` when you want the authoritative answer for a known element set.
   *  Returns `{ matched, hidden }` so a caller can tell "hid nothing" from
   *  "matched nothing", which are different failures.
   *
   *  @param root Any object exposing `traverse(cb)`; a `THREE.Object3D` qualifies. */
  readonly applyToScene: (
    root: VisibilitySceneNode | null | undefined,
    elementIds: readonly string[],
  ) => VisibilityProjectionResult;

  /** Record "hide these elements" against the ACTIVE view. Returns `false` when
   *  there is no view to write to (or nothing was named) — so a caller can tell
   *  "recorded" from "discarded" instead of assuming success.
   *
   *  These exist so a panel never handles a view id. Handing view ids to UI code
   *  is how per-view state quietly becomes per-panel state. */
  readonly hide: (elementIds: readonly string[]) => boolean;

  /** Inverse of `hide` — set difference, idempotent. Same return contract. */
  readonly unhide: (elementIds: readonly string[]) => boolean;
}

/** Snapshot of cumulative AI relay spend for the current session.
 *  Populated by `runtime.ai.cost.snapshot()`; surfaced by the
 *  AI cost meter in `RuntimeStatusPill` and the AIPanel header. */
export interface AiCostSnapshot {
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
  /** Per-model breakdown (model id → tokens & cost). */
  readonly perModel: Readonly<Record<string, {
    readonly tokensIn: number;
    readonly tokensOut: number;
    readonly costUsd: number;
  }>>;
}

/** Streamed-chunk callback for `runtime.ai.streamCompletion()`.
 *  `kind: 'token'` fires per delta token; `kind: 'done'` fires once at
 *  the end with the accumulated text + final cost. */
export type AiStreamChunk =
  | Readonly<{ kind: 'token'; delta: string }>
  | Readonly<{ kind: 'done';  text: string; costUsd: number }>;

/** AI slot — Phase A exposed the lazy `getAiHost()` factory only.
 *  Phase F (S81-WIRE F.7.x) promotes this slot to a real surface that
 *  AIPanel/AIChat/AISidebar reach through directly:
 *    runtime.ai.streamCompletion(prompt, ctx, onChunk)
 *    runtime.ai.cost.snapshot()
 *    runtime.ai.model / runtime.ai.setModel(...)
 *  The lazy `getHost()`/`isLoaded()` pair is preserved for
 *  back-compat with the @pryzm/ai-host first-paint contract. */
export interface AiSlot {
  // ── Phase A (lazy host loader, kept) ─────────────────────────────────
  /** Returns the singleton `AiHost` instance, lazy-loaded on first
   *  call (per `@pryzm/ai-host`'s ADR-014 contract — keeps the AI
   *  bytes off the editor's first-paint chunk). */
  getHost(): Promise<unknown>;
  /** Cheap predicate — `true` once `getHost()` has resolved at least
   *  once this session.  Useful for UI to gate "AI is warm" affordances. */
  isLoaded(): boolean;

  // ── #51 Apartment Layout (SPEC-APARTMENT-LAYOUT-GENERATOR §13, A5.3) ──
  /** The AIStore `pendingLayoutOptions` slice — the apartment-layout
   *  workflow persists scored options here; the §11 modal + the execute
   *  handler (A6) read/clear it. Owned by the composition root so it is
   *  reachable through the runtime without a global. */
  readonly layoutOptions: LayoutOptionsStore;
  /** The AI approval queue store passed to `getAiHost({ approvalQueue })`
   *  so the in-process AiPlane exists (workflows register on it). Also the
   *  sink for the existing approval-queue panel. */
  readonly approvalQueue: AiApprovalQueueStore;

  // ── Phase F.7 (relay surface) ────────────────────────────────────────
  /** Currently selected Anthropic model id (e.g. `'claude-haiku-4-5'`). */
  readonly model: string;
  /** Switch the active model.  Subsequent `streamCompletion()` calls
   *  use the new model; the cost-meter perModel map keeps the previous
   *  model's totals intact. */
  setModel(model: string): void;
  /** Cumulative spend tracker.  Phase F first cut returns a zeroed
   *  snapshot (no relay calls have run yet); Phase F.7.4 wires this
   *  to the AnthropicRelay's per-call cost computation. */
  readonly cost: {
    snapshot(): AiCostSnapshot;
    subscribe(listener: (snap: AiCostSnapshot) => void): Disposable;
  };
  /** Stream a completion through the AnthropicRelay.  Phase F first
   *  cut throws `RuntimeNotWiredError('ai.streamCompletion', 'F.7.4')`;
   *  the real wiring lands when the panels are migrated.  Callers
   *  should treat this as available-but-unwired and fall back to the
   *  legacy `src/ai/AnthropicClient` until F.7.4 ships. */
  streamCompletion(
    prompt: string,
    ctx: { projectId: string | null; selectionIds: readonly string[] },
    onChunk: (chunk: AiStreamChunk) => void,
  ): Promise<{ text: string; costUsd: number }>;
}

/** A single plugin descriptor exposed by `runtime.plugins.list()`.
 *  Phase F first cut synthesises one descriptor per directory under
 *  `plugins/`; Phase F.4 promotes this to a Zod-validated descriptor
 *  loaded from each plugin's `plugin.manifest.json`. */
export interface PluginDescriptor {
  /** Stable identifier — matches the directory name under `plugins/`. */
  readonly id: string;
  /** Human-readable title surfaced by the marketplace + status pill. */
  readonly title: string;
  /** Coarse classification used by `byKind()`.  Phase F first cut
   *  derives this from the plugin id; Phase F.4 reads it from the
   *  Zod-validated manifest. */
  readonly kind:
    | 'element'        // 12 element families (wall, slab, …)
    | 'view'           // plan-view, section-view, sheets
    | 'ai'             // ai-floorplan, ai-generative, ai-rules, …
    | 'import-export'  // ifc-import, ifc-export, rhino-import, bcf
    | 'inspector'      // ifc-inspector, schedules
    | 'overlay'        // grid, dimensions, annotations
    | 'collab'         // multiplayer, selection
    | 'misc';
  /** `true` if the plugin is wired into the runtime (its package
   *  resolves and the descriptor was found); `false` if the directory
   *  exists but the descriptor / index could not be resolved. */
  readonly enabled: boolean;
}

/** A toolbar contribution rendered into one of the five discipline rails
 *  (ARCHITECTURE / STRUCTURE / SERVICES / INTERIORS / LANDSCAPE) in
 *  `CreateRailPanel`.  F-launch.1 ships the first one (Wall → Architecture);
 *  F.1.02 .. F.1.13 add the remaining 12 element families and F.1.14 deletes
 *  the hard-coded discipline arrays in `CreateRailPanel._buildSections()`. */
export interface ToolbarDisciplineContribution {
  /** Discriminator — selects this contribution kind in `contributions()`. */
  readonly kind: 'toolbar.discipline';
  /** Stable id (e.g. `'wall.tool'`).  Used by `CreateRailPanel` to
   *  dedupe against the legacy hard-coded entries during the F.1
   *  transition window. */
  readonly id: string;
  /** Which of the five discipline rails this tool lives in. */
  readonly discipline: 'architecture' | 'structure' | 'services' | 'interiors' | 'landscape';
  /** Hover label shown on the rail button. */
  readonly label: string;
  /** Icon glyph key — resolved against `PryzmIcons` in the rail panel. */
  readonly icon: string;
  /** Optional Alt-prefix shortcut string (e.g. `'Alt+W'`).  Format spec
   *  documented in `docs/00_AI_COMMANDS_REFERENCE/PRYZM-CREATION-SHORTCUTS.md`. */
  readonly shortcut?: string;
  /** Activation hook — receives the live runtime so the contribution
   *  can route through `runtime.tools.activate(family, mode?)` (or any
   *  other slot) without taking a static dep on the editor layer. */
  readonly activate: (runtime: PryzmRuntime) => void;
}

/** Discriminated union of every contribution kind the plugin host
 *  recognises.  F-launch.1 ships only one variant; F.2.x / F.3.x add
 *  panel / overlay / inspector / view-action contributions per S72 §3.3. */
export type PluginContribution = ToolbarDisciplineContribution;

/** Plugin host slot — Phase A returned `[]` for every kind; Phase F
 *  first cut promotes the slot with `list()`, `count`, `byKind()` and
 *  `get(id)` returning real plugin descriptors.  F-launch.1 (S81 F.1.01)
 *  wires `contributions()` + `register()` for the first contribution
 *  kind (`'toolbar.discipline'`). */
export interface PluginsSlot {
  /** Enumerate contributions for a host kind.  Returns the registered
   *  contributions in registration order (alphabetical-by-plugin-id at
   *  boot, then append order for runtime `register()` calls). */
  contributions(kind: 'toolbar.discipline'): readonly ToolbarDisciplineContribution[];
  contributions<K extends string>(kind: K): readonly PluginContribution[];
  /** Dynamically register a contribution.  Returns a `Disposable` that
   *  removes the contribution when invoked (idempotent).  F-launch.1
   *  ships the real implementation; F.4.x adds Zod validation against
   *  the marketplace manifest. */
  register(contribution: PluginContribution): Disposable;

  // ── Phase F first cut (real descriptor enumeration) ──────────────────
  /** Total registered plugin count.  Equals `list().length`. */
  readonly count: number;
  /** All registered plugin descriptors, frozen.  Order is stable
   *  (alphabetical by id). */
  list(): readonly PluginDescriptor[];
  /** Lookup by id (matches the directory name under `plugins/`). */
  get(id: string): PluginDescriptor | null;
  /** Filter `list()` by `kind`. */
  byKind(kind: PluginDescriptor['kind']): readonly PluginDescriptor[];
}

/** Per-call options for `runtime.ifc.import.start()`. */
export interface IfcImportOptions {
  /** Optional progress sink — fires from 0..1 as parsing + tier-2
   *  conversion progresses.  Phase F first cut may not fire (the
   *  underlying `@pryzm/plugin-ifc-import` parses synchronously); the
   *  callback is part of the contract for the streaming relay. */
  readonly onProgress?: (fraction: number) => void;
}

/** Result of a successful `runtime.ifc.import.start()` call. */
export interface IfcImportResult {
  readonly elementCount: number;
  readonly globalIds: readonly string[];
  /** The `IFCMetaStoreLike` populated during import; later passed back
   *  to `runtime.ifc.export.run()` to round-trip Pset state. */
  readonly metaStore: unknown;
}

/** Per-call options for `runtime.ifc.export.run()`. */
export interface IfcExportOptions {
  readonly scope: 'project' | 'level' | 'selection';
  readonly schema: 'IFC4' | 'IFC2x3';
  readonly projectName?: string;
  /** The meta-store from a previous import; required for round-trip
   *  Pset preservation per S56. */
  readonly metaStore: unknown;
}

/** Result of a successful `runtime.ifc.export.run()` call. */
export interface IfcExportResult {
  readonly bytes: Uint8Array;
  readonly elementCount: number;
}

/** IFC slot — Phase F first cut wraps `@pryzm/plugin-ifc-import`,
 *  `@pryzm/plugin-ifc-export`, and `@pryzm/plugin-ifc-inspector` as
 *  a runtime singleton facade.  All three sub-modules are
 *  lazy-loaded on first call to keep the IFC bytes off the editor's
 *  first-paint chunk. */
export interface IfcSlot {
  /** `true` once at least one of import/export/inspector has been
   *  resolved (lazy import completed).  Drives the status pill. */
  isLoaded(): boolean;
  readonly import: {
    start(file: File | Blob | ArrayBuffer, opts?: IfcImportOptions): Promise<IfcImportResult>;
  };
  readonly export: {
    run(opts: IfcExportOptions): Promise<IfcExportResult>;
  };
  /** Lazy access to the IFC inspector subsystem (ProjectBrowser,
   *  PsetEditor).  Phase F.12 wires the inspector panel through this. */
  inspector(): Promise<unknown>;
}

/** Rhino slot — wraps `@pryzm/plugin-rhino-import` (3dm reader).
 *  Lazy-loaded on first call. */
export interface RhinoSlot {
  isLoaded(): boolean;
  readonly import: {
    start(file: File | Blob | ArrayBuffer): Promise<{
      readonly objectCount: number;
      readonly layers: readonly { readonly name: string; readonly visible: boolean }[];
    }>;
  };
}

/** BCF slot — wraps `@pryzm/plugin-bcf` reader/writer (Solibri-parity
 *  BCF 3.0). */
export interface BcfSlot {
  isLoaded(): boolean;
  read(file: File | Blob | ArrayBuffer): Promise<unknown>;
  write(archive: unknown): Promise<Uint8Array>;
}

/** PDF slot — Phase F.12 placeholder.  No `plugins/pdf/` package
 *  exists yet; every method throws `RuntimeNotWiredError` until that
 *  sub-phase ships. */
export interface PdfSlot {
  isLoaded(): boolean;
  importPlan(file: File | Blob | ArrayBuffer): Promise<unknown>;
  exportSheet(sheetId: string): Promise<Uint8Array>;
}

/** Toasts slot — typed wrapper over the existing `showAppToast`
 *  singleton (per S72 §16.1 A.6).  Same DOM, no behavioural change.
 *  Phase A finishes this slot; later phases retire the
 *  `import { showAppToast }` callsites in favour of `runtime.toasts.show`. */
export interface ToastsSlot {
  show(message: string, kind?: ToastKind, durationMs?: number): Disposable;
  info(message: string, durationMs?: number): Disposable;
  success(message: string, durationMs?: number): Disposable;
  warn(message: string, durationMs?: number): Disposable;
  error(message: string, durationMs?: number): Disposable;
}

/** User-preferences slot — wraps the existing localStorage-backed
 *  preference reads (`UiPreferences`, `OwnerFeatureFlags`, …).  Phase A
 *  exposes a typed get/set pair; Phase C.9 unifies the existing
 *  `localStorage` callers behind it. */
export interface UserPreferencesSlot {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  subscribe<T>(key: string, listener: (value: T | undefined) => void): Disposable;
}

/** Scene slot — owns the renderer + scheduler + committer host +
 *  shared MaterialPool.  Phase A populates these from
 *  `bootstrapRenderEverything()` (or leaves them `null` when no
 *  canvas was supplied / the renderer init failed soft).  The
 *  `'scene.ready'` event fires once `renderer` becomes non-null.
 *
 *  Wave 4 Track A.7 (D.5.A.7, 2026-04-30 evening): `renderer` and
 *  `materialPool` tightened from `unknown | null` to `Renderer | null`
 *  / `MaterialPool | null` respectively (mirrors the matching
 *  `SceneSlotShape` in `@pryzm/renderer/SceneBootstrap.ts` byte-for-byte
 *  so the slot assignment in `composeRuntime()` stays adapter-free).
 *
 *  Wave 4 Track A SceneSlot follow-on #1 (D.5.A.9, 2026-04-30 evening):
 *  `scheduler` tightened from `unknown` to `FrameScheduler | null`.
 *
 *  Wave 4 Track A SceneSlot follow-on #2 (D.5.A.10, 2026-04-30 evening):
 *  `host` and `committer` (its canonical alias) both tightened from
 *  `unknown` to `CommitterHost` (non-null — the CommitterHost is
 *  constructed synchronously by `apps/editor/src/bootstrap.ts:106`
 *  and threaded through every scene-slot path unchanged).
 *  `CommitterHost` is re-exported from `@pryzm/renderer` (which
 *  already depends on `@pryzm/scene-committer`) — same canonical
 *  re-export pattern as `MaterialPool` and `FrameScheduler`, so
 *  `runtime-composer` does not need a new direct
 *  `@pryzm/scene-committer` dep edge.
 *
 *  After D.5.A.10 the `SceneSlot` interface is `unknown`-free
 *  end-to-end (every nested field has a concrete type), and the entire
 *  `PryzmRuntime` surface is `unknown`-free at every slot field —
 *  Wave 5 cast deletion at every `runtime.scene.*` call site becomes
 *  purely mechanical.
 *  Anchors: `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2 PR 4.A.7`
 *  + `§2.5 SceneSlot follow-on #1, #2`,
 *  `04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §8 (Wave 4 Track A run-rate)`. */
export interface SceneSlot {
  /** The renderer; `null` until the async `Renderer.init()` resolves
   *  (or permanently `null` when the GPU init failed soft). */
  readonly renderer: Renderer | null;
  /** The FrameScheduler; non-null after `bootstrapScene()` resolves
   *  successfully, `null` on the soft-fail + idle (no-canvas) paths.
   *  D.5.A.9 (2026-04-30 evening): tightened from `unknown` to
   *  `FrameScheduler | null` (Wave-4 Track A SceneSlot follow-on PR #1).
   *  The `null` half preserves the soft-fail-init semantics where the
   *  scheduler was never constructed.  `FrameScheduler` is re-exported
   *  from `@pryzm/renderer` (which already depends on
   *  `@pryzm/frame-scheduler`) — same canonical re-export pattern as
   *  `MaterialPool`, so `runtime-composer` does not need a new direct
   *  `@pryzm/frame-scheduler` dep edge. */
  readonly scheduler: FrameScheduler | null;
  /** Always present — the CommitterHost is constructed synchronously
   *  by `apps/editor/src/bootstrap.ts:106` (`new CommitterHost()`) and
   *  threaded through every scene-slot path (success / soft-fail / idle)
   *  unchanged; it is NEVER null at this surface.
   *  D.5.A.10 (2026-04-30 evening): tightened from `unknown` to
   *  `CommitterHost` (Wave-4 Track A SceneSlot follow-on PR #2).
   *  `CommitterHost` is re-exported from `@pryzm/renderer` (which
   *  already depends on `@pryzm/scene-committer`) — same canonical
   *  re-export pattern as `MaterialPool` and `FrameScheduler`. */
  readonly host: CommitterHost;
  /** Canonical alias for `host` per chunks/22 §22.3 Flow 3 stage 4
   *  ("Scene assemble → `runtime.scene.committer.commit(snapshot)`").
   *  Returns the SAME `CommitterHost` instance as `host` — `host` is
   *  the engine-implementation-side name (the host that owns per-store
   *  committer registrations), `committer` is the architectural-spec
   *  name (the surface that receives commits).  Both are wired to the
   *  same backing field; consumers may use either.  In a future wave
   *  `host` becomes a deprecated alias and `committer` is the only
   *  documented name.
   *  D.5.A.10 (2026-04-30 evening): tightened from `unknown` to
   *  `CommitterHost` in lockstep with `host` (both fields share the
   *  same backing instance and therefore the same concrete type). */
  readonly committer: CommitterHost;
  /** Always present — the shared MaterialPool is constructed synchronously.
   *  D.5.A.7 (2026-04-30): tightened `unknown` → `MaterialPool | null`
   *  (the `null` half preserves the soft-fail-init semantics where
   *  the renderer half failed before the pool was constructed). */
  readonly materialPool: MaterialPool | null;
  /** Reason the renderer is `null`, when applicable.  `null` means
   *  "init in progress or succeeded"; an Error means "init failed soft". */
  readonly rendererError: Error | null;
  /** Mount the scene against a canvas AFTER `composeRuntime()` has
   *  resolved.  This is the typed entry point named by
   *  `04-PLAN-FORWARD/04-END-TO-END-FLOWS-AND-COVERAGE.md` Flow 1
   *  stage 4 ("First runtime tick → scene canvas → `runtime.scene.mount()`",
   *  Wave 4 D.4.1).
   *
   *  Semantics — mirror the compose-time `opts.canvas` path exactly:
   *    * Soft-fail on any error inside `bootstrapScene()` (the slot's
   *      `renderer` stays `null`, `rendererError` carries the Error).
   *    * Emits the `pryzm.bootstrap.scene` OTel span owned by
   *      `@pryzm/renderer/SceneBootstrap` (P8).
   *    * Fires `events.emit('scene.ready', { renderer, canvas })` on
   *      success — the same event Flow 3 stage 4 awaits.
   *    * Idempotent on a per-canvas basis: a second `mount(sameCanvas)`
   *      resolves immediately and does not re-emit `scene.ready`.
   *    * Mounting a different canvas after the first one will reject
   *      with a typed `Error` (the renderer is single-canvas; project
   *      switches go through `tearDown()` + a fresh `composeRuntime()`).
   *
   *  Returns when the renderer init resolves OR soft-fails — the
   *  caller never has to handle a rejection from the renderer itself. */
  mount(
    canvas: HTMLCanvasElement,
    mode?: 'auto' | 'webgpu' | 'webgl2',
  ): Promise<void>;

  /** Snap sub-slot — Phase F.4.3 / F.5.5 / F.5.6.  `mode` is the current
   *  snap mode; `candidate` is the nearest snappable geometry hit under the
   *  pointer.  Phase F stub: mode = 'off', candidate = null.  Phase D wires
   *  the real snap-engine sub-system. */
  readonly snap: {
    readonly mode: 'off' | 'grid' | 'vertex' | 'edge' | 'face';
    setMode(mode: 'off' | 'grid' | 'vertex' | 'edge' | 'face'): void;
    readonly candidate: {
      readonly point: { readonly x: number; readonly y: number; readonly z: number };
      readonly kind: string;
    } | null;
  };
}

// ---------------------------------------------------------------------------
//                Phase C — UndoStack + Phase-D placeholders
// ---------------------------------------------------------------------------

export interface UndoStackState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
}

/** Undo/redo slot — drives SaveUndoRedoHUD's Cmd+Z / Cmd+Shift+Z.
 *  Phase C wraps the legacy `commandManager` global; Phase D ships
 *  the real Immer reverse-apply backend driven by EventLog inverse
 *  patches.  Implemented by `@pryzm/runtime-undo-stack`. */
export interface UndoStackSlot {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  subscribe(listener: (state: UndoStackState) => void): Disposable;
}

/** The three valid platform surfaces.  Renamed from `WorkspaceMode` in
 *  PR 4.A.3 (Wave 4 Track A) so the name `WorkspaceMode` can be
 *  repurposed for the render-mode discriminant (`'3d'|'plan'|'section'`)
 *  owned by `runtime.workspaceMode`.  `WorkspaceSlot` — which drives the
 *  landing/hub/workspace surface flip — uses this type. */
export type WorkspaceSurfaceKind = 'landing' | 'hub' | 'workspace';

/** The three valid render/view modes for the workspace surface.
 *  Owned by `runtime.workspaceMode` (`WorkspaceModeController`).
 *
 *  PR 4.A.3 (Wave 4 Track A): repurposed from the prior
 *  `'landing'|'hub'|'workspace'` shape (now `WorkspaceSurfaceKind`) so
 *  `WorkspaceMode` refers to the *render* mode discriminant from here
 *  on.  `'plan'` / `'section'` are forward-declared; their real asset
 *  pipelines land in Phase 2A / 2B per ADR-0016. */
export type WorkspaceMode = '3d' | 'plan' | 'section';

/** Workspace slot — Phase D placeholder (declared in Phase C so panels
 *  can name it in their constructors).  Will own the
 *  landing/hub/workspace mode state currently held by PlatformShell.
 *
 *  The `show()` method, added in **D.12-prep** per
 *  `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.D.12, is the
 *  Promise-returning mount-aware sibling of `setMode()`.  It exists
 *  so the single largest bridge cast in `src/ui/`,
 *  `(window as any).platformShell.show(mode)`, gets a typed home
 *  today; the cast removal lands in **D.12 proper** (gated on D.4).
 *
 *  Contract distinction (preserved across D.9-prep / D.12-prep / D.12):
 *    * `setMode(mode)` — synchronous, mutates mode state + fans-out
 *      subscribers.  No mount/unmount work.  Used by gestures that
 *      only need to flip the active surface label.
 *    * `show(mode)` — async, returns once the surface is fully
 *      mounted (DOM created, async data loaded, render-loop
 *      attached).  Today the prep stub resolves immediately after
 *      mirroring `setMode()`; D.12 proper backs this with the real
 *      PlatformShell mount sequence. */
export interface WorkspaceSlot {
  readonly mode: WorkspaceSurfaceKind;
  setMode(mode: WorkspaceSurfaceKind): void;
  /** Mount-aware mode switch — D.12-prep adds the typed signature; D.12
   *  proper backs it with the real PlatformShell mount sequence.  See
   *  the contract distinction above. */
  show(mode: WorkspaceSurfaceKind): Promise<void>;
  subscribe(listener: (mode: WorkspaceSurfaceKind) => void): Disposable;
  /** PR 4.A.4 (Wave 4 Track A) — typed mount/dispose handle backed by
   *  `WorkspaceSurface` from `@pryzm/renderer-three`.  Replaces the
   *  deleted-in-D.4.5 `workspace bridge (D.4)` and the legacy
   *  `(window as any).platformShell.setProjectContext(...)` cast.
   *
   *  Call `runtime.workspace.surface.mount(platformShell)` during boot
   *  to attach the typed host, then `surface.setProjectContext(id, name,
   *  opts?)` in place of the cast.  `surface.dispose()` is called by
   *  `runtime.tearDown()` (wired in D.12 proper). */
  readonly surface: WorkspaceSurface;
}

/** WorkspaceModeController slot — Wave 4 Track A PR 4.A.3.  Owns the
 *  render/view mode state for the workspace surface (`'3d'|'plan'|'section'`).
 *  Distinct from `WorkspaceSlot` (which drives the platform surface flip
 *  between `'landing'|'hub'|'workspace'`).
 *
 *  The controller is a D.9-prep-style stub today: `set()` mutates `mode`
 *  locally, fans out to per-slot subscribers, and emits the typed
 *  `'workspace.modeChanged'` event.  Phase 2A / 2B wire the real plan /
 *  section rendering pipelines without a slot-contract change. */
export interface WorkspaceModeController {
  readonly mode: WorkspaceMode;
  set(mode: WorkspaceMode): void;
  subscribe(listener: (mode: WorkspaceMode) => void): Disposable;
}

/** Camera controller slot — Wave 4 Track A PR 4.A.2.  Owns the per-canvas
 *  orbit camera that `@pryzm/renderer`'s `CameraController` backs.
 *
 *  `current` is `null` until `runtime.scene.mount(canvas)` resolves (or
 *  permanently `null` on soft-fail); all mutation methods no-op + warn-once
 *  when `current` is `null`.  D.10 proper wires the live framing logic. */
export interface CameraControllerSlot {
  /** The live `CameraController` instance, or `null` before mount. */
  readonly current: CameraController | null;
  /** Apply a THREE-free `PlainPose` to the live controller.  No-op +
   *  warn-once when `current` is `null`.  Emits
   *  `'cameraController.poseChanged'` with the *post-apply* snapshot. */
  set(pose: PlainPose): void;
  /** Read the current camera pose.  Returns `null` when `current` is `null`.
   *  THREE-free shape (`{x,y,z}` tuples) for W-02 / non-renderer callers. */
  snapshot(): PlainPose | null;
  /** D.10-prep stubs — no-op + warn-once until D.10 wires the per-element
   *  framing logic from `viewport/CameraController`. */
  frameElement(id: string): void;
  frameAll(): void;
}

/** Public summary of a registered view, surfaced through
 *  `ViewRegistrySlot.list()`.  The discriminator `kind` is the
 *  forward-looking enum from `PRYZM2-WIREUP-PLAN-S72` §II.D.11 —
 *  today only `'3d'` is populated (S17 ships `3d-perspective` /
 *  `3d-orthographic` only); `'plan' | 'section' | 'sheet'` light up
 *  as those view kinds land in 2A / 2B per `ViewDefinition.ts` §6-8. */
export interface ViewRegistrySummary {
  readonly id: string;
  readonly name: string;
  readonly kind: 'plan' | 'section' | '3d' | 'sheet';
}

/** ViewRegistry slot — Phase D.11-prep.  Per
 *  `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.D.11, the legacy
 *  `viewRegistry: unknown` slot is tightened to a typed surface so
 *  callers can name `runtime.viewRegistry.activate(viewId)` and
 *  `.list()` from their constructors today.  The real activation
 *  pipeline (which dispatches the `view.switch` command and rewires
 *  camera + visibility filters) lands in **D.11** proper; D.11-prep
 *  ships an adapter that:
 *    * proxies `list()` to the underlying `ViewRegistry` Store snapshot
 *      (so the surface is **already populated** with real data),
 *    * tracks `activeViewId` from `activate()` calls (no real
 *      activation yet — emits a `'viewRegistry.activate'` event on
 *      `runtime.events` + a one-shot `[D.11-prep stub]` warn),
 *    * exposes `subscribe(listener)` whose listeners fire on every
 *      `activate()`, including the stub one.
 *  This is the same shape D.9-prep used for `workspace` /
 *  `cameraController` — surface today, real wiring in the named
 *  destination sub-phase. */
/** Spec for what a panel shows — passed to `activatePanel()`.
 *  Intentionally open-ended so Wave 6 panels can express their content
 *  contract without a rigid schema; D.11 proper will tighten the type
 *  once all 39 panels have been real-bound and the common fields emerge. */
export interface PanelViewSpec {
  /** Human-readable label shown in breadcrumbs and developer tools. */
  readonly label?: string;
  /** Arbitrary panel-specific metadata (element type, mode, etc.). */
  readonly [key: string]: unknown;
}

export interface ViewRegistrySlot {
  readonly activeViewId: string | null;
  activate(viewId: string): Promise<void>;
  list(): readonly ViewRegistrySummary[];
  subscribe(listener: (viewId: string | null) => void): Disposable;

  // ── Wave 6 panel-binding API ─────────────────────────────────────────────
  // Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2
  //
  // "Real binding" means every panel calls activatePanel() on mount and
  // deactivatePanel() on unmount, so the runtime always has an accurate
  // picture of which panels are visible.  This is the typed contract that
  // Phase F plugin developers will eventually consume — establishing it now
  // via Wave 6 means plugins can react to panel visibility changes through a
  // stable surface (P6: commands are the only mutation path; panel visibility
  // is communicated through the runtime, not through direct store writes).
  //
  // OTel span: pryzm.ui.panel.activate / pryzm.ui.panel.deactivate  (P8)

  /** Register a panel as currently visible in the UI.
   *  Idempotent — calling with the same `panelId` twice before deactivating
   *  is a no-op (the second call is silently ignored).
   *  OTel span: `pryzm.ui.panel.activate` (P8 — one span per public fn). */
  activatePanel(panelId: string, viewSpec?: PanelViewSpec): void;

  /** Remove a panel from the set of currently-visible panels.
   *  Idempotent — calling for a panel that is not active is a no-op.
   *  OTel span: `pryzm.ui.panel.deactivate` (P8). */
  deactivatePanel(panelId: string): void;

  /** Snapshot of currently-active panel IDs.  Stable reference — the
   *  Set is re-created on every `activatePanel`/`deactivatePanel` call,
   *  so callers who subscribe via `subscribePanelChange` should use the
   *  callback argument rather than caching the return value of this method. */
  getActivePanelIds(): ReadonlySet<string>;

  /** Subscribe to panel-set changes.  Fires synchronously after every
   *  `activatePanel()` / `deactivatePanel()` call with the new set. */
  subscribePanelChange(listener: (activePanelIds: ReadonlySet<string>) => void): Disposable;
}

// ---------------------------------------------------------------------------
//                Phase 1A — physics-host slot (Wave-8-D2)
// ---------------------------------------------------------------------------
//
// Spec: `docs/archive/pryzm3-internal/reference/phases/PHASE-1/1A-SKELETON-RAILS.md`
// renderer-track row "physics-host package + composeRuntime slot".
//
// The host owns the broad-phase spatial query backend (raycast / AABB /
// point-in-volume) used by the renderer's picking pipeline + the tool
// layer's snap/intersection queries.  PRYZM is NOT a game engine — there
// is no impulse solver; this is a kinematic query surface only.
//
// Phase 1A ships a Null backend (every query returns the empty result,
// `isReady() === false`).  Phase 1D wires the WASM-BVH backend over
// `three-mesh-bvh` without a slot-contract change.

/** A 3D vector in world units.  Tuple type avoids THREE.Vector3
 *  imports and keeps the contract free of geometry dependencies. */
export type PhysicsVec3 = readonly [number, number, number];

/** AABB query input — half-open box `[min, max]` in world space. */
export interface PhysicsAabbBox {
  readonly min: PhysicsVec3;
  readonly max: PhysicsVec3;
}

/** Result of a successful raycast — element ID + hit point + normal. */
export interface PhysicsRaycastHit {
  readonly elementId: string;
  readonly point: PhysicsVec3;
  readonly normal: PhysicsVec3;
  readonly distance: number;
}

/** Physics-host slot — broad-phase spatial query surface.  Implemented
 *  by `@pryzm/physics-host`'s `NullPhysicsHost` in Phase 1A; swapped
 *  for the WASM-BVH backend in Phase 1D without a signature change. */
export interface PhysicsHostSlot {
  /** True once the underlying spatial index has loaded enough geometry
   *  to answer queries.  Phase 1A `NullPhysicsHost` always returns
   *  `false`; callers may branch on this without inspecting the
   *  concrete class. */
  isReady(): boolean;

  /** Cast a ray from `origin` in `direction` (need not be normalized).
   *  Returns the closest hit or `null`.  Phase 1A returns `null`. */
  raycast(origin: PhysicsVec3, direction: PhysicsVec3, maxDistance?: number): PhysicsRaycastHit | null;

  /** Element IDs whose world-space AABB intersects `box`.  Phase 1A
   *  returns the empty array. */
  queryAabb(box: PhysicsAabbBox): readonly string[];

  /** Element IDs whose volume contains `point` (point-in-polyhedron
   *  test).  Phase 1A returns the empty array. */
  pointInVolume(point: PhysicsVec3): readonly string[];

  /** Idempotent.  `composeRuntime`'s `tearDown()` calls this last. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
//                Phase 1A — input-host slot (Wave-8-D3)
// ---------------------------------------------------------------------------
//
// Spec: `docs/archive/pryzm3-internal/reference/phases/PHASE-1/1A-SKELETON-RAILS.md`
// renderer-track row "input-host package + composeRuntime slot".
//
// The host owns the canonical pointer / wheel / keyboard event source.
// Tools / panels / picking subscribe through `runtime.inputHost.*`
// instead of attaching their own `addEventListener` calls to
// `window` / `canvas`.  Phase 1A ships a Null backend (records
// subscribers, never emits); Phase 1B wires `DomInputHost` over
// real DOM listeners without a slot-contract change.

/** The 6 input channels surfaced by the host. */
export type InputChannel =
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'wheel'
  | 'keydown'
  | 'keyup';

/** Live modifier mask at the time of the event. */
export interface InputModifierMask {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

/** A 2D point in canvas pixel space (origin top-left). */
export interface InputCanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface InputPointerEventPayload {
  readonly channel: 'pointerdown' | 'pointerup' | 'pointermove';
  readonly point: InputCanvasPoint;
  readonly button: 0 | 1 | 2 | -1;
  readonly buttons: number;
  readonly modifiers: InputModifierMask;
  readonly pointerType: 'mouse' | 'pen' | 'touch';
  readonly timestamp: number;
}

export interface InputWheelEventPayload {
  readonly channel: 'wheel';
  readonly point: InputCanvasPoint;
  readonly deltaY: number;
  readonly modifiers: InputModifierMask;
  readonly timestamp: number;
}

export interface InputKeyEventPayload {
  readonly channel: 'keydown' | 'keyup';
  readonly key: string;
  readonly code: string;
  readonly repeat: boolean;
  readonly modifiers: InputModifierMask;
  readonly timestamp: number;
}

/** Map channel → typed event payload — used by `subscribe<C>(channel, handler)`. */
export interface InputEventByChannel {
  pointerdown: InputPointerEventPayload;
  pointerup: InputPointerEventPayload;
  pointermove: InputPointerEventPayload;
  wheel: InputWheelEventPayload;
  keydown: InputKeyEventPayload;
  keyup: InputKeyEventPayload;
}

/** Input-host slot — canonical event source.  Implemented by
 *  `@pryzm/input-host`'s `NullInputHost` in Phase 1A; swapped for
 *  `DomInputHost` in Phase 1B without a signature change. */
export interface InputHostSlot {
  /** True once the host has attached its DOM listeners.  Phase 1A
   *  always returns `false`. */
  isReady(): boolean;

  /** Live modifier mask.  Phase 1A always returns the all-false mask. */
  getModifiers(): InputModifierMask;

  /** Subscribe to a single channel.  Returns a disposer (idempotent). */
  subscribe<C extends InputChannel>(
    channel: C,
    handler: (event: InputEventByChannel[C]) => void,
  ): Disposable;

  /** Idempotent. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
//         Wave 14 slots 19-29 — F-phase additions (2026-05-03)
// ---------------------------------------------------------------------------

/** Auth slot — Phase F.6.1.  signIn/signUp delegate to the auth sub-client
 *  of `runtime.persistence.client`; `currentUser` is `null` until the user
 *  authenticates.  Phase F stub: signIn/signUp/signOut throw
 *  RuntimeNotWiredError; currentUser = null.  Phase C.auth wires the real
 *  adapter. */
export interface AuthSlot {
  readonly currentUser: { readonly id: string; readonly email: string } | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<void>;
  signOut(): Promise<void>;
}

/** Global keyboard-shortcuts router — Phase F.5.4 / F.6.3.
 *  dispatch fires a keydown event through the registered handler tree;
 *  register adds a new leaf handler and returns a disposer.
 *  Phase F stub: dispatch is a no-op; register returns a no-op disposer. */
export interface ShortcutsSlot {
  dispatch(key: string): void;
  register(key: string, handler: () => void): Disposable;
}

/** Toast slot — Phase F.6.4.  Thin re-export of `runtime.toasts` under
 *  the canonical Wave-14 name `runtime.toast` (singular).  Both resolve
 *  to the same underlying slot and DOM; Wave 15 will retire `runtime.toasts`. */
export interface ToastSlot {
  show(message: string, kind?: 'info' | 'success' | 'warn' | 'error', durationMs?: number): Disposable;
  info(message: string, durationMs?: number): Disposable;
  success(message: string, durationMs?: number): Disposable;
  warn(message: string, durationMs?: number): Disposable;
  error(message: string, durationMs?: number): Disposable;
}

/** Renderer debug metrics snapshot returned by `DebugSlot.metrics()`. */
export interface DebugMetrics {
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly memMB: number;
}

/** Debug slot — Phase F.5.7.  Dev-only overlay reads fps / drawCalls /
 *  triangles / memMB from the renderer.  Phase F stub returns zeroed
 *  DebugMetrics; subscriber fires immediately.  Phase D wires real stats. */
export interface DebugSlot {
  metrics(): DebugMetrics;
  subscribe(listener: (metrics: DebugMetrics) => void): Disposable;
}

/** Export slot — Phase F.10.2.  Wraps 5 export pathways; every method
 *  throws RuntimeNotWiredError until the matching plugin ships. */
export interface ExportSlot {
  ifc(opts?: { readonly projectId?: string }): Promise<Uint8Array>;
  glb(opts?: { readonly projectId?: string }): Promise<Uint8Array>;
  pdf(opts?: { readonly sheetId?: string }): Promise<Uint8Array>;
  csv(opts?: { readonly scheduleId?: string }): Promise<Uint8Array>;
  panorama(opts?: { readonly viewId?: string }): Promise<Uint8Array>;
}

/** Entitlements slot — Phase F.7.1 / F.11.1.  check() gates feature access
 *  by feature key; Phase F stub always returns true (open sentinel). */
export interface EntitlementsSlot {
  check(feature: string): boolean;
  subscribe(listener: (features: ReadonlySet<string>) => void): Disposable;
}

/** CDE slot — Phase F.11.3.  structuredName applies a Common Data
 *  Environment naming convention to a raw element id; isConnected()
 *  is false until a CDE adapter is configured by a project admin. */
export interface CdeSlot {
  structuredName(rawId: string): string;
  isConnected(): boolean;
}

/** Geospatial slot — Phase F.11.4.  project/unproject convert between
 *  WGS-84 lat/lng and scene XYZ; both throw RuntimeNotWiredError until
 *  the geographic origin is set.  isConfigured() = false until set. */
export interface GeospatialSlot {
  project(latLng: {
    readonly lat: number;
    readonly lng: number;
    readonly alt?: number;
  }): { readonly x: number; readonly y: number; readonly z: number };
  unproject(xyz: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }): { readonly lat: number; readonly lng: number; readonly alt: number };
  isConfigured(): boolean;
}

/** Physics dev-overlay metrics snapshot returned by `PhysicsDevSlot.metrics()`. */
export interface PhysicsDevMetrics {
  readonly rigidBodies: number;
  readonly contacts: number;
  readonly ms: number;
}

/** Physics dev slot — Phase F.12.2.  Dev-only overlay reads rigid-body
 *  count / contact count / physics-step ms from the physics host.
 *  Phase F stub returns zeroed PhysicsDevMetrics. */
export interface PhysicsDevSlot {
  metrics(): PhysicsDevMetrics;
  subscribe(listener: (metrics: PhysicsDevMetrics) => void): Disposable;
}

/** Structural slot — Phase F.12.3.  loadPaths queries the structural
 *  analysis subsystem for per-element force vectors.  Phase F stub
 *  returns [] and fires the subscriber immediately with []. */
export interface StructuralSlot {
  loadPaths(elementIds: readonly string[]): ReadonlyArray<{
    readonly id: string;
    readonly forces: readonly number[];
  }>;
  subscribe(listener: (paths: ReadonlyArray<{
    readonly id: string;
    readonly forces: readonly number[];
  }>) => void): Disposable;
}

/** Search slot — Phase F.6.5.  run() executes a project-scoped full-text
 *  search; Phase F stub resolves to an empty array. */
export interface SearchSlot {
  run(
    query: string,
    opts?: { readonly limit?: number },
  ): Promise<ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly label: string;
  }>>;
}

/** The composed runtime — the contract.  Every PRYZM 2 panel reaches
 *  the engine through this handle and only this handle. */
export interface PryzmRuntime {
  /** Audit metadata stamped onto every command — projectId is mutated
   *  in place via `projectContext.set(...)` when a project opens. */
  readonly audit: RuntimeAudit;

  // ── Slot 1 — scene (renderer / scheduler / host / materialPool) ─────────
  readonly scene: SceneSlot;

  // ── Slot 2 — stores (12 element-family + view) ──────────────────────────
  /** Typed stores umbrella introduced in Wave 7.  Exposes `hydrate(snapshot)`
   *  as the canonical project-snapshot fan-out leg and `registerHydrator()`
   *  for the engine-layer wiring.  Per-store typed accessors (`stores.walls`,
   *  `stores.slabs`, …) land in Phase E once the element families migrate. */
  readonly stores: StoresSlot;

  // ── Slot 3 — bus (the L2 CommandBus) ────────────────────────────────────
  //
  // D.5.A.8 (2026-04-30 evening): `registry` tightened from
  // `ReadonlyMap<string, unknown>` to
  // `ReadonlyMap<string, CommandHandler<unknown, AnyStores>>`.  This is
  // the eighth and final Wave-4 Track A typed-slot PR — with this, the
  // top-level `PryzmRuntime` interface has zero `unknown` slots.  The
  // runtime composer reads `inner.bus.registry` directly (the
  // `CommandBus` exposes a public typed `get registry()` getter from
  // `@pryzm/command-bus`); the previous speculative
  // `(inner as { commandRegistry?: ... })` cast fell through to
  // `new Map()` and returned an always-empty registry to dev-tools /
  // panels.  Anchor: `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md
  // §2 PR 4.A.8`.
  readonly bus: {
    executeCommand(type: string, payload: unknown): unknown;
    /**
     * §U-B2 (DAILY-USE-AUDIT 2026-05-20) — formal dispatch entry point used by
     * `RemoteCommandDispatcher` for collaboration catch-up + live broadcast.
     * `opts.source === 'REMOTE'` makes the command bypass BOTH local undo
     * stacks so a collaborator's edit cannot end up on the local user's
     * Ctrl+Z (per §30-COLLAB §3.5). `'PROJECT_LOAD'` does the same for
     * the bulk hydration path; `'LOCAL'` (default) keeps existing semantics.
     */
    dispatch(
      type: string,
      payload: unknown,
      opts?: { readonly source?: 'LOCAL' | 'REMOTE' | 'PROJECT_LOAD' },
    ): unknown;
    register(handler: CommandHandler<unknown>): Disposable;
    /**
     * L-1280 — whether a handler is ALREADY registered for `type` on the one
     * CommandBus this slot fronts.
     *
     * ⚠ NOT decoration, and not derivable by a caller that only has `registry`:
     * `@pryzm/command-bus`'s `ClashHandlerRegistrar` — the structural port
     * `registerClashRun` / `registerClashRefusalHandlers` take — REQUIRES
     * `has`. This slot omitted it, `engineLauncher` passes this slot, and the
     * result was `bus.has is not a function` on every production boot with all
     * twelve clash verbs left unhandled (L-1199). Any registrar port that must
     * defer to an existing handler needs this member; adding one here without
     * it re-opens the same hole.
     */
    has(type: string): boolean;
    readonly registry: ReadonlyMap<string, CommandHandler<unknown, AnyStores>>;
    // Sprint F-2.0: expose ringBuffer on the narrow slot type so callers
    // can access undo/redo state without `as any` casts.
    readonly ringBuffer: RingBufferUndoStack | null;
    setRingBuffer(rb: RingBufferUndoStack): void;
    /**
     * L-375a (G3-T2 wiring fix) — attach the CRDT applier to the underlying
     * CommandBus through the composition root's public bus surface.
     *
     * The applier closure (`(type, payload) => yjsDocAdapter.applyCommand(...)`)
     * genuinely depends on an app-layer object: the `YjsDocAdapter` is
     * constructed at boot in `engineLauncher.ts` from `window.currentProjectId`
     * and registered on the `batchCoordinator`, neither of which exists at
     * `composeRuntime()` time. This typed setter forwards to
     * `CommandBus.setCrdtApplier()` so the app can wire it WITHOUT reaching into
     * runtime internals (previously `(runtime as any).inner.bus`, a P4 violation
     * that always read `undefined` because the handle has no `inner` field).
     *
     * Mirrors `setRingBuffer` above (lazy post-construction wiring). Null-safe:
     * until this is called `CommandBus._crdtApplier` stays null and solo editing
     * is unaffected (C08 §3.1 — CRDT wiring is additive, never load-bearing for
     * local execution).
     */
    setCrdtApplier(
      fn: (type: string, payload: Record<string, unknown>) => void,
    ): void;
    /**
     * §U-B1 (DAILY-USE-AUDIT 2026-05-20) — wipe BOTH the RingBufferUndoStack
     * and the legacy command-bus UndoStack. Called by `ProjectLifecycleController`
     * on project switch and by `ProjectLoader` after `commandManager.clearHistory()`
     * on project load. Prevents Ctrl+Z in the new project from applying inverse
     * patches recorded against the previous project's stores.
     */
    clearUndoStacks(): void;
  };

  // ── Slot 4 — selection (+ hover, + projectContext) ──────────────────────
  readonly selection: SelectionSlot;
  readonly hover: HoverSlot;
  readonly projectContext: ProjectContextSlot;

  // ── Slot 5 — tools (state machine) ──────────────────────────────────────
  readonly tools: ToolsSlot;

  // ── Slot 6 — picking ────────────────────────────────────────────────────
  readonly picking: PickingSlot;

  // ── Slot 6b — physicsHost (Phase 1A — Wave-8-D2) ────────────────────────
  /** Broad-phase spatial query surface (raycast / AABB / point-in-volume).
   *  Phase 1A: Null backend (every query → empty).  Phase 1D: WASM-BVH
   *  backend over `three-mesh-bvh`.  Implemented by `@pryzm/physics-host`. */
  readonly physicsHost: PhysicsHostSlot;

  // ── Slot 6c — inputHost (Phase 1A — Wave-8-D3) ──────────────────────────
  /** Canonical pointer / wheel / keyboard event source.  Tools subscribe
   *  through `runtime.inputHost.subscribe(channel, handler)` instead of
   *  attaching their own DOM listeners.  Phase 1A: Null backend (records
   *  subscribers, never emits).  Phase 1B: `DomInputHost` over real DOM
   *  listeners.  Implemented by `@pryzm/input-host`. */
  readonly inputHost: InputHostSlot;

  // ── Slot 7 — viewRegistry (the 13th plugin's contribution) ──────────────
  /** Tightened from `unknown` in **D.11-prep** per
   *  `PHASES-A-F-MISSING-ITEMS-2026-04-29.md` §II.D.11.  Backed by an
   *  adapter over the inner `ViewRegistry` Store; D.11 proper swaps in
   *  the real `view.switch`-driven activation pipeline without a
   *  signature change. */
  readonly viewRegistry: ViewRegistrySlot;

  // ── Slot 8 — persistence ────────────────────────────────────────────────
  readonly persistence: PersistenceSlot;

  // ── Slot 9 — sync ───────────────────────────────────────────────────────
  readonly sync: SyncSlot;

  // ── Phase 3A — visibility wave-chain evaluator (Wave 19, S114-WIRE) ─────
  readonly visibility: VisibilitySlot;

  // ── Slot 10 — ai ────────────────────────────────────────────────────────
  readonly ai: AiSlot;

  // ── Slot 11 — plugins (contribution host) ───────────────────────────────
  readonly plugins: PluginsSlot;

  // ── Slot 12 — events (typed cross-cutting emitter) ──────────────────────
  readonly events: TypedEventEmitter<RuntimeEvents>;

  // ── Slot 13 — toasts (typed wrapper over AppToast singleton) ────────────
  readonly toasts: ToastsSlot;

  // ── Slot 14 — userPreferences ───────────────────────────────────────────
  readonly userPreferences: UserPreferencesSlot;

  // ── Phase C extension — undo/redo (drives SaveUndoRedoHUD) ──────────────
  readonly undoStack: UndoStackSlot;

  // ── Phase D placeholder slots (declared D.9-prep, wired D.9/D.10) ───────
  /** Platform surface — owns the `'landing'|'hub'|'workspace'` state
   *  currently held by `PlatformShell`.  D.9-prep ships a stub so panels
   *  can name this slot in their constructors today; D.9 swaps the
   *  implementation for the real PlatformShell-backed driver.  Emits
   *  `'workspace.surfaceChanged'` (typed, no cast) on every surface flip
   *  (Wave 4 Track A PR 4.A.3 / 4.A.4). */
  readonly workspace: WorkspaceSlot;
  /** Render/view mode — owns the `'3d'|'plan'|'section'` render mode for
   *  the workspace surface.  Wave 4 Track A PR 4.A.3: backed by
   *  `buildWorkspaceModeController` from
   *  `./workspace/WorkspaceModeController.ts`.  Emits
   *  `'workspace.modeChanged'` (typed) on every mode change. */
  readonly workspaceMode: WorkspaceModeController;
  /** Camera controller — owns the per-element framing logic currently
   *  in `viewport/CameraController`.  Wave 4 Track A PR 4.A.2: backed
   *  by `buildCameraControllerSlot` with a thunk that returns the live
   *  `CameraController` after `runtime.scene.mount(canvas)` resolves;
   *  D.10 wires the real per-element framing. */
  readonly cameraController: CameraControllerSlot;

  // ── Phase F slots 15-18 — import/export plugin facades (S81 F.12) ───────
  /** IFC import/export/inspector facade — wraps `@pryzm/plugin-ifc-*`. */
  readonly ifc: IfcSlot;
  /** Rhino 3dm reader facade — wraps `@pryzm/plugin-rhino-import`. */
  readonly rhino: RhinoSlot;
  /** BCF 3.0 reader/writer facade — wraps `@pryzm/plugin-bcf`. */
  readonly bcf: BcfSlot;
  /** PDF importer/exporter facade — Phase F.12 placeholder.  Throws
   *  `RuntimeNotWiredError` until `plugins/pdf/` ships. */
  readonly pdf: PdfSlot;

  // ── Wave 14 slots 19-29 — F-phase additions ──────────────────────────────
  /** Auth slot — Phase F.6.1. */
  readonly auth: AuthSlot;
  /** Global keyboard-shortcuts router — Phase F.5.4 / F.6.3. */
  readonly shortcuts: ShortcutsSlot;
  /** Toast slot (canonical Wave-14 name; mirrors runtime.toasts) — Phase F.6.4. */
  readonly toast: ToastSlot;
  /** Renderer debug metrics (dev-only overlay) — Phase F.5.7. */
  readonly debug: DebugSlot;
  /** Export pathways (ifc / glb / pdf / csv / panorama) — Phase F.10.2. */
  readonly export: ExportSlot;
  /** Entitlements gate — Phase F.7.1 / F.11.1. */
  readonly entitlements: EntitlementsSlot;
  /** CDE naming adapter — Phase F.11.3. */
  readonly cde: CdeSlot;
  /** Geospatial projection slot — Phase F.11.4. */
  readonly geospatial: GeospatialSlot;
  /** Physics dev-overlay metrics slot — Phase F.12.2. */
  readonly physics: PhysicsDevSlot;
  /** Structural analysis slot — Phase F.12.3. */
  readonly structural: StructuralSlot;
  /** Full-text search slot — Phase F.6.5. */
  readonly search: SearchSlot;

  // ── D-α-3 P3 — Apartment parameter propagation engine ─────────────────────
  /** Bridges L0 ApartmentParametersStore + RoomParametersStore to the pure
   *  `recomputeImpact` resolver (from `@pryzm/ai-host`). One instance per
   *  runtime; constructed by composeRuntime() and disposed via tearDown().
   *  Consumers subscribe with `.subscribe(listener)` to receive a
   *  `PropagationEvent` for every parameter change that has downstream
   *  impact. See `packages/stores/src/ApartmentParameterPropagator.ts`. */
  readonly apartmentParameterPropagator: ApartmentParameterPropagator;

  // ── P0.3 slice B (Family Platform) — Family registry runtime store ──────
  /** L3 reactive wrapper around the L0 `FamilyRegistryState` substrate from
   *  `@pryzm/schemas/family-registry`. Constructed empty by composeRuntime(),
   *  then seeded with the 6 representative `origin: 'core'` entries from
   *  `buildCoreFamilySeeds()`. Consumers (plugin picker, AI dispatch,
   *  auto-furnish) query through `.findByCategory()` / `.findByOccupancy()` /
   *  `.findByMountClass()` / `.findByTag()` and subscribe to mutations with
   *  `.subscribe(listener)`. Disposed via `tearDown()`. */
  readonly familyRegistryStore: FamilyRegistryStore;

  // ── A.7.b (Phase A · Sprint 2) — SiteModelStore (C19 substrate) ─────────
  /** L3 reactive wrapper around the L0 `SiteModel` substrate from
   *  `@pryzm/schemas/site`. One per runtime per [C19 §1.1] ("one Site
   *  per Project"). Starts holding `null`; the `site.*` command surface
   *  (A.7.c) calls `siteModelStore.set()` after running cross-schema
   *  validation. Per [C19 §1.13] joins the C13 project-switch reset
   *  list — `siteModelStore.reset()` is the canonical hook.
   *  Disposed via `tearDown()`. */
  readonly siteModelStore: SiteModelStore;

  // ── A.10.d (Phase A · Sprint 2) — ClimateStore (C21 substrate) ──────────
  /** L3 reactive wrapper around the L0 `ClimateDataset` substrate from
   *  `@pryzm/schemas/climate`. One per runtime. The `climate.*` command
   *  surface (A.10.e) calls `climateStore.ingest()` after running Zod
   *  validation + license-compliance. Per [C21 §1.5] the store retains
   *  invalidated entries in an audit archive (never deletes). Joins the
   *  C13 project-switch reset list. Disposed via `tearDown()`. */
  readonly climateStore: ClimateStore;

  // ── A.23.b.1 (Phase A · Sprint 2) — BuildingStore (C20 substrate) ───────
  /** L3 reactive wrapper around the L0 `Building` aggregate from
   *  `@pryzm/schemas/aggregates`. Per [C20 §1.1] single Building per
   *  Project today (multi-Building deferred to C20.1). The `building.*`
   *  command surface (A.23.c) calls store.add/update/remove after
   *  validation. Joins the C13 project-switch reset list. */
  readonly buildingStore: BuildingStore;

  // ── A.23.b.1 (Phase A · Sprint 2) — LevelStore (C20 substrate) ──────────
  /** L3 reactive wrapper around the L0 `Level` aggregate from
   *  `@pryzm/schemas/aggregates`. Per [C20 §1.2] within a Building:
   *  levelNumber + elevation are unique + monotonic; zero-or-one
   *  isActive. Cross-row invariants enforced by `level.*` commands
   *  (A.23.c); the store does per-row schema only. Joins C13 reset. */
  readonly levelStore: LevelStore;

  // ── A.23.b.2 (Phase A · Sprint 2) — ApartmentStore (C20 substrate) ──────
  /** L3 reactive wrapper around the L0 `Apartment` aggregate. Per
   *  [C20 §1.3] Apartment lives on a single Level today. `unitNumber`
   *  unique within Building. Cross-store checks enforced by
   *  `apartment.*` commands (A.23.c). Joins C13 reset. */
  readonly apartmentStore: ApartmentStore;

  // ── A.23.b.2 (Phase A · Sprint 2) — RoomStore (C20 substrate) ───────────
  /** L3 reactive wrapper around the L0 `Room` aggregate. Per
   *  [C20 §1.4] Room.apartmentId ↔ Apartment.levelId consistency
   *  enforced by `room.*` commands (A.23.c). Exposes
   *  `removeForApartment` cascade helper used by apartment.delete.
   *  Joins C13 reset. */
  readonly roomStore: RoomStore;

  // ── A.31.c (Phase A · Sprint 2) — ProvenanceStore (C23 substrate) ───────
  /** L3 append-only audit graph wrapping the L0 C23 substrate
   *  (`@pryzm/schemas/provenance`). Stores AIArtefact + ProvenanceEdge +
   *  ContextSnapshot + RedactionRecord rows. Per [C23 §1.9] all rows are
   *  immutable EXCEPT `AIArtefact.approvalStatus` (§1.7 carve-out) and
   *  `AIArtefact.producedElementIds` (§4.4 linkElement append). The store
   *  rejects edges that would close a DAG cycle (§1.3) and dedupes
   *  snapshots by `contextHash` (§2.3). Joins C13 reset (per-project
   *  audit isolation per §1.10 RLS). The `provenance.*` command surface
   *  in A.31.d (PLANNED) calls into this. */
  readonly provenanceStore: ProvenanceStore;

  // ── A.R.3 (Revit round-trip · S55) — IfcMetaStore ───────────────────────
  /** L3 durable store of IFC/Revit element metadata (globalId + psets +
   *  quantities + tier), wrapping the L0 substrate `@pryzm/schemas/ifc`.
   *  Populated by `ifc-import` per element; read by `ifc-export` via `get()`
   *  to rebind the original IFC GlobalId + psets on round-trip (instead of
   *  minting fresh ones); `serialize()`/`hydrate()` persist it into `.pryzm`
   *  so the round-trip survives reload. Joins the C13 project-switch reset
   *  list. See master-execution-tracker §12.6 A.R.3. */
  readonly ifcMetaStore: IfcMetaStore;

  // ── A.3 (Phase A · Sprint 2) — Typology pipeline slot ───────────────────
  /** L3 multi-typology generative-AI pipeline. One per runtime per
   *  [C50 §1.1](../../../docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md).
   *
   *  - `registry`: in-memory map of every registered typology pack indexed
   *    by `TypologyId`. PRYZM-first-party packs (apartment / house /
   *    small-office in Phase A) self-register at boot via a later A.4
   *    wiring slice. Community packs (Phase D) register lazily through
   *    the marketplace install flow.
   *
   *  - `router`: dispatch surface — `router.dispatch(input)` runs the
   *    7-stage pipeline (brief → site → constraints → generative →
   *    validators → cognition → bim-emit) and returns the result the
   *    L5 dispatch caller feeds to `commandBus.runBatch()`.
   *
   *  Contents are GLOBAL (not project-scoped per C50 §1.13) — they
   *  persist across project switches. Per-project pack-adapter caches
   *  (the loaded AI workflow function bytes etc.) live elsewhere and
   *  attach their own C13 reset handlers. */
  readonly typology: {
    readonly registry: TypologyRegistry;
    readonly router: PipelineRouter;
  };

  /** Idempotent.  Disposes every owned subsystem in reverse order
   *  (renderer → scheduler → bindings → stores → bus → emitter). */
  tearDown(): void;
}
