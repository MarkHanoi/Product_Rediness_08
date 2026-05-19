/**
 * UpgradeModal — Monetization Layer 4 (UI)
 *
 * Shown when a user tries to access a gated feature beyond their plan.
 * Triggered either directly (via UpgradeModal.show()) or via the
 * 'pryzm-upgrade-required' window event (dispatched by AI factories).
 *
 * Class prefix: um-  (Upgrade Modal)
 *
 * Contract compliance:
 *   §05 §5    — CSS in AppTheme.ts (um- prefix)
 *   §05 §7.6  — No independent <style> injection
 *   §06 §1    — No BIM engine imports
 *   §06 §3    — Implements destroy()
 *   §06 §10.1 — No BIM engine imports
 */

import { injectAppTheme } from '../styles/AppTheme';
import { Feature, PLAN_PRICING, getPlanDisplayName, suggestedUpgradePlan } from '@pryzm/core-app-model';
import { EntitlementStore } from '@pryzm/core-app-model';

export interface UpgradeModalCallbacks {
    onViewPricing: () => void;
    onClose: () => void;
}

const FEATURE_COPY: Record<Feature, { title: string; description: string; icon: string }> = {
    [Feature.IFC_EXPORT]: {
        icon: '📦',
        title: 'IFC Export requires Architect plan',
        description: 'Export industry-standard IFC files for use in Revit, ArchiCAD, and any BIM platform. Available from the Architect plan upward.',
    },
    [Feature.GLB_EXPORT]: {
        icon: '🌐',
        title: 'GLB Export requires Architect plan',
        description: 'Export your 3D model as GLB/GLTF for use in web viewers, VR, and Cesium geospatial deployments.',
    },
    [Feature.AI_DESIGN_ADVISOR]: {
        icon: '🤖',
        title: 'AI quota reached',
        description: 'You\'ve used all your AI actions for this month. Upgrade to unlock more AI-powered design assistance.',
    },
    [Feature.AI_FLOOR_PLAN]: {
        icon: '🗺️',
        title: 'Floor Plan AI requires Architect plan',
        description: 'Upload a PDF floor plan and let AI extract walls, doors, windows, and furniture automatically in seconds.',
    },
    [Feature.AI_ELEMENT_CREATOR]: {
        icon: '✨',
        title: 'AI Element Creator requires Architect plan',
        description: 'Upload a photo of any furniture or object and AI will generate a parametric 3D model for your BIM project.',
    },
    [Feature.AI_WARDROBE]: {
        icon: '🪞',
        title: 'AI Wardrobe Factory requires Architect plan',
        description: 'Describe a wardrobe configuration in natural language and AI builds it instantly — modules, shelves, drawers, and all.',
    },
    [Feature.CESIUM_GIS]: {
        icon: '🌍',
        title: 'Geospatial / Cesium requires Architect plan',
        description: 'Place your BIM model on the real globe using CesiumJS — georeferenced WGS84 positioning and GLB export to Earth.',
    },
    [Feature.COLLABORATION]: {
        icon: '👥',
        title: 'Collaboration requires Studio plan',
        description: 'Real-time multiplayer editing, shared project library, and workspace management for your entire team.',
    },
    [Feature.VERSION_HISTORY]: {
        icon: '🕐',
        title: 'Version history requires Architect plan',
        description: 'Save and restore named snapshots of your project at any point in time. Never lose a design iteration.',
    },
    [Feature.UNLIMITED_PROJECTS]: {
        icon: '📁',
        title: 'Project limit reached',
        description: 'Free accounts can hold up to 3 projects. Upgrade to Architect for unlimited projects.',
    },
    [Feature.PDF_EXPORT]: {
        icon: '📄',
        title: 'PDF Export requires Architect plan',
        description: 'Export your floor plans and views as high-quality PDFs ready for client presentations and contractor handoff.',
    },
    [Feature.ADDITIONAL_SEATS]: {
        icon: '💺',
        title: 'Additional seats require Studio plan',
        description: 'Add team members to your workspace. Studio supports up to 8 seats, Firm up to 25.',
    },
    [Feature.API_ACCESS]: {
        icon: '🔌',
        title: 'API access requires Firm plan',
        description: 'Programmatic access to your project data, version snapshots, and BIM element queries via REST API.',
    },
    [Feature.SSO]: {
        icon: '🔐',
        title: 'SSO / SAML requires Firm plan',
        description: 'Enterprise single sign-on authentication for your organisation\'s identity provider.',
    },
    [Feature.AI_ACTIONS]: {
        icon: '🤖',
        title: 'AI quota reached',
        description: 'You\'ve used all your AI actions for this month. Upgrade to get more monthly AI actions.',
    },
};

export class UpgradeModal {
    private static instance: UpgradeModal | null = null;
    /** F.events.2d — truthy sentinel that globalInit() has run. */
    private static upgradeEventListener: (() => void) | null = null;

    private overlay: HTMLElement;

    /**
     * Static factory — ensures only one UpgradeModal is shown at a time.
     */
    static show(
        feature: Feature,
        callbacks: UpgradeModalCallbacks
    ): UpgradeModal {
        UpgradeModal.instance?.destroy();
        const modal = new UpgradeModal(feature, callbacks);
        UpgradeModal.instance = modal;
        return modal;
    }

    /**
     * Registers a global window event listener for 'pryzm-upgrade-required'.
     * Call once from PlatformRouter. Allows AI layer to trigger UI without
     * importing platform components (maintains layer separation).
     */
    static globalInit(onViewPricing: () => void): void {
        if (UpgradeModal.upgradeEventListener) return;

        // F.events.2d — subscribe on runtime.events; dispatch migrated in F.events.2c.
        // globalInit() is called from PlatformRouter after runtime is composed, so
        // window.runtime?.events is available here.
        const unsub = window.runtime?.events?.on('pryzm-upgrade-required', (payload: { feature: string; reason?: string; plan?: string }) => {
            const feature = (payload?.feature as Feature) || Feature.AI_ACTIONS;
            UpgradeModal.show(feature, {
                onViewPricing,
                onClose: () => UpgradeModal.instance?.destroy(),
            });
        }) ?? (() => {});

        // Store unsub as sentinel (truthy) so repeated calls to globalInit() are no-ops.
        UpgradeModal.upgradeEventListener = unsub;
    }

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    private constructor(
        private feature: Feature,
        private callbacks: UpgradeModalCallbacks,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        injectAppTheme();
        this.overlay = this.build();
        document.body.appendChild(this.overlay);

        setTimeout(() => this.overlay.classList.add('um-overlay--visible'), 10);
    }

    private build(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'um-overlay';

        const currentPlan = EntitlementStore.getUserPlan();
        const suggestedPlan = suggestedUpgradePlan(currentPlan, this.feature);
        const copy = FEATURE_COPY[this.feature] || FEATURE_COPY[Feature.AI_ACTIONS];
        const pricing = PLAN_PRICING[suggestedPlan];

        const isAIQuota = this.feature === Feature.AI_ACTIONS ||
            this.feature === Feature.AI_DESIGN_ADVISOR ||
            this.feature === Feature.AI_ELEMENT_CREATOR ||
            this.feature === Feature.AI_FLOOR_PLAN ||
            this.feature === Feature.AI_WARDROBE;

        const aiUsageInfo = isAIQuota
            ? `<div class="um-usage-bar-wrap">
                <div class="um-usage-label">
                    <span>AI Actions used this month</span>
                    <span>${EntitlementStore.getAIActionsUsed()} / ${EntitlementStore.getAIActionsLimit()}</span>
                </div>
                <div class="um-usage-bar">
                    <div class="um-usage-fill" style="width:100%"></div>
                </div>
               </div>`
            : '';

        overlay.innerHTML = `
            <div class="um-modal">
                <button class="um-close" id="um-close" aria-label="Close">×</button>

                <div class="um-icon">${copy.icon}</div>
                <h2 class="um-title">${copy.title}</h2>
                <p class="um-description">${copy.description}</p>

                ${aiUsageInfo}

                <div class="um-plan-badge">
                    <span class="um-plan-badge-label">Unlock with</span>
                    <span class="um-plan-badge-name">${getPlanDisplayName(suggestedPlan)}</span>
                    ${pricing.monthlyUSD !== null ? `<span class="um-plan-badge-price">from $${pricing.monthlyUSD}/mo</span>` : ''}
                </div>

                <div class="um-actions">
                    <button class="um-btn um-btn-primary" id="um-view-pricing">View plans & pricing</button>
                    <button class="um-btn um-btn-secondary" id="um-cancel">Maybe later</button>
                </div>

                <p class="um-footer">All plans include a free trial. No credit card required to start.</p>
            </div>
        `;

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.handleClose();
        });

        overlay.querySelector('#um-close')!.addEventListener('click', () => this.handleClose());
        overlay.querySelector('#um-cancel')!.addEventListener('click', () => this.handleClose());
        overlay.querySelector('#um-view-pricing')!.addEventListener('click', () => {
            this.destroy();
            this.callbacks.onViewPricing();
        });

        return overlay;
    }

    private handleClose(): void {
        this.destroy();
        this.callbacks.onClose();
    }

    destroy(): void {
        this.overlay.remove();
        if (UpgradeModal.instance === this) {
            UpgradeModal.instance = null;
        }
    }
}

/**
 * Utility function for AI factories to request an upgrade prompt
 * without importing platform UI (maintains layer separation).
 */
export function dispatchUpgradeRequired(feature: Feature): void {
    window.runtime?.events?.emit('pryzm-upgrade-required', { feature: String(feature) }); // F.events.12
}
