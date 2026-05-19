/**
 * PropertyPanel
 *
 * Schema-driven, AI-ready generic property panel for all BIM element types.
 *
 * Architecture:
 *  - Header  : persistent — element type, mark (editable), ID (copy), spatial summary, type selector
 *  - Section 1: Identity        (id, type, mark, tags, description)
 *  - Section 2: Spatial Context (placement fields, dynamic per element type)
 *  - Section 3: Definition Props (material, thickness, fire rating, …)
 *  - Section 4: Instance Props   (height, base offset, rotation, …)
 *  - Section 5: Relationships    (hosted by / hosts / connected to)
 *  - Section 6: Metadata         (IFC class, GlobalId, status, phase)
 *
 * Editing contract:
 *  1. User edits input → stored in editingDraft (no store mutation)
 *  2. User presses Apply → UpdateElementParameterCommand executed via commandManager
 *  3. Command updates store → StoreEventBus → Builder → Three.js scene
 *
 * Contract compliance:
 *  - §01 CORE: Mutations via commands only
 *  - §01-1.1: This class lives in the Tool Layer
 *  - §03: Reads from semantic model; never writes directly
 *
 * Usage:
 *   const panel = new PropertyPanel();
 *   document.body.appendChild(panel.element);
 *   panel.showElement(threeObject);
 *   panel.hide();
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { normalizeType } from './PropertyDescriptorGenerator';
import { PropertyPanelState } from './types';
import { buildCurtainSubElementPanel } from './CurtainSubElementPanel';
import { CurtainSubElement } from '@pryzm/geometry-curtain-wall';
import { PANEL_STYLES } from './PropertyPanelTheme';
import { panelManager } from '../PanelManager';
import { appendRoomPropertySection } from '../property-inspector/RoomPropertySection';
import { ViewPropertiesSection } from './ViewPropertiesSection';
import { AnnotationElement } from '@pryzm/plugin-annotations';
import {
    PreDrawPanelHost,
    showWallPreDraw as _showWallPreDraw,
    showSlabPreDraw as _showSlabPreDraw,
    showDoorPreDraw as _showDoorPreDraw,
    showPlumbingPreDraw as _showPlumbingPreDraw,
    showWindowPreDraw as _showWindowPreDraw,
    showCeilingPreDraw as _showCeilingPreDraw,
    showFloorPreDraw as _showFloorPreDraw,
    showCurtainWallPreDraw as _showCurtainWallPreDraw,
} from './PropertyPanelPreDraw';
import {
    AnnotationPanelHost,
    showLinearDimension as _showLinearDimension,
    showGrid as _showGrid,
} from './PropertyPanelAnnotations';
import { _enrichFromStores } from './PropertyPanelStoreEnricher';
import {
    ElementRenderHost,
    _renderUnderlayPanel as _renderUnderlayPanelFn,
    _renderIfcElement as _renderIfcElementFn,
} from './PropertyPanelElementRenderers';
import {
    BodyRendererHost,
    ElementRenderRefs,
    _renderElementToContainer,
    _buildElementHeader,
} from './PropertyPanelBodyRenderer';

export class PropertyPanel {
    readonly element: HTMLDivElement;

    private state: PropertyPanelState = {
        selectedElementId: null,
        selectedElementType: null,
        editingDraft: {},
        validationErrors: {},
    };

    private draft = new Map<string, any>();
    private validationErrors = new Map<string, string>();
    private selectedObject: THREE.Object3D | null = null;
    private applyBtn: HTMLButtonElement | null = null;
    private validationBanner: HTMLDivElement | null = null;
    private styleInjected = false;

    private _roofStore: { getById(id: string): any } | null = null;
    private _commandManager: any = null;

    // Pre-draw positioning: when a creation tool is active, the panel is
    // stacked above the bottom action bar instead of sitting in the right rail.
    private _preDrawMode = false;
    private _savedPos: {
        top: string; left: string; right: string; transform: string;
        bottom: string; maxHeight: string; height: string; overflowY: string;
    } | null = null;

    // User-set dimensions (null = use CSS/layout defaults).
    private _userW: number | null = null;
    private _userH: number | null = null;

    setRoofStore(store: { getById(id: string): any }): void {
        this._roofStore = store;
    }

    setCommandManager(cmdMgr: any): void {
        this._commandManager = cmdMgr;
    }

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.element = document.createElement('div');
        this.element.className = 'gpp-panel';
        this.injectStyles();
        panelManager.register('panel:property', () => this.hide());
        this._initPosition();
        this._initSize();
        this._bindRailAlignment();
        this._makeDraggable();
        this._makeResizable();
        window.addEventListener('resize', () => {
            if (
                this.element.style.display === 'block' &&
                !this._preDrawMode &&
                !this.selectedObject &&
                !this.state.selectedElementType
            ) {
                this._positionDefaultViewBelowToolsPanel();
            }
        });
    }

    /**
     * Restores the panel position from localStorage on first load.
     * If no saved position exists the CSS defaults (right: 8px, top: 44px) apply.
     * §05 §8 — only inline style values changed; position:fixed comes from CSS.
     * localStorage key: 'pryzm-pp-pos'
     */
    private _initPosition(): void {
        const saved = localStorage.getItem('bim-pp-pos');
        if (saved) {
            try {
                const { x, y } = JSON.parse(saved) as { x: number; y: number };
                this.element.style.left  = `${x}px`;
                this.element.style.top   = `${y}px`;
                this.element.style.right = 'auto';
            } catch {
                // malformed — ignore, CSS defaults apply
            }
        }
    }

    /**
     * Dynamically aligns the property panel with the right tools rail (tpr-panel)
     * when it opens or closes.  When the rail is open the panel's right edge sits
     * flush against the rail's left edge; when closed it reverts to the CSS default.
     * Contract §05 §8 — only the `right` value is updated; `position` is unchanged.
     */
    private _bindRailAlignment(): void {
        this.element.style.transition = 'right 0.18s ease';
        window.addEventListener('tpr-rail-toggled', (e: Event) => {
            const detail = (e as CustomEvent<{ open: boolean }>).detail;
            if (detail?.open) {
                const tpEl = document.querySelector('.tp-panel') as HTMLElement | null;
                if (tpEl) {
                    const rect       = tpEl.getBoundingClientRect();
                    const tprWidth   = 260;
                    const gapBetween = 8;
                    const gapOuter   = 8;
                    const rightPx    = (window.innerWidth - rect.left + gapBetween) + tprWidth + gapOuter;
                    this.element.style.right = `${rightPx}px`;
                }
            } else {
                this.element.style.right = '';
            }
        });
    }

    private _positionDefaultViewBelowToolsPanel(): void {
        this.element.style.left      = 'auto';
        this.element.style.right     = '12px';
        this.element.style.top       = '324px';
        this.element.style.bottom    = 'auto';
        this.element.style.transform = 'none';
        this.element.style.overflowY = '';

        // Respect user-set dimensions — only apply layout defaults when not manually sized.
        if (this._userW !== null) {
            this.element.style.width = `${this._userW}px`;
        }
        if (this._userH !== null) {
            this.element.style.height    = `${this._userH}px`;
            this.element.style.maxHeight = `${this._userH}px`;
        } else {
            this.element.style.height    = '';
            this.element.style.maxHeight = 'calc(100vh - 336px)';
        }

        const tpEl = document.querySelector('.tp-panel') as HTMLElement | null;
        if (!tpEl) return;

        const rect = tpEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const gap = 8;
        const outerGap = 12;
        const top = Math.max(outerGap, Math.round(rect.bottom + gap));
        const right = Math.max(0, Math.round(window.innerWidth - rect.right));

        this.element.style.top   = `${top}px`;
        this.element.style.right = `${right}px`;
        if (this._userH === null) {
            this.element.style.maxHeight = `calc(100vh - ${top + outerGap}px)`;
        }
    }

    /**
     * Makes the property panel draggable by its header.
     * On first drag the panel switches from right/top to left/top positioning
     * so that dragging is unconstrained. The transition is removed during drag
     * to avoid lag.
     */
    private _makeDraggable(): void {
        let dragging = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        const onMouseMove = (e: MouseEvent) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop  = startTop  + dy;
            // Clamp to viewport
            const panelW = this.element.offsetWidth;
            const panelH = this.element.offsetHeight;
            newLeft = Math.max(0, Math.min(window.innerWidth  - panelW, newLeft));
            newTop  = Math.max(0, Math.min(window.innerHeight - panelH, newTop));
            this.element.style.left  = `${newLeft}px`;
            this.element.style.top   = `${newTop}px`;
        };

        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            this.element.style.transition = 'right 0.18s ease';
            const header = this.element.querySelector('.gpp-header') as HTMLElement | null;
            if (header) header.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (!this._preDrawMode) {
                const rect = this.element.getBoundingClientRect();
                localStorage.setItem('bim-pp-pos', JSON.stringify({ x: rect.left, y: rect.top }));
            }
        };

        // Use event delegation: any gpp-header inside the panel can start drag
        this.element.addEventListener('mousedown', (e: MouseEvent) => {
            const header = (e.target as HTMLElement).closest('.gpp-header') as HTMLElement | null;
            if (!header) return;
            if ((e.target as HTMLElement).closest('.gpp-close-btn')) return;
            // Never intercept interactive form elements — prevents select dropdown from
            // opening and blocks button/input focus when they live inside the header.
            if ((e.target as HTMLElement).closest('select, button, input, textarea, a, label')) return;

            e.preventDefault();

            // Switch to left/top positioning anchored at current visual position
            const rect = this.element.getBoundingClientRect();
            this.element.style.transition = 'none';
            this.element.style.right = 'auto';
            this.element.style.left  = `${rect.left}px`;
            this.element.style.top   = `${rect.top}px`;

            startX    = e.clientX;
            startY    = e.clientY;
            startLeft = rect.left;
            startTop  = rect.top;
            dragging  = true;

            header.style.cursor = 'grabbing';

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup',   onMouseUp);
        });
    }

    /**
     * Restores user-set panel dimensions (width / height) from localStorage on load.
     * Key: 'pryzm-pp-size'  Shape: { w?: number; h?: number }
     */
    private _initSize(): void {
        try {
            const raw = localStorage.getItem('pryzm-pp-size');
            if (!raw) return;
            const { w, h } = JSON.parse(raw) as { w?: number; h?: number };
            const MIN_W = 220; const MAX_W = 560;
            const MIN_H = 160;
            if (w && w >= MIN_W && w <= MAX_W) {
                this._userW = w;
                this.element.style.width = `${w}px`;
            }
            if (h && h >= MIN_H) {
                const clamped = Math.min(h, window.innerHeight * 0.9);
                this._userH = clamped;
                this.element.style.height    = `${clamped}px`;
                this.element.style.maxHeight = `${clamped}px`;
            }
        } catch { /* malformed — ignore */ }
    }

    /** Persist current user-set width / height to localStorage. */
    private _savePanelSize(): void {
        try {
            const obj: { w?: number; h?: number } = {};
            if (this._userW !== null) obj.w = this._userW;
            if (this._userH !== null) obj.h = this._userH;
            localStorage.setItem('pryzm-pp-size', JSON.stringify(obj));
        } catch { /* ignore */ }
    }

    /**
     * Creates two position:fixed resize handles and attaches them to document.body.
     * A rAF loop keeps them aligned with the panel's bounding rect so that the
     * panel's own overflow-y: auto never clips them.
     *
     * Handles are hidden in predraw mode where the panel has auto / unconstrained sizing.
     *
     * Constraints:
     *   Width : 220 – 560 px
     *   Height: 160 px – 90 vh
     */
    private _makeResizable(): void {
        const el = this.element;
        const MIN_W = 220; const MAX_W = 560;
        const MIN_H = 160;

        // ── Create handles ────────────────────────────────────────────────
        const sHandle = document.createElement('div');
        sHandle.className = 'gpp-resize-s';
        document.body.appendChild(sHandle);

        const wHandle = document.createElement('div');
        wHandle.className = 'gpp-resize-w';
        document.body.appendChild(wHandle);

        // ── rAF loop — keep handles pinned to panel edges ─────────────────
        const syncHandles = () => {
            const visible = el.style.display !== 'none' && !this._preDrawMode;
            if (!visible) {
                sHandle.style.display = 'none';
                wHandle.style.display = 'none';
            } else {
                const r = el.getBoundingClientRect();
                // South handle — sits at the very bottom edge of the panel
                sHandle.style.display = 'block';
                sHandle.style.left    = `${r.left + 4}px`;
                sHandle.style.top     = `${r.bottom - 8}px`;
                sHandle.style.width   = `${Math.max(0, r.width - 8)}px`;
                // West handle — full left edge
                wHandle.style.display = 'block';
                wHandle.style.left    = `${r.left}px`;
                wHandle.style.top     = `${r.top + 4}px`;
                wHandle.style.height  = `${Math.max(0, r.height - 8)}px`;
            }
        };
        // D.7.5 batch #3: routed through getFrameScheduler() instead of a
        // self-rescheduling rAF chain. `addTickListener` re-invokes the callback
        // every frame, replacing the inner self-reschedule line and the outer
        // kickoff in a single registration. The returned disposer is discarded
        // to preserve existing semantics — PropertyPanel has no destroy() path
        // today, so the original rAF chain was likewise never cancelled.
        // (TODO: store the disposer once a destroy() lands.)
        getFrameScheduler().addTickListener('property-panel-sync-handles', syncHandles, 'overlay');

        // ── South drag (height) ───────────────────────────────────────────
        let sDragging = false;
        let sStartY   = 0;
        let sStartH   = 0;

        const onSMove = (e: MouseEvent) => {
            if (!sDragging) return;
            const maxH = Math.floor(window.innerHeight * 0.9);
            const newH = Math.min(maxH, Math.max(MIN_H, sStartH + (e.clientY - sStartY)));
            this._userH = newH;
            el.style.height    = `${newH}px`;
            el.style.maxHeight = `${newH}px`;
            el.style.overflowY = 'auto';
        };
        const onSUp = () => {
            if (!sDragging) return;
            sDragging = false;
            sHandle.classList.remove('gpp-resize-s--active');
            document.body.style.cursor    = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onSMove);
            document.removeEventListener('mouseup',   onSUp);
            this._savePanelSize();
        };
        sHandle.addEventListener('mousedown', (e: MouseEvent) => {
            if (this._preDrawMode) return;
            e.preventDefault();
            e.stopPropagation();
            sDragging = true;
            sStartY   = e.clientY;
            sStartH   = el.offsetHeight;
            sHandle.classList.add('gpp-resize-s--active');
            document.body.style.cursor    = 's-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onSMove);
            document.addEventListener('mouseup',   onSUp);
        });

        // ── West drag (width) ─────────────────────────────────────────────
        // Anchors the right edge so the panel grows leftward.
        let wDragging   = false;
        let wStartX     = 0;
        let wStartW     = 0;
        let wRightPx    = 0; // snapshot of window.innerWidth - rect.right

        const onWMove = (e: MouseEvent) => {
            if (!wDragging) return;
            const delta = wStartX - e.clientX; // drag left → positive → wider
            const newW  = Math.min(MAX_W, Math.max(MIN_W, wStartW + delta));
            this._userW = newW;
            el.style.width = `${newW}px`;
            // Keep right edge fixed while growing left
            el.style.right = `${wRightPx}px`;
            el.style.left  = 'auto';
        };
        const onWUp = () => {
            if (!wDragging) return;
            wDragging = false;
            wHandle.classList.remove('gpp-resize-w--active');
            document.body.style.cursor    = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onWMove);
            document.removeEventListener('mouseup',   onWUp);
            this._savePanelSize();
        };
        wHandle.addEventListener('mousedown', (e: MouseEvent) => {
            if (this._preDrawMode) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = el.getBoundingClientRect();
            wDragging = true;
            wStartX   = e.clientX;
            wStartW   = el.offsetWidth;
            wRightPx  = Math.round(window.innerWidth - rect.right);
            // Switch to right-anchoring so width expansion goes left naturally
            el.style.right = `${wRightPx}px`;
            el.style.left  = 'auto';
            wHandle.classList.add('gpp-resize-w--active');
            document.body.style.cursor    = 'ew-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onWMove);
            document.addEventListener('mouseup',   onWUp);
        });
    }

    private _positionWallPreDrawBesideModeBar(): void {
        // Only snapshot position the FIRST time we enter predraw — re-entry (mode
        // switches like S→D) must not overwrite the good pre-predraw saved position.
        if (!this._preDrawMode) {
            this._savedPos = {
                top:       this.element.style.top,
                left:      this.element.style.left,
                right:     this.element.style.right,
                transform: this.element.style.transform,
                bottom:    this.element.style.bottom,
                maxHeight: this.element.style.maxHeight,
                height:    this.element.style.height,
                overflowY: this.element.style.overflowY,
            };
        }
        this._preDrawMode = true;
        this.element.classList.add('gpp-panel--predraw', 'gpp-panel--wall-predraw');
        this.element.style.right     = 'auto';
        this.element.style.bottom    = 'auto';
        this.element.style.transform = 'none';
        this.element.style.height    = 'auto';
        this.element.style.maxHeight = 'none';
        this.element.style.overflowY = 'visible';

        const place = () => {
            if (!this._preDrawMode) return;
            const modeBar = document.querySelector('.wdh-bar') as HTMLElement | null;
            const barRect = modeBar?.getBoundingClientRect();
            const panelRect = this.element.getBoundingClientRect();
            const gap = 12;
            const defaultTop = 68;
            const leftFromMode = barRect ? barRect.right + gap : Math.round((window.innerWidth / 2) + 190);
            const topFromMode = barRect ? barRect.top : defaultTop;
            const maxLeft = Math.max(gap, window.innerWidth - panelRect.width - gap);

            this.element.style.left = `${Math.min(leftFromMode, maxLeft)}px`;
            this.element.style.top  = `${Math.max(gap, topFromMode)}px`;
        };

        // D.7.5 batch #3: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('property-panel-place-pre-draw', place);
    }

    /** Undoes the pre-draw position override and restores the saved position. */
    private _restorePosition(): void {
        if (!this._preDrawMode || !this._savedPos) return;
        this.element.style.top       = this._savedPos.top;
        this.element.style.left      = this._savedPos.left;
        this.element.style.right     = this._savedPos.right;
        this.element.style.transform = this._savedPos.transform;
        this.element.style.bottom    = this._savedPos.bottom;
        this.element.style.maxHeight = this._savedPos.maxHeight;
        this.element.style.height    = this._savedPos.height;
        this.element.style.overflowY = this._savedPos.overflowY;
        this.element.classList.remove('gpp-panel--predraw', 'gpp-panel--wall-predraw');
        // Restore the status bar to its default CSS position
        const statusEl = document.querySelector('.th-overlay') as HTMLElement | null;
        if (statusEl) {
            statusEl.style.bottom    = '';
            statusEl.style.top       = '';
            statusEl.style.left      = '';
            statusEl.style.transform = '';
        }
        this._savedPos    = null;
        this._preDrawMode = false;
    }

    private _makeVisible(): void {
        panelManager.notifyOpened('panel:property');
        this.element.style.display = 'block';
        // Wave 6 Phase B real binding — S73-WIRE.
        // Inform the runtime that this panel is now visible so plugins and
        // extension points can react without polling the DOM.  idempotent.
        // P8: OTel span emitted inside activatePanel (runtime-composer).
        if (this.runtime) {
            const spec: import('@pryzm/runtime-composer/types').PanelViewSpec = {
                label: 'Property Panel',
                elementType: this.state.selectedElementType ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel('property-panel', spec);
        }
    }

    private injectStyles(): void {
        if (this.styleInjected) return;
        const style = document.createElement('style');
        style.textContent = PANEL_STYLES;
        document.head.appendChild(style);
        this.styleInjected = true;
    }

    /**
     * Builds the close (✕) button appended to every panel header.
     * Clicking it calls hide() which hides the panel and clears state.
     * Contract: §05 — pure UI; no store writes; new standalone listener only.
     */
    private buildCloseBtn(): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = 'gpp-close-btn';
        btn.textContent = '✕';
        btn.title = 'Close panel';
        btn.addEventListener('click', () => this.hide());
        return btn;
    }

    /** Returns a PreDrawPanelHost bound to this panel for use by PropertyPanelPreDraw functions. */
    private _asPreDrawHost(): PreDrawPanelHost {
        return {
            element: this.element,
            clearForPreDraw: (elementType) => {
                this.selectedObject = null;
                this.state.selectedElementId = null;
                this.state.selectedElementType = elementType;
                this.draft.clear();
                this.validationErrors.clear();
                this.element.innerHTML = '';
                this.injectStyles();
            },
            buildCloseBtn: () => this.buildCloseBtn(),
            makeVisible: () => this._makeVisible(),
            positionBesideModeBar: () => this._positionWallPreDrawBesideModeBar(),
        };
    }

    /** Returns an AnnotationPanelHost bound to this panel for use by PropertyPanelAnnotations functions. */
    private _asAnnotationHost(): AnnotationPanelHost {
        return {
            element: this.element,
            prepareForAnnotation: ({ elementId, elementType }) => {
                this.selectedObject = null;
                this.state.selectedElementId = elementId;
                this.state.selectedElementType = elementType;
                this.draft.clear();
                this.validationErrors.clear();
                this.element.innerHTML = '';
                this.injectStyles();
            },
            buildCloseBtn: () => this.buildCloseBtn(),
            hide: () => this.hide(),
            makeVisible: () => this._makeVisible(),
        };
    }

    public hide(): void {
        this._restorePosition();
        panelManager.notifyClosed('panel:property');
        this.element.style.display = 'none';
        this.selectedObject = null;
        this.state.selectedElementId = null;
        this.state.selectedElementType = null;
        this.draft.clear();
        this.validationErrors.clear();
        // Wave 6 Phase B real binding — panel unmount deactivation.
        // Symmetric to the activatePanel call in _makeVisible(). Idempotent.
        this.runtime?.viewRegistry.deactivatePanel('property-panel');
    }

    /**
     * Shows the Property Inspector in "View Properties" mode — the default
     * state displayed when no BIM element is selected (Phase 2.2).
     *
     * Renders sun settings, shadow toggle and post-processing controls.
     * Engine side-effects are dispatched as window CustomEvents consumed by
     * the initUI.ts lighting handlers (no store mutations; §01 §3.5 compliant).
     */
    public showViewProperties(): void {
        this._restorePosition();
        this.selectedObject = null;
        this.state.selectedElementId   = null;
        this.state.selectedElementType = null;
        this.draft.clear();
        this.validationErrors.clear();

        this.element.innerHTML = '';
        this.injectStyles();

        const header = document.createElement('div');
        header.className = 'gpp-header';

        const badge = document.createElement('div');
        badge.className   = 'gpp-type-badge';
        badge.textContent = 'VIEW PROPERTIES';
        header.appendChild(badge);

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-size:11px;font-weight:600;color:rgba(255,255,255,0.80);margin-top:2px;';
        titleEl.textContent = 'Environment & Camera';
        header.appendChild(titleEl);

        header.appendChild(this.buildCloseBtn());
        this.element.appendChild(header);

        const section = new ViewPropertiesSection();
        this.element.appendChild(section.build());

        this._positionDefaultViewBelowToolsPanel();
        this._makeVisible();
        // D.7.5 batch #3: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce(
            'property-panel-position-default-view',
            () => this._positionDefaultViewBelowToolsPanel(),
        );
    }

    /**
     * Shows the panel in "pre-draw" mode when a wall creation tool is activated.
     * Lets the user pick a wall system type before placing the first point.
     * Calls wallTool.setSystemTypeId() when the user clicks Apply — no element
     * is selected yet so no store mutation / command is needed here.
     */
    public showWallPreDraw(wallTool: any): void {
        _showWallPreDraw(this._asPreDrawHost(), wallTool);
    }

    public showSlabPreDraw(slabTool: any): void {
        _showSlabPreDraw(this._asPreDrawHost(), slabTool);
    }

    public showDoorPreDraw(doorTool: any): void {
        _showDoorPreDraw(this._asPreDrawHost(), doorTool);
    }

    /**
     * Pre-draw panel for plumbing fixtures — see PropertyPanelPreDraw.ts for implementation.
     */
    public showPlumbingPreDraw(plumbingTool: any): void {
        _showPlumbingPreDraw(this._asPreDrawHost(), plumbingTool);
    }

    public showWindowPreDraw(windowTool: any): void {
        _showWindowPreDraw(this._asPreDrawHost(), windowTool);
    }

    public showCeilingPreDraw(ceilingTool: any): void {
        _showCeilingPreDraw(this._asPreDrawHost(), ceilingTool);
    }

    public showFloorPreDraw(floorTool: any): void {
        _showFloorPreDraw(this._asPreDrawHost(), floorTool);
    }

    public showCurtainWallPreDraw(curtainWallTool: any): void {
        _showCurtainWallPreDraw(this._asPreDrawHost(), curtainWallTool);
    }

    /**
     * Show the panel for the given Three.js object.
     * Reads element data from userData and available stores.
     *
     * §Feasibility: If window.__curtainSubElement is set (written by SelectionManager
     * when a panel or mullion mesh is clicked), consumes it and renders the
     * sub-element panel instead of the parent curtain wall panel.
     * The cache is cleared immediately after reading so subsequent identical clicks
     * to the parent wall (not a sub-element) show the parent panel normally.
     */
    public showElement(obj: THREE.Object3D): void {
        let target = obj;

        if (obj.userData?.role === 'geometry' && obj.userData?.parentId) {
            let cur = obj.parent;
            while (cur) {
                if (cur.userData?.id === obj.userData.parentId) { target = cur; break; }
                cur = cur.parent;
            }
        }

        // §Feasibility — sub-element branch: consume window.__curtainSubElement
        const subEl: CurtainSubElement | null = window.__curtainSubElement ?? null; // TODO(E.curtain-wall.S): legacy __curtainSubElement — replace with runtime.stores.curtainWall sub-element
        window.__curtainSubElement = null; // always consume // TODO(E.curtain-wall.S): legacy __curtainSubElement — replace with runtime.stores.curtainWall sub-element

        const targetType = (target.userData?.type || target.userData?.elementType || '').toLowerCase();
        const isCurtainWall = targetType === 'curtain-wall' || targetType === 'curtainwall';

        if (subEl && isCurtainWall) {
            // Sub-element panel path: show panel/mullion properties
            this.selectedObject = target;
            this.state.selectedElementId = subEl.id;
            this.state.selectedElementType = subEl.type === 'panel' ? 'curtain-panel' : 'curtain-mullion';
            this.draft.clear();
            this.validationErrors.clear();

            this.element.innerHTML = '';
            this.injectStyles();

            // "Show parent" callback — re-renders the full curtain wall panel
            const onShowParent = () => {
                window.__curtainSubElement = null; // TODO(E.curtain-wall.S): legacy __curtainSubElement — replace with runtime.stores.curtainWall sub-element
                this.showElement(target);
            };

            buildCurtainSubElementPanel(subEl, this.element, onShowParent);
            this._makeVisible();
            return;
        }

        // ── Room path — delegates to the rich RoomPropertySection ────────────
        if (targetType === 'room') {
            const roomId  = target.userData?.id;
            const roomStore = window.roomStore; // TODO(E.18-R.S): legacy roomStore — replace with runtime.stores.rooms slot
            const room = roomId ? roomStore?.getById?.(roomId) : null;

            if (room) {
                this.selectedObject = target;
                this.state.selectedElementId = roomId;
                this.state.selectedElementType = 'room';
                this.draft.clear();
                this.validationErrors.clear();

                this.element.innerHTML = '';
                this.injectStyles();

                const _roomData = { id: room.id, type: 'room', elementType: 'room', mark: room.name || '', levelId: room.levelId };
                const { el: _roomHdr } = _buildElementHeader(this._asBodyRendererHost(), _roomData);
                this.element.appendChild(_roomHdr);

                const body = document.createElement('div');
                body.className = 'gpp-body';
                body.style.cssText = 'padding:8px 12px 12px;';

                // P6 E.5.3: window.commandManager removed; cmdMgr sourced from
                // instance field only. Runtime is threaded as 5th arg below.
                const cmdMgr = this._commandManager ?? null;
                // Phase B.37 (S73-WIRE) — forward composed runtime so the room
                // panel can thread it down to RoomGraphPanel /
                // EvacuationSimulatorPanel without re-touching call sites.
                appendRoomPropertySection(
                    body,
                    room,
                    roomStore,
                    cmdMgr,
                    (_obj: any) => { if (this.selectedObject) this.showElement(this.selectedObject); },
                    this.runtime /* B-runtime-thread appendRoomPropertySection */,
                );

                this.element.appendChild(body);
                this._makeVisible();
                return;
            }
        }

        // ── PDF / image underlay path ─────────────────────────────────────────
        if (targetType === 'floor_plan_underlay') {
            this._renderUnderlayPanel(target);
            return;
        }

        // ── IFC import path — §28-IFC-IMPORT-NATIVE-PARITY-CONTRACT ─────────
        if (target.userData?.source === 'ifc-import' && target.userData?.expressID != null) {
            this._renderIfcElement(target);
            return;
        }

        // Standard path (unchanged) ──────────────────────────────────────────
        this.selectedObject = target;
        const rawData = target.userData;

        if (!rawData?.id && !rawData?.type) {
            this.hide();
            return;
        }

        const enriched = this.enrichFromStores(rawData);

        this.state.selectedElementId = enriched.id;
        this.state.selectedElementType = normalizeType(enriched.elementType || enriched.type || '');
        this.draft.clear();
        this.validationErrors.clear();

        this.render(enriched);
        this._makeVisible();
    }

    // ── Import Overlay (PDF / JPG underlay) Panel ─────────────────────────────

    private _renderUnderlayPanel(obj: THREE.Object3D): void {
        _renderUnderlayPanelFn(this._asElementRenderHost(), obj);
    }

    // ── IFC Element Panel ─────────────────────────────────────────────────────
    // §28-IFC-IMPORT-NATIVE-PARITY-CONTRACT

    private _renderIfcElement(obj: THREE.Object3D): void {
        _renderIfcElementFn(this._asElementRenderHost(), obj);
    }


    /** Delegates to PropertyPanelStoreEnricher._enrichFromStores. */
    private enrichFromStores(rawData: Record<string, any>): Record<string, any> {
        return _enrichFromStores(this._roofStore, rawData);
    }

    private render(elementData: Record<string, any>): void {
        const refs: ElementRenderRefs = _renderElementToContainer(this.element, this._asBodyRendererHost(), elementData);
        this.applyBtn         = refs.applyBtn;
        this.validationBanner = refs.validationBanner;
    }

    // ── Host factories ────────────────────────────────────────────────────────

    /** Returns an ElementRenderHost bound to this panel. */
    private _asElementRenderHost(): ElementRenderHost {
        return {
            container:      this.element,
            state:          this.state,
            draft:          this.draft,
            validationErrors: this.validationErrors,
            setSelectedObject: (obj) => { this.selectedObject = obj; },
            injectStyles:   () => this.injectStyles(),
            makeVisible:    () => this._makeVisible(),
            hide:           () => this.hide(),
            buildCloseBtn:  () => this.buildCloseBtn(),
        };
    }

    /** Returns a BodyRendererHost bound to this panel for render + header builders. */
    private _asBodyRendererHost(): BodyRendererHost {
        return {
            draft:            this.draft,
            validationErrors: this.validationErrors,
            roofStore:        this._roofStore,
            commandManager:   this._commandManager,
            selectedObject:   this.selectedObject,
            injectStyles:     () => this.injectStyles(),
            onApply:          (data) => this.onApply(data),
            onDelete:         (data) => this.onDelete(data),
            onRerender:       (data) => {
                if (this.selectedObject) {
                    this.render(this.enrichFromStores(data));
                }
            },
            buildCloseBtn:    () => this.buildCloseBtn(),
        };
    }

    private async onApply(elementData: Record<string, any>): Promise<void> {
        if (this.draft.size === 0) {
            this.showValidation('No changes to apply.');
            return;
        }

        if (this.selectedObject) {
            this.selectedObject.updateMatrixWorld(true);
            const pos = {
                x: this.selectedObject.position.x,
                y: this.selectedObject.position.y,
                z: this.selectedObject.position.z,
            };
            const rot = {
                x: this.selectedObject.rotation.x,
                y: this.selectedObject.rotation.y,
                z: this.selectedObject.rotation.z,
                order: this.selectedObject.rotation.order,
            };
            if (!this.draft.has('position')) this.draft.set('position', pos);
            if (!this.draft.has('rotation')) this.draft.set('rotation', rot);
        }

        const elementId   = elementData.id;
        const elementType = this.state.selectedElementType ?? 'wall';
        const parameters: Record<string, any> = {};
        this.draft.forEach((val, key) => { if (key !== 'mark') parameters[key] = val; });
        const markValue = this.draft.get('mark');

        try {
            if (Object.keys(parameters).length > 0) {
                await window.runtime?.bus?.executeCommand('element.updateParameters', { elementId, elementType, parameters });
            }
            if (markValue !== undefined) {
                await this.applyMarkUpdate(elementId, elementType, markValue);
            }
            this.showApplySuccess();
            this.draft.clear();
            this.validationErrors.clear();
        } catch (e: unknown) {
            console.warn('[PropertyPanel] onApply failed:', e);
            this.showValidation('Update failed');
        }
    }

    private async applyMarkUpdate(elementId: string, elementType: string, mark: string): Promise<void> {
        const validTypes = ['wall', 'window', 'door', 'slab', 'column', 'beam', 'stair', 'stairs'];
        const mappedType = elementType === 'stairs' ? 'stair' : elementType;
        if (!validTypes.includes(mappedType as any)) return;
        await window.runtime?.bus?.executeCommand('element.updateMark', {
            elementId,
            elementType: mappedType,
            newMark: mark,
        });
    }

    private onDelete(elementData: Record<string, any>): void {
        if (!confirm(`Delete ${elementData.type} ${elementData.id?.substring(0, 8)}?`)) return;
        window.runtime?.bus?.executeCommand('element.delete', { elementId: elementData.id })
            ?.then(() => this.hide())
            ?.catch((e: unknown) => console.warn('[PropertyPanel] element.delete failed:', e));
    }

    private showValidation(message: string): void {
        if (!this.validationBanner) return;
        this.validationBanner.textContent = message;
        this.validationBanner.style.display = 'block';
        setTimeout(() => {
            if (this.validationBanner) this.validationBanner.style.display = 'none';
        }, 4000);
    }

    private showApplySuccess(): void {
        if (!this.applyBtn) return;
        const original = this.applyBtn.textContent;
        this.applyBtn.textContent = '✓ Applied';
        this.applyBtn.style.background = '#16a34a';
        setTimeout(() => {
            if (this.applyBtn) {
                this.applyBtn.textContent = original;
                this.applyBtn.style.background = '';
            }
        }, 1800);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §ANN-SEL: Linear Dimension Properties
    // Renders dimension editing fields inside the standard PropertyPanel so the
    // user never has to interact with a separate floating panel. All mutations
    // go through UpdateAnnotationCommand / DeleteAnnotationCommand per §01 §2.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Shows the property panel populated with dimension-editing fields for a
     * placed linear-dim annotation. Call this whenever the user clicks a
     * dimension line in the viewport.
     *
     * @param ann              The annotation to display/edit.
     * @param commandManager   Optional override; falls back to this._commandManager.
     * @param selectedWallId   When the user opened this panel by clicking a dimension
     *                         while a wall was selected, pass the wall's ID so that
     *                         the "Move Wall" drive-dimension field is shown.
     */
    public showLinearDimension(ann: AnnotationElement, commandManager?: any, selectedWallId?: string): void {
        const cmdMgr = commandManager ?? this._commandManager;
        _showLinearDimension(this._asAnnotationHost(), cmdMgr, ann, selectedWallId);
    }

    /**
     * Populates and shows the property panel for a BimGrid datum.
     * Called when the user clicks a grid line in plan view.
     */
    public showGrid(grid: {
        id: string;
        name: string;
        axis: 'X' | 'Y';
        position: number;
        isVisible?: boolean;
        isPinned?: boolean;
        extentMin?: number;
        extentMax?: number;
        color?: string;
    }): void {
        // P6 E.5.3: window.commandManager fallback removed; use instance field only.
        const cmdMgr = this._commandManager ?? null;
        _showGrid(this._asAnnotationHost(), cmdMgr, grid);
    }

}
