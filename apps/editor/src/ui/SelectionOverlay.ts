/**
 * SelectionOverlay — Phase 4 (PRYZM-UI-GRAND-PLAN-2026)
 *
 * Floating contextual action panel that appears above the bottom bar
 * whenever a BIM element is selected in the 3-D viewport.
 *
 * CSS prefix: sel- (Selection Overlay)
 *
 * Contract compliance:
 *   §05 §3   — prefix sel- registered in 05-BIM-UI-ARCHITECTURE-CONTRACT §3
 *   §05 §6   — zero bim-* elements; pure native HTML
 *   §05 §7.6 — no independent <style> injection; styles live in selectionOverlay.ts → SEL_OVERLAY_STYLES
 *   §01 §2.1 — no direct store writes; mutations via service.deleteSelected() / commandManager
 *   §04 §1   — declared as Phase 4 additive component; no existing code modified except registration
 */

import type { BimService } from '@app/engine/BimService';
import * as PryzmIcons from './icons/PryzmIcons';

interface SelAction {
    id:        string;
    label:     string;
    icon:      string;
    variant:   'default' | 'danger';
    wallOnly?: boolean;
    action:    () => void;
}

interface SelectionContext {
    object:      any | null;
    elementType: string;
}

// Phase B.10 (S73-WIRE) — runtime threading per S72 §16.2 row B.10.
// Type-only import (erased by tsc; no bundle impact).
// Forward-declared via `type` import below — see field at end of class.

export class SelectionOverlay {
    private readonly _el: HTMLElement;
    private _ctx: SelectionContext = { object: null, elementType: '' };

    /** Phase B.10 (S73-WIRE) — runtime threaded by parent (Layout.ts). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private readonly _canvasContainer: HTMLElement,
        private readonly _service: BimService,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this._el = this._build();
        this._canvasContainer.appendChild(this._el);
        this._wireSelectionEvent();
        console.log('[SelectionOverlay] Initialized — mounted to', this._canvasContainer.id || 'container');
    }

    // ── DOM construction ────────────────────────────────────────────────────

    private _build(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'sel-overlay';
        overlay.setAttribute('role', 'toolbar');
        overlay.setAttribute('aria-label', 'Selection actions');

        const label = document.createElement('span');
        label.className = 'sel-label';
        label.textContent = 'Selection';
        overlay.appendChild(label);

        const divider1 = document.createElement('div');
        divider1.className = 'sel-divider';
        overlay.appendChild(divider1);

        for (const action of this._getTransformActions()) {
            overlay.appendChild(this._buildBtn(action));
        }

        const divider2 = document.createElement('div');
        divider2.className = 'sel-divider';
        overlay.appendChild(divider2);

        for (const action of this._getEditActions()) {
            overlay.appendChild(this._buildBtn(action));
        }

        const divider3 = document.createElement('div');
        divider3.className = 'sel-divider sel-divider--wall-only';
        overlay.appendChild(divider3);

        for (const action of this._getWallActions()) {
            overlay.appendChild(this._buildBtn(action));
        }

        return overlay;
    }

    private _getTransformActions(): SelAction[] {
        return [
            {
                id:      'move',
                label:   'Move',
                icon:    'material-symbols:open-with',
                variant: 'default',
                action:  () => this._handleMove(),
            },
            {
                id:      'rotate',
                label:   'Rotate',
                icon:    'material-symbols:rotate-90-degrees-cw',
                variant: 'default',
                action:  () => this._handleRotate(),
            },
            {
                id:      'copy',
                label:   'Copy',
                icon:    'material-symbols:content-copy',
                variant: 'default',
                action:  () => this._handleCopy(),
            },
        ];
    }

    private _getEditActions(): SelAction[] {
        return [
            {
                id:      'delete',
                label:   'Delete',
                icon:    'material-symbols:delete',
                variant: 'danger',
                action:  () => this._handleDelete(),
            },
        ];
    }

    private _getWallActions(): SelAction[] {
        return [
            {
                id:       'join',
                label:    'Join',
                icon:     'material-symbols:call-merge',
                variant:  'default',
                wallOnly: true,
                action:   () => this._handleJoin(),
            },
            {
                id:       'cut',
                label:    'Cut',
                icon:     'material-symbols:content-cut',
                variant:  'default',
                wallOnly: true,
                action:   () => this._handleCut(),
            },
        ];
    }

    private _buildBtn(action: SelAction): HTMLElement {
        const btn = document.createElement('button');
        btn.className = `sel-btn sel-btn--${action.variant}${action.wallOnly ? ' sel-btn--wall-only' : ''}`;
        btn.type = 'button';
        btn.title = action.label;
        btn.dataset.actionId = action.id;

        const iconEl = PryzmIcons.iconEl(action.icon, 'sel-btn-icon', 15);

        const labelEl = document.createElement('span');
        labelEl.textContent = action.label;

        btn.appendChild(iconEl);
        btn.appendChild(labelEl);

        btn.addEventListener('click', () => {
            console.log(`[SelectionOverlay] Action: ${action.id} — elementType: ${this._ctx.elementType}`);
            action.action();
        });

        return btn;
    }

    // ── Selection event wiring ──────────────────────────────────────────────

    private _wireSelectionEvent(): void {
        // F.events.16 — bim-selection-changed migrated to runtime.events typed bus.
        window.runtime?.events?.on('bim-selection-changed', (payload: unknown) => {
            const detail = payload as { object?: any | null };
            const obj = detail?.object ?? null;

            if (!obj) {
                this._ctx = { object: null, elementType: '' };
                this._hide();
                return;
            }

            const rawType = (
                obj.userData?.elementType ??
                obj.userData?.type ??
                ''
            ).toLowerCase();

            this._ctx = { object: obj, elementType: rawType };
            this._el.dataset.elementType = rawType;
            this._updateLabel(rawType);
            this._show();
        });
    }

    // ── Visibility ──────────────────────────────────────────────────────────

    private _show(): void {
        this._el.classList.add('sel-overlay--visible');
    }

    private _hide(): void {
        this._el.classList.remove('sel-overlay--visible');
        this._el.dataset.elementType = '';
    }

    // ── Label update ────────────────────────────────────────────────────────

    private _updateLabel(elementType: string): void {
        const labelEl = this._el.querySelector('.sel-label') as HTMLElement | null;
        if (!labelEl) return;

        const TYPE_DISPLAY: Record<string, string> = {
            wall:        'Wall',
            slab:        'Slab',
            floor:       'Floor',
            ceiling:     'Ceiling',
            column:      'Column',
            beam:        'Beam',
            door:        'Door',
            window:      'Window',
            furniture:   'Furniture',
            roof:        'Roof',
            stair:       'Stair',
            stairs:      'Stair',
            railing:     'Railing',
            'curtain-wall':  'Curtain Wall',
            curtainwall:     'Curtain Wall',
            plumbing:    'Plumbing',
        };

        labelEl.textContent = TYPE_DISPLAY[elementType] ?? 'Element';
    }

    // ── Action handlers ─────────────────────────────────────────────────────

    /** Switch the TransformControls gizmo to translate mode. */
    private _handleMove(): void {
        const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
        if (tc && typeof tc.setMode === 'function') {
            tc.setMode('translate');
            console.log('[SelectionOverlay] TransformControls → translate');
        } else {
            console.warn('[SelectionOverlay] transformControls not available for move');
        }
    }

    /** Switch the TransformControls gizmo to rotate mode. */
    private _handleRotate(): void {
        const tc = window.transformControls; // TODO(D.4): replace with runtime.scene.transformControls — Phase D.4
        if (tc && typeof tc.setMode === 'function') {
            tc.setMode('rotate');
            console.log('[SelectionOverlay] TransformControls → rotate');
        } else {
            console.warn('[SelectionOverlay] transformControls not available for rotate');
        }
    }

    /** Dispatch a copy request — consumed by future CopyElementCommand handler. */
    private _handleCopy(): void {
        const obj = this._ctx.object;
        if (!obj) return;
        // F.events.3: no active DOM listeners for bim-copy-requested — dispatch removed.
        // TODO(TASK-15): wire to commandBus.dispatch('element.copy', { id, elementType })
        console.log('[SelectionOverlay] Copy requested for', obj.userData?.id);
    }

    /** Delete via BimService (routes through commandManager internally). */
    private _handleDelete(): void {
        console.log('[SelectionOverlay] Deleting selection');
        this._service.deleteSelected();
    }

    /** Wall-join — dispatches event for WallJoinResolver to handle. */
    private _handleJoin(): void {
        if (this._ctx.elementType !== 'wall') return;
        const obj = this._ctx.object;
        if (!obj) return;
        // F.events.3: no active DOM listeners for bim-wall-join-requested — dispatch removed.
        // TODO(TASK-15): wire to commandBus.dispatch('wall.join', { id })
        console.log('[SelectionOverlay] Wall join requested for', obj.userData?.id);
    }

    /** Wall-cut — dispatches event for wall cut handler. */
    private _handleCut(): void {
        if (this._ctx.elementType !== 'wall') return;
        const obj = this._ctx.object;
        if (!obj) return;
        // F.events.3: no active DOM listeners for bim-wall-cut-requested — dispatch removed.
        // TODO(TASK-15): wire to commandBus.dispatch('wall.cut', { id })
        console.log('[SelectionOverlay] Wall cut requested for', obj.userData?.id);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    get element(): HTMLElement {
        return this._el;
    }
}
