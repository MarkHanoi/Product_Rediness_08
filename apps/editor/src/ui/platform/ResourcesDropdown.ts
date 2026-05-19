/**
 * ResourcesDropdown — Two-column flyout nav menu for the "Resources" nav link.
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (lp-res- prefix)
 *   §05 §7.6 — No independent <style> injection; uses injectAppTheme()
 *   §06      — Zero BIM engine interaction; purely presentational
 *   §06 §10  — No imports from src/core/, src/commands/, src/elements/, src/ai/
 *
 * Sub-component of LandingPage.
 * Class prefix: lp-res-
 *
 * Usage:
 *   const dropdown = new ResourcesDropdown(wrapperEl, shellEl, onContactSales, onPricing);
 *   // In destroy(): dropdown.destroy();
 */

import { ResourcesPage, ResourcePageKey } from './ResourcesPage';

interface ResourcesDropdownCallbacks {
    onContactSales: () => void;
    onPricing: () => void;
}

interface MenuItem {
    key: ResourcePageKey;
    icon: string;
    title: string;
    desc: string;
}

const GET_STARTED_ITEMS: MenuItem[] = [
    { key: 'quick-start', icon: '🚀', title: 'Quick start guide',    desc: 'Create your first model in under 10 min' },
    { key: 'faq',         icon: '❓', title: 'FAQ',                   desc: 'Plans, pricing, and common questions' },
    { key: 'shortcuts',   icon: '⌨',  title: 'Keyboard shortcuts',   desc: 'Move faster in the workspace' },
];

const LEARN_ITEMS: MenuItem[] = [
    { key: 'ai-reference', icon: '🤖', title: 'AI command reference',  desc: 'Every query and action command' },
    { key: 'ifc-guide',    icon: '🔗', title: 'IFC compatibility',     desc: 'Revit, ArchiCAD, Solibri and more' },
    { key: 'ai-workflow',  icon: '✅', title: 'AI approval workflow',  desc: 'How proposals and approvals work' },
];

export class ResourcesDropdown {
    private dropdown: HTMLElement | null = null;
    private page: ResourcesPage | null = null;
    private isOpen = false;
    private outsideClickHandler: (e: MouseEvent) => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private wrapper: HTMLElement,
        private shell: HTMLElement,
        private callbacks: ResourcesDropdownCallbacks,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;
        this.outsideClickHandler = this.handleOutsideClick.bind(this);
        this.buildTrigger();
    }

    // ── Trigger button ────────────────────────────────────────────────────

    private buildTrigger(): void {
        const btn = document.createElement('button');
        btn.className = 'lp-nav-link lp-res-nav-btn';
        btn.id = 'lp-res-nav-btn';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = 'Resources <svg class="lp-res-chevron" width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M2 3.5L5.5 7L9 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        this.wrapper.appendChild(btn);
    }

    private get triggerBtn(): HTMLButtonElement | null {
        return this.wrapper.querySelector<HTMLButtonElement>('#lp-res-nav-btn');
    }

    // ── Toggle ────────────────────────────────────────────────────────────

    private toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    private open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.triggerBtn?.setAttribute('aria-expanded', 'true');
        this.triggerBtn?.classList.add('lp-res-nav-btn--open');
        this.renderDropdown();
        document.addEventListener('click', this.outsideClickHandler, true);
    }

    private close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.triggerBtn?.setAttribute('aria-expanded', 'false');
        this.triggerBtn?.classList.remove('lp-res-nav-btn--open');
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
        el.className = 'lp-res-dropdown';
        el.setAttribute('role', 'menu');

        const getStartedCol = this.buildColumn('GET STARTED', GET_STARTED_ITEMS);
        const learnCol = this.buildColumn('LEARN', LEARN_ITEMS);

        const cols = document.createElement('div');
        cols.className = 'lp-res-cols';
        cols.appendChild(getStartedCol);

        const colSep = document.createElement('div');
        colSep.className = 'lp-res-col-sep';
        cols.appendChild(colSep);

        cols.appendChild(learnCol);
        el.appendChild(cols);

        const divider = document.createElement('div');
        divider.className = 'lp-res-divider';
        el.appendChild(divider);

        const footer = document.createElement('div');
        footer.className = 'lp-res-footer';

        const contactLink = document.createElement('button');
        contactLink.className = 'lp-res-footer-link';
        contactLink.innerHTML = 'Contact support <span class="lp-res-footer-arrow">→</span>';
        contactLink.addEventListener('click', () => {
            this.close();
            this.callbacks.onContactSales();
        });

        const enterpriseLink = document.createElement('button');
        enterpriseLink.className = 'lp-res-footer-link';
        enterpriseLink.innerHTML = 'Enterprise enquiries <span class="lp-res-footer-arrow">→</span>';
        enterpriseLink.addEventListener('click', () => {
            this.close();
            this.callbacks.onPricing();
        });

        footer.appendChild(contactLink);
        footer.appendChild(enterpriseLink);
        el.appendChild(footer);

        el.addEventListener('click', (e) => e.stopPropagation());

        this.dropdown = el;
        this.wrapper.appendChild(el);
    }

    private buildColumn(label: string, items: MenuItem[]): HTMLElement {
        const col = document.createElement('div');
        col.className = 'lp-res-col';

        const title = document.createElement('p');
        title.className = 'lp-res-col-title';
        title.textContent = label;
        col.appendChild(title);

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'lp-res-item';
            btn.setAttribute('role', 'menuitem');
            btn.innerHTML = `
                <span class="lp-res-item-text">
                    <span class="lp-res-item-title">${item.title}</span>
                    <span class="lp-res-item-desc">${item.desc}</span>
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

    private openPage(key: ResourcePageKey): void {
        this.page?.destroy();
        this.page = new ResourcesPage(key, this.shell, () => {
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
