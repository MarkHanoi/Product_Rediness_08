/**
 * @file FloorPlanDiagnostics.ts
 * @description PDF-to-BIM pipeline diagnostic reporter.
 *
 * Collects per-stage data throughout the PDF import pipeline and serialises
 * the result as a downloadable JSON file for offline inspection of wall
 * placement, topology, opening assignments, and post-processing decisions.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer / 01-BIM-ENGINE-CORE-CONTRACT §1.1):
 *  - Pure utility: NO store access, NO command execution, NO scene interaction.
 *  - No side effects beyond the browser download trigger in downloadDiagnosticJSON().
 *  - All exported interfaces are plain data — no class instances, no references
 *    to THREE.js objects or DOM elements.
 *  - This module is intentionally isolated from every other pipeline module;
 *    it is imported only by FloorPlanImportPanel (orchestrator) and
 *    FloorPlanCommandBatcher (data contributor).
 */

// ── Wall-level diagnostic record ───────────────────────────────────────────────

/**
 * Per-wall processing record.
 * Captures the full lifecycle of a single Claude-detected wall: raw AI output →
 * world-space conversion → junction resolution → filtering → acceptance/rejection.
 */
export interface WallDiagnosticRecord {
    /** Sequential index in the original analysis.walls array (0-based). */
    index: number;

    /**
     * Claude's own wall ID string (e.g. "w1", "w12").
     * Sub-segments from crossing splits carry suffixed IDs (e.g. "w4_s0").
     */
    aiId: string;

    /** Wall classification from Claude B1. */
    aiWallType: 'exterior' | 'interior' | 'unknown';

    /** Confidence level from Claude B1. */
    aiConfidence: 'high' | 'medium' | 'low';

    /** Raw pixel coordinates as returned by Claude, before any conversion. */
    rawPixel: {
        startPx: { x: number; y: number };
        endPx: { x: number; y: number };
        /** Claude's estimated wall thickness in image pixels. */
        thicknessPx: number;
    };

    /**
     * World-space coordinates after pixelToWorld(), grid-snap, and junction resolution.
     * null when pixelToWorld() returned null for either endpoint (underlay not set up).
     */
    worldCoords: {
        start: { x: number; z: number };
        end: { x: number; z: number };
        /** Euclidean length of the wall in metres. */
        lengthM: number;
        /** Final thickness in metres after type-aware clamping. */
        thicknessM: number;
        /** Raw (pre-clamp) thickness derived from pixel ratio. */
        thicknessRawM: number;
    } | null;

    /**
     * Flags set by post-processing steps.
     * A wall can be both marked as a split sub-segment AND accepted.
     */
    postProcessing: {
        /** True when this entry is a sub-segment created by splitWallsAtCrossings(). */
        isCrossingSplit: boolean;
        /** AI wall ID of the parent wall this was split from (e.g. "w4"). */
        splitFromAiId?: string;
    };

    /**
     * The reason the wall was excluded from the final proposals.
     * Absent when status === 'accepted'.
     *
     * 'too_short'           — wall length < 15 cm (rasterization artefact)
     * 'duplicate'           — endpoints match an already-accepted wall
     * 'pixel_map_failed'    — pixelToWorld() returned null
     * 'isolated_annotation' — wall has no endpoint connection to any other wall,
     *                         is short, and is not high-confidence exterior —
     *                         almost certainly a room label or dimension line
     * 'low_wall_score'      — WallCandidateScorer total score < 5 across six signals
     *                         (thickness, room boundary, topology, length, orientation,
     *                         pixel density) — phantom wall rejected by multi-signal scoring
     */
    skipReason?: 'too_short' | 'duplicate' | 'pixel_map_failed' | 'isolated_annotation' | 'low_wall_score';

    /** Final decision after all filters. */
    status: 'accepted' | 'skipped';

    /**
     * Stable BIM UUID assigned to the accepted wall.
     * Absent when status === 'skipped'.
     */
    wallUUID?: string;

    /**
     * Confidence after the "connects known corners" boost applied by the batcher.
     * Absent when status === 'skipped'.
     */
    finalConfidence?: 'high' | 'medium' | 'low';

    /**
     * WallCandidateScorer result for this wall.
     * Present on all walls that passed the 'too_short', 'duplicate', and
     * 'pixel_map_failed' pre-filters (i.e., walls actually evaluated by the scorer).
     * Absent when status === 'skipped' due to a pre-filter reason above.
     */
    wallScore?: {
        totalScore: number;
        breakdown: {
            thickness: number;
            roomBoundary: number;
            topologicalConnection: number;
            length: number;
            orientation: number;
            pixelDensity: number;
        };
        decision: 'accept' | 'review' | 'reject';
    };
}

// ── Opening-level diagnostic record ───────────────────────────────────────────

/** Per-opening assignment record. */
export interface OpeningDiagnosticRecord {
    /** Claude's opening ID (e.g. "o1"). */
    aiId: string;

    type: 'door' | 'window';

    /** Wall ID Claude nominated as the host in Stage B2. */
    aiHostWallId: string;

    /** Opening centre in image pixel space. */
    centrePx: { x: number; y: number };

    /** Opening centre in world space (XZ). null when pixelToWorld failed. */
    centreWorld: { x: number; z: number } | null;

    /** Width in metres as computed from pixel measurement. */
    widthM: number;

    assignment: {
        /**
         * Which mechanism resolved the host wall:
         * - 'spatial_graph': deterministic WallGraph proximity (Phase E primary).
         * - 'ai_hostwall_fallback': Phase C B2 AI hostWallId used as fallback.
         * - 'no_host_found': opening skipped — no wall within distance threshold.
         * - 'geometric_recovery': door synthesised from WallTerminatorDoorDetector
         *   gap — B2 did not report this opening (wall missing or skipped), recovered
         *   post-hoc using geometric gap analysis.
         */
        method: 'spatial_graph' | 'ai_hostwall_fallback' | 'no_host_found' | 'geometric_recovery';
        /** BIM UUID of the resolved host wall. null when no host found. */
        assignedWallUUID: string | null;
    };

    status: 'accepted' | 'skipped_no_host';
}

// ── Topology diagnostic ────────────────────────────────────────────────────────

/** Summary of the Phase E topology computation. */
export interface TopologyDiagnostic {
    /** Number of unique nodes in the WallGraph (resolved endpoints). */
    wallGraphNodes: number;
    /** Number of edges in the WallGraph (accepted wall segments). */
    wallGraphEdges: number;
    /** Rooms detected from closed interior faces. */
    roomsDetected: number;
    rooms: Array<{
        id: string;
        areaM2: number;
        centroid: { x: number; z: number };
        boundaryWallCount: number;
    }>;
    /** Source of the slab polygon sent to CreateSlabCommand. */
    slabSource: 'topology_outer_face' | 'ai_detected' | 'none';
    /** Vertex count of the outer face polygon, or null if not computed. */
    outerFaceVertices: number | null;
    /** Outer face polygon vertices (world XZ) for spatial verification. */
    outerFacePolygon: Array<{ x: number; z: number }> | null;
}

// ── Post-processing aggregate statistics ──────────────────────────────────────

/** Aggregate counts for all post-processing decisions during one import. */
export interface PostProcessingStats {
    tJunctionSnaps: number;
    cornerMerges: number;
    crossingSplits: number;
    tooShortSkipped: number;
    duplicateSkipped: number;
    pixelMapFailed: number;
    /**
     * Walls skipped by the old isolated-annotation binary filter.
     * Kept for backward-compatibility. Now always 0 — Phase G replaced by scorer.
     * @deprecated Use wallScorerRejected instead.
     */
    isolatedAnnotationSkipped: number;
    wallsAccepted: number;
    /**
     * Walls rejected by WallCandidateScorer (total score < 5 across six signals).
     * These are phantom walls detected by the multi-signal scoring system.
     */
    wallScorerRejected: number;
    /**
     * Walls flagged for review by WallCandidateScorer (score 5–7).
     * Kept in output with a review marker — total does NOT decrease wallsAccepted.
     */
    wallScorerReview: number;
}

// ── Full pipeline diagnostic report ──────────────────────────────────────────

/**
 * Complete diagnostic report for one PDF import session.
 * Serialised as JSON and offered as a browser download.
 */
export interface PipelineDiagnosticReport {
    /** Report schema version for forward-compatibility. */
    schemaVersion: '1.0';

    metadata: {
        /** ISO 8601 timestamp of when the analysis was triggered. */
        timestamp: string;
        /** Image dimensions fed to Claude. */
        imageDimensions: { widthPx: number; heightPx: number };
        /**
         * Scale factor in pixels-per-metre at the time of analysis.
         * All pixel-to-world conversions use this value.
         */
        pxPerMeter: number;
        /** How the pxPerMeter was established. */
        calibrationMethod: 'ruler' | 'scale_bar' | 'manual' | null;
        /** Derived plan size in metres (widthPx / pxPerMeter, heightPx / pxPerMeter). */
        planSizeM: { width: number; height: number };
    };

    /** Phase F1 image preprocessing results. */
    preprocessing: {
        segmentsDetected: number;
        guidedModeActivated: boolean;
        /** Line segments found by the adaptive-threshold band scanner. */
        segments: Array<{
            id: string;
            startPx: { x: number; y: number };
            endPx: { x: number; y: number };
            lengthPx: number;
            orientation: 'horizontal' | 'vertical';
            thicknessPx: number;
        }>;
    };

    /** Raw counts returned by the Claude AI stages before any post-processing. */
    aiRawCounts: {
        b1WallsDetected: number;
        b2OpeningsDetected: number;
        slabDetected: boolean;
        slabConfidence: 'high' | 'medium' | 'low' | null;
        furnitureDetected: number;
    };

    /** Per-wall processing records — one entry per wall after crossing splits. */
    walls: WallDiagnosticRecord[];

    /** Aggregate post-processing statistics. */
    postProcessing: PostProcessingStats;

    /** Phase E topology result. */
    topology: TopologyDiagnostic;

    /** Per-opening assignment records. */
    openings: OpeningDiagnosticRecord[];

    /** Final proposal counts submitted for user review. */
    proposalSummary: {
        walls: number;
        slab: number;
        openings: number;
        furniture: number;
        plumbing: number;
        total: number;
        skipped: number;
    };
}

// ── Wall-focused export ───────────────────────────────────────────────────────

/**
 * A clean, wall-only focused export intended for offline debugging.
 *
 * Unlike the full PipelineDiagnosticReport (which also covers slab, openings,
 * topology, furniture, etc.), this export presents every wall in a single flat
 * list sorted by status (accepted first) with all pipeline stages clearly labelled
 * so the user can pinpoint phantom walls and missing walls at a glance.
 */
export interface WallExportJSON {
    schemaVersion: '2.0';
    exportType: 'walls_focused';
    generatedAt: string;

    summary: {
        totalAIDetected: number;
        accepted: number;
        skipped: number;
        skippedTooShort: number;
        skippedDuplicate: number;
        skippedPixelMapFailed: number;
        /** @deprecated Always 0 — Phase G replaced by multi-signal scorer. */
        skippedIsolatedAnnotation: number;
        /** Walls rejected by WallCandidateScorer (total score < 5). */
        skippedLowWallScore: number;
        /** Walls kept but flagged for review (score 5–7). */
        reviewFlagged: number;
        crossingSplitsApplied: number;
        tJunctionSnaps: number;
        cornerMerges: number;
    };

    calibration: {
        pxPerMeter: number;
        imageDimensions: { widthPx: number; heightPx: number };
        planSizeM: { width: number; height: number };
        calibrationMethod: 'ruler' | 'scale_bar' | 'manual' | null;
    };

    /**
     * One entry per wall after crossing splits.
     * Accepted walls appear first, then skipped walls.
     * Each entry traces the full journey: AI raw → world coords → skip/accept decision.
     */
    walls: Array<{
        /** Sequential index in the original AI wall array (0-based). */
        index: number;

        /** Claude's own ID for this wall (e.g. "w1"). Sub-segments carry "w1_s0" etc. */
        aiId: string;

        /** Final decision after all filters. */
        status: 'accepted' | 'skipped';

        /**
         * Why this wall was excluded.
         * 'too_short'           — wall length < 15 cm after world conversion (rasterization artefact)
         * 'duplicate'           — both endpoints within 25 cm of an already-accepted wall
         * 'pixel_map_failed'    — pixelToWorld() returned null (underlay not properly calibrated)
         * 'isolated_annotation' — @deprecated (Phase G removed, now always 'low_wall_score')
         * 'low_wall_score'      — WallCandidateScorer total score < 5 (multi-signal phantom rejection)
         * Absent when status === 'accepted'.
         */
        skipReason?: 'too_short' | 'duplicate' | 'pixel_map_failed' | 'isolated_annotation' | 'low_wall_score';

        /** Wall classification from Claude. */
        type: 'exterior' | 'interior' | 'unknown';

        /** Confidence as returned by Claude before any boost. */
        aiConfidence: 'high' | 'medium' | 'low';

        /**
         * Confidence after the "connects known corners" boost.
         * Only present when status === 'accepted'.
         */
        finalConfidence?: 'high' | 'medium' | 'low';

        /** True when this entry is a sub-segment created because two walls crossed. */
        isCrossingSplit: boolean;

        /** AI ID of the parent wall this was split from, e.g. "w4". */
        splitFromParentAiId?: string;

        /**
         * Raw pixel coordinates exactly as Claude returned them.
         * These are in the image coordinate system (origin = top-left).
         */
        rawPixels: {
            startPx: { x: number; y: number };
            endPx: { x: number; y: number };
            /** Claude's estimated wall thickness in image pixels. */
            thicknessPx: number;
        };

        /**
         * World-space coordinates after pixelToWorld(), 5 cm grid snap, and junction
         * resolution. null when pixelToWorld() failed (see skipReason: 'pixel_map_failed').
         */
        worldCoords: {
            start: { x: number; z: number };
            end: { x: number; z: number };
            /** Euclidean wall length in metres. */
            lengthM: number;
            /** Final clamped thickness in metres (type-aware: ext 20–40 cm, int 10–25 cm). */
            thicknessM: number;
            /** Raw thickness derived from pixel ratio before clamping. */
            thicknessRawM: number;
        } | null;

        /**
         * Stable BIM UUID of the accepted wall inside the WallStore.
         * Use this to cross-reference with opening assignments.
         * Absent when status === 'skipped'.
         */
        wallUUID?: string;
    }>;
}

/**
 * Build a wall-focused export JSON from a completed pipeline diagnostic report.
 * Sorts entries: accepted walls first (by index), then skipped walls (by index).
 */
export function buildWallExportJSON(report: PipelineDiagnosticReport): WallExportJSON {
    const pp = report.postProcessing;

    const accepted = report.walls.filter(w => w.status === 'accepted');
    const skipped  = report.walls.filter(w => w.status === 'skipped');

    const mapWall = (w: WallDiagnosticRecord): WallExportJSON['walls'][number] => ({
        index:    w.index,
        aiId:     w.aiId,
        status:   w.status,
        ...(w.skipReason ? { skipReason: w.skipReason } : {}),
        type:             w.aiWallType,
        aiConfidence:     w.aiConfidence,
        ...(w.finalConfidence ? { finalConfidence: w.finalConfidence } : {}),
        isCrossingSplit:  w.postProcessing.isCrossingSplit,
        ...(w.postProcessing.splitFromAiId ? { splitFromParentAiId: w.postProcessing.splitFromAiId } : {}),
        rawPixels: {
            startPx:      w.rawPixel.startPx,
            endPx:        w.rawPixel.endPx,
            thicknessPx:  w.rawPixel.thicknessPx,
        },
        worldCoords: w.worldCoords
            ? {
                start:         w.worldCoords.start,
                end:           w.worldCoords.end,
                lengthM:       w.worldCoords.lengthM,
                thicknessM:    w.worldCoords.thicknessM,
                thicknessRawM: w.worldCoords.thicknessRawM,
            }
            : null,
        ...(w.wallUUID ? { wallUUID: w.wallUUID } : {}),
    });

    return {
        schemaVersion: '2.0',
        exportType:    'walls_focused',
        generatedAt:   new Date().toISOString(),
        summary: {
            totalAIDetected:            report.walls.length,
            accepted:                   accepted.length,
            skipped:                    skipped.length,
            skippedTooShort:            pp.tooShortSkipped,
            skippedDuplicate:           pp.duplicateSkipped,
            skippedPixelMapFailed:      pp.pixelMapFailed,
            skippedIsolatedAnnotation:  pp.isolatedAnnotationSkipped,
            skippedLowWallScore:        pp.wallScorerRejected,
            reviewFlagged:              pp.wallScorerReview,
            crossingSplitsApplied:      pp.crossingSplits,
            tJunctionSnaps:             pp.tJunctionSnaps,
            cornerMerges:               pp.cornerMerges,
        },
        calibration: {
            pxPerMeter:        report.metadata.pxPerMeter,
            imageDimensions:   report.metadata.imageDimensions,
            planSizeM:         report.metadata.planSizeM,
            calibrationMethod: report.metadata.calibrationMethod,
        },
        walls: [...accepted, ...skipped].map(mapWall),
    };
}

/**
 * Trigger a browser file-download of the wall-focused JSON.
 */
export function downloadWallJSON(
    report: PipelineDiagnosticReport,
    filename = 'pryzm-walls.json',
): void {
    _triggerDownload(JSON.stringify(buildWallExportJSON(report), null, 2), filename);
}

// ── Download utility ──────────────────────────────────────────────────────────

/**
 * Trigger a browser file-download of the full pipeline diagnostic report.
 *
 * Uses a temporary anchor element + Blob URL — no server call, no store access.
 * The Blob URL is immediately revoked after the click to avoid memory leaks.
 *
 * @param report  - The completed PipelineDiagnosticReport.
 * @param filename - Desired download filename (default: 'pryzm-pipeline-report.json').
 */
export function downloadDiagnosticJSON(
    report: PipelineDiagnosticReport,
    filename = 'pryzm-pipeline-report.json',
): void {
    _triggerDownload(JSON.stringify(report, null, 2), filename);
}

function _triggerDownload(json: string, filename: string): void {
    try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        console.log(`[FloorPlanDiagnostics] Downloaded: ${filename} (${json.length} chars)`);
    } catch (err) {
        console.error('[FloorPlanDiagnostics] Download failed:', err);
    }
}

/**
 * Build the metadata block for the report from panel state values.
 * Called by FloorPlanImportPanel before assembling the full report.
 */
export function buildReportMetadata(
    widthPx: number,
    heightPx: number,
    pxPerMeter: number,
    calibrationMethod: 'ruler' | 'scale_bar' | 'manual' | null,
): PipelineDiagnosticReport['metadata'] {
    return {
        timestamp: new Date().toISOString(),
        imageDimensions: { widthPx, heightPx },
        pxPerMeter,
        calibrationMethod,
        planSizeM: {
            width: pxPerMeter > 0 ? parseFloat((widthPx / pxPerMeter).toFixed(3)) : 0,
            height: pxPerMeter > 0 ? parseFloat((heightPx / pxPerMeter).toFixed(3)) : 0,
        },
    };
}
