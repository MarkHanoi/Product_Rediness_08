/**
 * @file OwnerSettingsPanel.ts
 * @description Wave 14 — F.11.1 — runtime.entitlements + runtime.ai.usage wiring.
 *   Owner-facing settings panel surfaces billing, entitlements, and AI spend.
 *   Phase F stub: entitlements.check() always returns true; ai.cost.snapshot()
 *   returns zeroed metrics.  Phase F.11.1 wires the real Stripe billing adapter.
 */

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

export interface OwnerSettingsPanelProps {
    readonly projectId: string | null;
}

export class OwnerSettingsPanel {
    private readonly _runtime: Runtime | null;
    private _el: HTMLElement | null = null;

    constructor(runtime: Runtime | null = null) {
        this._runtime = runtime;
    }

    mount(container: HTMLElement, props: OwnerSettingsPanelProps): void {
        this._el = document.createElement('div');
        this._el.className = 'owner-settings-panel';
        container.appendChild(this._el);
        this._render(props);
    }

    private _render(props: OwnerSettingsPanelProps): void {
        if (!this._runtime || !this._el) return;
        const { projectId } = props;

        // F.11.1 — runtime.entitlements.check wiring
        const hasAI = this._runtime.entitlements.check('ai');
        const hasMultiplayer = this._runtime.entitlements.check('multiplayer');

        // F.11.1 — runtime.ai.usage tracking wiring
        const aiCost = this._runtime.ai.cost.snapshot();

        this._el.innerHTML = `
            <div class="osp-header">Project Settings</div>
            <div class="osp-row">AI enabled: ${hasAI}</div>
            <div class="osp-row">Multiplayer enabled: ${hasMultiplayer}</div>
            <div class="osp-row">AI spend: $${aiCost.costUsd.toFixed(4)}</div>
            <div class="osp-row">Project: ${projectId ?? '(none)'}</div>
        `;
    }

    destroy(): void {
        this._el?.remove();
        this._el = null;
    }
}
