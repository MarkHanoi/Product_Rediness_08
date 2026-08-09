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
    /**
     * §FIX-SELECTION-PAYLOAD-INSTANCED-ID (L-813) — the RESOLVED BIM element id for
     * the current selection, taken from the `bim-selection-changed` payload. This is
     * the per-instance id for instanced elements, where `_selectedObj.userData.id` is
     * only the shared InstancedMesh's synthetic group handle. Every operation arms
     * from THIS, never from `userData.id`.
     */
    private _selectedElementId: string | null = null;
    private _elementType = '';
    private _tools: OperationTools | null = null;
    private _activeOpId: string | null = null;

    /** Map from operationId → button element for fast visibility updates. */
    private readonly _opBtns = new Map<string, HTMLElement>();

    /**
     * §EDIT-PROFILE (2026-05-22) — the "Edit Profile" button. Not an
     * ElementCapabilities operation (it launches a polygon editor, not a
     * transform), so its visibility is gated manually by element type
     * (slab / floor / ceiling) in _refreshButtonVisibility() rather than via canDo().
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

        // §EDIT-PROFILE — the "Edit Profile" button is built here, hidden by
        // default, and shown only for slab/floor/ceiling in _refreshButtonVisibility().
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
                    this._service.deleteSelected();
                },
            },
        ];
    }

    /**
     * §EDIT-PROFILE (2026-05-22) — "Edit Profile" launches the polygon profile
     * editor for the selected slab / floor / ceiling. The architect requested
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
        // §EDIT-PROFILE — show the profile editor button only for the polygonal
        // sketch-based families (slab / floor / ceiling).
        if (this._editProfileBtn) {
            const showProfile = elementType === 'slab'
                || elementType === 'floor'
                || elementType === 'ceiling';
            this._editProfileBtn.style.display = showProfile ? '' : 'none';
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
        if (id.startsWith('instanced-group-')) {
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
        const id = this._selectedObj?.userData?.id as string | undefined;
        if (!id) return;
        const type = this._elementType;

        // Cast through `unknown`: globals.d.ts types floorTool/ceilingTool as
        // `unknown` and slabTool with an `(slab: object)` signature — a local
        // shape keeps this call site clean without touching the global decl.
        const w = window as unknown as {
            slabTool?:    { enterProfileEditMode?: (id: string) => unknown };
            floorTool?:   { enterProfileEditMode?: (id: string) => unknown };
            ceilingTool?: { enterProfileEditMode?: (id: string) => unknown };
        };
        const toolFor: Record<string, { enterProfileEditMode?: (id: string) => unknown } | undefined> = {
            slab:    w.slabTool,
            floor:   w.floorTool,
            ceiling: w.ceilingTool,
        };
        const tool = toolFor[type];
        if (tool && typeof tool.enterProfileEditMode === 'function') {
            void tool.enterProfileEditMode(id);
            console.log(`[ContextualEditBar] Edit Profile → ${type} ${id}`);
        } else {
            console.warn(
                `[ContextualEditBar] Edit Profile not yet available for type=${type} ` +
                `(tool.enterProfileEditMode missing — slab is supported; floor/ceiling pending)`,
            );
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
