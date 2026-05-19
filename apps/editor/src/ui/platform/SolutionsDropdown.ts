/**
 * SolutionsDropdown — Dark two-column flyout nav menu for the "Solutions" nav link.
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (lp-sol- prefix)
 *   §05 §7.6 — No independent <style> injection; uses injectAppTheme()
 *   §06      — Zero BIM engine interaction; purely presentational
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * Sub-component of LandingPage.
 * Class prefix: lp-sol-
 *
 * Visual pattern: Dark violet flyout (Lovable-style), two columns
 * (BY ROLE / BY WORKFLOW), bold item labels, no heavy category headers.
 */

import { SolutionsPage, SolutionPageKey } from './SolutionsPage';

interface SolutionsDropdownCallbacks {
    onGetStarted: () => void;
}

interface SolutionMenuItem {
    key: SolutionPageKey;
    icon: string;
    title: string;
    desc: string;
}

const BY_ROLE_ITEMS: SolutionMenuItem[] = [
    { key: 'solo-architects',       icon: '🏛',  title: 'Solo Architects',       desc: 'Fast, full-featured BIM for independent practice' },
    { key: 'arch-studios',          icon: '🏢',  title: 'Architecture Studios',   desc: 'Real-time collaboration for teams up to 8' },
    { key: 'established-practices', icon: '🏗',  title: 'Established Practices',  desc: 'SSO, API access, and up to 25 seats' },
    { key: 'bim-managers',          icon: '📋',  title: 'BIM Managers',           desc: 'Rule Engine, IFC compliance, and model auditing' },
    { key: 'interior-designers',    icon: '🛋',  title: 'Interior Designers',     desc: 'Wardrobe Factory and AI Element Creator' },
    { key: 'structural-engineers',  icon: '⚙',  title: 'Structural Engineers',   desc: 'IFC coordination with Tekla and Navisworks' },
    { key: 'students',              icon: '🎓',  title: 'Students & Graduates',   desc: 'Free plan, full Architect tier with .edu email' },
];

const BY_WORKFLOW_ITEMS: SolutionMenuItem[] = [
    { key: 'concept-design',   icon: '✏',  title: 'Concept Design',            desc: 'From brief to 3D model in a single session' },
    { key: 'ifc-export',       icon: '🔗', title: 'IFC Export & Coordination', desc: 'Clean exports to Revit, ArchiCAD, Solibri, Tekla' },
    { key: 'ai-modelling',     icon: '🤖', title: 'AI-Assisted Modelling',     desc: 'Natural language queries and batch proposals' },
    { key: 'floor-plan',       icon: '📐', title: 'Floor Plan Digitisation',   desc: 'PDF or scan to live BIM model via AI' },
    { key: 'design-handoff',   icon: '📦', title: 'Design Handoff',            desc: 'IFC, GLB, and PDF — all from the same model' },
    { key: 'code-compliance',  icon: '✅', title: 'Code Compliance Review',    desc: 'Continuous Rule Engine — catch issues as you model' },
    { key: 'bespoke',          icon: '🏷',  title: 'Bespoke Deployment',        desc: 'PRYZM under your brand, on your infrastructure' },
];

export class SolutionsDropdown {
    private dropdown: HTMLElement | null = null;
    private page: SolutionsPage | null = null;
    private isOpen = false;
    private outsideClickHandler: (e: MouseEvent) => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private wrapper: HTMLElement,
        private shell: HTMLElement,
        private callbacks: SolutionsDropdownCallbacks,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this.outsideClickHandler = this.handleOutsideClick.bind(this);
        this.buildTrigger();
    }

    // ── Trigger ───────────────────────────────────────────────────────────

    private buildTrigger(): void {
        const btn = document.createElement('button');
        btn.className = 'lp-nav-link lp-sol-nav-btn';
        btn.id = 'lp-sol-nav-btn';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = 'Solutions <svg class="lp-sol-chevron" width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M2 3.5L5.5 7L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        this.wrapper.appendChild(btn);
    }

    private get triggerBtn(): HTMLButtonElement | null {
        return this.wrapper.querySelector<HTMLButtonElement>('#lp-sol-nav-btn');
    }

    // ── Toggle ────────────────────────────────────────────────────────────

    private toggle(): void {
        this.isOpen ? this.close() : this.open();
    }

    private open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.triggerBtn?.setAttribute('aria-expanded', 'true');
        this.triggerBtn?.classList.add('lp-sol-nav-btn--open');
        this.renderDropdown();
        document.addEventListener('click', this.outsideClickHandler, true);
    }

    private close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.triggerBtn?.setAttribute('aria-expanded', 'false');
        this.triggerBtn?.classList.remove('lp-sol-nav-btn--open');
        this.dropdown?.remove();
        this.dropdown = null;
        document.removeEventListener('click', this.outsideClickHandler, true);
    }

    private handleOutsideClick(e: MouseEvent): void {
        if (!this.wrapper.contains(e.target as Node)) {
            this.close();
        }
    }

    // ── Dropdown render ───────────────────────────────────────────────────

    private renderDropdown(): void {
        const el = document.createElement('div');
        el.className = 'lp-sol-dropdown';
        el.setAttribute('role', 'menu');

        // ── Column headers row ─────────────────────────────────────────
        const headersRow = document.createElement('div');
        headersRow.className = 'lp-sol-col-headers';

        const roleHeader = document.createElement('span');
        roleHeader.className = 'lp-sol-col-header';
        roleHeader.textContent = 'BY ROLE';
        headersRow.appendChild(roleHeader);

        const wfHeader = document.createElement('span');
        wfHeader.className = 'lp-sol-col-header';
        wfHeader.textContent = 'BY WORKFLOW';
        headersRow.appendChild(wfHeader);

        el.appendChild(headersRow);

        // ── Two columns ────────────────────────────────────────────────
        const cols = document.createElement('div');
        cols.className = 'lp-sol-cols';

        cols.appendChild(this.buildColumn(BY_ROLE_ITEMS));

        const sep = document.createElement('div');
        sep.className = 'lp-sol-col-sep';
        cols.appendChild(sep);

        cols.appendChild(this.buildColumn(BY_WORKFLOW_ITEMS));
        el.appendChild(cols);

        // ── Footer CTA ─────────────────────────────────────────────────
        const footer = document.createElement('div');
        footer.className = 'lp-sol-footer';

        const cta = document.createElement('button');
        cta.className = 'lp-sol-footer-cta';
        cta.textContent = 'Get started for free →';
        cta.addEventListener('click', () => {
            this.close();
            this.callbacks.onGetStarted();
        });
        footer.appendChild(cta);

        const enterprise = document.createElement('span');
        enterprise.className = 'lp-sol-footer-note';
        enterprise.textContent = 'Enterprise & bespoke available — talk to us';
        footer.appendChild(enterprise);

        el.appendChild(footer);

        el.addEventListener('click', (e) => e.stopPropagation());

        this.dropdown = el;
        this.wrapper.appendChild(el);
    }

    private buildColumn(items: SolutionMenuItem[]): HTMLElement {
        const col = document.createElement('div');
        col.className = 'lp-sol-col';

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'lp-sol-item';
            btn.setAttribute('role', 'menuitem');
            btn.innerHTML = `
                <span class="lp-sol-item-text">
                    <span class="lp-sol-item-title">${item.title}</span>
                    <span class="lp-sol-item-desc">${item.desc}</span>
                </span>
            `;
            btn.addEventListener('click', () => {
                this.close();
                this.openPage(item.key);
            });
            col.appendChild(btn);
        });

        return col;
    }

    // ── Content page ──────────────────────────────────────────────────────

    private openPage(key: SolutionPageKey): void {
        this.page?.destroy();
        this.page = new SolutionsPage(key, this.shell, () => {
            this.page = null;
        });
    }

    // ── Cleanup ───────────────────────────────────────────────────────────

    destroy(): void {
        this.close();
        this.page?.destroy();
        this.page = null;
        this.wrapper.innerHTML = '';
    }
}
