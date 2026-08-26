/**
 * ContextualEditBar — Phase D (PRYZM Selection Toolbar Tools Implementation Plan)
 *
 * Slides in from the top when BIM elements are selected.
 * Shows element-type label + contextual icon-only action buttons.
 *
 * Phase D additions:
 *   - mirror, align, scale, offset, reference-edit buttons
 *   - ElementCapabilities-driven button visibility (replaces static wallOnly CSS)
 *   - Operation tools injected via injectOperationTools()
 *   - Keyboard shortcuts: M → Move, Ctrl+C → Copy, Ctrl+V → Paste
 *   - bim-operation-cancelled clears active button state
 *
 * CSS prefix: ceb- (Contextual Edit Bar)
 *
 * Contract compliance:
 *   §05 §3   — prefix ceb- registered in 05-BIM-UI-ARCHITECTURE-CONTRACT §3
 *   §05 §6   — zero bim-* elements; pure native HTML
 *   §05 §7.6 — no independent <style> injection; styles live in AppTheme.ts → CEB_STYLES
 *   §01 §2.1 — no direct store writes; all mutations via service methods / commandManager
 *   §04 §1   — declared in PlatformShell Phase 2 modification protocol
 */

import type { BimService } from '@app/engine/BimService';
import * as PryzmIcons from './icons/PryzmIcons';
import { canDo, type OperationId } from '@pryzm/input-host';
// §GRID-CONTEXTUAL-EDIT (SV2) — a GRID is selected on a Canvas2D pane, of which there
// may be TWO. `selectedGridInAnyPane()` is the ONE authority for which pane holds the
// selection; `gridEditAvailability` is the ONE answer to what may be OFFERED for it.
import { selectedGridInAnyPane, clearGridSelectionInAllPanes } from '@app/engine/views/viewPanes';
// §CANVAS2D-SUBJECT-DELETE-SEAM (L-10340) — the grid delete route is SHARED with
// initUI's keyboard-Delete arm. Two lanes had written it twice; one operation gets
// one route (C84 EI-4a). The seam's file carries the measured reason a grid delete
// cannot use `runtime.bus.executeCommand` yet.
import { dispatchCanvasSubjectDelete } from '@app/engine/views/canvasSubjectDelete';
import { gridEditAvailability, type GridEditSubject } from '@pryzm/core-app-model';
// §MULTI-SELECT-SHIFT (L-1552) — the C27 §4 authority on WHAT IS SELECTED. The bar
// arms operations, and an operation armed against ONE element while FIVE are
// selected is the founder's edit landing where they did not ask for it.
import { selectionBus } from '@pryzm/core-app-model';
import { isRenderAggregateId } from '@pryzm/core-app-model/render-aggregate-identity';
import { RemoveGridCommand } from '@pryzm/command-registry';
import type { JoinTool } from '@pryzm/input-host';
import type { CutTool } from '@pryzm/input-host';
import type { MirrorTool } from '@pryzm/input-host';
import type { CopyPasteTool } from '@pryzm/input-host';
import type { ScaleTool } from '@pryzm/input-host';
import type { OffsetTool } from '@pryzm/input-host';
import type { ReferenceEditTool } from '@pryzm/input-host';
// §TOOLBAR-MODE-GATE (L-12220) — the ONE gate for this bar's visibility, beside
// §PANEL-MODE-GATE's identical column for the properties panel. This bar names
// no mode by id; it asks the registry whether the mode it was told about
// allows the editing toolbar.
import {
    editingToolbarAllowedIn,
    isWorkspaceMode,
    type WorkspaceMode,
} from './platform/workspaceModes';

export interface OperationTools {
    joinTool:          JoinTool;
    cutTool:           CutTool;
    mirrorTool:        MirrorTool;
    copyPasteTool:     CopyPasteTool;
    scaleTool:         ScaleTool;
    offsetTool:        OffsetTool;
    referenceEditTool: ReferenceEditTool;
}

interface CebAction {
    id:          string;
    operationId?: OperationId;
    icon:        string;
    title:       string;
    /** Keyboard shortcut label shown in the custom tooltip badge (e.g. "J", "Ctrl+Z"). */
    shortcut?:   string;
    variant:     'default' | 'danger';
    action:      () => void;
}

const TYPE_DISPLAY: Record<string, string> = {
    wall:           'Wall',
    slab:           'Slab',
    floor:          'Floor',
    ceiling:        'Ceiling',
    column:         'Column',
    beam:           'Beam',
    door:           'Door',
    window:         'Window',
    furniture:      'Furniture',
    roof:           'Roof',
    stair:          'Stair',
    stairs:         'Stair',
    railing:        'Railing',
    'curtain-wall':       'Curtain Wall',
    curtainwall:          'Curtain Wall',
    plumbing:             'Plumbing',
    floor_plan_underlay:  'Import Overlay',
};

// Phase B.8 (S73-WIRE) — runtime threading per S72 §16.2 row B.8.
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

/**
 * §FEAT-WALL-PROFILE-EDIT-MATRIX — what a tool must expose to have "Edit Profile" offered.
 *
 * `enterProfileEditMode` is the FLOOR: without it the button is not shown at all, which is
 * the §FIX-DEAD-EDIT-PROFILE-BUTTON rule and is unchanged. `profileEditAvailability` is
 * OPTIONAL and is the per-variant refinement (L-1065): a tool that has it gets its button
 * enabled or disabled per element, a tool that lacks it keeps the old all-or-nothing
 * behaviour. Optional rather than required so slab — whose editor has no variant axes —
 * needs no change to keep working.
 */
interface ProfileEditCapableTool {
    enterProfileEditMode?: (id: string) => unknown;
    profileEditAvailability?: (id: string) => { ok: boolean; reason?: string };
}

export class ContextualEditBar {
    private readonly _el: HTMLElement;
    private _selectedObj: any | null = null;
    /**
     * §FIX-SELECTION-PAYLOAD-INSTANCED-ID (L-813) — the RESOLVED BIM element id for
     * the current selection, taken from the `bim-selection-changed` payload. This is
     * the per-instance id for instanced elements, where `_selectedObj.userData.id` is
     * only the shared InstancedMesh's synthetic group handle. Every operation arms
     * from THIS, never from `userData.id`.
     */
    private _selectedElementId: string | null = null;
    /**
     * §MULTI-SELECT-SHIFT (L-1552) — the FULL selected set, from `selectionBus`.
     *
     * `_selectedElementId` above is the PRIMARY and stays exactly what it was; this
     * is the set the primary belongs to. Held as a field rather than read at click
     * time so `_refreshButtonVisibility` can decide what may be OFFERED from the same
     * value the actions will act on — a button whose enablement and whose behaviour
     * read different sources is how a dead action comes to look alive.
     */
    private _selectedIds: readonly string[] = [];
    private _elementType = '';
    /**
     * §GRID-CONTEXTUAL-EDIT (SV2) — the grid the bar is currently describing.
     *
     * A grid is NOT a THREE Object3D, so it can never arrive on `bim-selection-changed`
     * and `_selectedObj` is null for the whole of a grid selection. Every guard in this
     * class that reads `_selectedObj` therefore still refuses correctly for a grid; the
     * two members below are what the grid-specific arms read instead.
     */
    private _selectedGridId: string | null = null;
    private _selectedGrid: GridEditSubject | null = null;
    private _tools: OperationTools | null = null;
    private _activeOpId: string | null = null;

    /** Map from operationId → button element for fast visibility updates. */
    private readonly _opBtns = new Map<string, HTMLElement>();

    /**
     * §EDIT-PROFILE (2026-05-22) — the "Edit Profile" button. Not an
     * ElementCapabilities operation (it launches a polygon editor, not a
     * transform), so its visibility is DERIVED from `_profileEditToolFor()` in
     * _refreshButtonVisibility() rather than from canDo() — one resolver, so the
     * offered affordance and the implemented action cannot drift. Wall joined
     * slab there on 2026-08-19 (§FEAT-WALL-PROFILE-EDIT); floor and ceiling still
     * have no editor and are therefore still not offered.
     */
    private _editProfileBtn: HTMLElement | null = null;

    /**
     * Two-key chord state for 'MV' → Activate Move tool (Contract 34).
     * When 'M' is pressed we arm a 650ms timer. If 'V' arrives within that
     * window we cancel the timer and activate the move tool. If the timer fires
     * alone we execute the legacy single-key 'M' behaviour (3-D translate mode).
     */
    private _mvChordPending   = false;
    private _mvChordTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * §TOOLBAR-MODE-GATE (L-12220) — the last workspace mode this bar was told
     * about. `null` = none observed yet (pre-boot), which `editingToolbarAllowedIn`
     * treats as allowed; see its header for why that direction is the safe one.
     *
     * This is a CACHE of the event, not a rival authority: `WorkspaceController`
     * remains the only writer of the mode, `workspaceModes.ts` remains the only
     * place that says which modes show the toolbar, and this field is only ever
     * fed by the `pryzm-workspace-mode` emit.
     */
    private _workspaceMode: WorkspaceMode | null = null;

    /** Phase B.8 (S73-WIRE) — runtime threaded by parent (Layout.ts). */
    public readonly runtime: PryzmRuntime | null;

    constructor(
        private readonly _service: BimService,
        runtime: PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this._el = this._build();
        document.body.appendChild(this._el);
        this._wireSelectionEvent();
        this._wireOperationEvents();
        this._wireWorkspaceModeGate();
        // F.5.4 Wave 14 — runtime.shortcuts.dispatch wiring.
        // Phase F stub: dispatch is a no-op; register returns a no-op disposer.
        // Phase C.shortcuts wires the real global key handler.
        if (runtime?.shortcuts) {
            const disposer = runtime.shortcuts.register('Delete', () => {
                console.debug('[ContextualEditBar] Delete shortcut routed via runtime.shortcuts');
            });
            void disposer;
        }
        console.log('[ContextualEditBar] Initialized');
    }

    /**
     * Phase D — inject operation tool instances after construction.
     * Called from Layout.ts once the CommandManager is available.
     */
    injectOperationTools(tools: OperationTools): void {
        this._tools = tools;
        console.log('[ContextualEditBar] Operation tools injected');
    }

    private _build(): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'ceb-bar';
        bar.setAttribute('aria-label', 'Contextual edit bar');

        const inner = document.createElement('div');
        inner.className = 'ceb-inner';

        for (const action of this._getHistoryActions()) {
            inner.appendChild(this._buildBtn(action));
        }

        for (const action of this._getTransformActions()) {
            inner.appendChild(this._buildBtn(action));
        }

        for (const action of this._getEditActions()) {
            inner.appendChild(this._buildBtn(action));
        }

        // §EDIT-PROFILE — the "Edit Profile" button is built here, hidden by default, and
        // shown by _refreshButtonVisibility() only for types whose tool actually implements
        // `enterProfileEditMode` (slab and, since §FEAT-WALL-PROFILE-EDIT, wall).
        for (const action of this._getProfileActions()) {
            const btn = this._buildBtn(action);
            if (action.id === 'edit-profile') {
                this._editProfileBtn = btn;
                btn.style.display = 'none';   // shown per element type on selection
            }
            inner.appendChild(btn);
        }

        for (const action of this._getOperationActions()) {
            inner.appendChild(this._buildBtn(action));
        }

        bar.appendChild(inner);
        return bar;
    }

    private _getHistoryActions(): CebAction[] {
        return [
            {
                id:       'undo',
                icon:     'material-symbols:undo',
                title:    'Undo',
                shortcut: 'Ctrl+Z',
                variant:  'default',
                action:   () => {
                    console.log('[ContextualEditBar] Undo');
                    this._service.undo();
                },
            },
            {
                id:       'redo',
                icon:     'material-symbols:redo',
                title:    'Redo',
                shortcut: 'Ctrl+Y',
                variant:  'default',
                action:   () => {
                    console.log('[ContextualEditBar] Redo');
                    this._service.redo();
                },
            },
        ];
    }

    private _getTransformActions(): CebAction[] {
        return [
            {
                id:          'move',
                operationId: 'move',
                icon:        'material-symbols:open-with',
                title:       'Move',
                shortcut:    'MV',
                variant:     'default',
                action:      () => {
                    this._activateMoveToolForContext();
                },
            },
            {
                id:          'rotate',
                operationId: 'rotate',   // §EDIT-MODE-ROTATE — now capability-gated (canDo),
                                         // so Rotate only shows on elements that actually rotate
                                         // (furniture/column/underlay), not line/area elements where
                                         // the gizmo rotation never committed.
                icon:        'material-symbols:rotate-90-degrees-cw',
                title:       'Rotate',
                shortcut:    'R',
                variant:     'default',
                action:      () => {
                    this._activateRotateToolForContext();
                },
            },
            {
                id:          'copy',
                operationId: 'copy',
                icon:        'material-symbols:content-copy',
                title:       'Copy',
                shortcut:    'Ctrl+C',
                variant:     'default',
                action:      () => {
                    this._activateCopyToolForContext();
                },
            },
        ];
    }

    private _getEditActions(): CebAction[] {
        return [
            {
                id:       'delete',
                icon:     'material-symbols:delete',
                title:    'Delete',
                shortcut: 'Del',
                variant:  'danger',
                action:   () => {
                    console.log('[ContextualEditBar] Delete');
                    // §MULTI-SELECT-SHIFT (L-1552) — N selected ⇒ ONE undo entry.
                    if (this._deleteSelectedSet()) return;
                    // §GRID-CONTEXTUAL-EDIT (SV2) — the Delete BUTTON and the Delete KEY
                    // did DIFFERENT THINGS, and this is where they diverged.
                    //
                    // The key goes through `initUI.deleteSelected`, which L-1107 taught to
                    // delete a selected grid and L-1109 taught to delete a selected level
                    // datum and to stop reporting success for deletes that did nothing.
                    // This button goes through `BimService.deleteSelected()`, a THIRD
                    // delete route whose entire body is wrapped in
                    // `if (selectionManager.selectedObject)` — no grid arm, no level arm,
                    // no annotation arm, and no refusal at all. With a grid selected it
                    // returned silently, so surfacing this bar for grids without this arm
                    // would have shipped precisely the dead button that
                    // `_refreshButtonVisibility` warns about two hundred lines below.
                    if (!this._selectedObj && this._deleteSelectedGrid()) return;
                    this._service.deleteSelected();
                },
            },
        ];
    }

    /**
     * §EDIT-PROFILE (2026-05-22) — "Edit Profile" launches the profile editor for the
     * selected element: the polygon editor for a slab, and (§FEAT-WALL-PROFILE-EDIT,
     * 2026-08-19) the elevation editor for a wall. The architect requested
     * this as a toolbar action (previously only reachable by double-clicking a
     * slab). Visibility is gated by element type in _refreshButtonVisibility().
     */
    private _getProfileActions(): CebAction[] {
        return [
            {
                id:       'edit-profile',
                icon:     'material-symbols:polyline',
                title:    'Edit Profile',
                shortcut: 'P',
                variant:  'default',
                action:   () => this._activateProfileEditForContext(),
            },
        ];
    }

    /** Phase D — all capability-driven operation buttons (replaces static wallOnly pattern). */
    private _getOperationActions(): CebAction[] {
        return [
            {
                id:          'join',
                operationId: 'join',
                icon:        'material-symbols:call-merge',
                title:       'Join',
                shortcut:    'J',
                variant:     'default',
                action:      () => {
                    const t = this._resolveOperationTarget('Join');
                    if (!t) return;
                    this._setActiveOp('join');
                    this._tools!.joinTool.activate(t.id, t.type);
                    console.log('[ContextualEditBar] Join activated');
                },
            },
            {
                id:          'cut',
                operationId: 'cut',
                icon:        'material-symbols:content-cut',
                title:       'Cut / Trim',
                shortcut:    'X',
                variant:     'default',
                action:      () => {
                    const t = this._resolveOperationTarget('Cut / Trim');
                    if (!t) return;
                    this._setActiveOp('cut');
                    this._tools!.cutTool.activate(t.id, t.type);
                    console.log('[ContextualEditBar] Cut activated');
                },
            },
            {
                id:          'mirror',
                operationId: 'mirror',
                icon:        'material-symbols:flip',
                title:       'Mirror',
                shortcut:    'F',
                variant:     'default',
                action:      () => {
                    const t = this._resolveOperationTarget('Mirror');
                    if (!t) return;
                    this._setActiveOp('mirror');
                    this._tools!.mirrorTool.activate(t.id, t.type);
                    console.log('[ContextualEditBar] Mirror activated');
                },
            },
            {
                id:          'scale',
                operationId: 'scale',
                icon:        'material-symbols:zoom-out-map',
                title:       'Scale',
                shortcut:    'S',
                variant:     'default',
                action:      () => {
                    // Import Overlay — Revit-style 3-point reference scale
                    if (this._elementType === 'floor_plan_underlay') {
                        const ut = window.floorPlanUnderlayTool ?? null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
                        this._setActiveOp('scale');
                        window.runtime?.events?.emit('underlay:reference-scale-activate', { underlayTool: ut }); // F.events.13
                        console.log('[ContextualEditBar] Underlay reference scale activated');
                        return;
                    }
                    const t = this._resolveOperationTarget('Scale');
                    if (!t) return;
                    this._setActiveOp('scale');
                    this._tools!.scaleTool.activate(t.id, t.type);
                    console.log('[ContextualEditBar] Scale activated');
                },
            },
            {
                id:          'align',
                operationId: 'align',
                icon:        'material-symbols:align_horizontal_left',
                title:       'Aligned',
                shortcut:    'L',
                variant:     'default',
                action:      () => {
                    this._setActiveOp('align');
                    this._activateAlignToolForContext();
                },
            },
            {
                id:          'offset',
                operationId: 'offset',
                icon:        'material-symbols:commit',
                title:       'Offset / Parallel',
                shortcut:    'O',
                variant:     'default',
                action:      () => {
                    const t = this._resolveOperationTarget('Offset / Parallel');
                    if (!t) return;
                    this._setActiveOp('offset');
                    this._tools!.offsetTool.activate(t.id, t.type);
                    console.log('[ContextualEditBar] Offset activated');
                },
            },
            {
                id:          'reference-edit',
                operationId: 'reference-edit',
                icon:        'material-symbols:polyline',
                title:       'Reference Edit',
                shortcut:    'E',
                variant:     'default',
                action:      () => {
                    const t = this._resolveOperationTarget('Reference Edit');
                    if (!t) return;
                    this._setActiveOp('reference-edit');
                    this._tools!.referenceEditTool.activate(t.id, t.type);
                    console.log('[ContextualEditBar] Reference Edit activated');
                },
            },
        ];
    }

    private _buildBtn(action: CebAction): HTMLElement {
        const btn = document.createElement('button');
        btn.className = `ceb-btn ceb-btn--${action.variant}`;
        btn.type      = 'button';
        btn.setAttribute('aria-label', action.title);
        btn.dataset.actionId = action.id;

        // Custom tooltip — CSS ::before/::after driven by data attributes.
        // Replaces the native browser `title` tooltip for consistent styling.
        btn.dataset.tooltip = action.title;
        // §GRID-CONTEXTUAL-EDIT (SV2) — the button's OWN label, kept so a per-selection
        // override (a grid's disabled-Move reason) can be undone. Without it the override
        // is one-way: select a grid, then a wall, and the wall's Move button still carries
        // the grid's refusal.
        btn.dataset.defaultTooltip = action.title;
        if (action.shortcut) {
            btn.dataset.shortcut = action.shortcut;
        }

        if (action.operationId) {
            btn.dataset.opId = action.operationId;
            this._opBtns.set(action.operationId, btn);
            btn.style.display = 'none';
        }

        const iconEl = PryzmIcons.iconEl(action.icon, 'ceb-btn-icon', 16);
        btn.appendChild(iconEl);

        btn.addEventListener('click', () => {
            // §MULTI-SELECT-SHIFT (L-1554) — A DISABLED BUTTON MUST ACTUALLY REFUSE.
            //
            // `_refreshGridButtons` (and now `_refreshMultiSelectionButtons`) mark a
            // button `aria-disabled`, grey it to 0.45 opacity and set a `not-allowed`
            // cursor — and this listener ran the action anyway. The disabled state was
            // PRESENTATION ONLY: a `<button>` without the `disabled` ATTRIBUTE still
            // dispatches click, so Move on a selected grid looked refused and executed.
            // That is the precise shape `_refreshButtonVisibility` warns about two
            // hundred lines below — a dead action that looks alive — inverted into a
            // live action that looks dead. The reason already sits in `dataset.tooltip`,
            // so the refusal can name itself.
            if (btn.getAttribute('aria-disabled') === 'true') {
                this._declineOperation(
                    action.title,
                    btn.dataset.tooltip ?? 'it is not available for the current selection',
                );
                return;
            }
            console.log(`[ContextualEditBar] Action: ${action.id}`);
            action.action();
        });

        return btn;
    }

    private _wireSelectionEvent(): void {
        // ── §MULTI-SELECT-SHIFT (L-1552) — the SET, from the bus ──────────────────
        //
        // `bim-selection-changed` carries ONE Object3D, so it cannot answer "how
        // many are selected" — and the bar's whole job is deciding what may be
        // OFFERED, which at N>1 is a different answer for almost every button. The
        // count therefore comes from `selectionBus`, the C27 §4 authority, and the
        // element identity keeps coming from `bim-selection-changed` (which carries
        // the RESOLVED per-instance id the bus cannot supply — §FIX-SELECTION-
        // PAYLOAD-INSTANCED-ID, L-813).
        //
        // ORDERING. `SelectionManager.select()` mirrors into the bus AFTER it emits
        // `bim-selection-changed` (L-1550), so on a plain click this handler runs
        // second and re-refreshes with the settled count. On a SHIFT+click the bus
        // dispatch is the only one that carries the new count, which is exactly why
        // this subscription re-runs the refresh rather than only recording the ids.
        selectionBus.subscribe((ev) => {
            if (ev.type !== 'select' && ev.type !== 'clear') return;
            this._selectedIds = selectionBus.currentIds;
            if (this._selectedIds.length > 1) {
                this._el.dataset.elementType = 'multi';
                this._el.title = `${this._selectedIds.length} elements`;
                this._refreshButtonVisibility(this._elementType);
                this.setVisible(true);
                return;
            }
            // Back to 0 or 1 — restore the single-element presentation from the
            // identity the element channel last gave us.
            const displayName = TYPE_DISPLAY[this._elementType] ?? 'Element';
            this._el.dataset.elementType = this._selectedObj ? this._elementType : '';
            this._el.title = this._selectedObj ? displayName : '';
            this._refreshButtonVisibility(this._elementType);
            this.setVisible(!!this._selectedObj || !!this._selectedGridId);
        });

        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
            const detail = payload as { object?: any | null; elementId?: string | null; elementType?: string | null };
            const obj = detail?.object ?? null;

            this._selectedObj  = obj;
            this._activeOpId   = null;
            // §FIX-SELECTION-PAYLOAD-INSTANCED-ID (L-813) — prefer the RESOLVED
            // element id from the payload over `object.userData.id`. For an
            // instanced wall the Object3D is the shared InstancedMesh whose
            // `userData.id` is the synthetic `instanced-group-<key>` handle, NOT a
            // store row. Arming an operation with that handle made every wall edit
            // fail with WALL_NOT_FOUND in 3D while working in plan.
            this._selectedElementId = detail?.elementId ?? obj?.userData?.id ?? null;
            this._elementType  = obj
                ? (detail?.elementType ?? obj.userData?.elementType ?? obj.userData?.type ?? '').toLowerCase()
                : '';

            if (obj) {
                const displayName = TYPE_DISPLAY[this._elementType] ?? 'Element';
                this._el.dataset.elementType = this._elementType;
                this._el.title = displayName;
            } else {
                this._el.dataset.elementType = '';
                this._cancelActiveTools();
            }

            // A live 3D selection SUPERSEDES a grid selection, mirroring the precedence
            // `initUI.deleteSelected` already applies ("a live 3D BIM selection takes
            // precedence"), so the bar and the keyboard cannot disagree about which of the
            // two the user meant.
            if (obj) { this._selectedGridId = null; this._selectedGrid = null; }

            this._refreshButtonVisibility(this._elementType);
            this.setVisible(!!obj || !!this._selectedGridId);
        });

        // §GRID-CONTEXTUAL-EDIT (SV2) — the founder asked for Move and Delete on a
        // selected grid. A grid announces itself on its OWN channel because it is not an
        // Object3D; before this, the bar's only subscription was `bim-selection-changed`
        // and its visibility hinged on `!!obj`, so a grid selection could never reach it.
        //
        // The payload is used as a TRIGGER, not as the answer: the id is re-derived from
        // `selectedGridInAnyPane()` — the same authority the keyboard delete route reads —
        // so the bar cannot describe a grid the canvas no longer has selected. That also
        // makes the deselect edge work, which is why `PlanViewInteraction` now emits this
        // event with `gridId: null` when a grid is deselected: without it the bar would
        // appear on a grid click and never go away.
        window.runtime?.events?.on('pryzm-grid-selected', () => {
            const hit = selectedGridInAnyPane();
            this._selectedGridId = hit?.gridId ?? null;
            this._selectedGrid = this._selectedGridId ? this._lookupGrid(this._selectedGridId) : null;
            this._activeOpId = null;

            if (this._selectedGridId && !this._selectedObj) {
                this._el.dataset.elementType = 'grid';
                this._el.title = 'Grid';
                this._refreshButtonVisibility('grid');
                this.setVisible(true);
                return;
            }
            this._refreshButtonVisibility(this._elementType);
            this.setVisible(!!this._selectedObj);
        });

        this._installKeyboardShortcuts();
    }

    /**
     * Phase D — capability-driven button visibility.
     * Show/hide each operation button based on ElementCapabilities.canDo(type, op).
     * The undo/redo/move/rotate/copy/delete buttons are always visible when selection exists.
     */
    /** Resolve the live Grid record for an id. One lookup, one source. */
    private _lookupGrid(gridId: string): GridEditSubject | null {
        try {
            const grids = (window.bimManager as { getGrids?: () => GridEditSubject[] } | undefined)?.getGrids?.() ?? [];
            return grids.find((g) => g.id === gridId) ?? null;
        } catch { return null; }
    }

    /**
     * §GRID-CONTEXTUAL-EDIT (SV2) — which buttons a selected grid gets, and in which of
     * the three honest states.
     *
     * DELETE is SHOWN+ENABLED: `RemoveGridCommand` exists with snapshot and undo, and
     * `_deleteSelectedGrid()` below is the route to it.
     *
     * MOVE is SHOWN+DISABLED for EVERY grid, and the tooltip says why. Not hidden —
     * hiding would teach the author that grids cannot be moved, which is false: an
     * orthogonal grid moves today by editing Position. What does not exist is an
     * INTERACTIVE drag, and `GRID_EDIT_AXES`' `interactive-drag` row is what says so.
     * The verdict is computed rather than hard-coded here precisely so that building the
     * drag tool flips ONE ROW in the table and this button comes alive on its own
     * (C84 §8.d — a comment is not a synchronisation mechanism).
     *
     * Every other operation is hidden: rotate/copy/join/cut/mirror/scale/align/offset
     * have no meaning for a grid datum and no command behind them.
     */
    /**
     * §MULTI-SELECT-SHIFT (L-1552) — delete the WHOLE selected set as ONE undo entry.
     *
     * Returns TRUE when it handled the intent — INCLUDING when it refused, because a
     * refusal is a handled outcome and falling through to the single-element route
     * afterwards would delete one element out of a set the user asked to remove
     * entirely (the same rule `_deleteSelectedGrid` above states).
     *
     * ── WHY THE BUS VERB AND NOT A LOOP ───────────────────────────────────────
     *
     * N dispatches of `element.delete` are N UNDO ENTRIES, so undoing a mistaken
     * five-element delete would be five Ctrl-Zs — and a partial undo leaves the
     * model in a state the user never authored. `element.deleteBatch`
     * (plugins/view) bridges to `DeleteElementsBatchCommand`, which composes the
     * SAME `DeleteElementCommand` children into one entry and undoes them in
     * REVERSE order, so a hosted window deleted by its host wall's cascade comes
     * back after the wall does. That command already exists, is already tested, and
     * is already the route the AI chat uses for "delete every window on level 2";
     * this makes the founder's selection reach it. (P6: the mutation goes through
     * the bus, never a direct store write.)
     *
     * Returns FALSE for a set of 0 or 1, which the existing single-element routes
     * own — they carry the IFC-import, grid, level-datum and annotation arms that a
     * batch has no business duplicating.
     */
    private _deleteSelectedSet(): boolean {
        const ids = this._selectedIds;
        if (ids.length <= 1) return false;

        const bus = window.runtime?.bus;
        if (!bus || typeof bus.executeCommand !== 'function') {
            // C16 CA-18 / C84 EI-2 — refuse LOUDLY and name why. Never return
            // silently from a destructive action the user actually asked for.
            this._declineOperation('Delete', 'the command bus is not ready');
            return true;
        }

        console.log(`[ContextualEditBar] §MULTI-SELECT-SHIFT delete set — ${ids.length} elements, one undo entry`);
        void Promise.resolve(
            bus.executeCommand('element.deleteBatch', { elementIds: [...ids] }),
        ).then((record) => {
            const refusal = (record as { refusal?: { detail?: string } } | undefined)?.refusal;
            if (refusal) {
                this._declineOperation('Delete', refusal.detail ?? 'the model refused the delete');
                return;
            }
            // The set is gone; nothing may stay armed against it.
            window.unselectAll?.();
        }).catch((err: unknown) => {
            this._declineOperation('Delete', `the batch failed: ${String((err as Error)?.message ?? err)}`);
        });
        return true;
    }

    /**
     * §MULTI-SELECT-SHIFT (L-1552) — the three honest states, applied to a set.
     *
     * SHOWN+DISABLED with the reason as its tooltip for every single-subject
     * operation; the Delete button (not an `_opBtns` entry — it is always visible
     * alongside undo/redo) stays live because `element.deleteBatch` genuinely
     * handles a set. Edit Profile is hidden: it opens a modal editor bound to one
     * element's outline and there is no meaning to give it for five.
     */
    private _refreshMultiSelectionButtons(count: number): void {
        const reason =
            `Not available for a multi-selection (${count} elements) — this operation `
            + `acts on one element at a time. Select a single element, or use Delete, `
            + `which removes the whole selection in one undo step.`;
        for (const [, btn] of this._opBtns) {
            btn.style.display = '';
            btn.classList.add('ceb-btn--disabled');
            btn.setAttribute('aria-disabled', 'true');
            btn.style.opacity = '0.45';
            btn.style.cursor = 'not-allowed';
            btn.dataset.tooltip = reason;
        }
        if (this._editProfileBtn) this._editProfileBtn.style.display = 'none';
    }

    private _refreshGridButtons(): void {
        const grid = this._selectedGrid ?? {};
        for (const [opId, btn] of this._opBtns) {
            if (opId !== 'move') { btn.style.display = 'none'; continue; }
            btn.style.display = '';
            const verdict = gridEditAvailability(grid, 'move');
            const blocked = !verdict.ok;
            btn.classList.toggle('ceb-btn--disabled', blocked);
            btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
            btn.style.opacity = blocked ? '0.45' : '';
            btn.style.cursor = blocked ? 'not-allowed' : '';
            btn.dataset.tooltip = blocked ? (verdict.reason ?? 'Moving this grid is not available.') : 'Move';
        }
        if (this._editProfileBtn) this._editProfileBtn.style.display = 'none';
    }

    /**
     * Delete the grid the user has selected, if that is what is selected.
     *
     * Returns TRUE when it handled the intent — including when it REFUSED, because a
     * refusal is a handled outcome and falling through to the element route afterwards
     * would delete something the user never selected.
     */
    private _deleteSelectedGrid(): boolean {
        const hit = selectedGridInAnyPane();
        if (!hit) return false;
        // C16 CA-18 / C84 EI-2 — refuse LOUDLY through the channel this class already
        // owns, never return silently from a delete the user asked for. The seam
        // normalises BOTH refusal kinds — no command system, and the model saying no —
        // into one sentence, so neither can reach the user as a silent success.
        const outcome = dispatchCanvasSubjectDelete(new RemoveGridCommand({ gridId: hit.gridId }));
        if (!outcome.ok) {
            this._declineOperation('Delete', outcome.reason ?? 'the model refused the delete');
            return true;
        }
        // Clear the now-dangling selection in EVERY pane — a stale `_selectedGridId`
        // would keep a deleted grid highlighted in the other one.
        clearGridSelectionInAllPanes();
        this._selectedGridId = null;
        this._selectedGrid = null;
        this.setVisible(false);
        return true;
    }

    private _refreshButtonVisibility(elementType: string): void {
        // §GRID-CONTEXTUAL-EDIT (SV2) — a grid gets its own arm because the capability
        // table it is governed by is its own. `ElementCapabilities.CAPABILITIES` has no
        // 'grid' row at all, and 'delete' is not even a member of its `OperationId` union,
        // so `canDo('grid', ...)` answers false for everything and could only ever produce
        // a bar with no operations on it.
        if (elementType === 'grid') {
            this._refreshGridButtons();
            this._clearActiveOpHighlight();
            return;
        }
        // ── §MULTI-SELECT-SHIFT (L-1552) — what a MULTI-SELECTION may be offered ──
        //
        // Every operation on this bar is single-subject. `joinTool.activate(id, type)`,
        // `mirrorTool`, `offsetTool`, `scaleTool`, `referenceEditTool` and the Move /
        // Rotate gizmo all take ONE id — `_resolveOperationTarget` literally reads
        // `this._selectedElementId`. With five elements selected they would have armed
        // against the PRIMARY and silently edited one element out of five, which is a
        // worse outcome than refusing: the author sees an operation succeed and has no
        // reason to check the other four.
        //
        // So they are SHOWN and DISABLED with the reason in the tooltip, not hidden.
        // Hiding would teach the author that a wall cannot be joined, which is false —
        // what does not exist is a MULTI-SUBJECT join. `Delete` is the one action that
        // IS multi-subject today (`element.deleteBatch`, one undo entry) and stays
        // live. When a bulk verb is built for another operation, that operation's row
        // moves here and its button comes alive on its own.
        if (this._selectedIds.length > 1) {
            this._refreshMultiSelectionButtons(this._selectedIds.length);
            this._clearActiveOpHighlight();
            return;
        }
        for (const [opId, btn] of this._opBtns) {
            const show = !!elementType && canDo(elementType, opId as OperationId);
            btn.style.display = show ? '' : 'none';
            // §GRID-CONTEXTUAL-EDIT (SV2) — RESET the per-selection presentation the grid
            // arm applies. It is not enough to recompute VISIBILITY here: the grid arm
            // also disables Move and rewrites its tooltip, and neither is derived from
            // `elementType`, so without this a wall selected after a grid inherited a
            // greyed-out, not-allowed Move button explaining that grids cannot be dragged.
            // A state that only one branch can set and no branch clears is a leak.
            btn.classList.remove('ceb-btn--disabled');
            btn.setAttribute('aria-disabled', 'false');
            btn.style.opacity = '';
            btn.style.cursor = '';
            if (btn.dataset.defaultTooltip) btn.dataset.tooltip = btn.dataset.defaultTooltip;
        }
        // §EDIT-PROFILE — show the profile editor button only where an editor ACTUALLY
        // EXISTS.
        //
        // ⚠ CORRECTED 2026-08-18 (§FIX-DEAD-EDIT-PROFILE-BUTTON). This list used to read
        // `slab || floor || ceiling`, and TWO of those three were a lie: neither
        // `FloorTool` nor `CeilingTool` implements `enterProfileEditMode`, so the button
        // appeared, the user pressed it, and `_activateProfileEditForContext` fell through
        // to a `console.warn` the user never sees. That is an affordance without an
        // implementation — `WallRake.ts:50-62`, *"no affordance without an implementation…
        // A refusal is a correct answer; a silently-wrong wall is not."* A button that does
        // nothing is the worst of the three states: it is not even a refusal, because the
        // user is never told anything.
        //
        // The list is now DERIVED from the dispatch table rather than hand-kept beside it
        // (C84 §8.d — a comment is not a synchronisation mechanism), so wiring
        // `enterProfileEditMode` on a tool is the ONE act that makes its button appear, and
        // the two can no longer disagree.
        // §FEAT-WALL-PROFILE-EDIT-MATRIX (L-1065) — visibility is per TYPE, but ENABLEMENT is
        // per VARIANT. A wall is not one thing: straight or curved, vertical or raked, one
        // layer or many, hosting doors or not — and the profile geometry exists for some of
        // those and not others. The type-level boolean said the most optimistic thing it
        // could, so a RAKED wall was offered an editor whose result nothing had ever drawn.
        //
        // Three states, and only the third lies: SHOWN+ENABLED (the geometry exists),
        // SHOWN+DISABLED with the reason as its tooltip (not yet — and the tooltip says which
        // decision is in the way and that the wait is finite), HIDDEN (this element type has
        // no editor at all). Hiding a wall's button would teach the author the feature does
        // not exist for walls; opening it would teach them it worked.
        if (this._editProfileBtn) {
            const tool = this._profileEditToolFor(elementType);
            this._editProfileBtn.style.display = tool ? '' : 'none';
            if (tool) {
                const id = this._selectedElementId;
                const verdict = id && typeof tool.profileEditAvailability === 'function'
                    ? tool.profileEditAvailability(id)
                    : { ok: true };
                const blocked = !verdict.ok;
                this._editProfileBtn.classList.toggle('ceb-btn--disabled', blocked);
                this._editProfileBtn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
                this._editProfileBtn.style.opacity = blocked ? '0.45' : '';
                this._editProfileBtn.style.cursor = blocked ? 'not-allowed' : '';
                this._editProfileBtn.title = blocked
                    ? (verdict.reason ?? 'Outline editing is not available for this wall yet.')
                    : 'Edit Profile';
            }
        }
        this._clearActiveOpHighlight();
    }

    /** Phase D — wire operation-cancelled and clipboard events. */
    private _wireOperationEvents(): void {
        // F.events.10 — bim-operation-cancelled via runtime.events
        window.runtime?.events?.on('bim-operation-cancelled', (payload: unknown) => {
            const { operationId } = (payload as { operationId?: string }) ?? {};
            if (this._activeOpId === operationId) {
                this._activeOpId = null;
                this._clearActiveOpHighlight();
            }
        });

        window.addEventListener('bim-clipboard-updated', () => {
            if (!this._tools) return;
            const pasteBtn = this._el.querySelector('[data-action-id="paste"]') as HTMLElement | null;
            if (pasteBtn) pasteBtn.style.display = '';
        });
    }

    /**
     * §TOOLBAR-MODE-GATE (L-12220) — the bar owns its own visibility, exactly as
     * §PANEL-MODE-GATE made `PropertyPanel` own its own. Nothing outside this
     * class pokes `.ceb-bar`'s display or class list per mode.
     *
     * Two things happen when the mode changes, and only two:
     *
     *  1. `_workspaceMode` is refreshed, so `setVisible()` — the ONE choke point
     *     every visibility change already funnels through — starts answering
     *     for the new mode on its very next call.
     *  2. If the NEW mode suppresses the toolbar, this handler ALSO acts
     *     immediately rather than waiting for the next selection event: it
     *     re-applies `setVisible()` (which now gates itself closed) so a bar
     *     already showing does not linger, and it cancels any armed operation
     *     — `_cancelActiveTools()` for the join/cut/mirror/scale/align/offset/
     *     rotate/reference-edit family, `_activatePlanTool('none')` for the plan
     *     surface Move and Copy drive, which do not register an `_activeOpId`
     *     at all. Hiding the bar without this would strand a live tool
     *     (mid-move, waiting on a destination click) with no visible affordance
     *     to cancel it — the founder's own scope condition for this fix.
     *
     *  Returning to an ALLOWED mode does the opposite of `PropertyPanel`'s
     *  author-return on purpose: this bar never clears `_selectedObj` /
     *  `_selectedIds` / `_selectedGridId` on hide (unlike `PropertyPanel.hide()`,
     *  which clears its own draft state), so the selection was never lost —
     *  only the bar's pixels were. Re-deriving "should the bar be visible" from
     *  the SAME fields the selection handlers already trust, rather than
     *  waiting for a fresh reselect, is the honest read: the user's selection
     *  did not change, only the mode did.
     *
     * ⚠ THE BAR, NEVER THE SELECTION — same split as §PANEL-MODE-GATE.
     * `selectionBus`, `_selectedIds`, `_selectedObj` and `_selectedGridId` are
     * untouched here; only pixels and armed operations are.
     */
    private _wireWorkspaceModeGate(): void {
        window.runtime?.events?.on('pryzm-workspace-mode', (payload: unknown) => {
            const mode = (payload as { mode?: string } | undefined)?.mode;
            // An id the registry does not know is ignored rather than guessed at:
            // recording it would make `editingToolbarAllowedIn` fail open on a
            // typo forever after. Keeping the previous mode is the honest read.
            if (!isWorkspaceMode(mode)) return;
            this._workspaceMode = mode;

            if (!editingToolbarAllowedIn(mode)) {
                // Nothing stays armed with its affordance gone.
                this._cancelActiveTools();
                this._activatePlanTool('none');
                this.setVisible(false);
                return;
            }

            // Back to an allowed mode: reflect the selection that never changed.
            this.setVisible(
                this._selectedIds.length > 1 || !!this._selectedObj || !!this._selectedGridId,
            );
        });
    }

    /**
     * Contextual keyboard shortcuts — active whenever a BIM element is selected.
     * Full shortcut table in docs/02-decisions/contracts/11-KEYBOARD-SHORTCUTS-CONTRACT.md.
     *
     * Global:   Ctrl+Z  Undo  |  Ctrl+Y  Redo  |  Escape  Cancel active op
     * Transform: MV Move (two-key chord)  |  R Rotate  |  Ctrl+C Copy  |  Ctrl+V Paste
     * Edit:      Del  Delete selected
     * Operations (capability-gated): J Join | X Cut | F Mirror | L Align | S Scale | O Offset | E Ref Edit
     */
    private _installKeyboardShortcuts(): void {
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (!this._selectedObj) return;

            const ctrl = e.ctrlKey || e.metaKey;

            // ── Ctrl+Z / Ctrl+Y ────────────────────────────────────────────
            if (ctrl && (e.key === 'z' || e.key === 'Z')) {
                this._service.undo();
                console.log('[ContextualEditBar] Ctrl+Z → Undo');
                return;
            }
            if (ctrl && (e.key === 'y' || e.key === 'Y')) {
                this._service.redo();
                console.log('[ContextualEditBar] Ctrl+Y → Redo');
                return;
            }

            // ── Ctrl+C / Ctrl+V ────────────────────────────────────────────
            // Contract 35: Ctrl+C activates the two-click copy-place tool when
            // the plan / elevation / section overlay is attached.  Falls back to
            // clipboard copy (CopyPasteTool) when only the 3-D viewport is open.
            if (ctrl && (e.key === 'c' || e.key === 'C')) {
                this._activateCopyToolForContext();
                console.log('[ContextualEditBar] Ctrl+C → Copy');
                return;
            }
            if (ctrl && (e.key === 'v' || e.key === 'V')) {
                if (this._tools) {
                    this._tools.copyPasteTool.paste();
                    console.log('[ContextualEditBar] Ctrl+V → Paste (clipboard fallback)');
                }
                return;
            }

            // ── Single-key shortcuts (no Ctrl/Meta/Alt) ───────────────────
            // Alt is reserved for the global element-creation shortcut layer
            // (CreateRailPanel — see docs/00_AI_COMMANDS_REFERENCE/
            // PRYZM-CREATION-SHORTCUTS.md). Skipping Alt-prefixed keys here
            // prevents Alt+letter creation shortcuts from double-firing the
            // contextual single-letter operations (R/J/X/F/L/S/O/E …) while
            // an element is selected.
            if (ctrl) return;
            if (e.altKey) return;

            // 'MV' two-key chord (Contract 34).
            // Pressing 'M' arms a 650ms timer.
            //   • If 'V' arrives within the window → activate Move tool (plan view).
            //   • If the timer fires alone → fall through to 3-D translate mode.
            if (e.key.toUpperCase() === 'M') {
                this._mvChordPending = true;
                if (this._mvChordTimer !== null) clearTimeout(this._mvChordTimer);
                this._mvChordTimer = setTimeout(() => {
                    this._mvChordTimer   = null;
                    this._mvChordPending = false;
                    // Fallback: single-key 'M' in 3-D mode
                    const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
                    if (tc?.setMode) { tc.setMode('translate'); console.log('[ContextualEditBar] M (solo) → 3-D translate'); }
                }, 650);
                return;
            }

            if (e.key.toUpperCase() === 'V' && this._mvChordPending) {
                if (this._mvChordTimer !== null) { clearTimeout(this._mvChordTimer); this._mvChordTimer = null; }
                this._mvChordPending = false;
                this._activateMoveToolForContext();
                console.log('[ContextualEditBar] MV → Activate Move tool');
                return;
            }

            switch (e.key.toUpperCase()) {
                // (M handled above via two-key chord)
                // §FIX-PLAN-ROTATE-PARITY (L-267) — `R` used to hard-wire the 3-D gizmo
                // (`tc.setMode('rotate')`), so in plan view the shortcut was inert. It now
                // goes through the SAME view-context router the button uses, exactly as
                // the `MV` chord does for Move.
                case 'R': {
                    this._activateRotateToolForContext();
                    console.log('[ContextualEditBar] R → Rotate');
                    break;
                }
                // Delete
                case 'DELETE': case 'BACKSPACE': {
                    console.log('[ContextualEditBar] Del → Delete');
                    // §MULTI-SELECT-SHIFT (L-1552) — the KEY and the BUTTON take the
                    // same route. `initUI.deleteSelected` and `BimService.deleteSelected`
                    // were already two routes that had drifted apart once
                    // (§GRID-CONTEXTUAL-EDIT); a third, multi-selection-only divergence
                    // between the key and the button is the same defect again.
                    if (this._deleteSelectedSet()) break;
                    this._service.deleteSelected();
                    break;
                }
                // Operations (capability-gated: tool.activate no-ops if canDo returns false)
                // §FIX-OP-SILENT-NOOP (L-813) — the keyboard path goes through the
                // SAME visible-decline resolver as the buttons, so `J` on a selection
                // with no resolvable id reports why instead of doing nothing.
                case 'J': {
                    const t = this._resolveOperationTarget('Join');
                    if (t) {
                        this._setActiveOp('join');
                        this._tools!.joinTool.activate(t.id, t.type);
                        console.log('[ContextualEditBar] J → Join');
                    }
                    break;
                }
                case 'X': {
                    const t = this._resolveOperationTarget('Cut / Trim');
                    if (t) {
                        this._setActiveOp('cut');
                        this._tools!.cutTool.activate(t.id, t.type);
                        console.log('[ContextualEditBar] X → Cut');
                    }
                    break;
                }
                case 'F': {
                    const t = this._resolveOperationTarget('Mirror');
                    if (t) {
                        this._setActiveOp('mirror');
                        this._tools!.mirrorTool.activate(t.id, t.type);
                        console.log('[ContextualEditBar] F → Mirror');
                    }
                    break;
                }
                case 'S': {
                    if (this._elementType === 'floor_plan_underlay') {
                        const ut = window.floorPlanUnderlayTool ?? null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
                        this._setActiveOp('scale');
                        window.runtime?.events?.emit('underlay:reference-scale-activate', { underlayTool: ut }); // F.events.13
                        console.log('[ContextualEditBar] S → Underlay reference scale');
                        break;
                    }
                    const t = this._resolveOperationTarget('Scale');
                    if (t) {
                        this._setActiveOp('scale');
                        this._tools!.scaleTool.activate(t.id, t.type);
                        console.log('[ContextualEditBar] S → Scale');
                    }
                    break;
                }
                case 'L': {
                    if (canDo(this._elementType, 'align')) {
                        this._setActiveOp('align');
                        this._activateAlignToolForContext();
                        console.log('[ContextualEditBar] L → Align');
                    }
                    break;
                }
                case 'O': {
                    const t = this._resolveOperationTarget('Offset / Parallel');
                    if (t) {
                        this._setActiveOp('offset');
                        this._tools!.offsetTool.activate(t.id, t.type);
                        console.log('[ContextualEditBar] O → Offset');
                    }
                    break;
                }
                case 'E': {
                    const t = this._resolveOperationTarget('Reference Edit');
                    if (t) {
                        this._setActiveOp('reference-edit');
                        this._tools!.referenceEditTool.activate(t.id, t.type);
                        console.log('[ContextualEditBar] E → Reference Edit');
                    }
                    break;
                }
                // §EDIT-PROFILE — P launches the profile editor for slab/floor/ceiling.
                case 'P': {
                    if (this._elementType === 'slab'
                        || this._elementType === 'floor'
                        || this._elementType === 'ceiling') {
                        this._activateProfileEditForContext();
                        console.log('[ContextualEditBar] P → Edit Profile');
                    }
                    break;
                }
                case 'ESCAPE': {
                    this._cancelActiveTools();
                    break;
                }
            }
        });
    }

    /**
     * §FIX-OP-SILENT-NOOP (L-813, §CONTEXT-DATA-HONESTY) — surface a human-readable
     * DECLINE for an operation that cannot start.
     *
     * THE DEFECT THIS CLOSES. Every operation button used to begin with
     *     `const id = this._selectedObj?.userData?.id ?? null;`
     *     `if (!id || !this._tools) return;`
     * A missing id, missing tools and a successful arm were the SAME OBSERVABLE:
     * nothing happened, nothing was logged, no reason was given. That is the exact
     * failure mode the standing repo principle forbids — a refusal and a success must
     * never be the same value. The decline is routed through `bim-operation-error`,
     * which OperationModeOverlay renders in its error state, so the user always learns
     * WHY. It is never a throw: a correct guard delivered as a crash is also a bug
     * (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH, L-812).
     */
    private _declineOperation(opLabel: string, reason: string): void {
        const msg = `${opLabel} unavailable — ${reason}`;
        window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg } }));
        console.warn(`[ContextualEditBar] ${msg}`);
    }

    /**
     * Resolve the target this operation should arm against, or emit a visible decline
     * and return null. Never throws, never returns silently.
     */
    private _resolveOperationTarget(opLabel: string): { id: string; type: string } | null {
        // §MULTI-SELECT-SHIFT (L-1552) — this resolver returns ONE id, so it is the
        // right place to refuse a set. The buttons are already disabled at N>1, but
        // the single-letter KEYBOARD shortcuts (J/X/F/L/S/O/E) route here directly and
        // never look at a button, so without this arm they would arm against the
        // primary and edit one element out of N.
        if (this._selectedIds.length > 1) {
            this._declineOperation(
                opLabel,
                `${this._selectedIds.length} elements are selected and this operation acts on one `
                + `element at a time. Select a single element.`,
            );
            return null;
        }
        if (!this._selectedObj) {
            this._declineOperation(opLabel, 'nothing is selected');
            return null;
        }
        if (!this._tools) {
            this._declineOperation(opLabel, 'the editing tools are not ready yet — try again in a moment');
            return null;
        }
        const id = this._selectedElementId;
        if (!id) {
            this._declineOperation(
                opLabel,
                'the selected element has no resolvable id (re-select it in the plan view and try again)',
            );
            return null;
        }
        // §FIX-SELECTION-PAYLOAD-INSTANCED-ID — a synthetic instanced-group handle is
        // NOT a BIM element. If one still reaches here (an emitter that has not been
        // updated to carry the resolved id), decline loudly rather than arming an
        // operation that is guaranteed to fail deep inside a command with a
        // WALL_NOT_FOUND the user never sees.
        if (isRenderAggregateId(id)) {   // §TOPO-AGGREGATE-IS-NOT-AN-ELEMENT (L-10530)
            this._declineOperation(
                opLabel,
                'the click resolved to an instanced render group rather than a single element — click the element again',
            );
            return null;
        }
        return { id, type: this._elementType };
    }

    /** Mark a button as active (operation in progress). */
    private _setActiveOp(opId: string): void {
        this._clearActiveOpHighlight();
        this._activeOpId = opId;
        const btn = this._opBtns.get(opId);
        if (btn) btn.classList.add('ceb-btn--active');
    }

    private _clearActiveOpHighlight(): void {
        for (const btn of this._opBtns.values()) {
            btn.classList.remove('ceb-btn--active');
        }
    }

    private _cancelActiveTools(): void {
        if (!this._tools || !this._activeOpId) return;
        const toolMap: Record<string, { cancel(): void }> = {
            join:           this._tools.joinTool,
            cut:            this._tools.cutTool,
            mirror:         this._tools.mirrorTool,
            copy:           this._tools.copyPasteTool,
            scale:          this._tools.scaleTool,
            align:          { cancel: () => this._activatePlanTool('none') }, // §FIX-PLAN-ELEMENT-TOOL-PARITY (L-95): deactivate on whichever plan surface is active
            // §FIX-PLAN-ROTATE-PARITY (L-267) — Escape must retire the plan rotate tool on
            // whichever plan surface is active (same shape as `align` above). Without this
            // entry the tool would stay armed after Esc and keep eating clicks.
            rotate:         { cancel: () => this._activatePlanTool('none') },
            offset:         this._tools.offsetTool,
            'reference-edit': this._tools.referenceEditTool,
        };
        toolMap[this._activeOpId]?.cancel();
        this._activeOpId = null;
        this._clearActiveOpHighlight();
    }

    /**
     * Contract 35 — Activates the Copy-Place tool for the current viewing context.
     *
     * Plan / Elevation / Section view: activates 'copy-place' PlanToolHandler
     *   (two-click origin → destination workflow). The handler uses the appropriate
     *   Create command per element type to create a semantically-unique new element.
     *
     * 3-D viewport only (no plan overlay): falls back to the clipboard-based
     *   CopyPasteTool.copy() so the existing behaviour is preserved.
     */
    /**
     * §FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — route a ContextualEditBar element tool
     * (move / copy-place / align) to the ACTIVE plan-tool overlay, so it drives the SAME
     * handler whether the user is in the MAIN plan view (`PlanViewToolOverlay`) or the
     * SPLIT-view plan pane (`SvpPlanToolOverlay`). Both overlays build their handler map
     * from the single `planToolHandlerRegistry` (L-73) and now expose an identical
     * `setActiveTool` + `isAttached` API (C11 plan-tools parity), so the capability set is
     * unified across surfaces — previously only the main overlay was routed, so these tools
     * silently did nothing in split view (the L-95 founder repro: "Move window" in split).
     *
     * Activates on EVERY attached plan surface (at most one is attached in normal use —
     * full plan view vs split pane are mutually exclusive), and returns true if any
     * accepted the tool, so the 3D fallback runs only when NO plan surface is active.
     */
    private _activatePlanTool(tool: string): boolean {
        const overlays = [
            window.planViewToolOverlay, // TODO(D.4): runtime.scene.planViewOverlay — main full-screen plan view
            window.svpPlanToolOverlay,  // TODO(D.4): runtime.scene.svpPlanToolOverlay — split-view plan pane
        ];
        let activated = false;
        for (const ov of overlays) {
            if (ov?.isAttached?.() && typeof ov.setActiveTool === 'function') {
                ov.setActiveTool(tool);
                activated = true;
            }
        }
        return activated;
    }

    private _activateCopyToolForContext(): void {
        if (this._activatePlanTool('copy-place')) {
            console.log('[ContextualEditBar] Copy → plan-view copy-place tool (Ctrl+C) — active plan surface');
        } else {
            // 3-D fallback: clipboard copy. §FIX-OP-SILENT-NOOP (L-813) — a missing
            // id now reports itself instead of silently copying nothing.
            const t = this._resolveOperationTarget('Copy');
            if (t) {
                this._tools!.copyPasteTool.copy(t.id, t.type);
                console.log('[ContextualEditBar] Copy → clipboard copy (no plan overlay)');
            }
        }
    }

    /**
     * Activates the Move tool appropriate for the current viewing context.
     *
     * Plan / Elevation / Section view: activates the 'move' PlanToolHandler
     *   (two-click origin → destination workflow, Contract 34).
     *
     * 3-D viewport (no plan view active): falls back to TransformControls
     *   translate mode (existing behaviour).
     */
    private _activateMoveToolForContext(): void {
        // Floor plan underlay — unlock so the user can drag it on plan view (or rotate with R in 3D)
        if (this._elementType === 'floor_plan_underlay') {
            const underlayTool = window.floorPlanUnderlayTool; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
            if (underlayTool?.setLocked) {
                underlayTool.setLocked(false);
                window.runtime?.events?.emit('underlay:move-activated', {}); // F.events.13
                console.log('[ContextualEditBar] Move → underlay unlocked, drag enabled on plan + 3D');
            }
            return;
        }

        // §FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — drive the move handler on whichever
        // plan surface is active (main plan view OR split-view plan pane), not only the
        // main overlay. Falls back to the 3-D translate gizmo only when NO plan surface
        // is attached.
        if (this._activatePlanTool('move')) {
            console.log('[ContextualEditBar] Move → plan-view move tool (MV) — active plan surface');
        } else {
            const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
            if (tc?.setMode) {
                tc.setMode('translate');
                console.log('[ContextualEditBar] Move → 3-D translate (no plan overlay)');
            }
        }
    }

    /**
     * §FIX-PLAN-ROTATE-PARITY (L-267, Gate G7) — activates the Rotate tool appropriate
     * for the current viewing context, exactly as `_activateMoveToolForContext()` has
     * always done for Move.
     *
     * THE BUG THIS CLOSES. Move, Align and Copy all routed through `_activatePlanTool()`
     * (the view-context router, §FIX-PLAN-ELEMENT-TOOL-PARITY / L-95). Rotate did NOT —
     * it jumped straight to `transformControls.setMode('rotate')`, the 3-D gizmo, which
     * is attached to the 3-D canvas and is inert while a plan surface is up. So in plan
     * view the Rotate button and the `R` key were visible, capability-gated ON, and
     * silently did nothing — for EVERY rotatable element type, not just the wardrobe the
     * founder happened to be holding. The plan view simply had no rotate.
     *
     * Now:
     *   Plan / Elevation / Section (main overlay OR split pane): the 'rotate'
     *     PlanToolHandler — two-click reference → target, dispatching the SAME command
     *     the 3-D gizmo dispatches (see `elementYawRotate.ts`).
     *   3-D viewport (no plan surface attached): the TransformControls rotate gizmo,
     *     unchanged.
     *   Underlay: unchanged 3-point reference rotate.
     */
    private _activateRotateToolForContext(): void {
        // Import Overlay — Revit-style 3-point reference rotate. Pivot → reference →
        // target. Mirrors the underlay Scale flow. (Unchanged behaviour.)
        if (this._elementType === 'floor_plan_underlay') {
            const ut = window.floorPlanUnderlayTool ?? null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
            this._setActiveOp('rotate');
            window.runtime?.events?.emit('underlay:reference-rotate-activate', { underlayTool: ut }); // F.events.13
            console.log('[ContextualEditBar] Underlay reference rotate activated');
            return;
        }

        if (this._activatePlanTool('rotate')) {
            this._setActiveOp('rotate');
            console.log('[ContextualEditBar] Rotate → plan-view rotate tool (R) — active plan surface');
        } else {
            const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
            if (tc?.setMode) {
                tc.setMode('rotate');
                console.log('[ContextualEditBar] Rotate → 3-D rotate gizmo (no plan overlay)');
            }
        }
    }

    private _activateAlignToolForContext(): void {
        // §FIX-OP-SILENT-NOOP (L-813) — Align was the mirror-image defect of the other
        // buttons: it had NO id guard at all and armed unconditionally, so pressing it
        // with an unresolvable selection put AlignPlanToolHandler into `pick-source`
        // with `_sourceId === null`, where every click is rejected by a bare
        // `console.warn` the user never sees. Resolve the target FIRST (visible decline
        // if it cannot be resolved), then check the surface requirement.
        const t = this._resolveOperationTarget('Align');
        if (!t) { this._clearActiveOpHighlight(); this._activeOpId = null; return; }

        // §FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — parity across main + split plan panes.
        if (this._activatePlanTool('align')) {
            console.log('[ContextualEditBar] Align → plan-view align tool (L) — active plan surface');
        } else {
            // Align is a 2-D reference-plane operation; it has no 3-D surface. Say so
            // rather than warning to a console nobody is reading.
            this._clearActiveOpHighlight();
            this._activeOpId = null;
            this._declineOperation(
                'Align',
                'it needs an open plan, section or elevation view — switch to a 2D view and try again',
            );
        }
    }

    /**
     * §EDIT-PROFILE (2026-05-22) — launch the polygon profile editor for the
     * selected slab / floor / ceiling. Routes to the geometry-slab-family tool's
     * `enterProfileEditMode(id)` (slab is wired today; floor/ceiling activate
     * automatically once their tools expose the same method). This mirrors the
     * existing double-click-on-slab path (SelectionManager) as a toolbar action.
     */
    private _activateProfileEditForContext(): void {
        // §FEAT-WALL-PROFILE-EDIT — prefer the RESOLVED element id, exactly as the
        // selection handler does at `:450` (§FIX-SELECTION-PAYLOAD-INSTANCED-ID / L-813).
        // `userData.id` alone was survivable while this button only ever served slabs, which
        // are not instanced. A plain wall IS: its Object3D is the shared InstancedMesh whose
        // `userData.id` is the synthetic `instanced-group-<key>` handle and NOT a store row,
        // so reading it here would hand `WallTool.enterProfileEditMode` an id no store can
        // resolve — a button that opens nothing in 3D while working in plan. That is the
        // dead-button defect this whole section exists to prevent, wearing different clothes.
        const id = (this._selectedElementId ?? this._selectedObj?.userData?.id) as string | undefined;
        if (!id) return;
        const type = this._elementType;

        // Cast through `unknown`: globals.d.ts types floorTool/ceilingTool as
        // `unknown` and slabTool with an `(slab: object)` signature — a local
        // shape keeps this call site clean without touching the global decl.
        const tool = this._profileEditToolFor(type);
        if (tool) {
            // §FEAT-WALL-PROFILE-EDIT-MATRIX — the disabled button is a hint, not the
            // enforcement: a keyboard shortcut or a stale render can still get here. The
            // decline goes through the SAME channel every other operation uses, so the user
            // learns WHY rather than watching nothing happen (the §FIX-OP-SILENT-NOOP rule).
            // The tool refuses again on its own account; this exists so the refusal is VISIBLE
            // in the toolbar's own idiom, not only in the tool's status line.
            const verdict = typeof tool.profileEditAvailability === 'function'
                ? tool.profileEditAvailability(id)
                : { ok: true } as { ok: boolean; reason?: string };
            if (!verdict.ok) {
                this._declineOperation(
                    'Edit Profile',
                    verdict.reason ?? 'this element cannot have its outline edited yet',
                );
                return;
            }
            void tool.enterProfileEditMode!(id);
            console.log(`[ContextualEditBar] Edit Profile → ${type} ${id}`);
            return;
        }
        // Unreachable while the button is gated by the SAME resolver (above), and kept as
        // defence in depth for a keyboard shortcut that bypasses the button. It stays a
        // `console.warn` rather than becoming a user-facing refusal precisely because the
        // user can no longer get here by any offered gesture — the fix was to stop
        // OFFERING the action, which is better than refusing it politely.
        console.warn(
            `[ContextualEditBar] Edit Profile not available for type=${type} ` +
            `(no tool implements enterProfileEditMode)`,
        );
    }

    /**
     * §FIX-DEAD-EDIT-PROFILE-BUTTON — the ONE resolver that decides whether "Edit Profile"
     * is available for an element type: it returns the tool only when that tool actually
     * implements `enterProfileEditMode`.
     *
     * Both the button's visibility and its click handler consult this, so the offered
     * affordance and the implemented action cannot drift apart — which is exactly how
     * floor and ceiling came to show a button that did nothing.
     *
     * ⚠ WALL WAS deliberately ABSENT, and is now PRESENT — §FEAT-WALL-PROFILE-EDIT,
     * 2026-08-19. The paragraph that stood here said wall must stay out *"before
     * `WallTool.enterProfileEditMode` exists"*. It now exists
     * (`packages/geometry-wall/src/WallTool.ts`, opening `WallProfileEditor` on the wall's
     * own elevation and committing through `element.updateParameters`), so the condition
     * that justified the absence no longer holds. The rule itself is unchanged and still
     * binding: a type is listed here IF AND ONLY IF its tool implements the method — which
     * the `typeof … === 'function'` guard below enforces at runtime regardless of this map,
     * so a wrong entry disables the button rather than resurrecting a dead one.
     */
    private _profileEditToolFor(
        type: string | null | undefined,
    ): ProfileEditCapableTool | null {
        if (!type) return null;
        const w = window as unknown as {
            slabTool?:    ProfileEditCapableTool;
            floorTool?:   ProfileEditCapableTool;
            ceilingTool?: ProfileEditCapableTool;
            wallTool?:    ProfileEditCapableTool;
        };
        const candidates: Record<string, ProfileEditCapableTool | undefined> = {
            slab:    w.slabTool,
            floor:   w.floorTool,
            ceiling: w.ceilingTool,
            wall:    w.wallTool,
        };
        const tool = candidates[type];
        return tool && typeof tool.enterProfileEditMode === 'function' ? tool : null;
    }

    /**
     * ⭐ §TOOLBAR-MODE-GATE (L-12220) — THE gate, and the ONLY one.
     *
     * Every way this bar's visibility changes funnels through here: the
     * selectionBus subscription, the `bim-selection-changed` handler, the
     * `pryzm-grid-selected` handler, and `_wireWorkspaceModeGate()` above. So
     * one `if` here covers all of them, and there is no `if (mode !==
     * 'author')` sprinkled at any call site — the same shape §PANEL-MODE-GATE
     * used for `PropertyPanel._makeVisible()`.
     *
     * A caller asking to show the bar in a suppressed mode is a normal,
     * expected event (every selection handler still runs unconditionally in
     * Inspect/Analysis/Data — selection is untouched, per the file-level
     * comment on `_wireWorkspaceModeGate`); it is refused here, quietly, rather
     * than by teaching three call sites to ask permission first.
     */
    setVisible(visible: boolean): void {
        const allowed = visible && editingToolbarAllowedIn(this._workspaceMode);
        if (allowed) {
            this._el.classList.add('ceb-bar--visible');
        } else {
            this._el.classList.remove('ceb-bar--visible');
        }
    }

    get element(): HTMLElement {
        return this._el;
    }
}
