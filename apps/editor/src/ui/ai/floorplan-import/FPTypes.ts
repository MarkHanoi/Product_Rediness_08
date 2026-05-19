/**
 * @file FPTypes.ts
 * Shared state interface and factory for the FloorPlanImportPanel wizard.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4 — god-file split).
 *
 * All wizard step modules import FPState from here so the shell can avoid
 * circular imports (shell → step files → shell for the type).
 */

import type { PDFConversionResult } from '@pryzm/file-format';
import type { FloorPlanUnderlayTool } from '@pryzm/input-host';
import type { CommandProposal } from '@pryzm/command-registry';
import type { PipelineDiagnosticReport } from '@pryzm/ai-host';
import type { FloorPlanAnalysis } from '@pryzm/ai-host';

export interface RulerPoint {
    /** Display (CSS) pixel coordinates — the canvas is drawn at display resolution */
    x: number;
    y: number;
}

export interface FPState {
    step: 1 | 2 | 3 | 4 | 5 | 6;
    pdfConversion: PDFConversionResult | null;
    pxPerMeter: number;
    underlayTool: FloorPlanUnderlayTool | null;
    underlayConfirmed: boolean;
    includeWalls: boolean;
    includeSlab: boolean;
    includeFurniture: boolean;
    includePlumbing: boolean;
    includeOpenings: boolean;
    wallHeight: number;
    isAnalysing: boolean;
    proposals: CommandProposal[];
    summaryText: string;
    error: string;
    /** Two-point ruler points in display (CSS) pixel space */
    rulerPoints: RulerPoint[];
    /** How the current pxPerMeter was established */
    calibrationMethod: 'ruler' | 'scale_bar' | 'manual' | null;
    /** Scale ratio detected from PDF text (e.g. 100 for "1:100"), if any */
    detectedScaleRatio: number | null;
    /**
     * Diagnostic report built after each analysis run.
     * null until the first successful analysis. Cleared on Start Over.
     */
    diagnosticReport: PipelineDiagnosticReport | null;
    /**
     * Raw AI analysis returned by FloorPlanAIFactory.analyse().
     * Stored after stage B/C, before post-processing.
     * Used by the Detection Preview step. Cleared on Start Over.
     */
    rawAnalysis: FloorPlanAnalysis | null;
}

/** Create a fresh FPState — the singleton lives inside createFloorPlanImportPanel(). */
export function makeFPState(): FPState {
    return {
        step: 1,
        pdfConversion: null,
        pxPerMeter: 0,
        underlayTool: null,
        underlayConfirmed: false,
        includeWalls: true,
        includeSlab: true,
        includeFurniture: true,
        includePlumbing: true,
        includeOpenings: true,
        wallHeight: 3.0,
        isAnalysing: false,
        proposals: [],
        summaryText: '',
        error: '',
        rulerPoints: [],
        calibrationMethod: null,
        detectedScaleRatio: null,
        diagnosticReport: null,
        rawAnalysis: null,
    };
}
