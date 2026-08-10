/**
 * @file Step4AnalysisView.ts
 * Step 4: AI analysis options, detection preview, continue-from-debug.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { FloorPlanAnalysis } from '@pryzm/ai-host';
import { FloorPlanAIFactory } from '@pryzm/ai-host';
import { detectLineSegmentsFromBase64 } from '@pryzm/ai-host';
import { FloorPlanCommandBatcher, measureEffectiveMetersPerPixel } from '@pryzm/ai-host';
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

// ── Vector-first recognition (§VEC-WIRE, PDF-TO-BIM-AUDIT-2026-08-10 §4.1) ────

/**
 * Attempt the deterministic vector path: decode the PDF's stored operator
 * list into vector primitives, classify wall pairs + door arcs + window
 * glazing in mm space, and adapt the result into the SAME FloorPlanAnalysis
 * shape the AI path produces — so FloorPlanCommandBatcher runs unchanged.
 *
 * Returns null (with an honest status line) when the PDF has no usable
 * vector line-work or too few wall pairs — the caller then falls back to AI
 * recognition. Never throws for data reasons; a thrown error means a real
 * bug and is surfaced by handleAnalyse's catch.
 */
async function tryVectorRecognition(state: FPState): Promise<FloorPlanAnalysis | null> {
    const conv = state.pdfConversion;
    const vec = conv?.vector;
    if (!conv || !vec || !state.underlayTool) return null;

    const {
        extractVectorElements,
        explodeVectorLines,
        hasUsableVectorLineWork,
        classifyWallsAndColumns,
        matchOpeningSymbols,
        vectorResultToFloorPlanAnalysis,
        composeMmToPx,
        VECTOR_MIN_WALLS,
    } = await import('@pryzm/ai-worker/pdf-to-bim');

    // The stored ops table is the full pdfjs OPS map; the vectoriser needs
    // its save/restore/transform/constructPath/… subset.
    const rawVectors = extractVectorElements(
        { fnArray: vec.fnArray, argsArray: vec.argsArray },
        vec.ops as unknown as import('@pryzm/ai-worker/pdf-to-bim').PdfOpsSubset,
    );
    if (!hasUsableVectorLineWork(rawVectors)) {
        setStatus(`Vector check: only ${rawVectors.length} vector primitives on the page — using AI recognition.`);
        return null;
    }

    // pt → mm scale. §PDF-SCALE-EFFECTIVE: derive it from the SAME effective
    // transform the batcher will use (mesh.scale-aware), so the classifier's
    // mm thresholds (wall thickness 50–600 mm, door widths…) see true sizes
    // even after the user rescales the underlay in-scene.
    const metersPerPx = measureEffectiveMetersPerPixel(state.underlayTool, conv.widthPx);
    const mmPerPt = conv.renderScale * metersPerPx * 1000;
    if (!isFinite(mmPerPt) || mmPerPt <= 0) return null;

    const vectors = explodeVectorLines(rawVectors);
    const page = {
        pageId: 'page-1',
        pageWidthPt: conv.viewportWidthPt,
        pageHeightPt: vec.pageHeightPt,
        vectors,
    };
    const { walls } = classifyWallsAndColumns(page, mmPerPt);
    if (walls.length < VECTOR_MIN_WALLS) {
        setStatus(
            `Vector extraction found only ${walls.length} wall pair${walls.length === 1 ? '' : 's'} ` +
            `(need ≥ ${VECTOR_MIN_WALLS}) — falling back to AI recognition.`,
        );
        return null;
    }
    const openings = matchOpeningSymbols(page, walls, mmPerPt);

    const analysis = vectorResultToFloorPlanAnalysis({
        walls,
        openings,
        mmToPx: composeMmToPx(vec.viewportTransform, mmPerPt),
        imageWidthPx: conv.widthPx,
        imageHeightPx: conv.heightPx,
    });

    const doors = analysis.openings.filter(o => o.type === 'door').length;
    const windows = analysis.openings.length - doors;
    state.vectorStats = { walls: analysis.walls.length, doors, windows };
    return analysis;
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

    // §FP-ANALYSE-GUARD (founder 2026-06-19, "import pdf/image doesn't work") — the
    // pre-processing step used to run OUTSIDE the try, so if line-detection threw,
    // handleAnalyse rejected before the finally and the button stayed stuck on
    // "⏳ Analysing…" forever with no error. The whole risky section (pre-process +
    // AI relay call) is now inside ONE try/finally so it ALWAYS recovers the button
    // and surfaces a clear message.
    try {
        // ── §VEC-WIRE: vector-first for vector PDFs ───────────────────────
        // Deterministic geometry replaces probabilistic vision when the PDF
        // carries usable vector line-work. AI remains (a) the fallback for
        // raster/scanned plans and (b) the only source of furniture/plumbing
        // symbols (Stage C), which the vector classifier does not cover.
        state.recognitionPath = null;
        state.vectorStats = null;
        let analysis: FloorPlanAnalysis | null = null;
        let preprocessedSegmentCount = 0;
        let guidedModeActive = false;

        if (state.includeWalls || state.includeSlab || state.includeOpenings) {
            setStatus('Checking for vector line-work (deterministic path)…');
            analysis = await tryVectorRecognition(state);
        }

        if (analysis) {
            state.recognitionPath = 'vector';
            const vs = state.vectorStats!;
            setStatus(`Vector extraction: ${vs.walls} walls, ${vs.doors} doors, ${vs.windows} windows (deterministic — no AI wall recognition).`);

            if (state.includeFurniture || state.includePlumbing) {
                // Stage C enrichment only — includeStructure:false skips A/B1/B2.
                try {
                    const furnitureOnly = await FloorPlanAIFactory.analyse(
                        {
                            base64Image:      state.pdfConversion.base64,
                            widthPx:          state.pdfConversion.widthPx,
                            heightPx:         state.pdfConversion.heightPx,
                            extractedText:    state.pdfConversion.textContent,
                            includeStructure: false,
                            includeFurniture: state.includeFurniture,
                            includePlumbing:  state.includePlumbing,
                            includeSlab:      false,
                            textAnnotations:  state.pdfConversion.textItems,
                        },
                        (stage) => setStatus(stage)
                    );
                    analysis = { ...analysis, furniture: furnitureOnly.furniture };
                } catch (furnErr) {
                    // Walls/openings are already deterministic — do not let an
                    // unreachable AI relay kill the import. Report honestly.
                    console.warn('[FloorPlanImportPanel] Furniture stage failed on vector path:', furnErr);
                    setStatus('⚠ Furniture/plumbing AI stage unavailable — continuing with walls & openings from vector extraction only.', true);
                }
            }
        } else {
            state.recognitionPath = 'ai';
            setStatus('Phase F1: Pre-processing image for line detection…');
            const preprocessed = await detectLineSegmentsFromBase64(
                state.pdfConversion.base64,
                'image/jpeg',
            );
            preprocessedSegmentCount = preprocessed.segments.length;
            guidedModeActive = preprocessed.hasUsableData;
            if (preprocessed.hasUsableData) {
                setStatus(`Phase F1 complete: ${preprocessed.segments.length} segments detected — activating guided AI mode…`);
            } else {
                setStatus(`Phase F1: insufficient segments (${preprocessed.segments.length}) — using standard AI detection…`);
            }

            analysis = await FloorPlanAIFactory.analyse(
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
        }

        state.rawAnalysis = analysis;

        setStatus('Rendering detection preview…');
        await renderDebugPreviewStep(state, analysis, preprocessedSegmentCount, guidedModeActive, runtime);

        showDebugStep();
        setStatus(state.recognitionPath === 'vector'
            ? `✓ Vector extraction complete (${state.vectorStats!.walls} walls, ${state.vectorStats!.doors} doors, ${state.vectorStats!.windows} windows) — review below, then continue.`
            : `✓ AI analysis complete — review detected elements below, then continue.`);

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FloorPlanImportPanel] Analysis error:', err);
        // §FP-ANALYSE-GUARD — distinguish an unreachable/unconfigured AI relay from a
        // genuine analysis error so the user knows it's a SERVER config issue, not
        // their PDF. The relay surfaces 401/403/network/"fetch" failures here.
        const m = msg.toLowerCase();
        const relayDown = m.includes('401') || m.includes('403') || m.includes('unauthor')
            || m.includes('failed to fetch') || m.includes('networkerror') || m.includes('relay')
            || m.includes('not configured') || m.includes('cf_worker') || m.includes('anthropic');
        if (relayDown) {
            setStatus('AI service unavailable — the floor-plan analysis runs on the server AI relay, which isn’t reachable/configured on this deploy. Ask the admin to set CF_WORKER_URL (or ANTHROPIC_API_KEY).', true);
        } else {
            setStatus(`Error: ${msg}`, true);
        }
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

        populateDebugStats(analysis, result.stats, preprocessedSegmentCount, guidedModeActive, state);

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
    state: FPState,
): void {
    const totalWalls    = analysis.walls.length;
    const totalOpenings = analysis.openings.length;

    // §CONTEXT-DATA-HONESTY — name WHICH path produced these numbers.
    const isVector  = state.recognitionPath === 'vector';
    const pathLabel = isVector
        ? 'Vector extraction (deterministic)'
        : 'AI recognition (Claude vision)';
    const rawLabel  = isVector ? 'raw vector' : 'raw AI';

    const rows: Array<{ label: string; value: string; color?: string }> = [
        { label: 'Recognition path',              value: pathLabel,                     color: isVector ? '#6600FF' : undefined },
        { label: 'Exterior walls detected',      value: String(stats.exteriorWalls),   color: '#22c55e' },
        { label: 'Interior partitions detected',  value: String(stats.interiorWalls),   color: '#f472b6' },
        { label: 'Unknown-type walls',            value: String(stats.unknownWalls),    color: '#9ca3af' },
        { label: `Total walls (${rawLabel})`,      value: String(totalWalls) },
        { label: 'Doors detected',                value: String(stats.doors),           color: '#3b82f6' },
        { label: 'Windows detected',              value: String(stats.windows),         color: '#f97316' },
        { label: `Total openings (${rawLabel})`,   value: String(totalOpenings) },
        ...(isVector
            ? []
            : [{ label: 'F1 pre-processed segments', value: `${preprocessedSegmentCount} (${guidedModeActive ? 'guided' : 'free'} mode)` }]),
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
        // §CONTEXT-DATA-HONESTY — say WHICH recognition path produced this.
        const pathNote = state.recognitionPath === 'vector'
            ? `Vector extraction${state.vectorStats ? ` (${state.vectorStats.walls} walls, ${state.vectorStats.doors} doors, ${state.vectorStats.windows} windows raw)` : ''}`
            : 'AI recognition';
        state.summaryText = `[${pathNote}] Found: ${parts.join(' · ')}.${result.skippedCount > 0 ? ` (${result.skippedCount} skipped)` : ''}`;

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
