import * as OBC from '@thatopen/components';
import * as THREE from '@pryzm/renderer-three/three';
import { createAIPanel, AI_PANEL_ID } from '../ai/AIPanel';
import { createAICreatePanel } from '../ai/AICreatePanel';
import { installApartmentLayoutConsoleTrigger } from '../apartment-layout/apartmentLayoutTrigger';
import { installHouseLayoutConsoleTrigger } from '../house-layout/houseLayoutTrigger';
import { installResidentialBuildingConsoleTrigger } from '../residential-building/residentialBuildingTrigger';
import { installOfficeBuildingConsoleTrigger } from '../office-building/officeBuildingTrigger';
// §OFFICE-ARCH-FURNISH-SPLIT — Command 2 console command `pryzmFurnishOffice()` (furnish the
// last-built office architecture; mirrors installFurnishLayoutTrigger).
import { installOfficeFurnishConsoleTrigger } from '../office-building/officeFurnishTrigger';
import { installDesignParamsConsoleTrigger } from '../apartment-layout/DesignParamsPanel';
import { installFurnishLayoutTrigger } from '../furnish-layout/furnishLayoutTrigger';
import { installLightingLayoutTrigger } from '../lighting-layout/lightingLayoutTrigger';
import { installCeilingLayoutTrigger } from '../ceiling-layout/ceilingLayoutTrigger';
import { installFloorLayoutTrigger } from '../floor-layout/floorLayoutTrigger';
import { installDaylightConsole } from '../daylight/daylightConsole';
import { installSunHoursConsole } from '../daylight/sunHoursConsole';
import { installSolarPanelConsole } from '../daylight/SolarSunHoursPanel';
import { installLiveGraphWiring } from './installLiveGraphWiring';
import { installDevTestFunctions } from './installDevTestFunctions';
import { createFloorPlanImportPanel } from '../ai/FloorPlanImportPanel';
import { createDxfImportPanel } from '../import/DxfImportPanel';
import { createSpatialTree } from '../SpatialTree';
import { panelManager } from '../PanelManager';
import { OwnerFeatureFlags } from '../OwnerFeatureFlags';
import type { UIProps } from '../Layout';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export interface DxfSceneRefs {
    scene: THREE.Scene;
    camera: THREE.Camera;
    domElement: HTMLElement;
    obcCamera: OBC.OrthoPerspectiveCamera;
}

export interface AIResult {
    aiPanel: any;
    spatialTree: any;
    aiCreatePanel: any;
    floorPlanImportPanel: any;
    dxfImportPanel: HTMLElement;
    dxfSceneRefs: DxfSceneRefs;
    toggleAIPanel: () => void;
    toggleSpatialTree: () => void;
    toggleAICreatePanel: () => void;
    toggleFloorPlanPanel: () => void;
    toggleDxfPanel: () => void;
}

// ── AI Panel width persistence ─────────────────────────────────────────────────
const AI_WIDTH_KEY = 'pryzm-ai-panel-width';
const AI_DEFAULT_W = 256; // 80% of the previous 320px default
const AI_MIN_W     = 180;
const AI_MAX_W     = 560;

function _aiLoadWidth(): number {
    try {
        const s = localStorage.getItem(AI_WIDTH_KEY);
        if (s) { const n = parseInt(s, 10); if (!isNaN(n) && n >= AI_MIN_W && n <= AI_MAX_W) return n; }
    } catch { /* ignore storage errors */ }
    return AI_DEFAULT_W;
}

function _aiSaveWidth(w: number): void {
    try { localStorage.setItem(AI_WIDTH_KEY, String(Math.round(w))); } catch { /* ignore */ }
}

// -- AI Panel HEIGHT persistence (founder 2026-08-10, round 2) ---------------
// The first-line launcher docked the panel down the WHOLE left column
// (bottom: 12px, max-height: none). The founder asked for HALF height by
// default and for the panel to be freely sizeable/movable, so height becomes a
// first-class, persisted dimension like width: an explicit pixel height (never
// top+bottom anchoring, which no drag can express) defaulting to half the
// viewport, resizable from the bottom-right corner, remembered per browser.
const AI_HEIGHT_KEY = 'pryzm-ai-panel-height';
const AI_MIN_H      = 220;
/** Half the viewport, bounded - the founder's "by default half size". */
function _aiDefaultHeight(): number {
    return Math.max(AI_MIN_H, Math.round(window.innerHeight * 0.5));
}
function _aiMaxHeight(): number {
    return Math.max(AI_MIN_H, window.innerHeight - 24);
}
function _aiLoadHeight(): number {
    try {
        const s = localStorage.getItem(AI_HEIGHT_KEY);
        if (s) {
            const n = parseInt(s, 10);
            if (!isNaN(n) && n >= AI_MIN_H) return Math.min(n, _aiMaxHeight());
        }
    } catch { /* ignore storage errors */ }
    return _aiDefaultHeight();
}
function _aiSaveHeight(h: number): void {
    try { localStorage.setItem(AI_HEIGHT_KEY, String(Math.round(h))); } catch { /* ignore */ }
}

/**
 * Bottom-right CORNER resize - width AND height in one gesture (the shape users
 * expect from a floating panel). The left-edge handle keeps width-only resizing
 * for the docked case; this one owns the founder's "sizeable" ask.
 *
 * Both dimensions are written as explicit pixels and persisted, so a reload
 * restores exactly what the user left - and `bottom` is released to `auto` so
 * the height the user chose is the height that survives.
 */
function _attachCornerResize(handle: HTMLElement, container: HTMLElement): void {
    let dragging = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;

    const onMouseMove = (e: MouseEvent): void => {
        if (!dragging) return;
        const w = Math.max(AI_MIN_W, Math.min(AI_MAX_W, startW + (e.clientX - startX)));
        const h = Math.max(AI_MIN_H, Math.min(_aiMaxHeight(), startH + (e.clientY - startY)));
        container.style.width  = `${w}px`;
        container.style.height = `${h}px`;
    };
    const onMouseUp = (): void => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        _aiSaveWidth(container.offsetWidth);
        _aiSaveHeight(container.offsetHeight);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    handle.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();          // never start a drag-to-move at the same time
        container.style.bottom = 'auto';
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startW = container.offsetWidth; startH = container.offsetHeight;
        document.body.style.cursor = 'nwse-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

/**
 * Founder request 2026-08-10 — the AI panel is now FIRST-LINE: its default
 * dock is the LEFT column, flush next to the left icon rail (vb-panel /
 * pb-container) and top-aligned with the rail (i.e. directly under the
 * header). Returns the {left, top} the panel should open at.
 * Falls back to a 52px rail + typical header height if the rail is not yet
 * in the DOM.
 */
function _getLeftRailDock(margin: number): { left: number; top: number } {
    const rail = (
        document.querySelector('.vb-panel') ??
        document.querySelector('.pb-container')
    ) as HTMLElement | null;
    if (rail) {
        const rect = rail.getBoundingClientRect();
        return { left: rect.right + margin, top: Math.max(0, rect.top) };
    }
    // Fallback: left rail spine is ~52px wide; header ~48px tall.
    return { left: 52 + margin, top: 48 + margin };
}

/**
 * Attach a left-edge width-resize handle to a floating panel.
 * Mirrors the RailPanelController._attachResizeDrag() pattern:
 *   - col-resize cursor on body while dragging
 *   - userSelect disabled during drag
 *   - width clamped to [AI_MIN_W, AI_MAX_W]
 *   - right edge stays anchored (left position adjusts in tandem)
 *   - final width persisted to localStorage on mouseup
 */
function _attachWidthResize(handle: HTMLElement, container: HTMLElement): void {
    let dragging  = false;
    let startX    = 0;
    let startW    = 0;
    let startLeft = 0;

    const onMouseMove = (e: MouseEvent): void => {
        if (!dragging) return;
        // Dragging the LEFT edge: moving cursor left widens the panel.
        const delta  = startX - e.clientX;
        const newW   = Math.min(AI_MAX_W, Math.max(AI_MIN_W, startW + delta));
        // Keep right edge anchored — shift left position accordingly.
        const newLeft = Math.max(0, startLeft - (newW - startW));
        container.style.width = `${newW}px`;
        container.style.left  = `${newLeft}px`;
    };

    const onMouseUp = (): void => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor     = '';
        document.body.style.userSelect = '';
        _aiSaveWidth(container.offsetWidth);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        dragging  = true;
        startX    = e.clientX;
        startW    = container.offsetWidth;
        startLeft = rect.left;
        document.body.style.cursor     = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup',   onMouseUp);
    });
}

/**
 * Make a floating panel element draggable by its designated handle.
 * Converts from CSS `bottom/left` offsets to explicit `top/left` on first drag
 * so the panel tracks the pointer precisely regardless of initial positioning.
 * Clamped to the viewport so the panel cannot be dragged fully off-screen.
 */
function makeDraggable(container: HTMLElement, handle: HTMLElement): void {
    let dragging   = false;
    let startX     = 0;
    let startY     = 0;
    let startLeft  = 0;
    let startTop   = 0;

    const onMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        // Convert bottom/left to top/left once so subsequent moves are simple.
        // Freeze the current height too — when the panel is column-docked its
        // height comes from top+bottom anchoring, which `bottom: auto` would
        // otherwise collapse mid-drag.
        const rect = container.getBoundingClientRect();
        container.style.left   = `${rect.left}px`;
        container.style.top    = `${rect.top}px`;
        container.style.height = `${rect.height}px`;
        container.style.bottom = 'auto';
        container.style.right  = 'auto';

        dragging  = true;
        startX    = e.clientX;
        startY    = e.clientY;
        startLeft = rect.left;
        startTop  = rect.top;
        handle.style.cursor = 'grabbing';
        e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent): void => {
        if (!dragging) return;
        const maxLeft = window.innerWidth  - container.offsetWidth  - 4;
        const maxTop  = window.innerHeight - container.offsetHeight - 4;
        container.style.left = `${Math.max(0, Math.min(maxLeft, startLeft + (e.clientX - startX)))}px`;
        container.style.top  = `${Math.max(0, Math.min(maxTop,  startTop  + (e.clientY - startY)))}px`;
    };

    const onMouseUp = (): void => {
        if (!dragging) return;
        dragging = false;
        handle.style.cursor = 'grab';
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

export function mountAIArea(props: UIProps, runtime: PryzmRuntime | null): AIResult {
    // Phase 10: gate AI panel on OwnerFeatureFlags.showAIPanel
    const _aiEnabled = OwnerFeatureFlags.isEnabled('showAIPanel');

    // F.7.1 Wave 14 — runtime.entitlements.check wiring.
    // Phase F stub always returns true (open sentinel); Phase F.7.1 wires the
    // real entitlements adapter once the billing/plan system ships.
    const _aiEntitled = runtime?.entitlements.check('ai') ?? true;
    if (!_aiEntitled) {
        console.debug('[AIAreaLayout] ai entitlement not granted — AI panels will be suppressed (Phase F.7.1 stub: always true)');
    }

    // #51 — register the console command `pryzmGenerateApartmentLayout()` so the
    // apartment-layout generator can be triggered regardless of which AI panel
    // is visible (the UI leaf lives in the AIPanel command tree → Create).
    installApartmentLayoutConsoleTrigger(runtime ?? null);
    // A.21.d–g — Casa Unifamiliar multi-storey HOUSE generator. ADDITIVE: a
    // separate console path (pryzmGenerateHouse / pryzmGenerateHouseFromBoundary)
    // that mints storeys + fans out per-storey rooms + a stair + a stairwell void
    // + a roof. Does NOT touch the apartment single-plate path.
    installHouseLayoutConsoleTrigger(runtime ?? null);
    // P3.3 — Residential building (multi-family) generator. ADDITIVE + GATED:
    // registers `pryzmGenerateResidentialBuilding(opts)` but the feature stays OFF
    // until `globalThis.__PRYZM_RESIDENTIAL_BUILDING__ = true` is set, so it cannot
    // affect existing house/apartment users. Builds a centred core (stair + lift =
    // the vertical-circulation element) + per-floor public corridor + packed
    // apartments, all through the command bus in one undo.
    installResidentialBuildingConsoleTrigger(runtime ?? null);
    // 4th typology — Office building (tower). ADDITIVE + GATED: registers
    // `pryzmGenerateOfficeBuilding(opts)` but the feature stays OFF until
    // `globalThis.__PRYZM_OFFICE_BUILDING__ = true` is set. Generates a circular
    // office floor plate (centred core + concentric desk rings + perimeter offices /
    // collab pods) for a multi-storey tower with department/floor-type variety.
    installOfficeBuildingConsoleTrigger(runtime ?? null);
    // §OFFICE-ARCH-FURNISH-SPLIT (SPEC-OFFICE-GENERATION-ENGINE §1) — Command 2 = Furnish Office.
    // Registers `pryzmFurnishOffice()`, which furnishes the LAST-built office ARCHITECTURE with
    // desks/chairs/reception/collab/cafe WITHOUT regenerating architecture. The AI "Furnish Office"
    // dropdown entry calls the same trigger.
    installOfficeFurnishConsoleTrigger(runtime ?? null);
    // A.25.1 — Living Design Parameters: register `pryzmToggleDesignParams()` so
    // the parameter-sliders panel can be opened from anywhere. Its sliders feed
    // the D-TGL scorer weights (via the activeDesignParams stash) and debounce a
    // live re-generate through the SAME apartment-layout trigger above.
    installDesignParamsConsoleTrigger(runtime ?? null);
    // PRODUCTION — UBG graph wiring (provideLiveGraphSources → `violates`
    // projection, `window.pryzmBuildBuildingGraph()` hook, Building-Graph +
    // Living-Graph overlays). Unconditional: these are user-facing
    // capabilities, NOT dev tooling. See ./installLiveGraphWiring.ts.
    installLiveGraphWiring();
    // DEV-ONLY (C74-class guard, 2026-08-14) — the `window.__pryzm*` DevTools
    // test helpers (Family Platform pipeline + apartment validator framework).
    // Previously installed UNCONDITIONALLY here, so a self-declared dev-only
    // module (`src/dev/`) executed in the shipped editor. Canonical guard per
    // engineLauncher.ts / window-shim.ts Pattern D; dynamic import inside the
    // seam keeps `src/dev/` out of the production chunk graph.
    if (import.meta.env.DEV) {
        void installDevTestFunctions(true);
    }
    // #54 — register the D-CE ceiling-layout trigger:
    //   • console command `pryzmCeilAllRooms()` (manual test)
    //   • auto-fire on `apartment.layout-executed` (continuous flow:
    //     apartment generate → walls/doors → redetect rooms → CEIL →
    //     furnish → light). Install BEFORE the furnish trigger so the
    //     `apartment.layout-executed` listeners run in registration order
    //     (ceiling first, even though both ultimately defer one tick).
    installCeilingLayoutTrigger(runtime ?? null);
    // Floor finishes — SPEC-SEMANTIC §10 prompt #34 (CreateFloorsByRoomType):
    //   • console command `pryzmFloorAllRooms()` (manual test)
    //   • auto-fire on `apartment.layout-executed` in parallel with CEIL
    //     (neither depends on the other). Reads `room.occupancyType` →
    //     timber in living/bedroom, tile in kitchen/bathroom. One undo unit.
    installFloorLayoutTrigger(runtime ?? null);
    // #52 — register the D-FLE furniture-layout trigger:
    //   • console command `pryzmFurnishAllRooms()` (manual test)
    //   • auto-fire on `ceiling.layout-executed` (continuous flow:
    //     ceiling → auto-furnish every room with an archetype). Idempotent.
    installFurnishLayoutTrigger(runtime ?? null);
    // #53 — register the D-LE lighting-layout trigger:
    //   • console command `pryzmLightAllRooms()` (manual test)
    //   • auto-fire on `furnish.layout-executed` (continuous flow:
    //     furnish → auto-light every room with a ceiling fixture per
    //     occupancy archetype). The full pipeline now reads:
    //       apartment generate → walls/doors → redetect rooms →
    //       CEIL → furnish → LIGHT.
    installLightingLayoutTrigger(runtime ?? null);
    // §27 / §61 — register the read-only daylight console command
    // `pryzmComputeDaylight()`. Reads the live room + wall stores, scores
    // per-room daylight via the OFFLINE analytic pass (@pryzm/ai-host daylight),
    // and logs a §DIAG-DAYLIGHT table. NEVER mutates a store (a metric, not a
    // placement) — so it carries no runtime + no auto-fire chain.
    installDaylightConsole();

    // ADR-0074 P1b (C21 §10) — register the read-only sun-hours console command
    // `pryzmComputeSunHours()` (+ `pryzmClearSunHours()`). Runs the renderer-three
    // CPU-raycast solar pass over the active level's roof/slab + wall meshes and
    // paints a TOGGLEABLE heatmap. ADDITIVE + ISOLATED — never touches the normal
    // render path; reuses @pryzm/solar-analysis for the sun math + accumulation.
    installSunHoursConsole();

    // ADR-0074 P1b (C21 §10) — register the Solar — Sun Hours visual control panel
    // opener `pryzmOpenSolarPanel()`. The panel drives the SAME compute seam above;
    // it is the on-screen UI (time/day sliders, season presets, lat, exterior/glass
    // toggles, AVG/MAX/MIN chips, ramp legend) closing the ThatOpen-demo gap.
    installSolarPanelConsole();

    // Phase B.31 (S73-WIRE) — thread the composed runtime so AIPanel can reach
    // typed slots (runtime.ai.streamCompletion / runtime.persistence.proposals)
    // once C-phase lands. `runtime ?? null` preserves the legacy boot path.
    const aiPanel = _aiEnabled ? createAIPanel(runtime ?? null) : null;
    const aiPanelId = 'ai-panel-container';

    // Phase B.14 (S73-WIRE) — thread the composed runtime into the spatial
    // tree factory so its window-cast reaches (selectionManager → D.13,
    // ifcModelStore → E.ifc.S, etc.) can be migrated in their named phases
    // without re-touching the call site. `runtime ?? null` preserves the
    // legacy boot path where `createMainLayout` is invoked without runtime.
    const spatialTree = createSpatialTree(runtime ?? null);

    // Phase B.32-B.33 (S73-WIRE) — thread runtime to AICreatePanel and
    // FloorPlanImportPanel so their persistence/AI window-casts can be
    // collapsed onto runtime slots in C.3.x without re-touching call sites.
    const aiCreatePanel = _aiEnabled ? createAICreatePanel(runtime ?? null) : null;
    // Created unconditionally — file picker and underlay (steps 1-2) work without AI.
    // AI analysis steps are gracefully disabled when the AI service is unavailable.
    const floorPlanImportPanel = createFloorPlanImportPanel(runtime ?? null);

    // ── DXF/DWG Import Panel (§31 Phase 1-3) ────────────────────────────────
    // Created unconditionally — does not require AI feature flag.
    // Scene/camera/domElement resolved here once so DxfUnderlayTool can register listeners.
    const _dxfScene     = (props.world.scene as any).three as THREE.Scene;
    const _dxfDomEl     = props.world.renderer!.three.domElement as HTMLElement;
    const _dxfObcCamera = props.world.camera as OBC.OrthoPerspectiveCamera;
    const dxfImportPanel = createDxfImportPanel({
        scene:      _dxfScene,
        camera:     (_dxfObcCamera as any).three as THREE.Camera,
        domElement: _dxfDomEl,
        getBimManager: () => window.__bimManager ?? null, // TODO(D.4): legacy __bimManager — replace with runtime.scene.renderer once EngineBootstrap split lands
    }, runtime ?? null /* Phase A.6 close — forward runtime so DxfImportPanel toasts route through runtime.toasts.show(...) */);

    // ── Register floating panels with PanelManager ───────────────────────────
    // Registration is lazy (DOM-based) so it works even before the elements
    // are mounted. Each close callback hides the panel element by ID.
    if (_aiEnabled) {
        panelManager.register(AI_PANEL_ID,        () => { const el = document.getElementById(aiPanelId); if (el) el.style.display = 'none'; });
        panelManager.register('panel:ai-create', () => { const el = document.getElementById('ai-create-panel-container'); if (el) el.style.display = 'none'; });
    }
    // fp-import panel is always registered — created unconditionally above.
    panelManager.register('panel:fp-import', () => { const el = document.getElementById('fp-import-panel-container'); if (el) el.style.display = 'none'; });
    panelManager.register('panel:dxf-import', () => { dxfImportPanel.style.display = 'none'; });
    panelManager.register('panel:spatial',   () => { const el = document.getElementById('spatial-tree-container-wrapper'); if (el) el.style.display = 'none'; });

    const toggleAIPanel = () => {
        if (!_aiEnabled) { console.log('[Layout] AI panel disabled by owner feature flag.'); return; }
        const panel = document.getElementById(aiPanelId);
        if (panel) {
            const isHidden = panel.style.display === 'none';
            if (isHidden) {
                panelManager.notifyOpened(AI_PANEL_ID);
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
                panelManager.notifyClosed(AI_PANEL_ID);
            }
        }
    };

    // Founder request 2026-08-10 (first-line AI chat, non-intrusive): Esc closes
    // the AI panel when it is open. Registered once at mount; checks the inline
    // display flag (open = 'flex') so it never fights hidden/unmounted states.
    // Modal-owned Escape handlers (e.g. AIPanel's cancel flow) stopPropagation
    // or run their own keydown listeners independently, so this stays additive.
    if (_aiEnabled) {
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const panel = document.getElementById(aiPanelId);
            if (panel && panel.style.display === 'flex') {
                panel.style.display = 'none';
                panelManager.notifyClosed(AI_PANEL_ID);
            }
        });
    }

    const toggleSpatialTree = () => {
        const tree = document.getElementById('spatial-tree-container-wrapper');
        if (tree) {
            const isHidden = tree.style.display === 'none';
            if (isHidden) {
                panelManager.notifyOpened('panel:spatial');
                tree.style.display = 'flex';
                window.runtime?.events?.emit('model-updated', {}); // F.events.8
            } else {
                tree.style.display = 'none';
                panelManager.notifyClosed('panel:spatial');
            }
        }
    };

    const toggleAICreatePanel = () => {
        const panel = document.getElementById('ai-create-panel-container');
        if (panel) {
            const isHidden = panel.style.display === 'none';
            if (isHidden) {
                panelManager.notifyOpened('panel:ai-create');
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
                panelManager.notifyClosed('panel:ai-create');
            }
        }
    };

    const toggleFloorPlanPanel = () => {
        const panel = document.getElementById('fp-import-panel-container');
        if (!panel) {
            console.warn('[AIAreaLayout] toggleFloorPlanPanel: #fp-import-panel-container not in DOM — PDF/Image import panel not mounted');
            return;
        }
        // §IMPORT-PDF-TOGGLE (2026-05-22): use COMPUTED display, not inline
        // `panel.style.display`. The panel starts hidden via CSS / empty inline
        // style, so `style.display === 'none'` was FALSE on the first click →
        // the toggle ran the else-branch and hid an already-hidden panel (no
        // visible effect; a second click was needed). Reported as "Import
        // PDF/Image doesn't get triggered". The DXF toggle below already handled
        // the empty case; this brings the floor-plan toggle to parity (and is
        // more robust — getComputedStyle also catches class-based hiding).
        const isHidden = getComputedStyle(panel).display === 'none';
        if (isHidden) {
            panelManager.notifyOpened('panel:fp-import');
            panel.style.display = 'flex';
        } else {
            panel.style.display = 'none';
            panelManager.notifyClosed('panel:fp-import');
        }
    };
    // Expose globally so ExportRailPanel (and any future caller) can open the panel
    // without importing Layout.ts directly (avoids circular dep).
    window.toggleFloorPlanPanel = toggleFloorPlanPanel; // TODO(F.6.5): legacy toggleFloorPlanPanel bridge — replace with runtime.plugins.contributions('panel.toggle') registry

    const toggleDxfPanel = () => {
        const isHidden = dxfImportPanel.style.display === 'none' || !dxfImportPanel.style.display;
        if (isHidden) {
            panelManager.notifyOpened('panel:dxf-import');
            dxfImportPanel.style.display = 'block';
        } else {
            dxfImportPanel.style.display = 'none';
            panelManager.notifyClosed('panel:dxf-import');
        }
    };
    window.toggleDxfPanel = toggleDxfPanel; // TODO(F.6.5): legacy toggleDxfPanel bridge — replace with runtime.plugins.contributions('panel.toggle') registry

    // Respond to AI panel tab-switch request from AICreatePanel step 4
    window.runtime?.events?.on('ai-switch-tab', (e: { tab: string }) => { // F.events.12
        if (e?.tab === 'actions') {
            // The setTab function is scoped inside createAIPanel; trigger via DOM
            // by clicking the Actions tab button (4th .ai-tab-btn)
            const tabBtns = document.querySelectorAll('.ai-tab-btn');
            if (tabBtns[3]) (tabBtns[3] as HTMLElement).click();
        }
    });

    // ── Wire draggable + resizable behaviour on AI panel ────────────────────
    // The BUI template renders asynchronously, so we wait for the DOM to settle
    // before querying the container, setting its initial position/width, and
    // attaching the drag-to-move and left-edge drag-to-resize handles.
    if (_aiEnabled) {
        setTimeout(() => {
            const container = document.getElementById(aiPanelId);
            if (!container) return;

            // 1. Apply persisted (or default) width — 80% of the original 320px
            const w = _aiLoadWidth();
            container.style.width = `${w}px`;

            // 2. Set default position — founder request 2026-08-10 (first-line
            //    AI chat): dock LEFT, flush next to the left icon rail and
            //    top-aligned with it (under the header), occupying the left
            //    column. Overrides the CSS `left: 224px` / `bottom: 12px`
            //    defaults; drag-to-move still lets users float it anywhere.
            const margin = 8; // px gap between the icon rail and the panel
            const dock   = _getLeftRailDock(margin);
            const initLeft = dock.left;
            const h = _aiLoadHeight();              // founder: HALF the viewport by default
            container.style.left   = `${initLeft}px`;
            container.style.top    = `${dock.top}px`;
            // Explicit height (not top+bottom anchoring): the panel is a freely
            // sizeable floating window, and only an explicit height survives a
            // move. `bottom: auto` releases the old full-column stretch.
            container.style.bottom = 'auto';
            container.style.height = `${h}px`;
            container.style.maxHeight = 'none';     // the user's height is the height

            // 3. Wire drag-to-move (header as handle)
            const dragHandle = container.querySelector('.ai-chat-header') as HTMLElement | null;
            if (dragHandle) makeDraggable(container, dragHandle);

            // 4. Add left-edge resize handle and wire width-resize
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'ai-resize-handle';
            resizeHandle.title     = 'Drag to resize width';
            container.appendChild(resizeHandle);
            _attachWidthResize(resizeHandle, container);

            // 5. Bottom-right CORNER handle - width + height in one gesture.
            const cornerHandle = document.createElement('div');
            cornerHandle.className = 'ai-resize-corner';
            cornerHandle.title     = 'Drag to resize';
            container.appendChild(cornerHandle);
            _attachCornerResize(cornerHandle, container);

            console.log('[AIAreaLayout] AI panel drag + resize wired. width=%dpx height=%dpx left=%dpx top=%dpx (left-docked, corner-resizable)', w, h, initLeft, dock.top);
        }, 800);
    }

    return {
        aiPanel,
        spatialTree,
        aiCreatePanel,
        floorPlanImportPanel,
        dxfImportPanel,
        dxfSceneRefs: {
            scene: _dxfScene,
            camera: (_dxfObcCamera as any).three as THREE.Camera,
            domElement: _dxfDomEl,
            obcCamera: _dxfObcCamera,
        },
        toggleAIPanel,
        toggleSpatialTree,
        toggleAICreatePanel,
        toggleFloorPlanPanel,
        toggleDxfPanel,
    };
}
