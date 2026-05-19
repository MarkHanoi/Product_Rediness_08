/**
 * ComponentRelationshipPanel — Wave 6 Phase B (wave-6-b-d8)
 *
 * Component relationship graph: shows how a selected component relates to
 * other elements in the model — hosted elements, joined walls, embedded
 * openings, analytical model links, structural connections, etc.
 *
 * Architecture anchors
 * ────────────────────
 * • §01-VISION §3 P6  — No direct store writes; navigation dispatches typed
 *   commands via `runtime.bus.executeCommand`.
 * • §02-ARCHITECTURE §3.3 — UI layer imports only from @pryzm/* packages.
 * • §02-ARCHITECTURE §3.5 — No silent fallbacks; warns when runtime is null.
 * • §10-WAVE-6-CONVERGENCE §2 — activatePanel on show(), deactivatePanel on
 *   hide(); validated by Vitest binding test.
 *
 * Public API
 * ──────────
 *   const crp = new ComponentRelationshipPanel(runtime);
 *   document.body.appendChild(crp.element);
 *   crp.show('wall-guid-12');
 *   crp.hide();
 */

import type { PryzmRuntime }   from '@pryzm/runtime-composer/types';
import type { PanelViewSpec }  from '@pryzm/runtime-composer/types';

// ── Panel ID ──────────────────────────────────────────────────────────────────
export const COMPONENT_RELATIONSHIP_PANEL_ID = 'component-relationship-panel' as const;

// ── Relationship category defs ────────────────────────────────────────────────
export interface RelationshipCategoryDef {
    readonly categoryId: string;
    readonly label:      string;
    readonly icon:       string;
    readonly direction:  'host-to-child' | 'child-to-host' | 'peer' | 'analytical';
}

export const RELATIONSHIP_CATEGORIES: readonly RelationshipCategoryDef[] = [
    { categoryId: 'hosted',      label: 'Hosted Elements',   icon: '📦', direction: 'host-to-child' },
    { categoryId: 'host',        label: 'Host Element',       icon: '🔲', direction: 'child-to-host' },
    { categoryId: 'joins',       label: 'Joined Elements',    icon: '🔗', direction: 'peer'          },
    { categoryId: 'openings',    label: 'Embedded Openings',  icon: '⬜', direction: 'host-to-child' },
    { categoryId: 'levels',      label: 'Level Constraints',  icon: '📏', direction: 'analytical'    },
    { categoryId: 'structural',  label: 'Structural Links',   icon: '🔩', direction: 'analytical'    },
    { categoryId: 'references',  label: 'Reference Planes',   icon: '✛',  direction: 'analytical'    },
];

// ── Inline styles ─────────────────────────────────────────────────────────────
const COMPONENT_RELATIONSHIP_PANEL_STYLES = `
.crp-panel {
    position: fixed;
    top: 56px;
    right: 820px;
    width: 252px;
    max-height: calc(100vh - 80px);
    background: var(--app-panel-bg, #ffffff);
    color: var(--app-text, #333);
    border: 1px solid rgba(0,0,0,0.12);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 13px;
    z-index: 950;
    display: none;
    flex-direction: column;
    overflow: hidden;
}
.crp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.08);
    background: var(--app-panel-header-bg, #f7f7f7);
    flex-shrink: 0;
}
.crp-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--app-text-secondary, #666);
}
.crp-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--app-text-secondary, #888);
    font-size: 14px;
    padding: 2px 4px;
    border-radius: 3px;
    line-height: 1;
}
.crp-close-btn:hover { background: rgba(0,0,0,0.06); }
.crp-body {
    overflow-y: auto;
    flex: 1 1 auto;
    padding: 4px 0;
}
.crp-cat-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(0,0,0,0.04);
    cursor: pointer;
}
.crp-cat-row:hover { background: rgba(0,0,0,0.03); }
.crp-cat-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.crp-cat-info { flex: 1 1 auto; min-width: 0; }
.crp-cat-label { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.crp-cat-dir {
    font-size: 10px;
    color: var(--app-text-tertiary, #aaa);
    margin-top: 1px;
}
.crp-dir-badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}
.crp-dir-host-to-child { background: #d1fae5; color: #065f46; }
.crp-dir-child-to-host { background: #dbeafe; color: #1e40af; }
.crp-dir-peer           { background: #fef3c7; color: #92400e; }
.crp-dir-analytical     { background: #ede9fe; color: #4c1d95; }
`;

// ── ComponentRelationshipPanel class ──────────────────────────────────────────

export class ComponentRelationshipPanel {
    /** Root DOM element. */
    public readonly element: HTMLDivElement;

    /** Wave 6 Phase B — runtime threaded by parent. */
    public readonly runtime: PryzmRuntime | null;

    private _elementId: string | null = null;
    private _styleInjected = false;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;

        if (!runtime) {
            console.warn(
                '[ComponentRelationshipPanel] runtime is null — panel binding disabled. ' +
                'Wire a PryzmRuntime instance in the composition root. (wave-6-b-d8)',
            );
        }

        this.element = document.createElement('div');
        this.element.className = 'crp-panel';
        this.element.setAttribute('role', 'complementary');
        this.element.setAttribute('aria-label', 'Component relationships');
        this._injectStyles();
        this._buildDOM();
    }

    // ── Public show/hide — Phase B real binding ───────────────────────────────

    show(elementId?: string): void {
        if (elementId !== undefined) this._elementId = elementId;

        this.element.style.display = 'block';
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label:     'Component Relationships',
                elementId: this._elementId ?? undefined,
            };
            this.runtime.viewRegistry.activatePanel(COMPONENT_RELATIONSHIP_PANEL_ID, spec);
        }
    }

    hide(): void {
        this.element.style.display = 'none';
        this.runtime?.viewRegistry.deactivatePanel(COMPONENT_RELATIONSHIP_PANEL_ID);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _injectStyles(): void {
        if (this._styleInjected) return;
        if (typeof document === 'undefined') return;
        const style = document.createElement('style');
        style.setAttribute('data-crp-styles', '1');
        style.textContent = COMPONENT_RELATIONSHIP_PANEL_STYLES;
        document.head.appendChild(style);
        this._styleInjected = true;
    }

    private _buildDOM(): void {
        const header = document.createElement('div');
        header.className = 'crp-header';

        const title = document.createElement('span');
        title.className = 'crp-title';
        title.textContent = 'Relationships';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'crp-close-btn';
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close relationship panel';
        closeBtn.setAttribute('aria-label', 'Close component relationship panel');
        closeBtn.addEventListener('click', () => this.hide());
        header.appendChild(closeBtn);
        this.element.appendChild(header);

        const body = document.createElement('div');
        body.className = 'crp-body';
        body.setAttribute('data-crp-body', '1');
        this.element.appendChild(body);

        for (const cat of RELATIONSHIP_CATEGORIES) {
            const row = document.createElement('div');
            row.className = 'crp-cat-row';
            row.setAttribute('data-category-id', cat.categoryId);

            const icon = document.createElement('span');
            icon.className = 'crp-cat-icon';
            icon.textContent = cat.icon;
            icon.setAttribute('aria-hidden', 'true');

            const info = document.createElement('div');
            info.className = 'crp-cat-info';

            const label = document.createElement('div');
            label.className = 'crp-cat-label';
            label.textContent = cat.label;

            const dirRow = document.createElement('div');
            dirRow.className = 'crp-cat-dir';

            const badge = document.createElement('span');
            badge.className = `crp-dir-badge crp-dir-${cat.direction}`;
            badge.textContent = cat.direction.replace(/-/g, ' ');

            dirRow.appendChild(badge);
            info.appendChild(label);
            info.appendChild(dirRow);
            row.appendChild(icon);
            row.appendChild(info);
            body.appendChild(row);
        }
    }
}
