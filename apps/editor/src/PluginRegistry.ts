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
//
// ⚠ **THE PARAGRAPH ABOVE IS NO LONGER TRUE, AND IT IS KEPT VERBATIM BECAUSE
// IT NAMES THE ROOT CAUSE OF NINE SHIPPED DEFECTS.**
// §PLUGIN-DESCRIPTOR-AT-L5 (L-9921, ADR-0367, lane PLUGIN2, 2026-08-23).
//
// The reasoning was locally correct and globally load-bearing. The type was at
// L7, so a plugin could not name it, so all 28 descriptors had to be hand-written
// here, so the census was hand-maintained, so it drifted — and a family whose
// five lines nobody wrote was registered-and-undispatchable. That happened NINE
// times (furniture, plumbing, rooms, structural, dimensions, lighting, pool,
// lift, balcony), each caught only after a person tried to use the feature.
//
// The type now lives at **L5** as `PluginRegistration` in
// `packages/plugin-sdk/src/registration.ts`. `plugins/<x>/src/registration.ts`
// importing `@pryzm/plugin-sdk` is a DOWNWARD import THROUGH THE FACADE — legal
// under `check-layer-boundaries.ts`, and it does not touch the SDK-bypass
// ratchet. The objection recorded above is removed rather than argued with.
//
// ⛔ MIGRATION IS DELIBERATELY INCOMPLETE, AND SAYING SO IS THE POINT. Exactly
// ONE plugin is proven end-to-end on the new mechanism (`section-view`, chosen
// because it was live-broken: registered at engineLauncher:711 with no `section`
// store key, so all six verbs threw at buildContext). The other 27 descriptors
// below are UNCHANGED inline literals and both shapes are first-class — moving a
// mechanism and enabling N families are different risks, and
// `tools/ga-gate/check-plugin-census-equivalence.ts` parses BOTH shapes (a
// parser that understood only object literals would report each migrated
// descriptor as a DELETED registration — a ratchet DOWN that is really the gate
// going blind). The ordered backlog is ADR-0367 §6.

import type { CommandHandler } from '@pryzm/command-bus';
import type { Store } from '@pryzm/stores';
import { SelectionStore, AnnotationStore } from '@pryzm/stores';
import type { PluginContribution } from '@pryzm/runtime-composer/types';
// §PLUGIN-DESCRIPTOR-AT-L5 (L-9921) — the registration contract, now at L5.
import type { PluginRegistration } from '@pryzm/plugin-sdk';

// ── C06 §4 — Task 3.1 (Phase 3) — plugin tool activator imports ─────────────
//
// Seven plugin tool classes imported via stable `./tool` subpath exports.
// One tool (FurniturePlacementTool) requires engine-provided deps (the
// catalogue) and therefore uses the existing window-bridge pattern (same as
// ToolsAreaLayout's ramp/room/ceiling bridges) until Phase 4 lands the
// runtime.inputHost + runtime.auxiliaries engine bridges. Its assignment site
// is apps/editor/src/engine/initTools.ts:690 — verified, not assumed.
//
// ⚠ This read "Two tools (DimensionTool, FurniturePlacementTool)" until Wave 4c.
// DimensionTool was never imported here and window.dimensionTool was never
// assigned anywhere; the dimension bridge has been deleted. See the tombstone
// in registerAllPluginToolActivators.
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
import { FloorStore, buildFloorHandlerSet } from '@pryzm/plugin-floor';
// §FIX-POOL-UNREACHABLE (L-5200, ADR-0124) — the pool ASSEMBLY. See the descriptor below.
import { PoolStore, WaterStore, buildPoolHandlerSet } from '@pryzm/plugin-pool';
// §FEAT-BALCONY-COMPOUND (L-5600, C103 / ADR-0333) — the balcony COMPOUND. See the
// descriptor below; this import is axis 1 of the four the pool taught us to check.
import { BalconyStore, buildBalconyHandlerSet } from '@pryzm/plugin-balcony';
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700, C104 / ADR-0325) — the lift COMPOUND. See the
// descriptor below for the four-axis reachability argument.
import { LiftCompoundStore, LiftPartStore, buildLiftHandlerSet } from '@pryzm/plugin-lift';
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7914, C106 / ADR-0348) — the AUTHORED
// construction / setting-out line. ⛔ NOT the cadastral `Parcel.boundary` (C19 §1.4 —
// legal, surveyed, ONE-SHOT IMMUTABLE, owned by the site subsystem) and NOT
// `RoomBoundingLine`. See the descriptor below; this import is axis 1 of the four.
import { BoundaryLineStore, buildBoundaryLineHandlerSet } from '@pryzm/plugin-boundary-line';
// §PLUGIN-DESCRIPTOR-AT-L5 (L-9922) — ⭐ THE FIRST DESCRIPTOR THIS FILE DOES NOT
// AUTHOR. `sectionViewPluginRegistration` is declared in
// `plugins/section-view/src/registration.ts` and referenced below as a bare
// identifier. It is the only import in this block that brings a WHOLE
// registration rather than the parts one has to be assembled from — which is the
// difference between a plugin that describes itself and a plugin this file
// describes on its behalf.
import { sectionViewPluginRegistration } from '@pryzm/plugin-section-view';

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
// are singular (`dimension.create`, …) and its plugin-id is plural
// (`dimensions`).  Handler TYPE strings are orthogonal to storeKey (the L2
// bus matches types by exact string).  BUT the STORE KEY the handlers READ
// is NOT orthogonal: every dimension handler declares
// `affectedStores = ['dimension']` + reads `ctx.stores.dimension` (singular),
// so the bus storesProvider (built from `stores[plugin.storeKey]`) MUST
// contribute the store under `'dimension'` — otherwise `dimension.createMany`
// (the first dimension verb ever dispatched through the bus, by the
// AutoDimension executor L-138) throws "required store 'dimension' is missing
// from HandlerContext.stores" (ADR-002 §3), exactly the §LIGHTING-STORE-FIX
// class. §FIX-DIMENSION-STOREKEY-SINGULAR (L-138): storeKey='dimension' to
// match the handlers (unlike rooms, whose handlers read the plural key).
import { FurnitureStore, buildFurnitureHandlerSet } from '@pryzm/plugin-furniture';
// §BATH102 — `BathroomPodStore` rides the same package (C109 §0 governs the pod's
// store and handlers as living in `plugins/plumbing/`); the two `bathroomPod.*`
// handlers are inside `buildPlumbingHandlerSet()`, spread from their own named set.
import { PlumbingStore, BathroomPodStore, buildPlumbingHandlerSet } from '@pryzm/plugin-plumbing';
// §LIGHTING-STORE-FIX (2026-06-26) — lighting was registered for HANDLERS
// (engineLauncher registerLightingHandlers) but never contributed a STORE here,
// so the bus storesProvider had no `lighting` key and every `lighting.create`
// threw "required store 'lighting' is missing from HandlerContext.stores" (48×
// per furnish — once per fixture). Mirror the plumbing descriptor exactly:
// LightingStore() (no-arg) + buildLightingHandlerSet() (no deps).
import { LightingStore, buildLightingHandlerSet } from '@pryzm/plugin-lighting';
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

/**
 * A registered plugin's runtime contribution. Constructed once at boot and
 * consumed by `bootstrapWithEverything()`.
 *
 * §PLUGIN-DESCRIPTOR-AT-L5 (L-9921, ADR-0367) — ⭐ THIS IS NOW AN ALIAS, NOT A
 * DECLARATION. The seven fields moved verbatim to
 * `packages/plugin-sdk/src/registration.ts` as `PluginRegistration`, at **L5**,
 * so a plugin can name the contract it fulfils with a legal DOWNWARD import.
 * The alias is kept because every one of the 28 descriptors below, plus
 * `bootstrap.everything.ts`, `apps/editor/src/index.ts` and the bootstrap suite,
 * refers to this name — a rename would have been a 40-site diff on top of a
 * mechanism change, and the two would have been impossible to review apart.
 *
 * The two type arguments are the reason the move was possible at all. L5 may
 * not import `@pryzm/runtime-composer` (L3 is downward, but its
 * `PluginContribution.activate` takes the whole `PryzmRuntime`) and MUST NOT
 * import `@pryzm/plugin-rooms` (L6 — that is an UPWARD edge, the exact thing
 * being deleted). So both are type PARAMETERS in the SDK and are supplied HERE,
 * at the only layer that legally knows both.
 */
export type PluginDescriptor = PluginRegistration<PluginContribution, RoomEventRuntime>;

/** Deps bag passed to `buildHandlers` — populated incrementally as each
 *  plugin's auxiliaries land.  Typed loosely (each plugin reads its own
 *  keys with a local cast) so the registry can stay free of cycles.
 *  §PLUGIN-DESCRIPTOR-AT-L5 — alias of the L5 `PluginRegistrationDeps`. */
export type PluginDeps = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
//                               Registry
// ---------------------------------------------------------------------------

/**
 * §FIX-WALL-TYPE-UNIFY-CATALOGUE (L-50, ADR-0116) — the ONE canonical wall
 * system-type catalogue is the geometry-wall singleton the type picker
 * (WallTypeSelectorWidget), the plan-view create path (WallPlanToolHandler), and
 * the 3D thickness/layers stamping all read via `window.wallSystemTypeStore`.
 * This adapter exposes that singleton in the shape the wall plugin handlers
 * consume (`has`/`get`/`list`/`add`/`size`) so the composeRuntime-registered
 * CreateWall / CreateWallBatch / SetWallSystemType handlers derive thickness +
 * layers from the SAME store the user sees — collapsing the former two divergent
 * catalogues (a fresh plugin-side store vs the picker's geometry-wall singleton)
 * into one.
 *
 * The singleton is read LAZILY at call time via a narrow structural `window`
 * cast (NOT `(window as any)`, so P4-compliant),
 * never captured at build time. This keeps the composition root free of an eager
 * geometry-wall/core-app-model module load (which touches the DOM), and `get()`
 * runs at command-execute time — by which point `initBuilders` has assigned
 * `window.wallSystemTypeStore`. This is the same seam the (formerly dead)
 * engineLauncher §WALL-TYPE-WIRE adapter used, now hosted at the ACTIVE
 * composition root so it is the store the authoritative handler truly reads.
 *
 * `has()` is PERMISSIVE by design: a faithful `has()` would re-arm the dormant
 * "unknown systemTypeId → reject at canExecute" branch across every wall create
 * handler — including `wall.batch.create`, which the apartment generator drives.
 * Resolution via `get()` is best-effort and falls back to the caller's default
 * thickness on a miss, so an unknown/stale id can never reject a wall. This
 * preserves the shipped §FIX-PLAN-WALL-TYPE-IGNORED behaviour.
 */
interface SharedWallTypeSingleton {
  getById?(id: string): { totalThickness: number; layers: unknown[] } | undefined;
  getAll?(): unknown[];
  add?(t: unknown): unknown;
}
function sharedWallTypeSingleton(): SharedWallTypeSingleton | undefined {
  // Narrow STRUCTURAL window cast (the PropertyPanelPreDraw.ts pattern) rather
  // than the ambient global-window.d.ts declaration: the ambient file is not in
  // scope when OTHER packages compile this file in per-package isolation
  // (check-per-package-compile), and `window.wallSystemTypeStore` was failing
  // TS2339 in 23 of their compiles. Still NOT `(window as any)` — P4-compliant.
  return typeof window !== 'undefined'
    ? (window as { wallSystemTypeStore?: SharedWallTypeSingleton }).wallSystemTypeStore
    : undefined;
}
export function buildSharedWallCatalogue(): WallSystemTypeStore {
  return {
    has: (_id: string) => true,
    get: (id: string) => sharedWallTypeSingleton()?.getById?.(id),
    list: () => sharedWallTypeSingleton()?.getAll?.() ?? [],
    add: (t: unknown) => sharedWallTypeSingleton()?.add?.(t),
    size: () => sharedWallTypeSingleton()?.getAll?.().length ?? 0,
  } as unknown as WallSystemTypeStore;
}

/**
 * §SEL-STORE-IDENTITY (W4d) — the ONE `SelectionStore` of the current bootstrap,
 * shared between the selection descriptor's `buildStore()` and its
 * `buildHandlers()`.
 *
 * ⛔ WHY THIS HOLDER EXISTS AT ALL. `PluginRegistration` gives `buildHandlers`
 * a deps bag but gives `buildStore` nothing, so a descriptor cannot otherwise
 * hand its OWN store to its OWN handlers. Every other family is fine with that:
 * their handlers use `produceCommand` against the `Record<id,dto>` view the bus
 * provides. Selection may not (`selectionStoreAccess.ts` states why — a
 * non-empty patch pair would put every click on the undo ring buffer, against
 * ADR-0015), so its handlers need the instance itself.
 *
 * ⭐ ADOPTED, NEVER A SECOND STORE. `buildHandlers` receives the exact object
 * `buildStore` returned and that `bootstrapWithEverything` registers as
 * `stores.selection`. Minting a rival here would fork selection state against
 * the store the bus's `storesProvider` fronts —  the same defect
 * §BLSTORE-COMPOSED-PLUGIN-STORES closed for `boundaryLine`.
 *
 * ⚠ ORDERING, STATED SO IT IS NOT ASSUMED: `bootstrapWithEverything` runs a
 * STORES pass over every descriptor and only then a HANDLERS pass
 * (`bootstrap.everything.ts` §1 and §2), so this is always written before it is
 * read within one bootstrap. A later bootstrap overwrites it, and its own
 * stores pass runs before its own handlers pass, so each bootstrap gets its own
 * consistent pair. Asserted end-to-end by
 * `apps/editor/__tests__/selectionVerbsReachTheComposedSelectionStore.test.ts`
 * ARM C, which reads the write back through a DIFFERENT verb on the SAME
 * provider — i.e. it fails if identity is ever broken.
 */
let selectionStoreForThisBootstrap: SelectionStore | null = null;

/** All 13 plugins, in registration order.  Order matters only for the
 *  rare cross-plugin dep (wall handlers consume `wallSystemTypes`). */
export const ALL_PLUGINS: readonly PluginDescriptor[] = [
  // ---- Wall (carries the catalogue dep) ----
  {
    id: 'wall',
    storeKey: 'wall',
    buildStore: () => new WallStore() as unknown as Store<object>,
    // §FIX-WALL-TYPE-UNIFY-CATALOGUE (L-50) — was `new WallSystemTypeStore()`, a
    // FRESH plugin-side catalogue whose built-ins diverged from the picker's
    // (e.g. wt-monolithic 0.1 m here vs 1.0 m in geometry-wall). Now the ONE
    // shared geometry-wall catalogue, adapted to the handler interface.
    buildAuxiliaries: () => ({ wallSystemTypes: buildSharedWallCatalogue() }),
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

  // ---- Pool + Water (§FIX-POOL-UNREACHABLE, L-5200 · ADR-0124 · C100) ----
  //
  // ⭐ THIS IS THE WHOLE UNREACHABILITY FIX, AND IT IS THE `lighting` DESCRIPTOR'S
  // DEFECT VERBATIM (see §LIGHTING-STORE-FIX above).
  //
  // MEASURED 2026-08-22, before this descriptor existed — four independent axes,
  // each re-run rather than inherited from the L-980 note that first recorded them:
  //
  //   1. `rg -n "new PoolStore\(|new WaterStore\("` → ZERO construction sites
  //      repo-wide. The classes in `plugins/pool/src/store.ts` were never built,
  //      not even by the plugin's own tests.
  //   2. No `pool` / `water` storeKey was declared HERE, so the bus storesProvider
  //      (built from `stores[plugin.storeKey]` in bootstrap.everything.ts) had no
  //      such key, and `CommandBus.buildContext` (CommandBus.ts:286-292) THREW
  //        "pool.create: required store 'pool' is missing from HandlerContext.stores"
  //      before `pool.create` mutated anything. The handlers WERE registered
  //      (engineLauncher.ts:630) — registered but not dispatchable, which is the
  //      `[[authored-but-unwired-is-the-bottleneck]]` shape exactly.
  //   3. No tool, palette entry or plan handler dispatched `pool.create`; the only
  //      call sites were `plugins/pool/__tests__/`.
  //   4. The AI chat classifies `pool.create` as class B
  //      (`ChatCommandClassification.ts:66`), so that route refused it too.
  //
  // Axes 1 + 2 are closed by the two descriptors below. Axis 3 is closed by the
  // `pool` activator + the LANDSCAPE palette row + `PoolPlanToolHandler`. Axis 4 is
  // NOT closed here and is recorded as still-open in L-5206.
  //
  // ⚠ ORDER: pool sits after slab because `CreatePoolHandler.canExecute` reads the
  // HOST slab from `ctx.stores.slab`. That is a DISPATCH-time read, so array order
  // is not load-bearing — it is kept adjacent for the reader, not for correctness.
  {
    id: 'pool',
    storeKey: 'pool',
    buildStore: () => new PoolStore() as unknown as Store<object>,
    // `pool.create` / `pool.delete` declare affectedStores
    // ['pool','wall','slab','water'] — ALL FOUR must resolve, which is why the
    // water descriptor below is not optional.
    buildHandlers: () => buildPoolHandlerSet() as readonly CommandHandler<unknown>[],
  },
  {
    id: 'water',
    storeKey: 'water',
    buildStore: () => new WaterStore() as unknown as Store<object>,
    // ⭐ NO HANDLERS, DELIBERATELY — and this is a statement, not an omission.
    // Water has no commands of its own: a water body is created and destroyed
    // ONLY as part of a pool assembly (ADR-0124 §4), so `pool.create` owns the
    // only write path. Minting a `water.create` here would be a second, rival way
    // to produce a water body with no pool around it — the exact defect ADR-0124
    // §4 exists to prevent. The store is contributed so the pool's fourth
    // affectedStore resolves; the command surface stays the pool's.
    buildHandlers: () => [] as readonly CommandHandler<unknown>[],
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

  // ---- Floor (§P3.2-FL) ----
  // FloorStore provides the L1 bus store so ctx.stores.floor is materialised
  // for CreateFloorHandler / UpdateFloorLayersHandler.  The initTools.ts
  // §P3.2-FL bridge mirrors Immer patches to the legacy FloorStore for
  // FloorFragmentBuilder mesh rendering during the F-1.x migration window.
  {
    id: 'floor',
    storeKey: 'floor',
    buildStore: () => new FloorStore() as unknown as Store<object>,
    buildHandlers: () => buildFloorHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Balcony (§FEAT-BALCONY-COMPOUND, L-5600 · C103 · ADR-0333) ----
  //
  // ⭐ THIS DESCRIPTOR IS THE WHOLE REACHABILITY FIX, WRITTEN BEFORE THE DEFECT
  // RATHER THAN AFTER IT. The pool sat in this repo for weeks, fully built and fully
  // tested, and could not be dispatched AT ALL because these five lines did not
  // exist (§FIX-POOL-UNREACHABLE, L-5200). The production storesProvider is
  // `storesAsRecordView(stores)` over `stores[plugin.storeKey]` accumulated from
  // `ALL_PLUGINS` (bootstrap.everything.ts), so a plugin with no descriptor here
  // contributes no store key, and `CommandBus.buildContext` THROWS
  //     "balcony.create: required store 'balcony' is missing from HandlerContext.stores"
  // BEFORE any mutation — registered and undispatchable.
  //
  // `apps/editor/__tests__/balconyReachableThroughComposedRuntime.test.ts` exists to
  // make that unrepeatable: delete this descriptor and every test in it fails.
  //
  // ⚠ THE OTHER THREE STORES ARE *NOT* DECLARED HERE, AND THAT IS CORRECT.
  // `balcony.create` declares `affectedStores = ['balcony','slab','floor','handrail']`
  // — all four must resolve — but `slab`, `floor` and `handrail` are contributed by
  // their OWN descriptors above. A balcony's plate IS a slab and lives in the slab
  // store; that is the point of a compound (C103 §2.3). The pool needed a second
  // descriptor only because `water` was a genuinely new family with no home.
  //
  // ⚠ ORDER: balcony is placed after `slab`, `handrail` and `floor` because it
  // writes all three of their stores. Array order is NOT load-bearing — a handler
  // reads its stores at DISPATCH time, long after every descriptor has been built —
  // so this is for the reader, not for correctness. It is stated because the first
  // draft of this comment claimed an ordering the code did not have, which is
  // exactly the class of defect this file is otherwise full of warnings about.
  {
    id: 'balcony',
    storeKey: 'balcony',
    buildStore: () => new BalconyStore() as unknown as Store<object>,
    buildHandlers: () => buildBalconyHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Lift + LiftPart (§FEAT-LIFT-COMPOUND-SYSTEM, L-5700 · C104 · ADR-0325) ----
  //
  // ⭐ THESE TWO DESCRIPTORS ARE AXIS 2 OF THE FOUR-AXIS REACHABILITY CHECK, AND
  // AXIS 2 IS THE ONE THAT SILENTLY THROWS.
  //
  // The production storesProvider is `storesAsRecordView(stores)` over
  // `stores[plugin.storeKey]` accumulated from `ALL_PLUGINS`
  // (bootstrap.everything.ts:145). With no descriptor here, the key is simply
  // absent, and `CommandBus.buildContext` (CommandBus.ts:286-292) throws
  //
  //     lift.create: required store 'lift' is missing from HandlerContext.stores
  //
  // BEFORE anything mutates — with the handlers registered and undispatchable. That
  // is the `pool` defect (L-5200) and the `lighting` defect before it, and it is why
  // `apps/editor/__tests__/liftReachableThroughComposedRuntime.test.ts` reads
  // `rt.stores.lift` off the REAL composition root and never builds a store of its
  // own. A plugin's own suite CANNOT catch this: it supplies the provider that was
  // broken.
  //
  // ⚠ MEASURED STATE OF THE OTHER THREE AXES FOR `lift`, 2026-08-22, so nobody
  // inherits the stale reading the brief for this lane carried:
  //   1. `new LiftStore(` — 2 non-test sites (initBuilders.ts:982/987). That is the
  //      LOD-200 MASSING lift's store, a DIFFERENT store from the two below; see
  //      `LiftCompoundTypes.ts` for why both exist.
  //   3. DISPATCH — `lift` already has a palette button
  //      (`CreatePanelLayout.ts:278`, Structure > Lift) and an activator
  //      (`ToolsAreaLayout.ts:332`). ⚠ BOTH DRIVE THE LEGACY MASSING COMMAND
  //      (`CreateVerticalCirculationCommand`), NOT `lift.create`. So the tool key is
  //      armed and the COMPOUND is still not dispatchable from the UI. The earlier
  //      report that `lift` "arms nothing" was stale — it was fixed by
  //      §FIX-DECLARED-TOOL-WITH-NO-ACTIVATOR; the accurate statement is narrower and
  //      is recorded in L-5709.
  //   4. `ChatCommandClassification.ts` classifies `lift.create` class B, so the AI
  //      chat route refuses it. NOT closed here — recorded open in L-5710.
  //
  // ⚠ ORDER: lift sits after `slab`, `door` and `curtain-wall` because
  // `CreateLiftHandler` declares
  // `affectedStores = ['lift','liftPart','wall','curtainwall','door','slab']` and ALL
  // SIX must resolve. Array order is NOT load-bearing (a handler reads its stores at
  // DISPATCH time, long after every descriptor is built) — this is for the reader.
  {
    id: 'lift',
    storeKey: 'lift',
    buildStore: () => new LiftCompoundStore() as unknown as Store<object>,
    buildHandlers: () => buildLiftHandlerSet() as readonly CommandHandler<unknown>[],
  },
  {
    id: 'liftPart',
    storeKey: 'liftPart',
    buildStore: () => new LiftPartStore() as unknown as Store<object>,
    // ⭐ NO HANDLERS, DELIBERATELY — a statement, not an omission, and the same
    // statement the `water` descriptor makes. A cabin part is created and destroyed
    // ONLY as part of a lift compound (C104 §2), so `lift.create` owns the only
    // write path. Minting a `liftPart.create` would be a second, rival way to
    // produce a car ceiling with no car around it — exactly the defect the
    // single-write-path rule exists to prevent. The store is contributed so the
    // lift's second affectedStore resolves; the command surface stays the lift's.
    buildHandlers: () => [] as readonly CommandHandler<unknown>[],
  },

  // ---- BoundaryLine (§FEAT-CONSTRUCTION-BOUNDARY-LINE, L-7914 · C106 · ADR-0348) ----
  //
  // ⭐ AXIS 2 OF THE FOUR-AXIS REACHABILITY CHECK — THE ONE THAT THROWS SILENTLY.
  // With no descriptor here the key is simply absent from
  // `storesAsRecordView(stores)` and `CommandBus.buildContext` (CommandBus.ts:286-292)
  // throws
  //
  //     boundaryLine.create: required store 'boundaryLine' is missing from HandlerContext.stores
  //
  // BEFORE anything mutates — with the handlers registered and undispatchable. That is
  // the `pool` defect (L-5200), the `lift` defect (L-5700) and the `lighting` defect
  // before both, and it is why
  // `apps/editor/__tests__/boundaryLineReachableThroughComposedRuntime.test.ts` reads
  // `rt.stores.boundaryLine` off the REAL composition root and never builds a store of
  // its own. A plugin's own suite CANNOT catch this: it supplies the provider that was
  // broken.
  //
  // ⭐ AND THIS IS THE FAMILY'S **ONLY** STORE. C84 §1 measures five rival
  // representations per family and rows 2/3 — the plugin DTO store and the legacy
  // geometry store — are the pair that keeps diverging (`MoveWall.ts` refuses
  // `wall.move` in as many words). `boundaryLine` has no geometry twin: this instance
  // IS the authority, which makes C84 EI-1 hold by construction rather than by
  // discipline. `boundaryLineHasOneStore.test.ts` checks the claim rather than
  // asserting it.
  //
  // ⚠ ORDER IS NOT LOAD-BEARING — every handler here declares `affectedStores:
  // ['boundaryLine']` and nothing else, because creating, attaching to, updating or
  // deleting a boundary line writes exactly one store. The MOVE is the multi-store
  // gesture, and it is deliberately NOT a plugin handler (see
  // `plugins/boundary-line/src/handlers/index.ts` for why).
  {
    id: 'boundary-line',
    storeKey: 'boundaryLine',
    buildStore: () => new BoundaryLineStore() as unknown as Store<object>,
    buildHandlers: () => buildBoundaryLineHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Furniture (E-finish.0.E orphan registration) ----
  {
    id: 'furniture',
    storeKey: 'furniture',
    buildStore: () => new FurnitureStore() as unknown as Store<object>,
    buildHandlers: () => buildFurnitureHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Plumbing (E-finish.0.E orphan registration) ----
  //
  // ⚠ §BATH102 — `buildPlumbingHandlerSet()` ALSO registers `bathroomPod.create` and
  // `bathroomPod.delete` (C109). Their `affectedStores: ['bathroomPod']` resolves
  // against the store the `bathroomPod` descriptor below contributes, NOT this one:
  // `storesAsRecordView(stores)` is built from EVERY descriptor's store, which is how
  // `CreateLiftHandler` — registered by the `lift` descriptor — resolves `wall`,
  // `curtainwall`, `door` and `slab` from four other descriptors.
  {
    id: 'plumbing',
    storeKey: 'plumbing',
    buildStore: () => new PlumbingStore() as unknown as Store<object>,
    buildHandlers: () => buildPlumbingHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- BathroomPod (§BATH102 · C109 · L-11480) ----
  //
  // ⭐ AXIS 1 AND AXIS 2 OF C109 §9's SEVEN, AND AXIS 2 IS THE ONE THAT SILENTLY
  // THROWS. The production storesProvider is `storesAsRecordView(stores)` over
  // `stores[plugin.storeKey]` accumulated from `ALL_PLUGINS`
  // (bootstrap.everything.ts:145). With no descriptor here the key is simply absent
  // and `CommandBus.buildContext` (CommandBus.ts:286-292) throws
  //
  //     bathroomPod.create: required store 'bathroomPod' is missing from HandlerContext.stores
  //
  // BEFORE anything mutates — with the handlers registered and undispatchable. That is
  // the `pool` defect (L-5200), the `lift` defect (L-5700) and the `lighting` defect
  // before both, and it is why
  // `apps/editor/__tests__/bathroomPodReachableThroughComposedRuntime.test.ts` reads
  // `rt.stores.bathroomPod` off the REAL composition root and never builds a store of
  // its own. A plugin's own suite CANNOT catch this: it supplies the provider that was
  // broken.
  //
  // ⭐ AND THIS IS THE FAMILY'S **ONLY** STORE — the `boundaryLine` shape (C106 §1),
  // not the `plumbing` one. C84 §1's rows 2/3 (a plugin DTO store and a legacy geometry
  // store that keep diverging) do not both exist here, so C84 EI-1 holds BY
  // CONSTRUCTION. See `plugins/plumbing/src/bathroomPodStore.ts`.
  //
  // ⭐ NO HANDLERS ON THIS DESCRIPTOR, DELIBERATELY — a statement, not an omission, and
  // it is the `water` / `liftPart` idiom with a DIFFERENT reason, written down in
  // `STORE_ONLY_PLUGIN_IDS` below. The pod DOES own two verbs; they are registered by
  // the `plumbing` descriptor above because C109 §0 governs the pod's store and
  // handlers as living in `plugins/plumbing/`, and a descriptor carries exactly ONE
  // `storeKey`. ⛔ Giving this descriptor the handlers instead would need a
  // `plugins/bathroom-pod/` DIRECTORY, and arm D of
  // `tools/ga-gate/check-plugin-census-equivalence.ts` is HARD-0 on
  // *"REGISTRY \ DISK — booted with no directory"*.
  {
    id: 'bathroomPod',
    storeKey: 'bathroomPod',
    buildStore: () => new BathroomPodStore() as unknown as Store<object>,
    buildHandlers: () => [] as readonly CommandHandler<unknown>[],
  },

  // ---- Lighting (§LIGHTING-STORE-FIX 2026-06-26) ----
  //
  // Sibling of plumbing: the lighting handlers were already registered (via
  // registerLightingHandlers in engineLauncher AND, authoritatively, here through
  // buildHandlers), but no STORE was contributed — so the bus storesProvider
  // (built from `stores[plugin.storeKey]` in bootstrap.everything.ts) had no
  // `lighting` key. CreateLightingHandler.affectedStores = ['lighting'] and reads
  // ctx.stores.lighting, so every lighting.create threw
  //   "required store 'lighting' is missing from HandlerContext.stores" (ADR-002 §3)
  // — 48× per furnish (once per fixture), and the post-furnish fixtures never
  // rendered. Contributing LightingStore under storeKey 'lighting' (exact mirror of
  // the plumbing descriptor) closes the create→`lighting.created`→legacy-3D-store
  // bridge that initTools already wires.
  {
    id: 'lighting',
    storeKey: 'lighting',
    buildStore: () => new LightingStore() as unknown as Store<object>,
    buildHandlers: () => buildLightingHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Rooms (E-finish.0.E orphan registration) ----
  //
  // Task 1.3 (C11 §6.3) — rooms is the first plugin to declare a
  // `wireSubscriptions` callback.  `wireAllPluginSubscriptions(runtime)` calls
  // it once after `composeRuntime()` so room boundaries are recomputed
  // event-driven (wall.created / curtain-wall.created → room.redetect)
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
  // §FIX-DIMENSION-STOREKEY-SINGULAR (L-138): storeKey MUST be 'dimension'
  // (singular) to match every handler's affectedStores=['dimension'] +
  // ctx.stores.dimension. Was 'dimensions' (plural) — the bus storesProvider
  // then had no 'dimension' key, so dimension.createMany (AutoDimension) threw
  // "required store 'dimension' is missing" (ADR-002 §3). Mirror of
  // §LIGHTING-STORE-FIX. The DimensionStore held no bus data before (this bug
  // blocked all bus dimension creates), so no persistence is orphaned.
  {
    id: 'dimensions',
    storeKey: 'dimension',
    buildStore: () => new DimensionStore() as unknown as Store<object>,
    buildHandlers: () => buildDimensionHandlerSet() as readonly CommandHandler<unknown>[],
  },

  // ---- Selection (Wave 18 — zero-dep handler registration) ----
  //
  // `SelectionStore` lives in `packages/stores/` (not in the plugin package).
  // `buildSelectionHandlerSet()` takes NO deps and returns the three
  // canonical handlers (selection.select / .deselect / .clear).  Handlers
  // access `ctx.stores.selection`.
  //
  // ⛔ §SEL-STORE-IDENTITY (W4d) — THIS COMMENT USED TO END: "the SelectionStore
  // registered here under storeKey 'selection' satisfies that contract in the
  // legacy `bootstrapWithEverything()` path". IT DID NOT, AND HAD NOT SINCE THE
  // BUS SWITCHED TO A RECORD VIEW. Registering the store under the matching key
  // satisfies the NAME; it does not satisfy the SHAPE. The bus hands handlers
  // `storesAsRecordView(stores)` — `Object.fromEntries(store.getState())`,
  // a `Record<id,dto>` with no methods (`bootstrap.ts:94` / `:148-158`) — so
  // measured at the real composition root, FOUR of the five verbs threw
  // `ctx.stores.selection.<method> is not a function`, INCLUDING the
  // `selection.clear` the default pointer tool dispatches at line ~1223 below
  // into a swallowing `.catch(console.error)`.
  //
  // The store is therefore handed to `buildSelectionHandlerSet` directly. Same
  // instance, both slots — see `selectionStoreForThisBootstrap` above for why a
  // holder is needed and why a second store would be a rival, not a fix.
  //
  // ⚠ STILL NOT TRUE, so it is not implied: nothing POPULATES this store from
  // the 3-D viewport. `packages/input-host/SelectionManager`,
  // `runtime.selection` (`composeRuntime.ts:328`) and
  // `packages/core-app-model/SelectionBus` are the three live selection
  // authorities; these verbs are a fourth surface that only a `selection.*`
  // dispatch fills. Making them dispatchable does NOT make the toolbar's Copy
  // button see the user's 3-D selection.
  {
    id: 'selection',
    storeKey: 'selection',
    buildStore: () => {
      selectionStoreForThisBootstrap = new SelectionStore();
      return selectionStoreForThisBootstrap as unknown as Store<object>;
    },
    buildHandlers: () => buildSelectionHandlerSet(
      selectionStoreForThisBootstrap === null ? {} : { store: selectionStoreForThisBootstrap },
    ) as readonly CommandHandler<unknown>[],
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

  // ---- Section view — §PLUGIN-DESCRIPTOR-AT-L5 (L-9922, ADR-0367) ----------
  //
  // ⭐ THE ONLY ELEMENT OF THIS ARRAY THAT IS NOT AN OBJECT LITERAL, AND THAT IS
  // THE ENTIRE DEMONSTRATION. The record is authored in
  // `plugins/section-view/src/registration.ts` — inside the plugin, at L6,
  // against a contract at L5. Nothing about section-view is described here any
  // more; this line only says that it participates.
  //
  // ⚠ IT WAS ALSO LIVE-BROKEN, WHICH IS WHY IT WAS CHOSEN OVER A COSMETIC
  // MIGRATION OF AN ALREADY-WORKING FAMILY. `engineLauncher.ts:711` has been
  // calling `registerSectionHandlers(_bus)` on the real runtime bus since
  // §P3.4-SE, so all six `section.*` verbs were REGISTERED. No descriptor
  // existed, so no `section` key reached `storesAsRecordView(stores)`, and all
  // six handlers declare `affectedStores = ['section']`. Every dispatch died in
  // `CommandBus.buildContext` with
  //     "section.create: required store 'section' is missing from HandlerContext.stores"
  // before touching anything — the tenth instance of the pool (L-5200) / lift
  // (L-5700) / lighting shape, and the FIRST found by a gate
  // (`check-plugin-census-equivalence.ts` arm A) instead of by a person.
  //
  // engineLauncher needs no edit: its `_bus` is the §OI-053 skip-if-present
  // proxy, so the composition root now registers these six FIRST and that call
  // becomes an idempotent no-op — the same relationship `registerWallHandlers`
  // already has with the wall descriptor.
  //
  // storeKey is `'section'`, NOT `'section-view'`. The id must match the
  // DIRECTORY (the census gate compares it to `ls plugins/`); the storeKey must
  // match what the handlers read. §FIX-DIMENSION-STOREKEY-SINGULAR (L-138) is
  // the same divergence in the other direction.
  sectionViewPluginRegistration,
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
  // §FIX-POOL-UNREACHABLE (L-5200) — both contribute a non-empty storeKey, so both
  // belong in the list the storeKey assertion iterates. `water` contributes no
  // handlers by design; see STORE_ONLY_PLUGIN_IDS below.
  'pool',
  'water',
  // §FEAT-BALCONY-COMPOUND (L-5600) — contributes a non-empty storeKey AND a
  // handler set, so it belongs in the list the storeKey assertion iterates and needs
  // no STORE_ONLY_PLUGIN_IDS exemption.
  'balcony',
  // §FEAT-LIFT-COMPOUND-SYSTEM (L-5700) — `lift` contributes a storeKey AND a
  // handler set. `liftPart` contributes a storeKey and NO handlers by design, so it
  // needs a written reason in STORE_ONLY_PLUGIN_IDS below (the bootstrap test
  // requires >= 1 handler per plugin unless the id is named there).
  'lift',
  'liftPart',
  // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7914) — contributes a non-empty storeKey AND
  // a handler set, so it belongs in the list the storeKey assertion iterates and needs
  // no STORE_ONLY_PLUGIN_IDS exemption.
  'boundary-line',
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
  // §BATH102 (L-11480) — the C109 compound contributes a non-empty storeKey and NO
  // handlers of its own, so it belongs in the list the storeKey assertion iterates AND
  // needs a written reason in STORE_ONLY_PLUGIN_IDS below. ⚠ Omitting this row would
  // NOT have failed anything loudly — it would simply have landed in arm F of
  // `check-plugin-census-equivalence.ts` beside `floor`, `lighting` and `view`, which
  // is why the row and the descriptor must land in the SAME commit.
  'bathroomPod',
  'rooms',
  'structural',
  'dimensions',
  'selection',
  'annotations',
  // §PLUGIN-DESCRIPTOR-AT-L5 (L-9922) — contributes storeKey `'section'` AND six
  // handlers, so it belongs in the list the bootstrap suite's storeKey assertion
  // iterates and needs no STORE_ONLY_PLUGIN_IDS exemption. ⚠ Omitting this row
  // would NOT have failed anything loudly: the descriptor would still boot, and
  // the per-plugin storeKey assertion would simply never look at it. That silent
  // hole is arm F of `check-plugin-census-equivalence.ts`, and it is why the row
  // and the descriptor must land in the SAME commit.
  'section-view',
] as const;

export type ElementPluginId = (typeof ELEMENT_PLUGIN_IDS)[number];

/**
 * §FIX-POOL-UNREACHABLE (L-5201) — plugin ids that contribute a STORE but NO
 * command handlers, each with the reason it is right that they do not.
 *
 * ⭐ AN EXEMPTION IS A STATEMENT, NOT A SUPPRESSION — the same idiom
 * `ACTIVATOR_EXEMPT` uses in `tools/ga-gate/check-tool-activator-coverage.ts`,
 * and it is here for the same reason. `bootstrap.everything.test.ts` asserts
 * "every plugin contributes at least one handler", which was a TRUE invariant
 * for all 22 descriptors that existed when it was written. `water` is the first
 * legitimate exception, and there were two dishonest ways to make the suite green
 * again: delete the assertion, or mint a sham `water.noop` handler so the count
 * came out right. Both would have destroyed a real invariant to accommodate one
 * row.
 *
 * Instead the invariant is REFINED and stays enforced: a plugin contributes
 * handlers UNLESS it is named here. A new zero-handler descriptor still fails the
 * suite until someone writes down why — which is the property worth keeping.
 *
 * ⛔ Adding an id here is a design claim, not a formality. Do not add one to
 * silence a failure.
 */
export const STORE_ONLY_PLUGIN_IDS: Readonly<Record<string, string>> = Object.freeze({
  // ADR-0124 §4 — a water body exists ONLY as part of a pool assembly. `pool.create`
  // writes it and `pool.delete` removes it; there is no gesture that produces water
  // on its own, so there is no `water.*` verb to register. Minting one would create a
  // second, rival way to put water in a project with no pool around it — precisely
  // what ADR-0124 §4 rules out. The STORE is still contributed because
  // `pool.create` declares `affectedStores = ['pool','wall','slab','water']` and
  // `CommandBus.buildContext` throws unless all four keys resolve.
  water: 'ADR-0124 §4 — water is created and destroyed only by pool.* ; it owns no verb of its own.',
  // C104 §2 — a lift CABIN PART exists ONLY as part of a lift compound.
  // `lift.create` writes the five of them and `lift.delete` removes them; there is
  // no gesture that produces a car ceiling on its own, so there is no `liftPart.*`
  // verb to register. Minting one would be a second, rival way to produce a cabin
  // part with no cabin around it. The STORE is still contributed because
  // `lift.create` declares `liftPart` among its six affectedStores and
  // `CommandBus.buildContext` throws unless all six keys resolve.
  liftPart: 'C104 §2 — cabin parts are created and destroyed only by lift.* ; they own no verb of their own.',
  // §BATH102 · C109 §0 — ⚠ THIS EXEMPTION'S REASON IS DIFFERENT FROM THE TWO ABOVE,
  // AND SAYING SO IS THE POINT. `water` and `liftPart` own NO verb at all. The bathroom
  // pod owns TWO (`bathroomPod.create` / `bathroomPod.delete`, C109 R-1) — they are
  // simply registered by the `plumbing` descriptor, because C109 §0 governs the pod's
  // store AND its handlers as living in `plugins/plumbing/` and a descriptor carries
  // exactly ONE storeKey. So THIS descriptor really does contribute zero handlers, the
  // assertion this list refines is really satisfied, and the verbs really are on the
  // bus — verified by `bathroomPodReachableThroughComposedRuntime.test.ts`, which
  // dispatches through the REAL composed runtime rather than trusting this comment.
  bathroomPod:
    'C109 §0 — the pod\'s two verbs are registered by the `plumbing` descriptor (its store and handlers live in plugins/plumbing/); this descriptor exists to contribute the store, which bathroomPod.create declares.',
});


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
 *  `wall.created`) drive downstream commands (e.g. `room.redetect`).
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
 *  plugin tools not wired in Phase E (S78-WIRE).
 *
 *  Families registered (none overlap with ToolsAreaLayout.ts registrations):
 *    `annotation` · `bcf` · `cross` · `furniture` ·
 *    `grid:tool` · `lighting` · `structural` · `toy-cube`
 *
 *  ⚠ This list read NINE and included `dimension` until Wave 4c. That family's
 *  bridge was deleted, not renamed — see the tombstone at the point where it
 *  stood, below `cross`. Dimensions reach the user on the ANNOTATION channel.
 *
 *  Design notes:
 *  - `busAdapter` wraps `runtime.bus.executeCommand` (returns `unknown`) in
 *    `Promise.resolve()` to satisfy the `executeCommand<T>(): Promise<unknown>`
 *    shape each plugin tool constructor expects.
 *  - `annotationScreenToWorld` / `eventScreenToWorld` are lazy engine bridges:
 *    the engine sets `window.__pryzmScreenToWorld` during `initTools()` once
 *    the THREE camera + raycaster are ready.  Until then both functions return
 *    null / undefined — every tool's `onPointerDown` bails safely, no crash.
 *  - the `furniture` activator reads `window.furnitureTool` at call-time (same
 *    pattern as ToolsAreaLayout's ramp, room, ceiling bridges) because
 *    FurniturePlacementTool requires an initialised catalogue. That bridge is
 *    REAL: `apps/editor/src/engine/initTools.ts:690` performs the assignment.
 *    ⚠ This bullet used to cover `dimension` in the same breath and assert that
 *    "both are engine-provided after initTools()". That was true of furniture
 *    and FALSE of dimension — `window.dimensionTool` was assigned nowhere in
 *    the repo. Do not re-pair them; verify the assignment site before claiming
 *    a window bridge exists.
 *    TODO(Phase 4): replace this bridge with `runtime.auxiliaries.furnitureCatalogue`
 *    once that slot is wired.
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

  // ─── dimension ─── REMOVED (Wave 4c, audit B5-DIM-01) ─────────────────────
  //
  // ⛔ DO NOT RE-ADD A `runtime.tools.register('dimension', ...)` BRIDGE HERE.
  //
  // What stood here read `window.dimensionTool` and, when it was absent, warned
  // "DimensionTool not ready — engine not yet initialised". That warning named a
  // STARTUP RACE. There was no race: the property was ASSIGNED NOWHERE IN THE
  // REPO, so the else-branch was permanent and `activate()` reported `ran=true`
  // for a tool that was never armed — the exact §CONTEXT-DATA-HONESTY failure
  // that §FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN (L-4600) closed one layer
  // down in `buildToolsStub`. Deleting the registration makes `activate()`
  // return `ran=false` and warn with the registered set, so a miss looks like a
  // miss. Contrast `furniture` below, whose bridge is REAL — `initTools.ts:690`
  // assigns `window.furnitureTool`. The two were described by one comment and
  // only one of them was ever true.
  //
  // The bridge was dead at BOTH ends, measured:
  //   • SOURCE — `grep -rn 'dimensionTool'` over the repo returned three hits,
  //     all in THIS file (two comments and the read). Zero assignments.
  //   • SINK   — `grep "activate('dimension'"` over apps/editor/src, plugins
  //     and packages returned nothing. No surface ever activated the family.
  //
  // THE CAPABILITY IS NOT MISSING — it lives on the ANNOTATION channel, and
  // that path is fully wired, rendered and persisted:
  //   AnnotationRailPanel._dispatchTool('linear-dimension')
  //     → toolManager.activateLinearDimAnnotation()
  //     → CreateAnnotationCommand(type 'linear-dim') → annotationStore
  //     → PlanViewAnnotationRenderer (renders) · ProjectSerializer (persists)
  // `applyAutoDimensions.ts` and `applyElevationAutoDimensions.ts` write the
  // same 'linear-dim' sink.
  //
  // Arming `plugins/dimensions`' DimensionTool instead would have dispatched
  // `dimension.create` into `ctx.stores.dimension` — a store that
  // `applyAutoDimensions.ts:12-24` states in production source the plan
  // renderer NEVER reads, that no exporter carries and that ProjectSerializer
  // never writes. That is a RIVAL of the live path above, producing
  // created-but-invisible dimensions. It is not the fix; this deletion is.

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
