import { escHtml } from '@pryzm/ui-base';
import { triggerWindowResize } from '../../engine/triggerWindowResize'; // F.events.16
/**
 * ## DataWorkbench — BIM 3.0 Lifecycle Hub (Phase 1: Navigation Refactor)
 *
 * Layer Affected:    UI — Data Workbench Layout Controller
 * File:             src/ui/dataworkbench/DataWorkbench.ts
 *
 * Contract:         docs/02-decisions/contracts/05-BIM-UI-ARCHITECTURE-CONTRACT.md §3
 * CSS class prefix: `dw-` (registered in §05 §3 contract table)
 * CSS source:       src/styles/panels/dataWorkbench.ts → injected via AppTheme.ts
 *
 * ── Architecture: 6-Bucket Lifecycle Navigation ───────────────────────────────
 *
 *  Left rail: 6 "Lifecycle Bucket" icons (56px wide)
 *  Secondary: Horizontal sub-tab pill strip below the header
 *
 *  STRATEGIZE (◈)  — Programme | Templates | Generative
 *  AUDIT      (⬡)  — Hierarchy+DataSheet (split) | Quantities | Spatial | Intent | AI Query
 *  VALIDATE   (◎)  — Compliance | Analytics | Physics
 *  MATERIALS  (◩)  — BIM Materials | Render Materials | Element Types
 *  LIFECYCLE  (⏱)  — History | Graph | Portfolio | Occupancy
 *  DATA       (▦)  — Materials | Walls | Doors | Windows | Floors | Slabs |
 *                     Columns | Beams | Stairs
 *
 * AUDIT special layout: Hierarchy tree (left, ~55%) + DataSheet (right, ~45%)
 *   shown side-by-side. DataSheet slides in on first node selection.
 *
 * Empty-state default: STRATEGIZE → Programme (define targets before modelling).
 *
 * Layout modes:
 *   hidden  — workbench display:none; #container = 100% width
 *   panel   — workbench = 380px right; #container = calc(100% - 380px)
 *   split   — workbench = 50%; #container = 50%
 *   full    — workbench = 100%; #container = 0%
 *
 * ── Wave 14 split (FILE 7) ────────────────────────────────────────────────────
 *  Shell (~660 LOC) + 7 zone files in buckets/:
 *    DWHelpers.ts          — escapeHtml / formatMaterialColor / formatMetres
 *    StrategizeBucket.ts   — mountGenerativePanel
 *    AuditBucket.ts        — mountQuantitySchedules / mountVisibilityIntentAccess
 *    ValidateBucket.ts     — mountPhysicsPanel
 *    MaterialsBucket.ts    — mountMaterialLibrary / mountRenderMaterials / mountElementTypes
 *    LifecycleBucket.ts    — mountLifecyclePanels
 *    DataSchedulesBucket.ts — mountTypeSchedule / mountMaterialSchedule / row builders /
 *                             rebuildAllDataSchedules / rebuildActiveDataSchedule
 */

import { HierarchyTreePanel }        from './HierarchyTreePanel';
import { DataSheetPanel }            from './DataSheetPanel';
import { TemplateEditorPanel }       from './TemplateEditorPanel';
import { AnalyticsPanel }            from './AnalyticsPanel';
import { CompliancePanel }           from './CompliancePanel';
import { SpatialQueryPanel }         from './SpatialQueryPanel';
import { ProgrammePanel }            from './ProgrammePanel';
import { RelationshipExplorerPanel } from './RelationshipExplorerPanel';
import { NLQueryPanel }              from './NLQueryPanel';
import { DesignHistoryPanel }        from './DesignHistoryPanel';
import { dataVisualizer, type HeatmapMode } from './DataVisualizerService';

// ── Bucket zone imports ───────────────────────────────────────────────────────
import { mountGenerativePanel }              from './buckets/StrategizeBucket';
import { mountQuantitySchedules,
         mountVisibilityIntentAccess }       from './buckets/AuditBucket';
import { mountPhysicsPanel }                 from './buckets/ValidateBucket';
import { mountMaterialLibrary,
         mountRenderMaterials,
         mountElementTypes }                 from './buckets/MaterialsBucket';
import { mountLifecyclePanels }              from './buckets/LifecycleBucket';
import { mountMaterialSchedule,
         mountTypeSchedule,
         wallTypeRows, doorTypeRows, windowTypeRows,
         floorTypeRows, slabTypeRows,
         columnTypeRows, beamTypeRows, stairTypeRows,
         rebuildAllDataSchedules,
         rebuildActiveDataSchedule }         from './buckets/DataSchedulesBucket';
import type { IDataWorkbench }               from '@pryzm/editor-ui';

// ── Types ─────────────────────────────────────────────────────────────────────

export type WorkbenchMode = 'hidden' | 'panel' | 'split' | 'full';

type TabId =
    | 'hierarchy' | 'data-sheet' | 'templates' | 'analytics'
    | 'compliance' | 'spatial-query' | 'programme' | 'relationships'
    | 'nl-query' | 'design-history' | 'physics' | 'generative'
    | 'portfolio' | 'lifecycle' | 'visibility-intent'
    | 'materials-library' | 'render-materials' | 'element-types' | 'quantity-schedules'
    | 'data-materials' | 'data-wall-types' | 'data-door-types' | 'data-window-types'
    | 'data-floor-types' | 'data-slab-types' | 'data-column-types' | 'data-beam-types'
    | 'data-stair-types';

type BucketId = 'strategize' | 'audit' | 'validate' | 'materials-bucket' | 'lifecycle-bucket' | 'data-schedules';

interface SubTabDef { id: TabId; label: string; icon: string; }

interface BucketDef {
    id:           BucketId;
    label:        string;
    icon:         string;
    accentColor:  string;
    defaultTab:   TabId;
    subTabs:      SubTabDef[];
}

// ── Bucket definitions ────────────────────────────────────────────────────────

const BUCKETS: BucketDef[] = [
    {
        id: 'strategize',
        label: 'STRATEGIZE',
        icon: '◈',
        accentColor: '#6600FF',
        defaultTab: 'programme',
        subTabs: [
            { id: 'programme',  label: 'Programme',  icon: '⊫' },
            { id: 'templates',  label: 'Templates',  icon: '⊡' },
            { id: 'generative', label: 'Generative', icon: '⊛' },
        ],
    },
    {
        id: 'audit',
        label: 'AUDIT',
        icon: '⬡',
        accentColor: '#3B8BD4',
        defaultTab: 'hierarchy',
        subTabs: [
            { id: 'hierarchy',          label: 'Hierarchy',  icon: '⬡' },
            { id: 'quantity-schedules', label: 'Quantities', icon: '∑' },
            { id: 'spatial-query',      label: 'Spatial',    icon: '⊕' },
            { id: 'visibility-intent',  label: 'Intent',     icon: '◐' },
            { id: 'nl-query',           label: 'AI Query',   icon: '✦' },
        ],
    },
    {
        id: 'validate',
        label: 'VALIDATE',
        icon: '◎',
        accentColor: '#1D9E75',
        defaultTab: 'compliance',
        subTabs: [
            { id: 'compliance', label: 'Compliance', icon: '◎' },
            { id: 'analytics',  label: 'Analytics',  icon: '∿' },
            { id: 'physics',    label: 'Physics',    icon: '⚡' },
        ],
    },
    {
        id: 'materials-bucket',
        label: 'MATERIALS',
        icon: '◩',
        accentColor: '#D4580A',
        defaultTab: 'materials-library',
        subTabs: [
            { id: 'materials-library', label: 'BIM Materials',    icon: '◩' },
            { id: 'render-materials',  label: 'Render Materials', icon: '◫' },
            { id: 'element-types',     label: 'Element Types',    icon: '▤' },
        ],
    },
    {
        id: 'lifecycle-bucket',
        label: 'LIFECYCLE',
        icon: '⏱',
        accentColor: '#E24B4A',
        defaultTab: 'design-history',
        subTabs: [
            { id: 'design-history', label: 'History',   icon: '⏱' },
            { id: 'relationships',  label: 'Graph',     icon: '⋈' },
            { id: 'portfolio',      label: 'Portfolio', icon: '⊙' },
            { id: 'lifecycle',      label: 'Occupancy', icon: '⊘' },
        ],
    },
    {
        id: 'data-schedules',
        label: 'DATA',
        icon: '▦',
        accentColor: '#0C7A6E',
        defaultTab: 'data-materials',
        subTabs: [
            { id: 'data-materials',    label: 'Materials', icon: '◩' },
            { id: 'data-wall-types',   label: 'Walls',     icon: '▬' },
            { id: 'data-door-types',   label: 'Doors',     icon: '▭' },
            { id: 'data-window-types', label: 'Windows',   icon: '▪' },
            { id: 'data-floor-types',  label: 'Floors',    icon: '▦' },
            { id: 'data-slab-types',   label: 'Slabs',     icon: '▤' },
            { id: 'data-column-types', label: 'Columns',   icon: '│' },
            { id: 'data-beam-types',   label: 'Beams',     icon: '─' },
            { id: 'data-stair-types',  label: 'Stairs',    icon: '⋮' },
        ],
    },
];

// ── DataWorkbench class ───────────────────────────────────────────────────────

export class DataWorkbench implements IDataWorkbench {
    private _el!:             HTMLElement;
    private _bucketRailEl!:   HTMLElement;
    private _contentEl!:      HTMLElement;
    private _headerEl!:       HTMLElement;
    private _bucketHeaderEl!: HTMLElement;
    private _subTabBarEl!:    HTMLElement;

    private _activeBucket: BucketId = 'strategize';
    private _activeTab:    TabId    = 'programme';
    private _mode:         WorkbenchMode = 'hidden';

    private _bucketMemory = new Map<BucketId, TabId>();
    private _panels       = new Map<TabId, HTMLElement>();

    // AUDIT split container
    private _auditSplitEl!:     HTMLElement;
    private _auditTreePane!:    HTMLElement;
    private _auditSheetPane!:   HTMLElement;
    private _auditSheetVisible = false;

    // Heatmap / visualizer bar (shown inside AUDIT bucket)
    private _heatmapBarEl!: HTMLElement;

    // Panel instances
    private _hierarchyPanel!:      HierarchyTreePanel;
    private _dataSheetPanel!:      DataSheetPanel;
    private _templateEditorPanel!: TemplateEditorPanel;
    private _analyticsPanel!:      AnalyticsPanel;
    private _compliancePanel!:     CompliancePanel;
    private _spatialQueryPanel!:   SpatialQueryPanel;
    private _programmePanel!:      ProgrammePanel;
    private _relationshipPanel!:   RelationshipExplorerPanel;
    private _nlQueryPanel!:        NLQueryPanel;
    private _designHistoryPanel!:  DesignHistoryPanel;
    private _analyticsBuilt = false;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        BUCKETS.forEach(b => this._bucketMemory.set(b.id, b.defaultTab));
        this._buildDOM();
        this._bindEvents();
        console.log('[DataWorkbench] BIM 3.0 Lifecycle Hub initialized');
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    get mode(): WorkbenchMode { return this._mode; }

    setMode(mode: WorkbenchMode): void {
        if (this._mode === mode) return;
        this._mode = mode;
        this._applyMode();
        triggerWindowResize(); // F.events.16
        console.log(`[DataWorkbench] Mode → ${mode}`);
    }

    toggle(preferredMode: WorkbenchMode = 'panel'): void {
        this.setMode(this._mode === 'hidden' ? preferredMode : 'hidden');
    }

    show(tab?: TabId): void {
        if (tab) this._navigateToTab(tab);
        this.setMode('panel');
    }

    hide(): void { this.setMode('hidden'); }

    refresh(): void {
        this._hierarchyPanel.refresh();
        this._dataSheetPanel.refresh();
        this._templateEditorPanel.refresh();
        this._compliancePanel.refresh();
        this._spatialQueryPanel.refresh();
        this._programmePanel.refresh();
        this._relationshipPanel.refresh();
        this._nlQueryPanel.refresh();
        this._designHistoryPanel.refresh();
        rebuildAllDataSchedules(this._panels);
    }

    // ── Navigate to a specific tab (auto-selects the right bucket) ─────────────

    private _navigateToTab(tabId: TabId): void {
        const bucket = BUCKETS.find(b => b.subTabs.some(st => st.id === tabId));
        if (!bucket) return;
        this._switchBucket(bucket.id, tabId);
    }

    // ── DOM construction ───────────────────────────────────────────────────────

    private _buildDOM(): void {
        this._el = document.createElement('div');
        this._el.id = 'dw-workbench';
        this._el.className = 'dw--hidden';

        this._buildBucketRail();
        this._buildContentArea();

        this._el.appendChild(this._bucketRailEl);
        this._el.appendChild(this._contentEl);
        document.body.appendChild(this._el);

        this._panels.forEach(panel => { panel.style.display = 'none'; });
        this._showActiveContent();
    }

    // ── Bucket rail (left, 56px) ───────────────────────────────────────────────

    private _buildBucketRail(): void {
        this._bucketRailEl = document.createElement('nav');
        this._bucketRailEl.className = 'dw-bucket-rail';
        this._bucketRailEl.setAttribute('aria-label', 'Lifecycle buckets');

        for (const bucket of BUCKETS) {
            const btn = document.createElement('button');
            btn.className  = 'dw-bucket-btn' + (bucket.id === this._activeBucket ? ' dw-bucket-btn--active' : '');
            btn.dataset.bucket = bucket.id;
            btn.title      = bucket.label;
            btn.setAttribute('aria-label', bucket.label);
            btn.style.setProperty('--bucket-color', bucket.accentColor);
            btn.innerHTML = `
                <span class="dw-bucket-icon">${bucket.icon}</span>
                <span class="dw-bucket-label">${bucket.label}</span>
            `;
            btn.addEventListener('click', () => this._switchBucket(bucket.id));
            this._bucketRailEl.appendChild(btn);
        }
    }

    // ── Content area (right) ───────────────────────────────────────────────────

    private _buildContentArea(): void {
        this._contentEl = document.createElement('div');
        this._contentEl.className = 'dw-content';

        this._headerEl = document.createElement('div');
        this._headerEl.className = 'dw-content-header dw-content-header--lifecycle';

        this._bucketHeaderEl = document.createElement('div');
        this._bucketHeaderEl.className = 'dw-bucket-header';

        this._subTabBarEl = document.createElement('div');
        this._subTabBarEl.className = 'dw-subtab-bar';

        this._heatmapBarEl = this._buildHeatmapBar();

        this._headerEl.appendChild(this._bucketHeaderEl);
        this._headerEl.appendChild(this._subTabBarEl);
        this._headerEl.appendChild(this._heatmapBarEl);
        this._contentEl.appendChild(this._headerEl);

        // ── AUDIT split container (hierarchy + data-sheet side by side) ────────
        this._auditSplitEl = document.createElement('div');
        this._auditSplitEl.className = 'dw-audit-split';
        this._auditSplitEl.style.display = 'none';

        this._auditTreePane = document.createElement('div');
        this._auditTreePane.className = 'dw-audit-tree-pane';

        this._auditSheetPane = document.createElement('div');
        this._auditSheetPane.className = 'dw-audit-sheet-pane dw-audit-sheet-pane--hidden';

        const sheetClose = document.createElement('button');
        sheetClose.className = 'dw-audit-sheet-close';
        sheetClose.title = 'Close data sheet';
        sheetClose.textContent = '×';
        sheetClose.addEventListener('click', () => this._hideAuditSheet());
        this._auditSheetPane.appendChild(sheetClose);

        this._auditSplitEl.appendChild(this._auditTreePane);
        this._auditSplitEl.appendChild(this._auditSheetPane);
        this._contentEl.appendChild(this._auditSplitEl);

        // ── Mount all individual panel DOM nodes ───────────────────────────────
        const allTabIds: TabId[] = [
            'hierarchy', 'data-sheet', 'templates', 'analytics',
            'compliance', 'spatial-query', 'programme', 'relationships',
            'nl-query', 'design-history', 'physics', 'generative',
            'portfolio', 'lifecycle', 'visibility-intent',
            'materials-library', 'render-materials', 'element-types', 'quantity-schedules',
            'data-materials', 'data-wall-types', 'data-door-types', 'data-window-types',
            'data-floor-types', 'data-slab-types', 'data-column-types', 'data-beam-types',
            'data-stair-types',
        ];

        for (const id of allTabIds) {
            const panel = document.createElement('div');
            panel.className = 'dw-panel';
            panel.dataset.panel = id;
            this._panels.set(id, panel);
            if (id !== 'hierarchy' && id !== 'data-sheet') {
                this._contentEl.appendChild(panel);
            }
        }

        this._auditTreePane.appendChild(this._panels.get('hierarchy')!);
        this._auditSheetPane.appendChild(this._panels.get('data-sheet')!);

        // ── Mount panel instances ──────────────────────────────────────────────
        // Phase B.21–B.30 (S73-WIRE) — forward composed runtime to every
        // dataworkbench sub-panel so each can route data resolution through
        // the typed PryzmRuntime handle once the C-phase plugins land.
        this._hierarchyPanel      = new HierarchyTreePanel(this._panels.get('hierarchy')!,           this.runtime);
        this._dataSheetPanel      = new DataSheetPanel(this._panels.get('data-sheet')!,              this.runtime);
        this._templateEditorPanel = new TemplateEditorPanel(this._panels.get('templates')!,          this.runtime);
        this._compliancePanel     = new CompliancePanel(this._panels.get('compliance')!,             this.runtime);
        this._spatialQueryPanel   = new SpatialQueryPanel(this._panels.get('spatial-query')!,        this.runtime);
        this._programmePanel      = new ProgrammePanel(this._panels.get('programme')!,               this.runtime);
        this._relationshipPanel   = new RelationshipExplorerPanel(this._panels.get('relationships')!, this.runtime);
        this._nlQueryPanel        = new NLQueryPanel(this._panels.get('nl-query')!,                  this.runtime);
        this._designHistoryPanel  = new DesignHistoryPanel(this._panels.get('design-history')!,      this.runtime);

        // Phase B.20 (S73-WIRE) — forward composed runtime to AnalyticsPanel
        this._analyticsPanel = new AnalyticsPanel(this.runtime);
        this._mountPlaceholder('analytics', '∿', 'Analytics', 'Charts load on first visit to this tab.');

        // STRATEGIZE › Generative — StrategizeBucket.ts
        mountGenerativePanel(this._panels.get('generative')!, this.runtime);

        // VALIDATE › Physics — ValidateBucket.ts
        mountPhysicsPanel(this._panels.get('physics')!, this.runtime);

        // LIFECYCLE — LifecycleBucket.ts
        mountLifecyclePanels(
            this._panels.get('portfolio')!,
            this._panels.get('lifecycle'),
            this.runtime,
        );

        // AUDIT — AuditBucket.ts
        mountVisibilityIntentAccess(this._panels.get('visibility-intent')!);
        mountQuantitySchedules(this._panels.get('quantity-schedules')!);

        // MATERIALS — MaterialsBucket.ts
        mountMaterialLibrary(this._panels.get('materials-library')!);
        mountRenderMaterials(this._panels.get('render-materials')!);
        mountElementTypes(this._panels.get('element-types')!);

        // DATA › schedules — DataSchedulesBucket.ts
        mountMaterialSchedule(this._panels.get('data-materials')!);
        mountTypeSchedule(this._panels.get('data-wall-types')!,   'Wall Types',        wallTypeRows());
        mountTypeSchedule(this._panels.get('data-door-types')!,   'Door Types',        doorTypeRows());
        mountTypeSchedule(this._panels.get('data-window-types')!, 'Window Types',      windowTypeRows());
        mountTypeSchedule(this._panels.get('data-floor-types')!,  'Floor Types',       floorTypeRows());
        mountTypeSchedule(this._panels.get('data-slab-types')!,   'Slab Types',        slabTypeRows());
        mountTypeSchedule(this._panels.get('data-column-types')!, 'Column Types (UC)', columnTypeRows());
        mountTypeSchedule(this._panels.get('data-beam-types')!,   'Beam Types (UB)',   beamTypeRows());
        mountTypeSchedule(this._panels.get('data-stair-types')!,  'Stair Types',       stairTypeRows());

        this._rebuildSubTabBar();
    }

    // ── Heatmap toolbar (AUDIT bucket secondary bar) ───────────────────────────

    private _buildHeatmapBar(): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'dw-heatmap-bar';
        bar.style.display = 'none';

        const modes: Array<{ mode: HeatmapMode; label: string; title: string }> = [
            { mode: 'off',        label: 'Off',        title: 'No heatmap overlay'                        },
            { mode: 'sync-state', label: 'Sync',       title: 'Colour by sync state (synced/conflict/…)'  },
            { mode: 'occupancy',  label: 'Occupancy',  title: 'Colour by occupancy classification group'  },
            { mode: 'compliance', label: 'Compliance', title: 'Passing=green / Partial=amber / Failing=red'},
            { mode: 'area-delta', label: 'Area Δ',     title: 'Compare actual vs. target area'            },
        ];

        const label = document.createElement('span');
        label.className = 'dw-heatmap-label';
        label.textContent = 'Heatmap:';
        bar.appendChild(label);

        for (const { mode, label: lbl, title } of modes) {
            const btn = document.createElement('button');
            btn.className = 'dw-viz-btn' + (mode === 'off' ? ' dw-viz-btn--active' : '');
            btn.dataset.vizMode = mode;
            btn.textContent = lbl;
            btn.title = title;
            btn.addEventListener('click', () => {
                dataVisualizer.setMode(mode);
                this._syncHeatmapButtons();
            });
            bar.appendChild(btn);
        }

        return bar;
    }

    private _syncHeatmapButtons(): void {
        const activeMode = dataVisualizer.mode;
        this._heatmapBarEl.querySelectorAll('.dw-viz-btn').forEach(el => {
            const b = el as HTMLElement;
            b.classList.toggle('dw-viz-btn--active', b.dataset.vizMode === activeMode);
        });
    }

    // ── Placeholder helper ─────────────────────────────────────────────────────

    private _mountPlaceholder(tabId: TabId, icon: string, title: string, desc: string): void {
        const panel = this._panels.get(tabId)!;
        panel.innerHTML = `
            <div class="dw-placeholder">
                <div class="dw-placeholder-icon">${icon}</div>
                <div style="font-weight:600;font-size:13px;color:var(--app-text,#1a2035);margin-bottom:4px">${title}</div>
                <div style="font-size:12px;max-width:200px;text-align:center;line-height:1.6;color:var(--app-text-muted,#7a8aaa)">${desc}</div>
            </div>
        `;
    }

    // ── Bucket switching ───────────────────────────────────────────────────────

    private _switchBucket(bucketId: BucketId, forceTab?: TabId): void {
        const bucket = BUCKETS.find(b => b.id === bucketId)!;

        if (this._activeBucket !== bucketId) {
            this._bucketMemory.set(this._activeBucket, this._activeTab);
        }

        this._activeBucket = bucketId;
        this._activeTab    = forceTab ?? (this._bucketMemory.get(bucketId) ?? bucket.defaultTab);

        this._bucketRailEl.querySelectorAll('.dw-bucket-btn').forEach(el => {
            const b = el as HTMLElement;
            const isActive = b.dataset.bucket === bucketId;
            b.classList.toggle('dw-bucket-btn--active', isActive);
            if (isActive) b.style.setProperty('--bucket-color', bucket.accentColor);
        });

        this._rebuildSubTabBar();
        this._showActiveContent();

        console.log(`[DataWorkbench] Bucket → ${bucketId} / Tab → ${this._activeTab}`);
    }

    // ── Sub-tab switching within a bucket ──────────────────────────────────────

    private _switchSubTab(tabId: TabId): void {
        if (this._activeTab === tabId) return;
        this._activeTab = tabId;
        this._bucketMemory.set(this._activeBucket, tabId);

        this._subTabBarEl.querySelectorAll('.dw-subtab-btn').forEach(el => {
            const b = el as HTMLElement;
            b.classList.toggle('dw-subtab-btn--active', b.dataset.subtab === tabId);
        });

        this._showActiveContent();
    }

    // ── Rebuild sub-tab pill bar for active bucket ─────────────────────────────

    private _rebuildSubTabBar(): void {
        this._subTabBarEl.innerHTML = '';
        const bucket = BUCKETS.find(b => b.id === this._activeBucket)!;

        if (this._heatmapBarEl) {
            this._heatmapBarEl.style.display = this._activeBucket === 'audit' ? 'flex' : 'none';
            if (this._activeBucket === 'audit') this._syncHeatmapButtons();
        }

        if (this._bucketHeaderEl) {
            const accent = bucket.accentColor;
            this._bucketHeaderEl.style.background = `linear-gradient(135deg, ${accent}cc 0%, ${accent} 100%)`;
            this._bucketHeaderEl.innerHTML = `
                <div class="dw-bucket-header-left">
                    <span class="dw-bucket-header-icon">${bucket.icon}</span>
                    <span class="dw-bucket-header-title">${bucket.label}</span>
                    <span class="dw-bucket-header-count">${bucket.subTabs.length} views</span>
                </div>
            `;
        }

        for (const st of bucket.subTabs) {
            const btn = document.createElement('button');
            btn.className  = 'dw-subtab-btn' + (st.id === this._activeTab ? ' dw-subtab-btn--active' : '');
            btn.dataset.subtab = st.id;
            btn.style.setProperty('--bucket-color', bucket.accentColor);
            btn.innerHTML = `<span class="dw-subtab-icon">${st.icon}</span>${st.label}`;
            btn.addEventListener('click', () => this._switchSubTab(st.id));
            this._subTabBarEl.appendChild(btn);
        }
    }

    // ── Show active content based on current bucket + sub-tab ─────────────────

    private _showActiveContent(): void {
        const isAuditHierarchy = this._activeBucket === 'audit' && this._activeTab === 'hierarchy';

        this._auditSplitEl.style.display = isAuditHierarchy ? 'flex' : 'none';

        this._panels.forEach((panel, id) => {
            if (id === 'hierarchy' || id === 'data-sheet') {
                panel.style.display = 'flex';
                return;
            }
            panel.style.display = (!isAuditHierarchy && id === this._activeTab) ? 'flex' : 'none';
        });

        if (this._activeTab === 'analytics' && !this._analyticsBuilt && !isAuditHierarchy) {
            this._analyticsBuilt = true;
            const analyticsEl = this._panels.get('analytics')!;
            analyticsEl.innerHTML = '';
            this._analyticsPanel.build().then(el => {
                analyticsEl.appendChild(el);
            }).catch(err => {
                analyticsEl.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:0.8rem;">Analytics error: ${escHtml(err instanceof Error ? err.message : String(err))}</div>`;
            });
        }

        if (this._activeBucket === 'data-schedules' && !isAuditHierarchy) {
            rebuildActiveDataSchedule(this._panels, this._activeTab);
        }
    }

    // ── AUDIT sheet pane helpers ───────────────────────────────────────────────

    private _showAuditSheet(): void {
        if (this._auditSheetVisible) return;
        this._auditSheetVisible = true;
        this._auditSheetPane.classList.remove('dw-audit-sheet-pane--hidden');
        this._auditTreePane.classList.add('dw-audit-tree-pane--narrow');
    }

    private _hideAuditSheet(): void {
        if (!this._auditSheetVisible) return;
        this._auditSheetVisible = false;
        this._auditSheetPane.classList.add('dw-audit-sheet-pane--hidden');
        this._auditTreePane.classList.remove('dw-audit-tree-pane--narrow');
    }

    // ── Mode application ───────────────────────────────────────────────────────

    private _applyMode(): void {
        const container = document.getElementById('container');
        this._el.classList.remove('dw--hidden', 'dw--split', 'dw--full');

        switch (this._mode) {
            case 'hidden':
                this._el.classList.add('dw--hidden');
                if (container) container.style.width = '';
                break;
            case 'panel':
                this._el.style.width = '420px';
                if (container) container.style.width = 'calc(100% - 420px)';
                break;
            case 'split':
                this._el.classList.add('dw--split');
                if (container) container.style.width = '50%';
                break;
            case 'full':
                this._el.classList.add('dw--full');
                if (container) container.style.width = '0';
                break;
        }
    }

    // ── Event binding ──────────────────────────────────────────────────────────

    private _bindEvents(): void {
        // F.events.10 — pryzm-toggle-workbench via runtime.events
        window.runtime?.events?.on('pryzm-toggle-workbench', () => this.toggle('panel'));

        window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
            setTimeout(() => this.refresh(), 50);
        });

        // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
        this.runtime?.events?.on('pryzm-workspace-mode', (payload: unknown) => {
            const mode = (payload as { mode?: string })?.mode;
            if (mode === 'inspect') {
                this._switchBucket('audit', 'hierarchy');
            }
        });

        this.runtime?.events?.on('pryzm-element-selected', (detail) => {
            if (detail.source === '3d' && this._mode !== 'hidden') {
                this._switchBucket('audit', 'hierarchy');
            }
        });

        // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
        window.runtime?.events?.on('pryzm-workbench-select', (payload: unknown) => {
            const p = payload as { id?: string; nodeId?: string; elementId?: string } | undefined;
            if ((p?.id ?? p?.nodeId ?? p?.elementId) && this._activeBucket === 'audit') {
                this._showAuditSheet();
            }
        });
    }
}
