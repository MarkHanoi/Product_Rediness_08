/**
 * @file FPTypes.ts
 * Shared state interface and factory for the FloorPlanImportPanel wizard.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4 — god-file split).
 *
 * All wizard step modules import FPState from here so the shell can avoid
 * circular imports (shell → step files → shell for the type).
 */

import type { PDFConversionResult } from '@pryzm/file-format';
import type { DetectedLineSegment } from '@pryzm/ai-host';
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
    /**
     * §VEC-WIRE / §PDF-BIM-TIER-LADDER / §CONTEXT-DATA-HONESTY — WHICH rung of
     * the recognition ladder produced `rawAnalysis`:
     *   'vector' — deterministic vector extraction (@pryzm/ai-worker
     *              pdf-to-bim stage1/stage2). Exact; no AI, no tokens.
     *   'raster' — deterministic classical CV over the rendered page
     *              (@pryzm/ai-worker raster-cv). Approximate; no AI, no tokens.
     *   'ai'     — Claude vision stages A/B1/B2. Requires a configured relay.
     * null until an analysis has run. Surfaced in Step 4, the detection preview
     * stats, and the Step 5/6 summaries — every step NAMES the tier that ran.
     */
    recognitionPath: 'vector' | 'raster' | 'ai' | null;
    /**
     * Deterministic-tier result counts for honest reporting ("raster analysis:
     * 28 walls, 6 doors"), null when neither deterministic tier produced a
     * result (counts of the REJECTED attempts are folded into the status line
     * and `tierNote` instead).
     */
    vectorStats: { walls: number; doors: number; windows: number } | null;
    /**
     * The human-readable trail of what each rung of the ladder did on this
     * run — including the rungs that were tried and REJECTED, and why. Shown
     * in the detection preview and carried into Step 5/6 so "few elements" is
     * never mistaken for "simple plan".
     */
    tierNote: string;
    /**
     * §PDF-BIM-HONEST-TIER (2026-08-11) — the tier PLAN computed on entering
     * Step 4: what the chosen deterministic tier CAN and CANNOT produce.
     *
     * This is a CAPABILITY DESCRIPTION and must never be reported as a failure
     * reason. It used to share `tierNote` with the "what actually ran" trail,
     * so a run that fell through for an unrelated reason showed the user
     * "…does not produce furniture or plumbing" as though that were WHY the
     * import failed. Two different facts, one field — split here permanently.
     */
    tierPlanNote: string;
    /**
     * §PDF-BIM-HONEST-TIER — did the AI enrichment stage (furniture/plumbing)
     * RUN on this analysis, and with what outcome?
     *
     *   'not-requested' — the boxes were unticked (by the user, or by the
     *                     §PDF-BIM-TIER-LADDER guard when no relay exists).
     *   'ran'           — the relay was called and returned. It may have
     *                     returned NOTHING; that is a finding, not a failure.
     *   'failed'        — the relay call threw. No enrichment was produced and
     *                     we do not know what it would have found.
     *
     * "It ran and found nothing" and "it never ran" are different facts. Before
     * this field the debug table reported both as "needs the AI stage".
     */
    aiEnrichmentOutcome: 'not-requested' | 'ran' | 'failed';
    /**
     * §PDF-BIM-HONEST-TIER — the REAL Phase-F1 pre-processing measurements,
     * or null when F1 did not run (both deterministic tiers skip it).
     *
     * The downloadable diagnostic used to hard-code `segmentsDetected: 0,
     * guidedModeActivated: false` on EVERY run, including AI runs that had
     * genuinely measured hundreds of segments in guided mode. A diagnostic that
     * reports zeros it did not measure is worse than no diagnostic.
     */
    preprocessing: {
        segmentsDetected: number;
        guidedModeActivated: boolean;
        segments: DetectedLineSegment[];
    } | null;
    /**
     * Whether the server reports a configured AI upstream. Probed once per
     * session on entering Step 4. 'unknown' means the probe itself failed —
     * NOT the same statement as 'unavailable'.
     */
    aiAvailability: 'available' | 'unavailable' | 'unknown' | null;
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
        recognitionPath: null,
        vectorStats: null,
        tierNote: '',
        tierPlanNote: '',
        aiEnrichmentOutcome: 'not-requested',
        preprocessing: null,
        aiAvailability: null,
    };
}
