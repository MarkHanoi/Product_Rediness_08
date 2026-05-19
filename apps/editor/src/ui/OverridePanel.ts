/**
 * VisibilityGraphicsPanel (legacy class name: OverridePanel)
 *
 * Unified per-view Visibility & Graphics panel — Stage S4 consolidation.
 *
 * Replaces three previously separate header controls:
 *   - The legacy "V/G" button that opened window.vgGovernancePanel
 *   - The "Overrides" button that opened this panel
 *   - The inline Intent <select> dropdown
 *
 * The panel now exposes, in a single dialog, all view-scoped Visibility &
 * Graphics state owned by the modern Intent system:
 *   1. Intent picker        — choose a VisibilityIntent for the active view.
 *   2. Status banner        — shows when the view has local customisations
 *                             (isolate active, visibility/graphic overrides).
 *   3. Local overrides list — every per-element-type override, clearable.
 *   4. Promote / Clear-all  — promote local overrides into a new or existing
 *                             user intent, or wipe them.
 *
 * The class is still exported as `OverridePanel` so existing call sites
 * (window.overridePanel, PlanViewManager, ViewHeaderButtons) continue to work
 * unchanged.
 */

import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import type { GraphicOverride, VisibilityOverride } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import type { ElementState, OverrideLayer, VisibilityIntent } from '@pryzm/core-app-model';
import { makeDraggable } from './makeDraggable';
import { panelManager } from './PanelManager';

const PANEL_ID = 'panel:override';

export class OverridePanel {
    private panel: HTMLElement;
    private activeViewId: string | null = null;
    private disposeDrag: (() => void) | null = null;
    private boundRender = (): void => this.render();
    private _viInstanceDisposable: { dispose(): void } | null = null;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.panel = document.createElement('div');
        this.panel.className = 'vg-panel ov-panel';
        this.panel.style.display = 'none';
        document.body.appendChild(this.panel);
        // vi:instance-updated migrated to runtime.events (F.events.2b); DOM listener kept for vi:overrides-cleared only.
        this._viInstanceDisposable = this.runtime?.events?.on('vi:instance-updated', () => this.render()) ?? null; // F.events.2b
        window.addEventListener('vi:overrides-cleared', this.boundRender);
        window.addEventListener('vi:intent-created', this.boundRender);
        window.addEventListener('vi:intent-updated', this.boundRender);
        window.addEventListener('vi:intent-deleted', this.boundRender);
        this.disposeDrag = makeDraggable(this.panel, '.ov-header', ['.ov-close-btn']);
        panelManager.register(PANEL_ID, () => this.close());
    }

    open(viewId: string): void {
        this.activeViewId = viewId;
        // Ensure every view has an instance so the picker reflects + writes the
        // chosen intent on first open.
        if (!viewIntentInstanceStore.has(viewId)) {
            viewIntentInstanceStore.assign(viewId);
        }
        panelManager.notifyOpened(PANEL_ID);
        this.panel.style.display = 'flex';
        this.render();
    }

    close(): void {
        this.panel.style.display = 'none';
        panelManager.notifyClosed(PANEL_ID);
    }

    toggle(viewId: string): void {
        if (this.panel.style.display === 'none' || this.activeViewId !== viewId) this.open(viewId);
        else this.close();
    }

    dispose(): void {
        this._viInstanceDisposable?.dispose(); // F.events.2b — was window.removeEventListener('vi:instance-updated', ...)
        this._viInstanceDisposable = null;
        window.removeEventListener('vi:overrides-cleared', this.boundRender);
        window.removeEventListener('vi:intent-created', this.boundRender);
        window.removeEventListener('vi:intent-updated', this.boundRender);
        window.removeEventListener('vi:intent-deleted', this.boundRender);
        this.disposeDrag?.();
        this.panel.remove();
    }

    private render(): void {
        if (this.panel.style.display === 'none') return;
        const viewId = this.activeViewId;
        const instance = viewId ? viewIntentInstanceStore.get(viewId) : null;
        const overrides = instance?.localOverrides;
        const visibility = overrides?.visibilityOverrides ?? [];
        const graphics = overrides?.graphicOverrides ?? [];
        const intents = visibilityIntentStore.getAll();
        const activeIntent = instance ? visibilityIntentStore.get(instance.intentId) : null;
        const customised = Boolean(overrides && (overrides.isolateActive || visibility.length || graphics.length));
        const rows = [
            ...visibility.map(o => this.visibilityRow(o)),
            ...graphics.map(o => this.graphicRow(o)),
        ];

        this.panel.innerHTML = `
            <div class="vg-header ov-header">
                <div class="vg-header-title"><span class="vg-header-icon">◈</span>Visibility &amp; Graphics</div>
                <button class="vg-close-btn ov-close-btn" data-action="close">✕</button>
            </div>
            <div class="vg-body ov-body">
                <div class="ov-meta">View: ${this.escape(viewId ?? '— none —')}</div>

                <section class="ov-section">
                    <div class="ov-section-title">Intent</div>
                    <div class="ov-intent-row">
                        <select class="ov-intent-select" data-action="intent" ${viewId ? '' : 'disabled'}>
                            ${intents.map(i => `
                                <option value="${this.escape(i.id)}" ${activeIntent?.id === i.id ? 'selected' : ''}>
                                    ${this.escape(i.name)}${i.isSystem ? ' ★' : ''}
                                </option>
                            `).join('')}
                        </select>
                        <span class="ov-intent-badge ${customised ? 'ov-intent-badge--custom' : ''}">
                            ${customised ? 'Customised' : 'Clean'}
                        </span>
                    </div>
                    ${activeIntent?.description
                        ? `<div class="ov-intent-desc">${this.escape(activeIntent.description)}</div>`
                        : ''}
                </section>

                ${overrides?.isolateActive ? '<div class="ov-isolate-note">Isolate mode is active for this view.</div>' : ''}

                <section class="ov-section">
                    <div class="ov-section-title">Local overrides</div>
                    ${rows.length
                        ? `<div class="ov-list">${rows.join('')}</div>`
                        : '<div class="vg-empty">No active overrides for this view.</div>'}
                </section>

                <div class="ov-actions">
                    <button class="ov-promote" data-action="promote" ${customised ? '' : 'disabled'}>Promote to Intent</button>
                    <button class="ov-clear-all" data-action="clear-all" ${customised ? '' : 'disabled'}>Clear All Overrides</button>
                </div>
            </div>
        `;
        this.bind();
    }

    private visibilityRow(override: VisibilityOverride): string {
        return `
            <div class="ov-row">
                <div><b>${this.escape(override.action)}</b><span>${this.escape(override.targetKind)} · ${this.escape(override.targetId)}</span></div>
                <button data-action="clear" data-kind="${this.escape(override.targetKind)}" data-target="${this.escape(override.targetId)}">Clear</button>
            </div>
        `;
    }

    private graphicRow(override: GraphicOverride): string {
        return `
            <div class="ov-row">
                <div><b>graphic</b><span>${this.escape(override.targetKind)} · ${this.escape(override.targetId)} · ${this.escape(override.state)}</span></div>
                <button data-action="clear" data-kind="${this.escape(override.targetKind)}" data-target="${this.escape(override.targetId)}" data-state="${this.escape(override.state)}">Clear</button>
            </div>
        `;
    }

    private bind(): void {
        this.panel.querySelector('[data-action="close"]')?.addEventListener('click', () => this.close());
        const intentSelect = this.panel.querySelector('[data-action="intent"]') as HTMLSelectElement | null;
        intentSelect?.addEventListener('change', () => {
            if (!this.activeViewId) return;
            const intentId = intentSelect.value;
            this.runtime?.bus?.executeCommand('vg.assignIntent', { viewId: this.activeViewId, intentId });
        });
        this.panel.querySelector('[data-action="clear-all"]')?.addEventListener('click', () => {
            if (!this.activeViewId) return;
            this.runtime?.bus?.executeCommand('view.clearAllOverrides', { viewId: this.activeViewId });
            this.render();
        });
        this.panel.querySelector('[data-action="promote"]')?.addEventListener('click', () => this.promoteToIntent());
        this.panel.querySelectorAll('[data-action="clear"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!this.activeViewId) return;
                const el = btn as HTMLElement;
                this.runtime?.bus?.executeCommand('view.clearOverride', {
                    viewId:     this.activeViewId,
                    targetKind: el.dataset.kind,
                    targetId:   el.dataset.target ?? '',
                    state:      el.dataset.state,
                });
                this.render();
            });
        });
    }

    private promoteToIntent(): void {
        if (!this.activeViewId) return;
        const instance = viewIntentInstanceStore.get(this.activeViewId);
        const overrides = instance?.localOverrides;
        const currentIntent = instance ? visibilityIntentStore.get(instance.intentId) : null;
        if (!instance || !overrides || !currentIntent) return;
        const mode = window.prompt('Promote overrides to intent. Type "new" to create a new intent, or press OK to update the current intent.', currentIntent.isSystem ? 'new' : 'update');
        if (!mode) return;
        const clone: VisibilityIntent = JSON.parse(JSON.stringify(currentIntent));
        clone.id = mode.toLowerCase() === 'new' || currentIntent.isSystem ? `vi-${crypto.randomUUID()}` : currentIntent.id;
        clone.name = mode.toLowerCase() === 'new' || currentIntent.isSystem
            ? (window.prompt('New intent name:', `${currentIntent.name.replace(/\s*\(Auto\)$/i, '')} Custom`) || `${currentIntent.name} Custom`)
            : currentIntent.name;
        clone.isSystem = false;
        clone.elementRules = this.applyOverridesToRules(clone, overrides);
        if (clone.id !== currentIntent.id) {
            this.runtime?.bus?.executeCommand('vg.createVisibilityIntent', clone);
            this.runtime?.bus?.executeCommand('vg.assignIntent', { viewId: this.activeViewId, intentId: clone.id });
            this.runtime?.bus?.executeCommand('view.clearAllOverrides', { viewId: this.activeViewId });
            this.render();
        } else {
            this.runtime?.bus?.executeCommand('vg.updateVisibilityIntent', { intentId: clone.id, patch: { elementRules: clone.elementRules } });
            this.runtime?.bus?.executeCommand('view.clearAllOverrides', { viewId: this.activeViewId });
            this.render();
        }
    }

    private applyOverridesToRules(intent: VisibilityIntent, overrides: OverrideLayer): VisibilityIntent['elementRules'] {
        const rules = JSON.parse(JSON.stringify(intent.elementRules));
        const states: ElementState[] = ['cut', 'projection', 'beyond', 'hidden'];
        for (const override of overrides.graphicOverrides) {
            if (override.targetKind === 'element') continue;
            const key = override.targetId;
            const base = rules[key] ?? rules.__default__;
            if (!base) continue;
            rules[key] = JSON.parse(JSON.stringify(base));
            rules[key].elementType = key;
            rules[key][override.state] = {
                ...rules[key][override.state],
                ...override.patch,
                line: { ...rules[key][override.state].line, ...(override.patch.line ?? {}) },
                fill: { ...rules[key][override.state].fill, ...(override.patch.fill ?? {}) },
            };
        }
        for (const override of overrides.visibilityOverrides) {
            if (override.targetKind === 'element') continue;
            const key = override.targetId;
            const base = rules[key] ?? rules.__default__;
            if (!base) continue;
            rules[key] = JSON.parse(JSON.stringify(base));
            rules[key].elementType = key;
            for (const state of states) {
                if (override.action === 'hide') rules[key][state].visible = false;
                if (override.action === 'ghost') {
                    rules[key][state].ghostStyle = override.ghostStyle ?? 'fade';
                    rules[key][state].ghostOpacity = 0.35;
                }
            }
        }
        return rules;
    }

    private escape(value: string): string {
        return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
    }
}
