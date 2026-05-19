/**
 * WelcomeModal — First-time onboarding overlay
 *
 * Contract compliance:
 *   §06 §3   — Registered platform component (wm- prefix)
 *   §05 §7.6 — All CSS in AppTheme.ts WELCOME_MODAL_STYLES (wm- prefix)
 *   §01      — Zero BIM engine interaction
 *
 * Class prefix: wm-  (Welcome Modal)
 *
 * Shown once after a user's first authentication.
 * Uses localStorage key 'bim-platform-onboarded' to track state.
 * After submission or skip, calls onDone() and marks the user as onboarded.
 */

import { injectAppTheme } from '../styles/AppTheme';

const ONBOARDED_KEY = 'bim-platform-onboarded';

export function isOnboarded(): boolean {
    return localStorage.getItem(ONBOARDED_KEY) === 'true';
}

export function markOnboarded(): void {
    localStorage.setItem(ONBOARDED_KEY, 'true');
}

export interface WelcomeModalCallbacks {
    onDone: () => void;
}

const ROLES = [
    'Architect',
    'Structural Engineer',
    'MEP Engineer',
    'Project Manager',
    'BIM Coordinator',
    'Developer',
    'Student',
    'Researcher',
    'Other',
];

export class WelcomeModal {
    private overlay: HTMLElement;
    private selected: Set<string> = new Set();

    /**
     * @param callbacks  Onboarding done handler.
     * @param rootEl     Optional mount target. Should be #platform-root so the overlay
     *                   stays inside the platform DOM boundary (§06 §3). Falls back to
     *                   document.body when omitted, which is safe because .wm-overlay
     *                   is position:fixed and covers the full viewport regardless.
     */
    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(private callbacks: WelcomeModalCallbacks, rootEl?: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        injectAppTheme();
        this.overlay = this.build();
        (rootEl ?? document.body).appendChild(this.overlay);
    }

    private build(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'wm-overlay';
        overlay.innerHTML = this.renderContent();
        this.attachListeners(overlay);
        return overlay;
    }

    private renderContent(): string {
        const chips = ROLES.map(role => `
            <button class="wm-chip" data-role="${role}">${role}</button>
        `).join('');

        return `
            <div class="wm-modal">
                <!-- ── Left panel ─────────────────────────────── -->
                <div class="wm-left">
                    <!-- Logo -->
                    <div class="wm-logo">
                        <img src="/pryzm-logo.png" class="wm-logo-icon" alt="" aria-hidden="true" />
                        <img src="/pryzm-logo-text.png" class="wm-logo-text" alt="PRYZM" />
                    </div>

                    <!-- Headline -->
                    <h2 class="wm-headline">Unlock a PRYZM<br>better experience</h2>
                    <p class="wm-sub">Tell us your role so we can tailor features, tips, and resources specifically for you.</p>

                    <!-- Role chips -->
                    <div class="wm-chips" id="wm-chips">
                        ${chips}
                    </div>

                    <!-- Submit -->
                    <button class="wm-submit" id="wm-submit">Get started</button>

                    <!-- Skip -->
                    <button class="wm-skip" id="wm-skip">Skip for now</button>
                </div>

                <!-- ── Right panel ─────────────────────────────── -->
                <div class="wm-right">
                    <!-- Close button -->
                    <button class="wm-close" id="wm-close" aria-label="Close">×</button>

                    <!-- Decorative BIM workspace mockup -->
                    <div class="wm-decor">
                        <div class="wm-decor-card wm-decor-card--top">
                            <div class="wm-decor-dot"></div>
                            <div class="wm-decor-lines">
                                <div class="wm-decor-line wm-decor-line--wide"></div>
                                <div class="wm-decor-line wm-decor-line--mid"></div>
                            </div>
                        </div>
                        <div class="wm-decor-viewport">
                            <div class="wm-decor-cube wm-decor-cube--a"></div>
                            <div class="wm-decor-cube wm-decor-cube--b"></div>
                            <div class="wm-decor-cube wm-decor-cube--c"></div>
                            <div class="wm-decor-label">PRYZM BIM Workspace</div>
                        </div>
                        <div class="wm-decor-card wm-decor-card--bottom">
                            <div class="wm-decor-lines">
                                <div class="wm-decor-line wm-decor-line--short"></div>
                                <div class="wm-decor-line wm-decor-line--mid"></div>
                                <div class="wm-decor-line wm-decor-line--wide"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private attachListeners(overlay: HTMLElement): void {
        overlay.querySelector('#wm-close')?.addEventListener('click', () => this.finish());
        overlay.querySelector('#wm-skip')?.addEventListener('click', () => this.finish());
        overlay.querySelector('#wm-submit')?.addEventListener('click', () => this.finish());

        overlay.querySelector('#wm-chips')?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!target.classList.contains('wm-chip')) return;
            const role = target.dataset.role!;
            if (this.selected.has(role)) {
                this.selected.delete(role);
                target.classList.remove('wm-chip--active');
            } else {
                this.selected.add(role);
                target.classList.add('wm-chip--active');
            }
        });
    }

    private finish(): void {
        markOnboarded();
        this.callbacks.onDone();
    }

    destroy(): void {
        this.overlay.remove();
    }
}
