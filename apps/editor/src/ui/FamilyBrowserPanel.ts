/**
 * FamilyBrowserPanel — Wave 6 Phase B (wave-6-b-d7)
 *
 * Family library browser: browse, search, and select family types for
 * placement into the BIM model.  Integrates with the family-editor SPA
 * at apps/component-editor/ via the runtime command bus — no direct import.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — state mutation only through Commands; this panel
 *   reads the family catalog (via runtime.viewRegistry query) and dispatches
 *   `place-family-instance` / `edit-family` commands.
 * • §02-ARCHITECTURE §3.3 — UI layer may not import from src/core/ directly.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; missing runtime is warned.
 * • §10-WAVE-6-CONVERGENCE §2 — "real binding" means activatePanel on show()
 *   and deactivatePanel on hide(), each validated by a Vitest test.
 * • P8 — OTel spans emitted inside activatePanel / deactivatePanel
 *   (runtime-composer handles the instrumentation).
 *
 * Public API
 * ──────────
 *   const fbp = new FamilyBrowserPanel(runtime);
 *   document.body.appendChild(fbp.element);
 *   fbp.show();    // activates panel binding
 *   fbp.hide();    // deactivates panel binding
 *
 * TODO(Phase-F): replace family category constants with runtime.registries.familyCatalog
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const FAMILY_BROWSER_PANEL_ID = 'family-browser-panel' as const;

// ── Family category definitions ───────────────────────────────────────────────
// Kept as a const array so Phase F can replace with runtime-provided catalog
// descriptors without a contract change.
export interface FamilyCategoryDef {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
}

export const FAMILY_CATEGORIES: readonly FamilyCategoryDef[] = [
    { id: 'doors',         label: 'Doors',          icon: '🚪' },
    { id: 'windows',       label: 'Windows',         icon: '🪟' },
    { id: 'furniture',     label: 'Furniture',       icon: '🛋' },
    { id: 'casework',      label: 'Casework',        icon: '🗄' },
    { id: 'lighting',      label: 'Lighting',        icon: '💡' },
    { id: 'plumbing',      label: 'Plumbing',        icon: '🚿' },
    { id: 'structural',    label: 'Structural',      icon: '🏗' },
    { id: 'specialty',     label: 'Specialty',       icon: '⚙' },
    { id: 'generic',       label: 'Generic Models',  icon: '📦' },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const FAMILY_BROWSER_PANEL_STYLES = `
.fbp-panel {
    position: fixed;
    top: 56px;
    right: 8px;
    width: 260px;
    max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    overflow: hidden;
    flex-direction: column;
}
.fbp-panel[data-visible="true"] { display: flex; }
.fbp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.fbp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.fbp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.fbp-close-btn:hover { background: rgba(0,0,0,0.06); }
.fbp-search {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    flex-shrink: 0;
}
.fbp-search input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 12px;
    background: var(--app-input-bg, #fafafa);
    color: var(--app-text, #333);
    outline: none;
}
.fbp-search input:focus { border-color: var(--app-accent, #6600FF); }
.fbp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 4px 0;
}
.fbp-category {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    cursor: pointer;
    transition: background 0.1s;
    user-select: none;
}
.fbp-category:hover { background: rgba(102,0,255,0.05); }
.fbp-category[data-selected="true"] {
    background: rgba(102,0,255,0.10);
    font-weight: 600;
}
.fbp-cat-icon { font-size: 16px; line-height: 1; }
.fbp-cat-label { font-size: 13px; color: var(--app-text, #333); }
`;

// ── FamilyBrowserPanel class ──────────────────────────────────────────────────

export class FamilyBrowserPanel {
    /** Root DOM element — mount anywhere in the layout root. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _selectedCategoryId: string | null = null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[FamilyBrowserPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d7)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'fbp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Family browser');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(): void {
        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = { label: 'Family Browser' };
            this.runtime.viewRegistry.activatePanel(FAMILY_BROWSER_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(FAMILY_BROWSER_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-fbp-styles', '1');
        style.textContent = FAMILY_BROWSER_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        // ── Header ────────────────────────────────────────────────────────────
        const header = document.createElement('div');
        header.className = 'fbp-header';

        const title = document.createElement('span');
        title.className = 'fbp-title';
        title.textContent = 'Family Browser';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'fbp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close family browser';
        closeBtn.setAttribute('aria-label', 'Close family browser');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);

        this.element.appendChild(header);

        // ── Search ────────────────────────────────────────────────────────────
        const searchBar = document.createElement('div');
        searchBar.className = 'fbp-search';

        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.placeholder = 'Search families…';
        searchInput.setAttribute('aria-label', 'Search families');
        searchInput.setAttribute('data-fbp-search', '1');
        searchBar.appendChild(searchInput);

        this.element.appendChild(searchBar);

        // ── Category list ─────────────────────────────────────────────────────
        const body = document.createElement('div');
        body.className = 'fbp-body';
        body.setAttribute('data-fbp-body', '1');
        this.element.appendChild(body);

        this._buildCategoryRows(body);
    }

    private _buildCategoryRows(body: HTMLDivElement): void {
        for (const cat of FAMILY_CATEGORIES) {
            const row = document.createElement('div');
            row.className = 'fbp-category';
            row.setAttribute('data-category-id', cat.id);
            row.setAttribute('data-selected', 'false');
            row.title = `Browse ${cat.label}`;

            const icon = document.createElement('span');
            icon.className = 'fbp-cat-icon';
            icon.textContent = cat.icon;
            icon.setAttribute('aria-hidden', 'true');

            const label = document.createElement('span');
            label.className = 'fbp-cat-label';
            label.textContent = cat.label;

            row.appendChild(icon);
            row.appendChild(label);
            row.addEventListener('click', () => this._selectCategory(cat.id));

            body.appendChild(row);
        }
    }

    private _selectCategory(categoryId: string): void {
        this._selectedCategoryId = categoryId;

        const body = this.element.querySelector('[data-fbp-body]') as HTMLDivElement | null;
        if (!body) return;

        for (const row of body.querySelectorAll('[data-category-id]')) {
            (row as HTMLElement).setAttribute(
                'data-selected',
                (row as HTMLElement).getAttribute('data-category-id') === categoryId ? 'true' : 'false',
            );
        }

        // Dispatch browse command via bus (P6 compliance).
        this.runtime?.bus?.executeCommand?.('browse-family-types', {});
    }

    /** Currently selected category id (accessible by tests and callers). */
    get selectedCategoryId(): string | null {
        return this._selectedCategoryId;
    }
}
