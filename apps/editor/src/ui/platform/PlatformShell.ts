/**
 * PlatformShell — Production BIM Platform UI (Wave 14 FILE 2 split router).
 *
 * This file is the thin orchestration shell: ≤300 LOC.
 * All domain logic has been extracted to sub-modules:
 *
 *   PlatformToastSystem      — showToast, syncBadge, formatDate, generateId
 *   PlatformSyncPill         — syncBadge re-export
 *   PlatformCollabPill       — presence strip (§50 CP-1) + socket.io client
 *   PlatformSaveController   — openSaveModal, save/export/import, orchestrator
 *   PlatformVersionController— history modal, preview mode, loadVersion
 *   PlatformProjectBrowser   — toolbar, hub menu + all workspace modals
 *
 * Architecture:
 *   - Delegates BIM serialization to SaveAdapter (injected from EngineBootstrap)
 *   - Delegates BIM loading to LoadAdapter (injected from EngineBootstrap)
 *   - Project index writes go through projectRepository (single source of truth)
 *   - CSS lives in AppTheme.ts as PLATFORM_SHELL_STYLES; injectAppTheme() called once
 *   - Sub-controllers share state via a ShellCtx mutable bag (passed by reference)
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports; delegates injected via constructor interfaces
 *   §06 §5  — All styles in AppTheme.ts (PLATFORM_SHELL_STYLES constant); no inline injection
 *   §06 §7  — bim-projects-index written only via projectRepository
 *   §06 §7  — bim-project-{id}-versions written only via versionRepository
 *   §01 §2.1 — No direct store mutation (reads via saveAdapter.serialize())
 */

import { injectAppTheme } from '../styles/AppTheme';
import { versionRepository } from './ProjectRepository';
import type { SaveAdapter, LoadAdapter, IProjectSnapshot, ShellCtx } from './PlatformShellTypes';
import type { VersionRecord } from './PlatformShellTypes';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { apiFetch } from '@pryzm/core-app-model';
import { generateId } from './PlatformToastSystem';
import { mountPresenceStrip, initSocketCollaboration } from './PlatformCollabPill';
import { PlatformSaveController } from './PlatformSaveController';
import { PlatformVersionController } from './PlatformVersionController';
import { PlatformProjectBrowser } from './PlatformProjectBrowser';

export class PlatformShell {
    private readonly ctx: ShellCtx;
    private readonly saveCtrl: PlatformSaveController;
    private readonly versionCtrl: PlatformVersionController;
    private readonly browser: PlatformProjectBrowser;

    /**
     * Phase A.5 (S73-WIRE) — `runtime` is the composed `PryzmRuntime`
     * handle from `@pryzm/runtime-composer`.  When supplied, panels
     * widened in Phase B+ reach the engine through `this.runtime.<slot>`
     * instead of `window.<engine field>`. // TODO(D.4): legacy window-cast — replace with runtime.scene.<engine field> — JSDoc reference
     *
     * Optional in Phase A so callers that have not yet adopted the
     * composer (legacy in-process boot, isolated tests) keep compiling
     * unchanged; the field is read by Phase B+ code only.
     */
    private runtime: PryzmRuntime | null;

    constructor(
        saveAdapter: SaveAdapter,
        loadAdapter: LoadAdapter,
        runtime: PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;

        // F.5.1 Wave 14 — runtime.scene.mount wiring (canvas mount facade).
        // Phase F: confirms the scene slot is available; Phase D.4 replaces
        // the legacy `window.world` refs with runtime.scene.mount(canvas).
        if (runtime?.scene) {
            const _sceneSlot = runtime.scene;
            console.debug('[PlatformShell] Wave 14 runtime.scene wired — renderer:', typeof _sceneSlot.renderer);
        }

        // ── Create the shared mutable context bag ────────────────────────────
        // DOM refs (statusDot, statusText, projectNameInput) start as null and
        // are filled in by browser.buildToolbar() below — always non-null after
        // construction completes.
        this.ctx = {
            projectId: generateId(),
            projectName: 'Untitled Project',
            activeProjectId: null,
            serverSaveWarningShown: false,
            ownSyncedVersionIds: new Set(),
            presenceChips: new Map(),
            socket: null,
            statusDot: null!,
            statusText: null!,
            projectNameInput: null!,
            saveAdapter,
            loadAdapter,
        };

        injectAppTheme();

        // ── Wire sub-controllers ─────────────────────────────────────────────
        this.saveCtrl    = new PlatformSaveController(this.ctx);
        this.versionCtrl = new PlatformVersionController(this.ctx, this.saveCtrl);
        this.browser     = new PlatformProjectBrowser(this.ctx, this.saveCtrl, this.versionCtrl);

        this.browser.buildToolbar();
        this.browser.buildHubMenu();
        mountPresenceStrip(this.ctx.presenceChips, this.runtime?.events);

        console.log(
            '[PlatformShell] Initialized — project ID:',
            this.ctx.projectId,
            this.runtime !== null ? '(runtime: composed)' : '(runtime: legacy)',
        );
        // NOTE: Do NOT call setProjectContext from the constructor via __pendingProjectId.
        // PlatformRouter already calls it via requestAnimationFrame after the engine is
        // ready.  The old constructor-shortcut caused a double-call: once here and once
        // from PlatformRouter's RAF, triggering a second ClearProjectCommand that wiped
        // freshly-created walls/slabs from a brand-new project.
    }

    /**
     * Phase D.1 (S77-WIRE) — Replace deferred stub adapters with the real
     * ProjectSerializer / ProjectLoader adapters once the engine has booted.
     *
     * Called by `initPersistence.ts` after `EngineBootstrap.bootstrap()` completes.
     * DELETE in Phase D.4 (EngineBootstrap.ts removed; full-runtime load path).
     */
    injectDelegates(saveAdapter: SaveAdapter, loadAdapter: LoadAdapter): void {
        this.ctx.saveAdapter = saveAdapter;
        this.ctx.loadAdapter = loadAdapter;
        console.log('[PlatformShell] D.1 — real save/load delegates injected (engine ready)');
    }

    /**
     * Called by PlatformRouter after the user selects a project from the hub.
     * Phase 4: also connects the socket.io collaboration client and joins the
     * project room so the user receives real-time version-saved notifications.
     */
    setProjectContext(
        id: string,
        name: string,
        opts?: { isNewProject?: boolean; prefetchedVersion?: unknown },
    ): void {
        // ── Idempotency guard ─────────────────────────────────────────────────
        if (this.ctx.activeProjectId === id) {
            console.log('[PlatformShell] setProjectContext: already active for', id, '— skipping duplicate call');
            this.ctx.projectName = name;
            if (this.ctx.projectNameInput) this.ctx.projectNameInput.value = name;
            return;
        }
        this.ctx.activeProjectId = id;

        // ── Save-protection fence ─────────────────────────────────────────────
        // setLoading(true) MUST be called BEFORE ctx.projectId is mutated so
        // that (a) the debounce is cancelled while projectId is still the old
        // value, (b) hasDirtyChanges is cleared, and (c) flushBeforeUnload()
        // cannot race a tab-close between the ID change and the first async yield.
        this.saveCtrl.orchestrator.setLoading(true);

        this.ctx.projectId = id;
        this.ctx.projectName = name;
        if (this.ctx.projectNameInput) this.ctx.projectNameInput.value = name;
        console.log('[PlatformShell] Project context set:', id, name);

        // ── Contract §4.2 / GAP-1 fix — dispatch BEFORE load begins ─────────
        window.runtime?.events?.emit('pryzm-project-switch', { projectId: id, projectName: name }); // F.events.15

        initSocketCollaboration(this.ctx, id);

        window.runtime?.events?.emit('pryzm-project-context-set', { projectId: id, projectName: name }); // F.events.15

        this.saveCtrl.schedulePostLoadThumbnailCapture(id);

        // ── Auto-restore latest saved version ────────────────────────────────
        const localVersions = versionRepository.getVersions(id);
        if (localVersions.length > 0) {
            const latest = localVersions[localVersions.length - 1]!;
            console.log('[PlatformShell] Auto-restoring latest local version:', latest.label);
            this.versionCtrl.loadVersion(latest);
        } else if (opts?.isNewProject) {
            // Brand-new project: clear scene and resolve immediately.
            console.log('[PlatformShell] New project — clearing scene immediately (no server check)');
            this.ctx.loadAdapter.load(this._makeEmptySnapshot(id, name))
                .then(() => {
                    if (this.ctx.activeProjectId !== id) return;
                    this.saveCtrl.orchestrator.setLoading(false);
                    this.saveCtrl.orchestrator.resetDirtyAfterLoad();
                    console.log('[PlatformShell] New project ready — firing pryzm-project-loaded(empty:true)');
                    window.runtime?.events?.emit('pryzm-project-loaded', { projectId: id, projectName: name, empty: true }); // F.events.9
                })
                .catch(err => {
                    if (this.ctx.activeProjectId !== id) return;
                    this.saveCtrl.orchestrator.setLoading(false);
                    console.warn('[PlatformShell] Error clearing scene for new project:', err);
                    window.runtime?.events?.emit('pryzm-project-loaded', { projectId: id, projectName: name, empty: true }); // F.events.9
                });
        } else {
            // No local versions: clear the scene, then fetch from server.
            // Wave 7 (2026-05-01): if opts.prefetchedVersion is set, use it directly.
            const prefetched = opts?.prefetchedVersion as ({
                versionId: string; versionLabel: string; snapshot: IProjectSnapshot;
                elementCount: number; createdAt: string;
            } | null | undefined);
            console.log('[PlatformShell] No local versions — clearing scene before data restore');
            this.ctx.loadAdapter.load(this._makeEmptySnapshot(id, name))
                .then(() => {
                    if (this.ctx.activeProjectId !== id) {
                        console.log('[PlatformShell] Empty-load result discarded — project already switched to', this.ctx.activeProjectId);
                        return;
                    }
                    this.saveCtrl.orchestrator.setLoading(false);
                    this.saveCtrl.orchestrator.resetDirtyAfterLoad();
                    if (prefetched?.snapshot != null) {
                        const record: VersionRecord = {
                            id: prefetched.versionId,
                            projectId: id,
                            label: prefetched.versionLabel,
                            timestamp: new Date(prefetched.createdAt).getTime(),
                            elementCount: prefetched.elementCount,
                            snapshot: prefetched.snapshot,
                            syncStatus: 'synced',
                        };
                        console.log('[PlatformShell] Using prefetched version from persistence tier:', record.label);
                        this.versionCtrl.loadVersion(record);
                        return;
                    } else {
                        console.log('[PlatformShell] Scene cleared — checking server for project:', id);
                        return this._loadLatestVersionFromServer(id);
                    }
                })
                .catch(err => {
                    if (this.ctx.activeProjectId !== id) {
                        console.log('[PlatformShell] Empty-load error discarded — project already switched to', this.ctx.activeProjectId);
                        return;
                    }
                    this.saveCtrl.orchestrator.setLoading(false);
                    console.warn('[PlatformShell] Error clearing scene for new project:', err);
                    this._loadLatestVersionFromServer(id);
                });
        }
    }

    /**
     * Returns a minimal valid empty snapshot for clearing the scene when no
     * persisted data exists for a project.
     */
    private _makeEmptySnapshot(projectId: string, projectName: string): IProjectSnapshot {
        return {
            projectId, projectName, elementCount: 0,
            walls: [], slabs: [], furniture: [], levels: [], grids: [],
            columns: [], stairs: [], beams: [], curtainWalls: [], roofs: [],
            handrails: [], plumbing: [], windows: [], doors: [],
            viewDefinitions: [], visibilityRules: [],
            semanticIndex: {}, vgGovernance: {},
            sheets: [], schedules: [], schemaVersion: 1,
        };
    }

    /**
     * Fetches the latest version from the server and loads it into the scene.
     * Used as a fallback when localStorage has no versions.
     * Contract 20 §7.3 / GAP-3.
     */
    private async _loadLatestVersionFromServer(projectId: string): Promise<void> {
        let loaded = false;
        let aborted = false;
        try {
            const res = await apiFetch(`/api/projects/${projectId}/latest-version`);
            if (this.ctx.activeProjectId !== projectId) { aborted = true; return; }
            if (!res.ok) { console.warn('[PlatformShell] Server latest-version request failed:', res.status); return; }
            const { version } = await res.json() as { version?: any };
            if (!version?.snapshot) {
                console.log('[PlatformShell] No server versions found for project:', projectId);
                return;
            }
            if (this.ctx.activeProjectId !== projectId) { aborted = true; return; }
            console.log('[PlatformShell] Loading latest server version:', version.label ?? version.id);
            const record: VersionRecord = {
                id: version.id, projectId,
                label: version.label ?? 'Restored',
                snapshot: version.snapshot,
                elementCount: version.element_count ?? 0,
                timestamp: new Date(version.created_at).getTime(),
                syncStatus: 'synced',
            };
            versionRepository.saveVersionWithMeta(projectId, record, {
                id: projectId,
                name: version.snapshot?.projectName ?? this.ctx.projectName,
                updatedAt: record.timestamp,
                versionCount: 1,
            });
            loaded = true;
            this.versionCtrl.loadVersion(record);
        } catch (err) {
            console.warn('[PlatformShell] Server version load failed:', err);
        } finally {
            // GAP-3 fix: fire pryzm-project-loaded(empty:true) so the loading
            // overlay always dismisses even if no server version was found.
            if (!loaded && !aborted) {
                console.log('[PlatformShell] Empty project resolved — firing pryzm-project-loaded(empty:true)');
                window.runtime?.events?.emit('pryzm-project-loaded', { projectId, projectName: this.ctx.projectName, empty: true }); // F.events.9
            }
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    setProjectId(id: string): void { this.ctx.projectId = id; }
    getProjectId(): string { return this.ctx.projectId; }
    getProjectName(): string { return this.ctx.projectName; }

    /** Expose version preview mode control for future toolbar/UI integration. */
    setVersionPreviewMode(isPreview: boolean): void {
        this.saveCtrl.orchestrator.setVersionPreviewMode(isPreview);
    }

    /**
     * Releases all resources: clears the orchestrator and sync queue, removes
     * the keydown listener, removes the toolbar, disconnects the socket, and
     * cleans up the preview banner.
     * Contract §06 §3: each component must implement destroy().
     */
    dispose(): void {
        this.ctx.activeProjectId = null;
        this.saveCtrl.dispose();
        this.browser.dispose();
        this.versionCtrl.dismissPreviewBanner();
        if (this.ctx.socket) {
            this.ctx.socket.disconnect();
            this.ctx.socket = null;
        }
    }

    destroy(): void {
        this.dispose();
    }
}
