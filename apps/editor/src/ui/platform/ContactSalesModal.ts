/**
 * ContactSalesModal — Sales contact overlay
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (cs- prefix)
 *   §05 §7.6 — No independent <style> injection; uses injectAppTheme()
 *   §06      — Zero BIM engine interaction; purely presentational
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * Class prefix: cs-  (Contact Sales)
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';

export class ContactSalesModal {
    private overlay: HTMLElement;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private root: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.overlay = this.build();
        this.root.appendChild(this.overlay);
        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('contact-sales-modal-show', () => {
            this.overlay.querySelector<HTMLElement>('.cs-overlay')?.classList.add('cs-overlay--visible');
        });
    }

    private build(): HTMLElement {
        const wrap = document.createElement('div');

        wrap.innerHTML = `
            <div class="cs-overlay" role="dialog" aria-modal="true" aria-label="Contact sales">
                <div class="cs-modal">
                    <!-- Close button -->
                    <button class="cs-close" id="cs-close" aria-label="Close">&times;</button>

                    <!-- ── Left column ─────────────────────────────── -->
                    <div class="cs-left">
                        <div class="cs-left-top">
                            <h1 class="cs-heading">Contact us</h1>
                            <p class="cs-subheading">Talk to a member of our sales team</p>
                            <p class="cs-body">
                                We can give you a demo, help you choose the right plan for your team,
                                or share best practices for getting the most out of Pryzm.
                            </p>
                        </div>

                        <div class="cs-support-block">
                            <h2 class="cs-support-title">Get product or account support</h2>
                            <p class="cs-support-body">We are here to help you with any of your needs.</p>
                            <a class="cs-support-btn" href="#" id="cs-support-link">Get support</a>
                        </div>
                    </div>

                    <!-- ── Right column ────────────────────────────── -->
                    <div class="cs-right">
                        <div class="cs-form-header">
                            <h2 class="cs-form-title">Contact sales</h2>
                            <p class="cs-form-note">
                                Looking for Product Support?
                                <a class="cs-hub-link" href="#" id="cs-hub-link">Visit our Support Hub.</a>
                            </p>
                        </div>

                        <form class="cs-form" id="cs-form" novalidate>
                            <p class="cs-required-note">* Required</p>

                            <div class="cs-field">
                                <label class="cs-label" for="cs-email">Work email address*</label>
                                <input
                                    class="cs-input"
                                    id="cs-email"
                                    type="email"
                                    placeholder="you@company.com"
                                    autocomplete="work email"
                                    required
                                />
                                <span class="cs-field-error" id="cs-email-error"></span>
                            </div>

                            <button class="cs-submit" type="submit">Get started</button>
                        </form>

                        <p class="cs-privacy">
                            By submitting, you agree to our
                            <a class="cs-privacy-link" href="/legal/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                        </p>
                    </div>
                </div>
            </div>
        `;

        // Close on backdrop click
        const overlay = wrap.querySelector<HTMLElement>('.cs-overlay')!;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.destroy();
        });

        // Close button
        wrap.querySelector('#cs-close')!.addEventListener('click', () => this.destroy());

        // Support / hub links — no-op for now
        wrap.querySelector('#cs-support-link')!.addEventListener('click', (e) => e.preventDefault());
        wrap.querySelector('#cs-hub-link')!.addEventListener('click', (e) => e.preventDefault());

        // Form submit
        const form = wrap.querySelector<HTMLFormElement>('#cs-form')!;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = wrap.querySelector<HTMLInputElement>('#cs-email')!;
            const errorEl = wrap.querySelector<HTMLElement>('#cs-email-error')!;

            const email = emailInput.value.trim();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                emailInput.classList.add('cs-input--error');
                errorEl.textContent = 'Please enter a valid work email address.';
                emailInput.focus();
                return;
            }

            emailInput.classList.remove('cs-input--error');
            errorEl.textContent = '';
            this.showSuccess(wrap, email);
        });

        // Clear error on input
        wrap.querySelector<HTMLInputElement>('#cs-email')!.addEventListener('input', () => {
            wrap.querySelector<HTMLInputElement>('#cs-email')!.classList.remove('cs-input--error');
            wrap.querySelector<HTMLElement>('#cs-email-error')!.textContent = '';
        });

        // Escape key
        const keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.destroy();
        };
        document.addEventListener('keydown', keyHandler);
        (this as any)._keyHandler = keyHandler;

        return wrap;
    }

    private showSuccess(wrap: HTMLElement, email: string): void {
        const right = wrap.querySelector<HTMLElement>('.cs-right')!;
        right.innerHTML = `
            <div class="cs-success">
                <div class="cs-success-icon">✓</div>
                <h2 class="cs-success-title">Thank you!</h2>
                <p class="cs-success-body">
                    We've received your request for <strong>${email}</strong>.<br>
                    A member of our team will be in touch shortly.
                </p>
                <button class="cs-success-close" id="cs-success-close">Close</button>
            </div>
        `;
        right.querySelector('#cs-success-close')!.addEventListener('click', () => this.destroy());
    }

    destroy(): void {
        const overlay = this.overlay.querySelector<HTMLElement>('.cs-overlay');
        if (overlay) overlay.classList.remove('cs-overlay--visible');
        document.removeEventListener('keydown', (this as any)._keyHandler);
        setTimeout(() => this.overlay.remove(), 200);
    }
}
