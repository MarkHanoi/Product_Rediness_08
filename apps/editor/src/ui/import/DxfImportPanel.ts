/**
 * DxfImportPanel.ts — Phases 1, 2 & 3, §31
 *
 * Full DXF/DWG import workflow panel:
 *   Phase 1: File selection, unit/scale, layer toggles, overlay placement
 *   Phase 2: "Trace Walls from CAD" AI trace button + project persistence
 *   Phase 3: DWG upload progress indicator
 *
 * CONTRACT (§31 §7.6 CSS):
 *   All CSS classes use the `dxf-` prefix.
 *
 * CONTRACT (§31 §7.1–§7.2):
 *   - No store mutations from this file.
 *   - DXF overlay is placed via DxfUnderlayTool (tool layer).
 *   - AI trace dispatches via commandProposalStore only.
 */

import { injectAppTheme } from '../styles/AppTheme';
import { DxfUnderlayTool }  from '@pryzm/input-host';
import { dxfLayerStore }    from '@pryzm/file-format';
import { dxfOverlayStore }  from '@pryzm/file-format';
import { parseDxfFile, parseDxfString, DXF_UNITS_TO_METRES } from '@pryzm/file-format';
import { traceDxfToWalls }  from '@pryzm/file-format';
// Phase A.6 close (2026-04-29) — toasts route through `runtime.toasts.show(...)`.
// Fallback to the package-owned DOM helper kicks in when `runtime` is null
// (legacy caller hasn't been threaded yet).
import { showAppToast as _packageShowAppToast } from '@pryzm/runtime-composer/showAppToast';
import type { ToastKind } from '@pryzm/runtime-composer';
import { v4 as uuidv4 }     from 'uuid';
import * as THREE from '@pryzm/renderer-three/three';

// ── Panel State ────────────────────────────────────────────────────────────────

interface DxfPanelState {
    step: 1 | 2 | 3;
    fileName: string;
    isDwg: boolean;
    metersPerUnit: number;
    unitsLabel: string;
    overlayId: string | null;
    isLoading: boolean;
    loadingMessage: string;
    error: string;
    layerFilter: string;
}

const state: DxfPanelState = {
    step: 1,
    fileName: '',
    isDwg: false,
    metersPerUnit: 0.001,
    unitsLabel: 'Millimetres (auto-detected)',
    overlayId: null,
    isLoading: false,
    loadingMessage: '',
    error: '',
    layerFilter: '',
};

// Singleton tool — one overlay at a time in Phase 1
let _tool: DxfUnderlayTool | null = null;
let _scene: THREE.Scene | null = null;
let _camera: THREE.Camera | null = null;
let _domElement: HTMLElement | null = null;
let _getBimManager: (() => any) | null = null;

/**
 * Phase A.6 close (2026-04-29) — module-level runtime ref set by
 * `createDxfImportPanel(opts, runtime)`.  The module-level helper
 * functions below (`doPlaceOverlay`, `doTraceWalls`, `doRemoveOverlay`,
 * `restoreDxfOverlay`) call `toast(...)` which reads this ref to route
 * messages through `runtime.toasts.show(...)`.  Falls back to the
 * package-owned DOM helper when the legacy caller passes `runtime: null`.
 */
let _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;

function toast(message: string, kind: ToastKind = 'info', durationMs?: number): void {
    if (_runtime) {
        _runtime.toasts.show(message, kind, durationMs);
    } else {
        _packageShowAppToast(message, kind, durationMs);
    }
}

// ── Public factory ─────────────────────────────────────────────────────────────

export interface DxfPanelOptions {
    scene: THREE.Scene;
    camera: THREE.Camera;
    domElement: HTMLElement;
    /** Returns the active bimManager — used to get active level elevation & levelId */
    getBimManager: () => any;
}

export function createDxfImportPanel(opts: DxfPanelOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime createDxfImportPanel */): HTMLElement {
    _runtime    = runtime; // Phase A.6 close — set module-level ref consumed by `toast(...)`.
    _scene      = opts.scene;
    _camera     = opts.camera;
    _domElement = opts.domElement;
    _getBimManager = opts.getBimManager;
    injectDxfStyles();
    injectAppTheme();
    return buildPanel();
}

// ── Panel HTML ─────────────────────────────────────────────────────────────────

function buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'dxf-panel';
    panel.id = 'dxf-import-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
        <div class="dxf-header">
            <span class="dxf-title">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0">
                    <rect x="1" y="1" width="14" height="14" rx="2" stroke="#a78bfa" stroke-width="1.2"/>
                    <path d="M4 4h3.5L11 8l-3.5 4H4V4z" stroke="#a78bfa" stroke-width="1.1" fill="none"/>
                    <line x1="9" y1="6" x2="12" y2="6" stroke="#a78bfa" stroke-width="1"/>
                    <line x1="9" y1="10" x2="12" y2="10" stroke="#a78bfa" stroke-width="1"/>
                </svg>
                DXF / DWG Import
            </span>
            <button class="dxf-close-btn" title="Close panel">✕</button>
        </div>
        <div class="dxf-body">
            <div class="dxf-step dxf-step-1 dxf-step-active">
                <div class="dxf-section-label">SELECT FILE</div>
                <div class="dxf-file-drop-zone" id="dxf-drop-zone">
                    <div class="dxf-drop-icon">📂</div>
                    <div class="dxf-drop-text">Drop .dxf or .dwg file here</div>
                    <div class="dxf-drop-sub">or click to browse</div>
                    <input type="file" id="dxf-file-input" accept=".dxf,.dwg" style="display:none">
                </div>
                <div class="dxf-error-msg" id="dxf-error" style="display:none"></div>
            </div>
            <div class="dxf-step dxf-step-2" id="dxf-step-2">
                <div class="dxf-section-label">UNITS & SCALE</div>
                <div class="dxf-file-info" id="dxf-file-info">
                    <span class="dxf-filename" id="dxf-fname"></span>
                    <span class="dxf-badge" id="dxf-type-badge"></span>
                </div>
                <div class="dxf-row">
                    <label class="dxf-label">DXF Units</label>
                    <select class="dxf-select" id="dxf-units-sel">
                        <option value="0.001"  id="opt-mm" selected>Millimetres (mm)</option>
                        <option value="0.01"  >Centimetres (cm)</option>
                        <option value="1.0"   >Metres (m)</option>
                        <option value="0.0254">Inches</option>
                        <option value="0.3048">Feet</option>
                    </select>
                </div>
                <div class="dxf-row">
                    <label class="dxf-label">Opacity</label>
                    <input type="range" class="dxf-slider" id="dxf-opacity" min="10" max="100" value="85">
                    <span class="dxf-val" id="dxf-opacity-val">85%</span>
                </div>
                <div class="dxf-loading" id="dxf-loading" style="display:none">
                    <div class="dxf-spinner"></div>
                    <span id="dxf-loading-msg">Loading…</span>
                </div>
                <button class="dxf-btn dxf-btn-primary" id="dxf-place-btn">Place Overlay</button>
                <button class="dxf-btn dxf-btn-ghost"   id="dxf-back-btn">← Back</button>
            </div>
            <div class="dxf-step dxf-step-3" id="dxf-step-3">
                <div class="dxf-section-label">LAYERS <span class="dxf-layer-count" id="dxf-layer-count"></span></div>
                <input type="text" class="dxf-search" id="dxf-layer-search" placeholder="Filter layers…">
                <div class="dxf-layer-actions">
                    <button class="dxf-btn-link" id="dxf-show-all">Show all</button>
                    <button class="dxf-btn-link" id="dxf-hide-all">Hide all</button>
                </div>
                <div class="dxf-layer-list" id="dxf-layer-list"></div>
                <div class="dxf-divider"></div>
                <div class="dxf-section-label">POSITION</div>
                <div class="dxf-row">
                    <button class="dxf-btn dxf-btn-ghost" id="dxf-center-btn" style="width:100%">Centre at Origin</button>
                </div>
                <div class="dxf-divider"></div>
                <div class="dxf-section-label">AI TRACE <span class="dxf-badge dxf-badge-ai">Phase 2</span></div>
                <div class="dxf-row" style="font-size:11px;color:var(--dxf-text-muted)">
                    Converts selected layers to wall proposals for review.
                </div>
                <div class="dxf-row">
                    <label class="dxf-label" style="font-size:11px">Wall height (m)</label>
                    <input type="number" class="dxf-input-sm" id="dxf-wall-height" value="2.8" min="0.5" max="20" step="0.1">
                </div>
                <button class="dxf-btn dxf-btn-secondary" id="dxf-trace-btn">Trace Walls from CAD</button>
                <div class="dxf-divider"></div>
                <button class="dxf-btn dxf-btn-danger" id="dxf-remove-btn">Remove Overlay</button>
            </div>
        </div>`;

    // ── Event wiring ──────────────────────────────────────────────────────────

    // Close
    panel.querySelector<HTMLButtonElement>('.dxf-close-btn')!
        .addEventListener('click', () => { panel.style.display = 'none'; });

    // File drop zone
    const dropZone = panel.querySelector<HTMLElement>('#dxf-drop-zone')!;
    const fileInput = panel.querySelector<HTMLInputElement>('#dxf-file-input')!;
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dxf-drop-hover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dxf-drop-hover'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('dxf-drop-hover');
        const file = e.dataTransfer?.files[0];
        if (file) handleFileSelected(file, panel);
    });
    fileInput.addEventListener('change', (e: any) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelected(file, panel);
    });

    // Units selector
    panel.querySelector<HTMLSelectElement>('#dxf-units-sel')!
        .addEventListener('change', (e: any) => { state.metersPerUnit = parseFloat(e.target.value); });

    // Opacity slider
    const opacitySlider = panel.querySelector<HTMLInputElement>('#dxf-opacity')!;
    const opacityVal = panel.querySelector<HTMLElement>('#dxf-opacity-val')!;
    opacitySlider.addEventListener('input', () => {
        const val = parseInt(opacitySlider.value) / 100;
        opacityVal.textContent = `${opacitySlider.value}%`;
        _tool?.setOpacity(val);
    });

    // Back button
    panel.querySelector<HTMLButtonElement>('#dxf-back-btn')!
        .addEventListener('click', () => goToStep(1, panel));

    // Place button
    panel.querySelector<HTMLButtonElement>('#dxf-place-btn')!
        .addEventListener('click', () => doPlaceOverlay(panel));

    // Layer search
    panel.querySelector<HTMLInputElement>('#dxf-layer-search')!
        .addEventListener('input', (e: any) => {
            state.layerFilter = e.target.value.toLowerCase();
            renderLayerList(panel);
        });

    // Show/hide all
    panel.querySelector<HTMLButtonElement>('#dxf-show-all')!
        .addEventListener('click', () => { dxfLayerStore.setAllVisible(true); syncLayerVisibility(panel); renderLayerList(panel); });
    panel.querySelector<HTMLButtonElement>('#dxf-hide-all')!
        .addEventListener('click', () => { dxfLayerStore.setAllVisible(false); syncLayerVisibility(panel); renderLayerList(panel); });

    // Centre
    panel.querySelector<HTMLButtonElement>('#dxf-center-btn')!
        .addEventListener('click', () => _tool?.centerAtOrigin());

    // Trace
    panel.querySelector<HTMLButtonElement>('#dxf-trace-btn')!
        .addEventListener('click', () => doTraceWalls(panel));

    // Remove
    panel.querySelector<HTMLButtonElement>('#dxf-remove-btn')!
        .addEventListener('click', () => doRemoveOverlay(panel));

    return panel;
}

// ── Step transitions ──────────────────────────────────────────────────────────

function goToStep(step: 1 | 2 | 3, panel: HTMLElement): void {
    state.step = step;
    panel.querySelectorAll<HTMLElement>('.dxf-step').forEach(el => el.classList.remove('dxf-step-active'));
    if (step === 1) panel.querySelector<HTMLElement>('.dxf-step-1')!.classList.add('dxf-step-active');
    if (step === 2) panel.querySelector<HTMLElement>('#dxf-step-2')!.classList.add('dxf-step-active');
    if (step === 3) panel.querySelector<HTMLElement>('#dxf-step-3')!.classList.add('dxf-step-active');
}

// ── File selection ────────────────────────────────────────────────────────────

let _pendingFile: File | null = null;

async function handleFileSelected(file: File, panel: HTMLElement): Promise<void> {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'dxf' && ext !== 'dwg') {
        showError('Please select a .dxf or .dwg file.', panel);
        return;
    }
    clearError(panel);
    _pendingFile = file;
    state.fileName = file.name;
    state.isDwg = ext === 'dwg';

    panel.querySelector<HTMLElement>('#dxf-fname')!.textContent = file.name;
    const badge = panel.querySelector<HTMLElement>('#dxf-type-badge')!;
    badge.textContent = state.isDwg ? 'DWG' : 'DXF';
    badge.className = `dxf-badge ${state.isDwg ? 'dxf-badge-dwg' : 'dxf-badge-dxf'}`;

    if (state.isDwg) {
        // Show info that DWG requires server conversion
        badge.textContent = 'DWG → server conversion';
        badge.className = 'dxf-badge dxf-badge-dwg';
    }

    goToStep(2, panel);
}

// ── Place overlay ─────────────────────────────────────────────────────────────

async function doPlaceOverlay(panel: HTMLElement): Promise<void> {
    if (!_pendingFile) return;
    if (!_scene || !_camera || !_domElement) {
        showError('3D scene not available. Open a project first.', panel);
        return;
    }

    setLoading(true, 'Parsing DXF…', panel);

    try {
        let doc;
        if (state.isDwg) {
            setLoading(true, 'Uploading DWG to conversion service…', panel);
            const { convertDwgFile } = await import('@pryzm/file-format');
            doc = await convertDwgFile(_pendingFile, p => setLoading(true, p.message, panel));
        } else {
            doc = await parseDxfFile(_pendingFile);
        }

        // Auto-detect units from $INSUNITS if not unitless
        if (doc.insunits !== 0 && DXF_UNITS_TO_METRES[doc.insunits]) {
            state.metersPerUnit = DXF_UNITS_TO_METRES[doc.insunits];
            // Update select
            const sel = panel.querySelector<HTMLSelectElement>('#dxf-units-sel');
            if (sel) {
                for (const opt of sel.options) {
                    if (Math.abs(parseFloat(opt.value) - state.metersPerUnit) < 1e-9) {
                        opt.selected = true;
                        break;
                    }
                }
            }
        }

        // Get active level elevation
        const bimManager = _getBimManager?.();
        const activeLevel = bimManager?.getActiveLevelData?.();
        const elevation = (activeLevel?.elevation ?? 0) + 0.02;

        // Dispose any previous overlay
        if (_tool) _tool.dispose();
        if (!_tool) {
            _tool = new DxfUnderlayTool(_scene!, _camera!, _domElement!);
        }

        const overlayId = uuidv4();
        state.overlayId = overlayId;

        const sourceText = await _pendingFile.text();
        const overlayState = _tool.create(doc, sourceText, state.fileName, overlayId, state.metersPerUnit, elevation);

        // Auto-center
        _tool.centerAtOrigin();

        // Init layer store
        dxfLayerStore.init(doc.layers, overlayId);

        // Register in DxfOverlayStore (Phase 2)
        const groupPos = overlayState.group.position;
        dxfOverlayStore.register({
            overlayId,
            fileName: state.fileName,
            sourceText,
            metersPerUnit: state.metersPerUnit,
            elevation,
            positionOffset: { x: groupPos.x, z: groupPos.z },
            opacity: 0.85,
            locked: false,
            layers: dxfLayerStore.serialize(),
        });

        // Render layer list
        panel.querySelector<HTMLElement>('#dxf-layer-count')!.textContent =
            `(${dxfLayerStore.size()})`;
        renderLayerList(panel);

        setLoading(false, '', panel);
        goToStep(3, panel);

        toast(`DXF overlay "${state.fileName}" placed successfully`, 'success');

        // Dispatch event so plan view + Import Manager know about the overlay
        window.runtime?.events?.emit('pryzm-dxf-overlay-added', { overlayId, fileName: state.fileName, group: overlayState.group }); // F.events.13

    } catch (err: any) {
        setLoading(false, '', panel);
        const msg = err?.message ?? String(err);
        showError(`Failed to load: ${msg}`, panel);
        console.error('[DxfImportPanel]', err);
    }
}

// ── Layer list rendering ──────────────────────────────────────────────────────

function renderLayerList(panel: HTMLElement): void {
    const container = panel.querySelector<HTMLElement>('#dxf-layer-list')!;
    const layers = dxfLayerStore.getAll();
    const filter = state.layerFilter;

    const filtered = filter
        ? layers.filter(l => l.name.toLowerCase().includes(filter))
        : layers;

    container.innerHTML = filtered.map(l => `
        <div class="dxf-layer-row" data-layer="${escHtml(l.name)}">
            <input type="checkbox" class="dxf-layer-eye" ${l.visible ? 'checked' : ''}>
            <span class="dxf-layer-swatch" style="background:${l.color}"></span>
            <span class="dxf-layer-name" title="${escHtml(l.name)}">${escHtml(l.name)}</span>
        </div>
    `).join('');

    // Wire checkbox events
    container.querySelectorAll<HTMLElement>('.dxf-layer-row').forEach(row => {
        const layerName = row.dataset.layer!;
        const cb = row.querySelector<HTMLInputElement>('.dxf-layer-eye')!;
        cb.addEventListener('change', () => {
            dxfLayerStore.setVisible(layerName, cb.checked);
            _tool?.setLayerVisible(layerName, cb.checked);
            syncOverlayStore();
        });
    });
}

function syncLayerVisibility(_panel: HTMLElement): void {
    if (!_tool) return;
    for (const layer of dxfLayerStore.getAll()) {
        _tool.setLayerVisible(layer.name, layer.visible);
    }
    syncOverlayStore();
}

function syncOverlayStore(): void {
    if (!state.overlayId) return;
    dxfOverlayStore.update(state.overlayId, {
        layers: dxfLayerStore.serialize(),
    });
}

// ── AI Trace ──────────────────────────────────────────────────────────────────

function doTraceWalls(panel: HTMLElement): void {
    if (!_tool?.getState()) {
        toast('No DXF overlay active', 'error');
        return;
    }
    const wallHeight = parseFloat(
        panel.querySelector<HTMLInputElement>('#dxf-wall-height')!.value
    ) || 2.8;

    const bimManager = _getBimManager?.();
    const activeLevel = bimManager?.getActiveLevelData?.();
    const levelId = activeLevel?.id ?? '';

    // Get visible layer names
    const visibleLayers = dxfLayerStore.getAll().filter(l => l.visible).map(l => l.name);
    if (visibleLayers.length === 0) {
        toast('No visible layers to trace from', 'warn');
        return;
    }

    const count = traceDxfToWalls(_tool.getState()!, {
        layerNames: visibleLayers,
        wallHeight,
        wallThickness: 0.2,
        levelId,
    });

    if (count === 0) {
        toast('No eligible line segments found in visible layers', 'warn');
    } else {
        toast(`Generated ${count} wall proposals for review`, 'success');
    }
}

// ── Remove overlay ────────────────────────────────────────────────────────────

function doRemoveOverlay(panel: HTMLElement): void {
    if (_tool) {
        _tool.dispose();
        _tool = null;
    }
    if (state.overlayId) {
        dxfOverlayStore.remove(state.overlayId);
        state.overlayId = null;
    }
    dxfLayerStore.clear();
    _pendingFile = null;
    goToStep(1, panel);
    window.runtime?.events?.emit('pryzm-dxf-overlay-removed', {}); // F.events.13
    toast('DXF overlay removed', 'info');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setLoading(loading: boolean, message: string, panel: HTMLElement): void {
    state.isLoading = loading;
    state.loadingMessage = message;
    const loadEl = panel.querySelector<HTMLElement>('#dxf-loading')!;
    const msgEl  = panel.querySelector<HTMLElement>('#dxf-loading-msg')!;
    const placeBtn = panel.querySelector<HTMLButtonElement>('#dxf-place-btn')!;
    loadEl.style.display  = loading ? 'flex' : 'none';
    msgEl.textContent     = message;
    placeBtn.disabled     = loading;
}

function showError(msg: string, panel: HTMLElement): void {
    state.error = msg;
    const el = panel.querySelector<HTMLElement>('#dxf-error')!;
    el.textContent = msg;
    el.style.display = 'block';
}

function clearError(panel: HTMLElement): void {
    state.error = '';
    const el = panel.querySelector<HTMLElement>('#dxf-error');
    if (el) el.style.display = 'none';
}

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Import Manager event bridge (§32) ─────────────────────────────────────────

window.runtime?.events?.on('pryzm-dxf-overlay-remove', (p: { overlayId?: string }) => { // F.events.13
    if (!_tool) return;
    if (p.overlayId && p.overlayId !== state.overlayId) return;
    _tool.dispose();
    _tool = null;
    if (state.overlayId) {
        dxfOverlayStore.remove(state.overlayId);
        state.overlayId = null;
    }
    dxfLayerStore.clear();
    window.runtime?.events?.emit('pryzm-dxf-overlay-removed', {}); // F.events.13
    console.log('[DxfImportPanel] overlay removed via Import Manager');
});

window.runtime?.events?.on('pryzm-dxf-overlay-set-locked', (d: { overlayId?: string; locked: boolean; noSelect?: boolean }) => { // F.events.13
    if (!_tool) return;
    if (d?.overlayId && d.overlayId !== state.overlayId) return;
    _tool.setLocked(d.locked ?? true);
    console.log('[DxfImportPanel] setLocked', d?.locked, '(noSelect ignored for 2D overlay)');
});

window.runtime?.events?.on('pryzm-dxf-overlay-set-visibility', (d: { overlayId?: string; visible: boolean }) => { // F.events.13
    if (!_tool) return;
    if (d?.overlayId && d.overlayId !== state.overlayId) return;
    const visible = d?.visible ?? true;
    _tool.setOpacity(visible ? 1.0 : 0.0);
    console.log('[DxfImportPanel] setVisibility', visible);
});

// ── Public handle for project restore (Phase 2) ───────────────────────────────

/**
 * Restore a DXF overlay from project snapshot.
 * Called by ProjectLoader after scene is ready.
 */
export async function restoreDxfOverlay(
    overlayId: string,
    sourceText: string,
    fileName: string,
    metersPerUnit: number,
    elevation: number,
    positionOffset: { x: number; z: number },
    opacity: number,
    layers: Array<{ name: string; visible: boolean; color: string; linewidth: number }>,
    scene: THREE.Scene,
    camera: THREE.Camera,
    domElement: HTMLElement,
): Promise<void> {
    if (!scene || !camera || !domElement) return;
    try {
        const doc = await parseDxfString(sourceText);
        const tool = new DxfUnderlayTool(scene, camera, domElement);
        const overlayState = tool.create(doc, sourceText, fileName, overlayId, metersPerUnit, elevation);
        overlayState.group.position.set(positionOffset.x, elevation, positionOffset.z);
        tool.setOpacity(opacity);

        dxfLayerStore.init(doc.layers, overlayId);
        dxfLayerStore.restore(layers);
        for (const l of layers) {
            tool.setLayerVisible(l.name, l.visible);
        }

        console.log(`[DxfImportPanel] Restored overlay "${overlayId}" from project snapshot`);
    } catch (err) {
        console.warn('[DxfImportPanel] Failed to restore DXF overlay:', err);
    }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function injectDxfStyles(): void {
    if (document.getElementById('dxf-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'dxf-panel-styles';
    style.textContent = `
        :root {
            --dxf-bg: #0f1117;
            --dxf-surface: #1a1d2e;
            --dxf-border: rgba(167,139,250,0.18);
            --dxf-accent: #a78bfa;
            --dxf-text: #e2e8f0;
            --dxf-text-muted: rgba(226,232,240,0.5);
            --dxf-danger: #f87171;
            --dxf-success: #4ade80;
        }
        .dxf-panel {
            position: absolute;
            top: 60px;
            right: 72px;
            width: 280px;
            max-height: calc(100vh - 80px);
            overflow-y: auto;
            background: var(--dxf-bg);
            border: 1px solid var(--dxf-border);
            border-radius: 10px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 12px;
            color: var(--dxf-text);
            z-index: 9500;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .dxf-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            border-bottom: 1px solid var(--dxf-border);
        }
        .dxf-title {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            color: var(--dxf-accent);
        }
        .dxf-close-btn {
            background: none;
            border: none;
            color: var(--dxf-text-muted);
            cursor: pointer;
            font-size: 14px;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .dxf-close-btn:hover { background: rgba(255,255,255,0.08); color: var(--dxf-text); }
        .dxf-body { padding: 12px; }
        .dxf-step { display: none; }
        .dxf-step-active { display: block; }
        .dxf-section-label {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            color: var(--dxf-text-muted);
            margin-bottom: 8px;
            margin-top: 4px;
        }
        .dxf-file-drop-zone {
            border: 1.5px dashed var(--dxf-border);
            border-radius: 8px;
            padding: 20px 12px;
            text-align: center;
            cursor: pointer;
            transition: border-color 150ms, background 150ms;
        }
        .dxf-file-drop-zone:hover,
        .dxf-drop-hover {
            border-color: var(--dxf-accent);
            background: rgba(167,139,250,0.06);
        }
        .dxf-drop-icon { font-size: 28px; margin-bottom: 6px; }
        .dxf-drop-text { font-size: 13px; font-weight: 500; color: var(--dxf-text); }
        .dxf-drop-sub  { font-size: 11px; color: var(--dxf-text-muted); margin-top: 2px; }
        .dxf-error-msg {
            margin-top: 8px;
            padding: 6px 8px;
            background: rgba(248,113,113,0.12);
            border: 1px solid rgba(248,113,113,0.3);
            border-radius: 6px;
            color: var(--dxf-danger);
            font-size: 11px;
        }
        .dxf-file-info {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 10px;
            padding: 6px 8px;
            background: var(--dxf-surface);
            border-radius: 6px;
        }
        .dxf-filename {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 11px;
        }
        .dxf-badge {
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.04em;
            flex-shrink: 0;
        }
        .dxf-badge-dxf { background: rgba(167,139,250,0.18); color: var(--dxf-accent); }
        .dxf-badge-dwg { background: rgba(251,191,36,0.18);  color: #fbbf24; }
        .dxf-badge-ai  { background: rgba(74,222,128,0.15);  color: var(--dxf-success); }
        .dxf-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .dxf-label { min-width: 80px; color: var(--dxf-text-muted); }
        .dxf-select, .dxf-input-sm {
            flex: 1;
            background: var(--dxf-surface);
            border: 1px solid var(--dxf-border);
            border-radius: 5px;
            color: var(--dxf-text);
            font-size: 11px;
            padding: 4px 6px;
            outline: none;
        }
        .dxf-slider { flex: 1; accent-color: var(--dxf-accent); }
        .dxf-val { min-width: 32px; text-align: right; color: var(--dxf-text-muted); }
        .dxf-loading {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 0;
            font-size: 11px;
            color: var(--dxf-text-muted);
        }
        .dxf-spinner {
            width: 14px; height: 14px;
            border: 2px solid var(--dxf-border);
            border-top-color: var(--dxf-accent);
            border-radius: 50%;
            animation: dxf-spin 0.8s linear infinite;
            flex-shrink: 0;
        }
        @keyframes dxf-spin { to { transform: rotate(360deg); } }
        .dxf-btn {
            width: 100%;
            padding: 7px 12px;
            border-radius: 6px;
            border: none;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            margin-bottom: 6px;
            transition: opacity 120ms;
        }
        .dxf-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .dxf-btn-primary {
            background: var(--dxf-accent);
            color: #0f1117;
        }
        .dxf-btn-primary:hover:not(:disabled) { opacity: 0.88; }
        .dxf-btn-ghost {
            background: transparent;
            color: var(--dxf-text-muted);
            border: 1px solid var(--dxf-border);
        }
        .dxf-btn-ghost:hover { background: rgba(255,255,255,0.05); color: var(--dxf-text); }
        .dxf-btn-secondary {
            background: rgba(167,139,250,0.12);
            color: var(--dxf-accent);
            border: 1px solid rgba(167,139,250,0.25);
        }
        .dxf-btn-secondary:hover { background: rgba(167,139,250,0.2); }
        .dxf-btn-danger {
            background: rgba(248,113,113,0.1);
            color: var(--dxf-danger);
            border: 1px solid rgba(248,113,113,0.25);
        }
        .dxf-btn-danger:hover { background: rgba(248,113,113,0.18); }
        .dxf-btn-link {
            background: none;
            border: none;
            color: var(--dxf-accent);
            font-size: 11px;
            cursor: pointer;
            padding: 0;
        }
        .dxf-btn-link:hover { text-decoration: underline; }
        .dxf-search {
            width: 100%;
            box-sizing: border-box;
            background: var(--dxf-surface);
            border: 1px solid var(--dxf-border);
            border-radius: 5px;
            color: var(--dxf-text);
            font-size: 11px;
            padding: 5px 8px;
            margin-bottom: 6px;
            outline: none;
        }
        .dxf-layer-actions {
            display: flex;
            gap: 10px;
            margin-bottom: 6px;
        }
        .dxf-layer-list {
            max-height: 180px;
            overflow-y: auto;
            border: 1px solid var(--dxf-border);
            border-radius: 6px;
            margin-bottom: 10px;
        }
        .dxf-layer-row {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 5px 8px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            transition: background 80ms;
        }
        .dxf-layer-row:last-child { border-bottom: none; }
        .dxf-layer-row:hover { background: rgba(255,255,255,0.04); }
        .dxf-layer-eye { accent-color: var(--dxf-accent); cursor: pointer; }
        .dxf-layer-swatch {
            width: 10px; height: 10px;
            border-radius: 2px;
            flex-shrink: 0;
        }
        .dxf-layer-name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 11px;
        }
        .dxf-layer-count {
            font-size: 10px;
            font-weight: 400;
            color: var(--dxf-text-muted);
        }
        .dxf-divider {
            height: 1px;
            background: var(--dxf-border);
            margin: 10px 0;
        }
    `;
    document.head.appendChild(style);
}
