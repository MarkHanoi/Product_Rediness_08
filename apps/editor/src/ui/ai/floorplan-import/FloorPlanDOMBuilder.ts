/**
 * @file FloorPlanDOMBuilder.ts
 * DOM template + event-listener wiring for the FloorPlanImportPanel wizard.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 *
 * buildFloorPlanDOM() creates the panel element, injects the HTML template,
 * and wires all event listeners by calling the imported step functions with
 * the instance-scoped state object.
 */

import type { FPState } from './FPTypes';
import {
    downloadDiagnosticJSON,
    downloadWallJSON,
} from '@pryzm/ai-host';
import { gotoStep } from './FPHelpers';
import { handlePDFUpload } from './Step1UploadView';
import {
    handleRulerCanvasClick,
    handleConfirmRuler,
    handleResetRuler,
    handleUseDetectedScale,
    handleApplyManualScale,
} from './Step2CalibrationView';
import { handlePlaceUnderlay, handleConfirmPosition } from './Step3UnderlayView';
import { handleAnalyse, handleContinueFromDebug } from './Step4AnalysisView';
import {
    handleApproveAll,
    handlePushAll,
    handleExecuteInSequence,
    handleRemoveUnderlay,
    resetState,
} from './Step6CommitView';

// ── Reference element dimension table ─────────────────────────────────────────
// Used by the (optional) reference element dropdown (#fp-ref-element) to
// pre-fill the distance input when the user picks a known building element.
const REFERENCE_ELEMENTS: Record<string, { label: string; defaultM: number }> = {
    door:       { label: 'Standard door',       defaultM: 0.9  },
    window:     { label: 'Standard window',     defaultM: 1.2  },
    room_width: { label: 'Standard room width', defaultM: 4.0  },
    corridor:   { label: 'Standard corridor',   defaultM: 1.2  },
    parking:    { label: 'Parking bay length',  defaultM: 5.0  },
};

// ── DOM factory ───────────────────────────────────────────────────────────────

/**
 * Create the panel element, inject the HTML template, and wire all listeners.
 *
 * @param state         Instance-scoped FPState (moved out of module scope in FILE 4 singleton fix).
 * @param runtime       PryzmRuntime (may be null until B-wire phase completes).
 * @param onViewFullPlan Callback to open the full plan overlay (defined in shell, needs runtime).
 */
export function buildFloorPlanDOM(
    state: FPState,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
    onViewFullPlan: () => void,
): HTMLElement {
    const container = document.createElement('div');
    container.className = 'fp-panel';
    container.id = 'fp-panel-root';

    container.innerHTML = `
        <div class="fp-header">
            <span class="fp-header-title">📐 Floor Plan Import</span>
            <button class="fp-close-btn" id="fp-close-btn" title="Close">✕</button>
        </div>

        <!-- Status bar -->
        <div id="fp-status" class="fp-status"></div>

        <!-- Step 1: Upload floor plan (PDF, JPG, PNG) -->
        <div id="fp-step-1" class="fp-step" style="display:flex;flex-direction:column;">
            <div class="fp-field">
                <input type="file" id="fp-file-input" accept=".pdf,.jpg,.jpeg,.png" class="fp-file-input">
            </div>
            <div id="fp-filename" class="fp-filename"></div>
            <img id="fp-thumbnail" class="fp-thumbnail" src="" alt="Plan preview" style="display:none;">
        </div>

        <!-- Step 2: Scale Calibration (Phase B — Two-Point Ruler) -->
        <div id="fp-step-2" class="fp-step" style="display:none;flex-direction:column;gap:8px;">
            <div class="fp-step-title">2 — Scale Calibration</div>

            <!-- Scale bar auto-detection strip -->
            <div id="fp-scale-detect" class="fp-hint fp-hint--success" style="display:none;"></div>
            <button id="fp-use-detected-btn" class="fp-btn" style="display:none;margin-top:-4px;">
                ✓ Use Detected Scale
            </button>

            <!-- Ruler instruction -->
            <div class="fp-hint">
                Click <strong>point A</strong> then <strong>point B</strong> on the plan image below —
                choose two points whose real-world distance you know (e.g. a wall length or door width).
            </div>

            <!-- Ruler image + canvas overlay -->
            <div class="fp-ruler-wrap">
                <img id="fp-ruler-img" class="fp-ruler-img" alt="Plan preview" />
                <canvas id="fp-ruler-canvas" class="fp-ruler-canvas" style="cursor:crosshair;"></canvas>
            </div>

            <!-- Ruler status text -->
            <div id="fp-ruler-info" class="fp-hint" style="background:transparent;padding:2px 0;font-size:12px;"></div>

            <!-- Distance input — shown after two points are placed -->
            <div id="fp-ruler-dim-wrap" class="fp-field" style="display:none;flex-direction:column;gap:4px;">
                <label class="fp-label" for="fp-ruler-dim">Real-world distance between A → B (metres)</label>
                <input type="number" id="fp-ruler-dim" class="fp-input"
                       placeholder="e.g. 3.6" step="0.001" min="0.001">
                <!-- Live scale preview — updates as user types -->
                <div id="fp-ruler-live-preview" style="
                    font-size:11px;
                    color:#1b5e20;
                    background:#e8f5e9;
                    border-radius:4px;
                    padding:5px 8px;
                    display:none;
                    line-height:1.5;
                "></div>
                <button class="fp-btn" id="fp-confirm-ruler-btn">📏 Confirm Scale</button>
            </div>

            <!-- Reset ruler -->
            <button id="fp-reset-ruler-btn" class="fp-btn fp-btn--secondary"
                    style="display:none;align-self:flex-start;">↺ Reset Points</button>

            <!-- Manual override (collapsible) -->
            <details class="fp-details">
                <summary class="fp-hint" style="cursor:pointer;background:transparent;padding:2px 0;">
                    ✏️ Manual override (enter px/m directly)
                </summary>
                <div class="fp-field" style="margin-top:6px;gap:4px;flex-direction:column;">
                    <label class="fp-label" for="fp-manual-scale">Pixels per metre</label>
                    <input type="number" id="fp-manual-scale" class="fp-input"
                           placeholder="e.g. 120" step="1" min="1">
                    <button class="fp-btn" id="fp-apply-manual-btn">Apply Manual Scale</button>
                </div>
            </details>

            <!-- Calibration result -->
            <div id="fp-cal-confirm" class="fp-hint" style="display:none;"></div>

            <div class="fp-row-btns">
                <button class="fp-btn" id="fp-to-step3-btn">Place in Scene →</button>
                <button class="fp-btn fp-btn--secondary" id="fp-back-1-btn">← Back</button>
            </div>
        </div>

        <!-- Step 3: Place Underlay -->
        <div id="fp-step-3" class="fp-step" style="display:none;flex-direction:column;">
            <div class="fp-step-title">3 — Position in Scene</div>
            <div class="fp-hint">
                Drag to move · <strong>R</strong> to rotate · <strong>Delete</strong> to remove.
            </div>
            <div class="fp-row-btns">
                <button class="fp-btn" id="fp-confirm-pos-btn">✓ Finish Import</button>
                <button class="fp-btn fp-btn--secondary" id="fp-back-2-btn">← Back</button>
            </div>
        </div>

        <!-- Persistent underlay controls bar — shown after import is complete. -->
        <div id="fp-underlay-controls-bar" style="
            display:none;
            flex-direction:column;
            gap:6px;
            padding:10px 12px;
            background:#1a1a2e;
            border-top:1px solid #3a3a5c;
            margin-top:4px;
            border-radius:0 0 6px 6px;
        ">
            <div style="font-size:11px;color:#a0a8c0;font-weight:600;letter-spacing:0.04em;">
                FLOOR PLAN UNDERLAY
            </div>
            <div style="font-size:10px;color:#6a7280;line-height:1.5;">
                <strong style="color:#9aa3b2;">Click plan</strong> to select &amp; move &nbsp;·&nbsp;
                <strong style="color:#9aa3b2;">R</strong> to rotate 90° &nbsp;·&nbsp;
                <strong style="color:#9aa3b2;">Delete</strong> to remove
            </div>
            <div style="display:flex;gap:6px;">
                <button id="fp-bar-scale-btn" style="
                    flex:1;padding:5px 0;font-size:10px;font-weight:600;
                    background:#1a3a5c;border:1px solid #2a6090;color:#60b8ff;
                    border-radius:4px;cursor:pointer;
                " title="Calibrate the scale using two reference points on the plan">📐 Scale</button>
                <button id="fp-bar-reopen-btn" style="
                    flex:1;padding:5px 0;font-size:10px;font-weight:600;
                    background:#2d2d4e;border:1px solid #3a3a5c;color:#a0a8c0;
                    border-radius:4px;cursor:pointer;
                " title="Re-open the import panel">⚙ Settings</button>
                <button id="fp-bar-delete-btn" style="
                    flex:1;padding:5px 0;font-size:10px;font-weight:600;
                    background:#3d1515;border:1px solid #6d2020;color:#ff7070;
                    border-radius:4px;cursor:pointer;
                " title="Remove the underlay from the scene">✕ Remove</button>
            </div>
        </div>

        <!-- Step 4: Analysis Options (hidden — not used in 3-step flow) -->
        <div id="fp-step-4" class="fp-step" style="display:none;flex-direction:column;">
            <div class="fp-step-title">4 — Analysis Options</div>
            <div class="fp-check-group">
                <label class="fp-check-label"><input type="checkbox" id="fp-opt-walls" checked> Walls</label>
                <label class="fp-check-label"><input type="checkbox" id="fp-opt-openings" checked> Doors &amp; Windows</label>
                <label class="fp-check-label"><input type="checkbox" id="fp-opt-slab" checked> Floor Slab</label>
                <label class="fp-check-label"><input type="checkbox" id="fp-opt-furniture"> Furniture</label>
                <label class="fp-check-label"><input type="checkbox" id="fp-opt-plumbing"> Plumbing Fixtures</label>
            </div>
            <div class="fp-field">
                <label class="fp-label" for="fp-wall-height">Wall height (m)</label>
                <input type="number" id="fp-wall-height" class="fp-input" value="3.0" step="0.1" min="0.5" max="20">
            </div>
            <div class="fp-row-btns">
                <button class="fp-btn" id="fp-analyse-btn">🔍 Analyse Floor Plan</button>
                <button class="fp-btn fp-btn--secondary" id="fp-back-3-btn">← Back</button>
            </div>
        </div>

        <!-- Detection Preview (intermediate — not part of numbered step indicators) -->
        <div id="fp-step-debug" class="fp-step" style="display:none;flex-direction:column;gap:8px;">
            <div class="fp-step-title" style="color:#7c3aed;">🔍 Detection Preview — Raw AI Output</div>
            <div class="fp-hint" style="font-size:11px;line-height:1.5;background:#f3f0ff;border-left:3px solid #7c3aed;padding:6px 8px;">
                This preview shows what the AI detected <strong>before</strong> any post-processing.
                Check if doors and windows are correctly identified here — if they are missing or wrong at this stage,
                the issue is in the AI detection (prompt / image quality). If they appear here but not in the 3D model,
                the issue is in the post-processing or wall-hosting logic.
            </div>

            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;">
                <span style="color:#22c55e;font-weight:700;">■ Exterior walls</span>
                <span style="color:#f472b6;font-weight:700;">■ Interior partitions</span>
                <span style="color:#9ca3af;font-weight:700;">■ Unknown walls</span>
                <span style="color:#3b82f6;font-weight:700;">■ Doors</span>
                <span style="color:#f97316;font-weight:700;">■ Windows</span>
            </div>

            <table style="border-collapse:collapse;width:100%;margin-bottom:4px;" id="fp-debug-stats-table"></table>

            <div id="fp-debug-canvas-wrap" style="
                width:100%;
                border:1px solid #e0e0e0;
                border-radius:4px;
                overflow:hidden;
                background:#f8f8f8;
                min-height:80px;
                display:flex;
                align-items:center;
                justify-content:center;
            ">
                <span style="font-size:11px;color:#aaa;">Rendering overlay…</span>
            </div>

            <div class="fp-hint" style="font-size:10px;color:#888;">
                Wall IDs (e.g. w1, w2…) are shown at segment midpoints. Opening IDs (o1, o2…) appear above each marker.
                Zoom in if the plan is dense. A missing arc = door not detected at this stage.
            </div>

            <div class="fp-row-btns" style="margin-top:4px;">
                <button class="fp-btn" id="fp-debug-continue-btn">▶ Continue to Proposals</button>
                <button class="fp-btn fp-btn--secondary" id="fp-debug-back-btn">← Re-analyse</button>
            </div>
            <button class="fp-btn fp-btn--secondary" id="fp-view-full-plan-btn"
                style="margin-top:4px;font-size:11px;display:flex;align-items:center;justify-content:center;gap:6px;"
                title="Open the original floor plan image at full resolution in a new tab">
                🔍 View Full Plan in New Tab
            </button>
        </div>

        <!-- Step 5: Review Summary -->
        <div id="fp-step-5" class="fp-step" style="display:none;flex-direction:column;">
            <div class="fp-step-title">5 — Review Detected Elements</div>
            <div id="fp-summary-text" class="fp-hint"></div>
            <div id="fp-summary-list" class="fp-summary-list"></div>
            <button class="fp-btn" id="fp-execute-seq-btn" style="margin-top:10px;">▶ Execute All in Sequence</button>
            <div class="fp-hint" style="margin-top:4px;font-size:10px;color:#666;">Creates all walls first, then slab, then doors, then windows — no individual popups.</div>
            <div class="fp-row-btns" style="margin-top:8px;">
                <button class="fp-btn fp-btn--secondary" id="fp-push-all-btn">Send to AI Actions Panel →</button>
                <button class="fp-btn fp-btn--secondary" id="fp-back-4-btn">← Back</button>
            </div>
            <div style="margin-top:10px;padding-top:8px;border-top:1px solid #e0e0e0;">
                <div class="fp-hint" style="font-size:11px;font-weight:600;color:#444;margin-bottom:6px;">
                    Wall Detection Debug Export
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <button class="fp-btn" id="fp-wall-json-btn"
                            style="display:none;font-size:11px;padding:6px 12px;background:#6e8efb;"
                            title="Download a focused JSON with every detected wall — accepted and skipped — including raw pixel coords, world coords, skip reasons, confidence, and thickness">
                        ⬇ Wall Detection JSON
                    </button>
                    <div class="fp-hint" style="font-size:10px;color:#888;margin-top:-2px;">
                        Every wall Claude detected — accepted &amp; skipped — with pixel coords, world coords, skip reason, and confidence. Use this to debug phantom walls and missing walls.
                    </div>
                    <button class="fp-btn fp-btn--secondary" id="fp-diag-download-btn"
                            style="display:none;font-size:10px;padding:4px 10px;"
                            title="Download the full pipeline report including slab, topology, openings, furniture, and preprocessing data">
                        ⬇ Full Pipeline Report (advanced)
                    </button>
                    <div class="fp-hint" style="font-size:10px;color:#aaa;margin-top:-2px;">
                        Full report: topology, openings, slab, preprocessing, and all post-processing stats.
                    </div>
                </div>
            </div>
        </div>

        <!-- Step 6: Done -->
        <div id="fp-step-6" class="fp-step" style="display:none;flex-direction:column;">
            <div class="fp-step-title">6 — Complete</div>
            <div id="fp-exec-summary" class="fp-hint" style="line-height:1.8;margin-bottom:8px;"></div>
            <div id="fp-approve-result" class="fp-hint"></div>
            <button class="fp-btn" id="fp-approve-high-btn" style="margin-bottom:6px;display:none;">★ Approve All High-Confidence</button>
            <div class="fp-hint" style="margin-top:8px;">The floor plan underlay remains visible. You can toggle it or remove it below.</div>
            <div class="fp-row-btns" style="margin-top:8px;">
                <button class="fp-btn fp-btn--danger" id="fp-remove-underlay-btn">Remove Underlay</button>
                <button class="fp-btn fp-btn--secondary" id="fp-start-over-btn">Start Over</button>
            </div>
        </div>
    `;

    // ── Attach listeners (deferred so BUI finishes rendering first) ────────────

    const attach = () => {
        // Close
        container.querySelector('#fp-close-btn')?.addEventListener('click', () => {
            const wrapper = document.getElementById('fp-import-panel-container');
            if (wrapper) wrapper.style.display = 'none';
        });

        // Step 1
        container.querySelector('#fp-file-input')?.addEventListener('change', (e) =>
            handlePDFUpload(state, e)
        );

        // Step 2 — Two-Point Ruler
        container.querySelector('#fp-ruler-canvas')?.addEventListener('click', (e) =>
            handleRulerCanvasClick(state, e as MouseEvent)
        );
        container.querySelector('#fp-confirm-ruler-btn')?.addEventListener('click', () =>
            handleConfirmRuler(state)
        );
        container.querySelector('#fp-reset-ruler-btn')?.addEventListener('click', () =>
            handleResetRuler(state)
        );
        container.querySelector('#fp-use-detected-btn')?.addEventListener('click', () =>
            handleUseDetectedScale(state)
        );
        container.querySelector('#fp-apply-manual-btn')?.addEventListener('click', () =>
            handleApplyManualScale(state)
        );
        container.querySelector('#fp-to-step3-btn')?.addEventListener('click', () =>
            handlePlaceUnderlay(state)
        );
        container.querySelector('#fp-back-1-btn')?.addEventListener('click', () =>
            gotoStep(state, 1)
        );

        // Step 3
        container.querySelector('#fp-confirm-pos-btn')?.addEventListener('click', () =>
            handleConfirmPosition(state)
        );
        container.querySelector('#fp-back-2-btn')?.addEventListener('click', () =>
            gotoStep(state, 2)
        );

        // Step 4
        container.querySelector('#fp-analyse-btn')?.addEventListener('click', () =>
            handleAnalyse(state, runtime)
        );
        container.querySelector('#fp-back-3-btn')?.addEventListener('click', () => {
            state.underlayTool?.setLocked(false);
            gotoStep(state, 3);
        });

        // Detection Preview
        container.querySelector('#fp-debug-continue-btn')?.addEventListener('click', () =>
            handleContinueFromDebug(state)
        );
        container.querySelector('#fp-debug-back-btn')?.addEventListener('click', () => {
            state.rawAnalysis = null;
            gotoStep(state, 4);
        });
        container.querySelector('#fp-view-full-plan-btn')?.addEventListener('click', onViewFullPlan);

        // Step 5
        container.querySelector('#fp-execute-seq-btn')?.addEventListener('click', () =>
            handleExecuteInSequence(state)
        );
        container.querySelector('#fp-push-all-btn')?.addEventListener('click', () =>
            handlePushAll(state)
        );
        container.querySelector('#fp-back-4-btn')?.addEventListener('click', () =>
            gotoStep(state, 4)
        );
        container.querySelector('#fp-wall-json-btn')?.addEventListener('click', () => {
            if (!state.diagnosticReport) return;
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            downloadWallJSON(state.diagnosticReport, `pryzm-walls-${ts}.json`);
        });
        container.querySelector('#fp-diag-download-btn')?.addEventListener('click', () => {
            if (!state.diagnosticReport) return;
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            downloadDiagnosticJSON(state.diagnosticReport, `pryzm-pipeline-report-${ts}.json`);
        });

        // Step 6
        container.querySelector('#fp-approve-high-btn')?.addEventListener('click', () =>
            handleApproveAll(state)
        );
        container.querySelector('#fp-remove-underlay-btn')?.addEventListener('click', () =>
            handleRemoveUnderlay(state)
        );
        container.querySelector('#fp-start-over-btn')?.addEventListener('click', () => {
            state.underlayTool?.dispose();
            state.underlayTool = null;
            const controlsBar = document.getElementById('fp-underlay-controls-bar');
            if (controlsBar) controlsBar.style.display = 'none';
            resetState(state);
            gotoStep(state, 1);
        });

        // Live scale preview (ruler dim input)
        container.querySelector('#fp-ruler-dim')?.addEventListener('input', (e) => {
            const input = e.target as HTMLInputElement;
            const realM = parseFloat(input.value);
            const previewEl = document.getElementById('fp-ruler-live-preview');
            if (!previewEl || !state.pdfConversion || state.rulerPoints.length < 2) return;

            if (!isFinite(realM) || realM <= 0) {
                previewEl.style.display = 'none';
                return;
            }

            const pts = state.rulerPoints;
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const distDisplayPx = Math.sqrt(dx * dx + dy * dy);
            const canvas = document.getElementById('fp-ruler-canvas') as HTMLCanvasElement | null;
            const displayW = canvas?.offsetWidth || state.pdfConversion.widthPx;
            const displayToImageScale = state.pdfConversion.widthPx / displayW;
            const distImagePx = distDisplayPx * displayToImageScale;
            const pxPerMeter = distImagePx / realM;

            if (pxPerMeter > 0) {
                const planW = (state.pdfConversion.widthPx / pxPerMeter).toFixed(2);
                const planH = (state.pdfConversion.heightPx / pxPerMeter).toFixed(2);
                previewEl.style.display = 'block';
                previewEl.innerHTML =
                    `<strong>Scale:</strong> ${pxPerMeter.toFixed(1)} px/m<br>` +
                    `<strong>Plan size:</strong> ${planW} m × ${planH} m`;
            }
        });

        // Persistent underlay controls bar
        container.querySelector('#fp-bar-scale-btn')?.addEventListener('click', () => {
            const ut = window.floorPlanUnderlayTool ?? state.underlayTool ?? null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
            if (!ut) {
                console.warn('[FloorPlanImportPanel] Scale: no underlay tool available');
                return;
            }
            window.runtime?.events?.emit('underlay:reference-scale-activate', { underlayTool: ut }); // F.events.13
            console.log('[FloorPlanImportPanel] Underlay reference scale activated from controls bar');
        });

        container.querySelector('#fp-bar-reopen-btn')?.addEventListener('click', () => {
            const wrapper = document.getElementById('fp-import-panel-container');
            if (wrapper) wrapper.style.display = '';
            const step1 = document.getElementById('fp-step-1');
            if (step1) step1.style.display = 'flex';
        });

        container.querySelector('#fp-bar-delete-btn')?.addEventListener('click', () =>
            handleRemoveUnderlay(state)
        );

        // Sync reference element dropdown → fill dim input
        const refEl = container.querySelector('#fp-ref-element') as HTMLSelectElement | null;
        const dimEl = container.querySelector('#fp-ref-dim') as HTMLInputElement | null;
        refEl?.addEventListener('change', () => {
            const info = REFERENCE_ELEMENTS[refEl.value];
            if (info && dimEl && info.defaultM > 0) dimEl.value = String(info.defaultM);
        });
    };

    // Listeners need DOM to be ready (BUI may delay rendering)
    setTimeout(attach, 50);

    return container;
}
