import { escHtml } from '@pryzm/ui-base';
import { triggerWindowResize } from '../../engine/triggerWindowResize'; // F.events.16
// §L-847 — deferral bridge for runtime-event subscriptions (see _bindEvents).
// Concrete module import, not a barrel (§SCC-no-barrel-access-at-module-load).
import { onRuntimeEvent } from '../../engine/runtimeEventBridge';
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
// §MEDICIONES (L-2003) — the founder's "4D / 5D / 6D for cost in Data", and the
// take-off they must stand on. Two of the four tabs are NOT BUILT and say so.
import { mountTakeoffPanel,
         mountCostPanel }                    from './buckets/MedicionesBucket';
// 4D / 6D (lane DIM46, ADR-0351). Own module: see its header for why (module
// cycle avoidance). Both were a red NOT BUILT badge until 2026-08-21.
import { mountTimePanel,
         mountCarbonPanel }                  from './buckets/MedicionesTimeCarbon';
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
    | 'mz-takeoff' | 'mz-cost' | 'mz-time' | 'mz-carbon'
    | 'data-materials' | 'data-wall-types' | 'data-door-types' | 'data-window-types'
    | 'data-floor-types' | 'data-slab-types' | 'data-column-types' | 'data-beam-types'
    | 'data-stair-types';

type BucketId = 'strategize' | 'audit' | 'validate' | 'materials-bucket' | 'lifecycle-bucket' | 'data-schedules' | 'mediciones';

interface SubTabDef { id: TabId; label: string; icon: string; }

interface BucketDef {
    id:           BucketId;
    label:        string;
    icon:         string;
    /* §DATA-BUCKET-ACCENT-IS-ONE (L-1742) — the six buckets used to carry SIX
       accents: #6600FF, #3B8BD4, #1D9E75, #D4580A, #E24B4A, #0C7A6E. Five of
       them are not in the product's palette at all, and a six-hue rail is the
       single most visible reason this surface reads as a different product from
       the rest of the editor (founder, 2026-08-21: "they don't follow the correct
       PRYZM ui standards … following the exactly colours"). The standing rule is
       white + purple, ONE #6600FF, not per-surface approximations.

       All six now resolve to `var(--app-accent)`. The per-bucket HOOK is kept
       rather than deleted so a future decision to re-differentiate has exactly
       one place to do it — and so this ruling is one edit to reverse. Bucket
       identity is still carried by icon, label, the chip, the 3 px active bar and
       the tinted ground; colour was the fifth redundant channel, and SC 1.4.1
       forbids it being the only one regardless. */
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
        accentColor: 'var(--app-accent)',
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
        accentColor: 'var(--app-accent)',
        defaultTab: 'hierarchy',
        subTabs: [
            { id: 'hierarchy',          label: 'Hierarchy',  icon: '⬡' },
            /* §AUDIT-QUANTITIES-MEASURED-NOTHING (L-2000) — this pill read
               "Quantities" while the panel behind it rendered schedule
               DEFINITIONS (a name, a type, a list of column ids) and computed
               nothing. The label now matches the panel; the measured quantities
               live in the MEDICIONES bucket. */
            { id: 'quantity-schedules', label: 'Schedules',  icon: '▤' },
            { id: 'spatial-query',      label: 'Spatial',    icon: '⊕' },
            { id: 'visibility-intent',  label: 'Intent',     icon: '◐' },
            { id: 'nl-query',           label: 'AI Query',   icon: '✦' },
        ],
    },
    {
        id: 'validate',
        label: 'VALIDATE',
        icon: '◎',
        accentColor: 'var(--app-accent)',
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
        accentColor: 'var(--app-accent)',
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
        accentColor: 'var(--app-accent)',
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
        accentColor: 'var(--app-accent)',
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
    /* §MEDICIONES (L-2003) — the seventh bucket. `mediciones` is the Spanish
       construction term for the measured schedule of work a cost estimate is
       built from, and it is the founder's own vocabulary; it is NOT a synonym
       for "measurements". 4D and 5D are both LAYERS ON THE TAKE-OFF, which is
       why all four live in one bucket and why Take-off is the default tab: if
       the take-off is not real, 4D and 5D are fiction with a unit in front. */
    {
        id: 'mediciones',
        label: 'MEDICIONES',
        icon: '∑',
        accentColor: 'var(--app-accent)',
        defaultTab: 'mz-takeoff',
        subTabs: [
            { id: 'mz-takeoff', label: 'Take-off',  icon: '∑' },
            { id: 'mz-cost',    label: '5D Cost',   icon: '€' },
            { id: 'mz-time',    label: '4D Time',   icon: '◷' },
            { id: 'mz-carbon',  label: '6D Carbon', icon: '◍' },
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
    /* §DW-ONE-HEADER-BAND (L-3700) — the header's LEFT block is now a persistent
       child, created once, instead of `_bucketHeaderEl.innerHTML = …` on every
       bucket switch. That rewrite is why nothing could live in the header's
       right-hand half: any element appended there was destroyed by the next
       `_rebuildSubTabBar()`. The `justify-content: space-between` on
       `.dw-bucket-header` had therefore been reserving an actions slot that was
       structurally impossible to fill — which is why the Heatmap controls ended
       up as a THIRD stacked band instead. */
    private _bucketHeaderLeftEl!: HTMLElement;
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

    /* Heatmap / visualizer control (AUDIT bucket only). §DW-ONE-HEADER-BAND
       (L-3700): was `_heatmapBarEl`, a full-width THIRD chrome band under the
       sub-tab row. It is now a labelled <select> in the bucket header's actions
       slot — the same place Inspect puts `.aud-header-actions`. All five modes
       are still reachable; only the band is gone. */
    private _heatmapCtlEl!:    HTMLElement;
    private _heatmapSelectEl!: HTMLSelectElement;

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
        // §L-2004 — this panel reads scheduleStore, which a project LOAD reseeds.
        // It was mounted once in _buildContentArea() and never rebuilt, so after
        // loading a second project it still showed the first project's schedule
        // definitions.
        mountQuantitySchedules(this._panels.get('quantity-schedules')!, (tab) => this._navigateToTab(tab as TabId));
        if (this._activeTab === 'mz-takeoff') mountTakeoffPanel(this._panels.get('mz-takeoff')!, this.runtime);
        if (this._activeTab === 'mz-cost')    mountCostPanel(this._panels.get('mz-cost')!, this.runtime);
        if (this._activeTab === 'mz-time')    mountTimePanel(this._panels.get('mz-time')!, this.runtime);
        if (this._activeTab === 'mz-carbon')  mountCarbonPanel(this._panels.get('mz-carbon')!, this.runtime);
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
            /* §DW-RAIL-ICON-ONLY (L-3301) — was icon + a 7.5px uppercase label
               clamped to `max-width: 44px`. "MEDICIONES", "LIFECYCLE",
               "MATERIALS", "VALIDATE" and "STRATEGY" all overflow it, so FIVE OF
               SEVEN rendered as "MEDICI…". A label that is always elided is not a
               label — it is noise occupying the space that would have made the
               icon legible.

               Icon-only with a hover tooltip is not a new invention here: it is
               what the main app rail does, and what `.dw-rail-btn::after` in this
               panel's OWN stylesheet has always done. `title` and `aria-label` are
               set above, so the name is still reachable by pointer and by screen
               reader; only the always-broken visual copy is gone. */
            btn.innerHTML = `<span class="dw-bucket-icon">${bucket.icon}</span>`;
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

        /* §DW-ONE-HEADER-BAND (L-3700) — THE PANEL OPENED WITH THREE STACKED
           CHROME BANDS BEFORE ONE ROW OF DATA:

               .dw-bucket-header   44px   gradient · '⬡ AUDIT · 5 views'
               .dw-subtab-bar     ~36px   Hierarchy / Schedules / Spatial / …
               .dw-heatmap-bar    ~22px   'Heatmap:' Off | Sync | Occupancy | …
                                  ─────
                                  ~103px  (+2px of borders)

           Inspect — the reference the founder named — reaches its content in
           ONE band: `.aud-header` (auditStack.ts:38), a gradient strip with the
           title on the left and `.aud-header-actions` on the right.

           The third band is now that actions slot. Nothing was removed: all five
           heatmap modes are options on one <select>, which additionally states
           the CURRENT mode as text rather than as a filled pill. */
        this._bucketHeaderEl = document.createElement('div');
        this._bucketHeaderEl.className = 'dw-bucket-header';

        this._bucketHeaderLeftEl = document.createElement('div');
        this._bucketHeaderLeftEl.className = 'dw-bucket-header-left';
        this._bucketHeaderEl.appendChild(this._bucketHeaderLeftEl);

        /* §DW-HEADER-BAND-HAS-A-JOB (L-4020..L-4023) - THE ACTIONS SLOT IS NOW
           ALWAYS OCCUPIED.

           ⛔ THE FOUNDER'S REPORT, MEASURED 2026-08-22: on STRATEGIZE the purple
           header band 'runs the full panel width and is almost entirely empty -
           the title occupies the far left and nothing else uses it'. He is
           reading a real fact. '_buildHeatmapControl()' returns a wrapper with
           'style.display = none' and '_syncHeatmapControl' only reveals it in
           the AUDIT bucket, so for SIX of the seven buckets the right-hand half
           of a full-width brand band held nothing at all, while
           'justify-content: space-between' kept reserving it.

           ⭐ THE JOB IS THE REFERENCE'S JOB, not a new one. C06 §6.1 names
           '.aud-header' as THE shared header treatment, and what Inspect puts in
           its actions slot is exactly one control: 'aud-refresh-btn', a veil
           button with the glyph below (AuditStack.ts:140-141). This surface
           already has 'DataWorkbench.refresh()' - it fans out to all nine
           refreshable panels and is already called on project load - so the
           action is RE-HOSTED, never re-implemented (C06 §13.3). It resolves in
           every bucket, so it never needs the disabled-with-a-reason branch of
           §13.5.

           The slot is a persistent wrapper: the refresh action is always in it,
           the heatmap select joins it in AUDIT. That is also what makes the
           bucket-switch rebuild safe - '_rebuildSubTabBar' writes only
           '_bucketHeaderLeftEl.innerHTML', never the header itself (L-3700). */
        const actions = document.createElement('div');
        actions.className = 'dw-bucket-header-actions';

        this._heatmapCtlEl = this._buildHeatmapControl();
        actions.appendChild(this._heatmapCtlEl);

        const refreshBtn = document.createElement('button');
        refreshBtn.type      = 'button';
        refreshBtn.className = 'dw-header-btn';
        refreshBtn.id        = 'dw-refresh-btn';
        refreshBtn.textContent = '↺';
        refreshBtn.title       = 'Refresh every view in this workbench from the live model';
        refreshBtn.setAttribute('aria-label', 'Refresh data');
        refreshBtn.addEventListener('click', () => this.refresh());
        actions.appendChild(refreshBtn);

        this._bucketHeaderEl.appendChild(actions);

        this._subTabBarEl = document.createElement('div');
        this._subTabBarEl.className = 'dw-subtab-bar';

        this._headerEl.appendChild(this._bucketHeaderEl);
        this._headerEl.appendChild(this._subTabBarEl);
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
            'mz-takeoff', 'mz-cost', 'mz-time', 'mz-carbon',
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
        mountQuantitySchedules(this._panels.get('quantity-schedules')!, (tab) => this._navigateToTab(tab as TabId));

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

        // MEDICIONES — all four tabs now recompute from the live model on every
        // visit (_showActiveContent), so a stale quantity, cost, programme or
        // carbon figure cannot outlive an edit. They are mounted once here so the
        // panels are non-empty before the first tab switch.
        mountTimePanel(this._panels.get('mz-time')!, this.runtime);
        mountCarbonPanel(this._panels.get('mz-carbon')!, this.runtime);

        this._rebuildSubTabBar();
    }

    // ── Heatmap control (AUDIT bucket — header actions slot) ───────────────────

    /**
     * §DW-ONE-HEADER-BAND (L-3700) — was `_buildHeatmapBar()`, a `.dw-heatmap-bar`
     * strip of five `.dw-viz-btn` pills mounted as the third stacked chrome band.
     *
     * ⛔ THAT BAND HAD NO STYLESHEET RULE AT ALL. Measured 2026-08-22:
     *
     *     rg 'dw-heatmap' --glob '*.{ts,tsx,js,html,css}'
     *       → DataWorkbench.ts:530  bar.className   = 'dw-heatmap-bar'
     *       → DataWorkbench.ts:542  label.className = 'dw-heatmap-label'
     *       (and NOWHERE else in the repo)
     *
     * The sheet declared `.dw-viz-bar` / `.dw-viz-label` — padding, sunken
     * ground, bottom border, a 9px uppercase muted label — and NOTHING emitted
     * those two names. So the band shipped as a bare flex row: no padding (the
     * word 'Heatmap:' sat flush against x=0 while every other band is inset
     * 10-14px), no ground, no separator, and the label at the container's
     * inherited 11.7px regular instead of the intended 9px/700/uppercase.
     * That is not "one band too many" — it is one band that looked broken, and
     * it is why the founder read it as debris.
     *
     * ABSENT vs UNREACHABLE (C01 §6.1): the rules were PRESENT and UNREACHABLE.
     * The fix is therefore wiring, not building — and here the wiring that made
     * sense was to delete the band and hang the capability off the header, which
     * is where Inspect keeps its own actions (`.aud-header-actions`).
     *
     * A <select> rather than five pills because the header is a single 42px
     * band shared with the bucket title: five pills do not fit at 420px, one
     * control does, and a select *names* the active mode instead of encoding it
     * as a fill (SC 1.4.1 — colour was the only channel on the pill).
     */
    private _buildHeatmapControl(): HTMLElement {
        /* §DW-HEADER-BAND-HAS-A-JOB (L-4020) - this used to BE the actions slot
           ('.dw-bucket-header-actions') and carried 'display: none' outside the
           AUDIT bucket, which is why the slot was empty in six of seven buckets.
           It is now an inner GROUP inside a slot that is always occupied. */
        const wrap = document.createElement('div');
        wrap.className = 'dw-header-ctl-group';
        wrap.style.display = 'none';

        const modes: Array<{ mode: HeatmapMode; label: string; title: string }> = [
            { mode: 'off',        label: 'Off',        title: 'No heatmap overlay'                        },
            { mode: 'sync-state', label: 'Sync',       title: 'Colour by sync state (synced/conflict/…)'  },
            { mode: 'occupancy',  label: 'Occupancy',  title: 'Colour by occupancy classification group'  },
            { mode: 'compliance', label: 'Compliance', title: 'Passing=green / Partial=amber / Failing=red'},
            { mode: 'area-delta', label: 'Area Δ',     title: 'Compare actual vs. target area'            },
        ];

        const label = document.createElement('label');
        label.className = 'dw-header-ctl-label';
        label.htmlFor = 'dw-heatmap-select';
        label.textContent = 'Heatmap';

        const select = document.createElement('select');
        select.className = 'dw-header-select';
        select.id = 'dw-heatmap-select';
        select.setAttribute('aria-label', 'Heatmap overlay mode');
        for (const { mode, label: lbl, title } of modes) {
            const opt = document.createElement('option');
            opt.value       = mode;
            opt.textContent = lbl;
            opt.title       = title;
            select.appendChild(opt);
        }
        select.value = dataVisualizer.mode;
        select.addEventListener('change', () => {
            dataVisualizer.setMode(select.value as HeatmapMode);
            this._syncHeatmapControl();
        });

        this._heatmapSelectEl = select;
        wrap.appendChild(label);
        wrap.appendChild(select);
        return wrap;
    }

    /** Re-read the visualizer singleton — another surface can have changed it. */
    private _syncHeatmapControl(): void {
        if (this._heatmapSelectEl) this._heatmapSelectEl.value = dataVisualizer.mode;
    }

    // ── Placeholder helper ─────────────────────────────────────────────────────

    private _mountPlaceholder(tabId: TabId, icon: string, title: string, desc: string): void {
        const panel = this._panels.get(tabId)!;
        panel.innerHTML = `
            <div class="dw-placeholder">
                <div class="dw-placeholder-icon">${icon}</div>
                <div style="font-weight:600;font-size:13px;color:var(--app-text);margin-bottom:4px">${title}</div>
                <div style="font-size:12px;max-width:200px;text-align:center;line-height:1.6;color:var(--app-text-muted)">${desc}</div>
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

        if (this._heatmapCtlEl) {
            this._heatmapCtlEl.style.display = this._activeBucket === 'audit' ? 'flex' : 'none';
            if (this._activeBucket === 'audit') this._syncHeatmapControl();
        }

        if (this._bucketHeaderLeftEl) {
            /* §DW-HEADER-TRANSPARENT (L-3300) — THE WHITE BAND AT THE TOP OF THE
               DATA PANEL WAS THIS LINE:

                   style.background =
                     `linear-gradient(135deg, ${accent}cc 0%, ${accent} 100%)`

               `accentColor` used to be a HEX literal, where `+ 'cc'` is a valid
               8-digit alpha. Every bucket was later unified onto the TOKEN
               `var(--app-accent)`, and `var(--app-accent)cc` is not a colour: after
               substitution it is two tokens, so the stop is malformed.

               ⛔ An inline `var()` that resolves to garbage does NOT fall back to
               the stylesheet. It is "invalid at computed-value time", which for a
               non-inherited property means the INITIAL value — `transparent`. The
               sheet's own `background: var(--app-gradient)` never got a turn.
               Header transparent + `color: var(--app-on-accent)` (#ffffff) = white
               text on white: a 44px band that looks like a layout gap and is
               actually the bucket title, invisible.

               The fix is to delete the override, not to repair it. The stylesheet
               already declares the gradient, and every bucket now declares the
               same accent — so a per-bucket inline colour is a second copy of a
               token with no second value, which is the defect the comment beside
               `--bucket-header-bg` in the sheet already records.

               §DW-ONE-HEADER-BAND (L-3700) — this writes the LEFT block only.
               It used to be `this._bucketHeaderEl.innerHTML = …`, i.e. the whole
               header including any sibling, which is why the header's right half
               could never hold a control: every bucket switch deleted it. */
            this._bucketHeaderLeftEl.innerHTML = `
                <span class="dw-bucket-header-icon">${bucket.icon}</span>
                <span class="dw-bucket-header-title">${bucket.label}</span>
                <span class="dw-bucket-header-count">${bucket.subTabs.length} views</span>
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

        /* §MEDICIONES-RECOMPUTE-ON-VISIT (L-2004) — a quantity is a SNAPSHOT of
           the model at the instant it was measured, so it is re-measured on
           every visit to the tab. Mounting once at construction (which is what
           AUDIT › Quantities did, and what L-2004 fixes) means the first edit
           after opening the workbench silently invalidates the panel while it
           keeps displaying the old numbers. A stale quantity is worse than an
           absent one: it is still signable. */
        if (!isAuditHierarchy && this._activeTab === 'mz-takeoff') {
            mountTakeoffPanel(this._panels.get('mz-takeoff')!, this.runtime);
        }
        if (!isAuditHierarchy && this._activeTab === 'mz-time') {
            mountTimePanel(this._panels.get('mz-time')!, this.runtime);
        }
        if (!isAuditHierarchy && this._activeTab === 'mz-carbon') {
            mountCarbonPanel(this._panels.get('mz-carbon')!, this.runtime);
        }
        if (!isAuditHierarchy && this._activeTab === 'mz-cost') {
            mountCostPanel(this._panels.get('mz-cost')!, this.runtime);
        }
        if (!isAuditHierarchy && this._activeTab === 'quantity-schedules') {
            mountQuantitySchedules(this._panels.get('quantity-schedules')!, (tab) => this._navigateToTab(tab as TabId));
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
        // §L-847 — 'panel' sets an INLINE width below; inline style outranks the
        // .dw--split/.dw--full class rules, so without clearing it here a
        // panel→full transition rendered "full" as a 420px strip. F3 (data mode)
        // now drives this to 'full' (WorkspaceController), making that real.
        this._el.style.width = '';

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
        // §L-847 — routed through the onRuntimeEvent() deferral bridge (the
        // §INSPECT-DATA-TAB-WIRE pattern). These previously used raw
        // `window.runtime?.events?.on` / `this.runtime?.events?.on`, which
        // silently no-op if this class is ever constructed before the runtime
        // exists (null-at-mount race). In the normal bootstrap order
        // (engineLauncher publishes window.runtime BEFORE constructing this)
        // the bridge subscribes immediately, so behaviour is unchanged; in the
        // null-runtime order it queues until flushRuntimeEventListeners() and
        // is stated, not silent, if the runtime never arrives.
        //
        // Note: F3 show/hide does NOT depend on any of these — the
        // WorkspaceController calls window.dataWorkbench.setMode() directly.

        // F.events.10 — pryzm-toggle-workbench via runtime.events
        onRuntimeEvent('pryzm-toggle-workbench', () => this.toggle('panel'));

        onRuntimeEvent('pryzm-project-loaded', () => { // F.events.9
            setTimeout(() => this.refresh(), 50);
        });

        // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
        onRuntimeEvent('pryzm-workspace-mode', (payload: unknown) => {
            const mode = (payload as { mode?: string })?.mode;
            if (mode === 'inspect') {
                this._switchBucket('audit', 'hierarchy');
            }
        });

        onRuntimeEvent('pryzm-element-selected', (payload: unknown) => {
            const detail = payload as { source?: string } | undefined;
            if (detail?.source === '3d' && this._mode !== 'hidden') {
                this._switchBucket('audit', 'hierarchy');
            }
        });

        // F.events.7 — pryzm-workbench-select migrated to runtime.events typed bus.
        onRuntimeEvent('pryzm-workbench-select', (payload: unknown) => {
            const p = payload as { id?: string; nodeId?: string; elementId?: string } | undefined;
            if ((p?.id ?? p?.nodeId ?? p?.elementId) && this._activeBucket === 'audit') {
                this._showAuditSheet();
            }
        });
    }
}
