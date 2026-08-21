/**
 * SetViewportCropCommand — §SHEET-VIEWPORT-CROP (L-1840)
 *
 * Sets or clears the per-PLACEMENT crop on a SheetViewport.
 *
 * ─── WHY A CROP IS A COMMAND, NOT A UI GESTURE ────────────────────────────────
 * Cropping changes what a construction drawing SHOWS. It is a documentation
 * decision with the same standing as the scale printed in the viewport footer,
 * so it is undoable, serialisable and dispatched exactly like `MoveViewport` and
 * `UpdateViewportScale` (P6 — commands are the only mutation path).
 *
 * ─── UNITS, STATED ONCE AND IN THE FIELD NAMES ────────────────────────────────
 * `crop` is DRAWING-SPACE METRES (world X / world Z) — the frame
 * `TechnicalDrawingBounds.compute()` reports and `ViewportSvgComposer` frames in.
 * The sibling `ViewportDto.clippingBox` in `packages/schemas` is a DIFFERENT
 * field that documents itself as "mm, viewport-local" while its only consumer
 * reads it as world space; that contradiction is recorded in the ISSUE-LOG and
 * is deliberately NOT inherited here.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation
 *   §01 §2.7   — No builders; no Three.js
 *   §03 §1.1   — Additive; schema stable
 *   §04 §2.1   — Class A
 *   §07        — No server routes
 *
 * Undo: restores the previous crop, INCLUDING its absence. "Was not cropped" and
 * "was cropped to the full extent" are different states and undo must not
 * collapse them — a viewport with no crop reframes itself as the drawing grows,
 * one cropped to today's extents does not.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';
import type { SheetViewport } from '@pryzm/core-app-model';

export type ViewportCrop = NonNullable<SheetViewport['crop']>;

export class SetViewportCropCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEWPORT_CROP;
    timestamp = Date.now();
    targetIds: string[];

    /** `undefined` = not yet captured; `null` = there was no crop before. */
    private previousCrop: ViewportCrop | null | undefined = undefined;

    constructor(
        private sheetId:    string,
        private viewportId: string,
        /** The new crop, or `null` to clear it and restore content-bounds framing. */
        private newCrop:    ViewportCrop | null,
    ) {
        this.targetIds = [sheetId, viewportId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const sheet = sheetStore.get(this.sheetId);
        if (!sheet) {
            return { ok: false, reason: `Sheet '${this.sheetId}' does not exist.` };
        }
        const vp = sheet.viewports.find(v => v.id === this.viewportId);
        if (!vp) {
            return { ok: false, reason: `Viewport '${this.viewportId}' not found on sheet '${this.sheetId}'.` };
        }
        if (this.newCrop !== null) {
            const c = this.newCrop;
            const finite = [c.minX, c.minZ, c.maxX, c.maxZ].every(n => Number.isFinite(n));
            if (!finite) {
                return { ok: false, reason: 'Crop bounds must all be finite numbers (metres in drawing space).' };
            }
            // Refused rather than silently normalised. An inverted or zero-area
            // rectangle is what a drag produces on its first frame; accepting it
            // would persist a crop that composes to a zero-width viewBox, and
            // "the drawing vanished" is a worse outcome than a refused gesture.
            if (c.maxX <= c.minX || c.maxZ <= c.minZ) {
                return {
                    ok: false,
                    reason: `Crop must have positive extent in both axes (got X ${c.minX}→${c.maxX}, Z ${c.minZ}→${c.maxZ}).`,
                };
            }
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const sheet = sheetStore.get(this.sheetId);
        const vp = sheet?.viewports.find(v => v.id === this.viewportId);
        // Capture ABSENCE as null, distinctly from "not captured yet".
        this.previousCrop = vp?.crop ? { ...vp.crop } : null;

        const ok = sheetStore.updateViewportCrop(this.sheetId, this.viewportId, this.newCrop);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const restore = this.previousCrop ?? null;
        const ok = sheetStore.updateViewportCrop(this.sheetId, this.viewportId, restore);
        return { success: ok, affectedElementIds: [this.sheetId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   {
                sheetId:      this.sheetId,
                viewportId:   this.viewportId,
                newCrop:      this.newCrop,
                previousCrop: this.previousCrop,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
