/**
 * ExistingProjectsPanel — Compact in-workspace project switcher
 *
 * Shows the user's project list directly inside the left-hand ProjectBrowserPanel
 * (above the VIEWS section). Each entry lets the user switch to a different
 * project without leaving the viewport to visit the full Project Hub.
 *
 * Phase B adoption #1 (S73-WIRE row B.1 — first `@pryzm/ui-base/Panel`
 * subclass in `src/ui/`).  Spec:
 *   `docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-CODE-VERIFIED-AUDIT-2026-04-29.md`
 *   §9 step (1) — wedge that simultaneously unblocks Phase C.11 (drops
 *   one of the three external importers of `ProjectRepository.ts`) and
 *   ratchets B's Panel-adoption counter from 0 to 1.
 *
 * Reads the project list from `runtime.persistence.projectListStore`
 * (a `ProjectListStore` from `@pryzm/stores`) — the canonical post-C
 * source per the JSDoc on `PersistenceSlot.projectListStore`.  Subscribes
 * to that store via `subscribeDirty(...)` so the panel re-renders when
 * the hub or any other surface mutates the list.
 *
 * Open-project flow:
 *   • Old: set `window._pendingProjectSwitch = {id, name}` via a
 *     window-as-any cast and dispatch a `'pryzm-open-project'`
 *     CustomEvent that PlatformRouter listens for.  Two casts on the
 *     gesture path.
 *   • New: `void this.runtime.persistence.openProject(id, { name })` —
 *     direct call into the canonical no-reload openProject API, no
 *     window cast and no global event indirection.
 *
 * Contract compliance:
 *   §05 §5   — CSS class prefix: ep-; styles injected via AppTheme.ts injectStyle()
 *   §05 §7.8 — No @thatopen/ui / bim-* elements; pure HTMLElement tree
 *   §06 §3   — No BIM engine imports; reads only via runtime.persistence.*
 *   §06 §7   — Project reads via runtime.persistence.projectListStore (single source of truth)
 */

import { Panel, type PanelOptions } from '@pryzm/ui-base';
import type { ProjectListStore, ProjectSummary } from '@pryzm/stores';

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatRelative(iso: string): string {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '—';
    const diff = Date.now() - ts;
    if (diff < 60_000)        return 'Just now';
    if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PROJECT_COLORS = [
    '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
];

function colorFor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return PROJECT_COLORS[hash % PROJECT_COLORS.length];
}

// ── ExistingProjectsPanel — Phase B Panel adoption #1 ─────────────────────────

export interface ExistingProjectsPanelOptions extends PanelOptions {
    /** ID of the project currently open in the workspace.  Used to
     *  highlight the active entry and suppress the Open button on it. */
    readonly currentProjectId: string | null;
}

export class ExistingProjectsPanel extends Panel<ExistingProjectsPanelOptions> {
    static readonly panelId = 'panel:existing-projects';

    /** Cached cast of `runtime.persistence.projectListStore` (typed
     *  loosely as `unknown` on the runtime contract).  Resolved once
     *  in `onMount()` so `onRender()` is cheap. */
    private store: ProjectListStore | null = null;

    // -------------------------------------------------------------------
    //                           Lifecycle hooks
    // -------------------------------------------------------------------

    protected createRoot(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'ep-wrap';
        el.setAttribute('data-panel', ExistingProjectsPanel.panelId);
        return el;
    }

    protected onMount(): void {
        this.store = this.runtime.persistence.projectListStore as ProjectListStore;

        // First paint.
        this.render();

        // Re-render when the project list mutates (hub creates a project,
        // server sync replaces all on refresh, rename, archive, etc.).
        this.track({
            dispose: this.store.subscribeDirty(() => this.render()),
        });
    }

    protected onRender(root: HTMLElement): void {
        // Replace contents wholesale; the DOM tree here is small (≤ tens
        // of project rows) so a full rebuild is cheaper than diffing.
        root.replaceChildren();

        const projects = this.listProjects();

        if (projects.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'ep-empty';
            empty.textContent = 'No projects yet. Open the hub to create one.';
            root.appendChild(empty);
        } else {
            for (const p of projects) {
                root.appendChild(this.buildItem(p));
            }
        }

        // "Go to Hub" button at the bottom — same gesture as the legacy
        // panel, retained for parity with `ProjectsRailPanel.build()`.
        const hubBtn = document.createElement('button');
        hubBtn.className = 'ep-hub-btn';
        hubBtn.type = 'button';
        hubBtn.title = 'Open Project Hub to manage all projects';
        hubBtn.innerHTML = `
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Project Hub
        `;
        hubBtn.addEventListener('click', () => {
            window.runtime?.events?.emit('pryzm-go-hub', {}); window.dispatchEvent(new Event('pryzm-go-hub')); // F.events.12 + §33-NAV-FIX
        });
        root.appendChild(hubBtn);
    }

    // -------------------------------------------------------------------
    //                           Internals
    // -------------------------------------------------------------------

    /** Active, non-archived projects ordered by `lastModifiedAt` desc. */
    private listProjects(): ReadonlyArray<ProjectSummary> {
        if (this.store === null) return [];
        return this.store.list().filter(p => !p.isArchived);
    }

    private buildItem(p: ProjectSummary): HTMLElement {
        const isActive = p.id === this.opts.currentProjectId;
        const color    = colorFor(p.id);
        const initial  = (p.name[0] || 'P').toUpperCase();

        const item = document.createElement('div');
        item.className = `ep-item${isActive ? ' ep-item--active' : ''}`;
        item.title = p.name;

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = 'ep-avatar';
        avatar.style.background = color;
        avatar.textContent = initial;
        item.appendChild(avatar);

        // Info
        const info = document.createElement('div');
        info.className = 'ep-info';
        info.innerHTML = `
            <div class="ep-name">${esc(p.name)}</div>
            <div class="ep-meta">${formatRelative(p.lastModifiedAt)}</div>
        `;
        item.appendChild(info);

        // Open button (hidden for already-active project)
        if (!isActive) {
            const btn = document.createElement('button');
            btn.className = 'ep-open-btn';
            btn.type = 'button';
            btn.textContent = 'Open';
            btn.title = `Switch to "${esc(p.name)}"`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openProject(p);
            });
            item.appendChild(btn);
        } else {
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size:0.55rem;color:#6366f1;font-weight:700;flex-shrink:0;';
            badge.textContent = '● open';
            item.appendChild(badge);
        }

        // Clicking the row also navigates (same as Open button)
        item.addEventListener('click', () => {
            if (!isActive) this.openProject(p);
        });

        return item;
    }

    /** Canonical no-reload open-project gesture.  Replaces the legacy
     *  `window._pendingProjectSwitch` window-as-any cast + the
     *  `'pryzm-open-project'` CustomEvent dance. */
    private openProject(p: ProjectSummary): void {
        void this.runtime.persistence.openProject(p.id, { name: p.name }).catch(err => {
            console.warn('[ExistingProjectsPanel] openProject failed:', err);
        });
    }
}
