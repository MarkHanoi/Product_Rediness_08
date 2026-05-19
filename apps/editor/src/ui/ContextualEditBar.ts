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
import type { JoinTool } from '@pryzm/input-host';
import type { CutTool } from '@pryzm/input-host';
import type { MirrorTool } from '@pryzm/input-host';
import type { CopyPasteTool } from '@pryzm/input-host';
import type { ScaleTool } from '@pryzm/input-host';
import type { OffsetTool } from '@pryzm/input-host';
import type { ReferenceEditTool } from '@pryzm/input-host';

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

export class ContextualEditBar {
    private readonly _el: HTMLElement;
    private _selectedObj: any | null = null;
    private _elementType = '';
    private _tools: OperationTools | null = null;
    private _activeOpId: string | null = null;

    /** Map from operationId → button element for fast visibility updates. */
    private readonly _opBtns = new Map<string, HTMLElement>();

    /**
     * Two-key chord state for 'MV' → Activate Move tool (Contract 34).
     * When 'M' is pressed we arm a 650ms timer. If 'V' arrives within that
     * window we cancel the timer and activate the move tool. If the timer fires
     * alone we execute the legacy single-key 'M' behaviour (3-D translate mode).
     */
    private _mvChordPending   = false;
    private _mvChordTimer: ReturnType<typeof setTimeout> | null = null;

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
                icon:        'material-symbols:rotate-90-degrees-cw',
                title:       'Rotate',
                shortcut:    'R',
                variant:     'default',
                action:      () => {
                    // Import Overlay — Revit-style 3-point reference rotate.
                    // Pivot → reference → target. Mirrors the underlay Scale flow.
                    if (this._elementType === 'floor_plan_underlay') {
                        const ut = window.floorPlanUnderlayTool ?? null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
                        this._setActiveOp('rotate');
                        window.runtime?.events?.emit('underlay:reference-rotate-activate', { underlayTool: ut }); // F.events.13
                        console.log('[ContextualEditBar] Underlay reference rotate activated');
                        return;
                    }
                    const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
                    if (tc?.setMode) tc.setMode('rotate');
                    console.log('[ContextualEditBar] Rotate → rotate');
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
                    this._service.deleteSelected();
                },
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
                    const id = this._selectedObj?.userData?.id ?? null;
                    if (!id || !this._tools) return;
                    this._setActiveOp('join');
                    this._tools.joinTool.activate(id, this._elementType);
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
                    const id = this._selectedObj?.userData?.id ?? null;
                    if (!id || !this._tools) return;
                    this._setActiveOp('cut');
                    this._tools.cutTool.activate(id, this._elementType);
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
                    const id = this._selectedObj?.userData?.id ?? null;
                    if (!id || !this._tools) return;
                    this._setActiveOp('mirror');
                    this._tools.mirrorTool.activate(id, this._elementType);
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
                    const id = this._selectedObj?.userData?.id ?? null;
                    if (!id || !this._tools) return;
                    this._setActiveOp('scale');
                    this._tools.scaleTool.activate(id, this._elementType);
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
                    const id = this._selectedObj?.userData?.id ?? null;
                    if (!id || !this._tools) return;
                    this._setActiveOp('offset');
                    this._tools.offsetTool.activate(id, this._elementType);
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
                    const id = this._selectedObj?.userData?.id ?? null;
                    if (!id || !this._tools) return;
                    this._setActiveOp('reference-edit');
                    this._tools.referenceEditTool.activate(id, this._elementType);
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
            console.log(`[ContextualEditBar] Action: ${action.id}`);
            action.action();
        });

        return btn;
    }

    private _wireSelectionEvent(): void {
        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
            const detail = payload as { object?: any | null };
            const obj = detail?.object ?? null;

            this._selectedObj  = obj;
            this._activeOpId   = null;
            this._elementType  = obj
                ? (obj.userData?.elementType ?? obj.userData?.type ?? '').toLowerCase()
                : '';

            if (obj) {
                const displayName = TYPE_DISPLAY[this._elementType] ?? 'Element';
                this._el.dataset.elementType = this._elementType;
                this._el.title = displayName;
            } else {
                this._el.dataset.elementType = '';
                this._cancelActiveTools();
            }

            this._refreshButtonVisibility(this._elementType);
            this.setVisible(!!obj);
        });

        this._installKeyboardShortcuts();
    }

    /**
     * Phase D — capability-driven button visibility.
     * Show/hide each operation button based on ElementCapabilities.canDo(type, op).
     * The undo/redo/move/rotate/copy/delete buttons are always visible when selection exists.
     */
    private _refreshButtonVisibility(elementType: string): void {
        for (const [opId, btn] of this._opBtns) {
            const show = !!elementType && canDo(elementType, opId as OperationId);
            btn.style.display = show ? '' : 'none';
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
     * Contextual keyboard shortcuts — active whenever a BIM element is selected.
     * Full shortcut table in docs/00_Contracts/11-KEYBOARD-SHORTCUTS-CONTRACT.md.
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
                case 'R': {
                    const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
                    if (tc?.setMode) { tc.setMode('rotate'); console.log('[ContextualEditBar] R → Rotate'); }
                    break;
                }
                // Delete
                case 'DELETE': case 'BACKSPACE': {
                    console.log('[ContextualEditBar] Del → Delete');
                    this._service.deleteSelected();
                    break;
                }
                // Operations (capability-gated: tool.activate no-ops if canDo returns false)
                case 'J': {
                    const id = this._selectedObj.userData?.id ?? null;
                    if (id && this._tools) {
                        this._setActiveOp('join');
                        this._tools.joinTool.activate(id, this._elementType);
                        console.log('[ContextualEditBar] J → Join');
                    }
                    break;
                }
                case 'X': {
                    const id = this._selectedObj.userData?.id ?? null;
                    if (id && this._tools) {
                        this._setActiveOp('cut');
                        this._tools.cutTool.activate(id, this._elementType);
                        console.log('[ContextualEditBar] X → Cut');
                    }
                    break;
                }
                case 'F': {
                    const id = this._selectedObj.userData?.id ?? null;
                    if (id && this._tools) {
                        this._setActiveOp('mirror');
                        this._tools.mirrorTool.activate(id, this._elementType);
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
                    const id = this._selectedObj.userData?.id ?? null;
                    if (id && this._tools) {
                        this._setActiveOp('scale');
                        this._tools.scaleTool.activate(id, this._elementType);
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
                    const id = this._selectedObj.userData?.id ?? null;
                    if (id && this._tools) {
                        this._setActiveOp('offset');
                        this._tools.offsetTool.activate(id, this._elementType);
                        console.log('[ContextualEditBar] O → Offset');
                    }
                    break;
                }
                case 'E': {
                    const id = this._selectedObj.userData?.id ?? null;
                    if (id && this._tools) {
                        this._setActiveOp('reference-edit');
                        this._tools.referenceEditTool.activate(id, this._elementType);
                        console.log('[ContextualEditBar] E → Reference Edit');
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
            align:          { cancel: () => window.planViewToolOverlay?.setActiveTool?.('none') }, // TODO(D.4): replace with runtime.scene.planViewOverlay — Phase D.4
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
    private _activateCopyToolForContext(): void {
        const overlay = window.planViewToolOverlay ?? null; // TODO(D.4): replace with runtime.scene.planViewOverlay — Phase D.4

        if (overlay?.setActiveTool) {
            overlay.setActiveTool('copy-place');
            console.log('[ContextualEditBar] Copy → plan-view copy-place tool (Ctrl+C)');
        } else {
            // 3-D fallback: clipboard copy
            const id   = this._selectedObj?.userData?.id ?? null;
            const type = this._elementType;
            if (id && this._tools) {
                this._tools.copyPasteTool.copy(id, type);
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

        const overlay = window.planViewToolOverlay // TODO(D.4): replace with runtime.scene.planViewOverlay — Phase D.4
            ?? window.planViewOverlay // TODO(D.4): replace with runtime.scene.planViewOverlay — Phase D.4
            ?? null;

        if (overlay?.setActiveTool) {
            overlay.setActiveTool('move');
            console.log('[ContextualEditBar] Move → plan-view move tool (MV)');
        } else {
            const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
            if (tc?.setMode) {
                tc.setMode('translate');
                console.log('[ContextualEditBar] Move → 3-D translate (no plan overlay)');
            }
        }
    }

    private _activateAlignToolForContext(): void {
        const overlay = window.planViewToolOverlay // TODO(D.4): replace with runtime.scene.planViewOverlay — Phase D.4
            ?? window.planViewOverlay // TODO(D.4): replace with runtime.scene.planViewOverlay — Phase D.4
            ?? null;

        if (overlay?.setActiveTool) {
            overlay.setActiveTool('align');
            console.log('[ContextualEditBar] Align → plan-view align tool (L)');
        } else {
            console.warn('[ContextualEditBar] Align requires an active plan, section, or elevation view');
        }
    }

    setVisible(visible: boolean): void {
        if (visible) {
            this._el.classList.add('ceb-bar--visible');
        } else {
            this._el.classList.remove('ceb-bar--visible');
        }
    }

    get element(): HTMLElement {
        return this._el;
    }
}
