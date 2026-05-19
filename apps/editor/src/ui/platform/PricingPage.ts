/**
 * PricingPage — PRYZM Monetization Layer 4 (UI)
 *
 * Full pricing page shown when user clicks "Upgrade" or "View Plans".
 * Mounts into #platform-root like other platform components.
 *
 * Class prefix: pr-  (Pricing Page)
 *
 * Contract compliance:
 *   §05 §5    — CSS in AppTheme.ts (pr- prefix)
 *   §05 §7.6  — No independent <style> injection
 *   §06 §1    — No BIM engine imports
 *   §06 §3    — Implements destroy()
 */

import { injectAppTheme } from '../styles/AppTheme';
import { Plan, PLAN_PRICING, PLAN_LIMITS } from '@pryzm/core-app-model';
import { EntitlementStore } from '@pryzm/core-app-model';

export interface PricingPageCallbacks {
    onBack: () => void;
    onSelectPlan: (plan: Plan) => void;
}

const PLAN_FEATURES: Record<Plan, string[]> = {
    free: [
        'Up to 3 saved projects',
        'All core modeling tools',
        '5 AI actions/month (Design Advisor)',
        'Basic view modes',
        'PNG export',
        'Single user',
    ],
    architect: [
        'Unlimited projects',
        'All modeling features incl. curtain walls & roofs',
        'IFC & GLB/GLTF export',
        '50 AI actions/month (all AI tools)',
        'Geospatial / Cesium view',
        'Version history (last 15)',
        'PDF export',
        'Email support',
    ],
    studio: [
        'Everything in Architect',
        'Up to 8 seats (floating licenses)',
        'Real-time collaboration',
        'Shared project library',
        '200 AI actions/month (shared pool)',
        'Unlimited version history',
        'Custom roles & permissions',
        'Priority email + chat support',
    ],
    firm: [
        'Everything in Studio',
        'Up to 25 seats',
        '500 AI actions/month (shared pool)',
        'Cloud-backed persistent storage',
        'SSO / SAML authentication',
        'AI Approval audit trail export',
        'API access',
        '4-hour priority support SLA',
        'Dedicated onboarding session',
    ],
    enterprise: [
        'Bespoke platform deployment (custom scoping — see below)',
        'Unlimited seats',
        'Custom AI action limits',
        'White-labeling options',
        'On-premise deployment option',
        'Custom IFC schema configuration',
        'Dedicated customer success manager',
        'Custom SLAs & DPA',
        'Volume discounts on AI add-ons',
    ],
    owner: [
        'Unlimited projects, seats & AI actions',
        'All export formats (IFC, GLB, PDF)',
        'Full collaboration & version history',
        'All AI tools unlocked',
        'Geospatial / Cesium view',
        'API access & SSO',
        'Admin plan management endpoint',
        'Platform super-owner access',
    ],
};

const ADDON_PACKS = [
    { actions: 25, price: 9 },
    { actions: 100, price: 29 },
    { actions: 500, price: 99 },
];

export class PricingPage {
    private el: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private root: HTMLElement,
        private callbacks: PricingPageCallbacks,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        injectAppTheme();
        this.el = this.build();
        this.root.appendChild(this.el);
    }

    private build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'pr-page';
        el.innerHTML = this.render();
        this.attachListeners(el);
        return el;
    }

    private render(): string {
        const currentPlan = EntitlementStore.getUserPlan();
        const plans: Plan[] = ['free', 'architect', 'studio', 'firm', 'enterprise'];

        return `
            <!-- Header -->
            <header class="pr-header">
                <button class="pr-back-btn" id="pr-back">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M19 12H5"/><path d="m12 5-7 7 7 7"/>
                    </svg>
                    Back
                </button>
                <div class="pr-header-brand">
                    <img src="/pryzm-logo.png" class="pr-logo-mark" alt="" aria-hidden="true" />
                    <img src="/pryzm-logo-text.png" class="pr-logo-text" alt="PRYZM" />
                </div>
            </header>

            <!-- Hero -->
            <div class="pr-hero">
                <h1 class="pr-hero-title">Plans & Pricing</h1>
                <p class="pr-hero-subtitle">Start free. Upgrade when your practice grows. Cancel anytime.</p>
                <div class="pr-billing-toggle">
                    <span class="pr-billing-label pr-billing-label--active" id="pr-billing-monthly">Monthly</span>
                    <div class="pr-billing-switch" id="pr-billing-switch" data-annual="false">
                        <div class="pr-billing-knob"></div>
                    </div>
                    <span class="pr-billing-label" id="pr-billing-annual">Annual <span class="pr-save-badge">Save 17%</span></span>
                </div>
            </div>

            <!-- Plan cards -->
            <div class="pr-plans" id="pr-plans">
                ${plans.map(p => this.renderPlanCard(p, currentPlan, false)).join('')}
            </div>

            <!-- Stream 2 — Bespoke Enterprise Band -->
            <div class="pr-bespoke-band">
                <div class="pr-bespoke-band-inner">
                    <div class="pr-bespoke-content">
                        <h2 class="pr-bespoke-heading">Enterprise custom deployments</h2>
                        <p class="pr-bespoke-desc">For organisations that need PRYZM deployed as their own product — white-labelled, on-premise, and fully customised to your workflows. Scoped and priced separately from the plans above.</p>
                        <ul class="pr-bespoke-list">
                            <li>Discovery and scoping workshop</li>
                            <li>Custom IFC schema configuration</li>
                            <li>Bespoke element family and material libraries</li>
                            <li>Integration with your existing tools (ERP, Revit, project management)</li>
                            <li>White-label branding and private deployment</li>
                            <li>Handover, training, and ongoing engineering support</li>
                        </ul>
                    </div>
                    <div class="pr-bespoke-cta-wrap">
                        <button id="pr-bespoke-cta">Talk to us about a bespoke build</button>
                    </div>
                </div>
            </div>

            <!-- AI Credit Add-ons -->
            <div class="pr-addons-section">
                <h2 class="pr-addons-title">AI Credit Add-ons</h2>
                <p class="pr-addons-subtitle">Need more AI actions without upgrading? Buy additional credits anytime. Available for all paid plans.</p>
                <div class="pr-addons-grid">
                    ${ADDON_PACKS.map(pack => `
                        <div class="pr-addon-card">
                            <div class="pr-addon-icon">🤖</div>
                            <div class="pr-addon-actions">${pack.actions} AI actions</div>
                            <div class="pr-addon-price">$${pack.price}</div>
                            <div class="pr-addon-period">one-time</div>
                            <button class="pr-addon-btn" data-pack="${pack.actions}">Purchase</button>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- FAQ -->
            <div class="pr-faq-section">
                <h2 class="pr-faq-title">Frequently asked questions</h2>
                <div class="pr-faq-grid">
                    ${this.renderFAQ()}
                </div>
            </div>

            <!-- Footer CTA -->
            <div class="pr-footer-cta">
                <p class="pr-footer-cta-text">Questions? We're happy to help.</p>
                <a class="pr-footer-cta-link" href="mailto:hello@pryzm.io">Contact sales →</a>
            </div>
        `;
    }

    private renderPlanCard(plan: Plan, currentPlan: Plan, isAnnual: boolean): string {
        const pricing = PLAN_PRICING[plan];
        const limits = PLAN_LIMITS[plan];
        const features = PLAN_FEATURES[plan];
        const isCurrent = plan === currentPlan;
        const isHighlighted = pricing.highlighted;

        const price = isAnnual ? pricing.annualUSD : pricing.monthlyUSD;
        const priceDisplay = price === null ? 'Custom' : price === 0 ? 'Free' : `$${price}`;
        const period = price === null || price === 0 ? '' : isAnnual ? '/year' : '/mo';

        const seatsDisplay = limits.maxSeats === -1 ? 'Unlimited seats'
            : limits.maxSeats === 1 ? 'Single user'
            : `Up to ${limits.maxSeats} seats`;

        const aiDisplay = limits.aiActionsPerMonth === -1 ? 'Unlimited AI actions'
            : `${limits.aiActionsPerMonth} AI actions/month`;

        return `
            <div class="pr-plan-card ${isHighlighted ? 'pr-plan-card--highlighted' : ''} ${isCurrent ? 'pr-plan-card--current' : ''}" data-plan="${plan}">
                ${isHighlighted ? '<div class="pr-popular-badge">Most Popular</div>' : ''}
                ${isCurrent ? '<div class="pr-current-badge">Your Plan</div>' : ''}

                <div class="pr-plan-header">
                    <h3 class="pr-plan-name">${pricing.label}</h3>
                    <p class="pr-plan-tagline">${pricing.tagline}</p>
                    <div class="pr-plan-price">
                        <span class="pr-plan-price-amount">${priceDisplay}</span>
                        <span class="pr-plan-price-period">${period}</span>
                    </div>
                    <div class="pr-plan-meta">${seatsDisplay} · ${aiDisplay}</div>
                </div>

                <button class="pr-plan-btn ${isCurrent ? 'pr-plan-btn--current' : isHighlighted ? 'pr-plan-btn--highlighted' : ''}"
                    data-plan="${plan}"
                    ${isCurrent ? 'disabled' : ''}>
                    ${isCurrent ? 'Current plan' : pricing.ctaLabel}
                </button>

                <ul class="pr-feature-list">
                    ${features.map(f => `
                        <li class="pr-feature-item">
                            <span class="pr-feature-check">✓</span>
                            ${f}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }

    private renderFAQ(): string {
        const items = [
            ['Can I switch plans anytime?', 'Yes. You can upgrade or downgrade at any time. When upgrading, you get immediate access. When downgrading, your current plan runs until the end of the billing period.'],
            ['What happens to my projects if I downgrade?', 'Your projects and data are always preserved. If you exceed the free tier limit of 3 projects, existing projects remain accessible — you just can\'t create new ones until you\'re under the limit.'],
            ['How are AI actions counted?', 'Each Claude API call counts as one action — Design Advisor queries, Floor Plan AI analysis, Element Creator generations, and Wardrobe Factory calls. Retries due to validation errors also count.'],
            ['Is the IFC export compliant with industry standards?', 'Yes. PRYZM exports IFC2x3 and IFC4 formats fully compatible with Revit, ArchiCAD, BIMcollab, Solibri, and all major BIM platforms.'],
            ['Do you offer discounts for students or education?', 'Yes. Architecture and engineering students get full Architect tier features free with a verified .edu email. Contact us for institutional licensing.'],
            ['What payment methods do you accept?', 'All major credit and debit cards (Visa, Mastercard, Amex). Annual plans can also be paid by invoice for Firm and Enterprise.'],
        ];

        return items.map(([q, a]) => `
            <div class="pr-faq-item">
                <div class="pr-faq-question">${q}</div>
                <div class="pr-faq-answer">${a}</div>
            </div>
        `).join('');
    }

    private attachListeners(el: HTMLElement): void {
        el.querySelector('#pr-back')!.addEventListener('click', () => this.callbacks.onBack());

        let isAnnual = false;
        const billingSwitch = el.querySelector('#pr-billing-switch') as HTMLElement;
        const monthlyLabel = el.querySelector('#pr-billing-monthly') as HTMLElement;
        const annualLabel = el.querySelector('#pr-billing-annual') as HTMLElement;

        const toggleBilling = () => {
            isAnnual = !isAnnual;
            this.currentBilling = isAnnual ? 'annual' : 'monthly';
            billingSwitch.dataset.annual = String(isAnnual);
            monthlyLabel.classList.toggle('pr-billing-label--active', !isAnnual);
            annualLabel.classList.toggle('pr-billing-label--active', isAnnual);

            const plansEl = el.querySelector('#pr-plans')!;
            const currentPlan = EntitlementStore.getUserPlan();
            const plans: Plan[] = ['free', 'architect', 'studio', 'firm', 'enterprise'];
            plansEl.innerHTML = plans.map(p => this.renderPlanCard(p, currentPlan, isAnnual)).join('');

            plansEl.querySelectorAll<HTMLButtonElement>('button[data-plan]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const plan = btn.dataset.plan as Plan;
                    if (plan && !btn.disabled) this.handleSelectPlan(plan);
                });
            });
        };

        billingSwitch.addEventListener('click', toggleBilling);
        el.querySelector('#pr-billing-monthly')!.addEventListener('click', () => { if (isAnnual) toggleBilling(); });
        el.querySelector('#pr-billing-annual')!.addEventListener('click', () => { if (!isAnnual) toggleBilling(); });

        el.querySelector('#pr-plans')!.addEventListener('click', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-plan]');
            if (btn && !btn.hasAttribute('disabled')) {
                const plan = btn.dataset.plan as Plan;
                if (plan) this.handleSelectPlan(plan);
            }
        });

        el.querySelector('#pr-bespoke-cta')!.addEventListener('click', () => {
            window.open('mailto:hello@pryzm.io?subject=PRYZM+Bespoke+Build+Enquiry', '_blank');
        });

        el.querySelectorAll<HTMLElement>('.pr-addon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const pack = btn.dataset.pack;
                alert(`AI Credit Pack (${pack} actions) — payment integration coming soon. Contact hello@pryzm.io to purchase.`);
            });
        });
    }

    // Tracks the current billing interval (set by the toggle)
    private currentBilling: 'monthly' | 'annual' = 'monthly';

    private handleSelectPlan(plan: Plan): void {
        const currentPlan = EntitlementStore.getUserPlan();
        if (plan === currentPlan) return;

        if (plan === 'enterprise') {
            window.open('mailto:hello@pryzm.io?subject=PRYZM Enterprise Inquiry', '_blank');
            return;
        }

        if (plan === 'free') {
            // Downgrade: direct to Billing Portal so Stripe handles cancellation
            this.openBillingPortal();
            return;
        }

        // Paid plan — redirect to Stripe Checkout
        this.startCheckout(plan, this.currentBilling);
    }

    /**
     * Creates a Stripe Checkout Session on the server and redirects the browser to it.
     */
    private async startCheckout(plan: Plan, billing: 'monthly' | 'annual'): Promise<void> {
        // Retrieve the auth token from localStorage — required for server auth
        let token: string | null = null;
        try {
            const raw = localStorage.getItem('bim-platform-user');
            if (raw) {
                const user = JSON.parse(raw);
                token = user.token ?? null;
            }
        } catch { /* ignore */ }

        if (!token) {
            alert('Please sign in first, then come back to upgrade your plan.');
            return;
        }

        // Show a loading state on the button
        const btns = this.el.querySelectorAll<HTMLButtonElement>(`button[data-plan="${plan}"]`);
        btns.forEach(btn => {
            btn.textContent = 'Redirecting to payment…';
            btn.disabled = true;
        });

        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ plan, billing }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error ?? `Server error ${res.status}`);
            }

            if (data.url) {
                // Redirect the browser to Stripe Checkout
                window.location.href = data.url;
            } else {
                throw new Error('No checkout URL returned from server.');
            }
        } catch (err: any) {
            console.error('[PricingPage] Checkout error:', err);
            // Restore the buttons
            const pricing = PLAN_PRICING[plan];
            btns.forEach(btn => {
                btn.textContent = pricing.ctaLabel;
                btn.disabled = false;
            });
            alert(`Could not start checkout: ${err.message ?? 'Unknown error'}`);
        }
    }

    /**
     * Opens the Stripe Billing Portal so the user can cancel or change their plan.
     */
    private async openBillingPortal(): Promise<void> {
        let token: string | null = null;
        try {
            const raw = localStorage.getItem('bim-platform-user');
            if (raw) token = JSON.parse(raw).token ?? null;
        } catch { /* ignore */ }

        if (!token) {
            alert('Please sign in to manage your subscription.');
            return;
        }

        try {
            const res = await fetch('/api/stripe/portal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
            if (data.url) window.location.href = data.url;
        } catch (err: any) {
            alert(`Could not open billing portal: ${err.message}`);
        }
    }

    destroy(): void {
        this.el.remove();
    }
}
