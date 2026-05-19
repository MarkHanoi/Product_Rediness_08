/**
 * IInitUI — public contract for the `initUI` engine subsystem initialiser.
 *
 * Sprint F-2.4 (2026-05-15).
 * Sprint F-2.5 (2026-05-15): `runtime` narrowed to `PryzmRuntime | null`;
 *   `viewController` narrowed to `IViewController` (from `@pryzm/views`,
 *   which is now the canonical home for IViewController after the F-2.5
 *   migration broke the circular dep that previously blocked this narrowing).
 * Concrete implementation: `apps/editor/src/engine/initUI.ts`
 * Reference: docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ## Purpose
 * `initUI` is a 2,900-LOC god-file that mounts the main DOM layout, wires IFC
 * import/export handlers, registers curtain-wall store subscribers, and sets up
 * split-view / shadows / sections / viewpoints.  This interface captures the
 * _public contract_ that callers depend on — primarily the `UIParams` shape
 * and the `InitUIFn` function type — without requiring callers to import from
 * the implementation file directly.
 *
 * ## Design rules
 * - Fields referencing `@thatopen/components` types (`OBC.World`, `OBC.Components`)
 *   remain `unknown` to keep this package free of heavy external library deps.
 *   They will be narrowed once @thatopen/components types are added to this pkg.
 * - Fields referencing `@pryzm/*` package types are narrowed wherever the dep
 *   can be added without circularity.
 * - `initUI` has no return value (`Promise<void>`), so no `UIResult` type is needed.
 *
 * ## Fields narrowed in F-2.5
 * - `runtime`        → `PryzmRuntime | null`   (from `@pryzm/runtime-composer`)
 * - `viewController` → `IViewController`        (from `@pryzm/views`)
 *
 * ## Fields remaining `unknown` (external lib deps or circular)
 * - `world`          → `OBC.World`              (blocked: @thatopen/components)
 * - `components`     → `OBC.Components`         (blocked: @thatopen/components)
 * - `bimManager`     → `BimManager`             (blocked: @pryzm/core-app-model size)
 * - `commandManager` → `ICommandManager`        (blocked: bridge removal pending)
 * - `selectionManager` → `ISelectionManager`    (blocked: @pryzm/engine circular dep)
 * - `toolManager`    → `ToolManager`            (blocked: @pryzm/input-host size)
 * - `inspector`      → `PropertyInspector`      (blocked: @pryzm/editor-ui impl pending)
 * - `navManager`     → `NavManager`             (blocked: @pryzm/input-host size)
 * - Tool fields      → concrete tool types      (blocked: @pryzm/input-host size)
 * - `addFurniture.position` → `THREE.Vector3`   (blocked: @thatopen/components)
 * - `getHdriTexture` → `THREE.Texture | null`   (blocked: @thatopen/components)
 *
 * ## Consumer pattern
 * ```ts
 * import type { InitUIFn, IInitUIParams } from '@pryzm/editor-ui';
 *
 * // engineLauncher.ts — dynamic import so initUI stays out of the critical path
 * const { initUI } = await import('../engine/initUI');
 * await (initUI as InitUIFn)(params);
 * ```
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import type { IViewController } from '@pryzm/views';

/**
 * Minimal parameter bag passed to `initUI`.
 *
 * Fields typed `unknown` remain deferred (see §"Fields remaining unknown" above).
 */
export interface IInitUIParams {
  /** Root container element for the 3D viewport. */
  readonly container: HTMLElement;

  /** Right-side inspector panel DOM element. */
  readonly propertyPanel: HTMLElement;

  /**
   * @thatopen/components World.
   * Typed `unknown`; narrowed to `OBC.World` once @thatopen/components added as dep.
   */
  readonly world: unknown;

  /**
   * @thatopen/components Components container.
   * Typed `unknown`; narrowed to `OBC.Components` once @thatopen/components added as dep.
   */
  readonly components: unknown;

  /**
   * Composed PryzmRuntime (may be `null` during legacy boot).
   * **Narrowed F-2.5:** `PryzmRuntime | null` (was `unknown` at F-2.4).
   */
  readonly runtime?: PryzmRuntime | null;

  /** BIM manager singleton. */
  readonly bimManager: unknown;

  /** Project context (project ID, metadata). */
  readonly projectContext: unknown;

  /** Command manager for dispatching undo-aware commands. */
  readonly commandManager: unknown;

  /** Selection manager for programmatic selection. */
  readonly selectionManager: unknown;

  /** Unified tool manager. */
  readonly toolManager: unknown;

  /** Property inspector (renders the right-side panel). */
  readonly inspector: unknown;

  /** Wall drawing tool. */
  readonly wallTool: unknown;

  /** Slab drawing tool. */
  readonly slabTool: unknown;

  /** Curtain-wall drawing tool. */
  readonly curtainWallTool: unknown;

  /** Column placement tool. */
  readonly columnTool: unknown;

  /** Roof drawing tool. */
  readonly roofTool: unknown;

  /**
   * View controller for plan / section / perspective switching.
   * **Narrowed F-2.5:** `IViewController` (was `unknown` at F-2.4).
   * IViewController migrated to `@pryzm/views` in F-2.5 to break the
   * circular dep (@pryzm/engine → @pryzm/editor-ui → @pryzm/engine).
   */
  readonly viewController: IViewController;

  /** Navigation manager (orbiting, walking, fly-through). */
  readonly navManager: unknown;

  /** Grid toggle service. */
  readonly gridToggleService: unknown;

  /** Undo / redo manager. */
  readonly undoManager: unknown;

  /** @thatopen/components grid helper. */
  readonly grid: unknown;

  /** Viewpoints collection. */
  readonly viewpoints: unknown;

  /** Viewpoints panel table reference. */
  readonly viewpointsTable: unknown;

  /** Views panel table reference. */
  readonly viewsTable: unknown;

  /** Curtain-panel store instance. */
  readonly curtainPanelStoreInstance: unknown;

  /** @thatopen/fragments manager. */
  readonly fragments: unknown;

  /** Orbit-camera material map for post-processing. */
  readonly materialMap: ReadonlyMap<string, unknown>;

  /** Fit all visible scene content into the viewport. */
  readonly zoomToAll: () => void;

  /** Create and persist a new viewpoint from the current camera. */
  readonly createViewpoint: () => void;

  /** Refresh the views panel table (called after view creation/deletion). */
  readonly updateViewsTable: () => void;

  /**
   * Place a furniture GLTF model at the given world-space position.
   *
   * @param modelPath   — URL or path to the GLTF file.
   * @param position    — World-space position. Typed `unknown`; narrowed to
   *   `THREE.Vector3` once @thatopen/components added as dep.
   */
  readonly addFurniture: (modelPath: string, position?: unknown) => void;

  /**
   * Load the HDRI environment texture for image-based lighting.
   * Returns `null` when no HDRI is configured.
   * Typed `unknown`; narrowed to `THREE.Texture | null` once @thatopen/components added.
   */
  readonly getHdriTexture: () => Promise<unknown>;

  /** Deselect all objects and clear inspector + transform controls. */
  readonly unselectAll: () => void;

  /**
   * Toggle manual-render-mode (called by the render-quality service when
   * switching between interactive and full-quality rendering).
   */
  readonly updateIfManualMode: () => void;
}

/**
 * Type signature for the `initUI` async initialiser function.
 *
 * ```ts
 * import type { InitUIFn } from '@pryzm/editor-ui';
 *
 * const initUI: InitUIFn = async (params) => { ... };
 * ```
 */
export type InitUIFn = (params: IInitUIParams) => Promise<void>;
