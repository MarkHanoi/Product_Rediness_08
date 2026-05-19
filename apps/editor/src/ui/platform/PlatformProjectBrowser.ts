/**
 * PlatformProjectBrowser — toolbar, hub dropdown, and workspace modals.
 *
 * Extracted from PlatformShell.ts (Wave 14 FILE 2 god-file split, 2026-05-02).
 * Owns:
 *   - buildToolbar() — the plat-toolbar DOM node + project-name input + status dot
 *   - buildHubMenu() — PRYZM logo button + dropdown with all action items
 *   - openHubDropdown() / closeHubDropdown()
 *   - handleHubMenuAction() — dispatcher for all hub menu actions
 *   - openWorkspaceMembersModal() / openWorkspaceCDEStateModal()
 *   - openPortfolioPanel() / openWebhooksPanel()
 *
 * Wires keyboard shortcuts (Ctrl+S → openSaveModal) and the workspace
 * mode-switcher buttons (Author / Inspect / Data).
 *
 * Populates ctx.statusDot, ctx.statusText, ctx.projectNameInput after
 * buildToolbar() — these must be called before setProjectContext().
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports; save triggered via saveCtrl.openSaveModal().
 *   §06 §5  — All styles in AppTheme.ts (PLATFORM_SHELL_STYLES); no inline injection.
 */

import { apiFetch } from '@pryzm/core-app-model';
import { workspaceController, WorkspaceMode } from '../WorkspaceController';
import { UiPreferences } from '../UiPreferences';
import type { ShellCtx } from './PlatformShellTypes';
import type { PlatformSaveController } from './PlatformSaveController';
import type { PlatformVersionController } from './PlatformVersionController';

export class PlatformProjectBrowser {
    /** The outer toolbar element (hidden in left-panel, kept for Ctrl+S). */
    toolbar!: HTMLElement;
    /** Inner row that contains the project name, status dot, and mode buttons. */
    toolbarInner!: HTMLElement;
    /** Saved so dispose() can remove it. */
    keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    private hubMenuEl: HTMLElement | null = null;
    private hubDropdownEl: HTMLElement | null = null;
    private hubMenuDocClick: ((e: MouseEvent) => void) | null = null;

    constructor(
        private readonly ctx: ShellCtx,
        private readonly saveCtrl: PlatformSaveController,
        private readonly versionCtrl: PlatformVersionController,
    ) {}

    // ── Toolbar ───────────────────────────────────────────────────────────────

    buildToolbar(): void {
        this.toolbar = document.createElement('div');
        // V2 Phase 1: start expanded (not collapsed) — toolbar is always visible
        this.toolbar.className = 'plat-toolbar';

        // ── Inner content row ─────────────────────────────────────────────────
        this.toolbarInner = document.createElement('div');
        this.toolbarInner.className = 'plat-toolbar-inner';
        this.toolbarInner.innerHTML = `
            <input class="plat-project-name" id="plat-project-name" value="${this.ctx.projectName}" title="Click to rename">
            <div class="plat-divider"></div>
            <div class="plat-status">
                <div class="plat-status-dot" id="plat-status-dot"></div>
                <span id="plat-status-text">Saved</span>
            </div>
            <div class="plat-divider"></div>
            <div class="plat-mode-switcher" id="plat-mode-switcher">
                <button class="plat-mode-btn" data-mode="author" data-active="true"
                    title="Author — full 3D canvas (F1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    <span>Author</span>
                </button>
                <button class="plat-mode-btn" data-mode="inspect" data-active="false"
                    title="Inspect — 3D + data side-by-side (F2)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="12" y1="3" x2="12" y2="21"/>
                    </svg>
                    <span>Inspect</span>
                </button>
                <button class="plat-mode-btn" data-mode="data" data-active="false"
                    title="Data — full data workbench (F3)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <ellipse cx="12" cy="5" rx="9" ry="3"/>
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                    </svg>
                    <span>Data</span>
                </button>
            </div>
        `;

        // Phase 5.4 — Toggle strip removed to bring total toolbar height to ≤40px.
        // The inner row is 36px; removing the 18px strip makes total ≤40px.
        this.toolbar.appendChild(this.toolbarInner);

        // The plat-left-panel wrapper has been removed from Layout.ts (left panel now
        // uses its own vb-panel at 52px, matching the right tp-panel dimensions).
        // The toolbar is kept in the DOM (hidden) so Ctrl+S save and project-name
        // change handlers remain functional, but it is not visually rendered.
        const leftPanel = document.querySelector('.plat-left-panel');
        if (leftPanel) {
            leftPanel.insertBefore(this.toolbar, leftPanel.firstChild);
        } else {
            this.toolbar.style.display = 'none';
            document.body.appendChild(this.toolbar);
        }

        // ── Wire DOM refs into ctx ─────────────────────────────────────────────
        this.ctx.projectNameInput = this.toolbarInner.querySelector('#plat-project-name')!;
        this.ctx.statusDot = this.toolbarInner.querySelector('#plat-status-dot')!;
        this.ctx.statusText = this.toolbarInner.querySelector('#plat-status-text')!;

        this.keydownHandler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveCtrl.openSaveModal();
            }
        };
        document.addEventListener('keydown', this.keydownHandler);

        this.ctx.projectNameInput.addEventListener('change', () => {
            this.ctx.projectName = this.ctx.projectNameInput.value.trim() || 'Untitled Project';
            this.ctx.projectNameInput.value = this.ctx.projectName;
            window.runtime?.events?.emit('bim-store-mutated', {}); // F.events.15
        });

        // ── Mode switcher wiring ───────────────────────────────────────────────
        this._wireModeButtons();
    }

    /**
     * Wires the three mode buttons to WorkspaceController and keeps them in sync
     * with the current mode via the pryzm-workspace-mode event.
     */
    private _wireModeButtons(): void {
        const switcher = this.toolbarInner.querySelector('#plat-mode-switcher');
        if (!switcher) return;

        // Click handler — delegates to WorkspaceController singleton
        switcher.querySelectorAll('.plat-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = (btn as HTMLElement).dataset.mode as WorkspaceMode;
                if (mode) workspaceController.setMode(mode);
            });
        });

        // Sync button active states when mode changes (from keyboard shortcuts or other callers)
        const syncButtons = (mode: WorkspaceMode) => {
            switcher.querySelectorAll('.plat-mode-btn').forEach(btn => {
                const b = btn as HTMLElement;
                b.dataset.active = String(b.dataset.mode === mode);
            });
        };

        // F.events.6 — pryzm-workspace-mode migrated to runtime.events typed bus.
        // PlatformProjectBrowser has no runtime field; uses window.runtime directly.
        window.runtime?.events?.on('pryzm-workspace-mode', (payload: unknown) => {
            const mode = (payload as { mode?: WorkspaceMode })?.mode;
            if (mode) syncButtons(mode);
        });

        // Sync to the mode already stored in localStorage at startup
        syncButtons(workspaceController.getMode());

        // ── Bridge: left-rail logo hub panel → handleHubMenuAction ──────────
        // ProjectBrowserPanel dispatches 'pryzm-hub-action' (§06 §1 compliant —
        // no cross-layer imports) and PlatformProjectBrowser handles the logic.
        window.runtime?.events?.on('pryzm-hub-action', (p: { action: string }) => { // F.events.15
            if (p.action) this.handleHubMenuAction(p.action);
        });
    }

    // ── Hub Menu (top-right PRYZM logo + dropdown) ────────────────────────────

    buildHubMenu(): void {
        const btn = document.createElement('button');
        btn.className = 'plat-hub-btn';
        btn.title = 'PRYZM menu';
        btn.innerHTML = `
            <svg width="20" height="22" viewBox="0 0 40 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <polygon points="20,2 38,44 2,44" fill="rgba(102,0,255,0.18)" stroke="rgba(102,0,255,0.85)" stroke-width="2.5" stroke-linejoin="round"/>
                <polygon points="20,10 33,40 7,40" fill="none" stroke="rgba(255,255,255,0.30)" stroke-width="1"/>
            </svg>
            <svg class="plat-hub-btn-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        `;
        // ── Move into the toolbar inner row as the leftmost item ──────────────
        this.toolbarInner.prepend(btn);

        // Divider after hub button, before project name
        const divAfterHub = document.createElement('div');
        divAfterHub.className = 'plat-divider';
        btn.after(divAfterHub);

        this.hubMenuEl = btn;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.hubDropdownEl) {
                this.closeHubDropdown();
            } else {
                this.openHubDropdown();
            }
        });

        this.hubMenuDocClick = (e: MouseEvent) => {
            if (this.hubDropdownEl && !this.hubDropdownEl.contains(e.target as Node) && !btn.contains(e.target as Node)) {
                this.closeHubDropdown();
            }
        };
        document.addEventListener('click', this.hubMenuDocClick);
    }

    private _buildHubSection(label: string, bodyHtml: string): string {
        const chevronSvg = `<svg class="plat-hub-section-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;
        return `
            <button class="plat-hub-section-hdr" aria-expanded="false" data-section="${label}">
                <span class="plat-hub-section-hdr-label">${label}</span>
                ${chevronSvg}
            </button>
            <div class="plat-hub-section-body" data-section-body="${label}">
                ${bodyHtml}
            </div>
        `;
    }

    private openHubDropdown(): void {
        this.closeHubDropdown();

        const prefs = UiPreferences.getAll();

        const d = document.createElement('div');
        d.className = 'plat-hub-dropdown';
        d.innerHTML = `
            ${this._buildHubSection('Project', `
                <button class="plat-hub-menu-item plat-hub-menu-item--primary" data-action="back-hub">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    Back to Projects
                </button>
                <button class="plat-hub-menu-item" data-action="save">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Save Version
                </button>
                <button class="plat-hub-menu-item" data-action="history">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5L1 4v6h6l-2.35-2.35A7 7 0 1 1 5 11"/>
                    </svg>
                    Version History
                    <span class="plat-hub-menu-badge">ISO</span>
                </button>
            `)}
            <div class="plat-hub-menu-divider"></div>
            ${this._buildHubSection('Import & Export', `
                <button class="plat-hub-menu-item plat-hub-menu-item--primary" data-action="import-ifc">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Import IFC
                    <span class="plat-hub-menu-badge">IFC</span>
                </button>
                <button class="plat-hub-menu-item" data-action="import-pdf">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    Import PDF / Image
                </button>
                <button class="plat-hub-menu-item" data-action="import-dxf">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2">
                        <rect x="1" y="1" width="14" height="14" rx="2"/>
                        <path d="M4 4h3.5L11 8l-3.5 4H4V4z"/>
                    </svg>
                    Import DXF / DWG
                </button>
                <button class="plat-hub-menu-item" data-action="export-ifc">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export IFC
                </button>
                <button class="plat-hub-menu-item" data-action="export-glb">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export GLB
                </button>
                <button class="plat-hub-menu-item" data-action="print">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    Print / Export PDF
                </button>
                <button class="plat-hub-menu-item plat-hub-menu-item--primary" data-action="import-manager">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                    </svg>
                    Import Manager
                </button>
            `)}
            <div class="plat-hub-menu-divider"></div>
            ${this._buildHubSection('Portfolio & API', `
                <button class="plat-hub-menu-item" data-action="portfolio">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    Portfolio Analytics
                    <span class="plat-hub-menu-badge">E-4</span>
                </button>
                <button class="plat-hub-menu-item" data-action="webhooks">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.27 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.18 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 8a16 16 0 0 0 6 6l.27-.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21 16.92z"/>
                    </svg>
                    Webhook Subscriptions
                    <span class="plat-hub-menu-badge">E-2</span>
                </button>
            `)}
            <div class="plat-hub-menu-divider"></div>
            ${this._buildHubSection('Team & Compliance', `
                <button class="plat-hub-menu-item" data-action="members">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Team Members
                    <span class="plat-hub-menu-badge">CDE</span>
                </button>
                <button class="plat-hub-menu-item" data-action="cde-state">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                    CDE Document State
                    <span class="plat-hub-menu-badge">19650</span>
                </button>
            `)}
            <div class="plat-hub-menu-divider"></div>
            ${this._buildHubSection('Session', `
                <button class="plat-hub-menu-item plat-hub-menu-item--danger" data-action="sign-out">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign Out
                </button>
            `)}
            <div class="plat-hub-menu-divider"></div>
            ${this._buildHubSection('Settings', `
                <label class="plat-hub-toggle-row">
                    <span class="plat-hub-toggle-row-label">Room Design Insights</span>
                    <span class="plat-hub-toggle">
                        <input type="checkbox" data-pref="showRoomDataHints" ${prefs.showRoomDataHints ? 'checked' : ''}>
                        <span class="plat-hub-toggle-track"></span>
                    </span>
                </label>
                <label class="plat-hub-toggle-row">
                    <span class="plat-hub-toggle-row-label">Room Compliance Messages</span>
                    <span class="plat-hub-toggle">
                        <input type="checkbox" data-pref="showRoomComplianceMessages" ${prefs.showRoomComplianceMessages ? 'checked' : ''}>
                        <span class="plat-hub-toggle-track"></span>
                    </span>
                </label>
                <label class="plat-hub-toggle-row">
                    <span class="plat-hub-toggle-row-label">Server Save Warning</span>
                    <span class="plat-hub-toggle">
                        <input type="checkbox" data-pref="showSaveWarningBanner" ${prefs.showSaveWarningBanner ? 'checked' : ''}>
                        <span class="plat-hub-toggle-track"></span>
                    </span>
                </label>
            `)}
        `;

        // ── Anchor dropdown below the hub button, wherever it lives ──────────
        if (this.hubMenuEl) {
            const r = this.hubMenuEl.getBoundingClientRect();
            d.style.top  = `${r.bottom + 6}px`;
            d.style.left = `${r.left}px`;
            d.style.right = 'auto';
        }

        document.body.appendChild(d);
        this.hubDropdownEl = d;
        this.hubMenuEl?.classList.add('plat-hub-btn--open');

        // ── Wire action buttons ───────────────────────────────────────────────
        d.querySelectorAll<HTMLElement>('[data-action]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleHubMenuAction(item.dataset.action!);
                this.closeHubDropdown();
            });
        });

        // ── Wire foldable section headers ─────────────────────────────────────
        d.querySelectorAll<HTMLButtonElement>('.plat-hub-section-hdr').forEach(hdr => {
            hdr.addEventListener('click', (e) => {
                e.stopPropagation();
                const section = hdr.dataset.section!;
                const body = d.querySelector<HTMLElement>(`.plat-hub-section-body[data-section-body="${section}"]`);
                const expanded = hdr.getAttribute('aria-expanded') === 'true';
                hdr.setAttribute('aria-expanded', String(!expanded));
                body?.classList.toggle('plat-hub-section-body--open', !expanded);
            });
        });

        // ── Wire settings toggles ─────────────────────────────────────────────
        d.querySelectorAll<HTMLInputElement>('[data-pref]').forEach(input => {
            input.addEventListener('change', (e) => {
                e.stopPropagation();
                UiPreferences.set(input.dataset.pref as any, input.checked);
            });
        });
    }

    private closeHubDropdown(): void {
        this.hubDropdownEl?.remove();
        this.hubDropdownEl = null;
        this.hubMenuEl?.classList.remove('plat-hub-btn--open');
    }

    handleHubMenuAction(action: string): void {
        switch (action) {
            case 'back-hub':
                window.runtime?.events?.emit('pryzm-go-hub', {}); // F.events.12
                break;
            case 'save':
                this.saveCtrl.openSaveModal();
                break;
            case 'history':
                this.versionCtrl.openHistoryModal();
                break;
            case 'import-ifc':
                window.runtime?.events?.emit('import-ifc', {});
                break;
            case 'export-ifc':
                window.runtime?.events?.emit('pryzm-export-ifc', {}); // F.events.15
                break;
            case 'export-glb':
                window.runtime?.events?.emit('pryzm-export-glb', {}); // F.events.15
                break;
            case 'import-pdf':
                window.runtime?.events?.emit('pryzm-import-pdf', {}); // F.events.13
                break;
            case 'import-dxf':
                window.runtime?.events?.emit('import-dxf', {});
                break;
            case 'import-revit-guided':
                window.runtime?.events?.emit('import-revit-guided', {});
                break;
            case 'import-rhino':
                window.runtime?.events?.emit('import-rhino', {});
                break;
            case 'import-manager':
                window.runtime?.events?.emit('pryzm-import-manager-toggle', {}); // F.events.13
                break;
            case 'print':
                window.print();
                break;
            case 'portfolio':
                this.openPortfolioPanel();
                break;
            case 'webhooks':
                this.openWebhooksPanel();
                break;
            case 'members':
                this.openWorkspaceMembersModal();
                break;
            case 'cde-state':
                this.openWorkspaceCDEStateModal();
                break;
            case 'sign-out':
                window.runtime?.events?.emit('pryzm-sign-out', {}); // F.events.15
                break;
        }
    }

    // ── Team Members Modal ────────────────────────────────────────────────────

    private openWorkspaceMembersModal(): void {
        const overlay = document.createElement('div');
        overlay.className = 'plat-overlay';
        overlay.innerHTML = `
            <div class="plat-modal" style="max-width:520px;width:100%;max-height:80vh;overflow-y:auto;">
                <div class="plat-modal-header">
                    <span class="plat-modal-title">Team Members — ${this.escHtml(this.ctx.projectName)}</span>
                    <button class="plat-modal-close" id="plat-members-close">×</button>
                </div>
                <div class="plat-modal-body" id="plat-members-body" style="min-height:100px;">
                    <div style="text-align:center;color:#888;padding:24px;">Loading members…</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#plat-members-close')!.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const body = overlay.querySelector('#plat-members-body') as HTMLElement;
        apiFetch(`/api/projects/${this.ctx.projectId}/members`)
            .then(r => r.json())
            .then(({ members }) => {
                if (!members || members.length === 0) {
                    body.innerHTML = `<div style="text-align:center;color:#888;padding:24px;font-size:13px;">No team members yet.<br><small>Add members from the Project Hub context menu.</small></div>`;
                    return;
                }
                const roleLabel: Record<string, string> = {
                    appointing_party: 'Appointing Party', lead_appointed: 'Lead Appointed',
                    team_manager: 'Team Manager', team_member: 'Team Member', viewer: 'Viewer',
                };
                body.innerHTML = `
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${members.map((m: any) => {
                            const name = m.display_name || m.user_id || 'Unknown';
                            const initials = name.slice(0, 2).toUpperCase();
                            return `
                                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f8f9fc;border-radius:8px;border:1px solid #dde3f0;">
                                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6600FF,#8B3FF2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${initials}</div>
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-size:13px;font-weight:600;color:#1a2035;">${this.escHtml(name)}</div>
                                        ${m.email ? `<div style="font-size:11px;color:#888;">${this.escHtml(m.email)}</div>` : ''}
                                    </div>
                                    <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(102,0,255,0.1);color:#6600FF;">${roleLabel[m.role] ?? m.role}</span>
                                    ${!m.accepted_at ? `<span style="font-size:10px;padding:2px 6px;background:#fff7ed;color:#d97706;border-radius:8px;border:1px solid #fed7aa;">Pending</span>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            })
            .catch(() => {
                body.innerHTML = `<div style="text-align:center;color:#dc2626;padding:24px;font-size:13px;">Could not load members.</div>`;
            });
    }

    // ── CDE Document State Modal ──────────────────────────────────────────────

    private openWorkspaceCDEStateModal(): void {
        const overlay = document.createElement('div');
        overlay.className = 'plat-overlay';
        overlay.innerHTML = `
            <div class="plat-modal" style="max-width:520px;width:100%;max-height:80vh;overflow-y:auto;">
                <div class="plat-modal-header">
                    <span class="plat-modal-title">CDE Document State — ${this.escHtml(this.ctx.projectName)}</span>
                    <button class="plat-modal-close" id="plat-cde-close">×</button>
                </div>
                <div class="plat-modal-body" id="plat-cde-body" style="min-height:100px;">
                    <div style="text-align:center;color:#888;padding:24px;">Loading version states…</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#plat-cde-close')!.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const body = overlay.querySelector('#plat-cde-body') as HTMLElement;
        apiFetch(`/api/projects/${this.ctx.projectId}/versions`)
            .then(r => r.json())
            .then(async ({ versions }) => {
                if (!versions || versions.length === 0) {
                    body.innerHTML = `<div style="text-align:center;color:#888;padding:24px;font-size:13px;">No versions saved yet.<br><small>Save a version to see its ISO 19650 state.</small></div>`;
                    return;
                }

                const stateColor: Record<string, string> = {
                    wip: '#d97706', shared: '#2563eb', published: '#16a34a', archived: '#6b7280',
                };
                const stateBg: Record<string, string> = {
                    wip: '#fff7ed', shared: '#eff6ff', published: '#f0fdf4', archived: '#f9fafb',
                };
                const stateLabel: Record<string, string> = {
                    wip: 'WIP', shared: 'Shared', published: 'Published', archived: 'Archived',
                };

                const stateResults = await Promise.all(
                    versions.slice(0, 8).map((v: any) =>
                        apiFetch(`/api/projects/${this.ctx.projectId}/versions/${v.id}/state`)
                            .then(r => r.json())
                            .then(d => ({ version: v, state: d.state?.state ?? 'wip' }))
                            .catch(() => ({ version: v, state: 'wip' }))
                    )
                );

                body.innerHTML = `
                    <div style="font-size:11px;color:#888;margin-bottom:10px;">ISO 19650-2 §5.3 four-state workflow — last ${stateResults.length} version(s)</div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${stateResults.map(({ version: v, state }) => `
                            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f8f9fc;border-radius:8px;border:1px solid #dde3f0;">
                                <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:10px;background:${stateBg[state] ?? '#f9fafb'};color:${stateColor[state] ?? '#6b7280'};border:1px solid ${stateColor[state] ?? '#e5e7eb'}22;white-space:nowrap;">${stateLabel[state] ?? state.toUpperCase()}</span>
                                <div style="flex:1;min-width:0;">
                                    <div style="font-size:13px;font-weight:600;color:#1a2035;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escHtml(v.label || v.id)}</div>
                                    <div style="font-size:11px;color:#888;">${v.created_at ? new Date(v.created_at).toLocaleString() : ''}</div>
                                </div>
                                <span style="font-size:11px;color:#888;white-space:nowrap;">${v.element_count ?? 0} elements</span>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top:14px;padding:10px 12px;background:rgba(102,0,255,0.05);border-radius:8px;border:1px solid rgba(102,0,255,0.12);">
                        <div style="font-size:11px;font-weight:700;color:#6600FF;margin-bottom:4px;">Transition versions from the Project Hub</div>
                        <div style="font-size:11px;color:#666;">Use the Team Members menu to manage access, and the Project Hub to advance versions through WIP → Shared → Published → Archived.</div>
                    </div>
                `;
            })
            .catch(() => {
                body.innerHTML = `<div style="text-align:center;color:#dc2626;padding:24px;font-size:13px;">Could not load version states.</div>`;
            });
    }

    // ── Phase E-4 — Portfolio Analytics Modal ────────────────────────────────

    private openPortfolioPanel(): void {
        const overlay = document.createElement('div');
        overlay.className = 'plat-overlay';
        overlay.innerHTML = `
            <div class="plat-modal" style="max-width:800px;width:96%;max-height:88vh;overflow-y:auto;">
                <div class="plat-modal-header">
                    <span class="plat-modal-title">Portfolio Analytics</span>
                    <button class="plat-modal-close" id="plat-portfolio-close">×</button>
                </div>
                <div class="plat-modal-body" id="plat-portfolio-body" style="min-height:200px;">
                    <div style="text-align:center;color:#888;padding:40px 24px;">
                        <div style="font-size:22px;margin-bottom:8px;">⬡</div>
                        Loading portfolio data…
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#plat-portfolio-close')!.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const body = overlay.querySelector('#plat-portfolio-body') as HTMLElement;

        apiFetch('/api/v1/portfolio')
            .then(r => r.json())
            .then(({ data: d }) => {
                if (!d || d.totalProjects === 0) {
                    body.innerHTML = `
                        <div style="text-align:center;color:#888;padding:40px 24px;">
                            <div style="font-size:40px;margin-bottom:12px;">📊</div>
                            <div style="font-size:15px;font-weight:600;color:#555;margin-bottom:6px;">No projects with saved versions yet</div>
                            <div style="font-size:13px;color:#999;">Save a version in a project to see portfolio analytics.</div>
                        </div>`;
                    return;
                }
                const passRate = d.compliancePassRate != null ? `${d.compliancePassRate}%` : '—';
                const passColor = d.compliancePassRate == null ? '#888'
                    : d.compliancePassRate >= 80 ? '#16a34a'
                    : d.compliancePassRate >= 60 ? '#d97706' : '#dc2626';

                const roomTypes = Object.entries(d.roomTypeDistribution ?? {})
                    .sort((a: any, b: any) => b[1] - a[1])
                    .slice(0, 10);

                const prog = d.programmeSummary ?? {};

                body.innerHTML = `
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
                        ${this._portfolioStat('Projects', d.totalProjects, '#6600FF')}
                        ${this._portfolioStat('Total Rooms', d.totalRooms ?? 0, '#2563eb')}
                        ${this._portfolioStat('Total GIA', `${(d.totalGIA ?? 0).toLocaleString()} m²`, '#0891b2')}
                        ${this._portfolioStat('Compliance Pass', passRate, passColor)}
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
                        <div style="background:#f8f9fc;border-radius:10px;padding:14px;border:1px solid #dde3f0;">
                            <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Programme Status</div>
                            ${this._progBar('Pass', prog.pass ?? 0, d.totalRooms ?? 1, '#16a34a', '#f0fdf4')}
                            ${this._progBar('Warning', prog.warning ?? 0, d.totalRooms ?? 1, '#d97706', '#fff7ed')}
                            ${this._progBar('Fail', prog.fail ?? 0, d.totalRooms ?? 1, '#dc2626', '#fef2f2')}
                            ${this._progBar('No Template', prog.noTemplate ?? 0, d.totalRooms ?? 1, '#888', '#f9fafb')}
                        </div>
                        <div style="background:#f8f9fc;border-radius:10px;padding:14px;border:1px solid #dde3f0;">
                            <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Top Room Types</div>
                            ${roomTypes.length === 0
                                ? '<div style="color:#888;font-size:12px;">No room occupancy types recorded</div>'
                                : roomTypes.map(([type, count]: [string, any]) =>
                                    `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;font-size:12px;">
                                        <span style="color:#333;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${this.escHtml(type)}">${this.escHtml(type)}</span>
                                        <span style="font-weight:700;color:#6600FF;">${count}</span>
                                    </div>`
                                ).join('')}
                        </div>
                    </div>

                    <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Projects Breakdown</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${(d.projectSummaries ?? []).filter((p: any) => p.hasSavedVersion).map((p: any) => `
                            <div style="background:#f8f9fc;border-radius:10px;padding:12px 14px;border:1px solid #dde3f0;">
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                                    <div style="min-width:0;flex:1;">
                                        <div style="font-size:13px;font-weight:700;color:#1a2035;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escHtml(p.projectName)}</div>
                                        <div style="font-size:11px;color:#888;margin-top:2px;">${p.roomCount ?? 0} rooms · ${(p.totalGIA ?? 0).toLocaleString()} m² GIA</div>
                                    </div>
                                    <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
                                        ${p.compliancePassRate != null
                                            ? `<span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px;background:${p.compliancePassRate >= 70 ? '#f0fdf4' : '#fef2f2'};color:${p.compliancePassRate >= 70 ? '#16a34a' : '#dc2626'};">${p.compliancePassRate}% pass</span>`
                                            : '<span style="font-size:11px;color:#888;">no data</span>'}
                                        <span style="font-size:11px;color:#888;">${p.wallCount ?? 0} walls</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        ${(d.projectSummaries ?? []).filter((p: any) => !p.hasSavedVersion).length > 0
                            ? `<div style="font-size:11px;color:#aaa;padding:6px 12px;">${(d.projectSummaries ?? []).filter((p: any) => !p.hasSavedVersion).length} project(s) have no saved versions.</div>`
                            : ''}
                    </div>

                    <div style="margin-top:16px;padding:10px 12px;background:rgba(102,0,255,0.05);border-radius:8px;border:1px solid rgba(102,0,255,0.12);font-size:11px;color:#666;">
                        <strong style="color:#6600FF;">API endpoint:</strong> GET /api/v1/portfolio — returns all analytics in JSON for external integrations.
                    </div>
                `;
            })
            .catch((err) => {
                body.innerHTML = `<div style="text-align:center;color:#dc2626;padding:40px 24px;">Could not load portfolio data.<br><small style="color:#888;">${this.escHtml(String(err))}</small></div>`;
            });
    }

    private _portfolioStat(label: string, value: string | number, color: string): string {
        return `
            <div style="background:#fff;border-radius:10px;padding:14px;border:1px solid #dde3f0;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:${color};">${value}</div>
                <div style="font-size:11px;color:#888;margin-top:3px;text-transform:uppercase;letter-spacing:0.04em;">${label}</div>
            </div>`;
    }

    private _progBar(label: string, count: number, total: number, color: string, _bg: string): string {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                    <span style="color:#444;">${label}</span>
                    <span style="font-weight:600;color:${color};">${count} (${pct}%)</span>
                </div>
                <div style="height:6px;background:#eee;border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.4s;"></div>
                </div>
            </div>`;
    }

    // ── Phase E-2 — Webhook Subscriptions Modal ───────────────────────────────

    private openWebhooksPanel(): void {
        const overlay = document.createElement('div');
        overlay.className = 'plat-overlay';

        const projectId = this.ctx.projectId;
        const esc = (s: string) => this.escHtml(s);

        const VALID_EVENTS = [
            'model.saved', 'room.created', 'room.updated', 'room.deleted',
            'compliance.failed', 'compliance.resolved', 'programme.deviation.changed',
        ];

        overlay.innerHTML = `
            <div class="plat-modal" style="max-width:600px;width:96%;max-height:88vh;overflow-y:auto;">
                <div class="plat-modal-header">
                    <span class="plat-modal-title">Webhook Subscriptions</span>
                    <button class="plat-modal-close" id="plat-wh-close">×</button>
                </div>
                <div class="plat-modal-body" id="plat-wh-body">
                    <div style="margin-bottom:16px;padding:10px 12px;background:rgba(102,0,255,0.05);border-radius:8px;border:1px solid rgba(102,0,255,0.12);font-size:12px;color:#555;">
                        Register HTTPS URLs to receive POST notifications when BIM events occur.
                        PRYZM signs each delivery with <code style="background:#eee;padding:1px 4px;border-radius:3px;">X-PRYZM-Signature-256</code> if a secret is set.
                    </div>

                    <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Register New Webhook</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
                        <input id="plat-wh-url" type="url" placeholder="https://your-server.example.com/webhook"
                            style="width:100%;padding:8px 10px;border:1px solid #dde3f0;border-radius:6px;font-size:13px;background:#fff;color:#1a2035;box-sizing:border-box;">
                        <input id="plat-wh-secret" type="text" placeholder="HMAC secret (optional)"
                            style="width:100%;padding:8px 10px;border:1px solid #dde3f0;border-radius:6px;font-size:13px;background:#fff;color:#1a2035;box-sizing:border-box;">
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            ${VALID_EVENTS.map(ev => `
                                <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;background:#f8f9fc;padding:3px 7px;border-radius:6px;border:1px solid #dde3f0;">
                                    <input type="checkbox" class="plat-wh-event" value="${ev}" checked> ${ev}
                                </label>`).join('')}
                        </div>
                        <div id="plat-wh-err" style="font-size:12px;color:#dc2626;display:none;"></div>
                        <button id="plat-wh-register" class="plat-btn plat-btn-primary" style="align-self:flex-start;">
                            Register Webhook
                        </button>
                    </div>

                    <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;">Active Webhooks</div>
                    <div id="plat-wh-list">
                        <div style="text-align:center;color:#888;padding:20px;font-size:13px;">Loading…</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#plat-wh-close')!.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const listEl = overlay.querySelector('#plat-wh-list') as HTMLElement;
        const errEl  = overlay.querySelector('#plat-wh-err') as HTMLElement;
        const urlEl  = overlay.querySelector('#plat-wh-url') as HTMLInputElement;
        const secretEl = overlay.querySelector('#plat-wh-secret') as HTMLInputElement;

        const loadList = () => {
            listEl.innerHTML = `<div style="text-align:center;color:#888;padding:20px;font-size:13px;">Loading…</div>`;
            apiFetch(`/api/v1/projects/${projectId}/webhooks`)
                .then(r => r.json())
                .then(({ data: webhooks }) => {
                    if (!webhooks || webhooks.length === 0) {
                        listEl.innerHTML = `<div style="text-align:center;color:#888;padding:20px;font-size:13px;">No webhooks registered yet.</div>`;
                        return;
                    }
                    listEl.innerHTML = webhooks.map((wh: any) => `
                        <div style="background:#f8f9fc;border-radius:8px;padding:10px 12px;border:1px solid #dde3f0;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                                <div style="min-width:0;flex:1;">
                                    <div style="font-size:12px;font-weight:700;color:#1a2035;word-break:break-all;">${esc(wh.url)}</div>
                                    <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
                                        ${(wh.events || []).map((ev: string) =>
                                            `<span style="font-size:10px;padding:1px 6px;background:rgba(102,0,255,0.1);color:#6600FF;border-radius:8px;">${esc(ev)}</span>`
                                        ).join('')}
                                    </div>
                                    <div style="font-size:10px;color:#aaa;margin-top:3px;">${wh.id}</div>
                                </div>
                                <button data-del="${esc(wh.id)}" style="flex-shrink:0;background:none;border:1px solid #fca5a5;color:#dc2626;padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer;">Delete</button>
                            </div>
                        </div>
                    `).join('');
                    listEl.querySelectorAll<HTMLElement>('[data-del]').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const wid = btn.dataset.del!;
                            apiFetch(`/api/v1/projects/${projectId}/webhooks/${wid}`, { method: 'DELETE' })
                                .then(() => loadList())
                                .catch(() => {});
                        });
                    });
                })
                .catch(() => {
                    listEl.innerHTML = `<div style="text-align:center;color:#dc2626;padding:20px;font-size:13px;">Could not load webhooks.</div>`;
                });
        };

        loadList();

        overlay.querySelector('#plat-wh-register')!.addEventListener('click', () => {
            const url = urlEl.value.trim();
            const secret = secretEl.value.trim();
            const events = [...overlay.querySelectorAll<HTMLInputElement>('.plat-wh-event:checked')].map(el => el.value);
            errEl.style.display = 'none';

            if (!url) { errEl.textContent = 'URL is required.'; errEl.style.display = 'block'; return; }
            if (!url.startsWith('https://')) { errEl.textContent = 'URL must start with https://'; errEl.style.display = 'block'; return; }
            if (events.length === 0) { errEl.textContent = 'Select at least one event type.'; errEl.style.display = 'block'; return; }

            const btn = overlay.querySelector('#plat-wh-register') as HTMLButtonElement;
            btn.disabled = true;
            btn.textContent = 'Registering…';

            apiFetch(`/api/v1/projects/${projectId}/webhooks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, events, secret: secret || undefined }),
            })
                .then(async r => {
                    const data = await r.json();
                    if (!r.ok) throw new Error(data.error ?? 'Registration failed');
                    urlEl.value = '';
                    secretEl.value = '';
                    loadList();
                })
                .catch(err => {
                    errEl.textContent = String(err.message ?? err);
                    errEl.style.display = 'block';
                })
                .finally(() => {
                    btn.disabled = false;
                    btn.textContent = 'Register Webhook';
                });
        });
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    private escHtml(s: string): string {
        return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    dispose(): void {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }
        this.closeHubDropdown();
        this.hubMenuEl?.remove();
        this.hubMenuEl = null;
        if (this.hubMenuDocClick) {
            document.removeEventListener('click', this.hubMenuDocClick);
            this.hubMenuDocClick = null;
        }
        this.toolbar?.remove();
    }
}
