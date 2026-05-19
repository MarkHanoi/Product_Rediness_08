/**
 * src/ui/platform/OwnerSettingsPanel.ts
 *
 * Platform Owner Settings Panel — CONTRACT Phase 10
 * CSS prefix: osp- (Owner Settings Panel) — claimed in §05 §3
 *
 * Opens as a full-screen modal overlay (above ProjectHub).
 * Only accessible when the signed-in user has plan === 'owner'.
 *
 * CONTRACT §05 §6 — zero bim-* elements; all native HTML
 * CONTRACT §05 §7.6 — no independent <style> injection; styles in OSP_STYLES → AppTheme.ts
 * CONTRACT §06 §3 — additive component; no existing code modified
 */

import { OwnerFeatureFlags, OwnerSettings } from '../OwnerFeatureFlags';

interface FlagDef {
    key:         keyof OwnerSettings;
    label:       string;
    description: string;
    group:       string;
}

const FLAG_DEFS: FlagDef[] = [
    { key: 'showAIPanel',       label: 'AI Design Assistant',    description: 'Show the AI chat panel in the left navigation rail.',            group: 'Features' },
    { key: 'showPhysicsPanel',  label: 'Physics Simulation',     description: 'Show the physics / structural simulation panel.',                  group: 'Features' },
    { key: 'showGISPanel',      label: 'GIS & Mapping',          description: 'Show the GIS / mapping integration panel.',                        group: 'Features' },
    { key: 'showRenderPanel',   label: 'Photorealistic Render',  description: 'Show the render panel and photorealistic gallery.',                 group: 'Features' },
    { key: 'showCollaboration', label: 'Collaboration',          description: 'Show real-time collaboration and member management.',               group: 'Features' },
    { key: 'showPricingPage',   label: 'Pricing Page',           description: 'Expose the public pricing page and pricing navigation link.',       group: 'Marketing' },
    { key: 'showStripeUpgrade', label: 'Upgrade / Stripe CTA',   description: 'Show upgrade buttons and Stripe billing flows to non-owner users.', group: 'Marketing' },
    { key: 'earlyAccessMode',   label: 'Early Access Banner',    description: 'Display an "Early Access" notice banner across the platform.',      group: 'Platform' },
    { key: 'maintenanceMode',   label: 'Maintenance Mode',       description: 'Disable the BIM editor for all users (show maintenance screen).',   group: 'Platform' },
];

export class OwnerSettingsPanel {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private _el: HTMLElement | null = null;

    open(): void {
        if (this._el) { this._el.remove(); }
        this._el = this._build();
        document.body.appendChild(this._el);
        console.log('[OwnerSettingsPanel] Opened');
    }

    close(): void {
        this._el?.remove();
        this._el = null;
    }

    private _build(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'osp-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Platform Owner Settings');

        const all = OwnerFeatureFlags.getAll();
        const groups = [...new Set(FLAG_DEFS.map(f => f.group))];

        const gearIcon = `<svg class="osp-header-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>`;

        const closeIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

        overlay.innerHTML = `
            <div class="osp-panel">
                <div class="osp-header">
                    <div class="osp-header-inner">
                        ${gearIcon}
                        <span class="osp-header-title">Platform Owner Settings</span>
                    </div>
                    <button class="osp-close" id="osp-close" aria-label="Close settings" title="Close">
                        ${closeIcon}
                    </button>
                </div>
                <div class="osp-body">
                    <p class="osp-desc">Control which features are enabled across the PRYZM platform. Changes are saved immediately and take effect on next page load.</p>

                    <div class="osp-group osp-group--arch">
                        <div class="osp-group-label">Architectural Intent</div>
                        <p class="osp-arch-desc">
                            These tools are available while you are inside a project. They let you adjust
                            element colours, line weights, fill styles, and visibility rules across all
                            views in that project.
                        </p>
                        <div class="osp-arch-tools">
                            <div class="osp-arch-tool">
                                <div class="osp-arch-tool-header">
                                    <span class="osp-arch-tool-name">Visual Governance Panel</span>
                                    <kbd class="osp-kbd">Ctrl</kbd><kbd class="osp-kbd">Shift</kbd><kbd class="osp-kbd">G</kbd>
                                </div>
                                <p class="osp-arch-tool-desc">
                                    Edit VG template fill colours and line weights per element category
                                    (wall, door, window, slab…). The <strong>Templates</strong> tab lets you
                                    create and apply custom colour schemes. The <strong>Graphics</strong> tab
                                    shows per-view overrides.
                                </p>
                            </div>
                            <div class="osp-arch-tool">
                                <div class="osp-arch-tool-header">
                                    <span class="osp-arch-tool-name">Visibility Intent Panel</span>
                                    <kbd class="osp-kbd">Ctrl</kbd><kbd class="osp-kbd">Shift</kbd><kbd class="osp-kbd">I</kbd>
                                </div>
                                <p class="osp-arch-tool-desc">
                                    Full Contract 25 intent editor. Define element rules per state
                                    (cut / projection / beyond / hidden) — including line colour, weight,
                                    fill colour, opacity, and pattern — and assign intents to views.
                                </p>
                            </div>
                        </div>
                        <p class="osp-arch-note">
                            Both shortcuts are owner-only and only active while the BIM editor is open.
                        </p>
                    </div>

                    ${groups.map(group => `
                        <div class="osp-group">
                            <div class="osp-group-label">${group}</div>
                            ${FLAG_DEFS.filter(f => f.group === group).map(f => `
                                <label class="osp-toggle-row" title="${f.description}">
                                    <div class="osp-toggle-info">
                                        <span class="osp-toggle-label">${f.label}</span>
                                        <span class="osp-toggle-desc">${f.description}</span>
                                    </div>
                                    <div class="osp-toggle-switch${all[f.key] ? ' osp-toggle-switch--on' : ''}"
                                         data-flag="${f.key}"
                                         role="switch"
                                         aria-checked="${all[f.key]}"
                                         tabindex="0">
                                        <div class="osp-toggle-thumb"></div>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    `).join('')}
                    <div class="osp-actions">
                        <button class="osp-reset-btn" id="osp-reset-btn">Reset to defaults</button>
                    </div>
                </div>
            </div>
        `;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        overlay.querySelector('#osp-close')!.addEventListener('click', () => this.close());

        overlay.querySelectorAll<HTMLElement>('[data-flag]').forEach(sw => {
            const toggle = () => {
                const flag = sw.dataset.flag as keyof OwnerSettings;
                const next = !OwnerFeatureFlags.isEnabled(flag);
                OwnerFeatureFlags.setFlag(flag, next);
                sw.classList.toggle('osp-toggle-switch--on', next);
                sw.setAttribute('aria-checked', String(next));
            };
            sw.addEventListener('click', toggle);
            sw.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
            });
        });

        overlay.querySelector('#osp-reset-btn')!.addEventListener('click', () => {
            if (!confirm('Reset all feature flags to defaults?')) return;
            OwnerFeatureFlags.reset();
            this.close();
            this.open();
        });

        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this._el) this.close();
        }, { once: true });

        return overlay;
    }
}
