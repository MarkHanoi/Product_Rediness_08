/**
 * ExportSheetCommand — Phase SC-6 (Next-Gen Sheet Composition Engine)
 *
 * Records an export operation in the command history and delegates to
 * SheetExportService. The command itself does not perform I/O — it signals
 * intent and records it for the history log.
 *
 * This is a non-undoable Class B command (§04 §2.2) — export is a read-only
 * side effect (file download) that cannot be meaningfully reversed. The command
 * still goes through CommandManager for logging and AI context.
 *
 * Contract compliance:
 *   §01 §2   — Command-routed, even for read-only exports
 *   §04 §2.2 — Class B command (non-undoable, produces external artifact)
 *   §07      — No server routes; export runs in-browser
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { sheetStore } from '@pryzm/core-app-model';

export type ExportFormat = 'print' | 'png' | 'svg' | 'dxf' | 'pdf';

export interface ExportSheetParams {
    sheetId: string;
    format:  ExportFormat;
    dpi?:    number;
}

export class ExportSheetCommand implements Command {
    readonly affectedStores = ["sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.EXPORT_SHEET;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: ExportSheetParams) {
        this.targetIds = [params.sheetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!sheetStore.has(this.params.sheetId)) {
            return { ok: false, reason: `Sheet '${this.params.sheetId}' does not exist.` };
        }
        const validFormats: ExportFormat[] = ['print', 'png', 'svg', 'dxf', 'pdf'];
        if (!validFormats.includes(this.params.format)) {
            return { ok: false, reason: `Unsupported export format: '${this.params.format}'.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        // DOC-3.2: DXF export routed to DxfExportService
        if (this.params.format === 'dxf') {
            const dxfService = window.dxfExportService;
            if (!dxfService) {
                console.error('[ExportSheetCommand] dxfExportService not found on window');
                return { success: false, affectedElementIds: [] };
            }
            const ok = dxfService.exportSheet(this.params.sheetId);
            console.log(`[ExportSheetCommand] DXF export ${ok ? 'initiated' : 'failed'} for sheet ${this.params.sheetId}`);
            return { success: ok, affectedElementIds: ok ? [this.params.sheetId] : [] };
        }

        // DOC-3.4: PDF export routed to PdfExportService (async — fire-and-forget)
        if (this.params.format === 'pdf') {
            const pdfService = window.pdfExportService;
            if (!pdfService) {
                console.error('[ExportSheetCommand] pdfExportService not found on window');
                return { success: false, affectedElementIds: [] };
            }
            pdfService.exportSheet(this.params.sheetId).then((ok: boolean) => {
                console.log(`[ExportSheetCommand] PDF export ${ok ? 'complete' : 'failed'} for sheet ${this.params.sheetId}`);
            }).catch((err: unknown) => {
                console.error('[ExportSheetCommand] PDF export threw:', err);
            });
            console.log(`[ExportSheetCommand] PDF export initiated for sheet ${this.params.sheetId}`);
            return { success: true, affectedElementIds: [this.params.sheetId] };
        }

        const exportService = window.sheetExportService;
        if (!exportService) {
            console.error('[ExportSheetCommand] sheetExportService not found on window');
            return { success: false, affectedElementIds: [] };
        }

        switch (this.params.format) {
            case 'print':
                exportService.exportToPrint(this.params.sheetId);
                break;
            case 'png':
                exportService.exportToPng(this.params.sheetId, this.params.dpi ?? 150);
                break;
            case 'svg':
                exportService.exportToSvg(this.params.sheetId);
                break;
        }

        console.log(`[ExportSheetCommand] Export '${this.params.format}' initiated for sheet ${this.params.sheetId}`);
        return { success: true, affectedElementIds: [this.params.sheetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        // Non-undoable — export is a completed side-effect
        console.warn('[ExportSheetCommand] Export cannot be undone (file already downloaded/printed).');
        return { success: false, affectedElementIds: [] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}
