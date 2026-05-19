/**
 * IBimService — public interface for the PRYZM BIM service.
 *
 * Sprint F-2.1 surface audit: extracted from BimService.ts public API.
 * Implementation: apps/editor/src/engine/BimService.ts (until Sprint F-2.2).
 * Reference: docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2.
 *
 * ## Design rules
 * - Methods that interact with the user via browser dialogs are `async` even when
 *   the underlying work is synchronous, to allow future replacement with modal UI.
 * - `exportIfc()` is intentionally synchronous at the interface level because the
 *   concrete implementation builds an IFC blob and triggers a download synchronously.
 *
 * ## Consumer pattern
 * ```ts
 * import type { IBimService } from '@pryzm/engine';
 *
 * function exportButton(bim: IBimService) {
 *     bim.exportIfc({ exportScope: 'native-only' });
 * }
 * ```
 */
export interface IBimService {
    /**
     * Prompt the user for an elevation value and add a new building level at
     * that elevation. No-op if the user cancels the dialog.
     */
    addLevel(): Promise<void>;

    /**
     * Prompt the user for a grid-line position and add a new grid on the
     * given axis. No-op if the user cancels the dialog.
     *
     * @param axis — 'X' for a vertical grid line, 'Y' for a horizontal grid line.
     */
    addGrid(axis: 'X' | 'Y'): Promise<void>;

    /**
     * Activate the wall drawing tool in the specified drawing mode.
     *
     * @param mode — Drawing mode string (e.g. 'straight', 'arc').
     *   Typed as `string` here to avoid a hard dep on the WallDrawingMode union;
     *   implementations validate the value internally.
     */
    activateWallTool(mode: string): void;

    /**
     * Switch the active wall tool's drawing mode without deactivating the tool.
     *
     * @param mode — Target drawing mode.
     */
    switchWallDrawingMode(mode: string): void;

    /**
     * Export the currently loaded project to IFC format and trigger a browser
     * file download.
     *
     * @param options.exportScope
     *   'native-only'           — include only PRYZM-authored elements (default).
     *   'native-and-imported'   — include both PRYZM-authored and IFC-imported elements.
     */
    exportIfc(options?: { exportScope?: 'native-only' | 'native-and-imported' }): void;
}
