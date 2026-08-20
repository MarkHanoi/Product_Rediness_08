/**
 * ProjectBrowserPanel — Rail Panel Refactor
 *
 * The left-side vb-panel rail stays narrow (52px icon strip) at all times.
 * Clicking a section icon opens its content as a floating panel to the right
 * via RailPanelController — no inline accordion expansion.
 *
 * BROWSER icon replaces the four individual VIEWS/SHEETS/SCHEDULES/TREE icons.
 * The unified panel combines all four sections into one resizable panel.
 *
 * Contract compliance:
 *   §01  — All mutations via the legacy command manager; no direct store writes
 *   §04  — UI modification declared before editing (unified browser panel)
 *   §05  — CSS prefixes: pb- (existing) + rp- (new Rail Panel, AppTheme.ts)
 *   §05  — No @thatopen/ui / bim-* elements; pure HTMLElement tree
 *   §06  — No platform-layer imports
 */

export type { ProjectBrowserPanelProps } from './ProjectBrowserTypes';

import type { ProjectBrowserPanelProps } from './ProjectBrowserTypes';
import { RailPanelController }           from './RailPanelController';
import { UiPreferences }                 from '../UiPreferences';
import { AIRailPanel        }            from './panels/AIRailPanel';
import { CameraRailPanel    }            from './panels/CameraRailPanel';
import { LevelsGridsRailPanel }          from './panels/LevelsGridsRailPanel';
import { UnifiedBrowserPanel }           from './panels/UnifiedBrowserPanel';
import { DocumentsBrowserPanel }         from './panels/DocumentsBrowserPanel';
import { ViewTemplateManagerPanel }      from '../views/ViewTemplateManagerPanel';
import { PhysicsRailPanel }              from './panels/PhysicsRailPanel';
import { RenderRailPanel }               from '../tools-panel/panels/RenderRailPanel';
// A.24 / A.31.e — first-class Inspect panel (Model Tree + Provenance), promoted
// out of the dev-only modelTreeTestModal. Reuses the canonical ModelTreeComponent
// + ProvenanceTab + isolation pipeline.
import { buildInspectPanel, type InspectPanelHandle } from '../inspect/InspectPanel';
// §GIS-ACTION-REGISTRY (L-1187, C06 §13) — the GIS panel RENDERS the declared action
// registry; it does not carry a button list of its own. This is the founder's
// "make sure all these buttons are in the GIS tab" consolidation: the top view-mode
// switch, the "3D Site" sub-bar and the bottom-left floating pill stack all name the
// SAME actions, so the actions are declared once and every surface renders them.
import { renderGisActions } from '../gis/renderGisActions';
import type { GisCapabilityHost } from '../gis/gisActionRegistry';

// ── Section icon map ───────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
    BROWSER: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>`,

    PHYSICS: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>`,

    DOCUMENTS: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="3" width="11" height="14" rx="1.5"/>
        <line x1="7" y1="7" x2="12" y2="7"/>
        <line x1="7" y1="10" x2="12" y2="10"/>
        <line x1="7" y1="13" x2="10" y2="13"/>
        <rect x="9" y="8" width="11" height="13" rx="1.5" fill="var(--app-panel-bg,#1e1e2e)" stroke="currentColor"/>
        <line x1="12" y1="12" x2="17" y2="12"/>
        <line x1="12" y1="15" x2="17" y2="15"/>
        <line x1="12" y1="18" x2="15" y2="18"/>
    </svg>`,

    AI:           `<img src="/icons/left/AI.svg"           style="width:22px;height:22px;object-fit:contain;" />`,
    CAMERA:       `<img src="/icons/left/Camera.svg"       style="width:22px;height:22px;object-fit:contain;" />`,
    LEVELS_GRIDS: `<img src="/icons/right/sETTINGS.svg"   style="width:22px;height:22px;object-fit:contain;" />`,
    VIEW_TEMPLATES: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="4" rx="1"/>
        <rect x="3" y="10" width="11" height="4" rx="1"/>
        <rect x="3" y="17" width="7" height="4" rx="1"/>
        <circle cx="19" cy="19" r="3" fill="none"/>
        <line x1="17.8" y1="20.2" x2="21" y2="23" stroke-width="1.8"/>
    </svg>`,

    RENDER: `<img src="/icons/right/RENDER.svg" style="width:22px;height:22px;object-fit:contain;" />`,

    GIS: `<img src="/icons/right/gis.svg" style="width:22px;height:22px;object-fit:contain;" />`,

    // A.24 / A.31.e — Inspect (Model Tree + Provenance). Magnifier-over-tree
    // glyph; inline SVG so it inherits the rail's currentColor + needs no asset.
    INSPECT: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="4" y1="5" x2="9" y2="5"/>
        <line x1="4" y1="10" x2="9" y2="10"/>
        <line x1="4" y1="15" x2="8" y2="15"/>
        <circle cx="16" cy="14" r="4"/>
        <line x1="19" y1="17" x2="22" y2="20"/>
    </svg>`,
};

// ── ProjectBrowserPanel ────────────────────────────────────────────────────

export class ProjectBrowserPanel {
    private readonly _props:                  ProjectBrowserPanelProps;
    private readonly _root:                   HTMLDivElement;
    private readonly _rail:                   RailPanelController;
    private readonly _browserPanel:           UnifiedBrowserPanel;
    private readonly _documentsPanel:         DocumentsBrowserPanel;
    private readonly _aiPanel:                AIRailPanel;
    private readonly _cameraPanel:            CameraRailPanel;
    private readonly _levelsGridsPanel:       LevelsGridsRailPanel;
    private readonly _viewTemplatesPanel:     ViewTemplateManagerPanel;
    private readonly _physicsPanel:           PhysicsRailPanel;
    private readonly _renderPanel:            RenderRailPanel;

    /** A.24 — live Inspect-panel handle (tree + isolation + provenance subs).
     *  Disposed + recreated each time the INSPECT section is rebuilt so the
     *  isolation animator + store subscriptions don't leak across re-opens. */
    private _inspectHandle: InspectPanelHandle | null = null;

    /** Founder 2026-08-10 — first-line AI chat launcher button (top of rail,
     *  directly under the PRYZM logo). Kept as a field so the active-state
     *  observer can toggle its highlight when the AI panel opens/closes. */
    private _aiLauncherBtn: HTMLButtonElement | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(props: ProjectBrowserPanelProps, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._props = props;
        this._root = document.createElement('div');
        this._root.className = 'pb-container';

        // Phase B.17 (S73-WIRE) — forward composed runtime to RailPanelController
        // so all sub-panels can resolve typed selection / project state via runtime.
        this._rail = new RailPanelController(this.runtime);

        // Adapter: map ProjectBrowserPanelProps → minimal ToolsPanelProps for RenderRailPanel
        const renderProps = {
            toggleShadows:        () => props.toggleShadows?.()        ?? Promise.resolve(),
            applyVisualStyle:     (s: any) => props.applyVisualStyle?.(s) ?? Promise.resolve(),
            service:              props.service              ?? null,
            bimManager:           props.bimManager           ?? null,
            projectContext:       props.projectContext        ?? null,
            toolManager:          null,
            selectionManager:     null,
            wallTool:             null,
            slabTool:             null,
            toggleBimVisibility:  (_t: any, _v: any) => {},
            gisToggle:            (_a: any) => {},
            gisFlyTo:             async () => {},
            gisPlaceBim:          async () => {},
            gisGizmoMode:         (_m: any) => {},
            gisResetGeoreference: () => {},
            gisStartBoundaryDraw: () => {},
        } as any;

        // Phase B.17 (S73-WIRE) — thread the composed runtime to every rail
        // sub-panel.  Each constructor accepts `runtime: PryzmRuntime | null`
        // as its trailing parameter (default null for legacy callers).
        this._browserPanel       = new UnifiedBrowserPanel(props, this._rail, this.runtime);
        this._documentsPanel     = new DocumentsBrowserPanel(props, this._rail, this.runtime);
        this._aiPanel            = new AIRailPanel       (props, this.runtime);
        this._cameraPanel        = new CameraRailPanel   (props, this.runtime);
        // Phase B.15 (S73-WIRE) — forward the composed runtime so the
        // levels/grids sub-panels (B.15-LM, B.15-GM) receive the typed handle.
        this._levelsGridsPanel   = new LevelsGridsRailPanel(props, this.runtime);
        this._viewTemplatesPanel = new ViewTemplateManagerPanel();
        this._physicsPanel       = new PhysicsRailPanel(this.runtime);
        this._renderPanel        = new RenderRailPanel(renderProps, null as any);

        this._buildAll();
        window.runtime?.events?.on('pryzm-rail-panel-state-changed', () => { // F.events.12
            this._refreshButtonStates();
            // A.24 — when the Inspect rail panel is no longer the active section,
            // dispose its handle so the isolation animator + provenance store
            // subscription stop (they restart on the next open via _buildInspectPanel).
            if (this._rail.activeId !== 'INSPECT' && this._inspectHandle !== null) {
                try { this._inspectHandle.dispose(); } catch { /* defensive */ }
                this._inspectHandle = null;
            }
        });
    }

    getElement(): HTMLElement {
        return this._root;
    }

    private _buildAll(): void {
        this._root.innerHTML = '';

        // ── Logo button — sits above all section icons ─────────────────────
        this._root.appendChild(this._buildLogoButton());

        // ── First-line AI Design Assistant launcher (founder request) ──────
        // Sits directly under the PRYZM logo, above every section icon.
        this._root.appendChild(this._buildAiLauncherButton());

        const sections: Array<{
            id:      string;
            label:   string;
            buildFn: () => HTMLElement;
        }> = [
            { id: 'BROWSER',        label: 'Project Browser',   buildFn: () => this._browserPanel.build()          },
            { id: 'LEVELS_GRIDS',   label: 'Levels & Grids',   buildFn: () => this._levelsGridsPanel.build()      },
            { id: 'DOCUMENTS',      label: 'Views & Sheets',    buildFn: () => this._documentsPanel.build()        },
            { id: 'VIEW_TEMPLATES', label: 'View Templates',    buildFn: () => this._viewTemplatesPanel.build()    },
            { id: 'CAMERA',         label: 'Camera & Render',   buildFn: () => this._buildCameraRenderPanel()      },
            { id: 'INSPECT',        label: 'Inspect',           buildFn: () => this._buildInspectPanel()           },
            { id: 'GIS',            label: 'GIS',               buildFn: () => this._buildGISPanel()               },
            { id: 'AI',             label: 'AI & Tools',        buildFn: () => this._aiPanel.build()               },
            { id: 'PHYSICS',        label: 'Physics',           buildFn: () => this._physicsPanel.build()          },
        ];

        for (const sec of sections) {
            this._root.appendChild(this._buildSection(sec.id, sec.label, sec.buildFn));
        }
    }

    private _buildLogoButton(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'pb-logo-wrapper';
        wrapper.dataset['sectionId'] = 'LOGO';

        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'pb-logo-btn';
        btn.title     = 'Project Overview';
        btn.setAttribute('aria-label', 'Project Overview');
        btn.setAttribute('aria-expanded', 'false');

        btn.innerHTML = `
            <span class="pb-logo-icon" aria-hidden="true">
                <img src="/pryzm-logo.png" alt="PRYZM" style="width:28px;height:28px;object-fit:contain;display:block;filter:brightness(0) invert(1);" />
            </span>
        `;

        // Open the Project Hub side panel (same content as the old toolbar hub dropdown)
        btn.addEventListener('click', () => {
            this._rail.toggle('LOGO', 'Project Hub', () => this._buildHubPanel(), {});
            this._refreshButtonStates();
        });

        wrapper.appendChild(btn);
        return wrapper;
    }

    /**
     * Founder request 2026-08-10 — FIRST-LINE AI chat entry point.
     *
     * A dedicated launcher at the very top of the left icon rail (directly
     * under the PRYZM pyramid logo) that toggles the AI Design Assistant chat
     * panel — the same `toggleAIPanel()` closure from AIAreaLayout that the
     * "AI & Tools" section already uses. ADDITIVE: the existing AIRailPanel
     * "Open AI Chat" button keeps working; this only promotes the chat to a
     * one-click first-line action.
     *
     * Active state: the AI panel can be closed by re-toggle, its Esc handler,
     * or PanelManager closing it when another exclusive panel opens — none of
     * which route through this button. A MutationObserver on the panel's
     * `style` attribute keeps the button highlight in sync with the truth
     * (inline `display: flex` = open) instead of guessing from clicks.
     */
    private _buildAiLauncherButton(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'pb-ai-launcher-wrapper';

        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'pb-section-header pb-ai-launcher';
        btn.title     = 'AI Design Assistant';
        btn.setAttribute('aria-label', 'AI Design Assistant');
        btn.setAttribute('aria-pressed', 'false');

        const iconEl = document.createElement('span');
        iconEl.className = 'pb-section-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        // Chat bubble + sparkle — inline SVG so it inherits currentColor and
        // matches the rail's 22px stroke-icon pattern.
        iconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 14a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>
            <path d="M12 6.6l1.05 2.35L15.4 10l-2.35 1.05L12 13.4l-1.05-2.35L8.6 10l2.35-1.05z" fill="currentColor" stroke="none"/>
        </svg>`;
        btn.appendChild(iconEl);

        btn.addEventListener('click', () => {
            this._props.onToggleAIPanel?.();
            // Immediate sync for the click path; the observer covers external closes.
            this._syncAiLauncherState();
        });

        this._aiLauncherBtn = btn;
        this._wireAiLauncherObserver();
        wrapper.appendChild(btn);
        return wrapper;
    }

    /** Toggle the launcher highlight from the AI panel's real visibility. */
    private _syncAiLauncherState(): void {
        const panel = document.getElementById('ai-panel-container');
        const open  = !!panel && panel.style.display === 'flex';
        this._aiLauncherBtn?.classList.toggle('pb-ai-launcher--active', open);
        this._aiLauncherBtn?.setAttribute('aria-pressed', String(open));
    }

    /**
     * Attach the visibility observer once #ai-panel-container exists. The BUI
     * layout template renders asynchronously relative to this rail, so retry
     * briefly instead of assuming mount order (mirrors AIAreaLayout's own
     * settle-delay pattern). Gives up quietly after ~10 s — e.g. when the AI
     * panel is disabled by the owner feature flag and never mounts.
     */
    private _wireAiLauncherObserver(attempt = 0): void {
        const panel = document.getElementById('ai-panel-container');
        if (!panel) {
            if (attempt < 25) setTimeout(() => this._wireAiLauncherObserver(attempt + 1), 400);
            return;
        }
        new MutationObserver(() => this._syncAiLauncherState())
            .observe(panel, { attributes: true, attributeFilter: ['style'] });
        this._syncAiLauncherState();
    }

    private _buildHubPanel(): HTMLElement {
        const root = document.createElement('div');
        root.className = 'phub-container';

        const dispatch = (action: string) => {
            // §HUB-DISPATCH (2026-06-23) — definitive console signal for the founder.
            // If §HUB-CLICK logs but this does not, the click listener never reached
            // dispatch; if this logs runtimeEvents=false, the emit is hitting a null
            // bus (window.runtime not yet assigned) and the action will be lost.
            console.log(
                `[ProjectHub] §HUB-DISPATCH emitted=${action} runtimeEvents=${!!window.runtime?.events}`,
            );
            // §BACK-TO-PROJECT (2026-05-23) — navigation actions are emitted DIRECTLY on
            // the platform-lifetime window bus, not only via pryzm-hub-action →
            // PlatformProjectBrowser.handleHubMenuAction. The relay depends on the
            // toolbar's PlatformProjectBrowser being constructed AND its
            // window.runtime.events listener being live; when the right rail is used
            // without that, "Back to Projects" silently did nothing. PlatformRouter
            // listens for pryzm-go-hub / pryzm-sign-out on the `window` bus, so a direct
            // dispatch (mirroring PlatformProjectBrowser's own dual-dispatch) always navigates.
            if (action === 'back-hub') {
                window.runtime?.events?.emit('pryzm-go-hub', {});
                window.dispatchEvent(new Event('pryzm-go-hub'));
            } else if (action === 'sign-out') {
                window.runtime?.events?.emit('pryzm-sign-out', {});
                window.dispatchEvent(new Event('pryzm-sign-out'));
            } else {
                window.runtime?.events?.emit('pryzm-hub-action', { action }); // F.events.15
            }
            this._rail.close();
            this._refreshButtonStates();
        };

        // ── Helper: collapsible section card ────────────────────────────────
        const buildSection = (title: string, children: HTMLElement[], defaultOpen = true): HTMLElement => {
            const section = document.createElement('div');
            section.className = 'phub-section';

            const header = document.createElement('button');
            header.type = 'button';
            header.className = 'phub-section-header';
            header.setAttribute('aria-expanded', String(defaultOpen));
            header.innerHTML = `
                <span class="phub-section-bullet">•</span>
                <span class="phub-section-label">${title}</span>
                <svg class="phub-section-chevron${defaultOpen ? ' phub-section-chevron--open' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            `;

            const body = document.createElement('div');
            body.className = 'phub-section-body' + (defaultOpen ? ' phub-open' : '');
            for (const child of children) body.appendChild(child);

            header.addEventListener('click', () => {
                const open = body.classList.toggle('phub-open');
                header.setAttribute('aria-expanded', String(open));
                header.querySelector('.phub-section-chevron')?.classList.toggle('phub-section-chevron--open', open);
            });

            section.appendChild(header);
            section.appendChild(body);
            return section;
        };

        // ── Helper: action button item ───────────────────────────────────────
        const buildItem = (svg: string, label: string, action: string, badge?: string, mod?: string): HTMLElement => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'phub-item' + (mod ? ` phub-item--${mod}` : '');
            btn.dataset['hubAction'] = action;
            btn.innerHTML = `
                <span class="phub-item-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svg}</svg>
                </span>
                <span class="phub-item-label">${label}</span>
                ${badge ? `<span class="phub-item-badge">${badge}</span>` : ''}
            `;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log(`[ProjectHub] §HUB-CLICK action=${action}`); // proves the leaf click listener fired
                dispatch(action);
            });
            return btn;
        };

        // ── Project ──────────────────────────────────────────────────────────
        root.appendChild(buildSection('Project', [
            buildItem('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>', 'Back to Projects', 'back-hub', undefined, 'primary'),
            buildItem('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>', 'Save Project', 'save'),
            buildItem('<polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5L1 4v6h6l-2.35-2.35A7 7 0 1 1 5 11"/>', 'Version History', 'history', 'ISO'),
        ], true));

        // ── Export & Print ───────────────────────────────────────────────────
        root.appendChild(buildSection('Export &amp; Print', [
            buildItem('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="8 18 12 22 16 18"/><line x1="12" y1="12" x2="12" y2="22"/>', 'Export IFC', 'export-ifc'),
            buildItem('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 'Export GLB', 'export-glb'),
            buildItem('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 'Import PDF / Image', 'import-pdf'),
            buildItem('<rect x="1" y="1" width="14" height="14" rx="2"/><path d="M4 4h3.5L11 8l-3.5 4H4V4z"/>', 'Import DXF / DWG', 'import-dxf'),
            buildItem('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 'Import Revit (via IFC)', 'import-revit-guided'),
            buildItem('<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12h8M12 8l4 4-4 4"/>', 'Import Rhino (.3dm)', 'import-rhino'),
            buildItem('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>', 'Print / Export PDF', 'print'),
            buildItem('<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>', 'Import Manager', 'import-manager'),
        ], false));

        // ── Portfolio & API ──────────────────────────────────────────────────
        root.appendChild(buildSection('Portfolio &amp; API', [
            buildItem('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', 'Portfolio Analytics', 'portfolio', 'E-4'),
            buildItem('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.27 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.18 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8a16 16 0 0 0 6 6l.27-.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z"/>', 'Webhook Subscriptions', 'webhooks', 'E-2'),
        ], false));

        // ── Team & Compliance ────────────────────────────────────────────────
        root.appendChild(buildSection('Team &amp; Compliance', [
            buildItem('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 'Team Members', 'members', 'CDE'),
            buildItem('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>', 'CDE Document State', 'cde-state', '19650'),
        ], false));

        // ── Settings ─────────────────────────────────────────────────────────
        const settingsDefs: Array<{
            key: 'showRoomDataHints' | 'showRoomComplianceMessages' | 'showSaveWarningBanner' | 'showRoomVolumeColour';
            label: string;
            description: string;
        }> = [
            { key: 'showRoomDataHints',           label: 'Room Design Insights',    description: 'Ask "Why did you make this choice?" when room decisions deviate from templates' },
            { key: 'showRoomComplianceMessages',  label: 'Room Compliance Overlay',  description: 'Tint rooms red/orange by compliance status and show violation notifications (off by default)' },
            { key: 'showSaveWarningBanner',       label: 'Server Save Warning',      description: 'Show red warning banner when server sync is unavailable' },
            { key: 'showRoomVolumeColour',        label: 'Room Volume Colour',       description: 'Fill the full 3D height of each room with its colour' },
        ];

        const settingsChildren: HTMLElement[] = settingsDefs.map(d => this._buildToggleRow(d.key, d.label, d.description));
        settingsChildren.push(this._buildSliderRow('roomVolumeOpacity', 'Volume Opacity', 'How transparent the 3D room volume fill appears', 0.05, 0.60, 0.05));
        root.appendChild(buildSection('Settings', settingsChildren, false));

        // ── Room Bounding ─────────────────────────────────────────────────────
        const rbDesc = document.createElement('p');
        rbDesc.className = 'phub-section-desc';
        rbDesc.textContent = 'Control which element types participate in room boundary detection.';

        const rbChildren: HTMLElement[] = [
            rbDesc,
            this._buildRbReadOnlyRow('Walls', 'Always participates in room detection — cannot be disabled'),
            this._buildRbToggleRow('roomBoundingColumns',     'Columns',      'When ON, column footprint edges act as room boundaries'),
            this._buildRbToggleRow('roomBoundingCurtainWalls','Curtain Walls', 'When ON, curtain wall segments act as room boundaries'),
        ];
        root.appendChild(buildSection('Room Bounding', rbChildren, false));

        // ── Session ──────────────────────────────────────────────────────────
        root.appendChild(buildSection('Session', [
            buildItem('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 'Sign Out', 'sign-out', undefined, 'danger'),
        ], false));

        return root;
    }

    /**
     * Build a read-only "always ON" row for room bounding settings.
     * Used for Walls (cannot be toggled off).
     */
    private _buildRbReadOnlyRow(label: string, description: string): HTMLElement {
        const row = document.createElement('div');
        row.title = description;
        row.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'gap:10px', 'padding:8px 16px', 'font-size:12px',
            'color:var(--app-text,#1a2035)', 'user-select:none', 'opacity:0.75',
        ].join(';');

        const labelEl = document.createElement('span');
        labelEl.style.cssText = 'flex:1;line-height:1.3;';
        labelEl.textContent = label;

        const badge = document.createElement('span');
        badge.style.cssText = [
            'font-size:10px', 'padding:2px 7px', 'border-radius:4px',
            'background:#6600FF22', 'color:#6600FF',
            'font-weight:600', 'letter-spacing:0.03em',
        ].join(';');
        badge.textContent = 'ALWAYS ON';

        row.appendChild(labelEl);
        row.appendChild(badge);
        return row;
    }

    /**
     * Build a toggle row for a room bounding preference.
     * On change, also schedules room re-detection for all levels so the user
     * sees the effect immediately without editing any walls.
     */
    private _buildRbToggleRow(
        key: 'roomBoundingColumns' | 'roomBoundingCurtainWalls',
        label: string,
        description: string,
    ): HTMLElement {
        const isOn = UiPreferences.get(key);

        const row = document.createElement('label');
        row.className = 'pb-hub-toggle-row rb-toggle-row';
        row.title = description;
        row.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'gap:10px', 'padding:8px 16px', 'cursor:pointer',
            'font-size:12px', 'color:var(--app-text,#1a2035)', 'user-select:none',
        ].join(';');

        const labelEl = document.createElement('span');
        labelEl.style.cssText = 'flex:1;line-height:1.3;';
        labelEl.textContent = label;

        const toggle = document.createElement('div');
        toggle.className = 'pb-hub-toggle' + (isOn ? ' pb-hub-toggle--on' : '');
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(isOn));
        toggle.style.cssText = [
            'width:34px', 'height:18px', 'border-radius:9px', 'flex-shrink:0',
            'position:relative', 'transition:background 0.2s',
            'background:' + (isOn ? '#A855F7' : 'rgba(0,0,0,0.15)'),
        ].join(';');

        const thumb = document.createElement('div');
        thumb.style.cssText = [
            'position:absolute', 'top:3px',
            'left:' + (isOn ? '16px' : '3px'),
            'width:12px', 'height:12px',
            'border-radius:50%', 'background:#fff',
            'transition:left 0.2s', 'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
        ].join(';');
        toggle.appendChild(thumb);

        row.appendChild(labelEl);
        row.appendChild(toggle);

        row.addEventListener('click', () => {
            const newVal = !UiPreferences.get(key);
            UiPreferences.set(key, newVal);
            toggle.className = 'pb-hub-toggle' + (newVal ? ' pb-hub-toggle--on' : '');
            toggle.setAttribute('aria-checked', String(newVal));
            toggle.style.background = newVal ? '#A855F7' : 'rgba(0,0,0,0.15)';
            thumb.style.left = newVal ? '16px' : '3px';
            // Immediately re-detect rooms on all levels with the new setting
            const obs = window.roomTopologyObserver; // TODO(E.18-R): legacy roomTopologyObserver — replace with runtime.rooms.topologyObserver
            if (obs?.scheduleRedetectAllLevels) {
                obs.scheduleRedetectAllLevels();
                console.log(`[ProjectBrowserPanel] ${key}=${newVal} — room re-detection scheduled for all levels`);
            }
        });

        return row;
    }

    /**
     * Build a labelled range-slider row that reads/writes a numeric UiPreference.
     * The slider updates the preference live on every input event.
     */
    private _buildSliderRow(
        key: 'roomVolumeOpacity',
        label: string,
        description: string,
        min: number,
        max: number,
        step: number,
    ): HTMLElement {
        const current = UiPreferences.get(key) as number;

        const wrapper = document.createElement('div');
        wrapper.title = description;
        wrapper.style.cssText = [
            'display:flex', 'flex-direction:column', 'gap:4px',
            'padding:6px 16px 10px', 'font-size:12px',
            'color:var(--app-text,#1a2035)',
        ].join(';');

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

        const labelEl = document.createElement('span');
        labelEl.style.cssText = 'line-height:1.3;';
        labelEl.textContent = label;

        const valueEl = document.createElement('span');
        valueEl.style.cssText = [
            'font-size:11px', 'font-weight:600',
            'color:var(--app-accent,#6600FF)',
            'min-width:32px', 'text-align:right',
        ].join(';');
        valueEl.textContent = Math.round(current * 100) + '%';

        headerRow.appendChild(labelEl);
        headerRow.appendChild(valueEl);
        wrapper.appendChild(headerRow);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(current);
        slider.style.cssText = [
            'width:100%', 'height:4px', 'cursor:pointer',
            'accent-color:var(--app-accent,#6600FF)',
        ].join(';');

        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            valueEl.textContent = Math.round(val * 100) + '%';
            UiPreferences.set(key, val);
        });

        wrapper.appendChild(slider);
        return wrapper;
    }

    private _buildToggleRow(
        key: 'showRoomDataHints' | 'showRoomComplianceMessages' | 'showSaveWarningBanner' | 'showRoomVolumeColour',
        label: string,
        description: string,
    ): HTMLElement {
        const isOn = UiPreferences.get(key);

        const row = document.createElement('label');
        row.className = 'pb-hub-toggle-row';
        row.title = description;
        row.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:space-between',
            'gap:10px', 'padding:8px 16px', 'cursor:pointer',
            'font-size:12px', 'color:var(--app-text,#1a2035)',
            'user-select:none',
        ].join(';');

        const labelEl = document.createElement('span');
        labelEl.style.cssText = 'flex:1;line-height:1.3;';
        labelEl.textContent = label;

        const toggle = document.createElement('div');
        toggle.className = 'pb-hub-toggle' + (isOn ? ' pb-hub-toggle--on' : '');
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-checked', String(isOn));
        toggle.style.cssText = [
            'width:34px', 'height:18px', 'border-radius:9px', 'flex-shrink:0',
            'position:relative', 'transition:background 0.2s',
            'background:' + (isOn ? '#6600FF' : 'rgba(0,0,0,0.15)'),
        ].join(';');

        const thumb = document.createElement('div');
        thumb.style.cssText = [
            'position:absolute', 'top:3px',
            'left:' + (isOn ? '16px' : '3px'),
            'width:12px', 'height:12px',
            'border-radius:50%', 'background:#fff',
            'transition:left 0.2s', 'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
        ].join(';');
        toggle.appendChild(thumb);

        row.appendChild(labelEl);
        row.appendChild(toggle);

        row.addEventListener('click', () => {
            const newVal = !UiPreferences.get(key);
            UiPreferences.set(key, newVal);
            toggle.className = 'pb-hub-toggle' + (newVal ? ' pb-hub-toggle--on' : '');
            toggle.setAttribute('aria-checked', String(newVal));
            toggle.style.background = newVal ? '#6600FF' : 'rgba(0,0,0,0.15)';
            thumb.style.left = newVal ? '16px' : '3px';
        });

        return row;
    }

    // ── Camera & Render combined panel ────────────────────────────────────────

    private _buildCameraRenderPanel(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;gap:0;';

        // ── Render sections first (Visual / Viewport Style / Photorealistic / Export)
        root.appendChild(this._renderPanel.build());

        // ── Divider ───────────────────────────────────────────────────────────
        const divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:var(--app-border,#dde3ef);margin:4px 0;';
        root.appendChild(divider);

        // ── Camera controls below ─────────────────────────────────────────────
        root.appendChild(this._cameraPanel.build());

        return root;
    }

    // ── GIS / Geospatial panel ─────────────────────────────────────────────────

    private _buildGISPanel(): HTMLElement {
        const root = document.createElement('div');
        root.style.cssText = 'display:flex;flex-direction:column;gap:5px;padding:8px;';

        const activateRow = document.createElement('label');
        activateRow.style.cssText = [
            'display:flex', 'align-items:center', 'gap:10px', 'padding:8px 10px',
            'background:#f4f5fb', 'border:1px solid var(--app-border,#dde3ef)',
            'border-radius:8px', 'cursor:pointer',
            'transition:background 0.12s,border-color 0.12s',
        ].join(';');
        activateRow.title = 'Load the Cesium globe and activate GIS mode';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.style.cssText = 'width:15px;height:15px;accent-color:#6600ff;cursor:pointer;flex-shrink:0;';
        check.addEventListener('change', () => this._props.gisToggle?.(check.checked));

        const textWrap = document.createElement('div');
        textWrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;';

        const lbl = document.createElement('div');
        lbl.style.cssText = 'font-size:12px;font-weight:600;color:var(--app-text);user-select:none;';
        lbl.textContent = 'Activate Geospatial';

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:10px;color:var(--app-text-muted,#888);user-select:none;';
        desc.textContent = 'Loads Cesium globe, links BIM to Earth';

        textWrap.appendChild(lbl);
        textWrap.appendChild(desc);
        activateRow.appendChild(check);
        activateRow.appendChild(textWrap);
        root.appendChild(activateRow);

        const makeBtn = (icon: string, label: string, onClick: () => void) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = [
                'display:flex', 'align-items:center', 'gap:9px', 'width:100%',
                'padding:8px 10px', 'background:var(--app-panel-bg,#fff)',
                'border:1px solid var(--app-border,#dde3ef)', 'border-radius:7px',
                'cursor:pointer', 'font-family:var(--app-font)', 'text-align:left',
                'transition:background 0.12s,border-color 0.12s,color 0.12s',
            ].join(';');
            btn.innerHTML = `<span style="font-size:15px;flex-shrink:0;width:20px;text-align:center;">${icon}</span>
                <span style="font-size:12px;font-weight:500;">${label}</span>`;
            btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f4ff'; btn.style.borderColor = '#6600ff'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = ''; btn.style.borderColor = ''; });
            btn.addEventListener('click', onClick);
            return btn;
        };

        root.appendChild(makeBtn('✈', 'Fly To Reference',     () => this._props.gisFlyTo?.()));
        root.appendChild(makeBtn('📍', 'Place BIM on Earth',  () => this._props.gisPlaceBim?.()));

        // §GIS-ACTION-REGISTRY (L-1187) — RESTORED ROUTE, not a new feature.
        //
        // `openSiteInspectorPanel` (A.8.f — the authored C19 SiteModel: address,
        // lat/lon, parcel area, boundary thumbnail) had exactly ONE caller in the whole
        // app: `GISRailPanel.ts`, a class that is never instantiated anywhere. So the
        // Site Inspector has been unreachable, not merely buried — a verdict-(b) sole
        // route sitting on a verdict-(c) dead surface. Deleting that file without this
        // line would have deleted the capability along with the corpse.
        //
        // It is a plain button rather than a registry action because its dispatch is a
        // MODULE export, not one of the `window.pryzm*` entry points the registry
        // resolves. That asymmetry is known residue: the registry should grow a
        // module-backed action kind so this too is declared rather than hand-written.
        root.appendChild(makeBtn('📐', 'Site Inspector', () => {
            void import('../site/SiteInspectorPanel')
                .then((m) => m.openSiteInspectorPanel(this.runtime))
                .catch((err) => console.error('[GIS] open site inspector failed:', err));
        }));

        // Gizmo controls
        const gizmoHdr = document.createElement('div');
        gizmoHdr.style.cssText = [
            'font-size:10px', 'font-weight:700', 'letter-spacing:0.06em',
            'text-transform:uppercase', 'color:var(--app-text-muted,#888)',
            'padding:6px 2px 4px',
        ].join(';');
        gizmoHdr.textContent = 'Gizmo Controls';
        root.appendChild(gizmoHdr);

        const gizmoRow = document.createElement('div');
        gizmoRow.style.cssText = 'display:flex;gap:6px;';

        const makeGizmoBtn = (label: string, mode: number) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = [
                'flex:1', 'padding:7px 4px', 'background:var(--app-panel-bg,#fff)',
                'border:1px solid var(--app-border,#dde3ef)', 'border-radius:7px',
                'cursor:pointer', 'font-size:11px', 'font-weight:600',
                'color:var(--app-text)', 'font-family:var(--app-font)',
                'transition:background 0.12s,color 0.12s',
            ].join(';');
            btn.textContent = label;
            btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f4ff'; btn.style.color = '#6600ff'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = ''; btn.style.color = ''; });
            btn.addEventListener('click', () => this._props.gisGizmoMode?.(mode));
            return btn;
        };

        gizmoRow.appendChild(makeGizmoBtn('Translate', 0));
        gizmoRow.appendChild(makeGizmoBtn('Rotate', 1));
        root.appendChild(gizmoRow);

        const resetBtn = makeBtn('↺', 'Reset Georeference', () => this._props.gisResetGeoreference?.());
        resetBtn.style.marginTop = '2px';
        root.appendChild(resetBtn);

        // ── §GIS-ACTION-REGISTRY (L-1187, C06 §13) — the consolidated site controls ──
        //
        // The founder boxed three separate chrome surfaces (the top view-mode switch,
        // the "3D Site" sub-bar and the bottom-left floating pill stack) and drew
        // arrows from all of them to this panel's globe icon. They are rendered here
        // from ONE declaration, grouped by function, rather than copied in as a fourth
        // hand-written list — see `gisActionRegistry.ts` for why that distinction is
        // the whole fix.
        //
        // `window` is the host because the entry points these actions dispatch are the
        // typed `window.pryzm*` globals GISAreaLayout registers at boot (globals.d.ts).
        // Re-hosting the EXISTING dispatch is the rule; copying a handler in here is
        // exactly how the two rival GIS panels came to disagree.
        //
        // Actions with no registered entry point render DISABLED with their reason
        // shown — they are not painted as live buttons. `gisActionRegistry.test.ts`
        // fails the build if that ever stops being true.
        //
        // §GIS-ACTION-REGISTRY (L-1361) — the rows style themselves from the `.pb-gis-*`
        // rules in `styles/panels/projectBrowser.ts`, which are built entirely out of the
        // shared `--app-*` / `--pryzm-*` tokens. Nothing here sets a colour: C84 EI-8
        // records two measured hex drifts in this codebase already, and a literal here
        // would also be invisible to the §UI-DENSITY-SCALE transform (it rewrites the
        // injected stylesheet, and cannot see `Object.assign(el.style, …)`).
        const sep = document.createElement('div');
        sep.className = 'pb-gis-rule';
        sep.style.cssText = 'height:1px;background:var(--app-border-light);margin:10px 0 2px;';
        root.appendChild(sep);
        root.appendChild(renderGisActions(window as unknown as GisCapabilityHost));

        // ── §GIS-ENVELOPE-REHOST (L-1362, C06 §13.3) — the buildability read-out ──
        //
        // Founder 2026-08-20: "we had a panel with the BUILDABILITY etc — this should go
        // also to the GIS panel." Not the toggle that draws the envelope (that is the
        // `site.buildable-envelope` action above) — the NUMBERS: buildable area, setbacks,
        // edificabilitat/height, the verdict.
        //
        // ⛔ NOTHING IS RE-IMPLEMENTED HERE. That card is four render templates carrying a
        // refusal doctrine — a full determination, a REDUCED card when only the ring was
        // persisted and its provenance was not re-derived, a coverage-gap card, and a
        // refusal card — plus the branch that removes itself when there is genuinely no
        // envelope. Rebuilding that in this panel would be the exact C06 §13.3 breach that
        // gave this codebase two disagreeing GIS surfaces, except this time the two
        // surfaces would disagree about whether land is buildable.
        //
        // So the panel offers a SLOT and asks the owner to render into it. The element that
        // appears is the same element, produced by the same C58 code, with every refusal
        // branch intact.
        const envelopeSlot = document.createElement('div');
        envelopeSlot.className = 'pb-gis-envelope-slot';
        envelopeSlot.setAttribute('data-testid', 'gis-envelope-slot');
        root.appendChild(envelopeSlot);

        // Mounted after the slot is in the DOM: the host seam ignores a detached element on
        // purpose, so that a closed panel can never strand the card.
        queueMicrotask(() => {
            if (!envelopeSlot.isConnected) return;
            const present = window.pryzmMountEnvelopeCard?.(envelopeSlot) ?? false;
            if (present) return;

            // ⚠ `false` does NOT mean the mount failed. It means C58 determined there is
            // nothing honest to show yet. Saying that in WORDS is mandatory: a blank
            // container reads as a crash rather than as "we could not determine this"
            // (L-553), and it must never be softened into zeros — a 0/0/0 envelope REFUSES
            // to draw rather than overstate on real land (§L-616 / C58 §1.16), and an
            // unknown constraint rendered as a zero makes failure and emptiness the same
            // value (C84 EI-1b).
            const empty = document.createElement('div');
            empty.className = 'pb-gis-envelope-empty';
            empty.setAttribute('data-testid', 'gis-envelope-empty');
            empty.textContent =
                'No buildable envelope determined yet. Set a site location and commit a parcel '
                + 'boundary — the figures appear here once they can be derived, and stay absent '
                + 'rather than shown as zero when they cannot.';
            envelopeSlot.appendChild(empty);
        });

        return root;
    }

    // ── Inspect panel (Model Tree + Provenance) ─────────────────────────────────
    //
    // A.24 / A.31.e — promotes the dev-only modelTreeTestModal wiring into a
    // first-class rail panel. Builds via `buildInspectPanel(runtime)` which
    // mounts the canonical ModelTreeComponent + an embedded ProvenanceTab and
    // wires the isolation pipeline. The previous handle is disposed first so
    // each re-open starts a fresh tree/animator/subscription set.
    private _buildInspectPanel(): HTMLElement {
        try { this._inspectHandle?.dispose(); } catch { /* defensive */ }
        this._inspectHandle = buildInspectPanel(this.runtime);
        return this._inspectHandle.element;
    }

    private _buildSection(
        id:      string,
        label:   string,
        buildFn: () => HTMLElement,
    ): HTMLElement {
        const section = document.createElement('div');
        section.className = 'pb-section';
        section.dataset['sectionId'] = id;

        const header = document.createElement('button');
        header.className = 'pb-section-header';
        header.type = 'button';
        header.setAttribute('aria-expanded', 'false');
        header.setAttribute('aria-label', label);
        header.title = label;

        const iconEl = document.createElement('span');
        iconEl.className = 'pb-section-icon';
        iconEl.innerHTML = SECTION_ICONS[id] ??
            `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="5"/>
            </svg>`;
        iconEl.setAttribute('aria-hidden', 'true');
        header.appendChild(iconEl);

        header.addEventListener('click', () => {
            const noHdr = id === 'BROWSER' || id === 'DOCUMENTS';
            this._rail.toggle(id, label, buildFn, noHdr ? { noHeader: true } : {});
            this._refreshButtonStates();
        });

        section.appendChild(header);
        return section;
    }

    private _refreshButtonStates(): void {
        const sections = this._root.querySelectorAll('[data-section-id]');
        sections.forEach(sec => {
            const sectionId = (sec as HTMLElement).dataset['sectionId'] ?? '';
            const isActive  = sectionId === this._rail.activeId;

            // Logo button uses pb-logo-btn; regular sections use pb-section-header
            const logoBtn = sec.querySelector('.pb-logo-btn');
            if (logoBtn) {
                logoBtn.classList.toggle('pb-logo-btn--active', isActive);
                logoBtn.setAttribute('aria-expanded', String(isActive));
                return;
            }

            const header = sec.querySelector('.pb-section-header');
            if (!header) return;
            header.classList.toggle('pb-section-header--active', isActive);
            header.setAttribute('aria-expanded', String(isActive));
        });
    }
}
