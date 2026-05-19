/**
 * IEngineContext — Minimal cross-cutting engine state contract.
 *
 * Sprint F-2.2 (2026-05-15). Updated Sprint F-2.4 (2026-05-15).
 * Concrete implementation: `apps/editor/src/engine/EngineContext.ts`
 *
 * ## Design notes (F-2.2 → F-2.4)
 *
 * Heavy renderer fields (`world`, `components`, `postproductionRenderer`,
 * `pryzmRenderer`) are typed as `unknown` to keep the contracts package
 * dependency-free of `@thatopen/components` and Three.js at this sprint stage.
 * They will be narrowed in Sprint F-2.5 when those packages are added as peer
 * dependencies.
 *
 * **F-2.4 change:** `dataWorkbench` narrowed from `unknown` → `IDataWorkbench`
 * now that `@pryzm/editor-ui` exists as a contracts package.  The concrete
 * class (`apps/editor/src/ui/dataworkbench/DataWorkbench.ts`) structurally
 * satisfies `IDataWorkbench` — verified via `implements IDataWorkbench` check
 * added in Sprint F-2.4.
 *
 * The narrowly-typed fields (`pryzmCanvas`, `isPhase5Active`, `selectionManager`,
 * `container`, `updateInspector`) are fully type-safe already and require no
 * further narrowing.
 *
 * ## Usage
 * ```ts
 * import type { IEngineContext } from '@pryzm/engine';
 *
 * function initMySubsystem(ctx: IEngineContext): void {
 *   const canvas = ctx.container;
 *   ctx.selectionManager.enabled; // fully typed
 *   ctx.dataWorkbench.show();     // fully typed (F-2.4+)
 * }
 * ```
 */

import type { ISelectionManager } from './ISelectionManager.js';
import type { IDataWorkbench } from '@pryzm/editor-ui';

export interface IEngineContext {
  /**
   * The @thatopen/components World (scene + camera + renderer).
   * Typed `unknown` at F-2.2; narrowed to `OBC.World` in Sprint F-2.5.
   */
  readonly world: unknown;

  /**
   * @thatopen/components Components container.
   * Typed `unknown` at F-2.2; narrowed to `OBC.Components` in Sprint F-2.5.
   */
  readonly components: unknown;

  /**
   * PostproductionRenderer from @thatopen/components-front.
   * Typed `unknown` at F-2.2; narrowed to `OBCF.PostproductionRenderer` in Sprint F-2.5.
   */
  readonly postproductionRenderer: unknown;

  /**
   * The PRYZM-owned renderer canvas overlay.
   * `null` when the Phase 5 WebGPU renderer did not activate.
   */
  readonly pryzmCanvas: HTMLCanvasElement | null;

  /**
   * The PRYZM-owned WebGL renderer.
   * Typed `unknown` at F-2.2; narrowed to `THREE.WebGLRenderer` in Sprint F-2.5.
   */
  readonly pryzmRenderer: unknown;

  /** `true` when the Phase 5 WebGPU renderer is active. */
  readonly isPhase5Active: boolean;

  /** SelectionManager instance (available after `initTools` runs). */
  readonly selectionManager: ISelectionManager;

  /**
   * Updates the right-side inspector panel and dispatches
   * `pryzm-element-selected` for DataWorkbench sync.
   * Parameter typed `unknown` at F-2.2; narrowed in Sprint F-2.5.
   */
  readonly updateInspector: (obj: unknown) => void;

  /**
   * DataWorkbench instance (available after `initDataPlatform` runs).
   *
   * **Narrowed F-2.4:** was `unknown`; now typed as `IDataWorkbench`
   * from `@pryzm/editor-ui`.  Consumers can call `show()`, `hide()`,
   * `toggle()`, and `refresh()` without casting.
   */
  readonly dataWorkbench: IDataWorkbench;

  /** The root container element for the 3D viewport. */
  readonly container: HTMLElement;
}
