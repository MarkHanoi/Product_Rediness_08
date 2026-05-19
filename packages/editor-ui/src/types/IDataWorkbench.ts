/**
 * IDataWorkbench — public interface for the PRYZM Data Workbench UI panel.
 *
 * Sprint F-2.4 (2026-05-15).
 * Sprint F-2.5 (2026-05-15): `runtime` narrowed from `unknown` →
 *   `PryzmRuntime | null` now that `@pryzm/runtime-composer` is a declared
 *   dependency of this package.
 * Concrete implementation: `apps/editor/src/ui/dataworkbench/DataWorkbench.ts`
 * Reference: docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ## Purpose
 * This interface narrows the `dataWorkbench: unknown` field in `IEngineContext`
 * (Sprint F-2.2) to a concrete, typed contract.  Consumers (UI panels, headless
 * test harness) can now hold a typed reference without importing the concrete
 * class from `apps/editor/`.
 *
 * ## Design rules
 * - `WorkbenchMode` is a string union mirroring the concrete class's internal
 *   `WorkbenchMode` type.  It is re-exported here so callers do not need to
 *   import from the implementation.
 * - `runtime` is fully typed as `PryzmRuntime | null` from F-2.5 onwards via
 *   the `@pryzm/runtime-composer` workspace dependency.
 *
 * ## Consumer pattern
 * ```ts
 * import type { IDataWorkbench } from '@pryzm/editor-ui';
 *
 * function onWorkbenchToggle(wb: IDataWorkbench) {
 *     if (!wb.isVisible) wb.show();
 * }
 * ```
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer';

/**
 * Display mode of the DataWorkbench panel.
 * - `'hidden'` — panel not visible (default initial state)
 * - `'panel'`  — docked side panel
 * - `'split'`  — split view alongside the 3D viewport
 * - `'full'`   — full-screen data workbench takeover
 *
 * Mirrors the concrete `WorkbenchMode` type in
 * `apps/editor/src/ui/dataworkbench/DataWorkbench.ts`.
 */
export type WorkbenchMode = 'hidden' | 'panel' | 'split' | 'full';

/**
 * Tab identifier for the DataWorkbench navigation.
 * Typed as `string` to avoid enumerating all tab IDs in the contracts package;
 * the concrete class validates the value internally.
 */
export type WorkbenchTabId = string;

/**
 * IDataWorkbench — runtime-accessible Data Workbench panel controller.
 *
 * The panel listens to `pryzm-toggle-workbench` CustomEvents so callers can
 * also open/close it without a direct reference.  The imperative API below
 * is for subsystems that hold an explicit reference (e.g. `initUI`, headless).
 */
export interface IDataWorkbench {
  /**
   * The composed PryzmRuntime this workbench operates within.
   * **Narrowed F-2.5:** `PryzmRuntime | null` (was `unknown` at F-2.4).
   */
  readonly runtime: PryzmRuntime | null;

  /**
   * Toggle between the panel's visible mode and `'hidden'`.
   *
   * @param preferredMode — When toggling from `'hidden'`, open in this mode.
   *   Defaults to `'panel'`.
   */
  toggle(preferredMode?: WorkbenchMode): void;

  /**
   * Show the workbench, optionally switching to a specific tab.
   *
   * @param tab — If supplied, activates this tab after showing.
   */
  show(tab?: WorkbenchTabId): void;

  /**
   * Hide the workbench (equivalent to `toggle('hidden')`).
   */
  hide(): void;

  /**
   * Force-refresh all data views (e.g. after a project-level data change).
   * Safe to call when the panel is hidden — the refresh is deferred until
   * the panel next becomes visible.
   */
  refresh(): void;
}
