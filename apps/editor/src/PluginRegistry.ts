// PluginRegistry — single registration point for every L4 element plugin (W-1C-1).
//
// Spec: `docs/00_NEW_ARCHITECTURE/audits/PHASE-1-COMPLETION-PLAN.md` §W-1C-1.
//
// Why this exists.  At S07 the editor wired exactly one plugin (wall) by hand
// in `bootstrap.data.ts`.  Phases 1B + 1C grew that wiring to 12 element
// families + the view plugin, but `bootstrap.data.ts` was never refactored
// to enumerate them.  The result: adding a 13th plugin in 2A would be a
// bootstrap rewrite, not a one-line addition.  This registry inverts that:
// every plugin contributes a `PluginDescriptor` and `bootstrapWithEverything`
// iterates `ALL_PLUGINS` once.
//
// Layering note.  Each `PluginDescriptor` is constructed in this file
// (apps/editor → plugins is the correct dep direction; the reverse would
// require plugins to import editor types and would reintroduce a cycle).
// Per-plugin `descriptor.ts` files were considered and rejected on those
// grounds; the descriptor records below are the single source of truth.

import type { CommandHandler } from '@pryzm/command-bus';
import type { Store } from '@pryzm/stores';
import { SelectionStore, AnnotationStore } from '@pryzm/stores';
import type { PluginContribution } from '@pryzm/runtime-composer/types';

// ── C06 §4 — Task 3.1 (Phase 3) — plugin tool activator imports ─────────────
//
// Seven plugin tool classes imported via stable `./tool` subpath exports.
// Two tools (DimensionTool, FurniturePlacementTool) require engine-provided
// deps (canvas + catalogue) and therefore use the existing window-bridge
// pattern (same as ToolsAreaLayout's ramp/room/ceiling bridges) until Phase 4
// lands the runtime.inputHost + runtime.auxiliaries engine bridges.
//
// Phase 2 NOTE: zero `commandManager` call sites introduced here.  All
// dispatch goes through `runtime.bus.executeCommand`.  Clean of F1–F13.
import { TextNoteTool, type ScreenToWorldFn } from '@pryzm/plugin-annotations/tool';
import { BCFTool } from '@pryzm/plugin-bcf/tool';
import { CrossTool } from '@pryzm/plugin-cross/tool';
import { GridPlacementTool } from '@pryzm/plugin-grid/tool';
import { LightingPlacementTool } from '@pryzm/plugin-lighting/tool';
import { StructuralPlacementTool } from '@pryzm/plugin-structural/tool';
import { CubeTool } from '@pryzm/plugin-toy-cube/tool';

// ---- 12 element family plugins ----
import {
  WallStore,
  WallSystemTypeStore,
  buildWallHandlerSet,
  wallToolbarContribution,
} from '@pryzm/plugin-wall';
import { SlabStore, buildSlabHandlerSet } from '@pryzm/plugin-slab';
import { DoorStore, buildDoorHandlerSet } from '@pryzm/plugin-door';
import { WindowStore, buildWindowHandlerSet } from '@pryzm/plugin-window';
import { RoofStore, buildRoofHandlerSet } from '@pryzm/plugin-roof';
import { CurtainWallStore, buildCurtainWallHandlerSet } from '@pryzm/plugin-curtain-wall';
import { GridStore, buildGridHandlerSet } from '@pryzm/plugin-grid';
import { ColumnStore, buildColumnHandlerSet } from '@pryzm/plugin-column';
import { BeamStore, buildBeamHandlerSet } from '@pryzm/plugin-beam';
import { StairStore, buildStairHandlerSet } from '@pryzm/plugin-stair';
import { HandrailStore, buildHandrailHandlerSet } from '@pryzm/plugin-handrail';
import { CeilingStore, buildCeilingHandlerSet } from '@pryzm/plugin-ceiling';

// ---- Wave 18: 2 non-element plugins with zero-dep handler factories ----
import { buildSelectionHandlerSet } from '@pryzm/plugin-selection';
import { buildAnnotationHandlerSet } from '@pryzm/plugin-annotations';

// ---- 5 non-canonical element plugins (E-finish.0.E) ----
//
// These five plugins (furniture, plumbing, rooms, structural, dimensions)
// shipped their store + handler set in earlier sprints (S25-S29) but were
// never registered in the L7 editor's PluginRegistry — they were
// orphaned, present in `plugins/*/` but invisible to
// `bootstrapWithEverything()`.  E-finish.0.E (PRYZM2-WIREUP-PLAN-S72
// §16 E.0) wires them in following the same drop-in shape as
// slab/door/etc., one descriptor each, no auxiliary deps.
//
// storeKey convention: matches the package's plugin-id (without the
// `plugin-` prefix).  Note that the `dimensions` plugin's handler types
// are singular (`dimension.create`, …) while its storeKey + plugin id
// are plural (`dimensions`); this mirrors `plugin-rooms` (handlers:
// `room.*`, storeKey: `rooms`).  Resolution: keep handler types as
// shipped — the L2 bus matches by exact handler-type string and is
// orthogonal to storeKey naming.
import { FurnitureStore, buildFurnitureHandlerSet } from '@pryzm/plugin-furniture';
import { PlumbingStore, buildPlumbingHandlerSet } from '@pryzm/plugin-plumbing';
import {
  RoomStore,
  buildRoomHandlerSet,
  wireRoomEventSubscriptions,
  type RoomEventRuntime,
} from '@pryzm/plugin-rooms';
import { StructuralStore, buildStructuralHandlerSet } from '@pryzm/plugin-structural';
import { DimensionStore, buildDimensionHandlerSet } from '@pryzm/plugin-dimensions';

// ---- 13th plugin: view (uses ViewRegistry, not a Store<T>) ----
import {
  CreateViewHandler,
  DeleteViewHandler,
  RenameViewHandler,
  SwitchViewHandler,
  UpdateViewCameraHandler,
} from '@pryzm/plugin-view';
import { ViewRegistry } from '@pryzm/view-state';

/** A registered plugin's runtime contribution. Constructed once at boot
 *  and consumed by `bootstrapWithEverything()`. */
export interface PluginDescriptor {
  /** Stable plugin id — matches the `name` field of the package.json
   *  ("plugin-" prefix dropped for ergonomics). */
  readonly id: string;

  /** Store key under `runtime.stores[<key>]`.  Empty string means this
   *  plugin contributes no Store<T> (e.g. the view plugin uses a
   *  ViewRegistry, registered separately on `runtime.viewRegistry`). */
  readonly storeKey: string;

  /** Build the canonical store instance.  Returns `undefined` for
   *  plugins that don't ship a `Store<T>` (view plugin). */
  readonly buildStore: () => Store<object> | undefined;

  /** Build the handler set for this plugin.  Receives a deps bag
   *  populated from previously-built plugin contributions (e.g. wall
   *  needs `wallSystemTypes`).  Each plugin reads only what it needs. */
  readonly buildHandlers: (deps: PluginDeps) => readonly CommandHandler<unknown>[];

  /** Per-plugin auxiliary objects exposed on the runtime (catalogues,
   *  registries, ad-hoc stores).  Keyed by a stable string and merged
   *  into `runtime.auxiliaries`. */
  readonly buildAuxiliaries?: () => Readonly<Record<string, unknown>>;

  /** F-launch.1 (S81 F.1.01) — UI / panel / toolbar contributions
   *  surfaced through `runtime.plugins.contributions(kind)`.  Optional
   *  because not every plugin contributes UI (data-only plugins like
   *  `selection` ship `undefined` here).  Wired into the `PluginHost`
   *  constructor by `composeRuntime()` via the `pluginContributions`
   *  option — see `gatherAllContributions()` below. */
  readonly contributions?: readonly PluginContribution[];

  /** Task 1.3 (C11 §6.3) — optional runtime event-subscription wiring.
   *  Called once by `wireAllPluginSubscriptions(runtime)` after
   *  `composeRuntime()` resolves.  Returns a disposer called during
   *  runtime tear-down.  Plugins that do not need event subscriptions
   *  leave this field undefined. */
  readonly wireSubscriptions?: (runtime: RoomEventRuntime) => () => void;
}

/** Deps bag passed to `buildHandlers` — populated incrementally as each
 *  plugin's auxiliaries land.  Typed loosely (each plugin reads its own
 *  keys with a local cast) so the registry can stay free of cycles. */
export type PluginDeps = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
//                               Registry
// ---------------------------------------------------------------------------

/** All 13 plugins, in registration order.  Order matters only for the
 *  rare cross-plugin dep (wall handlers consume `wallSystemTypes`). */
export const ALL_PLUGINS: readonly PluginDescriptor[] = [
  // ---- Wall (carries the catalogue dep) ----
  {
    id: 'wall',
    storeKey: 'wall',
    buildStore: () => new WallStore() as unknown as Store<object>,
    buildAuxiliaries: () => ({ wallSystemTypes: new WallSystemTypeStore() }),
    buildHandlers: (deps) => {
      const systemTypeStore = deps.wallSystemTypes as WallSystemTypeStore;
      return buildWallHandlerSet({ systemTypeStore }) as readonly CommandHandler<unknown>[];
    },
    // F-launch.1 (S81 F.1.01) — first plugin contribution: Wall →
    // Architecture rail tool.  F.1.02..F.1.13 add the remaining 12.
    contributions: [wallToolbarContribution],
  },

  // ---- Slab ----
  {
    id: 'slab',
    storeKey: 'slab',
    buildStore: () => new SlabStore() as unknown as Store<object>,
    buildHandlers: () => buildSlabHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Door ----
  {
    id: 'door',
    storeKey: 'door',
    buildStore: () => new DoorStore() as unknown as Store<object>,
    buildHandlers: () => buildDoorHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Window ----
  {
    id: 'window',
    storeKey: 'window',
    buildStore: () => new WindowStore() as unknown as Store<object>,
    buildHandlers: () => buildWindowHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Roof ----
  {
    id: 'roof',
    storeKey: 'roof',
    buildStore: () => new RoofStore() as unknown as Store<object>,
    buildHandlers: () => buildRoofHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Curtain Wall ----
  {
    id: 'curtain-wall',
    storeKey: 'curtainwall',
    buildStore: () => new CurtainWallStore() as unknown as Store<object>,
    buildHandlers: () => buildCurtainWallHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Grid ----
  {
    id: 'grid',
    storeKey: 'grid',
    buildStore: () => new GridStore() as unknown as Store<object>,
    buildHandlers: () => buildGridHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Column ----
  {
    id: 'column',
    storeKey: 'column',
    buildStore: () => new ColumnStore() as unknown as Store<object>,
    buildHandlers: () => buildColumnHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Beam ----
  {
    id: 'beam',
    storeKey: 'beam',
    buildStore: () => new BeamStore() as unknown as Store<object>,
    buildHandlers: () => buildBeamHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Stair ----
  {
    id: 'stair',
    storeKey: 'stair',
    buildStore: () => new StairStore() as unknown as Store<object>,
    buildHandlers: () => buildStairHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Handrail ----
  {
    id: 'handrail',
    storeKey: 'handrail',
    buildStore: () => new HandrailStore() as unknown as Store<object>,
    buildHandlers: () => buildHandrailHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Ceiling ----
  {
    id: 'ceiling',
    storeKey: 'ceiling',
    buildStore: () => new CeilingStore() as unknown as Store<object>,
    buildHandlers: () => buildCeilingHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Furniture (E-finish.0.E orphan registration) ----
  {
    id: 'furniture',
    storeKey: 'furniture',
    buildStore: () => new FurnitureStore() as unknown as Store<object>,
    buildHandlers: () => buildFurnitureHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Plumbing (E-finish.0.E orphan registration) ----
  {
    id: 'plumbing',
    storeKey: 'plumbing',
    buildStore: () => new PlumbingStore() as unknown as Store<object>,
    buildHandlers: () => buildPlumbingHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Rooms (E-finish.0.E orphan registration) ----
  //
  // Task 1.3 (C11 §6.3) — rooms is the first plugin to declare a
  // `wireSubscriptions` callback.  `wireAllPluginSubscriptions(runtime)` calls
  // it once after `composeRuntime()` so room boundaries are recomputed
  // event-driven (wall.created / curtain-wall.created → rooms.redetect)
  // rather than via imperative commandManager.execute() calls.
  {
    id: 'rooms',
    storeKey: 'rooms',
    buildStore: () => new RoomStore() as unknown as Store<object>,
    buildHandlers: () => buildRoomHandlerSet() as readonly CommandHandler<unknown>[],
    wireSubscriptions: wireRoomEventSubscriptions,
  },

  // ---- Structural (E-finish.0.E orphan registration) ----
  {
    id: 'structural',
    storeKey: 'structural',
    buildStore: () => new StructuralStore() as unknown as Store<object>,
    buildHandlers: () => buildStructuralHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Dimensions (E-finish.0.E orphan registration) ----
  {
    id: 'dimensions',
    storeKey: 'dimensions',
    buildStore: () => new DimensionStore() as unknown as Store<object>,
    buildHandlers: () => buildDimensionHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Selection (Wave 18 — zero-dep handler registration) ----
  //
  // `SelectionStore` lives in `packages/stores/` (not in the plugin package).
  // `buildSelectionHandlerSet()` takes NO deps and returns the three
  // canonical handlers (selection.select / .deselect / .clear).  Handlers
  // access `ctx.stores.selection` — the SelectionStore registered here
  // under storeKey 'selection' satisfies that contract in the legacy
  // `bootstrapWithEverything()` path.  The `composeRuntime` path exposes
  // selection state via `runtime.selection` (a built-in stub); handler
  // registration via the composeRuntime bus is Phase E.5.x scope.
  {
    id: 'selection',
    storeKey: 'selection',
    buildStore: () => new SelectionStore() as unknown as Store<object>,
    buildHandlers: () => buildSelectionHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Annotations (Wave 18 — zero-dep handler registration) ----
  //
  // `AnnotationStore` lives in `packages/stores/` (re-exported by both
  // `@pryzm/plugin-sdk` and `@pryzm/plugin-annotations`).
  // `buildAnnotationHandlerSet()` takes NO deps and returns the 8
  // annotation command handlers (annotation.create / .delete / .move /
  // .setText / .setKind / .setRotation / .setTextHeight / .setColor).
  // Handlers access `ctx.stores.annotation` — storeKey 'annotation'
  // matches that access pattern.
  {
    id: 'annotations',
    storeKey: 'annotation',
    buildStore: () => new AnnotationStore() as unknown as Store<object>,
    buildHandlers: () => buildAnnotationHandlerSet(),
  },

  // ---- View (13th plugin — ViewRegistry IS a Store<ViewDefinition>) ----
  //
  // Note: the view handlers (`view.create` / `view.delete` / …) read
  // `ctx.stores.view.getState()` (the Map view) rather than the
  // `Record<id, ViewDefinition>` view that bootstrap's default
  // `storesProvider` exposes.  Calling `view.*` commands through the
  // bus requires a custom storesProvider that passes the ViewRegistry
  // instance directly — that wiring is owned by W-2A view-state
  // integration.  W-1C-1 ships the registry contribution so the
  // store is present + the handlers are registered; the bus-level
  // override is the 2A milestone's responsibility.
  {
    id: 'view',
    storeKey: 'view',
    buildStore: () => new ViewRegistry() as unknown as Store<object>,
    buildHandlers: () => [
      CreateViewHandler as unknown as CommandHandler<unknown>,
      DeleteViewHandler as unknown as CommandHandler<unknown>,
      RenameViewHandler as unknown as CommandHandler<unknown>,
      SwitchViewHandler as unknown as CommandHandler<unknown>,
      UpdateViewCameraHandler as unknown as CommandHandler<unknown>,
    ],
  },
] as const;

/** Convenience — the element-family ids in registration order.  Pre-
 *  E-finish.0.E this list named only the 12 canonical element plugins
 *  (wall…ceiling).  E-finish.0.E adds the 5 orphan plugins (furniture,
 *  plumbing, rooms, structural, dimensions) that ship a Store + handler
 *  set and are now registered above; consumers that want only the
 *  canonical 12 can slice `ELEMENT_PLUGIN_IDS.slice(0, 12)`.
 *  Wave 18 adds `selection` and `annotations` (zero-dep handler
 *  registration; see audit in `19-WAVES-16-20-FULL-WIRE.md §3`). */
export const ELEMENT_PLUGIN_IDS = [
  'wall',
  'slab',
  'door',
  'window',
  'roof',
  'curtain-wall',
  'grid',
  'column',
  'beam',
  'stair',
  'handrail',
  'ceiling',
  'furniture',
  'plumbing',
  'rooms',
  'structural',
  'dimensions',
  'selection',
  'annotations',
] as const;

export type ElementPluginId = (typeof ELEMENT_PLUGIN_IDS)[number];

/** F-launch.1 (S81 F.1.01) — flatten every plugin's `contributions`
 *  array into the single `readonly PluginContribution[]` that
 *  `composeRuntime({ pluginContributions })` consumes.  Order: outer is
 *  `ALL_PLUGINS` registration order, inner is the plugin's own array
 *  order — both stable, both reflected in `runtime.plugins.contributions(kind)`. */
export function gatherAllContributions(): readonly PluginContribution[] {
  const out: PluginContribution[] = [];
  for (const p of ALL_PLUGINS) {
    if (!p.contributions) continue;
    for (const c of p.contributions) out.push(c);
  }
  return out;
}

/** Task 1.3 (C11 §6.3) — call each plugin's `wireSubscriptions` callback
 *  once after `composeRuntime()` resolves so typed domain events (e.g.
 *  `wall.created`) drive downstream commands (e.g. `rooms.redetect`).
 *
 *  Returns a combined disposer — call it in `runtime.tearDown()` to
 *  unsubscribe all listeners and prevent leaks in hot-reload / test env. */
export function wireAllPluginSubscriptions(runtime: RoomEventRuntime): () => void {
  const disposers: Array<() => void> = [];
  for (const p of ALL_PLUGINS) {
    if (!p.wireSubscriptions) continue;
    try {
      const dispose = p.wireSubscriptions(runtime);
      disposers.push(dispose);
    } catch (err) {
      console.error(
        `[PluginRegistry] wireSubscriptions failed for plugin "${p.id}":`,
        err,
      );
    }
  }
  return () => {
    for (const d of disposers) d();
  };
}

// ---------------------------------------------------------------------------
//        C06 §4 — Task 3.1 (Phase 3): Plugin tool activator registration
// ---------------------------------------------------------------------------

/** Minimal runtime shape required by `registerAllPluginToolActivators`.
 *  Structurally compatible with `PryzmRuntime` — typed narrowly so unit
 *  tests can pass a lightweight stub without building the full runtime. */
export interface ToolActivatorRuntime {
  readonly tools: {
    register(family: string, activator: (mode?: string) => void): void;
  };
  readonly bus: {
    executeCommand(type: string, payload: unknown): unknown;
  };
}

/** C06 §4 — Task 3.1 (Phase 3) — Register `runtime.tools` activators for the
 *  9 plugin tools not wired in Phase E (S78-WIRE).
 *
 *  Families registered (none overlap with ToolsAreaLayout.ts registrations):
 *    `annotation` · `bcf` · `cross` · `dimension` · `furniture` ·
 *    `grid:tool` · `lighting` · `structural` · `toy-cube`
 *
 *  Design notes:
 *  - `busAdapter` wraps `runtime.bus.executeCommand` (returns `unknown`) in
 *    `Promise.resolve()` to satisfy the `executeCommand<T>(): Promise<unknown>`
 *    shape each plugin tool constructor expects.
 *  - `annotationScreenToWorld` / `eventScreenToWorld` are lazy engine bridges:
 *    the engine sets `window.__pryzmScreenToWorld` during `initTools()` once
 *    the THREE camera + raycaster are ready.  Until then both functions return
 *    null / undefined — every tool's `onPointerDown` bails safely, no crash.
 *  - `dimension` and `furniture` activators read `window.dimensionTool` /
 *    `window.furnitureTool` at call-time (same pattern as ToolsAreaLayout's
 *    ramp, room, ceiling bridges) because DimensionTool requires a live canvas
 *    HTMLElement and FurniturePlacementTool requires an initialised catalogue —
 *    both are engine-provided after `initTools()`.
 *    TODO(Phase 4): replace both bridges with `runtime.inputHost` subscription
 *    and `runtime.auxiliaries.furnitureCatalogue` once those slots are wired.
 *
 *  Call once immediately after `wireAllPluginSubscriptions(runtime)`. */
export function registerAllPluginToolActivators(runtime: ToolActivatorRuntime): void {
  // Adapt runtime.bus.executeCommand (unknown return) to Promise<unknown> shape
  // expected by plugin tool constructors.  The cast is safe — every tool that
  // calls executeCommand awaits the result, which Promise.resolve() satisfies.
  const busAdapter = {
    executeCommand(type: string, payload: unknown): Promise<unknown> {
      return Promise.resolve(runtime.bus.executeCommand(type, payload));
    },
  } as { executeCommand<T>(type: string, payload: T): Promise<unknown> };

  // Lazy engine bridge — (x: number, y: number) signature for TextNoteTool.
  // Note: engine sets window.__pryzmScreenToWorld during initTools(); returns
  // null until engine is ready. Cast as ScreenToWorldFn — callers guard
  // against null at the pointer-event level (onPointerDown bails if no point).
  const annotationScreenToWorld = ((x: number, y: number) => {
    const fn = (window as unknown as Record<string, unknown>).__pryzmScreenToWorld as
      | ((x: number, y: number) => { x: number; y: number; z: number } | null)
      | undefined;
    return fn ? fn(x, y) : null;
  }) as unknown as ScreenToWorldFn;

  // Lazy engine bridge — {offsetX, offsetY} event signature for placement tools.
  const eventScreenToWorld = (ev: { offsetX: number; offsetY: number }) => {
    const fn = (window as unknown as Record<string, unknown>).__pryzmScreenToWorld as
      | ((x: number, y: number) => { x: number; y: number; z: number } | null)
      | undefined;
    return fn ? (fn(ev.offsetX, ev.offsetY) ?? undefined) : undefined;
  };

  // ─── annotation ───────────────────────────────────────────────────────────
  // TextNoteTool requires canvas + viewId (engine-provided after initTools()).
  // Bridge pattern: engine stores ready instance at window.annotationTool;
  // activator re-activates it. TODO(Phase 4): replace with runtime.inputHost.
  runtime.tools.register('annotation', (m?) => {
    const tool = (window as unknown as Record<string, unknown>).annotationTool as
      { activate?: (mode?: string) => void; dispose?: () => void } | undefined;
    if (tool?.activate) {
      tool.activate(m);
    } else {
      // Fallback: engine not yet initialised — construct a lightweight shim
      // for non-canvas contexts (e.g. headless tests). Canvas + viewId are
      // optional at this stage; the tool bails gracefully on pointer events.
      const prior = (window as unknown as Record<string, unknown>).annotationTool as
        { dispose?: () => void } | undefined;
      prior?.dispose?.();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as unknown as Record<string, unknown>).annotationTool = new TextNoteTool({
        commandBus: busAdapter,
        screenToWorld: annotationScreenToWorld,
      } as any);
    }
    console.log(`[runtime.tools/annotation] activated (kind=${m ?? 'text-note'})`);
  });

  // ─── bcf ──────────────────────────────────────────────────────────────────
  runtime.tools.register('bcf', () => {
    const prior = (window as unknown as Record<string, unknown>).bcfTool as
      { dispose?: () => void } | undefined;
    prior?.dispose?.();
    const tool = new BCFTool({ commandBus: busAdapter });
    (window as unknown as Record<string, unknown>).bcfTool = tool;
    // BCFTool is an IO plugin (no activatePanel method); opening the panel
    // is triggered by dispatching 'bcf.panel.open' via the command bus.
    busAdapter.executeCommand('bcf.panel.open', {}).catch(console.error);
    console.log('[runtime.tools/bcf] BCF panel activation dispatched');
  });

  // ─── cross ────────────────────────────────────────────────────────────────
  // Cross rules are registered once at plugin activation; idempotent.
  runtime.tools.register('cross', (m?) => {
    const force = m === 'force';
    const tool = new CrossTool({ commandBus: busAdapter });
    tool.activate(force);
    console.log('[runtime.tools/cross] cascade rules activated');
  });

  // ─── dimension ────────────────────────────────────────────────────────────
  // DimensionTool requires a canvas HTMLElement + viewId — engine-provided.
  // Engine stores ready instance at window.dimensionTool after initTools().
  // TODO(Phase 4): replace with runtime.inputHost subscription.
  runtime.tools.register('dimension', () => {
    const tool = (window as unknown as Record<string, unknown>).dimensionTool as
      { activate?: () => void } | undefined;
    if (tool?.activate) {
      tool.activate();
    } else {
      console.warn(
        '[runtime.tools/dimension] DimensionTool not ready — engine not yet initialised',
      );
    }
  });

  // ─── furniture ────────────────────────────────────────────────────────────
  // FurniturePlacementTool requires catalogue — engine-provided after initTools().
  // TODO(Phase 4): replace with runtime.auxiliaries.furnitureCatalogue.
  runtime.tools.register('furniture', (m?) => {
    const tool = (window as unknown as Record<string, unknown>).furnitureTool as
      { activate?: (mode?: string) => void } | undefined;
    if (tool?.activate) {
      tool.activate(m);
    } else {
      console.warn(
        '[runtime.tools/furniture] FurniturePlacementTool not ready — catalogue not initialised',
      );
    }
  });

  // ─── grid:tool ────────────────────────────────────────────────────────────
  // Note: 'grid' family in ToolsAreaLayout covers the GridStore-backed creation
  // modal.  'grid:tool' is the pointer-driven GridPlacementTool (interactive
  // grid-line snapping placement).  Different families; no overlap.
  runtime.tools.register('grid:tool', () => {
    const prior = (window as unknown as Record<string, unknown>).gridPlacementTool as
      { dispose?: () => void } | undefined;
    prior?.dispose?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as unknown as Record<string, unknown>).gridPlacementTool = new GridPlacementTool({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      commandBus: busAdapter as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      screenToWorld: eventScreenToWorld as any,
    });
    console.log('[runtime.tools/grid:tool] activated');
  });

  // ─── lighting ─────────────────────────────────────────────────────────────
  runtime.tools.register('lighting', (m?) => {
    const prior = (window as unknown as Record<string, unknown>).lightingTool as
      { dispose?: () => void } | undefined;
    prior?.dispose?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as unknown as Record<string, unknown>).lightingTool = new LightingPlacementTool({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      commandBus: busAdapter as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      screenToWorld: eventScreenToWorld as any,
    });
    console.log(`[runtime.tools/lighting] activated (fixture=${m ?? 'default'})`);
  });

  // ─── structural ───────────────────────────────────────────────────────────
  runtime.tools.register('structural', (m?) => {
    const prior = (window as unknown as Record<string, unknown>).structuralTool as
      { dispose?: () => void } | undefined;
    prior?.dispose?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as unknown as Record<string, unknown>).structuralTool = new StructuralPlacementTool({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      commandBus: busAdapter as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      screenToWorld: eventScreenToWorld as any,
    });
    console.log(`[runtime.tools/structural] activated (type=${m ?? 'default'})`);
  });

  // ─── toy-cube (dev demo) ──────────────────────────────────────────────────
  // CubeTool.activeCubeId: uses 'demo-cube' as the well-known dev-scene cube.
  // TODO(Phase 4): replace with runtime.selection.activeElementId.
  runtime.tools.register('toy-cube', () => {
    const prior = (window as unknown as Record<string, unknown>).cubeTool as
      { dispose?: () => void } | undefined;
    prior?.dispose?.();
    (window as unknown as Record<string, unknown>).cubeTool = new CubeTool({
      commandBus: busAdapter,
      activeCubeId: 'demo-cube',
    });
    console.log('[runtime.tools/toy-cube] activated (dev demo)');
  });

  // ── C06 §4 Task 3.1 Wave B — 18 additional tool activators ───────────────
  //
  // The 9 plugins below have tool.ts files (written in earlier waves) but were
  // never wired into runtime.tools.  The 9 command-dispatch bridges below them
  // cover plugins that have no pointer tool but still need a runtime.tools
  // activator so the toolbar can route through the canonical bus path instead
  // of legacy window.* globals or direct module calls.
  //
  // Bridge pattern:  same as the existing ramp/room/ceiling bridges in
  // ToolsAreaLayout.ts and annotation/bcf/dimension above.  Each activator
  // dispatches through busAdapter so the call is routed via runtime.bus and
  // satisfies the P6 "commands only via commandBus" contract.

  // ─── ifc-export ───────────────────────────────────────────────────────────
  // Triggers IFC export dialog; the ifc.export handler orchestrates the export.
  runtime.tools.register('ifc-export', (m?) => {
    busAdapter.executeCommand('ifc.export', {
      schema: (m as 'IFC2X3' | 'IFC4' | 'IFC4X3') ?? 'IFC4',
      filename: 'export.ifc',
    }).catch(console.error);
    console.log(`[runtime.tools/ifc-export] export triggered (schema=${m ?? 'IFC4'})`);
  });

  // ─── multiplayer ──────────────────────────────────────────────────────────
  // Opens the multiplayer presence panel; awareness state is managed by the
  // multiplayer plugin's own store + handlers.
  runtime.tools.register('multiplayer', () => {
    busAdapter.executeCommand('multiplayer.panel.open', {}).catch(console.error);
    console.log('[runtime.tools/multiplayer] presence panel opened');
  });

  // ─── plan-view ────────────────────────────────────────────────────────────
  // Activates the plan-view canvas host for the given level.
  runtime.tools.register('plan-view', (m?) => {
    busAdapter.executeCommand('plan-view.level.activate', { levelId: m ?? '' }).catch(console.error);
    console.log(`[runtime.tools/plan-view] activated (levelId=${m ?? 'default'})`);
  });

  // ─── rooms ────────────────────────────────────────────────────────────────
  // Activates room seed placement mode.  Engine-stored window.roomTool
  // bridge: same pattern as ToolsAreaLayout room + room:level bridges.
  // TODO(Phase 4): replace with runtime.inputHost when RoomSeedTool is wired.
  runtime.tools.register('rooms', (m?) => {
    const t = (window as unknown as Record<string, unknown>).roomTool as
      { activate?: (mode?: string) => void } | undefined;
    if (t?.activate) {
      t.activate(m);
    } else {
      busAdapter.executeCommand('rooms.panel.open', { mode: m ?? 'seed' }).catch(console.error);
    }
    console.log(`[runtime.tools/rooms] activated (mode=${m ?? 'seed'})`);
  });

  // ─── schedules ────────────────────────────────────────────────────────────
  // Opens the schedules panel via the schedules command bus.
  runtime.tools.register('schedules', (m?) => {
    if (m) {
      busAdapter.executeCommand('schedule.activate', { scheduleId: m }).catch(console.error);
    } else {
      busAdapter.executeCommand('schedules.panel.open', {}).catch(console.error);
    }
    console.log(`[runtime.tools/schedules] activated (scheduleId=${m ?? 'none'})`);
  });

  // ─── section-view ─────────────────────────────────────────────────────────
  // Activates the section line placement tool.  Engine-stored bridge until
  // SectionTool is instantiated with a canvas ref from runtime.inputHost.
  // TODO(Phase 4): replace with runtime.inputHost + SectionTool constructor.
  runtime.tools.register('section-view', (m?) => {
    const t = (window as unknown as Record<string, unknown>).sectionTool as
      { activate?: (mode?: string) => void; cancel?: () => void } | undefined;
    if (t?.activate) {
      t.activate(m);
    } else {
      busAdapter.executeCommand('section.panel.open', { mode: m ?? 'line' }).catch(console.error);
    }
    console.log(`[runtime.tools/section-view] activated (mode=${m ?? 'line'})`);
  });

  // ─── selection ────────────────────────────────────────────────────────────
  // Clears the canvas to "selection mode" — the default pointer tool.
  // Selection commands are dispatched by the canvas host (raycaster on click);
  // this activator signals that no other tool is active.
  runtime.tools.register('selection', () => {
    busAdapter.executeCommand('selection.clear', {}).catch(console.error);
    console.log('[runtime.tools/selection] selection mode activated');
  });

  // ─── sheets ───────────────────────────────────────────────────────────────
  // Opens the sheet editor panel.
  runtime.tools.register('sheets', (m?) => {
    if (m) {
      busAdapter.executeCommand('sheet.activate', { sheetId: m }).catch(console.error);
    } else {
      busAdapter.executeCommand('sheets.panel.open', {}).catch(console.error);
    }
    console.log(`[runtime.tools/sheets] activated (sheetId=${m ?? 'none'})`);
  });

  // ─── view ─────────────────────────────────────────────────────────────────
  // Switches the active view.  Mode is the target viewId.
  runtime.tools.register('view', (m?) => {
    if (!m) {
      console.warn('[runtime.tools/view] no viewId provided — no-op');
      return;
    }
    busAdapter.executeCommand('view.switch', { viewId: m }).catch(console.error);
    console.log(`[runtime.tools/view] switched to view ${m}`);
  });

  // ── Command-dispatch bridges for plugins without pointer tools ────────────

  // ─── ai-floorplan ─────────────────────────────────────────────────────────
  runtime.tools.register('ai-floorplan', (m?) => {
    busAdapter.executeCommand('ai.floorplan.start', { prompt: m ?? '' }).catch(console.error);
    console.log('[runtime.tools/ai-floorplan] floorplan generation started');
  });

  // ─── ai-query ─────────────────────────────────────────────────────────────
  runtime.tools.register('ai-query', (m?) => {
    busAdapter.executeCommand('ai.query.start', { query: m ?? '' }).catch(console.error);
    console.log('[runtime.tools/ai-query] query started');
  });

  // ─── ai-voice ─────────────────────────────────────────────────────────────
  runtime.tools.register('ai-voice', () => {
    busAdapter.executeCommand('ai.voice.start', {}).catch(console.error);
    console.log('[runtime.tools/ai-voice] voice input started');
  });

  // ─── dxf ──────────────────────────────────────────────────────────────────
  runtime.tools.register('dxf', (m?) => {
    busAdapter.executeCommand('dxf.import.start', { filename: m ?? '' }).catch(console.error);
    console.log('[runtime.tools/dxf] DXF import dialog opened');
  });

  // ─── export-pdf ───────────────────────────────────────────────────────────
  runtime.tools.register('export-pdf', (m?) => {
    busAdapter.executeCommand('export.pdf.start', { sheetId: m ?? '' }).catch(console.error);
    console.log('[runtime.tools/export-pdf] PDF export triggered');
  });

  // ─── ifc-import ───────────────────────────────────────────────────────────
  runtime.tools.register('ifc-import', () => {
    busAdapter.executeCommand('ifc.import.start', {}).catch(console.error);
    console.log('[runtime.tools/ifc-import] IFC import dialog opened');
  });

  // ─── ifc-inspector ────────────────────────────────────────────────────────
  runtime.tools.register('ifc-inspector', (m?) => {
    busAdapter.executeCommand('ifc.inspector.open', { elementId: m ?? '' }).catch(console.error);
    console.log('[runtime.tools/ifc-inspector] IFC inspector opened');
  });

  // ─── levels ───────────────────────────────────────────────────────────────
  runtime.tools.register('levels', (m?) => {
    busAdapter.executeCommand('level.panel.open', { levelId: m ?? '' }).catch(console.error);
    console.log('[runtime.tools/levels] levels panel opened');
  });

  // ─── navigate ─────────────────────────────────────────────────────────────
  runtime.tools.register('navigate', (m?) => {
    busAdapter.executeCommand('navigate.activate', { mode: m ?? 'orbit' }).catch(console.error);
    console.log(`[runtime.tools/navigate] navigation mode activated (${m ?? 'orbit'})`);
  });

  console.log(
    '[PluginRegistry] C06 §4 (Task 3.1) — 27 plugin tool activators registered with runtime.tools' +
    ' (9 original + 9 tool.ts + 9 command-dispatch bridges = 27 total in PluginRegistry)',
  );
}
