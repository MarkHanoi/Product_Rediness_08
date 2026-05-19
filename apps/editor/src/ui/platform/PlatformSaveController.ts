/**
 * PlatformSaveController — BIM save / export / sync logic for PlatformShell.
 *
 * Extracted from PlatformShell.ts (Wave 14 FILE 2 god-file split, 2026-05-02).
 * Owns SaveOrchestrator + ServerSyncQueue and every method that writes a
 * VersionRecord: openSaveModal, saveVersionInternal, exportCurrentProject,
 * importProject, thumbnail capture/upload, server-save rejection banner.
 *
 * Receives a `ShellCtx` bag (passed by reference) so mutable fields such as
 * `ctx.projectId`, `ctx.projectName`, and DOM refs stay in sync with
 * PlatformShell without requiring a back-pointer to the shell itself.
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports; all BIM access via ctx.saveAdapter / ctx.loadAdapter.
 *   §06 §7  — All version writes go through versionRepository.saveVersionWithMeta().
 *   §01 §2.1 — No direct store mutation; reads via ctx.saveAdapter.serialize().
 */

import { projectRepository, versionRepository } from './ProjectRepository';
import type { ProjectMeta } from './ProjectRepository';
import { SaveOrchestrator } from './SaveOrchestrator';
import { ServerSyncQueue } from './ServerSyncQueue';
import { apiFetch } from '@pryzm/core-app-model';
import { EntitlementStore } from '@pryzm/core-app-model';
import { Feature } from '@pryzm/core-app-model';
import { UiPreferences } from '../UiPreferences';
import { showToast, generateId } from './PlatformToastSystem';
import type { VersionRecord, SaveStatus, ShellCtx } from './PlatformShellTypes';

export class PlatformSaveController {
    readonly orchestrator: SaveOrchestrator;
    readonly syncQueue: ServerSyncQueue;

    constructor(private readonly ctx: ShellCtx) {
        this.syncQueue = new ServerSyncQueue({
            onSyncStatusChange: (versionId, projectId, status) => {
                versionRepository.updateSyncStatus(projectId, versionId, status);
            },
            onSaveRejected: (status, body) => {
                this._handleServerSaveRejected(status, body);
            },
        });

        this.orchestrator = new SaveOrchestrator({
            getHash: () => {
                try {
                    return ctx.saveAdapter.stringify(
                        ctx.saveAdapter.serialize({
                            projectName: ctx.projectName,
                            projectId: ctx.projectId,
                        })
                    );
                } catch {
                    return '';
                }
            },
            onAutoSave: (label: string) => this.saveVersionInternal(label, true),
            onSaveStatusChange: (status: SaveStatus) => this.applySaveStatus(status),
        });
    }

    // ── Save Modal ────────────────────────────────────────────────────────────

    openSaveModal(): void {
        if (!EntitlementStore.hasVersionHistory()) {
            window.runtime?.events?.emit('pryzm-upgrade-required', { feature: String(Feature.VERSION_HISTORY) }); // F.events.12
            showToast('Version history requires the Architect plan — upgrade to save versions', 'error', 5000);
            return;
        }

        const existingVersions = versionRepository.getVersions(this.ctx.projectId);
        if (!EntitlementStore.canSaveVersion(existingVersions.length)) {
            const max = EntitlementStore.getMaxVersions();
            window.runtime?.events?.emit('pryzm-upgrade-required', { feature: String(Feature.VERSION_HISTORY) }); // F.events.12
            showToast(`Version limit reached (${max} per project). Upgrade for unlimited versions.`, 'error', 5000);
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'plat-overlay';

        const now = new Date();
        const defaultLabel = `v${existingVersions.length + 1} — ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        overlay.innerHTML = `
            <div class="plat-modal">
                <div class="plat-modal-header">
                    <span class="plat-modal-title">💾 Save Version</span>
                    <button class="plat-modal-close" id="plat-save-close">×</button>
                </div>
                <div class="plat-modal-body">
                    <div class="plat-field">
                        <label class="plat-label">Project Name</label>
                        <input class="plat-input" id="plat-save-projname" value="${this.ctx.projectName}">
                    </div>
                    <div class="plat-field">
                        <label class="plat-label">Version Label</label>
                        <input class="plat-input" id="plat-save-label" value="${defaultLabel}" placeholder="e.g. Scheme A — Ground Floor">
                    </div>
                    <div id="plat-save-info" style="font-size:11px;color:var(--app-text-muted);margin-top:8px;"></div>
                </div>
                <div class="plat-modal-footer">
                    <button class="plat-btn plat-btn-secondary" id="plat-save-cancel">Cancel</button>
                    <button class="plat-btn plat-btn-primary" id="plat-save-confirm">Save Version</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Flow 7 architectural fix (2026-04-30) — was calling
        // `saveAdapter.serialize({...})` here purely to render the four
        // counts below.  serialize() walks every store, deepStrips every
        // element, and structuredClones every system type — for a 600-element
        // project that is the same heavy work the confirm path runs again on
        // line ~1750.  Two full snapshots per single Cmd+S gesture.
        //
        // Replaced with `getElementCounts()` which reads `store.getAll().length`
        // directly (O(stores), no per-element work).  Eliminates one full
        // serialize per Save gesture; gesture-to-toast latency on a 600-element
        // project drops by exactly one serialize() worth of CPU + GC pressure.
        // See: docs/03_PRYZM3/04-PLAN-FORWARD/04-END-TO-END-FLOWS-AND-COVERAGE.md Flow 7.
        const counts = this.ctx.saveAdapter.getElementCounts();
        const info = overlay.querySelector('#plat-save-info')!;
        info.textContent = `${counts.total} elements · ${counts.walls} walls · ${counts.slabs} slabs · ${counts.furniture} furniture`;

        overlay.querySelector('#plat-save-close')!.addEventListener('click', () => overlay.remove());
        overlay.querySelector('#plat-save-cancel')!.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#plat-save-confirm')!.addEventListener('click', () => {
            const projName = (overlay.querySelector('#plat-save-projname') as HTMLInputElement).value.trim() || 'Untitled Project';
            const label = (overlay.querySelector('#plat-save-label') as HTMLInputElement).value.trim() || defaultLabel;
            overlay.remove();
            this.ctx.projectName = projName;
            this.ctx.projectNameInput.value = projName;
            this.saveVersionInternal(label, false);
        });
    }

    // ── Core save logic ───────────────────────────────────────────────────────

    /**
     * Public manual save — called by the Save button / Ctrl+S modal.
     * Always runs regardless of orchestrator state (user explicitly requested it).
     */
    saveVersion(label: string): void {
        this.saveVersionInternal(label, false);
    }

    /**
     * Internal save implementation shared by manual save and autosave.
     *
     * @param label      - Version label (e.g. 'Auto-save', 'Emergency save (tab closed)',
     *                     or a user-supplied name from the modal).
     * @param isAutoSave - When true, plan gating is applied (free plan skips silently).
     *                     When false (manual), the caller has already checked gating.
     */
    saveVersionInternal(label: string, isAutoSave: boolean): void {
        if (isAutoSave) {
            // Auto-save always writes to localStorage for data safety — BIM data loss
            // is unacceptable regardless of plan.  The server-side limit is enforced
            // by the server (returns 403 for free-plan users); the ServerSyncQueue
            // handles that gracefully. Client-side canSaveVersion() only gates the
            // version-history panel (how many old snapshots the user can browse),
            // not whether the LATEST state is persisted.
            if (!EntitlementStore.hasVersionHistory()) {
                console.log('[PlatformSaveController] Auto-save skipped — plan does not include version history');
                return;
            }
            // NOTE: intentionally NOT checking canSaveVersion() here.
            // Limiting how many versions are kept is handled by
            // LocalVersionRepository.saveVersionsWithQuota (keeps last 20).
        }

        try {
            const snapshot = this.ctx.saveAdapter.serialize({
                projectName: this.ctx.projectName,
                projectId: this.ctx.projectId,
                versionLabel: label,
            });

            const version: VersionRecord = {
                id: generateId(),
                projectId: this.ctx.projectId,
                label,
                timestamp: Date.now(),
                elementCount: snapshot.elementCount,
                snapshot,
                syncStatus: 'local-only',
            };

            // PERF-FIX (2026-04-29) — on free-plan accounts the server permanently
            // rejects version POSTs.  Once the sync queue has latched that fact
            // (via the first 403 response in this session), skip the per-save
            // thumbnail capture entirely on the auto-save path.  Thumbnail
            // capture is the heaviest step (`readPixels` + WebP encode), and
            // the thumbnail upload that follows would also 403.  The renderer
            // still captures a fresh thumbnail on the post-load path so the
            // hub preview stays current.
            const planBlocksSync = isAutoSave && this.syncQueue?.isPlanRejected?.() === true;
            const capturedThumb = planBlocksSync
                ? null
                : (this.ctx.saveAdapter.captureThumbnail?.() ?? null);
            if (!planBlocksSync) {
                console.log(`[PlatformSaveController] Thumbnail: ${capturedThumb ? `captured (~${Math.round(capturedThumb.length / 1024)}KB)` : 'not captured (will reuse existing)'}`);
            }

            const existingMeta = projectRepository.listProjects().find(p => p.id === this.ctx.projectId);

            // Project-hub improvement C — build cdeSummary from the new version's CDE fields
            const cdeSummary: ProjectMeta['cdeSummary'] = version.cdeState ? {
                latestState: version.cdeState,
                revisionCode: version.revisionCode ?? null,
                suitabilityCode: version.suitabilityCode ?? null,
                structuredNameShort: version.structuredName
                    ? [version.structuredName.project, version.structuredName.originator,
                       version.structuredName.volume, version.structuredName.level,
                       version.structuredName.type, version.structuredName.role,
                       version.structuredName.number].join('-')
                    : null,
                lastTransitionAt: version.transitionedAt ?? null,
            } : (existingMeta?.cdeSummary ?? undefined);

            const meta: ProjectMeta = {
                id: this.ctx.projectId,
                name: this.ctx.projectName,
                updatedAt: Date.now(),
                versionCount: (versionRepository.getVersions(this.ctx.projectId).length) + 1,
                thumbnail: capturedThumb ?? existingMeta?.thumbnail,
                projectType: existingMeta?.projectType,
                cdeSummary,
            };

            versionRepository.saveVersionWithMeta(this.ctx.projectId, version, meta);

            // Upload thumbnail to server so all sessions see the preview without
            // having to open the model first (Contract §13 thumbnail server-sync addendum).
            if (capturedThumb) {
                this._uploadThumbnailToServer(this.ctx.projectId, capturedThumb);
            }

            const serialisedHash = this.ctx.saveAdapter.stringify(snapshot);
            this.markCleanLabel(label, serialisedHash);

            this.ctx.ownSyncedVersionIds.add(version.id);
            this.syncQueue.enqueue(version, this.ctx.projectId);

            if (!isAutoSave) {
                showToast(`✓ Saved: ${label}`, 'success');
            }
            console.log(`[PlatformSaveController] Version saved: "${label}" (${snapshot.elementCount} elements, id: ${version.id})`);

        } catch (err) {
            console.error('[PlatformSaveController] Save failed:', err);
            if (!isAutoSave) {
                showToast('Save failed — see console for details', 'error');
            }
        }
    }

    // ── Export / Import ───────────────────────────────────────────────────────

    exportCurrentProject(_overlay: Element): void {
        try {
            const snapshot = this.ctx.saveAdapter.serialize({
                projectName: this.ctx.projectName,
                projectId: this.ctx.projectId,
            });
            const json = this.ctx.saveAdapter.stringify(snapshot);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.ctx.projectName.replace(/\s+/g, '-')}-${Date.now()}.bim.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Project exported as JSON', 'success');
        } catch (err) {
            console.error('[PlatformSaveController] Export failed:', err);
            showToast('Export failed', 'error');
        }
    }

    importProject(_overlay: Element): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.bim.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const snapshot = this.ctx.saveAdapter.parse(text);
                if (confirm(`Load "${snapshot.projectName}" (${snapshot.elementCount} elements)?\nThis will replace the current project.`)) {
                    const version: VersionRecord = {
                        id: generateId(),
                        projectId: this.ctx.projectId,
                        label: `Imported: ${snapshot.projectName}`,
                        timestamp: Date.now(),
                        elementCount: snapshot.elementCount,
                        snapshot,
                        syncStatus: 'local-only',
                    };
                    const versions = versionRepository.getVersions(this.ctx.projectId);
                    versions.push(version);
                    versionRepository.saveVersions(this.ctx.projectId, versions);
                    // Caller (PlatformVersionController) will call loadVersion(version)
                    // via a custom event to avoid a circular dependency.
                    window.runtime?.events?.emit('plat-load-version', { version }); // F.events.15
                }
            } catch (err) {
                console.error('[PlatformSaveController] Import failed:', err);
                showToast('Import failed — invalid file', 'error');
            }
        };
        input.click();
    }

    // ── Thumbnail ─────────────────────────────────────────────────────────────

    /**
     * Schedules a one-time thumbnail capture after the project finishes loading
     * and the 3D renderer has had time to paint several complete frames.
     *
     * This is called on every project open so that Project Hub cards always
     * display a real scene preview — even for projects that have never been
     * manually saved or auto-saved in the current session.
     *
     * Flow:
     *   1. Listen (once) for `pryzm-project-loaded` for THIS project.
     *   2. Wait CAPTURE_DELAY_MS for the GPU to upload geometry and paint frames.
     *   3. Call saveAdapter.captureThumbnail() — same path used by saveInner().
     *   4. Persist the thumbnail into the project index WITHOUT creating a new
     *      version record (avoids polluting version history / triggering server sync).
     */
    schedulePostLoadThumbnailCapture(projectId: string): void {
        // PERF-FIX (Apr 2026): Wait an extra second AND yield to idle before
        // capturing. The capture path serializes the WebGPU/Canvas2D framebuffer
        // to a base64 WebP, which historically caused a ~2.5 s LONGTASK right
        // after first paint. Using requestIdleCallback ensures the user can
        // interact with the model immediately; the thumbnail can wait.
        const CAPTURE_DELAY_MS = 3500;

        let _unsubProjectLoaded: (() => void) | undefined; // F.events.9
        const handler = (payload: unknown): void => {
            const detail = (payload as { projectId?: string; empty?: boolean } | undefined) ?? {};

            // Ignore events for other projects (can happen during rapid switching).
            if (detail.projectId !== projectId) return;

            // Empty projects have no geometry — nothing meaningful to capture.
            if (detail.empty) {
                _unsubProjectLoaded?.(); _unsubProjectLoaded = undefined; // F.events.9
                return;
            }

            _unsubProjectLoaded?.(); _unsubProjectLoaded = undefined; // F.events.9

            const runCapture = () => {
                // Guard: user may have switched to a different project during the delay.
                if (this.ctx.activeProjectId !== projectId) {
                    console.log('[PlatformSaveController] Post-load thumbnail skipped — project changed during delay');
                    return;
                }

                const thumb = this.ctx.saveAdapter.captureThumbnail?.() ?? null;
                if (!thumb) {
                    console.log('[PlatformSaveController] Post-load thumbnail: capture returned null — renderer not ready');
                    return;
                }

                const existing = projectRepository.listProjects().find(p => p.id === projectId);
                if (!existing) {
                    console.log('[PlatformSaveController] Post-load thumbnail: project meta not found — skipping');
                    return;
                }

                // Write ONLY the thumbnail field — preserve all other metadata intact.
                projectRepository.saveProject({ ...existing, thumbnail: thumb });
                console.log(`[PlatformSaveController] Post-load thumbnail saved for project ${projectId} (~${Math.round(thumb.length / 1024)} KB)`);
                // Upload to server so other sessions/browsers show the preview immediately.
                this._uploadThumbnailToServer(projectId, thumb);
            };

            // Wait for the renderer to settle, then yield to idle for the
            // expensive readPixels + WebP encode step.
            setTimeout(() => {
                const ric = window.requestIdleCallback as // TODO(C.3.x): legacy requestIdleCallback — replace with browser shim — runtime.platform.idleCallback
                    | ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
                if (typeof ric === 'function') ric(runCapture, { timeout: 4000 });
                else runCapture();
            }, CAPTURE_DELAY_MS);
        };

        _unsubProjectLoaded = window.runtime?.events?.on('pryzm-project-loaded', handler); // F.events.9
    }

    /**
     * Fire-and-forget: uploads a thumbnail to the server so it persists across
     * sessions and browsers. Failures are logged but never thrown — thumbnails
     * are non-critical and the local copy is already saved.
     * Contract §13 thumbnail server-sync addendum.
     *
     * PERF-FIX (2026-04-29) — short-circuit when the sync queue has latched
     * a plan-gating rejection.  The thumbnail endpoint sits behind the same
     * plan gate as /versions, so on free plans this PATCH would also 403.
     * Skipping it removes one network call per save and one hidden ~50 ms
     * LONGTASK from each wall-creation cycle.
     */
    private _uploadThumbnailToServer(projectId: string, thumbnail: string): void {
        if (this.syncQueue?.isPlanRejected?.() === true) return;
        apiFetch(`/api/projects/${projectId}/thumbnail`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnail }),
        }).then(res => {
            if (res.ok) {
                console.log(`[PlatformSaveController] Thumbnail uploaded to server for project ${projectId}`);
            } else {
                console.warn(`[PlatformSaveController] Thumbnail upload failed (${res.status}) for project ${projectId}`);
            }
        }).catch(err => {
            console.warn('[PlatformSaveController] Thumbnail upload error (non-fatal):', err);
        });
    }

    // ── Save status → toolbar ─────────────────────────────────────────────────

    applySaveStatus(status: SaveStatus): void {
        switch (status) {
            case 'idle':
                this.ctx.statusDot.className = 'plat-status-dot';
                break;
            case 'pending':
                this.ctx.statusDot.className = 'plat-status-dot dirty';
                this.ctx.statusText.textContent = 'Unsaved changes';
                break;
            case 'saving':
                this.ctx.statusDot.className = 'plat-status-dot dirty';
                this.ctx.statusText.textContent = 'Saving…';
                break;
            case 'error':
                this.ctx.statusDot.className = 'plat-status-dot error';
                this.ctx.statusText.textContent = 'Save failed';
                break;
            case 'paused':
                this.ctx.statusDot.className = 'plat-status-dot paused';
                this.ctx.statusText.textContent = 'Preview mode';
                break;
        }
    }

    markCleanLabel(label: string, hash?: string): void {
        this.ctx.statusDot.className = 'plat-status-dot';
        this.ctx.statusText.textContent = `Saved ${label}`;
        this.orchestrator.markClean(hash);
    }

    // ── Server save rejection handler ─────────────────────────────────────────

    /**
     * Called by ServerSyncQueue when the server permanently rejects a save (4xx).
     * Shows a one-per-session warning banner so the user knows their data is
     * only in the browser and prompts them to sign in if unauthenticated.
     */
    private _handleServerSaveRejected(status: number, body: Record<string, unknown>): void {
        const plan = body?.plan as string | undefined;
        const errorMsg = body?.error as string | undefined;
        const isAuthProblem = status === 401 || status === 403;
        if (!isAuthProblem) return;
        if (!this.ctx.serverSaveWarningShown) {
            this.ctx.serverSaveWarningShown = true;
            this._showServerSaveBanner(plan, errorMsg);
        }
    }

    private _showServerSaveBanner(plan?: string, errorMsg?: string): void {
        if (!UiPreferences.get('showSaveWarningBanner')) return;
        const existing = document.getElementById('plat-server-save-banner');
        if (existing) return;

        const isFreePlan = plan === 'free';
        const bannerMsg = isFreePlan
            ? 'Your work is saved locally only. Sign in with your owner account to sync to the server.'
            : 'Server sync is unavailable. Your work is saved in this browser only.';

        const banner = document.createElement('div');
        banner.id = 'plat-server-save-banner';
        banner.style.cssText = [
            'position:fixed', 'bottom:0', 'left:0', 'right:0',
            'background:#c0392b', 'color:#fff',
            'padding:8px 16px', 'display:flex',
            'align-items:center', 'justify-content:space-between',
            'font-size:13px', 'font-family:var(--app-font,sans-serif)',
            'z-index:10000', 'gap:12px',
            'box-shadow:0 -2px 8px rgba(0,0,0,0.3)',
        ].join(';');

        const msgEl = document.createElement('span');
        msgEl.textContent = `⚠ ${bannerMsg}`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;color:#fff;cursor:pointer;font-size:16px;padding:0 4px;flex-shrink:0';
        closeBtn.title = 'Dismiss';
        closeBtn.onclick = () => banner.remove();

        banner.appendChild(msgEl);
        banner.appendChild(closeBtn);
        document.body.appendChild(banner);

        console.warn('[PlatformSaveController] Server save rejected — data is local-only. Plan:', plan ?? 'unknown', '| Error:', errorMsg ?? '(none)');
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    dispose(): void {
        this.orchestrator?.dispose();
        this.syncQueue?.dispose();
    }
}
