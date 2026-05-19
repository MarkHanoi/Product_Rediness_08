/**
 * DrawingPipelineTypes — Contract 23 §14 (Worker Thread Pipeline)
 *
 * Shared type definitions for the DrawingPipeline Web Worker protocol.
 * Imported by both the main thread (DrawingPipelineOrchestrator) and the
 * Web Worker (DrawingPipelineWorker).
 *
 * Contract compliance:
 *   Contract 23 §14 — threading model; stages 1–6 run in the worker thread
 *   Contract 23 §14 — transfer geometry via Transferable (Float32Array / Uint32Array);
 *                      never transfer THREE.js BufferGeometry objects directly
 *
 * IMPORTANT: This file MUST remain free of DOM and Three.js imports so it is
 * safe to import inside the Web Worker bundle.
 *
 * Migration: Wave 10 Task 1 (W10-A). Lifted from src/core/drawing/DrawingPipelineTypes.ts.
 * The original path is now a re-export shim pointing here.
 */

// ─── Output types (worker → main) ────────────────────────────────────────────

/**
 * A single styled line segment in 2D drawing space.
 *
 * Coordinates (h, v) are in OBC TechnicalDrawing "drawing space":
 *   h = horizontal axis (world X for plans, world X or Z for sections)
 *   v = vertical axis   (world Z for plans, world Y for sections)
 *
 * The main thread maps (h, v) to screen pixels via PlanViewCanvas.worldToScreen().
 */
export interface StyledEdge {
    /** Drawing-space horizontal component of start vertex. */
    h0: number;
    /** Drawing-space vertical component of start vertex. */
    v0: number;
    /** Drawing-space horizontal component of end vertex. */
    h1: number;
    /** Drawing-space vertical component of end vertex. */
    v1: number;
    /** CSS colour string (e.g. '#000000'). */
    color: string;
    /** Line width in millimetres. */
    widthMm: number;
    /** Opacity 0–1 (applied via ctx.globalAlpha). */
    opacity: number;
    /** Dash pattern in CSS-pixel units, or null for solid lines. */
    dashPx: number[] | null;
    /** View-range zone classification. */
    zone: 'CUT' | 'PROJECTION' | 'BEYOND';
    /** Element UUID — empty string when not available. */
    elementId: string;
    /** ISO layer tag composite string, e.g. 'A-WALL:cut'. */
    layerTag: string;
}

/**
 * A closed polygon for poche (solid fill) rendering.
 *
 * Vertices are in 2D drawing space (h, v) — same coordinate convention as
 * StyledEdge.  Main thread maps each vertex to screen pixels for Canvas2D fill().
 */
export interface StyledPolygon {
    /**
     * Flat vertex array: [h0, v0, h1, v1, …].
     * Minimum 3 vertices (6 floats); winding order: CCW for outer rings.
     */
    vertices: number[];
    /** CSS hex fill colour (e.g. '#1a1a1a'). */
    fillColor: string;
    /** Fill opacity 0–1. */
    opacity: number;
    /**
     * Hatch pattern key — 'solid' for plain fill, 'hatch', 'cross', or 'dot'
     * for hatched patterns.  Main thread builds the Canvas pattern tile.
     */
    fillPattern: string;
    /** Hatch stroke colour (ignored when fillPattern is 'solid'). */
    strokeColor: string;
    /** Element UUID — empty string when not available. */
    elementId: string;
}

// ─── Input types (main → worker) ─────────────────────────────────────────────

/**
 * Serialized form of one element's projected edge geometry.
 *
 * `positions` is a Transferable Float32Array of alternating (h, v) pairs:
 *   positions[2i]     = h  (horizontal drawing-space coordinate)
 *   positions[2i + 1] = v  (vertical drawing-space coordinate)
 *
 * Each pair of adjacent entries represents one edge:
 *   edge k: positions[4k..4k+3] = [h0, v0, h1, v1]
 *
 * The main thread is responsible for applying matrixWorld and the
 * sectionFlipV transform BEFORE packing into this array, so that the
 * worker receives fully projected 2D coordinates.
 */
export interface PipelineElementBatch {
    /** Element UUID (may be empty string for unlabelled geometry). */
    elementId: string;
    /**
     * ISO layer tag composite string, e.g. 'A-WALL:cut'.
     * The worker uses this to determine zone and category.
     */
    layerTag: string;
    /**
     * Flat (h, v) pair array — TRANSFERABLE.
     * Length must be a multiple of 4 (two vertices per edge × 2 components).
     */
    positions: Float32Array;
}

/**
 * Serialized form of a single GraphicsRule (safe for structured-clone).
 * Mirrors GraphicsRule from GraphicsRulesEngine but without class references.
 */
export interface SerializedRule {
    priority: number;
    zone?: string;
    category?: string;
    viewId?: string;
    elementId?: string;
    style: {
        widthMm?: number;
        color?: string;
        dashPx?: number[] | null;
        opacity?: number;
    };
}

/**
 * Full pipeline request posted from the main thread to the worker.
 *
 * Transfer list: all `batch.positions` Float32Arrays.
 */
export interface PipelineRequest {
    type: 'run';
    /** Unique request identifier — used to correlate request and result messages. */
    requestId: string;
    /** Active view UUID — passed through to enable style matching by viewId. */
    viewId: string;
    /** Serialized element batches (geometry already projected to drawing space). */
    batches: PipelineElementBatch[];
    /**
     * Snapshot of all currently active GraphicsRules — serialised for transfer.
     * The worker reconstructs an in-worker style resolver from these.
     */
    rules: SerializedRule[];
    /**
     * Map from ISO layer prefix (e.g. 'A-WALL') to CSS hex fill colour.
     * Used by Stage 3 (CutIntersector) to assign poche fill colours.
     */
    pocheFills: Record<string, string>;
}

// ─── Result types (worker → main) ────────────────────────────────────────────

/** Successful pipeline result. */
export interface PipelineResult {
    type: 'result';
    /** Echoed requestId from the corresponding PipelineRequest. */
    requestId: string;
    /** All visible styled edges, sorted CUT → PROJECTION → BEYOND. */
    edges: StyledEdge[];
    /** Closed poche polygons for cut elements (render before edges). */
    polygons: StyledPolygon[];
    /** Total worker processing time in milliseconds. */
    durationMs: number;
    /** Per-stage timing breakdown for profiling. */
    stageTimes: {
        geometry:   number;
        classify:   number;
        intersect:  number;
        extract:    number;
        hlr:        number;
        style:      number;
    };
}

/** Error result when the worker pipeline fails. */
export interface PipelineError {
    type: 'error';
    requestId: string;
    message: string;
    stack?: string;
}

export type WorkerOutboundMessage = PipelineResult | PipelineError;
