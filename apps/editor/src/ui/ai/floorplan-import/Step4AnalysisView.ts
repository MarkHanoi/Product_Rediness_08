/**
 * @file Step4AnalysisView.ts
 * Step 4: AI analysis options, detection preview, continue-from-debug.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { FloorPlanAnalysis } from '@pryzm/ai-host';
import { FloorPlanAIFactory } from '@pryzm/ai-host';
import { detectLineSegmentsFromBase64 } from '@pryzm/ai-host';
import { FloorPlanCommandBatcher } from '@pryzm/ai-host';
import { buildReportMetadata } from '@pryzm/ai-host';
import { renderDetectionOverlay } from '../FloorPlanDebugOverlay';
import type { FloorPlanUnderlayTool } from '@pryzm/input-host';
import { setStatus, gotoStep, showDebugStep } from './FPHelpers';
import { escHtml } from '@pryzm/ui-base';
import { renderSummary } from './Step5SummaryView';

// ── Read analysis options from DOM ────────────────────────────────────────────

export function readOptions(state: FPState): void {
    const wallsEl  = document.getElementById('fp-opt-walls')     as HTMLInputElement | null;
    const slabEl   = document.getElementById('fp-opt-slab')      as HTMLInputElement | null;
    const furnEl   = document.getElementById('fp-opt-furniture')  as HTMLInputElement | null;
    const plmbEl   = document.getElementById('fp-opt-plumbing')   as HTMLInputElement | null;
    const openEl   = document.getElementById('fp-opt-openings')   as HTMLInputElement | null;
    const heightEl = document.getElementById('fp-wall-height')    as HTMLInputElement | null;

    state.includeWalls    = wallsEl?.checked  ?? true;
    state.includeSlab     = slabEl?.checked   ?? true;
    state.includeFurniture = furnEl?.checked  ?? true;
    state.includePlumbing  = plmbEl?.checked  ?? true;
    state.includeOpenings  = openEl?.checked  ?? true;
    state.wallHeight = heightEl ? parseFloat(heightEl.value) || 3.0 : 3.0;
}

// ── Run AI analysis ────────────────────────────────────────────────────────────

export async function handleAnalyse(
    state: FPState,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): Promise<void> {
    if (!state.pdfConversion || !state.underlayTool || !state.underlayConfirmed) {
        setStatus('Please confirm the underlay position first.', true);
        return;
    }

    readOptions(state);

    const levelId = window.projectContext?.activeLevelId; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
    if (!levelId) {
        setStatus('No active level. Select one first.', true);
        return;
    }

    state.isAnalysing = true;
    const btn = document.getElementById('fp-analyse-btn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Analysing…'; }

    setStatus('Phase F1: Pre-processing image for line detection…');
    const preprocessed = await detectLineSegmentsFromBase64(
        state.pdfConversion.base64,
        'image/jpeg',
    );
    if (preprocessed.hasUsableData) {
        setStatus(`Phase F1 complete: ${preprocessed.segments.length} segments detected — activating guided AI mode…`);
    } else {
        setStatus(`Phase F1: insufficient segments (${preprocessed.segments.length}) — using standard AI detection…`);
    }

    try {
        const analysis = await FloorPlanAIFactory.analyse(
            {
                base64Image:      state.pdfConversion.base64,
                widthPx:          state.pdfConversion.widthPx,
                heightPx:         state.pdfConversion.heightPx,
                extractedText:    state.pdfConversion.textContent,
                includeStructure: state.includeWalls || state.includeSlab || state.includeOpenings,
                includeFurniture: state.includeFurniture,
                includePlumbing:  state.includePlumbing,
                includeSlab:      state.includeSlab,
                detectedSegments: preprocessed.segments,
                textAnnotations:  state.pdfConversion.textItems,
            },
            (stage) => setStatus(stage)
        );

        state.rawAnalysis = analysis;

        setStatus('Rendering detection preview…');
        await renderDebugPreviewStep(state, analysis, preprocessed.segments.length, preprocessed.hasUsableData, runtime);

        showDebugStep();
        setStatus(`✓ AI analysis complete — review detected elements below, then continue.`);

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FloorPlanImportPanel] Analysis error:', err);
        setStatus(`Error: ${msg}`, true);
    } finally {
        state.isAnalysing = false;
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Analyse Floor Plan'; }
    }
}

// ── Debug preview step ────────────────────────────────────────────────────────

/**
 * Renders the colored debug overlay canvas into #fp-debug-canvas-wrap.
 * Called from handleAnalyse() after the AI analysis returns.
 */
async function renderDebugPreviewStep(
    state: FPState,
    analysis: FloorPlanAnalysis,
    preprocessedSegmentCount: number,
    guidedModeActive: boolean,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
): Promise<void> {
    if (!state.pdfConversion) return;

    const wrapEl = document.getElementById('fp-debug-canvas-wrap');
    if (!wrapEl) return;

    wrapEl.innerHTML = '';

    try {
        const result = await renderDetectionOverlay(
            analysis,
            state.pdfConversion.base64,
            'image/jpeg',
            640,
            runtime /* B-runtime-thread renderDetectionOverlay */,
        );

        result.canvas.style.width  = '100%';
        result.canvas.style.height = 'auto';
        result.canvas.style.display = 'block';
        result.canvas.style.borderRadius = '4px';
        wrapEl.appendChild(result.canvas);

        populateDebugStats(analysis, result.stats, preprocessedSegmentCount, guidedModeActive);

    } catch (err) {
        wrapEl.innerHTML = `<div style="color:#dc3545;font-size:12px;">Preview unavailable: ${escHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
}

// ── Debug stats table ─────────────────────────────────────────────────────────

function populateDebugStats(
    analysis: FloorPlanAnalysis,
    stats: { exteriorWalls: number; interiorWalls: number; unknownWalls: number; doors: number; windows: number },
    preprocessedSegmentCount: number,
    guidedModeActive: boolean,
): void {
    const totalWalls    = analysis.walls.length;
    const totalOpenings = analysis.openings.length;

    const rows: Array<{ label: string; value: string; color?: string }> = [
        { label: 'Exterior walls detected',      value: String(stats.exteriorWalls),   color: '#22c55e' },
        { label: 'Interior partitions detected',  value: String(stats.interiorWalls),   color: '#f472b6' },
        { label: 'Unknown-type walls',            value: String(stats.unknownWalls),    color: '#9ca3af' },
        { label: 'Total walls (raw AI)',           value: String(totalWalls) },
        { label: 'Doors detected',                value: String(stats.doors),           color: '#3b82f6' },
        { label: 'Windows detected',              value: String(stats.windows),         color: '#f97316' },
        { label: 'Total openings (raw AI)',        value: String(totalOpenings) },
        { label: 'F1 pre-processed segments',     value: `${preprocessedSegmentCount} (${guidedModeActive ? 'guided' : 'free'} mode)` },
    ];

    const tableEl = document.getElementById('fp-debug-stats-table');
    if (!tableEl) return;
    tableEl.innerHTML = rows.map(r => `
        <tr>
            <td style="padding:3px 8px 3px 0;font-size:11px;color:#666;">${r.label}</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:${r.color ?? '#1a1a2e'};">${r.value}</td>
        </tr>
    `).join('');
}

// ── Room overlay on debug canvas ──────────────────────────────────────────────

/**
 * Issue 8 — Draw semi-transparent purple room polygons + centroid labels
 * on top of the existing wall debug canvas.
 */
function renderRoomOverlayOnDebugCanvas(
    rooms: Array<{ id: string; boundaryWallIds: string[]; centroid: { x: number; z: number }; labelFromPDF?: string }>,
    wallUUIDToWorld: Map<string, { worldStart: { x: number; z: number }; worldEnd: { x: number; z: number } }>,
    underlayTool: FloorPlanUnderlayTool,
    imgWidthPx: number,
    imgHeightPx: number,
): void {
    const canvas = document.querySelector('#fp-debug-canvas-wrap canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = canvas.width  / imgWidthPx;
    const scaleY = canvas.height / imgHeightPx;

    for (const room of rooms) {
        ctx.fillStyle   = 'rgba(128, 0, 200, 0.15)';
        ctx.strokeStyle = 'rgba(128, 0, 200, 0.6)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        let first = true;
        for (const wallId of room.boundaryWallIds) {
            const entry = wallUUIDToWorld.get(wallId);
            if (!entry) continue;
            const imgPx = underlayTool.worldToPixel(entry.worldStart.x, entry.worldStart.z);
            if (!imgPx) continue;
            const cx = imgPx.x * scaleX;
            const cy = imgPx.y * scaleY;
            if (first) { ctx.moveTo(cx, cy); first = false; }
            else ctx.lineTo(cx, cy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const centImgPx = underlayTool.worldToPixel(room.centroid.x, room.centroid.z);
        if (centImgPx) {
            const cx = centImgPx.x * scaleX;
            const cy = centImgPx.y * scaleY;
            const label = room.labelFromPDF ?? room.id;
            ctx.font      = '11px sans-serif';
            ctx.textAlign = 'center';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(128, 0, 200, 0.85)';
            ctx.beginPath();
            ctx.roundRect(cx - tw / 2 - 4, cy - 12, tw + 8, 15, 3);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(label, cx, cy - 1);
        }
    }
    ctx.textAlign = 'left';
}

// ── Continue from debug preview to proposals ──────────────────────────────────

/**
 * Continues from the detection preview step to proposal batching and Step 5.
 * Called when the user clicks "Continue to Proposals" in the debug step.
 */
export async function handleContinueFromDebug(state: FPState): Promise<void> {
    const analysis = state.rawAnalysis;
    if (!analysis || !state.underlayTool) {
        setStatus('Analysis data missing — please run analysis again.', true);
        gotoStep(state, 4);
        return;
    }

    const levelId = window.projectContext?.activeLevelId; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
    if (!levelId) {
        setStatus('No active level. Select one first.', true);
        return;
    }

    const continueBtn = document.getElementById('fp-debug-continue-btn') as HTMLButtonElement | null;
    if (continueBtn) { continueBtn.disabled = true; continueBtn.textContent = '⏳ Batching…'; }

    setStatus('Batching proposals…');

    try {
        const result = FloorPlanCommandBatcher.batch({
            analysis,
            underlayTool:    state.underlayTool,
            targetLevelId:   levelId,
            wallHeight:      state.wallHeight,
            includeWalls:    state.includeWalls,
            includeSlab:     state.includeSlab,
            includeFurniture: state.includeFurniture,
            includePlumbing:  state.includePlumbing,
            includeOpenings:  state.includeOpenings,
        });

        state.proposals = result.proposals;
        const { walls, slab, furniture, plumbing, openings, rooms } = result.summary;
        const parts = [
            `${walls} wall${walls !== 1 ? 's' : ''}`,
            `${openings} opening${openings !== 1 ? 's' : ''} (doors/windows)`,
            `🟣 ${rooms} room${rooms !== 1 ? 's' : ''} detected`,
            `${slab} slab`,
            `${furniture} furniture item${furniture !== 1 ? 's' : ''}`,
            `${plumbing} plumbing fixture${plumbing !== 1 ? 's' : ''}`,
        ];
        state.summaryText = `Found: ${parts.join(' · ')}.${result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ''}`;

        if (result.rooms.length > 0 && state.underlayTool && state.pdfConversion) {
            renderRoomOverlayOnDebugCanvas(
                result.rooms,
                result.wallUUIDToWorld,
                state.underlayTool,
                state.pdfConversion.widthPx,
                state.pdfConversion.heightPx,
            );
        }

        const conv = state.pdfConversion!;
        const topoGraph = result.wallGraph;
        const totalNodes = topoGraph.nodes.size;
        const totalEdges = topoGraph.edges.size;
        const outerFacePoly = (() => {
            const slabProposal = result.proposals.find(p => p.intentType === 'PDF_IMPORT_SLAB');
            if (!slabProposal) return null;
            const cmd = slabProposal.command as any;
            const poly = cmd?.params?.polygon ?? cmd?.polygon ?? null;
            if (!poly || !Array.isArray(poly)) return null;
            return (poly as Array<{ x: number; y: number }>).map(p => ({ x: p.x, z: p.y }));
        })();

        state.diagnosticReport = {
            schemaVersion: '1.0',
            metadata: buildReportMetadata(
                conv.widthPx,
                conv.heightPx,
                state.pxPerMeter,
                state.calibrationMethod,
            ),
            preprocessing: {
                segmentsDetected: 0,
                guidedModeActivated: false,
                segments: [],
            },
            aiRawCounts: {
                b1WallsDetected:    analysis.walls.length,
                b2OpeningsDetected: analysis.openings.length,
                slabDetected:       !!analysis.slab,
                slabConfidence:     analysis.slab?.confidence ?? null,
                furnitureDetected:  analysis.furniture.length,
            },
            walls: result.wallDiagnostics,
            postProcessing: result.postProcessingStats,
            topology: {
                wallGraphNodes:  totalNodes,
                wallGraphEdges:  totalEdges,
                roomsDetected:   result.rooms.length,
                rooms: result.rooms.map(r => ({
                    id:                r.id,
                    areaM2:            parseFloat(r.areaM2.toFixed(3)),
                    centroid:          { x: parseFloat(r.centroid.x.toFixed(4)), z: parseFloat(r.centroid.z.toFixed(4)) },
                    boundaryWallCount: r.boundaryWallIds.length,
                })),
                slabSource:          slab > 0 ? (outerFacePoly ? 'topology_outer_face' : 'ai_detected') : 'none',
                outerFaceVertices:   outerFacePoly ? outerFacePoly.length : null,
                outerFacePolygon:    outerFacePoly,
            },
            openings: result.openingDiagnostics,
            proposalSummary: {
                walls,
                slab,
                openings,
                furniture,
                plumbing,
                total:   result.proposals.length,
                skipped: result.skippedCount,
            },
        };

        const wallJsonBtn = document.getElementById('fp-wall-json-btn') as HTMLButtonElement | null;
        if (wallJsonBtn) wallJsonBtn.style.display = 'inline-block';
        const diagBtn = document.getElementById('fp-diag-download-btn') as HTMLButtonElement | null;
        if (diagBtn) diagBtn.style.display = 'inline-block';

        gotoStep(state, 5);
        renderSummary(state, result.proposals);
        setStatus(`✓ Analysis complete. ${state.proposals.length} proposals ready.`);

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FloorPlanImportPanel] Continue-from-debug error:', err);
        setStatus(`Error: ${msg}`, true);
    } finally {
        if (continueBtn) { continueBtn.disabled = false; continueBtn.textContent = '▶ Continue to Proposals'; }
    }
}
