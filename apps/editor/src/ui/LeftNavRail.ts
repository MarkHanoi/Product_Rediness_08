/**
 * LeftNavRail — Phase 2 of PRYZM UI Architecture V2
 *
 * CSS prefix : lnr-   (claimed in §3 of 05-BIM-UI-ARCHITECTURE-CONTRACT.md)
 * localStorage keys : pryzm-lnr-active, pryzm-lnr-width
 *
 * Architecture:
 *   lnr-rail (flex row)
 *     lnr-spine (48px, always visible)
 *       icon buttons (MODEL | DATA | VIEWS | SCHEDULES | sep | AI | HISTORY | SETTINGS)
 *     lnr-content (0–480px, collapsible, user-resizable)
 *       lnr-content-inner   ← panel content mounts here
 *       lnr-resize-handle   ← right-edge drag target
 *
 * Toggle behaviour: clicking the currently-active icon collapses the content
 * area to 0; clicking a different icon switches the content and expands it.
 *
 * Contract compliance:
 *   §05 §2.1 — CSS lives in src/styles/panels/leftNavRail.ts, injected via AppTheme
 *   §05 §3   — Prefix lnr- claimed (Left Nav Rail)
 *   §05 §6   — Zero bim-* / @thatopen/ui elements; pure native HTML
 *   §05 §7.6 — No independent <style> injection
 *   §06 §1   — No BIM engine imports; accesses stores via window globals
 *   §01 §2   — Read-only with respect to stores; mutations via commandManager
 */

import { getFrameScheduler }    from '@pryzm/frame-scheduler';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { scheduleStore }        from '@pryzm/core-app-model';
import { sheetStore }           from '@pryzm/core-app-model';
import { commandProposalStore } from '@pryzm/command-registry';
import { escHtml } from '@pryzm/ui-base';
import { triggerWindowResize } from '../engine/triggerWindowResize'; // F.events.16
import { HierarchyTreePanel }   from './dataworkbench/HierarchyTreePanel';
import { ValidatePanel }        from './ai/ValidatePanel';

const LS_ACTIVE = 'bim-lnr-active';
const LS_WIDTH  = 'bim-lnr-width-v2';

const DEFAULT_WIDTH = 252;
const MIN_WIDTH     = 162;
const MAX_WIDTH     = 432;

// ── SVG icons ─────────────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
    MODEL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.2"/>
        <rect x="14" y="3" width="7" height="7" rx="1.2"/>
        <rect x="3" y="14" width="7" height="7" rx="1.2"/>
        <rect x="14" y="14" width="7" height="7" rx="1.2"/>
    </svg>`,

    DATA: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
        <path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/>
        <path d="M3 13v4c0 1.66 4.03 3 9 3s9-1.34 9-3v-4"/>
    </svg>`,

    VIEWS: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="5" rx="1.2"/>
        <rect x="2" y="10" width="12" height="5" rx="1.2"/>
        <rect x="2" y="17" width="8" height="5" rx="1.2"/>
    </svg>`,

    SCHEDULES: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="1.5"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="3" y1="14" x2="21" y2="14"/>
        <line x1="8" y1="4" x2="8" y2="22"/>
        <line x1="14" y1="4" x2="14" y2="22"/>
    </svg>`,

    AI: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="9"/>
        <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2.5-5 4-5 4"/>
        <circle cx="12" cy="17.5" r=".8" fill="currentColor" stroke="none"/>
    </svg>`,

    VALIDATE: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L3 7v5c0 5.25 3.79 10.16 9 11.36C17.21 22.16 21 17.25 21 12V7L12 2z"/>
        <polyline points="9 12 11 14 15 10"/>
    </svg>`,

    HISTORY: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 1 2.64 6.36"/>
        <polyline points="3 7 3 12 8 12"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="12" x2="15" y2="14"/>
    </svg>`,

    SETTINGS: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>`,
};

// ── Props ──────────────────────────────────────────────────────────────────────

export interface LeftNavRailProps {
    onViewSelect?:       (viewId: string) => void;
    onToggleAIPanel?:    () => void;
    onToggleSpatialTree?: () => void;
}

// ── Panel definitions ──────────────────────────────────────────────────────────

interface PanelDef {
    id:           string;
    label:        string;
    iconKey:      string;
    buildContent: () => HTMLElement;
}

// ── LeftNavRail ────────────────────────────────────────────────────────────────

// Phase B.3 (S73-WIRE) — runtime threading per S72 §16.2 row B.3.
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

export class LeftNavRail {
    readonly element:       HTMLElement;
    private _spine:         HTMLElement;
    private _contentEl:     HTMLElement;
    private _contentInner:  HTMLElement;
    private _iconBtns:      Map<string, HTMLElement> = new Map();

    private _activeId:      string | null = null;
    private _contentWidth:  number = DEFAULT_WIDTH;

    private _panels:        PanelDef[] = [];
    private _hierContainer:   HTMLElement | null = null;

    /**
     * Phase B.3 (S73-WIRE) — `runtime` threaded by parent (Layout.ts);
     * `public readonly` so Phase F+ readers can access without trip
     * through the legacy window global.  Optional with default `null` so the
     * legacy boot path (which has no composed runtime today) compiles
     * unchanged.
     */
    public readonly runtime: PryzmRuntime | null;

    constructor(
        private readonly _props: LeftNavRailProps,
        runtime: PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this._contentWidth = this._loadWidth();

        // ── Root rail ──────────────────────────────────────────────────────
        const rail = document.createElement('div');
        rail.className = 'lnr-rail';
        this.element = rail;

        // ── Spine ──────────────────────────────────────────────────────────
        this._spine = document.createElement('div');
        this._spine.className = 'lnr-spine';
        rail.appendChild(this._spine);

        // ── Content panel ──────────────────────────────────────────────────
        this._contentEl = document.createElement('div');
        this._contentEl.className = 'lnr-content';
        this._contentEl.style.width = '0';

        this._contentInner = document.createElement('div');
        this._contentInner.className = 'lnr-content-inner';
        this._contentEl.appendChild(this._contentInner);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'lnr-resize-handle';
        resizeHandle.title = 'Drag to resize';
        this._attachResizeDrag(resizeHandle);
        this._contentEl.appendChild(resizeHandle);

        rail.appendChild(this._contentEl);

        // ── Build panels & spine ───────────────────────────────────────────
        this._registerPanels();
        this._buildSpine();
        this._restoreState();
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /** Force-open a panel by id (used externally if needed). */
    openPanel(id: string): void {
        if (this._activeId === id) return;
        this._setActive(id);
    }

    // ── Panel registration ─────────────────────────────────────────────────────

    private _registerPanels(): void {
        this._panels = [
            {
                id:           'MODEL',
                label:        'Model',
                iconKey:      'MODEL',
                buildContent: () => this._buildModelContent(),
            },
            {
                id:           'DATA',
                label:        'Data',
                iconKey:      'DATA',
                buildContent: () => this._buildDataContent(),
            },
            {
                id:           'VIEWS',
                label:        'Views',
                iconKey:      'VIEWS',
                buildContent: () => this._buildViewsContent(),
            },
            {
                id:           'SCHEDULES',
                label:        'Schedules',
                iconKey:      'SCHEDULES',
                buildContent: () => this._buildSchedulesContent(),
            },
            // bottom group
            {
                id:           'AI',
                label:        'AI Chat',
                iconKey:      'AI',
                buildContent: () => this._buildAIContent(),
            },
            {
                id:           'VALIDATE',
                label:        'Validate & Reports',
                iconKey:      'VALIDATE',
                buildContent: () => this._buildValidateContent(),
            },
            {
                id:           'HISTORY',
                label:        'History',
                iconKey:      'HISTORY',
                buildContent: () => this._buildHistoryContent(),
            },
            {
                id:           'SETTINGS',
                label:        'Settings',
                iconKey:      'SETTINGS',
                buildContent: () => this._buildSettingsContent(),
            },
        ];
    }

    // ── Spine construction ─────────────────────────────────────────────────────

    private _buildSpine(): void {
        const TOP_IDS    = ['MODEL', 'DATA', 'VIEWS', 'SCHEDULES'];
        const BOTTOM_IDS = ['AI', 'VALIDATE', 'HISTORY', 'SETTINGS'];

        for (const id of TOP_IDS) {
            const def = this._panels.find(p => p.id === id)!;
            this._spine.appendChild(this._makeIconBtn(def));
        }

        const sep = document.createElement('div');
        sep.className = 'lnr-separator';
        this._spine.appendChild(sep);

        const spacer = document.createElement('div');
        spacer.className = 'lnr-spine-spacer';
        this._spine.appendChild(spacer);

        for (const id of BOTTOM_IDS) {
            const def = this._panels.find(p => p.id === id)!;
            this._spine.appendChild(this._makeIconBtn(def));
        }
    }

    private _makeIconBtn(def: PanelDef): HTMLElement {
        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'lnr-icon-btn';
        btn.title     = def.label;
        btn.innerHTML = ICONS[def.iconKey] ?? '';
        btn.setAttribute('data-lnr-panel', def.id);

        btn.addEventListener('click', () => {
            if (this._activeId === def.id) {
                this._collapse();
            } else {
                this._setActive(def.id);
            }
        });

        this._iconBtns.set(def.id, btn);
        return btn;
    }

    // ── State management ───────────────────────────────────────────────────────

    private _setActive(id: string): void {
        this._activeId = id;
        localStorage.setItem(LS_ACTIVE, id);

        const def = this._panels.find(p => p.id === id);
        if (!def) return;

        this._iconBtns.forEach((btn, btnId) => {
            btn.classList.toggle('lnr-icon-btn--active', btnId === id);
        });

        this._contentInner.innerHTML = '';
        this._contentInner.appendChild(def.buildContent());
        this._contentEl.style.width = `${this._contentWidth}px`;
    }

    private _collapse(): void {
        this._activeId = null;
        localStorage.removeItem(LS_ACTIVE);
        this._iconBtns.forEach(btn => btn.classList.remove('lnr-icon-btn--active'));
        this._contentEl.style.width = '0';
        // Trigger resize so Three.js knows the canvas area changed.
        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('left-nav-rail-resize', () => triggerWindowResize()); // F.events.16
    }

    private _restoreState(): void {
        const saved = localStorage.getItem(LS_ACTIVE);
        if (saved && this._panels.some(p => p.id === saved)) {
            this._setActive(saved);
        }
    }

    // ── Width persistence ──────────────────────────────────────────────────────

    private _loadWidth(): number {
        const raw = localStorage.getItem(LS_WIDTH);
        if (!raw) return DEFAULT_WIDTH;
        const n = parseInt(raw, 10);
        return isNaN(n) ? DEFAULT_WIDTH : Math.min(Math.max(n, MIN_WIDTH), MAX_WIDTH);
    }

    private _saveWidth(w: number): void {
        this._contentWidth = w;
        localStorage.setItem(LS_WIDTH, String(w));
    }

    // ── Resize drag ────────────────────────────────────────────────────────────

    private _attachResizeDrag(handle: HTMLElement): void {
        let startX = 0;
        let startW = 0;

        const onMove = (e: MouseEvent) => {
            const delta = e.clientX - startX;
            const newW  = Math.min(Math.max(startW + delta, MIN_WIDTH), MAX_WIDTH);
            this._contentEl.style.width = `${newW}px`;
            this._saveWidth(newW);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',  onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            triggerWindowResize(); // F.events.16
        };

        handle.addEventListener('mousedown', (e: MouseEvent) => {
            if (this._activeId === null) return;
            e.preventDefault();
            startX = e.clientX;
            startW = this._contentEl.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',  onUp);
        });
    }

    // ── Panel content builders ─────────────────────────────────────────────────

    // 2.2  MODEL — levels + spatial tree
    private _buildModelContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;';

        const header = document.createElement('div');
        header.className   = 'lnr-panel-header';
        header.textContent = 'Model';
        root.appendChild(header);

        // ── Levels section ─────────────────────────────────────────────────
        const levelsSection = document.createElement('div');
        levelsSection.className = 'lnr-section';

        const levelsHdr = document.createElement('button');
        levelsHdr.type      = 'button';
        levelsHdr.className = 'lnr-section-header';
        levelsHdr.innerHTML = '🔲 <span>Levels</span><span class="lnr-section-toggle lnr-section-toggle--open">▴</span>';

        const levelsBody = document.createElement('div');
        levelsBody.className = 'lnr-section-body';

        levelsHdr.addEventListener('click', () => {
            const open = !levelsBody.classList.contains('lnr-section-body--hidden');
            levelsBody.classList.toggle('lnr-section-body--hidden', open);
            const toggle = levelsHdr.querySelector('.lnr-section-toggle') as HTMLElement;
            if (toggle) toggle.classList.toggle('lnr-section-toggle--open', !open);
        });

        const bm: any = window.bimManager; // TODO(D.4): replace via EngineBootstrap split (bimManager goes away in D.4)
        const levels: any[] = bm?.getLevels?.() ?? [];

        if (levels.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'lnr-empty';
            empty.textContent = 'No levels yet.\nUse Levels & Grids in the right panel to create your first level.';
            levelsBody.appendChild(empty);
        } else {
            const activeLevelId = bm?.getActiveLevel?.()?.id ?? null;
            for (const lvl of levels) {
                const row = document.createElement('div');
                row.className = 'lnr-row' + (lvl.id === activeLevelId ? ' lnr-row--active' : '');
                row.title     = `Level: ${lvl.name} — Elevation ${typeof lvl.elevation === 'number' ? lvl.elevation.toFixed(1) : '?'} m`;

                const dot = document.createElement('span');
                dot.className = 'lnr-level-dot';

                const label = document.createElement('span');
                label.className   = 'lnr-row-label';
                label.textContent = lvl.name;

                if (lvl.id === activeLevelId) {
                    const badge = document.createElement('span');
                    badge.className   = 'lnr-level-active-badge';
                    badge.textContent = 'active';
                    row.appendChild(dot);
                    row.appendChild(label);
                    row.appendChild(badge);
                } else {
                    row.appendChild(dot);
                    row.appendChild(label);
                }

                row.addEventListener('click', () => {
                    // FIX: Update projectContext.activeLevelId — the single source of
                    // truth that SlabTool, WallTool, CeilingTool, and all creation tools
                    // read when placing new elements. Its setter fires 'activeLevelChanged'
                    // which causes initScene.ts to call bimManager.setActiveLevel(), so
                    // the visual update still happens through the canonical chain.
                    // Pattern mirrors UnifiedBrowserPanel._setActiveLevel().
                    const pc = window.projectContext; // TODO(C.3.x): replace with runtime.persistence.projectContext
                    if (pc) {
                        pc.activeLevelId = lvl.id;
                    } else {
                        // Fallback when projectContext is not yet on window (engine not ready)
                        bm?.setActiveLevel?.(lvl.id);
                    }
                    window.runtime?.events?.emit('pryzm-active-level-changed', { levelId: lvl.id }); // F.events.14
                });

                levelsBody.appendChild(row);
            }
        }

        levelsSection.appendChild(levelsHdr);
        levelsSection.appendChild(levelsBody);
        root.appendChild(levelsSection);

        // ── Spatial tree section ───────────────────────────────────────────
        const treeSection = document.createElement('div');
        treeSection.className = 'lnr-section';

        const treeHdr = document.createElement('button');
        treeHdr.type      = 'button';
        treeHdr.className = 'lnr-section-header';
        treeHdr.innerHTML = '⬡ <span>Scene Elements</span>';

        const treeBody = document.createElement('div');
        treeBody.className = 'lnr-section-body';

        const openTreeBtn = document.createElement('button');
        openTreeBtn.type      = 'button';
        openTreeBtn.className = 'lnr-btn';
        openTreeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <rect x="3" y="3" width="6" height="6" rx="1"/>
                <rect x="3" y="14" width="6" height="6" rx="1"/>
                <rect x="14" y="8" width="6" height="6" rx="1"/>
                <line x1="9" y1="6" x2="14" y2="11"/>
                <line x1="9" y1="17" x2="14" y2="11"/>
            </svg>
            Open Spatial Tree
        `;
        openTreeBtn.title = 'Open the full Spatial Tree panel';
        openTreeBtn.addEventListener('click', () => {
            this._props.onToggleSpatialTree?.();
            window.runtime?.events?.emit('model-updated', {}); // F.events.8
        });
        treeBody.appendChild(openTreeBtn);

        const note = document.createElement('div');
        note.className   = 'lnr-empty';
        note.textContent = 'Shows all building elements grouped by level and type.';
        note.style.paddingTop = '4px';
        treeBody.appendChild(note);

        treeSection.appendChild(treeHdr);
        treeSection.appendChild(treeBody);
        root.appendChild(treeSection);

        // Subscribe to level changes to refresh this panel
        const onLevelChange = () => {
            if (this._activeId === 'MODEL' && root.isConnected) {
                this._setActive('MODEL');
            }
        };
        window.addEventListener('bim-level-created', onLevelChange);
        window.addEventListener('bim-level-deleted', onLevelChange);
        window.runtime?.events?.on('pryzm-active-level-changed', onLevelChange); // F.events.14
        // FIX: Also refresh when level is changed from other panels (UnifiedBrowserPanel,
        // PropertyInspector, etc.) which set projectContext.activeLevelId and fire
        // the canonical 'activeLevelChanged' window event.
        window.addEventListener('activeLevelChanged', onLevelChange);

        return root;
    }

    // 2.3  DATA — hierarchy tree panel
    private _buildDataContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;height:100%;';

        const header = document.createElement('div');
        header.className   = 'lnr-panel-header';
        header.textContent = 'Data';
        root.appendChild(header);

        // Lazily instantiate HierarchyTreePanel (once per LeftNavRail lifetime).
        // The container div is permanent; on re-activation we simply re-append it.
        if (!this._hierContainer) {
            this._hierContainer = document.createElement('div');
            this._hierContainer.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;';
            // Store panel reference on the container element to prevent GC
            // Phase B.3.3 (S73-WIRE) — pass runtime so the panel can reach typed slots once B.24 lands.
            (this._hierContainer as any).__lnrHierPanel = new HierarchyTreePanel(this._hierContainer, this.runtime);
        }

        root.appendChild(this._hierContainer);
        return root;
    }

    // 2.4  VIEWS — view definitions grouped by type + Sheets
    private _buildViewsContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;';

        const header = document.createElement('div');
        header.className   = 'lnr-panel-header';
        header.textContent = 'Views & Sheets';
        root.appendChild(header);

        // All standard view types — always rendered, even when empty
        const VIEW_GROUPS: Array<{ label: string; viewType: string; icon: string }> = [
            { label: '3D Views',       viewType: '3d',              icon: '⬛' },
            { label: 'Floor Plans',    viewType: 'plan',            icon: '▦'  },
            { label: 'Sections',       viewType: 'section',         icon: '✂'  },
            { label: 'Elevations',     viewType: 'elevation',       icon: '↕'  },
            { label: 'Ceiling Plans',  viewType: 'ceiling-plan',    icon: '⊙'  },
            { label: 'Structural',     viewType: 'structural-plan', icon: '⊞'  },
            { label: 'Details',        viewType: 'detail',          icon: '⊕'  },
            { label: 'Analysis Views', viewType: 'analysis',        icon: '◈'  },
            { label: 'Drafting',       viewType: 'drafting',        icon: '✎'  },
            { label: 'Legends',        viewType: 'legend',          icon: '≡'  },
            { label: 'Renders',        viewType: 'render',          icon: '✦'  },
            { label: 'Walkthroughs',   viewType: 'walkthrough',     icon: '🚶' },
        ];

        const refresh = () => {
            if (this._activeId === 'VIEWS' && root.isConnected) {
                this._setActive('VIEWS');
            }
        };

        window.addEventListener('vd:view-created', refresh);
        window.addEventListener('vd:view-updated', refresh);
        window.addEventListener('vd:view-deleted', refresh);
        window.addEventListener('vd:store-loaded', refresh);
        window.addEventListener('sd:sheet-created', refresh);
        window.addEventListener('sd:sheet-updated', refresh);
        window.addEventListener('sd:sheet-deleted', refresh);
        window.addEventListener('sd:store-loaded',  refresh);

        const VIEW_TYPE_TO_OBC: Record<string, string> = {
            '3d':              '3D',
            'plan':            'Top',
            'section':         'Front',
            'elevation':       'Front',
            'ceiling-plan':    'Top',
            'structural-plan': 'Top',
            'detail':          'Front',
            'analysis':        '3D',
            'drafting':        'Top',
            'legend':          'Top',
            'render':          '3D',
            'walkthrough':     '3D',
        };

        // ── View type sections (always visible) ────────────────────────────
        for (const grp of VIEW_GROUPS) {
            const views = viewDefinitionStore.getByType(grp.viewType as any);

            const section = document.createElement('div');
            section.className = 'lnr-section';

            const grpHdr = document.createElement('button');
            grpHdr.type      = 'button';
            grpHdr.className = 'lnr-section-header';
            grpHdr.innerHTML = `${escHtml(grp.icon)} <span>${escHtml(grp.label)}</span>`
                + (views.length > 0
                    ? `<span class="lnr-row-badge" style="margin-left:auto">${views.length}</span>`
                    : '');

            const grpBody = document.createElement('div');
            grpBody.className = 'lnr-section-body';

            grpHdr.addEventListener('click', () => {
                grpBody.classList.toggle('lnr-section-body--hidden');
            });

            if (views.length === 0) {
                const empty = document.createElement('div');
                empty.className   = 'lnr-empty';
                empty.style.paddingTop = '6px';
                empty.textContent = 'No views yet';
                grpBody.appendChild(empty);
            } else {
                for (const view of views) {
                    const row = document.createElement('div');
                    row.className = 'lnr-row';
                    row.setAttribute('role', 'button');
                    row.setAttribute('tabindex', '0');
                    row.title = `Activate: ${view.name}`;

                    const iconEl = document.createElement('span');
                    iconEl.className   = 'lnr-row-icon';
                    iconEl.textContent = grp.icon;

                    const lbl = document.createElement('span');
                    lbl.className   = 'lnr-row-label';
                    lbl.textContent = view.name;

                    row.appendChild(iconEl);
                    row.appendChild(lbl);

                    const activate = () => {
                        const obcMode = VIEW_TYPE_TO_OBC[view.viewType] ?? '3D';
                        this._props.onViewSelect?.(obcMode);
                    };
                    row.addEventListener('click', activate);
                    row.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
                    });

                    grpBody.appendChild(row);
                }
            }

            section.appendChild(grpHdr);
            section.appendChild(grpBody);
            root.appendChild(section);
        }

        // ── Sheets section ─────────────────────────────────────────────────
        const sheets = sheetStore.getAll();

        const sheetsSection = document.createElement('div');
        sheetsSection.className = 'lnr-section';

        const sheetsHdr = document.createElement('button');
        sheetsHdr.type      = 'button';
        sheetsHdr.className = 'lnr-section-header';
        sheetsHdr.innerHTML = `📄 <span>Sheets</span>`
            + (sheets.length > 0
                ? `<span class="lnr-row-badge" style="margin-left:auto">${sheets.length}</span>`
                : '');

        const sheetsBody = document.createElement('div');
        sheetsBody.className = 'lnr-section-body';

        sheetsHdr.addEventListener('click', () => {
            sheetsBody.classList.toggle('lnr-section-body--hidden');
        });

        if (sheets.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'lnr-empty';
            empty.style.paddingTop = '6px';
            empty.textContent = 'No sheets yet';
            sheetsBody.appendChild(empty);
        } else {
            for (const sheet of sheets) {
                const row = document.createElement('div');
                row.className = 'lnr-row';
                row.setAttribute('role', 'button');
                row.setAttribute('tabindex', '0');
                row.title = `Open sheet: ${sheet.name}`;

                const iconEl = document.createElement('span');
                iconEl.className   = 'lnr-row-icon';
                iconEl.textContent = '📄';

                const lbl = document.createElement('span');
                lbl.className   = 'lnr-row-label';
                lbl.textContent = sheet.name;

                const numBadge = document.createElement('span');
                numBadge.className   = 'lnr-row-badge';
                numBadge.textContent = sheet.sheetNumber ?? '';
                numBadge.style.display = sheet.sheetNumber ? '' : 'none';

                row.appendChild(iconEl);
                row.appendChild(lbl);
                row.appendChild(numBadge);

                const open = () => {
                    const se = window.sheetEditor; // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5
                    if (se?.openSheet) {
                        se.openSheet(sheet.id);
                    } else {
                        console.warn('[LeftNavRail] sheetEditor not available on window');
                    }
                };
                row.addEventListener('click', open);
                row.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                });

                sheetsBody.appendChild(row);
            }
        }

        sheetsSection.appendChild(sheetsHdr);
        sheetsSection.appendChild(sheetsBody);
        root.appendChild(sheetsSection);

        return root;
    }

    // 2.5  SCHEDULES — schedules list
    private _buildSchedulesContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;';

        const header = document.createElement('div');
        header.className   = 'lnr-panel-header';
        header.textContent = 'Schedules';
        root.appendChild(header);

        const refreshSched = () => {
            if (this._activeId === 'SCHEDULES' && root.isConnected) {
                this._setActive('SCHEDULES');
            }
        };
        window.addEventListener('sched:schedule-created', refreshSched);
        window.addEventListener('sched:schedule-updated', refreshSched);
        window.addEventListener('sched:schedule-deleted', refreshSched);

        const schedules = scheduleStore.getAll();

        const section = document.createElement('div');
        section.className = 'lnr-section';

        const schedHdr = document.createElement('button');
        schedHdr.type      = 'button';
        schedHdr.className = 'lnr-section-header';
        schedHdr.innerHTML = `📋 <span>All Schedules</span>
            <span class="lnr-row-badge" style="margin-left:auto">${schedules.length}</span>`;

        const schedBody = document.createElement('div');
        schedBody.className = 'lnr-section-body';

        if (schedules.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'lnr-empty';
            empty.textContent = 'No schedules yet.';
            schedBody.appendChild(empty);
        } else {
            for (const sched of schedules) {
                const row = document.createElement('div');
                row.className = 'lnr-row';
                row.setAttribute('role', 'button');
                row.setAttribute('tabindex', '0');
                row.title = `Open: ${sched.name}`;

                const icon = document.createElement('span');
                icon.className   = 'lnr-row-icon';
                icon.textContent = '📋';

                const lbl = document.createElement('span');
                lbl.className   = 'lnr-row-label';
                lbl.textContent = sched.name;

                row.appendChild(icon);
                row.appendChild(lbl);

                const open = () => {
                    const sp = window.schedulePanel; // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5
                    if (sp?.show) sp.show(sched.id);
                };
                row.addEventListener('click', open);
                row.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
                });

                schedBody.appendChild(row);
            }
        }

        section.appendChild(schedHdr);
        section.appendChild(schedBody);
        root.appendChild(section);

        return root;
    }

    // 2.6  AI — proposals + quick actions
    private _buildAIContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;';

        const header = document.createElement('div');
        header.className   = 'lnr-panel-header';
        header.textContent = 'AI';
        root.appendChild(header);

        const section = document.createElement('div');
        section.className = 'lnr-section';

        const secHdr = document.createElement('button');
        secHdr.type      = 'button';
        secHdr.className = 'lnr-section-header';

        const proposalCount = commandProposalStore.size();
        secHdr.innerHTML = `✦ <span>AI Assistant</span>` +
            (proposalCount > 0
                ? `<span class="lnr-row-badge" style="margin-left:auto">${proposalCount}</span>`
                : '');

        const secBody = document.createElement('div');
        secBody.className = 'lnr-section-body';

        // AI Chat button
        const chatBtn = document.createElement('button');
        chatBtn.type      = 'button';
        chatBtn.className = 'lnr-btn';
        chatBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Open AI Chat
        `;
        chatBtn.addEventListener('click', () => this._props.onToggleAIPanel?.());
        secBody.appendChild(chatBtn);

        if (proposalCount > 0) {
            const propNote = document.createElement('div');
            propNote.className   = 'lnr-empty';
            propNote.style.paddingTop = '4px';
            propNote.textContent = `${proposalCount} pending proposal${proposalCount > 1 ? 's' : ''} awaiting review.`;
            secBody.appendChild(propNote);
        }

        section.appendChild(secHdr);
        section.appendChild(secBody);
        root.appendChild(section);

        return root;
    }

    // 2.7  VALIDATE — validation, reports, action proposals
    private _buildValidateContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

        // Phase B.3.3 (S73-WIRE) — pass runtime so ValidatePanel can reach typed slots once B.32-V lands.
        const panel = new ValidatePanel(this.runtime);
        root.appendChild(panel.build());

        return root;
    }

    // 2.6  HISTORY — undo tree stub
    private _buildHistoryContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;';

        const header = document.createElement('div');
        header.className   = 'lnr-panel-header';
        header.textContent = 'History';
        root.appendChild(header);

        const cm: any = window.commandManager; // TODO(E.5.x): replace with runtime.bus.executeCommand
        const undoCount = cm?.undoStack?.length ?? 0;

        const section = document.createElement('div');
        section.className = 'lnr-section';

        const secHdr = document.createElement('button');
        secHdr.type      = 'button';
        secHdr.className = 'lnr-section-header';
        secHdr.innerHTML = `⏱ <span>Command History</span>
            <span class="lnr-row-badge" style="margin-left:auto">${undoCount}</span>`;

        const secBody = document.createElement('div');
        secBody.className = 'lnr-section-body';

        if (undoCount === 0) {
            const empty = document.createElement('div');
            empty.className   = 'lnr-empty';
            empty.textContent = 'No actions recorded yet.';
            secBody.appendChild(empty);
        } else {
            const stack: any[] = [...(cm.undoStack ?? [])].reverse();
            for (const cmd of stack.slice(0, 20)) {
                const row = document.createElement('div');
                row.className = 'lnr-row';

                const icon = document.createElement('span');
                icon.className   = 'lnr-row-icon';
                icon.textContent = '↶';

                const lbl = document.createElement('span');
                lbl.className   = 'lnr-row-label';
                lbl.textContent = cmd.constructor?.name ?? cmd.name ?? 'Command';

                row.appendChild(icon);
                row.appendChild(lbl);
                secBody.appendChild(row);
            }
        }

        section.appendChild(secHdr);
        section.appendChild(secBody);
        root.appendChild(section);

        return root;
    }

    // 2.6  SETTINGS — project settings stub
    private _buildSettingsContent(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;flex:1;';

        const header = document.createElement('div');
        header.className   = 'lnr-panel-header';
        header.textContent = 'Settings';
        root.appendChild(header);

        const section = document.createElement('div');
        section.className = 'lnr-section';

        const secHdr = document.createElement('button');
        secHdr.type      = 'button';
        secHdr.className = 'lnr-section-header';
        secHdr.innerHTML = `⚙ <span>Project Settings</span>`;

        const secBody = document.createElement('div');
        secBody.className = 'lnr-section-body';

        const stub = document.createElement('div');
        stub.className   = 'lnr-empty';
        stub.textContent = 'Project settings panel coming in Phase 6.';
        secBody.appendChild(stub);

        section.appendChild(secHdr);
        section.appendChild(secBody);
        root.appendChild(section);

        return root;
    }
}
