/**
 * PlatformVersionController — version history UI + preview for PlatformShell.
 *
 * Extracted from PlatformShell.ts (Wave 14 FILE 2 god-file split, 2026-05-02).
 * Owns all version-list UI, version-preview mode state, and the loadVersion()
 * async flow that applies a VersionRecord snapshot to the BIM scene.
 *
 * Receives a `ShellCtx` bag so DOM refs and projectId stay in sync with the
 * PlatformShell router without requiring a back-pointer to the shell.
 * Receives a `PlatformSaveController` reference for `saveOrchestrator` access
 * and for the "Promote to Current" action that triggers a new save.
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports; loads via ctx.loadAdapter.load().
 *   §06 §7  — Version deletes go through versionRepository.saveVersions().
 */

import { projectRepository, versionRepository } from './ProjectRepository';
import { showToast, syncBadge, formatDate } from './PlatformToastSystem';
import type { VersionRecord, ILoadResult, ShellCtx } from './PlatformShellTypes';
import type { PlatformSaveController } from './PlatformSaveController';

export class PlatformVersionController {
    // ── Phase 4 — Version Preview Mode ───────────────────────────────────────
    /** Stashed working-state snapshot captured just before entering preview. */
    private previewWorkingState: ReturnType<ShellCtx['saveAdapter']['serialize']> | null = null;
    /** The version currently being previewed (null when not in preview). */
    private previewingVersion: VersionRecord | null = null;
    /** The preview banner DOM node (null when not in preview). */
    private previewBanner: HTMLElement | null = null;

    constructor(
        private readonly ctx: ShellCtx,
        private readonly saveCtrl: PlatformSaveController,
    ) {
        // Wire the plat-load-version internal event dispatched by
        // PlatformSaveController.importProject() to avoid a circular dep.
        window.runtime?.events?.on('plat-load-version', (p: { version: unknown }) => { // F.events.15
            if (p.version) this.loadVersion(p.version as VersionRecord);
        });
    }

    // ── History Modal ─────────────────────────────────────────────────────────

    openHistoryModal(): void {
        const overlay = document.createElement('div');
        overlay.className = 'plat-overlay';
        overlay.innerHTML = `
            <div class="plat-modal plat-modal--history">
                <div class="plat-modal-header plat-modal-header--light">
                    <div class="plat-modal-header-left">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;flex-shrink:0">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span class="plat-modal-title plat-modal-title--dark">Version History</span>
                    </div>
                    <button class="plat-modal-close plat-modal-close--dark" id="plat-hist-close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="plat-modal-body">
                    <div id="plat-version-list-container"></div>
                </div>
                <div class="plat-modal-footer plat-modal-footer--history">
                    <div class="plat-modal-footer-left">
                        <button class="plat-hist-action-btn" id="plat-hist-import">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Import
                        </button>
                        <button class="plat-hist-action-btn" id="plat-hist-export">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Export
                        </button>
                    </div>
                    <button class="plat-hist-close-btn" id="plat-hist-close2">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#plat-hist-close')!.addEventListener('click', () => overlay.remove());
        overlay.querySelector('#plat-hist-close2')!.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#plat-hist-export')!.addEventListener('click', () => this.saveCtrl.exportCurrentProject(overlay));
        overlay.querySelector('#plat-hist-import')!.addEventListener('click', () => this.saveCtrl.importProject(overlay));

        this.renderVersionList(overlay.querySelector('#plat-version-list-container')!, overlay);
    }

    renderVersionList(container: Element, overlay: Element): void {
        const versions = versionRepository.getVersions(this.ctx.projectId).slice().reverse();

        if (versions.length === 0) {
            container.innerHTML = `
                <div class="plat-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="opacity:0.3;margin-bottom:10px">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <div style="font-weight:600;margin-bottom:4px;color:#1a2035">No saved versions</div>
                    <div style="font-size:11px">Save a version to see it here</div>
                </div>`;
            return;
        }

        container.innerHTML = `<div class="plat-version-list" id="plat-versions"></div>`;
        const list = container.querySelector('#plat-versions')!;

        const pinSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`;
        const warnSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

        versions.forEach((v, idx) => {
            const isEmergency = v.label.startsWith('Emergency save');
            const isLatest = idx === 0;
            const iconSvg = isEmergency ? warnSvg : pinSvg;
            const item = document.createElement('div');
            item.className = 'plat-version-item' + (isLatest ? ' plat-version-item--latest' : '');
            item.innerHTML = `
                <div class="plat-version-icon plat-version-icon--svg ${isEmergency ? 'plat-version-icon--warn' : ''}">${iconSvg}</div>
                <div class="plat-version-info">
                    <div class="plat-version-label">
                        ${v.label}
                        ${isLatest ? '<span class="plat-version-latest-badge">Latest</span>' : ''}
                        ${syncBadge(v.syncStatus)}
                    </div>
                    <div class="plat-version-meta">${formatDate(v.timestamp)} · ${v.elementCount} elements</div>
                </div>
                <div class="plat-version-actions">
                    <button class="plat-version-preview-btn" data-id="${v.id}" title="Preview without overwriting working state">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        Preview
                    </button>
                    <button class="plat-version-load-btn" data-id="${v.id}">Load</button>
                    <button class="plat-version-delete-btn" data-id="${v.id}" title="Delete version">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `;
            list.appendChild(item);

            item.querySelector('.plat-version-preview-btn')!.addEventListener('click', (e) => {
                e.stopPropagation();
                overlay.remove();
                this.enterVersionPreview(v);
            });

            item.querySelector('.plat-version-load-btn')!.addEventListener('click', (e) => {
                e.stopPropagation();
                overlay.remove();
                this.loadVersion(v);
            });

            item.querySelector('.plat-version-delete-btn')!.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete version "${v.label}"?`)) {
                    this.deleteVersion(v.id);
                    this.renderVersionList(container, overlay);
                }
            });
        });
    }

    // ── Phase 4 — Version Preview Mode ───────────────────────────────────────

    /**
     * Enter version preview mode for the given historical version.
     *
     * Flow:
     *   1. Capture the current working state snapshot.
     *   2. Pause the save orchestrator (setVersionPreviewMode(true)).
     *   3. Load the historical snapshot via the load adapter.
     *   4. Show the amber preview banner with Restore and Promote actions.
     */
    async enterVersionPreview(version: VersionRecord): Promise<void> {
        const spinOverlay = document.createElement('div');
        spinOverlay.className = 'plat-overlay';
        spinOverlay.innerHTML = `
            <div class="plat-modal" style="max-width:320px;padding:32px 24px;text-align:center">
                <div class="plat-loading">
                    <div class="plat-spinner"></div>
                    Entering preview: "${version.label}"…
                </div>
            </div>
        `;
        document.body.appendChild(spinOverlay);

        try {
            this.previewWorkingState = this.ctx.saveAdapter.serialize({
                projectName: this.ctx.projectName,
                projectId: this.ctx.projectId,
            });
        } catch {
            this.previewWorkingState = null;
        }

        this.saveCtrl.orchestrator.setVersionPreviewMode(true);
        this.previewingVersion = version;

        try {
            await this.ctx.loadAdapter.load(version.snapshot);
        } catch (err) {
            console.error('[PlatformVersionController] Preview load failed:', err);
            showToast('Preview failed — see console', 'error');
            this.exitVersionPreview();
            spinOverlay.remove();
            return;
        }

        spinOverlay.remove();
        this.showPreviewBanner(version);
        showToast(`👁 Previewing: "${version.label}" — changes are not saved`, 'info', 5000);
        console.log(`[PlatformVersionController] Version preview active: "${version.label}"`);
    }

    /**
     * Render the amber preview banner pinned below the toolbar.
     * The banner has two action buttons: Restore and Promote.
     */
    showPreviewBanner(version: VersionRecord): void {
        this.dismissPreviewBanner();

        const banner = document.createElement('div');
        banner.className = 'plat-preview-banner';
        banner.id = 'plat-preview-banner';
        banner.innerHTML = `
            <span class="plat-preview-banner-label">
                ⚑ PREVIEW MODE — "${version.label}"
            </span>
            <div class="plat-preview-banner-actions">
                <button class="plat-preview-banner-btn plat-preview-banner-btn-restore" id="plat-preview-restore">
                    ↩ Restore Working State
                </button>
                <button class="plat-preview-banner-btn plat-preview-banner-btn-promote" id="plat-preview-promote">
                    ✓ Promote to Current
                </button>
            </div>
        `;
        document.body.appendChild(banner);
        this.previewBanner = banner;

        banner.querySelector('#plat-preview-restore')!.addEventListener('click', () => {
            this.restoreWorkingState();
        });

        banner.querySelector('#plat-preview-promote')!.addEventListener('click', () => {
            this.promotePreviewToCurrent();
        });
    }

    /** Remove the preview banner from the DOM if it exists. */
    dismissPreviewBanner(): void {
        if (this.previewBanner) {
            this.previewBanner.remove();
            this.previewBanner = null;
        }
        const existing = document.getElementById('plat-preview-banner');
        if (existing) existing.remove();
    }

    /**
     * Exit preview mode and reload the stashed working state.
     * If the working state could not be captured (e.g. the project was empty),
     * exits preview mode without reloading and shows a warning.
     */
    async restoreWorkingState(): Promise<void> {
        if (!this.previewWorkingState) {
            showToast('No working state to restore — exiting preview', 'info', 3000);
            this.exitVersionPreview();
            return;
        }

        const spinOverlay = document.createElement('div');
        spinOverlay.className = 'plat-overlay';
        spinOverlay.innerHTML = `
            <div class="plat-modal" style="max-width:280px;padding:28px 20px;text-align:center">
                <div class="plat-loading">
                    <div class="plat-spinner"></div>
                    Restoring working state…
                </div>
            </div>
        `;
        document.body.appendChild(spinOverlay);

        try {
            await this.ctx.loadAdapter.load(this.previewWorkingState);
            showToast('✓ Working state restored', 'success', 3000);
        } catch (err) {
            console.error('[PlatformVersionController] Restore working state failed:', err);
            showToast('Restore failed — see console', 'error');
        } finally {
            spinOverlay.remove();
            this.exitVersionPreview();
        }
    }

    /**
     * Promote the currently previewed version to become a new saved version,
     * then exit preview mode.  The promoted snapshot is saved under a label
     * that makes its origin explicit (e.g. "Promoted: v3 — Scheme A").
     */
    promotePreviewToCurrent(): void {
        const version = this.previewingVersion;
        if (!version) {
            this.exitVersionPreview();
            return;
        }
        const label = `Promoted: ${version.label}`;
        this.exitVersionPreview();
        this.saveCtrl.saveVersionInternal(label, false);
        showToast(`✓ Promoted: "${version.label}" is now the current version`, 'success', 4000);
    }

    /**
     * Shared cleanup that runs at the end of restore or promote.
     * Clears all preview state and re-enables the save orchestrator.
     */
    exitVersionPreview(): void {
        this.dismissPreviewBanner();
        this.previewWorkingState = null;
        this.previewingVersion = null;
        this.saveCtrl.orchestrator.setVersionPreviewMode(false);
        this.saveCtrl.orchestrator.resetDirtyAfterLoad();
        console.log('[PlatformVersionController] Exited version preview mode');
    }

    // ── Load a version ────────────────────────────────────────────────────────

    async loadVersion(version: VersionRecord): Promise<void> {
        // Capture the project this load is intended for at call time.
        // Used by the stale-closure guard below: if activeProjectId has
        // changed by the time the async load resolves, we discard the result
        // instead of calling setLoading(false) and corrupting the new load.
        const targetProjectId = version.projectId ?? this.ctx.projectId;

        const overlay = document.createElement('div');
        overlay.className = 'plat-overlay';
        overlay.innerHTML = `
            <div class="plat-modal" style="max-width:320px;padding:32px 24px;text-align:center">
                <div class="plat-loading">
                    <div class="plat-spinner"></div>
                    Loading "${version.label}"...
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        this.saveCtrl.orchestrator.setLoading(true);
        this.ctx.statusText.textContent = 'Loading…';

        // Safety timeout: if the engine load hangs for more than 30 s, unblock the scene.
        const LOAD_TIMEOUT_MS = 30_000;
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Load timed out after 30 s')), LOAD_TIMEOUT_MS)
        );

        try {
            this.ctx.projectName = version.snapshot.projectName ?? this.ctx.projectName;
            this.ctx.projectNameInput.value = this.ctx.projectName;

            const result: ILoadResult = await Promise.race([
                this.ctx.loadAdapter.load(version.snapshot),
                timeoutPromise,
            ]);
            overlay.remove();

            // ── Stale-closure guard ───────────────────────────────────────────
            // If the user switched projects while this async load was running,
            // activeProjectId no longer matches targetProjectId.  Discard this
            // result: do NOT call setLoading(false) (would unblock the new load),
            // do NOT fire pryzm-project-loaded (would interfere with the new one).
            if (this.ctx.activeProjectId !== targetProjectId) {
                console.log('[PlatformVersionController] loadVersion result discarded — project switched to',
                    this.ctx.activeProjectId, 'while loading', targetProjectId);
                return;
            }

            this.saveCtrl.orchestrator.setLoading(false);
            this.saveCtrl.orchestrator.resetDirtyAfterLoad();

            this.ctx.statusDot.className = 'plat-status-dot';
            this.ctx.statusText.textContent = `Loaded: ${version.label}`;

            // Notify DataWorkbench and other subscribers that a project version has loaded.
            window.runtime?.events?.emit('pryzm-project-loaded', { projectId: this.ctx.projectId, projectName: this.ctx.projectName }); // F.events.9

            if (result.success || result.loaded > 0) {
                showToast(`✓ Loaded: ${version.label} (${result.loaded} elements)`, 'success', 4000);
                if (result.errors.length > 0) {
                    console.warn('[PlatformVersionController] Load warnings:', result.errors);
                    showToast(`${result.failed} elements failed — see console`, 'error', 5000);
                }
            } else {
                showToast(`Load failed: ${result.errors[0] ?? 'unknown error'}`, 'error');
            }
        } catch (err) {
            overlay.remove();
            // ── Stale-closure guard (error path) ─────────────────────────────
            if (this.ctx.activeProjectId !== targetProjectId) {
                console.log('[PlatformVersionController] loadVersion error discarded — project switched to',
                    this.ctx.activeProjectId, 'while loading', targetProjectId);
                return;
            }
            this.saveCtrl.orchestrator.setLoading(false);
            console.error('[PlatformVersionController] Load error:', err);
            showToast('Load failed — see console', 'error');
        }
    }

    // ── Delete a version ──────────────────────────────────────────────────────

    deleteVersion(versionId: string): void {
        const versions = versionRepository.getVersions(this.ctx.projectId).filter(v => v.id !== versionId);
        versionRepository.saveVersions(this.ctx.projectId, versions);

        const existingMeta = projectRepository.listProjects().find(p => p.id === this.ctx.projectId);
        if (existingMeta) {
            projectRepository.saveProject({
                ...existingMeta,
                versionCount: versions.length,
                updatedAt: Date.now(),
            });
        }
        showToast('Version deleted', 'info', 2000);
    }
}
